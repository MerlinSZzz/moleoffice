// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { mkdirSync } from 'node:fs'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

// Wave 13y's walk in Chinese at 390 (problem sQdWsv7DsSyN, item 1): a module's second line was one
// line ending in "…", and the office's own fact before it, "1 个受阻", took most of that line, so the
// module's own words were cut. In a narrow list the second line now wraps. This opens the real modules
// page in Chinese at 390 and holds every row's second line to showing all of its words.
let app: LiveApp
const headers = { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const summary = '倒片台手摇柄的护罩裂了，现在用胶带缠着，下周换新的护罩之前先不要用快档'

beforeAll(async () => {
  app = await liveApp({ name: 'modules-row-390', workspace: 'default', viewport: { width: 390, height: 900 } })
  const data = { state: 'active', context: '倒片台上的手摇柄和它的护罩', parts: [{ id: 'part-1', name: '手摇柄', items: [{ id: 'item-1', text: '换护罩', state: 'blocked' }, { id: 'item-2', text: '量尺寸', state: 'done' }] }] }
  const reply = await fetch(`${app.api}/api/records`, { method: 'POST', headers, body: JSON.stringify({ kind: 'module', title: '倒片台', summary, data }) })
  expect(reply.status, await reply.clone().text()).toBeLessThan(300)
  // An English module beside it, so the pictures in English show a long line of the same kind.
  const english = { state: 'active', context: 'The reels the flood reached', parts: [{ id: 'part-1', name: 'Reels', items: [{ id: 'item-1', text: 'Pack the reels', state: 'blocked' }] }] }
  const second = await fetch(`${app.api}/api/records`, { method: 'POST', headers, body: JSON.stringify({ kind: 'module', title: 'Damaged reels', summary: 'Sending damaged reels to the county archive for repair before it closes for the winter', data: english }) })
  expect(second.status, await second.clone().text()).toBeLessThan(300)
})
afterAll(async () => { await app?.stop() })

it("shows a module's own words whole on the modules list in Chinese at 390", async () => {
  await app.page.goto(`${app.site}/?lang=zh#/modules`)
  await waitForThePage(app.page)
  await app.page.locator('main.page .flst-row .flst-text').first().waitFor({ timeout: 10_000 })
  const lines = await app.page.locator('main.page .flst-row .flst-text').evaluateAll((nodes) => nodes.map((one) => ({
    words: one.textContent ?? '',
    scrollWidth: one.scrollWidth,
    clientWidth: one.clientWidth,
    ellipsis: getComputedStyle(one).textOverflow === 'ellipsis' && getComputedStyle(one).whiteSpace === 'nowrap',
  })))
  console.log('modules second lines at 390', JSON.stringify(lines))
  const ours = lines.find((one) => one.words.includes(summary))
  // The fact the office puts first is on the line, so the line is the one the walk found cut.
  expect(ours?.words).toContain('1 个受阻')
  expect(ours?.ellipsis).toBe(false)
  expect(ours!.scrollWidth).toBeLessThanOrEqual(ours!.clientWidth + 1)
})

// The pictures for the report, at four widths, in both themes and both languages, when asked for.
it.skipIf(!process.env['MODULES_ROW_SHOTS'])('photographs the modules list', async () => {
  const shots = process.env['MODULES_ROW_SHOTS'] as string
  mkdirSync(shots, { recursive: true })
  for (const lang of ['zh', 'en'] as const) {
    for (const width of [1440, 990, 660, 390]) {
      for (const theme of ['light', 'dark'] as const) {
        await app.page.setViewportSize({ width, height: 900 })
        await app.page.evaluate((look) => localStorage.setItem('mole-office.preset.theme', look), theme)
        await app.page.goto(`${app.site}/?lang=${lang}#/modules`)
        await app.page.reload({ timeout: 60_000 })
        await waitForThePage(app.page, 60_000)
        await app.page.locator('main.page .flst-row').first().waitFor({ timeout: 30_000 })
        await app.page.waitForTimeout(300)
        await app.page.screenshot({ path: `${shots}/modules-${lang}-${String(width)}-${theme}.png`, fullPage: true })
      }
    }
  }
}, 300_000)
