// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * HOW HEAVILY THE CANVAS DRAWS EACH KIND OF LINE, which is the half of the `carries` decision that
 * had nothing checking it.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS FILE EXISTS
 * ---------------------------------------------------------------------------------------
 *
 * The approved decision about the `carries` bundle has two halves. The first — the bundle is not
 * drawn by default, and a press on either end brings back exactly its own lines — is meaning, it
 * lives in model.ts, and tests/graph-model.test.ts holds all of it.
 *
 * The second is that THE GATE AND DEPENDENCY GRAPH STAYS THE VISUALLY DOMINANT SIGNAL. That half was
 * written down in a CSS comment and nowhere else, and it was wrong: measured in a running browser, a
 * revealed `carries` line was 2.5px in the accent against a hard gate's 2.25px in the blocked tone.
 * Pressing one module on the seeded pipeline made seven accent-blue lines, each heavier than every
 * gate on the canvas, which turns a drawing about dependencies into a drawing about ownership.
 *
 * The runner has no DOM and cannot render a canvas, so this file does the two things it can:
 * it asserts the ordering the weights have to keep, and it asserts that Canvas.tsx still builds its
 * stylesheet from the declared weights rather than from numbers typed into the CSS. The second one
 * matters as much as the first — the defect above was a literal in a stylesheet, and a table nothing
 * uses would not have caught it.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import { describe, expect, it } from 'vitest'
import { LINE_WEIGHT, lineWeightsAreOrdered, type LineWeightName } from '../src/web/components/graph/lines.ts'

const canvasSource = readFileSync(
  fileURLToPath(new URL('../src/web/components/graph/Canvas.tsx', import.meta.url)),
  'utf8',
)

describe('what each kind of line weighs', () => {
  it('keeps the gates heavier than a revealed `carries` line, so the dependencies stay dominant', () => {
    // The function returns the reasons rather than a boolean, so a failure says which rule broke.
    expect(lineWeightsAreOrdered()).toEqual([])
    expect(LINE_WEIGHT.carriesRevealed).toBeLessThan(LINE_WEIGHT.gate)
  })

  it('still brings a revealed line forward of the weight it is held back at', () => {
    // The fix for the defect above must not go so far that a revealed line is indistinguishable from
    // a held-back one, which would leave a press producing lines nobody can follow.
    expect(LINE_WEIGHT.carriesRevealed).toBeGreaterThan(LINE_WEIGHT.carries)
    expect(lineWeightsAreOrdered({ ...LINE_WEIGHT, carriesRevealed: LINE_WEIGHT.carries })).toHaveLength(1)
  })

  it('says which rule broke, and why it exists, rather than answering yes or no', () => {
    const heavier = lineWeightsAreOrdered({ ...LINE_WEIGHT, carriesRevealed: LINE_WEIGHT.gate + 0.25 })
    expect(heavier).toHaveLength(1)
    expect(heavier[0]).toContain('visually dominant')
    // The exact defect that was measured in the browser: 2.5 against a gate's 2.25.
    expect(lineWeightsAreOrdered({ ...LINE_WEIGHT, carriesRevealed: 2.5 })).toHaveLength(1)
  })

  it('is the table Canvas.tsx draws from, not a second opinion beside it', () => {
    // WHAT WOULD MAKE THE TABLE DECORATIVE. A weight typed straight into the stylesheet again would
    // leave every assertion above passing while the canvas drew something else entirely, which is
    // exactly the shape of the defect this file was written for.
    const css = canvasSource.slice(canvasSource.indexOf('const CANVAS_CSS'))
    expect(css.length).toBeGreaterThan(500)
    const widths = [...css.matchAll(/stroke-width:\s*([^;\n]+)/g)].map((found) => found[1]?.trim() ?? '')
    expect(widths.length).toBeGreaterThan(3)
    for (const width of widths) {
      expect(width, `stroke-width: ${width} is a number typed into the stylesheet`).toMatch(
        /^\$\{LINE_WEIGHT\.[A-Za-z]+\}$/,
      )
    }
    // And every name it reaches for is one the table actually declares.
    for (const width of widths) {
      const name = width.replace('${LINE_WEIGHT.', '').replace('}', '') as LineWeightName
      expect(Object.keys(LINE_WEIGHT)).toContain(name)
    }
  })
})

/**
 * THE THREE FAMILIES A LINK IS DRAWN AS, and the one thing the families are NOT allowed to decide.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS MEASURED
 * ---------------------------------------------------------------------------------------
 *
 * The planning graph drew all thirteen stored link types as the same 1.5px grey arrow. Six of them
 * are on the live drawing at once — `implements`, `part of`, `derived from`, `relates to`, `about`
 * and `blocks` — so the picture could not say which line meant "this waits for that" and which meant
 * "somebody joined these", and the words that could say it were pills wide enough to be most of the
 * plane's 2,645px.
 *
 * Two faults follow, and this file is here because neither breaks a type or throws:
 *
 *   1. A FOURTEENTH LINK TYPE LANDING IN A FAMILY NOBODY CHOSE. `LINK_TYPES` is the shared
 *      declaration and it grows — `resolves` and `about` were both added to it after the drawing was
 *      written. A `?? 'related'` behind the lookup would draw a new type as a dotted line, silently,
 *      which is rule 2 in the place it is hardest to see. So the table is asserted TOTAL against the
 *      shared declaration rather than against a list copied into this file.
 *
 *   2. AN ARROWHEAD ON A LINK THAT HAS NO DIRECTION. An audit asked for `relates to` AND `about` to
 *      lose their heads for being symmetric. Half of that is right: `LINK_TYPES.relates_to.symmetric`
 *      is true, and `about` is false — it reads `about` one way and `subject of` the other. Taking
 *      the head off `about` would assert LESS than the row holds, which is the same defect pointing
 *      the other way. So the family owns weight and dash, `symmetric` owns the head, and this states
 *      that the drawing has not grown a second opinion about which links have a direction.
 */
describe('the three families a line is drawn as', () => {
  it('classifies every link type the shared declaration holds, with no default behind it', async () => {
    const { LINK_TYPES } = await import('../src/shared/types.ts')
    const { unclassifiedLinkTypes, linkFamilyOf } = await import('../src/web/components/graph/lines.ts')
    // Read off the shared table rather than typed in here: a fourteenth type must fail this, and a
    // list copied into the test would keep passing while the drawing guessed at the new one.
    const stored = Object.keys(LINK_TYPES)
    expect(stored.length).toBeGreaterThan(10)
    expect(unclassifiedLinkTypes(stored)).toEqual([])
    expect(linkFamilyOf('a type nobody declared')).toBeNull()
  })

  it('keeps `blocks` on its own, because an order in time is what a plan is opened to read', async () => {
    const { LINK_FAMILY_OF } = await import('../src/web/components/graph/lines.ts')
    expect(LINK_FAMILY_OF['blocks']).toBe('sequence')
    // The six on the live drawing, each in the family its words mean.
    expect(LINK_FAMILY_OF['implements']).toBe('builds')
    expect(LINK_FAMILY_OF['part_of']).toBe('builds')
    expect(LINK_FAMILY_OF['derived_from']).toBe('builds')
    expect(LINK_FAMILY_OF['relates_to']).toBe('related')
    expect(LINK_FAMILY_OF['about']).toBe('related')
  })

  it('draws sequence heaviest and related dashed, and says which rule broke when it does not', async () => {
    const { LINE_FAMILY_STYLE, lineFamiliesAreOrdered } = await import('../src/web/components/graph/lines.ts')
    expect(lineFamiliesAreOrdered()).toEqual([])
    // A sequence line is solid. A dashed line reads as provisional, and an order in time is not.
    // This was a sentence inside lineFamiliesAreOrdered that no page ever drew, so the rule is
    // checked here on the style itself.
    expect(LINE_FAMILY_STYLE.sequence.dash).toBeNull()

    const flattened = {
      ...LINE_FAMILY_STYLE,
      sequence: { ...LINE_FAMILY_STYLE.sequence, width: LINE_FAMILY_STYLE.builds.width },
    }
    const broken = lineFamiliesAreOrdered(flattened)
    expect(broken).toHaveLength(1)
    expect(broken[0]).toContain('What waits for what')

    const solid = { ...LINE_FAMILY_STYLE, related: { ...LINE_FAMILY_STYLE.related, dash: null } }
    expect(lineFamiliesAreOrdered(solid)[0]).toContain('somebody joined these')
  })

  it('leaves the arrowhead to `symmetric` in the shared table, and does not restate which links have one', async () => {
    const { LINK_TYPES } = await import('../src/shared/types.ts')
    const lines = await import('../src/web/components/graph/lines.ts')
    // `relates_to` is the one symmetric type, and it is `related`. `about` is in the same family and
    // is NOT symmetric — the family and the head are two different questions and this is the pair
    // that proves it, because a family-decides-the-head implementation cannot answer both.
    expect(LINK_TYPES.relates_to.symmetric).toBe(true)
    expect(LINK_TYPES.about.symmetric).toBe(false)
    expect(lines.LINK_FAMILY_OF['relates_to']).toBe(lines.LINK_FAMILY_OF['about'])

    // And the drawing must not have grown its own list of which links point. `symmetric` is read
    // from the shared table in PlanGraph.tsx; a literal set of type names beside the marker would be
    // the second declaration this repository keeps finding.
    const source = readFileSync(
      fileURLToPath(new URL('../src/web/components/graph/PlanGraph.tsx', import.meta.url)),
      'utf8',
    )
    const code = source.slice(source.indexOf('function BandBody'))
    expect(code).toContain('LINK_TYPES[edge.type as keyof typeof LINK_TYPES]?.symmetric')
    expect(code).not.toMatch(/markerEnd=\{[^}]*'relates_to'/)
  })
})
