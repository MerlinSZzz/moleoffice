// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A REGISTRATION THAT JOINS A LIVE AGENT'S ROW SAYS WHAT THE ROW HOLDS. Keys wave, round 6.
 *
 * `POST /api/agents/started`, given the handle of a live agent from a second project, joins that
 * agent's row and writes nothing on it: the row keeps its starter, its card, the mark saying who chose
 * the card, and the run recorded as starting it. Until this round the reply said otherwise. It named
 * the caller as the starter, said the rule wrote the worker card, named the caller's run as the run
 * that started it, and a card message about that card went to the agent already at work.
 *
 * Now each part of the reply for a joined row says what the row holds and that this registration did
 * not change it, and no card message is sent. A brand-new agent's reply is what it was.
 *
 * One scratch office on a real loopback listener, with its own person key. The window is closed
 * first, as the person's key closes it, so every caller below holds a key. The existing agent is
 * started by an agent, "boss", with the supervisor card, so its starter and its card both differ
 * from what the caller would have written.
 *
 * MUTATIONS, each after a green control, each red, each restored (src/server/api/participants.ts,
 * route `POST /agents/started`):
 *   1. the starter: answer `startedBy: { kind: starter.kind, id: starter.id }` for a joined row too;
 *   2. the card: answer the new agent's `card` for a joined row too;
 *   3. the card message: write it whether or not the row was joined;
 *   4. the run: answer this request's own run as `whatToGiveIt.startedByRun` for a joined row too.
 */

import { THE_TEST_FIXTURE_ROOT } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { randomBytes } from 'node:crypto'
import { dirname, join } from 'node:path'
import { writeFileSync } from 'node:fs'
import type { FastifyInstance } from 'fastify'
import type { AddressInfo } from 'node:net'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

let t: TestDb
let app: FastifyInstance
let here = ''

const PERSON_KEY = randomBytes(32).toString('hex')
const OFFICE_KEY = randomBytes(32).toString('hex')
const DIR = `${THE_TEST_FIXTURE_ROOT}/test_claude/panelx`
const SECOND = 'second-project'
/** A third project, because a handle joins a row once per project: the second ask in one project is refused. */
const THIRD = 'third-project'

/** A reply shown in a failure message with every key in it replaced, so no log ever carries a key. */
const hidden = (text: string): string => text.replace(/[0-9a-f]{64}/g, '<a secret>')

const asAgent = (handle: string, key: string | undefined, workspace = 'default'): Record<string, string> => ({
  'content-type': 'application/json',
  'x-mole-office-workspace': workspace,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
  ...(key === undefined ? {} : { 'x-mole-office-key': key }),
})
const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
  'x-mole-office-key': PERSON_KEY,
}

interface Reply {
  status: number
  json: Record<string, unknown>
  text: string
}

async function call(method: string, url: string, headers: Record<string, string>, body?: unknown): Promise<Reply> {
  const res = await fetch(`${here}${url}`, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
  const text = await res.text()
  let json: Record<string, unknown> = {}
  try {
    json = JSON.parse(text) as Record<string, unknown>
  } catch {
    json = {}
  }
  return { status: res.status, json, text: hidden(text) }
}

/** Every live registry row bearing this handle. */
function liveRowsOf(handle: string): string[] {
  return (t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ? AND retired = 0').all(handle) as { id: string }[]).map((row) => row.id)
}

function idOf(handle: string): string {
  const rows = liveRowsOf(handle)
  expect(rows, `live rows for ${handle}`).toHaveLength(1)
  return rows[0]!
}

/** How many key rows, live or revoked, an agent has ever held. */
function keyRowsOf(handle: string): number {
  return (t.client.sqlite.prepare('SELECT COUNT(*) AS n FROM held_keys WHERE whose_id = ?').get(idOf(handle)) as { n: number }).n
}

const whatToGiveIt = (reply: Reply): { key?: unknown; keySays?: unknown } =>
  (reply.json['whatToGiveIt'] ?? {}) as { key?: unknown; keySays?: unknown }

/** Start an agent in the default project as the person, and hand back its key. */
async function start(handle: string): Promise<string> {
  const made = await call('POST', '/api/agents/started', AS_THE_PERSON, { handle, name: `The agent ${handle}` })
  expect(made.status, made.text).toBe(201)
  const key = String(whatToGiveIt(made).key)
  expect(key).toMatch(/^[0-9a-f]{64}$/)
  return key
}

/** A keyed agent registers this handle from the second project. */
const registerFromTheSecondProject = (caller: string, key: string, handle: string): Promise<Reply> =>
  call('POST', '/api/agents/started', asAgent(caller, key, SECOND), { handle, name: `The agent ${handle}` })

/** How many card messages ("You hold the ... card") were ever addressed to this registry id. */
function cardMessagesTo(id: string): number {
  return (
    t.client.sqlite
      .prepare(
        "SELECT COUNT(*) AS n FROM records WHERE kind = 'message' AND json_extract(data, '$.body') LIKE 'You hold the %' " +
          "AND EXISTS (SELECT 1 FROM json_each(json_extract(data, '$.to')) WHERE json_extract(value, '$.id') = ?)",
      )
      .get(id) as { n: number }
  ).n
}

/** The row as the database holds it. */
function theRow(id: string): { started_by_kind: string | null; started_by_id: string | null; role: string | null; card_chosen_by: string | null; started_by_run: string | null } {
  return t.client.sqlite
    .prepare('SELECT started_by_kind, started_by_id, role, card_chosen_by, started_by_run FROM agents WHERE id = ?')
    .get(id) as { started_by_kind: string | null; started_by_id: string | null; role: string | null; card_chosen_by: string | null; started_by_run: string | null }
}

let strangerKey = ''
let bossKey = ''

beforeAll(async () => {
  t = await freshDb()
  writeFileSync(
    join(dirname(t.file), 'keys.json'),
    `${JSON.stringify({ person: PERSON_KEY, office: OFFICE_KEY, providers: {} }, null, 2)}\n`,
    { mode: 0o600 },
  )
  app = (await apiApp()).app
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  here = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`

  const project = await call('POST', '/api/workspaces', AS_THE_PERSON, { id: SECOND, title: 'Second project' })
  if (project.status !== 201) throw new Error(`making the second project answered ${String(project.status)}: ${project.text}`)
  const third = await call('POST', '/api/workspaces', AS_THE_PERSON, { id: THIRD, title: 'Third project' })
  if (third.status !== 201) throw new Error(`making the third project answered ${String(third.status)}: ${third.text}`)
  strangerKey = await start('stranger')
  // THE BOSS HOLDS THE SUPERVISOR CARD, so it may give the supervisor card to the agent it starts.
  const boss = await call('POST', '/api/agents/started', AS_THE_PERSON, { handle: 'boss', name: 'The boss', role: 'supervisor' })
  if (boss.status !== 201) throw new Error(`starting boss answered ${String(boss.status)}: ${boss.text}`)
  bossKey = String(whatToGiveIt(boss).key)
  const held = await call('POST', '/api/agents/started', asAgent('boss', bossKey), {
    handle: 'held-agent',
    name: 'The held agent',
    role: 'supervisor',
  })
  if (held.status !== 201) throw new Error(`starting held-agent answered ${String(held.status)}: ${held.text}`)
  const closed = await call('POST', '/api/office/key-window/close', AS_THE_PERSON)
  if (closed.status !== 200) throw new Error(`closing the window answered ${String(closed.status)}: ${closed.text}`)
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

describe('a registration from a second project that joins a live agent’s row', () => {
  it('says the starter, the card and the run the row holds, and sends no card message', async () => {
    const heldId = idOf('held-agent')
    const bossId = idOf('boss')
    const rowBefore = theRow(heldId)
    const messagesBefore = cardMessagesTo(heldId)
    expect(messagesBefore, 'held-agent was sent its own card message when it was started').toBe(1)

    const joined = await registerFromTheSecondProject('stranger', strangerKey, 'held-agent')
    expect(joined.status, joined.text).toBe(201)
    expect(joined.json['joinedAnExistingRow']).toBe(true)
    // THE ROW ITSELF IS AS IT WAS.
    expect(theRow(heldId)).toEqual(rowBefore)

    // EACH PART IS ASKED SOFTLY, so a run on the old code names every untrue part, not only the first.
    // 1. THE STARTER IS THE ONE THE ROW HOLDS, not the caller.
    expect.soft(joined.json['startedBy'], `the reply named another starter: ${joined.text}`).toEqual({ kind: 'agent', id: bossId })
    const starterSays = String(joined.json['startedBySays'])
    expect.soft(starterSays).toContain('"held-agent" was already a live agent, so this registration did not change who started it.')
    expect.soft(starterSays).toContain('Its row names the agent "boss" as its starter.')

    // 2. THE CARD IS THE ONE THE ROW HOLDS, chosen by its starter, and the words say it did not change.
    const card = joined.json['card'] as { role?: unknown; chosenBy?: unknown; says?: unknown }
    expect.soft(card.role, `the reply named another card: ${joined.text}`).toBe('supervisor')
    expect.soft(card.chosenBy).toEqual({ how: 'a-starter', who: { kind: 'agent', id: bossId } })
    const cardSays = String(card.says)
    expect.soft(cardSays).toContain('"held-agent" was already a live agent, so this registration did not change its card.')
    expect.soft(cardSays).toContain('Its row holds the supervisor card; chosen by boss, which registered this agent.')
    expect.soft(cardSays).toContain('No card message was sent, because its card did not change.')
    expect.soft(cardSays).not.toContain('the rule wrote')

    // 3. NO CARD MESSAGE went to the agent already at work.
    expect.soft(cardMessagesTo(heldId), 'a card message was sent to the joined row').toBe(messagesBefore)

    // 4. THE RUN IS THE ONE THE ROW RECORDS, which is none here, and the words say so.
    const give = whatToGiveIt(joined) as { startedByRun?: unknown; startedByRunSays?: unknown }
    expect.soft(give.startedByRun).toBeNull()
    expect.soft(String(give.startedByRunSays)).toBe(
      '"held-agent" was already a live agent, so this registration did not change which run started it, and its row records none.',
    )
  })

  it('names the card the caller sent as not written, where it differs from the row’s', async () => {
    const heldId = idOf('held-agent')
    const joined = await call('POST', '/api/agents/started', asAgent('boss', bossKey, THIRD), {
      handle: 'held-agent',
      name: 'The held agent',
      role: 'worker',
    })
    expect(joined.status, joined.text).toBe(201)
    expect(joined.json['joinedAnExistingRow']).toBe(true)
    expect(theRow(heldId).role).toBe('supervisor')
    const card = joined.json['card'] as { role?: unknown; says?: unknown }
    expect(card.role).toBe('supervisor')
    expect(String(card.says)).toContain('The worker card this registration named was not written.')
  })
})

describe('a brand-new agent registered from a second project', () => {
  it('is answered as before: the caller as starter, the rule’s card, one card message, this request’s run', async () => {
    const made = await registerFromTheSecondProject('stranger', strangerKey, 'fresh-one')
    expect(made.status, made.text).toBe(201)
    expect(made.json['joinedAnExistingRow']).toBe(false)
    const freshId = idOf('fresh-one')
    expect(made.json['startedBy']).toEqual({ kind: 'agent', id: idOf('stranger') })
    expect('startedBySays' in made.json, 'a new agent was given the joined row’s starter sentence').toBe(false)
    expect(made.json['card']).toEqual({
      role: 'worker',
      chosenBy: { how: 'the-rule', who: null },
      says:
        'Nobody named a card, so the rule wrote the worker card and the row says the rule chose it rather than a ' +
        'starter. This agent asks you for a higher one with POST /api/roles/requests, and you answer with one press.',
    })
    expect(cardMessagesTo(freshId), 'the new agent was not sent its card message').toBe(1)
    const give = whatToGiveIt(made) as { startedByRun?: unknown; startedByRunSays?: unknown; key?: unknown }
    expect(give.startedByRun).toBeNull()
    expect(give.startedByRunSays).toBe(
      'This request carried no session, so nothing knows which run started it. Send x-mole-office-session.',
    )
    expect(String(give.key)).toMatch(/^[0-9a-f]{64}$/)
  })
})
