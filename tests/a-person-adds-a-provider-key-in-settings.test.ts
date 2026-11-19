// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { BrowserContext, Locator, Page } from 'playwright'
import { afterAll, beforeAll, expect, it } from 'vitest'
import providers from '../src/config/provider-setup/providers.json'
import { replacementRefusal } from '../src/config/provider-setup/private-key.mjs'
import { trialSays } from '../src/config/provider-setup/trial-words.mjs'
import { createProviderKeySetup, type ProviderSetupRow } from '../src/server/lib/provider-key-setup.ts'
import { sayInEnglish } from '../src/shared/i18n.ts'
import { settingsControlWord } from '../src/shared/settings-declaration.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'

const sample = 'sample_FAKE_ONLY_531972'
const shots = process.env.BI_PROVIDER_SHOTS
const control = (key: string) => sayInEnglish(settingsControlWord('settings.providerkeys', key))
const resend = providers.find((row) => row.id === 'resend')!
let app: LiveApp
type TrialReply = { outcome: string; says: string }
/** The reply Settings' service gives a broader key, in the service's own words. */
const tooBroad: TrialReply = { outcome: 'too-broad', says: trialSays('too-broad', 200) }
/** The reply Settings' service gives a provider with no trial, asked of the service itself in beforeAll. */
let notTested: TrialReply
/** What the stand-in doors answer: the real list (with saving available or not), and a save or trial reply. */
const doors = { savingAvailable: undefined as boolean | undefined, keyExists: false, trialAvailable: false, posted: [] as { value?: string; replace?: boolean }[], trial: tooBroad }
async function standIn(target: Page | BrowserContext) {
  let replyHeaders: Record<string, string> = {}
  await target.route('**/api/settings/provider-keys', async (route) => {
    if (route.request().method() !== 'POST') {
      const response = await route.fetch()
      replyHeaders = Object.fromEntries(Object.entries(response.headers()).filter(([name]) => !['content-length', 'content-encoding', 'content-type'].includes(name)))
      const list = await response.json() as { savingAvailable: boolean }
      return route.fulfill({ status: response.status(), headers: replyHeaders, json: doors.savingAvailable === undefined ? list : { ...list, savingAvailable: doors.savingAvailable } })
    }
    const body = route.request().postDataJSON() as { value?: string; replace?: boolean; lang?: 'en' | 'zh' }
    doors.posted.push({ value: body.value, replace: body.replace })
    if (doors.keyExists && body.replace !== true) return route.fulfill({ status: 409, headers: replyHeaders, json: { error: replacementRefusal(body.lang).message } })
    await route.fulfill({ status: 200, headers: replyHeaders, json: { saved: true, trialAvailable: doors.trialAvailable } })
  })
  await target.route('**/api/settings/provider-keys/trial', (route) => route.fulfill({ status: 200, headers: replyHeaders, json: doors.trial }))
}
beforeAll(async () => {
  // A row with no trial is answered before any key or home is read, so the home named here is never made.
  const service = createProviderKeySetup({ home: join(tmpdir(), 'provider-key-panel-home-never-made'), providers: [{ ...resend, trial: null } as ProviderSetupRow] })
  notTested = await service.trial(resend.id)
  app = await liveApp({ name: 'provider-key-panel', workspace: 'default', viewport: { width: 1440, height: 1000 } })
  await standIn(app.page)
}, 240_000)
afterAll(async () => { await app?.stop() })
async function open(page: Page, language = 'en', provider?: string): Promise<Locator> {
  await page.goto('about:blank')
  await page.goto(`${app.site}/?lang=${language}#/settings/providerkeys`)
  await waitForThePage(page, 30000)
  const panel = page.locator('[data-settings-panel="settings.providerkeys"]')
  await panel.waitFor({ timeout: 10000 })
  if (provider) await panel.locator('select').selectOption(provider)
  return panel
}
const replaceBox = (panel: Locator) => panel.locator('input[type=checkbox]')

it('offers the table providers and clears the hidden key after save, and never draws it back', async () => {
  Object.assign(doors, { savingAvailable: undefined, keyExists: false, trialAvailable: false, posted: [] })
  const panel = await open(app.page)
  const choices = await panel.locator('select option').allTextContents()
  expect(choices.includes(providers[0]!.name)).toBe(true)
  expect(await panel.getByText(sayInEnglish('providerSetup.windows')).count()).toBe(0)
  expect(await replaceBox(panel).count()).toBe(0)
  const input = panel.getByLabel(control('providerSetup.key'), { exact: true })
  expect(await input.getAttribute('type')).toBe('password')
  await input.fill(sample)
  await panel.getByRole('button', { name: control('providerSetup.save') }).click()
  await expect.poll(() => doors.posted.at(-1)?.value).toBe(sample)
  await expect.poll(async () => (await input.inputValue()) === '').toBe(true)
  expect((await panel.innerHTML()).includes(sample)).toBe(false)
}, 90000)

it('says saving is not available only where the office says so', async () => {
  doors.savingAvailable = false
  const panel = await open(app.page)
  await expect.poll(() => panel.getByText(sayInEnglish('providerSetup.windows')).count()).toBe(1)
  doors.savingAvailable = undefined
}, 90000)

it('offers to replace a key only after the office says one is saved, and sends the replacement when it is ticked', async () => {
  Object.assign(doors, { keyExists: true, trialAvailable: true, posted: [] })
  const panel = await open(app.page, 'en', resend.id)
  const input = panel.getByLabel(control('providerSetup.key'), { exact: true })
  const trialButton = panel.getByRole('button', { name: control('providerSetup.test') })
  // The trial paragraph says what the trial button does, so it is drawn only beside that button.
  const trialWords = panel.getByText(resend.trialDescription, { exact: true })
  expect(await replaceBox(panel).count()).toBe(0)
  await input.fill(sample)
  await panel.getByRole('button', { name: control('providerSetup.save') }).click()
  await expect.poll(() => panel.getByRole('alert').textContent()).toBe(replacementRefusal().message)
  await expect.poll(() => replaceBox(panel).count()).toBe(1)
  expect(doors.posted).toEqual([{ value: sample, replace: false }])
  expect(await trialButton.count()).toBe(0)
  expect(await trialWords.count()).toBe(0)
  await panel.getByLabel(control('providerSetup.replace')).check()
  await panel.getByRole('button', { name: control('providerSetup.save') }).click()
  await expect.poll(() => doors.posted.length).toBe(2)
  expect(doors.posted[1]).toEqual({ value: sample, replace: true })
  await expect.poll(() => replaceBox(panel).count()).toBe(0)
  await expect.poll(() => trialWords.count()).toBe(1)
  await trialButton.click()
  await expect.poll(() => panel.getByRole('alert').textContent()).toBe(sayInEnglish('providerSetup.tooBroad'))
  // A too-broad answer proves a key is saved, so the replacement is offered at once, without another refused save.
  await expect.poll(() => replaceBox(panel).count()).toBe(1)
  expect(doors.posted).toHaveLength(2)
  expect((await panel.innerHTML()).includes(sample)).toBe(false)
  doors.keyExists = false
}, 90000)

it('draws the pass words only for a pass, and the office\'s own words, as a fault, for a trial that did not run', async () => {
  expect(notTested.outcome).toBe('not-tested')
  Object.assign(doors, { savingAvailable: undefined, keyExists: false, trialAvailable: true, posted: [], trial: notTested })
  const panel = await open(app.page, 'en', resend.id)
  const passWords = panel.getByText(sayInEnglish('providerSetup.savedTrial'), { exact: true })
  await panel.getByLabel(control('providerSetup.key'), { exact: true }).fill(sample)
  await panel.getByRole('button', { name: control('providerSetup.save') }).click()
  const trialButton = panel.getByRole('button', { name: control('providerSetup.test') })
  await trialButton.click()
  await expect.poll(() => panel.getByRole('alert').textContent()).toBe(notTested.says)
  expect(await passWords.count()).toBe(0)
  expect(await panel.getByRole('status').count()).toBe(0)
  // A pass still reads as one.
  doors.trial = { outcome: 'passed', says: trialSays('passed', 401) }
  await trialButton.click()
  await expect.poll(() => passWords.count()).toBe(1)
  expect(await panel.getByRole('alert').count()).toBe(0)
  doors.trial = tooBroad
}, 90000)

it('photographs the Resend panel as it offers a replacement, as it says a key is too broad and as it says a trial did not run, in both themes', async () => {
  if (!shots) return
  mkdirSync(shots, { recursive: true })
  for (const width of [1440, 990, 660, 390]) for (const language of width === 1440 || width === 390 ? ['en', 'zh'] : ['en']) {
    for (const state of ['replace', 'too-broad', 'not-tested']) {
      const hashes: string[] = []
      for (const theme of ['light', 'dark']) {
        const context = await app.browser.newContext({ viewport: { width, height: 1000 } })
        try {
          Object.assign(doors, { savingAvailable: undefined, keyExists: state !== 'not-tested', trialAvailable: true, posted: [], trial: state === 'not-tested' ? notTested : tooBroad })
          await standIn(context)
          await context.addInitScript((look) => localStorage.setItem('mole-office.preset.theme', look), theme)
          const page = await context.newPage()
          const panel = await open(page, language, resend.id)
          expect(await page.locator('html').getAttribute('data-theme')).toBe(theme)
          await panel.locator('input[type=password]').fill(sample)
          await panel.locator('.pks-actions button').first().click()
          if (state === 'not-tested') {
            await panel.locator('.pks-actions button').nth(1).click()
            await panel.getByRole('alert').getByText(notTested.says).waitFor({ timeout: 10000 })
          } else await replaceBox(panel).waitFor({ timeout: 10000 })
          if (state === 'too-broad') {
            await replaceBox(panel).check()
            await panel.locator('.pks-actions button').first().click()
            await replaceBox(panel).waitFor({ state: 'detached', timeout: 10000 })
            await panel.locator('.pks-actions button').nth(1).click()
            await panel.getByRole('alert').getByText(sayInEnglish('providerSetup.tooBroad')).waitFor({ timeout: 10000 })
          }
          expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
          // After a refused save the typed key stays in its hidden field, to be sent again with the box ticked; after a save it is gone.
          if (state === 'replace') expect(await panel.locator('input[type=password]').inputValue()).toBe(sample)
          else expect((await page.content()).includes(sample)).toBe(false)
          await panel.getByRole('alert').scrollIntoViewIfNeeded()
          const path = join(shots, `provider-${state}-${width}-${language}-${theme}.png`)
          await page.screenshot({ path })
          hashes.push(createHash('sha256').update(readFileSync(path)).digest('hex'))
        } finally { await context.close() }
      }
      expect(hashes[0]).not.toBe(hashes[1])
    }
  }
  Object.assign(doors, { keyExists: false, trial: tooBroad })
}, 600000)
