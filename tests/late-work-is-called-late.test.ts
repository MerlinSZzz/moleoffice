// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * LATE WORK IS CALLED LATE, AND "NEEDS YOU" IS HOME'S WAITING QUEUE ALONE.
 *
 * Problem uyvrTRyshEJ6. "Needs you" (需要你) named two different lists: Home's waiting queue, which holds the
 * decisions and questions put to the person, and the work page's section of work past its date. Round 27b made
 * the two one Chinese word, wrongly, because they are two things. Since wave 13q's round 28 the work page calls
 * its section what it holds: Late, 逾期, the word the chip and Home use for a missed date.
 *
 * Held here, in English and in Chinese, on the work page drawn with late work in it and with none: the late
 * section's heading is Late or 逾期, its quiet line says nothing is late, and the page says "Needs you" or 需要你
 * nowhere. Home's heading keeps "Needs you".
 *
 * MUTATION: the work page's late section headed with Home's word, t('home.needsYou'), again. Red.
 *
 * Made-up projects and work only.
 */
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeAll, expect, it } from 'vitest'
import type { WorkspacesReply } from '../src/server/api/workspaces.ts'
import type { WorkListReply, WorkRow } from '../src/server/lib/worklist.ts'
import { setWordLanguage, t } from '../src/shared/i18n.ts'

type Page = typeof import('../src/web/pages/family/WorkPage.tsx')
let page: Page

beforeAll(async () => {
  // The page touches `window` while it loads; the same stand-in tests/work-to-do-designed-again.test.ts uses.
  const store = new Map<string, string>()
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  }
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: storage,
    sessionStorage: storage,
    location: { hash: '', search: '' },
    addEventListener: () => {},
    removeEventListener: () => {},
  }
  page = await import('../src/web/pages/family/WorkPage.tsx')
})

afterEach(() => setWordLanguage('en'))

/** Midday on 14 August 2026, local. */
const NOW = new Date(2026, 7, 14, 12, 0, 0).getTime()

const PROJECTS = {
  workspaces: [{ id: 'orchard', title: 'Hillside orchard', note: null, createdAt: '', updatedAt: '', records: 1, isDefault: false }],
} as unknown as WorkspacesReply

function owed(id: string, title: string, date: string): WorkRow {
  return {
    id, kind: 'obligation', title, name: title, within: null, summary: null, state: 'open', workspaceId: 'orchard',
    above: [], aboveStopped: null, parentsInOtherProjects: [], estimateHours: null, hoursGiven: [], origin: 'authored',
    incompleteCount: 0, due: { when: 'date', date },
  }
}

function page_(rows: WorkRow[]): string {
  const reply: WorkListReply = {
    rows,
    subtraction: { candidates: rows.length, carried: rows.length, leftOut: 0, shortened: 0 },
    leftOutGroups: [],
    counted: rows.length,
    returned: rows.length,
    cap: 2000,
    leftOut: 0,
    order: 'Rows are ordered by project.',
    kinds: ['obligation'],
    kindsBecause: 'Work here means the kinds under Work to do.',
    note: `${String(rows.length)} pieces of work.`,
  }
  return renderToStaticMarkup(h(page.WorkList, { reply, projects: PROJECTS, now: NOW }))
    .replace(/<style[^>]*>[\s\S]*?<\/style>/g, '')
}

/** The heading of the section that holds late work, read from its own markup. */
function lateHeading(html: string): string {
  const at = html.indexOf('data-section="late"')
  expect(at, 'the late section is drawn').toBeGreaterThan(-1)
  const head = html.slice(html.indexOf('<h2', at), html.indexOf('</h2>', at))
  return head.replace(/<span class="wk-count[\s\S]*$/, '').replace(/<[^>]+>/g, '').trim()
}

const LATE = [owed('o-1', 'Return the borrowed tiller', '2026-08-01'), owed('o-2', 'Pay the water bill', '2026-09-30')]
const NONE_LATE = [owed('o-2', 'Pay the water bill', '2026-09-30')]

it('heads the late section Late and 逾期, with late work in it and with none', () => {
  for (const [language, late, nothing] of [['en', 'Late', 'Nothing is late'], ['zh', '逾期', '没有逾期的工作']] as const) {
    setWordLanguage(language)
    expect(lateHeading(page_(LATE)), language).toBe(late)
    const quiet = page_(NONE_LATE)
    expect(lateHeading(quiet), language).toBe(late)
    expect(quiet, language).toContain(`<p class="wk-quiet">${nothing}</p>`)
  }
})

it('says "Needs you" and 需要你 nowhere on the work page, and Home keeps the words', () => {
  for (const language of ['en', 'zh'] as const) {
    setWordLanguage(language)
    const needsYou = t('home.needsYou')
    expect(needsYou, language).toBe(language === 'en' ? 'Needs you' : '需要你')
    for (const html of [page_(LATE), page_(NONE_LATE)]) {
      expect(html.toLowerCase(), language).not.toContain(needsYou.toLowerCase())
    }
  }
})
