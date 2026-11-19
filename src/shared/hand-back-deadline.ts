// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHEN A HAND-BACK IS DUE.
 * `theHandBackDeadline` was moved byte for byte out of src/server/lib/merge-state-machine.ts, with no change
 * of behaviour. That file re-exports it. It reads a setting through src/config/settings.mjs, which imports
 * Node's own modules, so it has a file of its own.
 */

import { settingValue } from '../config/settings.mjs'
import { clockStamp, stampInZone, momentOfAnInstant, type ClockStamp } from '@shared/time.ts'

/**
 * WHEN A HAND-BACK IS DUE: MOLE_OFFICE_HAND_BACK_HOURS after `clock`, with the wall time in its zone and the moment
 * itself. An entry's hand-back and an emergency push's hand-back both store it, and whenAHandBackIsDue reads it.
 */
export function theHandBackDeadline(clock: ClockStamp): { hours: number; deadline: string; timeZone: string; dueAt: string } {
  const hours = Number(settingValue('MOLE_OFFICE_HAND_BACK_HOURS'))
  const due = momentOfAnInstant(clock.instant)! + hours * 3_600_000
  return { hours, deadline: stampInZone(due, clock.timeZone), timeZone: clock.timeZone, dueAt: clockStamp(() => new Date(due)).instant }
}
