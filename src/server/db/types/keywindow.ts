// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * TYPES THE DATABASE LAYER READS, FROM src/server/lib/keywindow.ts. They are declared here, as they were there, so
 * that src/server/db imports nothing from src/server/lib for them. That file re-exports them, so its importers are
 * unchanged.
 */

/** How the columns read, exactly as SQLite hands them over. */
export interface WindowRow {
  window_closed_at: string | null
  window_closed_by_kind: string | null
  window_closed_by_id: string | null
}
