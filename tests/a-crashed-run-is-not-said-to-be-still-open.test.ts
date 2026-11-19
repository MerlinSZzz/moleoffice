// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RUN THAT HAS STOPPED IS NOT SAID TO BE STILL OPEN. Wave 13s round 54.
 *
 * A run's page puts its last output or its end beside "Last output". With neither recorded, it said "This run has not
 * ended." whatever the run's state, so a crashed run was said to be still open. That is a wrong statement on the screen.
 * The sentence is now said only of a run marked as running or idle that nobody has closed. Any other run with neither
 * time says that nobody recorded either. Every run here is made up.
 *
 * What is held, at 1440 and 390 in the light theme:
 *   1. A crashed run with no recorded times says nobody recorded them, and never that it has not ended.
 *   2. A running run with no recorded times still says it has not ended.
 *
 * Mutation, after a control run, restored with git checkout: the page says "This run has not ended." again whenever
 * neither time is recorded. Case 1 goes red.
 *
 * With RUN_PAGE_SHOTS set to a folder, each page is photographed there.
 */
import { mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'

const STILL_OPEN = 'This run has not ended.'
const NEITHER_RECORDED = 'Nobody recorded its last output or when it ended.'

let app: LiveApp
const runs: Record<'crashed' | 'running', string> = { crashed: '', running: '' }
const shots = process.env['RUN_PAGE_SHOTS']

beforeAll(async () => {
  app = await liveApp({ name: 'crashed-run-page', viewport: { width: 1440, height: 900 } })
  const keys = JSON.parse(readFileSync(join(app.dir, 'keys.json'), 'utf8')) as { person: string }
  const person = { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id, 'x-mole-office-key': keys.person }
  for (const state of ['crashed', 'running'] as const) {
    const response = await fetch(`${app.api}/api/records`, {
      method: 'POST', headers: person,
      body: JSON.stringify({ kind: 'session', title: `Made-up ${state} run`, data: { state, doing: `Made-up ${state} run with no recorded times.` } }),
    })
    const answer = await response.json()
    expect(response.status, String(answer.error ?? '')).toBe(201)
    runs[state] = answer.record.id
  }
  if (shots !== undefined) mkdirSync(shots, { recursive: true })
}, 120_000)
afterAll(async () => { await app?.stop() })

/** The facts of a run's page as drawn, at one width and theme. */
async function theFactsOf(state: 'crashed' | 'running', width: number, theme: 'light' | 'dark'): Promise<string> {
  await app.page.setViewportSize({ width, height: 900 })
  await app.page.emulateMedia({ colorScheme: theme })
  await app.page.goto(`${app.site}/#/session/${runs[state]}`, { waitUntil: 'domcontentloaded' })
  await app.page.reload()
  await waitForThePage(app.page)
  const facts = app.page.locator('.sp-facts').first()
  await facts.waitFor({ state: 'visible' })
  const overflow = await app.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow, `${state} ${theme} ${String(width)}`).toBeLessThanOrEqual(0)
  if (shots !== undefined) await app.page.screenshot({ path: join(shots, `${state}-run-${String(width)}-${theme}.png`), fullPage: true })
  return facts.innerText()
}

it('says nobody recorded the times of a crashed run, and never that it has not ended', async () => {
  for (const theme of ['light'] as const) for (const width of [1440, 390]) {
    const facts = await theFactsOf('crashed', width, theme)
    expect(facts, `${theme} ${String(width)}`).toContain(NEITHER_RECORDED)
    expect(facts, `${theme} ${String(width)}`).not.toContain(STILL_OPEN)
  }
}, 180_000)

it('still says a running run with no recorded times has not ended', async () => {
  for (const theme of ['light'] as const) for (const width of [1440, 390]) {
    const facts = await theFactsOf('running', width, theme)
    expect(facts, `${theme} ${String(width)}`).toContain(STILL_OPEN)
    expect(facts, `${theme} ${String(width)}`).not.toContain(NEITHER_RECORDED)
  }
}, 180_000)
