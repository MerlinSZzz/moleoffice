// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN INVENTORY READING OVER THE FLOW REGISTER, FOR THE STEWARD.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS READING EXISTS
 * ---------------------------------------------------------------------------------------
 *
 * Proposal 1LaCQBRYRjls option A. The
 * register answers "what are the office's flows" one record each, and `GET /api/records?kind=flow`
 * already lists them. What the steward of the three-day inventory needs in one call, though, is
 * which of those flows have PROBLEM records attached — the count nobody has to add up in a browser.
 * Problems links what they name through the `about` link type
 * (types.ts: the problem, finding or piece of work, to the module or thing it concerns), so this
 * reading joins deliberately: every open link of type `about` landing on each flow, counted, only
 * where the head end is a live `problem` record.
 *
 * ---------------------------------------------------------------------------------------
 * NOTHING HERE IS A SECOND READER OF ANYTHING
 * ---------------------------------------------------------------------------------------
 *
 * The flows are `listRecords` with kind `flow`, the same list the records door and the record page
 * answer from. The links are `allLinks`, the same walk the attention rule reads. The kind of a
 * link's head end comes from the records themselves, read once — not from any cached copy — so a
 * deleted record drops out of the answer and a problem in another project can never be counted
 * here: both ends are resolved inside one workspace.
 *
 * IT WRITES NOTHING, AND NOTHING IS CHECKED AGAINST A FLOW. The proposal says no gate, in as many
 * words; a flow here is counted, never judged.
 */

import { and, asc, desc, eq, inArray, isNull, sql, type SQL } from 'drizzle-orm'
import type { PanelRecord } from '@shared/types.ts'
import { idsIn } from '@shared/flow-steps.ts'
import { reaches, type FlowAppliesTo } from '@shared/flow-applies-to.ts'
import type { FlowRetired } from '@shared/flow-retired.ts'
import {
  FLOW_RUN_DAYS,
  LATEST_FLOW_RUNS,
  type FlowListPage,
  type FlowListRow,
  type FlowReplacedRow,
  type FlowRead,
  type FlowRunRead,
  type FlowRunsPage,
  type FlowSort,
  type FlowStageRead,
} from '@shared/flows.ts'
import { localStamp } from '@shared/time.ts'
import type { Workspace } from '@shared/workspaces.ts'
import { db, sqlite } from '../db/client.ts'
import { piecesOf, readInPieces } from '../db/in-pieces.ts'
import { records, STORED_FIELDS } from '../db/schema.ts'
import { foldTheSecondLevel } from '@shared/second-level-fold.ts'
import { theHandbooksOnAFlow, type HandbooksAReaderMayRead } from './handbooks.ts'
import type { AMessageReader } from './messages.ts'
import { allLinks, listRecords, versionOf } from './records.ts'
import { isRetired } from '../db/is-retired.ts'
import { isReplaced } from '../db/is-replaced.ts'

/** One flow as the steward reads it, with its problems attached. */
export interface FlowInventoryRow {
  id: string
  title: string
  declared_in: unknown
  /** How many live `problem` records link to this flow through `about`. Zero is a real answer. */
  problems: number
  /** The problems themselves, newest first order as the links were read. Mostly one. */
  problemIds: string[]
}

/** The reply GET /api/flows serves. */
export interface FlowInventory {
  count: number
  flows: FlowInventoryRow[]
}

/**
 * THE ONE SENTENCE A FLOW WITH NO PROBLEM SAYS, computed, not stored: the count of zero is a real
 * answer and the caller reads it as one. This file does not restate any of the inventory's words
 * beyond the count itself.
 */
export function readFlowInventory(workspaceId: string): FlowInventory {
  const flows = listRecords({ workspaceId, kind: 'flow' })
  const inWorkspace = listRecords({ workspaceId })
  const kindOf = new Map<string, PanelRecord['kind']>(inWorkspace.map((record) => [record.id, record.kind]))

  const problemsByFlow = new Map<string, string[]>()
  for (const link of allLinks(workspaceId)) {
    if (link.type !== 'about') continue
    if (kindOf.get(link.toId) !== 'flow') continue
    if (kindOf.get(link.fromId) !== 'problem') continue
    const held = problemsByFlow.get(link.toId) ?? []
    if (!held.includes(link.fromId)) held.push(link.fromId)
    problemsByFlow.set(link.toId, held)
  }

  return {
    count: flows.length,
    flows: flows.map((flow) => {
      const problemIds = problemsByFlow.get(flow.id) ?? []
      return {
        id: flow.id,
        title: flow.title,
        declared_in: flow.data['declared_in'],
        problems: problemIds.length,
        problemIds,
      }
    }),
  }
}

// ---------------------------------------------------------------------------------------
// THE FLOWS PAGE'S READS. The second came in wave 13p round 33.
// ---------------------------------------------------------------------------------------
//
// THE INVENTORY ABOVE READS EVERY RECORD OF ITS PROJECT AND EVERY LINK, and stays as it is for the steward, who sends
// none of the page's words. The reads below are for a page that must stay fast with ten times today's flows, so each
// reads only what its answer holds:
//   - a page of flows reads the flows' light fields in SQL, and counts runs only for the flows it needs: the page's
//     flows when it is ordered by title, the matched flows when it is ordered by their runs;
//   - a flow's runs are found through the index of migration 0212 on a run's `flow`, never by reading the runs whole;
//   - problems are counted only for the page's flows, and only when `?with=problems` asks.
//
// A RUN IS COUNTED IN WHICHEVER PROJECT IT WAS FILED. A flow run is filed in its session's project and names its flow
// by id, so a flow of Mole Office run from a session in another project is still that flow's run. No rule keeps a
// reader out of a project today (src/server/lib/across-projects.ts), so no run is left out of a count.

/** A run's `flow`, read the way migration 0212's index reads it, so the index is the one the reads below use. */
const RUN_FLOW = STORED_FIELDS.flowRunFlow(records.data)

/** What JSON text a flow holds at a path, when it is text; anything else reads as null. */
const textAt = (path: string): SQL<string | null> =>
  sql<string | null>`(CASE WHEN json_valid(${records.data}) AND json_type(${records.data}, ${path}) = 'text' THEN json_extract(${records.data}, ${path}) END)`

/** How many runs named each of these flows, how many in the last `FLOW_RUN_DAYS` days, and when the newest was filed. */
function runCountsOf(flowIds: readonly string[], now: Date): Map<string, { count: number; runs30d: number; lastRunAt: string | null }> {
  const counts = new Map<string, { count: number; runs30d: number; lastRunAt: string | null }>()
  if (flowIds.length === 0) return counts
  const since = localStamp(new Date(now.getTime() - FLOW_RUN_DAYS * 24 * 60 * 60 * 1000))
  // IN PIECES (src/server/db/in-pieces.ts): a page ordered by runs, and the general and the replaced flows, count every
  // matched flow, and nothing caps how many there are. A run names one flow, so each flow's group is whole in one piece.
  const rows = readInPieces(flowIds, (piece) =>
    db
      .select({
        flow: sql<string>`${RUN_FLOW}`,
        count: sql<number>`count(*)`,
        runs30d: sql<number>`coalesce(sum(${records.createdAt} >= ${since}), 0)`,
        lastRunAt: sql<string | null>`max(${records.createdAt})`,
      })
      .from(records)
      .where(and(eq(records.kind, sql`'flow_run'`), inArray(RUN_FLOW, piece), isNull(records.deletedAt)))
      .groupBy(RUN_FLOW)
      .all(),
  )
  for (const row of rows) counts.set(row.flow, { count: Number(row.count), runs30d: Number(row.runs30d), lastRunAt: row.lastRunAt })
  return counts
}

/**
 * HOW MANY RUNS FILED IN THESE PROJECTS NAMED NO FLOW, found through migration 0212's index, whose first column is a
 * run's `flow`: a run that named none holds null there.
 */
function runsNamingNoFlowIn(projectIds: readonly string[]): number {
  // IN PIECES (src/server/db/in-pieces.ts): a reader may ask for every project, and nothing caps how many there are. A
  // run is filed in one project, so it is counted in one piece only, and the pieces' counts are added.
  let runs = 0
  for (const piece of piecesOf(projectIds)) {
    // 'flow_run' is written into the SQL, not bound: SQLite uses a partial index only when its WHERE is met by a literal.
    const where = and(eq(records.kind, sql`'flow_run'`), isNull(RUN_FLOW), isNull(records.deletedAt), inArray(records.workspaceId, piece))
    runs += Number(db.select({ n: sql<number>`count(*)` }).from(records).where(where).get()?.n ?? 0)
  }
  return runs
}

/**
 * THE LIVE PROBLEMS THAT LINK TO EACH OF THESE FLOWS WITH `about`, in the order the links were made. Read the way the
 * inventory above reads them: the link, the problem and the flow are all in one project.
 */
function problemsOf(flowIds: readonly string[]): Map<string, string[]> {
  const found = new Map<string, string[]>()
  if (flowIds.length === 0) return found
  // IN PIECES (src/server/db/in-pieces.ts): the general and the replaced flows are read with no page cut, and nothing
  // caps how many there are. Every link to one flow is in the piece that names it, so each flow's problems keep the
  // order of their links; only the order of the map's keys differs, and every caller looks a flow up by its id.
  const rows = readInPieces(flowIds, (piece) =>
    sqlite
      .prepare(
        `SELECT l.to_id AS flow, l.from_id AS problem FROM links l
         JOIN records p ON p.id = l.from_id AND p.workspace_id = l.workspace_id
         JOIN records f ON f.id = l.to_id AND f.workspace_id = l.workspace_id
        WHERE l.type = 'about' AND l.to_id IN (${piece.map(() => '?').join(',')})
          AND p.kind = 'problem' AND p.deleted_at IS NULL AND f.kind = 'flow'
        ORDER BY l.rowid`,
      )
      .all(...piece) as { flow: string; problem: string }[],
  )
  for (const row of rows) {
    const held = found.get(row.flow) ?? []
    if (!held.includes(row.problem)) held.push(row.problem)
    found.set(row.flow, held)
  }
  return found
}

/** What a page of flows is asked for, as the door read it. */
export interface FlowPageAsked {
  projects: readonly Workspace[]
  /** Every project the reader may read, which the general flows are read from whichever projects were asked. */
  everyProject: readonly Workspace[]
  q: string
  sort: FlowSort
  limit: number
  offset: number
  withProblems: boolean
  /** The role card `?role=` names, or null when no role is asked. */
  role: { name: string; rung: number | null } | null
  /** Whether `?replaced=show` asks for the replaced flows themselves. */
  showReplaced: boolean
  /** The request for the page that starts at this offset, as the door would be asked for it. */
  nextAt: (offset: number) => string
}

export { isReplaced } from '../db/is-replaced.ts'
export { isRetired } from '../db/is-retired.ts'

/** Whether the page folds a flow: a live flow supersedes it, or it is retired. */
const isFolded = sql`(${isReplaced} OR ${isRetired})`

/** Whether a flow's `applies_to.scope` is general. */
const isGeneral = sql`coalesce(${textAt('$.applies_to.scope')}, '') = 'general'`

/** A flow's `applies_to` as JSON text, or null when it holds none. */
const appliesToText = sql<string | null>`(CASE WHEN json_valid(${records.data}) AND json_type(${records.data}, '$.applies_to') = 'object' THEN json_extract(${records.data}, '$.applies_to') END)`

const light = {
  id: records.id,
  project: records.workspaceId,
  title: records.title,
  runsBy: textAt('$.runs'),
  trigger: textAt('$.trigger'),
  stages: sql<number>`(CASE WHEN json_valid(${records.data}) AND json_type(${records.data}, '$.stages') = 'array' THEN json_array_length(${records.data}, '$.stages') ELSE 0 END)`,
  appliesTo: appliesToText,
}

type LightRow = { id: string; project: string; title: string; runsBy: string | null; trigger: string | null; stages: number; appliesTo: string | null }

/** The flows of these projects, live, matching the search. */
function flowsIn(projectIds: readonly string[], q: string, ...more: SQL[]): SQL | undefined {
  const search = q.trim()
  return and(
    eq(records.kind, 'flow'),
    isNull(records.deletedAt),
    inArray(records.workspaceId, [...projectIds]),
    search === '' ? undefined : sql`${records.title} LIKE ${`%${search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`} ESCAPE '\\'`,
    ...more,
  )
}

const appliesToOf = (row: LightRow): FlowAppliesTo | null => (row.appliesTo === null ? null : (JSON.parse(row.appliesTo) as FlowAppliesTo))

/**
 * THE ROWS OF ONE GROUP IN THE PAGE'S ORDER, with their run counts, and how many matched. Ordered by title with no role
 * asked, the rows are cut in SQL and runs are counted for them only. Ordered by runs or by the newest run, the runs of
 * every matched flow are counted through the index, because the order needs them. With a role asked, every matched
 * flow is read and kept when `reaches` says it reaches the role, so the rule is worked out in one place.
 */
function aGroup(where: SQL | undefined, asked: FlowPageAsked, cut: { limit: number; offset: number } | null, now: Date) {
  let rows: LightRow[]
  let matched: number
  let counts: ReturnType<typeof runCountsOf>
  if (asked.sort === 'name' && asked.role === null) {
    matched = Number(db.select({ n: sql<number>`count(*)` }).from(records).where(where).get()?.n ?? 0)
    const ordered = db.select(light).from(records).where(where).orderBy(asc(records.title), asc(records.id))
    rows = cut === null ? ordered.all() : ordered.limit(cut.limit).offset(cut.offset).all()
    counts = runCountsOf(rows.map((row) => row.id), now)
  } else {
    let every = db.select(light).from(records).where(where).all()
    const role = asked.role
    if (role !== null) every = every.filter((row) => { const to = appliesToOf(row); return to !== null && reaches(to, role) })
    matched = every.length
    counts = runCountsOf(asked.sort === 'name' ? [] : every.map((row) => row.id), now)
    const of = (id: string) => counts.get(id) ?? { count: 0, runs30d: 0, lastRunAt: null }
    const byLast = (a: string, b: string) => (of(b).lastRunAt ?? '').localeCompare(of(a).lastRunAt ?? '')
    const byRuns = (a: string, b: string) => of(b).runs30d - of(a).runs30d
    const byTitle = (a: LightRow, b: LightRow) => (a.title < b.title ? -1 : a.title > b.title ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
    every.sort((a, b) =>
      asked.sort === 'name'
        ? byTitle(a, b)
        : (asked.sort === 'runs' ? byRuns(a.id, b.id) || byLast(a.id, b.id) : byLast(a.id, b.id) || byRuns(a.id, b.id)) || byTitle(a, b),
    )
    rows = cut === null ? every : every.slice(cut.offset, cut.offset + cut.limit)
    if (asked.sort === 'name') counts = runCountsOf(rows.map((row) => row.id), now)
  }
  const problems = asked.withProblems ? problemsOf(rows.map((row) => row.id)) : null
  const flows = rows.map((row): FlowListRow => {
    const runs = counts.get(row.id)
    const one: FlowListRow = {
      id: row.id,
      project: row.project,
      title: row.title,
      runsBy: row.runsBy,
      trigger: row.trigger,
      stages: Number(row.stages),
      runs30d: runs?.runs30d ?? 0,
      lastRunAt: runs?.lastRunAt ?? null,
      appliesTo: appliesToOf(row),
    }
    if (problems !== null) {
      const problemIds = problems.get(row.id) ?? []
      one.problems = problemIds.length
      one.problemIds = problemIds
    }
    return one
  })
  return { flows, matched }
}

/** The live flows that supersede each of these, by title. */
function replacersOf(flowIds: readonly string[]): Map<string, FlowReplacedRow['replacedBy']> {
  const found = new Map<string, FlowReplacedRow['replacedBy']>()
  if (flowIds.length === 0) return found
  // IN PIECES (src/server/db/in-pieces.ts): every replaced flow is read with no page cut, and nothing caps how many there
  // are. Every link to one old flow is in the piece that names it, so each flow's replacers keep SQLite's order by title,
  // then id; only the order of the map's keys differs, and every caller looks a flow up by its id.
  const rows = readInPieces(flowIds, (piece) =>
    sqlite
      .prepare(
        `SELECT l.to_id AS old, n.id AS id, n.title AS title, n.workspace_id AS project FROM links l
         JOIN records n ON n.id = l.from_id
        WHERE l.type = 'supersedes' AND l.to_id IN (${piece.map(() => '?').join(',')}) AND n.kind = 'flow' AND n.deleted_at IS NULL
        ORDER BY n.title, n.id`,
      )
      .all(...piece) as { old: string; id: string; title: string; project: string }[],
  )
  for (const row of rows) {
    const held = found.get(row.old) ?? []
    if (!held.some((one) => one.id === row.id)) held.push({ id: row.id, title: row.title, project: row.project })
    found.set(row.old, held)
  }
  return found
}

/** The retired mark of each of these flows that carries one. */
function retiredMarksOf(flowIds: readonly string[]): Map<string, FlowRetired> {
  const found = new Map<string, FlowRetired>()
  if (flowIds.length === 0) return found
  // IN PIECES (src/server/db/in-pieces.ts): every replaced flow is read with no page cut, and nothing caps how many there
  // are. The rows go into a map by id, so the order of the pieces does not matter.
  const rows = readInPieces(flowIds, (piece) =>
    db
      .select({ id: records.id, retired: sql<string>`json_extract(${records.data}, '$.retired')` })
      .from(records)
      .where(and(inArray(records.id, piece), isRetired))
      .all(),
  )
  for (const row of rows) found.set(row.id, JSON.parse(row.retired) as FlowRetired)
  return found
}

/**
 * A PAGE OF FLOWS IN THESE PROJECTS, with each flow's run counts. `q` is looked for in the title, as typed, with no
 * wildcard of its own. Three groups, wave 13p round 40: each project's own current
 * flows, which are paged; the general ones, from every project; and the replaced ones, counted, and handed back only
 * when asked. Round 40b folds a retired flow with the replaced ones, and counts the retired ones apart.
 */
export function readAPageOfFlows(asked: FlowPageAsked, now: Date = new Date()): FlowListPage {
  const projectIds = asked.projects.map((workspace) => workspace.id)
  const page: FlowListPage = {
    flows: [],
    matched: 0,
    returned: 0,
    left: 0,
    next: null,
    projects: projectIds,
    sort: asked.sort,
    runsNamingNoFlow: 0,
    general: { flows: [], matched: 0 },
    replaced: { matched: 0, retired: 0, flows: null },
    notClassified: null,
  }
  const everyId = asked.everyProject.map((workspace) => workspace.id)
  if (everyId.length > 0) page.general = aGroup(flowsIn(everyId, asked.q, sql`NOT ${isFolded}`, isGeneral), asked, null, now)
  if (projectIds.length === 0) return page
  page.runsNamingNoFlow = runsNamingNoFlowIn(projectIds)
  const own = aGroup(flowsIn(projectIds, asked.q, sql`NOT ${isFolded}`, sql`NOT ${isGeneral}`), asked, { limit: asked.limit, offset: asked.offset }, now)
  page.flows = own.flows
  page.matched = own.matched
  if (asked.role !== null) {
    const unsaid = flowsIn(projectIds, asked.q, sql`NOT ${isFolded}`, sql`${appliesToText} IS NULL`)
    page.notClassified = Number(db.select({ n: sql<number>`count(*)` }).from(records).where(unsaid).get()?.n ?? 0)
  }
  const replaced = flowsIn(projectIds, asked.q, isFolded)
  const retired = Number(db.select({ n: sql<number>`count(*)` }).from(records).where(flowsIn(projectIds, asked.q, isRetired)).get()?.n ?? 0)
  if (asked.showReplaced) {
    const all = aGroup(replaced, { ...asked, sort: 'name', role: null }, null, now)
    const ids = all.flows.map((row) => row.id)
    const by = replacersOf(ids)
    const marks = retiredMarksOf(ids)
    page.replaced = {
      matched: all.matched,
      retired,
      flows: all.flows.map((row) => ({ ...row, replacedBy: by.get(row.id) ?? [], retired: marks.get(row.id) ?? null })),
    }
  } else {
    page.replaced = { matched: Number(db.select({ n: sql<number>`count(*)` }).from(records).where(replaced).get()?.n ?? 0), retired, flows: null }
  }
  page.returned = page.flows.length
  page.left = Math.max(0, page.matched - asked.offset - page.returned)
  page.next = page.left > 0 ? asked.nextAt(asked.offset + page.returned) : null
  return page
}

const isObject = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value)

/** One flow run as the Flows page draws it, from the light fields its row was read with. */
function aRunRead(row: { id: string; project: string; at: string; run: string | null; steps: string | null }): FlowRunRead {
  let steps: unknown[] = []
  if (row.steps !== null) {
    const parsed: unknown = JSON.parse(row.steps)
    if (Array.isArray(parsed)) steps = parsed
  }
  const last = steps.at(-1)
  const recorded = steps
    .filter(isObject)
    .filter((step) => typeof step['n'] === 'number' && typeof step['outcome'] === 'string')
    .map((step) => ({ n: step['n'] as number, outcome: step['outcome'] as string }))
  return {
    id: row.id,
    run: row.run,
    project: row.project,
    at: row.at,
    steps: steps.length,
    outcome: isObject(last) && typeof last['outcome'] === 'string' ? last['outcome'] : null,
    stagesRecorded: recorded.length > 0 ? recorded : null,
  }
}

/** A flow's runs, newest first, found through migration 0212's index; and how many there are. */
function runsOf(flowId: string, limit: number, offset: number): { runs: FlowRunRead[]; matched: number } {
  // 'flow_run' is written into the SQL, not bound: SQLite uses a partial index only when its WHERE is met by a literal.
  const where = and(eq(records.kind, sql`'flow_run'`), eq(RUN_FLOW, flowId), isNull(records.deletedAt))
  const matched = Number(db.select({ n: sql<number>`count(*)` }).from(records).where(where).get()?.n ?? 0)
  const rows = db
    .select({
      id: records.id,
      project: records.workspaceId,
      at: records.createdAt,
      run: textAt('$.run'),
      steps: sql<string | null>`(CASE WHEN json_valid(${records.data}) AND json_type(${records.data}, '$.stepsTaken') = 'array' THEN json_extract(${records.data}, '$.stepsTaken') END)`,
    })
    .from(records)
    .where(where)
    .orderBy(desc(records.createdAt), desc(records.id))
    .limit(limit)
    .offset(offset)
    .all()
  return { runs: rows.map(aRunRead), matched }
}

/** A PAGE OF ONE FLOW'S RUNS, newest first. The door has already found the flow. */
export function readAFlowsRuns(flowId: string, limit: number, offset: number, nextAt: (offset: number) => string): FlowRunsPage {
  const { runs, matched } = runsOf(flowId, limit, offset)
  const left = Math.max(0, matched - offset - runs.length)
  return { flow: flowId, runs, matched, returned: runs.length, left, next: left > 0 ? nextAt(offset + runs.length) : null }
}

/**
 * ONE FLOW'S MAIN CONTENT AND ITS LATEST RUNS. Each stage's why and sources and the flow's record of changes are the
 * second level: left out, and said to be left out, until `asked`. Its handbooks are the ones the
 * reader may read, and the answer counts the rest in `narrowedByPermission`.
 */
export function readOneFlow(
  flow: PanelRecord,
  asked: boolean,
  askPath: string,
  reader: AMessageReader,
  now: Date = new Date(),
): FlowRead & Pick<HandbooksAReaderMayRead<unknown>, 'narrowedByPermission'> {
  const version = versionOf(flow)
  const folded = foldTheSecondLevel(flow, asked, askPath)
  const data = isObject(folded.record.data) ? folded.record.data : {}
  const text = (key: string): string | null => (typeof data[key] === 'string' ? data[key] : null)
  const stages: FlowStageRead[] = (Array.isArray(data['stages']) ? data['stages'] : []).filter(isObject).map((stage) => {
    const read: FlowStageRead = {
      n: typeof stage['n'] === 'number' ? stage['n'] : null,
      does: typeof stage['does'] === 'string' ? stage['does'] : '',
      evidence: typeof stage['evidence'] === 'string' ? stage['evidence'] : null,
    }
    if (asked) {
      read.why = typeof stage['why'] === 'string' ? stage['why'] : null
      read.sources = idsIn(stage['sources'])
    }
    return read
  })
  const counts = runCountsOf([flow.id], now).get(flow.id) ?? { count: 0, runs30d: 0, lastRunAt: null }
  const handbooks = theHandbooksOnAFlow(flow.id, reader)
  const one: FlowRead & Pick<HandbooksAReaderMayRead<unknown>, 'narrowedByPermission'> = {
    id: flow.id,
    project: flow.workspaceId,
    title: flow.title,
    version,
    runsBy: text('runs'),
    trigger: text('trigger'),
    leavesBehind: text('leaves_behind'),
    declaredIn: text('declared_in'),
    governedBy: text('governed_by'),
    reviewedAt: text('reviewed_at'),
    appliesTo: isObject(data['applies_to']) ? (data['applies_to'] as unknown as FlowAppliesTo) : null,
    stages,
    runs: counts,
    latestRuns: runsOf(flow.id, LATEST_FLOW_RUNS, 0).runs,
    handbooks: handbooks.handbooks,
    secondLevel: folded.secondLevel,
    narrowedByPermission: handbooks.narrowedByPermission,
  }
  if (asked) one.stepChanges = Array.isArray(data['step_changes']) ? data['step_changes'] : []
  return one
}
