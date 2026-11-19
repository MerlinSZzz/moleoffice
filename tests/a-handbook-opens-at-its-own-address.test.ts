// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A HANDBOOK OPENS AT ITS OWN ADDRESS, AND A FLOW'S PAGE LISTS ITS HANDBOOKS.
 *
 * The handbook kind (tests/a-handbook-is-a-record.test.ts proves its doors) has a page of its own at
 * `#/handbook/<id>`, src/web/pages/HandbookPage.tsx, and a flow's page gains a Handbooks part.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE MEASURES, in a real browser, in a test office of its own. Every record here is made up.
 * ---------------------------------------------------------------------------------------
 *
 *   1. `#/handbook/<id>` is parsed to the handbook's page and built by `handbookPath`, a record path that knows the
 *      kind is that address, and a third segment is the not-found page.
 *   2. The page draws the title, whom it is for, where it stands, each place it hangs on as a link, and one language's
 *      opening and rest, each marked.
 *   3. The page's own form changes one language's text with a reason. The server takes it, and the versions list then
 *      names both versions, each with its own reason.
 *   4. A flow's page lists the handbook under Handbooks with where it stands, and the step it hangs on counts it.
 *   5. A record of another kind at the address is not drawn as a handbook: the page says so and links to its record.
 *   6. A handbook with no "for" and no text says nobody recorded whom it is for, that it holds no text, and that its
 *      first version holds none, not that the version changed the text with no reason.
 *
 * Every word the page draws is read from the word list in English, so a change of the words does not turn this red.
 *
 * WHY A BROWSER. The page's write has to meet the server's rule for a text change, which only the real door checks,
 * and the address is parsed by the shell itself.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THAT TURN THIS RED, WITH A CONTROL RUN FIRST
 * ---------------------------------------------------------------------------------------
 *
 *   1. addresses.ts, `parseRoute`: leave out the handbook branch → 1 red, and 2, 3 and 5, whose page does not open.
 *   2. HandbookPage.tsx, `TheChange`: send the text without the change record's new entry → 3 red (the server refuses).
 *   3. FlowsPage.tsx, `TheFlow`: leave out `TheHandbooks` → 4 red.
 *   4. HandbookPage.tsx, `HandbookPage`: draw a record of any kind as a handbook → 5 red.
 *   5. HandbookPage.tsx, `whatItDid`: answer a first version with no text as a change with no reason → 6 red.
 *
 * THE WORLD IS ITS OWN. `liveApp` starts an API and Vite on ports of their own, pointed at a database of their own.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { flowsPath, handbookPath, parseRoute, recordPath } from '../src/web/components/router.tsx'
import { createI18n, LANGUAGES } from '../src/shared/i18n.ts'
import { type LiveApp, liveApp, thePersonsKeyHeader, waitForThePage } from './helpers.ts'

let app: LiveApp
let headers: Record<string, string> = {}
let flow = ''
let handbook = ''

const FLOW_TITLE = 'MADE-UP flow with a handbook'
const TITLE = 'MADE-UP handbook of the page test'
const FIRST_WHY = 'MADE-UP: the first text.'
const words = createI18n('en').t

async function file(kind: string, title: string, data: Record<string, unknown>): Promise<string> {
  const made = await fetch(`${app.api}/api/records`, { method: 'POST', headers, body: JSON.stringify({ kind, title, data }) })
  expect(made.status, `filing the ${kind}: ${await made.clone().text()}`).toBe(201)
  return ((await made.json()) as { record: { id: string } }).record.id
}

beforeAll(async () => {
  app = await liveApp({ name: 'handbook-page', viewport: { width: 1440, height: 1000 }, workspace: 'default' })
  headers = {
    'content-type': 'application/json',
    'x-mole-office-workspace': 'default',
    'x-mole-office-actor-type': 'human',
    'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
    ...thePersonsKeyHeader(join(app.dir, 'keys.json')),
  }
  const source = await file('report', 'MADE-UP source of the flow', { blocks: [] })
  const step = (n: number) => ({ n, does: `MADE-UP step ${n}.`, evidence: 'a made-up commit', why: 'Without it the made-up work is not done.', sources: [source] })
  flow = await file('flow', FLOW_TITLE, {
    declared_in: 'a made-up flow of this test',
    runs: 'a made-up worker',
    trigger: 'A made-up piece of work is asked for.',
    stages: [step(1), step(2)],
    leaves_behind: 'a made-up commit',
    governed_by: 'this test file',
    reviewed_at: '2026-11-07',
  })
  handbook = await file('handbook', TITLE, {
    for: 'The made-up agent of this test.',
    state: 'draft',
    text: { en: { opening: 'MADE-UP opening, sent first.', rest: 'MADE-UP rest, read on request.' } },
    hangs_on: [{ flow, step: 2 }],
    text_changes: [{ languages: ['en'], why: FIRST_WHY }],
  })
}, 300_000)

afterAll(async () => {
  await app?.stop()
}, 120_000)

describe('a handbook at #/handbook/<id>', () => {
  it('1. is parsed to its own page and built by handbookPath, and a third segment is not found', () => {
    expect(handbookPath('abc')).toBe('/handbook/abc')
    expect(recordPath('abc', 'handbook')).toBe('/handbook/abc')
    expect(parseRoute('#/handbook/abc')).toEqual({ name: 'handbook', id: 'abc' })
    expect(parseRoute('#/handbook/abc/more')).toEqual({ name: 'unknown', path: '/handbook/abc/more' })
  })

  it('2. draws whom it is for, where it stands, each place as a link, and the opening and the rest', async () => {
    const { page } = app
    await page.goto(`${app.site}/#${handbookPath(handbook)}`, { timeout: 60_000 })
    await waitForThePage(page, 60_000)
    await page.locator('h1.hbk-title').waitFor({ timeout: 30_000 })
    expect(await page.locator('h1.hbk-title').textContent()).toBe(TITLE)
    const facts = (await page.locator('dl.hbk-facts').textContent()) ?? ''
    expect(facts).toContain('The made-up agent of this test.')
    expect(facts).toContain(words('handbookPage.state.draft'))
    const place = page.locator(`dl.hbk-facts a[href="#${flowsPath(flow)}"]`)
    await place.waitFor({ timeout: 30_000 })
    await expect.poll(async () => place.textContent(), { timeout: 30_000 }).toBe(words('handbookPage.place.step', { n: 2, flow: FLOW_TITLE }))
    const text = (await page.locator('.hbk-one').textContent()) ?? ''
    expect(text).toContain(words('handbookPage.opening'))
    expect(text).toContain('MADE-UP opening, sent first.')
    expect(text).toContain(words('handbookPage.rest'))
    expect(text).toContain('MADE-UP rest, read on request.')
  })

  it('3. changes one language’s text with a reason, and lists both versions, each with its own reason', async () => {
    const { page } = app
    await page.goto(`${app.site}/#${handbookPath(handbook)}`, { timeout: 60_000 })
    await waitForThePage(page, 60_000)
    await page.getByRole('button', { name: words('handbookPage.change.open') }).click()
    const boxes = page.locator('form.hbk-change textarea')
    await boxes.first().waitFor({ timeout: 30_000 })
    await boxes.nth(0).fill('MADE-UP opening, changed on the page.')
    await boxes.nth(2).fill('MADE-UP: the page changed it.')
    await page.getByRole('button', { name: words('handbookPage.change.save') }).click()
    const rows = page.locator('ol.hbk-rows > li')
    await expect.poll(async () => rows.count(), { timeout: 30_000 }).toBe(2)
    expect(await rows.nth(0).textContent()).toContain(words('handbookPage.why', { why: 'MADE-UP: the page changed it.' }))
    expect(await rows.nth(1).textContent()).toContain(words('handbookPage.why', { why: FIRST_WHY }))
    const read = await fetch(`${app.api}/api/records/${handbook}`, { headers })
    const data = ((await read.json()) as { record: { data: Record<string, unknown> } }).record.data
    expect(data['text']).toEqual({ en: { opening: 'MADE-UP opening, changed on the page.', rest: 'MADE-UP rest, read on request.' } })
    expect(data['text_changes']).toEqual([
      { languages: ['en'], why: FIRST_WHY },
      { languages: ['en'], why: 'MADE-UP: the page changed it.' },
    ])
  })

  it('4. is listed on its flow’s page under Handbooks, and the step it hangs on counts it', async () => {
    const { page } = app
    await page.goto(`${app.site}/#${flowsPath(flow)}`, { timeout: 60_000 })
    await waitForThePage(page, 60_000)
    const row = page.locator('section.flw-handbooks li.flw-handbook')
    await row.waitFor({ timeout: 30_000 })
    expect(await row.locator(`a[href="#${handbookPath(handbook)}"]`).textContent()).toBe(TITLE)
    expect(await row.textContent()).toContain(words('handbookPage.stateNamed.draft'))
    expect(await row.textContent()).toContain(LANGUAGES.en)
    expect(await row.textContent()).toContain(words('flows.handbooks.onSteps', { n: 1, steps: '2' }))
    const stages = page.locator('.flw-stage')
    expect(await stages.nth(0).locator('.flw-stage-handbooks').count()).toBe(0)
    expect(await stages.nth(1).locator('.flw-stage-handbooks').textContent()).toBe(words('flows.handbooks.onTheStep', { n: 1 }))
  })

  it('5. says a record of another kind is not a handbook, and links to its record', async () => {
    const { page } = app
    await page.goto(`${app.site}/#${handbookPath(flow)}`, { timeout: 60_000 })
    await waitForThePage(page, 60_000)
    const says = page.locator('.hbk-says')
    await says.waitFor({ timeout: 30_000 })
    expect(await says.textContent()).toContain(words('handbookPage.notAHandbook'))
    expect(await says.locator(`a[href="#${recordPath(flow)}"]`).count()).toBe(1)
    expect(await page.locator('h1.hbk-title').count()).toBe(0)
  })

  it('6. says nobody recorded whom it is for, and that a handbook with no text holds none, in its text and in its first version', async () => {
    const { page } = app
    // NO "FOR", NO TEXT AND NO PLACE: each is left out, which the shape takes as an incomplete record. A blank "for" is
    // refused at the door, and tests/a-handbook-is-a-record.test.ts measures the reading of one.
    const empty = await file('handbook', 'MADE-UP handbook with no text', { state: 'draft' })
    await page.goto(`${app.site}/#${handbookPath(empty)}`, { timeout: 60_000 })
    await waitForThePage(page, 60_000)
    await page.locator('h1.hbk-title').waitFor({ timeout: 30_000 })
    expect(await page.locator('dl.hbk-facts .hbk-fact').first().locator('dd').textContent(), 'the "for" left out').toBe(words('handbookPage.forNotSaid'))
    expect(await page.locator('section.hbk-text .hbk-says').textContent(), 'the text part').toBe(words('handbookPage.noText'))
    const rows = page.locator('ol.hbk-rows > li')
    await expect.poll(async () => rows.count(), { timeout: 30_000 }).toBe(1)
    expect(await rows.nth(0).locator('.hbk-row-why').textContent(), 'the first version').toBe(words('handbookPage.noText'))
  })
})
