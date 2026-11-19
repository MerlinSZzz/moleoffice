// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE WAY TO ASK WHETHER A WRITE WOULD BE ACCEPTED, AND THE SENTENCE THAT TELLS A WRITER. Problem
 * jQayki_gIciU.
 *
 * A writer learnt the office's rules by losing writes to them. The two check doors run the write's
 * own code and take every row back (src/server/lib/only-a-check.ts). GET /api/kinds's `writing`, the
 * report kind's `blocks` description and the note on POST /api/records all read this one sentence,
 * so the three places a writer looks cannot name different doors.
 */
export const THE_RECORD_CHECK_DOOR = 'POST /api/records/check'
export const THE_SHORT_FORMS_CHECK_DOOR = 'POST /api/records/:id/short-forms/check'

/** One sentence for a writer, read before the write. */
export const ASK_FIRST_SENTENCE =
  `TO ASK FIRST WHETHER A WRITE WOULD BE ACCEPTED, send the same body to ${THE_RECORD_CHECK_DOOR}, or to ` +
  `${THE_SHORT_FORMS_CHECK_DOOR} for short forms. It runs the write's own checks and stores nothing: no record, ` +
  `no revision, no change row and no message. It answers 200 with {"wouldBeAccepted":true,"wroteNothing":true} ` +
  `and the status the write would answer, or the very refusal the write would give, with the same status and code. ` +
  `An answer is about that moment: a write sent later meets the office as it is then.`
