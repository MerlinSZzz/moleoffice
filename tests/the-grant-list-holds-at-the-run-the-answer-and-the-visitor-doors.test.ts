// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THIS OFFICE'S LIST OF WHAT THE GRANT CARRIES HOLDS AT THREE PLACES THAT ASK THE CHECK: STARTING A RUN, ANSWERING A
 * REQUEST ADDRESSED TO THE PERSON, AND THE TWO VISITOR DOORS FOR AN AGENT'S KEY. Wave 13s round 67.
 *
 * Each place asks `aRaiseCarriesIt` (src/server/lib/records.ts) after its own ways of letting the act through. That
 * asks `mayPressForThePerson`, which reads this office's row for the door before the card's answer. Each place is
 * driven through its route, with a secretary that holds the person's grant:
 *   - starting a run is POST /api/agent/threads/:id/dispatch, operation `agent.dispatch`, asked in
 *     `proofForStartingANewAgent` (src/server/lib/agents.ts);
 *   - answering a request is POST /api/roles/requests/:id/grant, operation `role.request`, asked in
 *     `answerARoleRequest` (src/server/api/roles.ts) for a request addressed to the person;
 *   - revoking an agent's key and undoing that are POST /api/office/held-keys/:id/revoke and .../revoke/undo,
 *     operations `office.revoke-key` and `office.undo-key-revocation`, asked in `onlyThePersonMay`
 *     (src/server/api/visitors.ts).
 * The card's answer for all four doors is may-press: none is on `elevation.neverPresses` or `askFirst`.
 *
 * AT EACH PLACE IT HOLDS:
 *   - where this office's row says `kept`, the secretary is refused 403 in the check's own words, and nothing is
 *     written: the place's own rows are unchanged, and `changes` and `presses_for_the_person` gain no row;
 *   - where the row says `may-press`, the secretary is let through, and the rows it wrote name the grant;
 *   - a check that comes after the grant still refuses: a run still needs a key whose making was proved, a raised
 *     secretary still gives only the cards its own card may give, and an undo still needs the same revocation.
 *
 * Every agent and record here is made up for the test, in a fresh test database.
 *
 * TWO CASES ARE RED UNTIL THE LIST NAMES TWO MORE DOORS. While `agent.dispatch` and `role.request` are not doors
 * THE_DOORS_THE_LIST_NAMES holds (src/shared/what-the-grant-carries-words.ts), `thisOfficesAnswerAbout` never reads a
 * row for them, and the list's own write door refuses to set one. Where the row says `kept`, the secretary then starts
 * the run (201) and answers the request (200), each under the grant, and the person of the office cannot keep either
 * door.
 *
 * MUTATION, after a control run:
 *   · src/server/lib/agents.ts, `|| aRaiseCarriesIt(actor)` taken out of `proofForStartingANewAgent` → "lets the
 *     secretary start the run" is red: the secretary is refused 403 with the door's own words about a key;
 *   · src/server/lib/agents.ts, `|| !aKeyMadeThisWayIsProved(proof)` taken out of the same function → "still asks for
 *     a key whose making was proved" is red: the run starts with no key;
 *   · src/server/api/roles.ts, `underTheirRaise` set to false → "lets the secretary answer it" and "still gives only
 *     what the secretary's own card may give" are red: the secretary is refused 403, because whoever started the
 *     asker answers it;
 *   · src/server/lib/what-the-grant-carries.ts, `thisOfficesAnswerAbout` answers null for every door → both cases
 *     where this office keeps a visitor door are red: the card's may-press stands, so the key is revoked, and brought
 *     back;
 *   · src/server/lib/keys.ts, the check that the undo names the same revocation taken out → "still needs the same
 *     revocation" is red: the key is brought back;
 *   · src/shared/what-the-grant-carries-words.ts, the entries for `agent.dispatch` and `role.request` taken out → both
 *     cases where this office keeps one of them are red: the run starts and the request is answered.
 * src/server/api/visitors.ts is not edited, even for a mutation. The check is broken where it reads this office's row.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import {
  A_TESTS_REASON_FOR_THE_PERSON,
  apiApp,
  freshDb,
  FOR_THE_PERSON,
  FOR_THE_PERSON_IN_THE_QUERY,
  thePersonsKeyHeader,
  type TestDb,
} from './helpers.ts'

let t: TestDb
let app: Awaited<ReturnType<typeof apiApp>>
/** Loaded after `freshDb()`, so it is the module the running app's check reads. */
let theList: typeof import('../src/server/lib/what-the-grant-carries.ts')
let grant = ''
let theSecretarysKey = ''

const SECRETARY = THE_TEST_OFFICES_SECRETARY.handle

/**
 * Made-up workers the person started. Their handles say what each is for in this file. Each request case has its own
 * asker, so a grant one case lets through does not change what the next case finds.
 */
const ASKS_WHERE_IT_IS_KEPT = 'asks-where-the-answer-is-kept'
const ASKS_WHERE_IT_MAY_BE_PRESSED = 'asks-where-it-may-be-pressed'
const ASKS_FOR_THE_SECRETARY_CARD = 'asks-for-the-secretary-card'
const A_WORKER_WHOSE_KEY_IS_REVOKED = 'a-worker-whose-key-is-revoked'

/** Every door this file gives an answer about, so each case starts from the card's answers. */
const THE_DOORS = ['agent.dispatch', 'role.request', 'office.revoke-key', 'office.undo-key-revocation'] as const
type ADoor = (typeof THE_DOORS)[number]

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/** The secretary by its headers alone. While the key window is open, the office takes them from this machine. */
const AS_THE_SECRETARY = { ...AS_THE_PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': SECRETARY }

/** The secretary with the key the office answered when the person registered it, so its making was proved. */
function asTheSecretaryWithItsKey(): Record<string, string> {
  return { ...AS_THE_SECRETARY, 'x-mole-office-key': theSecretarysKey }
}

function asAWorker(handle: string): Record<string, string> {
  return { ...AS_THE_PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle }
}

async function ask(
  method: 'GET' | 'POST',
  url: string,
  headers: Record<string, string>,
  payload?: Record<string, unknown>,
): Promise<{ status: number; said: string; body: Record<string, any> }> {
  const reply = await app.app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload }) })
  let body: Record<string, any> = {}
  try {
    body = reply.json() as Record<string, any>
  } catch {
    body = {}
  }
  return { status: reply.statusCode, said: String(body['error'] ?? reply.body), body }
}

/** This office's answer about one door, set as the person's, as the list's write door would set it. */
function thisOfficeSays(door: ADoor, answer: 'kept' | 'may-press'): void {
  theList.setThisOfficesAnswer(door, answer, { type: 'human', id: THE_PERSON })
}

/** The stable part of the check's refusal when this office keeps a door, built by `theWordsForAKeptPress`. */
function theWordsForAKeptDoor(operation: string): RegExp {
  const escaped = operation.replace(/\./g, '\\.')
  return new RegExp(
    `^This office's list of what the grant carries, since [^,]+, keeps ${escaped} for the person, so their grant does ` +
      'not press it for them\\. Nothing was done\\. Ask the person to do it\\.$',
  )
}

function count(sql: string, ...params: unknown[]): number {
  return (t.client.sqlite.prepare(sql).get(...params) as { n: number }).n
}

/** The two ledgers every press under the grant writes to, as a mark to compare against. */
function theLedgers(): { lastChange: number; presses: number } {
  return {
    lastChange: count('SELECT COALESCE(MAX(rowid), 0) AS n FROM changes'),
    presses: count('SELECT count(*) AS n FROM presses_for_the_person'),
  }
}

/** The change rows written after a mark, oldest first. */
function theChangeRowsAfter(mark: { lastChange: number }): { record_id: string; elevation: string | null; press_id: string | null }[] {
  return t.client.sqlite
    .prepare('SELECT record_id, elevation, press_id FROM changes WHERE rowid > ? ORDER BY rowid')
    .all(mark.lastChange) as { record_id: string; elevation: string | null; press_id: string | null }[]
}

/** The press rows written after a mark. */
function thePressesAfter(mark: { presses: number }): { id: string; grant_id: string; operation: string; reason: string | null; agent_id: string }[] {
  return (
    t.client.sqlite.prepare('SELECT id, grant_id, operation, reason, agent_id FROM presses_for_the_person ORDER BY rowid').all() as {
      id: string
      grant_id: string
      operation: string
      reason: string | null
      agent_id: string
    }[]
  ).slice(mark.presses)
}

/** Nothing was written to either ledger after the mark. */
function expectTheLedgersUnchanged(mark: { lastChange: number; presses: number }): void {
  expect(theChangeRowsAfter(mark), 'change rows written by a refused press').toEqual([])
  expect(thePressesAfter(mark), 'press rows written by a refused press').toEqual([])
}

/** The press was written down once, under this grant, with its reason, and every change row after the mark names it. */
function expectThePressNamesTheGrant(mark: { lastChange: number; presses: number }, operation: string): void {
  const presses = thePressesAfter(mark)
  expect(presses, 'one press row for one press').toHaveLength(1)
  expect(presses[0]).toMatchObject({ grant_id: grant, operation, reason: A_TESTS_REASON_FOR_THE_PERSON })
  const rows = theChangeRowsAfter(mark)
  expect(rows.length, 'the press wrote at least one change row').toBeGreaterThan(0)
  for (const row of rows) {
    expect(row.elevation, `the change row on ${row.record_id} names the grant`).toContain(grant)
    expect(row.press_id, `the change row on ${row.record_id} names the press`).toBe(presses[0]!.id)
  }
}

beforeAll(async () => {
  t = await freshDb()
  theList = await import('../src/server/lib/what-the-grant-carries.ts')
  app = await apiApp()
  await app.app.ready()
  const withTheirKey = { ...AS_THE_PERSON, ...thePersonsKeyHeader() }
  // REGISTERED WITH THE PERSON'S KEY, so the key the office answers the secretary was made on a proved press.
  const started = await ask('POST', '/api/agents/started', withTheirKey, { handle: SECRETARY, name: THE_TEST_OFFICES_SECRETARY.name, role: 'secretary' })
  expect(started.status, started.said).toBe(201)
  theSecretarysKey = String(started.body['whatToGiveIt']?.key ?? '')
  expect(theSecretarysKey, 'the office answered the secretary a key').not.toBe('')
  for (const handle of [ASKS_WHERE_IT_IS_KEPT, ASKS_WHERE_IT_MAY_BE_PRESSED, ASKS_FOR_THE_SECRETARY_CARD, A_WORKER_WHOSE_KEY_IS_REVOKED]) {
    const worker = await ask('POST', '/api/agents/started', withTheirKey, { handle, name: handle, role: 'worker', workArea: ['work'] })
    expect(worker.status, worker.said).toBe(201)
  }
  const pressed = await ask('POST', `/api/roles/elevation/${SECRETARY}`, withTheirKey, { reason: 'A test raises it.', endsWhen: 'when you say' })
  expect(pressed.status, pressed.said).toBe(201)
  grant = String(pressed.body['elevation']?.id ?? '')
  expect(grant, 'the grant has an id').not.toBe('')
}, 60_000)

afterEach(() => {
  for (const door of THE_DOORS) theList.setThisOfficesAnswer(door, 'default', { type: 'human', id: THE_PERSON })
})

afterAll(async () => {
  await app?.app.close()
  t?.close()
})

// ============================================================================ starting a run

/** A conversation the person wrote, holding one comment for a new agent, waiting to be sent. */
async function aConversationWaitingToBeSent(title: string): Promise<string> {
  const withTheirKey = { ...AS_THE_PERSON, ...thePersonsKeyHeader() }
  const started = await ask('POST', '/api/agent/threads', withTheirKey, { title, mode: 'review' })
  expect(started.status, started.said).toBe(201)
  const thread = String(started.body['thread']?.id ?? '')
  const comment = await ask('POST', `/api/agent/threads/${thread}/messages`, withTheirKey, {
    intent: 'change',
    body: 'Say what you changed.',
    recipient: { kind: 'new' },
  })
  expect(comment.status, comment.said).toBe(201)
  return thread
}

/** What a dispatch writes: runs, agents, keys, records, and the state of the conversation and its comments. */
function whatADispatchWrites(thread: string): Record<string, unknown> {
  return {
    runs: count('SELECT count(*) AS n FROM agent_runs'),
    agents: count('SELECT count(*) AS n FROM agents'),
    keys: count('SELECT count(*) AS n FROM held_keys'),
    records: count('SELECT count(*) AS n FROM records'),
    revisions: count('SELECT count(*) AS n FROM revisions'),
    thread: t.client.sqlite.prepare('SELECT state, updated_at FROM agent_threads WHERE id = ?').get(thread),
    comments: t.client.sqlite.prepare('SELECT id, state FROM agent_messages WHERE thread_id = ? ORDER BY rowid').all(thread),
  }
}

function dispatch(thread: string, headers: Record<string, string>) {
  return ask('POST', `/api/agent/threads/${thread}/dispatch?${FOR_THE_PERSON_IN_THE_QUERY}`, headers)
}

describe('starting a run: POST /api/agent/threads/:id/dispatch, agent.dispatch', () => {
  it("refuses the secretary in the check's own words where this office keeps agent.dispatch, and writes nothing", async () => {
    const thread = await aConversationWaitingToBeSent('A conversation this office keeps the sending of')
    thisOfficeSays('agent.dispatch', 'kept')
    const before = whatADispatchWrites(thread)
    const mark = theLedgers()

    const refused = await dispatch(thread, asTheSecretaryWithItsKey())
    expect(refused.status, refused.said).toBe(403)
    expect(refused.said).toMatch(theWordsForAKeptDoor('agent.dispatch'))

    expect(whatADispatchWrites(thread)).toEqual(before)
    expectTheLedgersUnchanged(mark)
  })

  it('lets the secretary start the run where this office says may-press, and the writes name the grant', async () => {
    const thread = await aConversationWaitingToBeSent('A conversation the secretary sends')
    thisOfficeSays('agent.dispatch', 'may-press')
    const runsBefore = count('SELECT count(*) AS n FROM agent_runs')
    const mark = theLedgers()

    const sent = await dispatch(thread, asTheSecretaryWithItsKey())
    expect(sent.status, sent.said).toBe(201)
    expect(sent.body['runs'], 'one run for the one recipient').toHaveLength(1)
    expect(count('SELECT count(*) AS n FROM agent_runs')).toBe(runsBefore + 1)
    expectThePressNamesTheGrant(mark, 'agent.dispatch')
  })

  it('still asks for a key whose making was proved after the grant carried the press, and writes nothing', async () => {
    const thread = await aConversationWaitingToBeSent('A conversation sent with no key')
    thisOfficeSays('agent.dispatch', 'may-press')
    const before = whatADispatchWrites(thread)
    const mark = theLedgers()

    // THE HEADERS ALONE NAME THE SECRETARY, which holds the grant, so the check says yes; no key was carried.
    const refused = await dispatch(thread, AS_THE_SECRETARY)
    expect(refused.status, refused.said).toBe(403)
    expect(refused.said).toContain('Starting an agent run needs a key that proves you may act for the owner.')

    expect(whatADispatchWrites(thread)).toEqual(before)
    expectTheLedgersUnchanged(mark)
  })
})

// ============================================================================ answering a request

/** A request a worker the person started makes for a card. It is addressed to the person, who started it. */
async function aRequestToThePerson(asker: string, asking: string): Promise<string> {
  const asked = await ask('POST', '/api/roles/requests', asAWorker(asker), { asking, because: 'A test asks for it.' })
  expect(asked.status, asked.said).toBe(201)
  const request = String(asked.body['request'] ?? '')
  expect(t.api.getRecord(request)?.data['answersTo']).toEqual({ kind: 'person', id: THE_PERSON })
  return request
}

/** What an answer writes: the request, its revisions, and the card on the asker's row. */
function whatAnAnswerWrites(request: string, asker: string): Record<string, unknown> {
  return {
    answer: t.api.getRecord(request)?.data['answer'] ?? null,
    revisions: count('SELECT count(*) AS n FROM revisions WHERE record_id = ?', request),
    card: (t.client.sqlite.prepare('SELECT role FROM agents WHERE handle = ?').get(asker) as { role: string | null }).role,
    records: count('SELECT count(*) AS n FROM records'),
  }
}

describe('answering a request addressed to the person: POST /api/roles/requests/:id/grant, role.request', () => {
  it("refuses the secretary in the check's own words where this office keeps role.request, and writes nothing", async () => {
    const request = await aRequestToThePerson(ASKS_WHERE_IT_IS_KEPT, 'supervisor')
    thisOfficeSays('role.request', 'kept')
    const before = whatAnAnswerWrites(request, ASKS_WHERE_IT_IS_KEPT)
    const mark = theLedgers()

    const refused = await ask('POST', `/api/roles/requests/${request}/grant`, AS_THE_SECRETARY, FOR_THE_PERSON)
    expect(refused.status, refused.said).toBe(403)
    expect(refused.said).toMatch(theWordsForAKeptDoor('role.request'))

    expect(whatAnAnswerWrites(request, ASKS_WHERE_IT_IS_KEPT)).toEqual(before)
    expectTheLedgersUnchanged(mark)
  })

  it('lets the secretary answer it where this office says may-press, and the answer names the grant', async () => {
    const request = await aRequestToThePerson(ASKS_WHERE_IT_MAY_BE_PRESSED, 'supervisor')
    thisOfficeSays('role.request', 'may-press')
    const mark = theLedgers()

    const granted = await ask('POST', `/api/roles/requests/${request}/grant`, AS_THE_SECRETARY, FOR_THE_PERSON)
    expect(granted.status, granted.said).toBe(200)
    expect(t.api.getRecord(request)?.data['answer']).toBe('granted')
    expect(whatAnAnswerWrites(request, ASKS_WHERE_IT_MAY_BE_PRESSED)['card']).toBe('supervisor')
    expectThePressNamesTheGrant(mark, 'role.request')
  })

  it("still gives only what the secretary's own card may give after the grant carried the press, and writes nothing", async () => {
    const request = await aRequestToThePerson(ASKS_FOR_THE_SECRETARY_CARD, 'secretary')
    thisOfficeSays('role.request', 'may-press')
    const before = whatAnAnswerWrites(request, ASKS_FOR_THE_SECRETARY_CARD)
    const mark = theLedgers()

    const refused = await ask('POST', `/api/roles/requests/${request}/grant`, AS_THE_SECRETARY, FOR_THE_PERSON)
    expect(refused.status, refused.said).toBe(403)
    expect(refused.said).toContain("Under the person's raise a secretary answers for them, but gives only what its own card may give")

    expect(whatAnAnswerWrites(request, ASKS_FOR_THE_SECRETARY_CARD)).toEqual(before)
    expectTheLedgersUnchanged(mark)
  })
})

// ============================================================================ the visitor doors for an agent's key

/** The one key the worker holds, live or revoked, by its id. */
function theWorkersKey(): string {
  const row = t.client.sqlite
    .prepare(
      "SELECT k.id AS id FROM held_keys k JOIN agents a ON a.id = k.whose_id WHERE k.whose_kind = 'agent' AND a.handle = ? ORDER BY k.rowid",
    )
    .all(A_WORKER_WHOSE_KEY_IS_REVOKED) as { id: string }[]
  expect(row, 'the worker holds one key').toHaveLength(1)
  return row[0]!.id
}

function whenTheKeyWasRevoked(key: string): string | null {
  return (t.client.sqlite.prepare('SELECT revoked_at FROM held_keys WHERE id = ?').get(key) as { revoked_at: string | null }).revoked_at
}

function revoke(key: string) {
  return ask('POST', `/api/office/held-keys/${key}/revoke`, AS_THE_SECRETARY, FOR_THE_PERSON)
}

function undo(key: string, revokedAt: string) {
  return ask('POST', `/api/office/held-keys/${key}/revoke/undo`, AS_THE_SECRETARY, { ...FOR_THE_PERSON, revokedAt })
}

/** The person brings a key back if a case left it revoked, so the next case starts with it live. */
async function theKeyIsLiveAgain(key: string): Promise<void> {
  const revokedAt = whenTheKeyWasRevoked(key)
  if (revokedAt === null) return
  const back = await ask('POST', `/api/office/held-keys/${key}/revoke/undo`, { ...AS_THE_PERSON, ...thePersonsKeyHeader() }, { revokedAt })
  expect(back.status, back.said).toBe(200)
}

describe("the visitor doors for an agent's key: office.revoke-key and office.undo-key-revocation", () => {
  it("refuse the secretary's revoke in the check's own words where this office keeps office.revoke-key, and write nothing", async () => {
    const key = theWorkersKey()
    await theKeyIsLiveAgain(key)
    thisOfficeSays('office.revoke-key', 'kept')
    const mark = theLedgers()

    const refused = await revoke(key)
    expect(refused.status, refused.said).toBe(403)
    expect(refused.said).toMatch(theWordsForAKeptDoor('office.revoke-key'))

    expect(whenTheKeyWasRevoked(key), 'the key is still live').toBeNull()
    expectTheLedgersUnchanged(mark)
  })

  it("refuse the secretary's undo in the check's own words where this office keeps office.undo-key-revocation, and write nothing", async () => {
    const key = theWorkersKey()
    await theKeyIsLiveAgain(key)
    thisOfficeSays('office.revoke-key', 'may-press')
    thisOfficeSays('office.undo-key-revocation', 'kept')
    const revoked = await revoke(key)
    expect(revoked.status, revoked.said).toBe(200)
    const revokedAt = String(revoked.body['revokedAt'])
    const mark = theLedgers()

    const refused = await undo(key, revokedAt)
    expect(refused.status, refused.said).toBe(403)
    expect(refused.said).toMatch(theWordsForAKeptDoor('office.undo-key-revocation'))

    expect(whenTheKeyWasRevoked(key), 'the key is still revoked').toBe(revokedAt)
    expectTheLedgersUnchanged(mark)
  })

  it('let the secretary revoke and undo where this office says may-press, each naming the grant', async () => {
    const key = theWorkersKey()
    await theKeyIsLiveAgain(key)
    thisOfficeSays('office.revoke-key', 'may-press')
    thisOfficeSays('office.undo-key-revocation', 'may-press')

    const beforeTheRevoke = theLedgers()
    const revoked = await revoke(key)
    expect(revoked.status, revoked.said).toBe(200)
    const revokedAt = String(revoked.body['revokedAt'])
    expect(whenTheKeyWasRevoked(key), 'the key is revoked').toBe(revokedAt)
    expectThePressNamesTheGrant(beforeTheRevoke, 'office.revoke-key')

    const beforeTheUndo = theLedgers()
    const back = await undo(key, revokedAt)
    expect(back.status, back.said).toBe(200)
    expect(whenTheKeyWasRevoked(key), 'the key is live again').toBeNull()
    expectThePressNamesTheGrant(beforeTheUndo, 'office.undo-key-revocation')
  })

  it('still needs the same revocation for an undo after the grant carried the press, and writes nothing', async () => {
    const key = theWorkersKey()
    await theKeyIsLiveAgain(key)
    thisOfficeSays('office.revoke-key', 'may-press')
    thisOfficeSays('office.undo-key-revocation', 'may-press')
    const revoked = await revoke(key)
    expect(revoked.status, revoked.said).toBe(200)
    const revokedAt = String(revoked.body['revokedAt'])
    const mark = theLedgers()

    const refused = await undo(key, '2000-01-01 00:00:00')
    expect(refused.status, refused.said).toBe(409)
    expect(refused.said).toContain('This is not the same revocation. The key was not changed.')

    expect(whenTheKeyWasRevoked(key), 'the key is still revoked').toBe(revokedAt)
    expectTheLedgersUnchanged(mark)
  })
})
