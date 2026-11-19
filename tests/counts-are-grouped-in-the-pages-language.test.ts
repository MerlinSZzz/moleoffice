// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE COUNTS ON THE EVERYTHING AND MESSAGES PAGES ARE GROUPED BY THOUSANDS, IN THE PAGE'S LANGUAGE.
 *
 * The inspector's note on round 6: the sentence under the Messages filters wrote "1234 of the 16557
 * messages" when a filter hid some, while the paging line under it wrote "16,557". And the
 * Everything page wrote "16557 records." and "Everything 16557" one line above "Showing 1 to 50 of
 * 16,557." (photographed at 1440, 27 September 2026). Every count on the two pages now goes through
 * `count` in src/shared/i18n.ts, which groups the digits the way the reader's language writes them.
 *
 * MUTATIONS, each red here:
 *   1. MessagesPage.tsx: pass `hidden: at.hidden` to the words instead of `count(at.hidden)`.
 *   2. RecordsPage.tsx: pass `count: String(n)` in `recordCount` instead of `count: count(n)`.
 *   3. src/shared/i18n.ts: make `count` return `String(n)`.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { count, setWordLanguage, t } from '../src/shared/i18n.ts'
import { hidingLine } from '../src/web/pages/MessagesPage.tsx'
import { countLine } from '../src/web/pages/RecordsPage.tsx'

afterEach(() => {
  setWordLanguage('en')
})

describe('the sentence under the Messages filters', () => {
  for (const language of ['en', 'zh'] as const) {
    it(`groups the counts in ${language} when a filter hides some messages`, () => {
      setWordLanguage(language)
      const said = hidingLine({ hidden: 12_345, total: 16_557, matched: 4_212, offset: 0, pageSize: 50 })
      expect(said).toBe(t('messages.hiding.some', { hidden: '12,345', total: '16,557' }))
      expect(said, 'the sentence is not in the page language').toBe(
        t('messages.hiding.some', { hidden: count(12_345), total: count(16_557) }),
      )
    })

    it(`groups the counts in ${language} when no filter hides any`, () => {
      setWordLanguage(language)
      const said = hidingLine({ hidden: 0, total: 16_557, matched: 16_557, offset: 1_000, pageSize: 50 })
      expect(said).toBe(t('messages.hiding.none', { total: '16,557', from: '1,001', to: '1,050' }))
    })
  }

  it('writes the Chinese sentence when the page is in Chinese', () => {
    setWordLanguage('zh')
    expect(hidingLine({ hidden: 12_345, total: 16_557, matched: 4_212, offset: 0, pageSize: 50 })).toContain('本项目 16,557 条消息中')
  })
})

describe('the count line on the Everything page', () => {
  it('groups the number of records', () => {
    expect(countLine({ loaded: 16_557, shown: 16_557, kind: '', query: '' })).toContain('16,557 records.')
  })
})
