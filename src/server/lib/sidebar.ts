// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { createHash } from 'node:crypto'
import { SHIPPED_SIDEBAR, problemsWithTheArrangement, type SidebarArrangement } from '@shared/sidebar-arrangement.ts'
import { sqlite } from '../db/client.ts'

export const SIDEBAR_SETTING = 'office.sidebar'
export interface SidebarSetting {
  arrangement: SidebarArrangement
  shipped: SidebarArrangement
  version: string
  changed: boolean
  reminders: string[]
  storedButNotUsed: { arrangement: unknown; problems: string[] } | null
}
let current: SidebarSetting
/** Read at start and after a write. Navigation never queries the database per page. */
export function loadSidebarArrangement(): SidebarSetting {
  const row = sqlite.prepare('SELECT value FROM runtime_settings WHERE name = ?').get(SIDEBAR_SETTING) as { value: string } | undefined
  let stored: unknown = null
  let problems: string[] = []
  if (row !== undefined) {
    try { stored = JSON.parse(row.value) }
    catch { stored = row.value; problems = ['The stored sidebar arrangement is not readable JSON.'] }
    if (problems.length === 0) problems = problemsWithTheArrangement(stored).problems
  }
  const arrangement = row !== undefined && problems.length === 0 ? { groups: (stored as SidebarArrangement).groups.map(group => ({ key: group.key, keys: [...group.keys] })) } : SHIPPED_SIDEBAR
  const latest = sqlite.prepare("SELECT * FROM changes WHERE record_id = 'setting:sidebar' ORDER BY rowid DESC LIMIT 1").get()
  current = {
    arrangement, shipped: SHIPPED_SIDEBAR,
    version: createHash('sha256').update(JSON.stringify(arrangement) + ':' + JSON.stringify(latest ?? null)).digest('hex'),
    changed: row !== undefined,
    reminders: problemsWithTheArrangement(arrangement).reminders,
    storedButNotUsed: row !== undefined && problems.length > 0 ? { arrangement: stored, problems } : null,
  }
  return sidebarSetting()
}
/** A caller cannot change the cached setting by mutating a reply. */
export function sidebarSetting(): SidebarSetting {
  const setting = structuredClone(current)
  // Word edits change the names in these sentences without changing the arrangement or its version.
  setting.reminders = problemsWithTheArrangement(setting.arrangement).reminders
  if (setting.storedButNotUsed !== null && typeof setting.storedButNotUsed.arrangement === 'object') setting.storedButNotUsed.problems = problemsWithTheArrangement(setting.storedButNotUsed.arrangement).problems
  return setting
}
