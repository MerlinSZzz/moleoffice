// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE INVARIANTS THE RULES LIST, read from the user part of the rules, `src/config/rules/USER.md`.
 *
 * A refusal may rest on one of them, as `says.invariant` (decision OTB8vrTnnvhL, acceptance finding 69). The door
 * checks the number against this list rather than against a range typed in code: the rules are where the invariants
 * are written, and a list kept here would be a second copy free to drift from it (invariant 9). They are read from the
 * user part, which CLAUDE.md reads by reference, because an installed office carries the user part and not CLAUDE.md
 * .
 *
 * The list is the numbered items under the heading "## The invariants", each written "N. **Its name.** ...". It is read
 * on each call: the file is small, and a changed file is read as it is now.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { REPO_ROOT } from '../../config/settings.mjs'
import { USER_PART_SOURCE } from '../../worker/rules.ts'

/** One invariant, by the number and the name the rules give it. */
export interface AnInvariant {
  number: number
  /** Its name as the rules write it in bold, without the closing full stop. */
  name: string
}

/** What the rules list, or why nothing could be read from them. */
export type TheInvariants = { listed: AnInvariant[]; why: null } | { listed: null; why: string }

/** The invariants the user part of the rules at `root` lists. `root` is this checkout unless a caller names another. */
export function theInvariantsTheRulesList(root: string = REPO_ROOT): TheInvariants {
  const file = join(root, USER_PART_SOURCE)
  let text: string
  try {
    text = readFileSync(file, 'utf8')
  } catch (error) {
    return { listed: null, why: `${file} could not be read (${error instanceof Error ? error.message : String(error)})` }
  }
  const lines = text.split('\n')
  const start = lines.findIndex((line) => /^##\s+The invariants\s*$/u.test(line))
  if (start === -1) return { listed: null, why: `${file} has no heading "## The invariants"` }
  const listed: AnInvariant[] = []
  for (const line of lines.slice(start + 1)) {
    if (/^#{1,2}\s/u.test(line)) break
    const item = /^(\d+)\.\s+\*\*(.+?)\*\*/u.exec(line)
    if (item !== null) listed.push({ number: Number(item[1]), name: (item[2] ?? '').replace(/\.$/u, '') })
  }
  if (listed.length === 0) return { listed: null, why: `${file} lists no invariant under "## The invariants"` }
  return { listed, why: null }
}
