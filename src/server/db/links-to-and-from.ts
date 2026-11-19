// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `linksTo` and `linksFrom` were moved byte for byte out of src/server/lib/project-board.ts, with no change of behaviour.
 * That file imports them back where it still uses them and re-exports them, so its export surface is unchanged.
 */

import { and, inArray, sql } from 'drizzle-orm'
import { db } from './client.ts'
import { readInPieces } from './in-pieces.ts'
import { links } from './schema.ts'

/**
 * The links of one type that point at any of these ids, by `links_to_idx`. Asked with `eq`, the type led SQLite to
 * `links_type_idx`, which reads every link of the type (seen in tests/the-project-board-reads-no-whole-table.test.ts).
 * `+type` keeps the test and takes the column out of every index, as lib/restrictions.ts does for the same read.
 */
export function linksTo(ids: Iterable<string>, type: string): { id: string; fromId: string; toId: string }[] {
  return readInPieces(ids, (piece) =>
    db
      .select({ id: links.id, fromId: links.fromId, toId: links.toId })
      .from(links)
      .where(and(inArray(links.toId, piece), sql`+${links.type} = ${type}`))
      .all(),
  )
}

/** The links of these types that leave any of these ids, by `links_from_idx`. */
export function linksFrom(ids: Iterable<string>, types: readonly string[]): { fromId: string; toId: string }[] {
  return readInPieces(ids, (piece) =>
    db
      .select({ fromId: links.fromId, toId: links.toId })
      .from(links)
      .where(and(inArray(links.fromId, piece), inArray(links.type, [...types])))
      .all(),
  )
}
