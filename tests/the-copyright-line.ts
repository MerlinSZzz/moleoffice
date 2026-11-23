// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE COPYRIGHT LINE, AND WHY THE LINE IS ALLOWED, WITHOUT THE OWNER'S CONTENT.
 *
 * A decision: the copyright holder of Mole Office is the owner's real name, and the line reads exactly
 * COPYRIGHT_LINE.
 * tests/the-owners-copyright-line.ts is the allowance's one place and re-exports everything here. This
 * module holds the part that needs no file of the owner's content, because the merge queue's owner-content gate
 * (tools/merge-tool/owner-content-allowed.mjs) imports it, and the merge tool may read the office settings only through
 * arguments.mjs and office-keeper.mjs.
 *
 * The holder is not written here. It is read from LICENSE, which carries the line.
 *
 * THE LINE HAS TWO FORMS. The development repository is closed source, so its line ends
 * "All rights reserved.". The clean version is under the MIT licence, whose grant those words would read against, so
 * its line is "Copyright © 2026" and the holder, as a decision words it, and nothing after.
 * Which form a tree carries is told by the clean version's mark, so the mark is written here too.
 */

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** The file scripts/clean-version.mjs writes into the clean version, and only there. Its presence is the mark. */
export const THE_CLEAN_VERSION_MARK = '.mole-office/clean-version.json'

/** Whether the tree at `root` is the clean version: it carries THE_CLEAN_VERSION_MARK. */
export function isTheCleanVersion(root: string): boolean {
  return existsSync(join(root, THE_CLEAN_VERSION_MARK))
}

/** Whether this checkout is the clean version. */
const THIS_IS_THE_CLEAN_VERSION = isTheCleanVersion(fileURLToPath(new URL('..', import.meta.url)))

/**
 * THE RIGHTS HOLDER, WRITTEN ONCE. A decision makes the owner, by name, the holder. Another
 * decision says the holder may become a company later; then LICENSE and NOTICE change, and nothing
 * here. The holder is read
 * from LICENSE's copyright line, so the name is written there and not here. A LICENSE without that line stops every
 * module that imports this one, because no allowed line could be known. The copyright line below and the clean
 * version's headers (scripts/clean-version.mjs) read the holder from here, and so did the check of LICENSE and NOTICE,
 * a test deleted on 13 November 2026.
 */
export const THE_RIGHTS_HOLDER = theHolderInTheLicence()

/**
 * The holder in LICENSE's copyright line, in the form this checkout must carry. It throws when LICENSE is not there or
 * carries no such line.
 */
function theHolderInTheLicence(): string {
  const licence = fileURLToPath(new URL('../LICENSE', import.meta.url))
  const text = existsSync(licence) ? readFileSync(licence, 'utf8') : null
  const holder = text === null ? undefined : theHolderIn(text, THIS_IS_THE_CLEAN_VERSION)
  if (holder === undefined) {
    const line = THIS_IS_THE_CLEAN_VERSION ? 'Copyright © 2026 <holder>" with nothing after the holder' : 'Copyright © 2026 <holder>. All rights reserved."'
    const what = text === null ? 'is not at the top of this checkout' : `carries no line "${line}`
    throw new Error(`LICENSE ${what}, so the copyright line the gates allow is not known. Put LICENSE and its line back.`)
  }
  return holder
}

/**
 * The holder in a licence's copyright line, in one form only: the clean version's where `inTheCleanVersion`, which
 * ends with the holder, and otherwise the development form, which ends "All rights reserved.". A line in the other
 * form gives no holder.
 */
export function theHolderIn(text: string, inTheCleanVersion: boolean): string | undefined {
  const form = inTheCleanVersion ? /^Copyright © 2026 (?!.*[Aa]ll [Rr]ights [Rr]eserved)(.+)$/m : /^Copyright © 2026 (.+)\. All rights reserved\.$/m
  return form.exec(text)?.[1]
}

/**
 * The clean version's copyright line, in its LICENSE, its NOTICE and every file header: "Copyright © 2026" and the
 * holder, as a decision has it, and nothing after.
 */
export const THE_CLEAN_VERSIONS_COPYRIGHT_LINE = `Copyright © 2026 ${THE_RIGHTS_HOLDER}`

/**
 * The copyright line, exactly as this checkout's LICENSE and NOTICE carry it. In development, a decision keeps
 * Mole Office closed source. So the line reserves every right. In the clean version it is
 * THE_CLEAN_VERSIONS_COPYRIGHT_LINE.
 */
export const COPYRIGHT_LINE = THIS_IS_THE_CLEAN_VERSION ? THE_CLEAN_VERSIONS_COPYRIGHT_LINE : `${THE_CLEAN_VERSIONS_COPYRIGHT_LINE}. All rights reserved.`

/** The files that carry the copyright line: the licence and the notice. */
export const COPYRIGHT_FILES = ['LICENSE', 'NOTICE'] as const

/** Why the line is allowed, as the gates print it. */
export const WHY_THE_COPYRIGHT_LINE_IS_ALLOWED =
  'The copyright holder is the owner by name, so LICENSE and NOTICE carry the exact line.'
