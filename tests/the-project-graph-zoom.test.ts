// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PROJECT GRAPH'S MODEL AND ITS FOUR LEVELS. Wave 13s round 241.
 *
 * WHAT IS REAL: nothing. The reply below is made up in this file and never read from an office. No database and no DOM;
 * the model is a pure function of the reply.
 *
 * THE MADE-UP REPLY: two modules, A and B. Blocks 1 and 2 are carried by A and block 3 by nobody. Pipeline 1 holds
 * blocks 1 and 2 under A, and pipeline 2 holds block 3 under nobody. Stopping point 1 is about block 1, stopping point
 * 2 about nothing, and stopping point 3 about a record the reply does not hold. A trajectory of two planned states is
 * for A, and a direction is for nothing. Revisions: two real ones of A, one of B, one of the first planned state and
 * two of the direction.
 *
 * THE CASES, in order:
 *   1. each module is a lane holding what it carries, and the rest is in `unattached` or `projectCheckpoints`;
 *   2. level 1 draws the modules and every future, and nothing else;
 *   3. level 2 adds every real revision entry, every stopping point and every planned state;
 *   4. level 3 adds a count for each module, each pipeline and the project, and a boundary for each pipeline of two or
 *      more blocks;
 *   5. level 4 adds a summary for each module, pipeline, stopping point, future and planned state that has words;
 *   6. `sparsePast` is true only when there are revisions and none is real, and `empty` only when nothing is held;
 *   7. the present is a straight line with no `C`, and a future is one cubic curve;
 *   8. a future's weight, `EVOLUTION_WEIGHT`, is lighter than every pipeline line.
 *
 * MUTATIONS, each run alone after a green control and restored after. The counts are in the round's report.
 *   1. a block's lane not recorded, so stopping point 1 falls outside every lane: case 1 goes red;
 *   2. the futures count left at 0: cases 2 to 5 go red;
 *   3. the second level's marks drawn from the third level: case 3 goes red;
 *   4. a boundary drawn round a pipeline of one block: cases 4 and 5 go red;
 *   5. a summary counted without words: case 5 goes red;
 *   6. `sparsePast` true whenever no revision is real: case 6 goes red;
 *   7. the future drawn as a straight line: case 7 goes red;
 *   8. `EVOLUTION_WEIGHT` in evolution-model.ts made heavier than the lightest pipeline line, for the run only and
 *      restored, because that file is not this round's: case 8 goes red.
 */

import { describe, expect, it } from 'vitest'

import type {
  ProjectGraphCheckpoint,
  ProjectGraphFuture,
  ProjectGraphNode,
  ProjectGraphPlannedState,
  ProjectGraphReply,
  ProjectGraphRevisionEntry,
  ProjectGraphRevisionSummary,
} from '../src/shared/project-graph.ts'
import { EVOLUTION_WEIGHT, evolutionIsLighterThanPipeline } from '../src/web/components/graph/evolution-model.ts'
import { LINE_WEIGHT } from '../src/web/components/graph/lines.ts'
import {
  buildProjectGraph,
  futureCurve,
  marksAtLevel,
  presentLine,
} from '../src/web/components/graph/project-graph-model.ts'

const WORDS = 'Made-up words.'

function node(id: string, kind: ProjectGraphNode['kind'], extra: Partial<ProjectGraphNode> = {}): ProjectGraphNode {
  return { id, kind, title: `Made-up ${id}`, summary: null, state: null, parentId: null, carriedBy: [], blockIds: [], otherRecords: 0, ...extra }
}

function checkpoint(id: string, aboutIds: string[], summary: string | null): ProjectGraphCheckpoint {
  return {
    id,
    title: `Made-up ${id}`,
    summary,
    at: '2026-11-01 09:00:00',
    doing: WORDS,
    next: WORDS,
    changed: null,
    remains: null,
    failed: null,
    learned: null,
    stoppedAtRecord: null,
    stoppedAtRevision: null,
    aboutIds,
  }
}

function state(id: string, summary: string | null): ProjectGraphPlannedState {
  return { id, title: `Made-up ${id}`, summary, what: WORDS, outcome: null, byId: null, byTitle: null }
}

function future(id: string, kind: ProjectGraphFuture['kind'], targetId: string | null, extra: Partial<ProjectGraphFuture> = {}): ProjectGraphFuture {
  return {
    id,
    kind,
    title: `Made-up ${id}`,
    summary: null,
    targetId,
    because: null,
    paused: null,
    shelved: null,
    depth: null,
    question: null,
    whatIsNotKnown: null,
    next: null,
    blockedOn: null,
    states: [],
    edges: [],
    edgesDrawn: false,
    ...extra,
  }
}

function summary(recordId: string, versions: number, baselines: number): ProjectGraphRevisionSummary {
  return {
    recordId,
    title: `Made-up ${recordId}`,
    kind: 'module',
    versions,
    baselines,
    real: versions - baselines,
    firstAt: '2026-11-01 09:00:00',
    lastAt: '2026-11-02 09:00:00',
    baselineOnly: versions === 1 && baselines === 1,
  }
}

function entries(recordId: string, how: number): ProjectGraphRevisionEntry[] {
  return Array.from({ length: how }, (_, seq) => ({ recordId, seq: seq + 1, at: '2026-11-01 09:00:00', op: 'update', title: `Made-up ${recordId}` }))
}

/** A reply that holds nothing at all. */
function nothing(): ProjectGraphReply {
  return {
    workspaceId: 'made-up',
    sourceIndexBuilt: false,
    modules: [],
    pipelines: [],
    blocks: [],
    revisions: { summaries: [], entries: [], leftOut: 0, elsewhereReal: 0, recordsWithRealHistory: 0, baselineOnlyRecords: 0 },
    checkpoints: [],
    futures: [],
    plans: [],
    windows: [],
    allocations: [],
    links: [],
    counts: {
      modules: 0,
      pipelines: 0,
      blocks: 0,
      records: 0,
      revisions: 0,
      realRevisions: 0,
      baselines: 0,
      checkpoints: 0,
      trajectories: 0,
      directions: 0,
      plannedStates: 0,
      plans: 0,
      windows: 0,
      allocations: 0,
    },
    says: ['Made-up sentence the reply says.'],
  }
}

/** The made-up reply the header describes. */
function aReply(): ProjectGraphReply {
  const reply = nothing()
  reply.modules = [node('module-a', 'module', { summary: WORDS }), node('module-b', 'module')]
  reply.blocks = [
    node('block-1', 'block', { parentId: 'module-a', carriedBy: ['module-a'] }),
    node('block-2', 'block', { parentId: 'module-a', carriedBy: ['module-a'] }),
    node('block-3', 'block'),
  ]
  reply.pipelines = [
    node('pipeline-1', 'pipeline', { parentId: 'module-a', carriedBy: ['module-a'], blockIds: ['block-1', 'block-2'], summary: WORDS }),
    node('pipeline-2', 'pipeline', { blockIds: ['block-3'] }),
  ]
  reply.checkpoints = [
    checkpoint('stop-1', ['block-1'], WORDS),
    checkpoint('stop-2', [], null),
    checkpoint('stop-3', ['not-in-the-reply'], '   '),
  ]
  reply.futures = [
    future('trajectory', 'trajectory', 'module-a', { summary: WORDS, states: [state('state-1', WORDS), state('state-2', null)] }),
    future('direction', 'direction', null),
  ]
  reply.revisions.summaries = [summary('module-a', 2, 0), summary('module-b', 1, 0), summary('state-1', 1, 0), summary('direction', 2, 0)]
  reply.revisions.entries = [
    ...entries('module-a', 2),
    ...entries('module-b', 1),
    ...entries('state-1', 1),
    ...entries('direction', 2),
  ]
  reply.counts = { ...reply.counts, modules: 2, pipelines: 2, blocks: 3, records: 7, revisions: 6, realRevisions: 6 }
  reply.says = []
  return reply
}

const ids = (list: ReadonlyArray<{ id: string }> | undefined): string[] => (list ?? []).map((one) => one.id)

describe("the project graph's model", () => {
  it('1. puts each module in a lane with what it carries, and the rest outside every lane', () => {
    const model = buildProjectGraph(aReply())
    expect(model.lanes.map((lane) => lane.module.id)).toEqual(['module-a', 'module-b'])
    const [laneA, laneB] = model.lanes
    expect(ids(laneA?.blocks)).toEqual(['block-1', 'block-2'])
    expect(ids(laneA?.pipelines)).toEqual(['pipeline-1'])
    expect(ids(laneA?.checkpoints)).toEqual(['stop-1'])
    expect(ids(laneA?.futures)).toEqual(['trajectory'])
    expect(laneA?.revisions.entries.map((one) => one.recordId)).toEqual(['module-a', 'module-a', 'state-1'])
    expect(laneA?.counts).toMatchObject({ pipelines: 1, blocks: 2, checkpoints: 1, futures: 1, plannedStates: 2, realRevisions: 3 })
    expect(ids(laneB?.blocks)).toEqual([])
    expect(laneB?.counts.realRevisions).toBe(1)

    expect(ids(model.unattached.blocks)).toEqual(['block-3'])
    expect(ids(model.unattached.pipelines)).toEqual(['pipeline-2'])
    expect(ids(model.unattached.checkpoints)).toEqual(['stop-3'])
    expect(ids(model.unattached.futures)).toEqual(['direction'])
    expect(model.unattached.revisions.entries.map((one) => one.recordId)).toEqual(['direction', 'direction'])
    expect(ids(model.projectCheckpoints)).toEqual(['stop-2'])
  })

  it('2. draws the modules and every future at the first level, and nothing else', () => {
    expect(marksAtLevel(buildProjectGraph(aReply()), 'modules')).toEqual({
      modules: 2,
      futures: 2,
      plannedStates: 0,
      revisions: 0,
      checkpoints: 0,
      counts: 0,
      boundaries: 0,
      summaries: 0,
    })
  })

  it('3. adds every real revision, every stopping point and every planned state at the second level', () => {
    expect(marksAtLevel(buildProjectGraph(aReply()), 'revisionsAndCheckpoints')).toEqual({
      modules: 2,
      futures: 2,
      plannedStates: 2,
      revisions: 6,
      checkpoints: 3,
      counts: 0,
      boundaries: 0,
      summaries: 0,
    })
  })

  it('4. adds the counts and the boundaries at the third level', () => {
    expect(marksAtLevel(buildProjectGraph(aReply()), 'countsAndBoundaries')).toEqual({
      modules: 2,
      futures: 2,
      plannedStates: 2,
      revisions: 6,
      checkpoints: 3,
      // Two modules, two pipelines and the project.
      counts: 5,
      // Pipeline 1 holds two blocks; pipeline 2 holds one.
      boundaries: 1,
      summaries: 0,
    })
  })

  it('5. adds a summary for each record that has words at the fourth level', () => {
    expect(marksAtLevel(buildProjectGraph(aReply()), 'summaries')).toEqual({
      modules: 2,
      futures: 2,
      plannedStates: 2,
      revisions: 6,
      checkpoints: 3,
      counts: 5,
      boundaries: 1,
      // Module A, pipeline 1, stopping point 1, the trajectory and state 1. Stopping point 3's summary is blank.
      summaries: 5,
    })
  })

  it('6. calls the past sparse only when every revision is a baseline, and the graph empty only when nothing is held', () => {
    const held = buildProjectGraph(aReply())
    expect(held.sparsePast).toBe(false)
    expect(held.empty).toBe(false)

    const blank = nothing()
    const empty = buildProjectGraph(blank)
    expect(empty.empty).toBe(true)
    // NO REVISION AT ALL IS NOT A SPARSE PAST: there is no past to call sparse.
    expect(empty.sparsePast).toBe(false)
    expect(empty.notes).toEqual(blank.says)

    const baselines = nothing()
    baselines.modules = [node('module-a', 'module')]
    baselines.revisions.summaries = [summary('module-a', 1, 1)]
    baselines.counts = { ...baselines.counts, modules: 1, records: 1, revisions: 1, realRevisions: 0, baselines: 1 }
    const sparse = buildProjectGraph(baselines)
    expect(sparse.sparsePast).toBe(true)
    expect(sparse.empty).toBe(false)
  })

  it('7. draws the present as a straight line and a future as one cubic curve', () => {
    const from = { x: 10, y: 20 }
    const to = { x: 110, y: 60 }
    const present = presentLine(from, to)
    expect(present).toBe('M 10 20 L 110 60')
    expect(present).not.toContain('C')
    const curve = futureCurve(from, to)
    expect(curve.match(/C/g)).toHaveLength(1)
    expect(curve.startsWith('M 10 20 C ')).toBe(true)
    expect(curve.endsWith(', 110 60')).toBe(true)
  })

  it("8. strokes a future at the evolution drawing's weight, lighter than every pipeline line", () => {
    expect(evolutionIsLighterThanPipeline(EVOLUTION_WEIGHT, LINE_WEIGHT)).toEqual([])
  })
})
