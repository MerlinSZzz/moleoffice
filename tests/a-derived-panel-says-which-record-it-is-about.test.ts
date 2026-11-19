// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PANELS MOLE OFFICE WORKS OUT ABOUT A RECORD SAY WHICH RECORD THEY ARE ABOUT.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS WRONG, MEASURED
 * ---------------------------------------------------------------------------------------
 *
 * A person right-clicks a panel and the browser walks UP the document until it finds an element
 * that says what it is. Six panels on a record page said nothing, so the walk ran past them to the
 * whole record. Measured on 31 August 2026 with `design/problem-03/baseline/root-is-last.mjs`, on
 * the eight record pages it reads:
 *
 *   Links                                    2 presses on every one of the eight pages
 *   Where this module stands                 11 presses on `cegP4HnIk9nd`
 *   Claimed source                           10 presses on `cegP4HnIk9nd`
 *   Reports about this module                 5 presses on `cegP4HnIk9nd`
 *   How this subsystem may evolve             4 presses on `cegP4HnIk9nd`
 *   Where this work sits, and how big it is   3 presses on `PiQzVdq42ufa`
 *
 * And inside the fork's own panel, three of its author's fields had no section at all: why it came
 * up, what it is based on, and when to revisit it — 25 presses across the two proposals.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS TEST IS NOT COVERED BY THE ONES THAT EXIST
 * ---------------------------------------------------------------------------------------
 *
 * `tests/sections.test.ts` checks the declaration and never renders. This renders each panel and
 * reads the attribute the browser would walk to.
 */

import { describe, expect, it, vi } from 'vitest'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import type { PanelRecord, RecordKind } from '../src/shared/types.ts'
import {
  CLAIMED_SOURCE_KEY,
  LINKS_KEY,
  MAY_EVOLVE_KEY,
  REPORTS_ABOUT_KEY,
  STANDING_KEY,
  WHERE_IT_SITS_KEY,
} from '../src/shared/sections.ts'
import { sectionsOf } from '../src/web/components/sections.ts'

type Page = typeof import('../src/web/pages/RecordPage.tsx')
type Gov = typeof import('../src/web/components/Governance.tsx')
type Links = typeof import('../src/web/components/LinkPanel.tsx')

/**
 * A window, so the modules that read a setting at import time can be imported at all. `search` is
 * the address's query, so `?mode=inspect` opens the page in developer mode.
 */
async function boot(search = '') {
  const store = new Map<string, string>()
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  }
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: storage,
    sessionStorage: storage,
    location: { hash: '', search },
    addEventListener: () => {},
    removeEventListener: () => {},
  }
  vi.resetModules()
  return {
    page: (await import('../src/web/pages/RecordPage.tsx')) as Page,
    gov: (await import('../src/web/components/Governance.tsx')) as Gov,
    links: (await import('../src/web/components/LinkPanel.tsx')) as Links,
  }
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

// ============================================================================ the module's four

/**
 * A MODULE, WITH ENOUGH WRITTEN ON IT TO DRAW ITS PAGE. `ModuleView` reads the implementation map
 * through `useAsync`, and `renderToStaticMarkup` runs no effects — so these panels draw their
 * unlanded state. That is the point: a panel must say which record it is about before it knows
 * what is in it, because a reader can right-click it in that state.
 */
const aModule = () =>
  record('module', {
    context: 'Why this exists.',
    summary: 'What it does today.',
    parts: [],
    claims: ['src/shared/work.ts'],
  })

describe('a module page names the four panels Mole Office works out about the module', () => {
  // CLAIMED SOURCE IS DRAWN IN DEVELOPER MODE ONLY, because it is repository paths (plan
  // 7FEOshq3mBGG, G2c). So the four are looked for in developer mode and the other three in both.
  const DRAWN_IN: Record<'' | '?mode=inspect', readonly string[]> = {
    '': [STANDING_KEY, REPORTS_ABOUT_KEY, MAY_EVOLVE_KEY],
    '?mode=inspect': [STANDING_KEY, REPORTS_ABOUT_KEY, CLAIMED_SOURCE_KEY, MAY_EVOLVE_KEY],
  }

  it('gives Where this module stands, Reports about this module, Claimed source and How this subsystem may evolve their own sections', async () => {
    for (const [search, keys] of Object.entries(DRAWN_IN)) {
      const { page } = await boot(search)
      const html = renderToStaticMarkup(h(page.RecordDetail, detailProps(aModule()) as never))
      const said = targets(html)
      for (const key of keys) {
        expect(said, `the "${key}" panel of a module still says nothing (${search || 'normal mode'})`).toContain(region(`section.${key}`))
      }
    }
  })

  it('puts each of the four on exactly one element, because one region may only be on one', async () => {
    // `MarkLayer` finds a stored comment's element with `document.querySelector`, which takes the
    // FIRST match — so two elements carrying one id would paint one person's comment on the wrong
    // one.
    for (const [search, keys] of Object.entries(DRAWN_IN)) {
      const { page } = await boot(search)
      const said = targets(renderToStaticMarkup(h(page.RecordDetail, detailProps(aModule()) as never)))
      for (const key of keys) {
        const found = said.filter((one) => one === region(`section.${key}`))
        expect(found.length, `"${key}" is on ${String(found.length)} elements (${search || 'normal mode'})`).toBe(1)
      }
    }
  })
})

// ============================================================================ where the work sits

describe('a block page names the panel saying what holds it and how big it is', () => {
  it('gives Where this work sits, and how big it is its own section', async () => {
    const { page } = await boot()
    const html = renderToStaticMarkup(
      h(page.RecordDetail, detailProps(record('block', { measured: 'nothing yet' })) as never),
    )
    expect(targets(html)).toContain(region(`section.${WHERE_IT_SITS_KEY}`))
  })
})

// ============================================================================ the links panel

describe('the Links panel says it is the links of the record whose page it is on', () => {
  it('carries section.links, on every kind, whether or not anything is joined', async () => {
    const { links } = await boot()
    for (const kind of ['module', 'block', 'proposal', 'report', 'note'] as RecordKind[]) {
      const rec = record(kind, {})
      const html = renderToStaticMarkup(
        h(links.LinkPanel, {
          declares: sectionsOf({ ...rec, relations: [] })(LINKS_KEY),
          // THE KIND THE PANEL NAMES ITS HEADING FROM. `Links` is declared once, on the section.
          kind,
          recordId: ID,
          links: [],
          knownTitles: [],
          editable: false,
          onChanged: () => undefined,
        } as never),
      )
      expect(targets(html), `a ${kind}'s Links panel says nothing`).toContain(region('section.links'))
    }
  })
})

// ============================================================================ the fork's own panel

const aFork = () => ({
  question: 'Where does a plan belong?',
  options: ['a — one', 'b — two'],
  because: 'Two invariants disagree.',
  evidence: ['The first reading.', 'The second reading.'],
  revisit_when: 'Before window B.',
})

describe("the fork's panel names why it came up, what it rests on, and when to look again", () => {
  it('gives the two folds and the revisit line their own sections', async () => {
    const { gov } = await boot()
    const data = aFork()
    const html = renderToStaticMarkup(
      h(gov.ProposalGovernance, {
        recordId: ID,
        title: 'A fork',
        data,
        resolved: false,
        sections: sectionsOf({ id: ID, kind: 'proposal', data, title: 'A fork', summary: null, relations: [] }),
        onSettled: () => {},
      } as never),
    )
    const said = targets(html)
    expect(said, 'why this came up says nothing').toContain(region('section.because'))
    expect(said, 'what this is based on says nothing').toContain(region('section.evidence'))
    expect(said, 'the revisit line says nothing').toContain(region('section.revisit_when'))
  })

  it('gives every evidence line a region of its own, so a comment lands on the line', async () => {
    // The owner's dogfood is what this serves: *an evidence item stored at data.evidence answers
    // the whole proposal*. One region per line, named by the stored path, which is the id
    // `recordRegionsOf` derives for a list a kind's own panel draws.
    const { gov } = await boot()
    const data = aFork()
    const html = renderToStaticMarkup(
      h(gov.ProposalGovernance, {
        recordId: ID,
        title: 'A fork',
        data,
        resolved: false,
        sections: sectionsOf({ id: ID, kind: 'proposal', data, title: 'A fork', summary: null, relations: [] }),
        onSettled: () => {},
      } as never),
    )
    const said = targets(html)
    expect(said).toContain(region('data.evidence[0]'))
    expect(said).toContain(region('data.evidence[1]'))
    expect(said).not.toContain(region('data.evidence[2]'))
  })
})
