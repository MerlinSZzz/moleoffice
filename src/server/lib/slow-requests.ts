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
      keep(count, this.source, performance.now() - began, theRowsOf(method, answer))
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
        else rows += 1
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
 * (`aChosenWait`) is long by design and gets no line, as the server's own slow-request line gives it none.
 */
export function sayTheSlowRequests(app: FastifyInstance, log: (line: string) => void, aChosenWait: (request: FastifyRequest) => boolean): void {
  const counts = new WeakMap<FastifyRequest, { began: number; did: WhatARequestDidInSqlite }>()
  // A HOOK WITH `done`, NOT AN ASYNC ONE: the rest of the request runs from inside `done`, so inside the store.
  app.addHook('onRequest', (request, _reply, done) => {
    const did = aFreshCount()
    counts.set(request, { began: performance.now(), did })
    THE_REQUEST.run(did, done)
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
