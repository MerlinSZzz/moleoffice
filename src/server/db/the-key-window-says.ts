// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `theKeyWindowSays` was moved byte for byte out of src/server/lib/keywindow.ts, with no change of behaviour.
 * `alreadyRead` was moved byte for byte out of src/server/lib/keywindow.ts, with no change of behaviour.
 * `theKeyWindowPath` was moved byte for byte out of src/server/lib/keywindow.ts, with no change of behaviour.
 * `readTheKeyWindow` was moved byte for byte out of src/server/lib/keywindow.ts, with no change of behaviour.
 * `closedTheWindow` was moved byte for byte out of src/server/lib/keywindow.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import type { WhatTheKeyWindowSays, WindowClosedBy } from '@shared/keywindow.ts'
import { settings } from '../../config/settings.mjs'
import { sqlite } from './client.ts'
import type { WindowRow } from './types/keywindow.ts'

/** The cached reading, or the row read and kept for this database path. */
export function theKeyWindowSays(): WhatTheKeyWindowSays {
  const path = theKeyWindowPath()
  const held = alreadyRead.get(path)
  if (held !== undefined) return held
  const read = readTheKeyWindow()
  alreadyRead.set(path, read)
  return read
}
/** One closed window already read in this process, by its database path. */
export const alreadyRead = new Map<string, WhatTheKeyWindowSays>()
/** The path this process's window row belongs to, from the database path and nowhere else. */
export function theKeyWindowPath(): string {
  return settings().databasePath
}
/**
 * THE ROW AS IT IS ON DISK. No cache: the callers that want the cache use `theKeyWindowSays` below.
 *
 * AN ABSENT ROW IS AN OPEN WINDOW. The citizenship migration writes the one installation row, so in
 * a migrated database this branch is not reached; if it ever is, the honest reading is that no close
 * has been recorded, and the window has never been shut. It is not a guess about a fact the office
 * holds: it is the absence of the fact, and absence is a real answer.
 */
export function readTheKeyWindow(): WhatTheKeyWindowSays {
  const row = sqlite
    .prepare(
      'SELECT window_closed_at, window_closed_by_kind, window_closed_by_id FROM installation WHERE only_row = 1',
    )
    .get() as WindowRow | undefined
  if (row === undefined || row.window_closed_at === null) return { open: true, closedAt: null, closedBy: null }
  return {
    open: false,
    closedAt: row.window_closed_at,
    closedBy: closedTheWindow(row),
  }
}
/** Who closed it, from the two columns, or null because one of them and so the other was not written. */
export function closedTheWindow(row: WindowRow): WindowClosedBy | null {
  if (row.window_closed_by_kind === null || row.window_closed_by_id === null) return null
  return { kind: row.window_closed_by_kind, id: row.window_closed_by_id }
}
