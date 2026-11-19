// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PHONE BAR'S PRESSES ARE MET IN THE ORDER THEY ARE SEEN.
 *
 * Below 1024px the shell draws the bar. Round 170 kept the chat press on the menu press's row by drawing the
 * Decisions count and the urgent pill after it with a CSS order at 480px and below. The eye then read the chat
 * press before the counts, while the page, the Tab key and a screen reader still met the counts first. A keyboard
 * user and a screen reader were given a different order from the one on screen.
 *
 * WHAT THIS MEASURES, in a real browser on a test office of this file's own, at 390 by 844, with a fork waiting on
 * the person and seven open problems waiting on the person, so both counts are drawn, in both looks:
 *   - the order the four presses stand on screen, left to right and then top to bottom;
 *   - the order they stand in the page;
 *   - the order the Tab key meets them, starting at the menu press.
 * All three are menu, chat, Decisions, urgent: the order the eye reads at this width.
 *
 * THE WINDOW IS NARROWED AS WELL. One case opens at 660, where the order is menu, Decisions, urgent, chat, and
 * narrows the window to 390, then asks the screen and the page for the phone's order: a bar that reads the width
 * once and never again would keep the wide order in the page.
 *
 * AT 660 the order on screen is menu, Decisions, urgent, chat: the order the bar has at that width on the cut this
 * file was written against, where the counts stand before the chat press.
 *
 * THE PICTURES, only when W13Y_BAR_ORDER_PICTURES names a folder: the bar at the widths in W13Y_BAR_ORDER_WIDTHS
 * (1440, 990, 660 and 390 when unset) and the looks in W13Y_BAR_ORDER_LOOKS (light and dark when unset), with the
 * made-up label above the page and the pointer off the page. At 1440 the bar is not drawn, so that picture shows
 * the top of the page beside the sidebar.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { BrowserContext, Page } from 'playwright'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { readStoredWord } from '../src/shared/i18n.ts'
import { pathFor } from '../src/web/components/router.tsx'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { putTheMadeUpLabelIn } from './the-made-up-label-above-the-page.ts'

const CALLED = 'the-phone-bars-presses-keep-the-order-they-are-seen-in'
const PICTURES = process.env['W13Y_BAR_ORDER_PICTURES']
const PICTURE_WIDTHS = (process.env['W13Y_BAR_ORDER_WIDTHS'] ?? '1440,990,660,390').split(',').map(Number)
const PICTURE_LOOKS = (process.env['W13Y_BAR_ORDER_LOOKS'] ?? 'light,dark').split(',') as ('light' | 'dark')[]
const LABEL = 'Made-up data — an invented office, not real office data'
const THE_PAGE_TOP = '#main > *:not([data-made-up-label]):not(style)'
const PHONE = { width: 390, height: 844 }
const NARROW_START = { width: 660, height: 900 }
const LOOKS = ['light', 'dark'] as const
const URGENT = 7
const THE_PHONE_ORDER = ['menu', 'chat', 'decisions', 'urgent']
const THE_ORDER_AT_660 = ['menu', 'decisions', 'urgent', 'chat']
const THE_PRESSES =
  '.shell-menu, .shell-chat-phone, .shell-bar-status[data-count="decisions"], .shell-bar-status[data-count="urgent"]'
const AGENT = { name: 'Made-up Bar Agent', handle: 'made-up-bar-agent' }
const OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}
const AS_THE_AGENT = { ...OWNER, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': AGENT.handle }

let app: LiveApp

async function file(path: string, body: object, headers: Record<string, string>): Promise<Record<string, any>> {
  const answer = await fetch(app.api + path, { method: 'POST', headers, body: JSON.stringify(body) })
  const text = await answer.text()
  expect(answer.status, `${path}: ${text.slice(0, 600)}`).toBe(201)
  return JSON.parse(text) as Record<string, any>
}

beforeAll(async () => {
  app = await liveApp({ name: CALLED, workspace: 'default', viewport: PHONE })
  await file('/api/records', { kind: 'agent', title: AGENT.name, data: { handle: AGENT.handle, runtime: 'claude-code', state: 'active' } }, OWNER)
  // A FORK THE PERSON SETTLES, so the bar draws the Decisions count.
  await file('/api/records', {
    kind: 'proposal',
    title: 'A made-up fork for the bar order',
    data: {
      question: 'Which made-up shelf takes the new folders?',
      options: ['a — The top shelf.', 'b — The low shelf.'],
      recommendation: 'Take (a). It is empty.',
      because: 'Made up for the bar order test.',
      who_settles_it: 'the owner',
    },
  }, AS_THE_AGENT)
  // SEVEN OPEN PROBLEMS WAITING ON THE PERSON, so the attention list draws the pill saying "7 urgent".
  for (let i = 1; i <= URGENT; i++) {
    await file('/api/records', {
      kind: 'problem',
      title: `Made-up bar order problem ${String(i)}`,
      data: { state: 'open', whose_move: 'person' },
    }, OWNER)
  }
}, 300_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

/** A fresh window whose stored theme is set before the app runs. */
async function aWindow(width: number, height: number, theme: 'light' | 'dark'): Promise<{ context: BrowserContext; page: Page }> {
  const context = await app.browser.newContext({ viewport: { width, height } })
  await context.addInitScript(({ id, theme }) => {
    localStorage.setItem('mole-office.actor', JSON.stringify({ type: 'human', id }))
    localStorage.setItem('mole-office.preset.theme', theme)
    localStorage.setItem('mole-office.workspace', 'default')
  }, { id: THE_TEST_OFFICES_OWNER.id, theme })
  return { context, page: await context.newPage() }
}

async function open(page: Page, address: string): Promise<void> {
  await page.goto(`${app.site}/?lang=en#${address}`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
}

/** Both counts are really drawn, or this measures a bar that never had the problem. */
async function theBarWithBothCounts(page: Page): Promise<void> {
  await page.locator('.shell-bar a.shell-bar-status[data-count="decisions"]').waitFor({ timeout: 30_000 })
  const pill = page.locator('.shell-bar-status[data-count="urgent"]')
  await pill.waitFor({ timeout: 30_000 })
  expect(await pill.isVisible()).toBe(true)
  expect((await pill.innerText()).replace(/\s+/g, ' ').trim()).toBe(readStoredWord('frameWords.pill.urgentCount', { n: URGENT }))
}

/** The four presses, in the order they stand in the page, and in the order they stand on screen. */
async function thePresses(page: Page): Promise<{ inThePage: string[]; onScreen: string[] }> {
  return page.locator('.shell-bar').evaluate((bar, selector) => {
    const nameOf = (one: Element): string => {
      if (one.classList.contains('shell-menu')) return 'menu'
      if (one.classList.contains('shell-chat-phone')) return 'chat'
      const count = (one as HTMLElement).dataset['count']
      if (count === 'decisions') return 'decisions'
      if (count === 'urgent') return 'urgent'
      return 'another press'
    }
    const drawn = [...bar.querySelectorAll(selector)].filter(
      (one) => one.matches('button, a[href]') && one.getClientRects().length > 0,
    )
    const boxes = drawn.map((one) => {
      const at = one.getBoundingClientRect()
      return { name: nameOf(one), top: at.top, bottom: at.bottom, left: at.left }
    })
    // LEFT TO RIGHT, THEN TOP TO BOTTOM. Two presses that share vertical room stand on one row.
    boxes.sort((a, b) => {
      const overlap = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
      return overlap <= 0 ? a.top - b.top || a.left - b.left : a.left - b.left
    })
    return { inThePage: drawn.map(nameOf), onScreen: boxes.map((one) => one.name) }
  }, THE_PRESSES)
}

/** The order the Tab key meets the four presses, starting at the menu press. */
async function theOrderTheTabKeyMeets(page: Page): Promise<string[]> {
  await page.locator('.shell-menu').focus()
  const met: string[] = []
  for (let i = 0; i < 4; i++) {
    const name = await page.evaluate(() => {
      const one = document.activeElement
      if (!(one instanceof Element)) return null
      if (one.classList.contains('shell-menu')) return 'menu'
      if (one.classList.contains('shell-chat-phone')) return 'chat'
      const count = one.getAttribute('data-count')
      return count === 'decisions' || count === 'urgent' ? count : null
    })
    if (name === null) break
    met.push(name)
    await page.keyboard.press('Tab')
  }
  return met
}

it("stands the phone bar's presses in the page in the order they are seen", async () => {
  for (const theme of LOOKS) {
    const { context, page } = await aWindow(PHONE.width, PHONE.height, theme)
    try {
      await open(page, pathFor('records'))
      expect(await page.locator('html').getAttribute('data-theme'), `the ${theme} look is not the look the page is in`).toBe(theme)
      await theBarWithBothCounts(page)
      const { inThePage, onScreen } = await thePresses(page)
      expect(onScreen, `the ${theme} look: the order the eye reads`).toEqual(THE_PHONE_ORDER)
      expect(inThePage, `the ${theme} look: the order the presses stand in the page`).toEqual(onScreen)
    } finally {
      await context.close()
    }
  }
}, 240_000)

it("meets the phone bar's presses by Tab in the order they are seen", async () => {
  for (const theme of LOOKS) {
    const { context, page } = await aWindow(PHONE.width, PHONE.height, theme)
    try {
      await open(page, pathFor('records'))
      await theBarWithBothCounts(page)
      const { onScreen } = await thePresses(page)
      expect(onScreen, `the ${theme} look: the order the eye reads`).toEqual(THE_PHONE_ORDER)
      expect(await theOrderTheTabKeyMeets(page), `the ${theme} look: the order the Tab key meets the presses`).toEqual(onScreen)
    } finally {
      await context.close()
    }
  }
}, 240_000)

it("keeps the phone's order in the page when a wide window is narrowed to a phone's", async () => {
  const { context, page } = await aWindow(NARROW_START.width, NARROW_START.height, 'light')
  try {
    await open(page, pathFor('records'))
    await theBarWithBothCounts(page)
    const wide = await thePresses(page)
    expect(wide.onScreen, 'at 660 the order the eye reads').toEqual(THE_ORDER_AT_660)
    expect(wide.inThePage, 'at 660 the order the presses stand in the page').toEqual(THE_ORDER_AT_660)
    await page.setViewportSize({ width: PHONE.width, height: PHONE.height })
    await expect
      .poll(async () => (await thePresses(page)).inThePage, { timeout: 15_000 })
      .toEqual(THE_PHONE_ORDER)
    const narrow = await thePresses(page)
    expect(narrow.onScreen, 'at 390, after narrowing, the order the eye reads').toEqual(THE_PHONE_ORDER)
    expect(narrow.inThePage, 'at 390, after narrowing, the order the presses stand in the page').toEqual(narrow.onScreen)
  } finally {
    await context.close()
  }
}, 180_000)

it("keeps the order at 660 that it has where the bar is not a phone's", async () => {
  const { context, page } = await aWindow(NARROW_START.width, NARROW_START.height, 'light')
  try {
    await open(page, pathFor('records'))
    await theBarWithBothCounts(page)
    expect((await thePresses(page)).onScreen, 'at 660 the order the eye reads').toEqual(THE_ORDER_AT_660)
  } finally {
    await context.close()
  }
}, 120_000)

it.skipIf(PICTURES === undefined)('takes the bar at the widths and looks named', async () => {
  const folder = PICTURES!
  mkdirSync(folder, { recursive: true })
  const measures: { width: number; theme: string; presses: { inThePage: string[]; onScreen: string[] } }[] = []
  for (const width of PICTURE_WIDTHS) {
    for (const theme of PICTURE_LOOKS) {
      const { context, page } = await aWindow(width, width === PHONE.width ? PHONE.height : 900, theme)
      try {
        await open(page, pathFor('records'))
        expect(await page.locator('html').getAttribute('data-theme'), `the ${theme} picture is not in its look`).toBe(theme)
        await page.locator('.shell-bar a.shell-bar-status[data-count="decisions"]').waitFor({ timeout: 30_000 }).catch(() => undefined)
        await page.locator('.shell-bar-status[data-count="urgent"]').waitFor({ timeout: 30_000 }).catch(() => undefined)
        if (width < 1024) measures.push({ width, theme, presses: await thePresses(page) })
        await putTheMadeUpLabelIn(page, LABEL, page.locator(THE_PAGE_TOP).first(), CALLED)
        // THE POINTER OFF THE PAGE, so no hover is drawn in the picture.
        await page.mouse.move(width - 2, (width === PHONE.width ? PHONE.height : 900) - 2)
        await page.waitForTimeout(500)
        await page.screenshot({ path: join(folder, `bar-order-${String(width)}-${theme}.png`) })
      } finally {
        await context.close()
      }
    }
  }
  writeFileSync(join(folder, 'bar-order-measures.json'), JSON.stringify(measures, null, 2))
}, 300_000)
