// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * NO COLUMN THAT MAY HOLD AN AGENT'S ID IS LEFT OUT OF THE REGISTER (item 30c, part 3). Round 152 found the columns by
 * their names. Round 154 found more by two signs a name does not show: a kind or a type beside the column, and a comment
 * in the schema that names an agent. Either sign is enough for a column to need a class, so this reads every column of
 * every table the schema declares, and the comment written above each, and names every column that shows a sign and is
 * in none of the register's lists.
 *
 * The lists are the plain columns the census reads (PLAIN_ID_COLUMNS) and those it does not read, each with why
 * (ID_COLUMNS_NOT_READ); the two ledgers' writer stamps and their two columns that are not an identity; and the stored
 * columns read by their writer's type (STORED_COLUMNS). A kind or type column whose own column is in a list says whose
 * that column's value is, so it needs no entry of its own: `owner_kind` is `owner_id`'s.
 *
 *   1. every column of every table the schema declares is found in the schema's source, under its table;
 *   2. every column with a kind or a type beside it, and every column whose comment names an agent, is in one of the
 *      register's lists, and the test names each one that is not, with its sign.
 *
 * MUTATIONS, after a control run: take one column out of the register, and 2 goes red naming it. Stop reading the
 * columns declared as integers, and 1 goes red. Stop counting a kind column as its own column's, and 2 goes red naming
 * the kind columns.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { getTableConfig, SQLiteTable } from 'drizzle-orm/sqlite-core'
import { describe, expect, it } from 'vitest'
import * as schema from '../src/server/db/schema.ts'
import { ID_COLUMNS_NOT_READ, LEDGER_NOT_IDENTITY, LEDGER_STAMPS, PLAIN_ID_COLUMNS } from '../src/server/lib/registry-aliases/identity-positions.ts'
import { STORED_COLUMNS } from '../src/server/lib/registry-aliases/open-shapes.ts'

const PARTS = 'src/server/db/schema-parts'
const TABLES = 'src/server/db/tables'
const theFiles = (folder: string) => readdirSync(folder).filter(file => file.endsWith('.ts')).sort().map(file => `${folder}/${file}`)
/** The schema's source: schema.ts, the two files it makes `records` and `links` from, and the folders of its part tables. */
const SOURCES = ['src/server/db/schema.ts', 'src/server/db/records-table.ts', 'src/server/db/links-table.ts', ...theFiles(PARTS), ...theFiles(TABLES)]

/** Every table the schema declares, with its columns. */
function theTables(): Map<string, Set<string>> {
  const tables = new Map<string, Set<string>>()
  for (const value of Object.values(schema)) {
    if (!(value instanceof SQLiteTable)) continue
    const config = getTableConfig(value)
    tables.set(config.name, new Set(config.columns.map(column => column.name)))
  }
  return tables
}

/**
 * The comment above each column, by its table, a dot and the column, read from the schema's source. A column is filed
 * under the table whose declaration it is written in. One written outside its table, as the columns every records row
 * and links row share are, is filed under each table that has a column of its name and was not given one by its own
 * declaration, when no other column outside a table has that name.
 */
function theComments(tables: Map<string, Set<string>>): Map<string, string> {
  const comments = new Map<string, string>()
  const outside = new Map<string, string[]>()
  for (const file of SOURCES) {
    const source = readFileSync(file, 'utf8')
    const starts = [...source.matchAll(/sqliteTable\(\s*'([a-z0-9_]+)'/g)].map(match => ({ at: match.index, table: match[1]! }))
    for (const match of source.matchAll(/(\/\*\*((?:(?!\*\/)[\s\S])*)\*\/\s*)?\b\w+:\s*(?:text|integer|real|blob)\(\s*'([a-z0-9_]+)'/g)) {
      const column = match[3]!
      const comment = (match[2] ?? '').replace(/^\s*\*\s?/gm, ' ').replace(/\s+/g, ' ').trim()
      const table = starts.filter(start => start.at < match.index).at(-1)?.table
      if (table !== undefined && tables.get(table)?.has(column) === true) comments.set(`${table}.${column}`, comment)
      else outside.set(column, [...(outside.get(column) ?? []), comment])
    }
  }
  for (const [table, columns] of tables) {
    for (const column of columns) {
      const site = `${table}.${column}`
      const found = outside.get(column)
      if (!comments.has(site) && found?.length === 1) comments.set(site, found[0]!)
    }
  }
  return comments
}

/** Every column one of the register's lists names. */
function theListed(): Set<string> {
  return new Set([
    ...PLAIN_ID_COLUMNS.map(one => one.site),
    ...ID_COLUMNS_NOT_READ.map(one => one.site),
    ...LEDGER_STAMPS.map(one => one.site),
    ...LEDGER_NOT_IDENTITY.map(one => one.site),
    ...Object.keys(STORED_COLUMNS),
  ])
}

const SAYS_WHOSE = /_(kind|type)$/
/** The columns a kind or a type column could say whose value is: `owner_kind` is `owner_id`'s, or `owner`'s. */
const itsOwnColumns = (column: string) => {
  const stem = column.replace(SAYS_WHOSE, '')
  return [`${stem}_id`, stem]
}
/** The kind or type columns that could say whose a column's value is: `owner_id` has `owner_kind`, or `owner_type`. */
const itsKindColumns = (column: string) => {
  const stem = column.replace(/_id$/, '')
  return [`${stem}_kind`, `${stem}_type`]
}
const NAMES_AN_AGENT = /\bagents?\b/i

describe('the register lists every column that may hold an agent id', () => {
  it('finds every column of every table the schema declares in the schema, under its table', () => {
    const tables = theTables()
    const comments = theComments(tables)
    const missing = [...tables].flatMap(([table, columns]) => [...columns].map(column => `${table}.${column}`)).filter(site => !comments.has(site))
    expect(tables.size).toBeGreaterThan(50)
    expect(missing).toEqual([])
  })

  it('lists every column with a kind or a type beside it, and every column whose comment names an agent', () => {
    const tables = theTables()
    const comments = theComments(tables)
    const listed = theListed()
    const unlisted: string[] = []
    for (const [table, columns] of tables) {
      for (const column of columns) {
        const site = `${table}.${column}`
        if (listed.has(site)) continue
        if (SAYS_WHOSE.test(column) && itsOwnColumns(column).some(own => listed.has(`${table}.${own}`))) continue
        const beside = itsKindColumns(column).filter(kind => kind !== column && columns.has(kind))
        if (beside.length > 0) unlisted.push(`${site}, which has ${beside.join(' and ')} beside it`)
        else if (NAMES_AN_AGENT.test(comments.get(site) ?? '')) unlisted.push(`${site}, whose comment names an agent`)
      }
    }
    expect(unlisted).toEqual([])
  })
})
