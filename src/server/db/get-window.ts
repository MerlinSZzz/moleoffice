// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `getWindow` was moved byte for byte out of src/server/lib/windows.ts, with no change of behaviour.
 * `toWindow` was moved byte for byte out of src/server/lib/windows.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import { eq } from 'drizzle-orm'
import type { WorkWindow, WindowState } from '@shared/planning.ts'
import { db } from './client.ts'
import { workWindows } from './schema.ts'
import type { WindowRow } from '../lib/windows.ts'

/** One window by id, or null. */
export function getWindow(id: string): WorkWindow | null {
  const row = db.select().from(workWindows).where(eq(workWindows.id, id)).get()
  return row === undefined ? null : toWindow(row)
}
export function toWindow(row: WindowRow): WorkWindow {
  return {
    id: row.id,
    recordId: row.recordId,
    startsOn: row.startsOn,
    endsOn: row.endsOn,
    note: row.note,
    state: row.state as WindowState,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}
