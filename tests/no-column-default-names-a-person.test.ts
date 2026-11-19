// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * NO COLUMN IN A FRESH DATABASE HAS A DEFAULT THAT NAMES A PERSON.
 *
 * The inventory's item FLO-16, answered by the owner on 30 September 2026: the
 * column defaults that named the owner go, through a new migration, and the code always writes the owner
 * itself. The owner migration `the_owner_comes_from_the_installer` already did this: it rebuilt the
 * tables whose columns defaulted to the owner's id (records.owner_id, links.owner_id, links.created_by and the
 * two tables that hung off them) without the default. tests/the-owner-comes-from-the-installer.test.ts
 * proves those three columns. This file holds the rule for every column, so a later migration that adds
 * a person's id as a default goes red here.
 *
 * It migrates a fresh database the product's own way (`freshDb` runs `migrateInPlace`), reads every
 * column's default from SQLite, and refuses any default that is the owner's id, the old built-in id
 * that named the owner, or the id a new office gives its owner when nothing said, `owner`. The old
 * built-in id is read from the first migration, which wrote it, so this file names nobody.
 *
 * MUTATION PROOF (after a green control): put the old built-in id back as the default of records.owner_id in the owner
 * migration's rebuild of `records`. This case is red, naming the column.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'

/** The old built-in id: the one default the first migration gave the owner columns. */
function theOldBuiltInId(): string {
  const journal = JSON.parse(readFileSync(join('drizzle', 'meta', '_journal.json'), 'utf8')) as { entries: { tag: string }[] }
  const first = join('drizzle', `${journal.entries[0]?.tag ?? 'the journal has no entry'}.sql`)
  const ids = new Set([...readFileSync(first, 'utf8').matchAll(/`(?:owner_id|created_by)` text DEFAULT '([^']+)'/g)].map((found) => found[1]))
  if (ids.size !== 1) throw new Error(`${first} should give the owner columns one default between them, and gives ${String(ids.size)}`)
  return [...ids][0]!
}

let t: TestDb

beforeAll(async () => {
  t = await freshDb()
}, 120_000)

afterAll(() => {
  t?.close()
})

describe('a fresh database', () => {
  it('has no column whose default names a person', async () => {
    const { theOfficeOwner } = await import('../src/server/lib/owner.ts')
    const people = new Set([theOldBuiltInId(), 'owner', theOfficeOwner().id])
    const sqlite = t.client.sqlite
    const tables = (sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all() as { name: string }[]).map((r) => r.name)
    const found: string[] = []
    let columns = 0
    for (const table of tables) {
      for (const column of sqlite.prepare(`SELECT name, dflt_value AS def FROM pragma_table_info(?)`).all(table) as { name: string; def: string | null }[]) {
        columns += 1
        if (column.def === null) continue
        const value = column.def.replace(/^['"]|['"]$/g, '')
        if (people.has(value)) found.push(`${table}.${column.name} defaults to ${column.def}`)
      }
    }
    expect(columns, 'the scan read no columns, so it proved nothing').toBeGreaterThan(100)
    expect(found).toEqual([])
  })
})
