// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * WHAT for-agents/session-hook.mjs SAYS WHEN IT IS RUN WITH NO PAYLOAD NAMING A SESSION, AND HOW A READER KNOWS IT SAID THAT.
 *
 * Problem WnVjoGd1bXx8: a run with no Claude Code payload is a run by hand, and the hook writes nothing and says what it
 * is. Problem RwLABKMM2OFw, found by the second check of run qTAAB0yMKX7h (29 September 2026): the start-cost measure
 * (tools/how-long-to-the-first-write.mjs) knew the hook had written nothing only by the words of its sentence, typed in
 * two files, so a change to the sentence would have made the measure read the short line as a new agent's first read,
 * with nothing failing. The line and its mark are declared here once, and the hook and the measure both read them.
 */

/** The words that mark the hook's line when it wrote nothing. The line below carries them, and a reader asks for them. */
export const THE_HOOK_WROTE_NOTHING = 'so it wrote nothing'

/**
 * The whole line the hook prints when it is run with no payload naming a session.
 * @returns {string}
 */
export function theLineOfTheHookRunByHand() {
  return (
    'MOLE OFFICE — this is for-agents/session-hook.mjs, the hook Claude Code runs at the start of a session, at the end of ' +
    'each turn and at its end, handing it a JSON payload on stdin that names the session. It was run with no such ' +
    `payload, ${THE_HOOK_WROTE_NOTHING}. Its tests are the tests/the-hook-*.test.ts files.`
  )
}

/**
 * Whether a line the hook printed is the line of a run by hand, which wrote nothing.
 * @param {unknown} line
 * @returns {boolean}
 */
export function theHookWroteNothing(line) {
  return typeof line === 'string' && line.includes(THE_HOOK_WROTE_NOTHING)
}
