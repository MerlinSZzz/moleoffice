// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * EACH OF THE SIX THEMES CAN BE CHOSEN, IS KEPT IN THE BROWSER UNDER TODAY'S KEY, AND COMES BACK.
 *
 * The theme select on one page in Chromium, with no server: a choice of a theme is written to the
 * root and stored under the key Light and Dark use, and after a reload the page reads it back. The six
 * ids take one path through the bar, so one theme is chosen here. A stored
 * id this build does not have is dropped with the notice the bar gives today for an unknown choice.
 * And `theLookShowing`, which the look shortcut and a plugin's page read, answers a theme's own
 * light or dark while the system is set to the other: Warm night is dark on a light system, and Paper
 * is light on a dark one.
 */
import { bundlePageCode } from './a-bundle-of-page-code.ts'
import { chromium, type Browser, type Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { isThemeId, THEMES, themeById } from '../src/shared/themes.ts'

type Bar = typeof import('../src/web/components/PresetBar.tsx')

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
        import { PresetBar, theLookShowing } from './src/web/components/PresetBar.tsx';
        window.theLookShowing = theLookShowing;
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
  // Serve one document in Playwright. No server, port, or office is involved.
  await page.route('http://looks.test/**', (route) => route.fulfill({
    contentType: 'text/html', body: '<!doctype html><div id="app"></div>',
  }))
  await page.goto('http://looks.test/')
})

afterAll(async () => {
  await browser?.close()
})

const THEME_KEY = () => `${bar.STORAGE_PREFIX}theme`

/** Load the page afresh with this stored theme, or none, and wait for the bar. */
async function openWith(stored: string | null): Promise<void> {
  await page.evaluate(([key, value]) => {
    localStorage.clear()
    if (value !== null) localStorage.setItem(key as string, value)
  }, [THEME_KEY(), stored] as const)
  await page.reload()
  await page.addScriptTag({ content: script })
  await page.locator('#preset-theme').waitFor()
}

const theRoot = (name: string) => page.getAttribute('html', name)
const theStored = () => page.evaluate((key) => localStorage.getItem(key), THEME_KEY())

describe('choosing one of the six themes', () => {
  it.each(THEMES.filter((theme) => theme.id === 'paper').map((theme) => [theme.id]))('chooses %s, keeps it under the key Light and Dark use, and reads it back', async (id) => {
    await page.emulateMedia({ colorScheme: 'light' })
    await openWith(null)
    await page.selectOption('#preset-theme', id)
    expect(await theRoot('data-theme')).toBe(id)
    expect(await theStored()).toBe(id)
    expect(await page.locator('#preset-theme option:checked').textContent()).toBe(themeById(id).name.en)

    await page.reload()
    await page.addScriptTag({ content: script })
    await page.locator('#preset-theme').waitFor()
    expect(await page.locator('#preset-theme').inputValue()).toBe(id)
    expect(await theRoot('data-theme')).toBe(id)
    expect(await page.locator('.presetbar-fault').count()).toBe(0)
  })

  it('drops a stored theme this build does not have, with the notice the bar gives for an unknown choice', async () => {
    const unknown = 'a-theme-this-build-does-not-have'
    expect(isThemeId(unknown)).toBe(false)
    await openWith(unknown)
    const notice = bar.presetFaultSentence({ axis: 'theme', kind: 'unknown', value: unknown, fallback: bar.DEFAULT_PRESETS.theme }, false)
    expect(await page.locator('.presetbar-fault').count()).toBe(1)
    expect(await page.locator('.presetbar-fault').innerText()).toContain(notice)
    expect(await page.locator('#preset-theme').inputValue()).toBe(bar.DEFAULT_PRESETS.theme)
    expect(await theRoot('data-theme')).toBeNull()
    expect(await theRoot('data-theme-from')).toBeNull()
    expect(await theStored()).toBeNull()
  })

  it.each(THEMES.filter((theme) => theme.id === 'paper' || theme.id === 'warm-night').map((theme) => [theme.id, theme.look]))('answers the look showing as %s\'s own %s while the system is set to the other', async (id, look) => {
    const system = look === 'dark' ? 'light' : 'dark'
    await page.emulateMedia({ colorScheme: system })
    await openWith(id)
    expect(await page.evaluate(() => window.matchMedia('(prefers-color-scheme: dark)').matches)).toBe(system === 'dark')
    expect(await theRoot('data-theme')).toBe(id)
    expect(await page.evaluate(() => (window as unknown as { theLookShowing: () => string }).theLookShowing())).toBe(look)
  })
})
