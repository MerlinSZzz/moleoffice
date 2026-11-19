// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `withdrawnMessagePoolAfter` was moved byte for byte out of src/server/lib/messages.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import { withdrawnPoolBetween } from './newest-withdrawn-message-pool-first.ts'
import type { TheirOwnMessages, AWithdrawnMessage } from './messages.ts'

/**
 * The same withdrawn pool of every project of the list, narrowed by its newest delete's append order before building any
 * entry. With `theirs`, only the messages that participant sent or was handed, as in `theTalksPool` (round 76).
 */
export function withdrawnMessagePoolAfter(projects: readonly string[], after: number, theirs?: TheirOwnMessages): AWithdrawnMessage[] {
  return withdrawnPoolBetween(projects, { after }, theirs)
}
