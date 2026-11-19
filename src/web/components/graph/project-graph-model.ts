// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PROJECT GRAPH'S MODEL: a pure function of the reply of `GET /api/project-graph`. Wave 13s round 241.
 *
 * No database and no DOM. The page draws from this, and the page's tests ask `marksAtLevel` what each of the owner's four
 * levels draws, so the answer is worked out here once.
 *
 * ONE LANE PER MODULE. A lane holds the module, the blocks a link says it carries, the pipelines of those blocks, and the
 * stopping points, futures and revisions of any of them. Everything the reply holds that no lane takes is in
 * `unattached`, or in `projectCheckpoints` when it is a stopping point about nothing; the revisions of all of those are
 * in `unattached.revisions`, so no real revision is dropped. Nothing is given a position the
 * reply does not give it: a lane's order is the reply's order, and a record goes to the lane its own links name.
 *
 * THE PRESENT IS A STRAIGHT LINE AND A FUTURE IS A CURVE. A future is drawn at `EVOLUTION_WEIGHT` from
 * evolution-model.ts, the weight the module evolution drawing already proves lighter than every pipeline line; this
 * file declares no weight of its own.
 *
 * NO WORDS ARE WRITTEN HERE. `notes` passes on the reply's own `says` sentences, and the level names are word keys in
 * src/shared/project-graph.ts.
 */
import {
  PROJECT_GRAPH_LEVELS,
  type ProjectGraphAllocation,
  type ProjectGraphCheckpoint,
  type ProjectGraphCounts,
  type ProjectGraphFuture,
  type ProjectGraphLevel,
  type ProjectGraphLink,
  type ProjectGraphNode,
  type ProjectGraphPlan,
  type ProjectGraphReply,
  type ProjectGraphRevisionEntry,
  type ProjectGraphRevisionSummary,
  type ProjectGraphWindow,
} from '@shared/project-graph.ts'

/**
 * THE STORED LINKS BETWEEN TWO STEPS THAT THE CANVAS DRAWS (wave 13u round 216, package BV, point BV-5). `feeds` says a
 * flow leaves one step for the other, and `blocks` says one step waits for the other. The pipeline page draws such a link
 * only when both steps are in the one pipeline it shows (`readPipelineBlocks` in src/shared/blocks.ts); the canvas holds
 * every block of the project, so it draws every one whose two ends are blocks of the reply.
 */
export const STEP_LINK_TYPES = ['feeds', 'blocks'] as const

/** One stored link between two blocks, as seen from one of its ends. */
export interface GraphStepLink {
  /** The stored link's id. */
  id: string
  type: (typeof STEP_LINK_TYPES)[number]
  /** `forward` when this block is the link's `fromId`, `reverse` when it is the `toId`. */
  direction: 'forward' | 'reverse'
  /** The block at the other end, and its title. */
  otherId: string
  otherTitle: string
  /** The link row's own `inferred` flag: the office worked it out rather than being told. */
  inferred: boolean
}

/** What one lane holds, counted from its own lists. */
export interface GraphLaneCounts {
  pipelines: number
  blocks: number
  checkpoints: number
  futures: number
  plannedStates: number
  /** Every revision row of the lane's records, baselines included. */
  versions: number
  realRevisions: number
  /** Live records of kinds the graph does not draw, linked to the module, its pipelines or its blocks. */
  otherRecords: number
}

export interface GraphLane {
  module: ProjectGraphNode
  pipelines: ProjectGraphNode[]
  blocks: ProjectGraphNode[]
  revisions: { summaries: ProjectGraphRevisionSummary[]; entries: ProjectGraphRevisionEntry[] }
  checkpoints: ProjectGraphCheckpoint[]
  futures: ProjectGraphFuture[]
  counts: GraphLaneCounts
}

export interface ProjectGraphModel {
  lanes: GraphLane[]
  unattached: {
    pipelines: ProjectGraphNode[]
    blocks: ProjectGraphNode[]
    /** Stopping points about records that no lane holds. */
    checkpoints: ProjectGraphCheckpoint[]
    /** Futures whose target no lane holds, or that name no target. */
    futures: ProjectGraphFuture[]
    /**
     * The revisions of every record no lane holds: the records above, the stopping points about the project, and the
     * records the graph draws nowhere. A real revision is drawn in a lane or here, never dropped.
     */
    revisions: { summaries: ProjectGraphRevisionSummary[]; entries: ProjectGraphRevisionEntry[] }
  }
  /** Stopping points with no `about` link: they are about the project. */
  projectCheckpoints: ProjectGraphCheckpoint[]
  plans: ProjectGraphPlan[]
  windows: ProjectGraphWindow[]
  allocations: ProjectGraphAllocation[]
  /**
   * Each block's stored `feeds` and `blocks` links to another block of the reply, from both ends, in stored link order.
   * A block with none is not a key.
   */
  stepLinks: ReadonlyMap<string, readonly GraphStepLink[]>
  counts: ProjectGraphCounts
  /** The project has revisions and not one of them is real: its past is a baseline, not a history. */
  sparsePast: boolean
  /** The reply holds no module, pipeline, block, stopping point, future, plan, window or allocation. */
  empty: boolean
  /** The reply's own `says` sentences, as it wrote them. */
  notes: string[]
}

export function buildProjectGraph(reply: ProjectGraphReply): ProjectGraphModel {
  const lanes: GraphLane[] = reply.modules.map((module) => ({
    module,
    pipelines: [],
    blocks: [],
    revisions: { summaries: [], entries: [] },
    checkpoints: [],
    futures: [],
    counts: { pipelines: 0, blocks: 0, checkpoints: 0, futures: 0, plannedStates: 0, versions: 0, realRevisions: 0, otherRecords: 0 },
  }))
  /** Which lane each record is drawn in. A record not here is drawn in no lane. */
  const laneOf = new Map<string, GraphLane>()
  for (const lane of lanes) laneOf.set(lane.module.id, lane)

  const unattached: ProjectGraphModel['unattached'] = {
    pipelines: [],
    blocks: [],
    checkpoints: [],
    futures: [],
    revisions: { summaries: [], entries: [] },
  }
  for (const block of reply.blocks) {
    const lane = block.parentId === null ? undefined : laneOf.get(block.parentId)
    if (lane === undefined) unattached.blocks.push(block)
    else {
      lane.blocks.push(block)
      laneOf.set(block.id, lane)
    }
  }
  for (const pipeline of reply.pipelines) {
    const lane = pipeline.parentId === null ? undefined : laneOf.get(pipeline.parentId)
    if (lane === undefined) unattached.pipelines.push(pipeline)
    else {
      lane.pipelines.push(pipeline)
      laneOf.set(pipeline.id, lane)
    }
  }

  const projectCheckpoints: ProjectGraphCheckpoint[] = []
  for (const checkpoint of reply.checkpoints) {
    if (checkpoint.aboutIds.length === 0) {
      projectCheckpoints.push(checkpoint)
      continue
    }
    // THE FIRST RECORD IT IS ABOUT THAT A LANE HOLDS, in the order its links were stored.
    const lane = checkpoint.aboutIds.map((id) => laneOf.get(id)).find((one) => one !== undefined)
    if (lane === undefined) unattached.checkpoints.push(checkpoint)
    else {
      lane.checkpoints.push(checkpoint)
      laneOf.set(checkpoint.id, lane)
    }
  }

  for (const future of reply.futures) {
    const lane = future.targetId === null ? undefined : laneOf.get(future.targetId)
    if (lane === undefined) {
      unattached.futures.push(future)
      continue
    }
    lane.futures.push(future)
    laneOf.set(future.id, lane)
    for (const state of future.states) laneOf.set(state.id, lane)
  }

  const revisionsOf = (recordId: string): GraphLane['revisions'] => laneOf.get(recordId)?.revisions ?? unattached.revisions
  for (const summary of reply.revisions.summaries) revisionsOf(summary.recordId).summaries.push(summary)
  for (const entry of reply.revisions.entries) revisionsOf(entry.recordId).entries.push(entry)

  for (const lane of lanes) {
    lane.counts = {
      pipelines: lane.pipelines.length,
      blocks: lane.blocks.length,
      checkpoints: lane.checkpoints.length,
      futures: lane.futures.length,
      plannedStates: lane.futures.reduce((sum, future) => sum + future.states.length, 0),
      versions: lane.revisions.summaries.reduce((sum, summary) => sum + summary.versions, 0),
      realRevisions: lane.revisions.summaries.reduce((sum, summary) => sum + summary.real, 0),
      otherRecords: [lane.module, ...lane.pipelines, ...lane.blocks].reduce((sum, one) => sum + one.otherRecords, 0),
    }
  }

  const empty =
    reply.modules.length +
      reply.pipelines.length +
      reply.blocks.length +
      reply.checkpoints.length +
      reply.futures.length +
      reply.plans.length +
      reply.windows.length +
      reply.allocations.length ===
    0

  return {
    lanes,
    unattached,
    projectCheckpoints,
    plans: reply.plans,
    windows: reply.windows,
    allocations: reply.allocations,
    stepLinks: stepLinksOf(reply.links, new Map(reply.blocks.map((block) => [block.id, block]))),
    counts: reply.counts,
    sparsePast: reply.counts.revisions > 0 && reply.counts.realRevisions === 0,
    empty,
    notes: reply.says,
  }
}

/** Every stored step link whose two ends are blocks of the reply, filed under both of its ends. */
function stepLinksOf(links: readonly ProjectGraphLink[], blocks: ReadonlyMap<string, ProjectGraphNode>): Map<string, GraphStepLink[]> {
  const out = new Map<string, GraphStepLink[]>()
  const file = (blockId: string, one: GraphStepLink) => {
    const list = out.get(blockId)
    if (list === undefined) out.set(blockId, [one])
    else list.push(one)
  }
  for (const link of links) {
    const type = STEP_LINK_TYPES.find((one) => one === link.type)
    const from = blocks.get(link.fromId)
    const to = blocks.get(link.toId)
    if (type === undefined || from === undefined || to === undefined) continue
    file(from.id, { id: link.id, type, direction: 'forward', otherId: to.id, otherTitle: to.title, inferred: link.inferred })
    file(to.id, { id: link.id, type, direction: 'reverse', otherId: from.id, otherTitle: from.title, inferred: link.inferred })
  }
  return out
}

/** How many marks of each sort one level draws. A level draws every mark of the levels before it. */
export interface MarksAtLevel {
  modules: number
  futures: number
  plannedStates: number
  revisions: number
  checkpoints: number
  counts: number
  boundaries: number
  summaries: number
}

const hasWords = (words: string | null): boolean => words !== null && words.trim() !== ''

/**
 * WHAT ONE LEVEL DRAWS, counted. The page draws by this and its tests ask this, so the two cannot disagree.
 *
 *   1. modules: a lane for each module, and every trajectory and direction, in a lane or not.
 *   2. revisionsAndCheckpoints: and every real revision entry, in a lane or in `unattached`, every stopping point, and
 *      every planned state.
 *   3. countsAndBoundaries: and a count chip for each module, each pipeline and the project's totals, and a boundary
 *      round each pipeline that holds two or more blocks.
 *   4. summaries: and a summary for each module, pipeline, stopping point, trajectory, direction and planned state whose
 *      record has one.
 */
export function marksAtLevel(model: ProjectGraphModel, level: ProjectGraphLevel): MarksAtLevel {
  const reached = PROJECT_GRAPH_LEVELS.indexOf(level)
  const at = (which: ProjectGraphLevel): boolean => reached >= PROJECT_GRAPH_LEVELS.indexOf(which)

  const futures = [...model.lanes.flatMap((lane) => lane.futures), ...model.unattached.futures]
  const pipelines = [...model.lanes.flatMap((lane) => lane.pipelines), ...model.unattached.pipelines]
  const checkpoints = [
    ...model.lanes.flatMap((lane) => lane.checkpoints),
    ...model.unattached.checkpoints,
    ...model.projectCheckpoints,
  ]
  const states = futures.flatMap((future) => future.states)

  const marks: MarksAtLevel = {
    modules: model.lanes.length,
    futures: futures.length,
    plannedStates: 0,
    revisions: 0,
    checkpoints: 0,
    counts: 0,
    boundaries: 0,
    summaries: 0,
  }
  if (at('revisionsAndCheckpoints')) {
    marks.revisions = model.lanes.reduce((sum, lane) => sum + lane.revisions.entries.length, model.unattached.revisions.entries.length)
    marks.checkpoints = checkpoints.length
    marks.plannedStates = states.length
  }
  if (at('countsAndBoundaries')) {
    marks.counts = model.lanes.length + pipelines.length + 1
    marks.boundaries = pipelines.filter((pipeline) => pipeline.blockIds.length >= 2).length
  }
  if (at('summaries')) {
    marks.summaries = [
      ...model.lanes.map((lane) => lane.module.summary),
      ...pipelines.map((pipeline) => pipeline.summary),
      ...checkpoints.map((checkpoint) => checkpoint.summary),
      ...futures.map((future) => future.summary),
      ...states.map((state) => state.summary),
    ].filter(hasWords).length
  }
  return marks
}

interface Point {
  x: number
  y: number
}

/** The present: a straight segment, and never a curve. */
export function presentLine(from: Point, to: Point): string {
  return `M ${String(from.x)} ${String(from.y)} L ${String(to.x)} ${String(to.y)}`
}

/**
 * A future: one cubic Bezier, the symmetric S that `branchCurve` in evolution-model.ts draws, laid along the time axis.
 * It leaves the present level and arrives level, with both control points halfway across.
 */
export function futureCurve(from: Point, to: Point): string {
  const mid = (from.x + to.x) / 2
  return `M ${String(from.x)} ${String(from.y)} C ${String(mid)} ${String(from.y)}, ${String(mid)} ${String(to.y)}, ${String(to.x)} ${String(to.y)}`
}
