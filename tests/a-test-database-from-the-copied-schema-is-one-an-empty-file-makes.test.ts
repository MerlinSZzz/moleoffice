// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A TEST DATABASE MADE FROM THE COPIED SCHEMA HOLDS WHAT ONE MADE FROM AN EMPTY FILE HOLDS.
 *
 * Since 9 October 2026 `freshDb` in tests/helpers.ts copies a file on which the SQL migrations have
 * already run once in this process (`theMigratedSchema`), and then runs the product's
 * `migrateInPlace` on the copy, instead of running all of it on an empty file. That is about 90 ms
 * a call and some six thousand calls a run. It is only right if nothing a test reads changes.
 *
 * WHAT IS PROVED HERE. In one test, `freshDb` makes its database the new way, and this file makes a
 * second one the old way: an empty file at a path of its own, and `migrateInPlace` on it. The two
 * dumps — every table's definition, every row of every table, and five pragmas — are the same, once
 * the time stamps and each file's own world, installation and office id are set aside. The world is
 * the hash of a file's path and birth time (src/config/database-identity.mjs) and the installation
 * the hash of its path, so each is first checked to be that file's own, rather than masked blind.
 * The office id is drawn for the office's own row when each file is migrated, so it is first checked
 * to be the one row that migration draws: the only live row with the office's handle, an id that
 * could not be a handle, and the picture drawn for that id. The second file is opened as
 * src/server/db/client.ts opens every database, with its two pragmas.
 *
 * MUTATION. In `theMigratedSchema`, run the whole `migrateInPlace` on the template instead of
 * drizzle's `migrate` alone. The copy then carries the template's world, not its own, and the first
 * check fails.
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import Database from 'better-sqlite3'
import { afterEach, expect, it } from 'vitest'

import { databaseIdentity } from '../src/config/database-identity.mjs'
import { theInstallationForADatabaseAt } from '../src/server/db/citizenship-migration.ts'
import { migrateInPlace } from '../src/server/db/migrate.ts'
import { MOLE_OFFICE_HANDLE, couldBeAHandle, defaultAvatarAssetId } from '../src/shared/participants.ts'
import { buildTheFirstOfficeInAHook, freshDb, type TestDb } from './helpers.ts'

// The first office of this process is built in a hook, so each case below keeps its 5 s for what it tests.
buildTheFirstOfficeInAHook()

const MIGRATIONS = join(import.meta.dirname, '..', 'drizzle')
const PRAGMAS = ['foreign_keys', 'journal_mode', 'user_version', 'page_size', 'auto_vacuum']

let t: TestDb | null = null
let scratch: string | null = null

afterEach(() => {
  t?.close()
  t = null
  if (scratch !== null) rmSync(scratch, { recursive: true, force: true })
  scratch = null
})

/** Every home world and home installation written into a database: each must be the file's own. */
function theOriginsIn(db: Database.Database): { world: string; installation: string }[] {
  return db.prepare(
    'SELECT home_world AS world, home_installation AS installation FROM people UNION ALL SELECT home_world, home_installation FROM agents',
  ).all() as { world: string; installation: string }[]
}

/** The file's own world and installation, after checking every row that names one names these. */
function theOwnOrigin(db: Database.Database, file: string): { world: string; installation: string } {
  const own = { world: databaseIdentity(file).id as string, installation: theInstallationForADatabaseAt(file).id }
  const origins = theOriginsIn(db)
  expect(origins.length).toBeGreaterThan(0)
  expect(origins, `the database at ${file} names a world or an installation not its own`).toEqual(origins.map(() => own))
  return own
}

/** The id of the office's own row, after checking it is the one row a migration draws for the office. */
function theOwnOfficeId(db: Database.Database, file: string): string {
  const rows = db.prepare('SELECT id, avatar_asset_id AS avatar FROM agents WHERE handle = ? AND retired = 0').all(MOLE_OFFICE_HANDLE) as { id: string; avatar: string }[]
  expect(rows, `the database at ${file} does not hold exactly one live row with the office's handle`).toHaveLength(1)
  const { id, avatar } = rows[0]!
  expect(couldBeAHandle(id), `the office's own id ${id} at ${file} could be a handle`).toBe(false)
  expect(avatar, `the office's own row at ${file} has a picture not drawn for its id`).toBe(defaultAvatarAssetId({ kind: 'agent', id }))
  return id
}

/** The whole database as text, with this file's world, installation, office id and every time stamp written as words. */
function theDumpOf(db: Database.Database, own: { world: string; installation: string; office: string }): string {
  const lines: string[] = [JSON.stringify(db.prepare(
    "SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_autoindex%' ORDER BY type, name",
  ).all())]
  const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all() as { name: string }[])
  for (const { name } of tables) {
    const rows = JSON.stringify(db.prepare(`SELECT * FROM "${name}"`).all())
      .split(own.world).join('<this file’s world>')
      .split(own.installation).join('<this file’s installation>')
      .split(own.office).join('<this file’s office id>')
      .replace(/\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(\.\d+)?Z?/gu, '<time>')
    lines.push(`${name}\t${rows}`)
  }
  for (const pragma of PRAGMAS) lines.push(`${pragma}=${JSON.stringify(db.pragma(pragma, { simple: true }))}`)
  return lines.join('\n')
}

it('holds the same schema, rows and pragmas as a database migrated from an empty file', async () => {
  t = await freshDb()
  const copied = t.client.sqlite
  const copiedOwn = { ...theOwnOrigin(copied, t.file), office: theOwnOfficeId(copied, t.file) }

  scratch = mkdtempSync(join(tmpdir(), 'mole-office-empty-file-migrated-'))
  const emptyFile = join(scratch, 'panelx.db')
  const fromEmpty = new Database(emptyFile)
  try {
    fromEmpty.pragma('journal_mode = WAL')
    fromEmpty.pragma('foreign_keys = ON')
    migrateInPlace(fromEmpty, MIGRATIONS)
    const fromEmptyOwn = { ...theOwnOrigin(fromEmpty, emptyFile), office: theOwnOfficeId(fromEmpty, emptyFile) }
    expect(theDumpOf(copied, copiedOwn)).toBe(theDumpOf(fromEmpty, fromEmptyOwn))
  } finally {
    fromEmpty.close()
  }
})

