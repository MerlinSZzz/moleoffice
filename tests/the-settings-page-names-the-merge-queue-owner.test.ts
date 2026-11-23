// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SETTINGS PANEL "WHO OWNS THE MERGE QUEUE", IN A BROWSER. With a decision and the answer EI3_Msuradr7, the
 * person names one secretary, which may then move a merge entry to the front of its lane. The
 * panel says in one line what the setting allows, shows who is named now, and says plainly when nobody is and why.
 *
 *   1. the panel is in the Chat category, straight after the dead-letter secretary, and drawn in normal mode;
 *   2. with nobody named it says so, says what the setting allows, and offers the secretaries and no other agent;
 *   3. a press names one: the state and the change line follow the stored value;
 *   4. when TEST_SHOTS names a folder, the panel is photographed named and not named, at 1440, 990, 660 and 390 in
 *      light and dark, in English.
 *
 * MUTATION PROOF (each after a green control): in src/web/pages/SettingsPage.tsx, give 'settings.mergequeueowner' the
 * category 'work' (case 1 goes red); in src/web/components/MergeQueueOwner.tsx, draw the state from the first reading
 * and never the door's answer (case 3 goes red).
 *
 * The world: two secretaries and one worker, all made-up.
 */

import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { englishWords } from '../src/shared/words/joined.ts'
import { theRoleCardsFile } from '../src/server/lib/roles.ts'
import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { testShots } from './where-shots-go.ts'

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

const PANEL = '[data-target="uiSurface/settings.mergequeueowner"]'
const ENTRY = '[data-settings-panel="settings.mergequeueowner"]'

let app: LiveApp
const en = englishWords()
const shots = testShots('the-settings-page-names-the-merge-queue-owner')

/** The card that may act for the person, read from the declaration and never typed. */
function theSecretaryCard(): string {
  const said = JSON.parse(readFileSync(theRoleCardsFile(), 'utf8')) as { elevation: { onlyThisCardCanHoldIt: string } }
  return said.elevation.onlyThisCardCanHoldIt
}

async function call(method: string, path: string, body?: unknown): Promise<Record<string, unknown>> {
  const reply = await fetch(`${app.api}${path}`, { method, headers: AS_THE_PERSON, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
  const text = await reply.text()
  expect(reply.status < 300, `${method} ${path}: ${text.slice(0, 400)}`).toBe(true)
  return JSON.parse(text) as Record<string, unknown>
}

async function openThePanel(width = 1440, look = 'light'): Promise<void> {
  await app.page.setViewportSize({ width, height: 1000 })
  await app.page.goto('about:blank')
  await app.page.goto(`${app.site}/?lang=en&mode=normal&look=${look}#/settings/mergequeueowner`)
  await waitForThePage(app.page, 60_000)
  await app.page.locator(`${PANEL} .mqo-state`).waitFor({ timeout: 30_000 })
}

async function photograph(state: string): Promise<void> {
  // EVERY WIDTH, BOTH LOOKS, IN ENGLISH.
  for (const width of [1440, 990, 660, 390]) {
    for (const look of ['light', 'dark']) {
      await openThePanel(width, look)
      expect(await app.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${state} ${String(width)} ${look}`).toBe(true)
      await app.page.locator(PANEL).scrollIntoViewIfNeeded()
      await app.page.screenshot({ path: `${shots}/merge-queue-owner-${state}-en-${String(width)}-${look}.png`, fullPage: false })
    }
  }
}

beforeAll(async () => {
  app = await liveApp({ name: 'merge-queue-owner-panel', viewport: { width: 1440, height: 1000 }, workspace: 'default' })
  for (const [handle, name] of [[THE_TEST_OFFICES_SECRETARY.handle, THE_TEST_OFFICES_SECRETARY.name], ['quill', 'Quill']]) {
    await call('POST', '/api/agents/started', { handle, name, role: theSecretaryCard() })
  }
  await call('POST', '/api/agents/started', { handle: 'lark', name: 'Lark', role: 'worker' })
  await app.page.addInitScript(({ person }) => {
    const query = new URLSearchParams(location.search)
    localStorage.setItem('mole-office.preset.theme', query.get('look') ?? 'light')
    localStorage.setItem('mole-office.actor', JSON.stringify({ type: 'human', id: person }))
  }, { person: THE_PERSON })
}, 300_000)

afterAll(async () => {
  await app?.stop()
}, 120_000)

it('is in the Chat category straight after the dead-letter secretary, in normal mode', async () => {
  await openThePanel()
  const chat = await app.page.locator('.set .sf-cat[data-category="chat"] [data-settings-panel]').evaluateAll((all) =>
    all.map((one) => one.getAttribute('data-settings-panel') ?? ''),
  )
  expect(chat.indexOf('settings.mergequeueowner')).toBe(chat.indexOf('settings.deadletters') + 1)
  // THE WORDS, not how a style draws their case.
  expect((await app.page.locator(`${ENTRY} .sf-title`).textContent())?.trim()).toBe('Merge queue owner')
}, 120_000)

it('says nobody is named, says what the setting allows, and offers the secretaries only', async () => {
  await openThePanel()
  expect((await app.page.locator(`${PANEL} .mqo-allows`).innerText()).trim()).toBe(
    'The agent that may move a merge entry to the front of its lane.',
  )
  expect((await app.page.locator(`${PANEL} .mqo-state`).innerText()).trim()).toBe(
    'No owner named. Only you may move an entry to the front.',
  )
  // THE PICKER'S ROWS, once its search box is pressed and the registries it names them from are read.
  await app.page.locator(PANEL).getByLabel(en['mergeQueueOwner.pick'], { exact: true }).click()
  await app.page.locator(`${PANEL} .agp .agp-row:not(.agp-fixed)`).first().waitFor({ timeout: 15_000 })
  const offered = (await app.page.locator(`${PANEL} .agp .agp-row .agp-name`).allInnerTexts()).map((one) => one.trim())
  expect(offered[0]).toBe('None')
  expect(offered.slice(1).sort()).toEqual([THE_TEST_OFFICES_SECRETARY.name, 'Quill'].sort())
}, 120_000)

it.skipIf(!process.env['TEST_SHOTS'])('photographs the panel with nobody named', async () => {
  await photograph('nobody')
}, 600_000)

it('names one secretary with one press, and draws back what was stored', async () => {
  await openThePanel()
  const ids = (await call('GET', '/api/office/merge-queue-owner')) as { mayBeNamed: { id: string; handle: string }[] }
  const chosen = ids.mayBeNamed.find((one) => one.handle === THE_TEST_OFFICES_SECRETARY.handle)!.id
  await app.page.locator(PANEL).getByLabel(en['mergeQueueOwner.pick'], { exact: true }).fill(THE_TEST_OFFICES_SECRETARY.handle)
  await app.page.locator(`${PANEL} .agp button.agp-row[data-value="${chosen}"]`).click()
  await app.page.locator(`${PANEL} .mqo-button`).click()
  await app.page.waitForFunction(
    ({ selector, expected }) => document.querySelector(selector)?.textContent?.trim() === expected,
    { selector: `${PANEL} .mqo-state`, expected: `${THE_TEST_OFFICES_SECRETARY.name} owns the merge queue.` },
    { timeout: 15_000 },
  )
  await app.page.waitForFunction(
    (selector) => document.querySelector(selector)?.textContent?.includes('Changed by') ?? false,
    `${PANEL} .scl-line`,
    { timeout: 15_000 },
  )
  const stored = (await call('GET', '/api/office/merge-queue-owner')) as { named: { id: string } | null }
  expect(stored.named?.id).toBe(chosen)
}, 120_000)

it.skipIf(!process.env['TEST_SHOTS'])('photographs the panel with a secretary named', async () => {
  await photograph('named')
}, 600_000)
