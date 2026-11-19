// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE KIND IN A FILE OF ITS OWN: `booking`, a resource booked for a time.
 *
 * It was moved out of src/shared/kinds.ts with no change of behaviour: the same purpose,
 * whenToRecord, humanOnly, fields, rules and example, and the same place in the kind list.
 *
 * NO CALLER CHANGED. src/shared/kinds.ts hands this file on with `export *`, and every caller
 * still imports the kind from kinds.ts.
 *
 * THIS FILE IMPORTS `unionOf` AND THE `KindSpec` AND `ShapeSpec` TYPES FROM ./kind-common.ts,
 * AND `BOOKING_REPEATS` AND `BOOKING_RESOURCES` AND `BOOKING_STARTS` AND `BOOKING_STATES` AND
 * `CUT_IN_CHOICES` AND `CUT_IN_STEPS` AND `GO_FIRST_STATES` FROM ../bookings.ts. IT IMPORTS
 * NOTHING FROM ../types.ts.
 */
import { unionOf, type KindSpec, type ShapeSpec } from './kind-common.ts'
import { BOOKING_REPEATS, BOOKING_RESOURCES, BOOKING_STARTS, BOOKING_STATES, CUT_IN_CHOICES, CUT_IN_STEPS, GO_FIRST_STATES } from '../bookings.ts'
export const bookingKind: KindSpec = {
    kind: 'booking',
    purpose:
      'ONE BOOKING OF THE HOST GPU: who booked it, for how long, how many GiB of card memory and what for, where it ' +
      'stands in the line, and the program doing its work. Bookings overlap in time while their GiB together fit the ' +
      "card. The owner's booking goes first; an agent may ask to go first, and the owner or the secretaries concerned " +
      'answer.',
    whenToRecord:
      'Never through POST /api/records: every write to this kind is refused there, the person\'s included. Book with ' +
      'POST /api/bookings before you start work that uses the card, and name the program with POST ' +
      '/api/bookings/<id>/program when it starts.',
    humanOnly: false,
    fields: [
      { key: 'resource', type: unionOf(BOOKING_RESOURCES), required: true, description: 'What is booked. The host GPU only.', example: 'gpu' },
      { key: 'gib', type: 'number', required: true, description: 'Whole GiB of card memory, from 1 to the card\'s size.', example: 10 },
      { key: 'minutes', type: 'number', required: true, description: 'How long, in minutes.', example: 57 },
      { key: 'purpose', type: 'string', required: true, description: 'What it is for, in the words of whoever booked it.', example: 'Train the grasp model on the new recordings.' },
      {
        key: 'holder',
        type: 'ParticipantRef',
        required: true,
        description: 'WHO BOOKED IT, written once by the office from the caller and never from a body.',
        example: { kind: 'agent', id: 'worker-1' },
      },
      { key: 'startAsked', type: unionOf(BOOKING_STARTS), required: true, description: 'How the start was asked for.', example: 'now' },
      { key: 'askedFor', type: 'string', required: false, description: 'The time asked for, when startAsked is "at".', example: '2026-10-08 16:00:00' },
      { key: 'startsAt', type: 'string', required: true, description: "Where the office placed it, on the office computer's clock.", example: '2026-10-08 16:03:00' },
      { key: 'endsAt', type: 'string', required: true, description: 'The end of its time. Advice only: running over never ends a booking.', example: '2026-10-08 17:00:00' },
      { key: 'state', type: unionOf(BOOKING_STATES), required: true, description: 'Where it stands in the line: "waiting" for its time, "running" now, "ended" with its program, or "cancelled" before it ended.', example: 'running' },
      { key: 'endedBecause', type: 'string', required: false, description: 'Why it ended or was cancelled, in words.', example: 'Nothing is running in process group 41230 any more.' },
      { key: 'sandbox', type: 'string', required: false, description: 'The sandbox its work runs in. Absent means the host.', example: 'ai-news-studio' },
      { key: 'program', type: 'BookingProgram', required: false, description: 'The program doing its work, once it is named.', example: { pgid: 41230, leaderStartedAt: '2026-10-08 16:03:12', says: 'process group 41230', namedAt: '2026-10-08 16:03:15' } },
      { key: 'goFirst', type: 'BookingGoFirst', required: false, description: 'Its holder\'s request to go first, when one was made.', example: { ahead: 'Lw0d7c2rXk9A', state: 'asked', secretaries: [], answers: [], askedAt: '2026-10-08 16:04:00' } },
      { key: 'cutIn', type: 'BookingCutIn', required: false, description: "The owner's own press, on the owner's own booking only, when the owner sent one and a booking was running in that booking's time.", example: { choice: 'after', moved: [], actions: [] } },
      { key: 'movedBecause', type: 'string', required: false, description: 'Why the office last moved it, in words.', example: "The owner's booking goes first." },
      { key: 'repeat', type: unionOf(BOOKING_REPEATS), required: false, description: '"daily": the office books the same time the next day when this day\'s time comes. Cancelling one day stops the repeating.', example: 'daily' },
      { key: 'repeatOf', type: 'string', required: false, description: 'The first booking of a daily series, on each later day\'s booking.', example: 'Lw0d7c2rXk9A' },
      { key: 'nextDay', type: 'string', required: false, description: "The next day's booking, once the office has written it.", example: 'p7Rk2LmQ0vXa' },
      { key: 'overRunTold', type: 'string[]', required: false, description: 'The next bookings whose holders were told this one runs over, so that each is told once.', example: ['p7Rk2LmQ0vXa'] },
      { key: 'unbookedTold', type: 'number[]', required: false, description: 'Earlier notices of processes with no booking, by pid. No longer written; read to keep notices once for each job.', example: [51877] },
      { key: 'unbookedJobsTold', type: 'string[]', required: false, description: 'The jobs with no booking that its holder was told were on the card during it, once for each job. Keys name the host unit, sandbox or unknown process: host:<unit>, sandbox:<name> or pid:<pid>.', example: ['host:tmux-spawn-a6e25d21-test.scope'] },
      { key: 'progress', type: 'BookingProgress', required: false, description: 'How far its program last said it was. Taken off with the program.', example: { done: 17, of: 42, at: '2026-10-08 16:40:00' } },
      { key: 'extensions', type: 'BookingExtension[]', required: false, description: 'Each time its holder, a secretary or the owner moved its end later, in order.', example: [{ from: '2026-10-08 17:00:00', to: '2026-10-08 19:30:00', because: 'The job has 25 of 42 cases left.', by: { kind: 'agent', id: 'worker-1' }, at: '2026-10-08 16:45:00' }] },
      { key: 'use', type: 'BookingUse', required: false, description: 'What the GPU tool recorded of the use, when the tool ran it.', example: { startedAt: '2026-10-08 16:03:12', endedAt: '2026-10-08 16:51:40', minutes: 48, peakMiB: 9120, peakSays: 'Read every 5 seconds.', ended: 'exit 0', recordedAt: '2026-10-08 16:51:41' } },
    ],
    rules: [
      'Only its own doors write a booking. Every other create, change, kind change, delete, restore and move is refused, whoever asks.',
      // No hard gate on GPU memory, only a reminder, in wave 13s round 38.
      "The live bookings' GiB may add up to more than the card's size. Nothing is refused or moved for it; the holders of the bookings running together are reminded.",
      'A booking ends when its program ends.',
      'A running booking lasts until its program ends: its endsAt is its planned end, and the extend door moves it later.',
      'An extension moves no other booking, and is never refused for memory. Its holder, a secretary or the owner makes it, with a reason.',
      "A request to go first is granted by the owner alone, or by every secretary it needs.",
      "A daily booking's next day is booked once, at the time first asked for, and moves nobody.",
    ],
    example: {
      resource: 'gpu',
      gib: 10,
      minutes: 57,
      purpose: 'Train the grasp model on the new recordings.',
      holder: { kind: 'agent', id: 'worker-1' },
      startAsked: 'now',
      startsAt: '2026-10-08 16:03:00',
      endsAt: '2026-10-08 17:00:00',
      state: 'waiting',
    },
}

/** The shapes of this kind, moved out of ../kinds.ts with their comments unchanged. */
export const BOOKING_SHAPES: Record<string, ShapeSpec> = {
  // THE PARTS OF A GPU BOOKING (src/shared/bookings.ts). Each is nested in its
  // booking and written only by the booking doors in src/server/lib/bookings.ts.
  BookingProgram: {
    name: 'BookingProgram',
    description:
      'THE PROGRAM DOING A BOOKING\'S WORK: a process group, named by its id and its leader\'s start time, or a ' +
      'ledger row (a process, a container or an exec). The booking ends when it ends.',
    fields: [
      { key: 'pgid', type: 'number', required: false, description: 'The process group id. Present when the program is a process group.', example: 41230 },
      { key: 'leaderStartedAt', type: 'string', required: false, description: "The group leader's start time, which tells this group apart from a later one given the same number.", example: '2026-10-08 16:03:12' },
      { key: 'row', type: 'string', required: false, description: 'The id of the ledger row that is the program. Present when the program is a row.', example: 'k3P0aZr9wQ1x' },
      { key: 'rowProject', type: 'string', required: false, description: 'The project that holds the row.', example: 'kite-lab' },
      { key: 'says', type: 'string', required: true, description: 'The program in words, as the office read it when it was named.', example: 'process group 41230, led by python train.py' },
      { key: 'namedAt', type: 'string', required: true, description: 'When it was named, on the office computer\'s clock.', example: '2026-10-08 16:03:15' },
    ],
  },

  BookingAnswer: {
    name: 'BookingAnswer',
    description: 'ONE ANSWER TO A REQUEST TO GO FIRST: who gave it, yes or no, and when.',
    fields: [
      { key: 'by', type: 'ParticipantRef', required: true, description: 'Who answered: the owner, or a secretary concerned.', example: { kind: 'agent', id: 'secretary-1' } },
      { key: 'grant', type: 'boolean', required: true, description: 'True for a grant, false for a refusal.', example: true },
      { key: 'at', type: 'string', required: true, description: "When, on the office computer's clock.", example: '2026-10-08 16:05:00' },
    ],
  },

  BookingGoFirst: {
    name: 'BookingGoFirst',
    description:
      "AN AGENT'S REQUEST TO GO FIRST, ahead of one other booking. Until it is granted the booking keeps its place.",
    fields: [
      { key: 'ahead', type: 'string', required: true, description: 'The id of the booking it asks to go ahead of.', example: 'Lw0d7c2rXk9A' },
      { key: 'state', type: unionOf(GO_FIRST_STATES), required: true, description: 'Where the request stands. It lapses when the applicant\'s own turn comes.', example: 'asked' },
      { key: 'secretaries', type: 'ParticipantRef[]', required: true, description: 'The secretaries concerned, each of whom must grant it. The owner may grant it alone instead.', example: [{ kind: 'agent', id: 'secretary-1' }] },
      { key: 'answers', type: 'BookingAnswer[]', required: true, description: 'The answers given so far, in order.', example: [] },
      { key: 'group', type: 'string', required: false, description: 'The group opened because the two holders answer to different secretaries.', example: 'gQ2v8XcLm0Pa' },
      { key: 'askedAt', type: 'string', required: true, description: "When it was asked, on the office computer's clock.", example: '2026-10-08 16:04:00' },
      { key: 'settledAt', type: 'string', required: false, description: 'When it was granted, refused or lapsed.', example: '2026-10-08 16:05:00' },
    ],
  },

  BookingCutInStep: {
    name: 'BookingCutInStep',
    description: "ONE THING THE CUT-IN STEP DID to a sandbox that held card memory the owner's booking needed.",
    fields: [
      { key: 'sandbox', type: 'string', required: true, description: 'The sandbox.', example: 'ai-news-studio' },
      { key: 'did', type: unionOf(CUT_IN_STEPS), required: true, description: '"down": taken down. "no-gpu": brought up again without the card.', example: 'down' },
      { key: 'at', type: 'string', required: true, description: "When, on the office computer's clock.", example: '2026-10-08 16:15:00' },
    ],
  },

  BookingCutIn: {
    name: 'BookingCutIn',
    description: "THE CHOICE THE OWNER MAKES WHEN THEIR BOOKING DID NOT FIT beside what was running: go first now, or let them finish first.",
    fields: [
      { key: 'choice', type: unionOf(CUT_IN_CHOICES), required: true, description: '"now": the holders are told and have the grace to stop. "after": the owner\'s booking starts when the running ones end, ahead of every waiting one.', example: 'now' },
      { key: 'graceUntil', type: 'string', required: false, description: 'When the grace ends. Only with "now".', example: '2026-10-08 16:15:00' },
      { key: 'moved', type: 'string[]', required: true, description: 'The ids of the bookings the owner\'s booking moved later.', example: ['Lw0d7c2rXk9A'] },
      { key: 'actions', type: 'BookingCutInStep[]', required: true, description: "What the cut-in step did, in order. Empty until it does something.", example: [] },
    ],
  },

  // Round 37 of wave 13s: a running program says how far it is, and a booking's end is moved later with a reason.
  BookingProgress: {
    name: 'BookingProgress',
    description: "HOW FAR A RUNNING BOOKING'S PROGRAM LAST SAID IT WAS. The expected end is worked out from it when the booking is read.",
    fields: [
      { key: 'done', type: 'number', required: true, description: 'Whole steps done.', example: 17 },
      { key: 'of', type: 'number', required: true, description: 'Of how many steps.', example: 42 },
      { key: 'at', type: 'string', required: true, description: "When it was said, on the office computer's clock.", example: '2026-10-08 16:40:00' },
    ],
  },

  BookingExtension: {
    name: 'BookingExtension',
    description: "ONE EXTENSION OF A BOOKING: its end before and after, why, who asked and when.",
    fields: [
      { key: 'from', type: 'string', required: true, description: 'Its end before.', example: '2026-10-08 17:00:00' },
      { key: 'to', type: 'string', required: true, description: 'Its end after.', example: '2026-10-08 19:30:00' },
      { key: 'because', type: 'string', required: true, description: 'Why, in the words of whoever extended it.', example: 'The job has 25 of 42 cases left.' },
      { key: 'by', type: 'ParticipantRef', required: true, description: 'Who extended it: its holder or a secretary.', example: { kind: 'agent', id: 'worker-1' } },
      { key: 'at', type: 'string', required: true, description: "When, on the office computer's clock.", example: '2026-10-08 16:45:00' },
    ],
  },

  // A tool records each use of a resource and its cost after it.
  BookingUse: {
    name: 'BookingUse',
    description: 'WHAT ONE USE OF A BOOKING WAS, as the GPU tool recorded it when its command ended.',
    fields: [
      { key: 'startedAt', type: 'string', required: true, description: "When the command started, on the office computer's clock.", example: '2026-10-08 16:03:12' },
      { key: 'endedAt', type: 'string', required: true, description: 'When its process group ended.', example: '2026-10-08 16:51:40' },
      { key: 'minutes', type: 'number', required: true, description: 'How long it ran, in whole minutes.', example: 48 },
      { key: 'peakMiB', type: 'number', required: false, description: 'The most card memory the group held at one reading. Left out when it could not be read, and peakSays says why.', example: 9120 },
      { key: 'peakSays', type: 'string', required: true, description: 'How the peak was read, or why it could not be.', example: 'Read every 5 seconds, 577 readings.' },
      { key: 'ended', type: 'string', required: true, description: 'How the command ended.', example: 'exit 0' },
      { key: 'recordedAt', type: 'string', required: true, description: 'When the tool recorded it.', example: '2026-10-08 16:51:41' },
    ],
  },

}
