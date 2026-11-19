// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A WRITER CAN ASK WHETHER A WRITE WOULD BE ACCEPTED, AND THE ASKING WRITES NOTHING. Problem jQayki_gIciU.
 *
 * Writers learnt the office's rules by losing writes to them: a block too long, a part heading equal to
 * its block's heading, a short form too long, a count beside "Needs you", a field left out. Two doors
 * now ask first: POST /api/records/check and POST /api/records/:id/short-forms/check. Each runs the
 * write's own code and takes it back (src/server/lib/only-a-check.ts). This file asks them through the
 * real doors and counts every table of the database around each check.
 *
 * WHAT IS NOT COUNTED, AND WHY. A request is logged whatever it does, by its door and its caller, and
 * a GET adds those rows too: the tables in REQUEST_BOOKKEEPING. The test proves that each of them also
 * moves on a plain GET, so the list cannot hide a table that only a write moves.
 *
 * MUTATION PROOF, one change each, after a green control:
 *
 * (a) In `writeOrCheck`, make the first line `if (only === 'write' || only === 'check')`, so a check
 *     is stored. Every "writes nothing" case goes red.
 * (b) In `announce` in src/server/lib/events.ts, delete the `if (onlyChecking())` line. The message
 *     case goes red on the pages told.
 * (c) In `tellTheWaitersFor` in src/server/lib/waiting-hold.ts, delete the `if (onlyChecking())` line.
 *     The message case goes red on the waiter woken.
 * (d) In src/shared/ops.ts, delete `gatedAs: 'record.short-forms-write'`. The gate case goes red: the
 *     check of an unregistered agent's short forms is answered as a read.
 * (f) In src/server/lib/summary.ts, write the code block's cap back as
 *     `{ error: \`code must be ${MAX_PROSE} characters or fewer\` }`. The code block case goes red.
 * (g) In `writeOrCheck`, delete the line `if (isAPromise(made)) throw new TypeError(A_WRITE_RETURNED_A_PROMISE)`.
 *     The promise case goes red: the check hands the promise back as if the write were accepted.
 * (h) In `operationOf` in src/server/lib/rolegate.ts, return `said` alone, without `theActAGateAsksAbout`.
 *     The role card case goes red on both doors: the check is refused as a check, not as its write.
 * (i) In `resolveSessionRef` in src/server/lib/records.ts, answer a remembered name from the cache when its
 *     row is gone, instead of dropping the entry. The session-name case goes red: the write is told the
 *     name is held by the session the check filed and took back.
 *
 * (j) In `isAPromise`, answer `made instanceof Promise`. The thenable case goes red: a write that hands back an
 *     object with a then, not a Promise, is answered as accepted, and its later work would run after the rollback.
 *     Wave 13s round 24; the promise case above stays green under it, which is why the thenable case is its own.
 *
 * The keyless request after the close is in tests/a-check-after-the-close-is-refused-as-its-write.test.ts,
 * because closing the window there would change every case here.
 */
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import type { AddressInfo } from 'node:net'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { MAX_PROSE } from '../src/shared/prose-cap.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { withTheMailerCardBack } from './the-mailer-card-that-left.ts'

const AGENT = {
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'claude-code',
  'x-mole-office-workspace': 'default',
}

/**
 * Rows a request adds whatever it does, a GET as much as a write: the call log, and the list of callers
 * who claimed a name with no key (a row per new name). Proved below to move on a GET.
 */
const REQUEST_BOOKKEEPING: readonly string[] = ['api_calls', 'header_only_calls']

let t: TestDb
let app: FastifyInstance
let events: typeof import('../src/server/lib/events.ts')
let waiting: typeof import('../src/server/lib/waiting-hold.ts')
/** A report this file writes short forms against. */
let report: string
/** The office's address on a real socket, where a caller is "this machine" and not an in-process one. */
let thisMachine: string

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  thisMachine = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  events = await import('../src/server/lib/events.ts')
  waiting = await import('../src/server/lib/waiting-hold.ts')
  const filed = await app.inject({ method: 'POST', url: '/api/records', headers: AGENT, payload: aReport('A report to write short forms for') })
  expect(filed.statusCode, filed.body).toBe(201)
  report = (filed.json() as { record: { id: string } }).record.id
})

afterAll(async () => {
  await app.close()
  t.close()
})

const LONG_ENOUGH =
  'The mount holds calibration through a full transplant. What moved was the mast, by two millimetres at the top, ' +
  'and that is enough to explain every drift the logs show since August. The fix is to stiffen the mast and leave the ' +
  'mount alone; a second transplant on Friday measured no drift at all once the mast was braced at its middle.'

function aReport(title: string, text = LONG_ENOUGH): Record<string, unknown> {
  return {
    kind: 'report',
    title,
    data: { for: THE_TEST_OFFICES_OWNER.name, date: '2026-10-05', blocks: [{ id: 'b-1', type: 'text', heading: 'What I found', text }] },
  }
}

/** The number of rows in every table, but the request log's. */
function everyTablesRows(): Record<string, number> {
  const tables = t.client.sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
    .all() as { name: string }[]
  const counts: Record<string, number> = {}
  for (const { name } of tables) {
    if (REQUEST_BOOKKEEPING.includes(name)) continue
    counts[name] = (t.client.sqlite.prepare(`SELECT count(*) AS n FROM "${name}"`).get() as { n: number }).n
  }
  return counts
}

/**
 * The same request over a real socket. `app.inject` is an in-process caller, which the rule on
 * unregistered agents does not ask about, so the gate case needs this one.
 */
async function sendOverASocket(url: string, payload: unknown, headers: Record<string, string>): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await fetch(`${thisMachine}${url}`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(payload) })
  return { status: res.status, body: (await res.json()) as Record<string, unknown> }
}

async function send(url: string, payload: unknown, headers: Record<string, string> = AGENT): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await app.inject({ method: 'POST', url, headers, payload: payload as Record<string, unknown> })
  return { status: res.statusCode, body: res.json() as Record<string, unknown> }
}

/** Send `payload` to the check door and then to the write door, counting every table around the check. */
async function checkThenWrite(writeUrl: string, payload: unknown): Promise<{ check: Awaited<ReturnType<typeof send>>; write: Awaited<ReturnType<typeof send>> }> {
  const before = everyTablesRows()
  const check = await send(`${writeUrl}/check`, payload)
  expect(everyTablesRows(), `${writeUrl}/check changed a table`).toEqual(before)
  const write = await send(writeUrl, payload)
  return { check, write }
}

/** The pair the short-forms write must name, read off the newest revision. */
async function madeFrom(): Promise<{ seq: number; contentHash: string }> {
  const res = await app.inject({ method: 'GET', url: `/api/records/${report}/revisions`, headers: AGENT })
  expect(res.statusCode, res.body).toBe(200)
  const revisions = (res.json() as { revisions: { seq: number; contentHash: string }[] }).revisions
  const newest = revisions.reduce((a, b) => (b.seq > a.seq ? b : a))
  return { seq: newest.seq, contentHash: newest.contentHash }
}

function shortForms(from: { seq: number; contentHash: string }, part: { heading: string; text30: string }): Record<string, unknown> {
  return {
    madeFrom: from,
    forms: {
      label: 'Mount calibration',
      parts: [{ id: 'p-1', heading: part.heading, text30: part.text30, text120: 'The mount kept its calibration when it was moved; the mast moved instead.', covers: ['b-1'] }],
    },
  }
}

describe('the request log the counts leave out', () => {
  it('moves on a plain GET as well, so leaving it out hides no write', async () => {
    const count = (name: string): number => (t.client.sqlite.prepare(`SELECT count(*) AS n FROM "${name}"`).get() as { n: number }).n
    const before = REQUEST_BOOKKEEPING.map(count)
    await app.inject({ method: 'GET', url: '/api/kinds/report', headers: { ...AGENT, 'x-mole-office-actor-id': 'a-name-only-a-get-used' } })
    const after = REQUEST_BOOKKEEPING.map(count)
    REQUEST_BOOKKEEPING.forEach((name, i) => expect(after[i], `${name} did not move on a GET`).toBeGreaterThan(before[i]!))
  })
})

describe('five bodies the write refuses', () => {
  it('a block too long: the same refusal, and nothing written', async () => {
    const { check, write } = await checkThenWrite('/api/records', aReport('A report with one long block', 'x'.repeat(MAX_PROSE + 3)))
    expect(write.status, JSON.stringify(write.body)).toBe(400)
    expect(check).toEqual(write)
  })

  it('a part heading equal to its block heading: the same refusal, and nothing written', async () => {
    const { check, write } = await checkThenWrite(`/api/records/${report}/short-forms`, shortForms(await madeFrom(), { heading: 'What I found', text30: 'The mount held; the mast moved.' }))
    expect(write.status, JSON.stringify(write.body)).toBe(400)
    expect(check).toEqual(write)
  })

  it('a short form too long: the same refusal, and nothing written', async () => {
    const long = Array.from({ length: 40 }, (_, i) => `word${i}`).join(' ')
    const { check, write } = await checkThenWrite(`/api/records/${report}/short-forms`, shortForms(await madeFrom(), { heading: 'The mount held', text30: long }))
    expect(write.status, JSON.stringify(write.body)).toBe(400)
    expect(check).toEqual(write)
  })

  it('a count beside "Needs you": the same refusal, and nothing written', async () => {
    // A ROUND NUMBER IS NO LONGER REFUSED (tests/a-round-number-is-not-a-count-of-what-waits.test.ts),
    // so the body here carries a real count, which the guard still refuses.
    const { check, write } = await checkThenWrite('/api/records', aReport('A report with a count', '有 5 件事 Needs you。'))
    expect(write.status, JSON.stringify(write.body)).toBe(403)
    expect(check).toEqual(write)
  })

  it('a required field left out: the same refusal, and nothing written', async () => {
    const { title: _left, ...noTitle } = aReport('unused')
    const { check, write } = await checkThenWrite('/api/records', noTitle)
    expect(write.status, JSON.stringify(write.body)).toBe(400)
    expect(check).toEqual(write)
  })
})

describe('a body the write accepts', () => {
  it('a record: answered "would be accepted" with the write\'s status, nothing written, and the write then files it', async () => {
    const { check, write } = await checkThenWrite('/api/records', aReport('A report that is checked first'))
    expect(check.status, JSON.stringify(check.body)).toBe(200)
    expect(check.body).toMatchObject({ wouldBeAccepted: true, wroteNothing: true, wouldAnswerStatus: 201 })
    expect(check.body).not.toHaveProperty('record')
    expect(write.status, JSON.stringify(write.body)).toBe(201)
  })

  it('short forms: answered "would be accepted", nothing written, and the write then stores them', async () => {
    const { check, write } = await checkThenWrite(`/api/records/${report}/short-forms`, shortForms(await madeFrom(), { heading: 'The mount held', text30: 'The mount held; the mast moved.' }))
    expect(check.status, JSON.stringify(check.body)).toBe(200)
    expect(check.body).toMatchObject({ wouldBeAccepted: true, wroteNothing: true, wouldAnswerStatus: 200 })
    expect(write.status, JSON.stringify(write.body)).toBe(200)
  })

  it('a message: no page is told and no waiting agent is woken, though the write does both', async () => {
    const registered = await send('/api/records', { kind: 'agent', title: 'An addressee', data: { handle: 'an-addressee', runtime: 'claude-code', state: 'active' } })
    expect(registered.status, JSON.stringify(registered.body)).toBe(201)
    // THE REGISTRY ID, which a waiter is held under; it is not the agent record's id.
    const listed = (await app.inject({ method: 'GET', url: '/api/participants', headers: AGENT })).json() as { agents?: { id: string; handle: string }[] }
    const addressee = (listed.agents ?? []).find((one) => one.handle === 'an-addressee')
    expect(addressee, 'the addressee is not on the participants list').toBeDefined()
    // EVERY EVENT ANNOUNCED, to any page: the channel's last id moves by one for each.
    const told = (): number => events.channelState().lastId
    const writer = await send('/api/records', { kind: 'agent', title: 'A letter writer', data: { handle: 'a-letter-writer', runtime: 'claude-code', state: 'active' } })
    expect(writer.status, JSON.stringify(writer.body)).toBe(201)
    const asTheWriter = { ...AGENT, 'x-mole-office-actor-id': 'a-letter-writer' }
    const letter = { kind: 'message', title: 'A note', data: { body: 'A note to check first.', to: [{ kind: 'agent', id: 'an-addressee' }] } }

    const waiter = waiting.registerAWaiter(addressee!.id)
    let woken = false
    void waiter.woken.then(() => {
      woken = true
    })
    const toldBefore = told()
    const before = everyTablesRows()
    const check = await send('/api/records/check', letter, asTheWriter)
    expect(check.status, JSON.stringify(check.body)).toBe(200)
    await new Promise((go) => setImmediate(go))
    expect(everyTablesRows()).toEqual(before)
    expect(told(), 'a check of a message told a page').toBe(toldBefore)
    expect(woken, 'a check of a message woke a waiting agent').toBe(false)
    // THE CONTROL: the write itself tells a page and wakes the waiter, so the two lines above can fail.
    const write = await send('/api/records', letter, asTheWriter)
    expect(write.status, JSON.stringify(write.body)).toBe(201)
    await new Promise((go) => setImmediate(go))
    waiter.stop()
    expect(told(), 'the write told no page, so this case proves nothing').toBeGreaterThan(toldBefore)
    expect(woken, 'the write woke no waiter, so this case proves nothing').toBe(true)
  })
})

describe('a check is gated as the write it checks', () => {
  it('an unregistered agent is refused the check of short forms exactly as it is refused the write', async () => {
    const nobody = { ...AGENT, 'x-mole-office-actor-id': 'an-agent-nobody-registered' }
    const body = shortForms(await madeFrom(), { heading: 'The mount held', text30: 'The mount held; the mast moved.' })
    const before = everyTablesRows()
    const check = await sendOverASocket(`/api/records/${report}/short-forms/check`, body, nobody)
    expect(everyTablesRows()).toEqual(before)
    const write = await sendOverASocket(`/api/records/${report}/short-forms`, body, nobody)
    expect(write.status, JSON.stringify(write.body)).toBe(403)
    expect(check).toEqual(write)
  })

  it('an agent whose role card refuses the write is refused the check exactly as the write, at both doors', async () => {
    // THE ONE CARD THAT REFUSES A RECORD'S WRITE was the mailer's, refused everything but its one power. Every card
    // declared today holds "Records", so the test puts the mailer card back for its own server while it runs.
    const roles = await import('../src/server/lib/roles.ts')
    await withTheMailerCardBack(roles.theRoleCards(), async () => {
      const started = await app.inject({
        method: 'POST',
        url: '/api/agents/started',
        headers: { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON },
        payload: { handle: 'a-mailer-that-files', name: 'A mailer that files', role: 'mailer' },
      })
      expect(started.statusCode, started.body).toBe(201)
      const key = String((started.json() as { whatToGiveIt?: { key?: string } }).whatToGiveIt?.key ?? '')
      expect(key, 'the registration answered no key').not.toBe('')
      const theMailer = { ...AGENT, 'x-mole-office-actor-id': 'a-mailer-that-files', 'x-mole-office-key': key }
      for (const [door, body] of [
        ['/api/records', aReport('A report a mailer may not file')],
        [`/api/records/${report}/short-forms`, shortForms(await madeFrom(), { heading: 'The mount held', text30: 'The mount held; the mast moved.' })],
      ] as const) {
        const before = everyTablesRows()
        const check = await sendOverASocket(`${door}/check`, body, theMailer)
        expect(everyTablesRows(), `${door}/check changed a table`).toEqual(before)
        const write = await sendOverASocket(door, body, theMailer)
        expect(write.status, JSON.stringify(write.body)).toBe(403)
        expect.soft(check, `${door}/check`).toEqual(write)
      }
    })
  })
})

describe('a write that returns a promise', () => {
  it('is refused by a check as plainly as by a write, and nothing it did is kept', async () => {
    const { writeOrCheck, A_WRITE_RETURNED_A_PROMISE } = await import('../src/server/lib/only-a-check.ts')
    const { onlyChecking } = await import('../src/server/lib/only-checking.ts')
    t.client.sqlite.exec('CREATE TABLE IF NOT EXISTS a_promise_test (n INTEGER)')
    const rows = (): number => (t.client.sqlite.prepare('SELECT count(*) AS n FROM a_promise_test').get() as { n: number }).n
    const aWriteThatReturnsAPromise = (): Promise<number> => {
      t.client.sqlite.prepare('INSERT INTO a_promise_test (n) VALUES (1)').run()
      return Promise.resolve(1)
    }
    // THE CONTROL: better-sqlite3 refuses it in a write.
    expect(() => writeOrCheck('write', aWriteThatReturnsAPromise)).toThrow(TypeError)
    expect(rows(), 'the write kept a row').toBe(0)
    expect(() => writeOrCheck('check', aWriteThatReturnsAPromise)).toThrow(new TypeError(A_WRITE_RETURNED_A_PROMISE))
    expect(rows(), 'the check kept a row').toBe(0)
    expect(onlyChecking(), 'the check left its flag up').toBe(false)
  })

  it('is refused by a check when it is only a thenable, which an async write may hand back as well (j)', async () => {
    const { writeOrCheck, A_WRITE_RETURNED_A_PROMISE } = await import('../src/server/lib/only-a-check.ts')
    const { onlyChecking } = await import('../src/server/lib/only-checking.ts')
    t.client.sqlite.exec('CREATE TABLE IF NOT EXISTS a_thenable_test (n INTEGER)')
    const rows = (): number => (t.client.sqlite.prepare('SELECT count(*) AS n FROM a_thenable_test').get() as { n: number }).n
    // Not a Promise: an object with a then, the shape await and better-sqlite3 both treat as one.
    const aWriteThatReturnsAThenable = (): PromiseLike<number> => {
      t.client.sqlite.prepare('INSERT INTO a_thenable_test (n) VALUES (1)').run()
      return { then: (done) => Promise.resolve(1).then(done) }
    }
    expect(aWriteThatReturnsAThenable() instanceof Promise, 'the fixture is not a thenable but a Promise').toBe(false)
    t.client.sqlite.exec('DELETE FROM a_thenable_test')
    // THE CONTROL: better-sqlite3 refuses it in a write.
    expect(() => writeOrCheck('write', aWriteThatReturnsAThenable)).toThrow(TypeError)
    expect(rows(), 'the write kept a row').toBe(0)
    expect(() => writeOrCheck('check', aWriteThatReturnsAThenable)).toThrow(new TypeError(A_WRITE_RETURNED_A_PROMISE))
    expect(rows(), 'the check kept a row').toBe(0)
    expect(onlyChecking(), 'the check left its flag up').toBe(false)
  })
})

describe('a code block over the cap', () => {
  it('is refused saying how many characters over, as THE_PROSE_CAP_SENTENCE promises', async () => {
    const payload = aReport('A report with long code')
    ;(payload['data'] as { blocks: unknown[] }).blocks = [{ id: 'b-1', type: 'code', code: 'x'.repeat(MAX_PROSE + 7) }]
    const check = await send('/api/records/check', payload)
    expect(check.status, JSON.stringify(check.body)).toBe(400)
    expect(JSON.stringify(check.body)).toContain(`this one is ${MAX_PROSE + 7}, 7 over`)
  })
})

describe('a session checked under a run name', () => {
  /**
   * THE NAME CACHE KEEPS WHAT THE CHECK BOUND, and it does no harm. Filing a session under a run name
   * binds the name and remembers the binding in `resolvedSessions` (src/server/lib/records.ts). A
   * check takes the row and the binding back, but not the process's memory, so the entry stays and
   * points at a record that never existed. It is never handed out: every hit reads the row again and
   * drops the entry when the row is gone. This case proves that half, because it is the half a
   * writer would feel. Wave 13s, round 20.
   */
  it('leaves the name free, and the write then binds it to the session it files', async () => {
    const runName = `checked-run-${String(Date.now())}`
    const headers = { ...AGENT, 'x-mole-office-session': runName }
    const payload = { kind: 'session', title: `the run called ${runName}`, data: { state: 'running' } }
    const before = everyTablesRows()
    const check = await send('/api/records/check', payload, headers)
    expect(check.status, JSON.stringify(check.body)).toBe(200)
    expect(check.body).toMatchObject({ wouldBeAccepted: true, wroteNothing: true, wouldAnswerStatus: 201 })
    expect(everyTablesRows(), 'the check changed a table').toEqual(before)

    const write = await send('/api/records', payload, headers)
    expect(write.status, JSON.stringify(write.body)).toBe(201)
    const filed = (write.body['record'] as { id: string }).id
    const binding = write.body['sessionBinding'] as { name: string; recordId: string; alreadyBoundTo: string | null } | undefined
    expect(binding, JSON.stringify(write.body)).toBeDefined()
    expect(binding!.alreadyBoundTo, 'the name is said to be held by the session the check took back').toBeNull()
    expect(binding!.name).toBe(runName)
    expect(binding!.recordId).toBe(filed)
  })
})
