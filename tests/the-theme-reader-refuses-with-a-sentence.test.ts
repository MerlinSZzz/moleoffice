// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE THEME READER REFUSES WHAT A THEME MAY NOT SAY, AND SAYS WHICH THEME, WHICH NAME AND WHAT IS WRONG.
 *
 * A theme's values are written into a CSS rule on the page. The reader is what stands between a
 * value and that rule, so each refusal is tried here with a value that breaks only that one rule,
 * and the sentence it gives is compared whole. Each case starts from a shipped theme, which passes,
 * so a refusal here is caused by the one change the case makes.
 */
import { describe, expect, it } from 'vitest'
import { THEMES_AS_WRITTEN } from '../src/shared/theme-values.ts'
import { readThemes, THEMES, type WrittenTheme } from '../src/shared/themes.ts'

function aTheme(id: string, change: (values: Record<string, string>) => void = () => {}): WrittenTheme {
  const values: Record<string, string> = { ...THEMES_AS_WRITTEN[0].values }
  change(values)
  return { id, name: { en: 'A test theme', zh: '测试' }, values }
}

/** The sentences the reader gives, or none if it accepts. */
function refusals(written: readonly WrittenTheme[]): string[] {
  try {
    readThemes(written)
    return []
  } catch (error) {
    return (error as Error).message.split('\n')
  }
}

describe('the theme reader', () => {
  it('accepts every shipped theme, which is why the module loaded', () => {
    expect(refusals(THEMES_AS_WRITTEN)).toEqual([])
    expect(THEMES).toHaveLength(6)
  })

  it('refuses a theme that leaves a name out', () => {
    expect(refusals([aTheme('test', (values) => { delete values['--bg'] })])).toEqual([
      'The theme "test" has no value for --bg.',
    ])
  })

  it('refuses a name that is not on the list', () => {
    expect(refusals([aTheme('test', (values) => { values['--made-up'] = '#fff' })])).toEqual([
      'The theme "test" sets --made-up, which is not one of the style names a theme may set.',
    ])
  })

  it('refuses a value over 200 characters, and takes one of 200', () => {
    expect(refusals([aTheme('test', (values) => { values['--bg'] = 'a'.repeat(200) })])).toEqual([])
    expect(refusals([aTheme('test', (values) => { values['--bg'] = 'a'.repeat(201) })])).toEqual([
      'The theme "test" gives --bg a value of 201 characters; a value may have at most 200.',
    ])
  })

  it.each([';', '{', '}', ':', '\\', '<', '>', '!', '@', '&', '_', '\n', 'é'])('refuses the character %j', (character) => {
    expect(refusals([aTheme('test', (values) => { values['--bg'] = `#fff${character}` })])).toEqual([
      `The theme "test" gives --bg a value with the character ${JSON.stringify(character)}, which a theme may not use.`,
    ])
  })

  it('takes letters, digits, a space and # % . , ( ) \' " / + * -', () => {
    const value = `calc(1px + 2px * 3) / 4 - 5% , 'Aa' "Zz" #09f .5`
    expect(refusals([aTheme('test', (values) => { values['--bg'] = value })])).toEqual([])
  })

  it.each(['url', 'expression', 'attr', 'image-set', 'env', 'translateY', 'hsl'])('refuses the function %s()', (fn) => {
    expect(refusals([aTheme('test', (values) => { values['--bg'] = `${fn}(a)` })])).toEqual([
      `The theme "test" gives --bg a value that calls ${fn}(), which is not one of var, max, min, calc, rgb, rgba, translate and rotate.`,
    ])
  })

  it('takes var, max, min, calc, rgb, rgba, translate and rotate', () => {
    const value = 'max(min(1px, 2px), calc(var(--pad) * 2)) rgb(1, 2, 3) rgba(1, 2, 3, .5) translate(0, 1px) rotate(-4deg)'
    expect(refusals([aTheme('test', (values) => { values['--bg'] = value })])).toEqual([])
  })

  it('refuses a var() of a name that is neither on the list nor in tokens.css, and takes one in tokens.css', () => {
    expect(refusals([aTheme('test', (values) => { values['--bg'] = 'var(--font-mono)' })])).toEqual([])
    expect(refusals([aTheme('test', (values) => { values['--bg'] = 'var(--nowhere)' })])).toEqual([
      'The theme "test" gives --bg a value that reads var(--nowhere), which is neither a style name nor a name tokens.css declares.',
    ])
  })

  it('refuses an id used twice', () => {
    expect(refusals([aTheme('test'), aTheme('test')])).toEqual([
      'The theme "test" is listed twice; each theme needs its own id.',
    ])
  })

  it.each(['auto', 'light', 'dark'])('refuses the id %s, which tokens.css already draws', (id) => {
    expect(refusals([aTheme(id)])).toEqual([`The theme "${id}" has the id of a look tokens.css already draws.`])
  })

  it.each(['Paper', 'paper grey', 'paper-', "paper'"])('refuses the id %j, which is not lowercase words joined by hyphens', (id) => {
    expect(refusals([aTheme(id)])).toEqual([
      `The theme "${id}" has an id that is not lowercase letters and digits joined by hyphens.`,
    ])
  })

  it('refuses a color-scheme other than light or dark', () => {
    expect(refusals([aTheme('test', (values) => { values['color-scheme'] = 'light dark' })])).toEqual([
      'The theme "test" gives color-scheme the value "light dark"; it must be light or dark.',
    ])
  })

  it('names every fault in every theme at once', () => {
    expect(refusals([
      aTheme('one', (values) => { values['--bg'] = 'url(a)' }),
      aTheme('two', (values) => { delete values['--text'] }),
    ])).toEqual([
      'The theme "one" gives --bg a value that calls url(), which is not one of var, max, min, calc, rgb, rgba, translate and rotate.',
      'The theme "two" has no value for --text.',
    ])
  })
})
