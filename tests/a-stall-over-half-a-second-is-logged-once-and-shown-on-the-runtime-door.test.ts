// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A STALL OVER HALF A SECOND IS LOGGED ONCE AND SHOWN ON THE RUNTIME DOOR.
 *
 * A route with a parameter holds the thread for 600 ms on purpose. Asked over HTTP, it leaves exactly one warning
 * that names it, still one 400 ms after the first. The warning names the registered route, the URL, the request's
 * start and its duration. GET /api/runtime carries that same line, the measured delay, its end and the request. A
 * watch that is given a reading of 400 ms writes nothing and leaves the last stall alone. A watch with no stall says
 * when it began; no watch is a different answer.
 *
 * MUTATIONS:
 *   1. Read the histogram in the tick instead of its setImmediate: the recording order may miss the stall.
 *      Three runs are evidence about that rare edge, not a proof.
 *   2. Raise the server's threshold to 1,000 ms: the 600 ms request leaves no warning.
 *   3. The reader always returns null for the last stall: the runtime door loses the warning.
 *   4. Never reset the histogram after a reported hold: the same stall is logged on the following tick as well.
 *   5. Compare the reading with `every` instead of `heldOver`: the 400 ms reading writes a line.
 *   6. Write the last stall before comparing the reading with `heldOver`: a reading below it changes the last stall.
 *   7. Double the measured delay: the hold then begins before the request did, so no line names the request.
 *   8. Add a second to a request's duration: it is longer than the time this file measured around the request.
 *   9. Put the stall's end ten seconds later: it is after the moment this file saw the line.
 *
 * THE 400 MS CASE IS GIVEN ITS READING. It used to hold the thread for 400 ms and let the server's watch measure it,
 * and under the whole suite's load the machine's own delay pushed that over 500 ms (receipt TsGrdzvzVV-1, 23 October
 * 2026). Now the case decides on the stall it causes: its own watch reads 400 ms from the test, not from the clock.
 *
 * NO CASE DECIDES ON HOW LONG THE MACHINE TOOK (round 83). The main suite of 25 October 2026 failed the 400 ms case
 * again, though it was given its reading. The server's own watch met a real stall of 660 ms while the case read the
 * runtime door, and the door then showed that stall instead of the 600 ms one. A case that waited a fixed time could
 * also stop its watch before the watch's first reading, when both came due in the same turn. So:
 *   - a case waits for the reading or the line it needs, and not for a fixed time;
 *   - the server reads its own copy of loop-watch.ts, because freshDb() resets the test's modules before apiApp()
 *     imports the server. A watch this file starts writes the last stall of the file's copy, and that is where its
 *     cases read it. The runtime door shows the server's copy;
 *   - every line the server's watch writes is kept, from just after the server is built to its end. A real stall the
 *     server meets after the 600 ms one is a line among them, and the door's last stall is always the last of them;
 *   - an upper bound on a time is a time this file measured around it, not a figure.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { AddressInfo } from 'node:net'
import { freshDb, apiApp, type TestDb } from './helpers.ts'
import * as loopWatch from '../src/server/lib/loop-watch.ts'
import type { RuntimeRecord } from '../src/shared/runtime.ts'
import { parseStoredStamp } from '../src/shared/time.ts'

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const holdTheThread = (ms: number): void => {
  const until = performance.now() + ms
  while (performance.now() < until) {
    // held on purpose
  }
}

/**
 * Wait until `done()` says yes, and hand back the moment it did. After three seconds, fail and say what did not happen:
 * a test in a file that imports the server has five seconds (tests/how-long-a-test-may-take.ts), and this sentence is
 * clearer than the runner's.
 */
const until = async (what: string, done: () => boolean): Promise<number> => {
  const gaveUpAt = Date.now() + 3_000
  while (!done()) {
    if (Date.now() > gaveUpAt) throw new Error(`Three seconds passed without this: ${what}.`)
    await pause(10)
  }
  return Date.now()
}

it('before any stall, a running watch says null and when it began; no watch says nobody watched', async () => {
  expect(typeof loopWatch.theLoopWatchNow, 'the runtime has one reader for the loop watch').toBe('function')
  expect(loopWatch.theLoopWatchNow()).toEqual({ watching: false, since: null, heldOverMs: null, lastStall: null })
  const before = Date.now()
  let readings = 0
  // GIVEN A READING OF NO HOLD, so a real stall the machine has while this case runs is not a stall this watch sees.
  const watch = loopWatch.watchTheLoop({
    every: 20,
    heldOver: 500,
    open: () => [],
    log: () => undefined,
    heldFor: () => {
      readings += 1
      return 0
    },
  })
  try {
    await until('the watch made its first reading', () => readings > 0)
    const read = loopWatch.theLoopWatchNow()
    expect(read).toMatchObject({ watching: true, heldOverMs: 500, lastStall: null })
    const since = parseStoredStamp(read.since!)!
    expect(since).toBeGreaterThanOrEqual(Math.floor(before / 1000) * 1000)
    expect(since).toBeLessThanOrEqual(Date.now())
  } finally {
    watch.stop()
  }
  expect(loopWatch.theLoopWatchNow()).toEqual({ watching: false, since: null, heldOverMs: null, lastStall: null })
})

describe('the server watches its thread', () => {
  let db: TestDb
  let app: Awaited<ReturnType<typeof apiApp>>['app']
  let base = ''
  let warn: typeof app.log.warn
  let askedAt = 0
  let handlerAt = 0
  let answeredAt = 0
  let seenAt = 0
  let logged = ''
  /** Every line the server's watch wrote, from just after the server was built to its end. */
  const lines: string[] = []
  // Outside /api: the root hooks see every request, and this route needs no operation word.
  const ROUTE = '/test-route-that-stalls-the-loop/:n'
  const URL = '/test-route-that-stalls-the-loop/600?test=one'
  const namesThisRequest = (line: string) => line.includes(`GET ${URL} (`)

  beforeAll(async () => {
    db = await freshDb()
    app = (await apiApp()).app
    warn = app.log.warn.bind(app.log)
    app.log.warn = ((line: unknown) => {
      if (typeof line === 'string' && line.startsWith('the server was held')) lines.push(line)
    }) as typeof app.log.warn
    app.get<{ Params: { n: string } }>(ROUTE, async (request) => {
      handlerAt = Date.now()
      holdTheThread(Number(request.params.n))
      return { held: true }
    })
    await app.listen({ host: '127.0.0.1', port: 0 })
    base = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
    await pause(100)
  }, 60000)

  afterAll(async () => {
    app.log.warn = warn
    await app.close()
    db.close()
  })

  const runtime = async () => {
    const reply = await app.inject({ method: 'GET', url: '/api/runtime' })
    expect(reply.statusCode, reply.body).toBe(200)
    return (reply.json() as RuntimeRecord).loopWatch
  }

  it('a 600 ms stall is logged once, with the registered route, URL, start time and duration', async () => {
    askedAt = Date.now()
    const reply = await fetch(base + URL, { headers: { 'x-mole-office-workspace': 'default' } })
    expect(reply.status).toBe(200)
    await reply.text()
    answeredAt = Date.now()
    seenAt = await until('the server logged the 600 ms stall', () => lines.some(namesThisRequest))
    await pause(400)
    const ours = lines.filter(namesThisRequest)
    expect(ours, 'the 600 ms stall is logged exactly once').toHaveLength(1)
    logged = ours[0]!
    console.info(logged)
    expect(logged).toContain(`Making an answer across it: GET ${URL}`)
    expect(logged).toContain(`route ${ROUTE}`)
    const held = /held for at least (\d+\.\d) s/.exec(logged)
    expect(held, 'the line says how long the thread was held').not.toBeNull()
    expect(Number(held![1])).toBeGreaterThanOrEqual(0.5)
    const open = /open (\d+\.\d) s/.exec(logged)
    expect(open, 'the line says how long the request was open').not.toBeNull()
    expect(Number(open![1])).toBeGreaterThanOrEqual(0.6)
    const start = /started (\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})/.exec(logged)
    expect(start, 'the line names the request start as an office moment').not.toBeNull()
    const ms = parseStoredStamp(start![1]!)!
    expect(ms).toBeGreaterThanOrEqual(Math.floor(askedAt / 1000) * 1000)
    expect(ms).toBeLessThanOrEqual(handlerAt)
  })

  it('GET /api/runtime shows that stall and its request', async () => {
    const read = await runtime()
    expect(read, 'the runtime door shows the loop watch').toMatchObject({ watching: true, heldOverMs: 500 })
    expect(read.lastStall, 'the runtime door keeps the last stall').not.toBeNull()
    const stall = read.lastStall!
    expect(stall.line, 'the door shows the last stall the server logged').toBe(lines.at(-1))
    // A REAL STALL THE SERVER MET AFTER THE 600 MS ONE is the last stall now, and the line above has shown it is the
    // last line logged. Nothing is left to read about the 600 ms stall on the door.
    if (stall.line !== logged) return
    expect(stall.heldMs).toBeGreaterThanOrEqual(590)
    expect(logged).toContain(`held for at least ${(stall.heldMs / 1000).toFixed(1)} s`)
    // The thread was held after this file asked and before it saw the line, so the delay fits between the two.
    expect(stall.heldMs).toBeLessThanOrEqual(seenAt - askedAt)
    const ended = parseStoredStamp(stall.endedAt)!
    expect(ended).toBeGreaterThanOrEqual(Math.floor(handlerAt / 1000) * 1000)
    expect(ended).toBeLessThanOrEqual(seenAt)
    expect(stall.requests).toHaveLength(1)
    const request = stall.requests[0]!
    expect(request).toMatchObject({ method: 'GET', url: URL, route: ROUTE, project: 'default' })
    expect(logged).toContain(`started ${request.startedAt}`)
    expect(request.durationMs).toBeGreaterThanOrEqual(600)
    // The request was open inside the time this file waited for it; the 1 ms is the clock's whole milliseconds.
    expect(request.durationMs).toBeLessThanOrEqual(answeredAt - askedAt + 1)
    expect(logged).toContain(`open ${(request.durationMs / 1000).toFixed(1)} s`)
  })

  it('a reading of 400 ms writes nothing and leaves the last stall alone', async () => {
    // A WATCH OF ITS OWN, WITH THE SERVER'S THRESHOLD, GIVEN ITS READING: the decision is on the 400 ms this case
    // causes, not on how long the machine took to run a 400 ms hold. The case stops the watch only after its first
    // reading, and the watch has decided on that reading by the time the case reads the count.
    const lastStall = loopWatch.theLoopWatchNow().lastStall
    const written: string[] = []
    let readings = 0
    const watch = loopWatch.watchTheLoop({
      every: 20,
      heldOver: 500,
      open: () => [],
      log: (line) => written.push(line),
      heldFor: () => {
        readings += 1
        return 400
      },
    })
    try {
      await until('the watch made its first reading', () => readings > 0)
    } finally {
      watch.stop()
    }
    expect(written, 'a stall below 500 ms writes no line').toEqual([])
    expect(loopWatch.theLoopWatchNow().lastStall, 'a stall below 500 ms leaves the last stall alone').toEqual(lastStall)
  })
})
