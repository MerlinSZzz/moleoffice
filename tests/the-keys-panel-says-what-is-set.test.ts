// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SETTINGS PAGE SHOWS WHICH KEYS THIS OFFICE HAS. Criterion U2, the drawing half.
 *
 * ---------------------------------------------------------------------------------------
 * WHY A REAL BROWSER
 * ---------------------------------------------------------------------------------------
 *
 * The claim is about what is on a screen: the office's own two keys each with a box and a press;
 * the sandboxes' logins; the protection said in the operating system's own terms; and never a value
 * anywhere. So it is measured on a screen.
 * Each coding tool's line moved to the Coding tools panel, proved by tests/settings-draws-one-line-per-coding-tool-with-its-set-up-press.test.ts.
 *
 * ---------------------------------------------------------------------------------------
 * NO KEY VALUE IS EVER DRAWN, AND THE PROVIDER IS NEVER REACHED
 * ---------------------------------------------------------------------------------------
 *
 * The value typed here is made up. It is written through the page, and the assertions below search
 * the whole page and the door's replies for it. The test press is driven only with nothing set, so
 * the server refuses it before it would send anything to a provider: this file reaches no provider
 * over the network. The refused press is one of the three states photographed.
 *
 * THE SUMMONS MAIL'S THREE SETTINGS WERE DRAWN IN THE SAME SECTION until the mail left the office for the mail
 * tool, on two decisions. The case that set them went with them.
 *
 * ---------------------------------------------------------------------------------------
 * THE PICTURES
 * ---------------------------------------------------------------------------------------
 *
 * Set KEYS_SHOTS to a directory and this file photographs the section at 1440, 990, 660 and 390 in
 * light and dark, in three states: nothing set, a press that was refused, and one provider set.
 * Without the variable it photographs nothing and still asserts everything.
 */

import { mkdirSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { t } from '../src/shared/i18n.ts'

let app: LiveApp

/** A value that is obviously made up, so a picture of it could never be mistaken for a real key. */
const A_MADE_UP_KEY = 'not-a-real-key-1234'

/** Open the Settings page and wait for the keys section to have drawn. */
async function openTheSettings(): Promise<void> {
  await app.page.goto(`${app.site}/?mode=inspect#/settings/keys`)
  await app.page.reload()
  await waitForThePage(app.page, 30_000)
  await app.page.waitForSelector('[data-target="uiSurface/settings.keys"] .keys', { timeout: 20_000 })
}

/** The whole section's text, as a person reads it. */
async function theSectionText(): Promise<string> {
  return app.page.$eval('[data-target="uiSurface/settings.keys"]', (one) => one.textContent ?? '')
}

/**
 * PHOTOGRAPH THE SECTION AT THE FOUR WIDTHS AND IN BOTH THEMES, when `KEYS_SHOTS` names a directory.
 *
 * The four widths are chapter 6's: the rem breakpoints at 40rem and 60rem cut the range into three
 * bands, so 1440 and 390 alone leave the middle unphotographed. The three states are taken in the
 * order the test drives them.
 */
async function photograph(state: string): Promise<void> {
  const dir = process.env['KEYS_SHOTS']
  if (!dir) return
  mkdirSync(dir, { recursive: true })
  const panel = app.page.locator('[data-target="uiSurface/settings.keys"]')
  for (const width of [1440, 990, 660, 390]) {
    for (const theme of ['light', 'dark'] as const) {
      await app.page.setViewportSize({ width, height: 1000 })
      await app.page.emulateMedia({ colorScheme: theme })
      await panel.screenshot({ path: `${dir}/keys-${state}-${String(width)}-${theme}.png` })
    }
  }
  await app.page.setViewportSize({ width: 1440, height: 1000 })
  await app.page.emulateMedia({ colorScheme: 'light' })
}

beforeAll(async () => {
  app = await liveApp({ name: 'the-keys-panel', viewport: { width: 1440, height: 1000 } })
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

describe('the keys section draws the office’s own two keys and the sandboxes’ logins', () => {
  it('draws the title, the protection, the two office keys and the sandboxes’ logins', async () => {
    await openTheSettings()

    const title = await app.page.$eval(
      '[data-target="uiSurface/settings.keys"] .px-panel-title',
      (one) => one.textContent ?? '',
    )
    expect(title.trim()).toBe('Keys and runtimes')

    // THE PROTECTION IS SAID IN THE SYSTEM'S OWN TERMS, and the Windows branch is called unverified.
    const section = await theSectionText()
    expect(section).toContain('unverified on Windows')
    expect(section.toLowerCase()).not.toContain('encrypted')

    // THE OFFICE'S OWN TWO, each drawn not set before anything is written.
    const labels = await app.page.$$eval('.keys-row[data-key] .keys-label', (all) =>
      all.map((one) => one.textContent ?? ''),
    )
    expect(labels).toEqual(['OpenRouter', 'Moonshot'])
    const officeStates = await app.page.$$eval('.keys-row[data-key]', (all) =>
      all.map((one) => one.textContent ?? ''),
    )
    for (const state of officeStates) expect(state).toContain('not set')

    // THE SANDBOXES' LOGINS, one row for each login the templates declare, each drawn set or not
    // set. Nothing is pressed here: the file they write is under the runner's own home.
    const logins = await app.page.$$eval('.keys-row[data-login]', (all) =>
      all.map((one) => ({ name: one.getAttribute('data-login') ?? '', text: one.textContent ?? '' })),
    )
    expect(logins.map((one) => one.name)).toContain('OPENCODE_API_KEY')
    for (const one of logins) expect(/Set|not set/.test(one.text), `${one.name} draws no honest answer`).toBe(true)

    await photograph('nothing-set')
  }, 120_000)

  it('refuses a test press when no key is set, without reaching any provider', async () => {
    await openTheSettings()
    await app.page.click('.keys-row[data-key="openrouter"] .keys-test')
    await app.page.waitForSelector('.keys-row[data-key="openrouter"] .keys-refuse', { timeout: 20_000 })
    const refused = await app.page.$eval(
      '.keys-row[data-key="openrouter"] .keys-refuse',
      (one) => one.textContent ?? '',
    )
    expect(refused).toBe(t('settingsPanel.keys.tested.refused'))
    // THE SERVER'S OWN SENTENCE, in Developer mode, which this file opens in: no key was there to test.
    const said = await app.page.$eval(
      '.keys-row[data-key="openrouter"] .px-server-note',
      (one) => one.textContent ?? '',
    )
    expect(said).toContain('No OpenRouter key is set')
    await photograph('refused')
  }, 120_000)

  it('writes a made-up key, clears the box, and never draws the value', async () => {
    await openTheSettings()
    const box = '.keys-row[data-key="moonshot"] .keys-input'
    await app.page.fill(box, A_MADE_UP_KEY)
    await app.page.click('.keys-row[data-key="moonshot"] .keys-set')
    await app.page.waitForFunction(
      (selector) => (document.querySelector(selector) as HTMLInputElement | null)?.value === '',
      box,
      { timeout: 20_000 },
    )
    // THE OFFICE'S OWN FILE IS WHAT GAINED IT, so the state is a reading and not a local flag.
    const reply = await fetch(`${app.api}/api/office/keys`, {
      headers: { 'x-mole-office-workspace': 'default' },
    })
    expect(reply.status, await reply.clone().text()).toBe(200)
    const body = await reply.text()
    expect(body).toContain('"provider":"moonshot"')
    expect(body).not.toContain(A_MADE_UP_KEY)

    const section = await theSectionText()
    expect(section).not.toContain(A_MADE_UP_KEY)
    const moonshot = await app.page.$eval('.keys-row[data-key="moonshot"]', (one) => one.textContent ?? '')
    expect(moonshot).toContain('Set')
    await photograph('one-set')
  }, 120_000)
})
