// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import type { FieldsOfALine } from '../kinds.ts'

/**
 * THE FIELDS THE LINE 14d ADDS TO THE SESSION KIND: a run's tokens so far, read while it runs. The head comment of
 * src/shared/kinds.ts says how this file is joined to the kind's own fields. The three are written together, by the
 * worker that started the run (recordTheTokensSoFar in src/worker/index.ts), and the step reminder in
 * src/server/lib/step-reminders.ts reads them.
 */
export const sessionWave14d: FieldsOfALine = {
  kind: 'session',
  fields: [
    {
      key: 'tokensSoFar',
      type: 'number',
      required: false,
      description:
        "THE TOKENS THIS RUN HAS SPENT SO FAR, as the office read them from what the run's runtime writes while it runs " +
        '(src/config/tokens-so-far.mjs). howTheTokensWereReadAndCounted says which tokens are counted and what was read, and ' +
        'whenTheTokensWereRead says when. The worker that started the run writes it when the count has grown by 10,000 or more ' +
        'and five minutes have passed since it last wrote, and at once when the count reaches the step reminder\'s ' +
        'setting. No agent writes it. ABSENT MEANS NOBODY WROTE A COUNT: the runtime gives none while it runs, the run ' +
        'was not started by a worker, no count has been read yet, or the run began before this field existed (wave ' +
        '14d). A run with no count is reminded of its step by time only. It is never a zero for a count not known.',
      example: 152_340,
    },
    {
      key: 'whenTheTokensWereRead',
      type: 'date',
      required: false,
      description:
        'WHEN tokensSoFar WAS READ, in local time. Written with tokensSoFar, and absent when it is absent.',
      example: '2026-11-16 15:42:10',
    },
    {
      key: 'howTheTokensWereReadAndCounted',
      type: 'string',
      required: false,
      description:
        'WHAT tokensSoFar WAS READ FROM AND WHICH TOKENS IT COUNTS, in the reader\'s own sentence. Written with ' +
        'tokensSoFar, and absent when it is absent.',
      example:
        'Read from the conversation file, each answer once. Counted: input not read from the cache, plus cache writes, ' +
        'plus output; cache reads are left out.',
    },
  ],
}
