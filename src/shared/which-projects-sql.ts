// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SQL CONDITION FOR WHICH PROJECTS A READ COVERS.
 * `narrowedToProjects` was moved byte for byte out of src/server/lib/workspaces.ts, with no change of
 * behaviour. That file re-exports it. It builds a drizzle condition, so it has a file of its own.
 */

import { eq, type SQL } from 'drizzle-orm'
import type { AnySQLiteColumn } from 'drizzle-orm/sqlite-core'
import type { WhichProjects } from './which-projects.ts'

/**
 * The condition that narrows a query to those projects, or nothing at all when it covers them.
 *
 * `undefined` is what drizzle's `and()` drops, so a caller writes `and(narrowedToProjects(...), …)`
 * once and does not branch. The column is passed in because the workspace lives on `records` for a
 * message and on `agent_threads` for a run.
 */
export function narrowedToProjects(column: AnySQLiteColumn, which: WhichProjects): SQL | undefined {
  return 'oneProject' in which ? eq(column, which.oneProject) : undefined
}
