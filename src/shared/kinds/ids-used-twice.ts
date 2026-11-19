// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN ID IS AN IDENTITY: two objects of one shape in one record may not carry the same `id`, the
 * shapes whose ids are checked somewhere else, the shapes whose id names something outside the
 * record, and the reader that reports a repeat.
 *
 * They were moved out of src/shared/kinds.ts with no change of behaviour: the same declarations,
 * the same comments and the same values. `IdSeen`, `IDS_CHECKED_ELSEWHERE`,
 * `IDS_THAT_NAME_SOMETHING_ELSE` and `idsUsedTwice` gained the `export` word, because the checker
 * that stays in kinds.ts reads them.
 *
 * THIS FILE IMPORTS THE `ValidationError` TYPE FROM ./describe-value.ts AND `SHAPE_SPECS` FROM
 * ../kinds.ts. SHAPE_SPECS is read only inside a function body, never while this file loads,
 * because ../kinds.ts is what loads this file.
 */
import type { ValidationError } from './describe-value.ts'
import { SHAPE_SPECS } from '../kinds.ts'

// ============================================================================ an id is an identity
//
// TWO OBJECTS OF ONE SHAPE IN ONE RECORD MAY NOT CARRY THE SAME `id`.
//
// WHY THIS EXISTS. Every shape below that has an `id` says in its own description that the id is
// unique — "a stable id, unique within the module" on a checklist item and on a part, "unique
// within the record" on a path. Nothing enforced any of it. POST /api/records answered 201 for a
// module whose checklist held one id twice, and the damage showed up two floors away: the revision
// ledger walks an array of things with ids BY id, so the twins collapsed into one entry and every
// edit to the first of them became invisible. Measured 18 August 2026 — the ledger said two
// revisions "hold exactly the same content" when they did not, and a restore said "Nothing moved"
// while moving the record back. A rule this file publishes and nothing checks is the defect this
// repository keeps finding, and this is the half that was missing.
//
// THE SCOPE IS THE RECORD, which is what those three descriptions already say. A checklist item id
// is unique across the whole module rather than within its own part, and that is not a stricter
// reading invented here: `patchChecklistItem` in server/lib/records/checklist-items.ts addresses a line by id alone
// — PATCH /api/records/<module>/checklist/<item id> — and refuses to act at all when two parts hold
// one id, because there is then no single line to change. This makes that state unwritable instead
// of leaving it to be discovered by a caller whose tick has nowhere to land.
//
// WHAT IT DOES NOT COVER. `data.extra` is a declared open bag and nothing looks inside it, so an
// id repeated in there still reaches the ledger. `shared/fielddiff.ts` therefore refuses to walk
// any array whose ids repeat, rather than trusting this rule to have run.

/** One object carrying an `id`, found while checking a record. */
export interface IdSeen {
  /** The shape that declared the id, e.g. `ProgressItem`. */
  shape: string
  id: string
  /** Where this one is, addressed as a caller would: `data.parts[0].items[1]`. */
  path: string
}

/**
 * Shapes whose ids are checked somewhere else, with where, so that one rule has one enforcer.
 *
 * Nothing at or below a shape named here is collected. A block id and a series id are both
 * narrower than a record — one summary, one chart — so a record-wide rule would be the wrong rule,
 * and running it beside the right one would be two checkers for one fact.
 */
export const IDS_CHECKED_ELSEWHERE: Readonly<Record<string, string>> = {
  ReportPart:
    '`partsProblems` in src/shared/zoom.ts, which the `ShortForms` shape check below calls on every ' +
    'write. It refuses two parts of one record that carry the same id, and says why in the words a ' +
    "writer needs: a part's id is what makes it the same part at reading levels 4, 5 and 6.",
  SummaryBlock:
    'src/server/lib/summary.ts, which src/server/lib/validate.ts names as the authority on blocks. ' +
    'It refuses a repeated block id within one summary and a repeated series id within one chart.',
  QuickNotePart:
    '`quickNoteCrossChecks` in src/shared/kinds/quick-note.ts. It refuses two parts of one note that share an id ' +
    'whatever their types, which a count kept for each type of part would not see, because a line names the boxes ' +
    'it joins by their ids.',
}

/**
 * SHAPES WHOSE `id` NAMES SOMETHING OUTSIDE THE RECORD, so repeating it is not a collision.
 *
 * The rule above is about an id that ADDRESSES one object inside a record: a checklist line, a
 * report part, a chart series. Two of those sharing an id leaves no single thing to change, which
 * is why the write is refused. A REFERENCE is the opposite: its id names a row in another registry,
 * and the same row is expected to be named more than once in one record.
 *
 * MEASURED ON CRITERION C29, 7 September 2026. A run released by an inspector reports to its
 * supervisor and closes when that supervisor confirms, so the run holds `released.reportedTo` and
 * `confirmed.by` — and in the ordinary case both are the same agent, because the supervisor the run
 * reported to is the one who confirms. The write was refused with "Two ParticipantRef objects in
 * one record may not share an id", which is a true sentence about an address and a false one about
 * a reference. It was reachable before this only because no kind held two participant references at
 * once; the first kind that did could not be written at all.
 *
 * THE TEST FOR IT IS `a-run-that-reported-is-not-closed.test.ts`, the case that closes a run.
 */
export const IDS_THAT_NAME_SOMETHING_ELSE: Readonly<Record<string, string>> = {
  StableNoticeOriginal: 'An original pin references an existing record revision; repeated references do not create duplicate addresses.',
  StableNoticeApproval: 'An approval pin references an existing note revision; repeated references are permitted.',
  ParticipantRef:
    'A participant reference names a row in the person registry or the agent registry. It is not an ' +
    'address for the object holding it, and one record naming the same participant twice is normal: ' +
    'the supervisor a run reported to is usually the one who confirms its report.',
}

/**
 * Every id that a record uses twice for the same shape, one error per repeat.
 *
 * The sentence that says WHY carries the shape's own published description of its `id`, so the rule
 * a caller reads at GET /api/kinds and the rule that refused their write are the same words.
 */
export function idsUsedTwice(seen: readonly IdSeen[]): ValidationError[] {
  const firstUse = new Map<string, IdSeen>()
  const errors: ValidationError[] = []
  for (const entry of seen) {
    const key = `${entry.shape}\u0000${entry.id}`
    const earlier = firstUse.get(key)
    if (earlier === undefined) {
      firstUse.set(key, entry)
      continue
    }
    // Nothing is collected unless its shape declares an `id` field, so this cannot be missing. It
    // is read rather than assumed, and says so when the assumption breaks, because the alternative
    // is a refusal whose reason is a blank space.
    const declared = SHAPE_SPECS[entry.shape]?.fields.find((f) => f.key === 'id')?.description
    if (declared === undefined) throw new Error(`kinds.ts: ${entry.shape} carries an id but declares no id field`)
    errors.push({
      path: `${entry.path}.id`,
      message:
        `${entry.path}.id is ${JSON.stringify(entry.id)}, and ${earlier.path}.id is ${JSON.stringify(entry.id)} too. ` +
        `Two ${entry.shape} objects in one record may not share an id, because the id is how one of them is ` +
        `addressed on its own. ${declared} Give one of them a different id.`,
    })
  }
  return errors
}
