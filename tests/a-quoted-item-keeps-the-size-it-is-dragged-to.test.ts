// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A QUOTED ITEM IN A NOTE IS RESIZED BY DRAGGING ITS CORNER, AND KEEPS ITS SIZE WHEN THE NOTE IS SAVED AND OPENED AGAIN.
 * Point NT-4 of the notes after the person's use of 20 November: a thing added to a note from a page was drawn as wide
 * as it was added and as tall as what it holds, and could not be made bigger or smaller.
 *
 * The size is kept in the note's data, on the added part itself, as its width and its height in pixels of the sheet.
 * The note page is drawn in Chromium from a bundle, with the doors it calls answered by hand. No office is involved,
 * and every note in this file is made up.
 */
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { chromium, type Browser, type Locator, type Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { sayInEnglish } from '../src/shared/i18n.ts'
import { validateData } from '../src/shared/kinds.ts'
import { THE_QUICK_NOTE_SEGMENT } from '../src/config/the-quick-note-address.mjs'
import { bundlePageCode } from './a-bundle-of-page-code.ts'

const ADDED = {
  id: 'a-1', type: 'added', x: 40, y: 40, width: 320, at: '2026-11-20 21:40:00',
  from: { address: '#/records/MadeUpRec001', name: 'A made-up report', recordId: 'MadeUpRec001' },
  copy: { type: 'card', recordId: 'MadeUpRec001', kind: 'task', title: 'A made-up task', summary: 'Made-up words copied from a made-up task.' },
}
const note = { id: 'MadeUpQuotedNote', kind: 'quick_note', title: 'Made-up quoted note', data: { parts: [ADDED] } }
type Part = { id: string; width?: number; height?: number }
type Stand = { quoteTest: { saves(): { parts: Part[] }[]; open(): void } }
type Box = { x: number; y: number; width: number; height: number }
let browser: Browser
let script = ''
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
      window.quoteTest = { saves: () => saves, open: () => root.render(h(QuickNotePage, { key: ++key })) };
    `, resolveDir: process.cwd(), loader: 'tsx' },
    bundle: true, write: false, format: 'esm', platform: 'browser',
    define: { 'process.env.NODE_ENV': '"production"' },
  })
  script = built.outputFiles[0]?.text ?? ''
  if (script === '') throw new Error('The test page did not build.')
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

const theQuote = (page: Page) => page.locator(`.qn-added[data-part="${ADDED.id}"]`)
async function aNote(): Promise<Page> {
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } })
  await page.goto(`${site}/#/${THE_QUICK_NOTE_SEGMENT}/${note.id}`)
  await page.addScriptTag({ url: `${site}/page.js`, type: 'module' })
  await page.waitForFunction(() => 'quoteTest' in window)
  await page.evaluate(() => (window as unknown as Stand).quoteTest.open())
  await theQuote(page).waitFor()
  return page
}
async function reopen(page: Page): Promise<void> {
  const previous = await theQuote(page).elementHandle()
  if (previous === null) throw new Error('The quote is not drawn before the note is opened again.')
  await page.evaluate(() => (window as unknown as Stand).quoteTest.open())
  await page.waitForFunction((element) => !element.isConnected, previous)
  await theQuote(page).waitFor()
}
const saves = (page: Page) => page.evaluate(() => (window as unknown as Stand).quoteTest.saves())
async function boxOf(locator: Locator): Promise<Box> {
  const box = await locator.boundingBox()
  if (box === null) throw new Error('The part is not drawn.')
  return box
}
const middleOf = (box: Box) => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 })
/** The height of what the quote holds, inside its frame, which is what its size in the note measures. */
const heightInside = (page: Page) => theQuote(page).evaluate((element) => parseFloat(getComputedStyle(element).height))

describe('a quoted item in a note', () => {
  it('is resized by dragging its corner, and keeps the size in the note when it is saved and opened again', async () => {
    const page = await aNote()
    try {
      const before = await boxOf(theQuote(page))
      const insideBefore = await heightInside(page)
      const corner = theQuote(page).getByRole('button', { name: sayInEnglish('quickNote.resizeAdded'), exact: true })
      const from = middleOf(await boxOf(corner))
      await page.mouse.move(from.x, from.y)
      await page.mouse.down()
      await page.mouse.move(from.x + 120, from.y + 90, { steps: 8 })
      await page.mouse.up()

      const resized = await boxOf(theQuote(page))
      expect(Math.abs(resized.width - before.width - 120), 'the quote is 120 pixels wider').toBeLessThanOrEqual(1)
      expect(Math.abs(resized.height - before.height - 90), 'the quote is 90 pixels taller').toBeLessThanOrEqual(1)

      await expect.poll(async () => (await saves(page)).length, { timeout: 10_000 }).toBeGreaterThan(0)
      const kept = (await saves(page)).at(-1)!.parts.find((part) => part.id === ADDED.id)!
      expect(kept.width, 'the width saved is the one dragged to').toBe(ADDED.width + 120)
      expect(Math.abs(kept.height! - insideBefore - 90), 'the height saved is the one dragged to').toBeLessThanOrEqual(1)

      await reopen(page)
      const opened = await boxOf(theQuote(page))
      expect(Math.abs(opened.width - resized.width), 'opened again, the quote is as wide as it was dragged').toBeLessThanOrEqual(1)
      expect(Math.abs(opened.height - resized.height), 'opened again, the quote is as tall as it was dragged').toBeLessThanOrEqual(1)
      expect(Math.abs((await heightInside(page)) - kept.height!)).toBeLessThanOrEqual(1)
    } finally { await page.close() }
  }, 60_000)

  it('is stored with its height, which the door checks as it checks every height in a note', () => {
    expect(validateData('quick_note', { parts: [{ ...ADDED, height: 180 }] }).ok).toBe(true)
    const refused = validateData('quick_note', { parts: [{ ...ADDED, height: 0 }] })
    expect(refused.ok ? [] : refused.errors.map((error) => error.path)).toContain('data.parts[0].height')
  })
})
