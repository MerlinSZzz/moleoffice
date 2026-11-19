// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { describe, expect, it } from 'vitest'
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

import * as schema from '../src/server/db/schema.ts'
import { aPartTable, thePartTables, type WhatAnArchiveAndARestoreDo } from '../src/server/db/part-tables.ts'

const COMPARED: WhatAnArchiveAndARestoreDo = { exported: true, restore: 'compared', fillForTheProof: async () => 'a made-up row' }

/** A made-up table with a project column, carried by an archive and compared by a restore. */
function aComparedTable(name: string) {
  return aPartTable(
    sqliteTable(name, { id: text('id').primaryKey(), workspaceId: text('workspace_id').notNull() }),
    COMPARED,
  )
}

/** What `thePartTables` refuses, as the message it throws, or null when it takes every table. */
function refusalOf(parts: Record<string, Record<string, unknown>>, namesTaken: readonly string[] = []): string | null {
  try {
    thePartTables(new Map(Object.entries(parts)), namesTaken)
    return null
  } catch (refused) {
    return (refused as Error).message
  }
}

describe('a schema part table says what happens to it, and only it has its name', () => {
  it('takes a part table that says it, with the project column it read off the table', () => {
    const tables = thePartTables(new Map([['made-up-part.ts', { one: aComparedTable('made_up_one') }]]), [])
    expect(tables.map((t) => [t.name, t.binding, t.part, t.workspaceColumn])).toEqual([
      ['made_up_one', 'one', 'made-up-part.ts', 'workspace_id'],
    ])
  })

  it('refuses two parts declaring the same table name, naming both', () => {
    const refusal = refusalOf({
      'first-part.ts': { theFirst: aComparedTable('one_name_twice') },
      'second-part.ts': { theSecond: aComparedTable('one_name_twice') },
    })
    expect(refusal).not.toBeNull()
    for (const said of ['one_name_twice', 'theFirst', 'first-part.ts', 'theSecond', 'second-part.ts']) {
      expect(refusal, `the refusal does not name ${said}`).toContain(said)
    }
  })

  it('refuses a part table with the name of a table schema.ts already has', () => {
    const taken = schema.NAMES_A_PART_MAY_NOT_TAKE[0]
    expect(taken, 'schema.ts names no table a part may not take').toBeDefined()
    if (taken === undefined) return
    const refusal = refusalOf({ 'a-part.ts': { again: aComparedTable(taken) } }, schema.NAMES_A_PART_MAY_NOT_TAKE)
    expect(refusal).not.toBeNull()
    expect(refusal).toContain(taken)
    expect(refusal).toContain('again')
  })

  it('refuses a part table with no export and restore declaration, naming it and its part', () => {
    const bare = sqliteTable('made_up_bare', { id: text('id').primaryKey(), workspaceId: text('workspace_id') })
    const refusal = refusalOf({ 'bare-part.ts': { bare, fine: aComparedTable('made_up_fine') } })
    expect(refusal).not.toBeNull()
    for (const said of ['made_up_bare', 'bare', 'bare-part.ts']) expect(refusal).toContain(said)
    expect(refusal, 'the refusal names a table that did say what happens to it').not.toContain('made_up_fine')
  })

  it('refuses an archived table with no project column and no reason, and one with both', () => {
    const nobodys = sqliteTable('made_up_nobodys', { id: text('id').primaryKey() })
    expect(refusalOf({ 'p.ts': { t: aPartTable(nobodys, COMPARED) } })).toContain('made_up_nobodys')

    const both = sqliteTable('made_up_both', { id: text('id').primaryKey(), workspaceId: text('workspace_id') })
    const saysBoth = aPartTable(both, { ...COMPARED, noProjectBecause: 'A made-up reason for a made-up table' })
    expect(refusalOf({ 'p.ts': { t: saysBoth } })).toContain('made_up_both')

    const personLevel = sqliteTable('made_up_person_level', { id: text('id').primaryKey(), hours: integer('hours') })
    const saysWhy = aPartTable(personLevel, { ...COMPARED, noProjectBecause: 'A made-up reason for a made-up table' })
    expect(thePartTables(new Map([['p.ts', { saysWhy }]]), []).map((t) => t.workspaceColumn)).toEqual([null])
  })

  it('refuses a table given its answers twice, and counts one table exported under two names once', () => {
    const table = aComparedTable('made_up_once')
    expect(() => aPartTable(table, COMPARED)).toThrow('made_up_once')
    expect(thePartTables(new Map([['p.ts', { table, alsoTable: table }]]), []).map((t) => t.name)).toEqual(['made_up_once'])
  })

  it('passes over a value a part exports that is no table', () => {
    expect(thePartTables(new Map([['p.ts', { aWord: 'not a table', aNumber: 3 }]]), [])).toEqual([])
  })
})

