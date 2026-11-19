// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** A note's box size is kept; its zoom and sheet movement are view state. */
import { readFileSync } from 'node:fs'
import { chromium, type Browser, type Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { t } from '../src/shared/i18n.ts'
import { THE_QUICK_NOTE_SEGMENT } from '../src/config/the-quick-note-address.mjs'
import { bundlePageCode } from './a-bundle-of-page-code.ts'

const note = {
  id: 'MadeUpSheet1', kind: 'quick_note', title: 'Made-up sheet',
  data: { parts: [
    { id: 'one', type: 'box', x: 40, y: 100, width: 120, height: 60, text: 'Made-up words in a box that can wrap' },
    { id: 'two', type: 'box', x: 340, y: 100, width: 120, height: 60, text: 'Made-up second box' },
    { id: 'line', type: 'line', from: 'one', to: 'two' },
    { id: 'low', type: 'words', x: 40, y: 1500, width: 280, text: 'Made-up words below' },
  ] },
}
type Part = { id: string; type: string; x?: number; y?: number; width?: number; height?: number }
type Stand = { sheetTest: { saves(): { parts: Part[] }[]; open(): void } }
let browser: Browser
let script = ''
let styles = ''

beforeAll(async () => {
  const built = await bundlePageCode({
    stdin: { contents: `
      import './tests/a-page-of-a-test-office.ts';
      import { createElement as h } from 'react';
      import { createRoot } from 'react-dom/client';
      import { api } from './src/web/api.ts';
      import { QuickNotePage } from './src/web/pages/QuickNotePage.tsx';
      const stored = ${JSON.stringify(note)};
      const saves = [];
      let version = 1;
      api.getRecord = async () => ({ record: structuredClone(stored), version: 'v' + version });
      api.changeAQuickNote = async (_id, change) => {
        saves.push(structuredClone(change));
        stored.data.parts = structuredClone(change.parts);
        return { version: 'v' + (++version), newSeq: version };
      };
      const root = createRoot(document.getElementById('app'));
      let key = 0;
      window.sheetTest = { saves: () => saves, open: () => root.render(h(QuickNotePage, { key: ++key })) };
    `, resolveDir: process.cwd(), loader: 'tsx' },
    bundle: true, write: false, format: 'esm', platform: 'browser',
    define: { 'process.env.NODE_ENV': '"production"' },
  })
  script = built.outputFiles[0]?.text ?? ''
  if (script === '') throw new Error('The test page did not build.')
  styles = readFileSync('src/web/tokens.css', 'utf8') + readFileSync('src/web/styles.css', 'utf8').replace(/@import[^;]+;/g, '')
  browser = await chromium.launch()
}, 120_000)

afterAll(async () => { await browser?.close() })

async function aNote(): Promise<Page> {
  const page = await browser.newPage({ viewport: { width: 800, height: 600 }, hasTouch: true })
  await page.route('http://note.test/**', (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><div id="app"></div>' }))
  await page.goto(`http://note.test/#/${THE_QUICK_NOTE_SEGMENT}/${note.id}`)
  await page.addStyleTag({ content: styles })
  await page.addScriptTag({ content: script, type: 'module' })
  await page.waitForFunction(() => 'sheetTest' in window)
  await page.evaluate(() => (window as unknown as Stand).sheetTest.open())
  await page.locator('.qn-box[data-part="one"]').waitFor()
  return page
}
const saves = (page: Page) => page.evaluate(() => (window as unknown as Stand).sheetTest.saves())
const box = (page: Page) => page.locator('.qn-box[data-part="one"]')
const press = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
async function bounds(page: Page) {
  const b = await box(page).boundingBox()
  if (b === null) throw new Error('The box is not drawn.')
  return b
}
async function drag(page: Page, from: { x: number; y: number }, dx: number, dy: number, button: 'left' | 'middle' = 'left') {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down({ button })
  await page.mouse.move(from.x + dx, from.y + dy, { steps: 6 })
  await page.mouse.up({ button })
}
describe('an offscreen note sheet can be brought back', () => {
  it.each(['hand', 'space', 'middle'] as const)('brings the sheet back from empty space by %s', async (way) => {
    const page = await aNote()
    try {
      const sheet = page.locator('.qn-sheet')
      const viewport = await sheet.boundingBox()
      const before = await bounds(page)
      if (viewport === null) throw new Error('The sheet is not drawn.')
      if (way === 'hand') await press(page, t('quickNote.moveSheet')).click()
      if (way === 'space') {
        await page.locator('.qn-paper').focus()
        await page.keyboard.down('Space')
      }
      const button = way === 'middle' ? 'middle' : 'left'
      await drag(page, { x: before.x + 20, y: before.y + 20 }, 900, 0, button)
      const away = await bounds(page)
      expect(away.x).toBeGreaterThan(viewport.x + viewport.width)
      await drag(page, { x: viewport.x + viewport.width - 60, y: viewport.y + 80 }, -500, 0, button)
      if (way === 'space') await page.keyboard.up('Space')
      const returned = await bounds(page)
      expect(returned.x - away.x).toBeCloseTo(-500, 0)
      expect(await saves(page)).toEqual([])
    } finally { await page.close() }
  }, 60_000)

})
