// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A TABLE IN A SCHEMA PART THAT DOES NOT SAY WHAT HAPPENS TO IT IS REFUSED, BY NAME, AND NOTHING READS IT.
 *
 * Wave 13s round 103. lib/export.ts and scripts/restore-check.ts take a part table's export and its
 * place in the restore proof from its own declaration, so a table that declares nothing would be
 * carried by nothing and compared by nothing, with nothing saying so. `thePartTables` refuses it, and
 * a declaration that lacks one answer, naming the table and each answer it lacks. Both files read the
 * parts when they load, so neither loads with such a table: it is not exported by default and not
 * left out of the proof by default.
 *
 * The first cases build their parts from drizzle and part-tables.ts. The last two replace
 * schema-parts/index.ts with one bare table and load each file.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { sqliteTable, text } from 'drizzle-orm/sqlite-core'

import { freshDb, type TestDb } from './helpers.ts'
import { aPartTable, thePartTables, type WhatAnArchiveAndARestoreDo } from '../src/server/db/part-tables.ts'

/** A made-up table with a project column, wrapped in what it says, which may be a declaration the type would refuse. */
function aTableThatSays(name: string, says: Record<string, unknown>) {
  const table = sqliteTable(name, { id: text('id').primaryKey(), workspaceId: text('workspace_id') })
  return aPartTable(table, says as unknown as WhatAnArchiveAndARestoreDo)
}

/** What `thePartTables` refuses, as the message it throws, or null when it takes every table. */
function refusalOf(parts: Record<string, Record<string, unknown>>): string | null {
  try {
    thePartTables(new Map(Object.entries(parts)), [])
    return null
  } catch (refused) {
    return (refused as Error).message
  }
}

const fill = async () => 'a made-up row'

describe('a part table is refused, by name, for each answer its declaration lacks', () => {
  it('refuses a table that declares nothing, naming it, its part and both answers it lacks', () => {
    const bare = sqliteTable('made_up_says_nothing', { id: text('id').primaryKey(), workspaceId: text('workspace_id') })
    const refusal = refusalOf({ 'a-made-up-part.ts': { bare } })
    expect(refusal).not.toBeNull()
    for (const said of ['made_up_says_nothing', '`bare`', 'a-made-up-part.ts', 'missing exported', 'and restore']) {
      expect(refusal, `the refusal does not say ${said}`).toContain(said)
    }
    expect(refusal).toContain('not exported and not left out of the proof by default')
  })

  // Each declaration the type would refuse, as a cast or JavaScript could still write it, with the
  // words naming the one answer it lacks.
  const LACKING: [string, Record<string, unknown>, string][] = [
    ['no exported', { restore: 'compared', fillForTheProof: fill }, 'missing exported, which says whether an archive carries it'],
    ['no restore', { exported: true }, 'missing restore, which says what the restore proof does with it'],
    ['a restore that is none of the three', { exported: false, restore: 'rebuilt by a scan' }, 'missing restore'],
    ['a loss with no why', { exported: false, restore: 'may be lost', repair: 'a repair', fillForTheProof: fill }, 'missing why, which says why a restore may lose it'],
    ['a loss with no repair', { exported: false, restore: 'may be lost', why: 'a why', fillForTheProof: fill }, 'missing repair'],
    ['a loss with no fill', { exported: false, restore: 'may be lost', why: 'a why', repair: 'a repair' }, 'missing fillForTheProof'],
    ['a comparison with no fill', { exported: true, restore: 'compared' }, 'missing fillForTheProof'],
    ['a table out of the proof with no why', { exported: false, restore: 'not in this proof', why: '  ' }, 'missing why, which says why nothing can put a row in it'],
  ]

  it.each(LACKING)('refuses %s, naming the table and the answer', (_, says, lacking) => {
    const refusal = refusalOf({ 'a-made-up-part.ts': { lacking: aTableThatSays('made_up_lacking', says) } })
    expect(refusal).not.toBeNull()
    expect(refusal).toContain('"made_up_lacking"')
    expect(refusal).toContain(lacking)
  })

  it('refuses a table no archive carries that the proof would compare, and one an archive carries that a restore may lose', () => {
    const neither = refusalOf({ 'p.ts': { t: aTableThatSays('made_up_not_carried', { exported: false, restore: 'compared', fillForTheProof: fill }) } })
    expect(neither).toContain('"made_up_not_carried"')
    expect(neither).toContain('says no archive carries it and that the restore proof compares it')

    const both = refusalOf({
      'p.ts': { t: aTableThatSays('made_up_carried_and_lost', { exported: true, restore: 'may be lost', why: 'a why', repair: 'a repair', fillForTheProof: fill }) },
    })
    expect(both).toContain('"made_up_carried_and_lost"')
    expect(both).toContain('says an archive carries it and that a restore may lose it')
  })

  it('takes each of the three answers when it is whole', () => {
    const tables = thePartTables(
      new Map([
        [
          'p.ts',
          {
            compared: aTableThatSays('made_up_compared', { exported: true, restore: 'compared', fillForTheProof: fill }),
            lost: aTableThatSays('made_up_lost', { exported: false, restore: 'may be lost', why: 'a why', repair: 'a repair', fillForTheProof: fill }),
            outOfIt: aTableThatSays('made_up_out_of_it', { exported: true, restore: 'not in this proof', why: 'a why' }),
          },
        ],
      ]),
      [],
    )
    expect(tables.map((t) => [t.name, t.says.restore])).toEqual([
      ['made_up_compared', 'compared'],
      ['made_up_lost', 'may be lost'],
      ['made_up_out_of_it', 'not in this proof'],
    ])
  })
})

describe('neither the export nor the restore proof loads with a part table that says nothing', () => {
  let db: TestDb | undefined
  afterEach(async () => {
    if (db) {
      const current = await import('../src/server/db/client.ts')
      if (current.sqlite !== db.client.sqlite) current.sqlite.close()
    }
    vi.doUnmock('../src/server/db/schema-parts/index.ts')
    db?.close()
    db = undefined
  })

  const THE_TWO_FILES: Record<string, () => Promise<unknown>> = {
    'src/server/lib/export.ts': () => import('../src/server/lib/export.ts'),
    'scripts/restore-check.ts': () => import('../scripts/restore-check.ts'),
  }

  // The database is setup. The assertion's clock measures the file refusing the bare table.
  beforeEach(async () => {
    db = await freshDb()
    vi.doMock('../src/server/db/schema-parts/index.ts', async () => {
      const { sqliteTable: table, text: column } = await import('drizzle-orm/sqlite-core')
      return { madeUpSaysNothing: table('made_up_says_nothing', { id: column('id').primaryKey() }) }
    })
    // A real database is already open; reload the targets with the invalid declaration.
    vi.resetModules()
  })

  /** Load the target with the already-open fixture's bare table declaration. */
  function loadingWithABareTable(file: string): Promise<unknown> {
    const load = THE_TWO_FILES[file]
    if (load === undefined) throw new Error(`${file} is not one of the two files that read the schema parts`)
    return load()
  }

  it.each(Object.keys(THE_TWO_FILES))('%s refuses to load, naming the table and what it lacks', async (file) => {
    const loading = loadingWithABareTable(file)
    await expect(loading).rejects.toThrow('declares the table "made_up_says_nothing"')
    await expect(loading).rejects.toThrow('Its declaration is missing exported')
  })
})
