// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PLACE IS RECORDED FOR EVERY GESTURE, AND THE SOURCE STAYS MARKED WHILE THE COMPOSER IS OPEN.
 *
 * ---------------------------------------------------------------------------------------
 * THE TWO DEFECTS THIS FILE IS ABOUT, BOTH THE OWNER'S OWN
 * ---------------------------------------------------------------------------------------
 *
 * 1. THE OWNER RIGHT-CLICKED A PARAGRAPH OF A 61-BLOCK REPORT, WROTE THE WORD "here", AND PANELX STORED A
 *    COMMENT AGAINST THE WHOLE REPORT. Two of the owner's real comments are like that. A place was recorded
 *    only when there was a text selection, so a press with nothing selected recorded nothing about
 *    where the owner was — and a drag that ran from one paragraph into the next was thrown away and
 *    reported exactly like no selection at all. One boolean carried two facts, and the composer
 *    could not tell a discarded gesture from a gesture nobody made.
 *
 * 2. THE OWNER SELECTED WORDS, RIGHT-CLICKED THEM, AND THE SELECTION VANISHED. Focus moving into the
 *    composer's box destroys the document selection — measured in Chromium, Firefox and WebKit
 *    alike — so the words the composer said it was about stopped being visible at the moment it
 *    opened.
 *
 * ---------------------------------------------------------------------------------------
 * WHY A REAL BROWSER, AND WHAT IS ASSERTED
 * ---------------------------------------------------------------------------------------
 *
 * Both defects are about pixels. The first is about which rectangles are drawn on which paragraphs
 * before anything is saved; the second is about a rectangle existing at all once focus has moved.
 * A unit test over the capture rule would assert what is STORED, and "the annotation stores a
 * target" is true of every failing case in the failure matrix.
 *
 * So every assertion below reads the screen: the rectangles of the mark, the rectangles of the
 * selection that made it, and the words on the chip. Nothing here asserts a share, a ratio or a
 * count of elements carrying an attribute.
 *
 * ---------------------------------------------------------------------------------------
 * AND THE HALF THAT MUST NOT MOVE
 * ---------------------------------------------------------------------------------------
 *
 * The owner's invariant has two halves and both bind. Before somebody invokes, selecting words adds
 * nothing at all. The first case below is that half, asserted against the surface this step
 * introduces: after a drag with no right-click, the mark layer draws no element.
 *
 * The servers come from `liveApp` in tests/helpers.ts: a throwaway database, two free ports, and
 * the ports proved free again at the end. Nothing here touches ./data/panelx.db.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import type { Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type LiveApp, liveApp, waitForThePage } from './helpers.ts'
import { theNameOfThePageScroller, whereThePageIs } from './the-page-scroller.ts'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const REPORT_TITLE = 'What the second calibration run showed'
const FIRST =
  'The mount holds calibration through a full handover, and the reprojection error stayed inside a ' +
  'quarter of a pixel across forty frames.'
const SECOND =
  'The mast is the part that moved. Nothing was re-machined between the two runs, so the change has ' +
  'to be in how it is clamped.'
/**
 * FORTY MORE PARTS AFTER THE TWO THE CASES READ, so the page is long enough to scroll three thousand pixels.
 * With the two parts alone the page was exactly as tall as the window, and a scroll of it moved nothing.
 */
const MORE = Array.from({ length: 40 }, (_, n) => ({
  id: `b-${String(n + 3)}`,
  type: 'text',
  heading: `Frame set ${String(n + 3)}`,
  text:
    'The mount was checked again on this set of frames, and the error stayed where the first set put it. ' +
    'Nothing about the rig was changed between the sets, so this part only says the reading held. ' +
    'The clamp on the mast was left as it was found, and its bolts were not turned.',
}))

let app: LiveApp
let webPort: number
let page: Page
let reportId: string

beforeAll(async () => {
  // THIS FILE IS ABOUT WHAT IS INSIDE A REPORT'S BODY, SO IT SAYS WHICH LEVEL IT READS AT.
  // The owner's act 3a of 15 September 2026 made a record page open at the
  // conclusion, where the body holds the summary and nothing else, so a test that measures a
  // diagram, a picture, a mark, a tab stop or a panel inside the writing found an empty body and
  // waited for a selector that would never appear. `opensAt` writes the reader's own stored
  // choice before the page loads, so this file is about its own subject again and not about the
  // level a page opens at. That level has its own test in
  // tests/a-reader-goes-no-lower-than-conclusion.test.ts, which stores nothing.
  app = await liveApp({ opensAt: 'full', name: 'source-marked', viewport: { width: 1440, height: 1000 } })
  webPort = app.webPort
  page = app.page

  const res = await fetch(`http://127.0.0.1:${String(app.apiPort)}/api/records`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-mole-office-actor-type': 'human',
      'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
    },
    body: JSON.stringify({
      kind: 'report',
      title: REPORT_TITLE,
      data: {
        for: `${THE_TEST_OFFICES_OWNER.name}, who asked for the review`,
        date: '2026-08-20',
        blocks: [
          { id: 'b-1', type: 'text', heading: 'What I found', text: FIRST },
          { id: 'b-2', type: 'text', heading: 'What moved', text: SECOND },
          ...MORE,
        ],
      },
    }),
  })
  if (!res.ok) throw new Error(`seeding the report answered ${String(res.status)}: ${await res.text()}`)
  reportId = ((await res.json()) as { record: { id: string } }).record.id
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

// ---------------------------------------------------------------------------- reading the screen

/** One rectangle of the source mark, as a person would see it. */
interface Drawn {
  mark: string
  edge: string | null
  doubled: boolean
  left: number
  top: number
  width: number
  height: number
}

/** Every rectangle the mark layer is drawing right now. */
async function marksOnScreen(): Promise<Drawn[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.px-subject > i')].map((piece) => {
      const box = piece.getBoundingClientRect()
      return {
        mark: piece.className.replace('px-subject-', ''),
        edge: piece.getAttribute('data-edge'),
        doubled: piece.querySelector('.px-subject-glyph') !== null,
        left: box.left,
        top: box.top,
        width: box.width,
        height: box.height,
      }
    }),
  )
}

/** The smallest box holding all of these rectangles, or null when there are none. */
function around(pieces: readonly Drawn[]): { left: number; top: number; right: number; bottom: number } | null {
  if (pieces.length === 0) return null
  return {
    left: Math.min(...pieces.map((one) => one.left)),
    top: Math.min(...pieces.map((one) => one.top)),
    right: Math.max(...pieces.map((one) => one.left + one.width)),
    bottom: Math.max(...pieces.map((one) => one.top + one.height)),
  }
}

/** Open the report and start every case from the same state: no selection, no composer. */
async function freshPage(): Promise<void> {
  await page.goto(`http://127.0.0.1:${String(webPort)}/#/r/${reportId}`, {
    timeout: 60_000,
  })
  await waitForThePage(page, 60_000)
  await page.locator(RUN_OF('b-2')).waitFor({ timeout: 30_000 })
  await page.keyboard.press('Escape')
  await page.evaluate(() => {
    window.getSelection()?.removeAllRanges()
  })
  await sleep(250)
}

/** The one element drawing a block's stored text, named by the stored string it says it draws. */
const RUN_OF = (block: string) => `[data-text-field="data.blocks[#${block}].text"]`

/**
 * Select from one run of drawn text into another, and hand back the box the browser drew round it.
 *
 * The runs are named by the stored string they say they draw, so the test never has to know how
 * the record page nests its elements or how many other runs it puts on the screen first.
 */
async function selectRuns(
  fromRun: string,
  fromChar: number,
  toRun: string,
  toChar: number,
): Promise<{ left: number; top: number; right: number; bottom: number; text: string; at: { x: number; y: number } }> {
  return page.evaluate(
    ({ fromRun, fromChar, toRun, toChar }) => {
      const startIn = document.querySelector<HTMLElement>(fromRun)
      const endIn = document.querySelector<HTMLElement>(toRun)
      if (startIn === null || endIn === null) throw new Error('the page does not draw those runs')
      const textIn = (element: HTMLElement): Text => {
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
        const node = walker.nextNode()
        if (node === null) throw new Error('that run draws no text')
        return node as Text
      }
      const range = document.createRange()
      range.setStart(textIn(startIn), fromChar)
      range.setEnd(textIn(endIn), toChar)
      const selection = window.getSelection()
      if (selection === null) throw new Error('this browser has no selection')
      selection.removeAllRanges()
      selection.addRange(range)
      const rects = [...range.getClientRects()]
      const last = rects[rects.length - 1]
      if (last === undefined) throw new Error('the selection drew no rectangles')
      return {
        left: Math.min(...rects.map((r) => r.left)),
        top: Math.min(...rects.map((r) => r.top)),
        right: Math.max(...rects.map((r) => r.right)),
        bottom: Math.max(...rects.map((r) => r.bottom)),
        text: range.toString(),
        // A POINT INSIDE THE SELECTION'S LAST LINE, because a right-click outside a selection
        // collapses it and this test is about a right-click inside one.
        at: { x: Math.round(last.left + last.width / 2), y: Math.round(last.top + last.height / 2) },
      }
    },
    { fromRun, fromChar, toRun, toChar },
  )
}

/** The box the browser drew round one run of text, for asserting where a rail sits. */
async function runBox(which: string): Promise<{ left: number; top: number; height: number }> {
  return page.evaluate((which) => {
    const run = document.querySelector<HTMLElement>(which)
    if (run === null) throw new Error('the page does not draw that run')
    const box = run.getBoundingClientRect()
    return { left: box.left, top: box.top, height: box.height }
  }, which)
}

// ---------------------------------------------------------------------------- the passive half

describe('selecting words still adds nothing at all', () => {
  it('draws no mark of its own after a drag that nobody invoked', async () => {
    await freshPage()
    const selected = await selectRuns(RUN_OF('b-1'), 4, RUN_OF('b-1'), 40)
    expect(selected.text.length).toBeGreaterThan(20)
    // HALF A SECOND, because the deleted offer used to appear on `pointerup` and a mark that
    // arrived late would pass an assertion made immediately.
    await sleep(500)

    expect(await marksOnScreen()).toEqual([])
    const alive = await page.evaluate(() => {
      const selection = window.getSelection()
      return { text: selection?.toString() ?? '', collapsed: selection?.isCollapsed ?? true }
    })
    expect(alive.collapsed).toBe(false)
    expect(alive.text).toBe(selected.text)
  }, 120_000)
})

// ---------------------------------------------------------------------------- the exact characters

describe('a selection inside one paragraph is marked exactly where it was', () => {
  it('paints the same rectangle the browser did, with the composer focused on top of it', async () => {
    await freshPage()
    const selected = await selectRuns(RUN_OF('b-1'), 10, RUN_OF('b-1'), 60)
    await page.mouse.click(selected.at.x, selected.at.y, { button: 'right' })
    await page.locator('.px-talk').waitFor({ timeout: 20_000 })
    await sleep(400)

    // THE COMPOSER REALLY HAS FOCUS, which is what took the browser's own selection away. Without
    // this the paint could be passing only because nothing had happened yet.
    const focused = await page.evaluate(() => document.activeElement?.tagName ?? 'NONE')
    expect(focused).toBe('TEXTAREA')

    const drawn = await marksOnScreen()
    const washes = drawn.filter((one) => one.mark === 'wash')
    expect(washes.length).toBeGreaterThan(0)
    expect(washes.every((one) => one.edge === 'solid')).toBe(true)

    const box = around(washes)
    if (box === null) throw new Error('no wash was drawn')
    expect(Math.abs(box.left - selected.left)).toBeLessThanOrEqual(1)
    expect(Math.abs(box.top - selected.top)).toBeLessThanOrEqual(1)
    expect(Math.abs(box.right - selected.right)).toBeLessThanOrEqual(1)
    expect(Math.abs(box.bottom - selected.bottom)).toBeLessThanOrEqual(1)
  }, 120_000)

  it('is still there after three thousand pixels of scrolling and back', async () => {
    await freshPage()
    const selected = await selectRuns(RUN_OF('b-1'), 10, RUN_OF('b-1'), 60)
    await page.mouse.click(selected.at.x, selected.at.y, { button: 'right' })
    await page.locator('.px-talk').waitFor({ timeout: 20_000 })
    await sleep(400)
    const before = around(await marksOnScreen())

    // THE PAGE IS SCROLLED AS A PERSON SCROLLS IT, by the wheel over the words. That moves whatever the page scrolls
    // in: the window, or the report's own box. The place is read from that element, and the failure line names it,
    // because a scroll that moved nothing would let this case hold while testing nothing.
    const scroller = await theNameOfThePageScroller(page)
    const words = await runBox(RUN_OF('b-1'))
    await page.mouse.move(Math.round(words.left + 20), Math.round(words.top + words.height / 2))
    await page.mouse.wheel(0, 3000)
    await expect.poll(() => whereThePageIs(page), { message: `the wheel did not scroll ${scroller} three thousand pixels`, timeout: 10_000 }).toBe(3000)
    await page.mouse.wheel(0, -3000)
    await expect.poll(() => whereThePageIs(page), { message: `the wheel did not bring ${scroller} back to its top`, timeout: 10_000 }).toBe(0)
    await sleep(600)

    const after = around(await marksOnScreen())
    if (before === null || after === null) throw new Error('the mark did not survive the scroll')
    expect(Math.abs(after.left - before.left)).toBeLessThanOrEqual(1)
    expect(Math.abs(after.top - before.top)).toBeLessThanOrEqual(1)
  }, 120_000)

  it('goes when the composer goes, and nothing brings it back', async () => {
    await freshPage()
    const selected = await selectRuns(RUN_OF('b-1'), 10, RUN_OF('b-1'), 60)
    await page.mouse.click(selected.at.x, selected.at.y, { button: 'right' })
    await page.locator('.px-talk').waitFor({ timeout: 20_000 })
    await sleep(400)
    expect((await marksOnScreen()).length).toBeGreaterThan(0)

    await page.keyboard.press('Escape')
    await sleep(400)
    expect(await marksOnScreen()).toEqual([])
    // THREE SECONDS, because the mark this replaces was owned by a 2,600 ms clock that re-armed
    // itself, so a thing could go out and come back after the press that ended it.
    await sleep(3000)
    expect(await marksOnScreen()).toEqual([])
  }, 120_000)
})

// ---------------------------------------------------------------------------- the owner's defect

describe('a selection that crosses a block boundary is kept and drawn', () => {
  it('marks both paragraphs and names the thing that holds them, before anything is saved', async () => {
    await freshPage()
    const first = await runBox(RUN_OF('b-1'))
    const second = await runBox(RUN_OF('b-2'))
    const selected = await selectRuns(RUN_OF('b-1'), 60, RUN_OF('b-2'), 40)
    expect(selected.text).toContain('The mast is the part that moved')

    await page.mouse.click(selected.at.x, selected.at.y, { button: 'right' })
    await page.locator('.px-talk').waitFor({ timeout: 20_000 })
    await sleep(400)

    const washes = (await marksOnScreen()).filter((one) => one.mark === 'wash')
    expect(washes.length).toBeGreaterThan(0)
    // DASHED, WHICH IS THE STATE CHANNEL. Solid says "these exact characters" and this gesture is
    // not that; the difference survives greyscale and a forced-colours setting.
    expect(washes.every((one) => one.edge === 'dashed')).toBe(true)

    // BOTH PARAGRAPHS ARE MARKED. Before this step the whole gesture was discarded, the comment was
    // filed against whichever block the pointer happened to be in, and nothing was drawn anywhere.
    const inFirst = washes.some((one) => one.top < first.top + first.height && one.top + one.height > first.top)
    const inSecond = washes.some((one) => one.top < second.top + second.height && one.top + one.height > second.top)
    expect({ inFirst, inSecond }).toEqual({ inFirst: true, inSecond: true })

    // AND THE COMPOSER IS ABOUT THE THING HOLDING BOTH ENDS, not the block under the pointer.
    const chip = await page.locator('.px-talk').innerText()
    expect(chip).toContain(REPORT_TITLE)
  }, 120_000)
})

// ---------------------------------------------------------------------------- a place with no selection

describe('a press with nothing selected still records where the person was', () => {
  it('draws a rail beside the paragraph under the pointer', async () => {
    await freshPage()
    const box = await runBox(RUN_OF('b-1'))
    await page.mouse.click(box.left + 40, box.top + 8, { button: 'right' })
    await page.locator('.px-talk').waitFor({ timeout: 20_000 })
    await sleep(400)

    const drawn = await marksOnScreen()
    const rails = drawn.filter((one) => one.mark === 'rail')
    expect(rails.length).toBe(1)
    const rail = rails[0]
    if (rail === undefined) throw new Error('no rail was drawn')
    // IN THE LEFT MARGIN OF THAT PARAGRAPH, and the same height as it, so a reader can see which
    // line the comment is about without a word being written anywhere.
    expect(rail.left).toBeLessThan(box.left)
    expect(box.left - rail.left).toBeLessThan(20)
    expect(Math.abs(rail.height - box.height)).toBeLessThanOrEqual(1)
    expect(drawn.some((one) => one.mark === 'wash')).toBe(false)
  }, 120_000)
})

// ---------------------------------------------------------------------------- words nothing stores

describe('words chosen off a part of Mole Office\'s own screen are kept and drawn', () => {
  it('washes the words and frames the thing, with the doubled glyph that says which of the two it is', async () => {
    await freshPage()
    // A PART OF PANELX'S OWN SCREEN THAT DRAWS WORDS AND STORES NONE. It is found rather than named
    // so this test does not go stale the day a surface is renamed: the registry is large and any
    // member of it proves the same rule. Nothing inside it says which stored string it draws, which
    // is exactly what makes the words unplaceable.
    //
    // Test change (wave 13y round 165): the rows with twelve characters were the sidebar's Agents
    // rows, and those are listed on All pages now, so the words are chosen there.
    await page.evaluate(() => { location.hash = '#/all-pages' })
    await page.locator('#main a.ap-page').first().waitFor({ timeout: 30_000 })
    const chosen = await page.evaluate(() => {
      for (const element of document.querySelectorAll<HTMLElement>('[data-target^="uiSurface/"]')) {
        if (element.querySelector('[data-text-offset]') !== null) continue
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
        for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
          const text = node.textContent ?? ''
          if (text.trim().length < 12) continue
          const range = document.createRange()
          range.setStart(node, 0)
          range.setEnd(node, text.trimEnd().length)
          const selection = window.getSelection()
          if (selection === null) throw new Error('this browser has no selection')
          selection.removeAllRanges()
          selection.addRange(range)
          const box = range.getBoundingClientRect()
          // ONLY WORDS ON SCREEN. Since plan row S1 some rail groups are folded, and words inside a
          // closed fold have no box: a press there lands on whatever is drawn at that point instead.
          // The press below goes to the middle of the words, so that point must be inside this part.
          const middle = { x: box.left + box.width / 2, y: box.top + box.height / 2 }
          if (box.width === 0 || box.height === 0 || !element.contains(document.elementFromPoint(middle.x, middle.y))) continue
          return {
            words: range.toString(),
            key: element.getAttribute('data-target') ?? '',
            at: { x: Math.round(box.left + box.width / 2), y: Math.round(box.top + box.height / 2) },
          }
        }
      }
      throw new Error('no part of Mole Office\'s own screen on this page draws twelve characters')
    })
    expect(chosen.words.length).toBeGreaterThanOrEqual(12)

    await page.mouse.click(chosen.at.x, chosen.at.y, { button: 'right' })
    await page.locator('.px-talk').waitFor({ timeout: 20_000 })
    await sleep(400)

    const drawn = await marksOnScreen()
    // THE FRAME SAYS THE THING AND THE DOUBLED GLYPH SAYS WHICH KIND OF NOTHING IT IS. A plain
    // dashed frame means no place finer than the thing was recorded; this one means the words WERE
    // kept and Mole Office cannot say where they are. Invariant five in one glyph.
    const frames = drawn.filter((one) => one.mark === 'frame')
    expect(frames.length).toBe(1)
    expect(frames[0]?.doubled).toBe(true)
    // AND THE WORDS ARE STILL VISIBLE, which is the whole of the invariant's second half. Nothing
    // stored can find them again, so the range cloned before focus moved is the only thing that
    // can draw them.
    const washes = drawn.filter((one) => one.mark === 'wash')
    expect(washes.length).toBeGreaterThan(0)
    expect(washes.every((one) => one.edge === 'dashed')).toBe(true)
  }, 120_000)
})
