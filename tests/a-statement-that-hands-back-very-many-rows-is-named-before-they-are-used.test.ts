// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A STATEMENT THAT HANDS BACK MORE THAN `A_LARGE_READ_ROWS` ROWS INSIDE A REQUEST IS ONE WARNING LINE, WRITTEN BEFORE THE
 * ROWS ARE USED (src/server/lib/slow-requests.ts).
 *
 * WHY. The request log and the slow-request line are written when a request ends. A request whose rows fill the heap
 * while they are parsed never ends, so neither names it. This line is written when the rows come back from SQLite, before
 * the handler has them.
 *
 * WHAT IS PROVED. Through the server `buildApp` makes, with its log read from the stream it writes to:
 * 1. One `all` over more rows than the limit gives exactly one line, naming the request, the SQL as `theSqlForTheLine`
 *    gives it and the row count, and no value bound to the statement. The line comes before the handler's own line,
 *    written after the read. The stream was synchronous for that line, and was flushed before the handler went on. The
 *    answer still carries its `Server-Timing`.
 * 2. One `iterate` over more rows than the limit gives exactly one line, saying more than the limit. It is written at the
 *    row that passes the limit: after the handler's line at the last row within it, before its line at the next row.
 * 3. A statement inside a part counted apart (`countedApart`) inside a request gives the line too.
 * 4. A request held open on purpose (`config: { waits: true }`) gives its one line too, as the other requests do. It gets
 *    no slow line, whose reason is time, but its rows fill the heap as any other request's do.
 * 5. A request under a private address gives its line with the address `privateRequestLogAddress` writes,
 *    `GET /api/office/mail-tool/state/[private]`, and no large-read line holds what follows `state/`. The mail tool's rule
 *    in src/config/private-sandbox-login.mjs covers the address, and `buildApp` has no route at it: its own door there is
 *    `/api/office/mail-tool/state`, with nothing after it.
 * 6. A request whose statements each hand back at most the limit gives no line, though they add up to more: in this order,
 *    an `iterate` of exactly the limit, an `iterate` stopped at the limit, an `all` of exactly the limit, a `get` over
 *    more rows, and a `run` that changes more.
 * 7. A statement run outside any request gives no line, with no count or with a count of its own as a timer's pass has.
 * 8. A second load of the module, hooked into a second server, writes that server's line to that server's log, though
 *    the statements stay wrapped by the first load.
 * The slow line and the `Server-Timing` header are held by tests/a-slow-request-names-its-slowest-statements.test.ts.
 * A body from `buildApp`'s server is matched, not equalled: it adds `narrowedByPermission` to every object it answers.
 *
 * WHAT THE FLUSH CASE CANNOT SHOW. The stream here is the test's, which pino writes to at once. It shows that the line is
 * written while the stream's `sync` is true and that `flushSync` is called right after it. That this puts the line in the
 * file at once rests on SonicBoom's own `write` and `flushSync`, which this file does not run.
 *
 * AT ed492a844 EVERY TEST FAILS, because slow-requests.ts there exports no `A_LARGE_READ_ROWS`: tests 1 to 5 at their
 * first expect, tests 6 to 8 at their row counts. With the limit alone added, tests 1 to 5 and 8 still fail: no line is
 * written.
 *
 * AT 69cbd4468 TEST 4 FAILS. `sayALargeRead` there returns before it writes when the request is a chosen wait, and
 * `/held-large` is declared `waits: true`, so the line test 4 expects is not written. Test 5 passes there, because that
 * commit already writes the address through `privateRequestLogAddress`; it is there for mutation 11.
 *
 * MUTATIONS it is proved against, each to be red:
 *   1. The line is written in `onResponse`, from what the statements handed back, instead of where the rows come back.
 *      Red in tests 1 and 2: the handler's line comes first.
 *   2. An `all` compares the request's rows with the limit instead of its own. Red in test 6: its `all` of the limit runs
 *      after its two `iterate`s, once the request has read twice the limit.
 *   3. An `iterate` adds the request's rows to its own. Red in test 6: its stopped `iterate` runs after its `iterate` of
 *      the limit, so the sum passes the limit at the stopped one's first row.
 *   4. `iterate` is left out: only `all` is looked at. Red in test 2.
 *   5. The limit is compared with `>=` instead of `>`. Red in tests 2 and 6.
 *   6. An `iterate` writes its line at every row past the limit, not once. Red in test 2.
 *   7. The request is carried on the count instead of in a store of its own, so a part counted apart loses it. Red in
 *      test 3.
 *   8. `writtenAtOnce` hands back `log` as it is, so the stream is neither made synchronous nor flushed. Red in test 1.
 *   9. The log is kept where the first load put it, at module level, instead of in the request's store. Red in test 8.
 *  10. The held-open check is put back in `sayALargeRead`, so a chosen wait writes no line. Red in test 4.
 *  11. The line writes the request's raw url instead of `privateRequestLogAddress(url)`. Red in test 5.
 */
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'

/**
 * Pino writes one JSON object a line; this keeps the `msg` of each, in the order they were written. It has a `sync` and a
 * `flushSync` as SonicBoom has, and keeps what `sync` was at each line and after how many lines each flush came.
 */
class RecordingStream {
  sync = false
  private readonly lines: { line: string; sync: boolean }[] = []
  private waiting = ''
  readonly flushedAfter: number[] = []

  write(text: string): void {
    this.waiting += text
    let end = this.waiting.indexOf('\n')
    while (end !== -1) {
      const line = this.waiting.slice(0, end)
      this.waiting = this.waiting.slice(end + 1)
      if (line.trim() !== '') this.lines.push({ line, sync: this.sync })
      end = this.waiting.indexOf('\n')
    }
  }

  flushSync(): void {
    this.flushedAfter.push(this.lines.length)
  }

  messages(): string[] {
    return this.lines.map(({ line }) => {
      const parsed = JSON.parse(line) as { msg?: unknown }
      return typeof parsed.msg === 'string' ? parsed.msg : ''
    })
  }

  /** Whether the stream was synchronous when the line at `at` was written. */
  wasSyncAt(at: number): boolean | undefined {
    return this.lines[at]?.sync
  }

  /** Start a case with no line left over from the one before it. */
  clear(): void {
    this.lines.length = 0
    this.waiting = ''
    this.flushedAfter.length = 0
  }
}

let t: TestDb
let app: FastifyInstance
let log: RecordingStream
let slow: typeof import('../src/server/lib/slow-requests.ts')
let LIMIT: number

/** A value bound to every statement here, which no line may carry. */
const BOUND = 'a-value-bound-to-the-statement'

/** What follows `state/` in the private address, which no line may carry. */
const PRIVATE_TAIL = 'a-private-tail'

/** The rows 1 to the first `?`, one a row, in a column named by `marker` so the SQL on a line says which read it was. */
const upTo = (marker: string): string =>
  `WITH RECURSIVE c(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM c WHERE x < ?) SELECT x AS ${marker} FROM c WHERE ? <> ''`

beforeAll(async () => {
  t = await freshDb()
  slow = await import('../src/server/lib/slow-requests.ts')
  LIMIT = slow.A_LARGE_READ_ROWS
  const { buildApp } = await import('../src/server/index.ts')
  log = new RecordingStream()
  app = (await buildApp({ production: false, webDir: '/nonexistent', webAppUrl: 'http://localhost:5173', logLevel: 'info', logStream: log })).app
  const db = t.client.sqlite
  app.get('/one-large-all', async (request) => {
    const rows = db.prepare(upTo('large_by_all')).all(LIMIT + 1, BOUND)
    request.log.info('the handler of /one-large-all has its rows')
    return { rows: rows.length }
  })
  app.get('/one-large-iterate', async (request) => {
    let rows = 0
    for (const _ of db.prepare(upTo('large_by_iterate')).iterate(LIMIT + 5, BOUND)) {
      rows += 1
      if (rows === LIMIT) request.log.info('the handler of /one-large-iterate is at the last row within the limit')
      if (rows === LIMIT + 1) request.log.info('the handler of /one-large-iterate is at the first row past the limit')
    }
    return { rows }
  })
  app.get('/large-in-a-part', async () => {
    const part = slow.aFreshCount()
    const rows = slow.countedApart(part, () => db.prepare(upTo('large_in_a_part')).all(LIMIT + 1, BOUND))
    return { rows: rows.length, counted: part.rows }
  })
  app.get('/none-past-the-limit', async () => {
    // THE ORDER IS PART OF THE CASE: it is what makes mutations 2 and 3 at the top red.
    let iterated = 0
    for (const _ of db.prepare(upTo('at_the_limit_by_iterate')).iterate(LIMIT, BOUND)) iterated += 1
    let stopped = 0
    for (const _ of db.prepare(upTo('stopped_at_the_limit')).iterate(LIMIT + 5, BOUND)) {
      stopped += 1
      if (stopped === LIMIT) break
    }
    const byAll = db.prepare(upTo('at_the_limit_by_all')).all(LIMIT, BOUND)
    const one = db.prepare(upTo('one_row_by_get')).get(LIMIT + 1, BOUND)
    db.prepare('CREATE TEMP TABLE IF NOT EXISTS changed_by_run (x INTEGER)').run()
    const changed = db.prepare(`INSERT INTO changed_by_run ${upTo('changed_by_run')}`).run(LIMIT + 1, BOUND).changes
    return { rows: iterated + stopped + byAll.length, one: one !== undefined, changed }
  })
  app.get('/held-large', { config: { waits: true } }, async () => {
    const rows = db.prepare(upTo('held_open')).all(LIMIT + 1, BOUND)
    return { rows: rows.length }
  })
  // EVERY `/api` ROUTE DECLARES AN OPERATION AND A REACH, so this one borrows `record.list`, as
  // tests/a-slow-request-says-so-in-the-log.test.ts does. What is under test is the address, not the operation.
  app.get(`/api/office/mail-tool/state/${PRIVATE_TAIL}`, { config: { operation: 'record.list', reach: 'remote' } }, async () => {
    const rows = db.prepare(upTo('under_a_private_address')).all(LIMIT + 1, BOUND)
    return { rows: rows.length }
  })
  await app.ready()
}, 60_000)

beforeEach(() => {
  // THE LOG IS THE ONE THING A CASE CHANGES, and a line from the case before it would answer for this one.
  log.clear()
})

afterAll(async () => {
  await app.close()
  t.close()
})

/** Every large-read line for `door`, in the order written. */
const theLinesFor = (door: string): string[] => log.messages().filter((one) => one.startsWith(`the request GET ${door} read `))

/** Where in the log the first line that is `line` or starts with it was written, or -1. */
const whereIs = (line: string): number => log.messages().findIndex((one) => one.startsWith(line))

it('a request whose one `all` hands back more than the limit writes one line, at once, before the handler has the rows', async () => {
  expect(LIMIT, 'the limit is one exported number').toBeTypeOf('number')
  const res = await app.inject({ method: 'GET', url: '/one-large-all?page=2' })
  expect(res.json()).toMatchObject({ rows: LIMIT + 1 })
  expect(String(res.headers['server-timing'])).toMatch(/^sqlite;dur=[\d.]+;desc="\d+ statements", total;dur=[\d.]+$/)
  const lines = theLinesFor('/one-large-all?page=2')
  expect(lines, 'one line for the one large read').toHaveLength(1)
  expect(lines[0]).toBe(
    `the request GET /one-large-all?page=2 read ${String(LIMIT + 1)} rows in one statement: ${slow.theSqlForTheLine(upTo('large_by_all'))}`,
  )
  expect(lines[0]).toContain('SELECT x AS large_by_all FROM c')
  expect(lines[0], 'no value bound to the statement').not.toContain(BOUND)
  const theLine = whereIs(lines[0]!)
  const theHandlers = whereIs('the handler of /one-large-all has its rows')
  expect(theHandlers, 'the handler wrote its own line').toBeGreaterThanOrEqual(0)
  expect(theLine, 'the large-read line comes before the handler uses the rows').toBeLessThan(theHandlers)
  expect(log.wasSyncAt(theLine), 'the stream was synchronous for the large-read line').toBe(true)
  expect(log.flushedAfter, 'the stream was flushed right after the large-read line').toEqual([theLine + 1])
  expect(log.wasSyncAt(theHandlers), 'and was as it had been for the next line').toBe(false)
  expect(log.sync).toBe(false)
})

it('a request whose one `iterate` passes the limit writes one line, at the row that passes it', async () => {
  expect(LIMIT, 'the limit is one exported number').toBeTypeOf('number')
  const res = await app.inject({ method: 'GET', url: '/one-large-iterate' })
  expect(res.json()).toMatchObject({ rows: LIMIT + 5 })
  const lines = theLinesFor('/one-large-iterate')
  expect(lines, 'one line for the statement, however many rows pass the limit').toHaveLength(1)
  expect(lines[0]).toBe(
    `the request GET /one-large-iterate read more than ${String(LIMIT)} rows in one statement, one at a time: ` +
      slow.theSqlForTheLine(upTo('large_by_iterate')),
  )
  expect(lines[0], 'no value bound to the statement').not.toContain(BOUND)
  const within = whereIs('the handler of /one-large-iterate is at the last row within the limit')
  const past = whereIs('the handler of /one-large-iterate is at the first row past the limit')
  const theLine = whereIs(lines[0]!)
  expect(within, 'the handler wrote its line at the last row within the limit').toBeGreaterThanOrEqual(0)
  expect(theLine, 'no line while the rows are within the limit').toBeGreaterThan(within)
  expect(theLine, 'the line comes before the handler has the row past the limit').toBeLessThan(past)
})

it('a statement inside a part counted apart, inside a request, writes the line too', async () => {
  expect(LIMIT, 'the limit is one exported number').toBeTypeOf('number')
  const res = await app.inject({ method: 'GET', url: '/large-in-a-part' })
  expect(res.json(), 'the part counted the rows').toMatchObject({ rows: LIMIT + 1, counted: LIMIT + 1 })
  expect(theLinesFor('/large-in-a-part')).toEqual([
    `the request GET /large-in-a-part read ${String(LIMIT + 1)} rows in one statement: ${slow.theSqlForTheLine(upTo('large_in_a_part'))}`,
  ])
})

it('a request held open on purpose whose one `all` hands back more than the limit writes its one line too', async () => {
  expect(LIMIT, 'the limit is one exported number').toBeTypeOf('number')
  const res = await app.inject({ method: 'GET', url: '/held-large' })
  expect(res.json()).toMatchObject({ rows: LIMIT + 1 })
  expect(theLinesFor('/held-large')).toEqual([
    `the request GET /held-large read ${String(LIMIT + 1)} rows in one statement: ${slow.theSqlForTheLine(upTo('held_open'))}`,
  ])
})

it('a request under a private address writes its line with the address the log keeps, and not the private part', async () => {
  expect(LIMIT, 'the limit is one exported number').toBeTypeOf('number')
  const res = await app.inject({ method: 'GET', url: `/api/office/mail-tool/state/${PRIVATE_TAIL}` })
  expect(res.json()).toMatchObject({ rows: LIMIT + 1 })
  expect(theLinesFor('/api/office/mail-tool/state/[private]')).toEqual([
    `the request GET /api/office/mail-tool/state/[private] read ${String(LIMIT + 1)} rows in one statement: ` +
      slow.theSqlForTheLine(upTo('under_a_private_address')),
  ])
  expect(log.messages().filter((one) => one.includes(' rows in one statement') && one.includes(PRIVATE_TAIL))).toEqual([])
})

it('statements that each hand back at most the limit write no line however many rows they add up to', async () => {
  const none = await app.inject({ method: 'GET', url: '/none-past-the-limit' })
  expect(none.json(), 'three reads of the limit, a get of one row and a run that changed more').toMatchObject({ rows: 3 * LIMIT, one: true, changed: LIMIT + 1 })
  expect(log.messages().some((one) => one.startsWith('GET /none-past-the-limit 200')), 'the request was answered and logged').toBe(true)
  expect(theLinesFor('/none-past-the-limit')).toEqual([])
})

it('a statement run outside any request writes no line, with or without a count of its own', () => {
  const db = t.client.sqlite
  expect(db.prepare(upTo('outside_by_all')).all(LIMIT + 1, BOUND)).toHaveLength(LIMIT + 1)
  let iterated = 0
  for (const _ of db.prepare(upTo('outside_by_iterate')).iterate(LIMIT + 1, BOUND)) iterated += 1
  expect(iterated).toBe(LIMIT + 1)
  const aTimersPass = slow.aFreshCount()
  slow.countedApart(aTimersPass, () => db.prepare(upTo('a_timers_part')).all(LIMIT + 1, BOUND))
  expect(aTimersPass.rows, 'the pass counted its rows').toBe(LIMIT + 1)
  expect(log.messages().filter((one) => one.includes(' rows in one statement'))).toEqual([])
})

it('a second load of the module writes the line of its own server to its own log', async () => {
  vi.resetModules()
  const again = await import('../src/server/lib/slow-requests.ts')
  expect(again, 'a second load').not.toBe(slow)
  const { default: Fastify } = await import('fastify')
  const second = Fastify({ logger: false })
  const lines: string[] = []
  // THE PROTOTYPE IS WRAPPED ALREADY, so this wraps nothing, and the first load's wrapper reads every statement.
  again.measureTheStatementsOf(t.client.sqlite)
  again.sayTheSlowRequests(second, (line) => lines.push(line), () => false)
  second.get('/in-the-second-server', async () => ({ rows: t.client.sqlite.prepare(upTo('second_load')).all(LIMIT + 1, BOUND).length }))
  await second.ready()
  try {
    expect((await second.inject({ method: 'GET', url: '/in-the-second-server' })).json()).toEqual({ rows: LIMIT + 1 })
    expect(lines).toEqual([
      `the request GET /in-the-second-server read ${String(LIMIT + 1)} rows in one statement: ${again.theSqlForTheLine(upTo('second_load'))}`,
    ])
    expect(log.messages().filter((one) => one.includes(' rows in one statement')), 'nothing in the log of the first server').toEqual([])
  } finally {
    await second.close()
  }
})
