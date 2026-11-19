// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE CHINESE WORD READER AND `wordWithSpacedValues` GIVE ONE ANSWER: THE OFFICE HAS ONE SPACING RULE.
 *
 * Check wYVnljDG-XQ8 refused wave 13q's round 30. Its `filledWithChineseSpacing` wrote its own rule for where a space
 * goes (a space only beside a Latin letter or digit) instead of asking `gapBetween`, so the Chinese reader `t` and
 * `wordWithSpacedValues` gave two answers for one word and one value: '无法联系Émile' against '无法联系 Émile', and the
 * same for '@handle', '(note)' and a space typed before a curly quotation mark. Since round 30b both fill a word
 * through `spacedAtValues` in src/shared/spacing.ts, which asks `gapBetween` at every edge where a value meets the
 * word's text, and where two values meet each other.
 *
 * Held here, over every Chinese word with a placeholder and the values below: `t` in Chinese gives exactly what
 * `wordWithSpacedValues` gives when it is handed the same Chinese word filled as it is written. And two placeholders
 * side by side are joined by the same rule: '已安排{floor}{planned}' with '至少' and '3 小时' reads '已安排至少 3 小时'.
 * And `gapBetween` knows which way a curly quotation mark faces: no space inside the marks (it gave '保存为“ Émile ”'),
 * and that an ellipsis joins what it follows (it gave '正在加载源文件索引 …').
 *
 * MUTATION: the Chinese reader deciding a space only beside a Latin letter or digit again, as round 30 did. Red.
 */
import { afterEach, expect, it } from 'vitest'
import { setWordLanguage, t, type WordKey } from '../src/shared/i18n.ts'
import { gapBetween, wordWithSpacedValues } from '../src/shared/spacing.ts'
import { zh } from '../src/shared/words/zh.ts'

afterEach(() => setWordLanguage('en'))

const VALUES = ['Émile', '@handle', '(note)', '“Kite”', '7', 'Morgan Vale', '秘书', '']

/** The Chinese word for a key, filled exactly as it is written: the reference `wordWithSpacedValues` spaces. */
function asWritten(key: string, values: Readonly<Record<string, string>>): string {
  const word = (zh as Record<string, unknown>)[key]
  const form = typeof word === 'string' ? word : String((word as { other: string }).other)
  return form.replace(/\{(\w+)\}/g, (mark, name: string) => (Object.hasOwn(values, name) ? values[name]! : mark))
}

it('gives one answer through t and through wordWithSpacedValues, for every Chinese word with a value', () => {
  setWordLanguage('zh')
  const differ: string[] = []
  for (const [key, word] of Object.entries(zh as Record<string, unknown>)) {
    const form = typeof word === 'string' ? word : word !== null && typeof word === 'object' && 'other' in word ? String((word as { other: string }).other) : ''
    const names = [...form.matchAll(/\{(\w+)\}/g)].map((found) => found[1]!)
    if (names.length === 0 || names.includes('n') || names.includes('count')) continue
    for (const value of VALUES) {
      const values = Object.fromEntries(names.map((name) => [name, value]))
      const read = t(key as WordKey, values)
      const ruled = wordWithSpacedValues(asWritten, key, values)
      if (read !== ruled) differ.push(`${key} with "${value}": t "${read}", the rule "${ruled}"`)
    }
  }
  expect(differ.slice(0, 20)).toEqual([])
})

it('spaces the values the check named, by gapBetween', () => {
  setWordLanguage('zh')
  expect(t('chatLive.cannotReach', { who: 'Émile' })).toBe('无法联系 Émile')
  expect(t('chatLive.cannotReach', { who: '@handle' })).toBe('无法联系 @handle')
  expect(t('chatLive.cannotReach', { who: '(note)' })).toBe('无法联系 (note)')
  expect(t('chatLive.cannotReach', { who: '秘书' })).toBe('无法联系秘书')
})

it('takes no space inside curly quotation marks or before an ellipsis, and one outside the marks beside Latin words', () => {
  // gapBetween learned in round 30b which way a curly mark faces: none after “ or ‘, none before ” or ’.
  expect(gapBetween('“', 'Émile')).toBe('')
  expect(gapBetween('Émile', '”')).toBe('')
  expect(gapBetween('until', '“Title”')).toBe(' ')
  expect(gapBetween('“Title”', 'is')).toBe(' ')
  expect(gapBetween('Bob', '’s')).toBe('')
  // An ellipsis joins what it follows, in both languages.
  expect(gapBetween('源文件索引', '…')).toBe('')
  expect(gapBetween('Loading', '…')).toBe('')
  setWordLanguage('zh')
  expect(t('nav.storedAs', { id: 'Émile' })).toBe('保存为“Émile”')
})

it('joins two placeholders side by side by the same rule', () => {
  setWordLanguage('zh')
  expect(t('home.weekCapacity', { hours: '8 小时', floor: '至少', planned: '3 小时' })).toBe('可用时间：8 小时 · 已安排至少 3 小时')
  expect(t('home.weekCapacity', { hours: '8 小时', floor: '', planned: '3 小时' })).toBe('可用时间：8 小时 · 已安排 3 小时')
})
