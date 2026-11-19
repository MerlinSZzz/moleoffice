// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import Database from 'better-sqlite3'
import { expect, it } from 'vitest'
import { THE_LISTS_OF_REVISION_COLUMNS, theHashOfARow } from '../src/server/db/the-hash-a-seal-pins-a-row-by.ts'
import { A_REVISIONS_TABLE_THE_LISTS_DO_NOT_NAME_STOPS_THE_REMINT, theSealPinsThatDoNotHold } from '../src/server/db/remint-migration.ts'
import { planTheHistoryPass } from '../src/server/db/remint-history.ts'

function oldStore() {
  const db = new Database(':memory:')
  const columns = THE_LISTS_OF_REVISION_COLUMNS.at(-2)!.columns
  db.exec(`CREATE TABLE revisions (${columns.map(name => `"${name}" TEXT`).join(', ')}); CREATE TABLE records (id TEXT, kind TEXT, data TEXT)`)
  const row = Object.fromEntries(columns.map(name => [name, `value for ${name}`]))
  row.id = 'revision-1'
  db.prepare(`INSERT INTO revisions (${columns.map(name => `"${name}"`).join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`).run(...columns.map(name => row[name]))
  const pin = { id: row.id, hash: theHashOfARow(row) }
  const data = { seal: { records: { records: [{ before: null, after: pin }], dependencies: [] } } }
  db.prepare("INSERT INTO records VALUES (?, 'sealed_tip', ?)").run('seal-1', JSON.stringify(data))
  return db
}

it('checks a pin against the known previous schema and detects a changed row', () => {
  const db = oldStore()
  try {
    expect(theSealPinsThatDoNotHold(db)).toEqual([])
    db.prepare('UPDATE revisions SET title = ? WHERE id = ?').run('changed', 'revision-1')
    expect(theSealPinsThatDoNotHold(db)).toMatchObject([{ seal: 'seal-1', revision: 'revision-1', found: true }])
  } finally { db.close() }
})

it('refuses an unrecognized revision schema instead of guessing which columns were pinned', () => {
  const db = oldStore()
  try {
    db.exec('ALTER TABLE revisions ADD COLUMN unrecognized TEXT')
    expect(A_REVISIONS_TABLE_THE_LISTS_DO_NOT_NAME_STOPS_THE_REMINT).toMatch(/\S/u)
    expect(() => theSealPinsThatDoNotHold(db)).toThrow(A_REVISIONS_TABLE_THE_LISTS_DO_NOT_NAME_STOPS_THE_REMINT)
  } finally { db.close() }
})

it('still refuses to plan a remint on a known previous schema, without changing its revisions', () => {
  const db = oldStore()
  try {
    const before = db.prepare('SELECT * FROM revisions').all()
    expect(() => planTheHistoryPass(db, { newIds: new Map(), underTheRule: () => null })).toThrow(A_REVISIONS_TABLE_THE_LISTS_DO_NOT_NAME_STOPS_THE_REMINT)
    expect(db.prepare('SELECT * FROM revisions').all()).toEqual(before)
  } finally { db.close() }
})
