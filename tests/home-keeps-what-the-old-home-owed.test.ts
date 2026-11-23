// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE FIVE-SECTION HOME KEEPS WHAT THE OLD HOME OWED THE OWNER, EACH WHERE THE DRAWING OR AN ANSWER PUTS IT.
 *
 * Wave 13k's round 16 was refused (check l3MN04jpFPhK) because six parts the old Home drew were
 * mounted on no page and no report said where they went. Each is proved here, on Home itself:
 *
 *   1. REPORTS LEAVE HOME, by the person's later decision: seven are filed for him, and home draws no report
 *      list and no report row. They are on their own page.
 *   2. WHAT HAS BEEN SAID: message counts, in developer mode only, on question 7.
 *   3. THE DEVELOPER-MODE QUESTIONS PANEL (paused, not classified, no state): developer mode, as before.
 *      Since a decision both are one press from Home in developer mode, each on its
 *      own page.
 *   4. SESSIONS (Running now): left Home with a decision.
 *      The Agent runs page draws them.
 *   5. THE READ-AT STAMP AND READ AGAIN: question 7's neighbour, question 8, answered as recommended,
 *      takes Recheck away because Home re-reads itself every minute; a minute later it asks again.
 *      No line says when it was updated or that it updates by itself.
 *      Today keeps a retry when its reading fails, which is recovery, not Recheck.
 *   6. THE THISPROJECT LINE: the drawing's line under the title says the day and "All projects",
 *      because every section reads every project and each part that reads one names it.
 *   7. NO EXPLAINING LINE FOR WHAT IS NOT THERE: with no hours set for today, Today's band draws only the press
 *      that sets them; with nothing on today, it draws nothing under today's date; with nothing late or stuck in
 *      any project, that part is not drawn.
 *
 * MUTATIONS (each red here): the reports band drawn again; the developer presses drawn in normal mode; the minute re-read removed; Today's retry removed.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { createI18n } from '../src/shared/i18n.ts'

const OWNER = { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const { t } = createI18n('en')
let app: LiveApp

beforeAll(async () => {
  app = await liveApp({ name: 'home-keeps-what-it-owed', workspace: 'default', viewport: { width: 1440, height: 1000 } })
  const today = (await (await fetch(`${app.api}/api/planning/today`, { headers: OWNER })).json()) as { day: string }
  for (let n = 1; n <= 7; n += 1) {
    const filed = await fetch(`${app.api}/api/records`, {
      method: 'POST',
      headers: OWNER,
      body: JSON.stringify({ kind: 'report', title: `Made-up report ${String(n)}`, data: { for: 'A made-up reader', date: today.day, read: 'unread', blocks: [{ id: 'b-1', type: 'text', text: 'A made-up report for the Home check.' }] } }),
    })
    expect(filed.status, await filed.clone().text()).toBe(201)
  }
}, 180_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

async function open(mode: 'normal' | 'inspect'): Promise<void> {
  await app.page.goto(`${app.site}/?mode=${mode}#/`)
  await app.page.reload()
  await waitForThePage(app.page, 60_000)
  await app.page.locator('[data-home-section="agents"]').waitFor({ timeout: 30_000 })
}

describe('what the old Home owed, on the new Home', () => {
  it('draws no report list, though seven reports wait for the person', async () => {
    await open('normal')
    await app.page.locator('[data-home-section="needs"]').waitFor({ timeout: 20_000 })
    await app.page.locator('[data-home-section="today"]').waitFor({ timeout: 30_000 })
    await app.page.waitForTimeout(1500)
    expect(await app.page.locator('.att-rep-list').count(), 'a report list is drawn on home').toBe(0)
    expect(await app.page.locator('.att-rep').count(), 'a report row is drawn on home').toBe(0)
  }, 120_000)

  it('has a press to what has been said and to the questions in developer mode only, and no sessions', async () => {
    for (const mode of ['normal', 'inspect'] as const) {
      await open(mode)
      await app.page.waitForTimeout(1500)
      const developer = app.page.locator('.hm-developer')
      expect(await app.page.locator(`.hp-also-col[aria-label="${t('home.runningNow')}"]`).count(), `${mode}: Running now is not on Home`).toBe(0)
      if (mode === 'normal') {
        expect(await developer.count(), 'normal mode draws none of them').toBe(0)
        continue
      }
      await developer.waitFor({ timeout: 20_000 })
      // EACH PRESS OPENS THE PAGE THAT DRAWS WHAT HOME USED TO.
      await developer.locator('[data-home-goes="said"]').click()
      await app.page.locator('[data-away-from-home="said"]').getByText(t('home.said'), { exact: true }).first().waitFor({ timeout: 20_000 })
      await open(mode)
      await app.page.locator('.hm-developer [data-home-goes="recordquestions"]').click()
      await app.page.locator('[data-away-from-home="recordquestions"] .att-questions').waitFor({ timeout: 20_000 })
    }
  }, 120_000)

  it('says under the title that it is about all projects, and draws no line saying when it was updated', async () => {
    await open('normal')
    const lead = (await app.page.locator('.hm-page-lead').innerText()).trim()
    expect(lead.endsWith(t('home.leadAllProjects'))).toBe(true)
    expect(await app.page.locator('.hm-updated').count(), 'a line says when Home was updated').toBe(0)
    expect(await app.page.getByText('It updates by itself', { exact: false }).count(), 'a line says Home updates by itself').toBe(0)
    expect(await app.page.getByRole('button', { name: t('home.readAgain') }).count(), 'no Read again press').toBe(0)
  }, 120_000)

  it('draws no hours sentence beside the press that sets them', async () => {
    await open('normal')
    // TODAY'S HOURS ARE NOT SET in this office, so the band draws the press that sets them and no sentence beside it.
    const hours = app.page.locator('[data-home-section="today"] .hm-day-capacity')
    await hours.waitFor({ timeout: 30_000 })
    expect((await hours.innerText()).trim(), 'the hours line draws more than its press').toBe(t('home.sayHowMany'))
  }, 120_000)

  it('draws nothing under today\'s date when nothing is on today', async () => {
    await open('normal')
    // NOTHING IS ON TODAY in this office, and the week above already leaves today with nothing beside it.
    const today = app.page.locator('[data-home-section="today"]')
    await today.locator('.hm-day-date h3').waitFor({ timeout: 30_000 })
    expect(await today.locator('.hm-agenda-item').count(), 'this office has work on today').toBe(0)
    expect(await today.locator('.hm-period-note').count(), 'a line is drawn under today\'s date').toBe(0)
  }, 120_000)

  it('draws no Late or stuck part when nothing is late', async () => {
    await open('normal')
    // NOTHING IS LATE OR STUCK in any project of this office, so once the projects have answered the part is not drawn.
    await expect.poll(() => app.page.locator('[data-home-section="late"]').count(), { timeout: 30_000, message: 'Late or stuck is drawn with nothing in it' }).toBe(0)
  }, 120_000)

  it('offers Today a retry when its reading fails', async () => {
    let fail = true
    await app.page.route('**/api/planning/today*', async (route) => (fail ? route.fulfill({ status: 500, json: { error: 'A made-up failure.' } }) : route.continue()))
    await app.page.goto(`${app.site}/?mode=normal&failtoday=${String(Date.now())}#/`)
    const today = app.page.locator('[data-home-section="today"]')
    const retry = today.locator('.px-error').getByRole('button')
    await retry.first().waitFor({ timeout: 30_000 })
    fail = false
    await retry.first().click()
    await today.locator('.px-error').waitFor({ state: 'detached', timeout: 30_000 })
    await app.page.unroute('**/api/planning/today*')
  }, 120_000)
  // LAST, because it installs a fake clock on the page for the rest of the file.
  it('reads what waits for the person again a minute later, by itself', async () => {
    await app.page.clock.install()
    await open('normal')
    let asked = 0
    const count = (request: { url(): string }) => { if (new URL(request.url()).pathname === '/api/waiting') asked += 1 }
    app.page.on('request', count)
    try {
      await app.page.clock.runFor(61_000)
      await app.page.waitForTimeout(1000)
      expect(asked, 'the waiting door was asked again after a minute').toBeGreaterThan(0)
    } finally {
      app.page.off('request', count)
    }
  }, 120_000)

})
