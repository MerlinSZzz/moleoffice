// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * HOME'S LATE OR STUCK IS ONE NUMBER, WHICH OPENS FOUR ROWS, SAYS HOW MANY THERE ARE, AND LINKS TO THE REST.
 *
 * By the person's decision, Late or stuck on home is one number, and pressing it opens its list in place.
 * The approved drawing (report Nr5dZygiWTy0, block b-3) shows "4 of 11" beside the heading and a link
 * to the rest. The first build drew every row: on a busy office the side
 * column ran to seventy rows and Home to 7,014 pixels at 1440. Now it draws four, says "4 of N", and
 * links to Work to do. The link does not claim a number, because Work to do is its own list.
 *
 * Five made-up pipelines stand still here, so Late or stuck's number is 5 and its list holds five rows. MUTATION: draw every
 * row (no cap); the row count and the count line go red.
 */
import { afterAll, beforeAll, expect, it } from 'vitest'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { createI18n } from '../src/shared/i18n.ts'

const headers = { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
let app: LiveApp

async function request(path: string, body?: unknown, method = 'POST') {
  const response = await fetch(`${app.api}${path}`, { method: body === undefined ? 'GET' : method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
  const answer = await response.json()
  expect(response.ok, `${method} ${path}: ${JSON.stringify(answer)}`).toBe(true)
  return answer
}

beforeAll(async () => {
  app = await liveApp({ name: 'home-late-shows-four', workspace: 'default', viewport: { width: 1440, height: 1000 } })
  for (const n of [1, 2, 3, 4, 5]) {
    const still = (await request('/api/records', { kind: 'pipeline', title: `Made-up stalled line ${String(n)}`, data: { blockIds: [] } })).record
    const block = await request(`/api/records/${still.id}/blocks`, { name: 'Wait for the parts', state: 'todo' })
    await request(`/api/records/${block.record.id as string}`, { dataPatch: { paused: { since: '2026-08-12 10:00:00', why: 'The made-up parts are late.' } } }, 'PATCH')
  }
}, 180_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

it('draws the number 5, and pressed, four of five rows, "4 of 5" and a link to Work to do, in both languages', async () => {
  for (const language of ['en', 'zh'] as const) {
    const { t } = createI18n(language)
    await app.page.goto(`${app.site}/?lang=${language}&mode=normal#/`)
    await app.page.reload()
    await waitForThePage(app.page, 30_000)
    const late = app.page.locator('[data-home-section="late"]')
    // A NUMBER IS DRAWN IN DIGITS in both languages.
    await expect.poll(async () => (await late.locator('[data-home-late-number]').innerText()).trim(), { timeout: 20_000 }).toBe('5')
    expect(await late.locator('.hm-alarm-row').first().isVisible(), `${language}: the list is closed until the number is pressed`).toBe(false)
    await late.locator('summary').click()
    await late.locator('.hm-alarm-row').first().waitFor({ timeout: 20_000 })
    await app.page.waitForTimeout(500)
    expect(await late.locator('.hm-alarm-row').count(), `${language}: rows drawn`).toBe(4)
    expect((await late.locator('.hm-section-count').innerText()).trim(), `${language}: the count`).toBe(t('home.lateShown', { n: 4, total: 5 }))
    const link = late.locator('.hm-section-link')
    expect(await link.getAttribute('href'), `${language}: the link`).toBe('#/work')
  }
}, 120_000)
