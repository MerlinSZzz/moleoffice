// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { sql } from 'drizzle-orm'
import { check, index, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { aPartTable, theFillGivenBy } from '../part-tables.ts'
import { agents } from '../schema.ts'

/**
 * ONE ROW FOR EACH CHANGE OF WHO ANSWERS FOR AN AGENT, its starter. Migration 0331. The registry row keeps only the
 * starter it has now (agents.started_by_kind and started_by_id), so this table is the history of it.
 * src/server/lib/agent-starter.ts writes it, by the person's press on the agent's page.
 *
 * `from` is the starter before the change, or null where the row had none. `to` is the new starter. `asked_by` is who
 * pressed: the person, or inside a test world the agent that holds the person's authority there. `because` is the
 * reason they gave.
 *
 * A row is in one of four states. 'applied': the registry row and the agent's records name `to`, from `applied_at`.
 * 'waiting': the change waits for the agent's runs to end. 'withdrawn': the person took a waiting change back.
 * 'refused': a waiting change failed the checks when it was to be applied, and `refused_because` says why. Only
 * 'applied' is written today: a press for an agent with a run that has not ended is refused unless it says to make the
 * change at once, and the runs it went on with are kept in `runs_not_ended`, as a JSON list of run ids.
 */
export const agentStarterChanges = aPartTable(sqliteTable('agent_starter_changes', {
  id: text('id').primaryKey(),
  agentId: text('agent_id').notNull().references(() => agents.id),
  fromKind: text('from_kind'),
  fromId: text('from_id'),
  toKind: text('to_kind').notNull(),
  toId: text('to_id').notNull(),
  askedByKind: text('asked_by_kind').notNull(),
  askedById: text('asked_by_id').notNull(),
  because: text('because').notNull(),
  askedAt: text('asked_at').notNull(),
  state: text('state').notNull(),
  appliedAt: text('applied_at'),
  refusedBecause: text('refused_because'),
  runsNotEnded: text('runs_not_ended').notNull(),
}, (t) => [
  index('agent_starter_changes_agent_idx').on(t.agentId, t.askedAt),
  // ONE WAITING CHANGE PER AGENT. A second press while one waits makes that one at once; it never adds a second.
  uniqueIndex('agent_starter_changes_one_waiting_idx').on(t.agentId).where(sql`${t.state} = 'waiting'`),
  check('agent_starter_changes_state', sql`${t.state} IN ('waiting', 'applied', 'withdrawn', 'refused')`),
  check(
    'agent_starter_changes_kinds',
    sql`(${t.fromKind} IS NULL AND ${t.fromId} IS NULL OR ${t.fromKind} IN ('person', 'agent') AND ${t.fromId} IS NOT NULL) AND ${t.toKind} IN ('person', 'agent') AND ${t.askedByKind} IN ('person', 'agent')`,
  ),
  check('agent_starter_changes_a_change', sql`${t.fromKind} IS NULL OR ${t.fromKind} <> ${t.toKind} OR ${t.fromId} <> ${t.toId}`),
  check('agent_starter_changes_not_itself', sql`${t.toKind} <> 'agent' OR ${t.toId} <> ${t.agentId}`),
  check('agent_starter_changes_because', sql`trim(${t.because}) <> ''`),
  check('agent_starter_changes_applied', sql`(${t.state} = 'applied') = (${t.appliedAt} IS NOT NULL)`),
  check('agent_starter_changes_refused', sql`(${t.state} = 'refused') = (${t.refusedBecause} IS NOT NULL)`),
]), {
  exported: true,
  restore: 'compared',
  noProjectBecause: 'a starter is on the registry row, and the agent registry is shared by every project',
  fillForTheProof: theFillGivenBy('src/server/lib/agent-starter.ts'),
})
