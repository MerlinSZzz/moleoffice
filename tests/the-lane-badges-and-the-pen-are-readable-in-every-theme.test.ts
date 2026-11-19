// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE 14 PAIRS THE DRAFTS DID NOT MEASURE: EACH LANE BADGE'S TEXT ON ITS BADGE, AND THE PEN ON A PANEL.
 *
 * The drafts have no lane badges and no pen, so each theme carries Light's or Dark's values for
 * them, and Warm night's pen is its accent. Nobody measured those values against the themes'
 * panels. Each is text, so each is held to 4.5. The lane line and the six area tints are not
 * measured: they carry no text and draw no line a person must read.
 */
import { describe, expect, it } from 'vitest'
import { ADDED_PAIRS } from '../src/shared/readability-pairs.ts'
import { checkReadability, type ReadabilityPair } from '../src/shared/readability.ts'
import { THEMES } from '../src/shared/themes.ts'

describe('the pairs added to the drafts', () => {
  it.each(THEMES.map((theme) => [theme.id, theme] as const))('are each measured in %s, and pass', (_id, theme) => {
    const added = checkReadability(theme).filter((one) => (ADDED_PAIRS as readonly ReadabilityPair[]).includes(one.pair))
    expect(added.map((one) => one.pair.fg)).toEqual(ADDED_PAIRS.map((pair) => pair.fg))
    expect(added.filter((one) => one.floor !== 4.5 || !one.passes).map((one) => `${one.pair.fg}: ${one.ratio.toFixed(2)}`)).toEqual([])
  })
})
