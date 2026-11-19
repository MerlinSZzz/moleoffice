// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A FAILURE SAYS THE SERVER'S OWN WORDS BY ONE RULE. Wave 13k round 41, piece 1 (decision z_A0xVMbWOzh).
 *
 * Before this, ErrorNote (src/web/components/ui.tsx) drew the server's own English sentence in every mode for a
 * broken answer, while the pixel office showed the server's text only in Developer mode. The rule is now one:
 *
 * WHAT IS CLAIMED: on the record page, in English and Chinese, in Normal and Developer mode, when the record's
 * read fails,
 *   1. a refusal with a code is said by the code's words, and the server's sentence is shown only in Developer
 *      mode, in code.px-server-said;
 *   2. a broken answer (500) is said by 'error.brokenSays', and the server's text is shown only in Developer mode;
 *   3. an answer that never came is said by the page's own sentences, as before, and has no server text to show;
 *   4. a refusal with no code is said by the server's own sentence, as written, as the first line under "Error",
 *      with no general sentence in front of it; the mark 'error.ownWords' comes after it, in BOTH modes, because
 *      it is the only reason the person can act on.
 *
 * THE CASES COVER BOTH HALVES: English in Normal mode, and Chinese in Developer mode.
 *
 * Point 4 followed decision urY1I-insR_8 (wave 13k round 41b), which reads point (4) of z_A0xVMbWOzh under the
 * owner's criterion M43. Round 41 drew a general sentence ("The office refused this.") first and the reason under
 * it, and two of the owner's M43 tests went red at the merge. The expectation changed with the decision.
 *
 * MADE-UP ANSWERS: the page's requests for one record id that does not exist are answered by the test, with
 * sentences marked MADE-UP. None is a real observation.
 *
 * MUTATIONS, each after a control run (the commit that added this file names the logs), one at a time, in
 * ErrorNote:
 *   kind 1 and 2: `serverSaid` drops `inspect &&`, so the server's text shows in every mode. The Normal cases of
 *          kinds 1 and 2 go red.
 *   kind 2: a broken answer's sentence is `fault.message` again. Kind 2 goes red in both modes.
 *   kind 3: the unreachable branch of `sentence` is removed. Kind 3 goes red.
 *   kind 4: `quoted` is always null. Kind 4 goes red in both languages and modes.
 *   kind 4 (round 41b): a general sentence is put back in front of the server's sentence. Kind 4 goes red in both
 *          languages and modes, and so do the owner's two M43 tests (control .scratch/r41b/p1-control.log,
 *          mutation p1-m2, restore p1-restore).
 *
 * Set TEST_SHOTS to keep pictures of kinds 4 and 2 at 1440, 990, 660 and 390, light and dark, English and Chinese.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Page } from 'playwright'
import { liveApp, type LiveApp, waitForThePage } from './helpers.ts'
import { createI18n } from '../src/shared/i18n.ts'
import { TEST_SHOTS, testShots } from './where-shots-go.ts'

const WORDS = { en: createI18n('en'), zh: createI18n('zh') } as const
const LANGUAGES = ['en', 'zh'] as const
const MODES = ['normal', 'inspect'] as const
const RECORD = 'test-r41-failure'

const RAW_CODED = 'MADE-UP coded refusal: this change would empty a saved field'
const RAW_BROKEN = 'MADE-UP broken answer: the record store threw at row 42'
const RAW_REFUSED = 'MADE-UP refusal: this record is held by another run until it finishes'

type Kind = 'coded' | 'broken' | 'unreachable' | 'refused'
let kind: Kind = 'coded'
let app: LiveApp
let page: Page

interface Seen {
  heading: string[]
  sentence: string
  ownMark: string[]
  quoted: string[]
  firstLine: string
  markAfterSentence: boolean
  serverSaid: string[]
  text: string
}

async function look(language: 'en' | 'zh', mode: string, next: Kind, theme = 'light'): Promise<Seen> {
  kind = next
  await page.goto('about:blank')
  await page.goto(`${app.site}/?lang=${language}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.evaluate((theme) => localStorage.setItem('mole-office.preset.theme', theme), theme)
  await page.goto(`${app.site}/?lang=${language}&mode=${mode}#/r/${RECORD}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.locator('main .px-error[role="alert"]').first().waitFor({ timeout: 30_000 })
  return page.evaluate(() => {
    const note = document.querySelector('main .px-error[role="alert"]') as HTMLElement
    const message = note.querySelector('.px-error-msg')!.cloneNode(true) as Element
    for (const part of message.querySelectorAll('.px-error-own, .px-error-more, .px-server-said, .px-error-wire')) part.remove()
    const all = (selector: string) => [...note.querySelectorAll(selector)].map((one) => (one.textContent ?? '').trim())
    const drawn = note.querySelector('.px-error-msg') as HTMLElement
    const said = note.querySelector('.px-error-said')
    const mark = note.querySelector('.px-error-own-mark')
    return {
      heading: all('.px-error-mark strong'),
      sentence: (message.textContent ?? '').trim(),
      ownMark: all('.px-error-own-mark'),
      quoted: all('.px-error-said'),
      firstLine: (drawn.innerText.trim().split('\n')[0] ?? '').trim(),
      markAfterSentence: said !== null && mark !== null && Boolean(said.compareDocumentPosition(mark) & Node.DOCUMENT_POSITION_FOLLOWING),
      serverSaid: all('code.px-server-said'),
      text: document.body.innerText,
    }
  })
}

beforeAll(async () => {
  app = await liveApp({ name: 'failure-server-words', viewport: { width: 1440, height: 1000 }, workspace: 'default' })
  page = app.page
  await page.route(`**/api/records/${RECORD}**`, async (route) => {
    if (kind === 'unreachable') return route.abort('connectionrefused')
    // The real answer's headers are kept, so the page knows the answer came from its own office.
    const response = await route.fetch()
    if (kind === 'coded') return route.fulfill({ response, status: 409, json: { error: RAW_CODED, code: 'recordFieldWouldBeEmptied', values: {} } })
    if (kind === 'broken') return route.fulfill({ response, status: 500, json: { error: RAW_BROKEN } })
    return route.fulfill({ response, status: 403, json: { error: RAW_REFUSED } })
  })
}, 180_000)

afterAll(async () => {
  await app?.stop()
})

describe('a failure on the record page follows the one rule for the server’s words', () => {
  for (const language of LANGUAGES) {
    const t = WORDS[language].t
    for (const mode of MODES) {
      if (!(language === 'en' ? mode === 'normal' : mode === 'inspect')) continue
      const inspect = mode === 'inspect'
      it(`${language}, ${mode}: 1. a refusal with a code`, async () => {
        const seen = await look(language, mode, 'coded')
        expect(seen.sentence).toBe(t('server.recordFieldWouldBeEmptied'))
        expect(seen.quoted).toEqual([])
        expect(seen.serverSaid).toEqual(inspect ? [RAW_CODED] : [])
        if (!inspect) expect(seen.text).not.toContain('MADE-UP')
      }, 120_000)

      it(`${language}, ${mode}: 2. a broken answer`, async () => {
        const seen = await look(language, mode, 'broken')
        expect(seen.sentence).toBe(t('error.brokenSays'))
        expect(seen.quoted).toEqual([])
        expect(seen.serverSaid).toEqual(inspect ? [RAW_BROKEN] : [])
        if (!inspect) expect(seen.text).not.toContain('MADE-UP')
      }, 120_000)

      it(`${language}, ${mode}: 3. an answer that never came`, async () => {
        const seen = await look(language, mode, 'unreachable')
        expect(seen.heading).toEqual([t('frameFiles.api.cannotReach')])
        expect(seen.sentence).toBe(t('error.blank'))
        expect(seen.quoted).toEqual([])
        expect(seen.serverSaid).toEqual([])
      }, 120_000)

      it(`${language}, ${mode}: 4. a refusal with no code says its own sentence first, marked after it`, async () => {
        const seen = await look(language, mode, 'refused')
        // The first line under "Error" is the door's sentence exactly, with nothing in front (urY1I-insR_8).
        expect(seen.firstLine).toBe(RAW_REFUSED)
        expect(seen.sentence).toBe(RAW_REFUSED)
        expect(seen.quoted).toEqual([RAW_REFUSED])
        // And the mark that these are the office's own words comes after it, never before.
        expect(seen.ownMark).toEqual([t('error.ownWords')])
        expect(seen.markAfterSentence).toBe(true)
        expect(seen.serverSaid).toEqual([])
      }, 120_000)
    }
  }

  it.runIf(Boolean(process.env[TEST_SHOTS]))('pictures of kinds 4 and 2 at four widths, light and dark, in both languages', async () => {
    const shots = testShots('failure-server-words')
    for (const theme of ['light', 'dark']) {
      for (const width of [1440, 990, 660, 390]) {
        await page.setViewportSize({ width, height: 900 })
        for (const language of LANGUAGES) {
          for (const [one, mode] of [['refused', 'normal'], ['broken', 'normal'], ['broken', 'inspect']] as const) {
            await look(language, mode, one, theme)
            expect(await page.locator('html').getAttribute('data-theme')).toBe(theme)
            const size = await page.evaluate(() => ({ width: innerWidth, drawn: document.documentElement.scrollWidth }))
            expect(size.drawn, `${one} ${mode} ${language} ${width} ${theme}`).toBeLessThanOrEqual(size.width)
            await page.screenshot({ path: `${shots}/${one}-${mode}-${language}-${width}-${theme}.png` })
          }
        }
      }
    }
    await page.setViewportSize({ width: 1440, height: 1000 })
  }, 580_000)
})
