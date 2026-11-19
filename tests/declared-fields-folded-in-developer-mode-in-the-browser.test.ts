// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * EVERY FIELD A KIND DECLARES IS A CLOSED FOLD IN DEVELOPER MODE. This is item 2 of a decision.
 *
 * The record page's panel "Every field this kind declares, and what you can write here" lists every
 * field of the record's kind, with a box for each one this page can write. It is drawn only in
 * developer mode, and it was drawn open: round 18 measured it at 1,017 px at 1440, the tallest thing on
 * a developer page. It now folds the way the stored fields fold: a closed fold
 * of one line, which says how many of the fields can be written here, and one press opens it.
 *
 * One made-up problem record is opened in a real browser, on a test office with a database of its
 * own, in developer mode (`?mode=inspect`), in English and in Chinese, at 1440 and at 390. On every
 * load:
 *   1. the fold is there and is closed;
 *   2. the closed fold is one line high: its summary does not wrap, and nothing below it takes room;
 *   3. its line holds the panel's own count, "9 of 17 writable here" (the word g2b.declared.writable,
 *      with the numbers worked out here from KIND_SPECS and controlFor);
 *   4. the field list inside is not visible;
 *   5. one press on the summary opens it, and every declared key of the kind is then visible.
 *
 * THE MUTATION THAT TURNS THIS RED, after a green control run: in src/web/pages/RecordPage.tsx
 * (DeclaredFields), the fold given the `open` attribute (`<details className="rd-fold" open ...>`),
 * so the panel is drawn open again. Every case fails on "the fold is not closed on load".
 *
 * MEASUREMENTS AND PICTURES. With TEST_SHOTS naming a folder, the second case photographs the record
 * in developer mode at 1440 and 390 in light and dark, and at 1440 in Chinese, and writes the height
 * of the declared fields, of the stored fields and of the page to measurements.json. It measures on
 * any build, so the same case gives the "before" numbers on a build where the panel is still open.
 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { Page } from 'playwright'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { testShots } from './where-shots-go.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { KIND_SPECS } from '../src/shared/kinds.ts'
import { createI18n } from '../src/shared/i18n.ts'

const headers = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/** A made-up problem, about a made-up kiln, with some of its fields written. */
const DATA = {
  symptom: 'The made-up kiln stops at 900 degrees on the third firing of the day.',
  cause: 'The relay on the second element runs hot after two firings.',
  why_it_hurts: 'The glaze on the third batch stays dull.',
  state: 'open',
  whose_move: 'agent',
}

const shots = testShots('declared-fields-fold')
let app: LiveApp
let recordId = ''
/** The panel's own count, in each language, as the page words it. */
const COUNT: Record<'en' | 'zh', string> = { en: '', zh: '' }
const KEYS = KIND_SPECS.problem.fields.map((field) => field.key)

beforeAll(async () => {
  const rp = await import('../src/web/pages/RecordPage.tsx')
  const writable = KIND_SPECS.problem.fields.filter((field) => {
    const at = rp.controlFor('problem', field).at
    return at !== 'elsewhere' && at !== 'no-control'
  }).length
  for (const language of ['en', 'zh'] as const) {
    COUNT[language] = createI18n(language).t('g2b.declared.writable', { n: KEYS.length, writable })
  }
  app = await liveApp({ name: 'declared-fields-fold', workspace: 'default', viewport: { width: 1440, height: 1000 } })
  // THE FOLD'S OPENING IS A 240 MS ANIMATION. These cases read the content behind a fold, so the
  // animation is off and the content is there the moment the press opens it.
  await app.page.emulateMedia({ reducedMotion: 'reduce' })
  app.page.setDefaultTimeout(20_000)
  const response = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ kind: 'problem', title: 'Made-up kiln stops early', data: DATA }),
  })
  expect(response.status, await response.clone().text()).toBe(201)
  recordId = (await response.json()).record.id as string
}, 180_000)

afterAll(async () => { await app?.stop() }, 120_000)

/** Open the record in developer mode, in one language, and wait until the page has settled. */
async function open(page: Page, language: 'en' | 'zh'): Promise<void> {
  const search = language === 'en' ? 'mode=inspect' : 'mode=inspect&lang=zh'
  // A REAL LOAD EVERY TIME. The same address twice is a move inside the page, not a load, and the
  // fold a press opened would still be open.
  await page.goto('about:blank')
  await page.goto(`${app.site}/?${search}#/r/${recordId}`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.locator('article.rp .rd-rail').waitFor({ timeout: 30_000 })
  await waitForThePage(page, 60_000)
}

it('draws every declared field as a closed fold of one line with its count, that opens with one press, in English and Chinese, at 1440 and 390', async () => {
  expect(COUNT.en).toMatch(/\d+ of \d+/)
  const wrong: string[] = []
  for (const language of ['en', 'zh'] as const) {
    for (const width of [1440, 390]) {
      const where = `${language} at ${width}`
      await app.page.setViewportSize({ width, height: 1000 })
      await open(app.page, language)
      const fold = app.page.locator('article.rp details[data-testid="declared-fields"]')
      if ((await fold.count()) !== 1) {
        wrong.push(`${where}: there is no declared-fields fold`)
        continue
      }
      const closed = await fold.evaluate((element) => {
        const details = element as HTMLDetailsElement
        const summary = details.querySelector(':scope > summary') as HTMLElement
        const css = getComputedStyle(summary)
        const lineHeight = Number.parseFloat(css.lineHeight)
        return {
          open: details.open,
          fold: details.getBoundingClientRect().height,
          summary: summary.getBoundingClientRect().height,
          // One line: the summary's own padding plus one line of its text, with a pixel to spare.
          oneLine: lineHeight + Number.parseFloat(css.paddingTop) + Number.parseFloat(css.paddingBottom) + 1,
          text: summary.innerText,
        }
      })
      if (closed.open) wrong.push(`${where}: the fold is not closed on load`)
      if (closed.summary > closed.oneLine) wrong.push(`${where}: the summary "${closed.text}" is ${closed.summary}px, more than one line (${closed.oneLine}px)`)
      if (closed.fold > closed.summary + 1) wrong.push(`${where}: the closed fold is ${closed.fold}px, taller than its one-line summary (${closed.summary}px)`)
      if (!closed.text.includes(COUNT[language])) wrong.push(`${where}: the summary "${closed.text}" does not hold the count "${COUNT[language]}"`)
      if (await fold.locator('.fw-list').isVisible()) wrong.push(`${where}: the field list is visible while the fold is closed`)

      await fold.locator(':scope > summary').click()
      if (!(await fold.evaluate((element) => (element as HTMLDetailsElement).open))) wrong.push(`${where}: one press did not open the fold`)
      if (!(await fold.locator('.fw-list').isVisible())) wrong.push(`${where}: the field list is not visible after one press`)
      const shown = (await fold.locator('.fw-key').allTextContents()).map((key) => key.trim())
      for (const key of KEYS) if (!shown.includes(key)) wrong.push(`${where}: the declared key ${key} is not shown after one press`)
    }
  }
  expect(wrong).toEqual([])
}, 300_000)

/** How tall the declared fields, the stored fields and the page are. */
async function measure(page: Page): Promise<unknown> {
  return page.evaluate(() => {
    const article = document.querySelector('article.rp') as HTMLElement
    const declared =
      (article.querySelector('[data-testid="declared-fields"]') as HTMLElement | null) ??
      (article.querySelector('.fw-list')?.closest('.px-panel') as HTMLElement | null)
    const stored = article.querySelector('[data-testid="stored-fields"]') as HTMLElement | null
    const height = (element: HTMLElement | null) => (element === null ? null : Math.round(element.getBoundingClientRect().height))
    return {
      declaredFields: height(declared),
      storedFields: height(stored),
      article: height(article),
      page: document.documentElement.scrollHeight,
    }
  })
}

it.skipIf(!process.env['TEST_SHOTS'])('photographs the record in developer mode and measures the declared fields and the page', async () => {
  const measurements: Record<string, unknown> = {}
  for (const theme of ['light', 'dark'] as const) {
    const context = await app.browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: theme })
    await context.addInitScript((look) => window.localStorage.setItem('mole-office.preset.theme', look), theme)
    const page = await context.newPage()
    try {
      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: 1000 })
        await open(page, 'en')
        if (theme === 'light') measurements[`en-${width}`] = await measure(page)
        await page.screenshot({ path: join(shots, `record-developer-${width}-${theme}.png`), fullPage: true })
      }
      if (theme === 'light') {
        await page.setViewportSize({ width: 1440, height: 1000 })
        await open(page, 'zh')
        measurements['zh-1440'] = await measure(page)
        await page.screenshot({ path: join(shots, 'record-developer-1440-light-zh.png'), fullPage: true })
      }
    } finally {
      await context.close()
    }
  }
  writeFileSync(join(shots, 'measurements.json'), JSON.stringify(measurements, null, 2))
  console.info(`DECLARED_FIELDS_FOLD_MEASUREMENTS ${JSON.stringify(measurements)}`)
}, 300_000)
