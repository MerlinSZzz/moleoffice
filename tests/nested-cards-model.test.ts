// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT A CARD CONTAINS, READ ONCE — D28, AT THE LAYER A TEST CAN HOLD.
 *
 * `nested-cards.test.ts` drives the real drawing in a browser and is the proof that the child cards
 * are DRAWN. This file proves the meaning underneath it: that the records a module contains come
 * through `partsOf` in `src/shared/containment.ts`, in its order and no other, and that nothing else
 * on the graph is turned into a child.
 *
 * THE CASES ARE THE CRITERION'S OWN. The autograsp module of the criterion — an
 * example (比如), built here because no such module exists in the Robotics project — and the
 * pipeline whose own `part_of` module children must stay measured and not drawn.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { beforeAll, describe, expect, it } from 'vitest'
import type { AttentionResult } from '../src/shared/attention.ts'
import { partsOf, type ContainmentLink } from '../src/shared/containment.ts'
import type { PanelRecord } from '../src/shared/types.ts'
import type { GraphLink, StructureGraph } from '../src/web/components/graph/model.ts'

type Model = typeof import('../src/web/components/graph/model.ts')
let model: Model

const NOW = Date.parse('2026-09-16T12:00:00')
const STAMP = '2026-09-16 09:00:00'

beforeAll(async () => {
  const store = new Map<string, string>()
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  }
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: storage,
    sessionStorage: storage,
    location: { hash: '' },
    addEventListener: () => {},
    removeEventListener: () => {},
  }
  model = await import('../src/web/components/graph/model.ts')
})

function record(over: Partial<PanelRecord> & Pick<PanelRecord, 'id' | 'kind' | 'title'>): PanelRecord {
  return {
    workspaceId: 'panelx',
    ownerId: THE_TEST_OFFICES_OWNER.id,
    summary: null,
    data: {},
    createdAt: STAMP,
    updatedAt: STAMP,
    deletedAt: null,
    ...over,
  }
}

function link(fromId: string, toId: string, type: GraphLink['type'] = 'part_of'): GraphLink {
  return {
    linkId: `${fromId}->${toId}`,
    fromId,
    toId,
    type,
    inferred: false,
    broken: false,
    gate: { at: 'not-a-dependency' },
  }
}

function attention(): AttentionResult {
  return {
    visible: [],
    remainder: [],
    total: 0,
    remainderByGroup: [],
    remainderNote: null,
    unclassified: [],
    noState: [],
    paused: [],
    machine: [],
    passedOver: [],
    counts: { candidates: 0, selected: 0, visible: 0, remainder: 0, passedOver: 0, deleted: 0 },
  } as unknown as AttentionResult
}

/** The six names from the criterion, built in a deliberately unsorted order. */
const SUB_MODULES = ['segmentation', 'perception', 'mapping', 'inverse kinematics', 'grasp generation', 'filtering']
const AUTOGRASP = 'g-autograsp'

/** The reading-surface shape: a module with children and no summary block of its own. */
const MANY = 'g-many'

const RECORDS: PanelRecord[] = [
  record({ id: AUTOGRASP, kind: 'module', title: 'autograsp module' }),
  ...SUB_MODULES.map((title, at) => record({ id: `g-sub-${String(at)}`, kind: 'module', title })),
  record({ id: MANY, kind: 'module', title: 'the reading surface' }),
  ...Array.from({ length: 32 }, (_, at) => record({ id: `g-part-${String(at)}`, kind: 'task', title: `part ${String(at).padStart(2, '0')}` })),
  record({ id: 'g-empty', kind: 'module', title: 'a module with nothing in it' }),
]

const LINKS: GraphLink[] = [
  // `part_of` reads from the child TO the thing it is part of.
  ...SUB_MODULES.map((_, at) => link(`g-sub-${String(at)}`, AUTOGRASP)),
  ...Array.from({ length: 32 }, (_, at) => link(`g-part-${String(at)}`, MANY)),
]

function build(over: Partial<Parameters<Model['buildStructureGraph']>[0]> = {}): StructureGraph {
  return model.buildStructureGraph({
    records: RECORDS,
    links: LINKS,
    attention: attention(),
    scope: { at: 'modules' },
    now: NOW,
    ...over,
  })
}

const nodeOf = (graph: StructureGraph, id: string) => graph.nodes.find((node) => node.recordId === id)

describe('a module card knows the records it contains — D28', () => {
  it('reads them through `partsOf`, in its order and in no other', () => {
    const graph = build()
    const autograsp = nodeOf(graph, AUTOGRASP)
    expect(autograsp, 'the autograsp module is on the drawing').toBeDefined()
    // WHAT THE ONE READER ANSWERS, read again here from the same input.
    const containment: ContainmentLink[] = LINKS.map((one) => ({
      id: one.linkId,
      fromId: one.fromId,
      toId: one.toId,
      type: one.type,
    }))
    const throughPartsOf = partsOf(RECORDS.find((one) => one.id === AUTOGRASP) as PanelRecord, {
      records: RECORDS,
      links: containment,
    }).parts
    expect(autograsp?.contains.map((part) => part.id)).toEqual(throughPartsOf.map((part) => part.id))
    // AND THE ORDER IS TITLE THEN ID, which is neither the order the modules were written in nor
    // the order the links were made in.
    expect(autograsp?.contains.map((part) => part.title)).toEqual([
      'filtering',
      'grasp generation',
      'inverse kinematics',
      'mapping',
      'perception',
      'segmentation',
    ])
  })

  it('opens the by-part levels for a module whose only parts are the records it contains', () => {
    // THE READING-SURFACE CASE: it holds many children and no summary block, so without this the
    // detail tick would be refused and its children could never be drawn.
    const many = nodeOf(build(), MANY)
    expect(many?.contains).toHaveLength(32)
    expect(many?.levels.has).toContain('outline')
    expect(many?.levels.has).toContain('sketch')
    expect(many?.levels.has).toContain('digest')
  })

  it('draws no children and opens no by-part level on a module that contains nothing', () => {
    const empty = nodeOf(build(), 'g-empty')
    expect(empty?.contains).toEqual([])
    expect(empty?.levels.has).not.toContain('outline')
  })

  it('gives a pipeline box no part_of children; its steps stay its children', () => {
    // A pipeline and a module it contains: the pipeline's own `part_of` module children are
    // measured and reported, and the pipeline box is not changed tonight.
    const pipe = record({ id: 'p-cfc', kind: 'pipeline', title: 'CFC', data: { blockIds: [] } })
    const child = record({ id: 'm-cfc', kind: 'module', title: 'CFC perception' })
    const graph = model.buildStructureGraph({
      records: [pipe, child],
      links: [link('m-cfc', 'p-cfc')],
      attention: attention(),
      scope: { at: 'pipeline', recordId: 'p-cfc' },
      now: NOW,
    })
    const box = graph.nodes.find((node) => node.kind === 'pipeline')
    expect(box?.contains, 'the pipeline box draws no part_of children').toEqual([])
  })
})
