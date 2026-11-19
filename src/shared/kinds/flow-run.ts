// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE KIND IN A FILE OF ITS OWN: `flow_run`, one run's flow run, which flow it followed and how it ended.
 *
 * It was moved out of src/shared/kinds.ts with no change of behaviour: the same purpose,
 * whenToRecord, humanOnly, fields, rules and example, and the same place in the kind list.
 *
 * NO CALLER CHANGED. src/shared/kinds.ts hands this file on with `export *`, and every caller
 * still imports the kind from kinds.ts.
 *
 * THIS FILE IMPORTS `commonFields`, `unionOf` AND THE `KindSpec` AND `ShapeSpec` TYPES FROM
 * ./kind-common.ts, AND `ENTERED_FLOW_ENDS_ON`, `FLOW_RUN_ENDINGS`, `FLOW_RUN_HOWS`,
 * `FLOW_RUN_OUTCOMES`, `NO_FLOW_NAMED`, `OFFICE_STEP_DOES` AND `OFFICE_STEP_EVIDENCE` FROM
 * ../flow-run.ts. IT IMPORTS NOTHING FROM THE CENTRAL FILE.
 */
import { commonFields, unionOf, type KindSpec, type ShapeSpec } from './kind-common.ts'
// A RUN'S FLOW RUN: ITS HOWS, ITS OUTCOMES AND ITS SENTENCES. Wave 1 of the office flow, M1; ../flow-run.ts
// is the only place they live.
import { ENTERED_FLOW_ENDS_ON, FLOW_RUN_ENDINGS, FLOW_RUN_HOWS, FLOW_RUN_OUTCOMES, NO_FLOW_NAMED, OFFICE_STEP_DOES, OFFICE_STEP_EVIDENCE } from '../flow-run.ts'
export const flowRunKind: KindSpec = {
    kind: 'flow_run',
    purpose:
      "ONE RUN'S FLOW RUN: which flow the run followed and which version of it, or a sentence saying it named " +
      'none, and each step as it happened, with who did it, when, how and how it ended. The office files one beside ' +
      'every session record and writes the steps it sees by itself. Wave 1 of the office flow, M1: it records what ' +
      'happened and never stops a run or refuses its work.',
    whenToRecord:
      'Never by hand, and never through POST /api/records: the office files it when a session record is filed, and ' +
      'every other write to this kind is refused. Add a step done by hand with POST /api/sessions/<run>/flow-run/steps; ' +
      'nobody has to. Read one with GET /api/sessions/<run>/flow-run.',
    humanOnly: false,
    fields: [
      {
        key: 'run',
        type: 'string',
        required: true,
        description:
          'The id of the session record this flow run records. Each run has one flow run of its own. A flow run with ' +
          '`entered` is the one other kind a run may have: it names the run that entered a flow, and a planning flow run, ' +
          'which names a `module` as well, names the run in which the planner said the plan step was done.',
        example: 'vq8lKlwGaCsu',
      },
      {
        key: 'module',
        type: 'string',
        required: false,
        description:
          'PRESENT ONLY ON A PLANNING FLOW RUN: the id of the module whose plan this flow run records. ' +
          'The office files it when the planner says the plan step is done, and it ends when ' +
          'the plan is submitted or its checklist item is ticked by hand. Absent on a run\'s own flow run.',
        example: 'Md3module001',
      },
      {
        key: 'entered',
        type: 'EnteredFlow',
        required: false,
        description:
          'PRESENT ONLY ON A FLOW RUN SOMEBODY ENTERED: for whom, by whom, about what, and the item the office put on ' +
          'that agent\'s checklist. Written by POST /api/flows/<id>/enter and by the planning flow\'s plan-step door. A ' +
          'planning flow run filed before wave 13j round 52 has none. Absent on a run\'s own flow run.',
        example: { for: { kind: 'agent', id: 'ooNSJY6rVzuI' }, by: { kind: 'agent', id: 'ooNSJY6rVzuI' }, at: '2026-10-11 06:00:00', about: 'Md3module001', checklistItem: { checklist: 'Ck3checklist', item: 'i-4' }, endsOn: 'the run is sealed' },
      },
      {
        key: 'flow',
        type: 'string',
        required: false,
        description:
          "The flow id the run named in its `flow` field, kept even when no flow record has it. Absent means the run " +
          'named no flow.',
        example: 'Xq3flowRec01',
      },
      {
        key: 'flowRevision',
        type: 'FlowRevisionAtStart',
        required: false,
        description:
          "The flow record's newest revision when the run was filed. Present only when the run named a flow and a flow " +
          'record has that id; otherwise `noFlow` says why it is absent.',
        example: { seq: 3, contentHash: '98c195fdafae1388' },
      },
      {
        key: 'noFlow',
        type: 'string',
        required: false,
        description:
          `Present exactly when \`flowRevision\` is absent: "${NO_FLOW_NAMED}", or a sentence naming the id the run ` +
          'named that no flow record has. On a planning flow run, a sentence saying that no flow record, or more than ' +
          'one, says it is governed by the planning code. The office never puts a guessed flow in its place.',
        example: NO_FLOW_NAMED,
      },
      {
        key: 'ended',
        type: 'FlowRunEnded',
        required: false,
        description:
          'PRESENT ONLY ON A FLOW RUN SOMEBODY ENTERED, ONCE IT HAS ENDED: when, how and by whom. On a planning flow run ' +
          'it is the same as the module\'s planning.ended, written in the same write. Absent on one still open, and on a ' +
          'run\'s own flow run, whose end is its last step.',
        example: { at: '2026-10-10 21:30:00', how: 'submitted', by: { kind: 'agent', id: 'ooNSJY6rVzuI' } },
      },
      {
        key: 'stepsTaken',
        type: 'FlowRunStep[]',
        required: true,
        description: 'The steps in the order they were recorded. The office writes the first one, the filing, itself.',
        example: [{ does: OFFICE_STEP_DOES.started, actor: { kind: 'agent', id: 'coordinator' }, startedAt: '2026-10-04 19:44:28', endedAt: '2026-10-04 19:44:28', how: 'by an agent', outcome: 'done', evidence: OFFICE_STEP_EVIDENCE.started }],
      },
      ...commonFields('flow_run'),
    ],
    rules: [
      'Exactly one of `flowRevision` and `noFlow` is present.',
      '`flowRevision` is present only when `flow` is.',
    ],
    example: {
      run: 'vq8lKlwGaCsu',
      noFlow: NO_FLOW_NAMED,
      stepsTaken: [{ does: OFFICE_STEP_DOES.started, actor: { kind: 'agent', id: 'coordinator' }, startedAt: '2026-10-04 19:44:28', endedAt: '2026-10-04 19:44:28', how: 'by an agent', outcome: 'done', evidence: OFFICE_STEP_EVIDENCE.started }],
    },
}

/** The shapes of this kind, moved out of ../kinds.ts with their comments unchanged. */
export const FLOW_RUN_SHAPES: Record<string, ShapeSpec> = {
  /**
   * ONE STEP OF ONE RUN'S FLOW RUN, AS IT HAPPENED. Wave 1 of the office flow, M1 (report 4IoRUKizcZXb,
   * section 4). A `flow_run`'s `steps` is a list of these. The office writes the steps it sees by itself;
   * a step done by hand comes through POST /api/sessions/<run>/flow-run/steps and says why.
   */
  FlowRunStep: {
    name: 'FlowRunStep',
    description:
      "ONE STEP OF ONE RUN'S FLOW RUN: what was done, who did it, when it started and ended, how it was done and " +
      'how it ended. A step done by hand says why. Nothing about a step is a gate: no step is required and no order ' +
      'is checked.',
    fields: [
      {
        key: 'n',
        type: 'number',
        required: false,
        description: "The number of the flow's step this matches. Absent means it matches no step of the flow, or the run named no flow.",
        example: 2,
      },
      {
        key: 'does',
        type: 'string',
        required: true,
        description: 'What was done, one sentence in plain language.',
        example: OFFICE_STEP_DOES.sealed,
      },
      {
        key: 'actor',
        type: 'ParticipantRef',
        required: false,
        description: 'Who did it, {kind, id}. ABSENT MEANS NOBODY RECORDED WHO, and a reader says exactly that.',
        example: { kind: 'agent', id: 'coordinator' },
      },
      {
        key: 'startedAt',
        type: 'date',
        required: true,
        description: 'When the step started, local wall clock. A step the office sees as one event starts and ends at the same moment.',
        example: '2026-10-04 19:44:28',
      },
      {
        key: 'endedAt',
        type: 'date',
        required: false,
        description: 'When the step ended, local wall clock. Absent means it has not ended, or nobody recorded when.',
        example: '2026-10-04 19:44:28',
      },
      {
        key: 'how',
        type: unionOf(FLOW_RUN_HOWS),
        required: true,
        description: `How the step was done: ${FLOW_RUN_HOWS.join(', ')}. A step done by hand says why.`,
        example: 'by the office',
      },
      {
        key: 'why',
        type: 'string',
        required: false,
        description: 'WHY THE STEP WAS DONE BY HAND, in plain words. Required when `how` is "by hand", and read nowhere else.',
        example: 'Only files were delivered, so there was no code to check.',
      },
      {
        key: 'outcome',
        type: unionOf(FLOW_RUN_OUTCOMES),
        required: true,
        description:
          `How the step ended: ${FLOW_RUN_OUTCOMES.join(', ')}. A check whose answer the verdict door refused is ` +
          '"refused by the verdict door", never "failed": the check was done and the door would not take its answer.',
        example: 'done',
      },
      {
        key: 'result',
        type: 'string',
        required: false,
        description: 'A short line of what came of it: a commit, a link, a Bilibili BV number, a live check that passed or failed.',
        example: 'sealed tip 3f1c2a9b',
      },
      {
        key: 'evidence',
        type: 'string',
        required: false,
        description: 'The record, field or event the step came from. Absent means nobody named one.',
        example: 'data.sealedTip on run vq8lKlwGaCsu',
      },
      {
        key: 'refusal',
        type: 'VerdictDoorRefusal',
        required: false,
        description:
          "The verdict door's own refusal, on a step whose outcome is \"refused by the verdict door\": its words, its " +
          'status and its code when it has one. The result beside it is a fixed form; these are the words it came from.',
        example: { said: 'The run is still running, so nothing can be checked yet. Nothing was written.', status: 409 },
      },
    ],
    rules: ['A step whose `how` is "by hand" carries a `why` that is not empty.'],
  },

  /** THE VERDICT DOOR'S REFUSAL OF A CHECK'S ANSWER, kept beside the step that records it. Wave 13p round 27. */
  VerdictDoorRefusal: {
    name: 'VerdictDoorRefusal',
    description:
      "THE VERDICT DOOR'S REFUSAL OF A CHECK'S ANSWER, as the door said it: its English words, the HTTP status it " +
      'answered with, and the refusal\'s code when it carries one. Absent code means the refusal had none.',
    fields: [
      { key: 'said', type: 'string', required: true, description: "The door's own words, in English, whole.", example: 'The run is still running. Nothing was written.' },
      { key: 'status', type: 'number', required: true, description: 'The HTTP status the door answered with.', example: 409 },
      { key: 'code', type: 'string', required: false, description: "The refusal's code, when the door gave it one.", example: 'start-at-login.not-here' },
    ],
  },

  /** WHICH REVISION OF A FLOW RECORD A RUN STARTED UNDER. The office reads it from the ledger once, at the run's start. */
  FlowRevisionAtStart: {
    name: 'FlowRevisionAtStart',
    description:
      "THE FLOW RECORD'S NEWEST REVISION AT THE MOMENT THE RUN WAS FILED: its number in the flow's ledger and its " +
      'content hash. This is "which version of the flow". It is written once and never moved when the flow changes later.',
    fields: [
      { key: 'seq', type: 'number', required: true, description: "The revision's number in the flow record's ledger.", example: 3 },
      { key: 'contentHash', type: 'string', required: true, description: 'The content hash of that same revision.', example: '98c195fdafae1388' },
    ],
  },

  /** A FLOW AN AGENT ENTERED, as its flow run keeps it (wave 13j round 52). */
  EnteredFlow: {
    name: 'EnteredFlow',
    description:
      'WHO ENTERED THE FLOW, FOR WHOM, ABOUT WHAT, AND THE ITEM IT HANGS ON: the office puts one item on the checklist ' +
      'of the agent the run serves, and the flow is done when that item is ticked, by the event the flow names or by hand.',
    fields: [
      { key: 'for', type: 'ParticipantRef', required: true, description: 'Whose checklist the item is on: the agent the run serves.', example: { kind: 'agent', id: 'ooNSJY6rVzuI' } },
      { key: 'by', type: 'ParticipantRef', required: true, description: 'Who entered the flow: that agent, or a person for it.', example: { kind: 'agent', id: 'ooNSJY6rVzuI' } },
      { key: 'at', type: 'date', required: true, description: 'When the flow was entered, local wall clock.', example: '2026-10-11 06:00:00' },
      { key: 'about', type: 'string', required: true, description: 'The id of the record the flow is about.', example: 'Md3module001' },
      { key: 'checklistItem', type: 'PlanChecklistItem', required: true, description: "The item the office put on the agent's checklist.", example: { checklist: 'Ck3checklist', item: 'i-4' } },
      {
        key: 'endsOn',
        type: unionOf(ENTERED_FLOW_ENDS_ON),
        required: false,
        description:
          `The event that ends the flow, read from the flow's ends_on when it was entered: ${ENTERED_FLOW_ENDS_ON.join(', ')}. ` +
          'Absent means only a hand tick of the item ends it.',
        example: 'the run is sealed',
      },
    ],
  },

  FlowRunEnded: {
    name: 'FlowRunEnded',
    description: 'HOW A FLOW RUN SOMEBODY ENTERED ENDED: by its event, or by a hand tick of its checklist item.',
    fields: [
      { key: 'at', type: 'date', required: true, description: 'When it ended, local wall clock.', example: '2026-10-10 21:30:00' },
      { key: 'how', type: unionOf(FLOW_RUN_ENDINGS), required: true, description: `How it ended: ${FLOW_RUN_ENDINGS.join(', ')}.`, example: 'submitted' },
      { key: 'by', type: 'ParticipantRef', required: true, description: 'Who ended it: who submitted or ticked it, or the office for an event.', example: { kind: 'agent', id: 'ooNSJY6rVzuI' } },
    ],
  },
}
