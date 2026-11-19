// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * LICENCE TEXTS ADDED BY HAND, for bundled packages that carry no licence file of their own (wave 13t,
 * round 19; the decisions in messages vetfQhlMD5H0 and HdH_r6mDqJ9u). scripts/third-party-notices.mjs
 * carries each one word for word, after the entry's `says`, which tells where it was copied from.
 *
 * Each is kept for one package at one version. When the version changes, the text is no longer used and
 * the package is named as carrying none, so tests/the-office-runs-from-a-bundle.test.ts fails until the
 * text is copied again for that version.
 *
 * Each folder under scripts/licence-texts-by-hand/ holds the files as they are where `says` names,
 * unchanged, except where `says` names the one change.
 */

import { fileURLToPath, URL } from 'node:url'

/** Where the folders are. */
export const THE_TEXTS_BY_HAND = fileURLToPath(new URL('./licence-texts-by-hand/', import.meta.url))

const XTERM =
  'The package carries no licence file of its own. The text below was added by hand, copied from https://github.com/xtermjs/xterm.js/blob/6.0.0/LICENSE (commit f447274f4): the one licence of the repository the package is built from, at the release it was published from.'

/**
 * By `<name>@<version>`: the folder its texts are in, and the sentence the notices carry before them.
 *
 * @type {ReadonlyMap<string, { folder: string, says: string }>}
 */
export const LICENCE_TEXTS_BY_HAND = new Map([
  // Neither package's own folder in the repository has a licence file at that tag.
  ['@xterm/headless@6.0.0', { folder: 'xterm.js-6.0.0', says: XTERM }],
  ['@xterm/addon-serialize@0.14.0', { folder: 'xterm.js-6.0.0', says: XTERM }],
  [
    'drizzle-orm@0.45.2',
    {
      folder: 'drizzle-orm-0.45.2',
      says: 'The package carries no licence file of its own. The text below was added by hand, copied from https://github.com/drizzle-team/drizzle-orm/blob/0.45.2/LICENSE (commit 273c78071). The repository has no NOTICE file at that tag, at its root or in drizzle-orm/.',
    },
  ],
  [
    'fastdom@1.0.12',
    {
      folder: 'fastdom-1.0.12',
      says: "The package carries no licence file of its own. The text below was added by hand, copied from the License section of the package's own README.md at version 1.0.12. Its repository has no tag or commit for version 1.0.12.",
    },
  ],
  [
    'abstract-logging@2.0.1',
    {
      folder: 'abstract-logging-2.0.1',
      says:
        "The package ships no licence text, and neither does its repository at tag v2.0.1 (commit 80dfaef91). Its Readme.md names the MIT licence and links to the author's MIT page; that section is below as Readme-License-section.md, word for word. MIT-from-SPDX.txt is the standard MIT licence text from the SPDX licence list (https://github.com/spdx/license-list-data/blob/v3.29.0/text/MIT.txt, commit 31ba1a50e), which that section names. It was not taken from the package. Its one change is the copyright line: the holder is the author field of the package's own package.json, and the year is left out because the package records none.",
    },
  ],
])
