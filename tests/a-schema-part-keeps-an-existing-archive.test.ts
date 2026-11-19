// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { describe, expect, it } from 'vitest'
import { sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { aPartTable, thePartTables } from '../src/server/db/part-tables.ts'

function oldTable(name: string) {
  return aPartTable(sqliteTable(name, { id: text('id').primaryKey() }), { existingArchive: true })
}

describe('a schema part using an existing authored archive', () => {
  it('keeps its reserved name and does not add a generic region', () => {
    const table = oldTable('old_table')
    expect(thePartTables(new Map([['part', { table }]]), ['old_table'], new Map([['old_table', table]]))).toEqual([])
  })
  it('refuses an authored bridge mixed with generic archive and restore answers', () => {
    const table = aPartTable(sqliteTable('old_table', { id: text('id').primaryKey() }), {
      existingArchive: true, exported: false, restore: 'not in this proof', why: 'not written',
    } as unknown as Parameters<typeof aPartTable>[1])
    expect(() => thePartTables(new Map([['part', { table }]]), ['old_table'], new Map([['old_table', table]]))).toThrow('mixes a legacy bridge')
  })
  it('refuses an authored bridge with even a false derived bridge', () => {
    const table = aPartTable(sqliteTable('old_table', { id: text('id').primaryKey() }), {
      existingArchive: true, existingDerived: false,
    } as unknown as Parameters<typeof aPartTable>[1])
    expect(() => thePartTables(new Map([['part', { table }]]), ['old_table'], new Map([['old_table', table]]))).toThrow('mixes a legacy bridge')
  })
  it('refuses a claim to an unregistered old archive or a different table with that name', () => {
    const table = oldTable('old_table')
    expect(() => thePartTables(new Map([['part', { table }]]), [], new Map())).toThrow('old_table')
    expect(() => thePartTables(new Map([['part', { table }]]), ['old_table'], new Map([['old_table', oldTable('old_table')]]))).toThrow('old_table')
  })
  it('refuses an authored name reserved twice', () => {
    const table = oldTable('old_table')
    const parts = new Map([['part', { table }]])
    const archives = new Map([['old_table', table]])
    expect(() => thePartTables(parts, ['old_table', 'old_table'], archives)).toThrow('old_table')
  })
  it('refuses an authored name in the derived table map', () => {
    const table = oldTable('old_table')
    const parts = new Map([['part', { table }]])
    const archives = new Map([['old_table', table]])
    expect(() => thePartTables(parts, ['old_table'], archives, new Map([['old_table', table]]))).toThrow('old_table')
  })
  it('refuses an authored name in the legacy derived list', () => {
    const table = oldTable('old_table')
    const parts = new Map([['part', { table }]])
    const archives = new Map([['old_table', table]])
    expect(() => thePartTables(parts, ['old_table'], archives, new Map(), ['old_table'])).toThrow('old_table')
  })
  it('still refuses two declarations for one reserved name', () => {
    const one = oldTable('old_table')
    const two = oldTable('old_table')
    expect(() => thePartTables(new Map([['part', { one, two }]]), ['old_table'], new Map([['old_table', one]]))).toThrow('old_table')
  })
})
