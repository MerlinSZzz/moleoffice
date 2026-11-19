// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A COMMENT CIRCLE STAYS INSIDE THE PAGE WHILE A NARROWED WINDOW WAITS TO PLACE IT AGAIN. Wave 13y round 123.
 *
 * WHAT WAS WRONG. A comment circle stands where the page last measured it, in pixels. On the organising page (a report,
 * with the review column open on a review of it) the circle beside the report stood with its right edge far past 390
 * at 1440 wide. When the window narrowed to 390, the circle kept that place until the next measurement moved it, so for
 * that moment the page was as wide as the circle's old right edge and scrolled sideways. Without load the measurement
 * came within two animation frames. Under load two frames were not enough, and a test that read the page then was red.
 *
 * WHAT THIS FILE HOLDS, in Chromium, on a test office of its own. The page is opened at 1440, and the case first asks
 * that the circle's right edge is past 390 there, so the narrowing could put it outside the page. Then the page's
 * animation frames are held back, so the circle cannot be measured again at all, which is the longest any load can make
 * the wait. The window narrows to 390, and while the page's own mark still says the circles are being measured:
 *   - the page is no wider than the window, so it does not scroll sideways;
 *   - the circle's right edge is inside the window.
 * Then the frames are let go, the page says its circles are placed, and the circle stands inside the page's column.
 *
 * WHY FRAMES HELD BACK AND NOT A SLOWER COMPUTER. Holding the frames back gives the same answer on an idle machine and a
 * busy one, and it loads nothing. The same narrowing under Chromium's own CPU slowdown was measured once instead, for
 * the round's report, because a slowed page's timing can change in a busy queue.
 *
 * Everything in it is made up by this test, in a database of its own.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { CIRCLES_ATTRIBUTE } from '../src/web/components/agent/CommentCircle.tsx'

const WIDE = 1440
const NARROW = 390
const HEIGHT = 1000

let app: LiveApp

async function post(path: string, body: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(`${app.api}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`POST ${path} answered ${String(res.status)}: ${await res.text()}`)
  return (await res.json()) as Record<string, unknown>
}

beforeAll(async () => {
  app = await liveApp({ name: 'circle-narrowed', viewport: { width: WIDE, height: HEIGHT } })

  // A REPORT WITH TWO COMMENTS ON IT, IN A REVIEW WHOSE COLLECTING HAS FINISHED: what the organising page draws.
  const made = (await post('/api/records', {
    kind: 'report',
    title: 'The bracket trials, for a circle in a narrowed window',
    summary: 'A made-up report whose comment circle is measured after the window narrows.',
    data: { date: '2026-11-02', blocks: [{ id: 'b-1', type: 'text', text: 'Three printed brackets were loaded until they cracked.' }] },
  })) as { record: { id: string } }
  const reportId = made.record.id
  const started = (await post('/api/reviews', {
    entry: { target: { kind: 'record', recordId: reportId, workspaceId: 'default' } },
  })) as { review: { id: string } }
  for (const body of ['The second bracket has no load written down.', 'Which printer made the third bracket?']) {
    await post('/api/records', {
      kind: 'annotation',
      title: body,
      data: { body, context: { target: { kind: 'record', recordId: reportId, workspaceId: 'default' } } },
    })
  }
  await post(`/api/reviews/${started.review.id}/finish-collecting`, {})

  // THE ORGANISING PAGE, reached by pressing, as a person reaches it: the report, the review column, then the review.
  const page = app.page
  await page.goto(`${app.site}/#/r/${reportId}`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.locator('.px-review-switch').waitFor({ timeout: 30_000 })
  await page.evaluate(() => window.localStorage.removeItem('mole-office.review'))
  await page.reload({ timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.locator('.px-review-switch').click()
  await page.locator('.px-pane-list .px-rev-go').first().waitFor({ timeout: 30_000 })
  await page.locator('.px-pane-list .px-rev-go').first().click()
  await page.waitForSelector('.px-org', { timeout: 30_000 })
  await page.locator('.px-comment-circle').first().waitFor({ timeout: 30_000 })
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

/**
 * Wait until the page says its circles stand where they go. Polled on a clock and not on animation frames, because
 * the case below holds the page's frames back and a wait polled on them would never ask again.
 */
async function placed(): Promise<void> {
  await app.page.waitForFunction((name) => document.documentElement.getAttribute(name) === 'placed', CIRCLES_ATTRIBUTE, {
    polling: 50,
    timeout: 30_000,
  })
}

interface Reading {
  /** The page's own mark: waiting, measuring or placed. */
  mark: string | null
  /** How wide the window is, as the page sees it. */
  window: number
  /** How wide the document is, and how wide the part of it the window shows. More of the first is a sideways scroll. */
  scroll: number
  client: number
  /** The right edge of the circle furthest to the right, and how many circles there are. */
  circleRight: number
  circles: number
  /** The right edge of the page's column, which a placed circle stays inside. */
  columnRight: number
}

async function read(): Promise<Reading> {
  return app.page.evaluate((name) => {
    const circles = [...document.querySelectorAll('.px-comment-circle')]
    const column = document.querySelector('main.page')
    return {
      mark: document.documentElement.getAttribute(name),
      window: window.innerWidth,
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
      circleRight: Math.max(...circles.map((one) => one.getBoundingClientRect().right)),
      circles: circles.length,
      columnRight: column === null ? Number.NaN : column.getBoundingClientRect().right,
    }
  }, CIRCLES_ATTRIBUTE)
}

describe('a comment circle on the organising page, when the window narrows', () => {
  it(`stays inside the page at ${String(NARROW)} before it is placed again, with the frames held back`, async () => {
    const page = app.page
    await page.setViewportSize({ width: WIDE, height: HEIGHT })
    await placed()
    const wide = await read()
    expect(wide.circles, 'no circle is drawn, so this measured nothing').toBeGreaterThan(0)
    expect(wide.circleRight, `at ${String(WIDE)} the circle stands inside ${String(NARROW)}, so narrowing tests nothing`).toBeGreaterThan(NARROW)

    // THE FRAMES ARE HELD BACK. Every animation frame the page asks for from here is kept in a list and not run, so
    // the circle is not measured again until the list is let go below.
    await page.evaluate(() => {
      const held: FrameRequestCallback[] = []
      const real = window.requestAnimationFrame
      const kept = window as unknown as { HELD_FRAMES: FrameRequestCallback[]; REAL_FRAME: typeof requestAnimationFrame }
      kept.HELD_FRAMES = held
      kept.REAL_FRAME = real
      window.requestAnimationFrame = (callback) => {
        held.push(callback)
        return 1_000_000 + held.length
      }
    })
    try {
      await page.setViewportSize({ width: NARROW, height: HEIGHT })
      // THE PAGE HAS SEEN THE NARROWING: its window is 390 wide and it has asked for a measurement it cannot make.
      await page.waitForFunction(
        ({ name, width }) => window.innerWidth === width && document.documentElement.getAttribute(name) === 'measuring',
        { name: CIRCLES_ATTRIBUTE, width: NARROW },
        { polling: 50, timeout: 30_000 },
      )
      const waiting = await read()
      expect(waiting.mark, 'the circles were placed again, so this read the page after the moment it is about').toBe('measuring')
      expect(waiting.window).toBe(NARROW)
      expect(waiting.scroll, `the page scrolls sideways at ${String(NARROW)} while the circle waits to be placed again`).toBeLessThanOrEqual(waiting.client)
      expect(waiting.circleRight, 'the circle stands past the right edge of the window').toBeLessThanOrEqual(waiting.client)
    } finally {
      // THE FRAMES ARE LET GO, the ones held first, so the measurement the page asked for runs.
      await page.evaluate(() => {
        const kept = window as unknown as { HELD_FRAMES: FrameRequestCallback[]; REAL_FRAME: typeof requestAnimationFrame }
        window.requestAnimationFrame = kept.REAL_FRAME
        for (const callback of kept.HELD_FRAMES.splice(0)) kept.REAL_FRAME.call(window, callback)
      })
    }

    await placed()
    const after = await read()
    expect(after.scroll, `the page scrolls sideways at ${String(NARROW)} once the circle is placed`).toBeLessThanOrEqual(after.client)
    expect(after.circleRight, 'the placed circle stands past the right edge of the page').toBeLessThanOrEqual(after.columnRight)
  }, 120_000)
})
