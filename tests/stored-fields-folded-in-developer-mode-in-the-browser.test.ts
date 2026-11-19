// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RECORD'S STORED FIELDS ARE FOLDED IN DEVELOPER MODE, as a decision says.
 *
 * The record page's "Stored fields" panel lists every key of a record's `data` as the database holds
 * it. It is drawn only in developer mode, and it was drawn open, so on a record with many fields it
 * was the tallest thing on the page. Now it is a closed fold of one line, opened with one press.
 *
 * One made-up problem record with many fields is opened in a real browser, on a test office with a
 * database of its own, in developer mode (`?mode=inspect`), in English and in Chinese, at 1440 and at
 * 390. On every load:
 *   1. the fold is there and is closed;
 *   2. the closed fold is one line high: its summary does not wrap, and nothing below it takes room;
 *   3. the field list inside is not visible;
 *   4. one press on the summary opens it, and every stored key of the record is then visible.
 *
 * THE MUTATION THAT TURNS THIS RED, after a green control run: in src/web/pages/RecordPage.tsx, the
 * stored-fields fold given the `open` attribute (`<details className="rd-fold" open ...>`), so the
 * panel is drawn open again. Every case fails on "the fold is closed on load".
 *
 * MEASUREMENTS AND PICTURES. With TEST_SHOTS naming a folder, the second case photographs the record
 * in developer mode at 1440 and 390 in light and dark, and at 1440 in Chinese, and writes the height
 * of the stored fields and of every other part of the page to measurements.json. It measures on any
 * build, so the same case gives the "before" numbers on a build where the panel is still open.
 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { Page } from 'playwright'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { testShots } from './where-shots-go.ts'
import { THE_PERSON } from '../src/shared/person.ts'

const headers = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/** A made-up problem, about a made-up bread oven, with most of its fields written. */
const DATA = {
  symptom: 'The made-up bread oven reads 40 degrees colder than a hand thermometer after the second hour.',
  cause: 'The probe sits beside the door seal, and the seal lets cold air in when the fan runs.',
  fix: 'Move the probe to the back wall and read both for a week.',
  why_it_hurts: 'Every loaf in the evening batch comes out pale, and the batch log says the oven was hot enough.',
  how_to_tell_it_is_back: 'The evening batch is pale while the log says 230 degrees.',
  seen_in: ['evening batch, Monday', 'evening batch, Thursday', 'the test bake on Saturday'],
  options: ['move the probe', 'add a second probe', 'replace the door seal'],
  state: 'open',
  found_by: 'the made-up baker',
  whose_move: 'person',
  extra: {
    ovenModel: 'Made-up Deck Oven 3',
    probe: { place: 'beside the door seal', readsEvery: '10 seconds', calibrated: '2026-08-01' },
    readings: [212, 214, 190, 188, 186],
  },
}
const KEYS = Object.keys(DATA)

const shots = testShots('stored-fields-fold')
let app: LiveApp
let recordId = ''

beforeAll(async () => {
  app = await liveApp({ name: 'stored-fields-fold', workspace: 'default', viewport: { width: 1440, height: 1000 } })
  // THE FOLD'S OPENING IS A 240 MS ANIMATION. These cases read the content behind a fold, so the
  // animation is off and the content is there the moment the press opens it.
  await app.page.emulateMedia({ reducedMotion: 'reduce' })
  app.page.setDefaultTimeout(20_000)
  const response = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ kind: 'problem', title: 'Made-up bread oven reads cold', data: DATA }),
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

it('draws the stored fields as a closed fold of one line that opens with one press, in English and Chinese, at 1440 and 390', async () => {
  const wrong: string[] = []
  for (const language of ['en', 'zh'] as const) {
    for (const width of [1440, 390]) {
      const where = `${language} at ${width}`
      await app.page.setViewportSize({ width, height: 1000 })
      await open(app.page, language)
      const fold = app.page.locator('article.rp details[data-testid="stored-fields"]')
      if ((await fold.count()) !== 1) {
        wrong.push(`${where}: there is no stored-fields fold`)
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
      if (!closed.text.includes(String(KEYS.length))) wrong.push(`${where}: the summary "${closed.text}" does not say how many fields it holds`)
      if (await fold.locator('.mv-fields').isVisible()) wrong.push(`${where}: the field list is visible while the fold is closed`)

      await fold.locator(':scope > summary').click()
      if (!(await fold.evaluate((element) => (element as HTMLDetailsElement).open))) wrong.push(`${where}: one press did not open the fold`)
      if (!(await fold.locator('.mv-fields').isVisible())) wrong.push(`${where}: the field list is not visible after one press`)
      // The keys as stored: the page draws them in capitals, so their drawn text is not the key.
      const shown = (await fold.locator('.mv-field-key').allTextContents()).map((key) => key.trim())
      for (const key of KEYS) if (!shown.includes(key)) wrong.push(`${where}: the stored key ${key} is not shown after one press`)
    }
  }
  expect(wrong).toEqual([])
}, 300_000)

/** How tall the stored fields are, and every other part of the page, tallest first. */
async function measure(page: Page): Promise<unknown> {
  return page.evaluate(() => {
    const article = document.querySelector('article.rp') as HTMLElement
    const stored =
      (article.querySelector('[data-testid="stored-fields"]') as HTMLElement | null) ??
      (article.querySelector('.mv-fields')?.closest('.px-panel') as HTMLElement | null)
    const declared = article.querySelector('.fw-list')?.closest('.px-panel') as HTMLElement | null
    const name = (element: Element) => {
      const heading = element.querySelector('summary, h2, h3')
      return `${element.tagName.toLowerCase()}.${element.className} ${(heading?.textContent ?? '').trim().slice(0, 70)}`
    }
    const parts: { part: string; height: number }[] = []
    const body = article.querySelector(':scope > .rd')
    for (const element of [...article.children, ...(body === null ? [] : [...body.children])]) {
      if (element === body) continue
      parts.push({ part: name(element), height: Math.round(element.getBoundingClientRect().height) })
    }
    return {
      storedFields: stored === null ? null : Math.round(stored.getBoundingClientRect().height),
      declaredFields: declared === null ? null : Math.round(declared.getBoundingClientRect().height),
      article: Math.round(article.getBoundingClientRect().height),
      parts: parts.sort((a, b) => b.height - a.height).slice(0, 12),
    }
  })
}

it.skipIf(!process.env['TEST_SHOTS'])('photographs the record in developer mode and measures what each part takes', async () => {
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
  console.info(`STORED_FIELDS_FOLD_MEASUREMENTS ${JSON.stringify(measurements)}`)
}, 300_000)
