// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE DRAWING, THREE PLACES, AND NO SECOND COPY OF IT — criterion D10.
 *
 * ---------------------------------------------------------------------------------------
 * THE RULE AND WHAT IT ASKS FOR
 * ---------------------------------------------------------------------------------------
 *
 * One graph is used everywhere, in the plan, in a report and in any later drawing such as one of how
 * agents relate, where a
 * place differs in its default configuration and never in its implementation.
 *
 * ---------------------------------------------------------------------------------------
 * WHY A SOURCE SCAN AND NOT A RENDER
 * ---------------------------------------------------------------------------------------
 *
 * A second card, a second call to the solver, a second zoom or a second set of controls all DRAW
 * CORRECTLY on the day they are written. That is exactly how the plan drawing came to be 2,396
 * lines that imported nothing from the shared card: every test was green throughout, because each
 * one tested one of the two implementations and the screen was drawing the other. Problem
 * `HPmPxixOIaYY` has the measurement, and it names the check that would have caught it —
 * *grep PlanGraph.tsx for an import from card.ts*.
 *
 * So four of the cases below read the source of `src/web/components/graph`. Nothing else can see a
 * copy that works.
 *
 * ---------------------------------------------------------------------------------------
 * AND TWO CASES THAT ARE NOT SOURCE SCANS
 * ---------------------------------------------------------------------------------------
 *
 * A table of places is worth nothing if a place can be added to one half of it and not the other,
 * or if a builder makes a card of a kind its place never declared. Those are facts about values and
 * are checked as values.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { describe, expect, it } from 'vitest'

import { DRAWING_PLACES, buildStructureGraph, placeOf, type Scope } from '../src/web/components/graph/model.ts'
import { LAYOUT_AT } from '../src/web/components/graph/layout.ts'
import type { PlanGraphReply } from '../src/server/api/plan-graph.ts'
import type { PanelRecord } from '../src/shared/types.ts'
import type { AttentionResult } from '../src/shared/attention.ts'

// ============================================================ the table is one table

describe('a place is a row of one table, and both halves are filled', () => {
  it('gives every place a row in the meaning half and a row in the geometry half', () => {
    // THE SPLIT IS DELIBERATE AND IT IS NOT TWO LISTS. model.ts is the meaning of a drawing and its
    // own header forbids geometry in it, so the ELK options live in layout.ts. Both are exhaustive
    // over `Scope['at']`, so a place added to one and not the other does not compile — and this
    // says the same thing at runtime, where somebody reading a failure can see it.
    expect(Object.keys(DRAWING_PLACES).sort()).toEqual(Object.keys(LAYOUT_AT).sort())
    for (const [at, place] of Object.entries(DRAWING_PLACES)) {
      expect(place.at, `the ${at} row is filed under another name`).toBe(at)
      expect(place.draws.length, `the ${at} place draws no kind of card`).toBeGreaterThan(0)
    }
  })

  it('is what every drawing is keyed by, named by and run by', () => {
    const scopes: Scope[] = [{ at: 'modules' }, { at: 'pipeline', recordId: 'p1' }, { at: 'plan', period: '2026-W36' }]
    for (const scope of scopes) {
      const place = placeOf(scope)
      expect(place.at).toBe(scope.at)
      expect(place.key(scope).length, `the ${scope.at} drawing has no key`).toBeGreaterThan(0)
      expect(place.intentKey(scope).length, `the ${scope.at} drawing has no stored name`).toBeGreaterThan(0)
      expect(place.runs.because.length, `the ${scope.at} drawing does not say why it runs that way`).toBeGreaterThan(20)
      expect(place.nothingToDraw(3).short.length, `the ${scope.at} drawing cannot say why it is empty`).toBeGreaterThan(10)
    }
  })
})

// ============================================================ a place draws what it declares

describe('a place draws the kinds it declares and no other', () => {
  const record = (over: Partial<PanelRecord> & { id: string; kind: PanelRecord['kind'] }): PanelRecord => ({
    workspaceId: 'panelx',
    ownerId: THE_TEST_OFFICES_OWNER.id,
    title: over.id,
    summary: null,
    data: {},
    createdAt: '2026-08-01 09:00:00',
    updatedAt: '2026-08-01 09:00:00',
    deletedAt: null,
    ...over,
  })
  /** Nothing needs a person on this fixture, said as the shape the reader really takes. */
  const ATTENTION: AttentionResult = {
    visible: [],
    remainder: [],
    total: 0,
    remainderByGroup: [],
    remainderNote: null,
    unclassified: [],
    noState: [],
    directions: [],
  } as unknown as AttentionResult

  it('draws only modules on the module drawing', () => {
    const records = [
      record({ id: 'm1', kind: 'module', title: 'Arm' }),
      record({ id: 'm2', kind: 'module', title: 'Gripper' }),
      record({ id: 'p1', kind: 'pipeline', title: 'A run' }),
    ]
    const graph = buildStructureGraph({ records, links: [], attention: ATTENTION, scope: { at: 'modules' }, now: 0 })
    expect(graph.nodes.length).toBeGreaterThan(0)
    for (const node of graph.nodes) {
      expect(DRAWING_PLACES.modules.draws, `a ${node.kind} card is on the module drawing`).toContain(node.kind)
    }
  })

  it('draws only the plan place’s own kind on the plan drawing', () => {
    const one = record({ id: 'r1', kind: 'obligation', title: 'Hand it back' })
    const reply = {
      horizon: 'week',
      period: '2026-W36',
      from: '2026-08-31',
      to: '2026-09-06',
      workspaceId: 'panelx',
      workspaceTitle: 'Mole Office',
      nodes: [
        {
          recordId: 'r1',
          kind: 'obligation' as const,
          role: 'deadline' as const,
          title: 'Hand it back',
          name: 'Hand it back',
          within: null,
          state: null,
          depth: null,
          effortHours: null,
          due: null,
          settled: null,
          record: one,
          drawn: 'anchor' as const,
          oneLinkFrom: [],
          allocations: [],
        },
      ],
      edges: [],
      elsewhere: [],
      omitted: [],
      note: 'one record',
    } as unknown as PlanGraphReply
    const graph = buildStructureGraph({ scope: { at: 'plan', period: '2026-W36' }, now: 0, plan: reply })
    expect(graph.nodes.length).toBe(1)
    for (const node of graph.nodes) {
      expect(DRAWING_PLACES.plan.draws, `a ${node.kind} card is on the plan drawing`).toContain(node.kind)
    }
  })

  it('refuses to build a drawing without what its place reads, rather than drawing an empty one', () => {
    // AN EMPTY PICTURE LOOKS LIKE AN EMPTY PROJECT. The module drawing is built from the project's
    // own records; asked to build with none it stops and says which input is missing.
    expect(() => buildStructureGraph({ scope: { at: 'modules' }, now: 0 })).toThrow(/records/)
    const empty = buildStructureGraph({ scope: { at: 'plan', period: '2026-W36' }, now: 0 })
    expect(empty.nodes).toEqual([])
    expect(empty.problem, 'a plan drawing with no plan read is silently empty').toContain('/api/plan-graph')
  })
})

// ============================================================ the four things that must not come back

