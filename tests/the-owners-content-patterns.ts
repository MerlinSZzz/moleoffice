// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE OWNER-CONTENT GATE'S PATTERNS, MADE FROM THE FILE OF THE OWNER'S CONTENT.
 *
 * The merge queue's owner-content gate (tools/merge-tool/owner-content.mjs) reads no list of its own. Its caller gives
 * it these patterns. integrate.mjs gets them through theOwnerContentPatterns in tools/merge-tool/arguments.mjs, because
 * the merge tool may read the office settings only there and in office-keeper.mjs,
 * and the setting that names the file is an
 * office setting. The bundle scan (scripts/no-owner-content.mjs) and the tests that screen as the queue does import them
 * from here. The merge queue reads this module, so it is on the queue's own-code list and a change to it is tested
 * alone.
 *
 * No value is written here. The owner's names and the office's handles, every one the file gives, with those it marks
 * `merge gate only`, the owner's machine names and the port of the owner's own office come through the file's one
 * reader, tests/the-owners-content-list.ts; the real name through tests/the-owners-copyright-line.ts; the research words
 * through tests/the-names-the-gates-refuse.ts. Where no file was read, each part that needs the file is not looked for,
 * and the reader says why.
 *
 * Plain TypeScript with no syntax beyond types, so Node runs it as it is when the tool imports it.
 */

import { thePatterns } from '../tools/merge-tool/owner-content.mjs'
import { THE_OWNERS_RESEARCH_WORDS } from './the-names-the-gates-refuse.ts'
import { THE_OWNERS_CONTENT } from './the-owners-content-list.ts'
import { THE_REAL_NAME } from './the-owners-copyright-line.ts'

/** What the file of the owner's content gave, or null where no file was read. */
const THE_CONTENT = THE_OWNERS_CONTENT.content

/**
 * P7: the owner's research words from tests/the-names-the-gates-refuse.ts, the one list of them. A word this product
 * also says in a sense of its own is left out, because the gate would refuse it falsely.
 */
const THE_RESEARCH_PIECES = THE_OWNERS_RESEARCH_WORDS.filter((word) => word.theProductsOwnSense === undefined).map((word) => word.piece)

/** The patterns the merge queue's gate screens an entry with. */
export const THE_PATTERNS = thePatterns({
  names: THE_CONTENT?.names.map((one) => one.word) ?? [],
  realName: THE_REAL_NAME,
  handles: THE_CONTENT?.handles.map((one) => one.word) ?? [],
  machines: THE_CONTENT?.machines ?? [],
  ports: THE_CONTENT === null ? [] : [THE_CONTENT.port],
  researchWords: THE_RESEARCH_PIECES,
  ...(THE_OWNERS_CONTENT.notRead === null ? {} : { notReadBecause: THE_OWNERS_CONTENT.notRead }),
})
