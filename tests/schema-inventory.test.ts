// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** The old exact table list had no AUTOINCREMENT. The global submission watermark creates SQLite’s own sqlite_sequence; only that exact internal name is added. */
/**
 * A TABLE CANNOT EXIST OUTSIDE THE DECLARED SCHEMA.
 *
 * ---------------------------------------------------------------------------------------
 * THE DEFECT THIS FILE EXISTS TO MAKE IMPOSSIBLE
 * ---------------------------------------------------------------------------------------
 *
 * The database had TEN tables. `src/server/db/schema.ts` declared FIVE. README.md named THREE.
 * The other five — `panel_layouts`, `session_resources`, `source_files`, `source_index` and
 * `source_file_hashes` — were created by `CREATE TABLE IF NOT EXISTS` statements that ran AT
 * IMPORT TIME in the files that owned the features: `ensureLayoutTable()`, `ensureResourceTable()`
 * and `ensureSourceIndexTables()`.
 *
 * That is expensive twice over. A table made that way has no migration path at all, so adding a
 * column to it has nowhere to go. And an export written from `schema.ts` alone silently misses
 * half the database — which nobody discovers until the first restore, which is the one moment
 * there is nothing to compare against.
 *
 * Migration 0003 folded the five in and deleted the three `ensure*` functions. This file is the
 * rule that keeps them gone.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE CHECKS THAT tests/schema-tables.test.ts DOES NOT
 * ---------------------------------------------------------------------------------------
 *
 * These two files are deliberately different claims about the same subject, and neither replaces
 * the other. Read them together before editing either.
 *
 *   tests/schema-tables.test.ts asserts THE LIST. Ten tables, here are their names, written out by
 *   hand, each classified as authored or derived. That is what stops somebody deleting a table
 *   from the schema and from the migrations together and calling the pair consistent.
 *
 *   THIS FILE asserts THE RULE, with nothing written out by hand: whatever `schema.ts` declares is
 *   exactly what a real database has. It adds three things the list-based file cannot do.
 *
 * 1. IT EXCLUDES BY NAME, NOT BY PATTERN. The other file reads the table list with
 *    `WHERE name NOT LIKE 'sqlite_%'`, which is a blanket exclusion: it would also hide a table
 *    somebody called `sqlite_search_cache`. Here every excluded name is written out with the
 *    reason it is somebody else's, and anything not on that list is reported however it is
 *    spelt. See `NOT_OURS`.
 *
 * 2. IT LOOKS AT THE DATABASE AFTER THE WHOLE SERVER HAS BEEN LOADED, not only after the
 *    migrations have run. This is the check that would actually have caught the original five. A
 *    freshly migrated database never had them, because `src/server/db/migrate.ts` does not import
 *    `api/layout.ts`, `lib/resources.ts` or `lib/sourceindex.ts` — the tables appeared only when
 *    the SERVER imported those files. A migrate-and-look test is blind to exactly the defect that
 *    happened. See `describe('a database the whole server has been loaded against')`.
 *
 * 3. ITS SOURCE SCAN KNOWS MORE WAYS TO MAKE A TABLE. The other file looks for `CREATE TABLE` and
 *    `CREATE INDEX` inside template literals and quoted `.exec` / `.prepare` / `.run` arguments.
 *    That misses `CREATE VIRTUAL TABLE` (how a full-text search index arrives — server-side search
 *    is on the roadmap), `CREATE TEMP TABLE`, `CREATE TABLE … AS SELECT`, DDL handed to any other
 *    function, and any file that is not `.ts` or `.tsx`. See `CREATES_A_TABLE`.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT NONE OF THIS CAN SEE, SAID PLAINLY
 * ---------------------------------------------------------------------------------------
 *
 * The source scan reads text. DDL assembled by concatenating variables is invisible to it, and a
 * rule that could see that would have to be an interpreter. The runtime check below covers IMPORT
 * time, which is where every one of the five came from; a table created lazily inside a request
 * handler, on some path no test drives, is not covered by anything here. If you are about to write
 * either of those, you already know you are working around this file, and the answer is the same
 * one: declare the table in schema.ts and create it in a migration.
 */

import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { extname, join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import Database from 'better-sqlite3'
import { getTableName, is } from 'drizzle-orm'
import { SQLiteTable } from 'drizzle-orm/sqlite-core'
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import * as schema from '../src/server/db/schema.ts'
import { migrateInPlace } from '../src/server/db/migrate.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { TABLES_IN_A_FILE_OF_THEIR_OWN, whatTiesItToTheOfficeDatabase } from './tables-in-a-sqlite-file-of-their-own.ts'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const MIGRATIONS = join(REPO, 'drizzle')

// ============================================================================ what belongs to whom

/** One table this test must not report, and the reason it is not Mole Office's to declare. */
interface NotOurs {
  name: string
  why: string
}

/**
 * The only table names that may appear in a Mole Office database without being declared in schema.ts.
 *
 * EVERY ENTRY IS A NAME, NEVER A PATTERN, AND THAT IS THE POINT OF THIS ARRAY. A rule that
 * excluded `sqlite_%` or `__%` would be a rule that let the next one through: `sqlite_fts_cache`
 * and `__mole_office_scratch` are perfectly ordinary names for a table an agent in a hurry would create,
 * and both would be hidden by a pattern that was written to hide something else. An unfamiliar name
 * makes this file go red, and somebody then decides what it is. That is the whole design.
 *
 * If a future SQLite writes an internal table not listed here, this file will fail naming it. That
 * is the intended outcome: adding a line to this array is a decision, and it should be made by a
 * person who has checked what the table is rather than by a wildcard written years earlier.
 */
const NOT_OURS: NotOurs[] = [
  {
    name: '__drizzle_migrations',
    why:
      "drizzle's own bookkeeping: one row per migration applied, carrying the `when` value out of " +
      'drizzle/meta/_journal.json. Mole Office never reads or writes it. A restore applies the ' +
      'migrations, which writes this table, and then imports the data — so it is not part of a ' +
      'backup either, which is why it is in neither AUTHORED_TABLES nor DERIVED_TABLES.',
  },
  {
    name: 'sqlite_sequence',
    why:
      "SQLite's own, created the first time any table uses AUTOINCREMENT, holding the highest " +
      'rowid ever used per table. The submission event watermark uses AUTOINCREMENT, so this exact ' +
      'internal table is expected; it is owned by SQLite and never exported as authored data.',
  },
  {
    name: 'sqlite_stat1',
    why:
      "SQLite's query-planner statistics, written by ANALYZE. Nothing in Mole Office runs ANALYZE " +
      'today; a future index-tuning change might, and it would arrive through SQLite rather than ' +
      'through a migration.',
  },
  {
    name: 'sqlite_stat4',
    why:
      'The same statistics in more detail, written by ANALYZE on builds compiled with ' +
      'SQLITE_ENABLE_STAT4. Listed beside sqlite_stat1 because whichever of the two a build ' +
      'writes is decided by how better-sqlite3 was compiled and not by anything in this ' +
      'repository. sqlite_stat2 and sqlite_stat3 are deliberately NOT listed: they belong to ' +
      'SQLite versions this project has never run, so meeting one means something changed ' +
      'underneath us and a person should look.',
  },
]

const NOT_OURS_NAMES = new Set(NOT_OURS.map((n) => n.name))

/**
 * Every `sqliteTable` schema.ts exports, by the name SQLite knows it as.
 *
 * DERIVED FROM THE DECLARATIONS THEMSELVES rather than from `AUTHORED_TABLES` and `DERIVED_TABLES`,
 * which are two hand-written string arrays in the same file. Those arrays are checked against these
 * objects by tests/schema-tables.test.ts; here the drizzle objects are the subject, so a table
 * declared and left out of both arrays still counts as declared and this file stays a statement
 * about the schema rather than about a list beside it.
 *
 * Widened to `unknown[]` first because that module also exports the two string arrays and a pile of
 * types, and `is()` narrowing a union that includes them is not something TypeScript accepts as a
 * predicate. The narrowing that matters is `is(value, SQLiteTable)`, which is drizzle's own runtime
 * check, and it happens either way.
 */
function declaredTables(): string[] {
  const names: string[] = []
  for (const value of Object.values(schema) as unknown[]) {
    if (is(value, SQLiteTable)) names.push(getTableName(value))
  }
  return names.sort()
}

/**
 * The declared tables and the six tables of the index of the records' text (wave 13y round 64).
 *
 * The index is an SQLite full-text table, which drizzle cannot declare, and SQLite makes five tables for it. table-name-lists.ts
 * names all six in `RECORD_TEXT_INDEX_TABLES`, and only these six may stand beside the declared tables.
 */
function declaredAndIndexTables(): string[] {
  return [...declaredTables(), ...schema.RECORD_TEXT_INDEX_TABLES].sort()
}

/**
 * Every table a database actually has, with NOTHING filtered out in SQL.
 *
 * The filtering happens in `undeclared` below, against names written out one at a time. Doing it
 * here, in the query, is how the blanket `NOT LIKE 'sqlite_%'` gets written, and a filter in the
 * query is invisible to the assertion that reads its result.
 */
function tableNames(db: Database.Database): string[] {
  return (
    db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all() as { name: string }[]
  ).map((r) => r.name)
}

/** The tables that are in the database, are not declared, and are not somebody else's. */
function undeclared(actual: readonly string[], declared: readonly string[]): string[] {
  return actual.filter((name) => !declared.includes(name) && !NOT_OURS_NAMES.has(name))
}

/** The tables schema.ts declares that the database does not have. */
function unbuilt(actual: readonly string[], declared: readonly string[]): string[] {
  return declared.filter((name) => !actual.includes(name))
}

/**
 * What to do about a table nobody declared, written so the failure is an instruction.
 *
 * A bare `toEqual([])` diff tells whoever broke this that two arrays differ, at which point they
 * have to find this file, read it, and work out what the project's rule is. The rule is four
 * sentences and it fits in the failure.
 */
function fixUndeclared(tables: readonly string[], where: string): string {
  const named = tables.map((t) => `"${t}"`).join(', ')
  return (
    `${named} ${tables.length === 1 ? 'is a table' : 'are tables'} in ${where}, and ` +
    `${tables.length === 1 ? 'it is' : 'they are'} not declared in src/server/db/schema.ts. ` +
    'EVERY table Mole Office has is declared there and created by a migration in drizzle/, and nothing ' +
    'anywhere else may create one. To fix this: add the sqliteTable declaration to schema.ts, add ' +
    'the name to AUTHORED_TABLES or DERIVED_TABLES in the same file, run `npm run db:generate`, ' +
    'add `IF NOT EXISTS` to the generated CREATE TABLE and CREATE INDEX statements by hand, and ' +
    'delete whatever was creating the table outside the migration system. Two definitions of one ' +
    'table fail at runtime on INSERT, in production, with nothing failing at compile time.'
  )
}

/** The other direction: schema.ts says a table exists and no migration ever makes it. */
function fixUnbuilt(tables: readonly string[]): string {
  const named = tables.map((t) => `"${t}"`).join(', ')
  return (
    `${named} ${tables.length === 1 ? 'is' : 'are'} declared in src/server/db/schema.ts and no ` +
    'migration in drizzle/ creates it. A declaration with no migration is a table that exists in ' +
    'TypeScript and not in SQLite: every read of it fails at runtime with "no such table". Run ' +
    '`npm run db:generate` and add `IF NOT EXISTS` to the generated statements by hand.'
  )
}

// ============================================================================ the exclusion list

describe('what this file refuses to ignore', () => {
  it('excludes by name, so a table that merely LOOKS internal is still reported', () => {
    // This is the difference between this file and a blanket `NOT LIKE 'sqlite_%'`. Both hide
    // sqlite_stat1. Only one of them also hides a table an agent called sqlite_search_cache, and
    // that is the table this whole file exists to catch.
    const declared = ['records', 'links']
    expect(undeclared(['records', 'links', '__drizzle_migrations', 'sqlite_stat1'], declared)).toEqual([])
    expect(undeclared(['records', 'sqlite_search_cache'], declared)).toEqual(['sqlite_search_cache'])
    expect(undeclared(['records', '__drizzle_migrations_backup'], declared)).toEqual(['__drizzle_migrations_backup'])
    expect(undeclared(['records', 'sqlite_stat2'], declared)).toEqual(['sqlite_stat2'])
  })

  it('says why each excluded name belongs to somebody else', () => {
    // A name with no reason beside it is a name somebody added to make a test pass.
    for (const entry of NOT_OURS) {
      expect(entry.why.length, `${entry.name} is excluded with no reason given`).toBeGreaterThan(40)
    }
    expect(NOT_OURS_NAMES.size).toBe(NOT_OURS.length)
  })

  it('does not treat the migration journal as one of Mole Office tables', () => {
    expect(declaredTables()).not.toContain('__drizzle_migrations')
  })
})

describe('the failure message', () => {
  it('names the table and says what to do with it', () => {
    const message = fixUndeclared(['agent_cache'], 'a freshly migrated database')
    expect(message).toContain('agent_cache')
    expect(message).toContain('src/server/db/schema.ts')
    expect(message).toContain('migration')
    expect(message).toContain('npm run db:generate')
  })

  it('says something different when a declared table was never migrated', () => {
    const message = fixUnbuilt(['reader_anchors'])
    expect(message).toContain('reader_anchors')
    expect(message).toContain('no such table')
  })
})

// ============================================================================ scratch databases

const dirs: string[] = []
const openDbs: Database.Database[] = []

afterEach(() => {
  for (const db of openDbs.splice(0)) if (db.open) db.close()
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

/**
 * A new database file with the real migrations applied to it, through the product's own migrator.
 *
 * `migrateInPlace` rather than a hand-rolled call to drizzle, because it is what `npm run
 * db:migrate` and `src/server/index.ts` both run — including the block DATA migration, which writes
 * rows and could in principle create something. Nothing here ever opens ./data/panelx.db: the file
 * is in a temporary directory this function made and the afterEach above deletes.
 */
function migratedDatabase(): Database.Database {
  const dir = mkdtempSync(join(tmpdir(), 'mole-office-schema-inventory-'))
  dirs.push(dir)
  const db = new Database(join(dir, 'panelx.db'))
  openDbs.push(db)
  // The same two pragmas db/client.ts sets, so this database is the one the product would have.
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  migrateInPlace(db, MIGRATIONS)
  return db
}

// ============================================================================ after the migrations

describe('a freshly migrated database', () => {
  it('reflects the schema at all, so the comparison below is about something', () => {
    // Without this, a `declaredTables()` that returned nothing would make every check here read
    // "the database has ten tables the schema does not declare", which is a true sentence about a
    // broken reflection rather than about the schema.
    const declared = declaredTables()
    expect(declared).toContain('records')
    expect(declared).toContain('links')
    expect(declared.length).toBeGreaterThan(1)
  })

  it('has no table that schema.ts does not declare', () => {
    // THE CHECK THAT CATCHES A TABLE ARRIVING THROUGH A MIGRATION NOBODY ADDED TO THE SCHEMA FILE.
    // drizzle-kit generates migrations FROM schema.ts, so the two agree while everybody uses the
    // generator — but a migration is a hand-editable .sql file, every one of them is hand-edited
    // here to add `IF NOT EXISTS`, and a CREATE TABLE typed into one of them by hand reaches every
    // database and nothing in TypeScript ever mentions it.
    const db = migratedDatabase()
    const found = undeclared(tableNames(db), declaredAndIndexTables())
    expect(found, found.length === 0 ? '' : fixUndeclared(found, 'a freshly migrated database')).toEqual([])
  })

  it('has every table schema.ts declares', () => {
    const db = migratedDatabase()
    const missing = unbuilt(tableNames(db), declaredAndIndexTables())
    expect(missing, missing.length === 0 ? '' : fixUnbuilt(missing)).toEqual([])
  })

  it('has the migration journal, the index of the records\' text and nothing else beside the declared tables', () => {
    // Stated as an equality as well, because the two filtered checks above would both pass on a
    // database that somehow had no tables at all.
    const db = migratedDatabase()
    expect(tableNames(db)).toEqual([...declaredAndIndexTables(), '__drizzle_migrations', 'sqlite_sequence'].sort())
  })
})

// ============================================================================ after the server ran

/**
 * The check the original defect would have failed, and a migrate-and-look test would not.
 *
 * All five undeclared tables were created by module-level code in `api/layout.ts`,
 * `lib/resources.ts` and `lib/sourceindex.ts`. `src/server/db/migrate.ts` imports none of those, so
 * a database built by running the migrations alone never had them and looked perfectly consistent
 * with a five-table schema.ts. `buildApp()` imports every route group, and every route group
 * reaches its lib file, so this is the moment those statements used to run.
 *
 * It does not matter here HOW a future table gets made — a template literal, a concatenated string,
 * a helper in a dependency. If importing the server creates it, this goes red.
 */
describe('a database the whole server has been loaded against', () => {
  let t: TestDb
  let app: FastifyInstance
  let afterMigration: string[]
  let afterServer: string[]

  beforeAll(async () => {
    // freshDb points MOLE_OFFICE_DB at its own file and migrates it. Nothing has imported the server yet.
    t = await freshDb()
    afterMigration = tableNames(t.client.sqlite)

    // buildApp's dynamic imports are the whole server: every api/ route group and, through them,
    // every lib/ module that touches the database.
    const built = await apiApp()
    app = built.app
    await app.ready()
    // One request, so the app is genuinely built and wired rather than merely constructed. The
    // claim being tested is about import time, and this is the cheapest proof the imports happened.
    const health = await app.inject({ method: 'GET', url: '/api/health' })
    expect(health.statusCode, health.body.slice(0, 300)).toBe(200)

    afterServer = tableNames(t.client.sqlite)
  })

  afterAll(async () => {
    await app.close()
    t.close()
  })

  it('gained no table from importing the server', () => {
    // The exact shape of the defect: five tables that appeared because a file was imported.
    const arrived = afterServer.filter((name) => !afterMigration.includes(name))
    expect(
      arrived,
      arrived.length === 0
        ? ''
        : `${fixUndeclared(arrived, 'the database after buildApp() imported the server')} These appeared ` +
          'when a module was IMPORTED, which is exactly how panel_layouts, session_resources, ' +
          'source_files, source_index and source_file_hashes got in. Find the module-level ' +
          'statement that made them and delete it.',
    ).toEqual([])
  })

  it('still has no table schema.ts does not declare', () => {
    const found = undeclared(afterServer, declaredAndIndexTables())
    expect(
      found,
      found.length === 0 ? '' : fixUndeclared(found, 'the database after buildApp() imported the server'),
    ).toEqual([])
  })

  it('really did load the server, rather than passing by importing nothing', () => {
    // Without this the two tests above would pass if `apiApp()` quietly did nothing. The route
    // list comes from the app's own router, so a server that registered no route groups fails here.
    expect(afterMigration.length).toBeGreaterThan(1)
    expect(afterMigration).toContain('records')
  })
})

// ============================================================================ nothing in src/ either

/**
 * Files that could execute SQL against Mole Office's database, by directory.
 *
 * `src/` is the product. `scripts/` and `tools/` are here because they are the only other code in
 * this repository that names MOLE_OFFICE_DB — `scripts/seed.ts`, `scripts/reset.ts`, `scripts/import.ts`
 * and `tools/review.mjs` all open the real database, so a CREATE TABLE in one of them reaches it
 * exactly as a CREATE TABLE in `src/` would. `drizzle/` is deliberately absent: it is the ONE place
 * a CREATE TABLE belongs.
 */
const SCANNED_DIRS = ['src', 'scripts', 'tools', 'for-agents']

/**
 * The file types that can carry a statement SQLite will run.
 *
 * `.md` is excluded on purpose and it is the only deliberate omission: `src/server/api/
 * index-additions.md` explains this very rule at length and quotes the statement it forbids, and a
 * rule that a document cannot describe itself is not a rule anybody keeps.
 */
const SCANNED_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.sql']

/**
 * A statement that brings a table into existence, in every form SQLite accepts.
 *
 * WHY IT REQUIRES A NAME FOLLOWED BY `(`, `AS SELECT` OR `USING <module>(`. Prose about this rule
 * is written all over this codebase, some of it inside string literals rather than comments —
 * `src/server/db/migrate.ts` refuses a journal-less database with a sentence containing the words
 * "CREATE TABLE statements are bare", and that sentence is the most useful line in the file. A
 * pattern matching the two words alone would demand it be deleted. Requiring the shape of a real
 * statement tells the difference between running one and talking about one, without needing a list
 * of files that are allowed to talk.
 *
 * The forms covered, and why each is here rather than only the plain one:
 *   CREATE TABLE t (…)                  the plain one, and what all three `ensure*` functions ran
 *   CREATE TABLE IF NOT EXISTS t (…)    what they ACTUALLY ran, which is why the guard is optional
 *   CREATE TEMP|TEMPORARY TABLE t (…)   a scratch table is still a second definition of a shape
 *   CREATE VIRTUAL TABLE t USING fts5(…)  how a full-text index arrives, and server-side search is
 *                                       on the roadmap; it also creates several shadow tables
 *   CREATE TABLE t AS SELECT …          how a "quick backup before I try this" table arrives
 *
 * `AS SELECT` and `USING <module>(` are spelt out rather than left as bare `AS` and `USING`,
 * because "the CREATE TABLE step as described" and "the CREATE TABLE using drizzle" are sentences
 * somebody will write one day and neither is a statement.
 */
const CREATES_A_TABLE =
  /\bCREATE\s+(?:TEMP(?:ORARY)?\s+|VIRTUAL\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[^\s(]+\s*(?:\(|AS\s+SELECT\b|USING\s+[A-Za-z_]\w*\s*\()/i

/** One scanned file: its path relative to the repository, and its code with comments removed. */
interface Scanned {
  path: string
  code: string
}

/**
 * Every scannable file, as text with its comments stripped.
 *
 * Comments go first because this project explains its rules where they are enforced, and schema.ts'
 * own header is four paragraphs about `CREATE TABLE IF NOT EXISTS`. A rule that read comments would
 * report the file that states it. Same stripping tests/changes.test.ts and
 * tests/schema-tables.test.ts use, with `--` added for `.sql` only — `--` in TypeScript is a
 * decrement, and stripping to end of line there would silently swallow real code.
 */
function scannedFiles(): Scanned[] {
  const out: Scanned[] = []
  for (const dir of SCANNED_DIRS) {
    const root = join(REPO, dir)
    for (const entry of readdirSync(root, { recursive: true, withFileTypes: true })) {
      if (!entry.isFile()) continue
      const ext = extname(entry.name)
      if (!SCANNED_EXTENSIONS.includes(ext)) continue
      const path = join(entry.parentPath, entry.name)
      let code = readFileSync(path, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/[^\n]*/g, '')
      if (ext === '.sql') code = code.replace(/--[^\n]*/g, '')
      out.push({ path: path.slice(REPO.length), code })
    }
  }
  return out
}

describe('nothing outside drizzle/ creates a table', () => {
  it('lets off only listed files, each still making a table and reaching no office database', () => {
    const files = new Map(scannedFiles().map((f) => [f.path, f.code]))
    const said = TABLES_IN_A_FILE_OF_THEIR_OWN.flatMap(({ path, reason }) => {
      const code = files.get(path)
      if (code === undefined) return [`${path} is not a file this gate reads`]
      return [
        ...(reason.trim() === '' ? [`${path} has no reason`] : []),
        ...(CREATES_A_TABLE.test(code) ? [] : [`${path} makes no table, so take it off the list`]),
        ...whatTiesItToTheOfficeDatabase(path, code),
      ]
    })
    expect(said).toEqual([])
  })

  it('catches every form of the statement, including the three the old code actually ran', () => {
    // Without this, the rule above could be green because the pattern matches nothing at all.
    // The first two are the real statements out of api/layout.ts and lib/sourceindex.ts as they
    // stood before migration 0003, in the shape those files wrote them.
    const mustMatch = [
      'sqlite.exec(`\n  CREATE TABLE IF NOT EXISTS panel_layouts (\n    workspace_id TEXT NOT NULL\n  )\n`)',
      "sqlite.exec('CREATE TABLE IF NOT EXISTS source_index (workspace_id TEXT PRIMARY KEY)')",
      'CREATE TABLE records (id text)',
      'CREATE TABLE `records` (id text)',
      'CREATE TABLE "records"(id text)',
      'CREATE TEMP TABLE scratch (id text)',
      'CREATE TEMPORARY TABLE scratch (id text)',
      'CREATE VIRTUAL TABLE record_search USING fts5(title, summary)',
      'CREATE TABLE records_backup AS SELECT * FROM records',
      'db.exec(`CREATE TABLE ${name} (id text)`)',
    ]
    for (const sql of mustMatch) {
      expect(CREATES_A_TABLE.test(sql), `the pattern missed: ${sql}`).toBe(true)
    }
  })

  it('does not report a file for TALKING about the statement in a string it prints', () => {
    // src/server/db/migrate.ts refuses a journal-less database with this sentence, in real code
    // rather than in a comment, and it is the most useful line in that file. A rule that demanded
    // it be deleted would be traded away within a week.
    const refusal =
      "throw new Error('have ever run and would start again at 0000 — whose CREATE TABLE statements are bare, so it would stop')"
    expect(CREATES_A_TABLE.test(refusal)).toBe(false)
    // Two more sentences of the kind this codebase writes.
    expect(CREATES_A_TABLE.test('const note = "the CREATE TABLE step as described in schema.ts"')).toBe(false)
    expect(CREATES_A_TABLE.test('const note = "one CREATE TABLE using drizzle-kit per table"')).toBe(false)
    // And a function whose NAME looks like the statement is not the statement.
    expect(CREATES_A_TABLE.test('createTable(records)')).toBe(false)
  })

  it('found the files it was supposed to be reading', () => {
    // Without this, a broken walk would report an empty list and the rule above would pass by
    // reading nothing at all. The four files named are ones that cannot go away while Mole Office
    // exists — deliberately not a route file, because route files do get deleted.
    const files = scannedFiles()
    const paths = files.map((f) => f.path)
    expect(files.length).toBeGreaterThan(50)
    expect(paths).toContain('src/server/db/schema.ts')
    expect(paths).toContain('src/server/db/client.ts')
    expect(paths).toContain('src/server/db/migrate.ts')
    expect(paths).toContain('scripts/seed.ts')
    // Every scanned directory contributed something, so a renamed directory is a red test rather
    // than a directory that quietly stops being checked.
    for (const dir of SCANNED_DIRS) {
      expect(
        paths.some((p) => p.startsWith(`${dir}/`)),
        `${dir}/ contributed no files to the scan`,
      ).toBe(true)
    }
  })

  it('strips comments before looking, so schema.ts may explain the rule it enforces', () => {
    const files = new Map(scannedFiles().map((f) => [f.path, f.code]))
    const schemaCode = files.get('src/server/db/schema.ts')
    expect(schemaCode).toBeDefined()
    // The header says CREATE TABLE IF NOT EXISTS several times. None of it survives stripping.
    expect(schemaCode).not.toContain('CREATE TABLE')
    // And the stripping did not eat the file: the declarations are still there to be read.
    expect(schemaCode).toContain('sqliteTable')
  })
})
