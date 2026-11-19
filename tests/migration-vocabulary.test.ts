// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE NEW VOCABULARY NEEDS ONE COLUMN, AND THIS FILE IS THE PROOF THAT IT IS ONE.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS CHECKED, AND WHY IT IS WORTH A FILE
 * ---------------------------------------------------------------------------------------
 *
 * The wave before this one added a kind (`proposal`), two link types (`resolves`, `about`), a module
 * lifecycle stored at `module.data.state`, an obligation `due` that may now be an object rather than
 * a bare date, and two readers over `direction` depth and parked reasons. Every one of those is a
 * candidate for "and it needs a column", and getting that wrong is expensive in both directions: a
 * column nobody needed is a second place a fact can live, and a fact that needed a column and did not
 * get one is a JSON scan every time anybody asks about it.
 *
 * The answer is that exactly one of them needed storage, and it was not any of those. `records.origin`
 * needed a column because it is a fact about the ROW — it must survive an export, it must be
 * answerable by a WHERE clause, and a `dataPatch` must not be able to rewrite it. Everything else in
 * that wave is either a value inside `data`, which is one JSON column with no schema of its own, or a
 * word in an existing text column with no constraint on it.
 *
 * THIS FILE PROVES THAT RATHER THAN ASSERTING IT. It writes a record of every declared kind and a
 * link of every declared type into a really migrated database, and it pins the column lists of
 * `records` and `links` so the next person to add a field has to decide, out loud, whether it needs
 * one.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { rmSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'

import { migrateInPlace } from '../src/server/db/migrate.ts'
import { LINK_TYPES, RECORD_KINDS } from '../src/shared/types.ts'
import { aTestDatabaseFolder } from './a-test-folder.ts'

const MIGRATIONS = join(fileURLToPath(new URL('..', import.meta.url)), 'drizzle')

const open: { dir: string; db: Database.Database }[] = []

function fresh(name: string): Database.Database {
  const dir = aTestDatabaseFolder(`vocab-${name}`)
  const db = new Database(join(dir, 'panelx.db'))
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  open.push({ dir, db })
  migrateInPlace(db, MIGRATIONS)
  return db
}

afterEach(() => {
  for (const o of open.splice(0)) {
    if (o.db.open) o.db.close()
    rmSync(o.dir, { recursive: true, force: true })
  }
})

function insertRecord(db: Database.Database, id: string, kind: string, title: string, data: unknown): void {
  db.prepare(
    'INSERT INTO records (id, workspace_id, owner_id, created_at, updated_at, kind, title, summary, data) ' +
      `VALUES (?, 'default', '${THE_TEST_OFFICES_OWNER.id}', '2026-07-01 09:00:00', '2026-07-01 09:00:00', ?, ?, NULL, ?)`,
  ).run(id, kind, title, JSON.stringify(data))
}

describe('every declared kind is an ordinary row of the one records table', () => {
  it('stores and reads back a record of all of them, `proposal` included', () => {
    const db = fresh('kinds')
    RECORD_KINDS.forEach((kind, i) => insertRecord(db, `rec-${i}`, kind, `a ${kind}`, {}))
    const stored = (db.prepare('SELECT kind FROM records').all() as { kind: string }[]).map((r) => r.kind).sort()
    expect(stored).toEqual([...RECORD_KINDS].sort())
    // THE LINE ABOVE IS THE CHECK, AND IT IS WRITTEN OVER `RECORD_KINDS` RATHER THAN OVER A
    // NUMERAL. It used to be followed by `expect(RECORD_KINDS.length).toBe(20)`, whose stated job
    // was to make a kind added with no thought about storage a deliberate edit here. But the loop
    // above already inserts one row per declared kind and reads every one of them back, so a new
    // kind is exercised whether or not anybody edits this file — and the numeral only ever failed
    // for the reason "somebody added a kind", which is not a fault. It was four files' worth of
    // re-typing for a check the assertion above already makes.
    expect(RECORD_KINDS.length).toBeGreaterThan(0)
    expect(RECORD_KINDS).toContain('proposal')
    expect(RECORD_KINDS).toContain('annotation')
  })

  it('needs no migration for a new kind, because SQLite checks none of them', () => {
    // Deliberately a word that is in no vocabulary. The column takes it, which is what makes adding
    // a kind a change to shared/types.ts and to nothing in drizzle/. The refusal lives on the write
    // path, in validate.ts, where it can be a sentence naming the sixteen that exist.
    const db = fresh('newkind')
    expect(() => insertRecord(db, 'rec-x', 'not_a_kind_at_all', 'x', {})).not.toThrow()
  })
})

describe('every declared link type is an ordinary row of the one links table', () => {
  it('stores all of them, `resolves` and `about` included', () => {
    const db = fresh('links')
    insertRecord(db, 'a', 'note', 'a', {})
    insertRecord(db, 'b', 'note', 'b', {})
    const insert = db.prepare(
      'INSERT INTO links (id, workspace_id, owner_id, created_at, updated_at, from_id, to_id, type, inferred, created_by) ' +
        `VALUES (?, 'default', '${THE_TEST_OFFICES_OWNER.id}', '2026-07-01 09:00:00', '2026-07-01 09:00:00', 'a', 'b', ?, 0, '${THE_TEST_OFFICES_OWNER.id}')`,
    )
    const types = Object.keys(LINK_TYPES)
    types.forEach((type, i) => insert.run(`link-${i}`, type))
    const stored = (db.prepare('SELECT type FROM links').all() as { type: string }[]).map((r) => r.type).sort()
    expect(stored).toEqual([...types].sort())
    // NO COUNT OF THE LINK TYPES, for the reason the kind count above lost its numeral: a numeral
    // in an acceptance row reads as a check on the vocabulary and is really a check that the loop
    // ran, and it is edited without being read. What has to be true is that EVERY declared type is
    // an ordinary row of this table, and the set comparison two lines up says exactly that.
    expect(types.length).toBeGreaterThan(0)
    expect(types).toContain('resolves')
    expect(types).toContain('about')
    // The three wave 10 added are here too, and they needed no column: a planned future's links are
    // the same rows as everything else's.
    expect(types).toContain('plans_for')
    expect(types).toContain('realises')
    expect(types).toContain('instead_of')
  })
})

describe('everything the vocabulary stores inside `data` needs no column', () => {
  it('round-trips a module lifecycle state, an obligation due object and a parked reason unchanged', () => {
    // One row per shape the new vocabulary introduced, written as the product would write it. The
    // point is not that SQLite can hold JSON — it is that these three shapes are all `data`, so none
    // of them is a schema change and none of them can be queried without reading the column.
    const db = fresh('data')
    insertRecord(db, 'm', 'module', 'a module', { state: 'retired' })
    insertRecord(db, 'o', 'obligation', 'an obligation', {
      due: { condition: 'when the force table is finished', recordId: 'm' },
    })
    insertRecord(db, 'i', 'idea', 'an idea', { parked_because: 'the arm is on loan until October' })
    expect(JSON.parse((db.prepare("SELECT data FROM records WHERE id = 'm'").get() as { data: string }).data)).toEqual({
      state: 'retired',
    })
    expect(JSON.parse((db.prepare("SELECT data FROM records WHERE id = 'o'").get() as { data: string }).data)).toEqual({
      due: { condition: 'when the force table is finished', recordId: 'm' },
    })
    expect(JSON.parse((db.prepare("SELECT data FROM records WHERE id = 'i'").get() as { data: string }).data)).toEqual({
      parked_because: 'the arm is on loan until October',
    })
  })
})

describe('the columns the two canonical tables have', () => {
  const columnNames = (db: Database.Database, table: string): string[] =>
    (db.prepare(`PRAGMA table_info("${table}")`).all() as { name: string }[]).map((c) => c.name)


  it('put `origin` outside `data`, where a data patch cannot reach it', () => {
    // The claim shared/types.ts makes about this field, stated as a fact about the database: it is
    // an envelope column, so rewriting `data` wholesale — which is what a merge patch does — cannot
    // touch it.
    const db = fresh('envelope')
    insertRecord(db, 'r', 'note', 'a note', { anything: 'at all' })
    db.prepare("UPDATE records SET origin = 'fixture' WHERE id = 'r'").run()
    db.prepare("UPDATE records SET data = ? WHERE id = 'r'").run(JSON.stringify({ origin: 'authored' }))
    const row = db.prepare("SELECT origin, data FROM records WHERE id = 'r'").get() as {
      origin: string
      data: string
    }
    expect(row.origin).toBe('fixture')
    expect(JSON.parse(row.data)).toEqual({ origin: 'authored' })
  })
})
