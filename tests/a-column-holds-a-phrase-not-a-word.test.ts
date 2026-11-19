// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * NO ENGLISH WORD IN THE HANDOVER TABLE IS DRAWN IN TWO PIECES OR OUTSIDE ITS OWN BOX.
 *
 * ---------------------------------------------------------------------------------------
 * THE RULE THIS FILE GUARDS
 * ---------------------------------------------------------------------------------------
 *
 * Criteria 7 and 20 of `design/problem-01/ACCEPTANCE.md`, as the owner replaced them on 29 August
 * 2026:
 *
 *   No plain English word is drawn in more than one piece, and no plain English word is drawn
 *   outside the content box of the element that holds it, on any audited surface, at 1440 or 390,
 *   in either theme.
 *
 * It serves the owner's sentence *"no semantic column should collapse into unreadable vertical text"*.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS CUT FROM THIS FILE, AND WHY
 * ---------------------------------------------------------------------------------------
 *
 * THE THREE-WORDS-A-LINE RULE IS GONE. Until this rewrite the two cases here required the label
 * column of the bundle preview's handover table to average at least three words a line and to draw
 * no label on more than two lines, and a second case required the sentence column to stay the
 * widest of the three.
 *
 * The owner read the reports at several widths on 29 August 2026 and said ordinary narrow wrapping
 * looks acceptable to them. Criteria 7 and 20 were replaced the same day. Three words a line is no
 * longer a criterion anywhere, and the widths of the three columns were the shape of the fix for a
 * rule that no longer exists. Asserting them pins a layout nobody decided.
 *
 * WHAT REPLACES THEM IS STRICTER, NOT WEAKER. The old cases read an average over one column. These
 * read every English word in every cell of the table and fail on one word. They are also measured
 * at 390 as well as 1440, which the old cases were not: the owner accepts narrow wrapping, so a
 * phone is where a word most needs checking rather than where the check is dropped.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT IS A BROWSER AND NOT THE STYLESHEET
 * ---------------------------------------------------------------------------------------
 *
 * Whether a word came apart is decided by the layout engine. A test that read the cell rule out of
 * `BundlePanel.tsx` was the cheap guard on the declaration, and it has since been deleted; this file
 * opens the page and asks the browser what it drew, which is what the criterion is about.
 *
 * THE FOUR DEFINITIONS BELOW ARE THE CRITERION'S OWN. They are in `design/problem-01/ACCEPTANCE.md`
 * under *What criterion 7 said*, and `tools/dead-band.mjs` implements the same four to sweep the
 * whole corpus. This file is the gate on the one table the owner named; the instrument is the
 * sweep. If the definitions change, both move.
 */

import type { Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { theResizeIsDrawn, liveApp, waitForThePage, type LiveApp } from './helpers.ts'

let app: LiveApp
let page: Page

/** One English word that was drawn wrongly, with enough said about it to go and look. */
interface BadWord {
  word: string
  token: string
  pieces: number
  outsideItsBox: boolean
  cell: string
}

/** What one sweep of the table found. */
interface Swept {
  cells: number
  judged: number
  broken: BadWord[]
  spilt: BadWord[]
}

beforeAll(async () => {
  app = await liveApp({ name: 'phrase-column', viewport: { width: 1440, height: 1000 } })
  page = app.page
  await openThePreview()
}, 120_000)

afterAll(async () => {
  await app.stop()
})

/** Open the bundle preview, which is the only way the handover table exists to be measured. */
async function openThePreview(): Promise<void> {
  await page.goto(`http://127.0.0.1:${String(app.webPort)}/#/bundles`, { waitUntil: 'domcontentloaded' })
  await page.reload({ waitUntil: 'domcontentloaded' })
  // THE WAIT MOST BROWSER FILES USE, for what it says when it fails. When the app's script
  // never ran, it says so; a wait for the heading alone said only that 30 seconds had passed
  // (problem nYa2PbaJXh39, where the script had been built away under the page).
  await waitForThePage(page)
  await page.waitForSelector('.px-page h1')
  // CRITERION B33 REMOVED THE *Choose a reading* PRESS. The controls are on the page on arrival.
  await page.waitForSelector('#bx-preset')
  await page.getByRole('button', { name: 'Read what it would say' }).click()
  await page.waitForSelector('.bx-partsread')
}

/**
 * EVERY ENGLISH WORD IN THE HANDOVER TABLE, ASKED OF THE BROWSER, AT ONE WINDOW WIDTH.
 *
 * A Range around each word answers both halves of the criterion directly. A word on one line
 * returns client rectangles that share a top; a word broken across lines returns rectangles with
 * two or more distinct tops. The same rectangles say whether any of them lies outside the content
 * box of the element holding the word. No font metric and no line height is guessed at.
 */
async function sweep(width: number): Promise<Swept> {
  await page.setViewportSize({ width, height: 1000 })
  await openThePreview()
  await theResizeIsDrawn(page)
  return page.evaluate(() => {
    interface Found {
      word: string
      token: string
      pieces: number
      outsideItsBox: boolean
      cell: string
    }
    const cells = [...document.querySelectorAll('.bx-partstable th, .bx-partstable td')]
    if (cells.length === 0) {
      throw new Error('no cells matched .bx-partstable; this test can no longer see what it guards')
    }
    // DEFINITION 1. A whole whitespace-delimited token holding any of these is an identifier or a
    // path, and neither it nor any letter run inside it is judged: it has nowhere to break between
    // characters and nowhere to be widened to.
    const isIdentifier = (token: string): boolean => /[0-9._/\\@:#]/.test(token) || /[a-z][A-Z]/.test(token)
    const size = (value: string): number => Number.parseFloat(value) || 0
    const broken: Found[] = []
    const spilt: Found[] = []
    let judged = 0
    for (const cell of cells) {
      const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT)
      while (walker.nextNode()) {
        const node = walker.currentNode
        const text = node.textContent ?? ''
        if (text.trim() === '') continue
        const parent = node.parentElement
        if (parent === null) continue
        // DEFINITION 4. A box nobody can see is not judged. Nothing in this table is hidden, so
        // this is the honest skip rather than a way past a failure.
        const style = getComputedStyle(parent)
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') continue
        const box = parent.getBoundingClientRect()
        if (box.width <= 2 || box.height <= 2) continue
        const insetLeft = box.left + size(style.paddingLeft) - 0.5
        const insetRight = box.right - size(style.paddingRight) + 0.5
        for (const token of text.matchAll(/\S+/g)) {
          if (isIdentifier(token[0])) continue
          // DEFINITION 2. A hyphen is a legal break, so each hyphen-free letter run of four or more
          // letters is judged on its own.
          for (const run of token[0].matchAll(/[A-Za-z]{4,}/g)) {
            const at = (token.index ?? 0) + (run.index ?? 0)
            const range = document.createRange()
            range.setStart(node, at)
            range.setEnd(node, at + run[0].length)
            const rects = [...range.getClientRects()].filter((r) => r.width > 0.5)
            if (rects.length === 0) continue
            judged += 1
            // DEFINITION 3. In more than one piece means the rectangles occupy two or more distinct
            // tops. Counting rectangles instead reads one truncated line as two.
            const tops = new Set(rects.map((r) => Math.round(r.top)))
            const outside = rects.some((r) => r.left < insetLeft || r.right > insetRight)
            const found: Found = {
              word: run[0],
              token: token[0],
              pieces: tops.size,
              outsideItsBox: outside,
              cell: (cell.textContent ?? '').trim().slice(0, 60),
            }
            if (tops.size > 1) broken.push(found)
            if (outside) spilt.push(found)
          }
        }
      }
    }
    return { cells: cells.length, judged, broken, spilt }
  })
}

/** One line about a word, for a failure message somebody can act on. */
const say = (one: BadWord): string =>
  `"${one.word}" in "${one.token}" drew on ${String(one.pieces)} lines` +
  `${one.outsideItsBox ? ' and outside its own box' : ''}, in the cell "${one.cell}"`

describe('the handover table draws whole words inside their own boxes', () => {
  /**
   * THE CONTROL, AND IT COMES FIRST. Both cases below pass on a table nobody drew, because a table
   * with no words in it has no broken words in it either. This says the preview is on the screen
   * and that there are English words in it to judge.
   */
  it('really drew the handover table, with English words in it to judge', async () => {
    const at = await sweep(1440)
    expect(at.cells, 'the handover table was not drawn at all').toBeGreaterThan(5)
    expect(at.judged, 'no English word was judged, so the two cases below prove nothing').toBeGreaterThan(30)
  }, 120_000)

  /**
   * THE HALF THE OWNER'S SENTENCE IS ABOUT. A column so narrow that a word comes apart between two
   * characters is the column collapsing into vertical text.
   *
   * Mutation: put `overflow-wrap: anywhere` back on the cell rule in `BundlePanel.tsx`. Measured
   * with it at 1440: a 53px label column drawing "The/camp/aign/and/wher/e it/has/got to".
   */
  it('never draws an English word in more than one piece, at 1440 and at 390', async () => {
    for (const width of [1440, 390]) {
      const at = await sweep(width)
      expect(
        at.broken.map(say),
        `at a ${String(width)}px window, ${String(at.broken.length)} English words came apart`,
      ).toEqual([])
    }
  }, 180_000)

  /**
   * AND THE OTHER HALF. A word drawn past the edge of the box holding it is drawn over whatever is
   * beside it, which a reader meets as two columns of letters on top of each other.
   */
  it('never draws an English word outside the box that holds it, at 1440 and at 390', async () => {
    for (const width of [1440, 390]) {
      const at = await sweep(width)
      expect(
        at.spilt.map(say),
        `at a ${String(width)}px window, ${String(at.spilt.length)} English words were drawn outside their own box`,
      ).toEqual([])
    }
  }, 180_000)
})
