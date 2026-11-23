// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SHADOW AROUND A NOTE'S WINDOW IS A THIN LINE, NOT A THICK HALO. Point NU-6 of the notes after the person's use of
 * 21 November: the window of a note floating over the office cast the office's deepest shadow, which read as a thick
 * halo around it.
 *
 * A made-up note is opened floating over a made-up page, in the light theme and in each way the dark theme is chosen.
 * Its window casts the new shadow, and that shadow lies closer to the window than the old one: a smaller offset, blur
 * and spread.
 */
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { readFileSync } from 'node:fs'
import { chromium, type Browser, type Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bundlePageCode } from './a-bundle-of-page-code.ts'

/** The shadows the window cast before this point, which every one of the office's raised panels still casts. */
const THE_OLD_SHADOW = { light: '8px 8px 0 #1c293c', dark: '0 20px 60px rgba(0, 0, 0, .6)' } as const
/** The shadows the window casts now. */
const THE_NEW_SHADOW = { light: '2px 2px 0 #1c293c', dark: '0 2px 8px rgba(0, 0, 0, .5)' } as const

const NOTE = {
  id: 'MadeUpShadowNote', kind: 'quick_note', title: 'Made-up note with a shadow', workspaceId: 'default',
  data: { parts: [{ id: 'one', type: 'words', x: 24, y: 16, width: 200, text: 'Made-up note with a shadow' }] },
}
/** Each way a theme is chosen: the theme the person picked, the theme the page started with, or the system's. */
const THEMES = {
  'light': { theme: 'light', bootTheme: null, system: 'light', shadow: 'light' },
  'dark, picked': { theme: 'dark', bootTheme: null, system: 'light', shadow: 'dark' },
  'dark, from the start of the page': { theme: null, bootTheme: 'dark', system: 'light', shadow: 'dark' },
  'dark, from the system': { theme: null, bootTheme: null, system: 'dark', shadow: 'dark' },
} as const
type Stand = { shadowTest: { open(id: string): void; pick(theme: 'light' | 'dark'): void } }
let browser: Browser
let script = ''
let styles = ''
let server: Server | undefined
let site = ''

beforeAll(async () => {
  const built = await bundlePageCode({
    stdin: { contents: `
      import './tests/a-page-of-a-test-office.ts';
      import { createElement as h } from 'react';
      import { createRoot } from 'react-dom/client';
      import { api } from './src/web/api.ts';
      import { QuickNoteBeside } from './src/web/components/QuickNoteBeside.tsx';
      import { openAQuickNote } from './src/web/lib/open-a-quick-note.ts';
      import { choosePreset } from './src/web/components/PresetBar.tsx';
      const stored = ${JSON.stringify(NOTE)};
      api.getRecord = async () => ({ record: structuredClone(stored), version: 'v1' });
      createRoot(document.getElementById('app')).render(h(QuickNoteBeside));
      window.shadowTest = { open: (id) => openAQuickNote(id), pick: (theme) => choosePreset('theme', theme) };
    `, resolveDir: process.cwd(), loader: 'tsx' },
    bundle: true, write: false, format: 'esm', platform: 'browser',
    define: { 'process.env.NODE_ENV': '"production"' },
  })
  script = built.outputFiles[0]?.text ?? ''
  if (script === '') throw new Error('The test page did not build.')
  styles = readFileSync('src/web/tokens.css', 'utf8') + readFileSync('src/web/styles.css', 'utf8').replace(/@import[^;]+;/g, '')
  const serving = createServer((asked, answer) => {
    const theScript = asked.url === '/page.js'
    answer.writeHead(200, { 'content-type': theScript ? 'text/javascript' : 'text/html', 'cache-control': 'no-store' })
    answer.end(theScript ? script : '<!doctype html><div id="app"></div>')
  })
  await new Promise<void>((resolve) => serving.listen(0, '127.0.0.1', resolve))
  server = serving
  site = `http://127.0.0.1:${String((serving.address() as AddressInfo).port)}`
  browser = await chromium.launch()
}, 120_000)

afterAll(async () => {
  await browser?.close()
  const serving = server
  serving?.closeAllConnections()
  if (serving !== undefined) await new Promise<void>((resolve) => serving.close(() => resolve()))
})

async function aNote(themed: (typeof THEMES)[keyof typeof THEMES]): Promise<Page> {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, colorScheme: themed.system })
  await page.goto(`${site}/#/`)
  await page.evaluate((bootTheme) => {
    if (bootTheme !== null) document.documentElement.dataset.bootTheme = bootTheme
  }, themed.bootTheme)
  await page.addStyleTag({ content: styles })
  await page.addScriptTag({ url: `${site}/page.js`, type: 'module' })
  await page.waitForFunction(() => 'shadowTest' in window)
  // A THEME IS PICKED AS THE OFFICE PICKS IT, after the page code has loaded. The page code puts the stored choice on
  // the page when it loads, so a theme written on the page before that is taken away again.
  if (themed.theme !== null) await page.evaluate((theme) => (window as unknown as Stand).shadowTest.pick(theme), themed.theme)
  await page.evaluate((id) => (window as unknown as Stand).shadowTest.open(id), NOTE.id)
  await page.locator('[data-quick-note-beside] .qn-title-field').waitFor()
  return page
}

/** A shadow as the browser computes it, read from an element on the same page that is given that shadow alone. */
async function asComputed(page: Page, shadow: string): Promise<string> {
  return page.evaluate((given) => {
    const probe = document.createElement('div')
    probe.style.boxShadow = given
    document.body.append(probe)
    const computed = getComputedStyle(probe).boxShadow
    probe.remove()
    return computed
  }, shadow)
}

/** A computed shadow's lengths, in pixels: its two offsets, its blur and its spread. */
function lengths(computed: string): { x: number; y: number; blur: number; spread: number } {
  const [x = 0, y = 0, blur = 0, spread = 0] = [...computed.replace(/rgba?\([^)]*\)/gu, '').matchAll(/(-?[\d.]+)px/gu)].map((found) => Number(found[1]))
  return { x, y, blur, spread }
}

describe('the shadow around a note\'s window', () => {
  it.each(Object.keys(THEMES) as (keyof typeof THEMES)[])('is a thin line, %s', async (which) => {
    const themed = THEMES[which]
    const page = await aNote(themed)
    try {
      const cast = await page.locator('[data-quick-note-beside]').evaluate((beside) => getComputedStyle(beside).boxShadow)
      expect(cast, 'the window casts the new shadow').toBe(await asComputed(page, THE_NEW_SHADOW[themed.shadow]))
      const now = lengths(cast)
      const before = lengths(await asComputed(page, THE_OLD_SHADOW[themed.shadow]))
      expect(Math.hypot(now.x, now.y), 'the shadow lies closer to the window than it did').toBeLessThan(Math.hypot(before.x, before.y))
      expect(now.blur, 'the shadow is no more blurred than it was').toBeLessThanOrEqual(before.blur)
      expect(now.spread, 'the shadow spreads no further than it did').toBeLessThanOrEqual(before.spread)
      expect(now.blur + now.spread, 'the shadow is no wider than a thin line').toBeLessThanOrEqual(8)
    } finally { await page.close() }
  }, 60_000)
})
