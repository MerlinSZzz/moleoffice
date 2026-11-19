// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT A PRESS CAME TO IS DRAWN BESIDE THAT PRESS, AND NOT AT THE TOP OF THE PAGE.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS WRONG, MEASURED
 * ---------------------------------------------------------------------------------------
 *
 * The bundles page has three presses that hand something over or file something, and all three
 * answered in one sentence drawn once, near the top of the page, above the copy panel. The presses
 * are at the bottom of that panel and in the list below it.
 *
 * Measured 8 September 2026 in Chromium on a copy of the owner's corpus, after pressing *File this and hand
 * it over*: the sentence stood 1,669 pixels above the press at 1440 and 8,420 pixels above it at
 * 390. It was out of view at both widths in both themes. A person pressed, nothing they could see
 * changed, and the only word about it was off the top of the screen. Problem `wuPmOtdQUidA`.
 *
 * This is the same fault criterion B28 fixed for the failure case on 7 September and left standing
 * for the success case.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE PINS
 * ---------------------------------------------------------------------------------------
 *
 *   1. THE SENTENCE IS DRAWN UNDER THE PRESS THAT MADE IT, at 1440 and at 390.
 *   2. IT IS IN VIEW AFTER THE PRESS, at both widths.
 *   3. IT SAYS HOW BIG WHAT WAS HANDED OVER IS, which is criterion B31's number.
 *   4. A PRESS ON A FILED ROW ANSWERS ON THAT ROW, not beside the copy above it. The row is named by
 *      its record, because the list is ordered by last change and a press moves rows.
 *   5. THERE IS ONE ANSWER ON THE PAGE, not one under every press.
 */
import type { Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { liveApp, type LiveApp } from './helpers.ts'

let app: LiveApp
let page: Page

beforeAll(async () => {
  app = await liveApp({ name: 'bundle-said-beside', viewport: { width: 1440, height: 1000 } })
  page = app.page
  for (let i = 0; i < 4; i += 1) {
    const made = await fetch(`http://127.0.0.1:${String(app.apiPort)}/api/records`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        kind: 'problem',
        title: `The far edge of tray ${String(i)} is not segmented at 40 cm`,
        summary: `Segmentation drops the far edge of tray ${String(i)} at forty centimetres, on every run.`,
        data: { symptom: 'The mask is short.', state: 'open' },
      }),
    })
    if (!made.ok) throw new Error(`the seed was refused: ${await made.text()}`)
  }
}, 240_000)

afterAll(async () => {
  await app.stop()
})

/** Open the page fresh at one width and read a copy. */
async function aCopyAt(width: number): Promise<void> {
  await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 })
  await page.goto(`http://127.0.0.1:${String(app.webPort)}/#/bundles`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.px-page h1')
  // CRITERION B33 REMOVED THE *Choose a reading* PRESS. The controls are on the page on arrival.
  await page.waitForSelector('#bx-preset')
  await page.getByRole('button', { name: 'Read what it would say' }).click()
  await page.waitForSelector('#bx-thetext', { timeout: 120_000 })
}

/**
 * How far the answer is from the bottom of the press, in pixels, and whether it is in view.
 *
 * Both are read off the live boxes rather than off the markup, because what is asserted is what a
 * person can see after pressing.
 */
async function whereTheAnswerIs(pressText: string): Promise<{ below: number; inView: boolean } | null> {
  return await page.evaluate((label) => {
    const answer = document.querySelector('.bx-said')
    const press = [...document.querySelectorAll('button')].find((one) =>
      (one.textContent ?? '').includes(label),
    )
    if (answer === null || press === undefined) return null
    const a = answer.getBoundingClientRect()
    const p = press.getBoundingClientRect()
    return {
      below: Math.round(a.top - p.bottom),
      inView: a.top >= 0 && a.bottom <= window.innerHeight,
    }
  }, pressText)
}

describe('the sentence about a press stands beside that press', () => {
  for (const width of [1440, 390]) {
    it(`draws the answer under the press that made it, at ${String(width)}`, async () => {
      await aCopyAt(width)
      const press = page.getByRole('button', { name: /File this and hand it over/ })
      await press.click()
      await page.waitForSelector('.bx-said', { timeout: 60_000 })

      const where = await whereTheAnswerIs('File this and hand it over')
      expect(where, 'no answer and no press to measure it against').not.toBeNull()
      // UNDER THE PRESS. It was 1,669 pixels ABOVE it at 1440 and 8,420 above it at 390.
      expect((where as { below: number }).below, 'the answer is drawn above the press').toBeGreaterThan(-1)
      expect((where as { below: number }).below, 'the answer is a screenful below the press').toBeLessThan(200)
      // AND IN VIEW, which is the thing the person actually needs.
      expect((where as { inView: boolean }).inView, 'the answer is out of view after the press').toBe(true)

      // AND IT SAYS HOW BIG WHAT LEFT THE BUILDING IS. Criterion B31's number, on the sentence.
      const answer = await page.locator('.bx-said').innerText()
      expect(answer).toMatch(/Export \d+/)
      expect(answer, 'the answer does not say how big the copy was').toMatch(/[\d,]+ characters/)

      // ONE ANSWER ON THE PAGE, not one under every press that could have made one.
      expect(await page.locator('.bx-said').count(), 'the answer is drawn more than once').toBe(1)
    }, 300_000)
  }

  it('answers a press on a filed row on that row', async () => {
    await aCopyAt(1440)
    // A ROW TO PRESS: file one first, then press Copy it on the row it made.
    //
    // THE ROW IS PRESSED ONLY ONCE THE LIST SHOWS IT, AND IT IS HELD BY ITS RECORD, NOT BY ITS PLACE. The
    // two cases above filed two bundles, so rows are already listed when this one is kept, and the list
    // is read again after the keep press. Until wave 13p round 18 this pressed the first row as soon as
    // any row was there. Under load it pressed an older row, the list read for the keep press then put
    // the new row above it, and `.first()` named a row nobody had pressed: "the row that was pressed has
    // no answer on it: expected +0 to be 1", in entry KLxW-DtmbTGo's suite at a load of about 12. The
    // answer was on the row that was pressed. A Copy press is an export, which changes the bundle, and
    // the list is ordered by last change, so a row's place is not what names it.
    await page.waitForSelector('.bxp-kept-count', { timeout: 60_000 })
    const listedBefore = await page.locator('.bx-row').count()
    await page.getByRole('button', { name: /^Keep it for later$/ }).click()
    await page.waitForSelector('.bx-said', { timeout: 60_000 })
    await page.waitForFunction(
      (before) => document.querySelectorAll('.bx-row').length === before + 1,
      listedBefore,
      { timeout: 60_000 },
    )

    const itsRecord = await page.locator('.bx-row').first().locator('a').first().getAttribute('href')
    expect(itsRecord, 'the first row names no record').toMatch(/^#\/r\//u)
    const row = page.locator(`.bx-row:has(a[href="${String(itsRecord)}"])`)
    await row.getByRole('button', { name: 'Copy it' }).click()
    await page.waitForFunction(
      (href) =>
        (document.querySelector(`.bx-row:has(a[href="${href}"]) .bx-said`)?.textContent ?? '').includes('Export'),
      String(itsRecord),
      { timeout: 60_000 },
    )

    // THE ANSWER IS INSIDE THE ROW THAT WAS PRESSED, which is what says it is that press's answer.
    expect(await row.locator('.bx-said').count(), 'the row that was pressed has no answer on it').toBe(1)
    expect(await page.locator('.bx-said').count(), 'the answer is drawn more than once').toBe(1)
    const near = await whereTheAnswerIs('Copy it')
    expect(near, 'no answer and no press to measure it against').not.toBeNull()
    expect((near as { below: number }).below, 'the answer is drawn above the row press').toBeGreaterThan(-40)
    expect((near as { below: number }).below, 'the answer is a screenful from the row press').toBeLessThan(200)
  }, 300_000)
})
