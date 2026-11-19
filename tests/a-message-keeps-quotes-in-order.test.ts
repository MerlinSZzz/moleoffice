// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { describe, expect, it } from 'vitest'

import { theMessageInOrder } from '../src/shared/messages.ts'

const first = { target: { kind: 'record' as const, recordId: 'first' } }
const second = { target: { kind: 'record' as const, recordId: 'second' } }
const words = (text: string) => ({ kind: 'words', text })
const quote = (value: typeof first) => ({ kind: 'quote', quote: value })

describe('theMessageInOrder', () => {
  it('places quotes at the start, middle and end', () => {
    expect(theMessageInOrder('abcd', [first, second, first], [0, 2, 4])).toEqual([
      quote(first), words('ab'), quote(second), words('cd'), quote(first),
    ])
  })

  it('keeps quotes at the same position in their original order', () => {
    expect(theMessageInOrder('ab', [first, second], [1, 1])).toEqual([
      words('a'), quote(first), quote(second), words('b'),
    ])
  })

  it('puts quotes before words when positions are null', () => {
    expect(theMessageInOrder('ab', [first, second], null)).toEqual([
      quote(first), quote(second), words('ab'),
    ])
  })

  it('handles an empty body', () => {
    expect(theMessageInOrder('', [first, second], [0, 0])).toEqual([quote(first), quote(second)])
    expect(theMessageInOrder('', [], null)).toEqual([])
  })

  it('counts a two-unit character as two UTF-16 units', () => {
    expect(theMessageInOrder('a😀b', [first], [3])).toEqual([words('a😀'), quote(first), words('b')])
  })
})
