// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A STEP WITH STEPS INSIDE IT, AND TWO STEPS THAT ARE NOT JOINED — WHICH IS TWO DIFFERENT FACTS.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS IS FOR
 * ---------------------------------------------------------------------------------------
 *
 * Step 9's audit (`design/round-nine/step9-graph-vocabulary.md`) took the seven graph constructs the
 * owner named and measured each one against two real pipelines. Four of them — condition, if/else,
 * loop, retry — are produced by neither pipeline and are not built. Two — fork and join — are
 * already stored as the degree of a node and building a `role` word for them would be the same fact
 * in two places. **One is needed and one bit is missing**, and this file holds both.
 *
 *   1. SUBPIPELINE. `pipeline part_of block` is legal today: `createLink` checks a cycle and a
 *      second parent and nothing else. Nothing read it. `readPipelineBlocks` gathers `implements`
 *      and `blocks` links; the pipeline drawing skips every stored link with a block at either end.
 *      So a block holding six steps drew exactly like a block holding none. The audit measured the
 *      cost on the live campaign: `Wave 5 — Planning MVP` keeps six sub-steps in one prose string
 *      inside `measured`, because there is nowhere else to put them.
 *
 *   2. DELIBERATELY CONCURRENT, AGAINST NOBODY RECORDED A DEPENDENCY. Two steps with no `blocks`
 *      link between them are already storable and already stored — 7 of the 17 blocks on the live
 *      campaign pipeline have no dependency link at either end. The drawing lays them out side by
 *      side, and side by side reads as "these run in parallel". Nothing stored said that. One
 *      optional field on the pipeline says which, and absence is a third answer.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE FIXTURE IS BUILT THROUGH THE ORDINARY WRITES
 * ---------------------------------------------------------------------------------------
 *
 * Every block here is filed by `addBlock` and every link by `createLink`, so if either of them ever
 * refuses the shape this reader depends on, this file goes red rather than testing a hand-built
 * object the product cannot produce. The sub-pipeline in particular is only worth reading if the
 * API will store it, and that is asserted first.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AGENT, freshDb, type TestDb } from './helpers.ts'
import { computeAttention } from '../src/shared/attention.ts'
import type { PanelRecord } from '../src/shared/types.ts'
import { parseDueStamp } from '../src/web/lib/attention.ts'
import type { GraphNode, StructureGraph } from '../src/web/components/graph/model.ts'
import { englishWords } from '../src/shared/words/joined.ts'

type Model = typeof import('../src/web/components/graph/model.ts')

let t: TestDb

beforeEach(async () => {
  // `src/web/api.ts` reads window.localStorage at module scope, and model.ts reaches it through the
  // component library. The smallest stand-in that lets the module load; nothing here is under test.
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
})

afterEach(() => {
  t.close()
})

const NOW = Date.parse('2026-08-20T12:00:00')

/** What the server says needs a person, computed the way the page gets it. */
function attentionNow(): ReturnType<typeof computeAttention> {
  return computeAttention({
    now: NOW,
    records: t.api.listRecords({ workspaceId: 'default', includeDeleted: true }),
    links: t.client.sqlite
      .prepare(
        'select id, from_id as fromId, to_id as toId, type, inferred, created_at as createdAt, created_by as createdBy from links',
      )
      .all() as never,
    changes: t.api
      .listChanges({ workspaceId: 'default', limit: 20000 })
      .map((row) => ({ ...row, op: row.op as never, actorType: row.actorType as never, origin: null })),
    resources: [],
    dueMs: parseDueStamp,
  })
}

/** The pipeline drawing, built the way the page builds it: every record, every link, real attention. */
async function drawing(recordId: string): Promise<StructureGraph> {
  const { buildStructureGraph, graphLinks }: Model = await import('../src/web/components/graph/model.ts')
  const records = t.api.listRecords({ workspaceId: 'default' }) as PanelRecord[]
  const links = graphLinks(t.api.allGatedLinks('default'))
  return buildStructureGraph({
    records,
    links,
    attention: attentionNow(),
    scope: { at: 'pipeline', recordId },
    now: NOW,
  })
}

function pipelineOf(title: string, data: Record<string, unknown> = {}): PanelRecord {
  return t.api.createRecord({
    workspaceId: 'default',
    kind: 'pipeline',
    title,
    data: { blockIds: [], ...data },
    actor: AGENT,
  }) as PanelRecord
}

const stepsOf = (graph: StructureGraph): GraphNode[] => graph.nodes.filter((node) => node.kind === 'step')
const badgeWords = (node: GraphNode): string[] => node.badges.map((badge) => badge.short)

describe('a block that holds a pipeline of its own', () => {
  it('is storable through the ordinary route, which is why there is a reader to write', () => {
    // THE HALF OF THE FINDING THAT MAKES THE OTHER HALF WORTH BUILDING. If `part_of` refused this
    // shape, the subpipeline would need a migration and step 50 would be a data-model change. It
    // does not: a sub-pipeline has one parent and there is no cycle, because the outer pipeline
    // holds the block through `blockIds` and the block holds the sub-pipeline through `part_of`.
    const outer = pipelineOf('Perception to grasp')
    const step = t.blocks.addBlock(outer.id, { name: 'IK and planning', state: 'doing' }, AGENT).block
    const inner = pipelineOf('IK and planning, in detail')
    t.api.createLink({ fromId: inner.id, toId: step.id, type: 'part_of', actor: AGENT })
    // Read back through the ordinary link reader, so what is asserted is what the product stored.
    const stored = t.api.allGatedLinks('default').filter((one) => one.type === 'part_of')
    expect(stored.map((one) => [one.fromId, one.toId])).toContainEqual([inner.id, step.id])
  })

  it('says how many steps are inside it, on the card, and names where to read them', async () => {
    const outer = pipelineOf('Perception to grasp')
    const leaf = t.blocks.addBlock(outer.id, { name: 'ZED RGB image', state: 'done' }, AGENT).block
    const holder = t.blocks.addBlock(outer.id, { name: 'IK and planning', state: 'doing' }, AGENT).block
    const inner = pipelineOf('IK and planning, in detail')
    for (const [name, state] of [
      ['Solve for the pose', 'done'],
      ['Check the joint limits', 'done'],
      ['Plan the path', 'doing'],
    ] as const) {
      t.blocks.addBlock(inner.id, { name, state }, AGENT)
    }
    t.api.createLink({ fromId: inner.id, toId: holder.id, type: 'part_of', actor: AGENT })

    const graph = await drawing(outer.id)
    const held = stepsOf(graph).find((node) => node.recordId === holder.id)
    const plain = stepsOf(graph).find((node) => node.recordId === leaf.id)
    if (held === undefined || plain === undefined) throw new Error('the two steps are not both on the drawing')

    // WHAT IT IS, AS DATA: the sub-pipeline's own id, its own title, and the count out of its own
    // `blockIds`. Nothing is copied and no step of it is on this canvas.
    expect(held.holds).toEqual([
      { recordId: inner.id, title: 'IK and planning, in detail', steps: 3, done: 2, unreadable: 0 },
    ])
    // A LEAF IS NOT DRAWN LIKE A HOLDER. This is the assertion the drawing rests on: the two cards
    // differ, and they differ in the fact rather than in a decoration.
    expect(plain.holds).toEqual([])
    expect(badgeWords(held)).toContain('holds 3 steps')
    expect(badgeWords(plain)).not.toContain('holds 3 steps')
    // AND WHERE TO READ THEM, by name, on the card itself.
    const fact = held.facts.find((one) => one.label === 'holds')
    expect(fact?.value).toContain('IK and planning, in detail')
    expect(fact?.value).toContain('3 steps')
  })

  it('counts the steps inside as left off this drawing, rather than dropping them', async () => {
    const outer = pipelineOf('Perception to grasp')
    const holder = t.blocks.addBlock(outer.id, { name: 'IK and planning', state: 'doing' }, AGENT).block
    const inner = pipelineOf('IK and planning, in detail')
    for (const name of ['Solve for the pose', 'Check the joint limits']) {
      t.blocks.addBlock(inner.id, { name, state: 'todo' }, AGENT)
    }
    t.api.createLink({ fromId: inner.id, toId: holder.id, type: 'part_of', actor: AGENT })

    const graph = await drawing(outer.id)
    const said = graph.omitted.find((one) => one.what.includes('held inside a block'))
    expect(said?.count).toBe(2)
    expect(said?.why).toContain('IK and planning, in detail')
    // NOT ON THE CANVAS. The sub-pipeline is its own drawing; folding its cards in would put two
    // orders in one box.
    expect(graph.nodes.some((node) => node.recordId === inner.id)).toBe(false)
  })

  it('counts a step it cannot resolve rather than shortening the total it reports', async () => {
    // THE COUNT COMES FROM THE SUB-PIPELINE'S OWN `blockIds` AND NOT FROM WHAT RESOLVED. The two
    // are the same number in a whole corpus and they come apart in a partial one: the drawing is
    // built from the records the page was handed, and a block the page was not handed would
    // otherwise make the holder claim fewer steps than it stores. The write routes refuse to leave
    // a hole in an order — `deleteRecord` says so by name — so this is reached the way it is really
    // reached, by building the drawing from a records list that is missing one.
    const { buildStructureGraph, graphLinks }: Model = await import('../src/web/components/graph/model.ts')
    const outer = pipelineOf('Perception to grasp')
    const holder = t.blocks.addBlock(outer.id, { name: 'IK and planning', state: 'doing' }, AGENT).block
    const inner = pipelineOf('IK and planning, in detail')
    const first = t.blocks.addBlock(inner.id, { name: 'Solve for the pose', state: 'done' }, AGENT).block
    const missing = t.blocks.addBlock(inner.id, { name: 'Plan the path', state: 'todo' }, AGENT).block
    t.api.createLink({ fromId: inner.id, toId: holder.id, type: 'part_of', actor: AGENT })

    const all = t.api.listRecords({ workspaceId: 'default' }) as PanelRecord[]
    const graph = buildStructureGraph({
      records: all.filter((record) => record.id !== missing.id),
      links: graphLinks(t.api.allGatedLinks('default')),
      attention: attentionNow(),
      scope: { at: 'pipeline', recordId: outer.id },
      now: NOW,
    })
    const held = stepsOf(graph).find((node) => node.recordId === holder.id)
    expect(held?.holds[0]?.steps).toBe(2)
    expect(held?.holds[0]?.done).toBe(1)
    expect(held?.holds[0]?.unreadable).toBe(1)
    expect(first.id).not.toBe(missing.id)
    expect(held?.facts.find((one) => one.label === 'holds')?.value).toContain('no record holds')
  })

  it('keeps both when one block holds two pipelines, because keeping the first would be a silent drop', async () => {
    const outer = pipelineOf('Perception to grasp')
    const holder = t.blocks.addBlock(outer.id, { name: 'Execution', state: 'doing' }, AGENT).block
    for (const title of ['The servo loop', 'The safety stop']) {
      const inner = pipelineOf(title)
      t.blocks.addBlock(inner.id, { name: `${title} — step one`, state: 'todo' }, AGENT)
      t.api.createLink({ fromId: inner.id, toId: holder.id, type: 'part_of', actor: AGENT })
    }
    const graph = await drawing(outer.id)
    const held = stepsOf(graph).find((node) => node.recordId === holder.id)
    expect(held?.holds.map((one) => one.title).sort()).toEqual(['The safety stop', 'The servo loop'])
  })
})

describe('two steps with no order between them say which of the two silences it is', () => {
  /** A pipeline of three steps where the first two are chained and the third is joined to nothing. */
  function threeSteps(claim?: boolean): { pipeline: PanelRecord; loose: string } {
    const pipeline = pipelineOf('Perception to grasp', claim === undefined ? {} : { dependenciesComplete: claim })
    const one = t.blocks.addBlock(pipeline.id, { name: 'ZED RGB image', state: 'done' }, AGENT).block
    const two = t.blocks.addBlock(pipeline.id, { name: 'Detection', state: 'done' }, AGENT).block
    const three = t.blocks.addBlock(pipeline.id, { name: 'Write the report', state: 'todo' }, AGENT).block
    t.api.createLink({ fromId: one.id, toId: two.id, type: 'blocks', gate: { kind: 'hard' }, actor: AGENT })
    return { pipeline, loose: three.id }
  }

  it('says nobody recorded one when nobody has said whether the dependencies are written down', async () => {
    const { pipeline, loose } = threeSteps()
    const graph = await drawing(pipeline.id)
    const card = stepsOf(graph).find((node) => node.recordId === loose)
    expect(badgeWords(card as GraphNode)).toContain(englishWords()['g7b.model.nobody_said_what_it_waits_on'])
    expect(badgeWords(card as GraphNode)).not.toContain('runs independently')
    // AND THE BOX SAYS THE SAME THING ABOUT THE WHOLE DRAWING, with the count.
    const box = graph.nodes.find((node) => node.kind === 'pipeline')
    expect(box?.badges.map((one) => one.short)).toContain('1 step joined by nothing')
  })

  it('says it runs independently once the pipeline records that its dependencies are all written down', async () => {
    const { pipeline, loose } = threeSteps(true)
    const graph = await drawing(pipeline.id)
    const card = stepsOf(graph).find((node) => node.recordId === loose)
    expect(badgeWords(card as GraphNode)).toContain('runs independently')
    expect(badgeWords(card as GraphNode)).not.toContain(englishWords()['g7b.model.nobody_said_what_it_waits_on'])
    const box = graph.nodes.find((node) => node.kind === 'pipeline')
    expect(box?.badges.map((one) => one.short)).toContain('dependencies written down')
  })

  it('says the gap is a known gap when the pipeline records its dependencies are unfinished', async () => {
    const { pipeline, loose } = threeSteps(false)
    const graph = await drawing(pipeline.id)
    const card = stepsOf(graph).find((node) => node.recordId === loose)
    expect(badgeWords(card as GraphNode)).toContain('a dependency is missing here')
    const box = graph.nodes.find((node) => node.kind === 'pipeline')
    expect(box?.badges.map((one) => one.short)).toContain('dependencies unfinished')
  })

  it('leaves a step that IS joined out of it, so the word is about the steps it is true of', async () => {
    const { pipeline } = threeSteps(true)
    const graph = await drawing(pipeline.id)
    const chained = stepsOf(graph).filter((node) => node.title === 'ZED RGB image' || node.title === 'Detection')
    expect(chained.length).toBe(2)
    for (const node of chained) {
      expect(badgeWords(node)).not.toContain('runs independently')
      expect(badgeWords(node)).not.toContain(englishWords()['g7b.model.nobody_said_what_it_waits_on'])
    }
  })

  it('infers nothing: a pipeline where every step is chained still claims nothing until somebody writes it', async () => {
    // THE REFUSAL THAT MAKES THE FIELD WORTH HAVING. A reader could "helpfully" decide that a
    // pipeline with no loose steps has complete dependencies. It has not been said, and absence is
    // an answer.
    const pipeline = pipelineOf('A chain')
    const one = t.blocks.addBlock(pipeline.id, { name: 'First', state: 'done' }, AGENT).block
    const two = t.blocks.addBlock(pipeline.id, { name: 'Second', state: 'todo' }, AGENT).block
    t.api.createLink({ fromId: one.id, toId: two.id, type: 'blocks', gate: { kind: 'hard' }, actor: AGENT })
    const graph = await drawing(pipeline.id)
    const box = graph.nodes.find((node) => node.kind === 'pipeline')
    const words = box?.badges.map((badge) => badge.short) ?? []
    expect(words).not.toContain('dependencies written down')
    expect(words.some((word) => word.includes('joined by nothing'))).toBe(false)
  })
})
