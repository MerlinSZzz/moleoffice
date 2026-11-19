// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE WINDOW PROBE ASKS AGAIN AFTER AN ASK THAT HANGS (wave 13t, round 16).
 *
 * Round 15's container run failed "the check page drawn in the dark look" in Chinese, in two runs. The
 * pictures show the page drew. The window logs show the GPU process exiting just after a picture, and the
 * probe's next ask then got no answer for 30 seconds. That was the whole wait, so it never asked again.
 * tests/installed/ask-until.mjs gives each ask a limit of its own, and the driver's untilDrawn uses it.
 *
 *   1. An ask that hangs is counted, and the next ask is answered and found right, inside the wait.
 *   2. Asks that never answer end at the wait, each counted, with the last one named as unanswered.
 *   3. A limit on each ask as long as the whole wait is refused, because that is round 15's fault again.
 *   4. The driver's untilDrawn asks through askUntil with 5 seconds an ask (read from its source: the
 *      driver runs as soon as it is imported, against a window, so this is the one way to read it here).
 *
 * MUTATIONS, each run on 4 October 2026:
 *   - each ask's timer waits for the whole wait instead of eachAskMs: red, cases 1 and 2;
 *   - the late answer resolves its own promise again, as first written: red, cases 1 and 2;
 *   - untilDrawn goes back to its own loop: red, case 4.
 *   - (round 18) the driver imports only aPlainEnvironment from ask-until.mjs, and not askUntil: red, case 4.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import { expect, it } from 'vitest'

import { askUntil } from './installed/ask-until.mjs'

const DRIVER = fileURLToPath(new URL('./installed/drive-the-window.mjs', import.meta.url))
const never = <T>(): Promise<T> => new Promise<T>(() => undefined)

it('counts an ask that hangs and asks again, and the next answer is found right inside the wait', async () => {
  let calls = 0
  const started = Date.now()
  const asked = await askUntil({
    ask: () => (++calls === 1 ? never<string>() : Promise.resolve('drawn')),
    right: (answer) => answer === 'drawn',
    waitMs: 3_000,
    eachAskMs: 300,
    betweenMs: 10,
  })
  expect(asked).toEqual({ right: true, last: 'drawn', unanswered: 1, asked: 2 })
  expect(Date.now() - started).toBeLessThan(2_000)
})

it('ends at the wait when no ask is answered, and counts each one', async () => {
  const asked = await askUntil({ ask: () => never<string>(), right: () => true, waitMs: 1_000, eachAskMs: 200, betweenMs: 10 })
  expect(asked.right).toBe(false)
  expect(asked.unanswered).toBeGreaterThanOrEqual(3)
  expect(asked.unanswered).toBe(asked.asked)
  expect(asked.last).toEqual({ error: 'no answer within 200 ms' })
})

it('refuses a limit on each ask that is as long as the whole wait', async () => {
  await expect(askUntil({ ask: () => Promise.resolve(1), right: () => true, waitMs: 1_000, eachAskMs: 1_000 })).rejects.toThrow(/must be shorter than the whole wait/)
})

it("asks through askUntil in the driver's untilDrawn, with 5 seconds an ask", () => {
  const text = readFileSync(DRIVER, 'utf8')
  const start = text.indexOf('async function untilDrawn(')
  expect(start).toBeGreaterThan(-1)
  const body = text.slice(start, text.indexOf('\n}\n', start))
  expect(body).toContain('await askUntil({')
  expect(body).toContain('eachAskMs: 5_000')
  // The driver imports aPlainEnvironment from the same file since round 18, so askUntil is one name of those imported.
  expect(text).toMatch(/^import \{[^}]*\baskUntil\b[^}]*\} from '\.\/ask-until\.mjs'$/m)
})
