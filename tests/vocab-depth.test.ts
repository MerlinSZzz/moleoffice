// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A DIRECTION RECORDS PROGRESS, ON ITS OWN LADDER, AND IT IS STILL NOT A STATE WORD.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS FILE EXISTS
 * ---------------------------------------------------------------------------------------
 *
 * Sixteen of seventeen directions landed in the group labelled *nobody wrote a state here*, beside
 * notes and messages, with the note "records of kind direction have no state field, so there is no
 * word to read". Literally true, and wrong about every one of them: a direction is the one kind
 * whose whole purpose sentence is about progress, and it records that progress in `depth`, which is
 * required and validated.
 *
 * WHAT IS SETTLED AND IS NOT REOPENED HERE. The six rungs were taken out of `STATE_MEANING` for a
 * measured reason — `measured` is level four of six for a direction and *the work is done* for a
 * claim, and that table is flat so one word cannot mean two things. This file asserts that they are
 * still out, in the first test, so that "the reading surface should learn the ladder" cannot be
 * implemented by putting them back.
 *
 * WHAT IS ADDED IS A READER IN THE DIRECTION'S OWN LANGUAGE, and one property that has to survive
 * every later edit: a direction at the bottom rung is not urgent. The existence of a line of
 * exploration nobody has started is not a job somebody is late on, and ranking it as one would put
 * every future idea this lab has written down in front of a person today.
 *
 * NO DATABASE. A pure read of two declaration files.
 */

import { describe, expect, it } from 'vitest'
import { DIRECTION_DEPTHS, DIRECTION_DEPTH_MEANINGS, depthReading, readDepth } from '../src/shared/types.ts'
import { progressOf } from '../src/shared/work.ts'

describe('the ladder stays out of the state table', () => {
  it('leaves a rung handed to progressOf as a question rather than an answer', () => {
    expect(progressOf('noticed')).toBe('unclassified')
    expect(progressOf('integrated')).toBe('unclassified')
  })
})

describe('reading how far a direction has been taken', () => {
  it('reads every rung the ladder declares', () => {
    for (const depth of DIRECTION_DEPTHS) {
      expect(readDepth({ depth })).toBe(depth)
    }
  })

  it('answers null for a word that is not a rung, rather than the nearest one', () => {
    expect(readDepth({ depth: 'skimmed' })).toBeNull()
    expect(readDepth({ depth: 4 })).toBeNull()
    expect(readDepth({})).toBeNull()
    expect(readDepth(null)).toBeNull()
  })

  it('says which rung of how many, so a reader can draw it', () => {
    expect(depthReading({ depth: 'noticed' }).rung).toBe(1)
    expect(depthReading({ depth: 'measured' }).rung).toBe(4)
    expect(depthReading({ depth: 'defended' }).rung).toBe(DIRECTION_DEPTHS.length)
    expect(depthReading({ depth: 'ran' }).rungs).toBe(6)
  })

  it('describes the rung in the direction\'s own words, not in state words', () => {
    const reading = depthReading({ depth: 'read' })
    expect(reading.note).toContain('read')
    expect(reading.note).toContain(DIRECTION_DEPTH_MEANINGS.read)
    expect(reading.note).toContain('ladder')
    // The sentence this replaces said the record had no state. It is not a state and the sentence
    // must not describe it as a missing one.
    expect(reading.note).not.toContain('no state')
  })

  it('reports a missing depth as the gap it is, without inventing a rung', () => {
    const reading = depthReading({ question: 'which tokeniser?' })
    expect(reading.depth).toBeNull()
    expect(reading.rung).toBeNull()
    expect(reading.note).toContain('no depth is recorded')
  })
})

describe('a direction low on the ladder is not urgent', () => {
  it('says the work did not stop short, at every rung, including the first', () => {
    // The existence of a future direction is not a task. A direction at `noticed` is exactly what
    // the kind is for — somebody saw that this exists and wrote it down — and reading it as work
    // that stopped short would fill the attention list with things nobody has started on purpose.
    for (const depth of DIRECTION_DEPTHS) {
      expect(depthReading({ depth }).stoppedShort, `a direction at "${depth}" is being reported as stopped short`).toBe(false)
    }
    expect(depthReading({}).stoppedShort).toBe(false)
  })

  it('hands back no Progress at all, so nothing can route a depth into the attention rule', () => {
    // The reading is deliberately not a `Progress`. There is no function that turns a rung into
    // one, which is what stops the ladder being folded back into the flat table by a caller that
    // wanted a single code path.
    const reading: Record<string, unknown> = { ...depthReading({ depth: 'ran' }) }
    expect(Object.keys(reading).sort()).toEqual(['depth', 'note', 'rung', 'rungs', 'stoppedShort'])
    expect(reading['progress']).toBeUndefined()
  })
})
