// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * EVERY GATE SAYS THE STEP IT STOPS AT BY THE STEP'S NUMBER AND TITLE, NEVER BY THE ID OF THE STEP'S BLOCK (wave 13y
 * round 85, item 15b).
 *
 * A partial gate stores the step it stops at as the id of the step's block. In round 83 the pipeline wall began to say
 * "only as far as 03 Weigh the reel until this finishes", and eleven other places still drew "only as far as
 * rl-weigh-it3 until this finishes". This file holds each of them that can be drawn without a browser:
 *
 *   - the structure graph's pipeline scope: a line from a module to the pipeline box, the line between two steps, the
 *     "waits on" fact on a step's card, and the wall's sentence for a block that is no step of the pipeline;
 *   - the structure graph's plan scope, and the plan's list of links;
 *   - the pipeline page's flow: the "waits on" line under a step, and the title of the gate mark in its gutter.
 *
 * The plan's detail panel and the label on a plan line are drawn only on a click or a hover, so the browser test
 * tests/every-gate-says-its-step-in-the-browser.test.ts holds them.
 *
 * WHAT EACH PLACE CAN KNOW, AND SO WHAT IT SAYS. The structure graph is handed the records, so it says the step's
 * number and title for a step of this pipeline, and "a step that is not in this pipeline" for a block of another one.
 * The flow is handed the pipeline's steps and no other record, so it says a step of this pipeline by number and title
 * and draws anything else as it is stored. The plan holds no step order, so it says a block it draws by its title
 * alone. A stage named in words is its author's words and is drawn as it is stored everywhere.
 *
 * MUTATIONS, after a control run, each of src/web/lib/gate-stage.ts. It names no stage: every place draws the stored
 * id, and all ten cases fail. It draws a block of another pipeline as stored: the five cases of the structure graph's
 * pipeline scope that hold such a block fail. It numbers no step: the five cases that say "03 Weigh the reel" fail,
 * and the plan's two do not.
 */

import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it } from 'vitest'
import type { AttentionResult } from '../src/shared/attention.ts'
import type { PanelRecord } from '../src/shared/types.ts'
import { gateLabel } from '../src/shared/work.ts'
import type { PlanGraphEdge, PlanGraphNode, PlanGraphReply } from '../src/server/api/plan-graph.ts'
import type { GraphLink, StructureGraph } from '../src/web/components/graph/model.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'

type Model = typeof import('../src/web/components/graph/model.ts')
type Flow = typeof import('../src/web/components/PipelineFlow.tsx')
type Plan = typeof import('../src/web/components/graph/PlanGraph.tsx')
let model: Model
let flow: Flow
let plan: Plan

beforeAll(async () => {
  // src/web/api.ts reads window.localStorage at module scope, and all three modules reach it through the component
  // library. matchMedia answers "narrow", so the plan prints its written-out list, where every gate is on the page.
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
    matchMedia: () => ({ matches: true, addEventListener: () => {}, removeEventListener: () => {} }),
  }
  model = await import('../src/web/components/graph/model.ts')
  flow = await import('../src/web/components/PipelineFlow.tsx')
  plan = await import('../src/web/components/graph/PlanGraph.tsx')
})

// ============================================================================ the reel and the scales

const STAMP = '2026-10-20 09:00:00'
const REEL = 'Store the reel'
const SCALES = 'Check the scales'
const BLOCK_IDS = ['rl-take-out1', 'rl-clean-it2', 'rl-weigh-it3', 'rl-put-back4', 'sc-zero-it01'] as const

function record(id: string, kind: string, title: string, data: Record<string, unknown> = {}): PanelRecord {
  return {
    id,
    kind,
    workspaceId: 'panelx',
    ownerId: THE_TEST_OFFICES_OWNER.id,
    title,
    summary: null,
    data,
    createdAt: STAMP,
    updatedAt: STAMP,
    deletedAt: null,
  } as PanelRecord
}

const RECORDS: PanelRecord[] = [
  record('pl-reel-0001', 'pipeline', REEL, { blockIds: ['rl-take-out1', 'rl-clean-it2', 'rl-weigh-it3', 'rl-put-back4'] }),
  // The other pipeline lists step 4 as well, which is what lets a gate into step 4 stop at one of its blocks.
  record('pl-scale-001', 'pipeline', SCALES, { blockIds: ['sc-zero-it01', 'rl-put-back4'] }),
  record('rl-take-out1', 'block', `${REEL} › Take the reel out`, { state: 'doing' }),
  record('rl-clean-it2', 'block', `${REEL} › Clean the reel`, { state: 'todo' }),
  record('rl-weigh-it3', 'block', `${REEL} › Weigh the reel`, { state: 'todo' }),
  record('rl-put-back4', 'block', `${REEL} › Put the reel back`, { state: 'todo' }),
  record('sc-zero-it01', 'block', `${SCALES} › Zero the scales`, { state: 'todo' }),
  record('md-scales-01', 'module', 'The scales', { parts: [] }),
  record('md-dryer-001', 'module', 'The dryer', { parts: [] }),
]

function link(linkId: string, fromId: string, toId: string, type: GraphLink['type'], gate: GraphLink['gate']): GraphLink {
  return { linkId, fromId, toId, type, inferred: false, broken: false, gate }
}
const partial = (upTo: string): GraphLink['gate'] => ({ at: 'gate', gate: { kind: 'partial', upTo } })

const LINKS: GraphLink[] = [
  // The two modules carry a step each, so both are drawn on the pipeline's canvas, and both hold the pipeline up.
  link('L-carry-wgh', 'md-scales-01', 'rl-weigh-it3', 'implements', { at: 'not-a-dependency' }),
  link('L-carry-cln', 'md-dryer-001', 'rl-clean-it2', 'implements', { at: 'not-a-dependency' }),
  link('L-wall-step', 'md-scales-01', 'pl-reel-0001', 'blocks', partial('rl-weigh-it3')),
  link('L-wall-else', 'md-dryer-001', 'pl-reel-0001', 'blocks', partial('sc-zero-it01')),
  // What the steps wait on: a hard gate, a stage in words, a step of this pipeline, and a block of the other one.
  link('L-need-hard', 'rl-take-out1', 'rl-clean-it2', 'blocks', { at: 'gate', gate: { kind: 'hard' } }),
  link('L-need-word', 'rl-clean-it2', 'rl-weigh-it3', 'blocks', partial('the reel is dry')),
  link('L-need-step', 'rl-take-out1', 'rl-put-back4', 'blocks', partial('rl-weigh-it3')),
  link('L-need-else', 'rl-clean-it2', 'rl-put-back4', 'blocks', partial('sc-zero-it01')),
]

const AT_STEP_3 = gateLabel({ kind: 'partial', upTo: '03 Weigh the reel' })
const NOT_HERE = gateLabel({ kind: 'partial', upTo: 'a step that is not in this pipeline' })
const IN_WORDS = gateLabel({ kind: 'partial', upTo: 'the reel is dry' })

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

const pipelineGraph = (): StructureGraph =>
  model.buildStructureGraph({
    records: RECORDS,
    links: LINKS,
    attention: attention(),
    scope: { at: 'pipeline', recordId: 'pl-reel-0001' },
    now: Date.parse('2026-10-26T02:00:00Z'),
  })

const edgeWords = (graph: StructureGraph, id: string): string | null | undefined =>
  graph.edges.find((edge) => edge.id === id)?.gateWords

/** True when the words hold the id of any block in the fixture. */
const holdsABlockId = (words: string): boolean => BLOCK_IDS.some((id) => words.includes(id))

// ============================================================================ the structure graph's pipeline scope

describe("the structure graph's pipeline scope", () => {
  it('says the step a line into the pipeline box stops at by its number and title', () => {
    expect(edgeWords(pipelineGraph(), 'link:L-wall-step')).toBe(AT_STEP_3)
  })

  it('says in words that a line into the pipeline box stops at a step that is not in this pipeline', () => {
    expect(edgeWords(pipelineGraph(), 'link:L-wall-else')).toBe(NOT_HERE)
  })

  it('says the step a line between two steps stops at by its number and title, and a stage in words as stored', () => {
    const graph = pipelineGraph()
    expect(edgeWords(graph, 'needs:pl-reel-0001:rl-take-out1->rl-put-back4')).toBe(AT_STEP_3)
    expect(edgeWords(graph, 'needs:pl-reel-0001:rl-clean-it2->rl-put-back4')).toBe(NOT_HERE)
    expect(edgeWords(graph, 'needs:pl-reel-0001:rl-clean-it2->rl-weigh-it3')).toBe(IN_WORDS)
  })

  it("says the step on a step card's “waits on” fact by its number and title", () => {
    const card = pipelineGraph().nodes.find((node) => node.id === 'step:pl-reel-0001:rl-put-back4')
    const waits = card?.kind === 'step' ? card.facts.find((fact) => fact.label === 'waits on')?.value : undefined
    expect(waits, 'step 4 has no "waits on" fact, so nothing here was checked').toBeDefined()
    expect(waits).toContain(AT_STEP_3)
    expect(waits).toContain(NOT_HERE)
    expect(waits).not.toMatch(/rl-weigh-it3|sc-zero-it01/)
  })

  it("says in the wall's sentence that the wall stands at a step that is not in this pipeline, and never its id", () => {
    const wall = pipelineGraph().walls.find((one) => one.linkId === 'L-wall-else')
    expect(wall?.sentence).toBe(
      'The wall stands at a step that is not in this pipeline. Mole Office cannot tell which steps of this pipeline it holds back.',
    )
  })

  it('draws no block id in any gate word or wall sentence on the canvas', () => {
    const graph = pipelineGraph()
    const said = [
      ...graph.edges.map((edge) => edge.gateWords ?? ''),
      ...graph.walls.flatMap((wall) => [wall.words, wall.sentence]),
      ...graph.nodes.flatMap((node) =>
        node.kind === 'step' ? node.facts.filter((fact) => fact.label === 'waits on').map((fact) => fact.value) : [],
      ),
    ]
    expect(said.filter(holdsABlockId)).toEqual([])
  })
})

// ============================================================================ the pipeline page's flow

describe("the pipeline page's flow", () => {
  const markup = (): string => {
    const reading = flow.readPipeline(RECORDS[0]!, RECORDS, model.blockLinkRows(LINKS))
    return renderToStaticMarkup(h(flow.PipelineFlow, { reading, now: 0 }))
  }
  const text = (html: string): string =>
    html
      .replace(/<[^>]*>/g, ' ')
      .replace(/&#x27;|&#39;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&')
      .replace(/\s+/g, ' ')
  /** The "waits on" lines under the steps, as plain text. */
  const needs = (html: string): string[] =>
    [...html.matchAll(/<span class="pf-need-text[^"]*">([\s\S]*?)<\/span><\/li>/g)].map((m) => text(m[1] ?? '').trim())
  /** The titles of the gate marks in the gutter. */
  const gutterTitles = (html: string): string[] =>
    [...html.matchAll(/<span class="pf-gate"[^>]*?title="([^"]*)"/g)].map((m) => text(m[1] ?? ''))

  it('says the step a wait stops at by its number and title, and a stage in words as stored', () => {
    const lines = needs(markup())
    expect(lines.length, 'no "waits on" line was drawn, so nothing here was checked').toBeGreaterThan(0)
    expect(lines.some((line) => line.includes(`01 Take the reel out — ${AT_STEP_3}`)), lines.join(' | ')).toBe(true)
    expect(lines.some((line) => line.includes(IN_WORDS)), lines.join(' | ')).toBe(true)
    expect(lines.filter((line) => line.includes('rl-weigh-it3'))).toEqual([])
  })

  it("says the step in the title of a gate mark in the gutter by its number and title", () => {
    const titles = gutterTitles(markup())
    expect(titles.length, 'no gate mark was drawn in the gutter, so nothing here was checked').toBeGreaterThan(0)
    expect(titles).toContain(AT_STEP_3)
    expect(titles.filter((title) => title.includes('rl-weigh-it3'))).toEqual([])
  })
})

// ============================================================================ the plan

function planNode(recordId: string, name: string, over: Partial<PlanGraphNode> = {}): PlanGraphNode {
  return {
    recordId,
    kind: 'block',
    role: 'work',
    title: `${REEL} › ${name}`,
    name,
    within: REEL,
    state: 'todo',
    depth: null,
    effortHours: null,
    due: null,
    settled: null,
    record: record(recordId, 'block', `${REEL} › ${name}`, { state: 'todo' }),
    drawn: 'one link from an anchor',
    oneLinkFrom: [],
    allocations: [],
    ...over,
  }
}

function planEdge(id: string, from: string, to: string, upTo: string): PlanGraphEdge {
  return {
    id,
    from,
    to,
    type: 'blocks',
    label: 'blocks',
    gateLabel: gateLabel({ kind: 'partial', upTo }),
    gateProblem: null,
    broken: false,
    gate: { kind: 'partial', upTo },
  }
}

function planReply(): PlanGraphReply {
  return {
    horizon: 'week',
    period: '2026-W44',
    from: '2026-10-26',
    to: '2026-11-01',
    workspaceId: 'panelx',
    workspaceTitle: 'Mole Office',
    nodes: [
      planNode('rl-take-out1', 'Take the reel out', { drawn: 'anchor', state: 'doing' }),
      planNode('rl-weigh-it3', 'Weigh the reel'),
      planNode('rl-put-back4', 'Put the reel back'),
    ],
    edges: [
      planEdge('e-step', 'rl-take-out1', 'rl-put-back4', 'rl-weigh-it3'),
      planEdge('e-word', 'rl-weigh-it3', 'rl-put-back4', 'the reel is dry'),
    ],
    elsewhere: [],
    omitted: [],
    note: 'The plan of a reel.',
  }
}

// The plan's reply carries the blocks it draws and not their pipeline's order, so a step is said by its title alone.
const AT_STEP_3_IN_THE_PLAN = gateLabel({ kind: 'partial', upTo: 'Weigh the reel' })

describe('the plan', () => {
  it("says the step a line stops at by its title in the structure graph's plan scope", () => {
    const graph = model.buildStructureGraph({ scope: { at: 'plan', period: '2026-W44' }, now: 0, plan: planReply() })
    expect(edgeWords(graph, 'link:e-step')).toBe(AT_STEP_3_IN_THE_PLAN)
    expect(edgeWords(graph, 'link:e-word')).toBe(IN_WORDS)
  })

  it("says the step a line stops at by its title in the plan's list of links, on both its ends", () => {
    const html = renderToStaticMarkup(h(plan.PlanGraphView, { reply: planReply() }))
    const gates = [...html.matchAll(/class="pg-row-gate">([^<]*)</g)].map((m) => m[1] ?? '')
    expect(gates.length, 'no gate was drawn in the list, so nothing here was checked').toBeGreaterThan(0)
    // Once under the step it comes from and once under the step that waits.
    expect(gates.filter((words) => words === AT_STEP_3_IN_THE_PLAN)).toHaveLength(2)
    expect(gates.filter((words) => words === IN_WORDS)).toHaveLength(2)
    expect(gates.filter(holdsABlockId)).toEqual([])
  })
})
