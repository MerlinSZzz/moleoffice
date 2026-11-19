// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A LIST OF IDS READ IN PIECES, so that no one statement binds more values than SQLite accepts.
 *
 * SQLite refuses a statement that binds more than 32,766 values, with "too many SQL variables", and
 * `inArray(column, ids)` binds one value for every id. From 11 October 2026 the live office held about
 * 34,400 messages, and every read of the message pool passed all of their ids to one statement, so a
 * group, the Messages page and the worker's queue answered 500 (round 48h of wave 13k). A list whose
 * length grows with the office's data therefore goes through here, and never into one statement.
 *
 * WHAT A CALLER STILL OWES. Each piece is its own statement. An ORDER BY sorts inside one piece and not
 * across the pieces, a LIMIT or a count applies to one piece, and a row that two pieces both match (an
 * OR over two lists) comes back twice. A caller whose statement does any of these sorts, counts or
 * removes the repeats after joining the pieces, and says so where it does.
 */

/**
 * How many ids one piece holds. It is far under SQLite's limit of 32,766, also when one statement
 * names its piece twice, and it is the size this repository's pieces already had before this file.
 */
export const IDS_AT_ONCE = 500

/** The ids without repeats, in the order each first appears, cut into pieces of at most IDS_AT_ONCE. No ids is no pieces. */
export function piecesOf<T>(ids: Iterable<T>): T[][] {
  const unique = [...new Set(ids)]
  const pieces: T[][] = []
  for (let at = 0; at < unique.length; at += IDS_AT_ONCE) pieces.push(unique.slice(at, at + IDS_AT_ONCE))
  return pieces
}

/** Every row `read` returns for these ids, one piece at a time, joined in the order of the pieces. */
export function readInPieces<T, Row>(ids: Iterable<T>, read: (piece: T[]) => readonly Row[]): Row[] {
  const rows: Row[] = []
  for (const piece of piecesOf(ids)) for (const row of read(piece)) rows.push(row)
  return rows
}
