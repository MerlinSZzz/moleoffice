// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE FIRST PAGE OF THE ATTENTION ANSWER, WHICH IS WHAT HOME READS, AND THE PAGES BEHIND ITS FOLDS.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS EXISTS
 * ---------------------------------------------------------------------------------------
 *
 * Round 19 of wave 13w, on a decision: Home froze when the person opened it. Home in
 * Developer mode asked for the whole attention answer, which was 11,767,705 bytes on their office on
 * 9 October 2026, and its longest list held 30,925 rows. Home draws a count for each question list and
 * shows its rows only when the reader opens that list's fold, and it shows five reports. The answer
 * carried every row of every list, and the page mounted them all inside closed folds.
 *
 * So Home now reads a first page. It holds the rows the frame and Home count from (`visible` and
 * `remainder`, as before), the five newest reports waiting to be read, and counts for everything else.
 * Each list's rows come in pages of `ATTENTION_PART_ROWS` when the reader opens its fold.
 *
 * ---------------------------------------------------------------------------------------
 * ONE PLACE
 * ---------------------------------------------------------------------------------------
 *
 * The server builds the first page and the part pages here, and Home draws the counts it is given.
 * Before this, Home counted the question lists itself from the rows. A count worked out on the server
 * from the rows and a count worked out in the page from the same rows could drift (invariant 9), so
 * the counts are now worked out only here.
 */
import type {
  AttentionResult,
  AttentionRow,
  NoStateRow,
  PassedOverGroup,
  PauseStanding,
  PausedRow,
  ReportRow,
  UnclassifiedRow,
} from './attention.ts'

import { familyOf, type KindFamily } from './work.ts'
import type { RecordKind } from './types.ts'

/**
 * WHICH ROWS OF A PROJECT'S ATTENTION READING ARE HOME'S LATE OR STUCK ALARMS. Home's Late or stuck draws them, and
 * Agents at work counts an agent stuck when the run serving it is one of them, so both read the one rule here.
 */

/** What the rule reads of an attention row. */
export interface AlarmFacts {
  safety: boolean
  reason: { owed: { lateMs: number | null } | null; stoppedShort: unknown; pauseElapsed?: unknown; safetyFloor: boolean }
}

export function overdue(row: AlarmFacts): boolean {
  return (row.reason.owed?.lateMs ?? 0) > 0
}

export function isAlarm(row: AlarmFacts): boolean {
  return row.safety || row.reason.safetyFloor || overdue(row) || row.reason.stoppedShort !== null || row.reason.pauseElapsed != null
}

export function alarmKind(row: AlarmFacts): 'safety' | 'late' | 'stopped' | 'pause' {
  if (row.safety || row.reason.safetyFloor) return 'safety'
  if (overdue(row)) return 'late'
  if (row.reason.stoppedShort !== null) return 'stopped'
  return 'pause'
}

/** HOW MANY ROWS LATE OR STUCK DRAWS, as the approved drawing does ("4 of 11", then a link to the rest). The server puts this many of each project's alarms first on Home's page, so that one project's alarms can fill the section. */
export const HOME_ALARMS_SHOWN = 4

/**
 * HOW MANY REPORTS HOME DRAWS: five at the most.
 * Everything past the fifth is counted exactly and is one press away on the Reports and notes page.
 */
export const REPORTS_SHOWN = 5

/**
 * THE REPORTS HOME DRAWS: the newest first, and no more than `cap` of them.
 *
 * `filedAt` is when the report was written, which is not the day it is about. The key breaks a tie so
 * the same list comes back in the same order twice.
 */
export function newestReports(rows: readonly ReportRow[], cap: number = REPORTS_SHOWN): ReportRow[] {
  return [...rows]
    .sort((a, b) => (a.filedAt !== b.filedAt ? (a.filedAt < b.filedAt ? 1 : -1) : a.key < b.key ? -1 : 1))
    .slice(0, cap)
}

/** How many rows one page of a list behind a fold holds. */
export const ATTENTION_PART_ROWS = 100

/** The lists that come only when a reader opens their fold. */
export const FULL_ATTENTION_PARTS = ['fullRemainder', 'fullUnclassified', 'fullNoState', 'fullDirections', 'fullReports', 'fullPaused', 'fullMachine', 'fullPassedOver'] as const
export const ATTENTION_PARTS = ['paused', 'unclassified', 'noState', 'readReports', 'homeRemainder', ...FULL_ATTENTION_PARTS] as const
export type AttentionPart = (typeof ATTENTION_PARTS)[number]

/** The row each list behind a fold holds. */
export interface AttentionPartRow {
  paused: PausedRow
  unclassified: UnclassifiedRow
  noState: NoStateRow
  readReports: ReportRow
  homeRemainder: AttentionRow
  fullRemainder: AttentionRow
  fullUnclassified: UnclassifiedRow
  fullNoState: NoStateRow
  fullDirections: AttentionResult['directions'][number]
  fullReports: ReportRow
  fullPaused: PausedRow
  fullMachine: AttentionResult['machine'][number]
  fullPassedOver: { bucket: PassedOverGroup['bucket']; key: string }
}

/** One page of one list behind a fold. */
export interface AttentionPartPage<P extends AttentionPart = AttentionPart> {
  part: P
  /** How many rows the whole list holds. */
  total: number
  /** The place of this page's first row in the whole list, counting from 0. */
  from: number
  rows: AttentionPartRow[P][]
  next?: string | null
}

/** A paused record that is also on the attention list, named. Home names these under its question counts. */
export interface PausedOnTheList {
  key: string
  recordId: string
  recordKind: PausedRow['recordKind']
  title: string
}

/** The three question lists, as counts and as the splits Home says in words. */
export interface AttentionQuestions {
  paused: {
    /** Every paused record, including those also on the attention list. */
    total: number
    /** The paused records still holding, which are the ones the paused list behind its fold holds. */
    holding: number
    /** How the holding ones split by standing, in the order each standing first appears in the list. */
    holdingByStanding: { standing: PauseStanding; count: number }[]
    /** The paused records that are also on the attention list. Home names each of them. */
    onList: PausedOnTheList[]
  }
  unclassified: {
    count: number
    /** Each state word nobody has classified, with how many records carry it, most first. */
    words: { word: string; count: number }[]
  }
  noState: {
    count: number
    /** The kind declares a state and none was written. */
    written: number
    /** The kind has no state field. */
    noField: number
    /** Mole Office does not know the kind. */
    unknownKind: number
  }
}

/** The first page, without the two stamps the route adds (`at` and `read`). */
export interface AttentionFirstPage {
  visible: AttentionRow[]
  remainder: AttentionRow[]
  remainderNext: string | null
  badgeCounts: { byKind: Partial<Record<RecordKind, number>>; byFamily: Partial<Record<KindFamily, number>>; safety: boolean }
  openWork: { open: number; uncertain: number }
  alarms: { rows: AttentionRow[]; total: number; overdue: number; sessionIds: string[] }
  total: number
  remainderByGroup: AttentionResult['remainderByGroup']
  remainderNote: string | null
  /** The buckets of what was not selected, each with its sentence and count. The keys are not sent. */
  passedOver: Omit<PassedOverGroup, 'keys'>[]
  counts: AttentionResult['counts']
  /** The newest `REPORTS_SHOWN` reports still waiting to be read, whole. */
  reports: ReportRow[]
  reportCounts: { waiting: number; read: number }
  questions: AttentionQuestions
}

/**
 * A REMAINDER ROW CUT TO WHAT HOME AND THE FRAME READ OFF IT: its keys, `group`, `safety`, `progress`,
 * `displacedBy`, `origin`, and of `reason` the `because` sentence, the `owed` fact, the `consequence`,
 * and the two clocks a row is dated from, `stoppedShort.since` and `pauseElapsed.pastMs`. `selectedBy`,
 * `safetyFloor`, `factors`, `score`, `partId` and `itemId` are read nowhere on Home.
 */
function remainderRow(row: AttentionRow): AttentionRow {
  const { score: _score, partId: _partId, itemId: _itemId, ...rest } = row
  const { factors: _factors, selectedBy: _selectedBy, safetyFloor: _safetyFloor, ...reason } = row.reason
  return {
    ...rest,
    reason: {
      ...reason,
      stoppedShort: reason.stoppedShort == null ? null : { since: reason.stoppedShort.since },
      pauseElapsed: reason.pauseElapsed == null ? null : { pastMs: reason.pauseElapsed.pastMs },
    },
  } as AttentionRow
}

function holdingOf(paused: readonly PausedRow[]): PausedRow[] {
  return paused.filter((row) => !row.onList)
}

/**
 * THE REPORTS LIST, OR A REFUSAL. `AttentionResult.reports` is required, but the server's reading comes
 * back from the attention thread (src/server/lib/attention-thread.ts) as a message whose type is
 * declared, not checked. A reading without the list is refused here rather than counted as no reports,
 * which would be a count of nought nobody counted. The first page and the page of read reports both
 * read it through here.
 */
function reportsOf(result: AttentionResult): ReportRow[] {
  const reports: ReportRow[] | undefined = result.reports
  if (reports === undefined) throw new Error('The attention reading carried no reports list, so its reports cannot be counted.')
  return reports
}

function readReportsOf(result: AttentionResult): ReportRow[] {
  return reportsOf(result).filter((row) => !row.waiting)
}

/** The three question lists as counts and splits. */
export function questionsOf(result: AttentionResult): AttentionQuestions {
  const holding = holdingOf(result.paused)
  const standings = new Map<PauseStanding, number>()
  for (const row of holding) standings.set(row.standing, (standings.get(row.standing) ?? 0) + 1)
  const words = new Map<string, number>()
  for (const row of result.unclassified) words.set(row.state, (words.get(row.state) ?? 0) + 1)
  return {
    paused: {
      total: result.paused.length,
      holding: holding.length,
      holdingByStanding: [...standings.entries()].map(([standing, count]) => ({ standing, count })),
      onList: result.paused
        .filter((row) => row.onList)
        .map((row) => ({ key: row.key, recordId: row.recordId, recordKind: row.recordKind, title: row.title })),
    },
    unclassified: {
      count: result.unclassified.length,
      words: [...words.entries()]
        .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
        .map(([word, count]) => ({ word, count })),
    },
    noState: {
      count: result.noState.length,
      written: result.noState.filter((row) => row.expected === true).length,
      noField: result.noState.filter((row) => row.expected === false).length,
      unknownKind: result.noState.filter((row) => row.expected === null).length,
    },
  }
}

/** THE FIRST PAGE OF THE ANSWER. A result with no reports list is refused by `reportsOf`. */
export function attentionFirstPage(result: AttentionResult): AttentionFirstPage {
  const reports = reportsOf(result)
  const waiting = reports.filter((row) => row.waiting)
  const remainder = result.remainder.map(remainderRow)
  const selected = [...result.visible, ...remainder]
  const byKind: Partial<Record<RecordKind, number>> = {}
  const byFamily: Partial<Record<KindFamily, number>> = {}
  let open = 0
  let uncertain = 0
  for (const row of selected) {
    byKind[row.recordKind] = (byKind[row.recordKind] ?? 0) + 1
    const family = familyOf(row.recordKind)
    if (family !== null) byFamily[family] = (byFamily[family] ?? 0) + 1
    if (row.progress === 'not_started' || row.progress === 'in_flight' || row.progress === 'stopped_short' || row.progress === 'paused') open++
    else if (row.progress !== 'finished') uncertain++
  }
  const known = new Set(['not_started', 'in_flight', 'paused_waiting', 'paused_cannot_tell'])
  const unknown = new Set(['unknown', 'unclassified', 'no_state_written', 'unknown_kind'])
  for (const group of result.passedOver) {
    if (known.has(group.bucket)) open += group.count
    else if (unknown.has(group.bucket)) uncertain += group.count
  }
  const allAlarms = selected.filter(isAlarm)
  const rank = { safety: 0, late: 1, stopped: 2, pause: 3 }
  const alarms = allAlarms.map((row, index) => ({ row, index }))
    .sort((a, b) => rank[alarmKind(a.row)] - rank[alarmKind(b.row)] || a.index - b.index)
    .slice(0, HOME_ALARMS_SHOWN).map(({ row }) => row)
  return {
    visible: result.visible,
    remainder: remainder.slice(0, ATTENTION_PART_ROWS),
    remainderNext: remainder.length > ATTENTION_PART_ROWS ? `/api/attention?machine=omit&shape=part&part=homeRemainder&from=${String(ATTENTION_PART_ROWS)}` : null,
    badgeCounts: { byKind, byFamily, safety: selected.some((row) => row.safety) },
    openWork: { open, uncertain },
    alarms: { rows: alarms, total: allAlarms.length, overdue: selected.filter(overdue).length, sessionIds: [...new Set(allAlarms.filter((row) => row.recordKind === 'session').map((row) => row.recordId))] },
    total: result.total,
    remainderByGroup: result.remainderByGroup,
    remainderNote: result.remainderNote,
    passedOver: result.passedOver.map(({ keys: _keys, ...group }) => group),
    counts: result.counts,
    reports: newestReports(waiting),
    reportCounts: { waiting: waiting.length, read: reports.length - waiting.length },
    questions: questionsOf(result),
  }
}

/** One page of one list behind a fold, starting at `from`. A `from` past the end answers no rows and the total. */
export function attentionPartOf<P extends AttentionPart>(result: AttentionResult, part: P, from: number, machine: 'include' | 'omit' = 'omit'): AttentionPartPage<P> {
  if (part === 'homeRemainder') {
    const rows = result.remainder.slice(from, from + ATTENTION_PART_ROWS).map(remainderRow)
    const nextFrom = from + rows.length
    return { part, from, total: result.remainder.length, rows, next: nextFrom < result.remainder.length ? `/api/attention?machine=omit&shape=part&part=homeRemainder&from=${String(nextFrom)}` : null } as AttentionPartPage<P>
  }
  if ((FULL_ATTENTION_PARTS as readonly string[]).includes(part)) return fullAttentionPart(result, part as FullAttentionPart, from, machine) as AttentionPartPage<P>
  const whole = (
    part === 'paused' ? holdingOf(result.paused) : part === 'unclassified' ? result.unclassified : part === 'noState' ? result.noState : readReportsOf(result)
  ) as AttentionPartRow[P][]
  return { part, total: whole.length, from, rows: whole.slice(from, from + ATTENTION_PART_ROWS) }
}

export type FullAttentionPart = (typeof FULL_ATTENTION_PARTS)[number]
export type FullPage<P extends FullAttentionPart> = { rows: AttentionPartRow[P][]; total: number; next: string | null }
export type FullAttentionLists = {
  remainder: FullPage<'fullRemainder'>
  unclassified: FullPage<'fullUnclassified'>
  noState: FullPage<'fullNoState'>
  directions: FullPage<'fullDirections'>
  reports: FullPage<'fullReports'>
  paused: FullPage<'fullPaused'>
  machine: FullPage<'fullMachine'>
  passedOver: FullPage<'fullPassedOver'> & { groups: Omit<PassedOverGroup, 'keys'>[] }
}

/** Page the complete rule rows before they cross the thread boundary. */
export function fullAttentionPart<P extends FullAttentionPart>(result: AttentionResult, part: P, from: number, machine: 'include' | 'omit'): AttentionPartPage<P> & { next: string | null } {
  let whole: readonly unknown[]
  let total: number
  if (part === 'fullPassedOver') {
    const page: { bucket: PassedOverGroup['bucket']; key: string }[] = []
    let offset = 0
    for (const group of result.passedOver) {
      const start = Math.max(0, from - offset)
      const end = Math.min(group.keys.length, from + ATTENTION_PART_ROWS - offset)
      if (end > start) for (const key of group.keys.slice(start, end)) page.push({ bucket: group.bucket, key })
      offset += group.keys.length
    }
    total = offset
    whole = page
  } else {
    const field = ({ fullRemainder: 'remainder', fullUnclassified: 'unclassified', fullNoState: 'noState', fullDirections: 'directions', fullReports: 'reports', fullPaused: 'paused', fullMachine: 'machine' } as const)[part as Exclude<FullAttentionPart, 'fullPassedOver'>]
    total = result[field].length
    whole = result[field].slice(from, from + ATTENTION_PART_ROWS)
  }
  const rows = whole as AttentionPartRow[P][]
  const nextFrom = from + rows.length
  const next = nextFrom < total ? `/api/attention?machine=${machine}&shape=part&part=${part}&from=${String(nextFrom)}` : null
  return { part, from, total, rows, next }
}

export function fullAttentionLists(result: AttentionResult, machine: 'include' | 'omit'): FullAttentionLists {
  const page = <P extends FullAttentionPart>(part: P): FullPage<P> => {
    const { rows, total, next } = fullAttentionPart(result, part, 0, machine)
    return { rows, total, next }
  }
  return {
    remainder: page('fullRemainder'), unclassified: page('fullUnclassified'), noState: page('fullNoState'),
    directions: page('fullDirections'), reports: page('fullReports'), paused: page('fullPaused'), machine: page('fullMachine'),
    passedOver: { ...page('fullPassedOver'), groups: result.passedOver.map(({ keys: _keys, ...group }) => group) },
  }
}

/** The graph fields retained for non-block rows; block rows keep their whole reason. */
export type FlowAttentionRow = Pick<AttentionRow, 'recordId' | 'recordKind' | 'score' | 'safety'> & {
  reason: Pick<AttentionRow['reason'], 'coded' | 'owed' | 'consequence'> & {
    stoppedShort: Pick<NonNullable<AttentionRow['reason']['stoppedShort']>, 'since'> | null
  }
}
