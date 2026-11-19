// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE KIND IN A FILE OF ITS OWN: `goal`, what would be true when it is met, at one of four horizons.
 *
 * It was moved out of src/shared/kinds.ts with no change of behaviour: the same purpose,
 * whenToRecord, humanOnly, fields, rules and example, and the same place in the kind list.
 *
 * NO CALLER CHANGED. src/shared/kinds.ts hands this file on with `export *`, and every caller
 * still imports the kind from kinds.ts.
 *
 * THIS FILE IMPORTS `commonFields` AND `unionOf` AND THE `KindSpec` AND `ShapeSpec` TYPES FROM
 * ./kind-common.ts, AND `GOAL_HORIZONS` AND `GOAL_STATES` FROM ../goal.ts. IT IMPORTS NOTHING
 * FROM ../types.ts.
 */
// THE FOUR HORIZONS AND THE THREE STATE WORDS OF A GOAL. Criterion P1; ./goal.ts is the only place
// they live, and this declaration reads them rather than repeating them.
import { commonFields, unionOf, type KindSpec, type ShapeSpec } from './kind-common.ts'
import { GOAL_HORIZONS, GOAL_STATES } from '../goal.ts'

export const goalKind: KindSpec = {
    kind: 'goal',
    purpose:
      'WHAT WOULD BE TRUE WHEN IT IS MET, AT ONE OF FOUR HORIZONS: short, medium, long or distant. ' +
      'It is what work is FOR, not what is done: work serves a goal through a ' +
      '`serves` link from a trajectory, an obligation, a task or a cluster (a `module` record), and the plan ' +
      'graph starts from the goals. A goal is NOT a planned state and not a trajectory: a planned state is one ' +
      'part of one intended future, and a goal is the sentence the whole of it is working toward.',
    whenToRecord:
      'When there is a thing worth working toward that is more than one task — a horizon-sized aim, the thing the ' +
      'plan is FOR. Write what would be TRUE when it is met, in one sentence and the present tense, because a ' +
      'sentence saying what would be DONE is a task and belongs in a `task`. An agent may file one and it is ' +
      'marked as the agent\'s until the person confirms it; that mark is `filed_by` and `confirmed_by` on the ' +
      'goal itself, never ownership. Distant holds abstract aims, such as a life ambition, and ' +
      'has no time limit, and a distant goal may be changed with every change kept as a revision the person can read.',
    humanOnly: false,
    fields: [
      {
        key: 'horizon',
        type: unionOf(GOAL_HORIZONS),
        required: true,
        description:
          '"short", "medium", "long" or "distant". How far out the goal is. Short is within two weeks, medium ' +
          'within two months and long within a year — and those spans are THE PERSON\'S SETTING, not code: read what is in ' +
          'force from GET /api/office/goal-spans, and never restate a default here. "distant" has NO time limit ' +
          'at all: it holds the abstract aims, and a distant goal may be changed with every change kept ' +
          'as a revision.',
        example: 'short',
      },
      {
        key: 'what',
        type: 'string',
        required: true,
        description:
          'WHAT WOULD BE TRUE WHEN THIS GOAL IS MET. One sentence, in the present tense, the shape a planned ' +
          'state writes. It says what would be TRUE, not what would be DONE, and the difference is the whole ' +
          'reason this field is not a task: "the export finishes on a 3 MB report" can be seen to be true or ' +
          'false, while "write the export" is work somebody has to do and belongs in a `task`. A goal whose ' +
          'sentence is really a job has no way to be met, so nothing can say whether it was.',
        example: 'A report of any size exports without the browser tab running out of memory.',
      },
      {
        key: 'owner',
        type: 'string',
        required: true,
        description:
          'WHO OWNS THIS GOAL: a person or a durable agent, by name or handle. Not the record\'s owner column, ' +
          'which is always the person for a record an agent wrote. This is who is answerable for the goal being ' +
          'met, and it may be an agent.',
        example: 'owner',
      },
      {
        key: 'state',
        type: unionOf(GOAL_STATES),
        required: true,
        description:
          '"open" while nothing has ended it, "met" once what it said became true, "dropped" once somebody ' +
          'decided against it. `met` and `dropped` each need `state_at` and `state_because`; `open` must not ' +
          'carry them, because a goal still open has no end to date or explain.',
        example: 'open',
      },
      {
        key: 'state_at',
        type: 'date',
        required: false,
        description:
          'WHEN IT WAS MET OR DROPPED, local wall clock. Required with `state_because` when `state` is "met" or ' +
          '"dropped", and refused while `state` is "open" — an open goal has not reached an end. Taking it away ' +
          'again loses nothing: the revision ledger keeps the words and the date for ever.',
        example: '2026-09-20',
      },
      {
        key: 'state_because',
        type: 'string',
        required: false,
        description:
          'WHY IT WAS MET OR DROPPED, in words. Required together with `state_at`, the pairing ' +
          '`claim.retracted_because` already uses: a stamp with no reason is a fact nobody can check and a ' +
          'reason with no stamp is an end nobody can date.',
        example: 'The export ran on the 9 MB report without the tab restarting, measured twice.',
      },
      {
        key: 'filed_by',
        type: 'string',
        required: false,
        description:
          'THE AGENT THAT FILED THIS, when an agent did. The OFFICE sets it from the actor when an agent files a ' +
          'goal, so it names the agent that really made the record and not one it claims. It is absent on a goal ' +
          'the person filed. Presence with no `confirmed_by` is the mark: this goal is the agent\'s until the person ' +
          'confirms it.',
        example: 'claude-code',
      },
      {
        key: 'confirmed_by',
        type: 'GoalConfirmation',
        required: false,
        description:
          'THE PERSON\'S PRESS, absent until it is made. The person writes it, or a secretary writes it for them when ' +
          'it names their decision or message as the evidence and says who pressed. The server refuses it to every ' +
          'other agent, and to a warrant alone, because the whole point of the mark is that THE PERSON has seen the ' +
          'goal. Its presence clears the mark `filed_by` sets; there is no second boolean to keep in step with it.',
        example: { by: 'owner', at: '2026-09-16' },
      },
      ...commonFields('goal'),
    ],
    rules: [
      'state_at and state_because are required together when state is "met" or "dropped", and refused while ' +
        'state is "open" — a goal that has not ended has no end date and no reason for one.',
    ],
    example: {
      horizon: 'short',
      what: 'A report of any size exports without the browser tab running out of memory.',
      owner: 'owner',
      state: 'open',
    },
}

/** The shapes of this kind, moved out of ../kinds.ts with their comments unchanged. */
export const GOAL_SHAPES: Record<string, ShapeSpec> = {
  /**
   * THE PERSON'S PRESS ON AN AGENT-FILED GOAL. Criterion P1.
   *
   * An agent may file a goal; until the person confirms it, the goal is marked as the agent's and
   * every list and the record page say so. What the person presses writes this object: who confirmed it and
   * when. A SHAPE AND NOT AN OPEN BAG, because every field is read — the page says who has seen the
   * goal and since when — and because the guard `assertMayConfirmAGoal` refuses this whole object to
   * every agent but a secretary on the person's word, so its fields are the protected thing rather than one of
   * them. A decision added `pressed_by` and `evidence` for that secretary: the goal
   * keeps who pressed, on whose word, and the evidence, so the mark stays honest.
   */
  GoalConfirmation: {
    name: 'GoalConfirmation',
    description:
      'THE PERSON SAYING THEY HAVE SEEN AN AGENT-FILED GOAL. It is absent until they press, which is a real state: ' +
      'the goal is then marked as the agent\'s. The person writes one by pressing Confirm. A secretary may write one ' +
      'for the person when it names the person\'s decision or message that says so, and then it also says who pressed ' +
      'and what the evidence is. No other agent may. Its presence is what clears the mark — there is no separate ' +
      'boolean to keep in step with it.',
    fields: [
      {
        key: 'by',
        type: 'string',
        required: true,
        description:
          'On whose word it is confirmed: the person, by name or handle. Must be the person, also when a secretary ' +
          'presses for them — the server refuses any other value.',
        example: 'owner',
      },
      {
        key: 'at',
        type: 'date',
        required: true,
        description: 'When it was pressed, in local wall clock. The date a reader sees beside the goal.',
        example: '2026-09-16',
      },
      {
        key: 'pressed_by',
        type: 'string',
        required: false,
        description:
          'The secretary that pressed for the person, when one did. The server checks it against the caller, so it ' +
          'names the agent that really made the write. Absent when the person pressed.',
        example: 'secretary',
      },
      {
        key: 'evidence',
        type: 'string',
        required: false,
        description:
          'Where the person said so, when a secretary pressed: "decision:<id>", a decision the person made that ' +
          'names this goal, or "message:<id>", the person\'s message, which the same write cites in its warrant. ' +
          'Absent when the person pressed.',
        example: 'decision:AbCdEfGh1234',
      },
    ],
  },

}
