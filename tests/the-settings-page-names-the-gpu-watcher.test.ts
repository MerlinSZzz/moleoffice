// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SETTINGS PANEL "THE GPU WATCHER", IN A BROWSER (wave 13v round 35b). The GPU watcher is the one agent, besides the
 * owner, that may hand in readings of the GPU card. It is a setting kept in the office, and the panel names it with one
 * press, says who it is now and where that came from, and draws the reason given with the newest change.
 *
 *   1. the panel is in the Tools category, straight after the sandbox memory limit, and drawn in normal mode;
 *   2. with nothing set it says nobody is the watcher, says what the watcher may do, and offers Nobody and every agent;
 *   3. a press names one: the state and the change line follow the stored value;
 *   4. the office's own step at start: the row it writes (tests/the-gpu-watcher-is-kept-in-the-office.test.ts proves the
 *      step writes exactly this row) is drawn with its reason, and the change line says the office changed it;
 *   5. when TEST_SHOTS names a folder, the panel is photographed in each of those three states, at 1440, 990, 660 and
 *      390 in light and dark, in English.
 *
 * MUTATION PROOF (each after a green control): in src/web/pages/SettingsPage.tsx, give 'settings.gpuwatcher' the
 * category 'work' (case 1 goes red); in src/web/components/GpuWatcher.tsx, draw the state from the first reading and
 * never the door's answer (case 3 goes red).
 *
 * The world: two made-up worker agents. The reason in case 4, with its count and its two times, is made up as well.
 */

import { join } from 'node:path'

import Database from 'better-sqlite3'
import { afterAll, beforeAll, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { localStamp } from '../src/shared/time.ts'
import { englishWords } from '../src/shared/words/joined.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { testShots } from './where-shots-go.ts'

const en = englishWords()

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

const PANEL = '[data-target="uiSurface/settings.gpuwatcher"]'
const ENTRY = '[data-settings-panel="settings.gpuwatcher"]'

/** A made-up reason in the form the step at start writes. */
const SET_AT_START =
  'Set by the office when it started: this office had accepted 412 readings of the GPU card from this agent, the first ' +
  'at 2026-10-01 09:00:00 and the last at 2026-10-14 17:00:00, and none from any other agent.'

let app: LiveApp
const shots = testShots('the-settings-page-names-the-gpu-watcher')

async function call(method: string, path: string, body?: unknown): Promise<Record<string, unknown>> {
  const reply = await fetch(`${app.api}${path}`, { method, headers: AS_THE_PERSON, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
  const text = await reply.text()
  expect(reply.status < 300, `${method} ${path}: ${text.slice(0, 400)}`).toBe(true)
  return JSON.parse(text) as Record<string, unknown>
}

async function idOf(handle: string): Promise<string> {
  const reading = (await call('GET', '/api/office/gpu-watcher')) as { mayBeNamed: { id: string; handle: string }[] }
  return reading.mayBeNamed.find((one) => one.handle === handle)!.id
}

async function openThePanel(width = 1440, look = 'light'): Promise<void> {
  await app.page.setViewportSize({ width, height: 1000 })
  await app.page.goto('about:blank')
  await app.page.goto(`${app.site}/?lang=en&mode=normal&look=${look}#/settings/gpuwatcher`)
  await waitForThePage(app.page, 60_000)
  await app.page.locator(`${PANEL} .gpw-state`).waitFor({ timeout: 30_000 })
  await app.page.locator(`${PANEL} .scl-line`).waitFor({ timeout: 30_000 })
}

const textOf = async (selector: string): Promise<string> => (await app.page.locator(`${PANEL} ${selector}`).innerText()).trim()

async function photograph(state: string): Promise<void> {
  // EVERY WIDTH, BOTH LOOKS, IN ENGLISH.
  for (const width of [1440, 990, 660, 390]) {
    for (const look of ['light', 'dark']) {
      await openThePanel(width, look)
      expect(await app.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${state} ${String(width)} ${look}`).toBe(true)
      await app.page.locator(PANEL).scrollIntoViewIfNeeded()
      await app.page.screenshot({ path: `${shots}/gpu-watcher-${state}-en-${String(width)}-${look}.png`, fullPage: false })
    }
  }
}

beforeAll(async () => {
  app = await liveApp({ name: 'gpu-watcher-panel', viewport: { width: 1440, height: 1000 }, workspace: 'default' })
  for (const [handle, name] of [['card-reader', 'Card Reader'], ['another-worker', 'Another Worker']]) {
    await call('POST', '/api/agents/started', { handle, name, role: 'worker' })
  }
  await app.page.addInitScript(({ person }) => {
    const query = new URLSearchParams(location.search)
    localStorage.setItem('mole-office.preset.theme', query.get('look') ?? 'light')
    localStorage.setItem('mole-office.actor', JSON.stringify({ type: 'human', id: person }))
  }, { person: THE_PERSON })
}, 300_000)

afterAll(async () => {
  await app?.stop()
}, 120_000)

it('is in the Tools category straight after the sandbox memory limit, in normal mode', async () => {
  await openThePanel()
  const tools = await app.page.locator('.set .sf-cat[data-category="tools"] [data-settings-panel]').evaluateAll((all) =>
    all.map((one) => one.getAttribute('data-settings-panel') ?? ''),
  )
  expect(tools.indexOf('settings.gpuwatcher')).toBe(tools.indexOf('settings.sandboxmemory') + 1)
  // THE WORDS, not how a style draws their case.
  expect((await app.page.locator(`${ENTRY} .sf-title`).textContent())?.trim()).toBe('The GPU watcher')
}, 120_000)

it('says nobody is the watcher, says what the watcher may do, and offers Nobody and every agent', async () => {
  await openThePanel()
  // The two sentences are read from the word list. What they must say was pinned by a test
  // deleted on 13 November 2026.
  expect(await textOf('.gpw-what')).toBe(en['gpuWatcher.what'])
  expect(await textOf('.gpw-state')).toBe(en['gpuWatcher.inForce.nobody'])
  expect(await app.page.locator(`${PANEL} .gpw-because`).count()).toBe(0)
  expect(await textOf('.scl-line')).toBe('No change recorded.')
  const offered = (await app.page.locator(`${PANEL} select option`).allInnerTexts()).map((one) => one.trim())
  expect(offered[0]).toBe('None')
  expect(offered).toContain('Card Reader')
  expect(offered).toContain('Another Worker')
}, 120_000)

it.skipIf(!process.env['TEST_SHOTS'])('photographs the panel with nobody named', async () => {
  await photograph('nobody')
}, 600_000)

it('names one agent with one press, and draws back what was stored', async () => {
  await openThePanel()
  const chosen = await idOf('card-reader')
  await app.page.locator(`${PANEL} select`).selectOption(chosen)
  await app.page.locator(`${PANEL} .gpw-button`).click()
  await app.page.waitForFunction(
    ({ selector, expected }) => document.querySelector(selector)?.textContent?.trim() === expected,
    { selector: `${PANEL} .gpw-state`, expected: 'Card Reader is the GPU watcher, chosen here.' },
    { timeout: 15_000 },
  )
  await app.page.waitForFunction(
    (selector) => document.querySelector(selector)?.textContent?.includes('Changed by') ?? false,
    `${PANEL} .scl-line`,
    { timeout: 15_000 },
  )
  const stored = (await call('GET', '/api/office/gpu-watcher')) as { stored: string | null; inForce: { from: string } }
  expect(stored.stored).toBe(chosen)
  expect(stored.inForce.from).toBe('set here')
}, 120_000)

it.skipIf(!process.env['TEST_SHOTS'])('photographs the panel with an agent named', async () => {
  await photograph('named')
}, 600_000)

it('draws the reason the office gave when it set the watcher at start, and says the office changed it', async () => {
  const chosen = await idOf('another-worker')
  const db = new Database(join(app.dir, 'panelx.db'))
  try {
    db.prepare(
      "INSERT INTO changes (id, record_id, workspace_id, op, actor_type, actor_id, field, old_value, new_value, at) VALUES (?, 'setting:gpu-watcher', NULL, 'update', 'system', 'mole-office', 'the GPU watcher', NULL, ?, ?)",
    ).run('a-made-up-start-step-row', JSON.stringify({ watcher: chosen, because: SET_AT_START }), localStamp(new Date(Date.now() + 60_000)))
  } finally {
    db.close()
  }
  await openThePanel()
  expect(await textOf('.gpw-state')).toBe('Another Worker is the GPU watcher, chosen here.')
  expect(await textOf('.gpw-because')).toBe(`Reason given: ${SET_AT_START}`)
  expect(await textOf('.scl-line')).toMatch(/^Changed by Mole Office /)
}, 120_000)

it.skipIf(!process.env['TEST_SHOTS'])('photographs the panel as the step at start left it', async () => {
  await photograph('set-at-start')
}, 600_000)
