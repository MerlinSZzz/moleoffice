// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PACKAGE'S WORKERS, READ FROM THE RECORDS AND NOT FROM A SECOND STORE. Round FQ, point OP-3.
 *
 * A worker start names the package it works on, and the office keeps that on the supervisor's ask (`package`) and
 * copies it onto the worker's own run (`workerPackage`) when the run is filed. This file reads both places and joins
 * them into one row per worker, so:
 *
 *   - a package's page lists every worker it was given to, including an ask whose worker's run was never filed, and
 *   - a day's read gives the same list for every package asked for work on that day.
 *
 * NOTHING IS COUNTED FROM WHAT A WORKER SAID. Tokens are the run's own `usageReceipt`, added by the office's one
 * summation (`receiptsFromRuns`); a run with no receipt says its tokens were not read, and is never counted as zero.
 * Minutes are the office's own times: the run's `startedAt` (or when the office filed it) and its `closedAt`. A result
 * went back when the package's own `handedBack` list holds an entry whose `run` is the worker's run.
 *
 * THE QUERIES NAME THE INDEXES OF MIGRATION 0350. A worker run is found by `workerPackage.task`; a day's packages are
 * found by `workerPackage.askedAt` as a range. An ask whose worker was never filed has no worker run, so it is found
 * through the supervisor's `workerRuns` field and the index of migration 0296, and its own planned package is read from
 * the entry.
 */
import { STORED_FIELDS, theWordsOfAStoredField } from '../db/schema.ts'
import { sqlite } from '../db/client.ts'
import { readParticipant } from '../db/read-participant.ts'
import { getRecord } from './records.ts'
import { packageOf } from './delegation.ts'
import { PanelError } from './panel-error.ts'
import { receiptsFromRuns } from './usage-receipts.ts'
import { priceTableInForce } from './price-table.ts'
import { parseLocalStamp } from '@shared/time.ts'
import { theRunHasEnded } from '@shared/run-has-ended.ts'
import { WORKER_RUNS, readTheWorkerPackage, readTheWorkerRun, type TheWorkerRun, type WorkerRunState } from '@shared/worker-runs.ts'
import type { PanelRecord } from '@shared/types.ts'
import type { UsageReceipt } from '@shared/usage-receipts.ts'
import type {
  APackageAskedOnADay,
  APackageLeftOutOfADay,
  AWorkerOfAPackage,
  TheMinutesAWorkerRan,
  TheTokensAWorkerUsed,
  TheWorkersOfADay,
  TheWorkersOfAPackage,
} from '@shared/package-workers.ts'

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const text = (value: unknown): string | null => (typeof value === 'string' && value.trim() !== '' ? value : null)

/** One stored worker run, as the two reads below need it. */
interface AWorkerRunRow {
  id: string
  title: string
  createdAt: string
  data: Record<string, unknown>
}

/** One stored ask on a supervisor's run, with the run that holds it. */
interface AnAskedWorkerRow {
  run: string
  runTitle: string
  agentId: string
  entry: TheWorkerRun
}

/** Every worker run filed for one package, oldest ask first. The WHERE is `records_session_worker_package_task_idx`. */
function workerRunsOf(taskId: string, workspaceId: string): AWorkerRunRow[] {
  return sqlite
    .prepare(
      'SELECT id, title, created_at AS createdAt, data FROM records ' +
        "WHERE kind = 'session' AND workspace_id = ? AND deleted_at IS NULL " +
        `AND ${theWordsOfAStoredField(STORED_FIELDS.sessionWorkerPackageTask, 'records.data')} = ? ` +
        "ORDER BY json_extract(data, '$.workerPackage.askedAt') ASC, id ASC",
    )
    .all(workspaceId, taskId)
    .map((row) => row as { id: string; title: string; createdAt: string; data: string })
    .map((row) => ({ id: String(row.id), title: String(row.title), createdAt: String(row.createdAt), data: JSON.parse(String(row.data)) as Record<string, unknown> }))
}

/** The asks for one package kept on supervisor runs, the run each is on, oldest ask first. */
function asksOf(taskId: string, workspaceId: string): AnAskedWorkerRow[] {
  return sqlite
    .prepare(
      'SELECT records.id AS run, records.title AS runTitle, entry.key AS agentId, entry.value AS entry ' +
        "FROM records, json_each(records.data, '$.workerRuns') AS entry " +
        "WHERE records.kind = 'session' AND records.workspace_id = ? AND records.deleted_at IS NULL " +
        `AND ${theWordsOfAStoredField(STORED_FIELDS.sessionHoldsWorkerRuns, 'records.data')} ` +
        "AND json_extract(entry.value, '$.package.task') = ? " +
        "ORDER BY json_extract(entry.value, '$.package.askedAt') ASC, records.id ASC, entry.key ASC",
    )
    .all(workspaceId, taskId)
    .map((row) => row as { run: string; runTitle: string; agentId: string; entry: string })
    .flatMap((row) => {
      const entry = readTheWorkerRun(JSON.parse(String(row.entry)))
      return entry === null ? [] : [{ run: String(row.run), runTitle: String(row.runTitle), agentId: String(row.agentId), entry }]
    })
}

/** Every worker run whose package was asked for on a day, by the first ask that put it there. */
function workerRunsAskedOn(day: string, workspaceId: string): Map<string, string> {
  const from = `${day} 00:00:00`
  const to = `${theNextDay(day)} 00:00:00`
  const rows = sqlite
    .prepare(
      'SELECT ' +
        `${theWordsOfAStoredField(STORED_FIELDS.sessionWorkerPackageTask, 'records.data')} AS task, ` +
        `MIN(${theWordsOfAStoredField(STORED_FIELDS.sessionWorkerPackageAskedAt, 'records.data')}) AS askedAt ` +
        "FROM records WHERE kind = 'session' AND workspace_id = ? AND deleted_at IS NULL " +
        `AND ${theWordsOfAStoredField(STORED_FIELDS.sessionWorkerPackageTask, 'records.data')} IS NOT NULL ` +
        `AND ${theWordsOfAStoredField(STORED_FIELDS.sessionWorkerPackageAskedAt, 'records.data')} >= ? ` +
        `AND ${theWordsOfAStoredField(STORED_FIELDS.sessionWorkerPackageAskedAt, 'records.data')} < ? ` +
        'GROUP BY task',
    )
    .all(workspaceId, from, to) as { task: string; askedAt: string }[]
  return new Map(rows.map((row) => [String(row.task), String(row.askedAt)]))
}

/** Every package asked for on a day whose worker was never filed, from the supervisors' own entries. */
function asksAskedOn(day: string, workspaceId: string): Map<string, string> {
  const from = `${day} 00:00:00`
  const to = `${theNextDay(day)} 00:00:00`
  const rows = sqlite
    .prepare(
      'SELECT entry.value AS entry ' +
        "FROM records, json_each(records.data, '$.workerRuns') AS entry " +
        "WHERE records.kind = 'session' AND records.workspace_id = ? AND records.deleted_at IS NULL " +
        `AND ${theWordsOfAStoredField(STORED_FIELDS.sessionHoldsWorkerRuns, 'records.data')} ` +
        "AND json_extract(entry.value, '$.package.askedAt') >= ? AND json_extract(entry.value, '$.package.askedAt') < ? ",
    )
    .all(workspaceId, from, to)
    .map((row) => row as { entry: string })
    .map((row) => JSON.parse(String(row.entry)) as Record<string, unknown>)
  const found = new Map<string, string>()
  for (const entry of rows) {
    const asked = readTheWorkerPackage(entry['package'])
    if (asked === null) continue
    const before = found.get(asked.task)
    if (before === undefined || asked.askedAt < before) found.set(asked.task, asked.askedAt)
  }
  return found
}

const theNextDay = (day: string): string => {
  // A CALENDAR DAY, NOT TWENTY-FOUR HOURS: a day the clocks change is 23 or 25 hours long, and the range still has to
  // cover the whole local day and nothing of the next.
  const [year, month, date] = day.split('-').map(Number)
  if (year === undefined || month === undefined || date === undefined) return day
  const next = new Date(year, month - 1, date + 1)
  return `${String(next.getFullYear())}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`
}

/**
 * Whether a day is one the office can read: `YYYY-MM-DD`, and a real day. The route asks this before the reader, so a
 * refusal names the form rather than returning a page of nothing.
 */
export function isADay(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  return parseLocalStamp(`${value} 00:00:00`) !== null
}

/** The tokens a worker's run used, from its own receipt and by the office's one summation, or why not. */
function theTokensOf(run: AWorkerRunRow | null, price: ReturnType<typeof priceTableInForce>): TheTokensAWorkerUsed {
  if (run === null) {
    return { input: null, output: null, total: null, read: false, notRead: 'No run was filed for this ask, so its tokens were not read.' }
  }
  const receipt = isObject(run.data['usageReceipt']) ? (run.data['usageReceipt'] as UsageReceipt) : null
  if (receipt === null) {
    return { input: null, output: null, total: null, read: false, notRead: "The run's record has no usage receipt, so its tokens were not read." }
  }
  const overall = receiptsFromRuns([{ id: run.id, data: run.data }], price).overall
  const input = overall.values.inputTokens ?? null
  const output = overall.values.outputTokens ?? null
  const missing: string[] = []
  if (typeof receipt.inputTokens !== 'number') missing.push('The receipt gives no input tokens.')
  else if (input === null) missing.push("The receipt does not say whether its input tokens include cache reads, so its input tokens were not counted.")
  if (typeof receipt.outputTokens !== 'number') missing.push('The receipt gives no output tokens.')
  if (text(receipt.says) !== null) missing.push(receipt.says!)
  return {
    input,
    output,
    total: input !== null && output !== null ? input + output : null,
    read: true,
    notRead: missing.length === 0 ? null : missing.join(' '),
  }
}

/** The minutes a worker's run took, by the office's own start and end, or why not. */
function theMinutesOf(run: AWorkerRunRow | null): TheMinutesAWorkerRan {
  if (run === null) {
    return { startedAt: null, endedAt: null, minutes: null, running: false, notCounted: 'No run was filed for this ask, so its minutes were not counted.' }
  }
  const startedAt = text(run.data['startedAt']) ?? run.createdAt
  const endedAt = text(run.data['closedAt'])
  const state = text(run.data['state'])
  if (!theRunHasEnded(state)) {
    return { startedAt, endedAt: null, minutes: null, running: true, notCounted: 'The run is still going, so its minutes are not complete and are not counted.' }
  }
  if (endedAt === null) {
    return { startedAt, endedAt: null, minutes: null, running: false, notCounted: 'The run has ended, and its record names no closed time, so its minutes were not counted.' }
  }
  const from = parseLocalStamp(startedAt)
  const to = parseLocalStamp(endedAt)
  if (from === null || to === null) {
    return { startedAt, endedAt, minutes: null, running: false, notCounted: "The office's start or end time cannot be read, so its minutes were not counted." }
  }
  return { startedAt, endedAt, minutes: Math.max(0, Math.round((to - from) / 60_000)), running: false, notCounted: null }
}

/** The name the registry gives a worker, or null where it holds none or the id names no row. */
function theNameOf(agentId: string | null): string | null {
  if (agentId === null) return null
  const who = readParticipant({ kind: 'agent', id: agentId })
  return who === null ? null : text(who.name)
}

/** One worker's row, built from the run that was filed or, when none was, from the ask itself. */
function aWorkerOf(
  run: AWorkerRunRow | null,
  asked: AnAskedWorkerRow | null,
  agentId: string | null,
  price: ReturnType<typeof priceTableInForce>,
): AWorkerOfAPackage {
  const given = run !== null ? readTheWorkerPackage(run.data['workerPackage']) : readTheWorkerPackage(asked?.entry.package)
  const namedHandle = text(run?.data['servingAgent']) ?? asked?.entry.handle ?? null
  // A TIME IS NEVER INVENTED. If neither the ask nor the run's own package nor the run's record names one, this row says
  // so by refusing rather than showing the moment of the read as if it were the ask.
  const askedAt = asked?.entry.askedAt ?? given?.askedAt ?? text(run?.createdAt)
  if (askedAt === null) {
    throw new PanelError(
      `The ask of ${namedHandle ?? 'a worker'} has no time: the time was not ` +
        'recorded, so this list cannot say when it was made. Nothing was shown rather than a made-up time.',
      409,
      undefined,
      undefined,
      undefined,
      { code: 'packageWorkerAskHasNoTime', values: { worker: namedHandle ?? 'a worker' } },
    )
  }
  const state = run === null ? null : text(run.data['state'])
  const askedState = asked?.entry.state ?? 'wanted'
  const id = agentId ?? (run === null ? null : text(run.data['servingAgentId']) ?? text(run.data['servingAgent']))
  const handle = namedHandle ?? (id ?? 'a worker the office cannot name')
  return {
    agent: id,
    name: theNameOf(id),
    handle,
    asked: askedState,
    state,
    askedAt,
    askedOn: asked === null ? null : { run: asked.run, title: asked.runTitle },
    runId: run?.id ?? asked?.entry.started?.run ?? null,
    runTitle: run?.title ?? null,
    model: run === null ? text(asked?.entry.starting?.model) : text(run.data['model']),
    points: given?.points ?? [],
    difficulty: given?.difficulty ?? null,
    why: given?.why ?? null,
    tokens: theTokensOf(run, price),
    minutes: theMinutesOf(run),
    wentBack: 0,
    wentBackSays: '0',
  }
}

/**
 * ONE PACKAGE'S WORKERS, oldest ask first. A worker's run that was filed stands for its ask; an ask whose worker's run
 * is not in this project is still listed, with what it asked for and why the run's numbers are not here.
 */
export function theWorkersOfAPackage(task: PanelRecord): TheWorkersOfAPackage {
  const pkg = packageOf(task.data)
  const pointIds = pkg?.pointIds ?? []
  const runs = workerRunsOf(task.id, task.workspaceId)
  const asks = asksOf(task.id, task.workspaceId)
  const price = priceTableInForce()
  const rows: { askedAt: string; worker: AWorkerOfAPackage }[] = []
  const runsById = new Map(runs.map((run) => [run.id, run]))
  const used = new Set<string>()
  for (const ask of asks) {
    const started = ask.entry.started?.run ?? null
    const run = started === null ? null : runsById.get(started) ?? null
    if (run !== null) used.add(run.id)
    const worker = aWorkerOf(run, ask, ask.agentId, price)
    rows.push({ askedAt: worker.askedAt, worker })
  }
  for (const run of runs) {
    if (used.has(run.id)) continue
    const agentId = text(run.data['servingAgentId'])
    const handle = text(run.data['servingAgent'])
    const worker = aWorkerOf(run, null, agentId ?? handle, price)
    rows.push({ askedAt: worker.askedAt, worker })
  }
  rows.sort((a, b) => a.askedAt.localeCompare(b.askedAt) || (a.worker.agent ?? '').localeCompare(b.worker.agent ?? ''))
  const handbacks = pkg?.handedBack ?? []
  let byWorkers = 0
  for (const row of rows) {
    if (row.worker.runId === null) {
      row.worker.wentBackSays = 'No hand-back names a run of this ask, which has none yet.'
      continue
    }
    const count = handbacks.filter((one) => one.run === row.worker.runId).length
    row.worker.wentBack = count
    byWorkers += count
    row.worker.wentBackSays =
      count === 0
        ? 'No hand-back names this worker’s run.'
        : count === 1
          ? 'One hand-back on the package names this worker’s run.'
          : `${String(count)} hand-backs on the package name this worker’s run.`
  }
  const total = handbacks.length
  return {
    task: task.id,
    title: task.title,
    pointIds,
    workers: rows.map((row) => row.worker),
    handbacks: { total, byWorkers, notNamingAWorker: total - byWorkers },
    says:
      'Tokens are the run’s own usage receipt, added by the office’s one summation; a run without one says its tokens ' +
      'were not read and is never counted as zero. Minutes are the office’s own start and end of the run. A result went ' +
      'back when the package’s hand-backs name the worker’s run.',
  }
}

/**
 * ONE DAY'S PACKAGES, in pages of at most 25, newest ask first. A package is on the day it was asked for work, by
 * either the worker's own run (`workerPackage.askedAt`) or an ask whose worker was never filed. Each row is exactly
 * what `theWorkersOfAPackage` gives its own door.
 */
export function thePackagesOfADay(day: string, page: number, size: number, workspaceId: string): TheWorkersOfADay {
  const found = workerRunsAskedOn(day, workspaceId)
  for (const [task, askedAt] of asksAskedOn(day, workspaceId)) {
    const before = found.get(task)
    if (before === undefined || askedAt < before) found.set(task, askedAt)
  }
  // A PACKAGE THE OFFICE CANNOT READ IS COUNTED OUT BEFORE THE PAGES ARE CUT, and named with why. Dropping it after the
  // slice would leave the total saying there are more packages than any page can reach.
  const readable: { task: string; askedAt: string; record: PanelRecord }[] = []
  const leftOut: APackageLeftOutOfADay[] = []
  for (const [task, askedAt] of found) {
    const record = getRecord(task)
    if (record === null || record.deletedAt !== null) {
      leftOut.push({ task, because: 'the task it names is deleted, or no live record has that id' })
    } else if (record.workspaceId !== workspaceId) {
      leftOut.push({ task, because: 'the task it names is in another project' })
    } else if (record.kind !== 'task') {
      leftOut.push({ task, because: 'the record it names is not a task' })
    } else if (packageOf(record.data) === null) {
      leftOut.push({ task, because: 'the task it names holds no package the office can read' })
    } else {
      readable.push({ task, askedAt, record })
    }
  }
  const ordered = readable.sort((a, b) => b.askedAt.localeCompare(a.askedAt) || a.task.localeCompare(b.task))
  const total = ordered.length
  const pages = Math.max(1, Math.ceil(total / size))
  const slice = ordered.slice((page - 1) * size, page * size)
  const packages: APackageAskedOnADay[] = slice.map(({ askedAt, record }) => ({ askedAt, package: theWorkersOfAPackage(record) }))
  return {
    day,
    packages,
    page: { number: page, size, total, pages, hasMore: page < pages && slice.length > 0 },
    leftOut: {
      count: leftOut.length,
      packages: leftOut,
      says: leftOut.length === 0
        ? 'Every package asked for work on this day has a task and a package the office can read.'
        : `${String(leftOut.length)} package${leftOut.length === 1 ? '' : 's'} asked for work on this day ` +
          `${leftOut.length === 1 ? 'is' : 'are'} left out of these pages and their total, each named here with why: ` +
          `${leftOut.map((one) => `${one.task} because ${one.because}`).join('; ')}.`,
    },
    says:
      'Every package asked for work on this day, newest ask first, in pages of at most 25. A package asked on two days ' +
      'is on both, and each row is the same list that package’s own door gives. A package the office cannot read is ' +
      'counted out before paging and named in leftOut with why.',
  }
}
