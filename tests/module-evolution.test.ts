// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE MODULE EVOLUTION DRAWING: how a subsystem MAY evolve, and how it reads differently from a
 * pipeline.
 *
 * ---------------------------------------------------------------------------------------
 * THE FOUR THINGS THESE TESTS ARE REALLY HOLDING
 * ---------------------------------------------------------------------------------------
 *
 *   1. A REJECTED OR PARKED DIRECTION IS STILL ON THE DRAWING. Muted, with the reason in the
 *      record's own words, and never deleted. A drawing that dropped the dead ends is how a lab
 *      tries the same dead end twice; this is the failure the drawing exists to prevent, so it is
 *      the test written first.
 *
 *   2. THE DASH IS NOT SPENT ON BEING SET ASIDE. In this app a dash means "Mole Office worked this out
 *      and nobody confirmed it" — Canvas.tsx and ui.tsx both say so, and the inferred link mark is
 *      built on it. The brief offered "muted or dashed"; taking the dash would have made every
 *      inferred line in the product ambiguous, so a set-aside branch is muted and the dash appears
 *      for one thing only.
 *
 *   3. EVOLUTION IS NOT PIPELINE. Curves rather than the right angles ELK routes, and lighter than
 *      every weight lines.ts declares for a pipeline. Both are stated against the other file's own
 *      table, so a pipeline line that got lighter cannot pass this one silently.
 *
 *   4. NOTHING IS INVENTED. No new record kind, link type or stored field: a branch is a link
 *      somebody made, a depth is the `direction` kind's own ladder, and being put down is a
 *      `paused` block or a stored `supersedes` link. What cannot be drawn is counted and printed.
 *
 * No database and no DOM. The model is a pure function and the component renders to static markup.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it } from 'vitest'
import type { PanelRecord } from '../src/shared/types.ts'
import { LINE_WEIGHT } from '../src/web/components/graph/lines.ts'
import {
  EVOLUTION_WEIGHT,
  branchCurve,
  buildEvolution,
  evolutionIsLighterThanPipeline,
  type EvolutionInput,
  type EvolutionLink,
} from '../src/web/components/graph/evolution-model.ts'

/**
 * WHAT THESE RENDERS PASS FOR `declares`: see-through, because none of them reads a target.
 *
 * The panels below now take the answer from their caller's own `sectionsOf`. These tests read what
 * is INSIDE each panel — the words, the fold, the absence — so the see-through answer is the one
 * that leaves the markup they read exactly as it was.
 */
const SEE_THROUGH = { surface: null } as const


type Ev = typeof import('../src/web/components/graph/Evolution.tsx')
let ev: Ev

beforeAll(async () => {
  // Evolution.tsx reaches ui.tsx and router.tsx, which read window.localStorage on import.
  const store = new Map<string, string>()
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
  }
  ev = await import('../src/web/components/graph/Evolution.tsx')
})

// ============================================================================ a small corpus

function record(over: Partial<PanelRecord> & Pick<PanelRecord, 'id' | 'kind' | 'title'>): PanelRecord {
  return {
    workspaceId: 'default',
    ownerId: THE_TEST_OFFICES_OWNER.id,
    summary: null,
    data: {},
    createdAt: '2026-08-01 09:00:00',
    updatedAt: '2026-08-01 09:00:00',
    deletedAt: null,
    ...over,
  } as PanelRecord
}

const link = (id: string, fromId: string, toId: string, type: EvolutionLink['type'], inferred = false): EvolutionLink => ({
  id,
  fromId,
  toId,
  type,
  inferred,
})

const MODULE = 'mod-gripper'

/**
 * One module, four directions and the three ways a branch can be:
 *
 *   d-force     live, measured
 *   d-gel       PARKED: it carries a `paused` block with a reason
 *   d-suction   SUPERSEDED: `d-force` holds a stored `supersedes` link pointing at it
 *   d-print     a branch off `d-force`, so it is two hops out
 */
function corpus(): EvolutionInput {
  const records: PanelRecord[] = [
    record({ id: MODULE, kind: 'module', title: 'Tray clamp' }),
    record({
      id: 'd-force',
      kind: 'direction',
      title: 'Force control instead of position control',
      summary: 'Filed after the third cracked print.',
      data: { depth: 'measured', evidence: ['closed on the 50 mm cube at 12 N'] },
    }),
    record({
      id: 'd-gel',
      kind: 'direction',
      title: 'Home-made gel pads',
      data: {
        depth: 'noticed',
        paused: { since: '2026-08-02', why: 'the silicone order has not arrived' },
      },
    }),
    record({ id: 'd-suction', kind: 'direction', title: 'Suction instead of fingers', data: { depth: 'read' } }),
    record({ id: 'd-print', kind: 'direction', title: 'Print the shell in TPU', data: { depth: 'noticed' } }),
  ]
  const links: EvolutionLink[] = [
    link('l1', MODULE, 'd-force', 'relates_to'),
    link('l2', MODULE, 'd-gel', 'relates_to'),
    link('l3', MODULE, 'd-suction', 'relates_to'),
    link('l4', 'd-force', 'd-print', 'relates_to'),
    link('l5', 'd-force', 'd-suction', 'supersedes'),
  ]
  return { moduleId: MODULE, moduleTitle: 'Tray clamp', records, links }
}

const graph = () => buildEvolution(corpus())
const html = (input: EvolutionInput = corpus()) =>
  renderToStaticMarkup(h(ev.Evolution, { ...input, declares: SEE_THROUGH })).replace(/<style[^>]*>[\s\S]*?<\/style>/g, '')

// ============================================================================ 1. nothing disappears

describe('a direction that was put down stays on the drawing, muted', () => {
  it('keeps a parked direction as a branch and says why it was parked', () => {
    const parked = graph().nodes.find((node) => node.id === 'd-gel')
    expect(parked, 'a parked direction was dropped from the drawing').toBeDefined()
    expect(parked?.setAside.map((a) => a.way)).toEqual(['parked'])
    expect(parked?.setAside[0]?.because).toContain('the silicone order has not arrived')
    expect(parked?.setAside[0]?.from).toBe('data.paused')
  })

  it('keeps a superseded direction, and names what replaced it', () => {
    const gone = graph().nodes.find((node) => node.id === 'd-suction')
    expect(gone, 'a superseded direction was dropped from the drawing').toBeDefined()
    expect(gone?.setAside.map((a) => a.way)).toEqual(['superseded'])
    expect(gone?.setAside[0]?.because).toContain('Force control instead of position control')
  })

  it('draws both of them muted, and leaves every live branch alone', () => {
    const g = graph()
    const mutedIds = g.rows.filter((row) => row.muted).map((row) => row.nodeId).sort()
    expect(mutedIds).toEqual(['d-gel', 'd-suction'])
  })

  it('puts both on the page, with their titles and their reasons', () => {
    const markup = html()
    expect(markup).toContain('Home-made gel pads')
    expect(markup).toContain('Suction instead of fingers')
    expect(markup).toContain('the silicone order has not arrived')
    expect(markup).toContain('superseded by')
    // The mute is an attribute on the row, which is what the stylesheet reads. Two rows carry it.
    expect(markup.split('data-muted="1"').length - 1).toBe(2)
    // The legend now folds to bare clauses; what a muted row means is still named on the page.
    expect(markup).toContain('kept on the drawing')
  })
})

// ============================================================================ 2. the reserved dash

describe('the dash is spent on one thing, and being set aside is not it', () => {
  it('does not dash a set-aside branch', () => {
    const markup = html()
    // Nothing in this drawing is inferred, so nothing may be dashed — the two set-aside rows
    // included. A dash here would say "Mole Office worked this link out", which is false.
    expect(markup).not.toContain('data-inferred="1"')
  })

  it('dashes a branch Mole Office worked out itself, which is what the dash means everywhere', () => {
    const input = corpus()
    const inferred: EvolutionInput = {
      ...input,
      links: input.links.map((l) => (l.id === 'l4' ? { ...l, inferred: true } : l)),
    }
    expect(buildEvolution(inferred).rows.find((row) => row.nodeId === 'd-print')?.inferred).toBe(true)
    expect(html(inferred)).toContain('data-inferred="1"')
  })
})

// ============================================================================ 3. not a pipeline

describe('evolution reads differently from pipeline', () => {
  it('draws every branch as a cubic Bezier and never as right angles', () => {
    for (const row of graph().rows) {
      if (row.curve === null) continue
      expect(row.curve, 'a branch was drawn as straight segments, which is the pipeline language').toContain(' C ')
      expect(row.curve).not.toMatch(/[LHV]/)
    }
  })

  it('leaves the trunk head with no branch into it', () => {
    expect(graph().rows[0]?.curve).toBeNull()
  })

  it('is lighter than every line a pipeline draws', () => {
    expect(evolutionIsLighterThanPipeline()).toEqual([])
    expect(EVOLUTION_WEIGHT).toBeLessThan(Math.min(...Object.values(LINE_WEIGHT)))
  })

  it('says which rule broke, and why, when it is not lighter', () => {
    const broken = evolutionIsLighterThanPipeline(LINE_WEIGHT.carries)
    expect(broken).toHaveLength(1)
    expect(broken[0]).toContain('carries')
    expect(broken[0]).toContain('possible future')
  })

  it('moves a branch one indent out per hop, and the curve leaves the trunk it belongs to', () => {
    const g = graph()
    const twoHops = g.rows.find((row) => row.nodeId === 'd-print')
    expect(twoHops?.indent).toBe(2)
    expect(twoHops?.curve).toBe(branchCurve(1, 2))
    expect(g.gutterWidth).toBeGreaterThan(g.rows[1]?.dotX ?? 0)
  })

  it('keeps a trunk drawn through to its next branch', () => {
    // `d-print` is read directly under `d-force`, and the module has two more branches below it.
    // Without the through-line the module's trunk would appear to stop and `d-gel` would come
    // from nowhere.
    const g = graph()
    const printRow = g.rows.find((row) => row.nodeId === 'd-print')
    expect(printRow?.throughs).toContain(g.rows[0]?.dotX)
    // The last row has nothing below it, so nothing runs through it.
    expect(g.rows[g.rows.length - 1]?.throughs).toEqual([])
  })
})

// ============================================================================ 4. nothing invented

describe('the drawing is built from what is stored, and says what it left out', () => {
  it('walks directions and nothing else, and counts what it stepped over', () => {
    const input = corpus()
    const withClaim: EvolutionInput = {
      ...input,
      records: [...input.records, record({ id: 'c1', kind: 'claim', title: '12 N is enough' })],
      links: [...input.links, link('l6', 'd-force', 'c1', 'produces')],
    }
    const g = buildEvolution(withClaim)
    expect(g.nodes.map((n) => n.id)).not.toContain('c1')
    expect(g.notes.join(' ')).toContain('1 relationship leads outside these directions')
  })

  it('counts a link whose far end is not in the listing rather than losing it', () => {
    const input = corpus()
    const dangling: EvolutionInput = { ...input, links: [...input.links, link('l7', 'd-force', 'gone', 'relates_to')] }
    expect(buildEvolution(dangling).notes.join(' ')).toContain('1 relationship points to a missing record')
  })

  it('names a second link between two branches instead of drawing a second line into one', () => {
    // `l5` is `d-force supersedes d-suction`, and both are already branches off the module. The
    // gutter is a tree, so the link is printed in words on the row it belongs to.
    const g = graph()
    const force = g.nodes.find((n) => n.id === 'd-force')
    expect(force?.alsoJoins.map((j) => j.otherId)).toEqual(['d-suction'])
    expect(force?.alsoJoins[0]?.label).toBe('supersedes')
    expect(html()).toContain('named here, not drawn')
  })

  it('names the record each branch leaves, rather than "the record above it"', () => {
    // The rows are read depth-first, so a branch that returns to a trunk further up is printed
    // under something it has nothing to do with: `d-gel` branches off the module and is read
    // directly under `d-print`, which is two hops out on another trunk. Naming the record removes
    // the question; "above" would answer it wrongly on every row that closes a branch.
    const g = graph()
    expect(g.nodes.map((n) => n.id)).toEqual([MODULE, 'd-force', 'd-print', 'd-gel', 'd-suction'])
    expect(g.nodes.find((n) => n.id === 'd-print')?.parentTitle).toBe('Force control instead of position control')
    expect(g.nodes.find((n) => n.id === 'd-gel')?.parentTitle).toBe('Tray clamp')
    expect(html()).toContain('“Tray clamp”')
  })

  it("prints a direction's depth on its own ladder, never as a state word", () => {
    const markup = html()
    // "4/6 measured" — the rung and the ladder's length. `measured` means rung four here and
    // "the measurement is taken" on a claim, so the ladder has to be shown with it.
    expect(markup).toContain('4/6')
    expect(markup).toContain('measured')
    expect(markup).toContain('1/6')
  })

  it('says a direction with no depth has none, which is the one thing the kind must not omit', () => {
    const input = corpus()
    const bare: EvolutionInput = {
      ...input,
      records: input.records.map((r) => (r.id === 'd-gel' ? { ...r, data: { ...r.data, depth: undefined } } : r)),
    }
    expect(html(bare)).toContain('no depth recorded')
  })
})

// ============================================================================ the empty answers

describe('an empty drawing says which empty it is', () => {
  it('uses the short mark for both ordinary empty direction lists under 7FEOshq3mBGG', () => {
    const alone: EvolutionInput = {
      moduleId: MODULE,
      moduleTitle: 'Tray clamp',
      records: [record({ id: MODULE, kind: 'module', title: 'Tray clamp' })],
      links: [],
    }
    expect(html(alone)).toContain('class="px-absent"')

    const input = corpus()
    const unlinked: EvolutionInput = { ...input, links: [] }
    const markup = html(unlinked)
    expect(markup).toContain('class="px-absent"')
    expect(markup).not.toContain('No direction is linked')
  })
})
