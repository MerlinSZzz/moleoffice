// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { getTableName } from 'drizzle-orm'
import { getTableConfig, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { describe, expect, it } from 'vitest'
import { aPartTable, thePartTables } from '../src/server/db/part-tables.ts'
import * as schema from '../src/server/db/schema.ts'
import * as parts from '../src/server/db/schema-parts/index.ts'

const measuredTable = () => aPartTable(sqliteTable('old_measured', { id: text('id').primaryKey() }), { existingMeasured: true })

describe('a schema part using an existing measured table', () => {
  it('keeps the exact table outside generic archive and restore regions', () => {
    const table = measuredTable()
    const input = new Map([['part', { table }]])
    expect(thePartTables(input, ['old_measured'], new Map(), new Map(), [], new Map([['old_measured', table]]), ['old_measured'])).toEqual([])
    expect(() => thePartTables(input, ['old_measured'], new Map(), new Map(), [], new Map([['old_measured', measuredTable()]]), ['old_measured'])).toThrow('old_measured')
    expect(() => thePartTables(input, ['old_measured'], new Map(), new Map(), [], new Map([['old_measured', table]]), [])).toThrow('old_measured')
    expect(() => thePartTables(input, ['old_measured'], new Map([['old_measured', table]]), new Map(), [], new Map([['old_measured', table]]), ['old_measured'])).toThrow('old_measured')
  })

  it('refuses a bridge mixed with another classification or a generic answer', () => {
    for (const extra of [{ existingDerived: false }, { exported: false, restore: 'not in this proof', why: 'none' }]) {
      const table = aPartTable(sqliteTable('old_measured', { id: text('id') }), { existingMeasured: true, ...extra } as unknown as Parameters<typeof aPartTable>[1])
      expect(() => thePartTables(new Map([['part', { table }]]), ['old_measured'], new Map(), new Map(), [], new Map([['old_measured', table]]), ['old_measured'])).toThrow('mixes a legacy bridge')
    }
  })

  it('keeps the facade identities, measured names, and existing foreign key', () => {
    const bindings = ['apiCalls', 'heldKeys', 'runTokens', 'headerOnlyCalls', 'hourlyCalls', 'outsideReads', 'usageStretches', 'usageChecks'] as const
    const partNames = new Set(schema.everyPartTable().map((part) => part.name))
    for (const binding of bindings) {
      const table = parts[binding]
      const name = getTableName(table)
      expect(schema[binding]).toBe(table)
      expect(schema.MEASURED_TABLES).toContain(name)
      expect(partNames.has(name)).toBe(false)
    }
    expect(parts.heldKeys.whoseId.name).toBe('whose_id')
    const [foreignKey] = getTableConfig(parts.runTokens).foreignKeys
    if (!foreignKey) throw new Error('The run tokens table has no foreign key.')
    expect(foreignKey.reference().foreignTable).toBe(schema.records)
    expect(foreignKey.reference().foreignColumns).toEqual([schema.records.id])
  })
})
