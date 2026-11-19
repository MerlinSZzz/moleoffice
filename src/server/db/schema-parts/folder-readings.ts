// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { index, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { aPartTable } from '../part-tables.ts'

const existingArchive = { existingArchive: true } as const

/**
 * WHAT AN AGENT READ IN A FOLDER, BEFORE ANY OF IT IS A RECORD.
 *
 * Criterion I3. Somebody arrives with a folder full of code, notes and results and no Mole Office
 * project. An agent can read that folder faster and more patiently than a person can, and it must
 * not be allowed to file a hundred records nobody has looked at. So it files ONE row here, holding
 * every piece it would propose, and a person accepts, edits or rejects each piece on a page. Only
 * an accepted piece becomes a record.
 *
 * ---------------------------------------------------------------------------------------
 * WHY A TABLE AND NOT A RECORD
 * ---------------------------------------------------------------------------------------
 *
 * Because a draft is not work. Every record kind is something somebody is claiming about the
 * project, and a reading nobody has looked at is not a claim yet: it would appear in the open-loop
 * count, in the attention rule, in the bootstrap read and in every search, which is exactly the
 * flood this exists to prevent. It also has to hold things that are not records at all -- the file
 * a piece came from, the words in that file it rests on, and whether a person has looked at it.
 *
 * ---------------------------------------------------------------------------------------
 * THE PIECES ARE ONE JSON COLUMN, AND THAT IS DELIBERATE
 * ---------------------------------------------------------------------------------------
 *
 * A draft is read and written whole, by one person at one sitting, and it is finished when every
 * piece has been decided. A second table of pieces would buy per-piece queries nothing asks for and
 * would cost a join on every read. `FolderReadingPiece` in src/shared/folderreading.ts is the shape,
 * and it is one declaration the server validates against and the browser draws from.
 */
export const folderReadings = aPartTable(sqliteTable(
  'folder_readings',
  {
    /** nanoid. */
    id: text('id').primaryKey(),
    /** Which project the accepted pieces would land in. */
    workspaceId: text('workspace_id').notNull(),
    ownerId: text('owner_id').notNull(),
    /** `person` or `agent`: whose id `owner_id` is. NULL on a row written before migration 0311 that its data half could not tell. */
    ownerKind: text('owner_kind'),
    /** The folder that was read, by its whole path on this machine. */
    folder: text('folder').notNull(),
    /** Which agent read it, as the actor id it wrote under. */
    readBy: text('read_by').notNull(),
    /** `person` or `agent`: whose id `read_by` is. NULL on a row written before migration 0311 that its data half could not tell. */
    readByKind: text('read_by_kind'),
    /** What the agent says about the reading as a whole, including what it could not tell. */
    note: text('note'),
    /** Every piece, as a JSON array of `FolderReadingPiece`. */
    pieces: text('pieces', { mode: 'json' }).$type<unknown[]>().notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [index('folder_readings_workspace_idx').on(t.workspaceId)],
), existingArchive)
