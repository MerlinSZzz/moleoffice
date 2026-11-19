// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN AGENT READ BY ITS STORED ID IS ONE STATEMENT, WITH AN ALIAS FILED OR NOT (wave 13s, round 141).
 *
 * Round 139b made every read of an agent by its stored id ask first whether a permanent typed alias owns the id. The ask
 * ran PRAGMA schema_version and a SELECT before the read of the agents row, and the first ask on a database handle read
 * sqlite_schema as well. GET /api/after-a-compaction ran 46 statements where it may run 40, a first release of a resource
 * ran one statement more than the second, and the waiting list prepared the ask once for each of its rows. The id, the
 * alias that may own it and what the lookup refuses are read in one kept statement now.
 *
 * The lookup still refuses what round 139b's refused: two aliases that own one source, an alias whose target is an alias,
 * an alias source that is also a registry id, and a target with no agents row. The triggers of migration 0305 stop each
 * of these from being written, so this file takes the triggers out of its own test database to make each one.
 *
 * The alias table is kept as found for the handle's life, and only once it has been found. A handle that read a database
 * from before migration 0305 finds the table the migration makes later, and follows an alias filed in it.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'
import { aPreAliasDatabase, aliasLibrary, fileSyntheticAlias, inventedRegistry, syntheticAlias } from './registry-alias-fixture.ts'

let t: TestDb
beforeEach(async () => { t = await freshDb(); inventedRegistry(t) })
afterEach(() => t?.close())

const references = () => import('../src/server/lib/agent-references.ts')

/** Every statement `work` runs, pragmas included, and every statement it prepares on the test database. */
function counted(work: () => unknown): { ran: string[]; prepared: string[] } {
  const db = t.client.sqlite as unknown as { prepare: (sql: string) => object }
  const prototype = Object.getPrototypeOf(db.prepare('SELECT 1')) as Record<string, (...args: unknown[]) => unknown>
  const originals = Object.fromEntries(['run', 'get', 'all', 'iterate'].map((name) => [name, prototype[name]!]))
  const ran: string[] = []
  const prepared: string[] = []
  for (const [name, original] of Object.entries(originals)) {
    prototype[name] = function (this: { source: string }, ...args: unknown[]) {
      ran.push(this.source)
      return original.apply(this, args)
    }
  }
  const prepare = db.prepare
  db.prepare = function (this: unknown, sql: string) {
    prepared.push(sql)
    return prepare.call(this, sql)
  }
  try {
    work()
  } finally {
    Object.assign(prototype, originals)
    delete (db as { prepare?: unknown }).prepare
  }
  return { ran, prepared }
}

/** What SQLite says it will do for a statement the lookup ran. */
function thePlanOf(sql: string): string {
  const statement = t.client.sqlite.prepare(`EXPLAIN QUERY PLAN ${sql}`)
  const rows = (sql.includes('@id') ? statement.all({ id: 'asked' }) : statement.all('asked')) as { detail: string }[]
  return rows.map((row) => row.detail).join('\n')
}

/** Takes migration 0305's triggers, its check constraints and the foreign keys out of this test database. */
function withoutTheGuards(): void {
  const db = t.client.sqlite
  const triggers = db.prepare("SELECT name FROM sqlite_schema WHERE type = 'trigger' AND name LIKE 'registry_aliases%'").all() as { name: string }[]
  expect(triggers.length).toBeGreaterThan(0)
  for (const { name } of triggers) db.exec(`DROP TRIGGER "${name}"`)
  db.pragma('ignore_check_constraints = ON')
  db.pragma('foreign_keys = OFF')
}

describe('an agent read by its stored id', () => {
  it('runs one statement with no alias filed, and prepares none after the first read', async () => {
    const { theAgentWithThisId } = await references()
    theAgentWithThisId(t.client.sqlite, 'CanonicalB2')
    for (const [id, expected] of [['CanonicalB2', { id: 'CanonicalB2', handle: syntheticAlias.aliasId }], ['NoSuchAgent', null]] as const) {
      const read = counted(() => expect(theAgentWithThisId(t.client.sqlite, id), id).toEqual(expected === null ? null : expect.objectContaining(expected)))
      expect(read.ran, id).toHaveLength(1)
      expect(read.prepared, id).toEqual([])
    }
  })

  it('runs one statement for an old id and for its new id, which name the same row', async () => {
    const lib = await fileSyntheticAlias(t)
    const { theAgentWithThisId } = await references()
    theAgentWithThisId(t.client.sqlite, syntheticAlias.canonicalId)
    lib.registryAliasTarget(t.client.sqlite, { namespace: 'agent-registry', id: syntheticAlias.aliasId })
    for (const id of [syntheticAlias.aliasId, syntheticAlias.canonicalId]) {
      const read = counted(() => expect(theAgentWithThisId(t.client.sqlite, id), id).toMatchObject({ id: 'CanonicalA1', handle: 'current-cobalt' }))
      expect(read.ran, id).toHaveLength(1)
      expect(read.prepared, id).toEqual([])
    }
    const asked = counted(() => expect(lib.registryAliasTarget(t.client.sqlite, { namespace: 'agent-registry', id: syntheticAlias.aliasId })).toBe('CanonicalA1'))
    expect(asked.ran).toHaveLength(1)
    expect(asked.prepared).toEqual([])
  })

  it('answers an id that is blank once trimmed with nobody, and runs no statement for it', async () => {
    const { theAgentWithThisId } = await references()
    for (const id of ['', '   ', '\t\n']) {
      const read = counted(() => expect(theAgentWithThisId(t.client.sqlite, id), JSON.stringify(id)).toBeNull())
      expect(read.ran, JSON.stringify(id)).toEqual([])
    }
    expect(theAgentWithThisId(t.client.sqlite, ' CanonicalB2 ')).toMatchObject({ id: 'CanonicalB2', handle: syntheticAlias.aliasId })
  })

  it('runs no statement more for the first read on a database handle than for the second', async () => {
    const { theAgentWithThisId } = await references()
    const first = counted(() => theAgentWithThisId(t.client.sqlite, 'CanonicalB2'))
    const second = counted(() => theAgentWithThisId(t.client.sqlite, 'CanonicalB2'))
    expect(first.ran).toEqual(second.ran)
  })

  it('searches agents by its primary key, with no alias filed and with one filed', async () => {
    const { theAgentWithThisId } = await references()
    for (const filed of [false, true]) {
      if (filed) await fileSyntheticAlias(t)
      for (const id of [syntheticAlias.aliasId, syntheticAlias.canonicalId]) {
        const plans = counted(() => theAgentWithThisId(t.client.sqlite, id)).ran.filter((sql) => /\bagents\b/.test(sql)).map(thePlanOf)
        expect(plans.length, `${id}, filed ${String(filed)}`).toBeGreaterThan(0)
        for (const plan of plans) {
          expect(plan, `${id}, filed ${String(filed)}`).toMatch(/SEARCH agents USING (COVERING )?INDEX sqlite_autoindex_agents_1 \(id=\?\)/)
          expect(plan, `${id}, filed ${String(filed)}`).not.toMatch(/SCAN agents/)
        }
      }
    }
  })

  it.each([
    ['two aliases that own one source', syntheticAlias.aliasId, "INSERT INTO registry_aliases (namespace, alias_id, canonical_id) VALUES ('asset', 'archived-cobalt', 'CanonicalB2')", 'more than one typed alias owns this source'],
    ['an alias whose target is an alias', 'older-cobalt', "INSERT INTO registry_aliases (namespace, alias_id, canonical_id) VALUES ('agent-registry', 'older-cobalt', 'archived-cobalt')", 'a target is an alias rather than a canonical id'],
    ['an alias source that is also a registry id', 'CanonicalB2', "INSERT INTO registry_aliases (namespace, alias_id, canonical_id) VALUES ('agent-registry', 'CanonicalB2', 'CanonicalA1')", 'an alias source is also a registry id'],
    ['an alias target with no agents row', 'lost-cobalt', "INSERT INTO registry_aliases (namespace, alias_id, canonical_id) VALUES ('agent-registry', 'lost-cobalt', 'NoSuchAgent')", 'an alias target is orphaned'],
  ])('refuses %s, in the read of the agent and in the alias lookup', async (_name, asked, broken, reason) => {
    const lib = await fileSyntheticAlias(t)
    const { theAgentWithThisId } = await references()
    withoutTheGuards()
    t.client.sqlite.exec(broken)
    expect(() => theAgentWithThisId(t.client.sqlite, asked)).toThrow(lib.RegistryAliasError)
    expect(() => theAgentWithThisId(t.client.sqlite, asked)).toThrow(reason)
    expect(() => lib.registryAliasTarget(t.client.sqlite, { namespace: 'agent-registry', id: asked })).toThrow(reason)
  })

  it('refuses a database whose migration made the alias table it no longer has, and reads one from before that migration by the agents row', async () => {
    const lib = await aliasLibrary()
    const { theAgentWithThisId } = await references()
    withoutTheGuards()
    t.client.sqlite.exec('DROP TABLE registry_aliases')
    expect(() => theAgentWithThisId(t.client.sqlite, 'CanonicalB2')).toThrow(lib.RegistryAliasError)
    expect(() => theAgentWithThisId(t.client.sqlite, 'CanonicalB2')).toThrow('requires the missing registry_aliases table')
    t.client.sqlite.prepare('DELETE FROM __drizzle_migrations WHERE created_at >= ?').run(lib.registryAliasMigrationWhen())
    expect(theAgentWithThisId(t.client.sqlite, 'CanonicalB2')).toMatchObject({ id: 'CanonicalB2', handle: syntheticAlias.aliasId })
    expect(lib.registryAliasTarget(t.client.sqlite, { namespace: 'agent-registry', id: 'CanonicalB2' })).toBeNull()
  })

  it('finds the alias table a migration made after the handle\'s first read, and follows an alias filed in it', async () => {
    const lib = await aliasLibrary()
    const { theAgentWithThisId } = await references()
    const { migrateInPlace } = await import('../src/server/db/migrate.ts')
    const { db } = await aPreAliasDatabase('alias-lookup')
    expect(theAgentWithThisId(db, syntheticAlias.aliasId)).toBeNull()
    expect(lib.registryAliasTarget(db, { namespace: 'agent-registry', id: syntheticAlias.aliasId })).toBeNull()
    migrateInPlace(db)
    lib.fileRegistryAliases(db, [syntheticAlias])
    expect(theAgentWithThisId(db, syntheticAlias.aliasId)).toMatchObject({ id: 'CanonicalA1', handle: 'current-cobalt' })
    expect(lib.registryAliasTarget(db, { namespace: 'agent-registry', id: syntheticAlias.aliasId })).toBe('CanonicalA1')
  })
})
