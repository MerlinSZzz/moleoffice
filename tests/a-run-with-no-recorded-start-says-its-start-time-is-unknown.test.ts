// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RUN WHOSE RECORD HOLDS NO START TIME SAYS ON ITS PAGE THAT ITS START TIME IS UNKNOWN. Wave 13y round 34, item 9.8 (c).
 *
 * The run's page drew `data.startedAt`, and when the record held none it drew the moment the record was made under the
 * label "Started", as if that were when the run began. A terminal holder that cannot read its own start sends none, so
 * its row is one of these (tests/a-holder-that-sends-no-start-time-has-none-on-its-row.test.ts). The page now says
 * "Start time unknown." and gives the other time as what it is: when the office first recorded the run.
 *
 * WHAT THIS HOLDS, in a real browser, at 1440 and 390 in the light theme:
 *   1. a run filed with no start time: its "Started" fact says the start time is unknown and when the office first
 *      recorded the run, at the record's own time, and draws no time as its start;
 *   2. a run filed with a start time: its "Started" fact draws that time, and does not say it is unknown;
 *   3. in the test language both sentences are marked, so neither is a literal in the page.
 *
 * Every run here is made up and filed in this test's own office.
 */
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { Page } from 'playwright'
import { join } from 'node:path'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { testShots } from './where-shots-go.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { sessionPath } from '../src/web/components/router.tsx'

const SHOTS = testShots('run-start-unknown')
const AS_THE_PERSON: Record<string, string> = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const UNKNOWN = 'Start time unknown.'
const FIRST_RECORDED = 'First recorded by this office at '

let app: LiveApp
let page: Page
let noStart = { id: '', createdAt: '' }
let withStart = { id: '', createdAt: '' }

async function file(title: string, data: Record<string, unknown>): Promise<{ id: string; createdAt: string }> {
  const res = await fetch(`${app.api}/api/records`, { method: 'POST', headers: AS_THE_PERSON, body: JSON.stringify({ kind: 'session', title, data }) })
  expect(res.status, await res.clone().text()).toBe(201)
  const { record } = (await res.json()) as { record: { id: string; createdAt: string } }
  return { id: record.id, createdAt: record.createdAt }
}

async function open(id: string, width: number, theme: 'light' | 'dark', lang = 'en'): Promise<void> {
  await page.setViewportSize({ width, height: 900 })
  await page.emulateMedia({ colorScheme: theme })
  await page.goto(`${app.site}/?lang=${lang}#${sessionPath(id)}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.reload({ timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.locator('.sp-facts').first().waitFor({ state: 'visible', timeout: 30_000 })
}

/** The "Started" fact: its text and the times drawn in it. It is the fifth fact of the run's first panel. */
async function theStartedFact(): Promise<{ label: string; text: string; stamps: (string | null)[] }> {
  const fact = page.locator('.sp-facts').first().locator('.sp-fact').nth(4)
  return {
    label: ((await fact.locator('dt').textContent()) ?? '').trim(),
    text: ((await fact.locator('dd').textContent()) ?? '').trim(),
    stamps: await fact.locator('dd time').evaluateAll((times) => times.map((one) => one.getAttribute('datetime'))),
  }
}

beforeAll(async () => {
  app = await liveApp({ name: 'run-start-unknown', viewport: { width: 1440, height: 900 }, workspace: 'default' })
  page = app.page
  noStart = await file('Made-up holder of the lantern terminals', { state: 'running', runtime: 'mole-office', doing: 'Made up: holds the lantern terminals.' })
  withStart = await file('Made-up mending of the lantern scanner', { state: 'running', runtime: 'claude-code', startedAt: '2026-09-29 17:00:00' })
}, 300_000)

afterAll(async () => {
  await app?.stop()
}, 120_000)

it('1 and 2: a run with no start time says it is unknown and when it was first recorded; a run with one draws it', async () => {
  const [, recordedAt] = /^\d{4}-\d\d-\d\d (\d\d:\d\d):\d\d$/.exec(noStart.createdAt) ?? []
  if (recordedAt === undefined) throw new Error(`the record's time ${noStart.createdAt} is not a local stamp`)
  // WHETHER THE START SAYS UNKNOWN DOES NOT DEPEND ON THE WIDTH OR THE THEME.
  for (const theme of ['light'] as const) for (const width of [1440, 390]) {
    await open(noStart.id, width, theme)
    const unknown = await theStartedFact()
    expect(unknown.label).toBe('Started')
    expect(unknown.text, `${theme} ${width}`).toMatch(new RegExp(`^${UNKNOWN.replaceAll('.', '\\.')}\\s*${FIRST_RECORDED}.*${recordedAt}.*\\.$`))
    expect(unknown.stamps, 'a time is drawn as the start of a run whose start nobody recorded').toEqual([])
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), `${theme} ${width}`).toBeLessThanOrEqual(0)
    await page.screenshot({ path: join(SHOTS, `no-start-${width}-${theme}.png`), fullPage: true })

    await open(withStart.id, width, theme)
    const known = await theStartedFact()
    expect(known.stamps).toEqual(['2026-09-29 17:00:00'])
    expect(known.text).not.toContain(UNKNOWN)
    expect(known.text).not.toContain(FIRST_RECORDED)
  }
}, 300_000)

it('3: in the test language both sentences come from the word lists', async () => {
  await open(noStart.id, 1440, 'light', 'xx')
  const marked = await page.locator('.sp-facts').first().locator('.sp-fact').nth(4).locator('dd > *').evaluateAll((parts) => parts.map((one) => (one.textContent ?? '').trim()))
  expect(marked.length, 'the fact draws the two sentences').toBe(2)
  for (const one of marked) expect(one, 'a sentence on the run page did not come from the word lists').toMatch(/^⟦/)
}, 120_000)
