// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE MISSING-DETAILS BOX'S "?" OPENS INSIDE THE PAGE AND OVER NO PRESS. Wave 13k round 40, piece 1.
 *
 * In round 39's picture of a Chinese report at 990 (report-zh-990-light.png), the words behind the "?" in a
 * record page's missing-details box ("这些内容是有意留空的。有内容时就可建立记录，答案到来后再补充。") began past
 * the page's left edge and lay over the box. The hint's words are anchored on the right edge of the "?" and
 * grow leftward, which keeps a "?" near a panel's right edge from widening the page. This "?" sits near the
 * left edge, after one short sentence, so its words grew off the page. A floating box would also lie over the
 * list below it, where each missing field has its own presses.
 *
 * WHAT IS CLAIMED: with the "?" opened, at 1440 and 390 in the light look, in English and Chinese, the
 * words lie inside the window, and they cover no button, link, field or other fold handle on the page.
 *
 * MADE-UP RECORD: one report the test office's person files with no summary, so its page has the box.
 *
 * MUTATION, after a control run (the commit that added this file names the logs): in src/web/components/ui.tsx,
 * the missing-details box's Hint drawn as every other Hint is, floating. The cases go red.
 *
 * PICTURES: only when TEST_SHOTS names a folder, the box with its "?" open at each width and language, in light.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Page } from 'playwright'
import { join } from 'node:path'
import { liveApp, type LiveApp, waitForThePage } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { createI18n } from '../src/shared/i18n.ts'
import { testShots, TEST_SHOTS } from './where-shots-go.ts'

const AS_THE_PERSON: Record<string, string> = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

const WORDS = { en: createI18n('en'), zh: createI18n('zh') } as const
const LANGUAGES = ['en', 'zh'] as const
const LOOKS = ['light'] as const
const WIDTHS = [1440, 390] as const

let app: LiveApp
let page: Page
let reportId = ''
const KEEP = (process.env[TEST_SHOTS] ?? '') !== ''
const SHOTS = testShots('missing-details-hint')

interface Seen {
  words: string
  box: { left: number; right: number; top: number; bottom: number } | null
  window: number
  covers: string[]
}

/** Open the record's page, press the box's "?", and measure what opened. */
async function openTheHint(language: 'en' | 'zh', look: string, width: number): Promise<Seen> {
  await page.setViewportSize({ width, height: 1000 })
  await page.goto('about:blank')
  await page.goto(`${app.site}/?lang=${language}&look=${look}#/r/${reportId}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await waitForThePage(page, 60_000)
  const mark = page.locator('.px-inc-lede .px-hint-mark > summary')
  await mark.waitFor({ timeout: 30_000 })
  await mark.scrollIntoViewIfNeeded()
  await mark.click()
  await page.locator('.px-inc-lede .px-hint-mark[open] .px-hint-body').waitFor({ timeout: 10_000 })
  return page.evaluate(() => {
    const body = document.querySelector('.px-inc-lede .px-hint-mark[open] .px-hint-body') as HTMLElement
    const own = body.parentElement?.querySelector('summary') ?? null
    const r = body.getBoundingClientRect()
    const overlaps = (o: DOMRect): boolean =>
      o.width > 0 && o.height > 0 && o.left < r.right - 1 && o.right > r.left + 1 && o.top < r.bottom - 1 && o.bottom > r.top + 1
    const presses = [...document.querySelectorAll('button, a[href], summary, input, select, textarea, [role="button"]')]
      .filter((one) => one !== own && !body.contains(one))
      // Only a press a person can see: one inside a closed fold still reports a box, and is drawn nowhere.
      .filter((one) => one.checkVisibility({ visibilityProperty: true, opacityProperty: true }))
      .filter((one) => overlaps(one.getBoundingClientRect()))
      .map((one) => `${one.tagName.toLowerCase()} "${(one.textContent ?? '').trim().slice(0, 40)}"`)
    return {
      words: (body.textContent ?? '').trim(),
      box: { left: r.left, right: r.right, top: r.top, bottom: r.bottom },
      window: document.documentElement.clientWidth,
      covers: presses,
    }
  })
}

beforeAll(async () => {
  app = await liveApp({ name: 'missing-details-hint', viewport: { width: 1440, height: 1000 }, workspace: 'default' })
  page = app.page
  await page.addInitScript(() => {
    localStorage.setItem('mole-office.preset.theme', new URLSearchParams(location.search).get('look') ?? 'light')
  })
  const res = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: AS_THE_PERSON,
    body: JSON.stringify({ kind: 'report', title: 'A made-up report with details still missing', data: {} }),
  })
  const body = (await res.json()) as { record?: { id: string }; error?: string }
  expect(res.status, JSON.stringify(body)).toBe(201)
  reportId = body.record!.id
}, 180_000)

afterAll(async () => {
  await app?.stop()
})

describe('the missing-details box opens its "?" inside the page', () => {
  for (const language of LANGUAGES) {
    it.each(WIDTHS)(`${language}: at %i, in light, the words lie inside the window and over no press`, async (width) => {
      for (const look of LOOKS) {
        const seen = await openTheHint(language, look, width)
        if (KEEP) await page.screenshot({ path: join(SHOTS, `hint-${language}-${width}-${look}.png`), fullPage: true })
        expect(seen.words, 'the box opened its own words').toBe(WORDS[language].t('sheet.incomplete.reason'))
        expect(seen.box!.left, `${look}: the words begin left of the window`).toBeGreaterThanOrEqual(0)
        expect(seen.box!.right, `${look}: the words end right of the window`).toBeLessThanOrEqual(seen.window)
        expect(seen.covers.join(' | '), `${look}: the words lie over a press`).toBe('')
      }
    }, 240_000)
  }
})
