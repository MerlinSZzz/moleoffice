// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE READER FLOOR IS FOR REPORTS. EVERY OTHER KIND OF RECORD KEEPS ALL SEVEN POSITIONS.
 *
 * ---------------------------------------------------------------------------------------
 * THE RULE
 * ---------------------------------------------------------------------------------------
 *
 * The floor was being applied to the surface rather than to the report, and the rule that
 * settled it is:
 *
 *   the limit is for reports only, because only a report is set level by level by hand; nothing else should have it
 *
 * A report is the thing with a level control on it, so stopping at the conclusion is a rule about
 * reports. Criterion A19 of `design/pointing-reopened/ACCEPTANCE.md`, as amended at `d159615`.
 * Proposal `hHhzZVOvqGOh` carries the ruling.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS WRONG, AND WHY NOBODY SAW IT
 * ---------------------------------------------------------------------------------------
 *
 * Two kinds of record hold blocks: a report in `blocks` and a module in `summaryBlocks`. Both are
 * drawn by `SummaryBlocks`, which asks one surface — `reportContent` — how much to say. The floor
 * was asked of that surface alone, so a module's curated summary would have been floored too. No
 * module in the corpus has one written, so nothing on any screen showed it. Verifier 5 found it by
 * reading the code.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THAT PROVE THESE ARE NOT DECORATION
 * ---------------------------------------------------------------------------------------
 *
 *   make `readerFloorApplies` in src/shared/detail.ts answer `surface === FLOORED_SURFACE`, which
 *     is what it did before this change → sections 1, 2 and 3 go red: the module is floored.
 *   set `FLOORED_KIND` to `module` → sections 1, 2 and 3 go red, and the report is the one floored.
 *   point `LevelControl` in src/web/components/SummaryBlocks.tsx back at `readerStepFrom` whatever
 *     the kind → section 3 goes red: the module's minus is dead at the conclusion.
 *   point it at `stepFrom` whatever the kind → section 3 goes red the other way: the report walks
 *     down to Level 1.
 *   have `SummaryBlocks` pass `null` for the kind to `useDetail` → section 3 goes red: a report
 *     with Level 1 stored draws Level 1.
 */
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  DETAIL_SURFACES,
  detailKeyForSurface,
  FLOORED_KIND,
  FLOORED_SURFACE,
  levelLabel,
  nearestOffered,
  READER_FLOOR,
  readerFloorApplies,
  rungFor,
  RUNGS,
  type DetailSource,
  type Rung,
} from '../src/shared/detail.ts'
import type { SummaryBlock } from '../src/shared/types.ts'

type SummaryBlocksModule = typeof import('../src/web/components/SummaryBlocks.tsx')
let sb: SummaryBlocksModule

const store = new Map<string, string>()

/**
 * A MODULE'S CURATED SUMMARY: the other body this component draws.
 *
 * It is a module's `summaryBlocks` rather than a report's `blocks`, and that is the whole point of
 * the fixture. `kinds.ts` declares the two fields as one type, so this is a real body of a real
 * kind and not a report wearing another name.
 */
const MODULE_BLOCKS: SummaryBlock[] = [
  { id: 'm-1', type: 'text', text: 'Ibex the wrist camera holds its calibration for a working day.' },
  { id: 'm-2', type: 'heading', text: 'Vicuna what is still open' },
  { id: 'm-3', type: 'text', text: 'Okapi nobody has measured it after a full shift.' },
]

const REPORT_BLOCKS: SummaryBlock[] = [
  { id: 'b-1', type: 'text', text: 'Dingo three of four printed wrist mounts broke below the trial load.' },
  { id: 'b-2', type: 'heading', text: 'Lemur what is still open' },
  { id: 'b-3', type: 'text', text: 'Serval nobody has pulled the aluminium mount yet.' },
]

/** The words at level 1, which is the one length a floored surface would never draw. */
const MODULE_LABEL = 'Wrist camera drift'
const REPORT_LABEL = 'Wrist mounts broke'

/** A stored level-1 form, in the shape `readStoredShortForms` reads back. */
function labelForm(text: string): unknown {
  return { label: { text, writtenBy: 'agent', madeFrom: { seq: 1, contentHash: 'aaaa' } } }
}

const MODULE: DetailSource = {
  title: 'The wrist camera holds its calibration for a working day',
  summary: 'Nobody has measured the wrist camera after a full shift, so the drift is unknown.',
  declaresShortForms: true,
  shortForms: labelForm(MODULE_LABEL),
  body: { field: 'data.summaryBlocks', written: true },
}

const REPORT: DetailSource = {
  title: 'Printed wrist mounts broke below the trial load',
  summary: 'Three of four printed wrist mounts broke below the load the handover trials need.',
  declaresShortForms: true,
  shortForms: labelForm(REPORT_LABEL),
  body: { field: 'data.blocks', written: true },
}

beforeAll(async () => {
  // THE SHIM GOES FIRST. `SummaryBlocks.tsx` reads `window` while it is being imported, so a plain
  // import at the top of this file would throw before any test ran. The same shim as
  // tests/a-level-written-by-part-draws-the-parts.test.ts, and for the same reason.
  const shim = {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
    sessionStorage: { getItem: () => null, setItem: () => undefined, removeItem: () => undefined },
    location: { hash: '', pathname: '/', search: '' },
    matchMedia: () => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined }),
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }
  ;(globalThis as unknown as { window: unknown }).window = shim
  ;(globalThis as unknown as { localStorage: unknown }).localStorage = shim.localStorage
  sb = await import('../src/web/components/SummaryBlocks.tsx')
}, 60_000)

/**
 * ONE RECORD, DRAWN AS A READER WHO HAS SET THIS POSITION MEETS IT.
 *
 * IT IS THE STORED CHOICE AND NOT `drawAt`, which is what makes this a test of the resolver as well
 * as of the control. `drawAt` is the settings preview's way in and it walks past `rungFor`
 * altogether, so a fixture using it could not tell a raised choice from an unraised one.
 */
function drawn(kind: string, source: DetailSource, blocks: SummaryBlock[], stored: Rung): string {
  store.clear()
  store.set('mole-office.pictures.local', 'drawn')
  store.set(detailKeyForSurface(FLOORED_SURFACE), stored)
  return renderToStaticMarkup(
    h(sb.SummaryBlocks, {
      blocks,
      layout: 'page',
      inRecord: { recordId: `rec-${kind}`, kind, stored: source },
    } as never),
  ).replace(/<style[\s\S]*?<\/style>/g, '')
}

/** What each level control on the drawing reads. There are two, above and below the writing. */
function labels(html: string): string[] {
  return [...html.matchAll(/<span class="sb-level-label"[^>]*>([^<]*)</g)].map((one) => one[1] ?? '')
}

/** Whether each button of that name is disabled, in the order they are drawn. */
function shut(html: string, called: string): boolean[] {
  return html
    .split(`aria-label="${called}"`)
    .slice(1)
    .map((rest) => rest.slice(0, Math.max(rest.indexOf('>'), 0)).includes('disabled'))
}

// ============================================================ 1. the one place that decides

describe('one predicate says where the floor applies', () => {
  it('applies to a report drawn on the report content surface, and to nothing else', () => {
    expect(readerFloorApplies(FLOORED_SURFACE, FLOORED_KIND), 'a report is not floored').toBe(true)
    for (const kind of ['module', 'note', 'session', 'problem', '', 'REPORT']) {
      expect(readerFloorApplies(FLOORED_SURFACE, kind), `${kind} is floored`).toBe(false)
    }
    expect(readerFloorApplies(FLOORED_SURFACE, null), 'a surface drawing no record is floored').toBe(false)
  })

  it('applies on no other surface, whatever kind is being drawn there', () => {
    for (const surface of DETAIL_SURFACES) {
      if (surface === FLOORED_SURFACE) continue
      expect(readerFloorApplies(surface, FLOORED_KIND), surface).toBe(false)
    }
  })

  it('names the kind a report is filed under, so the predicate is about a real kind', () => {
    expect(FLOORED_KIND).toBe('report')
  })
})

// ============================================================ 2. the resolver raises for a report

describe('a stored choice below the floor is raised for a report and left alone for a module', () => {
  for (const below of ['label', 'title'] as const) {
    it(`raises ${levelLabel(below)} to Conclusion for a report`, () => {
      expect(rungFor(FLOORED_SURFACE, FLOORED_KIND, undefined, { everywhere: below }).rung).toBe(READER_FLOOR)
      expect(rungFor(FLOORED_SURFACE, FLOORED_KIND, undefined, { thisSurface: below }).rung).toBe(READER_FLOOR)
    })

    it(`leaves ${levelLabel(below)} where it is for a module`, () => {
      expect(rungFor(FLOORED_SURFACE, 'module', undefined, { everywhere: below }).rung).toBe(below)
      expect(rungFor(FLOORED_SURFACE, 'module', undefined, { thisSurface: below }).rung).toBe(below)
    })
  }

  it('answers the same for both kinds at the five positions a reader of a report can choose', () => {
    for (const rung of ['gist', 'outline', 'sketch', 'digest', 'full'] as const) {
      const report = rungFor(FLOORED_SURFACE, FLOORED_KIND, undefined, { everywhere: rung })
      const module = rungFor(FLOORED_SURFACE, 'module', undefined, { everywhere: rung })
      expect(report.rung, rung).toBe(rung)
      expect(module.rung, rung).toBe(rung)
    }
  })
})

// ============================================================ 3. the control on a drawn body

/**
 * THE WIRING, ON THE COMPONENT THAT DRAWS BOTH BODIES.
 *
 * The resolver above and the control here are two facts. A control that read the right position and
 * stepped by its own rule is the defect this project keeps finding, and it passes every test of the
 * resolver.
 */
describe('a module keeps all seven positions and a report stops at the conclusion', () => {
  it('draws a module at every one of the seven positions, label included', () => {
    for (const rung of RUNGS) {
      const html = drawn('module', MODULE, MODULE_BLOCKS, rung)
      expect(labels(html), `a module stored at ${rung} drew the wrong position`).toEqual([
        levelLabel(rung),
        levelLabel(rung),
      ])
    }
  })

  it('leaves a module’s minus pressable until Level 1 and its plus until Full', () => {
    for (const rung of RUNGS) {
      const html = drawn('module', MODULE, MODULE_BLOCKS, rung)
      const shorter = shut(html, 'One level shorter')
      const longer = shut(html, 'One level longer')
      expect(shorter, `minus on a module at ${rung}`).toEqual([rung === 'label', rung === 'label'])
      expect(longer, `plus on a module at ${rung}`).toEqual([rung === 'full', rung === 'full'])
    }
  })

  it('draws a module’s own level 1 words, which a floored body would never reach', () => {
    const html = drawn('module', MODULE, MODULE_BLOCKS, 'label')
    expect(html, 'the module did not draw its label').toContain(MODULE_LABEL)
  })

  it('draws a report at the conclusion when Level 1 or Level 2 is stored, with minus dead there', () => {
    for (const below of ['label', 'title'] as const) {
      const html = drawn('report', REPORT, REPORT_BLOCKS, below)
      expect(labels(html), `a report stored at ${below}`).toEqual(['Conclusion', 'Conclusion'])
      expect(shut(html, 'One level shorter'), `minus on a report at ${below}`).toEqual([true, true])
      expect(html, 'the report drew its label').not.toContain(REPORT_LABEL)
    }
  })

  /**
   * A REPORT'S LABEL READS THE NEAREST OFFERED POSITION since 16 September 2026: the control offers Conclusion,
   * Level 6 and Full, so a stored Level 4 or Level 5 is shown at the nearest of the three, stored choice
   * untouched. A module is not floored and its label reads as it always did.
   */
  it('draws a report at the nearest offered position, and a module at the rung as stored', () => {
    for (const rung of ['gist', 'outline', 'sketch', 'digest', 'full'] as const) {
      expect(labels(drawn('report', REPORT, REPORT_BLOCKS, rung)), rung).toEqual([
        levelLabel(nearestOffered(rung)),
        levelLabel(nearestOffered(rung)),
      ])
    }
    for (const rung of RUNGS) {
      expect(labels(drawn('module', MODULE, MODULE_BLOCKS, rung)), `module at ${rung}`).toEqual([
        levelLabel(rung),
        levelLabel(rung),
      ])
    }
  })
})
