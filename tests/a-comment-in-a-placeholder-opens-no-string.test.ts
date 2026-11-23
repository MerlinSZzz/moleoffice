// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A COMMENT INSIDE A TEMPLATE PLACEHOLDER OPENS NO STRING: tests/the-pieces-of-a-source.ts.
 *
 * The scanner read a `//` or `/*` comment inside a placeholder as code. An apostrophe in that comment then opened a
 * string that ran on to the next apostrophe in the file, which could be hundreds of lines later, and the comments and
 * strings on those lines were lost. The owner-content gate and the refusal inventory read the scanner's pieces.
 *
 * So inside a placeholder a comment is stepped over, and a ' or " quote ends at the end of its line, as it does at the
 * top level. A backtick there still runs over a newline to its match, because a template may span lines. A `//` inside
 * a string there is part of the string. The template is still one string piece, and the pieces of every case here are
 * in order and none overlaps the next.
 */

import { describe, expect, it } from 'vitest'
import { piecesOf } from './the-pieces-of-a-source.ts'

/** Each piece as its kind and the source text it covers. */
const seen = (text: string) => piecesOf(text).map((piece) => [piece.what, text.slice(piece.at, piece.end)])

/** What follows the template in every case here: a comment line and a string line. */
const AFTER = "\n// a note\nconst after = 'after'\n"

/** A source holding `template`, followed by AFTER. */
const aSourceWith = (template: string) => 'const a = t' + template + AFTER

/** The pieces of `aSourceWith(template)`: the whole template, the comment and the string. */
const theTemplateAndWhatFollows = (template: string) => [
  ['string', template],
  ['comment', '// a note'],
  ['string', "'after'"],
]

const A_LINE_COMMENT = "`x ${f(\n  // it's inside\n  1)} y`"
const A_BLOCK_COMMENT = "`x ${f(\n  /*\n   * it's inside, and so is this }\n   */\n  1)} y`"
const A_QUOTE_LEFT_OPEN = '`x ${f("open\n  1)} y`'
const A_TEMPLATE_OVER_TWO_LINES = "`x ${f(`inner\n  it's here`)} y`"
const A_COMMENT_MARK_IN_A_STRING = "`x ${f('one // two')} y`"
const EVERY_TEMPLATE = [A_LINE_COMMENT, A_BLOCK_COMMENT, A_QUOTE_LEFT_OPEN, A_TEMPLATE_OVER_TWO_LINES, A_COMMENT_MARK_IN_A_STRING]

describe('the pieces of a source around a comment in a placeholder', () => {
  it('steps over a line comment holding an apostrophe, and the template closes where it ends', () => {
    expect(seen(aSourceWith(A_LINE_COMMENT))).toEqual(theTemplateAndWhatFollows(A_LINE_COMMENT))
  })

  it('steps over a block comment holding an apostrophe and a brace, and the template closes where it ends', () => {
    expect(seen(aSourceWith(A_BLOCK_COMMENT))).toEqual(theTemplateAndWhatFollows(A_BLOCK_COMMENT))
  })

  it('ends a double quote left open in a placeholder at its line, so the template closes on the next', () => {
    expect(seen(aSourceWith(A_QUOTE_LEFT_OPEN))).toEqual(theTemplateAndWhatFollows(A_QUOTE_LEFT_OPEN))
  })

  it('still runs a backtick in a placeholder over a newline to its match', () => {
    expect(seen(aSourceWith(A_TEMPLATE_OVER_TWO_LINES))).toEqual(theTemplateAndWhatFollows(A_TEMPLATE_OVER_TWO_LINES))
  })

  it('reads a `//` inside a string in a placeholder as part of the string, not as a comment', () => {
    expect(seen(aSourceWith(A_COMMENT_MARK_IN_A_STRING))).toEqual(theTemplateAndWhatFollows(A_COMMENT_MARK_IN_A_STRING))
  })

  it('gives pieces in order, none overlapping the next, in every case here', () => {
    for (const template of EVERY_TEMPLATE) {
      const text = aSourceWith(template)
      const pieces = piecesOf(text)
      expect(pieces.length, `pieces were read from ${JSON.stringify(text)}`).toBeGreaterThan(0)
      for (const [at, piece] of pieces.entries()) {
        const which = `piece ${String(at)} of ${JSON.stringify(text)}`
        expect(piece.at, `${which} covers some text`).toBeLessThan(piece.end)
        const next = pieces[at + 1]
        if (next !== undefined) expect(piece.end, `${which} ends before the next begins`).toBeLessThanOrEqual(next.at)
      }
    }
  })
})
