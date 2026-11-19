// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { sql } from 'drizzle-orm'
import { index, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { aPartTable } from '../part-tables.ts'
import { workspaces } from './workspaces.ts'

const existingArchive = { existingArchive: true } as const


export const readinessChecklists = aPartTable(sqliteTable(
  'readiness_checklists',
  {
    /** nanoid, so one checklist can be cited. */
    id: text('id').primaryKey(),
    /** The project it was raised in. */
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    /** Which gated operation, by its name in src/server/lib/readiness.ts. */
    operation: text('operation').notNull(),
    /** The operation's fixed inputs, as JSON, checked by that operation before the row was written. */
    inputs: text('inputs').notNull(),
    /** A hash of the operation and its inputs: what every signature on this checklist was given on. */
    onWhat: text('on_what').notNull(),
    /** The sentence a signer reads, written by the office from the operation and its inputs. */
    shows: text('shows').notNull(),
    /** How far the operation reaches, worked out by the office: `a-group` or `everyone`. */
    level: text('level').notNull(),
    /** Who must sign, worked out by the office when it was raised, as a JSON list of `{kind, id, why}`. */
    signers: text('signers').notNull(),
    /** `person` or `agent`, and the id in that registry: who raised it. */
    raisedByKind: text('raised_by_kind').notNull(),
    raisedById: text('raised_by_id').notNull(),
    /** The raiser's own words about why, or NULL. */
    because: text('because'),
    /** `waiting`, `ran`, `could-not`, `cancelled` or `expired`. */
    state: text('state').notNull(),
    /** LOCAL wall clock. No SQL default, for the reason `reader_anchors` gives. */
    raisedAt: text('raised_at').notNull(),
    /** When it stops waiting if not everyone has signed, LOCAL wall clock. */
    endsAt: text('ends_at').notNull(),
    /** When it stopped waiting, LOCAL wall clock, or NULL while it waits. */
    closedAt: text('closed_at'),
    /** Who closed it, or NULL while it waits or when the office closed it on its own (it ran, or the time ran out). */
    closedByKind: text('closed_by_kind'),
    closedById: text('closed_by_id'),
    /** What the operation did, or why it did not run, or NULL while it waits. */
    outcome: text('outcome'),
  },
  (t) => [
    // THE GATE'S LOOKUP: at most one checklist waits for one operation on one target. Same words as the migration.
    uniqueIndex('readiness_checklists_one_waiting_idx').on(t.onWhat).where(sql`state = 'waiting'`),
    index('readiness_checklists_state_idx').on(t.state, t.raisedAt),
  ],
), existingArchive)
