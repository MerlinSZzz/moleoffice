// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A THAI DAY IN WORDS WRITES THE WESTERN YEAR.
 *
 * Intl writes the Buddhist year for Thai by default: 1 November 2026 is "1 พฤศจิกายน 2569" under th-TH. The pages'
 * number stamps use the Gregorian year, so the office asks Thai for the Gregorian calendar in its locale line
 * (th-TH-u-ca-gregory), and a day in words on a Thai page says 2026.
 *
 * MUTATION: NUMBER_LOCALE.th back to "th-TH" makes the day say 2569 and this case red. Restore it and the case is green.
 */
import { afterEach, expect, it } from 'vitest'
import { count, pageLocale, setWordLanguage, writtenDay } from '../src/shared/i18n.ts'

afterEach(() => setWordLanguage('en'))

it('writes 1 November 2026 in Thai as 2026, never the Buddhist 2569, and keeps Western digits in a count', () => {
  setWordLanguage('th')
  const written = writtenDay(new Date(2026, 10, 1), { day: 'numeric', month: 'long', year: 'numeric' })
  expect(written).toContain('2026')
  expect(written).not.toContain('2569')
  expect(written).toContain('พฤศจิกายน')
  expect(written).toMatch(/[0-9]/u)
  expect(pageLocale()).toBe('th-TH-u-ca-gregory')
  expect(count(2569)).toBe('2,569')
})
