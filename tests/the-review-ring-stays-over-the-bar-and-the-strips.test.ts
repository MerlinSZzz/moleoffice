// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { join } from 'node:path'
import type { Route } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { testShots } from './where-shots-go.ts'

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

let app: LiveApp

beforeAll(async () => {
  app = await liveApp({ name: 'review-ring-over-the-bar', workspace: 'default', viewport: { width: 390, height: 844 } })
  const made = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: AS_THE_OWNER,
    body: JSON.stringify({ kind: 'module', title: 'A test module for the review ring', data: { context: 'test data' } }),
  })
  expect(made.status, await made.clone().text()).toBe(201)
  const record = ((await made.json()) as { record: { id: string; workspaceId: string } }).record
  const review = await fetch(`${app.api}/api/reviews`, {
    method: 'POST',
    headers: AS_THE_OWNER,
    body: JSON.stringify({ entry: { target: { kind: 'record', recordId: record.id, workspaceId: record.workspaceId } } }),
  })
  expect(review.status, await review.clone().text()).toBeLessThan(300)
}, 240_000)

afterAll(async () => {
  await app.page.unroute('**/api/runtime').catch(() => undefined)
  await app?.stop()
}, 60_000)

/** Refuse a re-read the way the door refuses, with the server's own headers, so the recheck strip stays. */
async function refuseTheRead(route: Route): Promise<void> {
  const response = await route.fetch()
  const headers = response.headers()
  delete headers['content-length']
  await route.fulfill({ status: 500, headers, body: JSON.stringify({ error: 'a test refusal', reason: 'refused on purpose by the test' }) })
}

/** The Runtime page with the ring drawn and, when asked, the recheck strip showing. */
async function openWithTheRing(width: number, lang: 'en' | 'zh' = 'en', scheme: 'light' | 'dark' = 'light', strip = true): Promise<void> {
  await app.page.unroute('**/api/runtime')
  await app.page.setViewportSize({ width, height: 844 })
  await app.page.emulateMedia({ colorScheme: scheme })
  await app.page.goto('about:blank')
  await app.page.goto(`${app.site}/?lang=${lang}#/runtime`, { timeout: 60_000 })
  await waitForThePage(app.page, 60_000)
  await app.page.waitForSelector('.rt-again', { timeout: 20_000 })
  await app.page.locator('.px-strip-ring').waitFor({ state: 'attached', timeout: 20_000 })
  if (strip) {
    await app.page.route('**/api/runtime', refuseTheRead)
    await app.page.click('.rt-again')
    await app.page.locator('.px-reread .px-error').first().waitFor({ timeout: 15_000 })
  }
  await app.page.waitForTimeout(300)
}

type Box = { x: number; y: number; width: number; height: number }

/** Whether the ring is drawn over this strip of screen: the strip photographed with it and without it differs. */
async function theRingIsDrawnOver(clip: Box): Promise<boolean> {
  const withTheRing = await app.page.screenshot({ clip })
  await app.page.evaluate(() => {
    for (const ring of document.querySelectorAll<HTMLElement>('.px-strip-ring')) ring.style.visibility = 'hidden'
  })
  const without = await app.page.screenshot({ clip })
  await app.page.evaluate(() => {
    for (const ring of document.querySelectorAll<HTMLElement>('.px-strip-ring')) ring.style.visibility = ''
  })
  return !withTheRing.equals(without)
}

describe('the review ring stays over the top bar and the strips (check VB0xb6PGknjN)', () => {
  it.each([390])('draws its top edge over the top bar at %i', async (width) => {
    await openWithTheRing(width, 'en', 'light', false)
    const ring = (await app.page.locator('.px-strip-ring').boundingBox()) as Box
    const bar = (await app.page.locator('.shell-bar').boundingBox()) as Box
    expect(bar, 'no top bar below 1024 px').not.toBeNull()
    // THE EDGE AND THE BAR MEET: the ring's top lies within the bar, which is where it was covered.
    expect(ring.y, `at ${String(width)} the ring's top is not where the bar is`).toBeLessThan(bar.y + bar.height)
    expect(await theRingIsDrawnOver({ x: 0, y: Math.max(0, ring.y), width, height: 4 }), `at ${String(width)} the bar covers the ring`).toBe(true)
  }, 120_000)

  it('draws its bottom edge over the recheck strip', async () => {
    await openWithTheRing(390)
    const ring = (await app.page.locator('.px-strip-ring').boundingBox()) as Box
    const strip = (await app.page.locator('.px-reread').boundingBox()) as Box
    expect(ring.y + ring.height, 'the ring does not reach the strip').toBeGreaterThan(strip.y)
    expect(await theRingIsDrawnOver({ x: 0, y: ring.y + ring.height - 4, width: 390, height: 4 }), 'the recheck strip covers the ring').toBe(true)
  }, 120_000)

  it.skipIf(!process.env['TEST_SHOTS'])('photographs the ring with the recheck strip, at four widths, light and dark, English and Chinese', async () => {
    const shots = testShots('the-review-ring-stays-over-the-bar-and-the-strips')
    for (const lang of ['en', 'zh'] as const) {
      for (const width of [1440, 990, 660, 390]) {
        for (const scheme of ['light', 'dark'] as const) {
          await openWithTheRing(width, lang, scheme)
          await app.page.screenshot({ path: join(shots, `review-ring-${String(width)}-${lang}-${scheme}.png`) })
        }
      }
    }
  }, 600_000)
})
