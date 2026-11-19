// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A COMMENT CIRCLE PASSES UNDER THE TOP BAR WHEN THE PAGE SCROLLS, AND MOVES WITH ITS BLOCK. Wave 13t round 34.
 *
 * Round 33 photographed a report at 660 wide, scrolled, and circle 1 lay across the bottom edge of the sticky top bar.
 * The circle is placed in the document's own coordinates, so it scrolls with its block; it was drawn over the bar
 * because it sat at --z-mark, the review ring's layer, which tokens.css puts over --z-bar on purpose. A circle belongs
 * to a block of the page, so it goes under the bar the page scrolls under, as the talk box's picked outline does.
 *
 * WHAT THIS FILE HOLDS, in a real browser on a test office of its own, at 1440 and 390, in light:
 *   - the circle on a report's first block keeps the same distance from that block after the page is scrolled;
 *   - where the top bar is drawn (below 1024 wide), the page is scrolled until the circle lies across the bar's
 *     bottom edge, and the point where the two overlap shows the bar, not the circle.
 * At 1440 there is no top bar, so only the first holds there.
 * With TEST_SHOTS set, each width is photographed before and after the scroll.
 *
 * Everything in it is made up by this test, in a database of its own.
 */
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { targetKey } from '../src/shared/targets.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { scrollThePageBy, thePageAtRest } from './the-page-scroller.ts'
import { testShots } from './where-shots-go.ts'

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

let app: LiveApp
let reportId = ''
let blockKey = ''

async function write(path: string, body: unknown): Promise<Record<string, unknown>> {
  const reply = await fetch(`${app.api}${path}`, { method: 'POST', headers: AS_THE_OWNER, body: JSON.stringify(body) })
  const text = await reply.text()
  if (!reply.ok) throw new Error(`POST ${path} answered ${String(reply.status)}: ${text}`)
  return JSON.parse(text) as Record<string, unknown>
}

beforeAll(async () => {
  app = await liveApp({ name: 'circle-under-the-bar', viewport: { width: 660, height: 900 } })
  // A REPORT LONG ENOUGH TO SCROLL at every width: its first block carries the comment.
  const blocks = [{ id: 'b-1', type: 'text', heading: 'What was tested', text: 'Four printed wrist mounts were loaded until they broke.' }]
  for (let n = 2; n <= 24; n += 1) {
    blocks.push({ id: `b-${String(n)}`, type: 'text', heading: `Trial ${String(n)}`, text: `Mount ${String(n)} was loaded in steps of five newtons until it cracked.` })
  }
  const report = await write('/api/records', {
    kind: 'report',
    title: 'The wrist mount trials, for the circle under the bar',
    summary: 'A made-up report for scrolling a comment circle under the top bar.',
    data: { date: '2026-09-30', blocks },
  })
  reportId = (report['record'] as { id: string }).id
  const target = { kind: 'region', recordId: reportId, regionId: 'data.blocks[#b-1]' } as const
  // THE PAGE NAMES THE BLOCK AS A REPORT BLOCK, and the circle with it, whichever way the comment named it.
  blockKey = targetKey({ kind: 'reportBlock', recordId: reportId, blockId: 'b-1' })
  // A COMMENT ON THE FIRST BLOCK, sent, which is what draws a circle beside it.
  await write('/api/records', {
    kind: 'message',
    title: 'The first block does not say who ran the trials.',
    data: {
      body: 'The first block does not say who ran the trials.',
      target: { target, place: { at: 'surface' } },
      sentBy: { kind: 'person', id: THE_PERSON },
    },
  })
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

/** Wait until the page says its circles stand where they go (the mark round 31 added on the html element). */
async function placed(): Promise<void> {
  await app.page.waitForFunction(() => document.documentElement.getAttribute('data-comment-circles') === 'placed', undefined, {
    timeout: 20_000,
  })
}

type Rect = { top: number; bottom: number; left: number; right: number }

/** The circle's box, its block's box, and the top bar's box where one is drawn, all as the window sees them. */
async function boxes(key: string): Promise<{ circle: Rect; block: Rect; bar: Rect | null }> {
  return app.page.evaluate((k) => {
    const rect = (el: Element | null): Rect | null => {
      if (el === null) return null
      const r = el.getBoundingClientRect()
      return r.width === 0 && r.height === 0 ? null : { top: r.top, bottom: r.bottom, left: r.left, right: r.right }
    }
    const circle = rect(document.querySelector(`.px-comment-circle[data-comments-on="${CSS.escape(k)}"]`))
    const block = rect(document.querySelector(`[data-target="${CSS.escape(k)}"]`))
    if (circle === null || block === null) throw new Error(`no circle or no block for ${k}`)
    return { circle, block, bar: rect(document.querySelector('.shell-bar')) }
  }, key)
}

const WIDTHS = [1440, 390] as const
const LOOKS = ['light'] as const

describe('the comment circle on a report block, scrolled', () => {
  for (const width of WIDTHS) {
    for (const look of LOOKS) {
      it(`at ${String(width)} in ${look}: moves with its block, and passes under the top bar`, async () => {
        const page = app.page
        await page.setViewportSize({ width, height: 900 })
        await page.emulateMedia({ colorScheme: look })
        await page.goto(`${app.site}/#/records`, { timeout: 60_000 })
        await page.evaluate(() => window.localStorage.setItem('mole-office.review', 'shut||||'))
        await page.goto(`${app.site}/#/r/${reportId}`, { timeout: 60_000 })
        await page.reload({ timeout: 60_000 })
        await waitForThePage(page, 60_000)
        await page.evaluate((theme) => {
          document.documentElement.dataset['theme'] = theme
        }, look)
        await page.locator(`.px-comment-circle[data-comments-on="${blockKey}"]`).waitFor({ timeout: 30_000 })
        await placed()
        const shots = process.env['TEST_SHOTS'] ? testShots('a-comment-circle-passes-under-the-top-bar') : null
        if (shots !== null) await page.screenshot({ path: join(shots, `${String(width)}-${look}-at-rest.png`) })
        const before = await boxes(blockKey)
        expect(before.bar === null, `the top bar is drawn at ${String(width)} only below 1024`).toBe(width >= 1024)

        // SCROLL so the circle's middle is on the bar's bottom edge, or by 200 px where there is no bar.
        const edge = before.bar?.bottom ?? before.circle.top - 200
        const by = before.circle.top + (before.circle.bottom - before.circle.top) / 2 - edge
        await scrollThePageBy(page, by)
        await thePageAtRest(page)
        await placed()
        if (shots !== null) await page.screenshot({ path: join(shots, `${String(width)}-${look}-scrolled.png`) })
        const after = await boxes(blockKey)

        // IT MOVES WITH ITS BLOCK: the same distance from the block's top and right edges as before the scroll.
        expect(after.circle.top - after.block.top, 'the circle did not move with its block').toBeCloseTo(before.circle.top - before.block.top, 0)
        expect(after.circle.left - after.block.right).toBeCloseTo(before.circle.left - before.block.right, 0)

        if (after.bar !== null) {
          // THE CIRCLE LIES ACROSS THE BAR'S FOOT, and where the two overlap the reader sees the bar.
          expect(after.circle.top, 'the scroll did not bring the circle up to the bar').toBeLessThan(after.bar.bottom)
          expect(after.circle.bottom, 'the scroll took the circle past the bar').toBeGreaterThan(after.bar.bottom)
          // THE STACK AT THAT POINT, top first. The checklists button is fixed over everything at the top right and may
          // be first, so what is read is which of the bar and the circle comes first, not what is at the very top.
          const seen = await page.evaluate(
            ({ x, y }) => {
              const stack = document.elementsFromPoint(x, y)
              const bar = stack.findIndex((one) => one.closest('.shell-bar') !== null)
              const circle = stack.findIndex((one) => one.closest('.px-comment-circle') !== null)
              return { bar: bar >= 0, circleOverTheBar: circle >= 0 && circle < bar }
            },
            { x: (after.circle.left + after.circle.right) / 2, y: (after.circle.top + after.bar.bottom) / 2 },
          )
          expect(seen, `at ${String(width)} the circle is drawn over the top bar`).toEqual({ bar: true, circleOverTheBar: false })
        }
      }, 120_000)
    }
  }
})
