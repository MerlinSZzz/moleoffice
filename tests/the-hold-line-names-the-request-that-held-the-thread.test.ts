// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE HOLD LINE NAMES THE REQUEST THAT HELD THE THREAD, EVEN WHEN ITS ANSWER WAS SENT BEFORE THE LINE WAS WRITTEN.
 * Wave 13y round 20, item 5.
 *
 * MEASURED FIRST: on 10 October 2026 the serve log said "No request was open across it" for a 5.0 s hold, and the hold
 * was GET /api/sessions/<id> making its answer. The watch's timer runs only after the work has ended, and by then a
 * request that held the thread has often sent its answer and closed. It was taken off the open list when it closed, so
 * the line could not see it.
 *
 * WHAT THIS HOLDS:
 *   - a server on a free port, asked over HTTP for a route that waits 50 ms and then holds the thread for 1.4 s, writes
 *     a hold line that names that route as the request making its answer;
 *   - `sayTheHold` names a request that closed after the hold began, and does not name one that closed before it.
 *
 * CONTROL: every test passes at the tip. MUTATIONS, each run and each red:
 *   1. the server forgets a request when it closes (src/server/index.ts): the first test's line names no request.
 *   2. `sayTheHold` counts every closed request (src/server/lib/loop-watch.ts): the request closed before is named.
 */
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { AddressInfo } from 'node:net'
import { freshDb, apiApp, type TestDb } from './helpers.ts'
import { sayTheHold, type OpenAtTheHold } from '../src/server/lib/loop-watch.ts'
import { localStamp } from '../src/shared/time.ts'

let db: TestDb
let app: Awaited<ReturnType<typeof apiApp>>['app']
let base = ''

// OUTSIDE /api, so it needs no operation word: the open-request hooks are the root's, and see every route.
const HOLDS = '/test-route-that-holds-the-thread'

beforeAll(async () => {
  db = await freshDb()
  app = (await apiApp()).app
  app.get(HOLDS, async () => {
    // THE REQUEST ARRIVES BEFORE THE HOLD BEGINS. The watch dates a hold from its own last sample, taken every 10 ms
    // while the thread is free. A route that held the thread from the turn it arrived in was named only when that
    // sample came before the request did, and a loaded machine can put it after. Waiting 50 ms on a timer lets
    // samples be taken between the two, whatever the load.
    await new Promise((resolve) => setTimeout(resolve, 50))
    const until = performance.now() + 1_400
    while (performance.now() < until) {
      // held
    }
    return { held: true }
  })
  await app.listen({ host: '127.0.0.1', port: 0 })
  base = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
}, 60000)

afterAll(async () => {
  await app.close()
  db.close()
})

it('names the request that held the thread, though it had answered before the line was written', async () => {
  const lines: string[] = []
  const warn = app.log.warn.bind(app.log)
  app.log.warn = ((line: unknown) => {
    if (typeof line === 'string' && line.startsWith('the server was held')) lines.push(line)
  }) as typeof app.log.warn
  try {
    const reply = await fetch(base + HOLDS, { headers: { 'x-mole-office-workspace': 'default' } })
    await reply.text()
    // THE LINE OF THIS HOLD, the only one of a second or more: the watch writes it on its next tick, which a loaded
    // machine can put after the answer has arrived. A shorter hold of the machine's own may write a line as well.
    await expect.poll(() => ofThisHold(lines).length, { timeout: 10_000 }).toBeGreaterThan(0)
  } finally {
    app.log.warn = warn
  }
  expect(ofThisHold(lines).join('\n')).toContain(`Making an answer across it: GET ${HOLDS}`)
})

function ofThisHold(lines: readonly string[]): string[] {
  return lines.filter((line) => /held for at least [1-9]\d*\.\d s/.test(line))
}

it('a request that closed after the hold began is named, and one that closed before it is not', () => {
  const one = (url: string, startedAt: number, answerMadeAt: number | null, closedAt: number | null): OpenAtTheHold => ({
    method: 'GET',
    url,
    route: null,
    project: 'panelx',
    startedAt,
    answerMadeAt,
    closedAt,
    stream: false,
  })
  // A hold of 5 s that ended at 100 s: it began at 95 s.
  const line = sayTheHold(5_000, 100_000, [
    one('/api/sessions/held', 94_900, 99_990, 99_995),
    one('/api/closed-before', 90_000, 94_000, 94_500),
  ])
  expect(line).toContain(`Making an answer across it: GET /api/sessions/held (no route matched, started ${localStamp(new Date(performance.timeOrigin + 94_900))}, project panelx, open 5.1 s, answered and closed 5.0 s into the hold)`)
  expect(line).not.toContain('/api/closed-before')
})
