// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * EACH THEME BECOMES ONE CSS RULE, ON ITS OWN data-theme, AND NOTHING ELSE.
 *
 * The page loads the six rules in one style element. Each rule must match only the root element
 * when that theme is chosen, so its selector is :root[data-theme='<id>'], and it must hold
 * declarations and nothing else: no second selector, no nested block and no at-rule. That
 * selector has the same weight as tokens.css's :root[data-theme] block for more contrast, which
 * comes later and so wins, and less weight than the Chinese block's :root[data-theme]:lang(zh).
 */
import { describe, expect, it } from 'vitest'
import { STYLE_NAMES } from '../src/shared/theme-style-names.ts'
import { THEMES, themeRule } from '../src/shared/themes.ts'

describe('the rule for each theme', () => {
  it.each(THEMES.map((theme) => [theme.id, theme] as const))('%s is one rule on its own data-theme, with one line for each of the 201 names', (id, theme) => {
    const rule = themeRule(theme)
    const lines = rule.split('\n')
    expect(lines[0]).toBe(`:root[data-theme='${id}'] {`)
    expect(lines.at(-1)).toBe('}')
    expect([...rule].filter((character) => character === '{')).toHaveLength(1)
    expect([...rule].filter((character) => character === '}')).toHaveLength(1)
    expect(rule).not.toContain('@')
    const body = lines.slice(1, -1)
    expect(body.map((line) => line.slice(0, line.indexOf(':')).trim())).toEqual([...STYLE_NAMES])
    expect(body.filter((line) => !/^ {2}[a-z0-9-]+: [^;]+;$/.test(line))).toEqual([])
  })

  it('differs from every other theme by its selector', () => {
    const selectors = THEMES.map((theme) => themeRule(theme).split('\n')[0])
    expect(new Set(selectors).size).toBe(6)
  })
})
