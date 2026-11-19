// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import type Database from 'better-sqlite3'
import type { TestDb } from './helpers.ts'
import { MIGRATIONS, journal, migrationsBefore, partialMigrations, scratch, type Scratch } from './migration-fixtures.ts'
export const syntheticAlias = { namespace: 'agent-registry', aliasId: 'archived-cobalt', canonicalId: 'CanonicalA1' } as const
export function inventedRegistry(t: TestDb): void { inventedRegistryIn(t.client.sqlite) }
function inventedRegistryIn(db: Database.Database): void {
  const asset = db.prepare('INSERT INTO assets (id, kind, origin, mime, created_at) VALUES (?, ?, ?, ?, ?)')
  for (const id of ['synthetic-asset-a', 'synthetic-asset-b']) asset.run(id, 'avatar', 'default', 'image/svg+xml', '2026-01-01 00:00:00')
  const insert = db.prepare('INSERT INTO agents (id, name, handle, avatar_asset_id, created_at, retired) VALUES (?, ?, ?, ?, ?, ?)')
  insert.run('CanonicalA1', 'Synthetic cobalt', 'current-cobalt', 'synthetic-asset-a', '2026-01-01 00:00:00', 1)
  insert.run('CanonicalB2', 'Synthetic reused address', syntheticAlias.aliasId, 'synthetic-asset-b', '2026-01-02 00:00:00', 0)
}
export async function aliasLibrary() { return import('../src/server/lib/registry-aliases/index.ts') }
export async function fileSyntheticAlias(t: TestDb) {
  const lib = await aliasLibrary()
  lib.fileRegistryAliases(t.client.sqlite, [syntheticAlias])
  return lib
}
export function rawHistory(t: TestDb) {
  return Object.fromEntries(['records', 'revisions', 'changes'].map(table => [table, t.client.sqlite.prepare(`SELECT * FROM ${table} ORDER BY id`).all()]))
}
/**
 * A DATABASE THAT NEVER HAD THE ALIAS MIGRATION: only the migrations before it ran, and the invented registry is filed
 * in it. A newer database cut back by hand is not one once a later migration exists, because that migration's tables
 * and triggers stay behind, and its second run fails on them.
 */
export async function aPreAliasDatabase(name: string): Promise<Scratch> {
  const { REGISTRY_ALIAS_MIGRATION_SLUG } = await aliasLibrary()
  const alias = journal(MIGRATIONS).find((entry) => entry.tag.endsWith('_' + REGISTRY_ALIAS_MIGRATION_SLUG))
  if (alias === undefined) throw new Error('drizzle/meta/_journal.json holds no registry alias migration')
  const { migrateInPlace } = await import('../src/server/db/migrate.ts')
  const s = scratch(name)
  migrateInPlace(s.db, partialMigrations(migrationsBefore(alias.tag)))
  inventedRegistryIn(s.db)
  return s
}
