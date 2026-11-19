// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE TWO PRESSES THAT OPEN A COPY AS TEXT ARE REACHED WITHOUT MAKING A COPY FAIL FIRST.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS WRONG, MEASURED
 * ---------------------------------------------------------------------------------------
 *
 * Criterion B29 gave a person two ways to take a copy that need no clipboard: a page of plain text,
 * and a text box already selected. Both were built inside the block that appears when a copy
 * press could not write to the clipboard, because that is where the instruction put them.
 *
 * Measured 8 September 2026 in Chromium at 1440 and at 390, in both themes, on a copy of the owner's corpus
 * served by an isolated stack: on a browser where the clipboard works, *Open it as a page of text*
 * and *Open it in a text box* were drawn ZERO times — before any press, and after a press that
 * copied. So on the machine the owner actually uses there was no way to open the copy as plain text at all.
 * Problem `SSo-90ct3Kqj`.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE PINS
 * ---------------------------------------------------------------------------------------
 *
 *   1. BOTH PRESSES ARE ON THE PAGE AS SOON AS THERE IS A COPY, with nothing pressed and nothing
 *      failed.
 *   2. THE PATH IS ONE PRESS, and it is drawn where the copy is rather than at the top of the page.
 *   3. EACH ONE DOES WHAT ITS NAME SAYS: the page of text serves the same copy as text/plain, and
 *      the box opens with the whole copy in it.
 *   4. NOTHING ABOUT FAILING IS SAID WHERE NOTHING FAILED.
 */
import type { Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { liveApp, type LiveApp } from './helpers.ts'

let app: LiveApp
let page: Page

/** The first words of an assembled copy, so a page of text can be told from any other page. */
const THE_TEXT_OPENS_WITH = 'CONTEXT FROM MOLE OFFICE'

beforeAll(async () => {
  app = await liveApp({ name: 'bundle-ways-out', viewport: { width: 1440, height: 1000 } })
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
  await page.goto(`http://127.0.0.1:${String(app.webPort)}/#/bundles`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.px-page h1')
}, 240_000)

afterAll(async () => {
  await app.stop()
})

/** Open the chooser and read a copy, which is the state everything below is about. */
async function readWhatItWouldSay(): Promise<void> {
  // CRITERION B33 REMOVED THE *Choose a reading* PRESS. The controls are on the page on arrival, so
  // this only has to press the read-again press that produces a reading.
  await page.getByRole('button', { name: 'Read what it would say' }).click()
  await page.waitForSelector('#bx-thetext', { timeout: 120_000 })
}

describe('the two ways out are reached without a failure first', () => {
  it('draws both presses as soon as there is a copy, with nothing pressed', async () => {
    await readWhatItWouldSay()

    // NOTHING HAS BEEN PRESSED AND NOTHING HAS FAILED, and both are here. This is the whole
    // criterion: before 8 September 2026 both counts were zero on a browser with a clipboard.
    const asAPage = page.getByRole('link', { name: 'Open it as a page of text' })
    const inABox = page.getByRole('button', { name: 'Open it in a text box' })
    expect(await asAPage.count(), 'the page of text is not reachable without a failure').toBe(1)
    expect(await inABox.count(), 'the text box is not reachable without a failure').toBe(1)

    // AND NOTHING SAYS ANYTHING FAILED, because nothing did.
    const why = await page.locator('.bx-nocopy-why').innerText()
    expect(why, 'the page says a copy failed when none did').not.toContain('Nothing was copied')
  })

  it('draws them where the copy is, not at the top of the page', async () => {
    await readWhatItWouldSay()
    // MEASURED FROM THE COPY'S TEXT. Since round 10e the press that copies is Copy the bundle, at the
    // page's head, and the ways out stand in the preview directly over the text they hand over. The
    // distance is what a person would scroll from the ways out to the text, and a negative number
    // means the ways out are under it.
    const near = await page.evaluate(() => {
      const ways = document.querySelector('.bx-nocopy')
      const text = document.getElementById('bx-thetext')
      if (ways === null || text === null) return null
      return Math.round(text.getBoundingClientRect().top - ways.getBoundingClientRect().bottom)
    })
    expect(near, 'the ways out are not drawn near the copy').not.toBeNull()
    expect(near ?? 1e9, 'the ways out are a screenful away from the copy').toBeLessThan(200)
    expect(near ?? -1e9, 'the ways out are drawn under the copy').toBeGreaterThan(-1)
  })

  it('serves the same copy as a page of plain text, in one press', async () => {
    await readWhatItWouldSay()
    const onScreen = await page.locator('#bx-thetext').innerText()
    const address = await page.getByRole('link', { name: 'Open it as a page of text' }).getAttribute('href')
    expect(address, 'the press to open a page of text has no address').not.toBeNull()

    const served = await fetch(String(address))
    expect(served.status, 'the page of text did not answer').toBe(200)
    expect(served.headers.get('content-type') ?? '').toContain('text/plain')
    const words = await served.text()
    expect(words).toContain(THE_TEXT_OPENS_WITH)
    // THE SAME COPY, not another reading of the same project. The first line of the text on the
    // screen is what the page of text opens with too.
    expect(words.split('\n')[0]).toBe(onScreen.split('\n')[0])
  })

  it('opens the whole copy in a text box, in one press', async () => {
    await readWhatItWouldSay()
    expect(await page.locator('textarea.bx-box').count(), 'the box was open before anybody asked').toBe(0)
    await page.getByRole('button', { name: 'Open it in a text box' }).click()
    const box = page.locator('textarea.bx-box')
    await box.waitFor({ timeout: 15_000 })
    const inTheBox = await box.inputValue()
    expect(inTheBox).toContain(THE_TEXT_OPENS_WITH)
    expect(inTheBox.length, 'the box holds less than the copy on the screen').toBeGreaterThan(500)
  })
})
