// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * NOTHING TAKES CONTENT OUT OF SIGHT WITHOUT DRAWING SOMETHING, AT 1440 AND AT 390.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS MEASURED, AND WHY THIS IS A BROWSER AND NOT A SOURCE SCAN
 * ---------------------------------------------------------------------------------------
 *
 * The nothing-scrolls-sideways test, deleted on 12 November 2026, named every box in this product
 * that scrolls sideways. It read source, so what it could check was that somebody wrote down what
 * each box does.
 * Whether a reader can SEE that a box has more in it is a fact about pixels, and this file is where
 * that is measured.
 *
 * Two measurements from 21 August 2026, on the owner's own corpus, before any of this was fixed:
 *
 *   THE PLAN TABLE AT 1440. `Writing and table`, which is the view the owner works in. The table's box was
 *   659px and its six columns came to 1105px. Schedule ended mid-word at the right edge; Project
 *   and Note were not on the screen at all. Three of six columns, at the owner's own desk.
 *
 *   THE MARK. Twelve boxes carried `overflow-x: auto` and drew nothing at the edge. The scrollbar
 *   gutter measures 0px on this platform, so there was nothing at all to see. The one box that did
 *   draw something — the plan table — drew a 20px gradient into the page colour with no rule, which
 *   against a page of that colour is invisible, and that is why a table that announced its own
 *   missing columns in words was still reported as clipping.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT ASSERTS, AND WHAT IT REFUSES TO ASSERT
 * ---------------------------------------------------------------------------------------
 *
 * IT ASSERTS RENDERED GEOMETRY. A box is measured against itself — `scrollWidth` against
 * `clientWidth` — and the mark is measured as a drawn rectangle: it has to have a real width, it has
 * to lie on the overflowing edge of that box, and it has to be absent where the box is showing
 * everything. Nothing here checks that a class name is present, because a class name is present
 * whether or not anything was drawn, and a coverage number is not a proof.
 *
 * IT REFUSES TO ASSERT A PERCENTAGE. There is no count of how many boxes were marked. Each box is
 * named, opened, and checked one at a time.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import type { Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type LiveApp, liveApp, waitForThePage } from './helpers.ts'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

let app: LiveApp
let page: Page
let planId: string
let reportId: string

/** A line of code with no place to break it, which is what a code block scrolls for. */
const ONE_LONG_LINE =
  'docker run --rm -it --gpus all -v /datasets/handover:/data ghcr.io/panelx/grasp:2026-08-19 ' +
  '--checkpoint /data/runs/2026-08-14T09-31/last.ckpt --report /data/out/report.json --seed 7'

/**
 * WHAT IS SEEN OF ONE BOX, AND WHAT IS DRAWN AT ITS EDGES.
 *
 * `beyond` is what the box holds that it is not showing, in pixels, on each side. `marks` is every
 * drawn edge the holder around it carries, with the side it is on and the rectangle it occupies.
 */
async function seenOf(where: string): Promise<{
  found: boolean
  beyondRight: number
  beyondBottom: number
  marks: { side: string; width: number; height: number; onTheRightEdge: boolean; onTheBottomEdge: boolean }[]
}> {
  return page.evaluate((selector) => {
    const box = document.querySelector(selector)
    if (box === null) return { found: false, beyondRight: 0, beyondBottom: 0, marks: [] }
    const rect = box.getBoundingClientRect()
    // The holder is the element carrying the marks. It is the box's own parent, which is what the
    // shared component draws, or the box itself where the box already was a holder.
    const holder = box.closest('.px-reach') ?? box.parentElement ?? box
    const marks = [...holder.querySelectorAll('.px-reach-edge')].map((mark) => {
      const m = mark.getBoundingClientRect()
      return {
        side: mark.getAttribute('data-side') ?? '?',
        width: Math.round(m.width),
        height: Math.round(m.height),
        onTheRightEdge: Math.abs(m.right - rect.right) <= 2 && m.width > 0 && m.height > 0,
        onTheBottomEdge: Math.abs(m.bottom - rect.bottom) <= 2 && m.width > 0 && m.height > 0,
      }
    })
    return {
      found: true,
      beyondRight: box.scrollWidth - box.clientWidth,
      beyondBottom: box.scrollHeight - box.clientHeight,
      marks,
    }
  }, where)
}

/** Every column of the plan table, and whether the box is showing the whole of it. */
async function columnsSeen(): Promise<{ key: string; whollyInside: boolean }[]> {
  return page.evaluate(() => {
    const box = document.querySelector('.pt-wrap')
    if (box === null) return []
    const rect = box.getBoundingClientRect()
    return [...document.querySelectorAll('.pt-table thead th[data-col]')].map((th) => {
      const r = th.getBoundingClientRect()
      return {
        key: (th as HTMLElement).dataset.col ?? '',
        whollyInside: r.left >= rect.left - 1 && r.right <= rect.right + 1,
      }
    })
  })
}

async function at(width: number): Promise<void> {
  await page.setViewportSize({ width, height: 900 })
  await sleep(700)
}

async function open(address: string): Promise<void> {
  await page.goto(`${app.site}/#${address}`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await sleep(1800)
}

beforeAll(async () => {
  // THIS FILE IS ABOUT WHAT IS INSIDE A REPORT'S BODY, SO IT SAYS WHICH LEVEL IT READS AT.
  // The owner's act 3a of 15 September 2026 made a record page open at the conclusion, where the body holds the summary
  // and nothing else. So a test that measures a diagram, a picture, a mark, a tab stop or a
  // panel inside the writing found an empty body and waited for a selector that would never appear. `opensAt` writes
  // the reader's own stored choice before the page loads, so this file is about its own subject again and not about the
  // level a page opens at. That level has its own test in tests/a-reader-goes-no-lower-than-conclusion.test.ts, which
  // stores nothing.
  app = await liveApp({ opensAt: 'full', name: 'in-reach', viewport: { width: 1440, height: 900 } })
  page = app.page

  const headers = {
    'content-type': 'application/json',
    'x-mole-office-actor-type': 'human',
    'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
    'x-mole-office-workspace': 'default',
  }
  const post = async (path: string, body: unknown): Promise<Record<string, unknown>> => {
    const res = await fetch(`${app.api}${path}`, { method: 'POST', headers, body: JSON.stringify(body) })
    if (!res.ok) throw new Error(`POST ${path} answered ${String(res.status)}: ${await res.text()}`)
    return (await res.json()) as Record<string, unknown>
  }

  // A report holding the three kinds of block that scroll: a table wider than any column, a line of
  // code with nowhere to break, and an equation on a line of its own.
  const report = await post('/api/records', {
    kind: 'report',
    title: 'What the gripper did on Tuesday',
    data: {
      for: THE_TEST_OFFICES_OWNER.name,
      date: '2026-08-19',
      blocks: [
        { id: 'b-1', type: 'text', heading: 'What I found', text: 'The mount held calibration.' },
        {
          id: 'b-2',
          type: 'table',
          columns: [
            { label: 'run identifier as it was written down' },
            { label: 'reprojection error before the knock (px)' },
            { label: 'reprojection error after the knock (px)' },
            { label: 'frames' },
            { label: 'operator' },
            { label: 'what was changed between the two runs' },
          ],
          rows: [
            { cells: ['2026-08-14T09-31-handover-a', 0.4, 1.9, 40, THE_TEST_OFFICES_OWNER.id, 'the mast was re-seated'] },
            { cells: ['2026-08-14T11-02-handover-b', 0.5, 0.6, 40, THE_TEST_OFFICES_OWNER.id, 'nothing was changed'] },
          ],
        },
        { id: 'b-3', type: 'code', language: 'bash', code: ONE_LONG_LINE },
        {
          id: 'b-4',
          type: 'chart',
          spec: {
            kind: 'line',
            x: { label: 'frame' },
            y: { label: 'reprojection error', unit: 'px' },
            series: [
              {
                id: 's-1',
                name: 'after the knock',
                // Forty points, because the data table under a chart is capped at 260px and forty
                // rows is well past it. That cap is the vertical clip contract question 17 names.
                points: Array.from({ length: 40 }, (_, at) => ({ x: at, y: 0.4 + (at % 7) / 10 })),
              },
            ],
          },
        },
        {
          id: 'b-5',
          type: 'text',
          heading: 'How the run went',
          // A DIAGRAM WIDE ENOUGH TO FIT AT 1440 AND NOT AT 390, which is what makes both
          // measurements below real: one box that must draw no mark and one that must draw one.
          // It is the LAST block on purpose: a diagram keeps its text in a fold holding a
          // `.sb-code` box of its own, and a diagram earlier in the report would be the first
          // `.sb-code` the code measurement above finds — a folded one, which measures nothing.
          text: [
            '```mermaid',
            'flowchart LR',
            '  A[The mast was re-seated] --> B[Forty frames]',
            '  B --> C[Error read off]',
            '  C --> D[Written up]',
            '```',
          ].join('\n'),
        },
      ],
    },
  })
  reportId = ((report as { record: { id: string } }).record).id

  const plan = await post('/api/plans', {
    title: 'The week of the nineteenth',
    body: [
      '# Handover, end to end',
      '- calibrate the mast {size: 4h} {time: next week} {note: the mount moved on Tuesday}',
      '- re-run the forty frames {size: 2h} {note: forty checkerboard frames each}',
      '- write it up {size: 1h}',
    ].join('\n'),
  })
  planId = ((plan as { plan: { id: string } }).plan).id
}, 180_000)

afterAll(async () => {
  await app.stop()
})

// ============================================================ the plan table, at the owner's width

describe('the plan table at 1440, which is the width the owner works at', () => {
  it('shows every column it holds, in the view that has the writing beside it', async () => {
    await at(1440)
    await open(`/plans/${planId}`)
    const seen = await seenOf('.pt-wrap')
    expect(seen.found, 'the plan table was not on the page at all').toBe(true)
    const columns = await columnsSeen()
    expect(columns.length, 'the plan table drew no columns, so this measured nothing').toBeGreaterThanOrEqual(6)
    const offTheEdge = columns.filter((one) => !one.whollyInside).map((one) => one.key)
    expect(
      offTheEdge,
      'a column of the plan table is off the edge of its box at 1440, where the box can hold it',
    ).toEqual([])
    expect(
      seen.beyondRight,
      'the plan table holds more than its box shows at 1440, where the box can hold all of it',
    ).toBeLessThanOrEqual(1)
  }, 120_000)

  it('draws no edge where there is nothing beyond it, so the mark means something', async () => {
    await at(1440)
    await open(`/plans/${planId}`)
    const seen = await seenOf('.pt-wrap')
    expect(seen.beyondRight).toBeLessThanOrEqual(1)
    expect(seen.marks.map((one) => one.side), 'an edge is drawn on a box that is showing everything').toEqual([])
  }, 120_000)
})

describe('the plan table at 390, where the box genuinely cannot hold six columns', () => {
  it('draws a mark on the edge the table carries on past, with a real rectangle on that edge', async () => {
    await at(390)
    await open(`/plans/${planId}`)
    const seen = await seenOf('.pt-wrap')
    expect(seen.beyondRight, 'the plan table fits at 390, so this test is measuring nothing').toBeGreaterThan(1)
    const right = seen.marks.filter((one) => one.side === 'right')
    expect(right.length, 'the plan table takes columns off its right at 390 and draws nothing there').toBe(1)
    expect(right[0]?.width, 'the drawn edge has no width, so nobody can see it').toBeGreaterThan(0)
    expect(right[0]?.height, 'the drawn edge has no height, so nobody can see it').toBeGreaterThan(0)
    expect(right[0]?.onTheRightEdge, 'the drawn edge is not on the edge the table carries on past').toBe(true)
  }, 120_000)

  it('still names which columns are off the edge, because a mark says that and not what', async () => {
    await at(390)
    await open(`/plans/${planId}`)
    const named = await page.evaluate(() => {
      const row = document.querySelector('.pt-missing')
      return [...(row?.querySelectorAll('button') ?? [])].map((b) => b.textContent?.trim() ?? '')
    })
    expect(named.length, 'nothing above the table names a column that is off the edge').toBeGreaterThan(0)
  }, 120_000)
})

// ============================================================ the boxes inside a report

describe('a report at 1440', () => {
  /**
   * THE TABLE IS NOT TESTED AT 1440 AND THAT IS NOT AN OVERSIGHT. Step 24 gave a wide block its own
   * lane, so at 1440 a six-column table takes the free page beside the prose and fits. Measured
   * here: it holds nothing beyond its box at that width. A test that forced it to overflow would
   * need a table nobody would write, and it would then be measuring the table and not the mark. It
   * is measured at 390 below, where it genuinely does not fit.
   */
  it('marks the edge of a line of code with nowhere to break', async () => {
    await at(1440)
    await open(`/r/${reportId}`)
    const seen = await seenOf('.sb-code')
    expect(seen.found, 'the report drew no block of code').toBe(true)
    expect(seen.beyondRight, 'the code fits, so this test is measuring nothing').toBeGreaterThan(1)
    const right = seen.marks.filter((one) => one.side === 'right')
    expect(right.length, 'a line of code runs off the right and nothing is drawn there').toBe(1)
    expect(right[0]?.onTheRightEdge).toBe(true)
  }, 120_000)

  /**
   * A DIAGRAM AT 1440 FITS, so its box draws nothing — which is the half of the mark that says it
   * means something. The one at 390 below is the half that says it appears.
   */
  it('draws no edge round a diagram that fits, so the mark on the one below means something', async () => {
    await at(1440)
    await open(`/r/${reportId}`)
    await page.waitForSelector('.sb-diagram svg', { timeout: 60_000 })
    const seen = await seenOf('.sb-diagram')
    expect(seen.found, 'the report drew no diagram').toBe(true)
    expect(seen.beyondRight, 'the diagram does not fit at 1440, so this measures nothing').toBeLessThanOrEqual(1)
    expect(seen.marks.length, 'a mark is drawn on a box that holds nothing beyond it').toBe(0)
  }, 120_000)
})

describe('the bottom edge, which is contract open question 17 answered', () => {
  /**
   * A VERTICAL CLIP IS THE SAME DEFECT AS A SIDEWAYS ONE, and this is where that is measured rather
   * than argued. The data table under a chart is capped at 260px. Forty rows go well past it, and
   * before this campaign the thirty-first row and everything after it was simply not on the screen
   * with nothing saying so. The contract raised the question and left it open; the mark answers it,
   * because it is the same reading of the same box with two more sides.
   */
  it('marks the bottom of the chart data table, which is capped at 260px', async () => {
    await at(1440)
    await open(`/r/${reportId}`)
    await page.locator('.pxc-data summary').first().click()
    await sleep(900)
    const seen = await seenOf('.pxc-scroll')
    expect(seen.found, 'the chart drew no data table').toBe(true)
    expect(seen.beyondBottom, 'the data table fits in its cap, so this test is measuring nothing').toBeGreaterThan(1)
    const down = seen.marks.filter((one) => one.side === 'down')
    expect(down.length, 'the data table holds rows below its cap and draws nothing at the bottom').toBe(1)
    expect(down[0]?.height, 'the drawn bottom edge has no height, so nobody can see it').toBeGreaterThan(0)
    expect(down[0]?.onTheBottomEdge, 'the drawn edge is not on the bottom of the box it belongs to').toBe(true)
  }, 120_000)
})

describe('a report at 390', () => {
  it('marks the table, and the mark is inside the box rather than beside it', async () => {
    await at(390)
    await open(`/r/${reportId}`)
    const seen = await seenOf('.sb-scroll')
    expect(seen.beyondRight).toBeGreaterThan(1)
    const right = seen.marks.filter((one) => one.side === 'right')
    expect(right.length).toBe(1)
    expect(right[0]?.onTheRightEdge).toBe(true)
    // 24px is what the mark is worth: wide enough to read as an edge, narrow enough not to be a
    // second column. A mark the width of the box would be a wash over the content.
    expect(right[0]?.width).toBeLessThanOrEqual(28)
  }, 120_000)

  /**
   * A DIAGRAM SCROLLS AND KEEPS ITS OWN SIZE. Mermaid hands back an SVG carrying `width="100%"`, so
   * a browser fits the whole drawing into whatever box it is in and the words inside it shrink with
   * it. Measured on the owner's report on 8 September 2026: a drawing 545px wide drew at 340px at 390 — 62
   * per cent, so its 16px labels reached the screen at about 10px, under the 13px floor this
   * product holds every page to. `atItsOwnSize` in SummaryBlocks.tsx writes the viewBox's own width
   * onto the element, and the BOX is what scrolls.
   */
  it('lets a diagram keep its own size and scrolls the box round it, with the mark on that edge', async () => {
    await at(390)
    await open(`/r/${reportId}`)
    await page.waitForSelector('.sb-diagram svg', { timeout: 60_000 })
    const seen = await seenOf('.sb-diagram')
    expect(seen.found, 'the report drew no diagram').toBe(true)
    expect(seen.beyondRight, 'the diagram fits at 390, so this test is measuring nothing').toBeGreaterThan(1)
    const right = seen.marks.filter((one) => one.side === 'right')
    expect(right.length, 'a diagram runs off the right and nothing is drawn there').toBe(1)
    expect(right[0]?.onTheRightEdge).toBe(true)

    // AND THE DRAWING IS NOT SHRUNK TO FIT. Its drawn width is the width its viewBox asks for.
    const size = (await page.evaluate(() => {
      const svg = document.querySelector('.sb-diagram svg')
      if (svg === null) return null
      const box = /[\d.]+ [\d.]+ ([\d.]+) /.exec(svg.getAttribute('viewBox') ?? '')
      return { drawn: Math.round(svg.getBoundingClientRect().width), wanted: Math.ceil(Number(box?.[1] ?? 0)) }
    })) as { drawn: number; wanted: number } | null
    expect(size, 'no diagram to measure').not.toBeNull()
    expect(size?.wanted, 'the drawing asks for no width at all').toBeGreaterThan(400)
    // One pixel of tolerance: the viewBox is fractional and a browser rounds a drawn box.
    expect(
      Math.abs((size?.drawn ?? 0) - (size?.wanted ?? 0)),
      'the drawing was shrunk to fit its box, so its own words are smaller than the page floor',
    ).toBeLessThanOrEqual(1)
  }, 120_000)
})

// ============================================================ what was not measured here

/**
 * FOUR OF THE TWELVE BOXES ARE NOT MEASURED IN THIS FILE, AND THAT IS SAID RATHER THAN LEFT TO BE
 * NOTICED.
 *
 * `.rec-tablewrap`, the record list, was opened at 390 on a database of three records and held
 * nothing beyond its box: the cells wrap. `.mt-display`, an equation, was opened then under the
 * drawing MathText made itself, which wrapped inside `.mt-body` and did not overflow, on an expression
 * long enough to reach the edge of a phone twice. MathText draws with KaTeX now, and KaTeX does not
 * wrap a display equation: one wider than a phone scrolls inside `.mt-display`, draws the mark on the
 * edge it runs past, and leaves the page 390 wide, as
 * tests/a-display-formula-is-not-cut-and-scrolls-only-across.test.ts holds. Both carry
 * `overflow-x: auto`, so both carry the mark, and on this data the record list draws none — which is
 * the mark working rather than the mark missing.
 *
 * `.pr-ask-text`, `.pw-clash-body`, `.px-org-text` and `.pg-canvas` are reached through a state this
 * file does not set up: a review that has asked an agent something, a save that collided with
 * somebody else's, and a graph with a layout engine behind it. They are marked from the same reading
 * as everything above and are not proved here. Naming them is the honest form of that.
 */
