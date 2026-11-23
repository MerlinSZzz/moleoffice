// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { sql } from 'drizzle-orm'
import { check, index, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { aPartTable, theFillGivenBy } from '../part-tables.ts'
import { agents } from '../schema.ts'

/**
 * ONE ROW FOR EACH HAND-OVER OF AN AGENT TO ANOTHER OWNER AT THE OWNER DOOR. Migration 0356. The registry row keeps
 * only the owner it has now (agents.owner_kind and owner_id), so this table is the history of it, from the moment in
 * installation.owner_changes_since. src/server/lib/agent-owner-changes.ts writes it in the same write as the owner.
 *
 * `from` is the owner before, kind and id, exactly as the registry row held them: null where it held none, and kept as
 * it was where it cannot be read, so it has no check on its kind. `to` is the new owner. `made_by` is who made the
 * hand-over: the person, or an agent. `under_grant` is the grant an agent acted under, null when none was used.
 * `because` is the reason they gave. A hand-over to the owner the agent already has is kept like any other. An import
 * that names another owner writes no row.
 */
export const agentOwnerChanges = aPartTable(sqliteTable('agent_owner_changes', {
  id: text('id').primaryKey(),
  agentId: text('agent_id').notNull().references(() => agents.id),
  fromKind: text('from_kind'),
  fromId: text('from_id'),
  toKind: text('to_kind').notNull(),
  toId: text('to_id').notNull(),
  madeByKind: text('made_by_kind').notNull(),
  madeById: text('made_by_id').notNull(),
  underGrant: text('under_grant'),
  because: text('because').notNull(),
  madeAt: text('made_at').notNull(),
}, (t) => [
  index('agent_owner_changes_agent_idx').on(t.agentId, t.madeAt),
  check('agent_owner_changes_kinds', sql`${t.toKind} IN ('person', 'agent') AND ${t.madeByKind} IN ('person', 'agent')`),
  check('agent_owner_changes_ids', sql`trim(${t.toId}) <> '' AND trim(${t.madeById}) <> ''`),
  check('agent_owner_changes_because', sql`trim(${t.because}) <> ''`),
]), {
  exported: true,
  restore: 'compared',
  noProjectBecause: 'an owner is on the registry row, and the agent registry is shared by every project',
  fillForTheProof: theFillGivenBy('src/server/lib/agent-owner-changes.ts'),
})
