// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE FAMILY LISTS SHARE ONE DESIGN: Findings, Ideas, Shelved, Modules and Pipelines, in a real browser.
 *
 * The owner took wave 13k's proposal for these five pages as recommended, from block b-17 of report
 * n9Mjk3c_sJRu. It gives the same head on each; Needs you only where the page can hold it; then
 * one plain list per state; a row is a title and one second line, with the state word and a date or a small progress
 * bar at its right; each page ends with one closed fold on how it is ordered; "Made-up example" is said once beside the
 * heading when every row carries it (question 5). And page by page: Findings' depth box is a word and six small marks;
 * Ideas has one primary press; Shelved rows show "Restart when…", the date and a Restore press; Pipelines' Needs you
 * lists steps waiting for a person, each row says "Now at step N", and the drawing is a card with a small picture;
 * Modules show how many items are checked, with a small bar. Question 18: a blocked step is not shown first, as
 * something for the owner, until the record says who it waits on.
 *
 * This opens each page from `liveApp` (a real server on a temporary database, the built page) and
 * reads what it draws. Records are filed through the API as the person; the made-up case marks the
 * records' origin on the way back to the page, as tests/family-list-columns-hold-at-660.test.ts does.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Page } from 'playwright'
import { deleteTheCopiedDefaultChapters, liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

let app: LiveApp
let page: Page
const headers = { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }

async function call<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const reply = await fetch(`${app.api}${path}`, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
  const text = await reply.text()
  if (!reply.ok) throw new Error(`${method} ${path} answered ${reply.status}: ${text}`)
  return JSON.parse(text) as T
}
async function file(kind: string, title: string, data: Record<string, unknown>, summary?: string): Promise<string> {
  const made = await call<{ record: { id: string } }>('/api/records', 'POST', { kind, title, data, ...(summary === undefined ? {} : { summary }) })
  return made.record.id
}

const RESTART = 'the second bench arrives'

beforeAll(async () => {
  app = await liveApp({ name: 'family-lists-design', workspace: 'default', viewport: { width: 1440, height: 1000 } })
  // The default chapters a fresh office copies at its first start (wave 13s round 7) are module records
  // this test did not file, and it counts or draws modules, so it deletes them first.
  await deleteTheCopiedDefaultChapters(app.api)
  page = app.page
  await file('claim', 'The slower fan keeps the seed tray cooler', { state: 'measured', method: 'a thermometer' })
  await file('claim', 'The quiet room holds its temperature overnight', { state: 'proposed' })
  await file('direction', 'Whether the quiet room needs a second fan', { depth: 'ran', depth_reason: 'one night run' })
  await file('idea', 'Weigh the pots before and after watering', { state: 'new', would_need: ['a scale that reads grams'] })
  await file('idea', 'A holding-force model instead of a table', { state: 'parked', parked_because: 'three prints are not enough data' })
  await file('module', 'Seed tray cooling', {
    context: 'the fan and the tray',
    paths: [],
    parts: [{ id: 'part-1', name: 'Fan', items: [{ id: 'i1', text: 'mount it', state: 'done' }, { id: 'i2', text: 'wire it', state: 'todo' }] }],
  })
  const shelved = await file('direction', 'A line of work that was stopped and kept', { depth: 'read', depth_reason: 'read the paper' })
  await call(`/api/records/${shelved}`, 'PATCH', { dataPatch: { shelved: { since: '2026-09-15', because: 'the bench went back', restart_when: RESTART } } })
  const pipeline = await file('pipeline', 'Transplant check', { blockIds: [] })
  await call(`/api/records/${pipeline}/blocks`, 'POST', { name: 'Reach the pot', state: 'done' })
  await call(`/api/records/${pipeline}/blocks`, 'POST', { name: 'Close the clamp', state: 'failed' })
  await call(`/api/records/${pipeline}/blocks`, 'POST', { name: 'Lift it out', state: 'todo' })
  const waiting = await file('pipeline', 'Calibration sweep', { blockIds: [] })
  await call(`/api/records/${waiting}/blocks`, 'POST', { name: 'Wait for the gauge', state: 'blocked' })
}, 300_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

async function open(address: string, width = 1440): Promise<void> {
  await page.setViewportSize({ width, height: 1000 })
  await page.goto('about:blank')
  await page.goto(`${app.site}/?lang=en#/${address}`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.locator('main.page .flst').first().waitFor({ timeout: 30_000 })
}

/** What every family list page draws: the same head, one primary press at most, lists, one closed order fold. */
async function theSharedShape(title: string): Promise<{ groups: string[]; needsYou: number; nothingNeedsYou: number }> {
  expect(await page.locator('main.page h1.fam-title').innerText()).toBe(title)
  expect(await page.locator('main.page .fam-act .px-btn[data-variant="primary"]').count(), `${title} has more than one primary press`).toBeLessThanOrEqual(1)
  const folds = page.locator('main.page details.flst-order')
  expect(await folds.count(), `${title} does not end with one fold on its order`).toBe(1)
  expect(await folds.evaluate((one) => (one as HTMLDetailsElement).open), `${title}'s order fold is open`).toBe(false)
  expect(await page.locator('main.page .flst-row details').count(), `${title} folds something on a row`).toBe(0)
  return {
    groups: await page.locator('main.page .flst-group').evaluateAll((all) => all.map((one) => one.getAttribute('data-group') ?? '')),
    needsYou: await page.locator('main.page .flst-group[data-group="needs-you"]').count(),
    nothingNeedsYou: await page.locator('main.page .flst-quiet[data-group="needs-you"]').count(),
  }
}

describe('each family page draws the shared design, and its own change', () => {
  it('Findings: two lists, no Needs you, and a direction’s depth as a word and six marks', async () => {
    await open('findings')
    const shape = await theSharedShape('Findings')
    expect(shape.groups).toEqual(['explored', 'measured'])
    expect(shape.needsYou + shape.nothingNeedsYou, 'Findings holds nothing that waits on a person').toBe(0)
    const depth = page.locator('.flst-group[data-group="explored"] .flst-row', { hasText: 'second fan' }).locator('.flst-state .fnd-depth')
    expect(await depth.locator('.fnd-depth-word').innerText()).toBe('ran')
    expect(await depth.locator('.fnd-depth-mark').count()).toBe(6)
    expect(await depth.locator('.fnd-depth-mark[data-on="1"]').count()).toBe(3)
    // A claim's state word and its date sit at the right, and the press says "Record a finding".
    const claim = page.locator('.flst-group[data-group="measured"] .flst-row', { hasText: 'quiet room holds' })
    expect(await claim.locator('.flst-state').innerText()).toContain('not measured')
    expect(await claim.locator('.flst-when time').count()).toBe(1)
    expect(await page.locator('.fam-act').innerText()).toContain('Record a finding')
  }, 120_000)

  it('Ideas: one primary press, "Add an idea", and each list’s rows say why and when', async () => {
    await open('ideas')
    const shape = await theSharedShape('Ideas')
    expect(shape.groups).toEqual(['live', 'parked'])
    expect(shape.needsYou + shape.nothingNeedsYou).toBe(0)
    expect(await page.locator('main.page .fam-act .px-btn').count(), 'Ideas has a second press').toBe(1)
    expect(await page.locator('main.page .fam-act .px-btn').innerText()).toBe('Add an idea')
    const parked = page.locator('.flst-group[data-group="parked"] .flst-row').first()
    expect(await parked.locator('.flst-text').innerText()).toContain('three prints are not enough data')
    expect(await parked.locator('.flst-state .px-chip-stored').count()).toBe(1)
    expect(await parked.locator('.flst-when time').count()).toBe(1)
  }, 120_000)

  it('Shelved: one list, and a row shows "Restart when…", the date and a Restore press', async () => {
    await open('shelved')
    const shape = await theSharedShape('Shelved')
    expect(shape.groups).toEqual(['shelf'])
    expect(shape.needsYou + shape.nothingNeedsYou).toBe(0)
    const row = page.locator('.flst-group[data-group="shelf"] .flst-row')
    expect(await row.count()).toBe(1)
    expect(await row.locator('.flst-text').innerText()).toContain(`Would restart when: ${RESTART}`)
    expect(await row.locator('.flst-state time').getAttribute('datetime')).toBe('2026-09-15')
    expect(await row.locator('.flst-press button').innerText()).toBe('Restore to open')
  }, 120_000)

  it('Modules: how many items are checked, and a small bar', async () => {
    await open('modules')
    const shape = await theSharedShape('Modules')
    expect(shape.groups).toEqual(['unsaid'])
    expect(shape.needsYou + shape.nothingNeedsYou).toBe(0)
    const row = page.locator('main.page .flst-row', { hasText: 'Seed tray cooling' })
    expect(await row.locator('.flst-state').innerText()).toBe('1 of 2 checked')
    const fill = await row.locator('.flst-when .flst-bar-fill').evaluate((one) => (one as HTMLElement).style.width)
    expect(fill).toBe('50%')
  }, 120_000)

  it('Pipelines: Needs you lists the failed step and not the blocked one, the drawing is a card, and a row says "Now at step N"', async () => {
    await open('pipeline')
    const shape = await theSharedShape('Pipelines')
    expect(shape.needsYou, 'Pipelines lists no step waiting for a person').toBe(1)
    expect(shape.groups[0]).toBe('needs-you')
    const needs = page.locator('.flst-group[data-group="needs-you"]')
    expect(await needs.innerText()).toContain('Close the clamp')
    // QUESTION 18: the blocked step waits on somebody no record names, so it is not shown here.
    expect(await needs.innerText()).not.toContain('Wait for the gauge')
    // The drawing is a card with a small picture, and it opens the drawing of every module.
    const card = page.locator('main.page a.ppl-card')
    expect(await card.getAttribute('href')).toBe('#/pipeline/drawing')
    expect(await card.locator('.ppl-card-title').innerText()).toBe('The project drawing')
    // One list per state: the pipeline standing on a failed step, and the one standing on a blocked step.
    expect(shape.groups).toContain('failed')
    expect(shape.groups).toContain('blocked')
    const row = page.locator('.flst-group[data-group="failed"] .flst-row', { hasText: 'Transplant check' })
    expect(await row.locator('.flst-text').innerText()).toBe('Now at step 2 of 3: Close the clamp')
    expect(await row.locator('.flst-when .flst-bar-count').innerText()).toBe('1/3')
    expect(await row.locator('a.flst-open').getAttribute('href')).toMatch(/^#\/pipeline\/[A-Za-z0-9_-]{12}$/)
  }, 120_000)
})

describe('the facts sit beside the title at 1440 and under it on a phone', () => {
  it('puts the state column to the right of the title on a wide screen, and below it at 390', async () => {
    for (const [width, beside] of [[1440, true], [390, false]] as const) {
      await open('modules', width)
      const row = page.locator('main.page .flst-row', { hasText: 'Seed tray cooling' })
      const title = await row.locator('.flst-open').boundingBox()
      const state = await row.locator('.flst-state').boundingBox()
      expect(title !== null && state !== null).toBe(true)
      if (beside) expect(state!.x, 'the facts are not beside the title at 1440').toBeGreaterThanOrEqual(title!.x + title!.width)
      else expect(state!.y, 'the facts are not under the title at 390').toBeGreaterThanOrEqual(title!.y + title!.height - 1)
    }
  }, 120_000)
})

describe('"Made-up example" is said once beside the heading when every row carries it', () => {
  it('draws the mark once per list, beside its heading, and on no row', async () => {
    await page.route('**/api/records**', async (route) => {
      const response = await route.fetch()
      const body = await response.json()
      if (Array.isArray(body.records)) for (const record of body.records) record.origin = 'fixture'
      await route.fulfill({ response, json: body })
    })
    try {
      for (const address of ['findings', 'ideas', 'modules', 'shelved', 'pipeline']) {
        await open(address)
        const groups = await page.locator('main.page .flst-group').count()
        expect(groups, `${address} drew no list`).toBeGreaterThan(0)
        expect(await page.locator('main.page .flst-head [data-origin="fixture"]').count(), `${address} does not say it once per list`).toBe(groups)
        expect(await page.locator('main.page .flst-row [data-origin="fixture"]').count(), `${address} says it on a row as well`).toBe(0)
      }
    } finally {
      await page.unroute('**/api/records**')
    }
  }, 180_000)
})
