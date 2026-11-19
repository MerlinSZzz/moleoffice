// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A NAMED TIMER'S LONG RUN IS A LINE IN THE LOG, AND THE HOLD LINE NAMES THE TIMERS AND LEAVES THE STREAMS OUT.
 * Wave 13y round 16, item 1.
 *
 * MEASURED FIRST: between 01:31 and 05:11 on 10 October 2026 the serve log had 308 hold lines, most of them 60 to 64 s
 * apart. Every one named only the waiters' streams (GET /api/events, open 7,000 s and more, "still making its answer")
 * and none could say whose the work was.
 *
 * WHAT THIS HOLDS:
 *   - `runNamed` writes one line, with the timer's name and time, for a run over 250 ms, and none for a shorter one;
 *     it passes on what the work returns or throws, and says when a run was counted only until its first wait;
 *   - the loop watch's line names every named run that overlapped the hold, including one that began just before it;
 *   - a stream held open on purpose is counted apart and never named as a request making its answer.
 *
 * CONTROL: every test passes at the tip. MUTATIONS, each run and each red:
 *   1. `A_LONG_RUN_MS` raised from 250 to 2,500 (src/server/lib/named-timers.ts): the 300 ms run writes no line.
 *   2. `theNamedRunsAcross` keeps only runs that started inside the window: the run that began before it is missed.
 *   3. `sayTheHold` stops leaving the streams out (src/server/lib/loop-watch.ts): the stream is named.
 *   5. (round 19) the second line counts the collections that began after the run, not inside it: it says 0 times.
 *   6. (13 November 2026) the hold line doubles a run's time (loop-watch.ts): the watch case's run is longer than the
 *      time measured around it.
 *   7. (13 November 2026) the long-run line doubles its time (named-timers.ts): the first case's run is longer than the
 *      time measured around it.
 *   8. (13 November 2026) the watch hands its line no runs: the watch case finds no timer named.
 */
import { beforeEach, expect, it } from 'vitest'
import { A_LONG_RUN_MS, THE_COLLECTOR_REPORTS_WITHIN_MS, forgetTheNamedRuns, named, runNamed, sayTheLongRun, theNamedRunsAcross } from '../src/server/lib/named-timers.ts'
import { sayTheHold, watchTheLoop, type OpenAtTheHold } from '../src/server/lib/loop-watch.ts'

const holdTheThread = (ms: number): void => {
  const until = performance.now() + ms
  while (performance.now() < until) {
    // held
  }
}

beforeEach(() => forgetTheNamedRuns())

it('a run over 250 ms is one line with its name and time, and a short run is none', () => {
  expect(A_LONG_RUN_MS).toBe(250)
  const lines: string[] = []
  const before = performance.now()
  const answer = runNamed('the test timer', (line) => lines.push(line), () => {
    holdTheThread(300)
    return 'its answer'
  })
  // THE UPPER BOUND IS THE TIME MEASURED AROUND THE RUN, not 499 ms: a loaded machine can interrupt the hold for longer.
  const around = performance.now() - before
  expect(answer, 'what the work returns is passed on').toBe('its answer')
  expect(lines).toHaveLength(1)
  const held = /^the timer "the test timer" held the server for (\d+) ms\.$/.exec(lines[0]!)
  expect(held, lines[0]).not.toBeNull()
  expect(Number(held![1])).toBeGreaterThanOrEqual(300)
  expect(Number(held![1])).toBeLessThanOrEqual(Math.ceil(around))

  named('the short timer', (line) => lines.push(line), () => undefined)()
  expect(lines, 'a short run writes nothing').toHaveLength(1)

  expect(() => runNamed('the failing timer', (line) => lines.push(line), () => {
    throw new Error('the test fault')
  })).toThrow('the test fault')
  expect(theNamedRunsAcross(0, performance.now()).map((one) => one.name)).toEqual(['the test timer', 'the short timer', 'the failing timer'])

  expect(sayTheLongRun('the async timer', 400, true)).toBe(
    'the timer "the async timer" held the server for 400 ms, counted until its first wait; what it does after that is not in this time.',
  )
})

it('a long run gets a second line, a moment later, with the collector’s time inside it and the heap at its end', async () => {
  const lines: string[] = []
  runNamed('the allocating timer', (line) => lines.push(line), () => {
    // GARBAGE ENOUGH THAT THE COLLECTOR RUNS INSIDE THE RUN, for at least 300 ms.
    const until = performance.now() + 300
    let kept: { at: number; text: string }[] = []
    while (performance.now() < until) {
      for (let i = 0; i < 10_000; i += 1) kept.push({ at: i, text: `x${String(i)}` })
      if (kept.length > 200_000) kept = []
    }
  })
  expect(lines, 'the second line was written before the collector could report').toHaveLength(1)
  await new Promise((resolve) => setTimeout(resolve, THE_COLLECTOR_REPORTS_WITHIN_MS + 50))
  expect(lines).toHaveLength(2)
  expect(lines[1]).toMatch(
    /^the timer "the allocating timer"'s run of \d+ ms: the garbage collector ran [1-9]\d* times inside it, for \d+ ms in all, as reported within 100 ms after the run; the heap in use at its end was \d+ MB\.$/,
  )
})

it('the runs kept are those that overlapped the window, including one that began before it', () => {
  const lines: string[] = []
  runNamed('the early timer', () => undefined, () => undefined)
  const windowOpens = performance.now() + 1
  holdTheThread(2)
  runNamed('the timer across the start', (line) => lines.push(line), () => holdTheThread(20))
  const across = theNamedRunsAcross(windowOpens + 10, performance.now())
  expect(across.map((one) => one.name)).toEqual(['the timer across the start'])
})

const anOpen = (url: string, startedAt: number, answerMade: boolean, stream: boolean): OpenAtTheHold => ({
  method: 'GET',
  url,
  route: null,
  project: 'panelx',
  startedAt,
  // A MADE ANSWER WAS MADE AS IT ARRIVED, before any hold these cases draw.
  answerMadeAt: answerMade ? startedAt : null,
  closedAt: null,
  stream,
})

it('the hold line counts the streams apart and names the timers that ran in it', () => {
  const line = sayTheHold(
    2_000,
    100_000,
    [anOpen('/api/events?tag=hold-the-handle-test', 1_000, false, true), anOpen('/api/plan-graph', 97_000, false, false)],
    [{ name: 'the presence clock', startedAt: 97_950, endedAt: 100_000 }],
  )
  expect(line, 'a stream is not a request making its answer').not.toContain('/api/events')
  expect(line).toContain('1 stream was held open, waiting, and is not counted.')
  expect(line).toContain('Making an answer across it: GET /api/plan-graph')
  expect(line).toContain('Timers that ran in it: "the presence clock" (2050 ms).')

  const onlyStreams = sayTheHold(2_000, 100_000, [anOpen('/api/events', 1_000, false, true), anOpen('/api/events', 2_000, false, true)])
  expect(onlyStreams).toContain("No request was open across it, so the work was not a request's.")
  expect(onlyStreams).toContain('2 streams were held open, waiting, and are not counted.')
  expect(onlyStreams).toContain('No named timer ran in it.')
})

// THE WATCH IS GIVEN ITS READING. This case used to let node's histogram measure the hold, wait a fixed 60 ms, and ask
// for exactly one line naming a run of 6xx ms. In the whole suite on 13 November 2026 it went red, and it was green
// alone. On a loaded machine each of those can fail with nothing wrong: the machine's own stalls are readings too, the
// line may come after 60 ms, and a hold the scheduler interrupts can last 700 ms or more.
// tests/a-stall-over-half-a-second-is-logged-once-and-shown-on-the-runtime-door.test.ts holds the histogram
// reading against a real stall. Here the watch reads only the hold this case made, from its start, so it writes one
// line; the case waits for that line, and the run's time is bounded by the time measured around it.
it('the watch names a named timer that held the thread', async () => {
  const lines: string[] = []
  let began: number | null = null
  let ended = false
  let readTheHold = false
  const watch = watchTheLoop({
    every: 20,
    heldOver: 300,
    open: () => [],
    log: (line) => lines.push(line),
    heldFor: () => {
      if (began === null || !ended || readTheHold) return 0
      readTheHold = true
      return performance.now() - began
    },
  })
  try {
    const before = performance.now()
    await new Promise<void>((resolve) => {
      setTimeout(
        named('the holding timer', () => undefined, () => {
          began = performance.now()
          holdTheThread(600)
          ended = true
          resolve()
        }),
        0,
      )
    })
    const around = performance.now() - before
    const gaveUpAt = performance.now() + 3_000
    while (lines.length === 0 && performance.now() < gaveUpAt) await new Promise((resolve) => setTimeout(resolve, 10))
    expect(lines, 'the watch wrote one line for the hold').toHaveLength(1)
    const ran = /Timers that ran in it: "the holding timer" \((\d+) ms\)\./.exec(lines[0]!)
    expect(ran, lines[0]).not.toBeNull()
    expect(Number(ran![1])).toBeGreaterThanOrEqual(600)
    expect(Number(ran![1])).toBeLessThanOrEqual(Math.ceil(around))
  } finally {
    watch.stop()
  }
})
