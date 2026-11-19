// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * MOVING A LINE AND ITS NESTED LINES, PROVED ON PLAIN STRINGS.
 *
 * A plan is one text box, so the browser answers every key except this one: Alt and an arrow move
 * the line the caret is in together with every line indented under it. That is the only thing
 * Mole Office does to the characters, and everything about it is decided in src/shared/planwrite.ts,
 * which has no React, no DOM and no request in it.
 *
 * WHAT THESE TESTS ARE FOR. The answer is not a new document — it is "replace the characters from
 * here to here with this text", because the caller hands that to the browser's own insert command
 * so the move lands on the browser's undo history. So every test below applies the replacement to
 * the document itself and checks the characters that come out. A replacement that pointed at the
 * wrong range would produce a plausible-looking answer and corrupt the document, which is exactly
 * the failure that got the last build thrown away.
 */

import { describe, expect, it } from 'vitest'
import { leadingSpaces, moveSubtree, subtreeEnd } from '../src/shared/planwrite.ts'
import { linesOfBody } from '../src/shared/plandoc.ts'

/** Apply a move to the document it was worked out from, exactly as the browser would. */
function afterMove(body: string, caret: number, way: 'up' | 'down'): { body: string; caret: number } {
  const moved = moveSubtree(body, caret, way)
  if (!moved.moved) throw new Error(`the move was refused: ${moved.refused}`)
  return { body: body.slice(0, moved.from) + moved.text + body.slice(moved.to), caret: moved.caret }
}

/** Where the first character of a line is, counted from the top of the document. */
function startOfLine(body: string, at: number): number {
  const lines = linesOfBody(body)
  let offset = 0
  for (let index = 0; index < at; index += 1) offset += lines[index]!.length + 1
  return offset
}

describe('how far the nesting goes', () => {
  it('counts the leading spaces and nothing else', () => {
    expect(leadingSpaces('    tune the gains')).toBe(4)
    expect(leadingSpaces('tune the gains')).toBe(0)
    expect(leadingSpaces('')).toBe(0)
  })

  it('takes the lines indented under a line as its own', () => {
    const lines = ['- perception', '  - tune', '    - saturation', '- planning']
    expect(subtreeEnd(lines, 0)).toBe(3)
    expect(subtreeEnd(lines, 1)).toBe(3)
    expect(subtreeEnd(lines, 3)).toBe(4)
  })

  it('stops at a blank line, because a blank line starts with no spaces', () => {
    const lines = ['- perception', '  - tune', '', 'a paragraph after the gap']
    expect(subtreeEnd(lines, 0)).toBe(2)
  })
})

describe('a line moves with every line indented under it', () => {
  const OUTLINE = ['- perception', '  - tune the gains', '  - test saturation', '- planning', '- control'].join(
    '\n',
  )

  it('moves a bullet down past its sibling and carries its nested lines', () => {
    const { body } = afterMove(OUTLINE, startOfLine(OUTLINE, 0), 'down')
    expect(linesOfBody(body)).toEqual([
      '- planning',
      '- perception',
      '  - tune the gains',
      '  - test saturation',
      '- control',
    ])
  })

  it('moves a bullet up past its sibling and carries its nested lines', () => {
    const start = OUTLINE.indexOf('- planning')
    const { body } = afterMove(OUTLINE, start, 'up')
    expect(linesOfBody(body)).toEqual([
      '- planning',
      '- perception',
      '  - tune the gains',
      '  - test saturation',
      '- control',
    ])
  })

  it('moves a nested line only past its own siblings', () => {
    const start = OUTLINE.indexOf('  - tune the gains')
    const { body } = afterMove(OUTLINE, start, 'down')
    expect(linesOfBody(body)).toEqual([
      '- perception',
      '  - test saturation',
      '  - tune the gains',
      '- planning',
      '- control',
    ])
  })

  it('leaves the caret in the same place inside the line it moved', () => {
    const column = 4
    const { body, caret } = afterMove(OUTLINE, startOfLine(OUTLINE, 0) + column, 'down')
    expect(caret).toBe(startOfLine(body, 1) + column)
    expect(body.slice(caret - column, caret - column + 12)).toBe('- perception')
  })

  it('moves the same lines again when the key is pressed twice', () => {
    const first = afterMove(OUTLINE, startOfLine(OUTLINE, 0), 'down')
    const second = afterMove(first.body, first.caret, 'down')
    expect(linesOfBody(second.body)).toEqual([
      '- planning',
      '- control',
      '- perception',
      '  - tune the gains',
      '  - test saturation',
    ])
  })
})

describe('nothing is eaten, nothing is normalised', () => {
  it('keeps every character, only in another order', () => {
    const body = ['- b  ', '  - under b', '- a\t'].join('\n')
    const { body: after } = afterMove(body, 0, 'down')
    expect([...after].sort().join('')).toBe([...body].sort().join(''))
    expect(linesOfBody(after)).toEqual(['- a\t', '- b  ', '  - under b'])
  })

  it('does not touch the lines around the ones it moved', () => {
    const body = ['# Build the baseline', '', '- b', '- a', '', 'the last word'].join('\n')
    const { body: after } = afterMove(body, body.indexOf('- b'), 'down')
    expect(linesOfBody(after)).toEqual(['# Build the baseline', '', '- a', '- b', '', 'the last word'])
  })

  it('moves plain lines with no bullet marker, because indentation is what nesting is', () => {
    const body = ['perception', '  tune the gains', 'planning'].join('\n')
    const { body: after } = afterMove(body, 0, 'down')
    expect(linesOfBody(after)).toEqual(['planning', 'perception', '  tune the gains'])
  })
})

describe('a press with nowhere to go is refused with a sentence', () => {
  const OUTLINE = ['- perception', '  - tune', '- planning'].join('\n')

  it('says so when there is nothing above at the same indentation', () => {
    const moved = moveSubtree(OUTLINE, 0, 'up')
    expect(moved.moved).toBe(false)
    expect(moved.refused).toContain('nothing above this line at the same indentation')
  })

  it('says so when there is nothing below at the same indentation', () => {
    const moved = moveSubtree(OUTLINE, OUTLINE.indexOf('- planning'), 'down')
    expect(moved.moved).toBe(false)
    expect(moved.refused).toContain('nothing below this line at the same indentation')
  })

  it('says so for the only nested line under its parent', () => {
    const moved = moveSubtree(OUTLINE, OUTLINE.indexOf('  - tune'), 'down')
    expect(moved.moved).toBe(false)
    expect(moved.refused).toContain('nothing below')
  })

  it('refuses rather than doing nothing in an empty document', () => {
    expect(moveSubtree('', 0, 'up').moved).toBe(false)
    expect(moveSubtree('', 0, 'down').moved).toBe(false)
  })
})

describe('the range it asks the browser to replace', () => {
  /**
   * THE RANGE IS EXACTLY THE LINES THAT MOVED, and this is the test that says so. A range one
   * character wide in either direction would eat a newline and join two lines together, which is
   * the one way this could silently corrupt a document.
   */
  it('covers the moved lines and not the newline after them', () => {
    const body = ['- b', '- a', 'after'].join('\n')
    const moved = moveSubtree(body, 0, 'down')
    if (!moved.moved) throw new Error('the move was refused')
    expect(body.slice(moved.from, moved.to)).toBe('- b\n- a')
    expect(moved.text).toBe('- a\n- b')
  })

  it('leaves the document the same length', () => {
    const body = ['  - b', '  - a'].join('\n')
    const moved = moveSubtree(body, 2, 'down')
    if (!moved.moved) throw new Error('the move was refused')
    expect(moved.text.length).toBe(moved.to - moved.from)
  })
})
