// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A SAVED RUNNING NUMBER THIS RELEASE REFUSES IS NAMED, AND ITS OWN PRESS PUTS IT RIGHT.
 *
 * Plan A, round 4: a stored value this release cannot use is an explicit error that names it, never a silent
 * substitute. Before this, a runtime_settings row of 65 for MOLE_OFFICE_BUS_MOST_ENTRIES (the bound is 1 to 64) was
 * drawn on the Settings page as the value, with nothing to say that the check a write must pass refuses it, while
 * the merge tool's bus used its shipped 8.
 *
 * The office here is made-up, and the file keeps one of it. Each case puts the saved rows it needs into that
 * office before it starts, as an older release or a hand edit would have left them, so a case never depends on
 * what the one before it did. The proof reads GET /api/office/settings, and puts the saved values right from the
 * two places a person meets them: the block Settings draws in Normal mode, and the Office controls panel, which the
 * page's own Developer press reaches. Settings draws the block only in Normal mode (wave 13r round 11): a refusal
 * that touches the person's own saved data must reach the person, who never sees the Developer-only panel. Since
 * wave 13y round 125 the Office controls have a page of their own, #/office-controls, which their old Settings
 * address leads to and which draws the switch between the modes in Normal mode; the block stays on Settings.
 *
 * The two drawing cases keep the widths where the claims are: 390 for overflow, and 1440 for the block's shape.
 */
import { mkdirSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Page } from 'playwright'
import { createI18n, type WordKey } from '../src/shared/i18n.ts'
import { freshDb, liveApp, waitForThePage, type LiveApp, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { putTheMadeUpLabelIn } from './the-made-up-label-above-the-page.ts'
import { openSettingsPanel } from './settings-folds.ts'

const headers = { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id }
const BUS = 'MOLE_OFFICE_BUS_MOST_ENTRIES', WORKERS = 'MOLE_OFFICE_MERGE_WORKERS', SLOTS = 'MOLE_OFFICE_BROWSER_TEST_SLOTS'
const COUNT = 'MOLE_OFFICE_DEAD_LETTER_AFTER_COUNT', RUNTIME = 'MOLE_OFFICE_CHORE_RUNTIME'
const POSITIVE = 'Use a positive whole number.'
const RESET_NAMES = [BUS, WORKERS, SLOTS, COUNT, RUNTIME]
const OVER = { [BUS]: '65', [WORKERS]: '0', [SLOTS]: '5' }
const NOT_WHOLE = { [BUS]: 'made-up-not-a-number', [RUNTIME]: 'made-up-runtime' }
const WIDTHS = [390, 1440]
type Setting = { name: string; value: string | null; source: string; chosen: string | null; unreadable: string | null; shippedValue: string | null; storedButRefused: { value: string; reason: string } | null; whatValues: Record<string, string | number> }

let app: LiveApp, db: TestDb
beforeAll(async () => {
  db = await freshDb()
  app = await liveApp({ name: 'refused-running-number', database: db.file, workspace: 'default', viewport: { width: 1440, height: 1100 } })
  await app.context.addInitScript(({ person }) => {
    localStorage.setItem('mole-office.actor', JSON.stringify({ type: 'human', id: person }))
    localStorage.setItem('mole-office.preset.theme', new URLSearchParams(location.search).get('look') ?? 'light')
    localStorage.setItem('mole-office.mode', 'normal')
  }, { person: THE_TEST_OFFICES_OWNER.id })
}, 240_000)
afterAll(async () => { await app?.stop(); db?.close() }, 120_000)

/**
 * Put the one office's saved rows back to what this case needs. The rows are written directly into its
 * database, as an older release or a hand edit would have left them, and the case's own page then reads them.
 */
function resetSavedValues(rows: Record<string, string>, deadLetterCount: number | null = null) {
  const sqlite = db.client.sqlite
  sqlite.prepare(`DELETE FROM runtime_settings WHERE name IN (${RESET_NAMES.map(() => '?').join(',')})`).run(...RESET_NAMES)
  // The column is INTEGER with a check above nought, and SQLite keeps 2.5 in it as written. NULL is the shipped count.
  sqlite.prepare('UPDATE installation SET dead_letter_after_count = ? WHERE only_row = 1').run(deadLetterCount)
  for (const [name, value] of Object.entries(rows)) sqlite.prepare('INSERT INTO runtime_settings(name,value) VALUES (?,?)').run(name, value)
}

/**
 * Load a page in a document of its own, so the mode the address or the stored choice names is read
 * again. Changing only the hash keeps the document, and the mode pressed in the case before it.
 */
async function load(page: Page, url: string) {
  await page.goto('about:blank')
  await page.goto(url)
  await waitForThePage(page, 60_000)
}

async function settings(): Promise<Setting[]> {
  const reply = await fetch(app.api + '/api/office/settings', { headers })
  expect(reply.status).toBe(200)
  return (await reply.json() as { settings: Setting[] }).settings
}
const one = (all: Setting[], name: string) => all.find((s) => s.name === name)!

/** Every setting answers the field, and only the named ones carry a refusal. */
function onlyTheseAreRefused(all: Setting[], refused: Record<string, string>) {
  for (const s of all) expect(s, s.name).toHaveProperty('storedButRefused')
  expect(Object.fromEntries(all.filter((s) => s.storedButRefused !== null).map((s) => [s.name, s.storedButRefused!.reason]))).toEqual(refused)
}

/** The block Settings draws in Normal mode for the saved values this release refuses. */
const theBlock = (page: Page) => page.locator('[data-refused-saved-settings]')

/** The description Settings draws for a setting: its own settings word, with the reading's values filled in. */
function itsDescription(s: Setting): string {
  return createI18n('en').t(`settingsWords.${s.name}` as WordKey, s.whatValues)
}

/**
 * In Normal mode Settings draws the refused-saved block and no Office controls. The controls' old Settings address
 * leads to their own page (wave 13y round 125), which in Normal mode draws the switch between the modes and no
 * panel, and that page's own Developer press draws the panel. The block is what reaches the person, so its absence
 * in Normal mode is a failure here.
 */
async function reachTheControlsByTheModeSwitch(page: Page) {
  await page.setViewportSize({ width: 1440, height: 1100 })
  await load(page, app.site + '/?lang=en&look=light#/settings')
  await theBlock(page).waitFor()
  expect(await page.locator('.orc-setting').count()).toBe(0)
  expect(await page.locator('[data-target="uiSurface/settings.officecontrols"]').count()).toBe(0)
  await load(page, app.site + '/?lang=en&look=light#/settings/officecontrols')
  await expect.poll(() => new URL(page.url()).hash).toBe('#/office-controls')
  const normal = page.getByRole('button', { name: 'Normal', exact: true })
  await normal.waitFor(); expect(await normal.getAttribute('aria-pressed')).toBe('true')
  const panel = page.locator('[data-target="uiSurface/settings.officecontrols"]')
  expect(await panel.count()).toBe(0)
  expect(await page.locator('.orc-setting').count()).toBe(0)
  expect(await page.getByLabel('Find a setting', { exact: true }).count()).toBe(0)
  await page.getByRole('button', { name: 'Developer', exact: true }).click()
  await panel.locator('.orc-setting').first().waitFor()
  return panel
}

/**
 * Settings draws no block in Developer mode. Since wave 13y round 125 the Office controls panel is on a page of its
 * own, where the block is never drawn, so Settings itself is read: the block is drawn in Normal mode and goes at the
 * page's own Developer press.
 */
async function theBlockGoesAtTheDeveloperPressOnSettings(page: Page) {
  await load(page, app.site + '/?lang=en&look=light#/settings')
  await theBlock(page).waitFor()
  await openSettingsPanel(page, 'settings.mode')
  await page.getByRole('button', { name: 'Developer', exact: true }).click()
  await expect.poll(() => theBlock(page).count()).toBe(0)
}

/** The block's own press, with a reason written first, puts one refused value right; that setting's part then goes. */
async function putRightByTheBlock(page: Page, name: string, press: 'Reset to shipped value' | 'Remove saved value', after: string | null) {
  const setting = theBlock(page).locator(`[data-setting=${name}]`)
  await setting.waitFor()
  const notice = setting.locator('[data-stored-refused]')
  expect(await notice.getAttribute('role')).toBe('status')
  const button = notice.getByRole('button', { name: press, exact: true })
  expect(await button.count()).toBe(1)
  expect(await button.isDisabled(), `${name}: the press is off until a reason is written`).toBe(true)
  await setting.getByLabel('Why change this?', { exact: true }).fill('Made-up proof: put back what this release accepts')
  await button.click()
  await expect.poll(async () => { const s = one(await settings(), name); return { chosen: s.chosen, refused: s.storedButRefused } }, { timeout: 15_000 }).toEqual({ chosen: after, refused: null })
  await expect.poll(() => setting.count()).toBe(0)
}

/** The row's notice names the value and the reason; its own press, with a reason, takes the refused value away. */
async function putRightByItsNotice(page: Page, name: string, says: string[], press: 'Reset to shipped value' | 'Remove saved value', after: string | null) {
  const row = page.locator(`[data-setting=${name}]`)
  // The row is open without a press, so the notice is read at once.
  expect(await row.getAttribute('open'), name).not.toBeNull()
  const notice = row.locator('[data-stored-refused]')
  expect(await notice.getAttribute('role')).toBe('status')
  for (const words of says) expect(await notice.innerText(), name).toContain(words)
  // The press is drawn once, in the notice.
  expect(await row.getByRole('button', { name: press, exact: true }).count()).toBe(1)
  await row.getByLabel('Why change this?', { exact: true }).fill('Made-up proof: put back what this release accepts')
  await notice.getByRole('button', { name: press, exact: true }).click()
  await expect.poll(async () => { const s = one(await settings(), name); return { chosen: s.chosen, refused: s.storedButRefused } }, { timeout: 15_000 }).toEqual({ chosen: after, refused: null })
  await expect.poll(() => row.locator('[data-stored-refused]').count()).toBe(0)
  expect(await row.getAttribute('open'), name).not.toBeNull()
  expect(await row.getByRole('button', { name: press, exact: true }).count()).toBe(1)
}

describe('a saved bus cap over its bound, and a test-worker count under its least', () => {
  it('names each refused value with its reason, and keeps the value and source as stored', async () => {
    resetSavedValues(OVER)
    const all = await settings()
    onlyTheseAreRefused(all, { [BUS]: 'The merge bus may hold between 1 and 64 entries.', [WORKERS]: POSITIVE })
    expect(one(all, BUS)).toMatchObject({ value: '65', source: 'the office database', chosen: '65', unreadable: null, storedButRefused: { value: '65', reason: 'The merge bus may hold between 1 and 64 entries.' } })
    expect(one(all, WORKERS)).toMatchObject({ value: '0', source: 'the office database', chosen: '0', storedButRefused: { value: '0', reason: POSITIVE } })
    // A saved value the check accepts, and a setting with nothing saved, carry no refusal.
    expect(one(all, SLOTS)).toMatchObject({ value: '5', source: 'the office database', chosen: '5', storedButRefused: null })
    expect(one(all, 'MOLE_OFFICE_WORKER_RUNS')).toMatchObject({ chosen: null, storedButRefused: null })
  })

  it('draws the notice at 390 and 1440 in the light theme', async () => {
    resetSavedValues(OVER)
    const folder = process.env.W13R_FIX_NUMBERS_SHOTS
    if (folder) mkdirSync(folder, { recursive: true })
    const page = app.page
    // Two widths, where the claims are: 390 for overflow and 1440 for the notice's shape.
    for (const width of WIDTHS) {
      const theme = 'light'
      await page.setViewportSize({ width, height: 1100 })
      await load(page, `${app.site}/?lang=en&mode=inspect&look=${theme}#/settings/officecontrols`)
      await expect.poll(() => page.locator('html').getAttribute('data-theme')).toBe(theme)
      const panel = page.locator('[data-target="uiSurface/settings.officecontrols"]')
      await panel.getByLabel('Find a setting', { exact: true }).fill('BUS_MOST_ENTRIES')
      const notice = panel.locator(`[data-setting=${BUS}] [data-stored-refused]`)
      await notice.waitFor()
      expect(await notice.innerText()).toContain('This release refuses the saved value “65”.')
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width} ${theme}`).toBe(true)
      const box = (await notice.boundingBox())!
      expect(box.x + box.width, `${width} ${theme}`).toBeLessThanOrEqual(width)
      if (folder) {
        await putTheMadeUpLabelIn(page, 'Made-up test office — a saved bus cap this release refuses', page.locator(`[data-setting=${BUS}]`), 'the Office controls page')
        await page.screenshot({ path: `${folder}/officecontrols-refused-number-${width}-${theme}.png`, fullPage: false })
      }
    }
  }, 240_000)

  it('draws the normal-mode block at four widths in both themes', async () => {
    resetSavedValues(OVER)
    const folder = process.env.W13R_FIX_NUMBERS_SHOTS
    if (!folder) return
    mkdirSync(folder, { recursive: true })
    const page = app.page
    for (const width of WIDTHS) for (const theme of ['light', 'dark']) {
      await page.setViewportSize({ width, height: 1100 })
      // Normal mode: no mode=inspect, so the block is what a person meets and the Office controls panel is not drawn.
      await load(page, `${app.site}/?lang=en&look=${theme}#/settings`)
      await expect.poll(() => page.locator('html').getAttribute('data-theme')).toBe(theme)
      const block = theBlock(page)
      await block.waitFor()
      // Both refused settings are in the picture, with their description, their reason field and their press.
      expect(await block.locator('[data-setting]').count()).toBe(2)
      await putTheMadeUpLabelIn(page, 'Made-up test office — a saved bus cap this release refuses', block, 'the Settings page')
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width} ${theme}`).toBe(true)
      const box = (await block.boundingBox())!
      expect(box.x + box.width, `${width} ${theme}`).toBeLessThanOrEqual(width)
      await page.evaluate(() => window.scrollTo(0, 0))
      // The whole block is in the picture: a whole-page shot, so a phone also shows both settings and their presses.
      await page.screenshot({ path: `${folder}/settings-refused-saved-normal-${width}-${theme}.png`, fullPage: true })
    }
  }, 300_000)

  it('draws no refused-saved block in Developer mode, where the values are present', async () => {
    resetSavedValues(OVER)
    const page = app.page
    await page.setViewportSize({ width: 1440, height: 1100 })
    await load(page, `${app.site}/?lang=en&mode=inspect#/settings/officecontrols`)
    const panel = page.locator('[data-target="uiSurface/settings.officecontrols"]')
    await panel.getByLabel('Find a setting', { exact: true }).fill('BUS_MOST_ENTRIES')
    await panel.locator('.orc-setting').first().waitFor()
    // The row draws the notice; the Normal-mode block is not drawn, so no press is drawn twice.
    expect(await panel.locator(`[data-setting=${BUS}] [data-stored-refused]`).count()).toBe(1)
    expect(await theBlock(page).count()).toBe(0)
    await theBlockGoesAtTheDeveloperPressOnSettings(page)
  }, 120_000)

  it('puts a refused value right in Normal mode by the block’s own press, and the block goes when none is left', async () => {
    // The rows are put back first, so this case starts with both refusals however the case before it ended.
    resetSavedValues(OVER)
    const page = app.page
    await page.setViewportSize({ width: 1440, height: 1100 })
    await load(page, app.site + '/?lang=en&look=light#/settings')
    const block = theBlock(page)
    await block.waitFor()
    const all = await settings()
    // The block names each refused setting by its own description, in the reading's order, and holds no part for a
    // setting the check accepts.
    const refusedInOrder = all.filter((s) => s.storedButRefused !== null).map((s) => s.name)
    expect(refusedInOrder).toEqual([BUS, WORKERS])
    expect(await block.locator('[data-setting]').evaluateAll((nodes) => nodes.map((n) => n.getAttribute('data-setting')))).toEqual(refusedInOrder)
    expect(await block.innerText()).toContain(itsDescription(one(all, BUS)))
    expect(await block.innerText()).toContain(itsDescription(one(all, WORKERS)))
    expect(await block.locator(`[data-setting=${SLOTS}]`).count()).toBe(0)
    // The shipped value is read from the reading, never typed.
    const shippedBus = one(all, BUS).shippedValue
    expect(shippedBus).not.toBeNull()
    await putRightByTheBlock(page, BUS, 'Reset to shipped value', shippedBus)
    const shippedWorkers = one(await settings(), WORKERS).shippedValue
    expect(shippedWorkers).not.toBeNull()
    await putRightByTheBlock(page, WORKERS, 'Reset to shipped value', shippedWorkers)
    await expect.poll(() => block.count()).toBe(0)
    onlyTheseAreRefused(await settings(), {})
  }, 240_000)

  it('puts the shipped value back by the press in each notice, after the page’s own Developer press', async () => {
    resetSavedValues(OVER)
    const page = app.page
    await reachTheControlsByTheModeSwitch(page)
    // A saved value the check accepts draws no notice and is not opened.
    expect(await page.locator(`[data-setting=${SLOTS}] [data-stored-refused]`).count()).toBe(0)
    expect(await page.locator(`[data-setting=${SLOTS}]`).getAttribute('open')).toBeNull()
    await putRightByItsNotice(page, BUS, ['This release refuses the saved value “65”.', 'The merge bus may hold between 1 and 64 entries.', 'The shipped value is 8.'], 'Reset to shipped value', '8')
    await putRightByItsNotice(page, WORKERS, ['This release refuses the saved value “0”.', POSITIVE, 'The shipped value is 8.'], 'Reset to shipped value', '8')
    onlyTheseAreRefused(await settings(), {})
  }, 180_000)
})

describe('a saved bus cap that is not a number, a dead-letter count that is not whole, and a runtime nobody dispatches', () => {
  it('draws no refused-saved block in Developer mode, where the values are present', async () => {
    resetSavedValues(NOT_WHOLE, 2.5)
    const page = app.page
    expect(await settings()).toContainEqual(expect.objectContaining({ name: BUS, storedButRefused: expect.objectContaining({ value: 'made-up-not-a-number' }) }))
    await page.setViewportSize({ width: 1440, height: 1100 })
    await load(page, `${app.site}/?lang=en&mode=inspect#/settings/officecontrols`)
    const panel = page.locator('[data-target="uiSurface/settings.officecontrols"]')
    await panel.getByLabel('Find a setting', { exact: true }).fill('CHORE_RUNTIME')
    await panel.locator('.orc-setting').first().waitFor()
    expect(await panel.locator(`[data-setting=${RUNTIME}] [data-stored-refused]`).count()).toBe(1)
    expect(await theBlock(page).count()).toBe(0)
    await theBlockGoesAtTheDeveloperPressOnSettings(page)
  }, 120_000)

  it('names each refused value, the dead-letter pair from its own table too, and puts each right by its notice', async () => {
    resetSavedValues(NOT_WHOLE, 2.5)
    const all = await settings()
    onlyTheseAreRefused(all, { [BUS]: POSITIVE, [COUNT]: POSITIVE, [RUNTIME]: 'Choose a runtime the message worker can dispatch.' })
    expect(one(all, BUS)).toMatchObject({ value: 'made-up-not-a-number', source: 'the office database', chosen: 'made-up-not-a-number', storedButRefused: { value: 'made-up-not-a-number', reason: POSITIVE } })
    expect(one(all, COUNT)).toMatchObject({ value: '2.5', source: 'the office database', chosen: '2.5', storedButRefused: { value: '2.5', reason: POSITIVE } })
    expect(one(all, RUNTIME)).toMatchObject({ value: 'made-up-runtime', source: 'the office database', shippedValue: null, storedButRefused: { value: 'made-up-runtime', reason: 'Choose a runtime the message worker can dispatch.' } })
    const page = app.page
    await reachTheControlsByTheModeSwitch(page)
    await putRightByItsNotice(page, BUS, ['This release refuses the saved value “made-up-not-a-number”.', POSITIVE, 'The shipped value is 8.'], 'Reset to shipped value', '8')
    await putRightByItsNotice(page, COUNT, ['This release refuses the saved value “2.5”.', POSITIVE, 'The shipped value is 20.'], 'Reset to shipped value', '20')
    // A setting with no shipped value has no Reset press, so its notice holds the press that removes the saved value.
    expect(await page.locator(`[data-setting=${RUNTIME}] [data-stored-refused]`).innerText()).not.toContain('The shipped value is')
    await putRightByItsNotice(page, RUNTIME, ['This release refuses the saved value “made-up-runtime”.', 'Choose a runtime the message worker can dispatch.'], 'Remove saved value', null)
    onlyTheseAreRefused(await settings(), {})
  }, 240_000)

  it('removes a refused value with no shipped value in Normal mode, and the block stays for the rest', async () => {
    // The rows are put back first, so this case starts with both refusals however the case before it ended.
    resetSavedValues(NOT_WHOLE, 2.5)
    const page = app.page
    await page.setViewportSize({ width: 1440, height: 1100 })
    await load(page, app.site + '/?lang=en&look=light#/settings')
    const block = theBlock(page)
    await block.waitFor()
    const all = await settings()
    expect(one(all, RUNTIME)).toMatchObject({ shippedValue: null, storedButRefused: { value: 'made-up-runtime' } })
    expect(await block.innerText()).toContain(itsDescription(one(all, RUNTIME)))
    await putRightByTheBlock(page, RUNTIME, 'Remove saved value', null)
    // This setting's part is gone, and the block stays for the values still refused.
    expect(await block.locator(`[data-setting=${RUNTIME}]`).count()).toBe(0)
    expect(await block.count()).toBe(1)
  }, 240_000)
})
