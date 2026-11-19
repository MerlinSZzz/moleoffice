// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A REPORT MARKED READ ON HOME LEAVES THE REPORTS BAND AT ONCE, WITHOUT WAITING OUT THE RANKED ANSWER'S PACE.
 *
 * The ranked answer that draws the band is paced (src/web/lib/oneask.ts): after each answer the next
 * ask waits at least `ATTENTION_ASK_FLOOR_MS`, which is 60 s. Marking a report read is the reader's own
 * act, so Home's `onMarkedRead` hurries that ask, and the answer that takes the row out is asked as
 * soon as the mark is stored. Three made-up reports are filed unread and Home is opened. Then one
 * row's "I have read this" is pressed. Within 15 s of the press the ranked answer's door is asked
 * again. Within 15 s more the marked row has left the band, and the other two are still in it.
 *
 * WHY 15 S. The band is drawn from an answer that has just come back, so without the hurry the next
 * ask cannot start until 60 s after that answer. The two bounds together are 30 s, well under that
 * floor, and they still leave a slow test machine room.
 *
 * ONE LOAD, NOT A RELOAD. This test's browser context is new, so nothing is kept for the band and it
 * is drawn only from this load's own answer. After a reload the band would be drawn at once from the
 * answer the first load kept (src/web/lib/pagecache.ts), while this load's own ask could still be on
 * its way. That ask, seen after the press, would pass for the hurried one.
 *
 * THE REAL CLOCK. The case is about how long a reader waits for the row to go. A faked clock could be
 * run past the floor, and then the case would pass without the hurry.
 *
 * MUTATION (red here): `onMarkedRead` on Home without `hurryTheAttentionHomeAsk()`. The next ask then
 * waits out the pace, so the door is not asked again within the bound and the marked row stays.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { createI18n } from '../src/shared/i18n.ts'

const OWNER = { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const { t } = createI18n('en')
// NO TITLE IS PART OF ANOTHER, because a row is found by a piece of its text.
const TITLES = ['Made-up report one, to mark read', 'Made-up report two, left unread', 'Made-up report three, left unread'] as const
/** Well under the 60 s floor of the ranked answer's pace. */
const BOUND_MS = 15_000
let app: LiveApp

beforeAll(async () => {
  app = await liveApp({ name: 'report-marked-read-on-home', workspace: 'default', viewport: { width: 1440, height: 1000 } })
  const today = (await (await fetch(`${app.api}/api/planning/today`, { headers: OWNER })).json()) as { day: string }
  for (const title of TITLES) {
    const filed = await fetch(`${app.api}/api/records`, {
      method: 'POST',
      headers: OWNER,
      body: JSON.stringify({ kind: 'report', title, data: { for: 'A made-up reader', date: today.day, read: 'unread', blocks: [{ id: 'b-1', type: 'text', text: 'A made-up report for the Home check.' }] } }),
    })
    expect(filed.status, await filed.clone().text()).toBe(201)
  }
}, 180_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

async function open(mode: 'normal'): Promise<void> {
  await app.page.goto(`${app.site}/?mode=${mode}#/`)
  await waitForThePage(app.page, 60_000)
  await app.page.locator('[data-home-section="agents"]').waitFor({ timeout: 30_000 })
}

/** The ranked answer's door, `api.attentionHome`, which `readAttentionHomePaced` in src/web/lib/oneread.ts asks. */
function isTheRankedAnswer(request: { url(): string }): boolean {
  const url = new URL(request.url())
  return url.pathname === '/api/attention' && url.searchParams.get('shape') === 'home'
}

describe('a report marked read on Home', () => {
  it('leaves the reports band well before the pace would ask again, and the other rows stay', async () => {
    await open('normal')
    const band = app.page.locator('.hm-main-column .att-rep-list').first()
    const row = (title: string) => band.locator('.att-rep').filter({ has: app.page.locator('.att-rep-title', { hasText: title }) })
    for (const title of TITLES) await row(title).waitFor({ timeout: 30_000 })
    const [marked, ...others] = TITLES
    const press = row(marked).locator('.att-rep-press .px-btn')
    expect(await press.innerText()).toContain(t('home.iHaveRead'))
    let asked = 0
    const count = (request: { url(): string }) => { if (isTheRankedAnswer(request)) asked += 1 }
    app.page.on('request', count)
    try {
      await press.click()
      await expect.poll(() => asked, { timeout: BOUND_MS, message: 'the ranked answer was not asked again after the press' }).toBeGreaterThan(0)
      await expect.poll(() => row(marked).count(), { timeout: BOUND_MS, message: 'the report marked read is still in the band' }).toBe(0)
      for (const title of others) expect(await row(title).count(), `${title} left the band too`).toBe(1)
    } finally {
      app.page.off('request', count)
    }
  }, 120_000)
})
