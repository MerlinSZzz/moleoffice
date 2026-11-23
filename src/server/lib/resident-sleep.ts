// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PERMANENT RESIDENT'S SLEEPS, READ AND WRITTEN HERE ONLY.
 *
 * The person's decisions, 3 October 2026: a resident sleeps;
 * while it sleeps its heartbeat goes on and non-urgent messages are held until it wakes; a postponed sleep is not
 * reported to the person and shows on the agent's chat side and on its profile.
 *
 * A sleep is an act the resident or the person records: begin, wake, postpone. The rows are in `resident_sleeps`
 * (migration 0233). The person's decision of 6 November 2026 adds a resident's own sleep time: the time of day its
 * sleep begins and how long it lasts, on the office's clock, kept on its agent row (migration 0330). The minute timer
 * in src/server/lib/sleep-windows.ts begins a sleep when that time opens and ends it when it is over; such a sleep
 * names when it ends (`wakesAt`) and the message the office sent when it began (`reminderId`). This file works out
 * when the time opens and closes, and writes and reads the rows; it starts nothing itself.
 *
 * WHO MAY DO EACH ACT is asked in src/server/lib/residents.ts, which knows who is a resident and who is asking. This
 * file reads and writes rows and imports nothing that reads a resident, so the presence reading, the waiter's door and
 * the worker's queue can all ask it without a cycle.
 */

import { sqlite } from '../db/client.ts'
import { anOfficeId } from './ids.ts'
import { NARROWED_BY_PERMISSION } from '@shared/disclosure.ts'
import { PLUGIN_READ_INTERFACE } from '@shared/plugin-read.ts'
import { momentOfStampInZone, nowStamp, stampInZone, theClockZone } from '@shared/time.ts'
import type { ParticipantRef } from '@shared/participants.ts'
import { THE_PERSON } from '@shared/person.ts'

/** How many postponed sleeps a reading lists, newest first. */
export const POSTPONEMENTS_LISTED = 5

/** One row of `resident_sleeps`, as the readers below hand it back. */
export interface ASleepRow {
  id: string
  what: 'slept' | 'postponed'
  beganAt: string
  /** When the resident woke, or null: still asleep, or a postponement, which has no end. */
  endedAt: string | null
  because: string | null
  by: ParticipantRef
  sessionId: string | null
  /** When the office ends this sleep, for one it began at the sleep time; null for a sleep begun by a press. */
  wakesAt: string | null
  /** The message the office sent when it began this sleep, or null: it began none, or it was begun by a press. */
  reminderId: string | null
}

function asARow(row: Record<string, unknown>): ASleepRow {
  return {
    id: String(row['id']),
    what: row['what'] === 'postponed' ? 'postponed' : 'slept',
    beganAt: String(row['began_at']),
    endedAt: row['ended_at'] === null ? null : String(row['ended_at']),
    because: row['because'] === null ? null : String(row['because']),
    by: { kind: String(row['by_kind']) as ParticipantRef['kind'], id: String(row['by_id']) },
    sessionId: row['session_id'] === null ? null : String(row['session_id']),
    wakesAt: row['wakes_at'] === null || row['wakes_at'] === undefined ? null : String(row['wakes_at']),
    reminderId: row['reminder_id'] === null || row['reminder_id'] === undefined ? null : String(row['reminder_id']),
  }
}

/** The open sleep of one agent, or null because it is awake. The cheap read the waiter's door and the worker's queue ask. */
export function theOpenSleepOf(agentId: string): ASleepRow | null {
  const row = sqlite
    .prepare("SELECT * FROM resident_sleeps WHERE agent_id = ? AND what = 'slept' AND ended_at IS NULL ORDER BY began_at DESC, rowid DESC LIMIT 1")
    .get(agentId) as Record<string, unknown> | undefined
  return row === undefined ? null : asARow(row)
}

/**
 * EVERY OPEN SLEEP AT ONCE, as agent id to when it began, for a reader that asks about many agents in one pass (the
 * worker's queue). One statement, so a pass over many recipients reads the sleeps once. Where one agent has more than
 * one open sleep the latest wins, as in `theOpenSleepOf`.
 */
export function everyOpenSleep(): Map<string, string> {
  const rows = sqlite
    .prepare("SELECT agent_id AS agentId, began_at AS beganAt FROM resident_sleeps WHERE what = 'slept' AND ended_at IS NULL ORDER BY began_at ASC, rowid ASC")
    .all() as { agentId: string; beganAt: string }[]
  const out = new Map<string, string>()
  for (const row of rows) out.set(row.agentId, row.beganAt)
  return out
}

/**
 * THE AGENTS ASLEEP NOW, each once with the moment its open sleep began, oldest sleep first: the body of the
 * plugin-read view of who is asleep now, which the office map's sleeping house reads (step 9). It is one statement
 * over `resident_sleeps`, through `everyOpenSleep`, so no agent row, presence or profile is read and no agent is read
 * one by one. A postponed sleep is not an open sleep, and an ended one is not either. Where an agent has more than one
 * open sleep, the latest is the one it is in, as `theOpenSleepOf` says.
 */
export function theAgentsAsleepNow(): {
  interface: typeof PLUGIN_READ_INTERFACE
  view: 'asleep'
  [NARROWED_BY_PERMISSION]: null
  agents: { id: string; since: string }[]
} {
  const agents = [...everyOpenSleep().entries()].map(([id, since]) => ({ id, since }))
  agents.sort((a, b) => a.since.localeCompare(b.since) || a.id.localeCompare(b.id))
  return { interface: PLUGIN_READ_INTERFACE, view: 'asleep', [NARROWED_BY_PERMISSION]: null, agents }
}

/**
 * THE REMINDERS OF EVERY OPEN SLEEP, by message id, in one statement: the message the office sent each resident when the
 * sleep it is in now began. The worker's queue asks it once a pass, to say what the waiting door does with that message.
 */
export function theRemindersOfOpenSleeps(): Set<string> {
  const rows = sqlite
    .prepare("SELECT reminder_id AS id FROM resident_sleeps WHERE what = 'slept' AND ended_at IS NULL AND reminder_id IS NOT NULL")
    .all() as { id: string }[]
  return new Set(rows.map((row) => row.id))
}

/**
 * WHAT THE WORKER'S QUEUE SAYS OF A MESSAGE IT HOLDS FOR A RESIDENT ASLEEP since `since`, or null when it is not asleep.
 * The reminder the office sent when the sleep began is held the same way, and the waiting door hands it to a session
 * that holds the handle, so its row says that instead. Here so the queue and its tests read the one sentence.
 */
export function heldWhileItSleeps(handle: string, since: string | null, theReminder: boolean): string | null {
  if (since === null) return null
  return theReminder
    ? `${handle} is a permanent resident asleep since ${since}. This is the reminder Mole Office sent when ` +
        'the sleep began: no run is started for it, and the waiting door hands it to a session that holds the handle.'
    : `${handle} is a permanent resident asleep since ${since}, so this message is held, unread, until it wakes. ` +
        'Only an urgent message, or the reminder the office sent when the sleep began, is handed over while it sleeps.'
}

/** What the waiting door adds to its note when it hands a resident asleep the reminder that began its sleep. */
export const THE_REMINDER_IS_HANDED_OVER_TOO = 'The reminder Mole Office sent when the sleep began is handed over too.'

// ============================================================================ a resident's own sleep time

/** A sleep time as it is kept: the time of day it begins, as HH:MM on the office's clock, and how many minutes it lasts. */
export interface ASleepTime {
  startsAt: string
  minutes: number
}

/** A sleep time as the readings show it: what is kept, the clock it is on, who set it and when, and when it next begins. */
export interface TheSleepTime extends ASleepTime {
  /** The zone the office's clock reads in, which the time is on. No person's own zone is recorded anywhere. */
  zone: string
  setAt: string
  setBy: ParticipantRef
  /** The next moment the sleep begins, after now, on the office's clock. */
  nextBeginsAt: string
}

/** The sleep time one agent's row keeps, or null because none is set. */
function theKeptSleepTime(agentId: string): (ASleepTime & { setAt: string; setBy: ParticipantRef }) | null {
  const row = sqlite
    .prepare('SELECT sleep_time_starts AS startsAt, sleep_time_minutes AS minutes, sleep_time_set_at AS setAt, sleep_time_set_by AS setBy FROM agents WHERE id = ?')
    .get(agentId) as { startsAt: string | null; minutes: number | null; setAt: string | null; setBy: string | null } | undefined
  if (row === undefined || row.startsAt === null || row.minutes === null) return null
  // WHO SET IT IS KEPT AS A KIND ONLY: the agent is this row, and the person is the one owner.
  const setBy: ParticipantRef = row.setBy === 'person' ? { kind: 'person', id: THE_PERSON } : { kind: 'agent', id: agentId }
  return { startsAt: row.startsAt, minutes: row.minutes, setAt: String(row.setAt), setBy }
}

/** The date before a `YYYY-MM-DD` date, and the one after, as keys. A date names no moment, so no zone is asked. */
function aDateBeside(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number]
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10)
}

/** When the sleep time opens on one date, as a moment, on the office's clock. */
function theStartOn(date: string, time: ASleepTime, zone: string): number {
  const start = momentOfStampInZone(`${date} ${time.startsAt}:00`, zone)
  if (start === null) throw new Error(`The sleep time ${time.startsAt} on ${date} could not be read on the clock of ${zone}.`)
  return start
}

/**
 * THE SLEEP TIME THAT HOLDS A MOMENT, as when it opened and when it closes, or null because the moment is in none. A time
 * that opened yesterday may hold the moment still, since a sleep may run past midnight.
 */
export function theSleepTimeHolding(at: number, time: ASleepTime, zone: string = theClockZone()): { start: number; end: number } | null {
  const today = stampInZone(at, zone).slice(0, 10)
  for (const date of [today, aDateBeside(today, -1)]) {
    const start = theStartOn(date, time, zone)
    const end = start + time.minutes * 60_000
    if (start <= at && at < end) return { start, end }
  }
  return null
}

/** The first moment after `at` that the sleep time opens. */
export function theNextStart(at: number, time: ASleepTime, zone: string = theClockZone()): number {
  const today = stampInZone(at, zone).slice(0, 10)
  for (const date of [today, aDateBeside(today, 1), aDateBeside(today, 2)]) {
    const start = theStartOn(date, time, zone)
    if (start > at) return start
  }
  throw new Error(`No start of the sleep time ${time.startsAt} was found in the two days after ${stampInZone(at, zone)}.`)
}

/** One agent's sleep time as the readings show it, or null because none is set. */
export function theSleepTimeOf(agentId: string, at: number = Date.now()): TheSleepTime | null {
  const kept = theKeptSleepTime(agentId)
  if (kept === null) return null
  const zone = theClockZone()
  return { startsAt: kept.startsAt, minutes: kept.minutes, zone, setAt: kept.setAt, setBy: kept.setBy, nextBeginsAt: stampInZone(theNextStart(at, kept, zone), zone) }
}

/**
 * WRITE ONE AGENT'S SLEEP TIME, the one UPDATE of these four columns. Who may set it, and whether the agent is a
 * resident that is not retired, is asked in src/server/lib/residents.ts. The time is kept as given: the door has already
 * read it as HH:MM and checked the minutes.
 */
export function writeTheSleepTime(agentId: string, time: ASleepTime, setBy: ParticipantRef['kind']): void {
  const changed = sqlite
    .prepare('UPDATE agents SET sleep_time_starts = ?, sleep_time_minutes = ?, sleep_time_set_at = ?, sleep_time_set_by = ? WHERE id = ?')
    .run(time.startsAt, time.minutes, nowStamp(), setBy, agentId)
  if (changed.changes !== 1) throw new Error(`The sleep time of agent ${agentId} was not written: no agent row has that id.`)
}

/** What one agent's sleeps say, as the profile, the resident's section and the doors' replies read it. */
export interface TheSleepReading {
  /**
   * The open sleep, or null because the agent is awake. `wakesAt` is when the office ends it, for a sleep it began at
   * the sleep time, and null for a sleep begun by a press.
   */
  asleep: { since: string; because: string | null; by: ParticipantRef; wakesAt: string | null } | null
  /** The sleep time it keeps, or null because none is set. */
  sleepTime: TheSleepTime | null
  /** When its last sleep ended, or null because no sleep has ended. */
  lastSleepEndedAt: string | null
  /** Its postponed sleeps, newest first, at most `POSTPONEMENTS_LISTED`. Nobody is sent any of them. */
  postponements: { at: string; because: string | null; by: ParticipantRef }[]
  /** How many postponed sleeps are on record in all. */
  postponedInAll: number
  /** False when no sleep and no postponed sleep has been recorded for it. */
  recorded: boolean
  /** One sentence saying all of the above. */
  says: string
}

/** The sleeps of one agent, read now. */
export function theSleepOf(agentId: string): TheSleepReading {
  const open = theOpenSleepOf(agentId)
  const ended = sqlite
    .prepare("SELECT ended_at AS at FROM resident_sleeps WHERE agent_id = ? AND what = 'slept' AND ended_at IS NOT NULL ORDER BY ended_at DESC, rowid DESC LIMIT 1")
    .get(agentId) as { at: string } | undefined
  const postponed = (
    sqlite
      .prepare(`SELECT * FROM resident_sleeps WHERE agent_id = ? AND what = 'postponed' ORDER BY began_at DESC, rowid DESC LIMIT ${String(POSTPONEMENTS_LISTED)}`)
      .all(agentId) as Record<string, unknown>[]
  ).map(asARow)
  const postponedInAll = (
    sqlite.prepare("SELECT count(*) AS n FROM resident_sleeps WHERE agent_id = ? AND what = 'postponed'").get(agentId) as { n: number }
  ).n
  const lastSleepEndedAt = ended?.at ?? null
  const recorded = open !== null || lastSleepEndedAt !== null || postponedInAll > 0
  const parts: string[] = []
  if (!recorded) parts.push('No sleep has been recorded.')
  else {
    parts.push(open === null ? 'It is awake.' : `It has been asleep since ${open.beganAt}.`)
    parts.push(lastSleepEndedAt === null ? 'No sleep of it has ended yet.' : `Its last sleep ended at ${lastSleepEndedAt}.`)
    parts.push(
      postponedInAll === 0
        ? 'It has postponed no sleep.'
        : `It postponed a sleep ${String(postponedInAll)} time${postponedInAll === 1 ? '' : 's'}, most recently at ${postponed[0]!.beganAt}. ` +
            'A postponed sleep is shown here and sent to nobody.',
    )
  }
  if (open?.wakesAt) parts.push(`The office began this sleep at its sleep time and ends it at ${open.wakesAt}.`)
  const sleepTime = theSleepTimeOf(agentId)
  parts.push(
    sleepTime === null
      ? 'No sleep time is set, so the office begins no sleep by itself.'
      : `Its sleep time begins at ${sleepTime.startsAt} and lasts ${String(sleepTime.minutes)} minutes, on the office's clock (${sleepTime.zone}); ` +
          `the next begins at ${sleepTime.nextBeginsAt}.`,
  )
  return {
    asleep: open === null ? null : { since: open.beganAt, because: open.because, by: open.by, wakesAt: open.wakesAt },
    sleepTime,
    lastSleepEndedAt,
    postponements: postponed.map((one) => ({ at: one.beganAt, because: one.because, by: one.by })),
    postponedInAll,
    recorded,
    says: parts.join(' '),
  }
}

/**
 * THE SHORT LINE THE CHAT DRAWS BESIDE A RESIDENT, "Asleep since 14:02" or "Last slept 3 h ago". Both null means no sleep
 * has ended and none is open, which the chat says as "No sleep recorded" for a resident. A non-resident has no line at
 * all, and the caller decides that, not this.
 */
export interface TheSleepLine {
  asleepSince: string | null
  lastSleptAt: string | null
  /** When the office ends the open sleep, for one it began at the sleep time; otherwise null. */
  wakesAt: string | null
  /** The sleep time it keeps, as the line says it ("sleeps at 03:00"), or null because none is set. */
  sleepTime: ASleepTime | null
}

/** The chat's line for one agent, from the same rows `theSleepOf` reads. */
export function theSleepLineOf(agentId: string): TheSleepLine {
  const kept = theKeptSleepTime(agentId)
  const sleepTime = kept === null ? null : { startsAt: kept.startsAt, minutes: kept.minutes }
  const open = theOpenSleepOf(agentId)
  if (open !== null) return { asleepSince: open.beganAt, lastSleptAt: null, wakesAt: open.wakesAt, sleepTime }
  const ended = sqlite
    .prepare("SELECT ended_at AS at FROM resident_sleeps WHERE agent_id = ? AND what = 'slept' AND ended_at IS NOT NULL ORDER BY ended_at DESC, rowid DESC LIMIT 1")
    .get(agentId) as { at: string } | undefined
  return { asleepSince: null, lastSleptAt: ended?.at ?? null, wakesAt: null, sleepTime }
}

/**
 * Write one row. The one INSERT into `resident_sleeps`. `wakesAt` and `reminderId` are given only for a sleep the office
 * begins at the sleep time, and `at` only by the clock, which writes the minute it read.
 */
export function writeASleepRow(input: {
  agentId: string
  what: 'slept' | 'postponed'
  because: string | null
  by: ParticipantRef
  sessionId: string | null
  wakesAt?: string
  reminderId?: string
  at?: string
}): ASleepRow {
  const id = anOfficeId()
  sqlite
    .prepare('INSERT INTO resident_sleeps (id, agent_id, what, began_at, because, by_kind, by_id, session_id, wakes_at, reminder_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id, input.agentId, input.what, input.at ?? nowStamp(), input.because, input.by.kind, input.by.id, input.sessionId, input.wakesAt ?? null, input.reminderId ?? null)
  return asARow(sqlite.prepare('SELECT * FROM resident_sleeps WHERE id = ?').get(id) as Record<string, unknown>)
}

/** Write when the open sleep ended. The one UPDATE of `resident_sleeps`: `ended_at`, once, on a sleep still open. */
export function endTheOpenSleep(sleepId: string, at: string = nowStamp()): ASleepRow | null {
  const changed = sqlite.prepare("UPDATE resident_sleeps SET ended_at = ? WHERE id = ? AND what = 'slept' AND ended_at IS NULL").run(at, sleepId)
  if (changed.changes !== 1) return null
  return asARow(sqlite.prepare('SELECT * FROM resident_sleeps WHERE id = ?').get(sleepId) as Record<string, unknown>)
}
