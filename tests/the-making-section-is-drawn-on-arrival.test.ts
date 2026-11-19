// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * CRITERION B33: A PRESS ON A READING SHOWS IT, AND NOTHING ASKS TO CHOOSE FIRST.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS ASKED FOR
 * ---------------------------------------------------------------------------------------
 *
 * On report `u9_a7rjYnz5V`: the *Choose a reading* press was to go, and a press was to show its
 * reading straight away.
 *
 * `design/bundle/ACCEPTANCE.md`, criterion B33. The making section is drawn on arrival, the press
 * that said *Choose a reading* is gone, and choosing a reading in the menu shows that reading in
 * place with no second press.
 *
 * ---------------------------------------------------------------------------------------
 * THE TWO ARRIVAL RULES, AND WHY THEY DO NOT FIGHT
 * ---------------------------------------------------------------------------------------
 *
 * Drawing a control costs no request. What costs a request is producing a reading, and that happens
 * on a person's press: choosing a preset, choosing a record, or the read-again press. So the page
 * opens on the controls with no reading, and the first press produces one.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE PINS
 * ---------------------------------------------------------------------------------------
 *
 *   1. THE SECTION IS ON THE PAGE ON ARRIVAL, with no *Choose a reading* press and no reading.
 *   2. OPENING THE PAGE ASKS THE SERVER FOR NOTHING. A page that read on arrival would be asking
 *      for a reading nobody asked for.
 *   3. CHOOSING A READING SHOWS IT, in one press, and the server is asked exactly once.
 *   4. CHOICES THAT CANNOT BE READ ASK THE SERVER NOTHING, and the page says what is needed: a
 *      record scope with no record chosen, and the list preset with no part ticked.
 *
 * MUTATION, MEASURED 15 SEPTEMBER 2026, after a control run of this file green: in
 * `src/web/components/BundlePanel.tsx`, put the making section back behind a press — restore the
 * `choosing` state and render the *Choose a reading* button in place of the controls. Test 1 and
 * test 2 go red: the controls are not on the page on arrival. Restored, all pass.
 */
import type { Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { liveApp, type LiveApp } from './helpers.ts'
import { createI18n } from '../src/shared/i18n.ts'

let app: LiveApp
let page: Page
const en = createI18n('en')
/** Every request this page has made to the door that produces a reading. */
const readingsAsked: string[] = []

beforeAll(async () => {
  app = await liveApp({ name: 'bundle-arrival', viewport: { width: 1440, height: 1000 } })
  page = app.page
  page.on('request', (request) => {
    if (request.url().includes('/api/bundles/preview')) readingsAsked.push(request.url())
  })
  for (let i = 0; i < 6; i += 1) {
    const res = await fetch(`http://127.0.0.1:${String(app.apiPort)}/api/records`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        kind: 'problem',
        title: `The far edge of tray ${String(i)} is not segmented at 40 cm`,
        summary: `Segmentation drops the far edge of tray ${String(i)} at forty centimetres.`,
        data: { symptom: 'The mask is short.', state: 'open' },
      }),
    })
    if (!res.ok) throw new Error(`the seed was refused: ${await res.text()}`)
  }
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

/** Open the page the way a person arriving at it does, and wait for the making section. */
async function openFresh(): Promise<void> {
  await page.goto(`http://127.0.0.1:${String(app.webPort)}/#/bundles`, { waitUntil: 'domcontentloaded' })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.px-page h1')
  await page.waitForSelector('#bx-preset')
  await page.waitForTimeout(700)
}

describe('the making section is drawn on arrival', () => {
  it('shows the controls with no Choose a reading press', async () => {
    await openFresh()
    for (const id of ['#bx-preset', '#bx-less', '#bx-more', '#bx-name']) {
      expect(await page.locator(id).count(), `${id} is not on the page on arrival`).toBe(1)
    }
    expect(await page.getByRole('radio', { name: 'The whole project' }).count()).toBe(1)
    expect(
      await page.getByRole('button', { name: 'Choose a reading' }).count(),
      'the step that said Choose a reading is still on the page',
    ).toBe(0)
  }, 120_000)

  it('asks the server for no reading until somebody presses for one', async () => {
    readingsAsked.length = 0
    await openFresh()
    expect(readingsAsked, 'a page that opens read a copy nobody asked for').toEqual([])
    // AND THERE IS NO READING ON THE SCREEN, because none was made.
    expect(await page.locator('#bx-thetext').count()).toBe(0)
  }, 120_000)

  it('shows the reading on the press that chooses it, asking the server exactly once', async () => {
    readingsAsked.length = 0
    await openFresh()
    const [reply] = await Promise.all([
      page.waitForResponse((response) => response.url().includes('/api/bundles/preview')),
      page.selectOption('#bx-preset', 'owner_governance'),
    ])
    expect(reply.status()).toBe(200)
    await page.waitForSelector('#bx-thetext', { timeout: 60_000 })
    // ONE PRESS, ONE REQUEST. A second read for the same press is the defect this measures.
    expect(readingsAsked.length, 'one press asked the door more than once').toBe(1)
    // AND THE TEXT IS THE READING THAT WAS CHOSEN, not the one the page opened on.
    const text = (await page.textContent('#bx-thetext')) ?? ''
    expect(text).toContain('DECISIONS')
  }, 120_000)
})

describe('choices that cannot be read ask the server nothing', () => {
  it('will not read a record scope with no record chosen, and says what is needed', async () => {
    readingsAsked.length = 0
    await openFresh()
    await page.getByRole('radio', { name: /One record/ }).check()
    await page.waitForSelector('.px-empty[data-tier="must-act-on"]')
    const need = (await page.textContent('.px-empty[data-tier="must-act-on"]')) ?? ''
    expect(need).toContain('No record is chosen')
    // CHANGING THE READING IS A PRESS, AND IT ASKS NOTHING: there is no record to read about.
    await page.selectOption('#bx-preset', 'owner_governance')
    await page.waitForTimeout(700)
    expect(readingsAsked, 'a reading nobody can make was asked for anyway').toEqual([])
    expect(await page.getByRole('button', { name: 'Read what it would say' }).isDisabled()).toBe(true)
  }, 120_000)

  it('will not read the list preset with no part ticked, and says what is needed', async () => {
    readingsAsked.length = 0
    await openFresh()
    await page.selectOption('#bx-preset', 'custom')
    await page.waitForSelector('.bx-part input[type=checkbox]')
    await page.waitForTimeout(500)
    // CHOOSING THE PRESET READ ONCE, which is allowed: the box opens on the parts the page opens on.
    expect(readingsAsked.length).toBe(1)
    for (const box of await page.locator('.bx-part input[type=checkbox]').all()) {
      if (await box.isChecked()) await box.uncheck()
    }
    await page.waitForTimeout(700)
    // THE LAST UNTICK MAKES THE CHOICES UNREADABLE, and the page says so in the words the shared
    // refusal already holds rather than by asking the server.
    const need = (await page.textContent('.px-empty[data-tier="must-act-on"]')) ?? ''
    expect(need, 'the page does not say a part is still needed').toContain(en.t('g7a.bundles.choosePart', { preset: en.t('g7a.bundles.preset.custom.word') }))
    expect(readingsAsked.length, 'unticking a part asked the server for a reading').toBe(1)
    expect(await page.getByRole('button', { name: 'Read what it would say' }).isDisabled()).toBe(true)
    expect(await page.locator('#bx-thetext').count()).toBe(0)
  }, 120_000)
})
