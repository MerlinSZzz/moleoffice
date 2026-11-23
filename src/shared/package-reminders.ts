// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * HOW OFTEN THE OFFICE REMINDS A MAKER OF THE INSIDE PACKAGES THAT WAIT ON IT. Each secretary sets its own interval; a
 * maker that has set none, or holds no secretary card, is reminded every `PACKAGE_REMINDER_DEFAULT_HOURS`. The interval
 * is one row of `runtime_settings` per agent, its value `{"hours": n}`; src/server/lib/package-reminders.ts reads and
 * writes it, and runs the minute clock that sends the reminders.
 */

import { sayInEnglish } from './i18n.ts'

/** The interval a maker is reminded at when none is set, none can be read, or it holds no secretary card. */
export const PACKAGE_REMINDER_DEFAULT_HOURS = 4
/** The shortest and longest interval a secretary may set, in whole hours. */
export const PACKAGE_REMINDER_FEWEST_HOURS = 1
export const PACKAGE_REMINDER_MOST_HOURS = 168

/** The name of the `runtime_settings` row that holds one agent's interval. */
export function packageReminderSettingName(agentId: string): string {
  return `package.reminder.every:${agentId}`
}

/**
 * THE ONE CHECK OF AN INTERVAL: a whole number of hours from 1 to 168. The door asks it of what is sent and the reading
 * asks it of what is stored, so a row the door would refuse is read as unreadable.
 */
export function readAPackageReminderInterval(hours: unknown): { hours: number } | { refused: string } {
  if (typeof hours === 'number' && Number.isInteger(hours) && hours >= PACKAGE_REMINDER_FEWEST_HOURS && hours <= PACKAGE_REMINDER_MOST_HOURS) return { hours }
  return {
    refused: sayInEnglish('packageReminder.hoursRefused', {
      sent: JSON.stringify(hours) ?? String(hours),
      fewest: PACKAGE_REMINDER_FEWEST_HOURS,
      most: PACKAGE_REMINDER_MOST_HOURS,
    }),
  }
}
