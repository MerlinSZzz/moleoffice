// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * EVERY TIMER THE SERVER STARTS HAS A NAME, AND A LONG RUN OF ONE IS A LINE IN THE LOG.
 *
 * Between 01:31 and 05:11 on 10 October 2026 the loop watch (lib/loop-watch.ts) wrote 308 lines saying the server was
 * held, about 2 s each, most of them 60 to 64 s apart. Every line said no request was making its answer, and none
 * could say whose the work was: a timer's callback is nobody's request, and the watch runs only after the work has
 * ended. This module opens no database, so `index.ts` and every timer may import it.
 *
 * A RUN IS ONE SYNCHRONOUS PASS OF A TIMER'S CALLBACK, from its first line until it returns. That is the time the
 * thread does nothing else, which is what a hold is. A callback that returns a promise has only the part before its
 * first wait measured here, and its line says so; the parts after a wait are measured where the timer wraps them in a
 * run of their own.
 *
 * WHAT IS KEPT: the newest runs, with their name and when they started and ended, so the loop watch can name every
 * named run that overlapped a hold. Not only those that started inside it: the watch dates a hold from when it
 * expected to run, and a timer that fired a moment before that and then held the thread started just outside.
 *
 * A LONG RUN GETS A SECOND LINE, A MOMENT LATER: the garbage collector's time inside it and the heap in use at its end.
 * On 10 October 2026 the flow reminders held the live server 656 to 777 ms a minute, while the statements of one pass
 * took 35 ms on live and the same pass took about 60 ms on a copy at the live counts (wave 13y round 19). The live
 * server's heap had reached 6 GB at its peak, and a collection inside a run is time the run's own code did not spend.
 * Node reports a collection to an observer only after the run that caused it has returned, so this line waits
 * `THE_COLLECTOR_REPORTS_WITHIN_MS` and counts the collections that began inside the run.
 */

import { PerformanceObserver } from 'node:perf_hooks'

/** A run longer than this is a line in the log. Asked for in the round 16 brief: "over 250 ms". */
export const A_LONG_RUN_MS = 250

/** One named run, with times from `performance.now()`. */
export interface ANamedRun {
  name: string
  startedAt: number
  endedAt: number
}

// HOW MANY RUNS ARE KEPT. The loop watch looks four times a second and every timer here runs far less often, so the
// newest 64 runs reach back well past the start of any hold it reports.
const KEPT = 64
const recent: ANamedRun[] = []

/** How long the second line of a long run waits for the collector's reports. */
export const THE_COLLECTOR_REPORTS_WITHIN_MS = 100

/** One collection, with times from `performance.now()`. */
interface ACollection {
  startTime: number
  duration: number
}

/**
 * THE NEWEST COLLECTIONS, AND ONE OBSERVER FOR THE WHOLE PROCESS, kept under a registered symbol so a test that loads
 * this module again does not start a second observer. The observer does not keep the process running.
 */
const THE_COLLECTIONS = Symbol.for('mole-office.named-timers.collections')
const collections: ACollection[] = ((globalThis as Record<symbol, unknown>)[THE_COLLECTIONS] ??= (() => {
  const kept: ACollection[] = []
  new PerformanceObserver((list) => {
    for (const one of list.getEntries()) kept.push({ startTime: one.startTime, duration: one.duration })
    if (kept.length > 256) kept.splice(0, kept.length - 256)
  }).observe({ entryTypes: ['gc'] })
  return kept
})()) as ACollection[]

/** The second line of a long run. Exported so the test reads the same sentence the server writes. */
export function sayTheCollectionsInALongRun(name: string, ms: number, inside: readonly ACollection[], heapUsedBytes: number): string {
  const collected = inside.reduce((sum, one) => sum + one.duration, 0)
  return (
    `the timer "${name}"'s run of ${String(Math.round(ms))} ms: the garbage collector ran ${String(inside.length)} times ` +
    `inside it, for ${String(Math.round(collected))} ms in all, as reported within ${String(THE_COLLECTOR_REPORTS_WITHIN_MS)} ms ` +
    `after the run; the heap in use at its end was ${String(Math.round(heapUsedBytes / 1_048_576))} MB.`
  )
}

/** How the line reads. Exported so the test reads the same sentence the server writes. */
export function sayTheLongRun(name: string, ms: number, beforeAWait: boolean): string {
  return (
    `the timer "${name}" held the server for ${String(Math.round(ms))} ms` +
    (beforeAWait ? ', counted until its first wait; what it does after that is not in this time.' : '.')
  )
}

/**
 * RUN `work` ONCE AS THE TIMER `name`: time it, keep it, and say it when it took longer than `A_LONG_RUN_MS`.
 * What `work` returns or throws is passed on unchanged.
 */
export function runNamed<T>(name: string, log: (line: string) => void, work: () => T): T {
  const startedAt = performance.now()
  let result: T | undefined
  let thenable = false
  try {
    result = work()
    thenable = typeof (result as { then?: unknown } | null)?.then === 'function'
    return result
  } finally {
    const endedAt = performance.now()
    recent.push({ name, startedAt, endedAt })
    if (recent.length > KEPT) recent.shift()
    if (endedAt - startedAt > A_LONG_RUN_MS) {
      log(sayTheLongRun(name, endedAt - startedAt, thenable))
      const heapUsed = process.memoryUsage().heapUsed
      setTimeout(() => {
        const inside = collections.filter((one) => one.startTime >= startedAt && one.startTime <= endedAt)
        log(sayTheCollectionsInALongRun(name, endedAt - startedAt, inside, heapUsed))
      }, THE_COLLECTOR_REPORTS_WITHIN_MS).unref()
    }
  }
}

/** The callback `work`, named: what to hand to setInterval or setTimeout. */
export function named(name: string, log: (line: string) => void, work: () => void): () => void {
  return () => runNamed(name, log, work)
}

/** The named runs that overlapped the time from `began` to `ended`, oldest first, for the loop watch's line. */
export function theNamedRunsAcross(began: number, ended: number): ANamedRun[] {
  return recent.filter((one) => one.endedAt >= began && one.startedAt <= ended)
}

/** Forget every kept run. For a test that wants to start from nothing. */
export function forgetTheNamedRuns(): void {
  recent.length = 0
}
