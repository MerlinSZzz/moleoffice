// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE KIND IN A FILE OF ITS OWN: `planned_state`, one intended state inside one trajectory.
 *
 * It was moved out of src/shared/kinds.ts with no change of behaviour: the same purpose,
 * whenToRecord, humanOnly, fields, rules and example, and the same place in the kind list.
 *
 * NO CALLER CHANGED. src/shared/kinds.ts hands this file on with `export *`, and every caller
 * still imports the kind from kinds.ts.
 *
 * THIS FILE IMPORTS `commonFields` AND THE `KindSpec` TYPE FROM ./kind-common.ts. IT IMPORTS
 * NOTHING FROM ../types.ts. NO DECLARATION MOVED WITH THIS KIND.
 */
import { commonFields, type KindSpec } from './kind-common.ts'

export const plannedStateKind: KindSpec = {
    kind: 'planned_state',
    purpose: 'ONE INTENDED STATE INSIDE ONE TRAJECTORY: what would be true when this part is real. It has not happened.',
    whenToRecord:
      'As part of writing a trajectory. One sentence saying what would be true \u2014 not what would be DONE, which is ' +
      'a task. When something makes it real, link that thing to this one with `realises`; when something else ' +
      'answered it another way, link with `instead_of`.',
    humanOnly: false,
    fields: [
      {
        key: 'what',
        type: 'string',
        required: true,
        description: 'WHAT WOULD BE TRUE when this state is real. One sentence, in the present tense.',
        example: 'The clamp closes on a 40 mm pot without slipping.',
      },
      {
        key: 'because',
        type: 'string',
        required: false,
        description: 'WHY THIS STATE RATHER THAN ANOTHER. Authored text, and an agent may never overwrite one.',
        example: 'A wider jaw would not fit the lane.',
      },
      // NO `attentionFields` HERE, and that is deliberate. Attention is about what is holding
      // something up now; a planned state is not running and cannot be held up. What is set aside
      // is the whole planned future, on the trajectory, the way a parked `direction` works.
      ...commonFields('planned state'),
    ],
    rules: [
      'it has no state field and is not getting one: whether it came true is read from `realises` and ' +
        '`instead_of` links.',
      'rewording an ANSWERED planned state is a governance act \u2014 that is rewriting the old plan to match what ' +
        'was built. See `assertMayShapeTheFuture`.',
    ],
    example: { what: 'The clamp closes on a 40 mm pot without slipping.' },
}
