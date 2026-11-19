// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE OFFICE MAP'S LIST NAMES AN AGENT THAT WROTE HERE AND IS IN NO REGISTRY. Home did, under Agents
 * at work, until a decision took the panel off Home. The
 * file keeps its old name.
 *
 * Criterion M14 of design/messages/ACCEPTANCE.md, as it read when this test was written: a record
 * write from an unknown agent is accepted and the row is named unregistered on the runtime and
 * dashboard pages. Since 30 September 2026 M14 says such a write is refused with HTTP 403, and the
 * list on the dashboard and the Office Map shows the writers that may write without a registration
 * and the unknown agents that wrote before the refusal existed. The old Home drew the panel
 * (UnregisteredAgentsHere) in its Also band. The five-section Home has no such band.
 * The round's first build left the panel on no page at all, so the dashboard half of M14 went unsaid.
 * It was drawn under Agents at work until the decision that took the panel off Home. The Office
 * Map's detailed list (#/working) draws it now. Normal mode names the writes and when; developer mode adds the id as
 * sent.
 *
 * Since 16 September 2026 (an unregistered name is refused), no new write can come from an
 * unregistered agent over HTTP, so the rows on the panel are writes from before that, or from the
 * writers that may write without a registration. This test therefore
 * answers the page's own reading (GET /api/working) with one made-up row.
 *
 * MUTATION: the Office Map's list stops drawing UnregisteredAgents; both modes go red.
 *
 * THE LAST WRITE IS TO THE MINUTE IN NORMAL MODE, as every time on Home is (problem ejarlQfb3Caz); the
 * seconds are developer mode's. The made-up row's last write is at 10:00:37 on a past day.
 * MUTATION: the panel draws the stored stamp in both modes (src/web/components/UnregisteredAgents.tsx);
 * the second case goes red on the seconds in normal mode.
 */
import { afterAll, beforeAll, expect, it } from 'vitest'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'

const STRANGER = 'made-up-stranger-47'
let app: LiveApp

beforeAll(async () => {
  app = await liveApp({ name: 'home-unregistered-agent', workspace: 'default', viewport: { width: 1440, height: 1000 } })
  await app.page.route('**/api/working*', async (route) => {
    const response = await route.fetch()
    const answer = (await response.json()) as { unregistered?: unknown[] }
    if (answer.unregistered !== undefined) answer.unregistered = [{ id: STRANGER, writes: 3, lastWroteAt: '2026-09-28 10:00:37' }]
    await route.fulfill({ response, json: answer })
  })
}, 180_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

it('draws the unregistered writer on the Office Map\'s list, and its id only in developer mode', async () => {
  for (const mode of ['normal', 'inspect'] as const) {
    await app.page.goto(`${app.site}/?mode=${mode}#/working`)
    await app.page.reload()
    await waitForThePage(app.page, 30_000)
    const row = app.page.locator('.unreg-row')
    await row.first().waitFor({ timeout: 20_000 })
    expect(await row.count(), `${mode}: one unregistered writer`).toBe(1)
    const text = await row.first().innerText()
    if (mode === 'inspect') expect(text, 'developer mode names the id as sent').toContain(STRANGER)
    else expect(text, 'normal mode shows no id').not.toContain(STRANGER)
  }
}, 120_000)

it('says the last write to the minute in normal mode, and to the second only in developer mode', async () => {
  const said: Record<string, string> = {}
  for (const mode of ['normal', 'inspect'] as const) {
    await app.page.goto(`${app.site}/?mode=${mode}#/working`)
    await app.page.reload()
    await waitForThePage(app.page, 30_000)
    const row = app.page.locator('.unreg-row')
    await row.first().waitFor({ timeout: 20_000 })
    said[mode] = await row.first().innerText()
  }
  expect(said.normal, 'normal mode says the minute').toContain('10:00')
  expect(said.normal, 'normal mode says the day, because the write was not today').toMatch(/28/)
  expect(said.normal, 'normal mode shows seconds').not.toContain('10:00:37')
  expect(said.normal, 'normal mode shows the stamp as stored').not.toContain('2026-09-28')
  expect(said.inspect, 'developer mode shows the stamp as stored').toContain('2026-09-28 10:00:37')
}, 120_000)
