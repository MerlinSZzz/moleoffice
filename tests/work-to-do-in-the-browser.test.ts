// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WORK TO DO, OPENED IN A BROWSER: THE SWITCH AND THE FOLD.
 *
 * Report n9Mjk3c_sJRu block b-13 designed the page again,
 * and problem IfJ_JmeZ-3vr found its title and its sidebar row saying two things in Chinese. This
 * file opens #/work on a real stack with made-up work in two made-up projects, and checks what only
 * a browser can show:
 *   - the switch in All work changes By level into One list, a table, and back;
 *   - a parent's press folds its parts away and opens them again.
 *
 * PHOTOGRAPHS at 1440, 990, 660 and 390, light and dark, and at 1440 in Chinese and in the test
 * language, when WORK_PAGE_SHOTS names a folder. Nothing is written anywhere else.
 */

import { mkdirSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { en } from '../src/shared/words/en.ts'

let app: LiveApp

const asThePerson = (project: string) => ({
  'content-type': 'application/json',
  'x-mole-office-workspace': project,
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
})

async function post(project: string, path: string, body: unknown): Promise<Record<string, any>> {
  const reply = await fetch(`${app.api}${path}`, { method: 'POST', headers: asThePerson(project), body: JSON.stringify(body) })
  const text = await reply.text()
  expect(reply.status, `${path}: ${text.slice(0, 400)}`).toBeLessThan(300)
  return JSON.parse(text) as Record<string, any>
}

async function made(project: string, kind: string, title: string, data: Record<string, unknown>): Promise<string> {
  return String((await post(project, '/api/records', { kind, title, data }))['record'].id)
}

async function partOf(project: string, child: string, whole: string): Promise<void> {
  await post(project, '/api/links', { fromId: child, toId: whole, type: 'part_of' })
}

async function open(query = ''): Promise<void> {
  // A NEW PAGE EVERY TIME. Going to the same address changes only the hash, which keeps the view
  // and the folds the last test left, so the page is left first.
  await app.page.goto('about:blank')
  await app.page.goto(`${app.site}/${query}#/work`, { timeout: 60_000 })
  await waitForThePage(app.page, 60_000)
  await app.page.locator('.fam-title').first().waitFor({ state: 'visible', timeout: 30_000 })
  await app.page.getByText('Order more mulch').first().waitFor({ state: 'visible', timeout: 30_000 })
}

beforeAll(async () => {
  app = await liveApp({ name: 'work-to-do', viewport: { width: 1440, height: 1000 }, workspace: 'orchard' })
  for (const [id, title] of [['orchard', 'Hillside orchard'], ['bakery', 'Riverside bakery']] as const) {
    await post(id, '/api/workspaces', { id, title })
  }
  // THE ORCHARD: a module holding two tasks, a pipeline holding two blocks with a task under one of
  // them (two levels below the pipeline), a task under nothing, a line of exploration, a problem,
  // and three obligations: one past its date, one kept after its date, and one still to come.
  const irrigation = await made('orchard', 'module', 'Irrigation', { state: 'active' })
  await partOf('orchard', await made('orchard', 'task', 'Lay the drip line', { state: 'doing' }), irrigation)
  await partOf('orchard', await made('orchard', 'task', 'Test the valve timer', { state: 'todo' }), irrigation)
  const spring = String((await post('orchard', '/api/records', { kind: 'pipeline', title: 'Spring planting', data: { blockIds: [] } }))['record'].id)
  await post('orchard', `/api/records/${spring}/blocks`, { name: 'Dig the beds', state: 'done' })
  const saplings = String((await post('orchard', `/api/records/${spring}/blocks`, { name: 'Plant the saplings', state: 'doing' }))['record'].id)
  await partOf('orchard', await made('orchard', 'task', 'Label every row of saplings', { state: 'todo' }), saplings)
  await made('orchard', 'task', 'Order more mulch', { state: 'todo' })
  await made('orchard', 'direction', 'Try a cover crop between the rows', { depth: 'read' })
  await made('orchard', 'problem', 'The pump loses pressure at night', { state: 'open' })
  await made('orchard', 'obligation', 'Return the borrowed tiller', { state: 'open', due: { date: '2026-01-10' }, owedTo: 'the neighbour' })
  await made('orchard', 'obligation', 'Send the soil samples', { state: 'fulfilled', due: { date: '2026-02-01' }, owedTo: 'the county lab' })
  await made('orchard', 'obligation', 'Pay the water bill', { state: 'open', due: { date: '2099-03-01' }, owedTo: 'the water board' })
  // THE BAKERY: a second project, with one thing past its date.
  await made('bakery', 'task', 'Clean the proofing cabinet', { state: 'todo' })
  await made('bakery', 'obligation', 'Renew the food licence', { state: 'open', due: { date: '2026-03-15' }, owedTo: 'the council' })
  await made('bakery', 'purchase', 'A second dough mixer', { state: 'wanted' })
  await app.page.addInitScript(() => {
    if (localStorage.getItem('mole-office.preset.theme') === null) localStorage.setItem('mole-office.preset.theme', 'light')
  })
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

describe('photographs', () => {
  it.skipIf(!process.env['WORK_PAGE_SHOTS'])('photographs Work to do', async () => {
    const shots = process.env['WORK_PAGE_SHOTS'] as string
    mkdirSync(shots, { recursive: true })
    const take = async (name: string, width: number, theme: 'light' | 'dark', query = '', table = false) => {
      await app.page.setViewportSize({ width, height: 1000 })
      await open(query)
      await app.page.evaluate((look) => localStorage.setItem('mole-office.preset.theme', look), theme)
      await app.page.reload({ timeout: 60_000 })
      await waitForThePage(app.page, 60_000)
      await app.page.getByText('Order more mulch').first().waitFor({ state: 'visible', timeout: 30_000 })
      if (table) {
        await app.page.locator('.wk-seg button', { hasText: en['workPage.oneList'] }).click()
        await app.page.locator('table.wk-table').waitFor({ state: 'visible', timeout: 30_000 })
      }
      await app.page.screenshot({ path: `${shots}/${name}.png`, fullPage: true })
    }
    for (const width of [1440, 990, 660, 390]) {
      for (const theme of ['light', 'dark'] as const) await take(`work-${String(width)}-${theme}`, width, theme)
    }
    await take('work-1440-zh', 1440, 'light', '?lang=zh')
    await take('work-1440-xx', 1440, 'light', '?lang=xx')
    // ONE LIST, the table, at the widest and the narrowest width.
    for (const width of [1440, 390]) {
      for (const theme of ['light', 'dark'] as const) await take(`work-table-${String(width)}-${theme}`, width, theme, '', true)
    }
    await app.page.setViewportSize({ width: 1440, height: 1000 })
    await app.page.evaluate(() => localStorage.setItem('mole-office.preset.theme', 'light'))
  }, 900_000)
})

describe('Work to do in the browser', () => {
  it('turns By level into One list, a table, and back, with the switch', async () => {
    await app.page.setViewportSize({ width: 1440, height: 1000 })
    await open()
    const all = app.page.locator('[data-section="all-work"]')
    const switchTo = (label: string) => all.locator('.wk-seg button', { hasText: label })
    expect(await all.locator('.wk-group').count(), 'By level is not grouped by project').toBe(2)
    expect(await all.locator('table').count()).toBe(0)
    await switchTo(en['workPage.oneList']).click()
    await all.locator('table.wk-table').waitFor({ state: 'visible', timeout: 30_000 })
    expect(await switchTo(en['workPage.oneList']).getAttribute('aria-pressed')).toBe('true')
    expect(await all.locator('.wk-group').count(), 'the groups are still drawn beside the table').toBe(0)
    // ONE ROW PER PIECE OF WORK, with its project in a column of its own.
    expect(await all.locator('table.wk-table tbody tr').count()).toBe(14)
    expect(await all.locator('table.wk-table thead th', { hasText: en['g7a.work.project'] }).count()).toBe(1)
    await switchTo(en['g7a.work.levels']).click()
    await all.locator('.wk-group').first().waitFor({ state: 'visible', timeout: 30_000 })
    expect(await all.locator('table').count()).toBe(0)
  }, 180_000)

  it('folds a parent\'s parts away with its press, and opens them again', async () => {
    await app.page.setViewportSize({ width: 1440, height: 1000 })
    await open()
    const all = app.page.locator('[data-section="all-work"]')
    const part = all.getByText('Lay the drip line')
    const parent = all.locator('.wk-level', { hasText: 'Irrigation' })
    const press = parent.locator('button.wk-toggle')
    await part.waitFor({ state: 'visible', timeout: 30_000 })
    expect(await press.getAttribute('aria-expanded')).toBe('true')
    await press.click()
    await part.waitFor({ state: 'detached', timeout: 30_000 })
    expect(await press.getAttribute('aria-expanded')).toBe('false')
    // Only that parent's parts: the other groups are untouched.
    expect(await all.getByText('Label every row of saplings').count()).toBe(1)
    await press.click()
    await part.waitFor({ state: 'visible', timeout: 30_000 })
  }, 180_000)
})
