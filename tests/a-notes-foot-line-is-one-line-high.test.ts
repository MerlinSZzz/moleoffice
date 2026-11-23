// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE LINE AT A NOTE'S FOOT IS ONE LINE HIGH, WITH NOTHING UNDER IT. Point NU-2 of the notes after the person's use of
 * 21 November: the line that says where a note is kept and when it was saved grew to several lines in a small note, and
 * the note floating over the office kept an empty band under it.
 *
 * Each case opens a made-up note that was written from a page with a long name, floating over a made-up page, and
 * changes it so the line says it was saved. A small note stands in a narrow window with little drawn; a grown one stands
 * in a wide window with its sheet grown far past it. In both, every piece of the foot line stands on one line, the line
 * is no higher than one line of its words and its padding, and its foot is the note's own foot.
 */
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { readFileSync } from 'node:fs'
import { chromium, type Browser, type Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { sayInEnglish } from '../src/shared/i18n.ts'
import { bundlePageCode } from './a-bundle-of-page-code.ts'

const FROM_A_PAGE = { address: '#/r/MadeUpPage', name: 'A made-up page with a long name that does not fit on one line of a small note' }
const SMALL = {
  id: 'MadeUpSmallNote', kind: 'quick_note', title: 'Made-up small note', workspaceId: 'default',
  data: { from_page: FROM_A_PAGE, parts: [{ id: 'one', type: 'words', x: 24, y: 16, width: 200, text: 'Made-up small note' }] },
}
const GROWN = {
  id: 'MadeUpGrownNote', kind: 'quick_note', title: 'Made-up grown note', workspaceId: 'default',
  data: {
    from_page: FROM_A_PAGE,
    parts: [
      { id: 'one', type: 'words', x: 24, y: 16, width: 200, text: 'Made-up grown note' },
      { id: 'far', type: 'box', x: 1800, y: 2600, width: 200, height: 80, text: 'Made-up box far down' },
      { id: 'line', type: 'stroke', colour: 'ink', width: 2.5, points: [40, 200, 900, 1400, 1600, 3200] },
    ],
  },
}
const NOTES = { small: { note: SMALL, viewport: { width: 390, height: 700 } }, grown: { note: GROWN, viewport: { width: 1440, height: 900 } } } as const
type Stand = { footTest: { open(id: string): void } }
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
      const stored = Object.fromEntries(${JSON.stringify([SMALL, GROWN])}.map((note) => [note.id, note]));
      let version = 1;
      api.getRecord = async (id) => ({ record: structuredClone(stored[id]), version: 'v' + version });
      api.changeAQuickNote = async (id, change) => {
        stored[id].data.parts = structuredClone(change.parts);
        if (change.title !== undefined) stored[id].title = change.title;
        return { version: 'v' + (++version), newSeq: version };
      };
      createRoot(document.getElementById('app')).render(h(QuickNoteBeside));
      window.footTest = { open: (id) => openAQuickNote(id) };
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

async function aNote(which: keyof typeof NOTES): Promise<Page> {
  const { note, viewport } = NOTES[which]
  const page = await browser.newPage({ viewport })
  await page.goto(`${site}/#/`)
  await page.addStyleTag({ content: styles })
  await page.addScriptTag({ url: `${site}/page.js`, type: 'module' })
  await page.waitForFunction(() => 'footTest' in window)
  await page.evaluate((id) => (window as unknown as Stand).footTest.open(id), note.id)
  await page.locator('[data-quick-note-beside] .qn-title-field').waitFor()
  return page
}

/** How the foot line stands: its height, one line of its words with its padding, how far its pieces stand apart, and what is under it. */
type Foot = { height: number; oneLine: number; tops: number[]; bottoms: number[]; under: number; words: string }
async function theFoot(page: Page): Promise<Foot> {
  return page.locator('[data-quick-note-beside]').evaluate((beside) => {
    const foot = beside.querySelector<HTMLElement>('.qn-foot')!
    const style = getComputedStyle(foot)
    const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.5
    const oneLine = Math.max(parseFloat(style.minHeight) || 0, lineHeight + parseFloat(style.paddingTop) + parseFloat(style.paddingBottom) + parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth))
    // EVERY LINE BOX OF EVERY PIECE, so words that wrap inside one piece count as a second line too.
    const boxes = [...foot.children].flatMap((piece) => [...piece.getClientRects()].concat([...piece.querySelectorAll('*')].flatMap((inner) => [...inner.getClientRects()])))
      .filter((box) => box.width > 0 && box.height > 0)
    const pieces = [...foot.querySelectorAll<HTMLElement>(':scope > *')]
    const lines = pieces.flatMap((piece) => {
      const range = document.createRange()
      range.selectNodeContents(piece)
      return [...range.getClientRects()].filter((box) => box.width > 0 && box.height > 0)
    })
    const all = [...boxes, ...lines]
    const inner = beside.getBoundingClientRect().bottom - parseFloat(getComputedStyle(beside).borderBottomWidth)
    return {
      height: foot.getBoundingClientRect().height,
      oneLine,
      tops: all.map((box) => Math.round(box.top)),
      bottoms: all.map((box) => Math.round(box.bottom)),
      under: inner - foot.getBoundingClientRect().bottom,
      words: foot.textContent ?? '',
    }
  })
}

describe('the line at a note\'s foot', () => {
  it.each(Object.keys(NOTES) as (keyof typeof NOTES)[])('is one line high, with nothing under it, in a %s note', async (which) => {
    const page = await aNote(which)
    try {
      const beside = page.locator('[data-quick-note-beside]')
      await beside.locator('.qn-title-field').fill(`Made-up title of the ${which} note`)
      await beside.getByRole('status').filter({ hasText: sayInEnglish('quickNote.saved', { time: '' }).trim() }).waitFor({ timeout: 10_000 })
      const foot = await theFoot(page)
      expect(foot.words, 'the foot says where the note is kept and the page it was written from').toContain(FROM_A_PAGE.name.slice(0, 12))
      expect(foot.height, `the foot line is ${String(foot.height)} high, and one line of it is ${String(foot.oneLine)}`).toBeLessThanOrEqual(foot.oneLine + 1)
      expect(Math.max(...foot.tops) - Math.min(...foot.tops), 'every piece of the foot line starts on the same line').toBeLessThanOrEqual(4)
      expect(Math.max(...foot.bottoms) - Math.min(...foot.bottoms), 'every piece of the foot line ends on the same line').toBeLessThanOrEqual(4)
      expect(Math.abs(foot.under), 'nothing stands under the foot line inside the note').toBeLessThanOrEqual(1)
    } finally { await page.close() }
  }, 60_000)
})
