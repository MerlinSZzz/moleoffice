// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WAVE 13Y ROUND 43: EVERY BROWSER THE REVIEW OPENS READS ONE FIXED INSTANT.
 *
 * Two reviews of the same code are compared picture by picture, and every picture that differs is
 * classified. The "runtime" class is a value that depends on when the review ran. An age label is
 * the main one: `relativeTime` in src/web/components/ui.tsx rounds an age under a day to the
 * nearest hour, so a label turns at the half hour, and a pair that crossed one had different
 * labels for the same seeded stamp (wave 13y round 42, the runtime class of its pair).
 *
 * The fix is a browser clock fixed at one instant. The instant is the reset's own midnight plus
 * sixteen hours. The reset prints the instant its clock reads while it seeds, and the review tool
 * reads that one line back rather than working the midnight out a second way. Sixteen hours is
 * far from every half-hour turn for the length of one review: measured on the seed of
 * 19 October 2026, no seeded age label changes between 16:00 and 16:25, and a review takes about
 * twelve minutes.
 *
 * WHAT THIS TEST HOLDS.
 *  1. The instant is the reset's midnight plus sixteen hours, worked out from the reset's own
 *     output line and nothing else. Output whose line cannot be read is refused, not guessed at.
 *  2. A page in a context made by the review's own context function reads that instant, not the
 *     machine's real clock, whatever the machine's real time is.
 *  3. Time still flows in that page: a `setTimeout` fires, a `requestAnimationFrame` fires, and
 *     `performance.now()` advances between two readings. A clock that never moves would leave a
 *     page and the review's settle wait hanging.
 *
 * IT IS RED ON THE OLD CODE. The old review has no fixed-clock function to export and installs no
 * clock, so its page reads the machine's real time -- years away from the chosen instant -- and
 * the "reads the fixed instant" expectation fails.
 */
import { once } from 'node:events'
import { createServer, type Server } from 'node:http'
import { chromium, type Browser } from 'playwright'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { reviewContext, theFixedBrowserInstant } from '../tools/review.mjs'

const viewport = { width: 400, height: 300 }
const SIXTEEN_HOURS_MS = 16 * 60 * 60 * 1000
let server: Server
let browser: Browser
let site: string

beforeAll(async () => {
  server = createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'text/html' })
    response.end('<!doctype html><html><body><p>a page the review clock criterion reads</p></body></html>')
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('The fixture has no loopback port.')
  site = `http://127.0.0.1:${address.port}`
  browser = await chromium.launch()
})

afterAll(async () => {
  await browser?.close()
  server?.closeAllConnections()
  server?.close()
})

/** The line scripts/reset.ts prints for the midnight its clock reads, for a midnight this test chooses. */
function theResetsLine(midnight: Date): string {
  return `reset: ids are made in turn, and the clock reads ${midnight.toString()} until the seed and first-start records are done`
}

/**
 * A midnight far from any real run of this test, so a page reading the machine's real clock cannot
 * accidentally read something within a minute of the fixed instant.
 */
function aChosenMidnight(): Date {
  const midnight = new Date(2001, 0, 1)
  midnight.setHours(0, 0, 0, 0)
  return midnight
}

/** Reject rather than wait out a page whose clock never moves. */
async function within<T>(ms: number, what: string, work: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`${what} — a page must not hang on a stopped clock`)), ms)
  })
  try {
    return await Promise.race([work, deadline])
  } finally {
    clearTimeout(timer)
  }
}

it('works the instant out from the reset output alone: that midnight plus sixteen hours', () => {
  const midnight = aChosenMidnight()
  const instant = theFixedBrowserInstant(`an earlier line\n${theResetsLine(midnight)}\na later line`)
  expect(instant).toBe(midnight.getTime() + SIXTEEN_HOURS_MS)
})

it('refuses reset output whose clock line cannot be read, rather than inventing an instant', () => {
  expect(() => theFixedBrowserInstant('reset: done — fresh database at /tmp/one.db\n')).toThrow(
    /reset's output does not say what its clock read/,
  )
})

it('a review context reads the fixed instant, and timers, frames and performance.now() still advance', async () => {
  const midnight = aChosenMidnight()
  const instant = theFixedBrowserInstant(theResetsLine(midnight))
  const context = await reviewContext(browser, viewport, 'light', 1, instant)
  try {
    const page = await context.newPage()
    await page.goto(site)
    const read = await page.evaluate(() => Date.now())
    const onTheMachine = Date.now()
    expect(read - instant, `the page read ${read}, which is not the fixed instant ${instant}`).toBeLessThan(60_000)
    expect(read).toBeGreaterThanOrEqual(instant)
    expect(
      Math.abs(read - onTheMachine),
      'the page read the machine\'s real clock instead of the fixed instant',
    ).toBeGreaterThan(60_000)

    const moved = await within(
      5_000,
      'setTimeout, requestAnimationFrame and performance.now() did not all advance',
      page.evaluate(async () => {
        const first = Date.now()
        const beforePerformance = performance.now()
        const afterTimer = await new Promise<number>((resolve) => setTimeout(() => resolve(Date.now()), 50))
        const afterFrame = await new Promise<number>((resolve) => requestAnimationFrame(() => resolve(Date.now())))
        return { first, afterTimer, afterFrame, beforePerformance, afterPerformance: performance.now() }
      }),
    )
    expect(moved.afterTimer, 'the setTimeout did not fire').toBeGreaterThan(moved.first)
    expect(moved.afterFrame, 'the requestAnimationFrame did not fire').toBeGreaterThanOrEqual(moved.afterTimer)
    expect(moved.afterPerformance, 'performance.now() did not advance').toBeGreaterThan(moved.beforePerformance)
  } finally {
    await context.close()
  }
}, 30_000)
