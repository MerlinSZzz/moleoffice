// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { shortFormsField } from './kinds/short-form-fields.ts'
import { type FieldSpec, type KindSpec } from './kinds/kind-common.ts'
import { KINDS_AS_WRITTEN } from './kinds/the-kinds-as-written.ts'
import { INCOMPLETE_FIELD_SENTENCE } from './record-reader-sentences.ts'
import { withTheLinesFields } from './kinds/the-lines-fields.ts'
import { RECORD_KINDS, type RecordKind } from './types.ts'
import { SHORT_FORMS_FIELD } from './zoom.ts'
export { INCOMPLETE_FIELD_SENTENCE } from './record-reader-sentences.ts'
export { type GateContract, describeGate, describeKinds, SHAPE_SPECS } from './kinds/the-kinds-as-written.ts'

/**
 * WHAT BELONGS INSIDE A RECORD'S `data`, AND THE CHECK THAT ENFORCES IT.
 *
 * ---------------------------------------------------------------------------------------
 * A KIND'S FIELDS LIVE IN ITS OWN FILE; THIS FILE JOINS THEM
 * ---------------------------------------------------------------------------------------
 *
 * The fields of each kind are declared in src/shared/kinds/<kind>.ts, one kind to a file, and the
 * table of the kinds as they are written is src/shared/kinds/the-kinds-as-written.ts. This file
 * joins the kinds with the line fields and the short forms field and exports `KIND_SPECS`.
 *
 * ---------------------------------------------------------------------------------------
 * A LINE'S NEW FIELDS FOR A KIND GO IN A FILE OF THE LINE'S, NOT IN THIS FILE OR THE KIND'S
 * ---------------------------------------------------------------------------------------
 *
 * A line is one stream of development work, named by its wave, such as 13s. Put the fields a line
 * adds to one kind in a file of the line's own:
 *
 *   src/shared/kind-fields/<kind>-wave-<line>.ts
 *
 * For the session kind and line 13s, that is src/shared/kind-fields/session-wave-13s.ts. In a
 * kind's name, `_` is written as `-`; one file holds one line's fields for one kind.
 *
 * The file exports one value, named as the file is named, in camel case: `sessionWave13s`. Its
 * type is `FieldsOfALine`, declared in ./kinds/the-lines-fields.ts: the kind in `kind`, and the
 * fields in `fields`, each a FieldSpec as every field of a kind is.
 *
 * The file imports only types from this file, because this file imports it: a value imported back
 * would be read before this file has made it. Like this file, it runs in the browser as well.
 *
 * In the same commit, add one line for the file to src/shared/kind-fields/parts.ts, in the order of
 * the exported names: `export { sessionWave13s } from './session-wave-13s.ts'`.
 *
 * KIND_SPECS joins a kind's fields in this order:
 *
 *   1. the kind's own fields, as its file writes them;
 *   2. the fields of each line's file for that kind, the files taken in the order of their
 *      exported names, and each file's fields in the order it writes them;
 *   3. the short forms field, which this file gives every kind.
 *
 * This file refuses to load, so the server does not start, when a line's file adds a key the kind
 * already declares, adds a key another line's file adds to the same kind, adds the short forms
 * key, or names a kind with no spec. The error names the key and both places that declare it.
 * ./kinds/the-lines-fields.ts holds that guard.
 *
 * A line's field needs a word, as every field does. tests/every-declared-field-has-a-word.test.ts
 * fails on a field without one.
 *
 * The fields a kind already declares stay in its own file. Moving one into a line's file is a
 * change of its own, made on purpose, and never a side effect of adding another.
 *
 * Why. Many lines change a kind's file. When two merge entries change the same file, the later one
 * meets the earlier one's change, and the merge queue can send it back. A line's own file is
 * changed by nobody else, so the only file two lines share is parts.ts, where each adds one line.
 *
 * tests/a-field-a-line-adds-to-a-shared-kind-joins-the-kind-table.test.ts holds this. Its cases
 * stand a made list in for parts.ts, so they depend on no line's file.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS FILE EXISTS
 * ---------------------------------------------------------------------------------------
 *
 * An agent was asked to use Mole Office through its HTTP API and reported this:
 *
 *   "It would not skip because writing is slow. It would skip because it cannot find out what
 *    to write. So I read about 1200 lines of source to learn that a pipeline's blocks are stored
 *    under 'steps', that a module's charts go in 'summaryBlocks' which appears in no type
 *    anywhere, and that a direction's depth level has no defined key at all so I invented one."
 *
 * And then the failure that actually matters:
 *
 *   "I wrote data.blocks instead of data.summaryBlocks. The POST returned 201. I found out only
 *    by looking at a screenshot and seeing 700 lines of raw JSON where a chart should be. An
 *    agent does not look at screenshots. It would have reported success and moved on."
 *
 * So: every field of every kind is declared under src/shared/kinds/, in one place per kind, in
 * plain English, with a real example — and `validateData` in ./kinds/validation.ts refuses
 * anything that does not match. The descriptions are sentences rather than type names, which is
 * why it is safe to serve KIND_SPECS over HTTP as documentation.
 *
 * ---------------------------------------------------------------------------------------
 * THE FIVE RULES
 * ---------------------------------------------------------------------------------------
 *
 * 1. AN UNKNOWN KEY IS AN ERROR, never a warning and never silently kept. A key nothing reads is
 *    text the author will never see again, which is worse than a refusal. Where the key is close
 *    to a real one, the error names the real one.
 *
 * 2. NOTHING IS NORMALISED. No trimming, no defaulting, no coercion. A record that validates is
 *    byte-for-byte what was sent, so nobody has to wonder later whether Mole Office rewrote it.
 *
 * 3. WRONG IS REFUSED; ABSENT IS REPORTED. This is the distinction the whole file turns on.
 *
 *      REFUSED, nothing stored:  an unknown key; a value of the wrong type; a value outside a
 *                                declared vocabulary; a nested object that is half written.
 *      STORED, and reported:     a field marked `required` that is not there at all.
 *
 *    A misspelt key or a string where a list belongs is content the author will never see again
 *    — that is the failure this file was written for, and it stays a hard 400. A field that is
 *    simply absent is not wrong, it is not written yet. Refusing that would mean the only way to
 *    open a record is to already know everything about it, and work does not arrive in that
 *    order: you learn what a module is for while you build it.
 *
 *    A HALF-WRITTEN NESTED OBJECT sits on the refused side deliberately. `parts` may be left out
 *    of a module entirely, but a ModulePart with no `name` draws as a blank heading and a chart
 *    series with no `points` puts a legend entry on a line that is not there. Leave the whole
 *    field out instead — being allowed to leave it out is exactly what makes that reasonable.
 *
 * 4. `required` MEANS COMPLETE, NOT CREATABLE. A field is marked required only when something in
 *    Mole Office cannot do its job without it (the home page refuses to draw a pipeline whose `steps`
 *    it cannot read; the alarm panel cannot rank a session with no `state`; an obligation with no
 *    `due` can never be owed), or when the kind has no meaning without it (a direction is defined
 *    by its depth). Everything else is optional, because a validator that demands ceremony gets
 *    routed around.
 *
 *    Completeness is COMPUTED FROM THESE SPECS ON EVERY READ, by `completenessOf` in
 *    ./kinds/incompleteness.ts, and is never stored on the record. A stored flag would be wrong the
 *    moment a spec changed, and it would be wrong silently — which is a class of drift this project
 *    has already been bitten by.
 *
 * 5. EVERY KIND HAS AN `extra` BAG, and it is declared rather than implied. Research records grow
 *    fields nobody anticipated, and the alternative to a declared bag is an agent that cannot
 *    file what it measured and writes a markdown file instead. `extra` is stored and shown, and
 *    nothing indexes it: a field you want a PAGE to use belongs in KIND_SPECS, not in `extra`.
 *
 * ---------------------------------------------------------------------------------------
 * WHERE THE DEEP CHECKS LIVE
 * ---------------------------------------------------------------------------------------
 *
 * This file joins the specs and is read in the browser as well as on the server, so it may not
 * import anything that touches the database. `src/server/lib/summary.ts` holds the zod schemas
 * for curated summary blocks and is the authority on their RULES — an axis must be labelled, a
 * table row must be as wide as its header, a LaTeX string must be closed. `src/server/lib/
 * validate.ts` runs both, in that order, on every write. The structural check itself is
 * `validateData` in ./kinds/validation.ts.
 */

// THE KIND VOCABULARY LIVES IN src/shared/kinds/kind-common.ts. It is handed on here so every
// caller still imports it from this file.
export * from './kinds/kind-common.ts'

// THE WORDS A FEW FIELDS TAKE LIVE IN src/shared/kinds/kind-words.ts. They are handed on here so
// every caller still imports them from this file.
export * from './kinds/kind-words.ts'

// THE FIELDS A LINE'S FILE ADDS ARE JOINED IN src/shared/kinds/the-lines-fields.ts. Its type is
// handed on here so every caller still imports it from this file.
export type { FieldsOfALine } from './kinds/the-lines-fields.ts'

// THE TWO DECISION HELPERS LIVE IN src/shared/kinds/decision-fields.ts. They are handed on here so
// every caller still imports them from this file.
export { decisionFieldsIn, decisionCoreFieldKeys } from './kinds/decision-fields.ts'

// THE KINDS THAT HAVE MOVED TO src/shared/kinds/ ARE HANDED ON HERE, in the order they appear in
// KINDS_AS_WRITTEN. Every caller still imports each kind from this file.
export * from './kinds/whole-suite-receipt.ts'
export * from './kinds/notice-rules.ts'
export * from './kinds/quick-note.ts'
export * from './kinds/module.ts'
export * from './kinds/pipeline.ts'
export * from './kinds/block.ts'
export * from './kinds/sealed-tip.ts'
export * from './kinds/merge-entry.ts'
export * from './kinds/emergency-push.ts'
export * from './kinds/session.ts'
export * from './kinds/problem.ts'
export * from './kinds/task.ts'
export * from './kinds/purchase.ts'
export * from './kinds/obligation.ts'
export * from './kinds/claim.ts'
export * from './kinds/proposal.ts'
export * from './kinds/decision.ts'
export * from './kinds/idea.ts'
export * from './kinds/criticism.ts'
export * from './kinds/direction.ts'
export * from './kinds/wanna_try.ts'
export * from './kinds/message.ts'
export * from './kinds/note.ts'
export * from './kinds/report.ts'
export * from './kinds/draft.ts'
export * from './kinds/annotation.ts'
export * from './kinds/agent.ts'
export * from './kinds/role-card.ts'
export * from './kinds/role-card-words.ts'
export * from './kinds/role-request.ts'
export * from './kinds/stopping-point.ts'
export * from './kinds/context-bundle.ts'
export * from './kinds/placeholder.ts'
export * from './kinds/ran-instead.ts'
export * from './kinds/work-domain.ts'
export * from './kinds/trajectory.ts'
export * from './kinds/planned-state.ts'
export * from './kinds/notebook.ts'
export * from './kinds/incident.ts'
export * from './kinds/regulation.ts'
export * from './kinds/goal.ts'
export * from './kinds/flow.ts'
export * from './kinds/flow-run.ts'
export * from './kinds/host-job.ts'
export * from './kinds/pack.ts'
export * from './kinds/counter.ts'
export * from './kinds/checklist.ts'
export * from './kinds/booking.ts'
export * from './kinds/secretary-duties.ts'
export * from './kinds/department.ts'
export * from './kinds/key-item.ts'
export * from './kinds/watch.ts'
export * from './kinds/backlog-item.ts'
export * from './kinds/handbook.ts'
export * from './kinds/project-chapter.ts'
export * from './kinds/design.ts'
export * from './kinds/design-review.ts'
export * from './kinds/design-reminder.ts'
export * from './kinds/tool-category.ts'
export * from './kinds/tool.ts'
export * from './kinds/drawn-on.ts'
export * from './kinds/type-reader.ts'
export * from './kinds/key-suggestions.ts'
export * from './kinds/describe-value.ts'
export * from './kinds/incompleteness.ts'
export * from './kinds/validation.ts'


// ============================================================================ nested shapes


/**
 * TRUE WHEN THIS KIND DECLARES A PLACE FOR THE AUTHORED SHORT FORMS.
 *
 * READ OFF THE DECLARATION, so it cannot disagree with what a write accepts. It is asked by the
 * detail resolver's caller in the browser and by the reply to a record write on the server, and
 * before this it was a function in `src/web/lib/detailsource.ts` that the server could not reach —
 * so the server would have had to hold a second answer, which is this repository's oldest defect.
 *
 * IT ANSWERS TRUE FOR EVERY KIND SINCE 5 SEPTEMBER 2026 and it is still read rather than assumed:
 * a kind that lost the field would answer false here without anybody editing this line, which is
 * what "read off the declaration" is for. `kindHoldsPartsLevels` below is the question that still
 * separates the kinds.
 */
export function kindDeclaresShortForms(kind: string): boolean {
  const spec = KIND_SPECS[kind as RecordKind] as { fields: readonly { key: string }[] } | undefined
  if (spec === undefined) return false
  return spec.fields.some((field) => field.key === SHORT_FORMS_FIELD)
}

/**
 * TRUE WHEN THIS KIND HAS A PLACE FOR READING LEVELS 4, 5 AND 6 — the ones written by part.
 *
 * READ OFF THE DECLARED SHAPE OF THE FIELD, never off a list of kind names. A part names the blocks
 * it covers, so the kinds that have these three levels are the kinds that hold blocks, and
 * `shortFormsField` chooses the shape from exactly that.
 */
export function kindHoldsPartsLevels(kind: string): boolean {
  const spec = KIND_SPECS[kind as RecordKind] as { fields: readonly FieldSpec[] } | undefined
  if (spec === undefined) return false
  return spec.fields.some((field) => field.key === SHORT_FORMS_FIELD && field.type === 'ShortFormsWithParts')
}

/**
 * EVERY KIND, WITH THE FIELDS THE LINES' FILES ADD AND `data.shortForms` ON IT. This is the
 * declaration everything reads.
 *
 * THE FIELDS A LINE'S FILE ADDS come after the kind's own fields and before the short forms field.
 * `withTheLinesFields` in ./kinds/the-lines-fields.ts joins them, and the head comment of this
 * file says where such a file
 * goes. Whether the kind holds blocks is read off the joined list, so a line's `SummaryBlock[]`
 * field counts as one written here does.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE FIELD IS ADDED HERE RATHER THAN TYPED INTO TWENTY-SIX FIELD LISTS
 * ---------------------------------------------------------------------------------------
 *
 * Every kind carries it, so twenty-six copies of one line would be twenty-six things that must
 * agree with nothing making them agree — and the twenty-seventh kind would arrive without it and
 * nothing would fail. `commonFields` is the other answer to that question and it cannot be used
 * here: it takes the word a sentence reads (*planned future*, *context bundle*), and choosing
 * between the two shapes needs to know whether the kind holds blocks, which is read off the kind's
 * own fields.
 *
 * WHICH SHAPE A KIND GETS IS READ OFF ITS OWN DECLARATION, never off a list of kind names. A kind
 * that declares a `SummaryBlock[]` field holds blocks, so a part has something to cover and the
 * shape carries `parts`. Everything else gets the label alone. `blocksFieldOf` asks the same
 * question of the finished specs and cannot come to a different answer, because both read the
 * declared type.
 */
export const KIND_SPECS: Record<RecordKind, KindSpec> = Object.fromEntries(
  RECORD_KINDS.map((kind): [RecordKind, KindSpec] => {
    const spec = KINDS_AS_WRITTEN[kind]
    const fields = withTheLinesFields(kind, spec.fields)
    const holdsBlocks = fields.some((field) => field.type === 'SummaryBlock[]')
    return [kind, { ...spec, fields: [...fields, shortFormsField(kind, holdsBlocks, spec.summaryGuidance)] }]
  }),
) as Record<RecordKind, KindSpec>
