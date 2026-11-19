// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE KIND IN A FILE OF ITS OWN: `pipeline`, an ordered set of blocks that produces an outcome.
 *
 * It was moved out of src/shared/kinds.ts with no change of behaviour: the same purpose,
 * whenToRecord, humanOnly, fields, rules and example, and the same place in the kind list.
 *
 * NO CALLER CHANGED. src/shared/kinds.ts hands this file on with `export *`, and every caller
 * still imports the kind from kinds.ts.
 *
 * THIS FILE IMPORTS ONLY FROM ./kind-common.ts: the type and the two shared field helpers. The
 * type import is erased by the compiler, so this folder makes no runtime cycle through the
 * central file.
 */
import { attentionFields, commonFields, type KindSpec } from './kind-common.ts'

export const pipelineKind: KindSpec = {
    kind: 'pipeline',
    purpose: 'An ordered set of blocks that produces an outcome. Each block is its own record, and this says what order they go in.',
    whenToRecord:
      'When a result comes out of several steps in a fixed order and you need to see which one the work is standing on. ' +
      'A pipeline is not a checklist: its blocks are carried by modules, and one block can need two of them.',
    humanOnly: false,
    fields: [
      {
        key: 'blockIds',
        type: 'string[]',
        required: true,
        description:
          'The record ids of this pipeline\'s blocks, in the order the work happens. This array is the ONLY place ' +
          'that says which blocks belong to this pipeline and what order they go in, so a block stores no pipeline ' +
          'of its own and there is nothing for the two to disagree about. Order is content; nothing sorts these. ' +
          'A write that uses the old key `steps`, or `blocks`, is refused with a 400 naming this one and nothing ' +
          'is stored: a pipeline whose steps landed in `extra` renders as an empty pipeline and calls it correct. ' +
          'DO NOT WRITE THIS BY HAND to add a block — POST /api/records/<pipeline id>/blocks {"name":…,"state":…} ' +
          'mints the block record with the right title and appends it here in one transaction, and ' +
          'PUT /api/records/<pipeline id>/blocks {"blockIds":[…]} is how you reorder. Which blocks really WAIT on ' +
          'which is a separate thing and is not order: it is a `blocks` link from the needed block to the waiting ' +
          'one, carrying the gate, because order alone cannot say that one block feeds two others. ' +
          'THE EXAMPLE IS AN EMPTY ARRAY AND THAT IS THE ONLY SAFE ONE TO COPY. It used to be three made-up ids, ' +
          'and made-up ids are precisely what this field cannot hold: file the pipeline empty, then add each ' +
          'block through the route above, which is the only way to file a block anyway.',
        example: [],
      },
      {
        key: 'dependenciesComplete',
        type: 'boolean',
        required: false,
        description:
          'True when every dependency in this pipeline has been written down as a `blocks` link. ' +
          'LEAVE IT OUT UNTIL SOMEBODY HAS CHECKED, because absent is a real answer and it is a ' +
          'different one from false. Two steps with no `blocks` link between them mean one of two ' +
          'things: they run independently on purpose, or nobody has recorded what they wait on. ' +
          'The drawing lays such steps out side by side either way, and side by side reads as ' +
          '"these run in parallel" — so with nothing stored, a picture is claiming something the ' +
          'corpus never said. This field is the only thing that says which: true means the gaps ' +
          'are deliberate, false means somebody has noticed the links are unfinished, and absent ' +
          'means nobody has said. Nothing infers it: a pipeline whose every step happens to carry ' +
          'a link is still absent until a person or an agent writes this down. Measured on the ' +
          'campaign pipeline on 2026-08-20: 17 blocks, 9 `blocks` links, 7 blocks ' +
          'with no dependency link at either end, and no pipeline in any workspace claiming ' +
          'anything about it.',
        example: true,
      },
      // THE PIPELINE'S OWN BODY. A pipeline page has three parts: the summary at the top, the drawing in the middle and
      // this body at the bottom.
      // A field of its own, because the summary is level 3 of the reading ladder and is held to 20 to 60 words.
      {
        key: 'context',
        type: 'string',
        required: false,
        description:
          'What this pipeline is, at more length than its summary: one to three short paragraphs saying what it ' +
          'produces and, for a block pipeline, which code it holds and how it relates to the steps beside it. The ' +
          'pipeline page shows it below the drawing. Absent means nobody has written one, and the page says so in one line.',
        example: 'Block M3 of the architecture: the records, their revisions and their links, and the doors that write them.',
      },
      ...attentionFields('pipeline'),
      ...commonFields('pipeline'),
    ],
    rules: [
      'every id in `blockIds` must be the id of a live record of kind `block`. An id nothing holds draws no node ' +
        'and reports nothing, so it is refused rather than stored.',
      'the same block id may not appear twice IN ONE PIPELINE. A pipeline that lists one block at two positions ' +
        'has no order.',
      'More than one pipeline may list the same block. A block used to belong to exactly one pipeline; the owner ' +
        'reversed that on 6 September 2026 so that a rough plan and a detailed one can share a step.',
    ],
    // THE WORKED EXAMPLE USED TO BE FOUR IDS NO RECORD HELD, and `POST /api/records` did not check
    // them, so a caller copying this exactly was answered 201 with `incomplete: []` and left holding
    // a pipeline that could never be given a block — the append route refuses an order it cannot
    // read. `GET /api` named it as the one example that was not safe to copy, which is a warning
    // doing the work a correct example should do. Both halves are fixed: the create path now runs
    // the same three rules `PATCH` does, and this is an order you can copy.
    example: {
      blockIds: [],
    },
}
