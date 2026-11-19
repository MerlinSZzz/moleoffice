// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SIDEBAR HAS ONE LINE ABOVE ITS FOOT.
 *
 * In a short window the list between Ask agent and the foot scrolls. Two rules drew a line one above the other
 * there: the mark at the bottom edge of the list, and the foot's own top line. One line is left: the foot's.
 * The list's mark keeps its fade, which says the list carries on, and gives up its line.
 *
 * At a tall window the list does not scroll, no edge mark is drawn, and the foot's own line still stands above it.
 * The test measures both heights in both themes, and the pictures below it show the same thing.
 */
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { Page } from 'playwright'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { SHIPPED_PINS } from '../src/shared/sidebar-pins.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'

const PICTURES = process.env['W13Y_SIDEBAR_PICTURES']
const OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}
/** More pages than a 600-high window holds, so the list scrolls. None of them is a page of the project. */
const MANY_PINS = ['home', 'notes', 'checklists', 'decisions', 'plans', 'horizons', 'counters', 'working', 'agents', 'embassy', 'regulations']
const SHORT = 600
const TALL = 1100
const THEMES = ['light', 'dark'] as const

let app: LiveApp
let page: Page

beforeAll(async () => {
  app = await liveApp({ name: 'the-sidebar-foot-has-one-rule-above-it', workspace: 'default', viewport: { width: 1440, height: SHORT } })
  page = app.page
}, 300_000)

afterAll(async () => { await app?.stop() })

/** Keeps the pages in front through the door, as a person's pin press does. */
async function setPins(pins: readonly string[]): Promise<void> {
  const reply = await fetch(`${app.api}/api/sidebar-pins`, { method: 'PUT', headers: OWNER, body: JSON.stringify({ pins }) })
  expect(reply.status, await reply.clone().text()).toBe(200)
}

async function open(height: number, theme: (typeof THEMES)[number]): Promise<void> {
  await page.setViewportSize({ width: 1440, height })
  await page.goto('about:blank')
  await page.goto(`${app.site}/?lang=en#/`)
  // THE LOOK IS A STORED PRESET, NOT THE ADDRESS: set it, then read the page in it.
  await page.evaluate((look) => localStorage.setItem('mole-office.preset.theme', look), theme)
  await page.reload()
  await waitForThePage(page, 60_000)
  await page.locator('#shell-side .sbp-foot').waitFor({ timeout: 30_000 })
}

/** What the browser answers about the list and the two rules that could stand above the foot. */
async function theRules(): Promise<{ scrolls: boolean; reachEdgeLine: number | null; footLine: number }> {
  return page.evaluate(() => {
    const list = document.querySelector<HTMLElement>('#shell-side .sbp-scroll')!
    const foot = document.querySelector<HTMLElement>('#shell-side .sbp-foot')!
    const edge = document.querySelector<HTMLElement>('#shell-side .sbp-reach > .px-reach-edge[data-side="down"]')
    const pixels = (value: string): number => Number.parseFloat(value)
    return {
      scrolls: list.scrollHeight > list.clientHeight + 2,
      reachEdgeLine: edge === null ? null : pixels(getComputedStyle(edge).borderBottomWidth),
      footLine: pixels(getComputedStyle(foot).borderTopWidth),
    }
  })
}

/** How many lines stand above the foot: the list's edge when it draws one, and the foot's own top line. */
function linesAboveTheFoot(at: Awaited<ReturnType<typeof theRules>>): number {
  return (at.reachEdgeLine !== null && at.reachEdgeLine > 0 ? 1 : 0) + (at.footLine > 0 ? 1 : 0)
}

it.skipIf(PICTURES === undefined)('takes the pictures of the sidebar in a short window and a tall one', async () => {
  const folder = PICTURES!
  mkdirSync(folder, { recursive: true })
  try {
    for (const theme of THEMES) {
      await setPins(MANY_PINS)
      await open(SHORT, theme)
      await page.locator('#shell-side .sbp-reach > .px-reach-edge[data-side="down"]').waitFor({ timeout: 10_000 })
      await page.waitForTimeout(600)
      await page.locator('#shell-side').screenshot({ path: join(folder, `sidebar-foot-short-1440-${theme}.png`) })
      await setPins(SHIPPED_PINS)
      await open(TALL, theme)
      await page.waitForTimeout(600)
      await page.locator('#shell-side').screenshot({ path: join(folder, `sidebar-foot-tall-1440-${theme}.png`) })
    }
  } finally {
    await setPins(SHIPPED_PINS)
  }
}, 300_000)

it('draws one line above the foot in a short window, where the list scrolls, and one in a tall one, where it does not', async () => {
  try {
    for (const theme of THEMES) {
      await setPins(MANY_PINS)
      await open(SHORT, theme)
      await page.locator('#shell-side .sbp-reach > .px-reach-edge[data-side="down"]').waitFor({ timeout: 10_000 })
      const short = await theRules()
      expect(short.scrolls, `${theme} at ${String(SHORT)}: the list scrolls`).toBe(true)
      expect(short.reachEdgeLine, `${theme} at ${String(SHORT)}: the list draws a bottom edge`).not.toBeNull()
      expect(linesAboveTheFoot(short), `${theme} at ${String(SHORT)}: lines above the foot`).toBe(1)
      expect(short.footLine, `${theme} at ${String(SHORT)}: the foot's own line stands`).toBeGreaterThan(0)

      await setPins(SHIPPED_PINS)
      await open(TALL, theme)
      await page.waitForTimeout(300)
      const tall = await theRules()
      expect(tall.scrolls, `${theme} at ${String(TALL)}: the list does not scroll`).toBe(false)
      expect(tall.reachEdgeLine, `${theme} at ${String(TALL)}: the list draws no bottom edge`).toBeNull()
      expect(linesAboveTheFoot(tall), `${theme} at ${String(TALL)}: lines above the foot`).toBe(1)
      expect(tall.footLine, `${theme} at ${String(TALL)}: the foot's own line stands`).toBeGreaterThan(0)
    }
  } finally {
    await setPins(SHIPPED_PINS)
  }
}, 240_000)
