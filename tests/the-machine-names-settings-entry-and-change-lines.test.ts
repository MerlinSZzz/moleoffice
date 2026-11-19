// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** The machine names panel can be found, used, and read back in the Settings page. */

import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import type { OfficeSettingChangeName, OfficeSettingChangesReply } from '../src/web/api.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { chooseSettingsCategory } from './settings-folds.ts'

let app: LiveApp

const ENTRY = '[data-settings-panel="settings.machinenames"]'
const PANEL = '[data-target="uiSurface/settings.machinenames"]'
const NO_CHANGE = 'No change recorded.'
const ADDRESS = '192.0.2.20'
const PERSON_HEADERS = {
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

async function openPanel(surface = 'settings.machinenames', language = 'en'): Promise<void> {
  await app.page.goto('about:blank')
  await app.page.goto(`${app.site}/?lang=${language}&mode=normal#/settings/${surface.slice('settings.'.length)}`)
  await waitForThePage(app.page, 30_000)
  await app.page.waitForSelector(`[data-target="uiSurface/${surface}"]`, { timeout: 30_000 })
}

async function waitForChangedLine(selector = '.scl-line'): Promise<void> {
  await app.page.waitForFunction(
    (target) => document.querySelector(target)?.textContent?.includes('Changed by') ?? false,
    selector,
    { timeout: 10_000 },
  )
}

async function expectChangedLine(setting: OfficeSettingChangeName, selector: string): Promise<void> {
  const response = await fetch(`${app.api}/api/office/setting-changes`, { headers: PERSON_HEADERS })
  expect(response.status, await response.clone().text()).toBe(200)
  const reading = (await response.json()) as OfficeSettingChangesReply
  const last = reading.settings[setting]
  expect(last, setting).not.toBeNull()
  if (last === null) throw new Error(`${setting} has no recorded change after its save`)

  await waitForChangedLine(selector)
  const line = app.page.locator(selector)
  // WHO CHANGED IT BY THE NAME THE REGISTRY HOLDS, never the stored id (wave 13n round 33). A RELATIVE TIME, SUCH AS
  // "just now", READS WITHOUT "at": "Changed by Jory just now."
  const people = (await (await fetch(`${app.api}/api/participants`, { headers: PERSON_HEADERS })).json()) as { people: { id: string; name: string }[] }
  const name = people.people.find((one) => one.id === last.by.id)?.name ?? ''
  expect(name.length, 'the test office holds a name for the person who changed it').toBeGreaterThan(0)
  expect(await line.innerText()).toContain(`Changed by ${name} `)
  if (name !== last.by.id) expect(await line.innerText()).not.toContain(last.by.id)
  expect(await line.innerText()).not.toContain(' at ')
  const time = line.locator('time')
  expect(await time.count()).toBe(1)
  expect(await time.getAttribute('datetime')).toBe(last.at)
  expect((await time.getAttribute('title'))?.length ?? 0).toBeGreaterThan(0)
}

async function addName(address: string, name: string): Promise<void> {
  await app.page.locator('.mn-add input').nth(0).fill(address)
  await app.page.locator('.mn-add input').nth(1).fill(name)
  await app.page.getByRole('button', { name: 'Add machine' }).click()
}

beforeAll(async () => {
  app = await liveApp({ name: 'machine-names-settings-entry', viewport: { width: 1440, height: 1000 } })
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

describe('the machine names entry in Settings', () => {
  it('is in Chat straight after the inject switch and is drawn in normal mode', async () => {
    await app.page.goto(`${app.site}/?lang=en&mode=normal#/settings`)
    await waitForThePage(app.page, 30_000)
    // Settings draws one category at a time (wave 13y round 125, item 62), so Chat is chosen first.
    await chooseSettingsCategory(app.page, 'chat')
    const chat = await app.page.locator('.set .sf-cat[data-category="chat"] [data-settings-panel]').evaluateAll((all) =>
      all.map((one) => one.getAttribute('data-settings-panel') ?? ''),
    )
    expect(chat.indexOf('settings.machinenames')).toBe(chat.indexOf('settings.inject') + 1)
    const entry = app.page.locator(`${ENTRY} .sf-title`)
    expect((await entry.textContent())?.trim()).toBe('Machine names')
    expect(await app.page.locator(ENTRY).count()).toBe(1)
  }, 90_000)

  it('adds, renames, and removes a machine, drawing back the stored values and the change line', async () => {
    await openPanel()
    const changed = app.page.locator(`${PANEL} .scl-line`)
    await changed.waitFor({ timeout: 30_000 })
    expect((await changed.innerText()).trim()).toBe(NO_CHANGE)
    expect(await app.page.locator(`${PANEL} .mn-history`).innerText()).toContain('A new name applies to new messages only.')

    await addName(` ${ADDRESS} `, '  loquat  ')
    await app.page.waitForSelector(`${PANEL} [data-machine-address="${ADDRESS}"]`, { timeout: 15_000 })
    const panelOrder = await app.page.locator(`${PANEL} .mn`).evaluate((panel) =>
      Array.from(panel.children, (child) => (child as HTMLElement).className),
    )
    expect(panelOrder.indexOf('mn-purpose')).toBeGreaterThan(panelOrder.indexOf('mn-list'))
    expect(panelOrder.indexOf('mn-history')).toBeGreaterThan(panelOrder.indexOf('mn-purpose'))
    expect((await app.page.locator(`${PANEL} .mn-saved`).innerText()).trim()).toBe(
      `${ADDRESS} is named loquat. A message from it reads “from loquat”.`,
    )
    expect(await app.page.locator(`${PANEL} [data-machine-address="${ADDRESS}"] input`).inputValue()).toBe('loquat')
    await expectChangedLine('machine-names', `${PANEL} .scl-line`)

    await new Promise((resolve) => setTimeout(resolve, 1_100))
    const row = app.page.locator(`${PANEL} [data-machine-address="${ADDRESS}"]`)
    await row.locator('input').fill('  loquat  north  ')
    await row.getByRole('button', { name: 'Save name' }).click()
    await app.page.waitForFunction(
      (selector) => (document.querySelector(selector)?.querySelector('input') as HTMLInputElement | null)?.value === 'loquat north',
      `${PANEL} [data-machine-address="${ADDRESS}"]`,
      { timeout: 15_000 },
    )
    expect((await app.page.locator(`${PANEL} .mn-saved`).innerText()).trim()).toBe(
      `${ADDRESS} is named loquat north. A message from it reads “from loquat north”.`,
    )
    await expectChangedLine('machine-names', `${PANEL} .scl-line`)

    await app.page.setViewportSize({ width: 390, height: 844 })
    expect(await app.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await app.page.setViewportSize({ width: 1440, height: 1000 })

    await new Promise((resolve) => setTimeout(resolve, 1_100))
    await row.getByRole('button', { name: 'Remove name' }).click()
    await app.page.waitForFunction(
      (selector) => document.querySelector(selector) === null,
      `${PANEL} [data-machine-address="${ADDRESS}"]`,
      { timeout: 15_000 },
    )
    expect((await app.page.locator(`${PANEL} .mn-saved`).innerText()).trim()).toBe(
      `${ADDRESS} has no name now. A message from it reads “from the address ${ADDRESS}”.`,
    )
    await expectChangedLine('machine-names', `${PANEL} .scl-line`)
  }, 150_000)

  it('draws the address refusal from the server', async () => {
    await openPanel()
    await addName('not-an-address', 'broken')
    const refusal = app.page.locator(`${PANEL} .px-error`)
    await refusal.waitFor({ timeout: 10_000 })
    const message = await refusal.innerText()
    // THE CODED REFUSAL, IN THE PAGE'S OWN WORDS (machineAddressNotAnAddress), not the server's English sentence.
    expect(message).toContain('These words are not an address.')
    expect(message).not.toContain('"not-an-address" is not an address.')
    expect(message).toContain('Write an IPv4 address such as')
    expect(message).toContain('Nothing was changed.')
    expect(await app.page.locator(`${PANEL} .mn-saved`).count()).toBe(0)
  }, 90_000)

  it('shows the inject change line after the switch is saved', async () => {
    await openPanel('settings.inject')
    const line = app.page.locator('[data-target="uiSurface/settings.inject"] .scl-line')
    await line.waitFor({ timeout: 30_000 })
    expect((await line.innerText()).trim()).toBe(NO_CHANGE)
    await app.page.locator('[data-target="uiSurface/settings.inject"] [role="switch"]').click()
    await waitForChangedLine('[data-target="uiSurface/settings.inject"] .scl-line')
    await expectChangedLine('agents-may-inject', '[data-target="uiSurface/settings.inject"] .scl-line')
  }, 90_000)

  it('shows the what-is-kept change line after a number is saved', async () => {
    await openPanel('settings.whatiskept')
    const panel = app.page.locator('[data-target="uiSurface/settings.whatiskept"]')
    const line = panel.locator('.scl-line')
    await line.waitFor({ timeout: 30_000 })
    expect((await line.innerText()).trim()).toBe(NO_CHANGE)
    const row = panel.locator('[data-kept="tracedRequestDays"]')
    await row.locator('input').fill('200')
    await row.getByRole('button', { name: 'Keep' }).click()
    await waitForChangedLine('[data-target="uiSurface/settings.whatiskept"] .scl-line')
    await expectChangedLine('what-is-kept', '[data-target="uiSurface/settings.whatiskept"] .scl-line')
  }, 120_000)

  it('takes the pictures, every width in both looks and both languages, only when MACHINE_NAMES_SHOTS names a folder', async () => {
    const folder = process.env['MACHINE_NAMES_SHOTS']
    if (!folder) return

    await openPanel()
    await addName('192.0.2.17', 'aurora')
    await addName('198.51.100.13', 'loquat')
    await app.page.waitForFunction(
      (selector) => document.querySelectorAll(selector).length === 2,
      `${PANEL} [data-machine-address]`,
      { timeout: 30_000 },
    )
    mkdirSync(folder, { recursive: true })
    // EVERY WIDTH, BOTH LOOKS, BOTH LANGUAGES (chapter 6, rule 1): the change line under the panel is drawn in each.
    const shotNames = [1440, 990, 660, 390].flatMap((width) =>
      ['light', 'dark'].flatMap((theme) => ['en', 'zh'].map((language) => `machine-names-${width}-${theme}-${language}.png`)),
    )
    for (const name of shotNames) rmSync(join(folder, name), { force: true })

    for (const width of [1440, 990, 660, 390]) {
      for (const theme of ['light', 'dark'] as const) {
        await app.page.setViewportSize({ width, height: 1000 })
        await app.page.emulateMedia({ colorScheme: theme })
        expect(await app.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${width}px ${theme}`).toBe(true)
        await app.page.screenshot({ path: join(folder, `machine-names-${width}-${theme}-en.png`), fullPage: true })
      }
    }

    await app.page.setViewportSize({ width: 1440, height: 1000 })
    await app.page.emulateMedia({ colorScheme: 'light' })
    await openPanel('settings.machinenames', 'zh')
    expect((await app.page.locator(`${ENTRY} .sf-title`).innerText()).trim()).toBe('机器名称')
    expect(await app.page.locator(`${PANEL} [data-machine-address]`).count()).toBe(2)
    expect((await app.page.locator(`${PANEL} .scl-line`).innerText()).trim()).toMatch(/^更改者：.+；时间：.+。$/)
    for (const width of [1440, 990, 660, 390]) {
      for (const theme of ['light', 'dark'] as const) {
        await app.page.setViewportSize({ width, height: 1000 })
        await app.page.emulateMedia({ colorScheme: theme })
        expect(await app.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${width}px ${theme} zh`).toBe(true)
        await app.page.screenshot({ path: join(folder, `machine-names-${width}-${theme}-zh.png`), fullPage: true })
      }
    }
    for (const name of shotNames) expect(existsSync(join(folder, name)), name).toBe(true)
  }, 240_000)
})
