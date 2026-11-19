// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import type Database from 'better-sqlite3'

/** Set the same agent owner on either version of the test office's registry. */
export function setFixtureOwner(db: Database.Database, owner: string | null, target: string, field: 'id' | 'handle' = 'id'): void {
  const columns = db.prepare('PRAGMA table_info(agents)').all() as { name: string }[]
  const where = field === 'id' ? 'id' : 'handle'
  if (columns.some((column) => column.name === 'owner_kind')) {
    db.prepare(`UPDATE agents SET owner_id = ?, owner_kind = CASE WHEN ? IS NULL THEN NULL ELSE 'agent' END WHERE ${where} = ?`).run(owner, owner, target)
  } else {
    db.prepare(`UPDATE agents SET owner_id = ? WHERE ${where} = ?`).run(owner, target)
  }
}
