// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** The default router's evidence: provider stops, the sandboxes' login's own reading, and an agent's first roll. */
import { and, eq, isNull, sql } from 'drizzle-orm'
import { db, sqlite } from '../db/client.ts'
import { records, STORED_FIELDS, theWordsOfAStoredField } from '../db/schema.ts'
import { theAgentWithThisId } from './agent-references.ts'
import { theRowsInForce } from './the-rows-in-force.ts'
import { theseAgentsOnly } from '../db/these-agents-only.ts'
import { theFiledAliasesReadOnce, type TheFiledAliases } from './registry-aliases/runs.ts'
import { NEWEST_SESSION_FIRST } from '../db/newest-session-first.ts'
import { theAgentARunServes } from './the-agent-a-run-serves.ts'
import { readCastingLabelIds, readCastingOutUntil, readCastingProbability, type CastingLabelDraw, type CastingRow } from '@shared/casting.ts'
import {
  CASTING_ROLL, castingLimitName, castingModelName, parseCastingReset, readCastingRoll, theCastingRoll,
  type CastingLimits, type CastingRollAnswer, type CastingRollRecord, type CastingRollRow, type EarlierCastingRoll,
} from '@shared/casting-roll.ts'
import { theCastingLabelNames } from './casting-labels.ts'
import { THE_LAST_SEVEN_DAYS_MS, aUseInPercent, minute, type OwnEventReading } from '@shared/logins-week.ts'
import { WORKER_RUNS } from '@shared/worker-runs.ts'
import { momentOfStampInZone, parseAnyStamp, stampInZone, theClockZone } from '@shared/time.ts'
import { A_GO_LIMIT_IS, STOP_CAUSE_KIND_IN_SQL, WAITS_ON_A_LIMIT_IN_SQL, theStopCauseOf, theWaitOnALimitOf } from '../../config/stopped-run-cause.mjs'
import { theSandboxesLoginForTheRouter } from './the-sandboxes-login-for-the-router.ts'
import { theModelsLimitedAt } from '../db/the-models-limited-at.ts'

export { theModelsLimitedAt } from '../db/the-models-limited-at.ts'

export { theLimitOfTheSandboxesLogin } from '../db/the-models-limited-at.ts'

/**
 * Newest actual draw for this agent in this project; a named model, marked row or kept copy is not a new draw. The agent's
 * own runs are read first. A draw made at a worker-run ask is kept on the supervisor's run until the worker's run is
 * filed (round 46), so those asks are read next, and the effort the launcher is answered reads the draw its start takes.
 * It is `theEarlierCastingRolls` asked for this agent alone.
 */
export function theEarlierCastingRoll(project: string, agentId: string): EarlierCastingRoll | null {
  return theRollThisAnswerHolds(theEarlierCastingRolls(project, [agentId]).get(agentId) ?? null)
}

/** The run holding a roll for the agent that `readCastingRoll` refuses, and the words it refuses it with. */
export interface AnUnreadableCastingRoll { run: string; unreadable: string }

/**
 * The roll one agent's answer from `theEarlierCastingRolls` holds, or null where it holds none. An unreadable roll throws
 * here, in the words `readCastingRoll` gave, so it fails the ask of that agent alone.
 */
export function theRollThisAnswerHolds(answer: EarlierCastingRoll | AnUnreadableCastingRoll | null): EarlierCastingRoll | null {
  if (answer !== null && 'unreadable' in answer) throw new Error(answer.unreadable)
  return answer
}

/** `readCastingRoll` of a roll held on this run, with a refusal kept as the answer of the agent it holds the roll for. */
function readOneAgentsRoll(run: string, stored: unknown): CastingRollRecord | AnUnreadableCastingRoll | null {
  try {
    return readCastingRoll(stored)
  } catch (error) {
    return { run, unreadable: error instanceof Error ? error.message : String(error) }
  }
}

/**
 * THE NEWEST ACTUAL DRAW FOR EACH OF THESE AGENTS IN THIS PROJECT, each the draw `theEarlierCastingRoll` gives for that
 * agent, or null where it gives none. Every agent asked is in the answer. The message queue asks it once per pass, for
 * every agent a message is queued for, so a pass makes the two reads below once and not once for each agent.
 *
 * EACH AGENT'S ANSWER IS KEPT APART. Where `theEarlierCastingRoll` would throw for an agent, because a roll read before
 * that agent's newest draw is one `readCastingRoll` refuses, that agent's answer is the run that holds it and the
 * refusal's words. The other agents are answered as they would be alone, and `theRollThisAnswerHolds` throws the words
 * for that agent alone.
 *
 * THE AGENTS' OWN RUNS ARE READ AMONG THE RUNS THAT COULD BE THEIRS (`theseAgentsOnly` in lib/presence.ts says why that
 * keeps every run `theAgentARunServes` names one of them on). Each agent's handle is the one on its own registry row,
 * which a retired agent keeps, so a run that names a retired agent by its handle is among them. `theAgentARunServes`
 * still decides which agent each run serves. The runs are read newest first, and each agent takes the first of its own
 * that holds a draw, as it would if it were asked alone. The supervisors' worker-run asks are read only for the agents
 * whose own runs hold none.
 *
 * AN ID ASKED MAY BE AN OLD ID. A delivery row written before an alias was filed keeps the id it was written under, and
 * the re-mint does not rewrite it. So each id is read as the canonical registry id its filed alias names, which is the
 * agent a start's door reads the roll for, and the answer is kept under the id asked.
 */
export function theEarlierCastingRolls(
  project: string,
  agentIds: readonly string[],
  aliases: TheFiledAliases = theFiledAliasesReadOnce(sqlite),
): Map<string, EarlierCastingRoll | AnUnreadableCastingRoll | null> {
  if (agentIds.length === 0) return new Map()
  const wanted = new Set(agentIds.map((id) => aliases.canonicalOf(id)))
  const found = new Map<string, EarlierCastingRoll | AnUnreadableCastingRoll>()
  const handles = [...wanted].flatMap((id) => theAgentWithThisId(sqlite, id)?.handle ?? [])
  const couldBeTheirRuns = theseAgentsOnly([...wanted], handles, aliases).sessions(project)
  const rows = db.select({ id: records.id, data: records.data }).from(records)
    .where(and(eq(records.kind, 'session'), eq(records.workspaceId, project), isNull(records.deletedAt), sql`json_type(${records.data}, '$.castingRoll') IS NOT NULL`, couldBeTheirRuns))
    .orderBy(...NEWEST_SESSION_FIRST).all()
  for (const row of rows) {
    const agent = theAgentARunServes(row.data)?.id
    if (agent === undefined || !wanted.has(agent) || found.has(agent)) continue
    const record = readOneAgentsRoll(row.id, row.data[CASTING_ROLL])
    if (record !== null && 'unreadable' in record) found.set(agent, record)
    else if (record?.choice === 'rolled') found.set(agent, { run: row.id, record })
  }
  const left = [...wanted].filter((id) => !found.has(id))
  const asked = left.length === 0 ? [] : sqlite.prepare(
    "SELECT records.id AS id, entry.key AS agent, entry.value AS value FROM records, json_each(records.data, '$." + WORKER_RUNS + "') AS entry " +
    "WHERE records.kind = 'session' AND records.workspace_id = ? AND records.deleted_at IS NULL " +
    `AND ${theWordsOfAStoredField(STORED_FIELDS.sessionHoldsWorkerRuns, 'records.data')} ` +
    "AND entry.key IN (SELECT value FROM json_each(?)) " +
    "AND json_extract(entry.value, '$." + CASTING_ROLL + ".choice') = 'rolled' ORDER BY records.created_at DESC, records.rowid DESC",
  ).all(project, JSON.stringify(left)) as { id: string; agent: string; value: string }[]
  for (const row of asked) {
    if (found.has(row.agent)) continue
    const record = readOneAgentsRoll(row.id, (JSON.parse(row.value) as Record<string, unknown>)[CASTING_ROLL])
    if (record !== null && 'unreadable' in record) found.set(row.agent, record)
    else if (record?.choice === 'rolled') found.set(row.agent, { run: row.id, record })
  }
  return new Map(agentIds.map((id) => [id, found.get(aliases.canonicalOf(id)) ?? null]))
}

/**
 * A CASTING ROW AS THE ROLL READS IT AT ONE MOMENT: its labels by their names, and its Out until only while it is still
 * to come, so a time that has passed puts the row back with nothing written. A label id the table does not hold is a
 * broken store, because a label a row carries cannot be removed.
 */
export function theRowTheRollReads(row: CastingRow, names: ReadonlyMap<number, string>, now: number): CastingRollRow {
  const where = `Casting row ${String(row.id)}`
  const out = readCastingOutUntil(row.cells.out_until.value, where)
  return {
    id: row.id, program: row.cells.program.value, model: row.cells.model.value, effort: row.cells.effort.value,
    probability: readCastingProbability(row.cells.probability.value), marked: row.marked,
    labels: readCastingLabelIds(row.cells.labels.value, where).map((id) => {
      const name = names.get(id)
      if (name === undefined) throw new Error(`${where} carries label ${String(id)}, which the Casting table does not hold.`)
      return name
    }),
    outUntil: out !== null && out > now ? row.cells.out_until.value : null,
  }
}

/** The limits the office knows at one moment, with the sandboxes' login as the router reads it. */
export function theLimitsNow(now: number): CastingLimits {
  return theModelsLimitedAt(now, { week: theSandboxesLoginForTheRouter(now) })
}

/**
 * THE DEFAULT AN OFFICE DOOR ASKS FOR when nobody names a model: the role's rows in force, the agent's earlier roll, and
 * the limits the office knows now. Without a difficulty the roll is across every row of the role (the platform agent's
 * answer); with one, it is the name of a label, and the roll draws only the rows that carry it. A named model never
 * reaches here, and no door asks for an inspector's default yet, so neither is passed.
 */
export function theDefaultCasting(
  asked: { role: string; project: string; agentId: string; difficulty?: string | null },
): CastingRollAnswer {
  const now = Date.now()
  const names = theCastingLabelNames()
  const rows = theRowsInForce(asked.role, asked.project).map((row) => theRowTheRollReads(row, names, now))
  return theCastingRoll({
    role: asked.role, project: asked.project, rows, difficulty: asked.difficulty ?? null, named: null,
    earlier: theEarlierCastingRoll(asked.project, asked.agentId), builderModel: null,
    limits: theLimitsNow(now), random: Math.random,
  })
}

/**
 * WHAT THE ROLL WOULD DO NOW FOR WORK OF EACH LABEL, among one list's rows. It asks the roll itself, with the limits as
 * they are, no earlier roll and a random source that is never read for an answer, so the page shows the roll's own
 * answer and not a second copy of its rules. A roll that draws gives the rows with a share above 0; one that takes
 * the marked row gives that row; one that draws nothing gives no row.
 */
export function theDrawsOfEachLabel(
  role: string, rows: readonly CastingRow[], labels: readonly { id: number; name: string }[], limits: CastingLimits, now: number,
): CastingLabelDraw[] {
  const names = new Map(labels.map((label) => [label.id, label.name]))
  const read = rows.map((row) => theRowTheRollReads(row, names, now))
  return labels.map((label): CastingLabelDraw => {
    const { record } = theCastingRoll({ role, project: '', rows: read, difficulty: label.name, named: null, earlier: null, builderModel: null, limits, random: () => 0 })
    if (record.choice === 'rolled') return { label: label.id, choice: 'drawn', rows: record.candidates.filter((one) => one.share > 0).map((one) => ({ rowId: one.rowId, share: one.share })) }
    // A marked choice always names its row: the roll's record shape refuses one that does not.
    if (record.choice === 'marked') return { label: label.id, choice: 'marked', rows: [{ rowId: record.selected!.rowId!, share: 1 }] }
    return { label: label.id, choice: 'none', rows: [] }
  })
}
