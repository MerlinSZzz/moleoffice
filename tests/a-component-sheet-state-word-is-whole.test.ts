// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE COMPONENT SHEET DRAWS EVERY INTERFACE STATE WORD WHOLE.
 *
 * The section "Severity is a fixed column" shows a row's severity column at its real 112 pixels.
 * That column holds an interface state word, and .px-chip keeps an interface word on one line with
 * an ellipsis; only a stored word (.px-chip-stored) was allowed to wrap. The longer translated
 * words therefore could not fit: Greek Μπλοκαρισμένο needs 116 pixels and gets 76, Italian
 * "Non riuscito" needs 88, Spanish "Por hacer" needs 65 and gets 63. The page itself is exactly the
 * window width at every width, so measuring only the page finds nothing; the test measures each
 * word's own text against the box that holds it, as the walk does.
 *
 * English is the control: its words fit the column and stay on one line. Greek, Spanish and Italian
 * are where the fault was seen. When SHEET_WORD_SHOTS names a folder, the pictures are the section
 * itself, at 1440 and 390, in the light theme, in those four languages.
 */
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'

const SHOTS = process.env['SHEET_WORD_SHOTS']
const LANGUAGES = ['en', 'el', 'es', 'it'] as const
const WIDTHS = [1440, 390] as const

let app: LiveApp

beforeAll(async () => {
  app = await liveApp({ name: 'sheet-state-word', viewport: { width: 1440, height: 1000 }, workspace: 'default' })
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 120_000)

interface WordReading {
  text: string
  scrollWidth: number
  clientWidth: number
}

interface Reading {
  pageWidth: number
  window: number
  theme: string | null
  words: WordReading[]
}

async function openAndMeasure(page: import('playwright').Page, language: string, look: string, width: number): Promise<Reading> {
  await page.setViewportSize({ width, height: 1000 })
  await page.goto('about:blank')
  await page.goto(`${app.site}/?lang=${language}#/ui`)
  await waitForThePage(page, 45_000)
  await page.waitForSelector('.px-row-sev .px-chip-word', { state: 'visible', timeout: 30_000 })
  return await page.evaluate(() => ({
    pageWidth: document.documentElement.scrollWidth,
    window: document.documentElement.clientWidth,
    theme: document.documentElement.getAttribute('data-theme'),
    words: [...document.querySelectorAll('.px-row-sev .px-chip-word')].map((word) => ({
      text: (word.textContent ?? '').replace(/\s+/g, ' ').trim(),
      scrollWidth: word.scrollWidth,
      clientWidth: word.clientWidth,
    })),
  }))
}

it('draws each state word in the severity column whole, at the widest and the narrowest width, in the light theme', async () => {
  if (SHOTS !== undefined) mkdirSync(SHOTS, { recursive: true })
  const taken: { language: string; look: string; width: number; theme: string | null; reading: Reading }[] = []
  const look = 'light'
  for (const language of LANGUAGES) {
    const context = await app.browser.newContext({ viewport: { width: 1440, height: 1000 } })
    await context.addInitScript(({ person, theme }: { person: string; theme: string }) => {
      localStorage.setItem('mole-office.actor', JSON.stringify({ type: 'human', id: person }))
      localStorage.setItem('mole-office.preset.theme', theme)
    }, { person: THE_TEST_OFFICES_OWNER.id, theme: look })
    const page = await context.newPage()
    for (const width of WIDTHS) {
      const reading = await openAndMeasure(page, language, look, width)
      // The second section that carries a row's state word is the one showing the fixed severity
      // column, where the longer translated words were cut. It is chosen by that position rather
      // than by a heading word, because a heading word is a value another line may change.
      const section = page.locator('section.px-sheet-sec').filter({ has: page.locator('.px-row-sev .px-chip-word') }).nth(1)
      if (SHOTS !== undefined) await section.screenshot({ path: join(SHOTS, `sheet-state-word-${language}-${String(width)}-${look}.png`) })
      taken.push({ language, look, width, theme: reading.theme, reading })
    }
    await context.close()
  }

  for (const one of taken) {
    const where = `${one.language} ${one.look} ${String(one.width)}`
    expect(one.theme, `${where}: the page is not in the theme asked`).toBe(one.look)
    expect.soft(one.reading.pageWidth, `${where}: the component sheet is wider than its window`).toBeLessThanOrEqual(one.reading.window + 1)
    expect.soft(one.reading.words.length, `${where}: the severity column draws no state word`).toBeGreaterThan(0)
    for (const word of one.reading.words) {
      expect.soft(word.scrollWidth, `${where}: the state word ${JSON.stringify(word.text)} is cut`).toBeLessThanOrEqual(word.clientWidth + 1)
    }
  }
}, 600_000)
