// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * NO TEST FILE'S NAME CALLS THE PERSON HE, OR NAMES THE OWNER OR AN AGENT OF THIS OFFICE.
 *
 * Plan eIeEzSGXdTpu, step 5: a test file's name is part of what a published copy shows, and 40 names said he,
 * his or him. Round 32 of wave 13j renamed them to say what each test proves. So no file under tests/ may have
 * a name holding one of these words, read whole between hyphens, dots and underscores:
 *   - the old pronouns, THE_PERSONS_OLD_PRONOUNS;
 *   - the owner's names, OWNER_NAMES;
 *   - the agents' handles, AGENT_HANDLES.
 * All three lists are in tests/neutral-names.ts, which the clean-version tool and the neutral-words gate read too.
 * The names and the handles come from the file of the owner's content. Where no such file was read those two lists
 * are empty, so the pronouns are checked on their own, and the cases that need the names are taken out and say why.
 *
 * WHAT IS ALLOWED, each file with its reason, is in ALLOWED. An allowance whose file is gone, or whose name no
 * longer holds a word, fails the last case, so the list cannot keep passing by naming nothing.
 *
 * MUTATIONS, each after a control run: one old name restored (a renamed file moved back) turns the third case
 * red, or the fourth for a name; an allowance whose file is renamed turns the last case red.
 */
import { readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { describe, expect, it } from 'vitest'

import { AGENT_HANDLES, OWNER_NAMES, THE_PERSONS_OLD_PRONOUNS } from './neutral-names.ts'
import { takenOutWithoutTheOwnersContent } from './the-owners-content-list.ts'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const TESTS = join(REPO, 'tests')

const THE_WORDS = new Set([...THE_PERSONS_OLD_PRONOUNS, ...OWNER_NAMES, ...AGENT_HANDLES].map((word) => word.toLowerCase()))
const THE_NAMES_AND_HANDLES = new Set([...OWNER_NAMES, ...AGENT_HANDLES].map((word) => word.toLowerCase()))

/** Files under tests/ whose names may still hold a word, each with the reason. */
const ALLOWED: readonly { file: string; why: string }[] = [
  {
    file: 'tests/his-list-honours-an-act-on-his-words.test.ts',
    why: "Wave 13s's worker w13s-r14-owner was changing it in 13s's round 14 when round 32 renamed the rest (the coordinator, message jtztUyaCrSJv). It is renamed once that round has landed.",
  },
]

/** Every file under tests/, as a path from the repository. */
function everyFileUnderTests(): string[] {
  return readdirSync(TESTS, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(REPO, join(entry.parentPath, entry.name)).split('\\').join('/'))
}

/** The words of the rule, or of `words`, that a file's own name holds. */
function theWordsIn(path: string, words: ReadonlySet<string> = THE_WORDS): string[] {
  const name = path.split('/').pop() ?? path
  return name.toLowerCase().split(/[^a-z0-9]+/).filter((part) => words.has(part))
}

/** Each file under tests/, but an allowance, whose name holds one of `words`, with the words it holds. */
function theFilesHolding(words: ReadonlySet<string>): string[] {
  return everyFileUnderTests()
    .filter((path) => !ALLOWED.some((one) => one.file === path))
    .map((path) => ({ path, words: theWordsIn(path, words) }))
    .filter((one) => one.words.length > 0)
    .map((one) => `${one.path}: ${one.words.join(', ')}`)
}

describe('no test file name carries a pronoun or a name', () => {

  it("reads the owner's names and the agents' handles from the shared lists", (context) => {
    if (takenOutWithoutTheOwnersContent(context)) return
    expect(OWNER_NAMES.length).toBeGreaterThan(0)
    expect(AGENT_HANDLES.length).toBeGreaterThan(0)
  })


  it("no file under tests/ has a name holding an owner's name or an agent's handle, except an allowance", (context) => {
    if (takenOutWithoutTheOwnersContent(context)) return
    expect(theFilesHolding(THE_NAMES_AND_HANDLES), 'rename the file to say what the test proves, and move every reference to it').toEqual([])
  })

})
