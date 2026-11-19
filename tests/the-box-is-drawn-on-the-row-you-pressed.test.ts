// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE DASHED BOX IS DRAWN ROUND THE ROW YOU RIGHT-CLICKED, EVEN WHEN THE PAGE DRAWS IT FOUR TIMES.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WENT WRONG, AND THEN MEASURED
 * ---------------------------------------------------------------------------------------
 *
 * The POINTING cluster was rejected by hand for this fault.
 * The composer named the row the owner pressed and the dashed frame was drawn round a different row 330 px
 * higher. The rule is one sentence: the thing under the mouse, the composer's target and the
 * boxed thing are one thing. `design/pointing-reopened/ACCEPTANCE.md` §3.B is the contract.
 *
 * THE CAUSE. The foot of a record page draws the same record several times — as a sentence under a
 * relation, as a row in the links fold, as a row under *Last changed*, as a row under *What is still
 * open around this* — and every one of them carries the same key, because the key names the record.
 * The composer's subject stored only that key, and the mark layer found somewhere to draw by taking
 * the FIRST element on the page carrying it. So the fourth row was named and the first was boxed.
 *
 * MEASURED with `tools/press-census.mjs` on 2 September 2026, over four record pages of a freshly
 * seeded database — two modules, a task and a claim — pressing every row that names another record:
 * 82 visible presses, 50 with the mark on the row pressed and **32 with the mark on another drawing
 * of the same record**. After the fix, 82 of 82 on the row pressed and 0 elsewhere.
 *
 * AND THE REGIONS, with `tools/region-dups.mjs` over 28 record pages across 14 record kinds, every
 * fold opened: 28 of 28 pages carried a duplicated `section.<relation>` key before, 63 keys in all;
 * 0 pages and 0 keys after.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS ASSERTED HERE, AND WHY IT IS PRESSED RATHER THAN RENDERED
 * ---------------------------------------------------------------------------------------
 *
 * Three things, all of them about what is on the screen.
 *
 *   1. Right-clicking the SECOND drawing of a record opens the composer naming that record AND
 *      draws the frame round that element. The rectangle is compared with the element's own
 *      bounding rectangle, and with the FIRST drawing's, so a frame that went back to the first
 *      cannot pass by naming the right record.
 *   2. After a scroll, the frame is still on the element that was pressed. Re-measuring used the
 *      same first-by-key lookup, so even a correct first drawing jumped on the reader's next
 *      scroll.
 *   3. The page carries no region key twice. A region id that names two elements names no place,
 *      and the sentence list at the foot and the links panel inside the fold both declared
 *      `section.<relation>` until this work.
 *
 * A rendering test cannot see any of this: the frame is measured from a live layout with
 * `getBoundingClientRect`, and the whole defect is which element was measured.
 *
 * WHAT MAKES EACH ONE RED — proved by mutation on 2 September 2026, against a control run of the
 * same command first, with each file's hash compared before and after to prove the restore:
 *
 *   give `setSubject` no pressed element                          → 3 of 5 red
 *   look the key up again in `remeasure`                          → 3 of 5 red
 *   give the link panel's groups back their relation declaration  → 1 of 5 red
 *
 * Control: 5 of 5 green, before and after each. THE FIRST TWO MUTATIONS BOTH TAKE THREE, and they
 * are not the same mutation twice: the layer re-measures on its own pass as well as on a scroll, so
 * a subject that stores only a key is moved to the first drawing within a frame of being drawn
 * correctly. The scroll case is still its own test, because it is the only one where the rectangle
 * has to change and still be the pressed element's.
 *
 * Under the first mutation the frame was measured at left 262, top 378 — the *relates to* sentence —
 * while the row pressed was at left 271, top 498. That is the owner's photograph, reproduced.
 *
 * The servers come from `liveApp` in tests/helpers.ts: a throwaway database, two free ports, and
 * the ports proved free again at the end. Nothing here touches ./data/panelx.db.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import type { Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type LiveApp, liveApp, waitForThePage } from './helpers.ts'
// THE KEY IS SPELLED BY THE ONE SPELLER. Writing `record/<id>/<workspace>` here would be a second
// spelling of the attribute grammar, and it fails silently: the selector simply matches nothing.
import { targetAttributeValue } from '../src/shared/targets.ts'

const HUMAN = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}

const HOST_TITLE = 'The wrist mount, and everything joined to it'
// SHORT ENOUGH THAT THE CHIP DRAWS ALL OF IT. The chip shortens a long name at a space, so a
// longer title would turn the assertion below into a test of the shortening rule.
const OPEN_TITLE = 'Restoring a version puts back a mark'

let app: LiveApp
let page: Page
let hostId: string
let openId: string
let workspaceId: string

/** A rectangle as the browser measures it, rounded so that sub-pixel noise is not a difference. */
interface Box {
  left: number
  top: number
  width: number
  height: number
}

async function file(kind: string, title: string, data: Record<string, unknown>): Promise<string> {
  const made = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: HUMAN,
    body: JSON.stringify({ kind, title, data }),
  })
  if (!made.ok) throw new Error(`filing a ${kind} answered ${String(made.status)}: ${await made.text()}`)
  const said = (await made.json()) as { record: { id: string; workspaceId: string } }
  workspaceId = said.record.workspaceId
  return said.record.id
}

beforeAll(async () => {
  app = await liveApp({ name: 'box-on-the-row-pressed', viewport: { width: 1440, height: 1000 } })
  page = app.page

  hostId = await file('module', HOST_TITLE, { context: 'The mount that holds the camera.', parts: [] })
  // A PROBLEM THAT IS STILL OPEN, so the foot of the host's page draws it under *What is still open
  // around this* as well as in the two link lists. That is the shape of the owner's own screenshot: one
  // record, several drawings, one of them a long way from the first.
  openId = await file('problem', OPEN_TITLE, {
    state: 'open',
    consequence: { bearer: 'person', what: 'A reader is shown a mark on words nobody wrote.' },
  })

  const joined = await fetch(`${app.api}/api/links`, {
    method: 'POST',
    headers: HUMAN,
    body: JSON.stringify({ fromId: hostId, toId: openId, type: 'relates_to' }),
  })
  if (!joined.ok) throw new Error(`joining the two answered ${String(joined.status)}: ${await joined.text()}`)
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

// ---------------------------------------------------------------------------- reading the screen

/**
 * Open the host's page with every fold open, so that a drawing inside the links fold is a drawing a
 * person could press. A shut fold's rows are in the document and measure zero, which is neither on
 * the screen nor off the page.
 */
async function openTheHostsPage(): Promise<void> {
  const key = targetAttributeValue({ kind: 'record', recordId: openId, workspaceId })
  await page.goto(`${app.site}/#/r/${hostId}`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.locator('main').first().waitFor({ timeout: 30_000 })
  await page.locator(`[data-target="${key}"]`).first().waitFor({ timeout: 30_000 })
  await page.evaluate(() => {
    for (const fold of document.querySelectorAll('details')) fold.open = true
  })
  // THE SECOND DRAWING IS THE SHAPE THE FAULT NEEDS, and every case here measures at least two.
  await page.waitForFunction(
    (wanted) =>
      [...document.querySelectorAll(`[data-target="${CSS.escape(wanted)}"]`)].filter((el) => {
        const box = el.getBoundingClientRect()
        return box.width > 0 && box.height > 0
      }).length > 1,
    key,
    { timeout: 30_000 },
  )
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))))
}

/** Every element drawing the open problem, in document order, that a person could actually press. */
async function drawingsOfTheProblem(): Promise<Box[]> {
  const key = targetAttributeValue({ kind: 'record', recordId: openId, workspaceId })
  return page.evaluate((wanted) => {
    const found: Box[] = []
    for (const el of document.querySelectorAll(`[data-target="${CSS.escape(wanted)}"]`)) {
      const box = el.getBoundingClientRect()
      if (box.width > 0 && box.height > 0) found.push({ left: box.left, top: box.top, width: box.width, height: box.height })
    }
    return found
  }, key)
}

/**
 * Right-click the nth drawing of the open problem and read back what the screen says.
 *
 * The press goes through the mouse at a point inside that element, and the element under that point
 * is read back, so a press that landed on something else is a failure here rather than a quiet
 * measurement of the wrong thing.
 */
async function pressDrawingNumber(nth: number): Promise<{
  underThePointer: string | null
  chip: string | null
  frame: Box | null
  pressedBox: Box | null
}> {
  const key = targetAttributeValue({ kind: 'record', recordId: openId, workspaceId })
  const where = await page.evaluate(
    ({ wanted, n }) => {
      const drawn = [...document.querySelectorAll(`[data-target="${CSS.escape(wanted)}"]`)].filter((el) => {
        const box = el.getBoundingClientRect()
        return box.width > 0 && box.height > 0
      })
      const one = drawn[n]
      if (one === undefined) return null
      one.scrollIntoView({ block: 'center' })
      const box = one.getBoundingClientRect()
      const at = { x: box.left + Math.min(box.width / 2, 200), y: box.top + box.height / 2 }
      // WHAT IS UNDER THE POINT IS READ NOW, BEFORE THE PRESS. The composer opens beside the
      // pointer, so asking afterwards answers `uiSurface/composer` and says nothing about where
      // the press landed.
      const under = document.elementFromPoint(at.x, at.y)?.closest('[data-target]') ?? null
      return { ...at, under: under === null ? null : under.getAttribute('data-target') }
    },
    { wanted: key, n: nth },
  )
  if (where === null) throw new Error(`the page draws fewer than ${String(nth + 1)} pressable copies of the problem`)
  await page.mouse.click(where.x, where.y, { button: 'right' })
  await page.locator('.px-talk').first().waitFor({ timeout: 15_000 })
  await expect.poll(
    async () => {
      const frame = await frameNow()
      return frame !== null && frame.width > 0 && frame.height > 0
    },
    { timeout: 15_000 },
  ).toBe(true)
  const seen = await page.evaluate(
    ({ wanted, n }) => {
      const drawn = [...document.querySelectorAll(`[data-target="${CSS.escape(wanted)}"]`)].filter((el) => {
        const box = el.getBoundingClientRect()
        return box.width > 0 && box.height > 0
      })
      const one = drawn[n] ?? null
      const box = one === null ? null : one.getBoundingClientRect()
      const frame = document.querySelector('.px-subject > .px-subject-frame')
      const read = (piece: Element): Box => ({
        left: parseFloat((piece as HTMLElement).style.left),
        top: parseFloat((piece as HTMLElement).style.top),
        width: parseFloat((piece as HTMLElement).style.width),
        height: parseFloat((piece as HTMLElement).style.height),
      })
      return {
        chip: document.querySelector('.px-talk-chip-what')?.textContent?.trim() ?? null,
        frame: frame === null ? null : read(frame),
        pressedBox:
          box === null ? null : { left: box.left, top: box.top, width: box.width, height: box.height },
      }
    },
    { wanted: key, n: nth },
  )
  return { underThePointer: where.under, ...seen }
}

/** The frame as it is drawn right now, without pressing anything. */
async function frameNow(): Promise<Box | null> {
  return page.evaluate(() => {
    const piece = document.querySelector('.px-subject > .px-subject-frame') as HTMLElement | null
    if (piece === null) return null
    return {
      left: parseFloat(piece.style.left),
      top: parseFloat(piece.style.top),
      width: parseFloat(piece.style.width),
      height: parseFloat(piece.style.height),
    }
  })
}

/** Whether two rectangles are the same one, allowing a pixel of rounding. */
function theSameRectangle(one: Box | null, other: Box | null): boolean {
  if (one === null || other === null) return false
  return (
    Math.abs(one.left - other.left) < 1 &&
    Math.abs(one.top - other.top) < 1 &&
    Math.abs(one.width - other.width) < 1 &&
    Math.abs(one.height - other.height) < 1
  )
}

// ============================================================ the owner's rule, pressed

describe('a record drawn several times on one page is boxed where it was pressed', () => {
  it('draws the problem more than once, which is the shape the fault needs', async () => {
    await openTheHostsPage()
    const drawings = await drawingsOfTheProblem()
    // WITHOUT THIS THE OTHER TESTS PROVE NOTHING. A page drawing the record once cannot tell a mark
    // on the pressed element from a mark on the first element, so the fault would be invisible.
    expect(drawings.length, 'the host page draws the linked problem more than once').toBeGreaterThan(1)
  })

  it('names the second drawing in the composer and draws the frame round that same element', async () => {
    await openTheHostsPage()
    const seen = await pressDrawingNumber(1)

    // THE PRESS LANDED WHERE IT WAS AIMED. Otherwise everything below measures another element.
    expect(seen.underThePointer, 'the pointer was over the second drawing of the problem').toBe(
      targetAttributeValue({ kind: 'record', recordId: openId, workspaceId }),
    )
    expect(seen.chip, 'the composer names the record that was pressed').toContain(OPEN_TITLE)

    // THE FRAME IS ON THAT ELEMENT. `.px-subject > .px-subject-frame` carries its rectangle in
    // viewport coordinates as inline left, top, width and height, because the layer is fixed.
    expect(seen.frame, 'a dashed frame is drawn').not.toBeNull()
    expect(
      theSameRectangle(seen.frame, seen.pressedBox),
      `the frame ${JSON.stringify(seen.frame)} is the second drawing's own rectangle ${JSON.stringify(seen.pressedBox)}`,
    ).toBe(true)
  })

  it('does not draw the frame round the first drawing, which is where it used to go', async () => {
    await openTheHostsPage()
    const seen = await pressDrawingNumber(1)
    const drawings = await drawingsOfTheProblem()
    const first = drawings[0] ?? null

    // THE ASSERTION THAT CATCHES THE FAULT ITSELF. Naming the record correctly was never the
    // problem — the composer always did — so a test that only read the chip would have passed on
    // the day this was rejected.
    expect(
      theSameRectangle(seen.frame, first),
      `the frame ${JSON.stringify(seen.frame)} is not the first drawing's rectangle ${JSON.stringify(first)}`,
    ).toBe(false)
  })

  it('keeps the frame on the pressed element after the page is scrolled', async () => {
    await openTheHostsPage()
    const seen = await pressDrawingNumber(1)
    expect(seen.frame).not.toBeNull()

    // A SCROLL IS WHAT RE-MEASURES. The layer listens for it, and the re-measurement used the same
    // first-by-key lookup, so a frame that landed correctly jumped to the first drawing here.
    await page.evaluate(() => {
      window.scrollBy(0, -260)
    })

    const after = await page.evaluate(
      ({ wanted, n }) => {
        const drawn = [...document.querySelectorAll(`[data-target="${CSS.escape(wanted)}"]`)].filter((el) => {
          const box = el.getBoundingClientRect()
          return box.width > 0 && box.height > 0
        })
        const one = drawn[n]
        if (one === undefined) return null
        const box = one.getBoundingClientRect()
        return { left: box.left, top: box.top, width: box.width, height: box.height }
      },
      { wanted: targetAttributeValue({ kind: 'record', recordId: openId, workspaceId }), n: 1 },
    )
    // THE FRAME IS RE-MEASURED ON THE SCROLL, so this waits for it to reach the pressed element again.
    await expect.poll(async () => theSameRectangle(await frameNow(), after), { timeout: 15_000 }).toBe(true)
    const frame = await frameNow()

    expect(frame, 'the frame is still drawn after a scroll').not.toBeNull()
    expect(
      theSameRectangle(frame, after),
      `after scrolling the frame ${JSON.stringify(frame)} is still the pressed element's rectangle ${JSON.stringify(after)}`,
    ).toBe(true)
  })
})

// ============================================================ one region id, one element

describe('a record page carries no region key twice', () => {
  it('draws every region of the page on exactly one element', async () => {
    await openTheHostsPage()
    const drawnTwice = await page.evaluate(() => {
      const seen = new Map<string, number>()
      for (const el of document.querySelectorAll('[data-target^="region/"]')) {
        const key = el.getAttribute('data-target') ?? ''
        seen.set(key, (seen.get(key) ?? 0) + 1)
      }
      return [...seen].filter(([, times]) => times > 1).map(([key, times]) => `${decodeURIComponent(key)} x${String(times)}`)
    })

    // A REGION ID THAT NAMES TWO ELEMENTS NAMES NO PLACE. The sentence list at the foot and the
    // links panel inside the fold both declared `section.<relation>` until 2 September 2026, so a
    // stored comment made in one was drawn in the other.
    expect(drawnTwice, 'no region of this page is drawn on two elements').toEqual([])
  })
})
