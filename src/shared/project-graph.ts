// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE GRAPH OF THE PROJECT'S PAST, PRESENT AND LIVE FUTURES: the reply of `GET /api/project-graph`.
 *
 * Wave 13s round 241. One graph of the whole project shows where it has
 * been, where it is, and which futures are still alive, in four levels. The read is
 * src/server/lib/project-graph.ts, the pure model the page draws from is
 * src/web/components/graph/project-graph-model.ts, and this file is the contract between them.
 *
 * NOTHING HERE IS STORED. Every value is read from a record, a link, a revision row or a planning row
 * that the product already keeps. A future the product does not store is not in the reply, and a
 * project whose past is only migration baselines says so in `says` rather than drawing a timeline.
 */
import type { WordKey } from './i18n.ts'
import type { Link } from './types.ts'

/** The four levels of the graph, in the owner's order: each level draws what the one before it draws, and more. */
export const PROJECT_GRAPH_LEVELS = ['modules', 'revisionsAndCheckpoints', 'countsAndBoundaries', 'summaries'] as const
export type ProjectGraphLevel = (typeof PROJECT_GRAPH_LEVELS)[number]

/** The word key each level's name is read through. The page worker writes the words. */
export const PROJECT_GRAPH_LEVEL_WORD_KEYS: Readonly<Record<ProjectGraphLevel, WordKey>> = {
  modules: 'projectGraph.level.modules',
  revisionsAndCheckpoints: 'projectGraph.level.revisionsAndCheckpoints',
  countsAndBoundaries: 'projectGraph.level.countsAndBoundaries',
  summaries: 'projectGraph.level.summaries',
}

/** The read returns at most this many revision rows of the graph's own records, newest first, and counts the rest. */
export const PROJECT_GRAPH_REVISION_ROWS = 500

/** Work windows and allocations are returned when they overlap today to this many days from today. */
export const PROJECT_GRAPH_SCHEDULE_DAYS = 90

/** A stored link as the graph reads it: only these five fields of the stored row. */
export type ProjectGraphLink = Pick<Link, 'id' | 'fromId' | 'toId' | 'type' | 'inferred'>

export interface ProjectGraphNode {
  id: string
  kind: 'module' | 'pipeline' | 'block' | 'trajectory' | 'direction' | 'stopping_point'
  title: string
  summary: string | null
  /** The stored state word where the record has one, else null. Read through the shared state vocabulary. */
  state: string | null
  /** The module this pipeline/block is carried by, where a link says so. Null otherwise. */
  parentId: string | null
  /**
   * EVERY MODULE A LINK SAYS CARRIES THIS, in stored link order. A block's are the modules with an `implements` link to
   * it. A pipeline's are the modules that carry its blocks. `parentId` is set only when this holds exactly one module, so
   * a block or pipeline carried by two modules is drawn under neither and `says` counts it.
   */
  carriedBy: string[]
  /** A pipeline's stored block order, kept to the blocks this read found live in the project. Empty on every other kind. */
  blockIds: string[]
  /** How many live records of kinds this graph does not draw have a link to this one. Counted, never drawn. */
  otherRecords: number
}

export interface ProjectGraphRevisionSummary {
  recordId: string
  title: string
  kind: string
  versions: number
  baselines: number
  real: number
  firstAt: string | null
  lastAt: string | null
  baselineOnly: boolean
}

export interface ProjectGraphRevisionEntry {
  recordId: string
  seq: number
  at: string
  op: string
  title: string
}

export interface ProjectGraphCheckpoint {
  id: string
  title: string
  /** The record's own summary, or null when it has none. */
  summary: string | null
  at: string
  doing: string
  next: string
  changed: string | null
  remains: string | null
  failed: string | null
  learned: string | null
  stoppedAtRecord: string | null
  /** Stored by the product and NEVER resolved here. It is a source marker, not a revision number. */
  stoppedAtRevision: string | null
  aboutIds: string[]
}

export interface ProjectGraphPlannedState {
  id: string
  title: string
  /** The record's own summary, or null when it has none. */
  summary: string | null
  what: string
  /**
   * Read from `realises` / `instead_of` links, never stored. Null when no such link points at it, and null as well
   * when both kinds do, because the two cannot both be true and the read does not choose; `says` counts those.
   */
  outcome: 'realised' | 'answered-instead' | null
  byId: string | null
  byTitle: string | null
}

/** A pause or a shelf in the words it was stored in. Nothing here is worked out. */
export interface ProjectGraphSetAside {
  since: string
  /** The stored words for what would bring it back, or null when none are stored. */
  restartWhen: string | null
  /** A pause's stored end date, or null. A shelf stores none. */
  restartOn: string | null
  /** The record whose finishing a pause waits on, or null. A shelf stores none. */
  restartWithRecordId: string | null
}

export interface ProjectGraphFuture {
  id: string
  kind: 'trajectory' | 'direction'
  title: string
  /** The record's own summary, or null when it has none. */
  summary: string | null
  /** The module/pipeline/block this future is for, or null when a link names none. */
  targetId: string | null
  because: string | null
  paused: (ProjectGraphSetAside & { why: string }) | null
  shelved: (ProjectGraphSetAside & { because: string }) | null
  /** A direction's own six-rung depth, read by the kind's ladder; null on a trajectory. */
  depth: { depth: string; rung: number; rungs: number } | null
  question: string | null
  whatIsNotKnown: string | null
  next: string | null
  blockedOn: string | null
  states: ProjectGraphPlannedState[]
  edges: Array<{ from: string; to: string; carries: string | null }>
  /** False when a trajectory stores no edges at all: nobody has drawn its shape, which is not the same as no edges. */
  edgesDrawn: boolean
}

export interface ProjectGraphPlanLine {
  id: string
  planId: string
  text: string
  recordId: string | null
  position: number
}

export interface ProjectGraphPlan {
  id: string
  title: string
  state: string
  lines: ProjectGraphPlanLine[]
}

export interface ProjectGraphWindow {
  id: string
  recordId: string
  recordTitle: string | null
  startsOn: string
  endsOn: string
  state: string
  note: string | null
}

export interface ProjectGraphAllocation {
  id: string
  recordId: string
  recordTitle: string | null
  period: string
  plannedHours: number | null
  actualHours: number | null
  state: string
}

/**
 * WHAT WAS READ, COUNTED. `records` is modules + pipelines + blocks. `revisions`, `realRevisions` and `baselines` count
 * every revision row of the project, whichever record it belongs to, so a sparse past is told from the whole project.
 */
export interface ProjectGraphCounts {
  modules: number
  pipelines: number
  blocks: number
  records: number
  revisions: number
  realRevisions: number
  baselines: number
  checkpoints: number
  trajectories: number
  directions: number
  plannedStates: number
  plans: number
  windows: number
  allocations: number
}

export interface ProjectGraphReply {
  workspaceId: string
  /**
   * WHETHER THIS PROJECT HAS A SOURCE INDEX. The page asks the source map's door only when this is not false: a project
   * with no index has no coverage to serve, and asking would answer the source door's designed 404.
   *
   * NULL WHEN THE READ COULD NOT TELL, because the stored index data was unreadable. The page then asks the coverage
   * door and keeps its could-not-be-read sentence, rather than calling the project one with no map or failing the graph.
   */
  sourceIndexBuilt: boolean | null
  modules: ProjectGraphNode[]
  pipelines: ProjectGraphNode[]
  blocks: ProjectGraphNode[]
  revisions: {
    summaries: ProjectGraphRevisionSummary[]
    entries: ProjectGraphRevisionEntry[]
    /** Real revision rows the 500-row cap left out. */
    leftOut: number
    /** Real revisions belonging to records this graph does not draw, counted and not named. */
    elsewhereReal: number
    recordsWithRealHistory: number
    baselineOnlyRecords: number
  }
  checkpoints: ProjectGraphCheckpoint[]
  futures: ProjectGraphFuture[]
  plans: ProjectGraphPlan[]
  windows: ProjectGraphWindow[]
  allocations: ProjectGraphAllocation[]
  /** Every stored link with an end among the graph's records, in stored order. */
  links: ProjectGraphLink[]
  counts: ProjectGraphCounts
  /** Plain sentences saying what this project does not hold, what was left out, and what is not drawn. */
  says: string[]
}

/** A count with its noun, singular for one. */
function counted(n: number, one: string, many: string): string {
  return `${String(n)} ${n === 1 ? one : many}`
}

/**
 * THE SENTENCES OF `says`, each written in one place so the read and its test read the same words.
 *
 * Each one is said only when what it says is true on this read; the read decides that.
 */
export const PROJECT_GRAPH_SAYS = {
  empty: (): string =>
    'This project holds no module, pipeline, block, planned future, direction, stopping point, plan line, work window or allocation, so the graph has nothing to draw.',
  pastIsABaseline: (revisions: number): string =>
    `Every one of this project's ${counted(revisions, 'revision', 'revisions')} is a migration baseline, so its past is a starting point and not a history. Nothing records what changed before it.`,
  someRecordsOnlyABaseline: (records: number): string =>
    `${counted(records, 'record holds', 'records hold')} only a migration baseline, so nothing records what changed in ${records === 1 ? 'it' : 'them'} before that.`,
  realElsewhere: (revisions: number): string =>
    `${counted(revisions, 'real revision belongs', 'real revisions belong')} to records this graph does not draw. They are counted here and not named.`,
  revisionsLeftOut: (leftOut: number, shown: number): string =>
    `Only the newest ${String(shown)} revisions of this graph's records are listed. ${counted(leftOut, 'older one is', 'older ones are')} left out.`,
  plansWithoutALine: (plans: number): string =>
    `${counted(plans, 'plan has', 'plans have')} no line about a record of this graph, so ${plans === 1 ? 'it is' : 'they are'} not returned.`,
  planLinesLeftOut: (lines: number): string =>
    `${counted(lines, 'line', 'lines')} of the plans returned here ${lines === 1 ? 'is' : 'are'} not about a record of this graph, so ${lines === 1 ? 'it is' : 'they are'} not returned.`,
  windowsOutside: (windows: number, days: number): string =>
    `${counted(windows, 'work window', 'work windows')} of this graph's records ${windows === 1 ? 'falls' : 'fall'} outside today to ${String(days)} days from today, so ${windows === 1 ? 'it is' : 'they are'} not returned.`,
  allocationsOutside: (allocations: number, days: number): string =>
    `${counted(allocations, 'allocation', 'allocations')} of this graph's records ${allocations === 1 ? 'falls' : 'fall'} outside today to ${String(days)} days from today, so ${allocations === 1 ? 'it is' : 'they are'} not returned.`,
  otherRecordsCounted: (records: number): string =>
    `${counted(records, 'record', 'records')} of other kinds ${records === 1 ? 'is' : 'are'} linked to modules, pipelines or blocks. Each is counted on what it is linked to and not drawn.`,
  carriedByMoreThanOne: (records: number): string =>
    `${counted(records, 'block or pipeline is', 'blocks or pipelines are')} carried by more than one module, so ${records === 1 ? 'it is' : 'they are'} drawn outside every module.`,
  missingBlocks: (ids: number): string =>
    `${counted(ids, 'block id', 'block ids')} stored on pipelines ${ids === 1 ? 'names' : 'name'} no live block in this project, so ${ids === 1 ? 'it is' : 'they are'} not drawn.`,
  stopsWithoutWords: (stops: number): string =>
    `${counted(stops, 'stopping point stores', 'stopping points store')} no words for what was being done or what comes next, so ${stops === 1 ? 'it is' : 'they are'} not drawn.`,
  statesNotDrawn: (states: number): string =>
    `${counted(states, 'planned state', 'planned states')} named by planned futures ${states === 1 ? 'is' : 'are'} gone or ${states === 1 ? 'stores' : 'store'} no words of what ${states === 1 ? 'it is' : 'they are'}, so ${states === 1 ? 'it is' : 'they are'} not drawn.`,
  statesWithoutAFuture: (states: number): string =>
    `${counted(states, 'planned state is', 'planned states are')} named by no planned future, so ${states === 1 ? 'it is' : 'they are'} not drawn.`,
  outcomeInDoubt: (states: number): string =>
    `${counted(states, 'planned state is', 'planned states are')} linked as both realised and answered instead, so no outcome is drawn for ${states === 1 ? 'it' : 'them'}.`,
} as const
