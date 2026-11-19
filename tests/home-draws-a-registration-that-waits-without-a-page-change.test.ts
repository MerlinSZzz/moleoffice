// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * HOME DRAWS A SESSION THAT REGISTERS ITSELF AT ONCE, WITH NO PAGE CHANGE. Problem sPEo_5NxXX4X.
 *
 * The owner had Home open in the desktop window while a Claude registered itself. Its row came only after they went to
 * another page and back, so a tester following the guide's admit step (docs/beta/for-your-ai.md) would find nothing to
 * press. Home reads what waits again once a minute (HOME_REREAD_MS), and the shell reads it when the route changes; the
 * office now also tells every open page when a request that waits for the person is filed, answered or withdrawn
 * (tests/a-request-that-waits-for-the-person-is-announced.test.ts measures that on the server).
 *
 * WHAT IS MEASURED, in a browser on a test office of this file's own (liveApp):
 *   1. Home is open and drawn. A session registers itself through the real door and waits. Its row is drawn under
 *      Needs you within a third of HOME_REREAD_MS, before the minute's re-read can have run, and the page's address is
 *      still the one it opened.
 *   2. The person admits it through the grant door, not on this page. The row leaves this page in the same time.
 *
 * WHAT IT DOES NOT MEASURE. This is Chromium on Linux, not the packaged window on a Mac. The Mac readings of 5 November
 * showed the packaged window's stream open and quiet, which is what this file's cause predicts; the window itself is
 * checked on the Mac test user after the next package.
 *
 * MUTATIONS, each after a control run: remove the announcement on the create door of src/server/lib/records.ts (case 1
 * goes red); remove it on the patch door (case 2 goes red).
 */

import { join } from 'node:path'
import type { Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { HOME_REREAD_MS } from '../src/web/pages/HomePage.tsx'
import { THE_PERSON } from '../src/shared/person.ts'
import { THE_TEST_FIXTURE_ROOT } from './a-page-of-a-test-office.ts'
import { liveApp, thePersonsKeyHeader, waitForThePage, type LiveApp } from './helpers.ts'

/** Less than the minute's re-read, so a row drawn in this time was not drawn by it. */
const IN_TIME = HOME_REREAD_MS / 3

let app: LiveApp
let page: Page
let person: Record<string, string>
/** When Home was drawn, so the minute's re-read can be told apart from the announcement. */
let openedAt = 0
let openedAddress = ''
let request = ''
const pageErrors: string[] = []

async function post(path: string, headers: Record<string, string>, body: unknown): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = await fetch(`${app.api}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', ...headers },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  return { status: res.status, json: text === '' ? {} : (JSON.parse(text) as Record<string, unknown>) }
}

/** The row Home's Needs you draws for one waiting item. */
const theRow = (id: string) => page.locator(`[data-home-section="needs"] [data-home-waiting-id="${id}"]`).first()

/** What Home's Needs you drew, for a wait that runs out. */
async function whatNeedsYouDrew(): Promise<string> {
  return page.evaluate(() => (document.querySelector('[data-home-section="needs"]') as HTMLElement | null)?.innerText.replace(/\s+/g, ' ').slice(0, 800) ?? 'no Needs you section')
}

beforeAll(async () => {
  app = await liveApp({ name: 'home-draws-a-registration', workspace: 'default', viewport: { width: 1440, height: 1000 } })
  page = app.page
  page.on('pageerror', (error) => pageErrors.push(error.message))
  person = thePersonsKeyHeader(join(app.dir, 'keys.json'))
  await page.goto(`${app.site}/#/`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.locator('[data-home-section="needs"]').first().waitFor({ state: 'visible', timeout: 30_000 })
  openedAt = Date.now()
  openedAddress = page.url()
}, 300_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

describe('Home and a session that registers itself', () => {
  it('1. draws the waiting row under Needs you before the minute re-read, with no page change', async () => {
    const asked = await post(
      '/api/agents/register-myself',
      { 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'newcomer' },
      { handle: 'newcomer', name: 'Newcomer', workingDirectory: `${THE_TEST_FIXTURE_ROOT}/test_claude/panelx`, requestedRole: 'worker' },
    )
    expect(asked.status, JSON.stringify(asked.json)).toBe(202)
    request = String(asked.json['request'])
    try {
      await theRow(request).waitFor({ state: 'visible', timeout: IN_TIME })
    } catch {
      throw new Error(`The row for ${request} was not drawn in ${String(IN_TIME)} ms. Needs you drew: ${await whatNeedsYouDrew()}. The page threw: ${pageErrors.join(' | ') || 'nothing'}`)
    }
    expect(Date.now() - openedAt, 'drawn before the minute re-read could run').toBeLessThan(HOME_REREAD_MS)
    expect(page.url()).toBe(openedAddress)
  })

  it('2. takes it away when the person admits it somewhere else', async () => {
    expect(request, 'case 1 filed the request').not.toBe('')
    // A ROW THAT WAS NEVER DRAWN WOULD PASS THE WAIT BELOW, so it must be drawn before the press.
    expect(await theRow(request).isVisible(), 'the row is drawn before the press').toBe(true)
    const pressedAt = Date.now()
    const granted = await post(`/api/roles/requests/${request}/grant`, { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON, ...person }, {})
    expect(granted.status, JSON.stringify(granted.json)).toBe(201)
    try {
      await theRow(request).waitFor({ state: 'detached', timeout: IN_TIME })
    } catch {
      throw new Error(`The row for ${request} was still drawn after ${String(IN_TIME)} ms. Needs you drew: ${await whatNeedsYouDrew()}`)
    }
    expect(Date.now() - pressedAt).toBeLessThan(IN_TIME)
    expect(page.url()).toBe(openedAddress)
  })
})
