// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE CHECK PANEL SAYS WHEN ITS CHECK WAS ASSEMBLED TO THE MINUTE. Problem F5su-m2jyNYX.
 *
 * "What the check would read" ended with the assembly's stored stamp as it came
 * ("组装于 2026-09-30T10:00:00.000Z。") in normal mode. It now writes the moment with `stampToTheMinute`
 * in src/web/lib/minute.ts, the office's one way of writing a moment to the minute: the clock alone
 * today, and the day before it on another day. Developer mode writes the same and the stored stamp
 * beside it.
 *
 * WHAT THIS PROVES, IN A REAL BROWSER, IN ENGLISH AND IN CHINESE:
 *   - normal mode (?mode=normal) writes the assembly's clock time, and not the stored stamp;
 *   - developer mode (?mode=inspect) writes the clock time and the stored stamp.
 * The clock time is worked out in the browser, from the made-up stamp, because the page writes this
 * computer's wall clock.
 *
 * THE RUN IS REAL AND THE CHECK ON IT IS MADE UP, the way
 * tests/the-check-panel-names-its-base-only-in-developer-mode.test.ts makes one: the page's read of
 * the run is answered through `page.route` with the real reply plus a made-up `whatTheCheckWouldRead`.
 *
 * THE MUTATION THIS IS WRITTEN AGAINST, after a control run: in `WhatItWouldRead` in
 * src/web/components/TheCheckOnARun.tsx, hand `chk.assembled` the stored stamp again
 * (`{ at: read.at }`). Both normal-mode cases go red on the stored stamp. Restored, green again.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Page } from 'playwright'
import { join } from 'node:path'
import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { liveApp, type LiveApp, waitForThePage } from './helpers.ts'
import { testShots } from './where-shots-go.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { createI18n } from '../src/shared/i18n.ts'

const SHOTS = testShots('check-panel')

const MADE_UP_AT = '2026-09-30T10:00:00.000Z'

const asPerson: Record<string, string> = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const asAgent = (id: string): Record<string, string> => ({
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': id,
})

let app: LiveApp
let page: Page
let runId = ''

async function post(path: string, body: unknown, headers = asPerson): Promise<Record<string, unknown>> {
  const res = await fetch(`${app.api}${path}`, { method: 'POST', headers, body: JSON.stringify(body) })
  if (!res.ok) throw new Error(`POST ${path} answered ${String(res.status)}: ${await res.text()}`)
  return (await res.json()) as Record<string, unknown>
}

async function open(lang: 'en' | 'zh', mode: 'normal' | 'inspect'): Promise<void> {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto(`${app.site}/?lang=${lang}&mode=${mode}#/session/${runId}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.reload({ timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.locator('.chk .chk-when').waitFor({ timeout: 30_000 })
}

/** The assembly line, and the stamp's clock time on this computer, worked out in the browser. */
async function theLine(): Promise<{ line: string; clock: string }> {
  return page.evaluate((at) => {
    const when = new Date(at)
    const two = (n: number) => String(n).padStart(2, '0')
    return {
      line: (document.querySelector('.chk .chk-when')?.textContent ?? '').trim(),
      clock: `${two(when.getHours())}:${two(when.getMinutes())}`,
    }
  }, MADE_UP_AT)
}

beforeAll(async () => {
  app = await liveApp({ name: 'check-assembled-minute', viewport: { width: 1440, height: 1000 } })
  page = app.page
  await post('/api/agents/started', { handle: THE_TEST_OFFICES_SECRETARY.handle, name: THE_TEST_OFFICES_SECRETARY.name, runtime: 'claude-code', role: 'secretary' })
  await post(
    '/api/agents/started',
    { handle: 'lamp-worker', name: 'lamp-worker', runtime: 'claude-code', role: 'worker', chapters: ['5:full'], workArea: ['work'] },
    asAgent(THE_TEST_OFFICES_SECRETARY.handle),
  )
  const made = (await post(
    '/api/records',
    { kind: 'session', title: 'A made-up run with an assembled check', data: { state: 'running', servingAgent: 'lamp-worker', doing: 'mending the lamp' } },
    asAgent('lamp-worker'),
  ))['record'] as { id: string }
  runId = made.id
  await page.route(`**/api/records/${runId}`, async (route) => {
    const real = await route.fetch()
    const body = (await real.json()) as { record: { data: Record<string, unknown> } }
    body.record.data['whatTheCheckWouldRead'] = { at: MADE_UP_AT, inside: ['work/the-lamp.ts'], outside: [], chaptersAt: [] }
    await route.fulfill({ response: real, json: body })
  })
}, 180_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

for (const lang of ['en', 'zh'] as const) {
  const words = createI18n(lang)
  const [before] = words.t('chk.assembled', { at: '\u0000' }).split('\u0000')

  describe(`the assembly's time, in ${lang}`, () => {
    it('is written to the minute in normal mode, without the stored stamp', async () => {
      await open(lang, 'normal')
      if (lang === 'zh') {
        await page.locator('.chk').scrollIntoViewIfNeeded()
        await page.screenshot({ path: join(SHOTS, 'check-panel-1440-zh-light.png'), fullPage: true })
      }
      const { line, clock } = await theLine()
      expect(line.startsWith(before!), line).toBe(true)
      expect(line).toContain(clock)
      expect(line).not.toContain(MADE_UP_AT)
      expect(line).not.toContain('T10:00')
    })

    it('is written to the minute in developer mode, with the stored stamp beside it', async () => {
      await open(lang, 'inspect')
      const { line, clock } = await theLine()
      expect(line).toContain(clock)
      expect(line).toContain(MADE_UP_AT)
    })
  })
}
