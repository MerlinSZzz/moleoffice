// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE TEST OFFICE'S OWNER IS READ FROM ONE PLACE IN EVERY FILE THAT HAS MOVED TO IT.
 *
 * THE_TEST_OFFICES_OWNER (tests/a-page-of-a-test-office.ts) is the owner of every test office. Its
 * value was the real owner's id until line round 49, because test files that wrote that id out turned
 * red when it changed (the secretary's answer w5p-WkMOrE-b, round 29). So the files moved to the constant one
 * wave a round, and the files that have are listed in MOVED, in tests/the-moved-test-files.ts, and in
 * each wave's own list in tests/moved/ (round 33). In each of them, no quoted string on a line of code
 * may hold the owner's id or name, or an agent handle the constants hold: a test reads
 * THE_TEST_OFFICES_OWNER and THE_TEST_OFFICES_SECRETARY instead.
 *
 * THE OLD ID AND NAME ARE STILL LOOKED FOR (the secretary's answer 1mDqct4t2suB, round 49). The value is now
 * an invented person, so the constant's own patterns no longer find the real owner's name. A case of its
 * own does, with the owner's names from the file of the owner's content (tests/the-owners-content-list.ts),
 * so that a name written back into a moved file is still caught. No name is written here, so that case is
 * taken out, and says why, where no such file was read. THE AGENT HANDLES are looked for the same way, in a case of
 * their own with the handles from the same file, so the handle the secretary constant replaced is no longer
 * written here either. A handle found is not quoted back, so the case never puts one into a log.
 *
 * WHAT IS NOT READ: comments, which the clean version's word table handles (plan eIeEzSGXdTpu, step
 * 4); regular expressions; and a home path such as /home/<name>/..., which is step 3 of the same plan.
 * WHAT IS ALLOWED, each with its reason, is in ALLOWED: the one place the constants are written.
 *
 * MUTATIONS, each after a control run: the old id written back into one moved file's request headers;
 * a made-up handle written into one moved file's string, with a made-up list naming it set in this file's own
 * process; theHandles ignoring its list; an allowance whose line is gone; a file that writes the owner out,
 * listed only in a wave's list in tests/moved/. Each turns a case red.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { describe, expect, it } from 'vitest'

import { THE_TEST_OFFICES_OWNER, THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { piecesOf } from './sentences.ts'
import { theMovedFiles, whatIsWrongWithTheLists } from './the-moved-test-files.ts'
import { aWordPattern, OWNER_NAMES } from './neutral-names.ts'
import { takenOutWithoutTheOwnersContent } from './the-owners-content-list.ts'

const REPO = fileURLToPath(new URL('..', import.meta.url))


/** What a moved file may not write out in a quoted string. */
const WRITTEN_OUT: readonly { what: string; pattern: RegExp }[] = [
  { what: "the test office's owner's id", pattern: new RegExp(`\\b${THE_TEST_OFFICES_OWNER.id}\\b`) },
  { what: "the test office's owner's name", pattern: new RegExp(`\\b${THE_TEST_OFFICES_OWNER.name}\\b`) },
  { what: "the test office's secretary's handle", pattern: new RegExp(`\\b${THE_TEST_OFFICES_SECRETARY.handle}\\b`, 'i') },
]


/** A home path is step 3 of the plan, not this list's: /home/<name> or /Users/<name> is taken out first. */
const A_HOME_PATH = /(?:\/home|\/Users)\/[A-Za-z0-9._-]+/g

/** Strings in moved files that may still hold one of those, each the whole string as it is written, with the reason. */
const ALLOWED: readonly { file: string; string: string; why: string }[] = [
  { file: 'tests/the-test-offices-owner.ts', string: 'jory', why: "The one place the owner's id is written." },
  { file: 'tests/the-test-offices-owner.ts', string: 'Jory', why: "The one place the owner's name is written." },
  { file: 'tests/a-page-of-a-test-office.ts', string: 'ottilie', why: "The one place the secretary's handle is written." },
  { file: 'tests/a-page-of-a-test-office.ts', string: 'Ottilie', why: "The one place the secretary's name is written." },
]

/** Every quoted string on a line of code in one file that says one of `patterns`, as file:line text. */
function writtenOutIn(file: string, patterns: readonly { what: string; pattern: RegExp; unquoted?: true }[] = WRITTEN_OUT): string[] {
  // A moved file that is not there is the third case's to name, so this case reads what is there.
  if (!existsSync(join(REPO, file))) return []
  const text = readFileSync(join(REPO, file), 'utf8')
  const found: string[] = []
  for (const piece of piecesOf(text)) {
    if (piece.what !== 'string') continue
    const body = piece.body.replace(A_HOME_PATH, '')
    for (const { what, pattern, unquoted } of patterns) {
      if (!pattern.test(body)) continue
      if (ALLOWED.some((one) => one.file === file && piece.body === one.string)) continue
      const line = text.slice(0, piece.at).split('\n').length
      found.push(unquoted ? `${file}:${String(line)} writes out ${what}` : `${file}:${String(line)} writes out ${what}: ${piece.body.slice(0, 120)}`)
    }
  }
  return found
}

describe("the test office's owner is read from one place", () => {

  it("no moved file writes out one of the owner's names in a string", (context) => {
    if (takenOutWithoutTheOwnersContent(context)) return
    if (OWNER_NAMES.length === 0) throw new Error("The file of the owner's content was read, and it gave no names.")
    const names = [{ what: "one of the owner's names", pattern: aWordPattern(OWNER_NAMES) }]
    const found = theMovedFiles().flatMap((file) => writtenOutIn(file, names))
    expect(found, "a test names the test office's owner by THE_TEST_OFFICES_OWNER, and the owner of this repository not at all").toEqual([])
  })




  it('every listed file is a file and is listed once, so a rename cannot drop one from a list unseen', () => {
    expect(whatIsWrongWithTheLists()).toEqual([])
  })
})
