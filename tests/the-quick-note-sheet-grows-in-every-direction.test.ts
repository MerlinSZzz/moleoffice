// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SHEET OF A NOTE GROWS IN EVERY DIRECTION AS THE PERSON DRAWS OR MOVES IT. Point NT-2 of the notes after the person's
 * use of 20 November: the sheet was only as big as the window it stood in, and the room a move of the sheet uncovered
 * took no stroke.
 *
 * Each case moves the sheet by the hand, draws a stroke wholly past the edge the sheet had when it opened, and finds it
 * kept where it was drawn. Then the note is opened again, where the stroke is out of view, and the same move brings it
 * into view.
 */
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { readFileSync } from 'node:fs'
import { chromium, type Browser, type Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { sayInEnglish } from '../src/shared/i18n.ts'
import { THE_QUICK_NOTE_SEGMENT } from '../src/config/the-quick-note-address.mjs'
import { bundlePageCode } from './a-bundle-of-page-code.ts'

const note = {
  id: 'MadeUpGrowingSheet', kind: 'quick_note', title: 'Made-up growing sheet',
  data: { parts: [{ id: 'one', type: 'box', x: 40, y: 100, width: 120, height: 60, text: 'Made-up box' }] },
}
type Part = { id: string; type: string; points?: number[] }
type Stand = { sheetTest: { saves(): { parts: Part[] }[]; open(): void } }
type Box = { x: number; y: number; width: number; height: number }
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

async function aNote(): Promise<Page> {
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } })
  await page.goto(`${site}/#/${THE_QUICK_NOTE_SEGMENT}/${note.id}`)
  await page.addStyleTag({ content: styles })
  await page.addScriptTag({ url: `${site}/page.js`, type: 'module' })
  await page.waitForFunction(() => 'sheetTest' in window)
  await page.evaluate(() => (window as unknown as Stand).sheetTest.open())
  await page.locator('.qn-box[data-part="one"]').waitFor()
  return page
}
async function reopen(page: Page): Promise<void> {
  const previous = await page.locator('.qn-box[data-part="one"]').elementHandle()
  if (previous === null) throw new Error('The box is not drawn before the note is opened again.')
  await page.evaluate(() => (window as unknown as Stand).sheetTest.open())
  await page.waitForFunction((element) => !element.isConnected, previous)
  await page.locator('.qn-box[data-part="one"]').waitFor()
}
const saves = (page: Page) => page.evaluate(() => (window as unknown as Stand).sheetTest.saves())
const theHand = (page: Page) => page.getByRole('button', { name: sayInEnglish('quickNote.moveSheet'), exact: true })
async function boxOf(page: Page, selector: string): Promise<Box> {
  const box = await page.locator(selector).boundingBox()
  if (box === null) throw new Error(`${selector} is not drawn.`)
  return box
}
async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }): Promise<void> {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(to.x, to.y, { steps: 8 })
  await page.mouse.up()
}
/** Move the sheet by the hand, from the middle of the part in view, and put the hand down again. */
async function moveTheSheet(page: Page, view: Box, dx: number, dy: number): Promise<void> {
  await theHand(page).click()
  const middle = { x: view.x + view.width / 2, y: view.y + view.height / 2 }
  await drag(page, middle, { x: middle.x + dx, y: middle.y + dy })
  await theHand(page).click()
}
function inside(inner: Box, outer: Box): boolean {
  return inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.width <= outer.x + outer.width && inner.y + inner.height <= outer.y + outer.height
}

/**
 * Each way moves the sheet, then draws from one point of the window to another, both measured from the sheet's corner in
 * view. LEFT AND ABOVE is drawn before the sheet's first point, so every point is below 0. RIGHT AND BELOW is drawn past
 * the width and the height the sheet had when it opened, which were the window's.
 */
const WAYS = {
  'left and above': { move: { dx: 300, dy: 200 }, from: (v: Box) => ({ x: v.x + 40, y: v.y + 40 }), to: (v: Box) => ({ x: v.x + 160, y: v.y + 120 }) },
  'right and below': {
    move: { dx: -500, dy: -300 },
    from: (v: Box) => ({ x: v.x + v.width - 300, y: v.y + v.height - 200 }),
    to: (v: Box) => ({ x: v.x + v.width - 200, y: v.y + v.height - 120 }),
  },
} as const

describe('the sheet of a note grows', () => {
  it.each(Object.keys(WAYS) as (keyof typeof WAYS)[])('keeps a stroke drawn past its old edge, %s, and reaches it by moving the sheet', async (way) => {
    const { move, from, to } = WAYS[way]
    const page = await aNote()
    try {
      const view = await boxOf(page, '.qn-sheet')
      const opened = await boxOf(page, '.qn-paper')
      await moveTheSheet(page, view, move.dx, move.dy)
      await drag(page, from(view), to(view))

      await expect.poll(async () => (await saves(page)).at(-1)?.parts.filter((part) => part.type === 'stroke').length ?? 0, { timeout: 10_000 }).toBe(1)
      const stroke = (await saves(page)).at(-1)!.parts.find((part) => part.type === 'stroke')!
      const xs = stroke.points!.filter((_, i) => i % 2 === 0)
      const ys = stroke.points!.filter((_, i) => i % 2 === 1)
      if (way === 'left and above') {
        expect(Math.max(...xs), 'every point is left of the sheet\'s first point').toBeLessThan(0)
        expect(Math.max(...ys), 'every point is above the sheet\'s first point').toBeLessThan(0)
      } else {
        expect(Math.min(...xs), 'every point is right of the width the sheet opened at').toBeGreaterThan(opened.width)
        expect(Math.min(...ys), 'every point is below the height the sheet opened at').toBeGreaterThan(opened.height)
      }
      const drawn = await boxOf(page, '.qn-stroke')
      expect(inside(drawn, view), 'the stroke is drawn where it was drawn, in view').toBe(true)

      await reopen(page)
      expect(inside(await boxOf(page, '.qn-stroke'), view), 'the note opens with the stroke out of view').toBe(false)
      await moveTheSheet(page, view, move.dx, move.dy)
      expect(inside(await boxOf(page, '.qn-stroke'), view), 'the same move of the sheet brings the stroke into view').toBe(true)
    } finally { await page.close() }
  }, 60_000)
})
