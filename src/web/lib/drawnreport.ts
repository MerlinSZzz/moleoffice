// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE REGIONS THE REPORT ON THIS PAGE DERIVED, LEFT WHERE ANOTHER LAYER CAN ASK ABOUT THEM.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS EXISTS
 * ---------------------------------------------------------------------------------------
 *
 * `howItDrawsHere` in src/web/components/agent/marks.ts answers which of five ways a stored comment
 * draws on the view a reader is actually at. It needs two facts: the record's region tree, and
 * which of those regions this drawing put on the page. The second is read off the document. The
 * first is derived once, by `SummaryBlocks`, for the drawing it is making — so this is where that
 * one derivation is left, rather than being derived a second time by the layer that asks.
 *
 * A SECOND DERIVATION WOULD BE THE DEFECT AT THE TOP OF CLAUDE.md. Two walks over one report, free
 * to disagree about which regions it has, with nothing failing: the mark layer would decide a
 * comment's part is gone while the drawing had it on the screen.
 *
 * ---------------------------------------------------------------------------------------
 * NOBODY IS TOLD WHEN IT CHANGES, AND THAT IS DELIBERATE
 * ---------------------------------------------------------------------------------------
 *
 * There is no broadcast here. The one reader asks at the moment it has a question — when a person
 * has pressed a comment and the page has had its six seconds to draw the thing — and a value that
 * announced itself would re-render the mark layer on every render of the report, which watches the
 * document for changes and would answer by changing it.
 *
 * NULL IS A REAL ANSWER. No report is drawn on most pages, and a settings preview draws blocks that
 * are stored in no record: `SummaryBlocks` announces nothing for either, so the reader is told that
 * nobody derived a tree here rather than being handed an empty one.
 */

import type { Region, RegionId } from '@shared/regions.ts'
import type { DrawnPart } from '@shared/reportrungs.ts'
import type { Rung } from '@shared/detail.ts'
import type { RecordKind } from '@shared/types.ts'

/** One record's report body, as the drawing on this page derived it. */
export interface ReportDrawn {
  recordId: string
  root: Region
  /**
   * WHAT KIND OF RECORD THIS TREE IS OF, so a reader of it can name the parts in it.
   *
   * `namesOfParts` in @shared/regions.ts is the one thing that says WHICH part a part is, and it
   * needs the kind: a declared section's title is declared per kind. It is taken off the same
   * `RecordRegionSource` the tree is derived from, so the tree and the kind cannot be about two
   * different records.
   */
  kind: RecordKind
  /**
   * THE RECORD'S TITLE, or null where the surface drawing it was not handed the record's own words.
   *
   * The two parts that ARE the record — `data` and `data.blocks` — are named by it; see
   * `namesOfParts`, which says why the words underneath them will not do and what a null means.
   *
   * NULL IS AN ANSWER AND NOT AN EMPTY TITLE. A module panel draws one record's curated blocks
   * without being handed the record, so it announces the tree it derived and no title, and the two
   * wholes are named *the record* and *the body of the report* — true of them, and nothing invented.
   */
  title: string | null
  /**
   * WHICH FIELD OF THAT RECORD THE BLOCKS ARE STORED IN — `blocks` on a report, and a different
   * word on other kinds; `blocksFieldOf` in src/shared/kinds.ts is what decides it.
   *
   * IT IS CARRIED RATHER THAN GUESSED because the reader needs it to convert the older `reportBlock`
   * word into the region id it means, and the one converter takes the field as an argument. A
   * reader that assumed `blocks` would be right about reports and silently wrong about every other
   * kind that holds a body.
   */
  blocksField: string
  /**
   * WHICH READING LENGTH THIS DRAWING IS AT, and the parts it drew there, or null where it drew none.
   *
   * THE COMPOSER NEEDS BOTH TO NAME A PART A PERSON PRESSED. A press at levels 4, 5 and 6 lands on
   * one of the report's parts, and what the composer says about it — which part, of how many, at
   * which length, and which blocks it stands for — is a fact about THIS DRAWING. It is announced
   * here rather than worked out again in the composer, because working it out again would mean the
   * page and the composer holding two opinions about what was on the screen.
   */
  rung: Rung
  parts: readonly DrawnPart[] | null
  /**
   * THE ONE WRITTEN FORM THIS DRAWING PUT ABOVE THE REPORT, AND THE REGION IT IS, or null where it
   * drew none.
   *
   * WHY THE COMPOSER NEEDS IT. Reading lengths 2 and 3 are the record's own title and its own
   * summary — criterion A14b — and the SAME summary is
   * the record's one-line summary in the header of a module. So one region id means two different
   * things in two places, and which one it is is a fact about WHERE it was drawn. This is the
   * drawing saying which region it drew as its form and at which length, so the composer names
   * what is under the mouse rather than guessing from the id.
   *
   * NULL AT LENGTHS 4 TO 6, which draw parts rather than one form, at Full, which draws the report,
   * and at any length nobody wrote for this report.
   */
  form: { regionId: RegionId; rung: Rung } | null
}

let drawn: ReportDrawn | null = null

/** Said by the drawing, after it has drawn. */
export function noteReportDrawn(what: ReportDrawn): void {
  drawn = what
}

/**
 * Forgotten when that drawing goes.
 *
 * IT CLEARS ONLY ITS OWN. A page that draws one report after another mounts the new drawing before
 * the old one is taken down, so a clear that did not check would throw away the tree that had just
 * arrived and leave the layer with nothing.
 */
export function forgetReportDrawn(what: ReportDrawn): void {
  if (drawn === what) drawn = null
}

/** The report drawn on this page, or null because none is. */
export function theReportDrawnHere(): ReportDrawn | null {
  return drawn
}
