// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE MERGE QUEUE'S MEASURES, ONE CALENDAR DAY AT A TIME, FROM ITS OWN RECORDS (GET /api/merge-queue/measures).
 *
 * The owner counts speed work as done only when it is on main, live and measured. These are the measures. For each day
 * in the office's time zone they give the entries landed and how long they waited, and how the entries were tested. They
 * give what was handed back, taken back or bounced, and the fix rounds the office opened. They give the main-suite
 * receipts, and the hours main was red by them. They give the commit the stable office ran at each day's end, from the
 * upgrade notices, and how far main was ahead of it then. Read now, they give how far the stable office is behind main.
 * Queries read the merge entries, the change log of their fix rounds, the receipts and the upgrade notices. Nothing is
 * written, and nothing is kept, so the same records give the same answer.
 *
 * EVERY MOMENT IS READ WITH THE CLOCK OBSERVATION BESIDE ITS STAMP (`momentOfAStoredStamp`), so a wait across the hour the
 * clocks go back is measured between moments. An event is placed on the day of its moment. A stamp with no moment, such
 * as one in the hour that comes twice with nothing beside it, is placed on the day its words name, which is the office's
 * day. Its wait is unmeasured.
 */
import { sayInEnglish } from '@shared/i18n.ts'
import { ESTIMATED_FIGURES, MEASURED_FIGURES, type MeasuredDay, type MeasuredReceipt, type MeasuredWait, type QueueMeasures, type StableAgainstMain } from '@shared/merge-queue-measures.ts'
import { MERGE_ENTRY_KIND } from '@shared/merge-queue.ts'
import { medianOf } from '@shared/median.ts'
import { clockStamp, latestMomentOfStampInZone, momentOfAStoredStamp, momentOfStampInZone, stampInZone, theClockZone } from '@shared/time.ts'
import { wholeSuiteReceiptIsGreen } from '@shared/whole-suite-receipt.ts'
import { sqlite } from '../db/client.ts'
import { PanelError } from './panel-error.ts'
import { readGit } from './resources.ts'
import { whyGitDidNotAnswer } from '@shared/why-git-did-not-answer.ts'
import { stableUpgradeHistory } from './stable-upgrade-notices.ts'

const HOUR_MS = 3_600_000
const MINUTE_MS = 60_000

/** The day a stored stamp's words name: its first ten characters, when they are a date. */
const STAMP_DAY = /^(\d{4}-\d{2}-\d{2})[ T]\d{2}:\d{2}:\d{2}/u

/** The value of a `data -> '$.path'` column, or null when the path is absent. */
const valueOf = (json: string | null): unknown => (json === null ? null : JSON.parse(json))

/** The day of an event in `zone`: the day of its moment, or, with none, the day its stored words name. Null when neither. */
function dayOf(ms: number | null, stamp: unknown, zone: string): string | null {
  if (ms !== null) return stampInZone(ms, zone).slice(0, 10)
  return typeof stamp === 'string' ? (STAMP_DAY.exec(stamp)?.[1] ?? null) : null
}

/** A number to one decimal place, so a figure carries no rounding noise. */
const tenths = (n: number): number => Math.round(n * 10) / 10

/** The 90th percentile by nearest rank: the smallest value that at least 9 in 10 of the values are at or under. */
function ninetiethOf(sorted: readonly number[]): number | null {
  return sorted.length === 0 ? null : sorted[Math.ceil(0.9 * sorted.length) - 1]!
}

function aWait(minutes: readonly number[], unmeasured: number): MeasuredWait {
  const sorted = [...minutes].sort((a, b) => a - b)
  const median = medianOf(sorted)
  const p90 = ninetiethOf(sorted)
  return { measured: sorted.length, unmeasured, medianMinutes: median === null ? null : tenths(median), p90Minutes: p90 === null ? null : tenths(p90) }
}

/** The `count` calendar days that end with the day of `now` in `zone`, oldest first, each with the moments it starts and ends. */
function theDays(now: number, count: number, zone: string): { day: string; from: number; until: number }[] {
  const [year, month, date] = stampInZone(now, zone).slice(0, 10).split('-').map(Number) as [number, number, number]
  const days = Array.from({ length: count }, (_, i) => new Date(Date.UTC(year, month - 1, date - (count - 1 - i))).toISOString().slice(0, 10))
  const starts = days.map((day) => {
    const start = momentOfStampInZone(`${day} 00:00:00`, zone)
    if (start === null) throw new Error(`The start of ${day} in ${zone} could not be read.`)
    return start
  })
  return days.map((day, i) => ({ day, from: starts[i]!, until: i + 1 < days.length ? starts[i + 1]! : now }))
}

interface EntryRow {
  createdAt: string
  submittedTime: string | null
  state: string
  judgedAt: unknown
  judgedTime: string | null
  landedAt: unknown
  landedTime: string | null
  mainAfter: unknown
  mergeClass: unknown
  tested: string | null
  testedAt: unknown
  testedTime: string | null
  relatedOnly: string | null
  wholeSuiteBecause: string | null
  takeBackOf: string | null
  bouncedAt: unknown
  bouncedReason: unknown
}

function theEntries(workspaceId: string): EntryRow[] {
  return sqlite
    .prepare(
      "SELECT created_at AS createdAt, data -> '$.submittedTime' AS submittedTime, json_extract(data, '$.state') AS state, " +
        "json_extract(data, '$.verdict.at') AS judgedAt, data -> '$.verdict.time' AS judgedTime, " +
        "json_extract(data, '$.integrated.at') AS landedAt, data -> '$.integrated.time' AS landedTime, json_extract(data, '$.integrated.mainAfter') AS mainAfter, " +
        "json_extract(data, '$.integrated.tests.mergeClass.class') AS mergeClass, " +
        "json_type(data, '$.tested') AS tested, json_extract(data, '$.tested.at') AS testedAt, data -> '$.tested.time' AS testedTime, " +
        "json_type(data, '$.tested.relatedOnly') AS relatedOnly, data -> '$.tested.wholeSuiteBecause' AS wholeSuiteBecause, " +
        "json_type(data, '$.takeBackOf') AS takeBackOf, json_extract(data, '$.bounced.at') AS bouncedAt, json_extract(data, '$.bounced.reason') AS bouncedReason " +
        'FROM records WHERE workspace_id = ? AND kind = ? AND deleted_at IS NULL ORDER BY id',
    )
    .all(workspaceId, MERGE_ENTRY_KIND) as EntryRow[]
}

function theReceipts(workspaceId: string): { id: string; data: Record<string, unknown> }[] {
  const rows = sqlite
    .prepare("SELECT id, data FROM records WHERE workspace_id = ? AND kind = 'whole_suite_receipt' AND deleted_at IS NULL ORDER BY id")
    .all(workspaceId) as { id: string; data: string }[]
  return rows.map((row) => ({ id: row.id, data: JSON.parse(row.data) as Record<string, unknown> }))
}

/**
 * THE FIX ROUNDS THE OFFICE OPENED, FROM THE CHANGE LOG. The office writes a round's opening as a merge of `opened`
 * alone onto the wait it started (lookAtTheFixRound in merge-state-machine.ts), so the change log keeps each opening as
 * one row at this one path, after the wait is dropped, whether the entry then landed or bounced.
 */
const FIX_ROUND_OPENED = 'data.waitsForAFixRound.opened'

function theFixRoundsOpened(workspaceId: string): { opened: string | null }[] {
  return sqlite
    .prepare('SELECT c.new_value AS opened FROM records r JOIN changes c ON c.record_id = r.id WHERE r.workspace_id = ? AND r.kind = ? AND r.deleted_at IS NULL AND c.field = ? ORDER BY c.append_order')
    .all(workspaceId, MERGE_ENTRY_KIND, FIX_ROUND_OPENED) as { opened: string | null }[]
}

const strings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((one): one is string => typeof one === 'string') : [])

/**
 * THE STABLE OFFICE AGAINST MAIN, READ NOW FROM GIT: the commit the stable checkout has out, main in the development
 * checkout, and how many commits main has that the stable commit does not. Unknown, in words, when this office has no
 * pair or git cannot say.
 */
export function theStableAgainstMain(pair: { serving: string; development: string } | null): StableAgainstMain {
  if (pair === null) return { state: 'unknown', why: sayInEnglish('mergeQueueMeasures.stable.noPair') }
  let serving: string
  let main: string
  try {
    serving = git(pair.serving, 'rev-parse', '--verify', 'HEAD^{commit}')
    main = git(pair.development, 'rev-parse', '--verify', 'refs/heads/main^{commit}')
  } catch (error) {
    return { state: 'unknown', why: sayInEnglish('mergeQueueMeasures.stable.gitSaid', { why: whyGitDidNotAnswer(error) }) }
  }
  const counted = theCommitsBehind(pair.development, serving, main)
  if ('why' in counted) return { state: 'unknown', why: sayInEnglish('mergeQueueMeasures.stable.gitSaid', { why: counted.why }) }
  return { state: 'read', serving, main, behind: counted.behind }
}

const git = (directory: string, ...args: string[]): string => readGit(directory, args, { timeoutMs: 10_000, maxBuffer: 1024 * 1024 }).toString('utf8').trim()

/** How many commits `main` has that `serving` does not, counted by git in the development checkout, or why git did not say. */
function theCommitsBehind(development: string, serving: string, main: string): { behind: number } | { why: string } {
  try {
    const behind = Number(git(development, 'rev-list', '--count', `${serving}..${main}`))
    return Number.isSafeInteger(behind) && behind >= 0 ? { behind } : { why: `git counted "${String(behind)}"` }
  } catch (error) {
    return { why: whyGitDidNotAnswer(error) }
  }
}

/** A landing placed at its moment, with the commit main became. */
interface Landing {
  ms: number
  mainAfter: unknown
}

/** A commit as the measures' sentences name it. */
const short = (commit: string): string => commit.slice(0, 7)

/** What one upgrade notice says the stable office ran from its moment on: a commit, or why that is not known. */
type StableFromANotice = { state: 'read'; serving: string } | { state: 'unknown'; why: string }

/**
 * THE COMMIT THE STABLE OFFICE RAN AT A MOMENT, FROM THE UPGRADE NOTICES. Each upgrade has a BEFORE notice and, once it
 * ended, an AFTER notice with its outcome. From a BEFORE until its AFTER the commit is not known. A completed upgrade
 * puts its new commit live; a refused one, or one that failed and was restored, leaves the earlier commit. One that
 * failed with the earlier version not shown to be back leaves it not known. Upgrades follow one another, so the
 * notices are read in the order they were filed, back to the last upgrade that had ended before `from`.
 *
 * A notice keeps only its stamp. One whose stamp names two moments, one each side of a moment asked about, or none,
 * cannot be placed before or after it, and says so.
 */
function theStableAtEachEnd(workspaceId: string, zone: string, from: number): (end: number) => StableFromANotice {
  type Said = { stamp: string; earliest: number | null; latest: number | null; says: StableFromANotice }
  const notices: Said[][] = []
  try {
    let older: string | undefined
    for (;;) {
      const page = stableUpgradeHistory(workspaceId, undefined, older)
      let reachedFrom = false
      for (const row of page.entries) {
        const at = (stamp: string, says: StableFromANotice): Said => ({ stamp, earliest: momentOfStampInZone(stamp, zone), latest: latestMomentOfStampInZone(stamp, zone), says })
        const said = [at(row.date, { state: 'unknown', why: sayInEnglish('mergeQueueMeasures.stableDay.upgrading', { at: row.date }) })]
        if (row.outcomeDate !== null) {
          const outcome = row.outcome
          said.push(
            at(
              row.outcomeDate,
              outcome === 'completed' || outcome === 'handed-off'
                ? { state: 'read', serving: row.toCommit }
                : outcome === 'refused' || outcome === 'failed-restored'
                  ? { state: 'read', serving: row.fromCommit }
                  : { state: 'unknown', why: sayInEnglish('mergeQueueMeasures.stableDay.notRestored', { at: row.outcomeDate }) },
            ),
          )
        }
        notices.unshift(said)
        const ended = said.at(-1)!
        if (row.outcomeDate !== null && ended.latest !== null && ended.latest <= from) {
          reachedFrom = true
          break
        }
      }
      if (reachedFrom || page.older === null) break
      older = page.older
    }
  } catch (error) {
    if (!(error instanceof PanelError && error.code === 'upgradeHistoryReadRefused')) throw error
    const why = sayInEnglish('mergeQueueMeasures.stableDay.unread', { why: error.message })
    return () => ({ state: 'unknown', why })
  }
  const said = notices.flat()
  return (end) => {
    let answer: StableFromANotice = { state: 'unknown', why: sayInEnglish('mergeQueueMeasures.stableDay.noNotice') }
    for (const one of said) {
      if (one.earliest !== null && one.earliest > end) break
      answer = one.latest !== null && one.latest <= end ? one.says : { state: 'unknown', why: sayInEnglish('mergeQueueMeasures.stableDay.noticeUnplaced', { at: one.stamp }) }
    }
    return answer
  }
}

/** The stable office's commit at a day's end against main's then, counted by git in the development checkout. */
function theCommitsBetween(development: string, serving: string, main: string): StableAgainstMain {
  const counted = theCommitsBehind(development, serving, main)
  if ('why' in counted) return { state: 'unknown', why: sayInEnglish('mergeQueueMeasures.stableDay.gitSaid', { serving: short(serving), main: short(main), why: counted.why }) }
  return { state: 'read', serving, main, behind: counted.behind }
}

/** The measures of the `days` calendar days that end now, with the stable office against main for `pair`. */
export function theQueuesMeasures(input: { workspaceId: string; now: Date; days: number; pair: { serving: string; development: string } | null }): QueueMeasures {
  const zone = theClockZone()
  const now = input.now.getTime()
  const days = theDays(now, input.days, zone)
  const blank = (): Omit<MeasuredDay, 'day' | 'from' | 'until' | 'hours' | 'submittedToLanded' | 'judgedToLanded' | 'mainRed' | 'stableAtDayEnd'> & { submitted: number[]; judged: number[]; unsubmitted: number; unjudged: number } => ({
    landed: 0,
    submitted: [],
    judged: [],
    unsubmitted: 0,
    unjudged: 0,
    tested: { relatedOnly: 0, wholeSuite: 0, wholeSuiteCases: {}, noChoiceRecorded: 0 },
    handBacks: 0,
    fixRounds: { total: 0, line: 0, sheriff: 0 },
    takeBacks: 0,
    bounced: { total: 0, byCause: {}, noCause: 0 },
    receipts: [],
  })
  const byDay = new Map(days.map((one) => [one.day, blank()]))
  let undated = 0

  // THE ENTRIES: landings and their waits, hand-backs, tests, take-backs and bounces.
  const landedAtCommit = new Map<string, number>()
  const landings: Landing[] = []
  const unplacedLandings: { earliest: number; latest: number }[] = []
  for (const row of theEntries(input.workspaceId)) {
    const submittedMs = momentOfAStoredStamp(row.createdAt, valueOf(row.submittedTime))
    if (row.state === 'merged') {
      const landedMs = momentOfAStoredStamp(row.landedAt, valueOf(row.landedTime))
      if (landedMs !== null && typeof row.mainAfter === 'string') landedAtCommit.set(row.mainAfter, landedMs)
      if (landedMs !== null) landings.push({ ms: landedMs, mainAfter: row.mainAfter })
      else {
        // A landing with no one moment lies somewhere between the moments its stamp can name, or anywhere when it names none.
        const stamp = typeof row.landedAt === 'string' ? row.landedAt : ''
        unplacedLandings.push({ earliest: momentOfStampInZone(stamp, zone) ?? -Infinity, latest: latestMomentOfStampInZone(stamp, zone) ?? Infinity })
      }
      const day = dayOf(landedMs, row.landedAt, zone)
      if (day === null) undated += 1
      const counts = day === null ? undefined : byDay.get(day)
      if (counts !== undefined) {
        counts.landed += 1
        const judgedMs = momentOfAStoredStamp(row.judgedAt, valueOf(row.judgedTime))
        if (landedMs === null || submittedMs === null || submittedMs > landedMs) counts.unsubmitted += 1
        else counts.submitted.push((landedMs - submittedMs) / MINUTE_MS)
        if (landedMs === null || judgedMs === null || judgedMs > landedMs) counts.unjudged += 1
        else counts.judged.push((landedMs - judgedMs) / MINUTE_MS)
        if (row.mergeClass === 2) counts.handBacks += 1
      }
    }
    if (row.tested === 'object') {
      const day = dayOf(momentOfAStoredStamp(row.testedAt, valueOf(row.testedTime)), row.testedAt, zone)
      if (day === null) undated += 1
      const tested = day === null ? undefined : byDay.get(day)?.tested
      if (tested !== undefined) {
        const because = valueOf(row.wholeSuiteBecause)
        if (Array.isArray(because) && because.length > 0) {
          tested.wholeSuite += 1
          const cases = new Set(because.map((one: unknown) => (one !== null && typeof one === 'object' ? (one as { case?: unknown }).case : undefined)).filter((one): one is number => typeof one === 'number'))
          for (const one of cases) tested.wholeSuiteCases[String(one)] = (tested.wholeSuiteCases[String(one)] ?? 0) + 1
        } else if (row.relatedOnly === 'object') tested.relatedOnly += 1
        else tested.noChoiceRecorded += 1
      }
    }
    if (row.takeBackOf === 'object') {
      const counts = byDay.get(dayOf(submittedMs, row.createdAt, zone) ?? '')
      if (counts !== undefined) counts.takeBacks += 1
    }
    if (row.state === 'bounced') {
      const day = dayOf(null, row.bouncedAt, zone)
      if (day === null) undated += 1
      const bounced = day === null ? undefined : byDay.get(day)?.bounced
      if (bounced !== undefined) {
        bounced.total += 1
        if (typeof row.bouncedReason === 'string' && row.bouncedReason !== '') bounced.byCause[row.bouncedReason] = (bounced.byCause[row.bouncedReason] ?? 0) + 1
        else bounced.noCause += 1
      }
    }
  }

  // THE FIX ROUNDS the office opened, each on the day it opened. A round for the starter is one its starter already had
  // going, so the office did not open it.
  for (const { opened } of theFixRoundsOpened(input.workspaceId)) {
    if (opened === null) continue
    const round = JSON.parse(opened) as { at?: unknown; for?: unknown }
    if (round.for !== 'line' && round.for !== 'sheriff') continue
    const day = dayOf(null, round.at, zone)
    if (day === null) undated += 1
    const counts = day === null ? undefined : byDay.get(day)
    if (counts === undefined) continue
    counts.fixRounds.total += 1
    counts.fixRounds[round.for] += 1
  }

  // THE RECEIPTS, listed on the day each ended. Each is placed in time at the landing of the commit it tested, or, for a
  // commit no entry landed, at the moment it ended. One whose moment cannot be read is listed and not placed.
  const marks: { ms: number; id: string; green: boolean }[] = []
  const receiptsNotPlaced: string[] = []
  for (const { id, data } of theReceipts(input.workspaceId)) {
    const green = wholeSuiteReceiptIsGreen(data)
    const commit = typeof data['commit'] === 'string' ? data['commit'] : ''
    const placed = landedAtCommit.get(commit) ?? momentOfAStoredStamp(data['endedAt'], null)
    if (placed === null) receiptsNotPlaced.push(id)
    else marks.push({ ms: placed, id, green })
    const day = dayOf(null, data['endedAt'], zone)
    if (day === null) undated += 1
    const listed = day === null ? undefined : byDay.get(day)
    if (listed === undefined) continue
    const alone = Array.isArray(data['aloneRuns']) ? (data['aloneRuns'] as { file?: unknown; outcome?: unknown }[]) : []
    const receipt: MeasuredReceipt & { endedAt: string } = {
      id,
      commit,
      green,
      failedFiles: strings(data['failedFiles']),
      redAlone: data['version'] === 2 ? alone.filter((one) => one.outcome !== 'green' && typeof one.file === 'string').map((one) => one.file as string) : null,
      endedAt: String(data['endedAt']),
    }
    listed.receipts.push(receipt)
  }
  marks.sort((a, b) => a.ms - b.ms || a.id.localeCompare(b.id))

  /** The hours from `from` to `until` that main was red, green, or not known, by the receipts placed before each moment. */
  function mainRedBetween(from: number, until: number): MeasuredDay['mainRed'] {
    const ms = { red: 0, green: 0, unknown: 0 }
    let state: keyof typeof ms = 'unknown'
    let cursor = from
    for (const mark of marks) {
      if (mark.ms <= from) {
        state = mark.green ? 'green' : 'red'
        continue
      }
      if (mark.ms >= until) break
      ms[state] += mark.ms - cursor
      cursor = mark.ms
      state = mark.green ? 'green' : 'red'
    }
    ms[state] += until - cursor
    return { red: tenths(ms.red / HOUR_MS), green: tenths(ms.green / HOUR_MS), unknown: tenths(ms.unknown / HOUR_MS) }
  }

  landings.sort((a, b) => a.ms - b.ms)
  const stableAt = theStableAtEachEnd(input.workspaceId, zone, days[0]!.from)
  const counted = new Map<string, StableAgainstMain>()
  /** The stable office at `end` against main then: the commit main became at the last landing before it. */
  function stableAgainstMainAt(end: number): StableAgainstMain {
    const stable = stableAt(end)
    if (stable.state === 'unknown') return stable
    const serving = stable.serving
    let last: Landing | null = null
    for (const one of landings) {
      if (one.ms > end) break
      last = one
    }
    if (unplacedLandings.some((one) => one.earliest <= end && (last === null || one.latest >= last.ms))) return { state: 'unknown', why: sayInEnglish('mergeQueueMeasures.stableDay.landingUnplaced', { serving: short(serving) }) }
    if (last === null) return { state: 'unknown', why: sayInEnglish('mergeQueueMeasures.stableDay.noLanding', { serving: short(serving) }) }
    if (typeof last.mainAfter !== 'string') return { state: 'unknown', why: sayInEnglish('mergeQueueMeasures.stableDay.mainNotSaid', { serving: short(serving) }) }
    const main = last.mainAfter
    if (input.pair === null) return { state: 'unknown', why: sayInEnglish('mergeQueueMeasures.stableDay.noPair', { serving: short(serving), main: short(main) }) }
    const key = `${serving}..${main}`
    let answer = counted.get(key)
    if (answer === undefined) {
      answer = theCommitsBetween(input.pair.development, serving, main)
      counted.set(key, answer)
    }
    return answer
  }

  const instant = (ms: number): string => clockStamp(() => new Date(ms)).instant
  const measures = days.map(({ day, from, until }): MeasuredDay => {
    const { submitted, judged, unsubmitted, unjudged, receipts, ...counts } = byDay.get(day)!
    return {
      day,
      from: instant(from),
      until: instant(until),
      hours: tenths((until - from) / HOUR_MS),
      ...counts,
      submittedToLanded: aWait(submitted, unsubmitted),
      judgedToLanded: aWait(judged, unjudged),
      receipts: [...receipts as (MeasuredReceipt & { endedAt: string })[]]
        .sort((a, b) => a.endedAt.localeCompare(b.endedAt) || a.id.localeCompare(b.id))
        .map(({ endedAt: _, ...one }) => one),
      mainRed: mainRedBetween(from, until),
      stableAtDayEnd: stableAgainstMainAt(until),
    }
  })
  return {
    days: input.days,
    timeZone: zone,
    from: instant(days[0]!.from),
    until: instant(now),
    measures,
    receiptsNotPlaced,
    undated,
    stable: theStableAgainstMain(input.pair),
    sources: Object.fromEntries(MEASURED_FIGURES.map((figure) => [figure, sayInEnglish(`mergeQueueMeasures.from.${figure}`)])) as QueueMeasures['sources'],
    estimated: [...ESTIMATED_FIGURES],
    notGiven: [sayInEnglish('mergeQueueMeasures.notGiven.testRuns'), sayInEnglish('mergeQueueMeasures.notGiven.stableWithinTheDay'), sayInEnglish('mergeQueueMeasures.notGiven.redAlone')],
  }
}
