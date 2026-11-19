// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A SECRETARY'S BROADCAST SETTINGS, AND THE TWO COUNTERS THAT MARK THE DOORS THAT MAY WRITE THEM.
 *
 * The block was moved whole out of src/server/lib/records.ts, with no change of behaviour:
 * the schedule-write counter and the function that runs a write inside it, the times-door
 * counter and its runner, the two change-stamp keys, the three readers of the settings, and
 * the guard that refuses every other write of them.
 *
 * records.ts hands every name on with `export *`, so no caller changed.
 *
 * This file imports nothing from records.ts: `PanelError` comes from ../panel-error.ts,
 * `isJsonObject` from ../../db/the-decision-names-this-fork.ts, and the type `Actor` from
 * ./actor.ts.
 */
import { PanelError } from '../panel-error.ts'
import { isJsonObject } from '../../db/the-decision-names-this-fork.ts'
import type { Actor } from './actor.ts'

// The schedule writer changes no starter, even when a record still names an older one.
export let theBroadcastScheduleWriteIsOpen = 0
export function throughTheBroadcastScheduleWrite<T>(write: () => T): T {
  theBroadcastScheduleWriteIsOpen += 1
  try {
    return write()
  } finally {
    theBroadcastScheduleWriteIsOpen -= 1
  }
}

/**
 * The same marker `theStartFolderDoorIsOpen` is, for the same reason, and separate from it on purpose: the two doors that
 * set a secretary's broadcast settings may write nothing else that is guarded.
 */
let theBroadcastTimesDoorIsOpen = 0

/**
 * Run one write as one of the two doors that set a secretary's broadcast settings: its times, and whether it broadcasts,
 * its reminder's lead and its reminder's words. `writeTheBroadcastTimes` and `writeTheBroadcastSettings` are the only callers.
 */
export function throughTheBroadcastTimesDoor<T>(run: () => T): T {
  theBroadcastTimesDoorIsOpen += 1
  try {
    return run()
  } finally {
    theBroadcastTimesDoorIsOpen -= 1
  }
}

export const BROADCAST_TIMES_CHANGE_KEY = 'broadcastTimesChange'

/** The key in the agent record's `extra` bag that holds the last change of each of the three settings. */
export const BROADCAST_SETTINGS_CHANGES_KEY = 'broadcastSettingsChanges'

/** The settings of an agent record's broadcast schedule that only their doors change, with "none" said one way: null. */
export function theBroadcastTimesIn(data: unknown): unknown {
  if (!isJsonObject(data)) return null
  const extra = data['extra']
  if (!isJsonObject(extra)) return null
  const schedule = extra['broadcastSchedule']
  if (!isJsonObject(schedule)) return null
  const held = { times: schedule['times'] ?? null, on: schedule['on'] ?? null, leadMinutes: schedule['leadMinutes'] ?? null, reminderWords: schedule['reminderWords'] ?? null }
  return Object.values(held).every((one) => one === null) ? null : held
}

/** The broadcast times change stamp an agent record holds, or undefined when there is none. */
export function theBroadcastTimesChangeIn(data: unknown): unknown {
  if (!isJsonObject(data) || !isJsonObject(data['extra'])) return undefined
  return data['extra'][BROADCAST_TIMES_CHANGE_KEY]
}

/** The broadcast settings change stamp an agent record holds, the last change of each of the three settings, or undefined when there is none. */
export function theBroadcastSettingsChangesIn(data: unknown): unknown {
  if (!isJsonObject(data) || !isJsonObject(data['extra'])) return undefined
  return data['extra'][BROADCAST_SETTINGS_CHANGES_KEY]
}

/**
 * NOBODY CHANGES A SECRETARY'S BROADCAST SETTINGS OR THEIR CHANGE STAMPS BUT THEIR DOORS, NOT EVEN THE PERSON.
 *
 * A secretary has four broadcast settings of its own on its schedule, and two doors write them. Its times go through
 * `POST /api/participants/agent/:id/broadcast-times`. Whether it broadcasts, its reminder's lead and its reminder's
 * words (`on`, `leadMinutes` and `reminderWords`) go through `POST /api/participants/agent/:id/broadcast-settings`.
 * Each door decides who may, checks each value, and records who changed it and why in a change stamp of its own
 * beside the schedule. An ordinary write to `extra.broadcastSchedule` would do none of the three, and a value the
 * reminders cannot read leaves that secretary on the office's value instead of its own. An ordinary write of a stamp
 * cannot know that its account is true. So unlike the card, the person is refused here too, and pointed to the doors,
 * which the person may use.
 *
 * A WRITE THAT LEAVES THE FOUR ALONE AND CARRIES BOTH STAMPS UNCHANGED IS NOT A CHANGE, as with a card. The office's
 * own writes of the schedule carry them unchanged.
 */
export function checkNobodyIsChangingBroadcastTimes(next: unknown, before: unknown, actor: Actor): void {
  if (theBroadcastTimesDoorIsOpen > 0) return
  if (JSON.stringify(theBroadcastTimesIn(next)) === JSON.stringify(theBroadcastTimesIn(before)) &&
      JSON.stringify(theBroadcastTimesChangeIn(next)) === JSON.stringify(theBroadcastTimesChangeIn(before)) &&
      JSON.stringify(theBroadcastSettingsChangesIn(next)) === JSON.stringify(theBroadcastSettingsChangesIn(before))) return
  throw new PanelError(
    'A secretary\u2019s four broadcast settings on its agent record, "extra.broadcastSchedule.times", "on", ' +
      '"leadMinutes" and "reminderWords", and their two change stamps, ' +
      `"extra.${BROADCAST_TIMES_CHANGE_KEY}" and "extra.${BROADCAST_SETTINGS_CHANGES_KEY}", ` +
      'are changed only by their own doors: ' +
      'POST /api/participants/agent/<id>/broadcast-times {"times":["12:00"],"because":…} for its times, and ' +
      'POST /api/participants/agent/<id>/broadcast-settings {"on":false,"because":…} for whether it broadcasts, its ' +
      'reminder\u2019s lead and its reminder\u2019s words. null for any one of the four settings reads the office\u2019s again. The ' +
      'owner, the agent that started it or a holder of the secretary card may use them. Each door checks the values and ' +
      'records who changed them and why in its own stamp, and this write would do neither. ' +
      `This request was made by "${actor.id}". Nothing was written.`,
    403,
  )
}
