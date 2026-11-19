// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE TEST FILES THAT HAVE MOVED NAME NO REAL HOME. A MADE-UP PATH IS UNDER THE ONE FIXTURE ROOT.
 *
 * Plan eIeEzSGXdTpu, step 3, done one wave a round as step 2 was: test files wrote a real home path where
 * any path would do, and a copy of the repository published like that names a real person's home. So
 * in every moved file, listed in MOVED (tests/the-moved-test-files.ts) or in a wave's own list in
 * tests/moved/, no quoted string on a line of code may hold a
 * home path, /home/<name> or /Users/<name>: a made-up path is built from THE_TEST_FIXTURE_ROOT
 * (tests/a-page-of-a-test-office.ts), which is not under either. That root is written out in one place.
 *
 * WHAT IS NOT READ: comments, which the clean version's word table handles (step 4), and regular
 * expressions. WHAT IS ALLOWED, each string whole with its reason, is in ALLOWED: a test that is about a
 * home path keeps one. The clean version takes out an entry whose file it leaves out, and so may leave ALLOWED
 * empty; the case that counts an allowed string is then taken out and says why.
 *
 * MUTATIONS, each after a control run: a home path written back into one moved file's fixture; the
 * fixture root written out in a moved file instead of read; an allowance whose string is gone; a file
 * that names a home path, listed only in a wave's list in tests/moved/. Each turns a case red.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { describe, expect, it } from 'vitest'

import { THE_TEST_FIXTURE_ROOT } from './a-page-of-a-test-office.ts'
import { theMovedFiles, whatIsWrongWithTheLists } from './the-moved-test-files.ts'
import { piecesOf } from './sentences.ts'

const REPO = fileURLToPath(new URL('..', import.meta.url))

/** A home path: /home/<name> or /Users/<name>, not inside a longer word or path. */
const A_HOME_PATH = /(?<![A-Za-z0-9_.~-])(?:\/home|\/Users)\/[A-Za-z0-9._-]+/

/** The one file that writes the fixture root out. */
const WHERE_THE_ROOT_IS_WRITTEN = 'tests/a-page-of-a-test-office.ts'

/** Strings in moved files that may still hold a home path, each the whole string as it is written, with the reason. */
const ALLOWED: readonly { file: string; string: string; why: string }[] = [
]

/** Every quoted string on a line of code in one moved file that names a home path or writes the root out, as file:line text. */
function offendersIn(file: string): string[] {
  // A moved file that is not there is the last case's to name.
  if (!existsSync(join(REPO, file))) return []
  const text = readFileSync(join(REPO, file), 'utf8')
  return offendersInSource(file, text)
}

/** Read source strings; count lines through the supplied reader only when reporting a violation. */
function offendersInSource(file: string, text: string, lineAt = (at: number) => text.slice(0, at).split('\n').length): string[] {
  const found: string[] = []
  for (const piece of piecesOf(text)) {
    if (piece.what !== 'string') continue
    const namesAHome = A_HOME_PATH.test(piece.body) && !ALLOWED.some((one) => one.file === file && piece.body === one.string)
    const writesTheRoot = file !== WHERE_THE_ROOT_IS_WRITTEN && piece.body.includes(THE_TEST_FIXTURE_ROOT)
    if (!namesAHome && !writesTheRoot) continue
    const line = lineAt(piece.at)
    if (namesAHome) {
      found.push(`${file}:${String(line)} names a home path: ${piece.body.slice(0, 120)}`)
    }
    if (writesTheRoot) {
      found.push(`${file}:${String(line)} writes the fixture root out: ${piece.body.slice(0, 120)}`)
    }
  }
  return found
}

describe('the test files that have moved name no real home', () => {
  it('the fixture root is not under a home', () => {
    expect(A_HOME_PATH.test(THE_TEST_FIXTURE_ROOT)).toBe(false)
    expect(THE_TEST_FIXTURE_ROOT.startsWith('/')).toBe(true)
  })

  it('no moved file names a home path or writes the fixture root out in a string', () => {
    const found = theMovedFiles().flatMap(offendersIn)
    expect(found, 'build a made-up path from THE_TEST_FIXTURE_ROOT in tests/a-page-of-a-test-office.ts instead').toEqual([])
  })


  it('still reports the exact source line for each forbidden path', () => {
    const file = 'tests/path-fixture.ts'
    const home = '/home/someone/notes'
    const lines = [`// A comment before the strings.`, `const harmless = 'a harmless string'`, `const home = '${home}'`, '', `const root = '${THE_TEST_FIXTURE_ROOT}'`]
    const text = lines.join('\n')
    expect(offendersInSource(file, text)).toEqual([
      `${file}:${lines.indexOf(`const home = '${home}'`) + 1} names a home path: ${home}`,
      `${file}:${lines.indexOf(`const root = '${THE_TEST_FIXTURE_ROOT}'`) + 1} writes the fixture root out: ${THE_TEST_FIXTURE_ROOT}`,
    ])
  })


  it('every listed file is a file and is listed once', () => {
    expect(whatIsWrongWithTheLists()).toEqual([])
  })
})
