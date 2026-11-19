// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SHORT LINE BESIDE A PERMANENT RESIDENT IN THE CHAT, on its contact row and in its conversation's header:
 * "Asleep since 14:02" or "Last slept 3h ago". How long ago it last slept shows on the agent's chat side. A resident
 * with no sleep recorded has no line: where the chat has nothing to show it shows nothing (wave 13y round 111). The
 * profile's Sleep place still says so.
 *
 * A SECRETARY'S OWN SLEEP TIME IS ON THE LINE TOO, since each secretary sets its own:
 * "Asleep until 05:00" while the sleep the office began at that time goes on, and "Sleeps at 03:00" beside its last
 * sleep, or alone when none is recorded.
 *
 * IT READS `residentSleep` ON THE PRESENCE READING THE CHAT ALREADY MAKES for the dot beside it, so it costs the chat no
 * request (tests/the-chat-reads-only-the-rows-and-dots-it-draws.test.ts). A participant that is not a resident has no
 * `residentSleep` and gets no line. Its own file, so the chat imports nothing of the resident pages.
 */
import { t } from '@shared/i18n.ts'
import { whenAContactLastSpoke } from '@shared/messages.ts'
import { nowStamp } from '@shared/time.ts'
import type { PresenceOnTheWire } from '../api.ts'
import { relativeTime } from './ui.tsx'

/** The chat's line for one resident, as the presence reading carries it. */
export type TheSleepLine = NonNullable<PresenceOnTheWire['residentSleep']>

/**
 * THE WORDS OF THE CHAT'S LINE, or null where no sleep is recorded and no sleep time is set. `now` is a local stamp,
 * passed in so a test can put the question at any moment. The moment asleep is drawn as the contact rows draw a time:
 * the time today, the month and day this year. When it wakes is drawn as a time of day only: a sleep time lasts 12
 * hours at most (src/shared/residents.ts), so that time comes once before it wakes.
 */
export function sleepLineWords(line: TheSleepLine, now: string): string | null {
  if (line.asleepSince !== null) {
    return line.wakesAt !== null
      ? t('resident.sleep.line.asleepUntil', { until: line.wakesAt.slice(11, 16) })
      : t('resident.sleep.line.asleepSince', { when: whenAContactLastSpoke(line.asleepSince, now) })
  }
  const at = line.sleepTime?.startsAt
  if (line.lastSleptAt !== null) {
    const ago = relativeTime(line.lastSleptAt)
    return at === undefined ? t('resident.sleep.line.lastSlept', { ago }) : t('resident.sleep.line.lastSleptSleepsAt', { ago, at })
  }
  return at === undefined ? null : t('resident.sleep.line.sleepsAt', { at })
}

/**
 * THE LINE AFTER A SLEEP PRESS, from the sleep its door answered, until the chat's next read of the dot brings the
 * office's own line. The same four facts the office's line holds (`theSleepLineOf` in src/server/lib/resident-sleep.ts):
 * asleep since when and until when, otherwise when its last sleep ended, and its sleep time.
 */
export function theLineAfterAPress(sleep: {
  asleep: { since: string; wakesAt: string | null } | null
  lastSleepEndedAt: string | null
  sleepTime: { startsAt: string; minutes: number } | null
}): TheSleepLine {
  const sleepTime = sleep.sleepTime === null ? null : { startsAt: sleep.sleepTime.startsAt, minutes: sleep.sleepTime.minutes }
  return sleep.asleep !== null
    ? { asleepSince: sleep.asleep.since, lastSleptAt: null, wakesAt: sleep.asleep.wakesAt, sleepTime }
    : { asleepSince: null, lastSleptAt: sleep.lastSleepEndedAt, wakesAt: null, sleepTime }
}

/** The short line beside a resident in the chat. Nothing for a participant that is not a resident, or for a resident with no sleep recorded and no sleep time. */
export function SleepLine({ reading }: { reading: Pick<PresenceOnTheWire, 'residentSleep'> | undefined }) {
  const line = reading?.residentSleep
  const words = line === undefined ? null : sleepLineWords(line, nowStamp())
  if (line === undefined || words === null) return null
  return (
    <span className="px-chat-sleep" data-sleep={line.asleepSince !== null ? 'asleep' : line.lastSleptAt !== null ? 'slept' : 'sleep-time'} title={t('resident.sleep.line.title')}>
      <style href="mole-office-sleep-line" precedence="default">
        {SLEEP_LINE_CSS}
      </style>
      {words}
    </span>
  )
}

/** No backtick in these strings. The line gives way before the name does, and never wraps the row. */
const SLEEP_LINE_CSS = `
.px-chat-sleep {
  flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  color: var(--text-3); font-size: var(--fs-1);
}
`
