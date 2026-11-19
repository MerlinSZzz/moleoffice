// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * The pipeline drawing: what it reads, what it refuses to guess, and what shape it draws.
 *
 * WHY THEY LOOK LIKE THIS. The test runner's environment is `node` — there is no DOM and no jsdom,
 * and adding one would mean a dependency this project has ruled out. So the components are rendered
 * to static markup with react-dom/server and the result is read as text, exactly as tests/ui.test.ts
 * and tests/module-page.test.ts do.
 *
 * WHAT MATTERS MOST HERE AND CANNOT BE SEEN ON A SCREENSHOT:
 *
 *   1. THE THREE-WAY DISTINCTIONS. `modules: []` is "nobody owns this yet"; a missing `modules` key
 *      is an unfilled required field. `needs: []` is "recorded as waiting on nothing"; a missing
 *      `needs` key is "nothing is recorded about what this waits on". A screenshot of a row cannot
 *      prove which of the pair produced it, and quietly collapsing either is the exact failure this
 *      product exists to remove.
 *
 *   2. THE LANE SWEEP. Two tracks that do not wait on each other have to come out as two lanes and
 *      rejoin into one, and a straight chain has to stay one lane wide. That is a graph property; the
 *      eye can confirm a picture is plausible but not that it is right.
 *
 *   3. THE MANY-TO-MANY MAPPING. One step with two modules, one module with three steps and a step
 *      with none are three different pictures, and the counted sentence has to say all three.
 *
 * THE FIXTURE IS THE REAL SEED. `HANDOVER` and `SIM2REAL` below are the steps of two pipelines this
 * repository actually ships, copied field for field from scripts/seed.ts. A drawing tested only
 * against invented data is a drawing tested against nothing.
 */

import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it } from 'vitest'
import type { AttentionRow } from '../src/shared/attention.ts'
import { localStamp } from '../src/shared/time.ts'
import type { BlockLinkRow } from '../src/shared/blocks.ts'
import type { PanelRecord } from '../src/shared/types.ts'
// Type only, so it is erased before this file runs and does not load the module before the window
// stand-in below is installed.
import type { FlowStep, StepAttention } from '../src/web/components/PipelineFlow.tsx'
import { englishWords } from '../src/shared/words/joined.ts'

type Flow = typeof import('../src/web/components/PipelineFlow.tsx')
type Page = typeof import('../src/web/pages/PipelinePage.tsx')
let flow: Flow
let page: Page

beforeAll(async () => {
  // src/web/api.ts reads window.localStorage at module scope to restore who you are acting as, and
  // both modules under test reach it through the component library. This is the smallest stand-in
  // that lets them load; nothing in it is under test.
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
  flow = await import('../src/web/components/PipelineFlow.tsx')
  page = await import('../src/web/pages/PipelinePage.tsx')
})

const render = (el: React.ReactElement): string => renderToStaticMarkup(el)

/** Static markup carries HTML entities; the sentences under test are compared as plain text. */
const text = (html: string): string =>
  html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')

function record(id: string, title: string, data: Record<string, unknown>): PanelRecord {
  return {
    id,
    kind: 'pipeline',
    title,
    summary: null,
    data,
    createdAt: '2026-08-01 09:00:00',
    updatedAt: '2026-08-08 09:00:00',
    deletedAt: null,
  } as unknown as PanelRecord
}

/**
 * The authoring shape this file writes its fixtures in, and what turns one into what a pipeline is.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE FIXTURES STAYED IN THE OLD SHAPE AND ONE FUNCTION CONVERTS THEM
 * ---------------------------------------------------------------------------------------
 *
 * A pipeline is a record with an ordered list of block RECORD IDS, and what each block waits on and
 * which modules carry it are stored LINKS. Written out that way, a nine-step fixture is a pipeline
 * record, nine block records and twenty links — three hundred lines of setup for a test about a
 * drawing. So the fixtures below are still the readable literal, and `asPipeline` builds the real
 * records and the real links from it.
 *
 * IT IS A FIXTURE BUILDER, NOT A SECOND MODEL. Nothing stores `StepFixture`, no source file imports
 * it, and the thing under test is handed exactly what the server would have given it.
 */
interface StepFixture {
  id: string
  name: string
  state: string
  modules?: string[]
  measured?: string
  needs?: { stepId: string; gate: 'hard' | 'partial'; upTo?: string }[]
}

interface BuiltPipeline {
  pipeline: PanelRecord
  records: PanelRecord[]
  links: BlockLinkRow[]
}

/** Turn the readable literal into the pipeline record, its block records and its links. */
function asPipeline(steps: readonly StepFixture[], id = 'p1', title = 'Test'): BuiltPipeline {
  const blocks: PanelRecord[] = steps.map((step) => ({
    id: step.id,
    kind: 'block',
    title: `${title} \u203a ${step.name}`,
    summary: null,
    data: {
      state: step.state,
      ...(step.measured === undefined ? {} : { measured: step.measured }),
    },
    createdAt: '2026-08-01 09:00:00',
    updatedAt: '2026-08-08 09:00:00',
    deletedAt: null,
  })) as unknown as PanelRecord[]

  const moduleTitles = [...new Set(steps.flatMap((step) => step.modules ?? []))]
  const modules: PanelRecord[] = moduleTitles.map((moduleTitle) => ({
    id: `mod:${moduleTitle}`,
    kind: 'module',
    title: moduleTitle,
    summary: null,
    data: {},
    createdAt: '2026-08-01 09:00:00',
    updatedAt: '2026-08-08 09:00:00',
    deletedAt: null,
  })) as unknown as PanelRecord[]

  const links: BlockLinkRow[] = []
  let n = 0
  for (const step of steps) {
    for (const moduleTitle of step.modules ?? []) {
      links.push({ id: `l${++n}`, fromId: `mod:${moduleTitle}`, toId: step.id, type: 'implements', gate: null, upTo: null, inferred: false })
    }
    for (const need of step.needs ?? []) {
      links.push({ id: `l${++n}`, fromId: need.stepId, toId: step.id, type: 'blocks', gate: need.gate, upTo: need.upTo ?? null, inferred: false })
    }
  }

  const pipeline = record(id, title, { blockIds: steps.map((step) => step.id) })
  return { pipeline, records: [pipeline, ...blocks, ...modules], links }
}

/** `readPipeline` over a fixture, which is what almost every test below wants. */
function readingOf(steps: readonly StepFixture[], id = 'p1', title = 'Test') {
  const built = asPipeline(steps, id, title)
  return flow.readPipeline(built.pipeline, built.records, built.links)
}

// --------------------------------------------------------------------------- the real seed data

/** Transplant v2, exactly as scripts/seed.ts files it. Nine steps, two partial gates, one rejoin. */
const HANDOVER: StepFixture[] = [
  {
    id: 'hv2-01',
    name: 'Sense the pot',
    state: 'done',
    modules: ['LeafCam 2 overhead camera', 'Close-up camera'],
    measured: 'p50 42 ms · p95 61 ms · n=400',
  },
  { id: 'hv2-02', name: 'Track the hand of the person', state: 'done', modules: ['LeafCam 2 overhead camera'], needs: [{ stepId: 'hv2-01', gate: 'hard' }] },
  {
    id: 'hv2-03',
    name: 'Predict the release instant',
    state: 'done',
    modules: ['LeafCam 2 overhead camera', 'Transplant release detector'],
    needs: [{ stepId: 'hv2-02', gate: 'hard' }],
  },
  { id: 'hv2-04', name: 'Plan the approach', state: 'blocked', modules: ['Recipe planner bridge'], needs: [{ stepId: 'hv2-03', gate: 'hard' }] },
  {
    id: 'hv2-05',
    name: 'Drive the jaws to the closing pose',
    state: 'doing',
    modules: ['补光灯功率闭环', 'Recipe planner bridge'],
    needs: [{ stepId: 'hv2-04', gate: 'partial', upTo: 'servo tuning against the mock arm' }],
  },
  {
    id: 'hv2-06',
    name: 'Close and hold',
    state: 'doing',
    modules: ['Tray clamp', '夹具标定'],
    needs: [{ stepId: 'hv2-05', gate: 'partial', upTo: 'bench closes with the jig, no arm' }],
  },
  { id: 'hv2-07', name: 'Sense the pull', state: 'failed', modules: ['SoilPen Mini 湿度读取'], needs: [{ stepId: 'hv2-06', gate: 'hard' }] },
  {
    id: 'hv2-08',
    name: 'Decide to let go',
    state: 'todo',
    modules: [],
    needs: [
      { stepId: 'hv2-03', gate: 'hard' },
      { stepId: 'hv2-07', gate: 'hard' },
    ],
  },
  { id: 'hv2-09', name: 'Pull back without knocking the person', state: 'todo', modules: [], needs: [{ stepId: 'hv2-08', gate: 'hard' }] },
]

/**
 * The branch. Steps 04-06 run in simulation and 07-09 on the real arm; NEITHER waits on the other,
 * both wait on 03, and 10 needs both. Trimmed to the ten steps that carry the shape.
 */
const SIM2REAL: StepFixture[] = [
  { id: 's2r-01', name: 'Pick 200 reach targets over the bench volume', state: 'done', modules: ['Potting rig growth model (GrowLab)'] },
  { id: 's2r-02', name: 'Agree one joint-order convention', state: 'done', modules: ['补光灯功率闭环', 'Potting rig growth model (GrowLab)'], needs: [{ stepId: 's2r-01', gate: 'hard' }] },
  { id: 's2r-03', name: 'Freeze the recipe file both sides load', state: 'done', modules: ['Potting rig growth model (GrowLab)'], needs: [{ stepId: 's2r-02', gate: 'hard' }] },
  { id: 's2r-04', name: 'Run the targets headless in GrowLab', state: 'done', modules: ['Potting rig growth model (GrowLab)'], needs: [{ stepId: 's2r-03', gate: 'hard' }] },
  { id: 's2r-05', name: 'Record simulated jaw poses', state: 'done', modules: ['Potting rig growth model (GrowLab)'], needs: [{ stepId: 's2r-04', gate: 'hard' }] },
  { id: 's2r-06', name: 'Check the growth curve: model pose against controller pose', state: 'done', modules: ['Potting rig growth model (GrowLab)'], needs: [{ stepId: 's2r-05', gate: 'hard' }] },
  {
    id: 's2r-07',
    name: 'Run the same targets on the real bench',
    state: 'doing',
    modules: ['补光灯功率闭环', 'Recipe planner bridge'],
    needs: [{ stepId: 's2r-03', gate: 'partial', upTo: 'kinematics checked in simulation' }],
  },
  { id: 's2r-08', name: 'Measure the real poses against the overhead reference card', state: 'doing', modules: ['LeafCam 2 overhead camera'], needs: [{ stepId: 's2r-07', gate: 'partial', upTo: 'the 84 targets already run' }] },
  { id: 's2r-09', name: 'Log the LDC axis readings alongside', state: 'done', modules: ['补光灯功率闭环'], needs: [{ stepId: 's2r-07', gate: 'hard' }] },
  {
    id: 's2r-10',
    name: 'Compare model against bench, target by target',
    state: 'blocked',
    modules: ['Potting rig growth model (GrowLab)'],
    needs: [
      { stepId: 's2r-06', gate: 'hard' },
      { stepId: 's2r-08', gate: 'hard' },
      { stepId: 's2r-09', gate: 'hard' },
    ],
  },
]

const readSteps = (steps: readonly StepFixture[]) => readingOf(steps).steps

// ============================================================================ reading a record

describe('readPipeline keeps a gap and an answer apart', () => {
  it('reads no module and no dependency as "nothing is recorded", never as "there is none"', () => {
    // THE DISTINCTION THAT COULD NOT SURVIVE, AND THE HALF THAT DID. `modules: []` and a missing
    // `modules` used to be two different answers, and so did `needs: []` and a missing `needs`.
    // Both are links now, and a link is a row: it exists or it does not. So the reader gives ONE
    // answer, and it is the weaker, honest one — nothing is RECORDED — which the page prints as
    // that rather than as "it waits on nothing".
    const steps = readSteps([{ id: 'a', name: 'Nobody has said', state: 'todo' }])
    expect(steps[0]?.modules).toEqual([])
    expect(steps[0]?.needs).toEqual([])
  })

  it('says why a pipeline with no `blockIds` cannot be drawn, rather than drawing an empty one', () => {
    const reading = flow.readPipeline(record('p2', 'Placeholder', {}), [], [])
    expect(reading.steps).toHaveLength(0)
    expect(reading.problem).toBe('The pipeline has not listed its steps yet.')
    expect(reading.problem).not.toContain('blockIds')
  })

  it('distinguishes a stored empty list from a missing one', () => {
    const empty = record('p3', 'Empty', { blockIds: [] })
    expect(flow.readPipeline(empty, [empty], []).problem).toBeNull()
  })

  it('keeps the readable blocks when one cannot be read, and names the one that could not', () => {
    const reading = readingOf(
      [
        { id: 'a', name: 'Fine', state: 'done' },
        { id: 'b', name: 'Bad state', state: 'melted' },
        { id: 'c', name: 'Also fine', state: 'todo' },
      ],
      'p4',
      'Mixed',
    )
    expect(reading.steps.map((s) => s.id)).toEqual(['a', 'c'])
    expect(reading.storedSteps).toBe(3)
    expect(reading.stepProblems).toHaveLength(1)
    expect(reading.stepProblems[0]?.at).toBe(2)
    expect(reading.stepProblems[0]?.problem).toContain('"melted"')
  })

  it('reports an id the order names that nothing holds, rather than shortening the list', () => {
    const built = asPipeline([{ id: 'a', name: 'Fine', state: 'done' }], 'p5', 'Holed')
    built.pipeline.data['blockIds'] = ['a', 'gone']
    const reading = flow.readPipeline(built.pipeline, built.records, built.links)
    expect(reading.steps.map((s) => s.id)).toEqual(['a'])
    expect(reading.storedSteps).toBe(2)
    expect(reading.stepProblems[0]?.problem).toContain('no record has that id')
  })

  it('reads an unqualified dependency as one, rather than as a hard gate', () => {
    // NULL IS NOT `hard`. A `blocks` link may say only that one block blocks another, and reading
    // that as hard would make work that is mostly doable look completely stuck.
    const built = asPipeline([
      { id: 'a', name: 'first', state: 'done' },
      { id: 'b', name: 'second', state: 'todo' },
    ])
    built.links.push({ id: 'lx', fromId: 'a', toId: 'b', type: 'blocks', gate: null, upTo: null, inferred: false })
    const steps = flow.readPipeline(built.pipeline, built.records, built.links).steps
    expect(steps[1]?.needs).toEqual([{ blockId: 'a', gate: null, linkId: 'lx' }])
  })
})

// ============================================================================ the mapping

describe('the many-to-many mapping is counted, not assumed', () => {
  const facts = () => flow.mappingFacts(readSteps(HANDOVER))

  it('counts every (step, module) pair, which one module per step could not produce', () => {
    // Eleven pairings across nine steps: two steps carry two modules each, two carry none.
    expect(facts().pairings).toBe(11)
    expect(facts().lanes).toHaveLength(8)
  })

  it('names the busiest module and how many steps it carries', () => {
    expect(facts().busiest?.title).toBe('LeafCam 2 overhead camera')
    expect(facts().busiest?.steps).toEqual([0, 1, 2])
  })

  it('counts the blocks no module is recorded as carrying, in one count rather than two', () => {
    // TWO COUNTS BECAME ONE, and that is the change rather than a simplification: `modules: []` and
    // a missing `modules` were two answers, and an `implements` link is one row that either exists
    // or does not. The sentence says the one thing that is still true of both.
    const mixed = flow.mappingFacts(
      readSteps([
        { id: 'a', name: 'a', state: 'todo', modules: [] },
        { id: 'b', name: 'b', state: 'todo' },
        { id: 'c', name: 'c', state: 'todo', modules: ['Tray clamp'] },
      ]),
    )
    expect(mixed.stepsWithNone).toBe(2)
    // "2 steps have no module recorded as carrying THEM" — the pronoun follows the count. This
    // project has already shipped one "1 change rows".
    expect(mixed.sentence).toContain('2 steps have no module recorded as carrying them')
  })

  it('writes one sentence that carries the same facts as the grid', () => {
    const sentence = facts().sentence
    expect(sentence).toContain('11 pairings between 9 steps and 8 modules')
    expect(sentence).toContain('4 steps are carried by more than one module')
    expect(sentence).toContain('the busiest module, LeafCam 2 overhead camera, carries 3 steps')
    expect(sentence).toContain('2 steps have no module recorded as carrying them')
  })

  it('gets its plurals right, which is a defect class this project already tracks', () => {
    const one = flow.mappingFacts(readSteps([{ id: 'a', name: 'a', state: 'todo', modules: ['M'] }]))
    expect(one.sentence).toBe('1 pairing between 1 step and 1 module.')
    expect(flow.plural(1, 'step', 'steps')).toBe('1 step')
    expect(flow.plural(0, 'step', 'steps')).toBe('0 steps')
  })

  it('counts a module named twice on one step once, because it is one pairing', () => {
    const twice = flow.mappingFacts(readSteps([{ id: 'a', name: 'a', state: 'todo', modules: ['M', 'M'] }]))
    expect(twice.pairings).toBe(1)
    expect(twice.lanes[0]?.steps).toEqual([0])
  })
})

// ============================================================================ what holds a step

describe('what is holding a step', () => {
  const byId = (steps: readonly FlowStep[]) => new Map(steps.map((step, index) => [step.id, { index, step }]))

  it('reads a partial gate as an open stretch and a wall, not as blocked', () => {
    const steps = readSteps(HANDOVER)
    const step = steps[4]
    expect(step).toBeDefined()
    const hold = flow.holdOn(step!, byId(steps))
    expect(hold.kind).toBe('partial')
    if (hold.kind !== 'partial') throw new Error('unreachable')
    expect(hold.standing[0]?.need.upTo).toBe('servo tuning against the mock arm')
  })

  it('lets a hard gate beat a partial one, because the open stretch does not exist', () => {
    const steps = readSteps([
      { id: 'a', name: 'a', state: 'blocked', modules: [] },
      { id: 'b', name: 'b', state: 'doing', modules: [] },
      {
        id: 'c',
        name: 'c',
        state: 'todo',
        modules: [],
        needs: [
          { stepId: 'a', gate: 'partial', upTo: 'the bench half' },
          { stepId: 'b', gate: 'hard' },
        ],
      },
    ])
    const hold = flow.holdOn(steps[2]!, byId(steps))
    expect(hold.kind).toBe('hard')
  })

  it('reads a gate as cleared when the step it names is stored as done', () => {
    const steps = readSteps([
      { id: 'a', name: 'a', state: 'done', modules: [] },
      { id: 'b', name: 'b', state: 'todo', modules: [], needs: [{ stepId: 'a', gate: 'hard' }] },
    ])
    const hold = flow.holdOn(steps[1]!, byId(steps))
    expect(hold.kind).toBe('clear')
  })

  it('cannot be given a dependency on an id nothing holds, because a link has two real ends', () => {
    // THE DEFECT THIS REPLACED. A `needs` was a string inside a JSON array and nothing checked it,
    // so a step could wait on an id nothing anywhere held; the drawing reported it as a broken
    // reference and drew no line. `links.from_id` and `to_id` are foreign keys to `records.id`, so
    // the row cannot exist — the reference is checked by the database rather than by a reader.
    const built = asPipeline([{ id: 'a', name: 'a', state: 'todo' }])
    built.links.push({ id: 'lg', fromId: 'ghost', toId: 'a', type: 'blocks', gate: 'hard', upTo: null, inferred: false })
    const steps = flow.readPipeline(built.pipeline, built.records, built.links).steps
    // The reader ignores it too, because it is not a dependency between two blocks of this
    // pipeline. A `blocks` link from something else — a problem, say — is drawn as an attachment on
    // the block, which is where it belongs and where it is read.
    expect(steps[0]?.needs).toEqual([])
    expect(flow.holdOn(steps[0]!, byId(steps)).kind).toBe('none-recorded')
  })

  it('says the two "no dependency" answers differently', () => {
    const steps = readSteps([
      { id: 'a', name: 'a', state: 'todo', modules: [] },
      { id: 'b', name: 'b', state: 'todo', modules: [], needs: [] },
    ])
    // ONE ANSWER WHERE THERE WERE TWO. `needs: []` said "recorded as waiting on nothing" and a
    // missing `needs` said "nobody has written it down"; a dependency is a stored link now, and a
    // link exists or it does not, so both are the honest half: nothing is recorded.
    expect(flow.holdOn(steps[0]!, byId(steps)).kind).toBe('none-recorded')
    expect(flow.holdOn(steps[1]!, byId(steps)).kind).toBe('none-recorded')
  })
})

describe('the counted sentence about dependencies', () => {
  it('counts the gates and says what is held right now', () => {
    const steps = readSteps(HANDOVER)
    const byId = new Map(steps.map((step, index) => [step.id, { index, step }]))
    const facts = flow.dependencyFacts(steps, steps.map((step) => flow.holdOn(step, byId)))
    expect(facts.edges).toBe(9)
    expect(facts.hard).toBe(7)
    expect(facts.partial).toBe(2)
    expect(facts.sentence).toContain('9 dependencies between these 9 steps: 7 hard and 2 partial')
    expect(facts.sentence).toContain('may go only as far as a named stage')
    expect(facts.sentence).toContain('not the same as waiting on nothing')
  })

  it('does not claim a pipeline waits on nothing when nothing has been written down', () => {
    const steps = readSteps([{ id: 'a', name: 'a', state: 'todo', modules: [] }])
    const facts = flow.dependencyFacts(steps, [{ kind: 'none-recorded' }])
    expect(facts.sentence).toContain('Nothing is recorded about what waits on what')
  })
})

// ============================================================================ the lane sweep

describe('the dependency gutter draws the real graph', () => {
  it('keeps a straight chain one lane wide', () => {
    const steps = readSteps([
      { id: 'a', name: 'a', state: 'done', modules: [] },
      { id: 'b', name: 'b', state: 'done', modules: [], needs: [{ stepId: 'a', gate: 'hard' }] },
      { id: 'c', name: 'c', state: 'todo', modules: [], needs: [{ stepId: 'b', gate: 'hard' }] },
    ])
    const layout = flow.layoutFlow(steps)
    expect(layout.lanes).toBe(1)
    expect(layout.rows.map((r) => r.nodeLane)).toEqual([0, 0, 0])
  })

  it('opens a second lane for two tracks that do not wait on each other, and closes it at the rejoin', () => {
    const steps = readSteps(SIM2REAL)
    const layout = flow.layoutFlow(steps)
    // 04 and 07 both hang off 03 and neither waits on the other, so the drawing has to be at least
    // two tracks wide. If this ever comes back 1 the branch has been flattened into a line.
    expect(layout.lanes).toBeGreaterThan(1)
    // Every dependency the record holds is placed. None is silently dropped.
    expect(layout.edges).toHaveLength(11)
    expect(layout.edges.every((edge) => edge.lane >= 0)).toBe(true)
    // The comparison step rejoins three lines, so its row has three incoming ends.
    const rejoin = layout.rows[9]
    expect(rejoin?.segments.filter((s) => s.kind === 'enter')).toHaveLength(3)
  })

  it('puts the gate mark on the row that waits, and nowhere else', () => {
    const steps = readSteps(HANDOVER)
    const layout = flow.layoutFlow(steps)
    for (const row of layout.rows) {
      for (const segment of row.segments) {
        if (segment.gate === null) continue
        expect(layout.edges[segment.edge]?.to).toBe(row.index)
      }
    }
    // Step 05 waits on 04 through a partial gate, so its row carries a partial mark.
    const marks = layout.rows[4]?.segments.filter((s) => s.gate !== null) ?? []
    expect(marks.map((m) => m.gate)).toEqual(['partial'])
  })

  it('marks an edge as cleared when the step it comes from is done', () => {
    const steps = readSteps(HANDOVER)
    const layout = flow.layoutFlow(steps)
    const from03 = layout.edges.filter((edge) => edge.from === 2)
    expect(from03.length).toBeGreaterThan(0)
    expect(from03.every((edge) => edge.cleared)).toBe(true)
    expect(layout.edges.filter((edge) => edge.from === 6).every((edge) => edge.cleared)).toBe(false)
  })

  it('still reports a dependency it cannot place, rather than drawing a line to nowhere', () => {
    // A `blocks` link between two REAL blocks of two DIFFERENT pipelines is the case that survives:
    // both ends exist, so the database takes the row, and this drawing has a node for only one of
    // them. It is reported rather than drawn as no line at all.
    const built = asPipeline([
      { id: 'a', name: 'a', state: 'todo' },
      { id: 'b', name: 'b', state: 'todo' },
    ])
    const steps = flow.readPipeline(built.pipeline, built.records, built.links).steps
    steps[1]!.needs.push({ blockId: 'elsewhere', gate: 'hard', linkId: 'lx' })
    const layout = flow.layoutFlow(steps)
    expect(layout.edges).toHaveLength(0)
    expect(layout.brokenRefs).toEqual([{ at: 1, stepId: 'elsewhere' }])
  })

  it('never places two edges in one lane over the same rows', () => {
    for (const fixture of [HANDOVER, SIM2REAL]) {
      const layout = flow.layoutFlow(readSteps(fixture))
      for (const a of layout.edges) {
        for (const b of layout.edges) {
          if (a === b || a.lane !== b.lane) continue
          // Two edges may share a lane only if one ends exactly where the other begins, which is
          // what a line running through a node looks like.
          const overlap = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
          expect(overlap).toBeLessThanOrEqual(0)
        }
      }
    }
  })
})

// ============================================================================ what it draws

describe('the drawing says what it cannot know', () => {
  const draw = (steps: readonly StepFixture[], title = 'Transplant v2') =>
    text(
      render(
        h(flow.PipelineFlow, { reading: readingOf(steps, 'p', title), now: Date.parse('2026-08-09T10:00:00') }),
      ),
    )

  it('draws the partial gate as a wall with the author’s own words in front of it', () => {
    const html = draw(HANDOVER)
    expect(html).toContain('you may go this far')
    expect(html).toContain('servo tuning against the mock arm')
    expect(html).toContain('and no further')
    expect(html).toContain('until 04 Plan the approach finishes')
  })

  it('draws a hard gate as a wall with no open stretch at all', () => {
    const html = draw([
      { id: 'a', name: 'Blocked thing', state: 'blocked', modules: [] },
      { id: 'b', name: 'Waiting thing', state: 'todo', modules: [], needs: [{ stepId: 'a', gate: 'hard' }] },
    ])
    expect(html).toContain('nothing here can start')
    expect(html).toContain('until 01 Blocked thing finishes')
    expect(html).not.toContain('you may go this far')
  })

  it('uses the shared gateLabel wording, so the drawing and the record page cannot disagree', () => {
    const html = draw(HANDOVER)
    expect(html).toContain('only as far as servo tuning against the mock arm until this finishes')
    expect(html).toContain('must finish first')
  })

  it('says a block nobody carries is an answer, and never calls it missing', () => {
    const html = draw(HANDOVER)
    expect(html).toContain('—')
    expect(html).not.toContain('nobody owns it yet')
  })

  it('never claims a block waits on nothing when no dependency is recorded', () => {
    // THE HALF OF THE OLD DISTINCTION THAT SURVIVED. `needs: []` and a missing `needs` used to be
    // two answers; a link exists or it does not, so there is one — and it is the weaker one, which
    // is the only one the data still supports.
    const html = draw(HANDOVER)
    expect(html).toContain('Dependencies have not been recorded.')
    expect(html).toContain('This does not establish that the step can run independently.')
  })

  it('explains a step stored as blocked that nothing it waits on is holding', () => {
    // Transplant v2 step 04 is exactly this: stored `blocked`, and the one step it waits on is done.
    // What blocks it is a `blocks` link, and a link points at the pipeline and cannot name a step.
    // Without this sentence the row reads as a contradiction and the drawing reads as wrong.
    const html = draw(HANDOVER)
    expect(html).toContain('Its own state word says blocked , and nothing it waits on is holding it')
    expect(html).not.toContain('`blocks`')
  })

  it('does not print that explanation on a step something really is holding', () => {
    const html = draw([
      { id: 'a', name: 'Upstream', state: 'doing', modules: [] },
      { id: 'b', name: 'Downstream', state: 'blocked', modules: [], needs: [{ stepId: 'a', gate: 'hard' }] },
    ])
    expect(html).not.toContain('nothing it waits on is holding it')
  })

  it('refuses to draw a wall over a step that is already done, and names the contradiction', () => {
    // Step 09 of the sim-to-real check is stored `done` while 07, which it waits on through a HARD
    // gate, is still `doing`. A wall there would print "nothing here can start" over finished work.
    const html = draw(SIM2REAL, 'Model-to-bench growth check')
    expect(html).toContain(
      'This step is stored as done , and 07 Run the same targets on the real bench — which it waits on — has not finished',
    )
    expect(html).toContain('Both cannot be true')
    expect(html).toContain('Mole Office does not choose between them, so no wall is drawn here')
  })

  it('says a step is under way while something is meant to stop it completely', () => {
    const html = draw([
      { id: 'a', name: 'Upstream', state: 'doing', modules: [] },
      { id: 'b', name: 'Downstream', state: 'doing', modules: [], needs: [{ stepId: 'a', gate: 'hard' }] },
    ])
    expect(html).toContain('Work on this step is recorded as under way')
    expect(html).toContain('recorded as stopping it completely')
  })

  it('does not call a failed step behind a standing gate a contradiction — somebody tried it', () => {
    const html = draw([
      { id: 'a', name: 'Upstream', state: 'doing', modules: [] },
      { id: 'b', name: 'Tried anyway', state: 'failed', modules: [], needs: [{ stepId: 'a', gate: 'hard' }] },
    ])
    expect(html).not.toContain('Both cannot be true')
    expect(html).toContain('nothing here can start')
  })

  it('says out loud that the row order is not a dependency', () => {
    expect(draw(HANDOVER)).toContain('the order the work is read in, and nothing else')
  })

  it('words the lane footer so it cannot be read as a module’s own condition', () => {
    expect(draw(HANDOVER)).toContain('They say nothing about a module’s own condition')
  })

  it('prints the legend rather than hiding it behind a hover a phone does not have', () => {
    const html = draw(HANDOVER)
    expect(html).toContain('How to read the lines on the left')
    expect(html).toContain('A solid bar across a line is a hard gate')
    expect(html).toContain('A bar with a gap in it is a partial gate')
    expect(html).toContain('not a measurement')
  })

  it('names every module in the roster, so a truncated lane header loses nothing', () => {
    const html = draw(HANDOVER)
    for (const title of ['LeafCam 2 overhead camera', 'SoilPen Mini 湿度读取', '夹具标定', '补光灯功率闭环']) {
      expect(html).toContain(title)
    }
  })

  it('draws one lane cell per module for every step, so the columns are a real matrix', () => {
    const html = render(h(flow.PipelineFlow, { reading: readingOf(HANDOVER, 'p', 'Transplant v2'), now: 0 }))
    // 8 modules x 7 steps that name at least one module. The two steps nobody carries draw a band
    // across the lanes instead, which is the row that must not look like eight empty cells.
    expect(html.match(/class="pf-cell"/g)).toHaveLength(8 * 7)
    expect(html.match(/class="pf-band"/g)).toHaveLength(2)
  })

  it('draws the honest empty case rather than an empty grid', () => {
    const html = text(render(h(flow.PipelineFlow, { reading: flow.readPipeline(record('p', 'Placeholder', {}), [], []), now: 0 })))
    expect(html).toContain('The pipeline has not listed its steps yet.')
    expect(html).not.toContain(englishWords()['g7b.PipelineFlow.who_carries_what_the_columns_above_read'])
  })

  it('shows the server’s own reason on a step the server put on the attention list', () => {
    // THE ROW IS AN ORDINARY RECORD ROW NOW. A block is a record, so the server sends `shape:
    // 'record'`, `recordId` is the BLOCK's id, and the stamp its age is measured from is the
    // block's own rather than its pipeline's.
    const row: AttentionRow = {
      key: 'rec:hv2-07',
      shape: 'record',
      recordId: 'hv2-07',
      recordKind: 'block',
      origin: 'authored',
      partId: null,
      itemId: null,
      title: 'Transplant v2 \u203a Sense the pull',
      state: 'failed',
      progress: 'stopped_short',
      group: 'stopped:block',
      score: 15,
      safety: false,
      displacedBy: null,
      reason: {
        selectedBy: 'stopped_short',
        owed: null,
        stoppedShort: { state: 'failed', since: '2026-08-02 11:00:00', sinceSource: 'record-updated' },
        consequence: null,
        safetyFloor: false,
        because: 'Its state word is "failed", which says the work began and did not finish.',
        coded: [{ code: 'stoppedShort', values: { state: 'failed' } }],
        factors: [{ name: 'harm', points: 0, why: 'nobody has recorded who is hurt if this is left alone' }],
      },
    }
    const html = text(
      render(
        h(flow.PipelineFlow, {
          reading: readingOf(HANDOVER, 'p', 'Transplant v2'),
          attention: new Map([['hv2-07', { row, where: 'visible' as const }]]),
          now: Date.parse('2026-08-09T10:00:00'),
        }),
      ),
    )
    expect(html).toContain('This step is on the first screen of the attention list')
    expect(html).toContain('Its state word is "failed"')
    expect(html).toContain('nobody has recorded who is hurt if this is left alone')
  })
})

// ============================================================================ the page's index

describe('the index says why each pipeline is where it is', () => {
  const reading = (id: string, title: string, steps: readonly StepFixture[]) => readingOf(steps, id, title)

  const attentionRow = (recordId: string, itemId: string, over: Partial<AttentionRow> = {}): AttentionRow =>
    ({
      // A BLOCK ROW IS AN ORDINARY RECORD ROW: `recordId` is the block's own id, and the pipeline
      // is found from the order it is in rather than from the row.
      key: `rec:${itemId}`,
      shape: 'record',
      recordId: itemId,
      recordKind: 'block',
      partId: null,
      itemId: null,
      title: itemId,
      state: 'failed',
      progress: 'stopped_short',
      group: 'stopped:step',
      score: 10,
      safety: false,
      displacedBy: null,
      reason: {
        selectedBy: 'stopped_short',
        owed: null,
        stoppedShort: { state: 'failed', since: null, sinceSource: 'none' },
        consequence: null,
        safetyFloor: false,
        because: 'because',
        factors: [{ name: 'harm', points: 0, why: 'none recorded' }],
      },
      ...over,
    }) as AttentionRow

  it('puts a pipeline with a safety step above one that scores higher', () => {
    const a = reading('a', 'Ordinary', [{ id: 'x', name: 'x', state: 'failed', modules: [] }])
    const b = reading('b', 'Dangerous', [{ id: 'y', name: 'y', state: 'failed', modules: [] }])
    // ONE MAP, KEYED BY BLOCK RECORD ID. It used to be keyed by (pipeline id, step id), because a
    // step's identity was a pair that nothing anywhere declared as the key.
    const attention = new Map<string, StepAttention>([
      ['x', { row: attentionRow('a', 'x', { score: 90 }), where: 'visible' }],
      ['y', { row: attentionRow('b', 'y', { score: 5, safety: true }), where: 'visible' }],
    ])
    const ordered = page.orderPipelines([a, b], attention)
    expect(ordered.map((entry) => entry.reading.record.title)).toEqual(['Dangerous', 'Ordinary'])
    expect(ordered[0]?.why).toContain('sorts above everything that is not safety')
  })

  it('ranks by how many steps the server put on the list, then by the best score it gave one', () => {
    const a = reading('a', 'One row', [{ id: 'x', name: 'x', state: 'failed', modules: [] }])
    // BOTH STEPS FAILED, not one blocked. As question 18 decided, a blocked step no longer counts towards the order,
    // and this case is about the count.
    const b = reading('b', 'Two rows', [
      { id: 'y', name: 'y', state: 'failed', modules: [] },
      { id: 'z', name: 'z', state: 'failed', modules: [] },
    ])
    const attention = new Map<string, StepAttention>([
      ['x', { row: attentionRow('a', 'x', { score: 99 }), where: 'visible' }],
      ['y', { row: attentionRow('b', 'y', { score: 4 }), where: 'remainder' }],
      ['z', { row: attentionRow('b', 'z', { score: 3 }), where: 'remainder' }],
    ])
    const ordered = page.orderPipelines([a, b], attention)
    expect(ordered.map((entry) => entry.reading.record.title)).toEqual(['Two rows', 'One row'])
    expect(ordered[0]?.why).toContain('all of them held back into the remainder')
    expect(ordered[1]?.why).toContain('1 step is on the attention list, on the first screen of it')
  })

  it('counts a step held back into the remainder, because the same rule selected it', () => {
    const a = reading('a', 'Held back', [{ id: 'x', name: 'x', state: 'failed', modules: [] }])
    const ordered = page.orderPipelines(
      [a],
      new Map<string, StepAttention>([['x', { row: attentionRow('a', 'x'), where: 'remainder' }]]),
    )
    expect(ordered[0]?.onList).toBe(1)
    expect(ordered[0]?.onFirstScreen).toBe(0)
  })

  it('says why a pipeline with nothing on the list is where it is, rather than leaving it unexplained', () => {
    // CRITERION CHANGE: as question 18 decided, a blocked step does not put its pipeline first, so the two stay in the
    // order they were filed. The row still says the step
    // stopped short.
    const quiet = reading('q', 'Quiet', [{ id: 'x', name: 'x', state: 'done', modules: [] }])
    const stuck = reading('s', 'Stuck', [{ id: 'y', name: 'y', state: 'blocked', modules: [] }])
    const ordered = page.orderPipelines([quiet, stuck], new Map())
    expect(ordered.map((entry) => entry.reading.record.title)).toEqual(['Quiet', 'Stuck'])
    expect(ordered[1]?.why).toContain('1 step has stopped short')
    expect(ordered[0]?.why).toContain('Nothing in it has stopped short')
  })

  it('does not put a pipeline first for a blocked step, and still counts and names the step on its row', () => {
    // QUESTION 18 OF REPORT n9Mjk3c_sJRu, by a decision: a blocked line of work is not shown
    // first, as something for the person, until the record says who it waits on. No kind
    // stores that, so a blocked step on the attention list with the best score still does not lift its pipeline.
    const stuck = reading('s', 'Blocked, top score', [{ id: 'x', name: 'x', state: 'blocked', modules: [] }])
    const failed = reading('f', 'Failed, low score', [{ id: 'y', name: 'y', state: 'failed', modules: [] }])
    const attention = new Map<string, StepAttention>([
      ['x', { row: attentionRow('s', 'x', { score: 90, state: 'blocked' }), where: 'visible' }],
      ['y', { row: attentionRow('f', 'y', { score: 5 }), where: 'visible' }],
    ])
    const ordered = page.orderPipelines([stuck, failed], attention)
    expect(ordered.map((entry) => entry.reading.record.title)).toEqual(['Failed, low score', 'Blocked, top score'])
    // IT KEEPS SHOWING IN ITS OWN LIST: the blocked pipeline's row still counts its step on the list.
    const blocked = ordered[1]!
    expect(blocked.onList).toBe(1)
    expect(blocked.stopped).toBe(1)
    expect(blocked.why).toContain('1 step is on the attention list')
    expect(blocked.standingOn?.step.state).toBe('blocked')
  })

  it('still puts a blocked step with a safety consequence first, because safety is not about who it waits on', () => {
    const stuck = reading('s', 'Blocked and dangerous', [{ id: 'x', name: 'x', state: 'blocked', modules: [] }])
    const failed = reading('f', 'Failed', [{ id: 'y', name: 'y', state: 'failed', modules: [] }])
    const attention = new Map<string, StepAttention>([
      ['x', { row: attentionRow('s', 'x', { score: 1, safety: true, state: 'blocked' }), where: 'visible' }],
      ['y', { row: attentionRow('f', 'y', { score: 50 }), where: 'visible' }],
    ])
    expect(page.orderPipelines([failed, stuck], attention).map((entry) => entry.reading.record.title)).toEqual([
      'Blocked and dangerous',
      'Failed',
    ])
  })

  it('draws an old failure quietly and a safety row loudly, instead of tinting the whole list red', () => {
    // Seven of the nine pipelines on file hold a failed or a blocked step. Row's older reading gives
    // every one of them the full alarm tint, which is a list that has stopped ranking anything.
    const now = Date.parse('2026-08-09T10:00:00')
    const old = reading('o', 'Old failure', [{ id: 'x', name: 'x', state: 'failed', modules: [] }])
    const fresh = reading('f', 'Yesterday', [{ id: 'y', name: 'y', state: 'failed', modules: [] }])
    const danger = reading('d', 'Dangerous', [{ id: 'z', name: 'z', state: 'failed', modules: [] }])
    const sat = (days: number) => ({
      selectedBy: 'stopped_short' as const,
      owed: null,
      stoppedShort: {
        // `localStamp` and NOT `toISOString`. `since` is a stored Mole Office stamp, so the product
        // reads it as the operator's wall clock; `toISOString` writes the UTC calendar day, and
        // the two are a different date for part of every day away from offset zero. Written that
        // way, "Yesterday" was 2.4 days old under TZ=Pacific/Kiritimati (+14:00) and came back
        // `plain` instead of `raised` — the fixture disagreed with the code it was testing about
        // which day it was.
        state: 'failed',
        since: localStamp(new Date(now - days * 86_400_000)).slice(0, 10),
        sinceSource: 'record-updated' as const,
      },
      consequence: null,
      safetyFloor: false,
      because: 'because',
      coded: [{ code: 'stoppedShort' as const, values: { state: 'failed' } }],
      factors: [{ name: 'harm' as const, points: 0, why: 'none recorded' }],
    })
    const attention = new Map<string, StepAttention>([
      ['x', { row: { ...attentionRow('o', 'x'), reason: sat(30) }, where: 'remainder' }],
      ['y', { row: { ...attentionRow('f', 'y'), reason: sat(1) }, where: 'visible' }],
      ['z', { row: { ...attentionRow('d', 'z', { safety: true }), reason: sat(30) }, where: 'visible' }],
    ])
    const byTitle = new Map(page.orderPipelines([old, fresh, danger], attention, now).map((e) => [e.reading.record.title, e.alarm]))
    expect(byTitle.get('Old failure')).toBe('faded')
    expect(byTitle.get('Yesterday')).toBe('raised')
    expect(byTitle.get('Dangerous')).toBe('urgent')
  })

  it('draws a pipeline with nothing on the list quieter still, and an unreadable one louder', () => {
    const quiet = reading('q', 'Quiet', [{ id: 'x', name: 'x', state: 'done', modules: [] }])
    const stuck = reading('s', 'Stuck', [{ id: 'y', name: 'y', state: 'blocked', modules: [] }])
    const broken = flow.readPipeline(record('b', 'Placeholder', {}), [], [])
    const byTitle = new Map(page.orderPipelines([quiet, stuck, broken], new Map()).map((e) => [e.reading.record.title, e.alarm]))
    expect(byTitle.get('Quiet')).toBe('faded')
    expect(byTitle.get('Stuck')).toBe('plain')
    expect(byTitle.get('Placeholder')).toBe('raised')
  })

  it('keeps an unreadable pipeline in the list with the reason on its row', () => {
    const broken = flow.readPipeline(record('b', 'Placeholder', {}), [], [])
    const ordered = page.orderPipelines([broken], new Map())
    expect(ordered).toHaveLength(1)
    expect(ordered[0]?.why).toContain('cannot be drawn')
  })

  it('reads both halves of the attention reply, so a capped row is not lost from its own pipeline', () => {
    const visible = attentionRow('a', 'x')
    const held = attentionRow('a', 'y', { displacedBy: 'group-cap' })
    // A row that is not a block at all. It is a record row like the block rows are, so the filter
    // is on the KIND rather than on a shape that no longer exists.
    const other = { ...attentionRow('z', 'q'), recordKind: 'task' as const }
    const map = page.attentionByBlocks({
      visible: [visible],
      remainder: [held, other],
    } as unknown as Parameters<Page['attentionByBlocks']>[0])
    expect([...map.keys()]).toEqual(['x', 'y'])
    expect(map.has('q')).toBe(false)
  })
})

// ============================================================================ an id nothing holds

/**
 * WHAT THE PAGE SAYS WHEN IT COULD NOT DO WHAT THE ADDRESS ASKED FOR.
 *
 * `#/pipeline/<unknown-id>` draws the first pipeline in the order. That is a reasonable fallback and
 * it is not what these tests are about: the fallback is unchanged. What was wrong is that the
 * sentence saying the requested pipeline does not exist — and that nothing was substituted for it —
 * was rendered INSIDE the index's `Explain`, which is a collapsed `<details>`. So the page performed
 * exactly the substitution the folded sentence promised it had not, and the denial was one press
 * away. USER.md invariant 2.
 *
 * THE SAME SHAPE, FOUND AGAIN, ONE FOLD LOWER. A pipeline whose record cannot be read into steps
 * has a `problem` sentence, and the only place printing it was `PipelineFlow`'s own `pf-nothing` —
 * inside the grid `Explain`. So an unreadable pipeline drew a collapsed fold whose summary promised
 * a steps × modules grid, with the reason there is no grid one press away. Same defect, same fix:
 * what Mole Office could not do is said where it would otherwise have been silent.
 *
 * THE TESTS ARE ABOUT POSITION, NOT WORDING, and there are two positions worth distinguishing:
 *
 *   `unpressed`      — in front of EVERY fold. The right bar for a substitution notice, which has
 *                      to be met before the reader meets anything else.
 *   `defaultVisible` — everything a reader sees without pressing, which INCLUDES a `<summary>` and
 *                      excludes a `<details>` body. This is the honest measure of "on screen", and
 *                      it is the bar the page's own facts have to clear. `unpressed` would fail a
 *                      fact stated on a fold's summary, which is visible, so using it for those
 *                      would be measuring position rather than visibility.
 */
describe('the detail panel says what it could not do, without being pressed', () => {
  const two = () => [
    readingOf([{ id: 'x', name: 'Only step', state: 'todo', modules: [] }], 'a', 'First on file'),
    readingOf([{ id: 'y', name: 'Only step', state: 'todo', modules: [] }], 'b', 'Second on file'),
  ]
  const detail = (picked: string | null, readings = two()) =>
    render(
      h(page.PipelineDetail, {
        entries: page.orderPipelines(readings, new Map<string, StepAttention>()),
        picked,
        attention: new Map<string, StepAttention>(),
        onScope: () => {},
      }),
    )
  /** Everything drawn before the first disclosure on the panel. */
  const unpressed = (html: string): string => {
    const fold = html.indexOf('<details')
    expect(fold, 'the panel draws no fold at all, so this test is no longer measuring anything').toBeGreaterThan(-1)
    return text(html.slice(0, fold))
  }
  /** Everything on screen without a press: summaries kept, `<details>` bodies dropped. */
  const defaultVisible = (html: string): string => {
    let out = ''
    let at = 0
    for (;;) {
      const open = html.indexOf('<details', at)
      if (open < 0) return text(out + html.slice(at))
      const summary = html.indexOf('</summary>', open)
      const close = html.indexOf('</details>', open)
      expect(summary, 'a <details> with no </summary>').toBeGreaterThan(-1)
      expect(close, 'a <details> with no </details>').toBeGreaterThan(-1)
      out += html.slice(at, summary + '</summary>'.length)
      at = close + '</details>'.length
    }
  }

  it('says an unknown id is unknown without anything being pressed', () => {
    const html = detail('no-such-pipeline')
    // THE CLAIMS ARE UNCHANGED AND THE SENTENCE IS SHORTER. It read "The address asked for a
    // pipeline with id no-such-pipeline, and no pipeline on file has it. Nothing was substituted for
    // it. The list below is everything there is; X is drawn because it is first in the order below."
    // — the raw id as the subject, and "Nothing was substituted for it" immediately before a
    // sentence saying what WAS drawn instead, which reads as a contradiction. Finding 5 of the
    // language audit, 19 August 2026. The substitution is still said out loud, because a different
    // pipeline really is being drawn and that is invariant 2.
    expect(text(html)).toContain('There is no pipeline at that address')
    expect(unpressed(html)).toContain('There is no pipeline at that address')
    expect(unpressed(html)).toContain('is drawn below because it is first in the order')
    // The id is in the address bar, where the reader typed it, and no longer in the sentence.
    expect(unpressed(html)).not.toContain('no-such-pipeline')
  })

  it('names the pipeline it is drawing, on screen, when the address names none', () => {
    const html = detail(null)
    // WHICH one is drawn is a fact and is visible. WHY that one — "it is first in the order below,
    // which is why it is the one drawn when you arrive" — was a standing paragraph about the
    // interface's own default and has gone; the ordering rule it appealed to is the visible line of
    // the index fold two rows above.
    expect(defaultVisible(html)).toContain('First on file')
    expect(text(html)).not.toContain('Drawn below')
    expect(text(html)).not.toContain('which is why it is the one drawn when you arrive')
    // Nothing went missing, so nothing claims anything did.
    expect(text(html)).not.toContain('no pipeline on file has it')
  })

  it('does not cry substitution when the address names a pipeline that is on file', () => {
    const html = detail('b')
    expect(text(html)).not.toContain('no pipeline on file has it')
    expect(defaultVisible(html)).toContain('Second on file')
  })

  /**
   * THE DEFECT. A pipeline record with no `blockIds` cannot be drawn, `readPipeline` says why in one
   * sentence, and that sentence was reachable only by pressing the grid fold open.
   *
   * The fixture is the shape `readPipeline` reports as `undeclared`, which is the case the seeded
   * workspace actually holds ("Trolley + lamp, powered together").
   */
  it('says a pipeline cannot be drawn, and why, without the fold being pressed', () => {
    const broken = flow.readPipeline(record('c', 'Mobile base + arm', {}), [], [])
    expect(broken.problem, 'the fixture no longer produces a problem, so this test proves nothing').not.toBeNull()

    const html = detail('c', [broken])
    const visible = defaultVisible(html)
    expect(visible).toContain('Mobile base + arm cannot be drawn.')
    expect(visible).toContain('The pipeline has not listed its steps yet.')
    // And the summary does not promise a grid that cannot exist.
    expect(visible).not.toContain('steps × modules grid for this pipeline')
  })

  it('still draws the grid, and says how far it has got, for a pipeline that can be read', () => {
    const visible = defaultVisible(detail('b'))
    expect(visible).not.toContain('cannot be drawn')
    expect(visible).toContain('steps × modules grid for this pipeline')
  })
})

describe('the step a pipeline is standing on', () => {
  it('prefers a failure, then a block, then work in flight, then the first thing not started', () => {
    const at = (states: string[]) =>
      page.standingOn(readSteps(states.map((state, i) => ({ id: `s${i}`, name: `s${i}`, state, modules: [] }))))
    expect(at(['done', 'doing', 'blocked', 'failed'])?.step.state).toBe('failed')
    expect(at(['done', 'doing', 'blocked'])?.step.state).toBe('blocked')
    expect(at(['done', 'doing', 'todo'])?.step.state).toBe('doing')
    expect(at(['done', 'todo'])?.step.state).toBe('todo')
    expect(at(['done', 'done'])).toBeNull()
  })
})

// ============================================================================ the stylesheet

describe('the stylesheet spends nothing it is not allowed to', () => {
  it('writes no colour of its own — every one is a token', () => {
    expect(flow.PIPELINE_FLOW_CSS).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(flow.PIPELINE_FLOW_CSS).not.toMatch(/\brgba?\(/)
  })

  it('spends the reserved dashed edge on one thing only: something nobody wrote down', () => {
    // Dashed means "Mole Office worked this out, nobody asserted it" everywhere in this app. A step
    // nobody owns is the opposite — somebody DID assert it — so that band has to be solid, and the
    // only dashed edge on the page is the one for a required field nobody filled in.
    const rules = flow.PIPELINE_FLOW_CSS.replace(/\/\*[\s\S]*?\*\//g, '')
    const dashed = rules.split('\n').filter((line) => line.includes('dashed'))
    expect(dashed).toEqual(['  border-style: dashed;'])
    expect(flow.PIPELINE_FLOW_CSS).toContain(".pf-band[data-kind='unrecorded'] {\n  border-style: dashed;\n}")
  })

  it('has one breakpoint and it is a container query, so there is no second phone layout', () => {
    expect(flow.PIPELINE_FLOW_CSS).toContain('@container flow (min-width: 720px)')
    expect(flow.PIPELINE_FLOW_CSS).not.toContain('@media')
  })
})
