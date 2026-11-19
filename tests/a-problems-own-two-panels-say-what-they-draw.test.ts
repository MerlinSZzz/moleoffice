// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE TWO PANELS A PROBLEM PAGE DRAWS ABOVE ITS BODY SAY WHICH PART OF THE RECORD THEY ARE.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS WRONG, MEASURED
 * ---------------------------------------------------------------------------------------
 *
 * A person right-clicks a panel and the browser walks UP the document until it finds an element
 * that says what it is. Two panels on a problem page said nothing, so the walk ran past them to the
 * whole record. Measured on `a62SOh9fsPe5` on 31 August 2026 with
 * `design/problem-03/baseline/root-is-last.mjs`:
 *
 *   Who made this, and whose move it is   5 presses — the heading, *Filed by an agent*, the filer's
 *                                         own name, *Needs an agent*, and the sentence under it
 *   What breaks                           2 presses — the heading, and the 1,535 characters of
 *                                         somebody's own writing about what goes wrong
 *
 * Criterion 8 of `design/problem-03/ACCEPTANCE.md` names the first of the two by what it is:
 * *provenance/history each carry their own target*. Who filed a record is provenance.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS IS NOT COVERED BY THE TESTS THAT EXIST
 * ---------------------------------------------------------------------------------------
 *
 * `tests/the-summary-and-the-options-are-parts-of-the-record.test.ts` checks the two tables in
 * src/shared/sections.ts against each other and never renders, so it would pass with a panel that
 * took the declaration and dropped it. This renders the panels and reads the attribute the browser would walk to.
 *
 * ---------------------------------------------------------------------------------------
 * THE THIRD TEST IS THE ONE THAT WOULD FAIL SILENTLY
 * ---------------------------------------------------------------------------------------
 *
 * A problem with no `symptom` written still draws *What breaks*, with "Nobody has written what goes
 * wrong" inside it. If that panel declared `section.symptom` anyway, the press would name a region
 * the tree does not hold, the server would answer `gone`, and the person would be told the part
 * they are looking at is not there. `sectionsOf` is what stops that, by reading the same
 * `sectionsOnThisRecord` the tree is built from, and this file checks it on the panel rather than
 * on the function.
 */

import { describe, expect, it, vi } from 'vitest'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import type { PanelRecord, RecordKind } from '../src/shared/types.ts'
import { SYMPTOM_KEY, WHOSE_MOVE_KEY } from '../src/shared/sections.ts'
import { KIND_SPECS } from '../src/shared/kinds.ts'
import { sectionsOf } from '../src/web/components/sections.ts'

type Page = typeof import('../src/web/pages/RecordPage.tsx')

/** A window, so the modules that read a setting at import time can be imported at all. */
async function boot() {
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
  vi.resetModules()
  return { page: (await import('../src/web/pages/RecordPage.tsx')) as Page }
}

const NOW = '2026-08-10 09:00:00'
const ID = 'rec-1'

function record(kind: RecordKind, data: Record<string, unknown>): PanelRecord {
  return {
    id: ID,
    workspaceId: 'panelx',
    kind,
    title: 'A record',
    summary: null,
    data,
    origin: 'authored' as const,
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
    ownerId: THE_TEST_OFFICES_OWNER.id,
  }
}

function detailProps(rec: PanelRecord, over: Record<string, unknown> = {}) {
  return {
    record: rec,
    editable: true,
    records: [rec],
    detailLinks: [],
    relations: [],
    evolutionLinks: [],
    log: { changes: [], sessions: [] },
    titles: ['A record'],
    titleById: new Map([[ID, 'A record']]),
    unfilledByRecord: new Map<string, number>(),
    body: [],
    onChanged: () => {},
    ...over,
  }
}

/** The region ids this markup declares, in the order they were written. */
function targets(markup: string): string[] {
  return [...markup.matchAll(/data-target="([^"]+)"/g)].map((m) => decodeURIComponent(m[1] as string))
}

const region = (regionId: string): string => `region/${ID}/${regionId}`

/**
 * DOES THIS KIND DECLARE THIS FIELD? The same reading `RecordPage` makes before it draws the panel,
 * from the same declaration. `kindDeclares` there is a local helper this file cannot import, so the
 * question is asked of `KIND_SPECS` — which is what that helper reads — rather than restated as a
 * list of kinds here.
 */
const declaresField = (kind: RecordKind, key: string): boolean =>
  KIND_SPECS[kind].fields.some((f) => f.key === key)

/** The change-ledger reading the panel is handed: an agent filed this record. */
const FILED_BY_AN_AGENT = {
  status: 'ready',
  value: {
    standingAt: { id: ID, kind: 'problem', title: 'A record', filedBy: { actorType: 'agent', actorId: 'claude-x' } },
  },
}

// ============================================================================ what breaks

const WROTE = 'Two dev stacks run against the same tree and both restart on one edit.'

describe('What breaks says it is the problem’s symptom, and not the whole problem', () => {
  it('carries section.symptom when somebody has written what goes wrong', async () => {
    const { page } = await boot()
    const rec = record('problem', { [SYMPTOM_KEY]: WROTE })
    const html = renderToStaticMarkup(h(page.RecordDetail, detailProps(rec) as never))
    expect(html, 'the panel did not draw the words it is being asked about').toContain(WROTE)
    expect(targets(html), 'the What breaks panel still says nothing').toContain(region(`section.${SYMPTOM_KEY}`))
  })

  it('puts it on exactly one element, because one region may only be on one', async () => {
    // `MarkLayer` finds a stored comment's element with `document.querySelector`, which takes the
    // FIRST match — so two elements carrying one id would paint somebody's comment on the wrong one.
    const { page } = await boot()
    const said = targets(
      renderToStaticMarkup(h(page.RecordDetail, detailProps(record('problem', { [SYMPTOM_KEY]: WROTE })) as never)),
    )
    const found = said.filter((one) => one === region(`section.${SYMPTOM_KEY}`))
    expect(found.length, `section.symptom is on ${String(found.length)} elements`).toBe(1)
  })

  it('says nothing when nobody has written one, so the walk carries on to the record', async () => {
    const { page } = await boot()
    const html = renderToStaticMarkup(h(page.RecordDetail, detailProps(record('problem', {})) as never))
    expect(html, 'the panel stopped drawing its own absence').toContain('Nobody has written what goes wrong')
    expect(targets(html), 'a region the record does not have was named on the screen').not.toContain(
      region(`section.${SYMPTOM_KEY}`),
    )
  })
})

// ============================================================================ who made this

describe('Who made this, and whose move it is says which part of the record it is', () => {
  it('carries section.whoseMove on every kind that declares the field', async () => {
    const { page } = await boot()
    for (const kind of ['problem', 'task', 'idea', 'direction'] as RecordKind[]) {
      expect(declaresField(kind, 'whose_move'), `a ${kind} no longer declares whose_move`).toBe(true)
      const rec = record(kind, { whose_move: 'agent' })
      const html = renderToStaticMarkup(
        h(page.WhoseMoveSays, {
          record: rec,
          context: FILED_BY_AN_AGENT,
          declares: sectionsOf({ ...rec, relations: [] })(WHOSE_MOVE_KEY),
        } as never),
      )
      const said = targets(html)
      expect(said, `a ${kind}'s Who made this panel says nothing`).toContain(region(`section.${WHOSE_MOVE_KEY}`))
      expect(said.filter((one) => one === region(`section.${WHOSE_MOVE_KEY}`)).length).toBe(1)
    }
  })

  it('carries it over an unwritten field too, because the panel is still drawn', async () => {
    // THIS IS THE OPPOSITE READING FROM *What breaks* ABOVE AND THE DIFFERENCE IS THE PANEL. A
    // problem with no symptom draws an absence and nothing else. This panel draws who filed the
    // record whatever the field holds, and draws the broken ring beside it — so it is on the page
    // on every record of these four kinds, and `sectionsOnThisRecord` says so without asking
    // `isWritten`.
    const { page } = await boot()
    const rec = record('problem', {})
    const html = renderToStaticMarkup(
      h(page.WhoseMoveSays, {
        record: rec,
        context: FILED_BY_AN_AGENT,
        declares: sectionsOf({ ...rec, relations: [] })(WHOSE_MOVE_KEY),
        // BY THE NAME THE REGISTRY GIVES (criterion change, wave 13k round 34): the panel names who filed the
        // record as a person knows them, from the registry the page hands it; the handle is developer mode's.
        participants: { people: [], agents: [{ id: 'filer-row', handle: 'claude-x', name: 'Odile Varga' }] },
      } as never),
    )
    expect(html, 'the panel stopped naming who filed the record').toContain('Odile Varga')
    expect(targets(html)).toContain(region(`section.${WHOSE_MOVE_KEY}`))
  })

  it('is declared by no kind that does not draw the panel, and asking throws', async () => {
    // `RecordPage` asks `declaresField(kind, 'whose_move')` before drawing the panel. If the section
    // were declared on a kind whose page has no panel, the tree would hold a region for a box that
    // is on no screen — the silent falsehood this cluster exists to remove. A mistyped key is loud
    // instead: `sectionsOf` throws on the screen.
    await boot()
    for (const kind of ['note', 'report', 'block', 'claim'] as RecordKind[]) {
      expect(declaresField(kind, 'whose_move'), `a ${kind} now declares whose_move`).toBe(false)
      const rec = record(kind, {})
      expect(() => sectionsOf({ ...rec, relations: [] })(WHOSE_MOVE_KEY)).toThrow(/declares no such section/)
    }
  })
})
