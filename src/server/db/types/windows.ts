// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * TYPES THE DATABASE LAYER READS, FROM src/server/lib/windows.ts. They are declared here, as they were there, so
 * that src/server/db imports nothing from src/server/lib for them. That file re-exports them, so its importers are
 * unchanged.
 */

import type { workWindows } from '../schema.ts'

export type WindowRow = typeof workWindows.$inferSelect
