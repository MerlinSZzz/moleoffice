// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RUN'S FLOW RUN: WHICH FLOW IT FOLLOWED, AND EACH STEP AS IT HAPPENED. Wave 1 of the office flow, M1, is on design B
 * of a decision: record first, no gates. Report 4IoRUKizcZXb, section 4, is the spec.
 *
 * The office files one `flow_run` record beside every session record, in the write that files the
 * session (`createRecordWithReport` in src/server/lib/records.ts), and appends a step for each event it
 * already sees on the run. A step done by hand comes through POST /api/sessions/<run>/flow-run/steps.
 *
 * NOTHING HERE IS A GATE. No step is required, no order is checked, and nothing about a run's work is
 * refused or stopped. A flow run that cannot be written leaves the run filed and says so.
 *
 * THE WORDS AND VALUES LIVE HERE AND NOWHERE ELSE, so the kind's declaration, the office's writer, the
 * hand-step door and the tests read one list (invariant 9).
 */

import { PLAN_ENDINGS } from './planning-flow.ts'
import type { ParticipantRef } from './participants.ts'

/** The record kind. With an underscore, like `merge_entry` and `sealed_tip`. */
export const FLOW_RUN_KIND = 'flow_run'

/** How a step was done. A step done by hand says why. */
export const FLOW_RUN_HOWS = ['by the office', 'by an agent', 'by hand'] as const
export type FlowRunHow = (typeof FLOW_RUN_HOWS)[number]
export const BY_HAND: FlowRunHow = 'by hand'

/**
 * How a step ended. `refused by the verdict door` is its own outcome and never `failed`: a check whose
 * verdict the door refused was done, and the cost of asking again shows only if it is told apart
 * (ask 2 in report 4IoRUKizcZXb).
 */
export const FLOW_RUN_OUTCOMES = ['done', 'failed', 'refused by the verdict door', 'still open'] as const
export type FlowRunOutcome = (typeof FLOW_RUN_OUTCOMES)[number]

/**
 * The title of every flow run. It holds no id: a run's page lists its flow run by this title, and an id there
 * would be a machine word in normal mode. The `run` field names the run.
 */
export const FLOW_RUN_TITLE = 'Flow run'

/** The sentence a flow run carries when the run named no flow. The office never guesses one. */
export const NO_FLOW_NAMED = 'This run named no flow.'

/** The sentence a flow run carries when the run named a flow id that no flow record has. */
export function noFlowRecordHas(id: string): string {
  return `This run named flow ${id}, and no flow record has that id.`
}

/**
 * WHAT EACH STEP THE OFFICE WRITES BY ITSELF SAYS, one sentence per event it sees. The spec named eight events;
 * `superseded` was added in wave 13p round 27 (piece 4), because a run closed as superseded otherwise ended with no
 * step saying so.
 */
export const OFFICE_STEP_DOES = {
  started: 'The run was filed.',
  sealed: 'The run said it was finished, and the office sealed its work.',
  released: 'The check released the run.',
  refused: 'The check refused the run.',
  verdictRefused: 'A check answered, and the verdict door refused the answer.',
  confirmed: 'The report was confirmed and the run was closed.',
  closedUnchecked: 'The run was closed unchecked.',
  landedByHand: "The run's work reached main by hand, not through the merge queue.",
  superseded: 'The run was closed as superseded by a later run.',
  ended: 'The run ended.',
} as const

/** Sentences the office once wrote. Existing stored steps still use the current word for that event. */
export const OFFICE_STEP_SENTENCES_ONCE_WRITTEN = {
  confirmed: 'The supervisor confirmed the report and closed the run.',
} as const

/**
 * WHERE THE OFFICE READ EACH OF ITS STEPS, in words. The flow run names its run, so no id is repeated here: a step's
 * evidence is drawn on the flow run's page, and an id or a field path there would be a machine word in normal mode.
 */
export const OFFICE_STEP_EVIDENCE = {
  started: "The run's record.",
  sealed: "The seal on the run's record.",
  released: "The release written on the run's record.",
  refused: "The refusal written on the run's record.",
  verdictRefused: "The verdict door's answer to the check.",
  confirmed: "The confirmation written on the run's record.",
  closedUnchecked: "The closing unchecked written on the run's record.",
  landedByHand: "The landing by hand written on the run's record.",
  superseded: "The superseded mark written on the run's record.",
  ended: "The state of the run's record.",
} as const

/**
 * HOW EACH OF THE OFFICE'S OWN STEPS ENDED, in the fixed forms it writes as a step's `result`, so a flow run's page can
 * say them in the reader's language. The "ended" step carries one sentence for each state a run ends in. A seal and a
 * landing by hand carry a commit, written after their prefix.
 */
export const OFFICE_STEP_ENDED_RESULT = {
  finished: 'The run finished.',
  crashed: 'The run crashed.',
  orphaned: 'The run was left with nothing running it.',
} as const
export const OFFICE_STEP_SEALED_TIP = 'sealed tip '
export const OFFICE_STEP_LANDED_COMMIT = 'commit '
/** A superseded close's result: this prefix, then the later run's id. */
export const OFFICE_STEP_SUPERSEDED_BY = 'superseded by run '

/**
 * THE WHY THE OFFICE WRITES FOR A LANDING BY HAND THAT CAME WITH NO REASON, in the fixed form a flow run's page says in
 * the reader's language. Any other why is the recorder's own words and is drawn as written.
 */
export const OFFICE_STEP_LANDED_NO_REASON = 'Whoever recorded the landing by hand gave no reason.'

/**
 * WHY THE OFFICE WRITES A STEP THAT SOMEBODY DID BY HAND IN THE OFFICE, in the fixed form a flow run's page says in
 * the reader's language. It is written once here, so the writer stores it and the page can tell it from a person's
 * own why rather than drawing it as content.
 */
export const OFFICE_STEP_DONE_BY_HAND_WHY = 'A person did this in the office themself, not a program.'

/**
 * HOW A CHECK'S ANSWER THAT THE VERDICT DOOR REFUSED ENDED, in the fixed form a flow run's page says in the reader's
 * language: this prefix, then the HTTP status the door answered with. The door's own words are English and are kept
 * beside the step in `refusal`, with the refusal's code when it has one, and the page shows them in Developer mode only.
 */
export const OFFICE_STEP_VERDICT_REFUSED_STATUS = 'refused with status '

/** The verdict door's refusal as the step keeps it: its own words, its HTTP status, and its code when it has one. */
export interface VerdictDoorRefusal {
  said: string
  status: number
  code?: string
}

/**
 * THE SENTENCE A VERDICT DOOR'S REFUSAL CARRIES IN `recorded` when the office recorded it as a step. The refusal still
 * says nothing of the verdict was written, and that stays true; this says the one thing that was written, and where.
 */
export function theVerdictDoorRecordedIt(flowRun: string): string {
  return `The office recorded this refusal as a step of the run's flow run ${flowRun}. Nothing of the verdict was written.`
}

/** The refusal of a step done by hand that says no why. The one rule of the hand-step door's shape. */
export const A_STEP_BY_HAND_SAYS_WHY =
  'A step done by hand says why it was done by hand, in `why`. Nothing was written. This is a rule about the ' +
  "step's shape only: it refuses nothing of the run's own work, and nobody has to record steps by hand."

/** The refusal of a write to a flow run from anywhere but its doors. */
export const A_FLOW_RUN_IS_WRITTEN_BY_THE_OFFICE =
  'A flow run is written by the office, beside the run it records, and by nothing else. Nothing was written. ' +
  'To add a step done by hand, use POST /api/sessions/<run>/flow-run/steps. This refuses only a forged copy of ' +
  "the office's own record; it never refuses a run's own work."

/** Where the doors are, for an agent and for Developer mode. */
export const THE_FLOW_RUN_DOORS =
  'GET /api/sessions/<run>/flow-run reads a run\'s flow run. POST /api/sessions/<run>/flow-run/steps adds a step ' +
  'done by hand, with {does, how, why, outcome, startedAt?, endedAt?, actor?, n?, result?, evidence?}; `why` is required when `how` is "by hand".'

/** What a reader shows when a step names no actor. */
export const NOBODY_RECORDED_WHO = 'nobody recorded who'

// ============================================================================ a flow an agent enters

/**
 * A FLOW AN AGENT ENTERS HANGS ON THAT AGENT'S CHECKLIST UNTIL IT IS DONE, by a decision and a
 * message. It is marked done once it is complete, by an event or by
 * hand. Wave 13j round 52. Entering is an explicit act through a door (POST /api/flows/<id>/enter, or the planning
 * flow's plan-step door); nothing here starts a flow by itself, which that decision holds back.
 *
 * The flow run such an act files names its run like a run's own flow run, and carries `entered`: whose checklist the
 * item is on, who entered, about what, and the item. It ends once, in `ended`: by the event its flow names, or by a
 * hand tick of the item.
 */

/** The field of a flow run that says an agent entered its flow, and where the item stands. */
export const ENTERED_FLOW_FIELD = 'entered'

/**
 * THE EVENTS A FLOW MAY NAME IN ITS `ends_on` AS THE ONE THAT ENDS IT. Each is an event the office already sees on the
 * run that entered the flow: the same moments as the run's own flow run steps `sealed`, `released` and `ended`.
 */
export const FLOW_ENDING_EVENTS = ['the run is sealed', 'the run is released', 'the run ends'] as const
export type FlowEndingEvent = (typeof FLOW_ENDING_EVENTS)[number]

/** Which of the office's own run steps is which ending event. */
export const THE_STEP_OF_EACH_ENDING_EVENT: Readonly<Record<FlowEndingEvent, string>> = {
  'the run is sealed': OFFICE_STEP_DOES.sealed,
  'the run is released': OFFICE_STEP_DOES.released,
  'the run ends': OFFICE_STEP_DOES.ended,
}

/**
 * THE PLANNING FLOW'S OWN EVENT: its submit door. No flow names it in `ends_on`, because only the planning door fires
 * it; the planning door writes it into the flow run's `entered.endsOn` itself.
 */
export const THE_PLAN_IS_SUBMITTED = 'the plan is submitted'

/** What an entered flow run says will end it. Absent `endsOn` means only a hand tick ends it. */
export const ENTERED_FLOW_ENDS_ON = [...FLOW_ENDING_EVENTS, THE_PLAN_IS_SUBMITTED] as const
export type EnteredFlowEndsOn = (typeof ENTERED_FLOW_ENDS_ON)[number]

/** How a flow run that an agent entered ended: the planning flow's two endings, or an ending event of the flow. */
export const FLOW_RUN_ENDINGS = [...PLAN_ENDINGS, ...FLOW_ENDING_EVENTS] as const
export type FlowRunEnding = (typeof FLOW_RUN_ENDINGS)[number]

/** One item of one checklist, by the checklist's id and the item's id in it. */
export interface TheItemOfAFlow {
  checklist: string
  item: string
}

/** The `entered` of a flow run, as stored. */
export interface EnteredFlow {
  /** Whose checklist the item is on: the agent the run serves. */
  for: ParticipantRef
  /** Who entered the flow: that agent, or a person for it. */
  by: ParticipantRef
  at: string
  /** The id of the record the flow is about. */
  about: string
  checklistItem: TheItemOfAFlow
  endsOn?: EnteredFlowEndsOn
}

/** The `ended` of a flow run an agent entered. */
export interface FlowRunEnded {
  at: string
  how: FlowRunEnding
  by: ParticipantRef
}

/** What each step of an entered flow run says. The planning flow keeps its own sentences in ./planning-flow.ts. */
export const ENTERED_STEP_DOES = {
  entered: 'The flow was entered, and the office put an item on the checklist of the agent the run serves.',
  endedByEvent: 'The event the flow ends on happened, and the office ticked the checklist item.',
  tickedByHand: 'The checklist item was ticked by hand.',
} as const

/** The words of the item the office puts on the agent's checklist. They say the office put it there, and how it ends. */
export function theEnteredItemWords(flowTitle: string, aboutTitle: string, endsOn: FlowEndingEvent | undefined): string {
  return (
    `Finish the flow "${flowTitle}" about "${aboutTitle}". The office put this item here when the flow was entered. ` +
    (endsOn === undefined ? 'Tick it by hand when the flow is done.' : `The office ticks it when ${endsOn}, or tick it by hand.`)
  )
}

/** One flow on a checklist, as a checklist reading carries it: what the agent's item stands for. */
export interface FlowOnAChecklist {
  item: string
  flowRun: string
  flow: string | null
  flowTitle: string | null
  about: string
  aboutTitle: string | null
  endsOn: EnteredFlowEndsOn | null
  ended: FlowRunEnded | null
}
