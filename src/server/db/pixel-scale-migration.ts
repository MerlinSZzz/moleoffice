// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import type Database from 'better-sqlite3'
import { generatePixelScale } from '../../shared/pixel-scale.ts'

export function migratePixelScale(sqlite: Database.Database): number {
  if (!(sqlite.prepare('PRAGMA table_info(agents)').all() as { name: string }[]).some(c => c.name === 'pixel_scale')) return 0
  const rows = sqlite.prepare('SELECT id, role FROM agents WHERE pixel_scale IS NULL').all() as { id: string; role: string | null }[]
  const save = sqlite.prepare('UPDATE agents SET pixel_scale = ? WHERE id = ? AND pixel_scale IS NULL')
  for (const row of rows) save.run(JSON.stringify(generatePixelScale(row.id, row.role)), row.id)
  return rows.length
}
