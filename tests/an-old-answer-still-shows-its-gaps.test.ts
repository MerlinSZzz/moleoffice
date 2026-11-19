// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN OLD ANSWER STILL SHOWS ITS GAPS. Problem W5ixFnJb9VWc, wave 13r round 20, piece 2. Since round 17 the review pane
 * draws a review's gaps from their codes (`gapForms`), and since round 17b an answer without the codes is drawn whole.
 * But it was drawn with no gaps: an answer that carried only the older sentence list (`gaps`), as an answer made before
 * the codes existed does, told the person nothing was missing when something was.
 *
 * The pane now draws those sentences as the server wrote them, in every mode, and Developer mode says under them that
 * they are the office's own words. The scope's gaps, under "What this review collects", already fell back to their
 * sentences; the same part now draws both, so they are marked the same way.
 *
 * A static render, in English and in Chinese, in Normal and in Developer mode. The last case is the control on the
 * other side: an answer that carries the codes draws the word list's words, with no mark.
 *
 * Three-run proof (control, mutation, restore) is in round 20's report. The mutation: the review's gaps read
 * `(detail.gapForms ?? []).map` again, as before this round (the review's gaps red).
 */

import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import type { FoundMember, ReviewDetail, ReviewGap, ReviewView } from '../src/server/lib/reviews.ts'

const REVIEW_GAP = '1 comment (cmNoWriter01) has no recorded writer, so it is left out.'
const SCOPE_GAP = 'The report rpKilnLog001 was deleted.'
const NO_WRITER: ReviewGap = { code: 'noWriter', values: { n: 1 }, says: REVIEW_GAP }

/** A collected review of one comment, whose answer carries its gaps as sentences, and as codes only when asked. */
function detail(withCodes: boolean): ReviewDetail {
  const target = { kind: 'record', recordId: 'r1', workspaceId: 'panelx' }
  const member = {
    found: true,
    source: 'annotation',
    id: 'n1',
    body: 'The left shelf sagged by two millimetres.',
    context: { target },
    reading: { state: 'there', about: 'the report "Kiln log"', says: 'Still there, in the same place.' },
    created: '2026-10-06 01:00:00',
    createdBy: `human:${THE_TEST_OFFICES_OWNER.id}`,
    key: 'record/r1/panelx',
    interpretation: null,
  } as unknown as FoundMember
  const whole = {
    review: {
      id: 'kScwD9LbAb5f',
      workspaceId: 'panelx',
      entry: { target },
      state: 'collected',
      started: '2026-10-06 01:10:00',
      startedBy: `human:${THE_TEST_OFFICES_OWNER.id}`,
      collectedAt: '2026-10-06 01:20:00',
      membershipFrozen: true,
      fromThreadId: null,
    } as unknown as ReviewView,
    rule: { kind: 'record', id: 'r1', says: 'Everything about that report.', gaps: [SCOPE_GAP] },
    members: [member],
    saved: [],
    count: 1,
    gaps: [REVIEW_GAP],
    organised: null,
    goesTo: { ground: 'nobody-recorded', recipient: null, name: null, elsewhere: [] },
    says: 'Collecting finished. 1 comment. Nothing has been sent.',
  } as Record<string, unknown>
  // WITHOUT THE KEYS AT ALL, not with them set to undefined: that is what an answer made before them is.
  if (withCodes) {
    whole['gapForms'] = [NO_WRITER]
    ;(whole['rule'] as Record<string, unknown>)['gapForms'] = [{ code: 'recordDeleted', values: {}, says: SCOPE_GAP }]
  }
  return whole as unknown as ReviewDetail
}

/** The whole pane, as a page in this language and this mode draws it, and the words it reads. */
async function pane(language: 'en' | 'zh', mode: 'normal' | 'inspect', withCodes = false) {
  const store = new Map<string, string>([['mole-office.mode', mode]])
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
  vi.resetModules()
  const i18n = await import('../src/shared/i18n.ts')
  const bar = await import('../src/web/components/agent/ReviewBar.tsx')
  i18n.setWordLanguage(language)
  const html = renderToStaticMarkup(h(bar.PaneWhole, { detail: detail(withCodes), notes: null, showing: { state: 'none' } as never }))
  const parts = (part: string): string[] =>
    [...html.matchAll(new RegExp(`<p[^>]*data-part="${part}"[^>]*>([^<]*)</p>`, 'g'))].map((m) => m[1] ?? '')
  return { html, parts, t: i18n.createI18n(language).t }
}

describe('a review whose answer carries its gaps as sentences only', () => {
  it.each(['en', 'zh'] as const)('%s: draws the review’s gaps and the scope’s as the server wrote them', async (lang) => {
    const { html, parts } = await pane(lang, 'normal')
    expect(html).not.toContain('data-code="noWriter"')
    expect(parts('review-gap'), 'the review’s gaps are not drawn').toEqual([REVIEW_GAP])
    expect(parts('scope-gap'), 'the scope’s gaps are not drawn').toEqual([SCOPE_GAP])
    // THE SENTENCES ARE THE SERVER'S ENGLISH, and say so to a screen reader on a Chinese page.
    expect(html.match(/<p[^>]*data-said="server"[^>]*lang="en"/g) ?? []).toHaveLength(2)
  })

  it.each(['en', 'zh'] as const)('%s: says whose words they are in Developer mode only', async (lang) => {
    const normal = await pane(lang, 'normal')
    expect(normal.parts('gaps-in-servers-words'), 'the mark is drawn outside Developer mode').toEqual([])
    const developer = await pane(lang, 'inspect')
    expect(developer.parts('review-gap')).toEqual([REVIEW_GAP])
    // ONE MARK UNDER THE REVIEW'S GAPS AND ONE UNDER THE SCOPE'S, each in the page's language.
    expect(developer.parts('gaps-in-servers-words')).toEqual([
      developer.t('review.pane.gapsInServersWords'),
      developer.t('review.pane.gapsInServersWords'),
    ])
  })

  it('draws the word list’s words, with no mark, when the answer carries the codes', async () => {
    const { html, parts, t } = await pane('en', 'normal', true)
    expect(parts('review-gap')).toEqual([t('review.gap.noWriter', { n: 1 })])
    expect(parts('scope-gap')).toEqual([t('review.scopeGap.recordDeleted')])
    expect(html).not.toContain('data-said="server"')
    expect((await pane('en', 'inspect', true)).parts('gaps-in-servers-words')).toEqual([])
  })
})
