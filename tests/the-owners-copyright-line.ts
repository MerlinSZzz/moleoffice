// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE OWNER'S REAL NAME, THE COPYRIGHT LINE, AND WHY THE LINE IS ALLOWED.
 *
 * By a decision, the copyright holder of Mole Office is the owner's real name, and the line reads exactly
 * COPYRIGHT_LINE. Everywhere else the name is refused, as the owner's other names are: the gates that read the
 * repository (tests/the-owners-project-is-not-in-the-source.test.ts) and what a fresh clone serves
 * (tests/a-fresh-clone-names-nobody.test.ts) import THE_REAL_NAME and the allowance from here, so the allowance is
 * written once.
 *
 * Neither the name nor the holder is written here. The holder is read from LICENSE, which carries the line, by
 * tests/the-copyright-line.ts. The parts of the real name that the gates refuse come from the file of the owner's
 * content, outside the repository, through its one reader, tests/the-owners-content-list.ts. Where no file was read,
 * THE_REAL_NAME_PARTS is empty, THE_REAL_NAME is null, and each gate says that it did not look for the real name.
 *
 * The allowance is the exact line, as a whole line, in the files named in COPYRIGHT_FILES. A line that only contains
 * it, the name on its own, or the line in any other file is refused. In the clean version only, a file may also carry
 * the clean version's line once as its header comment (isTheCopyrightHeader below).
 */

import { COPYRIGHT_FILES, COPYRIGHT_LINE, THE_CLEAN_VERSIONS_COPYRIGHT_LINE, THE_RIGHTS_HOLDER } from './the-copyright-line.ts'
import { THE_OWNERS_CONTENT } from './the-owners-content-list.ts'

/**
 * The holder, the copyright line in its two forms, the files that carry it, why it is allowed and the clean version's
 * mark, which tells the forms apart, live in tests/the-copyright-line.ts, which reads no file of the owner's content,
 * so the merge queue's owner-content gate can import them without reading the office settings. This module re-exports
 * them, so every import from here keeps working.
 */
export {
  COPYRIGHT_FILES,
  COPYRIGHT_LINE,
  isTheCleanVersion,
  THE_CLEAN_VERSION_MARK,
  THE_CLEAN_VERSIONS_COPYRIGHT_LINE,
  THE_RIGHTS_HOLDER,
  WHY_THE_COPYRIGHT_LINE_IS_ALLOWED,
} from './the-copyright-line.ts'

/**
 * This file's own path. It named what it refused until the names moved out of the repository, and the clean-version
 * tool still lets it name the owner. It names nobody now.
 */
export const THE_ALLOWANCES_OWN_FILE = 'tests/the-owners-copyright-line.ts'

/**
 * The parts of the owner's real name, from the file of the owner's content, or none where no file was read.
 * tests/the-names-the-gates-refuse.ts adds them to the names the gates and the clean-version tool refuse. These are the
 * owner's own name, which stays refused everywhere; they are not the rights holder, which is THE_RIGHTS_HOLDER in
 * tests/the-copyright-line.ts and may one day be a company's name.
 */
export const THE_REAL_NAME_PARTS: readonly string[] = THE_OWNERS_CONTENT.content?.realNameParts.map((part) => part.word) ?? []

/**
 * The owner's real name, in any part, in any case, or null where no file was read. A part the file marks `inside longer
 * words` is found inside a longer word too; any other part only as a whole word. The Chinese form of the name is not
 * recorded, so it is not here.
 */
export const THE_REAL_NAME: RegExp | null =
  THE_OWNERS_CONTENT.content === null
    ? null
    : new RegExp(THE_OWNERS_CONTENT.content.realNameParts.map((part) => (part.insideLongerWords ? part.word : `\\b${part.word}\\b`)).join('|'), 'i')

/** Whether one line of one file is the allowed copyright line. */
export function isTheCopyrightLine(file: string, line: string): boolean {
  return (COPYRIGHT_FILES as readonly string[]).includes(file) && line === COPYRIGHT_LINE
}

// ---------------------------------------------------------------------------------------------------------------
// THE CLEAN VERSION'S HEADERS. A decision puts the line in file headers too, and decision avgQ39lMcv-L
// has scripts/clean-version.mjs write them when it builds the clean version, not in this repository. So a tree that
// carries THE_CLEAN_VERSION_MARK (tests/the-copyright-line.ts) may hold THE_CLEAN_VERSIONS_COPYRIGHT_LINE once more
// in a file: as its header comment, at its head. A development tree carries no mark, so nothing changes there.
// ---------------------------------------------------------------------------------------------------------------

/** The comment forms a header line is written in: the text before the copyright line and after it. */
export const HEADER_COMMENTS = {
  slashes: ['// ', ''],
  hash: ['# ', ''],
  dashes: ['-- ', ''],
  block: ['/* ', ' */'],
  markup: ['<!-- ', ' -->'],
} as const

/**
 * The last line, counting from 0, a header may start on: after a shebang and one more line a file type needs first
 * (a Python encoding line, an XML declaration or an HTML doctype).
 */
const THE_LAST_LINE_A_HEADER_STARTS_ON = 2

/**
 * Whether line `index` of a file is its allowed copyright header: in the clean version only, the clean version's exact
 * line in one of HEADER_COMMENTS, at the head of the file, and the first line of the file that names the holder or the
 * owner.
 */
export function isTheCopyrightHeader(lines: readonly string[], index: number, inTheCleanVersion: boolean): boolean {
  if (!inTheCleanVersion) return false
  if (index > THE_LAST_LINE_A_HEADER_STARTS_ON) return false
  const line = lines[index]
  if (!Object.values(HEADER_COMMENTS).some(([before, after]) => line === `${before}${THE_CLEAN_VERSIONS_COPYRIGHT_LINE}${after}`)) return false
  return lines.slice(0, index).every((earlier) => !earlier.includes(THE_RIGHTS_HOLDER) && !(THE_REAL_NAME?.test(earlier) ?? false))
}
