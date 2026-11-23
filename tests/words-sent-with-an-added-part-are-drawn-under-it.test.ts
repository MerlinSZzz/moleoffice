// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WORDS SENT WITH AN ADDED PART ARE DRAWN UNDER IT, HOWEVER TALL IT IS DRAWN, AND WORDS KEPT ANYWHERE ELSE ARE DRAWN
 * WHERE THEY ARE KEPT.
 *
 * Send with Note chosen in the right-click box adds what was right-clicked to a note and keeps the words typed with it
 * in the same write, just after the added part. The sheet draws an added part under everything drawn before it, at the
 * height its copy takes, so the top a note keeps for it says little about where it is drawn. Words kept a fixed
 * distance under that top would be drawn over it. The sheet (src/web/components/QuickNoteSheet.tsx) names the place
 * such words are kept at, `whereWordsWithAnAddedPartGo`, and draws words kept there, straight after their added part,
 * under the added part as it is drawn, as it draws the next added part. This rule is a point of its own, beside the
 * four points of the right-click box.
 *
 * The note page (src/web/pages/QuickNotePage.tsx) is drawn in Chromium on a page of its own, from a bundle, with the
 * office's own style sheets and the two doors it calls answered by hand. No server, port or office is involved, and
 * every note in this file is made up.
 *
 * WHAT THIS FILE PROVES:
 *   - the sheet names the place words sent with an added part are kept at;
 *   - words kept there, straight after their added part, are drawn at the added part's left and under it as it is
 *     drawn, over none of it, with the space the sheet leaves above the added part; so they are when the words before
 *     push the added part down, and again after the window narrows and the added part is drawn taller;
 *   - a press on those words writes in them where they are drawn;
 *   - words kept one pixel off that place, to the left or above, are drawn where they are kept, as
 *     all words were before the rule; so are words kept at that place with another part between them and the added
 *     part;
 *   - nothing is saved by drawing.
 *
 * THE MUTATIONS THAT TURN THIS RED, after a green control run:
 *   - in `reachOf` (src/web/components/QuickNoteSheet.tsx) draw no words with an added part, by making `withTheAdded`
 *     false. The words sent with the added part are then drawn where they are kept, over the added part, and the case
 *     about them turns red;
 *   - in `reachOf` take words within a pixel of the place as kept there. The words one pixel off are then drawn under
 *     the added part, and the two cases about them turn red.
 * On the code before the rule the sheet names no such place, and every case turns red where it asks for the place.
 */
import { readFileSync } from 'node:fs'
import { chromium, type Browser, type Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_QUICK_NOTE_SEGMENT } from '../src/config/the-quick-note-address.mjs'
import { bundlePageCode } from './a-bundle-of-page-code.ts'

const NOTE_ID = 'MadeUpUnder1'
type Place = { x: number; y: number }
type Drawn = { left: number; top: number; height: number }
type Stand = {
  sheetTest: {
    saves(): unknown[]
    addedGoesAfter(parts: object[]): Place
    wordsGoWith(added: Place): Place | null
    open(parts: object[]): void
  }
}

// Words written before anything was added, so the added part is drawn lower than the top the note keeps for it.
const FIRST = { id: 'w-first', type: 'words', x: 20, y: 16, width: 560, text: 'Made-up words, written before anything was added.' }
const SUMMARY = `Made-up summary. ${'Made-up words that take more than a line of their own in a narrow window. '.repeat(6)}`
const anAddedPart = (place: Place) => ({
  id: 'a-card',
  type: 'added',
  ...place,
  width: 560,
  at: '2026-11-17T05:00:00.000Z',
  from: { address: '#/records/MadeUpCard01', name: 'A made-up idea', recordId: 'MadeUpCard01' },
  copy: { type: 'card', recordId: 'MadeUpCard01', kind: 'idea', title: 'A made-up idea', summary: SUMMARY },
})
const words = (id: string, place: Place, text: string) => ({ id, type: 'words', ...place, width: 560, text })

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
      import * as sheet from './src/web/components/QuickNoteSheet.tsx';
      import { QuickNotePage } from './src/web/pages/QuickNotePage.tsx';
      const stored = { id: ${JSON.stringify(NOTE_ID)}, kind: 'quick_note', title: 'Made-up note', data: { parts: [] } };
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
      window.sheetTest = {
        saves: () => saves,
        addedGoesAfter: (parts) => sheet.whereAnAddedPartGoes(parts),
        // THE SHEET BEFORE THE RULE NAMES NO SUCH PLACE, and the case says so rather than placing the words itself.
        wordsGoWith: (added) => typeof sheet.whereWordsWithAnAddedPartGo === 'function' ? sheet.whereWordsWithAnAddedPartGo(added) : null,
        open: (parts) => { stored.data.parts = structuredClone(parts); root.render(h(QuickNotePage, { key: ++key })); },
      };
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

async function aSheet(): Promise<Page> {
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } })
  await page.route('http://note.test/**', (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><div id="app"></div>' }))
  await page.goto(`http://note.test/#/${THE_QUICK_NOTE_SEGMENT}/${NOTE_ID}`)
  await page.addStyleTag({ content: styles })
  await page.addScriptTag({ content: script, type: 'module' })
  await page.waitForFunction(() => 'sheetTest' in window)
  return page
}

/** Where the sheet puts a part added after the first words, and where it keeps words sent with that part. */
async function thePlaces(page: Page): Promise<{ added: Place; words: Place }> {
  const { added, words: place } = await page.evaluate((first) => {
    const stand = (window as unknown as Stand).sheetTest
    const added = stand.addedGoesAfter([first])
    return { added, words: stand.wordsGoWith(added) }
  }, FIRST)
  if (place === null) throw new Error('The sheet names no place for words sent with an added part.')
  return { added, words: place }
}

/** The note drawn with these parts, once the added part is drawn under the first words, which the sheet has measured. */
async function drawnWith(page: Page, parts: object[], kept: Place): Promise<void> {
  await page.evaluate((all) => (window as unknown as Stand).sheetTest.open(all), parts)
  await expect.poll(async () => (await drawn(page, 'a-card')).top, { timeout: 10_000 }).toBeGreaterThan(kept.y)
}

const drawn = (page: Page, id: string): Promise<Drawn> =>
  page.locator(`.qn-paper > [data-part="${id}"]`).evaluate((element) => {
    const one = element as HTMLElement
    return { left: one.offsetLeft, top: one.offsetTop, height: one.offsetHeight }
  })
const saves = (page: Page) => page.evaluate(() => (window as unknown as Stand).sheetTest.saves())

/** How far under the added part the words are drawn, and how far the added part is drawn under the first words. */
async function spaces(page: Page, id: string): Promise<{ above: number; under: number; left: number }> {
  const [first, added, sent] = await Promise.all([drawn(page, FIRST.id), drawn(page, 'a-card'), drawn(page, id)])
  return { above: added.top - (first.top + first.height), under: sent.top - (added.top + added.height), left: sent.left - added.left }
}

describe('words sent with an added part are drawn under it, and other words where they are kept', () => {
  it('draws words sent with an added part under it as drawn, and again once the part is drawn taller', async () => {
    const page = await aSheet()
    try {
      const { added, words: place } = await thePlaces(page)
      await drawnWith(page, [FIRST, anAddedPart(added), words('w-sent', place, 'Made-up words sent with the card.')], added)
      const wide = await spaces(page, 'w-sent')
      expect(wide.above, 'the space the sheet leaves above the added part').toBeGreaterThan(0)
      expect(wide.under, 'the space between the added part as drawn and the words sent with it').toBe(wide.above)
      expect(wide.left, 'the words sent with the added part start at its left').toBe(0)

      const before = (await drawn(page, 'a-card')).height
      await page.setViewportSize({ width: 390, height: 700 })
      await expect.poll(async () => (await drawn(page, 'a-card')).height, { timeout: 10_000 }).toBeGreaterThan(before)
      await expect.poll(async () => spaces(page, 'w-sent'), { timeout: 10_000 }).toEqual(wide)
      expect(await saves(page), 'nothing is saved by drawing').toEqual([])

      // A PRESS ON THE WORDS WRITES IN THEM WHERE THEY ARE DRAWN, so the field does not jump back over the added part.
      await page.locator('.qn-paper > [data-part="w-sent"]').click()
      const writingThere = () => page.evaluate(() => document.activeElement?.matches('.qn-paper > [data-part="w-sent"] textarea') === true)
      await expect.poll(writingThere, { message: 'the field for the words has the cursor', timeout: 10_000 }).toBe(true)
      expect(await spaces(page, 'w-sent'), 'the words being written are drawn where they were').toEqual(wide)
    } finally { await page.close() }
  }, 60_000)

  for (const [side, dx, dy] of [['to the left of', -1, 0], ['above', 0, -1]] as const) {
    it(`draws words kept one pixel ${side} that place where they are kept`, async () => {
      const page = await aSheet()
      try {
        const { added, words: place } = await thePlaces(page)
        const off = { x: place.x + dx, y: place.y + dy }
        await drawnWith(page, [FIRST, anAddedPart(added), words('w-off', off, 'Made-up words a pixel off.')], added)
        const { left, top } = await drawn(page, 'w-off')
        expect({ left, top }, 'the words are drawn where they are kept').toEqual({ left: off.x, top: off.y })
        expect(await saves(page), 'nothing is saved by drawing').toEqual([])
      } finally { await page.close() }
    }, 60_000)
  }

  it('draws words kept at that place where they are kept when another part comes between them and the added part', async () => {
    const page = await aSheet()
    try {
      const { added, words: place } = await thePlaces(page)
      const between = { id: 'b-between', type: 'box', x: 400, y: 600, width: 120, height: 60, text: 'Made-up box' }
      await drawnWith(page, [FIRST, anAddedPart(added), between, words('w-after', place, 'Made-up words after a box.')], added)
      const { left, top } = await drawn(page, 'w-after')
      expect({ left, top }, 'the words are drawn where they are kept').toEqual({ left: place.x, top: place.y })
      expect(await saves(page), 'nothing is saved by drawing').toEqual([])
    } finally { await page.close() }
  }, 60_000)
})
