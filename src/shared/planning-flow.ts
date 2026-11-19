// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE FLOW FOR PLANNING A BIG PIECE OF WORK: THE WORDS, THE QUESTIONS AND THE STORED SHAPE. One decision
 * made it, on a message that takes the two additions in 3dblr1cnVkcK to a revision sent in
 * another message. It rests on another decision: each big cluster keeps its
 * plan in a module, drawn as a pipeline.
 *
 * WHAT THE FLOW IS. Only turning a module's work into a pipeline starts it; everyday talk, changes and module upkeep
 * have no flow. The planner named in the module writes the plan and draws the pipeline, then tells the office the plan
 * step is done. The office sends the planner one message with four questions. The planner questions the plan themself,
 * with no second agent, revises it and submits it with a short answer to each question. The office records that on
 * the module and ticks the item it put on the planner's checklist. Execution is a separate flow, not chained to this.
 *
 * THE WORDS LIVE HERE AND NOWHERE ELSE, so the kind's declaration, the doors, the office's message and the module page
 * read one list (invariant 9). NOTHING HERE TOUCHES THE DATABASE, because the browser imports it.
 */

import type { ParticipantRef } from './participants.ts'

/**
 * THE CODE THAT RUNS THE FLOW, as a flow record's `governed_by` names it. The office finds the flow a planning flow
 * run follows by this path, because no product code names a record id: the one live flow record whose `governed_by`
 * names this path is the flow, and with none or several the flow run says so instead of guessing.
 */
export const PLANNING_FLOW_CODE = 'src/server/lib/planning-flow.ts'

/**
 * THE FOUR QUESTIONS, in the order the office asks them. They are the first of the two
 * additions. Each key is
 * where the planner's short answer is stored in `planning.questioned.answers`.
 */
export const PLAN_QUESTIONS = {
  againstHisDecisions:
    "Does the plan go against any of the person's decisions? Check the newest ones too, not only the design documents.",
  alreadyDone: "Is any step already done? Search the history and the problems' links.",
  localFix: "Does the plan collapse into a local fix away from the work's goal?",
  leastSure: 'Which point of the plan are you least sure of?',
} as const
export type PlanQuestion = keyof typeof PLAN_QUESTIONS
export const PLAN_QUESTION_KEYS = Object.keys(PLAN_QUESTIONS) as PlanQuestion[]

/** The planner's short answer to each question, as stored. */
export type PlanAnswers = Record<PlanQuestion, string>

/** How a planning flow run ended: by the submit door, or by somebody ticking its checklist item by hand. */
export const PLAN_ENDINGS = ['submitted', 'ticked by hand'] as const
export type PlanEnding = (typeof PLAN_ENDINGS)[number]

/** The checklist item the office put on the planner's checklist when the plan step was done. */
export interface PlanChecklistItem {
  checklist: string
  item: string
}

/**
 * WHICH REVISION THE PLAN'S RECORDS WERE AT, at one moment: the module, the pipeline and each block the pipeline held.
 * Wave 13j round 51: the submit door took the planner's word that the plan was revised, and now the module records
 * these at the plan step and at the submit, so whether anything changed between the two is read, not said.
 */
export interface PlanRevisions {
  module: number
  pipeline: number
  blocks: Array<{ block: string; seq: number }>
}

/**
 * A MODULE'S PLANNING, as the module's `planning` field stores it. Written only by the two planning doors and by a
 * hand tick of its checklist item; every other write that would set, change or drop it is refused.
 */
export interface ModulePlanning {
  pipeline: string
  flowRun: string
  planStepDoneAt: string
  planStepDoneBy: ParticipantRef
  prompt: string
  checklistItem: PlanChecklistItem
  /** Absent on a planning recorded before wave 13j round 51, which kept no revisions. */
  revisionsAtPlanStep?: PlanRevisions
  questioned?: PlanQuestioned
  ended?: PlanEnded
}

/** When the plan was submitted, by whom, the answers, and what had changed since the plan step. */
export interface PlanQuestioned {
  at: string
  by: ParticipantRef
  answers: PlanAnswers
  /** Absent on a plan submitted before wave 13j round 51. */
  revisionsAtSubmit?: PlanRevisions
  /**
   * The ids of the plan's records whose revision moved between the plan step and the submit, a block added or taken
   * away included. EMPTY MEANS NOTHING CHANGED. Absent means nobody can say: the plan step kept no revisions.
   */
  revised?: string[]
}

/** How and when a planning ended. The module's `planning.ended` and its planning flow run's `ended` hold the same. */
export interface PlanEnded {
  at: string
  how: PlanEnding
  by: ParticipantRef
}

/**
 * WHAT CHANGED BETWEEN TWO MOMENTS OF A PLAN: the ids whose revision moved, the module first, then the pipeline, then
 * each block in the order it is held now, then each block that was taken away. Pure, so the door and the tests read one
 * answer.
 */
export function whatTheRevisionsSay(atPlanStep: PlanRevisions, atSubmit: PlanRevisions, ids: { module: string; pipeline: string }): string[] {
  const then = new Map(atPlanStep.blocks.map((one) => [one.block, one.seq]))
  const now = new Set(atSubmit.blocks.map((one) => one.block))
  return [
    ...(atPlanStep.module === atSubmit.module ? [] : [ids.module]),
    ...(atPlanStep.pipeline === atSubmit.pipeline ? [] : [ids.pipeline]),
    ...atSubmit.blocks.filter((one) => then.get(one.block) !== one.seq).map((one) => one.block),
    ...atPlanStep.blocks.filter((one) => !now.has(one.block)).map((one) => one.block),
  ]
}

/** The sentence that says what changed, for the reply and the flow run's step. */
export function whatChangedSays(revised: readonly string[] | undefined): string {
  if (revised === undefined) {
    return 'Nobody can say whether the plan changed after the plan step: that step was recorded before the office kept revisions.'
  }
  if (revised.length === 0) {
    return 'Nothing in the module, the pipeline or its blocks changed between the plan step and the submit.'
  }
  return `Between the plan step and the submit, ${String(revised.length)} of the plan's records changed: ${revised.join(', ')}.`
}

/** The words of the checklist item the office puts on the planner's checklist. */
export function thePlanningItemWords(moduleTitle: string): string {
  return `Question the plan for "${moduleTitle}" and submit it.`
}

/**
 * The title of the checklist the office makes for an agent who has none in the project, when the agent enters a flow:
 * the planning flow and every other (wave 13j round 52).
 */
export function anAgentsChecklistTitle(name: string): string {
  return `${name}'s checklist`
}

/** The title of the checklist the office makes for a planner who has none in the project. */
export const aPlannersChecklistTitle = anAgentsChecklistTitle

/**
 * WHAT EACH STEP OF A PLANNING FLOW RUN SAYS, one sentence per event. The flow record's own stages say the same
 * things at more length, with their reasons and sources.
 */
export const PLANNING_STEP_DOES = {
  planStepDone: 'The planner said the plan step is done: the plan is in the module and the pipeline is drawn.',
  promptSent: 'The office sent the planner the four questions, and put an item on the planner\'s checklist.',
  submitted: 'The planner questioned the plan and submitted it with an answer to each question.',
  recorded: 'The office recorded the submitted plan on the module and ticked the checklist item.',
  tickedByHand: 'The checklist item was ticked by hand, not by submitting the plan, so the plan was not questioned through the door.',
} as const

/** The field of a flow run that says it is a planning flow run, and which module it is about. */
export const PLANNING_FLOW_RUN_MODULE_FIELD = 'module'

/** The `noFlow` of a planning flow run when no live flow record says it is governed by the planning code. */
export const NO_PLANNING_FLOW_RECORD =
  `No flow record says it is governed by ${PLANNING_FLOW_CODE}, so this planning flow run names no flow.`

/** The `noFlow` of a planning flow run when more than one live flow record says so. The office picks none of them. */
export function severalPlanningFlowRecords(ids: readonly string[]): string {
  return `${String(ids.length)} flow records say they are governed by ${PLANNING_FLOW_CODE} (${ids.join(', ')}), so the office named none of them.`
}
