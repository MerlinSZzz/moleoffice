// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A BROWSER THAT REMEMBERS A PROJECT THE OFFICE DOES NOT HOLD IS TOLD WHAT WENT WRONG.
 *
 * The page starts and draws, and four things on it used to mislead (problem 8rPaS50pfo66):
 *   1. the office's refusal sentence was loose text in the fixed lead box, and at 660 and 390 it
 *      was drawn over Home's clock and Today lines, so neither could be read;
 *   2. the top bar said "server unreachable" while the server was answering every read;
 *   3. Home's red box said the answer "did not carry a reports list at all", blaming the reply
 *      when the reply was a refusal of the project. The reports part has since left Home, and a
 *      refused read must still not be drawn as an empty one: Home's key items, the one part that
 *      says both what failed and what is not there, must say the read failed;
 *   4. the chat button, then a floating button in the corner, was drawn empty, with no picture and no word.
 *
 * Every read of the refused project is refused, the count too, so no corner circle is drawn here. Since
 * design D, at these widths the chat is reached by the top bar's chat press.
 *
 * THE WIDTHS ARE THE ONES THE PROBLEM NAMES: 660 and 390. Each is looked at in light and dark, in
 * English, against a made-up office. The project the browser remembers is made up too, and the
 * office does not hold it.
 *
 * WHAT EACH CASE READS, AND WHY IT IS THE BEHAVIOUR AND NOT A COPY OF IT:
 *   - the refusal sentence's own computed background and border, read from the page, because a
 *     sentence with no box is the fault;
 *   - the top bar's words, read from the word lists rather than written here;
 *   - every box on the page, none of which may carry the reports-list sentence;
 *   - Home's key items, whose read names the refused project: the words for a failed read, and not
 *     the words for no key item, both read from the word lists by their keys. The other parts that
 *     read the page's project have no words for nothing there, or draw nothing when their read
 *     fails, so they are not read here;
 *   - the top bar's chat press: drawn once, with its shape and its word.
 */
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { BrowserContext, Page } from 'playwright'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { WORD_LISTS } from '../src/shared/i18n.ts'

/** A project no office holds. Made up for this file. */
const UNLISTED = 'test-unlisted-lantern'

const WORDS = WORD_LISTS.en as Readonly<Record<string, string>>

let app: LiveApp
const contexts: BrowserContext[] = []

beforeAll(async () => {
  app = await liveApp({ name: 'an-unlisted-project-start', viewport: { width: 1440, height: 900 } })
}, 240_000)

afterAll(async () => {
  for (const context of contexts) await context.close()
  await app?.stop()
}, 60_000)

/** A window whose browser remembers the unlisted project and one theme, before the app's first load. */
async function windowRemembering(width: number, theme: 'light' | 'dark'): Promise<Page> {
  const context = await app.browser.newContext({ viewport: { width, height: 900 }, colorScheme: theme })
  contexts.push(context)
  await context.grantPermissions(['local-network-access'], { origin: app.site })
  await context.addInitScript(`
    localStorage.setItem('mole-office.workspace', ${JSON.stringify(UNLISTED)})
    localStorage.setItem('mole-office.preset.theme', ${JSON.stringify(theme)})
  `)
  const page = await context.newPage()
  await page.goto(`${app.site}/#/`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
  return page
}

it('says the project was refused rather than blaming the server or the reply, at 660 and 390', async () => {
  for (const width of [660, 390]) {
    for (const theme of ['light', 'dark'] as const) {
      const page = await windowRemembering(width, theme)

      // 1. THE REFUSAL SENTENCE HAS A BOX OF ITS OWN. A sentence with no background or border is
      //    drawn straight over whatever the page has underneath it.
      const fault = page.locator('.px-lead-fault').first()
      await fault.waitFor({ timeout: 30_000 })
      const box = await fault.evaluate((element) => {
        const style = getComputedStyle(element)
        return {
          background: style.backgroundColor,
          border: Number.parseFloat(style.borderTopWidth),
          padding: Number.parseFloat(style.paddingTop),
        }
      })
      expect(box.background, `${String(width)} ${theme}: the refusal sentence has no background`).not.toBe(
        'rgba(0, 0, 0, 0)',
      )
      expect(box.border, `${String(width)} ${theme}: the refusal sentence has no border`).toBeGreaterThan(0)
      expect(box.padding, `${String(width)} ${theme}: the refusal sentence has no padding`).toBeGreaterThan(0)

      // 2. THE TOP BAR DOES NOT BLAME A SERVER THAT ANSWERED. It names the project's refusal.
      const pill = page.locator('.shell-bar-status[data-count="urgent"]')
      await pill.waitFor({ timeout: 30_000 })
      const pillWords = (await pill.innerText()).trim()
      expect(pillWords, `${String(width)} ${theme}: the bar says the server is unreachable`).not.toContain(
        WORDS['frameWords.pill.unreachable'],
      )
      expect(pillWords, `${String(width)} ${theme}: the bar does not name the refused project`).toContain(
        WORDS['frameWords.pill.projectRefused'],
      )

      // 3. A REFUSED READ IS NOT DRAWN AS AN EMPTY ONE. The key items' read names the refused
      //    project, so the part says its read failed, in its mark's words, and does not say that no
      //    key item is kept. Its mark is waited for first, so the reads have answered before the
      //    boxes are read.
      const keyItems = page.locator('[data-home-section="keyItems"]')
      const failed = keyItems.locator('.px-mark').first()
      await failed.waitFor({ timeout: 30_000 })
      expect(await failed.getAttribute('title'), `${String(width)} ${theme}: the key items do not say their read failed`).toBe(
        WORDS['home.keyItems.notRead'],
      )
      const keyItemsWords = (await keyItems.innerText()).trim()
      expect(keyItemsWords, `${String(width)} ${theme}: the key items say none is kept`).not.toContain(
        WORDS['home.keyItems.none'],
      )
      expect(await keyItems.locator('[data-home-key-items-none]').count(), `${String(width)} ${theme}: the key items draw their empty line`).toBe(0)
      // AND NO BOX ON THE PAGE BLAMES A REPLY WITHOUT A REPORTS LIST, the fault this file was made for.
      const blaming = page.locator('.px-error, .px-empty').filter({ hasText: WORDS['home.reportListMissing'] })
      expect(await blaming.count(), `${String(width)} ${theme}: a box still blames the reply`).toBe(0)

      // 4. EVERY READ OF THE REFUSED PROJECT IS REFUSED, THE COUNT TOO, SO NO CORNER CIRCLE IS DRAWN
      // HERE. THE TOP BAR'S CHAT PRESS CARRIES THE CHAT AT 660 AND 390, WITH ITS OWN SHAPE AND WORD.
      const chatPress = page.locator('.shell-bar .shell-chat-phone')
      await expect.poll(() => chatPress.count(), { timeout: 30_000 }).toBe(1)
      expect(await chatPress.locator('svg').count(), `${String(width)} ${theme}: the top bar's chat press draws no shape`).toBeGreaterThan(0)
      expect(await chatPress.getAttribute('aria-label'), `${String(width)} ${theme}: the top bar's chat press has no word`).toBe(WORDS['chat.split.open'])
    }
  }
}, 600_000)
