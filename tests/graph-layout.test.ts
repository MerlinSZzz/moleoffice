// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE DERIVED LAYER: that the picture is reproducible, and that nothing about it is stored.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS FILE IS THE ONE THAT MATTERS MOST
 * ---------------------------------------------------------------------------------------
 *
 * Mole Office stores no coordinate. Every position on the structure drawing is worked out on each draw
 * and thrown away, and there is no field anywhere to put one in. That rule is only SAFE while the
 * same meaning always lays out the same way — otherwise the picture would move under the reader on
 * every load, and the next thing anybody would ask for is a place to pin it.
 *
 * The library spike (design/attention/GRAPH-SPIKE.md) measured that once, by hand, and then threw
 * the script away. This file measures it on every run, over the REAL SEEDED DATABASE, so an ELK
 * upgrade that quietly stopped being deterministic would fail a test instead of becoming a slow
 * surprise on a screen.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT CANNOT BE TESTED HERE
 * ---------------------------------------------------------------------------------------
 *
 * The runner has no DOM. So the SIZES that ELK is given cannot be measured here the way the browser
 * measures them; the tests below hand it fixed sizes, which is enough for every property they check
 * (nesting, edge containment, refusal, and above all reproducibility) and is not enough to say
 * anything about how the drawing looks. That is verified by screenshot and by eye.
 */

import { createRequire } from 'node:module'
import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'
import type { AttentionResult } from '../src/shared/attention.ts'
import type { PanelRecord } from '../src/shared/types.ts'
import type { GatedLink } from '../src/web/components/LinkPanel.tsx'
import type { GraphNode, StructureGraph } from '../src/web/components/graph/model.ts'
import type { ElkLike, Size } from '../src/web/components/graph/layout.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'

/**
 * The same elkjs the browser loads, loaded the way Node loads it.
 *
 * WHY THIS IS NOT `layoutGraph`'s OWN DYNAMIC IMPORT. elkjs ships one specifier and two builds: in a
 * browser it lays out in process, and under Node it wraps itself in an in-process worker shim. The
 * shim does not survive this runner's CommonJS interop, so the library, the options and the input
 * below are exactly what the browser uses and only the module loading differs. `layout.ts` says the
 * same thing in its own words. What this therefore does NOT prove — that the dynamic import in
 * `loadElk` resolves in a browser — is checked by opening the page.
 */
const nodeRequire = createRequire(import.meta.url)
let makeElkNode: new () => ElkLike

type Model = typeof import('../src/web/components/graph/model.ts')
type Layout = typeof import('../src/web/components/graph/layout.ts')

let t: TestDb
let model: Model
let layout: Layout
/** The whole seeded workspace, read straight out of the database the seed script wrote. */
let records: PanelRecord[]
let links: ReturnType<Model['graphLinks']>
let attention: AttentionResult

beforeAll(async () => {
  // ELK IS LOADED FIRST, BEFORE THE WINDOW STAND-IN EXISTS, and that order is load-bearing.
  // elkjs decides at load time whether it is in a browser, and it decides it by looking for a
  // `window`. Given the stand-in below it takes the browser branch, stops exporting the in-process
  // worker shim Node needs, and every layout throws `Worker is not a constructor`. Loading it while
  // this is still an ordinary Node process gets the build Node is meant to have.
  makeElkNode = nodeRequire('elkjs/lib/elk.bundled.js') as new () => ElkLike
  // Constructed once here as well, not only required. elkjs looks for its in-process worker shim
  // inside the CONSTRUCTOR, so requiring it early is not enough: one instance built now caches the
  // right module, and every instance built later — with the stand-in in place — gets it.
  void new makeElkNode()

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
  t = await freshDb()
  // Importing the seed script runs it. That is how tests/seed.test.ts does it too.
  await import('../scripts/seed.ts')
  model = await import('../src/web/components/graph/model.ts')
  layout = await import('../src/web/components/graph/layout.ts')

  records = t.api.listRecords({ workspaceId: 'default' })
  links = model.graphLinks(t.api.allGatedLinks('default'))
  // Never re-run here. The rule lives on the server and the drawing reads its answer; a second
  // implementation of "what needs a person" is the one duplication this product cannot take.
  attention = {
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
}, 60_000)

afterAll(() => {
  t.close()
})

const NOW = Date.parse('2026-08-09T12:00:00')

/**
 * The same elkjs the browser loads, loaded the way Node loads it.
 *
 * WHY THIS IS NOT `layoutGraph`'s OWN IMPORT. elkjs ships one specifier and two builds: in a browser
 * it lays out in process, and under Node it wraps itself in a worker shim that does not survive this
 * runner's CommonJS interop — `new Worker` comes back undefined and every layout throws. So the
 * library, the options and the input below are exactly what the browser uses, and only the module
 * loading differs. `layout.ts` says the same thing in its own words, and what this therefore does
 * NOT prove — that the dynamic import resolves in a browser — is checked by opening the page.
 */
const nodeElk = async (): Promise<ElkLike> => new makeElkNode()

function graphFor(
  scope: Parameters<Model['buildStructureGraph']>[0]['scope'],
  intent?: Parameters<Model['buildStructureGraph']>[0]['intent'],
): StructureGraph {
  return model.buildStructureGraph({
    records,
    links,
    attention,
    scope,
    now: NOW,
    ...(intent === undefined ? {} : { intent }),
  })
}

/** A label size for every line, so ELK is asked to keep room for the words. */
function labelSizes(graph: StructureGraph): Map<string, Size> {
  return new Map(graph.edges.map((edge) => [edge.id, { width: 120, height: 22 }]))
}

/**
 * Fixed sizes standing in for the browser's measurements.
 *
 * Deliberately NOT uniform: a compound parent and its children have to be told apart for the nesting
 * checks to mean anything, and a layout given one size for everything can hide a bug where the
 * parent's minimum is ignored.
 */
function sizes(nodes: readonly GraphNode[]): Map<string, Size> {
  return layout.nominalSizes(nodes, (node) =>
    node.kind === 'step' ? { width: 236, height: 96 } : node.kind === 'pipeline' ? { width: 280, height: 64 } : { width: 280, height: 150 },
  )
}

// ============================================================================ the seeded shape

describe('the real seeded workspace', () => {
  it('is the shape the spike measured: modules, module links, steps and step dependencies', () => {
    const modules = graphFor({ at: 'modules' })
    expect(modules.nodes.length).toBeGreaterThanOrEqual(10)
    expect(modules.nodes.every((node) => node.kind === 'module')).toBe(true)
    expect(modules.edges.length).toBeGreaterThan(0)

    const pipelines = records.filter((record) => record.kind === 'pipeline')
    const steps = pipelines
      .map((record) => graphFor({ at: 'pipeline', recordId: record.id }))
      .flatMap((graph) => graph.nodes.filter((node) => node.kind === 'step'))
    expect(steps.length).toBeGreaterThanOrEqual(50)
  })

  it('carries both kinds of gate off the real data, and both stay apart', () => {
    const kinds = new Set<string>()
    for (const record of records.filter((r) => r.kind === 'pipeline')) {
      const graph = graphFor({ at: 'pipeline', recordId: record.id })
      for (const edge of graph.edges) if (edge.gate !== null) kinds.add(edge.gate.kind)
      for (const wall of graph.walls) kinds.add(wall.gate.kind)
    }
    expect(kinds).toEqual(new Set(['hard', 'partial']))
  })

  it('finds the real partial wall on the accuracy check: both OCR runs may be done, and nothing scored', () => {
    const accuracy = records.find(
      (record) => record.kind === 'pipeline' && record.title.toLowerCase().includes('accuracy check'),
    )
    expect(accuracy, 'the seed writes an accuracy-check pipeline').toBeDefined()
    const graph = graphFor({ at: 'pipeline', recordId: accuracy!.id })
    const partial = graph.walls.find((wall) => wall.gate.kind === 'partial' && wall.reach !== null)
    expect(partial, 'a partial gate on an accuracy-check pipeline naming a step').toBeDefined()
    expect(partial!.reach!.allowed.length).toBeGreaterThan(0)
    expect(partial!.reach!.walled.length).toBeGreaterThan(0)
    // The step the wall stands at is marked, the open stretch before it is not.
    const at = graph.nodes.find((node) => node.stepId === partial!.reach!.atStepId)
    expect(at?.wall?.at).toBe('at')
    const firstAllowed = partial!.reach!.allowed[0]
    if (firstAllowed !== partial!.reach!.atStepId) {
      expect(graph.nodes.find((node) => node.stepId === firstAllowed)?.wall).toBeNull()
    }
  })
})

// ============================================================================ the ELK input

describe('the input handed to the layout engine', () => {
  it('is byte-identical for identical meaning, which is half of what reproducibility means', () => {
    const graph = graphFor({ at: 'modules' })
    const a = layout.toElkGraph(graph, sizes(graph.nodes))
    const b = layout.toElkGraph(graphFor({ at: 'modules' }), sizes(graph.nodes))
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })

  it('refuses a node it has no measurement for, rather than giving it a default size', () => {
    const graph = graphFor({ at: 'modules' })
    const short = sizes(graph.nodes)
    short.delete(graph.nodes[0]!.id)
    expect(() => layout.toElkGraph(graph, short)).toThrow(/no measured size/)
  })

  it('nests a pipeline’s steps inside it, and hangs the step-to-step lines on the same box', () => {
    const pipeline = records.find((record) => record.kind === 'pipeline' && (record.data['blockIds'] as unknown[])?.length > 3)
    const graph = graphFor({ at: 'pipeline', recordId: pipeline!.id })
    const elk = layout.toElkGraph(graph, sizes(graph.nodes))
    const box = elk.children?.find((child) => child.id === `pipe:${pipeline!.id}`)
    expect(box?.children?.length).toBe(graph.nodes.filter((node) => node.kind === 'step').length)
    const needs = graph.edges.filter((edge) => edge.relation === 'needs').length
    expect(box?.edges?.length).toBe(needs)
    // A `carries` line crosses the boundary, so it belongs to the root and not to the box.
    const carries = graph.edges.filter((edge) => edge.relation === 'carries').length
    expect(elk.edges?.length).toBe(graph.edges.length - needs)
    expect(carries).toBeGreaterThan(0)
  })
})

// ============================================================================ reproducibility

describe('the property the no-stored-positions rule stands on', () => {
  it('lays the real module graph out to identical coordinates twice', async () => {
    const graph = graphFor({ at: 'modules' })
    const measured = sizes(graph.nodes)
    const first = await layout.layoutGraph(graph, measured, nodeElk)
    const second = await layout.layoutGraph(graph, measured, nodeElk)
    expect(first.placements.size).toBe(graph.nodes.length)
    expect(layout.placementFingerprint(second)).toBe(layout.placementFingerprint(first))
  }, 30_000)

  it('lays a real compound pipeline out to identical coordinates twice, and fits the box to its steps', async () => {
    const pipeline = records.find((record) => record.kind === 'pipeline' && (record.data['blockIds'] as unknown[])?.length > 3)
    const graph = graphFor({ at: 'pipeline', recordId: pipeline!.id })
    const measured = sizes(graph.nodes)
    const first = await layout.layoutGraph(graph, measured, nodeElk)
    const second = await layout.layoutGraph(graph, measured, nodeElk)
    expect(layout.placementFingerprint(second)).toBe(layout.placementFingerprint(first))

    // The box was grown to hold what is inside it, rather than staying the size it was measured at.
    const box = first.placements.get(`pipe:${pipeline!.id}`)
    expect(box).toBeDefined()
    expect(box!.width).toBeGreaterThan(280)
    for (const node of graph.nodes.filter((n) => n.parentId !== null)) {
      const at = first.placements.get(node.id)
      expect(at, node.id).toBeDefined()
      // Child positions come back relative to the parent, which is also what React Flow expects.
      expect(at!.x).toBeGreaterThanOrEqual(0)
      expect(at!.y).toBeGreaterThanOrEqual(0)
      expect(at!.x + at!.width).toBeLessThanOrEqual(box!.width + 1)
      expect(at!.y + at!.height).toBeLessThanOrEqual(box!.height + 1)
    }
  }, 30_000)

  it('places every node or refuses, so nothing is ever drawn at a position nobody worked out', async () => {
    const graph = graphFor({ at: 'modules' })
    const result = await layout.layoutGraph(graph, sizes(graph.nodes), nodeElk)
    for (const node of graph.nodes) expect(result.placements.has(node.id), node.id).toBe(true)
  }, 30_000)

  it('redraws when one stored link is added, and comes back exactly when it is removed', async () => {
    // THE PROPERTY THE WHOLE CANONICAL/DERIVED SPLIT RESTS ON, measured in one test.
    //
    // If the picture came from stored positions, adding a link would draw a new line between two
    // cards that had not moved, and removing it would leave whatever the last edit had saved. If the
    // picture is worked out from the records alone, the drawing re-solves — several cards move,
    // because a layered layout places everything again — and taking the link away gives back the
    // ORIGINAL coordinates to the pixel, because the meaning is the original meaning again.
    //
    // tools/review.mjs performs the same three steps in a browser and photographs each one; this is
    // the version the suite can run, and it is the one that fails a build.
    const modules = records.filter((record) => record.kind === 'module')
    const from = modules[0]
    const to = modules[modules.length - 1]
    expect(from).toBeDefined()
    expect(to).toBeDefined()
    expect(from?.id).not.toBe(to?.id)

    const before = graphFor({ at: 'modules' })
    const measured = sizes(before.nodes)
    const first = layout.placementFingerprint(await layout.layoutGraph(before, measured, nodeElk))

    // An ordinary stored link, written the way the API writes one. Nothing here touches a position.
    const created = t.api.createLink({
      fromId: from!.id,
      toId: to!.id,
      type: 'blocks',
      actor: { type: 'human', id: THE_TEST_OFFICES_OWNER.id, sessionId: null },
      gate: { kind: 'hard' },
    })
    const withLink = model.graphLinks(t.api.allGatedLinks('default'))
    const changed = model.buildStructureGraph({
      records,
      links: withLink,
      attention,
      scope: { at: 'modules' },
      now: NOW,
    })
    // The meaning gained exactly one line, and the drawing is a drawing of the meaning.
    expect(changed.edges.length).toBe(before.edges.length + 1)
    const second = layout.placementFingerprint(await layout.layoutGraph(changed, sizes(changed.nodes), nodeElk))
    expect(second).not.toBe(first)

    t.api.deleteLink(created.id, { type: 'human', id: THE_TEST_OFFICES_OWNER.id, sessionId: null }, 'default')
    const restoredLinks = model.graphLinks(t.api.allGatedLinks('default'))
    const restored = model.buildStructureGraph({
      records,
      links: restoredLinks,
      attention,
      scope: { at: 'modules' },
      now: NOW,
    })
    expect(restored.edges.length).toBe(before.edges.length)
    const third = layout.placementFingerprint(await layout.layoutGraph(restored, sizes(restored.nodes), nodeElk))
    expect(third).toBe(first)
  }, 60_000)

  it('moves nothing into the database: the same records are on file after a layout as before', async () => {
    const before = t.api.listRecords({ workspaceId: 'default' }).map((record) => `${record.id}:${record.updatedAt}`).join('|')
    const graph = graphFor({ at: 'modules' })
    await layout.layoutGraph(graph, sizes(graph.nodes), nodeElk)
    const after = t.api.listRecords({ workspaceId: 'default' }).map((record) => `${record.id}:${record.updatedAt}`).join('|')
    expect(after).toBe(before)
  }, 30_000)
})

// ============================================================================ the words on a line

describe('the words ELK is told each line carries', () => {
  /**
   * THE ONE THAT COST AN AFTERNOON. ELK decides whether to reserve room for an edge label by looking
   * at its TEXT: a label with none is handed straight back at x = 0, y = 0 and no room is kept for
   * it. Every label on both drawings was therefore piled at the origin with no line near any of
   * them, which is what the photographs showed. This pins the two halves of the fix — that the text
   * is never empty, and that a size given for a line reaches ELK as a label carrying that text.
   */
  it('is never empty, whatever the line is', () => {
    const pipeline = records.find((record) => record.kind === 'pipeline' && (record.data['blockIds'] as unknown[])?.length > 3)
    const graph = graphFor({ at: 'pipeline', recordId: pipeline!.id })
    for (const edge of graph.edges) {
      expect(layout.elkLabelText(edge).trim(), edge.id).not.toBe('')
    }
  })

  it('says the type and the gate, so the words ELK reserves room for are the words on screen', () => {
    const pipeline = records.find((record) => record.kind === 'pipeline' && (record.data['blockIds'] as unknown[])?.length > 3)
    const graph = graphFor({ at: 'pipeline', recordId: pipeline!.id })
    const gated = graph.edges.find((edge) => edge.gate !== null && edge.gateWords !== null)
    expect(gated, 'the seed writes gated step dependencies').toBeDefined()
    expect(layout.elkLabelText(gated!)).toContain(gated!.label)
    expect(layout.elkLabelText(gated!)).toContain(gated!.gateWords!)
  })

  it('reaches ELK as a label with text and a size, and only for the lines a size was measured for', () => {
    const graph = graphFor({ at: 'modules' })
    const some = new Map<string, Size>([[graph.edges[0]!.id, { width: 90, height: 20 }]])
    const elk = layout.toElkGraph(graph, sizes(graph.nodes), some)
    const withLabel = (elk.edges ?? []).filter((edge) => (edge.labels?.length ?? 0) > 0)
    expect(withLabel.length).toBe(1)
    expect(withLabel[0]!.labels![0]!.text).toBe(layout.elkLabelText(graph.edges[0]!))
    expect(withLabel[0]!.labels![0]!.width).toBe(90)
  })

  /**
   * THE OTHER HALF OF NOT DRAWING THE `carries` BUNDLE, and the half that is easy to forget.
   *
   * ELK puts a centred edge label in a layer of its own and keeps room round it. Ten "carries" pills
   * therefore cost a whole column of the drawing plus its spacing — and if the lines are no longer
   * drawn, that is a column of empty grey reserved for words nobody can see. So a line that is only
   * drawn on selection is LAID OUT (it needs a real route the moment it is revealed) and never
   * LABELLED. Both halves are pinned here, because dropping either one is a silent regression: no
   * layout and a revealed line becomes a bar across the drawing; a label and the drawing gets wider
   * for nothing.
   */
  it('reserves no room for the words on a line that is only drawn when something is selected', () => {
    const pipeline = records.find((record) => record.kind === 'pipeline' && (record.data['blockIds'] as unknown[])?.length > 3)
    const graph = graphFor({ at: 'pipeline', recordId: pipeline!.id })
    const held = graph.edges.filter((edge) => edge.drawn === 'on-selection')
    expect(held.length, 'the seeded pipeline has modules carrying its steps').toBeGreaterThan(0)
    // Every line is offered a measured size, exactly as a caller that measured them all would.
    const elk = layout.toElkGraph(graph, sizes(graph.nodes), labelSizes(graph))
    const all = [...(elk.edges ?? []), ...(elk.children ?? []).flatMap((child) => child.edges ?? [])]
    for (const id of held.map((edge) => edge.id)) {
      const laid = all.find((edge) => edge.id === id)
      expect(laid, `${id} is still laid out, so it has a route when it is revealed`).toBeDefined()
      expect(laid!.labels ?? [], `${id} carries no label`).toHaveLength(0)
    }
    // And the lines that ARE drawn keep theirs, so this cannot pass by labelling nothing at all.
    const shown = graph.edges.filter((edge) => edge.drawn === 'always')
    expect(shown.some((edge) => (all.find((laid) => laid.id === edge.id)?.labels?.length ?? 0) > 0)).toBe(true)
  })

  it('makes ELK keep room between the layers for them, rather than drawing them over the next card', async () => {
    const graph = graphFor({ at: 'modules' })
    const measured = sizes(graph.nodes)
    const tight = await layout.layoutGraph(graph, measured, nodeElk)
    const roomy = await layout.layoutGraph(graph, measured, nodeElk, new Map(graph.edges.map((edge) => [edge.id, { width: 260, height: 40 }])))
    // A drawing whose labels are 260px wide cannot be the same size as one whose labels ELK has
    // never heard of. Which axis grows depends on the direction, so this asks for area.
    const area = (result: Awaited<ReturnType<Layout['layoutGraph']>>) => {
      const box = layout.drawingSize(graph.nodes, result.placements, result.routes)
      return box.width * box.height
    }
    expect(area(roomy)).toBeGreaterThan(area(tight))
  }, 30_000)
})

// ============================================================================ the route of a line

describe('the path a line is drawn along', () => {
  it('comes back for every line, in the canvas’s own coordinates, or is reported', async () => {
    const pipeline = records.find((record) => record.kind === 'pipeline' && (record.data['blockIds'] as unknown[])?.length > 3)
    const graph = graphFor({ at: 'pipeline', recordId: pipeline!.id })
    const result = await layout.layoutGraph(graph, sizes(graph.nodes), nodeElk, labelSizes(graph))
    const drawable = graph.edges.filter(
      (edge) => graph.nodes.some((n) => n.id === edge.from) && graph.nodes.some((n) => n.id === edge.to),
    )
    const missing = drawable.filter((edge) => !result.routes.has(edge.id))
    // Either every line has a route, or the ones that do not are named in the report. Never silent.
    if (missing.length > 0) {
      expect(result.report.unhonoured.some((entry) => entry.hint === 'the route of the line')).toBe(true)
    }
    for (const edge of drawable) {
      const route = result.routes.get(edge.id)
      if (route === undefined) continue
      expect(route.points.length, edge.id).toBeGreaterThanOrEqual(2)
      for (const point of route.points) {
        expect(Number.isFinite(point.x) && Number.isFinite(point.y), edge.id).toBe(true)
      }
    }
  }, 30_000)

  it('lifts a step-to-step line out of the pipeline box, so it is in the same space as the cards', async () => {
    const pipeline = records.find((record) => record.kind === 'pipeline' && (record.data['blockIds'] as unknown[])?.length > 3)
    const graph = graphFor({ at: 'pipeline', recordId: pipeline!.id })
    const result = await layout.layoutGraph(graph, sizes(graph.nodes), nodeElk, labelSizes(graph))
    const box = result.placements.get(`pipe:${pipeline!.id}`)
    expect(box).toBeDefined()
    const needs = graph.edges.find((edge) => edge.relation === 'needs' && result.routes.has(edge.id))
    expect(needs, 'the seed writes step dependencies').toBeDefined()
    const route = result.routes.get(needs!.id)!
    // A line inside the box has to start inside the box in CANVAS coordinates. ELK gives it relative
    // to the box; if that were handed on unchanged the line would be drawn near the origin of the
    // whole drawing instead of between its two steps, which is a line joining nothing.
    for (const point of route.points) {
      expect(point.x).toBeGreaterThanOrEqual(box!.x - 1)
      expect(point.y).toBeGreaterThanOrEqual(box!.y - 1)
    }
  }, 30_000)
})

describe('turning points into a path', () => {
  it('draws a straight line between two points', () => {
    expect(layout.roundedPath([{ x: 0, y: 0 }, { x: 100, y: 0 }])).toBe('M 0 0 L 100 0')
  })

  it('rounds a corner rather than cutting it square', () => {
    const d = layout.roundedPath([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }], 10)
    expect(d).toContain('Q 100 0')
    expect(d.startsWith('M 0 0')).toBe(true)
    expect(d.endsWith('L 100 100')).toBe(true)
  })

  it('never rounds a corner by more than half of the shorter segment meeting at it', () => {
    // A four-pixel jog rounded by nine would turn the corner inside out and draw a line that
    // doubles back through the card it came from.
    const d = layout.roundedPath([{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 200 }], 9)
    expect(d).not.toContain('NaN')
    expect(d).toContain('M 0 0')
    const numbers = [...d.matchAll(/-?\d+(\.\d+)?/g)].map((m) => Number(m[0]))
    expect(numbers.every((n) => Number.isFinite(n))).toBe(true)
    expect(Math.min(...numbers)).toBeGreaterThanOrEqual(0)
  })

  it('says nothing about a path with no points, rather than inventing one', () => {
    expect(layout.roundedPath([])).toBe('')
    expect(layout.roundedPath([{ x: 5, y: 7 }])).toBe('M 5 7')
  })
})

/**
 * WHERE THE WORD GOES ON A LINE ELK RESERVED NO ROOM FOR.
 *
 * A line drawn only on selection is given no ELK label on purpose, so when it IS drawn its word has
 * no reserved spot. The honest answer is the middle of the route it actually follows — not the
 * middle bend, and not the average of the points, because an orthogonal route round a pipeline box
 * is a couple of short jogs at one end and one long run at the other, and both of those land the
 * word in a corner where nobody is looking.
 */
describe('the middle of a route', () => {
  it('is half the length along, not half the points', () => {
    // Two short jogs then a long run. The middle bend is at x = 10; half the length is far past it.
    const points = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 210, y: 0 }]
    expect(layout.routeMidpoint(points)).toEqual({ x: 105, y: 0 })
  })

  it('follows a corner rather than cutting across it', () => {
    const points = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }]
    // 200 long in all, so the middle is 100 along: exactly the corner.
    expect(layout.routeMidpoint(points)).toEqual({ x: 100, y: 0 })
  })

  it('answers for a route with one point, and refuses one with none', () => {
    expect(layout.routeMidpoint([{ x: 4, y: 9 }])).toEqual({ x: 4, y: 9 })
    expect(layout.routeMidpoint([])).toBeNull()
  })

  it('answers for a route whose points are all in one place, rather than dividing by zero', () => {
    expect(layout.routeMidpoint([{ x: 3, y: 3 }, { x: 3, y: 3 }])).toEqual({ x: 3, y: 3 })
  })

  it('lands on the real route of a line the drawing only shows when it is selected', async () => {
    const pipeline = records.find((record) => record.kind === 'pipeline' && (record.data['blockIds'] as unknown[])?.length > 3)
    const graph = graphFor({ at: 'pipeline', recordId: pipeline!.id })
    const result = await layout.layoutGraph(graph, sizes(graph.nodes), nodeElk, labelSizes(graph))
    const held = graph.edges.filter((edge) => edge.drawn === 'on-selection')
    expect(held.length).toBeGreaterThan(0)
    for (const edge of held) {
      const route = result.routes.get(edge.id)
      // It was laid out even though it is not drawn, which is why revealing it is a real line.
      expect(route, `${edge.id} has a route`).toBeDefined()
      expect(route!.label, `${edge.id} was given no reserved label spot`).toBeNull()
      const middle = layout.routeMidpoint(route!.points)!
      const xs = route!.points.map((point) => point.x)
      const ys = route!.points.map((point) => point.y)
      expect(middle.x).toBeGreaterThanOrEqual(Math.min(...xs) - 0.001)
      expect(middle.x).toBeLessThanOrEqual(Math.max(...xs) + 0.001)
      expect(middle.y).toBeGreaterThanOrEqual(Math.min(...ys) - 0.001)
      expect(middle.y).toBeLessThanOrEqual(Math.max(...ys) + 0.001)
    }
  }, 30_000)
})

// ============================================================================ presentation intent

/** The stored arrangement used by the tests below: two lanes, an order in each, and one `near`. */
function arrangeModules(): { intent: Parameters<Model['buildStructureGraph']>[0]['intent']; ids: string[] } {
  const modules = [...records.filter((record) => record.kind === 'module')].sort((a, b) => (a.id < b.id ? -1 : 1))
  const ids = modules.map((record) => record.id)
  const nodes: Record<string, Record<string, unknown>> = {}
  modules.slice(0, 3).forEach((record, index) => {
    nodes[record.id] = { lane: 'the arm', order: index }
  })
  modules.slice(3, 6).forEach((record, index) => {
    nodes[record.id] = { lane: 'perception', order: index }
  })
  if (modules[6] !== undefined) nodes[modules[6].id] = { role: 'compact', emphasis: 'muted' }
  if (modules[7] !== undefined && modules[1] !== undefined) nodes[modules[7].id] = { near: modules[1].id }
  return { intent: { direction: 'right', nodes } as never, ids }
}

describe('reading the stored arrangement into the layout', () => {
  it('turns a lane and an order into one sort key, lanes first, and only when something was arranged', () => {
    const plain = graphFor({ at: 'modules' })
    expect(layout.positionHints(plain.nodes).size, 'an unarranged drawing is handed no positions at all').toBe(0)

    const { intent } = arrangeModules()
    const arranged = graphFor({ at: 'modules' }, intent)
    const hints = layout.positionHints(arranged.nodes)
    expect(hints.size).toBe(arranged.nodes.length)

    const laneOf = new Map(arranged.nodes.map((node) => [node.id, node.presentation.lane]))
    const keys = [...hints.entries()]
    const first = keys.filter(([id]) => laneOf.get(id) === 'the arm').map(([, key]) => key)
    const second = keys.filter(([id]) => laneOf.get(id) === 'perception').map(([, key]) => key)
    expect(first.length).toBeGreaterThan(0)
    expect(second.length).toBeGreaterThan(0)
    // ONE LANE ENTIRELY BEFORE THE OTHER, whatever their orders — and the test does not say WHICH
    // way round. Lanes come out in the order they were first met rather than alphabetically, and the
    // seed gives every record a fresh id on every run, so which module is met first changes between
    // runs. Asserting a particular lane came first passed two runs in three and failed the rest.
    const apart =
      Math.max(...first) < Math.min(...second) || Math.max(...second) < Math.min(...first)
    expect(apart, 'the two lanes were interleaved rather than kept apart').toBe(true)
  })

  it('puts a `near` node immediately after the one it names, without displacing anything else', () => {
    const { intent } = arrangeModules()
    const graph = graphFor({ at: 'modules' }, intent)
    const hints = layout.positionHints(graph.nodes)
    const asking = graph.nodes.find((node) => node.presentation.near !== null)
    expect(asking, 'the arrangement stores a near').toBeDefined()
    const anchor = hints.get(asking!.presentation.near!)
    expect(anchor).toBeDefined()
    expect(hints.get(asking!.id)).toBe(anchor! + 0.5)
  })

  it('sets a position on the ELK node only for an arranged drawing, and on the axis the order runs along', () => {
    const { intent } = arrangeModules()
    const arranged = graphFor({ at: 'modules' }, intent)
    const elk = layout.toElkGraph(arranged, sizes(arranged.nodes))
    const positioned = (elk.children ?? []).filter((child) => child.layoutOptions?.['elk.position'] !== undefined)
    expect(positioned.length).toBe(arranged.nodes.length)
    // The stored direction is `right`, so the in-layer order runs down the page: x stays 0.
    expect(layout.directionFor(arranged)).toBe('RIGHT')
    for (const child of positioned) expect(String(child.layoutOptions!['elk.position'])).toMatch(/^\(0,/)

    const plain = layout.toElkGraph(graphFor({ at: 'modules' }), sizes(graphFor({ at: 'modules' }).nodes))
    expect((plain.children ?? []).some((child) => child.layoutOptions?.['elk.position'] !== undefined)).toBe(false)
  })

  it('obeys a stored direction rather than the one Mole Office would have chosen', () => {
    expect(layout.directionFor(graphFor({ at: 'modules' }))).toBe('DOWN')
    expect(layout.directionFor(graphFor({ at: 'modules' }, { direction: 'right' } as never))).toBe('RIGHT')
    const pipeline = records.find((record) => record.kind === 'pipeline')
    expect(layout.directionFor(graphFor({ at: 'pipeline', recordId: pipeline!.id }))).toBe('RIGHT')
    expect(
      layout.directionFor(graphFor({ at: 'pipeline', recordId: pipeline!.id }, { direction: 'down' } as never)),
    ).toBe('DOWN')
  })
})

describe('what the layout says it did with the arrangement', () => {
  /**
   * THE RULE THIS PRODUCT BANS BREAKING. A stored hint that quietly did nothing is indistinguishable
   * on screen from one that worked, so every hint has to come back in `honoured` or in `unhonoured`
   * with the reason in words. This checks the property over the whole vocabulary rather than over
   * one hint, so a new field added to NodeIntent that nobody reports on fails here.
   */
  it('accounts for every stored hint, in one list or the other', async () => {
    const { intent } = arrangeModules()
    const graph = graphFor({ at: 'modules' }, intent)
    const result = await layout.layoutGraph(graph, sizes(graph.nodes), nodeElk, labelSizes(graph))
    const said = [
      ...result.report.honoured,
      ...result.report.unhonoured.map((entry) => `${entry.hint} on ${entry.target}`),
    ].join('\n')

    const stored = (intent as { nodes: Record<string, Record<string, unknown>> }).nodes
    for (const [target, hints] of Object.entries(stored)) {
      for (const hint of Object.keys(hints)) {
        expect(said, `${hint} on ${target} is in neither list`).toContain(hint)
      }
    }
    expect(said).toContain('direction')
  }, 30_000)

  it('keeps every unhonoured hint’s reason in words a person can act on', async () => {
    const { intent } = arrangeModules()
    const graph = graphFor({ at: 'modules' }, intent)
    const result = await layout.layoutGraph(graph, sizes(graph.nodes), nodeElk, labelSizes(graph))
    for (const entry of result.report.unhonoured) {
      expect(entry.because.length, entry.hint).toBeGreaterThan(30)
      // A reason is a sentence, not a code. This is the standing rule for every message in Mole Office.
      expect(entry.because).toMatch(/[.!?]$/)
      expect(entry.target.length).toBeGreaterThan(0)
    }
  }, 30_000)

  it('reports an order the layout could not take, rather than letting it look applied', async () => {
    // An order that runs BACKWARDS against what waits on what cannot be satisfied without crossing
    // every line, so a layered layout will not take it. That is a legitimate answer, and it has to
    // be a visible one.
    const pipeline = records.find((record) => record.kind === 'pipeline' && (record.data['blockIds'] as unknown[])?.length > 5)
    const blockIds = pipeline!.data['blockIds'] as string[]
    const nodes: Record<string, Record<string, unknown>> = {}
    // A BLOCK IS ADDRESSED BY ITS RECORD ID, like every other node. It used to be `step:<step id>`,
    // a second form of target with the prefix declared twice, once here and once on the server.
    blockIds.forEach((id, index) => {
      nodes[id] = { order: blockIds.length - index }
    })
    const graph = graphFor({ at: 'pipeline', recordId: pipeline!.id }, { nodes } as never)
    const result = await layout.layoutGraph(graph, sizes(graph.nodes), nodeElk, labelSizes(graph))
    const orders = result.report.unhonoured.filter((entry) => entry.hint.startsWith('order:'))
    const kept = result.report.honoured.filter((line) => line.startsWith('order:'))
    // Whichever way ELK settles it, every step that asked for a place is accounted for once.
    expect(orders.length + kept.length).toBeGreaterThan(0)
    for (const entry of orders) expect(entry.because).toContain('crossing')
  }, 30_000)

  it('carries the model’s own entries through untouched, so nothing is answered twice', async () => {
    const { intent } = arrangeModules()
    const graph = graphFor({ at: 'modules' }, intent)
    const result = await layout.layoutGraph(graph, sizes(graph.nodes), nodeElk, labelSizes(graph))
    for (const line of graph.report.honoured) expect(result.report.honoured).toContain(line)
    for (const entry of graph.report.unhonoured) {
      expect(result.report.unhonoured.some((other) => other.target === entry.target && other.hint === entry.hint)).toBe(true)
    }
  }, 30_000)

  it('is still reproducible with an arrangement stored: the same meaning and the same intent draw the same', async () => {
    const { intent } = arrangeModules()
    const graph = graphFor({ at: 'modules' }, intent)
    const measured = sizes(graph.nodes)
    const labels = labelSizes(graph)
    const first = await layout.layoutGraph(graph, measured, nodeElk, labels)
    const second = await layout.layoutGraph(graphFor({ at: 'modules' }, intent), measured, nodeElk, labels)
    expect(layout.placementFingerprint(second)).toBe(layout.placementFingerprint(first))
  }, 30_000)

  it('draws a different picture with an arrangement than without one, so the arrangement is doing something', async () => {
    const plain = graphFor({ at: 'modules' })
    const { intent } = arrangeModules()
    const arranged = graphFor({ at: 'modules' }, intent)
    const before = layout.placementFingerprint(await layout.layoutGraph(plain, sizes(plain.nodes), nodeElk))
    const after = layout.placementFingerprint(await layout.layoutGraph(arranged, sizes(arranged.nodes), nodeElk))
    expect(after).not.toBe(before)
  }, 30_000)
})

describe('a folded group', () => {
  /**
   * The fold itself is `model.ts`'s: it leaves the steps out of the graph and carries the count on
   * the box. What is checked here is that the LAYOUT of a folded drawing is a smaller drawing of the
   * same thing — fewer boxes, still every line accounted for, and the count still on screen.
   */
  it('lays out fewer boxes and keeps the count of what is inside', async () => {
    const pipeline = records.find((record) => record.kind === 'pipeline' && (record.data['blockIds'] as unknown[])?.length > 3)
    const open = graphFor({ at: 'pipeline', recordId: pipeline!.id })
    const folded = graphFor({ at: 'pipeline', recordId: pipeline!.id }, { nodes: { [pipeline!.id]: { collapsed: true } } } as never)
    expect(folded.nodes.length).toBeLessThan(open.nodes.length)

    const box = folded.nodes.find((node) => node.id === `pipe:${pipeline!.id}`)
    expect(box, 'the box itself is still drawn').toBeDefined()
    const count = box!.badges.find((badge) => badge.key === 'folded')
    expect(count, 'the count of what is folded away is on the box').toBeDefined()
    expect(count!.count).toBe((pipeline!.data['blockIds'] as unknown[]).length)

    const result = await layout.layoutGraph(folded, sizes(folded.nodes), nodeElk, labelSizes(folded))
    for (const node of folded.nodes) expect(result.placements.has(node.id), node.id).toBe(true)
    expect(result.report.unhonoured.filter((entry) => entry.hint.startsWith('collapsed')).length).toBe(0)
  }, 30_000)
})

// ============================================================================ the window onto it

describe('how big the window is and what it opens at', () => {
  const nodeOf = (id: string, parentId: string | null): GraphNode =>
    ({ id, parentId, presentation: { lane: null, order: null, near: null, collapsed: false, role: 'normal' } }) as unknown as GraphNode

  it('measures the drawing from the top-level boxes, the routes and the words on them', () => {
    const nodes = [nodeOf('a', null), nodeOf('b', null), nodeOf('child', 'a')]
    const placements = new Map([
      ['a', { x: 100, y: 100, width: 200, height: 100 }],
      ['b', { x: 400, y: 100, width: 200, height: 100 }],
      // A child is placed relative to its parent. Counting it against the origin would ask for a
      // window about twice as big as the drawing.
      ['child', { x: 10, y: 10, width: 50, height: 50 }],
    ])
    const routes = new Map([['e', { points: [{ x: 300, y: 150 }, { x: 400, y: 150 }], label: { x: 350, y: 60, width: 80, height: 20 } }]])
    const box = layout.drawingSize(nodes, placements, routes)
    expect(box.minX).toBe(100)
    // The label sits above every card, and leaving it out is what cut the first letters off the
    // words on the leftmost lines when the canvas opened.
    expect(box.minY).toBe(50)
    expect(box.width).toBe(500)
    expect(box.height).toBe(150)
  })

  it('opens at reading size when the drawing fits, and centres it', () => {
    const drawing = { minX: 0, minY: 0, width: 400, height: 300 }
    const view = layout.openingViewport(drawing, drawing, 1000, 600)
    expect(view.zoom).toBe(layout.READING_ZOOM)
    expect(view.x).toBe(300)
    expect(view.y).toBe(150)
  })

  it('never opens smaller than a card can be read at, however big the drawing is', () => {
    // THE WHOLE POINT OF THIS PASS. The old canvas fitted everything and settled at 0.36, where the
    // type is four pixels tall. Ten screens of drawing still opens at the readable floor.
    const huge = { minX: 0, minY: 0, width: 12_000, height: 9_000 }
    expect(layout.openingZoom(huge, 1000, 600)).toBe(layout.READABLE_FLOOR)
    expect(layout.fitZoomFor(huge, 1000, 600)).toBeLessThan(0.1)
    expect(layout.openingViewport(huge, huge, 1000, 600).zoom).toBe(layout.READABLE_FLOOR)
  })

  it('shows a drawing that nearly fits whole, rather than cutting it off to stay at reading size', () => {
    const nearly = { minX: 0, minY: 0, width: 1040, height: 400 }
    const zoom = layout.openingZoom(nearly, 1000, 600)
    expect(zoom).toBeLessThan(layout.READING_ZOOM)
    expect(zoom).toBeGreaterThanOrEqual(layout.READABLE_FLOOR)
    expect(layout.visibleFraction(nearly, 1000, 600, zoom)).toBeCloseTo(1, 5)
  })

  it('opens where the lines are, not at a corner of empty unconnected cards', async () => {
    // The whole-project drawing is twelve modules with five links between them, and ELK packs the
    // ones that are joined to nothing wherever they fit. Opening at the corner opened on cards with
    // no lines at all, in a picture whose entire purpose is what depends on what.
    const graph = graphFor({ at: 'modules' })
    const result = await layout.layoutGraph(graph, sizes(graph.nodes), nodeElk, labelSizes(graph))
    const whole = layout.drawingSize(graph.nodes, result.placements, result.routes)
    const focus = layout.drawingFocus(graph, result.placements, result.routes)
    expect(focus.width).toBeLessThanOrEqual(whole.width)
    expect(focus.height).toBeLessThanOrEqual(whole.height)
    const joined = new Set(graph.edges.flatMap((edge) => [edge.from, edge.to]))
    // Every card a line touches is inside the part the view opens on.
    for (const node of graph.nodes.filter((n) => n.parentId === null && joined.has(n.id))) {
      const at = result.placements.get(node.id)!
      expect(at.x + at.width, node.title).toBeGreaterThanOrEqual(focus.minX)
      expect(at.x, node.title).toBeLessThanOrEqual(focus.minX + focus.width)
    }
  }, 30_000)

  it('never opens past the drawing’s own edges, so the window is full of drawing rather than grey', () => {
    const drawing = { minX: 0, minY: 0, width: 4000, height: 3000 }
    // A focus at the far corner would put the drawing off the left of the window if it were followed.
    const focus = { minX: 3900, minY: 2900, width: 100, height: 100 }
    const view = layout.openingViewport(drawing, focus, 1000, 600)
    const rightEdge = view.x + drawing.width * view.zoom
    expect(rightEdge).toBeGreaterThanOrEqual(1000 - layout.CANVAS_PAD - 1)
    expect(view.x).toBeLessThanOrEqual(layout.CANVAS_PAD)
  })

  it('sizes the window between the two limits card.ts states, and refuses to guess from nothing', () => {
    expect(layout.boxHeightFor({ minX: 0, minY: 0, width: 900, height: 90 }, 1000)).toBe(300)
    expect(layout.boxHeightFor({ minX: 0, minY: 0, width: 900, height: 9000 }, 1000)).toBe(760)
    expect(layout.boxHeightFor({ minX: 0, minY: 0, width: 900, height: 400 }, 0)).toBeNull()
    expect(layout.boxHeightFor({ minX: 0, minY: 0, width: 0, height: 0 }, 1000)).toBeNull()
  })

  it('says honestly how much of the drawing the window holds', () => {
    const drawing = { minX: 0, minY: 0, width: 2000, height: 1200 }
    expect(layout.visibleFraction(drawing, 1000, 600, 1)).toBeCloseTo(0.25, 5)
    expect(layout.visibleFraction(drawing, 4000, 2400, 1)).toBe(1)
  })
})

/**
 * GROUPING AND SHAPE: what the planning graph derives about a drawing before it places anything.
 *
 * ---------------------------------------------------------------------------------------
 * THE FOUR MEASUREMENTS THESE WERE WRITTEN FOR, ALL FROM THE LIVE CORPUS AT 1440x900
 * ---------------------------------------------------------------------------------------
 *
 *   THE PANE WAS 1,144x760 OVER A 2,645x980 PLANE, with three of fourteen cards fully visible.
 *   2,062 of those 2,645px was ONE FIVE-STEP CHAIN drawn as five full-size ELK layers.
 *   The drawing was TWO COMPONENTS sharing zero links, separated by 78px and nothing else.
 *   THE ONE DEADLINE SAT AT x=1138 IN A 1,144px PANE — off screen, on a panel titled
 *   "What this period is working toward".
 *
 * All four are arithmetic over ids, boxes and sizes, so all four are provable here rather than by
 * looking at a photograph. `PlanGraph.tsx` holds nothing but the calls.
 */
describe('what is joined to what', () => {
  it('separates ids nothing links, and keeps the order they arrived in', () => {
    const ids = ['a', 'b', 'c', 'd', 'e']
    const edges = [
      { from: 'a', to: 'b' },
      { from: 'd', to: 'e' },
    ]
    expect(layout.connectedComponents(ids, edges)).toEqual([['a', 'b'], ['c'], ['d', 'e']])
  })

  it('joins through a chain rather than only through a direct link', () => {
    const groups = layout.connectedComponents(
      ['a', 'b', 'c', 'd'],
      [
        { from: 'a', to: 'b' },
        { from: 'b', to: 'c' },
      ],
    )
    expect(groups).toEqual([['a', 'b', 'c'], ['d']])
  })

  it('ignores a line with an end this drawing does not hold, rather than inventing a group for it', () => {
    // A link to a record the drawing left out is a real state of this corpus: the plan graph draws
    // one project and the links table is workspace-wide. It joins nothing HERE and must not merge.
    const groups = layout.connectedComponents(['a', 'b'], [{ from: 'a', to: 'somewhere-else' }, { from: 'b', to: 'a' }])
    expect(groups).toEqual([['a', 'b']])
  })

  it('counts the lines that cross between two groups, which for components is zero by construction', () => {
    const ids = ['a', 'b', 'c', 'd']
    const edges = [
      { from: 'a', to: 'b' },
      { from: 'c', to: 'd' },
    ]
    const groups = layout.connectedComponents(ids, edges)
    expect(layout.crossingCount(groups, edges)).toBe(0)
    // And it is NOT always zero: a grouping somebody chose rather than measured has real crossings,
    // which is what the number is there to report.
    expect(layout.crossingCount([['a', 'c'], ['b', 'd']], edges)).toBe(2)
  })
})

describe('a group that is one straight run', () => {
  const step = (from: string, to: string, type = 'blocks') => ({ from, to, type })

  it('reads the run in order from its one head', () => {
    const run = layout.straightRun(
      ['c', 'a', 'b'],
      [step('a', 'b'), step('b', 'c')],
    )
    expect(run).not.toBeNull()
    expect(run?.order).toEqual(['a', 'b', 'c'])
    expect(run?.type).toBe('blocks')
  })

  it('refuses a branch, because the second branch has nowhere to go on a row', () => {
    expect(layout.straightRun(['a', 'b', 'c'], [step('a', 'b'), step('a', 'c')])).toBeNull()
  })

  it('refuses a join, for the same reason read the other way', () => {
    expect(layout.straightRun(['a', 'b', 'c'], [step('a', 'c'), step('b', 'c')])).toBeNull()
  })

  it('refuses a cycle, which has no first card for a row to start at', () => {
    expect(layout.straightRun(['a', 'b', 'c'], [step('a', 'b'), step('b', 'c'), step('c', 'a')])).toBeNull()
  })

  it('refuses MIXED TYPES, because one arrow between chips would be a word the data never said', () => {
    // `A blocks B` then `B part of C` drawn as A → B → C reads as one ordering. It is two claims.
    expect(layout.straightRun(['a', 'b', 'c'], [step('a', 'b', 'blocks'), step('b', 'c', 'part_of')])).toBeNull()
  })

  it('refuses a group whose lines do not reach every card in it', () => {
    expect(layout.straightRun(['a', 'b', 'c'], [step('a', 'b')])).toBeNull()
    expect(layout.straightRun(['a'], [])).toBeNull()
  })

  it('reads the live corpus’s five-step wave chain, which was 2,062px of a 2,645px plane', () => {
    const ids = ['62xRE1uLoJbd', 'PiQzVdq42ufa', 'k28tJs1eU50P', 'ZQY7aTXsDInE', 'dTVY0TJsBeSM']
    const run = layout.straightRun(ids, [
      step('62xRE1uLoJbd', 'PiQzVdq42ufa'),
      step('PiQzVdq42ufa', 'k28tJs1eU50P'),
      step('k28tJs1eU50P', 'ZQY7aTXsDInE'),
      step('ZQY7aTXsDInE', 'dTVY0TJsBeSM'),
    ])
    expect(run?.order).toEqual(ids)
  })
})

describe('where the pane opens, and what a fit costs', () => {
  it('centres the anchor rather than resting at an origin that means nothing', () => {
    // The measured case: the deadline was 268px wide at x=1138 in a 1,144px pane.
    const at = layout.centreScroll(
      { x: 1138, y: 60, width: 268, height: 91 },
      { width: 1144, height: 620 },
      { width: 2645, height: 980 },
    )
    expect(at.left).toBe(Math.round(1138 + 134 - 572))
    // And the card really is inside the window once it has scrolled there.
    expect(1138).toBeGreaterThanOrEqual(at.left)
    expect(1138 + 268).toBeLessThanOrEqual(at.left + 1144)
  })

  it('never scrolls past the plane, so a centred anchor near an edge leaves no half window of grey', () => {
    const near = layout.centreScroll({ x: 0, y: 0, width: 100, height: 40 }, { width: 500, height: 300 }, { width: 900, height: 600 })
    expect(near).toEqual({ left: 0, top: 0 })
    const far = layout.centreScroll({ x: 850, y: 560, width: 50, height: 40 }, { width: 500, height: 300 }, { width: 900, height: 600 })
    expect(far).toEqual({ left: 400, top: 300 })
  })

  it('does not scroll a plane that fits, because there is nowhere to go', () => {
    expect(
      layout.centreScroll({ x: 10, y: 10, width: 100, height: 40 }, { width: 900, height: 600 }, { width: 400, height: 300 }),
    ).toEqual({ left: 0, top: 0 })
  })

  it('says when the whole shape only fits BELOW reading size, which is a thumbnail and not a fit', () => {
    // The measured layers plane against the measured pane: 1,629x564 in 1,144x620.
    const wide = layout.fitWithinReading({ minX: 0, minY: 0, width: 1629, height: 564 }, 1144, 620)
    expect(wide.zoom).toBeLessThan(layout.READABLE_FLOOR)
    expect(wide.belowReading).toBe(true)
    // A drawing that fits at reading size is not a thumbnail and must not be called one.
    const small = layout.fitWithinReading({ minX: 0, minY: 0, width: 400, height: 200 }, 1144, 620)
    expect(small.belowReading).toBe(false)
    expect(small.whole).toBe(true)
  })
})
