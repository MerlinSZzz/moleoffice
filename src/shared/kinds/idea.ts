// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE KIND IN A FILE OF ITS OWN: `idea`, a research idea and what it would need first.
 *
 * It was moved out of src/shared/kinds.ts with no change of behaviour: the same purpose,
 * whenToRecord, humanOnly, fields, example and place in the kind list.
 *
 * NO CALLER CHANGED. src/shared/kinds.ts hands this file on with `export *`, and every caller
 * still imports the kind, IDEA_STATES and IdeaState from kinds.ts.
 *
 * THIS FILE IMPORTS `commonFields`, `passedItOnField`, `unionOf`, `whoseMoveField` AND THE
 * `KindSpec` TYPE FROM ./kind-common.ts. IT IMPORTS NOTHING FROM ../types.ts. `IDEA_STATES`,
 * `IdeaState` AND THEIR ONE-LINE DOC COMMENT MOVED HERE WITH THE KIND; THE HELPERS STAY IN
 * kind-common.ts.
 */
import { commonFields, passedItOnField, unionOf, whoseMoveField, type KindSpec } from './kind-common.ts'
/** Where an idea has got to. */
export const IDEA_STATES = ['new', 'active', 'parked', 'dropped'] as const
export type IdeaState = (typeof IDEA_STATES)[number]

export const ideaKind: KindSpec = {
    kind: 'idea',
    purpose: 'A research idea: something that might be worth doing, and what it would need first.',
    whenToRecord:
      'When a thought is worth coming back to and would take real work. Something smaller and vaguer belongs ' +
      'under "worth a try", which is a kind of its own.',
    humanOnly: false,
    fields: [
      { key: 'state', type: unionOf(IDEA_STATES), required: false, description: 'Where it stands: new, active, parked or dropped.', example: 'parked' },
      // THE ONE KIND THAT KEEPS ITS PUT-DOWN REASON SOMEWHERE OTHER THAN `paused`, ON PURPOSE.
      //
      // Every other kind that can be put down carries the `Pause` shape, whose `since` — the date it
      // was put down — is required, because that is what makes an old pause visible as an old one. A
      // parked idea has no such date: nothing ever started. Giving it a `paused` block would mean
      // inventing a stamp, which is the guess this product refuses, and making `since` optional
      // would weaken the field on the eight kinds where it is doing real work to accommodate the one
      // where it cannot apply.
      //
      // So `parked_because` is CANONICAL for an idea and is not an untidy duplicate waiting to be
      // migrated. `putDownReason` in shared/work.ts is the one reader that knows this, and its
      // exception table has exactly one entry with the argument written against it. Do not "tidy"
      // this into a `paused` block: the reason it reads differently is that the fact is different.
      { key: 'parked_because', type: 'string', required: false, description: 'Why it is not being worked on. Without this, a parked idea reads as a forgotten one. THIS FIELD IS WHERE A PARKED IDEA KEEPS ITS REASON — an idea does not take the `paused` block other kinds use, because that block requires the date it was put down and an idea that was never picked up has no such date. Write the reason here and Mole Office reads it here.', example: 'the zero-velocity result sets a high bar for anything learned past 200 ms' },
      { key: 'would_need', type: 'string[]', required: false, description: 'What has to exist before it could be tried at all.', example: ['second camera calibrated', 'labelled release times from the demo replays'] },
      whoseMoveField('idea'),
      passedItOnField('idea'),
      ...commonFields('idea'),
    ],
    example: {
      state: 'parked',
      parked_because: 'the zero-velocity result sets a high bar for anything learned past 200 ms',
      would_need: ['second camera calibrated', 'labelled release times'],
    },
}
