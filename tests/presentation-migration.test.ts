// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * Migration 0002 — the presentation_intent table — against a database that already has work in it.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS IS A SEPARATE FILE FROM tests/migration.test.ts
 * ---------------------------------------------------------------------------------------
 *
 * That file owns the rules that hold for EVERY migration: additive only, `IF NOT EXISTS` on every
 * CREATE TABLE after 0000, no DROP, no RENAME, no UPDATE, safe to run twice, and the journal guard.
 * Those rules already cover 0002 without a line being added, and they are not restated here.
 *
 * This file is about what 0002 in particular claims: that it creates one table and touches nothing
 * else, that a database holding records, links and changes comes through with every row, and that
 * the new table cannot hold a coordinate — which is the boundary in src/shared/presentation.ts
 * expressed as a column list, and the one thing a schema can enforce about it.
 *
 * ---------------------------------------------------------------------------------------
 * THE FIXTURE, AND WHY IT IS NOT FAKED
 * ---------------------------------------------------------------------------------------
 *
 * `partialMigrations(n)` writes a temporary migrations folder holding the first n entries of the
 * real `drizzle/meta/_journal.json` and byte-for-byte copies of their `.sql` files, then runs
 * drizzle at it. The journal entries keep their original `when` values, which is what drizzle
 * compares against to decide what to apply, so 0000 and 0001 are genuinely recognised as applied
 * and 0002 is genuinely the only thing that runs. Nothing is hand-written into
 * `__drizzle_migrations`; a journal row invented by a test would prove only that the test can
 * invent journal rows.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS FILE NAMES 0002 BY TAG AND NEVER SAYS "THE LAST ONE"
 * ---------------------------------------------------------------------------------------
 *
 * It used to run everything up to the last journal entry and then point the REAL `drizzle/` folder
 * at the database, which was the same thing only while 0002 was the newest migration. Migration
 * 0003 arrived and this file started measuring 0003 while every sentence in it says 0002: the
 * "adds one table" test failed reporting five tables and two indexes, all of them 0003's.
 *
 * So both ends are pinned to the tag. `before` is every migration ahead of 0002 and `through` is
 * those plus 0002 itself, both read out of the journal, so a fourth or a fifth migration changes
 * nothing here. Whatever comes after 0002 is the business of the file that tests it.
 *
 * The same run was also done by hand against a COPY of the real ./data/panelx.db, with the row
 * counts read before and after. These tests deliberately do not read that file: a test that behaves
 * differently depending on whether somebody's working database is on disk reports different things
 * to different people.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'

import { COUNTED_TABLES, countRows, migrateInPlace } from '../src/server/db/migrate.ts'
import { GRAPH_DIRECTIONS, NODE_ROLES, STRUCTURE_SCOPE } from '../src/shared/presentation.ts'
import { aTestDatabaseFolder } from './a-test-folder.ts'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const MIGRATIONS = join(REPO, 'drizzle')
const TABLE = 'presentation_intent'

/**
 * The tag prefix of the migration this file is about.
 *
 * A prefix rather than the whole tag because drizzle mints the second half of the name itself, and
 * a rename of that half is not a change to which migration this is.
 */
const TAG = '0002_'

interface JournalEntry {
  idx: number
  when: number
  tag: string
  breakpoints: boolean
  version: string
}

function journal(folder: string): JournalEntry[] {
  const raw = JSON.parse(readFileSync(join(folder, 'meta', '_journal.json'), 'utf8')) as { entries: JournalEntry[] }
  return raw.entries
}

// ---------------------------------------------------------------------------- the fixture

interface Scratch {
  dir: string
  file: string
  db: Database.Database
}

const open: Scratch[] = []
const tempDirs: string[] = []

function scratch(name: string): Scratch {
  const dir = aTestDatabaseFolder(`presentation-${name}`)
  const file = join(dir, 'panelx.db')
  const db = new Database(file)
  // The same two pragmas db/client.ts sets, so the fixture behaves like the real connection.
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  const s = { dir, file, db }
  open.push(s)
  return s
}

afterEach(() => {
  for (const s of open.splice(0)) {
    if (s.db.open) s.db.close()
    rmSync(s.dir, { recursive: true, force: true })
  }
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true })
  // The folder is one of those temp directories, so the memo has to be dropped with them.
  throughCache = null
})

/** A migrations folder holding only the first `count` entries of the real one. */
function partialMigrations(count: number): string {
  const dir = aTestDatabaseFolder('presentation-partial')
  tempDirs.push(dir)
  mkdirSync(join(dir, 'meta'))
  const entries = journal(MIGRATIONS).slice(0, count)
  for (const entry of entries) copyFileSync(join(MIGRATIONS, `${entry.tag}.sql`), join(dir, `${entry.tag}.sql`))
  writeFileSync(join(dir, 'meta', '_journal.json'), JSON.stringify({ version: '7', dialect: 'sqlite', entries }))
  return dir
}

/** Where 0002 sits in the journal. Read from the journal, so a later migration cannot move it. */
function indexOfThisMigration(): number {
  const i = journal(MIGRATIONS).findIndex((e) => e.tag.startsWith(TAG))
  if (i <= 0) throw new Error(`no migration tagged ${TAG}* in drizzle/meta/_journal.json`)
  return i
}

/** The tag of 0002, for the one test that has to read its `.sql` file. */
function thisMigrationTag(): string {
  const entry = journal(MIGRATIONS)[indexOfThisMigration()]
  if (entry === undefined) throw new Error(`no migration tagged ${TAG}* in drizzle/meta/_journal.json`)
  return entry.tag
}

/**
 * A migrations folder ending at 0002, which is what every test here runs.
 *
 * Built once per test and reused, because drizzle decides what is already applied from the journal
 * `when` values and a second folder built from the same entries has to be the same folder for the
 * "run it twice" tests to be about the migration rather than about the fixture.
 */
let throughCache: string | null = null
function throughThisMigration(): string {
  return (throughCache ??= partialMigrations(indexOfThisMigration() + 1))
}

/**
 * The rows the fixture writes: what a real database holds, not the minimum a foreign key accepts.
 *
 * The Chinese title is not decoration. Titles here are often Chinese, like 倒片台安全护罩, and a migration that mangled
 * text encoding would pass every test written in ASCII.
 */
const SEED_RECORDS = [
  { id: 'rec-gripper', kind: 'module', title: '夹具标定', summary: 'gripper calibration' },
  { id: 'rec-camera', kind: 'module', title: 'LeafCam 2 overhead camera', summary: null },
  { id: 'rec-pipeline', kind: 'pipeline', title: 'Model-to-bench growth check', summary: null },
]

const SEED_LINKS = [{ id: 'link-blocks', fromId: 'rec-gripper', toId: 'rec-camera', type: 'blocks' }]

const SEED_CHANGES = [
  { id: 'chg-1', recordId: 'rec-gripper', op: 'create', actorType: 'human', actorId: THE_TEST_OFFICES_OWNER.id },
  { id: 'chg-2', recordId: 'rec-camera', op: 'create', actorType: 'agent', actorId: 'claude-code' },
]

function seed(db: Database.Database): void {
  const record = db.prepare(
    'INSERT INTO records (id, workspace_id, owner_id, created_at, updated_at, kind, title, summary, data) ' +
      `VALUES (?, 'default', '${THE_TEST_OFFICES_OWNER.id}', '2026-07-01 09:00:00', '2026-07-01 09:00:00', ?, ?, ?, '{}')`,
  )
  for (const r of SEED_RECORDS) record.run(r.id, r.kind, r.title, r.summary)

  const link = db.prepare(
    'INSERT INTO links (id, workspace_id, owner_id, created_at, updated_at, from_id, to_id, type, inferred, created_by) ' +
      `VALUES (?, 'default', '${THE_TEST_OFFICES_OWNER.id}', '2026-07-01 09:00:00', '2026-07-01 09:00:00', ?, ?, ?, 0, '${THE_TEST_OFFICES_OWNER.id}')`,
  )
  for (const l of SEED_LINKS) link.run(l.id, l.fromId, l.toId, l.type)

  const change = db.prepare(
    "INSERT INTO changes (id, record_id, op, actor_type, actor_id, at) VALUES (?, ?, ?, ?, ?, '2026-07-01 09:00:00')",
  )
  for (const c of SEED_CHANGES) change.run(c.id, c.recordId, c.op, c.actorType, c.actorId)
}

/** A database as it was after migration 0001, with real rows in it. The state a real one is in. */
function beforeThisMigration(name: string): Scratch {
  const s = scratch(name)
  migrateInPlace(s.db, partialMigrations(indexOfThisMigration()))
  seed(s.db)
  return s
}

// ---------------------------------------------------------------------------- reading the shape

interface ColumnInfo {
  name: string
  type: string
  notnull: number
  dflt_value: string | null
  pk: number
}

function columns(db: Database.Database, table: string): ColumnInfo[] {
  return db.prepare(`PRAGMA table_info("${table}")`).all() as ColumnInfo[]
}

function shapeOf(db: Database.Database): Map<string, string> {
  const rows = db
    .prepare("SELECT type, name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name")
    .all() as { type: string; name: string; sql: string | null }[]
  return new Map(rows.map((r) => [`${r.type} ${r.name}`, r.sql ?? '(no sql)']))
}

function counts(db: Database.Database): Record<string, number | null> {
  const out: Record<string, number | null> = {}
  for (const table of COUNTED_TABLES) out[table] = countRows(db, table)
  return out
}

// ============================================================================ additive only

describe('migration 0002 against a database that already has rows', () => {
  it('keeps every row in records, links and changes, and their contents', () => {
    const s = beforeThisMigration('additive')
    const before = counts(s.db)
    // `toMatchObject` and not `toEqual`: COUNTED_TABLES is every table that holds authored work,
    // which is eleven, and this fixture seeds three of them. Written out as the whole object it
    // was a second statement of which tables carry work, and it disagreed with the schema's from
    // the day the planning layer arrived.
    expect(before).toMatchObject({
      records: SEED_RECORDS.length,
      links: SEED_LINKS.length,
      changes: SEED_CHANGES.length,
    })

    const outcome = migrateInPlace(s.db, throughThisMigration())

    expect(outcome.newlyApplied).toBe(1)
    // NOTHING MOVED, said as a rule rather than as an expected object. This migration CREATES
    // `presentation_intent`, so that table goes from "no table" to 0 rows, which is not a loss —
    // and a table that came out with a row in it would be a migration inventing data.
    const after = counts(s.db)
    for (const table of COUNTED_TABLES) {
      const was = outcome.before[table]
      if (was === null) {
        // Absent before, and this fixture stops at 0002: the table is either the one this
        // migration creates (0 rows) or one a later migration has not created yet (still absent).
        // What it may never be is a table with a row in it, which would be a migration inventing
        // somebody's data.
        expect([null, 0], `${table} came out of the migration with rows in it`).toContain(outcome.after[table])
        expect([null, 0], `${table} came out of the migration with rows in it`).toContain(after[table])
      } else {
        expect(outcome.after[table], `${table} did not come through unchanged`).toBe(was)
        expect(after[table], `${table} did not come through unchanged`).toBe(was)
      }
    }

    // A rebuild-and-copy migration keeps the count and can still lose a column's values. The
    // Chinese title is the one most likely to come back mangled.
    const titles = (s.db.prepare('SELECT title FROM records ORDER BY id').all() as { title: string }[]).map(
      (r) => r.title,
    )
    expect(titles).toContain('夹具标定')
  })

  it('adds one table and edits no object that was already there', () => {
    const s = beforeThisMigration('one-table')
    const before = shapeOf(s.db)
    migrateInPlace(s.db, throughThisMigration())
    const after = shapeOf(s.db)

    // Nothing that existed may be changed or removed, character for character. Unlike 0001, which
    // appended two columns to `links`, this migration has NO exception: it touches no existing table.
    for (const [key, sql] of before) {
      expect(after.get(key), `0002 changed or removed ${key}`).toBe(sql)
    }
    const added = [...after.keys()].filter((k) => !before.has(k))
    expect(added).toEqual([`table ${TABLE}`])
  })

  it('creates the table with one row per target per scope per workspace', () => {
    const s = beforeThisMigration('shape')
    migrateInPlace(s.db, throughThisMigration())

    expect(columns(s.db, TABLE).map((c) => c.name)).toEqual([
      'workspace_id',
      'scope',
      'target',
      'intent',
      'updated_at',
      'updated_by',
    ])
    const pk = columns(s.db, TABLE)
      .filter((c) => c.pk > 0)
      .sort((a, b) => a.pk - b.pk)
      .map((c) => c.name)
    expect(pk).toEqual(['workspace_id', 'scope', 'target'])
  })

  it('has no column that could hold a coordinate, a size or a colour', () => {
    // The boundary in src/shared/presentation.ts, expressed as the one thing a schema can enforce
    // about it. Storing an x is refused at the write path with an explanation; this makes sure
    // there is nowhere for one to land even if that path is ever bypassed.
    const s = beforeThisMigration('no-geometry')
    migrateInPlace(s.db, throughThisMigration())
    const names = columns(s.db, TABLE).map((c) => c.name)
    for (const forbidden of ['x', 'y', 'pos_x', 'pos_y', 'width', 'height', 'left', 'top', 'coord', 'position', 'colour', 'color', 'style', 'css']) {
      expect(names, `${TABLE} has a ${forbidden} column`).not.toContain(forbidden)
    }
  })

  it('refuses a row with no time on it rather than inventing one in the wrong timezone', () => {
    // The same rule reader_anchors follows. A SQL default here would be `datetime('now')`, which is
    // UTC, and a stamp an hour out files an evening's work under tomorrow.
    const s = beforeThisMigration('no-default-time')
    migrateInPlace(s.db, throughThisMigration())
    const updatedAt = columns(s.db, TABLE).find((c) => c.name === 'updated_at')
    expect(updatedAt?.notnull).toBe(1)
    expect(updatedAt?.dflt_value).toBeNull()

    expect(() =>
      s.db
        .prepare(`INSERT INTO ${TABLE} (workspace_id, scope, target, intent, updated_by) VALUES (?, ?, ?, ?, ?)`)
        .run('default', STRUCTURE_SCOPE, 'rec-gripper', '{}', `human:${THE_TEST_OFFICES_OWNER.id}`),
    ).toThrow(/NOT NULL/i)
  })

  it('holds what the vocabulary allows, and one row per target and no more', () => {
    const s = beforeThisMigration('holds')
    migrateInPlace(s.db, throughThisMigration())

    const insert = s.db.prepare(
      `INSERT INTO ${TABLE} (workspace_id, scope, target, intent, updated_at, updated_by) VALUES (?, ?, ?, ?, ?, ?)`,
    )
    // A lane named in Chinese, because a lane is a name a person chooses and the names here are mixed.
    const intent = JSON.stringify({ lane: '夹爪与力控', role: NODE_ROLES[2], order: 1 })
    insert.run('default', STRUCTURE_SCOPE, 'rec-gripper', intent, '2026-08-10 11:00:00', 'agent:claude-code')
    insert.run(
      'default',
      'pipeline:rec-pipeline',
      '(scope)',
      JSON.stringify({ direction: GRAPH_DIRECTIONS[1] }),
      '2026-08-10 11:00:01',
      `human:${THE_TEST_OFFICES_OWNER.id}`,
    )

    const stored = s.db.prepare(`SELECT intent FROM ${TABLE} WHERE scope = ? AND target = ?`).get(
      STRUCTURE_SCOPE,
      'rec-gripper',
    ) as { intent: string }
    expect(JSON.parse(stored.intent)).toEqual({ lane: '夹爪与力控', role: 'prominent', order: 1 })

    // Arranging the same module in the same drawing twice is one arrangement, changed — not a
    // second opinion sitting beside the first.
    expect(() =>
      insert.run('default', STRUCTURE_SCOPE, 'rec-gripper', '{}', '2026-08-10 12:00:00', `human:${THE_TEST_OFFICES_OWNER.id}`),
    ).toThrow(/UNIQUE|PRIMARY KEY/i)
    expect(countRows(s.db, TABLE)).toBe(2)
  })

  it('keeps the same module’s intent in two scopes apart', () => {
    const s = beforeThisMigration('two-scopes')
    migrateInPlace(s.db, throughThisMigration())
    const insert = s.db.prepare(
      `INSERT INTO ${TABLE} (workspace_id, scope, target, intent, updated_at, updated_by) VALUES (?, ?, ?, ?, ?, ?)`,
    )
    insert.run('default', STRUCTURE_SCOPE, 'rec-camera', '{"role":"prominent"}', '2026-08-10 11:00:00', `human:${THE_TEST_OFFICES_OWNER.id}`)
    insert.run('default', 'pipeline:rec-pipeline', 'rec-camera', '{"role":"compact"}', '2026-08-10 11:00:00', `human:${THE_TEST_OFFICES_OWNER.id}`)

    const rows = s.db
      .prepare(`SELECT scope, intent FROM ${TABLE} WHERE target = ? ORDER BY scope`)
      .all('rec-camera') as { scope: string; intent: string }[]
    expect(rows.map((r) => JSON.parse(r.intent).role)).toEqual(['compact', 'prominent'])
  })
})

// ============================================================================ running it twice

describe('running the migrations twice with 0002 in them', () => {
  it('applies 0002 once and changes nothing the second time or the third', () => {
    const s = beforeThisMigration('twice')
    const first = migrateInPlace(s.db, throughThisMigration())
    const shapeAfterFirst = shapeOf(s.db)
    const countsAfterFirst = counts(s.db)

    const second = migrateInPlace(s.db, throughThisMigration())
    const third = migrateInPlace(s.db, throughThisMigration())

    expect(first.newlyApplied).toBe(1)
    expect(second.newlyApplied).toBe(0)
    expect(third.newlyApplied).toBe(0)
    expect(shapeOf(s.db)).toEqual(shapeAfterFirst)
    expect(counts(s.db)).toEqual(countsAfterFirst)
  })

  it('does not lose stored intent when the migrations are run again over it', () => {
    const s = beforeThisMigration('keeps-intent')
    migrateInPlace(s.db, throughThisMigration())
    s.db
      .prepare(
        `INSERT INTO ${TABLE} (workspace_id, scope, target, intent, updated_at, updated_by) VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run('default', STRUCTURE_SCOPE, 'rec-gripper', '{"emphasis":"safety"}', '2026-08-10 11:00:00', 'agent:claude-code')

    migrateInPlace(s.db, throughThisMigration())

    const row = s.db.prepare(`SELECT intent, updated_by FROM ${TABLE}`).get() as {
      intent: string
      updated_by: string
    }
    expect(JSON.parse(row.intent)).toEqual({ emphasis: 'safety' })
    expect(row.updated_by).toBe('agent:claude-code')
  })

  it('is safe on a database that has never been migrated at all', () => {
    const s = scratch('fresh')
    const first = migrateInPlace(s.db, throughThisMigration())
    const second = migrateInPlace(s.db, throughThisMigration())
    // Everything up to and including 0002, which is what this folder holds.
    expect(first.newlyApplied).toBe(indexOfThisMigration() + 1)
    expect(second.newlyApplied).toBe(0)
    expect(countRows(s.db, TABLE)).toBe(0)
  })

  it('survives the table already existing, which is what IF NOT EXISTS is for', () => {
    // This is the failure the hand-added `IF NOT EXISTS` prevents: a bare CREATE TABLE stops the
    // whole migration on `table … already exists`, out of a command whose job is to be run again.
    //
    // It stopped being hypothetical for 0003. Five tables used to be created outside the migration
    // system by an `ensure*` function running at import, so they exist in every database anybody
    // has ever run this server against, and 0003's job was to bring them inside. Those functions
    // are gone now; the guard on this migration is what keeps the rule true for the next one.
    const s = beforeThisMigration('already-there')
    const sql = readFileSync(join(MIGRATIONS, `${thisMigrationTag()}.sql`), 'utf8')
    s.db.exec(sql)
    expect(countRows(s.db, TABLE)).toBe(0)

    expect(() => migrateInPlace(s.db, throughThisMigration())).not.toThrow()
    expect(counts(s.db)).toMatchObject({
      records: SEED_RECORDS.length,
      links: SEED_LINKS.length,
      changes: SEED_CHANGES.length,
    })
  })
})
