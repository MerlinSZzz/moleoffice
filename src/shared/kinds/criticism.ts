// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE KIND IN A FILE OF ITS OWN: `criticism`, where the product got in an agent’s way.
 *
 * It was moved out of src/shared/kinds.ts with no change of behaviour: the same purpose,
 * whenToRecord, humanOnly, fields, example and place in the kind list.
 *
 * NO CALLER CHANGED. src/shared/kinds.ts hands this file on with `export *`, and every caller
 * still imports the kind from kinds.ts.
 *
 * THIS FILE IMPORTS `commonFields` AND THE `KindSpec` AND `ShapeSpec` TYPES FROM
 * ./kind-common.ts. IT IMPORTS NOTHING FROM ../types.ts. THE `IndependentCriticism` SHAPE MOVED
 * HERE WITH THE KIND, AND `commonFields` STAYS IN kind-common.ts.
 */
import { commonFields, type KindSpec, type ShapeSpec } from './kind-common.ts'

export const criticismKind: KindSpec = {
    kind: 'criticism',
    purpose: 'Where the product got in an agent’s way, and what the agent wants changed instead.',
    whenToRecord: 'The moment the product gets in the way of real work, about the record of that work through POST /api/records/<id>/criticisms.',
    humanOnly: false,
    fields: [
      { key: 'tried', type: 'string', required: true, description: 'What the agent was trying to do.', example: 'File the result.' },
      { key: 'got_in_the_way', type: 'string', required: true, description: 'Where the product got in the way.', example: 'The door hid the field.' },
      { key: 'did_instead', type: 'string', required: true, description: 'What the agent did instead.', example: 'Kept a note.' },
      { key: 'wants_changed', type: 'string', required: true, description: 'What the agent wants changed.', example: 'Show the field.' },
      { key: 'evidence', type: 'string[]', required: false, description: 'What was observed, one entry per piece.', example: ['The field was absent.'] },
      { key: 'independent', type: 'IndependentCriticism', required: false, description: 'The independent criticism step writes this; a criticism filed through the ordinary record door carries none.', example: { critic: { kind: 'agent', id: 'critic-aa' }, author: { kind: 'agent', id: 'builder-aa' }, at: '2026-11-09' } },
      ...commonFields('criticism'),
    ],
    example: { tried: 'File the result.', got_in_the_way: 'The door hid the field.', did_instead: 'Kept a note.', wants_changed: 'Show the field.', evidence: ['The field was absent.'], independent: { critic: { kind: 'agent', id: 'critic-aa' }, author: { kind: 'agent', id: 'builder-aa' }, at: '2026-11-09' } },
    rules: ['File a criticism about a record through the criticism door; the office writes independent.'],
}

/** The shapes of this kind, moved out of ../kinds.ts with their comments unchanged. */
export const CRITICISM_SHAPES: Record<string, ShapeSpec> = {
  IndependentCriticism: {
    name: 'IndependentCriticism',
    description: 'The office records who criticised the work, who authored it, and when the step was filed.',
    fields: [
      { key: 'critic', type: 'ParticipantRef', required: true, description: 'The registered participant who criticised the work.', example: { kind: 'agent', id: 'critic-aa' } },
      { key: 'author', type: 'ParticipantRef', required: true, description: 'The registered participant who authored the work.', example: { kind: 'agent', id: 'builder-aa' } },
      { key: 'at', type: 'date', required: true, description: 'When the independent criticism was filed.', example: '2026-11-09' },
    ],
  },

}
