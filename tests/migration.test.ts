// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Before seals, new ledger tables were empty and legacy resource rows lacked lease. The fixture now checks the exact three baseline-revision capture events and the nullable added column, preserving every old cell comparison. */
/**
 * The migration contract: additive, safe to run twice, and safe to run against a database that
 * already has work in it.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THESE TESTS EXIST
 * ---------------------------------------------------------------------------------------
 *
 * Every other test in this suite starts from an empty database. `tests/helpers.ts` makes a
 * temporary file and runs every migration against it in one go, so nothing anywhere has ever
 * exercised the case that actually matters: migration 0001 arriving at a database where migration
 * 0000 ran weeks ago and 22 records, 22 links and 56 changes have been written since.
 *
 * That gap is the shape of every migration accident. A migration is written, it is tried on a
 * fresh database where it obviously works, and it is discovered to rebuild a table only when it is
 * run against the one copy of the data that could not be replaced.
 *
 * So the fixture here is deliberately awkward: it builds a database with ONLY migration 0000
 * applied, writes rows into it, and only then runs the real migration folder at it. Everything
 * below is a claim about what that second run may and may not do.
 *
 * ---------------------------------------------------------------------------------------
 * HOW A HALF-MIGRATED DATABASE IS BUILT, AND WHY IT IS NOT FAKED
 * ---------------------------------------------------------------------------------------
 *
 * `atMigrationZero()` writes a temporary migrations folder holding the FIRST entry of the real
 * `drizzle/meta/_journal.json` and a byte-for-byte copy of that entry's `.sql` file, then runs
 * drizzle at it. The journal entry keeps its original `when` value, which is what drizzle compares
 * against to decide what to apply — so when the real folder is pointed at the same database
 * afterwards, 0000 is genuinely recognised as already applied and 0001 is genuinely the only thing
 * that runs. Nothing is hand-written into `__drizzle_migrations`; a journal row invented by a test
 * would prove only that the test can invent journal rows.
 *
 * The same run was also done by hand against a COPY of the real `./data/panelx.db` before this was
 * committed, with the row counts read before and after. These tests deliberately do not read that
 * file. A test that behaves differently depending on whether somebody's working database happens to
 * be on disk reports different things to different people, and the one it would report nothing to
 * is whoever checks out the repository fresh.
 *
 * ---------------------------------------------------------------------------------------
 * THE SECOND FIXTURE: A DATABASE WHOSE TABLES WERE MADE THE OLD WAY
 * ---------------------------------------------------------------------------------------
 *
 * Migration 0003 creates five tables that ALREADY EXIST in every database anybody has ever run
 * this server against. They were created by `CREATE TABLE IF NOT EXISTS` statements that ran at
 * import time, in `ensureLayoutTable()`, `ensureResourceTable()` and `ensureSourceIndexTables()`,
 * which were deleted in the same change that added the migration.
 *
 * So `oldWayTables()` below holds those statements verbatim, as a historical fixture. Running the
 * real migration folder at a database built with them is the only way to test the case that
 * actually happens on the owner's machine, and it is the case a generated migration fails: drizzle-kit
 * emits a bare `CREATE TABLE`, which stops on `table panel_layouts already exists`. Deleting the
 * `IF NOT EXISTS` that was added by hand to 0003 turns these tests red, which is the point of
 * them.
 */

import { THE_TEST_FIXTURE_ROOT, THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { apiServerArguments } from './helpers.ts'
import { execFileSync, spawn } from 'node:child_process'
import { once } from 'node:events'
import { copyFileSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import Database from 'better-sqlite3'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  COUNTED_TABLES,
  countRows,
  describeOutcome,
  everyRecordCameFromTheSeed,
  irreplaceableRows,
  migrateInPlace,
  prepareToServe,
  previewMigration,
  tablesInFile,
  tablesReportedButNotRefusedOver,
  type MigrationOutcome,
} from '../src/server/db/migrate.ts'
import {
  AUTHORED_TABLES,
  DERIVED_TABLES,
  IRREPLACEABLE_TABLES,
  MEASURED_TABLES,
  MIGRATION_DECLARED_TABLES,
  RECORD_TEXT_INDEX_TABLES,
} from '../src/server/db/schema.ts'
import { everyPartTable } from '../src/server/db/every-part-table.ts'
import { PERSON_LEVEL_TABLES } from '../src/server/db/authored-table-of.ts'
import { GATE_KINDS } from '../src/shared/work.ts'
import { latestMomentOfStampInZone, parseLocalStamp } from '../src/shared/time.ts'
import {
  COLUMNS_ADDED_AFTER_THE_REBUILD,
  MIGRATIONS,
  REPO,
  columnNames,
  columns,
  journal,
  migrationsBefore,
  partialMigrations,
  scratch,
  throwAwayAfterTheTest,
  whatTheMigrationsAdd,
  type ColumnInfo,
  type Scratch,
} from './migration-fixtures.ts'
import { aTestDatabaseFolder } from './a-test-folder.ts'


/**
 * The tables that belong to no project AND that no migration writes a row into.
 *
 * TWO RULES BELOW ARE ABOUT THIS SET AND NOT ABOUT `PERSON_LEVEL_TABLES`, and the difference arrived
 * on 3 September 2026 with the participant registries. Both rules say the same thing in the end: a
 * row in one of these tables is somebody's work, so a freshly migrated database has none of them and
 * the guards must count all of them.
 *
 * `assets` AND `people` ARE THE EXCEPTION AND THEY ARE NOT AN EXCEPTION TO THE IDEA. A migration
 * writes the owner's own row and the picture drawn for it, exactly as one writes the `default`
 * workspace, so a row in either is not evidence that anybody wrote anything — which is the whole of
 * what `MIGRATION_DECLARED_TABLES` means. Counting them would make every fresh clone and every test
 * database look like a corpus somebody would miss, and the guards that protect real work would be
 * turned off within a week.
 *
 * NEITHER RULE IS WEAKENED FOR THE PLANNING LAYER, which is what they were written for: not one
 * planning table is in `MIGRATION_DECLARED_TABLES`, and the assertion below says so rather than
 * leaving a reader to check.
 */
const PERSON_LEVEL_TABLES_NOBODY_SEEDS = PERSON_LEVEL_TABLES.filter(
  (table) => !(MIGRATION_DECLARED_TABLES as readonly string[]).includes(table),
)

/**
 * A source file with its comments removed, for the two tests that assert on what the code SAYS.
 *
 * Crude on purpose: every block comment, and every line that is nothing but a `//` comment. It
 * would also blank out a string literal containing either, and nothing in the two files it is
 * pointed at has one — the failure mode is a test that becomes stricter, not one that becomes
 * hollow.
 */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

// ---------------------------------------------------------------------------- the one exception

/**
 * The migration files allowed to REBUILD a table, and which tables each one rebuilds.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS LIST EXISTS AT ALL, WHEN THE RULE USED TO BE "NEVER"
 * ---------------------------------------------------------------------------------------
 *
 * Until 0004 every migration here was additive — add a column, create a table — and the tests below
 * said so absolutely: no `DROP TABLE`, no `RENAME`, no `DELETE FROM`, in any file, ever. That rule
 * is what makes it safe to run a migration against the only copy of the data, and it is not
 * softened here. It is made specific.
 *
 * 0004 removes the UTC `DEFAULT (datetime('now'))` from the five stamp columns. SQLite has no
 * `ALTER TABLE ... ALTER COLUMN`, so a default can only be removed by rebuilding the table, and
 * `PRAGMA writable_schema` — the one route that would touch no row — is disabled by better-sqlite3's
 * defensive mode. There was no additive way to do it. The full argument, including the two dead
 * ends measured against a copy of the live database, is in the header of the migration itself.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT AN ENTRY HERE BUYS, AND WHAT IT STILL COSTS
 * ---------------------------------------------------------------------------------------
 *
 * A file on this list is exempt from the forbidden-statement rule and may write a bare
 * `CREATE TABLE`, and NOTHING ELSE about it is relaxed. It must still drop only tables it recreates
 * in the same file, recreate every table it drops, and come out the far side with every row of
 * every rebuilt table byte for byte as it went in — which is checked over the real corpus in
 * `describe('migration 0004 ...')` below rather than asserted in a comment.
 *
 * ADDING A SECOND ENTRY IS A DECISION, NOT A REFACTOR. A rebuild is the class of migration that
 * loses somebody's work, and the reason this repository never had one is that nobody could add one
 * without noticing. Writing a line here is how you notice.
 */
const REBUILDS: {
  file: string
  /** Tables the file drops AND creates again. */
  tables: readonly string[]
  /**
   * TABLES THE FILE DROPS FOR GOOD, each one a deliberate removal with its reason in `why`.
   *
   * Added 11 September 2026 with the first migration that removes a table rather than rebuilding
   * one. The rule below — a DROP is only a rebuild if the table comes back — was written when no
   * table had ever been deleted, and it left a deliberate removal with no allowed shape at all. This
   * is the named exception the REBUILDS mechanism exists to be: the removal is on a list, the list
   * says why, and a table dropped without an entry here still fails.
   */
  removes?: readonly string[]
  why: string
}[] = [
  {
    file: '0004_drop_the_utc_stamp_defaults.sql',
    tables: ['records', 'links', 'changes'],
    why:
      'Removes DEFAULT (datetime(\'now\')) from records.created_at, records.updated_at, ' +
      'links.created_at, links.updated_at and changes.at. datetime(\'now\') is UTC and every one of ' +
      'those columns is read as local wall-clock time, so the default put a wrong stamp behind a ' +
      'successful write. SQLite cannot drop a default without rebuilding the table.',
  },
  {
    file: '0154_the_seal_keeps_pointers.sql',
    tables: ['submission_baselines', 'submission_baselines_holding'],
    removes: ['submission_events'],
    why:
      'Criterion C34, the owner\'s decision of 11 September 2026: a sealed tip keeps pointers and hashes and copies ' +
      'nothing. `submission_events` is DROPPED, not rebuilt: it held a copy of every revision, change and link ' +
      'row the database already had — 17,432 rows and 27,710,429 bytes of payload when it was measured that ' +
      'day — and its copies are what made an inspector\'s check die on a 2,964,703-byte prompt (problem ' +
      '`JRY5OEjnrAPu`). Nothing it held existed only there. `submission_baselines` is REBUILT because its ' +
      'column changes meaning and gains one: the position it names moves from that dead ledger to the ' +
      '`revisions` table, and `recovered` says whether a row was converted exactly, written live afterwards, ' +
      'or could not be recovered. SQLite cannot make a NOT NULL column nullable without rebuilding the table. ' +
      'Every run keeps its row; a row whose position could not be worked out exactly keeps a NULL and says so ' +
      'rather than being given a plausible number.',
  },
  {
    file: '0111_every_table_round_ten_needs.sql',
    tables: ['source_files', 'source_index', 'source_file_hashes'],
    why:
      'All three gain `repository_id` and it goes INTO THE PRIMARY KEY, because two repositories may both hold ' +
      '`src/index.ts` and the old key let the second one overwrite the first one\'s row with nothing saying so. ' +
      'SQLite cannot change a primary key without rebuilding the table. EVERY ROW COMES BACK, through a holding ' +
      'table, with `repository_id` NULL — which has one stated meaning: written before repositories had ids, by ' +
      'the one process that scans one root. Nothing in the product can fill it yet, because a repository is ' +
      'registered by a person or an agent, so NULL is "nobody has said" rather than an id nobody minted.',
  },
  {
    // Found by its name, not its number, so a renumber is only the file name and the journal line.
    file: readdirSync(MIGRATIONS).find((one) => one.endsWith('_the_owner_comes_from_the_installer.sql')) ?? 'the owner migration is missing',
    tables: ['records', 'links'],
    // The two decisions the reason below cites.
    why:
      "Removes the DEFAULT of records.owner_id, links.owner_id and links.created_by, which was the owner's own id written into " +
      "the schema of every office (the owner's decision, and FLO-16 and FLO-17 of a second decision). SQLite cannot drop a " +
      'default without rebuilding the table. Every row of records and links comes back through a holding table with its ' +
      'rowid, and the message_delivery and implementation_map rows that point at records are held aside and put back the ' +
      'same way; tests/the-owner-comes-from-the-installer.test.ts compares every row before and after.',
  },
  {
    file: '0155_the_lease_goes.sql',
    tables: ['session_resources'],
    // The two decisions the reason below cites.
    why:
      'The owner\'s decision of 11 September 2026 withdrew the resource-lease design as over-design. ' +
      'The `lease` column on `session_resources` — added by 0147 — is what the whole design wrote into, and ' +
      'SQLite cannot drop a column without rebuilding the table. The lease ROWS are removed with it: each ' +
      'held only its own JSON history, nothing else in the database points at one, and the secretary confirmed ' +
      'the row data goes with the column. Every non-lease row comes back unchanged through a holding table, ' +
      'with both indexes. The one check inside the design that did real work — a directory with a live process ' +
      'in it is not removed — was lifted into tools/live-processes.mjs before this file was written, and the ' +
      'loss the removal takes (the seven-day hold on a world\'s database and ports) is accepted on the record ' +
      'in a second decision of the same day.',
  },
]

/**
 * THE MIGRATIONS THAT FOLD A TABLE: each deletes the rows of one table that a newer row of the same key makes
 * redundant, and nothing else.
 *
 * Added in wave 13s round 64 with the first of them. A fold is not a rebuild. It drops nothing and creates no table,
 * so it is not on REBUILDS and gains nothing a rebuild gains. It deletes rows, which the rule below forbids in every
 * other file, so an entry lets that one file write `DELETE FROM` the one table it names, and only that table. Every
 * other forbidden statement stays forbidden in it. The loss guard in src/server/db/migrate.ts counts the rows the fold
 * may remove before anything runs, and refuses a run that removed one more.
 *
 * ADDING A SECOND ENTRY IS A DECISION, NOT A REFACTOR, for the same reason as a rebuild. A migration that deletes
 * rows has to be decided on the record and declared to the loss guard. Writing a line here is how you notice.
 */
const FOLDS: {
  file: string
  /** The one table the file may delete from. */
  table: string
  why: string
}[] = [
  {
    // Found by its name, not its number, so a renumber is only the file name and the journal line.
    file: readdirSync(MIGRATIONS).find((one) => one.endsWith('_a_reader_keeps_only_the_newest_read.sql')) ?? 'the fold of conversation_reads is missing',
    table: 'conversation_reads',
    // The decision and the reply the reason below cites.
    why:
      "The decision of 17 October 2026, with the reply, given here in made-up Chinese " +
      "of the same shape, \"量好了，就按这个单做\" " +
      'to point 8 of proposal `QqSufLCLIH50`: `conversation_reads` keeps only the newest read of each ' +
      'reader in each conversation in each project. It kept one row for every time a conversation was opened, about ' +
      '1.38 million rows growing by about 130,000 a day, and every reader of the table asks for the newest read only. ' +
      'The file deletes the older reads of each project, reader kind, reader id and conversation, keeping the latest ' +
      '`at` and on a tie the highest rowid, which is the row every reader already showed, and adds the unique index ' +
      'that holds the rule from then on. tests/migration-0278-a-reader-keeps-only-the-newest-read.test.ts measures it.',
  },
]

/**
 * The tables 0004 rebuilds, which is not the same set as every table any rebuild rebuilds.
 *
 * `describe('migration 0004 ...')` proves the property that makes a rebuild acceptable: every row
 * came back with every column identical. That claim is about 0004's three tables. 0111 rebuilds
 * three MORE tables and deliberately does NOT bring their rows back, for the reason its entry above
 * gives, so asking the same question of them would be asking the wrong question — and they have no
 * `id` column to order by either.
 */
const TABLES_0004_REBUILDS: readonly string[] =
  REBUILDS.find((r) => r.file.startsWith('0004_'))?.tables ?? []

// ---------------------------------------------------------------------------- the data migrations

/**
 * Every DATA migration `migrateInPlace` runs, and the exact cells each one is allowed to write.
 *
 * ---------------------------------------------------------------------------------------
 * DECISION 13, WHICH IS WHY THIS LIST EXISTS
 * ---------------------------------------------------------------------------------------
 *
 * The rule used to be that migrations are always additive, and that was a fiction: 0004 had to
 * rebuild three tables, because SQLite cannot drop a column default any other way. The rule now
 * reads:
 *
 *   A migration should normally preserve rows without rewriting them. A migration that MUST rebuild
 *   or copy rows is an EXPLICIT NAMED EXCEPTION. Such a migration must PROVE row preservation, index
 *   and constraint preservation, idempotence where applicable, and destructive-restore
 *   compatibility. THERE IS NO HIDDEN MIGRATION REWRITE.
 *
 * `REBUILDS` above is that list for the `.sql` files. This is that list for the TypeScript ones —
 * the data migrations, which are where the rewriting actually happens, because a `.sql` file cannot
 * parse a JSON column, resolve a title, or refuse with a sentence.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT AN ENTRY BUYS AND WHAT IT COSTS
 * ---------------------------------------------------------------------------------------
 *
 * An entry is permission to write the columns it names, and permission for nothing else. The test
 * `there is no hidden migration rewrite` below reads this list, runs the real migration command over
 * a database with rows in it, compares EVERY CELL OF EVERY TABLE before and after, and fails on any
 * change to a column no entry names. So a data migration that quietly started rewriting `title`, or
 * moving `updated_at`, is a red test rather than a discovery six weeks later.
 *
 * `rewritesStoredValues` is the flag that makes the exception explicit rather than implied. `true`
 * means the migration changes a value somebody wrote, which is the expensive class; `false` means it
 * only fills a column that was empty. Both are declared, and the difference is written down.
 */
const DATA_MIGRATIONS: {
  file: string
  /** Table -> the columns this migration may write. A cell outside this fails the test below. */
  writes: { table: string; columns: readonly string[] }[]
  /** True when it changes a value somebody wrote. That is the exception decision 13 is about. */
  rewritesStoredValues: boolean
  why: string
}[] = [
  {
    file: 'src/server/db/drafts-into-plans-migration.ts',
    // INSERT-ONLY into these two, and these are the columns of the rows it inserts. It changes no cell of a row
    // that was there before it ran.
    writes: [
      { table: 'plans', columns: ['id', 'title', 'state', 'read_at', 'created_at', 'updated_at', 'created_by', 'moved_from_draft'] },
      { table: 'plan_lines', columns: ['id', 'plan_id', 'position', 'text', 'record_id', 'remark', 'updated_at', 'updated_by'] },
    ],
    rewritesStoredValues: false,
    // The owner's decision the reason below cites.
    why:
      'Problem k5FNfdgfxbt2 and item 6 of the owner\'s decision: rough thinking was kept in two stores. ' +
      'Each `planning_drafts` row becomes one open plan, its title and stamps copied as they stand, its body split ' +
      'into lines with `linesOfBody` so every character is kept. Then the draft row is DELETED, so no draft is stored ' +
      'twice, and the table is DROPPED once it is empty. That removal is declared to the loss guard in ' +
      'src/server/db/migrate.ts, which refuses the run unless `planning_drafts` lost exactly the drafts that became ' +
      'plans. A draft that does not meet a plan\'s limits is refused, left as it was, and the table kept with it.',
  },
  {
    file: 'src/server/db/withdraw-review-runs-migration.ts',
    // UPDATE-ONLY, on the runs a sent review left waiting and on the keys those runs name. It inserts and deletes nothing.
    writes: [
      { table: 'agent_runs', columns: ['state', 'ended_at', 'error'] },
      { table: 'held_keys', columns: ['revoked_at', 'revoked_because'] },
    ],
    rewritesStoredValues: true,
    // The decision the reason below cites.
    why:
      'A decision and the secretary\'s answers yMYX20nfBuep and 69_KJoAwXeKg (wave 13u round 19): a sent review writes ' +
      'no run now, because the delivery row of its one message per recipient carries the comments. The runs the old send ' +
      'wrote and no worker took would hand the same comments over twice, so each queued or declined run in a sent ' +
      'review\'s conversation with no `claimed_by` becomes `withdrawn`, with `ended_at` and a reason in `error`, and the ' +
      'key it names is revoked. It runs only in the run that applies migration 0253, so a later run is never withdrawn.',
  },
  {
    file: 'src/server/db/kinds-beside-ids-migration.ts',
    // UPDATE-ONLY, and only on a kind column that holds nothing. It inserts and deletes nothing, and changes no id.
    writes: [
      { table: 'folder_readings', columns: ['read_by_kind', 'owner_kind'] },
      { table: 'revalidations', columns: ['decided_by_kind'] },
      { table: 'conversation_reads', columns: ['as_side_kind'] },
    ],
    rewritesStoredValues: false,
    why:
      'Item 30c part 3 (wave 13s round 155): migration 0311 puts a kind column beside four columns that hold the id of ' +
      'whoever did a thing, empty on every row, and their writers fill it from then on. This step tells the rows written ' +
      'before it: an id in exactly one registry gets that kind, a side of a conversation between two agents gets agent, ' +
      'and a side of a group gets the one kind its member rows with that id say. It writes only an empty kind column, ' +
      'leaves a row it cannot tell empty, and runs only in the run that applies 0311.',
  },
  {
    file: 'src/server/db/remint-migration.ts',
    // ONLY WITH `--remint <file>`, which no run of this test gives, so the cell comparison below sees none of it. It
    // rewrites an agent's id, the seven columns with a key to it and the holder of each key an agent holds, and inserts
    // aliases and one generation row.
    writes: [
      { table: 'agents', columns: ['id'] },
      { table: 'resident_read_grants', columns: ['resident_id', 'reader_id'] },
      { table: 'resident_void_marks', columns: ['resident_id'] },
      { table: 'resident_space_writes', columns: ['resident_id'] },
      { table: 'resident_sleeps', columns: ['agent_id'] },
      { table: 'agent_records', columns: ['agent_id'] },
      { table: 'handle_holds', columns: ['agent_id'] },
      { table: 'held_keys', columns: ['whose_id'] },
      { table: 'registry_aliases', columns: ['namespace', 'alias_id', 'canonical_id'] },
      { table: 'registry_remint_generations', columns: ['digest', 'schema_digest', 'agents'] },
    ],
    rewritesStoredValues: true,
    why:
      'Item 30c part 3, as decided (wave 13s round 158): every legacy agent takes a minted id. A map is staged once with --stage-remint, and --remint applies it last and alone, in one ' +
      'transaction: each legacy agent\'s id and every key to it are rewritten, each key an agent holds is held under its ' +
      'new id, its old id is filed as an alias, and a ' +
      'generation row says which map was applied, so a second run with it writes nothing and another map is refused.',
  },
  {
    file: 'src/server/db/casting-work-groups-migration.ts',
    // ONLY AN EMPTY WORK GROUP, and only in the run that applies 0318. Beside it, it stamps the row's last change as
    // every writer of a row does: the time, the migration, and no authority. It changes no other cell of a Casting row
    // and deletes nothing; the history rows it inserts are new rows.
    writes: [
      { table: 'casting_rows', columns: ['work_group', 'work_group_from', 'changed_at', 'changed_by_kind', 'changed_by_id', 'authority'] },
      {
        table: 'casting_row_changes',
        columns: ['id', 'casting_id', 'role', 'project', 'what', 'at', 'by_kind', 'by_id', 'authority', 'decisions', 'note', 'before', 'after'],
      },
    ],
    rewritesStoredValues: true,
    why:
      'Wave 13n round CB: migration 0318 makes the work group a cell of each Casting row, empty on every row, and the roll ' +
      'for hard or simple work reads it in place of a list in its own code. This step sets each row that list put in a ' +
      'group, by its program and model, to that group, stamps the row\'s last change as the migration, and writes one ' +
      'history row for each. It writes only an empty work ' +
      'group, and runs only in the run that applies 0318, so a row added later is in no group until its cell is set.',
  },
  {
    file: 'src/server/db/casting-labels-migration.ts',
    // ONLY AN EMPTY LABELS CELL, and only in the run that applies 0349. It makes the labels hard and simple, gives each
    // row in one of those work groups the label of its group, and stamps that row's last change as the migration, as
    // 0318's step does. It changes no other cell of a Casting row and deletes nothing; every other row it writes is new.
    writes: [
      {
        table: 'casting_labels',
        columns: ['id', 'name', 'meaning', 'meaning_from', 'changed_at', 'changed_by_kind', 'changed_by_id', 'authority'],
      },
      {
        table: 'casting_label_changes',
        columns: ['id', 'label_id', 'what', 'at', 'by_kind', 'by_id', 'authority', 'note', 'before', 'after'],
      },
      { table: 'casting_rows', columns: ['labels', 'labels_from', 'changed_at', 'changed_by_kind', 'changed_by_id', 'authority'] },
      {
        table: 'casting_row_changes',
        columns: ['id', 'casting_id', 'role', 'project', 'what', 'at', 'by_kind', 'by_id', 'authority', 'decisions', 'note', 'before', 'after'],
      },
    ],
    rewritesStoredValues: true,
    why:
      'Migration 0349 makes a Casting label a row of its own, which the person names and gives a ' +
      'meaning, in place of the two work groups 0318 fixed. This step makes the labels hard and simple with the meanings ' +
      'from their recorded source, gives each row in one of those work groups the label of its group, stamps the row\'s last ' +
      'change as the migration, and writes one history row for each. It writes only an empty labels cell, and runs only ' +
      'in the run that applies 0349.',
  },
  {
    file: 'src/server/db/agent-owners-migration.ts',
    writes: [{ table: 'agents', columns: ['owner_id'] }],
    rewritesStoredValues: false,
    why:
      'The ownership column starts empty. This step copies each agent starter as it was stored into that empty column, ' +
      'only when the migration that adds it is applied. It leaves all other cells and all rows unchanged.',
  },
  {
    file: 'src/server/db/append-order-migration.ts',
    writes: [{ table: 'changes', columns: ['append_order'] }],
    rewritesStoredValues: false,
    why:
      'Problem BhszTJsVC8rF. Migration 0194 adds `changes.append_order`, empty on every row, so that an archive can ' +
      'carry the order the change log was appended in and a restore can write it back. This step copies each ' +
      'existing row\'s own rowid into it, only where it is NULL. The rowid is the order the readers used until ' +
      'then, so no answer changes. It changes no value anybody wrote.',
  },
  {
    file: 'src/server/db/blocks-migration.ts',
    writes: [
      { table: 'records', columns: ['data', 'updated_at'] },
      { table: 'changes', columns: ['field', 'old_value', 'new_value'] },
      { table: 'presentation_intent', columns: ['target'] },
    ],
    rewritesStoredValues: true,
    why:
      'Turns every stored pipeline step into a block record. A pipeline\'s `data.steps` becomes ' +
      '`data.blockIds`, a `field = data.steps` change row is re-filed onto the blocks it is about, and a ' +
      '`presentation_intent` target of the form `step:<id>` becomes the block id. None of those is additive: ' +
      'the old key has to leave, or two statements of one fact are stored and drift. It also INSERTS records, ' +
      'links and changes, which no row-preservation rule limits.',
  },
  {
    file: 'src/server/db/seal-copies-to-pointers.ts',
    writes: [{ table: 'records', columns: ['data'] }],
    rewritesStoredValues: true,
    why:
      'The data half of migration 0154, criterion C34. A seal written before 11 September 2026 carried whole ' +
      'rows inside itself: the revision before and after for every submitted record, the whole row for every ' +
      'dependency, every link row of the workspace before and after, and every ledger event with its payload. ' +
      'This keeps every pointer and every hash and drops the copies, and it re-hashes the seal so it still ' +
      'verifies against itself — which is why it is TypeScript: SQLite cannot compute sha256, and a seal ' +
      'rewritten in SQL would have carried a hash of content it no longer held. The hash it had before is kept ' +
      'beside it under `reduced.was`, so a hash written down anywhere else still resolves. It deletes no ' +
      'revision: every row a pointer names is still in `revisions`. A seal it cannot read is left exactly as ' +
      'it is and named in the report.',
  },
  {
    file: 'src/server/db/origin-migration.ts',
    writes: [{ table: 'records', columns: ['origin'] }],
    rewritesStoredValues: false,
    why:
      'Writes the measured `records.origin` onto the rows the measurement is about. It writes only where the ' +
      'column is NULL, and migration 0005 — which ran moments earlier in the same command — is what made it ' +
      'NULL on every row, so no value anybody wrote is changed. It is declared anyway, because a column being ' +
      'written to on hundreds of existing rows is exactly the thing decision 13 says must not happen ' +
      'unannounced. Since 5 September 2026 the measurement comes from the caller and this repository hands it ' +
      'none, so on every database here it writes nothing at all and reports every unstamped row as unmeasured.',
  },
  {
    file: 'src/server/db/blocked-by-migration.ts',
    writes: [{ table: 'records', columns: ['data'] }],
    rewritesStoredValues: true,
    why:
      'A `task` no longer declares `blocked_by`, so a task still holding one is a record `validateData` will ' +
      'refuse on its next write — there is no additive way out of that, the key has to leave `data`. The prose ' +
      'moves to `also_waiting_on`, joined onto whatever that field already said rather than overwriting it. It ' +
      'also INSERTS two `changes` rows per moved record, which is how both original strings survive separately.',
  },
  {
    file: 'src/server/db/workspace-migration.ts',
    writes: [
      { table: 'records', columns: ['workspace_id'] },
      { table: 'changes', columns: ['workspace_id'] },
      { table: 'links', columns: ['workspace_id'] },
      { table: 'presentation_intent', columns: ['workspace_id'] },
      { table: 'session_resources', columns: ['workspace_id'] },
    ],
    rewritesStoredValues: false,
    why:
      'Establishes the project boundaries and files every row behind the one it belongs to. `records.workspace_id` ' +
      'is written from the measurement the caller hands in — one line per record, four lines of evidence that had ' +
      'to agree, no rule and no inference. Since 5 September 2026 this repository hands it none, so no record ' +
      'moves and no project is established except `default`. The other four are COPIES of a value stored on ' +
      'another row: a ' +
      'change takes the workspace of the record it is about, a link takes the one its two ends agree on, an intent ' +
      'and a ledger row take the record they are about. That is what makes them not judgements. Nothing anybody ' +
      'wrote is changed: every row of every existing database says `default` because that was the SQL column ' +
      'default from before projects existed, and `changes.workspace_id` was made NULL on every row by migration ' +
      '0006 moments earlier. It also INSERTS into `workspaces` and `reader_anchors`, which no row-preservation ' +
      'rule limits.',
  },
  {
    file: 'src/server/db/context-migration.ts',
    writes: [{ table: 'agent_messages', columns: ['context'] }],
    rewritesStoredValues: true,
    why:
      'Moves what a comment points at into the shape round eight stores. Round seven wrote one of four shapes ' +
      'into `agent_messages.context`, one of which wrapped another in an `inside` field; round eight separates ' +
      'the three facts that were folded together, so the same comment is stored as {target, span, revision}. ' +
      'There is no additive way out: the read path dispatches through one declared vocabulary, and a row left ' +
      'in the old shape reads as a context with no target at all. It writes that ONE column of that ONE table, ' +
      'leaves alone every row it cannot read, and reports each of those by id.',
  },
  {
    file: 'src/server/db/revision-backfill.ts',
    // INSERT-ONLY, and these are the columns of the rows it inserts. It writes no cell of any table
    // that existed before it ran: `revisions` is created empty by migration 0060 moments earlier, so
    // there is nothing here anybody wrote and nothing that could be overwritten.
    writes: [
      {
        table: 'revisions',
        columns: [
          'id',
          'record_id',
          'workspace_id',
          'seq',
          'content_hash',
          'kind',
          'title',
          'summary',
          'data',
          'deleted_at',
          'op',
          'actor_type',
          'actor_id',
          'session_id',
          'at',
          'note',
        ],
      },
    ],
    rewritesStoredValues: false,
    why:
      'Gives every record with no revision its first one, holding what that record contains at the moment the ' +
      'migration runs. The revision is marked `baseline`, attributed to the system rather than to whoever wrote ' +
      'the record, stamped with the migration\'s own moment rather than the record\'s creation date, and it carries ' +
      'a note saying in plain words that it is NOT the record as it was created — what these records held before ' +
      'the ledger was built was never stored anywhere, because `changes` says what changed and never what it was. ' +
      'It writes only into `revisions`, which migration 0060 created empty a moment earlier, so it rewrites ' +
      'nothing anybody wrote. It runs LAST of the five: every other data migration changes what a record holds ' +
      'and one of them creates records, so a baseline taken earlier would hold content the record no longer has. ' +
      'IT ALSO CATCHES UP A LEDGER THAT HAS FALLEN BEHIND, added 18 August 2026: a record whose newest revision ' +
      'no longer holds what the record holds gets one more revision that does, marked `update` and attributed to ' +
      'the system, with a note saying it is not evidence of who made the write it is catching up with. Two of the ' +
      'migrations above rewrite `records.data` in raw SQL and write no revision, and this pass is the only place ' +
      'in the command where nothing is going to move afterwards. It still only INSERTS, so `rewritesStoredValues` ' +
      'stays false: history is answered by a later row and never edited.',
  },
]

/** The columns 0004 took a default off, by table. Every other column must come back unchanged. */
const STAMP_DEFAULTS_DROPPED: Record<string, readonly string[]> = {
  records: ['created_at', 'updated_at'],
  links: ['created_at', 'updated_at'],
  changes: ['at'],
}

/**
 * The columns a LATER rebuild took a default off, by table: the owner migration
 * (`the_owner_comes_from_the_installer`) took the owner's id off these three as a default. A comparison across
 * the whole folder holds their default aside, and compares everything else about them exactly.
 */
const DEFAULTS_DROPPED_AFTER_THE_REBUILD: Record<string, readonly string[]> = {
  records: ['owner_id'],
  links: ['owner_id', 'created_by'],
}

/** Every table any migration on the list rebuilds. */
const REBUILT_TABLES = new Set(REBUILDS.flatMap((r) => r.tables))

/** The tag prefix of the one migration that rebuilds tables. */
const REBUILD_TAG = '0004_'

/**
 * Columns a data migration fills by COPYING a value off another row, and where to read the source.
 *
 * A copied column cannot be checked by asserting NULL — the migration's whole job is that it is not
 * — and asserting merely that it is non-null would pass for a column full of the same invented
 * word. So each entry says which table and column it was copied FROM, and the test joins the two
 * back together. That is the difference between "the migration wrote something" and "the migration
 * wrote what it said it would write".
 */
const COLUMNS_COPIED_FROM_ANOTHER_ROW: {
  table: string
  column: string
  via: string
  from: { table: string; column: string; key: string }
}[] = [
  {
    table: 'changes',
    column: 'workspace_id',
    via: 'record_id',
    from: { table: 'records', column: 'workspace_id', key: 'id' },
  },
  // THE ROW'S OWN ROWID, which is the order SQLite appended it in. Migration 0194's data step copies
  // it, so a restore can carry the order in a column (problem BhszTJsVC8rF).
  {
    table: 'changes',
    column: 'append_order',
    via: 'rowid',
    from: { table: 'changes', column: 'rowid', key: 'rowid' },
  },
]

/**
 * Indexes added by migrations that run AFTER the rebuild, by table.
 *
 * Same rule as the columns: named one at a time, and everything not named still compared exactly.
 * An index is part of a table's shape, so a rebuild that lost one would be exactly as bad as a
 * rebuild that lost a column, and allowing "any new index" would hide that.
 */
const INDEXES_ADDED_AFTER_THE_REBUILD: Record<string, readonly string[]> = {
  // 0194 adds the unique index on `append_order`, problem BhszTJsVC8rF: no two rows at one place.
  // 0229 adds `changes_session_name_idx`, wave 13y round 20: the rows that bind a run name, so the
  // run-name rung of the session resolver does not read the whole log. It touches no row and no column.
  changes: ['changes_workspace_at_idx', 'changes_append_order_idx', 'changes_session_name_idx'],
  // 0171 adds it: one merge entry per lane, a partial unique index over `data.occupies` that only
  // merge entries holding a lane are in. Sandbox v1, piece P6. It touches no row and no column.
  // 0199 adds six, wave 13n round 33: each holds one stored field of the messages or of the sessions,
  // so the chat finds a reader's messages and an agent's runs without reading every record. Each is
  // partial to one kind and reads its field only from data that is valid JSON. They touch no row and
  // no column.
  // 0201 adds one, wave 13p round 25b: the run a flow run names, `data.run`, partial to flow runs, so a run's
  // flow run is found without reading every flow run. It touches no row and no column.
  // 0209 adds one, wave 13y round 13: the messages that point at something, `data.target`, partial to messages, so
  // the comments on a project's records are found without reading every message. It touches no row and no column.
  // 0212 adds one, wave 13p round 33: the flow a flow run names, `data.flow`, partial to flow runs, so the Flows page
  // counts and reads a flow's runs without reading every flow run. It touches no row and no column.
  // 0228 adds three, wave 13y round 20: a message's broadcast slot, its skip mark and its stop cause, each partial to
  // messages, so the reminder pass finds the office's marked lines without reading every message. It touches no row
  // and no column.
  // 0350 adds two, wave 13n round FQ: the package a worker's run was filed for, and the moment its package was asked
  // for, each partial to sessions and read from one stored field, so a package finds its workers and a day finds its
  // packages without reading every run. They touch no row and no column.
  records: [
    'records_one_merge_entry_per_lane',
    'records_message_sent_by_idx',
    'records_message_typed_from_idx',
    'records_message_routed_idx',
    'records_message_about_message_idx',
    'records_session_running_idx',
    'records_session_delivering_message_idx',
    'records_flow_run_run_idx',
    'records_message_target_idx',
    'records_flow_run_flow_idx',
    'records_message_broadcast_slot_idx',
    'records_message_broadcast_skip_idx',
    'records_message_stop_cause_idx',
    'records_session_worker_package_task_idx',
    'records_session_worker_package_asked_at_idx',
  ],
}

/**
 * Indexes a later migration deliberately REDEFINES, keyed by table. Named, so it cannot be quiet.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THERE IS A LIST HERE AT ALL, AND WHAT IT COSTS
 * ---------------------------------------------------------------------------------------
 *
 * The tests in this file say "no migration edits or removes an object that was already there", and
 * that rule caught real damage. `0030_titles_may_repeat` breaks it ON PURPOSE and is the first
 * migration to do so, so the exception is written down here with the reason rather than the rule
 * being weakened.
 *
 * WHAT IT CHANGES. `records_title_idx` was `CREATE UNIQUE INDEX ... ON records (workspace_id,
 * title)` from the very first migration. 0030 drops it and makes it again over the same two columns
 * under the same name, without UNIQUE. The owner settled the rule behind it on 16 August 2026: ID
 * is identity, title is presentation, titles may repeat. The owner met the old rule by deleting a line of
 * a plan, writing it again, and being refused because work of that title already existed.
 *
 * ONLY THE `unique` FLAG IS HELD ASIDE. The index's name, its table and its columns are still
 * compared exactly, so a migration that dropped this index, or changed which columns it covers,
 * still fails these tests. The one thing that is allowed to differ is the one thing the migration
 * says it changes.
 */
const INDEXES_REDEFINED_AFTER_THE_REBUILD: Record<string, readonly string[]> = {
  records: ['records_title_idx'],
}

/**
 * The two lists above joined with what each migration adds in a file of its own, wave 13v round 18.
 *
 * A NEW MIGRATION DOES NOT EDIT THE LISTS ABOVE, nor the sorted list of tables below. It writes
 * `tests/what-each-migration-adds/<its tag>.json`, and tests/migration-fixtures.ts says why: two
 * migrations that each edited one list here could never be judged apart. The tests read only these.
 */
const WHAT_THE_MIGRATIONS_ADD = whatTheMigrationsAdd({
  tables: [],
  columnsAddedAfterTheRebuild: COLUMNS_ADDED_AFTER_THE_REBUILD,
  indexesAddedAfterTheRebuild: INDEXES_ADDED_AFTER_THE_REBUILD,
})
const ALL_COLUMNS_ADDED_AFTER_THE_REBUILD = WHAT_THE_MIGRATIONS_ADD.columnsAddedAfterTheRebuild
const ALL_INDEXES_ADDED_AFTER_THE_REBUILD = WHAT_THE_MIGRATIONS_ADD.indexesAddedAfterTheRebuild

/** The tables listed in the test, with the tables each migration's own file declares, in SQLite's byte order. */
function withTheTablesEachMigrationAdds(listed: readonly string[]): string[] {
  return whatTheMigrationsAdd({ tables: [...listed], columnsAddedAfterTheRebuild: {}, indexesAddedAfterTheRebuild: {} }).tables.sort()
}

/**
 * A table's CREATE statement without the columns a later migration adds with ALTER TABLE.
 *
 * WHY IT IS NEEDED. `ALTER TABLE ... ADD COLUMN` rewrites what SQLite stores as the table's `sql`:
 * the new column is appended inside the parentheses. So a character-for-character comparison of a
 * table's CREATE statement across the whole folder fails for any table that gained a column, even
 * though nothing that was there was edited. Migration 0112 is the first to add one to a table that
 * existed before the fold-in, which is why this appears now.
 *
 * IT REMOVES ONLY WHAT `COLUMNS_ADDED_AFTER_THE_REBUILD` NAMES, and it removes it from BOTH sides
 * of every comparison, so the rule is unchanged for everything else: a migration that renamed a
 * column, retyped one, dropped one, or changed a constraint still fails. A migration that added a
 * column and did not name it above fails too, because its fragment is left in on one side only.
 */
function withoutAddedColumns(key: string, sql: string | undefined): string | undefined {
  if (sql === undefined) return undefined
  if (!key.startsWith('table ')) return sql
  const added = ALL_COLUMNS_ADDED_AFTER_THE_REBUILD[key.slice('table '.length)] ?? []
  let out = sql
  for (const column of added) {
    out = out.replace(new RegExp(`,\\s*\`${column}\`[^,)]*`), '')
  }
  return out
}

/** Every `type name` key in `shapeOf` that a later migration deliberately redefines. */
const SHAPE_KEYS_REDEFINED = new Set(
  Object.values(INDEXES_REDEFINED_AFTER_THE_REBUILD).flatMap((names) => names.map((n) => `index ${n}`)),
)

/**
 * Indexes a later REBUILD re-creates over the same name, table, columns, uniqueness and partial
 * WHERE, so the substance is unchanged and `structureExceptDroppedDefaults` still compares all of
 * it — but SQLite stores whatever text the rebuilding file used, so the character-for-character
 * CREATE-statement comparison in the shape tests holds these aside. 0155 rebuilds
 * `session_resources` (the lease column goes) and must re-create its two indexes to do it.
 */
const INDEX_TEXT_REWRITTEN_BY_A_REBUILD: readonly string[] = [
  'session_resources_session_idx',
  'session_resources_live_idx',
]

// ---------------------------------------------------------------------------- the fixture

/**
 * The real migrations folder with ONE MORE migration on the end, whose SQL the caller writes.
 *
 * A REAL MIGRATION AND NOT A DESCRIPTION OF ONE. The other files and their journal entries are
 * copied unchanged, so drizzle applies the extra one exactly as it would apply anything in
 * `drizzle/`: same journal, same transaction, same reporting. That is what makes the two tests
 * below evidence about the command rather than about a formatter — one of them empties a table the
 * command reports but does not refuse over, the other empties one it does, and the difference
 * between the two is the whole subject.
 *
 * The tag starts at 9999 so it sorts after every real migration and can never collide with one.
 */
function migrationsPlusOne(name: string, sql: string): string {
  const dir = throwAwayAfterTheTest(aTestDatabaseFolder('migrations-plus'))
  mkdirSync(join(dir, 'meta'))
  const entries = journal(MIGRATIONS)
  for (const entry of entries) copyFileSync(join(MIGRATIONS, `${entry.tag}.sql`), join(dir, `${entry.tag}.sql`))
  const last = entries[entries.length - 1]
  expect(last, 'the real migrations folder has no entries').toBeDefined()
  if (last === undefined) throw new Error('unreachable')
  const tag = `9999_${name}`
  writeFileSync(join(dir, `${tag}.sql`), sql)
  const plus = [...entries, { ...last, idx: last.idx + 1, when: last.when + 1000, tag }]
  writeFileSync(join(dir, 'meta', '_journal.json'), JSON.stringify({ version: '7', dialect: 'sqlite', entries: plus }))
  return dir
}

/**
 * The rows the fixture writes, chosen to mirror what a real database holds rather than the minimum
 * that makes a foreign key happy.
 *
 * The Chinese title is not decoration. Titles in this product are often Chinese, like the made-up `送料台安全护罩`, and a
 * migration that mangled text encoding would pass every test written in ASCII.
 */
const SEED_RECORDS = [
  { id: 'rec-gripper', kind: 'module', title: '量具校正', summary: 'gripper calibration' },
  { id: 'rec-estop', kind: 'problem', title: 'software E-stop does nothing', summary: null },
  { id: 'rec-twin', kind: 'task', title: 'validate the digital twin', summary: null },
]

/** One `blocks` link, because that is the link the gate columns ride on, plus one that is not. */
const SEED_LINKS = [
  { id: 'link-blocks', fromId: 'rec-estop', toId: 'rec-twin', type: 'blocks' },
  { id: 'link-relates', fromId: 'rec-gripper', toId: 'rec-twin', type: 'relates_to' },
]

const SEED_CHANGES = [
  { id: 'chg-1', recordId: 'rec-gripper', op: 'create', actorType: 'human', actorId: THE_TEST_OFFICES_OWNER.id },
  { id: 'chg-2', recordId: 'rec-estop', op: 'create', actorType: 'agent', actorId: 'claude-code' },
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

/**
 * A database exactly as it was after migration 0000, with real rows in it.
 *
 * This is the state `./data/panelx.db` was in before this change, and it is the only state in
 * which migration 0001 has anything to do.
 */
function atMigrationZero(name: string): Scratch {
  const s = scratch(name)
  migrateInPlace(s.db, partialMigrations(1))
  seed(s.db)
  return s
}

// ---------------------------------------------------------------------------- reading the shape

/**
 * Every object in the database and the exact SQL that made it, keyed by `type name`.
 *
 * A map rather than one long string, because a CREATE statement spans many lines and comparing
 * line by line would report a moved comma as a lost table.
 */
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

/**
 * No counted table lost a row, and a table that did not exist before came out EMPTY — unless a data
 * migration DECLARES that it fills that table, in which case the caller says how many rows to expect.
 *
 * WRITTEN AS A RULE RATHER THAN AS AN EXPECTED OBJECT, because the object is the defect this whole
 * change is about: three tests here compared against `{ records, links, changes }` written out by
 * hand, so widening the counted set to every authored table made them red without anything having
 * gone wrong. The rule says what those tests meant — nothing moved — and it keeps meaning it when
 * the schema gains a table.
 *
 * `null -> 0` IS NOT A LOSS AND `null -> 1` WOULD BE A SURPRISE. A migration creating the table is
 * the ordinary case; a migration creating it with a row in it is a migration inventing somebody's
 * data, and this is where that would be caught.
 *
 * ---------------------------------------------------------------------------------------
 * THE ONE EXCEPTION, WHICH IS AN EXACT NUMBER AND NEVER A WAIVER
 * ---------------------------------------------------------------------------------------
 *
 * Migration 0060 creates `revisions` and the backfill in db/revision-backfill.ts then writes ONE
 * BASELINE PER RECORD into it. That is a migration filling a table it just created, which is exactly
 * what the paragraph above says would be caught — and it is caught: the caller has to state the
 * number, and the number has to be the record count. `expected: {}` on its own would turn this into
 * a rule with a hole in it, so the exception is a value a test must supply rather than a name on a
 * list that gets longer.
 */
function expectBaselineCapture(db: Scratch['db']): void {
  // `submission_events` HELD A COPY OF EVERY ONE OF THESE REVISIONS UNTIL 11 SEPTEMBER 2026, and
  // this function compared the copies against the rows they copied. Migration 0154 dropped the table
  // (criterion C34), so what is checked here is the thing the copies were evidence OF: the backfill
  // wrote one baseline revision per record, and no run baseline was invented for a database with no
  // sessions in it.
  const revisions = db.prepare('SELECT * FROM revisions ORDER BY record_id').all() as Record<string, unknown>[]
  expect(revisions).toHaveLength(SEED_RECORDS.length)
  expect(revisions.map((one) => one['op'])).toEqual(SEED_RECORDS.map(() => 'baseline'))
  expect(countRows(db, 'submission_baselines')).toBe(0)
}

function expectNothingMoved(
  before: Record<string, number | null>,
  after: Record<string, number | null>,
  /** Tables a data migration declares it fills, and exactly how many rows it must have put there. */
  filledByAMigration: Record<string, number> = {},
): void {
  for (const table of COUNTED_TABLES) {
    const was = before[table]
    const is = after[table]
    if (was === null) {
      const expected = filledByAMigration[table] ?? 0
      expect(
        is,
        `${table} did not exist before and the migrations put ${String(is)} rows in it, not ${expected}`,
      ).toBe(expected)
      continue
    }
    expect(is, `${table} went from ${was} rows to ${String(is)}`).toBe(was)
  }
}

/**
 * One table as SQLite itself describes it: columns with their types, nullability, defaults and
 * primary-key positions, plus every index with its columns and whether it is unique and partial.
 *
 * This rather than the text of the CREATE statement, because the two databases compared below were
 * written by different hands. `NOT NULL DEFAULT 'default'` and `DEFAULT 'default' NOT NULL` are the
 * same column and different text, and a comparison of the text would report a difference that does
 * not exist while a comparison of this reports one that does.
 */
/**
 * A table as SQLite describes it, with the defaults 0004 dropped held aside and the columns later
 * migrations declare they add left out.
 *
 * Everything else — every column name, type, nullability, primary-key position and every index with
 * its columns — is compared exactly. That is what turns "0004 rebuilt three tables" from a thing to
 * be trusted into a thing that is measured: the rebuild is allowed to change five `dflt_value`
 * fields and nothing else, and the five are checked separately in the same tests. The two lists this
 * reads are named and short on purpose, and a change outside them is a failure.
 */
function structureExceptDroppedDefaults(db: Database.Database, table: string): unknown {
  const s = structure(db, table) as { columns: ColumnInfo[]; indexes: unknown[] }
  const dropped = [...(STAMP_DEFAULTS_DROPPED[table] ?? []), ...(DEFAULTS_DROPPED_AFTER_THE_REBUILD[table] ?? [])]
  const added = ALL_COLUMNS_ADDED_AFTER_THE_REBUILD[table] ?? []
  return {
    // Left out rather than held aside, because a column that is not there yet has no shape to
    // compare. SQLite's `ADD COLUMN` always appends, so removing one from the end shifts no other
    // column's ordinal position and the rest of the list still compares exactly.
    columns: s.columns
      .filter((c) => !added.includes(c.name))
      .map((c) => (dropped.includes(c.name) ? { ...c, dflt_value: 'held aside' } : c)),
    indexes: (s.indexes as { name: string; unique?: unknown }[])
      .filter((i) => !(ALL_INDEXES_ADDED_AFTER_THE_REBUILD[table] ?? []).includes(i.name))
      // Held aside rather than dropped, so the index's name, table and columns are still compared
      // exactly and only the flag the migration says it changes is exempt.
      .map((i) =>
        (INDEXES_REDEFINED_AFTER_THE_REBUILD[table] ?? []).includes(i.name)
          ? { ...i, unique: 'held aside' }
          : i,
      ),
  }
}

/** One row with the columns later migrations declare they add left out, so it can be compared. */
function rowExceptAddedColumns(table: string, row: Record<string, unknown>): Record<string, unknown> {
  const added = ALL_COLUMNS_ADDED_AFTER_THE_REBUILD[table] ?? []
  return Object.fromEntries(Object.entries(row).filter(([k]) => !added.includes(k)))
}

/**
 * Every row of every Mole Office table, keyed by table and primary key, so two snapshots can be compared
 * cell by cell rather than table by table.
 *
 * A count comparison cannot see a rewrite — the whole point of the block migration's worst defect was
 * that nine live block ids were replaced by an empty array inside a JSON column while `records`,
 * `links` and `changes` all had exactly the same number of rows as before. This is what a rule about
 * rewriting has to be measured with.
 *
 * `__drizzle_migrations` is excluded: writing a row into it is what applying a migration MEANS.
 */
function everyCell(db: Database.Database): Map<string, Record<string, unknown>> {
  const out = new Map<string, Record<string, unknown>>()
  const tables = (
    db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all() as {
      name: string
    }[]
  ).map((r) => r.name)
  for (const table of tables) {
    if (table === '__drizzle_migrations') continue
    const pk = columns(db, table)
      .filter((c) => c.pk > 0)
      .sort((a, b) => a.pk - b.pk)
      .map((c) => c.name)
    const rows = db.prepare(`SELECT * FROM "${table}"`).all() as Record<string, unknown>[]
    rows.forEach((row, i) => {
      // Every Mole Office table has a primary key. The fallback is a position, which would make a
      // reordering look like a rewrite — so if it is ever reached, the test is measuring the wrong
      // thing and should say so rather than pass quietly.
      const key = pk.length > 0 ? pk.map((c) => String(row[c])).join('\u0000') : `NO PRIMARY KEY, row ${i}`
      out.set(`${table}\u0000${key}`, row)
    })
  }
  return out
}

/** One cell that changed: which table, which column, and what it went from and to. */
interface CellChange {
  table: string
  column: string
  rowKey: string
  from: unknown
  to: unknown
}

/**
 * Every cell that changed between two snapshots, and every row that disappeared.
 *
 * A column that did not exist in the BEFORE snapshot counts as changed only when something was
 * written into it. A migration that adds a column and leaves it NULL has not rewritten anything, and
 * calling that a rewrite would make the rule impossible to keep; a migration that adds a column and
 * FILLS IT has written to every existing row, which is exactly what has to be declared.
 *
 * A BLOB CELL IS THE SAME WHEN ITS BYTES ARE. better-sqlite3 hands back a new Buffer on every read, so `===`
 * would call every blob rewritten. The index of the records' text keeps its pieces in blobs (wave 13y round 64).
 */
function cellChanges(
  before: Map<string, Record<string, unknown>>,
  after: Map<string, Record<string, unknown>>,
): { changed: CellChange[]; vanished: string[] } {
  const changed: CellChange[] = []
  const vanished: string[] = []
  for (const [key, was] of before) {
    const is = after.get(key)
    if (is === undefined) {
      vanished.push(key.replace('\u0000', ' '))
      continue
    }
    const table = key.slice(0, key.indexOf('\u0000'))
    for (const [column, value] of Object.entries(is)) {
      const existed = column in was
      const old = was[column]
      if (existed && (old === value || (Buffer.isBuffer(old) && Buffer.isBuffer(value) && old.equals(value)))) continue
      if (!existed && value === null) continue
      changed.push({ table, column, rowKey: key.replace('\u0000', ' '), from: existed ? was[column] : '(no column)', to: value })
    }
  }
  return { changed, vanished }
}

function structure(db: Database.Database, table: string): unknown {
  const indexes = (db.prepare(`PRAGMA index_list("${table}")`).all() as { name: string; unique: number; partial: number }[])
    .filter((i) => !i.name.startsWith('sqlite_autoindex'))
    .map((i) => ({
      name: i.name,
      unique: i.unique,
      partial: i.partial,
      columns: (db.prepare(`PRAGMA index_info("${i.name}")`).all() as { name: string }[]).map((c) => c.name),
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
  return { columns: columns(db, table), indexes }
}

// ============================================================================ additive only

describe('migration 0001 against a database that already has rows', () => {
  let s: Scratch
  let before: {
    shape: Map<string, string>
    counts: Record<string, number | null>
    links: unknown[]
    records: unknown[]
  }
  let outcome: MigrationOutcome

  beforeEach(() => {
    s = atMigrationZero('additive')
    before = {
      shape: shapeOf(s.db),
      counts: counts(s.db),
      links: s.db.prepare('SELECT * FROM links ORDER BY id').all(),
      records: s.db.prepare('SELECT * FROM records ORDER BY id').all(),
    }
    outcome = migrateInPlace(s.db, MIGRATIONS)
  })

  it('applies exactly the migrations that were pending, and no others', () => {
    // Counted from the journal rather than written as 1, so adding migration 0002 does not make
    // this test wrong; it will still be checking that everything after 0000 was applied here.
    expect(outcome.alreadyApplied).toBe(1)
    expect(outcome.newlyApplied).toBe(journal(MIGRATIONS).length - 1)
  })

  it('keeps every row in records, links and changes', () => {
    // ONE BASELINE REVISION PER SEEDED RECORD, and the number is stated rather than waived: migration
    // 0060 creates `revisions` and db/revision-backfill.ts writes one row per record with no revision.
    // A different number here means the backfill covered the wrong set of records.
    const baselines = { revisions: SEED_RECORDS.length }
    expectBaselineCapture(s.db)
    expectNothingMoved(before.counts, counts(s.db), baselines)
    // The fixture's own three, by name, so this cannot pass over a database that seeded nothing.
    expect(before.counts).toMatchObject({
      records: SEED_RECORDS.length,
      links: SEED_LINKS.length,
      changes: SEED_CHANGES.length,
    })
    expectNothingMoved(outcome.before, outcome.after, baselines)
  })

  it('keeps the CONTENT of every row, not just the count', () => {
    // A rebuild-and-copy migration keeps the count and can still lose a column's values. The
    // Chinese title is the one most likely to come back mangled.
    const records = s.db.prepare('SELECT id, kind, title, summary, created_at FROM records ORDER BY id').all()
    expect(records).toEqual(
      [...SEED_RECORDS]
        .sort((a, b) => a.id.localeCompare(b.id))
        .map((r) => ({ ...r, created_at: '2026-07-01 09:00:00' })),
    )
    const titles = records.map((r) => (r as { title: string }).title)
    expect(titles).toContain('量具校正')
  })

  it('drops, renames and retypes nothing outside the tables 0004 declares it rebuilds', () => {
    // Every object recorded BEFORE the migrations ran must still be there afterwards with the same
    // SQL, character for character. New objects may appear; nothing already there may be edited or
    // removed.
    //
    // The three tables on the REBUILDS list are held out here and checked harder below, where the
    // claim is not "the statement is identical" — it cannot be, that is what a rebuild does — but
    // "every column and every index came back the same, and the only difference in the whole table
    // is the five defaults the migration exists to remove".
    const after = shapeOf(s.db)
    for (const [key, sql] of before.shape) {
      const table = key.startsWith('table ') ? key.slice('table '.length) : null
      const index = key.startsWith('index ') ? key.slice('index '.length) : null
      if (table !== null && REBUILT_TABLES.has(table)) continue
      if (index !== null && INDEX_TEXT_REWRITTEN_BY_A_REBUILD.includes(index)) continue
      if (key === 'table links') continue
      // Declared redefinitions are checked in `structureExceptDroppedDefaults`, which compares the
      // index's columns and holds aside only the flag its migration says it changes.
      if (SHAPE_KEYS_REDEFINED.has(key)) continue
      expect(after.get(key), `something changed or removed ${key}`).toBe(sql)
    }
    // Nothing may VANISH, whatever else happened to it — including the objects held out above.
    for (const key of before.shape.keys()) expect(after.has(key), `${key} is gone`).toBe(true)
  })

  it('leaves every existing link with a NULL gate, which means unqualified and not hard', () => {
    const rows = s.db.prepare('SELECT id, type, gate, gate_up_to FROM links ORDER BY id').all() as {
      id: string
      type: string
      gate: string | null
      gate_up_to: string | null
    }[]
    expect(rows.map((r) => r.id)).toEqual(SEED_LINKS.map((l) => l.id).sort())
    for (const row of rows) {
      expect(row.gate, `${row.id} was given a gate it never had`).toBeNull()
      expect(row.gate_up_to).toBeNull()
    }
    // Stated separately because it is the claim that matters: nothing invented a default of
    // 'hard' for the blocks link, which would have made partly-doable work look completely stuck.
    const blocks = rows.find((r) => r.type === 'blocks')
    expect(blocks?.gate).not.toBe('hard')
  })

  it('adds the two gate columns as nullable text with no default', () => {
    const links = new Map(columns(s.db, 'links').map((c) => [c.name, c]))
    for (const name of ['gate', 'gate_up_to']) {
      const column = links.get(name)
      expect(column, `links has no ${name} column`).toBeDefined()
      expect(column?.type.toLowerCase()).toBe('text')
      expect(column?.notnull, `${name} must be nullable so existing links keep working`).toBe(0)
      expect(column?.dflt_value, `${name} must have no default; a default would put a word in an author's mouth`).toBeNull()
    }
  })

  it('accepts the gate words shared/work.ts defines, and stores them on the blocks link', () => {
    // The migration adds storage; shared/work.ts owns the vocabulary and the well-formedness rule.
    // This checks only that the column can hold what that file defines.
    for (const kind of GATE_KINDS) {
      s.db.prepare('UPDATE links SET gate = ?, gate_up_to = ? WHERE id = ?').run(kind, 'step-3', 'link-blocks')
      const row = s.db.prepare('SELECT gate, gate_up_to FROM links WHERE id = ?').get('link-blocks') as {
        gate: string
        gate_up_to: string
      }
      expect(row.gate).toBe(kind)
      expect(row.gate_up_to).toBe('step-3')
    }
  })

  it('creates reader_anchors with one row per reader per workspace', () => {
    expect(columnNames(s.db, 'reader_anchors')).toEqual([
      'workspace_id',
      'reader',
      'last_seen_at',
      'last_change_id',
    ])
    const pk = columns(s.db, 'reader_anchors')
      .filter((c) => c.pk > 0)
      .sort((a, b) => a.pk - b.pk)
      .map((c) => c.name)
    expect(pk).toEqual(['workspace_id', 'reader'])

    s.db
      .prepare('INSERT INTO reader_anchors (workspace_id, reader, last_seen_at, last_change_id) VALUES (?, ?, ?, ?)')
      .run('default', `human:${THE_TEST_OFFICES_OWNER.id}`, '2026-08-09 15:41:01', 'chg-2')
    // A second row for the same reader in the same workspace is the same bookmark, not a new one.
    expect(() =>
      s.db
        .prepare('INSERT INTO reader_anchors (workspace_id, reader, last_seen_at, last_change_id) VALUES (?, ?, ?, ?)')
        .run('default', `human:${THE_TEST_OFFICES_OWNER.id}`, '2026-08-09 16:00:00', 'chg-1'),
    ).toThrow(/UNIQUE|PRIMARY KEY/i)
    expect(countRows(s.db, 'reader_anchors')).toBe(1)
  })

  it('lets an anchor say "I looked and there was nothing", which is not the same as never looking', () => {
    // No row at all means never looked. A row with a null last_change_id means looked, at a moment
    // when there was no change to see. A reader that collapsed those two would tell somebody who
    // has read everything that they have read nothing.
    s.db
      .prepare('INSERT INTO reader_anchors (workspace_id, reader, last_seen_at, last_change_id) VALUES (?, ?, ?, NULL)')
      .run('default', 'human:phone-first-visit', '2026-08-09 15:41:01')
    const row = s.db
      .prepare('SELECT last_change_id FROM reader_anchors WHERE reader = ?')
      .get('human:phone-first-visit') as { last_change_id: string | null }
    expect(row.last_change_id).toBeNull()
    expect(s.db.prepare('SELECT * FROM reader_anchors WHERE reader = ?').get('human:never-looked')).toBeUndefined()
  })

  it('refuses an anchor pointing at a change that does not exist', () => {
    // The opposite arrangement is this project's most damaging open defect: a reference that is
    // accepted, stored, and can never resolve, behind a reply that reports success.
    expect(() =>
      s.db
        .prepare('INSERT INTO reader_anchors (workspace_id, reader, last_seen_at, last_change_id) VALUES (?, ?, ?, ?)')
        .run('default', `human:${THE_TEST_OFFICES_OWNER.id}`, '2026-08-09 15:41:01', 'chg-that-never-existed'),
    ).toThrow(/FOREIGN KEY/i)
  })

  it('refuses an anchor with no time on it, rather than inventing one in the wrong timezone', () => {
    expect(() =>
      s.db
        .prepare('INSERT INTO reader_anchors (workspace_id, reader, last_change_id) VALUES (?, ?, ?)')
        .run('default', `human:${THE_TEST_OFFICES_OWNER.id}`, 'chg-1'),
    ).toThrow(/NOT NULL/i)
  })
})

// ============================================================================ 0001 on its own

/**
 * Migration 0001 ALONE, against a database at 0000 with rows in it.
 *
 * Every other test here runs the whole folder, which is the right question to ask of a folder. This
 * one asks a question about a single file, and it has to stop at 0001 to ask it: 0004 rebuilds
 * `links`, so after the whole folder the `links` CREATE statement is drizzle's text rather than
 * 0000's and the comparison below could not mean anything. Stopping at 0001 keeps the claim exactly
 * as it was written — 0001 appends two columns and does not rebuild the table — rather than
 * deleting it because a later migration made it awkward.
 */
describe('migration 0001 on its own', () => {
  it('changes the links table by APPENDING two columns and touching nothing else', () => {
    const s = atMigrationZero('append-only')
    const was = shapeOf(s.db).get('table links')
    const wasRows = s.db.prepare('SELECT * FROM links ORDER BY id').all()
    migrateInPlace(s.db, partialMigrations(2))
    const is = shapeOf(s.db).get('table links')
    expect(was).toBeDefined()
    expect(is).toBeDefined()
    // SQLite records ADD COLUMN by EDITING the stored CREATE statement in place: the new column
    // text is spliced in after the last column definition, which on this table is before the two
    // FOREIGN KEY clauses rather than at the end. So the check is that deleting exactly the two
    // added column definitions from the new statement gives the old one back, character for
    // character. Nothing else moved.
    //
    // This is also what proves the table was not REBUILT by 0001. Drizzle rebuilds a table for some
    // kinds of change — create a new one, copy every row, drop, rename — and that rewrites every
    // link and formats the statement drizzle's own way, so no amount of deleting column text would
    // recover the original. 0004 does exactly that, deliberately, and says so; 0001 must not.
    const withoutNewColumns = (is ?? '').replace(/, `gate` text, `gate_up_to` text,/, ',')
    expect(withoutNewColumns).toBe(was)

    const wasColumns = new Set(wasRows.length > 0 ? Object.keys(wasRows[0] as object) : [])
    expect(wasColumns.size).toBeGreaterThan(0)
    const isColumns = columnNames(s.db, 'links')
    for (const name of wasColumns) expect(isColumns, `links lost ${name}`).toContain(name)
    expect(isColumns.filter((c) => !wasColumns.has(c))).toEqual(['gate', 'gate_up_to'])
  })
})

// ============================================================================ 0004: the rebuild

/**
 * Migration 0004, which is the only migration in this repository that rebuilds a table.
 *
 * THIS IS THE TEST THAT MAKES THE REBUILD SAFE TO HAVE. A rebuild copies every row of `records`,
 * `links` and `changes` into a new table, and the two ways that goes wrong are both quiet: a column
 * comes back with different values, or the table comes back with a different shape. The row-count
 * guard in src/server/db/migrate.ts sees neither. So both are compared here, in full, against a
 * database that already had rows before 0004 ran.
 *
 * The fixture is `atMigrationZero`, so these rows go through EVERY migration — the ALTER TABLE in
 * 0001, the new tables in 0002 and 0003, and then the rebuild — which is the path a real database
 * takes rather than a rebuild run on its own against a fresh one.
 */
describe('migration 0004 against a database that already has rows', () => {
  let s: Scratch
  let before: { rows: Record<string, unknown[]>; structure: Record<string, unknown> }

  beforeEach(() => {
    s = atMigrationZero('rebuild')
    // As far as 0003: everything except the rebuild, so what is compared is what 0004 alone did.
    //
    // NAMED, NOT COUNTED. This read `journal(MIGRATIONS).length - 1` until 0005 arrived, and that
    // silently became "everything except 0005" the moment a migration was added — a fixture that
    // stopped describing what the describe block is called. Asking for the file by name cannot drift.
    migrateInPlace(s.db, partialMigrations(migrationsBefore(REBUILD_TAG)))
    before = {
      rows: Object.fromEntries(
        TABLES_0004_REBUILDS.map((t) => [t, s.db.prepare(`SELECT * FROM "${t}" ORDER BY id`).all()]),
      ),
      structure: Object.fromEntries(TABLES_0004_REBUILDS.map((t) => [t, structureExceptDroppedDefaults(s.db, t)])),
    }
    // THE WHOLE FOLDER, not just 0004. That is the path a real database takes, and the later
    // migrations are held to `COLUMNS_ADDED_AFTER_THE_REBUILD`: they may add the columns named there
    // and change nothing else about a rebuilt table.
    migrateInPlace(s.db, MIGRATIONS)
  })

  it('brings every row back with every column identical', () => {
    for (const table of TABLES_0004_REBUILDS) {
      const after = (s.db.prepare(`SELECT * FROM "${table}" ORDER BY id`).all() as Record<string, unknown>[]).map((r) =>
        rowExceptAddedColumns(table, r),
      )
      expect(after, `${table} came out of the rebuild different from how it went in`).toEqual(before.rows[table])
      expect(after.length, `${table} was empty before the rebuild, so this proves nothing`).toBeGreaterThan(0)
    }
    // The columns the later migrations add are NOT ignored, they are checked separately: each one
    // has to be there, and to be NULL on a row that existed before it did. Held aside above and
    // unexamined would let a migration add a column full of invented values and call it additive.
    // WHETHER A COLUMN IS THERE IS READ FROM THE TABLE ITSELF, once for each column, and not from the
    // keys of its rows: a table with no row here had every one of its named columns checked zero times.
    const copied = new Set(COLUMNS_COPIED_FROM_ANOTHER_ROW.map((c) => `${c.table}.${c.column}`))
    for (const [table, added] of Object.entries(ALL_COLUMNS_ADDED_AFTER_THE_REBUILD)) {
      const has = columnNames(s.db, table)
      const rows = s.db.prepare(`SELECT * FROM "${table}"`).all() as Record<string, unknown>[]
      for (const column of added) {
        expect(has, `${table}.${column} is not in the database`).toContain(column)
        for (const row of rows) {
          if (copied.has(`${table}.${column}`)) continue
          expect(row[column], `${table}.${column} was filled in on a row that predates it`).toBeNull()
        }
      }
    }
    // The copied ones, joined back to what they were copied from. This is what makes the exemption
    // above safe: the column is not merely allowed to be non-null, it has to hold the value on the
    // row it names, and a migration that filled it with anything else fails here.
    for (const spec of COLUMNS_COPIED_FROM_ANOTHER_ROW) {
      const joined = s.db
        .prepare(
          `SELECT t."${spec.column}" AS got, f."${spec.from.column}" AS want FROM "${spec.table}" t ` +
            `JOIN "${spec.from.table}" f ON f."${spec.from.key}" = t."${spec.via}"`,
        )
        .all() as { got: unknown; want: unknown }[]
      expect(joined.length, `${spec.table}.${spec.column} joined to nothing, so this proves nothing`).toBeGreaterThan(0)
      for (const row of joined) {
        expect(row.got, `${spec.table}.${spec.column} is not what ${spec.from.table}.${spec.from.column} says`).toBe(
          row.want,
        )
      }
    }
    // The Chinese title again. A rebuild that mangled text encoding would keep the count and the
    // column and still lose the record.
    const titles = (s.db.prepare('SELECT title FROM records').all() as { title: string }[]).map((r) => r.title)
    expect(titles).toContain('量具校正')
  })

  it('brings every column and every index back unchanged, apart from the defaults it removes', () => {
    for (const table of TABLES_0004_REBUILDS) {
      expect(
        structureExceptDroppedDefaults(s.db, table),
        `${table} came back with a different shape, which is more than removing a default`,
      ).toEqual(before.structure[table])
    }
  })

  it('leaves no stamp column in the database with a SQL default', () => {
    // THE DEFECT, PINNED. `datetime('now')` is UTC; every one of these columns is read as local
    // wall-clock time by src/shared/time.ts. A default here writes a stamp wrong by the machine's
    // offset behind a successful INSERT, and the row looks perfectly normal afterwards — which is
    // how this product lost two months once already. Without a default, drizzle makes the column
    // required in `$inferInsert` and a writer that forgets does not compile.
    for (const [table, names] of Object.entries(STAMP_DEFAULTS_DROPPED)) {
      const byName = new Map(columns(s.db, table).map((c) => [c.name, c]))
      for (const name of names) {
        const column = byName.get(name)
        expect(column, `${table}.${name} is not in the database any more`).toBeDefined()
        expect(
          column?.dflt_value,
          `${table}.${name} has a SQL default again. datetime('now') is UTC and this column is ` +
            'local wall-clock time, so a default here stores a wrong stamp behind a successful write.',
        ).toBeNull()
        expect(column?.notnull, `${table}.${name} must stay NOT NULL, or forgetting is silent again`).toBe(1)
      }
    }
  })

  it('refuses an INSERT that leaves a stamp out, instead of inventing a UTC one', () => {
    // The other half of the same claim, stated as behaviour rather than as metadata. Raw SQL,
    // because TypeScript already refuses this at compile time and no runtime test can see that.
    expect(() =>
      s.db.prepare('INSERT INTO records (id, kind, title) VALUES (?, ?, ?)').run('rec-no-stamp', 'note', 'no stamp'),
    ).toThrow(/NOT NULL/i)
    expect(() =>
      s.db
        .prepare('INSERT INTO changes (id, record_id, op, actor_type, actor_id) VALUES (?, ?, ?, ?, ?)')
        .run('chg-no-stamp', 'rec-twin', 'update', 'human', THE_TEST_OFFICES_OWNER.id),
    ).toThrow(/NOT NULL/i)
    expect(() =>
      s.db
        .prepare('INSERT INTO links (id, from_id, to_id, type) VALUES (?, ?, ?, ?)')
        .run('link-no-stamp', 'rec-gripper', 'rec-estop', 'relates_to'),
    ).toThrow(/NOT NULL/i)
  })

  it('leaves the foreign keys enforced and resolving, and no holding table behind', () => {
    // The rebuild moves `links` and the `reader_anchors` ROWS out of the way through holding tables
    // so that a parent is never dropped while a child row points into it. If one of those were left
    // behind, tests/schema-inventory.test.ts would report a table schema.ts does not declare — this
    // says it here too, beside the migration that makes them, because that is where it would be read.
    expect(s.db.pragma('foreign_key_check')).toEqual([])
    expect(s.db.pragma('integrity_check')).toEqual([{ integrity_check: 'ok' }])
    const names = (
      s.db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]
    ).map((r) => r.name)
    expect(names.filter((n) => n.startsWith('__hold'))).toEqual([])
  })

  it('keeps the reader_anchors rows and does not touch the reader_anchors table', () => {
    // reader_anchors is a CHILD of changes and needs no repair of its own, so 0004 empties it and
    // fills it back rather than rebuilding it. That is the difference between moving rows out of
    // the way and re-typing a declaration that was already right.
    const s2 = atMigrationZero('anchors')
    migrateInPlace(s2.db, partialMigrations(migrationsBefore(REBUILD_TAG)))
    s2.db
      .prepare('INSERT INTO reader_anchors (workspace_id, reader, last_seen_at, last_change_id) VALUES (?, ?, ?, ?)')
      .run('default', `human:${THE_TEST_OFFICES_OWNER.id}`, '2026-07-02 18:30:00', 'chg-2')
    s2.db
      .prepare('INSERT INTO reader_anchors (workspace_id, reader, last_seen_at, last_change_id) VALUES (?, ?, ?, NULL)')
      .run('default', 'human:phone', '2026-07-02 09:00:00')
    const wasTable = shapeOf(s2.db).get('table reader_anchors')
    const wasRows = s2.db.prepare('SELECT * FROM reader_anchors ORDER BY reader').all()

    migrateInPlace(s2.db, MIGRATIONS)

    expect(s2.db.prepare('SELECT * FROM reader_anchors ORDER BY reader').all()).toEqual(wasRows)
    expect(shapeOf(s2.db).get('table reader_anchors')).toBe(wasTable)
    expect(s2.db.pragma('foreign_key_check')).toEqual([])
  })

  it('is safe to run again, and does nothing the second time', () => {
    const again = migrateInPlace(s.db, MIGRATIONS)
    expect(again.newlyApplied).toBe(0)
    for (const table of TABLES_0004_REBUILDS) {
      const after = (s.db.prepare(`SELECT * FROM "${table}" ORDER BY id`).all() as Record<string, unknown>[]).map((r) =>
        rowExceptAddedColumns(table, r),
      )
      expect(after).toEqual(before.rows[table])
    }
  })
})

// ============================================================================ the five folded in

/**
 * The statements the three deleted `ensure*` functions ran, verbatim.
 *
 * This is a HISTORICAL FIXTURE and it must not be tidied up. Every database that existed before
 * migration 0003 has tables of exactly this shape, made by exactly these statements at import
 * time: `ensureLayoutTable()` in api/layout.ts, `ensureResourceTable()` in lib/resources.ts and
 * `ensureSourceIndexTables()` in lib/sourceindex.ts. Editing this string to match the migration
 * would delete the difference these tests are here to look for.
 */
const OLD_WAY_DDL = `
  CREATE TABLE IF NOT EXISTS panel_layouts (
    workspace_id TEXT NOT NULL DEFAULT 'default',
    id           TEXT NOT NULL,
    layout       TEXT NOT NULL,
    updated_at   TEXT NOT NULL,
    updated_by   TEXT NOT NULL,
    PRIMARY KEY (workspace_id, id)
  );
  CREATE TABLE IF NOT EXISTS session_resources (
    id                TEXT PRIMARY KEY,
    workspace_id      TEXT NOT NULL DEFAULT 'default',
    session_record_id TEXT NOT NULL,
    type              TEXT NOT NULL,
    key               TEXT NOT NULL,
    pgid              INTEGER,
    os_started_at     TEXT,
    detail            TEXT NOT NULL,
    registered_at     TEXT NOT NULL,
    registered_by     TEXT NOT NULL,
    released_at       TEXT,
    released_by       TEXT,
    release_note      TEXT
  );
  CREATE INDEX IF NOT EXISTS session_resources_session_idx
    ON session_resources (session_record_id);
  CREATE UNIQUE INDEX IF NOT EXISTS session_resources_live_idx
    ON session_resources (workspace_id, session_record_id, type, key)
    WHERE released_at IS NULL;
  CREATE TABLE IF NOT EXISTS source_files (
    workspace_id TEXT NOT NULL DEFAULT 'default',
    path         TEXT NOT NULL,
    language     TEXT NOT NULL,
    size_bytes   INTEGER NOT NULL,
    lines        INTEGER NOT NULL,
    imports      TEXT NOT NULL,
    exports      TEXT NOT NULL,
    modified_at  TEXT NOT NULL,
    PRIMARY KEY (workspace_id, path)
  );
  CREATE TABLE IF NOT EXISTS source_index (
    workspace_id TEXT PRIMARY KEY DEFAULT 'default',
    built_at     TEXT NOT NULL,
    built_by     TEXT NOT NULL,
    root         TEXT NOT NULL,
    scan_ms      INTEGER NOT NULL,
    skipped      TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS source_file_hashes (
    workspace_id TEXT NOT NULL DEFAULT 'default',
    path         TEXT NOT NULL,
    hash         TEXT NOT NULL,
    built_at     TEXT NOT NULL,
    PRIMARY KEY (workspace_id, path)
  );
`

/** The five tables migration 0003 brought into the migration system. */
const FOLDED_IN = ['panel_layouts', 'session_resources', 'source_files', 'source_index', 'source_file_hashes'] as const

/**
 * The two of the five that nothing after 0003 touches, and the three that 0111 re-keys.
 *
 * THE SPLIT IS NOT A WEAKENING OF THE CLAIM, it is the claim getting more specific. `panel_layouts`
 * and `session_resources` must still come through the whole folder with every row and every part of
 * their shape identical, and the partial unique index on `session_resources` is the thing most
 * likely to be lost quietly, so it is still compared exactly.
 *
 * The other three are rebuilt by 0111 — `repository_id` joins their primary key, and SQLite cannot
 * change a primary key any other way. Every row of them comes back, so the question is the same one
 * 0004 answers, with one addition: the column that joined the key reads NULL, and NULL there means
 * nobody has said which repository, because nothing in the product can say yet.
 */
const FOLDED_IN_UNTOUCHED = ['panel_layouts', 'session_resources'] as const
const FOLDED_IN_REKEYED = ['source_files', 'source_index', 'source_file_hashes'] as const

/** The tag prefix of the migration that folded them in. Named so the reason for it stays readable. */
const FOLD_TAG = '0003_'

/** How many migrations come before the fold-in. */
function migrationsBeforeFold(): number {
  return migrationsBefore(FOLD_TAG)
}

/**
 * One row in each of the five, written the way the file that owns the table writes it.
 *
 * Rows, not empty tables. All five are empty in the live database today, and a test that migrated
 * five empty tables would prove that nothing was lost from nothing.
 */
function seedFolded(db: Database.Database): void {
  db.prepare(
    'INSERT INTO panel_layouts (workspace_id, id, layout, updated_at, updated_by) VALUES (?, ?, ?, ?, ?)',
  ).run('default', 'home', '{"panels":[{"i":"attention","x":0,"y":0}]}', '2026-08-09 15:41:01', `human:${THE_TEST_OFFICES_OWNER.id}`)

  db.prepare(
    'INSERT INTO session_resources (id, workspace_id, session_record_id, type, key, pgid, os_started_at, detail, ' +
      'registered_at, registered_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(
    'res-1',
    'default',
    'rec-twin',
    'process',
    '31337',
    31337,
    '2026-08-09 15:00:00',
    'vite dev server on 5173',
    '2026-08-09 15:41:01',
    'agent:claude-code',
  )

  db.prepare(
    'INSERT INTO source_files (workspace_id, path, language, size_bytes, lines, imports, exports, modified_at) ' +
      'VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  ).run('default', 'src/server/db/schema.ts', 'ts', 12345, 400, '["drizzle-orm"]', '["records"]', '2026-08-09 15:00:00')

  db.prepare(
    'INSERT INTO source_index (workspace_id, built_at, built_by, root, scan_ms, skipped) VALUES (?, ?, ?, ?, ?, ?)',
  ).run('default', '2026-08-09 15:41:01', 'agent:claude-code', `${THE_TEST_FIXTURE_ROOT}/test_claude/panelx`, 412, '[]')

  db.prepare('INSERT INTO source_file_hashes (workspace_id, path, hash, built_at) VALUES (?, ?, ?, ?)').run(
    'default',
    'src/server/db/schema.ts',
    'a3f1c0de',
    '2026-08-09 15:41:01',
  )
}

/** Every row of the tables named, so the comparison is about content and not only about counts. */
function foldedRows(db: Database.Database, tables: readonly string[] = FOLDED_IN): Record<string, unknown[]> {
  const out: Record<string, unknown[]> = {}
  for (const table of tables) {
    // WITHOUT THE COLUMNS A LATER MIGRATION ADDS, by the same named list the re-keyed tables use.
    // These snapshots are taken before the whole folder runs and compared with what it leaves, so a
    // column added afterwards is in one side and not the other. `COLUMNS_ADDED_AFTER_THE_REBUILD`
    // is where that is declared, one entry per column with its reason; everything not named there
    // is still compared exactly, so a migration that added a column and did not say so still fails.
    out[table] = (db.prepare(`SELECT * FROM "${table}"`).all() as Record<string, unknown>[]).map((row) =>
      rowExceptAddedColumns(table, row),
    )
  }
  return out
}

/**
 * Each of the tables named, as SQLite describes it, without the columns a later migration adds.
 *
 * `structureExceptDroppedDefaults` is the same allowance the rebuild tests use, and it reads the
 * same named list: a column in `COLUMNS_ADDED_AFTER_THE_REBUILD` is left out of both sides, and
 * everything else — every other column, its type, its ordinal position, every index and whether it
 * is unique and partial — is still compared exactly.
 */
function foldedStructure(db: Database.Database, tables: readonly string[] = FOLDED_IN): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const table of tables) out[table] = structureExceptDroppedDefaults(db, table)
  return out
}

/**
 * A database in the state every real one was in before this change: migrated as far as the
 * migration before the fold-in, with the five tables created by the old `ensure*` statements and
 * rows in all of them.
 */
function theOldWay(name: string): Scratch {
  const s = scratch(name)
  migrateInPlace(s.db, partialMigrations(migrationsBeforeFold()))
  seed(s.db)
  s.db.exec(OLD_WAY_DDL)
  seedFolded(s.db)
  return s
}

describe('migration 0003 against a database whose five tables were made the old way', () => {
  let s: Scratch
  let before: { structure: Record<string, unknown>; rows: Record<string, unknown[]>; shape: Map<string, string> }
  let outcome: MigrationOutcome

  beforeEach(() => {
    s = theOldWay('folded')
    before = { structure: foldedStructure(s.db), rows: foldedRows(s.db), shape: shapeOf(s.db) }
    outcome = migrateInPlace(s.db, MIGRATIONS)
  })

  it('applies, instead of stopping on "table panel_layouts already exists"', () => {
    // This is the whole reason `IF NOT EXISTS` is added to every generated migration by hand. A
    // bare CREATE TABLE here fails against every database anybody has run this server against.
    expect(outcome.alreadyApplied).toBe(migrationsBeforeFold())
    expect(outcome.newlyApplied).toBe(journal(MIGRATIONS).length - migrationsBeforeFold())
  })

  it('leaves the two nothing re-keys exactly as they were, down to the partial index', () => {
    // `CREATE TABLE IF NOT EXISTS` against an existing table does nothing at all, which is what
    // makes this migration additive. If it ever started rebuilding one, the unique index on
    // session_resources — which is PARTIAL, and only applies while released_at is null — is the
    // first thing that would come back subtly wrong.
    //
    // THE OTHER THREE ARE ASKED A DIFFERENT QUESTION BY THE TEST BELOW, and it is not a softer one:
    // 0111 rebuilds them on purpose, so "the shape is identical" is a claim that is supposed to be
    // false, and asserting it here would pin the wrong thing.
    expect(foldedStructure(s.db, FOLDED_IN_UNTOUCHED)).toEqual(
      Object.fromEntries(FOLDED_IN_UNTOUCHED.map((t) => [t, before.structure[t]])),
    )
  })

  it('keeps every row of those two', () => {
    expect(foldedRows(s.db, FOLDED_IN_UNTOUCHED)).toEqual(
      Object.fromEntries(FOLDED_IN_UNTOUCHED.map((t) => [t, before.rows[t]])),
    )
    // Stated separately so a future edit cannot make this test pass by seeding nothing.
    for (const table of FOLDED_IN_UNTOUCHED) expect(countRows(s.db, table), `${table} is empty`).toBe(1)
  })

  it('re-keys the other three and brings every row back, which is the part that could have lost rows', () => {
    // THE ONE STATEMENT IN THIS FOLDER THAT DROPS A TABLE HOLDING ROWS SOMEBODY COULD MISS. It does
    // not lose one: each row goes through a holding table and comes back, with `repository_id` NULL
    // — nobody has said, because nothing in the product can say yet.
    for (const table of FOLDED_IN_REKEYED) {
      expect((before.rows[table] ?? []).length, `${table} was not seeded, so this proves nothing`).toBe(1)
      expect(countRows(s.db, table), `${table} lost a row across the re-key`).toBe(1)
      const key = (s.db.prepare(`SELECT name FROM pragma_table_info('${table}') WHERE pk > 0 ORDER BY pk`).all() as {
        name: string
      }[]).map((c) => c.name)
      expect(key, `${table} came back without repository_id in its key`).toContain('repository_id')
      // Every value that was there is still there, and the one new column reads "nobody has said".
      const after = s.db.prepare(`SELECT * FROM "${table}"`).all() as Record<string, unknown>[]
      expect(after.map((r) => rowExceptAddedColumns(table, r))).toEqual(before.rows[table])
      for (const row of after) expect(row['repository_id'], `${table} invented a repository id`).toBeNull()
    }
    // AND NOTHING AUTHORED MOVED WITH THEM.
    expect(counts(s.db)).toMatchObject({
      records: SEED_RECORDS.length,
      links: SEED_LINKS.length,
      changes: SEED_CHANGES.length,
    })
  })

  it('keeps every record, link and change as well', () => {
    // `toMatchObject` and not `toEqual`: the counted set is every authored table, and the five this
    // fixture folds in are asserted row by row by the test above.
    expect(counts(s.db)).toMatchObject({
      records: SEED_RECORDS.length,
      links: SEED_LINKS.length,
      changes: SEED_CHANGES.length,
    })
    // The planning layer arrived long after the fold and nothing in this fixture writes to it, so a
    // row in it here would be a migration inventing data.
    expectBaselineCapture(s.db)
    for (const table of PERSON_LEVEL_TABLES_NOBODY_SEEDS) {
      expect(countRows(s.db, table), `${table} holds rows nothing wrote`).toBe(0)
    }
  })

  it('changes nothing else in the database that was already there', () => {
    // The three tables 0004 rebuilds are held out, for the reason given on REBUILDS: after the whole
    // folder their CREATE statements are drizzle's text rather than 0000's, and no character-level
    // comparison of them can mean anything. What 0004 did to them is measured in full in
    // `describe('migration 0004 ...')` — every row, every column, every index — so holding them out
    // here loses no coverage. Everything else, including all five folded-in tables and every index
    // in the database, is still compared character for character.
    const after = shapeOf(s.db)
    for (const [key, sql] of before.shape) {
      const table = key.startsWith('table ') ? key.slice('table '.length) : null
      const index = key.startsWith('index ') ? key.slice('index '.length) : null
      if (table !== null && REBUILT_TABLES.has(table)) continue
      // See `INDEXES_REDEFINED_AFTER_THE_REBUILD`: a declared redefinition, checked by columns
      // elsewhere rather than by the text of its CREATE statement.
      if (SHAPE_KEYS_REDEFINED.has(key)) continue
      if (index !== null && INDEX_TEXT_REWRITTEN_BY_A_REBUILD.includes(index)) continue
      expect(withoutAddedColumns(key, after.get(key)), `0003 changed or removed ${key}`).toBe(
        withoutAddedColumns(key, sql),
      )
    }
    for (const key of before.shape.keys()) expect(after.has(key), `${key} is gone`).toBe(true)
  })

  it('is still safe to run again', () => {
    const again = migrateInPlace(s.db, MIGRATIONS)
    expect(again.newlyApplied).toBe(0)
    expect(foldedRows(s.db, FOLDED_IN_UNTOUCHED)).toEqual(
      Object.fromEntries(FOLDED_IN_UNTOUCHED.map((t) => [t, before.rows[t]])),
    )
    // And the three the folder re-keys still hold what they held, rather than being rewritten again.
    for (const table of FOLDED_IN_REKEYED) expect(countRows(s.db, table), `${table} lost or gained rows`).toBe(1)
  })
})

describe('migration 0155 against a database that holds lease rows', () => {
  let s: Scratch
  let ordinary: Record<string, unknown>[]

  beforeEach(() => {
    s = scratch('lease-removal')
    // As far as 0154: the lease column exists and 0155 has not run, which is the state of every real
    // database that holds lease rows.
    migrateInPlace(s.db, partialMigrations(migrationsBefore('0155_')))
    const lease = (i: number) =>
      JSON.stringify({
        id: `seeded-lease-${i}`,
        revision: 1,
        resource: { kind: 'worktree', identity: `/seeded/tree-${i}`, machine: 'seeded', repository: 'seeded', workspace: 'default' },
        run: `seeded-run-${i}`,
        attempt: `seeded-attempt-${i}`,
        dependent: { kind: 'check', id: `seeded-dependent-${i}` },
        acquired: { stamp: '2026-09-11 12:00:00' },
        deadline: { stamp: '2026-09-18 12:00:00', instant: '2026-09-18T12:00:00.000+08:00', offset: '+08:00', zone: 'Asia/Shanghai' },
        renewed: [],
        ended: null,
        state: 'held',
      })
    const insert = s.db.prepare(
      "INSERT INTO session_resources (id, workspace_id, session_record_id, type, key, detail, registered_at, registered_by, lease) " +
        "VALUES (?, 'default', 'seeded-run', ?, ?, 'seeded by the fixture', '2026-09-11 12:00:00', 'agent:seeded', ?)",
    )
    for (let i = 0; i < 3; i += 1) insert.run(`seeded-lease-${i}`, 'lease', `seeded-lease-${i}`, lease(i))
    for (let i = 0; i < 2; i += 1) insert.run(`seeded-process-${i}`, 'process', String(4200 + i), null)
    ordinary = s.db.prepare("SELECT * FROM session_resources WHERE type != 'lease' ORDER BY id").all() as Record<string, unknown>[]
    expect(ordinary.length, 'the fixture seeded nothing, so this proves nothing').toBe(2)
    migrateInPlace(s.db, MIGRATIONS)
  })

  it('removes exactly the lease rows and brings every other row back field for field', () => {
    const after = s.db.prepare('SELECT * FROM session_resources ORDER BY id').all() as Record<string, unknown>[]
    expect(after.map((r) => r['type']), 'a row that is not a lease survived the rebuild').toEqual(['process', 'process'])
    // Five went in, three lease rows are the removal the owner accepted, so exactly two come back.
    expect(countRows(s.db, 'session_resources')).toBe(5 - 3)
    expect(columnNames(s.db, 'session_resources'), 'the lease column is gone').not.toContain('lease')
    // Every row that was there is still there, and the one column the rebuild removes is the only
    // difference: the comparison strips `lease` from the before side, where it was NULL anyway.
    expect(after).toEqual(ordinary.map((row) => Object.fromEntries(Object.entries(row).filter(([k]) => k !== 'lease'))))
  })

  it('is the removal the loss guard declares, not a shrink it waives', () => {
    // The guard's arithmetic is what this test pins: the table's count afterwards must be exactly
    // its count before minus the lease rows counted before anything ran. One less than that is a
    // loss with a name; one more is a growth, which is never a loss.
    expect(countRows(s.db, 'session_resources')).toBe(2)
  })
})

/**
 * MUTATION PROOF (after a green control): in src/server/db/migrate.ts, in the loss guard inside
 * `migrateInPlace`, delete `- removedByDeclaredRemoval` from the `expected` line for
 * `session_resources`. Both cases above then go red, because the guard refuses the migration it is
 * meant to declare: "went from 5 rows to 2: 3 lease rows were declared removed... so 5 were
 * expected". Restoring the subtraction turns them green again. The guard subtracts the count
 * `rowsADeclaredRemovalTakes` took BEFORE anything ran, so the exception is measured, not waived.
 */

/**
 * MIGRATION 0165 ADDS THE WINDOW COLUMNS TO installation — criterion P83, point 6.
 *
 * THE FIXTURE IS A DATABASE THAT HAS NEVER SEEN 0165. `partialMigrations(migrationsBefore('0165_'))`
 * runs the real files up to 0164 and no further, so the ALTER statements added to 0165 are the only
 * thing that can add these columns. A fresh database would get them from the same run and would
 * prove nothing about a database that predates the migration.
 *
 * MUTATION PROOF (after a green control): delete one of the three ALTER statements from
 * drizzle/0165_held_keys_and_header_only_calls.sql and the case below goes red naming that column.
 *
 * THE MIGRATION WAS AMENDED IN PLACE, and that is only safe because it had run nowhere that
 * matters. src/server/db/migrate.ts stores each applied migration's hash and does not compare it, so
 * an edit to a migration that has already run changes nothing and never re-runs; a column added
 * after 0165 has run is a new migration. It had run only on a throwaway copy, which was deleted.
 */
describe('migration 0165 against a database that has never seen it', () => {
  it('adds all three window columns to installation, nullable and with no default', () => {
    const s = scratch('window-columns')
    migrateInPlace(s.db, partialMigrations(migrationsBefore('0165_')))
    // THE FIXTURE IS BEFORE 0165, or this case would be measuring nothing.
    expect(columnNames(s.db, 'installation')).not.toContain('window_closed_at')
    migrateInPlace(s.db, MIGRATIONS)
    const held = columns(s.db, 'installation')
    const byName = new Map(held.map((c) => [c.name, c]))
    for (const name of ['window_closed_at', 'window_closed_by_kind', 'window_closed_by_id']) {
      const column = byName.get(name)
      expect(column, `0165 did not add ${name} to installation`).toBeDefined()
      // NULLABLE WITH NO DEFAULT, because null is the shipped state: every database has the window
      // open until the person closes it.
      expect(column?.notnull, `${name} must be nullable`).toBe(0)
      expect(column?.dflt_value, `${name} must have no default`).toBeNull()
    }
  })
})

/**
 * MIGRATION 0166 ADDS THE WHAT-IS-KEPT COLUMNS TO installation — criterion U6.
 *
 * THE FIXTURE IS A DATABASE THAT HAS NEVER SEEN 0166, so the three ALTER statements are the only
 * thing that can add these columns. A fresh database would get them from the same run and would
 * prove nothing about a database that predates the migration.
 *
 * MUTATION PROOF (after a green control): delete one of the three ALTER statements from
 * drizzle/0166_what_the_office_keeps_is_his_setting.sql and the case below goes red naming it.
 *
 * NULL IS THE SHIPPED STATE AND IT MEANS NOBODY HAS CHOSEN: the default applies and the Settings
 * panel says nobody chose. The migration writes no default and no backfill, so a database that
 * predates it reads as nobody having chosen rather than as the person having chosen the defaults.
 */
describe('migration 0166 against a database that has never seen it', () => {
  it('adds all three what-is-kept columns to installation, nullable and with no default', () => {
    const s = scratch('what-is-kept-columns')
    migrateInPlace(s.db, partialMigrations(migrationsBefore('0166_')))
    // THE FIXTURE IS BEFORE 0166, or this case would be measuring nothing.
    expect(columnNames(s.db, 'installation')).not.toContain('keep_backups')
    migrateInPlace(s.db, MIGRATIONS)
    const held = columns(s.db, 'installation')
    const byName = new Map(held.map((c) => [c.name, c]))
    for (const name of ['keep_backups', 'untraced_request_days', 'traced_request_days']) {
      const column = byName.get(name)
      expect(column, `0166 did not add ${name} to installation`).toBeDefined()
      expect(column?.notnull, `${name} must be nullable`).toBe(0)
      expect(column?.dflt_value, `${name} must have no default`).toBeNull()
    }
  })
})

/**
 * MIGRATION 0175 AGAINST A DATABASE THAT HAS NEVER SEEN IT. Criterion M91: whether agents may inject
 * is one switch for every agent, a column on the installation row.
 *
 * MUTATION PROOF (after a green control): delete the ALTER statement from
 * drizzle/0175_whether_agents_may_inject_is_one_setting.sql and the case below goes red naming it.
 */
describe('migration 0175 against a database that has never seen it', () => {
  it('adds agents_may_inject to installation, nullable and with no default', () => {
    const s = scratch('agents-may-inject-column')
    migrateInPlace(s.db, partialMigrations(migrationsBefore('0175_')))
    // THE FIXTURE IS BEFORE 0175, or this case would be measuring nothing.
    expect(columnNames(s.db, 'installation')).not.toContain('agents_may_inject')
    migrateInPlace(s.db, MIGRATIONS)
    const column = columns(s.db, 'installation').find((c) => c.name === 'agents_may_inject')
    expect(column, '0175 did not add agents_may_inject to installation').toBeDefined()
    expect(column?.notnull, 'agents_may_inject must be nullable').toBe(0)
    expect(column?.dflt_value, 'agents_may_inject must have no default').toBeNull()
  })
})

/**
 * MIGRATION 0187 AGAINST A DATABASE THAT HAS NEVER SEEN IT. Problem 8Kf0hCaK4lQY: which address is which
 * machine is the person's own table, a column on the installation row.
 *
 * MUTATION PROOF (after a green control): delete the ALTER statement from
 * drizzle/0187_the_person_names_the_machines_by_their_address.sql and the case below goes red naming it.
 */
describe('migration 0187 against a database that has never seen it', () => {
  it('adds machine_names to installation, nullable and with no default', () => {
    const s = scratch('machine-names-column')
    migrateInPlace(s.db, partialMigrations(migrationsBefore('0187_')))
    // THE FIXTURE IS BEFORE 0187, or this case would be measuring nothing.
    expect(columnNames(s.db, 'installation')).not.toContain('machine_names')
    migrateInPlace(s.db, MIGRATIONS)
    const column = columns(s.db, 'installation').find((c) => c.name === 'machine_names')
    expect(column, '0187 did not add machine_names to installation').toBeDefined()
    expect(column?.notnull, 'machine_names must be nullable').toBe(0)
    expect(column?.dflt_value, 'machine_names must have no default').toBeNull()
  })
})

/**
 * MIGRATION 0198 AGAINST A DATABASE THAT HAS NEVER SEEN IT. Problem 0WUuvB0IhRfb: the secretary who takes
 * the dead letters is the person's own setting, a column on the installation row.
 *
 * MUTATION PROOF (after a green control): delete the ALTER statement from
 * drizzle/0198_the_secretary_who_takes_the_dead_letters.sql and the case below goes red naming it.
 */
describe('migration 0198 against a database that has never seen it', () => {
  it('adds dead_letter_secretary to installation, nullable and with no default', () => {
    const s = scratch('dead-letter-secretary-column')
    migrateInPlace(s.db, partialMigrations(migrationsBefore('0198_')))
    // THE FIXTURE IS BEFORE 0198, or this case would be measuring nothing.
    expect(columnNames(s.db, 'installation')).not.toContain('dead_letter_secretary')
    migrateInPlace(s.db, MIGRATIONS)
    const column = columns(s.db, 'installation').find((c) => c.name === 'dead_letter_secretary')
    expect(column, '0198 did not add dead_letter_secretary to installation').toBeDefined()
    expect(column?.notnull, 'dead_letter_secretary must be nullable').toBe(0)
    expect(column?.dflt_value, 'dead_letter_secretary must have no default').toBeNull()
  })
})

/**
 * MIGRATION 0204: THE MESSAGES WHOSE WORD MOVED SINCE A MOMENT ARE FOUND BY INDEX. Wave 13y round 10. A conversation's
 * re-read asks `agent_messages` for `state_at >= ?` (`messagesCarrying` in src/server/lib/dispatch.ts), and before
 * this index SQLite read every message to answer it.
 *
 * MUTATION PROOF (after a green control): delete the CREATE INDEX statement from
 * drizzle/0204_a_message_that_moved_is_found_by_index.sql and the case below goes red naming the index.
 */
describe('migration 0204 against a database that has never seen it', () => {
  it('adds agent_messages_state_at_idx, and the moved-since read searches it instead of reading every message', () => {
    const s = scratch('state-at-index')
    migrateInPlace(s.db, partialMigrations(migrationsBefore('0204_')))
    const plan = (): string =>
      (s.db.prepare('EXPLAIN QUERY PLAN SELECT id FROM agent_messages WHERE state_at >= ?').all('2026-10-08 00:00:00') as { detail: string }[])
        .map((row) => row.detail)
        .join(' | ')
    // THE FIXTURE IS BEFORE 0204, or this case would be measuring nothing: the read walks the table.
    expect(plan()).toContain('SCAN')
    migrateInPlace(s.db, MIGRATIONS)
    const index = s.db.prepare("SELECT sql FROM sqlite_master WHERE type = 'index' AND name = 'agent_messages_state_at_idx'").get() as { sql: string } | undefined
    expect(index, '0204 did not add agent_messages_state_at_idx').toBeDefined()
    expect(index?.sql).not.toContain('UNIQUE')
    expect(plan()).toContain('USING INDEX agent_messages_state_at_idx')
  })
})

/**
 * MIGRATION 0208 AGAINST A DATABASE THAT HAS NEVER SEEN IT. A decision makes the merge queue's owner, who
 * may move an entry to the front besides the person, the person's own setting, a column on the installation
 * row.
 *
 * MUTATION PROOF (after a green control): delete the ALTER statement from drizzle/0208_the_merge_queues_owner.sql and
 * the case below goes red naming it.
 */
describe('migration 0208 against a database that has never seen it', () => {
  it('adds merge_queue_owner to installation, nullable and with no default', () => {
    const s = scratch('merge-queue-owner-column')
    migrateInPlace(s.db, partialMigrations(migrationsBefore('0208_')))
    // THE FIXTURE IS BEFORE 0208, or this case would be measuring nothing.
    expect(columnNames(s.db, 'installation')).not.toContain('merge_queue_owner')
    migrateInPlace(s.db, MIGRATIONS)
    const column = columns(s.db, 'installation').find((c) => c.name === 'merge_queue_owner')
    expect(column, '0208 did not add merge_queue_owner to installation').toBeDefined()
    expect(column?.notnull, 'merge_queue_owner must be nullable').toBe(0)
    expect(column?.dflt_value, 'merge_queue_owner must have no default').toBeNull()
  })
})

/**
 * MIGRATION 0213 AGAINST A DATABASE THAT HAS NEVER SEEN IT. Part B of a decision: whether the merge tool runs an
 * entry's related tests first is one setting, a column on the installation row, off until somebody switches
 * it on.
 *
 * MUTATION PROOF (after a green control): delete the ALTER statement from
 * drizzle/0213_whether_the_related_tests_run_first.sql and the case below goes red naming it.
 */
describe('migration 0213 against a database that has never seen it', () => {
  it('adds related_tests_first to installation, nullable and with no default', () => {
    const s = scratch('related-tests-first-column')
    migrateInPlace(s.db, partialMigrations(migrationsBefore('0213_')))
    // THE FIXTURE IS BEFORE 0213, or this case would be measuring nothing.
    expect(columnNames(s.db, 'installation')).not.toContain('related_tests_first')
    migrateInPlace(s.db, MIGRATIONS)
    const column = columns(s.db, 'installation').find((c) => c.name === 'related_tests_first')
    expect(column, '0213 did not add related_tests_first to installation').toBeDefined()
    expect(column?.notnull, 'related_tests_first must be nullable').toBe(0)
    expect(column?.dflt_value, 'related_tests_first must have no default').toBeNull()
  })
})

/**
 * MIGRATION 0227 AGAINST A DATABASE THAT HAS NEVER SEEN IT. Wave 13w round 25: the callers from other machines, which
 * every machine reading counts, are found by a partial index instead of by reading the whole call log and sorting it.
 *
 * MUTATION PROOF (after a green control): delete the CREATE INDEX statement from
 * drizzle/0227_the_callers_from_other_machines_are_found_by_an_index.sql and the case below goes red naming the index.
 */
/**
 * MIGRATION 0251 AGAINST A DATABASE THAT HAS NEVER SEEN IT. Wave 13j round loop-1: whether the message worker starts
 * checks in merges-only mode, and the fork bases a seal is refused on, are two columns on the installation row, NULL
 * until somebody chooses.
 *
 * MUTATION PROOF (after a green control): delete either ALTER statement from
 * drizzle/0251_checks_in_merges_only_and_stale_fork_bases.sql and the case below goes red naming its column.
 */
describe('migration 0251 against a database that has never seen it', () => {
  it('adds checks_in_merges_only and stale_fork_bases to installation, nullable and with no default', () => {
    const s = scratch('checks-in-merges-only-columns')
    migrateInPlace(s.db, partialMigrations(migrationsBefore('0251_')))
    // THE FIXTURE IS BEFORE 0251, or this case would be measuring nothing.
    expect(columnNames(s.db, 'installation')).not.toContain('checks_in_merges_only')
    expect(columnNames(s.db, 'installation')).not.toContain('stale_fork_bases')
    migrateInPlace(s.db, MIGRATIONS)
    for (const [name, type] of [['checks_in_merges_only', 'integer'], ['stale_fork_bases', 'text']] as const) {
      const column = columns(s.db, 'installation').find((c) => c.name === name)
      expect(column, `0251 did not add ${name} to installation`).toBeDefined()
      expect(column?.type.toLowerCase(), `${name} must be ${type}`).toBe(type)
      expect(column?.notnull, `${name} must be nullable`).toBe(0)
      expect(column?.dflt_value, `${name} must have no default`).toBeNull()
    }
  })
})

describe('migration 0227 against a database that has never seen it', () => {
  it('adds api_calls_from_other_machines_idx over the remote calls, and the count by address reads it alone', () => {
    const s = scratch('from-other-machines-index')
    migrateInPlace(s.db, partialMigrations(migrationsBefore('0227_')))
    const plan = (): string =>
      (s.db.prepare('EXPLAIN QUERY PLAN SELECT client_addr, count(*), min(at_ms), max(at_ms) FROM api_calls WHERE client_origin = ? GROUP BY client_addr').all('remote') as { detail: string }[])
        .map((row) => row.detail)
        .join(' | ')
    // THE FIXTURE IS BEFORE 0227, or this case would be measuring nothing: the read sorts every remote row.
    expect(plan()).toContain('TEMP B-TREE')
    migrateInPlace(s.db, MIGRATIONS)
    const index = s.db.prepare("SELECT sql FROM sqlite_master WHERE type = 'index' AND name = 'api_calls_from_other_machines_idx'").get() as { sql: string } | undefined
    expect(index, '0227 did not add api_calls_from_other_machines_idx').toBeDefined()
    expect(index?.sql).toContain("WHERE client_origin = 'remote'")
    expect(plan()).toContain('USING COVERING INDEX api_calls_from_other_machines_idx')
    expect(plan()).not.toContain('TEMP B-TREE')
  })
})

/**
 * MIGRATION 0230 AGAINST A DATABASE THAT HAS NEVER SEEN IT. A decision of wave 13y round 21: the tops of the
 * three ranges the office's own load is read against are three settings, columns on the installation
 * row.
 *
 * MUTATION PROOF (after a green control): delete one ALTER statement from
 * drizzle/0230_the_ranges_of_the_offices_own_load.sql and the case below goes red naming its column.
 */
describe('migration 0230 against a database that has never seen it', () => {
  it('adds the three load range tops to installation, nullable and with no default', () => {
    const s = scratch('office-load-columns')
    migrateInPlace(s.db, partialMigrations(migrationsBefore('0230_')))
    for (const name of ['load_read_ms_top', 'load_cpu_percent_top', 'load_memory_mb_top']) {
      // THE FIXTURE IS BEFORE 0230, or this case would be measuring nothing.
      expect(columnNames(s.db, 'installation')).not.toContain(name)
    }
    migrateInPlace(s.db, MIGRATIONS)
    for (const name of ['load_read_ms_top', 'load_cpu_percent_top', 'load_memory_mb_top']) {
      const column = columns(s.db, 'installation').find((c) => c.name === name)
      expect(column, `0230 did not add ${name} to installation`).toBeDefined()
      expect(column?.notnull, `${name} must be nullable`).toBe(0)
      expect(column?.dflt_value, `${name} must have no default`).toBeNull()
    }
  })
})

/**
 * MIGRATION 0234 AGAINST A DATABASE THAT HAS NEVER SEEN IT. Wave 13x round 14, step 1 of the plugin pipeline
 * udGnc-Bsr15R: which plugins are switched on is one setting, a column on the installation row, and every plugin is
 * off until somebody switches it on.
 *
 * MUTATION PROOF (after a green control): delete the ALTER statement from
 * drizzle/0234_which_plugins_are_switched_on.sql and the case below goes red naming it.
 */
describe('migration 0234 against a database that has never seen it', () => {
  it('adds plugin_switches to installation, nullable and with no default', () => {
    const s = scratch('plugin-switches-column')
    migrateInPlace(s.db, partialMigrations(migrationsBefore('0234_')))
    // THE FIXTURE IS BEFORE 0234, or this case would be measuring nothing.
    expect(columnNames(s.db, 'installation')).not.toContain('plugin_switches')
    migrateInPlace(s.db, MIGRATIONS)
    const column = columns(s.db, 'installation').find((c) => c.name === 'plugin_switches')
    expect(column, '0234 did not add plugin_switches to installation').toBeDefined()
    expect(column?.notnull, 'plugin_switches must be nullable').toBe(0)
    expect(column?.dflt_value, 'plugin_switches must have no default').toBeNull()
  })
})

/**
 * MIGRATION 0211 AGAINST A DATABASE THAT HAS NEVER SEEN IT. Wave 13p round 29, decision aZGg6gerakM1: the secretary
 * reminded about a project's modules may be set on the Settings page, in two columns on the project's own row.
 *
 * MUTATION PROOF (after a green control): delete one ALTER statement from
 * drizzle/0211_a_projects_module_reminder_secretary_is_set_here.sql and the case below goes red naming its column.
 */
describe('migration 0211 against a database that has never seen it', () => {
  it('adds module_reminder_secretary and its reason to workspaces, nullable and with no default', () => {
    const s = scratch('module-reminder-secretary-columns')
    migrateInPlace(s.db, partialMigrations(migrationsBefore('0211_')))
    // THE FIXTURE IS BEFORE 0211, or this case would be measuring nothing.
    expect(columnNames(s.db, 'workspaces')).not.toContain('module_reminder_secretary')
    migrateInPlace(s.db, MIGRATIONS)
    for (const name of ['module_reminder_secretary', 'module_reminder_secretary_because']) {
      const column = columns(s.db, 'workspaces').find((c) => c.name === name)
      expect(column, `0211 did not add ${name} to workspaces`).toBeDefined()
      expect(column?.notnull, `${name} must be nullable`).toBe(0)
      expect(column?.dflt_value, `${name} must have no default`).toBeNull()
    }
  })
})

/**
 * MIGRATION 0232: A HANDOVER DOCUMENT FOR EVERY AGENT. It was added in wave 13k round 46, on two
 * decisions. One new table, append-only, and nothing else rewritten.
 *
 * MUTATION PROOF (after a green control): delete the `session_id` column from drizzle/0232_a_handover_for_every_agent.sql
 * and the case below goes red naming it.
 */
describe('migration 0232 against a database that has never seen it', () => {
  it('adds the handovers table with its eight columns and its index', () => {
    const s = scratch('handovers-table')
    migrateInPlace(s.db, partialMigrations(migrationsBefore('0232_a_handover_for_every_agent')))
    // THE FIXTURE IS BEFORE 0232, or this case would be measuring nothing.
    expect(columnNames(s.db, 'handovers')).toEqual([])
    migrateInPlace(s.db, MIGRATIONS)
    expect(columnNames(s.db, 'handovers')).toEqual(['id', 'agent_id', 'workspace_id', 'text', 'written_at', 'written_by_kind', 'written_by_id', 'session_id'])
    const nullable = columns(s.db, 'handovers').filter((c) => c.notnull === 0).map((c) => c.name)
    expect(nullable, 'only the run may be absent').toEqual(['session_id'])
  })
})

/**
 * MIGRATION 0178: HOW A WRITE WAS PROVED, ON BOTH LEDGERS AND ON A MESSAGE. Keys wave piece 6.
 *
 * MUTATION PROOF (after a green control): delete one ALTER statement from
 * drizzle/0178_how_a_write_was_proved.sql and the case below goes red naming its table.
 */
describe('migration 0178 against a database that has never seen it', () => {
  it('adds proved_by to changes, revisions and agent_messages, nullable and with no default', () => {
    const s = scratch('proved-by-column')
    migrateInPlace(s.db, partialMigrations(migrationsBefore('0178_')))
    for (const table of ['changes', 'revisions', 'agent_messages']) {
      // THE FIXTURE IS BEFORE 0178, or this case would be measuring nothing.
      expect(columnNames(s.db, table)).not.toContain('proved_by')
    }
    migrateInPlace(s.db, MIGRATIONS)
    for (const table of ['changes', 'revisions', 'agent_messages']) {
      const column = columns(s.db, table).find((c) => c.name === 'proved_by')
      expect(column, `0178 did not add proved_by to ${table}`).toBeDefined()
      expect(column?.notnull, `${table}.proved_by must be nullable`).toBe(0)
      expect(column?.dflt_value, `${table}.proved_by must have no default`).toBeNull()
    }
  })
})

describe('a database built only from migrations', () => {
  it('has every declared table, not the five schema.ts used to declare', () => {
    const s = scratch('eleven')
    migrateInPlace(s.db, MIGRATIONS)
    const names = (
      s.db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
        .all() as { name: string }[]
    ).map((r) => r.name)
    expect(names).toEqual(withTheTablesEachMigrationAdds([
      '__drizzle_migrations',
      // Talking to an agent, added by 0040 and given recipient columns by 0050.
      // src/server/lib/agents.ts writes all three.
      'agent_messages',
      // WHICH REGISTRY AGENT A PROJECT RECORD IS, added by 0114. It sorts before `agent_runs`
      // because SQLite orders these names byte by byte, and `_` comes before `u`.
      'agent_records',
      'agent_runs',
      'agent_threads',
      // The durable agents of this installation, 0114. It sorts after all four `agent_` names
      // because SQLite orders byte by byte and the underscore comes before every letter.
      'agents',
      // Planning, added by 0007. Neither carries a workspace, which is the only pair in the
      // database that does not — a plan is a person-level overlay across workspace-owned work.
      'allocations',
      // Round ten, 0111. The one-way marker for comments whose words went out before Mole Office stored
      // a word for it, and what Mole Office measured of itself while it answered requests.
      'annotation_words_fixed',
      'api_calls',
      // The pictures, 0114. One row per picture, and the file of an uploaded one is under `data/`
      // and in no repository.
      'assets',
      // THE CASTING TABLE AND ITS HISTORY, added by 0189. They sort after
      // `assets` and before `changes` because `ca` comes before `ch` byte by byte.
      'casting',
      'casting_changes',
      // SEVERAL CASTINGS FOR EACH ROLE, added by 0190: one row per casting and its
      // history. `casting_row_changes` sorts before `casting_rows` because `_` comes before `s` byte by byte.
      'casting_row_changes',
      'casting_rows',
      'changes',
      // WHETHER ONE PERSON HAS FOLDED A CONTACT GROUP AWAY, added by 0161. It sorts before
      // `contact_groups` because `c` comes before `s` byte by byte.
      'contact_group_collapses',
      // HOW ONE PERSON HAS ARRANGED THEIR CONTACTS LIST, added by 0127 and given a side by 0161.
      // `contact_groups` sorts before `contact_placements` byte by byte, and both sort after
      // `changes` and before `conversation_reads` for the same reason.
      'contact_groups',
      'contact_placements',
      // WHO READ A CONVERSATION THEY WERE NOT PART OF, added by 0119.
      // src/server/lib/messages.ts writes it, and the route for M12 is what calls that.
      'conversation_reads',
      // EVERY ADDITION, FIRING AND HELD-BACK FIRING OF A COUNTER, added by 0172. Criteria CT2 and
      // CT5 to CT7. It sorts here because SQLite orders these names byte by byte.
      'counter_rows',
      // WHICH ADDRESSEE A DEAD LETTER HAS BEEN TAKEN ON BY, added by 0160.
      // src/server/lib/deadletters.ts writes it. It sorts after `conversation_reads` and before
      // `file_observations` because SQLite orders these names byte by byte.
      'dead_letter_claims',
      // What one scan saw about one file at one moment. Authored: nothing can rebuild a dated
      // observation, which is what separates it from the file index it is compared against.
      'file_observations',
      // WHAT AN AGENT READ IN A FOLDER, added by 0134. It sorts after `file_observations` and before
      // `group_members` because SQLite orders these names byte by byte.
      'folder_readings',
      // A GROUP AND WHO IS IN IT, added by 0120. `group_members` sorts before `groups` because
      // SQLite orders these names byte by byte and the underscore comes before every letter.
      'group_members',
      'groups',
      // WHICH LIVE SESSION IS ANSWERING AS A DURABLE AGENT, added by 0131. It sorts after `groups`
      // and before `implementation_findings` because SQLite orders these names byte by byte.
      'handle_holds',
      // A HANDOVER DOCUMENT FOR AN AGENT, added by 0232. After
      // `handle_holds` and before `held_keys` byte by byte.
      'handovers',
      // ONE ROW PER CALLER PER DAY THAT SENT A CLAIM AND NO KEY, added by 0165. Criterion P83.
      'header_only_calls',
      // THE KEYS THE OFFICE HAS ISSUED, kept as their SHA-256, added by 0165. Both sort after
      // `handle_holds` and before `implementation_findings` byte by byte.
      'held_keys',
      // ONE ROW PER HOUR PER LISTENER PER OPERATION OF THE FOLDED LONG POLLS, added by 0167.
      // Criterion U6 follows an owner's decision. It sorts after `held_keys` and before
      // `implementation_findings` because SQLite orders these names byte by byte.
      'hourly_calls',
      // The code this project's work is implemented in, all from 0111.
      'implementation_findings',
      'implementation_map',
      'implementation_revisions',
      // WHICH INSTALLATION THIS DATABASE BELONGS TO, added by 0122. One row, written once from the
      // declaration by `migrateCitizenship` and never rewritten.
      'installation',
      'legacy_unsealed_runs',
      'links',
      // WHETHER THE STORED READING-MEASURE WORDS CARRY THEIR NEW NAMES, added by 0173. One row, written
      // once by the measure-word data step. It sorts before `message_delivery` because `a` comes
      // before `s` byte by byte.
      'measure_words_renamed',
      // HOW FAR EACH MESSAGE GOT WITH EACH RECIPIENT, added by 0115. One row per recipient of one
      // message, because a delivery mark changes and a record field cannot change without a revision.
      'message_delivery',
      // Saved office map regions and seats, added by 0151.
      'office_map_layouts',
      'office_scene_settings',
      'outside_reads',
      'panel_layouts',
      // The people of this installation, 0114. One row today: the owner.
      'people',
      // In the order SQLite sorts the names, which puts the underscore before a letter.
      // A REASON FOR EVERY ADD, REORDER AND DROP OF A LINE, added by 0170. Criterion P3. It sorts
      // before `plan_lines` because `_` comes before `s` byte by byte.
      'plan_line_revisions',
      'plan_lines',
      'planning_capacity',
      // `planning_drafts` WAS HERE. Migration 0196 moves every draft into a plan, and its data step drops
      // the table once it is empty, which on a fresh database is at once.
      // What somebody wrote about time, added by 0020. It sorts here because SQLite orders these
      // names byte by byte, and `i` comes before `r`.
      'planning_intents',
      'planning_recurrences',
      'plans',
      'presentation_intent',
      // THE DIRECTORIES SOMEBODY ADDED BY HAND AS PREVIEW ROOTS, added by 0165. Criterion U4. It
      // sorts after `presentation_intent` and before `reader_anchors` because SQLite orders these
      // names byte by byte, and `pres` comes before `prev`, which comes before `r`.
      'preview_root_additions',
      // THE PRICE TABLE THE PERSON SETS IN SETTINGS, added by 0177. Criterion U3. It sorts after
      // `preview_root_additions` because `pri` comes after `pre`, and before `reader_anchors`.
      'price_table',
      'reader_anchors',
      // A READINESS CHECKLIST AND ITS SIGNATURES, added by 0252. They sort
      // after `reader_anchors` and before `records` because `reade` comes before `readi`, which comes before `rec`.
      'readiness_checklists',
      'readiness_signatures',
      'records',
      // A checkout this project's work is implemented in, 0111.
      'repositories',
      // A PERMANENT RESIDENT'S LEAVE TO READ, ITS SLEEPS, ITS WRITES AND ITS VOID MARKS, added by the residents' migration and 0233.
      // They sort after `repositories` and before `revalidations` because `res` sorts between `rep` and `rev`.
      'resident_read_grants',
      // A PERMANENT RESIDENT'S SLEEPS, added by 0233.
      'resident_sleeps',
      'resident_space_writes',
      'resident_void_marks',
      // Which work a restriction reached, and whether anybody re-checked it, 0111.
      'revalidations',
      // The revision ledger, added by 0060. It holds what each record HELD, once per write, which
      // `changes` never stored: a create row keeps the title and nothing else.
      // A review, added by 0070: who started collecting remarks, from where, and what was in it
      // when they finished. It sorts before `revisions` because SQLite orders these names byte by
      // byte, and `e` comes before `i`.
      'reviews',
      'revisions',
      // THE MODEL EACH RUN USES, added by 0176. Criterion U2. It sorts after `revisions` and before
      // `session_resources` because SQLite orders these names byte by byte, and `rev` < `run` < `s`.
      'run_models',
      'session_resources',
      'source_file_hashes',
      'source_files',
      'source_index',
      'submission_baselines',
      // ONE USE OF A TOOL IS ONE ROW, added by 0231 (wave 13s round 33). `o` sorts before `r`.
      'test_file_runs',
      'tool_uses',
      // THE MACHINES THIS OFFICE TRUSTS, added by 0144. Criterion P73. It sorts here because SQLite
      // orders these names byte by byte and `t` comes after `s` and before `u`.
      'trusted_machines',
      // What one stretch of work cost, and what a contradiction check said at the time. Both 0111,
      // both measured rather than authored or derived.
      'usage_checks',
      'usage_stretches',
      // When somebody means to work on something, added by 0040. It carries no hours and no
      // workspace, and sorts last because SQLite orders these names byte by byte.
      // WHAT AN AGENT IS WORKING ON, added by 0121. It sorts before `work_windows` because SQLite
      // orders these names byte by byte and `c` comes before `w`.
      // A CITIZEN OF ONE WORLD WORKING IN ANOTHER, added by 0124.
      // A VISITING AGENT'S OWN CREDENTIAL AND EVERY REQUEST MADE UNDER IT, added by 0140. Criteria
      // P24 to P30. They sort BEFORE `visits` because SQLite orders byte by byte and the sixth
      // character decides it: `o` comes before `s`.
      'visitor_credentials',
      'visitor_requests',
      'visits',
      'work_claims',
      'work_windows',
      'workspaces',
      // EVERY WORLD THIS INSTALLATION HAS EVER HAD, added by 0123. It sorts after `workspaces`
      // because SQLite orders these names byte by byte and `k` comes before `l`.
      'worlds',
    ]))
  })

  it('and eleven of them arrived in one file, because applying it is one window with the server down', () => {
    // ROUND TEN'S TABLES, LISTED WHERE THE NAMES ARE ALREADY LISTED. They are checked apart from the
    // sorted list above only so that the reason they are one file is written beside them: a server
    // refuses to serve a corpus that holds work while a migration is pending, so two files would
    // take the owner's server down twice for one round.
    const s = scratch('round-ten')
    migrateInPlace(s.db, MIGRATIONS)
    for (const table of [
      // The code this project's work is implemented in.
      'repositories',
      'implementation_revisions',
      'implementation_map',
      'implementation_findings',
      // What one scan saw about one file at one moment.
      'file_observations',
      // WHAT AN AGENT READ IN A FOLDER, added by 0134. It sorts after `file_observations` and before
      // `group_members` because SQLite orders these names byte by byte.
      'folder_readings',
      // Which work a restriction reached, and the marker for comments whose words went out.
      'revalidations',
      'annotation_words_fixed',
      // What Mole Office measured of itself.
      'api_calls',
      'outside_reads',
      'usage_stretches',
      'usage_checks',
    ]) {
      expect(countRows(s.db, table), `${table} was not created, or a migration put a row in it`).toBe(0)
    }
  })

  it('gets exactly the same five tables a database built the old way has', () => {
    // ONE TABLE, ONE SHAPE, ON EVERY MACHINE. The migration cannot change the five tables that
    // already exist on the owner's laptop — `IF NOT EXISTS` does nothing to a table that is there, and
    // rebuilding one would rewrite rows, which migrations here never do. So the only way the two
    // can agree is for the generated SQL to describe the same table the `ensure*` functions made.
    // It does, and this is what checks it: a difference here means new machines and old machines
    // have been running on different databases, which is the defect this change removed, arriving
    // again by a different route.
    const fresh = scratch('fresh-five')
    migrateInPlace(fresh.db, MIGRATIONS)
    const old = theOldWay('old-five')
    migrateInPlace(old.db, MIGRATIONS)
    expect(foldedStructure(fresh.db)).toEqual(foldedStructure(old.db))
  })

  it('accepts the rows the files that own those tables write', () => {
    // The failure this change is about happens at runtime, on INSERT, when a table's declaration
    // and its writer disagree about a column. Writing one row of each shape is how that is caught
    // here rather than in production.
    const s = scratch('inserts')
    migrateInPlace(s.db, MIGRATIONS)
    expect(() => seedFolded(s.db)).not.toThrow()
    for (const table of FOLDED_IN) expect(countRows(s.db, table)).toBe(1)
    // AND THE COLUMN 0111 ADDED READS "NOBODY HAS SAID" on all three, because the writer that would
    // name a repository is not built yet and this one does not guess.
    for (const table of FOLDED_IN_REKEYED) {
      const rows = s.db.prepare(`SELECT repository_id FROM "${table}"`).all() as { repository_id: unknown }[]
      for (const row of rows) expect(row.repository_id, `${table} invented a repository id`).toBeNull()
    }
  })

  it('keeps one LIVE session resource per key, and lets a released one be taken again', () => {
    // The partial unique index, which is the one piece of the five that a hand-added
    // `IF NOT EXISTS` could have quietly dropped: it is a separate statement from the CREATE
    // TABLE, so a migration that created the table and skipped the index would look fine.
    const s = scratch('partial-index')
    migrateInPlace(s.db, MIGRATIONS)
    seedFolded(s.db)
    const insert = (id: string): void => {
      s.db
        .prepare(
          'INSERT INTO session_resources (id, workspace_id, session_record_id, type, key, detail, registered_at, ' +
            'registered_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        )
        .run(id, 'default', 'rec-twin', 'process', '31337', 'the same server again', '2026-08-09 16:00:00', `human:${THE_TEST_OFFICES_OWNER.id}`)
    }
    expect(() => insert('res-2')).toThrow(/UNIQUE/i)
    // Released, the row stops being live, and the same port or pid may honestly be taken again.
    s.db.prepare('UPDATE session_resources SET released_at = ?, released_by = ? WHERE id = ?').run(
      '2026-08-09 15:59:00',
      `human:${THE_TEST_OFFICES_OWNER.id}`,
      'res-1',
    )
    expect(() => insert('res-2')).not.toThrow()
    expect(countRows(s.db, 'session_resources')).toBe(2)
  })
})

// ============================================================================ decision 13

/**
 * The migration where the data migrations arrive, with rows in it that each of them has something
 * to do.
 *
 * Built at the migration BEFORE the origin column, so `records` already holds rows when 0005 adds
 * the column to it — which is the only state where "did a migration write into every existing row"
 * is a question with an answer.
 *
 * NO ROW HERE IS STAMPED WITH AN ORIGIN OR MOVED INTO A PROJECT, and that changed on 5 September
 * 2026. One record used to carry an id, kind and title out of `MEASURED_ORIGINS`, the 385-row
 * measurement of the owner's own corpus that the origin migration read out of the source tree, so
 * that the stamp had something to match. That measurement left this repository with the rest of the owner's
 * project's data; `migrateInPlace` hands the two measurement-driven migrations nothing, so on this
 * fixture they now correctly write nothing. What they do when a measurement IS handed in is
 * tests/migration-origin.test.ts, against a made-up measurement written there.
 */
const ORIGIN_TAG = '0005_'

function withRowsBeforeTheOriginColumn(name: string): { s: Scratch } {
  const s = atMigrationZero(name)
  migrateInPlace(s.db, partialMigrations(migrationsBefore(ORIGIN_TAG)))
  const record = s.db.prepare(
    'INSERT INTO records (id, workspace_id, owner_id, created_at, updated_at, kind, title, summary, data) ' +
      `VALUES (?, 'default', '${THE_TEST_OFFICES_OWNER.id}', '2026-07-01 09:00:00', '2026-07-01 09:00:00', ?, ?, NULL, ?)`,
  )
  record.run(
    'rec-blocked-task',
    'task',
    'a task that says what is blocking it in prose',
    JSON.stringify({ state: 'blocked', blocked_by: 'the printer queue', also_waiting_on: 'PETG to arrive' }),
  )
  record.run(
    'rec-blocked-obligation',
    'obligation',
    'an obligation that says what is blocking it in prose',
    JSON.stringify({ state: 'open', blocked_by: 'the force table is not finished' }),
  )
  return { s }
}

describe('there is no hidden migration rewrite', () => {
  it('lists every data migration with a reason, and says which of them rewrite stored values', () => {
    // Without this the declarations below could be granted to a file that does not exist, or the
    // list could quietly grow to cover a migration nobody meant to allow.
    for (const dm of DATA_MIGRATIONS) {
      expect(
        readFileSync(join(REPO, dm.file), 'utf8').length,
        `DATA_MIGRATIONS names ${dm.file}, which is not in the repository`,
      ).toBeGreaterThan(0)
      expect(dm.why.length, `${dm.file} is declared with no reason given`).toBeGreaterThan(80)
      expect(dm.writes.length, `${dm.file} is declared as writing nothing`).toBeGreaterThan(0)
      // A migration that rewrites what somebody wrote must SAY SO in its own header, where the next
      // person to read it will find it — decision 13 says the exception is named where the migration
      // lives, not only in a list a test reads.
      const source = readFileSync(join(REPO, dm.file), 'utf8')
      if (dm.rewritesStoredValues) {
        expect(source, `${dm.file} rewrites stored values and its header does not name decision 13`).toMatch(
          /DECISION 13/i,
        )
      }
    }
    // Stated as a number so a seventh data migration is a deliberate edit to this line rather than a
    // file quietly joining a list. The seventh is src/server/db/seal-copies-to-pointers.ts, the data
    // half of migration 0154 (criterion C34), added 11 September 2026. The eighth is
    // src/server/db/append-order-migration.ts, the data half of migration 0194 (problem BhszTJsVC8rF),
    // added 30 September 2026; it only fills a column that was empty. The ninth is
    // src/server/db/drafts-into-plans-migration.ts, the data half of migration 0196 (problem k5FNfdgfxbt2),
    // added 1 October 2026; it moves each rough draft into a plan and changes no cell that was there. The tenth is
    // src/server/db/withdraw-review-runs-migration.ts, the data half of migration 0253 (wave 13u round 19), added
    // 13 October 2026; it withdraws the runs a sent review left waiting and revokes their keys. The eleventh is
    // src/server/db/kinds-beside-ids-migration.ts, the data half of migration 0311 (wave 13s round 155), added
    // 30 October 2026; it only fills a kind column that was empty. The twelfth is src/server/db/remint-migration.ts, the
    // re-mint (wave 13s round 158), added 30 October 2026; it runs only when the command is given a staged map. The
    // thirteenth is src/server/db/casting-work-groups-migration.ts, the data half of migration 0318 (wave 13n round CB),
    // added 1 November 2026; it only fills a work group cell that was empty, stamps that row's last change, and writes
    // one history row for each. The fourteenth is src/server/db/casting-labels-migration.ts, the data half of migration
    // 0349; it makes the labels hard and simple, only fills a labels cell
    // that was empty, stamps that row's last change, and writes one history row for each.
    // The fifteenth fills the empty ownership column from the recorded agent starter.
    expect(DATA_MIGRATIONS.length, 'a data migration was added; read the note on DATA_MIGRATIONS first').toBe(15)
  })

  it('changes no cell of any column that no data migration declares', () => {
    const { s } = withRowsBeforeTheOriginColumn('nohidden')
    const before = everyCell(s.db)
    migrateInPlace(s.db, MIGRATIONS)
    const { changed, vanished } = cellChanges(before, everyCell(s.db))

    const declared = new Set(DATA_MIGRATIONS.flatMap((m) => m.writes.flatMap((w) => w.columns.map((c) => `${w.table}.${c}`))))
    for (const change of changed) {
      expect(
        declared,
        `${change.table}.${change.column} changed on ${change.rowKey} (${JSON.stringify(change.from)} -> ` +
          `${JSON.stringify(change.to)}) and no entry in DATA_MIGRATIONS says any migration writes it. ` +
          `Either the migration should not be doing that, or the list should say it does.`,
      ).toContain(`${change.table}.${change.column}`)
    }
    expect(vanished, 'a migration lost a row').toEqual([])
    // And it really did change something, or the loop above passed by looking at nothing.
    expect(changed.length, 'nothing changed at all, so this test proved nothing').toBeGreaterThan(0)
  })

  it('changes exactly the cells this corpus should make it change, and no others', () => {
    // The general rule above allows any declared column to change. This says what actually happened,
    // so a migration that started writing a DIFFERENT declared column is still a failure.
    const { s } = withRowsBeforeTheOriginColumn('exactly')
    const before = everyCell(s.db)
    migrateInPlace(s.db, MIGRATIONS)
    const { changed } = cellChanges(before, everyCell(s.db))
    const seen = changed.map((c) => `${c.table}.${c.column} on ${c.rowKey}`).sort()
    expect(seen).toEqual(
      [
        'records.data on records rec-blocked-task',
        // NO `records.origin` AND NO `records.workspace_id` LINE HERE, AND THAT IS THE POINT SINCE
        // 5 SEPTEMBER 2026. Both migrations take their measurement from the caller, `migrateInPlace`
        // hands them none, and a migration with no measurement writes nothing and says so in its
        // report. The two used to appear here on one row, because the fixture carried a real id out
        // of the owner's corpus for them to match on.
        //
        // The two change rows this fixture starts with, stamped from the records they are about.
        // Both go from NULL to 'default': the value is a COPY off another row and never a default
        // written here, which is what makes it not a judgement. The join in
        // COLUMNS_COPIED_FROM_ANOTHER_ROW is what proves that rather than this line.
        'changes.workspace_id on changes chg-1',
        'changes.workspace_id on changes chg-2',
        // Each change row's own rowid, copied into the column migration 0194 added, so the order the
        // log was appended in is a value an archive can carry (problem BhszTJsVC8rF).
        'changes.append_order on changes chg-1',
        'changes.append_order on changes chg-2',
      ].sort(),
    )
  })

  it('preserves every index and every constraint across the whole folder', () => {
    const { s } = withRowsBeforeTheOriginColumn('constraints')
    const indexesBefore = Object.fromEntries(
      ['records', 'links', 'changes'].map((t) => [t, structureExceptDroppedDefaults(s.db, t)]),
    )
    migrateInPlace(s.db, MIGRATIONS)
    for (const table of ['records', 'links', 'changes']) {
      expect(
        structureExceptDroppedDefaults(s.db, table),
        `${table} lost or gained an index or a column across the migration`,
      ).toEqual(indexesBefore[table])
    }
    expect(s.db.pragma('foreign_key_check')).toEqual([])
    expect(s.db.pragma('integrity_check')).toEqual([{ integrity_check: 'ok' }])
    // THIS ASSERTION WAS THE OPPOSITE UNTIL 17 AUGUST 2026, and the owner is who changed it. It read
    // "the unique index on titles is a CONSTRAINT and not just a shape, so it is checked by trying
    // to break it", and it expected the insert below to throw `UNIQUE constraint failed`. The rule
    // behind it is gone — ID is identity, title is presentation, titles may repeat — and
    // `0030_titles_may_repeat` is the migration that drops the uniqueness. So the same insert is now
    // the proof that it was dropped, and it is written the same way: by trying it, rather than by
    // reading a pragma that says what the shape is supposed to be.
    const second = s.db
      .prepare(
        'INSERT INTO records (id, workspace_id, owner_id, created_at, updated_at, kind, title, data) ' +
          `VALUES ('dupe', 'default', '${THE_TEST_OFFICES_OWNER.id}', '2026-07-01 09:00:00', '2026-07-01 09:00:00', 'note', ?, '{}')`,
      )
      .run('a task that says what is blocking it in prose')
    expect(second.changes).toBe(1)
    // THE INDEX IS STILL THERE. Dropping the constraint is not dropping the lookup: linking by name
    // is on the write path and would otherwise scan the table.
    const idx = s.db
      .prepare("SELECT sql FROM sqlite_master WHERE type = 'index' AND name = 'records_title_idx'")
      .get() as { sql: string } | undefined
    expect(idx?.sql).toContain('records_title_idx')
    expect(idx?.sql).not.toMatch(/UNIQUE/i)
  })

  it('is idempotent: the second run changes not one cell', () => {
    const { s } = withRowsBeforeTheOriginColumn('idempotent')
    migrateInPlace(s.db, MIGRATIONS)
    const afterFirst = everyCell(s.db)
    const second = migrateInPlace(s.db, MIGRATIONS)
    const { changed, vanished } = cellChanges(afterFirst, everyCell(s.db))
    expect(changed, 'the second run rewrote something').toEqual([])
    expect(vanished, 'the second run lost a row').toEqual([])
    expect(afterFirst.size, 'the second run added a row').toBe(everyCell(s.db).size)
    expect(second.newlyApplied).toBe(0)
    expect(second.origin.alreadyDone).toBe(true)
    expect(second.blockedBy.alreadyDone).toBe(true)
  })
})

// ============================================================================ running it twice

describe('running the migrations twice', () => {
  it('changes nothing the second time, and nothing the third', () => {
    const s = atMigrationZero('twice')
    const first = migrateInPlace(s.db, MIGRATIONS)
    const shapeAfterFirst = shapeOf(s.db)
    const countsAfterFirst = counts(s.db)

    const second = migrateInPlace(s.db, MIGRATIONS)
    const third = migrateInPlace(s.db, MIGRATIONS)

    expect(first.newlyApplied).toBe(journal(MIGRATIONS).length - 1)
    expect(second.newlyApplied).toBe(0)
    expect(third.newlyApplied).toBe(0)
    expect(shapeOf(s.db)).toEqual(shapeAfterFirst)
    expect(counts(s.db)).toEqual(countsAfterFirst)
  })

  it('is safe on a database that has never been migrated, run twice from nothing', () => {
    const s = scratch('fresh')
    const first = migrateInPlace(s.db, MIGRATIONS)
    const second = migrateInPlace(s.db, MIGRATIONS)

    expect(first.newlyApplied).toBe(journal(MIGRATIONS).length)
    expect(second.newlyApplied).toBe(0)
    // Before the first run there was no table at all, which is not the same as an empty one. Built
    // from COUNTED_TABLES rather than written out, so a table added to the schema is covered here
    // the day it arrives instead of the day somebody remembers this test.
    expect(first.before).toEqual(Object.fromEntries(COUNTED_TABLES.map((table) => [table, null])))
    // AFTER covers every table the file now holds, not just the counted ones — read from the
    // database rather than from a list, which is the fault of 25 August 2026 stated as a rule. The
    // counted ones are empty; `workspaces` holds the row a migration writes itself; the rest of the
    // file is whatever the migrations created.
    expect(Object.keys(first.after).sort()).toEqual(tablesInFile(s.db))
    for (const table of COUNTED_TABLES) expect(first.after[table], `${table} is not empty`).toBe(0)
  })

  /**
   * THE ONE LIST IN db/migration-declared-tables.ts THAT CANNOT BE DERIVED, PROVED INSTEAD.
   *
   * `IRREPLACEABLE_TABLES` is every authored table except those in `MIGRATION_DECLARED_TABLES`, and
   * that exception exists because `migrateWorkspaces` writes the `default` workspace row itself — so
   * a row there is not evidence anybody wrote anything, and counting it would make every fresh
   * clone, every test database and every `tools/review.mjs` run look like a corpus to the reset
   * guard and the boot guard alike.
   *
   * Nothing can compute that list without running the migrations. THIS RUNS THEM. A data migration
   * that starts seeding another table, or one that stops seeding this one, turns this red rather
   * than quietly changing what "this database holds work" means in three places at once.
   */
  it('leaves rows in exactly the tables a migration declares, and none of the others', () => {
    const s = scratch('what-a-migration-fills')
    migrateInPlace(s.db, MIGRATIONS)

    const filled = AUTHORED_TABLES.filter((table) => (countRows(s.db, table) ?? 0) > 0)
    expect(filled).toEqual([...MIGRATION_DECLARED_TABLES])
    for (const table of IRREPLACEABLE_TABLES) {
      expect(countRows(s.db, table), `${table} is not empty on a freshly migrated database`).toBe(0)
    }
    for (const part of everyPartTable().filter(part=>part.says.exported)) {
      expect(COUNTED_TABLES, `${part.name} carries authored rows and must be protected from migration loss`).toContain(part.name)
      expect(countRows(s.db,part.name)).toBe(0)
    }
    // Which is what makes the arithmetic in `irreplaceableRows` mean anything.
    expect(irreplaceableRows(s.db)).toBe(0)
  })

  it("reports 'no new migrations' rather than pretending it did work", () => {
    const s = scratch('wording')
    migrateInPlace(s.db, MIGRATIONS)
    const line = describeOutcome(migrateInPlace(s.db, MIGRATIONS))
    expect(line).toContain('no new migrations')
    expect(line).toContain('records 0 -> 0')
  })
})

// ============================================================================ the SQL itself

describe('what the migration files are allowed to contain', () => {
  const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()

  it('has a .sql file for every journal entry and no orphans', () => {
    expect(files).toEqual(journal(MIGRATIONS).map((e) => `${e.tag}.sql`).sort())
  })

  /** One migration file with its comments stripped, which is what every rule below reads. */
  const statementsOf = (file: string): string =>
    // Comments are stripped, or a file's own explanation of what it does not do would report
    // itself. Same reason tests/changes.test.ts strips them before looking for a second renderer.
    readFileSync(join(MIGRATIONS, file), 'utf8').replace(/^\s*--[^\n]*$/gm, '')

  const rebuildFiles = new Set(REBUILDS.map((r) => r.file))
  /** The start of a delete from this one table, at the start of a line as the rule below reads one. */
  const deletesFrom = (table: string): RegExp => new RegExp('^\\s*DELETE\\s+FROM\\s+`?' + table + '`?(?=\\s)', 'gim')

  it('lists every rebuild migration, and every listed file is really in the folder', () => {
    // Without this the exemptions below could be granted to a file that no longer exists, or the
    // list could quietly grow to cover a file nobody meant to exempt.
    for (const rebuild of REBUILDS) {
      expect(files, `REBUILDS names ${rebuild.file}, which is not in drizzle/`).toContain(rebuild.file)
      expect(rebuild.why.length, `${rebuild.file} is exempted with no reason given`).toBeGreaterThan(80)
      expect(rebuild.tables.length, `${rebuild.file} is listed as a rebuild of no tables`).toBeGreaterThan(0)
    }
    // Stated as a number so that another rebuild is a deliberate edit to this line rather than a
    // file quietly joining a list. A rebuild is the class of migration that loses somebody's work.
    expect(REBUILDS.length, 'a sixth rebuild migration was added; read the note on REBUILDS first').toBe(5)
  })

  it('never drops, renames, retypes or rewrites anything, except in a file on the REBUILDS list or a fold deleting from its own table', () => {
    // Migrations here are additive. This is the rule that makes it safe to run one against the
    // only copy of the data, and it is checked over every file rather than only the new one,
    // because the next person to add a migration will read the newest file and copy its habits.
    // UPDATE and DELETE are anchored to the start of a line, because a foreign key clause reads
    // `ON UPDATE no action` and an unanchored pattern would call every table in 0000 a rewrite.
    const forbidden = [
      /\bDROP\s+TABLE\b/i,
      /\bDROP\s+COLUMN\b/i,
      /\bRENAME\s+(TO|COLUMN)\b/i,
      /^\s*DELETE\s+FROM\b/im,
      /^\s*UPDATE\s+\S/im,
      /\bALTER\s+COLUMN\b/i,
    ]
    for (const file of files.filter((f) => !rebuildFiles.has(f))) {
      // A FILE ON FOLDS MAY DELETE FROM THE ONE TABLE ITS ENTRY NAMES, and the rest of each such statement is still
      // read. A delete from any other table, and every other statement, is held to the rule as in any file.
      const fold = FOLDS.find((one) => one.file === file)
      const sql = fold === undefined ? statementsOf(file) : statementsOf(file).replace(deletesFrom(fold.table), '')
      for (const pattern of forbidden) {
        expect(sql, `${file} contains ${pattern}`).not.toMatch(pattern)
      }
    }
  })

  it('lists every fold migration, and every listed file is in the folder and deletes from its table', () => {
    for (const fold of FOLDS) {
      expect(files, `FOLDS names ${fold.file}, which is not in drizzle/`).toContain(fold.file)
      expect(fold.why.length, `${fold.file} is exempted with no reason given`).toBeGreaterThan(80)
      expect(rebuildFiles.has(fold.file), `${fold.file} is on REBUILDS and FOLDS both`).toBe(false)
      // A FOLD THAT DELETES NOTHING IS A LIST THAT HAS DRIFTED, the same rule REBUILDS follows.
      expect(statementsOf(fold.file), `FOLDS says ${fold.file} folds ${fold.table} and it never deletes from it`).toMatch(
        deletesFrom(fold.table),
      )
    }
    // Stated as a number, as REBUILDS is, so a second fold is a deliberate edit to this line rather than a file
    // quietly joining a list. A fold is a migration that deletes somebody's rows.
    expect(FOLDS.length, 'a second fold migration was added; read the note on FOLDS first').toBe(1)
  })

  it('lets a rebuild drop a table only if the same file creates it again', () => {
    // The exemption above is not a blank cheque. `DROP COLUMN`, `ALTER COLUMN` and `RENAME` stay
    // forbidden everywhere — none of them is needed to remove a default, and each of them loses
    // something a rebuild does not. And a DROP is only a rebuild if the table comes back: a file
    // that drops `records` and does not recreate it has deleted the product's data and would still
    // read like a rebuild to a rule that only looked for the word.
    for (const rebuild of REBUILDS) {
      const sql = statementsOf(rebuild.file)
      for (const pattern of [/\bDROP\s+COLUMN\b/i, /\bALTER\s+COLUMN\b/i, /\bRENAME\s+(TO|COLUMN)\b/i]) {
        expect(sql, `${rebuild.file} contains ${pattern}, which no migration may do`).not.toMatch(pattern)
      }
      const dropped = [...sql.matchAll(/DROP\s+TABLE\s+`?(\w+)`?/gi)].map((m) => m[1] ?? '')
      const created = new Set([...sql.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?`?(\w+)`?/gi)].map((m) => m[1] ?? ''))
      const removed = new Set(rebuild.removes ?? [])
      for (const table of dropped) {
        // A TABLE ON `removes` IS GONE ON PURPOSE and does not come back. Everything else must.
        if (removed.has(table)) continue
        expect(created.has(table), `${rebuild.file} drops ${table} and never creates it again`).toBe(true)
      }
      // AND A REMOVAL THAT NEVER HAPPENED IS A LIST THAT HAS DRIFTED, the same rule `tables` follows.
      for (const table of removed) {
        expect(dropped, `REBUILDS says ${rebuild.file} removes ${table} and it never drops it`).toContain(table)
        expect(created.has(table), `REBUILDS says ${rebuild.file} removes ${table} and it creates it again`).toBe(false)
      }
      // Every table the list SAYS it rebuilds must actually be dropped and remade in the file, so
      // the list cannot drift away from what the SQL does.
      for (const table of rebuild.tables) {
        expect(dropped, `REBUILDS says ${rebuild.file} rebuilds ${table} and it never drops it`).toContain(table)
      }
    }
  })

  it('creates every table with IF NOT EXISTS, except the first migration which cannot be changed', () => {
    // WHY 0000 IS EXEMPT, and why that is not a loophole. Its `when` value is recorded in every
    // Mole Office database that exists, so drizzle will never run it again there — the guard is
    // pointless for it. Editing it would change nothing about safety and would be a change to a
    // file whose content every existing journal row is a claim about.
    //
    // Every LATER file needs the guard. Until migration 0003 the reason was that five tables were
    // created outside the migration system, at import, by `ensure*` functions in api/layout.ts,
    // lib/resources.ts and lib/sourceindex.ts. Those functions are gone and 0003 is the migration
    // that creates their tables — which means it runs against databases that already have all
    // five, so the guard is not a precaution there, it is what makes the file work at all. It
    // stays the rule afterwards because a database restored from a backup, or built by a tool
    // nobody has written yet, can arrive with a table already in it.
    //
    // THE SECOND EXEMPTION IS NARROW AND IT IS NOT "REBUILDS ARE EXEMPT". A bare CREATE TABLE is
    // allowed only for a table the SAME FILE has already dropped, which makes the guard pointless
    // there — the table is gone by construction. It is worse than pointless: if such a table somehow
    // survived, `IF NOT EXISTS` would silently skip creating it and the INSERT after would refill
    // the OLD shape while the migration reported success. Bare is the loud version. Any other bare
    // CREATE TABLE, in a rebuild file or not, is still reported.
    const first = `${journal(MIGRATIONS)[0]?.tag ?? ''}.sql`
    for (const file of files.filter((f) => f !== first)) {
      const sql = statementsOf(file)
      const droppedFirst = new Set([...sql.matchAll(/DROP\s+TABLE\s+`?(\w+)`?/gi)].map((m) => m[1] ?? ''))
      const creates = [...sql.matchAll(/CREATE\s+TABLE\s+(IF\s+NOT\s+EXISTS\s+)?`?(\w+)`?/gi)]
      for (const match of creates) {
        if (rebuildFiles.has(file) && droppedFirst.has(match[2] ?? '')) continue
        expect(
          match[1],
          `${file}: a bare CREATE TABLE for ${match[2]}, which fails on a database that already has the table`,
        ).toBeDefined()
      }
    }
  })

  it('creates every index with IF NOT EXISTS too, for the same reason and with the same exception', () => {
    // An index is a separate statement from the table it is on, and it fails separately. Both of
    // `session_resources`' indexes were created by `ensureResourceTable()` alongside the table, so
    // migration 0003 meets them on every database that exists; drizzle-kit emits a bare
    // `CREATE INDEX` and it has to be edited by hand exactly as the CREATE TABLE is. This is a
    // rule of its own rather than part of the one above, because a migration can easily add an
    // index to an existing table without creating any table at all, and that is the case where
    // the rule above would not be looking.
    //
    // The same narrow second exemption: an index ON a table this file has already dropped went with
    // that table, so the guard has nothing to guard and would hide a table that survived.
    const first = `${journal(MIGRATIONS)[0]?.tag ?? ''}.sql`
    for (const file of files.filter((f) => f !== first)) {
      const sql = statementsOf(file)
      const droppedFirst = new Set([...sql.matchAll(/DROP\s+TABLE\s+`?(\w+)`?/gi)].map((m) => m[1] ?? ''))
      const creates = [...sql.matchAll(/CREATE\s+(?:UNIQUE\s+)?INDEX\s+(IF\s+NOT\s+EXISTS\s+)?`?\w+`?\s+ON\s+`?(\w+)`?/gi)]
      for (const match of creates) {
        if (rebuildFiles.has(file) && droppedFirst.has(match[2] ?? '')) continue
        expect(
          match[1],
          `${file}: a bare CREATE INDEX on ${match[2]}, which fails on a database that already has the index`,
        ).toBeDefined()
      }
    }
  })
})

// ============================================================================ the journal guard

describe('a database whose tables were made outside the migration system', () => {
  it('is refused with a sentence, not with "table records already exists"', () => {
    const s = scratch('nojournal')
    // Built the way api/layout.ts and lib/sourceindex.ts build theirs: the statements run straight
    // at the database, with nothing recording that they did.
    const first = journal(MIGRATIONS)[0]
    expect(first).toBeDefined()
    const sql = readFileSync(join(MIGRATIONS, `${first?.tag}.sql`), 'utf8')
    for (const statement of sql.split('--> statement-breakpoint')) s.db.exec(statement)

    expect(() => migrateInPlace(s.db, MIGRATIONS)).toThrow(/no migration journal/)
    // And it refused BEFORE changing anything: no journal was invented on the database's behalf.
    expect(countRows(s.db, '__drizzle_migrations')).toBeNull()
    expect(columnNames(s.db, 'links')).not.toContain('gate')
  })
})

// ============================================================================ counting

describe('the row counts the command reports', () => {
  it('says null for a table that is not there, and 0 for one that is empty', () => {
    const s = scratch('counting')
    expect(countRows(s.db, 'records')).toBeNull()
    migrateInPlace(s.db, MIGRATIONS)
    expect(countRows(s.db, 'records')).toBe(0)
  })

  it('shows a missing table as "no table" rather than as a zero', () => {
    const s = scratch('describe')
    const line = describeOutcome(migrateInPlace(s.db, MIGRATIONS))
    expect(line).toContain('records no table -> 0')
  })
})

// ============================================================================ every table, counted

/**
 * THE REPORT COVERS THE WHOLE FILE, AND IT DID NOT UNTIL 25 AUGUST 2026.
 *
 * What it cost is worth stating once, because it is the reason these tests are worth their length.
 * The `rows ... -> ...` line was built from `COUNTED_TABLES`, which is every AUTHORED table except
 * `workspaces`. Migration 0111 DROPs and recreates `source_files`, `source_index` and
 * `source_file_hashes` — all three DERIVED, none of them in that list. So the one report a person
 * reads while the database is being changed under them was silent about exactly the tables the
 * migration was rebuilding. A sabotaged copy of 0111 emptied `source_files` on a copy of the live
 * corpus and the command printed a complete-looking line naming twenty other tables and exited 0.
 *
 * The fix is not a longer list. It is reading the list from the database: `tablesInFile`.
 */
describe('the report counts every table the database has', () => {
  it('leaves no table out, whichever list it is on and even if it is on none', () => {
    const s = scratch('every-table')
    const outcome = migrateInPlace(s.db, MIGRATIONS)

    expect(Object.keys(outcome.after).sort()).toEqual(tablesInFile(s.db))
    // The whole schema, said three ways, so a table joining any of the three classes is covered.
    for (const table of [...AUTHORED_TABLES, ...DERIVED_TABLES, ...MEASURED_TABLES]) {
      expect(Object.keys(outcome.after), `${table} is not in the counts`).toContain(table)
    }
    // And the printed report really carries them, which is what a person actually reads. These four
    // are named because these four are the ones the old report left out.
    const line = describeOutcome(outcome)
    for (const table of ['source_files', 'source_index', 'source_file_hashes', 'workspaces']) {
      expect(line, `the report never mentions ${table}`).toContain(`${table} no table ->`)
    }
  })

  it('says which of them a lost row would not stop it over, rather than leaving a reader to know', () => {
    const s = scratch('says-which')
    const outcome = migrateInPlace(s.db, MIGRATIONS)
    const line = describeOutcome(outcome)

    expect(line).toContain('also counted, and this command does not refuse over these')
    // Derived by subtraction from the file, so it cannot go stale: everything the database holds
    // that the refusal does not cover. On a freshly migrated database that is the derived tables,
    // the four measured ones, `workspaces`, the journal and the six tables of the index of the
    // records' text (wave 13y round 64), which the records' triggers fill again from the records.
    // Then every schema part that no archive carries. A part's table can also be a derived one, as
    // the stored-files part's three are, and the database holds it once, so it is counted once.
    const uncarriedParts = everyPartTable().filter((part) => !part.says.exported).map((part) => part.name)
    expect(tablesReportedButNotRefusedOver(outcome)).toEqual(
      [...new Set(['__drizzle_migrations', ...DERIVED_TABLES, ...MEASURED_TABLES, ...MIGRATION_DECLARED_TABLES, ...RECORD_TEXT_INDEX_TABLES, ...uncarriedParts])].sort(),
    )
    // Nothing shrank, so the sentence about losing rows is absent rather than saying "0 tables".
    expect(line).not.toContain('LOST ROWS')
  })

  /**
   * THE FAULT ITSELF, REPRODUCED AS A REAL MIGRATION AND THEN CAUGHT.
   *
   * A genuine extra migration file, applied by drizzle through the same code path as any other,
   * that empties `source_files`. Before this change the report said nothing at all about it. The
   * command still does not REFUSE — a scan rebuilds that table, and `MEASURED_TABLES` in
   * db/table-name-lists.ts says in writing why a prune outside `COUNTED_TABLES` must stay allowed — but the
   * difference between "not refused" and "not mentioned" is the entire fault.
   */
  it('says a table it does not refuse over lost rows, in words, and still does not stop', () => {
    const s = scratch('derived-loss')
    migrateInPlace(s.db, MIGRATIONS)
    const file = s.db.prepare(
      'INSERT INTO source_files (workspace_id, repository_id, path, language, size_bytes, lines, imports, exports, modified_at) ' +
        "VALUES ('default', NULL, ?, 'ts', 10, 1, '[]', '[]', '2026-08-25 09:00:00')",
    )
    file.run('src/one.ts')
    file.run('src/two.ts')
    expect(countRows(s.db, 'source_files')).toBe(2)

    const outcome = migrateInPlace(s.db, migrationsPlusOne('empties_source_files', 'DELETE FROM `source_files`;'))

    expect(countRows(s.db, 'source_files'), 'the extra migration did not run').toBe(0)
    const line = describeOutcome(outcome)
    expect(line).toContain('source_files 2 -> 0')
    expect(line).toContain('1 table that this command does not refuse over LOST ROWS')
    expect(line).toContain('source_files went from 2 rows to 0 (a scan rebuilds it)')
  })

  it('says a schema part that no archive carries is one, when it lost rows', () => {
    const s = scratch('uncarried-part-loss')
    migrateInPlace(s.db, MIGRATIONS)
    // The receipt's run is not the point here, so the reference to records is not checked for this one row.
    s.db.pragma('foreign_keys = OFF')
    s.db.prepare(
      'INSERT INTO router_receipts (id, run_id, token_id, model, slot, status, price_says, at) ' +
        "VALUES ('rr_one', 'a-run', 'rt_one', 'a-model', 'a-slot', 200, 'unpriced', 1)",
    ).run()
    s.db.pragma('foreign_keys = ON')

    const outcome = migrateInPlace(s.db, migrationsPlusOne('empties_router_receipts', 'DELETE FROM `router_receipts`;'))

    expect(countRows(s.db, 'router_receipts'), 'the extra migration did not run').toBe(0)
    // MUTATION: drop the schema-part line from whyItIsNotRefusedOver in src/server/db/migrate.ts and this fails.
    expect(describeOutcome(outcome)).toContain('router_receipts went from 1 row to 0 (its schema part says no archive carries it)')
  })

  /**
   * THE OTHER HALF OF THE SAME BOUNDARY, through the same mechanism, so the two can be read together.
   * A counted table losing a row is still a THROW and not a sentence, and it always was.
   */
  it('still refuses outright when a counted table loses a row', () => {
    const s = scratch('counted-loss')
    migrateInPlace(s.db, MIGRATIONS)
    s.db
      .prepare(
        'INSERT INTO records (id, workspace_id, owner_id, created_at, updated_at, kind, title, summary, data) ' +
          `VALUES ('rec-one', 'default', '${THE_TEST_OFFICES_OWNER.id}', '2026-08-25 09:00:00', '2026-08-25 09:00:00', 'task', 'a record', NULL, '{}')`,
      )
      .run()

    expect(() => migrateInPlace(s.db, migrationsPlusOne('empties_records', 'DELETE FROM `records`;'))).toThrow(
      /LOST ROWS: records went from 1 row to 0/,
    )
  })
})

// ============================================================================ local time

describe('the time the command reports', () => {
  const originalTZ = process.env.TZ
  afterAll(() => {
    if (originalTZ === undefined) delete process.env.TZ
    else process.env.TZ = originalTZ
  })

  /**
   * The same six zones tests/time.test.ts uses, and for the same reason: a stamp written as UTC
   * and read back as local agrees with itself perfectly at offset zero, so a test that runs only
   * on this machine proves nothing. `Asia/Kolkata` and `Australia/Eucla` are not whole hours off,
   * which catches anything that tries to fix the problem by rounding.
   */
  const ZONES = ['UTC', 'Europe/London', 'America/New_York', 'Asia/Kolkata', 'Australia/Eucla', 'Pacific/Kiritimati']

  /**
   * THE MIDDLE OF THE HOUR THAT COMES TWICE, on its second pass, in each zone above that puts its clocks back. The same
   * two moments tests/time.test.ts stands its clock at.
   */
  const IN_THE_REPEATED_HOUR = [
    ['Europe/London', '2026-10-25T01:30:00Z'],
    ['America/New_York', '2026-11-01T06:30:00Z'],
  ] as const

  /** Runs the command in one zone and reads back the time it reports. */
  const itReportsLocalTimeIn = (zone: string) => {
    process.env.TZ = zone
    const s = scratch(`tz-${zone.replace(/\W/g, '-')}`)
    const outcome = migrateInPlace(s.db, MIGRATIONS)
    const ms = parseLocalStamp(outcome.at)
    expect(ms, `in ${zone}: "${outcome.at}" is not a stored stamp`).not.toBeNull()
    // Read back through the shared reader, a local stamp lands within seconds of now. A UTC one
    // lands a whole offset away — 14 hours in Kiritimati, and on the wrong day.
    // A STAMP IN THE HOUR THAT COMES TWICE NAMES TWO MOMENTS, and the shared reader takes the first. So the later moment
    // the stamp names on this zone's clock is read too, and the nearer of the two must be within the minute.
    const later = latestMomentOfStampInZone(outcome.at, zone)
    const away = Math.min(...[ms, later].map((one) => (one === null ? Infinity : Math.abs(one - Date.now()))))
    expect(away, `in ${zone}: "${outcome.at}" is out by the machine's offset`).toBeLessThan(60_000)
  }

  it('is local wall-clock time in every timezone, not UTC', () => {
    for (const zone of ZONES) itReportsLocalTimeIn(zone)
  })

  it('is local wall-clock time with the clock in the hour London and New York show twice', () => {
    // On the real clock this went red in New York from 06:00 UTC on 1 November 2026, an hour out: the command wrote the
    // second 01:xx, and the shared reader reads a stamp in that hour as the first.
    for (const [zone, moment] of IN_THE_REPEATED_HOUR) {
      vi.useFakeTimers({ toFake: ['Date'] })
      try {
        vi.setSystemTime(new Date(moment))
        itReportsLocalTimeIn(zone)
      } finally {
        vi.useRealTimers()
      }
    }
  })
})

// ============================================================================ the real command

describe('npm run db:migrate', () => {
  /**
   * WHY THIS SPAWNS A PROCESS INSTEAD OF CALLING THE FUNCTION.
   *
   * `src/server/db/migrate.ts` only runs its command when node was pointed at that file, so that
   * importing it for `migrateInPlace` does not open ./data/panelx.db. If that check ever came out
   * false, `npm run db:migrate` would exit 0 having migrated nothing — the quietest failure this
   * change could have. Nothing about it would be visible from inside the module, so the only test
   * that can see it is one that runs the real command.
   *
   * It is one spawn, and it is worth the second it costs.
   */
  it('migrates the database MOLE_OFFICE_DB names, and says what it did', () => {
    const s = scratch('subprocess')
    s.db.close()
    rmSync(s.file, { force: true })

    const stdout = execFileSync('npx', ['tsx', 'src/server/db/migrate.ts'], {
      cwd: REPO,
      env: { ...process.env, MOLE_OFFICE_DB: s.file },
      encoding: 'utf8',
    })

    expect(stdout).toContain(`migration${journal(MIGRATIONS).length === 1 ? '' : 's'} applied`)
    expect(stdout).toContain(basename(s.file))
    expect(stdout).toContain('records no table -> 0')

    const check = new Database(s.file, { readonly: true })
    try {
      expect((check.prepare('PRAGMA table_info(links)').all() as ColumnInfo[]).map((c) => c.name)).toContain('gate')
      expect(
        check.prepare("SELECT name FROM sqlite_master WHERE name = 'reader_anchors'").get(),
      ).toBeDefined()
    } finally {
      check.close()
    }
  }, 60_000)
})

describe('starting the server and running the command mean the same thing by "migrated"', () => {
  /**
   * THE DEFECT THIS EXISTS TO PREVENT, and it shipped.
   *
   * There are two kinds of migration in this repository: the SCHEMA files under ./drizzle, and the
   * DATA migrations — blocks, origin, blocked_by — that move stored values into the shapes the write
   * path accepts. `src/server/db/migrate.ts` runs both. `src/server/index.ts` used to call drizzle's
   * `migrate` directly and run only the first, so a database brought up to date by STARTING THE
   * SERVER had the `records.origin` column with nothing in it and `task.blocked_by` values sitting
   * in a field nothing reads. Nothing failed and nothing said anything.
   *
   * Two places that must agree about what "migrated" means, with nothing making them agree. This is
   * the thing that makes them agree, and it is a test rather than a comment because a comment is
   * what was there before.
   *
   * It reads the SOURCE rather than booting a server, and that is a deliberate limitation stated
   * here rather than hidden: booting would need a port, and this suite runs in parallel. What it can
   * prove without a port is the only thing that went wrong — that the boot path reaches the one
   * function instead of reimplementing half of it.
   *
   * WHAT THE BOOT PATH CALLS HAS SINCE CHANGED, AND THE CLAIM HAS NOT. It calls `prepareToServe`,
   * which calls `migrateInPlace` — against the database when that can move nothing, and against a
   * throwaway copy of it otherwise. Either way there is still ONE function that knows what
   * "migrated" means, and both callers reach it. The reason for the extra step is the whole of
   * `describe('a server start may not migrate a database that holds work')` below.
   *
   * IT GREPS THE CODE WITH THE COMMENTS TAKEN OUT, and that is not tidiness. Measured on
   * 2026-08-12: with the call to `prepareToServe` reverted to the old `migrateInPlace` line, this
   * test still PASSED, because the paragraph above the line explains what `prepareToServe` is and
   * the word was therefore still in the file. A grep a comment can satisfy is a test that passes
   * with its feature deleted.
   */
  it('the server boot path reaches the one function, and does not call drizzle migrate on its own', () => {
    const source = withoutComments(readFileSync(join(REPO, 'src/server/index.ts'), 'utf8'))

    // The one entry point. It is the only thing the server is allowed to decide the database's
    // state with, and it is in db/migrate.ts beside the migrations themselves.
    expect(source).toContain('prepareToServe')
    // And the decision is ACTED ON. A boot that read it and carried on would be the "no fake
    // success" defect in the one place this file is about.
    expect(source).toContain('decision.serve')

    // And drizzle's migrator is NOT reached from here any more. This is the assertion that fails if
    // somebody "simplifies" the boot back to a schema-only migration: the import is what made the
    // half-migration possible, and its absence is what makes it impossible.
    expect(source).not.toContain("from 'drizzle-orm/better-sqlite3/migrator'")
  })

  it('prepareToServe reaches migrateInPlace, so nothing can be added to one and missed by the other', () => {
    // A grep would prove the name is written down. This proves the CALL happens, by watching what a
    // fresh database looks like after `prepareToServe` and nothing else has touched it: the schema
    // files applied AND the data migrations run, which is the pair that came apart last time.
    const s = scratch('prepare-reaches')
    const decision = prepareToServe(s.db, MIGRATIONS)
    expect(decision.serve).toBe(true)

    // Schema: every migration file is in the journal.
    expect(
      (s.db.prepare('SELECT count(*) AS n FROM __drizzle_migrations').get() as { n: number }).n,
    ).toBe(journal(MIGRATIONS).length)
    // Data: the workspace migration ran, which is the only thing that declares the default
    // workspace. The message centre's row, written by the move into it since the decision that keeps
    // every message there, is not a project, and is left out of the three reads of the registry in this
    // file. A boot that applied the schema and skipped the data migrations leaves this empty,
    // and then refuses every write the server accepts.
    expect(s.db.prepare("SELECT id FROM workspaces WHERE id != 'message-centre'").all()).toEqual([{ id: 'default' }])
  })

  it('migrateInPlace really runs the data migrations, so calling it is enough', () => {
    // What the line above is worth depends on this: that the one function does both halves. Proved
    // on a scratch database by asking the outcome what each data migration reported, rather than by
    // trusting the name.
    const s = scratch('one-function')
    const outcome = migrateInPlace(s.db, MIGRATIONS)

    // Schema.
    expect(outcome.newlyApplied).toBeGreaterThan(0)
    // And all four data migrations, each of which reported something rather than being absent.
    expect(outcome.blocks).toBeDefined()
    expect(outcome.origin).toBeDefined()
    expect(outcome.blockedBy).toBeDefined()
    expect(outcome.workspaces).toBeDefined()
  })
})

// ================================================== a start may not migrate a database that holds work

/**
 * THE SECOND DEFECT AT THE SAME LINE, and it also shipped.
 *
 * The block above made the server call `migrateInPlace` on the way up so that starting it and
 * running `npm run db:migrate` could not disagree about what "migrated" means. That was right about
 * half-migration and wrong about this: `npm run dev` runs the server under `tsx watch`, so EVERY
 * SAVE OF A SERVER FILE RESTARTS IT AND RAN THE MIGRATIONS AGAIN. On 11 August a dev server was left
 * running against `./data/panelx.db` overnight; the workspace migration — which MOVES 394 records
 * into three projects — ran against the live corpus unattended, triggered by a file save, with
 * nobody watching and no backup taken at that moment. Nothing was lost. That was luck, not design.
 *
 * The rule these tests hold in place, which is `prepareToServe` in src/server/db/migrate.ts:
 *
 *   - a database that holds no records, links or changes is migrated exactly as before, because
 *     nothing in it can be moved;
 *   - a database that holds any of them is checked and NEVER WRITTEN TO. If bringing it up to date
 *     would write anything at all, the server refuses to serve and names the command;
 *   - if it would write nothing, the server serves, and says so in one line.
 *
 * WHY "WOULD WRITE ANYTHING" AND NOT "WOULD MOVE DATA". Adding a nullable column moves nothing;
 * rewriting rows does; and nothing can tell which kind a pending file is without running it — 0004
 * is a generated schema migration that rebuilds three tables and copies every row through them.
 * `describe('migration 0004 ...')` above is the measurement that says so. The uncertain case is
 * therefore treated as the dangerous one, and `refuses a database with a pending SCHEMA migration`
 * below is the test of that.
 *
 * THESE FIXTURES ARE BUILT, NOT READ FROM ./data/panelx.db, for the reason the file header gives.
 * The three proofs over a scratch copy of the real corpus were done by hand at the command line
 * when this was written, and they are what the numbers in the header of `prepareToServe` come from.
 */
describe('a server start may not migrate a database that holds work', () => {
  /**
   * A fully migrated database with rows in it and nothing left to do. The ordinary restart.
   *
   * MIGRATED TWICE ON PURPOSE. `seed()` writes rows straight into the tables the way these fixtures
   * do, and its change rows carry no workspace — which the workspace migration would stamp, so the
   * database is genuinely not up to date until it has run again. Rows written through the API do
   * carry one, because `logChange` reads it off the record. Bringing the fixture up to date the way
   * an operator would is the honest way to build "needs nothing"; asserting it and hoping would not
   * have survived the first run of these tests, and did not.
   */
  function upToDateWithWork(name: string): Scratch {
    const s = scratch(name)
    migrateInPlace(s.db, MIGRATIONS)
    seed(s.db)
    migrateInPlace(s.db, MIGRATIONS)
    return s
  }

  /**
   * The same database with ONE task holding `blocked_by` prose.
   *
   * The exact shape of the incident: every schema file already applied, and a DATA migration with
   * something to do — here `blocked_by`, which rewrites `records.data`. A restart used to perform
   * that rewrite.
   */
  function needsADataMigration(name: string): Scratch {
    const s = upToDateWithWork(name)
    s.db
      .prepare(
        'INSERT INTO records (id, workspace_id, owner_id, created_at, updated_at, kind, title, summary, data) ' +
          `VALUES ('rec-waiting', 'default', '${THE_TEST_OFFICES_OWNER.id}', '2026-07-02 09:00:00', '2026-07-02 09:00:00', 'task', ` +
          "'rerun the bench', NULL, '{\"blocked_by\":\"the bench is in pieces\"}')",
      )
      .run()
    return s
  }

  it('migrates a database with nothing in it, so a fresh clone still comes up on its own', () => {
    const s = scratch('fresh-clone')
    const decision = prepareToServe(s.db, MIGRATIONS)

    expect(decision.serve).toBe(true)
    // Migrated FOR REAL, not checked: this is the path that has to leave a usable database behind.
    expect(countRows(s.db, 'records')).toBe(0)
    expect(
      (s.db.prepare('SELECT count(*) AS n FROM __drizzle_migrations').get() as { n: number }).n,
    ).toBe(journal(MIGRATIONS).length)
    expect(irreplaceableRows(s.db)).toBe(0)
  })

  it('serves a database that holds work and needs nothing, and says so', () => {
    const s = upToDateWithWork('quiet-restart')
    const decision = prepareToServe(s.db, MIGRATIONS)

    expect(decision.serve).toBe(true)
    if (decision.serve) {
      expect(decision.report).toContain('nothing to do')
      expect(decision.report).toContain(s.file)
      // The quiet case stays quiet: no refusal, and nothing telling an operator to go and run
      // something before they can use the product.
      expect(decision.report).not.toContain('REFUSING')
    }
  })

  it('REFUSES a database that holds work and needs a data migration, and names the command', () => {
    const s = needsADataMigration('refuse-data')
    const decision = prepareToServe(s.db, MIGRATIONS)

    expect(decision.serve).toBe(false)
    if (!decision.serve) {
      // What is pending, what it would move, and the exact command — the three things a refusal
      // has to carry to be actionable without reading any source.
      expect(decision.refusal).toContain('REFUSING TO SERVE')
      expect(decision.refusal).toContain(s.file)
      expect(decision.refusal).toContain('blocked_by: rewrite the stored data of 1 task')
      expect(decision.refusal).toContain(`MOLE_OFFICE_DB=${s.file} npm run db:migrate`)
    }
  })

  it('writes nothing to the database it refuses — not one cell, not one line of schema', () => {
    const s = needsADataMigration('refuse-writes-nothing')
    const shapeBefore = shapeOf(s.db)
    const cellsBefore = everyCell(s.db)
    const journalBefore = (
      s.db.prepare('SELECT count(*) AS n FROM __drizzle_migrations').get() as { n: number }
    ).n

    const decision = prepareToServe(s.db, MIGRATIONS)
    expect(decision.serve).toBe(false)

    const { changed, vanished } = cellChanges(cellsBefore, everyCell(s.db))
    expect(changed).toEqual([])
    expect(vanished).toEqual([])
    expect(everyCell(s.db).size).toBe(cellsBefore.size)
    expect(shapeOf(s.db)).toEqual(shapeBefore)
    expect(
      (s.db.prepare('SELECT count(*) AS n FROM __drizzle_migrations').get() as { n: number }).n,
    ).toBe(journalBefore)
  })

  it('serves the same database once the command has been run against it', () => {
    const s = needsADataMigration('refuse-then-serve')
    expect(prepareToServe(s.db, MIGRATIONS).serve).toBe(false)

    // What the operator does, through the same function `npm run db:migrate` runs.
    const outcome = migrateInPlace(s.db, MIGRATIONS)
    expect(outcome.blockedBy.moved).toBe(1)

    const after = prepareToServe(s.db, MIGRATIONS)
    expect(after.serve).toBe(true)
    if (after.serve) expect(after.report).toContain('nothing to do')
  })

  it('refuses a database with a pending SCHEMA migration too, because nothing can tell what one does', () => {
    // 0000 applied and rows written, exactly as ./data/panelx.db was before 0001 existed. Six schema
    // files are pending and one of them — 0004 — rebuilds three tables and copies every row.
    const s = atMigrationZero('refuse-schema')
    const decision = prepareToServe(s.db, MIGRATIONS)

    expect(decision.serve).toBe(false)
    if (!decision.serve) {
      expect(decision.refusal).toContain('schema migration')
      // Named, so the operator can go and read the one that is about to run.
      expect(decision.refusal).toContain('0004_drop_the_utc_stamp_defaults')
      expect(decision.refusal).toContain('npm run db:migrate')
    }
    // And nothing was applied: the journal still holds 0000 alone.
    expect(
      (s.db.prepare('SELECT count(*) AS n FROM __drizzle_migrations').get() as { n: number }).n,
    ).toBe(1)
  })

  /**
   * THE STRUCTURAL PROOF, and the one worth keeping if any of the others were ever deleted.
   *
   * The check runs against a connection SQLite itself will not let anything write through. No
   * assertion about what was written can be as strong as the write being impossible: if any path
   * inside `previewMigration` ever reached the real database instead of the copy, this stops with
   * SQLITE_READONLY rather than passing quietly.
   */
  it('cannot write to the database it checks: the whole check runs on a READ-ONLY connection', () => {
    const s = needsADataMigration('readonly-check')
    // Closed so the file is not held open in WAL by a writer while the read-only connection reads
    // it; the point of this test is the second connection, not the first.
    s.db.close()

    const readOnly = new Database(s.file, { readonly: true })
    try {
      const preview = previewMigration(readOnly, MIGRATIONS)
      expect(preview.file).toBe(s.file)
      expect(preview.wouldWrite.join('\n')).toContain('blocked_by')
      // And the report it hands back is about the COPY, and says so rather than borrowing the name
      // of the file it was made from.
      expect(preview.outcome.file).toBe(':memory:')
    } finally {
      readOnly.close()
    }
  })

  /**
   * THE SEEDED DATABASE, WHICH IS NOT A SPECIAL CASE BUT WOULD HAVE LOOKED LIKE ONE.
   *
   * `tools/review.mjs` seeds a throwaway database and starts a server against it on every run, and
   * `npm run db:seed && npm run dev` is what README gives a new clone. Both hold hundreds of rows.
   * Measured on 2026-08-12 while writing this: with the rule keyed on row COUNT alone, the review
   * tool stopped dead — `REFUSING TO SERVE … it holds 1143 records, links and changes` — because
   * `scripts/reset.ts` applies the schema files with drizzle directly and none of the four data
   * migrations, so the database it leaves has no `default` workspace row and is genuinely not up to
   * date. (That is the same half-migration this file's previous section is about, still living in
   * `scripts/reset.ts`. It is worth fixing there.)
   *
   * What tells the two apart is not a flag invented for it: `records.origin` already answers "is
   * this row part of the real record, or is it furniture?", and `fixture` already means it came
   * from the seed.
   */
  it('migrates a seeded database, because every record in it says it came from the seed', () => {
    const s = scratch('all-fixture')
    migrateInPlace(s.db, MIGRATIONS)
    const insert = s.db.prepare(
      'INSERT INTO records (id, workspace_id, owner_id, created_at, updated_at, kind, title, summary, data, origin) ' +
        `VALUES (?, 'default', '${THE_TEST_OFFICES_OWNER.id}', '2026-07-01 09:00:00', '2026-07-01 09:00:00', 'problem', ?, NULL, '{}', 'fixture')`,
    )
    insert.run('fix-1', 'a seeded problem')
    insert.run('fix-2', 'another seeded problem')
    // Something pending: no workspace row at all, which is the state scripts/reset.ts leaves.
    s.db.prepare("DELETE FROM workspaces WHERE id = 'default'").run()

    expect(irreplaceableRows(s.db)).toBeGreaterThan(0)
    expect(everyRecordCameFromTheSeed(s.db)).toBe(true)

    const decision = prepareToServe(s.db, MIGRATIONS)
    expect(decision.serve).toBe(true)
    // Migrated for real, and the whole report printed, as the command prints it.
    expect(s.db.prepare("SELECT id FROM workspaces WHERE id != 'message-centre'").all()).toEqual([{ id: 'default' }])
    if (decision.serve) expect(decision.report).toContain('workspaces:')
  })

  it('protects the same database the moment one record is not from the seed', () => {
    const s = scratch('one-authored')
    migrateInPlace(s.db, MIGRATIONS)
    const insert = s.db.prepare(
      'INSERT INTO records (id, workspace_id, owner_id, created_at, updated_at, kind, title, summary, data, origin) ' +
        `VALUES (?, 'default', '${THE_TEST_OFFICES_OWNER.id}', '2026-07-01 09:00:00', '2026-07-01 09:00:00', 'problem', ?, NULL, '{}', ?)`,
    )
    insert.run('fix-1', 'a seeded problem', 'fixture')
    insert.run('real-1', 'the gripper slips at 40N', 'authored')
    s.db.prepare("DELETE FROM workspaces WHERE id = 'default'").run()

    expect(everyRecordCameFromTheSeed(s.db)).toBe(false)
    expect(prepareToServe(s.db, MIGRATIONS).serve).toBe(false)
    // And the record that made the difference is still there, unwritten to.
    expect(s.db.prepare("SELECT id FROM workspaces WHERE id != 'message-centre'").all()).toEqual([])
  })

  /**
   * A DATABASE HOLDING SOMEBODY'S PLAN AND NO RECORDS AT ALL, which is what this guard could not see.
   *
   * Measured on 2026-08-12, before `COUNTED_TABLES` was read from the schema: with one draft and one
   * capacity row and nothing else, `irreplaceableRows` answered 0, `everyRecordCameFromTheSeed`
   * answered false, and `prepareToServe` therefore answered SERVE — so migration 0009 was applied to
   * it in place, unattended, by a `tsx watch` restart. Nothing in the report mentioned the plan.
   *
   * The fixture is a genuine half-migrated database: the real migration files, all but the last one,
   * through `partialMigrations`. It is not a description of the incident, it is the incident.
   */
  it('REFUSES a database holding only a plan, which used to read as holding nothing', () => {
    const s = scratch('plan-only')
    migrateInPlace(s.db, partialMigrations(migrationsBefore('0009_planning_recurrences')))
    s.db
      .prepare(
        'INSERT INTO planning_drafts (id, title, body, created_at, updated_at, created_by) VALUES ' +
          `('d1', 'ICRA submission', 'target: September', '2026-08-01 09:00:00', '2026-08-01 09:00:00', 'human:${THE_TEST_OFFICES_OWNER.id}')`,
      )
      .run()
    s.db
      .prepare(
        'INSERT INTO planning_capacity (horizon, period, hours, note, updated_at, updated_by) VALUES ' +
          `('week', '2026-W36', 22, 'three teaching days', '2026-08-01 09:00:00', 'human:${THE_TEST_OFFICES_OWNER.id}')`,
      )
      .run()

    // The fixture is what it says it is: a plan, and NO records, links or changes.
    expect(countRows(s.db, 'records')).toBe(0)
    expect(countRows(s.db, 'links')).toBe(0)
    expect(countRows(s.db, 'changes')).toBe(0)
    expect(irreplaceableRows(s.db), 'a plan reads as nothing anybody would miss').toBeGreaterThan(0)
    // Not the seeded-database exemption either: there are no records to have come from a seed.
    expect(everyRecordCameFromTheSeed(s.db)).toBe(false)

    const decision = prepareToServe(s.db, MIGRATIONS)
    expect(decision.serve, "a server start migrated somebody's plan without being asked").toBe(false)
    if (!decision.serve) {
      // The refusal names what it is protecting, table by table, or an operator cannot tell their
      // week's planning from a leftover.
      expect(decision.refusal).toContain('1 planning_drafts')
      expect(decision.refusal).toContain('1 planning_capacity')
      expect(decision.refusal).toContain(`MOLE_OFFICE_DB=${s.file} npm run db:migrate`)
    }
    // And it wrote nothing: the migration it refused to run is still pending.
    expect(countRows(s.db, 'planning_recurrences')).toBe(null)
    expect((s.db.prepare('SELECT title FROM planning_drafts').get() as { title: string }).title).toBe('ICRA submission')
  })

  it('counts every person-level table a migration does not fill, so no part of a plan is invisible', () => {
    // NOT VACUOUS, AND THE NARROWING DOES NOT REACH THE PLANNING LAYER. The set really is smaller
    // than the whole, and every table taken out of it is one a migration seeds — so this cannot
    // quietly become an empty loop, and no planning table can be excused by it.
    expect(PERSON_LEVEL_TABLES_NOBODY_SEEDS.length).toBeGreaterThan(0)
    expect(PERSON_LEVEL_TABLES_NOBODY_SEEDS.length).toBeLessThan(PERSON_LEVEL_TABLES.length)
    for (const table of PERSON_LEVEL_TABLES) {
      if (PERSON_LEVEL_TABLES_NOBODY_SEEDS.includes(table)) continue
      expect(MIGRATION_DECLARED_TABLES as readonly string[], `${table} is uncounted and no migration fills it`)
        .toContain(table)
    }
    // DERIVED: a fifth planning table added to the schema is covered by this the day it arrives.
    for (const table of PERSON_LEVEL_TABLES_NOBODY_SEEDS) {
      expect(COUNTED_TABLES, `${table} is not counted, so a database holding only that reads as empty`).toContain(table)
    }
  })

  it('treats a record with NO origin as work, because nobody has said where it came from', () => {
    // Rule 5: absence beats a guess. An unstamped row is not a claim that it came from the seed,
    // and every database written before migration 0005 is full of them.
    const s = scratch('null-origin')
    migrateInPlace(s.db, MIGRATIONS)
    s.db
      .prepare(
        'INSERT INTO records (id, workspace_id, owner_id, created_at, updated_at, kind, title, summary, data, origin) ' +
          `VALUES ('unknown-1', 'default', '${THE_TEST_OFFICES_OWNER.id}', '2026-07-01 09:00:00', '2026-07-01 09:00:00', 'problem', ` +
          "'nobody said where this came from', NULL, '{}', NULL)",
      )
      .run()
    expect(everyRecordCameFromTheSeed(s.db)).toBe(false)
  })

  it('says nothing would be written when nothing would be, so an up-to-date database is not nagged', () => {
    const s = upToDateWithWork('preview-quiet')
    const preview = previewMigration(s.db, MIGRATIONS)
    expect(preview.wouldWrite).toEqual([])
    expect(preview.outcome.newlyApplied).toBe(0)
  })

  it('and a start that DOES serve writes nothing to the database either', () => {
    // The other half of the rule, and the half a restart performs a hundred times a day: the quiet
    // path has to be a read. Measured as content rather than as bytes, because a second process's
    // WAL checkpoint moves bytes in the file without changing a single row.
    const s = upToDateWithWork('serve-writes-nothing')
    const before = everyCell(s.db)
    expect(prepareToServe(s.db, MIGRATIONS).serve).toBe(true)
    expect(cellChanges(before, everyCell(s.db)).changed).toEqual([])
    expect(cellChanges(before, everyCell(s.db)).vanished).toEqual([])
  })
})

// ---------------------------------------------------------------------------- the real boot path

/**
 * The one test that watches the server itself start, or refuse to.
 *
 * Everything above proves what `prepareToServe` decides; only a real process proves that
 * `src/server/index.ts` acts on it. The source grep above says the name appears in the file, which
 * is not the same claim — a decision read and then ignored is exactly the "no fake success" defect,
 * and it would be invisible to every other test here.
 *
 * IT NEEDS NO FREE PORT, because a refusal never listens. MOLE_OFFICE_PORT is set to a number that is
 * only reached if this test's subject is broken, and the child is started detached and killed BY
 * PROCESS GROUP whatever happens, so a regression that did start a server cannot leave one behind.
 * That is the fifth orphaned-process incident's rule, written into the one test that could cause a
 * sixth.
 */
describe('the server process refuses to start against a database that needs migrating', () => {
  it('exits without serving, and its output names what would move and the command to run', async () => {
    const s = scratch('boot-refusal')
    migrateInPlace(s.db, MIGRATIONS)
    seed(s.db)
    s.db
      .prepare(
        'INSERT INTO records (id, workspace_id, owner_id, created_at, updated_at, kind, title, summary, data) ' +
          `VALUES ('rec-waiting', 'default', '${THE_TEST_OFFICES_OWNER.id}', '2026-07-02 09:00:00', '2026-07-02 09:00:00', 'task', ` +
          "'rerun the bench', NULL, '{\"blocked_by\":\"the bench is in pieces\"}')",
      )
      .run()
    // Closed so the child process has the file to itself, as it would in life.
    s.db.close()

    // NO MESSAGE WORKER, said here rather than left to the test runner's VITEST: a server that did start
    // would otherwise start one in this worktree, and its runs would write the worktree's AGENTS.md
    // (tests/no-test-leaves-a-rules-file-in-the-worktree.test.ts).
    const child = spawn(join(REPO, 'node_modules', '.bin', 'tsx'), apiServerArguments(), {
      cwd: REPO,
      env: { ...process.env, MOLE_OFFICE_DB: s.file, MOLE_OFFICE_PORT: '39917', LOG_LEVEL: 'warn', MOLE_OFFICE_MESSAGE_WORKER: 'off' },
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let output = ''
    child.stdout?.on('data', (chunk: unknown) => (output += String(chunk)))
    child.stderr?.on('data', (chunk: unknown) => (output += String(chunk)))

    try {
      const exited = await Promise.race([
        once(child, 'exit').then(([code]) => code as number | null),
        // Twenty seconds is a deadline, not a wait: a refusal takes about two, and this number is
        // only ever reached by a server that started when it should not have — which is the
        // failure being watched for, and the reason the process group is killed below.
        new Promise<'never exited'>((resolve) => setTimeout(() => resolve('never exited'), 20_000)),
      ])
      expect(exited).not.toBe('never exited')
      expect(exited).not.toBe(0)
      expect(output).toContain('REFUSING TO SERVE')
      expect(output).toContain('blocked_by: rewrite the stored data of 1 task')
      expect(output).toContain('npm run db:migrate')
    } finally {
      /**
       * ALWAYS BY GROUP, AND ALWAYS, EVEN WHEN THE CHILD HAS ALREADY EXITED.
       *
       * `tsx` runs the server in a node process of its own and can exit before it does. Measured on
       * 2026-08-12 while reverting this fix to prove the test: the tsx process exited, this block
       * saw `exitCode` set and skipped the kill, and the server it had started went on holding
       * 39917 after the run finished — a sixth orphaned-process incident, caused by the test for
       * the fix. So the group is signalled whichever state the direct child is in; an empty group
       * answers ESRCH, which is the outcome that was wanted.
       */
      if (child.pid !== undefined) {
        try {
          process.kill(-child.pid, 'SIGKILL')
        } catch {
          // ESRCH: nothing left in the group, which is what this is trying to achieve.
        }
      }
    }
  }, 60_000)

})
