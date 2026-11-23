// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE HOLD LINE NAMES A REQUEST THAT ARRIVED INSIDE THE MEASURED HOLD AND THEN HELD THE THREAD.
 *
 * The watch dates a hold from its own last sample of the event-loop delay, so the hold's measured start is the
 * earliest the work can have begun, not the moment it did. Other work between that sample and a request's arrival
 * (another request's handler, a garbage collection, the process waiting for the processor on a loaded machine) puts
 * the arrival after the measured start. The request that then held the thread was left out of the line, which named
 * no request or a shorter one.
 *
 * WHAT THIS HOLDS:
 *   - `sayTheHold` names, as making its answer across the hold, a request that arrived after the hold's measured start
 *     and before its end;
 *   - it does not name a request that arrived after the hold ended.
 */
import { expect, it } from 'vitest'
import { sayTheHold, type OpenAtTheHold } from '../src/server/lib/loop-watch.ts'

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

it('a request that arrived inside the hold and made its answer there is named, and one that arrived after the hold is not', () => {
  // A hold of 1.5 s that ended at 100 s: its measured start is 98.5 s. The first request arrived 30 ms after that,
  // held the thread until its answer was made at 99.99 s, and closed. The second arrived after the hold ended.
  const line = sayTheHold(1_500, 100_000, [
    one('/api/arrived-inside', 98_530, 99_990, 99_995),
    one('/api/arrived-after-the-end', 100_010, null, null),
  ])
  expect(line).toContain('Making an answer across it: GET /api/arrived-inside')
  expect(line, 'a request that arrived after the hold ended was not open across it').not.toContain('/api/arrived-after-the-end')
})
