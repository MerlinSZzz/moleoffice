// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PERSON SKIPS A SECRETARY'S NEXT BROADCAST WITH ONE PRESS ON ITS AGENT PAGE. Wave 13p round 29,
 * piece 0, item 5, which rests on a decision that a quiet day needs no report.
 *
 * WHAT THIS FILE PROVES. On a secretary's page, the broadcasts panel carries the press "Skip the next
 * broadcast" for the person. Pressing it says the next slot has nothing to report, through the door
 * POST /api/participants/agent/:id/broadcast-skip. Afterwards the reading names that slot as skipped,
 * the panel says so in a line, and the press is gone, because that slot is already skipped.
 *
 * MADE-UP: the agent is "tern", started as a secretary.
 *
 * MUTATION PROOF, after a green control run, restored byte-identical (/tmp/r29/broadcast/proofs.md):
 *   press-does-nothing — in src/web/pages/ProfilePage.tsx the press calls `Promise.resolve()` instead of
 *                        `api.skipABroadcast(agent, next.at)`. Red: the reading names no skipped slot.
 *
 * PICTURES. The page before the press at 1440 in light.
 * They go to a folder of the test's own, or under TEST_SHOTS where that names one.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Page } from 'playwright'
import { join } from 'node:path'
import { liveApp, type LiveApp, waitForThePage } from './helpers.ts'
import { pairTheContext } from './a-paired-context.ts'
import { testShots } from './where-shots-go.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import type { BroadcastReading } from '../src/shared/broadcast.ts'

const SHOTS = testShots('the-person-skips-a-broadcast')

const THEIR: Record<string, string> = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

const PANEL = '[data-target="uiSurface/profile.broadcast"]'

let app: LiveApp
let page: Page

async function open(lang: 'en' | 'zh', width = 1440, scheme: 'light' | 'dark' = 'light'): Promise<void> {
  await page.setViewportSize({ width, height: 1000 })
  await page.emulateMedia({ colorScheme: scheme })
  await page.goto('about:blank')
  await page.goto(`${app.site}/?lang=${lang}#/who/agent/tern`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.reload({ timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.locator(`${PANEL} .prof-says`).first().waitFor({ state: 'attached', timeout: 30_000 })
}

/** Tern's broadcast reading, as the agent page's reply carries it. */
async function ternsReading(): Promise<BroadcastReading> {
  const reply = await fetch(`${app.api}/api/participants/agent/tern/profile`, { headers: THEIR })
  expect(reply.status, 'the agent page reply').toBe(200)
  return ((await reply.json()) as { participant: { broadcast: BroadcastReading } }).participant.broadcast
}

beforeAll(async () => {
  app = await liveApp({ name: 'the-person-skips-a-broadcast', viewport: { width: 1440, height: 1000 }, workspace: 'default' })
  page = app.page
  await pairTheContext(app.context, app.api)
  const started = await fetch(`${app.api}/api/agents/started`, {
    method: 'POST',
    headers: THEIR,
    body: JSON.stringify({ handle: 'tern', name: 'Tern', role: 'secretary' }),
  })
  expect(started.status, await started.text()).toBe(201)
}, 300_000)

afterAll(async () => {
  await app?.stop()
}, 120_000)

describe('the press that skips the next broadcast', () => {
  it('says the next slot has nothing to report, and the panel then shows it skipped with no press', async () => {
    const before = await ternsReading()
    expect(before.on).toBe(true)
    expect(before.next, 'a running schedule has a next slot').not.toBeNull()
    expect(before.skipped).toBeNull()
    await open('en')
    const press = page.locator(PANEL).getByRole('button', { name: 'Skip the next broadcast' })
    await press.waitFor({ state: 'visible', timeout: 30_000 })
    await press.scrollIntoViewIfNeeded()
    await page.screenshot({ path: join(SHOTS, 'before-the-press-1440-en-light.png') })
    await press.click()
    // THE READING FIRST, so a press that wrote nothing fails on the fact and not on a wait.
    await expect.poll(async () => (await ternsReading()).skipped, { timeout: 30_000 }).toEqual(before.next)
    expect((await ternsReading()).last, 'a skip is not a report').toBeNull()
    await page.locator(PANEL).getByText('is skipped, because there is nothing to report.').waitFor({ state: 'visible', timeout: 30_000 })
    expect(await page.locator(PANEL).getByRole('button', { name: 'Skip the next broadcast' }).count()).toBe(0)
  }, 180_000)
})
