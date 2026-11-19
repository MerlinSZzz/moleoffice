// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { describe, expect, it } from 'vitest'

import { theMessageInOrder, whyQuotePositionsAreInvalid } from '../src/shared/messages.ts'
import { enWave13y } from '../src/shared/words/en-wave-13y.ts'

const quotes = [{ value: 1 }, { value: 2 }]

describe('quote positions', () => {
  it('accepts equal offsets and UTF-16 boundaries', () => {
    expect(whyQuotePositionsAreInvalid('a😀b', quotes, [3, 3])).toBeNull()
    expect(whyQuotePositionsAreInvalid('a😀b', quotes, null)).toBeNull()
  })

  it.each([
    { name: 'empty positions', positions: [], body: 'abc', reason: enWave13y['server.quotePositions.count'] },
    { name: 'missing position', positions: [0], body: 'abc', reason: enWave13y['server.quotePositions.count'] },
    { name: 'past the body', positions: [0, 4], body: 'abc', reason: enWave13y['server.quotePositions.range'] },
    { name: 'descending positions', positions: [2, 1], body: 'abc', reason: enWave13y['server.quotePositions.order'] },
    { name: 'negative position', positions: [-1, 0], body: 'abc', reason: enWave13y['server.quotePositions.range'] },
    { name: 'fractional position', positions: [0, 1.5], body: 'abc', reason: enWave13y['server.quotePositions.range'] },
    { name: 'split character', positions: [0, 2], body: 'a😀b', reason: enWave13y['server.quotePositions.character'] },
  ])('reports $name and makes the reader throw that reason', ({ positions, body, reason }) => {
    expect(whyQuotePositionsAreInvalid(body, quotes, positions)).toBe(reason)
    expect(() => theMessageInOrder(body, quotes, positions)).toThrow(reason)
  })
})
