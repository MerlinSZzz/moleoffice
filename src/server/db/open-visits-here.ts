// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `openVisitsHere` was moved byte for byte out of src/server/lib/visits.ts, with no change of behaviour.
 * `asVisit` was moved byte for byte out of src/server/lib/visits.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import { sqlite } from './client.ts'
import type { Visit } from '@shared/worlds.ts'
import type { ParticipantRef } from '@shared/participants.ts'

/** The visits that are still open, which is what the mirror carries. */
export function openVisitsHere(): Visit[] {
  const rows = sqlite
    .prepare('SELECT * FROM visits WHERE until IS NULL ORDER BY since DESC, id DESC')
    .all() as Record<string, unknown>[]
  return rows.map(asVisit)
}
export function asVisit(row: Record<string, unknown>): Visit {
  const said = (key: string): string | null => {
    const value = row[key]
    return value === null || value === undefined ? null : String(value)
  }
  const since = String(row['since'])
  const registeredAt = String(row['registered_at'])
  return {
    id: String(row['id']),
    visitor: { kind: String(row['visitor_kind']) as ParticipantRef['kind'], id: String(row['visitor_id']) },
    fromWorld: String(row['from_world']),
    toWorld: String(row['to_world']),
    since,
    until: said('until'),
    why: String(row['why']),
    // READ, NOT STORED. The two stamps are the fact; a flag beside them would be a third copy of it.
    registeredLate: registeredAt > since,
    registeredAt,
    reportedAt: said('reported_at'),
  }
}
