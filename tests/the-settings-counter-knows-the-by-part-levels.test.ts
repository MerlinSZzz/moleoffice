// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SETTINGS GRID COUNTS A REPORT WITH PARTS AS WRITTEN AT LEVELS 4, 5 AND 6.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WENT WRONG
 * ---------------------------------------------------------------------------------------
 *
 * The counter row under *How much each thing says* read **0 of 43** at Level 4, Level 5 and Level 6,
 * on a corpus where all 26 reports draw between four and twenty-four written parts at each of those
 * lengths on their own pages. Its *Unwritten (133)* worklist offered every one of them as work still
 * to do — a settings page telling a reader that nothing is written where everything is, and sending
 * somebody to rewrite summaries that already exist. Problem `gzRwiq38pp7v`, 3 September 2026.
 *
 * ---------------------------------------------------------------------------------------
 * WHY
 * ---------------------------------------------------------------------------------------
 *
 * `supplyOf` counted a position written when `detailOf` answered `drew === rung`. `detailOf` is the
 * whole-record resolver and it STEPS OVER the three by-part lengths on purpose: they are a list of
 * parts, not one string, and a row of a list has room for one string. So the resolver can never
 * answer that one of them drew itself, and the counter read zero for all three.
 *
 * It is the same split that made the report body ask the structure directly. The settings page was
 * still asking the resolver.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS ASKED NOW
 * ---------------------------------------------------------------------------------------
 *
 * `formsWrittenIn` in src/shared/reportrungs.ts, which is the one list of which lengths a record has
 * words for and now carries the three by-part lengths when the parts are stored. The report page
 * draws from that list and the grid counts from it, so the grid cannot call a length unwritten while
 * the page draws it.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATION THAT PROVES THIS
 * ---------------------------------------------------------------------------------------
 *
 *   put the counter back to the resolver — `answer.drew === rung` in `supplyOf` — and every test in
 *     section 1 goes red: 0 written, and both reports on the unwritten list.
 *   take the by-part entries out of `formsWrittenIn` — the same tests go red, which is what says the
 *     grid is reading that list and not a rule of its own.
 *   make `reportsOnly` in `supplyOf` answer false for every rung — the denominator at levels 1 and
 *     4 to 6 goes back to four and *counts levels 2 and 3 over every record and the other four over
 *     the reports* goes red, with the drawn count.
 *   delete the `COUNTED_OVER` sentence from the counter cell — *says on the screen what each column
 *     was counted over* goes red.
 */
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { BY_PART_LEVELS } from '../src/shared/zoom.ts'
import { detailSupplyOf } from '../src/shared/detailsupply.ts'
import type { PanelRecord } from '../src/shared/types.ts'

type Says = typeof import('../src/web/components/DetailSays.tsx')

let says: Says
let store: Map<string, string>

beforeAll(async () => {
  store = new Map<string, string>()
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  }
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: storage,
    sessionStorage: storage,
    location: { hash: '', search: '' },
    addEventListener: () => {},
    removeEventListener: () => {},
  }
  says = await import('../src/web/components/DetailSays.tsx')
})

beforeEach(() => {
  store.clear()
})

function record(over: Partial<PanelRecord> & { id: string; kind: string }): PanelRecord {
  return {
    workspaceId: 'w',
    ownerId: 'o',
    title: 'A title somebody wrote',
    summary: null,
    data: {},
    createdAt: '2026-08-20T09:00:00',
    updatedAt: '2026-08-20T09:00:00',
    ...over,
  } as PanelRecord
}

/** The by-part structure, written and judged, exactly as a report stores it. */
const PARTS = {
  madeFrom: { seq: 4, contentHash: 'abc' },
  writtenBy: 'agent',
  parts: [
    {
      id: 'p-1',
      heading: 'The printed mount fails below the trial load',
      text30: 'Three of four printed mounts broke between fourteen and sixteen newtons, under the twenty the trials need.',
      text120: 'Four mounts were pulled on the bench jig and three broke at the thin section behind the bolt circle.',
      covers: ['b-1'],
    },
    {
      id: 'p-2',
      heading: 'The aluminium mount has not been pulled yet',
      text30: 'An aluminium mount of the same shape is on order and nothing else is waiting on it.',
      text120: 'An aluminium mount of the same geometry has been ordered and is expected next week.',
      covers: ['b-2'],
    },
  ],
}

const BLOCKS = [
  { id: 'b-1', type: 'text', text: 'Three of four printed wrist mounts cracked at about fifteen newtons.' },
  { id: 'b-2', type: 'text', text: 'Nobody has pulled the aluminium mount yet.' },
]

/**
 * TWO REPORTS THAT CARRY PARTS AND TWO RECORDS THAT DO NOT.
 *
 * `r-none` is a report with a body and no parts, which is the case the counter must still call
 * unwritten. `r-mod` is a module, so it is in the denominator for its own lengths and has no parts
 * to have written.
 */
const CORPUS: PanelRecord[] = [
  record({
    id: 'r-parts-1',
    kind: 'report',
    title: 'The shell cracked on the third print',
    summary: 'Three runs, one crack, always the same corner.',
    data: { blocks: BLOCKS, shortForms: { parts: PARTS } },
  }),
  record({
    id: 'r-parts-2',
    kind: 'report',
    title: 'The wrist mount pull test, round eight',
    summary: 'Three of four printed mounts broke below the load the trials need.',
    data: { blocks: BLOCKS, shortForms: { parts: PARTS } },
  }),
  record({
    id: 'r-none',
    kind: 'report',
    title: 'A report nobody has written the parts of',
    summary: 'It has a body and no summary written by part.',
    data: { blocks: BLOCKS },
  }),
  record({ id: 'r-mod', kind: 'module', title: 'The gripper', summary: 'What the gripper does.' }),
]

/** Which records carry parts, by id, in the order the corpus holds them. */
const WITH_PARTS = ['r-parts-1', 'r-parts-2']

/**
 * WHY THE DENOMINATOR AT LEVELS 4 TO 6 IS THREE, AND WAS FOUR UNTIL 3 SEPTEMBER 2026.
 *
 * It was every kind that declares short forms, which put the module in it: a module holds a curated
 * summary, so it has a place for a summary written by part in the way a report does. Nobody writes
 * one. On the live corpus that put 27 modules nobody intends to write parts for into the
 * denominator and into the *Unwritten* worklist beside them, which is a settings page sending
 * somebody to work nobody means to do. Criterion A14b: the label and the by-part structure belong
 * to a report, so the denominator at those four positions is the reports. The grid says so in its
 * own words on each of those columns.
 */

function draw(records: readonly PanelRecord[] = CORPUS): string {
  return renderToStaticMarkup(h(says.DetailGrid, { answer: detailSupplyOf(records) }))
}

function at(rung: string): { written: number; possible: number; unwritten: PanelRecord[] } {
  const found = says.supplyOf(CORPUS).find((one) => one.rung === rung)
  if (found === undefined) throw new Error(`the counter has no position ${rung}`)
  return found
}

// ================================================== 1. the three lengths written by part

describe('the counter counts a report whose parts are written as written at levels 4, 5 and 6', () => {
  it('counts exactly the reports that carry parts, at each of the three lengths', () => {
    for (const rung of BY_PART_LEVELS) {
      expect(at(rung).written, `position ${rung} counts a different number of written`).toBe(WITH_PARTS.length)
    }
  })

  it('names only the records without parts on the unwritten list', () => {
    for (const rung of BY_PART_LEVELS) {
      const said = at(rung).unwritten.map((one) => one.id)
      expect(said, `position ${rung} offers the wrong records as work`).not.toContain('r-parts-1')
      expect(said, `position ${rung} offers the wrong records as work`).not.toContain('r-parts-2')
      expect(said, `position ${rung} has lost the report that really has none`).toContain('r-none')
    }
  })

  it('draws two written of four on the screen at each of the three, in words a reader hears', () => {
    // THE NUMBERS ARE WRITTEN OUT rather than read back off `supplyOf`, so this test says what the
    // screen must show and not merely that the screen shows what the function returned.
    const html = draw()
    for (const rung of BY_PART_LEVELS) {
      expect(html, `position ${rung} is drawn with a different count`).toContain('2 written of 3 that could be')
    }
  })

  it('never counts more written than could be, at any position', () => {
    for (const one of says.supplyOf(CORPUS)) {
      expect(one.written, `position ${one.rung}`).toBeLessThanOrEqual(one.possible)
      expect(one.written + one.unwritten.length, `position ${one.rung} loses records`).toBe(one.possible)
    }
  })
})

// ================================================== 2. the other four positions are unmoved

describe('the positions that are not written by part answer as they did', () => {
  it('counts Full off the resolver, which this change did not touch', () => {
    // FULL IS THE RECORD ITSELF and is not a form somebody wrote, so it is not on the written-forms
    // list and `supplyOf` asks the resolver for it. Every kind here declares a body, so every one of
    // them is at Full and nothing is offered as work. Whether an EMPTY body should count as written
    // there is a separate question this change does not answer and does not move.
    expect(at('full').written).toBe(at('full').possible)
    expect(at('full').unwritten.map((one) => one.id)).toEqual([])
  })

  /**
   * REVERSED TWICE IN TWO DAYS, AND THIS IS WHERE IT LANDED.
   *
   * It read *counts the title column at the second position, for every record*, expecting
   * `CORPUS.length`. On 3 September 2026 criterion A14a took the column out of the ladder and it
   * became *counts no record's title column*, expecting 0. Criterion A14b, the same day, made the
   * column BE reading length 2 — a decision: title ≤15 words — so every record with a title
   * has that length again, and every record in this corpus has one.
   */
  it('counts every record’s own title at the second position', () => {
    expect(at('title').written).toBe(CORPUS.length)
    expect(at('title').possible).toBe(CORPUS.length)
    expect(at('title').unwritten.map((one) => one.id)).toEqual([])
  })

  /**
   * AND THE THIRD POSITION IS THE RECORD'S OWN SUMMARY, on the same criterion. Every record in this
   * corpus carries one, so nothing is offered as work; a record with a blank summary would be.
   */
  it('counts every record’s own summary at the third position', () => {
    expect(at('gist').written).toBe(CORPUS.length)
    expect(at('gist').possible).toBe(CORPUS.length)
  })

  /**
   * AND THE DENOMINATOR AT THOSE TWO IS EVERY RECORD, WHERE AT THE OTHER FOUR IT IS THE REPORTS.
   * The columns are on every kind; the label and the by-part structure are what a report is read at.
   */
  it('counts levels 2 and 3 over every record and the other four over the reports', () => {
    const reports = CORPUS.filter((one) => one.kind === 'report').length
    for (const rung of ['title', 'gist']) expect(at(rung).possible, `position ${rung}`).toBe(CORPUS.length)
    for (const rung of ['label', ...BY_PART_LEVELS]) expect(at(rung).possible, `position ${rung}`).toBe(reports)
  })

  /** And it says which of the two it counted over, on the column itself, rather than leaving a reader to count. */
  it('says on the screen what each column was counted over', () => {
    const html = draw()
    expect(html).toContain('Counted over the reports')
    expect(html).toContain('Counted over every record')
  })

  it('leaves a report with no parts out of the numerator and in the denominator', () => {
    for (const rung of BY_PART_LEVELS) {
      expect(at(rung).possible, `position ${rung}`).toBeGreaterThan(WITH_PARTS.length)
    }
  })
})
