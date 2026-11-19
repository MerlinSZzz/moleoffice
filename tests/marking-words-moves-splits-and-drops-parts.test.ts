// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * MARKING WORDS CUTS, MOVES AND DROPS PARTS THE ONE WAY THE BOX NEEDS (wave 14d, DB-2).
 *
 * The person selects words in the writing box and chooses a flag. A message carries either marked parts or one flag
 * on the whole, and one character is in at most one part, so a second mark over words already marked cuts the older
 * part back and splits it where the new run sits inside it. Typing moves a part wholly before or after the change and
 * drops a part the change touches, and every kept part is asked `whereTheChangeIs` afterwards, so a part whose words
 * are no longer at its place goes too.
 *
 * WHAT THIS FILE PROVES, without a browser:
 *   (a) a mark over plain words is the selected run, trimmed of the space at either end.
 *   (b) a mark inside an older part splits it in two, and both halves keep the older flag.
 *   (c) a mark over the middle of an older part cuts it back on both sides.
 *   (d) a selection of spaces marks nothing and answers null.
 *   (e) typing before a part moves it with its words; typing after it leaves it where it is.
 *   (f) a change that touches a part's words drops it, and a part that is not at its place afterwards is dropped too.
 *   (g) a dropped part says whether its words moved or went.
 *   (h) taking a mark off a run cuts the parts it overlaps and leaves the parts beside it.
 */

import { describe, expect, it } from 'vitest'

import { type AMarkedPart } from '../src/shared/intent-mark.ts'
import {
  markedPartsAfterATypedChange,
  markedPartsOverTheChosenWords,
  runsOfMarkedWords,
  unmarkedOverTheChosenWords,
} from '../src/web/lib/marking-the-words.ts'

const ASK = { intent: 'just-ask' as const }
const PLAN = { label: { text: 'Plan it', colour: 'amber' as const } }

/** A part of `body`, with the spaces the office refuses already taken off. */
function partOf(body: string, from: number, to: number, flag: { intent?: 'just-ask' | 'proposal-first'; label?: { text: string; colour: 'amber' } }): AMarkedPart {
  while (from < to && /\s/.test(body[from] ?? '')) from += 1
  while (to > from && /\s/.test(body[to - 1] ?? '')) to -= 1
  return { from, to, quote: body.slice(from, to), ...flag }
}

let minted = 0
function mint(): string {
  minted += 1
  return `new-${String(minted)}`
}

describe('marking words', () => {
  it('(a) marks the selected words, with their spaces trimmed', () => {
    const body = 'First  ask this. Then wait.'
    const got = markedPartsOverTheChosenWords(body, 0, 17, [], ASK, mint)
    expect(got).toEqual([{ from: 0, to: 16, quote: 'First  ask this.', intent: 'just-ask' }])
  })

  it('(b) splits an older part around a new one inside it, and both halves keep the older flag', () => {
    const body = 'one two three four'
    const older = partOf(body, 0, 18, PLAN)
    const got = markedPartsOverTheChosenWords(body, 8, 13, [older], ASK, mint)
    expect(got).toEqual([
      { from: 0, to: 7, quote: 'one two', ...PLAN },
      { from: 8, to: 13, quote: 'three', intent: 'just-ask' },
      { from: 14, to: 18, quote: 'four', ...PLAN },
    ])
    const runs = runsOfMarkedWords(body, got!)
    expect(runs.map((run) => run.quote)).toEqual(['one two', ' ', 'three', ' ', 'four'])
    expect(runs.filter((run) => run.part !== null).map((run) => run.part)).toEqual(got)
  })

  it('(c) cuts an older part back on both sides', () => {
    const body = 'one two three four'
    const older = partOf(body, 0, 18, PLAN)
    const got = markedPartsOverTheChosenWords(body, 4, 9, [older], ASK, mint)
    expect(got).toEqual([
      { from: 0, to: 3, quote: 'one', ...PLAN },
      { from: 4, to: 9, quote: 'two t', intent: 'just-ask' },
      { from: 9, to: 18, quote: 'hree four', ...PLAN },
    ])
  })

  it('(d) marks nothing for a selection of spaces', () => {
    expect(markedPartsOverTheChosenWords('one two', 3, 4, [], ASK, mint)).toBeNull()
  })

  it('(e) moves a part before the change and leaves a part after it', () => {
    const body = 'Keep this. Change that.'
    const first = partOf(body, 0, 10, ASK)
    const second = partOf(body, 11, 23, PLAN)
    const afterInsert = 'New words. ' + body
    const typedBefore = markedPartsAfterATypedChange(body, afterInsert, [first, second])
    expect(typedBefore.dropped).toEqual([])
    expect(typedBefore.kept).toEqual([
      { from: 11, to: 21, quote: 'Keep this.', ...ASK },
      { from: 22, to: 34, quote: 'Change that.', ...PLAN },
    ])
    const afterAppend = body + ' More.'
    const typedAfter = markedPartsAfterATypedChange(body, afterAppend, [first, second])
    expect(typedAfter.dropped).toEqual([])
    expect(typedAfter.kept).toEqual([first, second])
  })

  it('(f) drops a part the change touches, and a part whose words are no longer at its place', () => {
    const body = 'Keep this. Change that.'
    const first = partOf(body, 0, 10, ASK)
    const touched = markedPartsAfterATypedChange(body, 'Keep these. Change that.', [first])
    expect(touched.kept).toEqual([])
    expect(touched.dropped.map((one) => one.part)).toEqual([first])
    // A CHANGE AFTER THE PART, WHICH TAKES THE WORDS IT QUOTED OUT OF THE MESSAGE ALTOGETHER.
    const second = partOf(body, 11, 23, PLAN)
    const gone = markedPartsAfterATypedChange(body, 'Keep this. Change those.', [second])
    expect(gone.kept).toEqual([])
    expect(gone.dropped).toEqual([{ part: second, why: 'gone' }])
  })

  it('(g) says whether a dropped part\'s words moved or went', () => {
    const body = 'one two three'
    const older = partOf(body, 0, 7, ASK)
    const moved = markedPartsAfterATypedChange(body, 'three one two', [older])
    expect(moved.dropped).toEqual([{ part: older, why: 'moved' }])
  })

  it('(h) taking a mark off cuts the parts it overlaps and leaves the parts beside it', () => {
    const body = 'one two three four'
    const older = partOf(body, 0, 18, PLAN)
    const got = unmarkedOverTheChosenWords(body, 4, 9, [older])
    expect(got).toEqual([
      { from: 0, to: 3, quote: 'one', ...PLAN },
      { from: 9, to: 18, quote: 'hree four', ...PLAN },
    ])
  })
})
