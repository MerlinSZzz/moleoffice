// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE ACTING-FOR-YOU LINE IS JOINED BY ONE SPACING RULE, IN CHINESE AND IN ENGLISH.
 *
 * The agent page's line says who a secretary is acting for and until when. Its head is three parts and
 * its end one of five things, and every join is `gapBetween`'s answer (src/shared/spacing.ts), worked
 * out by `theEndOfTheLine` in src/web/lib/acting-line.ts. A check of the queue found two joins that
 * followed another rule: a grant that ends with a piece of work read 直到 “标题”完成, with a space
 * before the opening quotation mark, and a time never stored was joined to the absence mark with a
 * space typed into the page. This file holds both ends, in both languages, and holds the page to
 * drawing only what the helper returns.
 *
 * MUTATIONS, proved on 2 October 2026:
 *   - the quotation-mark branch taken out of `gapBetween`: the Chinese piece-of-work case goes red,
 *     reading 直到 “…”;
 *   - the never-stored branch taken out of `theEndOfTheLine`, so a time never stored is drawn as
 *     stored: the never-stored case goes red;
 *   - `{' '}` typed back before `<Absence />` in GrantEnd in src/web/components/TheirCard.tsx: the
 *     last case goes red. A dash is spaced like a word in both languages, so the typed space and
 *     `gapBetween` agree on the screen today; the last case is what keeps the page to one rule.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { setWordLanguage } from '../src/shared/i18n.ts'
import type { ElevationHeld } from '../src/shared/roles.ts'
import { actingForHead, theEndOfTheLine, type TheWorkItEndsWith } from '../src/web/lib/acting-line.ts'

const NOW = Date.UTC(2026, 9, 2, 9, 0)

/** A made-up grant; only the fields the line reads matter. */
function aGrant(endsWhen: string, until: string | null): ElevationHeld {
  return { id: 'made-up-grant', endsWhen, until, untilInWords: 'until a made-up moment', grantedAt: '2026-10-02 08:00:00', grantedBy: 'made-up-person' } as unknown as ElevationHeld
}

/** The whole line as a reader sees it: the head, the separator and the end's words. */
function theLine(actingFor: string, held: ElevationHeld, work: TheWorkItEndsWith | null): string {
  const head = actingForHead(actingFor)
  const end = theEndOfTheLine(head, held, 'UTC', { inspect: false, work, now: NOW })
  return head + end.gap + end.words
}

const WORK = aGrant('when a piece of work ends', 'made-up-record')

afterEach(() => setWordLanguage('en'))

describe('the acting-for-you line', () => {
  it('ends with a piece of work: no space beside the quotation mark in Chinese, one in English', () => {
    setWordLanguage('zh')
    expect(theLine('Morgan Vale', WORK, { id: 'made-up-record', title: 'Made-up kiln log' })).toBe('正在代替 Morgan Vale 直到“Made-up kiln log”完成')
    expect(theLine('Morgan Vale', WORK, { id: 'made-up-record', title: '修好窑门' })).toBe('正在代替 Morgan Vale 直到“修好窑门”完成')
    setWordLanguage('en')
    expect(theLine('Morgan Vale', WORK, { id: 'made-up-record', title: 'Made-up kiln log' })).toBe('Acting for Morgan Vale until “Made-up kiln log” is finished')
  })

  it('ends at a time never stored: the absence mark, joined by the same rule as a word', () => {
    const neverStored = aGrant('at a time', null)
    setWordLanguage('zh')
    const zh = theEndOfTheLine(actingForHead('Morgan Vale'), neverStored, 'UTC', { inspect: false, work: null, now: NOW })
    expect(zh.draw).toBe('absent')
    expect(theLine('Morgan Vale', neverStored, null)).toBe('正在代替 Morgan Vale 直到 —')
    setWordLanguage('en')
    expect(theLine('Morgan Vale', neverStored, null)).toBe('Acting for Morgan Vale until —')
  })

})
