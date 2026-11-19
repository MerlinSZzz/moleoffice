// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A REGULAR EXPRESSION AFTER A KEYWORD OPENS NO STRING: tests/the-pieces-of-a-source.ts.
 *
 * The scanner told a regular expression from division by the last code character, and after `return` the
 * last character is a letter. In minified code `return/\p{Script=Han}/u.test(...)` the first `/` was read
 * as division and the closing `/` opened a regular expression, which swallowed the backtick after it.
 * From there the scanner read strings as code and code as strings.
 *
 * A `/` after `return`, `typeof`, `instanceof`, `in`, `new`, `delete`, `void`, `throw`, `case`, `do` or
 * `else` opens a regular expression, at the top level and inside a template placeholder. A name that
 * ends in one of those words divides, and so does a property name after `.` or `?.`.
 */

import { describe, expect, it } from 'vitest'
import { piecesOf } from './the-pieces-of-a-source.ts'

/** Each piece as its kind and the source text it covers. */
const seen = (text: string) => piecesOf(text).map((piece) => [piece.what, text.slice(piece.at, piece.end)])

describe('the pieces of a source around a `/` after a keyword', () => {
  it('reads a regular expression after return with no space and with one', () => {
    expect(seen('const ok = return/x"y/.test(a), after = \'after\'\n')).toEqual([['string', "'after'"]])
    expect(seen("const ok = return /'/.test(a)\nconst after = 'after'\n")).toEqual([['string', "'after'"]])
  })

  it.each([
    ['typeof', "const ok = typeof /x\"/.test(a), after = 'after'\n"],
    ['instanceof', "const ok = a instanceof /x\"/g.constructor, after = 'after'\n"],
    ['in', "const ok = k in /x\"/g, after = 'after'\n"],
    ['new', "const ok = new /x\"/g.constructor, after = 'after'\n"],
    ['delete', "const ok = delete /x\"/g.lastIndex, after = 'after'\n"],
    ['void', "const ok = void /x\"/g, after = 'after'\n"],
    ['throw', "if (a) throw /x\"/g\nconst after = 'after'\n"],
    ['case', "switch (a) { case /x\"/g: break }\nconst after = 'after'\n"],
    ['do', "do /x\"/.test(a); while (false)\nconst after = 'after'\n"],
    ['else', "if (a) b(); else /x\"/.test(a)\nconst after = 'after'\n"],
  ])('reads a regular expression after %s, and keeps the string after it', (keyword, text) => {
    expect(seen(text), keyword).toEqual([['string', "'after'"]])
  })

  it('keeps the minified line after return from swallowing a template and a string that holds a comment opener', () => {
    const text = 'function f(e, n, t) { return/\\p{Script=Han}/u.test(e(t))&&!(`n`in n) }\nconst after = "/**"\n'
    expect(seen(text)).toEqual([
      ['string', '`n`'],
      ['string', '"/**"'],
    ])
  })

  it('reads a regular expression after a keyword inside a template placeholder', () => {
    const text = 'const t = `${return/x"/.test(a)}`, after = \'after\'\n'
    expect(seen(text)).toEqual([
      ['string', '`${return/x"/.test(a)}`'],
      ['string', "'after'"],
    ])
  })

  it('reads a name that ends in a keyword as division', () => {
    for (const name of ['begin', 'undo', 'xreturn']) {
      expect(seen(`const half = ${name} / 2, after = 'after'\n`), name).toEqual([['string', "'after'"]])
    }
  })

  it('reads a property named for a keyword as division', () => {
    expect(seen("const half = x.return / 2, after = 'after'\n")).toEqual([['string', "'after'"]])
    expect(seen("const half = x?.case / 2, after = 'after'\n")).toEqual([['string', "'after'"]])
  })

  it('still reads division after a name, a number, a call and an index', () => {
    for (const before of ['total', '2', '(a + b)', 'list[0]']) {
      expect(seen(`const half = ${before} / 2, after = 'after'\n`), before).toEqual([['string', "'after'"]])
    }
  })

  it('leaves a contextual word out of the keywords, so a variable named of divides', () => {
    expect(seen("const half = of / 2, after = 'after'\n")).toEqual([['string', "'after'"]])
  })
})
