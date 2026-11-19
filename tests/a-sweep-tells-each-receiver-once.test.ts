// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { setFixtureOwner } from './agent-owner-fixture.ts'
/**
 * A SWEEP TELLS EACH RECEIVER ABOUT ITS LETTERS FOR RETIRED AGENTS IN ONE MESSAGE, AND A RESTART ROUTES NONE AGAIN.
 *
 * Problem wN3CEhHxRKO3. On 3 October 2026 one sweep routed 476 old letters for retired agents to one coordinator, one
 * delivery row each, and the hand-over of 470 of them ended its waiting loop. The brief of round 34 asks:
 *
 *   · letters for retired agents reach the receiver as ONE message per sweep, saying how many, for whom, and where
 *     to read them, never one message per letter;
 *   · a letter already routed is not routed again after a restart;
 *   · letters with no owner stay addressed and wait when a secretary is named.
 *
 * The world: 500 letters from an agent to five agents that are retired after the letters are written. All five have
 * one reachable owner, so the sweep routes all 500 to that owner. Two more retired agents share a reachable owner and
 * their 40 letters reach that owner in one message. An agent and the person also write letters for agents the person
 * started; those agents have no owner, so their letters wait even when a dead-letter secretary is named.
 *
 * The shared owner in the second group holds a secretary card, but the route follows ownership rather than the card.
 * Every receiver gets at most one message per sweep, whatever their role.
 *
 * A REACHABLE AGENT IS A RUNNING SESSION RECORD SERVING IT PLUS A LIVE CHILD PROCESS REGISTERED AS ITS RESOURCE, as in
 * tests/the-message-centre-handles-the-dead-letters-itself.test.ts. The children are stopped by their process group in
 * afterAll. The three-run proof of each case is in the commit that made the change this file holds.
 */

import { spawn, type ChildProcess } from 'node:child_process'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { moleOffice } from '../src/shared/participants.ts'
import { THE_PERSON } from '../src/shared/person.ts'

let t: TestDb
let app: FastifyInstance
/** The server built again after a restart, or null before the restart case runs. */
let restarted: FastifyInstance | null = null

const WORKSPACE = 'default'
const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': WORKSPACE,
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const asAgent = (id: string): Record<string, string> => ({
  'content-type': 'application/json',
  'x-mole-office-workspace': WORKSPACE,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': id,
})

/** Every real child this file started, stopped by group afterwards. */
const started: ChildProcess[] = []

/** The five retired addressees the 500 letters are for, 100 each. */
const RETIRED = ['old-1', 'old-2', 'old-3', 'old-4', 'old-5'] as const
const LETTERS_EACH = 100
/** Two retired agents a secretary started, 20 letters each. */
const STARTED_BY_A_SECRETARY = ['cfc-1', 'cfc-2'] as const
const LETTERS_FOR_EACH_OF_THOSE = 20

// ============================================================ fixtures

function anAgent(handle: string, role: string): string {
  t.api.createRecord({
    workspaceId: WORKSPACE,
    kind: 'agent',
    title: handle,
    data: { handle, state: 'active', runtime: 'claude-code' },
    actor: t.api.HUMAN,
  })
  t.client.sqlite.prepare('UPDATE agents SET role = ? WHERE id = ?').run(role, idOf(handle))
  return idOf(handle)
}

function idOf(handle: string): string {
  const row = t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(handle) as { id: string } | undefined
  expect(row, `no agent bears the handle ${handle}`).toBeDefined()
  return row!.id
}

const agentRef = (handle: string): { kind: 'agent'; id: string } => ({ kind: 'agent', id: idOf(handle) })

function setStartedBy(handle: string, by: { kind: string; id: string }): void {
  t.client.sqlite.prepare('UPDATE agents SET started_by_kind = ?, started_by_id = ? WHERE id = ?').run(by.kind, by.id, idOf(handle))
  const columns = t.client.sqlite.prepare('PRAGMA table_info(agents)').all() as { name: string }[]
  if (columns.some((one) => one.name === 'owner_id')) setFixtureOwner(t.client.sqlite, by.kind === 'agent' ? by.id : null, idOf(handle), 'id')
}

function retire(handle: string): void {
  t.client.sqlite.prepare("UPDATE agents SET retired = 1, retired_because = 'the piece of work is done' WHERE id = ?").run(idOf(handle))
}

/** A running session record serving the agent, and a live process of this test's own registered against it. */
async function makeReachable(handle: string): Promise<void> {
  const session = t.api.createRecord({
    workspaceId: WORKSPACE,
    kind: 'session',
    title: `a run of ${handle}`,
    data: { state: 'running', runtime: 'claude-code', servingAgent: idOf(handle) },
    actor: t.api.HUMAN,
  }).id
  const child = spawn('sleep', ['300'], { detached: true, stdio: 'ignore' })
  child.unref()
  started.push(child)
  expect(child.pid, 'the child did not start, so nothing below is measuring anything').toBeDefined()
  const { registerResource } = await import('../src/server/lib/resources.ts')
  registerResource({ workspaceId: WORKSPACE, sessionRecordId: session, type: 'process', key: String(child.pid), actor: t.api.HUMAN })
}

function dataOf(id: string): Record<string, unknown> {
  const row = t.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(id) as { data: string }
  return JSON.parse(row.data) as Record<string, unknown>
}

/** How many delivery rows name this agent, on any message. */
function rowsFor(handle: string): number {
  return (t.client.sqlite.prepare("SELECT COUNT(*) AS n FROM message_delivery WHERE recipient_kind = 'agent' AND recipient_id = ?").get(idOf(handle)) as { n: number }).n
}

/** The messages this agent has a delivery row on, newest last. */
function messagesFor(handle: string): string[] {
  return (
    t.client.sqlite
      .prepare("SELECT message_id AS id FROM message_delivery WHERE recipient_kind = 'agent' AND recipient_id = ? ORDER BY at, id")
      .all(idOf(handle)) as { id: string }[]
  ).map((row) => row.id)
}

function recipientsOf(messageId: string): string[] {
  return (t.client.sqlite.prepare('SELECT recipient_id AS id FROM message_delivery WHERE message_id = ? ORDER BY recipient_id').all(messageId) as { id: string }[]).map((row) => row.id)
}

/** Every summary message Mole Office has written, oldest first. */
function theSummaries(): { id: string; data: Record<string, unknown> }[] {
  return (
    t.client.sqlite
      .prepare("SELECT id, data FROM records WHERE kind = 'message' AND json_extract(data, '$.deadLetterSweep.summary') IS NOT NULL ORDER BY created_at, rowid")
      .all() as { id: string; data: string }[]
  ).map((row) => ({ id: row.id, data: JSON.parse(row.data) as Record<string, unknown> }))
}

interface Entry {
  for: { id: string }
  to: { kind: string; id: string } | null
  said?: Record<string, unknown>
  line: string
  inSummary?: string
}

function routedFor(messageId: string, handle: string): Entry[] {
  return ((dataOf(messageId)['routed'] ?? []) as Entry[]).filter((one) => one.for.id === idOf(handle))
}

async function send(headers: Record<string, string>, to: string, body: string): Promise<string> {
  const reply = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers,
    payload: { kind: 'message', title: body.slice(0, 40), data: { to: [{ kind: 'agent', id: to }], body } },
  })
  const said = reply.json() as { record?: { id: string } }
  expect(said.record?.id, `the letter was not stored: ${reply.body.slice(0, 400)}`).toBeTruthy()
  return said.record!.id
}

interface Swept {
  lineId: string | null
  routed: number
  givenToTheSecretary: number
  summaries: { to: { kind: string; id: string }; messageId: string; letters: number }[]
}

async function sweep(): Promise<Swept> {
  const reply = await app.inject({ method: 'POST', url: '/api/dead-letters/sweep', headers: AS_THE_PERSON })
  expect(reply.statusCode, reply.body).toBe(200)
  return reply.json() as Swept
}

// ============================================================ the world

const letters: string[] = []
const toTheChainsSecretary: string[] = []
const toTheSecretary: string[] = []
let fromThePerson = ''

beforeAll(async () => {
  t = await freshDb()
  const built = await apiApp()
  app = built.app
  await app.ready()
  // NO THRESHOLD MOVES ANYTHING HERE: every letter below is for a retired agent, which the three rules handle.
  anAgent('sec-a', 'secretary')
  anAgent('x-sender', 'worker')
  anAgent('w-starter', 'worker')
  anAgent('old-p', 'worker')
  anAgent('old-q', 'worker')
  setStartedBy('old-p', { kind: 'person', id: THE_PERSON })
  setStartedBy('old-q', { kind: 'person', id: THE_PERSON })
  for (const handle of RETIRED) {
    anAgent(handle, 'worker')
    setStartedBy(handle, agentRef('w-starter'))
    await makeReachable(handle)
  }
  anAgent('sec-quill', 'secretary')
  for (const handle of STARTED_BY_A_SECRETARY) {
    anAgent(handle, 'worker')
    setStartedBy(handle, agentRef('sec-quill'))
    await makeReachable(handle)
  }
  await makeReachable('old-p')
  await makeReachable('old-q')
  // THE LETTERS ARE WRITTEN WHILE THEIR ADDRESSEES CAN BE REACHED, so the send door routes nothing and the sweep is
  // the first to look. Then the addressees are retired.
  for (const handle of RETIRED) {
    for (let n = 1; n <= LETTERS_EACH; n++) letters.push(await send(asAgent('x-sender'), idOf(handle), `Letter ${String(n)} for ${handle}`))
  }
  for (const handle of STARTED_BY_A_SECRETARY) {
    for (let n = 1; n <= LETTERS_FOR_EACH_OF_THOSE; n++) toTheChainsSecretary.push(await send(asAgent('x-sender'), idOf(handle), `Letter ${String(n)} for ${handle}`))
  }
  for (let n = 1; n <= 3; n++) toTheSecretary.push(await send(asAgent('x-sender'), idOf('old-p'), `Letter ${String(n)} for old-p`))
  fromThePerson = await send(AS_THE_PERSON, idOf('old-q'), 'A letter from the person for old-q')
  for (const handle of [...RETIRED, ...STARTED_BY_A_SECRETARY, 'old-p', 'old-q']) retire(handle)
  await makeReachable('w-starter')
  await makeReachable('sec-quill')
  expect(letters).toHaveLength(RETIRED.length * LETTERS_EACH)
  expect(letters.every((id) => dataOf(id)['routed'] === undefined)).toBe(true)
}, 600_000)

afterAll(async () => {
  for (const child of started) {
    try {
      if (child.pid !== undefined) process.kill(-child.pid, 'SIGKILL')
    } catch {
      // Already gone, which is not a failure of anything this file is testing.
    }
  }
  await restarted?.close()
  await app.close()
  t.close()
})

// ============================================================ one sweep

describe('one sweep over 500 old letters for retired agents', () => {
  let swept: Swept
  let rowsBefore = 0
  let secretaryRowsBefore = 0
  let summaryId = ''

  it('gives the receiver exactly ONE new message, and no delivery row for any letter', async () => {
    rowsBefore = rowsFor('w-starter')
    secretaryRowsBefore = rowsFor('sec-quill')
    swept = await sweep()
    expect(rowsFor('w-starter'), 'the receiver got more than one new delivery row').toBe(rowsBefore + 1)
    const toTheStarter = swept.summaries.filter((one) => one.to.id === idOf('w-starter'))
    expect(toTheStarter).toHaveLength(1)
    summaryId = toTheStarter[0]!.messageId
    expect(toTheStarter[0]!.letters).toBe(500)
    expect(messagesFor('w-starter').at(-1)).toBe(summaryId)
    expect(recipientsOf(summaryId)).toEqual([idOf('w-starter')])
    // EACH LETTER KEEPS ONLY ITS ADDRESSEE'S ROW.
    for (const id of letters) {
      expect(recipientsOf(id)).toHaveLength(1)
      expect(dataOf(id)['sentBy']).toEqual(agentRef('x-sender'))
      expect((dataOf(id)['to'] as { id: string }[]).map((one) => one.id)).toContain(recipientsOf(id)[0])
    }
    expect(swept.routed).toBe(500 + STARTED_BY_A_SECRETARY.length * LETTERS_FOR_EACH_OF_THOSE)
  }, 300_000)

  it('a secretary up the chain, with no dead-letter secretary named, also gets exactly ONE message', () => {
    expect(rowsFor('sec-quill'), 'the secretary got more than one new delivery row').toBe(secretaryRowsBefore + 1)
    const toTheSecretary = swept.summaries.filter((one) => one.to.id === idOf('sec-quill'))
    expect(toTheSecretary).toHaveLength(1)
    expect(toTheSecretary[0]!.letters).toBe(40)
    expect(swept.summaries).toHaveLength(2)
    for (const id of toTheChainsSecretary) {
      expect(recipientsOf(id)).toHaveLength(1)
      const handle = STARTED_BY_A_SECRETARY.find((one) => routedFor(id, one).length > 0)!
      const entry = routedFor(id, handle)[0]!
      expect(entry.to).toEqual(agentRef('sec-quill'))
      expect(entry.inSummary).toBe(toTheSecretary[0]!.messageId)
    }
  })

  it('the message says how many, for whom, and where to read them', () => {
    const data = dataOf(summaryId)
    expect(data['sentBy']).toEqual(moleOffice())
    expect(data['body']).toBe('Letters for retired agents')
    const summary = (data['deadLetterSweep'] as { summary: { letters: number; addressees: { name: string; id: string; count: number }[] } }).summary
    expect(summary.letters).toBe(500)
    expect(summary.addressees.map((one) => [one.name, one.id, one.count])).toEqual(RETIRED.map((handle) => [handle, idOf(handle), LETTERS_EACH]))
    const said = String(data['saidInFull'])
    expect(said).toContain('it routed 500 letters for retired agents to you: old-1 (100), old-2 (100), old-3 (100), old-4 (100), old-5 (100).')
    expect(said).toContain('Mole Office did not send you each letter on its own.')
    expect(said).toContain('open the Messages page, open "Choose what to show", and choose the addressee under "reached"')
    expect(said).toContain(`GET /api/messages?contact=agent:<id>&full=1. The ids are: old-1 = ${idOf('old-1')}`)
  })

  it('each letter stores its routed entry, with the message that told the receiver about it', () => {
    for (const id of letters) {
      const addressee = RETIRED.find((handle) => routedFor(id, handle).length > 0)
      expect(addressee, `letter ${id} carries no routed entry`).toBeDefined()
      const entries = routedFor(id, addressee!)
      expect(entries).toHaveLength(1)
      expect(entries[0]!.to).toEqual(agentRef('w-starter'))
      expect(entries[0]!.inSummary).toBe(summaryId)
      expect(typeof entries[0]!.said?.['sweptAt']).toBe('string')
    }
    expect(routedFor(letters[0]!, 'old-1')[0]!.line).toContain('It told w-starter about it in one message that lists every letter it routed to w-starter at that time.')
  })

  it('the receiver may read a letter it was told about, though it has no delivery row on it', async () => {
    for (const index of RETIRED.map((_, i) => i * LETTERS_EACH)) {
      const id = letters[index]!
      const reply = await app.inject({ method: 'GET', url: `/api/messages/${id}`, headers: asAgent('w-starter') })
      expect(reply.statusCode).toBe(200)
      expect(reply.json()).toMatchObject({ message: { sentBy: agentRef('x-sender') } })
    }
    const secretaryReply = await app.inject({ method: 'GET', url: `/api/messages/${toTheChainsSecretary[0]!}`, headers: asAgent('sec-quill') })
    expect(secretaryReply.statusCode).toBe(200)
  })

  it('the sweep\'s one line says each receiver was sent one message', async () => {
    const { sayInEnglish } = await import('../src/shared/i18n.ts')
    const line = (
      t.client.sqlite
        .prepare("SELECT data FROM records WHERE kind = 'message' AND json_extract(data, '$.deadLetterSweep.said') IS NOT NULL ORDER BY created_at DESC, rowid DESC LIMIT 1")
        .get() as { data: string }
    ).data
    const said = String((JSON.parse(line) as Record<string, unknown>)['saidInFull'])
    const list = swept.summaries.map((one) => `${one.to.id === idOf('w-starter') ? 'w-starter' : 'sec-quill'} (${String(one.letters)})`).join(', ')
    expect(said).toContain(sayInEnglish('deadLetterSweep.summarisedAnySender', { n: 540, list }))
    expect(said).toContain('w-starter (500)')
    expect(said).toContain('sec-quill (40)')
  })

  // ============================================================ a restart

  it('after a restart, a sweep is due and routes none of them again', async () => {
    const summaries = theSummaries().length
    const rows = rowsFor('w-starter')
    // A RESTART FORGETS EVERYTHING THE PROCESS HELD: every module is loaded again and the server is built again, as a
    // start builds it, so `lastSweptAt` is null and nothing is cached. The database is the same file.
    vi.resetModules()
    restarted = (await apiApp()).app
    await restarted.ready()
    const fresh = await import('../src/server/lib/deadletters.ts')
    const done = fresh.sweepIfDue({ type: 'system', id: 'mole-office' })
    expect(done.swept, 'a fresh process found no sweep due').toBe(true)
    if (done.swept) {
      expect(done.result.summaries).toEqual([])
      expect(done.result.routed).toBe(0)
    }
    expect(theSummaries()).toHaveLength(summaries)
    expect(rowsFor('w-starter')).toBe(rows)
    for (const id of letters.slice(0, 5)) expect((dataOf(id)['routed'] as unknown[]).length).toBe(1)
  }, 300_000)
})

// ============================================================ the secretary

describe('once the person names a secretary', () => {
  it('letters for ownerless retired agents stay addressed and wait after a secretary is named', async () => {
    const named = await app.inject({ method: 'POST', url: '/api/office/dead-letter-secretary', headers: AS_THE_PERSON, payload: { agent: 'sec-a' } })
    expect(named.statusCode, named.body).toBe(200)
    const swept = await sweep()
    expect(swept.summaries.filter((one) => one.to.id === idOf('sec-a'))).toEqual([])
    for (const id of toTheSecretary) {
      expect(routedFor(id, 'old-p')).toEqual([])
      expect(recipientsOf(id)).toEqual([idOf('old-p')])
    }
    expect(routedFor(fromThePerson, 'old-q')).toEqual([])
    expect(recipientsOf(fromThePerson)).toEqual([idOf('old-q')])
    expect(swept.givenToTheSecretary).toBe(0)
  }, 300_000)
})
