// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE FOUR FIGURES THE HOME PAGE LACKS, AS THE DOORS OF src/server/api/figures.ts ANSWER THEM. Wave 13s round 281: packages
 * per line by state, packages done per day, each package's time from taken to live, and the whole suite's minutes per
 * run. The reads are src/server/lib/figures-*.ts. Any page may ask them; nothing is stored.
 *
 * EACH FIGURE KEEPS NOTHING THERE APART FROM NOBODY RECORDED IT. A count is a number only where the records cover it,
 * and a time is a stamp only where the records hold it. Otherwise the field is null and the words beside it say why.
 */
import type { PackageState } from './delegation.ts'
import { medianOf } from './median.ts'

/** How many days a span covers when it is not asked, and the most it may cover. */
export const FIGURES_SPAN_DAYS = { default: 14, most: 92 } as const

/** The span a read was asked for: local days in the office's time zone, both ends included. */
export interface FiguresSpan {
  projects: string[]
  from: string
  to: string
  timeZone: string
}

/** A package that is there but cannot be read, named with its project rather than dropped. */
export interface FigureCouldNotRead {
  workspaceId: string
  recordId: string
  title: string
  because: string
}

/** One line's packages, by the state the delegation view gives each. The row of no line has `line` null. */
export interface PackagesOfALine {
  line: string | null
  byState: Record<PackageState, number>
  total: number
}

/** GET /api/figures/packages-by-line. A package with two lines counts in each; `inMoreThanOneLine` says how many do. */
export interface PackagesByLine {
  projects: string[]
  states: PackageState[]
  /** The named lines in order, then the row of no line, always last. */
  lines: PackagesOfALine[]
  /** The packages counted, each once. */
  packages: number
  inMoreThanOneLine: number
  couldNotRead: FigureCouldNotRead[]
  says: string
}

/** One day's packages done: a count where the records cover the day, else null with the words for why. */
export interface PackagesDoneOnADay {
  day: string
  done: number | null
  notRecorded: string | null
}

/** GET /api/figures/packages-done. */
export interface PackagesDonePerDay extends FiguresSpan {
  /** The first day the records cover: the day the first package was made. Null when no package was ever made. */
  recordedFrom: string | null
  days: PackagesDoneOnADay[]
  total: number
  says: string
}

/** A stage's time, or the words for why the records do not hold it. */
export type StageTime = { at: string; notRecorded: null } | { at: null; notRecorded: string }

/** The stages of a package's way to the live office, in order. */
export const TIME_TO_LIVE_STAGES = ['taken', 'handedBack', 'onMain', 'live'] as const
export type TimeToLiveStage = (typeof TIME_TO_LIVE_STAGES)[number]

/** The stretches whose medians the reply gives, in the order it gives them. */
export const TIME_TO_LIVE_STRETCHES = [
  ['taken', 'handedBack'],
  ['handedBack', 'onMain'],
  ['onMain', 'live'],
  ['taken', 'live'],
] as const satisfies readonly (readonly [TimeToLiveStage, TimeToLiveStage])[]

/** One package first taken inside the span, with each stage after the take. */
export interface PackageTimeToLive {
  workspaceId: string
  recordId: string
  title: string
  taken: string
  handedBack: StageTime
  onMain: StageTime
  live: StageTime
}

/** The median minutes of one stretch, over the packages that have both of its times. */
export interface StretchMedian {
  from: TimeToLiveStage
  to: TimeToLiveStage
  minutes: number | null
  over: number
}

/** GET /api/figures/time-to-live. */
export interface TimeToLive extends FiguresSpan {
  packages: PackageTimeToLive[]
  medians: StretchMedian[]
  says: string
}

/** One run of the whole suite, from its receipt: its minutes, or null with the words for why. */
export interface SuiteRunMinutes {
  workspaceId: string
  recordId: string
  commit: string | null
  green: boolean
  startedAt: string | null
  endedAt: string | null
  minutes: number | null
  notRecorded: string | null
}

/** GET /api/figures/suite-minutes. */
export interface WholeSuiteMinutes extends FiguresSpan {
  runs: SuiteRunMinutes[]
  median: { minutes: number | null; over: number }
  says: string
}

/** A number of minutes to one decimal place, so a figure carries no rounding noise. */
export function minutesBetween(fromMs: number, toMs: number): number {
  return Math.round((toMs - fromMs) / 6_000) / 10
}

/** The median of some minutes, to one decimal place as each of them is, or null when there are none. */
export function theMedianMinutes(minutes: readonly number[]): number | null {
  const median = medianOf(minutes)
  return median === null ? null : Math.round(median * 10) / 10
}

/** The day `n` days after a `YYYY-MM-DD` day; `n` may be below 0. A day names a date and no moment, so no zone is asked. */
export function theDayAfter(day: string, n: number): string {
  const [year, month, date] = day.split('-').map(Number)
  return new Date(Date.UTC(year!, month! - 1, date! + n)).toISOString().slice(0, 10)
}

/** Every day from `from` to `to`, both included. */
export function theDaysOfASpan(from: string, to: string): string[] {
  const days: string[] = []
  for (let day = from; day <= to; day = theDayAfter(day, 1)) days.push(day)
  return days
}

/**
 * THE UPGRADE THAT FIRST PUT A LANDING ON THE LIVE OFFICE, or null when the records hold none. It is the earliest completed
 * upgrade at or after the landing whose new commit is main as this landing left it, or as a later landing left it: a
 * later main holds this landing too. An upgrade to any other commit is not counted, because the records cannot say
 * whether that commit holds the landing.
 */
export function theFirstUpgradeThatRanIt<U extends { ms: number; toCommit: string }>(
  landed: { ms: number; mainAfter: string | null },
  landings: readonly { ms: number; mainAfter: string | null }[],
  upgrades: readonly U[],
): U | null {
  const holdingIt = new Set(landings.filter((one) => one.ms >= landed.ms && one.mainAfter !== null).map((one) => one.mainAfter))
  if (landed.mainAfter !== null) holdingIt.add(landed.mainAfter)
  let first: U | null = null
  for (const upgrade of upgrades) {
    if (upgrade.ms < landed.ms || !holdingIt.has(upgrade.toCommit)) continue
    if (first === null || upgrade.ms < first.ms) first = upgrade
  }
  return first
}

/** The most settling links one read of his decisions reads. A span that holds more says so and counts the first ones. */
export const MY_DECISIONS_READ_AT_MOST = 1_000

/** One day of his decisions: the forks he settled that day, and the average minutes each had waited on him. */
export interface MyDecisionsOnADay {
  day: string
  settled: number
  /** Null on a day he settled none, or none whose wait could be timed. */
  averageMinutes: number | null
}

/**
 * GET /api/figures/my-decisions. The forks the person settled inside the span, by the day the settling link was made,
 * each counted once: a fork that is the person's to settle, settled by a decision a person linked. A fork waits on him
 * from when it was filed to when he settled it, and `averageMinutes` is the average of those waits; null when he settled
 * none, which is not known and not 0. `notTimed` counts the forks whose two moments name no single moment on the
 * office's clock; `cut` says the span held more settling links than one read reads.
 */
export interface MyDecisions extends FiguresSpan {
  settled: number
  averageMinutes: number | null
  notTimed: number
  days: MyDecisionsOnADay[]
  cut: boolean
  says: string
}
