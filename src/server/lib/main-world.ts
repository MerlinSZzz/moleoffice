// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE MAIN WORLD'S REMINDER LIMITS: HOW MANY SUPERVISORS AND WORKERS MAY RUN ON THE HOST AT ONCE,
 * PER SECRETARY, BEFORE THE OFFICE SAYS "USE A SANDBOX". IT REMINDS; IT NEVER REFUSES.
 *
 * ---------------------------------------------------------------------------------------
 * THE RULE
 * ---------------------------------------------------------------------------------------
 *
 * On 16 September many agents working in parallel in the main world ended with their home directory
 * deleted. Since then the rule is that many agents must
 * not run in parallel in the main world, and that a few small jobs there are fine. The limits:
 *
 *   In the main world, the reminder threshold is one supervisor and two workers for each secretary.
 *   The user can change both numbers in the settings; 1 and 2 are the defaults.
 *
 * So each secretary may have one supervisor and two workers running on the host. An agent added two
 * refinements, both in force:
 *   - Count per secretary's own tree, so one secretary cannot use up the others' share.
 *   - Remind rather than refuse, following the rule against hard gates.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS COUNTED
 * ---------------------------------------------------------------------------------------
 *
 * A RUN IN THE MAIN WORLD is a session record that is `running`, names the agent it serves
 * (`servingAgent`), and has no `sandbox` field. A run inside a sandbox writes that field when it
 * starts (tools/sandbox-start.mjs), so it is never counted. A row that records a process which this
 * machine says is gone is not counted either: the row says running, and nothing is running behind
 * it. A row that records no process is counted, because nothing says it has stopped.
 *
 * ITS CARD is the serving agent's role: `supervisor`, or `worker` (a row with no role reads as a
 * worker, `A_ROW_WITH_NO_ROLE_READS_AS`). Secretaries, inspectors and every other card are not
 * counted. A secretary works in the main world by definition, and an inspector checks rather than
 * builds.
 *
 * ITS SECRETARY is the first secretary on its chain of starters (`theChainUpFrom`). A run with no
 * secretary above it counts only towards the whole office's total.
 *
 * THE LIMITS come from two settings, one per card:
 *   - `x<N>` is N per secretary: each tree's share is N, and the office's total is N times the live
 *     secretaries.
 *   - A plain number is the office's total. Each tree's share is that total divided by the live
 *     secretaries, rounded up.
 * With no live secretary, the office counts as having one, so the total is never zero.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS SAID, TO WHOM, AND HOW OFTEN
 * ---------------------------------------------------------------------------------------
 *
 * The runs are counted oldest first, so the newest runs are the ones said. A run is "over" when,
 * counting it, its secretary's share is passed. A run within its share, or with no secretary above
 * it, is then counted towards the office's total, and is "over" when that total is passed. A run
 * already over its own share is not counted towards the total. Otherwise one secretary going past
 * its share would push the other secretaries' runs past the total. Each over run is said ONCE, to whoever started its
 * agent. That is the one who can move the work into a sandbox. With no recorded starter, the line
 * goes to the agent itself. The line carries the run in `aboutRun` and the mark
 * `extra.mainWorldOver`, so a later tick reads the conversation to know it was said, and no flag is
 * stored anywhere. Nothing is stopped, and the line says so.
 */

import { and, eq, isNull, sql } from 'drizzle-orm'
import { db } from '../db/client.ts'
import { records, STORED_FIELDS } from '../db/schema.ts'
import { parseAnyStamp } from '@shared/time.ts'
import { SYSTEM_LINES } from '@shared/groups.ts'
import { A_ROW_WITH_NO_ROLE_READS_AS, THE_SUPERVISOR, THE_WORKER } from '@shared/roles.ts'
import type { ParticipantRef } from '@shared/participants.ts'
import { writeASystemLineToOne } from './groups.ts'
import { theChainUpFrom, type RegisteredAgent } from './participants.ts'
import { listParticipants } from '../db/list-participants.ts'
import { readParticipant } from '../db/read-participant.ts'
import { theSecretaries } from './secretariat.ts'
import { osProbe } from './resources.ts'
import { theRowNamesAnotherMachine } from './machines.ts'
import { theRecordedProcessIsGone, theRecordedProcessOf } from '../../config/own-rows.mjs'
import { mainWorldLimitSetting } from './env.ts'
import type { Actor } from './records.ts'
import { theAgentARunServes } from './the-agent-a-run-serves.ts'

/** The mark on the line that tells one over run's starter to use a sandbox. */
export const MAIN_WORLD_OVER_MARK = 'mainWorldOver'

/** The two cards the limits count, each with the setting that holds its limit. */
const COUNTED = [
  { card: THE_SUPERVISOR, setting: 'MOLE_OFFICE_MAIN_WORLD_SUPERVISORS' },
  { card: THE_WORKER, setting: 'MOLE_OFFICE_MAIN_WORLD_WORKERS' },
] as const

export type CountedCard = (typeof COUNTED)[number]['card']

/** One limit, read: each secretary's share, the office's total, and the words it was set as. */
export interface MainWorldLimit {
  card: CountedCard
  perSecretary: number
  total: number
  setAs: string
}

/** One run found on the host, with the facts the count reads. */
export interface MainWorldRun {
  run: string
  agent: string
  card: CountedCard
  /** The first secretary on its chain of starters, or null because none is on it. */
  secretary: string | null
  /** Whoever started its agent, or null because nobody recorded one. */
  starter: ParticipantRef | null
  startMs: number | null
}

/** A run that goes past a limit, and which limit it goes past. */
export interface MainWorldOver extends MainWorldRun {
  /** How many of its card were running on the host in its share, counting it. */
  inItsShare: number
  /** How many of its card within their shares had been counted towards the office's total, counting it. */
  inTheOffice: number
  /** How many of its card are running on the host in the whole office, over or not. */
  onTheHost: number
  limit: MainWorldLimit
  /** Which limit it went past: its secretary's share, or the office's total. */
  past: 'share' | 'total'
}

/**
 * ONE LIMIT, READ FROM ITS SETTING against the live secretaries. `x2` is two per secretary; `6` is
 * six in all. Anything else is refused with the setting's name.
 */
export function theMainWorldLimit(card: CountedCard, liveSecretaries: number): MainWorldLimit {
  const entry = COUNTED.find((one) => one.card === card)!
  const setAs = mainWorldLimitSetting(entry.setting)
  const secretaries = Math.max(1, liveSecretaries)
  const multiple = /^x(\d+)$/i.exec(setAs)
  if (multiple !== null) {
    const n = Number(multiple[1])
    return { card, perSecretary: n, total: n * secretaries, setAs }
  }
  if (/^\d+$/.test(setAs)) {
    const n = Number(setAs)
    return { card, perSecretary: Math.ceil(n / secretaries), total: n, setAs }
  }
  throw new Error(
    `${entry.setting} is ${JSON.stringify(setAs)}. Give it x and a number for so many per secretary (x2), or a ` +
      'plain number for so many in the whole office (6). Nothing was read from it.',
  )
}

function inMs(stamp: unknown): number | null {
  if (typeof stamp !== 'string' || stamp.trim() === '') return null
  const at = parseAnyStamp(stamp)
  return at === null ? null : at.getTime()
}

/** The card a registered agent is counted under, or null because the limits do not count its card. */
function theCountedCardOf(agent: RegisteredAgent): CountedCard | null {
  const card = agent.role ?? A_ROW_WITH_NO_ROLE_READS_AS
  return card === THE_SUPERVISOR || card === THE_WORKER ? card : null
}

/**
 * EVERY RUN OF A COUNTED CARD RUNNING ON THE HOST IN ONE PROJECT, oldest first. The database does
 * the filtering, because a project holds thousands of session records and this runs every minute.
 */
export function theRunsInTheMainWorld(workspaceId: string): MainWorldRun[] {
  const rows = db
    .select({ id: records.id, title: records.title, data: records.data })
    .from(records)
    .where(
      and(
        eq(records.kind, 'session'),
        eq(records.workspaceId, workspaceId),
        isNull(records.deletedAt),
        // THROUGH THE INDEX OF RUNNING RUNS (`STORED_FIELDS.sessionIsRunning`). Asked as a plain json_extract, SQLite parsed
        // every session row of the project to find them, 23 ms of every minute at the live counts (wave 13y round 16).
        sql`${STORED_FIELDS.sessionIsRunning(records.data)} = 1`,
        sql`json_extract(${records.data}, '$.servingAgent') IS NOT NULL`,
        sql`json_extract(${records.data}, '$.sandbox') IS NULL`,
      ),
    )
    .all()
  const agents = listParticipants().agents
  const byId = new Map(agents.map((one) => [one.id, one]))
  const secretaries = new Set(theSecretaries().map((one) => one.id))
  const probe = osProbe()
  const out: MainWorldRun[] = []
  for (const row of rows) {
    const data = row.data as Record<string, unknown>
    // A RUN ON ANOTHER COMPUTER IS NOT ON THIS HOST. Its row says which computer in `machine`, and a sandbox here could
    // not hold it, so it is neither counted nor reminded to use one.
    if (theRowNamesAnotherMachine({ data })) continue
    const recorded = theRecordedProcessOf({ data })
    if (recorded.pid !== null && theRecordedProcessIsGone(recorded, probe.processById(recorded.pid)) === 'gone') continue
    const served = theAgentARunServes(data)
    const agent = served === null ? null : (byId.get(served.id) ?? null)
    if (agent === null || agent.retired) continue
    const card = theCountedCardOf(agent)
    if (card === null) continue
    const chain = theChainUpFrom(agent.startedBy, agents).chain
    const secretary = chain.find((one) => one.kind === 'agent' && secretaries.has(one.id))?.id ?? null
    const startMs = inMs((data['startedTime'] as { instant?: unknown } | undefined)?.instant) ?? inMs(data['startedAt'])
    out.push({ run: row.id, agent: agent.id, card, secretary, starter: agent.startedBy, startMs })
  }
  // OLDEST FIRST, so the run that goes past a limit is the newest one. A run with no start time
  // counts as the newest, and the record id breaks a tie so every tick reads the same order.
  return out.sort((a, b) => (a.startMs ?? Infinity) - (b.startMs ?? Infinity) || a.run.localeCompare(b.run))
}

/** THE RUNS PAST A LIMIT, by the rules at the top of this file. */
export function theRunsPastTheMainWorldLimits(workspaceId: string): MainWorldOver[] {
  const liveSecretaries = theSecretaries().length
  const running = theRunsInTheMainWorld(workspaceId)
  const over: MainWorldOver[] = []
  for (const { card } of COUNTED) {
    const limit = theMainWorldLimit(card, liveSecretaries)
    const perShare = new Map<string, number>()
    const ofTheCard = running.filter((one) => one.card === card)
    let inTheOffice = 0
    for (const run of ofTheCard) {
      const share = run.secretary ?? ''
      const inItsShare = (perShare.get(share) ?? 0) + 1
      perShare.set(share, inItsShare)
      const pastShare = run.secretary !== null && inItsShare > limit.perSecretary
      if (pastShare) {
        over.push({ ...run, inItsShare, inTheOffice, onTheHost: ofTheCard.length, limit, past: 'share' })
        continue
      }
      inTheOffice += 1
      if (inTheOffice > limit.total) over.push({ ...run, inItsShare, inTheOffice, onTheHost: ofTheCard.length, limit, past: 'total' })
    }
  }
  return over
}

/**
 * THE OVER RUNS THE OFFICE HAS ALREADY TOLD SOMEBODY ABOUT, among the ones asked, in one reading.
 *
 * ONE READING FOR EVERY OVER RUN, NOT ONE PER RUN. Each separate question parsed every message, about 26 ms on a copy at
 * the live counts on 10 October 2026, and a pass asked it once for each run over a limit (wave 13y round 17). The
 * conditions are the ones each question had. A line the pass writes is about the run being judged, and each run is
 * judged once, so reading before the loop gives every run the answer a fresh reading would.
 */
function theOverRunsAlreadySaid(runIds: readonly string[]): Set<string> {
  if (runIds.length === 0) return new Set()
  const theRuns = sql.join(
    runIds.map((id) => sql`${id}`),
    sql`, `,
  )
  // ONLY THE MESSAGES CHANGED SINCE A DAY BEFORE THE OLDEST OF THESE RUNS WAS FILED ARE READ. A line about a run is written
  // after its row, and every write sets `updated_at` to the local stamp, so no line about these runs is older; the day is
  // for a clock change. `+kind` keeps SQLite off the kind index, so it takes them by `records_updated_idx`.
  const oldest = db.get<{ from: string | null }>(
    sql`SELECT datetime(min(${records.createdAt}), '-1 day') AS "from" FROM ${records} WHERE ${records.id} IN (${theRuns})`,
  )
  const rows = db
    .select({ run: sql<unknown>`json_extract(${records.data}, '$.aboutRun')` })
    .from(records)
    .where(
      and(
        sql`${records.updatedAt} >= ${oldest?.from ?? ''}`,
        sql`+${records.kind} = 'message'`,
        isNull(records.deletedAt),
        sql`json_extract(${records.data}, '$.aboutRun') IN (${theRuns})`,
        sql`json_extract(${records.data}, '$.extra.mainWorldOver') = 1`,
      ),
    )
    .all()
  return new Set(rows.map((row) => String(row.run)))
}

/**
 * The name a sentence gives an agent held here by its registry id: the handle on its row, or the id as
 * it is when no row answers. Since criterion I1 a new agent's id is not its handle.
 */
function theHandleOf(id: string): string {
  const row = readParticipant({ kind: 'agent', id })
  return row !== null && 'handle' in row ? row.handle : id
}

/** The whole sentence behind the line the starter is handed. */
function theSentenceFor(over: MainWorldOver): string {
  const cards = over.card === THE_SUPERVISOR ? 'supervisors' : 'workers'
  const where =
    over.past === 'share'
      ? `${String(over.inItsShare)} ${cards} are running on the host in ${theHandleOf(String(over.secretary))}'s share, and the share is ${String(over.limit.perSecretary)}`
      : `${String(over.onTheHost)} ${cards} are running on the host in the whole office, and the total is ${String(over.limit.total)}`
  return (
    `Main world: ${where} (${over.card === THE_SUPERVISOR ? 'MOLE_OFFICE_MAIN_WORLD_SUPERVISORS' : 'MOLE_OFFICE_MAIN_WORLD_WORKERS'} = ${over.limit.setAs}). ` +
    `Run ${over.run} of ${theHandleOf(over.agent)} is past it. Please start new work in a sandbox: node tools/sandbox.mjs up, then exec. ` +
    'Nothing was stopped; this is a reminder, and it is said once for this run.'
  )
}

/**
 * ONE PASS: SAY EACH OVER RUN ONCE, to whoever started its agent, or to the agent when nobody is
 * recorded. Answers the runs said this pass.
 */
export function sendTheMainWorldRemindersThatAreDue(workspaceId: string, by: Actor): string[] {
  const said: string[] = []
  const overRuns = theRunsPastTheMainWorldLimits(workspaceId)
  const alreadySaid = theOverRunsAlreadySaid(overRuns.map((over) => over.run))
  for (const over of overRuns) {
    if (alreadySaid.has(over.run)) continue
    const to: ParticipantRef = over.starter ?? { kind: 'agent', id: over.agent }
    writeASystemLineToOne(to, workspaceId, SYSTEM_LINES.tooManyInTheMainWorld(over.past, theSentenceFor(over)), by, { run: over.run }, { [MAIN_WORLD_OVER_MARK]: true })
    said.push(over.run)
  }
  return said
}
