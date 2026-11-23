// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A SCROLL TO A PLACE STOPS BELOW THE PHONE'S BAR. Wave 13u round 181, the handbook kind's third leftover: in round
 * 178's pictures at 390px the frame's bar, which sticks to the top of the window below 1024px, was drawn across the
 * worker card's name. Measured on main in this round: every scroll that brings a place to the top of the window (a
 * jump to an address, and the thirteen calls in the web code that scroll with block 'start') stopped with the place's
 * first 54px (at 660 and 990) or 70px (at 390) under the bar. Records, Messages, the regulations page, the review
 * pane and Settings each kept an allowance of their own for the bar. The frame now tells the window the bar's height
 * as its scroll-padding-top (App.tsx, useTheBarIsRoomAtTheTop), and those five leave the room to the frame.
 *
 * Everything here is read off the built page, drawn from a throwaway server.
 *
 * MUTATIONS, each red here:
 *   1. App.tsx: take out the call to useTheBarIsRoomAtTheTop. Every case but 1440 is red: the worker card's name is
 *      under the bar at 390 and 990 and under the taller bar, a Settings heading at 390 stops under the list,
 *      and a regulations chapter's heading at 390 stops under the bar.
 *   2. App.tsx: measure the bar once and not again when its size changes (no ResizeObserver). A bar made taller after
 *      the page opened covers the name, and a regulations chapter's heading at 390 stops 56px below the bar.
 *   3. App.tsx: write the room as 54px, the bar's height at 660 and 990, instead of measuring it. At 390 the bar is
 *      70px tall and covers the top of the name, at 1440 the name stops 54px below the top of the window, and the
 *      taller bar, the Settings heading and the regulations heading are red too. Only 990 stays green.
 *   4. SettingsFolds.tsx: add barHeight() back into stuckAbove. A pressed category's heading stops a bar's height
 *      below the list.
 *   5. RegulationsPage.tsx: put `scroll-margin-top: 4.5rem` back on a chapter's heading. A pressed chapter's heading
 *      stops 72px below the bar.
 * The Settings case reads the room from Settings and measures from the bar, or from the list when it sticks there.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Browser, Page } from 'playwright'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'

let app: LiveApp

beforeAll(async () => {
  app = await liveApp({ name: 'a-scroll-stops-below-the-bar', workspace: 'default', viewport: { width: 390, height: 844 } })
}, 300_000)
afterAll(async () => {
  await app?.stop()
})

/** A fresh window of the given width on the Role cards page, with the worker card drawn. */
async function theRoleCards(browser: Browser, width: number): Promise<{ page: Page; close: () => Promise<void> }> {
  const context = await browser.newContext({ viewport: { width, height: 844 } })
  const page = await context.newPage()
  await page.goto(`${app.site}/#/roles`)
  await waitForThePage(page)
  await page.locator('li.rol-block h3.rol-name', { hasText: /^worker$/ }).first().waitFor({ timeout: 30_000 })
  return { page, close: () => context.close() }
}

/** Two frames, so a size change has reached the observers that follow it before anything is measured. */
const twoFrames = (page: Page) => page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))))

/**
 * Scroll the worker card's name to the top of the window, as every block 'start' scroll does, and say where it stopped
 * against the bar: the name's top, the bar's foot (0 where the bar is not drawn), and whether the name itself is what
 * is drawn at its middle.
 */
async function scrollToTheName(page: Page): Promise<{ top: number; bar: number; drawn: boolean; nameIsOnTop: boolean }> {
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.locator('li.rol-block h3.rol-name', { hasText: /^worker$/ }).first().evaluate((name) => name.scrollIntoView({ block: 'start' }))
  await twoFrames(page)
  return page.locator('li.rol-block h3.rol-name', { hasText: /^worker$/ }).first().evaluate((name) => {
    const bar = document.querySelector('.shell-bar')
    const drawn = bar instanceof HTMLElement && getComputedStyle(bar).display !== 'none'
    const box = name.getBoundingClientRect()
    const hit = document.elementFromPoint(box.left + Math.min(10, box.width / 2), box.top + box.height / 2)
    return { top: box.top, bar: drawn ? bar.getBoundingClientRect().bottom : 0, drawn, nameIsOnTop: hit !== null && name.contains(hit) }
  })
}

describe('a scroll to the worker card\'s name', () => {
  for (const width of [390, 990]) {
    it(`stops with the name just below the bar at ${String(width)}`, async () => {
      const { page, close } = await theRoleCards(app.browser, width)
      try {
        const at = await scrollToTheName(page)
        const said = JSON.stringify(at)
        expect(at.drawn, `the bar is not drawn at ${String(width)}: ${said}`).toBe(true)
        expect(at.top, `the name starts above the bar's foot: ${said}`).toBeGreaterThanOrEqual(at.bar - 0.5)
        expect(at.nameIsOnTop, `something is drawn over the name: ${said}`).toBe(true)
        // AND NO LOWER THAN THAT. The room is the bar's height and nothing more, so a page that keeps its own
        // allowance for the bar on top of the frame's is caught here, the way Settings was.
        expect(at.top, `the name stops further below the bar than the bar is tall: ${said}`).toBeLessThanOrEqual(at.bar + 1)
      } finally {
        await close()
      }
    }, 120_000)
  }

  it('stops at the top of the window at 1440, where the bar is not drawn', async () => {
    const { page, close } = await theRoleCards(app.browser, 1440)
    try {
      const at = await scrollToTheName(page)
      expect(at.drawn, JSON.stringify(at)).toBe(false)
      expect(Math.abs(at.top), `the window keeps room at its top with no bar there: ${JSON.stringify(at)}`).toBeLessThanOrEqual(0.5)
    } finally {
      await close()
    }
  }, 120_000)

  it('follows the bar when the bar grows after the page opened', async () => {
    const { page, close } = await theRoleCards(app.browser, 660)
    try {
      // A taller bar, as when the counts wrap to a second row. Made here by a rule, since a made-up office has no
      // counts long enough to wrap at a width a test can name.
      await page.addStyleTag({ content: '.shell-bar { min-height: 120px; }' })
      await twoFrames(page)
      const at = await scrollToTheName(page)
      expect(at.bar, `the bar did not grow: ${JSON.stringify(at)}`).toBeGreaterThanOrEqual(120)
      expect(at.top, `the name starts above the taller bar's foot: ${JSON.stringify(at)}`).toBeGreaterThanOrEqual(at.bar - 0.5)
      expect(at.nameIsOnTop, `something is drawn over the name: ${JSON.stringify(at)}`).toBe(true)
    } finally {
      await close()
    }
  }, 120_000)
})

/** The room Settings keeps under its list, read from Settings itself so that it is not written here a second time. */
async function theRoomUnderTheList(): Promise<number> {
  const settings: object = await import('../src/web/components/SettingsFolds.tsx')
  const room: unknown = Reflect.get(settings, 'ROOM_UNDER_THE_LIST')
  expect(room, 'SettingsFolds.tsx exports no ROOM_UNDER_THE_LIST').toBeTypeOf('number')
  return room as number
}

describe('a category pressed in Settings at 390', () => {
  it('stops with its heading below what stays at the top', async () => {
    const room = await theRoomUnderTheList()
    const context = await app.browser.newContext({ viewport: { width: 390, height: 844 } })
    try {
      const page = await context.newPage()
      await page.goto(`${app.site}/#/settings`)
      await waitForThePage(page)
      await page.locator('.set .sf-row').waitFor({ timeout: 30_000 })
      const keys = await page.locator('.set .sf-jump').evaluateAll((all) => all.map((one) => one.getAttribute('data-category') ?? ''))
      expect(keys.length, 'the list draws no categories').toBeGreaterThan(1)
      let measuredAwayFromTheEnd = 0
      for (const key of keys) {
        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
        await page.locator(`.set .sf-jump[data-category="${key}"]`).click()
        await page.locator(`.set .sf-cat[data-category="${key}"]`).waitFor({ timeout: 30_000 })
        // A sticky list covers the bar's foot; a list in the page moves away, leaving the bar as the edge to clear.
        // The heading should stop at the measured edge plus the room, unless the end of the page prevents that.
        const where = () =>
          page.evaluate((room) => {
            const row = document.querySelector('.set .sf-row') as HTMLElement
            const heading = document.querySelector('.set .sf-cat-title') as HTMLElement
            const bar = document.querySelector('.shell-bar') as HTMLElement
            const edge = getComputedStyle(row).position === 'sticky' ? row.getBoundingClientRect().bottom : bar.getBoundingClientRect().bottom
            const below = heading.getBoundingClientRect().top - edge
            const atTheEnd = Math.ceil(window.scrollY + window.innerHeight) >= document.documentElement.scrollHeight - 1
            if (Math.abs(below - room) <= 1.5) return atTheEnd ? 'at its top, at the end' : 'at its top'
            if (atTheEnd && below >= 0 && heading.getBoundingClientRect().top < window.innerHeight) return 'at the end'
            return `${String(Math.round(below))}px below the top edge, scrolled ${String(Math.round(window.scrollY))}`
          }, room)
        await expect.poll(where, { message: key, timeout: 15_000 }).toMatch(/^at (its top|the end)/)
        if ((await where()) === 'at its top') measuredAwayFromTheEnd += 1
      }
      // A heading the page could not scroll any further proves nothing about the room, so at least one category has
      // to have been measured away from the page's end.
      expect(measuredAwayFromTheEnd, `every category stopped at the end of the page: ${keys.join(', ')}`).toBeGreaterThan(0)
    } finally {
      await context.close()
    }
  }, 240_000)
})

describe('a chapter pressed on the regulations page at 390', () => {
  it('stops with its heading just below the bar', async () => {
    const context = await app.browser.newContext({ viewport: { width: 390, height: 844 } })
    try {
      const page = await context.newPage()
      await page.goto(`${app.site}/#/regulations`)
      await waitForThePage(page)
      // THE THIRD CHAPTER: far enough down that the press has to scroll to it, and far enough from the page's end that
      // the page can bring it to the top.
      const press = page.locator('.ofc-toc-go[data-chapter="3"]')
      await press.waitFor({ timeout: 30_000 })
      await press.click()
      // The press scrolls smoothly, so the heading is read until it stops where it should, or the wait ends.
      const where = () =>
        page.evaluate(() => {
          const bar = document.querySelector('.shell-bar') as HTMLElement
          const heading = document.getElementById('ofc-ch-3') as HTMLElement
          const below = heading.getBoundingClientRect().top - bar.getBoundingClientRect().bottom
          return below >= -0.5 && below <= 1 ? 'just below the bar' : `${String(Math.round(below))}px below the bar's foot, scrolled ${String(Math.round(window.scrollY))}`
        })
      await expect.poll(where, { timeout: 15_000 }).toBe('just below the bar')
    } finally {
      await context.close()
    }
  }, 120_000)
})
