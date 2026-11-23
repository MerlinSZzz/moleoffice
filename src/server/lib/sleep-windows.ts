// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PERMANENT RESIDENT SLEEPS AT ITS OWN TIME: THE MINUTE CLOCK THAT BEGINS AND ENDS THAT SLEEP.
 *
 * The person's decision of 6 November 2026: each resident sets its own sleep time, at the hour its
 * department is least affected. The time is kept on its agent row (migration 0330, src/server/lib/resident-sleep.ts),
 * and the door that sets it is PUT /api/residents/:agentId/sleep-time. Once a minute in the live office, and every
 * interval a test office sets through MOLE_OFFICE_RUN_THE_SLEEP_CLOCK_EVERY_MS (a second at the shortest), this clock:
 *
 *   - ends each sleep it began whose time is over, and tells the waiters, as a wake press does;
 *   - begins the sleep of each resident that is not retired when its sleep time opens, by Mole Office, and
 *     sends it one message in the same transaction: bring its memory file, its secretary notes and its handover document
 *     up to date, and tidy, as an agent does at its sleep. A checklist with many
 *     open items is named in that message as a thing to look at; it holds nothing back, because
 *     more than five open items is a signal for the agent to judge, never a gate.
 *
 * A SLEEP TIME BEGINS ONE SLEEP AT MOST. It begins none when any sleep row of the agent began or ended after the time
 * opened: a wake press, a postponed sleep or a sleep the agent began itself all stand for that day. It begins none when
 * the time was set after it opened, so a time set inside its own window waits for the next one.
 *
 * A QUIET MINUTE IS ONE READ. The one statement below names every sleep the clock began that is still open and every
 * agent with a sleep time. When none of those is due, nothing else is read and nothing is written or logged.
 */

import { SYSTEM_LINES } from '@shared/groups.ts'
import { moleOffice, type ParticipantRef } from '@shared/participants.ts'
import { OPEN_ITEMS_WORTH_A_LOOK } from '@shared/residents.ts'
import { RUN_THE_SLEEP_CLOCK_EVERY_MS } from '@shared/sleep-clock.ts'
import { stampInZone, theClockZone } from '@shared/time.ts'
import { sqlite } from '../db/client.ts'
import { openItemsByChecklistOf } from './checklists.ts'
import { writeASystemLineToOne } from './groups.ts'
import { named } from './named-timers.ts'
import { getRecord } from './records.ts'
import { endTheOpenSleep, theOpenSleepOf, theSleepTimeHolding, writeASleepRow } from './resident-sleep.ts'
import { residencyOf } from './residents.ts'
import { tellTheWaitersFor } from './waiting-hold.ts'

/** What one minute did: the agents whose sleep it began, and those whose sleep it ended. */
export interface AMinuteOfTheSleepClock {
  began: string[]
  woke: string[]
}

/** One row of the minute's one read: a sleep the clock began that is still open, or an agent with a sleep time. */
interface ADueRow {
  due: 'wake' | 'begin'
  sleepId: string | null
  agentId: string
  at: string
  minutes: number | null
  setAt: string | null
}

const THE_MINUTES_READ =
  "SELECT 'wake' AS due, id AS sleepId, agent_id AS agentId, wakes_at AS at, NULL AS minutes, NULL AS setAt FROM resident_sleeps " +
  "WHERE what = 'slept' AND ended_at IS NULL AND wakes_at IS NOT NULL " +
  'UNION ALL ' +
  "SELECT 'begin', NULL, id, sleep_time_starts, sleep_time_minutes, sleep_time_set_at FROM agents " +
  'WHERE sleep_time_starts IS NOT NULL AND sleep_time_minutes IS NOT NULL'

/** True when a sleep row of this agent began or ended at or after `since`, so the sleep time has already been used. */
function aSleepRowSince(agentId: string, since: string): boolean {
  return (
    sqlite.prepare('SELECT 1 AS one FROM resident_sleeps WHERE agent_id = ? AND (began_at >= ? OR ended_at >= ?) LIMIT 1').get(agentId, since, since) !==
    undefined
  )
}

/**
 * ONE MINUTE OF THE CLOCK, at `at`. Each sleep it began whose time is over is ended first, and then each sleep time that
 * holds `at` is begun, so a sleep that ends as the next opens is ended before the next is asked about.
 */
export function aMinuteOfTheSleepClock(at: number = Date.now(), log: (line: string) => void = () => {}): AMinuteOfTheSleepClock {
  const rows = sqlite.prepare(THE_MINUTES_READ).all() as ADueRow[]
  const done: AMinuteOfTheSleepClock = { began: [], woke: [] }
  if (rows.length === 0) return done
  const zone = theClockZone()
  const now = stampInZone(at, zone)

  for (const row of rows) {
    if (row.due !== 'wake' || row.sleepId === null || now < row.at) continue
    if (endTheOpenSleep(row.sleepId, now) === null) continue
    const who: ParticipantRef = { kind: 'agent', id: row.agentId }
    tellTheWaitersFor([who])
    done.woke.push(row.agentId)
    log(`The sleep clock ended the sleep of agent ${row.agentId} at ${now}: its sleep time was over at ${row.at}.`)
  }

  for (const row of rows) {
    if (row.due !== 'begin' || row.minutes === null) continue
    const time = { startsAt: row.at, minutes: row.minutes }
    const holding = theSleepTimeHolding(at, time, zone)
    if (holding === null) continue
    const opened = stampInZone(holding.start, zone)
    // SET AFTER IT OPENED: the time waits for its next window.
    if (row.setAt === null || row.setAt > opened) continue
    if (aSleepRowSince(row.agentId, opened) || theOpenSleepOf(row.agentId) !== null) continue
    const residency = residencyOf(row.agentId)
    const who: ParticipantRef = { kind: 'agent', id: row.agentId }
    if (residency === null || residency.retired) continue
    const decision = getRecord(residency.decisionId)
    if (decision === null) {
      throw new Error(`The residency decision ${residency.decisionId} of agent ${row.agentId} is not in the office, so its sleep cannot be begun.`)
    }
    const wakesAt = stampInZone(holding.end, zone)
    const begun = sqlite.transaction(() => {
      if (theOpenSleepOf(row.agentId) !== null) return false
      const crowded = openItemsByChecklistOf(who).filter((one) => one.open > OPEN_ITEMS_WORTH_A_LOOK)
      const reminder = writeASystemLineToOne(
        who,
        decision.workspaceId,
        SYSTEM_LINES.yourSleepTimeHasBegun(residency.handle, row.agentId, wakesAt, zone, crowded),
        { type: 'system', id: moleOffice().id },
      )
      writeASleepRow({
        agentId: row.agentId,
        what: 'slept',
        because: `Its sleep time opened at ${opened} and lasts ${String(row.minutes)} minutes, on the office's clock (${zone}).`,
        by: moleOffice(),
        sessionId: null,
        wakesAt,
        reminderId: reminder.id,
        at: now,
      })
      return true
    })()
    if (!begun) continue
    done.began.push(row.agentId)
    log(`The sleep clock began the sleep of ${residency.handle} (agent ${row.agentId}) at ${now}, until ${wakesAt}, and sent it the reminder.`)
  }
  return done
}

/**
 * START THE CLOCK: one minute of it every `every` milliseconds, named for the loop watch. The timer is unref'd, so it
 * never holds the process open. A MINUTE THAT THROWS IS A LINE IN THE LOG, and the next minute runs as before: nothing
 * in the server catches a throw from a timer, so one uncaught would stop the server. Each sleep is begun in its own
 * transaction, so a throw keeps the sleeps begun before it and writes nothing of the one it stopped.
 */
export function startTheSleepClock(log: (line: string) => void, every = RUN_THE_SLEEP_CLOCK_EVERY_MS): NodeJS.Timeout {
  const timer = setInterval(
    named('the sleep clock', log, () => {
      try {
        aMinuteOfTheSleepClock(Date.now(), log)
      } catch (err) {
        log(`The sleep clock could not finish a minute: ${err instanceof Error ? err.message : String(err)} The next minute asks again.`)
      }
    }),
    every,
  )
  timer.unref()
  return timer
}
