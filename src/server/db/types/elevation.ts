// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * TYPES THE DATABASE LAYER READS, FROM src/server/lib/elevation.ts. They are declared here, as they were there, so
 * that src/server/db imports nothing from src/server/lib for them. That file re-exports them, so its importers are
 * unchanged.
 */

export interface SessionRunRow {
  id?: unknown
  serving?: unknown
  started?: unknown
}
