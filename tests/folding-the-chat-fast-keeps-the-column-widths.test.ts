// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * FOLDING AND UNFOLDING THE CHAT FAST NEVER CHANGES THE WIDTHS OF THE PAGE AND THE CHAT (wave 13y).
 *
 * The person pressed the chat's fold press many times in a row, and sometimes one press changed the widths of the page
 * and of the chat beside it, with the chat on the left and on the right. The fold press stands in the seam between the
 * page and the chat. A double-click on the seam gives the page its reading width. Two fast presses on the fold press
 * are a double-click, and it reached the seam.
 *
 * In a real browser against a Mole Office of its own, at 1440, with the chat beside the page 800 wide, which is wide
 * enough for the fold press: the fold press is pressed twelve times in a row, every second press a double-click, on the
 * right and then on the left. After each press, the page and the chat are as wide as before the first, and the press
 * has folded or unfolded the chat's lists.
 *
 * Everything here is made up.
 */
import type { BrowserContext, Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { TWO_COLUMNS_FROM } from '../src/web/lib/chat-split.ts'
import { liveApp, openRecordPagesAt, waitForThePage, type LiveApp } from './helpers.ts'

const PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const SPLIT = 'aside.px-chat[data-where="split"]'
const FOLD = '.px-chat-seam .px-chat-layout-toggle'
/** Wide enough for the chat to draw the fold press, and narrower than the 960 the chat may reach in a window 1440 wide. */
const CHAT_WIDTH = TWO_COLUMNS_FROM + 40
const PRESSES = 12

let app: LiveApp
let report = ''

/** A browser of its own at 1440, with the chat beside the page on this side, as wide as the fold press needs. */
async function aWindow(side: 'left' | 'right'): Promise<{ context: BrowserContext; page: Page }> {
  const context = await app.browser.newContext({ viewport: { width: 1440, height: 900 } })
  await openRecordPagesAt(context, 'full')
  await context.addInitScript(([on, wide]) => {
    localStorage.setItem('mole-office.preset.theme', 'light')
    localStorage.setItem('mole-office.language', 'en')
    localStorage.setItem('mole-office.workspace', 'default')
    localStorage.setItem('mole-office.chat.open', 'split')
    localStorage.setItem('mole-office.chat.split-side', on)
    localStorage.setItem('mole-office.chat.split-width', wide)
  }, [side, String(CHAT_WIDTH)] as const)
  return { context, page: await context.newPage() }
}

/** The widths of the page and the chat as drawn, and the width the root gives the chat. */
async function theWidths(page: Page): Promise<{ page: number; chat: number; split: string }> {
  return page.evaluate(() => new Promise((resolve) => {
    // One frame after the press, so what the press changed is drawn.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const width = (selector: string): number => Math.round(document.querySelector(selector)?.getBoundingClientRect().width ?? -1)
      resolve({ page: width('#main'), chat: width('aside.px-chat'), split: document.documentElement.style.getPropertyValue('--chat-split-w') })
    }))
  }))
}

/** Press the fold press many times in a row, every second press a double-click, and read the widths after each. */
async function foldFast(page: Page, side: 'left' | 'right'): Promise<void> {
  const fold = page.locator(FOLD)
  await fold.waitFor({ state: 'visible', timeout: 30_000 })
  const before = await theWidths(page)
  expect(before.split, `the chat on the ${side} is not ${String(CHAT_WIDTH)} wide`).toBe(`${String(CHAT_WIDTH)}px`)
  const where = await fold.boundingBox()
  if (where === null) throw new Error('the fold press is not drawn')
  const x = where.x + where.width / 2
  const y = where.y + where.height / 2
  let folded = await fold.getAttribute('aria-pressed')
  for (let press = 1; press <= PRESSES; press += 1) {
    // THE SECOND PRESS OF EACH PAIR IS A DOUBLE-CLICK, as two fast presses are to the browser.
    const clickCount = press % 2 === 0 ? 2 : 1
    await page.mouse.move(x, y)
    await page.mouse.down({ clickCount })
    await page.mouse.up({ clickCount })
    expect(await theWidths(page), `press ${String(press)} on the ${side} changed the widths`).toEqual(before)
    await expect.poll(() => fold.getAttribute('aria-pressed'), { message: `press ${String(press)} on the ${side} did not fold or unfold the chat` }).not.toBe(folded)
    folded = await fold.getAttribute('aria-pressed')
  }
}

beforeAll(async () => {
  app = await liveApp({ name: 'folding-the-chat-fast', viewport: { width: 1440, height: 900 }, workspace: 'default', opensAt: 'full' })
  const blocks = [1, 2, 3].map((n) => ({ id: `b-${String(n)}`, type: 'text', heading: `Made-up part ${String(n)}`, text: `Made-up paragraph ${String(n)} about the made-up kiln.` }))
  const made = await fetch(`${app.api}/api/records`, { method: 'POST', headers: PERSON, body: JSON.stringify({ kind: 'report', title: 'Made-up kiln report', data: { for: 'Made-up reader', date: '2026-11-21', blocks } }) })
  expect(made.status, await made.clone().text()).toBe(201)
  report = ((await made.json()) as { record: { id: string } }).record.id
}, 300_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

describe('the fold press pressed many times in a row', () => {
  for (const side of ['right', 'left'] as const) {
    it(`keeps the widths of the page and the chat, with the chat on the ${side}`, async () => {
      const { context, page } = await aWindow(side)
      try {
        await page.goto(`${app.site}/?lang=en#/r/${report}`, { timeout: 60_000 })
        await waitForThePage(page, 60_000)
        await page.waitForSelector(SPLIT, { timeout: 30_000 })
        await expect.poll(() => page.evaluate(() => document.documentElement.getAttribute('data-chat-split'))).toBe(side)
        await foldFast(page, side)
      } finally {
        await context.close()
      }
    }, 180_000)
  }
})
