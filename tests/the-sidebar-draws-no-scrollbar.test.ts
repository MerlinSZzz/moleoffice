// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SIDEBAR DRAWS NO SCROLLBAR, AND ITS LIST STILL SCROLLS. When the sidebar's rows are taller than the window, the
 * list scrolls by the wheel, by touch and by the keyboard, and no bar is drawn beside it: open, narrowed and as the
 * menu. A bar 15 pixels wide took a column out of a sidebar narrowed to its icons, and stood beside
 * the rows at every width.
 *
 * WHAT IS MEASURED, in a browser that draws scrollbars as a person's does, on a test office of this file's own, with
 * eleven pages pinned in front so that the rows are taller than a window 600 pixels high. It is measured open and
 * narrowed at 1440, and as the menu at 390, in the light theme only, since a bar is not a matter of colour:
 *   1. The list's rows are taller than the list, so the checks below have something to scroll.
 *   2. Each part of the sidebar that can scroll declares scrollbar-width none, and hides its webkit scrollbar for a
 *      browser that reads only that rule. Neither draws a bar: its width and its inner width are the same. Each part
 *      still scrolls on its own (overflow-y auto), which is what a finger's scroll needs.
 *   3. The column is no taller than the window: at 600 pixels its head, the list and its foot fit, so the list is the
 *      only part that scrolls, and a wheel over the head or the foot moves nothing.
 *   4. The wheel over the list moves it.
 *   5. A Tab to an entry below the fold scrolls the list until the entry is in view.
 *
 * WHY A BROWSER OF ITS OWN: the shared test browser starts with --hide-scrollbars, so no part draws a bar in it and the
 * width check could not fail there. This file's browser is the same Chromium, started without that word.
 */
import type { Browser, Page } from 'playwright'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { SIDEBAR_KEY } from '../src/web/components/Sidebar.tsx'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { liveApp, storeNormalModeWhereNothingIsStored, waitForThePage, type LiveApp } from './helpers.ts'

const OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}

/** Eleven pages in front, none of them a page of the project, so the rows are taller than the window. */
const MANY_PINS = ['home', 'notes', 'checklists', 'decisions', 'plans', 'horizons', 'counters', 'working', 'agents', 'embassy', 'regulations']
/** The parts of the sidebar that can scroll: the whole column, and the list between Ask agent and the foot. */
const THE_PARTS = ['.shell-side-inner', '.sbp-scroll'] as const
const THE_LIST = '#shell-side .sbp-scroll'
const HEIGHT = 600

type Look = { what: string; theme: 'light' | 'dark'; width: number; narrowed: boolean; menu: boolean }
const LOOKS: Look[] = (['light'] as const).flatMap((theme) => [
  { what: `open at 1440, ${theme}`, theme, width: 1440, narrowed: false, menu: false },
  { what: `narrowed at 1440, ${theme}`, theme, width: 1440, narrowed: true, menu: false },
  { what: `the menu at 390, ${theme}`, theme, width: 390, narrowed: false, menu: true },
])

let app: LiveApp
let drawsBars: Browser | undefined

beforeAll(async () => {
  app = await liveApp({ name: 'the-sidebar-draws-no-scrollbar', workspace: 'default', viewport: { width: 1440, height: HEIGHT } })
  const { chromium } = await import('playwright')
  drawsBars = await chromium.launch({ ignoreDefaultArgs: ['--hide-scrollbars'] })
  const put = await fetch(`${app.api}/api/sidebar-pins`, { method: 'PUT', headers: OWNER, body: JSON.stringify({ pins: MANY_PINS }) })
  expect(put.status, await put.clone().text()).toBe(200)
}, 300_000)

afterAll(async () => {
  await drawsBars?.close()
  await app?.stop()
}, 60_000)

/** A window of the browser that draws scrollbars, 600 pixels high, with the sidebar as the look asks and Home behind it. */
async function aWindow(look: Look): Promise<{ page: Page; close: () => Promise<void> }> {
  const context = await drawsBars!.newContext({ viewport: { width: look.width, height: HEIGHT } })
  // This Chromium is the file's own, so it stores Normal mode as the shared one does: see the helper.
  await storeNormalModeWhereNothingIsStored(context)
  await context.addInitScript(({ actor, theme, narrowed, key }) => {
    localStorage.setItem('mole-office.actor', JSON.stringify(actor))
    localStorage.setItem('mole-office.preset.theme', theme)
    localStorage.setItem('mole-office.chat.open', 'no')
    localStorage.setItem(key, narrowed ? 'collapsed' : 'expanded')
    localStorage.setItem('mole-office.workspace', 'default')
  }, { actor: { type: 'human', id: THE_TEST_OFFICES_OWNER.id }, theme: look.theme, narrowed: look.narrowed, key: SIDEBAR_KEY })
  const page = await context.newPage()
  await page.goto(`${app.site}/?lang=en#/`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.locator('#shell-side [data-target="uiSurface/rail.allpages"]').waitFor({ state: 'attached', timeout: 30_000 })
  if (look.narrowed) await page.locator('#shell-side[data-state="collapsed"]').waitFor()
  if (look.menu) {
    await page.locator('.shell-menu').click()
    await page.locator('#shell-side[data-drawer="open"]').waitFor()
  }
  await page.waitForTimeout(600)
  return { page, close: () => context.close() }
}

/** How each part that can scroll is drawn: how it overflows, the scrollbar it declares, and the bar it draws. */
async function howThePartsScroll(page: Page) {
  return page.evaluate((selectors) => {
    // A rule anywhere in the page's style sheets, inside a media rule too, that hides this part's webkit scrollbar.
    const rules = (list: CSSRuleList): CSSRule[] => [...list].flatMap((rule) => rule instanceof CSSGroupingRule ? rules(rule.cssRules) : [rule])
    const every = [...document.styleSheets].flatMap((sheet) => rules(sheet.cssRules))
    const hidesTheWebkitBar = (selector: string): boolean => every.some((rule) => rule instanceof CSSStyleRule
      && rule.style.display === 'none'
      && rule.selectorText.split(',').some((one) => one.trim().endsWith(`${selector}::-webkit-scrollbar`)))
    return selectors.map((selector) => {
      const part = document.querySelector(`#shell-side ${selector}`)
      if (!(part instanceof HTMLElement)) return { selector, drawn: false }
      const style = getComputedStyle(part)
      return {
        selector,
        drawn: true,
        overflowY: style.overflowY,
        scrollbarWidth: style.scrollbarWidth,
        webkitBarHidden: hidesTheWebkitBar(selector),
        bar: part.offsetWidth - part.clientWidth - parseFloat(style.borderLeftWidth) - parseFloat(style.borderRightWidth),
      }
    })
  }, [...THE_PARTS])
}

const toTheTop = (page: Page): Promise<void> => page.locator(THE_LIST).evaluate((list) => { list.scrollTop = 0 })

it.each(LOOKS)('$what: no bar beside the list, and the wheel and the Tab key still scroll it', async (look) => {
  const { page, close } = await aWindow(look)
  try {
    // 1. The rows are taller than the list.
    const size = await page.locator(THE_LIST).evaluate((list) => ({ rows: list.scrollHeight, list: list.clientHeight }))
    expect(size.rows, `the rows' height against the list's ${String(size.list)}`).toBeGreaterThan(size.list)

    // 2. No part draws a bar, and each still scrolls.
    const noBar = THE_PARTS.map((selector) => ({ selector, drawn: true, overflowY: 'auto', scrollbarWidth: 'none', webkitBarHidden: true, bar: 0 }))
    expect(await howThePartsScroll(page), 'the parts that can scroll').toEqual(noBar)

    // 3. The column is no taller than the window, so only the list scrolls.
    const column = await page.locator('#shell-side .shell-side-inner').evaluate((inner) => ({ height: inner.scrollHeight, window: inner.clientHeight }))
    expect(column.height, 'the column\'s height against the window').toBe(column.window)

    // 4. The wheel over the list moves it.
    await toTheTop(page)
    const box = await page.locator(THE_LIST).boundingBox()
    expect(box, 'the list drawn').not.toBeNull()
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2)
    await page.mouse.wheel(0, 200)
    await expect.poll(() => page.locator(THE_LIST).evaluate((list) => list.scrollTop), { message: 'the list after the wheel', timeout: 5_000 }).toBeGreaterThan(0)

    // 5. A Tab from the last stop above the fold to the first one below it brings that one into view.
    await page.mouse.move(look.width - 5, HEIGHT - 5)
    await toTheTop(page)
    const chosen = await page.locator(THE_LIST).evaluate((list) => {
      const fold = list.getBoundingClientRect().bottom
      const stops = [...list.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input, select, textarea, [tabindex]')]
        .filter((one) => one.tabIndex >= 0 && one.getClientRects().length > 0 && one.closest('[inert], [hidden]') === null)
      const below = stops.findIndex((one) => one.getBoundingClientRect().top >= fold)
      if (below < 1) return null
      stops[below]!.setAttribute('data-below-the-fold', '')
      stops[below - 1]!.focus()
      return { from: (stops[below - 1]!.textContent ?? '').trim(), to: (stops[below]!.textContent ?? '').trim() }
    })
    expect(chosen, 'a stop below the fold, with one above it to start from').not.toBeNull()
    await page.keyboard.press('Tab')
    const reached = await page.locator(THE_LIST).evaluate((list) => {
      const focused = document.activeElement
      const view = list.getBoundingClientRect()
      const box = focused?.getBoundingClientRect()
      return {
        theStopBelowTheFold: focused?.hasAttribute('data-below-the-fold') ?? false,
        inView: box !== undefined && box.top >= view.top - 1 && box.bottom <= view.bottom + 1,
        scrolled: list.scrollTop > 0,
      }
    })
    expect(reached, `a Tab from "${chosen!.from}" to "${chosen!.to}"`).toEqual({ theStopBelowTheFold: true, inView: true, scrolled: true })
  } finally {
    await close()
  }
}, 120_000)
