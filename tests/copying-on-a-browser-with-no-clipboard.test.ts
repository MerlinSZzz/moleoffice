// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * CRITERION B28: A COPY PRESS ON A BROWSER WITH NO CLIPBOARD SAYS SO, AND HANDS THE TEXT OVER ANYWAY.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THE OWNER REPORTED, AND WHAT WAS MEASURED
 * ---------------------------------------------------------------------------------------
 *
 * On a browser with no clipboard, the person
 * pressed copy on their other computer, nothing came over, and on this machine it copies fine.
 * `design/bundle/ACCEPTANCE.md`, criterion B28.
 *
 * MEASURED THE SAME DAY on one stack served on two addresses at once, before anything was changed:
 *
 *   http://127.0.0.1:<port>          isSecureContext true    navigator.clipboard  object
 *   http://<this machine>:<port>     isSecureContext false   navigator.clipboard  undefined
 *
 * and on the second of those, pressing `Copy this text` wrote nothing and the only words anywhere
 * were *Mole Office did not hand this over. Cannot read properties of undefined (reading
 * 'writeText')*, in a note whose top was 1,152 pixels above the button, in a window 1,000 pixels
 * tall. Pressing `Copy it` on a filed row recorded export 1 and said *The text is below; select it
 * and copy it yourself* — with no text below it: `.bx-text` was not on the page at all.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS MACHINE'S OWN NAME, AND NOT `127.0.0.2`
 * ---------------------------------------------------------------------------------------
 *
 * `127.0.0.2` is what the other tests of another machine use, and it cannot produce this case:
 * measured 7 September 2026, Chromium treats every address in 127.0.0.0/8 as trustworthy, so a page
 * on `http://127.0.0.2:<port>` is a secure context and has a clipboard, exactly like 127.0.0.1.
 *
 * This machine's own host name is what the other computer's case really is. It resolves to a loopback address
 * — 127.0.1.1 on a Debian-shaped machine — so the stack is reachable from nowhere but this machine,
 * and it is a NAME rather than a loopback literal, which is what makes a browser call the page
 * insecure. The first test asserts that the browser really has no clipboard there, so this file
 * cannot pass quietly on a machine where the address turns out to be trustworthy after all.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE PINS
 * ---------------------------------------------------------------------------------------
 *
 *   1. THE TWO CASES ARE REALLY THE TWO CASES: a clipboard on one address and none on the other.
 *   2. WHERE THERE IS A CLIPBOARD, the copy still copies and nothing is said about failing.
 *   3. WHERE THERE IS NOT, the page says so, in one line, under the button that was pressed, in
 *      words about the page and not about a JavaScript variable.
 *   4. AND THE TEXT IS STILL THERE TO TAKE: selecting the whole of it works, and saving it as a
 *      file hands over a file holding the copy. The file's name is drawn on a row of its own, under
 *      the label that says the browser was handed it, and no sentence holds it.
 *   5. ON THE PRESS THE OWNER PRESSED — `Copy it` on a filed row — the export is still recorded, and the
 *      text the sentence points at really is on the page this time.
 *
 * TWO MUTATIONS, MEASURED 7 SEPTEMBER 2026, after a control run of this file green (5 of 5):
 *
 *   in `src/web/lib/clipboard.ts`, make `putOnTheClipboard` return `{ wrote: true }` when there is
 *   no door — the old behaviour of a press that claimed to have copied     3 of 5 red (3, 4, 5)
 *
 *   in `src/web/components/BundlePanel.tsx`, make a row press say the text is already on screen
 *   when it is not, which is what the old sentence *The text is below* did  1 of 5 red (5)
 *
 * Restored, five of five pass. Tests 1 and 2 stay green under both, which is right: they are the
 * two guards — that the case being measured is real, and that a working clipboard is untouched.
 */
import os from 'node:os'
import { readFileSync } from 'node:fs'
import type { Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { join } from 'node:path'
import { liveApp, trustTheMachineThatCallsThroughTheOtherDoor, waitForThePage, type LiveApp } from './helpers.ts'
import { createI18n, type WordKey } from '../src/shared/i18n.ts'

/**
 * THE ADDRESS THAT IS NOT A SECURE CONTEXT: this machine's own name, lower-cased because that is
 * what a browser puts in the Host header and what Vite is told to allow.
 */
const THIS_MACHINE = os.hostname().toLowerCase()

/** What this file puts in the corpus, so finding it proves the copy carried this project. */
const PROBLEM = 'The far edge of the tray is not segmented at 40 cm'
/** The opening line of every assembled copy. It is in the text and in no title. */
const THE_TEXT_OPENS_WITH = 'CONTEXT FROM MOLE OFFICE'

let app: LiveApp
let page: Page
/** Where the same stack answers on the address that is not a secure context. */
let insecureSite = ''

beforeAll(async () => {
  app = await liveApp({
    name: 'bundle-no-clipboard',
    viewport: { width: 1440, height: 1000 },
    addressForOtherMachines: THIS_MACHINE,
  })
  page = app.page
  insecureSite = `http://${THIS_MACHINE}:${String(app.webPort)}`
  // THE PAGE ON THIS MACHINE'S NAME IS THE CASE OF THE OWNER'S OTHER COMPUTER, WHICH THE OWNER TRUSTS. Its requests carry the owner's name
  // and no key. Since item 1 of a decision, that counts as the owner only from a machine the office trusts while the
  // window is open. `trustTheMachineThatCallsThroughTheOtherDoor` in tests/helpers.ts says how.
  await trustTheMachineThatCallsThroughTheOtherDoor(
    { api: app.api, keysFile: join(app.dir, 'keys.json') },
    `http://${THIS_MACHINE}:${String(app.apiPort)}`,
  )
  // THE CLIPBOARD IS ASKED FOR ON THE SECURE ADDRESS RATHER THAN ASSUMED. A headless Chromium
  // refuses a clipboard write by default, and a test that read that refusal as a product fault
  // would be measuring the browser.
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: app.site })

  const res = await fetch(`http://127.0.0.1:${String(app.apiPort)}/api/records`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      kind: 'problem',
      title: PROBLEM,
      summary: 'Segmentation drops the far edge of the tray at forty centimetres.',
      data: { symptom: 'Segmentation drops the far edge.', state: 'open' },
    }),
  })
  if (!res.ok) throw new Error(`the seed problem was not filed: ${String(res.status)} ${await res.text()}`)
}, 300_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

/**
 * Open the bundles page at one of the two addresses, and wait until the page says it has drawn.
 *
 * THE PAGE'S OWN MARK IS WAITED FOR BEFORE THE HEADING. On 25 September 2026 this file went red in
 * two whole-suite runs with a wait for the heading that ran out. The page had never started: the
 * shared test page was built again while this file ran. A wait for the heading could only say the
 * heading was missing. `waitForThePage` says whether the app ran at all, and what it was waiting for.
 */
async function openTheBundlesPage(site: string): Promise<void> {
  await page.goto(`${site}/#/bundles`, { waitUntil: 'domcontentloaded' })
  await waitForThePage(page)
  await page.waitForSelector('.px-page h1')
}

/** Open the bundles page at one of the two addresses and read the text a copy would hand over. */
async function readWhatItWouldSay(site: string): Promise<void> {
  await page.goto(`${site}/#/bundles`, { waitUntil: 'domcontentloaded' })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await waitForThePage(page)
  await page.waitForSelector('.px-page h1')
  // CRITERION B33 REMOVED THE *Choose a reading* PRESS. The controls are on the page on arrival.
  await page.waitForSelector('#bx-preset')
  await page.getByRole('button', { name: 'Read what it would say' }).click()
  await page.waitForSelector('.bx-text')
}

/** What this browser has on this page, read from the page rather than assumed from the address. */
async function whatThisBrowserHas(): Promise<{ secure: boolean; clipboard: string }> {
  return await page.evaluate(() => ({
    secure: window.isSecureContext,
    clipboard: typeof navigator.clipboard,
  }))
}

/** How many exports the server has recorded for every filed bundle, read from the server. */
async function exportsRecorded(): Promise<number> {
  const listed = (await (await fetch(`http://127.0.0.1:${String(app.apiPort)}/api/bundles`)).json()) as {
    bundles: { exports: unknown[] }[]
  }
  return listed.bundles.reduce((n, one) => n + one.exports.length, 0)
}

describe('a copy press on a browser with no clipboard', () => {
  it('really is two cases: a clipboard on one address and none on the other', async () => {
    await openTheBundlesPage(app.site)
    expect(await whatThisBrowserHas(), 'the secure address is not a secure context').toEqual({
      secure: true,
      clipboard: 'object',
    })
    await openTheBundlesPage(insecureSite)
    expect(
      await whatThisBrowserHas(),
      `http://${THIS_MACHINE} is a secure context on this machine, so this file measures nothing`,
    ).toEqual({ secure: false, clipboard: 'undefined' })
  }, 180_000)

  it('copies, and says nothing about failing, where there is a clipboard', async () => {
    await readWhatItWouldSay(app.site)
    await page.evaluate(async () => navigator.clipboard.writeText('nothing has been copied yet'))
    await page.getByRole('button', { name: 'Copy the bundle', exact: true }).click()
    await page.waitForSelector('button:has-text("Copied")', { timeout: 15_000 })

    const onTheClipboard = await page.evaluate(async () => navigator.clipboard.readText())
    expect(onTheClipboard, 'the press wrote nothing').not.toBe('nothing has been copied yet')
    expect(onTheClipboard).toContain(THE_TEXT_OPENS_WITH)

    // THE OTHER WAYS OUT ARE THERE, AND THEY SAY NOTHING ABOUT FAILING.
    //
    // This line asserted that the block was absent until 8 September 2026, and the second criterion
    // of bundle-5 is why it changed: the block held the only two presses that open the copy as a
    // page of text or in a text box, so reaching either meant first making a copy fail. The block
    // stands beside the copy now; what a failed press adds is the sentence saying so.
    expect(await page.locator('.bx-nocopy').count(), 'the ways out are not on the page').toBe(1)
    const why = await page.locator('.bx-nocopy-why').innerText()
    expect(why, 'a working copy said it could not copy').not.toContain('Nothing was copied')
    expect(why, 'a working copy showed the browser words about a variable').not.toContain('writeText')
  }, 180_000)

  it('says it could not copy, under the button that was pressed, in words about the page', async () => {
    await readWhatItWouldSay(insecureSite)
    await page.getByRole('button', { name: 'Copy the bundle', exact: true }).click()
    const block = page.locator('.bx-nocopy')
    await block.waitFor({ timeout: 15_000 })

    // ONE LINE, AND IT IS ABOUT THE PAGE. The words a person got before this were the browser's
    // about an undefined variable, so both halves of that are asserted.
    const why = await page.locator('.bx-nocopy-why').innerText()
    expect(why, 'the page still shows the browser words about a variable').not.toContain('writeText')
    expect(why).toContain('Nothing was copied')
    expect(why, 'nothing says why this browser has no clipboard').toContain('https')
    expect(why.split('\n').filter((line) => line.trim() !== ''), 'the answer is more than one line').toHaveLength(1)

    // WHERE IT WAS PRESSED. Both are measured from the top of the document, so the number is the
    // distance a person would have to scroll to find the answer to their own press.
    // SINCE ROUND 10E THE PRESS IS COPY THE BUNDLE, AT THE PAGE'S HEAD, and its answer under it is one
    // line pointing at the preview, where the reason above and the other ways out stand beside the text.
    const near = await page.evaluate(() => {
      const note = document.querySelector('.bxp-notcopied')
      const button = document.querySelector('.px-page .px-btn[data-variant="primary"]')
      if (note === null || button === null) return null
      return Math.round(
        note.getBoundingClientRect().top - button.getBoundingClientRect().bottom,
      )
    })
    expect(near, 'the answer is not drawn under the button that was pressed').not.toBeNull()
    expect(near ?? 1e9, 'the answer is a screenful away from the press').toBeLessThan(200)
    expect(near ?? -1e9, 'the answer is drawn above the press').toBeGreaterThan(-1)

    // AND THE BUTTON DOES NOT CLAIM IT COPIED.
    expect(await page.locator('.px-page .px-btn[data-variant="primary"]').innerText()).not.toContain('Copied')
  }, 180_000)

  it('still hands the text over: selected whole, and as a file', async () => {
    await readWhatItWouldSay(insecureSite)
    await page.getByRole('button', { name: 'Copy the bundle', exact: true }).click()
    const block = page.locator('.bx-nocopy')
    await block.waitFor({ timeout: 15_000 })
    // THE COPY IS ALREADY ON THE SCREEN HERE, so the block points at it rather than drawing it a
    // second time. A page holding a whole context bundle twice is the thing this asserts against.
    expect(await block.locator('pre').count(), 'the text is drawn twice on one page').toBe(0)

    await block.getByRole('button', { name: 'Select the whole text' }).click()
    const selected = await page.evaluate(() => window.getSelection()?.toString() ?? '')
    expect(selected, 'nothing was selected').toContain(THE_TEXT_OPENS_WITH)
    expect(selected, 'the selection carries no record of this project').toContain(PROBLEM)

    const coming = page.waitForEvent('download', { timeout: 30_000 })
    await block.getByRole('button', { name: 'Save it as a file' }).click()
    const file = await coming
    const where = await file.path()
    expect(where, 'the browser was handed no file').not.toBeNull()
    const inside = readFileSync(where, 'utf8')
    expect(inside).toContain(THE_TEXT_OPENS_WITH)
    expect(inside, 'the file carries no record of this project').toContain(PROBLEM)
    expect(file.suggestedFilename()).toMatch(/\.txt$/)

    // THE FILE'S NAME IS A ROW OF ITS OWN, under the label that says the browser was handed it, and no sentence holds it.
    const handed = createI18n('en').t('frameFiles.row.handed' as WordKey)
    const term = block.locator('dl.code-rows dt', { hasText: handed })
    await term.waitFor()
    expect(await term.evaluate((one) => ({
      label: one.textContent ?? '',
      tag: one.nextElementSibling?.firstElementChild?.tagName ?? 'none',
      value: one.nextElementSibling?.firstElementChild?.textContent ?? '',
    }))).toEqual({ label: handed, tag: 'CODE', value: file.suggestedFilename() })
    for (const said of await block.locator('p').allTextContents()) {
      expect(said, 'a sentence holds the file name').not.toContain(file.suggestedFilename())
    }
  }, 180_000)

  it('records the export on the press the owner pressed, and puts the text it names on the page', async () => {
    await readWhatItWouldSay(insecureSite)
    await page.getByRole('button', { name: /^Keep it for later/ }).click()
    await page.waitForSelector('.bx-said')
    const row = page.locator('.bx-row').first()
    await row.waitFor({ timeout: 15_000 })
    const before = await exportsRecorded()

    await row.getByRole('button', { name: 'Copy it' }).click()
    const block = row.locator('.bx-nocopy')
    await block.waitFor({ timeout: 30_000 })

    // THE EXPORT IS THE RECORD AND THE CLIPBOARD IS NOT. It is written by the server whether or not
    // this browser can copy, and the page says so.
    expect(await exportsRecorded(), 'the export was not recorded').toBe(before + 1)
    expect(await page.locator('.bx-said').innerText()).toContain('Mole Office kept what it carried')

    // AND THE TEXT REALLY IS THERE THIS TIME. The sentence a row press printed before this said
    // *The text is below* on a page holding no copy at all.
    const shown = await block.locator('pre').innerText()
    expect(shown, 'the block names a text it does not draw').toContain(THE_TEXT_OPENS_WITH)
    await block.getByRole('button', { name: 'Select the whole text' }).click()
    const selected = await page.evaluate(() => window.getSelection()?.toString() ?? '')
    expect(selected, 'the text on a filed row cannot be selected').toContain(THE_TEXT_OPENS_WITH)
  }, 240_000)
})
