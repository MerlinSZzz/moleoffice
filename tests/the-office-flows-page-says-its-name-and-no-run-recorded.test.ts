// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE OFFICE FLOWS PAGE SAYS ITS NAME, AND A FLOW WITH NO RECORDED RUN SAYS "No run recorded". In a real browser, on
 * this test's own office, the words are read as the person sees them, in English and in Chinese:
 *
 * 1. THE LIST, IN ENGLISH. The title, the new press, the count line, the column head, the top bar and the entry on All
 *    pages with its hint say Office flows or Office flow. No word "flow" on the list stands without "office" before it.
 *    Each flow with no run says No run recorded in its row.
 * 2. ONE FLOW, IN ENGLISH. The back link says All office flows. The line under the title and the latest runs say No run
 *    recorded.
 * 3. THE LIST AND ONE FLOW, IN CHINESE. The same places say 办公流程, and a flow with no run says 没有运行记录.
 *
 * In every case the words "never run" and 从未运行 appear nowhere in the window.
 *
 * The words are written here as the person reads them, not read from the word lists, so a change of the words is a
 * change of this test.
 *
 * THE OFFICE IS THIS TEST'S OWN. `liveApp` starts its own API and database. Every flow here is made up.
 */
import { afterAll, beforeAll, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { deleteTheCopiedDefaultFlows, liveApp, waitForThePage, type LiveApp } from './helpers.ts'

let app: LiveApp

const PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

async function send(url: string, body: object): Promise<Record<string, any>> {
  const reply = await fetch(app.api + url, { method: 'POST', headers: PERSON, body: JSON.stringify(body) })
  const text = await reply.text()
  expect(reply.status, `POST ${url}: ${text}`).toBeLessThan(300)
  return JSON.parse(text) as Record<string, any>
}

let source = ''
/** A made-up flow that nobody has run. None of its own words says "flow", so every such word on the page is the page's. */
const aFlow = async (title: string, appliesTo: Record<string, unknown>): Promise<string> =>
  (
    await send('/api/records', {
      kind: 'flow',
      title,
      data: {
        declared_in: 'tools/test-pottery.mjs',
        runs: 'the test potter',
        trigger: `A test order for ${title}.`,
        leaves_behind: 'a test pot',
        applies_to: appliesTo,
        stages: [1, 2].map((n) => ({ n, does: `Test stage ${n}.`, evidence: 'A test note.', why: `Test why ${n}.`, sources: [source] })),
      },
    })
  )['record'].id as string

let own = ''

async function open(language: 'en' | 'zh', route: string, waitFor: string): Promise<void> {
  await app.page.setViewportSize({ width: 1440, height: 1000 })
  await app.page.goto('about:blank')
  await app.page.goto(`${app.site}/?lang=${language}#${route}`)
  await waitForThePage(app.page, 60_000)
  await app.page.locator(waitFor).first().waitFor({ timeout: 30_000 })
}

const text = async (selector: string): Promise<string> => ((await app.page.locator(selector).first().textContent()) ?? '').trim()
/** The latest runs of one flow. The Handbooks section above it draws a line in the same style, so the section is named. */
const THE_RUNS = '[data-target="uiSurface/flows.runs"] .flw-says'
const windowText = (): Promise<string> => app.page.evaluate(() => document.body.innerText)

beforeAll(async () => {
  app = await liveApp({ name: 'office-flows-words', viewport: { width: 1440, height: 1000 }, workspace: 'default' })
  await deleteTheCopiedDefaultFlows(app.api)
  await app.context.addInitScript(() => {
    localStorage.setItem('mole-office.preset.theme', 'light')
  })
  source = (await send('/api/records', { kind: 'report', title: 'Test: how a pot is thrown', data: { for: 'The owner', date: '2026-11-22', blocks: [{ id: 'b-1', type: 'text', text: 'Made up.' }] } }))['record'].id as string
  await aFlow('Test: answering a customer', { scope: 'general', roles: ['secretary'] })
  own = await aFlow('Test: firing the kiln', { scope: 'special', roles: ['supervisor'], project: 'default' })
}, 240_000)

afterAll(async () => {
  await app?.stop()
})

it('1. the list in English says Office flows and Office flow, and No run recorded for a flow with no run', async () => {
  await open('en', '/flows', '.flw-group[data-group="general"] .flw-row')
  expect(await text('.flw-title')).toBe('Office flows')
  expect(await text('.flw-head-press')).toBe('+ New office flow')
  expect(await text('.flw-count > span:first-child')).toBe('2 office flows')
  expect(await text('.flw-count [data-counts="runs-naming-no-flow"]')).toMatch(/^\d+ runs? named no office flow$/)
  expect(await text('.flw-group[data-group="general"] .flw-colhead > span:first-child')).toBe('Office flow')
  expect(await text('.shell-bar-page')).toBe('Office flows')
  const rows = app.page.locator('.flw-row')
  expect(await rows.count()).toBe(2)
  for (const row of await rows.all()) expect(((await row.locator('.flw-row-fact').last().textContent()) ?? '').trim()).toBe('No run recorded')
  // Take away each "office flow" and "office flows": no "flow" or "flows" is left in the list's own words.
  const list = await app.page.locator('#main .flw').first().innerText()
  expect(list.replace(/office flows?/gi, '')).not.toMatch(/\bflows?\b/i)
  expect(await windowText()).not.toMatch(/never run/i)

  await app.page.evaluate(() => { location.hash = '#/all-pages' })
  const entry = app.page.locator('#main a[data-target="uiSurface/rail.flows"]')
  await entry.waitFor({ timeout: 30_000 })
  expect(((await entry.locator(':scope > span:first-of-type').textContent()) ?? '').trim()).toBe('Office flows')
  expect(await entry.getAttribute('title')).toBe("Office flows of every project: each one's trigger, runner, stages and runs.")
}, 120_000)

it('2. one flow in English links back to All office flows, and says No run recorded under its title and in its runs', async () => {
  await open('en', `/flows/${own}`, '.flw-stage')
  expect(await text('.flw-back')).toBe('← All office flows')
  expect(await text('.flw-where')).toContain('No run recorded')
  expect(await text(THE_RUNS)).toBe('No run recorded')
  expect(await windowText()).not.toMatch(/never run/i)
}, 120_000)

it('3. the list and one flow in Chinese say 办公流程, and 没有运行记录 for a flow with no run', async () => {
  await open('zh', '/flows', '.flw-group[data-group="general"] .flw-row')
  expect(await text('.flw-title')).toBe('办公流程')
  expect(await text('.flw-count > span:first-child')).toBe('2 个办公流程')
  expect(await text('.flw-group[data-group="general"] .flw-colhead > span:first-child')).toBe('办公流程')
  expect(await text('.shell-bar-page')).toBe('办公流程')
  const rows = app.page.locator('.flw-row')
  expect(await rows.count()).toBe(2)
  for (const row of await rows.all()) expect(((await row.locator('.flw-row-fact').last().textContent()) ?? '').trim()).toBe('没有运行记录')
  expect(await windowText()).not.toContain('从未运行')

  await open('zh', `/flows/${own}`, '.flw-stage')
  expect(await text('.flw-back')).toBe('← 全部办公流程')
  expect(await text('.flw-where')).toContain('没有运行记录')
  expect(await text(THE_RUNS)).toBe('没有运行记录')
  expect(await windowText()).not.toContain('从未运行')
}, 120_000)
