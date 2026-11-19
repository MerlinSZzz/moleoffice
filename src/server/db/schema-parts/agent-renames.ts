// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { sql } from 'drizzle-orm'
import { check, index, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { aPartTable, theFillGivenBy } from '../part-tables.ts'
import { agents } from '../schema.ts'

/**
 * ONE ROW FOR EACH NEW NAME AN AGENT WAS GIVEN OR PROPOSED. Migration 0319, and 0321 for the grant
 * a raised secretary answered under. The handle and the id
 * never change; the name is the display name lists and pages show. src/server/lib/agent-renames.ts
 * writes the proposals and their answers, and src/server/lib/agent-names.ts the person's own rename.
 *
 * A row is one of two ways. 'proposed': the agent, an agent up its chain of starters or the person proposed the name
 * with a reason; the row names the approver it waits for, and it waits while `answer` is null, until the approver or
 * the person approves or refuses it with a reason of their own. 'at once': the person renamed the agent through the
 * participants PATCH door, so the person is the proposer, the approver and the one who answered, the answer is
 * 'approved' at the same moment, and the reason is the one the person gave there, or null.
 *
 * `answered_under_grant` is the id of the grant a secretary the person has raised answered a new name under, when the
 * new name waited for the person. It is null for every other answer, for a new name that still waits, and for every row
 * written before migration 0321.
 */
export const agentRenames = aPartTable(sqliteTable('agent_renames', {
  id: text('id').primaryKey(),
  agentId: text('agent_id').notNull().references(() => agents.id),
  way: text('way').notNull(),
  oldName: text('old_name').notNull(),
  newName: text('new_name').notNull(),
  proposedByKind: text('proposed_by_kind').notNull(),
  proposedById: text('proposed_by_id').notNull(),
  proposedBecause: text('proposed_because'),
  proposedAt: text('proposed_at').notNull(),
  approverKind: text('approver_kind').notNull(),
  approverId: text('approver_id').notNull(),
  toldMessageId: text('told_message_id'),
  answer: text('answer'),
  answeredByKind: text('answered_by_kind'),
  answeredById: text('answered_by_id'),
  answeredBecause: text('answered_because'),
  answeredAt: text('answered_at'),
  answeredUnderGrant: text('answered_under_grant'),
}, (t) => [
  index('agent_renames_agent_idx').on(t.agentId, t.proposedAt),
  // ONE WAITING NEW NAME PER AGENT. A second proposal while one waits is refused by the writer, and this holds it.
  uniqueIndex('agent_renames_one_waiting_idx').on(t.agentId).where(sql`${t.answer} IS NULL`),
  check('agent_renames_way', sql`${t.way} IN ('proposed', 'at once')`),
  check('agent_renames_names', sql`${t.oldName} <> ${t.newName} AND trim(${t.newName}) = ${t.newName} AND ${t.newName} <> ''`),
  check('agent_renames_kinds', sql`${t.proposedByKind} IN ('person', 'agent') AND ${t.approverKind} IN ('person', 'agent')`),
  check(
    'agent_renames_answer',
    sql`(${t.answer} IS NULL AND ${t.answeredByKind} IS NULL AND ${t.answeredById} IS NULL AND ${t.answeredBecause} IS NULL AND ${t.answeredAt} IS NULL) OR (${t.answer} IN ('approved', 'refused') AND ${t.answeredByKind} IN ('person', 'agent') AND ${t.answeredById} IS NOT NULL AND ${t.answeredAt} IS NOT NULL)`,
  ),
  check(
    'agent_renames_proposed',
    sql`${t.way} <> 'proposed' OR (${t.proposedBecause} IS NOT NULL AND (${t.answer} IS NULL OR ${t.answeredBecause} IS NOT NULL))`,
  ),
  check(
    'agent_renames_at_once',
    sql`${t.way} <> 'at once' OR (${t.proposedByKind} = 'person' AND ${t.approverKind} = 'person' AND ${t.approverId} = ${t.proposedById} AND ${t.answer} = 'approved' AND ${t.answeredByKind} = 'person' AND ${t.answeredById} = ${t.proposedById} AND ${t.answeredBecause} IS NULL AND ${t.answeredAt} = ${t.proposedAt} AND ${t.toldMessageId} IS NULL)`,
  ),
  check('agent_renames_not_its_own', sql`${t.answeredByKind} IS NOT 'agent' OR ${t.answeredById} <> ${t.agentId}`),
]), {
  exported: true,
  restore: 'compared',
  noProjectBecause: 'a rename is of an agent, and the agent registry is shared by every project',
  fillForTheProof: theFillGivenBy('src/server/lib/agent-names.ts'),
})
