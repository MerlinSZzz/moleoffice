// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * NO PAGE CODE CALLS `crypto.randomUUID`.
 *
 * A browser gives `crypto.randomUUID` only to a secure context: a page served over https, or from the machine the
 * browser runs on. The person also opens the office from another machine over plain http, and a page there has no
 * `randomUUID`, so a call of it throws there. A quote's id was once made with it, and on that address no quote was
 * kept. Page code makes an id from `crypto.getRandomValues` instead, which every page has, as `aNewId` in
 * src/web/components/Chat.tsx does.
 *
 * A BROWSER TEST CANNOT SEE THIS. The browser tests open the page on 127.0.0.1. That is a secure context, so
 * `randomUUID` is there. So this test reads the source.
 *
 * WHAT IT READS. Every .ts and .tsx file under src/web, as `webFiles` in tests/sentences.ts lists them. In what is
 * left of a file once its comments are blanked, a call is `crypto.randomUUID(`. A `?.` may stand before the name or
 * before the bracket, and spaces may stand between.
 *
 * HOW IT TELLS A CALL FROM A COMMENT. Each file is split by the shared tokenizer, `piecesOf` in
 * tests/the-pieces-of-a-source.ts, and `withoutComments` in tests/sentences.ts blanks every comment before the search.
 * So a comment that names `crypto.randomUUID` is not a call. The comment above `aNewId` and the first line of
 * src/web/components/pixel-office/freshPixelSeed.ts are two such comments. Blanking keeps every newline, so a line
 * number found is the line in the file. Strings are not blanked. The tokenizer reads a whole template literal, its
 * `${…}` placeholders too, as one string, so blanking strings would hide a call inside a placeholder.
 *
 * WHAT IT DOES NOT SEE. A use of `randomUUID` not written as a call of `crypto.randomUUID`: the function passed on as
 * a value, `crypto['randomUUID']()`, or `const { randomUUID } = crypto`. None was in src/web when this was written. A
 * string holding the words `crypto.randomUUID(` counts as a call and fails loudly, and so does a comment inside a
 * `${…}` placeholder, which the tokenizer does not list as a comment. Neither was in src/web either.
 *
 * WHEN IT WAS WRITTEN, main's code called `crypto.randomUUID` at src/web/components/Chat.tsx line 5638, where the
 * flag menu gave the marking of chosen words an id maker. On that code this test fails, on that line.
 *
 * The short sources in the first cases are made up. The test starts nothing and writes nothing.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import { describe, expect, it } from 'vitest'

import { lineAt, piecesOf, webFiles, withoutComments } from './sentences.ts'

const WEB = fileURLToPath(new URL('../src/web', import.meta.url))

/** A call of `crypto.randomUUID`, with `?.` allowed before the name or before the bracket, and spaces between. */
const A_CALL = /\bcrypto\s*\??\.\s*randomUUID\s*(?:\?\.\s*)?\(/.source

/** The lines of `source`, counted from 1, where it calls `crypto.randomUUID` outside a comment. */
function callLines(source: string): number[] {
  const code = withoutComments(source, piecesOf(source))
  const calls = new RegExp(A_CALL, 'g')
  const lines: number[] = []
  for (let found = calls.exec(code); found !== null; found = calls.exec(code)) lines.push(lineAt(code, found.index))
  return lines
}

/** Every page file, as a path under src/web. */
const FILES = webFiles()

/** Every call in page code, as `src/web/<file>:<line>`. */
const CALLS = FILES.flatMap((file) =>
  callLines(readFileSync(join(WEB, file), 'utf8')).map((line) => `src/web/${file}:${String(line)}`),
)

describe('the search tells a call from a comment', () => {
  it('does not count a comment that names crypto.randomUUID', () => {
    // Made up, in the shape of the comment above aNewId and of the first line of freshPixelSeed.ts.
    const source = [
      '/**',
      ' * Random bytes rather than `crypto.randomUUID`, which a page on the plain address does not have.',
      ' */',
      '/** getRandomValues also works where crypto.randomUUID() is unavailable. */',
      '// const id = crypto.randomUUID()',
      'const id = 1',
    ].join('\n')
    expect(callLines(source)).toEqual([])
  })

  it('counts a call, and gives its line', () => {
    // Made up.
    const source = ['const before = 1', 'const id = crypto.randomUUID()', 'const after = 2'].join('\n')
    expect(callLines(source)).toEqual([2])
  })

  it('counts a call written with ?. or with spaces, or reached through window', () => {
    // Made up. The third call is split over two lines, and its line is the line where crypto stands.
    const source = ['const a = crypto?.randomUUID?.()', 'const b = window.crypto.randomUUID ()', 'const c = crypto', '  .randomUUID()'].join('\n')
    expect(callLines(source)).toEqual([1, 2, 3])
  })

  it('counts a call inside a template literal placeholder', () => {
    // Made up.
    const source = 'const key = `quote-${crypto.randomUUID()}`'
    expect(callLines(source)).toEqual([1])
  })

  it('reads a /* inside a string as part of the string, so it hides no call after it', () => {
    // Made up, after the accept list of a file input, which holds a /* in a string.
    const source = ['const accept = "image/*,video/*"', 'const id = crypto.randomUUID()'].join('\n')
    expect(callLines(source)).toEqual([2])
  })

  it('keeps the line number of a call after a comment of several lines', () => {
    // Made up.
    const source = ['/*', ' * three', ' * lines', ' */', 'crypto.randomUUID()'].join('\n')
    expect(callLines(source)).toEqual([5])
  })
})

describe('page code', () => {
  it('is read file by file, Chat.tsx among them', () => {
    expect(FILES.length).toBeGreaterThan(0)
    expect(FILES).toContain(join('components', 'Chat.tsx'))
  })

  it('calls crypto.randomUUID nowhere, because a page on the plain http address has none', () => {
    expect(
      CALLS,
      `A page on the office's plain http address has no crypto.randomUUID, so a call throws there. Make the id with crypto.getRandomValues, as aNewId in src/web/components/Chat.tsx does. Calls found: ${CALLS.join(', ')}`,
    ).toEqual([])
  })
})
