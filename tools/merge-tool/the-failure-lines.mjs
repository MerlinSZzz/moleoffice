// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * THE MERGE TOOL READS A RED RUN'S FAILURE LINES AND SENDS THEM WITH THE FILE (wave 13u round 180). A file that
 * changed its answer, and a file red on main, are filed as problems that name the red run's log, and a log is not kept
 * for ever. So before the tested and red-on-main steps the tool reads each such file's failure
 * blocks from the log the file was red in, cut to the bound in src/shared/the-failure-lines-of-a-red-run.ts, and the
 * office keeps them in the problem.
 *
 * WHICH LOG A FILE WAS RED IN: a file green alone was red in the run before its reruns, the suite or the related run, and
 * its item names the green rerun's log, so the red run's log is passed in. A file green in the pair was red in its own
 * rerun alone with the entry, whose log is that rerun's. A file red on main was red in its own run on main, whose log its
 * item names. A file whose red run names no log is sent as before, without lines.
 *
 * AN OFFICE OLDER THAN THE FIELD refuses the lines with the step door's words for a key it does not declare, on each item
 * that carries them. The tool knows that refusal by those words and the status 422, and by nothing looser
 * (theStepDoorDoesNotKnowTheNestedKey), sends the step again without the lines, and says so in its log. Any other
 * refusal still stops it. The problems such an office files say nothing of the lines, as they said before.
 *
 * This module runs no command. It reads the logs it is given and nothing else.
 */

import './a-library-is-not-a-program.mjs'
import { readFileSync } from 'node:fs'
import { HOW_MUCH_OF_A_RED_RUN_IS_KEPT, theFailureLinesOf } from '../../src/shared/the-failure-lines-of-a-red-run.ts'

/** @typedef {import('../../src/shared/the-failure-lines-of-a-red-run.ts').TheFailureLines} TheFailureLines */
/** @typedef {{ file: string, how: 'green-alone' | 'green-in-the-pair', commit: string, log?: string, failureLines?: TheFailureLines }} AChangedAnswer */

/**
 * THE FAILURE LINES OF `file` IN THE LOG AT `log`. A log that cannot be read is unread, with what reading it said.
 * @param {string} log
 * @param {string} file
 * @param {Map<string, string | Error>} [read] logs read already, so a log is read once for many files
 * @returns {TheFailureLines}
 */
export function theFailureLinesIn(log, file, read = new Map()) {
  if (!read.has(log)) {
    try {
      read.set(log, readFileSync(log, 'utf8'))
    } catch (error) {
      read.set(log, error instanceof Error ? error : new Error(String(error)))
    }
  }
  const text = read.get(log)
  if (text instanceof Error) return { log, found: 'unread', why: text.message.slice(0, HOW_MUCH_OF_A_RED_RUN_IS_KEPT.why) }
  return theFailureLinesOf(/** @type {string} */ (text), file, log)
}

/** @param {unknown} log @returns {log is string} */
const aLog = (log) => typeof log === 'string' && log !== ''

/**
 * EACH CHANGED ANSWER WITH THE FAILURE LINES OF THE RUN IT WAS RED IN. An item that carries its lines keeps them.
 * @param {AChangedAnswer[]} changed
 * @param {{ file: string, log?: string | null }[]} reruns the reruns alone, each with its log
 * @param {string | null | undefined} redRun the log of the run the green-alone files were red in
 * @returns {AChangedAnswer[]}
 */
export function withTheirFailureLines(changed, reruns, redRun) {
  /** @type {Map<string, string | Error>} */
  const read = new Map()
  return changed.map((one) => {
    if (one.failureLines !== undefined) return one
    const log = one.how === 'green-alone' ? redRun : reruns.find((rerun) => rerun.file === one.file)?.log
    return aLog(log) ? { ...one, failureLines: theFailureLinesIn(log, one.file, read) } : one
  })
}

/**
 * THE FILES RED ON MAIN AS THE STEP SENDS THEM: each with its log and the failure lines in it, or alone when it has no log.
 * @param {{ file: string, log?: string | null }[]} files
 * @returns {{ file: string, log?: string, failureLines?: TheFailureLines }[]}
 */
export function theRedOnMainFiles(files) {
  /** @type {Map<string, string | Error>} */
  const read = new Map()
  return files.map((one) => (aLog(one.log) ? { file: one.file, log: one.log, failureLines: theFailureLinesIn(one.log, one.file, read) } : { file: one.file }))
}

/** The list of a step's facts whose items may carry failure lines. */
const THE_LIST_OF = /** @type {Record<string, string>} */ ({ tested: 'changedTheirAnswer', 'red-on-main': 'files' })

/** @param {Record<string, unknown>} facts @param {string} step @returns {Record<string, unknown>[]} */
function theItems(facts, step) {
  const list = THE_LIST_OF[step]
  const items = list === undefined ? undefined : facts[list]
  return Array.isArray(items) ? items : []
}

/**
 * WHETHER THE STEP DOOR REFUSED `key` ON THE ITEMS OF THE STEP'S LIST THAT CARRY IT, AND NOTHING ELSE: the status 422 and
 * the door's sentence with one issue for each such item, in order (parseTheFacts in src/server/lib/merge-state-machine.ts).
 * @param {{ status: number, words: string }} refusal
 * @param {string} step
 * @param {Record<string, unknown>} facts the facts the step was sent with
 * @param {string} key
 */
export function theStepDoorDoesNotKnowTheNestedKey(refusal, step, facts, key) {
  const list = THE_LIST_OF[step]
  if (list === undefined) return false
  const issues = theItems(facts, step).flatMap((one, index) => (Object.hasOwn(one, key) ? [`${list}.${String(index)}: Unrecognized key: "${key}"`] : []))
  if (issues.length === 0) return false
  return refusal.status === 422 && refusal.words === `The facts of the step "${step}" cannot be read: ${issues.join('; ')}. Nothing was written.`
}

/**
 * THE STEP'S FACTS WITHOUT THE FAILURE LINES, and with nothing else changed.
 * @param {string} step
 * @param {Record<string, unknown>} facts
 */
export function withoutTheFailureLines(step, facts) {
  const list = THE_LIST_OF[step]
  if (list === undefined || !Array.isArray(facts[list])) return facts
  return { ...facts, [list]: theItems(facts, step).map(({ failureLines: _lines, ...one }) => one) }
}

/**
 * ONE SENTENCE FOR THE LOG WHEN AN OFFICE OLDER THAN THE FIELD REFUSED THE FAILURE LINES, and the step is sent again.
 * @param {string} office the office's address
 * @param {string} step
 * @param {string} words what the office answered
 */
export function theOfficeDidNotTakeTheFailureLines(office, step, words) {
  return (
    `The office at ${office} does not take failureLines on the ${step} step, so the step is sent again without them. ` +
    `It answered: ${words} The problems it files name each red run's log and keep none of its lines.`
  )
}
