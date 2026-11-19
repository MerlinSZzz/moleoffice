// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A LATIN NAME OR A NUMBER BESIDE CHINESE TEXT TAKES A SPACE, AND THE CHINESE WORD READER GIVES IT.
 *
 * Wave 13n's round 33 (report GMFtAC2grPQg, block b-3) photographed the chat's red banner reading
 * "无法联系the-narrow-read-agent": the word '无法联系{who}' joined a Latin name straight to Chinese. 45 Chinese words did
 * the same with {name} or {who}. Since wave 13q's round 30 the Chinese word reader (`t` in src/shared/i18n.ts) fills
 * every value through `filledWithChineseSpacing` in src/shared/spacing.ts, by the secretary's answer HjwXM5tbTuN-. Since
 * round 30b that asks `gapBetween`, the office's one spacing rule, through `spacedAtValues`
 * (tests/the-word-reader-and-wordwithspacedvalues-give-one-answer.test.ts holds that the two readers agree):
 *   - a Latin letter, a digit or other non-Chinese text beside a Chinese character takes one space;
 *   - two Chinese characters take none, so a space typed between a Chinese value and Chinese text is taken out;
 *   - Chinese punctuation and quotation marks keep what the word writes.
 * English is filled exactly as it is written.
 *
 * MUTATION: the Chinese word reader filling values as written again (the `filledWithChineseSpacing` line in `t`). Red.
 */
import { afterEach, expect, it } from 'vitest'
import { setWordLanguage, t } from '../src/shared/i18n.ts'
import { en } from '../src/shared/words/en.ts'

afterEach(() => setWordLanguage('en'))

it('spaces a Latin name from Chinese in the chat banner, and joins a Chinese one', () => {
  setWordLanguage('zh')
  expect(t('chatLive.cannotReach', { who: 'the-narrow-read-agent' })).toBe('无法联系 the-narrow-read-agent')
  expect(t('chatLive.cannotReach', { who: '秘书' })).toBe('无法联系秘书')
})

it('keeps Chinese punctuation and quotation marks as the word writes them', () => {
  setWordLanguage('zh')
  expect(t('chat.writtenInProject', { name: 'Default' })).toBe('写于 Default。')
  expect(t('chat.writtenInProject', { name: '档案馆' })).toBe('写于档案馆。')
  expect(t('cannotReceive.quoted', { name: 'Bob' })).toBe('“Bob”')
})

it('takes out a typed space between a Chinese value and Chinese text', () => {
  setWordLanguage('zh')
  expect(t('settingsPanel.machineNames.savedNamed', { address: '192.0.2.44', name: '书房' })).toBe('192.0.2.44 已命名为书房。来自它的消息会显示“来自书房”。')
})

it('fills an English word exactly as it is written, whatever the value', () => {
  setWordLanguage('en')
  for (const who of ['the-narrow-read-agent', '秘书']) {
    expect(t('chatLive.cannotReach', { who })).toBe(en['chatLive.cannotReach'].replace('{who}', who))
  }
})
