// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { DatabaseSync } from 'node:sqlite'
import { join } from 'node:path'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { HOME_LAYOUT_A, HOME_LAYOUT_B, homeLayoutSettingName, stackedOrder, type HomePart } from '../src/shared/home-layout.ts'

let app: LiveApp

beforeAll(async () => {
  app = await liveApp({ name: 'home-two-column-layout', workspace: 'default', viewport: { width: 1440, height: 1000 } })
})

afterAll(async () => { await app?.stop() })

/** Keeps a layout for the test office's person, or removes the kept one, straight in the database. */
function keep(layout: unknown): void {
  const database = new DatabaseSync(join(app.dir, 'panelx.db'))
  try {
    const name = homeLayoutSettingName(THE_TEST_OFFICES_OWNER.id)
    if (layout === null) database.prepare('DELETE FROM runtime_settings WHERE name = ?').run(name)
    else database.prepare('INSERT INTO runtime_settings (name, value) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET value = excluded.value').run(name, JSON.stringify(layout))
  } finally { database.close() }
}

// HOME'S SECTIONS, IN THE ORDER A LAYOUT STACKS ITS PARTS: each part is one section, except Schedule, which is the week
// and then today's band. Nothing in the test office is late or stuck, so Late or stuck is not drawn and is not here.
const sectionsOf = (parts: readonly HomePart[]): string[] => parts.flatMap(part => part === 'schedule' ? ['week', 'today'] : [part])
const SECTIONS = sectionsOf(stackedOrder(HOME_LAYOUT_A))
const STACKED_B = sectionsOf(stackedOrder(HOME_LAYOUT_B))

// EACH OPENING HAS AN ADDRESS OF ITS OWN. An address the page already shows differs from it only by nothing, so the
// browser stays on the same page, and Home would not read the layout kept since.
let openings = 0

async function openAt(width: number) {
  await app.page.setViewportSize({ width, height: 1000 })
  openings += 1
  await app.page.goto(`${app.site}/?layout=${String(width)}&opening=${String(openings)}#/`)
  await waitForThePage(app.page, 30_000)
  await app.page.locator('[data-home-grid]').waitFor()
  await app.page.locator('[data-home-section="week"]').waitFor()
  return app.page.evaluate((ids) => {
    const grid = document.querySelector<HTMLElement>('[data-home-grid]')!
    const sections = Object.fromEntries(ids.map(id => {
      const element = document.querySelector<HTMLElement>(`[data-home-section="${id}"]`)!
      const rect = element.getBoundingClientRect()
      return [id, { x: rect.x, y: rect.y, width: rect.width, height: rect.height, bottom: rect.bottom }]
    })) as Record<string, { x: number; y: number; width: number; height: number; bottom: number }>
    return {
      columns: getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length,
      scrollWidth: document.documentElement.scrollWidth,
      viewport: innerWidth,
      sections,
    }
  }, [...SECTIONS])
}

it('keeps the sections in layout A\'s reading order at the widest and the narrowest width', async () => {
  // MUTATION: moving any section changes its data marker order and this assertion fails.
  keep(null)
  for (const width of [1440, 390]) {
    await openAt(width)
    expect(await app.page.locator('[data-home-section]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-home-section'))), `${String(width)}px`).toEqual([...SECTIONS])
  }
}, 120_000)

it('draws layout A as one column at 1440, because its empty second column takes no space', async () => {
  keep(null)
  const layout = await openAt(1440)
  expect(layout.columns).toBe(1)
  const rects = Object.values(layout.sections)
  expect(rects.every(rect => Math.abs(rect.x - rects[0]!.x) < 1)).toBe(true)
  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.viewport)
}, 60_000)

it('draws layout B as two columns side by side at 1440, and stacks them at 1180 pixels and below without overflow', async () => {
  // MUTATION: setting the cut below 1180 opens two columns at one tested width and fails here.
  keep(HOME_LAYOUT_B)
  const wide = await openAt(1440)
  expect(wide.columns).toBe(2)
  expect(wide.sections.agents!.x).toBe(wide.sections.week!.x)
  expect(wide.sections.agents!.x).toBeGreaterThan(wide.sections.needs!.x + wide.sections.needs!.width - 1)
  // Each column starts at the top: the key items head the first, and Agents at work the second.
  expect(Math.abs(wide.sections.agents!.y - wide.sections.keyItems!.y)).toBeLessThan(2)
  expect(wide.scrollWidth).toBeLessThanOrEqual(wide.viewport)
  for (const width of [1180, 390]) {
    const layout = await openAt(width)
    expect(layout.columns, `${String(width)}px column count`).toBe(1)
    const rects = STACKED_B.map(id => layout.sections[id]!)
    expect(rects.every(rect => Math.abs(rect.x - rects[0]!.x) < 1), `${String(width)}px horizontal alignment`).toBe(true)
    expect(rects.every((rect, index) => index === 0 || rect.y > rects[index - 1]!.y), `${String(width)}px reading order`).toBe(true)
    expect(layout.scrollWidth, `${String(width)}px sideways overflow`).toBeLessThanOrEqual(layout.viewport)
  }
  keep(null)
}, 120_000)

// TODAY'S TWO DISCLOSURES LEFT HOME EARLIER: the week's hours and what is offered for today are on the plan page.
// The case that timed their opening went with them.
