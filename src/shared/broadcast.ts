// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE READING A PAGE DRAWS ABOUT ONE SECRETARY'S BROADCAST.
 *
 * This follows a decision of 16 September 2026. The reading is declared here, in shared, for
 * the one reason every shape the server and the browser both read is declared here: two declarations of one shape drift
 * apart and nothing makes them agree. The server builds it in `theBroadcastReadingFor` (src/server/lib/broadcast.ts);
 * the profile page draws it.
 */
import type { WordKey, WordValues } from './i18n.ts'

/**
 * ONE PLACE THE BROADCAST TIMES COULD NOT BE READ FROM, and what was wrong, in words. `env-line` is the
 * setting MOLE_OFFICE_BROADCAST_TIMES; `stored-schedule` is this secretary's own times as its schedule holds
 * them. The sentence also says which times are used meanwhile. Wave 13p round 29.
 */
export interface BroadcastTimesUnreadable {
  road: 'env-line' | 'stored-schedule'
  says: string
}

export interface BroadcastReading {
  /** Whether a live schedule is held for this secretary. */
  on: boolean
  /** Whether the office holds a schedule for this agent at all, live or ended. */
  held: boolean
  /** When the schedule ended, because the agent stopped being a secretary, or null while it has not. */
  endedAt: string | null
  /** The next slot after now, or null when the schedule is off. */
  next: { at: string; slot: string } | null
  /** The newest recognised broadcast, or null because none has been recognised. */
  last: { at: string; slot: string } | null
  /** Whether the unanswered rule has paused the schedule. */
  paused: boolean
  /** How many broadcasts in a row, unanswered by the person, pause the schedule. */
  pauseAfter: number
  /**
   * Whether the schedule runs with no report times, because this secretary's reports were ended. It is then sent
   * no reminder and never paused, and `next` is null.
   */
  noTimes: boolean
  /**
   * Whether this secretary's broadcasts were turned off on its running schedule. It is then sent no reminder and never
   * paused, its times are kept for when they are turned on again, and `next` is null.
   */
  off: boolean
  /** The newest slot somebody said has nothing to report, or null because none has been skipped. */
  skipped: { at: string; slot: string } | null
  /**
   * Where the times could not be read, in words, empty when they were. The times in `next` are then the
   * office's own: its setting when only the stored schedule is wrong, else the built-in times.
   */
  timesUnreadable: BroadcastTimesUnreadable[]
  /** The plain sentences the page draws, in the order it draws them, in English. */
  says: string[]
}

/**
 * THE SENTENCES ABOUT ONE SECRETARY'S BROADCAST, in the order a page draws them, read from the word
 * lists by `say`. The server hands it the English reader and stores the answer as `says`, for a
 * caller that reads the reply; the profile page hands it the page's reader, so a Chinese page draws
 * them in Chinese (round 19 found them in English on a Chinese agent page). One function, so the two
 * cannot come to say different things.
 *
 * `when` says a stored stamp in words. The server leaves it out, so its `says` carries the stamp as
 * stored for a caller that reads the reply. The profile page passes the office's own words for a
 * time, worked out on the office's clock ("today at 13:00", "今天 13:00"), the words the
 * acting-for-you line on the same page says its end with.
 */
export function broadcastLines(
  reading: Omit<BroadcastReading, 'says'>,
  say: (key: WordKey, values?: WordValues) => string,
  when: (stamp: string) => string = (stamp) => stamp,
): string[] {
  if (!reading.held) return [say('broadcast.says.noSchedule')]
  if (reading.endedAt !== null) return [say('broadcast.says.ended', { at: when(reading.endedAt) })]
  if (reading.off) return [say('broadcast.says.off')]
  if (reading.noTimes) return [say('broadcast.says.noTimes')]
  return [
    reading.next === null ? say('broadcast.says.noNextTime') : say('broadcast.says.next', { at: when(reading.next.at) }),
    reading.last === null ? say('broadcast.says.noneYet') : say('broadcast.says.last', { at: when(reading.last.at) }),
    ...(reading.skipped === null ? [] : [say('broadcast.says.skipped', { at: when(reading.skipped.at) })]),
    reading.paused ? say('broadcast.says.paused', { n: reading.pauseAfter }) : say('broadcast.says.running'),
  ]
}
