// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A burst of messages in an open agent conversation must not repeatedly read the whole list.
 * The list is expensive to assemble, and an open conversation can schedule another read for each message.
 * Five seconds keeps counts current while placing a firm bound on those reads. A hidden page or list asks none;
 * deferred work must be read when the page becomes visible again.
 */
import { afterAll, beforeAll, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'

const OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const LEFT = 'made-up-refresh-left'
const RIGHT = 'made-up-refresh-right'
const LIST = '/api/messages/between-agents'
const INTERVAL = 5_000
let app: LiveApp
let pageCode: string

async function write(headers: Record<string, string>, body: unknown, expected = 201): Promise<void> {
  const response = await fetch(`${app.api}/api/records`, { method: 'POST', headers, body: JSON.stringify(body) })
  expect(response.status, await response.clone().text()).toBe(expected)
}

// Nothing holds the right-hand agent in this test office, so the office stores each message, routes it and answers
// 409 rather than 201; every message is stored all the same.
async function send(n: number): Promise<void> {
  await write({ ...OWNER, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': LEFT }, {
    kind: 'message', title: 'Made-up message', data: { body: `Made-up message ${n}`, to: [{ kind: 'agent', id: RIGHT }] },
  }, 409)
}

beforeAll(async () => {
  pageCode = `(() => {
      window.addEventListener('test-chat-refresh', () => window.dispatchEvent(new CustomEvent('mole-office.chat.read-again')))
      for (const state of ['hidden', 'visible']) window.addEventListener('test-page-' + state, () => {
        Object.defineProperty(document, 'visibilityState', { value: state, configurable: true })
        document.dispatchEvent(new Event('visibilitychange'))
      })
  })()`
  app = await liveApp({ name: 'made-up-between-refresh', viewport: { width: 1440, height: 1000 } })
  for (const handle of [LEFT, RIGHT]) {
    await write(OWNER, { kind: 'agent', title: `Made-up ${handle}`, data: { handle, runtime: 'claude-code', state: 'active' } })
  }
  await send(0)
}, 240_000)

afterAll(async () => { await app?.stop() }, 60_000)

it('coalesces a burst and does not read the list while the browser page or list is hidden', async () => {
  const asked: number[] = []
  app.page.on('request', (request) => { if (new URL(request.url()).pathname === LIST) asked.push(Date.now()) })
  await app.page.goto(`${app.site}/?lang=en#/`)
  await waitForThePage(app.page, 30_000)
  await app.page.addScriptTag({ content: pageCode })
  await app.page.click('.px-chat-circle')
  await app.page.click('.px-chat-tab[data-tab="between"]')
  const row = app.page.locator('.px-chat-under-tabs[data-showing="between"] .px-chat-contact').first()
  await row.waitFor({ timeout: 30_000 })
  await row.click()
  await app.page.locator('.px-chat-said [data-chat-content]').first().waitFor({ timeout: 30_000 })
  await app.page.waitForTimeout(INTERVAL + 1_000)
  const from = asked.length
  for (let n = 1; n <= 8; n++) {
    await send(n)
    await app.page.waitForTimeout(500)
  }
  await app.page.waitForTimeout(700)
  const burst = asked.slice(from)
  const gaps = burst.slice(1).map((at, i) => at - burst[i]!)
  expect.soft(gaps.length === 0 ? INTERVAL : Math.min(...gaps), 'shortest gap between reads during the message burst').toBeGreaterThanOrEqual(INTERVAL)
  await expect.poll(() => asked.length - from, { timeout: 12_000 }).toBeGreaterThan(0)

  // Headless Chromium does not always hide one page when another is brought forward.
  // Give the page the same visibility state and event that a browser sends on hiding it.
  await app.page.evaluate(() => window.dispatchEvent(new Event('test-page-hidden')))
  await app.page.waitForTimeout(INTERVAL + 1_000)
  const beforeHidden = asked.length
  await app.page.evaluate(() => window.dispatchEvent(new Event('test-chat-refresh')))
  await app.page.waitForTimeout(1_500)
  expect.soft(asked.length - beforeHidden, 'list reads while the page is hidden').toBe(0)
  const beforeShown = asked.length
  await app.page.evaluate(() => window.dispatchEvent(new Event('test-page-visible')))
  await expect.poll(() => asked.length - beforeShown, { timeout: 12_000 }).toBeGreaterThan(0)

  await app.page.locator('.px-chat-back').click()
  await app.page.locator('.px-chat-tab[data-tab="contacts"]').click()
  await app.page.waitForTimeout(INTERVAL + 1_000)
  const beforeOtherList = asked.length
  await app.page.evaluate(() => window.dispatchEvent(new Event('test-chat-refresh')))
  await app.page.waitForTimeout(1_500)
  expect(asked.length - beforeOtherList, 'list reads while another chat tab is selected').toBe(0)
}, 180_000)
