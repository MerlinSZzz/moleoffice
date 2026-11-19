// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PLAN CANVAS DRAWS A GOAL IN THE INTENDED WORLD.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS PROVES AND WHY IT IS DRAWN RATHER THAN CALLED
 * ---------------------------------------------------------------------------------------
 *
 * Since 16 September 2026 a goal belongs in the intended world. A goal
 * has not happened, `src/shared/world.ts`'s own sentence says `INTENDED_KINDS` is the whole of the
 * intended world, and `serves` is already drawn in the intent family for that reason. So `goal`
 * joined `INTENDED_KINDS`, and this file reads the canvas's own world reader — `worldsIn` in
 * `src/web/components/graph/PlanGraph.tsx`, called by the band at line 1763 — and the family of a
 * line the canvas actually draws between a goal and a trajectory.
 *
 * A CALL ON `worldOf` ALONE WOULD NOT DO. `tests/a-future-is-never-a-past.test.ts` already checks
 * the function; this file checks that the canvas asks it with a goal's kind and that the answer
 * reaches the drawn `<path>`'s `data-family`, which is the attribute the stylesheet strokes from.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATION THIS IS WRITTEN AGAINST, after a control run
 * ---------------------------------------------------------------------------------------
 *
 * Take `goal` out of `INTENDED_KINDS` in `src/shared/world.ts`. `worldsIn` answers `actual` for the
 * goal, `linkFamilyOf('about', {from:'actual', to:'intended'})` falls back to the table's
 * `related`, the drawn path carries `data-family="related"`, and both assertions below go red.
 * Restore the file byte-identical by sha256 and they are green again. The before and after hashes
 * are in the report.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { PlanGraphEdge, PlanGraphNode, PlanGraphReply } from '../src/server/api/plan-graph.ts'
import type { PanelRecord, RecordKind } from '../src/shared/types.ts'

type PlanGraphModule = typeof import('../src/web/components/graph/PlanGraph.tsx')

let planGraph: PlanGraphModule
let model: typeof import('../src/web/components/graph/model.ts')
let card: typeof import('../src/web/components/graph/card.ts')

/**
 * The module loads a React component that reads `window`, so a stand-in is put in place first and
 * the module graph is rebuilt, exactly as `tests/a-line-between-two-intentions.test.ts` does.
 */
beforeEach(async () => {
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
  planGraph = (await import('../src/web/components/graph/PlanGraph.tsx')) as PlanGraphModule
})

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
    record: recordFor(recordId, kind, title),
    drawn: 'anchor',
    oneLinkFrom: [],
    allocations: [],
  }
}

function edge(from: string, to: string, type: PlanGraphEdge['type']): PlanGraphEdge {
  return { id: `e-${from}-${to}`, from, to, type, label: type, gateLabel: null, gateProblem: null, broken: false, gate: null }
}

/** The family the drawn line carries, read off the path the stylesheet strokes from. */
function drawnFamily(markup: string): string | null {
  const found = /class="pg-line"[^>]*data-family="([^"]+)"/.exec(markup)
  return found === null ? null : (found[1] as string)
}

/**
 * A plane with a goal and the trajectory beside it, joined by an `about` line.
 *
 * `about` is `related` in the table alone, so it is the line whose family the ends decide: when
 * both ends are intentions `linkFamilyOf` returns `intent`, and when the goal is not, it returns
 * the table's `related`. The layout is written by hand because the solver has nothing to say about
 * which family a line belongs to.
 */
function plane(): string {
  const nodes = [node('g1', 'goal', 'The export survives a large report'), node('t1', 'trajectory', 'The intended future')]
  const edges = [edge('g1', 't1', 'about')]
  const band = {
    key: 'g1',
    nodes,
    edges,
    anchor: nodes[0] as PlanGraphNode,
    heading: 'The intended world',
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
      ['g1', { x: 0, y: 0, width: 200, height: 60 }],
      ['t1', { x: 0, y: 120, width: 200, height: 60 }],
    ]),
    routes: new Map([
      [
        'e-g1-t1',
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
  const graph = model.buildStructureGraph({ scope: { at: 'plan', period: reply.period }, now: 0, plan: reply })
  const cardPlan = card.planCanvas(graph, 'title')
  const props = {
    reply,
    graph,
    model: planGraph.planModel(reply),
    cardFor: (n: PlanGraphNode) => {
      const one = graph.nodes.find((drawn) => drawn.recordId === n.recordId)
      if (one === undefined) throw new Error(`no card for ${n.recordId}`)
      return {
        node: one,
        onOpen: () => {},
        flow: 'RIGHT' as const,
        lit: false,
        restriction: null,
        here: [],
        says: 'title' as const,
        plan: card.planFor(cardPlan, one.id),
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
  return renderToStaticMarkup(h(planGraph.BandBody, { band, drawn, props } as never))
}

describe('the plan canvas puts a goal in the intended world', () => {
  it('answers intended for a goal, and draws its line beside a trajectory in the intent family', () => {
    const worlds = planGraph.worldsIn([node('g1', 'goal', 'The export survives'), node('t1', 'trajectory', 'The intended future')])
    expect(worlds.get('g1'), 'the canvas read the goal as something that happened').toBe('intended')
    expect(worlds.get('t1')).toBe('intended')
    // And the answer reaches the drawing: `about` is `related` in the table, and the ends make it
    // `intent` — the thin line that says "intended, not yet done".
    expect(drawnFamily(plane())).toBe('intent')
  })
})
