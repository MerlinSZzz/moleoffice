// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { sqlite } from '../db/client.ts'
import { PanelError } from './panel-error.ts'
import type { Actor } from './records.ts'
import { writeDownASettingChange } from './records/setting-changes.ts'

const settingName = (personId: string) => `reports.stars:${personId}`

export function reportStars(personId: string): string[] {
  const row = sqlite.prepare('SELECT value FROM runtime_settings WHERE name = ?').get(settingName(personId)) as { value: string } | undefined
  if (row === undefined) return []
  let value: unknown
  try { value = JSON.parse(row.value) } catch { throw new PanelError('The saved report stars cannot be read.', 500) }
  if (!Array.isArray(value) || value.some(id => typeof id !== 'string')) throw new PanelError('The saved report stars cannot be read.', 500)
  return value as string[]
}

export function setReportStar(actor: Actor, workspaceId: string, id: string, starred: boolean): string[] {
  return sqlite.transaction(() => {
    const before = reportStars(actor.id)
    const stars = new Set(before)
    if (starred) stars.add(id)
    else stars.delete(id)
    const result = [...stars]
    if (JSON.stringify(before) === JSON.stringify(result)) return result
    const name = settingName(actor.id)
    sqlite.prepare('INSERT INTO runtime_settings (name, value) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET value = excluded.value').run(name, JSON.stringify(result))
    writeDownASettingChange(actor, { setting: name, field: 'Report stars', before: { stars: before }, after: { stars: result }, workspaceId })
    return result
  })()
}
