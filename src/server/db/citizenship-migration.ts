// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * EVERY PERSON AND EVERY AGENT ALREADY IN A DATABASE BECOMES A CITIZEN OF THE WORLD THAT DATABASE IS.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS STEP DOES
 * ---------------------------------------------------------------------------------------
 *
 * Criterion C1 of design/messages/ACCEPTANCE.md section 8. Migration 0122 adds the three columns;
 * this fills them, and writes the one row saying which installation this database belongs to.
 *
 * It is a data step rather than SQL for one reason: a world's identity is a hash of the database
 * FILE — its absolute path and its creation time — and SQL cannot read the file it is running
 * inside. `databaseIdentity` in src/config/database-identity.mjs is the one place that works it out,
 * and this calls it rather than restating the recipe.
 *
 * ---------------------------------------------------------------------------------------
 * IT NEVER OVERWRITES A CITIZENSHIP SOMEBODY ALREADY HAS
 * ---------------------------------------------------------------------------------------
 *
 * Every UPDATE is `WHERE home_world IS NULL`. So a row that arrived carrying a home — a citizen of
 * another world whose row was restored from an archive here — keeps the world it was registered in.
 * That is the whole reason the columns are carried in an export: without them a restore would
 * silently make every citizen a local of wherever the rows landed.
 *
 * ---------------------------------------------------------------------------------------
 * THE DATE IS THE ROW'S OWN, NOT TODAY'S
 * ---------------------------------------------------------------------------------------
 *
 * Citizenship is got at registration. A row already in this database
 * was registered when it was written, so `citizen_since` is set from `created_at`. Writing today's
 * date would be this project's own worst migration defect repeated: one stamped every block with
 * its own clock and erased the age a ranking depended on.
 *
 * ---------------------------------------------------------------------------------------
 * A WORLD THAT CANNOT BE IDENTIFIED LEAVES THE COLUMNS EMPTY, AND SAYS SO
 * ---------------------------------------------------------------------------------------
 *
 * `databaseIdentity` answers `unknown` when the file cannot be read, or when the filesystem records
 * no creation time — because a hash of a zero would tell a copy from its original not at all while
 * looking exactly as strong as a real id. In that case nothing is written and the report says how
 * many rows were left, with the reason. An invented world would be worse than an empty column:
 * every one of those citizens would be checked against a world that does not exist.
 */

import type Database from 'better-sqlite3'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { nowStamp } from '@shared/time.ts'
import { databaseIdentity } from '../../config/database-identity.mjs'
import { UNKNOWN } from '../../config/world-header.mjs'
import { settingValue } from '../../config/settings.mjs'

/** What this step did, printed by `npm run db:migrate` and asserted by the tests. */
export interface CitizenshipMigrationReport {
  /** True when the columns are not there yet, which is the state before migration 0122 has run. */
  columnsMissing: boolean
  /** The identity of the world these rows are now citizens of, or null because it could not be read. */
  world: string | null
  /** One plain sentence saying how that identity was worked out, or why it could not be. */
  howTheWorldWasRead: string
  /** The installation this database belongs to, as the row now says. */
  installation: string
  /** One plain sentence saying where the installation id came from. */
  howTheInstallationWasRead: string
  /** 1 when this run wrote the installation row, 0 when it was already there. */
  installationWritten: number
  /**
   * 1 when this run took a filesystem path out of the installation row's sentence, 0 when there was
   * none to take out. The id is never touched by it.
   */
  installationSentenceRepaired: number
  /** How many rows of `people` this run made citizens. */
  peopleMadeCitizens: number
  /** How many rows of `agents` this run made citizens. */
  agentsMadeCitizens: number
  /**
   * How many rows were left with no home because the world could not be identified.
   *
   * NOT ZERO WHEN NOTHING WAS WRITTEN. Zero here means every row has a home; this number means the
   * step ran, could not read the world, and left rows alone rather than inventing one for them.
   */
  leftWithNoWorld: number
}

/** The columns migration 0122 adds, checked before anything is written. */
function theColumnsAreThere(sqlite: Database.Database, table: string): boolean {
  const columns = sqlite.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]
  const names = new Set(columns.map((c) => c.name))
  return names.has('home_world') && names.has('home_installation') && names.has('citizen_since')
}

function tableIsThere(sqlite: Database.Database, table: string): boolean {
  const row = sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(table)
  return row !== undefined
}

/**
 * THE ID OF THE INSTALLATION THE DATABASE BEING MIGRATED BELONGS TO, and how it was arrived at.
 *
 * READ OFF THE DATABASE IN HAND, NOT OFF THE DECLARATION, and that is the whole of problem
 * `25JDoYvL_lK5`. It used to be the SHA-256 of the CANONICAL database path — the file a server
 * started from this checkout with nothing set in a shell would open. CLAUDE.md's migrate-first rule
 * runs a branch's migrations before the merge, and the only checkout that has a branch's migration
 * files is the worktree it was built in, whose declaration names ITSELF. So the live database was
 * migrated from a worktree and stamped 729aa30f9ed0f0d6, the id of that worktree, and the
 * value is written once and never rewritten: it would have named the wrong place for the life of
 * that database, and every citizen row copies it. The owner's coordinator caught it by reading the
 * migration log and rewrote the row by hand to 3e430bbd2986d02b — which is exactly what the rule
 * below now works out on its own.
 *
 * WHY DERIVING AND NOT REFUSING, which was the other way to close it. Refusing when the declaration
 * does not name the database in hand would fail the one workflow CLAUDE.md requires: migrate-first
 * is always run from a worktree, so the refusal would fire on every correct run and the fix would be
 * a step somebody has to remember. A fact read off the thing being changed cannot be got wrong by
 * where the command was typed.
 *
 * A NAMED INSTALLATION STILL WINS. `MOLE_OFFICE_INSTALLATION` is a person naming their own
 * installation, and it is read from wherever the migration is run — so `how` always names the
 * database that was migrated as well. That sentence is what the log prints, and reading the log is
 * how the wrong value was caught the first time.
 */
export function theInstallationThisDatabaseBelongsTo(sqlite: Database.Database): {
  id: string
  how: string
  database: string
} {
  return theInstallationForADatabaseAt(sqlite.name)
}

/**
 * The same answer for a path, which is the half a test can hold still.
 *
 * `how` IS KEPT IN THE ROW AND CARRIES NO PATH, and `database` is the path, which is never stored.
 * The row travels: an export of this database is an archive somebody else can read, and an absolute
 * path from the machine that wrote it is not a fact about the archive — tests/export-format.test.ts
 * refuses one by name. The path is in the sentence the MIGRATION LOG prints, which is where it is
 * needed and where reading it caught problem `25JDoYvL_lK5` in the first place.
 *
 * ONE PLACE THE HASH IS WORKED OUT, and the caller above only decides WHICH path. A test that
 * computed the hash itself would be the rule written twice, free to agree with a broken version of
 * itself — which is exactly what the first version of the test for this did.
 *
 * THE PATH IS RESOLVED FIRST. Two spellings of one file — a relative one, one with a `..` in it —
 * are one database and must arrive at one installation, or a database opened the other way round
 * would look like somewhere else.
 */
export function theInstallationForADatabaseAt(file: string): { id: string; how: string; database: string } {
  const database = resolve(file)
  const named = settingValue('MOLE_OFFICE_INSTALLATION')
  if (typeof named === 'string' && named.trim() !== '') {
    return { id: named.trim(), how: `MOLE_OFFICE_INSTALLATION named this installation`, database }
  }
  return {
    id: createHash('sha256').update(`installation\n${database}`).digest('hex').slice(0, 16),
    how: 'nothing named this installation, so it is the SHA-256 of the path of the database it was written in, cut to 16 characters',
    database,
  }
}

/**
 * TAKE THE MACHINE'S PATH OUT OF THE INSTALLATION ROW'S SENTENCE, and leave the id alone.
 *
 * WHY A ROW ALREADY WRITTEN HAS TO BE PUT RIGHT. The sentence used to name the database path it was
 * worked out from, and `installation.how` is an exported column: the citizens verifier wrote a
 * whole-installation archive from a copy of the owner's database and found
 * the database's own path, under the home folder, at `mirror/participants.md` line 231. An archive
 * is a thing that travels, and a path from the machine that wrote it is not a fact about the
 * archive. The row is written once and never rewritten, so nothing else was ever going to correct
 * it. Problem `25JDoYvL_lK5`, reopened.
 *
 * THE ID IS NOT TOUCHED, AND THAT IS THE WHOLE OF THE OLD RULE. "Written once and never rewritten"
 * is about the identity: what a database's citizens belong to must not move under them. The
 * sentence beside it is a reading of how that identity was arrived at, and one that names a machine
 * is a reading that must not travel.
 *
 * IT SAYS WHAT HAPPENED RATHER THAN GUESSING HOW THE ID WAS ARRIVED AT. Writing today's derivation
 * over an old row would be a claim nothing here can check: the id may have been named in `.env` on
 * the day and derived today, or the other way round. The replacement says only what is true of every
 * repaired row — that a path was taken out and the id was not touched.
 *
 * ONLY A SENTENCE WITH A PATH IN IT, so a row that is already right is left exactly as it is and a
 * second run reports zero. The replacement carries no `/`, so this cannot run twice on one row.
 */
export const WHAT_A_REPAIRED_SENTENCE_SAYS =
  'this sentence named a path on the machine that wrote it and was rewritten to carry none; the id beside it is ' +
  'the one that was written when this database was first migrated, and it is unchanged'

function theSentenceCarriesNoPath(sqlite: Database.Database): number {
  return sqlite
    .prepare("UPDATE installation SET how = ? WHERE only_row = 1 AND how LIKE '%/%'")
    .run(WHAT_A_REPAIRED_SENTENCE_SAYS).changes
}

/** Which installation this database says it belongs to, or null because the row is not there. */
export function installationOf(sqlite: Database.Database): string | null {
  if (!tableIsThere(sqlite, 'installation')) return null
  const row = sqlite.prepare('SELECT id FROM installation WHERE only_row = 1').get() as { id: string } | undefined
  return row === undefined ? null : row.id
}

/**
 * Make every existing person and agent a citizen of the world this database is, and write the
 * installation row.
 *
 * SAFE TO RUN TWICE. The installation row is an INSERT that does nothing on conflict, and both
 * UPDATEs only touch rows with no home, so a second run reports zeroes.
 */
export function migrateCitizenship(sqlite: Database.Database): CitizenshipMigrationReport {
  const columnsMissing = !tableIsThere(sqlite, 'people') || !theColumnsAreThere(sqlite, 'people')
  const installation = theInstallationThisDatabaseBelongsTo(sqlite)
  const report: CitizenshipMigrationReport = {
    columnsMissing,
    world: null,
    howTheWorldWasRead: '',
    installation: installation.id,
    howTheInstallationWasRead: `${installation.how}. The database being migrated was ${installation.database}`,
    installationWritten: 0,
    installationSentenceRepaired: 0,
    peopleMadeCitizens: 0,
    agentsMadeCitizens: 0,
    leftWithNoWorld: 0,
  }
  if (columnsMissing) return report

  const at = nowStamp()

  // THE INSTALLATION ROW FIRST, and only if there is not one. `installationOf` is read back
  // afterwards so the report says what this database now holds rather than what this checkout would
  // have written — those differ on a database restored from another installation, and the stored one
  // is the true answer.
  report.installationWritten = sqlite
    .prepare(
      'INSERT INTO installation (only_row, id, how, written_at) VALUES (1, ?, ?, ?) ON CONFLICT(only_row) DO NOTHING',
    )
    .run(installation.id, installation.how, at).changes
  report.installationSentenceRepaired = theSentenceCarriesNoPath(sqlite)
  report.installation = installationOf(sqlite) ?? installation.id
  if (report.installationWritten === 0) {
    const stored = sqlite.prepare('SELECT how FROM installation WHERE only_row = 1').get() as
      | { how: string }
      | undefined
    if (stored !== undefined) report.howTheInstallationWasRead = stored.how
  }

  const identity = databaseIdentity(sqlite.name)
  report.howTheWorldWasRead = identity.how
  if (identity.id === UNKNOWN) {
    report.leftWithNoWorld = homeless(sqlite)
    return report
  }
  report.world = identity.id

  // `citizen_since` FROM THE ROW'S OWN `created_at`, never from now. The file header says why.
  report.peopleMadeCitizens = sqlite
    .prepare(
      'UPDATE people SET home_world = ?, home_installation = ?, citizen_since = created_at WHERE home_world IS NULL',
    )
    .run(identity.id, report.installation).changes
  report.agentsMadeCitizens = sqlite
    .prepare(
      'UPDATE agents SET home_world = ?, home_installation = ?, citizen_since = created_at WHERE home_world IS NULL',
    )
    .run(identity.id, report.installation).changes
  report.leftWithNoWorld = homeless(sqlite)
  return report
}

/** How many rows in either registry still have no home world. */
function homeless(sqlite: Database.Database): number {
  const people = sqlite.prepare('SELECT COUNT(*) AS n FROM people WHERE home_world IS NULL').get() as { n: number }
  const agents = sqlite.prepare('SELECT COUNT(*) AS n FROM agents WHERE home_world IS NULL').get() as { n: number }
  return people.n + agents.n
}

/**
 * What this step did, in the words `npm run db:migrate` prints.
 *
 * IT NAMES THE WORLD AND THE INSTALLATION EVEN WHEN IT WROTE NOTHING, because on a second run both
 * are the useful facts and neither is visible anywhere else on the way past.
 */
export function describeCitizenship(report: CitizenshipMigrationReport): string {
  if (report.columnsMissing) {
    return (
      'citizens: this database has no home-world columns on `people`, so NOTHING was written and nothing was ' +
      'skipped over — there was nowhere to write. Migration 0122 adds them; point the command at the whole ' +
      'drizzle/ folder.'
    )
  }
  const lines: string[] = []
  if (report.world === null) {
    lines.push(
      `citizens: this database could not be identified, so ${String(report.leftWithNoWorld)} row(s) in the two ` +
        `registries were left with no home world rather than given an invented one. ${report.howTheWorldWasRead}`,
    )
  } else if (report.peopleMadeCitizens + report.agentsMadeCitizens === 0) {
    lines.push(
      `citizens: nothing to do. Everybody in this database is already a citizen of the world ${report.world}, ` +
        `which is ${report.howTheWorldWasRead}.`,
    )
  } else {
    lines.push(
      `citizens: ${String(report.peopleMadeCitizens)} person row(s) and ${String(report.agentsMadeCitizens)} ` +
        `agent row(s) became citizens of the world ${report.world}, each from the moment it was registered. ` +
        `The world is ${report.howTheWorldWasRead}.`,
    )
  }
  lines.push(
    report.installationWritten === 1
      ? `This database now says it belongs to the installation ${report.installation}: ${report.howTheInstallationWasRead}. It is written once and never rewritten.`
      : `It already said it belongs to the installation ${report.installation}: ${report.howTheInstallationWasRead}.`,
    ...(report.installationSentenceRepaired === 0
      ? []
      : [
          'The installation row said which path on this machine its id was worked out from, and that sentence ' +
            'has been rewritten to carry none. The id itself is unchanged. An archive carries this column, and ' +
            'a path from the machine that wrote it is not a fact about the archive.',
        ]),
  )
  return lines.join('\n')
}
