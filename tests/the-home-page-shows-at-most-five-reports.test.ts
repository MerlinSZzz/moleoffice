// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE HOME PAGE'S REPORTS SECTION SHOWS FIVE, AND SAYS WHERE THE REST ARE.
 *
 * ---------------------------------------------------------------------------------------
 * THE RULE
 * ---------------------------------------------------------------------------------------
 *
 * The home page was showing too many reports, and five is the cap. So the band draws the newest
 * five reports waiting to be read, and when there are more it says exactly how many are past the
 * cap and gives one press that leads to the page holding all of them.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS ASSERTED, AND WHAT THE MUTATION IS
 * ---------------------------------------------------------------------------------------
 *
 * The cap and the order are checked on `newestReports`, which is pure, and on the markup the band
 * actually renders. Seven reports filed, newest first: five rows and a line saying "5 of 7 reports
 * shown" with a link to the Reports and notes page. Three reports: three rows and no line at all,
 * because nothing was cut.
 *
 * THE MUTATION THAT PROVES THIS TEST CAN FAIL: delete the `.slice(0, cap)` in `newestReports` and
 * run this file. Seven are drawn where five are asserted, and the "5 of 7 reports shown" line is
 * gone, so the two tests that count the rows and read that line go red. Put the slice back and
 * they are green again. That is the proof this file is about the cap and not about a coincidence.
 *
 * The band is rendered to static markup, the way tests/report-findable.test.ts does it, because
 * the runner has no DOM. That proves the band's own rule. That HOME draws the band, capped at five,
 * directly under Needs you, is proved on the page itself by
 * tests/home-keeps-what-the-old-home-owed.test.ts (wave 13k's round 16, after check l3MN04jpFPhK
 * found this file passing while the band was on no page).
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it } from 'vitest'
import { computeAttention, type AttentionResult } from '../src/shared/attention.ts'
import type { Link, PanelRecord, RecordKind } from '../src/shared/types.ts'
import { attentionFirstPage } from '../src/shared/attention-first-page.ts'

type AP = typeof import('../src/web/components/AttentionPanel.tsx')

let ap: AP

const NOW = new Date(2026, 8, 12, 12, 0, 0).getTime()

beforeAll(async () => {
  const store = new Map<string, string>()
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  }
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: storage,
    sessionStorage: storage,
    location: { hash: '' },
    addEventListener: () => {},
    removeEventListener: () => {},
  }
  ap = await import('../src/web/components/AttentionPanel.tsx')
})

// ---------------------------------------------------------------------------- the fixture

function stamp(daysAgo: number): string {
  const d = new Date(NOW - daysAgo * 24 * 60 * 60 * 1000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${String(d.getHours()).padStart(2, '0')}:${pad(d.getMinutes()).padStart(2, '0')}:00`
}

function report(id: string, title: string, filedDaysAgo: number): PanelRecord {
  return {
    id,
    kind: 'report' as RecordKind,
    workspaceId: 'default',
    ownerId: THE_TEST_OFFICES_OWNER.id,
    title,
    summary: null,
    data: { for: THE_TEST_OFFICES_OWNER.name, date: '2026-09-01', read: 'unread', blocks: [] },
    createdAt: stamp(filedDaysAgo),
    updatedAt: stamp(filedDaysAgo),
    deletedAt: null,
  }
}

const LINKS: Link[] = []

function ruleOver(records: PanelRecord[]): AttentionResult {
  return computeAttention({ now: NOW, records, links: LINKS, changes: [], resources: [], dueMs: () => null })
}

/** The rule's answer dressed as the route dresses Home's first page, so the band is handed what the browser gets. */
function reply(result: AttentionResult): import('../src/web/api.ts').AttentionHome {
  return {
    ...attentionFirstPage(result),
    at: '2026-09-12 12:00:00',
    read: { records: 0, links: 0, changes: 0, changesCapped: false },
  }
}

function section(records: PanelRecord[]): string {
  return renderToStaticMarkup(
    h(ap.ReportsForYou, { reply: reply(ruleOver(records)), onMarkedRead: () => {} }),
  )
}

/** One `att-rep` row per report drawn. The inner class names all extend it, so the quote matters. */
function rows(html: string): number {
  return (html.match(/class="att-rep"/g) ?? []).length
}

/** Seven reports, filed one a day apart: `newest-1` was filed today and `newest-7` six days ago. */
const SEVEN = Array.from({ length: 7 }, (_, i) => report(`rep-${i + 1}`, `report newest-${i + 1}`, i))

// ============================================================================ the cap, pure

describe('which reports the home page draws', () => {
  it('draws at most five, and the newest of them first', () => {
    const waiting = ruleOver(SEVEN).reports ?? []
    const shown = ap.newestReports(waiting, 5)
    expect(shown).toHaveLength(5)
    expect(shown.map((row) => row.title)).toEqual([
      'report newest-1',
      'report newest-2',
      'report newest-3',
      'report newest-4',
      'report newest-5',
    ])
  })

  it('uses the record id to break a tie, so the order does not move between two draws', () => {
    const sameStamp = [
      report('rep-b', 'report b', 1),
      report('rep-a', 'report a', 1),
    ]
    const byKey = ap.newestReports(ruleOver(sameStamp).reports ?? [], 5)
    expect(byKey.map((row) => row.recordId)).toEqual(['rep-a', 'rep-b'])
    // The other way round in, the same way out: the order is the rule's and not the array's.
    const reversed = ap.newestReports(ruleOver([...sameStamp].reverse()).reports ?? [], 5)
    expect(reversed.map((row) => row.recordId)).toEqual(['rep-a', 'rep-b'])
  })
})

// ============================================================================ what is drawn

describe('the Reports section with more than five waiting', () => {
  it('draws five rows and not one more', () => {
    const html = section(SEVEN)
    expect(rows(html)).toBe(5)
    expect(html).toContain('report newest-1')
    expect(html).toContain('report newest-5')
    // The two past the cap are not drawn as rows, and are named by the count instead.
    expect(html).not.toContain('report newest-6')
    expect(html).not.toContain('report newest-7')
  })

  it('says exactly how many are past the cap, and gives one press to the full list', () => {
    const html = section(SEVEN)
    expect(html).toContain('5 of 7 reports shown')
    expect(html).toContain('waiting to be read')
    expect(html).toContain('href="#/notes"')
    expect(html).toContain('All reports and notes')
  })
})

describe('the Reports section with five or fewer waiting', () => {
  it('draws three rows and says nothing was cut', () => {
    const three = SEVEN.slice(0, 3)
    const html = section(three)
    expect(rows(html)).toBe(3)
    expect(html).toContain('report newest-1')
    expect(html).toContain('report newest-3')
    // Nothing was cut, so nothing may say anything was.
    expect(html).not.toContain('reports shown')
    expect(html).not.toContain('waiting to be read')
    expect(html).not.toContain('All reports and notes')
  })

  it('draws five rows and no line when there are exactly five', () => {
    const five = SEVEN.slice(0, 5)
    const html = section(five)
    expect(rows(html)).toBe(5)
    expect(html).not.toContain('reports shown')
  })
})
