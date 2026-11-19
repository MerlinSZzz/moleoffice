// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE HASH A SEAL PINS A ROW BY, AND THE COLUMNS A REVISION ROW HAS HAD. Wave 13s round 183, case 8 part (c) of the
 * re-mint plan. It imports no database client, so the re-mint can check a seal on the rows it reads itself.
 *
 * A records seal pins each revision it names by the sha256 of the whole row as JSON, as `SELECT *` returned it when the
 * seal was made (revision() in ./sealed-tip.ts). It pins a link by the sha256 of the link's row in fifteen named
 * columns, so a column added to links later leaves that hash as it was.
 *
 * ---------------------------------------------------------------------------------------
 * A REVISION ROW IS HASHED IN THE COLUMNS IT HAD WHEN IT WAS SEALED
 * ---------------------------------------------------------------------------------------
 *
 * Migration 0060 made the revisions table. Five migrations since then added columns to it, each at the end, and none
 * of them changed a seal. SQLite reads an added column as null on every older row, and JSON.stringify writes that null,
 * so a row read today does not hash as it did before the column came. A seal made before migration 0276, for one, does
 * not hold when its row is read with `SELECT *` today.
 *
 * So a revision row is read as each list of columns the table has had: the columns 0060 made, then those columns and
 * the ones each later migration added, in the table's order. The list is written out here from the drizzle files. A
 * row holds its pin when it hashes to the pin in one of those lists. A list with a column the seal did not have gives
 * other JSON, so the list that matches is the one the seal was made in, and no clock is read. A change to a column the
 * seal never had is not seen, because that seal never pinned it.
 *
 * A migration that adds a column to revisions adds its entry here. The re-mint refuses a revisions table whose columns
 * are not the last list, and a test fails when a migrated test office's table has other columns.
 */
import { createHash } from 'node:crypto'

/** The hash a seal pins a row by: the sha256 of the row as JSON, in the order its columns were read. */
export const theHashOfARow = (row: Record<string, unknown>): string => createHash('sha256').update(JSON.stringify(row)).digest('hex')

export const sealHash = (value: string | Buffer): string => createHash('sha256').update(value).digest('hex')

/**
 * THE COLUMNS A LINK'S ROW IS HASHED IN, IN THEIR ORDER (round BM, item 2aq). Every column of `links`, each named, so
 * a column added later does not change the hash of a link an older seal pinned.
 */
export const THE_COLUMNS_A_LINK_IS_HASHED_BY =
  'id, workspace_id, owner_id, created_at, updated_at, from_id, to_id, type, inferred, created_by, created_by_type, gate, gate_up_to, gate_up_to_sort, carries'

/** Each migration that gave revisions columns, oldest first, and the columns it added at the end, in their order. */
export const THE_COLUMNS_REVISIONS_HAS_HAD: readonly { migration: string; added: readonly string[] }[] = [
  {
    migration: '0060_revision_ledger',
    added: ['id', 'record_id', 'workspace_id', 'seq', 'content_hash', 'kind', 'title', 'summary', 'data', 'deleted_at', 'op', 'actor_type', 'actor_id', 'session_id', 'at', 'note'],
  },
  { migration: '0112_the_warrant', added: ['warrant', 'revokes_seq'] },
  { migration: '0139_a_secretary_acting_for_the_person', added: ['elevation'] },
  { migration: '0168_the_proved_holder_beside_the_actor', added: ['proved_holder'] },
  { migration: '0178_how_a_write_was_proved', added: ['proved_by'] },
  { migration: '0276_a_signed_item_held_for_its_named_agent', added: ['signed_item'] },
  { migration: '0351_a_revision_stores_a_runs_chapters_once', added: ['parts'] },
]

/** Every list of columns revisions has had, oldest first: each is the one before it and what its migration added. */
export const THE_LISTS_OF_REVISION_COLUMNS: readonly { after: string; columns: readonly string[] }[] = THE_COLUMNS_REVISIONS_HAS_HAD.map((one, at) => ({
  after: one.migration,
  columns: THE_COLUMNS_REVISIONS_HAS_HAD.slice(0, at + 1).flatMap((each) => each.added),
}))

/** The columns revisions has now, the last list. */
export const THE_REVISION_COLUMNS_NOW: readonly string[] = THE_LISTS_OF_REVISION_COLUMNS.at(-1)?.columns ?? []

/**
 * The migration after which revisions had the columns `row` hashes to `hash` in, or null when it hashes to it in none
 * of the lists. `row` is a revision row as `SELECT *` reads it today.
 */
export function theListARevisionRowHashesUnder(row: Record<string, unknown>, hash: string): string | null {
  for (const list of THE_LISTS_OF_REVISION_COLUMNS) {
    if (theHashOfARow(Object.fromEntries(list.columns.map((column) => [column, row[column]]))) === hash) return list.after
  }
  return null
}
