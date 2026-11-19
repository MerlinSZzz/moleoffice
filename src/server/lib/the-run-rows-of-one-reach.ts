// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `theRunRowsOfOneReach` was moved byte for byte out of src/server/lib/worker.ts, with no change of behaviour.
 * `aRunMayServe` was moved byte for byte out of src/server/lib/worker.ts, with no change of behaviour.
 * `theRunRowsOfTheTwoHalves` was moved byte for byte out of src/server/lib/worker.ts, with no change of behaviour.
 * `runRowsWhere` was moved byte for byte out of src/server/lib/worker.ts, with no change of behaviour.
 * `ROW` was moved byte for byte out of src/server/lib/worker.ts, with no change of behaviour.
 * `IS_RUNNING` was moved byte for byte out of src/server/lib/worker.ts, with no change of behaviour.
 * `HOLDS_A_MESSAGE_TO_HAND_OVER` was moved byte for byte out of src/server/lib/worker.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import { sqlite, db } from '../db/client.ts'
import { theFiledAliasesReadOnce, type TheFiledAliases } from './registry-aliases/runs.ts'
import type { Row } from './worker.ts'
import { eq, sql, type SQL, and, isNull } from 'drizzle-orm'
import { agentRecords, records, ONE_KIND_WRITTEN_OUT, STORED_FIELDS } from '../db/schema.ts'
import { theAgentWithThisId } from './agent-references.ts'
import { NEWEST_SESSION_FIRST } from '../db/newest-session-first.ts'

/**
 * THE RUN ROWS OF ONE PROJECT THAT ONE AGENT'S REACH READS, newest first: every row whose record says `running`, and
 * every row that holds a message to hand over, of those that may serve the agent (`aRunMayServe`).
 *
 * WHY THESE ROWS GIVE THE SAME ANSWER AS EVERY RUN ROW. `theAnsweringReading` reads rows in three places, and each keeps
 * only rows that serve the agent asked about. `theRunRowServing` keeps a running row of the agent, and every such row is
 * in the first half. The waiting runs and the conversation a message picks up are read from the rows that hold a message
 * (`runRows`), and every such row of the agent is in the second half. A conversation is named by its agent as well as
 * its own id, so a row of another agent cannot change what they say about this one. The order is `everyRunRow`'s, and
 * each reader takes the first row it keeps, so it takes the same row.
 *
 * WHY IT EXISTS. A message to an agent read every run row of the project to decide the addressee's reach: 7,700 rows,
 * 84 ms inside SQLite, on the made-up office of the live counts (round 36 of wave 13u). The check before an agent's send
 * (`whatStopsAMessageTo` in lib/messages.ts) asks it too, when the setting that refuses an agent nothing answers as is
 * on: that check read every running run of the project, 1,226 rows on the same office (round 37 of wave 13u).
 *
 * WHY ONE STATEMENT OF TWO HALVES. Asked as one condition with an `or`, SQLite read every session record by the index
 * on the kind. Each half is answered by its own partial index, and the rows are read once, by their ids, in one order.
 */
export function theRunRowsOfOneReach(agentId: string, workspaceId: string, aliases: TheFiledAliases = theFiledAliasesReadOnce(sqlite)): Row[] {
  return theRunRowsOfTheTwoHalves(workspaceId, aRunMayServe(agentId, aliases))
}
/**
 * A RUN WHOSE `servingAgentId` OR `servingAgent` HOLDS THIS AGENT'S ID, AN ALIAS FILED FOR IT, ITS HANDLE OR THE ID OF ONE
 * OF ITS RECORDS; `theRunRowsThatMayServe` says why that is enough. A run stored before an alias was filed holds the old
 * id. With no alias filed the statement is the one it was.
 */
export function aRunMayServe(agentId: string, aliases: TheFiledAliases): SQL {
  const names = new Set<string>([agentId, ...aliases.everyIdOf(agentId)])
  const handle = theAgentWithThisId(sqlite, agentId)?.handle
  if (handle !== undefined && handle !== '') names.add(handle)
  for (const row of db.select({ recordId: agentRecords.recordId }).from(agentRecords).where(eq(agentRecords.agentId, agentId)).all()) {
    names.add(row.recordId)
  }
  const holds = (field: string, name: string): SQL =>
    sql`instr(coalesce(json_extract(${records.data}, ${field}), ''), ${name}) > 0`
  // THE SAME WORDS `or` WRITES FOR TWO OR MORE CONDITIONS, and there are always two for each name. `or` may answer
  // nothing, for no conditions, and this is written into a statement whole.
  return sql`(${sql.join(
    [...names].flatMap((name) => [holds('$.servingAgentId', name), holds('$.servingAgent', name)]),
    sql` or `,
  )})`
}
/** The two halves above, of the runs that may serve one agent (`may`), or of every agent's runs. */
export function theRunRowsOfTheTwoHalves(workspaceId: string, may: SQL | undefined): Row[] {
  const ids = (condition: SQL): SQL =>
    sql`select ${records.id} from ${records} where likely(${ONE_KIND_WRITTEN_OUT.session}) and +${records.workspaceId} = ${workspaceId} and ${records.deletedAt} is null and ${condition}${may === undefined ? sql`` : sql` and ${may}`}`
  return runRowsWhere(workspaceId, sql`${records.id} in (${ids(IS_RUNNING)} union all ${ids(HOLDS_A_MESSAGE_TO_HAND_OVER)})`)
}
/**
 * `everyRunRow` WITH ONE MORE CONDITION ON THE ROW, for a reader that would skip every other row.
 * The same rows, left out where the condition is false, in the same order.
 *
 * `indexed` IS A CONDITION AN INDEX ANSWERS BETTER THAN THE KIND OR THE PROJECT: one that one of the
 * indexes of migration 0199 answers, or the record's id, which the primary key answers. Those
 * indexes hold only sessions, and SQLite uses one only for a query that names the kind in the same
 * words, so the kind is then written out rather than passed as a value, inside `likely`, which tells
 * SQLite that the kind leaves out few rows. The project is asked with a `+` in front, which tells
 * SQLite not to use an index for it. Without those two, SQLite chose the index on the kind or on the
 * project and read every session record of the project. With the id, SQLite finds the one row by
 * the primary key and tests the kind, the project and `deleted_at` on that row; that was its plan on
 * a copy of the owner's database on 17 October 2026.
 */
export function runRowsWhere(workspaceId: string | undefined, indexed: SQL | undefined): Row[] {
  const kind = indexed === undefined ? eq(records.kind, 'session') : sql`likely(${ONE_KIND_WRITTEN_OUT.session})`
  const project =
    workspaceId === undefined ? undefined : indexed === undefined ? eq(records.workspaceId, workspaceId) : sql`+${records.workspaceId} = ${workspaceId}`
  return db
    .select(ROW)
    .from(records)
    .where(and(kind, project, isNull(records.deletedAt), indexed))
    .orderBy(...NEWEST_SESSION_FIRST)
    .all()
}
export const ROW = {
  id: records.id,
  workspaceId: records.workspaceId,
  kind: records.kind,
  title: records.title,
  data: records.data,
  createdAt: records.createdAt,
} as const
/** A RUN WHOSE RECORD SAYS `running`, asked in the words of the index `records_session_running_idx`, from `STORED_FIELDS`. */
export const IS_RUNNING = sql`${STORED_FIELDS.sessionIsRunning(records.data)} = 1`
/**
 * A RUN THAT HOLDS A MESSAGE TO HAND OVER, asked in the words of the index
 * `records_session_delivering_message_idx`, from `STORED_FIELDS`, so SQLite uses it. In SQLite every
 * non-empty text sorts after the empty text, and so do an object and a list, which come back as
 * text; a number, null and the empty text sort before it. So this keeps every row whose
 * `deliveringMessage` is a non-empty string, and a few more that `runRows` then drops. A range is
 * asked rather than "is not null", because SQLite uses the index for the range. `unlikely` tells
 * SQLite that few rows pass, and without it SQLite read the whole table instead.
 */
export const HOLDS_A_MESSAGE_TO_HAND_OVER = sql`unlikely(${STORED_FIELDS.sessionDeliveringMessage(records.data)} > '')`
