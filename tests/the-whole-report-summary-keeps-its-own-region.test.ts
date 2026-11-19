// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE WHOLE-REPORT SUMMARY KEEPS ITS OWN POINTABLE REGION, AND IS NOT THE RECORD ROOT'S TARGET.
 *
 * ---------------------------------------------------------------------------------------
 * THE ACT THIS HOLDS
 * ---------------------------------------------------------------------------------------
 *
 * The owner's act of 15 September 2026 settled E2 of
 * `design/problem-03/ACCEPTANCE.md`: the whole-report summary keeps its own region, pointable at
 * itself, and is not made the Report root's target. The owner's problem 4 sentence said a whole-report
 * summary MAY represent the Report root — *may*, not *must* — and this act chose the summary over
 * the alias.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT IS A TEST AND NOT A NOTE
 * ---------------------------------------------------------------------------------------
 *
 * The derivation that gives the summary its own region was built before the act, and nothing held
 * it: an edit that answered `regionOfDrawnLine('summary')` with the record root id — the obvious way
 * to make the summary "stand for the record" — would leave every other test green while every
 * comment left on a summary silently became a comment on the whole record. So this file states the
 * three facts that edit would break, in the terms the drawing and the server use them.
 *
 * The summary is reading length 3 (`columnRungOfRegion`), it is the declared section
 * `section.summaryLine` (`SUMMARY_LINE_KEY`, whose `inside` is null), and its region hangs directly
 * off the record root rather than being the root or the report body.
 *
 * ---------------------------------------------------------------------------------------
 * MUTATIONS
 * ---------------------------------------------------------------------------------------
 *
 *   in `regionOfDrawnLine` in src/shared/regions.ts, answer `SUMMARY_LINE_FIELD` with the record root
 *   → the identity and root cases go red.
 *
 *   in `sectionsDeclaredBy` in src/shared/sections.ts, change the summary-line spec's `inside` to
 *   `READING_MATTER_KEY` → the `inside` case goes red.
 *
 *   in `recordRegionsOf` in src/shared/regions.ts, parent the summary-line draft to the reading
 *   matter instead of the record root → the parent case goes red.
 */

import { describe, expect, it } from 'vitest'
import {
  carriesTarget,
  columnRungOfRegion,
  flatten,
  RECORD_ROOT_ID,
  recordRegionsOf,
  regionOfDrawnLine,
  sectionRegionId,
  type Region,
} from '../src/shared/regions.ts'
import { READING_MATTER_KEY, SECTIONS_OF, SUMMARY_LINE_KEY } from '../src/shared/sections.ts'
import type { SummaryBlock } from '../src/shared/types.ts'

/** A report with a body, so the record has both a summary and a reading matter to confuse it with. */
const BLOCKS: SummaryBlock[] = [
  { id: 'b-1', type: 'text', heading: 'What the bench said', text: 'Three of four printed mounts broke under load.' },
]

const SUMMARY =
  'Three of four printed mounts broke below the load the trials need, so only the aluminium one is worth another run.'

/** The record as the derivation sees it. */
const SOURCE = {
  kind: 'report',
  title: 'Wrist mount pull test, round eight',
  summary: SUMMARY,
  data: { blocks: BLOCKS },
  relations: [],
} as const

/** Every region of the record, flat. */
const tree = (): readonly Region[] => flatten(recordRegionsOf(SOURCE))

/** The one region carrying an id, or a failure that names what was looked for. */
function region(id: string): Region {
  const found = tree().find((one) => one.id === id)
  if (found === undefined) throw new Error(`the record tree holds no region ${id}`)
  return found
}

// ============================================================ 1. it is its own region

describe('the whole-report summary is its own region', () => {
  it('is the declared section `section.summaryLine`, which is where the drawing reads it', () => {
    // ONE SPELLING. The body asks `regionOfDrawnLine` for the id to put on the words it drew, and
    // the server parses the id back to the field. A second spelling here would be the id that drifts.
    expect(regionOfDrawnLine('summary')).toBe(sectionRegionId(SUMMARY_LINE_KEY))
    expect(region(regionOfDrawnLine('summary') as string).id).toBe(sectionRegionId(SUMMARY_LINE_KEY))
  })

  it('is not the record root, which is a different region with a different name', () => {
    const summary = regionOfDrawnLine('summary') as string
    expect(summary).not.toBe(RECORD_ROOT_ID)
    expect(region(summary).id).not.toBe(region(RECORD_ROOT_ID).id)
    // THE CONTROL: both really are in the tree, so the case is not two undefined values agreeing.
    expect(tree().map((one) => one.id)).toContain(summary)
    expect(tree().map((one) => one.id)).toContain(RECORD_ROOT_ID)
  })

  it('hangs directly off the record root and is not inside the reading matter', () => {
    const spec = SECTIONS_OF.report.find((one) => one.key === SUMMARY_LINE_KEY)
    expect(spec, 'a report declares no summary-line section').toBeDefined()
    // THE DECLARATION. `inside: null` is what makes it a place on the record rather than a part of
    // the report's own body, which is what E2 chose it not to be.
    expect(spec?.inside, 'the summary was put inside the reading matter').toBeNull()
    expect(spec?.inside).not.toBe(READING_MATTER_KEY)
    // AND THE DERIVED TREE AGREES WITH THE DECLARATION.
    const line = region(sectionRegionId(SUMMARY_LINE_KEY))
    expect(line.parentId).toBe(RECORD_ROOT_ID)
    expect(line.role).toBe('section')
    expect(line.declared).toBe(true)
  })

  it('carries its own words and a target, while the root carries none', () => {
    const line = region(sectionRegionId(SUMMARY_LINE_KEY))
    expect(line.text).toBe(SUMMARY)
    expect(line.field).toBe('summary')
    expect(carriesTarget(line), 'the summary is not a place a person can point at').toBe(true)
    // THE ROOT IS THE RECORD, and the record already has a name of its own, so it is not a target.
    // This is the other half of E2: the summary being pointable does not make the root pointable at
    // the summary's id.
    expect(carriesTarget(region(RECORD_ROOT_ID)), 'the record root became a target').toBe(false)
  })

  it('is not the report body root and is not drawn inside it', () => {
    const body = tree().find((one) => one.role === 'reportBody')
    expect(body, 'the record tree holds no report body').toBeDefined()
    const line = region(sectionRegionId(SUMMARY_LINE_KEY))
    expect(line.id).not.toBe(body?.id)
    // The body is re-parented under its section; the summary is a sibling section, not a child.
    expect(body?.parentId).not.toBe(line.id)
    expect(line.parentId).not.toBe(body?.id)
  })

  it('is reading length 3, so a press on it names the conclusion', () => {
    // The reverse reader the composer uses. It answers the length, not the words: WHERE the summary
    // is drawn decides what it is called, and this is the id the report body draws at length 3.
    expect(columnRungOfRegion(sectionRegionId(SUMMARY_LINE_KEY))).toBe('gist')
  })
})
