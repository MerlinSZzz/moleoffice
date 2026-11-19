// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * THE WORDS A RUN SAYS ITS WORK IS FINISHED WITH, AND HOW THEY ARE READ, declared once.
 *
 * A `.mjs` so that a JavaScript reader can import it as well as a TypeScript one, as src/config/still-going.mjs is for
 * the still-going states. src/shared/releasing.ts names both exports again for the office, src/shared/lifecycle.ts reads
 * both words into CLOSED_HOW, src/config/own-rows.mjs writes the close word in its three closes, and
 * tools/office-request.mjs asks aRunSaysItIsFinished whether a write may seal a run. Until this file the office tool
 * kept its own copy of the finish word, the close word and the rule, so a change to them here would have left a sealing
 * write with the ordinary wait and nothing failing.
 */

import { saysStillGoing } from './still-going.mjs'

/** The words a run uses for work that is over. Its own state, which is a claim and not the end. */
/** @type {readonly ['finished']} */
export const FINISHED_STATES = Object.freeze(/** @type {const} */ (['finished']))

/** The close a run writes on itself: the agent itself said this period of participation was over. */
/** @type {'agent-said'} */
export const THE_RUN_SAID_SO = 'agent-said'

/**
 * The close the office's sweep writes when a row's process or folder is gone: nobody said the work was finished.
 * src/config/own-rows.mjs writes it in its three closes, and runSubmitsWork in src/server/lib/sealed-tip.ts compares
 * with it.
 */
/** @type {'went-stale'} */
export const THE_SWEEPS_CLOSE = 'went-stale'

/**
 * HOW LONG A WRITE THAT MAY SEAL A RUN MAY TAKE, in milliseconds: five minutes. The seal reads and hashes every tracked
 * file in the run's worktree. On 9 November 2026 one such read took about 101 seconds on a 2.2 GB worktree of 8,836
 * files (REQUIREMENTS.md, the final FIRST item and its addendum), so a shorter wait gave up while the office finished
 * the seal. A larger tree or a busier office may take longer still, and a caller that gets no answer reads the run back.
 *
 * The launcher and the office tool read one number, kept here beside the other facts about a finished run.
 */
export const THE_LONGEST_FINISH_WAIT_MS = 300_000

/**
 * THE LAUNCHER'S WORDS WHEN A FINISH GOT NO ANSWER AND READING THE RUN BACK FOUND IT FINISHED. The office stored the
 * write and only its answer was late, so the launcher records the finish as done and says in finish.log how it knows.
 * Declared here so the launcher and the test that proves this read the same sentence.
 */
export const THE_FINISH_ANSWER_WAS_LATE = "the finish's answer was late, and reading the run back found it finished"

/**
 * WHETHER THIS RUN SAYS ITS WORK IS FINISHED.
 *
 * Two ways a run says it, and both are its own word: `state: finished`, and a close it wrote itself
 * (`closedHow: agent-said`). Neither is the end. A close somebody else wrote — the person, the
 * parent, a stale sweep — is not the subagent saying it is done, so it is not counted here.
 *
 * A CLOSE IS THE RUN'S FINISH ONLY WHILE ITS ROW SAYS THE RUN IS STILL GOING, or says nothing of its state. Problem
 * zv-Z5SMF_bst. On 24 October 2026 the line's secretary closed a run that had ended without finishing, with one write:
 * `state: crashed` and `closedHow: agent-said`. The close word was read as the finish, the run was sealed, and the
 * seal took its folder's HEAD, which held a later round's commit. A row that says the run crashed, paused or was left
 * orphaned says it did not finish, so its close word does not say otherwise. `state: finished` still says it.
 *
 * @param {Record<string, unknown>} data
 * @returns {boolean}
 */
export function aRunSaysItIsFinished(data) {
  const state = data['state']
  if (/** @type {readonly string[]} */ (FINISHED_STATES).includes(String(state ?? ''))) return true
  if (state != null && !saysStillGoing(state)) return false
  return data['closedHow'] === THE_RUN_SAID_SO
}
