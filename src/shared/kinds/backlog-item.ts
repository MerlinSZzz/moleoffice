// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE KIND IN A FILE OF ITS OWN: `backlog_item`, one item of backlog work.
 *
 * It was moved out of src/shared/kinds.ts with no change of behaviour: the same purpose,
 * whenToRecord, humanOnly, fields, rules and example, and the same place in the kind list.
 *
 * NO CALLER CHANGED. src/shared/kinds.ts hands this file on with `export *`, and every caller
 * still imports the kind from kinds.ts.
 *
 * THIS FILE IMPORTS `attentionFields`, `commonFields`, `unionOf` AND THE `KindSpec` TYPE FROM
 * ./kind-common.ts, AND `BACKLOG_ITEM_STATES` FROM ../backlog.ts. IT IMPORTS NOTHING FROM
 * ../types.ts. NO DECLARATION MOVED WITH THIS KIND.
 */
import { attentionFields, commonFields, unionOf, type KindSpec } from './kind-common.ts'
import { BACKLOG_ITEM_STATES } from '../backlog.ts'
export const backlogItemKind: KindSpec = {
    kind: 'backlog_item',
    purpose:
      "ONE ITEM OF A LINE'S BACKLOG: which line it is in and its number there, who placed it, when and why, what counts " +
      'as done, the files it involves, its place in the line, whether it is paused and until when, where it stands, and ' +
      'the merge it landed in. A round reads its own line\'s items with GET /api/backlog?line=<line> and not the whole ' +
      'backlog.',
    whenToRecord:
      "When a piece of work is placed in a line's backlog. File it with POST /api/records, kind \"backlog_item\". Change " +
      'its state as the work moves, and write the merge it landed in when it lands.',
    humanOnly: false,
    fields: [
      {
        key: 'line',
        type: 'string',
        required: true,
        description:
          "WHICH LINE'S BACKLOG IT IS IN, as the line is named, for example \"13s\". GET /api/backlog?line=<line> answers " +
          'the items whose line is exactly these words.',
        example: '13s',
      },
      {
        key: 'number',
        type: 'string',
        required: true,
        description: 'ITS NUMBER IN THE LINE, as the line writes it, for example "38" or "30c".',
        example: '38',
      },
      {
        key: 'placedBy',
        type: 'ParticipantRef',
        required: true,
        description:
          'WHO PLACED IT in the backlog: the person or the agent, as a registry reference, kind "person" or "agent" and ' +
          'its registry id, never a handle. GET /api/participants lists every registry id. A write naming somebody no ' +
          'registry row answers to is refused.',
        example: { kind: 'person', id: 'Pe1r2s3o4n5x' },
      },
      {
        key: 'placedAt',
        type: 'date',
        required: false,
        description: 'WHEN IT WAS PLACED, as "2026-10-29" or "2026-10-29 08:50". Absent means nobody wrote when.',
        example: '2026-10-29 08:50',
      },
      {
        key: 'why',
        type: 'string',
        required: true,
        description: 'WHY IT WAS PLACED, in words, with the decision or the problem it comes from where there is one.',
        example: 'Each item of a backlog is to be a record that a round can read on its own.',
      },
      {
        key: 'doneWhen',
        type: 'string',
        required: true,
        description: 'WHAT COUNTS AS DONE, written so that somebody could look and answer yes or no.',
        example: 'An agent files an item through POST /api/records and reads it back through GET /api/backlog.',
      },
      {
        key: 'files',
        type: 'string[]',
        required: false,
        description: 'THE FILES IT INVOLVES, each as a path from the root of the repository. Absent means nobody listed them.',
        example: ['src/shared/backlog.ts', 'src/server/api/backlog.ts'],
      },
      {
        key: 'order',
        type: 'number',
        required: false,
        description:
          'ITS PLACE IN THE LINE: a smaller number comes first. Items with no order come after every item with one, and ' +
          'items with the same order, or with none, come in the order they were filed.',
        example: 1,
      },
      { key: 'fromDecision', type: 'string', required: false, description: 'The decision this point comes from, written by the packaging door or explicitly named. Absent means nobody said which decision raised it.', example: 'decision-id' },
      { key: 'briefId', type: 'string', required: false, description: 'The task whose package carries this point, written by the packaging door. Absent means it has not been put in a brief.', example: 'task-id' },
      { key: 'briefsCarried', type: 'number', required: false, description: 'The number of briefs entered without moving, written by the packaging door. Absent means it has never been in a brief.', example: 1 },
      {
        key: 'state',
        type: unionOf(BACKLOG_ITEM_STATES),
        required: true,
        description:
          'WHERE IT STANDS: "todo" before anybody started it, "doing" while a round works on it, "done" when what counts ' +
          'as done is true, "dropped" when it was taken out of the backlog without being done. A pause is the paused ' +
          'field and not a state.',
        example: 'todo',
      },
      {
        key: 'landedIn',
        type: 'string',
        required: false,
        description: 'THE MERGE IT LANDED IN: the id of that merge entry\'s record. Absent until it lands.',
        example: 'Me1r2g3e4i5d',
      },
      ...attentionFields('backlog item'),
      ...commonFields('backlog_item'),
    ],
    rules: [
      'Who placed it is named by kind and registry id, never by a handle. A write that names somebody no registry row answers to is refused, and only a value the write changes is asked about.',
      'GET /api/backlog?line=<line> answers the items of one line in this project, in the order of the line.',
      '"done" and "dropped" are two words: an item taken out of the backlog was not done.',
    ],
    example: {
      line: '13s',
      number: '38',
      placedBy: { kind: 'person', id: 'Pe1r2s3o4n5x' },
      placedAt: '2026-10-29 08:50',
      why: 'Each item of a backlog is to be a record that a round can read on its own.',
      doneWhen: 'An agent files an item through POST /api/records and reads it back through GET /api/backlog.',
      order: 1,
      state: 'todo',
    },
}
