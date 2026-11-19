// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE KIND IN A FILE OF ITS OWN: `block`, one step of one pipeline.
 *
 * It was moved out of src/shared/kinds.ts with no change of behaviour: the same purpose,
 * whenToRecord, humanOnly, fields, rules and example, and the same place in the kind list.
 *
 * NO CALLER CHANGED. src/shared/kinds.ts hands this file on with `export *`, and every caller
 * still imports the kind from kinds.ts.
 *
 * THIS FILE IMPORTS THE SHARED FIELD HELPERS AND `unionOf` FROM ./kind-common.ts, `ITEM_STATES`
 * FROM ../types.ts AND `MAP_TIERS` FROM ../big-map.ts, because its `state` and `tier` fields are
 * unions of them. Neither shared module imports the central file, so this folder makes no runtime
 * cycle through it.
 */
import { attentionFields, commonFields, effortField, unionOf, type KindSpec } from './kind-common.ts'
import { ITEM_STATES } from '../types.ts'
import { MAP_TIERS } from '../big-map.ts'

export const blockKind: KindSpec = {
    kind: 'block',
    purpose: 'One step of one pipeline, as its own record, so that a problem or a claim can attach to the step rather than to the whole pipeline.',
    whenToRecord:
      'Never on its own. A block is created through its pipeline — POST /api/records/<pipeline id>/blocks — because ' +
      'its title is qualified by the pipeline and its position lives in that pipeline\'s `blockIds`. A bare ' +
      'POST /api/records {"kind":"block"} is refused, with the route to use.',
    humanOnly: false,
    fields: [
      {
        key: 'state',
        type: unionOf(ITEM_STATES),
        required: true,
        description:
          'Where this block has got to. The home page and the pipeline page read these to say which block the ' +
          'pipeline is standing on, and the attention rule reads them to say which work stopped short.',
        example: 'done',
      },
      {
        key: 'measured',
        type: 'string',
        required: false,
        description: 'What was measured on this block, in the units it was measured in. Leave it out when nothing has been measured.',
        example: 'p50 42 ms · p95 61 ms · n=400',
      },
      // THE CANONICAL METHOD. Landed by round ten wave 8 rather than by the thread that owns it,
      // and that is worth stating: the guard that stops a fallback rewriting a canonical method
      // needs a canonical method to guard, and a guard over a field nothing can store is a guard
      // that refuses nobody. The ontology thread pins the FIELD; this is the field.
      {
        key: 'method',
        type: 'string',
        required: false,
        description:
          'THE CANONICAL METHOD for this step: what this step is supposed to do, named precisely enough that ' +
          'somebody could tell whether it ran. It is what a person and an agent both read as the answer to ' +
          '"how is this done". A method that ran INSTEAD of this one does NOT go here and never rewrites this ' +
          'field: file a `ran_instead` record through POST /api/records/<this block>/ran-instead, which says what ' +
          'ran, why, and what that stops the project claiming. While such a record is live, only a person may ' +
          'change this field — changing the canonical method is a governance act, not a runtime one.',
        example: 'SAM segmentation',
      },
      // The same as on a checklist item, and for the same measured reason: "a failed pipeline step
      // can raise no alarm" was one of the two findings the design review recorded against the old
      // attention rule. A block can raise one — but only if it is allowed to say who gets hurt.
      effortField('block'),
      // WHERE THE STEP IS DRAWN ON THE BIG MAP. The seven words and their order are src/shared/big-map.ts.
      {
        key: 'tier',
        type: unionOf(MAP_TIERS),
        required: false,
        description:
          'WHERE THIS STEP IS DRAWN ON THE BIG MAP of the project\'s architecture, for a step that stands for one box ' +
          'of the architecture diagram: one of five rows from top to bottom (the ways in, the request gate, the domain ' +
          'services, data access, the stores) or one of two side columns (starting and hosting on the left, the agents\' ' +
          'runtime on the right). Absent means nobody has placed it, and the map lists it under "Not placed on the ' +
          'map", never in a guessed row.',
        example: 'services',
      },
      ...attentionFields('block'),
      ...commonFields('block'),
    ],
    rules: [
      'a block\'s title is "<its pipeline\'s title> › <its own name>", with U+203A between them. It is built by ' +
        'the server, not by the caller: POST and PATCH on /api/records/<pipeline id>/blocks take `name`, and a ' +
        'PATCH to the record itself that sends a title in any other form is refused.',
      'the modules that carry a block are `implements` links from the module to the block, not a list of titles. ' +
        'A title-based list and a link were two statements of one fact, and one rename broke ten of them silently.',
      'what a block waits on is a `blocks` link from the needed block to this one, carrying the gate. There is no ' +
        '`needs` field, and a link either exists or it does not — so zero links means no dependency has been ' +
        'RECORDED, which a reader must not print as "it waits on nothing".',
      '`method` is the canonical method and a fallback never writes it. When a run could not use the method this ' +
        'step declares and used something else, file POST /api/records/<this block>/ran-instead. While a live one ' +
        'of those names this block, an AGENT may not patch `data.method` here; a person may.',
    ],
    example: {
      state: 'doing',
      measured: 'hold 1.4 s over 6 trials — the 20-trial run has not happened',
      method: 'SAM segmentation',
    },
}
