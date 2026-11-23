// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `theRunAWriteCameFrom` was moved byte for byte out of src/server/lib/elevation.ts, with no change of behaviour.
 * `WHICH_RUN_A_SESSION_IS` was moved byte for byte out of src/server/lib/elevation.ts, with no change of behaviour.
 * `A_LIVE_SESSION_RECORD` was moved byte for byte out of src/server/lib/elevation.ts, with no change of behaviour.
 * `theRunTheRowSays` was moved byte for byte out of src/server/lib/elevation.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import { sqlite } from './client.ts'
import type { SessionRunRow } from './types/elevation.ts'

/**
 * WHICH RUN A WRITE CAME OUT OF, when the office started that run for an agent, or null.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS IS HERE AND NOT IN THE SESSIONS READER
 * ---------------------------------------------------------------------------------------
 *
 * Criterion M81, on problem `i05BSaUcdfXF` of 7 September 2026. A run the message worker starts for
 * an agent writes under that agent's handle, because that is what it is answering as. Elevation is
 * looked up by handle. So a run started for the secretary carried the secretary's grant: at 17:33 on
 * 7 September one settled work, patched a registry row and wrote in a group in the person's name,
 * while the session the person had actually granted was writing something else.
 *
 * A grant is the person's press on ONE agent, and what they pressed on was the mind they were talking to.
 * A run is a different mind wearing the same name. So the grant stops at the run, and this is the
 * reader that says a write is a run's.
 *
 * IT ASKS THE SESSION RECORD, NOT THE ACTOR ID, because the actor id of a run is the agent's handle
 * and always will be — that is the point of a durable agent. What tells the two apart is which
 * session the write says it belongs to: a run the office started carries `startedByMoleOffice` and
 * `servingAgent`, both written by the worker when it files the run's record.
 *
 * A REFERENCE THAT NAMES NO RECORD IS NULL, not a refusal. `x-mole-office-session` takes a run name
 * as well as a record id, and a run name is what an agent uses before it has filed anything.
 */
export function theRunAWriteCameFrom(session: string | null | undefined): { run: string; servingAgent: string } | null {
  if (typeof session !== 'string' || session === '') return null
  const row = sqlite
    .prepare(`${WHICH_RUN_A_SESSION_IS} WHERE id = ? AND ${A_LIVE_SESSION_RECORD}`)
    .get(session) as SessionRunRow | undefined
  return row === undefined ? null : theRunTheRowSays(row)
}
export const WHICH_RUN_A_SESSION_IS =
  "SELECT id, json_extract(data, '$.servingAgent') AS serving, json_extract(data, '$.startedByMoleOffice') AS started FROM records"
// THE KIND AND `deleted_at` ARE ASKED WITH A `+`, so SQLite finds the rows by their ids, as `listRecords` does for ids. With
// no statistics, asked for twelve sessions at once, it chose the index of every record of a kind and read every session of
// the office to keep them (wave 13y round 66). The conditions are the same.
export const A_LIVE_SESSION_RECORD = "+kind = 'session' AND +deleted_at IS NULL AND json_valid(data)"
/** A session record's row is a run the office started for an agent when it names the agent and says the office started it. */
export function theRunTheRowSays(row: SessionRunRow): { run: string; servingAgent: string } | null {
  if (typeof row.serving !== 'string' || row.serving === '') return null
  // `startedByMoleOffice` is stored as JSON true, which SQLite hands back as 1.
  if (row.started !== 1 && row.started !== true) return null
  return { run: String(row.id), servingAgent: row.serving }
}
