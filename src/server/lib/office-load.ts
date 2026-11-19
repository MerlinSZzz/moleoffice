// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE OFFICE'S OWN LOAD: ITS READ TIME, CPU AND MEMORY, READ ONCE A MINUTE AND SAID ONCE WHEN ONE STAYS OUT OF RANGE.
 * Wave 13y round 21. The numbers, their defaults and their bounds are declared
 * in src/shared/office-load.ts; this file measures them, keeps the last hour, reads and writes the ranges, and tells
 * the secretaries.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT EACH NUMBER IS
 * ---------------------------------------------------------------------------------------
 *
 *   read time  The median and the slowest time of the GET requests the office answered in the minute, from the
 *              request's arrival to its answer. A request that waits on purpose (a long poll, a stream) is left out,
 *              by the same predicate the slow-request line uses, because its time is the wait somebody asked for.
 *              The range is held against the median. A minute with no reads has no read time, and it neither counts
 *              towards a run out of range nor ends one.
 *   CPU        The process's own CPU time in the minute (user and system) over the minute's wall time, as a share
 *              of one core. Work the office starts in other processes, such as the message worker, is not in it.
 *   memory     The process's resident memory when the reading is taken, in MB.
 *
 * ---------------------------------------------------------------------------------------
 * WHEN THE SECRETARIES ARE TOLD
 * ---------------------------------------------------------------------------------------
 *
 * A number above its top at OFFICE_LOAD_READINGS_IN_A_ROW readings in a row is said once, in one line to the
 * Secretariat group, delivered to the secretaries. It is not said again until the number has come back in range and
 * gone out again. The count and the mark are kept in this process, so a restart starts the count afresh; a number that
 * stays out of range across a restart is said once more, ten minutes after the start.
 *
 * ---------------------------------------------------------------------------------------
 * ONE OPERATION'S CALLS, GROUPED BY WHO MADE THEM
 * ---------------------------------------------------------------------------------------
 *
 * Wave 13y round 78. The timing records keep each call's route, caller, purpose, client and target, and the usage reads
 * add them up by operation only. `oneOperationsCalls` splits one operation by them, so the caller that costs the time
 * can be named. It only reads the timing records, and writes nothing.
 */

import {
  OFFICE_LOAD_BOUNDS,
  OFFICE_LOAD_DEFAULTS,
  OFFICE_LOAD_EVERY_SECONDS,
  OFFICE_LOAD_NUMBERS,
  OFFICE_LOAD_READINGS_IN_A_ROW,
  type OfficeLoad,
  type OfficeLoadNumber,
  type OfficeLoadRange,
  type OfficeLoadReading,
  type OfficeLoadStanding,
} from '@shared/office-load.ts'
import { SYSTEM_LINES } from '@shared/groups.ts'
import { moleOffice } from '@shared/participants.ts'
import { localStamp } from '@shared/time.ts'
import { medianOf as theUsageMedian } from '@shared/median.ts'
import { sqlite } from '../db/client.ts'
import { writeASystemLine } from './groups.ts'
import { named } from './named-timers.ts'
// PanelError, SO THE SENTENCE REACHES WHOEVER ASKED. Only built when the reader or the writer throws.
import { type Actor } from './records.ts'
import { PanelError } from './panel-error.ts'
import { syncTheSecretariatGroup, theSecretaries } from './secretariat.ts'
import { foldedCallsSince } from './usage-reads.ts'

function theOffice(): Actor { return { type: 'system', id: moleOffice().id } }
/** The column each range's top is stored in, on the installation row (migration 0230). */
const THE_COLUMNS: Readonly<Record<OfficeLoadNumber, string>> = {
  readMs: 'load_read_ms_top',
  cpuPercent: 'load_cpu_percent_top',
  memoryMb: 'load_memory_mb_top',
}

/** How each number is written in a sentence. */
const SAID_AS: Readonly<Record<OfficeLoadNumber, { name: string; unit: string }>> = {
  readMs: { name: 'median read time', unit: 'ms' },
  cpuPercent: { name: 'CPU', unit: '% of one core' },
  memoryMb: { name: 'memory', unit: 'MB' },
}

/** A reading is kept for an hour. */
const READINGS_KEPT = Math.round(3_600 / OFFICE_LOAD_EVERY_SECONDS)

/** What this process has measured since it started. */
interface TheMeasuring {
  startedAt: string
  /** The times of the reads answered since the last reading. */
  readsSince: number[]
  cpuAt: { usage: NodeJS.CpuUsage; wallMs: number }
  lastHour: OfficeLoadReading[]
  standing: Record<OfficeLoadNumber, OfficeLoadStanding>
}

function aFreshStanding(number: OfficeLoadNumber): OfficeLoadStanding {
  return { number, value: null, outFor: 0, outSince: null, toldIn: null }
}

function freshMeasuring(): TheMeasuring {
  return {
    startedAt: localStamp(new Date()),
    readsSince: [],
    cpuAt: { usage: process.cpuUsage(), wallMs: performance.now() },
    lastHour: [],
    standing: { readMs: aFreshStanding('readMs'), cpuPercent: aFreshStanding('cpuPercent'), memoryMb: aFreshStanding('memoryMb') },
  }
}

let measuring = freshMeasuring()

/** Forget everything measured, as a restart does. For tests. */
export function forgetTheOfficeLoad(): void {
  measuring = freshMeasuring()
}

/** Note one read the office answered, and how long it took. The caller has left out the chosen waits. */
export function noteARead(ms: number): void {
  measuring.readsSince.push(ms)
}

// ---------------------------------------------------------------------------------------- the ranges

/** Each range as it is in force, read from the row on every call, with nothing cached. */
export function theOfficeLoadRanges(): OfficeLoadRange[] {
  const row = sqlite
    .prepare(`SELECT ${OFFICE_LOAD_NUMBERS.map((n) => `${THE_COLUMNS[n]} AS ${n}`).join(', ')} FROM installation WHERE only_row = 1`)
    .get() as Record<OfficeLoadNumber, unknown> | undefined
  return OFFICE_LOAD_NUMBERS.map((number) => {
    const stored = row?.[number] ?? null
    const fallback = OFFICE_LOAD_DEFAULTS[number]
    if (stored === null) return { number, top: fallback, nobodyChose: true, default: fallback }
    const [lowest, highest] = OFFICE_LOAD_BOUNDS[number]
    if (typeof stored !== 'number' || !Number.isInteger(stored) || stored < lowest || stored > highest) {
      throw new PanelError(
        `The top of the office's ${SAID_AS[number].name} range is stored as ${JSON.stringify(stored)} in ` +
          `installation.${THE_COLUMNS[number]}, and this office reads only nothing or a whole number from ` +
          `${String(lowest)} to ${String(highest)} there. Nothing was guessed and nothing was changed.`,
        500,
      )
    }
    return { number, top: stored, nobodyChose: false, default: fallback }
  })
}

/**
 * SET THE TOPS NAMED, AND ANSWER WITH THE RANGES AS THEY NOW STAND. A number left out is left as it is; `null` takes
 * the choice away again, so the default is in force. The caller has already checked who is asking and that each top is
 * within its bounds. An update that changed no row means this database has no installation row, and that is said.
 */
export function setTheOfficeLoadRanges(tops: Partial<Record<OfficeLoadNumber, number | null>>): OfficeLoadRange[] {
  const chosen = OFFICE_LOAD_NUMBERS.filter((n) => tops[n] !== undefined)
  if (chosen.length > 0) {
    const written = sqlite
      .prepare(`UPDATE installation SET ${chosen.map((n) => `${THE_COLUMNS[n]} = ?`).join(', ')} WHERE only_row = 1`)
      .run(...chosen.map((n) => tops[n] ?? null))
    if (written.changes !== 1) {
      throw new PanelError(
        "This database has no installation row, so the office's load ranges could not be stored. Nothing was changed.",
        500,
      )
    }
  }
  return theOfficeLoadRanges()
}

// ---------------------------------------------------------------------------------------- a reading

/** The median of some times, or null because there are none. */
function medianOf(times: readonly number[]): number | null {
  if (times.length === 0) return null
  const sorted = [...times].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2
}

const oneDecimal = (value: number): number => Math.round(value * 10) / 10

/** What each number was at a reading, and null where it had nothing to measure. */
function theValuesOf(reading: OfficeLoadReading): Record<OfficeLoadNumber, number | null> {
  return { readMs: reading.readMedianMs, cpuPercent: reading.cpuPercent, memoryMb: reading.memoryMb }
}

/** The sentence the secretaries are told in, about one number. */
function theSentenceFor(number: OfficeLoadNumber, standing: OfficeLoadStanding, top: number): string {
  const { name, unit } = SAID_AS[number]
  return (
    `The office's own ${name} has been above its top of ${String(top)} ${unit} at ${String(standing.outFor)} readings ` +
    `in a row, a minute apart, since ${standing.outSince ?? 'the start'}. The latest is ${String(standing.value)} ${unit}. ` +
    'The numbers are on the runtime page. A secretary may change the range there or with POST /api/office/load-ranges, ' +
    'with a reason. This is said once, until the number comes back in range.'
  )
}

/**
 * TELL THE SECRETARIES, ONCE, and answer with the line's id, or null because nothing could be written: no secretary
 * holds the card, or the group has nobody in it. Then the next reading tries again, so a secretary who arrives later is
 * told.
 */
function tellTheSecretaries(number: OfficeLoadNumber, standing: OfficeLoadStanding, top: number): string | null {
  const secretaries = theSecretaries()
  if (secretaries.length === 0) return null
  const group = syncTheSecretariatGroup()
  const written = writeASystemLine(
    group.id,
    group.workspaceId,
    SYSTEM_LINES.theOfficeLoadIsOutOfRange(theSentenceFor(number, standing, top)),
    theOffice(),
    undefined,
    secretaries,
    // THE MARK GOES IN `extra`: a message declares no field for it, and nothing reads it but a person and a test.
    { extra: { officeLoad: { number, top, outSince: standing.outSince, value: standing.value } } },
  )
  return written?.id ?? null
}

/**
 * TAKE ONE READING: measure the three numbers, keep the reading, move each number's standing on, and tell the
 * secretaries about a number that has now been out of range long enough. Exported so a test can take readings with
 * values of its own; `measured` replaces what the process would have measured.
 */
export function takeAReading(
  now: Date = new Date(),
  measured?: Partial<Pick<OfficeLoadReading, 'cpuPercent' | 'memoryMb'>>,
): OfficeLoadReading {
  const reads = measuring.readsSince
  measuring.readsSince = []
  const usage = process.cpuUsage()
  const wallMs = performance.now()
  const cpuMs = (usage.user - measuring.cpuAt.usage.user + usage.system - measuring.cpuAt.usage.system) / 1_000
  const elapsedMs = wallMs - measuring.cpuAt.wallMs
  measuring.cpuAt = { usage, wallMs }
  const median = medianOf(reads)
  const reading: OfficeLoadReading = {
    at: localStamp(now),
    reads: reads.length,
    readMedianMs: median === null ? null : oneDecimal(median),
    readSlowestMs: reads.length === 0 ? null : oneDecimal(Math.max(...reads)),
    cpuPercent: measured?.cpuPercent ?? (elapsedMs > 0 ? oneDecimal((cpuMs / elapsedMs) * 100) : 0),
    memoryMb: measured?.memoryMb ?? Math.round(process.memoryUsage.rss() / 1_048_576),
  }
  measuring.lastHour.push(reading)
  if (measuring.lastHour.length > READINGS_KEPT) measuring.lastHour.splice(0, measuring.lastHour.length - READINGS_KEPT)

  const values = theValuesOf(reading)
  for (const range of theOfficeLoadRanges()) {
    const standing = measuring.standing[range.number]
    const value = values[range.number]
    standing.value = value
    // NO READS, NO READ TIME: the run out of range neither grows nor ends.
    if (value === null) continue
    if (value <= range.top) {
      measuring.standing[range.number] = { ...aFreshStanding(range.number), value }
      continue
    }
    standing.outFor += 1
    standing.outSince ??= reading.at
    if (standing.outFor >= OFFICE_LOAD_READINGS_IN_A_ROW && standing.toldIn === null) {
      standing.toldIn = tellTheSecretaries(range.number, standing, range.top)
    }
  }
  return reading
}

/** What the page draws: the latest reading, the last hour, the ranges and where each number stands. */
export function theOfficeLoad(): OfficeLoad {
  return {
    latest: measuring.lastHour.at(-1) ?? null,
    lastHour: [...measuring.lastHour],
    ranges: theOfficeLoadRanges(),
    standing: OFFICE_LOAD_NUMBERS.map((n) => ({ ...measuring.standing[n] })),
    everySeconds: OFFICE_LOAD_EVERY_SECONDS,
    readingsInARow: OFFICE_LOAD_READINGS_IN_A_ROW,
    serverStartedAt: measuring.startedAt,
  }
}

/**
 * START THE MINUTE READING, and answer with what stops it. NAMED, so a long reading is a line in the log and the loop
 * watch can say whose a hold was. A reading that throws is a line in the log, and the next minute tries again.
 */
export function startTheLoadReadings(log: (line: string) => void): () => void {
  forgetTheOfficeLoad()
  const timer = setInterval(
    named('the load reading', log, () => {
      try {
        takeAReading()
      } catch (err) {
        log(`The office's load reading could not finish: ${err instanceof Error ? err.message : String(err)}`)
      }
    }),
    OFFICE_LOAD_EVERY_SECONDS * 1_000,
  )
  timer.unref()
  return () => clearInterval(timer)
}

/** The calls of one operation that have the same route, caller, purpose, client and kind of target. */
export interface ACallGroup {
  route: string | null
  caller: { type: string | null; id: string | null }
  purpose: string | null
  client: { addr: string | null; origin: string | null }
  /** Whether the call's target is the run the call came from. Null when the call names no target. */
  targetIsTheirOwnRun: boolean | null
  calls: number
  /** The calls answered with a status from 400 to 499, as the usage reads count a refusal. */
  refused: number
  /** The calls that waited on purpose, such as a long poll. Their time is left out of the three times below. */
  waited: number
  msMedian: number | null
  /** The 95th percentile by the nearest rank: at least 95 % of the timed calls took this long or less. */
  msP95: number | null
  msTotal: number
  bytes: number
}

/** One operation's calls in one project over the days asked, grouped. */
export interface OneOperationsCalls {
  operation: string
  days: number
  workspaceId: string
  /** The calls stored one row each, which the groups add up to. */
  calls: number
  /** The calls counted by the hour where long-poll rows were. They carry no caller, so they are in no group. */
  foldedCalls: number
  /** The dearest first: by total time, then by calls. */
  groups: ACallGroup[]
}

const A_DAY_MS = 86_400_000

/**
 * ONE OPERATION'S CALLS IN `workspaceId` OVER THE LAST `days`, GROUPED BY WHO MADE THEM. SQLite groups and counts;
 * each group's times come back as one JSON list, without the calls that waited, so the median and the 95th percentile
 * are worked out here from every time. A refusal and a wait are what the usage reads take them to be, and the median is
 * theirs (`theUsageMedian`, from src/shared/median.ts), not the load readings' own above, so the groups add up to what
 * `GET /api/usage/operations` says for the operation.
 */
export function oneOperationsCalls(operation: string, days: number, workspaceId: string): OneOperationsCalls {
  const fromMs = Date.now() - days * A_DAY_MS
  const rows = sqlite
    .prepare(
      `select route, actor_type as callerType, actor_id as callerId, purpose, client_addr as clientAddr, ` +
        `client_origin as clientOrigin, ` +
        `case when target_id is null then null when session_id is not null and target_id = session_id then 1 else 0 end as ownRun, ` +
        `count(*) as calls, sum(status >= 400 and status < 500) as refused, sum(waits = 1) as waited, ` +
        `sum(coalesce(bytes, 0)) as bytes, json_group_array(ms) filter (where waits != 1) as times, min(at_ms) as firstAtMs ` +
        `from api_calls where operation = ? and at_ms >= ? and workspace_id = ? ` +
        `group by route, actor_type, actor_id, purpose, client_addr, client_origin, ownRun`,
    )
    .all(operation, fromMs, workspaceId) as {
    route: string | null
    callerType: string | null
    callerId: string | null
    purpose: string | null
    clientAddr: string | null
    clientOrigin: string | null
    ownRun: number | null
    calls: number
    refused: number
    waited: number
    bytes: number
    times: string
    firstAtMs: number
  }[]
  const groups = rows.map((row) => {
    const times = (JSON.parse(row.times) as number[]).sort((a, b) => a - b)
    const group: ACallGroup = {
      route: row.route,
      caller: { type: row.callerType, id: row.callerId },
      purpose: row.purpose,
      client: { addr: row.clientAddr, origin: row.clientOrigin },
      targetIsTheirOwnRun: row.ownRun === null ? null : row.ownRun === 1,
      calls: row.calls,
      refused: row.refused,
      waited: row.waited,
      msMedian: theUsageMedian(times),
      msP95: times.length === 0 ? null : times[Math.ceil(0.95 * times.length) - 1]!,
      msTotal: times.reduce((sum, ms) => sum + ms, 0),
      bytes: row.bytes,
    }
    return { group, firstAtMs: row.firstAtMs, key: JSON.stringify(group) }
  })
  groups.sort((a, b) => b.group.msTotal - a.group.msTotal || b.group.calls - a.group.calls || a.firstAtMs - b.firstAtMs || a.key.localeCompare(b.key))
  return {
    operation,
    days,
    workspaceId,
    calls: rows.reduce((sum, row) => sum + row.calls, 0),
    foldedCalls: foldedCallsSince(fromMs, workspaceId).get(operation) ?? 0,
    groups: groups.map((one) => one.group),
  }
}
