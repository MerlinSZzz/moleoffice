// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * IN GREEK, THE MODULES PAGE FITS A 390-PIXEL WINDOW.
 *
 * A row's two marks — the one that says the record is a made-up example and the one that counts
 * the details it still needs — are drawn together in a marks group. The group kept its whole
 * width, so in Greek the two words together were wider than the row and the page scrolled
 * sideways on a phone. English fits, so English is the control that shows the page itself draws
 * the same rows at the same width.
 */
import { afterAll, beforeAll, expect, it } from 'vitest'
import { freshDb, liveApp, waitForThePage, type LiveApp, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { WORD_LISTS } from '../src/shared/i18n.ts'

let app: LiveApp
let db: TestDb

beforeAll(async () => {
  db = await freshDb()
  db.api.createRecord({
    kind: 'module',
    title: 'A made-up module with one detail missing',
    workspaceId: 'default',
    origin: 'fixture',
    actor: db.api.HUMAN,
    data: {},
  })
  db.api.createRecord({
    kind: 'module',
    title: 'An ordinary module beside it',
    workspaceId: 'default',
    actor: db.api.HUMAN,
    data: {},
  })
  app = await liveApp({ name: 'greek-modules-phone', database: db.file, workspace: 'default', viewport: { width: 390, height: 1100 } })
  await app.context.addInitScript(({ person }) => {
    localStorage.setItem('mole-office.actor', JSON.stringify({ type: 'human', id: person }))
    localStorage.setItem('mole-office.preset.theme', 'light')
  }, { person: THE_TEST_OFFICES_OWNER.id })
}, 240_000)

afterAll(async () => {
  await app?.stop()
  db?.close()
}, 120_000)

async function open(language: string): Promise<void> {
  await app.page.goto('about:blank')
  await app.page.goto(`${app.site}/?lang=${language}&look=light&mode=normal#/modules`)
  await waitForThePage(app.page, 45_000)
  await app.page.waitForSelector('main.page', { state: 'visible', timeout: 20_000 })
  await app.page.waitForFunction(() => document.querySelectorAll('main.page .fam-marks:not(:empty)').length > 0, null, { timeout: 20_000 })
  await app.page.waitForTimeout(150)
}

async function measure(): Promise<{ page: number; window: number; marks: { said: string; right: number }[] }> {
  return await app.page.evaluate(() => ({
    page: document.documentElement.scrollWidth,
    window: document.documentElement.clientWidth,
    marks: Array.from(document.querySelectorAll('main.page .fam-marks')).map((element) => ({
      said: (element.textContent ?? '').replace(/\s+/g, ' ').trim(),
      right: Math.round(element.getBoundingClientRect().right),
    })),
  }))
}

it('fits the Greek Modules page and its marks at 390', async () => {
  await open('el')
  const measured = await measure()
  const madeUp = String(WORD_LISTS.el['sheet.origin.fixture'] ?? '')
  expect(madeUp, 'the Greek list did not carry the made-up-example words').not.toBe('')
  expect(measured.marks.some((one) => one.said.includes(madeUp) && /\d/.test(one.said)), 'the Greek page did not draw a row with both marks').toBe(true)
  expect(measured.page, 'the Greek Modules page is wider than a 390-pixel window').toBeLessThanOrEqual(measured.window + 1)
  for (const mark of measured.marks) {
    expect(mark.right, `a marks group is cut at the right edge: ${mark.said}`).toBeLessThanOrEqual(measured.window + 1)
  }
}, 120_000)

it('fits the English Modules page and its marks at 390, which is the control', async () => {
  await open('en')
  const measured = await measure()
  expect(measured.marks.length, 'the English page drew no row with marks').toBeGreaterThan(0)
  expect(measured.page, 'the English Modules page is wider than a 390-pixel window').toBeLessThanOrEqual(measured.window + 1)
}, 120_000)
