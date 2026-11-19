// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PERSON'S OWN THEME IS READ BY THE SAME STRICT READER AS THE SIX, AND EVERY REFUSAL IS A SENTENCE.
 *
 * Each case starts from a copy of a shipped theme, which passes, and changes one thing, so the
 * refusal is caused by that one change. The limits are read from own-themes.ts and never copied here.
 */
import { describe, expect, it } from 'vitest'
import {
  LONGEST_OWN_THEME_NAME,
  MOST_OWN_THEMES,
  aCopyOf,
  anOwnThemeId,
  lookWithout,
  readTheLook,
  type OwnTheme,
  type TheLook,
} from '../src/shared/own-themes.ts'
import { STYLE_NAMES } from '../src/shared/theme-style-names.ts'
import { THEMES, readThemes } from '../src/shared/themes.ts'
import { THEMES_AS_WRITTEN } from '../src/shared/theme-values.ts'

const PAPER = THEMES[0]!
const NOBODY: TheLook = { chosen: 'auto', own: [] }

function aCopy(name = 'Made-up evening', change: (values: Record<string, string>) => void = () => {}): OwnTheme {
  const copy = aCopyOf(PAPER, NOBODY, name)
  const values: Record<string, string> = { ...copy.values }
  change(values)
  return { ...copy, values: values as OwnTheme['values'] }
}

function why(look: unknown): readonly string[] {
  const read = readTheLook(look)
  return read.ok ? [] : read.why
}

describe('an own theme is read by the theme reader', () => {
  it('takes an unchanged copy of each shipped theme, and keeps every value as it was', () => {
    for (const theme of THEMES) {
      const copy = aCopyOf(theme, NOBODY, `Copy of ${theme.name.en}`)
      const read = readTheLook({ chosen: copy.id, own: [copy] })
      expect(read, theme.id).toEqual({ ok: true, look: { chosen: copy.id, own: [copy] } })
    }
  })

  it('makes an id that is own- and eight letters and digits, and none of the ids already taken', () => {
    const taken = [anOwnThemeId([])]
    const id = anOwnThemeId(taken)
    expect(id).toMatch(/^own-[a-z0-9]{8}$/)
    expect(taken).not.toContain(id)
  })

  // ONE REFUSED VALUE OF EACH KIND. The sentences of the six that were already refused are TH-1a's
  // own; the last two kinds are new with own themes.
  it.each([
    ['{', '#fff{', 'The theme "Made-up evening" gives --bg a value with the character "{", which a theme may not use.'],
    ['}', '#fff}', 'The theme "Made-up evening" gives --bg a value with the character "}", which a theme may not use.'],
    [';', '#fff;', 'The theme "Made-up evening" gives --bg a value with the character ";", which a theme may not use.'],
    ['<', '#fff<', 'The theme "Made-up evening" gives --bg a value with the character "<", which a theme may not use.'],
    ['url(', 'url(a)', 'The theme "Made-up evening" gives --bg a value that calls url(), which is not one of var, max, min, calc, rgb, rgba, translate and rotate.'],
    ['a long value', 'a'.repeat(201), 'The theme "Made-up evening" gives --bg a value of 201 characters; a value may have at most 200.'],
    ['/*', '#fff /* a', 'The theme "Made-up evening" gives --bg a value with /*, which a theme may not use: it opens or closes a CSS comment.'],
    ['an unpaired quote', "'Made-up face", 'The theme "Made-up evening" gives --bg a value with a \' that is not closed; quotes in a value must come in pairs.'],
  ])('refuses a value with %s, with a sentence that names the theme by its name', (_kind, value, sentence) => {
    const theme = aCopy('Made-up evening', (values) => { values['--bg'] = value })
    // The check is not reached for a value the reader refused, so the reader's sentence is the whole refusal.
    expect(why({ chosen: 'auto', own: [theme] })).toContain(sentence)
  })

  it('refuses a theme that carries a shipped theme\'s id, which would change that theme in place', () => {
    for (const theme of THEMES) {
      const inPlace = { ...aCopy(), id: theme.id }
      expect(why({ chosen: 'auto', own: [inPlace] })).toEqual([
        `The theme "Made-up evening" has the id ${theme.id}, which is ${theme.name.en}, one of the six shipped themes. A shipped theme cannot be changed, only copied: copy it to make your own.`,
      ])
    }
  })

  it.each(['auto', 'light', 'dark'])('refuses the id %s, which is a look tokens.css draws', (id) => {
    const look = why({ chosen: 'auto', own: [{ ...aCopy(), id }] })
    expect(look).toHaveLength(1)
    expect(look[0]).toMatch(new RegExp(`^The theme "Made-up evening" has the id ${id}, which is the look .+\\. A theme's id may not be one of Auto, Light and Dark\\.$`))
  })

  it('refuses an id another own theme already has', () => {
    const first = aCopy('Made-up first')
    const second = { ...aCopy('Made-up second'), id: first.id }
    expect(why({ chosen: 'auto', own: [first, second] })).toEqual([
      `The theme "Made-up second" has the id ${first.id}, which the theme "Made-up first" already has. Each theme needs its own id.`,
    ])
  })

  it('refuses an id that is not own- and eight letters and digits', () => {
    expect(why({ chosen: 'auto', own: [{ ...aCopy(), id: 'made-up' }] })).toEqual([
      'The theme "Made-up evening" has the id "made-up", which is not own- followed by eight lowercase letters and digits.',
    ])
  })

  it(`keeps ${MOST_OWN_THEMES} own themes and refuses one more`, () => {
    const most: OwnTheme[] = []
    for (let i = 0; i < MOST_OWN_THEMES; i++) most.push({ ...aCopy(`Made-up ${i + 1}`), id: anOwnThemeId(most.map((one) => one.id)) })
    expect(why({ chosen: 'auto', own: most })).toEqual([])
    const oneMore = [...most, { ...aCopy('Made-up one more'), id: anOwnThemeId(most.map((one) => one.id)) }]
    expect(why({ chosen: 'auto', own: oneMore })).toEqual([
      `A person may keep at most ${MOST_OWN_THEMES} own themes, and this look has ${MOST_OWN_THEMES + 1}.`,
    ])
  })

  it(`takes a name of ${LONGEST_OWN_THEME_NAME} characters and refuses one more, an empty one and one with spaces at its ends`, () => {
    expect(why({ chosen: 'auto', own: [aCopy('m'.repeat(LONGEST_OWN_THEME_NAME))] })).toEqual([])
    const long = 'm'.repeat(LONGEST_OWN_THEME_NAME + 1)
    expect(why({ chosen: 'auto', own: [aCopy(long)] })).toEqual([
      `The name "${long}" has ${LONGEST_OWN_THEME_NAME + 1} characters; a theme's name may have at most ${LONGEST_OWN_THEME_NAME}.`,
    ])
    expect(why({ chosen: 'auto', own: [aCopy('')] })).toEqual(['A theme needs a name.'])
    expect(why({ chosen: 'auto', own: [aCopy(' Made-up ')] })).toEqual(['The name " Made-up " begins or ends with a space; write it without.'])
    expect(why({ chosen: 'auto', own: [aCopy('Made-up\nline')] })).toEqual(['A theme\'s name may not hold a line break or a control character.'])
  })

  it('refuses a theme copied from something that is not one of the six', () => {
    expect(why({ chosen: 'auto', own: [{ ...aCopy(), from: 'dark' }] })).toEqual([
      'The theme "Made-up evening" says it was copied from "dark", which is not one of the six shipped themes.',
    ])
  })

  it('refuses a chosen look this person does not have', () => {
    const own = aCopy()
    expect(why({ chosen: 'own-zzzzzzzz', own: [own] })).toEqual([
      'The chosen look "own-zzzzzzzz" is none of Auto, Light, Dark, the six shipped themes and this person\'s own themes.',
    ])
    for (const chosen of ['auto', 'light', 'dark', ...THEMES.map((theme) => theme.id), own.id]) expect(why({ chosen, own: [own] }), chosen).toEqual([])
  })

  it('refuses a look with a part it does not know, and a theme with a part it does not know', () => {
    expect(why({ chosen: 'auto', own: [], colour: 'red' })).toEqual(['A look has chosen and own, and nothing else; it does not have colour.'])
    expect(why({ chosen: 'auto', own: [{ ...aCopy(), css: 'a' }] })).toEqual([
      'The theme at place 1 has css, which a theme does not have; it has id, name, from and values.',
    ])
  })

  it('refuses a theme that leaves out a style name, by the reader\'s own sentence', () => {
    const missing = aCopy('Made-up evening', (values) => { delete values[STYLE_NAMES[0]] })
    expect(why({ chosen: 'auto', own: [missing] })).toEqual([`The theme "Made-up evening" has no value for ${STYLE_NAMES[0]}.`])
  })

  it('still reads every shipped theme, whose values have no comment mark and no unpaired quote', () => {
    expect(() => readThemes(THEMES_AS_WRITTEN)).not.toThrow()
  })
})

describe('deleting an own theme', () => {
  it('changes a chosen theme to the shipped theme it was copied from, in the same look', () => {
    const own = aCopy()
    const other = { ...aCopy('Made-up other'), id: anOwnThemeId([own.id]) }
    const after = lookWithout({ chosen: own.id, own: [own, other] }, own.id)
    expect(after).toEqual({ look: { chosen: own.from, own: [other] }, chosenBecame: own.from })
    expect(why(after.look)).toEqual([])
  })

  it('keeps the choice when the deleted theme was not the chosen one', () => {
    const own = aCopy()
    expect(lookWithout({ chosen: 'dark', own: [own] }, own.id)).toEqual({ look: { chosen: 'dark', own: [] }, chosenBecame: null })
  })

  it('a copy of an own theme keeps the shipped theme the first one came from', () => {
    const first = aCopyOf(THEMES[3]!, NOBODY, 'Made-up first')
    const second = aCopyOf(first, { chosen: 'auto', own: [first] }, 'Made-up second')
    expect(second.from).toBe(THEMES[3]!.id)
    expect(second.id).not.toBe(first.id)
  })
})
