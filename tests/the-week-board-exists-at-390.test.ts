// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE WEEK BOARD IS ON THE SCREEN AT 390, AND A BOUNDING BOX IS NOT THE TEST.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS WRONG, MEASURED
 * ---------------------------------------------------------------------------------------
 *
 * `Planning.tsx` carried `.px-pl-bhead { display: none }` inside its narrow media block, so on a
 * phone all seven day headings measured 0 by 0. The week a person was planning had no visible axis
 * at all: the board was named in the help line above it and was not on the screen under it.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS ASKS THREE QUESTIONS PER HEADING AND NOT ONE
 * ---------------------------------------------------------------------------------------
 *
 * A non-zero bounding box is not proof that anything is readable. `visibility: hidden`, `opacity: 0`,
 * a clipping `overflow: hidden` ancestor and a position outside the viewport ALL report a non-zero
 * box, and the repair that satisfies a non-zero box is not the repair that puts a heading on the
 * screen. So each heading is asked:
 *
 *   1. does its own centre point hit-test to itself or to something inside it — `elementFromPoint`,
 *      which is the browser answering "if a finger landed here, what would it touch";
 *   2. does its rectangle intersect the viewport;
 *   3. is its computed `visibility` `visible` with `opacity` above zero.
 *
 * MUTATION 1: put `.px-pl-bhead { display: none }` back, which is the stylesheet as it was. All
 * seven go red.
 * MUTATION 2: hide ONE heading with `opacity: 0`. That one goes red — and this is the mutation the
 * bounding-box form of this test could not have caught, which is why the three questions are asked.
 */
import type { Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type LiveApp, liveApp, waitForThePage } from './helpers.ts'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

let app: LiveApp
let page: Page

interface Heading {
  text: string
  hits: boolean
  intersects: boolean
  visibility: string
  opacity: number
  width: number
  height: number
}

/** Every day heading on the board, each asked all three questions in the browser. */
async function headings(): Promise<Heading[]> {
  return page.evaluate(() => {
    const out: Heading[] = []
    for (const el of document.querySelectorAll('.px-pl-bday')) {
      const box = el.getBoundingClientRect()
      const style = getComputedStyle(el)
      const x = box.left + box.width / 2
      const y = box.top + box.height / 2
      const under = box.width > 0 && box.height > 0 ? document.elementFromPoint(x, y) : null
      out.push({
        text: el.textContent?.trim() ?? '',
        hits: under !== null && (under === el || el.contains(under)),
        intersects:
          box.right > 0 && box.bottom > 0 && box.left < window.innerWidth && box.top < window.innerHeight,
        visibility: style.visibility,
        opacity: Number(style.opacity),
        width: box.width,
        height: box.height,
      })
    }
    return out as never
  }) as unknown as Promise<Heading[]>
}

beforeAll(async () => {
  app = await liveApp({ name: 'week-board-390', viewport: { width: 390, height: 844 } })
  await app.page.goto(`http://127.0.0.1:${String(app.webPort)}/#/plan`, {
    timeout: 60_000,
  })
  await waitForThePage(app.page, 60_000)
  page = app.page
  await sleep(1200)
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

describe('the week board at 390', () => {
  it('really found the board, so an empty list cannot pass quietly', async () => {
    const found = await headings()
    expect(found.length, 'no day heading was in the document at all').toBe(7)
  })

  it('puts every one of the seven day headings where a finger would find it', async () => {
    const found = await headings()
    const missed = found.filter((one) => !one.hits).map((one) => one.text || '(no words)')
    expect(missed, 'these headings do not hit-test to themselves').toEqual([])
  })

  it('keeps every heading inside the window', async () => {
    const found = await headings()
    const outside = found.filter((one) => !one.intersects).map((one) => one.text || '(no words)')
    expect(outside, 'these headings are drawn outside the viewport').toEqual([])
  })

  it('leaves every heading visible and not faded away', async () => {
    const found = await headings()
    const gone = found
      .filter((one) => one.visibility !== 'visible' || one.opacity <= 0)
      .map((one) => `${one.text || '(no words)'} visibility=${one.visibility} opacity=${String(one.opacity)}`)
    expect(gone).toEqual([])
  })

  it('gives every heading room to draw its words', async () => {
    const found = await headings()
    for (const one of found) {
      expect(one.width, `${one.text} is ${String(one.width)}px wide`).toBeGreaterThan(20)
      expect(one.height, `${one.text} is ${String(one.height)}px tall`).toBeGreaterThan(10)
      expect(one.text, 'a heading with no words is an axis with no labels').not.toBe('')
    }
  })

  it('says which column is today in a word and not only in a rule', async () => {
    const today = await page.evaluate(() => document.querySelector('.px-pl-bnow')?.textContent?.trim() ?? null)
    expect(today).toBe('today')
  })

  it('never scrolls the page sideways to fit them', async () => {
    const wide = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
    }))
    expect(wide.scroll, 'the board pushed the page wider than the window').toBeLessThanOrEqual(wide.client + 1)
  })
})
