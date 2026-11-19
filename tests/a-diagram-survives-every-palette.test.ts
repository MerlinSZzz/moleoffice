// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A diagram uses the colours of every look Settings offers: the two named looks, Light and Dark, which
 * tokens.css declares, and the themes kept as data (src/shared/themes.ts), which the page draws into a
 * style element of their own. The list is THEME_CHOICES, the list Settings offers, so a theme added to
 * the data is walked here with nothing to change. Auto is the absence of the attribute and is worn last.
 * Five older palettes were removed by a decision, and their hue-only checks went with them; the checks
 * for drawing, theme tokens and hard-coded colours apply to every look.
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

/** Every palette a reader can choose, Auto aside: the list Settings offers, read in beforeAll. */
let PALETTES: readonly string[] = []

/** A flowchart with two node shapes and a labelled edge, so shape and word carry the meaning. */
const DIAGRAM = [
  '```mermaid',
  'flowchart TD',
  '  A[The worker builds] -->|passes| B{The check}',
  '  B -->|refused| A',
  '  B -->|held| C[(The record)]',
  '```',
].join('\n')

let app: LiveApp
let page: Page

/** Every colour the drawn SVG uses, from its attributes and its own stylesheet. */
async function coloursDrawn(): Promise<string[]> {
  return (await page.evaluate(() => {
    const svg = document.querySelector('.sb-diagram svg')
    if (svg === null) return []
    const found = new Set<string>()
    const take = (value: string | null) => {
      if (value === null) return
      for (const one of value.matchAll(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)/g)) {
        found.add(one[0].toLowerCase())
      }
    }
    // Mermaid writes most of its colour into a stylesheet inside the SVG.
    for (const sheet of svg.querySelectorAll('style')) take(sheet.textContent)
    // And the rest onto the elements themselves.
    for (const el of svg.querySelectorAll('*')) {
      take(el.getAttribute('fill'))
      take(el.getAttribute('stroke'))
      take(el.getAttribute('style'))
    }
    return [...found]
  })) as string[]
}

/** The computed value of every token the component draws a diagram out of. */
async function tokensNow(): Promise<string> {
  return (await page.evaluate(() => {
    const style = getComputedStyle(document.documentElement)
    return ['--panel', '--panel-2', '--panel-3', '--border', '--border-strong', '--text', '--text-3']
      .map((token) => style.getPropertyValue(token).trim())
      .join(';')
  })) as string
}

/**
 * Set the palette the way `applyPresets` does, data-theme-from beside a theme from the data included,
 * and wait for the picture to be drawn again.
 *
 * A PALETTE THAT MOVES NOTHING ASKS FOR NOTHING. `light` declares the same values as the bare
 * `:root` block, so choosing it on a light-preferring machine changes no token, the component has
 * no reason to draw anything again, and waiting for a new picture would wait for ever. So the
 * tokens are read on both sides and only a real change is waited on — which is also the claim that
 * the component watches the token VALUES rather than the attribute.
 */
async function wear(theme: string | null): Promise<void> {
  const wasTokens = await tokensNow()
  const wasId = await page.evaluate(() => document.querySelector('.sb-diagram svg')?.id ?? '')
  await page.evaluate(
    ([chosen, fromTheData]) => {
      if (chosen === null) document.documentElement.removeAttribute('data-theme')
      else document.documentElement.setAttribute('data-theme', chosen)
      if (fromTheData) document.documentElement.setAttribute('data-theme-from', 'data')
      else document.documentElement.removeAttribute('data-theme-from')
    },
    [theme, theme !== null && isThemeId(theme)] as const,
  )
  if ((await tokensNow()) === wasTokens) return
  // The picture is drawn again under a new name, so a new name is how "drawn again" is known.
  await page.waitForFunction(
    (before) => {
      const svg = document.querySelector('.sb-diagram svg')
      return svg !== null && svg.id !== before
    },
    wasId,
    { timeout: 20_000 },
  )
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
  PALETTES = bar.THEME_CHOICES.filter((choice) => choice !== 'auto')
  // THIS FILE IS ABOUT WHAT IS INSIDE A REPORT'S BODY, SO IT SAYS WHICH LEVEL IT READS AT.
  // The owner's act 3a of 15 September 2026 made a record page open at the
  // conclusion, where the body holds the summary and nothing else, so a test that measures a
  // diagram, a picture, a mark, a tab stop or a panel inside the writing found an empty body and
  // waited for a selector that would never appear. `opensAt` writes the reader's own stored
  // choice before the page loads, so this file is about its own subject again and not about the
  // level a page opens at. That level has its own test in
  // tests/a-reader-goes-no-lower-than-conclusion.test.ts, which stores nothing.
  app = await liveApp({ opensAt: 'full', name: 'diagram-every-palette', viewport: { width: 1440, height: 1000 } })
  page = app.page
  const res = await fetch(`http://127.0.0.1:${String(app.apiPort)}/api/records`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      kind: 'report',
      title: 'One diagram, looked at in every palette',
      summary: 'A single mermaid flowchart, so the colours in the drawing can be read against the tokens.',
      data: { blocks: [{ id: 'b-1', type: 'text', heading: 'The diagram', text: DIAGRAM }] },
    }),
  })
  if (!res.ok) throw new Error(`filing the report answered ${String(res.status)}: ${await res.text()}`)
  const id = ((await res.json()) as { record: { id: string } }).record.id
  await page.goto(`http://127.0.0.1:${String(app.webPort)}/#/r/${id}`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.waitForSelector('.sb-diagram svg', { timeout: 60_000 })
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

describe('a diagram in every palette', () => {
  it('is every look Settings offers: the two named looks read out of tokens.css, and every theme from the data', () => {
    expect(IN_THE_SHEET, 'tokens.css declares other named looks than Light and Dark').toEqual(['light', 'dark'])
    expect(PALETTES.length, 'fewer palettes are walked than Settings offers').toBe(IN_THE_SHEET.length + THEMES.length)
    // `auto` is the ABSENCE of the attribute, so it is a choice with no block of its own.
    expect(PALETTES).toEqual([...IN_THE_SHEET, ...THEMES.map((theme) => theme.id)])
  })

  it('draws a picture in each of them, and draws it again when the palette changes', async () => {
    for (const theme of PALETTES) {
      await wear(theme)
      expect(await page.locator('.sb-diagram svg').count(), `no picture in ${theme}`).toBe(1)
      expect((await coloursDrawn()).length, `the drawing in ${theme} uses no colour at all`).toBeGreaterThan(2)
    }
    // And back to the system's own choice, which is the absence of the attribute.
    await wear(null)
    expect(await page.locator('.sb-diagram svg').count()).toBe(1)
  })

  /**
   * WHAT THIS CAN HONESTLY CHECK AND WHAT IT CANNOT.
   *
   * Mermaid DERIVES colours from the ones it is handed — a label's colour from the fill behind it,
   * a lighter edge from a darker one — so "every colour in the drawing is a declared token" is not
   * true and asserting it would be asserting something wrong. What is true and is checked here: the
   * palette's own values are IN the drawing, and every colour moves when the palette does.
   */
  it('draws with the palette own values, and every colour moves when the palette does', async () => {
    const seen = new Map<string, string[]>()
    for (const theme of PALETTES) {
      await wear(theme)
      const declared = (
        (await page.evaluate(() => {
          const style = getComputedStyle(document.documentElement)
          return ['--panel', '--panel-2', '--panel-3', '--border', '--border-strong', '--text', '--text-3'].map(
            (token) => style.getPropertyValue(token).trim().toLowerCase(),
          )
        })) as string[]
      ).filter((v) => v !== '')
      const colours = await coloursDrawn()
      seen.set(theme, colours)
      const fromTheTokens = colours.filter((colour) => declared.includes(colour))
      expect(
        fromTheTokens.length,
        `${theme}: none of that palette's own values is anywhere in the drawing`,
      ).toBeGreaterThanOrEqual(3)
    }
    // AND THE DRAWING IS NOT THE SAME DRAWING IN EVERY PALETTE. A component that read the tokens
    // once and kept the answer would pass everything above and fail here.
    const light = new Set(seen.get('light') ?? [])
    const dark = seen.get('dark') ?? []
    expect(dark.length, 'nothing was collected in dark').toBeGreaterThan(2)
    expect(
      dark.some((colour) => !light.has(colour)),
      'the drawing uses exactly the same colours in light and in dark',
    ).toBe(true)
  })


})
