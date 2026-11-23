// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE STREAMLINED HOME, in a real browser. A decision took choice A of report XydBS8GM4BAD.
 *
 * Home keeps Needs you cut to NEEDS_SHOWN rows with a press to the rest, today, Late or stuck and the agents. Reports
 * left Home: they are read on their own pages. What else it drew is one press away, each press on Home in the words of the page it opens, or is gone from
 * Home because another page draws it. This file proves four things:
 *
 *   1. AT MOST NEEDS_SHOWN ROWS of Needs you and no report, on an office with seven questions and seven reports, and
 *      the line that says how many of how many with the press to the rest.
 *   2. EACH MOVED SECTION IS ONE PRESS AWAY: the press is on Home without opening anything, it says what the page it
 *      opens is called, and that page draws the section. What has been said and the questions are Developer mode's,
 *      as they were.
 *   3. NO REMOVED SECTION IS DRAWN, in either mode, and Home asks for none of their answers.
 *   4. The first load's bytes are bounded in tests/home-asks-only-for-what-it-draws.test.ts, on the office of the
 *      live size, and not here.
 *
 * WHAT COMES ROUND TODAY IS MADE UP HERE. No door writes a recurrence (createRecurrence in
 * src/server/lib/planning.ts has no route), so this file adds one made-up entry to the browser's reading of
 * `GET /api/planning/today`, on Home and on the plan page alike, and its work is a task filed here.
 *
 * MUTATIONS, each run after a control run and then restored (round 21 of wave 13w):
 *   1. NEEDS_SHOWN = 6 in src/web/components/home/HomeSections.tsx: case 1 was red, six rows. Case 1 now reads the
 *      number from its export.
 *   2. The press to Claims taken out of Agents at work: case 2 is red, no press.
 *   3. `loadDay` asks for the week again: case 3 is red in both modes on the request to /api/planning/week/current.
 *   4. A `.hm-week-bar` drawn again in Agents at work: case 3 is red in both modes on the week's hours.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createI18n } from '../src/shared/i18n.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { NEEDS_SHOWN } from '../src/web/components/home/HomeSections.tsx'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'

const OWNER = { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const AN_AGENT = { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'claude-code' }
const { t } = createI18n('en')
const OFFERED = 'A made-up task that comes round every day'
let app: LiveApp

async function post(path: string, body: unknown, headers: Record<string, string>): Promise<{ record: { id: string } }> {
  const answer = await fetch(`${app.api}${path}`, { method: 'POST', headers, body: JSON.stringify(body) })
  const text = await answer.text()
  if (!answer.ok) throw new Error(`POST ${path} answered ${String(answer.status)}: ${text}`)
  return JSON.parse(text) as { record: { id: string } }
}

beforeAll(async () => {
  app = await liveApp({ name: 'the-streamlined-home', workspace: 'default', viewport: { width: 1440, height: 1000 } })
  const today = (await (await fetch(`${app.api}/api/planning/today`, { headers: OWNER })).json()) as { day: string }
  for (let n = 1; n <= 7; n += 1) {
    await post('/api/records', { kind: 'report', title: `Made-up report ${String(n)}`, data: { for: 'A made-up reader', date: today.day, read: 'unread', blocks: [{ id: 'b-1', type: 'text', text: 'A made-up report for the Home check.' }] } }, OWNER)
    await post('/api/records', {
      kind: 'proposal',
      title: `A made-up question for the person (${String(n)})`,
      data: { question: 'Which of the two made-up ways?', options: ['a — the first way', 'b — the second way'], recommendation: 'Take (a).', because: 'It is made up.', who_settles_it: 'the owner' },
    }, AN_AGENT)
  }
  const offered = (await post('/api/records', { kind: 'task', title: OFFERED, data: { state: 'todo' } }, OWNER)).record.id
  await app.page.route('**/api/planning/today*', async (route) => {
    const response = await route.fetch()
    const answer = (await response.json()) as { recurring: unknown[] }
    answer.recurring = [{
      recurrence: { id: 'made-up-recurrence', recordId: offered, every: 'daily', days: null, hoursEach: null, createdAt: '2026-10-10 09:00:00' },
      work: { id: offered, kind: 'task', title: OFFERED, name: OFFERED, within: null, state: 'todo', workspaceId: 'default', deletedAt: null },
    }]
    await route.fulfill({ response, json: answer })
  })
}, 180_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

/**
 * Open Home from nothing, in one mode, and wait for its last section. `quiet` keeps a three-second
 * window open after that, so a late request can be seen; only the cases that ask what was asked
 * need it.
 */
async function openHome(mode: 'normal' | 'inspect', quiet = false): Promise<string[]> {
  const asked: string[] = []
  const watch = (request: { url(): string }) => { const url = new URL(request.url()); if (url.pathname.startsWith('/api/')) asked.push(`${url.pathname}${url.search}`) }
  app.page.on('request', watch)
  await app.page.goto('about:blank')
  await app.page.goto(`${app.site}/?lang=en&mode=${mode}#/`)
  await waitForThePage(app.page, 60_000)
  await app.page.locator('[data-home-section="agents"]').waitFor({ timeout: 30_000 })
  await app.page.locator('[data-home-section="needs"] .hm-needs-item').first().waitFor({ timeout: 30_000 })
  await app.page.locator('[data-home-section="keyItems"]').waitFor({ timeout: 30_000 })
  if (quiet) await app.page.waitForTimeout(3_000)
  app.page.off('request', watch)
  return asked
}

describe('the streamlined Home', () => {
  it('draws at most NEEDS_SHOWN rows of Needs you and no report, and says how many of how many', async () => {
    await openHome('normal')
    const needs = app.page.locator('[data-home-section="needs"]')
    const total = Number(await needs.locator('.hm-needs-count').innerText())
    expect(NEEDS_SHOWN, 'Home draws one or two decisions').toBeLessThanOrEqual(2)
    expect(total, 'the office holds more things waiting than Home draws, so the cut is tried').toBeGreaterThan(NEEDS_SHOWN)
    expect(await needs.locator('.hm-needs-item').count(), 'the rows of Needs you Home draws').toBe(NEEDS_SHOWN)
    expect(await needs.locator('[data-home-needs-more] .hm-section-count').innerText()).toBe(t('home.lateShown', { n: NEEDS_SHOWN, total }))
    expect(await app.page.locator('.att-rep').count(), 'no report is drawn on Home').toBe(0)
  }, 120_000)

  // EACH PRESS: where it is on Home, the mode it is drawn in, the page's own name, and what that page must draw.
  const presses = [
    { what: 'the rest of Needs you', mode: 'normal', press: '[data-home-needs-more] a', page: 'needsyou', name: t('home.needsYou'), draws: '.hm-needs-item' },
    { what: 'Claims', mode: 'normal', press: '[data-home-section="agents"] [data-home-goes="claims"]', page: 'claims', name: t('w13w.claimsPage.title'), draws: '.hm-claims-title' },
    { what: 'the project cards', mode: 'normal', press: '[data-home-goes="projects"]', page: 'projects', name: t('home.projects'), draws: '.hm-project-card' },
    { what: 'What has been said', mode: 'inspect', press: '.hm-developer [data-home-goes="said"]', page: 'said', name: t('home.said'), draws: '.hsaid-dir' },
    { what: 'the questions about the records', mode: 'inspect', press: '.hm-developer [data-home-goes="recordquestions"]', page: 'recordquestions', name: t('home.questions'), draws: '.att-questions' },
  ] as const
  for (const one of presses) {
    it(`opens ${one.what} with one press on Home, named as the page is`, async () => {
      await openHome(one.mode)
      const press = app.page.locator(one.press)
      expect(await press.count(), `Home has one press to ${one.what}`).toBe(1)
      expect(await press.isVisible(), 'the press is on the page as it opens, behind nothing').toBe(true)
      expect(await press.innerText(), 'the press says the name of the page it opens').toContain(one.name)
      await press.click()
      const page = app.page.locator(`[data-away-from-home="${one.page}"]`)
      // ATTACHED, NOT VISIBLE: What has been said keeps its directions behind its own fold, as it did on Home.
      await page.locator(one.draws).first().waitFor({ state: 'attached', timeout: 30_000 })
      expect(await page.locator('h1').innerText()).toBe(one.name)
    }, 120_000)
  }

  it('opens what comes round today with one press, on the plan of today', async () => {
    await openHome('normal')
    const press = app.page.locator('[data-home-section="today"] [data-home-goes="offers"]')
    expect(await press.count(), 'Home has one press to what comes round today').toBe(1)
    expect(await press.isVisible()).toBe(true)
    await press.click()
    await app.page.waitForURL(/#\/plan\/today$/, { timeout: 30_000 })
    await app.page.getByText(t('schedule.recurringToday'), { exact: true }).first().waitFor({ timeout: 30_000 })
    await app.page.locator('.px-pl-row', { hasText: OFFERED }).first().waitFor({ timeout: 30_000 })
  }, 120_000)

  for (const mode of ['normal', 'inspect'] as const) {
    it(`draws none of the sections that left Home, and asks for none of their answers (${mode})`, async () => {
      const asked = await openHome(mode, true)
      const gone = {
        'the read reports fold': '.att-rep-read',
        "the week's hours": '.hm-week, .hm-week-bar',
        "Today's folds": '.hm-explainer',
        'the unregistered agents': '.unreg-row, .unreg-said',
        'the claims': '.hm-claims',
        'the project cards': '[data-home-section="projects"], .hm-project-card',
        'Running now': `.hp-also-col[aria-label="${t('home.runningNow')}"]`,
        'What has been said': '.hsaid-dir',
        'the questions about the records': '.att-questions',
      }
      for (const [what, selector] of Object.entries(gone)) expect(await app.page.locator(selector).count(), `${mode}: ${what} is drawn on Home`).toBe(0)
      const theirs = asked.filter((url) => url.startsWith('/api/planning/week') || url.startsWith('/api/communication') || url.startsWith('/api/sessions') || url.startsWith('/api/working?only=unregistered') || url.startsWith('/api/claims'))
      expect(theirs, `${mode}: Home asked for what it no longer draws`).toEqual([])
      expect(asked.some((url) => url.startsWith('/api/planning/today')), 'Home asked for today, so the watch saw its reads').toBe(true)
    }, 120_000)
  }
})
