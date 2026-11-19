// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A DECISION'S PAGE COUNTS ITS CHANGES WITH A MEASURE WORD, NAMES ITS SUMMARY IN WORDS AND LISTS IT, ENDS NO LINE
 * IN A LONE DOT, AND DRAWS THE WORDS ADDED LATER. Wave 13k round 39, piece 3, from the secretary's review of wave 13q's
 * round 35 pictures (13q's report 5nI38BXwTFnV, its part "Left for wave 13k").
 *
 * WHAT IS CLAIMED, each in English and in Chinese:
 *
 *   1. The change box's heading 近期变化 carried a bare "1". Its count reads "1 change" / "1 项变化", the word the
 *      history fold counts with.
 *   2. The missing-details box said "Not filled in yet: summary." / 尚未填写：摘要。, naming a field in a word that read
 *      like a stored key, and the decision's box of fields did not list it. The sentence names it in words ("the
 *      summary under the title" / 标题下的摘要), and the box lists it with the notes, grey while it is not written.
 *   3. At 390 the Chinese row of fields still to fill could end a line in a lone "·". The row wraps where the window
 *      ends, so a dot between names always lands at one end of a line; on this tip it began the wrapped lines. The
 *      names are separated by space, as the decision's box of fields separates its own.
 *   4. "Words added later" (words_since) had no fold on the page: a list of {at, words} was not "words" to the
 *      fold stack. It has a fold, each entry drawn after when it was written, marked at the path of its words.
 *
 * MADE-UP RECORDS: two decisions the test office's person files, one with no summary and one later word, one with a
 * summary.
 *
 * MUTATIONS, each after a control run (the commit that added this file names the logs):
 *   - src/web/components/ChangeLog.tsx: the bare count again. Case 1 goes red.
 *   - src/web/pages/RecordPage.tsx: the panel's sentence naming the field by record.summary again, and
 *     src/web/components/Governance.tsx listing no summary. Case 2 goes red.
 *   - src/web/pages/RecordPage.tsx: the " · " between the names put back. Case 3 goes red.
 *   - src/shared/sections.ts: drawableAsWords no longer passing lists of dated words. Case 4 goes red.
 *
 * PICTURES: only when TEST_SHOTS names a folder, the decision with its folds open, at 1440, 990, 660 and 390, light
 * and dark, in English and Chinese.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Page } from 'playwright'
import { join } from 'node:path'
import { liveApp, type LiveApp, waitForThePage } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { createI18n } from '../src/shared/i18n.ts'
import { testShots, TEST_SHOTS } from './where-shots-go.ts'

const AS_THE_PERSON: Record<string, string> = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

const WORDS = { en: createI18n('en'), zh: createI18n('zh') } as const
const LANGUAGES = ['en', 'zh'] as const
const LATER_WORDS = 'A made-up word added later: the scans are kept on the second shelf.'

let app: LiveApp
let page: Page
let withoutSummary = ''
let withSummary = ''
const KEEP = (process.env[TEST_SHOTS] ?? '') !== ''
const SHOTS = testShots('decision-fold')

async function open(language: 'en' | 'zh', id: string, how: { look?: string; inspect?: boolean } = {}): Promise<void> {
  const mode = how.inspect === true ? '&mode=inspect' : ''
  await page.goto(`${app.site}/?lang=${language}&look=${how.look ?? 'light'}${mode}#/r/${id}`, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  })
  await waitForThePage(page, 60_000)
  await page.locator('.rh-fold > summary').waitFor({ timeout: 30_000 })
}

async function filed(payload: Record<string, unknown>): Promise<string> {
  const res = await fetch(`${app.api}/api/records`, { method: 'POST', headers: AS_THE_PERSON, body: JSON.stringify(payload) })
  const body = (await res.json()) as { record?: { id: string }; error?: string }
  expect(res.status, JSON.stringify(body)).toBe(201)
  return body.record!.id
}

beforeAll(async () => {
  app = await liveApp({ name: 'decision-box-summary', viewport: { width: 1440, height: 1000 }, workspace: 'default' })
  page = app.page
  await page.addInitScript(() => {
    localStorage.setItem('mole-office.preset.theme', new URLSearchParams(location.search).get('look') ?? 'light')
  })
  withoutSummary = await filed({
    kind: 'decision',
    title: 'The made-up archive keeps its scans for a year',
    data: { replaces: [], words_since: [{ at: '2026-10-01 09:00', words: LATER_WORDS }] },
  })
  withSummary = await filed({
    kind: 'decision',
    title: 'The made-up archive is read on Mondays',
    summary: 'A made-up decision for this test, with a summary.',
    data: { replaces: [] },
  })
}, 180_000)

afterAll(async () => {
  await app?.stop()
})

describe('the change box', () => {
  it.each(LANGUAGES)('%s: 1. counts its changes with a measure word', async (language) => {
    await open(language, withoutSummary)
    const t = WORDS[language].t
    const count = await page.evaluate((title) => {
      const panel = [...document.querySelectorAll('.px-panel')].find(
        (one) => (one.querySelector('.px-panel-title')?.textContent ?? '').trim() === title,
      )
      return panel === undefined ? null : (panel.querySelector('.px-panel-actions')?.textContent ?? '').trim()
    }, t('record.section.changes'))
    expect(count).toBe(t('record.history.changeCount', { n: 1 }))
  }, 120_000)
})

describe('a decision with no summary', () => {
  it.each(LANGUAGES)('%s: 2. names the summary in words, and its box lists it, grey', async (language) => {
    await open(language, withoutSummary)
    const t = WORDS[language].t
    const panel = await page.locator('.px-inc-list').innerText()
    expect(panel).toContain(t('record.incomplete.summaryField'))
    expect(panel, 'the bare word for the field').not.toMatch(language === 'zh' ? /：\s*摘要\s*。/ : /: summary\./)
    const listed = await page.evaluate(() =>
      [...document.querySelectorAll('.px-gov-half-notes li')].map((li) => ({
        name: (li.textContent ?? '').trim(),
        grey: li.classList.contains('px-gov-half-missing'),
      })),
    )
    expect(listed).toContainEqual({ name: t('decisions.field.summary'), grey: true })
  }, 120_000)

  it.each(LANGUAGES)('%s: 2. a decision with a summary lists it, not grey', async (language) => {
    await open(language, withSummary)
    const t = WORDS[language].t
    const listed = await page.evaluate(() =>
      [...document.querySelectorAll('.px-gov-half-notes li')].map((li) => ({
        name: (li.textContent ?? '').trim(),
        grey: li.classList.contains('px-gov-half-missing'),
      })),
    )
    expect(listed).toContainEqual({ name: t('decisions.field.summary'), grey: false })
  }, 120_000)

  it.each(LANGUAGES)('%s: 3. at 390 the fields still to fill are separated by space, so no line begins or ends in a dot', async (language) => {
    await page.setViewportSize({ width: 390, height: 1000 })
    try {
      await open(language, withoutSummary)
      // Editing, which is where a person sees this row and presses its names.
      await page.locator('a.rp-mode').first().click()
      await page.locator('.rd-add-row').waitFor({ timeout: 30_000 })
      const seen = await page.evaluate(() => {
        const items = [...document.querySelectorAll('.rd-add-row .rd-add-item')]
        return {
          items: items.length,
          lines: new Set(items.map((item) => Math.round(item.getBoundingClientRect().top))).size,
          row: document.querySelector('.rd-add-row')?.textContent ?? '',
        }
      })
      expect(seen.items, 'the row lists fields').toBeGreaterThan(3)
      expect(seen.lines, 'the row wraps at 390, so a separator would begin or end a line').toBeGreaterThan(1)
      expect(seen.row).not.toContain('·')
    } finally {
      await page.setViewportSize({ width: 1440, height: 1000 })
    }
  }, 120_000)

  it.each(LANGUAGES)('%s: 4. draws the words added later in a fold of their own', async (language) => {
    await open(language, withoutSummary)
    const found = await page.evaluate(() => {
      const words = document.querySelector('.rd-fold-body [data-text-field="data.words_since[0].words"]')
      const fold = words?.closest('details')
      return {
        words: words?.textContent ?? null,
        heading: (fold?.querySelector('summary')?.textContent ?? '').trim(),
        dated: fold?.querySelector('time') !== null && fold?.querySelector('time') !== undefined,
        dump: (document.querySelector('main')?.textContent ?? '').includes('[object Object]'),
      }
    })
    expect(found.words).toBe(LATER_WORDS)
    expect(found.heading).not.toBe('')
    expect(found.dated, 'each entry says when it was written').toBe(true)
    expect(found.dump).toBe(false)
  }, 120_000)
})

describe('pictures', () => {
  it('photographs the decision with its folds open at four widths, light and dark, in both languages', async () => {
    if (!KEEP) return
    for (const language of LANGUAGES) {
      for (const look of ['light', 'dark']) {
        for (const width of [1440, 990, 660, 390]) {
          await page.setViewportSize({ width, height: 1000 })
          await page.goto('about:blank')
          await open(language, withoutSummary, { look })
          await page.evaluate(() => {
            for (const fold of document.querySelectorAll('details.rd-fold-body')) (fold as HTMLDetailsElement).open = true
          })
          await page.screenshot({ path: join(SHOTS, `decision-${language}-${width}-${look}.png`), fullPage: true })
        }
      }
    }
    await page.setViewportSize({ width: 1440, height: 1000 })
  }, 1_200_000)
})
