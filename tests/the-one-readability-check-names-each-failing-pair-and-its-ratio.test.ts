// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE ONE READABILITY CHECK AN OWN THEME MUST PASS, AND WHAT IT SAYS WHEN ONE DOES NOT.
 *
 * The pair, its floor and the ratio are read from readability-pairs.ts and readability.ts, never
 * copied here. `--lanes-badge-text-0` is the foreground of exactly one pair, so drawing it in its
 * own ground's colour fails that pair and no other.
 *
 * Which way a colour can move is measured by moving it alone as far as it goes, to white or to black,
 * with the other colour held, and asking the same check.
 */
import { describe, expect, it } from 'vitest'
import { aCopyOf, asATheme, readTheLook, type OwnTheme } from '../src/shared/own-themes.ts'
import { FLOORS, READABILITY_PAIRS, checkReadability, ratioWords, whyTheThemeIsHardToRead } from '../src/shared/readability.ts'
import type { StyleName } from '../src/shared/theme-style-names.ts'
import { THEMES } from '../src/shared/themes.ts'

const BADGE_TEXT = '--lanes-badge-text-0'

function aCopyOfPaper(change: (values: Record<string, string>) => void): OwnTheme {
  const copy = aCopyOf(THEMES[0]!, { chosen: 'auto', own: [] }, 'Made-up badges')
  const values: Record<string, string> = { ...copy.values }
  change(values)
  return { ...copy, values: values as OwnTheme['values'] }
}

describe('the one readability check', () => {
  it('passes an unchanged copy of each of the six shipped themes', () => {
    for (const theme of THEMES) {
      const copy = aCopyOf(theme, { chosen: 'auto', own: [] }, `Copy of ${theme.name.en}`)
      expect(whyTheThemeIsHardToRead(asATheme(copy), copy.name), theme.id).toEqual({ failing: [], cannotMeasure: null, sentences: [] })
    }
  })

  it('names the one pair under its floor, with its ratio and its floor, and the way the colour must move', () => {
    const pairs = READABILITY_PAIRS.filter((pair) => pair.fg === BADGE_TEXT)
    expect(pairs).toHaveLength(1)
    const pair = pairs[0]!
    const theme = aCopyOfPaper((values) => { values[BADGE_TEXT] = values[pair.bg]! })
    const answer = whyTheThemeIsHardToRead(asATheme(theme), theme.name)
    const measured = checkReadability(asATheme(theme)).find((one) => one.pair === pair)!
    expect(measured.ratio).toBe(1)
    expect(answer.sentences).toEqual([
      `The theme "Made-up badges" draws ${pair.fg} on ${pair.bg} at ${ratioWords(1)} to 1, under its floor of ${FLOORS[pair.floor]} to 1.`,
    ])
    expect(answer.failing.map(({ measurement }) => measurement.pair)).toEqual([pair])
  })

  it('says, for the colour and for its ground, which way that one alone can move to be read, or that it cannot', () => {
    const body = READABILITY_PAIRS.find((one) => one.fg === '--text' && one.bg === '--bg')!
    const waysFor = (text: string, ground: string | null) => {
      const theme = aCopyOfPaper((values) => { values['--text'] = text; if (ground !== null) values['--bg'] = ground })
      const failing = whyTheThemeIsHardToRead(asATheme(theme)).failing.find(({ measurement }) => measurement.pair === body)
      return failing === undefined ? 'passes' : { colour: failing.colourWay, ground: failing.groundWay }
    }
    // White text on Paper's light ground: it is already as light as it goes, so only darker text or a darker ground helps.
    expect(waysFor('#ffffff', null)).toEqual({ colour: 'darker', ground: 'darker' })
    expect(waysFor('#bbbbbb', '#555555')).toEqual({ colour: 'lighter', ground: 'darker' })
    expect(waysFor('#555555', '#bbbbbb')).toEqual({ colour: 'darker', ground: 'lighter' })
    // A mid grey cannot be read at the body floor on any ground, nor any colour on a mid-grey ground.
    expect(waysFor('#777777', '#ffffff')).toEqual({ colour: 'darker', ground: null })
    expect(waysFor('#ffffff', '#777777')).toEqual({ colour: null, ground: 'darker' })
    expect(waysFor('#777777', '#777777')).toEqual({ colour: null, ground: null })
  })

  it('names only a move that makes the pair readable, and names none for a colour that cannot do it alone', () => {
    const END = { lighter: '#ffffff', darker: '#000000' } as const
    const themes = [aCopyOfPaper((values) => { values['--text'] = '#ffffff' }), aCopyOfPaper((values) => { values['--text'] = '#777777'; values['--bg'] = '#777777' })]
    for (const theme of themes) {
      const failing = whyTheThemeIsHardToRead(asATheme(theme)).failing
      expect(failing.length).toBeGreaterThan(0)
      for (const { measurement: { pair }, colourWay, groundWay } of failing) {
        const at = READABILITY_PAIRS.indexOf(pair)
        const passesWith = (name: StyleName, value: string) => checkReadability(asATheme({ ...theme, values: { ...theme.values, [name]: value } }))[at]!.passes
        for (const [name, way] of [[pair.fg, colourWay], [pair.bg, groundWay]] as const) {
          const said = `${name}, in ${pair.what} on ${pair.on}`
          if (way === null) expect([passesWith(name, END.lighter), passesWith(name, END.darker)], said).toEqual([false, false])
          else expect(passesWith(name, END[way]), said).toBe(true)
        }
      }
    }
  })

  it('cuts a ratio down and never rounds it up past its floor', () => {
    expect(ratioWords(4.499)).toBe('4.49')
    expect(ratioWords(4.5)).toBe('4.50')
  })

  it('refuses a colour it cannot read, with a sentence, and does not guess one', () => {
    const theme = aCopyOfPaper((values) => { values[BADGE_TEXT] = 'calc(1px)' })
    const answer = whyTheThemeIsHardToRead(asATheme(theme), theme.name)
    expect(answer.sentences).toEqual([
      `The theme "Made-up badges" gives ${BADGE_TEXT} the value "calc(1px)", which the readability check cannot read as a colour.`,
    ])
  })

  it('is the check the look reader asks: the same sentence refuses the look, and nothing else does', () => {
    const pair = READABILITY_PAIRS.find((one) => one.fg === BADGE_TEXT)!
    const theme = aCopyOfPaper((values) => { values[BADGE_TEXT] = values[pair.bg]! })
    const read = readTheLook({ chosen: theme.id, own: [theme] })
    expect(read).toEqual({ ok: false, why: whyTheThemeIsHardToRead(asATheme(theme), theme.name).sentences })
  })
})
