// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A REVIEW WITHOUT ITS LIST OF GAPS IS DRAWN WHOLE, WITH NO GAPS. Wave 13r round 17 added `gapForms` to a
 * review (src/server/lib/reviews.ts, ReviewDetail) and the pane read it unguarded. A review without it, which
 * is an answer made before it existed or a review a test writes by hand, threw in PaneWhole, so the whole
 * pane was an error where the review should be. The merge found it in two other files (merge entry
 * xf_2jK-_Fjy_: tests/organising-is-reachable.test.ts and the seven-screens test, deleted on 12 November 2026).
 *
 * A static render, as those two were. The second case is the control on the other side: a review that
 * does carry the list still draws each gap, in the word list's English, so the guard did not drop them.
 *
 * Three-run proof (control, mutation, restore) is in round 17b's block of report eXwcW6MeULpy. The mutation:
 * the old read, `detail.gapForms.map`, put back.
 */

import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it } from 'vitest'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import type { FoundMember, ReviewDetail, ReviewGap, ReviewView } from '../src/server/lib/reviews.ts'
import { createI18n } from '../src/shared/i18n.ts'

type Bar = typeof import('../src/web/components/agent/ReviewBar.tsx')
let bar: Bar

beforeAll(async () => {
  // ReviewBar reads storage the first time it is imported, so the smallest stand-in goes in first. The same
  // stand-in is in tests/organising-is-reachable.test.ts.
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
  bar = await import('../src/web/components/agent/ReviewBar.tsx')
})

const NO_WRITER: ReviewGap = {
  code: 'noWriter',
  values: { n: 1 },
  says: '1 comment (cmNoWriter01) has no recorded writer, so it is left out.',
}

function detail(gapForms: ReviewGap[] | undefined): ReviewDetail {
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
    rule: { kind: 'record', id: 'r1', says: 'Everything about that report.', gaps: [] },
    members: [member],
    saved: [],
    count: 1,
    gaps: (gapForms ?? []).map((gap) => gap.says),
    organised: null,
    goesTo: { ground: 'nobody-recorded', recipient: null, name: null, elsewhere: [] },
    says: 'Collecting finished. 1 comment. Nothing has been sent.',
  } as Record<string, unknown>
  // WITHOUT THE KEY AT ALL, not with it set to undefined: that is what an answer made before it existed is.
  if (gapForms !== undefined) whole['gapForms'] = gapForms
  return whole as unknown as ReviewDetail
}

const pane = (d: ReviewDetail): string =>
  renderToStaticMarkup(h(bar.PaneBody, { detail: d, notes: null, showing: { state: 'none' } as never }))

describe('the review pane and a review without its list of gaps', () => {
  it('draws the review whole, with its comment and no gap, when the review carries no gapForms', () => {
    const d = detail(undefined)
    expect('gapForms' in d, 'the fixture carries the list, so this proves nothing').toBe(false)
    let drawn = ''
    expect(() => {
      drawn = pane(d)
    }, 'the pane threw on a review without gapForms').not.toThrow()
    expect(drawn, 'the comment is not drawn, so the pane is not whole').toContain('The left shelf sagged by two millimetres.')
    expect(drawn).not.toContain('data-part="review-gap"')
  })

  it('still draws each gap in the word list’s words when the review carries them', () => {
    const drawn = pane(detail([NO_WRITER]))
    expect(drawn).toContain('data-part="review-gap"')
    expect(drawn).toContain('data-code="noWriter"')
    expect(drawn).toContain(createI18n('en').t('review.gap.noWriter', { n: 1 }))
    expect(drawn, 'the server’s own sentence is drawn outside Developer mode').not.toContain('cmNoWriter01')
  })
})
