// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { readerWord } from './words.ts'

/**
 * ONE POINTER AT SOMETHING IN MOLE OFFICE, IN THE PERSON'S FOUR WORDS: KIND, ID, TITLE, AND WHAT IT MEANS HERE.
 *
 * ---------------------------------------------------------------------------------------------
 * WHY IT IS DECLARED ONCE
 * ---------------------------------------------------------------------------------------------
 *
 * `design/PROBLEM-REGISTER-OWNER-MESSAGE.md` section 7: an important reference carries at least
 * `Kind + ID + compact title + relevant meaning`, and a bare list of ids is not one, as in
 * `93 records finished (id1, id2, id3...)`. Criterion B18 of `design/bundle/ACCEPTANCE.md`.
 *
 * Four places wrote a pointer at a record before this file existed and none of them wrote the same
 * one: an entry's head line in `src/server/lib/continuation.ts`, the dropped-record names in that
 * file and again in `src/server/lib/bundle.ts`, the id lists in `src/server/lib/openloops.ts`, and
 * the section ids in `src/server/api/bootstrap.ts`. Three of the five carried a bare id and two
 * carried a title with no id. One shape, read by all of them, is what stops a sixth being written.
 *
 * ---------------------------------------------------------------------------------------------
 * WHAT "WHAT IT MEANS HERE" IS, AND WHY IT IS NEVER BLANK
 * ---------------------------------------------------------------------------------------------
 *
 * It is what this record is TO THE PART THAT NAMED IT — how far through a pipeline is, when a
 * stopping point was written, which state a problem stands in, what a link says. It is not a second
 * copy of the title and it is not the kind again.
 *
 * A READER WITH NOTHING PART-SPECIFIC TO SAY PASSES THE RECORD'S OWN STATE WORD, and where nobody
 * wrote one it passes the sentence saying so. `nobody has said where it stands` and a blank are
 * different facts and the reader of a copy cannot tell them apart unless one of them is written.
 */
export interface Reference {
  /**
   * THE RECORD THIS POINTS AT. Null when the thing named is not a record — a plan's line, a horizon
   * of the schedule, a row of the change log, a part of a report.
   *
   * A REFERENCE WITH NO RECORD IS NOT AN INCOMPLETE REFERENCE. It is a line about something that has
   * no id to carry, and printing `(unknown, unknown)` beside it would be a gap dressed as a fact.
   */
  recordId: string | null
  /** The record's kind, as stored. Null exactly when `recordId` is. */
  kind: string | null
  /** The one line that identifies this thing. Never empty. */
  title: string
  /**
   * WHAT THIS RECORD IS TO THE PART THAT NAMED IT. Never blank, and never the title again.
   *
   * Null means the caller has nothing to say and has said so; the line is drawn without the clause
   * rather than with an empty one. A caller that has a record should pass `stateMeaning` instead.
   */
  meansHere: string | null
}

/**
 * ONE REFERENCE AS ONE LINE: `title (kind, id) — what it means here`.
 *
 * THE TITLE IS FIRST AND THE PROVENANCE IS IN BRACKETS, which is the shape criterion B13 already
 * built for the records a copy had to leave out. A reader scans a list by its titles; the kind and
 * the id are what they need once they have found the one they want. The person's own example writes the kind
 * first — `Problem abc — Offline review cannot wake the same Agent` — and their requirement is the
 * four pieces rather than their order, so the copy uses one order everywhere.
 */
export function referenceLine(one: Reference): string {
  const where = one.recordId === null || one.kind === null ? '' : ` (${readerWord(one.kind).text}, ${one.recordId})`
  const meaning = one.meansHere === null || one.meansHere.trim() === '' ? '' : ` — ${one.meansHere}`
  return `${one.title}${where}${meaning}`
}

/**
 * WHETHER A LINE CARRIES ALL FOUR PARTS OF A REFERENCE TO THIS RECORD. What a gate asks, rather than a
 * shape it re-derives.
 *
 * IT ASKS OF THE TEXT AND NOT OF THE OBJECT, because the text is what leaves the building. A
 * reference built correctly and then printed by something that dropped the brackets would pass a
 * check on the object and fail the reader.
 */
export function aLineCarriesTheReference(line: string, one: Reference): boolean {
  if (one.recordId === null || one.kind === null) return line.includes(one.title)
  return (
    line.includes(one.title) &&
    line.includes(one.recordId) &&
    line.includes(readerWord(one.kind).text) &&
    (one.meansHere === null || one.meansHere.trim() === '' || line.includes(one.meansHere))
  )
}
