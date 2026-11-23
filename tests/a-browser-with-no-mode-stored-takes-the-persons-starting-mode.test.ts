// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A BROWSER WITH NO MODE STORED TAKES THE MODE ITS PERSON STARTS IN, and a stored mode is kept, as decided.
 *
 * The office writes `inspect` as the starting mode of a person it makes from now on, and NULL is a person it had
 * before. A browser that has stored no mode reads the person the page acts as, takes that person's starting mode,
 * Developer for `inspect` and Normal for NULL, and stores it. A browser that has stored a mode keeps it, whatever the
 * person starts in.
 *
 *   1. A new person, nothing stored: Developer mode, stored, and kept after a reload. Before the reload the person's
 *      row is put back to NULL, so it is the stored word that holds the mode, not a second read of the person.
 *   2. A person from before, nothing stored: Normal mode, stored, and kept after a reload.
 *   3. Either stored word, for both persons: kept after the page has read the person.
 *
 * Each case opens a browser context that stores nothing (tests/helpers.ts stores Normal mode in every other one).
 * The mode is read from `data-mode` on the root, as src/web/lib/mode.ts sets it, and from the browser's storage.
 * Before the change, case 1 drew Normal mode and case 2 stored nothing, so both asked for what the page did not do.
 */

import { join } from 'node:path'
import Database from 'better-sqlite3'
import type { BrowserContext, Page } from 'playwright'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { aContextThatStoresNoMode, liveApp, waitForThePage, type LiveApp } from './helpers.ts'

/** The key src/web/lib/mode.ts stores the mode under. */
const KEY = 'mole-office.mode'
const SIZE = { width: 1440, height: 900 }

let app: LiveApp
let context: BrowserContext | null = null

beforeAll(async () => {
  app = await liveApp({ name: 'starting-mode-in-the-page', viewport: SIZE, modeStored: 'nothing' })
}, 120_000)

afterEach(async () => {
  await context?.close()
  context = null
})

afterAll(async () => {
  await app?.stop()
})

/** Write the person's starting mode into this office's own database, as the office or an older office left it. */
function thePersonStartsIn(startingMode: 'inspect' | null): void {
  const db = new Database(join(app.dir, 'panelx.db'))
  try {
    const changed = db.prepare('UPDATE people SET starting_mode = ? WHERE id = ?').run(startingMode, THE_PERSON).changes
    if (changed !== 1) throw new Error(`no person ${THE_PERSON} in this office to write a starting mode on`)
  } finally {
    db.close()
  }
}

/** A window with nothing stored, or with `stored` stored before its first page. */
async function aWindow(stored: 'normal' | 'inspect' | null): Promise<Page> {
  context = await aContextThatStoresNoMode(app.browser, { viewport: SIZE })
  if (stored !== null) {
    await context.addInitScript(
      ([key, word]) => {
        if (window.localStorage.getItem(key as string) === null) window.localStorage.setItem(key as string, word as string)
      },
      [KEY, stored] as const,
    )
  }
  return context.newPage()
}

/** Open Home and wait until the page has read the people it acts among. */
async function open(page: Page, how: 'go' | 'reload'): Promise<void> {
  const read = page.waitForResponse((reply) => reply.url().includes('/api/participants?shape=page'), { timeout: 60_000 })
  if (how === 'go') await page.goto(`${app.site}/?lang=en#/`)
  else await page.reload()
  await waitForThePage(page, 60_000)
  expect((await read).status()).toBe(200)
}

async function theModeDrawn(page: Page): Promise<string | null> {
  return page.locator('html').getAttribute('data-mode')
}

async function theModeStored(page: Page): Promise<string | null> {
  return page.evaluate((key) => window.localStorage.getItem(key), KEY)
}

describe('the mode a browser with nothing stored opens in', () => {
  it('1. a new person with nothing stored gets Developer mode, stores it, and keeps it after a reload', async () => {
    thePersonStartsIn('inspect')
    const page = await aWindow(null)
    await open(page, 'go')
    await page.locator('html[data-mode="inspect"]').waitFor({ state: 'attached', timeout: 30_000 })
    expect(await theModeStored(page)).toBe('inspect')

    thePersonStartsIn(null)
    try {
      await open(page, 'reload')
      expect(await theModeDrawn(page)).toBe('inspect')
      expect(await theModeStored(page)).toBe('inspect')
    } finally {
      thePersonStartsIn('inspect')
    }
  }, 120_000)

  it('2. a person from before, with nothing stored, stays in Normal mode, stores it, and keeps it after a reload', async () => {
    thePersonStartsIn(null)
    try {
      const page = await aWindow(null)
      await open(page, 'go')
      await page.waitForFunction((key) => window.localStorage.getItem(key) !== null, KEY, { timeout: 30_000 })
      expect(await theModeStored(page)).toBe('normal')
      expect(await theModeDrawn(page)).toBe('normal')

      await open(page, 'reload')
      expect(await theModeDrawn(page)).toBe('normal')
      expect(await theModeStored(page)).toBe('normal')
    } finally {
      thePersonStartsIn('inspect')
    }
  }, 120_000)
})

describe('a stored mode is kept, whatever the person starts in', () => {
  for (const startsIn of ['inspect', null] as const) {
    for (const stored of ['normal', 'inspect'] as const) {
      it(`3. "${stored}" stored, for a person who starts in ${startsIn ?? 'nothing recorded'}`, async () => {
        thePersonStartsIn(startsIn)
        try {
          const page = await aWindow(stored)
          await open(page, 'go')
          // The page takes a starting mode as soon as the read arrives, so a second after it, a change would be drawn.
          await page.waitForTimeout(1_000)
          expect(await theModeDrawn(page)).toBe(stored)
          expect(await theModeStored(page)).toBe(stored)
        } finally {
          thePersonStartsIn('inspect')
        }
      }, 120_000)
    }
  }
})
