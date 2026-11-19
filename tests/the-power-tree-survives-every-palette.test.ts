// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * The power tree uses the colours of every look Settings offers: Auto, the two named looks, Light and Dark,
 * which tokens.css declares, and the themes kept as data (src/shared/themes.ts), which the page draws into a
 * style element of their own. The list is THEME_CHOICES, the list Settings offers, so a theme added to the data
 * is walked here with nothing to change. Five older palettes were removed by a decision, and their hue-only
 * checks went with them; the checks for drawing and for the palette's own tokens apply to every look.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Page } from 'playwright'
import { isThemeId, THEMES } from '../src/shared/themes.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'

type Bar = typeof import('../src/web/components/PresetBar.tsx')

const TOKENS = readFileSync(fileURLToPath(new URL('../src/web/tokens.css', import.meta.url)), 'utf8')

/** The named looks tokens.css declares a block for. An id may have a hyphen in it. */
const IN_THE_SHEET: readonly string[] = [
  ...new Set([...TOKENS.matchAll(/:root\[data-theme='([a-z0-9-]+)'\]/g)].map((m) => m[1] as string)),
]

/** Every palette a reader can choose: the list Settings offers, Auto first, read in beforeAll. `auto` is the
 * absence of the attribute. */
let PALETTES: readonly string[] = []

/** Every token name the sheet declares anywhere, and every style name a theme from the data sets, so the browser
 * can resolve each one in a palette. */
const TOKEN_NAMES: readonly string[] = [
  ...new Set([
    ...[...TOKENS.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1] as string),
    ...THEMES.flatMap((theme) => Object.keys(theme.values)),
  ]),
]

let app: LiveApp
let page: Page

/** Choose the palette the way `applyPresets` does, data-theme-from beside a theme from the data included, and let
 * the computed styles settle. */
async function wear(theme: string): Promise<void> {
  await page.evaluate(
    ([chosen, fromTheData]) => {
      if (chosen === 'auto') document.documentElement.removeAttribute('data-theme')
      else document.documentElement.setAttribute('data-theme', chosen)
      if (fromTheData) document.documentElement.setAttribute('data-theme-from', 'data')
      else document.documentElement.removeAttribute('data-theme-from')
    },
    [theme, isThemeId(theme)] as const,
  )
  await page.evaluate(
    () => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))),
  )
}

/** Every colour the drawing uses, from the computed styles of its own elements. */
async function coloursDrawn(): Promise<string[]> {
  return (await page.evaluate(() => {
    const root = document.querySelector('.rol-tree')
    if (root === null) return []
    const found = new Set<string>()
    const take = (value: string) => {
      const colour = value.trim().toLowerCase()
      if (colour === '' || colour === 'transparent' || colour === 'rgba(0, 0, 0, 0)') return
      found.add(colour)
    }
    for (const el of [root, ...root.querySelectorAll('*')]) {
      const style = getComputedStyle(el)
      take(style.color)
      take(style.backgroundColor)
      take(style.borderTopColor)
      take(style.borderRightColor)
      take(style.borderBottomColor)
      take(style.borderLeftColor)
    }
    return [...found]
  })) as string[]
}

/**
 * Every colour the palette's own tokens resolve to.
 *
 * A PROBE ELEMENT IS THE RESOLVER: `var(--name)` on an element resolves the chain, and the value
 * that comes back is the colour. The probe starts as a sentinel, so a token that is not a colour
 * resolves back to the sentinel and is left out.
 */
async function tokenColours(): Promise<string[]> {
  return (await page.evaluate((names: string[]) => {
    const probe = document.createElement('span')
    probe.style.color = 'rgb(1, 2, 3)'
    document.body.appendChild(probe)
    const found = new Set<string>()
    for (const name of names) {
      probe.style.color = `var(${name})`
      const value = getComputedStyle(probe).color.trim().toLowerCase()
      if (value !== 'rgb(1, 2, 3)') found.add(value)
    }
    probe.remove()
    return [...found]
  }, TOKEN_NAMES as string[])) as string[]
}


beforeAll(async () => {
  // The bar's import graph reads localStorage at module scope, so Node is given the smallest stand-in for a window
  // first, as in tests/a-theme-from-the-data-marks-the-root.test.ts, and it is taken away once the bar is read.
  const store = new Map<string, string>()
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  }
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: storage, sessionStorage: storage, location: { hash: '', search: '' },
    addEventListener: () => {}, removeEventListener: () => {},
  }
  const bar: Bar = await import('../src/web/components/PresetBar.tsx')
  delete (globalThis as unknown as { window?: unknown }).window
  PALETTES = bar.THEME_CHOICES
  app = await liveApp({ name: 'power-tree-every-palette', viewport: { width: 1440, height: 1000 } })
  page = app.page
  await page.goto(`http://127.0.0.1:${String(app.webPort)}/#/roles`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.waitForSelector('.rol-tree', { timeout: 60_000 })
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

describe('the power tree in every palette', () => {
  it('walks every look Settings offers: Auto, the two named looks read out of tokens.css, and every theme from the data', () => {
    expect(IN_THE_SHEET, 'tokens.css declares other named looks than Light and Dark').toEqual(['light', 'dark'])
    expect(PALETTES.length, 'fewer palettes are walked than Settings offers').toBe(1 + IN_THE_SHEET.length + THEMES.length)
    expect(PALETTES).toEqual(['auto', ...IN_THE_SHEET, ...THEMES.map((theme) => theme.id)])
  })

  it('draws the tree in each of them, out of that palette’s own tokens', async () => {
    for (const theme of PALETTES) {
      await wear(theme)
      const colours = await coloursDrawn()
      expect(colours.length, `the drawing in ${theme} uses no colour at all, which is a blank picture`).toBeGreaterThan(
        2,
      )
      const declared = new Set(await tokenColours())
      for (const colour of colours) {
        expect(
          declared.has(colour),
          `${theme} draws ${colour}, which is no token of that palette — a hard-coded colour`,
        ).toBe(true)
      }
    }
  })


  /**
   * AT 390 THE DRAWING SCROLLS INSIDE ITS BOX. The hierarchy is wider than a phone, so the box it
   * sits in scrolls sideways and the page itself does not. This is the width chapter 6 names, and it
   * is measured here because the palette pass is already a browser.
   */
  it('stays inside the page at 390, with its own box scrolling', async () => {
    await page.setViewportSize({ width: 390, height: 900 })
    await wear('light')
    const said = (await page.evaluate(() => {
      const scroll = document.querySelector('.rol-tree-scroll')
      const tree = document.querySelector('.rol-tree')
      if (scroll === null || tree === null) return null
      return {
        pageWidth: document.documentElement.scrollWidth,
        viewport: window.innerWidth,
        overflowX: getComputedStyle(scroll).overflowX,
        treeRight: tree.getBoundingClientRect().right,
      }
    })) as { pageWidth: number; viewport: number; overflowX: string; treeRight: number } | null
    expect(said, 'the drawing is not on the page at 390').not.toBeNull()
    if (said === null) return
    expect(said.pageWidth, 'the page scrolls sideways at 390, so the drawing spilled it').toBeLessThanOrEqual(
      said.viewport + 1,
    )
    expect(said.treeRight, 'the drawing reaches past the right edge at 390').toBeLessThanOrEqual(said.viewport + 1)
    expect(['auto', 'scroll'], 'the drawing has no box of its own to scroll in at 390').toContain(said.overflowX)
    await page.setViewportSize({ width: 1440, height: 1000 })
  })
})
