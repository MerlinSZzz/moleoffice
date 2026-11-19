// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE RECORD PAGE COUNTS A DUE MOMENT WITH A TIME OF DAY BY CALENDAR DATES, AS THE WORK PAGE AND HOME DO.
 *
 * Round 27b made a due moment with a time of day late by calendar dates: due yesterday at 17:00 is "1 day late" at
 * any hour today, and a bare date is due at the end of its day (src/shared/deadlines.ts, `dueCount`). The record
 * page's deadline view (`DeadlineOutlookView` in src/web/pages/RecordPage.tsx) reads the stored stamp with
 * `readDueStamp` and passes its form on. Round 27b tested the work chip and Home and not this page; the check that
 * refused it (YnrMgv42zsdU) asked for this test.
 *
 * Held here, on a real outlook built by `deadlineOutlook` and the view drawn with react-dom/server, as
 * tests/deadline-panel.test.ts draws it: due 17 September 2026 at 17:00 reads "1 day late" on 18 September late in
 * the evening and early in the morning, in English and in Chinese; due 17 September as a bare date reads "under a
 * day late" on the evening of the 18th, because the date was due at the end of the 17th.
 *
 * MUTATION: the view passes 'a date' whatever was stored. The timed cases read "under a day late" and are red.
 *
 * Since wave 13q's round 28 the view draws `latePhrase`'s words, the chip's and Home's, so Chinese says late as
 * 逾期 here too. MUTATION: the view's own late words (g2b.deadline.late, 已迟) put back. The Chinese case is red.
 */
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeAll, expect, it } from 'vitest'
import { deadlineOutlook } from '../src/shared/deadlines.ts'
import { readDue } from '../src/shared/work.ts'
import { parseDueStamp } from '../src/web/lib/attention.ts'
import { setWordLanguage } from '../src/shared/i18n.ts'

type RecordPage = typeof import('../src/web/pages/RecordPage.tsx')
let rp: RecordPage

beforeAll(async () => {
  // RecordPage reaches api.ts and router.tsx, which touch `window` while they load; the same stand-in
  // tests/deadline-panel.test.ts uses. Nothing here is under test.
  const store = new Map<string, string>()
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
    location: { hash: '' },
    addEventListener: () => {},
    removeEventListener: () => {},
  }
  rp = await import('../src/web/pages/RecordPage.tsx')
})

afterEach(() => setWordLanguage('en'))

/** What the deadline view says, as text, for a stored due read at a local moment. */
function theDeadlineLine(storedDue: string, now: Date): string {
  const outlook = deadlineOutlook({
    now: now.getTime(),
    due: readDue({ due: storedDue }),
    dueMs: parseDueStamp,
    horizon: 'week',
    work: [],
    allocations: [],
    capacity: [],
  })
  const markup = renderToStaticMarkup(h(rp.DeadlineOutlookView, { outlook, asked: [], nameFor: () => null }))
  return markup.replace(/<style[^>]*>[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
}

const EVENING_AFTER = new Date(2026, 8, 18, 23, 0, 0)
const MORNING_AFTER = new Date(2026, 8, 18, 8, 0, 0)

it('reads due yesterday at 17:00 as 1 day late, late in the evening and early in the morning', () => {
  for (const now of [EVENING_AFTER, MORNING_AFTER]) {
    const line = theDeadlineLine('2026-09-17 17:00', now)
    expect(line, now.toString()).toContain('1 day late')
    expect(line, now.toString()).not.toContain('under a day')
  }
})

it('says the same in Chinese, with the one word for late the chip and Home use: 逾期 1 天', () => {
  setWordLanguage('zh')
  const line = theDeadlineLine('2026-09-17 17:00', EVENING_AFTER)
  expect(line).toContain('逾期 1 天')
  expect(line).not.toContain('不到一天')
  // ROUND 28: the page said 已迟 1 天, a second Chinese word for late, from its own words (g2b.deadline.late).
  expect(line).not.toContain('已迟')
  expect(theDeadlineLine('2026-09-17', EVENING_AFTER)).toContain('逾期 1 天')
})

it('reads a bare date due yesterday as 1 day late, the calendar days since the due date (round 31)', () => {
  expect(theDeadlineLine('2026-09-17', EVENING_AFTER)).toContain('1 day late')
  expect(theDeadlineLine('2026-09-17', EVENING_AFTER)).not.toContain('under a day')
})
