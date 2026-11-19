// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SECRETARY'S BROADCAST: A SCHEDULE OF ITS OWN, A REMINDER BEFORE EACH SLOT, AND A PAUSE.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT IS
 * ---------------------------------------------------------------------------------------
 *
 * What it is was decided on a message. The decision says:
 *
 *   Each secretary reports every day. The schedule gives each secretary its own broadcast schedule,
 *   made when the secretary card is given, with a report at 07:00, 13:00 and 18:00 each day. Mole
 *   Office sends a short reminder 30 minutes before each time. If something needs the person's
 *   decision and the person has not answered more than three times, the secretary stops sending the
 *   next one on its own. The user can change these times and the reminder count in the settings.
 *
 * So the office holds one broadcast schedule per secretary, makes it when the secretary card is
 * given, sends a short reminder before each slot, and stops the next reminder when the person has
 * not answered. The times, the lead and the number are settings in src/config/settings.mjs.
 *
 * The default times are now 07:00 and 18:00. Decision `neHefMNZkJDU` of 25 September 2026 ended the
 * fixed 13:00 report. A noon report sent only when something needs the person is an ordinary message
 * from the secretary. It is not a slot: the office sends no reminder for it, and it counts toward the
 * pause only if it names a configured slot time.
 *
 * ---------------------------------------------------------------------------------------
 * WHERE THE SCHEDULE LIVES, AND WHY NOT A NEW KIND OR TABLE
 * ---------------------------------------------------------------------------------------
 *
 * THE AGENT RECORD'S EXISTING `extra` BAG. Their design asks for "no new field on any record", and the
 * acceptance asks for no new record kind unless nothing fits. Nothing fits in a new field, because a
 * field may not be added; nothing needs a new table, because the one durable row that is already one
 * per secretary is the agent's own record. The `agent` kind declares `extra` as "anything a kind
 * needs that this kind has no field for", and `extra` is where this schedule is written:
 *
 *   data.extra.broadcastSchedule = { madeAt: "2026-09-16 19:00:00", endedAt: null }
 *
 * A SECRETARY MAY HAVE TIMES OF ITS OWN. A decision moved ai-news's report to 12:00 alone, while every
 * other secretary keeps the office's times. So the schedule may also hold
 * `times: ["12:00"]`, written only through `POST /api/participants/agent/:id/broadcast-times`. Without
 * it the secretary reads the setting MOLE_OFFICE_BROADCAST_TIMES. Every rule below (the reminder, the
 * one more reminder, the pause and the backup sentence on the day's last slot) reads the times of
 * the secretary it is about, from `theTimesOf`.
 *
 * ONE SECRETARY'S REPORTS MAY BE ENDED (wave 13y round 82). One secretary's own reports may stop while it
 * stays a secretary and every other secretary keeps its times. The same door writes
 * `times: []`, and an empty list means "no report times": that secretary is sent no reminder, no one more
 * reminder and no backup sentence, and it is never paused, because no message of its names a slot. The
 * schedule itself keeps running, so the reconciliation neither ends it nor makes another, and setting
 * times again, or null, starts the reports again through the same door.
 *
 * ONE PER SECRETARY IS A FACT OF THE RECORD, NOT A CHECK. There is one first-filed live agent record per
 * registry row (`anyRecordForAgent` in lib/elevation.ts), so a second schedule cannot be made for the same
 * secretary. The reconciliation reads who holds the secretary card from `theSecretaries` in
 * lib/secretariat.ts and never restates the card's name.
 *
 * ---------------------------------------------------------------------------------------
 * THE REMINDER IS RECOGNISED BY A MARK ON THE LINE, NOT BY A CLOCK COMPARISON
 * ---------------------------------------------------------------------------------------
 *
 * The office line that reminds a secretary carries the occurrence it is about in its existing
 * `extra` bag: `extra.broadcastSlot = "2026-09-16 18:00"`. That is what makes the reminder go ONCE
 * PER SLOT and never again: the question "has this slot been reminded?" is asked of the line's own
 * mark, so the reminder is not repeated when the watcher ticks again inside the same window, and a
 * second day's 18:00 is a different occurrence and gets its own reminder. No new field is added: the
 * mark goes in the `extra` bag every kind already declares for exactly this.
 *
 * ---------------------------------------------------------------------------------------
 * THE PAUSE IS A QUERY, NEVER A STORED COUNTER
 * ---------------------------------------------------------------------------------------
 *
 * The last N broadcasts are read from the messages themselves, and the person's answers are read
 * from the messages sent to the secretary (and from decisions, which are the person's own act). No
 * count is stored, so a message deleted or restored cannot leave a counter disagreeing with the
 * conversation. A broadcast is recognised the way the acceptance says: a message from the secretary
 * to the person whose body names one of the configured slot times. Its own `createdAt` is its time.
 *
 * The office cannot read prose, so it counts every recognised broadcast as one that asks the person
 * for a decision. That is the default reading of B5, which the acceptance says they may change: a
 * broadcast carries what needs a decision by design, and nothing in the office distinguishes an
 * empty section from a full one without a field the design forbids.
 */

import { and, eq, isNull, sql } from 'drizzle-orm'
import { db, sqlite } from '../db/client.ts'
import { keptStatement } from '../db/kept-statement.ts'
import { records, messageDelivery, ONE_KIND_WRITTEN_OUT, STORED_FIELDS, theWordsOfAStoredField } from '../db/schema.ts'
import { localStamp, nowStamp } from '@shared/time.ts'
import { moleOffice, type ParticipantRef } from '@shared/participants.ts'
import { THE_PERSON } from '@shared/person.ts'
import { SYSTEM_LINES } from '@shared/groups.ts'
import { broadcastLines, type BroadcastReading, type BroadcastTimesUnreadable } from '@shared/broadcast.ts'
import { readStoredWord } from '@shared/i18n.ts'
import { leadOfRecord } from '@shared/messages.ts'

/** Re-exported so a caller that builds the reading imports its shape from the module that builds it. */
export type { BroadcastReading }
import { anyRecordForAgent } from '../db/any-record-for-agent.ts'
import { gateMet } from './gate-counts.ts'
import { writeASystemLineToOne } from './groups.ts'
import { theSecretaries } from './secretariat.ts'
import { theRoleCardsAreRead } from './roles.ts'
import { BROADCAST_SETTINGS_CHANGES_KEY, BROADCAST_TIMES_CHANGE_KEY, createRecord, getRecord, patchRecord, throughTheBroadcastScheduleWrite, throughTheBroadcastTimesDoor, type Actor } from './records.ts'
import { PanelError } from './panel-error.ts'
import {
  broadcastBackupReminder,
  broadcastLeadMinutes,
  broadcastReportLateMinutes,
  broadcastReportTemplate,
  broadcastTimes,
  broadcastUnansweredLimit,
  isATimeOfDay,
  theOfficesBroadcastTimes,
  timesInOrder,
} from './env.ts'
import { theOpenItemsSentenceFor } from './checklists.ts'
import { theRowsToReadAgain, type AChangedRow } from './session-fields.ts'
import { thePushHandBacksNobodyWasToldOf } from './emergency-push.ts'

/** The office writes these lines in its own name, and never in an agent's. */
function theOffice(): Actor { return { type: 'system', id: moleOffice().id } }
/** The key the schedule is held under inside the agent record's existing `extra` bag. */
export const BROADCAST_SCHEDULE_KEY = 'broadcastSchedule'

/** The key on a reminder line naming the slot occurrence it is about. */
export const BROADCAST_SLOT_MARK = 'broadcastSlot'

/** The key on the once-per-pause line the secretary is told. */
export const BROADCAST_PAUSE_MARK = 'broadcastPause'

/** The key on the one more reminder, naming the slot occurrence whose report has not come. */
export const BROADCAST_NO_REPORT_MARK = 'broadcastNoReport'

/**
 * The key on a message saying one slot occurrence has nothing to report, naming the occurrence.
 */
export const BROADCAST_SKIP_MARK = 'broadcastSkip'

/**
 * THE THREE SETTINGS A SECRETARY SETS FOR ITSELF BESIDE ITS TIMES, in the order a reply names them. Each is held on its
 * schedule, is changed only through POST /api/participants/agent/:id/broadcast-settings, and when absent reads the
 * office's: on, the setting MOLE_OFFICE_BROADCAST_LEAD_MINUTES, and the reminder's check and tidy.
 */
export const THE_BROADCAST_SETTINGS = ['on', 'leadMinutes', 'reminderWords'] as const
export type ABroadcastSetting = (typeof THE_BROADCAST_SETTINGS)[number]

/** The fewest and the most minutes a secretary's own lead may be. */
export const AN_OWN_LEAD = { fewest: 1, most: 720 } as const

/** The most characters a secretary's own reminder words may hold. */
export const THE_MOST_REMINDER_CHARACTERS = 2_000

/** Each of a secretary's own settings that is stored but cannot be read, with the sentence saying what is wrong. */
type TheSettingsUnreadable = Partial<Record<ABroadcastSetting, string>>

/** One secretary's standing broadcast schedule, read off its agent record's `extra` bag. */
export interface BroadcastSchedule {
  /** When the office made the schedule. */
  madeAt: string
  /** When it ended because the secretary retired or lost the card, or null while it runs. */
  endedAt: string | null
  /**
   * This secretary's own times of day, `HH:MM` earliest first, or [] because its reports were ended, or absent because
   * it reads the office's setting.
   */
  times?: string[]
  /** False because this secretary's broadcasts were turned off, or absent, which is on. Off keeps the times. */
  on?: boolean
  /** The minutes before each time its reminder goes, or absent because it reads MOLE_OFFICE_BROADCAST_LEAD_MINUTES. */
  leadMinutes?: number
  /** Its own words in place of the reminder's check and tidy, or absent because it reads the office's words. */
  reminderWords?: string
}

/** One slot occurrence: the time of day, and the moment it falls at. */
export interface BroadcastSlotOccurrence {
  /** `HH:MM`, the way the settings declare it. */
  slot: string
  /** The moment the slot falls at, in the operator's own zone. */
  at: Date
}

/** One recognised broadcast, as the messages hold it. */
export interface RecognisedBroadcast {
  /** The message record's id. */
  id: string
  /** When the secretary filed it. */
  at: string
  /** The slot time its body names. */
  slot: string
}

// ============================================================================ the schedule on the record

/**
 * The first-filed live agent record for one registry row, in any project, or null. The one reading of it is
 * `anyRecordForAgent`, which the elevation press writes through, so the schedule and the grant are
 * read off the same record. It used to be a copy here that also read a record whose kind had been
 * changed away from `agent`, which no agent guard protects. Wave 13p round 27c.
 */
const theAgentRecordOf = anyRecordForAgent

/** The schedule held in one record's `data`, or null because nobody recorded one. */
function scheduleIn(data: unknown): BroadcastSchedule | null {
  const read = theScheduleReadIn(data)
  if (read === null) return null
  if (read.unreadable !== null) throw new Error(read.unreadable)
  return read.schedule
}

/**
 * The schedule held in one record's `data` as the reminders read it, or null because nobody recorded one.
 *
 * TIMES THAT CANNOT BE READ ARE SAID, NOT GUESSED PAST. `unreadable` is the sentence saying what is held,
 * and `schedule` then holds no times, so a caller that goes on reads the office's times and must say so.
 */
function theScheduleReadIn(
  data: unknown,
): { schedule: BroadcastSchedule; unreadable: string | null; settingsUnreadable: TheSettingsUnreadable } | null {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) return null
  const extra = (data as Record<string, unknown>)['extra']
  if (extra === null || typeof extra !== 'object' || Array.isArray(extra)) return null
  const held = (extra as Record<string, unknown>)[BROADCAST_SCHEDULE_KEY]
  if (held === null || typeof held !== 'object' || Array.isArray(held)) return null
  const madeAt = (held as Record<string, unknown>)['madeAt']
  if (typeof madeAt !== 'string' || madeAt === '') return null
  const endedAt = (held as Record<string, unknown>)['endedAt']
  const schedule: BroadcastSchedule = { madeAt, endedAt: typeof endedAt === 'string' && endedAt !== '' ? endedAt : null }
  // A SETTING OF ITS OWN THAT CANNOT BE READ IS LEFT OFF, so that one setting reads the office's, and it is said: the
  // door writes only good ones, so anything else was written past it. It is never changed here, so a write that carries
  // the schedule back leaves what is stored as it was.
  const settingsUnreadable: TheSettingsUnreadable = {}
  for (const name of THE_BROADCAST_SETTINGS) {
    const value = (held as Record<string, unknown>)[name]
    if (value === undefined || value === null) continue
    const wrong = whatIsWrongWithTheSetting(name, value)
    if (wrong === null) Object.assign(schedule, { [name]: value })
    else settingsUnreadable[name] = wrong
  }
  const times = (held as Record<string, unknown>)['times']
  if (times === undefined || times === null) return { schedule, unreadable: null, settingsUnreadable }
  // TIMES THAT ARE NOT A LIST OF HH:MM ARE A BROKEN ASSUMPTION, not "no times": the door writes only
  // good ones, so anything else was written past it, and reading the office's times instead without
  // a word would remind a secretary at hours nobody chose for it. An empty list is good: it says the
  // secretary's reports were ended.
  if (!Array.isArray(times) || !times.every((one) => typeof one === 'string' && isATimeOfDay(one))) {
    return {
      schedule,
      unreadable:
        `The broadcast schedule holds times ${JSON.stringify(times)}, which is not a list of times of day as HH:MM. ` +
        'Set them again with POST /api/participants/agent/:id/broadcast-times.',
      settingsUnreadable,
    }
  }
  return { schedule: { ...schedule, times: timesInOrder(times as string[]) }, unreadable: null, settingsUnreadable }
}

/** THE SCHEDULE OF ONE SECRETARY, or null because the office holds none. */
export function theBroadcastScheduleOf(agentId: string): BroadcastSchedule | null {
  const found = theAgentRecordOf(agentId)
  if (found === null) return null
  const record = getRecord(found.record)
  return record === null ? null : scheduleIn(record.data)
}

/**
 * ONE SECRETARY'S SCHEDULE AS THE REMINDERS READ IT, or null because the office holds none. Stored times
 * that cannot be read leave the schedule without times, and `unreadable` says why.
 */
function theScheduleTheRemindersRead(agentId: string): ReturnType<typeof theScheduleReadIn> {
  const found = theAgentRecordOf(agentId)
  if (found === null) return null
  const record = getRecord(found.record)
  return record === null ? null : theScheduleReadIn(record.data)
}

/** One secretary's times as the reminders, the pause and the page read them, and where they could not be read. */
interface TheTimesRead {
  /** The schedule held, or null because the office holds none. Stored times that cannot be read are left off it. */
  schedule: BroadcastSchedule | null
  /** The times in use: the schedule's own, else the office's setting, else the built-in times. */
  times: string[]
  /** Where the times could not be read, in words, empty when they were. */
  unreadable: BroadcastTimesUnreadable[]
  /** Each of its own other settings that could not be read, in words, empty when they were. The office's is used for it. */
  settingsUnreadable: TheSettingsUnreadable
}

/**
 * ONE SECRETARY'S TIMES, AND WHERE THEY COULD NOT BE READ. The one reading the reminders, the pause and the
 * page share, so the three cannot come to use different times.
 *
 * A WRONG TIME IS SAID, NEVER THROWN. Stored times that cannot be read, or a MOLE_OFFICE_BROADCAST_TIMES line
 * that cannot be read, used to throw out of the agent page's reading, so the whole page said the agent was
 * not found. Now the office's own times are used and `unreadable` says which road was wrong and what was
 * wrong with it. A secretary with good times of its own is not told about the setting, which it does not
 * read. Wave 13p round 29.
 */
function theTimesReadFor(agentId: string): TheTimesRead {
  const read = theScheduleTheRemindersRead(agentId)
  const own = read?.schedule.times
  const settingsUnreadable = read === null ? {} : read.settingsUnreadable
  if (read !== null && own !== undefined) return { schedule: read.schedule, times: own, unreadable: [], settingsUnreadable }
  const office = theOfficesBroadcastTimes()
  const unreadable: BroadcastTimesUnreadable[] = []
  if (read !== null && read.unreadable !== null) {
    unreadable.push({ road: 'stored-schedule', says: `${read.unreadable} The office's times ${office.times.join(', ')} are used meanwhile.` })
  }
  if (office.unreadable !== null) unreadable.push({ road: 'env-line', says: office.unreadable })
  return { schedule: read === null ? null : read.schedule, times: office.times, unreadable, settingsUnreadable }
}

/**
 * THE TIMES ONE SECRETARY BROADCASTS AT: its own when its schedule holds some, else the office's setting.
 * Times that cannot be read are the office's here too, and the reminder pass and the page say so.
 */
export function theTimesOf(agentId: string): string[] {
  return theTimesReadFor(agentId).times
}

/** Whether the office holds a broadcast schedule for this agent, live or ended. It never throws on times it cannot read. */
export function theBroadcastScheduleIsHeldFor(agentId: string): boolean {
  return theScheduleTheRemindersRead(agentId) !== null
}

/** Write a schedule into one agent record's existing `extra` bag, keeping every other key. */
function writeTheSchedule(
  recordId: string,
  data: unknown,
  schedule: BroadcastSchedule,
  actor: Actor = theOffice(),
  more: Record<string, unknown> = {},
): { nothingWritten?: boolean } {
  const held = data !== null && typeof data === 'object' && !Array.isArray(data) ? (data as Record<string, unknown>) : {}
  const extra = held['extra'] !== null && typeof held['extra'] === 'object' && !Array.isArray(held['extra'])
    ? (held['extra'] as Record<string, unknown>)
    : {}
  const written = throughTheBroadcastScheduleWrite(() =>
    patchRecord(recordId, { dataPatch: { extra: { ...extra, ...more, [BROADCAST_SCHEDULE_KEY]: schedule } } }, actor),
  )
  return written.nothingWritten === undefined ? {} : { nothingWritten: true }
}

/** Who changed a secretary's times, how they were allowed to, and the times before and after. */
export interface TheBroadcastTimesChange {
  by: { type: Actor['type']; id: string }
  how: string
  at: string
  because: string
  before: string[] | null
  after: string[] | null
}

/**
 * SET ONE SECRETARY'S OWN TIMES, or with null hand it back to the office's setting.
 *
 * The caller (`changeBroadcastTimes` in lib/participants.ts) has already decided who may. This
 * refuses, in words, a time that is not HH:MM and an agent the office holds no schedule for, because
 * times on no schedule would remind nobody and say nothing about it. An empty list ends the
 * secretary's reports, which is the header's "one secretary's reports may be ended".
 */
export function writeTheBroadcastTimes(
  agentId: string,
  times: readonly string[] | null,
  change: Omit<TheBroadcastTimesChange, 'before' | 'after'>,
  actor: Actor,
): { schedule: BroadcastSchedule; change: TheBroadcastTimesChange; nothingWritten?: boolean } {
  if (times !== null) {
    const bad = times.filter((one) => !isATimeOfDay(one))
    if (bad.length > 0) {
      throw new PanelError(
        `${bad.map((one) => JSON.stringify(one)).join(', ')} ${bad.length === 1 ? 'is not a time of day' : 'are not times of day'}. ` +
          'Write each time as HH:MM in 24-hour local time, for example 07:00 or 18:30. Nothing was written.',
        400,
      )
    }
  }
  const found = theAgentRecordOf(agentId)
  const record = found === null ? null : getRecord(found.record)
  const held = record === null ? null : scheduleIn(record.data)
  if (found === null || record === null || held === null || held.endedAt !== null) {
    throw new PanelError(
      'The office holds no running broadcast schedule for this agent, so it has no times to change. A schedule is ' +
        'made when the agent is given the secretary card. Nothing was written.',
      409,
    )
  }
  const { times: before, ...rest } = held
  const after = times === null ? null : timesInOrder(times)
  const schedule: BroadcastSchedule = after === null ? rest : { ...rest, times: after }
  const stamped: TheBroadcastTimesChange = { ...change, before: before ?? null, after }
  // A DATA PATCH MERGES INTO WHAT IS HELD, so leaving `times` out would keep the old ones: null takes them away.
  const written = throughTheBroadcastTimesDoor(() =>
    writeTheSchedule(found.record, record.data, { ...rest, times: after } as BroadcastSchedule, actor, { [BROADCAST_TIMES_CHANGE_KEY]: stamped }),
  )
  return { schedule, change: stamped, ...written }
}

/** What one reconciliation did, for a caller that reports it. */
export interface TheBroadcastsAfterASync {
  /** Agent ids given a schedule by this call, in registry order. */
  added: string[]
  /** Agent ids whose schedule this call ended, in registry order. */
  ended: string[]
}

/**
 * MAKE A SCHEDULE FOR EVERY SECRETARY THAT LACKS ONE, AND END THE ONES WHOSE SECRETARY IS GONE.
 *
 * Idempotent: calling it again with nothing changed writes nothing. THE DECLARATION BEING UNREAD IS
 * NOT "NO SECRETARIES": when the role cards have not been read the card's name is unknown, so this
 * writes nothing at all rather than ending every schedule on an unread file — the rule
 * `syncTheSecretariatGroup` states for the same reason.
 */
export function syncTheBroadcastSchedules(at: string = nowStamp()): TheBroadcastsAfterASync {
  return reconcileTheBroadcastSchedules(at, true)
}

/**
 * END THE SCHEDULES WHOSE SECRETARY IS GONE, AND MAKE NOTHING.
 *
 * A door that only removes somebody — a retirement, an agent's record removed — calls this. It does
 * not make a schedule, because their rule makes that at a server start or at the card door, and a
 * retirement that quietly made one for somebody else would be a second maker.
 */
export function bringTheBroadcastSchedulesInStep(at: string = nowStamp()): TheBroadcastsAfterASync {
  return reconcileTheBroadcastSchedules(at, false)
}

/**
 * THE AGENTS A RECONCILIATION CAN CHANGE, in id order: the secretaries, and every agent with an agent record whose stored
 * data names the schedule's key, holds an escape that could spell it, or is not JSON. For any other agent the loop below
 * reads no schedule, writes nothing and throws nothing, because the record it reads holds no schedule. The loop read
 * every agent's record, one statement for each. On the made-up office at the 22 October scale, where 1,460 agents are
 * registered, a worker's registration took 430 ms and 3,065 statements, and takes 100 ms and 154 this way (wave 13y
 * round 107).
 */
const theAgentsAReconciliationCanChange = keptStatement(() => sqlite.prepare(
  'SELECT id FROM agents WHERE id IN (SELECT value FROM json_each(?)) OR id IN (' +
    'SELECT m.agent_id FROM agent_records m JOIN records r ON r.id = m.record_id ' +
    "WHERE r.kind = 'agent' AND (instr(r.data, ?) > 0 OR instr(r.data, ?) > 0 OR NOT json_valid(r.data))" +
    ') ORDER BY id',
))

function reconcileTheBroadcastSchedules(at: string, createIfMissing: boolean): TheBroadcastsAfterASync {
  const out: TheBroadcastsAfterASync = { added: [], ended: [] }
  if (!theRoleCardsAreRead()) return out
  const wanted = new Set(theSecretaries().map((who) => who.id))
  const rows = theAgentsAReconciliationCanChange().all(JSON.stringify([...wanted]), BROADCAST_SCHEDULE_KEY, '\\u') as { id: string }[]
  for (const row of rows) {
    const found = theAgentRecordOf(row.id)
    if (found === null) continue
    const record = getRecord(found.record)
    if (record === null) continue
    const held = scheduleIn(record.data)
    const isSecretary = wanted.has(row.id)
    if (held === null) {
      if (isSecretary && createIfMissing) {
        writeTheSchedule(found.record, record.data, { madeAt: at, endedAt: null })
        out.added.push(row.id)
      }
      continue
    }
    if (!isSecretary && held.endedAt === null) {
      writeTheSchedule(found.record, record.data, { ...held, endedAt: at })
      out.ended.push(row.id)
    }
  }
  return out
}

// ============================================================================ the slots

/** One declared slot's moment on the local day of `day`. */
function theSlotOn(day: Date, slot: string): Date {
  const [hours, minutes] = slot.split(':').map((one) => Number(one))
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), hours ?? 0, minutes ?? 0, 0, 0)
}

/** The latest of the declared slots: the one whose reminder also says to check the backups. */
export function theLastSlotOfTheDay(times: readonly string[] = broadcastTimes()): string {
  // HH:MM sorts as text in the order of the day, and `broadcastTimes` and `scheduleIn` refuse anything else. The
  // reminder pass, its one caller with a secretary's own times, asks only for a slot that is due, and no slot of an
  // empty list is.
  return [...times].sort().at(-1) as string
}

/**
 * The slot whose reminder window contains `now`, or null because no slot is due a reminder. `leadMinutes` is the
 * secretary's own lead when it set one; the reminder pass passes it.
 */
export function theReminderDueAt(
  now: Date,
  times: readonly string[] = broadcastTimes(),
  leadMinutes: number = broadcastLeadMinutes(),
): BroadcastSlotOccurrence | null {
  const lead = leadMinutes * 60_000
  const at = now.getTime()
  for (const slot of times) {
    const falls = theSlotOn(now, slot)
    if (at >= falls.getTime() - lead && at < falls.getTime()) return { slot, at: falls }
  }
  return null
}

/** The next slot after `now`, today or tomorrow. The times must hold one or more: a caller reads an empty list first. */
export function theNextSlotAfter(now: Date, times: readonly string[] = broadcastTimes()): BroadcastSlotOccurrence {
  const at = now.getTime()
  let best: BroadcastSlotOccurrence | null = null
  for (const days of [0, 1]) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days)
    for (const slot of times) {
      const falls = theSlotOn(day, slot)
      if (falls.getTime() <= at) continue
      if (best === null || falls.getTime() < best.at.getTime()) best = { slot, at: falls }
    }
  }
  // A day always has a next slot, because `broadcastTimes` refuses an empty list, and the one caller with a
  // secretary's own times, `theBroadcastReadingFor`, does not ask when they are empty.
  return best as BroadcastSlotOccurrence
}

/** The slot whose one-more-reminder window contains `now`, or null because none does. */
export function theReportReminderDueAt(
  now: Date,
  times: readonly string[] = broadcastTimes(),
  leadMinutes: number = broadcastLeadMinutes(),
): BroadcastSlotOccurrence | null {
  // THE WINDOW STARTS AT THE SLOT PLUS THE LATE MINUTES (07:15 for 07:00) AND IS AS WIDE AS THE
  // LEAD, the width of the window before the slot, so a tick once a minute falls inside it. It is the
  // secretary's own lead when it set one, as the window before the slot is.
  // Yesterday's slots are read too, so a window that runs past midnight is still found.
  const late = broadcastReportLateMinutes() * 60_000
  const width = leadMinutes * 60_000
  const at = now.getTime()
  for (const days of [-1, 0]) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days)
    for (const slot of times) {
      const falls = theSlotOn(day, slot)
      const from = falls.getTime() + late
      if (at >= from && at < from + width) return { slot, at: falls }
    }
  }
  return null
}

// ============================================================================ the report template

/** The report template as one tick reads it: none set, set and held, or set and not held. */
export type TheReportTemplate =
  | { set: false }
  | { set: true; held: true; id: string; workspaceId: string }
  | { set: true; held: false; id: string }

/** THE TEMPLATE MOLE_OFFICE_BROADCAST_REPORT_TEMPLATE NAMES, and whether this office holds it. */
export function theReportTemplate(): TheReportTemplate {
  const id = broadcastReportTemplate()
  if (id === null) return { set: false }
  const record = getRecord(id)
  if (record === null || record.deletedAt !== null) return { set: true, held: false, id }
  return { set: true, held: true, id: record.id, workspaceId: record.workspaceId }
}

/** The broadcast times as a Chinese list: "07:00", "07:00 和 18:00", "07:00、13:00 和 18:00". */
function theTimesInChinese(times: readonly string[]): string {
  if (times.length === 1) return times[0] as string
  return `${times.slice(0, -1).join('、')} 和 ${times.at(-1) as string}`
}

/** How the office recognises a report for one slot occurrence, in the reminders' language. */
function howAReportIsRecognised(occurrence: string): string {
  return (
    `办公室认这句话的方法是：它由你发出，带着这一时段的标记 extra.broadcastSlot = "${occurrence}"，` +
    '它的按钮（lead）打开一份报告（report）。'
  )
}

/**
 * THE CHECK EVERY REMINDER BEFORE A SLOT ASKS FOR: what is blocked by the owner or waits on the person's decision, each with an
 * item on the secretary's own checklist. One decision sets how another is carried
 * out. Point 1 of the message it came in says the reminder before a secretary's
 * report adds a check for what the owner blocked and what needs a decision. The nudge
 * itself is the flow The decision reminder, run on the checklist's own item reminder, so no code here
 * sends a nudge.
 */
export const THE_OWNER_CHECK =
  '再查一遍：有哪些工作被 owner 卡住，有哪些事在等他决定。每一件都要在你自己的清单（checklist）里有一项，' +
  '状态是 waiting on the owner，并且开着提醒；怎么做见流程 The decision reminder。'

/**
 * THE SENTENCE THAT FOLLOWS THE CHECK: tidy the secretary's own checklist (point 4). It came after a checklist
 * that copied every block of its pipelines grew to 45 open items. The checklist keeps
 * three kinds of item; everything else is a block in a pipeline. It is in Chinese because it goes with the check.
 */
export const THE_CHECKLIST_TIDY =
  '再整理一下你自己的清单，只留三种项：常设项（standing）、你负责的每个流程（pipeline）各一项（写明它的下一步）、' +
  '一天内能做完又不等任何事的项；要等别的工作、要按顺序做或一时做不完的，都改成流程里的一个步骤（block），' +
  '写明它在等什么；不属于任何设计的杂事放进一个待办流程（backlog）；移走的项标成 superseded 并链接到它的步骤，' +
  '这样写过的东西不会丢。'

/**
 * THE THIRD SENTENCE: the office's default reminder also asks the secretary to tidy the owner's own
 * checklist. The secretaries set it, and a department made later starts with it. A secretary's own
 * words replace all three sentences.
 */
export const THE_OWNERS_CHECKLIST_TIDY =
  '再整理一下 owner 的清单（checklist）：他已经做完的项，按他的原话标 done（onThePersonsWords）或请他勾掉；被后来的消息取代的项标 superseded 并链接那条消息；新的、要他看或要他定的东西挂上去；每项标题写短，一句话概括，不写成小作文；改完给他发一句，说明改了哪几项。'

/** The office's own words for the check, the tidy and the owner's checklist, in that order: what a secretary's own reminder words replace. */
export const THE_OFFICES_REMINDER_WORDS = `${THE_OWNER_CHECK} ${THE_CHECKLIST_TIDY} ${THE_OWNERS_CHECKLIST_TIDY}`

/**
 * WHAT THE REMINDER BEFORE A SLOT SAYS BEHIND ITS FEW WORDS. It carries `THE_OFFICES_REMINDER_WORDS`,
 * or the secretary's own words in their place.
 *
 * With a template held: the requirement and how the office recognises the chat line. With a template set but not
 * held: one sentence saying so. Then the check and the tidy, and on the day's last slot the backup sentence after them.
 * A SECRETARY'S OWN WORDS REPLACE THE CHECK AND THE TIDY AND NOTHING ELSE: every sentence of fact stays.
 */
function whatTheReminderSays(
  template: TheReportTemplate,
  occurrence: string,
  isTheLastSlot: boolean,
  times: readonly string[],
  ownWords: string | null,
): string {
  const parts: string[] = []
  if (template.set && template.held) {
    parts.push(
      `每天 ${theTimesInChinese(times)}，按这份模板写一份报告，再在聊天里发一句话，带一个打开这份报告的按钮。` +
        howAReportIsRecognised(occurrence),
    )
  }
  if (template.set && !template.held) {
    parts.push(
      `MOLE_OFFICE_BROADCAST_REPORT_TEMPLATE 写的是 ${template.id}，但办公室里没有这条记录，所以这次提醒没有带模板，` +
        '也不会因为没收到报告再提醒你。',
    )
  }
  parts.push(ownWords ?? THE_OFFICES_REMINDER_WORDS)
  const backup = isTheLastSlot ? broadcastBackupReminder() : null
  if (backup !== null) parts.push(backup)
  return parts.join(' ')
}

/** The reminder's words with one sentence before them when the secretary's own times could not be read. */
function withTheOfficesTimesSaid(says: string | null, ownTimesUnreadable: boolean, agentId: string, times: readonly string[]): string | null {
  if (!ownTimesUnreadable) return says
  const said =
    `你自己的播报时间存得不对，办公室读不出来，所以这次按办公室的时间 ${theTimesInChinese(times)} 提醒你。` +
    `请用 POST /api/participants/agent/${agentId}/broadcast-times 重新设置。`
  return says === null ? said : `${said} ${says}`
}

/** The reminder's words with one sentence before them when one of the secretary's own settings could not be read. */
function withItsOwnSettingsSaid(says: string | null, unreadable: TheSettingsUnreadable, agentId: string): string | null {
  const wrong = Object.values(unreadable)
  if (wrong.length === 0) return says
  const said =
    `你自己的播报设置有存得不对的，办公室读不出来，所以这一项按办公室的默认值提醒你：${wrong.join(' ')} ` +
    `请用 POST /api/participants/agent/${agentId}/broadcast-settings 重新设置。`
  return says === null ? said : `${said} ${says}`
}

/**
 * THE REMINDER'S WORDS WITH THE SECRETARY'S OPEN CHECKLIST ITEMS AFTER THEM, in one line, when it has
 * any, at point 4 of a decision. The sentence is `theOpenItemsSentence` in
 * shared/checklists.ts, the one the brief and the idle reminder print. English until the translation round.
 */
function withTheOpenItemsSaid(says: string | null, agentId: string): string | null {
  const open = theOpenItemsSentenceFor({ kind: 'agent', id: agentId })
  if (open === null) return says
  return says === null ? open : `${says} ${open}`
}

/** The lead a reminder carries to the template, or undefined when no template is held. */
function theLeadToTheTemplate(template: TheReportTemplate): unknown {
  if (!template.set || !template.held) return undefined
  return { target: { kind: 'record', recordId: template.id, workspaceId: template.workspaceId } }
}

/**
 * THE REPORT FOR ONE SLOT: the id of the chat line that is it, or null because none has come.
 *
 * THE ONE READING OF "A REPORT FOR THE SLOT", used by the one more reminder. A report for the slot
 * is a message, not deleted, that this secretary sent, that carries `extra.broadcastSlot` equal to
 * the slot occurrence (`YYYY-MM-DD HH:MM`, so it is that day's slot), and whose lead opens a report
 * record that is not deleted. That is what a secretary must do:
 * a report written as an office report, and one chat line with a button that opens it. The slot
 * mark is the one the first reminder names and the kit's `send-message.py --slot` writes.
 *
 * Readings not taken: a report record the secretary wrote since the slot (it says nothing about the
 * chat line, and nothing on a report ties it to a slot); a message whose body names the slot time
 * (the pause rule counts broadcasts that way, but a body that mentions "07:00" for another reason
 * would count); a message with the slot mark and no lead to a report (it does not show a report
 * exists).
 */
export function theReportForTheSlot(agentId: string, occurrence: string): string | null {
  const rows = db
    .select({ id: records.id, data: records.data })
    .from(records)
    .where(
      and(
        // FOUND THROUGH THE INDEX ON THE SLOT MARK (migration 0228), so only the lines marked for this slot are read.
        ONE_KIND_WRITTEN_OUT.message,
        eq(STORED_FIELDS.messageBroadcastSlot(records.data), occurrence),
        isNull(records.deletedAt),
        sql`json_extract(${records.data}, '$.sentBy.kind') = 'agent'`,
        sql`json_extract(${records.data}, '$.sentBy.id') = ${agentId}`,
      ),
    )
    .orderBy(sql`${records.createdAt} ASC`)
    .all()
  for (const row of rows) {
    const data = row.data !== null && typeof row.data === 'object' ? (row.data as Record<string, unknown>) : {}
    const lead = leadOfRecord({ kind: 'message', data })
    const target = lead === null ? null : (lead as Record<string, unknown>)['target']
    const recordId =
      target !== null && typeof target === 'object' && !Array.isArray(target)
        ? (target as Record<string, unknown>)['recordId']
        : undefined
    if (typeof recordId !== 'string') continue
    const opened = getRecord(recordId)
    if (opened !== null && opened.kind === 'report' && opened.deletedAt === null) return row.id
  }
  return null
}

// ============================================================================ the broadcasts and answers

/** The slot time one message body names, or null because it names none. */
function theSlotNamedIn(body: string, times: readonly string[]): string | null {
  for (const slot of times) {
    if (body.includes(slot)) return slot
  }
  return null
}

/** Every message from one secretary to the person that names one of its slot times, oldest first. */
function theBroadcastsOf(agentId: string, mine: TheSecretarysMessages): RecognisedBroadcast[] {
  const times = theTimesOf(agentId)
  const out: RecognisedBroadcast[] = []
  // OLDEST FIRST, and within one second in the order the index on the sender holds them, by project and then as written,
  // which is the order the reading through that index gave before wave 13q.
  const kept = [...mine.broadcasts].sort(([, one], [, other]) =>
    one.at !== other.at ? (one.at < other.at ? -1 : 1) : one.workspaceId !== other.workspaceId ? (one.workspaceId < other.workspaceId ? -1 : 1) : one.position - other.position,
  )
  for (const [id, one] of kept) {
    // A LINE SAYING A SLOT HAS NOTHING TO REPORT IS NOT A BROADCAST, though it names the slot's time: a quiet
    // day is not one more broadcast the person left unanswered.
    if (one.skipped) continue
    const slot = theSlotNamedIn(one.body, times)
    if (slot === null) continue
    out.push({ id, at: one.at, slot })
  }
  return out
}

/**
 * THE NEWEST TIME THE PERSON ANSWERED ONE SECRETARY, as a local stamp, or null because the person never has.
 *
 * A message from the person to the secretary, and a decision — which is the person's own act and
 * the second half of B5's "any answer from the person to the secretary". A decision is counted
 * whoever it is about, because a decision is the person speaking and nothing ties one to a
 * particular unfinished broadcast. The pause rule asks only whether an answer came at or after a
 * broadcast, so the newest answer is all it needs.
 */
function theNewestAnswerTo(mine: TheSecretarysMessages): string | null {
  let newest = (theStatementsOfThePause().theNewestDecision.get() as { at: string | null }).at
  for (const at of mine.answers.values()) if (newest === null || at > newest) newest = at
  return newest
}

// ============================================================================ the broadcasts and answers, kept

/**
 * EACH SECRETARY'S MESSAGES TO THE PERSON AND THE PERSON'S ANSWERS TO IT, KEPT BETWEEN READINGS AND READ AGAIN ONLY WHERE
 * A RECORD CHANGED.
 *
 * MEASURED, 22 October 2026, on an office of that day's shape (tests/the-two-timers-at-the-live-shape.test.ts): reading
 * the pause rule whole for the seven secretaries was about 100 ms of every minute's pass, 81 ms of it the answers. One
 * secretary there has 17,079 delivery rows, and each was joined to its message every minute.
 *
 * WHAT IS KEPT, for each secretary the rule has been asked about: its messages to the person that are not deleted, each
 * with its time, its body and whether it carries a skip mark; and the times of the person's messages to it that are not
 * deleted and carry no skip mark. The first reading for a secretary reads them all. Every later reading looks at the
 * records changed since a day before the last reading began, of any kind, so a message that became another kind leaves.
 * It reads those again by the same conditions, and each one's present state replaces what was kept. Which rows are read
 * again, and why that misses no write, is said in lib/session-fields.ts (`theRowsToReadAgain`). A message's delivery
 * rows are written only inside the record write that creates or patches it (`keepTheDeliveryRowsInStep`), and that write
 * sets the record's `updated_at`. A later change to a delivery row changes only its marks, which the rule does not read.
 *
 * Decisions are not kept: the newest is one read by the kind's index, about a thousand rows.
 */
/** One of a secretary's messages to the person, as kept. The project and the row's place order a tie in time. */
interface ABroadcastKept {
  at: string
  /** The body when it is text, or the empty string. */
  body: string
  /** It carries a skip mark. */
  skipped: boolean
  workspaceId: string
  position: number
}

interface TheSecretarysMessages {
  /** Its messages to the person that are not deleted, by id. */
  broadcasts: Map<string, ABroadcastKept>
  /** The person's messages to it that are not deleted and carry no skip mark, by id, each as its `createdAt`. */
  answers: Map<string, string>
}

interface TheMessagesKept {
  bySecretary: Map<string, TheSecretarysMessages>
  /** The updated_at each record read again had when it was read, for the records changed in the last range. */
  readAt: Map<string, string>
  /** The local stamp taken just before the last reading began. */
  lastReading: string
}

/** ONE READING PER DATABASE HANDLE, as session-fields keeps its own, so a test's fresh database starts empty. */
const THE_MESSAGES_KEPT = new WeakMap<object, TheMessagesKept>()

type AStatement = { all: (...params: unknown[]) => unknown[]; get: (...params: unknown[]) => unknown }

/** The pause rule's statements, prepared once for each database handle. */
type TheStatementsOfThePause = Record<'broadcastsOf' | 'answersTo' | 'broadcastsAmong' | 'answersAmong' | 'changedSince' | 'theNewestDecision', AStatement>

const THE_STATEMENTS_OF_THE_PAUSE = new WeakMap<object, TheStatementsOfThePause>()

function theStatementsOfThePause(): TheStatementsOfThePause {
  const held = THE_STATEMENTS_OF_THE_PAUSE.get(sqlite)
  if (held !== undefined) return held
  // THE CONDITIONS ARE WRITTEN ONCE, and the first reading and the reading again both ask them. A JSON value is read by
  // its type, as the reading in JavaScript read it: a body that is not text is no body, and a skip mark is text.
  // A MESSAGE WHOSE DATA IS NOT VALID JSON is no broadcast, because the index on the stored sender leaves it out.
  // Delivered to a secretary, it is counted as an answer. It could be the person's answer, and counting it as one can
  // only under-pause. The reading again drops the secretary such a message was delivered to, and the first reading
  // that follows counts it.
  const theSender = theWordsOfAStoredField(STORED_FIELDS.messageSentById, 'r.data')
  const fromAnAgent = "r.kind = 'message' AND r.deleted_at IS NULL AND (CASE WHEN json_valid(r.data) THEN json_extract(r.data, '$.sentBy.kind') END) = 'agent'"
  const aLiveMessage = "r.kind = 'message' AND r.deleted_at IS NULL"
  const thePersonAnswered = "json_extract(r.data, '$.sentBy.kind') = 'person' AND json_type(r.data, '$.extra.broadcastSkip') IS NOT 'text'"
  const aBroadcast =
    `r.id AS id, r.created_at AS at, r.workspace_id AS workspaceId, r.rowid AS position, ${theSender} AS sender, ` +
    "CASE WHEN json_type(r.data, '$.body') = 'text' THEN json_extract(r.data, '$.body') ELSE '' END AS body, " +
    "json_type(r.data, '$.extra.broadcastSkip') IS NOT 'text' AS unmarked"
  const toThePerson = "d.message_id = r.id AND d.recipient_kind = 'person' AND d.recipient_id = @person"
  const made = {
    // THE SECRETARY'S OWN MESSAGES THROUGH THE INDEX ON THE STORED SENDER (migration 0199), each one's delivery row to
    // the person then looked up by its id. Asked with the kind as a value, SQLite read the data of every message.
    broadcastsOf: sqlite.prepare(`SELECT ${aBroadcast} FROM records r CROSS JOIN message_delivery d WHERE ${theSender} = @agent AND ${fromAnAgent} AND ${toThePerson}`),
    // FROM THE SECRETARY'S DELIVERY ROWS, each message then looked up by its id. A cross join is how SQLite is told to
    // start from the table named first; with an inner join it read every message instead.
    answersTo: sqlite.prepare(
      "SELECT r.id AS id, r.created_at AS at FROM message_delivery d CROSS JOIN records r WHERE d.recipient_kind = 'agent' " +
        `AND d.recipient_id = @agent AND r.id = d.message_id AND ${aLiveMessage} AND CASE WHEN json_valid(r.data) THEN ${thePersonAnswered} ELSE 1 END`,
    ),
    // THE SAME TWO QUESTIONS ABOUT THE RECORDS THAT CHANGED, for the secretaries kept. The answers start from the
    // delivery rows here too, so a message is read only when it was delivered to one of those secretaries.
    // THE BROADCASTS START FROM THE CHANGED IDS, each record then found by its id. Written as `r.id IN (…)`, SQLite read
    // every message by the kind's index instead, about 30 ms on the office of 22 October for three changed records, and
    // the pass asks it once for each secretary after any write.
    broadcastsAmong: sqlite.prepare(
      `SELECT ${aBroadcast} FROM json_each(@ids) j CROSS JOIN records r CROSS JOIN message_delivery d WHERE r.id = j.value ` +
        `AND ${theSender} IN (SELECT value FROM json_each(@secretaries)) AND ${fromAnAgent} AND ${toThePerson}`,
    ),
    answersAmong: sqlite.prepare(
      'SELECT r.id AS id, r.created_at AS at, d.recipient_id AS agent, json_valid(r.data) AS readable FROM message_delivery d ' +
        "CROSS JOIN records r WHERE d.message_id IN (SELECT value FROM json_each(@ids)) AND d.recipient_kind = 'agent' " +
        `AND d.recipient_id IN (SELECT value FROM json_each(@secretaries)) AND r.id = d.message_id AND ${aLiveMessage} ` +
        `AND CASE WHEN json_valid(r.data) THEN ${thePersonAnswered} ELSE 1 END`,
    ),
    changedSince: sqlite.prepare('SELECT id, updated_at AS updatedAt FROM records WHERE updated_at >= ?'),
    theNewestDecision: sqlite.prepare("SELECT max(created_at) AS at FROM records WHERE kind = 'decision' AND deleted_at IS NULL"),
  }
  THE_STATEMENTS_OF_THE_PAUSE.set(sqlite, made)
  return made
}

interface ABroadcastRow {
  id: string
  at: string
  workspaceId: string
  position: number
  sender: unknown
  body: string
  unmarked: number
}

function aBroadcastKept(row: ABroadcastRow): ABroadcastKept {
  return { at: row.at, body: row.body, skipped: row.unmarked === 0, workspaceId: row.workspaceId, position: row.position }
}

/** The kept reading of one secretary, every kept secretary brought up to date first. */
function theMessagesKeptFor(agentId: string): TheSecretarysMessages {
  const statements = theStatementsOfThePause()
  const thisReading = localStamp(new Date())
  let kept = THE_MESSAGES_KEPT.get(sqlite)
  if (kept === undefined) {
    kept = { bySecretary: new Map(), readAt: new Map(), lastReading: thisReading }
    THE_MESSAGES_KEPT.set(sqlite, kept)
  } else {
    const { changed, again } = theRowsToReadAgain(kept.readAt, kept.lastReading, (from) => statements.changedSince.all(from) as AChangedRow[])
    if (again.length > 0 && kept.bySecretary.size > 0) {
      const ids = JSON.stringify(again.map((one) => one.id))
      const secretaries = JSON.stringify([...kept.bySecretary.keys()])
      const broadcasts = statements.broadcastsAmong.all({ ids, secretaries, person: THE_PERSON }) as ABroadcastRow[]
      const answers = statements.answersAmong.all({ ids, secretaries }) as { id: string; at: string; agent: string; readable: number }[]
      for (const mine of kept.bySecretary.values()) {
        for (const one of again) {
          mine.broadcasts.delete(one.id)
          mine.answers.delete(one.id)
        }
      }
      for (const row of broadcasts) {
        if (typeof row.sender === 'string') kept.bySecretary.get(row.sender)?.broadcasts.set(row.id, aBroadcastKept(row))
      }
      for (const row of answers) if (row.readable === 1) kept.bySecretary.get(row.agent)?.answers.set(row.id, row.at)
      for (const row of answers) if (row.readable !== 1) kept.bySecretary.delete(row.agent)
    }
    // ONLY THE RECORDS IN THE RANGE ARE REMEMBERED: one that left it and changes again is read again for that.
    const inTheRange = new Set(changed.map((one) => one.id))
    for (const id of kept.readAt.keys()) if (!inTheRange.has(id)) kept.readAt.delete(id)
    for (const one of again) kept.readAt.set(one.id, one.updatedAt)
    kept.lastReading = thisReading
  }
  let mine = kept.bySecretary.get(agentId)
  if (mine === undefined) {
    mine = { broadcasts: new Map(), answers: new Map() }
    for (const row of statements.broadcastsOf.all({ agent: agentId, person: THE_PERSON }) as ABroadcastRow[]) {
      mine.broadcasts.set(row.id, aBroadcastKept(row))
    }
    for (const row of statements.answersTo.all({ agent: agentId }) as { id: string; at: string }[]) mine.answers.set(row.id, row.at)
    kept.bySecretary.set(agentId, mine)
  }
  return mine
}

/**
 * THE FIRST READING OF EACH SECRETARY THE PAUSE RULE WILL ASK ABOUT, one secretary to each piece of work, for a start to
 * make in short runs before the first minute's pass (lib/reminders.ts). A secretary already read is read again only
 * where something changed, so a piece made late costs what the pass would have paid.
 */
export function theFirstReadingsOfTheBroadcasts(): (() => void)[] {
  return theSecretaries().map((who) => () => void theMessagesKeptFor(who.id))
}

/** What the pause rule reads for one secretary. */
export interface ThePauseReading {
  paused: boolean
  /** The limit the setting holds. */
  limit: number
  /** How many broadcasts have ever been recognised. */
  broadcasts: number
  /** The newest recognised broadcast, or null. */
  newestBroadcast: RecognisedBroadcast | null
  /** The newest answer from the person, or null. */
  newestAnswer: string | null
}

/**
 * THE PAUSE RULE, READ AS A QUERY over the last N broadcasts and the person's answers.
 *
 * A LIMIT OF 0 IS OFF, and off is the gate's default in both kinds of office: nothing pauses, however many
 * broadcasts go unanswered. It is checked by itself, because at 0 the count alone pauses every secretary: one that has
 * never broadcast holds 0 broadcasts, which is the limit.
 */
export function thePauseReadingFor(agentId: string): ThePauseReading {
  const limit = broadcastUnansweredLimit()
  const mine = theMessagesKeptFor(agentId)
  const all = theBroadcastsOf(agentId, mine)
  const last = all.slice(-limit)
  const newestAnswer = theNewestAnswerTo(mine)
  // AT OR AFTER, not strictly after, and the direction is the safe one. A stored stamp is truncated
  // to the second, so an answer written in the same second as the broadcast it answers cannot be
  // told apart from one written before it; reading it as at-or-after can only UNDER-pause — the
  // broadcast is taken as answered — never pause on an answer the person gave.
  const answered = newestAnswer !== null && last.some((broadcast) => newestAnswer >= broadcast.at)
  const paused = limit > 0 && last.length === limit && !answered
  return {
    paused,
    limit,
    broadcasts: all.length,
    newestBroadcast: all.length === 0 ? null : (all[all.length - 1] as RecognisedBroadcast),
    newestAnswer,
  }
}

// ============================================================================ the reminder, told once

/** Whether the office already reminded one secretary for one slot occurrence. */
function theReminderWasSent(agentId: string, occurrence: string): boolean {
  // FOUND THROUGH THE INDEX ON THE SLOT MARK (migration 0228): the few lines marked for this slot, each
  // with its delivery row to the secretary looked up by its id. The cross join keeps the messages first.
  const found = db
    .select({ id: records.id })
    .from(records)
    .crossJoin(messageDelivery)
    .where(
      and(
        ONE_KIND_WRITTEN_OUT.message,
        // THE PATH IS WRITTEN OUT, in `STORED_FIELDS.messageBroadcastSlot`, not built from the constant: a
        // JSON path inside a string literal is the one place a bound parameter cannot go, and
        // `BROADCAST_SLOT_MARK` is checked against this spelling by the test that proves the reminder is recognised.
        eq(STORED_FIELDS.messageBroadcastSlot(records.data), occurrence),
        isNull(records.deletedAt),
        sql`json_extract(${records.data}, '$.sentBy.kind') = 'agent'`,
        sql`json_extract(${records.data}, '$.sentBy.id') = ${moleOffice().id}`,
        eq(messageDelivery.messageId, records.id),
        eq(messageDelivery.recipientKind, 'agent'),
        eq(messageDelivery.recipientId, agentId),
      ),
    )
    .get()
  return found !== undefined
}

/** Whether the office already sent one secretary the one more reminder for one slot occurrence. */
function theNoReportReminderWasSent(agentId: string, occurrence: string): boolean {
  // FROM THE SECRETARY'S DELIVERY ROWS, for the reason the pause rule's `answersTo` gives.
  const found = db
    .select({ id: records.id })
    .from(messageDelivery)
    .crossJoin(records)
    .where(
      and(
        eq(messageDelivery.recipientKind, 'agent'),
        eq(messageDelivery.recipientId, agentId),
        eq(records.id, messageDelivery.messageId),
        eq(records.kind, 'message'),
        isNull(records.deletedAt),
        // A MESSAGE WHOSE DATA IS NOT VALID JSON IS COUNTED AS THIS REMINDER, ALREADY SENT. It could be, and counting it
        // so can only hold the reminder back, never send it twice. The reply reminder takes the same side.
        // The mark is written out for the reason `theReminderWasSent` gives; it is `BROADCAST_NO_REPORT_MARK`.
        sql`CASE WHEN json_valid(${records.data}) THEN json_extract(${records.data}, '$.sentBy.kind') = 'agent'
          AND json_extract(${records.data}, '$.sentBy.id') = ${moleOffice().id}
          AND json_extract(${records.data}, '$.extra.broadcastNoReport') = ${occurrence} ELSE 1 END`,
      ),
    )
    .get()
  return found !== undefined
}

/** Whether the pause sentence has already been said to one secretary since the person last answered. */
function thePauseWasSaidSince(agentId: string, since: string | null): boolean {
  // FROM THE SECRETARY'S DELIVERY ROWS, for the reason the pause rule's `answersTo` gives.
  const rows = db
    .select({ at: records.createdAt })
    .from(messageDelivery)
    .crossJoin(records)
    .where(
      and(
        eq(messageDelivery.recipientKind, 'agent'),
        eq(messageDelivery.recipientId, agentId),
        eq(records.id, messageDelivery.messageId),
        eq(records.kind, 'message'),
        isNull(records.deletedAt),
        // A MESSAGE WHOSE DATA IS NOT VALID JSON IS COUNTED AS THE PAUSE SENTENCE, said when it was made, for the
        // reason `theNoReportReminderWasSent` gives.
        sql`CASE WHEN json_valid(${records.data}) THEN json_extract(${records.data}, '$.sentBy.kind') = 'agent'
          AND json_extract(${records.data}, '$.sentBy.id') = ${moleOffice().id}
          AND json_extract(${records.data}, '$.extra.broadcastPause') = 1 ELSE 1 END`,
      ),
    )
    .all()
  if (rows.length === 0) return false
  if (since === null) return true
  return rows.some((row) => row.at >= since)
}

/** What one tick of the broadcast reminders did. */
export interface BroadcastReminderPass {
  /** Secretaries the due reminder was sent to. */
  reminded: string[]
  /** Secretaries told, once, that their broadcasts are paused. */
  paused: string[]
  /** Secretaries reminded once more because the slot's report has not come. */
  noReport: string[]
  /** Stored times that could not be read, each said once while this server runs, naming the secretary. */
  unreadable: string[]
}

/** Each secretary's unreadable times, said once while this server runs, as the record-duty check's failures are. */
const theUnreadableTimesSaid = new Set<string>()

/**
 * ONE TICK OF THE BROADCAST REMINDER.
 *
 * Exported so a test can run exactly one tick with a clock of its own. It sends the reminder at
 * slot minus lead and never twice for the same slot, sends no reminder while the schedule is paused,
 * and tells a paused secretary once, in one sentence.
 *
 * WITH A REPORT TEMPLATE HELD, every reminder leads to it and says the requirement, and at the slot
 * plus the late minutes a secretary with no report for the slot is reminded once more, once. WITHOUT
 * ONE (not set, or set to a record this office does not hold) no second reminder goes: the first
 * reminder did not ask for a report on a template, so the office does not chase one. A paused
 * secretary gets neither.
 */
export function sendTheBroadcastRemindersThatAreDue(
  workspaceId: string,
  now: Date,
  office: Actor = theOffice(),
): BroadcastReminderPass {
  const out: BroadcastReminderPass = { reminded: [], paused: [], noReport: [], unreadable: [] }
  const template = theReportTemplate()
  for (const who of theSecretaries()) {
    const read = theTimesReadFor(who.id)
    const held = read.schedule
    // A SECRETARY WITH NO SCHEDULE IS NOT REMINDED: the office makes one at a server start and at
    // the card door, and a schedule that is absent is a state to be brought in step, not one to be
    // guessed past.
    if (held === null || held.endedAt !== null) continue
    // A SECRETARY THAT TURNED ITS BROADCASTS OFF IS PASSED OVER: no reminder, no one more reminder and no pause line.
    // Its times stay on its schedule, so turning them on again brings the reminders back at those times.
    if (held.on === false) continue
    // EACH SECRETARY'S OWN TIMES, its schedule's or else the office's.
    const times = read.times
    // A SECRETARY WITH NO TIMES IS PASSED OVER, and nothing here has to stop for it. A secretary whose reports were
    // ended has none: no slot of an empty list is due a reminder or one more reminder, it has no broadcast for the
    // pause to count, and its times were read, so nothing is unreadable to say either.
    // TIMES THAT CANNOT BE READ DO NOT STOP THE REMINDERS. They used to throw here, which ended every tick
    // before the sweeps after it. The office's times are used, the log says so once while this server runs,
    // and each reminder says so to a secretary whose own times are wrong. Wave 13p rounds 27c and 29: the
    // setting's line is the office's, so it is said once for every secretary rather than once for each.
    for (const wrong of read.unreadable) {
      const said = wrong.road === 'stored-schedule' ? `${who.id}: ${wrong.says}` : wrong.says
      if (!theUnreadableTimesSaid.has(said)) out.unreadable.push(said)
      theUnreadableTimesSaid.add(said)
    }
    const ownTimesUnreadable = read.unreadable.some((wrong) => wrong.road === 'stored-schedule')
    // ITS OWN LEAD, or else the office's, before the slot and as the width of the window after it.
    const lead = held.leadMinutes ?? broadcastLeadMinutes()
    const due = theReminderDueAt(now, times, lead)
    const late = theReportReminderDueAt(now, times, lead)
    const pause = thePauseReadingFor(who.id)
    if (pause.paused) {
      if (!thePauseWasSaidSince(who.id, pause.newestAnswer)) {
        const limit = pause.limit
        gateMet('broadcast-pause', String(limit))
        writeASystemLineToOne(
          { kind: 'agent', id: who.id } as ParticipantRef,
          workspaceId,
          SYSTEM_LINES.theBroadcastsArePaused(
            `Your last ${String(limit)} broadcasts have asked the person for a decision and none has been answered, ` +
              'so the office is not sending the next reminder. Any answer from the person to you starts the ' +
              'schedule again.',
          ),
          office,
          undefined,
          { [BROADCAST_PAUSE_MARK]: true },
        )
        out.paused.push(who.id)
      }
      continue
    }
    if (due !== null) {
      const occurrence = localStamp(due.at).slice(0, 16)
      // A SLOT SOMEBODY SAID HAS NOTHING TO REPORT IS NOT REMINDED.
      if (!theReminderWasSent(who.id, occurrence) && theSkipForTheSlot(who.id, occurrence) === null) {
        const untold = thePushHandBacksNobodyWasToldOf()
        writeASystemLineToOne(
          { kind: 'agent', id: who.id } as ParticipantRef,
          workspaceId,
          // THE DAY'S LAST SLOT ALSO SAYS TO CHECK THE BACKUPS: once a day.
          SYSTEM_LINES.theBroadcastIsDue(
            due.slot,
            untold.after(withTheOpenItemsSaid(
              withItsOwnSettingsSaid(
                withTheOfficesTimesSaid(
                  whatTheReminderSays(template, occurrence, due.slot === theLastSlotOfTheDay(times), times, held.reminderWords ?? null),
                  ownTimesUnreadable,
                  who.id,
                  times,
                ),
                read.settingsUnreadable,
                who.id,
              ),
              who.id,
            )),
          ),
          office,
          undefined,
          { [BROADCAST_SLOT_MARK]: occurrence },
          theLeadToTheTemplate(template),
        )
        out.reminded.push(who.id)
        untold.markTold(who.id)
      }
    }
    if (late !== null && template.set && template.held) {
      const occurrence = localStamp(late.at).slice(0, 16)
      if (
        theReportForTheSlot(who.id, occurrence) === null &&
        theSkipForTheSlot(who.id, occurrence) === null &&
        !theNoReportReminderWasSent(who.id, occurrence)
      ) {
        writeASystemLineToOne(
          { kind: 'agent', id: who.id } as ParticipantRef,
          workspaceId,
          SYSTEM_LINES.theBroadcastReportIsMissing(
            late.slot,
            `办公室还没有收到你 ${occurrence} 这一时段的报告。请按这份模板写好报告，再在聊天里发一句话，带一个打开这份报告的按钮。` +
              howAReportIsRecognised(occurrence),
          ),
          office,
          undefined,
          { [BROADCAST_NO_REPORT_MARK]: occurrence },
          theLeadToTheTemplate(template),
        )
        out.noReport.push(who.id)
      }
    }
  }
  return out
}

// ============================================================================ the reading a page draws

/** THE READING A PAGE DRAWS for one agent, from the schedule, the messages and the pause rule. It never throws on times it cannot read. */
export function theBroadcastReadingFor(agentId: string, now: Date): BroadcastReading {
  const read = theTimesReadFor(agentId)
  const held = read.schedule
  const pause = thePauseReadingFor(agentId)
  const last = pause.newestBroadcast
  const on = held !== null && held.endedAt === null
  // A RUNNING SCHEDULE WITH NO TIMES HAS NO NEXT SLOT: its reports were ended.
  const noTimes = on && read.times.length === 0
  // NOR DOES ONE WHOSE BROADCASTS WERE TURNED OFF: no reminder will come at its times until they are turned on again.
  const off = on && held.on === false
  const next = on && !noTimes && !off ? theNextSlotAfter(now, read.times) : null
  const skipped = theSkippedSlotsOf(agentId).at(-1) ?? null
  const facts: Omit<BroadcastReading, 'says'> = {
    on,
    held: held !== null,
    endedAt: held === null ? null : held.endedAt,
    next: next === null ? null : { at: localStamp(next.at).slice(0, 16), slot: next.slot },
    last: last === null ? null : { at: last.at, slot: last.slot },
    paused: pause.paused,
    pauseAfter: pause.limit,
    noTimes,
    off,
    skipped: skipped === null ? null : { at: skipped.at, slot: skipped.at.slice(11) },
    // ONLY A RUNNING SCHEDULE READS TIMES, so only it says which could not be read.
    timesUnreadable: on ? read.unreadable : [],
  }
  // THE SENTENCES ARE THE WORD LISTS' ENGLISH, made by the one function the profile page also calls.
  return { ...facts, says: broadcastLines(facts, readStoredWord) }
}

// ============================================================================ a slot with nothing to report

/** The slot occurrence a message's skip mark names, or null because it carries none. */
function theSkipMarkOn(data: unknown): string | null {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) return null
  const extra = (data as Record<string, unknown>)['extra']
  if (extra === null || typeof extra !== 'object' || Array.isArray(extra)) return null
  const mark = (extra as Record<string, unknown>)[BROADCAST_SKIP_MARK]
  return typeof mark === 'string' ? mark : null
}

/**
 * THE SLOTS ONE SECRETARY HAS NOTHING TO REPORT FOR, oldest occurrence first, each with the message that says so.
 *
 * A secretary may file nothing on a quiet day. THE SKIP IS A MESSAGE, so it can be read
 * back and seen in the conversation, and nothing else holds it: a message, not deleted, carrying
 * `extra.broadcastSkip` = the occurrence (`YYYY-MM-DD HH:MM`), sent by this secretary, or sent by the person
 * to this secretary. Another agent's message with the same mark is not recognised, which is the door's own
 * rule: only the secretary itself or the person may say it. A mark row was not taken, because the
 * conversation would not show it; a field on the schedule was not taken, because the schedule's times have a
 * guard and a second guarded field is a second door to keep.
 */
function theSkippedSlotsOf(agentId: string): { at: string; message: string }[] {
  const rows = sqlite
    .prepare(
      // FOUND THROUGH THE INDEX ON THE SKIP MARK (migration 0228), asked in its words and named, because
      // SQLite chose the kind's index without the name. Every text is at or after the empty text, so the
      // range leaves no text mark out, and the type test below still decides.
      "SELECT r.id AS id, json_extract(r.data, '$.extra.broadcastSkip') AS at FROM records r " +
        'INDEXED BY records_message_broadcast_skip_idx ' +
        "WHERE r.kind = 'message' " +
        "AND (CASE WHEN json_valid(r.data) THEN json_extract(r.data, '$.extra.broadcastSkip') END) >= '' " +
        "AND r.deleted_at IS NULL AND json_valid(r.data) " +
        "AND json_type(r.data, '$.extra.broadcastSkip') = 'text' AND (" +
        "(json_extract(r.data, '$.sentBy.kind') = 'agent' AND json_extract(r.data, '$.sentBy.id') = ?) OR " +
        "(json_extract(r.data, '$.sentBy.kind') = 'person' AND EXISTS (SELECT 1 FROM message_delivery d " +
        "WHERE d.message_id = r.id AND d.recipient_kind = 'agent' AND d.recipient_id = ?))) " +
        'ORDER BY r.created_at ASC',
    )
    .all(agentId, agentId) as { id: string; at: string }[]
  const out = new Map<string, string>()
  for (const row of rows) if (!out.has(row.at)) out.set(row.at, row.id)
  return [...out].map(([at, message]) => ({ at, message })).sort((a, b) => a.at.localeCompare(b.at))
}

/** The message saying one slot occurrence has nothing to report, or null because nobody said so. */
export function theSkipForTheSlot(agentId: string, occurrence: string): string | null {
  return theSkippedSlotsOf(agentId).find((one) => one.at === occurrence)?.message ?? null
}

/** What the door that says a slot has nothing to report did. */
export interface TheBroadcastSkip {
  /** The slot occurrence, `YYYY-MM-DD HH:MM`. */
  at: string
  /** The message that says so. */
  message: string
  /** Whether somebody had already said so, in which case nothing was written. */
  already: boolean
}

/**
 * SAY ONE SLOT OCCURRENCE HAS NOTHING TO REPORT, as a message: from the secretary to the person, or from the
 * person to the secretary. The caller (`sayASlotHasNothingToReport` in lib/participants.ts) has already
 * decided who may. This refuses, in words, an occurrence that is not `YYYY-MM-DD HH:MM`, a time that is not one
 * of this secretary's times, an agent with no running schedule, and one whose reports were ended. Saying it twice
 * writes nothing the second time.
 */
export function writeTheBroadcastSkip(agentId: string, at: string, workspaceId: string, actor: Actor): TheBroadcastSkip {
  const read = theTimesReadFor(agentId)
  if (read.schedule === null || read.schedule.endedAt !== null) {
    throw new PanelError(
      'The office holds no running broadcast schedule for this agent, so it has no report to skip. Nothing was written.',
      409,
    )
  }
  if (read.times.length === 0) {
    throw new PanelError('This secretary has no report times, so it has no report to skip. Nothing was written.', 409)
  }
  const said = at.trim()
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(said) || Number.isNaN(new Date(`${said.slice(0, 10)}T${said.slice(11)}`).getTime())) {
    throw new PanelError(
      `${JSON.stringify(at)} is not a slot. Write it as the day and the time, YYYY-MM-DD HH:MM, for example 2026-10-08 07:00. Nothing was written.`,
      400,
    )
  }
  if (!read.times.includes(said.slice(11))) {
    throw new PanelError(
      `${said.slice(11)} is not one of this secretary's broadcast times, which are ${read.times.join(', ')}. Nothing was written.`,
      400,
    )
  }
  const before = theSkipForTheSlot(agentId, said)
  if (before !== null) return { at: said, message: before, already: true }
  const byThePerson = actor.type === 'human'
  const body = readStoredWord(byThePerson ? 'broadcast.skip.byThePerson' : 'broadcast.skip.bySecretary', { at: said })
  const written = createRecord({
    workspaceId,
    kind: 'message',
    title: body,
    data: {
      body,
      to: [byThePerson ? { kind: 'agent', id: agentId } : { kind: 'person', id: THE_PERSON }],
      extra: { [BROADCAST_SKIP_MARK]: said },
    },
    actor,
  })
  return { at: said, message: written.id, already: false }
}

// ============================================================================ a secretary's own settings

/** A value as a refusal shows it: its JSON, cut short so a long one does not fill the sentence. */
function shown(value: unknown): string {
  const said = JSON.stringify(value) ?? String(value)
  return said.length > 60 ? `${said.slice(0, 57)}...` : said
}

/** What is wrong with one value of a secretary's own setting, in words, or null because it is good. Null is not a value here. */
function whatIsWrongWithTheSetting(name: ABroadcastSetting, value: unknown): string | null {
  switch (name) {
    case 'on':
      return typeof value === 'boolean' ? null : `"on" is ${shown(value)}, which is not true or false.`
    case 'leadMinutes':
      return typeof value === 'number' && Number.isInteger(value) && value >= AN_OWN_LEAD.fewest && value <= AN_OWN_LEAD.most
        ? null
        : `"leadMinutes" is ${shown(value)}, which is not a whole number of minutes from ${AN_OWN_LEAD.fewest} to ${AN_OWN_LEAD.most}.`
    case 'reminderWords': {
      if (typeof value !== 'string') return `"reminderWords" is ${shown(value)}, which is not text.`
      if (value.trim() === '') return '"reminderWords" holds no words. Send null to go back to the office’s words.'
      // COUNTED AS A PERSON COUNTS THEM, one per character, so a Chinese character is one and not two.
      const characters = [...value].length
      return characters <= THE_MOST_REMINDER_CHARACTERS
        ? null
        : `"reminderWords" holds ${characters} characters, and the most is ${THE_MOST_REMINDER_CHARACTERS}.`
    }
  }
}

/**
 * What one setting stored of its own: a value, or nothing, so that it read the office's. It is not null for nothing,
 * because the change is written by a data patch, and a data patch takes a key away when its value is null.
 */
export type ASettingStored = { stored: true; value: unknown } | { stored: false }

/** Who changed one of a secretary's own settings, how they were allowed to, when, why, and what it stored before and after. */
export interface TheBroadcastSettingChange {
  by: { type: Actor['type']; id: string }
  how: string
  at: string
  because: string
  before: ASettingStored
  after: ASettingStored
}

function asStored(value: unknown): ASettingStored {
  return value === undefined || value === null ? { stored: false } : { stored: true, value }
}

/** What one write of a secretary's own settings did. */
export interface TheBroadcastSettingsWritten {
  /** The settings it changed, in the order `THE_BROADCAST_SETTINGS` names them. */
  changed: ABroadcastSetting[]
  /** The settings it was asked for that already held the value asked, so nothing was written for them. */
  alreadyHeld: ABroadcastSetting[]
  /** The change written on each setting it changed. */
  changes: Partial<Record<ABroadcastSetting, TheBroadcastSettingChange>>
}

/** The JSON object one key of an object holds, or null because it holds none. */
function theObjectAt(held: unknown, key: string): Record<string, unknown> | null {
  if (held === null || typeof held !== 'object' || Array.isArray(held)) return null
  const one = (held as Record<string, unknown>)[key]
  return one !== null && typeof one === 'object' && !Array.isArray(one) ? (one as Record<string, unknown>) : null
}

/**
 * SET ONE SECRETARY'S OWN SETTINGS BESIDE ITS TIMES: whether it broadcasts, how many minutes before each time its
 * reminder goes, and its own words in place of the reminder's check and tidy. Null for one hands it back to the
 * office's. A setting left out of `asked` is not touched.
 *
 * The caller (the POST door in api/broadcast-settings.ts) has already decided who may. This refuses, in words,
 * a request that names no setting, every value that is wrong, and an agent with no running schedule, and then
 * writes nothing. EACH CHANGE IS WRITTEN DOWN on the agent record beside the schedule, one per setting, so the
 * last change of each can be read back; the record's own revisions hold the earlier ones.
 *
 * A SETTING THAT ALREADY HOLDS WHAT IS ASKED IS NOT WRITTEN, and gets no new change. When every setting asked
 * already holds it, nothing is written at all, and the record is not touched.
 */
export function writeTheBroadcastSettings(
  agentId: string,
  asked: Partial<Record<ABroadcastSetting, unknown>>,
  change: Omit<TheBroadcastSettingChange, 'before' | 'after'>,
  actor: Actor,
): TheBroadcastSettingsWritten {
  const named = THE_BROADCAST_SETTINGS.filter((name) => asked[name] !== undefined)
  if (named.length === 0) {
    throw new PanelError(
      'Name at least one of the settings "on", "leadMinutes" and "reminderWords", or send null for one to read the ' +
        'office’s again. Nothing was written.',
      400,
    )
  }
  const wrong = named.flatMap((name) => {
    const value = asked[name]
    const said = value === null ? null : whatIsWrongWithTheSetting(name, value)
    return said === null ? [] : [said]
  })
  if (wrong.length > 0) throw new PanelError(`${wrong.join(' ')} Nothing was written.`, 400)
  const found = theAgentRecordOf(agentId)
  const record = found === null ? null : getRecord(found.record)
  const read = record === null ? null : theScheduleReadIn(record.data)
  if (found === null || record === null || read === null || read.schedule.endedAt !== null) {
    throw new PanelError(
      'The office holds no running broadcast schedule for this agent, so it has no broadcast settings to change. A ' +
        'schedule is made when the agent is given the secretary card. Nothing was written.',
      409,
    )
  }
  // COMPARED WITH WHAT IS STORED, not with what was read: a stored value that cannot be read is changed by any good one.
  const stored = theObjectAt(theObjectAt(record.data, 'extra'), BROADCAST_SCHEDULE_KEY) ?? {}
  const isHeld = (name: ABroadcastSetting): boolean => JSON.stringify(stored[name] ?? null) === JSON.stringify(asked[name])
  const changed = named.filter((name) => !isHeld(name))
  const alreadyHeld = named.filter(isHeld)
  if (changed.length === 0) return { changed, alreadyHeld, changes: {} }
  const changes: Partial<Record<ABroadcastSetting, TheBroadcastSettingChange>> = {}
  const patch: Record<string, unknown> = {}
  for (const name of changed) {
    changes[name] = { ...change, before: asStored(stored[name]), after: asStored(asked[name]) }
    patch[name] = asked[name]
  }
  const earlier = theObjectAt(theObjectAt(record.data, 'extra'), BROADCAST_SETTINGS_CHANGES_KEY) ?? {}
  // A DATA PATCH MERGES INTO WHAT IS HELD, so a setting sent as null is taken away and reads the office's again.
  throughTheBroadcastTimesDoor(() =>
    writeTheSchedule(found.record, record.data, { ...read.schedule, ...patch } as BroadcastSchedule, actor, {
      [BROADCAST_SETTINGS_CHANGES_KEY]: { ...earlier, ...changes },
    }),
  )
  return { changed, alreadyHeld, changes }
}

/** One of a secretary's settings as the GET door reads it back. */
export interface ABroadcastSettingRead<T> {
  /** What its broadcasts use now. */
  value: T
  /** Whether that is its own setting or the office's default. */
  whose: 'its-own' | 'the-offices-default'
  /** The office's default, which it uses whenever it holds none of its own. */
  default: T
  /** What is wrong with what it holds, in words, or null because nothing is. When it is not null, `value` is the default. */
  unreadable: string | null
  /** The last change, as the agent record holds it, or null because nobody has changed this setting through its door. */
  lastChange: Record<string, unknown> | null
}

/** A secretary's four broadcast settings as the GET door reads them back. */
export interface TheBroadcastSettings {
  /** Whether the office holds a broadcast schedule for this agent, and whether it still runs. */
  schedule: 'none' | 'running' | 'ended'
  /** The agent record the settings are held on, or null because there is none. */
  record: string | null
  /** The four settings, or null because the office holds no schedule for this agent. */
  settings: {
    on: ABroadcastSettingRead<boolean>
    times: ABroadcastSettingRead<string[]>
    leadMinutes: ABroadcastSettingRead<number>
    reminderWords: ABroadcastSettingRead<string>
  } | null
  /** Where every earlier change is: the agent record's revisions, or null because there is no record. */
  earlierChanges: string | null
}

/**
 * ONE SECRETARY'S FOUR BROADCAST SETTINGS, READ BACK: each with what it uses, whether that is its own or the
 * office's default, the default, what is wrong with a stored value that cannot be read, and its last change. The
 * values are the ones the reminders read, from the same readings, so the door cannot say one thing while the
 * reminders do another.
 */
export function theBroadcastSettingsOf(agentId: string): TheBroadcastSettings {
  const found = theAgentRecordOf(agentId)
  const record = found === null ? null : getRecord(found.record)
  const read = record === null ? null : theScheduleReadIn(record.data)
  const earlierChanges = record === null ? null : `GET /api/records/${record.id}/revisions`
  if (record === null || read === null) {
    return { schedule: 'none', record: record === null ? null : record.id, settings: null, earlierChanges }
  }
  const times = theTimesReadFor(agentId)
  const extra = theObjectAt(record.data, 'extra')
  const stamps = theObjectAt(extra, BROADCAST_SETTINGS_CHANGES_KEY)
  const theOne = <T>(name: ABroadcastSetting, office: T): ABroadcastSettingRead<T> => {
    const own = read.schedule[name] as T | undefined
    return {
      value: own ?? office,
      whose: own === undefined ? 'the-offices-default' : 'its-own',
      default: office,
      unreadable: read.settingsUnreadable[name] ?? null,
      lastChange: theObjectAt(stamps, name),
    }
  }
  return {
    schedule: read.schedule.endedAt === null ? 'running' : 'ended',
    record: record.id,
    settings: {
      on: theOne('on', true),
      times: {
        value: times.times,
        whose: read.schedule.times === undefined ? 'the-offices-default' : 'its-own',
        default: theOfficesBroadcastTimes().times,
        unreadable: read.unreadable,
        lastChange: theObjectAt(extra, BROADCAST_TIMES_CHANGE_KEY),
      },
      leadMinutes: theOne('leadMinutes', broadcastLeadMinutes()),
      reminderWords: theOne('reminderWords', THE_OFFICES_REMINDER_WORDS),
    },
    earlierChanges,
  }
}
