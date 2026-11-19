// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * The dormant switch of tier 2 of the owner's decision: a conflict no rule joins goes to the entry's own
 * supervisor.
 */
import { gatePosition } from './settings.mjs'

/** An explicit environment belongs to its caller; it never inherits this checkout's .env. */
/** @param {Record<string, string | undefined>} [env] */
export function conflictResolvingIsOn(env) {
  return gatePosition('conflict-resolving', env) === '1'
}
