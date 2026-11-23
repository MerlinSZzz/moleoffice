// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `theDutiesPartFor` was moved byte for byte out of src/server/lib/grant/secretary-duties.ts, with no change of behaviour.
 * `theDutiesIn` was moved byte for byte out of src/server/lib/grant/secretary-duties.ts, with no change of behaviour.
 * `THE_DUTIES_FIELDS` was moved byte for byte out of src/server/lib/grant/secretary-duties.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import { sqlite } from './client.ts'
import { SECRETARY_DUTIES_KIND } from '@shared/secretary-duties-record.ts'
import type { TheDuties, AnotherSecretarysArea, TheDutiesPart } from './types/secretary-duties.ts'

/**
 * EVERY LIVE secretary_duties RECORD IN THE PROJECT, IN ONE STATEMENT: the reader's own whole, and every other's area
 * line with its secretary's handle. `reader` is the reader's registry id, or null for a reader that is not an agent.
 */
export function theDutiesPartFor(workspaceId: string, reader: string | null): TheDutiesPart {
  const rows = sqlite
    .prepare(
      `SELECT r.id AS id, json_extract(r.data, '$.secretary.id') AS secretary, a.handle AS handle,
         CASE WHEN json_extract(r.data, '$.secretary.id') IS ? THEN r.data ELSE json_extract(r.data, '$.area') END AS said
       FROM records r LEFT JOIN agents a ON a.id = json_extract(r.data, '$.secretary.id')
       WHERE r.workspace_id = ? AND r.kind = ? AND r.deleted_at IS NULL
       ORDER BY a.handle, r.id`,
    )
    .all(reader, workspaceId, SECRETARY_DUTIES_KIND) as { id: string; secretary: string; handle: string | null; said: string | null }[]
  let yours: TheDutiesPart['yours'] = null
  const others: AnotherSecretarysArea[] = []
  for (const row of rows) {
    if (reader !== null && row.secretary === reader) {
      const data = JSON.parse(row.said ?? '{}') as Record<string, unknown>
      yours = { recordId: row.id, secretary: row.secretary, ...(theDutiesIn(data) as unknown as TheDuties) }
    } else {
      others.push({ recordId: row.id, secretary: row.secretary, handle: row.handle, area: row.said ?? '' })
    }
  }
  const note =
    rows.length === 0
      ? "Nobody has recorded any secretary's duties in this project."
      : yours === null && reader !== null
        ? 'No duties record names you. The others are listed with their areas; GET /api/secretaries/duties has them in full.'
        : 'GET /api/secretaries/duties has every secretary\'s duties in full.'
  return { yours, others, note }
}
/** The duties a record's data holds, the fields in the binding's order, and nothing else of the data. */
export function theDutiesIn(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const key of THE_DUTIES_FIELDS) if (data[key] !== undefined) out[key] = data[key]
  return out
}
/**
 * The fields that are the duties, in the order the binding writes them. `secretary` is in the act's name instead.
 * `supervisors` is last, so the binding of duties without it is the string it was before it was added, and a warrant
 * written then still names them (wave 13y round 91, item 12b).
 */
export const THE_DUTIES_FIELDS = ['area', 'responsibleFor', 'lines', 'doors', 'reportsToThePerson', 'restsOn', 'supervisors'] as const
