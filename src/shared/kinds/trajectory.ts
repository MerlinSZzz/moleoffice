// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE KIND IN A FILE OF ITS OWN: `trajectory`, one intended future for one pipeline, module or block.
 *
 * It was moved out of src/shared/kinds.ts with no change of behaviour: the same purpose,
 * whenToRecord, humanOnly, fields, rules and example, and the same place in the kind list.
 *
 * NO CALLER CHANGED. src/shared/kinds.ts hands this file on with `export *`, and every caller
 * still imports the kind from kinds.ts.
 *
 * THIS FILE IMPORTS `attentionFields` AND `commonFields` AND THE `KindSpec` AND `ShapeSpec`
 * TYPES FROM ./kind-common.ts. IT IMPORTS NOTHING FROM ../types.ts.
 */
import { attentionFields, commonFields, type KindSpec, type ShapeSpec } from './kind-common.ts'

export const trajectoryKind: KindSpec = {
    kind: 'trajectory',
    purpose:
      'ONE INTENDED FUTURE FOR ONE PIPELINE, MODULE OR BLOCK: an ordered set of intended states, held together so ' +
      'that our idea of the future can change as a whole. Nothing in it has happened.',
    whenToRecord:
      'When there is a shape to the future worth writing down \u2014 this, then that, then the other \u2014 and somebody ' +
      'would otherwise have to hold it in their head. Link it to what it plans for with a `plans_for` link, ' +
      'POST /api/links {"fromId":"<this trajectory>","toId":"<the pipeline, module or block>","type":"plans_for"}; ' +
      'a trajectory has exactly one. It is NOT a schedule: dates and hours belong to a plan.',
    humanOnly: false,
    fields: [
      {
        key: 'plannedStateIds',
        type: 'string[]',
        required: true,
        description:
          'THE IDS OF THE PLANNED STATES, in the intended order. Every one must name a live `planned_state`, no id ' +
          'twice, and a planned state belongs to exactly one trajectory. NOT `blockIds`: a planned state is not a ' +
          'step and can never be a member of a pipeline.',
        example: ['pS1aaaaaaaaa', 'pS2bbbbbbbbb'],
      },
      {
        key: 'edges',
        type: 'PlanEdge[]',
        required: false,
        description:
          'THE SHAPE OF THE PLAN \u2014 which state leads to which, and what it carries. `{from, to, carries?}` over ' +
          'planned-state ids. Absent is not the same as empty: absent means nobody has drawn the shape, empty ' +
          'means somebody said there is none.',
        example: [{ from: 'pS1aaaaaaaaa', to: 'pS2bbbbbbbbb', carries: 'the calibrated pose' }],
      },
      {
        key: 'because',
        type: 'string',
        required: false,
        description:
          'WHY THIS FUTURE AND NOT ANOTHER. Authored text. An agent may write one where there is none and may ' +
          'never overwrite or empty one somebody else wrote.',
        example: 'The clamp has to be right before the lane travel means anything, so it goes first.',
      },
      // `paused` AND `consequence` COME FROM HERE, not from a field written out above. Setting a
      // planned future aside is exactly what a `direction` does when it is parked, and a second
      // spelling of one fact is the defect this repository keeps producing.
      ...attentionFields('planned future'),
      ...commonFields('planned future'),
    ],
    rules: [
      'every id in `plannedStateIds` names a live `planned_state` record, no id appears twice, and a planned ' +
        'state belongs to exactly one trajectory. Enforced by `checkPlannedStateIds`, which refuses everybody ' +
        'equally because none of the three is a question about who asked.',
      'dropping a live planned state from `plannedStateIds`, removing or re-pointing an edge, emptying a ' +
        '`carries` that was not empty, setting or clearing `paused`, and overwriting `because` are governance ' +
        'acts: an agent is refused, a person is not. See `assertMayShapeTheFuture`.',
    ],
    // THE WORKED EXAMPLE NAMES NO IDS, the way a pipeline's does not either. Every id in
    // `plannedStateIds` has to name a live `planned_state`, so an example carrying two invented ones
    // is an example that is refused when it is copied. What the ids look like is on the FIELD, where
    // it belongs; what the example is for is showing the shape of a record somebody can actually
    // file. File the states first, then send their ids.
    example: {
      plannedStateIds: [],
      because: 'The clamp has to be right before the lane travel means anything.',
    },
}

/** The shapes of this kind, moved out of ../kinds.ts with their comments unchanged. */
export const TRAJECTORY_SHAPES: Record<string, ShapeSpec> = {
  /**
   * ONE EDGE OF A PLANNED FUTURE: which intended state leads to which, and what it carries.
   *
   * It is a shape rather than free text because it is half of the plan's structure \u2014 the A \u2192 B \u2192 C
   * that can be drawn \u2014 and because `assertMayShapeTheFuture` has to be able to
   * compare what was there against what a write would leave, pair by pair, to tell adding an edge
   * (allowed to an agent) from removing or re-pointing one (not).
   */
  PlanEdge: {
    name: 'PlanEdge',
    description:
      'ONE EDGE OF A PLANNED FUTURE: the intended state it runs from, the one it runs to, and optionally what it ' +
      'carries across. Both ends name `planned_state` records listed in the same trajectory.',
    fields: [
      {
        key: 'from',
        type: 'string',
        required: true,
        description: 'The id of the planned state this edge runs FROM. It must be one of the trajectory\u2019s own states.',
        example: 'pS1aaaaaaaaa',
      },
      {
        key: 'to',
        type: 'string',
        required: true,
        description: 'The id of the planned state this edge runs TO. It must be one of the trajectory\u2019s own states.',
        example: 'pS2bbbbbbbbb',
      },
      {
        key: 'carries',
        type: 'string',
        required: false,
        description:
          'WHAT WOULD PASS ALONG THIS EDGE, in a few words \u2014 a result, a calibration, a part. Leave it out when ' +
          'the edge is only an order; emptying one that was not empty is a governance act.',
        example: 'the calibrated pose',
      },
    ],
  },

}
