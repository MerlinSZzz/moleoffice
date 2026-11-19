// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * BOOKINGS OF THE HOST GPU: THE LINE, GOING FIRST, AND THE END OF A BOOKING.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS DECIDED, AND BY WHOM
 * ---------------------------------------------------------------------------------------
 *
 * Everyone books, the owner included; the owner's booking may go first, and they may let the others
 * finish first. A second decision approved the design in report peyJSnLoz_Bk and set
 * who grants an agent's request to go first. The owner may, with a press; as a rule
 * the secretaries concerned decide; and when the agents of two secretaries clash, a group is opened
 * with the applying agent, the agent using the resource and both secretaries, the way a work-area
 * overlap is settled. The
 * group is opened by `openTheGroupOnce` in lib/claims.ts, and the secretary an agent answers to is read
 * by `theSecretaryAgentAnswersTo` there, so neither is written a second way.
 *
 * The shape was agreed (messages L0ZsT2z9ZKQW and sw9PGUtZN72K): the card's size comes from
 * the watcher's latest reading, a booking names the sandbox its work runs in, and its program is a process
 * group or a ledger row.
 *
 * ---------------------------------------------------------------------------------------
 * THE LINE
 * ---------------------------------------------------------------------------------------
 *
 * A booking is a time window and an amount of card memory it declares. Since round 38 (see below), a
 * booking is placed at the time asked for, by a decision. The GiB declared may add up to
 * more than the card. An agent that asks for "when-free" waits, by its own choice, for the earliest time its GiB
 * fit. Nothing here is kept in memory except the watcher's reading, so a restart loses no place in the line.
 *
 * THE OWNER'S "cutIn" IS THEIR OWN PRESS. Their booking is placed at the time it names, whether or not they send it.
 * When they do, it acts on the RUNNING bookings in their time: "now" — each holder is told and has GRACE_MINUTES
 * to stop, and its booking is moved to start when theirs ends — or "after": theirs starts when the running ones end.
 *
 * AN AGENT ASKS TO GO FIRST, ahead of one booking. Until the request is granted its booking keeps its
 * place. Granted, it starts at the time it asked for, or now, and nobody is moved. The request lapses when the
 * applicant's own turn comes.
 *
 * ---------------------------------------------------------------------------------------
 * THE END OF A BOOKING (THE RETURN RULE)
 * ---------------------------------------------------------------------------------------
 *
 * A running booking ends when its program ends, read by `theProcessGroupsLiveness` (the slots' own
 * reading) or `theLedgerRowsLiveness`. Like a slot, this is done only on a write: every booking write and
 * every reading the watcher hands in settles first. A GET changes nothing and names such a booking as
 * "its program has ended". Running over the end time never ends a booking.
 *
 * ---------------------------------------------------------------------------------------
 * ROUND TWO (wave 13s round 35): A DAILY BOOKING, RUNNING OVER, AND A JOB WITH NO BOOKING
 * ---------------------------------------------------------------------------------------
 *
 * A booking may repeat daily (report peyJSnLoz_Bk, part 3). Settling writes the next day's booking once,
 * when this day's time comes or its program ends, at the time first asked for. It is placed like an agent's
 * booking with a set time, so it moves nobody, and its holder is told when it could not keep its time.
 *
 * Settling also tells a running-over booking's holder and the next booker, once for each next booking whose
 * time has come and whose memory does not fit beside the bookings running (`tellTheOverRuns`). A reading
 * tells a booking's holder and the owner, once for each process with no booking that is on the card during
 * it (`tellOfTheJobsWithoutABooking`). Which of these lines wakes its reader is said in lib/notices.ts.
 *
 * The GPU tool (tools/gpu.mjs) records what a use was with POST /api/bookings/<id>/use (`recordAUse`). A caller
 * that does not read the card, as the sandbox launcher's `down`, asks for the peak the watcher's readings saw for
 * the booking's sandbox (`keepThePeaks`, round 36).
 *
 * ---------------------------------------------------------------------------------------
 * ROUND 37: A BOOKING WITH A PROGRAM LASTS UNTIL THE PROGRAM ENDS, AND A BOOKING CAN BE EXTENDED
 * ---------------------------------------------------------------------------------------
 *
 * A booking 19:03 was planned to end at ran its job to about 21:30, and the page said 19:03. A running booking
 * now says it lasts until its program ends (`theEndOf`). Its planned end is said as planned. An expected end is
 * said only where the program reported how far it is, with POST /api/bookings/<id>/progress (`reportProgress`),
 * and it is worked out from that report and the program's start alone. A booking with no program keeps its
 * fixed end.
 *
 * Its holder or a secretary extends a booking with POST /api/bookings/<id>/extend (`extendABooking`), with a
 * reason. The longer time moves nobody.
 *
 * ---------------------------------------------------------------------------------------
 * ROUND 38: THE GPU RULE ONLY REMINDS, AND THE OWNER MAY EXTEND ANY BOOKING
 * ---------------------------------------------------------------------------------------
 *
 * A decision replaced QQn47N5d284x.
 * There is no hard gate on GPU memory. Bookings stay, so everyone sees who is
 * on the card. When the GiB that bookings running together declare
 * go over the card, every holder of them is reminded, with each declaration, the total and the card's size
 * (`remindOfTheCard`), and nothing is refused or moved for it: not by the book door, the extend door, a granted
 * request to go first, or a daily booking's next day. When the card has not been read since the server started,
 * the reminder says so.
 *
 * The owner extends any booking, with a reason, as its holder does. That is the reading for round 38, recorded
 * as decision kFPdCQrt9kRn. A decision says nothing about who may extend a booking.
 */

import { z } from 'zod'
import { nothingWrittenSentence } from './records/patching.ts'

import {
  BOOKING_KIND,
  BOOKING_REPEATS,
  BOOKING_RESOURCES,
  CUT_IN_CHOICES,
  CUT_IN_STEPS,
  GRACE_MINUTES,
  LIVE_BOOKING_STATES,
  A_READING_IS_OLD_AFTER_MINUTES,
  THE_LONGEST_BOOKING_MINUTES,
  cardGiBOf,
  gibOfMiB,
  type BookingRepeat,
  type BookingState,
  type CutInChoice,
  type CutInStep,
  type GoFirstState,
} from '@shared/bookings.ts'
import { SYSTEM_LINES, type AnOfficeLine } from '@shared/groups.ts'
import { participantKey, sameParticipant } from '@shared/messages.ts'
import { moleOffice, type ParticipantRef } from '@shared/participants.ts'
import { THE_PERSON } from '@shared/person.ts'
import { latestMomentOfStampInZone, localStamp, momentOfStampInZone, parseLocalStamp, stampInZone, theClockZone } from '@shared/time.ts'
import { kindWord } from '@shared/words.ts'
import type { PanelRecord } from '@shared/types.ts'
import { sqlite } from '../db/client.ts'
import { asTheBookingDoors } from './booking-door.ts'
import { openTheGroupOnce, theSecretaryAgentAnswersTo } from './claims.ts'
import { isTheGpuWatcher, onlyTheGpuWatcherOrTheOwner } from './gpu-watcher.ts'
import { handleOf, writeASystemLineToOne } from './groups.ts'
import { participantForActor } from './participant-for-actor.ts'
import { readParticipant } from '../db/read-participant.ts'
import { createRecordWithReport, getRecord, patchRecord, aRaiseCarriesIt, recordInWorkspace, type Actor } from './records.ts'
import { thePersonIsProved } from '@shared/the-person-proved.ts'
import { PanelError } from './panel-error.ts'
import {
  liveRowById,
  osProbe,
  theGroupThatWouldHoldASlot,
  theLedgerRowsLiveness,
  theProcessGroupsLiveness,
  type Liveness,
} from './resources.ts'
import { writeShortForms } from './zoom.ts'
import { holdsTheSecretaryCard } from './holds-the-secretary-card.ts'
import { gatePosition, settingValue } from '../../config/settings.mjs'
import { gateMet, gateMetOnceTheWriteIsTakenBack } from './gate-counts.ts'

function theOffice(): Actor { return { type: 'system', id: moleOffice().id } }
const THE_OWNER: ParticipantRef = { kind: 'person', id: THE_PERSON }
const MINUTE = 60_000

/**
 * THE LEAD A BOOKING LINE TO A PERSON CARRIES: the Resources page, where their Grant and Refuse presses and
 * their bookings are. Chapter 10 rule 4: a line to the owner leads them to the page, and names no door,
 * command or id. A line to an agent carries none, because an agent answers through the door its line names.
 */
export const aLeadToTheResourcesPage = { target: { kind: 'page', route: '/resources' } } as const

/** Sends one booking line, in the form its reader takes: a person's with the lead, an agent's as it is. */
function tellOneOfABooking(to: ParticipantRef, workspaceId: string, line: (toAPerson: boolean) => AnOfficeLine): void {
  const toAPerson = to.kind === 'person'
  writeASystemLineToOne(to, workspaceId, line(toAPerson), theOffice(), undefined, undefined, toAPerson ? aLeadToTheResourcesPage : undefined)
}

// ============================================================================ the stored shape

export interface BookingProgram {
  pgid?: number
  leaderStartedAt?: string
  row?: string
  rowProject?: string
  says: string
  namedAt: string
}

export interface BookingGoFirst {
  ahead: string
  state: GoFirstState
  secretaries: ParticipantRef[]
  answers: { by: ParticipantRef; grant: boolean; at: string }[]
  group?: string
  askedAt: string
  settledAt?: string
}

export interface BookingCutIn {
  choice: CutInChoice
  graceUntil?: string
  moved: string[]
  actions: { sandbox: string; did: CutInStep; at: string }[]
}

export interface BookingData {
  resource: 'gpu'
  gib: number
  minutes: number
  purpose: string
  holder: ParticipantRef
  startAsked: 'now' | 'at' | 'when-free'
  askedFor?: string
  startsAt: string
  endsAt: string
  state: BookingState
  endedBecause?: string
  sandbox?: string
  program?: BookingProgram
  goFirst?: BookingGoFirst
  cutIn?: BookingCutIn
  movedBecause?: string
  /** 'daily': the office books the same time the next day when this day's time comes. */
  repeat?: BookingRepeat
  /** The first booking of a daily series, on every later day's booking. */
  repeatOf?: string
  /** The next day's booking, once the office has written it. */
  nextDay?: string
  /** The next bookings whose holders were told this one runs over, so each is told once. */
  overRunTold?: string[]
  /** Earlier notices by pid. No longer written; read to keep notices once for each job. */
  unbookedTold?: number[]
  /** The jobs with no booking that its holder was told of, by job key, once for each job. */
  unbookedJobsTold?: string[]
  /** What the GPU tool recorded of the use, when the tool ran it. */
  use?: BookingUse
  /** How far its program said it was, the newest report only. Taken off with the program. */
  progress?: BookingProgress
  /** Each time its end was moved later by the extend door, in order. */
  extensions?: BookingExtension[]
}

/** HOW FAR A RUNNING BOOKING'S PROGRAM SAID IT WAS: `done` of `of` steps, at `at` (round 37). */
export interface BookingProgress {
  done: number
  of: number
  at: string
}

/** ONE EXTENSION OF A BOOKING: its end before and after, why, who asked and when (round 37). */
export interface BookingExtension {
  from: string
  to: string
  because: string
  by: ParticipantRef
  at: string
}

/** WHAT ONE USE WAS, as the GPU tool recorded it when the process group ended. */
export interface BookingUse {
  startedAt: string
  endedAt: string
  minutes: number
  /**
   * The most card memory the group held at one reading. Left out when it could not be read: a kind stores no
   * null, and `peakSays` says why.
   */
  peakMiB?: number
  /** How the peak was read, or why it could not be. */
  peakSays: string
  /** How the command ended: "exit 0", "signal SIGTERM". */
  ended: string
  recordedAt: string
}

/** One booking as the doors work with it. */
export interface Booking {
  id: string
  workspaceId: string
  title: string
  data: BookingData
  /** Its window in milliseconds, read from its stamps once. */
  start: number
  end: number
}

function asBooking(record: PanelRecord): Booking {
  const data = record.data as unknown as BookingData
  const start = parseLocalStamp(data.startsAt)
  const end = parseLocalStamp(data.endsAt)
  if (start === null || end === null) {
    throw new PanelError(
      `Booking ${record.id} holds a start or an end the office cannot read (${data.startsAt}, ${data.endsAt}), so it ` +
        'cannot be placed in the line. Nothing was written.',
      500,
    )
  }
  return { id: record.id, workspaceId: record.workspaceId, title: record.title, data, start, end }
}

/**
 * EVERY LIVE BOOKING, IN EVERY PROJECT, in line order: by start, then by when it was made. The host GPU
 * is one card whichever project books it.
 */
export function liveBookings(): Booking[] {
  const rows = sqlite
    .prepare(
      `SELECT id FROM records WHERE kind = ? AND deleted_at IS NULL
         AND json_extract(data, '$.state') IN (${LIVE_BOOKING_STATES.map(() => '?').join(', ')})
       ORDER BY created_at, rowid`,
    )
    .all(BOOKING_KIND, ...LIVE_BOOKING_STATES) as { id: string }[]
  return rows
    .map((row) => getRecord(row.id))
    .filter((record): record is PanelRecord => record !== null)
    .map(asBooking)
    .sort((a, b) => a.start - b.start)
}

/** One booking in this project, or the refusal for an id that names none. */
function theBooking(id: string, workspaceId: string): Booking {
  const record = recordInWorkspace(id, workspaceId)
  if (record.kind !== BOOKING_KIND) {
    throw new PanelError(`${id} is not a booking: it is a ${kindWord(record.kind).text}. Nothing was written.`, 409)
  }
  if (record.deletedAt !== null) throw new PanelError(`Booking ${id} was deleted. Nothing was written.`, 404)
  return asBooking(record)
}

function stamp(ms: number): string {
  return localStamp(new Date(ms))
}

/** A time as a person reads it in a sentence: HH:MM today, the date as well on another day. */
function said(ms: number, now: number): string {
  const full = stamp(ms)
  return full.slice(0, 10) === stamp(now).slice(0, 10) ? full.slice(11, 16) : full.slice(0, 16)
}

function nameOfWho(who: ParticipantRef): string {
  return who.kind === 'person' ? 'The owner' : handleOf(who)
}

// ============================================================================ who is asking

function theCallerOrARefusal(actor: Actor, doing: string): ParticipantRef {
  const me = participantForActor(actor)
  if (me === null) {
    throw new PanelError(
      `${doing} needs a caller this office holds a registry row for, because a booking keeps who holds it. Nothing ` +
        `here answers to ${actor.type} "${actor.id}". Register with POST /api/agents/started first. Nothing was written.`,
      403,
    )
  }
  return me
}

/** Whether the caller is the owner, proved: their key, or the office's own trust where it gives them that. */
function isTheOwner(actor: Actor): boolean {
  return actor.type === 'human' && thePersonIsProved(actor)
}


// ============================================================================ the card

export type GpuProcessOwner =
  | { kind: 'sandbox'; name: string }
  | { kind: 'host'; unit: string }
  | { kind: 'unknown'; why: string }

export interface GpuReadingProcess {
  pid: number
  pgid: number | null
  mib: number
  who: GpuProcessOwner
}

/** The watcher's latest reading, as handed in, with when the office took it. */
export type GpuReading =
  | { readAt: string; totalMiB: number; usedMiB: number; processes: GpuReadingProcess[]; receivedAt: number }
  | { readAt: string; error: string; receivedAt: number }

/**
 * THE ONE SMALL STATE THE WATCHER OVERWRITES, held in the server's memory and never as a record (the agreed
 * point 4). A restart loses it until the next reading, 30 seconds at most, and GET says so meanwhile.
 */
let theLatestReading: GpuReading | null = null
/** The newest reading that had the card's total, so an error reading does not forget the card's size. */
let theLatestTotalMiB: number | null = null

/** For tests: forget every reading, as a restart does, and the week's count with them. */
export function forgetTheGpuReadings(): void {
  theLatestReading = null
  theLatestTotalMiB = null
  theWeek = null
  thePeaks.clear()
}

const A_PROCESS = z
  .object({
    pid: z.number().int().positive(),
    pgid: z.number().int().positive().nullable(),
    mib: z.number().nonnegative(),
    who: z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('sandbox'), name: z.string().trim().min(1) }).strict(),
      z.object({ kind: z.literal('host'), unit: z.string().trim().min(1) }).strict(),
      z.object({ kind: z.literal('unknown'), why: z.string().trim().min(1) }).strict(),
    ]),
  })
  .strict()

export const A_GPU_READING = z.union([
  z
    .object({
      readAt: z.string().trim().min(1),
      totalMiB: z.number().int().positive(),
      usedMiB: z.number().nonnegative(),
      processes: z.array(A_PROCESS),
    })
    .strict(),
  z.object({ readAt: z.string().trim().min(1), error: z.string().trim().min(1) }).strict(),
])

/** The card's size in GiB, or null because the watcher has handed in no total since the server started. */
export function theCardGiB(): number | null {
  return theLatestTotalMiB === null ? null : cardGiBOf(theLatestTotalMiB)
}

const THE_CARD_SIZE_IS_NOT_KNOWN =
  "The card's size is not known yet: the watcher has not read the card since the server started, so the office " +
  'cannot tell whether a booking fits. It does not guess. Try again after the next reading, within a minute.'

/** HAND IN A READING. The watcher or the person only. It settles first, like every booking write. */
export function takeAGpuReading(input: { said: z.output<typeof A_GPU_READING>; actor: Actor; now?: number }): {
  settled: string[]
  says: string
} {
  if (!isTheOwner(input.actor) && !isTheGpuWatcher(input.actor) && gateMet('who-reports-on-the-gpu') === 'block') {
    throw new PanelError(onlyTheGpuWatcherOrTheOwner('hands in a reading of the card'), 403)
  }
  const now = input.now ?? Date.now()
  const reading: GpuReading = { ...input.said, receivedAt: now }
  theLatestReading = reading
  if ('totalMiB' in input.said) theLatestTotalMiB = input.said.totalMiB
  const settled = asTheBookingDoors(() =>
    sqlite.transaction(() => {
      const acts = settle(now)
      if (!('error' in reading)) acts.push(...tellOfTheJobsWithoutABooking(reading, now))
      return acts
    })(),
  )
  const live = liveBookings()
  countTheReading(reading, live)
  keepThePeaks(reading, live)
  return {
    settled,
    says:
      'error' in input.said
        ? `The reading says the card could not be read: ${input.said.error}`
        : `Read: ${String(input.said.usedMiB)} of ${String(input.said.totalMiB)} MiB in use, by ${String(input.said.processes.length)} ` +
          `${input.said.processes.length === 1 ? 'process' : 'processes'}.`,
  }
}

/** A process on the card in words, as the Resources page names it. */
function theJob(p: GpuReadingProcess): string {
  const what = p.who.kind === 'sandbox' ? `Sandbox ${p.who.name}` : p.who.kind === 'host' ? `Host service ${p.who.unit}` : `Process ${String(p.pid)}`
  return `${what} (${String(gibOfMiB(p.mib))} GiB)`
}

/** The job a process belongs to. An unknown owner gives no reason to join two pids. */
function theJobKey(p: GpuReadingProcess): string {
  return p.who.kind === 'host' ? `host:${p.who.unit}` : p.who.kind === 'sandbox' ? `sandbox:${p.who.name}` : `pid:${String(p.pid)}`
}

/**
 * TELL OF A JOB WITH NO BOOKING ON THE CARD DURING A BOOKING. Every booking whose time it is, or that is
 * running, has its holder told once for each job, by host unit or sandbox, or by pid when neither is known.
 * A job's processes are counted together. Whether the booked memory still fits beside
 * the jobs with no booking decides which line: the quiet one, or the one that wakes because the job takes the
 * room. The owner is told the waking one only, once for each job across the pass, unless the owner holds the booking: a
 * line to the person carries the lead to the Resources page, and a lead is offered on their screen until they
 * read it, so a quiet line would not be quiet for them. The page shows them every job with no booking.
 *
 * AND ONLY WHEN THE SETTING IS ON: MOLE_OFFICE_TELL_THE_OWNER_OF_UNBOOKED_GPU_JOBS, off by default and changed
 * on the Settings page, says whether the owner is told at all. It is read at each pass, so a change counts at once.
 */
function tellOfTheJobsWithoutABooking(reading: Extract<GpuReading, { totalMiB: number }>, now: number): string[] {
  const card = theCardGiB()
  if (card === null) return []
  const live = liveBookings()
  const covering = live.filter((b) => b.data.state === 'running' || (b.start <= now && now < b.end))
  if (covering.length === 0) return []
  const unbooked = reading.processes.filter((p) => theBookingThatCounts(p, live) === undefined)
  if (unbooked.length === 0) return []
  const bookedGiB = covering.reduce((sum, b) => sum + b.data.gib, 0)
  const roomGiB = Math.max(0, Math.floor((card * 1024 - unbooked.reduce((sum, p) => sum + p.mib, 0)) / 1024))
  // THE JOB LEAVES NO ROOM only when the bookings would fit on the card without it. When they do not fit even so,
  // a booking runs over (`tellTheOverRuns` says so), and the job with no booking is not the cause.
  const fits = bookedGiB <= roomGiB || bookedGiB > card
  const told: string[] = []
  const toldTheOwner = new Set<string>()
  const theOwnerAsked = settingValue('MOLE_OFFICE_TELL_THE_OWNER_OF_UNBOOKED_GPU_JOBS') === '1'
  for (const b of covering) {
    const jobsTold = new Set(b.data.unbookedJobsTold ?? [])
    // EARLIER BOOKINGS KEPT PIDS. When a reading names their job, keep that key for its later pids too.
    for (const p of unbooked) {
      if ((b.data.unbookedTold ?? []).includes(p.pid)) jobsTold.add(theJobKey(p))
    }
    const fresh = unbooked.filter((p) => !jobsTold.has(theJobKey(p)))
    const jobs = new Map<string, GpuReadingProcess>()
    for (const p of fresh) {
      const key = theJobKey(p)
      const job = jobs.get(key)
      jobs.set(key, { ...p, mib: (job?.mib ?? 0) + p.mib })
    }
    for (const [key, p] of jobs) {
      const line = (whose: string | null, toAPerson: boolean): AnOfficeLine =>
        fits
          ? SYSTEM_LINES.aJobWithoutABookingSharesTheCard(theJob(p), whose, b.id, toAPerson)
          : SYSTEM_LINES.aJobWithoutABookingLeavesNoRoom(theJob(p), whose, b.id, bookedGiB, roomGiB, toAPerson)
      tellOneOfABooking(b.data.holder, b.workspaceId, (toAPerson) => line(null, toAPerson))
      if (!fits && theOwnerAsked && !sameParticipant(b.data.holder, THE_OWNER) && !toldTheOwner.has(key)) {
        toldTheOwner.add(key)
        tellOneOfABooking(THE_OWNER, b.workspaceId, (toAPerson) => line(nameOfWho(b.data.holder), toAPerson))
      }
      told.push(`${theJob(p)} is on the card with no booking during booking ${b.id}: its holder was told.`)
      jobsTold.add(key)
    }
    if (jobsTold.size > (b.data.unbookedJobsTold ?? []).length) {
      writeBooking(b, { unbookedJobsTold: [...jobsTold] }, theOffice())
    }
  }
  return told
}

// ============================================================================ the peak of a booking's sandbox

/**
 * THE MOST CARD MEMORY EACH BOOKING'S SANDBOX HELD, FROM THE WATCHER'S READINGS (point 4, message
 * WoQrUv8wrphx). The watcher names each process's sandbox every 30 seconds, so the office keeps the highest MiB per
 * sandbox per booking, and the launcher's `down` records the real peak through the use door without reading the
 * card itself. Like the week's count it is held in the server's memory and never as a record, so a restart loses
 * it; `since` is when the count began, and the use door says it.
 *
 * At a reading that saw the card, each live booking naming a sandbox is counted the MiB of all the reading's
 * processes in that sandbox together, which is 0 when none is on the card. An error reading is counted as unread.
 * A count is dropped when its booking's use is recorded.
 */
interface TheSandboxPeak {
  mib: number
  /** When the highest reading was taken, or null while no reading saw the card. */
  at: number | null
  since: number
  readings: number
  unread: number
}

/** By booking id and sandbox, so a booking whose sandbox is renamed starts a new count. */
const thePeaks = new Map<string, TheSandboxPeak>()

const peakKey = (bookingId: string, sandbox: string): string => `${bookingId}\u0000${sandbox}`

function keepThePeaks(reading: GpuReading, live: readonly Booking[]): void {
  for (const b of live) {
    const sandbox = b.data.sandbox
    if (sandbox === undefined) continue
    const key = peakKey(b.id, sandbox)
    const peak = thePeaks.get(key) ?? { mib: 0, at: null, since: reading.receivedAt, readings: 0, unread: 0 }
    thePeaks.set(key, peak)
    if ('error' in reading) {
      peak.unread += 1
      continue
    }
    const mib = reading.processes.reduce((sum, p) => (p.who.kind === 'sandbox' && p.who.name === sandbox ? sum + p.mib : sum), 0)
    peak.readings += 1
    if (peak.at === null || mib > peak.mib) {
      peak.mib = mib
      peak.at = reading.receivedAt
    }
  }
}

/** The peak the readings saw for a booking's sandbox, in the use door's words, or null with why. */
function thePeakFromTheReadings(b: Booking): { peakMiB: number | null; peakSays: string } {
  const sandbox = b.data.sandbox
  if (sandbox === undefined) {
    return {
      peakMiB: null,
      peakSays: `Booking ${b.id} names no sandbox, so the office counted none of the watcher's readings to it. Name the sandbox when naming the program.`,
    }
  }
  const peak = thePeaks.get(peakKey(b.id, sandbox))
  if (peak === undefined) {
    return {
      peakMiB: null,
      peakSays:
        `The office holds no reading of the card taken while booking ${b.id} ran in sandbox ${sandbox}. Either no reading came ` +
        'while it ran, or the server restarted since, and the count is kept in memory only.',
    }
  }
  const unread = peak.unread === 0 ? '' : `, and ${String(peak.unread)} ${peak.unread === 1 ? 'reading' : 'readings'} that could not read the card`
  if (peak.readings === 0 || peak.at === null) {
    return { peakMiB: null, peakSays: `No reading of the card succeeded while booking ${b.id} ran in sandbox ${sandbox}: ${String(peak.unread)} could not read it.` }
  }
  return {
    peakMiB: peak.mib,
    peakSays:
      `The highest total of sandbox ${sandbox}'s processes on the card in the GPU watcher's readings, at ${stamp(peak.at)}: ` +
      `${String(peak.readings)} ${peak.readings === 1 ? 'reading' : 'readings'} counted since ${stamp(peak.since)}${unread}. ` +
      'Readings before then are not in it.',
  }
}

// ============================================================================ this week's use

/**
 * THE BOOKING THAT ACCOUNTS FOR A PROCESS ON THE CARD: the one naming its sandbox, or the one whose program is
 * its process group. None means the process is on the card without a booking. Asked by the week's count and
 * by GET /api/resources/gpu, so the two never disagree about which use was booked.
 */
function theBookingThatCounts(p: GpuReadingProcess, live: readonly Booking[]): Booking | undefined {
  return live.find(
    (b) =>
      (p.who.kind === 'sandbox' && b.data.sandbox !== undefined && p.who.name === b.data.sandbox) ||
      (p.pgid !== null && b.data.program?.pgid === p.pgid) ||
      startedByTheBookedGroup(p, b),
  )
}

/** A cgroup that holds a whole user's processes, and so says nothing about which program started one of them. */
function theWholeUserSlice(unit: string): boolean {
  return unit === '' || unit.endsWith('.slice') || unit === 'init.scope' || /^user@\d+\.service$/.test(unit)
}

/** How far up the parent chain a process is followed before it is taken as no descendant. */
const THE_LONGEST_PARENT_CHAIN = 64

/**
 * WHETHER A HOST PROCESS ON THE CARD WAS STARTED BY A BOOKING'S PROGRAM IN A SESSION OF ITS OWN. A runner that
 * starts its workers under setsid gives each a process group of its own, so the group alone missed them and the
 * holder was told of a job with no booking during the booking that covered it. setsid keeps the cgroup, so the
 * workers sit in the booked group's scope: a host process whose unit is that scope counts for the booking. When
 * the booked group's cgroup is the whole user slice, the unit says nothing, and the parent chain decides: the
 * process counts when a process of the booked group is among its ancestors. Only while the booked program is the
 * live one it named (theProgramsLiveness), so a pid used again by another program never counts, and only on a
 * probe that can read cgroups.
 */
function startedByTheBookedGroup(p: GpuReadingProcess, b: Booking): boolean {
  const program = b.data.program
  const probe = osProbe()
  if (p.who.kind !== 'host' || program?.pgid === undefined || probe.cgroupOf === undefined) return false
  if (theProgramsLiveness(program).state !== 'alive') return false
  const pgid = program.pgid
  let member: number | null = null
  try {
    member = probe.processById(pgid)?.pid ?? probe.processesInGroup(pgid)[0]?.pid ?? null
  } catch {
    return false
  }
  if (member === null) return false
  const theirs = probe.cgroupOf(member)
  if (theirs === null) return false
  const unit = theirs.split('/').filter((part) => part !== '').pop() ?? ''
  if (!theWholeUserSlice(unit)) return unit === p.who.unit
  try {
    let at = probe.processById(p.pid)
    for (let step = 0; at !== null && step < THE_LONGEST_PARENT_CHAIN; step++) {
      if (at.pgid === pgid) return true
      if (at.ppid <= 1) return false
      at = probe.processById(at.ppid)
    }
  } catch {
    return false
  }
  return false
}

/**
 * THIS WEEK'S USE OF THE CARD, COUNTED FROM THE WATCHER'S READINGS (report peyJSnLoz_Bk: hours with a job on
 * the card, by who). Point 4 keeps the watcher's state small, with no record per reading, so the count
 * is held in the server's memory beside the latest reading.
 *
 * The time between two readings in a row is counted once to each holder whose booking accounts for a process
 * on the card at the later reading, and once to "without a booking" when a process on the card is accounted
 * for by none. Nobody saw the card across a gap longer than A_READING_IS_OLD_AFTER_MINUTES, after an error
 * reading or before a restart, so that time is not counted. `countedSince` is when the count began, so a count
 * that began after a restart is never read as the whole week.
 */
interface TheWeeksCount {
  /** Monday 00:00 of the week counted, on the office computer's clock. */
  weekFrom: number
  countedSince: number
  /** The latest reading that saw the card, or null after an error reading. */
  lastSeenAt: number | null
  byHolder: Map<string, { holder: ParticipantRef; ms: number }>
  withoutABookingMs: number
}

let theWeek: TheWeeksCount | null = null

/** Monday 00:00 of the week `ms` is in, on the office computer's clock. */
export function theWeekFrom(ms: number): number {
  const day = new Date(ms)
  day.setHours(0, 0, 0, 0)
  day.setDate(day.getDate() - ((day.getDay() + 6) % 7))
  return day.getTime()
}

function countTheReading(reading: GpuReading, live: readonly Booking[]): void {
  const at = reading.receivedAt
  const weekFrom = theWeekFrom(at)
  if (theWeek === null || theWeek.weekFrom !== weekFrom) {
    theWeek = { weekFrom, countedSince: at, lastSeenAt: null, byHolder: new Map(), withoutABookingMs: 0 }
  }
  const week = theWeek
  if ('error' in reading) {
    week.lastSeenAt = null
    return
  }
  const since = week.lastSeenAt
  week.lastSeenAt = at
  if (since === null) return
  const gap = at - since
  if (gap <= 0 || gap > A_READING_IS_OLD_AFTER_MINUTES * MINUTE) return
  const holders = new Map<string, ParticipantRef>()
  let without = false
  for (const p of reading.processes) {
    const b = theBookingThatCounts(p, live)
    if (b === undefined) without = true
    else holders.set(participantKey(b.data.holder), b.data.holder)
  }
  for (const [key, holder] of holders) {
    const was = week.byHolder.get(key)
    week.byHolder.set(key, { holder, ms: (was?.ms ?? 0) + gap })
  }
  if (without) week.withoutABookingMs += gap
}

/** This week's count as GET /api/resources/gpu answers it. */
export interface GpuWeek {
  from: string
  /** When the count began, or null because nobody has counted this week. */
  countedSince: string | null
  says: string
  byHolder: { holder: ParticipantRef; minutes: number }[]
  /** Minutes with a process on the card that no booking accounts for, or null because nobody counted. */
  withoutABookingMinutes: number | null
}

function theWeekNow(now: number): GpuWeek {
  const weekFrom = theWeekFrom(now)
  const week = theWeek !== null && theWeek.weekFrom === weekFrom ? theWeek : null
  if (week === null) {
    return {
      from: stamp(weekFrom),
      countedSince: null,
      says: 'No reading of the card this week since the server started.',
      byHolder: [],
      withoutABookingMinutes: null,
    }
  }
  return {
    from: stamp(weekFrom),
    countedSince: stamp(week.countedSince),
    says:
      `Counted from the watcher's readings since ${said(week.countedSince, now)}. A gap of more than ` +
      `${String(A_READING_IS_OLD_AFTER_MINUTES)} minutes between readings is not counted.`,
    byHolder: [...week.byHolder.values()]
      .map((one) => ({ holder: one.holder, minutes: Math.round(one.ms / MINUTE) }))
      .sort((a, b) => b.minutes - a.minutes),
    withoutABookingMinutes: Math.round(week.withoutABookingMs / MINUTE),
  }
}

// ============================================================================ placing a window

interface Window {
  start: number
  end: number
  gib: number
}

/** Whether `gib` fits beside `others` for the whole of [start, start + minutes). */
function fitsAt(start: number, minutes: number, gib: number, others: readonly Window[], card: number): boolean {
  const end = start + minutes * MINUTE
  const moments = [start, ...others.map((o) => o.start).filter((s) => s > start && s < end)]
  return moments.every((t) => gib + others.filter((o) => o.start <= t && t < o.end).reduce((sum, o) => sum + o.gib, 0) <= card)
}

/**
 * THE EARLIEST TIME FROM `from` AT WHICH IT FITS. The only times that can be earliest are `from` and the
 * ends of the others, so those are tried in order. After the last end nothing overlaps, so a booking no
 * bigger than the card always has an answer.
 */
function earliestFit(from: number, minutes: number, gib: number, others: readonly Window[], card: number): number {
  const candidates = [from, ...others.map((o) => o.end).filter((e) => e > from)].sort((a, b) => a - b)
  for (const at of candidates) if (fitsAt(at, minutes, gib, others, card)) return at
  throw new PanelError(`A booking of ${String(gib)} GiB cannot fit a card of ${String(card)} GiB at any time.`, 409)
}

function windowOf(b: Booking): Window {
  return { start: b.start, end: b.end, gib: b.data.gib }
}

/**
 * WHERE A BOOKING STANDS IN TIME WHEN ANOTHER IS PLACED BESIDE IT. A running booking past its end is still on the
 * card, so it is counted as holding it until now at least.
 */
function windowNow(b: Booking, now: number): Window {
  return b.data.state === 'running' ? { start: b.start, end: Math.max(b.end, now + MINUTE), gib: b.data.gib } : windowOf(b)
}

// ============================================================================ the reminder

/**
 * REMIND THE HOLDERS WHEN THE MEMORY BOOKED GOES OVER THE CARD, in wave 13s round
 * 38. `b` has
 * just been booked or moved, or its end moved later; [from, until) is its time that is new. At each moment of it
 * where another live booking starts, the GiB declared by `b` and the bookings on the card with it are added up.
 * When the total is more than the card's GiB, or the card's size is not known and another booking is there, every
 * holder of those bookings is reminded once for that set of bookings. Nothing is refused or moved.
 *
 * Returns one sentence for each reminder, for the answer.
 */
function remindOfTheCard(b: Booking, from: number, until: number, now: number): string[] {
  const totalMiB = theLatestTotalMiB
  const card = totalMiB === null ? null : cardGiBOf(totalMiB)
  const beside = liveBookings().filter((o) => {
    const w = windowNow(o, now)
    return o.id !== b.id && w.start < until && from < w.end
  })
  const moments = [from, ...beside.map((o) => o.start).filter((t) => t > from && t < until)]
  const reminded = new Set<string>()
  const sentences: string[] = []
  for (const t of moments) {
    const together = [
      b,
      ...beside.filter((o) => {
        const w = windowNow(o, now)
        return w.start <= t && t < w.end
      }),
    ]
    const total = together.reduce((sum, o) => sum + o.data.gib, 0)
    if (card === null ? together.length < 2 : total <= card) continue
    const which = together.map((o) => o.id).sort().join(' ')
    if (reminded.has(which)) continue
    reminded.add(which)
    const at = said(Math.max(t, now), now)
    const size = card === null || totalMiB === null ? null : { gib: card, mib: totalMiB }
    const holders = new Map(together.map((o) => [participantKey(o.data.holder), o]))
    for (const [, one] of holders) {
      const reader = one.data.holder
      const declared = together.map((o) => ({ whose: sameParticipant(o.data.holder, reader) ? null : nameOfWho(o.data.holder), booking: o.id, gib: o.data.gib }))
      tellOneOfABooking(reader, one.workspaceId, (toAPerson) => SYSTEM_LINES.aBookingsGoOverTheCard(at, declared, size, toAPerson))
    }
    sentences.push(
      `From ${at}, ${together.map((o) => `booking ${o.id} (${nameOfWho(o.data.holder)}'s) declares ${String(o.data.gib)} GiB`).join('; ')}: ` +
        `${String(total)} GiB together, ` +
        (size === null ? "and the card's size is not known, because the watcher has not read the card since the server started" : `and the card has ${String(size.gib)} GiB (${String(size.mib)} MiB)`) +
        `. Nothing was refused: ${holders.size === 1 ? 'its holder was' : `the ${String(holders.size)} holders were`} reminded.`,
    )
  }
  return sentences
}

// ============================================================================ writing a booking

/** A change to a booking's data. A null takes the key away, as `dataPatch` does. */
type BookingPatch = { [K in keyof BookingData]?: BookingData[K] | null }

function writeBooking(booking: Booking, patch: BookingPatch, actor: Actor): boolean {
  return patchRecord(booking.id, { dataPatch: patch as Record<string, unknown> }, actor).newSeq !== null
}

interface Moved {
  booking: Booking
  from: number
  to: number
  wasRunning: boolean
}

/**
 * THE OWNER'S "cutIn": "now". Each running booking in their time is taken off the card: its holder is told it has
 * until `graceUntil` to stop, and its booking is moved to start when theirs ends, waiting, with its program taken off,
 * because its work has to start again at the new time. Nobody else is moved.
 */
function stopForTheOwner(inTheWay: readonly Booking[], theirEnd: number, graceUntil: number, now: number, actor: Actor): Moved[] {
  return inTheWay.map((b) => {
    const endsAt = theirEnd + b.data.minutes * MINUTE
    writeBooking(
      b,
      { startsAt: stamp(theirEnd), endsAt: stamp(endsAt), movedBecause: "The owner's booking goes first.", state: 'waiting', program: null, progress: null },
      actor,
    )
    tellOneOfABooking(b.data.holder, b.workspaceId, (toAPerson) =>
      SYSTEM_LINES.aBookingGoesFirstNow('The owner', b.id, said(graceUntil, now), said(theirEnd, now), said(endsAt, now), toAPerson),
    )
    return { booking: b, from: b.start, to: theirEnd, wasRunning: true }
  })
}

// ============================================================================ settling

/** The program's own reading: its process group, or its ledger row. */
export function theProgramsLiveness(program: BookingProgram): Liveness {
  if (program.pgid !== undefined && program.leaderStartedAt !== undefined) {
    return theProcessGroupsLiveness({ pgid: program.pgid, leaderStartedAt: program.leaderStartedAt }, 'this booking')
  }
  if (program.row !== undefined && program.rowProject !== undefined) {
    return theLedgerRowsLiveness(program.row, program.rowProject)
  }
  return { state: 'unknown', reason: 'The program names neither a process group nor a ledger row.' }
}

/**
 * END THE BOOKINGS WHOSE PROGRAM HAS ENDED, AND LAPSE THE REQUESTS WHOSE APPLICANT'S TURN HAS COME. Run
 * first by every booking write and by every reading, inside its transaction. Returns one sentence per act.
 * A program that cannot be read (`unknown`) is left running: absence beats a guess.
 */
function settle(now: number, markWrite: () => void = () => {}): string[] {
  const said: string[] = []
  for (const b of liveBookings()) {
    if (b.data.state === 'running' && b.data.program !== undefined) {
      const live = theProgramsLiveness(b.data.program)
      if (live.state === 'gone') {
        if (writeBooking(b, { state: 'ended', endedBecause: live.detail }, theOffice())) markWrite()
        said.push(`Booking ${b.id} ended: ${live.detail}`)
        // A program may end before its booking's time comes; the next day is booked all the same.
        said.push(...bookTheNextDay(b, now, markWrite))
        continue
      }
    }
    if (b.start <= now) said.push(...bookTheNextDay(b, now, markWrite))
    const asked = b.data.goFirst
    if (asked !== undefined && asked.state === 'asked') {
      const ahead = getRecord(asked.ahead)
      const aheadIsLive = ahead !== null && ahead.deletedAt === null && LIVE_BOOKING_STATES.includes((ahead.data as unknown as BookingData).state)
      if (b.start <= now || !aheadIsLive) {
        if (writeBooking(b, { goFirst: { ...asked, state: 'lapsed', settledAt: stamp(now) } }, theOffice())) markWrite()
        said.push(
          `The request of booking ${b.id} to go first lapsed: ${b.start <= now ? 'its own turn came' : `booking ${asked.ahead} is no longer in the line`}.`,
        )
      }
    }
  }
  said.push(...tellTheOverRuns(now, markWrite))
  return said
}

/**
 * BOOK THE NEXT DAY OF A DAILY BOOKING, once: at the time first asked for, on the first day after now. It is
 * placed as an agent's booking with a set time is, at that time, so it moves nobody; when the GiB booked then go
 * over the card, the holders are reminded (`remindOfTheCard`).
 */
function bookTheNextDay(b: Booking, now: number, markWrite: () => void): string[] {
  if (b.data.repeat !== 'daily' || b.data.nextDay !== undefined) return []
  const first = parseLocalStamp(b.data.askedFor ?? b.data.startsAt)
  if (first === null) return [`The next day of daily booking ${b.id} is not booked: its time asked for cannot be read.`]
  const day = new Date(first)
  while (day.getTime() <= now) day.setDate(day.getDate() + 1)
  const start = day.getTime()
  const end = start + b.data.minutes * MINUTE
  const data: BookingData = {
    resource: b.data.resource,
    gib: b.data.gib,
    minutes: b.data.minutes,
    purpose: b.data.purpose,
    holder: b.data.holder,
    startAsked: 'at',
    askedFor: stamp(start),
    startsAt: stamp(start),
    endsAt: stamp(end),
    state: 'waiting',
    repeat: 'daily',
    repeatOf: b.data.repeatOf ?? b.id,
  }
  const record = createRecordWithReport({
    kind: BOOKING_KIND,
    title: `GPU, ${String(b.data.gib)} GiB, ${stamp(start).slice(0, 16)}: ${b.data.purpose}`.slice(0, 200),
    data: data as unknown as Record<string, unknown>,
    workspaceId: b.workspaceId,
    actor: theOffice(),
  }).record
  markWrite()
  writeBooking(b, { nextDay: record.id }, theOffice())
  const next = asBooking(getRecord(record.id) ?? record)
  return [`Daily booking ${b.id}: the next day is booked as ${record.id}, ${said(start, now)} to ${said(end, now)}.`, ...remindOfTheCard(next, start, end, now)]
}

/**
 * TELL WHO A RUNNING-OVER BOOKING HOLDS UP. A running booking past its end whose program has not ended, and a
 * waiting booking whose time has come and whose memory does not fit beside the running ones: the first's holder
 * and the second's are each told once for that pair. Nothing is stopped; the line is the whole act.
 */
function tellTheOverRuns(now: number, markWrite: () => void): string[] {
  const card = theCardGiB()
  if (card === null) return []
  const live = liveBookings()
  const running = live.filter((b) => b.data.state === 'running')
  const runningGiB = running.reduce((sum, b) => sum + b.data.gib, 0)
  const heldUp = live.filter((n) => n.data.state === 'waiting' && n.start <= now && now < n.end && n.data.gib + runningGiB > card)
  const told: string[] = []
  for (const r of running.filter((one) => one.end <= now)) {
    const fresh = heldUp.filter((n) => !(r.data.overRunTold ?? []).includes(n.id))
    if (fresh.length === 0) continue
    const minutesOver = Math.max(1, Math.round((now - r.end) / MINUTE))
    for (const n of fresh) {
      tellOneOfABooking(r.data.holder, r.workspaceId, (toAPerson) =>
        SYSTEM_LINES.aBookingRunsOver(r.id, minutesOver, nameOfWho(n.data.holder), n.data.gib, toAPerson),
      )
      tellOneOfABooking(n.data.holder, n.workspaceId, (toAPerson) =>
        SYSTEM_LINES.aBookingBeforeYoursRunsOver(n.id, nameOfWho(r.data.holder), said(r.end, now), toAPerson),
      )
      told.push(`Booking ${r.id} runs ${String(minutesOver)} minutes over, and booking ${n.id} does not fit beside it: both holders were told.`)
    }
    markWrite()
    writeBooking(r, { overRunTold: [...(r.data.overRunTold ?? []), ...fresh.map((n) => n.id)] }, theOffice())
  }
  return told
}

/** Run one booking write: as the booking doors, in one immediate transaction, settled first. */
function asOneBookingWrite<T>(now: number, write: (settled: string[], settlementWrote: boolean) => T): T {
  return asTheBookingDoors(() =>
    sqlite
      .transaction((): T => {
        let settlementWrote = false
        const settled = settle(now, () => { settlementWrote = true })
        return write(settled, settlementWrote)
      })
      .immediate(),
  )
}

// ============================================================================ book

const A_STAMP = z.string().trim().regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/, 'a time on the office computer\'s clock, YYYY-MM-DD HH:MM')

export const A_NEW_BOOKING = z
  .object({
    resource: z.enum(BOOKING_RESOURCES),
    gib: z.number().int().min(1),
    minutes: z.number().int().min(1).max(THE_LONGEST_BOOKING_MINUTES),
    purpose: z.string().trim().min(1),
    start: z.union([z.literal('now'), z.literal('when-free'), z.object({ at: A_STAMP }).strict()]),
    cutIn: z.enum(CUT_IN_CHOICES).optional(),
    repeat: z.enum(BOOKING_REPEATS).optional(),
    label: z.string().trim().min(1).max(80).optional(),
  })
  .strict()

export interface BookingAnswer {
  booking: Booking
  moved: { booking: string; holder: ParticipantRef; from: string; to: string; wasRunning: boolean }[]
  settled: string[]
  says: string
  nothingWritten?: string
}

function movedOnTheWire(moved: readonly Moved[]): BookingAnswer['moved'] {
  return moved.map((m) => ({ booking: m.booking.id, holder: m.booking.data.holder, from: stamp(m.from), to: stamp(m.to), wasRunning: m.wasRunning }))
}

/**
 * BOOK THE CARD. The caller holds the booking. It is placed at the time asked for, and nobody is moved for memory
 * when the GiB booked go over the card, the holders are reminded (`remindOfTheCard`). An
 * agent that asks for "when-free" waits, by its own choice, for the earliest time its GiB fit beside the others.
 * The owner's "cutIn" is their own press (see the head of this file).
 */
export function book(input: { workspaceId: string; said: z.output<typeof A_NEW_BOOKING>; actor: Actor; now?: number }): BookingAnswer {
  const holder = theCallerOrARefusal(input.actor, 'Booking the GPU')
  const now = input.now ?? Date.now()
  const s = input.said
  let from = now
  if (typeof s.start === 'object') {
    const at = parseLocalStamp(s.start.at.length === 16 ? `${s.start.at}:00` : s.start.at)
    if (at === null) throw new PanelError(`${s.start.at} is not a time the office can read. Nothing was written.`, 400)
    if (at < now - MINUTE) throw new PanelError(`${s.start.at} has already passed. Book from now, or a later time. Nothing was written.`, 400)
    from = Math.max(at, now)
  }
  if (s.repeat !== undefined && typeof s.start !== 'object') {
    throw new PanelError(
      'A booking that repeats daily needs a set time, so that every day is booked at that time: send "start": ' +
        '{"at": "YYYY-MM-DD HH:MM"}. Nothing was written.',
      400,
    )
  }
  const owner = isTheOwner(input.actor)
  if (!owner && s.cutIn !== undefined) {
    throw new PanelError(
      'Only the owner\'s booking goes first with `cutIn`. An agent asks to go first with POST /api/bookings/<id>/go-first ' +
        'after booking. Nothing was written.',
      403,
    )
  }
  // "WHEN-FREE" WAITS FOR THE GiB TO FIT, so it needs the card's size; nothing else does.
  const card = theCardGiB()
  if (!owner && s.start === 'when-free' && card === null) throw new PanelError(THE_CARD_SIZE_IS_NOT_KNOWN, 409)

  return asOneBookingWrite(now, (settled) => {
    const live = liveBookings()
    let start = from
    let moved: Moved[] = []
    let cutIn: BookingCutIn | undefined
    let because: string
    if (!owner) {
      if (s.start === 'when-free' && card !== null) {
        // A booking bigger than the card fits only where no other booking is, which is the free card it asked for.
        start = earliestFit(from, s.minutes, s.gib, live.map(windowOf), Math.max(card, s.gib))
        because = start === from ? 'The card is free enough now.' : 'It waits, as asked, for the earliest time its GiB fit beside the others.'
      } else {
        because = 'It starts at the time asked.'
      }
    } else {
      // THEIR OWN PRESS: "cutIn" acts on the running bookings in their time, and only when they send it.
      const inTheWay = live.filter((b) => b.data.state === 'running' && collides(windowNow(b, now), { start: from, end: from + s.minutes * MINUTE, gib: s.gib }))
      if (s.cutIn === undefined) {
        because = "The owner's booking starts at the time asked."
      } else if (inTheWay.length === 0) {
        because = 'Nothing is running in its time, so the choice changed nothing.'
      } else if (s.cutIn === 'now') {
        const graceUntil = now + GRACE_MINUTES * MINUTE
        moved = stopForTheOwner(inTheWay, from + s.minutes * MINUTE, graceUntil, now, input.actor)
        cutIn = { choice: 'now', graceUntil: stamp(graceUntil), moved: moved.map((m) => m.booking.id), actions: [] }
        because = `The owner's booking goes first now: the running ${inTheWay.length === 1 ? 'booking was' : 'bookings were'} asked to stop by ${said(graceUntil, now)}.`
      } else {
        start = Math.max(from, ...inTheWay.map((b) => windowNow(b, now).end))
        cutIn = { choice: 'after', moved: [], actions: [] }
        because = "The owner's booking starts when the running ones end."
      }
    }
    const data: BookingData = {
      resource: s.resource,
      gib: s.gib,
      minutes: s.minutes,
      purpose: s.purpose,
      holder,
      startAsked: typeof s.start === 'object' ? 'at' : s.start,
      ...(typeof s.start === 'object' ? { askedFor: stamp(from) } : {}),
      startsAt: stamp(start),
      endsAt: stamp(start + s.minutes * MINUTE),
      state: 'waiting',
      ...(cutIn === undefined ? {} : { cutIn }),
      ...(s.repeat === undefined ? {} : { repeat: s.repeat }),
    }
    const record = createRecordWithReport({
      kind: BOOKING_KIND,
      title: `GPU, ${String(s.gib)} GiB, ${stamp(start).slice(0, 16)}: ${s.purpose}`.slice(0, 200),
      data: data as unknown as Record<string, unknown>,
      workspaceId: input.workspaceId,
      actor: input.actor,
    }).record
    if (s.label !== undefined) writeTheLabel(record.id, input.workspaceId, s.label, input.actor)
    const booking = asBooking(getRecord(record.id) ?? record)
    const reminders = remindOfTheCard(booking, booking.start, booking.end, now)
    const when = `${said(start, now)} to ${said(booking.end, now)}`
    return {
      booking,
      moved: movedOnTheWire(moved),
      settled,
      says:
        `Booked: the host GPU, ${String(s.gib)} GiB, ${when}. ${because}` +
        (s.repeat === undefined ? '' : ' It repeats daily: the next day is booked when this day\'s time comes.') +
        (moved.length === 0 ? '' : ` ${String(moved.length)} running ${moved.length === 1 ? 'booking was' : 'bookings were'} moved after it, and ${moved.length === 1 ? 'its holder was' : 'their holders were'} told.`) +
        reminders.map((one) => ` ${one}`).join(''),
    }
  })
}

function collides(a: Window, w: Window): boolean {
  return a.start < w.end && w.start < a.end
}

function writeTheLabel(recordId: string, workspaceId: string, label: string, actor: Actor): void {
  const newest = sqlite
    .prepare('SELECT seq, content_hash AS contentHash FROM revisions WHERE record_id = ? ORDER BY seq DESC LIMIT 1')
    .get(recordId) as { seq: number; contentHash: string } | undefined
  if (newest === undefined) throw new PanelError(`Booking ${recordId} has no revision to write a label from.`, 409)
  writeShortForms(recordId, workspaceId, { madeFrom: newest, forms: { label } }, actor)
}

// ============================================================================ name the program

export const A_PROGRAM = z.union([
  z.object({ pid: z.number().int().positive(), startedAt: z.string().trim().min(1).optional(), sandbox: z.string().trim().min(1).optional() }).strict(),
  z.object({ resource: z.string().trim().min(1), sandbox: z.string().trim().min(1).optional() }).strict(),
])

/** The holder or the owner names the program doing the booking's work. The booking is then running. */
export function nameTheProgram(input: { workspaceId: string; id: string; said: z.output<typeof A_PROGRAM>; actor: Actor; now?: number }): BookingAnswer {
  const now = input.now ?? Date.now()
  const caller = theCallerOrARefusal(input.actor, 'Naming the program of a booking')
  return asOneBookingWrite(now, (settled, settlementWrote) => {
    const b = theBooking(input.id, input.workspaceId)
    const gateWrote = !sameParticipant(caller, b.data.holder) && !isTheOwner(input.actor)
    if (gateWrote) {
      const met = () => gateMet('who-changes-a-booking')
      if (gatePosition('who-changes-a-booking') === 'block') {
        throw gateMetOnceTheWriteIsTakenBack(new PanelError(`Booking ${b.id} is ${nameOfWho(b.data.holder)}'s, so only its holder or the owner names its program. Nothing was written.`, 403), met)
      }
      met()
    }
    if (!LIVE_BOOKING_STATES.includes(b.data.state)) {
      throw new PanelError(`Booking ${b.id} is ${b.data.state}, so it holds nothing for a program. Book again. Nothing was written.`, 409)
    }
    let program: BookingProgram
    if ('pid' in input.said) {
      const holder = theGroupThatWouldHoldASlot(input.said.pid, input.said.startedAt)
      program = {
        pgid: holder.member.pgid,
        leaderStartedAt: holder.leader.startedAt,
        says: `process group ${String(holder.member.pgid)}, led by ${holder.leader.command}`,
        namedAt: stamp(now),
      }
    } else {
      const found = liveRowById(input.said.resource, input.workspaceId)
      if (found === null) throw new PanelError(`No live ledger row ${input.said.resource} is in this project. Nothing was written.`, 404)
      if (found.entry.type !== 'process' && found.entry.type !== 'container') {
        throw new PanelError(`Row ${input.said.resource} is a ${found.entry.type} row. A booking's program is a process row or a container row. Nothing was written.`, 400)
      }
      program = { row: found.entry.id, rowProject: input.workspaceId, says: `${found.entry.type} row ${found.entry.id}, ${found.entry.key}`, namedAt: stamp(now) }
    }
    const bookingWrote = writeBooking(b, { state: 'running', program, ...(input.said.sandbox === undefined ? {} : { sandbox: input.said.sandbox }) }, input.actor)
    const nothingWritten = !settlementWrote && !gateWrote && !bookingWrote ? nothingWrittenSentence({ kind: 'already-stored' }) : undefined
    const booking = theBooking(b.id, input.workspaceId)
    const early = booking.start > now ? ` Its time starts at ${said(booking.start, now)}, so it started early.` : ''
    return { booking, moved: [], settled, ...(nothingWritten === undefined ? {} : { nothingWritten }), says: nothingWritten ?? `Running: booking ${b.id}, under ${program.says}.${early} It ends when that program ends.` }
  })
}

// ============================================================================ cancel

export function cancelABooking(input: { workspaceId: string; id: string; actor: Actor; now?: number }): BookingAnswer {
  const now = input.now ?? Date.now()
  const caller = theCallerOrARefusal(input.actor, 'Cancelling a booking')
  return asOneBookingWrite(now, (settled) => {
    const b = theBooking(input.id, input.workspaceId)
    if (!sameParticipant(caller, b.data.holder) && !isTheOwner(input.actor)) {
      const met = () => gateMet('who-changes-a-booking')
      if (gatePosition('who-changes-a-booking') === 'block') {
        throw gateMetOnceTheWriteIsTakenBack(new PanelError(`Booking ${b.id} is ${nameOfWho(b.data.holder)}'s, so only its holder or the owner cancels it. Nothing was written.`, 403), met)
      }
      met()
    }
    if (!LIVE_BOOKING_STATES.includes(b.data.state)) {
      throw new PanelError(`Booking ${b.id} is already ${b.data.state}. Nothing was written.`, 409)
    }
    writeBooking(b, { state: 'cancelled', endedBecause: `Cancelled by ${nameOfWho(caller)} at ${stamp(now)}.` }, input.actor)
    const series =
      b.data.repeat !== 'daily'
        ? ''
        : b.data.nextDay === undefined
          ? ' It repeated daily, and the repeating stops with it: no next day will be booked.'
          : ` It repeated daily. The next day is already booked as ${b.data.nextDay}, and the repeating goes on from that one until it is cancelled too.`
    return { booking: theBooking(b.id, input.workspaceId), moved: [], settled, says: `Cancelled: booking ${b.id}. Nothing else in the line moved.${series}` }
  })
}

// ============================================================================ how far the program is

export const A_PROGRESS = z
  .object({ done: z.number().int().nonnegative(), of: z.number().int().positive() })
  .strict()
  .refine((p) => p.done <= p.of, { message: '`done` may not be more than `of`.' })

/**
 * A RUNNING PROGRAM SAYS HOW FAR IT IS: `done` of `of` steps. Its holder or the owner. Only the newest report is
 * kept, and the expected end is worked out from it when the booking is read (`theEndOf`).
 */
export function reportProgress(input: { workspaceId: string; id: string; said: z.output<typeof A_PROGRESS>; actor: Actor; now?: number }): BookingAnswer {
  const now = input.now ?? Date.now()
  const caller = theCallerOrARefusal(input.actor, 'Reporting how far a booking\'s program is')
  return asOneBookingWrite(now, (settled, settlementWrote) => {
    const b = theBooking(input.id, input.workspaceId)
    const gateWrote = !sameParticipant(caller, b.data.holder) && !isTheOwner(input.actor)
    if (gateWrote) {
      const met = () => gateMet('who-changes-a-booking')
      if (gatePosition('who-changes-a-booking') === 'block') {
        throw gateMetOnceTheWriteIsTakenBack(new PanelError(`Booking ${b.id} is ${nameOfWho(b.data.holder)}'s, so only its holder or the owner reports how far its program is. Nothing was written.`, 403), met)
      }
      met()
    }
    if (b.data.state !== 'running' || b.data.program === undefined) {
      throw new PanelError(`Booking ${b.id} is ${b.data.state} with no program running, so there is no program to report on. Nothing was written.`, 409)
    }
    const progress: BookingProgress = { done: input.said.done, of: input.said.of, at: stamp(now) }
    const bookingWrote = writeBooking(b, { progress }, input.actor)
    const nothingWritten = !settlementWrote && !gateWrote && !bookingWrote ? nothingWrittenSentence({ kind: 'already-stored' }) : undefined
    const booking = theBooking(b.id, input.workspaceId)
    const end = theEndOf(booking, now)
    return { booking, moved: [], settled, ...(nothingWritten === undefined ? {} : { nothingWritten }), says: nothingWritten ?? `Recorded: booking ${b.id}, ${String(progress.done)} of ${String(progress.of)} done. ${end.says}` }
  })
}

// ============================================================================ extend

export const A_EXTENSION = z.object({ until: A_STAMP, because: z.string().trim().min(1) }).strict()

/**
 * THE TIMES THE OFFICE'S CLOCK SHOWS TWICE, when `asked` is one of them, or null when `asked` names one moment. The night
 * the clocks go back, every time from `from` until `until` comes round twice, so a time written with no offset, as an
 * extension's is, names two moments there and the office cannot tell which one was meant.
 */
function theTimesShownTwice(asked: string): { from: number; until: number } | null {
  const zone = theClockZone()
  const first = momentOfStampInZone(asked, zone)
  const last = latestMomentOfStampInZone(asked, zone)
  if (first === null || last === null || first === last) return null
  // THE MINUTE THE CLOCKS GO BACK, between the two: the first minute whose time on the clock is earlier than a minute before.
  let back = Math.floor(first / MINUTE) * MINUTE + MINUTE
  while (back < last && stampInZone(back, zone) > stampInZone(back - MINUTE, zone)) back += MINUTE
  return { from: back, until: back + (last - first) }
}

/**
 * EXTEND A BOOKING: its end moves later, to `until`, for the reason given. Its holder, a secretary or the owner
 * (the owner by the reading recorded as decision kFPdCQrt9kRn). Nothing else in the line moves, and nothing is refused
 * for memory: when in the added time the GiB declared go over the card, or the card's size
 * is not known, the holders are reminded (`remindOfTheCard`). An end the office's clock shows twice is refused
 * (`theTimesShownTwice`): the stored end would name two moments, and the office cannot tell which one was meant.
 */
export function extendABooking(input: { workspaceId: string; id: string; said: z.output<typeof A_EXTENSION>; actor: Actor; now?: number }): BookingAnswer {
  const now = input.now ?? Date.now()
  const caller = theCallerOrARefusal(input.actor, 'Extending a booking')
  const asked = input.said.until.length === 16 ? `${input.said.until}:00` : input.said.until
  const until = parseLocalStamp(asked)
  if (until === null) throw new PanelError(`${input.said.until} is not a time the office can read. Nothing was changed.`, 400)
  const twice = theTimesShownTwice(asked)
  if (twice !== null) {
    throw new PanelError(
      `${input.said.until} comes twice on the office computer's clock. That night the clocks go back, so every time from ` +
        `${said(twice.from, now)} until ${said(twice.until, now)} comes round twice, and an extension cannot say which of the two it means. ` +
        `Give an end before ${said(twice.from, now)}, or at ${said(twice.until, now)} or later. Nothing was changed.`,
      400,
    )
  }
  return asOneBookingWrite(now, (settled) => {
    const b = theBooking(input.id, input.workspaceId)
    if (!sameParticipant(caller, b.data.holder) && !holdsTheSecretaryCard(caller) && !isTheOwner(input.actor)) {
      const met = () => gateMet('who-changes-a-booking')
      if (gatePosition('who-changes-a-booking') === 'block') {
        throw gateMetOnceTheWriteIsTakenBack(new PanelError(
          `Booking ${b.id} is ${nameOfWho(b.data.holder)}'s, so only its holder, a secretary or the owner extends it. Nothing was changed.`,
          403,
        ), met)
      }
      met()
    }
    if (!LIVE_BOOKING_STATES.includes(b.data.state)) {
      throw new PanelError(`Booking ${b.id} is ${b.data.state}, so there is nothing to extend. Book again. Nothing was changed.`, 409)
    }
    if (until <= b.end || until <= now) {
      throw new PanelError(
        `Booking ${b.id} ends at ${said(b.end, now)}, and an extension moves its end later than that and later than now. ` +
          `${said(until, now)} is not. Nothing was changed.`,
        400,
      )
    }
    const minutes = Math.round((until - b.start) / MINUTE)
    if (minutes > THE_LONGEST_BOOKING_MINUTES) {
      throw new PanelError(
        `Booking ${b.id} starts at ${said(b.start, now)}, and the longest booking is ${String(THE_LONGEST_BOOKING_MINUTES)} minutes, so ` +
          `it cannot last until ${said(until, now)}. Nothing was changed.`,
        400,
      )
    }
    const extension: BookingExtension = { from: b.data.endsAt, to: stamp(until), because: input.said.because, by: caller, at: stamp(now) }
    writeBooking(b, { endsAt: stamp(until), minutes, extensions: [...(b.data.extensions ?? []), extension] }, input.actor)
    const booking = theBooking(b.id, input.workspaceId)
    // THE ADDED TIME, from the old end or from now when that is later: a booking running over is on the card now.
    const reminders = remindOfTheCard(booking, Math.max(b.end, now), until, now)
    const stillRunning = theEndOf(booking, now).lasts === 'until its program ends' ? ' It still lasts until its program ends.' : ''
    return {
      booking,
      moved: [],
      settled,
      says:
        `Extended: booking ${b.id} now runs ${said(booking.start, now)} to ${said(booking.end, now)}, ${String(minutes)} minutes. ` +
        `Nothing else in the line moved.${stillRunning}` +
        reminders.map((one) => ` ${one}`).join(''),
    }
  })
}

// ============================================================================ the use, from the GPU tool

/** The peak as the caller read it, or `peak: "from the readings"` for the office's own count (point 4). */
export const THE_PEAK_FROM_THE_READINGS = 'from the readings'

export const A_USE = z.union([
  z
    .object({
      startedAt: A_STAMP,
      endedAt: A_STAMP,
      peakMiB: z.number().nonnegative().nullable(),
      peakSays: z.string().trim().min(1),
      ended: z.string().trim().min(1),
    })
    .strict(),
  z
    .object({
      startedAt: A_STAMP,
      endedAt: A_STAMP,
      peak: z.literal(THE_PEAK_FROM_THE_READINGS),
      ended: z.string().trim().min(1),
    })
    .strict(),
])

/**
 * THE GPU TOOL RECORDS WHAT ONE USE WAS: each tool records the use and its cost after
 * it. The holder or the owner, once per booking. It settles first, like every booking write.
 */
export function recordAUse(input: { workspaceId: string; id: string; said: z.output<typeof A_USE>; actor: Actor; now?: number }): BookingAnswer {
  const now = input.now ?? Date.now()
  const caller = theCallerOrARefusal(input.actor, 'Recording a use of a booking')
  const started = parseLocalStamp(input.said.startedAt.length === 16 ? `${input.said.startedAt}:00` : input.said.startedAt)
  const ended = parseLocalStamp(input.said.endedAt.length === 16 ? `${input.said.endedAt}:00` : input.said.endedAt)
  if (started === null || ended === null || ended < started) {
    throw new PanelError(`A use runs from startedAt to a later endedAt; ${input.said.startedAt} to ${input.said.endedAt} is not that. Nothing was written.`, 400)
  }
  return asOneBookingWrite(now, (settled) => {
    const b = theBooking(input.id, input.workspaceId)
    if (!sameParticipant(caller, b.data.holder) && !isTheOwner(input.actor)) {
      const met = () => gateMet('who-changes-a-booking')
      if (gatePosition('who-changes-a-booking') === 'block') {
        throw gateMetOnceTheWriteIsTakenBack(new PanelError(`Booking ${b.id} is ${nameOfWho(b.data.holder)}'s, so only its holder or the owner records its use. Nothing was written.`, 403), met)
      }
      met()
    }
    if (b.data.use !== undefined) {
      throw new PanelError(`Booking ${b.id} already has its use recorded, at ${b.data.use.recordedAt}. A booking records one use. Nothing was written.`, 409)
    }
    const minutes = Math.round((ended - started) / MINUTE)
    const peakOf = 'peak' in input.said ? thePeakFromTheReadings(b) : { peakMiB: input.said.peakMiB, peakSays: input.said.peakSays }
    const use: BookingUse = {
      startedAt: stamp(started),
      endedAt: stamp(ended),
      minutes,
      ...(peakOf.peakMiB === null ? {} : { peakMiB: peakOf.peakMiB }),
      peakSays: peakOf.peakSays,
      ended: input.said.ended,
      recordedAt: stamp(now),
    }
    writeBooking(b, { use }, input.actor)
    if (b.data.sandbox !== undefined) thePeaks.delete(peakKey(b.id, b.data.sandbox))
    const peak = use.peakMiB === undefined ? `its peak could not be read (${use.peakSays})` : `a peak of ${String(gibOfMiB(use.peakMiB))} GiB of the ${String(b.data.gib)} booked`
    return {
      booking: theBooking(b.id, input.workspaceId),
      moved: [],
      settled,
      says: `Recorded: booking ${b.id} was used for ${String(minutes)} minutes, with ${peak}. The command ended with ${use.ended}.`,
    }
  })
}

// ============================================================================ go first

export const A_GO_FIRST = z.object({ ahead: z.string().trim().min(1) }).strict()
export const A_GO_FIRST_ANSWER = z.object({ grant: z.boolean() }).strict()

/**
 * WHO MUST GRANT A REQUEST TO GO FIRST, besides the owner, who may always grant or refuse it alone.
 *
 * The secretaries concerned: the one the applicant answers to and the one the holder answers to, read by
 * `theSecretaryAgentAnswersTo`. The applicant never grants its own request, so a secretary that applies
 * leaves its side to the owner. A booking the owner holds is theirs to give up, and an agent the office can
 * name no secretary for leaves its side to the owner too: then nobody but the owner can grant it, and
 * `ownerOnly` says why.
 */
export function whoMustGrant(applicant: ParticipantRef, holder: ParticipantRef): {
  needs: ParticipantRef[]
  ownerOnly: string | null
  twoSecretaries: boolean
} {
  if (holder.kind === 'person') return { needs: [], ownerOnly: 'the booking it asks to go ahead of is the owner\'s', twoSecretaries: false }
  if (applicant.kind === 'person') return { needs: [], ownerOnly: 'the owner applies through their own booking', twoSecretaries: false }
  const mine = theSecretaryAgentAnswersTo(applicant.id)
  const theirs = theSecretaryAgentAnswersTo(holder.id)
  if (mine === null || theirs === null) {
    return { needs: [], ownerOnly: `the office can name no secretary for ${mine === null ? handleOf(applicant) : handleOf(holder)}`, twoSecretaries: false }
  }
  if (sameParticipant(mine, applicant)) {
    return { needs: [], ownerOnly: `${handleOf(applicant)} is its own secretary and does not grant its own request`, twoSecretaries: false }
  }
  const needs = sameParticipant(mine, theirs) ? [mine] : [mine, theirs]
  return { needs, ownerOnly: null, twoSecretaries: needs.length === 2 }
}

/**
 * WHETHER THIS CALLER'S ANSWER TO A REQUEST TO GO FIRST COUNTS: the owner's always, and a secretary's only when
 * the request needs it. Asked by the answer door and by GET /api/resources/gpu, which shows Grant and Refuse
 * only to a caller this says yes for.
 */
function mayAnswer(asked: BookingGoFirst, actor: Actor, caller: ParticipantRef | null): boolean {
  if (isTheOwner(actor)) return true
  return caller !== null && asked.secretaries.some((one) => sameParticipant(one, caller))
}

/** The one spelling of a clash's group: the two bookings. Never drawn. */
export function bookingClashKey(applicantBooking: string, ahead: string): string {
  return ['booking-clash', applicantBooking, ahead].join('|')
}

/** An agent asks for its booking to go ahead of another. Nothing moves until it is granted. */
export function askToGoFirst(input: { workspaceId: string; id: string; said: z.output<typeof A_GO_FIRST>; actor: Actor; now?: number }): BookingAnswer & {
  secretaries: ParticipantRef[]
  group: string | null
} {
  const now = input.now ?? Date.now()
  const caller = theCallerOrARefusal(input.actor, 'Asking to go first')
  return asOneBookingWrite(now, (settled) => {
    const b = theBooking(input.id, input.workspaceId)
    if (!sameParticipant(caller, b.data.holder)) {
      const met = () => gateMet('who-asks-and-answers-to-go-first')
      if (gatePosition('who-asks-and-answers-to-go-first') === 'block') {
        throw gateMetOnceTheWriteIsTakenBack(new PanelError(`Booking ${b.id} is ${nameOfWho(b.data.holder)}'s, so only its holder asks for it to go first. Nothing was written.`, 403), met)
      }
      met()
    }
    if (isTheOwner(input.actor)) {
      throw new PanelError('The owner does not ask to go first: the owner\'s booking starts at the time asked, and "cutIn" acts on the bookings running then. Nothing was written.', 409)
    }
    if (b.data.state !== 'waiting') throw new PanelError(`Booking ${b.id} is ${b.data.state}; only a waiting booking asks to go first. Nothing was written.`, 409)
    if (b.data.goFirst?.state === 'asked') {
      throw new PanelError(`Booking ${b.id} already asks to go ahead of ${b.data.goFirst.ahead}. Wait for the answer. Nothing was written.`, 409)
    }
    const ahead = liveBookings().find((one) => one.id === input.said.ahead)
    if (ahead === undefined) throw new PanelError(`${input.said.ahead} is not a booking in the line. Nothing was written.`, 404)
    if (ahead.id === b.id) throw new PanelError('A booking cannot go ahead of itself. Nothing was written.', 400)
    if (ahead.start > b.start) {
      throw new PanelError(`Booking ${ahead.id} already starts after yours, at ${said(ahead.start, now)}. Nothing was written.`, 409)
    }
    const who = whoMustGrant(b.data.holder, ahead.data.holder)
    let group: string | null = null
    const lineTo = (reader: ParticipantRef, toAPerson: boolean): AnOfficeLine =>
      SYSTEM_LINES.aGoFirstIsAsked(
        handleOf(b.data.holder),
        b.id,
        ahead.id,
        sameParticipant(reader, ahead.data.holder) ? null : nameOfWho(ahead.data.holder),
        toAPerson,
      )
    if (who.twoSecretaries) {
      // THE CLASH OF TWO SECRETARIES' AGENTS: one group with the applicant, the holder and both secretaries,
      // opened the way a work-area overlap opens one.
      const members: { who: ParticipantRef; because: string }[] = []
      const add = (one: ParticipantRef, because: string): void => {
        if (!members.some((m) => participantKey(m.who) === participantKey(one))) members.push({ who: one, because })
      }
      add(b.data.holder, `It asks for its GPU booking ${b.id} to go first.`)
      add(ahead.data.holder, `Its GPU booking ${ahead.id} is the one asked to wait.`)
      for (const secretary of who.needs) add(secretary, 'It is a secretary concerned, and its grant is needed.')
      group = openTheGroupOnce(
        bookingClashKey(b.id, ahead.id),
        `GPU: ${handleOf(b.data.holder)} asks to go before ${handleOf(ahead.data.holder)}`,
        "Two secretaries' agents clash over the GPU, so this group was opened for them and both secretaries to settle it.",
        members,
        // THE GROUP'S LINE IS AN AGENTS' LINE: its members are the two agents and their two secretaries.
        SYSTEM_LINES.aGoFirstIsAsked(handleOf(b.data.holder), b.id, ahead.id, nameOfWho(ahead.data.holder), false),
        input.workspaceId,
        theOffice(),
      )
    } else {
      for (const one of who.needs.length === 0 ? [THE_OWNER] : who.needs) tellOneOfABooking(one, b.workspaceId, (toAPerson) => lineTo(one, toAPerson))
    }
    const goFirst: BookingGoFirst = {
      ahead: ahead.id,
      state: 'asked',
      secretaries: who.needs,
      answers: [],
      ...(group === null ? {} : { group }),
      askedAt: stamp(now),
    }
    writeBooking(b, { goFirst }, input.actor)
    return {
      booking: theBooking(b.id, input.workspaceId),
      moved: [],
      settled,
      secretaries: who.needs,
      group,
      says:
        `Asked: booking ${b.id} to go ahead of ${ahead.id}. It keeps its place until the request is granted. ` +
        (who.ownerOnly !== null
          ? `Only the owner can grant it, because ${who.ownerOnly}.`
          : `It needs ${who.needs.map(handleOf).join(' and ')} to grant it, or the owner.`) +
        (group === null ? '' : ` A group was opened for the four of you: ${group}.`),
    }
  })
}

/** The granted answer's last sentence: a grant moves only the booking that asked. */
export const NO_OTHER_BOOKING_WAS_MOVED = 'No other booking was moved.'

/**
 * GRANT OR REFUSE A REQUEST TO GO FIRST. The owner decides it alone. A secretary's answer counts only when
 * the request needs it, which is to say only for its own agents; one refusal it needs refuses it, and it is
 * granted when every secretary it needs has granted it.
 *
 * A SECRETARY'S OWN RIGHT IS ASKED FIRST. A secretary the request needs answers as itself, even where this office keeps
 * the door for the person: its answer names no grant, and it counts as its own answer.
 *
 * ONLY A SECRETARY WITH NO RIGHT OF ITS OWN ASKS THE PERSON'S GRANT, where this office's list of what the grant carries
 * says the door may be pressed. That answer decides the request alone as the owner's does. The check is told who filed
 * the request, which is the holder of the booking that asks, so the card's `neverOnItsOwnFiling` stops a secretary
 * granting its own request even where the list opens the door. The card keeps this door for the person by default, so an
 * office that changed nothing behaves as before.
 */
export function answerAGoFirst(input: { workspaceId: string; id: string; said: z.output<typeof A_GO_FIRST_ANSWER>; actor: Actor; now?: number }): BookingAnswer & {
  state: GoFirstState
} {
  const now = input.now ?? Date.now()
  const caller = theCallerOrARefusal(input.actor, 'Answering a request to go first')
  return asOneBookingWrite(now, (settled, settlementWrote) => {
    const b = theBooking(input.id, input.workspaceId)
    const asked = b.data.goFirst
    if (asked === undefined || asked.state !== 'asked') {
      throw new PanelError(
        `Booking ${b.id} has no request to go first waiting${asked === undefined ? '' : `: its request was ${asked.state}`}. Nothing was written.`,
        409,
      )
    }
    const owner = isTheOwner(input.actor)
    // THE GATE IS READ BEFORE THE RAISE IS ASKED. At off the gate lets any caller answer, so the raise is not asked,
    // refuses nobody and has nothing written down under it, and a grant still waits for every secretary the request
    // needs. At block the raise is asked as before, and an answer it carries is not counted as one the gate would hold.
    const position = gatePosition('who-asks-and-answers-to-go-first')
    const ofItsOwnRight = !owner && mayAnswer(asked, input.actor, caller)
    const filedBy = b.data.holder.kind === 'agent' ? b.data.holder.id : null
    const carried = !owner && !ofItsOwnRight && input.actor.type === 'agent' && position === 'block' && aRaiseCarriesIt(input.actor, { filedBy })
    const gateWrote = !owner && !ofItsOwnRight && !carried
    if (gateWrote) {
      const met = () => gateMet('who-asks-and-answers-to-go-first', position!)
      if (position === 'block') {
        throw gateMetOnceTheWriteIsTakenBack(new PanelError(
          `A secretary's answer counts only for its own agents. This request needs ${asked.secretaries.length === 0 ? 'the owner alone' : asked.secretaries.map(handleOf).join(' and ')}` +
            `${asked.secretaries.length === 0 ? '' : ', or the owner'}, and ${nameOfWho(caller)} is not among them. Nothing was written.`,
          403,
        ), met)
      }
      met()
    }
    const answers = [...asked.answers.filter((a) => !sameParticipant(a.by, caller)), { by: caller, grant: input.said.grant, at: stamp(now) }]
    const granted = owner || carried ? input.said.grant : input.said.grant && asked.secretaries.every((one) => answers.some((a) => a.grant && sameParticipant(a.by, one)))
    const refused = !input.said.grant
    const state: GoFirstState = refused ? 'refused' : granted ? 'granted' : 'asked'
    const bookingWrote = writeBooking(b, { goFirst: { ...asked, answers, state, ...(state === 'asked' ? {} : { settledAt: stamp(now) }) } }, input.actor)
    const reminders = state === 'granted' ? applyTheGrant(b, asked.ahead, now, input.actor) : []
    const booking = theBooking(b.id, input.workspaceId)
    if (state !== 'asked') {
      writeASystemLineToOne(b.data.holder, b.workspaceId, SYSTEM_LINES.aGoFirstWasAnswered(b.id, state === 'granted', nameOfWho(caller), said(booking.start, now)), theOffice())
    }
    const nothingWritten = !settlementWrote && !gateWrote && !bookingWrote && state === 'asked' ? nothingWrittenSentence({ kind: 'already-stored' }) : undefined
    const waitingFor = asked.secretaries.filter((one) => !answers.some((a) => a.grant && sameParticipant(a.by, one)))
    return {
      booking,
      moved: [],
      settled,
      state,
      ...(nothingWritten === undefined ? {} : { nothingWritten }),
      says: nothingWritten ?? (
        state === 'granted'
          ? `Granted: booking ${b.id} now starts at ${said(booking.start, now)}. ${NO_OTHER_BOOKING_WAS_MOVED}${reminders.map((one) => ` ${one}`).join('')}`
          : state === 'refused'
            ? `Refused: booking ${b.id} keeps its place, and its holder was told.`
            : `Your grant is recorded. It still needs ${waitingFor.map(handleOf).join(' and ')}.`),
    }
  })
}

/**
 * A GRANTED BOOKING STARTS AT THE TIME IT ASKED FOR, or now when that has passed or it asked for none, and moves
 * nobody. Nobody is moved for memory. When the GiB booked then go over the card,
 * the holders
 * are reminded. Returns the reminders, for the answer.
 */
function applyTheGrant(b: Booking, aheadId: string, now: number, actor: Actor): string[] {
  const start = Math.max(now, (b.data.askedFor === undefined ? null : parseLocalStamp(b.data.askedFor)) ?? now)
  const end = start + b.data.minutes * MINUTE
  writeBooking(b, { startsAt: stamp(start), endsAt: stamp(end), movedBecause: `Its request to go ahead of ${aheadId} was granted.` }, actor)
  return remindOfTheCard(theBooking(b.id, b.workspaceId), start, end, now)
}

// ============================================================================ the cut-in step

export const A_CUT_IN_STEP = z.object({ sandbox: z.string().trim().min(1), did: z.enum(CUT_IN_STEPS) }).strict()

/** The GPU watcher records what its cut-in step did to a sandbox, on the owner's booking (point 6). */
export function recordACutInStep(input: { workspaceId: string; id: string; said: z.output<typeof A_CUT_IN_STEP>; actor: Actor; now?: number }): BookingAnswer {
  const now = input.now ?? Date.now()
  if (!isTheOwner(input.actor) && !isTheGpuWatcher(input.actor) && gateMet('who-reports-on-the-gpu') === 'block') {
    throw new PanelError(onlyTheGpuWatcherOrTheOwner('records a cut-in step'), 403)
  }
  return asOneBookingWrite(now, (settled) => {
    const b = theBooking(input.id, input.workspaceId)
    if (b.data.cutIn === undefined) throw new PanelError(`Booking ${b.id} did not go first with a cut-in, so it has no step to record. Nothing was written.`, 409)
    const actions = [...b.data.cutIn.actions, { sandbox: input.said.sandbox, did: input.said.did, at: stamp(now) }]
    writeBooking(b, { cutIn: { ...b.data.cutIn, actions } }, input.actor)
    return { booking: theBooking(b.id, input.workspaceId), moved: [], settled, says: `Recorded: sandbox ${input.said.sandbox} was ${input.said.did === 'down' ? 'taken down' : 'brought up without the card'}.` }
  })
}

// ============================================================================ the end a booking shows

/**
 * HOW LONG A BOOKING LASTS, AS EVERY READER IS TOLD IT (round 37). A running booking lasts until its program ends:
 * `endsAt` is only its planned end. Where the program reported how far it is, the expected end is the report's time
 * plus the steps left at the pace since the program started: its group leader's start, or when it was named for a
 * ledger row. With no report, or none done yet, no end is expected. A booking with no program ends at `endsAt`.
 */
export interface BookingEnd {
  lasts: 'until its program ends' | 'at its end'
  plannedEnd: string
  progress: BookingProgress | null
  /** The expected end, on the office computer's clock; null when nothing reported lets the office work one out. */
  expectedEnd: string | null
  says: string
}

export function theEndOf(b: Booking, now: number): BookingEnd {
  if (b.data.state !== 'running' || b.data.program === undefined) {
    return { lasts: 'at its end', plannedEnd: b.data.endsAt, progress: null, expectedEnd: null, says: `It ends at ${said(b.end, now)}.` }
  }
  const planned = `It lasts until its program ends, planned for ${said(b.end, now)}.`
  const p = b.data.progress ?? null
  const base = { lasts: 'until its program ends' as const, plannedEnd: b.data.endsAt, progress: p }
  if (p === null) return { ...base, expectedEnd: null, says: `${planned} Its program has not said how far it is, so no end is expected.` }
  const reported = parseLocalStamp(p.at)
  const started = parseLocalStamp(b.data.program.leaderStartedAt ?? b.data.program.namedAt)
  const counted = `${String(p.done)} of ${String(p.of)} done at ${reported === null ? p.at : said(reported, now)}`
  if (p.done === p.of) return { ...base, expectedEnd: null, says: `${planned} ${counted}: it ends when its program ends.` }
  if (p.done === 0 || reported === null || started === null || reported <= started) {
    return { ...base, expectedEnd: null, says: `${planned} ${counted}, which is not enough to expect an end.` }
  }
  const expected = reported + ((reported - started) / p.done) * (p.of - p.done)
  return { ...base, expectedEnd: stamp(expected), says: `${planned} Expected about ${said(expected, now)}, from ${counted}.` }
}

// ============================================================================ GET /api/resources/gpu

export interface GpuBookingLine {
  booking: string
  holder: ParticipantRef
  state: BookingState
  startsAt: string
  endsAt: string
  gib: number
  /** Running bookings only: whether the program is running, has ended, or cannot be read. */
  program?: 'running' | 'its program has ended' | 'cannot be read' | 'not named'
}

export interface GpuView {
  says: string
  /** Who asks, and whether it is the owner, proved: only then does the page draw the owner's two choices. */
  you: { who: ParticipantRef | null; theOwner: boolean }
  /** The name of everybody this answer names, by `participantKey`, so the page draws names and not ids. */
  names: Record<string, string>
  cardGiB: number | null
  freeGiBNow: number | null
  /** What `freeGiBNow` was counted from: the card's newest reading, or the bookings alone and why. Null with it. */
  freeCounts: FreeCounts | null
  /** `until` is the planned end; `end` says whether it lasts until its program ends, and what end is expected. */
  running: { booking: string; holder: ParticipantRef; gib: number; until: string; end: BookingEnd; program: NonNullable<GpuBookingLine['program']> }[]
  yours: { booking: string; state: BookingState; startsAt: string; endsAt: string; end: BookingEnd; gib: number }[]
  next: { booking: string; holder: ParticipantRef; startsAt: string } | null
  secondLevel?: {
    line: (GpuBookingLine & {
      purpose: string
      sandbox: string | null
      programSays: string | null
      goFirst: BookingGoFirst | null
      /** Whether the caller's answer to this booking's waiting request to go first would count. */
      mayAnswer: boolean
      movedBecause: string | null
      /** 'daily' on a booking that repeats; null on one that does not. */
      repeat: BookingRepeat | null
      /** Minutes a running booking is past its planned end while its program has not ended; null otherwise. */
      overByMinutes: number | null
      end: BookingEnd
      /** Each time its end was moved later, in order. */
      extensions: BookingExtension[]
    })[]
    card: { reading: GpuReading | null; says: string }
    withoutABooking: GpuReadingProcess[]
    week: GpuWeek
  }
}

/**
 * WHAT `freeGiBNow` WAS COUNTED FROM (problem IhwlmgpdJD2W). A job with no booking holds card memory that the
 * bookings do not count, so a fresh reading is used when there is one. `unbookedMiB` is what the reading's
 * processes with no booking hold. A reading older than A_READING_IS_OLD_AFTER_MINUTES, or one that could not
 * read the card, is not used, and free is then counted from the bookings alone.
 */
export type FreeCounts =
  | { from: 'the card'; bookedGiB: number; usedMiB: number; unbookedMiB: number; unbooked: number }
  | { from: 'bookings only'; bookedGiB: number; because: 'no reading' | 'an old reading' | 'an unread card'; since: string | null }

/**
 * THE CARD'S FREE MEMORY NOW: the card less the larger of what the newest reading says is in use and what the
 * bookings hold. Each side is counted in its own unit. The bookings may add up to the card's whole GiB
 * (cardGiBOf), and the reading's free is the total less its use, floored, so the display's share is not
 * taken twice.
 */
function theFreeNow(card: number, bookedGiB: number, live: readonly Booking[], now: number): { gib: number; counts: FreeCounts } {
  const byBookings = Math.max(0, card - bookedGiB)
  const r = theLatestReading
  const because =
    r === null ? 'no reading' : now - r.receivedAt > A_READING_IS_OLD_AFTER_MINUTES * MINUTE ? 'an old reading' : 'error' in r ? 'an unread card' : null
  if (r === null || because !== null || 'error' in r) {
    return {
      gib: byBookings,
      counts: { from: 'bookings only', bookedGiB, because: because ?? 'an unread card', since: r === null ? null : said(r.receivedAt, now) },
    }
  }
  const unbooked = r.processes.filter((p) => theBookingThatCounts(p, live) === undefined)
  const byTheCard = Math.max(0, Math.floor((r.totalMiB - r.usedMiB) / 1024))
  return {
    gib: Math.min(byBookings, byTheCard),
    counts: {
      from: 'the card',
      bookedGiB,
      usedMiB: r.usedMiB,
      unbookedMiB: unbooked.reduce((sum, p) => sum + p.mib, 0),
      unbooked: unbooked.length,
    },
  }
}

function programWord(b: Booking): NonNullable<GpuBookingLine['program']> {
  if (b.data.program === undefined) return 'not named'
  const live = theProgramsLiveness(b.data.program)
  return live.state === 'alive' ? 'running' : live.state === 'gone' ? 'its program has ended' : 'cannot be read'
}

function theCardSays(now: number): string {
  const r = theLatestReading
  if (r === null) return 'The watcher has not read the card since the server started.'
  const age = now - r.receivedAt
  if (age > A_READING_IS_OLD_AFTER_MINUTES * MINUTE) return `The watcher has not read the card since ${said(r.receivedAt, now)}.`
  return 'error' in r ? `The watcher's last reading says the card could not be read: ${r.error}` : `Read ${String(Math.round(age / 1000))} seconds ago.`
}

/** WHERE THE CARD STANDS, ANSWER FIRST. Writes nothing. `secondLevel` only when asked. */
export function theGpuNow(input: { actor: Actor; secondLevel: boolean; now?: number }): GpuView {
  const now = input.now ?? Date.now()
  const me = participantForActor(input.actor)
  const live = liveBookings()
  const card = theCardGiB()
  const covering = live.filter((b) => b.data.state === 'running' || (b.start <= now && now < b.end))
  const used = covering.reduce((sum, b) => sum + b.data.gib, 0)
  const free = card === null ? null : theFreeNow(card, used, live, now)
  const running = live
    .filter((b) => b.data.state === 'running')
    .map((b) => ({ booking: b.id, holder: b.data.holder, gib: b.data.gib, until: b.data.endsAt, end: theEndOf(b, now), program: programWord(b) }))
  const yours = me === null ? [] : live.filter((b) => sameParticipant(b.data.holder, me))
  const nextOne = live.find((b) => b.data.state === 'waiting' && b.start > now) ?? null

  const mine = yours[0]
  let says: string
  if (card === null || free === null) {
    says = `Host GPU: the card's size is not known yet. ${theCardSays(now)}`
  } else if (mine !== undefined) {
    const state =
      mine.data.state === 'running'
        ? programWord(mine) === 'its program has ended' ? 'Its program has ended.' : 'Running.'
        : mine.start <= now ? 'Its time has come; no program is named yet.' : 'Waiting.'
    const end = theEndOf(mine, now)
    says =
      end.lasts === 'until its program ends'
        ? `Host GPU: booked for you from ${said(mine.start, now)}, ${String(mine.data.gib)} GiB. ${state} ${end.says}`
        : `Host GPU: booked for you, ${said(mine.start, now)} to ${said(mine.end, now)}, ${String(mine.data.gib)} GiB. ${state}`
  } else {
    const counts = free.counts
    says =
      `Host GPU: ${String(free.gib)} of ${String(card)} GiB free now` +
      (counts.from === 'bookings only'
        ? `, counting bookings only. ${theCardSays(now)}`
        : counts.unbooked === 0
          ? '.'
          : `. ${counts.unbooked === 1 ? 'A job with no booking holds' : `${String(counts.unbooked)} jobs with no booking hold`} ` +
            `${String(gibOfMiB(counts.unbookedMiB))} GiB.`) +
      (nextOne === null ? ' Nothing is waiting.' : ` Next booking at ${said(nextOne.start, now)}.`)
  }

  const view: GpuView = {
    says,
    you: { who: me, theOwner: isTheOwner(input.actor) },
    names: {},
    cardGiB: card,
    freeGiBNow: free === null ? null : free.gib,
    freeCounts: free === null ? null : free.counts,
    running,
    yours: yours.map((b) => ({ booking: b.id, state: b.data.state, startsAt: b.data.startsAt, endsAt: b.data.endsAt, end: theEndOf(b, now), gib: b.data.gib })),
    next: nextOne === null ? null : { booking: nextOne.id, holder: nextOne.data.holder, startsAt: nextOne.data.startsAt },
  }
  const name = (who: ParticipantRef): void => {
    view.names[participantKey(who)] = readParticipant(who)?.name ?? handleOf(who)
  }
  for (const one of [...running.map((r) => r.holder), ...(view.next === null ? [] : [view.next.holder]), ...(me === null ? [] : [me])]) name(one)
  if (!input.secondLevel) return view

  const reading = theLatestReading
  const processes = reading !== null && 'processes' in reading ? reading.processes : []
  view.secondLevel = {
    line: live.map((b) => ({
      booking: b.id,
      holder: b.data.holder,
      state: b.data.state,
      startsAt: b.data.startsAt,
      endsAt: b.data.endsAt,
      gib: b.data.gib,
      ...(b.data.state === 'running' ? { program: programWord(b) } : {}),
      purpose: b.data.purpose,
      sandbox: b.data.sandbox ?? null,
      programSays: b.data.program?.says ?? null,
      goFirst: b.data.goFirst ?? null,
      mayAnswer: b.data.goFirst?.state === 'asked' && mayAnswer(b.data.goFirst, input.actor, me),
      movedBecause: b.data.movedBecause ?? null,
      repeat: b.data.repeat ?? null,
      overByMinutes:
        b.data.state === 'running' && b.end <= now && programWord(b) !== 'its program has ended' ? Math.max(1, Math.round((now - b.end) / MINUTE)) : null,
      end: theEndOf(b, now),
      extensions: b.data.extensions ?? [],
    })),
    card: { reading, says: theCardSays(now) },
    withoutABooking: processes.filter((p) => theBookingThatCounts(p, live) === undefined),
    week: theWeekNow(now),
  }
  for (const b of live) {
    name(b.data.holder)
    for (const one of b.data.goFirst?.secretaries ?? []) name(one)
  }
  for (const one of view.secondLevel.week.byHolder) name(one.holder)
  return view
}
