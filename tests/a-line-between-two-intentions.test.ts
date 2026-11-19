// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A LINE BETWEEN TWO INTENTIONS IS DRAWN AS AN INTENTION, ON THE CANVAS AND NOT ONLY IN A FUNCTION.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS WRONG
 * ---------------------------------------------------------------------------------------
 *
 * `linkFamilyOf` has taken the ends of the line since the intent family was built. Nothing passed
 * them. Both production call sites asked `linkFamilyOf(edge.type)`, so `trj2 supersedes trj1` was
 * drawn in the `builds` family, whose key reads **leads to** — *the first one leads to the second*.
 * Backwards, and in the language of things that happened, on a relation between two things that
 * have not happened. That is verbatim the fault the argument exists to prevent.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS FILE DRAWS A PLANE INSTEAD OF CALLING A FUNCTION
 * ---------------------------------------------------------------------------------------
 *
 * `tests/a-future-is-never-a-past.test.ts` already asserts that `linkFamilyOf('supersedes', both
 * intended)` is `intent`, and that test was green for the whole time the canvas was wrong. A test
 * on the function cannot tell a wired argument from an unwired one.
 *
 * So this reads the family off the drawn `<path>`: it hands `BandBody` a layout written by hand —
 * the solver is asynchronous and has nothing to say about which family a line belongs to — and
 * looks at `data-family`, which is the attribute the stylesheet strokes from.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { describe, expect, it, vi } from 'vitest'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { PlanGraphEdge, PlanGraphNode, PlanGraphReply } from '../src/server/api/plan-graph.ts'
import type { PanelRecord, RecordKind } from '../src/shared/types.ts'

type PlanGraphModule = typeof import('../src/web/components/graph/PlanGraph.tsx')

async function boot(): Promise<PlanGraphModule> {
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
  model = await import('../src/web/components/graph/model.ts')
  card = await import('../src/web/components/graph/card.ts')
  return (await import('../src/web/components/graph/PlanGraph.tsx')) as PlanGraphModule
}

/** The shared model and the shared card, imported once the window stand-in is in place. */
let model: typeof import('../src/web/components/graph/model.ts')
let card: typeof import('../src/web/components/graph/card.ts')

/** The record the route would have read, so `words` and `levels` are what the shared readers say. */
function recordFor(recordId: string, kind: RecordKind, title: string): PanelRecord {
  return {
    id: recordId,
    kind,
    workspaceId: 'panelx',
    ownerId: THE_TEST_OFFICES_OWNER.id,
    title,
    summary: null,
    data: {},
    createdAt: '2026-08-01 09:00:00',
    updatedAt: '2026-08-01 09:00:00',
    deletedAt: null,
  }
}

function node(recordId: string, kind: RecordKind, title: string): PlanGraphNode {
  const record = recordFor(recordId, kind, title)
  return {
    recordId,
    kind,
    role: 'work',
    title,
    name: title,
    within: null,
    state: null,
    depth: null,
    effortHours: null,
    due: null,
    settled: null,
    record,
    drawn: 'anchor',
    oneLinkFrom: [],
    allocations: [],
  }
}

function edge(from: string, to: string, type: PlanGraphEdge['type']): PlanGraphEdge {
  return { id: `e-${from}-${to}`, from, to, type, label: type, gateLabel: null, gateProblem: null, broken: false, gate: null }
}

/**
 * A plane with two cards and one line, drawn without the solver.
 *
 * The placements and the route are the shape ELK returns and nothing about them decides a family;
 * they exist so the plane draws at all.
 */
function plane(mod: PlanGraphModule, kinds: [RecordKind, RecordKind], type: PlanGraphEdge['type']): string {
  const nodes = [node('a', kinds[0], 'Calibrate the wrist camera'), node('b', kinds[1], 'Measure the reach envelope')]
  const edges = [edge('a', 'b', type)]
  const band = {
    key: 'a',
    nodes,
    edges,
    anchor: nodes[0] as PlanGraphNode,
    heading: 'A band',
    headingWhy: 'because this test made one',
    allocated: 0,
    // NOT a straight run: a run is drawn as a row of chips and has no lines at all, which would
    // photograph green with no `data-family` anywhere on the page.
    run: null,
    crossings: 0,
    foldedAtRest: false,
  }
  const drawn = {
    placements: new Map([
      ['a', { x: 0, y: 0, width: 200, height: 60 }],
      ['b', { x: 0, y: 120, width: 200, height: 60 }],
    ]),
    routes: new Map([
      [
        'e-a-b',
        {
          points: [
            { x: 100, y: 60 },
            { x: 100, y: 120 },
          ],
          label: null,
        },
      ],
    ]),
    width: 200,
    height: 180,
  }
  const reply = {
    horizon: 'week',
    period: '2026-W33',
    from: '2026-08-10',
    to: '2026-08-16',
    workspaceId: 'panelx',
    workspaceTitle: 'Mole Office',
    nodes,
    edges,
    elsewhere: [],
    omitted: [],
    note: 'a drawing this test made',
  } as unknown as PlanGraphReply
  // THE DRAWING AND ITS CARDS, built by the shared model exactly as the page builds them, so this
  // test hands `BandBody` what the page hands it. The layout is still written by hand below: the
  // subject here is which family a line is drawn as, and running a solver would not test it.
  const graph = model.buildStructureGraph({ scope: { at: 'plan', period: reply.period }, now: 0, plan: reply })
  const cardPlan = card.planCanvas(graph, 'title')
  const props = {
    reply,
    graph,
    model: mod.planModel(reply),
    cardFor: (node: PlanGraphNode) => {
      const drawn = graph.nodes.find((one) => one.recordId === node.recordId)
      if (drawn === undefined) throw new Error(`no card for ${node.recordId}`)
      return {
        node: drawn,
        onOpen: () => {},
        flow: 'RIGHT' as const,
        lit: false,
        restriction: null,
        here: [],
        says: 'title' as const,
        plan: card.planFor(cardPlan, drawn.id),
        choice: card.NOTHING_PRESSED,
        onChoose: () => {},
      }
    },
    sizes: { sizes: null, unmeasured: [], rack: null },
    selected: null,
    onSelect: () => {},
    hoveredEdge: null,
    onHoverEdge: () => {},
    folded: new Set<string>(),
    onToggleBand: () => {},
    inspect: false,
  }
  return renderToStaticMarkup(h(mod.BandBody, { band, drawn, props } as never))
}

/** The family the drawn line carries, read off the path the stylesheet strokes from. */
function drawnFamily(markup: string): string | null {
  const found = /class="pg-line"[^>]*data-family="([^"]+)"/.exec(markup)
  return found === null ? null : (found[1] as string)
}

describe('the canvas asks which world each end of a line is in', () => {
  it('draws `supersedes` between two trajectories as intent, not as leads-to', async () => {
    const mod = await boot()
    const markup = plane(mod, ['trajectory', 'trajectory'], 'supersedes')
    expect(drawnFamily(markup)).toBe('intent')
  })

  it('leaves `supersedes` between two things that happened exactly as it was', async () => {
    const mod = await boot()
    expect(drawnFamily(plane(mod, ['task', 'task'], 'supersedes'))).toBe('builds')
    // One end intended is not enough, and that is the rule rather than an accident: `realises` runs
    // from a thing that happened to a thing that has not, and it is intent by its own row.
    expect(drawnFamily(plane(mod, ['task', 'trajectory'], 'supersedes'))).toBe('builds')
    expect(drawnFamily(plane(mod, ['task', 'trajectory'], 'realises'))).toBe('intent')
  })

  it('draws every line between two intentions as intent, whatever the stored type says', async () => {
    const mod = await boot()
    for (const type of ['consumes', 'derived_from', 'blocks', 'about'] as PlanGraphEdge['type'][]) {
      expect(drawnFamily(plane(mod, ['trajectory', 'planned_state'], type)), type).toBe('intent')
    }
  })

  it('draws the intent family thinner than the family for things that happened', async () => {
    const { LINE_FAMILY_STYLE } = await import('../src/web/components/graph/lines.ts')
    // The drawn width comes from this table through the stylesheet PlanGraph builds from it, so the
    // family above is a real difference on screen and not only an attribute.
    expect(LINE_FAMILY_STYLE.intent.width).toBeLessThan(LINE_FAMILY_STYLE.builds.width)
  })
})
