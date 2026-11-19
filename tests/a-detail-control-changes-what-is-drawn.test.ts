// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A SURFACE COMES OFF `DETAIL_SURFACES_EXPECTED_UNREAD` WHEN THE CONTROL CHANGES WHAT IS DRAWN.
 *
 * ---------------------------------------------------------------------------------------
 * WHY A SOURCE SCAN IS NOT ALLOWED TO DECIDE THIS
 * ---------------------------------------------------------------------------------------
 *
 * `tests/how-much-each-thing-says.test.ts` walks every file under `src/web` looking for the
 * literals `useDetail('<surface>')` and `detailFor('<surface>'`. That scan is worth keeping and it
 * is kept. It cannot carry this claim, and the numbers say why:
 *
 *   - There are exactly THREE literal `useDetail('...'` call sites in all of `src/web`:
 *     `useDetail('home', …)` in `HomePage.tsx`, `useDetail('reportContent', …)` in
 *     `SummaryBlocks.tsx`, and `useDetail('graph', …)` in `graph/Canvas.tsx`.
 *   - `src/web/lib/detailchoice.ts` already calls `detailFor(s)` for EVERY surface through a
 *     variable, in order to draw the settings grid, and the scan excludes that file by name.
 *
 * So the day somebody wires a surface up through a prop, a constant or a loop, the scan reads
 * zero for a control that works. If zero were allowed to mean anything about a person's settings
 * — hide the row, mark it dead — a WORKING control would disappear, a stored choice would become
 * unreachable from the page, and the whole suite would stay green.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT COUNTS AS PROOF HERE
 * ---------------------------------------------------------------------------------------
 *
 * Set the level, render, and show the output differs. In a real browser, on the real page, with
 * the real store — because what is being claimed is that a person changing a setting sees the
 * screen change, and every layer between the setting and the screen is part of that claim.
 *
 * A SURFACE OFF THE LIST WITH NO PROOF REGISTERED FAILS. That is the rule. Taking a name out of
 * `DETAIL_SURFACES_EXPECTED_UNREAD`, with or without a matching source edit, does not pass.
 *
 * THE DIFFERENCE IS MEASURED AS WHICH SEEDED WORDS ARE ON SCREEN, never as "the page text
 * changed". A page carries a clock — "2 minutes ago" — so two drawings taken a second apart
 * differ for a reason that has nothing to do with the control, and a test reading whole-page text
 * would pass with the control ripped out. Each proof names strings it put in the corpus itself,
 * and the assertion is that the SET of those on screen is not the same at every position.
 *
 * ---------------------------------------------------------------------------------------
 * THE GRAPH PROOF READS THE MODULES DRAWING SINCE 15 NOVEMBER 2026
 * ---------------------------------------------------------------------------------------
 *
 * A filed pipeline's page draws its lanes now, and nothing in the lanes drawing reads
 * `useDetail('graph')`, so a lanes card says the same at every position. The modules drawing still
 * draws the canvas that reads it. So the graph's own corpus is two linked modules, each carrying one
 * of the two lines, and the graph proof opens the modules drawing.
 *
 * A MUTATION THAT TURNS IT RED: in src/web/components/graph/Canvas.tsx, set `says` to
 * `placeOf(graph.scope).opensAt` in place of `detail.rung`. The person's setting is then never read,
 * every position draws the same words, and the graph proof goes red.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Page } from 'playwright'
import {
  DETAIL_SURFACES,
  DETAIL_SURFACES_EXPECTED_UNREAD,
  RUNGS,
  detailKeyForSurface,
  type DetailSurface,
  type Rung,
} from '../src/shared/detail.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { type LiveApp, liveApp, waitForThePage } from './helpers.ts'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** The words this file writes into the corpus. Distinctive, and none a substring of another. */
const HOME_TITLE = 'Tray clamp reach check across the bench'
const HOME_SUMMARY = 'Fifty grasps at four heights, nothing dropped.'
const REPORT_TITLE = 'What the bench run showed'
const REPORT_PROSE = 'The wrist camera lost the tag at eleven of fifty approaches.'
/**
 * A THIRD LINE, WRITTEN INSIDE A SECTION, AND THE REPORT NEEDS IT TO PROVE ANYTHING.
 *
 * This report used to be ONE paragraph, and one paragraph is the whole of what a report says at
 * every reading length: it is the report's opening prose, and the opening prose is preserved at
 * length 1. So all six positions drew the same two seeded strings and the proof below could no
 * longer tell a working control from a dead one. That is not a fault in the control — it is a
 * one-paragraph report being the same report at every length, which is what preserving it means —
 * but a proof needs a report with more in it than the shortest length keeps.
 */
const REPORT_DEEP = 'Nineteen boards were never photographed at all.'
/** The graph proof's own corpus: two modules, and a line of their own on each. */
const GRAPH_FIRST_LINE = 'Nineteen boards, all of them at arm reach.'
const GRAPH_SECOND_LINE = 'Reprojection settled at four tenths of a pixel.'

/** How a surface is opened, and which seeded words its drawing is allowed to move. */
interface BehaviourProof {
  /** Why this surface is off the expected-unread list, in one line. */
  because: string
  /** The address, once the ids are known. */
  route: () => string
  /** Seeded strings whose presence on the page is the measurement. */
  words: readonly string[]
}

let app: LiveApp
let page: Page
let reportId = ''

/**
 * ONE PROOF PER SURFACE THAT IS NOT ON THE EXPECTED-UNREAD LIST.
 *
 * Adding a name here is how a surface comes off that list, and a name that comes off the list
 * without one fails the first test below by name.
 */
const PROOFS: Partial<Record<DetailSurface, BehaviourProof>> = {
  home: {
    because: 'HomePage.tsx asks useDetail(home) and the Today diary row takes its summary from the plan reading at that length.',
    route: () => '#/',
    words: [HOME_TITLE, HOME_SUMMARY],
  },
  reportContent: {
    because: 'SummaryBlocks.tsx asks useDetail(reportContent) and it draws every report in the app.',
    route: () => `#/r/${reportId}`,
    words: [REPORT_TITLE, REPORT_PROSE, REPORT_DEEP],
  },
  graph: {
    because:
      'Canvas.tsx asks useDetail(graph) and hands the answer to planCanvas for the whole drawing. At ' +
      'positions 1 and 2 a card draws its name and its state; from position 3 an ordinary card also draws ' +
      'the record\'s own line, which is what a gist is. THE DRAWING NO LONGER CARRIES A CONTROL FOR THIS: ' +
      'criterion D14 took it away on 6 September 2026, so the row on the settings page is where a person ' +
      'sets it — which is exactly what this file writes and reads back.',
    route: () => '#/pipeline/drawing',
    words: [GRAPH_FIRST_LINE, GRAPH_SECOND_LINE],
  },
}

/** The surfaces this file must prove, computed from the list rather than typed out. */
const MUST_PROVE: DetailSurface[] = DETAIL_SURFACES.filter(
  (surface) => !DETAIL_SURFACES_EXPECTED_UNREAD.includes(surface),
)

beforeAll(async () => {
  app = await liveApp({ name: 'detail-behaviour', viewport: { width: 1440, height: 1000 } })
  page = app.page

  const post = async (path: string, body: unknown): Promise<{ record: { id: string } }> => {
    const res = await fetch(`${app.api}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-mole-office-actor-type': 'human',
        'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
      },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error(`POST ${path} answered ${String(res.status)}: ${await res.text()}`)
    return (await res.json()) as { record: { id: string } }
  }

  // THE GRAPH'S OWN CORPUS, WRITTEN FIRST. Two modules, each carrying one line about itself, so the
  // measurement is two strings this file wrote and never the page's own furniture.
  //
  // IT IS FILED BEFORE THE TWO RECORDS BELOW ON PURPOSE. The home page ranks what needs somebody
  // and draws the top of that ranking, so a record filed after the module pushes the module down and
  // the home proof then reads the same two answers at every position — which is this file failing
  // for a reason that has nothing to do with a detail control.
  // THEY ARE LINKED, because the modules drawing folds away a module linked to no other module.
  const graphModules: string[] = []
  for (const [title, line] of [
    ['Collect boards', GRAPH_FIRST_LINE],
    ['Solve the intrinsics', GRAPH_SECOND_LINE],
  ] as const) {
    const made = await post('/api/records', {
      kind: 'module',
      title,
      summary: line,
      data: { state: 'active', parts: [] },
    })
    graphModules.push(made.record.id)
  }
  await post('/api/links', { fromId: graphModules[0], toId: graphModules[1], type: 'relates_to' })

  // A task with a title and a summary, placed on Today because the five-section Home draws the
  // diary rather than the old list of unallocated modules.
  const homeTask = await post('/api/records', {
    kind: 'task',
    title: HOME_TITLE,
    summary: HOME_SUMMARY,
    data: { state: 'doing' },
  })
  const todayRead = await fetch(`${app.api}/api/planning/today`)
  if (!todayRead.ok) throw new Error(`GET /api/planning/today answered ${String(todayRead.status)}: ${await todayRead.text()}`)
  const today = (await todayRead.json()) as { day: string }
  await post('/api/planning/allocations', {
    horizon: 'day',
    period: today.day,
    recordId: homeTask.record.id,
    plannedHours: 1,
  })

  const report = await post('/api/records', {
    kind: 'report',
    title: REPORT_TITLE,
    data: {
      for: THE_TEST_OFFICES_OWNER.name,
      date: '2026-08-25',
      blocks: [
        { id: 'b-1', type: 'text', text: REPORT_PROSE },
        { id: 'b-2', type: 'section', title: 'The boards nobody looked at', blocks: [{ id: 'b-3', type: 'text', text: REPORT_DEEP }] },
      ],
    },
  })
  reportId = report.record.id

}, 300_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

/**
 * Which of these words are on the screen, at this position of this surface's control.
 *
 * The setting is written into the store the app itself reads, then the page is loaded fresh, so
 * nothing here reaches past the product into a component.
 */
async function wordsOnScreenAt(surface: DetailSurface, proof: BehaviourProof, rung: Rung): Promise<string> {
  await page.goto(`${app.site}/`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.evaluate(
    ([key, value]) => {
      window.localStorage.setItem(key as string, value as string)
    },
    [detailKeyForSurface(surface), rung] as const,
  )
  await page.goto(`${app.site}/${proof.route()}`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await sleep(400)
  const text = await page.evaluate(() => document.body.innerText)
  return proof.words.map((word) => (text.includes(word) ? '1' : '0')).join('')
}

describe('every surface off the expected-unread list has a behaviour proof, and it is not a source scan', () => {
  it('really has surfaces to prove, so a walk over an empty list cannot pass quietly', () => {
    expect(MUST_PROVE.length, 'no surface is off the list at all, so this file measures nothing').toBeGreaterThan(0)
    expect(DETAIL_SURFACES.length).toBe(DETAIL_SURFACES_EXPECTED_UNREAD.length + MUST_PROVE.length)
  })

  it('refuses a surface taken off the list with nothing showing the control works', () => {
    const unproved = MUST_PROVE.filter((surface) => PROOFS[surface] === undefined)
    expect(
      unproved,
      `these surfaces are not on DETAIL_SURFACES_EXPECTED_UNREAD and no proof in this file shows the ` +
        `control changes what they draw. A source scan finding a useDetail call is not that proof: there ` +
        `are two literal call sites in all of src/web and detailchoice.ts reaches every surface through a ` +
        `variable. Add an entry to PROOFS, or put the surface back on the list.`,
    ).toEqual([])
  })
})

describe('setting the level changes what the page draws', () => {
  for (const surface of MUST_PROVE) {
    it(`draws ${surface} differently at different positions`, async () => {
      const proof = PROOFS[surface]
      if (proof === undefined) throw new Error(`no proof for ${surface}; the test above says so by name`)

      const seen = new Map<Rung, string>()
      for (const rung of RUNGS) seen.set(rung, await wordsOnScreenAt(surface, proof, rung))

      const patterns = [...seen.values()]
      const readable = [...seen.entries()].map(([rung, pattern]) => `${rung}=${pattern}`).join(' ')
      expect(
        new Set(patterns).size,
        `${surface} drew the same words at all six positions (${readable}), reading ` +
          `[${proof.words.join(' | ')}]. ${proof.because} A control that changes nothing belongs on ` +
          `DETAIL_SURFACES_EXPECTED_UNREAD, and a row that says it is read when it is not is the ` +
          `fifth engineering invariant broken in the settings panel.`,
      ).toBeGreaterThan(1)
    }, 180_000)
  }
})
