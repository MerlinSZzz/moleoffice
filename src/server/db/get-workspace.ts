// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `getWorkspace` was moved byte for byte out of src/server/lib/workspaces.ts, with no change of behaviour.
 * `toWorkspace` was moved byte for byte out of src/server/lib/workspaces.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import { eq } from 'drizzle-orm'
import { db } from './client.ts'
import { workspaces } from './schema.ts'
import { type Workspace, reviewLevelOf } from '@shared/workspaces.ts'

/** One workspace by id, or null. Reads the registry and never the rows filed behind it. */
export function getWorkspace(id: string): Workspace | null {
  const row = db.select().from(workspaces).where(eq(workspaces.id, id)).get()
  return row === undefined ? null : toWorkspace(row)
}
/** One stored row as every reader gets it. THE ONE MAPPING — every route answers through this. */
export function toWorkspace(row: typeof workspaces.$inferSelect): Workspace {
  return {
    id: row.id,
    title: row.title,
    note: row.note,
    // WHAT IS STORED, NOT WHAT IS APPLIED. Null travels as null so a reader can tell "nobody has
    // chosen" from "somebody chose full". `theReviewLevel` below is what applies the level before
    // anybody chooses, and it is the only place that does.
    reviewLevel: row.reviewLevel === null ? null : reviewLevelOf(row.reviewLevel),
    packageInspection: row.packageInspection,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}
