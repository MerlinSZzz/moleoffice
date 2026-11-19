// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE LINE THAT SAYS THE SERVER WAS HELD, AND WHAT WAS OPEN WHILE IT WAS.
 *
 * The server is one thread. On 9 October 2026 GET /api/messages/comments and GET /api/plan-graph each took 37 to
 * 40 s, the serve log was silent for 37.6 s, and nobody could say which piece of work held it: a request's clock
 * counts the time it waited as well as the time it worked. This module opens no database, so `index.ts` may import
 * it at the top.
 *
 * A TIMER ASKS EVERY `every` MILLISECONDS. Node's event-loop histogram measures the delay, less its own sampling
 * step. When that is more than `heldOver` (500 ms in the server), the line names every request open across it, with
 * whether its answer had been made (its handler had returned and the answer was serialised). When one request was
 * still making its answer, that is the one that held it. When several were, the line names them all and does not
 * choose. When none was, the line says so: the work was not a request making its answer, so it was started by
 * something else, such as a timer.
 *
 * A REQUEST THAT CLOSED AFTER THE HOLD BEGAN WAS OPEN ACROSS IT. The timer runs only after the work has ended, and a
 * request that held the thread has usually sent its answer and closed by then. On 10 October 2026 the line said "No
 * request was open across it" for a 5.0 s hold that was GET /api/sessions/<id> making its answer. So the server hands
 * this the requests that closed in the last `remembersClosedFor` milliseconds as well, with when each made its answer
 * and when it closed, and a request whose answer was made after the hold began was making it across the hold.
 *
 * A LONG-LIVED STREAM IS NOT A REQUEST MAKING ITS ANSWER. GET /api/events and the terminal's stream are held open
 * on purpose (their route says `waits: true`), so they are never "answer made", and on 10 October every hold line
 * named the waiters' streams, open 7,000 s and more, as the work. They are counted apart and named nowhere else.
 *
 * EVERY TIMER THE SERVER STARTS IS NAMED (lib/named-timers.ts), and the line names each named run that overlapped
 * the hold, with how long it ran. When none did, the line says so.
 *
 * A WORKER asks the main thread's in-process inspector for a stack when its heartbeat is late. This opens no inspector
 * port and adds no --inspect flag. A line names a stack only when it was captured during the hold, before the heartbeat
 * moved. If no such stack arrived, the line says the function is not known.
 */

import { monitorEventLoopDelay } from 'node:perf_hooks'
import { localStamp } from '../../shared/time.ts'
import type { RuntimeLoopStall, RuntimeLoopWatch, RuntimeStallRequest } from '../../shared/runtime.ts'
import { type ANamedRun, theNamedRunsAcross } from './named-timers.ts'
import { aProbeOfTheMainThread, theSampleDuring } from './a-probe-of-the-main-thread.ts'

/** One request open when the hold ended, or closed a short while before. */
export interface OpenAtTheHold {
  method: string
  url: string
  /** The registered route, read only when the watch makes its line; null when none matched. */
  route: string | null
  project: string
  /** When the request arrived, from `performance.now()`. */
  startedAt: number
  /** When its handler had returned and its answer was serialised, from `performance.now()`; null while it is not. */
  answerMadeAt: number | null
  /** When it closed, from `performance.now()`; null while it is open. */
  closedAt: number | null
  /** True for a stream held open on purpose (its route says `waits: true`): it waits, and makes no answer. */
  stream: boolean
}

export interface LoopWatch {
  stop: () => void
}

const watches = new Map<symbol, { since: string; heldOverMs: number }>()
let lastStall: RuntimeLoopStall | null = null

/** The process has one thread. Whichever watch saw the last stall writes it here. */
export function theLoopWatchNow(): RuntimeLoopWatch {
  const active = watches.values().next().value
  return active === undefined
    ? { watching: false, since: null, heldOverMs: null, lastStall }
    : { watching: true, ...active, lastStall }
}

/** Nothing can arrive while the thread is held; a request closed before it began was not across it. */
function acrossTheHold(heldMs: number, endedAt: number, open: readonly OpenAtTheHold[]): OpenAtTheHold[] {
  const began = endedAt - heldMs
  return open.filter((one) => one.startedAt <= began && (one.closedAt === null || one.closedAt >= began))
}

function requestAtTheHold(one: OpenAtTheHold, endedAt: number): RuntimeStallRequest {
  return {
    method: one.method,
    url: one.url,
    route: one.route,
    project: one.project,
    startedAt: localStamp(new Date(performance.timeOrigin + one.startedAt)),
    durationMs: (one.closedAt ?? endedAt) - one.startedAt,
  }
}

/** How the line reads. Exported so the test reads the same sentence the server writes. */
export function sayTheHold(
  heldMs: number,
  endedAt: number,
  open: readonly OpenAtTheHold[],
  runs: readonly ANamedRun[] = [],
  remembersClosedFor: number | null = null,
  frames: readonly string[] = [],
): string {
  const began = endedAt - heldMs
  const before = acrossTheHold(heldMs, endedAt, open)
  const streams = before.filter((one) => one.stream).length
  const across = before.filter((one) => !one.stream)
  const inside = across.filter((one) => one.answerMadeAt === null || one.answerMadeAt >= began)
  const into = (at: number): string => `${((at - began) / 1000).toFixed(1)} s into the hold`
  const state = (one: OpenAtTheHold): string =>
    one.closedAt !== null
      ? `answered and closed ${into(one.closedAt)}`
      : one.answerMadeAt === null
        ? 'still making its answer'
        : one.answerMadeAt >= began
          ? `its answer made ${into(one.answerMadeAt)}`
          : 'its answer made'
  const named = (one: OpenAtTheHold): string => {
    const request = requestAtTheHold(one, endedAt)
    const route = request.route === null ? 'no route matched' : `route ${request.route}`
    return `${request.method} ${request.url} (${route}, started ${request.startedAt}, project ${request.project}, open ${(request.durationMs / 1000).toFixed(1)} s, ${state(one)})`
  }
  const who =
    across.length === 0
      ? "No request was open across it, so the work was not a request's."
      : inside.length === 0
        ? `No request was making its answer, so the work was not a request's. Open across it: ${across.map(named).join('; ')}.`
        : `Making an answer across it: ${inside.map(named).join('; ')}.` +
          (across.length > inside.length
            ? ` Also open, answer made: ${across.filter((one) => !inside.includes(one)).map(named).join('; ')}.`
            : '')
  // A REQUEST THAT CLOSED LONGER AGO THAN THE SERVER REMEMBERS CANNOT BE NAMED, and a hold that long may have had one.
  const forgotten =
    remembersClosedFor !== null && heldMs > remembersClosedFor
      ? ` A request that closed more than ${(remembersClosedFor / 1000).toFixed(0)} s before this line is not remembered, so one that closed early in the hold may be missing.`
      : ''
  const waiting =
    streams === 0
      ? ''
      : ` ${String(streams)} ${streams === 1 ? 'stream was' : 'streams were'} held open, waiting, and ${streams === 1 ? 'is' : 'are'} not counted.`
  const timers =
    runs.length === 0
      ? ' No named timer ran in it.'
      : ` Timers that ran in it: ${runs.map((one) => `"${one.name}" (${String(Math.round(one.endedAt - one.startedAt))} ms)`).join('; ')}.`
  return (
    `the server was held for at least ${(heldMs / 1000).toFixed(1)} s and answered nobody. ${who}${forgotten}${waiting}${timers} ` +
    (frames.length === 0
      ? 'Which function held it is not known: the thread cannot read its own stack while it is busy.'
      : `Functions on the thread during the hold: ${frames.join(' → ')}.`)
  )
}

/** Start the watch. The timer is unref'd, so it never holds the process open. */
export function watchTheLoop(input: {
  every: number
  heldOver: number
  open: () => readonly OpenAtTheHold[]
  log: (line: string) => void
  /** How long the server remembers a closed request for `open`, so the line can say what it cannot see. */
  remembersClosedFor?: number
  /**
   * How long the thread was held, in milliseconds, asked once a tick. Left out, it is the histogram's delay less its
   * sampling step, as in the server. A test gives its own, so that it decides on a reading it chose and not on how long
   * the machine took.
   */
  heldFor?: () => number
}): LoopWatch {
  const resolutionMs = 10
  const histogram = monitorEventLoopDelay({ resolution: resolutionMs })
  histogram.enable()
  const probe = aProbeOfTheMainThread(input.log)
  const key = Symbol()
  watches.set(key, { since: localStamp(new Date()), heldOverMs: input.heldOver })
  let reading: ReturnType<typeof setImmediate> | null = null
  const pendingLines = new Set<ReturnType<typeof setTimeout>>()
  const timer = setInterval(() => {
    const now = performance.now()
    // Both timers can be due after a stall. The check phase follows every timer due in this turn, including node's
    // histogram timer, so its sample is recorded before we read and reset it.
    reading = setImmediate(() => {
      reading = null
      const heldMs = input.heldFor === undefined ? histogram.max / 1_000_000 - resolutionMs : input.heldFor()
      if (heldMs > input.heldOver) {
        const open = input.open()
        const runs = theNamedRunsAcross(now - heldMs, now)
        const write = () => {
          const sample = theSampleDuring(probe.samples, now - heldMs, now)
          const line = sayTheHold(heldMs, now, open, runs, input.remembersClosedFor ?? null, sample?.frames)
          lastStall = {
            line,
            heldMs,
            endedAt: localStamp(new Date(performance.timeOrigin + now)),
            requests: acrossTheHold(heldMs, now, open).filter((one) => !one.stream).map((one) => requestAtTheHold(one, now)),
          }
          input.log(line)
        }
        // Write an available sample at once; otherwise give a worker message a short turn to arrive.
        if (input.heldFor === undefined && theSampleDuring(probe.samples, now - heldMs, now) === undefined) {
          const pending = setTimeout(() => { pendingLines.delete(pending); write() }, 10)
          pending.unref()
          pendingLines.add(pending)
        } else write()
        histogram.reset()
        // After a reset Node needs one sample to start measuring again. A hold that starts within 10 ms of a
        // reported hold is not seen. Keep the baseline on ticks below the threshold, so they leave no such gap.
      }
    })
  }, input.every)
  timer.unref()
  return { stop: () => {
    clearInterval(timer)
    if (reading !== null) clearImmediate(reading)
    for (const pending of pendingLines) clearTimeout(pending)
    histogram.disable()
    probe.stop()
    watches.delete(key)
  } }
}
