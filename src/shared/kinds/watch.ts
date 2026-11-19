// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE KIND IN A FILE OF ITS OWN: `watch`, something watched for a change.
 *
 * It was moved out of src/shared/kinds.ts with no change of behaviour: the same purpose,
 * whenToRecord, humanOnly, fields, rules and example, and the same place in the kind list.
 *
 * NO CALLER CHANGED. src/shared/kinds.ts hands this file on with `export *`, and every caller
 * still imports the kind from kinds.ts.
 *
 * THIS FILE IMPORTS `commonFields`, `unionOf` AND THE `KindSpec` TYPE FROM ./kind-common.ts, AND
 * `WATCH_RUNS_AS` AND `WATCH_STATES` FROM ../watches.ts. IT IMPORTS NOTHING FROM ../types.ts. NO
 * DECLARATION MOVED WITH THIS KIND.
 */
import { commonFields, unionOf, type KindSpec } from './kind-common.ts'
import { WATCH_RUNS_AS, WATCH_STATES } from '../watches.ts'
export const watchKind: KindSpec = {
    kind: 'watch',
    purpose:
      'ONE WATCH OR TIMER AN AGENT KEEPS RUNNING: what it does, whose it is, how it runs, when it ends, whom it wakes ' +
      'and when, where it keeps its state, how it starts again each day, when it was last seen alive, and whether it ' +
      'is running. After a compaction, a new conversation or a restart, its holder reads its watches and sees which ' +
      'one should be running and is not. The office does not run a watch or look at it: every field is what its ' +
      'holder or another agent wrote.',
    whenToRecord:
      'When you start a watch or a timer that has to keep running after this conversation ends: a background task of ' +
      'your tool, a timer of the system, or a group of processes. File it with POST /api/records, kind "watch". ' +
      'Change its state and the time you last saw it alive as they change. Read your watches with GET ' +
      '/api/records?kind=watch.',
    humanOnly: false,
    fields: [
      {
        key: 'does',
        type: 'string',
        required: true,
        description: 'WHAT IT DOES, in one sentence a reader who has never seen it can check. The title is its name.',
        example: 'Reads the merge queue every ten minutes and says when an entry has waited more than an hour.',
      },
      {
        key: 'holder',
        type: 'ParticipantRef',
        required: true,
        description:
          'WHOSE IT IS: the agent or person who keeps it running, as a registry reference, kind "agent" or "person" ' +
          'and its registry id, never a handle. GET /api/participants lists every registry id. A write naming somebody ' +
          'no registry row answers to is refused.',
        example: { kind: 'agent', id: 'Ag1e2r3t4y5u' },
      },
      {
        key: 'runsAs',
        type: unionOf(WATCH_RUNS_AS),
        required: true,
        description:
          'HOW IT RUNS: "background_task" for a task your own tool keeps in the background, "system_timer" for a timer ' +
          'of the system, "process_group" for a group of processes you started.',
        example: 'background_task',
      },
      {
        key: 'endsWhen',
        type: 'date | PauseUntil',
        required: false,
        description:
          'WHEN IT ENDS: a date, as "2026-11-01" or "2026-11-01 18:00", or the shape a pause takes for what ends it: ' +
          '{"condition": "<words>"} or {"recordId": "<the record whose finishing ends it>"}. Absent means nobody has said.',
        example: { condition: 'the merge queue is empty for a whole day' },
      },
      {
        key: 'wakes',
        type: 'string',
        required: false,
        description: 'WHOM IT WAKES, AND WHEN: what has to happen for it to wake somebody, and who that is, in words.',
        example: 'Wakes its holder when an entry has waited more than an hour.',
      },
      {
        key: 'stateFile',
        type: 'string',
        required: false,
        description: 'WHERE IT KEEPS ITS STATE: the whole path of the file, on the computer it runs on.',
        example: '/srv/watches/merge-queue/state.json',
      },
      {
        key: 'dailyRestart',
        type: 'string',
        required: false,
        description: 'HOW IT STARTS AGAIN EACH DAY, in words: what starts it, and at what time.',
        example: 'A system timer starts it again at 06:00 each day.',
      },
      {
        key: 'lastSeenAlive',
        type: 'date',
        required: false,
        description:
          'WHEN IT WAS LAST SEEN ALIVE, as "2026-10-29 08:40", by whoever wrote this field. The office does not look; ' +
          'it keeps the time it was told.',
        example: '2026-10-29 08:40',
      },
      {
        key: 'state',
        type: unionOf(WATCH_STATES),
        required: true,
        description:
          'WHETHER IT IS RUNNING: "running" while it should be running, "stopped" when it stopped before its end, ' +
          '"ended" when its end came.',
        example: 'running',
      },
      ...commonFields('watch'),
    ],
    rules: [
      'Its holder is named by kind and registry id, never by a handle. A write that names a holder no registry row answers to is refused, and only a holder the write changes is asked about.',
      'The office does not run a watch or look at it. Its state and the time it was last seen alive are what somebody wrote.',
      '"stopped" and "ended" are two words: a watch whose end came has not stopped short.',
    ],
    example: {
      does: 'Reads the merge queue every ten minutes and says when an entry has waited more than an hour.',
      holder: { kind: 'agent', id: 'Ag1e2r3t4y5u' },
      runsAs: 'background_task',
      wakes: 'Wakes its holder when an entry has waited more than an hour.',
      lastSeenAlive: '2026-10-29 08:40',
      state: 'running',
    },
}
