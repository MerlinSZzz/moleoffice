// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * THE WORDS A PERSON READS FOR A WORLD, in one table two languages can read.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS FILE IS JAVASCRIPT AND NOT PART OF src/shared/words.ts
 * ---------------------------------------------------------------------------------------
 *
 * `src/shared/words.ts` is where every reading of a stored word in this product lives, and it stays
 * that: `worldKindWord` and `worldStandingWord` are there and they read this table. What is here is
 * the table alone, in JavaScript, for the same reason src/config/world-header.mjs is — two tools
 * have to print these words and neither can read TypeScript:
 *
 *   - `tools/listeners.mjs`, which asks a running Mole Office which worlds it knows;
 *   - `tools/stray-servers.mjs`, which reads the mirror because it asks no server at all.
 *
 * Both run on the node on this machine's PATH. A copy of the four words in either would be the
 * defect CLAUDE.md names at the top of the file: one fact worked out in two places, free to
 * disagree, with nothing failing when it does.
 */

/**
 * What to call each kind of world.
 *
 * `agent-made` READS AS "AN AGENT STARTED IT". The stored word is a compound nobody says out loud,
 * and the machine-word gate would otherwise be the only thing between it and a screen. The other
 * three are already the words a reader would use, and rule 2 of src/shared/words.ts keeps them.
 *
 * @type {Readonly<Record<string, string>>}
 */
export const WORLD_KIND_WORDS = {
  home: 'home',
  'agent-made': 'an agent started it',
  test: 'a test started it',
  remote: 'on another machine',
}

/**
 * What to call a world's standing.
 *
 * The two words the world header already carries, which is what the office stores. "Scratch" is this
 * project's own word for a stack that is not the one somebody works in, and the runtime page has
 * used it since criterion G2.
 *
 * @type {Readonly<Record<string, string>>}
 */
export const WORLD_STANDING_WORDS = {
  canonical: 'the one you work in',
  scratch: 'a scratch stack',
}

/**
 * The same two standings in Chinese.
 *
 * They are here and not only in src/shared/words/zh.ts because the standalone window says them too
 * (src/config/the-self-check-words.mjs), and its main process cannot read TypeScript. zh.ts reads
 * them from here, so the page and the window cannot disagree.
 *
 * @type {Readonly<Record<string, string>>}
 */
export const WORLD_STANDING_CHINESE = {
  canonical: '你工作的办公室',
  scratch: '临时世界',
}

/**
 * One kind of world in the words a person reads, for a caller that cannot ask src/shared/words.ts.
 *
 * A WORD NOBODY DECLARED IS SAID OUT LOUD, never printed as though it were English. That is the
 * same answer `worldKindWord` gives, in the same shape, so the terminal and the screen agree about
 * what an unknown word looks like.
 *
 * @param {unknown} kind
 * @returns {string}
 */
export function wordForAKindOfWorld(kind) {
  const said = typeof kind === 'string' ? kind.trim() : ''
  return WORLD_KIND_WORDS[said] ?? `unknown kind of world: ${said === '' ? 'nothing was stored' : said}`
}

/**
 * One standing in the words a person reads, for the same callers and the same reason.
 *
 * @param {unknown} standing
 * @returns {string}
 */
export function wordForAStanding(standing) {
  const said = typeof standing === 'string' ? standing.trim() : ''
  return WORLD_STANDING_WORDS[said] ?? `unknown standing: ${said === '' ? 'nothing was stored' : said}`
}
