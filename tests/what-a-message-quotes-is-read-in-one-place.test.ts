// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT A MESSAGE QUOTES IS READ IN ONE PLACE, `quotesOf` in src/shared/messages.ts.
 *
 * One message may carry any number of quotes, and a message
 * sent by pointing shows above its words a quote of what it points at.
 *
 * WHAT IS PROVED
 *   1. A message with today's single `target` reads as a list of one.
 *   2. A message with a `quotes` list reads as that list, in the order it was given.
 *   3. A message with neither reads as an empty list.
 *   4. An annotation's `context` is its one quote, as `targetOfRecord` reads it.
 *   5. A row holding both is read target first, then the list, so nothing stored is left out.
 *   6. An entry of the list that is not an object is left out, as a non-object `target` is.
 *   7. A message with only `quotes` is not a comment: `recordIsAComment` still reads `target` alone.
 *
 * WHAT WOULD MAKE EACH CASE GO RED
 *   read `target` no longer                 → cases 1, 4 and 5
 *   read `quotes` no longer, or reorder it   → cases 2 and 5
 *   answer null or undefined for neither    → case 3
 *   keep a non-object entry                 → case 6
 *   make `recordIsAComment` read quotes     → case 7
 *
 * Nothing here starts a server or opens a database: the reader reads its argument and nothing else.
 */

import { describe, expect, it } from 'vitest'

import { quotesOf, recordIsAComment } from '../src/shared/messages.ts'

const FIRST = {
  target: { kind: 'reportBlock', recordId: 'Fern0Report1', blockId: 'b-1' },
  span: { quote: 'the kiln ran hot', from: 4, to: 20, field: 'data.blocks[#b-1].text' },
}
const SECOND = { target: { kind: 'record', recordId: 'Fern0Record2', workspaceId: 'orchard' } }
const THIRD = { target: { kind: 'reportBlock', recordId: 'Fern0Report1', blockId: 'b-3' } }

describe('quotesOf', () => {
  it('reads a message with one target as a list of one', () => {
    expect(quotesOf({ kind: 'message', data: { body: 'see here', target: FIRST } })).toEqual([FIRST])
  })

  it('reads a message with a list of quotes as that list, in the order given', () => {
    const quotes = [THIRD, FIRST, SECOND]
    expect(quotesOf({ kind: 'message', data: { body: 'three things', quotes } })).toEqual([THIRD, FIRST, SECOND])
  })

  it('reads a message with neither as an empty list', () => {
    expect(quotesOf({ kind: 'message', data: { body: 'just words' } })).toEqual([])
    expect(quotesOf({ kind: 'message', data: { body: 'just words', target: null } })).toEqual([])
  })

  it("reads an annotation's context as its one quote", () => {
    expect(quotesOf({ kind: 'annotation', data: { body: 'old note', context: SECOND } })).toEqual([SECOND])
  })

  it('reads a row holding both with the target first, then the list', () => {
    expect(quotesOf({ kind: 'message', data: { body: 'both', target: FIRST, quotes: [SECOND, THIRD] } })).toEqual([
      FIRST,
      SECOND,
      THIRD,
    ])
  })

  it('leaves out an entry of the list that is not an object', () => {
    expect(quotesOf({ kind: 'message', data: { body: 'x', quotes: [SECOND, 'loose words', null, [THIRD]] } })).toEqual([
      SECOND,
    ])
  })

  it('does not make a message with only quotes into a comment', () => {
    expect(recordIsAComment({ kind: 'message', data: { body: 'x', quotes: [SECOND] } })).toBe(false)
    expect(recordIsAComment({ kind: 'message', data: { body: 'x', target: SECOND } })).toBe(true)
  })
})
