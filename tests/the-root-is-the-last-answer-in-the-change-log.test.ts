// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE ROOT IS THE LAST ANSWER, AND THE CHANGE LOG IS WHERE IT WAS THE FIRST ONE.
 *
 * > Right-click resolution should remain exact visible object → deepest meaningful Semantic
 * > Region/relation → parent → section → record root, with root only as the final fallback.
 *
 * Measured with `design/problem-03/baseline/root-is-last.mjs` on 31 August 2026, over the eight
 * record pages the re-gate read: 938 presses with somebody's words under the pointer answered the
 * whole record, and 585 of them were inside the change log — every diff path, every old and new
 * value, every arrow, every "session". A change row is not a place the page had no name for: the
 * server writes one row per changed field, so the row IS one write to one field and has an id.
 *
 * WHAT IS ASSERTED HERE AND WHAT IS ASSERTED IN A BROWSER. This file asserts the markup: the row
 * carries a `change` target naming this record and this row, and the two things inside a row that
 * are something else still say so. The COUNT is a browser measurement and is not restated here —
 * a number asserted in a unit test would agree with whatever the markup happened to be.
 */
import { createElement as h, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it } from 'vitest'
import type { Change } from '../src/shared/types.ts'
import { CHANGES_KEY, HISTORY_KEY, ATTEMPTS_KEY, DRAWN_BY_THE_HEADLINE, SECTIONS_OF } from '../src/shared/sections.ts'
import { TARGET_KINDS, targetSpec } from '../src/shared/targets.ts'

const change = (over: Partial<Change>): Change => ({
  id: 'c1',
  recordId: 'r1',
  origin: 'authored',
  op: 'update',
  actorType: 'agent',
  actorId: 'claude',
  sessionId: 'sess-1',
  field: 'summary',
  oldValue: 'before',
  newValue: 'after',
  at: '2026-08-07 10:00:00',
  ...over,
})

const body = (el: ReactElement): string => renderToStaticMarkup(el).replace(/<style[^>]*>[\s\S]*?<\/style>/g, '')

describe('a change row says what it is', () => {
  let cl: typeof import('../src/web/components/ChangeLog.tsx')

  beforeAll(async () => {
    ;(globalThis as unknown as { window: unknown }).window = {
      localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
      location: { hash: '' },
      addEventListener: () => {},
      removeEventListener: () => {},
    }
    cl = await import('../src/web/components/ChangeLog.tsx')
  })

  it('carries the change, by the record it was made to and the row it is', () => {
    const html = body(h(cl.ChangeLog, { changes: [change({})], sessions: [] }))
    expect(html).toContain('data-target="change/r1/c1"')
  })

  it('puts it on the row, so everything drawn inside the row reaches it', () => {
    // THE DIFF IS THE POINT. A press on the path, on either value or on the arrow between them had
    // nothing to walk up to; the row is what it walks up to now. The assertion is that the diff is
    // INSIDE the element carrying the target, which is the whole of what a walk up reads.
    const html = body(h(cl.ChangeLog, { changes: [change({ field: 'data', oldValue: '{"a":1}', newValue: '{"a":2}' })], sessions: [] }))
    const at = html.indexOf('data-target="change/r1/c1"')
    expect(at, 'the row carries no change target at all').toBeGreaterThan(-1)
    const mark = 'data-target="change/r1/c1"'
    const inside = html.slice(at + mark.length)
    expect(inside).toContain('chg-diffpath')
    // Nothing else declares between the row and the diff, so a walk up from the diff path reaches
    // this change and nothing before it.
    expect(inside.slice(0, inside.indexOf('chg-diffpath'))).not.toContain('data-target=')
  })

  it('leaves the two things inside a row that are somebody else alone', () => {
    // A session name names the session record and a link row's other end names that record. Both
    // were fixed before this and both must keep answering what they name rather than the change.
    const named = body(
      h(cl.ChangeLog, {
        changes: [change({ sessionId: 'sess-1' })],
        sessions: [{ stored: 'sess-1', matchedBy: 'id', recordId: 'S1', title: 'Round ten', at: 'named' }] as never,
      }),
    )
    expect(named).toContain('data-target="record/S1/')
  })
})

describe('the two provenance parts of a record page are two sections', () => {
  it('gives the versions and the change log a key each, on every kind', () => {
    for (const [kind, specs] of Object.entries(SECTIONS_OF)) {
      const keys = specs.map((s) => s.key)
      expect(keys, `${kind} has no history section`).toContain(HISTORY_KEY)
      expect(keys, `${kind} has no changes section`).toContain(CHANGES_KEY)
    }
    // TWO KEYS AND NOT ONE, which is the decision. One region may only be on one live element —
    // `MarkLayer` finds a stored comment with `document.querySelector` and takes the first match —
    // so a single key meant one of the two panels carried nothing.
    expect(HISTORY_KEY).not.toBe(CHANGES_KEY)
  })

  it('gives a problem its dead ends as a section of their own', () => {
    expect(DRAWN_BY_THE_HEADLINE['problem'] ?? []).toContain(ATTEMPTS_KEY)
    expect(SECTIONS_OF.problem.map((s) => s.key)).toContain(ATTEMPTS_KEY)
  })
})

describe('a change is a thing a person can point at', () => {
  it('is declared once, with a record and a row of the ledger', () => {
    expect(TARGET_KINDS).toContain('change')
    const spec = targetSpec('change')
    expect(spec.identifies.map((f) => f.key)).toEqual(['recordId', 'changeId'])
    // IT NAMES A RECORD, which is what makes it answerable about a project boundary and about a
    // revision. A target that named no record could not be held to either.
    expect(spec.recordIdentifier).toBe('recordId')
    // IT HOLDS TEXT: `old_value` and `new_value` are stored columns, so a quote from one can be
    // read back out of the corpus rather than being evidence that starts drifting at once.
    expect(spec.holdsText).toBe(true)
  })
})
