// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A FLOW AN AGENT ENTERS HANGS ON THAT AGENT'S CHECKLIST UNTIL IT IS DONE, in wave 13j round
 * 52. src/shared/flow-run.ts holds the words and the stored shape; this file holds
 * what needs the database.
 *
 *   1. `enterAFlow`: an agent, or a person for an agent, enters a flow record about a record, from a run. In one write
 *      the office files a flow run that names the flow and the run, and puts one item on the checklist of the agent the
 *      run serves. POST /api/flows/:id/enter.
 *   2. `endTheFlowsARunWasIn`: when the run that entered a flow is sealed, released or ended, and the flow names that
 *      event in its `ends_on`, the office ticks the item itself and ends the flow run. Called by
 *      `recordTheStepsOfAChange` in lib/flow-runs.ts, and it never stops the run's own write.
 *   3. `anItemOfAFlowChangedByHand`: the agent or the person ticks the item by hand instead, and nobody else may change
 *      the item until the flow ends. Called by `changeAnItem` in lib/checklists.ts before it writes, with the item as
 *      it is stored, and it asks the planning flow's own check first.
 *
 * THE PLANNING FLOW USES THE SAME FILING, TICK AND END (lib/planning-flow.ts), and keeps its own door, codes and words.
 * NOTHING HERE STARTS A FLOW BY ITSELF: the office does not start flows.
 */

import { and, asc, eq, isNull, sql } from 'drizzle-orm'

import {
  BY_HAND,
  ENTERED_FLOW_FIELD,
  ENTERED_STEP_DOES,
  FLOW_ENDING_EVENTS,
  FLOW_RUN_KIND,
  THE_PLAN_IS_SUBMITTED,
  THE_STEP_OF_EACH_ENDING_EVENT,
  theEnteredItemWords,
  type EnteredFlow,
  type EnteredFlowEndsOn,
  type FlowEndingEvent,
  type FlowOnAChecklist,
  type FlowRunEnded,
} from '@shared/flow-run.ts'
import { sameParticipant } from '@shared/messages.ts'
import { moleOffice, type ParticipantRef } from '@shared/participants.ts'
import { PLANNING_FLOW_CODE, PLANNING_FLOW_RUN_MODULE_FIELD, anAgentsChecklistTitle, type ModulePlanning } from '@shared/planning-flow.ts'
import type { ChecklistReading, ChecklistRequest } from '@shared/checklists.ts'
import type { EnteredFlowRefusalCode } from '@shared/refusal-codes.ts'
import { localStamp } from '@shared/time.ts'
import type { PanelRecord } from '@shared/types.ts'
import { db, sqlite } from '../db/client.ts'
import { ONE_KIND_WRITTEN_OUT, STORED_FIELDS, records } from '../db/schema.ts'
import { addAnItem, changeAnItem, listChecklists, makeAChecklist } from './checklists.ts'
import { asTheFlowRunWriter } from './flow-run-door.ts'
import type { FlowRunStep } from './flow-runs.ts'
import { gateMet } from './gate-counts.ts'
import { nameOf } from './groups.ts'
import { sendTheHandbooksOfAFlowStart, type HandbooksAtAStart } from './handbooks.ts'
import { sendKnowledgeForFlowStep } from '../knowledge/flow-step.ts'
import { participantForActor } from './participant-for-actor.ts'
import { aPlanningItemChangedByHand } from './planning-flow.ts'
import { createRecordWithReport, getRecord, patchRecord, recordInWorkspace, type Actor } from './records.ts'
import { resolveSessionRef } from './resolve-session-ref.ts'
import { PanelError } from './panel-error.ts'
import { theAgentARunServes } from './the-agent-a-run-serves.ts'

function theOffice(): Actor { return { type: 'system', id: moleOffice().id } }
function theOfficeAsAStepsActor(): ParticipantRef { return { kind: 'agent', id: moleOffice().id } }
function refused(message: string, status: number, code: EnteredFlowRefusalCode): PanelError {
  return new PanelError(message, status, undefined, undefined, undefined, { code, values: {} })
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

function isTheOffice(actor: Actor): boolean {
  return actor.type === theOffice().type && actor.id === theOffice().id
}

/** A step the office or a caller did at one moment, done. */
export function aStep(does: string, at: string, who: ParticipantRef, extra: Partial<FlowRunStep> = {}): FlowRunStep {
  const how = extra.how ?? (who.id === moleOffice().id ? 'by the office' : 'by an agent')
  return { does, actor: who, startedAt: at, endedAt: at, how, outcome: 'done', ...extra }
}

/** The `entered` a flow run holds, or null on a flow run nobody entered. */
export function enteredOf(flowRun: PanelRecord): EnteredFlow | null {
  const held = (flowRun.data as Record<string, unknown>)[ENTERED_FLOW_FIELD]
  return isObject(held) ? (held as unknown as EnteredFlow) : null
}

function endedOf(flowRun: PanelRecord): FlowRunEnded | null {
  const held = (flowRun.data as Record<string, unknown>)['ended']
  return isObject(held) ? (held as unknown as FlowRunEnded) : null
}

// ============================================================================ the filing every entered flow shares

/**
 * THE AGENT'S CHECKLIST IN THIS PROJECT: the one named, when it is the agent's; else the only one; else the newest
 * changed; else none, and the filing makes one. `because` says which, for the reply, in words that name the agent as
 * `who` does ("the planner", "the agent"). A named checklist that is not the agent's is refused with `notTheirs`.
 */
export function theAgentsChecklist(
  agent: ParticipantRef,
  workspaceId: string,
  actor: Actor,
  named: string | undefined,
  who: string,
  notTheirs: () => PanelError,
): { checklist: ChecklistReading | null; because: string } {
  const theirs = listChecklists({ workspaceId, actor, whose: { owner: agent } }).checklists
  if (named !== undefined) {
    const found = theirs.find((one) => one.id === named)
    if (found === undefined) throw notTheirs()
    return { checklist: found, because: 'the checklist the request named' }
  }
  if (theirs.length === 0) return { checklist: null, because: `${who} had no checklist in this project, so the office made one` }
  if (theirs.length === 1) return { checklist: theirs[0]!, because: `${who}'s only checklist in this project` }
  const newest = [...theirs].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0))[0]!
  return {
    checklist: newest,
    because: `${who} has ${String(theirs.length)} checklists in this project, and this is the one changed most recently. Name another with checklist`,
  }
}

/** What the filing made: the flow run, the checklist the item went on, and the item. */
export interface AFiledFlowRun {
  flowRun: PanelRecord
  checklist: ChecklistReading
  item: ChecklistRequest
  entered: EnteredFlow
}

/**
 * FILE THE FLOW RUN AND PUT THE ITEM ON THE AGENT'S CHECKLIST. The caller runs this inside its own transaction, after
 * every check. The flow run is filed first, so the item can link it; then the item; then the flow run's `entered`
 * names the item. The item is the office's, and its words say so.
 */
export function fileAnEnteredFlowRun(input: {
  workspaceId: string
  title: string
  /** The flow run's data apart from `entered`: `run`, the flow, the first step and, for planning, `module`. */
  data: Record<string, unknown>
  about: string
  forAgent: ParticipantRef
  by: ParticipantRef
  at: string
  endsOn: EnteredFlowEndsOn | undefined
  chosen: { checklist: ChecklistReading | null }
  itemWords: string
  /** What the item links before the flow run: the record it is about, and for planning its pipeline. */
  itemLinks: string[]
}): AFiledFlowRun {
  const flowRun = asTheFlowRunWriter(() =>
    createRecordWithReport({
      kind: FLOW_RUN_KIND,
      title: input.title,
      workspaceId: input.workspaceId,
      data: input.data,
      links: [{ type: 'about', toId: input.about }],
      actor: theOffice(),
      bindCallerSession: false,
    }),
  ).record
  const checklist =
    input.chosen.checklist ??
    makeAChecklist({ workspaceId: input.workspaceId, said: { title: anAgentsChecklistTitle(nameOf(input.forAgent)) }, actor: theOffice(), forOwner: input.forAgent })
  const added = addAnItem({
    workspaceId: input.workspaceId,
    id: checklist.id,
    said: { words: input.itemWords, links: [...input.itemLinks, flowRun.id] },
    actor: theOffice(),
  })
  const entered: EnteredFlow = {
    for: input.forAgent,
    by: input.by,
    at: input.at,
    about: input.about,
    checklistItem: { checklist: checklist.id, item: added.item.id },
    ...(input.endsOn === undefined ? {} : { endsOn: input.endsOn }),
  }
  const written = asTheFlowRunWriter(() => patchRecord(flowRun.id, { dataPatch: { [ENTERED_FLOW_FIELD]: entered } }, theOffice())).record
  return { flowRun: written, checklist: added.checklist, item: added.item, entered }
}

/**
 * Append steps to a flow run somebody entered, and when it ends, write its own `ended` in the same write. The planning
 * flow ends through this too (wave 13j round 51: "ended" used to be written only on the module).
 */
export function endAFlowRun(flowRun: string, steps: readonly FlowRunStep[], ended?: FlowRunEnded): void {
  const held = getRecord(flowRun)
  if (held === null) throw new PanelError(`Flow run ${flowRun} is not there, so its steps could not be written. Nothing was changed.`, 409)
  const before = (held.data as Record<string, unknown>)['stepsTaken']
  asTheFlowRunWriter(() =>
    patchRecord(
      flowRun,
      { dataPatch: { stepsTaken: [...(Array.isArray(before) ? (before as FlowRunStep[]) : []), ...steps], ...(ended === undefined ? {} : { ended }) } },
      theOffice(),
    ),
  )
}

/**
 * THE OFFICE TICKS THE ITEM OF A FLOW, with the run as its evidence. A checklist taken away, or an item that cannot be
 * done, is said in `notTicked` and does not undo what ended the flow.
 */
export function tickTheItemOfAFlow(item: { checklist: string; item: string }, run: string): { checklist: string; item: string; state: string } | { notTicked: string } {
  const checklist = getRecord(item.checklist)
  if (checklist === null) return { notTicked: `Checklist ${item.checklist} is not there.` }
  try {
    const tick = changeAnItem({
      workspaceId: checklist.workspaceId,
      id: item.checklist,
      itemId: item.item,
      said: { state: 'done', addEvidence: [{ kind: 'run', record: run }] },
      actor: theOffice(),
    })
    return { checklist: item.checklist, item: tick.item.id, state: tick.item.state }
  } catch (error) {
    if (!(error instanceof PanelError)) throw error
    return { notTicked: error.message }
  }
}

// ============================================================================ the door: entering a flow

/** The flow's newest revision, or the sentence for why there is none. */
function theFlowAsEntered(flow: PanelRecord): Record<string, unknown> {
  const revision = sqlite
    .prepare('SELECT seq, content_hash AS contentHash FROM revisions WHERE record_id = ? ORDER BY seq DESC LIMIT 1')
    .get(flow.id) as { seq: number; contentHash: string } | undefined
  return revision === undefined ? { flow: flow.id, noFlow: `Flow ${flow.id} has no revision to name.` } : { flow: flow.id, flowRevision: revision }
}

/** The flow's `ends_on`, when it names one of the events the office sees. */
function theEventItEndsOn(flow: PanelRecord): FlowEndingEvent | undefined {
  const named = (flow.data as Record<string, unknown>)['ends_on']
  return (FLOW_ENDING_EVENTS as readonly unknown[]).includes(named) ? (named as FlowEndingEvent) : undefined
}

export interface AFlowIsEntered {
  flowRun: string
  flow: string
  run: string
  about: string
  entered: EnteredFlow
  checklist: { id: string; title: string; because: string }
  item: ChecklistRequest
  says: string
  /** There only when an in-use handbook hangs on the flow or one of its steps (lib/handbooks.ts). */
  handbooks?: HandbooksAtAStart
}

export function enterAFlow(input: { workspaceId: string; flowId: string; about: string; run?: string; checklist?: string; actor: Actor }): AFlowIsEntered {
  const flow = recordInWorkspace(input.flowId, input.workspaceId)
  if (flow.kind !== 'flow' || flow.deletedAt !== null) {
    throw refused(`${flow.id} is not a live flow record, and only a flow can be entered. Nothing was changed.`, 409, 'flowNotAFlow')
  }
  const governedBy = (flow.data as Record<string, unknown>)['governed_by']
  if (typeof governedBy === 'string' && governedBy.trim() === PLANNING_FLOW_CODE) {
    throw refused(
      `Flow "${flow.title}" (${flow.id}) is the planning flow, and it is entered by its own door: the planner says the plan ` +
        'step is done with POST /api/modules/<module>/plan-step-done. Nothing was changed.',
      409,
      'flowEnteredByItsOwnDoor',
    )
  }
  const about = getRecord(input.about)
  if (about === null || about.deletedAt !== null || about.workspaceId !== input.workspaceId) {
    throw refused(`${input.about} names no live record in this project, so the flow cannot be about it. Nothing was changed.`, 409, 'flowAboutNotHere')
  }
  const caller = participantForActor(input.actor)
  const named = input.run ?? (caller?.kind === 'agent' ? input.actor.sessionId : undefined) ?? null
  const run = named === null ? null : resolveSessionRef(named, input.workspaceId).recordId
  if (run === null) {
    throw refused(
      'Entering a flow puts an item on the checklist of the agent a run serves, and this request names no run this project ' +
        'holds. An agent sends its run in the x-mole-office-session header; a person names it in run. Nothing was changed.',
      400,
      'flowNeedsARun',
    )
  }
  const runRecord = getRecord(run)
  const served = runRecord === null ? null : theAgentARunServes(runRecord.data as Record<string, unknown>)
  const agent: ParticipantRef | null = served === null ? null : participantForActor({ type: 'agent', id: served.id })
  if (agent === null) {
    throw refused(`Run ${run} names no agent this office knows, so there is no checklist to put the flow on. Nothing was changed.`, 409, 'flowRunServesNoAgent')
  }
  if (caller === null || (caller.kind !== 'person' && !sameParticipant(caller, agent))) {
    throw refused(
      `Run ${run} serves ${nameOf(agent)}, and only that agent or the person may enter a flow for it. This request was made by ` +
        `${caller === null ? `${input.actor.type} "${input.actor.id}"` : nameOf(caller)}. Nothing was changed.`,
      403,
      'flowEnteredForAnother',
    )
  }
  const open = theOpenFlowRun(flow.id, run, about.id)
  if (open !== null) {
    throw refused(
      `${nameOf(agent)} already entered flow "${flow.title}" about "${about.title}" from run ${run}, in flow run ${open}, ` +
        'and it has not ended. Tick its checklist item when it is done. Nothing was changed.',
      409,
      'flowAlreadyEntered',
    )
  }
  const chosen = theAgentsChecklist(agent, input.workspaceId, input.actor, input.checklist, 'the agent', () =>
    refused(
      `Checklist ${input.checklist ?? ''} is not one of ${nameOf(agent)}'s checklists in this project. Leave checklist out and ` +
        "the office uses the agent's own. Nothing was changed.",
      409,
      'flowChecklistNotTheirs',
    ),
  )
  const at = localStamp(new Date())
  const endsOn = theEventItEndsOn(flow)

  return sqlite.transaction((): AFlowIsEntered => {
    const filed = fileAnEnteredFlowRun({
      workspaceId: input.workspaceId,
      title: `Flow run: ${flow.title}, about ${about.title}`,
      data: {
        run,
        ...theFlowAsEntered(flow),
        stepsTaken: [aStep(ENTERED_STEP_DOES.entered, at, caller, { ...(caller.kind === 'person' ? { how: BY_HAND, why: 'The person entered the flow for the agent.' } : {}), evidence: `flow ${flow.id}` })],
      },
      about: about.id,
      forAgent: agent,
      by: caller,
      at,
      endsOn,
      chosen,
      itemWords: theEnteredItemWords(flow.title, about.title, endsOn),
      itemLinks: [about.id],
    })
    const handbooks = sendTheHandbooksOfAFlowStart({ flow: flow.id, flowRun: filed.flowRun.id, run, workspaceId: input.workspaceId, to: () => agent })
    sendKnowledgeForFlowStep({ project: input.workspaceId, flow: flow.id, step: 1, flowRun: filed.flowRun.id, run, to: () => agent })
    return {
      flowRun: filed.flowRun.id,
      flow: flow.id,
      run,
      about: about.id,
      entered: filed.entered,
      checklist: { id: filed.checklist.id, title: filed.checklist.title, because: chosen.because },
      item: filed.item,
      says:
        `${nameOf(agent)} is in flow "${flow.title}" about "${about.title}". The office filed flow run ${filed.flowRun.id} and put ` +
        `item ${filed.item.id} on checklist "${filed.checklist.title}" (${chosen.because}). ` +
        (endsOn === undefined
          ? 'The flow names no event that ends it, so the item is ticked by hand, by that agent or the person.'
          : `The office ticks it when ${endsOn}; that agent or the person may tick it by hand before then.`),
      ...(handbooks === null ? {} : { handbooks }),
    }
  })()
}

/** The open flow run of one flow, entered from one run about one record, or null. */
function theOpenFlowRun(flow: string, run: string, about: string): string | null {
  const row = db
    .select({ id: records.id })
    .from(records)
    .where(
      and(
        ONE_KIND_WRITTEN_OUT.flowRun,
        isNull(records.deletedAt),
        eq(STORED_FIELDS.flowRunRun(records.data), run),
        sql`json_extract(${records.data}, '$.flow') = ${flow}`,
        sql`json_extract(${records.data}, '$.entered.about') = ${about}`,
        sql`json_extract(${records.data}, '$.ended') IS NULL`,
      ),
    )
    .limit(1)
    .get()
  return row?.id ?? null
}

// ============================================================================ done, by an event

/**
 * THE RUN WAS SEALED, RELEASED OR ENDED: end every open flow it entered whose flow named that event. Each in its own
 * savepoint; one that fails is rolled back alone and filed as a problem by `fileAProblem`, and the run's write goes on.
 * Returns the ids of the flow runs it ended.
 */
export function endTheFlowsARunWasIn(
  runId: string,
  steps: readonly FlowRunStep[],
  at: string,
  fileAProblem: (what: string, because: string, workspaceId: string) => void,
): string[] {
  const events = FLOW_ENDING_EVENTS.filter((event) => steps.some((step) => step.does === THE_STEP_OF_EACH_ENDING_EVENT[event]))
  if (events.length === 0) return []
  const open = db
    .select({ id: records.id })
    .from(records)
    .where(
      and(
        ONE_KIND_WRITTEN_OUT.flowRun,
        isNull(records.deletedAt),
        eq(STORED_FIELDS.flowRunRun(records.data), runId),
        sql`json_extract(${records.data}, ${'$.' + PLANNING_FLOW_RUN_MODULE_FIELD}) IS NULL`,
        sql`json_extract(${records.data}, '$.ended') IS NULL`,
        sql`json_extract(${records.data}, '$.entered.endsOn') IN (${sql.join(events.map((event) => sql`${event}`), sql`, `)})`,
      ),
    )
    .orderBy(asc(records.createdAt), asc(records.id))
    .all()
  const ended: string[] = []
  for (const { id } of open) {
    const flowRun = getRecord(id)
    const entered = flowRun === null ? null : enteredOf(flowRun)
    if (flowRun === null || entered === null || entered.endsOn === undefined || entered.endsOn === THE_PLAN_IS_SUBMITTED) continue
    const how = entered.endsOn
    try {
      sqlite.transaction(() => {
        const ticked = tickTheItemOfAFlow(entered.checklistItem, runId)
        endAFlowRun(
          id,
          [
            aStep(ENTERED_STEP_DOES.endedByEvent, at, theOfficeAsAStepsActor(), {
              ...('notTicked' in ticked
                ? { outcome: 'failed', result: `The flow ended when ${how}, and the checklist item was not ticked: ${ticked.notTicked}` }
                : { result: `The flow ended when ${how}. Checklist ${ticked.checklist} item ${ticked.item} is ticked.` }),
              evidence: `run ${runId}`,
            }),
          ],
          { at, how, by: theOfficeAsAStepsActor() },
        )
      })()
      ended.push(id)
    } catch (error) {
      fileAProblem(`Flow run ${id} was not ended`, error instanceof Error ? error.message : String(error), flowRun.workspaceId)
    }
  }
  return ended
}

// ============================================================================ done, by hand

/**
 * Any change but a tick, by somebody other than the person or the agent in the flow, to the item of a flow that has not
 * ended. The planning flow's check refuses with it too, naming the plan.
 */
export function aFlowItemChangedByAnother(item: string, flow: string): PanelError {
  return refused(
    `Item ${item} stands for ${flow}, which has not ended. Until it ends, only the person or the agent in the flow may ` +
      'change the item. Nothing was changed.',
    403,
    'flowItemChangedByAnother',
  )
}

/**
 * A CHANGE TO AN ITEM THAT STANDS FOR A FLOW THAT HAS NOT ENDED. Asked by `changeAnItem` before it writes, with the item
 * AS IT IS STORED, never as the change would leave it: a change that drops or replaces the flow run's link must not
 * hide the flow from this check (wave 13j round 52b, check pgPCts6JVPZ9). The planning flow's own check is asked first,
 * with its own refusal for a tick. Null when the item stands for no open flow, or when the office itself is changing it
 * (an event, which ends the flow run itself). Otherwise it refuses anybody but the person and the agent the flow is
 * for: a tick with flowItemTickedByAnother, any other change with flowItemChangedByAnother. For a tick by one of them
 * it returns the write that ends the flow run as ticked by hand, which `changeAnItem` runs in the same transaction as
 * the tick; for any other change by one of them, null.
 */
export function anItemOfAFlowChangedByHand(checklistId: string, item: ChecklistRequest, ticks: boolean, actor: Actor): (() => void) | null {
  const planning = aPlanningItemChangedByHand(checklistId, item, ticks, actor)
  if (planning !== null) return planning
  if (isTheOffice(actor)) return null
  for (const id of item.links ?? []) {
    const flowRun = getRecord(id)
    if (flowRun === null || flowRun.kind !== FLOW_RUN_KIND || flowRun.deletedAt !== null) continue
    if ((flowRun.data as Record<string, unknown>)[PLANNING_FLOW_RUN_MODULE_FIELD] !== undefined) continue
    const entered = enteredOf(flowRun)
    if (entered === null || endedOf(flowRun) !== null) continue
    if (entered.checklistItem.checklist !== checklistId || entered.checklistItem.item !== item.id) continue
    const who = participantForActor(actor)
    const mayChange = who !== null && (who.kind === 'person' || sameParticipant(who, entered.for) || gateMet('who-changes-a-flows-item') === 'off')
    if (!mayChange && !ticks) throw aFlowItemChangedByAnother(item.id, `a flow ${nameOf(entered.for)} is in`)
    if (who === null || !mayChange) {
      throw refused(
        `Item ${item.id} stands for a flow ${nameOf(entered.for)} is in, which has not ended. Only the person or that agent ` +
          'may tick it by hand. Nothing was changed.',
        403,
        'flowItemTickedByAnother',
      )
    }
    if (!ticks) return null
    return () => {
      const at = localStamp(new Date())
      endAFlowRun(
        flowRun.id,
        [
          aStep(ENTERED_STEP_DOES.tickedByHand, at, who, {
            ...(who.kind === 'person'
              ? { how: BY_HAND, why: 'The person ticked the checklist item themself.' }
              : { how: 'by an agent' }),
            result: `Checklist ${checklistId} item ${item.id} is done.`,
            evidence: `checklist ${checklistId}`,
          }),
        ],
        { at, how: 'ticked by hand', by: who },
      )
    }
  }
  return null
}

// ============================================================================ the checklist's reading

/**
 * THE FLOWS A CHECKLIST'S ITEMS STAND FOR: one for each item that links a flow run somebody entered, the planning flow
 * included. One read of the linked flow runs, then their flows and what they are about. A planning flow run filed before
 * wave 13j round 52 has no `entered`; its module is what it is about, it ends when the plan is submitted, and its end is
 * the flow run's own or, before round 51 wrote that, the module's.
 */
export function theFlowsOnAChecklist(items: readonly ChecklistRequest[]): FlowOnAChecklist[] {
  const linked = [...new Set(items.flatMap((item) => item.links ?? []))]
  if (linked.length === 0) return []
  const rows = sqlite
    .prepare(
      `SELECT id, data FROM records WHERE kind = 'flow_run' AND deleted_at IS NULL AND id IN (${linked.map(() => '?').join(', ')}) ` +
        "AND (json_extract(data, '$.entered') IS NOT NULL OR json_extract(data, '$.module') IS NOT NULL)",
    )
    .all(...linked) as Array<{ id: string; data: string }>
  const flowRuns = new Map(rows.map((row) => [row.id, JSON.parse(row.data) as Record<string, unknown>]))
  const titleOf = (id: string | null): string | null => (id === null ? null : getRecord(id)?.title ?? null)
  const found: FlowOnAChecklist[] = []
  for (const item of items) {
    for (const link of item.links ?? []) {
      const data = flowRuns.get(link)
      if (data === undefined) continue
      const entered = isObject(data[ENTERED_FLOW_FIELD]) ? (data[ENTERED_FLOW_FIELD] as unknown as EnteredFlow) : null
      const module = typeof data[PLANNING_FLOW_RUN_MODULE_FIELD] === 'string' ? (data[PLANNING_FLOW_RUN_MODULE_FIELD] as string) : null
      const about = entered?.about ?? module
      if (about === null) continue
      const flow = typeof data['flow'] === 'string' ? data['flow'] : null
      let ended = isObject(data['ended']) ? (data['ended'] as unknown as FlowRunEnded) : null
      if (ended === null && module !== null) {
        const planning = (getRecord(module)?.data as Record<string, unknown> | undefined)?.['planning'] as ModulePlanning | undefined
        if (planning?.flowRun === link && planning.ended !== undefined) ended = planning.ended
      }
      found.push({
        item: item.id,
        flowRun: link,
        flow,
        flowTitle: titleOf(flow),
        about,
        aboutTitle: titleOf(about),
        endsOn: entered === null ? (module === null ? null : THE_PLAN_IS_SUBMITTED) : entered.endsOn ?? null,
        ended,
      })
      break
    }
  }
  return found
}
