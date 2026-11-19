// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * REMIND ME LATER: WHEN A MESSAGE THE PERSON PUT OFF COMES BACK.
 *
 * Next to Take me there in the chat, the person may press Remind me later when there is no time to
 * look yet. The press offers three times. At the chosen time the office brings the message back once.
 *
 * THIS IS THE ONE PLACE THE TIMES ARE WRITTEN. The secretary set them first (reply 7pfqwe_daRmk) and the person
 * may change them, so the server's door, the office's timer and the page's three presses all read this
 * list. Changing a time here changes it everywhere.
 */
import { localStamp } from './time.ts'

/** The three choices, by the word the door takes. */
export const REMIND_ME_LATER_CHOICES = ['in-30-minutes', 'in-2-hours', 'at-7-next-morning'] as const
export type RemindMeLaterChoice = (typeof REMIND_ME_LATER_CHOICES)[number]

/** How each choice works out its time: so many minutes after the press, or the next time the clock shows this hour. */
export const REMIND_ME_LATER_TIMES: Readonly<
  Record<RemindMeLaterChoice, { after: { minutes: number } } | { atTheNext: { hour: number; minute: number } }>
> = {
  'in-30-minutes': { after: { minutes: 30 } },
  'in-2-hours': { after: { minutes: 120 } },
  'at-7-next-morning': { atTheNext: { hour: 7, minute: 0 } },
}

export function isARemindMeLaterChoice(word: unknown): word is RemindMeLaterChoice {
  return typeof word === 'string' && (REMIND_ME_LATER_CHOICES as readonly string[]).includes(word)
}

/**
 * WHEN A MESSAGE PUT OFF AT `pressedAt` WITH `choice` COMES BACK, as a local stamp.
 *
 * "The next morning at 07:00" is the next 07:00 after the press: pressed at 22:00 it is the next day,
 * and pressed at 01:00 it is the same day, six hours later. Either way it is the next morning the person
 * wakes to, and the sentence after the press names the day and the time, so nothing is left to guess.
 */
export function whenAPutOffMessageComesBack(choice: RemindMeLaterChoice, pressedAt: Date): string {
  const how = REMIND_ME_LATER_TIMES[choice]
  if ('after' in how) return localStamp(new Date(pressedAt.getTime() + how.after.minutes * 60_000))
  const at = new Date(pressedAt.getTime())
  at.setHours(how.atTheNext.hour, how.atTheNext.minute, 0, 0)
  if (at.getTime() <= pressedAt.getTime()) at.setDate(at.getDate() + 1)
  return localStamp(at)
}
