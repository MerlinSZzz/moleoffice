// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * TYPES THE DATABASE LAYER READS, FROM src/server/lib/keys.ts. They are declared here, as they were there, so
 * that src/server/db imports nothing from src/server/lib for them. That file re-exports them, so its importers are
 * unchanged.
 */

/** One key row looked up by its hash, standing or not. The id is public; the hash is not the token. */
export interface AHeldKeyRow {
  id: string
  whoseKind: string
  whoseId: string
  revokedAt: string | null
}
