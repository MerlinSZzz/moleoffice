// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * HOW THE OFFICE'S MERGE TOOL SAYS HOW IT ENDED, WRITTEN ONCE FOR BOTH SIDES.
 *
 * Sandbox v1, piece P9. The message worker starts `tools/the-merger.mjs` for a merge entry the office
 * wants merged (SPEC.md 5.3), in its own process group, with its output going to a file. The worker
 * then has to say how that run ended — on the entry, through POST /api/merge-queue/:id/tool-ended, and
 * on the run's own session record as `finished` or `crashed`.
 *
 * AN EXIT CODE CANNOT CARRY THAT. The run is started detached so that it outlives a restart of the
 * worker, and the API server restarts the worker on every merge — including the merges this tool
 * lands. A worker that picks a run up after a restart never held the child, so it can never read its
 * exit code. What survives is the output file. So the tool prints one line, last, beginning with the
 * prefix below, and the worker reads that line off disk whichever worker is watching.
 *
 * A RUN THAT PRINTED NO SUCH LINE DID NOT SAY IT ENDED WELL, and it is recorded as a run that ended
 * without saying how — never as one that succeeded (the first invariant: no fake success). A tool
 * killed by a signal, or one that threw before it could print, lands there.
 *
 * WHY JAVASCRIPT. The merge tool is a plain `.mjs` file started with `node`, and the worker is
 * TypeScript. One rule read by both is `src/config/usage.mjs`'s argument, and the reason this file
 * sits beside it: two copies of the line's shape would be the ninth invariant's drift.
 */

/** The merge tool, relative to the checkout the worker runs it in. SPEC.md 5.3. */
export const THE_MERGE_TOOL = 'tools/the-merger.mjs'

/** The prefix of the one line the merge tool prints last, saying how it ended. */
export const MERGE_TOOL_ENDING_LINE = 'MOLE-OFFICE-MERGE-TOOL-ENDED '

/**
 * @typedef {object} MergeToolEnding
 * @property {boolean} ok  True when the tool did what the entry's state asked of it and stopped on
 *   purpose — including when what it did was report a conflict or a red test, which the server turns
 *   into a bounce. False when it could not do it: an error it caught, a step the server refused.
 * @property {string} says  One sentence a person reads, saying what it did or why it could not.
 */

/**
 * The line the merge tool prints last. The tool calls this; nothing else writes the line.
 * @param {MergeToolEnding} ending
 * @returns {string}
 */
export function theMergeToolEndingLine(ending) {
  return `${MERGE_TOOL_ENDING_LINE}${JSON.stringify({ ok: ending.ok, says: ending.says })}`
}

/**
 * WHAT THE MERGE TOOL SAYS WHEN IT FINISHED, the one statement of the words, read by the tool and by its tests, so a test
 * holds the sentence the tool really writes and not a copy of it (check 5PDAmYI1pxq_).
 * @param {string} said what the run did, as the tool words it
 * @returns {string}
 */
export function theMergeToolFinished(said) {
  return `The merge tool finished: ${said}`.trim()
}

/**
 * What the merge tool says of an entry it found in a state it has nothing more to do for, such as merged.
 * @param {string} state the entry's state
 * @returns {string}
 */
export function theEntryNeedsNothingMore(state) {
  return `the entry is ${state}; nothing more for this tool to do.`
}

/**
 * How the merge tool said it ended, read off what it printed, or null because it said nothing.
 *
 * The LAST such line counts, because a tool that retried a step may have printed an earlier one. A line
 * that carries the prefix and is not the shape above is read as not said, rather than guessed at.
 * @param {string} printed
 * @returns {MergeToolEnding | null}
 */
export function readTheMergeToolEnding(printed) {
  const lines = printed.split('\n')
  for (let at = lines.length - 1; at >= 0; at--) {
    const line = lines[at] ?? ''
    if (!line.startsWith(MERGE_TOOL_ENDING_LINE)) continue
    try {
      /** @type {unknown} */
      const parsed = JSON.parse(line.slice(MERGE_TOOL_ENDING_LINE.length))
      if (typeof parsed !== 'object' || parsed === null) return null
      const said = /** @type {Record<string, unknown>} */ (parsed)
      if (typeof said['ok'] !== 'boolean' || typeof said['says'] !== 'string' || said['says'].trim() === '') return null
      return { ok: said['ok'], says: said['says'].trim() }
    } catch {
      // A torn last line — the tool killed mid-write — is not an ending it said.
      return null
    }
  }
  return null
}
