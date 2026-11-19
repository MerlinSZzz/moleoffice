// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { sql } from 'drizzle-orm'
import { check, index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { aPartTable } from '../part-tables.ts'

/**
 * A PICTURE, AND WHERE IT CAME FROM. Today an avatar and nothing else.
 *
 * TWO ORIGINS, AND THE DIFFERENCE IS THE POINT. `default` is drawn by this product from the
 * participant's id, the same drawing every time, and `licence_source` says so on the row — Mole
 * Office made it and Mole Office may publish it. `uploaded` is somebody's own file, stored under
 * `data/` where nothing in this repository is tracked, and `licence_source` is NULL because nobody
 * asked the person who uploaded it what its licence is and this product will not invent one.
 *
 * `path` IS NULL FOR A GENERATED PICTURE BECAUSE THERE IS NO FILE. The drawing is worked out from
 * the id, or from what the row says it is drawn from, when it is asked for. `bytes` is NULL for the
 * same reason: nothing measured a file that does not exist, and a length computed on the way past
 * would be a measurement of one run.
 */
export const assets = aPartTable(sqliteTable(
  'assets',
  {
    /** For an upload, a nanoid. For a generated picture, a name worked out from the participant. */
    id: text('id').primaryKey(),
    /** What the picture is for. `avatar` is the only kind today. */
    kind: text('kind').notNull(),
    /** `default` for one this product drew, `uploaded` for one somebody sent. */
    origin: text('origin').notNull(),
    /** Where the file is, relative to `data/`. NULL for a generated picture, which has no file. */
    path: text('path'),
    /** `image/png`, `image/jpeg`, `image/webp`, or `image/svg+xml` for a generated one. */
    mime: text('mime').notNull(),
    /** The stored file's size. NULL for a generated picture, which has no file to measure. */
    bytes: integer('bytes'),
    /** LOCAL wall clock. No SQL default, for the reason `reader_anchors` gives. */
    createdAt: text('created_at').notNull(),
    /** The participant who put it here, or NULL because nobody recorded one. */
    createdByKind: text('created_by_kind'),
    createdById: text('created_by_id'),
    /** Where the right to use it comes from. Written for a generated picture; NULL for an upload. */
    licenceSource: text('licence_source'),
    /**
     * The SHA-256 a generated picture is drawn from, once the re-mint has renamed it to a new id, migration 0337.
     * NULL means it is drawn from the participant its id names, and an upload always holds NULL.
     */
    drawnFrom: text('drawn_from'),
  },
  (t) => [
    index('assets_origin_idx').on(t.origin),
    check('assets_drawn_from_is_a_digest', sql`${t.drawnFrom} IS NULL OR (${t.origin} = 'default' AND length(${t.drawnFrom}) = 64 AND ${t.drawnFrom} NOT GLOB '*[^0-9a-f]*')`),
  ],
), { existingArchive: true })
