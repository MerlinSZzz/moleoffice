// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A REQUEST OVER 2 s IS ONE LINE THAT SAYS WHAT IT DID INSIDE SQLITE (src/server/lib/slow-requests.ts). Wave 13y round 17,
 * asked in message oKv5mSSCSeon after GET /api/messages/comments held the server for 29.8 s and 33.3 s.
 *
 * WHAT IS PROVED. Through the server `buildApp` makes, with its log read from the stream it writes to:
 * 1. A request over 2 s gets the line: its door, its whole time, its time inside SQLite, its count of statements, and its
 *    five slowest statements, slowest first, each with its SQL as prepared, its time and its rows. The statements are run
 *    with `get`, `all`, `iterate` and `run`, before and after the request waits, so each is counted across the wait with
 *    the rows it gave or changed. A sixth, quicker statement is counted and not named.
 * 2. A quick request and a request held open on purpose get no line.
 * 3. A long list of `?` is shortened on the line, and the line has no parameter values.
 * 4. Every answer, quick or slow, carries its own count in `Server-Timing`: a door that runs three statements more than
 *    another says three more, and a request held open on purpose carries none. Wave 13x round 12.
 *
 * THE FIVE ARE MADE SLOW BY SQLITE ITSELF, each counting through a recursive table of a different length, so that each
 * takes tens of milliseconds and the statements the server's own hooks run cannot be among the five.
 *
 * CONTROL: every test passes at the tip. MUTATIONS, each run and each red:
 *   1. Nothing is wrapped: `measureTheStatementsOf` returns at once. Red in test 1.
 *   2. No store is entered: the first hook calls `done()` alone in place of `THE_REQUEST.run(did, done)`. Red in test 1.
 *   3. `iterate` is not wrapped. Red in test 1.
 *   4. A chosen wait gets a line too: `!aChosenWait(request)` removed. Red in test 2.
 *   5. `keep` names the first five in the order they ran, not the slowest five. Red in test 1.
 *   6. (wave 13x round 12) The `onSend` hook sets no header. Red in test 4.
 */
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'

/** Past the 2 s mark, with room for the reply itself. */
const A_SLOW_REPLY_MS = 2_200

const A_TEST_THAT_WAITS = 30_000

/** Pino writes one JSON object a line; this keeps the `msg` of each. */
class RecordingStream {
  private readonly lines: string[] = []
  private waiting = ''

  write(text: string): void {
    this.waiting += text
    let end = this.waiting.indexOf('\n')
    while (end !== -1) {
      const line = this.waiting.slice(0, end)
      this.waiting = this.waiting.slice(end + 1)
      if (line.trim() !== '') this.lines.push(line)
      end = this.waiting.indexOf('\n')
    }
  }

  messages(): string[] {
    return this.lines.map((line) => {
      const parsed = JSON.parse(line) as { msg?: unknown }
      return typeof parsed.msg === 'string' ? parsed.msg : ''
    })
  }

  /** Start a case with no line left over from the one before it. */
  clear(): void {
    this.lines.length = 0
    this.waiting = ''
  }
}

let t: TestDb
let app: FastifyInstance
let log: RecordingStream

const pause = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms))

/** A count through a recursive table of `upTo` rows, which keeps SQLite busy for a time that grows with it. */
const counting = (marker: string): string =>
  `WITH RECURSIVE c(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM c WHERE x < ?) SELECT x AS ${marker} FROM c WHERE x % ? = 0`

beforeAll(async () => {
  t = await freshDb()
  const { buildApp } = await import('../src/server/index.ts')
  log = new RecordingStream()
  app = (await buildApp({ production: false, webDir: '/nonexistent', webAppUrl: 'http://localhost:5173', logLevel: 'info', logStream: log })).app
  const db = t.client.sqlite
  app.get('/busy-in-sqlite', async () => {
    db.prepare('SELECT 1 AS quick_before_the_wait').get()
    db.prepare(counting('before_the_wait')).all(400_000, 400_000)
    await pause(A_SLOW_REPLY_MS)
    db.prepare(counting('one_row_by_get')).get(3_200_000, 3_200_000)
    db.prepare(counting('three_rows_by_all')).all(2_400_000, 800_000)
    let iterated = 0
    for (const _ of db.prepare(counting('four_rows_by_iterate')).iterate(1_600_000, 400_000)) iterated += 1
    db.prepare('CREATE TEMP TABLE IF NOT EXISTS kept_for_the_test (x INTEGER)').run()
    db.prepare(`INSERT INTO kept_for_the_test ${counting('five_rows_by_run')}`).run(800_000, 160_000)
    return { iterated }
  })
  app.get('/quick', async () => ({ answered: 'at once' }))
  app.get('/three-more', async () => {
    for (const n of [1, 2, 3]) db.prepare(`SELECT ${String(n)} AS one_of_three`).get()
    return { answered: 'at once' }
  })
  app.get('/held', { config: { waits: true } }, async () => {
    db.prepare(counting('held_open')).all(400_000, 400_000)
    await pause(A_SLOW_REPLY_MS)
    return { answered: 'held open' }
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

/** The line for `door`, or undefined. */
const theLineFor = (door: string): string | undefined => log.messages().find((one) => one.startsWith(`the request GET ${door} took `))

it(
  'a request over 2 s names its time in SQLite and its five slowest statements, counted across its wait',
  async () => {
    const res = await app.inject({ method: 'GET', url: '/busy-in-sqlite' })
    expect(res.json()).toMatchObject({ iterated: 4 })
    await pause(20)
    const line = theLineFor('/busy-in-sqlite')
    expect(line, 'the line for the request').toBeDefined()
    const head = /^the request GET \/busy-in-sqlite took (\d+) ms, ([\d.]+) ms of it inside SQLite in (\d+) statements, and (\d+) ms elsewhere \(its own code, or waiting while other work held the server\)\. Its 5 slowest: /.exec(line!)
    expect(head, line).not.toBeNull()
    const [total, inside, statements, elsewhere] = head!.slice(1).map(Number) as [number, number, number, number]
    expect(total).toBeGreaterThan(2_000)
    expect(statements, 'the seven the door ran, and what the hooks ran').toBeGreaterThanOrEqual(7)
    expect(Math.abs(total - inside - elsewhere), 'the two parts add up to the whole').toBeLessThanOrEqual(1)

    const named = line!.slice(head![0].length).split(/ ?\(\d\) /).filter((one) => one !== '')
    const read = named.map((one) => {
      const parts = /^([\d.]+) ms, (\d+) rows: (.*)$/.exec(one)
      expect(parts, one).not.toBeNull()
      return { ms: Number(parts![1]), rows: Number(parts![2]), sql: parts![3]! }
    })
    const marker = (sql: string): string => /SELECT x AS (\w+) FROM c/.exec(sql)?.[1] ?? sql
    expect(Object.fromEntries(read.map((one) => [marker(one.sql), one.rows]))).toEqual({
      before_the_wait: 1,
      one_row_by_get: 1,
      three_rows_by_all: 3,
      four_rows_by_iterate: 4,
      five_rows_by_run: 5,
    })
    for (let at = 1; at < read.length; at += 1) expect(read[at]!.ms, 'slowest first').toBeLessThanOrEqual(read[at - 1]!.ms)
    expect(inside, 'the time inside SQLite holds the five').toBeGreaterThanOrEqual(read.reduce((sum, one) => sum + one.ms, 0) - 5)
    // THE SQL AS PREPARED: the parameters are `?`, never the values bound.
    expect(read.find((one) => marker(one.sql) === 'one_row_by_get')!.sql).toBe(
      'WITH RECURSIVE c(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM c WHERE x < ?) SELECT x AS one_row_by_get FROM c WHERE x % ? = 0',
    )
    expect(line).not.toContain('3200000')
  },
  A_TEST_THAT_WAITS,
)

it(
  'a quick request and a request held open on purpose get no line',
  async () => {
    expect((await app.inject({ method: 'GET', url: '/quick' })).statusCode).toBe(200)
    expect((await app.inject({ method: 'GET', url: '/held' })).statusCode).toBe(200)
    await pause(20)
    expect(log.messages().some((one) => one.startsWith('GET /held 200')), 'the held request was answered and logged').toBe(true)
    expect(theLineFor('/quick')).toBeUndefined()
    expect(theLineFor('/held')).toBeUndefined()
  },
  A_TEST_THAT_WAITS,
)

it('the line shortens a long list of ? and keeps the SQL on one line', async () => {
  const { theSqlForTheLine } = await import('../src/server/lib/slow-requests.ts')
  expect(theSqlForTheLine('SELECT id\n  FROM records WHERE id IN (?, ?, ?, ?, ?, ?) AND kind = ?')).toBe(
    'SELECT id FROM records WHERE id IN (?, … 6 in all) AND kind = ?',
  )
  expect(theSqlForTheLine('SELECT ? , ?, ?')).toBe('SELECT ? , ?, ?')
  expect(theSqlForTheLine(`SELECT '${'x'.repeat(500)}'`)).toMatch(/^SELECT 'x{392} … \(509 characters\)$/)
})

it('every answer carries its own count in Server-Timing, and a request held open carries none', async () => {
  const timing = (header: unknown): { statements: number; sqliteMs: number; totalMs: number } => {
    const read = /^sqlite;dur=([\d.]+);desc="(\d+) statements", total;dur=([\d.]+)$/.exec(String(header))
    expect(read, String(header)).not.toBeNull()
    return { sqliteMs: Number(read![1]), statements: Number(read![2]), totalMs: Number(read![3]) }
  }
  const quick = timing((await app.inject({ method: 'GET', url: '/quick' })).headers['server-timing'])
  const more = timing((await app.inject({ method: 'GET', url: '/three-more' })).headers['server-timing'])
  expect(more.statements - quick.statements).toBe(3)
  expect(more.totalMs).toBeGreaterThanOrEqual(more.sqliteMs)
  const held = await app.inject({ method: 'GET', url: '/held' })
  expect(held.statusCode).toBe(200)
  expect(held.headers['server-timing']).toBeUndefined()
}, A_TEST_THAT_WAITS)
