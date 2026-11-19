// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A ROUND'S LAST MESSAGE THAT NAMED THE RUN IT CONTINUES, AND WHOSE CHECK WAS HELD FOR IT: the fixture for
 * tests/how-a-round-ended-rules.test.ts and tests/how-a-round-ended.test.ts.
 *
 * On 17 October 2026 run OHCMvD1hiejQ sealed after its message GfqtvWircNz4 to its starter, and the office held its check
 * (notice f-ta3gQKsR_a, problem Rg6Wt8oUDYDi). The message began "END of round C of tier 2, wave 13p. I seal next." and
 * ended "I seal next.". The office read a stop from "That run stopped at 15:31 on the login's weekly limit (429) with no
 * seal.", a sentence about the previous run, 9nfmuWDKpiGU, which this run continued. Those three sentences are quoted from
 * the problem record. This run could not read the message itself, so every other line here is made up and says so.
 */

export const THE_MESSAGE_ABOUT_THE_RUN_BEFORE = [
  'END of round C of tier 2, wave 13p. I seal next.',
  '',
  'A made-up line: this round continues run 9nfmuWDKpiGU.',
  "That run stopped at 15:31 on the login's weekly limit (429) with no seal.",
  'A made-up line: the report is filed and linked to my run.',
  '',
  'I seal next.',
].join('\n')

export const THE_SENTENCE_ABOUT_THE_RUN_BEFORE = "That run stopped at 15:31 on the login's weekly limit (429) with no seal."
