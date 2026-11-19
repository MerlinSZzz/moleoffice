// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * EVERY THEME SETS ALL 201 STYLE NAMES, AND THE LIGHT BLOCK'S 140 ARE READ FROM tokens.css.
 *
 * A theme's rule sits on top of the light block, so a name a theme leaves out is drawn in Light's
 * value without anything saying so. Under Warm night that is a light colour on a dark page. So
 * each theme must carry every name on the list, and the list must hold every name the light block
 * sets. The 140 are read here out of tokens.css itself, so a name added to the light block and not
 * to the list turns this red.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { LIGHT_BLOCK_NAMES, STYLE_NAMES, TOKENS_CSS_NAMES } from '../src/shared/theme-style-names.ts'
import { THEMES, themeRule } from '../src/shared/themes.ts'

const TOKENS = readFileSync(new URL('../src/web/tokens.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
const DECLARED = /(?:^|[{;\s])(--[a-z0-9-]+)\s*:/g

function theLightBlocksNames(): string[] {
  const start = TOKENS.indexOf(":root,\n:root[data-theme='light'] {")
  if (start < 0) throw new Error('tokens.css has no light block opening with ":root, :root[data-theme=\'light\'] {".')
  const body = TOKENS.slice(TOKENS.indexOf('{', start) + 1, TOKENS.indexOf('\n}', start))
  return [...body.matchAll(DECLARED)].map((found) => found[1] as string)
}

/** Each declaration in a rule, as name and value. */
function declarationsIn(rule: string): Map<string, string> {
  const body = rule.slice(rule.indexOf('{') + 1, rule.lastIndexOf('}'))
  const found = new Map<string, string>()
  for (const line of body.split('\n')) {
    const text = line.trim()
    if (text === '') continue
    const colon = text.indexOf(':')
    found.set(text.slice(0, colon).trim(), text.slice(colon + 1).replace(/;$/, '').trim())
  }
  return found
}

describe('the style names a theme sets', () => {
  it("begin with the light block's 140 names, in tokens.css's order", () => {
    const read = theLightBlocksNames()
    expect(read).toHaveLength(140)
    expect([...LIGHT_BLOCK_NAMES]).toEqual(read)
  })

  it('and a var() in a theme may also read any name tokens.css declares, which is this list', () => {
    const declared = [...new Set([...TOKENS.matchAll(DECLARED)].map((found) => found[1] as string))].sort()
    expect([...TOKENS_CSS_NAMES].sort()).toEqual(declared)
  })
})

describe('each of the six themes', () => {
  it.each(THEMES.map((theme) => [theme.id, theme] as const))('%s has a value for all 201 names and for no other', (_id, theme) => {
    expect(Object.keys(theme.values).sort()).toEqual([...STYLE_NAMES].sort())
  })

  it.each(THEMES.map((theme) => [theme.id, theme] as const))("%s's rule declares all 201 names, each with the theme's value", (_id, theme) => {
    const declared = declarationsIn(themeRule(theme))
    const wrong = STYLE_NAMES.filter((name) => declared.get(name) !== theme.values[name])
    expect(wrong).toEqual([])
    expect(declared.size).toBe(201)
  })
})
