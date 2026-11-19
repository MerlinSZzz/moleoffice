// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * The gate on the write path. One function, called once per write.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE IS FOR
 * ---------------------------------------------------------------------------------------
 *
 * Two comments in this codebase said record data was "validated by the schemas in validate.ts".
 * There was no validate.ts. A POST of
 *
 *     {"kind":"module","title":"probe","data":{"contxet":"typo","parts":"should be an array"}}
 *
 * was answered with a 201, and the module rendered as a page with a problem on it that whoever
 * wrote the record would never see. This file is the missing half.
 *
 * ---------------------------------------------------------------------------------------
 * STRICT ABOUT WRONG, FLEXIBLE ABOUT UNFINISHED
 * ---------------------------------------------------------------------------------------
 *
 * `validateRecordData` has two answers, not one. A key nothing reads, a value of the wrong type,
 * a vocabulary miss, a half-written nested object: those throw, and nothing is stored. A field
 * that is simply not there yet does not throw — the record is stored, and the function RETURNS
 * what it is still missing.
 *
 * That split is the whole point. The bug was never "somebody filed a module before they knew
 * what its checklist would be"; it was "somebody misspelt a key and was told it worked". Making
 * absence a refusal would have meant no record could be opened until it was finished, which is
 * backwards from how the work arrives, and it is what an author routes around by writing a
 * markdown file instead. What comes back from here is a report, and src/shared/kinds.ts
 * recomputes the same report on every read: it is derived from the specs, never stored.
 *
 * ---------------------------------------------------------------------------------------
 * WHY TWO CHECKS AND NOT ONE
 * ---------------------------------------------------------------------------------------
 *
 * `validateData` in src/shared/kinds/validation.ts is the STRUCTURE: which keys a kind takes, what type each
 * one is, and that an unrecognised key is an error. It is in `shared/` because the browser needs
 * the same answer as the server, so it may not import anything that touches SQLite.
 *
 * `checkModuleSummary` in ./summary.ts is the RULES for curated summary blocks: an axis must be
 * labelled, a table row must be as wide as its header, a LaTeX string must be closed, a chart
 * needs at least one series. Those are zod schemas and they are the authority on blocks.
 *
 * Running both, in that order, means a caller never gets a deep block complaint about an object
 * that was not the right shape in the first place. The two cannot drift apart on the structure
 * they share: `blocksAgree` below is a compile-time assertion that the type the zod schemas
 * produce and the SummaryBlock declared in shared/types.ts are the same type, in both directions.
 *
 * ---------------------------------------------------------------------------------------
 * ON THE IMPORT CYCLE
 * ---------------------------------------------------------------------------------------
 *
 * records.ts imports this file, this file imports summary.ts, and summary.ts imports PanelError
 * from records.ts. That cycle is safe because nothing here or in summary.ts touches PanelError
 * while the modules are being evaluated -- it is only ever used inside a function body, by which
 * time every module in the cycle has finished loading. Do not add top-level code that calls into
 * records.ts, or the cycle stops being harmless.
 */

import { envelopeIncompleteness, validateData, type Incompleteness } from '@shared/kinds.ts'
import { inTheNewWords } from '@shared/renamed-words.ts'
import type { RecordKind, SummaryBlock as SharedSummaryBlock } from '@shared/types.ts'
import { PanelError } from './panel-error.ts'
import { checkModuleSummary, type SummaryBlock as ZodSummaryBlock } from './summary.ts'
import { formatValidationErrors } from '@shared/validation-errors.ts'

/**
 * Re-exported so server code that already imports the write gate does not need a second import
 * for the type it hands back. `completenessOf`, the read-side twin, stays in @shared/kinds/incompleteness.ts:
 * the browser computes the same answer from the same specs, and it may not import from here.
 */
export type { Incompleteness } from '@shared/kinds.ts'

/**
 * A compile-time proof that the two definitions of a summary block are one shape.
 *
 * `shared/types.ts` declares the interfaces that everything reads against; `summary.ts` derives
 * its types from the zod schemas that everything is checked against. If either moves without the
 * other, `tsc --noEmit` fails here rather than a chart quietly failing to draw six weeks later.
 */
type MutuallyAssignable<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never
const blocksAgree: MutuallyAssignable<ZodSummaryBlock, SharedSummaryBlock> = true
void blocksAgree // referenced so the assertion cannot be dropped as unused

export { formatValidationErrors }

/**
 * Check the `data` of a record about to be written. Throws a 400 on anything WRONG, and returns
 * the list of what is merely MISSING.
 *
 * The two halves are not the same failure and are not treated the same way:
 *
 *   throws  — an unknown key, a wrong type, a value outside a vocabulary, a half-written nested
 *             object, a broken cross-field rule, a curated block that breaks the summary rules.
 *             Nothing is stored. This is the case the file was written for: `{"contxet":"typo"}`
 *             answered with a 201 is text the author never sees again.
 *   returns — a required field that is not there. The record IS stored; the caller gets back the
 *             sentences saying what it still wants, to show, log or hand on. An empty array
 *             means the record is complete.
 *
 * Call it on create with whatever `data` was supplied — including nothing at all, which is a
 * perfectly good stub and reports every required field. Call it on update ONLY when `data` is
 * part of the patch: a patch that does not mention `data` is not touching it, and re-checking
 * the stored value there would refuse edits to a title because of a record somebody else wrote
 * last month.
 *
 * Nothing is written back. A record that passes is stored exactly as it was sent, and the
 * incompleteness is NOT stored with it — the read path recomputes it with `completenessOf`, so
 * the answer cannot go stale behind a changed spec.
 */
export function validateRecordData(kind: RecordKind, data: unknown, summary: unknown = undefined): Incompleteness[] {
  // AN OLD ROW'S RENAMED WORDS ARE CHECKED IN THEIR NEW FORM (src/shared/renamed-words.ts), so a record that still
  // holds one can be edited; the row itself keeps the word it was written with.
  const result = validateData(kind, inTheNewWords(data))
  if (!result.ok) throw new PanelError(formatValidationErrors(kind, result.errors))

  // The deep block rules. Only modules have curated summaries, and checkModuleSummary already
  // knows that, so this is one call rather than a condition that has to be kept in step.
  checkModuleSummary(kind, result.data)

  // AND WHAT THE ENVELOPE OWES. A decision with no `summary` is incomplete, not refused, and the
  // caller that passed no summary says "not asked" rather than "has none" — the read path is where
  // a stored record's summary is known, and it asks `recordIncompleteness` for the same answer.
  return [...result.incomplete, ...envelopeIncompleteness(kind, summary)]
}
