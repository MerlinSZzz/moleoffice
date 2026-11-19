// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE FLOWS PAGE DRAWS THE CURRENT FLOWS FIRST, THE GENERAL ONES AS GENERAL, AND THE REPLACED ONES FOLDED. Wave 13p
 * round 40: the flows page showed 50 flows with no reason given, and the general ones were to be grouped as
 * general. In a real browser, on this test's own office:
 *
 * 1. THE LIST STANDS THE GENERAL FLOWS UNDER "General", THEN EACH PROJECT'S OWN, AND FOLDS THE REPLACED ONES. Nothing of
 *    a replaced flow is drawn until one press opens them; then each says what replaced it, as a link to that flow, and
 *    the press closes them again. The heading line counts the current flows and the replaced ones.
 * 2. ONE FLOW SAYS WHOM IT IS FOR: its roles, its rung, and general or special to a project.
 *
 * The checks are made in the light theme in English. The screens are not photographed: the pictures were
 * taken at widths and in a theme nothing checked.
 *
 * THE OFFICE IS THIS TEST'S OWN. `liveApp` starts its own API and database. Every flow here is made up.
 */
import { afterAll, beforeAll, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'

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

let general = ''
let own = ''

async function open(route: string, look: string): Promise<void> {
  await app.page.setViewportSize({ width: 1440, height: 1000 })
  await app.page.goto('about:blank')
  await app.page.goto(`${app.site}/?lang=en&look=${look}#${route}`)
  await waitForThePage(app.page, 60_000)
}

beforeAll(async () => {
  app = await liveApp({ name: 'flows-fold-and-general', viewport: { width: 1440, height: 1000 }, workspace: 'default' })
  await app.context.addInitScript(() => {
    localStorage.setItem('mole-office.preset.theme', new URLSearchParams(location.search).get('look') ?? 'light')
  })
  source = (await send('/api/records', { kind: 'report', title: 'Test: how a pot is thrown', data: { for: 'The owner', date: '2026-10-11', blocks: [{ id: 'b-1', type: 'text', text: 'Made up.' }] } }))['record'].id as string
  general = await aFlow('Test: answering a customer', { applies_to: { scope: 'general', roles: ['secretary', 'inspector'], rung: 1 } })
  own = await aFlow('Test: firing the kiln', { applies_to: { scope: 'special', roles: ['supervisor'], project: 'default' } })
  const oldAnswer = await aFlow('Test: the old way to answer')
  const oldFiring = await aFlow('Test: the old way to fire')
  await send('/api/links', { fromId: general, toId: oldAnswer, type: 'supersedes' })
  await send('/api/links', { fromId: own, toId: oldFiring, type: 'supersedes' })
}, 240_000)

afterAll(async () => {
  await app?.stop()
})

it('1. stands the general flows under General, then each project\'s own, and folds the replaced ones until one press', async () => {
  // ONE THEME. The checks do not change with the colour scheme.
  for (const look of ['light']) {
    await open('/flows', look)
    const page = app.page
    await page.locator('.flw-group[data-group="general"]').waitFor({ timeout: 30_000 })
    expect(await page.locator('.flw-group[data-group="general"] h2').textContent()).toBe('General')
    expect(await page.locator('.flw-group[data-group="general"] .flw-row-title').allTextContents()).toEqual(['Test: answering a customer'])
    expect(await page.locator('.flw-group[data-group="own"] .flw-row-title').allTextContents()).toEqual(['Test: firing the kiln'])
    expect(await page.locator('.flw-count').textContent()).toContain('2 flows · 2 replaced')
    const press = page.getByRole('button', { name: 'Show the 2 replaced flows', exact: true })
    expect(await press.getAttribute('aria-expanded')).toBe('false')
    expect(await page.getByText('Test: the old way to answer').count(), 'a replaced flow is drawn before the press').toBe(0)

    await open('/flows', look)
    await page.getByRole('button', { name: 'Show the 2 replaced flows', exact: true }).click()
    const replaced = page.locator('.flw-group[data-group="replaced"] .flw-replaced-row')
    await replaced.first().waitFor({ timeout: 30_000 })
    expect(await replaced.locator('.flw-row-title').allTextContents()).toEqual(['Test: the old way to answer', 'Test: the old way to fire'])
    const by = replaced.first().locator('.flw-replaced-by a')
    expect(await replaced.first().locator('.flw-replaced-by').textContent()).toContain('Replaced by')
    expect(await by.textContent()).toBe('Test: answering a customer')
    expect(await by.getAttribute('href')).toContain(general)
    expect(await page.getByRole('button', { name: 'Hide the replaced flows', exact: true }).getAttribute('aria-expanded')).toBe('true')
    await page.getByRole('button', { name: 'Hide the replaced flows', exact: true }).click()
    expect(await page.getByText('Test: the old way to answer').count(), 'the press folds them again').toBe(0)
  }
}, 600_000)

it('2. one flow says whom it is for', async () => {
  for (const look of ['light']) {
    await open(`/flows/${general}`, look)
    const fact = app.page.locator('.flw-fact[data-fact="for"] dd')
    await fact.waitFor({ timeout: 30_000 })
    expect(await fact.textContent()).toBe('General · secretary, inspector · rung 1 and up')
    await open(`/flows/${own}`, look)
    const special = app.page.locator('.flw-fact[data-fact="for"] dd')
    await special.waitFor({ timeout: 30_000 })
    expect(await special.textContent()).toMatch(/^Special to .+ · supervisor$/)
  }
}, 300_000)
