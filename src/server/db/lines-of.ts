// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `linesOf` was moved byte for byte out of src/server/lib/plans.ts, with no change of behaviour.
 * `toLine` was moved byte for byte out of src/server/lib/plans.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import { eq } from 'drizzle-orm'
import { db } from './client.ts'
import { planLines } from './schema.ts'
import type { PlanLine, LineRow } from '../lib/plans.ts'
import { parsePlanLine } from '@shared/planline.ts'

/** The lines of one plan, in the order they are written. */
export function linesOf(planId: string): PlanLine[] {
  return db
    .select()
    .from(planLines)
    .where(eq(planLines.planId, planId))
    .all()
    .map(toLine)
    .sort((a, b) => (a.position === b.position ? (a.id < b.id ? -1 : 1) : a.position - b.position))
}
/**
 * A stored row as a line, with the note and the planning values READ OUT OF THE WORDS.
 *
 * `row.remark` is deliberately not read. The column is still there — SQLite cannot drop one without
 * rebuilding the table, and a rebuild is a named exception under decision 13 that this change does
 * not need — and `src/server/db/plan-note-migration.ts` emptied it into the line text. Nothing in
 * Mole Office writes it now, so
 * reading it would be reading a value that no write path can keep up to date.
 */
export function toLine(row: LineRow): PlanLine {
  const parsed = parsePlanLine(row.text)
  const notes = parsed.values.filter((value) => value.key === 'note')
  return {
    id: row.id,
    planId: row.planId,
    position: row.position,
    text: row.text,
    recordId: row.recordId,
    remark: notes.length === 1 ? notes[0]!.value : null,
    planning: parsed.values.map((value) => ({ key: value.key, value: value.value })),
    updatedAt: row.updatedAt,
    updatedBy: row.updatedBy,
  }
}
