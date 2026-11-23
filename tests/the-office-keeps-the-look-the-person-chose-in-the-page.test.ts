// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE OFFICE KEEPS THE LOOK THE PERSON CHOSE IN THE PAGE, AND A PAGE LOAD NEVER WRITES IT.
 *
 * A person's look is kept on their row (migration 0347), so a new browser draws the look they chose.
 * Only a choice made in the page writes it. A page load never does: a tool or a test that sets the
 * browser's storage, or a browser from before the office kept a look, would otherwise write over the
 * person's choice in their name.
 *
 * WHAT THIS FILE PROVES, in a test office of its own:
 *   (b1) A load with a stored choice, while the office holds none, draws the stored choice, sends no
 *        change and leaves the row null.
 *   (b3) Choosing a theme in the page writes it to the row.
 *   (a)  A second browser context, with empty storage, draws the look the office keeps: the theme
 *        chosen in the page, and later one of the person's own themes, with its rule in the page.
 *   (b2) With a look in the office, a different stored choice does not override it, and the load
 *        sends no change.
 *
 * NO MODE IS STORED IN (a) EITHER. Its contexts come from `aContextThatStoresNoMode` (tests/helpers.ts
 * stores Normal mode in every other one), so the page opens in the person's starting mode. The look
 * it draws does not depend on the mode.
 *
 * Every theme and name here is made up or read from the shared code.
 */
import { join } from 'node:path'
import type { Page, Request } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { aCopyOf, type TheLook } from '../src/shared/own-themes.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { THEMES } from '../src/shared/themes.ts'
import { aContextThatStoresNoMode, liveApp, thePersonsKeyHeader, waitForThePage, type LiveApp } from './helpers.ts'
import { openSettingsPanel } from './settings-folds.ts'

const STORED = 'mole-office.preset.theme'
// A theme that is neither the default nor what the first load stores, read from the data.
const CHOSEN = THEMES.find((theme) => theme.look === 'dark')!
const OWN_NAME = 'Made-up evening'

describe('the look a person chooses in the page is kept in the office, and a page load writes none', () => {
  let app: LiveApp
  let asThePerson: Record<string, string>

  beforeAll(async () => {
    app = await liveApp({ name: 'look-kept-in-the-office', workspace: 'default', viewport: { width: 1440, height: 900 } })
    asThePerson = {
      'content-type': 'application/json',
      'x-mole-office-workspace': 'default',
      'x-mole-office-actor-type': 'human',
      'x-mole-office-actor-id': THE_PERSON,
      ...thePersonsKeyHeader(join(app.dir, 'keys.json')),
    }
  }, 240_000)

  afterAll(async () => { await app?.stop() })

  /** What the person's own row says, as the person reads it. The field must be there. */
  async function theLookTheOfficeKeeps(): Promise<unknown> {
    const read = await fetch(`${app.api}/api/participants?shape=page`, { headers: asThePerson })
    expect(read.status, await read.clone().text()).toBe(200)
    const person = ((await read.json()) as { people: Record<string, unknown>[] }).people.find((one) => one['id'] === THE_PERSON)
    expect(person).toBeDefined()
    expect(Object.hasOwn(person!, 'themes')).toBe(true)
    return person!['themes']
  }

  /** Every change to a participant this page sends, from now on. */
  function theChangesSent(page: Page): Request[] {
    const sent: Request[] = []
    page.on('request', (request) => {
      if (request.method() === 'PATCH' && request.url().includes('/api/participants/')) sent.push(request)
    })
    return sent
  }

  /**
   * Load the page and wait until it has the office's answer for the person's row, and a little after,
   * so a change sent because of that answer would have been sent.
   */
  async function load(page: Page, how: () => Promise<unknown>): Promise<void> {
    const roster = page.waitForResponse((reply) => reply.url().includes('/api/participants?shape=page') && reply.ok())
    await how()
    await waitForThePage(page, 30_000)
    await roster
    await page.waitForTimeout(1500)
  }

  it('(b1) draws the stored choice while the office holds none, and a load writes nothing to the row', async () => {
    const page = app.page
    await load(page, () => page.goto(`${app.site}/?lang=en#/modules`))
    await page.evaluate(([key, value]) => localStorage.setItem(key!, value!), [STORED, 'dark'])
    const sent = theChangesSent(page)
    await load(page, () => page.reload())
    expect(await page.locator('html').getAttribute('data-theme')).toBe('dark')
    expect(sent.map((one) => one.postData())).toEqual([])
    expect(await theLookTheOfficeKeeps()).toBeNull()
  }, 120_000)

  it('(b3) writes a theme the person chooses in the page to their row', async () => {
    const page = app.page
    await load(page, () => page.goto(`${app.site}/?lang=en&load=2#/settings`))
    await openSettingsPanel(page, 'settings.look')
    const written = page.waitForResponse((reply) => reply.request().method() === 'PATCH' && reply.url().includes(`/api/participants/person/${THE_PERSON}`))
    await page.selectOption('#preset-theme', CHOSEN.id)
    expect((await written).status()).toBe(200)
    expect(await page.locator('html').getAttribute('data-theme')).toBe(CHOSEN.id)
    expect(await theLookTheOfficeKeeps()).toEqual({ chosen: CHOSEN.id, own: [] })
  }, 120_000)

  it('(a) draws the look the office keeps in a second browser whose storage is empty', async () => {
    const context = await aContextThatStoresNoMode(app.browser, { viewport: { width: 1440, height: 900 } })
    try {
      const page = await context.newPage()
      expect(await page.evaluate(() => localStorage.length).catch(() => 0)).toBe(0)
      await load(page, () => page.goto(`${app.site}/?lang=en#/modules`))
      await page.waitForFunction((id) => document.documentElement.getAttribute('data-theme') === id, CHOSEN.id, { timeout: 10_000 })
      expect(await page.locator('html').getAttribute('data-theme-from')).toBe('data')
      // And keeps it for its own next first frame.
      expect(await page.evaluate((key) => localStorage.getItem(key), STORED)).toBe(CHOSEN.id)
    } finally {
      await context.close()
    }
  }, 120_000)

  it('(b2) draws the look the office keeps over a different choice this browser stored, and the load writes nothing', async () => {
    const page = app.page
    await page.evaluate(([key, value]) => localStorage.setItem(key!, value!), [STORED, 'light'])
    const sent = theChangesSent(page)
    await load(page, () => page.reload())
    expect(await page.locator('html').getAttribute('data-theme')).toBe(CHOSEN.id)
    expect(await page.evaluate((key) => localStorage.getItem(key), STORED)).toBe(CHOSEN.id)
    expect(sent.map((one) => one.postData())).toEqual([])
    expect(await theLookTheOfficeKeeps()).toEqual({ chosen: CHOSEN.id, own: [] })
  }, 120_000)

  it("(a) draws one of the person's own themes in a second browser, with its rule and its name", async () => {
    const copy = aCopyOf(CHOSEN, { chosen: CHOSEN.id, own: [] }, OWN_NAME)
    const id = copy.id
    const look: TheLook = { chosen: id, own: [copy] }
    const kept = await fetch(`${app.api}/api/participants/person/${THE_PERSON}`, { method: 'PATCH', headers: asThePerson, body: JSON.stringify({ themes: look }) })
    expect(kept.status, await kept.text()).toBe(200)
    const context = await aContextThatStoresNoMode(app.browser, { viewport: { width: 1440, height: 900 } })
    try {
      const page = await context.newPage()
      await load(page, () => page.goto(`${app.site}/?lang=en#/settings`))
      await page.waitForFunction((own) => document.documentElement.getAttribute('data-theme') === own, id, { timeout: 10_000 })
      expect(await page.locator('html').getAttribute('data-theme-from')).toBe('data')
      expect(await page.locator('style#mole-office-themes').textContent()).toContain(`[data-theme='${id}']`)
      await openSettingsPanel(page, 'settings.look')
      expect(await page.locator('#preset-theme').inputValue()).toBe(id)
      expect(await page.locator('#preset-theme option:checked').textContent()).toBe(OWN_NAME)
    } finally {
      await context.close()
    }
  }, 120_000)
})
