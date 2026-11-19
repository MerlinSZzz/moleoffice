// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE MERGE QUEUE'S MEASURES, AS GET /api/merge-queue/measures ANSWERS THEM: the shape the server writes
 * (src/server/lib/merge-queue-measures.ts) and the merge queue page draws (src/web/components/MergeQueueMeasures.tsx).
 */

/** How many days the door answers when it is not asked, and the most it answers. */
export const MEASURES_DAYS = { default: 7, most: 30 } as const

/** The figures the answer says the source of, in the order the page draws their rows. */
export const MEASURED_FIGURES = ['landed', 'submittedToLanded', 'judgedToLanded', 'tested', 'handBacks', 'fixRounds', 'takeBacks', 'bounced', 'receipts', 'mainRed', 'stableAtDayEnd', 'stable'] as const
export type MeasuredFigure = (typeof MEASURED_FIGURES)[number]

/** The figures that are estimates, said as such beside the figure. */
export const ESTIMATED_FIGURES = ['mainRed'] as const satisfies readonly MeasuredFigure[]

/** The waits of the entries that landed in a day, in minutes. An entry whose wait cannot be read is unmeasured. */
export interface MeasuredWait {
  measured: number
  unmeasured: number
  medianMinutes: number | null
  p90Minutes: number | null
}

/** One receipt of a run of the whole suite on main, listed on the day it ended. */
export interface MeasuredReceipt {
  id: string
  commit: string
  green: boolean
  /** The files red in the whole run. */
  failedFiles: string[]
  /** The files whose run alone was not green; null for a receipt of the first version, which ran none alone. */
  redAlone: string[] | null
}

/** One calendar day in the office's time zone, with the moments it starts and ends. The last day ends at the asking. */
export interface MeasuredDay {
  day: string
  from: string
  until: string
  hours: number
  landed: number
  submittedToLanded: MeasuredWait
  judgedToLanded: MeasuredWait
  /** The entries tested that day, each by the choice it kept from its last test. */
  tested: { relatedOnly: number; wholeSuite: number; wholeSuiteCases: Record<string, number>; noChoiceRecorded: number }
  handBacks: number
  /** The fix rounds the office opened that day, with the line's supervisor and with the build sheriff. */
  fixRounds: { total: number; line: number; sheriff: number }
  takeBacks: number
  bounced: { total: number; byCause: Record<string, number>; noCause: number }
  receipts: MeasuredReceipt[]
  /** Hours main was red, green, or not known, by the receipts. */
  mainRed: { red: number; green: number; unknown: number }
  /** The commit the stable office ran at the day's end, by the upgrade notices, against main then. */
  stableAtDayEnd: StableAgainstMain
}

/** The stable office against main: read now, or at a day's end. */
export type StableAgainstMain =
  | { state: 'read'; serving: string; main: string; behind: number }
  | { state: 'unknown'; why: string }

export interface QueueMeasures {
  days: number
  timeZone: string
  from: string
  until: string
  measures: MeasuredDay[]
  /** Receipts whose moment cannot be read, so the hours main was red do not use them. */
  receiptsNotPlaced: string[]
  /** Landings, tests, bounces, fix rounds and receipts whose stamp cannot be read at all, so no day counts them. */
  undated: number
  stable: StableAgainstMain
  sources: Record<MeasuredFigure, string>
  estimated: MeasuredFigure[]
  notGiven: string[]
}
