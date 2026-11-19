// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `theReviewLevel` was moved byte for byte out of src/server/lib/workspaces.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import { eq } from 'drizzle-orm'
import { db } from './client.ts'
import { workspaces } from './schema.ts'
import { reviewLevelOf, type ReviewLevel } from '@shared/workspaces.ts'

/**
 * HOW MUCH REVIEW A FINISHED RUN IN THIS PROJECT GETS.
 *
 * THE ONE PLACE THE LEVEL IS WORKED OUT, so the door that starts a check, the door that seals a
 * finish and the screen cannot come to three different answers. It always answers one of the three
 * words: a project nobody has chosen for is at `full`, which is what the office does today.
 *
 * A PROJECT THAT IS NOT IN THE REGISTRY READS AS `full` RATHER THAN THROWING. Every write door
 * already refuses an unknown workspace through `requireWorkspace`, so nothing reaches here with one.
 * If something ever does, the answer that leaves the inspector running is the one that hides
 * nothing.
 */
export function theReviewLevel(workspaceId: string): ReviewLevel {
  const row = db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).get()
  return reviewLevelOf(row?.reviewLevel ?? null)
}
