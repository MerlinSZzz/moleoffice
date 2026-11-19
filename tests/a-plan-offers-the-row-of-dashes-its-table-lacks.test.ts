// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PLAN OFFERS THE ROW OF DASHES ITS TABLE LACKS, AND ADDS IT ONLY WHEN SOMEBODY PRESSES.
 *
 * A pipe table typed without a row of dashes under its first line cannot be read as a table,
 * because nothing says which line is its heading, so it is printed as typed (problem
 * ycjTSBsmrRr7). Until this file, nothing offered the row. `MissingDashRows` in
 * src/web/pages/plans/OnePlanPage.tsx now names each such table by its first line and offers one
 * press, which writes the row `dashRowFor` in src/shared/plandoc.ts gives through the writing box's
 * own path, so the plan's autosave stores it.
 *
 * In a real browser, against a test office of this file's own, on a made-up plan.
 *
 * WHAT IS CLAIMED
 *
 *   1. The page names the one table that lacks its row and nothing else; the press stores exactly
 *      that row under that line, the offer goes, and the table's rows reach the Table view.
 *   2. A plan whose tables all have their row draws no offer.
 *
 * When TEST_SHOTS names a folder, it also photographs the offer at 1440, 990, 660 and 390 in light
 * and dark, and at 1440 in Chinese and in the test language.
 *
 * MUTATION, AFTER A CONTROL RUN (the commit that added this file names the logs):
 *   - the press writing the document back unchanged (`add` in MissingDashRows writing `lines`
 *     without the row): case 1 goes red.
 */

import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type LiveApp, liveApp, waitForThePage } from './helpers.ts'

let app: LiveApp
let page: Page

const WITHOUT = [
  '# Greenhouse week',
  '## Samples',
  '| Sample | Owner |',
  '| beaker 3 | Rowan |',
  '| beaker 4 | Priya |',
  '',
  '## Supplies',
  '| Item | Count |',
  '| --- | --- |',
  '| pots | 12 |',
].join('\n')

const MENDED = [
  '# Greenhouse week',
  '## Samples',
  '| Sample | Owner |',
  '| --- | --- |',
  '| beaker 3 | Rowan |',
  '| beaker 4 | Priya |',
  '',
  '## Supplies',
  '| Item | Count |',
  '| --- | --- |',
  '| pots | 12 |',
].join('\n')

async function newPlan(title: string, body: string): Promise<string> {
  const res = await fetch(`${app.api}/api/plans`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title, body }),
  })
  if (!res.ok) throw new Error(`starting a plan answered ${String(res.status)}: ${await res.text()}`)
  return ((await res.json()) as { plan: { id: string } }).plan.id
}

async function storedBody(id: string): Promise<string> {
  const res = await fetch(`${app.api}/api/plans/${id}/blocks`)
  if (!res.ok) throw new Error(`reading the plan back answered ${String(res.status)}: ${await res.text()}`)
  return ((await res.json()) as { lines: { line: { text: string } }[] }).lines.map((one) => one.line.text).join('\n')
}

async function openPlan(id: string, look: 'light' | 'dark' = 'light', lang: 'en' | 'zh' | 'xx' = 'en'): Promise<void> {
  await page.addInitScript((theme) => {
    localStorage.setItem('mole-office.preset.theme', theme)
  }, look)
  await page.goto(`${app.site}/${lang === 'en' ? '' : `?lang=${lang}`}#/plans/${id}`, { timeout: 60_000 })
  await page.reload({ timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.waitForSelector('.op-plan', { timeout: 30_000 })
}

beforeAll(async () => {
  app = await liveApp({ name: 'dash-row', viewport: { width: 1440, height: 1000 } })
  page = app.page
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

describe('the offer to add a missing row of dashes', () => {
  it('1: names the one table without its row, and the press stores exactly that row', async () => {
    const id = await newPlan('Greenhouse week', WITHOUT)
    await openPlan(id)
    const offers = page.locator('.op-dashrow')
    await expect.poll(() => offers.count(), { timeout: 30_000 }).toBe(1)
    expect(await offers.first().locator('code').innerText()).toBe('| Sample | Owner |')
    expect(await offers.first().innerText()).toContain('has no row of dashes under its first line')

    await offers.first().getByRole('button', { name: 'Add the row of dashes' }).click()
    await expect.poll(() => storedBody(id), { timeout: 30_000 }).toBe(MENDED)
    await expect.poll(() => offers.count(), { timeout: 30_000 }).toBe(0)
    // The Table's words are boxes a person types in, so their words are read from the boxes.
    const tableWords = () =>
      page.locator('.pt textarea, .pt input').evaluateAll((boxes) => boxes.map((box) => (box as HTMLTextAreaElement).value))
    await expect.poll(tableWords, { timeout: 30_000 }).toContain('beaker 4')
  }, 120_000)

  it('2: draws no offer when every table has its row', async () => {
    const id = await newPlan('Greenhouse week, mended', MENDED)
    await openPlan(id)
    await page.waitForSelector('.pt', { timeout: 30_000 })
    expect(await page.locator('.op-dashrow').count()).toBe(0)
  }, 120_000)

})

describe('the pictures', () => {
  it.skipIf(!process.env['TEST_SHOTS'])('4: photographs the offer', async () => {
    const shots = process.env['TEST_SHOTS'] as string
    mkdirSync(shots, { recursive: true })
    const id = await newPlan('Greenhouse week, photographed', WITHOUT)
    const snap = async (name: string): Promise<void> => {
      await page.locator('.op-dashrow').first().scrollIntoViewIfNeeded()
      await page.screenshot({ path: join(shots, `${name}.png`), fullPage: false })
    }
    for (const look of ['light', 'dark'] as const) {
      await openPlan(id, look)
      for (const width of [1440, 990, 660, 390]) {
        await page.setViewportSize({ width, height: 1000 })
        await page.locator('.op-dashrow').first().waitFor({ timeout: 30_000 })
        await snap(`dash-row-${String(width)}-${look}`)
      }
    }
    await page.setViewportSize({ width: 1440, height: 1000 })
    for (const lang of ['zh', 'xx'] as const) {
      await openPlan(id, 'light', lang)
      await page.locator('.op-dashrow').first().waitFor({ timeout: 30_000 })
      await snap(`dash-row-1440-light-${lang}`)
    }
  }, 300_000)
})
