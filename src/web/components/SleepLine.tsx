// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SHORT WORD THAT SAYS A PERMANENT RESIDENT IS ASLEEP, in the chat's name rows: on its contact row and in its
 * conversation's head, beside its name and presence. "Asleep until 05:00" while the sleep the office began at its sleep
 * time goes on, and "Asleep since 14:02" for any other sleep. An awake resident has no word.
 *
 * THE CHAT SAYS ONLY WHETHER IT IS ASLEEP. When it last slept, when it sleeps next, and the presses that put it to sleep
 * and wake it are on its profile, and nowhere in the chat.
 *
 * IT READS `residentSleep` ON THE PRESENCE READING THE CHAT ALREADY MAKES for the dot beside it, so it costs the chat no
 * request (tests/the-chat-reads-only-the-rows-and-dots-it-draws.test.ts). A participant that is not a resident has no
 * `residentSleep` and gets no word. Its own file, so the chat imports nothing of the resident pages.
 */
import { t } from '@shared/i18n.ts'
import { whenAContactLastSpoke } from '@shared/messages.ts'
import { nowStamp } from '@shared/time.ts'
import type { PresenceOnTheWire } from '../api.ts'

/** One resident's sleep, as the presence reading carries it to the chat. */
export type TheSleepLine = NonNullable<PresenceOnTheWire['residentSleep']>

/**
 * THE WORDS THAT SAY IT IS ASLEEP, or null while it is awake, whatever its last sleep and its sleep time. `now` is a
 * local stamp, passed in so a test can put the question at any moment. The moment asleep is drawn as the contact rows
 * draw a time: the time today, the month and day this year. When it wakes is drawn as a time of day only: a sleep time
 * lasts 12 hours at most (src/shared/residents.ts), so that time comes once before it wakes.
 */
export function sleepLineWords(line: TheSleepLine, now: string): string | null {
  if (line.asleepSince === null) return null
  return line.wakesAt !== null
    ? t('resident.sleep.line.asleepUntil', { until: line.wakesAt.slice(11, 16) })
    : t('resident.sleep.line.asleepSince', { when: whenAContactLastSpoke(line.asleepSince, now) })
}

/** The asleep word beside a resident in the chat. Nothing for a resident that is awake, or for a participant that is not a resident. */
export function SleepLine({ reading }: { reading: Pick<PresenceOnTheWire, 'residentSleep'> | undefined }) {
  const line = reading?.residentSleep
  const words = line === undefined ? null : sleepLineWords(line, nowStamp())
  if (words === null) return null
  return (
    <span className="px-chat-sleep" data-sleep="asleep" title={t('resident.sleep.line.title')}>
      <style href="mole-office-sleep-line" precedence="default">
        {SLEEP_LINE_CSS}
      </style>
      {words}
    </span>
  )
}

/**
 * No backtick in these strings. On a contact row the word gives way before the name does, and never wraps the row. The
 * head's name row wraps, so there the word moves to the next line whole.
 */
const SLEEP_LINE_CSS = `
.px-chat-sleep {
  flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  color: var(--text-3); font-size: var(--fs-1);
}
`
