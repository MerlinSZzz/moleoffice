// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `elevationsThatEndWith` was moved byte for byte out of src/server/lib/elevation.ts, with no change of behaviour.
 * `theGrantOnTheRow` was moved byte for byte out of src/server/lib/elevation.ts, with no change of behaviour.
 * `whoIsActingForThePerson` was moved byte for byte out of src/server/lib/elevation.ts, with no change of behaviour.
 * `theElevationOn` was moved byte for byte out of src/server/lib/elevation.ts, with no change of behaviour.
 * `ended` was moved byte for byte out of src/server/lib/elevation.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import { type Elevation, elevationStillHolds, mayBeElevated } from '@shared/roles.ts'
import { sqlite } from '../db/client.ts'
import { readElevations } from '@shared/read-elevations.ts'
import { nowStamp } from '@shared/time.ts'
import { theRoleCards, theRoleCardsAreRead } from './roles.ts'

/**
 * EVERY AGENT WHOSE ELEVATION ENDED WHEN THIS PIECE OF WORK ENDED, by handle and with the grant to
 * write back. Criterion P59's second end.
 *
 * IT DECIDES AND DOES NOT WRITE, for the reason `retireWhateverWasStartedFor` gives about the same
 * event: the write is a patch to the agent's record, and this file may not reach the record path
 * without making an import loop. `src/server/lib/claims.ts` does the writing, in the one place a
 * claim is released.
 */
export function elevationsThatEndWith(recordId: string): { handle: string; every: Elevation[] }[] {
  const out: { handle: string; every: Elevation[] }[] = []
  for (const { id, handle, elevation } of whoIsActingForThePerson()) {
    if (elevation.endsWhen !== 'when a piece of work ends') continue
    if (elevation.until !== recordId) continue
    // THE WHOLE LIST BACK, with the last one ended. The caller writes the field, and the field is
    // every grant they made: handing back one object would take the earlier ones off the record.
    const every = theGrantOnTheRow(id)?.every ?? []
    out.push({
      handle,
      every: [
        ...every.slice(0, -1),
        ended(elevation, `The piece of work it was given until, ${recordId}, was released.`),
      ],
    })
  }
  return out
}
/** One registry row's grants, and the last of them, whether it still holds or not. Read by id. */
export function theGrantOnTheRow(id: string): { agentId: string; role: string | null; every: Elevation[]; grant: Elevation | null } | null {
  const row = sqlite.prepare('SELECT id, role, elevation FROM agents WHERE id = ?').get(id) as
    | Record<string, unknown>
    | undefined
  if (row === undefined) return null
  const every = readElevations(row['elevation'])
  const role = row['role'] === null || row['role'] === undefined ? null : String(row['role'])
  return { agentId: String(row['id']), role, every, grant: every[every.length - 1] ?? null }
}
/**
 * Every agent acting for the person right now, by handle. Empty is the ordinary answer. Each row is
 * read by its own id, so no name is resolved here.
 */
export function whoIsActingForThePerson(): { id: string; handle: string; elevation: Elevation }[] {
  const rows = sqlite.prepare('SELECT id, handle FROM agents WHERE elevation IS NOT NULL').all() as Record<string, unknown>[]
  const out: { id: string; handle: string; elevation: Elevation }[] = []
  for (const row of rows) {
    const id = String(row['id'])
    const grant = theGrantOnTheRow(id)
    const held = grant === null ? null : theElevationOn(grant)
    if (held !== null) out.push({ id, handle: String(row['handle']), elevation: held })
  }
  return out
}
/** The same reading, for a row already read. */
export function theElevationOn(held: NonNullable<ReturnType<typeof theGrantOnTheRow>>): Elevation | null {
  if (held.grant === null) return null
  if (!theRoleCardsAreRead()) return null
  if (!mayBeElevated(theRoleCards(), held.role)) return null
  return elevationStillHolds(held.grant, nowStamp()) ? held.grant : null
}
/** The same grant, ended, with the sentence saying what ended it. */
export function ended(one: Elevation, because: string): Elevation {
  return { ...one, endedAt: nowStamp(), endedBecause: because }
}
