// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A COUNT OF EVERY AGENT IDENTITY A STORE HOLDS, AND OF EVERYTHING THAT CANNOT YET BE READ. It only reads.
 *
 * Every records row is read, deleted or not, and every revisions row and every changes row. A record or a
 * revision is read by its own kind. A change row is read by the kind of its record, which is the one kind
 * its record row and all its revisions share; when they do not share one, or none is stored, the row
 * blocks. Each block keeps its table, its row's id and its path, so what is left to classify is a list.
 *
 * The writer stamped on each revisions row and each changes row is read as well, by the register's list of ledger
 * stamps, and counted under that list's site.
 *
 * Every row of each table outside the records table that ./open-shapes.ts lists in STORED_COLUMNS is read too, each
 * listed column by its writer's type. A column that holds no value is skipped, and one that holds text that is not JSON
 * blocks at the column's name. Each plain column the register lists in PLAIN_ID_COLUMNS is read as well, by what the
 * register says its writers store there: a registry id is read as it is, and an id as sent or a handle only where exactly
 * one agent answers to it. One the register pairs with another column of its row is read only when that column says
 * agent: an answered_by_id the person wrote holds the person's id. A "type:id" column is read only when its type is agent.
 * The columns of a revisions row and a changes row that STORED_COLUMNS lists are read with the row.
 *
 * A row the register says cannot be told, a value with nothing in the kind column beside it, is not read, and no block is
 * kept for it. The census counts those rows instead, by the column, so a caller can say how many are left and where.
 *
 * A row is named by the column that keys it. A table keyed by more than one column names a row by the JSON list of
 * their values, in the order the key lists them.
 *
 * Given the rows to read in each table, it reads those and no others, and a table given none is not fetched. It still
 * learns each record's kind from every records and revisions row, so a chosen change row is read by its record's kind
 * wherever that record is. A list that leaves a table out is refused, because that table would read as one with nothing
 * in it.
 *
 * Given a list of stamps, it adds to it each value the reader tells it of at a stamp or an actor pair, with the table and
 * the row, in the order it reads them. ./remint-stamps.ts reads whom each names.
 *
 * Given a list of identities, it adds to it each identity it finds, with the table and the row, in the order it finds
 * them. src/server/db/remint-verification.ts reads whom each names before a re-mint and after it.
 */
import type Database from 'better-sqlite3'
import {
  aLedgerStampReader,
  aPlainIdReader,
  readChangeIdentities,
  readRecordIdentities,
  readStoredColumn,
  theKindAChangeIsReadBy,
  type AStampOrActorPair,
  type BlockReason,
  type IdentityFound,
  type IdentityReading,
  type TellAStamp,
} from './historical-reader.ts'
import { LEDGER_STAMPS, PLAIN_ID_COLUMNS, type LedgerStamp } from './identity-positions.ts'
import { STORED_COLUMNS } from './open-shapes.ts'
import { revisionsReaderOf, wholeRevisionData } from '../revision-stored-once.ts'

function theStampOf(table: string): LedgerStamp {
  const entry = LEDGER_STAMPS.find(one => one.site === `${table}.actor_id`)
  if (entry === undefined) throw new Error(`The register lists no writer stamp for the ${table} table.`)
  return entry
}

/** The columns that key a table's rows, where they are not `id`. */
const ROW_KEY: Readonly<Record<string, readonly string[]>> = {
  office_map_layouts: ['configuration_key'],
  office_scene_settings: ['only_row'],
  installation: ['only_row'],
  run_models: ['only_row'],
  preview_root_additions: ['only_row'],
  price_table: ['only_row'],
  quick_input_list: ['only_row'],
  what_the_grant_carries: ['door'],
  office_restart_grants: ['agent_id'],
  agent_records: ['record_id'],
  casting: ['role', 'project'],
  presentation_intent: ['workspace_id', 'scope', 'target'],
  source_index: ['workspace_id', 'repository_id'],
  planning_capacity: ['horizon', 'period'],
  panel_layouts: ['workspace_id', 'id'],
  reader_anchors: ['workspace_id', 'reader'],
  notice_batch_turns: ['id', 'recipient_kind', 'recipient_id'],
}
const keyOf = (table: string): readonly string[] => ROW_KEY[table] ?? ['id']

/** The name the census gives a row: the value of the column that keys it, or the JSON list of the values of the columns that do. */
export function theRowNamed(key: readonly unknown[]): string {
  return key.length === 1 ? String(key[0]) : JSON.stringify(key)
}

/** The register's entry for each plain column that holds a registry id, by its site. */
const PLAIN = new Map(PLAIN_ID_COLUMNS.map(one => [one.site, one]))

/**
 * Each column the census reads outside the records, revisions and changes tables, by its table, a dot, and the column:
 * those STORED_COLUMNS lists, then the plain ones.
 */
export const IDENTITY_CENSUS_COLUMNS: readonly string[] = [...Object.keys(STORED_COLUMNS), ...PLAIN.keys()]

/** The three tables whose rows are read whole, by their record's kind. Their other columns the census reads are listed too. */
export const IDENTITY_CENSUS_WHOLE_ROWS: readonly string[] = ['records', 'revisions', 'changes']
const theLedgersColumns = (table: string): string[] => IDENTITY_CENSUS_COLUMNS.filter(site => site.startsWith(`${table}.`)).map(site => site.slice(table.length + 1))

/** The tables of IDENTITY_CENSUS_COLUMNS other than the ledgers, each with its columns, in the order it lists them. */
function theStoredTables(): Map<string, string[]> {
  const tables = new Map<string, string[]>()
  for (const site of IDENTITY_CENSUS_COLUMNS) {
    const dot = site.indexOf('.')
    const table = site.slice(0, dot)
    if (IDENTITY_CENSUS_WHOLE_ROWS.includes(table)) continue
    tables.set(table, [...(tables.get(table) ?? []), site.slice(dot + 1)])
  }
  return tables
}

/** The tables the census reads, in the order it reads them, each with the columns that key its rows. */
export const IDENTITY_CENSUS_TABLES: readonly { table: string; key: readonly string[] }[] = [
  ...IDENTITY_CENSUS_WHOLE_ROWS.map(table => ({ table, key: ['id'] })),
  ...[...theStoredTables().keys()].map(table => ({ table, key: keyOf(table) })),
]

export interface IdentityCensus {
  /** How many rows were read in each table: records, revisions, changes, and each table of IDENTITY_CENSUS_COLUMNS. */
  read: Record<string, number>
  /** How many identities were found at each register entry. */
  positions: Record<string, number>
  /** Every stored spelling that is an alias of another id. */
  aliases: { table: string; row: string; path: string; stored: string; canonical: string }[]
  blocks: { table: string; row: string; path: string; reason: BlockReason; why: string }[]
  /** How many rows hold a value that cannot be told in each column, by its table, a dot, and the column. None is read. */
  untold: Record<string, number>
}

/** A value at a stamp or an actor pair, where the row says an agent wrote it, with the table and the row that hold it. */
export interface AStampAt extends AStampOrActorPair {
  table: string
  row: string
}

/** An identity the census found, with the table and the row that hold it. */
export interface AnIdentityAt extends IdentityFound {
  table: string
  row: string
}

export function takeIdentityCensus(db: Database.Database, toRead?: ReadonlyMap<string, ReadonlySet<string>>, stamps?: AStampAt[], found?: AnIdentityAt[]): IdentityCensus {
  for (const { table } of IDENTITY_CENSUS_TABLES) {
    if (toRead !== undefined && !toRead.has(table)) throw new Error(`The census was given the rows to read in some tables, and none for the ${table} table.`)
  }
  const chosen = (table: string, row: string) => toRead === undefined || toRead.get(table)!.has(row)
  const census: IdentityCensus = { read: { records: 0, revisions: 0, changes: 0 }, positions: {}, aliases: [], blocks: [], untold: {} }
  const count = (table: string) => {
    census.read[table] = (census.read[table] ?? 0) + 1
  }
  /** What tells the list of stamps of each one in a row, when the census was given a list. */
  const tellOf = (table: string, row: string): TellAStamp | undefined => (stamps === undefined ? undefined : (one) => stamps.push({ table, row, ...one }))
  const kinds = new Map<string, Set<string>>()
  const kindOf = (record: string, kind: string) => {
    const held = kinds.get(record) ?? new Set<string>()
    held.add(kind)
    kinds.set(record, held)
  }
  const keep = (table: string, row: string, reading: IdentityReading) => {
    for (const one of reading.found) {
      found?.push({ table, row, ...one })
      census.positions[one.site] = (census.positions[one.site] ?? 0) + 1
      if (one.canonical !== one.stored) census.aliases.push({ table, row, path: one.path, stored: one.stored, canonical: one.canonical })
    }
    for (const one of reading.blocks) {
      const site = `${table}.${one.path}`
      if (one.reason === 'untold') census.untold[site] = (census.untold[site] ?? 0) + 1
      else census.blocks.push({ table, row, ...one })
    }
  }
  /** A stored column of a row: skipped when it holds nothing, blocked when it is not JSON, read by its writer's type. */
  const readAStoredColumn = (table: string, row: string, column: string, text: unknown, act: string | null = null) => {
    if (text === null) return
    let value: unknown
    try {
      value = JSON.parse(String(text))
    } catch {
      census.blocks.push({ table, row, path: column, reason: 'not-json', why: 'is not JSON' })
      return
    }
    keep(table, row, readStoredColumn(db, `${table}.${column}`, value, act, tellOf(table, row)))
  }
  const stamp = aLedgerStampReader(db)
  const plainId = aPlainIdReader(db)
  const revisionStamp = theStampOf('revisions')
  const changeStamp = theStampOf('changes')
  const readData = (table: string, row: { id: string; kind: string; data: string }) => {
    let data: unknown
    try {
      data = JSON.parse(row.data)
    } catch {
      census.blocks.push({ table, row: row.id, path: 'data', reason: 'not-json', why: 'is not JSON' })
      return
    }
    keep(table, row.id, readRecordIdentities(db, row.kind, data, 'data', tellOf(table, row.id)))
  }

  for (const row of db.prepare('SELECT id, kind, data FROM records ORDER BY id').all() as { id: string; kind: string; data: string }[]) {
    kindOf(row.id, row.kind)
    if (!chosen('records', row.id)) continue
    count('records')
    readData('records', row)
  }
  const theLedgers = (table: string) => theLedgersColumns(table).map(column => `, "${column}"`).join('')
  const hasParts = (db.prepare('PRAGMA table_info(revisions)').all() as { name: string }[]).some((column) => column.name === 'parts')
  const readRevision = revisionsReaderOf(db)
  const revisions = db.prepare(`SELECT id, record_id AS recordId, seq, kind, data, ${hasParts ? 'parts' : 'NULL AS parts'}, actor_type, actor_id${theLedgers('revisions')} FROM revisions ORDER BY id`).all() as ({
    id: string
    recordId: string
    seq: number
    kind: string
    data: string | null
    parts: string | null
    actor_type: string
    actor_id: string
  } & Record<string, unknown>)[]
  for (const row of revisions) {
    kindOf(row.recordId, row.kind)
    if (!chosen('revisions', row.id)) continue
    count('revisions')
    if (row.parts === null) {
      readData('revisions', row as typeof row & { data: string })
    } else {
      let data: Record<string, unknown> | null
      let unreadable = false
      try {
        data = row.data === null ? null : JSON.parse(row.data) as Record<string, unknown>
      } catch {
        // Keep the census's existing malformed-data handling.
        readData('revisions', row as typeof row & { data: string })
        unreadable = true
        data = null
      }
      if (data !== null) {
        const whole = wholeRevisionData({ recordId: row.recordId, seq: row.seq, data, parts: row.parts }, readRevision)
        keep('revisions', row.id, readRecordIdentities(db, row.kind, whole, 'data', tellOf('revisions', row.id)))
      } else if (!unreadable) {
        // A parts reference without its stored fragment is corrupt.
        wholeRevisionData({ recordId: row.recordId, seq: row.seq, data, parts: row.parts }, readRevision)
      }
    }
    keep('revisions', row.id, stamp(revisionStamp, row, tellOf('revisions', row.id)))
    for (const column of theLedgersColumns('revisions')) readAStoredColumn('revisions', row.id, column, row[column])
  }
  const changes = db.prepare(`SELECT id, record_id AS recordId, field, old_value AS oldValue, new_value AS newValue, actor_type, actor_id${theLedgers('changes')} FROM changes ORDER BY id`).all() as ({
    id: string
    recordId: string
    field: string | null
    oldValue: string | null
    newValue: string | null
    actor_type: string
    actor_id: string
  } & Record<string, unknown>)[]
  for (const row of changes) {
    if (!chosen('changes', row.id)) continue
    count('changes')
    keep('changes', row.id, readChangeIdentities(db, theKindAChangeIsReadBy(kinds.get(row.recordId)), row, tellOf('changes', row.id)))
    keep('changes', row.id, stamp(changeStamp, row, tellOf('changes', row.id)))
    for (const column of theLedgersColumns('changes')) readAStoredColumn('changes', row.id, column, row[column])
  }
  for (const [table, columns] of theStoredTables()) {
    census.read[table] = 0
    // A table given no rows to read is not fetched, so a table no archive carries costs a project's archive nothing.
    if (toRead !== undefined && toRead.get(table)!.size === 0) continue
    const key = keyOf(table)
    const byAct = columns.some(column => STORED_COLUMNS[`${table}.${column}`]?.reads === 'by-act')
    const pairs = columns.flatMap(column => PLAIN.get(`${table}.${column}`)?.pair?.field ?? []).filter(field => !columns.includes(field))
    const selected = [...key.map((one, i) => `"${one}" AS "row ${i}"`), ...(byAct ? ['"act"'] : []), ...[...columns, ...new Set(pairs)].map(column => `"${column}"`)].join(', ')
    for (const row of db.prepare(`SELECT ${selected} FROM "${table}" ORDER BY ${key.map(one => `"${one}"`).join(', ')}`).all() as Record<string, unknown>[]) {
      const id = theRowNamed(key.map((_, i) => row[`row ${i}`]))
      if (!chosen(table, id)) continue
      count(table)
      for (const column of columns) {
        const text = row[column]
        if (text === null) continue
        const plain = PLAIN.get(`${table}.${column}`)
        if (plain !== undefined) keep(table, id, plainId(plain, row, tellOf(table, id)))
        else readAStoredColumn(table, id, column, text, byAct ? String(row['act']) : null)
      }
    }
  }
  return census
}
