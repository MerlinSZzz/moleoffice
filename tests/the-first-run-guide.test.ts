// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE FIRST-RUN GUIDE: A FRESH OFFICE ASKS ITS PERSON FOR THEIR NAME, AND THE REST OF IT WAITS.
 *
 * By point 1 of a decision, a person who downloads the office is led through a mandatory newcomer guide that asks for
 * the name, whose default is "default office owner name", glaring on purpose. This file starts
 * real offices, serves the real page, and checks in a browser:
 *
 *   1. while the office has no named owner, every address draws the guide and nothing of the office;
 *   2. the name field starts with the placeholder, selected, in English and in Chinese;
 *   3. at 390 wide the guide is one column, nothing scrolls sideways, and the press is at least 44px;
 *   4. an agent's refusal from the door is drawn as its own sentence;
 *   5. a name typed and sent opens Home, and the owner's name then shows there;
 *   6. keeping the placeholder stores it as the name.
 *
 * A FRESH OFFICE HERE IS ONE STARTED WITHOUT MOLE_OFFICE_OWNER_ID AND MOLE_OFFICE_OWNER_NAME. Every
 * test process is given both by tests/every-test-process-is-given-the-test-offices-owner.ts, because the test offices are
 * fixtures of the owner's office; this file sets both empty in the environment its own servers start with,
 * so a .env the checkout holds cannot name an owner either, and puts them back afterwards.
 *
 * PICTURES. With WELCOME_SHOTS naming a folder, the last case photographs the guide at 1440, 990, 660
 * and 390 in light and dark, and at 1440 in Chinese, into that folder. Without it, that case is skipped.
 */
import { mkdirSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Page } from 'playwright'
import { THE_OWNER_PLACEHOLDER, ONLY_THE_PERSON_NAMES_THEMSELVES } from '../src/shared/owner.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'

const OWNER_SETTINGS = ['MOLE_OFFICE_OWNER_ID', 'MOLE_OFFICE_OWNER_NAME'] as const

/**
 * Start an office owned by nobody named: the two owner settings are EMPTY in its environment. Not
 * deleted: a setting left out is read from the .env the checkout holds, and a worktree reads the main
 * checkout's (findEnvFile), which on the owner's machine names them. Empty means the same as not set,
 * and the settings say so: it is how a shell says so over a .env that sets it.
 */
async function aFreshOffice(name: string, width = 1440): Promise<LiveApp> {
  const saved = OWNER_SETTINGS.map((key) => [key, process.env[key]] as const)
  for (const key of OWNER_SETTINGS) process.env[key] = ''
  try {
    return await liveApp({ name, viewport: { width, height: 1000 } })
  } finally {
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
}

/** Load the address afresh, as a person typing it would, and wait for the page to say it has drawn. */
async function openFresh(page: Page, url: string): Promise<void> {
  await page.goto('about:blank')
  await page.goto(url, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
}

async function theOwnerDoor(app: LiveApp): Promise<{ id: string; name: string | null; named: boolean }> {
  const reply = await fetch(`${app.api}/api/office/owner`)
  expect(reply.status).toBe(200)
  return (await reply.json()) as { id: string; name: string | null; named: boolean }
}

describe('a fresh office draws the guide at every address', () => {
  let app: LiveApp
  beforeAll(async () => {
    app = await aFreshOffice('first-run-guide-fresh')
  }, 180_000)
  afterAll(async () => {
    await app?.stop()
  })

  it('names nobody yet', async () => {
    expect(await theOwnerDoor(app)).toMatchObject({ id: 'owner', name: null, named: false })
  })

  it('draws the guide, and nothing of the office, at every address', async () => {
    for (const address of ['#/', '#/records', '#/settings', '#/chat', '#/governance', '#/welcome', '#/no-such-page']) {
      await openFresh(app.page, `${app.site}/?lang=en${address}`)
      await app.page.locator('.wlc').waitFor({ timeout: 30_000 })
      expect(await app.page.locator('.wlc-title').textContent(), address).toBe('Welcome to Mole Office')
      // The office's own frame is not drawn: no sidebar, no phone bar, no shell at all.
      expect(await app.page.locator('.shell').count(), `${address} drew the office behind the guide`).toBe(0)
    }
  })

  it('starts the name field with the placeholder, selected so typing replaces it, in English', async () => {
    await openFresh(app.page, `${app.site}/?lang=en#/welcome`)
    const field = app.page.locator('.wlc-input')
    expect(await field.inputValue()).toBe('default office owner name')
    const selection = await field.evaluate((el: HTMLInputElement) => ({
      focused: document.activeElement === el,
      start: el.selectionStart,
      end: el.selectionEnd,
      length: el.value.length,
    }))
    expect(selection).toEqual({ focused: true, start: 0, end: selection.length, length: 'default office owner name'.length })
    // It says under the field, plainly, that it is a placeholder to change.
    await app.page.getByText('This is a placeholder, not a name.', { exact: false }).waitFor({ timeout: 10_000 })
  })

  it('starts the name field with the Chinese placeholder on a Chinese page', async () => {
    await openFresh(app.page, `${app.site}/?lang=zh#/welcome`)
    expect(await app.page.locator('.wlc-input').inputValue()).toBe(THE_OWNER_PLACEHOLDER.zh)
    expect(THE_OWNER_PLACEHOLDER.zh).not.toBe(THE_OWNER_PLACEHOLDER.en)
    expect(await app.page.locator('.wlc-title').textContent()).toBe('欢迎使用 Mole Office')
  })

  it('redraws the guide in the language chosen on it, and the placeholder follows while it is kept', async () => {
    // No ?lang= here: an address that names a language wins over any choice, as it does on every page.
    await openFresh(app.page, `${app.site}/#/welcome`)
    expect(await app.page.locator('.wlc-title').textContent()).toBe('Welcome to Mole Office')
    await app.page.locator('.wlc-choice', { hasText: '中文' }).click()
    await app.page.locator('.wlc-title', { hasText: '欢迎使用 Mole Office' }).waitFor({ timeout: 10_000 })
    expect(await app.page.locator('.wlc-input').inputValue()).toBe(THE_OWNER_PLACEHOLDER.zh)
    // A name somebody typed is theirs, and a change of language leaves it alone.
    await app.page.locator('.wlc-input').fill('Ada')
    await app.page.locator('.wlc-choice', { hasText: 'English' }).click()
    await app.page.locator('.wlc-title', { hasText: 'Welcome to Mole Office' }).waitFor({ timeout: 10_000 })
    expect(await app.page.locator('.wlc-input').inputValue()).toBe('Ada')
  })

  it('is one column at 390, scrolls nowhere sideways, and its presses are at least 44px', async () => {
    await app.page.setViewportSize({ width: 390, height: 900 })
    try {
      await openFresh(app.page, `${app.site}/?lang=en#/welcome`)
      const measured = await app.page.evaluate(() => {
        const box = (selector: string) => {
          const el = document.querySelector(selector)
          if (el === null) throw new Error(`${selector} is not on the page`)
          return el.getBoundingClientRect()
        }
        const press = box('.wlc-foot .px-btn')
        const field = box('.wlc-input')
        const choices = [...document.querySelectorAll('.wlc-choice')].map((el) => el.getBoundingClientRect().height)
        const lefts = ['.wlc-title', '.wlc-lead', '.wlc-input', '.wlc-languages', '.wlc-foot'].map((s) => Math.round(box(s).left))
        return {
          scrollWidth: document.documentElement.scrollWidth,
          pressHeight: press.height,
          pressWidth: press.width,
          fieldWidth: field.width,
          choices,
          lefts,
        }
      })
      expect(measured.scrollWidth, 'the page scrolls sideways at 390').toBeLessThanOrEqual(390)
      expect(measured.pressHeight).toBeGreaterThanOrEqual(44)
      for (const height of measured.choices) expect(height).toBeGreaterThanOrEqual(44)
      // One column: every part starts at the same left edge, and the press runs the column's width.
      expect(new Set(measured.lefts).size, `left edges ${measured.lefts.join(', ')}`).toBe(1)
      expect(Math.abs(measured.pressWidth - measured.fieldWidth)).toBeLessThanOrEqual(1)
    } finally {
      await app.page.setViewportSize({ width: 1440, height: 1000 })
    }
  })

  it('draws the door\'s own sentence when the page writes as an agent', async () => {
    // A REGISTERED AGENT, so the door reaches its own refusal rather than the registry's. The person
    // registers it, as a person on this computer does.
    const registered = await fetch(`${app.api}/api/agents/started`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': 'owner' },
      body: JSON.stringify({ handle: 'an-agent-that-installed-the-office', name: 'An agent that installed the office' }),
    })
    expect(registered.status, await registered.text()).toBe(201)
    await app.page.addInitScript(() => {
      window.localStorage.setItem('mole-office.actor', JSON.stringify({ type: 'agent', id: 'an-agent-that-installed-the-office' }))
    })
    await openFresh(app.page, `${app.site}/?lang=en#/welcome`)
    await app.page.locator('.wlc-input').fill('Ada')
    await app.page.getByRole('button', { name: 'Open my office' }).click()
    const said = app.page.locator('.wlc .px-error')
    await said.waitFor({ timeout: 30_000 })
    expect(await said.textContent()).toContain(ONLY_THE_PERSON_NAMES_THEMSELVES)
    expect(await theOwnerDoor(app)).toMatchObject({ name: null, named: false })
    expect(await app.page.locator('.wlc').count()).toBe(1)
  })
})

describe('naming the owner', () => {
  it('opens Home once a name is sent, shows the name there, and never draws the guide again', async () => {
    const app = await aFreshOffice('first-run-guide-named')
    try {
      await openFresh(app.page, `${app.site}/?lang=en#/records`)
      await app.page.locator('.wlc-input').fill('Ada Lovelace')
      await app.page.getByRole('button', { name: 'Open my office' }).click()
      await app.page.waitForFunction(() => location.hash === '#/', undefined, { timeout: 30_000 })
      await waitForThePage(app.page, 60_000)
      expect(await app.page.locator('.wlc').count()).toBe(0)
      expect(await app.page.locator('.shell').count()).toBe(1)
      expect(await theOwnerDoor(app)).toMatchObject({ id: 'owner', name: 'Ada Lovelace', named: true })
      // The name is drawn where the owner's name goes: the foot of the sidebar.
      await app.page.locator('.sbp-person', { hasText: 'Ada Lovelace' }).waitFor({ timeout: 30_000 })
      // The guide's own address now opens Home.
      await openFresh(app.page, `${app.site}/?lang=en#/welcome`)
      await app.page.waitForFunction(() => location.hash === '#/', undefined, { timeout: 30_000 })
      expect(await app.page.locator('.wlc').count()).toBe(0)
    } finally {
      await app.stop()
    }
  }, 240_000)

  it('stores the placeholder as the name when the person keeps it', async () => {
    const app = await aFreshOffice('first-run-guide-kept')
    try {
      await openFresh(app.page, `${app.site}/?lang=en#/welcome`)
      await app.page.getByRole('button', { name: 'Open my office' }).click()
      await app.page.waitForFunction(() => location.hash === '#/', undefined, { timeout: 30_000 })
      expect(await theOwnerDoor(app)).toMatchObject({ name: 'default office owner name', named: true })
      await waitForThePage(app.page, 60_000)
      await app.page.locator('.sbp-person', { hasText: 'default office owner name' }).waitFor({ timeout: 30_000 })
    } finally {
      await app.stop()
    }
  }, 240_000)
})

describe('pictures of the guide', () => {
  it.skipIf(!process.env['WELCOME_SHOTS'])('photographs the guide at four widths in both looks, and in Chinese', async () => {
    const shots = process.env['WELCOME_SHOTS'] as string
    mkdirSync(shots, { recursive: true })
    const app = await aFreshOffice('first-run-guide-shots')
    try {
      for (const theme of ['light', 'dark'] as const) {
        await app.page.emulateMedia({ colorScheme: theme })
        for (const width of [1440, 990, 660, 390]) {
          await app.page.setViewportSize({ width, height: 900 })
          await openFresh(app.page, `${app.site}/?lang=en#/welcome`)
          await app.page.screenshot({ path: `${shots}/welcome-${String(width)}-${theme}.png`, fullPage: true })
        }
      }
      await app.page.emulateMedia({ colorScheme: 'light' })
      await app.page.setViewportSize({ width: 1440, height: 900 })
      await openFresh(app.page, `${app.site}/?lang=zh#/welcome`)
      await app.page.screenshot({ path: `${shots}/welcome-1440-light-zh.png`, fullPage: true })
      // And the same field once somebody has typed a name: the placeholder line goes.
      await openFresh(app.page, `${app.site}/?lang=en#/welcome`)
      await app.page.locator('.wlc-input').fill('Ada Lovelace')
      await app.page.screenshot({ path: `${shots}/welcome-1440-light-typed.png`, fullPage: true })
    } finally {
      await app.stop()
    }
  }, 300_000)
})
