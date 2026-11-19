// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT GET /api/merge-queue ADDS FOR THE MERGE QUEUE PAGE, in wave 13p round 30, by option A of a
 * decision.
 *
 * The server works these out from the merge entries, in `theQueuePageReading` in
 * src/server/lib/merge-queue-page.ts, and hands them on in the same reply as the lanes. The page draws them and works
 * nothing out again, so the page and the server cannot disagree about a count.
 *
 * A COUNT THAT CANNOT BE MADE IS NULL, NEVER 0. `landed: 0` means the office read every merged entry and none
 * landed in the window. `aboardEach: null` means no bus ran in the window, so there is nothing to average.
 * Each `unreadable` counts the entries whose stamp could not be read, so a reader knows the count left them out.
 */

import type { MovedFirst, PressToLand, UnreadableEntry } from './merge-queue.ts'
import type { EmergencyPushReading } from './emergency-push.ts'
import { THE_OFFICE_WRITER_ID, type ParticipantRef } from './participants.ts'

/** The queue's speed over the last 24 hours, read off this project's merge entries. */
export interface QueueSpeed {
  /** The moment the speed was worked out, and the start of its window, both as stored stamps. */
  at: string
  since: string
  /** Merged entries whose landing (`integrated.at`) falls in the window. */
  landed: number
  /** Merged entries, at any time, whose landing moment cannot be read, so they are not counted anywhere. */
  landedUnreadable: number
  buses: {
    /** Buses whose suite ended in the window (`tested.at` on the driver). A driver keeps only its last bus. */
    ran: number
    /** Entries aboard each of those buses on average, the driver included, to one decimal; null when no bus ran. */
    aboardEach: number | null
    /** Drivers naming a bus whose suite-end moment cannot be read. */
    unreadable: number
  }
  judgedToLanded: {
    /** The median minutes from the verdict (`verdict.at`) to landing, over the entries landed in the window; null for none. */
    medianMinutes: number | null
    /** How many landed entries the median is over. */
    measured: number
    /** Landed entries in the window whose verdict moment cannot be read, or falls after the landing. */
    unreadable: number
  }
}

/** The newest bus a lane's driver recorded, from its `tested` step. */
export interface LaneBus {
  driver: string
  driverState: string
  /** When its suite ended, as stored. */
  at: string
  /** Whether the suite passed, or null when the step did not say. */
  green: boolean | null
  /** The riders in landing order, the driver not among them. */
  riders: string[]
  /** The entries it passed over because files their release read would change on its tree. */
  passedForACheck: string[]
  /** The entries it passed over because they are tested alone (problem gYWdWJQcxyuZ). */
  passedAlone: string[]
}

/** One lane as the page draws it: its newest bus and the order its entries in this reply will land in. */
export interface QueuePageLane {
  lane: string
  bus: LaneBus | null
  /** The ids of this reply's entries in the lane, in the order they will land, by the rules the merge tool follows now. */
  order: string[]
  /**
   * The entries a move to the front would move (wave 13p round 31): still being checked or waiting, not moved already,
   * not holding the lane, not riding the bus, and with an entry ahead of them that a moved entry would pass: one neither
   * holding the lane, nor moved, nor judged on the lane's newest bus as a rider or an entry it passed over.
   */
  movable: string[]
}

/**
 * WHAT A SENTENCE CALLS AN ENTRY, in wave 13p round 31: its wave and the title of the run that
 * sealed it, as in 13p's "draw the docs sidebar". `wave` is read off the git branch: the part after `wave-` up to the
 * next hyphen when the branch starts with `wave-`, the whole branch when it does not, and null for an entry with no
 * branch. `work` is the run's title, without a leading "Wave 13p, " that would say the wave twice, or the entry's own
 * title when the run cannot be read in this project. The id is not in the name; the page draws it small beside a row.
 */
export interface EntryName {
  wave: string | null
  work: string
}

/** What GET /api/merge-queue adds for the page, beside `lanes` and `says`. */
export interface QueuePageReading {
  speed: QueueSpeed
  /**
   * `submitters` names who submitted each entry of the reply, by the handle the registry gives its `submittedBy`, and
   * holds null where no registry row answers that reference, so the page says it cannot be read instead of guessing.
   * `movers` does the same for who moved an entry to the front (`movedFirst.by`), and holds only the entries moved.
   * `pressers` does the same for who pressed an entry to land (`pressToLand.pressed.by`), and holds only the entries pressed.
   * `names` names every entry the page mentions: the rows, the lane holders, the bus's seats and the entries a row
   * waits behind. An id that is an entry of another project holds `another-project`, and an id with no merge entry
   * record at all holds `no-record`, so the page says which instead of naming it.
   */
  page: {
    lanes: QueuePageLane[]
    submitters: Record<string, string | null>
    movers: Record<string, string | null>
    pressers: Record<string, string | null>
    names: Record<string, EntryName | 'another-project' | 'no-record'>
  }
}

/**
 * WHETHER AN ENTRY RODE THE LANE'S NEWEST BUS AND MAY STILL USE ITS RESULT: it is judged, it is a rider, and the bus did
 * not fail. The page's words and the server's `movable` both read it here.
 */
export function ridesTheBus(row: { id: string; state: string }, bus: LaneBus | null): boolean {
  return bus !== null && bus.green !== false && row.state === 'judged' && bus.riders.includes(row.id)
}

/**
 * WHETHER THE OFFICE ITSELF SUBMITTED AN ENTRY, as it does for a sealed round of a line that is turned on (wave 13u round
 * 93). The queue page's row and the entry's own page both read it here, so the two say the same words for the same
 * entries (wave 13u round 98).
 */
export function submittedByTheOffice(who: { kind?: unknown; id?: unknown }): boolean {
  return who.kind === 'agent' && who.id === THE_OFFICE_WRITER_ID
}

/** WHY THE MERGE TOOL HOLDS A JUDGED ENTRY, as the page reads `toolWaits` (`ToolWaits` in src/server/lib/merge-queue.ts). */
export type QueueToolWaits =
  | { because: 'the-queue-is-held'; says: string }
  | { because: 'the-lane-is-held'; holder: string; says: string }
  | { because: 'deletes-not-confirmed'; deletes: number; says: string }
  | { because: 'a-rider-goes-first' | 'an-entry-passed-over-for-a-check-goes-first' | 'an-entry-tested-alone-goes-first'; first: string; driver: string; says: string }
  | { because: 'a-moved-entry-goes-first'; first: string; says: string }
  | { because: 'a-returning-entry-goes-first'; first: string; says: string }
  | { because: 'waits-for-a-press'; paths: string[]; says: string }

/** The fields of one entry the page reads, out of the whole entry GET /api/merge-queue hands on. */
export interface QueueEntryRow {
  id: string
  title: string
  state: string
  lane: string
  occupies: string | null
  submittedAt: string
  /** The moment it was submitted, as an instant with its offset. Absent when nobody can tell (`MergeEntryReading`). */
  submittedInstant?: string
  submittedBy: { kind: string; id: string }
  machine: Record<string, unknown>
  toolWaits?: QueueToolWaits
  /** Who moved it to the front, when and why, as POST /api/merge-queue/<id>/first wrote it, with the office's sentence. */
  movedFirst?: MovedFirst & { says: string }
  /** The paths that land only after a press, and the press once given. Absent when there are none. */
  pressToLand?: PressToLand
}

/**
 * THE FIELDS OF ONE ENTRY THE PAGE READS (wave 13u round 123): what GET /api/merge-queue?shape=page keeps of each whole
 * entry. The two lines below it make the compiler refuse this list the day it stops naming every field of `QueueEntryRow`.
 */
export const QUEUE_ENTRY_ROW_FIELDS = ['id', 'title', 'state', 'lane', 'occupies', 'submittedAt', 'submittedInstant', 'submittedBy', 'machine', 'toolWaits', 'movedFirst', 'pressToLand'] as const satisfies readonly (keyof QueueEntryRow)[]
type EveryRowFieldIsListed = Exclude<keyof QueueEntryRow, (typeof QUEUE_ENTRY_ROW_FIELDS)[number]> extends never ? true : never
const EVERY_ROW_FIELD_IS_LISTED: EveryRowFieldIsListed = true
void EVERY_ROW_FIELD_IS_LISTED

/**
 * THE PARTS OF AN ENTRY'S MACHINE THE PAGE READS: the class it was tested at, what a check-again reads, the resolution
 * and its check, and whether it waits for a fix round (src/web/pages/MergeQueuePage.tsx and
 * src/web/components/MergeQueueFixRound.tsx).
 */
export const QUEUE_ENTRY_ROW_MACHINE = ['tested', 'reinspection', 'resolving', 'resolution', 'waitsForAFixRound'] as const

/** GET /api/merge-queue as the page reads it. */
export interface MergeQueueReply extends QueuePageReading {
  lanes: { lane: string; occupiedBy: { entry: string; workspaceId: string; state: string } | null; entries: QueueEntryRow[] }[]
  says: string
  workspaceId: string
  /** The emergency pushes to main in these lanes, the newest first, at most EMERGENCY_PUSHES_SHOWN (wave 13u round 82). */
  emergencyPushes: EmergencyPushReading[]
  /**
   * WHO HELD THE QUEUE, WHEN AND WHY (wave 13u round 93), or null while it is not held. The server always sends it; it is
   * optional only because a test may draw the page from a reply made by hand, and the page then draws no hold.
   */
  held?: QueueHeld | null
  /**
   * EACH ENTRY THE QUEUE CANNOT READ, which the lanes leave out (wave 13u round 99). The server always sends it; it is
   * optional for the reason `held` is, and the page then draws none.
   */
  unreadable?: UnreadableEntry[]
}

/**
 * THE HOLD ON THE MERGE QUEUE, as the settings log recorded the change that held it. Each part is null when the queue is
 * held by the setting's own file, or by a change the log does not hold, so nobody recorded who, when or why.
 */
export interface QueueHeld {
  by: ParticipantRef | null
  at: string | null
  because: string | null
}
