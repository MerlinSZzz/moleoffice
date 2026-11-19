// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * EVERY PART OF A FORMULA IS PAINTED, IN THE BUILT APP.
 *
 * KaTeX draws some parts of a formula as an svg rather than a letter: the arrow of `\vec`, a stretched
 * arrow, a brace, a root sign, the ring of `\oiint`. The page reset in src/web/styles.css says
 * `img, svg, video, canvas { max-width: 100% }`, which is right for a picture in a page. KaTeX puts
 * the `\vec` arrow's svg absolutely inside a box of no width, so under the reset the svg is clamped to
 * 0px and paints nothing: `\vec{v}` was drawn as a plain v, with nothing to say a part was missing.
 *
 * So each formula is shot as it is drawn, and again with the reset lifted from KaTeX's svgs, and the
 * two must be the same. A part the reset squashes shows as a difference.
 *
 * THE FORMULAS ARE EVERY ONE IN tests/common-latex-from-papers-and-notes.ts, the twelve hard ones, and
 * one made up here so the case always has an arrow to measure. A display formula is filed as a maths
 * block; an inline one as a maths block between single dollars, which MathText draws inline, as it
 * draws the same formula in a paragraph. A paragraph's own reading of dollars splits a formula holding
 * `\$` or a `$` inside `\text{}`, so it would not reach MathText whole.
 *
 * The fonts are KaTeX's own, from the built app: a page without them draws other shapes.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { COMMON_LATEX, TWELVE_HARD_FORMULAS } from './common-latex-from-papers-and-notes.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'

/** Made up for this file: one arrow drawn as an accent, and one stretched over two letters. */
const ARROWS = String.raw`\vec{u} + \overrightarrow{AB}`

const FORMULAS = [
  ...COMMON_LATEX.flatMap((family) => [...family.inline.map((tex) => `$${tex}$`), ...family.display]),
  ...TWELVE_HARD_FORMULAS.map((tex) => `$${tex}$`),
  `$${ARROWS}$`,
]

/** A report holds at most 200 blocks, so the formulas are filed as several reports. */
const PER_REPORT = 150

/** Room round each shot, so a part painted past the formula's own box is inside the picture. */
const AROUND = 24

describe('a formula, drawn by KaTeX in the built app', () => {
  let app: LiveApp
  const addresses: string[] = []

  beforeAll(async () => {
    app = await liveApp({ opensAt: 'full', name: 'every-part-of-a-formula-is-painted', viewport: { width: 1440, height: 1000 } })
    for (let from = 0; from < FORMULAS.length; from += PER_REPORT) {
      const blocks = FORMULAS.slice(from, from + PER_REPORT).map((tex, at) => ({ id: `f-${String(from + at + 1)}`, type: 'math', tex }))
      const res = await fetch(`${app.api}/api/records`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind: 'report', title: 'Every formula', summary: 'A made-up report, so every formula can be shot.', data: { blocks } }),
      })
      if (!res.ok) throw new Error(`filing a report answered ${String(res.status)}: ${await res.text()}`)
      addresses.push(`${app.site}/#/r/${((await res.json()) as { record: { id: string } }).record.id}`)
    }
  }, 240_000)

  afterAll(async () => {
    await app?.stop()
  }, 60_000)

  it('paints every part: lifting the page reset from its svgs changes no pixel', async () => {
    const page = app.page
    const squashed: string[] = []
    const measured: string[] = []
    for (const [part, address] of addresses.entries()) {
      const filed = Math.min(PER_REPORT, FORMULAS.length - part * PER_REPORT)
      await page.goto(address, { timeout: 60_000 })
      await waitForThePage(page, 60_000)
      await page.locator('.mt .katex').nth(filed - 1).waitFor({ timeout: 60_000 })
      await page.evaluate(async () => {
        await document.fonts.ready
      })
      expect(await page.locator('.mt-unsupported').count(), 'a formula was refused, so its parts were never drawn').toBe(0)

      const formulas = page.locator('.mt')
      expect(await formulas.count()).toBe(filed)
      for (let at = 0; at < filed; at++) {
        const formula = formulas.nth(at)
        if ((await formula.locator('.katex svg').count()) === 0) continue
        const tex = (await formula.getAttribute('aria-label')) ?? ''
        measured.push(tex)
        await formula.scrollIntoViewIfNeeded()
        const box = await formula.boundingBox()
        if (box === null) throw new Error(`${tex} has no box on the page`)
        const clip = { x: Math.max(0, box.x - AROUND), y: Math.max(0, box.y - AROUND), width: box.width + 2 * AROUND, height: box.height + 2 * AROUND }
        const asDrawn = await page.screenshot({ clip })
        await formula.evaluate((el) => {
          for (const svg of el.querySelectorAll<SVGElement>('.katex svg')) svg.style.maxWidth = 'none'
        })
        const lifted = await page.screenshot({ clip })
        await formula.evaluate((el) => {
          for (const svg of el.querySelectorAll<SVGElement>('.katex svg')) svg.style.maxWidth = ''
        })
        if (!asDrawn.equals(lifted)) squashed.push(tex)
      }
    }
    expect(measured, 'the made-up arrows were not drawn as an svg, so this case measures nothing').toContain(`$${ARROWS}$`)
    expect(squashed, 'the page reset squashes a part of these formulas').toEqual([])
  }, 300_000)
})
