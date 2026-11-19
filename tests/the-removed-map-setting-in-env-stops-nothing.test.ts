// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE REMOVED MAP SETTING, STILL NAMED IN .env, STOPS NOTHING. Wave 13y round 119, item 52 point 6. The older built-in
 * map is deleted, and with it the setting MOLE_OFFICE_PIXEL_OFFICE that turned it off. The live office's .env still
 * names that setting, and nobody edits that file. So the office must start with the name present, and no page and no
 * door may refuse because of it.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS BEING PROVED, IN A MADE-UP TEST OFFICE
 * ---------------------------------------------------------------------------------------
 *
 *   1. A made-up .env names the setting, and the office's one loader of .env puts it into the environment. This is
 *      how the live .env reaches the live office, and the test office below starts with that environment.
 *   2. The office started. Its settings door answers, and holds no row for the removed name. Its machine reading
 *      answers, and has no part for the removed map.
 *   3. A value for the removed name is also stored in the made-up office's database, as Office controls stored such
 *      values before. The Working page draws its list, and the Settings page draws in both modes, with no notice of a
 *      refused saved value and no row naming the removed setting. Since wave 13y round 125 (item 62) the Settings
 *      page draws one category at a time, so each category is read in turn; and the Office controls are a page of
 *      their own, #/office-controls, drawn in developer mode, so that page is read there too.
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { envFileValues, forgetWhatTheEnvFileSupplied, loadEnvFileIntoProcess } from '../src/config/settings.mjs'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { aTestDatabaseFolder } from './a-test-folder.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { readEverySettingsCategory } from './settings-folds.ts'

const THE_NAME = 'MOLE_OFFICE_PIXEL_OFFICE'
const scratch = aTestDatabaseFolder('removed-map-setting')
const envFile = join(scratch, '.env')
const BEFORE = process.env[THE_NAME]
let app: LiveApp
let loaded: { path: string; found: boolean }

const THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}

async function read(url: string): Promise<{ status: number; body: Record<string, any> }> {
  const reply = await fetch(app.api + url, { headers: THE_OWNER })
  const text = await reply.text()
  return { status: reply.status, body: JSON.parse(text) as Record<string, any> }
}

beforeAll(async () => {
  mkdirSync(scratch, { recursive: true })
  writeFileSync(envFile, `# A made-up .env, written for a test.\n${THE_NAME}=off\n`)
  delete process.env[THE_NAME]
  loaded = loadEnvFileIntoProcess(envFile)
  app = await liveApp({ name: 'removed-map-setting', workspace: 'default', viewport: { width: 1440, height: 1000 } })
  await app.page.addInitScript(({ person }) => localStorage.setItem('mole-office.actor', JSON.stringify({ type: 'human', id: person })), { person: THE_TEST_OFFICES_OWNER.id })
  const database = new Database(join(app.dir, 'panelx.db'))
  try {
    database.prepare('INSERT OR REPLACE INTO runtime_settings (name, value) VALUES (?, ?)').run(THE_NAME, 'off')
  } finally {
    database.close()
  }
}, 240_000)

afterAll(async () => {
  await app?.stop()
  forgetWhatTheEnvFileSupplied()
  if (BEFORE === undefined) delete process.env[THE_NAME]
  else process.env[THE_NAME] = BEFORE
  rmSync(scratch, { recursive: true, force: true })
}, 120_000)

describe('the removed map setting, still named in .env, stops nothing', () => {
  it('1. the made-up .env names the setting, and its loader puts it into the environment the office starts with', () => {
    expect(loaded).toEqual({ path: envFile, found: true })
    expect(envFileValues(envFile)).toEqual({ [THE_NAME]: 'off' })
    expect(process.env[THE_NAME]).toBe('off')
  })

  it('2. the office started, and its doors answer with nothing for the removed name', async () => {
    const settings = await read('/api/office/settings')
    expect(settings.status, JSON.stringify(settings.body).slice(0, 400)).toBe(200)
    expect((settings.body['settings'] as { name: string }[]).map((one) => one.name)).not.toContain(THE_NAME)
    const machine = await read('/api/runtime')
    expect(machine.status, JSON.stringify(machine.body).slice(0, 400)).toBe(200)
    expect(machine.body).not.toHaveProperty('pixelOffice')
  }, 60_000)

  it('3. the Working page and the Settings page draw with a value for it stored, and nothing names it', async () => {
    const page = app.page
    await page.goto(`${app.site}/?lang=en&mode=normal#/working`)
    await waitForThePage(page, 60_000)
    await page.locator('.wrk [data-target="uiSurface/working.roster"]').waitFor({ timeout: 30_000 })
    expect(await page.locator('.wrk .px-error').count()).toBe(0)
    for (const mode of ['normal', 'inspect'] as const) {
      await page.goto(`${app.site}/?lang=en&mode=${mode}#/settings`)
      await waitForThePage(page, 60_000)
      await page.locator('.set .sf-jump').first().waitFor({ timeout: 30_000 })
      // The page draws one category at a time, so every category is read in turn, with its panels open and loaded.
      await readEverySettingsCategory(page, async (category) => {
        expect(await page.locator(`[data-setting="${THE_NAME}"]`).count(), `${mode}, ${category}: a row or notice for the removed name`).toBe(0)
        expect(await page.locator('.set').innerText(), `${mode}, ${category}: the page's words`).not.toContain(THE_NAME)
      })
    }
    await page.goto(`${app.site}/?lang=en&mode=inspect#/office-controls`)
    await waitForThePage(page, 60_000)
    await page.locator('[data-target="uiSurface/settings.officecontrols"] .orc-setting').first().waitFor({ timeout: 30_000 })
    expect(await page.locator(`[data-setting="${THE_NAME}"]`).count(), 'Office controls: a row for the removed name').toBe(0)
    expect(await page.locator('.pfs').innerText(), "Office controls: the page's words").not.toContain(THE_NAME)
  }, 180_000)
})
