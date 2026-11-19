// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * MIGRATION 0290 MAKES ONE INDEX OF THE RECORDS' TEXT, FILLS IT FROM THE RECORDS ALREADY THERE, AND ITS TRIGGERS KEEP
 * IT ON EVERY WRITE.
 *
 * Wave 13y round 64. GET /api/search and GET /api/report-files/named-inside both ask which records hold some text.
 * They ask the index first and then read only the records it keeps. So the index must hold, for each record, the text
 * of its title, its summary and every string value in its `data`, and it must follow every insert, update, change of
 * id and delete. tests/one-index-of-the-records-text-serves-search-and-named-inside.test.ts proves the doors give the
 * same answers with it. This file proves the migration and the triggers.
 *
 * THE INDEX FINDS A RECORD BY ITS ID, THROUGH `record_text_keys`, AND NEVER BY ITS ROWID. A records rowid is not
 * fixed: tools/build-a-made-up-office.ts renumbers every one, and SQLite says VACUUM may. The third case renumbers
 * them and asks again.
 */
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'

import { describeOutcome, migrateInPlace } from '../src/server/db/migrate.ts'
import { RECORD_TEXT_INDEX_TABLES } from '../src/server/db/schema.ts'
import { aTestDatabaseFolder } from './a-test-folder.ts'
import { MIGRATIONS, journal, partialMigrations, scratch, throwAwayAfterTheTest } from './migration-fixtures.ts'

/** Found by its name, not its number, so a renumber is only the file name and the journal line. */
const TAG = journal(MIGRATIONS).find((entry) => entry.tag.endsWith('_one_index_of_the_records_text'))?.tag
const INDEX = journal(MIGRATIONS).findIndex((entry) => entry.tag === TAG)

const OWNER = 'the-owner-of-these-test-rows'
const AT = '2026-10-23 09:00:00'

/** One record written straight into the table, as an older office or an import would have it. */
function write(db: Database.Database, id: string, title: string, summary: string | null, data: string): void {
  db.prepare(
    'INSERT INTO records (id, kind, title, summary, data, created_at, updated_at, owner_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(id, 'note', title, summary, data, AT, AT, OWNER)
}

/** The search's own question, asked in SQL: every three letters of the text, each quoted, joined by AND. */
function whichHold(db: Database.Database, text: string): string[] {
  const letters = [...text]
  const terms = new Set<string>()
  for (let at = 0; at + 3 <= letters.length; at++) terms.add(`"${letters.slice(at, at + 3).join('').replaceAll('"', '""')}"`)
  return (
    db
      .prepare(
        'SELECT record_id FROM record_text_keys WHERE n IN (SELECT rowid FROM record_text WHERE record_text MATCH ?) ORDER BY record_id',
      )
      .all([...terms].join(' AND ')) as { record_id: string }[]
  ).map((row) => row.record_id)
}

/** The three-letter pieces the index holds for one record, read back through SQLite's own view of the index. */
function piecesOf(db: Database.Database, id: string): string[] {
  return (
    db
      .prepare(
        'SELECT term FROM temp.record_text_pieces WHERE doc = (SELECT n FROM record_text_keys WHERE record_id = ?) ORDER BY term',
      )
      .all(id) as { term: string }[]
  ).map((row) => row.term)
}

/** Both of SQLite's checks, the file's and the index's own. */
function expectTheIndexIsWhole(db: Database.Database): void {
  expect(db.pragma('integrity_check')).toEqual([{ integrity_check: 'ok' }])
  expect(() => db.prepare("INSERT INTO record_text (record_text, rank) VALUES ('integrity-check', 0)").run()).not.toThrow()
  const keys = db.prepare('SELECT count(*) AS n FROM record_text_keys').get() as { n: number }
  const rows = db.prepare('SELECT count(*) AS n FROM records').get() as { n: number }
  expect(keys.n, 'each record has one key, and no key outlives its record').toBe(rows.n)
  const strays = db.prepare('SELECT record_id FROM record_text_keys WHERE record_id NOT IN (SELECT id FROM records)').all()
  expect(strays).toEqual([])
  // The index's own row for each entry. A deleted record whose entry stayed would be found by no key, and kept.
  const entries = db.prepare('SELECT count(*) AS n FROM record_text_docsize').get() as { n: number }
  expect(entries.n, 'each key has one entry in the index').toBe(keys.n)
  const orphans = db.prepare('SELECT id FROM record_text_docsize WHERE id NOT IN (SELECT n FROM record_text_keys)').all()
  expect(orphans, 'no entry in the index outlives its key').toEqual([])
}

/** A fully migrated scratch database. */
function migrated(name: string): Database.Database {
  const s = scratch(name)
  migrateInPlace(s.db, MIGRATIONS)
  return s.db
}

/** The real migrations and one more, applied by drizzle as any other. */
function migrationsPlusOne(name: string, sql: string): string {
  const dir = throwAwayAfterTheTest(aTestDatabaseFolder('migrations-plus'))
  mkdirSync(join(dir, 'meta'))
  const entries = journal(MIGRATIONS)
  for (const entry of entries) copyFileSync(join(MIGRATIONS, `${entry.tag}.sql`), join(dir, `${entry.tag}.sql`))
  const last = entries[entries.length - 1]!
  const tag = `9999_${name}`
  writeFileSync(join(dir, `${tag}.sql`), sql)
  const plus = [...entries, { ...last, idx: last.idx + 1, when: last.when + 1000, tag }]
  writeFileSync(join(dir, 'meta', '_journal.json'), JSON.stringify({ version: '7', dialect: 'sqlite', entries: plus }))
  return dir
}

describe('migration 0290', () => {
  it('makes the six tables the schema names for the index, and the three triggers on records', () => {
    const db = migrated('tables')
    const tables = (
      db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'record_text%' ORDER BY name").all() as { name: string }[]
    ).map((row) => row.name)
    expect(tables).toEqual([...RECORD_TEXT_INDEX_TABLES].sort())
    expect([...RECORD_TEXT_INDEX_TABLES].sort()).toEqual([
      'record_text',
      'record_text_config',
      'record_text_data',
      'record_text_docsize',
      'record_text_idx',
      'record_text_keys',
    ])
    const triggers = (
      db.prepare("SELECT name FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'record_text%' ORDER BY name").all() as { name: string }[]
    ).map((row) => row.name)
    expect(triggers).toEqual(['record_text_on_delete', 'record_text_on_insert', 'record_text_on_update'])
  })

  it('fills the index from the records already there, with the same pieces the triggers write for a new record', () => {
    const s = scratch('backfill')
    migrateInPlace(s.db, partialMigrations(INDEX))
    expect(INDEX, 'the migration is not in the journal').toBeGreaterThan(0)
    const before = [
      ['plain', 'Clamp torque', 'Measured on the bench.', JSON.stringify({ symptom: 'The carriage keeps travelling.', hours: 18 })],
      ['nested', '夹具标定', null, JSON.stringify({ parts: [{ items: [{ text: 'ΣΊΣΥΦΟΣ and İstanbul' }, { text: '  ' }] }] })],
      // A letter written as a backslash-u escape, as JSON may write one. The index holds the letter.
      ['escaped', 'An escaped letter', null, '{"text":"on\\u0065 two"}'],
      ['not-json', 'Data that is not JSON', 'kept as written', 'symptom: raw text'],
      ['empty', 'Nothing in the data', null, '{}'],
    ] as const
    for (const [id, title, summary, data] of before) write(s.db, id, title, summary, data)

    migrateInPlace(s.db, MIGRATIONS)

    s.db.exec("CREATE VIRTUAL TABLE temp.record_text_pieces USING fts5vocab(main, record_text, 'instance')")
    for (const [id] of before) {
      s.db
        .prepare(
          'INSERT INTO records (id, kind, title, summary, data, created_at, updated_at, owner_id) ' +
            'SELECT ?, kind, title, summary, data, created_at, updated_at, owner_id FROM records WHERE id = ?',
        )
        .run(`twin-${id}`, id)
      const pieces = piecesOf(s.db, id)
      expect(pieces.length, `${id} has no pieces in the index`).toBeGreaterThan(0)
      expect(pieces, `${id} was filled with other pieces than its twin's`).toEqual(piecesOf(s.db, `twin-${id}`))
    }
    expect(whichHold(s.db, 'carriage')).toEqual(['plain', 'twin-plain'])
    expect(whichHold(s.db, '具标定')).toEqual(['nested', 'twin-nested'])
    expect(whichHold(s.db, 'stanbul')).toEqual(['nested', 'twin-nested'])
    expect(whichHold(s.db, 'one two')).toEqual(['escaped', 'twin-escaped'])
    expect(whichHold(s.db, 'raw text')).toEqual(['not-json', 'twin-not-json'])
    expect(whichHold(s.db, 'as written')).toEqual(['not-json', 'twin-not-json'])
    expectTheIndexIsWhole(s.db)
  })

  it('follows every write: insert, update, a new id, a new rowid, a replace and a delete', () => {
    const db = migrated('writes')
    write(db, 'apple', 'Apple pie', null, JSON.stringify({ topping: 'crumble' }))
    write(db, 'banana', 'Banana bread', 'walnut', '{}')
    expect(whichHold(db, 'crumble')).toEqual(['apple'])
    expect(whichHold(db, 'walnut')).toEqual(['banana'])

    db.prepare('UPDATE records SET data = ? WHERE id = ?').run(JSON.stringify({ topping: 'custard' }), 'apple')
    expect(whichHold(db, 'crumble'), 'the old text is still found after an update').toEqual([])
    expect(whichHold(db, 'custard')).toEqual(['apple'])

    db.prepare('UPDATE records SET title = ?, summary = ? WHERE id = ?').run('Banana loaf', 'pecan', 'banana')
    expect(whichHold(db, 'walnut')).toEqual([])
    expect(whichHold(db, 'banana bread')).toEqual([])
    expect(whichHold(db, 'banana loaf')).toEqual(['banana'])

    db.prepare('UPDATE records SET id = ? WHERE id = ?').run('plantain', 'banana')
    expect(whichHold(db, 'pecan'), 'a record with a new id is found by its new id').toEqual(['plantain'])

    // The made-up office's tool renumbers every rowid like this. The index follows the id, so nothing moves.
    db.exec('UPDATE records SET rowid = -rowid')
    expect(whichHold(db, 'custard')).toEqual(['apple'])
    expect(whichHold(db, 'pecan')).toEqual(['plantain'])

    // A REPLACE takes the old row away without a delete trigger, and the insert trigger writes the new text.
    db.prepare(
      'INSERT OR REPLACE INTO records (id, kind, title, summary, data, created_at, updated_at, owner_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    ).run('apple', 'note', 'Cherry tart', null, '{}', AT, AT, OWNER)
    expect(whichHold(db, 'custard'), 'the replaced text is still found').toEqual([])
    expect(whichHold(db, 'cherry')).toEqual(['apple'])

    db.prepare('DELETE FROM records WHERE id = ?').run('plantain')
    expect(whichHold(db, 'pecan')).toEqual([])
    expectTheIndexIsWhole(db)
  })

  it('indexes a record by its own text when it takes the id of a record a REPLACE took away', () => {
    const db = migrated('replace-another')
    const entry = db.prepare(
      "INSERT OR REPLACE INTO records (id, kind, title, summary, data, created_at, updated_at, owner_id) VALUES (?, 'merge_entry', ?, NULL, ?, ?, ?, ?)",
    )
    entry.run('first-entry', 'Synthetic first entry', JSON.stringify({ occupies: 'lane-a', note: 'gooseberry' }), AT, AT, OWNER)
    // The second entry takes the same lane, so SQLite takes the first away to keep the lane's index unique, and runs no
    // delete trigger for it. Its key and its text stay, and the index keeps a record that is not there: too many.
    entry.run('second-entry', 'Synthetic second entry', JSON.stringify({ occupies: 'lane-a' }), AT, AT, OWNER)
    expect(db.prepare('SELECT id FROM records ORDER BY id').all()).toEqual([{ id: 'second-entry' }])
    expect(whichHold(db, 'gooseberry')).toEqual(['first-entry'])

    // A record written later under that id takes the same key, and its own text replaces the old.
    write(db, 'first-entry', 'Synthetic rhubarb note', null, '{}')
    expect(whichHold(db, 'gooseberry'), 'the text of the record taken away is still found').toEqual([])
    expect(whichHold(db, 'rhubarb')).toEqual(['first-entry'])
    expectTheIndexIsWhole(db)
  })

  it('answers the same in a copy made by VACUUM INTO', () => {
    const db = migrated('copy')
    for (let at = 0; at < 30; at++) write(db, `row-${String(at)}`, `Row ${String(at)} of the copy`, null, JSON.stringify({ n: `piece ${String(at % 3)}` }))
    db.exec("DELETE FROM records WHERE id LIKE 'row-1%'")
    const folder = throwAwayAfterTheTest(aTestDatabaseFolder('vacuum-into'))
    const copyFile = join(folder, 'copy.db')
    db.exec(`VACUUM INTO '${copyFile}'`)
    const copy = new Database(copyFile)
    try {
      for (const text of ['piece 0', 'piece 2', 'of the copy', 'row 2']) expect(whichHold(copy, text), text).toEqual(whichHold(db, text))
      expect(whichHold(copy, 'piece 1').length).toBeGreaterThan(0)
      expectTheIndexIsWhole(copy)
    } finally {
      copy.close()
    }
  })

  it('says in the report why a smaller index table is not a lost row', () => {
    const db = migrated('report')
    // One write each, so each is a piece of the index of its own until SQLite merges them.
    for (let at = 0; at < 40; at++) write(db, `piece-${String(at)}`, `Piece ${String(at)}`, null, '{}')
    const pieces = (db.prepare('SELECT count(*) AS n FROM record_text_data').get() as { n: number }).n
    const outcome = migrateInPlace(db, migrationsPlusOne('merges_the_index', "INSERT INTO `record_text` (`record_text`) VALUES ('optimize');"))
    const after = (db.prepare('SELECT count(*) AS n FROM record_text_data').get() as { n: number }).n
    expect(after, 'the merge did not make the table smaller, so this case proves nothing').toBeLessThan(pieces)
    expect(describeOutcome(outcome)).toContain(
      `record_text_data went from ${String(pieces)} rows to ${String(after)} (the records' triggers keep this index of their text, and SQLite merges its pieces)`,
    )
  })
})
