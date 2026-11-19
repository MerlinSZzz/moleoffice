// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** A note's box size is kept; its zoom and sheet movement are view state. */
import { readFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { chromium, type Browser, type Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { t } from '../src/shared/i18n.ts'
import { THE_QUICK_NOTE_SEGMENT } from '../src/config/the-quick-note-address.mjs'
import { bundlePageCode } from './a-bundle-of-page-code.ts'

const note = {
  id: 'MadeUpSheet1', kind: 'quick_note', title: 'Made-up sheet',
  data: { parts: [
    { id: 'one', type: 'box', x: 40, y: 100, width: 120, height: 60, text: 'Made-up' },
    { id: 'two', type: 'box', x: 340, y: 100, width: 120, height: 60, text: 'Made-up second box' },
    { id: 'line', type: 'line', from: 'one', to: 'two' },
    { id: 'low', type: 'words', x: 40, y: 1500, width: 280, text: 'Made-up words below' },
  ] },
}
type Part = { id: string; type: string; x?: number; y?: number; width?: number; height?: number }
type Stand = { sheetTest: { saves(): { parts: Part[] }[]; open(parts?: object[]): void } }
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
      window.sheetTest = { saves: () => saves, open: (parts) => { if (parts) stored.data.parts = structuredClone(parts); root.render(h(QuickNotePage, { key: ++key })); } };
    `, resolveDir: process.cwd(), loader: 'tsx' },
    bundle: true, write: false, format: 'esm', platform: 'browser',
    define: { 'process.env.NODE_ENV': '"production"' },
  })
  script = built.outputFiles[0]?.text ?? ''
  if (script === '') throw new Error('The test page did not build.')
  styles = readFileSync('src/web/tokens.css', 'utf8') + readFileSync('src/web/styles.css', 'utf8').replace(/@import[^;]+;/g, '')
  // THE PAGE AND ITS BUNDLE ARE SERVED OVER HTTP FROM THIS PROCESS. The bundle is about 31 MB, and handed to each page
  // through Playwright it took 3.7 s a page; fetched by the page it takes 0.4 s. Every other address answers the empty
  // page, as the route that served the page before did, and nothing is kept in the browser's cache.
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

async function aNote(parts?: object[]): Promise<Page> {
  const page = await browser.newPage({ viewport: { width: 800, height: 600 }, hasTouch: true })
  await page.goto(`${site}/#/${THE_QUICK_NOTE_SEGMENT}/${note.id}`)
  await page.addStyleTag({ content: styles })
  await page.addScriptTag({ url: `${site}/page.js`, type: 'module' })
  await page.waitForFunction(() => 'sheetTest' in window)
  await page.evaluate((initial) => (window as unknown as Stand).sheetTest.open(initial), parts)
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
async function reopen(page: Page) {
  const previous = await box(page).elementHandle()
  if (previous === null) throw new Error('The box is not drawn before reopening.')
  await page.evaluate(() => (window as unknown as Stand).sheetTest.open())
  await page.waitForFunction((element) => !element.isConnected, previous)
  await box(page).waitFor()
}
async function drag(page: Page, from: { x: number; y: number }, dx: number, dy: number, button: 'left' | 'middle' = 'left') {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down({ button })
  await page.mouse.move(from.x + dx, from.y + dy, { steps: 6 })
  await page.mouse.up({ button })
}
async function pointOnSheet(page: Page, x: number, y: number) {
  return page.locator('.qn-paper').evaluate((el, p) => {
    const r = el.getBoundingClientRect()
    return { x: (p.x - r.left) / (r.width / (el as HTMLElement).offsetWidth), y: (p.y - r.top) / (r.width / (el as HTMLElement).offsetWidth) }
  }, { x, y })
}

describe('the quick note sheet changes the view without changing its parts', () => {
  const threeLines = [t('quickNote.box'), t('quickNote.line'), t('quickNote.pen')].join('\n')
  const fitParts = (height: number) => [
    { id: 'one', type: 'box', x: 40, y: 100, width: 160, height, text: threeLines },
    { id: 'two', type: 'box', x: 40, y: 350, width: 160, height: 100, text: t('quickNote.box') },
    { id: 'line', type: 'line', from: 'one', to: 'two' },
  ]
  async function wordsFit(page: Page) {
    return box(page).locator('.qn-written').evaluate((words) => {
      const outer = words.closest('.qn-box')!.getBoundingClientRect()
      const inner = words.getBoundingClientRect()
      return { scrollHeight: words.scrollHeight, clientHeight: words.clientHeight, bottomGap: outer.bottom - inner.bottom }
    })
  }

  it('draws all three lines inside a short box at each zoom', async () => {
    const page = await aNote(fitParts(40))
    try {
      expect(await box(page).locator('.qn-written').innerText()).toBe(threeLines)
      for (const zoom of [t('quickNote.zoomOut'), t('quickNote.resetZoom'), t('quickNote.zoomIn')]) {
        await press(page, zoom).click()
        await expect.poll(async () => (await wordsFit(page)).scrollHeight - (await wordsFit(page)).clientHeight).toBeLessThanOrEqual(0)
        expect((await wordsFit(page)).bottomGap).toBeGreaterThanOrEqual(0)
      }
      expect(await saves(page)).toEqual([])
    } finally { await page.close() }
  }, 60_000)

  it('keeps the smaller height when a box is resized below its words', async () => {
    const page = await aNote(fitParts(160))
    try {
      expect((await bounds(page)).height).toBeCloseTo(160, 0)
      const h = await press(page, t('quickNote.resizeBox')).first().boundingBox()
      if (h === null) throw new Error('The resize handle is not drawn.')
      await drag(page, { x: h.x + h.width / 2, y: h.y + h.height / 2 }, 0, -120)
      await expect.poll(async () => (await saves(page)).at(-1)?.parts.find((part) => part.id === 'one')?.height).toBe(40)
      expect(await box(page).locator('.qn-written').innerText()).toBe(threeLines)
      await expect.poll(async () => (await wordsFit(page)).scrollHeight - (await wordsFit(page)).clientHeight).toBeLessThanOrEqual(0)
      expect((await wordsFit(page)).bottomGap).toBeGreaterThanOrEqual(0)
    } finally { await page.close() }
  }, 60_000)

  it('ends a line at the drawn bottom of a grown box', async () => {
    const page = await aNote(fitParts(40))
    try {
      await expect.poll(async () => (await bounds(page)).height).toBeGreaterThan(40)
      const end = await page.locator('.qn-line path').evaluate((path: SVGPathElement) => path.getPointAtLength(0).matrixTransform(path.getScreenCTM()!).y)
      const after = await bounds(page)
      expect(Math.abs(end - (after.y + after.height))).toBeLessThanOrEqual(1)
    } finally { await page.close() }
  }, 60_000)

  it('gives the resize handle a 24-pixel target at 100%', async () => {
    const page = await aNote()
    try {
      const sizes = await press(page, t('quickNote.resizeBox')).first().evaluate((el) =>
        Array.from({ length: 3 }, () => {
          const rect = el.getBoundingClientRect()
          return { width: rect.width, height: rect.height }
        }),
      )
      for (const size of sizes) {
        expect(size.width).toBeGreaterThanOrEqual(24)
        expect(size.height).toBeGreaterThanOrEqual(24)
      }
    } finally { await page.close() }
  }, 60_000)

  it('keeps a resized box and draws its joined line to the new edge', async () => {
    const page = await aNote()
    try {
      const before = await bounds(page)
      const handle = press(page, t('quickNote.resizeBox')).first()
      const h = await handle.boundingBox({ timeout: 2_000 })
      if (h === null) throw new Error('The resize handle is not drawn.')
      await drag(page, { x: h.x + h.width / 2, y: h.y + h.height / 2 }, 80, 40)
      await expect.poll(async () => (await saves(page)).at(-1)?.parts.find((part) => part.id === 'one')?.width).toBe(200)
      const kept = (await saves(page)).at(-1)!.parts.find((part) => part.id === 'one')!
      expect(kept).toMatchObject({ x: 40, y: 100, width: 200, height: 100 })
      const after = await bounds(page)
      expect(after.width - before.width).toBeCloseTo(80, 0)
      expect(after.height - before.height).toBeCloseTo(40, 0)
      const end = await page.locator('.qn-line path').evaluate((path: SVGPathElement) => {
        const p = path.getPointAtLength(0).matrixTransform(path.getScreenCTM()!)
        return { x: p.x, y: p.y }
      })
      expect(Math.abs(end.x - (after.x + after.width))).toBeLessThanOrEqual(1)
      expect(end.y).toBeGreaterThanOrEqual(after.y)
      expect(end.y).toBeLessThanOrEqual(after.y + after.height)
    } finally { await page.close() }
  }, 60_000)

  it('zooms about the pointer with Ctrl and the wheel, without saving', async () => {
    const page = await aNote()
    try {
      const b = await bounds(page)
      const at = { x: b.x + 30, y: b.y + 25 }
      const before = await pointOnSheet(page, at.x, at.y)
      await page.mouse.move(at.x, at.y)
      await page.keyboard.down('Control')
      await page.mouse.wheel(0, -180)
      await page.keyboard.up('Control')
      await expect.poll(async () => (await bounds(page)).width).toBeGreaterThan(b.width)
      const after = await pointOnSheet(page, at.x, at.y)
      expect(Math.abs(after.x - before.x)).toBeLessThan(1)
      expect(Math.abs(after.y - before.y)).toBeLessThan(1)
      await page.waitForTimeout(750)
      expect(await saves(page)).toEqual([])
    } finally { await page.close() }
  }, 60_000)

  it('wraps the words as the box narrows and stops at its minimum size', async () => {
    const page = await aNote()
    try {
      const words = box(page).locator('.qn-written')
      const heightBefore = await words.evaluate((el) => el.scrollHeight)
      const handle = press(page, t('quickNote.resizeBox')).first()
      const h = await handle.boundingBox({ timeout: 2_000 })
      if (h === null) throw new Error('The resize handle is not drawn.')
      await drag(page, { x: h.x + h.width / 2, y: h.y + h.height / 2 }, -110, -50)
      await expect.poll(async () => (await saves(page)).at(-1)?.parts.find((part) => part.id === 'one')?.width).toBe(40)
      expect((await saves(page)).at(-1)!.parts.find((part) => part.id === 'one')).toMatchObject({ width: 40, height: 40 })
      expect(await words.evaluate((el) => el.scrollHeight)).toBeGreaterThan(heightBefore)
    } finally { await page.close() }
  }, 60_000)

  it('zooms in, out and back to 100%, and reopens at 100% without a save', async () => {
    const page = await aNote()
    try {
      const b = await bounds(page)
      await press(page, t('quickNote.zoomIn')).click({ timeout: 2_000 })
      await expect.poll(async () => (await bounds(page)).width).toBeGreaterThan(b.width)
      await press(page, t('quickNote.zoomOut')).click()
      await expect.poll(async () => (await bounds(page)).width).toBeCloseTo(b.width, 0)
      await press(page, t('quickNote.zoomOut')).click()
      await expect.poll(async () => (await bounds(page)).width).toBeLessThan(b.width)
      await press(page, t('quickNote.resetZoom')).click()
      await expect.poll(async () => (await bounds(page)).width).toBeCloseTo(b.width, 0)
      await press(page, t('quickNote.zoomIn')).click()
      await page.waitForTimeout(750)
      expect(await saves(page)).toEqual([])
      await reopen(page)
      await expect.poll(async () => (await bounds(page)).width).toBeCloseTo(b.width, 0)
      expect(await press(page, t('quickNote.resetZoom')).textContent()).toContain('100%')
      expect(await saves(page)).toEqual([])
    } finally { await page.close() }
  }, 60_000)

  it('lets Space activate the focused zoom-in button', async () => {
    const page = await aNote()
    try {
      const before = await bounds(page)
      await press(page, t('quickNote.zoomIn')).focus()
      await page.keyboard.press('Space')
      await expect.poll(async () => (await bounds(page)).width).toBeGreaterThan(before.width)
      expect(await saves(page)).toEqual([])
    } finally { await page.close() }
  }, 60_000)

  it.each(['hand', 'space', 'middle'] as const)('moves the sheet by %s without moving or saving a box', async (way) => {
    const page = await aNote()
    try {
      await press(page, t('quickNote.box')).click()
      if (way === 'hand') await press(page, t('quickNote.moveSheet')).click({ timeout: 2_000 })
      if (way === 'space') {
        await page.locator('.qn-paper').focus()
        await page.keyboard.down('Space')
      }
      const b = await bounds(page)
      await drag(page, { x: b.x + 20, y: b.y + 20 }, 70, 45, way === 'middle' ? 'middle' : 'left')
      if (way === 'space') await page.keyboard.up('Space')
      const after = await bounds(page)
      expect(after.x - b.x).toBeCloseTo(70, 0)
      expect(after.y - b.y).toBeCloseTo(45, 0)
      expect(await saves(page)).toEqual([])
      await reopen(page)
      const reopened = await bounds(page)
      expect(reopened.x).toBeCloseTo(b.x, 0)
      expect(reopened.y).toBeCloseTo(b.y, 0)
    } finally { await page.close() }
  }, 60_000)

  it('still scrolls on a plain wheel', async () => {
    const page = await aNote()
    try {
      const sheet = page.locator('.qn-sheet')
      const rect = await sheet.boundingBox()
      if (rect === null) throw new Error('The sheet is not drawn.')
      await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2)
      await page.mouse.wheel(0, 300)
      await expect.poll(() => sheet.evaluate((el) => el.scrollTop)).toBeGreaterThan(0)
      expect(await saves(page)).toEqual([])
    } finally { await page.close() }
  }, 60_000)

  it('zooms about the midpoint of two touch points', async () => {
    const page = await aNote()
    try {
      const b = await bounds(page)
      const center = { x: b.x + 60, y: b.y + 30 }
      const before = await pointOnSheet(page, center.x, center.y)
      const cdp = await page.context().newCDPSession(page)
      const points = (half: number) => [{ x: center.x - half, y: center.y, id: 1 }, { x: center.x + half, y: center.y, id: 2 }]
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points(30) })
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: points(60) })
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
      await expect.poll(async () => (await bounds(page)).width).toBeGreaterThan(b.width)
      const after = await pointOnSheet(page, center.x, center.y)
      expect(Math.abs(after.x - before.x)).toBeLessThan(1)
      expect(Math.abs(after.y - before.y)).toBeLessThan(1)
      await page.waitForTimeout(750)
      expect(await saves(page)).toEqual([])
    } finally { await page.close() }
  }, 60_000)
})
