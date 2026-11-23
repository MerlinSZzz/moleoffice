// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT THE COPY BUTTONS ON THE BUNDLES PAGE ACTUALLY PUT ON THE CLIPBOARD, READ BACK.
 *
 * ---------------------------------------------------------------------------------------
 * THE OWNER'S REPORT THIS FILE MEASURES
 * ---------------------------------------------------------------------------------------
 *
 * THE REPORT: a test bundle was made and copy was pressed, and what came out
 * was the title rather than the content. Criterion B23 of `design/bundle/ACCEPTANCE.md`: pressing
 * copy puts the assembled text on the clipboard, never the title, measured with the text pasted
 * back.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS MEASURED BEFORE THIS FILE EXISTED, AND WHAT IT FOUND
 * ---------------------------------------------------------------------------------------
 *
 * On 6 September 2026 the owner's own bundle `YLTnq_xQ-MKy` was pressed again on a copy of the owner's database,
 * in a real browser, and the clipboard was read back: 25,044 characters of assembled text in
 * Chromium and 24,798 in Firefox. The owner's own export ledger recorded 25,047 characters at the moment
 * the owner pressed it. So the clipboard was not where the owner's copy went wrong, and nothing here claims a fix
 * for something that was working: this file PINS the behaviour asked for, so that a change
 * which put a title, an id or an empty string on the clipboard fails a test instead of reaching
 * the owner. What the owner's copy really carried is problem `I8t-4xWcIp8h`.
 *
 * ---------------------------------------------------------------------------------------
 * THREE BUTTONS COPY ON THIS PAGE AND ALL THREE ARE READ BACK HERE
 * ---------------------------------------------------------------------------------------
 *
 *   Copy this text — records nothing     `copyTheText`, from the preview on screen
 *   File this and hand it over           `fileAndHand`, which files, exports and copies
 *   Copy it, on a filed row              `hand`, which exports an already filed bundle
 *
 * The third is the one the owner pressed. Only the first had any clipboard readback before this file, in
 * `tests/the-person-chooses-the-parts-and-copies-them.test.ts`, and the other two were asserted by
 * the sentence the page prints — which is a sentence about a clipboard write rather than the write.
 *
 * THE ASSERTION IS NOT "SOMETHING LONG ARRIVED". It is that what arrived carries a record this
 * file put in the corpus itself, and that it is not the bundle's own name. A test that only
 * measured the length would pass with the whole page's text on the clipboard.
 *
 * MUTATION, MEASURED 6 SEPTEMBER 2026: in `src/web/components/BundlePanel.tsx`, make the row's
 * button `onClick={() => void navigator.clipboard.writeText(row.title)}` and make `copyTheText`
 * write `name` instead of `preview.text`. Both tests below go red, each on the line that says the
 * clipboard held the title. Restored, both pass.
 */
import type { Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { liveApp, type LiveApp } from './helpers.ts'

let app: LiveApp
let page: Page

/**
 * WHAT THIS FILE PUTS IN THE CORPUS, so that finding it on the clipboard means the copy carried
 * this project's records rather than any long string the page happened to have.
 */
const PROBLEM = 'The far edge of the tray is not segmented at 40 cm'
const PROBLEM_SUMMARY = 'Segmentation drops the far edge of the tray at forty centimetres.'
/** The opening line of every assembled copy. It is in the text and it is in no title. */
const THE_TEXT_OPENS_WITH = 'CONTEXT FROM MOLE OFFICE'

beforeAll(async () => {
  app = await liveApp({ name: 'bundle-clipboard', viewport: { width: 1440, height: 1000 } })
  page = app.page
  // THE CLIPBOARD IS ASKED FOR RATHER THAN ASSUMED. A headless Chromium refuses a clipboard write
  // by default, and a test that read that refusal as a product fault would be measuring the browser.
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: app.site })

  const res = await fetch(`http://127.0.0.1:${String(app.apiPort)}/api/records`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      kind: 'problem',
      title: PROBLEM,
      summary: PROBLEM_SUMMARY,
      data: { symptom: 'Segmentation drops the far edge.', state: 'open' },
    }),
  })
  if (!res.ok) throw new Error(`the seed problem was not filed: ${String(res.status)} ${await res.text()}`)
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

/** Open the page and read the text the copy would hand over. */
async function readWhatItWouldSay(): Promise<void> {
  await page.goto(`http://127.0.0.1:${String(app.webPort)}/#/bundles`, { waitUntil: 'domcontentloaded' })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.px-page h1')
  // CRITERION B33 REMOVED THE *Choose a reading* PRESS. The controls are on the page on arrival.
  await page.waitForSelector('#bx-preset')
  await page.getByRole('button', { name: 'Read what it would say' }).click()
  await page.waitForSelector('.bx-text')
}

/** What the browser's clipboard holds right now, read through the page. */
async function theClipboard(): Promise<string> {
  return await page.evaluate(async () => navigator.clipboard.readText())
}

/** The name in the box, which is the title the bundle will be filed under. */
async function theNameInTheBox(): Promise<string> {
  return await page.$eval('.bx-name', (box) => (box as HTMLInputElement).value)
}

describe('the copy buttons put the assembled text on the clipboard and never the title', () => {
  /**
   * Mutation: make `copyTheText` write `name` rather than `preview.text`.
   *
   * THE CLIPBOARD IS SET TO A MARKER FIRST, so that a press which writes nothing at all is told
   * apart from one that writes the text. Without it, a clipboard left holding the previous test's
   * copy would read exactly like a working button.
   */
  it('copies what is on the screen, and it is the text rather than the name', async () => {
    await readWhatItWouldSay()
    const name = await theNameInTheBox()
    await page.evaluate(async () => navigator.clipboard.writeText('nothing has been copied yet'))

    await page.getByRole('button', { name: 'Copy the bundle', exact: true }).click()
    await page.waitForSelector('button:has-text("Copied")', { timeout: 15_000 })

    const onTheClipboard = await theClipboard()
    expect(onTheClipboard, 'the press wrote nothing').not.toBe('nothing has been copied yet')
    expect(onTheClipboard, 'the clipboard holds the bundle name and not the text').not.toBe(name)
    expect(onTheClipboard).toContain(THE_TEXT_OPENS_WITH)
    expect(onTheClipboard, 'the copy carries no record of this project').toContain(PROBLEM)
  }, 120_000)

  /**
   * Mutation: in `hand`, write `row.title` rather than `done.text`.
   *
   * THIS IS THE BUTTON THE OWNER PRESSED. The page files the bundle first, so the row is one this test
   * made, and the title it is filed under is the one the mutation would put on the clipboard.
   */
  it('copies the text on a filed row, where the owner pressed it', async () => {
    await readWhatItWouldSay()
    const name = await theNameInTheBox()
    await page.getByRole('button', { name: /^Keep it for later/ }).click()
    await page.waitForSelector('.bx-said')

    const row = page.locator('.bx-row', { hasText: name }).first()
    await row.waitFor({ timeout: 15_000 })
    await page.evaluate(async () => navigator.clipboard.writeText('nothing has been copied yet'))
    await row.getByRole('button', { name: 'Copy it' }).click()
    // THE PAGE'S OWN SENTENCE ABOUT THE PRESS, waited for rather than slept through. It says
    // which of the two happened, and this test refuses the one that says the browser blocked it.
    await page.waitForFunction(
      () => (document.querySelector('.bx-said')?.textContent ?? '').includes('Export'),
      undefined,
      { timeout: 30_000 },
    )
    const said = (await page.textContent('.bx-said')) ?? ''
    expect(said, 'this browser refused the clipboard write, so nothing below is about the product').toContain(
      'is on your clipboard',
    )

    const onTheClipboard = await theClipboard()
    expect(onTheClipboard, 'the press wrote nothing').not.toBe('nothing has been copied yet')
    expect(onTheClipboard, 'the clipboard holds the bundle title and not the text').not.toBe(name)
    expect(onTheClipboard.trim()).not.toBe(name.trim())
    expect(onTheClipboard).toContain(THE_TEXT_OPENS_WITH)
    expect(onTheClipboard, 'the copy carries no record of this project').toContain(PROBLEM)
  }, 180_000)

  /** Mutation: in `fileAndHand`, copy the name instead of calling `hand`. */
  it('copies the text on the one press that files and hands over together', async () => {
    await readWhatItWouldSay()
    const name = await theNameInTheBox()
    await page.evaluate(async () => navigator.clipboard.writeText('nothing has been copied yet'))
    await page.getByRole('button', { name: 'File this and hand it over' }).click()
    await page.waitForFunction(
      () => (document.querySelector('.bx-said')?.textContent ?? '').includes('Export'),
      undefined,
      { timeout: 30_000 },
    )
    const said = (await page.textContent('.bx-said')) ?? ''
    expect(said, 'this browser refused the clipboard write, so nothing below is about the product').toContain(
      'is on your clipboard',
    )

    const onTheClipboard = await theClipboard()
    expect(onTheClipboard, 'the press wrote nothing').not.toBe('nothing has been copied yet')
    expect(onTheClipboard, 'the clipboard holds the bundle title and not the text').not.toBe(name)
    expect(onTheClipboard).toContain(THE_TEXT_OPENS_WITH)
    expect(onTheClipboard, 'the copy carries no record of this project').toContain(PROBLEM)
  }, 180_000)
})
