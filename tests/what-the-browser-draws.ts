// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * PUT RENDERED MARKUP IN A REAL BROWSER AND MEASURE WHAT IT DRAWS.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS EXISTS
 * ---------------------------------------------------------------------------------------
 *
 * Several tests here used to assert a rule of a stylesheet by matching its text. That answers a
 * question nobody asked. A selector string, a padding token and an exact declaration can all be
 * rewritten without changing one pixel, and they can all stay exactly as written while the rule
 * stops applying — a second rule further down the sheet wins, a class the rule needs is no longer
 * on the element, a custom property it reads is undeclared in one palette. In every one of those
 * cases the text match is green and the screen is wrong.
 *
 * So this loads the same markup a component renders, plus `src/web/tokens.css`, into headless
 * Chromium and reads back what the browser computed. The browser resolves the cascade, substitutes
 * the custom properties and lays the boxes out, which is what a person sees.
 *
 * ---------------------------------------------------------------------------------------
 * NO SERVER, NO PORT, NO NETWORK
 * ---------------------------------------------------------------------------------------
 *
 * The page is set with `setContent`, so nothing is served and nothing listens. That is the whole
 * difference between this and `tests/seven-surfaces.test.ts`, which drives the real product over
 * HTTP and is the right instrument for a question about behaviour. This one answers questions about
 * drawing only. `tests/tokens-in-a-browser.ts` is the same idea for tokens.css on its own, and it
 * is where the reasoning about `rem` and custom-property substitution is written out.
 *
 * WHAT IT STILL CANNOT SEE: anything that needs the app running — a listener, a fetch, a route. A
 * component's markup and its stylesheet are all that is here.
 */

import { readFileSync } from 'node:fs'
import { chromium, type Browser, type Page } from 'playwright'

/** The real token sheet, so `var(--pad)` and the palettes resolve exactly as they do in the app. */
const TOKENS = readFileSync(new URL('../src/web/tokens.css', import.meta.url), 'utf8')

/** Every palette a reader can choose, read out of the sheet rather than listed here. */
export const PALETTES: readonly string[] = [
  ...new Set([...TOKENS.matchAll(/:root\[data-theme='([a-z]+)'\]/g)].map((m) => m[1] as string)),
]

/** A browser holding one page of markup. */
export interface Drawn {
  /** The page itself, for a measurement that needs more than one value. */
  page: Page
  /** One computed property of the first element matching a selector. */
  styleOf(selector: string, property: string): Promise<string>
  /** Switch palette, the way the appearance control does: an attribute on the root element. */
  palette(theme: string | null): Promise<void>
  close(): Promise<void>
}

/**
 * Open a browser on this markup.
 *
 * The markup is expected to carry its own component stylesheets, which is what React renders when
 * a component writes `<style href precedence>`; only tokens.css is added.
 */
export async function drawInABrowser(
  markup: string,
  options: { width?: number; height?: number } = {},
): Promise<Drawn> {
  const browser: Browser = await chromium.launch()
  const page: Page = await browser.newPage({
    viewport: { width: options.width ?? 1440, height: options.height ?? 900 },
  })
  await page.setContent(
    `<!doctype html><html><head><style>${TOKENS}</style></head><body>${markup}</body></html>`,
    { waitUntil: 'load' },
  )

  /**
   * THE TOKEN SHEET REALLY PARSED. An unclosed comment in tokens.css drops every declaration after
   * it, and a custom property nobody declared computes to the empty string — so every measurement
   * below would read the browser's own defaults while reporting numbers. This is the same guard
   * `tests/tokens-in-a-browser.ts` makes, for the same reason: it caught a real fault there.
   */
  const missing = await page.evaluate(() => {
    const style = getComputedStyle(document.documentElement)
    return ['--pad', '--gut', '--text', '--panel'].filter((name) => style.getPropertyValue(name).trim() === '')
  })
  if (missing.length > 0) {
    await browser.close()
    throw new Error(
      `src/web/tokens.css loaded into a browser and declared nothing for ${missing.join(', ')}. ` +
        `The usual cause is an unclosed comment, which drops every declaration after it.`,
    )
  }

  return {
    page,
    async styleOf(selector: string, property: string): Promise<string> {
      const value = await page.evaluate(
        ([css, prop]) => {
          const element = document.querySelector(css as string)
          if (element === null) return null
          return getComputedStyle(element).getPropertyValue(prop as string)
        },
        [selector, property] as const,
      )
      if (value === null) throw new Error(`nothing on the page matches ${selector}`)
      return value
    },
    async palette(theme: string | null): Promise<void> {
      await page.evaluate((name) => {
        if (name === null) document.documentElement.removeAttribute('data-theme')
        else document.documentElement.setAttribute('data-theme', name as string)
      }, theme)
    },
    close: () => browser.close(),
  }
}
