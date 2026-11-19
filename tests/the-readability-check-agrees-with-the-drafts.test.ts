// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SHARED READABILITY CHECK GIVES THE DRAFTS' OWN MEASUREMENTS, ROW BY ROW.
 *
 * The drafts measured 117 pairs in each of the six themes with their own script. Their rows are
 * kept in tests/the-theme-drafts-own-contrast-rows.ts. The shared check rebuilt each row as two
 * style names, and here it measures the shipped themes. For every row it must give the same
 * colour, the same ground, the same floor and the same ratio to two decimals. A row it gives
 * differently is named, so a failure says which one.
 *
 * A ROW WHOSE COLOUR WAS REPLACED BY A DECISION is the one exception. The drafts' own row stays as
 * they measured it, and here the check must give the replacement instead, with the ratio it was
 * measured at outside this test by the drafts' WCAG 2 arithmetic. A replacement that matches no
 * row fails, so the list cannot hold a row nobody reads.
 *
 * Every pair must also pass its floor in every theme: 7 for body text, 4.5 for other text and
 * 3 for lines.
 */
import { describe, expect, it } from 'vitest'
import { checkReadability } from '../src/shared/readability.ts'
import { THEMES } from '../src/shared/themes.ts'
import { THE_DRAFTS_OWN_ROWS } from './the-theme-drafts-own-contrast-rows.ts'

/**
 * THREE LOOKS' READ TICKS. tests/delivered-ticks-turn-green-only-when-read.test.ts measures the
 * read tick in High contrast, Paper and Warm night, and the drafted greens of all three fail it.
 * Each replacement is a decision of line 14d's of 18 November 2026.
 * - High contrast's #00612a has an OKLCH chroma of 0.118, under the 0.12 that test asks. #3d6600
 *   is the nearest colour in High contrast's own draft that passes every check of the read tick,
 *   by the method the drafts' failing pairs follow.
 * - Paper's #3d6431 and Warm night's #b4d49a have chromas of 0.090 and 0.085, and each is under
 *   the 25 apart, by CIEDE2000, that the test asks between the read and the delivered tick. No
 *   colour in either look's own draft passes, so #2a7503 and #c3f39b are the nearest colours that
 *   do, with the drafted hue kept and 26 apart.
 */
const REPLACED = [
  { theme: 'high-contrast', what: '--chat-read', on: 'panel', fg: '#3d6600', ratio: 6.78 },
  { theme: 'paper', what: '--chat-read', on: 'panel', fg: '#2a7503', ratio: 5.21 },
  { theme: 'warm-night', what: '--chat-read', on: 'panel', fg: '#c3f39b', ratio: 13.59 },
] as const

describe("the drafts' 117 rows", () => {
  it.each(THEMES.map((theme) => [theme.id, theme] as const))('are each given again by the shared check in %s, to two decimals, with the same floor', (id, theme) => {
    const measured = checkReadability(theme)
    const rows = THE_DRAFTS_OWN_ROWS.filter((row) => row.theme === id)
    const replacedHere = REPLACED.filter((one) => one.theme === id)
    const matchesNoRow = replacedHere.filter((one) => !rows.some((row) => row.what === one.what && row.on === one.on))
      .map((one) => `${one.what} on ${one.on}: replaced, but the drafts have no such row`)
    const differ = rows.flatMap((row, at) => {
      const one = measured[at]
      const name = `${row.group} | ${row.what} on ${row.on}`
      if (one === undefined) return [`${name}: not measured`]
      const replaced = replacedHere.find((entry) => entry.what === row.what && entry.on === row.on)
      const fg = replaced?.fg ?? row.fg
      const ratio = replaced?.ratio ?? row.ratio
      const same = one.pair.what === row.what && one.pair.on === row.on && one.fg === fg.toLowerCase() && one.bg === row.bg.toLowerCase()
        && Math.abs(one.ratio - ratio) < 0.005 && one.floor === row.floor
      const says = replaced ? 'the replacement says' : 'the draft says'
      return same ? [] : [`${name}: ${says} ${fg} on ${row.bg} is ${ratio} against ${row.floor}; the check says ${one.fg} on ${one.bg} is ${one.ratio.toFixed(2)} against ${one.floor}`]
    })
    expect([...matchesNoRow, ...differ]).toEqual([])
  })
})

describe('every pair the check measures', () => {
  it.each(THEMES.map((theme) => [theme.id, theme] as const))('passes its floor in %s', (_id, theme) => {
    const failing = checkReadability(theme).filter((one) => !one.passes)
      .map((one) => `${one.pair.fg} on ${one.pair.bg}: ${one.ratio.toFixed(2)} against ${one.floor}`)
    expect(failing).toEqual([])
  })
})
