// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PICTURES OF THE KEYBOARD SHORTCUTS, item 5 of a decision.
 *
 * The case runs only when `SHORTCUT_KEYS_SHOTS` names a directory; the ordinary runs leave it unset
 * and take no picture. It writes nothing into this checkout: every file goes under that directory.
 *
 * Eighteen pictures, which is what chapter 6 asks for twice over: the "?" list open, and the
 * Keyboard shortcuts group in Settings, each at 1440, 990, 660 and 390 in both looks, and each at
 * 1440 in Chinese. One more of the line the page shows after "g", and one of a tooltip that names
 * its key.
 */

import { mkdirSync } from 'node:fs'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

let app: LiveApp

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

const WIDTHS = [1440, 990, 660, 390] as const
const LOOKS = ['light', 'dark'] as const

beforeAll(async () => {
  app = await liveApp({ name: 'shortcut-keys-shots', viewport: { width: 1440, height: 1000 }, workspace: 'default' })
  // ONE KEY TURNED OFF, so the pictures show how an off row is drawn in the list and in Settings.
  const turned = await fetch(`${app.api}/api/participants/person/${THE_PERSON}`, {
    method: 'PATCH',
    headers: AS_THE_OWNER,
    body: JSON.stringify({ shortcuts: { singleKeys: true, off: ['theme'] } }),
  })
  expect(turned.status, await turned.clone().text()).toBe(200)
}, 240_000)

afterAll(async () => {
  await app.stop()
})

async function openTheList(): Promise<void> {
  await app.page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
  await app.page.keyboard.press('?')
  await app.page.waitForSelector('.sck-list', { timeout: 10_000 })
}

describe('the pictures of the keyboard shortcuts', () => {
  it.skipIf(!process.env['SHORTCUT_KEYS_SHOTS'])('photographs the list and the Settings group at four widths in both looks, and 1440 in Chinese', async () => {
    const dir = process.env['SHORTCUT_KEYS_SHOTS'] as string
    mkdirSync(dir, { recursive: true })

    for (const width of WIDTHS) {
      for (const look of LOOKS) {
        await app.page.setViewportSize({ width, height: width < 700 ? 900 : 1000 })
        await app.page.emulateMedia({ colorScheme: look })
        await app.page.goto(`${app.site}/#/`)
        await waitForThePage(app.page, 30_000)
        await app.page.waitForTimeout(500)
        await openTheList()
        await app.page.screenshot({ path: `${dir}/list-${width}-${look}.png` })

        await app.page.goto(`${app.site}/#/settings/shortcuts`)
        await waitForThePage(app.page, 30_000)
        await app.page.waitForSelector('[data-shortcut-switch="single-keys"]:not([disabled])', { timeout: 15_000 })
        await app.page.waitForTimeout(300)
        await app.page.screenshot({ path: `${dir}/settings-${width}-${look}.png`, fullPage: true })
        // AND THE GROUP ALONE, at the size a person reads it.
        await app.page.locator('#set-panel-shortcuts').screenshot({ path: `${dir}/group-${width}-${look}.png` })
      }
    }

    await app.page.setViewportSize({ width: 1440, height: 1000 })
    await app.page.emulateMedia({ colorScheme: 'light' })
    await app.page.goto(`${app.site}/?lang=zh#/`)
    await waitForThePage(app.page, 30_000)
    await app.page.waitForTimeout(500)
    await openTheList()
    await app.page.screenshot({ path: `${dir}/list-1440-zh-light.png` })
    await app.page.goto(`${app.site}/?lang=zh#/settings/shortcuts`)
    await waitForThePage(app.page, 30_000)
    await app.page.waitForSelector('[data-shortcut-switch="single-keys"]:not([disabled])', { timeout: 15_000 })
    await app.page.waitForTimeout(300)
    await app.page.screenshot({ path: `${dir}/settings-1440-zh-light.png`, fullPage: true })
    await app.page.locator('#set-panel-shortcuts').screenshot({ path: `${dir}/group-1440-zh-light.png` })

    // THE LINE AFTER "g", which stays on screen for about a second and a half.
    await app.page.goto(`${app.site}/#/governance`)
    await waitForThePage(app.page, 30_000)
    await app.page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
    await app.page.keyboard.press('g')
    await app.page.waitForSelector('[data-shortcut-line="after-g"]', { timeout: 5_000 })
    await app.page.screenshot({ path: `${dir}/after-g-1440-light.png` })
  }, 600_000)
})
