// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * RECORDING THAT SOMEBODY LOOKED AT A PIECE OF WORK AFTER A RESTRICTION WAS RESOLVED.
 *
 * ---------------------------------------------------------------------------------------
 * RESOLUTION CHANGES THE WORDS AND WRITES THE ROWS. IT REMOVES NOTHING
 * ---------------------------------------------------------------------------------------
 *
 * The owner: *"do not automatically treat all previous downstream results as newly valid. Identify
 * affected evidence/work and mark relevant items for re-validation."* And in the owner's failure-modes
 * list, in one line: *automatically validate old evidence when Placeholder is resolved*.
 *
 * So when a placeholder is answered, the restriction keeps travelling to every record it reached —
 * with different words, *resolved, not re-checked* — until somebody records a judgement about that
 * record. This file is where the judgement is recorded. `writeRevalidationRows` in `lib/records/links.ts` is
 * where the rows are made.
 *
 * ---------------------------------------------------------------------------------------
 * THE PAIR IS THE KEY, NOT THE ROW ID
 * ---------------------------------------------------------------------------------------
 *
 * `PUT /api/revalidations/<restriction id>/<record id>`, and it upserts. A route keyed on a row id
 * could only ever answer for a record that already HAS a row — so a record that became a dependency
 * after the resolution could never be checked off and would read *resolved, not re-checked* for
 * ever. Keyed on the pair the unique index is keyed on, both cases are one route:
 *
 *   the row exists  — it is updated, and `written_by` is untouched.
 *   there is no row — one is made, `written_by = 'judgement'`, with `reached_by` and `distance`
 *                     taken from the reading AT THIS MOMENT, which is a different fact from the
 *                     graph at the resolution and is why the column exists.
 *
 * It REFUSES when the restriction does not reach the record. A judgement about a record a
 * restriction does not reach is not a judgement, and Mole Office will not store an answer to a question
 * nobody asked.
 *
 * ---------------------------------------------------------------------------------------
 * `note` IS REQUIRED FOR `not_affected` AND OPTIONAL FOR `checked`
 * ---------------------------------------------------------------------------------------
 *
 * `not_affected` means *the restriction is not returned for this record* — it takes somebody's
 * restriction off a page. Dismissing one without saying why is not a judgement, it is a deletion,
 * and a reason nobody gave is not a reason. `checked` keeps the note optional, because *I re-ran it
 * and it stands* is a complete answer.
 *
 * `decided_by` and `decided_at` are set by the server from the actor and the clock, NEVER from the
 * body — the rule every derived column in this schema keeps.
 */
import { and, eq } from 'drizzle-orm'
import { anOfficeId } from './ids.ts'
import { db } from '../db/client.ts'
import { records, revalidations } from '../db/schema.ts'
import { assertMayDismissARestriction, recordInWorkspace, type Actor } from './records.ts'
import { now } from '@shared/now.ts'
import { PanelError } from './panel-error.ts'
import { restrictionsOn } from './restrictions.ts'
import { whoWroteRecord } from '../db/who-wrote-record.ts'
import { theKindOfAnActorsId } from '@shared/types.ts'

/** The three words a row may hold. `needs_review` is the machine's; the other two are authored. */
export const REVALIDATION_STATES = ['needs_review', 'checked', 'not_affected'] as const
export type RevalidationState = (typeof REVALIDATION_STATES)[number]

export interface JudgementResult {
  /** The row as it now stands. */
  row: {
    id: string
    restrictionId: string
    recordId: string
    state: RevalidationState
    writtenBy: string
    distance: number
    decidedBy: string | null
    decidedAt: string | null
    note: string | null
  }
  /** True when this call made the row rather than updating one. */
  created: boolean
  /** What happened, in the words the reply prints. */
  note: string
}

/**
 * Whether the restriction was written by a person, read from the revision ledger.
 *
 * NOT from `records.origin` and not from a field on the record: who wrote a record is what the
 * ledger answers, and it is the only thing that can answer it for a record that has been edited
 * since. Where the ledger has no answer the guard is asked as though a person wrote it, because
 * *nobody knows who wrote this* must not become *an agent wrote it, so anything may be done to it*.
 */
function writtenByAPerson(recordId: string): boolean {
  const wrote = whoWroteRecord(recordId)
  return wrote === null || wrote.startsWith('human:')
}

/**
 * Record a judgement about one record, for one restriction.
 *
 * Moving back to `needs_review` is allowed and is recorded, because somebody may realise they
 * checked the wrong thing.
 */
export function recordJudgement(input: {
  restrictionId: string
  recordId: string
  state: RevalidationState
  note?: string | null
  workspaceId: string
  actor: Actor
}): JudgementResult {
  const { restrictionId, recordId, state, workspaceId, actor } = input
  const note = input.note == null || input.note.trim() === '' ? null : input.note.trim()

  // BOTH ENDS ARE HELD TO THE PROJECT BOUNDARY, by the one function every other route uses. Both
  // parameters are record ids, and a judgement written across the boundary would put a mark on a
  // record the caller cannot see, from a restriction it cannot read.
  const restriction = recordInWorkspace(restrictionId, workspaceId)
  const record = recordInWorkspace(recordId, workspaceId)
  if (restriction.deletedAt != null) {
    throw new PanelError(
      `"${restriction.title}" has been deleted, so there is nothing to judge against.`,
      404,
    )
  }
  if (record.deletedAt != null) {
    throw new PanelError(`"${record.title}" has been deleted.`, 404)
  }

  if (note === null && state === 'not_affected') {
    throw new PanelError(
      `"Was not affected" takes "${restriction.title}" off "${record.title}" altogether, so it needs a reason in ` +
        `your own words. Send {"state":"not_affected","note":"…"}. A dismissal with no reason is indistinguishable ` +
        `from a deletion a month later, and the restriction's author wrote theirs down. "Still stands" needs no ` +
        `note: "I re-ran it and it holds" is a complete answer.`,
    )
  }

  const severity = ((restriction.data ?? {}) as Record<string, unknown>)['severity']
  assertMayDismissARestriction(
    {
      id: restrictionId,
      title: restriction.title,
      severity: typeof severity === 'string' ? severity : 'stops_final',
      writtenByAPerson: writtenByAPerson(restrictionId),
    },
    recordId,
    state,
    actor,
  )

  const existing = db
    .select()
    .from(revalidations)
    .where(and(eq(revalidations.restrictionId, restrictionId), eq(revalidations.recordId, recordId)))
    .get()

  if (existing !== undefined) {
    db.update(revalidations)
      .set({ state, note, decidedBy: actor.id, decidedByKind: theKindOfAnActorsId(actor.type), decidedAt: now() })
      .where(eq(revalidations.id, existing.id))
      .run()
    return {
      row: {
        id: existing.id,
        restrictionId,
        recordId,
        state,
        writtenBy: existing.writtenBy,
        distance: existing.distance,
        decidedBy: actor.id,
        decidedAt: now(),
        note,
      },
      created: false,
      note: sentenceFor(state, restriction.title, record.title),
    }
  }

  // NO ROW YET. This is the record that became a dependency after the resolution. Its path is the
  // graph AT THIS MOMENT, which is why `written_by` says which act made the row: a page that drew
  // the two the same way would claim the path was frozen at the resolution when it was not.
  const reading = restrictionsOn(recordId, workspaceId).found.find((r) => r.restrictionId === restrictionId)
  if (reading === undefined) {
    throw new PanelError(
      `"${restriction.title}" does not reach "${record.title}", so there is nothing to judge. Nothing was ` +
        `written. A judgement about a record a restriction does not reach is an answer to a question nobody ` +
        `asked, and storing one would put a mark on this record that no reader could explain.`,
      409,
    )
  }
  const path = reading.reach.how === 'depends' ? reading.reach.path : []
  const distance = reading.reach.how === 'depends' ? reading.reach.distance : 0
  const id = anOfficeId()
  db.insert(revalidations)
    .values({
      id,
      workspaceId,
      restrictionId,
      recordId,
      reachedBy: JSON.stringify(path),
      distance,
      writtenBy: 'judgement',
      at: now(),
      state,
      decidedBy: actor.id,
      decidedByKind: theKindOfAnActorsId(actor.type),
      decidedAt: now(),
      note,
    })
    .run()
  return {
    row: {
      id,
      restrictionId,
      recordId,
      state,
      writtenBy: 'judgement',
      distance,
      decidedBy: actor.id,
      decidedAt: now(),
      note,
    },
    created: true,
    note: sentenceFor(state, restriction.title, record.title),
  }
}

function sentenceFor(state: RevalidationState, restriction: string, record: string): string {
  if (state === 'checked') {
    return (
      `"${record}" has been re-checked against "${restriction}" and still stands. The restriction is no longer ` +
      `drawn on this record. It is unchanged everywhere else it reaches, and nothing about this record was ` +
      `rewritten — a judgement is a bookmark on somebody's reading, not an edit.`
    )
  }
  if (state === 'not_affected') {
    return (
      `"${record}" is recorded as never really affected by "${restriction}", with your reason. The restriction ` +
      `is no longer drawn on this record and is unchanged everywhere else it reaches.`
    )
  }
  return `"${record}" is back to needing a re-check against "${restriction}".`
}
