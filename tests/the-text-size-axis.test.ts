// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE TEXT-SIZE CONTROL, MEASURED AT ALL THREE SETTINGS IN A REAL BROWSER.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS ASKED FOR, AND WHAT SHIPPED
 * ---------------------------------------------------------------------------------------
 *
 * A text-size control was asked for by name. One global control ships: three positions, and the
 * only thing they move is the root font size. Every one of the six sizes in tokens.css is declared
 * once in `rem`, so the whole ladder moves together and the hierarchy between the six is kept
 * exactly. There is no per-surface matrix; that was declined to the owner in writing, as a proposal they
 * can overrule, and the reason is that a matrix ships override rows before a single surface has
 * been measured to need one.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS IS EIGHTEEN VALUES OUT OF A BROWSER AND NOT SIX STRINGS OUT OF THE FILE
 * ---------------------------------------------------------------------------------------
 *
 * `tests/legibility.test.ts` reads the DECLARATIONS and holds them to 13px at a 16px root. That is
 * the cheap check and it stays. It cannot answer this file's question, because scaling the root is
 * precisely what breaks a rem floor: at 93.75% a bare `0.8125rem` draws at 12.19px, which is the
 * size 213 sentences in this product were once measured at and the size that test forbids. So the
 * three reading sizes carry an absolute floor — `max(13px, 0.8125rem)` — and whether that floor
 * holds is a computed value at three root sizes, not a string.
 *
 * Six tokens times three settings is eighteen numbers, and all eighteen are asserted.
 *
 * WHAT WOULD MAKE THIS GO RED. Remove the `max()` from `--fs-1` and the Small floor fails and the
 * Default one does not. Set `small` to 70% and the same. Take the two root rules out and the
 * three roots stop differing. Each is a real mutation and each was run.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  SIZES,
  tokensInABrowser,
  type Computed,
  type SizeUnderTest,
  type TokenBrowser,
} from './tokens-in-a-browser.ts'

/**
 * What the browser's own base size is, and therefore what the two percentages come to.
 *
 * Chromium's default is 16px and the comments in tokens.css are written against it. The floors
 * are absolute, so a reader whose browser is set larger keeps the larger app; the point of the
 * table below is the RATIO between the three, which is what the control owns.
 */
const EXPECTED_ROOT: Record<SizeUnderTest, number> = { small: 15, default: 16, large: 18 }

/** The floor each of the three reading sizes carries, in px. Nothing above --fs-3 has one. */
const FLOORS = [13, 14, 15]

let tokens: TokenBrowser
const measured = new Map<SizeUnderTest, Computed>()

beforeAll(async () => {
  tokens = await tokensInABrowser(1440)
  // Density is held at `default` throughout: this file is about the text axis, and the two are
  // orthogonal by design — data-density writes px spacing, data-size moves the rem type, and they
  // never write the same token. Where they meet is a row's height, which is a different test.
  for (const size of SIZES) measured.set(size, await tokens.at('default', size))
}, 120_000)

afterAll(async () => {
  await tokens.close()
})

/** The reading this test is about. Absent means `beforeAll` never ran, which is not a pass. */
function readingAt(size: SizeUnderTest): Computed {
  const found = measured.get(size)
  if (found === undefined) throw new Error(`nothing was measured at ${size} — this test measured nothing`)
  return found
}

describe('the text-size control moves the root and nothing else', () => {
  it('really measured all three settings, so a test that measured nothing cannot pass quietly', () => {
    expect(measured.size).toBe(SIZES.length)
    for (const size of SIZES) expect(readingAt(size).fs.length, `${size} has no sizes`).toBe(6)
  })

  it.each(SIZES)('puts the root at the size %s promises', (size) => {
    expect(readingAt(size).root, `data-size=${size} put the root at ${String(readingAt(size).root)}px`).toBe(
      EXPECTED_ROOT[size],
    )
  })

  it('gives the three positions three different roots, so the control is not decorative', () => {
    const roots = SIZES.map((size) => readingAt(size).root)
    expect(new Set(roots).size, `the three settings all computed to ${roots.join(', ')}`).toBe(3)
  })
})

describe('no setting takes a sentence under the size this product measured its own failure at', () => {
  // 13px is the floor established when 69% of every visible text node in the app — including 213
  // full sentences of eight words or more — was drawn at 12px. --fs-1, --fs-2 and --fs-3 carry
  // every sentence in the product. --fs-4 and up are headings and are already past it.
  it.each(SIZES)('holds the three reading sizes at their floors at %s', (size) => {
    const reading = readingAt(size)
    for (const [at, floor] of FLOORS.entries()) {
      const value = reading.fs[at]
      expect(
        value,
        `at text size ${size} the root is ${String(reading.root)}px and --fs-${String(at + 1)} draws at ` +
          `${String(value)}px, under its ${String(floor)}px floor. A rem size with no max() does this.`,
      ).toBeGreaterThanOrEqual(floor)
    }
  })

  it.each(SIZES)('keeps the six steps of the scale apart at %s', (size) => {
    // A floor applied by clamping the whole scale to one number would be a different defect:
    // labels, row text and prose would become one size and the page would lose its hierarchy.
    const { fs } = readingAt(size)
    for (let at = 1; at < fs.length; at++) {
      expect(
        fs[at],
        `at text size ${size} --fs-${String(at + 1)} is ${String(fs[at])}px and --fs-${String(at)} is ` +
          `${String(fs[at - 1])}px, so the ladder has flattened`,
      ).toBeGreaterThan(fs[at - 1] as number)
    }
  })
})

describe('what each position actually buys, so neither segment overpromises', () => {
  it('answers the complaint Large exists for: control labels get bigger', () => {
    // The complaint was that 13px control labels are too small and nothing on the page
    // changes them. --fs-1 is what those labels are set in.
    const large = readingAt('large').fs[0] as number
    const normal = readingAt('default').fs[0] as number
    expect(large, `Large draws labels at ${String(large)}px and Default at ${String(normal)}px`).toBeGreaterThan(
      normal,
    )
    expect(large).toBeCloseTo(14.63, 1)
  })

  it('does not shrink a sentence at Small — it shrinks the headings above one', () => {
    // This is the sentence the Small segment is allowed to imply and no more. The bottom two
    // steps are the same height as Default's, because both are sitting on their floors; the four
    // above them are smaller. Small is more page per screen, not smaller text everywhere.
    const small = readingAt('small').fs
    const normal = readingAt('default').fs
    expect(small[0], 'Small moved --fs-1, so the floor is not holding').toBe(normal[0])
    expect(small[1], 'Small moved --fs-2, so the floor is not holding').toBe(normal[1])
    for (const at of [3, 4, 5]) {
      expect(
        small[at],
        `--fs-${String(at + 1)} is ${String(small[at])}px at Small and ${String(normal[at])}px at Default, ` +
          `so Small buys nothing above the reading sizes`,
      ).toBeLessThan(normal[at] as number)
    }
  })
})
