// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PROJECT GRAPH'S ONE BOUNDED READ: what `GET /api/project-graph` answers. Wave 13s round 241.
 *
 * The reply's shape and its sentences are src/shared/project-graph.ts. This file reads them from the database, for one
 * project, and writes nothing.
 *
 * WHAT IT READS, AND HOW MUCH. The live records of the seven kinds the graph draws, in one statement. The links with an
 * end among them, in pieces of ids, never the project's whole link table. The records at the far end of those links, for
 * their titles and kinds. One grouped statement over the project's revision rows, and at most
 * PROJECT_GRAPH_REVISION_ROWS real revision rows of the graph's own records. The plan lines, work windows and
 * allocations whose record is one of the graph's, in pieces of ids, the plans those lines belong to, and a count of
 * those plans' other lines.
 *
 * WHAT IT DOES NOT DO. It resolves no `stoppedAtRevision`: that is a marker the writer chose, not a revision number. It
 * draws no future the product does not store. It chooses no answer where the store holds two: a block carried by two
 * modules is under neither, and a planned state linked both realised and answered instead has no outcome. Each of those
 * is counted in `says`.
 */
import { and, count, desc, eq, inArray, isNull, max, min, ne, or, sql } from 'drizzle-orm'

import { blockIdsOf } from '@shared/blocks.ts'
import { KIND_SPECS } from '@shared/kinds.ts'
import { dayKey, parsePeriod, readDayKey } from '@shared/planning.ts'
import {
  PROJECT_GRAPH_REVISION_ROWS,
  PROJECT_GRAPH_SAYS,
  PROJECT_GRAPH_SCHEDULE_DAYS,
  type ProjectGraphAllocation,
  type ProjectGraphCheckpoint,
  type ProjectGraphFuture,
  type ProjectGraphLink,
  type ProjectGraphNode,
  type ProjectGraphPlan,
  type ProjectGraphPlannedState,
  type ProjectGraphReply,
  type ProjectGraphRevisionEntry,
  type ProjectGraphRevisionSummary,
  type ProjectGraphWindow,
} from '@shared/project-graph.ts'
import { nowStamp } from '@shared/time.ts'
import { depthReading, type LinkType, type PanelRecord, type RecordKind, type RevisionOp } from '@shared/types.ts'
import { readPause, stateOfWork } from '@shared/work.ts'
import { db } from '../db/client.ts'
import { listRepositories } from '../db/list-repositories.ts'
import { readInPieces } from '../db/in-pieces.ts'
import { allocations, links, planLines, plans, records, revisions, workWindows } from '../db/schema.ts'
import { indexStatus } from './index-status.ts'
import { liveRecordsOfKinds } from './records.ts'

/** The kinds this graph draws, each checked against the kind list by its type. */
const MODULE = 'module' satisfies RecordKind
const PIPELINE = 'pipeline' satisfies RecordKind
const BLOCK = 'block' satisfies RecordKind
const TRAJECTORY = 'trajectory' satisfies RecordKind
const PLANNED_STATE = 'planned_state' satisfies RecordKind
const DIRECTION = 'direction' satisfies RecordKind
const STOPPING_POINT = 'stopping_point' satisfies RecordKind
const GRAPH_KINDS: readonly RecordKind[] = [MODULE, PIPELINE, BLOCK, TRAJECTORY, PLANNED_STATE, DIRECTION, STOPPING_POINT]

/** The link types the read follows, each checked against the link list by its type. */
const IMPLEMENTS = 'implements' satisfies LinkType
const PLANS_FOR = 'plans_for' satisfies LinkType
const ABOUT = 'about' satisfies LinkType
const REALISES = 'realises' satisfies LinkType
const INSTEAD_OF = 'instead_of' satisfies LinkType

/** The revision op a migration writes, checked against the op list by its type. */
const BASELINE: RevisionOp = 'baseline'

/**
 * A FIELD NAME, CHECKED AGAINST THE KIND'S OWN DECLARATION when this file loads. A field the kind stops declaring stops
 * the server here, naming the field, rather than reading as absent on every record.
 */
function declared(whichKind: RecordKind, key: string): string {
  if (!KIND_SPECS[whichKind].fields.some((field) => field.key === key)) {
    throw new Error(`The project graph reads the field "${key}" of the ${whichKind} kind, and that kind declares no such field.`)
  }
  return key
}

const FIELD = {
  doing: declared(STOPPING_POINT, 'doing'),
  next: declared(STOPPING_POINT, 'next'),
  changed: declared(STOPPING_POINT, 'changed'),
  remains: declared(STOPPING_POINT, 'remains'),
  failed: declared(STOPPING_POINT, 'failed'),
  learned: declared(STOPPING_POINT, 'learned'),
  stoppedAtRecord: declared(STOPPING_POINT, 'stoppedAtRecord'),
  stoppedAtRevision: declared(STOPPING_POINT, 'stoppedAtRevision'),
  plannedStateIds: declared(TRAJECTORY, 'plannedStateIds'),
  edges: declared(TRAJECTORY, 'edges'),
  because: declared(TRAJECTORY, 'because'),
  what: declared(PLANNED_STATE, 'what'),
  shelved: declared(DIRECTION, 'shelved'),
  question: declared(DIRECTION, 'question'),
  whatIsNotKnown: declared(DIRECTION, 'what_is_not_known'),
  directionNext: declared(DIRECTION, 'next'),
  blockedOn: declared(DIRECTION, 'blocked_on'),
} as const

/** The keys inside a direction's `shelved`, as the Shelf shape declares them. */
const SHELF = { since: 'since', because: 'because', restartWhen: 'restart_when' } as const

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** The stored words of one field, trimmed, or null when it stores none. */
function wordsOf(data: unknown, key: string): string | null {
  if (!isObject(data)) return null
  const value = data[key]
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
}

/** The stored strings of one list field, in order, or an empty list. */
function stringsOf(data: unknown, key: string): string[] {
  if (!isObject(data)) return []
  const value = data[key]
  return Array.isArray(value) ? value.filter((one): one is string => typeof one === 'string' && one.trim() !== '') : []
}

/** The record's stored state word, read as the shared work state reader reads it, or null when it stores none. */
function stateWordOf(record: PanelRecord): string | null {
  const word = stateOfWork(record.data)
  return typeof word === 'string' && word.trim() !== '' ? word : null
}

/** Records in the order they were made, oldest first, with the id ending a tie. A timeline reads left to right. */
function byCreation(one: PanelRecord, other: PanelRecord): number {
  if (one.createdAt !== other.createdAt) return one.createdAt < other.createdAt ? -1 : 1
  return one.id < other.id ? -1 : one.id > other.id ? 1 : 0
}

/** A direction's `shelved`, in its stored words, or null when it stores no whole shelf. */
function readShelf(data: unknown): ProjectGraphFuture['shelved'] {
  if (!isObject(data)) return null
  const shelf = data[FIELD.shelved]
  const since = wordsOf(shelf, SHELF.since)
  const because = wordsOf(shelf, SHELF.because)
  if (since === null || because === null) return null
  return { since, because, restartWhen: wordsOf(shelf, SHELF.restartWhen), restartOn: null, restartWithRecordId: null }
}

/** A trajectory's or direction's `paused`, read by the shared pause reader, in its stored words. */
function readPaused(data: unknown): ProjectGraphFuture['paused'] {
  const pause = readPause(data)
  if (pause === null) return null
  return {
    since: pause.since,
    why: pause.why,
    restartWhen: pause.until?.condition ?? null,
    restartOn: pause.until?.date ?? null,
    restartWithRecordId: pause.until?.recordId ?? null,
  }
}

/** A trajectory's stored edges, and whether it stores any edge list at all. */
function readEdges(data: unknown): { edges: ProjectGraphFuture['edges']; drawn: boolean } {
  if (!isObject(data) || !Array.isArray(data[FIELD.edges])) return { edges: [], drawn: false }
  const edges: ProjectGraphFuture['edges'] = []
  for (const edge of data[FIELD.edges] as unknown[]) {
    const from = wordsOf(edge, 'from')
    const to = wordsOf(edge, 'to')
    if (from === null || to === null) continue
    edges.push({ from, to, carries: wordsOf(edge, 'carries') })
  }
  return { edges, drawn: true }
}

interface FarRecord {
  id: string
  kind: string
  title: string
  workspaceId: string
  deletedAt: string | null
}

/** The window of days the schedules are read for: today, on this machine's clock, to PROJECT_GRAPH_SCHEDULE_DAYS on. */
function theScheduleSpan(): { from: string; to: string } {
  const from = nowStamp().slice(0, 10)
  const end = readDayKey(from)
  if (end === null) throw new Error(`The clock's stamp "${nowStamp()}" does not begin with a day, so the schedules cannot be read.`)
  end.setDate(end.getDate() + PROJECT_GRAPH_SCHEDULE_DAYS)
  return { from, to: dayKey(end) }
}

/**
 * WHETHER THE COVERAGE DOOR HAS A SCAN TO COUNT, WITHOUT TURNING THE READ INTO A REFUSAL.
 *
 * It is the condition of `stampOfTheCountedScans` in src/server/api/source.ts: a project with registered repositories
 * is counted against a stored scan of at least one of them, and a project with none against its workspace scan. The
 * graph page asks the coverage door only when this holds, so a project with no source index makes no request that is
 * designed to answer 404.
 *
 * NULL WHEN THE STORED INDEX CANNOT BE READ. `indexStatus` parses the stored skipped list and throws on damaged data.
 * That failure is the coverage door's to report, in its own sentence, and must not turn into a failed graph read or be
 * misreported as a project with no index. So every repository is checked (a `some` would stop at a healthy one) and an
 * unreadable row answers null, which tells the page to ask coverage and keep its existing could-not-be-read sentence.
 */
function sourceIndexIsBuilt(workspaceId: string): boolean | null {
  try {
    const registered = listRepositories(workspaceId)
    if (registered.length === 0) return indexStatus(workspaceId) !== null
    let built = false
    for (const repository of registered) {
      if (indexStatus(workspaceId, repository.id) !== null) built = true
    }
    return built
  } catch {
    return null
  }
}

export function readProjectGraph(workspaceId: string): ProjectGraphReply {
  const read = liveRecordsOfKinds(workspaceId, GRAPH_KINDS).sort(byCreation)
  const ofKind = (wanted: RecordKind): PanelRecord[] => read.filter((record) => record.kind === wanted)
  const byId = new Map(read.map((record) => [record.id, record]))
  const graphIds = read.map((record) => record.id)

  // ---- links: only those with an end among the graph's records, in stored order
  const linkRows = readInPieces(graphIds, (piece) =>
    db
      .select({
        id: links.id,
        fromId: links.fromId,
        toId: links.toId,
        type: links.type,
        inferred: links.inferred,
        createdAt: links.createdAt,
        storedAs: sql<number>`rowid`,
      })
      .from(links)
      .where(or(inArray(links.fromId, piece), inArray(links.toId, piece)))
      .all(),
  )
  // A link whose two ends fall in two pieces comes back twice; it is kept once, and the pieces are put back in the
  // order the links were stored.
  const seen = new Set<string>()
  const storedLinks = linkRows
    .filter((row) => (seen.has(row.id) ? false : (seen.add(row.id), true)))
    .sort((one, other) =>
      one.createdAt !== other.createdAt ? (one.createdAt < other.createdAt ? -1 : 1) : one.storedAs - other.storedAs,
    )
  const graphLinks: ProjectGraphLink[] = storedLinks.map((row) => ({
    id: row.id,
    fromId: row.fromId,
    toId: row.toId,
    type: row.type as LinkType,
    inferred: row.inferred,
  }))

  // ---- the records at the far end of those links, for a title and a kind
  const farIds = new Set<string>()
  for (const link of graphLinks) for (const end of [link.fromId, link.toId]) if (!byId.has(end)) farIds.add(end)
  const far = new Map<string, FarRecord>(
    readInPieces(farIds, (piece) =>
      db
        .select({ id: records.id, kind: records.kind, title: records.title, workspaceId: records.workspaceId, deletedAt: records.deletedAt })
        .from(records)
        .where(inArray(records.id, piece))
        .all(),
    ).map((row) => [row.id, row]),
  )
  const titleOf = (id: string): string | null => byId.get(id)?.title ?? far.get(id)?.title ?? null

  // ---- modules, pipelines and blocks, with what carries them
  const modules = ofKind(MODULE)
  const pipelines = ofKind(PIPELINE)
  const blocks = ofKind(BLOCK)
  const moduleIds = new Set(modules.map((module) => module.id))
  const blockIdSet = new Set(blocks.map((block) => block.id))

  const carriers = new Map<string, string[]>()
  for (const link of graphLinks) {
    if (link.type !== IMPLEMENTS || !moduleIds.has(link.fromId) || !blockIdSet.has(link.toId)) continue
    const list = carriers.get(link.toId) ?? []
    if (!list.includes(link.fromId)) list.push(link.fromId)
    carriers.set(link.toId, list)
  }

  // Live records of the kinds this graph does not draw, in this project, counted on each record they are linked to.
  const otherLinked = new Map<string, Set<string>>()
  for (const link of graphLinks) {
    for (const [near, farEnd] of [
      [link.fromId, link.toId],
      [link.toId, link.fromId],
    ] as const) {
      const other = far.get(farEnd)
      if (!byId.has(near) || other === undefined) continue
      if (other.deletedAt !== null || other.workspaceId !== workspaceId) continue
      if ((GRAPH_KINDS as readonly string[]).includes(other.kind)) continue
      const set = otherLinked.get(near) ?? new Set<string>()
      set.add(farEnd)
      otherLinked.set(near, set)
    }
  }

  const node = (record: PanelRecord, carriedBy: string[], blockIds: string[]): ProjectGraphNode => ({
    id: record.id,
    kind: record.kind as ProjectGraphNode['kind'],
    title: record.title,
    summary: record.summary,
    state: stateWordOf(record),
    parentId: carriedBy.length === 1 ? (carriedBy[0] ?? null) : null,
    carriedBy,
    blockIds,
    otherRecords: otherLinked.get(record.id)?.size ?? 0,
  })

  let missingBlocks = 0
  const blockNodes = blocks.map((block) => node(block, carriers.get(block.id) ?? [], []))
  const pipelineNodes = pipelines.map((pipeline) => {
    const stored = blockIdsOf(pipeline)
    const live = stored.filter((id) => blockIdSet.has(id))
    missingBlocks += stored.length - live.length
    const carriedBy: string[] = []
    for (const id of live) for (const module of carriers.get(id) ?? []) if (!carriedBy.includes(module)) carriedBy.push(module)
    return node(pipeline, carriedBy, live)
  })
  const moduleNodes = modules.map((module) => node(module, [], []))

  // ---- revisions: one grouped statement over the whole project, then the newest real rows of the graph's records
  const isBaseline = eq(revisions.op, BASELINE)
  const grouped = db
    .select({
      recordId: revisions.recordId,
      versions: count(),
      baselines: sql<number>`coalesce(sum(case when ${isBaseline} then 1 else 0 end), 0)`,
      firstAt: min(revisions.at),
      lastAt: max(revisions.at),
    })
    .from(revisions)
    .where(eq(revisions.workspaceId, workspaceId))
    .groupBy(revisions.recordId)
    .all()

  const drawn = new Set([...moduleNodes, ...pipelineNodes, ...blockNodes].map((one) => one.id))
  const groupedById = new Map(grouped.map((row) => [row.recordId, row]))
  let revisionsTotal = 0
  let realTotal = 0
  let baselinesTotal = 0
  let graphReal = 0
  let recordsWithRealHistory = 0
  let baselineOnlyRecords = 0
  for (const row of grouped) {
    const real = row.versions - row.baselines
    revisionsTotal += row.versions
    realTotal += real
    baselinesTotal += row.baselines
    if (real > 0) recordsWithRealHistory += 1
    // EVERY REVISION OF THE RECORD IS A MIGRATION BASELINE, however many there are: one baseline is not the only
    // shape a baseline-only record takes. Counting only `versions === 1` hid a record whose baseline had been
    // written more than once, and the page then drew it as a record with real history. Its own summary below agrees.
    if (row.versions > 0 && real === 0) baselineOnlyRecords += 1
    if (byId.has(row.recordId)) graphReal += real
  }

  const summaries: ProjectGraphRevisionSummary[] = []
  for (const record of read) {
    const row = groupedById.get(record.id)
    const versions = row?.versions ?? 0
    const baselines = row?.baselines ?? 0
    const real = versions - baselines
    if (!drawn.has(record.id) && real === 0) continue
    summaries.push({
      recordId: record.id,
      title: record.title,
      kind: record.kind,
      versions,
      baselines,
      real,
      firstAt: row?.firstAt ?? null,
      lastAt: row?.lastAt ?? null,
      baselineOnly: versions > 0 && real === 0,
    })
  }

  const ofTheGraph = and(
    eq(revisions.workspaceId, workspaceId),
    ne(revisions.op, BASELINE),
    eq(records.workspaceId, workspaceId),
    inArray(records.kind, [...GRAPH_KINDS]),
    isNull(records.deletedAt),
  )
  const entries: ProjectGraphRevisionEntry[] = db
    .select({ recordId: revisions.recordId, seq: revisions.seq, at: revisions.at, op: revisions.op, title: revisions.title })
    .from(revisions)
    .innerJoin(records, eq(records.id, revisions.recordId))
    .where(ofTheGraph)
    .orderBy(desc(revisions.at), desc(revisions.seq), desc(revisions.id))
    .limit(PROJECT_GRAPH_REVISION_ROWS)
    .all()

  // ---- checkpoints: each stopping point, with the records its `about` links name
  let stopsWithoutWords = 0
  const checkpoints: ProjectGraphCheckpoint[] = []
  for (const stop of ofKind(STOPPING_POINT)) {
    const doing = wordsOf(stop.data, FIELD.doing)
    const next = wordsOf(stop.data, FIELD.next)
    if (doing === null || next === null) {
      stopsWithoutWords += 1
      continue
    }
    checkpoints.push({
      id: stop.id,
      title: stop.title,
      summary: stop.summary,
      at: stop.createdAt,
      doing,
      next,
      changed: wordsOf(stop.data, FIELD.changed),
      remains: wordsOf(stop.data, FIELD.remains),
      failed: wordsOf(stop.data, FIELD.failed),
      learned: wordsOf(stop.data, FIELD.learned),
      stoppedAtRecord: wordsOf(stop.data, FIELD.stoppedAtRecord),
      stoppedAtRevision: wordsOf(stop.data, FIELD.stoppedAtRevision),
      aboutIds: graphLinks.filter((link) => link.type === ABOUT && link.fromId === stop.id).map((link) => link.toId),
    })
  }

  // ---- futures: each trajectory with its planned states in order, and each direction
  const plannedStates = new Map(ofKind(PLANNED_STATE).map((state) => [state.id, state]))
  let statesNotDrawn = 0
  let outcomesInDoubt = 0
  const plannedState = (id: string): ProjectGraphPlannedState | null => {
    const record = plannedStates.get(id)
    const what = record === undefined ? null : wordsOf(record.data, FIELD.what)
    if (record === undefined || what === null) {
      statesNotDrawn += 1
      return null
    }
    const realised = graphLinks.filter((link) => link.type === REALISES && link.toId === id)
    const instead = graphLinks.filter((link) => link.type === INSTEAD_OF && link.toId === id)
    if (realised.length > 0 && instead.length > 0) outcomesInDoubt += 1
    const by = realised.length > 0 && instead.length === 0 ? realised[0] : instead.length > 0 && realised.length === 0 ? instead[0] : undefined
    return {
      id,
      title: record.title,
      summary: record.summary,
      what,
      outcome: by === undefined ? null : by.type === REALISES ? 'realised' : 'answered-instead',
      byId: by?.fromId ?? null,
      byTitle: by === undefined ? null : titleOf(by.fromId),
    }
  }

  const drawable = new Set<string>([MODULE, PIPELINE, BLOCK])
  const futures: ProjectGraphFuture[] = []
  for (const future of [...ofKind(TRAJECTORY), ...ofKind(DIRECTION)].sort(byCreation)) {
    const isTrajectory = future.kind === TRAJECTORY
    const touching = graphLinks.filter((link) => link.fromId === future.id || link.toId === future.id)
    const target = isTrajectory
      ? touching.find((link) => link.type === PLANS_FOR && link.fromId === future.id)?.toId
      : touching
          .map((link) => (link.fromId === future.id ? link.toId : link.fromId))
          .find((id) => drawable.has(byId.get(id)?.kind ?? ''))
    const depth = isTrajectory ? null : depthReading(future.data)
    const { edges, drawn: edgesDrawn } = isTrajectory ? readEdges(future.data) : { edges: [], drawn: false }
    futures.push({
      id: future.id,
      kind: isTrajectory ? TRAJECTORY : DIRECTION,
      title: future.title,
      summary: future.summary,
      targetId: target ?? null,
      because: isTrajectory ? wordsOf(future.data, FIELD.because) : null,
      paused: readPaused(future.data),
      shelved: isTrajectory ? null : readShelf(future.data),
      depth:
        depth === null || depth.depth === null || depth.rung === null
          ? null
          : { depth: depth.depth, rung: depth.rung, rungs: depth.rungs },
      question: isTrajectory ? null : wordsOf(future.data, FIELD.question),
      whatIsNotKnown: isTrajectory ? null : wordsOf(future.data, FIELD.whatIsNotKnown),
      next: isTrajectory ? null : wordsOf(future.data, FIELD.directionNext),
      blockedOn: isTrajectory ? null : wordsOf(future.data, FIELD.blockedOn),
      states: isTrajectory
        ? stringsOf(future.data, FIELD.plannedStateIds)
            .map(plannedState)
            .filter((state): state is ProjectGraphPlannedState => state !== null)
        : [],
      edges,
      edgesDrawn,
    })
  }
  const named = new Set(ofKind(TRAJECTORY).flatMap((trajectory) => stringsOf(trajectory.data, FIELD.plannedStateIds)))
  const statesWithoutAFuture = [...plannedStates.keys()].filter((id) => !named.has(id)).length

  // ---- plans: every plan with a line about one of the graph's records, and only those lines; the rest are counted
  const lineRows = readInPieces(graphIds, (piece) => db.select().from(planLines).where(inArray(planLines.recordId, piece)).all())
  const planIds = [...new Set(lineRows.map((line) => line.planId))]
  const planRows = readInPieces(planIds, (piece) =>
    db
      .select({ id: plans.id, title: plans.title, state: plans.state, createdAt: plans.createdAt })
      .from(plans)
      .where(inArray(plans.id, piece))
      .all(),
  )
  const linesOfThosePlans = readInPieces(
    planRows.map((plan) => plan.id),
    (piece) => db.select({ n: count() }).from(planLines).where(inArray(planLines.planId, piece)).all(),
  ).reduce((sum, row) => sum + row.n, 0)
  const plansStored = db.select({ n: count() }).from(plans).get()?.n ?? 0
  // Plans in the order they were made, oldest first, as the records are; the pieces each sorted only their own rows.
  const graphPlans: ProjectGraphPlan[] = planRows
    .sort((one, other) => (one.createdAt !== other.createdAt ? (one.createdAt < other.createdAt ? -1 : 1) : one.id < other.id ? -1 : 1))
    .map((plan) => ({
      id: plan.id,
      title: plan.title,
      state: plan.state,
      lines: lineRows
        .filter((line) => line.planId === plan.id)
        .sort((one, other) => one.position - other.position)
        .map((line) => ({ id: line.id, planId: line.planId, text: line.text, recordId: line.recordId, position: line.position })),
    }))

  // ---- schedules: windows and allocations of the graph's records that overlap today to the span's end
  const span = theScheduleSpan()
  const windowRows = readInPieces(graphIds, (piece) => db.select().from(workWindows).where(inArray(workWindows.recordId, piece)).all())
  const windows: ProjectGraphWindow[] = windowRows
    .filter((window) => window.startsOn <= span.to && window.endsOn >= span.from)
    .sort((one, other) => (one.startsOn < other.startsOn ? -1 : one.startsOn > other.startsOn ? 1 : one.id < other.id ? -1 : 1))
    .map((window) => ({
      id: window.id,
      recordId: window.recordId,
      recordTitle: titleOf(window.recordId),
      startsOn: window.startsOn,
      endsOn: window.endsOn,
      state: window.state,
      note: window.note,
    }))
  const allocationRows = readInPieces(graphIds, (piece) => db.select().from(allocations).where(inArray(allocations.recordId, piece)).all())
  const graphAllocations: ProjectGraphAllocation[] = allocationRows
    .filter((allocation) => {
      const period = parsePeriod(allocation.period)
      return period !== null && period.to >= span.from && period.from <= span.to
    })
    .sort((one, other) => (one.period < other.period ? -1 : one.period > other.period ? 1 : one.id < other.id ? -1 : 1))
    .map((allocation) => ({
      id: allocation.id,
      recordId: allocation.recordId,
      recordTitle: titleOf(allocation.recordId),
      period: allocation.period,
      plannedHours: allocation.plannedHours,
      actualHours: allocation.actualHours,
      state: allocation.state,
    }))

  // ---- counts, from what was read
  const trajectories = futures.filter((future) => future.kind === TRAJECTORY).length
  const counts = {
    modules: moduleNodes.length,
    pipelines: pipelineNodes.length,
    blocks: blockNodes.length,
    records: moduleNodes.length + pipelineNodes.length + blockNodes.length,
    revisions: revisionsTotal,
    realRevisions: realTotal,
    baselines: baselinesTotal,
    checkpoints: checkpoints.length,
    trajectories,
    directions: futures.length - trajectories,
    plannedStates: futures.reduce((sum, future) => sum + future.states.length, 0),
    plans: graphPlans.length,
    windows: windows.length,
    allocations: graphAllocations.length,
  }

  // ---- what this read does not hold, and what it left out
  const says: string[] = []
  const empty =
    counts.records + counts.checkpoints + futures.length + counts.plans + counts.windows + counts.allocations === 0
  if (empty) says.push(PROJECT_GRAPH_SAYS.empty())
  if (revisionsTotal > 0 && realTotal === 0) says.push(PROJECT_GRAPH_SAYS.pastIsABaseline(revisionsTotal))
  if (realTotal > 0 && baselineOnlyRecords > 0) says.push(PROJECT_GRAPH_SAYS.someRecordsOnlyABaseline(baselineOnlyRecords))
  const elsewhereReal = realTotal - graphReal
  if (elsewhereReal > 0) says.push(PROJECT_GRAPH_SAYS.realElsewhere(elsewhereReal))
  const leftOut = graphReal - entries.length
  if (leftOut > 0) says.push(PROJECT_GRAPH_SAYS.revisionsLeftOut(leftOut, entries.length))
  if (plansStored > graphPlans.length) says.push(PROJECT_GRAPH_SAYS.plansWithoutALine(plansStored - graphPlans.length))
  const linesLeftOut = linesOfThosePlans - graphPlans.reduce((sum, plan) => sum + plan.lines.length, 0)
  if (linesLeftOut > 0) says.push(PROJECT_GRAPH_SAYS.planLinesLeftOut(linesLeftOut))
  if (windowRows.length > windows.length) {
    says.push(PROJECT_GRAPH_SAYS.windowsOutside(windowRows.length - windows.length, PROJECT_GRAPH_SCHEDULE_DAYS))
  }
  if (allocationRows.length > graphAllocations.length) {
    says.push(PROJECT_GRAPH_SAYS.allocationsOutside(allocationRows.length - graphAllocations.length, PROJECT_GRAPH_SCHEDULE_DAYS))
  }
  const countedOthers = new Set<string>()
  for (const one of [...moduleNodes, ...pipelineNodes, ...blockNodes]) for (const id of otherLinked.get(one.id) ?? []) countedOthers.add(id)
  if (countedOthers.size > 0) says.push(PROJECT_GRAPH_SAYS.otherRecordsCounted(countedOthers.size))
  const carriedTwice = [...pipelineNodes, ...blockNodes].filter((one) => one.carriedBy.length > 1).length
  if (carriedTwice > 0) says.push(PROJECT_GRAPH_SAYS.carriedByMoreThanOne(carriedTwice))
  if (missingBlocks > 0) says.push(PROJECT_GRAPH_SAYS.missingBlocks(missingBlocks))
  if (outcomesInDoubt > 0) says.push(PROJECT_GRAPH_SAYS.outcomeInDoubt(outcomesInDoubt))
  if (stopsWithoutWords > 0) says.push(PROJECT_GRAPH_SAYS.stopsWithoutWords(stopsWithoutWords))
  if (statesNotDrawn > 0) says.push(PROJECT_GRAPH_SAYS.statesNotDrawn(statesNotDrawn))
  if (statesWithoutAFuture > 0) says.push(PROJECT_GRAPH_SAYS.statesWithoutAFuture(statesWithoutAFuture))

  return {
    workspaceId,
    sourceIndexBuilt: sourceIndexIsBuilt(workspaceId),
    modules: moduleNodes,
    pipelines: pipelineNodes,
    blocks: blockNodes,
    revisions: {
      summaries,
      entries,
      leftOut,
      elsewhereReal,
      recordsWithRealHistory,
      baselineOnlyRecords,
    },
    checkpoints,
    futures,
    plans: graphPlans,
    windows,
    allocations: graphAllocations,
    links: graphLinks,
    counts,
    says,
  }
}
