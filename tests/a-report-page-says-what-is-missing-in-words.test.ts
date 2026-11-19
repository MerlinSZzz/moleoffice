// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A REPORT'S PAGE SAYS WHAT IS MISSING IN WORDS, AND ITS LENGTH BUTTONS FIT A FINGER. Wave 13k round 30.
 *
 * The secretary read a report page at four widths and found four things this file holds:
 *
 *   1. "1 to fill in … 1 field not filled in … For is not filled in" sat above the report's questions.
 *      It read as one question left, and "For" is the stored key of a field. The panel now says the
 *      report is missing a detail, and names the detail by its word: "who it is for".
 *   2. The − and + of the reading-length control were about 25 px tall. Below 40rem each is now at
 *      least 44 px tall and wide, the size a finger can press.
 *   3. "What is still open around this" showed only "—" when nothing was open. Round 30 said so in words; the owner's
 *      decision then named that line among the ones that say nothing a reader acts on, so the panel is no
 *      longer drawn at all when nothing is open. Decision 8SkQQo1x69IV, revision 3, took it
 *      out of developer mode too, so no mode draws the panel when nothing is open. A failed read is still drawn.
 *   4. The change-log fold said "Last changed just now by person". It now names who changed it.
 *
 * MADE-UP RECORDS: one report filed through the API with no `for`, by the test office's person.
 *
 * PICTURES: only when TEST_SHOTS names a folder, at 1440, 990, 660 and 390, light and dark, in English
 * and in Chinese, each of the whole page, and at 390 one more of the screen as it opens.
 *
 * MUTATIONS, each after a control run, each red for the reason its case states, then restored green:
 *   - src/web/pages/RecordPage.tsx: name the missing field by `englishHeading(field.key)` again in place
 *     of `fieldLabel`. The first case goes red: the line reads "For", not "who it is for".
 *   - src/web/components/SummaryBlocks.tsx: delete the narrow-screen rule that raises the steps to
 *     44px. The second case goes red: each step measures 26px.
 *   - src/web/pages/RecordPage.tsx: draw the empty open-around panel again. The third case goes red: the panel
 *     is on the page when nothing is open.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Page } from 'playwright'
import { join } from 'node:path'
import { deleteTheCopiedDefaultChapters, liveApp, type LiveApp, waitForThePage } from './helpers.ts'
import { testShots, TEST_SHOTS } from './where-shots-go.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { createI18n } from '../src/shared/i18n.ts'

/** Pictures are taken only when somebody asked to keep them; the cases run either way. */
const KEEP = (process.env[TEST_SHOTS] ?? '') !== ''
const SHOTS = testShots('report-page-words')

const AS_THE_PERSON: Record<string, string> = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

const en = createI18n('en')
const zh = createI18n('zh')

let app: LiveApp
let page: Page
let reportId = ''
/** The test office's person, by the name its registry gives, which is how the page names them. */
let personName = ''

async function open(language: 'en' | 'zh', width: number, theme: 'light' | 'dark' = 'light'): Promise<void> {
  await page.setViewportSize({ width, height: 1000 })
  await page.goto(`${app.site}/?lang=${language}#/r/${reportId}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.evaluate((chosen) => localStorage.setItem('mole-office.preset.theme', chosen), theme)
  await page.reload({ timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.locator('.px-inc-title').waitFor({ timeout: 30_000 })
  await page.locator('.rd-report').waitFor({ timeout: 30_000 })
}

beforeAll(async () => {
  app = await liveApp({ name: 'report-page-words', viewport: { width: 1440, height: 1000 }, workspace: 'default' })
  page = app.page
  await deleteTheCopiedDefaultChapters(app.api)
  const res = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: AS_THE_PERSON,
    body: JSON.stringify({
      kind: 'report',
      title: 'What the lantern archive scanner read this week',
      summary: 'The scanner read the bottom shelf for the first time, and two labels are still unread.',
      data: {
        blocks: [
          { id: 'one', type: 'text', text: 'The scanner read the bottom shelf for the first time.' },
          { id: 'two', type: 'text', text: 'Two labels on the lowest row are still unread, because the light there is poor.' },
        ],
        date: '2026-09-29',
      },
    }),
  })
  expect(res.status, await res.clone().text()).toBe(201)
  reportId = ((await res.json()) as { record: { id: string } }).record.id
  const who = await fetch(`${app.api}/api/participants`, { headers: AS_THE_PERSON })
  expect(who.status, await who.clone().text()).toBe(200)
  const people = ((await who.json()) as { people: { id: string; name: string }[] }).people
  personName = people.find((one) => one.id === THE_PERSON)?.name ?? ''
  expect(personName, 'the test office has no registry row for its person').not.toBe('')
}, 300_000)

afterAll(async () => {
  await app?.stop()
}, 120_000)

describe('a report page with a missing detail', () => {
  it('names the missing detail by its word, never by its stored key', async () => {
    for (const [language, words] of [['en', en], ['zh', zh]] as const) {
      await open(language, 1440)
      const heading = (await page.locator('.px-inc-title').textContent())?.trim() ?? ''
      const lines = (await page.locator('.px-inc-msg').allTextContents()).map((one) => one.trim())
      const what = words.t('kind.report')
      expect(heading).toBe(words.t('sheet.incomplete.heading', { what, n: 1 }))
      // THE WORD WRITTEN OUT, so the case does not pass by reading back whatever the list holds.
      const field = language === 'en' ? 'who it is for' : '写给谁'
      expect(words.t('record.field.report.for')).toBe(field)
      expect(lines).toEqual([words.t('record.incomplete.missingDetail', { field })])
      const all = [heading, ...lines].join(' ')
      expect(all, 'the stored key reached the reader').not.toMatch(/\bFor\b|data\.for/)
      if (language === 'zh') expect(all, 'English in the Chinese panel').not.toMatch(/[A-Za-z]/)
    }
  })

  it('draws each − and + at least 44 px tall and wide at 390', async () => {
    await open('en', 390)
    const steps = await page.locator('.sb-level-step').evaluateAll((all) =>
      all.map((one) => {
        const box = one.getBoundingClientRect()
        return { width: Math.round(box.width), height: Math.round(box.height) }
      }),
    )
    // Two controls, one above the report and one below it, each with a − and a +.
    expect(steps.length).toBe(4)
    for (const step of steps) {
      expect(step.height, 'a step is shorter than a finger').toBeGreaterThanOrEqual(44)
      expect(step.width, 'a step is narrower than a finger').toBeGreaterThanOrEqual(44)
    }
  })

  it('draws no empty open-around panel, and names who last changed it', async () => {
    for (const [language, words] of [['en', en], ['zh', zh]] as const) {
      await open(language, 1440)
      // THE OWNER NAMED "nothing is open around this record" AMONG THE LINES THAT SAY NOTHING, so an empty
      // panel is not drawn. The heading goes with it: a heading over nothing is worse.
      expect(await page.locator('.rp-open-none').count(), `${language}: the empty panel is drawn`).toBe(0)
      expect(await page.locator('.px-panel', { hasText: words.t('record.section.openAround') }).count()).toBe(0)
      const changed = (await page.locator('.rd-rail > details.rd-fold summary').nth(1).textContent())?.trim() ?? ''
      expect(changed, 'the change-log fold says the kind of writer, not who').not.toContain(language === 'en' ? 'by person' : '由人更改')
      expect(changed).toContain(personName)
    }
  })

  it.runIf(KEEP)('keeps pictures at four widths, light and dark, in English and Chinese', async () => {
    for (const language of ['en', 'zh'] as const) {
      for (const theme of ['light', 'dark'] as const) {
        for (const width of [1440, 990, 660, 390]) {
          await open(language, width, theme)
          expect(await page.locator('html').getAttribute('data-theme')).toBe(theme)
          if (width === 390) await page.screenshot({ path: join(SHOTS, `report-${String(width)}-${theme}-${language}-top.png`) })
          await page.screenshot({ path: join(SHOTS, `report-${String(width)}-${theme}-${language}.png`), fullPage: true })
          if (width === 390 && theme === 'light') {
            // WHAT THE FRAME'S TOP BAR DOES WHEN THE PAGE IS SCROLLED, for the report to the supervisor:
            // the screen after scrolling, and a whole-page picture taken from there.
            await page.evaluate(() => window.scrollTo(0, 320))
            await page.screenshot({ path: join(SHOTS, `report-390-light-${language}-scrolled.png`) })
            await page.screenshot({ path: join(SHOTS, `report-390-light-${language}-scrolled-full.png`), fullPage: true })
          }
        }
      }
    }
  }, 300_000)
})
