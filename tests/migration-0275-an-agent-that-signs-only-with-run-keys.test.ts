// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * MIGRATION 0273 ADDS THE MARK OF AN AGENT REGISTERED WITH NO KEY OF ITS OWN, AND LEAVES EVERY EXISTING AGENT UNMARKED.
 * Every row written before the column existed was registered the ordinary way, so it reads 0. The rows here are made
 * up.
 *
 * MUTATION PROOF (after a green control, each alone, restored with cp and checked with cmp, then green again): in the
 * commit that registers an agent with no key of its own (wave 13j, the round after the cut), which names its logs.
 */
import { describe, expect, it } from 'vitest'

import { migrateInPlace } from '../src/server/db/migrate.ts'
import { MIGRATIONS, columnNames, journal, partialMigrations, scratch } from './migration-fixtures.ts'

const TAG = '0273_an_agent_that_signs_only_with_run_keys'

describe('migration 0273 adds run_keys_only to the agents table', () => {
  it('reads 0 on every agent written before it', () => {
    const entries = journal(MIGRATIONS)
    const index = entries.findIndex((entry) => entry.tag === TAG)
    if (index <= 0) throw new Error(`drizzle/meta/_journal.json has no migration tagged ${TAG}`)

    const s = scratch('0273-run-keys-only')
    migrateInPlace(s.db, partialMigrations(index))
    expect(columnNames(s.db, 'agents')).not.toContain('run_keys_only')
    const picture = s.db.prepare(
      "INSERT INTO assets (id, kind, origin, path, mime, bytes, created_at, created_by_kind, created_by_id, licence_source) VALUES (?, 'avatar', 'default', NULL, 'image/svg+xml', NULL, '2026-10-15 10:00:00', NULL, NULL, 'generated')",
    )
    const agent = s.db.prepare("INSERT INTO agents (id, name, handle, avatar_asset_id, retired, created_at) VALUES (?, ?, ?, ?, ?, '2026-10-15 10:00:00')")
    for (const [id, retired] of [['made-up-agent-live', 0], ['made-up-agent-retired', 1]] as const) {
      picture.run(`avatar-${id}`)
      agent.run(id, id, id, `avatar-${id}`, retired)
    }
    migrateInPlace(s.db, partialMigrations(index + 1))

    expect(columnNames(s.db, 'agents')).toContain('run_keys_only')
    // AN EARLIER MIGRATION SEEDS THE OFFICE'S OWN ROW, so the made-up rows are not the only ones, and every row is asked.
    const rows = s.db.prepare('SELECT id, run_keys_only FROM agents ORDER BY id').all() as { id: string; run_keys_only: number }[]
    expect(rows).toEqual(expect.arrayContaining([
      { id: 'made-up-agent-live', run_keys_only: 0 },
      { id: 'made-up-agent-retired', run_keys_only: 0 },
    ]))
    expect(rows.filter((row) => row.run_keys_only !== 0)).toEqual([])
  })
})
