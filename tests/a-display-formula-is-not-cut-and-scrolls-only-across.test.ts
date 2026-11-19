// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A DISPLAY FORMULA IS CUT NOWHERE, AND ONE WIDER THAN THE SCREEN SCROLLS ACROSS INSIDE ITS OWN BOX.
 *
 * A display formula sits in `.mt-display`, which scrolls across, so that a formula wider than a
 * phone is not broken at whatever character reached the edge. A box that scrolls across hides what
 * runs past it above and below, and KaTeX draws accents, limits and the tops of matrices a little
 * past the line it reports. So the box keeps room above and below, and this file holds it to that by
 * the pixels: each formula is shot as it is drawn and again with nothing hidden, and the two must be
 * the same. A tilde cut off the top of a letter is a different formula.
 *
 * THE FORMULAS ARE EVERY DISPLAY FORMULA IN tests/common-latex-from-papers-and-notes.ts, and the
 * twelve hard formulas drawn as displays: 71 on 14 November 2026. Before the box kept that room, 24
 * of those 71 lost pixels at the width this file opens at.
 *
 * AT 390, a formula wider than the phone scrolls inside its box, marks the edge it runs past, and
 * leaves the page as wide as the screen.
 *
 * The fonts are KaTeX's own, from the built app. A page without them draws other letters at other
 * sizes, and what it cuts is not what the owner's page cuts.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Page } from 'playwright'
import { COMMON_LATEX, TWELVE_HARD_FORMULAS } from './common-latex-from-papers-and-notes.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'

/** Made up for this file: a polynomial wider than a phone and narrower than a desktop column. */
const WIDE = String.raw`f(x) = a_0 + a_1 x + a_2 x^2 + a_3 x^3 + a_4 x^4 + a_5 x^5 + a_6 x^6 + a_7 x^7 + a_8 x^8 + a_9 x^9 + a_{10} x^{10}`

const DISPLAYS = [...COMMON_LATEX.flatMap((family) => family.display), ...TWELVE_HARD_FORMULAS, WIDE]

/** Room above and below each shot, so a cut past the box's own edge is inside the picture. */
const AROUND = 16

/** What the browser says about each display formula's box, in the order they are drawn. */
type ABox = { tex: string; more: string | null; tab: string | null; scrollWidth: number; clientWidth: number }

const readTheBoxes = (page: Page): Promise<ABox[]> =>
  page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.mt-display')].map((box) => ({
      tex: box.getAttribute('aria-label') ?? '',
      more: box.parentElement?.getAttribute('data-more') ?? null,
      tab: box.getAttribute('tabindex'),
      scrollWidth: box.scrollWidth,
      clientWidth: box.clientWidth,
    })),
  )

/** Open the report and wait until every formula is drawn in KaTeX's fonts. */
async function openTheReport(page: Page, address: string): Promise<void> {
  await page.goto(address, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.locator('.mt-display .katex').nth(DISPLAYS.length - 1).waitFor({ timeout: 60_000 })
  await page.evaluate(async () => {
    await document.fonts.ready
  })
}

describe('a display formula, drawn by KaTeX in the built app', () => {
  let app: LiveApp
  let address: string

  beforeAll(async () => {
    app = await liveApp({ opensAt: 'full', name: 'display-maths-cut-nowhere', viewport: { width: 1440, height: 1000 } })
    const blocks = DISPLAYS.map((tex, at) => ({ id: `d-${String(at + 1)}`, type: 'math', tex }))
    const res = await fetch(`${app.api}/api/records`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'report', title: 'Every display formula', summary: 'A made-up report, so display formulas can be measured.', data: { blocks } }),
    })
    if (!res.ok) throw new Error(`filing the report answered ${String(res.status)}: ${await res.text()}`)
    address = `${app.site}/#/r/${((await res.json()) as { record: { id: string } }).record.id}`
    await openTheReport(app.page, address)
  }, 240_000)

  afterAll(async () => {
    await app?.stop()
  }, 60_000)

  it('is drawn whole: hiding what runs past its box changes no pixel of it', async () => {
    const page = app.page
    const formulas = page.locator('.mt-display')
    expect(await formulas.count()).toBe(DISPLAYS.length)
    const cut: string[] = []
    for (let at = 0; at < DISPLAYS.length; at++) {
      const formula = formulas.nth(at)
      await formula.scrollIntoViewIfNeeded()
      const box = await formula.boundingBox()
      if (box === null) throw new Error(`display formula ${String(at + 1)} has no box on the page`)
      const clip = { x: box.x, y: box.y - AROUND, width: box.width, height: box.height + 2 * AROUND }
      const asDrawn = await page.screenshot({ clip })
      await formula.evaluate((el) => {
        el.style.overflow = 'visible'
      })
      const whole = await page.screenshot({ clip })
      await formula.evaluate((el) => {
        el.style.overflow = ''
      })
      if (!asDrawn.equals(whole)) cut.push((await formula.getAttribute('aria-label')) ?? '')
    }
    expect(cut, 'these formulas lose pixels to the edge of their box').toEqual([])
  }, 240_000)

  it('marks no edge above or below its box, which never scrolls up or down', async () => {
    const boxes = await readTheBoxes(app.page)
    expect(boxes).toHaveLength(DISPLAYS.length)
    const marked = boxes.filter((box) => /\b(up|down)\b/.test(box.more ?? ''))
    expect(marked.map((box) => `${box.more ?? ''}: ${box.tex}`)).toEqual([])
  })

  it('on a phone, scrolls a wide one across inside its box, marks the edge, and leaves the page as wide as the screen', async () => {
    const phone = await app.context.newPage()
    try {
      await phone.setViewportSize({ width: 390, height: 900 })
      await openTheReport(phone, address)
      const wide = (await readTheBoxes(phone)).find((box) => box.tex === WIDE)
      expect(wide, 'the wide formula is not on the page').toBeDefined()
      expect(wide?.scrollWidth, 'the wide formula fits a phone, so this case measures nothing').toBeGreaterThan(wide?.clientWidth ?? 0)
      expect(wide?.more).toBe('right')
      expect(wide?.tab, 'a box with more to see cannot be reached by the keyboard').toBe('0')
      expect(await phone.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)

      const box = phone.locator('.mt-display').nth(DISPLAYS.indexOf(WIDE))
      await box.evaluate((el) => {
        el.scrollLeft = el.scrollWidth
      })
      await expect.poll(async () => (await readTheBoxes(phone)).find((one) => one.tex === WIDE)?.more).toBe('left')

      const upOrDown = (await readTheBoxes(phone)).filter((one) => /\b(up|down)\b/.test(one.more ?? ''))
      expect(upOrDown.map((one) => `${one.more ?? ''}: ${one.tex}`)).toEqual([])
    } finally {
      await phone.close()
    }
  }, 120_000)
})
