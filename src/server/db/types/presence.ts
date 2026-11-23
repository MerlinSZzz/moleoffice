// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * TYPES THE DATABASE LAYER READS, FROM src/server/lib/presence.ts. They are declared here, as they were there, so
 * that src/server/db imports nothing from src/server/lib for them. That file re-exports them, so its importers are
 * unchanged.
 */

import type { SQL } from 'drizzle-orm'

/**
 * A READING OF SOME AGENTS ONLY (wave 13y round 51): the condition that keeps the session records of one project that
 * could be a run of theirs (`aSessionThatCouldBeOneOf`), and their registry ids.
 */
export interface TheseAgentsOnly {
  sessions: (workspaceId: string) => SQL
  ids: readonly string[]
}
