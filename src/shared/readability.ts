// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHETHER A THEME CAN BE READ: WCAG 2 CONTRAST FOR EVERY PAIR IN readability-pairs.ts.
 *
 * Floors: 7 for body text, 4.5 for other text, links and button text, 3 for lines, rails and the
 * focus ring. A see-through colour is laid over what is beneath it before it is measured, and each
 * channel is rounded to a whole number as it is laid, as a browser draws it.
 *
 * A colour here is a hex colour, `transparent`, or var() of another style name in the same theme.
 * Anything else stops the check with a sentence: it never guesses a colour.
 *
 * `whyTheThemeIsHardToRead` below is the one check a theme somebody made must pass before it is
 * kept. It asks `checkReadability` and nothing else, so there is one measurement and no second one.
 */
import type { WordKey } from './i18n.ts'
import { ADDED_PAIRS, DRAFT_PAIRS } from './readability-pairs.ts'
import type { StyleName } from './theme-style-names.ts'
import type { AnyThemeId, Theme } from './themes.ts'

export const FLOORS = { body: 7, text: 4.5, line: 3 } as const

export interface ReadabilityPair {
  readonly group: string
  readonly what: string
  readonly on: string
  readonly fg: StyleName
  readonly bg: StyleName
  /** What lies beneath a see-through ground, nearest first. */
  readonly under: readonly StyleName[]
  readonly floor: keyof typeof FLOORS
}

export const READABILITY_PAIRS: readonly ReadabilityPair[] = [...DRAFT_PAIRS, ...ADDED_PAIRS]

export interface Measurement {
  readonly theme: AnyThemeId
  readonly pair: ReadabilityPair
  /** The colour as drawn, after it is laid over its ground. */
  readonly fg: string
  readonly bg: string
  readonly ratio: number
  readonly floor: number
  readonly passes: boolean
}

interface Colour {
  readonly rgb: readonly [number, number, number]
  readonly alpha: number
}

/**
 * THE CHECK COULD NOT MEASURE THIS THEME: a value it cannot read as a colour, or a see-through
 * ground with nothing solid beneath it. Its own class, so a caller that turns it into a refusal
 * catches this and nothing else.
 */
export class CannotMeasure extends Error {}

/** How bright a colour is, as WCAG 2 measures it. */
function luminance({ rgb }: Colour): number {
  const linear = (channel: number) => {
    const c = channel / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * linear(rgb[0]) + 0.7152 * linear(rgb[1]) + 0.0722 * linear(rgb[2])
}

/** A colour the check wrote as six hex digits, read back. */
function fromHex(hex: string): Colour {
  const channel = (at: number) => parseInt(hex.slice(at, at + 2), 16)
  return { rgb: [channel(1), channel(3), channel(5)], alpha: 1 }
}

/** Measures every pair in one theme. */
export function checkReadability(theme: Theme): Measurement[] {
  const colourOf = (name: StyleName, from: readonly StyleName[] = []): Colour => {
    const value = theme.values[name].trim().toLowerCase()
    if (value === 'transparent') return { rgb: [0, 0, 0], alpha: 0 }
    const hex = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(value)?.[1]
    if (hex !== undefined) {
      const full = hex.length <= 4 ? [...hex].map((digit) => digit + digit).join('') : hex
      const channel = (at: number) => parseInt(full.slice(at, at + 2), 16)
      return { rgb: [channel(0), channel(2), channel(4)], alpha: full.length === 8 ? channel(6) / 255 : 1 }
    }
    const named = /^var\(\s*(--[a-z0-9-]+)\s*\)$/.exec(value)?.[1]
    if (named !== undefined && Object.hasOwn(theme.values, named) && !from.includes(named as StyleName)) {
      return colourOf(named as StyleName, [...from, name])
    }
    throw new CannotMeasure(`The theme "${theme.id}" gives ${name} the value "${theme.values[name]}", which the readability check cannot read as a colour.`)
  }
  const laid = (top: Colour, beneath: Colour): Colour => {
    const channel = (i: 0 | 1 | 2) => Math.round(top.rgb[i] * top.alpha + beneath.rgb[i] * (1 - top.alpha))
    return { rgb: [channel(0), channel(1), channel(2)], alpha: 1 }
  }
  const groundOf = (pair: ReadabilityPair): Colour => {
    const stack = [pair.bg, ...pair.under]
    const deepest = stack.findIndex((name) => colourOf(name).alpha === 1)
    if (deepest < 0) {
      throw new CannotMeasure(`The theme "${theme.id}" has a see-through ground under ${pair.fg}: ${stack.join(' over ')}, with nothing solid beneath it.`)
    }
    let ground = colourOf(stack[deepest]!)
    for (let i = deepest - 1; i >= 0; i--) ground = laid(colourOf(stack[i]!), ground)
    return ground
  }
  const asHex = ({ rgb }: Colour) => '#' + rgb.map((channel) => channel.toString(16).padStart(2, '0')).join('')

  return READABILITY_PAIRS.map((pair) => {
    const bg = groundOf(pair)
    const top = colourOf(pair.fg)
    const fg = top.alpha === 1 ? top : laid(top, bg)
    const [lighter, darker] = [luminance(fg), luminance(bg)].sort((a, b) => b - a) as [number, number]
    const ratio = (lighter + 0.05) / (darker + 0.05)
    const floor = FLOORS[pair.floor]
    return { theme: theme.id, pair, fg: asHex(fg), bg: asHex(bg), ratio, floor, passes: ratio >= floor }
  })
}

/**
 * WHICH WAY ONE COLOUR OF A FAILING PAIR CAN MOVE, ALONE, TO BE READ. The colour is moved as far as
 * it goes, to white for `lighter` and to black for `darker`, with the other colour held, and the same
 * check measures the pair again. The way it already leans is tried first. Null when neither end
 * reaches the floor: that colour alone cannot make the pair readable.
 */
export type WhichWay = 'lighter' | 'darker'

export interface FailingPair {
  readonly measurement: Measurement
  /** The way to move the pair's colour, `pair.fg`, with its ground held. */
  readonly colourWay: WhichWay | null
  /** The way to move the pair's ground, `pair.bg`, with its colour held. */
  readonly groundWay: WhichWay | null
}

const AS_FAR_AS_IT_GOES: Readonly<Record<WhichWay, string>> = { lighter: '#ffffff', darker: '#000000' }
const THE_OTHER_WAY: Readonly<Record<WhichWay, WhichWay>> = { lighter: 'darker', darker: 'lighter' }

/** The sentence that says how to fix one failing pair. There is one for each of the nine answers. */
export function howToFixIt({ colourWay, groundWay }: FailingPair): WordKey {
  return `settingsPanel.ownThemes.fix.${colourWay ?? 'none'}-${groundWay ?? 'none'}`
}

/** What the one check says about a theme somebody made. */
export interface ReadabilityAnswer {
  /** Every pair under its floor, in the order the pairs are listed. Empty when the check could not measure. */
  readonly failing: readonly FailingPair[]
  /** Why the check could not measure the theme, or null because it measured every pair. */
  readonly cannotMeasure: string | null
  /** The refusal: one sentence for each failing pair, or the one sentence that says why it could not measure. Empty when the theme passes. */
  readonly sentences: readonly string[]
}

/**
 * A RATIO AS A PERSON READS IT, cut (never rounded) to two places, so a ratio just under its floor
 * is never written as the floor itself.
 */
export function ratioWords(ratio: number): string {
  return (Math.floor(ratio * 100) / 100).toFixed(2)
}

/**
 * THE ONE READABILITY CHECK FOR A THEME SOMEBODY MADE. It measures with `checkReadability` and
 * returns every pair under its floor, with a sentence naming the pair and its ratio. A colour the
 * check cannot read is a refusal with its sentence, never a pass: absence of a measurement is not a
 * measurement that passed. `calledIn` is what the sentences call the theme.
 */
export function whyTheThemeIsHardToRead(theme: Theme, calledIn: string = theme.id): ReadabilityAnswer {
  let measured: Measurement[]
  try {
    measured = checkReadability(theme)
  } catch (error) {
    if (!(error instanceof CannotMeasure)) throw error
    const sentence = error.message.replace(`The theme "${theme.id}"`, `The theme "${calledIn}"`)
    return { failing: [], cannotMeasure: sentence, sentences: [sentence] }
  }
  // One colour moved as far as it goes, and the same check asked again; each such theme is measured once.
  const measuredWith = new Map<string, Measurement[]>()
  const passesWith = (name: StyleName, way: WhichWay, at: number): boolean => {
    const key = `${name} ${way}`
    let again = measuredWith.get(key)
    if (again === undefined) {
      again = checkReadability({ ...theme, values: { ...theme.values, [name]: AS_FAR_AS_IT_GOES[way] } })
      measuredWith.set(key, again)
    }
    return again[at]!.passes
  }
  const wayFor = (name: StyleName, leans: WhichWay, at: number): WhichWay | null =>
    [leans, THE_OTHER_WAY[leans]].find((way) => passesWith(name, way, at)) ?? null
  const failing = measured.flatMap((measurement, at): FailingPair[] => {
    if (measurement.passes) return []
    const colourLeans: WhichWay = luminance(fromHex(measurement.fg)) >= luminance(fromHex(measurement.bg)) ? 'lighter' : 'darker'
    return [{
      measurement,
      colourWay: wayFor(measurement.pair.fg, colourLeans, at),
      groundWay: wayFor(measurement.pair.bg, THE_OTHER_WAY[colourLeans], at),
    }]
  })
  const sentences = failing.map(({ measurement: { pair, ratio, floor } }) =>
    `The theme "${calledIn}" draws ${pair.fg} on ${pair.bg} at ${ratioWords(ratio)} to 1, under its floor of ${floor} to 1.`)
  return { failing, cannotMeasure: null, sentences }
}
