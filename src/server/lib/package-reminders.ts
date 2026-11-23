// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE INSIDE PACKAGES THAT WAIT ON THEIR MAKER REMIND IT TOGETHER, AT AN INTERVAL EACH SECRETARY SETS.
 *
 * An inside package waits on its maker while its state is handed_back, or while its newest restatement has no answer
 * (`theAlignmentOf` its acts is 'waiting'). A done package never waits, and an outside package is not counted. Nothing
 * stores the count: each minute works it out again from the packages themselves (`thePackagesCounted`).
 *
 * ONE REMINDER PER MAKER PER PROJECT, AT ITS INTERVAL. It is due one interval after the newest reminder the office sent
 * that maker in that project, read from the sent messages themselves (`data.notice` packageReminder) and stored nowhere
 * else. A maker never reminded is due at once, and a changed interval counts from the last reminder. Nothing is sent
 * while nothing waits. The hand-back notice is not changed by any of this.
 *
 * THE INTERVAL is one `runtime_settings` row per agent, `{"hours": n}`, under `packageReminderSettingName`. It is used
 * only while the maker holds the secretary card; any other maker, the person included, is reminded every
 * `PACKAGE_REMINDER_DEFAULT_HOURS`. A row that is not readable JSON, or whose hours fail the one check in
 * src/shared/package-reminders.ts, is unreadable: its reading says so with the stored text, the clock uses the default
 * for that maker, and the reminder and the server log each say so.
 */

import { and, eq, isNull, sql } from 'drizzle-orm'

import { theAlignmentOf } from '@shared/delegation.ts'
import { sayInEnglish } from '@shared/i18n.ts'
import { participantKey } from '@shared/messages.ts'
import { PACKAGE_REMINDER_DEFAULT_HOURS, packageReminderSettingName, readAPackageReminderInterval } from '@shared/package-reminders.ts'
import { isParticipantKind, moleOfficeId, type ParticipantRef } from '@shared/participants.ts'
import { parseStoredStamp } from '@shared/time.ts'
import { MESSAGE_CENTRE } from '@shared/workspaces.ts'
import { db, sqlite } from '../db/client.ts'
import { listWorkspaces } from '../db/list-workspaces.ts'
import { ONE_KIND_WRITTEN_OUT, STORED_FIELDS, records } from '../db/schema.ts'
import { theMakerOf, thePackagesCounted, type CountedPackage } from './delegation.ts'
import { readTheDepartments, type TheDepartmentsRead } from './departments.ts'
import { writeAMessage } from './inspection.ts'
import { named } from './named-timers.ts'
import { PanelError } from './panel-error.ts'
import { theLastChangeOfASetting, writeDownASettingChange, type Actor } from './records.ts'
import { theCallerOf } from './residents.ts'
import { theSecretaries } from './secretariat.ts'
import { theAgentAnArrivingReferenceNames } from './the-agent-an-arriving-reference-names.ts'
import { THE_OFFICE } from './the-office.ts'

const HOUR_MS = 3_600_000
const THE_NOTICE = 'packageReminder'
/** What the change log calls the setting. */
const THE_FIELD = 'Package reminder interval'

// ============================================================================ the interval

/** A maker's interval as the office reads it now. Each of setBy, setAt, because and stored is null where nothing is recorded. */
export interface APackageReminderInterval {
  hours: number
  /** default: no row; set: the row, read; unreadable: a row that cannot be read, so the default is used. */
  from: 'default' | 'set' | 'unreadable'
  /** Who wrote the newest change of the row, and when, as the settings change log holds it. */
  setBy: { type: string; id: string } | null
  setAt: string | null
  because: string | null
  /** The row's value, as stored. */
  stored: string | null
}

const THE_DEFAULT: APackageReminderInterval = {
  hours: PACKAGE_REMINDER_DEFAULT_HOURS, from: 'default', setBy: null, setAt: null, because: null, stored: null,
}

function theStoredRow(agentId: string): string | null {
  const row = sqlite.prepare('SELECT value FROM runtime_settings WHERE name = ?').get(packageReminderSettingName(agentId)) as { value: string } | undefined
  return row?.value ?? null
}

/** The hours a stored value holds, or null when it is not readable JSON or its hours fail the check. */
function theHoursStoredIn(stored: string): number | null {
  let value: unknown
  try {
    value = JSON.parse(stored)
  } catch {
    return null
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const read = readAPackageReminderInterval((value as Record<string, unknown>)['hours'])
  return 'hours' in read ? read.hours : null
}

/** The reason the newest change gave, from its `to` value `{hours, because}`; null where it gave none that can be read. */
function theReasonIn(to: string | null): string | null {
  if (to === null) return null
  try {
    const value: unknown = JSON.parse(to)
    const because = typeof value === 'object' && value !== null ? (value as Record<string, unknown>)['because'] : undefined
    return typeof because === 'string' ? because : null
  } catch {
    return null
  }
}

/** THE READING OF ONE AGENT'S INTERVAL, from its row and the newest change of it. It does not ask about the card. */
export function thePackageReminderIntervalOf(agentId: string): APackageReminderInterval {
  const stored = theStoredRow(agentId)
  if (stored === null) return THE_DEFAULT
  const change = theLastChangeOfASetting(packageReminderSettingName(agentId))
  const said = { setBy: change?.by ?? null, setAt: change?.at ?? null, because: theReasonIn(change?.to ?? null), stored }
  const hours = theHoursStoredIn(stored)
  return hours === null ? { hours: PACKAGE_REMINDER_DEFAULT_HOURS, from: 'unreadable', ...said } : { hours, from: 'set', ...said }
}

/**
 * THE DOOR'S WRITE: one agent's interval, set by the person or by the agent itself with its own key, for an agent that
 * holds the secretary card. A refusal writes nothing. The row and its change-log row are written in one transaction.
 */
export function setAPackageReminderInterval(
  reference: string,
  sent: { hours?: unknown; because?: unknown },
  actor: Actor,
  workspaceId: string,
): APackageReminderInterval {
  const found = theAgentAnArrivingReferenceNames(reference, 'writing')
  if (found === null) throw new PanelError(sayInEnglish('packageReminder.noAgent', { reference }), 404)
  const agentId = found.agent.id
  const caller = theCallerOf(actor)
  if (caller.kind !== 'person' && !(caller.kind === 'agent' && caller.id === agentId)) {
    throw new PanelError(sayInEnglish('packageReminder.notTheCaller', { handle: found.agent.handle }), 403)
  }
  // AN INTERVAL IS SET ONLY WHERE THE CLOCK USES IT, so the person is refused too for an agent without the card.
  if (!theSecretaries().some((one) => one.id === agentId)) {
    throw new PanelError(sayInEnglish('packageReminder.notASecretary', { handle: found.agent.handle, hours: PACKAGE_REMINDER_DEFAULT_HOURS }), 403)
  }
  const read = readAPackageReminderInterval(sent.hours)
  if ('refused' in read) throw new PanelError(sayInEnglish('packageReminder.refusedAtTheDoor', { why: read.refused }), 400)
  const because = typeof sent.because === 'string' ? sent.because.trim() : ''
  if (because === '') throw new PanelError(sayInEnglish('packageReminder.noReason'), 400)

  const name = packageReminderSettingName(agentId)
  sqlite.transaction(() => {
    const was = theStoredRow(agentId)
    sqlite.prepare('INSERT INTO runtime_settings (name,value) VALUES (?,?) ON CONFLICT(name) DO UPDATE SET value=excluded.value').run(name, JSON.stringify({ hours: read.hours }))
    const before = was === null ? null : theHoursStoredIn(was) === null ? was : JSON.parse(was)
    writeDownASettingChange(actor, { setting: name, field: THE_FIELD, before, after: { hours: read.hours, because }, workspaceId })
  })()
  return thePackageReminderIntervalOf(agentId)
}

// ============================================================================ what waits

/** One inside package that waits on its maker, and for what. */
interface AWaitingPackage {
  recordId: string
  title: string
  lines: string[]
  handedBack: boolean
  restatement: boolean
}

/** A package whose maker no one agent answers to is logged once in this process, and is in no reminder. */
const loggedWithNoMaker = new Set<string>()

/** The inside packages of one project that wait on their maker, by maker. */
function theWaitingByMaker(workspaceId: string, log: (line: string) => void): Map<string, { maker: ParticipantRef; packages: AWaitingPackage[] }> {
  const byMaker = new Map<string, { maker: ParticipantRef; packages: AWaitingPackage[] }>()
  for (const counted of thePackagesCounted(workspaceId).packages) {
    const waits = whatItWaitsFor(counted)
    if (waits === null || counted.inside === null) continue
    let maker: ParticipantRef
    try {
      maker = theMakerOf(counted.inside)
    } catch (err) {
      if (!(err instanceof PanelError)) throw err
      if (!loggedWithNoMaker.has(counted.recordId)) {
        loggedWithNoMaker.add(counted.recordId)
        log(sayInEnglish('packageReminder.noMakerLog', { task: counted.recordId, workspace: workspaceId, why: err.message }))
      }
      continue
    }
    const key = participantKey(maker)
    const one = byMaker.get(key) ?? { maker, packages: [] }
    one.packages.push({ recordId: counted.recordId, title: counted.title, lines: counted.lines, ...waits })
    byMaker.set(key, one)
  }
  return byMaker
}

function whatItWaitsFor(counted: CountedPackage): { handedBack: boolean; restatement: boolean } | null {
  if (counted.inside === null || counted.state === 'done') return null
  const handedBack = counted.state === 'handed_back'
  const restatement = theAlignmentOf({ alignments: counted.inside.alignments ?? [], alignmentAnswers: counted.inside.alignmentAnswers ?? [] }) === 'waiting'
  return handedBack || restatement ? { handedBack, restatement } : null
}

/**
 * THE NEWEST REMINDER THE OFFICE SENT EACH RECIPIENT, BY PROJECT, as milliseconds, keyed by project and then by
 * `participantKey` (src/shared/messages.ts). A row whose kind is not a participant's is no maker's, so it is not read.
 * Every message is stored in the message centre, and the project the office wrote it for is its `writtenIn.project`
 * (src/server/lib/records/creating.ts), so that is where a reminder's project is read. One read through the sender's
 * index, which is named because SQLite does not pick it (src/server/db/their-own-messages.ts). It is not indexed by
 * notice. A stamp that is not the office's own form is a broken assumption, and the minute stops on it.
 */
function theLastReminders(): Map<string, Map<string, number>> {
  const rows = db.all<{ project: string | null; kind: string | null; id: string | null; at: string }>(sql`
    SELECT ${STORED_FIELDS.messageWrittenInProject(records.data)} AS project, json_extract(sent.value, '$.kind') AS kind,
      json_extract(sent.value, '$.id') AS id, max(${records.createdAt}) AS at
    FROM ${records} INDEXED BY records_message_sent_by_idx, json_each(${records.data}, '$.to') AS sent
    WHERE ${and(ONE_KIND_WRITTEN_OUT.message, eq(STORED_FIELDS.messageSentById(records.data), moleOfficeId()), eq(records.workspaceId, MESSAGE_CENTRE), isNull(records.deletedAt))}
      AND json_extract(${records.data}, '$.notice') = ${THE_NOTICE}
    GROUP BY 1, 2, 3`)
  const last = new Map<string, Map<string, number>>()
  for (const row of rows) {
    if (row.project === null || row.id === null || !isParticipantKind(row.kind)) continue
    const key = participantKey({ kind: row.kind, id: row.id })
    const at = parseStoredStamp(row.at)
    if (at === null) throw new Error(`A package reminder to ${key} in project ${row.project} is stamped "${row.at}", which is not the office's own form.`)
    const inTheProject = last.get(row.project) ?? new Map<string, number>()
    inTheProject.set(key, at)
    last.set(row.project, inTheProject)
  }
  return last
}

// ============================================================================ the reminder

/**
 * THE GROUPS A PACKAGE IS COUNTED UNDER: the department each of its lines names, or the line itself where no one
 * department holds it, or one group that says it names no line. A package is counted once in each group.
 */
function theGroupsOf(lines: readonly string[], departments: TheDepartmentsRead): { key: string; says: string }[] {
  if (lines.length === 0) return [{ key: 'none', says: sayInEnglish('packageReminder.groupOfNoLine') }]
  const groups = new Map<string, string>()
  for (const line of lines) {
    const holder = departments.aCodeNames(line)
    if (holder.state === 'held') {
      groups.set(`department:${holder.department.id}`, sayInEnglish('packageReminder.groupOfADepartment', { name: holder.department.name.en ?? holder.department.title }))
    } else {
      groups.set(`line:${line}`, sayInEnglish(holder.state === 'held-by-several' ? 'packageReminder.groupOfALineSeveralHold' : 'packageReminder.groupOfALine', { line }))
    }
  }
  return [...groups].map(([key, says]) => ({ key, says }))
}

function theReminderBody(packages: readonly AWaitingPackage[], departments: TheDepartmentsRead, unreadable: boolean): string {
  const groups = new Map<string, { says: string; packages: AWaitingPackage[] }>()
  for (const one of packages) {
    for (const group of theGroupsOf(one.lines, departments)) {
      const held = groups.get(group.key) ?? { says: group.says, packages: [] }
      held.packages.push(one)
      groups.set(group.key, held)
    }
  }
  const parts = [sayInEnglish('packageReminder.total', { n: packages.length })]
  for (const group of groups.values()) {
    const rows = group.packages.map((one) => sayInEnglish('packageReminder.package', {
      title: one.title,
      task: one.recordId,
      waits: sayInEnglish(one.handedBack && one.restatement ? 'packageReminder.waitsForBoth' : one.handedBack ? 'packageReminder.waitsForTheHandBack' : 'packageReminder.waitsForTheRestatement'),
    }))
    parts.push([sayInEnglish('packageReminder.group', { group: group.says, count: sayInEnglish('packageReminder.count', { n: group.packages.length }) }), ...rows].join('\n'))
  }
  if (unreadable) parts.push(sayInEnglish('packageReminder.unreadable', { hours: PACKAGE_REMINDER_DEFAULT_HOURS }))
  return parts.join('\n\n')
}

/** What one minute did: each reminder it sent. */
export interface AMinuteOfThePackageReminders {
  sent: { workspaceId: string; to: ParticipantRef; messageId: string; packages: number }[]
}

/** ONE MINUTE OF THE CLOCK, at `now`: in each project, each maker whose reminder is due and on whom a package waits is sent one. */
export function aMinuteOfThePackageReminders(now: number, log: (line: string) => void): AMinuteOfThePackageReminders {
  const done: AMinuteOfThePackageReminders = { sent: [] }
  let secretaries: Set<string> | undefined
  let last: Map<string, Map<string, number>> | undefined
  for (const workspace of listWorkspaces()) {
    const waiting = theWaitingByMaker(workspace.id, log)
    if (waiting.size === 0) continue
    last ??= theLastReminders()
    let departments: TheDepartmentsRead | undefined
    for (const [key, { maker, packages }] of waiting) {
      secretaries ??= new Set(theSecretaries().map((one) => one.id))
      const interval = maker.kind === 'agent' && secretaries.has(maker.id) ? thePackageReminderIntervalOf(maker.id) : THE_DEFAULT
      const before = last.get(workspace.id)?.get(key)
      if (before !== undefined && before + interval.hours * HOUR_MS > now) continue
      departments ??= readTheDepartments(workspace.id)
      const unreadable = interval.from === 'unreadable'
      const messageId = writeAMessage({
        workspaceId: workspace.id,
        to: [maker],
        onlyThem: true,
        aboutRun: null,
        actor: THE_OFFICE,
        notice: THE_NOTICE,
        title: sayInEnglish('packageReminder.title', { n: packages.length }),
        body: theReminderBody(packages, departments, unreadable),
      })
      done.sent.push({ workspaceId: workspace.id, to: maker, messageId, packages: packages.length })
      if (unreadable) log(sayInEnglish('packageReminder.unreadableLog', { who: maker.id, stored: interval.stored ?? '', workspace: workspace.id, hours: PACKAGE_REMINDER_DEFAULT_HOURS }))
      log(sayInEnglish('packageReminder.sentLog', { who: maker.id, workspace: workspace.id, n: packages.length, message: messageId }))
    }
  }
  return done
}

/**
 * START THE CLOCK: one minute of it every `every` milliseconds, named for the loop watch. The timer is unref'd, so it
 * never holds the process open. A MINUTE THAT THROWS IS A LINE IN THE LOG, and the next minute runs as before: nothing
 * in the server catches a throw from a timer, so one uncaught would stop the server. Each reminder is its own write, so
 * a throw keeps the reminders sent before it.
 */
export function startThePackageReminderClock(log: (line: string) => void, every = 60_000): NodeJS.Timeout {
  const timer = setInterval(
    named('the package reminder clock', log, () => {
      try {
        aMinuteOfThePackageReminders(Date.now(), log)
      } catch (err) {
        log(sayInEnglish('packageReminder.minuteFailed', { why: err instanceof Error ? err.message : String(err) }))
      }
    }),
    every,
  )
  timer.unref()
  return timer
}
