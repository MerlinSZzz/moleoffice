// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE OFFICE'S OWN LOAD: THE THREE NUMBERS, THEIR RANGES AND THEIR DEFAULTS, DECLARED ONCE. Wave 13y round 21, on one
 * of the owner's decisions: development may use most of the machine, but the office itself must not waste it, and its
 * own read time, CPU and memory are shown with a reminder when one stays out of range.
 *
 * THE DEFAULTS ARE NOT DECIDED NUMBERS. The numbers are shown, and a number out of range brings a
 * reminder, but no range was decided. So each range is a setting with the default below, and the secretary card may change it
 * with a reason (src/server/api/office-load.ts). Why each default is what it is:
 *   readMs      1,000 ms. The median time of the office's reads in a minute. On a made-up office of the live size,
 *               read by one client at 24 reads a minute on 11 October 2026, the median of a minute was 60 to 296 ms and
 *               the slowest single read 0.9 to 1.9 s; GET /api/messages?limit=5 alone took 0.8 to 1.5 s. A median above
 *               a second for ten minutes is several times the worst minute seen, so it is a fault and not a busy minute.
 *   cpuPercent  50, as a share of one core. In the same run the office used 13 to 16 per cent in an ordinary minute,
 *               and 48 and 81 per cent in the two minutes in which the dead-letter sweep held the server for 50 and 46
 *               s. Half a core for ten minutes running is work nobody asked for.
 *   memoryMb    2,048 MB. On live on 10 October 2026 ordinary running had a median of 400 to 720 MB, with rises to
 *               1.5 to 2.65 GB (briefs/rss-samples-2026-10-10.log). A rise above 2 GB that lasts ten minutes is said.
 */

/** The three numbers, in the order the page draws them. */
export const OFFICE_LOAD_NUMBERS = ['readMs', 'cpuPercent', 'memoryMb'] as const
export type OfficeLoadNumber = (typeof OFFICE_LOAD_NUMBERS)[number]

/** Each range's top when nobody has chosen one. A reading above it is out of range. */
export const OFFICE_LOAD_DEFAULTS: Readonly<Record<OfficeLoadNumber, number>> = { readMs: 1_000, cpuPercent: 50, memoryMb: 2_048 }

/** The lowest and highest top a range may be given, so a typing slip cannot make every reading out of range or none. */
export const OFFICE_LOAD_BOUNDS: Readonly<Record<OfficeLoadNumber, readonly [number, number]>> = {
  readMs: [50, 60_000],
  cpuPercent: [5, 1_000],
  memoryMb: [256, 65_536],
}

/** A reading is taken once a minute. */
export const OFFICE_LOAD_EVERY_SECONDS = 60

/** A number is said to the secretary once it has been out of range at this many readings in a row: ten minutes. */
export const OFFICE_LOAD_READINGS_IN_A_ROW = 10

/** One minute's reading. */
export interface OfficeLoadReading {
  /** The local stamp the reading was taken at. */
  at: string
  /** How many reads the office answered in the minute, leaving out the requests that wait on purpose. */
  reads: number
  /** The median and the slowest time of those reads, or null because there were none. */
  readMedianMs: number | null
  readSlowestMs: number | null
  /** The office's own CPU time in the minute, as a share of one core. */
  cpuPercent: number
  /** The office process's resident memory when the reading was taken. */
  memoryMb: number
}

/** One range as it is in force. */
export interface OfficeLoadRange {
  number: OfficeLoadNumber
  /** The top in force: the one chosen, or the default. */
  top: number
  /** True when nobody has chosen one, and then the default is in force. */
  nobodyChose: boolean
  default: number
}

/** Where one number stands against its range. */
export interface OfficeLoadStanding {
  number: OfficeLoadNumber
  /** The value at the latest reading, or null because the latest reading had nothing to measure (no reads). */
  value: number | null
  /** How many readings in a row it has been out of range, up to the latest. */
  outFor: number
  /** The stamp of the first of those readings, or null because it is in range. */
  outSince: string | null
  /** The line the secretaries were told in about this run of readings, or null because they have not been told. */
  toldIn: string | null
}

/** The reading the page draws. */
export interface OfficeLoad {
  /** The latest reading, or null because none has been taken since the server started. */
  latest: OfficeLoadReading | null
  /** The readings of the last hour, oldest first. */
  lastHour: OfficeLoadReading[]
  ranges: OfficeLoadRange[]
  standing: OfficeLoadStanding[]
  everySeconds: number
  readingsInARow: number
  /** When this server started, so a reader knows how far back the readings can go. */
  serverStartedAt: string
}
