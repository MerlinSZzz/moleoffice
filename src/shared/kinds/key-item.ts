// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE KIND IN A FILE OF ITS OWN: `key_item`, one of the few things a project keeps in front of the person, with its
 * progress and an estimate of the time left. Wave 13s round 281, point HD-2c of home as a data dashboard.
 *
 * THIS FILE IMPORTS THE `KindSpec` TYPE FROM ./kind-common.ts. src/shared/kinds.ts hands it on with `export *`. The
 * shared words and read shapes are src/shared/key-items.ts, the writes and reads src/server/lib/key-items.ts, and the
 * doors src/server/api/key-items.ts.
 */
import type { KindSpec } from './kind-common.ts'
export const keyItemKind: KindSpec = {
  kind: 'key_item',
  purpose:
    'ONE KEY ITEM OF A PROJECT: one of the few things the person keeps in front of them, with its place in the order, ' +
    'its progress and an estimate of the time left. Its progress is counted from the points of the packages it names, ' +
    'or is a figure somebody set when it names none. Its time left is an estimate, never a recorded fact, and it says ' +
    'who estimated it and when.',
  whenToRecord:
    'When the person or a secretary names a thing the project must keep in front of the person, or changes, moves or ' +
    'closes one. Write it with POST /api/key-items and the doors under /api/key-items/<id>; POST and PATCH /api/records ' +
    'refuse the kind, the person included.',
  humanOnly: false,
  fields: [
    {
      key: 'place',
      type: 'number',
      required: false,
      description:
        "ITS PLACE IN THE ORDER of its project's open key items, 1 first. Only an open key item has one, and the open ones " +
        'of a project hold 1 to their count, each once. The doors write it.',
      example: 1,
    },
    {
      key: 'state',
      type: "'open' | 'closed'",
      required: true,
      description: 'Open while it is kept in front of the person, closed when it is not. A closed one may be opened again.',
      example: 'open',
    },
    {
      key: 'packages',
      type: 'string[]',
      required: false,
      description:
        'THE IDS OF THE PACKAGES IT NAMES: tasks of this project that each hold an inside package with its points, each ' +
        'named once, at most 50. Its progress is counted from their points: the points done of all their points.',
      example: ['Tk1e2r3t4y5u'],
    },
    {
      key: 'progress',
      type: 'number',
      required: false,
      description:
        'A PROGRESS SOMEBODY SET, a whole percent from 0 to 100, for a key item that names no package. It is never ' +
        'written beside packages, whose points count it already.',
      example: 40,
    },
    {
      key: 'progressSetBy',
      type: 'ParticipantRef',
      required: false,
      description: 'WHO SET THE PROGRESS, written by the office from the writer. Nobody types it.',
      example: { kind: 'person', id: 'owner' },
    },
    {
      key: 'progressSetAt',
      type: 'date',
      required: false,
      description: "When the progress was set, on the office's clock. Nobody types it.",
      example: '2026-11-20 19:45:00',
    },
    {
      key: 'hoursLeft',
      type: 'number',
      required: false,
      description:
        'AN ESTIMATE OF THE TIME LEFT, in whole hours from 0, and never a recorded fact. It is shown as days of 24 hours ' +
        'and hours, with who estimated it and when. A change keeps the earlier estimate in the history.',
      example: 30,
    },
    {
      key: 'estimatedBy',
      type: 'ParticipantRef',
      required: false,
      description: 'WHO MADE THE ESTIMATE, written by the office from the writer. Nobody types it.',
      example: { kind: 'agent', id: 'Sc1e2r3t4y5u' },
    },
    {
      key: 'estimatedAt',
      type: 'date',
      required: false,
      description: "When the estimate was made, on the office's clock. Nobody types it.",
      example: '2026-11-20 19:45:00',
    },
  ],
  rules: [
    'Only the person, or a secretary writing as itself with its own key, writes a key item, and only through its own doors. Every other agent is refused.',
    'The office writes who set the progress or made the estimate, and when, from the writer and its own clock.',
    'A key item that names packages counts its progress from their points, and carries no progress of its own.',
    'Its time left is an estimate in whole hours, and every read of it says it is an estimate, who made it and when.',
    'The open key items of a project hold the places 1 to their count, each once. A closed one has no place, and opening it again puts it at the end.',
  ],
  example: {
    place: 1,
    state: 'open',
    progress: 40,
    progressSetBy: { kind: 'person', id: 'owner' },
    progressSetAt: '2026-11-20 19:45:00',
    hoursLeft: 30,
    estimatedBy: { kind: 'agent', id: 'Sc1e2r3t4y5u' },
    estimatedAt: '2026-11-20 19:45:00',
  },
}
