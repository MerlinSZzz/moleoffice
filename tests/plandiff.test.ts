// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHICH STORED LINE EACH LINE OF A SAVED DOCUMENT IS.
 *
 * A plan is written in one text box and stored as rows, because a row carries the record a line was
 * filed as. `matchLines` is what joins the two, and it matches on the exact characters and nothing
 * else. These tests are about two things:
 *
 *   1. THE ANSWER IS ONE-TO-ONE AND IN ORDER. Two lines of the new text can never claim the same
 *      stored row, and matched pairs never cross. A crossing match would move a binding backwards
 *      through a document.
 *   2. NOTHING IS MATCHED BY LOOKING SIMILAR. A line whose words changed is a removal and an
 *      addition. That is invariant 2: a binding moved onto a line nobody bound would be a different
 *      answer reported as the requested one.
 */

import { describe, expect, it } from 'vitest'
import { matchLines } from '../src/shared/plandiff.ts'

/** The property every answer has to have, checked on whatever is passed in. */
function isOneToOneAndInOrder(stored: readonly string[], now: readonly string[]): void {
  const answer = matchLines(stored, now)
  expect(answer).toHaveLength(now.length)
  const claimed = new Set<number>()
  let last = -1
  for (let at = 0; at < answer.length; at += 1) {
    const from = answer[at]
    if (from === null) continue
    expect(from, 'a match points at a stored line that exists').toBeLessThan(stored.length)
    expect(claimed.has(from!), 'a stored line is claimed twice').toBe(false)
    claimed.add(from!)
    expect(from!, 'the matches are in order').toBeGreaterThan(last)
    last = from!
    expect(stored[from!], 'a match is on the exact characters').toBe(now[at])
  }
}

describe('a line that did not change keeps its row', () => {
  it('matches every line of a document that did not change', () => {
    const doc = ['# Build the baseline', '', '- perception', '- planning']
    expect(matchLines(doc, doc)).toEqual([0, 1, 2, 3])
  })

  it('keeps every other line when one is inserted at the top', () => {
    const stored = ['- perception', '- planning', '- control']
    const now = ['# Build the baseline', '- perception', '- planning', '- control']
    expect(matchLines(stored, now)).toEqual([null, 0, 1, 2])
    isOneToOneAndInOrder(stored, now)
  })

  it('keeps every other line when one is inserted in the middle', () => {
    const stored = ['- perception', '- planning', '- control']
    const now = ['- perception', '- tune the gains', '- planning', '- control']
    expect(matchLines(stored, now)).toEqual([0, null, 1, 2])
  })

  it('keeps a line that only moved', () => {
    const stored = ['- perception', '- planning', '- control']
    const now = ['- planning', '- perception', '- control']
    const answer = matchLines(stored, now)
    // One of the two swapped lines keeps its row and the other is a new one, because they cannot
    // both keep theirs without the matches crossing.
    expect(answer[2]).toBe(2)
    isOneToOneAndInOrder(stored, now)
  })

  it('reports a removal as a stored line nothing points at', () => {
    const stored = ['- perception', '- planning', '- control']
    const now = ['- perception', '- control']
    expect(matchLines(stored, now)).toEqual([0, 2])
  })
})

describe('a line whose words changed is not matched to anything', () => {
  it('does not match a line that was edited, however small the edit', () => {
    expect(matchLines(['| baseline | 5d |'], ['| baseline | 6d |'])).toEqual([null])
    expect(matchLines(['tune the gains'], ['tune the gains '])).toEqual([null])
    expect(matchLines(['  perception'], ['    perception'])).toEqual([null])
  })

  it('does not match a line to the one that looks most like it', () => {
    const stored = ['recalibrate the gripper', 'reprint a mount']
    const now = ['recalibrate the gripper twice', 'reprint a mount']
    // The first line changed, so it is a removal and an addition. Only the untouched line matches.
    expect(matchLines(stored, now)).toEqual([null, 1])
  })

  it('matches nothing at all when every line changed', () => {
    expect(matchLines(['a', 'b'], ['c', 'd'])).toEqual([null, null])
  })
})

describe('repeated lines are matched from the top down', () => {
  it('keeps the first rows when blank lines are removed from the end', () => {
    expect(matchLines(['', '', '', ''], ['', ''])).toEqual([0, 1])
  })

  it('keeps the rows it had when a blank line is added', () => {
    expect(matchLines(['a', '', 'b'], ['a', '', '', 'b'])).toEqual([0, 1, null, 2])
  })
})

describe('the edges', () => {
  it('answers nothing for an empty document', () => {
    expect(matchLines(['a', 'b'], [])).toEqual([])
  })

  it('matches nothing when the plan was empty', () => {
    expect(matchLines([], ['a', 'b'])).toEqual([null, null])
  })

  it('holds its properties on a document rewritten around its middle', () => {
    const stored = ['# Plan', '', 'one', 'two', 'three', '', '| a | b |', '|---|---|', '| 1 | 2 |']
    const now = ['# Plan', '', 'one', 'TWO', 'two and a half', 'three', '', '| a | b |', '|---|---|', '| 1 | 2 |']
    isOneToOneAndInOrder(stored, now)
    const answer = matchLines(stored, now)
    expect(answer[0]).toBe(0)
    expect(answer[answer.length - 1]).toBe(stored.length - 1)
  })
})
