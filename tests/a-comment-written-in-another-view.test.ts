// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A COMMENT WRITTEN AT ONE VIEW, READ AT ANOTHER — AND THE THIRD ANSWER THAT IS NOT A LIE.
 *
 * ---------------------------------------------------------------------------------------
 * THE TWO FALSE ANSWERS THIS FILE EXISTS AGAINST
 * ---------------------------------------------------------------------------------------
 *
 * A report is not one drawing. The detail ladder decides which blocks are on the page, so a comment
 * written on the fourth paragraph of a section is about characters a reader at a shorter view never
 * sees. Mole Office has had two answers for that reader and both are false:
 *
 *   draw the mark anyway, on whichever ancestor is on screen  — says THIS COMMENT IS ABOUT THIS
 *                                                               about a thing it is not about
 *   draw nothing                                              — says THERE IS NO COMMENT HERE
 *                                                               about a comment that is there
 *
 * The third answer is *the place is real and it is not on your screen*, drawn as the same mark at
 * reduced strength with a second, non-colour channel, and offering the reader the view it was
 * written on. `howItDrawsHere` is what chooses between the four cases.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE DOES NOT CLAIM
 * ---------------------------------------------------------------------------------------
 *
 * That anything is painted. This is the DECISION, and it is deliberately a pure function over a
 * region tree and the set of ids a drawing put on the page: that is what lets the question be asked
 * about a view the reader is NOT at, which is what `View original` needs before it repaints
 * anything. The `reduced` flag and the `View original` control are not yet read by MarkLayer, and
 * saying so here is better than a test that photographs nothing.
 *
 * Every failing case below was proved by mutation, with a control run of this file first.
 */

import { beforeAll, describe, expect, it } from 'vitest'
import { flatten, recordRegionsOf, type Region, type RegionId } from '../src/shared/regions.ts'
import type { Context } from '../src/shared/targets.ts'
import type { SummaryBlock } from '../src/shared/types.ts'
import { englishWords } from '../src/shared/words/joined.ts'

let howItDrawsHere: typeof import('../src/web/components/agent/marks.ts')['howItDrawsHere']

beforeAll(async () => {
  // src/web/api.ts reads window.localStorage at module scope, so the smallest stand-in goes in
  // before anything is imported. Nothing here is under test.
  const store = new Map<string, string>()
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  }
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: storage,
    sessionStorage: storage,
    location: { hash: '', search: '' },
    addEventListener: () => {},
    removeEventListener: () => {},
  }
  howItDrawsHere = (await import('../src/web/components/agent/marks.ts')).howItDrawsHere
})

const RECORD = 'NHtlTgnKAG8h'

/** One block with three paragraphs, and a second block. */
const BLOCKS: SummaryBlock[] = [
  {
    id: 'b-1',
    type: 'text',
    text: 'The mast was knocked at the third pass.\n\nA second paragraph, further down.\n\nA third, further still.',
  } as SummaryBlock,
  { id: 'b-2', type: 'text', text: 'A second block entirely.' } as SummaryBlock,
]

/**
 * THE TREE THE PAGE ANNOUNCES, WHICH IS THE RECORD'S AND NOT THE REPORT BODY'S.
 *
 * `howItDrawsHere` is handed `theReportDrawnHere().root` by the mark layer, and until 1 September
 * 2026 that was `regionsOf` — the body, rooted at `data.blocks` — while the write door validated a
 * comment's part against `recordRegionsOf`, rooted at `data`. Two trees for one fact. This file
 * built the body's, so it agreed with the code about a page the browser has never drawn: the walk
 * up from a paragraph stopped at `data.blocks` here and in the product, and every part above it was
 * invisible to both. See `BlocksInRecord.wholeRecord` in src/web/components/SummaryBlocks.tsx.
 *
 * WHAT THIS FIXTURE STILL DOES NOT PUT, SAID RATHER THAN LEFT: `everything()` below is every region
 * of the tree, and a real page draws no element for a table row, a cell, or the body root. So the
 * fullest drawing here is fuller than any drawing a browser makes. The tests that matter build
 * smaller sets by hand; the sweep over a page drawn the way a page is really drawn is in
 * tests/a-landing-and-a-mark-agree-about-one-page.test.ts.
 */
const tree = (): Region =>
  recordRegionsOf({
    kind: 'report',
    relations: [],
    title: 'The mast was knocked at the third pass',
    summary: 'One line about the report.',
    data: { blocks: BLOCKS },
  })

/** The region whose text starts with these words. */
function regionStarting(with_: string): Region {
  const found = flatten(tree()).find((one) => one.text.startsWith(with_))
  expect(found, `no region starts with ${with_}`).toBeDefined()
  return found as Region
}

/** Every region id in the tree: the fullest drawing there is. */
function everything(): Set<RegionId> {
  return new Set(flatten(tree()).map((one) => one.id))
}

/** A comment on one region, quoting some words, optionally saying which view it was written on. */
function comment(regionId: RegionId, words: string, view?: Context['view']): Context {
  return {
    target: { kind: 'region', recordId: RECORD, regionId },
    place: { at: 'quote', words },
    ...(view === undefined ? {} : { view }),
  }
}

describe('the region is drawn and so is the place', () => {
  it('draws today\'s mark at full strength, and offers nothing to restore', () => {
    const second = regionStarting('A second paragraph')
    const how = howItDrawsHere(comment(second.id, 'A second paragraph', { detail: 'full' }), tree(), everything())
    expect(how.drawing).toBe('here')
    expect(how.reduced).toBe(false)
    expect(how.on).toBe(second.id)
    // NOTHING TO GO BACK TO. The place is on the screen; offering to restore a view would be
    // offering to fix something that is not broken.
    expect(how.restoreTo).toBeNull()
    // AND NO SENTENCE. A reduced mark earns two sentences on demand; a full-strength one says
    // nothing, because there is nothing about it a reader needs explaining.
    expect(how.says).toBe('')
  })
})

describe('the region is drawn and the place is not', () => {
  it('reduces the mark, names the view it was written on, and offers to restore it', () => {
    const second = regionStarting('A second paragraph')
    // The comment is filed against the second paragraph and quotes words from the FIRST. That is
    // the shape a cross-presentation comment has: the region survived the change of view and the
    // exact characters did not.
    const how = howItDrawsHere(comment(second.id, 'The mast was knocked', { detail: 'full' }), tree(), everything())
    expect(how.drawing).toBe('placeAway')
    // REDUCED STRENGTH, WHICH IS NEVER OPACITY ALONE — the layer reads this one flag and draws both
    // the reduction and the brackets glyph, because the contract forbids a state carried by colour
    // or weight by itself.
    expect(how.reduced).toBe(true)
    expect(how.on).toBe(second.id)
    expect(how.restoreTo).toEqual({ detail: 'full' })
    // THE VIEW IS NAMED BY THE LADDER'S OWN WORDS, not by a second spelling of the six names here.
    expect(how.says).toContain('Written on')
    expect(how.says).toContain('This place is not drawn here')
  })

  it('still reduces the mark when nobody recorded a view, and offers NOTHING to restore', () => {
    const second = regionStarting('A second paragraph')
    // Every context written before 25 August 2026 is this one: 7 of 7 live annotations, measured.
    const how = howItDrawsHere(comment(second.id, 'The mast was knocked'), tree(), everything())
    // The reduction is a fact about THIS drawing and needs nobody's evidence, so it still happens.
    expect(how.reduced).toBe(true)
    // But there is no original to go back to, and offering one would be Mole Office inventing a view
    // somebody read at. That is the fifth invariant: nobody looked is not nothing is there.
    expect(how.restoreTo).toBeNull()
    expect(how.says).toBe(englishWords()['agentWords.marks.noView' as never])
  })
})

describe('the region is not drawn and something holding it is', () => {
  it('puts the reduced mark on the nearest drawn ancestor, and never on a stranger', () => {
    const second = regionStarting('A second paragraph')
    // A shorter view: the block is drawn, its paragraphs are not.
    const shorter = new Set<RegionId>(['blocks', 'data.blocks[#b-1]', 'data.blocks[#b-2]'])
    const how = howItDrawsHere(comment(second.id, 'A second paragraph', { detail: 'gist' }), tree(), shorter)
    expect(how.drawing).toBe('heldBy')
    expect(how.reduced).toBe(true)
    // THE NEAREST THING HOLDING IT, which is the block — never the other block, and never the body
    // when the block itself is on the page.
    expect(how.on).toBe('data.blocks[#b-1]')
    expect(how.restoreTo).toEqual({ detail: 'gist' })
  })

  it('says the drawing does not draw it, when nothing on this page holds it at all', () => {
    const second = regionStarting('A second paragraph')
    // A drawing carrying the OTHER block and nothing above it. Neither the region nor anything
    // holding it is here.
    const elsewhere = new Set<RegionId>(['data.blocks[#b-2]'])
    const how = howItDrawsHere(comment(second.id, 'A second paragraph', { detail: 'full' }), tree(), elsewhere)
    // NOT `gone`, AND THE DIFFERENCE IS THE WHOLE POINT OF THE WORD. This part IS in this version of
    // the report; this drawing left it out. `gone` is kept for the part the report no longer has,
    // which the case below is, and a reader shown one word for both facts is shown a false one half
    // the time. Split on 30 August 2026, when the function got its first caller and the word started
    // reaching the page.
    expect(how.drawing).toBe('notDrawnHere')
    expect(how.says).toContain('not drawn here')
    expect(how.on).toBeNull()
    // Nothing is drawn on a stranger. A mark on `data.blocks[#b-2]` would be the exact lie this
    // whole function exists to stop.
    expect(how.on).not.toBe('data.blocks[#b-2]')
  })
})

describe('the region is not in this revision at all', () => {
  it('keeps the existing gone state and adds nothing to it', () => {
    const how = howItDrawsHere(comment('data.blocks[#b-nothing]', 'whatever', { detail: 'full' }), tree(), everything())
    expect(how.drawing).toBe('gone')
    expect(how.reduced).toBe(false)
    // NOTHING TO RESTORE. Going back to the writer's view would not bring back a part of the report
    // that is not in this version of it, and offering it would say that it would.
    expect(how.restoreTo).toBeNull()
    expect(how.says).toContain('not in this version')
  })
})

describe('a comment that does not point at a part of a report', () => {
  it('is unchanged, because those have only ever had one drawing', () => {
    const how = howItDrawsHere(
      { target: { kind: 'record', recordId: RECORD, workspaceId: 'panelx' }, place: { at: 'surface' } },
      tree(),
      everything(),
    )
    expect(how.drawing).toBe('here')
    expect(how.reduced).toBe(false)
    expect(how.says).toBe('')
  })
})
