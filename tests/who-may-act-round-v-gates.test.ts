// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * TWO WHO-MAY-ACT GATES: WHO CHANGES A ROLE CARD'S WORDS, AND WHO REFUSES A ROLE REQUEST THAT ANOTHER AGENT ANSWERS.
 * Wave 13r round V.
 *
 * THE CARD'S WORDS. At block an agent changes a role card's words only when the change names a decision of the owner's
 * that it rests on, and every change keeps its revision. At off, an agent proved by its own key may also file, change,
 * delete, restore or move a card's words with no warrant. What it wrote names it, and the gate counts it as a request
 * it would have stopped. A caller that no key proves to be a registered agent is still refused, is not counted, and is
 * refused in words of its own. A warrant that is sent at off is checked as at block, and its refusal is never counted.
 * At both positions a card's powers stay in the declaration whatever its words say, a card has one live record of its
 * words, and the checks on a card added on the Roles page hold.
 *
 * THE ROLE REQUEST. At block only the agent a request names as its answerer, the person, and those the person's own
 * signature or raise lets through may answer it. At off, an agent proved by its own key may also refuse a request that
 * another agent answers, and the request names who refused. The asker keeps its card and may ask again. A caller that
 * no key proves is refused in words of its own. A request that waits for the person, a card request or a self-
 * registration, is not in the gate at either position, and neither is a grant or a new-key ask: each is refused as at
 * block and is not counted.
 *
 * AT BLOCK EACH DOOR ANSWERS AS IT DID BEFORE THE ROUND. The person, and the caller a door already let through, go
 * through and are not counted. An agent with its own key that the door does not let through is refused, and the gate
 * counts the stop. The cases that ask only this run green on the code before round V, and they are its control run.
 *
 * No refusal's words are copied here, because another line may reword one while the behaviour stays right. A case
 * tells two refusals apart by asking for both and comparing what the office said. Where the words name the record,
 * both are asked of the same record.
 *
 * MUTATIONS, after a control run. Let a caller with no key through at off, and each door's case for that caller goes
 * red. Give that caller at off the words it gets at block, and each door's case of the words goes red. Leave out the
 * count at off, and each door's first case goes red. Leave out the count at block, and each door's case at block goes
 * red. Let an agent with its own key through at off when its warrant stands on no decision, and the case of the
 * warrant goes red. Count a change made on a warrant, and the case of the good warrant goes red. Gate a request that
 * waits for the person, and the case of a card request to the person goes red. Gate a grant, and the case of the grant
 * goes red. Count the answerer at off, and the case of the answerer goes red. Count both asks of a restore, which its
 * route asks once and the restore asks again, and the case of the five acts goes red at the restore.
 *
 * WHAT IS REAL: a scratch office in process (`freshDb` and `apiApp`), never the live office. Two secretaries, one of
 * them raised, two workers, every agent a secretary starts and every agent that asks to join are made-up agents. The
 * person's message, the decision on it, the added card, the second project, every request and every reason are made
 * up. The cards' words are the ones a fresh office files from the declaration, with a made-up commit.
 */

import type { FastifyInstance } from 'fastify'
import { dirname, join } from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { GATES } from '../src/config/gates.mjs'
import { THE_PERSON } from '../src/shared/person.ts'
import { theCardWithoutItsWords, theWordsOf, type RoleCard } from '../src/shared/roles.ts'
import { THE_TEST_FIXTURE_ROOT } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, FOR_THE_PERSON, theAnswerToAWriteInATestOffice, thePersonsKeyHeader, type TestDb, governsTheWholeProject } from './helpers.ts'

const SECRETARY = 'round-v-secretary'
const RAISED = 'round-v-raised-secretary'
const WORKER = 'round-v-worker'
const OTHER = 'round-v-other-worker'
const BECAUSE = 'A made-up reason for this test.'

const WORDS = 'who-changes-a-cards-words'
const REFUSES = 'who-refuses-a-role-request'

/** A MADE-UP commit, forty characters, the shape the start reads from git. */
const A_COMMIT = 'abcdef0123456789abcdef0123456789abcdef01'
/** A MADE-UP second project a move can take a card's words to. */
const ELSEWHERE = 'round-v-elsewhere'
/** The person's words, which a message of theirs holds whole among other lines. */
const THE_PERSONS_WORDS = 'MADE-UP: the supervisor card should say it reads every report before it answers.'
/** A made-up folder an agent says it works in. Nothing is there and nothing reads it. */
const A_FOLDER = `${THE_TEST_FIXTURE_ROOT}/test_claude/round-v`

let t: TestDb
let app: FastifyInstance
let cardWords: typeof import('../src/server/lib/card-words.ts')
const PERSON: Record<string, string> = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const keys = new Map<string, string>()
const ids = new Map<string, string>()
const switched = new Set<string>()
let grantId = ''
let presses = 0
/** The record the last press was made for. */
let latest = ''
/** The worker card's words as the office first filed them, so a case can file them again. */
let theWorkerWordsAtTheStart: { title: string; data: Record<string, unknown> } = { title: '', data: {} }

const as = (handle: string): Record<string, string> => ({
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
  'x-mole-office-key': keys.get(handle) ?? '',
})
const withNoKey = (handle: string): Record<string, string> => {
  const { 'x-mole-office-key': _key, ...rest } = as(handle)
  return rest
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function call(method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', url: string, headers: Record<string, string>, payload?: unknown): Promise<{ status: number; body: any; error: string; raw: string }> {
  const reply = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as object }) })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: any = {}
  try {
    body = reply.json()
  } catch {
    body = {}
  }
  // A reply that carries a key is shown with the key hidden, so no log holds one.
  return { status: reply.statusCode, body, error: typeof body?.error === 'string' ? body.error : '', raw: reply.body.replace(/[0-9a-f]{64}/g, '<a key>') }
}

/** Somebody starts an agent, and the office's answer is kept: its key and its registry id. */
async function start(handle: string, role: 'secretary' | 'worker', by: Record<string, string> = PERSON): Promise<void> {
  const started = await call('POST', '/api/agents/started', by, { handle, name: handle, role })
  expect(started.status, started.raw).toBe(201)
  keys.set(handle, String(started.body.whatToGiveIt?.key ?? ''))
  ids.set(handle, String(started.body.agent?.id ?? ''))
}

/** The person sets a gate's position, or takes their choice back with null; it is taken back after each case. */
async function setTheGate(gate: string, value: 'block' | 'off' | null): Promise<void> {
  const row = GATES.find((one) => one.id === gate)
  expect(row, `the gate list has no row "${gate}"`).toMatchObject({ group: 'who-may-act', whoMayChange: 'the-person' })
  const saved = await call('POST', '/api/office/settings', PERSON, { changes: [{ name: row!.setting, value }], because: 'A made-up reason for a gate' })
  expect(saved.status, saved.raw).toBe(200)
  switched.add(gate)
}

function counted(gate: string): { would_stop: number; stopped: number; reminded: number } {
  const row = t.client.sqlite.prepare('SELECT SUM(would_stop) AS would_stop, SUM(stopped) AS stopped, SUM(reminded) AS reminded FROM gate_counts WHERE gate = ?').get(gate) as Record<string, number | null>
  return { would_stop: row['would_stop'] ?? 0, stopped: row['stopped'] ?? 0, reminded: row['reminded'] ?? 0 }
}

const marker = (table: 'changes' | 'presses_for_the_person'): number =>
  (t.client.sqlite.prepare(`SELECT COALESCE(MAX(rowid), 0) AS n FROM ${table}`).get() as { n: number }).n

/** What one press wrote down as done under the grant: its change rows that name a grant, and its press rows. */
function underTheGrantSince(changes: number, pressed: number): { changes: unknown[]; presses: unknown[] } {
  return {
    changes: t.client.sqlite.prepare('SELECT record_id, actor_id, elevation FROM changes WHERE rowid > ? AND elevation IS NOT NULL').all(changes),
    presses: t.client.sqlite.prepare('SELECT grant_id, operation FROM presses_for_the_person WHERE rowid > ?').all(pressed),
  }
}

/** How many change rows one record has. */
const rowsOn = (id: string): number => (t.client.sqlite.prepare('SELECT COUNT(*) AS n FROM changes WHERE record_id = ?').get(id) as { n: number }).n

/** Start watching the change rows of the last press's record; the function it answers lists whom the rows written since name. */
const changeRowsOnTheLatest = (): (() => string[]) => {
  const on = latest
  const from = marker('changes')
  return () => (t.client.sqlite.prepare('SELECT actor_id FROM changes WHERE record_id = ? AND rowid > ?').all(on, from) as { actor_id: string }[]).map((row) => row.actor_id)
}

/** A record as the scratch database holds it, beside how many change rows it has. */
const theRecord = (id: string): string =>
  JSON.stringify([t.client.sqlite.prepare('SELECT workspace_id, data, deleted_at FROM records WHERE id = ?').get(id) ?? null, rowsOn(id)])

/** Every live words record of every card, and how many change and revision rows the office holds. */
const everyCardsWords = (): string =>
  JSON.stringify([
    t.client.sqlite.prepare("SELECT id, workspace_id, data, deleted_at FROM records WHERE kind = 'role_card_words' ORDER BY id").all(),
    t.client.sqlite.prepare('SELECT COUNT(*) AS n FROM changes').get(),
    t.client.sqlite.prepare('SELECT COUNT(*) AS n FROM revisions').get(),
  ])

/** The newest revision of one record. */
function theNewestRevision(id: string): { seq: number; op: string; actor_id: string; data: Record<string, unknown>; warrant: string | null } {
  const row = t.client.sqlite.prepare('SELECT seq, op, actor_id, data, warrant FROM revisions WHERE record_id = ? ORDER BY seq DESC LIMIT 1').get(id) as { seq: number; op: string; actor_id: string; data: string; warrant: string | null } | undefined
  expect(row, `record ${id} has no revision`).toBeDefined()
  return { ...row!, data: JSON.parse(row!.data) as Record<string, unknown> }
}

/** One press of a door, made fresh so that one case's press does not settle what the next case asks. */
interface APress {
  method: 'POST' | 'PATCH' | 'DELETE'
  url: string
  body: Record<string, unknown>
}

interface ADoor {
  gate: string
  /** The door's operation, as the route names it. */
  door: string
  /** Whether a secretary proved by its own key may press it today. */
  aSecretary: boolean
  /** Whether today an agent with its own key and one with none get the same refusal at block. */
  oneRefusalAtBlock: boolean
  make: () => Promise<APress>
  /** What a refused press must leave as it was. */
  state: () => string
}

/** A row names an agent by the handle the request used or by the registry id the office gave it. */
function namesTheAgent(named: string[], handle: string): void {
  expect(named.length, `nothing the press wrote names ${handle}`).toBeGreaterThan(0)
  for (const one of named) expect([handle, ids.get(handle)], `a row names "${one}"`).toContain(one)
}

async function press(one: APress, headers: Record<string, string>, extra: Record<string, unknown> = {}): Promise<Awaited<ReturnType<typeof call>>> {
  if (one.method === 'DELETE') return call('DELETE', one.url, headers)
  return call(one.method, one.url, headers, { ...one.body, ...extra })
}

function theCases(one: ADoor): void {
  describe(`${one.gate} at ${one.door}`, () => {
    it('at off, an agent proved by its own key that the door does not let through goes through, what it wrote names it, and the gate counts it', async () => {
      await setTheGate(one.gate, 'off')
      const asked = await one.make()
      const before = counted(one.gate)
      const written = changeRowsOnTheLatest()
      const done = await press(asked, as(WORKER))
      expect(done.status, done.raw).toBeLessThan(300)
      namesTheAgent(written(), WORKER)
      expect(counted(one.gate)).toEqual({ ...before, would_stop: before.would_stop + 1 })
    })

    it('at off, the same agent with no key is refused, nothing changes, and the gate does not count it', async () => {
      await setTheGate(one.gate, 'off')
      const asked = await one.make()
      const before = counted(one.gate)
      const state = one.state()
      const refused = await press(asked, withNoKey(WORKER))
      expect(refused.status, refused.raw).toBe(403)
      expect(one.state(), 'a refused press changed something').toBe(state)
      expect(counted(one.gate), 'a caller with no key was counted').toEqual(before)
    })

    it('back at block, the agent with its own key is refused, nothing changes, the gate counts the stop, and the refusal at off was in words of its own', async () => {
      // ONE PRESS, ASKED THREE TIMES. Most refusals name the record they refuse, so two presses on two records would be
      // refused in different words even where the words say the same thing.
      await setTheGate(one.gate, 'off')
      const asked = await one.make()
      const state = one.state()
      const atOff = await press(asked, withNoKey(WORKER))
      expect(atOff.status, atOff.raw).toBe(403)
      await setTheGate(one.gate, 'block')
      const keylessAtBlock = await press(asked, withNoKey(WORKER))
      expect(keylessAtBlock.status, keylessAtBlock.raw).toBe(403)
      const before = counted(one.gate)
      const refused = await press(asked, as(WORKER))
      expect(refused.status, refused.raw).toBe(403)
      expect(one.state(), 'a refused press changed something').toBe(state)
      expect(counted(one.gate)).toEqual({ ...before, would_stop: before.would_stop + 1, stopped: before.stopped + 1 })
      // At off an agent with a key may, so the words that say only certain callers may are not true there.
      expect(atOff.error, 'a caller with no key at off was refused in the words of the block').not.toBe(refused.error)
      expect(atOff.error, 'a caller with no key at off was refused in the words it gets at block').not.toBe(keylessAtBlock.error)
    })

    // The control run: nothing in this case switches the gate, so it reads the door as it stands before round V.
    it('at block, the callers the door let through before still go through uncounted, and an agent with or without its own key is refused', async () => {
      for (const [who, headers, may] of [['the person', PERSON, true], [SECRETARY, as(SECRETARY), one.aSecretary]] as const) {
        const asked = await one.make()
        const state = one.state()
        const before = counted(one.gate)
        const reply = await press(asked, headers)
        if (may) {
          expect(reply.status, `${who}: ${reply.raw}`).toBeLessThan(300)
          expect(counted(one.gate), `${who}: a caller the door lets through was counted`).toEqual(before)
        } else {
          expect(reply.status, `${who}: ${reply.raw}`).toBe(403)
          expect(one.state(), `${who}: a refused press changed something`).toBe(state)
        }
      }
      const asked = await one.make()
      const state = one.state()
      const keyed = await press(asked, as(WORKER))
      const keyless = await press(asked, withNoKey(WORKER))
      expect([keyed.status, keyless.status], keyed.raw).toEqual([403, 403])
      expect(one.state(), 'a refused press changed something').toBe(state)
      if (one.oneRefusalAtBlock) expect(keyed.error, 'the agent with its own key was refused in other words than before').toBe(keyless.error)
    })
  })
}

/** The person, or the agent given, files a record, and its id is answered. */
async function aRecord(headers: Record<string, string>, kind: string, data: Record<string, unknown>, title?: string): Promise<string> {
  const made = await call('POST', '/api/records', headers, { kind, title: title ?? `A made-up ${kind} for round V, ${String(++presses)}`, data })
  expect(made.status, made.raw).toBe(theAnswerToAWriteInATestOffice(headers, { kind, data }))
  return String(made.body.record?.id ?? '')
}

beforeAll(async () => {
  delete process.env.MOLE_OFFICE_WORLD_STARTED_BY
  delete process.env.MOLE_OFFICE_WORLD_SECRETARIES
  t = await freshDb()
  ;(await import('../src/server/lib/worldauthority.ts')).forgetTheWorldsOwnAuthority()
  app = (await apiApp()).app
  await app.ready()
  Object.assign(PERSON, thePersonsKeyHeader(join(dirname(t.file), 'keys.json')))
  // THE APP'S OWN MODULE INSTANCE: `freshDb` resets the module registry, so this is imported after it.
  cardWords = await import('../src/server/lib/card-words.ts')
  ;(await import('../src/server/lib/default-regulations.ts')).copyTheDefaultRegulationsOnce()
  cardWords.fileTheCardWordsOnce({ full: A_COMMIT })
  const worker = t.client.sqlite.prepare('SELECT title, data FROM records WHERE id = ?').get(theWordsRecordOf('worker')) as { title: string; data: string }
  theWorkerWordsAtTheStart = { title: worker.title, data: JSON.parse(worker.data) as Record<string, unknown> }
  const project = await call('POST', '/api/workspaces', PERSON, { id: ELSEWHERE, title: 'A made-up second project' })
  expect(project.status, project.raw).toBe(201)
  for (const [handle, role] of [[SECRETARY, 'secretary'], [RAISED, 'secretary'], [WORKER, 'worker'], [OTHER, 'worker']] as const) {
    await start(handle, role)
  }
  const raised = await call('POST', `/api/roles/elevation/${RAISED}`, PERSON, { reason: 'A made-up raise for this test.' })
  expect(raised.status, raised.raw).toBe(201)
  grantId = String(raised.body.elevation?.id ?? '')
  expect(grantId).not.toBe('')
}, 60_000)

afterEach(async () => {
  for (const gate of switched) await setTheGate(gate, null)
  switched.clear()
})

afterAll(async () => {
  await app?.close()
  t?.close()
})

describe('the two rows', () => {
  it('each is a who-may-act gate only the person moves, at block in both kinds of office, and an agent cannot move it', async () => {
    for (const gate of [WORDS, REFUSES]) {
      const row = GATES.find((one) => one.id === gate)
      expect(row, `the gate list has no row "${gate}"`).toMatchObject({
        class: 'process',
        group: 'who-may-act',
        whoMayChange: 'the-person',
        positions: { allowed: ['block', 'off'] },
        defaults: { buildsMoleOffice: 'block', ordinary: 'block' },
        countedBy: 'the-server',
      })
      const moved = await call('POST', '/api/office/settings', as(SECRETARY), { changes: [{ name: row!.setting, value: 'off' }], because: 'A made-up reason for a gate' })
      expect(moved.status, `an agent moved "${gate}": ${moved.raw}`).toBeGreaterThanOrEqual(400)
    }
    // AND THE GATE STAYED AT BLOCK: an agent with its own key is still refused a change of a card's words.
    await aChangeOfTheWords()
    const refused = await call('PATCH', `/api/records/${latest}`, as(WORKER), { dataPatch: { duties: 'Made-up duties nobody may write.' } })
    expect(refused.status, refused.raw).toBe(403)
  })
})

// ------------------------------------------------------------------ 1. a role card's words

/** The live words record of one card. */
function theWordsRecordOf(role: string): string {
  const id = cardWords.theWordsRecords().get(role)?.id
  expect(id, `the office holds no live words record of the ${role} card`).toBeDefined()
  return id!
}

/**
 * THE WORKER CARD'S LIVE WORDS RECORD IN THIS PROJECT. A case before may have deleted it or moved it to the other
 * project; the person then deletes the moved one and files the words the office first held again.
 */
async function theWorkerWordsHere(): Promise<string> {
  const held = cardWords.theWordsRecords().get('worker')
  if (held !== undefined) {
    const where = (t.client.sqlite.prepare('SELECT workspace_id FROM records WHERE id = ?').get(held.id) as { workspace_id: string }).workspace_id
    if (where === 'default') return held.id
    const gone = await call('DELETE', `/api/records/${held.id}`, { ...PERSON, 'x-mole-office-workspace': where })
    expect(gone.status, gone.raw).toBe(200)
  }
  return aRecord(PERSON, 'role_card_words', theWorkerWordsAtTheStart.data, theWorkerWordsAtTheStart.title)
}

/** A change of the supervisor card's duties, in words no other press used. */
async function aChangeOfTheWords(): Promise<APress> {
  latest = theWordsRecordOf('supervisor')
  return { method: 'PATCH', url: `/api/records/${latest}`, body: { dataPatch: { duties: `Made-up supervisor duties, ${String(++presses)}.` } } }
}

theCases({
  gate: WORDS,
  door: 'a change of a card\'s words',
  // A secretary changes a card's words only on a decision of the owner's, as every agent does.
  aSecretary: false,
  oneRefusalAtBlock: true,
  make: aChangeOfTheWords,
  state: () => theRecord(latest),
})

theCases({
  gate: WORDS,
  door: 'a delete of a card\'s words',
  aSecretary: false,
  oneRefusalAtBlock: true,
  make: async () => {
    latest = await theWorkerWordsHere()
    return { method: 'DELETE', url: `/api/records/${latest}`, body: {} }
  },
  state: () => theRecord(latest),
})

/** A message from the person to an agent, holding their words whole between two other lines. */
const thePersonsMessage = (): Promise<string> =>
  aRecord(PERSON, 'message', { body: `MADE-UP first line.\n\n${THE_PERSONS_WORDS}\n\nMADE-UP last line.`, to: [{ kind: 'agent', id: ids.get(WORKER) }] })

/** The person's words in that message, as a warrant for one record. */
const aWarrant = (message: string, forWhat: string): Record<string, unknown> => ({
  saidBy: THE_PERSON,
  words: THE_PERSONS_WORDS,
  where: `message:${message}`,
  when: '2026-10-14 19:50',
  for: [forWhat],
})

describe(`${WORDS}: a warrant is asked as at block`, () => {
  it('a warrant on a message no decision of the owner\'s rests on is refused at block and at off in the same words, nothing is written, and the gate counts nothing', async () => {
    const message = await thePersonsMessage()
    const asked = await aChangeOfTheWords()
    const refusals: string[] = []
    for (const position of ['block', 'off'] as const) {
      await setTheGate(WORDS, position)
      const before = counted(WORDS)
      const state = everyCardsWords()
      const refused = await press(asked, as(WORKER), { warrant: aWarrant(message, latest) })
      expect(refused.status, refused.raw).toBe(403)
      expect(everyCardsWords(), 'a refused change wrote something').toBe(state)
      expect(counted(WORDS), 'a refusal of a warrant was counted').toEqual(before)
      refusals.push(refused.error)
    }
    expect(refusals[1], 'at off the warrant was refused in other words than at block').toBe(refusals[0])
  })

  it('at off, a warrant a decision of the owner\'s rests on lets the change through as at block, the gate does not count it, and the rows carry the warrant', async () => {
    await setTheGate(WORDS, 'off')
    const message = await thePersonsMessage()
    await aRecord(PERSON, 'decision', {
      ...governsTheWholeProject(), replaces: [],
      decided_by: 'the owner',
      authority: 'the owner said so',
      authority_reference: message,
      option_taken: 'MADE-UP.',
      because: 'MADE-UP.',
    })
    const asked = await aChangeOfTheWords()
    const before = counted(WORDS)
    const from = marker('changes')
    const done = await press(asked, as(WORKER), { warrant: aWarrant(message, latest) })
    expect(done.status, done.raw).toBe(200)
    expect(counted(WORDS), 'a change on a warrant was counted').toEqual(before)
    const rows = t.client.sqlite.prepare('SELECT warrant FROM changes WHERE record_id = ? AND rowid > ?').all(latest, from) as { warrant: string | null }[]
    expect(rows.length, 'the change wrote no change row').toBeGreaterThan(0)
    for (const row of [...rows, theNewestRevision(latest)]) {
      expect(row.warrant, 'a row of the change carries no warrant').not.toBeNull()
      expect((JSON.parse(row.warrant!) as { words: string }).words).toBe(THE_PERSONS_WORDS)
    }
  })
})

describe(`${WORDS}: what holds at both positions`, () => {
  it('at off, the change by an agent with its own key keeps a revision that names it, and the revision before still holds the words it replaced', async () => {
    await setTheGate(WORDS, 'off')
    const asked = await aChangeOfTheWords()
    const before = theNewestRevision(latest)
    const done = await press(asked, as(WORKER))
    expect(done.status, done.raw).toBe(200)
    const after = theNewestRevision(latest)
    expect(after.seq, 'the change kept no revision').toBe(before.seq + 1)
    namesTheAgent([after.actor_id], WORKER)
    expect(after.data['duties']).toBe((asked.body['dataPatch'] as { duties: string }).duties)
    const kept = t.client.sqlite.prepare('SELECT data FROM revisions WHERE record_id = ? AND seq = ?').get(latest, before.seq) as { data: string }
    expect(JSON.parse(kept.data), 'the revision before lost the words it held').toEqual(before.data)
    expect(before.data['duties']).not.toBe(after.data['duties'])
  })

  it('at off, an agent with its own key files, deletes, restores and moves a card\'s words with no warrant, the gate counts each, and each revision names it', async () => {
    await setTheGate(WORDS, 'off')
    // A FILING needs a card with no live words record, so the person deletes the worker card's.
    const held = await theWorkerWordsHere()
    const gone = await call('DELETE', `/api/records/${held}`, PERSON)
    expect(gone.status, gone.raw).toBe(200)
    let before = counted(WORDS)
    const filed = await call('POST', '/api/records', as(WORKER), { kind: 'role_card_words', title: theWorkerWordsAtTheStart.title, data: theWorkerWordsAtTheStart.data })
    expect(filed.status, filed.raw).toBe(201)
    const record = String(filed.body.record?.id ?? '')
    expect(counted(WORDS), 'the filing').toEqual({ ...before, would_stop: before.would_stop + 1 })
    namesTheAgent([theNewestRevision(record).actor_id], WORKER)
    const acts: [string, () => Promise<Awaited<ReturnType<typeof call>>>][] = [
      ['the delete', () => call('DELETE', `/api/records/${record}`, as(WORKER))],
      ['the restore', () => call('POST', `/api/records/${record}/restore`, as(WORKER))],
      ['the move', () => call('POST', `/api/records/${record}/workspace`, as(WORKER), { to: ELSEWHERE })],
    ]
    for (const [act, doIt] of acts) {
      before = counted(WORDS)
      const seq = theNewestRevision(record).seq
      const done = await doIt()
      expect(done.status, `${act}: ${done.raw}`).toBe(200)
      expect(counted(WORDS), act).toEqual({ ...before, would_stop: before.would_stop + 1 })
      const revision = theNewestRevision(record)
      expect(revision.seq, `${act} kept no revision`).toBe(seq + 1)
      namesTheAgent([revision.actor_id], WORKER)
    }
  })

  it('at off, a second live words record of a card is refused to an agent with its own key as it is to the person, and nothing is written', async () => {
    await setTheGate(WORDS, 'off')
    theWordsRecordOf('supervisor')
    const second = { kind: 'role_card_words', title: 'Made-up second words of the supervisor card', data: { roleName: 'supervisor', duties: 'Made-up second duties.' } }
    const state = everyCardsWords()
    const byThePerson = await call('POST', '/api/records', PERSON, second)
    const byTheAgent = await call('POST', '/api/records', as(WORKER), second)
    expect(byThePerson.status, byThePerson.raw).toBeGreaterThanOrEqual(400)
    expect([byTheAgent.status, byTheAgent.error], byTheAgent.raw).toEqual([byThePerson.status, byThePerson.error])
    expect(everyCardsWords(), 'a refused filing wrote something').toBe(state)
  })

  it('at off, a delete of the only words of a card added on the Roles page is refused to an agent with its own key as it is to the person, and nothing is written', async () => {
    const card: RoleCard = {
      name: 'round-v-archivist',
      duties: 'Made-up role: reads the archive.',
      rung: null,
      powers: ['Reading everything'],
      appointedBy: 'the person',
      appoints: 'nobody',
      mustRead: { chapters: [{ chapter: 1, level: 'full' }], andWhatItsStarterNames: null },
      reportsTo: 'The person.',
      whatEndsIt: 'When the archive is read.',
      workArea: { grain: 'folders', most: 'no limit', says: 'Name the archive folders.' },
    } as RoleCard
    const added = await call('POST', '/api/roles/added', PERSON, { version: null, card, because: 'A made-up card for this test' })
    expect(added.status, added.raw).toBe(200)
    await setTheGate(WORDS, 'off')
    const record = theWordsRecordOf(card.name)
    const state = everyCardsWords()
    const byThePerson = await call('DELETE', `/api/records/${record}`, PERSON)
    const byTheAgent = await call('DELETE', `/api/records/${record}`, as(WORKER))
    expect(byThePerson.status, byThePerson.raw).toBe(409)
    expect([byTheAgent.status, byTheAgent.error], byTheAgent.raw).toEqual([byThePerson.status, byThePerson.error])
    expect(everyCardsWords(), 'a refused delete wrote something').toBe(state)
  })

  it('at off, words an agent with its own key writes do not change what a card may do, whatever they say', async () => {
    const theCard = async (): Promise<RoleCard> => {
      const read = await call('GET', '/api/roles', PERSON)
      expect(read.status, read.raw).toBe(200)
      const found = (read.body.cards as RoleCard[]).find((one) => one.name === 'supervisor')
      expect(found, 'the office serves no supervisor card').toBeDefined()
      return found!
    }
    const was = await theCard()
    await setTheGate(WORDS, 'off')
    const asked = await aChangeOfTheWords()
    const duties = (asked.body['dataPatch'] as { duties: string }).duties
    // WORDS THAT CLAIM A POWER, sent once by the person and once by the agent: the two are answered alike.
    const claiming = { dataPatch: { duties, powers: ['Everything'] } }
    const byThePerson = await call('PATCH', asked.url, PERSON, claiming)
    const byTheAgent = await call('PATCH', asked.url, as(WORKER), claiming)
    expect(byTheAgent.status, byTheAgent.raw).toBe(byThePerson.status)
    const done = await press(asked, as(WORKER))
    expect(done.status, done.raw).toBe(200)
    const now = await theCard()
    expect(theWordsOf(now).duties, 'the agent\'s words are not what the card says').toBe(duties)
    expect(theCardWithoutItsWords(now as unknown as Record<string, unknown>), 'what the card may do changed with its words').toEqual(
      theCardWithoutItsWords(was as unknown as Record<string, unknown>),
    )
  })
})

// ------------------------------------------------------------------ 2. refusing a role request

/** A worker a secretary starts, asking for the supervisor card, so the request names the secretary as its answerer. */
async function aRequestToItsStarter(): Promise<APress> {
  const asker = `round-v-asker-${String(++presses)}`
  await start(asker, 'worker', as(SECRETARY))
  const asked = await call('POST', '/api/roles/requests', as(asker), { asking: 'supervisor', because: BECAUSE })
  expect(asked.status, asked.raw).toBe(201)
  expect(asked.body.answersTo, 'the request does not name the secretary as its answerer').toMatchObject({ kind: 'agent', id: ids.get(SECRETARY) })
  latest = String(asked.body.request ?? '')
  return { method: 'POST', url: `/api/roles/requests/${latest}/refuse`, body: {} }
}

/** A worker the person starts, asking for the supervisor card, so the request waits for the person. */
async function aRequestToThePerson(): Promise<string> {
  const asker = `round-v-persons-asker-${String(++presses)}`
  await start(asker, 'worker')
  const asked = await call('POST', '/api/roles/requests', as(asker), { asking: 'supervisor', because: BECAUSE })
  expect(asked.status, asked.raw).toBe(201)
  expect(asked.body.answersTo, 'the request does not wait for the person').toMatchObject({ kind: 'person' })
  return String(asked.body.request ?? '')
}

/** An agent nobody registered asks to join, with no key, so its request waits for the person. */
async function aSelfRegistration(): Promise<string> {
  const handle = `round-v-joiner-${String(++presses)}`
  const asked = await call('POST', '/api/agents/register-myself', withNoKey(handle), { handle, name: handle, workingDirectory: A_FOLDER, requestedRole: 'worker' })
  expect(asked.status, asked.raw).toBe(202)
  return String(asked.body.request ?? '')
}

theCases({
  gate: REFUSES,
  door: 'role.request',
  // The secretary started the asker, so the request names it as its answerer.
  aSecretary: true,
  oneRefusalAtBlock: true,
  make: aRequestToItsStarter,
  state: () => theRecord(latest),
})

describe(`${REFUSES}: what is not in the gate`, () => {
  /** One press asked at block and at off by the callers given; each answer is refused alike at both, and nothing is counted. */
  async function refusedAlikeAtBothPositions(request: string, url: string, callers: Record<string, string>[]): Promise<void> {
    const refusals: string[][] = []
    for (const position of ['block', 'off'] as const) {
      await setTheGate(REFUSES, position)
      const before = counted(REFUSES)
      const state = theRecord(request)
      const said: string[] = []
      for (const headers of callers) {
        const refused = await call('POST', url, headers, {})
        expect(refused.status, `${position}: ${refused.raw}`).toBe(403)
        said.push(refused.error)
      }
      expect(theRecord(request), `${position}: a refused press changed something`).toBe(state)
      expect(counted(REFUSES), `${position}: a press outside the gate was counted`).toEqual(before)
      refusals.push(said)
    }
    expect(refusals[1], 'at off the press was refused in other words than at block').toEqual(refusals[0])
  }

  it('a card request that waits for the person is refused to an agent with or without its own key at block and at off alike, and the gate counts nothing', async () => {
    const request = await aRequestToThePerson()
    await refusedAlikeAtBothPositions(request, `/api/roles/requests/${request}/refuse`, [as(WORKER), withNoKey(WORKER)])
  })

  it('a self-registration that waits for the person is refused to an agent with or without its own key at block and at off alike, and the gate counts nothing', async () => {
    const request = await aSelfRegistration()
    await refusedAlikeAtBothPositions(request, `/api/roles/requests/${request}/refuse`, [as(WORKER), withNoKey(WORKER)])
  })

  it('a grant of a request another agent answers is refused to an agent with its own key at block and at off alike, the asker\'s card is unchanged, and the gate counts nothing', async () => {
    await aRequestToItsStarter()
    const request = latest
    const asker = (t.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(request) as { data: string }).data
    const askerId = (JSON.parse(asker) as { asker: { id: string } }).asker.id
    const card = (): unknown => t.client.sqlite.prepare('SELECT role FROM agents WHERE id = ?').get(askerId)
    const was = card()
    await refusedAlikeAtBothPositions(request, `/api/roles/requests/${request}/grant`, [as(WORKER)])
    expect(card(), 'a refused grant changed the asker\'s card').toEqual(was)
  })

  it('a new-key ask is refused to an agent with its own key at block and at off alike, the gate counts nothing, and its starter still refuses it', async () => {
    const lost = `round-v-lost-${String(++presses)}`
    await start(lost, 'worker', as(SECRETARY))
    const asked = await call('POST', '/api/agents/register-myself', withNoKey(lost), { handle: lost, name: lost, workingDirectory: A_FOLDER, newKey: true })
    expect(asked.status, asked.raw).toBe(202)
    expect(asked.body.answersTo, 'the ask does not name the secretary as its answerer').toMatchObject({ kind: 'agent', id: ids.get(SECRETARY) })
    const request = String(asked.body.request ?? '')
    await refusedAlikeAtBothPositions(request, `/api/roles/requests/${request}/refuse`, [as(WORKER)])
    const byItsStarter = await call('POST', `/api/roles/requests/${request}/refuse`, as(SECRETARY), {})
    expect(byItsStarter.status, byItsStarter.raw).toBeLessThan(300)
  })
})

describe(`${REFUSES}: what an answer at off leaves`, () => {
  it('at off, after an agent with its own key refuses, the request names it, the asker keeps its card, and the asker may ask again', async () => {
    await setTheGate(REFUSES, 'off')
    const asked = await aRequestToItsStarter()
    const request = latest
    const askerId = (JSON.parse((t.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(request) as { data: string }).data) as { asker: { id: string } }).asker.id
    const asker = (t.client.sqlite.prepare('SELECT handle, role FROM agents WHERE id = ?').get(askerId) as { handle: string; role: string | null })
    const done = await press(asked, as(OTHER))
    expect(done.status, done.raw).toBeLessThan(300)
    const revision = theNewestRevision(request)
    expect(revision.data['answer']).toBe('refused')
    namesTheAgent([revision.actor_id], OTHER)
    expect(t.client.sqlite.prepare('SELECT role FROM agents WHERE id = ?').get(askerId), 'the refusal changed the asker\'s card').toEqual({ role: asker.role })
    const again = await call('POST', '/api/roles/requests', as(asker.handle), { asking: 'supervisor', because: BECAUSE })
    expect(again.status, again.raw).toBe(201)
  })

  it('at off, the request\'s answerer and the person refuse as before, and the gate counts neither', async () => {
    await setTheGate(REFUSES, 'off')
    for (const [who, headers] of [[SECRETARY, as(SECRETARY)], ['the person', PERSON]] as const) {
      const asked = await aRequestToItsStarter()
      const before = counted(REFUSES)
      const done = await press(asked, headers)
      expect(done.status, `${who}: ${done.raw}`).toBeLessThan(300)
      expect(counted(REFUSES), `${who} was counted`).toEqual(before)
    }
  })

  it('at off, a raised secretary pressing for the person refuses a request another agent answers as any keyed agent does, nothing is written under the grant, and the gate counts it', async () => {
    await setTheGate(REFUSES, 'off')
    const asked = await aRequestToItsStarter()
    const before = counted(REFUSES)
    const [changes, pressed] = [marker('changes'), marker('presses_for_the_person')]
    const written = changeRowsOnTheLatest()
    const done = await press(asked, as(RAISED), FOR_THE_PERSON)
    expect(done.status, done.raw).toBeLessThan(300)
    expect(underTheGrantSince(changes, pressed), 'a press the gate let through was written down under the grant').toEqual({ changes: [], presses: [] })
    namesTheAgent(written(), RAISED)
    expect(counted(REFUSES)).toEqual({ ...before, would_stop: before.would_stop + 1 })
  })

  for (const position of ['block', 'off'] as const) {
    // At block a control case.
    it(`at ${position}, a raised secretary refuses a card request that waits for the person under the raise, and the gate does not count it`, async () => {
      if (position === 'off') await setTheGate(REFUSES, 'off')
      const request = await aRequestToThePerson()
      const before = counted(REFUSES)
      const changes = marker('changes')
      const done = await call('POST', `/api/roles/requests/${request}/refuse`, as(RAISED), FOR_THE_PERSON)
      expect(done.status, done.raw).toBeLessThan(300)
      const underTheRaise = t.client.sqlite.prepare('SELECT elevation FROM changes WHERE record_id = ? AND rowid > ? AND elevation IS NOT NULL').all(request, changes)
      expect(underTheRaise.length, 'the refusal does not name the raise it was given under').toBeGreaterThan(0)
      expect(counted(REFUSES), 'a refusal under the raise was counted').toEqual(before)
    })
  }
})
