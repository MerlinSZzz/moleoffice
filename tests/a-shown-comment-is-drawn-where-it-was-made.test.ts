// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A STORED COMMENT IS SHOWN IN THE PART OF THE PAGE IT WAS MADE IN, WHEN ITS RECORD IS DRAWN TWICE.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS IS ABOUT
 * ---------------------------------------------------------------------------------------
 *
 * A comment on a record can be made on somebody else's page. When it is, the browser records where:
 * `drawnIn` on the stored context, which is the region of that page the comment was met in — see
 * `theRegionThisWasDrawnIn` in src/web/components/agent/pointing.ts and `DrawnIn` in
 * src/shared/targets.ts. The composer has always drawn it: *Met under "What is still open around
 * this"*.
 *
 * THE MARK IGNORED IT. Pressing that comment in the review pane looked the record's key up and took
 * the first element on the page carrying it, and the foot of a record page draws one record up to
 * four times. So a comment made under *What is still open around this* was drawn on the sentence
 * under *relates to*, hundreds of pixels away, on a row with the same words. That is the second half
 * of the owner's rejection of 2 September 2026 — `design/pointing-reopened/ACCEPTANCE.md` §3.B2.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS ASSERTED, AND WHY IT IS THIS FUNCTION
 * ---------------------------------------------------------------------------------------
 *
 * `theOnesDrawnInsideFirst` in MarkLayer.tsx is the rule: given the elements drawing the thing, in
 * document order, and the element that IS the region the comment was made in, it puts the drawings
 * inside that region first. `holdersDrawnIn` beside it does the two lookups and hands the answers
 * here. The split is what lets the rule be checked at all: this repository has no DOM outside a
 * real browser, and the rule is the part that can be got wrong.
 *
 * Three cases, and the third is the one that keeps this honest: a page that does not draw the region
 * at all leaves the order exactly as it was, rather than showing nothing.
 *
 * WHAT MAKES IT RED, proved by mutation on 2 September 2026 against a control run first, with the
 * file's hash compared before and after to prove the restore:
 *
 *   ignore the region and hand the drawings back unchanged  → 2 of 3 red
 *   keep only the drawings inside the region                → 3 of 3 red
 *
 * Control: 3 of 3 green, before and after each.
 */

import { beforeAll, describe, expect, it } from 'vitest'

type MarkLayer = typeof import('../src/web/components/agent/MarkLayer.tsx')
let theOnesDrawnInsideFirst: MarkLayer['theOnesDrawnInsideFirst']

beforeAll(async () => {
  // MarkLayer reaches api.ts, which reads the chosen workspace out of the browser's own storage
  // while it is being evaluated. This is the smallest stand-in that lets it load; nothing here is
  // under test, and it is the same stub tests/record-page.test.ts uses for the same reason.
  const store = new Map<string, string>()
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
    location: { hash: '' },
    addEventListener: () => {},
    removeEventListener: () => {},
  }
  ;({ theOnesDrawnInsideFirst } = await import('../src/web/components/agent/MarkLayer.tsx'))
})

/**
 * A stand-in for the element that IS a region, holding the drawings it contains.
 *
 * IT IS NOT A FAKE ELEMENT. The rule asks a region one question — does it contain this drawing? —
 * and that one question is what this answers. Building a document to ask it would be testing a
 * browser this test does not have.
 */
const holding = (...inside: string[]) => ({ contains: (one: string) => inside.includes(one) })

describe('which drawing of a record a stored comment is shown on', () => {
  it('puts the drawings inside the region the comment was made in first', () => {
    // The four drawings of one record at the foot of a record page, in document order. The comment
    // was made in the third one, under *What is still open around this*.
    const drawings = ['relatesToSentence', 'linksFoldRow', 'openAroundRow', 'lastChangedRow']

    expect(theOnesDrawnInsideFirst(drawings, holding('openAroundRow'))).toEqual([
      'openAroundRow',
      'relatesToSentence',
      'linksFoldRow',
      'lastChangedRow',
    ])
  })

  it('keeps the drawings inside the region in the order the page draws them', () => {
    // A region can hold more than one drawing of the same record — a relation section drawing a
    // sentence and a row. Document order is what decides between them, exactly as before.
    const drawings = ['first', 'insideA', 'insideB', 'last']

    expect(theOnesDrawnInsideFirst(drawings, holding('insideB', 'insideA'))).toEqual([
      'insideA',
      'insideB',
      'first',
      'last',
    ])
  })

  it('leaves the order alone when the page draws nothing inside that region', () => {
    // NULL MEANS THE PAGE DOES NOT DRAW THE REGION AT ALL, which is the ordinary case for a comment
    // read back somewhere else, and an empty region is the same answer. Showing nothing would be
    // worse than showing the first drawing: the comment is still about that record.
    const drawings = ['first', 'second', 'third']

    expect(theOnesDrawnInsideFirst(drawings, null)).toEqual(['first', 'second', 'third'])
    expect(theOnesDrawnInsideFirst(drawings, holding('somethingElse'))).toEqual(['first', 'second', 'third'])
  })
})
