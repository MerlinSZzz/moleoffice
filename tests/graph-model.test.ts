// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT THE GRAPH MEANS — the layer that can be tested, tested.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS AND IS NOT COVERED HERE, STATED BEFORE THE FIRST TEST
 * ---------------------------------------------------------------------------------------
 *
 * The runner's environment is `node`. There is no DOM and no jsdom, and adding one would mean a
 * dependency this project has ruled out. So React Flow cannot be rendered here AT ALL — not the
 * canvas, not a card on it, not an edge label. Everything about how the drawing LOOKS is verified by
 * screenshot and by eye, and that is written down in the reply that ships with this work rather than
 * left for somebody to discover.
 *
 * WHAT IS TESTED IS EVERYTHING THAT DECIDES WHAT THE PICTURE SAYS:
 *
 *   1. Building the semantic graph from records and links: which nodes exist, what a card carries,
 *      which lines are drawn and what word is on each.
 *   2. GATES. Hard against partial, a `blocks` link with no gate against a hard one, and — the one
 *      that matters most — how far a partial gate lets you go, computed from the recorded `needs`.
 *   3. What attaches where, and why: the server's own sentence for anything the attention rule
 *      selected, and a counted, named remainder for everything it did not.
 *   4. That the CANONICAL layer is untouched: node identity is record identity, and nothing in the
 *      drawing directory writes a coordinate.
 *   5. The reading layer, rendered to static markup, which is plain React and needs no canvas.
 *
 * THE FIXTURE IS THE REAL SEED. The `Sim-to-real` and `Transplant v2` steps below are copied field for
 * field from scripts/seed.ts, gates and all, because a drawing tested only against invented data is
 * a drawing tested against nothing. tests/pipeline-flow.test.ts makes the same choice for the same
 * reason.
 */
import { join } from 'node:path'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it } from 'vitest'
import type { AttentionResult, AttentionRow } from '../src/shared/attention.ts'
import type { PanelRecord, ResolvedLink } from '../src/shared/types.ts'
import { gateLabel } from '../src/shared/work.ts'
import type { FlowStep } from '../src/web/components/PipelineFlow.tsx'
import type { GraphLink, StructureGraph } from '../src/web/components/graph/model.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { sayInEnglish } from '../src/shared/i18n.ts'
import { englishWords } from '../src/shared/words/joined.ts'

const en = englishWords()

type Model = typeof import('../src/web/components/graph/model.ts')
type OutlineModule = typeof import('../src/web/components/graph/Outline.tsx')
let model: Model
let outline: OutlineModule

beforeAll(async () => {
  // src/web/api.ts reads window.localStorage at module scope to restore who you are acting as, and
  // the model reaches it through the component library. This is the smallest stand-in that lets the
  // modules load; nothing in it is under test.
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
  outline = await import('../src/web/components/graph/Outline.tsx')
})

// ============================================================================ fixtures

const NOW = Date.parse('2026-08-09T12:00:00')
const STAMP = '2026-08-01 09:00:00'

function record(over: Partial<PanelRecord> & Pick<PanelRecord, 'id' | 'kind' | 'title'>): PanelRecord {
  return {
    workspaceId: 'default',
    ownerId: THE_TEST_OFFICES_OWNER.id,
    summary: null,
    data: {},
    createdAt: STAMP,
    updatedAt: STAMP,
    deletedAt: null,
    ...over,
  }
}

/** Copied from scripts/seed.ts: the Sim-to-real pipeline, ids, gates and branch intact. */
const SIM2REAL: StepFixture[] = [
  { id: 's2r-01', name: 'Import the URDF', state: 'done', modules: ['Digital twin'] },
  { id: 's2r-02', name: 'Joint limits and inertias', state: 'done', modules: ['Digital twin'], needs: [{ stepId: 's2r-01', gate: 'hard' }] },
  { id: 's2r-03', name: 'Forward kinematics gate', state: 'done', modules: ['Digital twin'], needs: [{ stepId: 's2r-02', gate: 'hard' }] },
  { id: 's2r-04', name: 'Contact model', state: 'doing', modules: ['Digital twin'], needs: [{ stepId: 's2r-03', gate: 'hard' }] },
  { id: 's2r-05', name: 'Domain randomisation', state: 'todo', modules: ['Digital twin'], needs: [{ stepId: 's2r-04', gate: 'hard' }] },
  { id: 's2r-06', name: 'Policy transfer run', state: 'todo', modules: ['Digital twin', 'EGM bridge'], needs: [{ stepId: 's2r-05', gate: 'hard' }] },
  {
    id: 's2r-07',
    name: 'Kinematics against the real arm',
    state: 'blocked',
    modules: ['EGM bridge'],
    needs: [{ stepId: 's2r-03', gate: 'partial', upTo: 'kinematics checked in simulation' }],
  },
  {
    id: 's2r-08',
    name: 'Repeat the 84 targets on hardware',
    state: 'todo',
    modules: ['EGM bridge'],
    needs: [{ stepId: 's2r-07', gate: 'partial', upTo: 'the 84 targets already run' }],
  },
  { id: 's2r-09', name: 'Measure the gap', state: 'todo', modules: [], needs: [{ stepId: 's2r-07', gate: 'hard' }] },
  {
    id: 's2r-10',
    name: 'Sign the twin off',
    state: 'todo',
    modules: ['Digital twin'],
    needs: [
      { stepId: 's2r-06', gate: 'hard' },
      { stepId: 's2r-08', gate: 'hard' },
      { stepId: 's2r-09', gate: 'hard' },
    ],
  },
]

/** Copied from scripts/seed.ts: Transplant v2, a straight chain with one rejoin at 08. */
const HANDOVER: StepFixture[] = [
  { id: 'hv2-01', name: 'Detect the hand', state: 'done', modules: ['Chest camera'] },
  { id: 'hv2-02', name: 'Track it', state: 'done', modules: ['Chest camera'], needs: [{ stepId: 'hv2-01', gate: 'hard' }] },
  { id: 'hv2-03', name: 'Plan the approach', state: 'failed', modules: ['EGM bridge'], needs: [{ stepId: 'hv2-02', gate: 'hard' }] },
  { id: 'hv2-04', name: 'Servo in', state: 'todo', modules: ['EGM bridge'], needs: [{ stepId: 'hv2-03', gate: 'hard' }] },
  {
    id: 'hv2-05',
    name: 'Close and hold',
    state: 'todo',
    modules: ['夹具标定', 'Force bench'],
    needs: [{ stepId: 'hv2-04', gate: 'partial', upTo: 'servo tuning against the mock arm' }],
  },
  {
    id: 'hv2-06',
    name: 'Release on contact',
    state: 'todo',
    modules: ['Tactile pads'],
    needs: [{ stepId: 'hv2-05', gate: 'partial', upTo: 'bench closes with the jig, no arm' }],
  },
  { id: 'hv2-07', name: 'Retreat', state: 'todo', modules: ['EGM bridge'], needs: [{ stepId: 'hv2-06', gate: 'hard' }] },
  {
    id: 'hv2-08',
    name: 'Log the run',
    state: 'todo',
    modules: [],
    needs: [
      { stepId: 'hv2-03', gate: 'hard' },
      { stepId: 'hv2-07', gate: 'hard' },
    ],
  },
  { id: 'hv2-09', name: 'Score it', state: 'todo', modules: [], needs: [{ stepId: 'hv2-08', gate: 'hard' }] },
]

const MODULES: PanelRecord[] = [
  record({ id: 'm-twin', kind: 'module', title: 'Digital twin', data: { context: 'A simulated arm to try policies on before the real one.', parts: [{ id: 'p', name: 'Build', items: [{ id: 'i1', text: 'URDF', state: 'done' }, { id: 'i2', text: 'Contacts', state: 'failed' }] }] } }),
  record({ id: 'm-egm', kind: 'module', title: 'EGM bridge', data: { context: 'The real-time channel to the controller.', parts: [] } }),
  record({ id: 'm-grip', kind: 'module', title: '夹具标定', data: { context: '夹爪的力标定，重印 v3 #4 (setting 13, 壁厚 2.0 mm)。', parts: [] } }),
  // A module with no context at all: a required field nobody filled in.
  record({ id: 'm-bench', kind: 'module', title: 'Force bench', data: { parts: [] } }),
]

/**
 * The authoring shape these fixtures are written in, and what turns one into what a pipeline is.
 *
 * A pipeline is a record with an ordered list of block RECORD IDS; what each block waits on and
 * which modules carry it are stored LINKS. Written out that way a ten-step fixture is a pipeline
 * record, ten block records and twenty links, which is three hundred lines of setup for a test
 * about a drawing. So the fixtures stay readable and `blocksOf` builds the real thing.
 *
 * IT IS A FIXTURE BUILDER, NOT A SECOND MODEL. Nothing stores it and no source file imports it.
 */
interface StepFixture {
  id: string
  name: string
  state: string
  modules?: string[]
  measured?: string
  needs?: { stepId: string; gate: 'hard' | 'partial'; upTo?: string }[]
}

/** The block RECORDS of one pipeline, titled the way the server titles them. */
function blocksOf(steps: readonly StepFixture[], pipelineTitle: string): PanelRecord[] {
  return steps.map((step) =>
    record({
      id: step.id,
      kind: 'block',
      title: `${pipelineTitle} \u203a ${step.name}`,
      data: { state: step.state, ...(step.measured === undefined ? {} : { measured: step.measured }) },
    }),
  )
}

/** The `implements` and `blocks` links one pipeline's fixture implies. */
function linksOf(steps: readonly StepFixture[], moduleIdByTitle: ReadonlyMap<string, string>): GraphLink[] {
  const out: GraphLink[] = []
  let n = 0
  for (const step of steps) {
    for (const title of step.modules ?? []) {
      const moduleId = moduleIdByTitle.get(title)
      if (moduleId === undefined) continue
      out.push(link({ linkId: `bl${++n}-${step.id}`, fromId: moduleId, toId: step.id, type: 'implements', inferred: true }))
    }
    for (const need of step.needs ?? []) {
      out.push(
        link({
          linkId: `bn${++n}-${step.id}`,
          fromId: need.stepId,
          toId: step.id,
          type: 'blocks',
          gate: { at: 'gate', gate: need.upTo === undefined ? { kind: need.gate } : { kind: need.gate, upTo: need.upTo } },
        }),
      )
    }
  }
  return out
}

const MODULE_IDS = new Map(MODULES.map((m) => [m.title, m.id]))

const PIPELINES: PanelRecord[] = [
  record({ id: 'p-s2r', kind: 'pipeline', title: 'Sim-to-real', data: { blockIds: SIM2REAL.map((s) => s.id) } }),
  record({ id: 'p-hv2', kind: 'pipeline', title: 'Transplant v2', data: { blockIds: HANDOVER.map((s) => s.id) } }),
  ...blocksOf(SIM2REAL, 'Sim-to-real'),
  ...blocksOf(HANDOVER, 'Transplant v2'),
]

/** Every link the two pipelines' blocks imply. Handed to every build that draws a pipeline. */
const BLOCK_LINKS: GraphLink[] = [...linksOf(SIM2REAL, MODULE_IDS), ...linksOf(HANDOVER, MODULE_IDS)]

const OTHERS: PanelRecord[] = [
  record({ id: 'r-ik', kind: 'problem', title: 'IK solver returns a pose it cannot reach', data: { state: 'open' } }),
  record({ id: 'r-branch', kind: 'task', title: 'Branch B: contact model', data: { state: 'blocked' } }),
  record({ id: 'r-quiet', kind: 'claim', title: 'FK gate holds at 0.63 mm', data: {} }),
]

const RECORDS: PanelRecord[] = [...MODULES, ...PIPELINES, ...OTHERS]

function link(over: Partial<GraphLink> & Pick<GraphLink, 'linkId' | 'fromId' | 'toId'>): GraphLink {
  return { type: 'relates_to', inferred: false, broken: false, gate: { at: 'not-a-dependency' }, ...over }
}

/** A minimal attention reply: only the fields the drawing reads. */
function attention(rows: AttentionRow[] = [], remainder: AttentionRow[] = []): AttentionResult {
  return {
    visible: rows,
    remainder,
    total: rows.length + remainder.length,
    remainderByGroup: [],
    remainderNote: null,
    unclassified: [],
    noState: [],
    paused: [],
    machine: [],
    passedOver: [],
    counts: { candidates: 0, selected: 0, visible: rows.length, remainder: remainder.length, passedOver: 0, deleted: 0 },
  } as unknown as AttentionResult
}

function row(over: Partial<AttentionRow> & Pick<AttentionRow, 'recordId'>): AttentionRow {
  return {
    key: `rec:${over.recordId}`,
    shape: 'record',
    recordKind: 'problem',
    partId: null,
    itemId: null,
    title: 'a row',
    state: 'open',
    progress: 'stopped_short',
    group: 'stopped:work',
    score: 40,
    safety: false,
    displacedBy: null,
    reason: {
      selectedBy: 'stopped_short',
      owed: null,
      stoppedShort: { state: 'open', since: STAMP, sinceSource: 'record-updated' },
      consequence: null,
      safetyFloor: false,
      because: 'its state word is "open", which means the work stopped short of finishing',
      coded: [{ code: 'stoppedShort', values: { state: 'open' } }],
      factors: [],
    },
    ...over,
  } as unknown as AttentionRow
}

function build(over: Partial<Parameters<Model['buildStructureGraph']>[0]> = {}): StructureGraph {
  return model.buildStructureGraph({
    records: RECORDS,
    // The block links are always present, because they are what a pipeline IS now: without them a
    // pipeline draws no lines at all and every test about its shape would pass on an empty picture.
    links: BLOCK_LINKS,
    attention: attention(),
    scope: { at: 'modules' },
    now: NOW,
    ...over,
  })
}

/** The fixture read back the way `readPipelineBlocks` reads it, for the functions that take steps. */
const asFlowSteps = (steps: readonly StepFixture[], pipelineTitle = 'Sim-to-real'): FlowStep[] => {
  const blocks = blocksOf(steps, pipelineTitle)
  return steps.map((step, i) => ({
    id: step.id,
    name: step.name,
    title: `${pipelineTitle} \u2039 ${step.name}`,
    state: step.state as FlowStep['state'],
    measured: step.measured ?? null,
    carriers: (step.modules ?? []).map((title, m) => ({
      moduleId: MODULE_IDS.get(title) ?? title,
      module: null,
      title,
      linkId: `${step.id}-carrier-${String(m)}`,
      inferred: false,
    })),
    notCarriers: [],
    modules: step.modules ?? [],
    moduleIds: (step.modules ?? []).map((title) => MODULE_IDS.get(title) ?? title),
    needs: (step.needs ?? []).map((need) => ({
      blockId: need.stepId,
      gate: need.gate,
      ...(need.upTo === undefined ? {} : { upTo: need.upTo }),
      linkId: `n-${step.id}-${need.stepId}`,
    })),
    consequence: null,
    pause: null,
    record: blocks[i]!,
  }))
}

// ============================================================================ links

describe('reading the workspace links the drawing is made of', () => {
  /** One row as `GET /api/links` serves it: both ends by id, the gate columns already read. */
  const stored = {
    id: 'L1',
    fromId: 'm-twin',
    toId: 'm-egm',
    type: 'consumes' as const,
    inferred: false,
    createdAt: '2026-08-10 09:00:00',
    createdBy: `human:${THE_TEST_OFFICES_OWNER.id}`,
    createdByType: null,
    gate: null,
    gateLabel: null,
    gateProblem: null,
    gateStage: null,
    broken: false,
  }

  it('keeps both ends as they are stored, because a bulk read has no point of view to undo', () => {
    // This used to be two tests: one that the far end was swapped back when a link was read from
    // the record it points AT, and one that the same stored row read from both of its ends was
    // kept once. Neither can happen now — every link is read once, from nowhere — so the property
    // is that the ends arrive unchanged, and the duplicate they guarded against cannot be made.
    const [link] = model.graphLinks([stored])
    expect(link?.linkId).toBe('L1')
    expect(link?.fromId).toBe('m-twin')
    expect(link?.toId).toBe('m-egm')
    expect(model.graphLinks([stored, { ...stored, id: 'L2', fromId: 'm-egm', toId: 'm-twin' }])).toHaveLength(2)
  })

  it('reads a `blocks` link with no gate as unstated, and never as hard', () => {
    const [read] = model.graphLinks([{ ...stored, type: 'blocks' }])
    expect(read?.gate.at).toBe('unstated')
  })

  it('says a link that states no dependency carries no gate slot at all', () => {
    // `consumes` says what a thing is made of. Reading it as "no gate stored" would put an empty
    // gate on a line that can never have one.
    const [read] = model.graphLinks([stored])
    expect(read?.gate.at).toBe('not-a-dependency')
  })

  it('passes an unreadable stored gate through as unreadable, rather than dropping to unstated', () => {
    const [read] = model.graphLinks([
      { ...stored, type: 'blocks', gateProblem: 'this link stores the gate "soft", which is not one of hard or partial' },
    ])
    expect(read?.gate.at).toBe('unreadable')
  })
})

// ============================================================================ the modules scope

describe('the modules scope', () => {
  it('draws one card per module and nothing else', () => {
    const graph = build()
    expect(graph.nodes).toHaveLength(MODULES.length)
    expect(graph.nodes.every((node) => node.kind === 'module')).toBe(true)
  })

  it('keeps canonical module identity: the node id is built from the record id', () => {
    const graph = build()
    for (const node of graph.nodes) {
      expect(node.id).toBe(`mod:${node.recordId}`)
      expect(RECORDS.some((r) => r.id === node.recordId && r.kind === 'module')).toBe(true)
    }
  })

  it('puts the module’s own words on the card, and says so when there are none', () => {
    const graph = build()
    const twin = graph.nodes.find((node) => node.recordId === 'm-twin')
    expect(twin?.facts.find((fact) => fact.label === 'why it exists')?.value).toContain('simulated arm')
    const bench = graph.nodes.find((node) => node.recordId === 'm-bench')
    expect(bench?.facts.find((fact) => fact.label === 'why it exists')?.value).toBe('—')
  })

  it('counts the checklist rather than inventing a state word for the module', () => {
    const graph = build()
    const twin = graph.nodes.find((node) => node.recordId === 'm-twin')
    expect(twin?.stateWord).toBeNull()
    expect(twin?.state).toBeNull()
    expect(twin?.facts.find((fact) => fact.label === 'checklist')?.value).toBe('1 of 2 done, 1 stopped short')
  })

  it('says how many pipeline steps name each module, counting across every pipeline', () => {
    const graph = build()
    const egm = graph.nodes.find((node) => node.recordId === 'm-egm')
    // s2r-06, s2r-07, s2r-08 and hv2-03, hv2-04, hv2-07.
    expect(egm?.facts.find((fact) => fact.label === 'carries')?.value).toBe('6 pipeline steps')
    const bench = graph.nodes.find((node) => node.recordId === 'm-bench')
    expect(bench?.facts.find((fact) => fact.label === 'carries')?.value).toBe('1 pipeline step')
  })

  it('draws module-to-module links only, with the stored type as the word on the line', () => {
    const links = [
      link({ linkId: 'L1', fromId: 'm-twin', toId: 'm-egm', type: 'consumes' }),
      link({ linkId: 'L2', fromId: 'r-ik', toId: 'm-egm', type: 'blocks' }),
    ]
    const graph = build({ links })
    expect(graph.edges).toHaveLength(1)
    expect(graph.edges[0]?.label).toBe('consumes')
    expect(graph.edges[0]?.linkType).toBe('consumes')
    expect(graph.edges[0]?.linkId).toBe('L1')
  })

  it('spends no colour on the link type: eleven types produce eleven words and one drawing rule', () => {
    const types = ['relates_to', 'part_of', 'produces', 'consumes', 'measures', 'implements'] as const
    const links = types.map((type, i) =>
      link({ linkId: `L${i}`, fromId: 'm-twin', toId: 'm-egm', type }),
    )
    const graph = build({ links })
    const labels = graph.edges.map((edge) => edge.label)
    expect(new Set(labels).size).toBe(types.length)
    // Every one of them carries no gate, so nothing about the TYPE reaches the one channel that is
    // allowed to change how a line is drawn.
    expect(graph.edges.every((edge) => edge.gate === null)).toBe(true)
  })

  it('names and counts the pipelines it is not drawing, rather than leaving them out silently', () => {
    const graph = build()
    const entry = graph.omitted.find((o) => o.what === 'pipelines')
    // The two pipeline records. `PIPELINES` also holds their blocks, which are records of their own
    // now and are not pipelines.
    expect(entry?.count).toBe(2)
    expect(entry?.why).toContain('Pipelines are drawn separately')
  })
})

// ============================================================================ badges

describe('the compact form: what a module-first card scans by', () => {
  it('says what every badge is the compact form of, so a card can stand it down', () => {
    const graph = build()
    const twin = graph.nodes.find((node) => node.recordId === 'm-twin')
    const of = new Map(twin?.badges.map((badge) => [badge.key, badge.summarises]) ?? [])
    // A count the card also states as a fact, so an opened card prints the fact and not the badge.
    expect(of.get('checklist')).toBe('facts')
    expect(of.get('carries')).toBe('facts')
    // Trouble is nothing else on the node: the `checklist` fact counts what is DONE, so a module
    // with two failed items and one done one would otherwise look like ordinary progress.
    expect(of.get('checklist-stopped')).toBeNull()
    // And the module's own words, the longest thing it holds, are never a badge at all.
    expect(twin?.badges.some((badge) => badge.short.includes('simulated arm'))).toBe(false)
    expect(twin?.facts.some((fact) => fact.label === 'why it exists')).toBe(true)
  })

  it('keeps every badge short enough to scan and every sentence longer than it', () => {
    const graph = build()
    for (const node of graph.nodes) {
      for (const badge of node.badges) {
        expect(badge.short.length, `${node.title} / ${badge.key}`).toBeLessThan(32)
        expect(badge.full.length).toBeGreaterThan(badge.short.length)
      }
    }
  })

  it('puts the checklist item that stopped short first, and says so in three words', () => {
    const graph = build()
    const twin = graph.nodes.find((node) => node.recordId === 'm-twin')
    // 1 of 2 done, 1 failed. The failure is what a person scans for, so it outranks the count — and
    // a card that has room for three badges shows it whatever else the node holds.
    expect(twin?.badges[0]?.key).toBe('checklist-stopped')
    expect(twin?.badges[0]?.short).toBe('1 item stopped short')
    expect(twin?.badges[0]?.alarm).toBe('raised')
    expect(twin?.badges[0]?.full).toContain('did not finish')
    expect(twin?.badges.find((badge) => badge.key === 'checklist')?.short).toBe('1 of 2 done')
  })

  it('counts steps and pipelines apart, so a count can never read as one module per step', () => {
    const graph = build()
    const egm = graph.nodes.find((node) => node.recordId === 'm-egm')
    // The badge about its stopped work also says how much it carries in all, and in what.
    const stopped = egm?.badges.find((badge) => badge.key === 'carries-stopped')
    expect(stopped?.full).toContain('6 steps across 2 pipelines')
    // And the drawing says once, in its own notes, that two cards can be counting the same step.
    expect(graph.notes.join(' ')).toContain('one step can be carried by two modules')
  })

  it('counts a module’s carried steps that stopped short, on the module they are wrong with', () => {
    const graph = build()
    // s2r-07 is blocked and hv2-03 failed; both name EGM bridge. Blocked work is drawn as a count on
    // the module it affects rather than as boxes of its own.
    const egm = graph.nodes.find((node) => node.recordId === 'm-egm')
    const stopped = egm?.badges.find((badge) => badge.key === 'carries-stopped')
    expect(stopped?.count).toBe(2)
    expect(stopped?.short).toBe('2 steps stopped short')
    expect(stopped?.alarm).toBe('raised')
    // And the module with nothing wrong carries no such badge at all.
    const grip = graph.nodes.find((node) => node.recordId === 'm-grip')
    expect(grip?.badges.some((badge) => badge.key === 'carries-stopped')).toBe(false)
  })

  it('counts attached records by kind rather than as a bare number', () => {
    const links = [
      link({ linkId: 'L1', fromId: 'r-ik', toId: 'm-egm', type: 'blocks', gate: { at: 'gate', gate: { kind: 'hard' } } }),
    ]
    const graph = build({ links, attention: attention([row({ recordId: 'r-branch' })]) })
    const egm = graph.nodes.find((node) => node.recordId === 'm-egm')
    const badge = egm?.badges.find((b) => b.key === 'attached:problem')
    // "1 problem" alone would read as a fact about the module. Beside "2 items stopped short" on a
    // real card, "3 pipelines" was photographed and read as "this module is in three pipelines",
    // which is a different fact the same card also has. The word "attached" is what fixes it.
    expect(badge?.short).toBe('1 problem attached')
    expect(badge?.count).toBe(1)
    expect(badge?.summarises).toBe('attached')
    // The full record is still attached in full. A badge is a summary of `attached` and never a
    // replacement for it.
    expect(egm?.attached.map((item) => item.recordId)).toContain('r-ik')
  })

  it('keeps every module badge a summary of something else on the same node', () => {
    const graph = build()
    for (const node of graph.nodes) {
      for (const badge of node.badges) {
        expect(badge.short.length, `${node.title} / ${badge.key}`).toBeLessThan(32)
        expect(badge.full.length).toBeGreaterThan(badge.short.length)
      }
    }
  })

  it('says who carries a step as a list, and never as one owner', () => {
    const graph = build({ scope: { at: 'pipeline', recordId: 'p-s2r' } })
    const six = graph.nodes.find((node) => node.stepId === 's2r-06')
    expect(six?.carriedBy).toEqual(['Digital twin', 'EGM bridge'])
    // Two modules carry it: two `carries` lines, one badge that says two, and the names in the fact
    // and in the badge's sentence. Nothing anywhere reduces it to one owner.
    expect(six?.badges.find((badge) => badge.key === 'carried-by')?.short).toBe('carried by 2')
    expect(six?.badges.find((badge) => badge.key === 'carried-by')?.full).toContain('Digital twin, EGM bridge')
    expect(graph.edges.filter((edge) => edge.relation === 'carries' && edge.to === six?.id)).toHaveLength(2)

    // The one case a line cannot draw, because it has nothing at the far end.
    const nine = graph.nodes.find((node) => node.stepId === 's2r-09')
    expect(nine?.carriedBy).toEqual([])
    expect(nine?.badges.find((badge) => badge.key === 'carried-by')?.short).toBe('nobody carries this')
    expect(graph.edges.filter((edge) => edge.relation === 'carries' && edge.to === nine?.id)).toHaveLength(0)
  })

  it('says a block no module is recorded as carrying is an answer, on the badge too', () => {
    // TWO ANSWERS BECAME ONE. `modules: []` and a missing `modules` were different facts; the
    // mapping is `implements` links now, and a link exists or it does not. The badge says the one
    // thing that is still true, and it is not an alarm: a block nobody owns yet is a real answer.
    const gap = record({ id: 'p-gap', kind: 'pipeline', title: 'Gap', data: { blockIds: ['gap-a'] } })
    const block = record({ id: 'gap-a', kind: 'block', title: 'Gap \u203a A', data: { state: 'todo' } })
    const graph = build({ records: [...RECORDS, gap, block], scope: { at: 'pipeline', recordId: 'p-gap' } })
    const node = graph.nodes.find((n) => n.stepId === 'gap-a')
    expect(node?.carriedBy).toEqual([])
    expect(node?.badges.find((badge) => badge.key === 'carried-by')?.short).toBe('nobody carries this')
  })

  it('counts what holds a pipeline up and what nobody owns, on the pipeline box', () => {
    const graph = build({
      scope: { at: 'pipeline', recordId: 'p-s2r' },
      links: [
        ...BLOCK_LINKS,
        link({
          linkId: 'L1',
          fromId: 'r-ik',
          toId: 'p-s2r',
          type: 'blocks',
          gate: { at: 'gate', gate: { kind: 'partial', upTo: 's2r-06' } },
        }),
      ],
    })
    const box = graph.nodes.find((node) => node.kind === 'pipeline')
    const keys = box?.badges.map((badge) => badge.key) ?? []
    expect(keys).toContain('walls')
    expect(keys).toContain('unowned')
    expect(keys).toContain('steps-stopped')
    expect(box?.badges.find((badge) => badge.key === 'unowned')?.short).toBe('1 step nobody carries')
    expect(box?.badges.find((badge) => badge.key === 'walls')?.short).toBe('held up by 1')
    // How far it has got is a count, so the badge and the fact say the same thing and the badge
    // stands down where the fact is printed. Both say it identically.
    expect(box?.badges.find((badge) => badge.key === 'steps')?.short).toBe('3 of 10 done')
    expect(box?.facts.find((fact) => fact.label === 'steps')?.value).toBe('3 of 10 done')
    expect(box?.badges.find((badge) => badge.key === 'steps')?.summarises).toBe('facts')
  })
})

// ============================================================================ attachments

describe('what attaches to a card, and why', () => {
  const links = [
    link({ linkId: 'L1', fromId: 'r-ik', toId: 'm-egm', type: 'blocks', gate: { at: 'gate', gate: { kind: 'hard' } } }),
    link({ linkId: 'L2', fromId: 'r-quiet', toId: 'm-egm', type: 'produces' }),
  ]

  it('attaches a record the attention rule selected, with the server’s facts in the word lists’ words', () => {
    const graph = build({ links, attention: attention([row({ recordId: 'r-ik', title: 'IK solver' })]) })
    const egm = graph.nodes.find((node) => node.recordId === 'm-egm')
    const found = egm?.attached.find((item) => item.recordId === 'r-ik')
    expect(found?.source).toBe('attention-rule')
    // The server's coded clause, said with the attention list's own words (homeWords.reason.*),
    // and not the English sentence the server writes for an agent (report dbPgS8ooliII, block b-6).
    expect(found?.because).toMatch(/^Its state “.+” means the work stopped short of finishing\.$/)
    expect(found?.onFirstScreen).toBe(true)
  })

  it('reads the remainder as well as the first screen, so a held-back row is still attached', () => {
    const graph = build({ links, attention: attention([], [row({ recordId: 'r-ik' })]) })
    const egm = graph.nodes.find((node) => node.recordId === 'm-egm')
    expect(egm?.attached.find((item) => item.recordId === 'r-ik')?.onFirstScreen).toBe(false)
  })

  it('attaches a gated blocker even when the rule did not select it, because the gate is a statement', () => {
    const graph = build({ links, attention: attention() })
    const egm = graph.nodes.find((node) => node.recordId === 'm-egm')
    const found = egm?.attached.find((item) => item.recordId === 'r-ik')
    expect(found?.source).toBe('stored-link')
    expect(found?.gate).toEqual({ kind: 'hard' })
  })

  it('counts the linked records it did not attach, and says why, rather than showing nothing', () => {
    const graph = build({ links, attention: attention() })
    const entry = graph.omitted.find((o) => o.what.startsWith('records linked to a module'))
    expect(entry?.count).toBe(1)
    expect(entry?.why).toContain('nothing is owed on them')
  })

  it('keeps a link whose far end has been deleted, drawn as broken rather than disappearing', () => {
    const graph = build({
      links: [link({ linkId: 'L9', fromId: 'gone-forever', toId: 'm-egm', type: 'blocks' })],
      attention: attention(),
    })
    const egm = graph.nodes.find((node) => node.recordId === 'm-egm')
    const found = egm?.attached.find((item) => item.recordId === 'gone-forever')
    expect(found?.state).toBe('broken')
    expect(found?.because).toContain('has been deleted')
  })
})

// ============================================================================ gates

describe('how far a partial gate lets you go', () => {
  const s2r = asFlowSteps(SIM2REAL)
  const hv2 = asFlowSteps(HANDOVER)

  it('is the real case from this lab: the twin can be built and checked, and not validated', () => {
    const reach = model.gateReach(s2r, 's2r-06')
    expect(reach).not.toBeNull()
    // Everything the named step waits on, and the step itself.
    expect(reach?.allowed).toEqual(['s2r-01', 's2r-02', 's2r-03', 's2r-04', 's2r-05', 's2r-06'])
    // Everything that waits on it.
    expect(reach?.walled).toEqual(['s2r-10'])
    // And the branch nothing places on either side, which is a question for a person.
    expect(reach?.unplaced).toEqual(['s2r-07', 's2r-08', 's2r-09'])
    expect(reach?.sentence).toContain('You may go as far as')
    expect(reach?.sentence).toContain('with no recorded place')
  })

  it('places every step when the pipeline is a chain, leaving nothing unplaced', () => {
    const reach = model.gateReach(hv2, 'hv2-03')
    expect(reach?.allowed).toEqual(['hv2-01', 'hv2-02', 'hv2-03'])
    expect(reach?.walled).toEqual(['hv2-04', 'hv2-05', 'hv2-06', 'hv2-07', 'hv2-08', 'hv2-09'])
    expect(reach?.unplaced).toEqual([])
  })

  it('refuses to guess when `upTo` is a stage in words rather than a step id', () => {
    expect(model.gateReach(s2r, 'the two pages can be drafted; the force table cannot be filled in')).toBeNull()
  })

  it('marks the step the wall stands at, and the steps behind it, and leaves the open stretch clear', () => {
    const walls = [
      {
        linkId: 'L1',
        recordId: 'r-branch',
        title: 'Branch B: contact model',
        gate: { kind: 'partial' as const, upTo: 's2r-06' },
        words: gateLabel({ kind: 'partial', upTo: 's2r-06' }),
        reach: model.gateReach(s2r, 's2r-06'),
        sentence: 'x',
      },
    ]
    const marks = model.stepWallMarks(walls, s2r)
    expect(marks.get('s2r-01')).toBeUndefined()
    expect(marks.get('s2r-05')).toBeUndefined()
    expect(marks.get('s2r-06')?.at).toBe('at')
    expect(marks.get('s2r-10')?.at).toBe('behind')
    expect(marks.get('s2r-07')?.at).toBe('unplaced')
  })

  it('puts every step behind a hard gate, which is what hard means', () => {
    const walls = [
      {
        linkId: 'L2',
        recordId: 'r-ik',
        title: 'IK solver',
        gate: { kind: 'hard' as const },
        words: gateLabel({ kind: 'hard' }),
        reach: null,
        sentence: 'x',
      },
    ]
    const marks = model.stepWallMarks(walls, s2r)
    expect(marks.size).toBe(s2r.length)
    expect([...marks.values()].every((mark) => mark.at === 'behind')).toBe(true)
  })

  it('lets the stronger word win when two walls disagree about one step', () => {
    const soft = {
      linkId: 'L1',
      recordId: 'r-branch',
      title: 'Branch B',
      gate: { kind: 'partial' as const, upTo: 's2r-06' },
      words: '',
      reach: model.gateReach(s2r, 's2r-06'),
      sentence: '',
    }
    const hard = {
      linkId: 'L2',
      recordId: 'r-ik',
      title: 'IK solver',
      gate: { kind: 'hard' as const },
      words: '',
      reach: null,
      sentence: '',
    }
    const marks = model.stepWallMarks([soft, hard], s2r)
    // s2r-06 is where the partial wall stands AND behind the hard one. Behind wins: a step you
    // cannot reach must not be drawn as one you may.
    expect(marks.get('s2r-06')?.at).toBe('behind')
    expect(marks.get('s2r-06')?.by).toHaveLength(2)
  })

  /** The words of the one wall into Transplant v2, standing at `upTo`. */
  const wallWords = (upTo: string) =>
    build({
      scope: { at: 'pipeline', recordId: 'p-hv2' },
      links: [
        link({
          linkId: 'L1',
          fromId: 'r-ik',
          toId: 'p-hv2',
          type: 'blocks',
          gate: { at: 'gate', gate: { kind: 'partial', upTo } },
        }),
      ],
    }).walls[0]?.words

  // THE STEP BY ITS NUMBER AND TITLE, NEVER BY ITS ID (wave 13y round 83). The wall drew `upTo` as it is stored, and
  // at a step that is the step's id: "only as far as hv2-03 until this finishes". MUTATIONS, after a control run:
  // the wall's call to `gateWordsForReader` in src/web/components/graph/model.ts passes no stage, and the first case
  // fails; it passes the words for a step that is not in this pipeline for anything that is no step here, and the
  // case of a stage in words fails; it passes nothing for a block of another pipeline, and that case fails.
  it('words a gate as the shared contract does, with the step’s number and title where the step’s id is stored', () => {
    const words = wallWords('hv2-03')
    expect(words).toBe(gateLabel({ kind: 'partial', upTo: '03 Plan the approach' }))
    expect(words).not.toContain('hv2-03')
  })

  it('draws a stage named in words as it is stored', () => {
    expect(wallWords('the approach is planned')).toBe(gateLabel({ kind: 'partial', upTo: 'the approach is planned' }))
  })

  it('says in words that a block of another pipeline is not a step of this one, and never draws its id', () => {
    const words = wallWords('s2r-03')
    expect(words).toBe(gateLabel({ kind: 'partial', upTo: 'a step that is not in this pipeline' }))
    expect(words).not.toContain('s2r-03')
  })
})

// ============================================================================ the pipeline scope

describe('the pipeline scope', () => {
  const scope = { at: 'pipeline' as const, recordId: 'p-s2r' }

  it('nests every step inside the pipeline it is stored in', () => {
    const graph = build({ scope })
    const steps = graph.nodes.filter((node) => node.kind === 'step')
    expect(steps).toHaveLength(SIM2REAL.length)
    expect(steps.every((node) => node.parentId === 'pipe:p-s2r')).toBe(true)
  })

  it('keeps stable step identity: the node id carries the pipeline id and the stored step id', () => {
    const graph = build({ scope })
    for (const node of graph.nodes.filter((n) => n.kind === 'step')) {
      expect(node.id).toBe(`step:p-s2r:${node.stepId}`)
      expect(SIM2REAL.some((step) => step.id === node.stepId)).toBe(true)
    }
  })

  it('draws each step’s own `needs` as a line, carrying the gate that was recorded on it', () => {
    const graph = build({ scope })
    const needs = graph.edges.filter((edge) => edge.relation === 'needs')
    expect(needs).toHaveLength(SIM2REAL.reduce((sum, step) => sum + (step.needs?.length ?? 0), 0))
    const partial = needs.find((edge) => edge.to === 'step:p-s2r:s2r-07')
    expect(partial?.gate).toEqual({ kind: 'partial', upTo: 'kinematics checked in simulation' })
    expect(partial?.gateWords).toBe(gateLabel({ kind: 'partial', upTo: 'kinematics checked in simulation' }))
    const hard = needs.find((edge) => edge.to === 'step:p-s2r:s2r-02')
    expect(hard?.gate).toEqual({ kind: 'hard' })
  })

  it('cannot be given a dependency on an id nothing holds, because a link has two real ends', () => {
    // A `needs` was a string in a JSON array and nothing checked it, so a step could wait on an id
    // nothing held and the drawing had to report a broken line. `links.from_id` and `to_id` are
    // foreign keys to `records.id`, so that row cannot exist — and a `blocks` link from a record
    // that is not one of this pipeline's blocks is drawn as an ATTACHMENT on the block instead,
    // which is where a problem blocking one step belongs.
    const bent = record({ id: 'p-bent', kind: 'pipeline', title: 'Bent', data: { blockIds: ['bent-a'] } })
    const block = record({ id: 'bent-a', kind: 'block', title: 'Bent \u203a A', data: { state: 'todo' } })
    const graph = build({
      records: [...RECORDS, bent, block],
      links: [link({ linkId: 'LB', fromId: 'r-ik', toId: 'bent-a', type: 'blocks', gate: { at: 'gate', gate: { kind: 'hard' } } })],
      scope: { at: 'pipeline', recordId: 'p-bent' },
    })
    expect(graph.edges.filter((e) => e.relation === 'needs')).toEqual([])
    const node = graph.nodes.find((n) => n.stepId === 'bent-a')
    expect(node?.attached.map((a) => a.recordId)).toEqual(['r-ik'])
  })

  it('draws a `carries` line per (step, module) pair and gives it no arrowhead-bearing gate', () => {
    const graph = build({ scope })
    const carries = graph.edges.filter((edge) => edge.relation === 'carries')
    // Ten pairings across ten steps: s2r-06 names two modules and s2r-09 names none. That the two
    // numbers differ is the whole point — a drawing with one line per step could not say it.
    expect(carries).toHaveLength(10)
    expect(carries.filter((edge) => edge.to === 'step:p-s2r:s2r-06')).toHaveLength(2)
    expect(carries.filter((edge) => edge.to === 'step:p-s2r:s2r-09')).toHaveLength(0)
    expect(carries.every((edge) => edge.gate === null && edge.linkId === null)).toBe(true)
  })

  // -------------------------------------------------------------------- the bundle, not drawn at once
  //
  // A PHOTOGRAPH FOUND THIS. Ten `carries` lines, every pill reading the same word, stacked down the
  // left of the canvas: individually correct, together the busiest thing in the drawing and louder
  // than the dependencies a reader opens a pipeline to follow. The decision is a DRAWING decision
  // and nothing else — `carries` stays canonical, every edge is still built, and the group below
  // pins both halves of that so a later pass cannot quietly turn the fold into a deletion.

  it('keeps every `carries` edge in the meaning and marks it as drawn on selection, not by default', () => {
    const graph = build({ scope })
    const carries = graph.edges.filter((edge) => edge.relation === 'carries')
    expect(carries).toHaveLength(10)
    expect(carries.every((edge) => edge.drawn === 'on-selection')).toBe(true)
    // Every OTHER line is drawn all the time. A dependency is the reason a pipeline is drawn at all.
    const rest = graph.edges.filter((edge) => edge.relation !== 'carries')
    expect(rest.length).toBeGreaterThan(0)
    expect(rest.every((edge) => edge.drawn === 'always')).toBe(true)
  })

  it('draws far fewer lines by default, and they are the dependencies', () => {
    const graph = build({ scope })
    const byDefault = model.edgesDrawnByDefault(graph)
    // The measured before and after on the pipeline the review tool photographs.
    expect(graph.edges).toHaveLength(21)
    expect(byDefault).toHaveLength(11)
    expect(byDefault.filter((edge) => edge.relation === 'needs')).toHaveLength(11)
    expect(byDefault.some((edge) => edge.relation === 'carries')).toBe(false)
  })

  it('counts the lines it holds back exactly, names them, and says where the whole mapping is', () => {
    const graph = build({ scope })
    const held = graph.omitted.find((entry) => entry.what.includes('lines from a module to a step it carries'))
    expect(held, 'a fold this product allows is counted and named').toBeDefined()
    expect(held?.count).toBe(10)
    // Counted as PAIRS and named as pairs, so the sentence cannot be read as one module per step.
    expect(held?.why).toContain('2 modules carry 9 steps here')
    expect(held?.why).toContain('steps × modules grid')
    expect(held?.why).toContain('Nothing about the stored relationship changed.')
  })

  it('selects both ways round, because the mapping is many-to-many in both directions', () => {
    const graph = build({ scope })
    // A STEP TWO MODULES CARRY. Selecting it lights both of them, and neither is dropped.
    const six = graph.nodes.find((node) => node.stepId === 's2r-06')!
    const fromStep = model.litBySelection(graph, new Set([six.id]))
    expect(fromStep.edges.size).toBe(2)
    expect([...fromStep.nodes].filter((id) => id.startsWith('mod:')).sort()).toEqual(['mod:m-egm', 'mod:m-twin'])

    // A MODULE THAT CARRIES SEVERAL STEPS. Selecting it lights every one of them.
    const twin = graph.nodes.find((node) => node.recordId === 'm-twin' && node.kind === 'module')!
    const fromModule = model.litBySelection(graph, new Set([twin.id]))
    const carried = graph.edges.filter((edge) => edge.relation === 'carries' && edge.from === twin.id)
    expect(carried.length).toBeGreaterThan(1)
    expect(fromModule.edges.size).toBe(carried.length)
    expect(fromModule.nodes.has(six.id)).toBe(true)

    // The two answers agree about the one line they share, which is what "both ways round" means.
    const shared = [...fromStep.edges].filter((id) => fromModule.edges.has(id))
    expect(shared).toHaveLength(1)
  })

  it('reveals only what is held back, so a selection never restates a line already on screen', () => {
    const graph = build({ scope })
    const seven = graph.nodes.find((node) => node.stepId === 's2r-07')!
    const lit = model.litBySelection(graph, new Set([seven.id]))
    // s2r-07 waits on other steps, and those lines were never hidden. Reporting them as "revealed"
    // would tell a reader something appeared when nothing did.
    expect(graph.edges.some((edge) => edge.relation === 'needs' && edge.to === seven.id)).toBe(true)
    for (const id of lit.edges) {
      expect(graph.edges.find((edge) => edge.id === id)?.relation).toBe('carries')
    }
  })

  it('lights nothing for a step nobody carries, and that is an answer the card already gives', () => {
    const graph = build({ scope })
    const nine = graph.nodes.find((node) => node.stepId === 's2r-09')!
    const lit = model.litBySelection(graph, new Set([nine.id]))
    expect(lit.edges.size).toBe(0)
    // Nothing lit and nothing to say are different things. The card says which of the three answers
    // this is, in words, whether or not anything is selected.
    expect(nine.badges.find((badge) => badge.key === 'carried-by')?.short).toBe('nobody carries this')
    expect(model.carriesOf(graph, nine.id)).toHaveLength(0)
  })

  it('lights nothing at all when nothing is selected, which is the state the drawing opens in', () => {
    const graph = build({ scope })
    const lit = model.litBySelection(graph, new Set())
    expect(lit.edges.size).toBe(0)
    expect(lit.nodes.size).toBe(0)
  })

  it('finds a node’s `carries` lines from either end with one function', () => {
    const graph = build({ scope })
    const six = graph.nodes.find((node) => node.stepId === 's2r-06')!
    const twin = graph.nodes.find((node) => node.recordId === 'm-twin' && node.kind === 'module')!
    expect(model.carriesOf(graph, six.id)).toHaveLength(2)
    expect(model.carriesOf(graph, twin.id).length).toBeGreaterThan(1)
    // Whichever end you ask from, the line between the two is the same stored fact and the same id.
    const fromStep = model.carriesOf(graph, six.id).map((edge) => edge.id)
    const fromModule = model.carriesOf(graph, twin.id).map((edge) => edge.id)
    expect(fromStep.filter((id) => fromModule.includes(id))).toHaveLength(1)
  })

  it('still says on every step card how many modules carry it, with nothing selected', () => {
    const graph = build({ scope })
    for (const step of graph.nodes.filter((node) => node.kind === 'step')) {
      const badge = step.badges.find((b) => b.key === 'carried-by')
      expect(badge, `${step.stepId} says who carries it`).toBeDefined()
      // TWO answers and never a blank: a count, or nobody. It was three, because `modules` was an
      // array on a stored step and an absent key was a different fact from an empty one. `implements`
      // is a link now and a link is a row that exists or does not, so shared/blocks.ts states the
      // third answer is gone and forbids inventing it back — and a test still offering it as an
      // acceptable reading is how it would come back.
      expect(['carried by', 'nobody carries this'].some((word) => badge!.short.includes(word))).toBe(true)
    }
  })

  // -------------------------------------------------------------------- the count, where a reader is
  //
  // WHAT THE HELD-BACK BUNDLE COSTS IF THE COUNT IS NOT ON THE CARD. With the lines off by default,
  // a badge is the only thing on the canvas saying a module carries anything at all. So the number it
  // states has to be the number a press produces, at both ends, or the fold is a lie about the size
  // of what was folded.

  it('states a count on each card that is exactly the lines a press on it reveals, at both ends', () => {
    const graph = build({ scope })
    const carrying = graph.nodes.filter((node) => node.kind === 'module' || node.kind === 'step')
    expect(carrying.length).toBeGreaterThan(2)
    for (const node of carrying) {
      const badge = node.badges.find((b) => b.key === (node.kind === 'module' ? 'carries' : 'carried-by'))
      expect(badge, `${node.title} states what it carries`).toBeDefined()
      const lines = model.carriesOf(graph, node.id)
      // THE SAME NUMBER THREE WAYS: what the badge says, what the edges hold, and what a selection
      // brings back. Any two of them agreeing and the third not is how a fold stops being counted.
      expect(badge?.count, `${node.title} counts its own \`carries\` lines`).toBe(lines.length)
      expect(model.litBySelection(graph, new Set([node.id])).edges.size).toBe(lines.length)
    }
  })

  it('marks the carries count as standing in for lines, and marks nothing else that way', () => {
    const graph = build({ scope })
    const marked = new Set<string>()
    for (const node of graph.nodes) for (const badge of node.badges) if (badge.standsInForLines) marked.add(badge.key)
    // ONLY THE TWO ENDS OF THE HELD-BACK RELATIONSHIP. Every other badge counts something the picture
    // draws or something a record page holds, so it can be ranked off a card and be findable anyway.
    expect([...marked].sort()).toEqual(['carried-by', 'carries'])
    // Including the zero forms: "carries no step" and "nobody carries this" are the answers that say
    // WHY a card has nothing joining it to the rest, so losing them leaves the same silent card.
    const nine = graph.nodes.find((node) => node.stepId === 's2r-09')!
    expect(nine.badges.find((b) => b.key === 'carried-by')?.standsInForLines).toBe(true)
  })

  it('says a block nobody carries is an answer, not a field somebody forgot', () => {
    const graph = build({ scope })
    const nine = graph.nodes.find((node) => node.stepId === 's2r-09')
    expect(nine?.note).toBe('—')
    expect(nine?.facts.find((fact) => fact.label === 'carried by')?.value).toBe('—')
  })

  it('draws the modules that carry its steps as their own cards, outside the pipeline box', () => {
    const graph = build({ scope })
    const modules = graph.nodes.filter((node) => node.kind === 'module')
    expect(modules.map((node) => node.title).sort()).toEqual(['Digital twin', 'EGM bridge'])
    expect(modules.every((node) => node.parentId === null)).toBe(true)
  })

  it('says so rather than drawing an empty canvas when the scope names no pipeline on file', () => {
    const graph = build({ scope: { at: 'pipeline', recordId: 'nothing' } })
    expect(graph.nodes).toHaveLength(0)
    // The sentence stopped naming the id — a database id in prose a person reads, which the
    // language audit took out of every screen. What has to survive is that a scope naming no
    // pipeline SAYS SO rather than drawing an empty canvas, which is this test's own title.
    expect(graph.problem).toContain('no pipeline at that address')
  })
})

// ============================================================================ presentation intent

describe('presentation intent, read and reported', () => {
  it('decides a direction when nobody stored one, and says which of the two happened', () => {
    const modules = build()
    expect(modules.direction).toBe('down')
    expect(modules.directionSource).toBe('default')
    expect(modules.directionBecause).toContain('Nobody stored a direction')
    // A pipeline is one connected chain, so it runs the other way. Both answers were measured.
    const pipeline = build({ scope: { at: 'pipeline', recordId: 'p-s2r' } })
    expect(pipeline.direction).toBe('right')
    expect(pipeline.directionSource).toBe('default')
  })

  it('draws a node where somebody put it, and says so as an honoured hint', () => {
    // CRITERION D19: a position may be stored. The earlier rule that a block's position is never
    // stored and is drawn afresh each time is void. A hint the drawing took
    // is said in words like every other, so a reader can check what became of what they arranged.
    const graph = build({ intent: { nodes: { 'm-bench': { x: 120, y: 48 } } } })
    const bench = graph.nodes.find((node) => node.presentation.target === 'm-bench')
    expect(bench?.presentation.placedAt, 'the stored place did not reach the node').toEqual({ x: 120, y: 48 })
    expect(graph.report.honoured.join(' '), 'the drawing did not say it drew the node where somebody put it').toContain(
      'put at 120, 48',
    )
    expect(graph.report.unhonoured).toEqual([])
  })

  it('leaves a node nobody moved with no place of its own', () => {
    const graph = build({ intent: { nodes: { 'm-bench': { role: 'compact' } } } })
    for (const node of graph.nodes) expect(node.presentation.placedAt, node.title).toBeNull()
  })

  it('takes a stored direction over its own, and reports it as honoured', () => {
    const graph = build({ intent: { direction: 'right' } })
    expect(graph.direction).toBe('right')
    expect(graph.directionSource).toBe('stored')
    expect(graph.report.honoured.join(' ')).toContain('direction: Left to right')
    expect(graph.report.unhonoured).toEqual([])
  })

  it('names the scope its intent is stored under, which is not this file’s own key', () => {
    // `scopeKey` says `modules`; the stored vocabulary calls the whole-project graph `structure`.
    expect(model.scopeKey({ at: 'modules' })).toBe('modules')
    expect(model.intentScopeKey({ at: 'modules' })).toBe('structure')
    expect(model.intentScopeKey({ at: 'pipeline', recordId: 'p-s2r' })).toBe('pipeline:p-s2r')
  })

  it('keys every node’s intent by its record id, blocks included', () => {
    // ONE FORM OF TARGET. It was `step:<step id>` for a step and a record id for everything else,
    // and the prefix was declared twice — here and on the server — each with a header saying it
    // should be built in one place. A block is a record, so the second form is gone.
    const graph = build({ scope: { at: 'pipeline', recordId: 'p-s2r' } })
    const step = graph.nodes.find((node) => node.stepId === 's2r-04')
    expect(step?.presentation.target).toBe('s2r-04')
    const box = graph.nodes.find((node) => node.kind === 'pipeline')
    expect(box?.presentation.target).toBe('p-s2r')
  })

  it('works an emphasis out of the state word, and lets a stored one win', () => {
    const graph = build({ scope: { at: 'pipeline', recordId: 'p-s2r' } })
    const blocked = graph.nodes.find((node) => node.stepId === 's2r-07')
    expect(blocked?.presentation.emphasis).toBe('blocked')
    expect(blocked?.presentation.emphasisSource).toBe('state')
    expect(blocked?.presentation.emphasisBecause).toContain('did not finish')
    const done = graph.nodes.find((node) => node.stepId === 's2r-01')
    expect(done?.presentation.emphasis).toBe('muted')
    const doing = graph.nodes.find((node) => node.stepId === 's2r-04')
    expect(doing?.presentation.emphasis).toBe('active')

    const stored = build({
      scope: { at: 'pipeline', recordId: 'p-s2r' },
      intent: { nodes: { 's2r-01': { emphasis: 'safety' } } },
    })
    const overridden = stored.nodes.find((node) => node.stepId === 's2r-01')
    expect(overridden?.presentation.emphasis).toBe('safety')
    expect(overridden?.presentation.emphasisSource).toBe('stored')
  })

  it('says a module has no emphasis rather than inventing one out of its checklist', () => {
    const graph = build()
    const twin = graph.nodes.find((node) => node.recordId === 'm-twin')
    expect(twin?.presentation.emphasis).toBeNull()
    expect(twin?.presentation.emphasisSource).toBe('none')
    expect(twin?.presentation.emphasisBecause).toContain('no state word')
  })

  it('gives safety the emphasis whatever the state word says, because age may not quieten it', () => {
    const graph = build({
      attention: attention([row({ recordId: 'm-egm', safety: true })]),
    })
    const egm = graph.nodes.find((node) => node.recordId === 'm-egm')
    expect(egm?.presentation.emphasis).toBe('safety')
    expect(egm?.presentation.emphasisBecause).toContain('person could be hurt')
  })

  it('stores a role on the node and reports what it did with it', () => {
    const graph = build({ intent: { nodes: { 'm-bench': { role: 'compact' } } } })
    const bench = graph.nodes.find((node) => node.recordId === 'm-bench')
    expect(bench?.presentation.role).toBe('compact')
    expect(bench?.presentation.roleSource).toBe('stored')
    const others = graph.nodes.filter((node) => node.recordId !== 'm-bench')
    expect(others.every((node) => node.presentation.role === 'normal')).toBe(true)
    expect(others.every((node) => node.presentation.roleSource === 'default')).toBe(true)
    expect(graph.report.honoured.join(' ')).toContain('role: compact on m-bench')
  })

  /**
   * WHAT THE REPORT PROMISES A ROLE DID HAS TO BE WHAT THE CARD DOES.
   *
   * This sentence used to read "its card is drawn one detail level higher", and it was false. The
   * rule in card.ts refuses to let any stored hint reach `expanded`, because a paragraph on the
   * canvas by default is the failure that pass removed — so at the level a drawing opens at, a
   * `prominent` node draws at exactly the same level as its neighbours and is WIDER instead. The
   * renderer happened to agree with the sentence and disagree with the rule, and neither the
   * sentence nor the renderer was tested against the rule, so all three could differ at once.
   *
   * This holds the two ends together: whatever the report says, `levelWithRole` decides.
   */
  it('does not promise a detail level the card rule will not give', async () => {
    const card = await import('../src/web/components/graph/card.ts')
    const prominent = build({ intent: { nodes: { 'm-bench': { role: 'prominent' } } } })
    const said = prominent.report.honoured.find((line) => line.includes('role: prominent'))
    expect(said).toBeDefined()
    // The rule: prominent stays where it is at the rungs that carry the drawing's own detail. R5
    // and R6 are the object the reader pressed, and no stored hint reaches them.
    expect(card.rungWithRole('R5', 'prominent')).toBe('R5')
    expect(card.rungWithRole('R6', 'prominent')).toBe('R6')
    expect(said).not.toContain('level higher')
    expect(said).toContain('wider')

    // Compact really does move a level, so its sentence is allowed to say so.
    const compact = build({ intent: { nodes: { 'm-bench': { role: 'compact' } } } })
    const saidCompact = compact.report.honoured.find((line) => line.includes('role: compact'))
    expect(card.rungWithRole('R4', 'compact')).toBe('R3')
    expect(saidCompact).toContain('lower')
  })

  it('resolves `near` to a node on this canvas, and refuses to guess when it names nothing', () => {
    const good = build({ intent: { nodes: { 'm-twin': { near: 'm-egm' } } } })
    expect(good.nodes.find((node) => node.recordId === 'm-twin')?.presentation.near).toBe('mod:m-egm')
    expect(good.report.unhonoured).toEqual([])

    const bad = build({ intent: { nodes: { 'm-twin': { near: 'r-ik' } } } })
    expect(bad.nodes.find((node) => node.recordId === 'm-twin')?.presentation.near).toBeNull()
    const said = bad.report.unhonoured.find((entry) => entry.hint === 'near: r-ik')
    expect(said?.target).toBe('m-twin')
    expect(said?.because).toContain('Nothing drawn here has that id')
    // And it says what a `near` may name, so the reader can fix it without reading the source.
    expect(said?.because).toContain(sayInEnglish('g7b.model.a_near_names_another_record_drawn_here', { v1: '' }).trim())
  })

  it('reports a target nothing on the canvas answers to, rather than ignoring it', () => {
    const graph = build({ intent: { nodes: { 'p-s2r': { lane: 'the arm' } } } })
    const said = graph.report.unhonoured.find((entry) => entry.target === 'p-s2r')
    expect(said?.hint).toBe('all of it')
    // The reason has to say what a target here MAY be, or the reader has to read the source.
    expect(said?.because).toContain('module record id')
    expect(said?.because).toContain('own drawing')
  })

  it('refuses to fold a node with nothing inside it, and says why', () => {
    const graph = build({ intent: { nodes: { 'm-twin': { collapsed: true } } } })
    expect(graph.nodes.find((node) => node.recordId === 'm-twin')?.presentation.collapsed).toBe(false)
    const said = graph.report.unhonoured.find((entry) => entry.target === 'm-twin')
    expect(said?.hint).toBe('collapsed: true')
    expect(said?.because).toContain('nothing to fold')
  })

  it('puts the nodes in the arranged order, and leaves an unarranged drawing exactly as it was', () => {
    const plain = build()
    const arranged = build({
      intent: {
        nodes: {
          'm-bench': { lane: 'the bench', order: 1 },
          'm-egm': { lane: 'the arm', order: 2 },
          'm-twin': { lane: 'the arm', order: 1 },
        },
      },
    })
    // Lanes in the order they were first met, then `order` inside a lane, then whatever was left.
    expect(arranged.nodes.map((node) => node.recordId)).toEqual(['m-twin', 'm-egm', 'm-bench', 'm-grip'])
    // And with nothing stored the array is untouched, so an unarranged drawing does not move.
    expect(plain.nodes.map((node) => node.recordId)).toEqual(MODULES.map((record) => record.id))
  })
})

describe('a folded pipeline', () => {
  const scope = { at: 'pipeline' as const, recordId: 'p-s2r' }
  const folded = () => build({ scope, intent: { nodes: { 'p-s2r': { collapsed: true } } } })

  it('draws the box and not its steps, and counts what is inside on the box', () => {
    const graph = folded()
    expect(graph.nodes.filter((node) => node.kind === 'step')).toHaveLength(0)
    const box = graph.nodes.find((node) => node.kind === 'pipeline')
    expect(box?.presentation.collapsed).toBe(true)
    expect(box?.badges.find((badge) => badge.key === 'folded')?.short).toBe('10 steps folded')
    expect(graph.report.honoured.join(' ')).toContain('collapsed: true on p-s2r')
  })

  it('counts every line it did not draw, so a folded box and an empty one cannot look alike', () => {
    const graph = folded()
    const steps = graph.omitted.find((entry) => entry.what.startsWith('steps folded'))
    expect(steps?.count).toBe(SIM2REAL.length)
    expect(steps?.why).toContain('record page')
    const lines = graph.omitted.find((entry) => entry.what.startsWith('lines between steps'))
    expect(lines?.count).toBe(SIM2REAL.reduce((sum, step) => sum + (step.needs?.length ?? 0), 0))
    expect(graph.edges.filter((edge) => edge.relation === 'needs')).toHaveLength(0)
  })

  it('joins each module’s `carries` lines onto the box and says how many steps each stands for', () => {
    const graph = folded()
    const carries = graph.edges.filter((edge) => edge.relation === 'carries')
    // Two modules carry steps of this pipeline, so two lines — not the ten pairings.
    expect(carries).toHaveLength(2)
    expect(carries.every((edge) => edge.to === 'pipe:p-s2r')).toBe(true)
    expect(carries.find((edge) => edge.from === 'mod:m-egm')?.label).toBe('carries 3 steps inside')
    expect(carries.find((edge) => edge.from === 'mod:m-twin')?.label).toBe('carries 7 steps inside')
  })

  it('draws those joined lines all the time: one per module is not the bundle that had to be folded', () => {
    const graph = folded()
    const carries = graph.edges.filter((edge) => edge.relation === 'carries')
    expect(carries.every((edge) => edge.drawn === 'always')).toBe(true)
    expect(model.edgesDrawnByDefault(graph).filter((edge) => edge.relation === 'carries')).toHaveLength(2)
    // And with nothing held back, nothing claims to be. A folded drawing must not print a sentence
    // about `carries` lines it is already showing.
    expect(graph.omitted.some((entry) => entry.what.includes('lines from a module to a step it carries'))).toBe(false)
  })

  it('refuses intent aimed at a folded step with the reason it deserves, not with “no such id”', () => {
    const graph = build({
      scope,
      intent: { nodes: { 'p-s2r': { collapsed: true }, 's2r-04': { role: 'prominent' } } },
    })
    const said = graph.report.unhonoured.find((entry) => entry.target === 's2r-04')
    // A folded step is not a typo and not a deleted record. Telling a reader "nothing here has that
    // id" would send them looking for a mistake they did not make.
    expect(said?.because).toContain('asked to fold')
    expect(said?.because).toContain('Unfold the pipeline')
    expect(said?.because).not.toContain('Nothing drawn here has that id')
  })

  it('leaves the walls and the modules alone, because neither is inside the fold', () => {
    const graph = build({
      scope,
      intent: { nodes: { 'p-s2r': { collapsed: true } } },
      links: [
        ...BLOCK_LINKS,
        link({
          linkId: 'L1',
          fromId: 'r-ik',
          toId: 'p-s2r',
          type: 'blocks',
          gate: { at: 'gate', gate: { kind: 'partial', upTo: 's2r-06' } },
        }),
      ],
    })
    expect(graph.walls).toHaveLength(1)
    expect(graph.walls[0]?.reach?.allowed).toHaveLength(6)
    expect(graph.nodes.filter((node) => node.kind === 'module')).toHaveLength(2)
  })
})

// ============================================================================ reading order

describe('the reading order', () => {
  it('prints everything a step waits on before the step itself', () => {
    const graph = build({ scope: { at: 'pipeline', recordId: 'p-s2r' } })
    const { order, cyclic } = model.readingOrder(graph)
    expect(cyclic).toEqual([])
    const at = new Map(order.map((node, i) => [node.id, i]))
    for (const edge of graph.edges) {
      if (edge.relation !== 'needs') continue
      expect(at.get(edge.from)!).toBeLessThan(at.get(edge.to)!)
    }
  })

  it('reports a circle rather than silently breaking it open', () => {
    const loop = record({ id: 'p-loop', kind: 'pipeline', title: 'Loop', data: { blockIds: ['loop-a', 'loop-b'] } })
    const blocks = [
      record({ id: 'loop-a', kind: 'block', title: 'Loop \u203a A', data: { state: 'todo' } }),
      record({ id: 'loop-b', kind: 'block', title: 'Loop \u203a B', data: { state: 'todo' } }),
    ]
    const graph = build({
      records: [...RECORDS, loop, ...blocks],
      links: [
        link({ linkId: 'LA', fromId: 'loop-b', toId: 'loop-a', type: 'blocks', gate: { at: 'gate', gate: { kind: 'hard' } } }),
        link({ linkId: 'LB', fromId: 'loop-a', toId: 'loop-b', type: 'blocks', gate: { at: 'gate', gate: { kind: 'hard' } } }),
      ],
      scope: { at: 'pipeline', recordId: 'p-loop' },
    })
    const { order, cyclic } = model.readingOrder(graph)
    expect(cyclic).toHaveLength(2)
    expect(order).toHaveLength(graph.nodes.length)
  })
})

// ============================================================================ the reading layer

describe('the reading layer, which is the composition a phone gets', () => {
  const scope = { at: 'pipeline' as const, recordId: 'p-hv2' }
  const wallLinks = [
    link({
      linkId: 'L1',
      fromId: 'r-ik',
      toId: 'p-hv2',
      type: 'blocks',
      gate: { at: 'gate', gate: { kind: 'partial', upTo: 'hv2-03' } },
    }),
  ]

  const draw = (graph: StructureGraph): string => renderToStaticMarkup(h(outline.Outline, { graph }))

  /**
   * THE GUARANTEE THE `carries` FOLD RESTS ON. The canvas does not draw the bundle until something
   * is selected; the reading layer prints every one of them, always, and does not know or care that
   * the canvas holds any back. If that ever stops being true the fold has become a deletion, and it
   * would become one silently — this is the test that would notice.
   */
  it('prints every `carries` line the canvas holds back, whether or not anything is selected', () => {
    const drawing = { at: 'pipeline' as const, recordId: 'p-s2r' }
    const graph = build({ scope: drawing })
    const held = graph.edges.filter((edge) => edge.drawn === 'on-selection')
    expect(held.length).toBe(10)
    const html = draw(graph)
    // The word on every one of those lines, printed once per end, so ten lines is twenty mentions.
    expect((html.match(/carries/g) ?? []).length).toBeGreaterThanOrEqual(held.length)
    // And the far ends by name: the module a held-back line reaches is in the text of the layer.
    expect(html).toContain('Digital twin')
    expect(html).toContain('EGM bridge')
  })

  it('prints how far a partial gate lets you go, on both sides of the wall', () => {
    const html = draw(build({ scope, links: wallLinks }))
    expect(html).toContain('You may go this far')
    expect(html).toContain('and no further')
    expect(html).toContain('Detect the hand')
    expect(html).toContain('Servo in')
  })

  it('prints the gate in the shared contract’s words, not its own, naming the step on the wall and not its id', () => {
    const html = draw(build({ scope, links: wallLinks }))
    // THE WALL'S WORDS ONLY. The line from the problem to the pipeline prints the same gate's words from another call
    // in model.ts, which round 83 left to its owner. The gate mark beside the words draws a stage that is not shaped
    // like a record id as it is written, and this file's step ids are not, so the mark draws hv2-03 where the page
    // draws the title of a real step's block.
    const words = html.match(/<span class="gx-wall-words">([^<]*)<\/span>/)?.[1]
    expect(words).toBe(gateLabel({ kind: 'partial', upTo: '03 Plan the approach' }))
    expect(words).not.toContain('hv2-03')
  })

  it('sets mixed script beside English without uppercasing or truncating it', () => {
    const html = draw(build({ scope }))
    expect(html).toContain('夹具标定')
    expect(html).toContain('重印 v3 #4')
  })

  it('says a module has no state word rather than working one out of its checklist', () => {
    const html = draw(build())
    // On every row as a mark, and ONCE in words. The sentence used to be printed beside every mark,
    // which at 390px was three lines of the same words on each row and pushed the record's own title
    // off the first screen.
    expect(html).toContain('No state field')
    expect(html).toContain(en['g7b.Outline.that_is_an_answer_rather_than_a'])
    expect(html.split(en['g7b.Outline.that_is_an_answer_rather_than_a']).length - 1).toBe(1)
  })

  it('says plainly when a `blocks` link is unqualified, so it can never read as a hard gate', () => {
    const html = draw(
      build({
        links: [link({ linkId: 'L1', fromId: 'm-twin', toId: 'm-egm', type: 'blocks', gate: { at: 'unstated' } })],
      }),
    )
    expect(html).toContain(en['g7b.Outline.nobody_has_said_how_much_this_blocks'])
    expect(html).toContain(`<span class="gx-edge-note">${en['g7b.Outline.nobody_has_said_how_much_this_blocks']}</span>`)
  })

  it('prints every node, so nothing on the canvas is missing from the phone', () => {
    const graph = build({ scope, links: wallLinks })
    const html = draw(graph)
    for (const node of graph.nodes) expect(html).toContain(node.title)
  })
})

// ============================================================================ canonical vs derived

