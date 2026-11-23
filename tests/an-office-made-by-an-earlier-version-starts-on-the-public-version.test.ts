// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN OFFICE MADE BY AN EARLIER VERSION STARTS ON THE PUBLIC VERSION.
 *
 * The tool that builds the public version changes words and ids in the comments of some migration files, so those
 * files ship with another hash. An office that applied the files before the change holds the old hashes. The public
 * version used to run those migrations again on such an office, and the start stopped on a column that was already
 * there. Now the tool lists, beside the journal, each migration file it changed with its hash before and after the
 * change, and a migration counts as applied under either hash (theMigrationsNotYetApplied in
 * src/config/migration-look.mjs).
 *
 * WHAT THIS FILE PROVES, each on a scratch office in the temporary folder:
 *   1. An office migrated with this checkout's drizzle/, holding records, runs nothing on the public version's copy of
 *      that folder, and starts on it. Without the list, the same copy would run migrations again.
 *   2. An office migrated only as far as the last migration of the beta.6 version runs, on the copy, the migrations
 *      after that index, and nothing older again. It starts on the copy afterwards.
 *   3. A list that cannot be read, a list that names a migration the journal does not hold, and a list whose hash as
 *      shipped is not the hash of the file are each refused with a sentence saying which, and nothing is applied.
 *
 * WHAT IS REAL: this checkout's migrations, the clean tool's own steps for a file before its header
 * (theStepsBeforeTheHeader and CHANGED in scripts/clean-version.mjs), the writer of the list (theOriginalHashesText)
 * and the migrator. The id list is a stand-in: words shaped like a record id, read from the migrations' own comments
 * when the test runs. The records are made up and made by the office's own code. No git history is read, and nothing
 * reaches the live office.
 *
 * THE PUBLIC VERSION LEAVES THE CLEAN TOOL OUT, so there cases 1 and 2 are taken out and say why. Case 3 runs there
 * too, because it needs no part of the tool.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { appendFileSync, copyFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type Database from 'better-sqlite3'
import { migrateInPlace, prepareToServe } from '../src/server/db/migrate.ts'
import {
  THE_MIGRATION_JOURNAL_TABLE,
  THE_ORIGINAL_HASHES_FILE,
  theMigrationsInTheFolder,
  theMigrationsNotYetApplied,
  theOriginalHashesText,
} from '../src/config/migration-look.mjs'
import { isTheCleanVersion } from '../scripts/the-clean-version-mark.mjs'
import { freshDb, type TestDb } from './helpers.ts'
import { journal, MIGRATIONS, partialMigrations, REPO, scratch } from './migration-fixtures.ts'

/** The last journal index of the beta.6 version: 0328, the last migration it shipped. */
const THE_LAST_INDEX_OF_BETA_6 = 328

/** The migration whose second run stopped the start of an office made by beta.6: it adds this column. */
const THE_COLUMN_THAT_WAS_ADDED_TWICE = 'related_tests_first'

const made: string[] = []
const opened: TestDb[] = []
const THE_DATABASE_SETTING = process.env['MOLE_OFFICE_DB']

afterEach(() => {
  for (const db of opened.splice(0)) db.close()
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true })
  // freshDb names its file in this setting, so it is put back as it was.
  if (THE_DATABASE_SETTING === undefined) delete process.env['MOLE_OFFICE_DB']
  else process.env['MOLE_OFFICE_DB'] = THE_DATABASE_SETTING
})

/** A folder in the temporary folder, removed after the test. */
function aFolder(name: string): string {
  const dir = mkdtempSync(join(tmpdir(), `mole-office-earlier-office-${name}-`))
  made.push(dir)
  return dir
}

/** Whether this checkout is the public version, which has no clean tool; if so the case is taken out and says why. */
function takenOutInThePublicVersion(context: { skip: (note: string) => void; task: { meta: { takenOut?: string } } }): boolean {
  if (!isTheCleanVersion(REPO)) return false
  const reason =
    'This checkout is the public version, and it leaves out scripts/clean-version.mjs, whose steps make the copy this case reads. ' +
    'Case 3 reads the list of original hashes without the tool.'
  context.task.meta.takenOut = reason
  context.skip(`taken out: ${reason}`)
  return true
}

/**
 * THE STAND-IN ID LIST: every word of a migration's comments shaped like a record id, twelve letters, digits, '_' or
 * '-', with a small letter, a capital and a digit, '_' or '-'. A word that also stands in a statement is left out, so
 * the list changes comments only, as the owner's list does.
 */
function theStandInIds(folder: string): Set<string> {
  const AN_ID = /(?<![A-Za-z0-9_-])(?=[A-Za-z0-9_-]*[a-z])(?=[A-Za-z0-9_-]*[A-Z])(?=[A-Za-z0-9_-]*[0-9_-])[A-Za-z0-9_-]{12}(?![A-Za-z0-9_-])/g
  const inComments = new Set<string>()
  const inStatements = new Set<string>()
  for (const name of readdirSync(folder).filter((file) => file.endsWith('.sql'))) {
    for (const line of readFileSync(join(folder, name), 'utf8').split('\n')) {
      const into = line.trimStart().startsWith('--') ? inComments : inStatements
      for (const [word] of line.matchAll(AN_ID)) into.add(word)
    }
  }
  return new Set([...inComments].filter((word) => !inStatements.has(word)))
}

/**
 * THE PUBLIC VERSION'S COPY OF `folder`, made by the clean tool's own steps with the stand-in id list, and the list of
 * original hashes it carries, made from the migration files those steps changed. Answers the copy and the tags of the
 * migrations it changed.
 */
async function theCleanCopyOf(folder: string): Promise<{ copy: string; changed: string[] }> {
  const tool = (await import(pathToFileURL(join(REPO, 'scripts', 'clean-version.mjs')).href)) as Record<string, any>
  const ids = theStandInIds(folder)
  const how = { ownerIds: ids, madeUp: tool['theMadeUpIdsOf'](ids), ownerIdsPattern: tool['theOwnerIdsPattern'](ids) }
  const source = { at: '2026-01-01 00:00:00', read: (path: string) => readFileSync(join(REPO, path), 'utf8') }
  const copy = join(aFolder('copy'), 'drizzle')
  mkdirSync(join(copy, 'meta'), { recursive: true })
  const changed: { tag: string; original: Buffer; shipped: Buffer }[] = []
  for (const file of [...readdirSync(folder).filter((name) => name.endsWith('.sql')), join('meta', '_journal.json')]) {
    const path = `drizzle/${file}`
    // The build puts no header on a file under drizzle/, so the steps before the header are all the steps it takes.
    expect(tool['theRuleWithoutAHeader'](path), `${path} would get a header`).not.toBeNull()
    const original = readFileSync(join(folder, file))
    const change = (tool['CHANGED'] as { path: string; change: (text: string, at: typeof source) => string | { text: string } }[]).find((one) => one.path === path)
    const done = change?.change(original.toString('utf8'), source)
    const steps = tool['theStepsBeforeTheHeader'](path, original, { changed: typeof done === 'string' ? done : done?.text, keep: false, ...how }) as { bytes: Buffer }
    writeFileSync(join(copy, file), steps.bytes)
    if (file.endsWith('.sql') && !steps.bytes.equals(original)) changed.push({ tag: file.slice(0, -'.sql'.length), original, shipped: steps.bytes })
  }
  if (changed.length > 0) writeFileSync(join(copy, 'meta', THE_ORIGINAL_HASHES_FILE), theOriginalHashesText(changed))
  return { copy, changed: changed.map((one) => one.tag) }
}

/** The journal table's rows, in the order they were written. */
function journalRows(db: Database.Database): { hash: string; created_at: number }[] {
  return db.prepare(`SELECT hash, created_at FROM ${THE_MIGRATION_JOURNAL_TABLE} ORDER BY rowid`).all() as { hash: string; created_at: number }[]
}

/** The tag of the migration that adds THE_COLUMN_THAT_WAS_ADDED_TWICE, read from the files. */
function theTagThatAddsTheColumn(): string {
  const found = journal(MIGRATIONS).filter((entry) => /ADD\s+(?:COLUMN\s+)?`related_tests_first`/i.test(readFileSync(join(MIGRATIONS, `${entry.tag}.sql`), 'utf8')))
  expect(found.length, `migrations adding ${THE_COLUMN_THAT_WAS_ADDED_TWICE}`).toBe(1)
  return found[0]!.tag
}

describe('an office made by an earlier version starts on the public version', () => {
  it('1. an office migrated with this checkout runs nothing on the public copy, and starts on it', async (context) => {
    if (takenOutInThePublicVersion(context)) return
    const t = await freshDb()
    opened.push(t)
    for (const title of ['A made-up report', 'Another made-up report']) {
      t.api.createRecord({ workspaceId: 'default', kind: 'report', title, data: { blocks: [{ id: 'b-1', type: 'text', text: 'Made up for this test.' }] }, actor: t.api.HUMAN })
    }
    const db = t.client.sqlite
    const before = journalRows(db)
    const { copy, changed } = await theCleanCopyOf(MIGRATIONS)

    // The case is real: the copy changed the migration that stopped the start, so its hash is not the one the office holds.
    const tag = theTagThatAddsTheColumn()
    expect(changed).toContain(tag)
    const shipped = theMigrationsInTheFolder(copy)
    expect(before.map((row) => row.hash)).not.toContain(shipped.find((migration) => migration.tag === tag)?.hash)
    // Without the list, the copy would run that migration again.
    const withoutTheList = join(aFolder('without-the-list'), 'drizzle')
    mkdirSync(join(withoutTheList, 'meta'), { recursive: true })
    for (const name of readdirSync(copy).filter((file) => file.endsWith('.sql'))) copyFileSync(join(copy, name), join(withoutTheList, name))
    copyFileSync(join(copy, 'meta', '_journal.json'), join(withoutTheList, 'meta', '_journal.json'))
    expect(theMigrationsNotYetApplied(before, theMigrationsInTheFolder(withoutTheList)).map((migration) => migration.tag)).toContain(tag)

    // With the list, nothing is missing, the start serves and no journal row is written.
    expect(theMigrationsNotYetApplied(before, shipped)).toEqual([])
    const start = prepareToServe(db, copy)
    expect(start.serve, start.serve ? '' : start.refusal).toBe(true)
    expect(journalRows(db)).toEqual(before)
    expect(migrateInPlace(db, copy).newlyApplied).toBe(0)
    expect(journalRows(db)).toEqual(before)
  }, 300_000)

  it('2. an office migrated as far as beta.6 runs the later migrations on the public copy, and nothing older again', async (context) => {
    if (takenOutInThePublicVersion(context)) return
    const entries = journal(MIGRATIONS)
    const asFarAsBeta6 = entries.filter((entry) => entry.idx <= THE_LAST_INDEX_OF_BETA_6).length
    expect(entries.slice(0, asFarAsBeta6).every((entry) => entry.idx <= THE_LAST_INDEX_OF_BETA_6), 'the journal is not in index order').toBe(true)
    const s = scratch('as-far-as-beta-6')
    migrateInPlace(s.db, partialMigrations(asFarAsBeta6))
    const before = journalRows(s.db)
    const { copy, changed } = await theCleanCopyOf(MIGRATIONS)
    expect(changed).toContain(theTagThatAddsTheColumn())

    const outcome = migrateInPlace(s.db, copy)
    const later = entries.filter((entry) => entry.idx > THE_LAST_INDEX_OF_BETA_6).map((entry) => entry.tag)
    expect(outcome.newlyApplied).toBe(later.length)
    const tagOf = new Map(theMigrationsInTheFolder(copy).map((migration) => [migration.hash, migration.tag]))
    const written = journalRows(s.db).slice(before.length).map((row) => tagOf.get(row.hash))
    expect(written).toEqual(later)
    expect(journalRows(s.db).slice(0, before.length)).toEqual(before)

    const start = prepareToServe(s.db, copy)
    expect(start.serve, start.serve ? '' : start.refusal).toBe(true)
    expect(migrateInPlace(s.db, copy).newlyApplied).toBe(0)
  }, 300_000)

  it('3. a list that cannot be read, names a migration the journal lacks, or gives another hash is refused, and nothing is applied', () => {
    const count = 6
    const s = scratch('a-list-refused')
    migrateInPlace(s.db, partialMigrations(count))
    const before = journalRows(s.db)
    const folder = partialMigrations(count + 1)
    const tag = journal(folder).at(-1)!.tag
    // A changed file and its list, as the clean tool writes them; the list is read, and gives the file its old hash.
    const original = readFileSync(join(folder, `${tag}.sql`))
    appendFileSync(join(folder, `${tag}.sql`), '\n-- a comment the public version changed\n')
    const shipped = readFileSync(join(folder, `${tag}.sql`))
    const list = join(folder, 'meta', THE_ORIGINAL_HASHES_FILE)
    const good = theOriginalHashesText([{ tag, original, shipped }])
    writeFileSync(list, good)
    const listed = theMigrationsInTheFolder(folder).find((migration) => migration.tag === tag)
    expect(listed?.original).toBe(JSON.parse(good).migrations[0].original)
    expect(listed?.original).not.toBe(listed?.hash)

    const goodList = JSON.parse(good) as { migrations: { tag: string; original: string; shipped: string }[] }
    const refusals: [string, string, RegExp][] = [
      ['cannot be read', '{ "migrations": [', /The list of original migration hashes .* cannot be read \(.+\)\. No migration was applied\./],
      [
        'names a migration the journal lacks',
        JSON.stringify({ ...goodList, migrations: [...goodList.migrations, { tag: '9999_not_in_the_journal', original: 'a'.repeat(64), shipped: 'b'.repeat(64) }] }),
        /names 9999_not_in_the_journal, but the migration journal .* does not\. No migration was applied\./,
      ],
      [
        'gives another hash as shipped',
        JSON.stringify({ ...goodList, migrations: [{ ...goodList.migrations[0]!, shipped: 'c'.repeat(64) }] }),
        new RegExp(`gives ${tag} a hash as shipped that is not the hash of its file in .* No migration was applied\\.`),
      ],
    ]
    for (const [what, text, refusal] of refusals) {
      writeFileSync(list, text)
      expect(() => theMigrationsInTheFolder(folder), what).toThrow(refusal)
      expect(() => migrateInPlace(s.db, folder), what).toThrow(refusal)
      expect(journalRows(s.db), `${what}: a migration was applied`).toEqual(before)
    }
  }, 120_000)
})
