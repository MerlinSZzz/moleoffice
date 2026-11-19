// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A FINISHED RUN'S KEY STILL REPORTS THAT RUN'S OWN END, FOR FIFTEEN MINUTES, AND DOES NOTHING ELSE. The coordinator's
 * agreement, message 0upwNAzS4yqT (7 October 2026), on problem 20JhqbVS3KJ4.
 *
 * A run's key is revoked in the write that records it finished. Supervisors and workers seal their run while their own
 * process still runs, and when the command exits the sandbox helper reads the run's record, stores its usage receipt and
 * may tell its starter how the command ended, all with that run's key. In 134 of 256 run ends in sandboxes from 5 to 7
 * October the office refused them.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS CLAIMED
 * ---------------------------------------------------------------------------------------
 *
 *   1. Within the fifteen minutes, the finished run's key reads its record, stores its usage receipt, and posts a message
 *      about that run, as the helper sends them, with the key window closed as it is in the office.
 *   2. The same three acts about another finished run, with this run's key, are refused.
 *   3. A fourth act within the window is refused: another field of its own record, a message about another run, a message
 *      naming no run, a note, a read of another record, and a list of records.
 *   4. A receipt with anything else in the same patch is refused, and nothing is written.
 *   5. After the fifteen minutes, the same three acts are refused.
 *   6. A run that crashed, rather than finished, gets no window.
 *   7. A key whose row says it was revoked for another reason than its run's finish gets no window.
 *   8. The key sent alone, with no header naming who asks, is held to the same three acts.
 *   9. The message goes to the run's starter alone, addressed by its handle as the helper addresses it. The same message
 *      to another agent, to the person, to the starter and somebody else, or from a run with no starter on record, is
 *      refused, and nothing is written.
 *
 *  10. A run whose record no longer says finished (moved back to running within the window) gets no window: the
 *      guard that the run still says finished has a case of its own.
 *
 * The served-conditions exception keeps its own tests (tests/a-sealed-runs-key-still-writes-its-served.test.ts); case 1
 * here also writes `served` with the same key, so the two exceptions are seen together on one request path.
 *
 * Every request goes over the office's listener, as the helper's does, so the closed window is the one it meets. The runs
 * are filed the way the office's own worker files one, and the office mints their keys; the keys are made up.
 *
 * ---------------------------------------------------------------------------------------
 * MUTATIONS, NAMED, EACH AFTER A CONTROL RUN (the hand-back of the run that added this file)
 * ---------------------------------------------------------------------------------------
 *
 *   - the window check taken out of aFinishedRunsOwnKey (lib/keys.ts): case 5 goes red;
 *   - the own-run check taken out of aFinishedRunsOwnKey: case 2 goes red;
 *   - a fourth door let through (any GET of a record path): case 3 goes red on the read of another record;
 *   - the usageReceipt-only check taken out of aFinishedRunStoresOnlyItsReceipt (lib/records.ts): cases 3 and 4 go red;
 *   - the message's aboutRun check taken out of aFinishedRunPostsOnlyItsEndMessage (lib/records.ts): cases 2 and 3 go red;
 *   - `finished` read as any end (theRunHasEnded) in aFinishedRunsOwnKey: case 6 goes red;
 *   - the revocation reason not asked in aFinishedRunsOwnKey: case 7 goes red;
 *   - `finishedRunsOwnKey` left off the actor on actorFrom's key-alone branch (lib/http.ts): case 8 goes red;
 *   - the recipient check taken out of aFinishedRunPostsOnlyItsEndMessage (lib/records.ts): case 9 goes red;
 *   - the guard that the run still says finished (run.state !== 'finished') taken out of aFinishedRunsOwnKey: case 10
 *     goes red, and only case 10 (added after the inspector's refusal showed no case held it).
 *
 * OLD (wave 13s round 113): the cases ran on the real clock in the machine's zone. Run at 02:07 winter time on 25
 * October 2026, case 5's control wrote the key's end fourteen minutes before, 01:53, a time the clocks show twice that
 * night. The office read it as the summer-time one, an hour and fourteen minutes before, so the read inside the window
 * was refused with 403.
 * NEW: the cases run on a clock in Europe/London that starts at noon summer time on 24 October 2026 and moves on with
 * the real one, so the office's listener and its waits run as they do on any day.
 * WHY: a test that reads the real time passes or fails by the hour it is run at.
 * MUTATION (round 113, after a control run, then restored): aFinishedRunsOwnKey reads the key's end an hour early, as
 * the repeated hour did → cases 1, 5, 8 and 9 go red, case 5 on its control inside the window.
 */

import type { AddressInfo } from 'node:net'
import { randomBytes } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { localStamp } from '../src/shared/time.ts'
import { apiApp, freshDb, one, type TestDb } from './helpers.ts'

// THE CLOCK READS IN EUROPE/LONDON, set before any module reads the zone. The zone before is put back after the file.
const theZoneBefore = vi.hoisted(() => {
  const before = process.env.TZ
  process.env.TZ = 'Europe/London'
  return before
})

/** Noon summer time on 24 October 2026, an ordinary day: the clock starts there and moves on with the real one. */
const AN_ORDINARY_NOON = Date.UTC(2026, 9, 24, 11, 0, 0)

/** Made-up keys, written before the server is built, so the office's own worker proves itself with the office's key. */
const A_MADE_UP_OFFICE_KEY = randomBytes(32).toString('hex')
const A_MADE_UP_PERSON_KEY = randomBytes(32).toString('hex')

const HANDLE = 'a-finishing-round'
const STARTER = 'the-starting-round'
const ANOTHER = 'a-round-that-started-nothing'
const RECEIPT = { runtime: 'claude-code', model: 'a-model-for-this-test', inputTokens: 100, cachedInputTokens: 10, outputTokens: 5, inputIncludesCached: true }
const SERVED = { model: 'a-model-for-this-test', temperature: 0, briefBytes: 420, contextTokens: { largestTurn: 1200, total: 5400 } }

let t: TestDb
let app: FastifyInstance
let api = ''
let agentId = ''
let starterId = ''
/** The session of the run's starter, which each run names as its `parentAttachment`, as register-a-run.mjs writes it. */
let starterSession = ''
let note = ''
/** The window, read from lib/keys.ts once the test database is named (importing it opens the database). */
let WINDOW_MS = 0

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/** The person, proved by the person's key, who may name any session as a run's parent. */
const AS_THE_PROVED_PERSON = { ...AS_THE_PERSON, 'x-mole-office-key': A_MADE_UP_PERSON_KEY }

/** The office's own worker: an agent actor that proved itself with the office's key. */
const AS_THE_OFFICE_WORKER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'mole-office/the-message-worker',
  'x-mole-office-key': A_MADE_UP_OFFICE_KEY,
}

/** As the helper asks about a run: the run's agent, the run as its session, and the run's own key. */
const asTheRun = (session: string, key: string): Record<string, string> => ({
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': HANDLE,
  'x-mole-office-session': session,
  'x-mole-office-key': key,
})

/** The run's key and nothing else that names who asks, which `actorFrom` answers on its own branch. */
const theKeyAlone = (key: string): Record<string, string> => ({
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-key': key,
})

/** Over the listener, as the helper sends it. */
async function send(method: 'GET' | 'POST' | 'PATCH', path: string, headers: Record<string, string>, body?: unknown): Promise<{ status: number; text: string }> {
  const reply = await fetch(`${api}${path}`, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
  return { status: reply.status, text: await reply.text() }
}

/**
 * The helper's message to the run's starter, in the shape theStarterIsTold in tools/sandbox-start.mjs sends it: to the
 * starter's handle, which is what the helper holds. `to` replaces the recipients, for the refused cases.
 *
 * NOTHING HOLDS THE STARTER IN THE TEST OFFICE, so where this message is let through the office stores it, routes it and
 * answers 409. The message is stored all the same, and `messagesAbout` counts it.
 */
const theEndMessage = (aboutRun: string, to: unknown = [{ kind: 'agent', id: STARTER }]): unknown => ({
  kind: 'message',
  title: `Run ${aboutRun}'s command ended`,
  data: { body: `Run ${aboutRun}: its command exited 0.`, to, aboutRun },
})

/** A session filed by the office's own worker, serving `serving`, with the key the office mints it. */
async function fileASession(title: string, serving: string): Promise<{ id: string; key: string }> {
  const filed = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: AS_THE_OFFICE_WORKER,
    payload: { kind: 'session', title, data: { state: 'running', runtime: 'claude-code', startedByMoleOffice: true, servingAgent: serving, doing: title } },
  })
  expect(filed.statusCode, filed.body.slice(0, 300)).toBe(201)
  const body = filed.json() as { record: { id: string }; runKey?: { key?: string } }
  const key = String(body.runKey?.key)
  expect(key, 'the office minted the run no key, so this file would prove nothing').toMatch(/^[0-9a-f]{64}$/)
  return { id: body.record.id, key }
}

/** A run of the finishing agent, started from the starter's session unless `started` is false. */
async function fileARun(title: string, started = true): Promise<{ id: string; key: string }> {
  const run = await fileASession(title, agentId)
  if (started) {
    const named = await app.inject({ method: 'PATCH', url: `/api/records/${run.id}`, headers: AS_THE_PROVED_PERSON, payload: { dataPatch: { parentAttachment: starterSession } } })
    expect(named.statusCode, named.body.slice(0, 300)).toBe(200)
  }
  return run
}

/** The run ends as `state`, by the office's own worker, and its key is revoked in the same write. A finish submits the note. */
async function endTheRun(id: string, state: 'finished' | 'crashed'): Promise<void> {
  const ended = await app.inject({ method: 'PATCH', url: `/api/records/${id}`, headers: AS_THE_OFFICE_WORKER, payload: { dataPatch: state === 'finished' ? { state, submission: { kind: 'records', records: [note] } } : { state } } })
  expect(ended.statusCode, ended.body.slice(0, 300)).toBe(200)
  expect(theRunKeyRow(id).revoked_at, `the run's key was not revoked when it ended as ${state}`).not.toBeNull()
}

function theRunKeyRow(id: string): { id: string; revoked_at: string | null } {
  return t.client.sqlite
    .prepare("SELECT k.id, k.revoked_at FROM held_keys k JOIN records r ON json_extract(r.data, '$.extra.runKeyId') = k.id WHERE r.id = ?")
    .get(id) as { id: string; revoked_at: string | null }
}

/** Moves the recorded revocation back by `ms`, as a clock that has run on would see it. */
function revokedAgo(id: string, ms: number): void {
  t.client.sqlite.prepare('UPDATE held_keys SET revoked_at = ? WHERE id = ?').run(localStamp(new Date(Date.now() - ms)), theRunKeyRow(id).id)
}

function theDataOf(id: string, field: string): unknown {
  const row = t.client.sqlite.prepare(`SELECT json_extract(data, '$.${field}') AS v FROM records WHERE id = ?`).get(id) as { v: string | number | null }
  return typeof row.v === 'string' && /^[[{]/.test(row.v) ? JSON.parse(row.v) : row.v
}

function messagesAbout(run: string): number {
  return (t.client.sqlite.prepare("SELECT COUNT(*) AS n FROM records WHERE kind = 'message' AND json_extract(data, '$.aboutRun') = ?").get(run) as { n: number }).n
}

async function register(handle: string): Promise<string> {
  const registered = await app.inject({ method: 'POST', url: '/api/agents/started', headers: AS_THE_PERSON, payload: { handle, name: handle, role: 'worker', runtime: 'claude-code' } })
  expect(registered.statusCode, registered.body.slice(0, 300)).toBe(201)
  const listed = (await app.inject({ method: 'GET', url: '/api/participants', headers: AS_THE_PERSON })).json() as { agents?: { id: string; handle: string }[] }
  return one((listed.agents ?? []).filter((a) => a.handle === handle), `the registry row for ${handle}`).id
}

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ['Date'], now: AN_ORDINARY_NOON, shouldAdvanceTime: true })
  t = await freshDb()
  WINDOW_MS = (await import('../src/server/lib/keys.ts')).A_FINISHED_RUNS_KEY_REPORTS_ITS_END_FOR_MS
  expect(WINDOW_MS).toBe(15 * 60 * 1000)
  writeFileSync(
    join(dirname(t.file), 'keys.json'),
    `${JSON.stringify({ person: A_MADE_UP_PERSON_KEY, office: A_MADE_UP_OFFICE_KEY, providers: {} }, null, 2)}\n`,
    { mode: 0o600 },
  )
  app = (await apiApp()).app
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  api = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  agentId = await register(HANDLE)
  starterId = await register(STARTER)
  await register(ANOTHER)
  starterSession = (await fileASession('the round that starts the others', starterId)).id
  const filed = await app.inject({ method: 'POST', url: '/api/records', headers: AS_THE_PERSON, payload: { kind: 'note', title: 'Somebody else’s note', data: { body: 'a note' } } })
  expect(filed.statusCode, filed.body.slice(0, 300)).toBe(201)
  note = (filed.json() as { record: { id: string } }).record.id
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
  vi.useRealTimers()
  if (theZoneBefore === undefined) delete process.env.TZ
  else process.env.TZ = theZoneBefore
})

/** Ends the window as the owner's press closed it in the office on 27 September 2026, once, before the first case. */
let windowClosed = false
async function closeTheWindow(): Promise<void> {
  if (windowClosed) return
  t.client.sqlite
    .prepare("UPDATE installation SET window_closed_at = '2026-09-27 11:11:39', window_closed_by_kind = 'person', window_closed_by_id = ? WHERE only_row = 1")
    .run(THE_PERSON)
  ;(await import('../src/server/lib/keywindow.ts')).forgetTheKeyWindowThisProcessRead()
  windowClosed = true
}

describe("a finished run's key, in the fifteen minutes after its finish", () => {
  it('1: reads its record, stores its usage receipt, and posts the message about its end', async () => {
    const { id: run, key } = await fileARun('a round that finishes itself')
    await endTheRun(run, 'finished')
    await closeTheWindow()

    const read = await send('GET', `/api/records/${run}`, asTheRun(run, key))
    expect(read.status, read.text.slice(0, 300)).toBe(200)
    expect((JSON.parse(read.text) as { record: { id: string } }).record.id).toBe(run)

    const stored = await send('PATCH', `/api/records/${run}`, asTheRun(run, key), { dataPatch: { usageReceipt: RECEIPT } })
    expect(stored.status, stored.text.slice(0, 300)).toBe(200)
    expect(theDataOf(run, 'usageReceipt')).toMatchObject({ model: RECEIPT.model, inputTokens: RECEIPT.inputTokens })
    // THE RECEIPT IS THE RUN'S OWN AGENT'S, PROVED BY ITS KEY.
    const wrote = t.client.sqlite
      .prepare("SELECT actor_type, actor_id, proved_by FROM changes WHERE record_id = ? AND field LIKE 'data.usageReceipt%' ORDER BY at, rowid")
      .all(run) as { actor_type: string; actor_id: string; proved_by: string | null }[]
    expect(wrote.at(-1)).toEqual({ actor_type: 'agent', actor_id: HANDLE, proved_by: 'an-agent-key' })

    // THE OFFICE ITSELF WRITES MESSAGES ABOUT A FINISHED RUN, so what is counted is what this request adds.
    const already = messagesAbout(run)
    const told = await send('POST', '/api/records', asTheRun(run, key), theEndMessage(run))
    expect(told.status, told.text.slice(0, 300)).toBe(409)
    expect(messagesAbout(run)).toBe(already + 1)

    // AND THE SERVED-CONDITIONS EXCEPTION, ON THE SAME KEY AND THE SAME PATH, STILL HOLDS BESIDE IT.
    const served = await send('PATCH', `/api/records/${run}`, asTheRun(run, key), { dataPatch: { served: SERVED } })
    expect(served.status, served.text.slice(0, 300)).toBe(200)
    expect(theDataOf(run, 'served')).toEqual(SERVED)
  })

  it("2: does none of the three for another finished run", async () => {
    const { id: run, key } = await fileARun('a round that finishes')
    const { id: another } = await fileARun('another round that finishes')
    await endTheRun(run, 'finished')
    await endTheRun(another, 'finished')
    await closeTheWindow()
    const already = messagesAbout(another)
    for (const [what, method, path, body] of [
      ["a read of the other run's record", 'GET', `/api/records/${another}`, undefined],
      ["the other run's usage receipt", 'PATCH', `/api/records/${another}`, { dataPatch: { usageReceipt: RECEIPT } }],
    ] as const) {
      const refused = await send(method, path, asTheRun(run, key), body)
      expect(refused.status, `${what}: ${refused.text.slice(0, 200)}`).toBe(403)
    }
    // A MESSAGE ABOUT THE OTHER RUN, sent as the other run's session too, so only the key's own run is left to decide it.
    const told = await send('POST', '/api/records', asTheRun(another, key), theEndMessage(another))
    expect(told.status, told.text.slice(0, 200)).toBe(403)
    expect(theDataOf(another, 'usageReceipt')).toBeNull()
    expect(messagesAbout(another)).toBe(already)
  })

  it('3: does nothing else within the window', async () => {
    const { id: run, key } = await fileARun('a round that asks for more')
    const { id: another } = await fileARun('a round still running')
    await endTheRun(run, 'finished')
    await closeTheWindow()
    for (const [what, method, path, body] of [
      ['another field of its own record', 'PATCH', `/api/records/${run}`, { dataPatch: { doing: 'one more thing after the end' } }],
      ['its own state', 'PATCH', `/api/records/${run}`, { dataPatch: { state: 'running' } }],
      ['its title', 'PATCH', `/api/records/${run}`, { title: 'a new title' }],
      ['a message about another run', 'POST', '/api/records', theEndMessage(another)],
      ['a message naming no run', 'POST', '/api/records', { kind: 'message', title: 'Hello', data: { body: 'hello', to: [{ kind: 'agent', id: STARTER }] } }],
      ['a note of its own', 'POST', '/api/records', { kind: 'note', title: 'After the end', data: { body: 'written with a dead key' } }],
      ['a read of another record', 'GET', `/api/records/${note}`, undefined],
      ['a read of a running run', 'GET', `/api/records/${another}`, undefined],
      ['the list of records', 'GET', '/api/records', undefined],
    ] as const) {
      const refused = await send(method, path, asTheRun(run, key), body)
      expect(refused.status, `${what}: ${refused.text.slice(0, 200)}`).toBe(403)
    }
    expect(theDataOf(run, 'doing')).toBe('a round that asks for more')
    expect(theDataOf(run, 'state')).toBe('finished')
    expect(messagesAbout(another)).toBe(0)
  })

  it('4: refuses a receipt with anything else in the same patch, and writes nothing', async () => {
    const { id: run, key } = await fileARun('a round that sends a receipt and more')
    await endTheRun(run, 'finished')
    await closeTheWindow()
    for (const [what, body] of [
      ['a receipt and another key of its data', { dataPatch: { usageReceipt: RECEIPT, doing: 'and this' } }],
      ['a receipt and its served conditions', { dataPatch: { usageReceipt: RECEIPT, served: SERVED } }],
      ['a receipt and a new title', { dataPatch: { usageReceipt: RECEIPT }, title: 'and this' }],
    ] as const) {
      const refused = await send('PATCH', `/api/records/${run}`, asTheRun(run, key), body)
      expect(refused.status, `${what}: ${refused.text.slice(0, 200)}`).toBe(403)
    }
    expect(theDataOf(run, 'usageReceipt')).toBeNull()
    expect(theDataOf(run, 'served')).toBeNull()
    expect(theDataOf(run, 'doing')).toBe('a round that sends a receipt and more')
  })

  it('5: does none of the three once the fifteen minutes are over', async () => {
    const { id: run, key } = await fileARun('a round whose window has passed')
    await endTheRun(run, 'finished')
    await closeTheWindow()
    // ONE MINUTE INSIDE THE WINDOW, THE CONTROL: the read is let through.
    revokedAgo(run, WINDOW_MS - 60_000)
    expect((await send('GET', `/api/records/${run}`, asTheRun(run, key))).status).toBe(200)
    // AND ONE SECOND PAST IT.
    revokedAgo(run, WINDOW_MS + 1_000)
    const already = messagesAbout(run)
    for (const [what, method, path, body] of [
      ['a read of its record', 'GET', `/api/records/${run}`, undefined],
      ['its usage receipt', 'PATCH', `/api/records/${run}`, { dataPatch: { usageReceipt: RECEIPT } }],
      ['the message about its end', 'POST', '/api/records', theEndMessage(run)],
    ] as const) {
      const refused = await send(method, path, asTheRun(run, key), body)
      expect(refused.status, `${what}: ${refused.text.slice(0, 200)}`).toBe(403)
    }
    expect(theDataOf(run, 'usageReceipt')).toBeNull()
    expect(messagesAbout(run)).toBe(already)
  })

  it('6: gives a run that crashed no window', async () => {
    const { id: run, key } = await fileARun('a round that crashed')
    await endTheRun(run, 'crashed')
    await closeTheWindow()
    expect((await send('GET', `/api/records/${run}`, asTheRun(run, key))).status).toBe(403)
    expect((await send('PATCH', `/api/records/${run}`, asTheRun(run, key), { dataPatch: { usageReceipt: RECEIPT } })).status).toBe(403)
    expect((await send('POST', '/api/records', asTheRun(run, key), theEndMessage(run))).status).toBe(403)
  })

  it('7: gives a key revoked for another reason no window', async () => {
    const { id: run, key } = await fileARun('a round whose key the owner took back')
    await endTheRun(run, 'finished')
    await closeTheWindow()
    t.client.sqlite.prepare('UPDATE held_keys SET revoked_because = ? WHERE id = ?').run('The owner revoked it at the Embassy.', theRunKeyRow(run).id)
    expect((await send('GET', `/api/records/${run}`, asTheRun(run, key))).status).toBe(403)
    expect((await send('PATCH', `/api/records/${run}`, asTheRun(run, key), { dataPatch: { usageReceipt: RECEIPT } })).status).toBe(403)
    expect((await send('POST', '/api/records', asTheRun(run, key), theEndMessage(run))).status).toBe(403)
  })

  it('8: holds the key sent alone to the same three acts', async () => {
    const { id: run, key } = await fileARun('a round whose key comes alone')
    await endTheRun(run, 'finished')
    await closeTheWindow()
    expect((await send('GET', `/api/records/${run}`, theKeyAlone(key))).status).toBe(200)
    const stored = await send('PATCH', `/api/records/${run}`, theKeyAlone(key), { dataPatch: { usageReceipt: RECEIPT } })
    expect(stored.status, stored.text.slice(0, 300)).toBe(200)
    const already = messagesAbout(run)
    const told = await send('POST', '/api/records', theKeyAlone(key), theEndMessage(run))
    expect(told.status, told.text.slice(0, 300)).toBe(409)
    expect(messagesAbout(run)).toBe(already + 1)
    for (const [what, method, path, body] of [
      ['another field of its own record', 'PATCH', `/api/records/${run}`, { dataPatch: { doing: 'one more thing after the end' } }],
      ['a note of its own', 'POST', '/api/records', { kind: 'note', title: 'After the end', data: { body: 'written with a dead key' } }],
      ['a message naming no run', 'POST', '/api/records', { kind: 'message', title: 'Hello', data: { body: 'hello', to: [{ kind: 'agent', id: STARTER }] } }],
    ] as const) {
      const refused = await send(method, path, theKeyAlone(key), body)
      expect(refused.status, `${what}: ${refused.text.slice(0, 200)}`).toBe(403)
    }
    expect(theDataOf(run, 'doing')).toBe('a round whose key comes alone')
  })

  it("9: sends the message to the run's starter and to nobody else", async () => {
    const { id: run, key } = await fileARun('a round that tells its starter')
    await endTheRun(run, 'finished')
    await closeTheWindow()
    const already = messagesAbout(run)
    for (const [what, to] of [
      ['another agent', [{ kind: 'agent', id: ANOTHER }]],
      ['the person', [{ kind: 'person', id: THE_PERSON }]],
      ['the starter and another agent', [{ kind: 'agent', id: STARTER }, { kind: 'agent', id: ANOTHER }]],
    ] as const) {
      const refused = await send('POST', '/api/records', asTheRun(run, key), theEndMessage(run, to))
      expect(refused.status, `${what}: ${refused.text.slice(0, 200)}`).toBe(403)
    }
    expect(messagesAbout(run)).toBe(already)
    // THE CONTROL, AFTER THE REFUSALS: the same message to the starter is let through, by its handle and by its id.
    const told = await send('POST', '/api/records', asTheRun(run, key), theEndMessage(run))
    expect(told.status, told.text.slice(0, 300)).toBe(409)
    const byId = await send('POST', '/api/records', theKeyAlone(key), theEndMessage(run, [{ kind: 'agent', id: starterId }]))
    expect(byId.status, byId.text.slice(0, 300)).toBe(409)
    expect(messagesAbout(run)).toBe(already + 2)

    // A RUN WITH NO STARTER ON RECORD HAS NOBODY TO TELL.
    const { id: orphan, key: orphansKey } = await fileARun('a round nobody started', false)
    await endTheRun(orphan, 'finished')
    const before = messagesAbout(orphan)
    const refused = await send('POST', '/api/records', asTheRun(orphan, orphansKey), theEndMessage(orphan))
    expect(refused.status, refused.text.slice(0, 200)).toBe(403)
    expect(messagesAbout(orphan)).toBe(before)
  })

  it('10: gives a finished run that no longer says finished no window', async () => {
    // THE GUARD THAT THE RUN STILL SAYS FINISHED has a case of its own: cases 6 and 7 are decided by the revocation's
    // reason, so without this one the guard could go and nothing would turn red (the inspector's refusal of this run).
    const { id: run, key } = await fileARun('a round that finished and was then marked running again')
    await endTheRun(run, 'finished')
    await closeTheWindow()
    const moved = await app.inject({ method: 'PATCH', url: `/api/records/${run}`, headers: AS_THE_OFFICE_WORKER, payload: { dataPatch: { state: 'running' } } })
    expect(moved.statusCode, moved.body.slice(0, 300)).toBe(200)
    expect(theDataOf(run, 'state')).toBe('running')
    expect(theRunKeyRow(run).revoked_at, 'moving the run back must not give its key back').not.toBeNull()

    const before = messagesAbout(run)
    expect((await send('GET', `/api/records/${run}`, asTheRun(run, key))).status).toBe(403)
    expect((await send('PATCH', `/api/records/${run}`, asTheRun(run, key), { dataPatch: { usageReceipt: RECEIPT } })).status).toBe(403)
    expect((await send('POST', '/api/records', asTheRun(run, key), theEndMessage(run))).status).toBe(403)
    expect(theDataOf(run, 'usageReceipt'), 'a refused receipt was written').toBeNull()
    expect(messagesAbout(run), 'a refused end message was written').toBe(before)
  })
})
