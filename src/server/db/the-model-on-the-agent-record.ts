// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `theModelOnTheAgentRecord` was moved byte for byte out of src/server/lib/participants.ts, with no change of behaviour.
 * `theRuntimeForAgentStatement` was moved byte for byte out of src/server/lib/participants.ts, with no change of behaviour.
 * `NEWEST_RECORD_FIRST` was moved byte for byte out of src/server/lib/participants.ts, with no change of behaviour.
 * `RUNTIME_FOR_AGENT` was moved byte for byte out of src/server/lib/participants.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import { aHarnessWithNoAdapter, declaredRuntimeOrNull } from '@shared/participants.ts'
import { sqlite } from './client.ts'

/**
 * THE MODEL THIS AGENT'S RUNS GET, read from its agent records beside the runtime. Criterion U2.
 *
 * ONE AGENT, ONE OWN MODEL, WHICHEVER PROJECT A RECORD OF IT IS IN. The model is read from the agent's newest live
 * record that names one, not from its newest record. Problem BfidkGT3LOzh: registering an agent in a second project
 * writes a newer record there with no model, and reading only the newest record then hid the model set on its
 * profile, in every project, with nothing said. Of the problem's three ways this is the one that keeps the record
 * the one store and needs no project the profile's door does not have.
 *
 * `record` and `runtime` are still the NEWEST record's, the reading `runtimeOfTheAgentRecord` uses: a model is
 * written onto that record (`setAnAgentsRunModel`), so what is written is what is read next. `modelIsFor` is the
 * runtime on the record that holds the model, which is what a run's runtime is compared with. `holding` names every
 * live record of the agent that names a model or an effort, so a clear can clear them all and no older one comes back.
 * `harness` is the newest record's word when it names a harness the office has no adapter for, and null otherwise:
 * such a harness chooses its model itself.
 *
 * ALL OF IT COMES FROM THE ONE STATEMENT `runtimeOfTheAgentRecord` READS, so the queue's one pass prepares no new
 * statement to ask an agent's model. Round 36
 * read the model through a second statement, and the merge queue bounced it (entry Q6kgjrkJo_sj).
 *
 * Null means the agent has no record; `model` null means no record of it names a model, which is a real answer and
 * not a default. A stored model that is not a non-empty string throws: the record kind declares a string, so anything
 * else is a broken store and not an absent setting.
 */
export function theModelOnTheAgentRecord(agentId: string): {
  record: string
  runtime: string | null
  model: string | null
  variant: string | null
  modelIsFor: string | null
  holding: string[]
  harness: string | null
} | null {
  const rows = theRuntimeForAgentStatement().all(agentId) as { id: string; runtime: unknown; model: unknown; variant: unknown }[]
  const newest = rows[0]
  if (newest === undefined) return null
  const read = (value: unknown, name: string): string | null => {
    if (value === null || value === undefined) return null
    if (typeof value !== 'string' || value.trim() === '') throw new Error(`Agent ${agentId}'s record holds a ${name} that is not a name.`)
    return value
  }
  const names = (value: unknown): boolean => value !== null && value !== undefined
  const named = rows.filter((row) => names(row.model) || names(row.variant))
  const holder = named.find((row) => names(row.model))
  return {
    record: newest.id,
    runtime: declaredRuntimeOrNull(newest.runtime),
    model: holder === undefined ? null : read(holder.model, 'model'),
    variant: holder === undefined ? null : read(holder.variant, 'variant'),
    modelIsFor: holder === undefined ? null : declaredRuntimeOrNull(holder.runtime),
    holding: named.map((row) => row.id),
    harness: aHarnessWithNoAdapter(newest.runtime),
  }
}
export function theRuntimeForAgentStatement(): { get: (agentId: string) => unknown; all: (agentId: string) => unknown[] } {
  const kept = RUNTIME_FOR_AGENT.get(sqlite)
  if (kept !== undefined) return kept
  const made = sqlite.prepare(
    // EVERY LIVE RECORD OF THE AGENT, NEWEST FIRST. `get` is the newest, which is the runtime; the model, the variant
    // and the record's id ride on the same rows for `theModelOnTheAgentRecord`, which reads them `all`.
    "SELECT r.id AS id, json_extract(r.data, '$.runtime') AS runtime, json_extract(r.data, '$.model') AS model, " +
      "json_extract(r.data, '$.variant') AS variant FROM agent_records m " +
      'JOIN records r ON r.id = m.record_id ' +
      `WHERE m.agent_id = ? AND r.deleted_at IS NULL ORDER BY ${NEWEST_RECORD_FIRST}`,
  )
  RUNTIME_FOR_AGENT.set(sqlite, made)
  return made
}
/**
 * THE NEWEST LIVE RECORD FIRST, the order both readers of an agent's runtime ask for. Written once, so the reader of one
 * agent and the reader of every agent cannot come to pick different records.
 */
export const NEWEST_RECORD_FIRST = 'r.created_at DESC, r.rowid DESC'
/**
 * ONE PREPARED STATEMENT PER DATABASE HANDLE. Same pattern as `theRecordForAgentStatement` above:
 * this is asked once per agent by `asAgent`, so the parse is shared even though the query still
 * runs once per agent.
 */
export const RUNTIME_FOR_AGENT = new WeakMap<object, { get: (agentId: string) => unknown; all: (agentId: string) => unknown[] }>()
