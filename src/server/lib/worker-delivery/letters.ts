// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** The record sequence is the forward-only boundary, including letters sent in the launch's same second. */
import { and, eq, isNull, sql, type SQL } from 'drizzle-orm'
import { db, sqlite } from '../../db/client.ts'
import { records, STORED_FIELDS } from '../../db/schema.ts'
import { type RegisteredAgent } from '../participants.ts'
import { readParticipant } from '../../db/read-participant.ts'
import { whyThisAgentCannotBeReached } from '../worker.ts'
import { theAgentARunServes } from '../the-agent-a-run-serves.ts'
import { routedOf, sameParticipant, writtenInOf } from '../../../shared/messages.ts'
import { MESSAGE_CENTRE } from '../../../shared/workspaces.ts'
import type { ALetterToARetiredAgent } from '../deadletters.ts'
import type { ParticipantRef } from '../../../shared/participants.ts'
import { CHECKPOINT_LETTERS, CHECKPOINT_RECORD_BYTES, CHECKPOINT_RUNTIMES } from '../../../shared/worker-delivery/contract.mjs'
import { theLastToolRunStillRuns } from '../merge-queue.ts'
import { theOneAgentAStringNames } from '../agent-references.ts'
import { isOneOfTheIds, theFiledAliasesReadOnce, type TheFiledAliases } from '../registry-aliases/runs.ts'

interface Boundary { boundary: number; workspace: string; agent: string }
function boundaries(): Boundary[] {
  return sqlite.prepare(
    "SELECT min(rowid) AS boundary, workspace_id AS workspace, json_extract(data, '$.servingAgentId') AS agent " +
    "FROM records WHERE kind = 'session' AND deleted_at IS NULL AND json_extract(data, '$.extra.officeCheckpoint') = 1 " +
    "AND json_type(data, '$.servingAgentId') = 'text' GROUP BY workspace_id, json_extract(data, '$.servingAgentId')",
  ).all() as Boundary[]
}

/**
 * THE LIVE RUNS OF ONE AGENT IN ONE PROJECT, read through the index on a run's serving id, as the source of a statement.
 * The index is partial to `kind = 'session'`, so the kind is written out in those words: asked with a unary plus, as
 * `theKindOfARowFoundById` asks it, SQLite could not use the index and read every live record of the project, 31 to
 * 35 ms in message-centre on a made-up office at the scale of 22 October 2026, against 0.02 ms through the index. With
 * an alias filed the ids are asked with `IN`, and SQLite then chose the index on the kind and read every run, 14 to
 * 17 ms. `INDEXED BY` holds it to this index, and makes a read SQLite cannot answer from it an error (wave 13s round 185).
 *
 * THE CONDITIONS ARE BUILT OUTSIDE THE TEMPLATE, and the kind is asked with `eq`: a column's kind written into a template
 * is what tests/the-machine-word-gate.test.ts reads as a stored word reaching drawn text. The SQL is the same.
 */
function theRunsOfTheAgentIn(workspaceId: string, agentId: string, aliases: TheFiledAliases): SQL {
  const where = and(
    eq(records.kind, sql`'session'`), isNull(records.deletedAt), eq(records.workspaceId, workspaceId),
    isOneOfTheIds(STORED_FIELDS.sessionServingAgentId(records.data), aliases.everyIdOf(agentId)),
  )
  return sql`${records} INDEXED BY records_session_serving_agent_id_idx WHERE ${where}`
}

/** A run stored under an alias filed for the agent is the agent's run. */
export function hasCheckpointBoundary(agentId: string, workspaceId: string): boolean {
  return db.get(sql`SELECT ${records.id} FROM ${theRunsOfTheAgentIn(workspaceId, agentId, theFiledAliasesReadOnce(sqlite))}
    AND json_extract(${records.data}, '$.extra.officeCheckpoint') = 1 LIMIT 1`) !== undefined
}

/** Strict sending still admits the registered starter's note to its own ended checkpoint worker. */
export function aStartersLetterToAnEndedWorker(sender: ParticipantRef, to: ParticipantRef, workspaceId: string): boolean {
  if (sender.kind !== 'agent' || to.kind !== 'agent') return false
  const worker = readParticipant(to) as RegisteredAgent | null
  if (!worker || worker.retired || worker.role !== 'worker' || typeof worker.runtime !== 'string' || !CHECKPOINT_RUNTIMES.includes(worker.runtime)) return false
  const starter = worker.startedBy
  if (starter?.kind !== 'agent' || theOneAgentAStringNames(sqlite, starter.id)?.id !== sender.id) return false
  // THE LATEST RUN IS THE ONE OF THE LARGEST ROWID, asked by `max` and not by an order: with two ids SQLite sorted
  // the runs in a temporary tree, so the plan with an alias filed was not the plan with none.
  const latest = db.get<{ id: string; runtime: string; enabled: number }>(sql`SELECT ${records.id} AS id,
    json_extract(${records.data}, '$.runtime') AS runtime, json_extract(${records.data}, '$.extra.officeCheckpoint') AS enabled
    FROM ${records} WHERE rowid = (SELECT max(rowid) FROM ${theRunsOfTheAgentIn(workspaceId, to.id, theFiledAliasesReadOnce(sqlite))})`)
  if (!latest || latest.enabled !== 1 || !CHECKPOINT_RUNTIMES.includes(latest.runtime) || theLastToolRunStillRuns(workspaceId, { session: latest.id }) !== null) return false
  return whyThisAgentCannotBeReached(to.id, workspaceId)?.was === 'nothing answering'
}

/** Authenticate the checkpoint from light session fields; narrow in SQL before any message body is built. */
export function checkpointPage(session: string | null | undefined, me: ParticipantRef, workspaceId: string, limit?: number) {
  const unsupported = (because: string) => ({ ids: [] as string[], left: 0, checkpoint: { supported: false, because } })
  if (!session || me.kind !== 'agent') return unsupported('A checkpoint needs its own agent session.')
  const run = sqlite.prepare(
    "SELECT json_extract(data, '$.servingAgentId') AS agent, json_extract(data, '$.state') AS state, " +
    "json_extract(data, '$.extra.officeCheckpoint') AS enabled FROM records " +
    "WHERE id = ? AND kind = 'session' AND workspace_id = ? AND deleted_at IS NULL",
  ).get(session, workspaceId) as { agent: unknown; state: string; enabled: number } | undefined
  const aliases = theFiledAliasesReadOnce(sqlite)
  if (!run || typeof run.agent !== 'string' || aliases.canonicalOf(run.agent) !== aliases.canonicalOf(me.id) || run.state !== 'running' || run.enabled !== 1 || theLastToolRunStillRuns(workspaceId, { session }) === null) {
    return unsupported('This checkpoint has no matching live worker process and opted-in canonical agent session.')
  }
  const boundary = db.get<{ boundary: number }>(sql`SELECT min(rowid) AS boundary FROM ${theRunsOfTheAgentIn(workspaceId, me.id, aliases)}
    AND json_extract(${records.data}, '$.extra.officeCheckpoint') = 1`)!
  // THE DELIVERY ROWS FIRST, by a CROSS JOIN, for the reason written at the queued-letters read of
  // `newCheckpointLetters` below: the count and the page asked the same way started from the messages too.
  const where = " FROM message_delivery d CROSS JOIN records m ON m.id = d.message_id WHERE d.recipient_kind = 'agent' " +
    "AND d.recipient_id = ? AND d.mark = 'queued' AND m.kind = 'message' AND m.deleted_at IS NULL AND m.rowid > ? " +
    "AND (m.workspace_id = ? OR (m.workspace_id = ? AND json_extract(m.data, '$.writtenIn.project') = ?))"
  const args = [me.id, boundary.boundary, workspaceId, MESSAGE_CENTRE, workspaceId]
  const total = (sqlite.prepare('SELECT count(*) AS n' + where).get(...args) as { n: number }).n
  const candidates = sqlite.prepare('SELECT m.id, length(cast(m.data AS BLOB)) AS bytes' + where + ' ORDER BY m.rowid LIMIT ?')
    .all(...args, Math.min(limit ?? CHECKPOINT_LETTERS, CHECKPOINT_LETTERS)) as { id: string; bytes: number }[]
  const ids: string[] = []
  const oversize: string[] = []
  let bytes = 0
  for (const row of candidates) {
    if (row.bytes > CHECKPOINT_RECORD_BYTES) { oversize.push(row.id); continue }
    if (bytes + row.bytes > CHECKPOINT_RECORD_BYTES) break
    ids.push(row.id); bytes += row.bytes
  }
  return { ids, left: total - ids.length, checkpoint: { run: session, agent: me.id, oversize } }
}

/**
 * Only queued letters newer than this agent's first opted-in run are candidates. No historical row is changed. Runs stored
 * under an alias filed for the agent are the agent's runs, so its first run is the earliest under any of its ids.
 */
export function newCheckpointLetters(): ALetterToARetiredAgent[] {
  const found: ALetterToARetiredAgent[] = []
  const earliest = new Map<string, { boundary: number; workspace: string; serving: NonNullable<ReturnType<typeof theAgentARunServes>> }>()
  for (const boundary of boundaries()) {
    const serving = theAgentARunServes({ servingAgentId: boundary.agent })
    if (!serving) continue
    const key = JSON.stringify([boundary.workspace, serving.id])
    const held = earliest.get(key)
    if (held === undefined) earliest.set(key, { boundary: boundary.boundary, workspace: boundary.workspace, serving })
    else held.boundary = Math.min(held.boundary, boundary.boundary)
  }
  for (const boundary of earliest.values()) {
    const serving = boundary.serving
    const to = { kind: 'agent' as const, id: serving.id }
    const addressee = readParticipant(to) as RegisteredAgent | null
    if (!addressee || addressee.retired) continue
    // THE AGENT'S QUEUED DELIVERY ROWS FIRST, each message then found by its id. A CROSS JOIN is what holds SQLite to that
    // order. The office holds no planner statistics, because nothing in it runs ANALYZE, and with a plain JOIN SQLite
    // started from the messages: it walked every message written after the boundary, through the index on the kind,
    // and asked of each one whether it was queued for this agent. On the live office on 12 November 2026 that was
    // 11.1 million messages for 1,173 queued letters, 15.9 of one sweep's 23.6 seconds. On a made-up office shaped like
    // it, the 508 reads of one sweep took 4.7 to 5.0 seconds that way and 15 to 63 ms this way, for the same 2,718 rows.
    // A message has one delivery row for each recipient at most, so the rows found are the same.
    const rows = sqlite.prepare(
      "SELECT m.id, m.workspace_id AS workspace, json_object('sentBy', json_extract(m.data, '$.sentBy'), " +
      "'toGroup', json_extract(m.data, '$.toGroup'), 'routed', json_extract(m.data, '$.routed'), " +
      "'writtenIn', json_extract(m.data, '$.writtenIn')) AS data FROM message_delivery d CROSS JOIN records m ON m.id = d.message_id " +
      "WHERE d.recipient_kind = 'agent' AND d.recipient_id = ? AND d.mark = 'queued' " +
      "AND m.kind = 'message' AND m.deleted_at IS NULL AND m.rowid > ? ORDER BY m.rowid",
    ).all(serving.id, boundary.boundary) as { id: string; workspace: string; data: string }[]
    for (const row of rows) {
      const data = JSON.parse(row.data) as Record<string, any>
      const workspaceId = row.workspace === MESSAGE_CENTRE ? writtenInOf(data)?.project ?? MESSAGE_CENTRE : row.workspace
      if (workspaceId !== boundary.workspace || routedOf(data).some(entry => sameParticipant(entry.for, to))) continue
      const from = data.sentBy
      const sentBy = from && (from.kind === 'person' || from.kind === 'agent') && typeof from.id === 'string' ? from : null
      found.push({ messageId: row.id, workspaceId, to, addressee, sentBy, data })
    }
  }
  return found
}
