// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SHEET GROWS ONLY BY WHAT IS DRAWN PAST ITS EDGE, AT EVERY ZOOM. Point NU-1 of the notes after the person's use of
 * 21 November: after a zoom, drawing near the sheet's edge grew it by far more than the drawing, and an empty sheet
 * zoomed in was already several times as tall as the window it stood in.
 *
 * The note is opened, zoomed in and out, and then drawn at two zooms, one above and one below the first. At each zoom
 * the sheet is scrolled to its foot, and a short stroke is drawn just above the foot of the window, three times. Each
 * time, the room the sheet scrolls through may grow only by what the stroke passes its old foot by, plus a small margin,
 * as the person sees both on the screen. A stroke drawn in the middle of the window grows nothing. Then the note is
 * opened again, twice, and its sheet is no taller than what is drawn on it plus the same margin, both times.
 */
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { readFileSync } from 'node:fs'
import { chromium, type Browser, type Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { sayInEnglish } from '../src/shared/i18n.ts'
import { THE_QUICK_NOTE_SEGMENT } from '../src/config/the-quick-note-address.mjs'
import { bundlePageCode } from './a-bundle-of-page-code.ts'

/**
 * THE MOST A SHEET MAY GROW PAST A DRAWING, in pixels of the screen. The point asks for a small fixed margin; this is
 * the ceiling of small, and the sheet's own margin is chosen under it.
 */
const A_SMALL_MARGIN_IS_AT_MOST = 32
/** Pixels a measure may be off by: a stroke's rounded points, and a scroll area rounded to whole pixels. */
const ROUNDING = 3

const note = {
  id: 'MadeUpZoomedSheet', kind: 'quick_note', title: 'Made-up zoomed sheet',
  data: { parts: [{ id: 'one', type: 'box', x: 40, y: 100, width: 120, height: 60, text: 'Made-up box' }] },
}
type Part = { id: string; type: string; points?: number[] }
type Stand = { sheetTest: { saves(): { parts: Part[] }[]; open(): void } }
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
const press = (page: Page, word: 'quickNote.zoomIn' | 'quickNote.zoomOut') => page.getByRole('button', { name: sayInEnglish(word), exact: true }).click()

/** How the sheet stands: its zoom, the room it scrolls through, and the window it is seen in, in pixels of the screen. */
type Standing = { zoom: number; scrollHeight: number; scrollTop: number; clientHeight: number; top: number; left: number; width: number }
async function standing(page: Page): Promise<Standing> {
  return page.locator('.qn-sheet').evaluate((sheet) => {
    const paper = sheet.querySelector<HTMLElement>('.qn-paper')!
    const zoom = Number(/scale\(([^)]+)\)/u.exec(paper.style.transform)?.[1] ?? '1')
    const box = sheet.getBoundingClientRect()
    return { zoom, scrollHeight: sheet.scrollHeight, scrollTop: sheet.scrollTop, clientHeight: sheet.clientHeight, top: box.top + sheet.clientTop, left: box.left + sheet.clientLeft, width: sheet.clientWidth }
  })
}
/** Wait until the room the sheet scrolls through has stood still for a few frames, and answer how it stands then. */
async function still(page: Page): Promise<Standing> {
  await page.locator('.qn-sheet').evaluate(async (sheet) => {
    const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    let last = -1
    let same = 0
    for (let i = 0; i < 120 && same < 5; i += 1) {
      await frame()
      same = sheet.scrollHeight === last ? same + 1 : 0
      last = sheet.scrollHeight
    }
  })
  return standing(page)
}
async function toTheFoot(page: Page): Promise<Standing> {
  await page.locator('.qn-sheet').evaluate((sheet) => { sheet.scrollTop = sheet.scrollHeight })
  return still(page)
}
async function strokes(page: Page): Promise<number> {
  return (await saves(page)).at(-1)?.parts.filter((part) => part.type === 'stroke').length ?? 0
}
/** Draw a short stroke down the window, from `from` to `to` pixels above the window's foot, and wait until it is saved. */
async function drawAbove(page: Page, from: number, to: number): Promise<void> {
  const before = await strokes(page)
  const at = await standing(page)
  const x = at.left + at.width / 2 + (before % 5) * 30 - 60
  const foot = at.top + at.clientHeight
  await page.mouse.move(x, foot - from)
  await page.mouse.down()
  await page.mouse.move(x, foot - to, { steps: 6 })
  await page.mouse.up()
  await expect.poll(() => strokes(page), { timeout: 10_000 }).toBe(before + 1)
}
/** The foot of the last stroke, as a place in the room the sheet scrolls through, in pixels of the screen. */
async function theLastStrokesFoot(page: Page): Promise<number> {
  const at = await standing(page)
  const box = await page.locator('.qn-stroke').last().boundingBox()
  if (box === null) throw new Error('The stroke is not drawn.')
  return box.y + box.height - at.top + at.scrollTop
}
/** The foot of the lowest thing drawn, stroke or box, as a place in the room the sheet scrolls through. */
async function theLowestFoot(page: Page): Promise<number> {
  const at = await standing(page)
  const feet = await page.locator('.qn-stroke, .qn-box').evaluateAll((all) => all.map((one) => one.getBoundingClientRect().bottom))
  return Math.max(...feet) - at.top + at.scrollTop
}

describe('the sheet of a note, zoomed', () => {
  it('grows by what a stroke at its foot needs and a small margin, at every zoom, and not when it is opened again', async () => {
    const page = await aNote()
    try {
      // ZOOMED IN AND OUT FIRST, so each zoom below is reached from another one.
      for (const word of ['quickNote.zoomIn', 'quickNote.zoomIn', 'quickNote.zoomOut', 'quickNote.zoomOut', 'quickNote.zoomOut'] as const) await press(page, word)
      for (const [word, times] of [['quickNote.zoomIn', 4], ['quickNote.zoomOut', 5]] as const) {
        for (let i = 0; i < times; i += 1) await press(page, word)
        const zoomed = await still(page)
        expect(zoomed.zoom, `the sheet is zoomed after ${word}`).not.toBe(1)
        // A ZOOM ALONE GROWS NOTHING: before anything is drawn at this zoom, the room the sheet scrolls through reaches
        // no further than the window where it is seen, or the lowest thing drawn and a small margin.
        expect(zoomed.scrollHeight, `at zoom ${String(zoomed.zoom)}, the room the sheet scrolls through before a stroke`).toBeLessThanOrEqual(Math.max(
          zoomed.scrollTop + zoomed.clientHeight + ROUNDING,
          await theLowestFoot(page) + A_SMALL_MARGIN_IS_AT_MOST + ROUNDING,
        ))

        for (let time = 1; time <= 3; time += 1) {
          const before = await toTheFoot(page)
          await drawAbove(page, 40, 12)
          const after = await still(page)
          const past = Math.max(0, await theLastStrokesFoot(page) - before.scrollHeight)
          expect(after.scrollHeight - before.scrollHeight, `at zoom ${String(after.zoom)}, stroke ${String(time)} at the foot grows the sheet by what it passes the foot by, ${String(past)}, and a small margin`)
            .toBeLessThanOrEqual(past + A_SMALL_MARGIN_IS_AT_MOST + ROUNDING)
        }

        const before = await toTheFoot(page)
        await drawAbove(page, before.clientHeight / 2 + 20, before.clientHeight / 2 - 20)
        const after = await still(page)
        expect(after.scrollHeight - before.scrollHeight, `at zoom ${String(after.zoom)}, a stroke in the middle of the window grows nothing`).toBeLessThanOrEqual(ROUNDING)
      }

      for (let opening = 1; opening <= 2; opening += 1) {
        await reopen(page)
        const opened = await still(page)
        expect(opened.zoom, 'the note opens at its own size').toBe(1)
        const lowest = Math.max(...(await saves(page)).at(-1)!.parts.flatMap((part) => (part.points ?? []).filter((_, i) => i % 2 === 1)))
        expect(opened.scrollHeight, `opening ${String(opening)}: the sheet is no taller than its lowest stroke, ${String(lowest)}, and a small margin`)
          .toBeLessThanOrEqual(Math.max(opened.clientHeight, lowest + A_SMALL_MARGIN_IS_AT_MOST + ROUNDING * 2))
      }
    } finally { await page.close() }
  }, 120_000)
})
