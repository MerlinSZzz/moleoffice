// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE FLOW FOR PLANNING A BIG PIECE OF WORK: THE TWO DOORS' WORK AND THE HAND TICK. It follows a
 * decision, recorded in a message, and stands on the earlier
 * decision. src/shared/planning-flow.ts holds the questions and the words; this file
 * holds what needs the database, and is the one writer of a module's `planning` (lib/planning-door.ts).
 *
 *   1. `sayThePlanStepIsDone`: the planner named on the module says the plan is in the module and drawn as one of its
 *      pipelines. In one write the office files a planning flow run, puts an item on the planner's own checklist,
 *      sends the planner the four questions and records the planning on the module.
 *   2. `submitThePlan`: the planner sends a short answer to each question. In one write the office records when the
 *      plan was questioned and the answers, ends the planning and ticks the item itself.
 *   3. `aPlanningItemChangedByHand`: the person or the planner ticks the item by hand instead. The planning ends as
 *      ticked by hand, and the flow run says so. Nobody else may change the item until then. Called by `changeAnItem`
 *      in lib/checklists.ts.
 *
 * EVERY DOOR CHECKS EVERYTHING BEFORE IT WRITES ANYTHING. Execution is a separate flow, and nothing here starts it.
 */

import { and, desc, eq, isNull } from 'drizzle-orm'

import { blockIdsOf } from '@shared/blocks.ts'
import { BY_HAND, FLOW_RUN_KIND, THE_PLAN_IS_SUBMITTED } from '@shared/flow-run.ts'
import { SYSTEM_LINES } from '@shared/groups.ts'
import { sameParticipant } from '@shared/messages.ts'
import { moleOffice, type ParticipantRef } from '@shared/participants.ts'
import {
  NO_PLANNING_FLOW_RECORD,
  PLANNING_FLOW_CODE,
  PLANNING_FLOW_RUN_MODULE_FIELD,
  PLANNING_STEP_DOES,
  severalPlanningFlowRecords,
  thePlanningItemWords,
  whatChangedSays,
  whatTheRevisionsSay,
  type ModulePlanning,
  type PlanAnswers,
  type PlanEnded,
  type PlanRevisions,
} from '@shared/planning-flow.ts'
import type { ChecklistReading, ChecklistRequest } from '@shared/checklists.ts'
import type { PlanningFlowRefusalCode } from '@shared/refusal-codes.ts'
import { localStamp } from '@shared/time.ts'
import type { PanelRecord } from '@shared/types.ts'
import { db, sqlite } from '../db/client.ts'
import { records } from '../db/schema.ts'
import { aFlowItemChangedByAnother, aStep, endAFlowRun, fileAnEnteredFlowRun, theAgentsChecklist, tickTheItemOfAFlow } from './entered-flows.ts'
import { nameOf, writeASystemLineToOne } from './groups.ts'
import { participantForActor } from './participant-for-actor.ts'
import { asThePlanningDoors } from './planning-door.ts'
import { getRecord, patchRecord, recordInWorkspace, resolveLinks, type Actor } from './records.ts'
import { resolveSessionRef } from './resolve-session-ref.ts'
import { PanelError } from './panel-error.ts'

function theOffice(): Actor { return { type: 'system', id: moleOffice().id } }
function theOfficeAsAStepsActor(): ParticipantRef { return { kind: 'agent', id: moleOffice().id } }
function refused(message: string, status: number, code: PlanningFlowRefusalCode): PanelError {
  return new PanelError(message, status, undefined, undefined, undefined, { code, values: {} })
}

// ============================================================================ what the doors read

/** The module, in this project, or the refusal for a record that is not one. */
function theModule(id: string, workspaceId: string): PanelRecord {
  const record = recordInWorkspace(id, workspaceId)
  if (record.kind !== 'module' || record.deletedAt !== null) {
    throw refused(`${id} is not a live module, and the planning flow runs on a module. Nothing was changed.`, 409, 'planNotAModule')
  }
  return record
}

function planningOf(module: PanelRecord): ModulePlanning | null {
  const held = (module.data as Record<string, unknown>)['planning']
  return typeof held === 'object' && held !== null ? (held as ModulePlanning) : null
}

function plannerOf(module: PanelRecord): ParticipantRef | null {
  const held = (module.data as Record<string, unknown>)['planner']
  return typeof held === 'object' && held !== null ? (held as ParticipantRef) : null
}

/** The caller, when the caller is the planner the module names; otherwise the refusal that says which is missing. */
function theCallerAsThePlanner(module: PanelRecord, actor: Actor): ParticipantRef {
  const planner = plannerOf(module)
  if (planner === null) {
    throw refused(
      `Module "${module.title}" (${module.id}) names no planner, so nobody may use the planning doors on it. Name the ` +
        'planner in the module\'s planner field first. Nothing was changed.',
      409,
      'planModuleNamesNoPlanner',
    )
  }
  const me = participantForActor(actor)
  if (me === null || !sameParticipant(me, planner)) {
    throw refused(
      `Only the planner module "${module.title}" names, ${nameOf(planner)}, may use the planning doors on it, and this ` +
        `request was made by ${me === null ? `${actor.type} "${actor.id}"` : nameOf(me)}. Nothing was changed.`,
      403,
      'planCallerIsNotThePlanner',
    )
  }
  return me
}

/** The session record the caller's request names, or the refusal: the flow run and the evidence both name it. */
function theCallersRun(actor: Actor, workspaceId: string): string {
  const named = actor.sessionId ?? null
  const run = named === null ? null : resolveSessionRef(named, workspaceId).recordId
  if (run === null) {
    throw refused(
      'The planning doors record the run you are working in, and this request names none that this project holds. ' +
        'Send the x-mole-office-session header with your run. Nothing was changed.',
      400,
      'planNeedsARun',
    )
  }
  return run
}

/**
 * THE MODULE'S PIPELINES: every live pipeline in its project linked to the module either way, and every one that holds
 * the module, or a record linked to it, as a block. One scan of the project's pipelines.
 */
export function thePipelinesOfAModule(module: PanelRecord): PanelRecord[] {
  const linked = resolveLinks(module.id).filter((link) => !link.broken)
  const direct = new Set(linked.filter((link) => link.other.kind === 'pipeline').map((link) => link.other.id))
  const near = new Set([module.id, ...linked.map((link) => link.other.id)])
  return db
    .select()
    .from(records)
    .where(and(eq(records.kind, 'pipeline'), eq(records.workspaceId, module.workspaceId), isNull(records.deletedAt)))
    .orderBy(desc(records.updatedAt), desc(records.id))
    .all()
    .map((row) => getRecord(row.id))
    .filter((pipeline): pipeline is PanelRecord => pipeline !== null)
    .filter((pipeline) => direct.has(pipeline.id) || blockIdsOf(pipeline).some((id) => near.has(id)))
}

/**
 * THE FLOW A PLANNING FLOW RUN FOLLOWS: the one live flow record, in any project, whose `governed_by` is the planning
 * code, with its newest revision. With none or several, the sentence that says so, and no flow.
 */
function theGoverningFlow(): Record<string, unknown> {
  const ids = (
    sqlite
      .prepare(
        "SELECT id FROM records WHERE kind = 'flow' AND deleted_at IS NULL AND trim(json_extract(data, '$.governed_by')) = ? ORDER BY created_at, id",
      )
      .all(PLANNING_FLOW_CODE) as Array<{ id: string }>
  ).map((row) => row.id)
  if (ids.length === 0) return { noFlow: NO_PLANNING_FLOW_RECORD }
  if (ids.length > 1) return { noFlow: severalPlanningFlowRecords(ids) }
  const flow = ids[0]!
  const revision = sqlite
    .prepare('SELECT seq, content_hash AS contentHash FROM revisions WHERE record_id = ? ORDER BY seq DESC LIMIT 1')
    .get(flow) as { seq: number; contentHash: string } | undefined
  return revision === undefined ? { flow, noFlow: `Flow ${flow} has no revision to name.` } : { flow, flowRevision: revision }
}

/**
 * THE PLANNER'S CHECKLIST IN THIS PROJECT: the one named, when it is the planner's; else the only one; else the newest
 * changed; else none, and the filing makes one. The choice every entered flow makes (lib/entered-flows.ts), with the
 * planning flow's own refusal.
 */
function thePlannersChecklist(
  planner: ParticipantRef,
  workspaceId: string,
  actor: Actor,
  named: string | undefined,
): { checklist: ChecklistReading | null; because: string } {
  return theAgentsChecklist(planner, workspaceId, actor, named, 'the planner', () =>
    refused(
      `Checklist ${named ?? ''} is not one of ${nameOf(planner)}'s checklists in this project. Leave checklist out and the ` +
        'office uses the planner\'s own. Nothing was changed.',
      409,
      'planChecklistNotThePlanners',
    ),
  )
}

// ============================================================================ the flow run's steps

/**
 * Append steps to a planning flow run, and when the planning ends, write the flow run's own `ended` in the same write.
 * Every entered flow ends through the same write (lib/entered-flows.ts).
 */
const appendToTheFlowRun = endAFlowRun

/** The newest revision number of one record, read from the ledger; 0 when it has none. */
function newestRevision(id: string): number {
  const row = sqlite.prepare('SELECT max(seq) AS seq FROM revisions WHERE record_id = ?').get(id) as { seq: number | null }
  return row.seq ?? 0
}

/** Where the plan's records stand now: the module, the pipeline, and each block the pipeline holds now. */
function theRevisionsNow(moduleId: string, pipelineId: string): PlanRevisions {
  const pipeline = getRecord(pipelineId)
  return {
    module: newestRevision(moduleId),
    pipeline: newestRevision(pipelineId),
    blocks: (pipeline === null ? [] : blockIdsOf(pipeline)).map((id) => ({ block: id, seq: newestRevision(id) })),
  }
}

function writeThePlanning(module: PanelRecord, planning: ModulePlanning, note: string): PanelRecord {
  return asThePlanningDoors(() => patchRecord(module.id, { dataPatch: { planning } }, theOffice(), { op: 'update', note }).record)
}

// ============================================================================ door 1: the plan step is done

export interface ThePlanStepIsDone {
  module: string
  planning: ModulePlanning
  flowRun: { id: string; flow: string | null; noFlow: string | null }
  checklist: { id: string; title: string; because: string }
  item: ChecklistRequest
  prompt: { id: string; line: string; said: string }
  says: string
}

export function sayThePlanStepIsDone(input: {
  workspaceId: string
  moduleId: string
  pipeline: string
  checklist?: string
  actor: Actor
}): ThePlanStepIsDone {
  const module = theModule(input.moduleId, input.workspaceId)
  const planner = theCallerAsThePlanner(module, input.actor)
  const run = theCallersRun(input.actor, input.workspaceId)
  const open = planningOf(module)
  if (open !== null && open.ended === undefined) {
    throw refused(
      `The plan step of module "${module.title}" was said to be done at ${open.planStepDoneAt}, and that plan has not been ` +
        `submitted. Submit it with POST /api/modules/${module.id}/plan, or tick checklist item ${open.checklistItem.item} by ` +
        'hand. Nothing was changed.',
      409,
      'planStepAlreadyDone',
    )
  }
  const pipelines = thePipelinesOfAModule(module)
  if (pipelines.length === 0) {
    throw refused(
      `Module "${module.title}" has no pipeline: no pipeline in this project is linked to it or holds it or a record ` +
        'linked to it. Draw the plan as a pipeline and link it to the module, then say the plan step is done. Nothing was changed.',
      409,
      'planModuleHasNoPipeline',
    )
  }
  const pipeline = pipelines.find((one) => one.id === input.pipeline)
  if (pipeline === undefined) {
    throw refused(
      `${input.pipeline} is not one of the pipelines of module "${module.title}". Its pipelines are ` +
        `${pipelines.map((one) => `${one.id} ("${one.title}")`).join(', ')}. Nothing was changed.`,
      409,
      'planPipelineNotTheModules',
    )
  }
  const chosen = thePlannersChecklist(planner, input.workspaceId, input.actor, input.checklist)
  const at = localStamp(new Date())
  const flow = theGoverningFlow()

  return sqlite.transaction((): ThePlanStepIsDone => {
    // THE PLANNING FLOW IS ENTERED LIKE ANY FLOW (wave 13j round 52): the same filing puts the item on the planner's
    // checklist and writes the flow run's `entered`. Its end is the submit, which only this file fires.
    const filed = fileAnEnteredFlowRun({
      workspaceId: module.workspaceId,
      title: `Planning flow run: ${module.title}`,
      data: {
        run,
        ...flow,
        [PLANNING_FLOW_RUN_MODULE_FIELD]: module.id,
        stepsTaken: [aStep(PLANNING_STEP_DOES.planStepDone, at, planner, { result: `Pipeline ${pipeline.id}`, evidence: `module ${module.id}` })],
      },
      about: module.id,
      forAgent: planner,
      by: planner,
      at,
      endsOn: THE_PLAN_IS_SUBMITTED,
      chosen,
      itemWords: thePlanningItemWords(module.title),
      itemLinks: [module.id, pipeline.id],
    })
    const { flowRun, checklist, item } = filed
    const added = { item }
    const line = SYSTEM_LINES.questionThePlan(module.title, module.id, pipeline.id, checklist.title, added.item.id)
    const prompt = writeASystemLineToOne(planner, input.workspaceId, line, theOffice(), { run })
    appendToTheFlowRun(flowRun.id, [
      aStep(PLANNING_STEP_DOES.promptSent, at, theOfficeAsAStepsActor(), {
        result: `Message ${prompt.id}; checklist ${checklist.id} item ${added.item.id}`,
        evidence: `message ${prompt.id}`,
      }),
    ])
    // THE MODULE'S REVISION IS THE ONE THIS WRITE MAKES, so a later write of anybody's moves it and the office's own
    // does not. Worked out before the write and checked after it; a mismatch rolls the whole plan step back.
    const now = theRevisionsNow(module.id, pipeline.id)
    const revisionsAtPlanStep: PlanRevisions = { ...now, module: now.module + 1 }
    const planning: ModulePlanning = {
      pipeline: pipeline.id,
      flowRun: flowRun.id,
      planStepDoneAt: at,
      planStepDoneBy: planner,
      prompt: prompt.id,
      checklistItem: { checklist: checklist.id, item: added.item.id },
      revisionsAtPlanStep,
    }
    writeThePlanning(module, planning, `${nameOf(planner)} said the plan step is done; the office sent the four questions.`)
    if (newestRevision(module.id) !== revisionsAtPlanStep.module) {
      throw new PanelError(
        `The plan step expected to leave module ${module.id} at revision ${String(revisionsAtPlanStep.module)}, and it is at ` +
          `${String(newestRevision(module.id))}, so the revision it would record is wrong. Nothing was changed.`,
        500,
      )
    }
    return {
      module: module.id,
      planning,
      flowRun: {
        id: flowRun.id,
        flow: typeof flow['flow'] === 'string' ? flow['flow'] : null,
        noFlow: typeof flow['noFlow'] === 'string' ? flow['noFlow'] : null,
      },
      checklist: { id: checklist.id, title: checklist.title, because: chosen.because },
      item: added.item,
      prompt: { id: prompt.id, line: line.line, said: line.said ?? '' },
      says:
        `The plan step of "${module.title}" is recorded. The office sent you the four questions in message ${prompt.id} and ` +
        `put item ${added.item.id} on checklist "${checklist.title}" (${chosen.because}). Question the plan, revise it, and ` +
        `submit it with POST /api/modules/${module.id}/plan.`,
    }
  })()
}

// ============================================================================ door 2: submit the plan

export interface ThePlanIsSubmitted {
  module: string
  planning: ModulePlanning
  ticked: { checklist: string; item: string; state: string } | { notTicked: string }
  says: string
}

export function submitThePlan(input: { workspaceId: string; moduleId: string; answers: PlanAnswers; actor: Actor }): ThePlanIsSubmitted {
  const module = theModule(input.moduleId, input.workspaceId)
  const planner = theCallerAsThePlanner(module, input.actor)
  const run = theCallersRun(input.actor, input.workspaceId)
  const open = planningOf(module)
  if (open === null || open.ended !== undefined) {
    throw refused(
      `No plan of module "${module.title}" waits to be submitted: ` +
        (open === null ? 'its plan step has never been said to be done. ' : `its last planning ended at ${open.ended!.at}, ${open.ended!.how}. `) +
        `Say the plan step is done first, with POST /api/modules/${module.id}/plan-step-done. Nothing was changed.`,
      409,
      'planNotOpen',
    )
  }
  const at = localStamp(new Date())

  return sqlite.transaction((): ThePlanIsSubmitted => {
    // WHAT CHANGED SINCE THE PLAN STEP, read from the ledger before this write. A submit that changed nothing is taken,
    // because the planner may find nothing to change, and the record says so instead of saying the plan was revised.
    const revisionsAtSubmit = theRevisionsNow(module.id, open.pipeline)
    const revised = open.revisionsAtPlanStep === undefined ? undefined : whatTheRevisionsSay(open.revisionsAtPlanStep, revisionsAtSubmit, { module: module.id, pipeline: open.pipeline })
    const changed = whatChangedSays(revised)
    const ended: PlanEnded = { at, how: 'submitted', by: planner }
    const planning: ModulePlanning = {
      ...open,
      questioned: { at, by: planner, answers: input.answers, revisionsAtSubmit, ...(revised === undefined ? {} : { revised }) },
      ended,
    }
    // THE PLANNING ENDS BEFORE THE ITEM IS TICKED, so the hand-tick hook sees an ended planning and leaves it alone.
    writeThePlanning(module, planning, `${nameOf(planner)} questioned the plan and submitted it; the office recorded it.`)
    // A CHECKLIST TAKEN AWAY, OR AN ITEM THAT CANNOT BE DONE, DOES NOT UNDO THE SUBMISSION: the plan was questioned.
    // The reply and the flow run both say the item was not ticked, and why.
    const ticked: ThePlanIsSubmitted['ticked'] = tickTheItemOfAFlow(open.checklistItem, run)
    appendToTheFlowRun(open.flowRun, [
      aStep(PLANNING_STEP_DOES.submitted, at, planner, { result: changed, evidence: `module ${module.id}, planning.questioned` }),
      aStep(PLANNING_STEP_DOES.recorded, at, theOfficeAsAStepsActor(), {
        ...('notTicked' in ticked
          ? { outcome: 'failed', result: `The plan is recorded, and the checklist item was not ticked: ${ticked.notTicked}` }
          : { result: `Checklist ${ticked.checklist} item ${ticked.item} is ticked.` }),
        evidence: `module ${module.id}`,
      }),
    ], ended)
    return {
      module: module.id,
      planning,
      ticked,
      says:
        `The plan of "${module.title}" is recorded as questioned at ${at}, with your four answers. ${changed} ` +
        ('notTicked' in ticked
          ? `The checklist item was not ticked: ${ticked.notTicked}`
          : `The office ticked item ${ticked.item} of your checklist.`) +
        ' The planning flow run has ended.',
    }
  })()
}

// ============================================================================ the hand tick

/**
 * A CHANGE TO A PLANNING ITEM THAT STILL WAITS. Asked by `changeAnItem` before it writes, with the item AS IT IS STORED,
 * so a change that replaces the item's links still finds the planning it stands for (wave 13j round 52b). Null when
 * the item is not one, when its planning has ended, or when the office itself is changing it (the submit door, which
 * ends the planning first). Otherwise it refuses anybody but the person and the planner: a tick with
 * planItemTickedByAnother, any other change with flowItemChangedByAnother. For a tick by one of them it returns the
 * write that ends the planning as ticked by hand, which `changeAnItem` runs in the same transaction as the tick; for
 * any other change by one of them, null.
 */
export function aPlanningItemChangedByHand(checklistId: string, item: ChecklistRequest, ticks: boolean, actor: Actor): (() => void) | null {
  if (actor.type === theOffice().type && actor.id === theOffice().id) return null
  for (const id of item.links ?? []) {
    const flowRun = getRecord(id)
    if (flowRun === null || flowRun.kind !== FLOW_RUN_KIND || flowRun.deletedAt !== null) continue
    const moduleId = (flowRun.data as Record<string, unknown>)[PLANNING_FLOW_RUN_MODULE_FIELD]
    if (typeof moduleId !== 'string') continue
    const module = getRecord(moduleId)
    if (module === null || module.kind !== 'module' || module.deletedAt !== null) continue
    const planning = planningOf(module)
    if (planning === null || planning.ended !== undefined || planning.flowRun !== flowRun.id) continue
    if (planning.checklistItem.checklist !== checklistId || planning.checklistItem.item !== item.id) continue
    const who = participantForActor(actor)
    const planner = plannerOf(module)
    const mayTick = who !== null && (who.kind === 'person' || (planner !== null && sameParticipant(who, planner)))
    if ((!mayTick || who === null) && !ticks) throw aFlowItemChangedByAnother(item.id, `the plan of module "${module.title}"`)
    if (!mayTick || who === null) {
      throw refused(
        `Item ${item.id} stands for the plan of module "${module.title}", which waits to be questioned and submitted. Only ` +
          `the person or the module's planner may tick it by hand. Nothing was changed.`,
        403,
        'planItemTickedByAnother',
      )
    }
    if (!ticks) return null
    return () => {
      const at = localStamp(new Date())
      const ended: PlanEnded = { at, how: 'ticked by hand', by: who }
      writeThePlanning(module, { ...planning, ended }, `${nameOf(who)} ticked the planning item ${item.id} by hand.`)
      appendToTheFlowRun(
        flowRun.id,
        [
          aStep(PLANNING_STEP_DOES.tickedByHand, at, who, {
            ...(who.kind === 'person'
              ? { how: BY_HAND, why: 'The person ticked the checklist item themself, instead of the plan being submitted through the door.' }
              : { how: 'by an agent' }),
            result: `Checklist ${checklistId} item ${item.id} is done.`,
            evidence: `checklist ${checklistId}`,
          }),
        ],
        ended,
      )
    }
  }
  return null
}
