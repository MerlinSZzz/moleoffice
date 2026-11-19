// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHO CLOSED A PROBLEM, READ FROM ITS CHANGE LOG. Drawn by src/web/components/WhoClosedIt.tsx.
 *
 * The close is the newest change row that took the state from a word that does not mean finished to
 * one that does, by `progressOf`, the one reader of a state word. A merge patch writes that as a
 * `data.state` row, and a whole-object write as a `data` row, so both are read. This file draws
 * nothing: it reads the rows, as lib/attention.ts does, and hands back who and when.
 */

import { progressOf } from '@shared/work.ts'
import type { ActorType, Change } from '@shared/types.ts'

/** Who closed it and when, as the change row stores them. */
export interface TheClose {
  actorType: ActorType
  actorId: string
  at: string
}

/** The state a change row's value holds, for the three fields that can carry one. */
function stateIn(field: string | null, value: string | null): unknown {
  if (value === null) return null
  if (field === 'data.state' || field === 'state') return value
  if (field !== 'data') return null
  try {
    const parsed: unknown = JSON.parse(value)
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)['state']
      : null
  } catch {
    // A `data` row whose value is not JSON holds no state this can read, so it is not the close.
    return null
  }
}

/**
 * THE CLOSE: the newest change that took the state from not finished to finished, or null where no
 * row in `changes` did. `changes` is newest first, as the change log sends it.
 */
export function theClose(changes: readonly Change[]): TheClose | null {
  for (const change of changes) {
    if (change.op !== 'update') continue
    const now = stateIn(change.field, change.newValue)
    const was = stateIn(change.field, change.oldValue)
    if (progressOf(now) === 'finished' && progressOf(was) !== 'finished') {
      return { actorType: change.actorType, actorId: change.actorId, at: change.at }
    }
  }
  return null
}
