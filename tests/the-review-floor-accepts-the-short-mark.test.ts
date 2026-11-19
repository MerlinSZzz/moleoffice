// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE REVIEW TOOL'S FLOOR ACCEPTS THE SHORT MARK, AND STILL CATCHES A PAGE THAT DREW NOTHING.
 *
 * tools/review.mjs calls a page picture blank when its content area drew fewer than four words.
 * The design draws an ordinarily empty page as its heading and the short mark (plan 7FEOshq3mBGG,
 * block b-6, check 4), and the mark is a dash, which is not a word. Wave 13k's round 11 found the
 * floor calling the empty Shelved page blank that way. The floor lives in
 * tools/the-content-floor.mjs so it can be run here on made-up page contents.
 */
import { describe, expect, it } from 'vitest'
import { whyItDrewNothing } from '../tools/the-content-floor.mjs'

const floor = whyItDrewNothing

describe('the content floor of tools/review.mjs', () => {
  it('accepts an empty page drawn as a heading and the short mark', () => {
    // A heading of one word ("Shelved") and one dash: two text nodes, one word, one mark.
    expect(floor({ found: true, texts: 2, words: 1, marks: 1, boxes: 3, height: 60 })).toBeNull()
  })

  it('still calls a page with no content blank', () => {
    const said = floor({ found: true, texts: 0, words: 0, marks: 0, boxes: 0, height: 0 })
    expect(said).not.toBeNull()
    expect(said).toContain('empty page')
  })

  it('still calls a page with a heading and no mark blank when it has fewer than four words', () => {
    expect(floor({ found: true, texts: 2, words: 1, marks: 0, boxes: 2, height: 40 })).toContain('no short mark')
  })

  it('does not let a mark stand in for the text-node and height floors', () => {
    expect(floor({ found: true, texts: 1, words: 0, marks: 1, boxes: 1, height: 20 })).toContain('text nodes')
    expect(floor({ found: true, texts: 2, words: 1, marks: 1, boxes: 1, height: 4 })).toContain('drawn height')
  })
})
