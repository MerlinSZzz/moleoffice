// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { setFixtureOwner } from './agent-owner-fixture.ts'
import { describe, expect, it } from 'vitest'
import { columnNames, journal, MIGRATIONS, partialMigrations, scratch } from './migration-fixtures.ts'

describe('the ownership migration', () => {
  it('preserves every old agent and takes a person or agent starter as its first owner', async () => {
    const tag = journal(MIGRATIONS).find((entry) => entry.tag.endsWith('_an_agent_keeps_its_owner_apart'))?.tag
    expect(tag).toBeDefined()
    const index = journal(MIGRATIONS).findIndex((entry) => entry.tag === tag)
    expect(index).toBeGreaterThan(0)
    const { migrateInPlace } = await import('../src/server/db/migrate.ts')
    const db = scratch('agent-owner').db
    migrateInPlace(db, partialMigrations(index))
    const columnsBefore = columnNames(db, 'agents')
    expect(columnsBefore).not.toContain('owner_id')
    expect(columnsBefore).not.toContain('owner_kind')

    const picture = db.prepare(
      "INSERT INTO assets (id, kind, origin, path, mime, bytes, created_at, created_by_kind, created_by_id, licence_source) VALUES (?, 'avatar', 'default', NULL, 'image/svg+xml', NULL, ?, NULL, NULL, 'generated')",
    )
    const add = db.prepare(
      'INSERT INTO agents (id, name, handle, avatar_asset_id, retired, created_at, started_by_kind, started_by_id) VALUES (?, ?, ?, ?, 0, ?, ?, ?)',
    )
    const at = '2020-01-01 00:00:00'
    for (const [id, kind, starter] of [
      ['test-agent-starter', null, null],
      ['test-agent-child', 'agent', 'test-agent-starter'],
      ['test-handle-child', 'agent', 'older-handle'],
      ['test-old-id-child', 'agent', 'older-id'],
      ['test-person-child', 'person', 'test-person'],
      ['test-no-starter', null, null],
    ] as const) {
      picture.run(`picture-${id}`, at)
      add.run(id, id, id, `picture-${id}`, at, kind, starter)
    }
    // Bring the synthetic rows through the older data steps before taking the pre-migration snapshot.
    migrateInPlace(db, partialMigrations(index))
    const before = db.prepare('SELECT * FROM agents ORDER BY id').all() as Record<string, unknown>[]
    const oldWithoutAgentStarter = before.filter((row) => row['started_by_kind'] !== 'agent').length
    expect(oldWithoutAgentStarter).toBeGreaterThanOrEqual(3)

    const applied = migrateInPlace(db, partialMigrations(index + 1))
    expect(applied.agentOwners.ran).toBe(true)
    expect(columnNames(db, 'agents')).toEqual([...columnsBefore, 'owner_id', 'owner_kind'])
    const after = db.prepare('SELECT * FROM agents ORDER BY id').all() as Record<string, unknown>[]
    expect(after.map(({ owner_id: _owner, owner_kind: _kind, ...rest }) => rest)).toEqual(before)
    for (const row of after) {
      expect(row['owner_id']).toBe(row['started_by_id'])
      expect(row['owner_kind']).toBe(row['started_by_id'] === null ? null : row['started_by_kind'])
    }
    expect(after.find((row) => row['id'] === 'test-agent-child')?.['owner_id']).toBe('test-agent-starter')
    expect(after.find((row) => row['id'] === 'test-handle-child')?.['owner_id']).toBe('older-handle')
    expect(after.find((row) => row['id'] === 'test-old-id-child')?.['owner_id']).toBe('older-id')
    expect(after.find((row) => row['id'] === 'test-person-child')).toMatchObject({ owner_kind: 'person', owner_id: 'test-person' })
    expect(after.find((row) => row['id'] === 'test-no-starter')?.['owner_id']).toBeNull()

    // A later row and a later handover must not be changed by another migration run.
    setFixtureOwner(db, 'new-owner', 'test-agent-child', 'id')
    picture.run('picture-test-late-child', at)
    add.run('test-late-child', 'test-late-child', 'test-late-child', 'picture-test-late-child', at, 'agent', 'test-agent-starter')
    const repeated = migrateInPlace(db, partialMigrations(index + 1))
    expect(repeated.agentOwners.ran).toBe(false)
    expect((db.prepare('SELECT owner_id FROM agents WHERE id = ?').get('test-agent-child') as { owner_id: string }).owner_id).toBe('new-owner')
    expect((db.prepare('SELECT owner_id FROM agents WHERE id = ?').get('test-late-child') as { owner_id: string | null }).owner_id).toBeNull()
  })
})
