// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * HOME DRAWS NO REPORTS PART WHILE THE PROJECT HOLDS NO REPORT.
 *
 * The office answered and holds no report: no reports part, and no dash where one would stand. Needs you still says
 * "Nothing needs you.", and the three parts are drawn where the person kept them: A one column, B two columns, C a
 * band above two columns. No place is shown with no part in it. A part can still be dragged to another place while
 * the reports part is not drawn.
 *
 * While the attention read is on its way, or when it failed, the part is drawn as it was; those states are the
 * reports part's own test, tests/the-home-page-shows-at-most-five-reports.test.ts.
 *
 * THE PICTURES are taken only when W13Y_SIDEBAR_PICTURES names a folder: A, B and C at 1440, and A at 990, 660 and
 * 390, in light and dark.
 */
import { mkdirSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { join } from 'node:path'
import type { Page } from 'playwright'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { HOME_LAYOUT_A, HOME_LAYOUT_B, HOME_LAYOUT_C, homeLayoutSettingName, movePart, type HomeLayout, type HomePlace } from '../src/shared/home-layout.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'

const PICTURES = process.env['W13Y_SIDEBAR_PICTURES']
const ROW = homeLayoutSettingName(THE_TEST_OFFICES_OWNER.id)
const PICTURE_WIDTHS = [1440, 990, 660, 390] as const
const THEMES = ['light', 'dark'] as const

let app: LiveApp
let page: Page

beforeAll(async () => {
  app = await liveApp({ name: 'home-draws-no-reports-part', workspace: 'default', viewport: { width: 1440, height: 900 } })
  page = app.page
}, 300_000)

afterAll(async () => { await app?.stop() })

/** The layout row Home keeps for this person, written or taken out by hand, as the door would find it. */
function writeTheRow(value: string | null): void {
  const database = new DatabaseSync(join(app.dir, 'panelx.db'))
  try {
    if (value === null) database.prepare('DELETE FROM runtime_settings WHERE name = ?').run(ROW)
    else database.prepare('INSERT INTO runtime_settings (name, value) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET value = excluded.value').run(ROW, value)
  } finally { database.close() }
}

/** Opens Home at a width, once this project's attention answer has come back. */
async function open(width: number, height: number, theme: (typeof THEMES)[number]): Promise<void> {
  await page.setViewportSize({ width, height })
  await page.goto('about:blank')
  await page.goto(`${app.site}/?lang=en#/`, { timeout: 60_000 })
  // THE LOOK IS A STORED PRESET, NOT THE ADDRESS: set it, then read the page in it.
  await page.evaluate((look) => localStorage.setItem('mole-office.preset.theme', look), theme)
  const answered = page.waitForResponse((reply) => {
    const url = new URL(reply.url())
    return url.pathname === '/api/attention' && url.searchParams.get('shape') === 'home' && reply.status() === 200
  }, { timeout: 60_000 })
  await page.reload()
  await answered
  await waitForThePage(page, 60_000)
  await page.locator('[data-home-layout]').waitFor({ timeout: 30_000 })
  await page.locator('[data-home-part="schedule"]').waitFor({ timeout: 30_000 })
}

/** What the page draws: the reports part, each place's parts and whether it takes space, and each part's words. */
async function drawn(): Promise<{
  reports: number
  places: Record<HomePlace, { parts: string[]; shown: boolean }>
  parts: { part: string; words: number }[]
}> {
  return page.evaluate(() => {
    const root = document.querySelector<HTMLElement>('[data-home-layout]')!
    const place = (name: string) => {
      const element = root.querySelector<HTMLElement>(`[data-home-place="${name}"]`)!
      const rect = element.getBoundingClientRect()
      return {
        parts: [...element.querySelectorAll<HTMLElement>(':scope > [data-home-part]')].map((one) => one.getAttribute('data-home-part')!),
        shown: getComputedStyle(element).display !== 'none' && rect.height > 0,
      }
    }
    return {
      reports: document.querySelectorAll('[data-target="uiSurface/home.reports"]').length,
      places: { band: place('band'), first: place('first'), second: place('second') },
      parts: [...root.querySelectorAll<HTMLElement>('[data-home-part]')].map((one) => ({
        part: one.getAttribute('data-home-part')!,
        words: (one.querySelector('.hm-part-body')?.textContent ?? '').trim().length,
      })),
    }
  })
}

const asDrawn = (places: Awaited<ReturnType<typeof drawn>>['places']): HomeLayout => ({
  band: places.band.parts as HomeLayout['band'],
  first: places.first.parts as HomeLayout['first'],
  second: places.second.parts as HomeLayout['second'],
})

/** Checks a layout's places hold parts exactly when they take space, and every part draws words. */
function expectNoEmptyPlace(at: Awaited<ReturnType<typeof drawn>>, layout: HomeLayout, where: string): void {
  expect(asDrawn(at.places), where).toEqual(layout)
  for (const name of ['band', 'first', 'second'] as const) {
    expect(at.places[name].shown, `${where}: the ${name} place takes space exactly when it holds a part`).toBe(at.places[name].parts.length > 0)
  }
  expect(at.parts.map((one) => one.part).sort(), `${where}: every part of the layout is drawn`).toEqual(['agents', 'needs', 'schedule'])
  expect(at.parts.every((one) => one.words > 0), `${where}: a part is drawn with no words under its heading`).toBe(true)
}

function aKeep(): Promise<unknown> {
  return page.waitForResponse((reply) => new URL(reply.url()).pathname === '/api/home-layout' && reply.request().method() === 'PUT' && reply.status() === 200, { timeout: 20_000 })
}

/** Drags a part by its handle to the start of a place, as a person does. */
async function drag(part: string, to: HomePlace): Promise<void> {
  const handle = await page.locator(`[data-home-part="${part}"] [data-home-drag]`).boundingBox()
  expect(handle, `${part} has no handle to drag`).not.toBeNull()
  const fromX = handle!.x + handle!.width / 2, fromY = handle!.y + handle!.height / 2
  await page.mouse.move(fromX, fromY)
  await page.mouse.down()
  await page.mouse.move(fromX + 12, fromY + 12, { steps: 4 })
  const target = await page.locator(`[data-home-place="${to}"]`).boundingBox()
  expect(target, `the ${to} place is not drawn while ${part} is dragged`).not.toBeNull()
  await page.mouse.move(target!.x + target!.width / 2, target!.y + 6, { steps: 8 })
  await expect.poll(() => page.locator(`[data-home-place="${to}"] [data-home-drop-mark]`).count(), { timeout: 5_000 }).toBe(1)
  const kept = aKeep()
  await page.mouse.up()
  await kept
}

it.skipIf(PICTURES === undefined)('takes the pictures of Home in A, B and C with no report, at four widths in both themes', async () => {
  const folder = PICTURES!
  mkdirSync(folder, { recursive: true })
  try {
    for (const theme of THEMES) {
      for (const [name, layout, widths] of [
        ['A', null, PICTURE_WIDTHS],
        ['B', JSON.stringify(HOME_LAYOUT_B), [1440]],
        ['C', JSON.stringify(HOME_LAYOUT_C), [1440]],
      ] as const) {
        writeTheRow(layout)
        for (const width of widths) {
          await open(width, width === 390 ? 844 : 900, theme)
          await page.waitForTimeout(600)
          await page.screenshot({ path: join(folder, `home-no-reports-${name}-${String(width)}-${theme}.png`), fullPage: true })
        }
      }
    }
  } finally {
    writeTheRow(null)
  }
}, 900_000)

it('draws A, B and C with no reports part, no empty place, and the kept "Nothing needs you." line', async () => {
  try {
    for (const [name, layout, kept] of [
      ['A', HOME_LAYOUT_A, null],
      ['B', HOME_LAYOUT_B, JSON.stringify(HOME_LAYOUT_B)],
      ['C', HOME_LAYOUT_C, JSON.stringify(HOME_LAYOUT_C)],
    ] as const) {
      writeTheRow(kept)
      await open(1440, 900, 'light')
      const at = await drawn()
      expect(at.reports, `${name}: the reports part is not drawn`).toBe(0)
      expectNoEmptyPlace(at, layout, name)
      expect(await page.locator('[data-home-section="needs"]').innerText(), `${name}: Needs you keeps its line`).toContain('Nothing needs you.')
      expect(await page.locator('.px-panel-title', { hasText: 'Reports' }).count(), `${name}: no Reports heading`).toBe(0)
    }
  } finally {
    writeTheRow(null)
  }
}, 240_000)

it('still drags a part to another place while the reports part is not drawn, and keeps the move', async () => {
  writeTheRow(null)
  const moved = movePart(HOME_LAYOUT_A, 'agents', 'second', 0)
  try {
    await open(1440, 900, 'light')
    expect(await drawn().then((at) => at.reports), 'the reports part is not drawn').toBe(0)
    await drag('agents', 'second')
    await expect.poll(async () => asDrawn((await drawn()).places), { timeout: 10_000 }).toEqual(moved)
    expect(await drawn().then((at) => at.reports), 'the reports part is still not drawn after the move').toBe(0)
    await open(1440, 900, 'light')
    expect(asDrawn((await drawn()).places), 'the move is drawn again after a reload').toEqual(moved)
  } finally {
    writeTheRow(null)
  }
}, 240_000)
