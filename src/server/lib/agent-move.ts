// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN AGENT MOVED TO ANOTHER PROJECT BY ONE PRESS.
 * Moving an agent is built in: a user can move one without changing code. Wave 13u, round 184.
 *
 * WHAT AN AGENT IS MADE OF, AND WHAT MOVES. An agent is one row in the registry, which belongs to no project, and an
 * agent record in each project it works in. Its runs are session records filed in a project. The press moves the
 * agent's record in this project and its ended runs here, in ONE record move (lib/move.ts), so what the walk says must go
 * with them goes too, and a link that would cross the boundary refuses the move as it does at the record door. The
 * start folder is on the agent's record, so it moves with it.
 *
 * WHAT STAYS, AND WHY, said in the answer for each record:
 *   - A RUN STILL GOING (running or idle), PAUSED, LEFT WITHOUT ITS PROCESS (orphaned), OR IN NO STATE ANYBODY KNOWS. It
 *     is not moved under its own feet: it keeps writing into the project it was filed in, so nothing it writes is lost.
 *     Once it has ended, the same press moves it, even after the agent's record has gone ahead.
 *   - A SECRETARY'S DUTIES. They are the area the person granted in this project and rest on this project's decisions,
 *     so moving the agent does not change what the person granted. They move on their own page if they should.
 *   - MESSAGES. They are kept in the message centre and belong to no project.
 *
 * A RUN THAT NAMES ITS AGENT ONLY BY ITS RECORD names it in its own project (`data.ranAs`, read by
 * `howARunNamesItsAgent` in lib/inspection.ts). The record keeps its id when it moves, so the binding is rewritten from
 * the old project to the new one in the same transaction, and the moved run still names the agent.
 *
 * WHO MAY PRESS IT: the person, or a secretary the person's raise carries it for. An agent moving itself, or another
 * agent, is refused: where an agent works is the person's choice.
 */

import { sqlite } from '../db/client.ts'
import { saysStillGoing } from '../../config/still-going.mjs'
import type { ARunNotEnded } from '../../shared/agent-starter.ts'
import { SECRETARY_DUTIES_KIND } from '@shared/secretary-duties-record.ts'
import { theLiveHoldOn } from './handles.ts'
import { theAgentsOfTheseRuns } from './inspection.ts'
import { RUN_IS_OVER_STATES, theRunHasEnded } from '@shared/run-has-ended.ts'
import { moveRecordToWorkspace, type CrossingLink, type MovedRows, type MovingRecord } from './move.ts'
import { agentsForRecords } from '../db/agents-for-records.ts'
import { theAgentAnArrivingReferenceNames } from './the-agent-an-arriving-reference-names.ts'
import { recordForAgentIn } from '../db/record-for-agent-in.ts'
import { aRaiseCarriesIt, patchRecord, type Actor } from './records.ts'
import { thePersonIsProved } from '@shared/the-person-proved.ts'
import { PanelError } from './panel-error.ts'

/** Why a record of the agent's stays in the project it is in. The page draws each in its own words. */
export type WhyItStays = 'still-going' | 'paused' | 'orphaned' | 'state-not-known' | 'duties'

export interface AStayingRecord {
  id: string
  kind: string
  title: string
  why: WhyItStays
  /** The same reason as one English sentence, for a caller that reads the answer and not the page. */
  because: string
}

export interface AnAgentsProjectMove {
  agent: { id: string; handle: string; name: string }
  from: string
  to: string
  dryRun: boolean
  /** The agent's record in `from`, or null where it went ahead earlier and only ended runs are left to follow it. */
  record: string | null
  /** Every record that moves, or would: the agent's record, its ended runs, and what the walk says goes with them. */
  moving: MovingRecord[]
  /** Every record of the agent's in `from` that stays there, each with why. */
  staying: AStayingRecord[]
  /** The records the move needs named in `also`, as the record door asks. Send them back with the press. */
  needsAlso: string[]
  /** The stored links that would cross the boundary. A move with any is refused; the preview names them. */
  crossing: CrossingLink[]
  /**
   * Every project the agent has a record in once this answer is given: where its record went, after a press; where it
   * is now, on a preview. A preview with nothing to move says by this where the agent went earlier.
   */
  recordIsIn: string[]
  rows: MovedRows
  /** Runs whose binding to the agent's record was rewritten to the new project. Zero on a preview. */
  bindingsRewritten: number
  note: string
}

/** The words for each reason a record stays, said in the answer. The page has its own words for each code. */
const BECAUSE: Record<WhyItStays, string> = {
  'still-going':
    'This run is still going. It keeps writing into the project it was filed in, so it stays there until it ends; then the same press moves it.',
  paused: 'This run is paused, so it may go on in the project it was filed in. It stays until it ends; then the same press moves it.',
  orphaned:
    'This run lost its process without saying it ended, so nobody knows whether it will write again. It stays until it is marked ended; then the same press moves it.',
  'state-not-known':
    'Nobody recorded whether this run is still going. It stays until somebody records that it ended; then the same press moves it.',
  duties:
    "These duties are the area the person granted in this project, resting on this project's decisions. Moving the agent does not change what the person granted, so they stay. Move them on their own page if they should go.",
}

/** The same reasons in a few words, for a refusal that names each record that stays. */
const BECAUSE_IN_A_FEW_WORDS: Record<WhyItStays, string> = {
  'still-going': 'still going',
  paused: 'paused',
  orphaned: 'without its process',
  'state-not-known': 'in no recorded state',
  duties: "the person's grant here",
}

/** Which reason a run in this state stays for, or null for a run that has ended and moves. */
function whyARunStays(state: unknown): WhyItStays | null {
  if (state === 'finished' || state === 'crashed') return null
  if (saysStillGoing(state)) return 'still-going'
  if (state === 'paused') return 'paused'
  if (state === 'orphaned') return 'orphaned'
  return 'state-not-known'
}

interface ARunRow {
  id: string
  title: string
  workspaceId: string
  data: Record<string, unknown>
}

/** The fields of a run's data `theRunsOfTheAgentIn` reads, each by its own name. */
const RUN_FIELDS = ['servingAgentId', 'servingAgent', 'ranAs', 'state'] as const

/**
 * EVERY RUN IN THIS PROJECT THAT NAMES THIS AGENT, by the one reader that says which agent a run is
 * (`theAgentsOfTheseRuns`). Only the four fields that reader and this file ask are read from each run's data, each as
 * the JSON it is stored as. SQLite's `->` gives SQL NULL only for a key that is absent, so a field stored as null is
 * handed on as null, and the reader sees what is stored: a `servingAgent` stored as null means the run names no agent.
 */
function theRunsOfTheAgentIn(agentId: string, workspaceId: string): ARunRow[] {
  return theRunsOfTheAgentWhere(agentId, 'workspace_id = ?', [workspaceId])
}

/**
 * EVERY RUN OF THIS AGENT THAT HAS NOT ENDED, IN EVERY PROJECT, for the change of its starter (lib/agent-starter.ts). A
 * run has ended in the states `theRunHasEnded` in lib/keys.ts names, the states in which its key dies: a paused run
 * that is resumed is a new run, with a key of its own. So this asks a different question from `whyARunStays`, which
 * keeps a paused run where it was filed because it may go on there.
 */
export function theRunsOfTheAgentThatHaveNotEnded(agentId: string): ARunNotEnded[] {
  const ended = RUN_IS_OVER_STATES.map(() => '?').join(', ')
  return theRunsOfTheAgentWhere(agentId, `(data ->> '$.state' IS NULL OR data ->> '$.state' NOT IN (${ended}))`, [...RUN_IS_OVER_STATES])
    .filter((run) => !theRunHasEnded(run.data['state']))
    .map((run) => ({
      id: run.id,
      title: run.title,
      project: run.workspaceId,
      state: typeof run.data['state'] === 'string' ? run.data['state'] : null,
    }))
}

function theRunsOfTheAgentWhere(agentId: string, where: string, said: string[]): ARunRow[] {
  const rows = sqlite
    .prepare(
      `SELECT id, title, workspace_id AS workspaceId,
              data -> '$.servingAgentId' AS servingAgentId, data -> '$.servingAgent' AS servingAgent,
              data -> '$.ranAs' AS ranAs, data -> '$.state' AS state
         FROM records WHERE kind = 'session' AND deleted_at IS NULL AND ${where}`,
    )
    .all(...said) as ({ id: string; title: string; workspaceId: string } & Record<(typeof RUN_FIELDS)[number], string | null>)[]
  const runs: ARunRow[] = rows.map((row) => {
    const data: Record<string, unknown> = {}
    for (const field of RUN_FIELDS) {
      const stored = row[field]
      if (stored !== null) data[field] = JSON.parse(stored)
    }
    return { id: row.id, title: row.title, workspaceId: row.workspaceId, data }
  })
  const named = theAgentsOfTheseRuns(runs)
  const heldSession = theLiveHoldOn(agentId, true)?.session
  return runs.filter((run) => named.get(run.id) === agentId || (named.get(run.id) == null && run.id === heldSession))
}

/** The secretary's duties filed in this project that name this agent. */
function theDutiesOfTheAgentIn(agentId: string, workspaceId: string): { id: string; title: string }[] {
  return sqlite
    .prepare(
      `SELECT id, title FROM records
        WHERE kind = ? AND workspace_id = ? AND deleted_at IS NULL
          AND json_extract(data, '$.secretary.kind') = 'agent' AND json_extract(data, '$.secretary.id') = ?`,
    )
    .all(SECRETARY_DUTIES_KIND, workspaceId, agentId) as { id: string; title: string }[]
}

/** Every project the agent has a live record in, so a refusal can say where it is. */
function theProjectsWithARecordOf(agentId: string): string[] {
  const rows = sqlite
    .prepare(
      `SELECT DISTINCT r.workspace_id AS workspaceId FROM agent_records a JOIN records r ON r.id = a.record_id
        WHERE a.agent_id = ? AND r.deleted_at IS NULL ORDER BY r.workspace_id`,
    )
    .all(agentId) as { workspaceId: string }[]
  return rows.map((row) => row.workspaceId)
}

/**
 * A MOVED RUN'S BINDING TO THE AGENT'S RECORD, rewritten from the old project to the new. Only an entry of `data.ranAs`
 * filed for `from` whose record is this agent's, as `agentsForRecords` reads it, now says `to`; the record it names is
 * the same record, which kept its id. Another agent's binding stays as it is, since that agent's record did not move.
 * Returns whether it wrote.
 */
function rewriteTheBinding(runId: string, agentId: string, from: string, to: string, actor: Actor): boolean {
  const row = sqlite.prepare("SELECT data -> '$.ranAs' AS ranAs FROM records WHERE id = ?").get(runId) as { ranAs: string | null } | undefined
  if (row === undefined || row.ranAs === null) return false
  const ranAs = JSON.parse(row.ranAs) as unknown
  if (!Array.isArray(ranAs)) return false
  const inFrom = (binding: unknown): binding is { workspaceId: string; agentId: string } =>
    typeof binding === 'object' &&
    binding !== null &&
    (binding as { workspaceId?: unknown }).workspaceId === from &&
    typeof (binding as { agentId?: unknown }).agentId === 'string'
  const agents = agentsForRecords(ranAs.filter(inFrom).map((binding) => binding.agentId))
  let changed = false
  const rewritten = ranAs.map((binding: unknown) => {
    if (inFrom(binding) && agents.get(binding.agentId)?.id === agentId) {
      changed = true
      return { ...binding, workspaceId: to }
    }
    return binding
  })
  if (changed) patchRecord(runId, { dataPatch: { ranAs: rewritten } }, actor)
  return changed
}

/**
 * MOVE AN AGENT FROM `from` TO `to`, or with `dryRun` say what would move and what would stay and write nothing.
 *
 * `reference` is the agent's id or handle. Refused, with nothing written: a move asked by a caller that is neither the
 * person nor a secretary the person's raise carries it for (403; the preview writes nothing and is anybody's to read);
 * the same project (400); an agent this office has not registered (404); an agent with records in both projects, which
 * would leave it two records in one project (409); and a press for an agent with nothing here to move (404), where a
 * preview answers with nothing moving, what stays, and where its record is. The record move's own
 * refusals stand as they are: an unknown project, `also` not as asked, and a link that would cross.
 */
export function moveAnAgentToAProject(
  reference: string,
  from: string,
  input: { to: string; also?: readonly string[]; dryRun?: boolean },
  actor: Actor,
): AnAgentsProjectMove {
  const dryRun = input.dryRun ?? false
  // A preview moves nothing, so only a refused press says that nothing was moved.
  const nothingMoved = dryRun ? '' : ' Nothing was moved.'
  // A PREVIEW WRITES NOTHING, so any caller who may read this project may read it.
  if (!dryRun && !thePersonIsProved(actor) && !aRaiseCarriesIt(actor)) {
    throw new PanelError(
      'Only the person moves an agent to another project, or a secretary their raise carries it for. Where an agent works ' +
        "is the person's choice, so an agent may not move itself or another agent. Nothing was moved. The person presses it " +
        "on the agent's page.",
      403,
    )
  }
  const to = input.to
  if (to === from) {
    throw new PanelError(`The agent is to move to "${to}", which is the project this was asked in.${nothingMoved}`, 400)
  }
  const named = theAgentAnArrivingReferenceNames(reference, 'reading')
  if (named === null) throw new PanelError(`No agent is registered as "${reference}".${nothingMoved}`, 404)
  const agent = { id: named.agent.id, handle: named.agent.handle, name: named.agent.name }
  const itsRecord = recordForAgentIn(agent.id, from)
  const alreadyThere = recordForAgentIn(agent.id, to)
  if (itsRecord !== null && alreadyThere !== null) {
    throw new PanelError(
      `"${agent.name}" has a record in "${from}" (${itsRecord}) and one in "${to}" (${alreadyThere}). Moving the first ` +
        `would leave two records for one agent in one project, and Mole Office does not join two records into one.${nothingMoved}`,
      409,
    )
  }

  const runs = theRunsOfTheAgentIn(agent.id, from)
  const ended = runs.filter((run) => whyARunStays(run.data['state']) === null)
  const staying: AStayingRecord[] = [
    ...runs.flatMap((run): AStayingRecord[] => {
      const why = whyARunStays(run.data['state'])
      return why === null ? [] : [{ id: run.id, kind: 'session', title: run.title, why, because: BECAUSE[why] }]
    }),
    ...theDutiesOfTheAgentIn(agent.id, from).map(
      (one): AStayingRecord => ({ id: one.id, kind: SECRETARY_DUTIES_KIND, title: one.title, why: 'duties', because: BECAUSE.duties }),
    ),
  ]

  // THE RECORDS NAMED, the agent's record first. With no record here, the agent went ahead earlier and its ended runs
  // follow it now.
  const seeds = [...(itsRecord === null ? [] : [itsRecord]), ...ended.map((run) => run.id)]
  // NOTHING HERE CAN MOVE NOW. A preview says so as an answer, with where the agent's record is and what stays, so a
  // page read just after a press shows where the agent went. A press is refused, since it would move nothing.
  if (seeds.length === 0 && dryRun) {
    return {
      agent,
      from,
      to,
      dryRun,
      record: null,
      moving: [],
      staying,
      needsAlso: [],
      crossing: [],
      recordIsIn: theProjectsWithARecordOf(agent.id),
      rows: { records: 0, links: 0, changes: 0, revisions: 0, resources: 0, intent: 0 },
      bindingsRewritten: 0,
      note:
        `Nothing of "${agent.name}" in "${from}" can move now: it has no record here and no run here that has ended.` +
        (staying.length === 0 ? '' : ` ${staying.length} of its records stay here, each with why.`),
    }
  }
  if (seeds.length === 0) {
    const each = staying.map((one) => `"${one.title}", ${BECAUSE_IN_A_FEW_WORDS[one.why]}`).join('; ')
    const went = theProjectsWithARecordOf(agent.id).filter((project) => project !== from)
    throw new PanelError(
      `Nothing of "${agent.name}" in "${from}" can move now: it has no record here and no run here that has ended.` +
        nothingMoved +
        (went.length === 0 ? '' : ` Its record is in ${went.map((project) => `"${project}"`).join(', ')}.`) +
        (staying.length === 0
          ? ''
          : staying.length === 1
            ? ` 1 of its records stays here: ${each}.`
            : ` ${staying.length} of its records stay here: ${each}.`),
      404,
    )
  }
  const [first, ...withIt] = seeds as [string, ...string[]]

  const move = (): AnAgentsProjectMove => {
    const report = moveRecordToWorkspace(
      first,
      from,
      { to, withIt, ...(input.also === undefined ? {} : { also: input.also }), dryRun },
      actor,
    )
    let bindingsRewritten = 0
    if (!report.dryRun) for (const run of ended) if (rewriteTheBinding(run.id, agent.id, from, to, actor)) bindingsRewritten += 1
    const stays =
      staying.length === 0
        ? ' Nothing of it stays here.'
        : ` ${staying.length} of its records stay${report.dryRun ? '' : 'ed'} here, each with why.`
    return {
      agent,
      from,
      to,
      dryRun: report.dryRun,
      record: itsRecord,
      moving: report.moving,
      staying,
      needsAlso: report.needsAlso,
      crossing: report.crossing,
      recordIsIn: theProjectsWithARecordOf(agent.id),
      rows: report.rows,
      bindingsRewritten,
      note:
        report.note +
        stays +
        ' Messages are kept in the message centre and belong to no project, so none moves. A run started later from the ' +
        "agent's own checkout is filed where that checkout's settings say, which this move does not change.",
    }
  }
  return dryRun ? move() : sqlite.transaction(move)()
}
