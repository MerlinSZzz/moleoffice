// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * TYPES THE DATABASE LAYER READS, FROM src/server/lib/repositories.ts. They are declared here, as they were there, so
 * that src/server/db imports nothing from src/server/lib for them. That file re-exports them, so its importers are
 * unchanged.
 */

/** One repository, as every reader gets it. */
export interface Repository {
  id: string
  workspaceId: string
  /** What a person reads. Unique inside a workspace; see `registerRepository`. */
  name: string
  /** What this repository holds, in the words of whoever registered it. */
  note: string | null
  /**
   * The absolute path on THIS machine, or null because there is no checkout of it here.
   *
   * NULL IS A REAL ANSWER and not a missing value. A repository with no root can hold
   * relationships, can be read and can be drawn; it cannot be scanned, and every read that would
   * have needed a scan says so in those words rather than answering empty.
   */
  root: string | null
  createdAt: string
  updatedAt: string
  createdBy: string
}

export interface RepoRow {
  id: string
  workspace_id: string
  name: string
  note: string | null
  root: string | null
  created_at: string
  updated_at: string
  created_by: string
}
