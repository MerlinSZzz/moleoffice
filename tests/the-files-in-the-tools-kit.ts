// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE FILES OF THE TOOLS KIT, and what they say, for the two tests that read them.
 *
 * tests/no-personal-default-in-the-tools-kit.test.ts reads them for a personal default, and
 * tests/no-file-in-the-tools-kit-names-the-owner.test.ts reads them for the owner's names. The second is a file of its
 * own because it starts nothing, so a host run can give it the owner's list without starting the kit's scripts.
 * Both read every line but the clean version's copyright header, which names the copyright holder by a decision and
 * which isTheCopyrightHeader in tests/the-owners-copyright-line.ts lets through. In this repository no line is let
 * through.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { isTheCleanVersion, isTheCopyrightHeader } from './the-owners-copyright-line.ts'

/** The folder the kit is in. */
export const KIT = fileURLToPath(new URL('../for-agents/', import.meta.url))

/** Whether this checkout is the clean version, where a file of the kit may start with the copyright header. */
const IN_THE_CLEAN_VERSION = isTheCleanVersion(fileURLToPath(new URL('..', import.meta.url)))

/**
 * Every file in the folder, by name. Folders such as Python's own cache are not the kit's words. Since wave
 * 13t's round 16 the kit is in for-agents/ beside the JavaScript an agent runs (the waiter's tool, the
 * registration tool and what they import), which an installed office ships built into one file each. Those
 * are read by the gates that read the code folders, as they were in tools/; this one reads the files that
 * ship as they are written.
 */
export function theFilesInTheKit(): string[] {
  return readdirSync(KIT).filter((name) => statSync(join(KIT, name)).isFile() && !name.endsWith('.mjs'))
}

/** Every line of every file in the kit that says one of `rules`, as file:line text, except the copyright header. */
export function whatTheKitSays(rules: readonly { pattern: RegExp; is: string }[]): string[] {
  const found: string[] = []
  for (const name of theFilesInTheKit()) {
    readFileSync(join(KIT, name), 'utf8')
      .split('\n')
      .forEach((line, at, lines) => {
        if (isTheCopyrightHeader(lines, at, IN_THE_CLEAN_VERSION)) return
        for (const one of rules) if (one.pattern.test(line)) found.push(`tools/kit/${name}:${String(at + 1)} names ${one.is}: ${line.trim()}`)
      })
  }
  return found
}
