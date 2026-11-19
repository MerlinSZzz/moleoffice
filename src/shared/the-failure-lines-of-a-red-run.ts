// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RED RUN'S FAILURE LINES, KEPT WITH THE PROBLEM THAT NAMES THE RUN (wave 13u round 180).
 *
 * The merge tool files "a test changed its answer" and "red on main" with the red run's log named, and a log is not kept
 * for ever. So the tool reads the file's failure blocks from the log while it is there and sends them on the step, and
 * the office keeps them in the problem's extra and says in its symptom what it kept. The tool reads; the office checks
 * the shape against the same bound and words what it was sent.
 *
 * A block is what vitest's default reporter writes for a failure: a line " FAIL  <file> > <case>", or " FAIL  <file>
 * [ <file> ]" for a file that failed as a whole, then the error and its stack, up to the line of ⎯ that ends it. A
 * failure shared by several cases has several FAIL lines before one error, and they stay in the one block. Outside an
 * agent vitest writes its colour codes into a log file as well, so the merge queue's logs carry them. A log is read
 * without them, and the lines kept are plain. Its lines are counted as they stand in the log.
 *
 * Three answers, and no other:
 *   blocks  the file's blocks, each with the line of the log its FAIL line stands on, counted from 1, and whether the
 *           bound cut it; at most `blocks` of them, and the number of the file's blocks left out;
 *   none    the log was read and has no FAIL line for the file, with how many lines it had;
 *   unread  the log could not be read, with what reading it said. It is never taken for a log with no FAIL line.
 */

/**
 * THE BOUND (decision on round 180): at most 3 blocks of one file, each its FAIL line and at most 15 lines after it, and
 * each line at most 200 characters, its end replaced by … when it is longer. Fifteen lines hold an assertion's diff or an
 * error and the first frames of its stack; a fourth block of the same file rarely says anything the first three did not.
 * So one file keeps at most 3 × 16 × 200 = 9,600 characters of lines. What reading a log said is kept to 400 characters.
 */
export const HOW_MUCH_OF_A_RED_RUN_IS_KEPT = Object.freeze({ blocks: 3, linesAfter: 15, characters: 200, why: 400 })

export type AFailureBlock = { line: number; lines: string[]; cut: boolean }
export type TheFailureLines =
  | { log: string; found: 'blocks'; blocks: AFailureBlock[]; leftOut: number }
  | { log: string; found: 'none'; lines: number }
  | { log: string; found: 'unread'; why: string }

/** Vitest's colour codes, as tools/a-passed-test-file.mjs takes them out of a log. */
// eslint-disable-next-line no-control-regex
const COLOUR_CODES = /\x1b\[[0-9;]*[A-Za-z]/g

/** Whether a line of the log is a FAIL line of `file`, and of no longer name that starts with it. */
function isAFailLineOf(line: string, file: string): boolean {
  const start = line.trimStart()
  if (!start.startsWith('FAIL ')) return false
  const named = start.slice('FAIL '.length).trimStart()
  if (!named.startsWith(file)) return false
  const after = named.slice(file.length)
  return after.trim() === '' || after.startsWith(' > ') || after.startsWith(' [ ')
}

/** Whether a line is the rule of ⎯ that ends a block. */
const isARule = (line: string): boolean => line.trimStart().startsWith('⎯')

/** A line kept to the bound's characters. */
function kept(line: string): string {
  const { characters } = HOW_MUCH_OF_A_RED_RUN_IS_KEPT
  return line.length <= characters ? line : `${line.slice(0, characters - 1)}…`
}

/** THE FAILURE LINES OF `file` IN THE TEXT OF A LOG, named `log`. */
export function theFailureLinesOf(text: string, file: string, log: string): TheFailureLines {
  const { blocks: most, linesAfter } = HOW_MUCH_OF_A_RED_RUN_IS_KEPT
  const all = text.replace(COLOUR_CODES, '').split(/\r?\n/)
  if (all.at(-1) === '') all.pop()
  const found: AFailureBlock[] = []
  let leftOut = 0
  for (let index = 0; index < all.length; index++) {
    if (!isAFailLineOf(all[index]!, file)) continue
    let end = index + 1
    while (end < all.length && !isARule(all[end]!)) end++
    let last = end
    while (last > index + 1 && all[last - 1]!.trim() === '') last--
    const whole = all.slice(index, last)
    if (found.length === most) leftOut++
    else {
      const lines = whole.slice(0, 1 + linesAfter).map(kept)
      found.push({ line: index + 1, lines, cut: whole.length > lines.length || lines.some((line, at) => line !== whole[at]) })
    }
    index = end - 1
  }
  return found.length === 0 ? { log, found: 'none', lines: all.length } : { log, found: 'blocks', blocks: found, leftOut }
}
