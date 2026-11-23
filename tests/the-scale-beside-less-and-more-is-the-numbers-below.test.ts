// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// Criterion change: plan 7FEOshq3mBGG uses plural words; the counts still have to match the table.
/**
 * CRITERION B34: LESS AND MORE SHOW A SCALE, IN NUMBERS.
 *
 * ---------------------------------------------------------------------------------------
 * THE CRITERION, AND WHAT IT ASKS FOR
 * ---------------------------------------------------------------------------------------
 *
 * `design/bundle/ACCEPTANCE.md`, criterion B34: Less and More are there, but no scale shows at a
 * glance, such as the size of the text or the values counted. Beside the two presses the page shows
 * where the copy stands — its size in characters and bytes, and the levels each part is at against
 * the highest it really has — as numbers a person reads at a glance, not only in a sentence.
 *
 * The transitional words and the controls under Less and More are redesigned in the UI check,
 * which is not this file's business.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE PINS
 * ---------------------------------------------------------------------------------------
 *
 *   1. BEFORE ANY READING THERE ARE NO NUMBERS, and nothing that implies a measurement was taken.
 *   2. THE SIZE BESIDE THE PRESSES IS THE SIZE IN THE PARAGRAPH BELOW, to the digit, read from the
 *      live page. The two can never disagree because one function writes both.
 *   3. THE LEVEL COUNTS ARE THE TABLE'S COUNTS: how many parts are at their top and how many below,
 *      from the same data the Level column draws.
 *   4. LESS AND MORE MOVE THE LEVELS AND THE NUMBERS FOLLOW THEM.
 *
 * MUTATION, MEASURED 15 SEPTEMBER 2026, after a control run of this file green: in
 * `src/web/components/BundlePanel.tsx`, delete the `#bx-scale` block beside Less and More. Every
 * test after the first goes red, each on the line that reads a number that is no longer drawn.
 * Restored, all pass.
 */
import type { Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { liveApp, type LiveApp } from './helpers.ts'

let app: LiveApp
let page: Page

beforeAll(async () => {
  app = await liveApp({ name: 'bundle-scale', viewport: { width: 1440, height: 1000 } })
  page = app.page
  for (let i = 0; i < 12; i += 1) {
    const res = await fetch(`http://127.0.0.1:${String(app.apiPort)}/api/records`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        kind: 'problem',
        title: `The far edge of tray ${String(i)} is not segmented at 40 cm`,
        summary:
          `Segmentation drops the far edge of tray ${String(i)} at forty centimetres, on every run, ` +
          'and the depth image is clean there. It is the mask that is short, not the sensor.',
        data: {
          symptom: `Segmentation drops the far edge of tray ${String(i)}.`,
          state: 'open',
          why_it_hurts: 'A grasp planned on a short mask reaches for an edge that is not where it looks.',
        },
      }),
    })
    if (!res.ok) throw new Error(`the seed was refused: ${await res.text()}`)
  }
  const module = await fetch(`http://127.0.0.1:${String(app.apiPort)}/api/records`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      kind: 'module',
      title: 'The perception stack',
      summary: 'Everything between the camera and a grasp pose.',
    }),
  })
  if (!module.ok) throw new Error(`the module was refused: ${await module.text()}`)
}, 300_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

/** Open the page fresh and wait for the controls, with no reading made. */
async function openFresh(): Promise<void> {
  await page.goto(`http://127.0.0.1:${String(app.webPort)}/#/bundles`, { waitUntil: 'domcontentloaded' })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.px-page h1')
  await page.waitForSelector('#bx-preset')
}

/** Read the copy on the page, which is the press that produces a reading. */
async function readTheCopy(): Promise<void> {
  await page.getByRole('button', { name: 'Read what it would say' }).click()
  await page.waitForSelector('#bx-thetext', { timeout: 60_000 })
  await page.waitForSelector('#bx-scale-size', { timeout: 60_000 })
}

/** The two numbers in a run of text that says `N characters, M bytes`. */
function sizeIn(text: string): { characters: number; bytes: number } {
  const found = /([\d,]+) characters, ([\d,]+) bytes/.exec(text)
  if (found === null) throw new Error(`no size in: ${text}`)
  return {
    characters: Number((found[1] ?? '').replace(/,/g, '')),
    bytes: Number((found[2] ?? '').replace(/,/g, '')),
  }
}

/** The size the paragraph under the copy draws, read off the live page. */
async function theParagraphSize(): Promise<{ characters: number; bytes: number }> {
  const said = (await page.locator('.bx-size').first().innerText()).replace(/\s+/g, ' ')
  return sizeIn(said)
}

/** The size beside Less and More, read off the live page. */
async function theScaleSize(): Promise<{ characters: number; bytes: number }> {
  return sizeIn(await page.locator('#bx-scale-size').innerText())
}

/** The level counts the Level column of the table draws, as a person could count them. */
async function theTableCounts(): Promise<{ atTop: number; below: number }> {
  const cells = await page.locator('.bx-part-level').allInnerTexts()
  const below = cells.filter((cell) => cell.includes('written up to')).length
  const atTop = cells.filter((cell) => cell.trim() !== '—' && !cell.includes('written up to')).length
  return { atTop, below }
}

/** The level counts beside Less and More, as the page draws them. */
async function theScaleCounts(): Promise<{ atTop: number; below: number } | null> {
  if ((await page.locator('#bx-scale-levels').count()) === 0) return null
  const said = await page.locator('#bx-scale-levels').innerText()
  const found = /([\d,]+) of ([\d,]+) parts? at their top, ([\d,]+) below/.exec(said)
  if (found === null) throw new Error(`the scale does not read as level counts: ${said}`)
  return {
    atTop: Number((found[1] ?? '').replace(/,/g, '')),
    below: Number((found[3] ?? '').replace(/,/g, '')),
  }
}

describe('the scale beside Less and More', () => {
  it('draws no number and claims no measurement before any reading', async () => {
    await openFresh()
    expect(await page.locator('#bx-scale').count(), 'a scale was drawn before any reading').toBe(0)
    // AND NOTHING IN THE CONTROLS PRETENDS A MEASUREMENT WAS TAKEN. No number at all is drawn
    // beside the two presses while no reading exists.
    const beside = await page.locator('.bx-make').last().innerText()
    expect(beside, `a number is drawn before any reading: ${beside}`).not.toMatch(/\d/)
  }, 120_000)

  it('draws the same level counts as the table below', async () => {
    await openFresh()
    await readTheCopy()
    const counts = await theScaleCounts()
    expect(counts, 'the scale draws no level counts').not.toBeNull()
    const fromTheTable = await theTableCounts()
    expect(counts, 'the scale and the table disagree about where the parts stand').toEqual(fromTheTable)
    // AND THERE IS A REAL DISTINCTION TO DRAW, or the assertion above proves nothing.
    expect((counts as { atTop: number; below: number }).atTop).toBeGreaterThan(0)
  }, 180_000)

  it('moves the numbers with Less and More', async () => {
    await openFresh()
    await readTheCopy()
    const atRest = await theScaleSize()
    expect(atRest).toEqual(await theParagraphSize())

    // LESS: the reading is produced again, and the scale follows it.
    await page.getByRole('button', { name: 'Less' }).click()
    await page.waitForFunction(
      (was) => !(document.querySelector('#bx-scale-size')?.textContent ?? '').includes(was),
      String(atRest.characters),
      { timeout: 30_000 },
    )
    await page.waitForSelector('#bx-scale-size', { timeout: 30_000 })
    const afterLess = await theScaleSize()
    expect(afterLess, 'the scale did not follow the press of Less').not.toEqual(atRest)
    expect(afterLess, 'the scale and the paragraph disagree after Less').toEqual(await theParagraphSize())

    // MORE: it comes back, which is what makes the two presses one control.
    await page.getByRole('button', { name: 'More' }).click()
    await page.waitForFunction(
      (was) => (document.querySelector('#bx-scale-size')?.textContent ?? '').includes(was),
      String(atRest.characters),
      { timeout: 30_000 },
    )
    expect(await theScaleSize(), 'More did not bring the size back').toEqual(atRest)
    // AND THE LEVEL COUNTS ARE STILL THE TABLE'S after both presses.
    expect(await theScaleCounts()).toEqual(await theTableCounts())
  }, 240_000)
})
