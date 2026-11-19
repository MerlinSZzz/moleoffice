// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE OWNER'S RESEARCH WORDS ARE ONE LIST (wave 13v round 31). The list is THE_OWNERS_RESEARCH_WORDS in
 * tests/neutral-names.ts. Two gates read it: the merge queue's owner-content gate (tools/merge-tool/owner-content.mjs,
 * pattern P7), and the skipped gate in tests/the-owners-project-is-not-in-the-source.test.ts. Before this round each held
 * a list of its own, so a word added to one was missing from the other with nothing failing. The merge gate takes its
 * patterns from its caller, and tests/the-owners-content-patterns.ts makes them from the list (wave 13z).
 *
 *   1. P7, as tests/the-owners-content-patterns.ts makes it, finds every word on the list, except a word this product
 *      also says in a sense of its own. aSampleOf below makes a text from each word's piece. A word it can make no text
 *      for fails and says why. A word whose text P7 does not find fails too. The edge is not why: P7's edge holds at
 *      the start and the end of a text, whatever character stands there, and the piece matches its text whole.
 *      A failure names a word by its place on the list and never prints the piece or the text: the host reports its
 *      failures onward, and the words are the owner's.
 *   2. aSampleOf, given made-up pieces of each shape it reads, makes a text each piece matches whole, and P7 made from
 *      those pieces alone finds each text. Two of the pieces start or end with a character outside a word, so this
 *      case checks P7's edge without the list. Given a negated class, a look-around, a back-reference, or a piece
 *      whose walk gives a text the piece does not match, it says why it made none. This case reads no list.
 *
 * The cases that read each gate's imports for the list were cut on 17 November 2026, as cases that catch no real fault.
 *
 * The words come from the file of the owner's content. Where no such file was read the list is empty, so case 1 would
 * pass by finding none. It is taken out then, and says why. Case 2 runs where no file was read.
 */

import { describe, expect, it } from 'vitest'
import { theHitsOn, thePatterns } from '../tools/merge-tool/owner-content.mjs'
import { THE_OWNERS_RESEARCH_WORDS } from './neutral-names.ts'
import { takenOutWithoutTheOwnersContent } from './the-owners-content-list.ts'
import { THE_PATTERNS } from './the-owners-content-patterns.ts'


/** A text made from a piece, or the reason none was made. */
type ASample = { readonly text: string } | { readonly cannot: string }

/** A shape of a piece the maker cannot read, named in its message. */
class AShapeTheMakerCannotRead extends Error {}

/**
 * ONE TEXT THE WHOLE PIECE MATCHES, or the reason the maker could not make one. The maker walks the piece. A plain
 * character stays. `\w`, `\d` and `\s` become `a`, `0` and a space. `\b` is a bound and not a character, so it becomes
 * nothing; `\W`, `\D` and `\S` are negated classes. Any other escaped character stands for itself, and `.` becomes `a`.
 * A class becomes its first member, which is the first character of a range. A group becomes its first alternative, and
 * a `|` outside any group takes the first alternative too. A part followed by `?`, `*` or `{0,…}` is left out; a part
 * followed by `+` or `{n…}` is written n times, at least once. A negated class, a look-around and a back-reference are
 * shapes the maker cannot read, and it says so. The text is kept only when the whole piece, read without regard to case
 * as P7 reads it, matches the whole text.
 */
function aSampleOf(piece: string): ASample {
  let at = 0
  /** The `|`-separated alternatives up to a `)` or the end, as the text of the first. */
  const alternatives = (): string => {
    const first = parts()
    while (piece[at] === '|') {
      at += 1
      parts()
    }
    return first
  }
  /** The parts up to a `|`, a `)` or the end, each written as many times as its quantifier says. */
  const parts = (): string => {
    let text = ''
    while (at < piece.length && piece[at] !== '|' && piece[at] !== ')') {
      const part = aPart()
      text += part.repeat(copies())
    }
    return text
  }
  const aPart = (): string => {
    const character = piece.charAt(at)
    if (character === '(') {
      at += 1
      if (/^\?<?[=!]/.test(piece.slice(at))) throw new AShapeTheMakerCannotRead('a look-around')
      const text = alternatives()
      at += 1
      return text
    }
    if (character === '[') {
      at += 1
      if (piece[at] === '^') throw new AShapeTheMakerCannotRead('a negated class')
      const first = piece[at] === '\\' ? anEscape() : piece.charAt(at++)
      while (at < piece.length && piece[at] !== ']') at += piece[at] === '\\' ? 2 : 1
      at += 1
      return first
    }
    if (character === '\\') return anEscape()
    at += 1
    return character === '.' ? 'a' : character
  }
  const anEscape = (): string => {
    const character = piece.charAt(at + 1)
    at += 2
    if (character === 'w') return 'a'
    if (character === 'd') return '0'
    if (character === 's') return ' '
    if (character === 'b') return ''
    if (character === 'W' || character === 'D' || character === 'S') throw new AShapeTheMakerCannotRead('a negated class')
    if (/[1-9]/.test(character)) throw new AShapeTheMakerCannotRead('a back-reference')
    return character
  }
  /** How many times the part before is written: none for `?`, `*` and `{0,…}`, n for `+` and `{n…}`, else once. */
  const copies = (): number => {
    if (piece[at] === '?' || piece[at] === '*') {
      at += 1
      return 0
    }
    if (piece[at] === '+') {
      at += 1
      return 1
    }
    const bound = /^\{(\d+)(?:,\d*)?\}/.exec(piece.slice(at))
    if (bound === null) return 1
    at += bound[0].length
    return Number(bound[1])
  }
  let text: string
  try {
    text = alternatives()
  } catch (error) {
    if (error instanceof AShapeTheMakerCannotRead) return { cannot: `it holds ${error.message}, a shape the sample maker cannot read` }
    throw error
  }
  return new RegExp(`^(?:${piece})$`, 'i').test(text) ? { text } : { cannot: 'the sample maker could not make a text the whole piece matches' }
}

/** What P7 of `patterns` finds in a line of code that says `text`. */
const whatP7Finds = (text: string, patterns: typeof THE_PATTERNS) =>
  theHitsOn('src/x.ts', `// the ${text} here`, { patterns }).filter((one) => one.pattern === 'P7')

/** Made-up pieces, of nonsense letters, one of each shape the maker reads and two with an edge outside a word, and the text it makes of each. */
const MADE_UP_PIECES = [
  { piece: 'zorb', text: 'zorb' },
  { piece: 'qu[ai]x', text: 'quax' },
  { piece: 'gr[e-u]nt', text: 'grent' },
  { piece: 'pl[\\w-]ff', text: 'plaff' },
  { piece: '(fl)?ump', text: 'ump' },
  { piece: '\\w*vrel\\w*', text: 'vrel' },
  { piece: 'blorp(s|z)', text: 'blorps' },
  { piece: 'tronx|vimble', text: 'tronx' },
  { piece: 'snee+k', text: 'sneek' },
  { piece: 'zyg{2,}', text: 'zygg' },
  { piece: 'kaz{0,2}oo', text: 'kaoo' },
  { piece: '(dr(a|o)p)+zil', text: 'drapzil' },
  { piece: 'plo\\d{2}x', text: 'plo00x' },
  { piece: 'mib\\sdle', text: 'mib dle' },
  { piece: 'fr\\.ob', text: 'fr.ob' },
  { piece: 'vl.mt', text: 'vlamt' },
  { piece: '\\bquonk', text: 'quonk' },
  // These two start or end with a character outside a word, so case 2 checks P7's edge here, without the list.
  { piece: '\\.plonk', text: '.plonk' },
  { piece: 'zib\\+\\+', text: 'zib++' },
] as const

/** Made-up pieces the maker makes no text of, and what its reason says. */
const PIECES_WITH_NO_TEXT = [
  { piece: '[^a]zorb', says: /a negated class/ },
  { piece: '\\Wzorb', says: /a negated class/ },
  { piece: 'zorb(?=x)', says: /a look-around/ },
  { piece: '(?<!q)zorb', says: /a look-around/ },
  { piece: '(zo)rb\\1', says: /a back-reference/ },
  { piece: 'zo\\Brb', says: /could not make a text the whole piece matches/ },
] as const


describe("the owner's research words are one list", () => {
  it('P7 of the owner-content gate finds every word on the list, except one this product says in a sense of its own', (context) => {
    if (takenOutWithoutTheOwnersContent(context)) return
    const wrong: string[] = []
    THE_OWNERS_RESEARCH_WORDS.forEach((word, index) => {
      const n = index + 1
      const made = aSampleOf(word.piece)
      if ('cannot' in made) {
        wrong.push(`research word ${String(n)}: ${made.cannot}`)
        return
      }
      const found = whatP7Finds(made.text, THE_PATTERNS)
      if (word.theProductsOwnSense !== undefined) {
        if (found.length > 0) wrong.push(`research word ${String(n)} is one this product says in a sense of its own, and P7 finds it`)
        return
      }
      if (found.length > 0) return
      wrong.push(`research word ${String(n)}: P7 finds nothing in the text made for it, though the word's piece matches that text whole, so the gate itself misses this word.`)
    })
    expect(wrong, wrong.join('\n')).toEqual([])
  })

  it('the sample maker makes a text each made-up piece matches whole, and says why it makes none for a shape it cannot read', () => {
    const patterns = thePatterns({ names: [], realName: null, handles: [], researchWords: MADE_UP_PIECES.map((one) => one.piece) })
    for (const { piece, text } of MADE_UP_PIECES) {
      expect(aSampleOf(piece), piece).toEqual({ text })
      expect(new RegExp(`^(?:${piece})$`, 'i').test(text), piece).toBe(true)
      expect(whatP7Finds(text, patterns).length, piece).toBeGreaterThan(0)
    }
    for (const { piece, says } of PIECES_WITH_NO_TEXT) expect(aSampleOf(piece), piece).toEqual({ cannot: expect.stringMatching(says) })
  })
})
