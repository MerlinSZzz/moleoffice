// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE RECORD PAGE AND SETTINGS' REPOSITORIES PANEL KEEP THEIR OWN LOOKS, WHICHEVER WAS OPENED FIRST.
 *
 * React keeps a page's stylesheet in the document after the page closes. The repositories panel in
 * Settings (src/web/components/Repositories.tsx) used to name its classes rp-head, rp-facts, rp-count and
 * rp-note, which the record page also uses with different rules. So once Settings had been opened, the
 * record page's facts box was drawn as a grid instead of a column (problem 71zPx0Wyvu6_). The panel's
 * classes are repos-* now.
 *
 * Each case opens a fresh document, reads every computed style of two parts of one page, opens the other
 * page, opens the first page again and reads the same two parts. Every style must be the same on the third
 * visit as on the first.
 * - The record page: its head (header.rp-head) and its first facts box (.rp-facts).
 * - The repositories panel: a row's head (.repos-head) and its facts (.repos-facts).
 *
 * THE RECORD IS A TASK, NOT A NOTE. Since decision 8SkQQo1x69IV, revision 3, a note's page draws no origin
 * section and no state section, so it has no facts box to measure. A task's state section draws one in
 * developer mode, and a task opens on the record page itself. A problem would not do: it opens on a page
 * of its own, which has no header.rp-head.
 *
 * MUTATIONS, each red, in src/web/components/Repositories.tsx:
 * - name the panel's facts rule .rp-facts again: the first case fails (the record page's facts box turns to a grid);
 * - name the panel's head rp-head again, in its rule and its markup: both cases fail.
 * And in src/web/pages/RecordPage.tsx, give the state section's facts box and the whose-move box other classes:
 * both cases fail, because the record page then draws no facts box to measure.
 */
import { afterAll, beforeAll, expect, it } from 'vitest'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { recordPath } from '../src/web/components/router.tsx'
import { openSettingsPanel } from './settings-folds.ts'

let app: LiveApp
let task = ''
/** Developer mode, because the repositories panel is drawn only there. Every address carries it. */
const QUERY = '/?mode=inspect'

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

async function post(path: string, body: unknown): Promise<Record<string, unknown>> {
  const reply = await fetch(`${app.api}${path}`, { method: 'POST', headers: AS_THE_OWNER, body: JSON.stringify(body) })
  expect(reply.status, await reply.clone().text()).toBeLessThan(300)
  return (await reply.json()) as Record<string, unknown>
}

/** Every computed style of the first element each selector finds, or 'absent' when it finds none. */
async function everyStyleOf(selectors: string[]): Promise<Record<string, Record<string, string> | 'absent'>> {
  return await app.page.evaluate((wanted) => {
    const out: Record<string, Record<string, string> | 'absent'> = {}
    for (const selector of wanted) {
      const el = document.querySelector(selector)
      if (el === null) { out[selector] = 'absent'; continue }
      const style = getComputedStyle(el)
      const all: Record<string, string> = {}
      for (const name of Array.from(style)) all[name] = style.getPropertyValue(name)
      out[selector] = all
    }
    return out
  }, selectors)
}

/** Moving to another page by its hash only, as a person's press does, so the document stays the same. */
async function openTheRecordPage() {
  await app.page.goto(`${app.site}${QUERY}#${recordPath(task, 'task')}`)
  await waitForThePage(app.page)
  await app.page.locator('header.rp-head').first().waitFor({ timeout: 30_000 })
  await app.page.locator('.rp-facts').first().waitFor({ timeout: 30_000 })
  return await everyStyleOf(['header.rp-head', '.rp-facts'])
}

async function openTheRepositoriesPanel() {
  await app.page.goto(`${app.site}${QUERY}#/settings`)
  await waitForThePage(app.page)
  await openSettingsPanel(app.page, 'settings.repositories')
  await app.page.locator('.repos-row').first().waitFor({ timeout: 30_000 })
  return await everyStyleOf(['.repos-row .repos-head', '.repos-row .repos-facts'])
}

/** A new document, so no page's stylesheet is left over from an earlier case. */
async function aFreshDocument(): Promise<void> {
  await app.page.goto('about:blank')
}

beforeAll(async () => {
  app = await liveApp({ name: 'record-and-repositories-looks', workspace: 'default', viewport: { width: 1440, height: 1000 } })
  task = ((await post('/api/records', { kind: 'task', title: 'Reseal the kiln door', data: {} })).record as { id: string }).id
  await post('/api/implementation/repositories', { name: 'kiln-controller' })
}, 180_000)

afterAll(async () => {
  await app.stop()
})

it('draws the record page the same after Settings was opened', async () => {
  await aFreshDocument()
  const first = await openTheRecordPage()
  expect(first['header.rp-head'], 'the record page drew no head, so nothing is measured').not.toBe('absent')
  expect(first['.rp-facts'], 'the record page drew no facts box, so nothing is measured').not.toBe('absent')
  await openTheRepositoriesPanel()
  expect(await openTheRecordPage(), 'the record page looks different after Settings was opened').toEqual(first)
}, 180_000)

it('draws the repositories panel the same after a record page was opened', async () => {
  await aFreshDocument()
  const first = await openTheRepositoriesPanel()
  expect(first['.repos-row .repos-head'], 'the panel drew no row head, so nothing is measured').not.toBe('absent')
  expect(first['.repos-row .repos-facts'], 'the panel drew no facts, so nothing is measured').not.toBe('absent')
  await openTheRecordPage()
  expect(await openTheRepositoriesPanel(), 'the repositories panel looks different after a record page was opened').toEqual(first)
}, 180_000)
