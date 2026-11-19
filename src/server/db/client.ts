// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** The database connection. One SQLite file, opened once. */
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { mkdirSync, statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { bootstrapEnvironment, readDatabaseSettingsWith, readSettingHere, settingNamed, settings, settingWasSet, theOldDatabaseNotice, whyThisCheckoutMayNotOpenTheDatabase } from '../../config/settings.mjs'
import { withTheWayForThisJob } from '../../config/the-office-tool-environment.mjs'
import { loadPanelEnv } from './env.ts'
import { readRuntimeChoice } from '../../config/runtime-setting-store.mjs'
import * as schema from './schema.ts'
import { readTheOfficeOwner } from './owner-setting.ts'
import { theOwnerIsKnown } from '@shared/person.ts'
import { inEnglish, saying, type DevSaying } from '@shared/dev-sayings.ts'
import { holdUntilStored } from './told-when-stored.ts'
import { refuseADataFolderInAWorktree } from './git-checkout.ts'

/**
 * `.env` FIRST, BEFORE `MOLE_OFFICE_DB` IS READ ONE LINE BELOW.
 *
 * This is the only module that reads `MOLE_OFFICE_DB`, and it reads it at import. Loading the settings
 * here is what makes every command that opens a database — `db:migrate`, `db:seed`, `reindex`, and
 * whatever is written next — open the file the operator configured, without any of them having to
 * remember to do anything. Four of them did not, and wrote to `./data/panelx.db` while `.env` named
 * somewhere else; see `lib/env.ts` for the measurement and for why the load cannot live in the
 * scripts themselves.
 *
 * A value already in the real environment still wins, so `MOLE_OFFICE_DB=/tmp/scratch.db npm run
 * db:reset` is unaffected — which matters, because that is the escape hatch every safety message in
 * this project prints.
 */
/**
 * WHAT THE REAL ENVIRONMENT SAID, read before `.env` is loaded over the top of it.
 *
 * `loadPanelEnv()` puts `.env`'s `MOLE_OFFICE_DB` into `process.env` when the shell did not set one, so
 * after that line the two are indistinguishable. The guard below has to tell them apart: a test
 * that says nothing is about to be handed the operator's real corpus by a settings file it never
 * read, and a test that named a scratch file is doing the right thing.
 *
 * THE ORDER USED TO BE LOAD-BEARING and it is not any more. This line read `process.env` directly
 * and had to run BEFORE `loadPanelEnv()`; reading it after the load returned `.env`'s value on the
 * first attempt at this guard, so the guard passed every test and protected nothing. It was caught
 * by running the control — the same probe with no test runner — which is the only thing that tells
 * "the check held" from "the check never fired". `readSettingHere` in src/config/settings.mjs
 * answers which of the two layers a value came from whatever has been loaded, so the fact this
 * guard needs no longer depends on where the line sits.
 */
const NAMED_IN_THE_ENVIRONMENT = readSettingHere('MOLE_OFFICE_DB').source === 'the environment'

loadPanelEnv()

// The path, and the default when nobody named one, come from src/config/settings.mjs. This module
// used to carry its own copy of `./data/panelx.db`, one of four in the repository.
const file = settings().databasePath

/**
 * UNDER A TEST RUNNER, REFUSE THE DATABASE NOBODY NAMED.
 *
 * WHAT WENT WRONG. This module opens its file the moment it is imported, and ES imports are
 * evaluated before any test body runs. So a test file that imports a plain CONSTANT from a module
 * which happens to reach this one — `ALLOCATABLE_KINDS` from lib/planning.ts is the real case —
 * opens whatever `.env` names, WRITABLE, before `freshDb()` gets the chance to point it somewhere
 * safe. `.env` names the operator's real corpus. Measured on 18 August 2026: eight of the 241 files
 * in tests/ did this, and an import shaped like theirs opened the database `.env` names
 * with 537 records visible and `readonly` false.
 *
 * That is not a theory about what could happen. Four junk records — `small title`, `big title Do
 * this`, `small title 2`, `small title 33` — were written into the owner's corpus by a test during
 * round seven and had to be deleted by hand.
 *
 * WHY A REFUSAL AND NOT A REDIRECT. Quietly opening a temporary file instead would be the second
 * rule broken: the test would pass, and it would be evidence about a database nobody asked for.
 * A test that reaches a database it never asked for is a test that does not know what it is doing,
 * and the honest answer is to stop and say so.
 *
 * WHAT STILL WORKS. `freshDb()` sets MOLE_OFFICE_DB before its dynamic import, so every test that means
 * to use a database is unaffected. `MOLE_OFFICE_DB=/tmp/scratch.db npx vitest` is unaffected. The server,
 * the migration command and every script are unaffected, because none of them run under vitest.
 *
 * `VITEST` is set by the runner in every worker; `VITEST_WORKER_ID` is its per-worker companion and
 * is checked too so that a future runner version dropping one of them does not silently disarm this.
 */
function refuseAnUnnamedDatabaseUnderATestRunner(): void {
  const underTest = process.env['VITEST'] !== undefined || process.env['VITEST_WORKER_ID'] !== undefined
  if (!underTest) return
  if (NAMED_IN_THE_ENVIRONMENT) return
  throw new Error(
    'A test opened Mole Office\'s database without saying which one, so it would have opened the file .env ' +
      `names — ${resolve(file)} — with permission to write to it. That file is the ` +
      'operator\'s real work. Nothing was opened.\n\n' +
      'This happens when a test file imports a VALUE from a module that reaches src/server/db/client.ts. ' +
      'Imports run before any test body, so freshDb() cannot get there first. Two fixes, and both are ' +
      'already used in this repository:\n' +
      '  - if the test needs no database, import the constant from somewhere that opens none — most of ' +
      'them are re-exported from src/shared;\n' +
      '  - if it does need one, call freshDb() and then `await import(...)` the module inside the test, ' +
      'which is what tests/helpers.ts is written to do.\n\n' +
      'tests/no-test-opens-the-live-corpus.test.ts walks every test file and names any that would land here.',
  )
}

refuseAnUnnamedDatabaseUnderATestRunner()

/**
 * Open it, and if it will not open, say which setting named it.
 *
 * `new Database(...)` on a path that is a directory throws `SqliteError: unable to open database
 * file` with a stack inside `node_modules/better-sqlite3` and NAMES NEITHER THE PATH NOR THE
 * VARIABLE — measured on 2026-08-12, and it was the least useful message in the product. The same
 * went for a parent directory this user cannot create: `EACCES … mkdir '/nonexistent-root-dir-xyz'`,
 * with nothing to connect it to Mole Office at all.
 *
 * Both are one mistake — `MOLE_OFFICE_DB` names something that is not a writable file — and an operator
 * who is told that fixes it in seconds. The original error is kept as the `cause` rather than
 * replaced, because what SQLite or the filesystem said is the evidence for what is wrong.
 */
function openDatabase(): Database.Database {
  const refusal = whyThisCheckoutMayNotOpenTheDatabase(file)
  // The way to do the job is said after the refusal, for db:migrate and db:seed (wave 13q, part d).
  if (refusal !== null) throw Object.assign(new Error(withTheWayForThisJob(refusal)), { code: 'STABLE_OFFICE_DATABASE' })
  // Before the folder is made: a database inside a git worktree is refused, problem nd7jOk5LCU4s.
  refuseADataFolderInAWorktree(file)
  try {
    mkdirSync(dirname(file), { recursive: true })
    return new Database(file)
  } catch (err) {
    const why = err instanceof Error ? err.message : String(err)
    const usingDefault = !settingWasSet('MOLE_OFFICE_DB')
    throw new Error(
      `Mole Office could not open its database at ${resolve(file)}, and that is where it was told to look: ` +
        (usingDefault
          ? `nothing sets MOLE_OFFICE_DB, so this is the built-in default ${String(settingNamed('MOLE_OFFICE_DB').fallback)}, resolved against the checkout. `
          : `MOLE_OFFICE_DB is "${file}". Set it in .env, or in the environment to beat .env. `) +
        `It must be a path to a FILE — a directory will not do — in a directory this user can write to. ` +
        `What went wrong underneath: ${why}`,
      { cause: err },
    )
  }
}

// THE NOTICE IS SAID BEFORE THE DEFAULT FILE IS MADE, because the old default is here and the new
// one is not, so an office that meant the old one is told how to keep it.
const oldDatabase = theOldDatabaseNotice(bootstrapEnvironment())
if (oldDatabase !== null) console.warn(oldDatabase)

export const sqlite = openDatabase()

// Write-ahead logging lets reads continue during a write. Foreign keys are off by default
// in SQLite, which would let links point at nothing; turn them on.
sqlite.pragma('journal_mode = WAL')
sqlite.pragma('foreign_keys = ON')

// WHAT IS TOLD ABOUT A WRITE WAITS FOR ITS COMMIT (wave 13n's round 39): every transaction opened on this
// handle, drizzle's included, holds what `whenStored` was asked to do until the outermost one commits, and
// drops it on a rollback. src/server/db/told-when-stored.ts.
holdUntilStored(sqlite)

export const db = drizzle(sqlite, { schema })

// WHO OWNS THIS OFFICE, told to @shared/person.ts the moment a migrated database is open, so that
// every process that opens it (the server, a script, a test) writes as its owner and never as nobody.
// A database not migrated yet has no owner to read; the migrate says who it is when it writes it.
{
  const owner = readTheOfficeOwner(sqlite)
  if (owner !== null) theOwnerIsKnown(owner.id)
}
export { schema }

// ---------------------------------------------------------------------------- is this file still the file

/**
 * The inode of the database file as it was when this process opened it.
 *
 * SQLite holds its file by open DESCRIPTOR, not by name. A server started before `npm run
 * db:reset` goes on reading and writing the DELETED file for as long as it lives, and nothing
 * about its answers looks unusual — this is the top entry in troubleshooting.md, it has happened
 * four times, and once it produced a written-down diagnosis that was wrong: records came back
 * with fields missing because writes went to one process and reads were served by another.
 *
 * Read once, here, so the comparison below is against the file this process actually opened
 * rather than against whatever is at the path now.
 */
const openedInode: number | null = (() => {
  try {
    return statSync(file).ino
  } catch {
    // A database that did not exist a moment ago was just created by `new Database` above, so
    // this is only reachable if the path became unreadable in between. Null disables the check
    // rather than guessing, and `databaseFileStatus` says which of the two it is.
    return null
  }
})()

/** Whether this process is still serving the file that lives at MOLE_OFFICE_DB. */
export type DatabaseFileStatus =
  | { ok: true; path: string }
  | { ok: false; path: string; problem: string; said: DevSaying }

/**
 * Check that the path this server opened still holds the file it opened.
 *
 * Two failures, and they are the same incident seen at two moments: the file is GONE (a reset or
 * an rm while this process was running) or a DIFFERENT file is at the path (a reset that
 * recreated it). In both cases this process is answering out of an inode nobody else can reach,
 * so every count, every record and every "the reset did not reset" is about a database that is
 * not the one on disk.
 *
 * Reported rather than fatal: killing the server would destroy the only copy of whatever is in
 * the deleted inode. What the incident cost was not the staleness, it was that nothing said so.
 */
/**
 * A PROBLEM, IN ENGLISH AND AS A CODE. The English is the word list's own (src/shared/dev-sayings.ts),
 * so the runtime page can draw the same sentence in the page's language.
 */
function theProblem(path: string, said: DevSaying): DatabaseFileStatus {
  return { ok: false, path, problem: inEnglish(said), said }
}

export function databaseFileStatus(): DatabaseFileStatus {
  // ABSOLUTE, because this string is the answer to "which database am I talking to". `sqlite.name`
  // is the path as configured, and the configured path is almost always the default relative path — which
  // is the same nine characters in every checkout on this machine, so it tells two of them apart
  // not at all. It reaches GET /api/health on every reply and the three refusals below.
  const path = resolve(sqlite.name)
  if (openedInode === null) {
    return theProblem(path, saying('databaseUnreadable', { path }))
  }
  let current: number
  try {
    current = statSync(path).ino
  } catch {
    return theProblem(path, saying('databaseDeleted', { path }))
  }
  if (current !== openedInode) {
    return theProblem(path, saying('databaseReplaced', { path }))
  }
  return { ok: true, path }
}

// Only these runtime choices have database storage so far. No bootstrap setting is read here.
// THE TABLE IS LOOKED FOR UNTIL IT IS FOUND, AND THEN NO MORE. A choice may be read before migration 0275 has made the
// table, so a missing table is asked about again. Nothing drops it once made, so asking on every read only added a
// statement to each: five of the 44 GET /api/after-a-compaction ran, against its cap of 40
// (tests/the-read-after-a-compaction-stays-small.test.ts; carry round 3, entry Sl6pL9GrRw03).
let theChoicesTableIsThere = false
readDatabaseSettingsWith((name) => {
  theChoicesTableIsThere ||= sqlite.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'runtime_settings'").get() !== undefined
  if (theChoicesTableIsThere) {
    const choice = readRuntimeChoice(sqlite, name)
    if (choice !== undefined) return choice
  }
  const column = name === 'MOLE_OFFICE_DEAD_LETTER_AFTER_DAYS' ? 'dead_letter_after_days'
    : name === 'MOLE_OFFICE_DEAD_LETTER_AFTER_COUNT' ? 'dead_letter_after_count' : null
  if (column === null) return undefined
  const row = sqlite.prepare(`SELECT ${column} AS value FROM installation WHERE only_row = 1`).get() as
    { value: number | null } | undefined
  return row?.value == null ? undefined : String(row.value)
}, () => sqlite.open)
