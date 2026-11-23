// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `theseAgentsOnly` was moved byte for byte out of src/server/lib/presence.ts, with no change of behaviour.
 * `theRecordsOfTheseAgents` was moved byte for byte out of src/server/lib/presence.ts, with no change of behaviour.
 * `theRecordsByAgent` was moved byte for byte out of src/server/lib/presence.ts, with no change of behaviour.
 * `aSessionThatCouldBeOneOf` was moved byte for byte out of src/server/lib/presence.ts, with no change of behaviour.
 * `theSessionCandidates` was moved byte for byte out of src/server/lib/presence.ts, with no change of behaviour.
 * `theProcessRowStatements` was moved byte for byte out of src/server/lib/presence.ts, with no change of behaviour.
 * `PROCESS_ROWS` was moved byte for byte out of src/server/lib/presence.ts, with no change of behaviour.
 * `theCandidateBuckets` was moved byte for byte out of src/server/lib/presence.ts, with no change of behaviour.
 * `theRowCouldBeOneOf` was moved byte for byte out of src/server/lib/presence.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import type { TheFiledAliases } from '../lib/registry-aliases/runs.ts'
import type { TheseAgentsOnly } from './types/presence.ts'
import { sql, type SQL, type SQLWrapper } from 'drizzle-orm'
import { records, STORED_FIELDS } from './schema.ts'
import { sqlite } from './client.ts'

/**
 * THE READING OF THESE AGENTS ONLY, from their registry ids, the aliases filed for them and their handles: the session
 * rows that could be theirs are those `aSessionThatCouldBeOneOf` keeps for their ids, those aliases, their handles and
 * the ids of all their own records. A run stored before an alias was filed holds the old id, and a reading of every run
 * counts it as the agent's (wave 13y round 108). The office scene's reading of a list of agents and the answering look at
 * named agents both ask it, so the two cannot narrow by different needles. `recordsOf` is those records by agent, and
 * `needles` all four together, in that order.
 */
export function theseAgentsOnly(ids: readonly string[], handles: readonly string[], aliases: TheFiledAliases): TheseAgentsOnly & { recordsOf: Map<string, Set<string>>; needles: string[] } {
  const recordsOf = theRecordsOfTheseAgents(ids)
  const needles = [...ids, ...ids.flatMap((id) => aliases.everyIdOf(id).slice(1)), ...handles, ...[...recordsOf.values()].flatMap((held) => [...held])]
  return { ids, recordsOf, needles, sessions: (workspaceId) => aSessionThatCouldBeOneOf(workspaceId, needles) }
}
/**
 * THESE AGENTS' OWN RECORD IDS, in every project, by registry id: what `theUnreleasedProcessRows` reads for every agent,
 * read for these alone (wave 13y round 51). An agent with no record is absent, as it is there.
 */
export function theRecordsOfTheseAgents(ids: readonly string[]): Map<string, Set<string>> {
  return theRecordsByAgent(theProcessRowStatements().agentRecordsOf.all(JSON.stringify(ids)))
}
/** Each agent's own record ids, from rows of `agent_records`. */
export function theRecordsByAgent(rows: readonly unknown[]): Map<string, Set<string>> {
  const recordsOf = new Map<string, Set<string>>()
  for (const one of rows as { agent: string; record: string }[]) {
    const held = recordsOf.get(one.agent)
    if (held === undefined) recordsOf.set(one.agent, new Set([one.record]))
    else held.add(one.record)
  }
  return recordsOf
}
/**
 * THE SESSION RECORDS OF ONE PROJECT THAT COULD BE A RUN OF ONE OF THESE AGENTS, as a condition on a row's id, for a
 * reading of some agents only (wave 13y round 51). `needles` are the agents' ids, filed aliases, handles and the ids of
 * all their own records. The rows are found through the indexes of migration 0286 (`theSessionCandidates`), and the
 * check `theRowCouldBeOneOf` runs on the fallback bucket's rows alone; `THE_SESSIONS_THAT_COULD_BE_THEIRS` says why the
 * other buckets' rows need no check. The office scene's read of the sessions asks the same buckets and the same check, so
 * the two cannot keep different rows. Wave 13y round 107: the answering look at named agents read every run of the
 * project, 85 ms of a hold on the made-up office at the 22 October scale, and these rows are 4 runs read in under 1 ms.
 *
 * THIS NARROWS AND DOES NOT DECIDE, as `sessionRecordsThatCouldBeOf` below does not. Each reader of which agent a run is
 * compares a stored string with an agent's id, handle or record id, exactly or after trimming it: the two serving fields
 * (`theAgentARunServes`), the project's `ranAs` binding (`ranAsIn`) and the terminal (`theTerminalThisAgentWorksIn`). So
 * a row is kept when `servingAgentId`, `servingAgent` or the agent of the one binding in `ranAs` is one of the needles,
 * and, when `ranAs` holds more than one binding or is not a list, when any string inside it is one. It is kept as
 * well when that value holds any character but a letter, a digit, `-` and `_`, because trimming changes only such a
 * value, and the readers then decide. A value of those characters alone that is not a needle names none of these
 * agents, and a number or a missing value names nobody. A row whose data is not valid JSON is kept, so the read fails on
 * it as it does over every row.
 */
export function aSessionThatCouldBeOneOf(workspaceId: string, needles: readonly string[]): SQL {
  const among = sql`(select value from json_each(${JSON.stringify(needles)}))`
  return theSessionCandidates(workspaceId, among, theRowCouldBeOneOf(among, sql.raw('candidate.data')))
}
/**
 * Reach ordinary references by their indexed values, and unusual rows by their indexed fallback bucket. The outer IN
 * keeps a row once when several references match. UNION ALL avoids sorting each bucket to merge
 * distinct ids. `couldBeOneOf` narrows the fallback bucket's rows alone; the read above says
 * why the other buckets' rows need no narrowing. The unary pluses in the outer read keep SQLite on the candidate primary
 * keys, rather than a project's or kind's history index.
 *
 * No ownership rule is repeated here. Any serving value a reader trims is in the odd-character bucket; a needed
 * binding is either the single first binding or in the multiple-binding bucket. Malformed JSON stays a candidate and
 * fails on decoding as before. Cost can still grow with unusual rows; arbitrary binding indexes need a write-side
 * relation, which this round does not add.
 */
export function theSessionCandidates(workspaceId: string, among: SQL, couldBeOneOf: SQL, bindingsOnly = false): SQL {
  // THE BINDINGS ALONE: the first binding and the fallback bucket, which between them hold every run `ranAsIn` can find
  // for a needle (`aRunRanAsOneOf`).
  const reads = theCandidateBuckets(sql.raw('candidate.data'), among, couldBeOneOf).map(([test, index], n) => n < 2 && bindingsOnly ? null : sql`SELECT candidate.id FROM records AS candidate INDEXED BY ${sql.raw(index)}
    WHERE candidate.kind = 'session' AND ${test}
      AND candidate.workspace_id = ${workspaceId} AND candidate.deleted_at IS NULL`).filter((read) => read !== null)
  return sql`${records.id} IN (${sql.join(reads, sql` UNION ALL `)})`
}
export function theProcessRowStatements(): { rows: { all: () => unknown[] }; agentRecords: { all: () => unknown[] }; agentRecordsOf: { all: (ids: string) => unknown[] } } {
  const kept = PROCESS_ROWS.get(sqlite)
  if (kept !== undefined) return kept
  const run = "s.kind = 'session' AND json_valid(s.data)"
  const made = {
    rows: sqlite.prepare(
      `SELECT r.id AS id, r.registered_by AS registeredBy, s.data AS data, CASE WHEN ${run} THEN 1 ELSE 0 END AS isRun, ` +
        `CASE WHEN ${run} THEN json_extract(s.data, '$.servingAgentId') END AS servingAgentId, ` +
        `CASE WHEN ${run} THEN json_extract(s.data, '$.servingAgent') END AS servingAgent ` +
        "FROM session_resources r LEFT JOIN records s ON s.id = r.session_record_id " +
        "WHERE r.type = 'process' AND r.released_at IS NULL",
    ),
    agentRecords: sqlite.prepare('SELECT agent_id AS agent, record_id AS record FROM agent_records'),
    agentRecordsOf: sqlite.prepare('SELECT agent_id AS agent, record_id AS record FROM agent_records WHERE agent_id IN (SELECT value FROM json_each(?))'),
  }
  PROCESS_ROWS.set(sqlite, made)
  return made
}
/**
 * ONE PAIR OF PREPARED STATEMENTS PER DATABASE HANDLE, NOT ONE PER CALL. Same pattern as
 * `theAgentByHandleStatement` in participants.ts. The first reads the `session_resources` rows with
 * their session records joined, which no index can serve, so it is run once for a whole roster.
 */
export const PROCESS_ROWS = new WeakMap<object, { rows: { all: () => unknown[] }; agentRecords: { all: () => unknown[] }; agentRecordsOf: { all: (ids: string) => unknown[] } }>()
/** The four buckets: each one's test of the row whose data is `data`, and the index that holds that test. */
export function theCandidateBuckets(data: SQLWrapper, among: SQL, couldBeOneOf: SQL): readonly (readonly [SQL, string])[] {
  const lookups = [
    [STORED_FIELDS.sessionServingAgentId, 'records_session_serving_agent_id_idx'],
    [STORED_FIELDS.sessionServingAgent, 'records_session_serving_agent_idx'],
    [STORED_FIELDS.sessionFirstBindingAgent, 'records_session_first_binding_agent_idx'],
    [STORED_FIELDS.sessionReferenceNeedsFallback, 'records_session_reference_fallback_idx'],
  ] as const
  return lookups.map(([field, index], n) => [n === 3 ? sql`${field(data)} = 1 AND ${couldBeOneOf}` : sql`${field(data)} IN ${among}`, index] as const)
}
/**
 * The check above, of the row whose data is `data`, with the needles as the values `among` selects: a serving field or
 * any string inside `ranAs` is a needle or holds a character a reader may trim.
 */
export function theRowCouldBeOneOf(among: SQL, data: SQLWrapper): SQL {
  const couldBe = (value: SQL) => sql`(${value} in ${among} or ${value} glob '*[^A-Za-z0-9_-]*')`
  const inRanAs = sql`exists (select 1 from json_tree(${data}, '$.ranAs') where type = 'text' and ${couldBe(sql`atom`)})`
  return sql`(case when json_valid(${data}) then (${couldBe(sql`json_extract(${data}, '$.servingAgentId')`)} or ${couldBe(sql`json_extract(${data}, '$.servingAgent')`)} or ${inRanAs}) else 1 end)`
}
