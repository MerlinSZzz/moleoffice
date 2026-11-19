// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE KIND IN A FILE OF ITS OWN: `wanna_try`, something to try that is not yet an idea.
 *
 * It was moved out of src/shared/kinds.ts with no change of behaviour: the same purpose,
 * whenToRecord, humanOnly, fields and example, and the same place in the kind list.
 *
 * NO CALLER CHANGED. src/shared/kinds.ts hands this file on with `export *`, and every caller
 * still imports the kind from kinds.ts.
 *
 * THIS FILE IMPORTS `commonFields` AND THE `KindSpec` TYPE FROM ./kind-common.ts. IT IMPORTS
 * NOTHING FROM ../types.ts. NO DECLARATION MOVED WITH THIS KIND: `commonFields` STAYS IN
 * kind-common.ts.
 */
import { commonFields, type KindSpec } from './kind-common.ts'

export const wannaTryKind: KindSpec = {
    kind: 'wanna_try',
    purpose: 'Something to try that is not yet an idea: a hunch, a trick someone mentioned, a setting worth changing.',
    whenToRecord:
      'The moment you hear of something worth trying, before you have thought about it. The point of this kind is that ' +
      'filing one costs nothing — a title on its own is a complete record.',
    humanOnly: false,
    fields: [
      { key: 'why', type: 'string', required: false, description: 'What makes it worth an hour. One line is enough.', example: 'ULTRA depth held 30 fps where NEURAL did not, so it might survive the moisture viewer on the same GPU.' },
      { key: 'effort', type: 'string', required: false, description: 'Roughly what it would cost to try, in the units you actually think in: "an afternoon", "one run".', example: 'an afternoon' },
      ...commonFields('wanna_try'),
    ],
    example: { why: 'ULTRA depth may survive the moisture viewer on the same GPU.', source: 'the LeafCam forum thread on depth modes', effort: 'an afternoon' },
}
