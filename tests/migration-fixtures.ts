// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT THE MIGRATION TESTS SHARE, and what each migration says it adds, one file per migration.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS IS NOT IN tests/migration.test.ts
 * ---------------------------------------------------------------------------------------
 *
 * Every branch that brought a migration used to edit the same lists in tests/migration.test.ts: the
 * sorted list of tables, the indexes and the columns added after the rebuild. So any two migration
 * entries changed one file, and the merge queue judged them by file and tested them one at a time
 * (wave 13v round 18). The lists that were there stay as lists: the tables and indexes in
 * tests/migration.test.ts and the columns in tests/migration-fixtures.ts, because a second test
 * reads the columns. A NEW MIGRATION ADDS ITS OWN FILE
 * instead: `tests/what-each-migration-adds/<its tag>.json`, read here. A new migration's own cases go
 * in a test file of its own, `tests/migration-<number>-<what it proves>.test.ts`, with the helpers
 * below, and not between the cases of tests/migration.test.ts.
 *
 * A FILE THAT CANNOT BE READ FAILS THE TESTS, and says why: a name declared twice, a tag the journal
 * does not hold, a key this reader does not know, or a list that is not a list of names.
 */
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import Database from 'better-sqlite3'
import { afterEach } from 'vitest'

export const REPO = fileURLToPath(new URL('..', import.meta.url))
export const MIGRATIONS = join(REPO, 'drizzle')
/** The folder of declarations, one file per migration that adds a table, or an index or a column after the rebuild. */
export const WHAT_EACH_MIGRATION_ADDS = join(REPO, 'tests', 'what-each-migration-adds')

/** Every migration file, in the order the journal applies them. */
export interface JournalEntry {
  idx: number
  when: number
  tag: string
  breakpoints: boolean
  version: string
}

export function journal(folder: string): JournalEntry[] {
  const raw = JSON.parse(readFileSync(join(folder, 'meta', '_journal.json'), 'utf8')) as {
    entries: JournalEntry[]
  }
  return raw.entries
}

/**
 * How many migrations come before the one whose tag starts with this prefix.
 *
 * ASK FOR THE FILE BY NAME. Two fixtures used to say `journal(MIGRATIONS).length - 1` to mean
 * "everything up to the rebuild", which was true until 0005 was added and then quietly meant
 * something else — a fixture that had stopped describing the thing its describe block is named
 * after, with no test failing. Read from the journal rather than written as a number, so a
 * migration inserted before this one moves the fixture with it.
 */
export function migrationsBefore(tagPrefix: string): number {
  const i = journal(MIGRATIONS).findIndex((e) => e.tag.startsWith(tagPrefix))
  if (i <= 0) throw new Error(`no migration tagged ${tagPrefix}* in drizzle/meta/_journal.json`)
  return i
}

/** Everything one test needs: a database file, an open connection, and a way to throw both away. */
export interface Scratch {
  dir: string
  file: string
  db: Database.Database
}

const open: Scratch[] = []
/** Temporary directories with no connection of their own, removed by the same afterEach. */
const tempDirs: string[] = []

/** A temporary directory removed after the test that made it. */
export function throwAwayAfterTheTest(dir: string): string {
  tempDirs.push(dir)
  return dir
}

export function scratch(name: string): Scratch {
  const dir = mkdtempSync(join(tmpdir(), `mole-office-migration-${name}-`))
  const file = join(dir, 'panelx.db')
  const db = new Database(file)
  // The same two pragmas db/client.ts sets. `foreign_keys` matters here: reader_anchors points at
  // changes, and a test running without it would not notice a broken reference.
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
})

/**
 * A migrations folder containing only the first N entries of the real one.
 *
 * The `.sql` files are copied rather than rewritten, and the journal entries keep their original
 * `when` values, so drizzle cannot tell this folder from the real one as far as those entries go.
 * That is what makes the fixture a genuine half-migrated database rather than a description of one.
 */
export function partialMigrations(count: number): string {
  const dir = throwAwayAfterTheTest(mkdtempSync(join(tmpdir(), 'mole-office-migrations-partial-')))
  mkdirSync(join(dir, 'meta'))
  const entries = journal(MIGRATIONS).slice(0, count)
  for (const entry of entries) copyFileSync(join(MIGRATIONS, `${entry.tag}.sql`), join(dir, `${entry.tag}.sql`))
  writeFileSync(join(dir, 'meta', '_journal.json'), JSON.stringify({ version: '7', dialect: 'sqlite', entries }))
  return dir
}

/** One column of a table as SQLite describes it. */
export interface ColumnInfo {
  name: string
  type: string
  notnull: number
  dflt_value: string | null
  pk: number
}

export function columns(db: Database.Database, table: string): ColumnInfo[] {
  return db.prepare(`PRAGMA table_info("${table}")`).all() as ColumnInfo[]
}

export function columnNames(db: Database.Database, table: string): string[] {
  return columns(db, table).map((c) => c.name)
}

// ---------------------------------------------------------------------------- what each migration adds

/** What one migration's file may say, and nothing else. */
interface WhatOneMigrationAdds {
  /** Why, in a sentence: the migration's decision or problem, and what the table or index is for. */
  why: string
  /** The tables it creates, which `a database built only from migrations` expects among the sorted names. */
  tables?: string[]
  /** The indexes it adds to a table 0004 rebuilt, by table. */
  indexesAddedAfterTheRebuild?: Record<string, string[]>
  /** The columns it adds to a table that already existed, by table. */
  columnsAddedAfterTheRebuild?: Record<string, string[]>
}

const KEYS: readonly string[] = ['why', 'tables', 'indexesAddedAfterTheRebuild', 'columnsAddedAfterTheRebuild']

export interface WhatTheMigrationsAdd {
  tables: string[]
  indexesAddedAfterTheRebuild: Record<string, string[]>
  columnsAddedAfterTheRebuild: Record<string, string[]>
}

/**
 * Every file of `tests/what-each-migration-adds/`, read and joined, or a thrown error naming the file and what is wrong
 * with it. The names are joined with `listed`, the lists tests/migration.test.ts still writes out, and a name that is in
 * both, or in two files, is refused: each fact is declared in one place.
 */
export function whatTheMigrationsAdd(listed: {
  tables: readonly string[]
  indexesAddedAfterTheRebuild: Readonly<Record<string, readonly string[]>>
  columnsAddedAfterTheRebuild: Readonly<Record<string, readonly string[]>>
}): WhatTheMigrationsAdd {
  const tags = new Set(journal(MIGRATIONS).map((entry) => entry.tag))
  const out: WhatTheMigrationsAdd = {
    tables: [...listed.tables],
    indexesAddedAfterTheRebuild: Object.fromEntries(Object.entries(listed.indexesAddedAfterTheRebuild).map(([t, names]) => [t, [...names]])),
    columnsAddedAfterTheRebuild: Object.fromEntries(Object.entries(listed.columnsAddedAfterTheRebuild).map(([t, names]) => [t, [...names]])),
  }
  const names = (file: string, what: string, value: unknown): string[] => {
    if (!Array.isArray(value) || value.length === 0 || value.some((one) => typeof one !== 'string' || one === '')) {
      throw new Error(`${file}: ${what} is not a list of one or more names.`)
    }
    return value as string[]
  }
  const addTo = (file: string, into: string[], what: string, added: string[]) => {
    for (const name of added) {
      if (into.includes(name)) throw new Error(`${file}: ${what} ${name} is declared already, in tests/migration.test.ts or another file of ${WHAT_EACH_MIGRATION_ADDS}.`)
      into.push(name)
    }
  }
  for (const file of readdirSync(WHAT_EACH_MIGRATION_ADDS).sort()) {
    if (!file.endsWith('.json')) throw new Error(`${file} is in ${WHAT_EACH_MIGRATION_ADDS}, which holds only <migration tag>.json files.`)
    const tag = file.slice(0, -'.json'.length)
    if (!tags.has(tag)) throw new Error(`${file}: drizzle/meta/_journal.json holds no migration tagged ${tag}.`)
    const said = JSON.parse(readFileSync(join(WHAT_EACH_MIGRATION_ADDS, file), 'utf8')) as WhatOneMigrationAdds
    const unknown = Object.keys(said).filter((key) => !KEYS.includes(key))
    if (unknown.length > 0) throw new Error(`${file}: ${unknown.join(', ')} is not one of ${KEYS.join(', ')}.`)
    if (typeof said.why !== 'string' || said.why.trim() === '') throw new Error(`${file}: it says no why.`)
    if (said.tables !== undefined) addTo(file, out.tables, 'table', names(file, 'tables', said.tables))
    for (const key of ['indexesAddedAfterTheRebuild', 'columnsAddedAfterTheRebuild'] as const) {
      for (const [table, added] of Object.entries(said[key] ?? {})) {
        out[key][table] ??= []
        addTo(file, out[key][table], `${key} of ${table}:`, names(file, `${key}.${table}`, added))
      }
    }
  }
  return out
}

/**
 * Columns added by migrations that run AFTER the rebuild, by table.
 *
 * The rebuild tests build a database at the migration before 0004, snapshot it, and then run the
 * WHOLE folder — which is the path a real database takes, and is worth keeping rather than stopping
 * at 0004 and testing a route nobody travels. So the comparison has to allow for what the later
 * migrations add, in exactly the way `STAMP_DEFAULTS_DROPPED` allows for what 0004 removes: NAMED,
 * one entry per column, and everything not named here still compared exactly. A migration that
 * added a column to a table 0004 rebuilt and did not say so here fails those tests; a column added
 * to a table created later is checked only if it is named here.
 * A column a later migration adds to any table, and that is named nowhere, failed a test
 * deleted on 13 November 2026.
 */
export const COLUMNS_ADDED_AFTER_THE_REBUILD: Record<string, readonly string[]> = {
  records: ['origin'],
  // 0111 adds it nullable with no default and no backfill, so every link written before it holds
  // NULL — which reads as "nobody said what moves along this edge", the honest answer for a
  // relationship nobody described that way.
  // 0193 adds `created_by_type` and `gate_up_to_sort` on the same terms: nullable, no default, no
  // backfill, so every link written before it holds NULL in both — which reads as "not recorded".
  links: ['carries', 'created_by_type', 'gate_up_to_sort'],
  // 0111 rebuilds these three to put `repository_id` in the key, and every row comes back with NULL
  // in it. Named here so the row comparison can ask the question that means something — is every
  // value that was there still there — rather than failing on the column that was added.
  source_files: ['repository_id'],
  source_index: ['repository_id'],
  source_file_hashes: ['repository_id'],
  // 0006 adds it NULL; workspace-migration.ts then COPIES each change row's project off the record
  // the change is about. So unlike `records.origin` it is not null afterwards, and asserting that
  // it were would be asserting the migration did not run. What it must be instead is checked by
  // `COLUMNS_COPIED_FROM_ANOTHER_ROW` below, which is the stronger claim: not merely "something is
  // there" but "it is the value on the row it was copied from".
  // 0006 adds `workspace_id`; 0112 adds `warrant`, nullable with no default and no backfill, so
  // every change row written before it holds NULL — which is what NULL means there: nobody claimed
  // anybody's words for that write. It is not copied off another row, so it is not in
  // `COLUMNS_COPIED_FROM_ANOTHER_ROW` below.
  // 0139 adds `elevation` on the same terms as `warrant`: nullable, no default, no backfill, so
  // every change row written before it holds NULL — nobody was acting for the person on that write.
  // It is the second key to the door the warrant is the first key to, so it is named beside it.
  // 0168 adds `proved_holder` on the same terms: nullable, no default, no backfill, so every row
  // written before it holds NULL — which is what NULL means there: no key proved a holder that was
  // not the name the headers gave. Criterion P83, point 5.
  // 0178 adds `proved_by` on the same terms: nullable, no default, no backfill, so every row written
  // before it holds NULL — nobody recorded how a key proved that write. Keys wave piece 6.
  // 0194 adds `append_order`, problem BhszTJsVC8rF, and the data step in
  // src/server/db/append-order-migration.ts copies each row's own rowid into it. So, like
  // `workspace_id`, it is not NULL afterwards, and COLUMNS_COPIED_FROM_ANOTHER_ROW checks the copy.
  changes: ['workspace_id', 'warrant', 'elevation', 'proved_holder', 'proved_by', 'append_order'],
  // 0168 adds the same column to the other ledger in the same file, for the ninth invariant: the two
  // are written together in one transaction, so a fact on one and not the other is a drift with
  // nothing failing. `revisions` is created by 0060, after the 0004 rebuild, so it has no entry in
  // the structure comparison above; this list is what checks the column arrived and is NULL on every
  // row that predates it.
  revisions: ['proved_holder', 'proved_by'],
  // 0178 adds `proved_by` to the conversation's messages too, on the same terms, because
  // `message:<id>` in a warrant resolves to a row here first.
  agent_messages: ['proved_by'],
  // 0113 adds both nullable with no default and no backfill. `world` is the repository, database,
  // port and HEAD a resource serves, read when the row is written, so a row written before it holds
  // NULL — nobody recorded it, which is the honest answer and not "there was no world".
  // `started_by_the_product` is the same shape of fact and NULL means the same thing there, which
  // the release door treats as "not permission" rather than as "no".
  // The `lease` column was on this list from 0147; 0155 removed the column and its rows with it.
  session_resources: ['world', 'started_by_the_product'],
  // 0166 adds the three what-is-kept numbers, criterion U6, nullable with no default and no
  // backfill. The check below is what makes that a measured claim: every row that existed before
  // the column did holds NULL, which is nobody having chosen, rather than a default written in as
  // though the person had chosen it.
  //
  // 0175 adds `agents_may_inject`, criterion M91, on the same terms: nullable, no default, no
  // backfill. NULL is nobody having chosen, which reads as agents may inject.
  //
  // 0187 adds `machine_names`, problem 8Kf0hCaK4lQY, on the same terms. NULL is nobody having named
  // any address, so every message from another machine reads its address.
  //
  // 0198 adds `dead_letter_secretary`, problem 0WUuvB0IhRfb, on the same terms. NULL is nobody having named the
  // secretary who takes the dead letters.
  //
  // 0207 adds `address_for_browsers`, wave 13x round 7, on the same terms. NULL is nobody having chosen, so the
  // address MOLE_OFFICE_ADDRESS_FOR_OTHER_MACHINES names is in force.
  //
  // 0208 adds `merge_queue_owner` on the same terms, by a decision of the owner's. NULL is
  // nobody having named the merge queue's owner, so only the person may move an entry to the front.
  //
  // 0213 adds `related_tests_first`, on the same terms, in part B of a decision. NULL is nobody
  // having chosen, and it reads as off.
  //
  // 0230 adds `load_read_ms_top`, `load_cpu_percent_top` and `load_memory_mb_top`, on the same
  // terms. NULL is nobody having chosen, so the default in
  // src/shared/office-load.ts is in force.
  //
  // 0234 adds `plugin_switches`, wave 13x round 14, on the same terms. NULL is nobody having switched any plugin, and
  // every plugin is off.
  //
  // 0251 adds `checks_in_merges_only` and `stale_fork_bases`, wave 13j round loop-1, on the same terms. NULL is nobody
  // having chosen: the worker starts no check in merges-only mode, and no fork base is listed as stale.
  installation: ['keep_backups', 'untraced_request_days', 'traced_request_days', 'agents_may_inject', 'machine_names', 'dead_letter_secretary', 'address_for_browsers', 'merge_queue_owner', 'related_tests_first', 'load_read_ms_top', 'load_cpu_percent_top', 'load_memory_mb_top', 'plugin_switches', 'checks_in_merges_only', 'stale_fork_bases'],
}
