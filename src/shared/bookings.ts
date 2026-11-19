// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * BOOKINGS OF THE HOST GPU: THE CLOSED LISTS, THE NUMBERS AND THE SENTENCES.
 *
 * Everyone books a resource, the owner included; the owner's booking may go first, and they may let the others
 * finish first. The design (report peyJSnLoz_Bk) was approved, and the approval says who
 * grants an agent's request to go first: the owner with a press, as a rule the secretaries concerned, and when two
 * secretaries' agents clash, a group with the applying agent, the agent using the resource and both secretaries, the
 * way a work-area overlap is settled.
 *
 * The shape was agreed with the GPU watcher, which builds the machine side (messages L0ZsT2z9ZKQW and sw9PGUtZN72K):
 * the card's size comes from the watcher's reading, a booking names the sandbox its work runs in, and its
 * program is a process group or a ledger row.
 *
 * WHY A BOOKING IS A RECORD AND NOT A LEDGER ROW. A slot (lib/slots.ts) exists only while its process
 * group runs. A booking exists before anything runs: it is a time, a length and an amount of card memory
 * somebody asked for. Its program is attached later, and the booking ends when that program ends.
 *
 * NOTHING HERE TOUCHES THE DATABASE, because the browser imports it.
 */

/** The kind word, in one place. */
export const BOOKING_KIND = 'booking'

/** What may be booked. The host GPU only: the GPU watcher asked for no RAM bookings (report peyJSnLoz_Bk). */
export const BOOKING_RESOURCES = ['gpu'] as const
export type BookingResource = (typeof BOOKING_RESOURCES)[number]

/**
 * WHERE A BOOKING STANDS. `waiting` until its program is named; `running` while it is; `ended` when the
 * program ended; `cancelled` when its holder or the owner took it back.
 */
export const BOOKING_STATES = ['waiting', 'running', 'ended', 'cancelled'] as const
export type BookingState = (typeof BOOKING_STATES)[number]

/** The two states a booking takes part in the line in. */
export const LIVE_BOOKING_STATES: readonly BookingState[] = ['waiting', 'running']

/** How the start was asked for: at once, at a time, or whenever the card is free. */
export const BOOKING_STARTS = ['now', 'at', 'when-free'] as const
export type BookingStart = (typeof BOOKING_STARTS)[number]

/** Where an agent's request to go first stands. It lapses when the applicant's own turn comes. */
export const GO_FIRST_STATES = ['asked', 'granted', 'refused', 'lapsed'] as const
export type GoFirstState = (typeof GO_FIRST_STATES)[number]

/** The owner's two choices when their booking does not fit beside what is running. */
export const CUT_IN_CHOICES = ['now', 'after'] as const
export type CutInChoice = (typeof CUT_IN_CHOICES)[number]

/** What the GPU watcher's cut-in step did to a sandbox that held card memory. */
export const CUT_IN_STEPS = ['down', 'no-gpu'] as const
export type CutInStep = (typeof CUT_IN_STEPS)[number]

/** The grace a holder has when the owner goes first now, in minutes (report peyJSnLoz_Bk). */
export const GRACE_MINUTES = 10

/** After this many minutes without a reading, GET /api/resources/gpu says the watcher has not read the card. */
export const A_READING_IS_OLD_AFTER_MINUTES = 2

/** The longest booking, in minutes: one day. Work that comes back every day is a booking that repeats daily. */
export const THE_LONGEST_BOOKING_MINUTES = 24 * 60

/**
 * HOW A BOOKING MAY REPEAT: every day at the time asked, like the news desk's 04:00 round that the GPU watcher asked
 * for (report peyJSnLoz_Bk, part 3). Each day is its own booking. The office writes the next day's when this
 * day's time comes, and cancelling one day's booking stops the repeating.
 */
export const BOOKING_REPEATS = ['daily'] as const
export type BookingRepeat = (typeof BOOKING_REPEATS)[number]

/** How often the GPU tool reads the card for its job's peak memory, in milliseconds. */
export const THE_GPU_TOOL_READS_EVERY_MS = 5_000

/**
 * THE CARD'S SIZE IN WHOLE GiB, from the total the watcher read. The watcher's change 1: the card reports
 * 16303 MiB and the driver and display hold about 0.8 GiB, so the floor of MiB / 1024 is what bookings may
 * add up to. Worked out here once, so a different card is right without a change.
 */
export function cardGiBOf(totalMiB: number): number {
  return Math.floor(totalMiB / 1024)
}

/** A process's card memory in GiB to one decimal, as the page and GET /api/resources/gpu both say it. */
export function gibOfMiB(mib: number): number {
  return Math.round((mib / 1024) * 10) / 10
}

export const A_BOOKING_IS_WRITTEN_BY_ITS_DOORS =
  'A booking is written only by its own doors, because the office places it in the line and moves the bookings ' +
  'it pushes later. Nothing was written.'

export const THE_BOOKING_DOORS =
  'Book with POST /api/bookings, name its program with POST /api/bookings/<id>/program, cancel with POST ' +
  '/api/bookings/<id>/cancel, ask to go first with POST /api/bookings/<id>/go-first, and answer that request with ' +
  'POST /api/bookings/<id>/go-first/answer. The GPU watcher records a cut-in step with POST ' +
  '/api/bookings/<id>/cut-in/step. The GPU tool records a use with POST /api/bookings/<id>/use. A running ' +
  'program reports how far it is with POST /api/bookings/<id>/progress, and its holder, a secretary or the owner extends a ' +
  'booking with POST /api/bookings/<id>/extend. GET ' +
  '/api/resources/gpu says where the card stands.'
