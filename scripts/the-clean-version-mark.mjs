// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * WHETHER A CHECKOUT THAT CARRIES THE CLEAN VERSION'S MARK REALLY IS THE CLEAN VERSION, worked out here once, for the
 * bundle's check (ownerContentIn in scripts/no-owner-content.mjs) and for step 0 of every package script
 * (runTheOwnerContentStep in scripts/the-owner-content-verdict.mjs).
 *
 * scripts/clean-version.mjs writes the mark into the clean version and nowhere else, and isTheCleanVersion in
 * tests/the-copyright-line.ts is the mark's one reader. The clean version holds no design/ folder, and no list of the
 * owner's content is read where it is packed. A checkout that carries the mark and also either of those is not the
 * clean version, so nothing is packed from it, and the sentence here says why.
 *
 * Plain Node strips the types of a TypeScript file it imports, so this file imports the mark's reader and the list's
 * one reader, tests/the-owners-content-list.ts, as they are; scripts/no-owner-content.mjs loaded both already, through
 * the files it imports. Importing this file reads LICENSE (tests/the-copyright-line.ts throws without its line) and the
 * owner's list where the setting names one, so every package script now does both at its start.
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { isTheCleanVersion, THE_CLEAN_VERSION_MARK } from '../tests/the-copyright-line.ts'
import { THE_OWNERS_CONTENT, THE_OWNERS_CONTENT_SETTING } from '../tests/the-owners-content-list.ts'

export { isTheCleanVersion, THE_CLEAN_VERSION_MARK }

/**
 * Null when the checkout at `root` carries no mark, or carries it and is the clean version. Otherwise one sentence: the
 * checkout carries the mark and also a design/ folder or a readable list of the owner's content, so it is not the
 * clean version, and nothing is packed.
 * @param {string} root the checkout
 * @param {{ content: unknown }} [ownersContent] what was read of the owner's list; this process's reading when not given
 * @returns {string | null}
 */
export function whyThisIsNotTheCleanVersion(root, ownersContent = THE_OWNERS_CONTENT) {
  if (!isTheCleanVersion(root)) return null
  /** @type {string[]} */
  const also = []
  if (existsSync(join(root, 'design'))) also.push('a design/ folder')
  if (ownersContent.content !== null) also.push(`a readable list of the owner's content, the file ${THE_OWNERS_CONTENT_SETTING} names`)
  if (also.length === 0) return null
  return `The checkout ${root} carries the clean version's mark, ${THE_CLEAN_VERSION_MARK}, and also ${also.join(' and ')}, so it is not the clean version, and nothing is packed.`
}
