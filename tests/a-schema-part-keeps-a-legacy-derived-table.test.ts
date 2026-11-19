// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { describe, expect, it } from 'vitest'
import { sqliteTable, text, type SQLiteTable } from 'drizzle-orm/sqlite-core'
import { aPartTable, thePartTables } from '../src/server/db/part-tables.ts'

const aDerived = (name: string) => aPartTable(sqliteTable(name, { id: text('id').primaryKey() }), { existingDerived: true } as unknown as Parameters<typeof aPartTable>[1])
const readParts = thePartTables as unknown as (
  parts: ReadonlyMap<string, Readonly<Record<string, unknown>>>,
  names: readonly string[],
  archives: ReadonlyMap<string, SQLiteTable>,
  derived: ReadonlyMap<string, SQLiteTable>,
  legacyDerivedNames: readonly string[],
) => ReturnType<typeof thePartTables>

describe('a schema part using a legacy derived table', () => {
  it('leaves the exact legacy-derived table out of archive and restore parts', () => {
    const table = aDerived('old_derived')
    expect(readParts(new Map([['part', { table }]]), ['old_derived'], new Map(), new Map([['old_derived', table]]), ['old_derived'])).toEqual([])
  })
  it('refuses a derived bridge mixed with generic archive and restore answers', () => {
    const table = aPartTable(sqliteTable('old_derived', { id: text('id').primaryKey() }), {
      existingDerived: true, exported: false, restore: 'not in this proof', why: 'not written',
    } as unknown as Parameters<typeof aPartTable>[1])
    expect(() => readParts(new Map([['part', { table }]]), ['old_derived'], new Map(), new Map([['old_derived', table]]), ['old_derived'])).toThrow('mixes a legacy bridge')
  })
  it('refuses a derived bridge with even a false authored bridge', () => {
    const table = aPartTable(sqliteTable('old_derived', { id: text('id').primaryKey() }), {
      existingDerived: true, existingArchive: false,
    } as unknown as Parameters<typeof aPartTable>[1])
    expect(() => readParts(new Map([['part', { table }]]), ['old_derived'], new Map(), new Map([['old_derived', table]]), ['old_derived'])).toThrow('mixes a legacy bridge')
  })
  it('refuses a different object with the same name', () => {
    const table = aDerived('old_derived')
    expect(() => readParts(new Map([['part', { table }]]), ['old_derived'], new Map(), new Map([['old_derived', aDerived('old_derived')]]), ['old_derived'])).toThrow('old_derived')
  })
  it('refuses an unclassified name and a name shared with another classification', () => {
    const table = aDerived('old_derived')
    const parts = new Map([['part', { table }]])
    const derived = new Map([['old_derived', table]])
    expect(() => readParts(parts, ['old_derived'], new Map(), derived, [])).toThrow('old_derived')
    expect(() => readParts(parts, ['old_derived', 'old_derived'], new Map(), derived, ['old_derived'])).toThrow('old_derived')
    expect(() => readParts(parts, ['old_derived'], new Map([['old_derived', table]]), derived, ['old_derived'])).toThrow('old_derived')
  })
  it('refuses contradictory authored and derived declarations on one table', () => {
    const table = aPartTable(sqliteTable('old_derived', { id: text('id').primaryKey() }), { existingArchive: true, existingDerived: true } as unknown as Parameters<typeof aPartTable>[1])
    expect(() => readParts(new Map([['part', { table }]]), ['old_derived'], new Map([['old_derived', table]]), new Map([['old_derived', table]]), ['old_derived'])).toThrow('old_derived')
  })
  it('refuses duplicate declarations for one legacy-derived name', () => {
    const table = aDerived('old_derived')
    expect(() => readParts(new Map([['part', { table, duplicate: aDerived('old_derived') }]]), ['old_derived'], new Map(), new Map([['old_derived', table]]), ['old_derived'])).toThrow('declared 2 times')
  })
})
