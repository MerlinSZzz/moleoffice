// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SIX THEMES' RULES ARE IN ONE STYLE ELEMENT BEFORE EVERY STYLESHEET IN THE HEAD, SO A REQUEST FOR
 * MORE CONTRAST STILL WINS UNDER A THEME.
 *
 * A theme's rule, `:root[data-theme='<id>']`, weighs the same as the rule tokens.css gives a page that
 * asks for more contrast, `:root[data-theme]`, which sets `--border` to `--border-strong`. Of two rules
 * of the same weight the later one wins. So the themes' rules must come first in the page, and then the
 * more-contrast rule wins under every theme.
 *
 * In Chromium, on a page whose head already holds tokens.css and a style element of its own: the
 * themes' element is the first stylesheet in the head, it is there before the bar first sets
 * data-theme, the style element React adds for the bar comes after it, and with `prefers-contrast: more`
 * the first theme's `--border` computes to its own `--border-strong`. Every theme's rule is made by
 * themeRule with the same weight and sits in the same element, so the first theme stands for all six.
 */
import { readFileSync } from 'node:fs'
import { bundlePageCode } from './a-bundle-of-page-code.ts'
import { chromium, type Browser, type Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THEMES, themeRule } from '../src/shared/themes.ts'

type Bar = typeof import('../src/web/components/PresetBar.tsx')

const TOKENS_CSS = readFileSync(new URL('../src/web/tokens.css', import.meta.url), 'utf8')
const PAGE = '<!doctype html><html><head><link rel="stylesheet" href="/tokens.css"><style>body { margin: 0; }</style></head><body><div id="app"></div></body></html>'

let bar: Bar
let script = ''
let browser: Browser | undefined
let page: Page

beforeAll(async () => {
  // The bar's import graph reads localStorage at module scope, so Node is given the smallest stand-in for
  // a window first, as in tests/the-text-size-control-writes-the-attribute.test.ts.
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
  bar = await import('../src/web/components/PresetBar.tsx')

  const built = await bundlePageCode({
    stdin: {
      contents: `import './tests/a-page-of-a-test-office.ts';import { createElement } from 'react';
        import { createRoot } from 'react-dom/client';
        import { PresetBar } from './src/web/components/PresetBar.tsx';
        createRoot(document.getElementById('app')).render(createElement(PresetBar));`,
      resolveDir: process.cwd(), loader: 'tsx',
    },
    bundle: true, write: false, format: 'iife', platform: 'browser',
    define: { 'process.env.NODE_ENV': '"production"' },
  })
  const text = built.outputFiles[0]?.text
  if (text === undefined) throw new Error('The appearance bar did not build.')
  script = text
  browser = await chromium.launch()
  page = await browser.newPage()
  // Serve the page and tokens.css in Playwright. No server, port, or office is involved.
  await page.route('http://looks.test/**', (route) => route.request().url().endsWith('/tokens.css')
    ? route.fulfill({ contentType: 'text/css', body: TOKENS_CSS })
    : route.fulfill({ contentType: 'text/html', body: PAGE }))
  await page.goto('http://looks.test/')
})

afterAll(async () => {
  await browser?.close()
})

/**
 * Load the page with this theme stored, and the bar on it. Before the bar's code runs, the page notes
 * whether the themes' element is in the head at the moment something first sets data-theme on the root.
 */
async function openWith(theme: string): Promise<void> {
  await page.evaluate(([key, value]) => {
    localStorage.clear()
    localStorage.setItem(key as string, value as string)
  }, [`${bar.STORAGE_PREFIX}theme`, theme] as const)
  await page.reload()
  await page.addScriptTag({
    content: `(() => {
      const set = Element.prototype.setAttribute
      Element.prototype.setAttribute = function (name, value) {
        if (this === document.documentElement && name === 'data-theme' && window.themesWhenFirstSet === undefined) {
          window.themesWhenFirstSet = document.head.querySelector(${JSON.stringify(`style#${bar.THEMES_STYLE_ID}`)}) !== null
        }
        return set.call(this, name, value)
      }
    })()`,
  })
  await page.addScriptTag({ content: script })
  await page.locator('#preset-theme').waitFor()
}

describe("the themes' style element", () => {
  it('is the first stylesheet in the head, holds every theme\'s rule, and is there before data-theme is first set', async () => {
    const first = THEMES[0]
    if (first === undefined) throw new Error('There are no themes to choose.')
    await page.emulateMedia({ contrast: 'no-preference' })
    await openWith(first.id)
    const sheets = await page.evaluate(() => [...document.head.querySelectorAll('link[rel~="stylesheet"], style')]
      .map((sheet) => sheet.id || sheet.getAttribute('data-href') || sheet.getAttribute('href') || sheet.textContent))
    expect(sheets[0]).toBe(bar.THEMES_STYLE_ID)
    expect(sheets.filter((sheet) => sheet === bar.THEMES_STYLE_ID)).toHaveLength(1)
    // The page's own two sheets are still there, after it, and so is the one React adds for the bar.
    expect(sheets).toContain('/tokens.css')
    expect(sheets).toContain('mole-office-presetbar-column')
    expect(await page.locator(`style#${bar.THEMES_STYLE_ID}`).textContent()).toBe(THEMES.map(themeRule).join('\n'))
    expect(await page.getAttribute('html', 'data-theme')).toBe(first.id)
    expect(await page.evaluate(() => (window as unknown as { themesWhenFirstSet?: boolean }).themesWhenFirstSet)).toBe(true)
  })

  it.each(THEMES.slice(0, 1).map((theme) => [theme.id, theme]))('lets the request for more contrast win under %s', async (_id, theme) => {
    const border = () => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--border').trim())
    await page.emulateMedia({ contrast: 'no-preference' })
    await openWith(theme.id)
    expect(await border(), 'with no request for more contrast the theme draws its own border').toBe(theme.values['--border'])

    await page.emulateMedia({ contrast: 'more' })
    expect(await page.evaluate(() => window.matchMedia('(prefers-contrast: more)').matches)).toBe(true)
    expect(await border()).toBe(theme.values['--border-strong'])
  })
})
