// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE NAMES NOTHING THAT SHIPS MAY SAY, IN ONE PLACE.
 *
 * The neutral-words gate (tests/the-owners-project-is-not-in-the-source.test.ts) and the tool that builds
 * the clean version (scripts/clean-version.mjs) both read these lists, so the two cannot drift apart
 * (invariant 9). The gate refuses them in the files it reads; the tool refuses them anywhere in the clean
 * tree except the copyright header.
 *
 * The owner's names, the agent handles, the owner's research words, aResearchWordsPattern and
 * aResearchWordsPatternForGitGrep live in tests/the-names-the-gates-refuse.ts. This module re-exports them, so every
 * import from here keeps working.
 * None of them, and not the owner's account below, is written in the repository: each comes from the file of the
 * owner's content through its one reader, tests/the-owners-content-list.ts, and is empty or null where no file was read.
 *
 * Plain TypeScript with no syntax beyond types, so Node runs it as it is when the tool imports it.
 */

import { THE_OWNERS_CONTENT } from './the-owners-content-list.ts'

export { AGENT_HANDLES, aResearchWordsPattern, aResearchWordsPatternForGitGrep, OWNER_NAMES, THE_OWNERS_RESEARCH_WORDS } from './the-names-the-gates-refuse.ts'

/**
 * The words that call the person a man. The product says "the person" or "they" (step 1 of plan eIeEzSGXdTpu,
 * block b-3); test file names follow it (step 5, tests/no-test-file-name-carries-a-pronoun-or-a-name.test.ts).
 */
export const THE_PERSONS_OLD_PRONOUNS: readonly string[] = ['he', 'his', 'him', 'himself']

/**
 * The account the clean version's one commit is authored as, with GitHub's
 * no-reply address for it, which ties the commit to the account without giving a private address. It is null where no
 * file of the owner's content was read, and then the clean-version tool must be given the name and the address to
 * commit as.
 */
export const THE_OWNERS_ACCOUNT: { readonly name: string; readonly email: string } | null = THE_OWNERS_CONTENT.content?.account ?? null

/** One case-insensitive pattern that finds any of `words` as a whole word. */
export function aWordPattern(words: readonly string[]): RegExp {
  return new RegExp(`\\b(?:${words.join('|')})\\b`, 'i')
}

