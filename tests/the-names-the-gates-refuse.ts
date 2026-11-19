// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE NAMES AND THE WORDS THE GATES REFUSE, IN ONE PLACE.
 *
 * The owner-content gate's patterns (tests/the-owners-content-patterns.ts, for tools/merge-tool/owner-content.mjs) and
 * the neutral-words gate in tests/the-owners-project-is-not-in-the-source.test.ts read them. tests/neutral-names.ts
 * re-exports them, so every module that imports one from there keeps working. The merge queue reads this module, so it
 * is on the queue's own-code list and a change to it is tested alone.
 *
 * No value is written here. Each list comes from the file of the owner's content, outside the repository, through its
 * one reader, tests/the-owners-content-list.ts. Where no file was read, each list is empty and THE_OWNERS_CONTENT says
 * why. A gate builds no pattern from an empty list, because a pattern of no words matches every line; it says instead
 * which named patterns it did not check.
 */

import { THE_OWNERS_CONTENT } from './the-owners-content-list.ts'
import { THE_REAL_NAME_PARTS } from './the-owners-copyright-line.ts'

/** What the file of the owner's content gave, or null where no file was read. */
const THE_CONTENT = THE_OWNERS_CONTENT.content

/**
 * The owner's names that every gate refuses, then the two parts of the owner's real name. The names the file marks
 * `merge gate only` are not here; only the merge queue's gate refuses them, and it reads them from the file itself.
 * The real name's parts come from tests/the-owners-copyright-line.ts, with the name's allowance. The clean version's
 * copyright headers carry the name, and every check lets them through by that file's isTheCopyrightHeader.
 */
export const OWNER_NAMES: readonly string[] = [
  ...(THE_CONTENT?.names.filter((one) => !one.mergeGateOnly).map((one) => one.word) ?? []),
  ...THE_REAL_NAME_PARTS,
]

/**
 * The handles of the agents of the office this product was built in, and its lab's backup tool. The handles the file
 * marks `merge gate only` are not here, as with the names.
 */
export const AGENT_HANDLES: readonly string[] = THE_CONTENT?.handles.filter((one) => !one.mergeGateOnly).map((one) => one.word) ?? []

/**
 * THE WORDS OF THE OWNER'S OWN RESEARCH, in one list (wave 13v round 31). The merge queue's owner-content gate
 * (tools/merge-tool/owner-content.mjs, pattern P7, made by tests/the-owners-content-patterns.ts) and the skipped gate in
 * tests/the-owners-project-is-not-in-the-source.test.ts both read it. Before, each held a list of its own.
 *
 * Each `piece` goes into a regular expression for JavaScript and into one for `git grep -E`, so it uses no `(?:`.
 * Every piece is found as a whole word and without regard to case. A piece that starts and ends with `\w*` is also
 * found inside a longer word. A word with `theProductsOwnSense` is one this product also says in a sense of its own.
 * The gate does not refuse it, because it would fire falsely; the skipped gate lets its lines through one by one.
 *
 * Only the skipped gate reads `insideLongerWords`. It finds those words inside a longer word too, as it always found
 * its first twelve. The merge queue's gate finds whole words only, because a false refusal stops a landing.
 */
export const THE_OWNERS_RESEARCH_WORDS: readonly { readonly piece: string; readonly theProductsOwnSense?: string; readonly insideLongerWords?: true }[] =
  THE_CONTENT?.researchWords ?? []

/**
 * Two case-insensitive patterns, as text, that find any of `pieces` as a whole word: aResearchWordsPattern for RegExp,
 * and aResearchWordsPatternForGitGrep for `git grep -Ei`, whose extended expressions have no look-arounds. The
 * owner-content gate builds P7 with the first, and the gate may not import this module, so both are written there.
 */
export { aResearchWordsPattern, aResearchWordsPatternForGitGrep } from '../tools/merge-tool/owner-content.mjs'
