// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE CHAT'S THREE TABS DRAW THEIR NAMES WHOLE, IN EVERY LANGUAGE AND AT EVERY WIDTH.
 *
 * The tabs share the row in equal thirds. A name longer than its third was kept on one line and cut
 * with an ellipsis, so at 660 the Greek middle tab read "Μεταξύ πρακτ…" instead of "Μεταξύ
 * πρακτόρων" (Between agents). A cut name is not a name: the reader cannot tell which list the tab
 * opens. The tabs stay equal thirds; a name that does not fit its third now wraps inside it.
 *
 * The check measures each tab's own text against the box it is drawn in, so a name cut anywhere in
 * the row is red, in any language. English and Greek are both measured, because Greek is where the
 * fault was seen and English is the control that the row still reads as one line there.
 *
 * ONE LOAD FOR EACH LANGUAGE AND LOOK. The page is loaded at 1440 and then resized to 990, 660 and 390, rather than
 * loaded again at each width. Before this was changed, every measurement was taken both ways, after a fresh load at the
 * width and after a resize to it, in every language and both looks; the two were the same in each, and the dark
 * picture differed from the light one both ways at every width.
 */
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { liveApp, theResizeIsDrawn, waitForThePage, type LiveApp } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { LANGUAGES } from '../src/shared/i18n.ts'

const SHOTS = process.env['CHAT_TAB_SHOTS']

let app: LiveApp

beforeAll(async () => {
  app = await liveApp({ name: 'chat-tab-label', viewport: { width: 1440, height: 1000 }, workspace: 'default' })
  await app.context.addInitScript(({ person }) => {
    localStorage.setItem('mole-office.actor', JSON.stringify({ type: 'human', id: person }))
    localStorage.setItem('mole-office.preset.theme', new URLSearchParams(location.search).get('look') ?? 'light')
  }, { person: THE_TEST_OFFICES_OWNER.id })
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 120_000)

interface TabReading {
  text: string
  scrollWidth: number
  clientWidth: number
  lines: number
}

async function open(language: string, look: string): Promise<void> {
  await app.page.goto('about:blank')
  await app.page.goto(`${app.site}/?lang=${language}&look=${look}#/chat`)
  await waitForThePage(app.page, 45_000)
  await app.page.waitForSelector('.px-chat-tab', { state: 'visible', timeout: 30_000 })
}

async function measure(): Promise<{ page: number; window: number; theme: string | null; tabs: TabReading[] }> {
  return await app.page.evaluate(() => ({
    page: document.documentElement.scrollWidth,
    window: document.documentElement.clientWidth,
    theme: document.documentElement.getAttribute('data-theme'),
    tabs: [...document.querySelectorAll('.px-chat-tab')].map((tab) => {
      const word = tab.querySelector('.px-chat-tab-word') ?? tab
      const range = document.createRange()
      range.selectNodeContents(word)
      const tops = new Set([...range.getClientRects()].map((one) => Math.round(one.top)))
      return {
        text: (tab.textContent ?? '').replace(/\s+/g, ' ').trim(),
        scrollWidth: tab.scrollWidth,
        clientWidth: tab.clientWidth,
        lines: tops.size,
      }
    }),
  }))
}

it('draws each tab name whole at four widths, in both themes, in English and Greek', async () => {
  if (SHOTS !== undefined) mkdirSync(SHOTS, { recursive: true })
  const taken: { language: string; look: string; width: number; shot: Buffer; theme: string | null; reading: ReturnType<typeof measure> extends Promise<infer T> ? T : never }[] = []
  const languages = Object.keys(LANGUAGES)
  for (const language of languages) {
    for (const look of ['light', 'dark']) {
      // ONE LOAD FOR EACH LANGUAGE AND LOOK, at the first width; the window is then resized to each of the others, and
      // the reading waits until the page has drawn itself at that width.
      await app.page.setViewportSize({ width: 1440, height: 1000 })
      await open(language, look)
      for (const width of [1440, 990, 660, 390]) {
        await app.page.setViewportSize({ width, height: 1000 })
        await theResizeIsDrawn(app.page)
        const reading = await measure()
        const shot = await app.page.screenshot({
          path: SHOTS === undefined ? undefined : join(SHOTS, `chat-tabs-${language}-${String(width)}-${look}.png`),
          fullPage: true,
        })
        taken.push({ language, look, width, shot, theme: reading.theme, reading })
      }
    }
  }
  for (const language of languages) {
    for (const width of [1440, 990, 660, 390]) {
      const light = taken.find((one) => one.language === language && one.look === 'light' && one.width === width)
      const dark = taken.find((one) => one.language === language && one.look === 'dark' && one.width === width)
      expect(light !== undefined && dark !== undefined, `${language} ${String(width)}: a picture pass is missing`).toBe(true)
      expect(dark!.shot.equals(light!.shot), `${language} ${String(width)}: the dark picture is the light picture`).toBe(false)
    }
  }
  for (const one of taken) {
    const where = `${one.language} ${one.look} ${String(one.width)}`
    expect(one.theme, `${where}: the page is not in the theme asked`).toBe(one.look)
    expect(one.reading.page, `${where}: the chat page is wider than the window`).toBeLessThanOrEqual(one.reading.window + 1)
    expect(one.reading.tabs.length, `${where}: the chat does not draw its three tabs`).toBe(3)
    for (const tab of one.reading.tabs) {
      expect(tab.scrollWidth, `${where}: the tab ${JSON.stringify(tab.text)} is cut`).toBeLessThanOrEqual(tab.clientWidth + 1)
    }
  }
}, 600_000)
