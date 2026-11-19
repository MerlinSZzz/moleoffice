// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PROJECT BOARD, WORKED OUT WHEN IT IS ASKED AND NEVER STORED. What it answers is described field by field in
 * src/shared/project-board.ts.
 *
 * ---------------------------------------------------------------------------------------
 * WHERE EACH PART COMES FROM
 * ---------------------------------------------------------------------------------------
 *
 *   rows          the steps of the project's master pipeline (src/server/lib/master-pipeline.ts), in their order.
 *   under a row   every pipeline that is `part_of` the row's step, or `part_of` a pipeline or step already under
 *                 it, at any depth, and the steps of those pipelines. Found one level at a time by `links_to_idx`.
 *   unfinished    a step under the row whose state is not `done`. The architecture steps are `done`, so they never
 *                 count and need no rule of their own.
 *   stalled       `theWorkHasStoppedShort` in src/shared/work.ts, the attention list's own rule.
 *   since         `sinceARecordHeldItsState` in src/shared/attention.ts, the attention list's own dating: the change
 *                 that put the step in its state, else the step's updated stamp.
 *   acting        a run that sent the office a request within `idleReminderHours()`, found by `api_calls_at_idx`.
 *                 A run that has ended, and a run that runs no model (the round launcher, the merge tool), is left
 *                 out. A run is under a row by its own `part_of` or `relates_to` link to the row's step, to a
 *                 pipeline or step under it, or to a record that `implements` one of those.
 *   packages      open tasks with `data.package`, under a row by `package.moduleIds` or by their points' files.
 *   backlog       backlog items in state `todo` or `doing`, under a row by their files.
 *   landings      main's first-parent commits of the last 7 days that land work: a queue commit, with the footer
 *                 `landingMessage` in src/shared/merge/landed-history.mjs writes, or a merge commit. Under a row by
 *                 the files they changed against main's commit before them.
 *   files         a file reaches a row through the implementation map: a stated row whose pattern matches it
 *                 (`filesMatching`, as GET /api/implementation/resource reads it), whose record is under the row or
 *                 `implements` a step under it.
 *
 * NO QUERY READS A WHOLE TABLE. Each read names the ids or the time it wants and is answered by an index:
 * tests/the-project-board-reads-no-whole-table.test.ts holds every statement to that.
 */
import { and, eq, inArray, isNotNull } from 'drizzle-orm'

import { readStateSince, sinceARecordHeldItsState } from '@shared/attention.ts'
import { blockIdsOf } from '@shared/blocks.ts'
import { aRunRunsNoModel } from '@shared/check-eligibility.ts'
import { parseDueStamp } from '@shared/due-stamps.ts'
import { filesMatching } from '@shared/paths.ts'
import {
  BOARD_GROUPS,
  theLineOfAHandle,
  type BoardBacklogItem,
  type BoardGroup,
  type BoardLanding,
  type BoardLandings,
  type BoardLine,
  type BoardPackage,
  type BoardRecord,
  type BoardRow,
  type BoardRun,
  type BoardStep,
  type ProjectBoard,
} from '@shared/project-board.ts'
import { localStamp, parseLocalStamp } from '@shared/time.ts'
import type { PanelRecord } from '@shared/types.ts'
import { theWorkHasEnded, theWorkHasStoppedShort } from '@shared/work.ts'

import { db, sqlite } from '../db/client.ts'
import { readInPieces } from '../db/in-pieces.ts'
import { changes } from '../db/schema.ts'
import { idleReminderHours } from '../db/env.ts'
import { statedInRepository } from '../db/stated-in-repository.ts'
import { theRunHasEnded } from './keys.ts'
import { theMasterPipeline } from './master-pipeline.ts'
import { getRecordsWithIds, liveRecordsOfKinds } from './records.ts'
import { listRepositories } from '../db/list-repositories.ts'
import { readGit } from './resources.ts'
import { whyGitDidNotAnswer } from '@shared/why-git-did-not-answer.ts'

const DAY_MS = 86_400_000
/** Landings are counted over 7 days. */
const LANDINGS_OVER_DAYS = 7
/** View B's "Landed, last 24 h": one day, read as a rolling 24 hours. */
const LANDED_LATELY_HOURS = 24

/** A record as the board names it. */
function named(record: PanelRecord): BoardRecord {
  return { id: record.id, title: record.title }
}

import { liveHere } from '@shared/live-here.ts'
export { liveHere } from '@shared/live-here.ts'

/** Add one value to the set kept under a key. Answers whether it was new. */
function addTo<K, V>(map: Map<K, Set<V>>, key: K, value: V): boolean {
  const set = map.get(key)
  if (set === undefined) {
    map.set(key, new Set([value]))
    return true
  }
  if (set.has(value)) return false
  set.add(value)
  return true
}

import { linksFrom, linksTo } from '../db/links-to-and-from.ts'
export { linksFrom, linksTo } from '../db/links-to-and-from.ts'

// ============================================================================ what is under each row

/** Every pipeline and step under the rows, with the rows each is under, and the pipeline each step is in. */
interface UnderTheRows {
  rowsOf: Map<string, Set<string>>
  pipelines: Map<string, PanelRecord>
  steps: Map<string, PanelRecord>
  pipelineOfStep: Map<string, PanelRecord>
}

/**
 * WALK DOWN FROM THE ROWS, ONE LEVEL AT A TIME. Each level reads the `part_of` links into what the last level found,
 * keeps the live pipelines of this project among their sources, and adds those pipelines' steps. A record already
 * under a row is not walked again for that row, so a loop of `part_of` links ends.
 */
function whatIsUnderTheRows(project: string, rows: readonly PanelRecord[]): UnderTheRows {
  const under: UnderTheRows = { rowsOf: new Map(), pipelines: new Map(), steps: new Map(), pipelineOfStep: new Map() }
  let level = new Map<string, Set<string>>(rows.map((row) => [row.id, new Set([row.id])]))
  while (level.size > 0) {
    const partOf = linksTo(level.keys(), 'part_of')
    const sources = getRecordsWithIds(new Set(partOf.map((link) => link.fromId)))
    const next = new Map<string, Set<string>>()
    const newPipelines = new Map<string, PanelRecord>()
    for (const link of partOf) {
      const pipeline = sources.get(link.fromId)
      if (!liveHere(pipeline, project) || pipeline.kind !== 'pipeline') continue
      for (const row of level.get(link.toId) ?? []) {
        if (!addTo(under.rowsOf, pipeline.id, row)) continue
        addTo(next, pipeline.id, row)
        under.pipelines.set(pipeline.id, pipeline)
        newPipelines.set(pipeline.id, pipeline)
      }
    }
    const stepIds = [...newPipelines.values()].flatMap((pipeline) => blockIdsOf(pipeline))
    const steps = getRecordsWithIds(new Set(stepIds))
    for (const pipeline of newPipelines.values()) {
      for (const id of blockIdsOf(pipeline)) {
        const step = steps.get(id)
        if (!liveHere(step, project) || step.kind !== 'block') continue
        under.steps.set(step.id, step)
        under.pipelineOfStep.set(step.id, pipeline)
        for (const row of under.rowsOf.get(pipeline.id) ?? []) {
          if (addTo(under.rowsOf, step.id, row)) addTo(next, step.id, row)
        }
      }
    }
    level = next
  }
  return under
}

/**
 * THE ROWS A RECORD REACHES: a row's own step, a pipeline or step under a row, or a record that `implements` a step
 * under a row or a row's step. Empty when it reaches none.
 */
type RowsOfARecord = (id: string) => ReadonlySet<string>

function theRowsOfARecord(rows: readonly PanelRecord[], under: UnderTheRows): RowsOfARecord {
  const reached = new Map<string, Set<string>>()
  for (const row of rows) addTo(reached, row.id, row.id)
  for (const [id, set] of under.rowsOf) for (const row of set) addTo(reached, id, row)
  const implementers = linksTo([...rows.map((row) => row.id), ...under.steps.keys()], 'implements')
  for (const link of implementers) for (const row of reached.get(link.toId) ?? []) addTo(reached, link.fromId, row)
  const none: ReadonlySet<string> = new Set()
  return (id) => reached.get(id) ?? none
}

// ============================================================================ unfinished steps

/** The unfinished steps under the rows, each with its age, by step id. */
function theUnfinishedSteps(under: UnderTheRows, nowMs: number): Map<string, BoardStep> {
  const unfinished = [...under.steps.values()].filter((step) => step.data['state'] !== 'done')
  const rows = readInPieces(
    unfinished.map((step) => step.id),
    (piece) =>
      db
        .select({ field: changes.field, newValue: changes.newValue, recordId: changes.recordId, at: changes.at })
        .from(changes)
        .where(and(inArray(changes.recordId, piece), eq(changes.field, 'data.state'), isNotNull(changes.newValue)))
        .all(),
  )
  const since = readStateSince(rows, new Map(unfinished.map((step) => [step.id, step])))
  const out = new Map<string, BoardStep>()
  for (const step of unfinished) {
    const { at, source } = sinceARecordHeldItsState(step, since)
    const atMs = parseLocalStamp(at)
    if (atMs === null) throw new Error(`The step ${step.id} has a stamp the board cannot read, "${at}", so its age is not known.`)
    out.set(step.id, {
      ...named(step),
      state: typeof step.data['state'] === 'string' ? step.data['state'] : '',
      pipeline: named(under.pipelineOfStep.get(step.id)!),
      since: at,
      sinceFrom: source,
      days: Math.floor((nowMs - atMs) / DAY_MS),
      stalled: theWorkHasStoppedShort(step.data, nowMs, parseDueStamp),
    })
  }
  return out
}

// ============================================================================ the runs that act now

/** A run that acts now, and the time of its newest request. */
interface AnActingRun {
  run: PanelRecord
  newestRequestMs: number
}

/**
 * THE RUNS THAT ACT NOW, with each one's newest request. One statement reads the requests of the last
 * `withinHours` through `api_calls_at_idx`, which INDEXED BY names, so SQLite refuses the statement rather than read
 * the table some other way. Only the runs found there are read, by id.
 */
function theRunsActingNow(project: string, nowMs: number, withinHours: number): AnActingRun[] {
  const found = sqlite
    .prepare(
      'SELECT session_id AS sessionId, MAX(at_ms) AS atMs FROM api_calls INDEXED BY api_calls_at_idx ' +
        'WHERE at_ms >= ? AND session_id IS NOT NULL GROUP BY session_id',
    )
    .all(nowMs - withinHours * 3_600_000) as { sessionId: string; atMs: number }[]
  const newest = new Map(found.map((row) => [row.sessionId, row.atMs]))
  const acting: AnActingRun[] = []
  for (const run of getRecordsWithIds(newest.keys()).values()) {
    if (!liveHere(run, project) || run.kind !== 'session') continue
    if (theRunHasEnded(run.data['state']) || aRunRunsNoModel(run.data)) continue
    acting.push({ run, newestRequestMs: newest.get(run.id)! })
  }
  return acting
}

function aBoardRun({ run, newestRequestMs }: AnActingRun): BoardRun {
  const served = run.data['servingAgent']
  const handle = typeof served === 'string' && served.trim() !== '' ? served.trim() : null
  return { ...named(run), agent: handle, line: theLineOfAHandle(handle), newestRequest: localStamp(new Date(newestRequestMs)) }
}

// ============================================================================ the files, and the landings

/** One stated row of the implementation map that reaches a row, with the rows it reaches. */
interface AStatedPlace {
  pattern: string
  rows: ReadonlySet<string>
}

/** The stated rows of every repository of the project that reach a row. */
function theStatedPlaces(project: string, repositories: readonly { id: string }[], rowsOf: RowsOfARecord): AStatedPlace[] {
  const places: AStatedPlace[] = []
  for (const repository of repositories) {
    for (const stated of statedInRepository(repository.id, project)) {
      const rows = rowsOf(stated.recordId)
      if (rows.size > 0) places.push({ pattern: stated.pattern, rows })
    }
  }
  return places
}

/** The rows each of these files reaches through the stated places. */
function theRowsOfFiles(paths: ReadonlySet<string>, places: readonly AStatedPlace[]): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>()
  const list = [...paths]
  for (const place of places) {
    for (const path of filesMatching(place.pattern, list)) for (const row of place.rows) addTo(out, path, row)
  }
  return out
}

/** One commit on main's first-parent line, as git gave it. */
interface AFirstParentCommit {
  commit: string
  parents: string[]
  atMs: number
  subject: string
  body: string
  files: string[]
}

const RECORD = '\x1e'
const FIELD = '\x1f'

/** Main's first-parent commits since a moment, newest first, each with the files it changed against its first parent. */
function theFirstParentCommits(root: string, sinceMs: number): AFirstParentCommit[] {
  const out = readGit(root, [
    'log',
    '--first-parent',
    '--diff-merges=first-parent',
    '--name-only',
    `--since=@${String(Math.floor(sinceMs / 1000))}`,
    `--format=${RECORD}%H${FIELD}%P${FIELD}%ct${FIELD}%s${FIELD}%b${FIELD}`,
    'refs/heads/main',
  ]).toString('utf8')
  return out
    .split(RECORD)
    .filter((part) => part.trim() !== '')
    .map((part) => {
      const [commit, parents, at, subject, body, files] = part.split(FIELD)
      return {
        commit: commit!,
        parents: parents!.split(' ').filter((one) => one !== ''),
        atMs: Number(at) * 1000,
        subject: subject!,
        body: body!,
        files: (files ?? '').split('\n').filter((one) => one.trim() !== ''),
      }
    })
    .filter((one) => one.atMs >= sinceMs)
}

/**
 * THE AUTHOR NAMES OF THE COMMITS EACH MERGE BROUGHT IN, for the merges among `merges`, oldest first. One read lists
 * every commit main reached after `base`; each merge then takes the commits reachable from its other parents that no
 * earlier merge took and that are not on the first-parent line.
 */
function theAuthorsEachMergeBroughtIn(root: string, base: string, merges: readonly AFirstParentCommit[], firstParent: ReadonlySet<string>): Map<string, Set<string>> {
  const out = readGit(root, ['log', `--format=${RECORD}%H${FIELD}%P${FIELD}%an`, 'refs/heads/main', `^${base}`]).toString('utf8')
  const graph = new Map<string, { parents: string[]; author: string }>()
  for (const part of out.split(RECORD)) {
    if (part.trim() === '') continue
    const [commit, parents, author] = part.split(FIELD)
    graph.set(commit!, { parents: parents!.split(' ').filter((one) => one !== ''), author: author!.trim() })
  }
  const taken = new Set<string>()
  const authors = new Map<string, Set<string>>()
  for (const merge of [...merges].sort((a, b) => a.atMs - b.atMs)) {
    const names = new Set<string>()
    const waiting = merge.parents.slice(1)
    while (waiting.length > 0) {
      const commit = waiting.pop()!
      const node = graph.get(commit)
      if (node === undefined || taken.has(commit) || firstParent.has(commit)) continue
      taken.add(commit)
      names.add(node.author)
      waiting.push(...node.parents)
    }
    authors.set(merge.commit, names)
  }
  return authors
}

/** The landings of the last 7 days, read from every repository of the project with a folder. */
function theLandings(
  repositories: readonly { id: string; name: string; root: string | null }[],
  places: readonly AStatedPlace[],
  nowMs: number,
): BoardLandings {
  if (repositories.length === 0) return { state: 'not-read', because: 'no-repository', detail: null }
  const withAFolder = repositories.filter((repository) => repository.root !== null && repository.root.trim() !== '')
  if (withAFolder.length === 0) return { state: 'not-read', because: 'no-folder', detail: null }
  const sinceMs = nowMs - LANDINGS_OVER_DAYS * DAY_MS
  const latelyMs = nowMs - LANDED_LATELY_HOURS * 3_600_000
  const read: { id: string; name: string; main: string }[] = []
  const commits: { root: string; one: AFirstParentCommit; how: 'queue' | 'merge' | 'other' }[] = []
  for (const repository of withAFolder) {
    const root = repository.root!
    try {
      const main = readGit(root, ['rev-parse', 'refs/heads/main']).toString('utf8').trim()
      read.push({ id: repository.id, name: repository.name, main })
      for (const one of theFirstParentCommits(root, sinceMs)) {
        const how = /^Mole-landing:/mu.test(one.body) ? 'queue' : one.parents.length > 1 ? 'merge' : 'other'
        commits.push({ root, one, how })
      }
    } catch (error) {
      return { state: 'not-read', because: 'git-did-not-answer', detail: `${repository.name}: ${whyGitDidNotAnswer(error)}` }
    }
  }

  // THE LINES OF THE LATE LANDINGS: a queue commit's run names its handle; a merge's brought-in commits name theirs.
  const lately = commits.filter((entry) => entry.how !== 'other' && entry.one.atMs >= latelyMs)
  const runIds = lately.flatMap((entry) => (entry.how === 'queue' ? [/^Run: (\S+)$/mu.exec(entry.one.body)?.[1]].filter((id): id is string => id !== undefined) : []))
  const runs = getRecordsWithIds(new Set(runIds))
  const authorsOf = new Map<string, Set<string>>()
  for (const root of new Set(lately.map((entry) => entry.root))) {
    const here = commits.filter((entry) => entry.root === root)
    const lateHere = here.filter((entry) => entry.one.atMs >= latelyMs)
    const oldest = lateHere.at(-1)?.one
    const base = oldest?.parents[0]
    const merges = lateHere.filter((entry) => entry.how === 'merge').map((entry) => entry.one)
    if (base === undefined || merges.length === 0) continue
    for (const [commit, names] of theAuthorsEachMergeBroughtIn(root, base, merges, new Set(here.map((entry) => entry.one.commit)))) authorsOf.set(commit, names)
  }
  const linesOf = (entry: (typeof commits)[number]): string[] | null => {
    if (entry.one.atMs < latelyMs) return null
    if (entry.how === 'queue') {
      const run = runs.get(/^Run: (\S+)$/mu.exec(entry.one.body)?.[1] ?? '')
      const handle = run === undefined ? null : typeof run.data['servingAgent'] === 'string' ? run.data['servingAgent'] : null
      const line = theLineOfAHandle(handle)
      return line === null ? [] : [line]
    }
    const lines = [...(authorsOf.get(entry.one.commit) ?? [])].map(theLineOfAHandle).filter((line): line is string => line !== null)
    return [...new Set(lines)].sort()
  }

  const rowsOfFiles = theRowsOfFiles(new Set(commits.flatMap((entry) => entry.one.files)), places)
  const landings: BoardLanding[] = commits
    .filter((entry) => entry.how !== 'other')
    .map((entry) => ({
      commit: entry.one.commit,
      at: localStamp(new Date(entry.one.atMs)),
      subject: entry.one.subject,
      how: entry.how as 'queue' | 'merge',
      lines: linesOf(entry),
      rows: [...new Set(entry.one.files.flatMap((path) => [...(rowsOfFiles.get(path) ?? [])]))].sort(),
    }))
    .sort((a, b) => b.at.localeCompare(a.at))
  const otherCommits = commits
    .filter((entry) => entry.how === 'other')
    .map((entry) => ({ commit: entry.one.commit, at: localStamp(new Date(entry.one.atMs)), subject: entry.one.subject }))
  return { state: 'read', repositories: read, landings, otherCommits, perDay: perDay(landings, sinceMs, nowMs) }
}

/** Landings on each local day the window touches, oldest first, with the days that had none. */
function perDay(landings: readonly BoardLanding[], sinceMs: number, nowMs: number): { day: string; landings: number }[] {
  const days: { day: string; landings: number }[] = []
  const first = new Date(sinceMs)
  for (let day = new Date(first.getFullYear(), first.getMonth(), first.getDate()); day.getTime() <= nowMs; day.setDate(day.getDate() + 1)) {
    days.push({ day: localStamp(day).slice(0, 10), landings: 0 })
  }
  for (const landing of landings) {
    const entry = days.find((one) => one.day === landing.at.slice(0, 10))
    if (entry !== undefined) entry.landings += 1
  }
  return days
}

// ============================================================================ the whole board

/** The group a row is in: see BOARD_GROUPS in src/shared/project-board.ts. */
function theGroupOf(row: Pick<BoardRow, 'pipelines' | 'unfinished' | 'acting'>, someRunIsUnderNoRow: boolean): BoardGroup {
  if (row.pipelines.length === 0) return 'no-pipeline'
  const unfinished = row.unfinished.length > 0
  const nobodyHere = row.acting.length === 0
  if (unfinished && nobodyHere && !someRunIsUnderNoRow) return 'nobody-on-it'
  if (row.unfinished.some((step) => step.stalled)) return 'stalled'
  if (unfinished && nobodyHere) return 'not-known'
  return 'moving-or-done'
}

/** Sorted by group, then by the row's place in the master pipeline. */
function inGroupOrder(rows: BoardRow[]): BoardRow[] {
  const place = new Map(rows.map((row, index) => [row.id, index]))
  return [...rows].sort((a, b) => BOARD_GROUPS.indexOf(a.group) - BOARD_GROUPS.indexOf(b.group) || place.get(a.id)! - place.get(b.id)!)
}

/** A backlog item as the board names it, or null when its state is neither `todo` nor `doing`. */
function anOpenItem(item: PanelRecord): BoardBacklogItem | null {
  const state = item.data['state']
  if (state !== 'todo' && state !== 'doing') return null
  return { ...named(item), line: typeof item.data['line'] === 'string' ? item.data['line'] : '', state }
}

function stringsOf(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((one): one is string => typeof one === 'string') : []
}

/** READ ONE PROJECT'S BOARD AS IT STANDS NOW. A project that is not there is the master reader's coded 404. */
export function readTheProjectBoard(project: string, nowMs: number = Date.now()): ProjectBoard {
  const master = theMasterPipeline(project)
  const withinHours = idleReminderHours()
  const masterRecord = master.state === 'marked' ? getRecordsWithIds([master.id]).get(master.id) : undefined
  const rowIds = masterRecord === undefined ? [] : blockIdsOf(masterRecord)
  const rowRecords = getRecordsWithIds(new Set(rowIds))
  const rows = rowIds.map((id) => rowRecords.get(id)).filter((row): row is PanelRecord => liveHere(row, project) && row.kind === 'block')

  const under = whatIsUnderTheRows(project, rows)
  const rowsOf = theRowsOfARecord(rows, under)
  const unfinished = theUnfinishedSteps(under, nowMs)

  const actingNow = theRunsActingNow(project, nowMs, withinHours)
  const acting = actingNow.map((one) => one.run)
  const runRows = new Map<string, Set<string>>()
  for (const link of linksFrom(acting.map((run) => run.id), ['part_of', 'relates_to'])) {
    for (const row of rowsOf(link.toId)) addTo(runRows, link.fromId, row)
  }
  const boardRuns = new Map(actingNow.map((one) => [one.run.id, aBoardRun(one)]))

  const repositories = listRepositories(project)
  const places = theStatedPlaces(project, repositories, rowsOf)
  const backlogRecords = liveRecordsOfKinds(project, ['backlog_item'])
  const openItems = new Map<string, BoardBacklogItem>()
  for (const item of backlogRecords) {
    const open = anOpenItem(item)
    if (open !== null) openItems.set(item.id, open)
  }
  const itemFiles = new Map(backlogRecords.map((item) => [item.id, stringsOf(item.data['files'])]))
  const rowsOfFiles = theRowsOfFiles(new Set([...itemFiles.values()].flat()), places)
  const rowsOfItem = (id: string): Set<string> => new Set((itemFiles.get(id) ?? []).flatMap((path) => [...(rowsOfFiles.get(path) ?? [])]))

  const packages: { board: BoardPackage; rows: Set<string> }[] = []
  for (const task of liveRecordsOfKinds(project, ['task'])) {
    const bundle = task.data['package']
    if (bundle === null || typeof bundle !== 'object' || Array.isArray(bundle) || theWorkHasEnded(task.data)) continue
    const fields = bundle as Record<string, unknown>
    const reached = new Set<string>()
    for (const id of stringsOf(fields['moduleIds'])) for (const row of rowsOf(id)) reached.add(row)
    for (const id of stringsOf(fields['pointIds'])) for (const row of rowsOfItem(id)) reached.add(row)
    packages.push({ board: { ...named(task), lines: stringsOf(fields['lines']) }, rows: reached })
  }

  const landings = theLandings(repositories, places, nowMs)
  const someRunIsUnderNoRow = acting.some((run) => !runRows.has(run.id))
  const boardRows: BoardRow[] = rows.map((row) => {
    const pipelines = [...under.pipelines.values()].filter((pipeline) => under.rowsOf.get(pipeline.id)?.has(row.id) === true).map(named)
    const steps = [...unfinished.values()]
      .filter((step) => under.rowsOf.get(step.id)?.has(row.id) === true)
      .sort((a, b) => a.since.localeCompare(b.since))
    const runsHere = acting.filter((run) => runRows.get(run.id)?.has(row.id) === true).map((run) => boardRuns.get(run.id)!)
    const landed = landings.state === 'read' ? landings.landings.filter((landing) => landing.rows.includes(row.id)) : null
    const facts = {
      ...named(row),
      pipelines,
      unfinished: steps,
      acting: runsHere,
      agents: [...new Set(runsHere.map((run) => run.agent).filter((agent): agent is string => agent !== null))].sort(),
      packages: packages.filter((one) => one.rows.has(row.id)).map((one) => one.board),
      backlog: [...openItems.values()].filter((item) => rowsOfItem(item.id).has(row.id)),
      landings7Days: landed === null ? null : landed.length,
      lastLanding: landed === null ? null : (landed[0]?.at ?? null),
    }
    return { ...facts, group: theGroupOf(facts, someRunIsUnderNoRow) }
  })

  return {
    project,
    at: localStamp(new Date(nowMs)),
    master,
    actingWithinHours: withinHours,
    rows: inGroupOrder(boardRows),
    actingUnderNoRow: acting.filter((run) => !runRows.has(run.id)).map((run) => boardRuns.get(run.id)!),
    landings,
    lines: theLines([...boardRuns.values()], packages.map((one) => one.board), [...openItems.values()], landings),
    backlogWithNoState: backlogRecords.filter((item) => item.data['state'] === undefined || item.data['state'] === null).length,
  }
}

/** View B: each line any part of the board names, with null, "line not recorded", last. */
function theLines(runs: BoardRun[], packages: BoardPackage[], items: BoardBacklogItem[], landings: BoardLandings): BoardLine[] {
  const lately = landings.state === 'read' ? landings.landings.filter((landing) => landing.lines !== null) : []
  const names = new Set<string | null>([
    ...runs.map((run) => run.line),
    ...packages.flatMap((one) => one.lines),
    ...items.filter((item) => item.state === 'todo').map((item) => item.line),
    ...lately.flatMap((landing) => (landing.lines!.length === 0 ? [null] : landing.lines!)),
  ])
  const ordered = [...names].sort((a, b) => (a === null ? 1 : b === null ? -1 : a.localeCompare(b, 'en', { numeric: true })))
  return ordered.map((line) => ({
    line,
    landed: lately.filter((landing) => (line === null ? landing.lines!.length === 0 : landing.lines!.includes(line))),
    now: runs.filter((run) => run.line === line),
    next: line === null ? [] : packages.filter((one) => one.lines.includes(line)),
    later: line === null ? [] : items.filter((item) => item.state === 'todo' && item.line === line),
  }))
}
