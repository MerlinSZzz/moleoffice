// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `getPlan` was moved byte for byte out of src/server/lib/plans.ts, with no change of behaviour.
 * `toPlan` was moved byte for byte out of src/server/lib/plans.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import { eq } from 'drizzle-orm'
import { db } from '../db/client.ts'
import { plans as plansTable } from '../db/schema.ts'
import type { Plan, PlanRow } from './plans.ts'
import { isPlanState, PLAN_STATES } from '@shared/plandoc.ts'
import { PanelError } from './panel-error.ts'

export function getPlan(id: string): Plan | null {
  const row = db.select().from(plansTable).where(eq(plansTable.id, id)).get()
  return row === undefined ? null : toPlan(row)
}
/**
 * A stored plan row as a `Plan`, refusing a state word nothing recognises.
 *
 * The refusal is deliberate and is not defensive coding: `state` decides whether a plan is on the
 * list at all, so a word nobody can classify would silently drop a plan out of the product. Every
 * write here goes through `checkState`, so reaching this throw means the row was written by hand.
 */
export function toPlan(row: PlanRow): Plan {
  if (!isPlanState(row.state)) {
    throw new PanelError(
      `The plan "${row.title}" (${row.id}) has the state "${row.state}", which is not one of: ` +
        `${PLAN_STATES.join(', ')}. Nothing in Mole Office writes that word, so this row was written by hand.`,
      500,
    )
  }
  return {
    id: row.id,
    title: row.title,
    state: row.state,
    readAt: row.readAt,
    readByAgent: row.readByAgent,
    readUnderGrant: row.readUnderGrant,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    movedFromDraft: row.movedFromDraft,
  }
}
