// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `theRowsInForce` was moved byte for byte out of src/server/lib/casting.ts, with no change of behaviour.
 * `rowsOfRole` was moved byte for byte out of src/server/lib/casting.ts, with no change of behaviour.
 * `CURRENT_IMAGE` was moved byte for byte out of src/server/lib/casting.ts, with no change of behaviour.
 * `ROWS_OF_ROLE` was moved byte for byte out of src/server/lib/casting.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import { theRowTheToolsTake, type CastingRow } from '@shared/casting.ts'
import { sqlite } from '../db/client.ts'
import { rowOf } from './a-casting-by-id.ts'
import type { Held } from './casting.ts'

/**
 * THE ROWS THE DEFAULT ROUTER ROLLS ACROSS for a role and a project: every row of the scope whose marked row the tools
 * take, by the same rule, so the roll and the marked row are read from one scope. None when the table marks no row.
 */
export function theRowsInForce(role: string, project: string | null): CastingRow[] {
  const rows = rowsOfRole(role)
  const taken = theRowTheToolsTake(rows, project)
  if (taken === null) return []
  const scope = taken.scope === 'the project' ? project : null
  return rows.filter((row) => row.project === scope)
}
export function rowsOfRole(role: string): CastingRow[] {
  let statement = ROWS_OF_ROLE.get(sqlite)
  if (statement === undefined) {
    statement = sqlite.prepare(`SELECT *, ${CURRENT_IMAGE} FROM casting_rows WHERE role = ? ORDER BY id`)
    ROWS_OF_ROLE.set(sqlite, statement)
  }
  return (statement.all(role) as Held[]).map(rowOf)
}
/** Current fields live in the newest full row image, using the existing (casting_id,id) index. */
export const CURRENT_IMAGE = '(SELECT "after" FROM casting_row_changes INDEXED BY casting_row_changes_casting WHERE casting_id = casting_rows.id ORDER BY id DESC LIMIT 1) AS current_image'
/**
 * ONE PREPARED STATEMENT PER DATABASE HANDLE (wave 13y round 40), the pattern of `theRuntimeForAgentStatement` in
 * participants.ts. The queue asks for a role's castings once for every agent it reads, through `theModelARunGets`, and
 * preparing this statement again each time was the largest part of that reader on a made-up office of the live size.
 * The statement still reads the table as it is each time it runs.
 */
export const ROWS_OF_ROLE = new WeakMap<object, { all: (role: string) => unknown[] }>()
