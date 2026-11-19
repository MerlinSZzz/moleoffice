// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE FLOWS PAGE FOLDS A RETIRED FLOW WITH THE REPLACED ONES AND SAYS WHY IT WAS RETIRED. Wave 13p round 40b, after
 * check 16F5fvosL6x5 refused round 40 on its counts. In a real browser, on this test's own office:
 *
 * 1. THE HEADING LINE COUNTS THE REPLACED AND THE RETIRED APART, and the press names both. Nothing of a retired flow is
 *    drawn until the press opens the fold; then it shows "Retired:" and its why, what took its place as a link to that
 *    record, and the day and who retired it. It shows no "Replaced by", because no flow replaced it. A replaced flow
 *    beside it still says what replaced it.
 *
 * The screen is photographed at 1440 and 390 in the light theme, in English (testShots).
 *
 * THE OFFICE IS THIS TEST'S OWN. `liveApp` starts its own API and database. Every flow here is made up.
 */
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { Locator } from 'playwright'
import { THE_PERSON } from '../src/shared/person.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { createI18n } from '../src/shared/i18n.ts'
import { testShots } from './where-shots-go.ts'

let app: LiveApp
const en = createI18n('en')
const shots = testShots('the-flows-page-shows-a-retired-flow')

const PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

async function send(url: string, body: object, method = 'POST'): Promise<Record<string, any>> {
  const reply = await fetch(app.api + url, { method, headers: PERSON, body: JSON.stringify(body) })
  const text = await reply.text()
  expect(reply.status, `${method} ${url}: ${text}`).toBeLessThan(300)
  return JSON.parse(text) as Record<string, any>
}

let source = ''
const aFlow = async (title: string, extra: Record<string, unknown> = {}): Promise<string> =>
  (
    await send('/api/records', {
      kind: 'flow',
      title,
      data: {
        declared_in: 'tools/test-pottery.mjs',
        runs: 'the test potter',
        trigger: `A test order for ${title}.`,
        leaves_behind: 'a test pot',
        stages: [1, 2].map((n) => ({ n, does: `Test stage ${n}.`, evidence: 'A test note.', why: `Test why ${n}.`, sources: [source] })),
        ...extra,
      },
    })
  )['record'].id as string

let line = ''
const WHY = 'Test: minding the kiln key is not a flow. It became one line in the potter’s brief.'

async function open(route: string, look: string): Promise<void> {
  await app.page.setViewportSize({ width: 1440, height: 1000 })
  await app.page.goto('about:blank')
  await app.page.goto(`${app.site}/?lang=en&look=${look}#${route}`)
  await waitForThePage(app.page, 60_000)
}

/** The screen at 1440 and 390, with `on` in the middle of the window. */
async function photograph(name: string, look: string, on: Locator): Promise<void> {
  for (const width of [1440, 390]) {
    await app.page.setViewportSize({ width, height: 1000 })
    await app.page.waitForTimeout(250)
    await on.first().evaluate((el) => el.scrollIntoView({ block: 'center' }))
    await app.page.screenshot({ path: `${shots}/${name}-en-${String(width)}-${look}.png` })
  }
}

beforeAll(async () => {
  app = await liveApp({ name: 'flows-retired', viewport: { width: 1440, height: 1000 }, workspace: 'default' })
  await app.context.addInitScript(() => {
    localStorage.setItem('mole-office.preset.theme', new URLSearchParams(location.search).get('look') ?? 'light')
  })
  source = (await send('/api/records', { kind: 'report', title: 'Test: how a pot is thrown', data: { for: 'The owner', date: '2026-10-11', blocks: [{ id: 'b-1', type: 'text', text: 'Made up.' }] } }))['record'].id as string
  line = (await send('/api/records', { kind: 'report', title: 'Test: the kiln key line', data: { for: 'The owner', date: '2026-10-11', blocks: [{ id: 'b-1', type: 'text', text: 'Made up.' }] } }))['record'].id as string
  const current = await aFlow('Test: firing the kiln')
  const oldFiring = await aFlow('Test: the old way to fire')
  const key = await aFlow('Test: minding the kiln key')
  await send('/api/links', { fromId: current, toId: oldFiring, type: 'supersedes' })
  await send(`/api/records/${key}`, { dataPatch: { retired: { why: WHY, at: '2026-10-11', by: 'a test potter', record: line } } }, 'PATCH')
}, 240_000)

afterAll(async () => {
  await app?.stop()
})

it('1. counts the replaced and the retired apart, and the open fold says why a flow was retired', async () => {
  for (const look of ['light'] as const) {
    await open('/flows', look)
    const page = app.page
    await page.locator('.flw-count').waitFor({ timeout: 30_000 })
    expect(await page.locator('.flw-count').textContent()).toContain('1 flow · 1 replaced · 1 retired')
    const press = page.getByRole('button', { name: 'Show the 2 replaced or retired flows', exact: true })
    expect(await press.getAttribute('aria-expanded')).toBe('false')
    expect(await page.getByText(WHY).count(), 'a retired flow is drawn before the press').toBe(0)

    await press.click()
    const rows = page.locator('.flw-group[data-group="replaced"] .flw-replaced-row')
    await rows.first().waitFor({ timeout: 30_000 })
    expect(await page.locator('.flw-group[data-group="replaced"] .flw-note').textContent()).toBe(en.t('flows.replaced.noteWithRetired'))
    expect(await rows.locator('.flw-row-title').allTextContents()).toEqual(['Test: minding the kiln key', 'Test: the old way to fire'])
    const retired = rows.first()
    expect(await retired.locator('.flw-retired').textContent()).toBe(`Retired: ${WHY} In its place: ${line} · retired on 2026-10-11 by a test potter`)
    expect(await retired.locator('.flw-retired a').getAttribute('href')).toContain(line)
    expect(await retired.locator('.flw-replaced-by').count(), 'no flow replaced it').toBe(0)
    expect(await rows.nth(1).locator('.flw-replaced-by').textContent()).toContain('Replaced by')
    expect(await rows.nth(1).locator('.flw-retired').count()).toBe(0)
    expect(await page.getByRole('button', { name: 'Hide the replaced and retired flows', exact: true }).getAttribute('aria-expanded')).toBe('true')
    await photograph('flows-retired-open', look, page.locator('.flw-group[data-group="replaced"]'))
  }
}, 600_000)
