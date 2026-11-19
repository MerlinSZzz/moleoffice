// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A ROW IS AT LEAST AS TALL AS THE LINE OF TEXT IN IT, AT EVERY DENSITY AND EVERY TEXT SIZE.
 *
 * ---------------------------------------------------------------------------------------
 * THE DEFECT THIS EXISTS FOR
 * ---------------------------------------------------------------------------------------
 *
 * Density writes px row heights. Text size moves the rem type. They are orthogonal by design and
 * they meet in exactly one place: a row holding one line. At Large the root is 18px, so --fs-2
 * comes to 15.75px, and 15.75 x 1.45 of text plus two lots of Compact's 6px padding is 34.8px
 * being asked to sit in a 28px row.
 *
 * The answer is one expression, --row-fit, declared once, named by every --row-h declaration:
 * `--row-h: max(<this density's own number>, var(--row-fit))`.
 *
 * ---------------------------------------------------------------------------------------
 * WHY EIGHTEEN VALUES AND NOT NINE, AND WHY A BROWSER
 * ---------------------------------------------------------------------------------------
 *
 * An earlier repair put the clamp on TWO of the five declaration sites and its test inspected the
 * same two, so rows still clipped at Large on Compact behind a green run. This test measures every
 * combination, so a row that clips at any of them is caught.
 *
 * THE VIEWPORT IS AN AXIS, and it is the axis that matters most. `@media (max-width: 480px)`
 * carries the fifth declaration — the phone's 44px touch floor — and a test with no width axis
 * never visits it. So: three densities x three text sizes x two widths.
 *
 * NOT ONE OF THE FIVE DECLARED NUMERALS CAN BE LOWERED AND CAUGHT BY A MEASUREMENT, AND THAT IS
 * MEASURED. This header used to say "two of the five sites" and then name one, which is the exact
 * mistake it was written to prevent. Each numeral was lowered to 20px in turn, keeping the
 * `max(..., var(--row-fit))` wrapper so that only the number moved and the source scan below still
 * passed. The file stayed 34 of 34 green every time:
 *
 *   tokens.css:158  the bare :root default   max(32px -> 20px)   34/34 green
 *   tokens.css:807  compact, on a desk       max(28px -> 20px)   34/34 green
 *   tokens.css:814  default, on a desk       max(32px -> 20px)   34/34 green
 *   tokens.css:821  comfortable, on a desk   max(44px -> 20px)   34/34 green
 *   tokens.css:908  the phone's touch floor  max(44px -> 20px)   34/34 green
 *
 * --row-fit is above all five in every measured cell, so a declared numeral is never the value the
 * browser computes and lowering one moves nothing. RAISED to 200px the three desk densities do
 * fire — three of `what the guard costs` go red each time — because their nine literals are exact.
 * The other two fire in neither direction. The bare `:root` default is never the computed value at
 * all: PresetBar.applyPresets always writes data-density on <html> and `:root[data-density=...]`
 * then wins on specificity. The phone's floor is only ever asked `>= 44`, which max(200px, ...)
 * satisfies as readily as max(44px, ...); at 390 the fit is 44.3px at small and default text and
 * 46.83px at large, in all three densities, so 44 is never reached from below either.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT --row-fit COSTS, PINNED RATHER THAN DISCOVERED
 * ---------------------------------------------------------------------------------------
 *
 * It is a floor, and at the DEFAULT text size it already stands above two of the three densities:
 * 14 x 1.45 + 2 x 6 is 32.3, so a Compact row draws at 32.3px and not 28px whatever the text size.
 * The design's own arithmetic only ever looked at Large. The nine desktop values are asserted
 * below as literals so that the price of this guard is a number somebody can read and argue with,
 * and so that a later decision to give Compact its 28px back has to change this file to say so.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  DENSITIES,
  SIZES,
  tokensInABrowser,
  type Computed,
  type DensityUnderTest,
  type SizeUnderTest,
  type TokenBrowser,
} from './tokens-in-a-browser.ts'

/** The two widths, and what decides which --row-h block applies at each. */
const WIDTHS = [1440, 390] as const

/** The px floor each density asks for on a desk. Below 480px all three become the touch floor. */
const DESK_FLOOR: Record<DensityUnderTest, number> = { compact: 28, default: 32, comfortable: 44 }
const PHONE_FLOOR = 44

type Cell = { width: number; density: DensityUnderTest; size: SizeUnderTest; read: Computed }

let browsers: TokenBrowser[] = []
const cells: Cell[] = []

beforeAll(async () => {
  for (const width of WIDTHS) {
    const tokens = await tokensInABrowser(width)
    browsers.push(tokens)
    for (const density of DENSITIES) {
      for (const size of SIZES) cells.push({ width, density, size, read: await tokens.at(density, size) })
    }
  }
}, 180_000)

afterAll(async () => {
  for (const tokens of browsers) await tokens.close()
  browsers = []
})

/** One measured combination. Absent means beforeAll never ran, which is not a pass. */
function cell(width: number, density: DensityUnderTest, size: SizeUnderTest): Cell {
  const found = cells.find((c) => c.width === width && c.density === density && c.size === size)
  if (found === undefined) throw new Error(`nothing was measured at ${String(width)} ${density} ${size}`)
  return found
}

describe('every one of the eighteen rows holds its own line of text', () => {
  it('really measured all eighteen, so a test that measured nothing cannot pass quietly', () => {
    expect(cells.length).toBe(WIDTHS.length * DENSITIES.length * SIZES.length)
  })

  for (const width of WIDTHS) {
    for (const density of DENSITIES) {
      for (const size of SIZES) {
        it(`fits ${size} text in a ${density} row at ${String(width)}`, () => {
          const { read } = cell(width, density, size)
          const floor = width === 390 ? PHONE_FLOOR : DESK_FLOOR[density]
          const line = read.fs[1] as number
          const needs = line * read.lineHeight + 2 * read.pad
          // A twentieth of a pixel of slack, and it is rounding and not tolerance: both numbers
          // come back rounded to two places, so recomputing the fit from the rounded font size
          // lands up to 0.01px above the height the browser rounded down. What this catches is a
          // row four to seven pixels short of its own text, which is what a missing clamp costs.
          expect(
            read.rowH,
            `a ${density} row at ${String(width)} with ${size} text is ${String(read.rowH)}px and has to hold ` +
              `${String(line)}px of text at ${String(read.lineHeight)} plus 2 x ${String(read.pad)}px of padding, ` +
              `which is ${String(Math.round(needs * 100) / 100)}px. --row-h computed to "${read.rowHExpression}".`,
          ).toBeGreaterThanOrEqual(Math.round(needs * 100) / 100 - 0.05)
          expect(read.rowH, `the ${String(floor)}px floor for ${density} was lost`).toBeGreaterThanOrEqual(floor)
        })
      }
    }
  }
})

describe('--row-fit resolves against each density\'s own padding, which was reasoned and is now measured', () => {
  // THE CLAIM. --row-fit is declared once, on :root, with var(--pad) inside it. All five uses of
  // it are also on :root, and a custom property is substituted where it is USED, so each density
  // block's own --pad should be the one substituted. If a browser resolved --pad at the point of
  // DECLARATION instead, every density would carry the default 8px and Compact would clamp too
  // tall. The fallback that would have been needed is three --row-fit-* tokens, one per density.
  it('substitutes Compact\'s 6px and not the default 8px', () => {
    const { read } = cell(1440, 'compact', 'default')
    expect(read.pad, 'Compact does not have 6px of padding, so this test is measuring the wrong thing').toBe(6)
    expect(
      read.rowHExpression,
      `--row-h under Compact computed to "${read.rowHExpression}", which does not carry Compact's own padding`,
    ).toContain('6px')
  })

  it('gives the three densities three different fits at the same text size', () => {
    const fits = DENSITIES.map((density) => cell(1440, density, 'default').read.rowH)
    expect(new Set(fits).size, `the three densities all came to ${fits.join(', ')}px`).toBe(3)
  })
})

describe('what the guard costs, so the price is a number and not a surprise', () => {
  /**
   * The nine desktop row heights, in px. Every one of them is a floor that fires: --row-fit is
   * above Compact's 28 and Default's 32 at ALL THREE text sizes, so this guard raises every row
   * in the product by about 4px and does not only defend Large. That is the design's own formula
   * — one line of --fs-2 at --lh-body plus two lots of --pad — carried to its arithmetic.
   */
  const EXPECTED: Record<DensityUnderTest, Record<SizeUnderTest, number>> = {
    compact: { small: 32.3, default: 32.3, large: 34.84 },
    default: { small: 36.3, default: 36.3, large: 38.84 },
    comfortable: { small: 44.3, default: 44.3, large: 46.84 },
  }

  for (const density of DENSITIES) {
    for (const size of SIZES) {
      it(`draws a ${density} row at ${String(EXPECTED[density][size])}px with ${size} text`, () => {
        expect(cell(1440, density, size).read.rowH).toBeCloseTo(EXPECTED[density][size], 1)
      })
    }
  }

  it('leaves the phone at its touch floor or above, never below it', () => {
    for (const density of DENSITIES) {
      for (const size of SIZES) {
        const { read } = cell(390, density, size)
        expect(read.rowH, `a ${density} row at 390 with ${size} text is ${String(read.rowH)}px`).toBeGreaterThanOrEqual(
          PHONE_FLOOR,
        )
      }
    }
  })
})
