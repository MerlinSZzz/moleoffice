// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A REQUEST THAT TOOK MORE THAN 2 s IS ONE LINE IN THE LOG, WITH WHAT IT DID INSIDE SQLITE.
 *
 * At 08:31 and 08:37 on 10 October 2026 GET /api/messages/comments took 29.8 s and 33.3 s while the owner opened a
 * report, and the loop watch (lib/loop-watch.ts) could say only that this request held the server, not what in it did.
 * The database is synchronous, so a request's statements are where a hold of that length can be. The secretary asked for this
 * line in round 17 of wave 13y (message oKv5mSSCSeon).
 *
 * WHAT THE LINE SAYS: the request, its whole time, the time its own statements spent inside SQLite, how many statements
 * it ran, and its five slowest, each as its SQL with every parameter a `?` (as it was prepared; nothing a caller sent is
 * in it), its time and how many rows it gave or changed.
 *
 * HOW A STATEMENT IS COUNTED TO A REQUEST. Each request runs inside its own `AsyncLocalStorage` store, entered in its
 * first hook, and `run`, `get`, `all` and `iterate` of every prepared statement are wrapped. A statement run while a
 * store is current is timed and counted to that request; one run with none, such as a timer's, is passed straight on.
 * A row read by `iterate` is counted with the time of its own step. The whole time also counts what the request waited
 * for, such as another piece of work holding the thread, so the line gives both, and says what is left over.
 *
 * WHAT IT COSTS. Outside a request, one look for the store per statement. Inside, two clock readings and a place in
 * the list of five. Measured on the round 17 copy at the live counts: a statement that takes 0.78 µs took 0.80 µs
 * wrapped outside a request and 0.89 µs inside one, and a pass of the flow reminders (about 2,200 statements, 50 ms)
 * took no longer than unwrapped, within the run-to-run spread.
 *
 * EVERY ANSWER CARRIES ITS OWN COUNT, in a standard `Server-Timing` header: `sqlite;dur=<ms>;desc="<n> statements"`
 * and `total;dur=<ms>`, both counted until the answer is handed over to be sent. Wave 13x round 12 asked for each
 * page's statements and server time per request, which do not move with the load on the machine as a ready time does;
 * the measure reads them from this header. A stream held open on purpose carries none.
 *
 * A STATEMENT THAT HANDS BACK MORE THAN `A_LARGE_READ_ROWS` ROWS IS A LINE AT ONCE, before its rows are used. The request
 * log and the slow line are written when a request ends, and a request whose rows fill the heap while they are parsed
 * never ends. `all` hands back its rows before any of them is used, and `iterate` one at a time, so the line is written
 * there: for `all` once the answer is back and before it is returned, for `iterate` at the row that passes the limit,
 * and it reaches the log's file before the wrapper goes on (`writtenAtOnce`). It names the request, the statement's SQL
 * and its rows. It names no project and no agent: when the request's first hook runs, no door has worked them out yet,
 * and the code that works them out opens the database. A statement outside a request writes none. A request held open on
 * purpose writes it as any other does, though it gets no slow line: that line's reason is time, and a row count fills the
 * heap whatever the wait.
 *
 * This module opens no database: the server hands it the handle it opened.
 */

import { privateRequestLogAddress } from '../../config/private-sandbox-login.mjs'
import { AsyncLocalStorage } from 'node:async_hooks'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { CUT_MARK } from '@shared/shortening.ts'

/** A request longer than this is a line. Asked for in round 17: "for any request over 2 s". */
export const A_SLOW_REQUEST_MS = 2_000

/** How many of a request's slowest statements its line names. Asked for in round 17: "its five slowest". */
export const THE_SLOWEST_NAMED = 5

/**
 * ONE STATEMENT THAT HANDS BACK MORE ROWS THAN THIS INSIDE A REQUEST IS A LINE. Well above every ordinary read: a page of
 * records or of messages is at most 1,000 rows, the work list and a read of records by id at most 2,000, and the largest
 * one statement of an ordinary page that the live server's log has counted is the project graph's read of links, 4,870
 * rows. Well below a whole project: the made-up office of the live counts holds 18,799 live records in its first project,
 * so a read of a whole project with its deleted records hands back more than that, and the office's search counts 78,224
 * records in one project of the live office.
 */
export const A_LARGE_READ_ROWS = 10_000

/** One statement run inside a request. */
export interface AStatementRun {
  sql: string
  ms: number
  rows: number
}

/** What one request did inside SQLite, so far. */
export interface WhatARequestDidInSqlite {
  ms: number
  statements: number
  /** The rows its statements gave or changed, all of them added up. */
  rows: number
  /** Its slowest statements, slowest first, at most `THE_SLOWEST_NAMED`. */
  slowest: AStatementRun[]
}

/**
 * ONE STORE AND ONE MARK FOR THE WHOLE PROCESS, kept under registered symbols rather than in this module. better-sqlite3
 * is loaded once per process, so its statement prototype is shared, while a test loads this module again for every fresh
 * database. Kept here, each load would wrap the prototype once more, and the wrapper of the first load would look in a
 * store the later loads never enter.
 */
const THE_STORE = Symbol.for('mole-office.slow-requests.the-request')
const MEASURED = Symbol.for('mole-office.slow-requests.measured')
const THE_REQUEST: AsyncLocalStorage<WhatARequestDidInSqlite> = ((globalThis as Record<symbol, unknown>)[THE_STORE] ??=
  new AsyncLocalStorage<WhatARequestDidInSqlite>()) as AsyncLocalStorage<WhatARequestDidInSqlite>

/**
 * WHAT THE LARGE-READ LINE NEEDS OF THE REQUEST A STATEMENT RUNS IN: its method and its url, whose form for the log is
 * worked out only when a line is written, and the log of the server whose hook entered it. A STORE OF ITS OWN, not a
 * field of the count, for two reasons. `countedApart` gives a part a count of its own inside a request, and the part's
 * statements are still the request's. And a count is handed to callers, who put it in a line or compare it whole. Under a
 * registered symbol for the reason the count's store is: the wrapper of the first load reads it, and each load's hook
 * enters it with its own log.
 */
interface TheRequestReading {
  method: string
  url: string
  /** The server's log, made to reach its file before it returns (`writtenAtOnce`). */
  log: (line: string) => void
}
const THE_READING_STORE = Symbol.for('mole-office.slow-requests.the-request-reading')
const THE_REQUEST_READING: AsyncLocalStorage<TheRequestReading> = ((globalThis as Record<symbol, unknown>)[THE_READING_STORE] ??=
  new AsyncLocalStorage<TheRequestReading>()) as AsyncLocalStorage<TheRequestReading>

/** The `Server-Timing` value for a request's count so far. */
export function theServerTiming(totalMs: number, did: WhatARequestDidInSqlite): string {
  return `sqlite;dur=${did.ms.toFixed(1)};desc="${String(did.statements)} statements", total;dur=${totalMs.toFixed(1)}`
}

/** A fresh count, for a request or a test. */
export function aFreshCount(): WhatARequestDidInSqlite {
  return { ms: 0, statements: 0, rows: 0, slowest: [] }
}

/** Run `work` as one request's: every statement it runs, before and after a wait, is counted to `count`. */
export function countedTo<T>(count: WhatARequestDidInSqlite, work: () => T): T {
  return THE_REQUEST.run(count, work)
}

/**
 * RUN `work` WITH A COUNT OF ITS OWN, `did`, which holds what it did inside SQLite once it returns or throws. For a part
 * of a timer's pass, so the pass's line can say which part read what (wave 13y round 19). A request that runs `work` is
 * still given every statement of it: the part's count is added to the request's.
 */
export function countedApart<T>(did: WhatARequestDidInSqlite, work: () => T): T {
  const outer = THE_REQUEST.getStore()
  try {
    return THE_REQUEST.run(did, work)
  } finally {
    if (outer !== undefined) {
      const named = did.slowest.reduce((sum, one) => ({ ms: sum.ms + one.ms, rows: sum.rows + one.rows }), { ms: 0, rows: 0 })
      outer.ms += did.ms - named.ms
      outer.statements += did.statements - did.slowest.length
      outer.rows += did.rows - named.rows
      for (const one of did.slowest) keep(outer, one.sql, one.ms, one.rows)
    }
  }
}

function keep(count: WhatARequestDidInSqlite, sql: string, ms: number, rows: number): void {
  count.ms += ms
  count.statements += 1
  count.rows += rows
  const slowest = count.slowest
  if (slowest.length === THE_SLOWEST_NAMED && ms <= slowest[slowest.length - 1]!.ms) return
  let at = slowest.length
  while (at > 0 && slowest[at - 1]!.ms < ms) at -= 1
  slowest.splice(at, 0, { sql, ms, rows })
  if (slowest.length > THE_SLOWEST_NAMED) slowest.pop()
}

/** How many rows a call answered: a list's length, one or none for `get`, the rows changed for `run`. */
function theRowsOf(method: 'run' | 'get' | 'all', answer: unknown): number {
  if (method === 'all') return Array.isArray(answer) ? answer.length : 0
  if (method === 'get') return answer === undefined ? 0 : 1
  const changes = (answer as { changes?: unknown } | null)?.changes
  return typeof changes === 'number' ? changes : 0
}

/**
 * WRAP `run`, `get`, `all` AND `iterate` OF EVERY STATEMENT THE HANDLE PREPARES, once per prototype. better-sqlite3 gives
 * every statement of every handle one prototype, so wrapping it reaches the statements drizzle prepares as well. The
 * prototype is marked once it is wrapped, so a second call, or a second load of this module, wraps nothing.
 */
export function measureTheStatementsOf(handle: { prepare: (sql: string) => object }): void {
  const prototype = Object.getPrototypeOf(handle.prepare('SELECT 1')) as Record<string | symbol, unknown> & object
  if (prototype[MEASURED] === true) return
  prototype[MEASURED] = true
  for (const method of ['run', 'get', 'all'] as const) {
    const original = prototype[method] as (this: { source: string }, ...args: unknown[]) => unknown
    prototype[method] = function (this: { source: string }, ...args: unknown[]): unknown {
      const count = THE_REQUEST.getStore()
      if (count === undefined) return original.apply(this, args)
      const began = performance.now()
      const answer = original.apply(this, args)
      const ms = performance.now() - began
      const rows = theRowsOf(method, answer)
      keep(count, this.source, ms, rows)
      // ONLY ROWS HANDED BACK ARE A LARGE READ: `run` counts the rows it changed, and `get` hands back one at most.
      if (method === 'all' && rows > A_LARGE_READ_ROWS) sayALargeRead(this.source, rows)
      return answer
    }
  }
  const iterate = prototype['iterate'] as (this: { source: string }, ...args: unknown[]) => IterableIterator<unknown>
  prototype['iterate'] = function (this: { source: string }, ...args: unknown[]): IterableIterator<unknown> {
    const count = THE_REQUEST.getStore()
    if (count === undefined) return iterate.apply(this, args)
    const source = this.source
    let ms = 0
    let rows = 0
    let said = false
    const say = (): void => {
      if (said) return
      said = true
      keep(count, source, ms, rows)
    }
    let began = performance.now()
    const inner = iterate.apply(this, args)
    ms += performance.now() - began
    const counted: IterableIterator<unknown> = {
      next(): IteratorResult<unknown> {
        began = performance.now()
        const step = inner.next()
        ms += performance.now() - began
        if (step.done === true) say()
        else {
          rows += 1
          // AT THE ROW THAT PASSES THE LIMIT, so once, and an iteration ended before it writes nothing.
          if (rows === A_LARGE_READ_ROWS + 1) sayALargeRead(source, 'more')
        }
        return step
      },
      return(value?: unknown): IteratorResult<unknown> {
        const step = inner.return?.(value) ?? { done: true as const, value }
        say()
        return step
      },
      [Symbol.iterator]() {
        return counted
      },
    }
    return counted
  }
}

/** A statement's SQL as the line writes it: on one line, a long list of `?` shortened, and at most 400 characters. */
export function theSqlForTheLine(sql: string): string {
  const one = sql
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\?(?:\s*,\s*\?){3,}/g, (list) => `?, … ${String(list.split('?').length - 1)} in all`)
  // THE CUT MARK IS THE SHARED ONE (src/shared/shortening.ts), so every shortened thing in the product ends the same way.
  return one.length > 400 ? `${one.slice(0, 400)}${CUT_MARK} (${String(one.length)} characters)` : one
}

/**
 * WRITE THE LINE FOR ONE STATEMENT THAT HANDED BACK MORE THAN `A_LARGE_READ_ROWS` ROWS: `rows` of them for `all`, or
 * `'more'` for `iterate`, at the row that passes the limit. Outside a request, none. A request held open on purpose
 * writes it too. The slow line leaves such a request out because its reason is time: a wait somebody chose is long by
 * design. A row count has no such reason, since the rows fill the heap however long the wait was meant to be.
 */
function sayALargeRead(sql: string, rows: number | 'more'): void {
  const reading = THE_REQUEST_READING.getStore()
  if (reading === undefined) return
  const request = `${reading.method} ${privateRequestLogAddress(reading.url)}`
  const read = rows === 'more' ? `more than ${String(A_LARGE_READ_ROWS)} rows in one statement, one at a time` : `${String(rows)} rows in one statement`
  reading.log(`the request ${request} read ${read}: ${theSqlForTheLine(sql)}`)
}

/** pino's destination, as far as `writtenAtOnce` uses it. */
interface ALogStream {
  sync?: unknown
  flushSync?: (this: ALogStream) => void
}

/**
 * THE SERVER'S LOG, MADE TO REACH ITS FILE BEFORE IT RETURNS, for the large-read line: after it the process may never take
 * another turn, stuck parsing the rows until its heap is gone. The server logs through pino to pino's own stream, a
 * SonicBoom that is not synchronous. A line written while it is idle goes to an `fs.write` that the thread pool finishes,
 * and a line written while a write is in flight waits in its buffer for a later turn. So the stream is made synchronous
 * for this one line. Written while it is idle, the line goes out at once by `fs.writeSync`. Written behind a write in
 * flight, it goes out with whatever waits by `flushSync`, which leaves the write in flight to the thread pool, so that
 * earlier line may land after this one. A stream without `flushSync`, such as one a test hands in, is written to by pino
 * at once already.
 *
 * PINO KEEPS ITS STREAM UNDER A SYMBOL OF ITS OWN, described `pino.stream`, and this module does not import pino, which
 * is Fastify's dependency and not the server's. A pino logger whose stream is not found is a broken assumption, and it
 * stops the server at its start rather than leave the line to a later turn.
 */
function writtenAtOnce(logger: object, log: (line: string) => void): (line: string) => void {
  let stream: ALogStream | undefined
  for (let at: object | null = logger; at !== null && stream === undefined; at = Object.getPrototypeOf(at) as object | null) {
    const key = Object.getOwnPropertySymbols(at).find((one) => one.description === 'pino.stream')
    if (key !== undefined) stream = (at as Record<symbol, ALogStream>)[key]
  }
  if (stream === undefined && 'levels' in logger) throw new Error("the server logs through pino, but pino's stream was not found, so a large read could not be written at once")
  if (stream === undefined) return log
  const theStream = stream
  const { flushSync } = theStream
  if (typeof flushSync !== 'function') return log
  return (line) => {
    const was = theStream.sync
    theStream.sync = true
    try {
      log(line)
      flushSync.call(theStream)
    } finally {
      theStream.sync = was
    }
  }
}

/** The line for one slow request. Exported so the test reads the sentence the server writes. */
export function sayTheSlowRequest(request: string, totalMs: number, did: WhatARequestDidInSqlite): string {
  const round = (ms: number): string => (ms < 10 ? ms.toFixed(1) : String(Math.round(ms)))
  const statements =
    did.slowest.length === 0
      ? 'It ran no statement.'
      : `Its ${String(did.slowest.length)} slowest: ` +
        did.slowest.map((one, at) => `(${String(at + 1)}) ${round(one.ms)} ms, ${String(one.rows)} rows: ${theSqlForTheLine(one.sql)}`).join(' ')
  return (
    `the request ${request} took ${round(totalMs)} ms, ${round(did.ms)} ms of it inside SQLite in ${String(did.statements)} ` +
    `statements, and ${round(Math.max(0, totalMs - did.ms))} ms elsewhere (its own code, or waiting while other work held the server). ` +
    statements
  )
}

/**
 * GIVE EVERY REQUEST ITS COUNT, AND WRITE THE LINE FOR ONE OVER `A_SLOW_REQUEST_MS`. Registered before every other
 * request hook, so the hooks after it and the handler run inside the request's store. A stream held open on purpose
 * (`aChosenWait`) is long by design and gets no slow line, as the server's own slow-request line gives it none. The same
 * hook enters the request's reading, for the line of a statement that hands back more than `A_LARGE_READ_ROWS` rows. That
 * line is written for a request held open on purpose too: the slow line's reason is time, and a row count fills the heap
 * whatever the wait.
 */
export function sayTheSlowRequests(app: FastifyInstance, log: (line: string) => void, aChosenWait: (request: FastifyRequest) => boolean): void {
  const counts = new WeakMap<FastifyRequest, { began: number; did: WhatARequestDidInSqlite }>()
  // `log` WRITES THROUGH `app.log`, so its stream is the one made synchronous for the large-read line.
  const atOnce = writtenAtOnce(app.log, log)
  // A HOOK WITH `done`, NOT AN ASYNC ONE: the rest of the request runs from inside `done`, so inside the store.
  app.addHook('onRequest', (request, _reply, done) => {
    const did = aFreshCount()
    counts.set(request, { began: performance.now(), did })
    THE_REQUEST_READING.run({ method: request.method, url: request.url, log: atOnce }, () => THE_REQUEST.run(did, done))
  })
  app.addHook('onSend', async (request, reply) => {
    const held = counts.get(request)
    if (held === undefined || aChosenWait(request) || reply.raw.headersSent) return
    reply.header('server-timing', theServerTiming(performance.now() - held.began, held.did))
  })
  app.addHook('onResponse', async (request) => {
    const held = counts.get(request)
    if (held === undefined) return
    const totalMs = performance.now() - held.began
    if (totalMs > A_SLOW_REQUEST_MS && !aChosenWait(request)) log(sayTheSlowRequest(`${request.method} ${privateRequestLogAddress(request.url)}`, totalMs, held.did))
  })
}
