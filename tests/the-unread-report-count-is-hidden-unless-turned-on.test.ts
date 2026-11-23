// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE UNREAD REPORT COUNT IS HIDDEN UNTIL THE PERSON TURNS IT BACK ON.
 *
 * The owner decided the number of reports nobody has read is not drawn by default. One Settings switch, "Show how
 * many reports are unread", turns it on for that person everywhere that number is drawn: the sidebar's Reports row,
 * the Needs you heading on the Reports page, and a Reports row on All pages. Turning it off hides both again.
 *
 * Two reports are filed in the first project and neither is marked read, and a note is filed today so the page also
 * draws This week. At a wide window and at a phone's width, this case asks the same four things:
 *
 *   1. With nothing chosen, no number is drawn on the sidebar's Reports row, and the Needs you heading draws no
 *      number. This week draws its own number, because that counts every row in the group and not unread reports.
 *   2. Pressing the switch on the Settings page draws the number, 2, beside Needs you, in both places. The number
 *      beside This week stays as it was.
 *   3. Pressing it off hides the Needs you number again and leaves the This week number drawn.
 *   4. The choice is kept on the server, so a fresh load of the page draws what the switch last said.
 *
 * A read that failed draws no number, because hiding it is the safe answer: a number of nought would say nobody has
 * left a report. The number is read through the page's own word for a count, never as copied English.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { createI18n } from '../src/shared/i18n.ts'

const PERSON = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const PROJECT = 'default'
const UNREAD = 2
const THIS_WEEK = 1
const WORDS = createI18n('en')

let app: LiveApp
let visit = 0

beforeAll(async () => {
  app = await liveApp({ name: 'unread-report-count', workspace: PROJECT, viewport: { width: 1440, height: 1000 } })
  await app.context.addInitScript(({ id, project }) => {
    localStorage.setItem('mole-office.actor', JSON.stringify({ type: 'human', id }))
    localStorage.setItem('mole-office.workspace', project)
  }, { id: THE_TEST_OFFICES_OWNER.id, project: PROJECT })
  for (const title of ['The tailstock report', 'The spindle report']) {
    const filed = await fetch(`${app.api}/api/records`, {
      method: 'POST',
      headers: { ...PERSON, 'x-mole-office-workspace': PROJECT },
      body: JSON.stringify({ kind: 'report', title, data: { for: THE_TEST_OFFICES_OWNER.name, date: '2026-11-20' } }),
    })
    expect(filed.status, await filed.clone().text()).toBe(201)
  }
  // A note filed today, so the Reports page draws This week beside Needs you. Its number counts the note, and the
  // switch is about unread reports, so the note's group keeps its number in both answers.
  const note = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: { ...PERSON, 'x-mole-office-workspace': PROJECT },
    body: JSON.stringify({ kind: 'note', title: 'The steady-rest note', data: { body: 'The steady rest was checked this morning.' } }),
  })
  expect(note.status, await note.clone().text()).toBe(201)
}, 300_000)

afterAll(async () => {
  await app?.stop()
})

type Page = LiveApp['page']

/** Open an address on a freshly loaded page, and wait until the shell's own count reading has come back. */
async function go(page: Page, address: string): Promise<void> {
  visit += 1
  const attention = page.waitForResponse(
    (answer) => answer.url().includes('/api/attention?') && answer.url().includes('shape=home'),
    { timeout: 60_000 },
  )
  await page.goto('about:blank')
  await page.goto(`${app.site}/?lang=en&again=${String(visit)}#${address}`)
  await waitForThePage(page, 60_000)
  await attention
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => done(null)))))
}

/** The number on the sidebar's Reports row, or null when the row draws none. The menu is opened where it is the way in. */
async function theSidebarReportsNumber(page: Page): Promise<string | null> {
  if (await page.locator('.shell-menu').isVisible()) {
    await page.locator('.shell-menu').click()
    await page.locator('#shell-side[data-drawer="open"]').waitFor({ timeout: 30_000 })
  }
  const row = page.locator('#shell-side [data-target*="rail.notes"]').first()
  await row.waitFor({ timeout: 30_000 })
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => done(null)))))
  const drawn = await page.locator('#shell-side [data-target*="rail.notes"] .shell-badge')
    .evaluateAll((all) => all.filter((one) => one.getClientRects().length > 0).map((one) => (one.textContent ?? '').trim()))
  return drawn[0] ?? null
}

/** Every group heading's number on the Reports page, by the group it belongs to: null where the heading draws none. */
async function theReportsPageNumbers(page: Page): Promise<{ group: string; number: string | null }[]> {
  await page.locator('main.page .rpts-group').first().waitFor({ timeout: 60_000 })
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('main.page .rpts-group')].map((group) => ({
      group: group.dataset['group'] ?? '',
      number: group.querySelector('.rpts-count')?.textContent?.trim() ?? null,
    })),
  )
}

/** The two groups the page draws: the unread number the switch gives, and This week's own number. */
function theGroups(unread: string | null): { group: string; number: string | null }[] {
  return [
    { group: 'needs-you', number: unread },
    { group: 'this-week', number: String(THIS_WEEK) },
  ]
}

/** Press the Settings switch to the answer asked for, and wait until the page says the server kept it. */
async function setTheCount(page: Page, shown: boolean): Promise<void> {
  await go(page, '/settings/reportcount')
  const panel = page.locator('[data-settings-panel="settings.reportcount"]')
  await panel.waitFor({ timeout: 60_000 })
  const control = panel.getByRole('switch')
  await control.waitFor({ timeout: 30_000 })
  if ((await control.getAttribute('aria-checked')) === String(shown)) return
  const written = page.waitForResponse(
    (answer) => answer.url().endsWith('/api/report-count') && answer.request().method() === 'PUT',
    { timeout: 60_000 },
  )
  await control.click()
  expect((await written).status(), 'the setting was not kept').toBe(200)
  await expect.poll(() => control.getAttribute('aria-checked')).toBe(String(shown))
}

for (const { width, height } of [{ width: 1440, height: 1000 }, { width: 390, height: 900 }]) {
  describe(`at ${String(width)} by ${String(height)}`, () => {
    it('draws no unread report count until the person turns it on, and hides it again when they turn it off', async () => {
      const { page } = app
      await page.setViewportSize({ width, height })

      // 1. NOTHING CHOSEN: the unread number is hidden, and This week keeps its own.
      await go(page, '/')
      expect(await theSidebarReportsNumber(page), 'the sidebar draws an unread report count with nothing chosen').toBeNull()
      await go(page, '/notes')
      expect(await theReportsPageNumbers(page), 'the Reports page hides the unread count but not the This week count with nothing chosen').toEqual(theGroups(null))

      // 2. TURNED ON: both places draw the two reports nobody has read, and This week keeps its own number.
      await setTheCount(page, true)
      await go(page, '/')
      expect(await theSidebarReportsNumber(page)).toBe(WORDS.t('nav.badge', { n: UNREAD }))
      await go(page, '/notes')
      expect(await theReportsPageNumbers(page)).toEqual(theGroups(String(UNREAD)))

      // 3. TURNED OFF: the unread number is hidden again, and This week keeps its own number.
      await setTheCount(page, false)
      await go(page, '/')
      expect(await theSidebarReportsNumber(page), 'the sidebar still draws the count after it was turned off').toBeNull()
      await go(page, '/notes')
      expect(await theReportsPageNumbers(page), 'the Reports page hides the unread count but not the This week count after it was turned off').toEqual(theGroups(null))
    }, 300_000)
  })
}
