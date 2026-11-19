// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A REGULAR EXPRESSION INSIDE A TEMPLATE PLACEHOLDER OPENS NO STRING (wave 13u round 193): tests/the-pieces-of-a-source.ts.
 *
 * The scanner read `${name.replace(/"/g, '""')}` as code holding a string that opened at the quote inside the regular
 * expression. That string ran on past the end of the template, so the comments and strings after it were lost. The
 * owner-content gate and the refusal inventory read the scanner's pieces, and the inventory missed refusals because of it.
 *
 * A `/` after a TypeScript non-null mark, `size! / 2`, divides. The fix for the placeholder must not read it as the
 * start of a regular expression, at the top level or inside a placeholder.
 */

import { describe, expect, it } from 'vitest'
import { piecesOf } from './the-pieces-of-a-source.ts'

/** Each piece as its kind and the source text it covers. */
const seen = (text: string) => piecesOf(text).map((piece) => [piece.what, text.slice(piece.at, piece.end)])

describe('the pieces of a source around a `/`', () => {
  it('reads a regular expression with a quote inside a placeholder, and the template closes where it ends', () => {
    const text = "const quote = (name) => `\"${name.replace(/\"/g, '\"\"')}\"`\n// a note\nconst after = 'after'\n"
    expect(seen(text)).toEqual([
      ['string', "`\"${name.replace(/\"/g, '\"\"')}\"`"],
      ['comment', '// a note'],
      ['string', "'after'"],
    ])
  })

  it('reads a `/` after a non-null mark as division at the top level', () => {
    expect(seen("const half = size! / 2, after = 'after'\n")).toEqual([['string', "'after'"]])
  })

  it('reads a `/` after a non-null mark as division inside a placeholder', () => {
    expect(seen("const css = `${size! / 2}px`, after = 'after'\n")).toEqual([
      ['string', '`${size! / 2}px`'],
      ['string', "'after'"],
    ])
  })

  it('still reads a `/` after a name as division and a `/` after a negation as a regular expression', () => {
    expect(seen("const line = `${total / count} each`, after = 'after'\n")).toEqual([
      ['string', '`${total / count} each`'],
      ['string', "'after'"],
    ])
    expect(seen("const ok = !/'/.test(word), after = 'after'\n")).toEqual([['string', "'after'"]])
  })
})
