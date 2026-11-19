// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { describe, expect, it } from 'vitest'
import { quotePositionsOf } from '../src/shared/messages.ts'

describe('quotePositionsOf', () => {
  it('returns the stored position list without changing it', () => {
    const positions = [0, 3, 3]
    expect(quotePositionsOf({ kind: 'message', data: { quotePositions: positions } })).toBe(positions)
  })

  it('returns null for an absent or non-list value', () => {
    expect(quotePositionsOf({ kind: 'message', data: {} })).toBeNull()
    expect(quotePositionsOf({ kind: 'message', data: { quotePositions: null } })).toBeNull()
    expect(quotePositionsOf({ kind: 'message', data: { quotePositions: '3' } })).toBeNull()
  })
})
