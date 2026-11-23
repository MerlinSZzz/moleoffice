// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * Apply pending migrations, and prove that applying them did not lose anything.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS FILE IS MORE THAN ONE LINE
 * ---------------------------------------------------------------------------------------
 *
 * Migrations exist so the shape of stored data can change after there is real data in it. That
 * situation arrives about two weeks into any project and is unpleasant without this. It has now
 * arrived here: `./data/panelx.db` holds records, links and changes that were written by hand and
 * by agents and exist nowhere else, and the next migration to run against it is the first one that
 * has ever run against a database with anything in it.
 *
 * So this command answers two questions rather than one. It still applies the migrations. It also
 * COUNTS EVERY TABLE THE DATABASE HAS, before and after, and prints all of them. A migration that
 * quietly drops rows looks exactly like one that worked, and the only place that difference is
 * cheap to notice is here, in the second before the operator walks away believing it.
 *
 * COUNTING AND REFUSING ARE TWO DIFFERENT LISTS, and the report says which is which. It REFUSES —
 * throws, after the fact — when a table in `COUNTED_TABLES` shrank; that list is read from the
 * schema and holds the tables nothing can rebuild. Every other table in the file is counted and
 * printed under its own sentence saying this command does not refuse over it. That second list used
 * to be printed nowhere at all, and on 25 August 2026 that cost a reader the truth at the worst
 * moment: migration 0111 DROPs and recreates `source_files`, `source_index` and `source_file_hashes`,
 * all three derived, and a sabotaged copy of it emptied `source_files` while this command printed a
 * complete-looking `rows ...` line that never named the table and exited 0. The report is now the
 * whole file, so a reader no longer has to know which tables it leaves out.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT MAKES IT SAFE TO RUN TWICE
 * ---------------------------------------------------------------------------------------
 *
 * A row goes into `__drizzle_migrations` for each migration applied, carrying the hash of its file
 * and its `when` value out of `drizzle/meta/_journal.json`. From index 212 on, a migration is applied
 * when its hash is not in that table, in index order; up to index 211 the `when` still decides, as it
 * did for drizzle. Why both, and which is which, is written once, in src/config/migration-look.mjs,
 * whose `theMigrationsNotYetApplied` this command, the dev supervisor and the backup all ask. (So
 * EDITING A MIGRATION FROM 0212 ON AFTER IT HAS LANDED RUNS IT AGAIN, because its hash changes. Worth
 * knowing before trying to fix a migration by editing it: write a new one.) A migration file the
 * public version changed also counts as applied under the hash it had before the change, which a
 * list beside the journal gives; that rule is in the same file. That is the whole
 * mechanism, and it is why `ALTER TABLE ... ADD COLUMN` is safe to have in a migration even though
 * SQLite has no `ADD COLUMN IF NOT EXISTS`. The whole run is one transaction, so a migration that
 * fails half way leaves the database as it was.
 *
 * The mechanism has one hole, and `checkJournal` below is about that hole. A database whose tables
 * were made outside the migration system has no journal, so drizzle believes nothing has been
 * applied and starts again from 0000 — whose `CREATE TABLE` statements are bare, because they were
 * generated before anybody had learnt to add `IF NOT EXISTS` by hand. The error SQLite gives for
 * that is `table records already exists`, out of a command whose entire job is to be run again.
 * This file says what actually happened instead, and it REFUSES rather than repairing anything:
 * writing a journal row on a database's behalf would be guessing which migrations its tables came
 * from, and a wrong guess there loses data on the next migration rather than this one.
 *
 * ---------------------------------------------------------------------------------------
 * WHY STARTING A SERVER IS NOT THE SAME THING AS RUNNING THIS COMMAND
 * ---------------------------------------------------------------------------------------
 *
 * `src/server/index.ts` used to call `migrateInPlace` on the way up, so that starting the server
 * and running this command could not disagree about what "migrated" means. That fixed a real
 * half-migration and introduced a worse hazard, measured on this machine on 11 August: `npm run
 * dev` runs the server under `tsx watch`, so EVERY SAVE OF A SERVER FILE RESTARTS IT. A dev server
 * was left running against `./data/panelx.db` overnight, and each restart ran the migrations again.
 * The workspace migration — which MOVES 394 records into three projects — ran against the live
 * corpus unattended, triggered by a file save, with nobody watching and no backup taken at that
 * moment. Nothing was lost. That was luck.
 *
 * So the boot path no longer migrates a database that holds work. `prepareToServe` at the bottom of
 * this file is the whole rule, and it keeps both halves:
 *
 *   - A database holding nothing anybody would miss is migrated exactly as before, so a fresh clone
 *     and every throwaway database a test or tools/review.mjs builds still comes up on its own with
 *     nothing to run first. Two ways to hold nothing, and each is a fact the database states about
 *     itself: NOT ONE ROW IN ANY AUTHORED TABLE — nothing can be moved when there is nothing in
 *     it — or EVERY RECORD STAMPED `fixture`, which `records.origin` defines as having entered
 *     through the seed, so `npm run db:seed` rebuilds the whole file. Both are below, and both
 *     answer "no" to every way of not knowing.
 *   - A database that holds any of those rows is CHECKED and never written. If bringing it up to
 *     date would write anything at all, the server REFUSES TO SERVE and names the command an
 *     operator runs deliberately. If it would write nothing, the server serves — which is the
 *     ordinary case, and it stays quiet.
 *
 * WHAT "WOULD WRITE ANYTHING" MEANS, AND WHY IT IS NOT "WOULD MOVE DATA". A migration that adds a
 * nullable column moves nothing; one that rewrites rows does; and NOTHING HERE CAN TELL WHICH KIND
 * A PENDING FILE IS WITHOUT RUNNING IT. 0004 is the proof: it is a schema migration, it is generated
 * SQL, and it rebuilds three tables and copies every row through them. Reading the `.sql` and
 * guessing from the statements in it would be exactly the substitution invariant 2 of USER.md
 * forbids — so the uncertain case is treated as the dangerous one, and any pending write refuses.
 *
 * HOW IT KNOWS BEFORE RUNNING ANYTHING. It runs the real migrations, against a throwaway copy of
 * the database held in memory (in a folder beside the database above 2,000,000,000 bytes, which SQLite
 * cannot serialize; see `measureAgainstAFileCopy`), and compares the copy with the image it was made from. That is the
 * ritual the "SAFE TO RUN TWICE" section already tells an operator to perform by hand with `cp`,
 * done by the code, on a copy that cannot outlive the check. It is not a second implementation of
 * anything: `previewMigration` calls `migrateInPlace`, so a migration added to one is seen by the
 * other, and there is no list anywhere of which migrations are dangerous.
 *
 * WITH NO MIGRATION PENDING, A START MAKES NO COPY. It runs the same data steps (`everyDataStepIn`) on the served file
 * itself, inside one transaction that is always rolled back, and judges from what the steps report and from two counts
 * SQLite keeps; see `measureOnThisFile`.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE WORK IS IN AN EXPORTED FUNCTION AND THE SCRIPT IS FOUR LINES AT THE BOTTOM
 * ---------------------------------------------------------------------------------------
 *
 * So tests/migration.test.ts can run the real thing against a scratch database instead of a
 * paraphrase of it. A test that reimplements the migration proves the test works.
 *
 * `migrateInPlace` takes an open connection and touches nothing else, so importing this module
 * opens no database. db/client.ts reads MOLE_OFFICE_DB the moment IT is imported, which is why the
 * import of it below is dynamic and inside the guard — the same reason scripts/reset.ts and
 * src/server/index.ts give for their dynamic imports.
 *
 * The guard itself is a risk worth naming: if `invokedDirectly` ever came out false when somebody
 * ran `npm run db:migrate`, this command would exit 0 having done nothing, which is the quietest
 * possible failure. tests/migration.test.ts runs the command as a real subprocess and asserts on
 * its output, so that would be a red test rather than a database nobody migrated.
 */

import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migratePixelScale } from './pixel-scale-migration.ts'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { closeSync, fstatSync, lstatSync, mkdtempSync, openSync, readdirSync, readSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { MessageChannel, receiveMessageOnPort, Worker } from 'node:worker_threads'
import { THE_MIGRATIONS_FOLDER, isTheProgramRun, whyThisCheckoutMayNotOpenTheDatabase } from '../../config/settings.mjs'
// THE WORDS THE GUARD REFUSES IN, from the one module the supervisor reads them from too, so a
// refusal the supervisor does not recognise cannot be made by changing this file alone.
import { REFUSING_TO_SERVE, REFUSING_TO_USE } from '../../config/guard-refusal.mjs'
// THE JOURNAL TABLE'S NAME, from the one module the supervisor reads it from too, so the table the
// migrator writes and the table the supervisor looks in cannot drift apart.
// WHICH MIGRATIONS A DATABASE LACKS is worked out there too, once, for the migrator and the supervisor's look.
import {
  THE_MIGRATION_JOURNAL_TABLE,
  theMigrationsInTheFolder,
  theMigrationsNotYetApplied,
  type FolderMigration,
} from '../../config/migration-look.mjs'
// The one place that knows how to write a moment down. Local wall clock, never UTC, because a day
// here has to mean the operator's day — see src/shared/time.ts.
import { nowStamp } from '@shared/time.ts'
// HOW THE START MEASURED, in the type the update page reads it in.
import type { TheUpdateOffer } from '@shared/the-update.ts'
// Open while the data steps run on the served file in a transaction this rolls back; `whenStored` reads it.
import { THE_ROLLED_BACK_RUN } from './told-when-stored.ts'
// The recorder and its guarded monotonic clock are shared with the migrations check's timing line.
import { readMonotonicClock, type MigrationsCheckTiming } from '../lib/start-steps.ts'
import { enWave14c } from '../../shared/words/en-wave-14c.ts'
// WHICH TABLES HOLD WORK IS THE SCHEMA'S ANSWER, NOT THIS FILE'S. See `COUNTED_TABLES` below for
// what it cost when this file kept its own copy of that list.
import {
  DERIVED_TABLES,
  MEASURED_TABLES,
  MIGRATION_DECLARED_TABLES,
  RECORD_TEXT_INDEX_TABLES,
} from './schema.ts'
import { everyPartTable, irreplaceableTablesWithParts } from './every-part-table.ts'
import { migrateBlocks, type BlockMigrationReport } from './blocks-migration.ts'
import { migrateOrigins, type OriginMigrationReport } from './origin-migration.ts'
import { migrateSealCopiesToPointers, type SealRewriteReport } from './seal-copies-to-pointers.ts'
import {
  describeParticipants,
  migrateParticipants,
  type ParticipantsMigrationReport,
} from './participants-migration.ts'
import { refuseAnOfficeWithNoOwnerToWrite } from './owner-setting.ts'
import {
  describeCitizenship,
  migrateCitizenship,
  type CitizenshipMigrationReport,
} from './citizenship-migration.ts'
import {
  describeMessageDelivery,
  whereTheDeliveryRowsWent,
  migrateMessageDelivery,
  type MessageDeliveryReport,
} from './message-delivery-migration.ts'
import { migrateBlockedBy, type BlockedByMigrationReport } from './blocked-by-migration.ts'
import {
  describeWorkspaces,
  migrateWorkspaces,
  type WorkspaceMigrationReport,
} from './workspace-migration.ts'
import { describeAppendOrder, migrateAppendOrder } from './append-order-migration.ts'
import {
  describeRevisionBackfill,
  migrateRevisions,
  type RevisionBackfillReport,
} from './revision-backfill.ts'
import {
  describeReviewMigration,
  migrateReviews,
  type ReviewMigrationReport,
} from './review-migration.ts'
import {
  describeSecretaryRunsNeedNoCheck,
  markSecretaryRunsAsNeedingNoCheck,
  type Report as SecretaryRunsReport,
} from './secretary-runs-need-no-check.ts'
import {
  describeTheMoveIntoTheMessageCentre,
  moveMessagesIntoTheMessageCentre,
  type Report as MessageCentreReport,
} from './message-centre-migration.ts'
import {
  describeContextMigration,
  migrateContexts,
  type ContextMigrationReport,
} from './context-migration.ts'
import {
  DRAFTS_TABLE,
  describeTheDraftMove,
  moveDraftsIntoPlans,
  rowsTheDraftMoveWrote,
  type Report as DraftMoveReport,
} from './drafts-into-plans-migration.ts'
import {
  describeTheToolUseMove,
  moveToolUsesIntoTheirTable,
  rowsTheToolUseMoveWrote,
  type Report as ToolUseMoveReport,
} from './tool-uses-migration.ts'
import {
  describeTheWithdrawal,
  rowsTheWithdrawalWrote,
  whatTheWithdrawalDid,
  withdrawTheRunsASentReviewLeftWaiting,
  type Report as WithdrawnReviewRunsReport,
} from './withdraw-review-runs-migration.ts'
import { describeTheOwnerStep, rowsTheOwnerStepWrote, setTheOldAgentsOwners, whatTheOwnerStepDid, type Report as AgentOwnersReport } from './agent-owners-migration.ts'
import {
  describeTheKindsStep,
  rowsTheKindsStepWrote,
  tellTheKindsBesideTheIds,
  whatTheKindsStepDid,
  type Report as KindsBesideIdsReport,
} from './kinds-beside-ids-migration.ts'
import {
  describeTheWorkGroupStep,
  rowsTheWorkGroupStepWrote,
  setTheCastingWorkGroups,
  whatTheWorkGroupStepDid,
  type Report as CastingWorkGroupsReport,
} from './casting-work-groups-migration.ts'
import {
  describeTheLabelStep,
  makeTheFirstCastingLabels,
  rowsTheLabelStepWrote,
  whatTheLabelStepDid,
  type Report as CastingLabelsReport,
} from './casting-labels-migration.ts'
import {
  applyTheStagedRemint,
  describeTheRemint,
  describeTheStagedRemint,
  readTheStagedRemint,
  rowsTheRemintWrote,
  stageTheRemint,
  theGapsInTheLedger,
  whatTheRemintDid,
  type Report as RemintReport,
  type StagedRemint,
} from './remint-migration.ts'

// ------------------------------------------------------------------ WINDOW B'S SIX IN-PLACE STEPS
//
// They lived in `design/round-ten/migrations/` from the wave that wrote each one until this commit,
// and being unregistered was the whole of what made them safe to write while the owner's server was
// running. This is the commit that registers them, and it is the one that takes the owner's server down —
// see the block above `migrateInPlace` for the ordering, which is nine registered steps out of six
// files because three of the files are ordered apart.
import {
  describeAgentDispatch,
  describeAgentIdentities,
  describeSessionRuntime,
  countDispatchBackfill,
  countIdentities,
  countSessionRuntime,
  migrateAgentDispatch,
  migrateAgentIdentities,
  migrateSessionRuntime,
  type DispatchReport,
  type IdentitiesReport,
  type RuntimeReport,
} from './agent-identity.ts'
import {
  countAnnotationState,
  countDispatch,
  describeActOne,
  describeActTwo,
  migrateAnnotationStateActOne,
  migrateAnnotationStateActTwo,
  readTheStoredWords,
  type ActOneReport,
  type ActTwoReport,
} from './annotation-state.ts'
import {
  describeBlockIdentity,
  migrateBlockIdentity,
  planBlockIdentity,
  type BlockIdentityReport,
} from './block-identity.ts'
import {
  countOldShapes,
  describeContextsToRegions,
  migrateContextsToRegions,
  type Report as RegionsReport,
} from './contexts-to-regions.ts'
import {
  countModuleClaims,
  describeModuleClaims,
  migrateModuleClaims,
  type Report as ModuleClaimsReport,
} from './module-claims.ts'
import {
  describeMeasureWords,
  migrateMeasureWords,
  type Report as MeasureWordsReport,
} from './measure-words.ts'
import {
  countReachShapes,
  describeReviewsReach,
  migrateReviewsReach,
  type Report as ReviewsReachReport,
} from './reviews-reach.ts'

/**
 * Where this checkout's migrations live, worked out from the checkout and not from the working directory, so a server
 * started anywhere finds them (problem 59N5YwzEE-CB). Also the default for the script.
 */
export const MIGRATIONS_FOLDER = THE_MIGRATIONS_FOLDER  // declared in src/config/settings.mjs

/**
 * The tables whose contents cannot be rebuilt from anything else, and are therefore worth counting.
 *
 * READ FROM THE SCHEMA, NEVER WRITTEN OUT HERE. It said `['records', 'links', 'changes']` from the
 * day this file was written until 2026-08-12, and by then the database had twelve authored tables.
 * The cost was measured on a database holding a fortnight of planning and no records at all:
 * `irreplaceableRows` answered 0, `everyRecordCameFromTheSeed` answered false, and `prepareToServe`
 * therefore said SERVE — so a pending migration ran against somebody's plan in place, unattended, on
 * a `tsx watch` restart. That is the exact hazard the header above spends forty lines protecting
 * `records` from, walked straight past because the list of what counts as work was a copy.
 *
 * The derived tables are deliberately absent, and that is what `IRREPLACEABLE_TABLES` means:
 * `source_files` and its neighbours are rebuilt wholesale by a scan, so a drop in one of them is a
 * stale index and not lost work. `workspaces` is absent too, for the different reason
 * `MIGRATION_DECLARED_TABLES` gives — the migration writes that row itself, so counting it would
 * make every fresh clone look like a corpus.
 *
 * ABSENT FROM THE REFUSAL IS NOT ABSENT FROM THE REPORT, and those were the same thing until
 * 25 August 2026. `describeOutcome` prints every table in the file, and the ones missing from this
 * list are printed under a sentence saying so with their counts beside them. Keeping them out of
 * the refusal is still right: a scan rebuilds a derived table, a prune of a measured table is
 * legitimate (see `MEASURED_TABLES` in db/table-name-lists.ts, which says exactly that), and a migration
 * writes the `workspaces` row itself. Keeping them out of the report was not.
 */
export const COUNTED_TABLES = irreplaceableTablesWithParts()
export type CountedTable = (typeof COUNTED_TABLES)[number]

/**
 * THE TABLES THE GUARDS IN THIS FILE COUNT: `COUNTED_TABLES`, and the one table of authored work the schema no
 * longer declares.
 *
 * `planning_drafts` left db/schema.ts with migration 0196, which moves every draft into a plan. But a database that
 * has not had 0196 still holds its drafts there, and so does one where the move refused a draft (see
 * ./drafts-into-plans-migration.ts). Somebody wrote those words and they exist nowhere else, so a database holding
 * only drafts must not read as holding nothing, and a run that lost one must be refused. Read from the step's own
 * constant rather than typed again.
 */
const GUARDED_TABLES: readonly string[] = [...COUNTED_TABLES, DRAFTS_TABLE]

/**
 * HOW MANY ROWS `planning_drafts` MAY HAVE LOST IN ONE RUN: exactly the drafts the move put into plans, and no more.
 *
 * The table is expected to hold what it held before minus those, and a table the move dropped holds nothing. Any
 * other number is a loss, said in the words `whatShrank` uses. Null when the table did not exist before.
 */
function whatTheDraftsLost(outcome: Pick<MigrationOutcome, 'before' | 'after' | 'roughDrafts'>): string | null {
  const was = outcome.before[DRAFTS_TABLE]
  if (was === null || was === undefined) return null
  const now = outcome.after[DRAFTS_TABLE]
  const is = now === null || now === undefined ? (outcome.roughDrafts.tableDropped ? 0 : null) : now
  const expected = was - outcome.roughDrafts.moved.length
  if (is === null) return `${DRAFTS_TABLE} had ${String(was)} row(s) and the table is now gone, and the move did not drop it`
  if (is < expected) {
    return (
      `${DRAFTS_TABLE} went from ${String(was)} rows to ${String(is)}, and the move put only ` +
      `${String(outcome.roughDrafts.moved.length)} of them into plans, so ${String(expected)} were expected`
    )
  }
  return null
}

/**
 * How many rows a table holds, or null when the table is not there at all.
 *
 * Null rather than 0, because "this database has no records table yet" and "this database has a
 * records table and it is empty" are different facts, and only one of them means a migration is
 * about to create something. A fresh database answers null before and 0 after; treating that as a
 * loss would make every first run look like a disaster.
 */
export function countRows(sqlite: Database.Database, table: string): number | null {
  const exists = sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(table) as { name: string } | undefined
  if (exists === undefined) return null
  // Interpolated because SQLite takes no bound parameter in a table position. The name comes from
  // COUNTED_TABLES above, from `tablesInFile` below — which is the database's own list of its own
  // tables — or from a test that wrote it out by hand. There is no path from a request into this
  // argument. A quote character inside a table name would end the quoting early, so it is doubled,
  // which is how SQLite escapes one; that is not hypothetical hardening but the price of reading
  // the name out of whatever file the operator pointed MOLE_OFFICE_DB at.
  const row = sqlite.prepare(`SELECT count(*) AS n FROM "${table.replaceAll('"', '""')}"`).get() as { n: number }
  return row.n
}

/**
 * Every table this database has, as SQLite itself lists them, in name order.
 *
 * READ FROM THE FILE AND NEVER FROM A LIST, because the whole point of it is to cover the tables no
 * list in this repository remembers. A table added by a migration that nobody declared in
 * db/schema.ts is counted here on the day it arrives.
 *
 * SQLite's own bookkeeping tables are left out — they are the `sqlite_%` names, and their contents
 * are not rows anybody wrote. `__drizzle_migrations` is not one of those and IS counted like any
 * other table: the row it gains is how a reader sees that a migration landed at all.
 */
export function tablesInFile(sqlite: Database.Database): string[] {
  const rows = sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all() as { name: string }[]
  return rows.map((row) => row.name)
}

/**
 * Every table, before or after. Null means the table did not exist at that moment.
 *
 * EVERY TABLE IN THE FILE, not every counted one — that changed on 25 August 2026 and the header
 * says what it cost. The counted tables are guaranteed to have a key here even when the table is
 * missing, which is what lets the report print `no table` for one instead of silently dropping it.
 */
export type RowCounts = Record<CountedTable, number | null> & Record<string, number | null>

function countAll(sqlite: Database.Database): RowCounts {
  const counts = {} as RowCounts
  // The counted tables by name FIRST, so one that does not exist yet still gets a key and still
  // appears in the report as `no table`. Then everything the file actually holds.
  for (const table of COUNTED_TABLES) counts[table] = countRows(sqlite, table)
  for (const table of tablesInFile(sqlite)) counts[table] = countRows(sqlite, table)
  return counts
}

/**
 * What one table lost between two counts, in words, or null when it lost nothing.
 *
 * ONE RULE IN ONE PLACE. The refusal in `migrateInPlace` and the report in `describeOutcome` both
 * ask this. They ask it about different tables — the refusal about `COUNTED_TABLES`, the report
 * about everything else — and they must not answer it differently, because a reader comparing the
 * two sentences would be reading two definitions of "lost a row".
 *
 * A TABLE THAT DID NOT EXIST BEFORE LOST NOTHING, whatever it holds now. That is the fresh-install
 * case and the new-table case, and treating either as a loss would make every first run a disaster.
 */
export function whatShrank(table: string, was: number | null | undefined, is: number | null | undefined): string | null {
  if (was === null || was === undefined) return null
  const rows = `${was} row${was === 1 ? '' : 's'}`
  if (is === null || is === undefined) return `${table} had ${rows} and the table is now gone`
  if (is < was) return `${table} went from ${rows} to ${is}`
  return null
}

/**
 * THE ROWS A MIGRATION IS DECLARED TO REMOVE, and the exact check that keeps the exception honest.
 *
 * The guard in `migrateInPlace` says no counted table may shrink. A rebuild may remove rows the
 * owner has accepted removing ON THE RECORD, and a silent waiver would be the thing worse than the
 * loss — so the exception names the rows it removes and the guard measures them: the table's count
 * afterwards must be exactly its count before minus the rows of the named shape as this database
 * held them before anything ran. Any smaller number is still a loss and is still refused, named.
 *
 * THREE REMOVALS ARE DECLARED, each counted before the first migration runs and each checked exactly:
 *
 *   1. Migration 0155 rebuilds `session_resources` without the lease column, since a decision withdrew
 *      the resource-lease design, and the lease rows go with it. The secretary
 *      confirmed the row data goes with the column, and every lease row held only its own JSON
 *      history. The count is of rows of type `lease`, by this function. On a database
 *      that has already had 0155 there is no lease column, so the count is zero and the guard compares
 *      the whole table exactly as it would without this exception.
 *   2. The rough drafts: a draft leaves `planning_drafts` only by becoming a plan in the same
 *      transaction (`whatTheDraftsLost` above).
 *   3. Migration 0278 folds `conversation_reads` to the newest read of each reader in each
 *      conversation in each project (`olderReadsTheFoldRemoves` below).
 */
export function rowsADeclaredRemovalTakes(sqlite: Database.Database): number {
  const column = sqlite
    .prepare("SELECT name FROM pragma_table_info('session_resources') WHERE name = 'lease'")
    .get() as { name: string } | undefined
  if (column === undefined) return 0
  return (sqlite.prepare("SELECT count(*) AS n FROM session_resources WHERE type = 'lease'").get() as { n: number }).n
}

/**
 * THE OLDER READS MIGRATION 0278 REMOVES, the third declared removal: the rows of `conversation_reads` less its keys.
 *
 * An answer agreed to point 8 of proposal `QqSufLCLIH50`. It was recorded as a decision
 * that a reader keeps only the newest of its reads of a conversation.
 * A key is the project, the reader's kind, the reader's id and the conversation, the four columns of 0278's DELETE
 * and of its unique index. 0278 keeps one row of each key, so what it removes is the rows less the keys.
 *
 * Counted before anything runs, and only while 0278's index is missing. A database that has had 0278 holds one row
 * per key, and a database with no table yet holds none, so both count zero, and then the guard compares the whole
 * table exactly as it would without this exception.
 */
export function olderReadsTheFoldRemoves(sqlite: Database.Database): number {
  const table = sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'conversation_reads'").get()
  if (table === undefined) return 0
  const folded = sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'conversation_reads_one_per_reader_idx'")
    .get()
  if (folded !== undefined) return 0
  return (
    sqlite
      .prepare(
        'SELECT (SELECT count(*) FROM conversation_reads) - (SELECT count(*) FROM (SELECT 1 FROM conversation_reads ' +
          'GROUP BY workspace_id, reader_kind, reader_id, pair)) AS n',
      )
      .get() as { n: number }
  ).n
}

/** What one run of the migrations did. */
export interface MigrationOutcome {
  /** The database file that was migrated, as SQLite knows it. */
  file: string
  /** When it finished, in local wall-clock time. Written by shared/time.ts and nothing else. */
  at: string
  before: RowCounts
  after: RowCounts
  /**
   * How many migrations were already in the journal when this started. Zero on a database that has
   * never been migrated; on a second run of the same command it is all of them, which is what makes
   * that run a no-op.
   */
  alreadyApplied: number
  /** Migration files applied by THIS run. Zero on a second run, and that is the success case. */
  newlyApplied: number
  /**
   * HOW LONG THIS RUN HELD THE DATABASE'S WRITE LOCK, in milliseconds. A live server writing to the same file waits
   * this long at most, and a server write that waits past its own busy timeout fails. Measured, not estimated.
   */
  heldTheWriteLockMs: number
  /**
   * HOW MANY CHANGE ROWS WERE GIVEN THEIR PLACE IN THE APPEND ORDER. Migration 0194, problem
   * BhszTJsVC8rF. See ./append-order-migration.ts. Zero on every run after the first.
   */
  appendOrder: number
  /**
   * What the block migration did, which is a DATA migration rather than a schema one.
   *
   * It has no journal row and cannot have one: it decides what to do by looking at the data, and on
   * a database where every pipeline already stores `blockIds` it plans nothing and writes nothing.
   * That is what makes it safe to run twice, and it is why it lives here rather than in drizzle/ —
   * a `.sql` file cannot parse a JSON column, cannot resolve a module title, and above all cannot
   * REFUSE with a sentence naming what it will not guess at.
   */
  blocks: BlockMigrationReport
  /**
   * What the origin stamp did. A DATA migration, for the same reasons the block one is.
   *
   * It writes `records.origin` from a measurement its caller hands it and leaves every row it has
   * no measurement of alone. This command hands it none, so on every database here it writes
   * nothing and reports every unstamped row as unmeasured. Runs after 0005 has added the column,
   * and after the block migration, so blocks that migration created are among the rows it looks at.
   */
  origin: OriginMigrationReport
  /**
   * What the `task.blocked_by` move did. A DATA migration, and one that rewrites `records.data`.
   *
   * Named as an exception under decision 13 in its own header, which also says which two keys it
   * touches and which it leaves alone.
   */
  blockedBy: BlockedByMigrationReport
  /**
   * What the workspace boundary did. A DATA migration, for the same reasons the other three are,
   * and the only one that INSERTS into a table 0006 has just created.
   *
   * It runs LAST of the four because it reads the workspace of every record and then copies that
   * value onto the rows that name one — the change log, the links, the intent rows. Anything that
   * creates a record has to have finished first, or the rows it created would be behind no
   * boundary: the block migration creates block records, and blocks belong to their pipeline's
   * project.
   *
   * IT IS NO LONGER THE LAST ONE TO RUN. The revision backfill below comes after it; see there.
   */
  workspaces: WorkspaceMigrationReport
  /**
   * What the participants step did: the owner's own row, one registry row per durable agent, and the
   * mapping from each `agent` record to the row it is.
   *
   * A DATA MIGRATION for the two reasons its own header gives — a local wall-clock stamp, which a
   * `.sql` file cannot write, and a refusal with a sentence for an agent record whose handle nothing
   * can use. It writes into four tables migration 0114 has just created, and it rewrites no stored
   * value anywhere: every record of kind `agent` comes out of it holding exactly what it held.
   */
  pixelScale: number
  participants: ParticipantsMigrationReport
  /**
   * What the messages step did: the sender written onto every message already here, and delivery rows
   * for a message that has none: an owner row for a message that names nobody, and queued rows to the
   * recipients a message names.
   */
  messageDelivery: MessageDeliveryReport
  /**
   * What the citizens step did: the home world written onto every person and agent in the two
   * registries, and the one row saying which installation this database belongs to.
   *
   * A DATA MIGRATION because a world's identity is a hash of the database FILE — its path and its
   * creation time — and SQL cannot read the file it is running inside. It rewrites no stored value:
   * every UPDATE is `WHERE home_world IS NULL`, and `citizen_since` is copied from the row's own
   * `created_at` rather than stamped with the clock the migration ran on.
   */
  citizenship: CitizenshipMigrationReport
  /**
   * WHAT THE STEP FOR THE SECRETARY'S RUNS DID. Problem 7zhliUpNgKPx.
   *
   * It writes `needsNoCheck`, as the office, on each run the office filed for a secretary's
   * design/-only merge entry before it wrote that field, found through the entry. A DATA migration
   * because the revision it writes carries a content hash, which SQL cannot compute.
   */
  secretaryRuns: SecretaryRunsReport
  /**
   * WHAT THE MOVE INTO THE MESSAGE CENTRE DID. Problem cxRB633r_N37.
   *
   * It writes the message centre's registry row, moves every message still filed in a project into it, keeping that
   * project as the mark `data.writtenIn`, and refiles every link with a message at one end. A DATA migration because the
   * revision it writes for each message carries a content hash, which SQL cannot compute. It deletes nothing.
   */
  messageCentre: MessageCentreReport
  /**
   * WHAT THE MOVE OF THE ROUGH DRAFTS INTO PLANS DID. Migration 0196, problem k5FNfdgfxbt2, at
   * item 6 of a decision. Each draft moved, the plan id it got, its
   * line count, each id that had to be mapped, and each draft refused with why.
   * See ./drafts-into-plans-migration.ts.
   */
  roughDrafts: DraftMoveReport
  /**
   * WHAT THE MOVE OF THE TOOL USES DID. Migration 0231, wave 13s round 33, problem mR8vNPOVNQ_p. Each run whose
   * `data.toolUses` was moved into `tool_uses`, how many lines it held, and the rows written there, counted after.
   * A DATA migration because the revision it writes for each run carries a content hash, which SQL cannot compute.
   * See ./tool-uses-migration.ts.
   */
  toolUses: ToolUseMoveReport
  /**
   * WHAT THE WITHDRAWAL OF A SENT REVIEW'S WAITING RUNS DID. Migration 0253, in wave 13u round
   * 19.
   * Whether this run applied 0253, the runs set to `withdrawn`, and the keys revoked. A DATA migration because a
   * migration file may hold no UPDATE, and because it must run only in the run that applies 0253. See
   * ./withdraw-review-runs-migration.ts.
   */
  reviewRunsWithdrawn: WithdrawnReviewRunsReport
  /**
   * WHAT THE TELLING OF THE KINDS BESIDE FOUR IDS DID. Migration 0311, wave 13s round 155. Whether this run applied
   * 0311, and for each of the four columns how many rows were told `person`, how many `agent` and how many were left
   * untold. A DATA migration because a migration file may hold no UPDATE, and because it must run only in the run that
   * applies 0311. See ./kinds-beside-ids-migration.ts.
   */
  kindsBesideIds: KindsBesideIdsReport
  /** The old agent starters copied when the ownership column was added. */
  agentOwners: AgentOwnersReport
  /**
   * WHAT THE SETTING OF THE CASTING WORK GROUPS DID. Migration 0318. Whether this run applied 0318,
   * and how many Casting rows were set to hard and to simple from the roll's old list, with one history row each. A
   * DATA migration because a migration file may hold no UPDATE, and because it must run only in the run that applies
   * 0318. See ./casting-work-groups-migration.ts.
   */
  castingWorkGroups: CastingWorkGroupsReport
  /**
   * WHAT THE MAKING OF THE FIRST CASTING LABELS DID. Migration 0349. Whether this run applied 0349, how many labels it
   * made from the work groups the rows are in, and how many rows it gave the hard and the simple label, with one history
   * row for each label and each row. A DATA migration because a migration file may hold no UPDATE, and because it must
   * run only in the run that applies 0349. See ./casting-labels-migration.ts.
   */
  castingLabels: CastingLabelsReport
  /**
   * WHAT THE RE-MINT DID. Migration 0313, wave 13s round 158. Given no staged map, nothing. Given one, the agents that
   * took a new id, the key rows rewritten in each column, the aliases filed and the generation row, or that the store
   * had already applied it. A DATA migration because it rewrites ids, and it runs only when the command is given
   * `--remint <file>`. See ./remint-migration.ts.
   */
  remint: RemintReport
  /**
   * WHAT THE SEAL REWRITE DID. Criterion C34, migration 0154's data half.
   *
   * A DATA MIGRATION because a seal's hash is sha256 of its own content and SQLite cannot compute
   * one: a seal rewritten in SQL would have carried a hash of content it no longer held, and
   * `readRunSeal` refuses exactly that. It keeps every pointer and every hash an old seal had, keeps
   * the whole-seal hash it had before under `reduced.was`, and drops the copied rows. It deletes no
   * revision: every row a pointer names is still in `revisions`.
   */
  sealPointers: SealRewriteReport
  /**
   * What the revision ledger's backfill did. A DATA migration, for the same reasons the other four
   * are, and the second one that INSERTS into a table a migration has just created.
   *
   * It gives every record with no revision its first one, holding what that record contains at the
   * moment the migration runs, marked `baseline` and saying on the row itself that it is NOT the
   * record as created — because what these records held earlier was never stored anywhere.
   *
   * IT RUNS LAST OF THE FIVE, and that is a fact about what it reads rather than a preference. Every
   * other data migration changes what a record holds, and one of them creates records: a baseline
   * taken before any of them would hold content the record no longer has, and one taken before the
   * block migration would miss the block records altogether.
   */
  revisions: RevisionBackfillReport
  /**
   * What the move of `agent_messages.context` into the round-eight shape did. A DATA migration, for
   * the same reasons the other five are, and the only one that writes a table other than `records`.
   *
   * It runs AFTER the revision backfill and that is a fact about what it reads rather than a
   * preference: it touches no record and no revision, so nothing above it can change what it sees,
   * and putting it last keeps the five that reason about records in one unbroken run.
   */
  contexts: ContextMigrationReport
  /**
   * What the move of round seven's review-mode conversations into `reviews` did. A DATA migration,
   * for the same reasons the other six are, and the second one that writes a table other than
   * `records`.
   *
   * It runs LAST, after the contexts have been moved into the round-eight shape, and that is a fact
   * about what it reads rather than a preference: it takes each review's entry from the first
   * comment that says what it points at, and a comment still in round seven's shape says that in a
   * way this cannot read. Running it first would leave every brought-forward review without an
   * entry, which is the one thing it refuses to guess at.
   */
  reviews: ReviewMigrationReport

  // ------------------------------------------------------- WINDOW B, in `migrateInPlace`'s order
  //
  // NINE FIELDS OUT OF SIX FILES, because three of the files are ordered apart. Each one is here
  // for the reason the block above `migrateInPlace` gives for its position, and each one has its
  // line in `THE_STEPS` below — which is what `previewMigration`, `describeOutcome` and the
  // quiet-start sentence are all built from, so a step and the sentence naming it cannot come apart.

  /**
   * The durable agent identities minted from the runs something in this corpus addressed.
   *
   * Runs ABOVE `migrateOrigins`, because it CREATES records and the stamp has to see them. It
   * writes `origin = 'authored'` itself, so the stamp finds them stamped and leaves them alone.
   */
  agentIdentities: IdentitiesReport
  /**
   * `session.data.agent` renamed to `session.data.runtime`, on every record holding it.
   *
   * Runs ABOVE `migrateRevisions`, which is one of window B's two options for a step that rewrites
   * `records.data`; the catch-up act of that pass writes the revision each renamed record needs, in
   * this same run. Below it, 92 of the owner's records would be left unwritable behind a 409.
   */
  sessionRuntime: RuntimeReport
  /**
   * `annotation.data.state` taken off every comment. Act one of two, and they are ordered apart.
   *
   * Runs ABOVE `migrateRevisions` for the same reason, and it also restamps as it goes, so it holds
   * whichever end of the rule you read it by.
   */
  annotationStateKey: ActOneReport
  /**
   * Every block's title, with its pipeline's name taken off it. It restamps its own revisions.
   *
   * Runs before `migrateWorkspaces`, which reads the workspace of every record and copies it onto
   * everything that names one.
   */
  blockIdentity: BlockIdentityReport
  /**
   * `annotation_words_fixed`: one marker per comment whose own word said its words had gone out and
   * which nothing else accounts for. Act two of two.
   *
   * Runs BELOW `migrateReviews` because it reads `agent_messages`, and ABOVE the dispatch backfill
   * because that step writes the table this one reads. It writes no `records.data`, so the ledger
   * rule does not reach it.
   */
  annotationMarkers: ActTwoReport
  /**
   * `agent_messages` and `agent_runs`: the moment each dispatch was accepted, and which durable
   * identity it went to. Act C of the agent thread.
   *
   * Runs after the marker act, for the reason that act's field gives. It rewrites the `data` of
   * every comment it moves from a run to an identity, and RESTAMPS each one, because it is below
   * `migrateRevisions`.
   */
  agentDispatch: DispatchReport
  /**
   * `module.data.claims` emptied into `implementation_map` rows. It restamps its own revisions.
   *
   * IT REFUSES A PROJECT THAT HOLDS NO REPOSITORY, and that refusal reaches the boot: which
   * repository a claim written before repositories existed is relative to is a fact about a machine
   * and not a fact in the database. See `describeModuleClaims` and the header of ./module-claims.ts.
   */
  moduleClaims: ModuleClaimsReport
  /** Every review saying how wide it is, then the partial unique index that only then means anything. */
  reviewsReach: ReviewsReachReport
  /**
   * Round nine's place backfill, and `reportBlock` targets converted to regions.
   *
   * LAST, because it reads what `migrateContexts` and `migrateReviews` wrote. It cannot move above
   * `migrateRevisions`, so the restamp is not optional for it and it takes that option.
   */
  regions: RegionsReport
  /**
   * The stored reading-measure words renamed, once: `narrow` to `narrowest`, then `readable` to
   * `narrow`, in every block and every part of a composition. It restamps its own revisions,
   * because it runs below `migrateRevisions`.
   *
   * IT RUNS ONCE, BECAUSE A STORED `narrow` CANNOT SAY WHICH NAME IT WAS WRITTEN UNDER. It writes
   * the one row of `measure_words_renamed` in the same transaction, and skips when the row is
   * there. See the header of ./measure-words.ts.
   */
  measureWords: MeasureWordsReport
}

/**
 * Refuse to migrate a database whose tables were made outside the migration system.
 *
 * The check is narrow on purpose: a database with `records` in it but no `__drizzle_migrations` is
 * the one case where drizzle's own error is misleading. Everything else is left to drizzle, whose
 * messages for a genuinely broken migration are already about the migration.
 */
function checkJournal(sqlite: Database.Database, file: string): void {
  const table = (name: string): boolean =>
    sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(name) !== undefined
  if (!table('records')) return
  if (table(THE_MIGRATION_JOURNAL_TABLE)) return
  throw new Error(
    `${file} has a "records" table but no migration journal, so drizzle believes none of the migrations ` +
      'have ever run and would start again at 0000 — whose CREATE TABLE statements are bare, so it would ' +
      'stop on "table records already exists" and nothing would say why. This database was built by ' +
      'something other than `npm run db:migrate`. NOTHING HAS BEEN CHANGED here, and nothing will be: ' +
      'writing a journal row on this database\'s behalf would mean guessing which migrations its tables ' +
      'came from, and a wrong guess there loses data on the NEXT migration rather than on this one. Migrate ' +
      'a copy that came from a migrated database, or rebuild this one with `npm run db:reset` — which ' +
      'deletes the file, so do not run it on anything you want to keep.',
  )
}

/**
 * TAKE THE DATABASE'S WRITE LOCK BEFORE ANYTHING IS READ, or say that nothing was done.
 *
 * `BEGIN IMMEDIATE` waits for the lock for as long as the connection's busy timeout and then holds it. A plain
 * `BEGIN` takes it only at the first write, and if another connection committed after this one began reading,
 * SQLite refuses that write at once with "database is locked": the busy timeout does not wait for that case.
 * That refusal is what stopped aKWEE_-0OCN2 landing ten times on 10 October 2026 while the office wrote.
 */
function takeTheWriteLock(sqlite: Database.Database, file: string): void {
  try {
    sqlite.exec('BEGIN IMMEDIATE')
  } catch (busy) {
    const said = busy instanceof Error ? busy.message : String(busy)
    const waited = Number(sqlite.pragma('busy_timeout', { simple: true }))
    throw new Error(
      `${said}\n\nNOTHING WAS WRITTEN. No schema migration and no data step ran on ${file}: another connection ` +
        `held its write lock for longer than this command waits, which is ${String(waited)} ms. Run this again.`,
      { cause: busy },
    )
  }
}

/** Every row of the journal table, which `theMigrationsNotYetApplied` decides from. */
function theJournalRows(sqlite: Database.Database): { hash: string; created_at: number | string }[] {
  return sqlite.prepare(`SELECT hash, created_at FROM "${THE_MIGRATION_JOURNAL_TABLE}"`).all() as {
    hash: string
    created_at: number | string
  }[]
}

/**
 * THE SCHEMA MIGRATIONS, INSIDE THE CALLER'S TRANSACTION, on a file whose journal table drizzle has already made.
 *
 * Applies each migration `theMigrationsNotYetApplied` names, in index order: its statements one by one, then one
 * row with its hash and `when`, the same row drizzle-orm 0.45 writes. Drizzle's own function decides by date and
 * opens its own transaction, so it cannot run inside this command's one; that is why this exists.
 */
function applyTheSchemaMigrations(sqlite: Database.Database, migrations: FolderMigration[]): string[] {
  const journal = sqlite.prepare(`INSERT INTO "${THE_MIGRATION_JOURNAL_TABLE}" ("hash", "created_at") VALUES (?, ?)`)
  const applied: string[] = []
  for (const migration of theMigrationsNotYetApplied(theJournalRows(sqlite), migrations)) {
    for (const statement of migration.sql) sqlite.prepare(statement).run()
    journal.run(migration.hash, migration.when)
    applied.push(migration.tag)
  }
  return applied
}

/**
 * Apply every pending migration to an already-open connection, and report what happened.
 *
 * Takes the connection rather than opening one, so the caller decides which database this is. The
 * drizzle wrapper is built here from that same connection, which means the counts and the
 * migrations cannot end up describing two different files.
 */
/**
 * WHAT THE ONE DATA TRANSACTION HANDS BACK: every step's own report, and nothing else.
 *
 * DERIVED FROM `MigrationOutcome` RATHER THAN TYPED OUT AGAIN. A step added to that interface is a
 * step this type requires, so a new migration cannot be run outside the transaction and still
 * compile. The seven fields taken off are the ones the command works out around the transaction — the
 * file, the moment, the two row counts, the two journal numbers and how long it held the write lock.
 *
 * `reviewsBroughtForward` is the local name the step has always had; `reviews` is what the outcome
 * calls it. Renamed here rather than at the return, so the mapping is written once.
 */
type DataSteps = Omit<MigrationOutcome, keyof AroundTheSteps | 'reviews'> & {
  reviewsBroughtForward: MigrationOutcome['reviews']
}

/** The seven fields of an outcome worked out around the transaction rather than by a step in it. */
type AroundTheSteps = Pick<
  MigrationOutcome,
  'file' | 'at' | 'before' | 'after' | 'alreadyApplied' | 'newlyApplied' | 'heldTheWriteLockMs'
>

/**
 * EVERY PART OF THE MIGRATIONS CHECK THE SECOND START LINE MAY NAME, in words that hold no path.
 *
 * The data steps are named from `THE_STEPS` instead, because that table is already the one place a step's name lives.
 * This table exists so tests can read the other parts' words rather than copying them.
 */
export const THE_MIGRATIONS_CHECK_PARTS = {
  theStrangerCheck: "looking for a stranger's tables",
  whatTheFileHolds: 'deciding whether the file holds work',
  theFileIsIntact: 'checking the file is intact',
  theFileMigratedInPlace: 'migrating the file in place',
  theIntegrityStarted: 'starting the integrity check beside the preview',
  thePendingRead: 'reading which migrations are pending',
  theLeftoversRemoved: 'removing copies an earlier preview left',
  theStepsRolledBack: 'running the data steps on the file and rolling them back',
  theFileCopied: 'copying the file',
  theCopyHeldInMemory: 'copying into memory',
  theJournalModeSet: "setting the copy's journal mode",
  theJournalModeSetBack: "setting the copy's journal mode back",
  theFirstFingerprint: 'taking the first fingerprint',
  theCopyMigrated: 'migrating the copy',
  theSecondFingerprint: 'taking the second fingerprint',
  theOutcomeReports: 'working out what the outcome reports',
  theCopyFolderDeleted: "deleting the copy's folder",
  theLogFoldedIn: 'folding the write-ahead log in',
  theIntegrityWaitedBeforeFolding: 'waiting for the integrity check before folding the log',
  theIntegrityWaited: 'waiting for the integrity check',
  theJournalChecked: 'checking the migration journal',
  theStartRead: 'reading the start',
  theWriteLockTaken: 'taking the write lock',
  theSchemaBuiltOnAnEmptyFile: 'building the schema on an empty file',
  theSchemaMigrationsApplied: 'applying the schema migrations',
} as const

/**
 * SAY THAT A PART BEGAN, OR ENDED, WITHOUT PUTTING A FRAME OF ITS OWN AROUND THE WORK.
 *
 * These are called before and after the part, never around it, so a step that throws leaves exactly the stack it left
 * before timing existed: the refusal's trace is part of its text and must not change. A part whose `endPart` never runs
 * is a part that did not end, and the line says so.
 *
 * TIMING IS NEVER AN INPUT. A recorder that throws is dropped and the part runs exactly as it would have.
 */
function beginPart(timing: MigrationsCheckTiming | null | undefined, part: string | undefined): void {
  if (timing === null || timing === undefined || part === undefined) return
  try {
    timing.began(part)
  } catch {
    // A timing failure never changes what this does or says.
  }
}

function endPart(timing: MigrationsCheckTiming | null | undefined, part: string | undefined): void {
  if (timing === null || timing === undefined || part === undefined) return
  try {
    timing.ended(part)
  } catch {
    // A timing failure never changes what this does or says.
  }
}

/** The name `THE_STEPS` gives a step's field, or undefined when the field is not a step. */
function theStepName(field: keyof MigrationOutcome): string | undefined {
  return THE_STEPS.find((step) => step.field === field)?.name
}

/** Say a fact about the whole check. A recorder that throws changes nothing. */
function sayPart(timing: MigrationsCheckTiming | null | undefined, said: string): void {
  if (timing === null || timing === undefined) return
  try {
    timing.note(said)
  } catch {
    // A timing failure never changes what this does or says.
  }
}

export function migrateInPlace(
  sqlite: Database.Database,
  migrationsFolder: string = MIGRATIONS_FOLDER,
  // A MAP --stage-remint WROTE, read by the caller before this runs. Null, which every caller but `--remint` gives,
  // and the re-mint reads and writes nothing.
  staged: StagedRemint | null = null,
  // OPTIONAL, AND A CALL WITHOUT IT IS UNCHANGED. It only records how long each part took; it changes no step.
  timing: MigrationsCheckTiming | null = null,
): MigrationOutcome {
  const file = sqlite.name
  beginPart(timing, THE_MIGRATIONS_CHECK_PARTS.theJournalChecked)
  checkJournal(sqlite, file)
  endPart(timing, THE_MIGRATIONS_CHECK_PARTS.theJournalChecked)

  const journalExists = (): boolean =>
    sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(THE_MIGRATION_JOURNAL_TABLE) !==
    undefined
  const journalRows = (): number => {
    if (!journalExists()) return 0
    return (sqlite.prepare(`SELECT count(*) AS n FROM ${THE_MIGRATION_JOURNAL_TABLE}`).get() as { n: number }).n
  }

  // Read before the lock is taken: reading the folder is not the database's time. A journal entry with no file, or
  // two entries with one index, is refused here, before anything is written.
  const migrations = theMigrationsInTheFolder(migrationsFolder)

  // ------------------------------------------------------------- THE WRITE LOCK FIRST, AND HELD TO THE END
  //
  // A LANDING MIGRATES THE LIVE DATABASE WHILE THE LIVE SERVER KEEPS WRITING TO IT. On 10 October 2026 merge entry
  // aKWEE_-0OCN2 failed to land ten times with "database is locked". The data steps ran in one DEFERRED transaction,
  // which reads first and takes the write lock only at its first write. When the server committed in between, SQLite
  // refused that upgrade at once, because the transaction's snapshot was no longer the newest, and a busy timeout
  // does not wait on that refusal. Reproduced in tests/a-landing-migrates-while-the-office-writes.test.ts.
  //
  // So this run takes the write lock BEFORE it reads anything (BEGIN IMMEDIATE), waiting for it at most this
  // connection's busy timeout, and holds it to the end. A writer waits on its busy timeout meanwhile, and the outcome
  // says how long it was held. Everything this run decides from is read under the lock: the counts before and after,
  // the journal, and the counts a refusal is compared with. No row another connection wrote can be blamed on it.
  //
  // A FILE WITH NO MIGRATION JOURNAL IS BUILT BY DRIZZLE ITSELF, before the lock, as it always was. checkJournal
  // above refused one that holds records, so this is an empty file that nothing serves yet, and drizzle's own
  // `migrate` is what makes its journal table: no table is created anywhere in src/ (tests/schema-inventory.test.ts).
  // A refusal after that keeps the schema drizzle built, and says so.
  const builtFromEmpty = !journalExists()
  // A FILE WITH NO JOURNAL HAS EVERY MIGRATION PENDING, and the re-mint runs alone (./remint-migration.ts). Refused
  // here, before drizzle builds anything, because drizzle builds it outside the transaction below.
  if (staged !== null && builtFromEmpty) {
    throw new Error(`${file} has no migration journal, so every migration is pending, and the re-mint runs alone. Run npm run db:migrate without --remint first. Nothing was written.`)
  }
  const readTheStart = (): { before: RowCounts; alreadyApplied: number; removedByDeclaredRemoval: number; olderReads: number } => {
    const start = {
      before: countAll(sqlite),
      alreadyApplied: journalRows(),
      // Counted BEFORE anything runs, because 0155 takes the lease rows and the column with them: this
      // is the number the loss guard below subtracts for `session_resources`, and after the migrations
      // there is no column left to count.
      removedByDeclaredRemoval: rowsADeclaredRemovalTakes(sqlite),
      // And the older reads 0278 removes, the number the guard subtracts for `conversation_reads`.
      olderReads: olderReadsTheFoldRemoves(sqlite),
    }
    // AN OFFICE THAT WOULD BE REFUSED AN OWNER IS REFUSED HERE, before any SQL migration changes it:
    // one that already holds work and says nobody owns it (src/server/db/owner-setting.ts).
    refuseAnOfficeWithNoOwnerToWrite(sqlite)
    return start
  }
  let start: ReturnType<typeof readTheStart> | null = null
  if (builtFromEmpty) {
    beginPart(timing, THE_MIGRATIONS_CHECK_PARTS.theStartRead)
    start = readTheStart()
    endPart(timing, THE_MIGRATIONS_CHECK_PARTS.theStartRead)
  }
  // drizzle decides by date, and on a file with no journal every migration is later than nothing, so it applies
  // them all, in the journal's order.
  if (builtFromEmpty) {
    beginPart(timing, THE_MIGRATIONS_CHECK_PARTS.theSchemaBuiltOnAnEmptyFile)
    migrate(drizzle(sqlite), { migrationsFolder })
    endPart(timing, THE_MIGRATIONS_CHECK_PARTS.theSchemaBuiltOnAnEmptyFile)
  }
  const lockedAt = Date.now()
  beginPart(timing, THE_MIGRATIONS_CHECK_PARTS.theWriteLockTaken)
  takeTheWriteLock(sqlite, file)
  endPart(timing, THE_MIGRATIONS_CHECK_PARTS.theWriteLockTaken)
  // Every way out before the COMMIT below lets the lock go with nothing written.
  const letGo = (): void => {
    if (sqlite.inTransaction) sqlite.exec('ROLLBACK')
  }
  if (start === null) {
    try {
      beginPart(timing, THE_MIGRATIONS_CHECK_PARTS.theStartRead)
      start = readTheStart()
      endPart(timing, THE_MIGRATIONS_CHECK_PARTS.theStartRead)
    } catch (refusal) {
      letGo()
      throw refusal
    }
  }
  const { before, alreadyApplied, removedByDeclaredRemoval, olderReads } = start

  // ------------------------------------------------------------------- ONE TRANSACTION, ALL OF THEM
  //
  // EVERY DATA STEP BELOW RUNS INSIDE THIS ONE TRANSACTION, so a step that refuses leaves the file
  // with the row counts it had. Until this existed each step was its own transaction and the ones
  // that had already finished stayed finished: an independent verifier ran this command against a
  // copy of the owner's corpus whose project held no repository, the module-claims step — the
  // fourteenth of sixteen — refused with "Nothing was written", and 362 rows had already been
  // committed by the thirteen above it. `changes` 2107 -> 2288, `revisions` 788 -> 969, and the
  // `records` and `agent_messages` digests had both moved.
  //
  // THAT SENTENCE IS WHAT AN OPERATOR READS WHILE DECIDING WHETHER TO RESTORE A BACKUP. It was true
  // of the step and false of the command, which is the fake success this repository's first
  // invariant forbids, in the one place where believing it costs a corpus.
  //
  // The nested `sqlite.transaction(...)` each step already opens becomes a SAVEPOINT inside this
  // one, which is better-sqlite3's own behaviour and is why no step had to change.
  //
  // THE STEPS THEMSELVES ARE IN `everyDataStepIn`, the one list of them, which a start with no migration pending also
  // runs on the served file and rolls back (`runTheStepsAndRollThemBack`).
  const everyDataStep = sqlite.transaction((): DataSteps => everyDataStepIn(sqlite, migrations, staged, timing))

  // THE REFUSAL IS RE-STATED WITH WHAT REALLY HAPPENED, and this is the other half of the repair.
  // Rolling back is not enough on its own: the step's own sentence says "Nothing was written",
  // and an operator reading it needs to know whether that is a statement about the step or about
  // the command. Now it is about the command, and the command says so in its own words.
  //
  // THE COUNTS ARE COMPARED WHILE THE WRITE LOCK IS STILL HELD, and only then is it let go. Compared after it, a
  // row the live server wrote in between was blamed on this command: on 10 October 2026 the fourth try of
  // aKWEE_-0OCN2 said "THE ROLLBACK DID NOT HOLD" over `records 55252 -> 55253` and four more tables, and every
  // one of those rows was the server's own.
  let steps: DataSteps
  try {
    steps = everyDataStep()
  } catch (refusal) {
    const said = refusal instanceof Error ? refusal.message : String(refusal)
    let now: RowCounts
    try {
      now = countAll(sqlite)
    } finally {
      letGo()
    }
    const moved = GUARDED_TABLES.filter((table) => now[table] !== before[table])
    if (moved.length > 0) {
      // Belt and braces. If this ever fires, the transaction did not hold and the sentence below
      // would be the lie this whole block exists to stop — so it names the tables instead.
      throw new Error(
        `${said}\n\nAND THE ROLLBACK DID NOT HOLD. ${moved
          .map((table) => `${table} ${String(before[table])} -> ${String(now[table])}`)
          .join(', ')}. This command is meant to leave ${file} with the row counts it had when a step ` +
          'refuses. It did not. Restore the file from a copy before running anything else against it.',
      )
    }
    throw new Error(
      `${said}\n\nNOTHING WAS WRITTEN BY ANY STEP OF THIS COMMAND, not only by the one that refused. The schema ` +
        `migrations and every data migration ran inside one transaction and all of it was rolled back, so ` +
        `${file} holds the schema and the rows it held before you ran this. ${builtFromEmpty ? "The one exception is the schema drizzle built on this empty file before that transaction began, which stays; it holds no rows. " : ''}Row counts are unchanged in all ` +
        `${String(COUNTED_TABLES.length)} counted tables; they were compared while this command still held the ` +
        `write lock, so no other writer's rows are in that comparison. THERE IS NO BACKUP TO RESTORE FROM: ` +
        'nothing was lost. Fix what the refusal above asks for and run this again.',
    )
  }

  // Counted under the lock, so `after - before` is this command's work and nobody else's. Then it commits.
  let after: RowCounts
  let newlyApplied: number
  try {
    after = countAll(sqlite)
    newlyApplied = journalRows() - alreadyApplied
    sqlite.exec('COMMIT')
  } catch (failure) {
    letGo()
    throw failure
  }
  const heldTheWriteLockMs = Date.now() - lockedAt

  /**
   * The one thing this command will not let past.
   *
   * NO MIGRATION HERE MAY LOSE A ROW, and that rule did not soften when decision 13 replaced "always
   * additive" with "a rewrite is a named exception". A migration that rewrites a value still hands
   * back every row it was given; one that rebuilds a table still puts every row back. So a table
   * that shrank means a migration did something nobody declared, whichever list it is on. Reporting
   * it after the fact is not a repair — the transaction is already committed — but it is the
   * difference between finding out now and finding out in a fortnight when somebody looks for a
   * record that is gone.
   */
  const lost: string[] = []
  for (const table of COUNTED_TABLES) {
    if (table === 'session_resources' && before[table] !== null && before[table] !== undefined) {
      // THE FIRST DECLARED REMOVAL. The lease rows went by a decision, and the honest check
      // is exact: what is left must be exactly what was here minus the lease rows counted before
      // anything ran. Anything below that is a loss with the shortfall named. A table that did not
      // exist before this run is not on this branch at all — it lost nothing, exactly as
      // `whatShrank` says for every other table.
      const expected = (before[table] as number) - removedByDeclaredRemoval
      const is = after[table]
      if (is === null || is === undefined) lost.push(`${table} is now gone`)
      else if (is < expected) {
        lost.push(
          `${table} went from ${String(before[table])} rows to ${String(is)}: ${String(removedByDeclaredRemoval)} ` +
            `lease rows were declared removed, so ${String(expected)} were expected, ` +
            'and the table holds fewer than that',
        )
      }
      continue
    }
    if (table === 'conversation_reads' && before[table] !== null && before[table] !== undefined) {
      // THE THIRD DECLARED REMOVAL, checked the same way: the table must hold exactly what it held less the older
      // reads counted before anything ran (`olderReadsTheFoldRemoves`). One row fewer is a loss, named.
      const expected = (before[table] as number) - olderReads
      const is = after[table]
      if (is === null || is === undefined) lost.push(`${table} is now gone`)
      else if (is < expected) {
        lost.push(
          `${table} went from ${String(before[table])} rows to ${String(is)}: ${String(olderReads)} older reads of a ` +
            `conversation were declared removed, so ${String(expected)} were expected, and the table holds fewer than that`,
        )
      }
      continue
    }
    const shrank = whatShrank(table, before[table], after[table])
    if (shrank !== null) lost.push(shrank)
  }
  // THE ROUGH DRAFTS, the second declared removal: a draft leaves `planning_drafts` only by becoming a plan in this
  // same transaction, and the table goes only when the move found it empty. See `whatTheDraftsLost`.
  const draftsLost = whatTheDraftsLost({ before, after, roughDrafts: steps.roughDrafts })
  if (draftsLost !== null) lost.push(draftsLost)
  if (lost.length > 0) {
    throw new Error(
      `The migrations have been applied to ${file} and they LOST ROWS: ${lost.join('; ')}. No migration in this ` +
        'project may lose a row: one that rewrites a value still hands back every row it was given, and one ' +
        'that rebuilds a table still puts every row back — see decision 13 and the DATA_MIGRATIONS and ' +
        'REBUILDS lists in tests/migration.test.ts. So this means a migration is doing something nobody ' +
        'declared. The change is already committed; restore the file from a copy before running anything ' +
        'else against it.',
    )
  }

  return theOutcomeOf({ file, at: nowStamp(), before, after, alreadyApplied, newlyApplied, heldTheWriteLockMs }, steps)
}

/**
 * EVERY DATA STEP, AND THE SCHEMA MIGRATIONS FIRST, IN ORDER, inside whatever transaction the caller holds open. This
 * is the one list of the steps: `migrateInPlace` runs it and commits, and a start with no migration pending runs it on
 * the served file and rolls it back (`runTheStepsAndRollThemBack`).
 */
function everyDataStepIn(
  sqlite: Database.Database,
  migrations: FolderMigration[],
  staged: StagedRemint | null,
  timing: MigrationsCheckTiming | null,
): DataSteps {
  /**
   * BEGIN AND END ONE DATA STEP UNDER ITS OWN NAME FROM `THE_STEPS`. They are called before and after the step, never
   * around it, so a step that throws leaves the stack it left before timing existed. A field the table does not name
   * is run untimed rather than given words typed here.
   */
  const beginStep = (field: keyof MigrationOutcome): void => beginPart(timing, theStepName(field))
  const endStep = (field: keyof MigrationOutcome): void => endPart(timing, theStepName(field))

  // THE SCHEMA MIGRATIONS ARE IN HERE TOO, since 10 October 2026. Before, drizzle's migrator applied and journaled them
  // in a transaction of its own, so a data step that refused left the schema half of a landing in the file without the
  // code that goes with it. Now a refusal leaves neither.

  // THE TAGS THIS RUN APPLIED, for the one step below that must run only in the run that applies its migration.
  beginPart(timing, THE_MIGRATIONS_CHECK_PARTS.theSchemaMigrationsApplied)
  const applied = applyTheSchemaMigrations(sqlite, migrations)
  endPart(timing, THE_MIGRATIONS_CHECK_PARTS.theSchemaMigrationsApplied)

  // FIRST, because the steps below may insert change rows, and migration 0194's trigger numbers each
  // new row after the highest number in the table. The rows already here take their numbers first.
  beginStep('appendOrder')
  const appendOrder = migrateAppendOrder(sqlite)
  endStep('appendOrder')

  // The DATA migration runs after the SCHEMA migrations, because it writes rows into tables that
  // 0003 may just have created. It is its own transaction and it refuses rather than half-applying;
  // a refusal throws here, before the counts are compared, and nothing it would have written exists.
  beginStep('blocks')
  const blocks = migrateBlocks(drizzle(sqlite), sqlite)
  endStep('blocks')

  // THE ORDER OF THE THREE DATA MIGRATIONS IS A FACT ABOUT WHAT THEY READ, not a preference.
  //
  // The block migration runs first because it CREATES records, and the origin stamp has to see the
  // corpus it is stamping. The origin stamp runs before the blocked_by move because the move
  // rewrites `records.data` and the stamp reads `id`, `kind` and `title` — so if that ever changed,
  // it would be this comment that was wrong rather than the behaviour that was surprising.
  // WINDOW B, STEP A — THE DURABLE IDENTITIES, and it is here rather than lower for the same reason
  // the block migration is first: it CREATES records, and the origin stamp below has to see the
  // corpus it is stamping. Without this position a minted agent would carry `origin` NULL and be
  // drawn as "Nobody said where this record came from" beside a summary saying exactly where it
  // came from. It writes `origin = 'authored'` itself as well, so the two are belt and braces.
  beginStep('agentIdentities')
  const agentIdentities = migrateAgentIdentities(sqlite, countIdentities(sqlite))
  endStep('agentIdentities')

  beginStep('origin')
  const origin = migrateOrigins(sqlite)
  endStep('origin')
  beginStep('blockedBy')
  const blockedBy = migrateBlockedBy(sqlite)
  endStep('blockedBy')

  // ------------------------------------------------------ THE THREE STEPS THAT MUST BE ABOVE THE
  // REVISION LEDGER, and being above it is the whole of how they keep it.
  //
  // `migrateRevisions` has TWO acts (./revision-backfill.ts): it writes baselines, and it CATCHES UP
  // every record whose newest revision no longer hashes to what the row holds. A step that rewrites
  // `records.data` therefore has two options and no third — run above that pass, or restamp itself.
  // Measured on a copy of the owner's corpus: with `data.state` removed from the owner's comments BELOW this
  // pass, the report said `caughtUp` and `prepareToServe` REFUSED TO SERVE. Above it, the catch-up
  // happens inside the same run and the boot afterwards serves.

  // WINDOW B, STEP B — `session.data.agent` becomes `session.data.runtime`. 92 records on the owner's
  // corpus, no value changed, and the catch-up revision each one needs is written below.
  beginStep('sessionRuntime')
  const sessionRuntime = migrateSessionRuntime(sqlite, countSessionRuntime(sqlite))
  endStep('sessionRuntime')

  // WINDOW B — THE ANNOTATION STATE KEY, act one of two.
  //
  // THE WORDS ARE READ HERE, BEFORE THE KEY IS TAKEN OFF, AND HANDED TO ACT TWO FURTHER DOWN. Act
  // two decides from the stored word; act one deletes it and restamps the one revision that held it.
  // On a corpus where any comment's word says its words went out and nothing else holds that fact,
  // act one REFUSES rather than running first — so this read is what lets the plan's ordering stand
  // at all. See the header of ./annotation-state.ts.
  const theStoredWords = readTheStoredWords(sqlite)
  beginStep('annotationStateKey')
  const annotationStateKey = migrateAnnotationStateActOne(sqlite, countAnnotationState(sqlite))
  endStep('annotationStateKey')

  // WINDOW B — THE BLOCK RETITLE, before `migrateWorkspaces` reads the workspace of every record.
  // It restamps its own revisions, so it holds the ledger rule by the other end.
  beginStep('blockIdentity')
  const blockIdentity = migrateBlockIdentity(sqlite, planBlockIdentity(sqlite).counts)
  endStep('blockIdentity')

  // LAST, because it reads the workspace of every record and copies it onto everything that names
  // one. Anything that CREATES a record has to have run already or the new rows would be behind no
  // boundary — the block migration above creates block records, and a block belongs to the project
  // its pipeline is in.
  beginStep('workspaces')
  const workspaces = migrateWorkspaces(sqlite)
  endStep('workspaces')

  // ABOVE THE LEDGER PASS, because it rewrites `records.data` of every seal that still holds
  // copies and the pass must take its baseline AFTER that rewrite, so the newest revision of a
  // rewritten seal is what the record now holds. Nothing above it writes a `sealed_tip`: seals
  // are written by the server when a run finishes, never by a migration. It is the data half of
  // migration 0154: the SQL half converted the baselines table and dropped `submission_events`
  // while that table was still there to read, and this half rewrites the seals, which needs
  // sha256 and therefore cannot be SQL.
  beginStep('sealPointers')
  const sealPointers = migrateSealCopiesToPointers(sqlite)
  endStep('sealPointers')

  // READ ONLY IN A --remint RUN, AND JUST BEFORE THE LEDGER PASS FILLS THEM: every record with no
  // revision, and every record whose newest revision does not hold what it holds. The re-mint at
  // the end refuses with them, so a --remint run that re-mints writes no catch-up or baseline
  // revision; one that finds the map already applied re-mints nothing and is a plain migrate. See
  // ./remint-migration.ts.
  const ledgerGaps = staged === null ? [] : theGapsInTheLedger(sqlite)

  // LAST OF ALL, because every migration above it changes what a record holds and one of them
  // creates records. A baseline revision claims to hold what the record contains, so it has to be
  // taken when nothing else is going to move afterwards.
  beginStep('revisions')
  const revisions = migrateRevisions(sqlite)
  endStep('revisions')

  // AFTER ALL OF THEM, and it reads none of what they wrote: it moves what a COMMENT points at into
  // the shape round eight stores, in `agent_messages` alone. See ./context-migration.ts.
  beginStep('contexts')
  const contexts = migrateContexts(sqlite)
  endStep('contexts')

  // LAST, AND AFTER THE CONTEXTS, because it reads what a comment points at to find where a review
  // was started from — and it can only read the round-eight shape the line above writes. See
  // ./review-migration.ts.
  beginStep('reviews')
  const reviewsBroughtForward = migrateReviews(sqlite)
  endStep('reviews')

  // ------------------------------------------------------------- THE REST OF WINDOW B, BELOW THE
  // LEDGER PASS, where each step that rewrites `records.data` RESTAMPS instead.

  // Act two of the annotation-state step. It reads `agent_messages` — which is why it is above the
  // dispatch backfill, whose whole job is writing that table — and it writes no `records.data`, so
  // the ledger rule does not reach it. The words it is given are the ones read above, before act one
  // took them off the records.
  beginStep('annotationMarkers')
  const annotationMarkers = migrateAnnotationStateActTwo(sqlite, theStoredWords, countDispatch(sqlite))
  endStep('annotationMarkers')

  // WINDOW B, STEP C — the moments and the recipients on `agent_messages`, and `agent_runs.agent_id`.
  beginStep('agentDispatch')
  const agentDispatch = migrateAgentDispatch(sqlite, countDispatchBackfill(sqlite))
  endStep('agentDispatch')

  // `module.data.claims` into `implementation_map`. It restamps its own 15 revisions.
  beginStep('moduleClaims')
  const moduleClaims = migrateModuleClaims(sqlite, countModuleClaims(sqlite))
  endStep('moduleClaims')

  // The reading-measure words, renamed once. It restamps the newest revision of each record it
  // rewrites, so it may sit anywhere below the ledger pass; it reads nothing another step writes.
  beginStep('measureWords')
  const measureWords = migrateMeasureWords(sqlite)
  endStep('measureWords')

  // Every review's `reach`, and THEN the partial unique index, so a corpus already holding two
  // project-wide reviews collecting fails loudly rather than being silently narrowed.
  beginStep('reviewsReach')
  const reviewsReach = migrateReviewsReach(sqlite, countReachShapes(sqlite))
  endStep('reviewsReach')

  // LAST OF ALL, because it reads what `migrateContexts` and `migrateReviews` wrote and can only
  // read the shape they leave. It cannot move above the ledger pass, so it restamps.
  beginStep('regions')
  const regions = migrateContextsToRegions(sqlite, countOldShapes(sqlite))
  endStep('regions')

  // AFTER EVERYTHING, because it reads the records of kind `agent` and `migrateAgentIdentities`
  // above CREATES some. Running it earlier would leave an agent minted by this same command with no
  // registry row, and nothing would say so. It writes no `records.data`, so the revision ledger's
  // rule does not reach it and it needs no restamp.
  beginStep('participants')
  const participants = migrateParticipants(sqlite)
  endStep('participants')
  beginStep('pixelScale')
  const pixelScale = migratePixelScale(sqlite)
  endStep('pixelScale')

  // AFTER `migrateParticipants`, because it looks each message's writer up in the two registries
  // that step fills. Running it earlier would find no registry rows and leave every message
  // without a sender, which is exactly what this step is here to avoid saying wrongly.
  beginStep('messageDelivery')
  const messageDelivery = migrateMessageDelivery(sqlite)
  endStep('messageDelivery')

  // AFTER `migrateParticipants` TOO, and for the same reason turned around: it gives a home world
  // to every row of the two registries, so a row that step is about to write would be left without
  // one if this ran first. Criterion C1 of design/messages/ACCEPTANCE.md section 8.
  beginStep('citizenship')
  const citizenship = migrateCitizenship(sqlite)
  endStep('citizenship')

  // BELOW THE REVISION PASS, because it writes its own revision for each run it changes, as the
  // office. It reads each run's first revision, which the pass never changes, and it creates no
  // record, so nothing above needs to see what it writes. See ./secretary-runs-need-no-check.ts.
  beginStep('secretaryRuns')
  const secretaryRuns = markSecretaryRunsAsNeedingNoCheck(sqlite)
  endStep('secretaryRuns')

  // BELOW THE REVISION PASS AND AFTER `migrateMessageDelivery`, because it writes its own revision for each message it
  // moves, as the office, and moves messages that step may have just given a sender. See ./message-centre-migration.ts.
  beginStep('messageCentre')
  const messageCentre = moveMessagesIntoTheMessageCentre(sqlite)
  endStep('messageCentre')

  // LAST, AND IT READS NOTHING ANOTHER STEP WRITES. It moves each rough draft into `plans` and `plan_lines`, which
  // no other step touches, writes no record, no change row and no revision, so the ledger pass has nothing to say
  // about it. See ./drafts-into-plans-migration.ts.
  beginStep('roughDrafts')
  const roughDrafts = moveDraftsIntoPlans(sqlite)
  endStep('roughDrafts')

  // BELOW THE REVISION PASS, because it writes its own revision for each run it changes, as the office. It reads
  // only `data.toolUses`, which no step above writes. See ./tool-uses-migration.ts.
  beginStep('toolUses')
  const toolUses = moveToolUsesIntoTheirTable(sqlite)
  endStep('toolUses')

  // ONLY IN THE RUN THAT APPLIES 0253, and it reads and writes only `agent_runs` and `held_keys`, which no step above
  // writes. It writes no record, so the ledger pass has nothing to say about it. See ./withdraw-review-runs-migration.ts.
  beginStep('reviewRunsWithdrawn')
  const reviewRunsWithdrawn = withdrawTheRunsASentReviewLeftWaiting(sqlite, applied)
  endStep('reviewRunsWithdrawn')

  // ONLY IN THE RUN THAT APPLIES 0311. It writes only the four kind columns 0311 added, which no step above reads or
  // writes, and reads the registries, which no step above changes in that run. It writes no record, so the ledger
  // pass has nothing to say about it. See ./kinds-beside-ids-migration.ts.
  beginStep('kindsBesideIds')
  const kindsBesideIds = tellTheKindsBesideTheIds(sqlite, applied)
  endStep('kindsBesideIds')
  beginStep('agentOwners')
  const agentOwners = setTheOldAgentsOwners(sqlite, applied)
  endStep('agentOwners')

  // ONLY IN THE RUN THAT APPLIES 0318, and it reads and writes only `casting_rows` and `casting_row_changes`, which no
  // step above writes. It writes no record, so the ledger pass has nothing to say about it. See
  // ./casting-work-groups-migration.ts.
  beginStep('castingWorkGroups')
  const castingWorkGroups = setTheCastingWorkGroups(sqlite, applied)
  endStep('castingWorkGroups')

  // ONLY IN THE RUN THAT APPLIES 0349, after the work groups, which it reads. It reads and writes only the Casting
  // tables, which no other step writes. It writes no record, so the ledger pass has nothing to say about it. See
  // ./casting-labels-migration.ts.
  beginStep('castingLabels')
  const castingLabels = makeTheFirstCastingLabels(sqlite, applied)
  endStep('castingLabels')

  // LAST, AND ALONE: it refuses a run that applied a migration, and it runs after every step above, which have
  // nothing to do on a store that is up to date. Given no staged map it reads and writes nothing. It writes no record,
  // so the ledger pass has nothing to say about it. See ./remint-migration.ts.
  beginStep('remint')
  const remint = applyTheStagedRemint(sqlite, staged, applied, ledgerGaps)
  endStep('remint')

  return {
    appendOrder,
    blocks,
    agentIdentities,
    origin,
    blockedBy,
    sessionRuntime,
    annotationStateKey,
    blockIdentity,
    workspaces,
    revisions,
    contexts,
    reviewsBroughtForward,
    annotationMarkers,
    agentDispatch,
    moduleClaims,
    measureWords,
    reviewsReach,
    regions,
    pixelScale,
    participants,
    messageDelivery,
    citizenship,
    sealPointers,
    secretaryRuns,
    messageCentre,
    roughDrafts,
    toolUses,
    reviewRunsWithdrawn,
    kindsBesideIds,
    agentOwners,
    castingWorkGroups,
    castingLabels,
    remint,
  }
}

/**
 * THE OUTCOME OF ONE RUN OF THE DATA STEPS: what the caller worked out around them, then what each step returned, in
 * the order the outcome has always had. One place, so `migrateInPlace` and the rolled-back run on a served file name
 * every step the same way.
 */
function theOutcomeOf(around: AroundTheSteps, steps: DataSteps): MigrationOutcome {
  const {
    appendOrder,
    blocks,
    agentIdentities,
    origin,
    blockedBy,
    sessionRuntime,
    annotationStateKey,
    blockIdentity,
    workspaces,
    revisions,
    contexts,
    reviewsBroughtForward,
    annotationMarkers,
    agentDispatch,
    moduleClaims,
    measureWords,
    reviewsReach,
    regions,
    pixelScale,
    participants,
    messageDelivery,
    citizenship,
    sealPointers,
    secretaryRuns,
    messageCentre,
    roughDrafts,
    toolUses,
    reviewRunsWithdrawn,
    kindsBesideIds,
    agentOwners,
    castingWorkGroups,
    castingLabels,
    remint,
  } = steps
  const { file, at, before, after, alreadyApplied, newlyApplied, heldTheWriteLockMs } = around
  return {
    file,
    at,
    before,
    after,
    alreadyApplied,
    newlyApplied,
    heldTheWriteLockMs,
    appendOrder,
    blocks,
    origin,
    blockedBy,
    workspaces,
    revisions,
    contexts,
    reviews: reviewsBroughtForward,
    agentIdentities,
    sessionRuntime,
    annotationStateKey,
    blockIdentity,
    annotationMarkers,
    agentDispatch,
    moduleClaims,
    measureWords,
    reviewsReach,
    regions,
    pixelScale,
    participants,
    messageDelivery,
    citizenship,
    sealPointers,
    secretaryRuns,
    messageCentre,
    roughDrafts,
    toolUses,
    reviewRunsWithdrawn,
    kindsBesideIds,
    agentOwners,
    castingWorkGroups,
    castingLabels,
    remint,
  }
}

/**
 * Every table the report mentions in its second sentence: the ones in the file that the refusal
 * does not cover, in name order.
 *
 * COMPUTED BY SUBTRACTION, so it cannot forget one. It is whatever the database holds minus
 * `COUNTED_TABLES`, which means a table added by a migration nobody declared is in here rather than
 * nowhere. That is the difference between this and a hand-kept list of exceptions, and the reason
 * this exists at all: the hand-kept version of it was the empty list.
 */
export function tablesReportedButNotRefusedOver(outcome: MigrationOutcome): string[] {
  const refusedOver = new Set<string>(GUARDED_TABLES)
  const seen = new Set([...Object.keys(outcome.before), ...Object.keys(outcome.after)])
  return [...seen].filter((table) => !refusedOver.has(table)).sort()
}

/**
 * Why losing a row from this particular table does not stop the command, in one clause.
 *
 * READ FROM THE SCHEMA'S OWN LISTS rather than written out here, because a table moving
 * between them would otherwise leave this sentence describing the old one. A table on none of them
 * gets the honest answer — nothing here knows what it is — which is louder than a guess and is the
 * fifth invariant rather than a gap.
 */
function whyItIsNotRefusedOver(table: string): string {
  if ((DERIVED_TABLES as readonly string[]).includes(table)) return 'a scan rebuilds it'
  if ((MEASURED_TABLES as readonly string[]).includes(table)) return 'Mole Office measured it, and a prune of it is allowed'
  if ((MIGRATION_DECLARED_TABLES as readonly string[]).includes(table)) return 'a migration writes that row itself'
  if ((RECORD_TEXT_INDEX_TABLES as readonly string[]).includes(table)) {
    return "the records' triggers keep this index of their text, and SQLite merges its pieces"
  }
  if (table === THE_MIGRATION_JOURNAL_TABLE) return 'it is the migration journal'
  if (everyPartTable().some((part) => part.name === table && !part.says.exported)) return 'its schema part says no archive carries it'
  return 'no list in db/table-name-lists.ts names this table, so nothing here knows what it holds'
}

/**
 * EVERY IN-PLACE STEP `migrateInPlace` RUNS, IN THE ORDER IT RUNS THEM, AS ONE TABLE.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS IS A TABLE AND NOT THREE LISTS
 * ---------------------------------------------------------------------------------------
 *
 * There were three places a step had to be named: the `wouldWrite` line `previewMigration` pushes,
 * the line `describeOutcome` prints, and the sentence `prepareToServe` prints on a quiet start. All
 * three were written out by hand, and they had already come apart before this commit: the quiet
 * sentence named SIX of the seven steps and the missing one was `reviews`, and `previewMigration`
 * had no clause for that step at all — so a run whose only work was bringing a review forward
 * pushed no line, fell into the catch-all, and stopped the server with *"write something none of
 * the four migration reports names"*. That is a refusal that names nothing, on the boot after the
 * one command an operator was told to run.
 *
 * Window B adds NINE more steps. Typing nine more names into three lists is the same defect nine
 * times over, so the three are computed from this one table instead:
 *
 *   `previewMigration` pushes `${name}: ${line(outcome)}` FOR EVERY STEP WHOSE `wrote` IS ABOVE
 *   ZERO, and for no other step. So the line and the count cannot disagree — there is no way to
 *   report a write without the line, and no way to write the line for a step that wrote nothing.
 *
 *   `describeOutcome` prints `describe(outcome)` for every step, in this order, always.
 *
 *   `prepareToServe`'s quiet sentence names `THE_STEPS.map(s => s.name)`.
 *
 * `tests/every-window-b-step-is-named.test.ts` is the proof: it asserts the property over the
 * table, and removing a step from it turns that test red BY THAT STEP'S NAME.
 */
export interface InPlaceStep {
  /**
   * WHICH FIELD OF `MigrationOutcome` HOLDS THIS STEP'S OWN REPORT.
   *
   * It is what ties the table to `migrateInPlace` rather than to a name somebody typed: a step can
   * only be run by returning its report on that interface, so
   * `tests/every-window-b-step-is-named.test.ts` compares the fields a real outcome carries with the
   * fields named here and a step missing from this table fails BY ITS FIELD NAME.
   */
  field: keyof MigrationOutcome
  /** What this step is called, at the head of its `wouldWrite` line and in the quiet sentence. */
  name: string
  /**
   * HOW MANY ROWS THIS STEP'S OWN REPORT SAYS IT WROTE. Zero means it wrote nothing at all.
   *
   * A step that reports work without a count of it answers 1 rather than 0: "something happened and
   * this report does not number it" is still something an operator has to be told about, and the
   * alternative is a byte-difference nothing names.
   */
  wrote: (outcome: MigrationOutcome) => number
  /** What it would write, in one sentence, WITHOUT its name — the table puts that on the front. */
  line: (outcome: MigrationOutcome) => string
  /** The whole line `describeOutcome` prints about it, whether it did anything or not. */
  describe: (outcome: MigrationOutcome) => string
}

export const THE_STEPS: readonly InPlaceStep[] = [
  {
    field: 'appendOrder',
    name: 'change log order',
    wrote: (o) => o.appendOrder,
    line: (o) =>
      `give ${String(o.appendOrder)} change row(s) their place in the order they were appended in, copied from ` +
      'their rowid. It changes no value anybody wrote.',
    describe: (o) => describeAppendOrder(o.appendOrder),
  },
  {
    field: 'blocks',
    name: 'blocks',
    wrote: (o) => {
      const b = o.blocks
      return b.alreadyDone
        ? 0
        : Math.max(1, b.blocks + b.implementsLinks + b.blocksLinks + b.changeRowsRefiled + b.intentRowsRewritten)
    },
    line: (o) => {
      const b = o.blocks
      return (
        `create ${b.blocks} block records out of ${b.pipelines} pipeline${b.pipelines === 1 ? '' : 's'}, ` +
        `${b.implementsLinks + b.blocksLinks} links, re-file ${b.changeRowsRefiled} change rows and rewrite ` +
        `${b.intentRowsRewritten} intent rows`
      )
    },
    describe: (o) => {
      const b = o.blocks
      const head = b.alreadyDone
        ? 'blocks: nothing to migrate'
        : `blocks: ${b.blocks} block records from ${b.pipelines} pipelines, ${b.implementsLinks} implements links, ` +
          `${b.blocksLinks} blocks links, ${b.changeRowsRefiled} change rows re-filed, ` +
          `${b.intentRowsRewritten} intent rows retargeted`
      // EVERY NOTE IS PRINTED, however many there are. These are the things the migration would not
      // guess at, and an operator who does not see them cannot act on them — a summary line saying
      // "12 notes" is the quiet version of not reporting at all.
      const notes = b.notes.map((note) => `  [${note.kind}] ${note.detail}`)
      return (
        head +
        (notes.length === 0
          ? ''
          : `\n${notes.length} thing${notes.length === 1 ? '' : 's'} the block migration will not guess at:\n` +
            notes.join('\n'))
      )
    },
  },
  {
    field: 'agentIdentities',
    name: 'agents',
    wrote: (o) => o.agentIdentities.recordsWritten,
    line: (o) =>
      `mint ${o.agentIdentities.minted.length} durable agent identit${o.agentIdentities.minted.length === 1 ? 'y' : 'ies'} ` +
      `out of the ${o.agentIdentities.chosen} run(s) something in this corpus addressed, and write which agent each ` +
      `of those runs worked as. Every identity comes from a run somebody addressed; none is invented, and a choice ` +
      `pointing at a run that is not here refuses the whole migration.`,
    describe: (o) => describeAgentIdentities(o.agentIdentities),
  },
  {
    field: 'origin',
    name: 'origin',
    wrote: (o) => o.origin.fixture + o.origin.authored,
    line: (o) =>
      `stamp ${o.origin.fixture + o.origin.authored} record${o.origin.fixture + o.origin.authored === 1 ? '' : 's'} ` +
      `(${o.origin.fixture} fixture, ${o.origin.authored} authored)`,
    describe: (o) => describeOrigin(o.origin),
  },
  {
    field: 'blockedBy',
    name: 'blocked_by',
    wrote: (o) => o.blockedBy.moved + o.blockedBy.joined,
    line: (o) => {
      const moves = o.blockedBy.moved + o.blockedBy.joined
      return (
        `rewrite the stored data of ${moves} task${moves === 1 ? '' : 's'}, moving what \`blocked_by\` holds into ` +
        `\`also_waiting_on\``
      )
    },
    describe: (o) => describeBlockedBy(o.blockedBy),
  },
  {
    field: 'sessionRuntime',
    name: 'session runtime',
    wrote: (o) => o.sessionRuntime.recordsWritten,
    line: (o) =>
      `rename \`data.agent\` to \`data.runtime\` on ${o.sessionRuntime.recordsWritten} session record(s) ` +
      `(${o.sessionRuntime.liveRenamed} live, ${o.sessionRuntime.deletedRenamed} deleted). NO VALUE CHANGES: the ` +
      `same word comes out under the other key, because an agent is now a durable identity and a session is one ` +
      `run of a tool. The revision each one needs is written by the catch-up act of the revision pass, in this ` +
      `same run, which is why this step is above it.`,
    describe: (o) => describeSessionRuntime(o.sessionRuntime),
  },
  {
    field: 'annotationStateKey',
    name: 'comment state',
    wrote: (o) => o.annotationStateKey.recordsWritten + o.annotationStateKey.ledgerRestamped,
    line: (o) =>
      `take the \`state\` key off ${o.annotationStateKey.recordsWritten} comment(s) and restamp ` +
      `${o.annotationStateKey.ledgerRestamped} newest revision(s) to match. Nothing has decided anything from that ` +
      `field since wave 4; where a comment has got to is worked out from the messages that carried its words.`,
    describe: (o) => describeActOne(o.annotationStateKey),
  },
  {
    field: 'blockIdentity',
    name: 'block identity',
    wrote: (o) => o.blockIdentity.retitled + o.blockIdentity.revisions + o.blockIdentity.changeRows,
    line: (o) =>
      `take the pipeline's name off ${o.blockIdentity.retitled} block title(s), writing ` +
      `${o.blockIdentity.changeRows} change row(s) and ${o.blockIdentity.revisions} revision(s). The name written ` +
      `is the one already inside the stored title; every earlier revision still holds the composed one.`,
    describe: (o) => describeBlockIdentity(o.blockIdentity),
  },
  {
    field: 'workspaces',
    name: 'workspaces',
    wrote: (o) => {
      const w = o.workspaces
      if (w.alreadyDone) return 0
      const movedTotal = Object.values(w.moved).reduce((n, count) => n + count, 0)
      return Math.max(
        1,
        movedTotal +
          w.established.length +
          w.changesStamped +
          w.linksRefiled +
          w.presentationRefiled +
          w.resourcesRefiled +
          w.anchorsCopied,
      )
    },
    line: (o) => {
      const w = o.workspaces
      const moved = Object.entries(w.moved).sort((a, b) => b[1] - a[1])
      const movedTotal = moved.reduce((n, [, count]) => n + count, 0)
      const where = moved.map(([id, n]) => `${n} into ${id}`).join(', ')
      return (
        `MOVE ${movedTotal} record${movedTotal === 1 ? '' : 's'}${where === '' ? '' : ` (${where})`}` +
        `${w.established.length === 0 ? '' : `, establish ${w.established.join(', ')}`}, stamp ` +
        `${w.changesStamped} change rows, re-file ${w.linksRefiled} links, ${w.presentationRefiled} intent ` +
        `rows and ${w.resourcesRefiled} resource rows, and copy ${w.anchorsCopied} reader anchors`
      )
    },
    describe: (o) => describeWorkspaces(o.workspaces),
  },
  {
    field: 'sealPointers',
    name: 'seals',
    wrote: (o) => o.sealPointers.rewritten,
    line: (o) =>
      `keep the pointers and hashes of ${String(o.sealPointers.rewritten)} seal(s) written before 11 September ` +
      `2026 and drop their copied rows, taking ${String(o.sealPointers.bytes.before)} bytes of seal data to ` +
      `${String(o.sealPointers.bytes.after)}. It deletes no revision: every row a pointer names is still in ` +
      `revisions. A seal it cannot read is left exactly as it is and named.`,
    describe: (o) => {
      // BUILT FROM THE REPORT'S OWN COUNTS, not from `says`, which the migration wrote as one
      // string before the counts were known: a describe that echoed `says` would print the same
      // words however many seals it had rewritten, and the forcing test in
      // tests/every-window-b-step-is-named.test.ts is what caught it.
      const s = o.sealPointers
      const head =
        s.rewritten === 0
          ? `seals: no seal held copies; ${String(s.alreadyPointers)} already hold pointers and hashes only`
          : `seals: ${String(s.rewritten)} seal(s) rewritten to pointers and hashes, ` +
            `${String(s.bytes.before)} bytes of seal data became ${String(s.bytes.after)}; ` +
            `${String(s.alreadyPointers)} already held pointers`
      const named = s.unreadable.map((one) => `  [unreadable] ${one.id} — ${one.because}`)
      return head + (named.length === 0 ? '' : `\n${named.length} seal(s) left as they are:\n` + named.join('\n'))
    },
  },
  {
    field: 'revisions',
    name: 'revisions',
    wrote: (o) => (o.revisions.alreadyDone ? 0 : o.revisions.written + o.revisions.caughtUp),
    /*
     * BOTH OF `migrateRevisions`' ACTS, EACH WITH ITS OWN COUNT. It writes baselines AND it catches
     * up records whose ledger fell behind, and its own comment says so: "TWO ACTS, AND THEY ARE THE
     * SAME JOB FROM TWO STARTING POINTS".
     *
     * This clause used to read `written > 0` alone, so a run whose only work was the catch-up act
     * pushed no line — and fell into the catch-all below, which is what `prepareToServe` prints
     * when it REFUSES TO SERVE. Measured on a copy of the owner's corpus on 25 August 2026: with
     * `data.state` removed from 22 annotations, the report said `caughtUp: 22` and the only line
     * offered to the operator was "write something none of the four migration reports names". Every
     * data migration that rewrites `records.data` collides with this pass, so the missing half of
     * this line was a refusal that named nothing, on the boot after any such migration.
     */
    line: (o) => {
      const rev = o.revisions
      // BUILT FROM THE COUNTS RATHER THAN WRITTEN OUT PER CASE, so an act cannot be named in one
      // arm and forgotten in another, and neither act is ever reported as "0 of them".
      const acts: string[] = []
      if (rev.written > 0) acts.push(`${rev.written} BASELINE revision${rev.written === 1 ? '' : 's'}`)
      if (rev.caughtUp > 0) acts.push(`${rev.caughtUp} CATCH-UP revision${rev.caughtUp === 1 ? '' : 's'}`)
      return (
        `write ${acts.join(' and ')}, each holding what that record contains at the moment the migration runs. ` +
        `It inserts into \`revisions\` and touches no other table.` +
        (rev.written > 0
          ? ` A BASELINE goes to a record that has no revision at all. It is NOT the record as it was created ` +
            `and says so on the row: what these records held earlier was never stored anywhere.`
          : '') +
        (rev.caughtUp > 0
          ? ` A CATCH-UP goes to a record whose newest revision no longer holds what that record holds, because ` +
            `something rewrote the record and kept no revision. It is NOT evidence of who made that write — this ` +
            `pass cannot know — and the row says so.`
          : '')
      )
    },
    describe: (o) => describeRevisionBackfill(o.revisions),
  },
  {
    field: 'contexts',
    name: 'contexts',
    wrote: (o) => (o.contexts.alreadyDone ? 0 : Math.max(1, o.contexts.moved)),
    line: (o) =>
      `rewrite \`agent_messages.context\` on ${o.contexts.moved} comment${o.contexts.moved === 1 ? '' : 's'}, ` +
      `moving what each one points at into the round-eight shape — a target, optionally the words quoted inside ` +
      `it, optionally the revision it was written against. It writes that one column and nothing else, and it ` +
      `leaves alone every row it cannot read.`,
    describe: (o) => describeContextMigration(o.contexts),
  },
  {
    // THE STEP THAT HAD NO LINE AT ALL UNTIL THIS COMMIT. See the header of this table.
    field: 'reviews',
    name: 'reviews',
    wrote: (o) => (o.reviews.alreadyDone ? 0 : Math.max(1, o.reviews.brought)),
    line: (o) =>
      `bring ${o.reviews.brought} round-seven review-mode conversation${o.reviews.brought === 1 ? '' : 's'} forward ` +
      `into \`reviews\`, taking each one's entry from the first comment that says what it points at. It leaves ` +
      `alone every conversation it cannot read an entry out of.`,
    describe: (o) => describeReviewMigration(o.reviews),
  },
  {
    field: 'annotationMarkers',
    name: 'comment markers',
    wrote: (o) => o.annotationMarkers.markersWritten,
    line: (o) =>
      `write ${o.annotationMarkers.markersWritten} row(s) into \`annotation_words_fixed\`: one per comment whose ` +
      `own word said its words had gone out and which no message and no earlier marker accounts for. A one-way ` +
      `marker with one honest sentence; nothing here reads anybody's words.`,
    describe: (o) => describeActTwo(o.annotationMarkers),
  },
  {
    field: 'agentDispatch',
    name: 'dispatch',
    wrote: (o) => o.agentDispatch.rowsWritten,
    line: (o) =>
      `stamp ${o.agentDispatch.momentsWritten} message(s) with the moment Mole Office accepted the dispatch — taken ` +
      `from the run that carried it and never invented — file ${o.agentDispatch.recipientsResolved} under the ` +
      `durable identity their run worked as, move ${o.agentDispatch.annotationsMoved} comment(s) the same way, and ` +
      `bind ${o.agentDispatch.runsBound} run(s)`,
    describe: (o) => describeAgentDispatch(o.agentDispatch),
  },
  {
    field: 'moduleClaims',
    name: 'module claims',
    wrote: (o) => o.moduleClaims.rows + o.moduleClaims.modules + o.moduleClaims.ledgerRestamped,
    line: (o) =>
      `empty \`data.claims\` on ${o.moduleClaims.modules} module(s) into ${o.moduleClaims.rows} ` +
      `\`implementation_map\` row(s), restamping ${o.moduleClaims.ledgerRestamped} newest revision(s). Every ` +
      `claim string migrates verbatim; a migration that improved the data would be lying about the past.`,
    describe: (o) => describeModuleClaims(o.moduleClaims),
  },
  {
    field: 'measureWords',
    name: 'measure words',
    wrote: (o) =>
      o.measureWords.tableMissing || o.measureWords.alreadyDone
        ? 0
        : 1 + o.measureWords.records + o.measureWords.ledgerRestamped,
    line: (o) =>
      `rename the stored reading-measure words in ${String(o.measureWords.records)} record(s): ` +
      `${String(o.measureWords.moved['narrow'] ?? 0)} \`narrow\` become \`narrowest\`, then ` +
      `${String(o.measureWords.moved['readable'] ?? 0)} \`readable\` become \`narrow\`, restamping ` +
      `${String(o.measureWords.ledgerRestamped)} newest revision(s), and write the one row saying it was done. ` +
      `Each block reads at the width it did.`,
    describe: (o) => describeMeasureWords(o.measureWords),
  },
  {
    field: 'reviewsReach',
    name: 'review reach',
    wrote: (o) => o.reviewsReach.rowsWritten + (o.reviewsReach.indexCreated ? 1 : 0),
    line: (o) =>
      `widen ${o.reviewsReach.setGlobal} review(s) to project-wide` +
      `${o.reviewsReach.indexCreated ? ', then create the partial unique index that stops two of them collecting at once' : ''}` +
      `. It only ever widens: a review already reading project-wide is never narrowed back.`,
    describe: (o) => describeReviewsReach(o.reviewsReach),
  },
  {
    field: 'regions',
    name: 'regions',
    wrote: (o) => o.regions.rowsWritten + o.regions.ledgerRestamped,
    line: (o) => {
      const converted = Object.values(o.regions.converted).reduce((n, count) => n + count, 0)
      return (
        `give ${o.regions.placed} stored context(s) the place they point at and convert ${converted} target(s) ` +
        `from a report block to a region, over all three carriers, restamping ${o.regions.ledgerRestamped} newest ` +
        `revision(s). It runs last because it reads what the context and review steps above it wrote.`
      )
    },
    describe: (o) => describeContextsToRegions(o.regions),
  },
  {
    field: 'pixelScale',
    name: 'map sizes',
    wrote: (o) => o.pixelScale,
    line: (o) => `save a fixed cosmetic map size for ${o.pixelScale} agent(s); preserve every existing size.`,
    describe: (o) => `map sizes: ${o.pixelScale} generated and saved. Existing sizes were not changed.`,
  },
  {
    field: 'participants',
    name: 'participants',
    wrote: (o) =>
      o.participants.ownerWritten +
      o.participants.agentsWritten +
      o.participants.recordsMapped +
      o.participants.avatarsWritten,
    line: (o) =>
      `write the owner's own row, ${o.participants.agentsWritten} registry row(s) for the durable agents this ` +
      `database already names, ${o.participants.avatarsWritten} generated picture(s), and map ` +
      `${o.participants.recordsMapped} record(s) of kind agent to the registry row each one is. It writes no ` +
      `record and changes no record: the records are kept and linked.`,
    describe: (o) => describeParticipants(o.participants),
  },
  {
    field: 'citizenship',
    name: 'citizens',
    wrote: (o) =>
      o.citizenship.peopleMadeCitizens + o.citizenship.agentsMadeCitizens + o.citizenship.installationWritten,
    line: (o) =>
      `make ${String(o.citizenship.peopleMadeCitizens)} person row(s) and ` +
      `${String(o.citizenship.agentsMadeCitizens)} agent row(s) citizens of the world this database is, each from ` +
      `the moment it was registered, and write the one row saying which installation this database belongs to. It ` +
      `never overwrites a home somebody already has.`,
    describe: (o) => describeCitizenship(o.citizenship),
  },
  {
    field: 'messageDelivery',
    name: 'messages',
    // THE STAMP IS PART OF WHAT THIS STEP WROTE. Leaving it out was problem `IhInQ2Mf5BZq`: on
    // 12 September 2026 the step changed one row's `inferred_by` and this sum read zero, so
    // `previewMigration` pushed no line for it, the guard found the copy byte-different with
    // nothing accounting for it, and the live office refused to start for fourteen minutes.
    wrote: (o) =>
      o.messageDelivery.sendersWritten +
      o.messageDelivery.deliveriesWritten +
      o.messageDelivery.ledgerRestamped +
      o.messageDelivery.stamped,
    line: (o) => {
      const m = o.messageDelivery
      const bits: string[] = []
      if (m.sendersWritten > 0) {
        bits.push(
          `write the participant its writer answers to onto ${String(m.sendersWritten)} message(s) already here, ` +
            `restamping ${String(m.ledgerRestamped)} newest revision(s)`,
        )
      }
      if (m.stamped > 0) {
        // BY ID, because the guard prints this line and a reader has to know which rows a deliberate
        // migrate would change.
        bits.push(
          `stamp ${String(m.stamped)} delivery row(s) with which writer worked the recipient out ` +
            `(${m.stampedRows.map((one) => `${one.deliveryId} -> "${one.now}"`).join(', ')})`,
        )
      }
      // WHERE THE DELIVERY ROWS GO is said by the same function the step's own report uses, so the
      // preview and the run cannot say different things about them (invariant 9).
      const rows =
        m.deliveriesWritten > 0
          ? `Write ${String(m.deliveriesWritten)} delivery row(s). ${whereTheDeliveryRowsWent(m)}`
          : ''
      return [bits.length > 0 ? `${bits.join('; ')}.` : '', rows, "It changes no message's words and deletes nothing."]
        .filter((part) => part !== '')
        .join(' ')
    },
    describe: (o) => describeMessageDelivery(o.messageDelivery),
  },
  {
    field: 'secretaryRuns',
    name: 'secretary runs',
    wrote: (o) => o.secretaryRuns.written,
    line: (o) =>
      `write needsNoCheck, as the office, on ${String(o.secretaryRuns.written)} run(s) the office filed for a ` +
      `secretary's design/-only merge entry before it wrote that field (` +
      `${o.secretaryRuns.marked.map((one) => `${one.run} through entry ${one.entry}`).join(', ')}), with one change ` +
      `row and one revision each. It changes nothing else on those runs.`,
    describe: (o) => describeSecretaryRunsNeedNoCheck(o.secretaryRuns),
  },
  {
    field: 'messageCentre',
    name: 'message centre',
    wrote: (o) => (o.messageCentre.registryRowWritten ? 1 : 0) + o.messageCentre.moved + o.messageCentre.linksRefiled,
    line: (o) => {
      const m = o.messageCentre
      const from = Object.entries(m.movedFrom)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([project, n]) => `${String(n)} from ${project}`)
        .join(', ')
      const bits: string[] = []
      if (m.registryRowWritten) bits.push('write the message centre\'s row in the project registry')
      if (m.moved > 0) {
        bits.push(
          `move ${String(m.moved)} message(s) into the message centre (${from}), each keeping its old project as the mark ` +
            'data.writtenIn, with one revision each written as the office',
        )
      }
      if (m.linksRefiled > 0) bits.push(`refile ${String(m.linksRefiled)} link(s) with a message at one end`)
      return `${bits.join('; ')}. It changes no message's words and deletes nothing.`
    },
    describe: (o) => describeTheMoveIntoTheMessageCentre(o.messageCentre),
  },
  {
    field: 'roughDrafts',
    name: 'rough drafts',
    wrote: (o) => rowsTheDraftMoveWrote(o.roughDrafts),
    // THE WHOLE REPORT, because the guard prints this line before a server will start and an operator has to see
    // which draft becomes which plan, which id is mapped and which draft is refused, before anything is written.
    line: (o) => `${describeTheDraftMove(o.roughDrafts)}. It changes no draft's words and writes no record.`,
    describe: (o) => describeTheDraftMove(o.roughDrafts),
  },
  {
    field: 'toolUses',
    name: 'tool uses',
    wrote: (o) => rowsTheToolUseMoveWrote(o.toolUses),
    line: (o) => `${describeTheToolUseMove(o.toolUses)}. It changes no use's words and deletes no revision or change row.`,
    describe: (o) => describeTheToolUseMove(o.toolUses),
  },
  {
    field: 'reviewRunsWithdrawn',
    name: 'withdrawn review runs',
    wrote: (o) => rowsTheWithdrawalWrote(o.reviewRunsWithdrawn),
    line: (o) => `${whatTheWithdrawalDid(o.reviewRunsWithdrawn)}. It deletes nothing and changes no message.`,
    describe: (o) => describeTheWithdrawal(o.reviewRunsWithdrawn),
  },
  {
    field: 'kindsBesideIds',
    name: 'kinds beside ids',
    wrote: (o) => rowsTheKindsStepWrote(o.kindsBesideIds),
    line: (o) => `${whatTheKindsStepDid(o.kindsBesideIds)}. It changes no id and deletes nothing.`,
    describe: (o) => describeTheKindsStep(o.kindsBesideIds),
  },
  {
    field: 'agentOwners',
    name: 'agent owners',
    wrote: (o) => rowsTheOwnerStepWrote(o.agentOwners),
    line: (o) => `${whatTheOwnerStepDid(o.agentOwners)}. It changes no starter and deletes nothing.`,
    describe: (o) => describeTheOwnerStep(o.agentOwners),
  },
  {
    field: 'castingWorkGroups',
    name: 'casting work groups',
    wrote: (o) => rowsTheWorkGroupStepWrote(o.castingWorkGroups),
    line: (o) => `${whatTheWorkGroupStepDid(o.castingWorkGroups)}. It also stamps each row it set as last changed by the migration. It changes no other cell and deletes nothing.`,
    describe: (o) => describeTheWorkGroupStep(o.castingWorkGroups),
  },
  {
    field: 'castingLabels',
    name: 'casting labels',
    wrote: (o) => rowsTheLabelStepWrote(o.castingLabels),
    line: (o) => `${whatTheLabelStepDid(o.castingLabels)}. It also stamps each row it labelled as last changed by the migration. It changes no other cell and deletes nothing.`,
    describe: (o) => describeTheLabelStep(o.castingLabels),
  },
  {
    field: 'remint',
    name: 're-mint',
    wrote: (o) => rowsTheRemintWrote(o.remint),
    line: (o) => `${whatTheRemintDid(o.remint)}. It deletes nothing.`,
    describe: (o) => describeTheRemint(o.remint),
  },
]

/**
 * EVERY STEP'S NAME, IN ONE ENGLISH LIST — "a, b and c".
 *
 * Read by the quiet-start sentence and by the catch-all refusal, so both of them name exactly the
 * steps that ran rather than the steps somebody remembered when they last edited the sentence.
 */
export function namesOfTheSteps(): string {
  const names = THE_STEPS.map((step) => step.name)
  if (names.length <= 1) return names.join('')
  return `${names.slice(0, -1).join(', ')} and ${String(names[names.length - 1])}`
}

/** The report the command prints. Built here so the test can check the wording it asserts on. */
export function describeOutcome(outcome: MigrationOutcome): string {
  // "no table" rather than 0, because a table that did not exist is not a table that was empty.
  const show = (n: number | null | undefined): string => (n === null || n === undefined ? 'no table' : String(n))
  const pair = (table: string): string => `${table} ${show(outcome.before[table])} -> ${show(outcome.after[table])}`
  // `planning_drafts` is guarded but no longer declared, so it is named only while some database still has it.
  const drafts = outcome.before[DRAFTS_TABLE] != null || outcome.after[DRAFTS_TABLE] != null ? [DRAFTS_TABLE] : []
  const counts = [...COUNTED_TABLES, ...drafts].map(pair).join(', ')

  /**
   * THE SECOND SENTENCE, AND THE WHOLE POINT OF IT.
   *
   * It names every other table in the file with its counts, and it says in the same breath that a
   * drop in one of them does not stop this command. Before 25 August 2026 the report printed the
   * first sentence alone, and a reader had to already know which tables it left out to notice that
   * the three tables migration 0111 drops and recreates were all of them.
   */
  const alsoCounted = tablesReportedButNotRefusedOver(outcome)
  const others =
    alsoCounted.length === 0
      ? ''
      : `\nalso counted, and this command does not refuse over these: ${alsoCounted.map(pair).join(', ')}`

  /**
   * AND THE SENTENCE THAT ONLY APPEARS WHEN ONE OF THEM ACTUALLY SHRANK.
   *
   * Printing the counts is not enough on its own: twenty-six numbers followed by ten more is a wall,
   * and `source_files 242 -> 0` in the middle of it reads like every other pair. So a table that
   * lost rows gets said again, in words, with the reason it is not a refusal beside it — and the
   * reason comes from the schema's own lists rather than from a sentence written here.
   */
  const shrank = alsoCounted
    .map((table) => {
      const line = whatShrank(table, outcome.before[table], outcome.after[table])
      return line === null ? null : `${line} (${whyItIsNotRefusedOver(table)})`
    })
    .filter((line): line is string => line !== null)
  const shrankLine =
    shrank.length === 0
      ? ''
      : `\n${shrank.length} table${shrank.length === 1 ? '' : 's'} that this command does not refuse over LOST ROWS: ` +
        `${shrank.join('; ')}. The command did not stop, because those tables are not on the list it refuses over. ` +
        'It is still not what the migration said it would do, so read the migration that ran before deciding it ' +
        'was meant. POST /api/source/reindex rebuilds a derived table; nothing rebuilds the others.'
  const applied =
    outcome.newlyApplied === 0
      ? `no new migrations (${outcome.alreadyApplied} already applied)`
      : `${outcome.newlyApplied} migration${outcome.newlyApplied === 1 ? '' : 's'} applied`
  // EVERY STEP, IN THE ORDER `migrateInPlace` RUNS THEM, FROM THE ONE TABLE. A step added to
  // `migrateInPlace` and not to `THE_STEPS` is a step this report does not mention, and
  // tests/every-window-b-step-is-named.test.ts is what says so.
  const steps = THE_STEPS.map((step) => step.describe(outcome)).join('\n')
  return `migrations: ${applied} to ${outcome.file} at ${outcome.at}; it held the write lock for ${String(outcome.heldTheWriteLockMs)} ms; rows ${counts}${others}${shrankLine}\n${steps}`
}

/**
 * The origin stamp, in one line plus whatever surprised it.
 *
 * THE UNMEASURED ROWS ARE COUNTED, NOT LISTED, AND THE OTHER TWO NOTES ARE LISTED IN FULL. That is
 * a deliberate split rather than a shortcut. A row the measurement does not cover is the ordinary
 * case on any database other than the one that was measured, and printing ten thousand lines saying
 * "nobody recorded this" would bury the ones that matter; the count and the sentence say everything
 * there is to say about it, and the ids are in the report object for anything that wants them. A
 * `title_changed`, a `kind_changed` or an unreadable stored word is the opposite: it means the row
 * at a measured id is not the row that was measured, which is one assumption of this whole exercise
 * breaking, and every one of those is printed.
 */
function describeOrigin(report: MigrationOutcome['origin']): string {
  if (report.columnMissing) {
    return (
      'origin: the records table has no `origin` column, so migration 0005 has not been applied to this ' +
      'database and NOTHING was stamped. Point the command at the whole drizzle/ folder to add it.'
    )
  }
  const surprises = report.notes.filter((n) => n.kind !== 'not_measured')
  // "NOTHING TO STAMP" IS ONLY SAID WHEN THERE REALLY WAS NOTHING LEFT. A run that stamped nothing
  // because it had a measurement of nothing is a different fact, and saying "nothing to stamp" for
  // it would read as "all done" over a corpus where every row is unrecorded.
  const head =
    report.alreadyDone && report.unstamped === 0
      ? `origin: nothing to stamp (${report.alreadyStamped} record${report.alreadyStamped === 1 ? '' : 's'} already carry one)`
      : `origin: ${report.fixture} stamped fixture, ${report.authored} stamped authored, ` +
        `${report.alreadyStamped} already carried one`
  const unmeasured =
    report.unstamped === 0
      ? ''
      : `\n  ${report.unstamped} record${report.unstamped === 1 ? '' : 's'} left with no origin: they are not in the ` +
        `measurement this command was given, so nobody has recorded how they entered the corpus. Nothing was guessed.`
  const lines = surprises.map((note) => `  [${note.kind}] ${note.detail}`)
  return head + unmeasured + (lines.length === 0 ? '' : `\n${lines.join('\n')}`)
}

/** The `task.blocked_by` move. EVERY note is printed: each one is a record somebody has to look at. */
function describeBlockedBy(report: MigrationOutcome['blockedBy']): string {
  const head = report.alreadyDone
    ? 'blocked_by: nothing to move'
    : `blocked_by: ${report.moved} moved into an empty also_waiting_on, ${report.joined} joined onto one that ` +
      `already said something, ${report.leftInPlace} left in place, ${report.namesARecord} naming a record and ` +
      `NO link made for any of them`
  const lines = report.notes.map((note) => `  [${note.kind}] ${note.detail}`)
  return head + (lines.length === 0 ? '' : `\n${lines.join('\n')}`)
}

// ------------------------------------------------------------------- what a server start may do

/**
 * How many rows this database holds in the tables that carry work — every authored table except the
 * one a migration fills itself. `COUNTED_TABLES` above is the list and the schema declares it.
 *
 * ZERO IS THE ONE ANSWER THAT MAKES A MIGRATION HARMLESS BY ARITHMETIC. Every data migration in
 * this project decides what to do by reading `records`; with no records there is nothing for any of
 * them to move, and a schema migration that rebuilds a table copies nothing through it. So a
 * database answering 0 here can be migrated by anything at any moment with nobody watching, and
 * `prepareToServe` does exactly that.
 *
 * IT COUNTS THE WHOLE AUTHORED SET AND NOT JUST THE THREE BIG TABLES, because "no data migration
 * would move this row" is not the same claim as "losing this row would cost nobody anything". A
 * database holding a fortnight of planning drafts and no records answered 0 here until 2026-08-12,
 * and was migrated in place on a file save.
 *
 * A missing table counts as no rows rather than as an error: a database file that does not exist
 * yet is the fresh-install case, and it is the one that most needs to come up on its own.
 */
export function irreplaceableRows(sqlite: Database.Database): number {
  let total = 0
  for (const table of GUARDED_TABLES) total += countRows(sqlite, table) ?? 0
  return total
}

/**
 * What this database holds, table by table, for a refusal that has to name what it is protecting.
 *
 * NAMED RATHER THAN TOTALLED, because the refusal is read by somebody deciding whether the file in
 * front of them is their corpus or a leftover, and "1143 rows" cannot answer that. A total on its
 * own also hid the case this exists for: a database whose only rows are planning drafts reads as a
 * number no different from one holding three test records.
 */
export function describeHoldings(sqlite: Database.Database): string {
  const held = GUARDED_TABLES.map((table) => [table, countRows(sqlite, table) ?? 0] as const).filter(([, n]) => n > 0)
  if (held.length === 0) return 'nothing'
  const total = held.reduce((n, [, count]) => n + count, 0)
  return `${total} row${total === 1 ? '' : 's'} of authored work (${held.map(([table, n]) => `${n} ${table}`).join(', ')})`
}

/**
 * Whether every record in this database says it came out of the seed.
 *
 * THE SECOND WAY A DATABASE CAN HOLD NOTHING ANYBODY WOULD MISS, and it is not a judgement made
 * here: `records.origin` answers exactly one question — "is this row part of the real record, or is
 * it furniture?" — and `fixture` means, in src/shared/types.ts's own words, "it entered this corpus
 * through the generated fixture or the seed". A database in which every row says that is one
 * `npm run db:seed` rebuilds, and migrating it unattended costs nobody anything.
 *
 * IT IS NOT A CONVENIENCE. `tools/review.mjs` seeds a throwaway database and starts a server against
 * it on every run, and `npm run db:seed && npm run dev` is the sequence README gives a new clone.
 * Both hold hundreds of rows and none of the rows are anybody's. Measured on 2026-08-12: the live
 * corpus has 396 records of which 106 are NOT stamped fixture, and the seeded one has 290 of which 0
 * are — so this tells the two apart with room to spare, and the moment somebody writes one real
 * record into a seeded database it is protected like any other.
 *
 * EVERY WAY OF NOT KNOWING ANSWERS FALSE. No records at all (the caller has already dealt with
 * that), no `origin` column because 0005 has not been applied here, or a single row whose origin is
 * NULL — "nobody has recorded how this entered the corpus" is not a claim that it came from the
 * seed, and reading it as one would be the guess USER.md invariant 5 is about.
 */
export function everyRecordCameFromTheSeed(sqlite: Database.Database): boolean {
  if (countRows(sqlite, 'records') === null) return false
  const hasOrigin =
    (
      sqlite
        .prepare("SELECT count(*) AS n FROM pragma_table_info('records') WHERE name = 'origin'")
        .get() as { n: number }
    ).n > 0
  if (!hasOrigin) return false
  const rows = sqlite.prepare('SELECT count(*) AS n FROM records').get() as { n: number }
  if (rows.n === 0) return false
  const notFixture = sqlite
    .prepare("SELECT count(*) AS n FROM records WHERE origin IS NULL OR origin <> 'fixture'")
    .get() as { n: number }
  return notFixture.n === 0
}

/**
 * WHAT SETTLING THE WRITE-AHEAD LOG DID, BEFORE THE IMAGE WAS TAKEN.
 *
 * `not needed` is the ordinary answer: the two images agreed, so nothing was folded in and the file
 * was only read. `folded in` means the two images disagreed with no migration accounting for it, so
 * the log was written into the main file and the measurement taken again. `could not` means that
 * was tried and refused, and says why.
 */
export type LogSettled =
  | { settled: 'not needed' }
  | { settled: 'folded in'; pagesMoved: number }
  | { settled: 'could not'; because: string }

/** What running the migrations against a database WOULD do, measured without changing any row. */
export interface MigrationPreview {
  /** The database this is about — the real one, not the copy the measurement was taken on. */
  file: string
  /**
   * WHETHER THE WRITE-AHEAD LOG WAS SETTLED BEFORE THE IMAGE WAS TAKEN. See `settleTheLog`.
   *
   * It is on the report because the byte comparison below is only as good as this: an image taken
   * over a log that could not be settled is one the refusal has to say so about.
   */
  logSettled: LogSettled
  /**
   * What the migrations reported when they ran against the copy.
   *
   * Its `file` is `:memory:`, because that is what it describes. Nothing here restates it as the
   * real path: this is a report about a copy, and saying otherwise would be evidence about a run
   * that did not happen (USER.md invariant 3).
   */
  outcome: MigrationOutcome
  /**
   * One line per thing a real run would write. EMPTY MEANS THE DATABASE IS ALREADY UP TO DATE and
   * running the migrations against it would change nothing at all.
   */
  wouldWrite: string[]
  /** Folders a crashed preview left beside the database and this one removed, by path. Empty when there were none. */
  leftoverCopiesRemoved: string[]
}

/**
 * The tags of the migration files a run against this database applies, in the order it applies them.
 *
 * Asked of the database the copy was taken from, by the same rule the run on the copy used, so the names
 * are the files that run applied and not the last few in the journal. A file with no journal table yet
 * lacks every migration in the folder.
 */
function tagsARunApplies(sqlite: Database.Database, migrationsFolder: string): string[] {
  const hasJournal =
    sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(THE_MIGRATION_JOURNAL_TABLE) !==
    undefined
  return theMigrationsNotYetApplied(hasJournal ? theJournalRows(sqlite) : [], theMigrationsInTheFolder(migrationsFolder)).map(
    (migration) => migration.tag,
  )
}

/**
 * A copy of a database, in memory, that the caller may do anything at all to.
 *
 * Taken inside a READ TRANSACTION, so a second process writing half way through cannot hand back
 * half of one state and half of another — two Mole Office processes against one file is the situation
 * this whole check exists because of.
 *
 * The two patched bytes are the SQLite header's file format write and read versions (offsets 18 and
 * 19; 1 is a rollback journal, 2 is a write-ahead log — https://sqlite.org/fileformat2.html). An
 * in-memory database cannot run a write-ahead log and answers SQLITE_CANTOPEN on the first
 * statement, and every Mole Office database is in WAL because db/client.ts sets it. Nothing else about
 * the image is touched, and the image is thrown away by the end of the call that made it.
 */
/**
 * FOLD THE WRITE-AHEAD LOG INTO THE DATABASE FILE, BEFORE ANY IMAGE IS TAKEN OF IT.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WENT WRONG WITHOUT THIS, MEASURED 5 SEPTEMBER 2026
 * ---------------------------------------------------------------------------------------
 *
 * The live API stopped serving and crash-looped for ten minutes on a healthy database. The check
 * below images the database, runs the migrations on the image, and compares the bytes; the file's
 * write-ahead log held 4 MB written by two one-off scripts and by the test suite, and the two
 * images came out different with no migration writing anything. So the check reported *the copy
 * came out byte-different from the image it was made from* and refused. `PRAGMA
 * wal_checkpoint(TRUNCATE)` on the file by hand brought the server back at the supervisor's next
 * try. Problem `Tu4rc-BhlNuL`.
 *
 * IT WORKED ALL DAY BECAUSE EVERY ORDINARY WRITE GOES THROUGH THE RUNNING SERVER, which checkpoints
 * as it goes. Anything that writes to the file directly — a one-off script, a backfill, a test —
 * arms it.
 *
 * ---------------------------------------------------------------------------------------
 * IT IS ASKED FOR ONLY WHEN THE TWO IMAGES HAVE ALREADY DISAGREED
 * ---------------------------------------------------------------------------------------
 *
 * A checkpoint costs a write and an fsync — measured at 45 ms a call on this machine, and
 * `tests/no-door-arms-the-start-up-gate.test.ts` asks the start-up decision fifty times in one
 * test, which took it from 1.8 seconds to 4.1 against a five-second budget. So it is not run on
 * every start. `previewMigration` measures first, and reaches for this only in the one case a
 * pending log can produce: the bytes moved and not one migration report accounts for it. Then it
 * folds the log in and measures again, which is a retry of the same measurement and not a different
 * one. A database whose two images already agree is served with the file only read.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT DOES AND DOES NOT DO
 * ---------------------------------------------------------------------------------------
 *
 * A checkpoint moves pages that are already committed out of the log and into the main file, and
 * empties the log. NO ROW CHANGES, nothing is added and nothing is lost — it is the same act
 * `npm run db:backup` performs before it copies. What it does change is the file's own bytes, so
 * the messages this check prints say the log was folded in rather than claiming the file was only
 * read.
 *
 * A CHECKPOINT THAT CANNOT RUN IS NOT A REASON TO STOP. Another connection reading the file makes
 * SQLite answer `busy`, and a damaged file throws. Either way the answer is recorded, the first
 * measurement stands, and the refusal says the image was taken over a log that is still there
 * rather than blaming the migrations for it.
 */
export function settleTheLog(sqlite: Database.Database): LogSettled {
  try {
    const answer = sqlite.pragma('wal_checkpoint(TRUNCATE)') as { busy: number; log: number; checkpointed: number }[]
    const row = answer[0]
    if (row === undefined) {
      return { settled: 'could not', because: 'PRAGMA wal_checkpoint(TRUNCATE) answered nothing at all.' }
    }
    if (row.busy !== 0) {
      return {
        settled: 'could not',
        because:
          'another connection was reading this database, so SQLite would not empty the write-ahead log. Nothing ' +
          'was written and the image was taken over the log.',
      }
    }
    return { settled: 'folded in', pagesMoved: row.checkpointed }
  } catch (err) {
    return {
      settled: 'could not',
      because: `the write-ahead log could not be emptied: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
}

function copyIntoMemory(
  sqlite: Database.Database,
  timing: MigrationsCheckTiming | null = null,
): { fingerprint: string; copy: Database.Database } {
  const read = sqlite.transaction(() => sqlite.serialize())
  beginPart(timing, THE_MIGRATIONS_CHECK_PARTS.theCopyHeldInMemory)
  const image = read()
  endPart(timing, THE_MIGRATIONS_CHECK_PARTS.theCopyHeldInMemory)
  if (image[18] === 2) image[18] = 1
  if (image[19] === 2) image[19] = 1
  // ONLY THE FINGERPRINT IS KEPT, not the image: see `theFingerprintOf`. better-sqlite3 copies the buffer it is
  // given into memory SQLite owns (`memcpy` in Database::Deserialize, version 13), and `image` is let go when this
  // returns, so the migrations run beside one copy of the database and not two. Measured in wave 13y round 20 on
  // a made-up office of 590 MB, each copy held at once costs its size; the `Buffer.from(image)` that once stood
  // here was a fourth. The fingerprint is taken before the copy is made, so even a better-sqlite3 that shared the
  // buffer could not make an unexplained write compare equal.
  beginPart(timing, THE_MIGRATIONS_CHECK_PARTS.theFirstFingerprint)
  const fingerprint = theFingerprintOf([image])
  endPart(timing, THE_MIGRATIONS_CHECK_PARTS.theFirstFingerprint)
  const copy = new Database(image)
  // The same pragma db/client.ts sets on the real connection. Off by default, and a migration that
  // would break a reference has to break it here too or this measurement is about a laxer database
  // than the one being served.
  copy.pragma('foreign_keys = ON')
  return { fingerprint, copy }
}

/**
 * Find out what bringing this database up to date would write, WITHOUT WRITING ANY OF IT.
 *
 * The real migrations, run against a throwaway copy (in memory, or in a folder beside the database above
 * `THE_PREVIEW_SEAM.inMemoryLimit`; see `measureAgainstAFileCopy`). The database this is called on is
 * only ever read. Two things then say whether it would be written to, and both have to be quiet:
 *
 *   THE COPY IS COMPARED WITH THE IMAGE IT WAS MADE FROM, by a SHA-256 fingerprint of all its bytes
 *   (`theFingerprintOf`), which catches any write of any kind including one no report mentions. It is
 *   the sensor that cannot be out of date.
 *
 *   THE REPORTS SAY WHAT THE WRITES WERE, because an operator needs a sentence and not a boolean.
 *
 * When the bytes moved and no report accounts for it, that disagreement is itself reported and the
 * caller still refuses — an unexplained write is the case invariant 2 of USER.md is about.
 *
 * A REFUSAL OR A FAILURE INSIDE THE MIGRATIONS THROWS OUT OF HERE, unchanged. It happened to a copy,
 * so nothing has been written anywhere, and the caller says so.
 */
export function previewMigration(
  sqlite: Database.Database,
  migrationsFolder: string = MIGRATIONS_FOLDER,
  /**
   * Called once before the one write this can make to the real file, folding the write-ahead log in. `prepareToServe`
   * waits there for the integrity check running beside it, and throws when the file is damaged, so nothing is written
   * to a damaged file.
   */
  beforeTheLogIsFolded: () => void = () => {},
  timing: MigrationsCheckTiming | null = null,
): MigrationPreview {
  const file = sqlite.name
  const first = measureAgainstACopy(sqlite, migrationsFolder, timing)

  // THE ORDINARY ANSWER, AND THE FILE WAS ONLY READ. Either the reports name what a run would write,
  // or nothing would be written at all. Neither is a case a pending write-ahead log can produce.
  if (!first.changedWithNoReport) {
    return { file, logSettled: { settled: 'not needed' }, outcome: first.outcome, wouldWrite: first.reported, leftoverCopiesRemoved: first.leftoversRemoved }
  }

  // THE BYTES MOVED AND NOT ONE REPORT ACCOUNTS FOR IT, which is the one case a pending log can
  // produce and the one that took the live API down. Fold the log in and ask again. See
  // `settleTheLog` for why this is here rather than before the first measurement.
  beginPart(timing, THE_MIGRATIONS_CHECK_PARTS.theIntegrityWaitedBeforeFolding)
  beforeTheLogIsFolded()
  endPart(timing, THE_MIGRATIONS_CHECK_PARTS.theIntegrityWaitedBeforeFolding)
  beginPart(timing, THE_MIGRATIONS_CHECK_PARTS.theLogFoldedIn)
  const settled = settleTheLog(sqlite)
  endPart(timing, THE_MIGRATIONS_CHECK_PARTS.theLogFoldedIn)
  const again = settled.settled === 'folded in' ? measureAgainstACopy(sqlite, migrationsFolder, timing) : first
  return {
    file,
    logSettled: settled,
    outcome: again.outcome,
    wouldWrite: again.changedWithNoReport
      ? [...again.reported, theUnexplainedDifference(settled)]
      : again.reported,
    leftoverCopiesRemoved: again === first ? first.leftoversRemoved : [...first.leftoversRemoved, ...again.leftoversRemoved],
  }
}

/** What one measurement against a throwaway copy found. */
interface Measured {
  outcome: MigrationOutcome
  /** One line per thing the migration reports say a real run would write. */
  reported: string[]
  /** True when the copy came out byte-different and not one report accounts for it. */
  changedWithNoReport: boolean
  /** Folders a crashed preview left beside the database, removed before this one: see `removeLeftoverPreviewCopies`. */
  leftoversRemoved: string[]
}

/**
 * A DATABASE TOO LARGE TO COPY INTO MEMORY IS MEASURED AGAINST A COPY ON DISK INSTEAD.
 *
 * SQLite cannot serialize a database larger than about 2 GiB (SQLITE_MAX_ALLOCATION_SIZE), so
 * `copyIntoMemory` failed with "Out of memory", the preview threw, and the guard refused to serve.
 * Measured on 3 October 2026: the live database passed 2 GiB (525,241 pages of 4,096 bytes) and the
 * office would not start (problem Blt6Dv5ieC3r). Above `THE_PREVIEW_SEAM.inMemoryLimit` the copy is a
 * file made with VACUUM INTO in a folder beside the database (see PREVIEW_FOLDER_PREFIX), which only reads the database being served, and that file is
 * compared with itself before and after the migrations by the same fingerprint as the in-memory copy.
 *
 * THE SIZE IS THE DATABASE'S OWN PAGES (page_count x page_size), not the size of the file on disk:
 * that is what `serialize` has to hold, it counts pages still in the write-ahead log, and it is
 * defined for a database with no file at all (`:memory:`, where a stat of the name throws).
 *
 * THE COPY IS COMPARED IN CHUNKS, never read whole. `readFileSync` refuses a file over 2 GiB
 * (ERR_FS_FILE_TOO_LARGE), and the first version of this path read the copy whole twice: measured in
 * wave 13p round 15 on a scratch database of the live one's shape, a copy that came out over 2 GiB made
 * the second read throw, so the guard would have refused to serve again as soon as the copy passed
 * 2 GiB. The copy is read one chunk at a time into one reused buffer, before and after, and only its
 * fingerprint is kept (see `theFingerprintOf`). Until wave 13y round 21 every chunk before was kept and every
 * chunk after read in beside them: two whole copies in memory at once. Measured on a made-up office of the live
 * size (2.80 GB): the start's high-water mark was 6.10 GB, and live's was 5.82 to 5.89 GB on 10 October 2026.
 */
const IN_MEMORY_COPY_LIMIT = 2_000_000_000
const COMPARE_CHUNK_BYTES = 64 * 1024 * 1024

/**
 * THE ONE SEAM INTO THE MEASUREMENT, for tests. Production never changes it. A test lowers the limit
 * to take the file path on a small database, lowers the chunk to compare across many chunks, or puts
 * a migration of its own in place of `migrateInPlace` to make a write no report explains — and puts
 * each value back afterwards. `stepsOnThisFile` is the same for a start with nothing pending, whose steps run on the
 * file itself and are rolled back.
 */
export const THE_PREVIEW_SEAM: {
  inMemoryLimit: number
  compareChunkBytes: number
  migrate: typeof migrateInPlace
  stepsOnThisFile: typeof everyDataStepIn
} = {
  inMemoryLimit: IN_MEMORY_COPY_LIMIT,
  compareChunkBytes: COMPARE_CHUNK_BYTES,
  migrate: migrateInPlace,
  stepsOnThisFile: everyDataStepIn,
}

/** Where the throwaway copy of this database is made: in memory, or in a file in a folder beside the database. */
export function whereTheCopyGoes(sqlite: Database.Database): 'memory' | 'file' {
  const pages = sqlite.pragma('page_count', { simple: true }) as number
  const size = sqlite.pragma('page_size', { simple: true }) as number
  return pages * size > THE_PREVIEW_SEAM.inMemoryLimit ? 'file' : 'memory'
}

/** A sentence for the start report naming the leftover copies a preview removed, or nothing when it removed none. */
function theLeftoversAsSaid(removed: readonly string[]): string {
  if (removed.length === 0) return ''
  return ` Before measuring, it removed ${removed.length === 1 ? 'a copy' : `${String(removed.length)} copies`} an earlier preview left behind: ${removed.join(', ')}.`
}

/** The copy, as the sentences an operator reads name it. */
export function theCopyAsSaid(where: 'memory' | 'file'): string {
  return where === 'memory' ? 'a throwaway copy held in memory' : 'a throwaway copy in a folder beside the database, removed afterwards'
}

/**
 * TWO FIELDS OF THE HEADER THAT MOVE WITHOUT ANY CONTENT MOVING: the file change counter (bytes 24 to 27) and
 * the version-valid-for number (bytes 92 to 95). Measured in wave 13p round 15: switching a copy to WAL and back
 * to DELETE changes exactly these eight bytes and no other, so the first version of the file path counted a
 * migration that switches the journal mode as a write, which its own comment said it could not. Any write of
 * content changes other bytes as well (the row's page, the schema cookie), so leaving these two out of the
 * comparison loses no write. Both paths compare the same way, through this one function.
 */
const COUNTERS_THAT_MOVE_WITHOUT_CONTENT: readonly [number, number][] = [
  [24, 28],
  [92, 96],
]

/** A copy of the first bytes of a database with the two counters zeroed, so they are left out of a comparison. */
function withTheCountersLeftOut(first: Buffer): Buffer {
  const copy = Buffer.from(first)
  for (const [from, to] of COUNTERS_THAT_MOVE_WITHOUT_CONTENT) if (copy.length >= to) copy.fill(0, from, to)
  return copy
}

/**
 * THE FINGERPRINT OF A DATABASE IMAGE: one SHA-256 over all its bytes in order, the two counters left out, and its
 * length. Two images compare equal when their fingerprints do. This is what both copies are compared by, so the
 * bytes before need not be held while the migrations run.
 *
 * WHAT THIS GIVES UP, SAID PLAINLY: it is no longer a byte-for-byte comparison. Two different images with the same
 * SHA-256 would compare equal. No such pair has ever been found for SHA-256, and these images are the office's own
 * database, not something an attacker chooses, so a write this misses is not one that can be expected to happen.
 * What it buys: until wave 13y round 21 both paths held a whole copy of the database to compare against, and the
 * file path held two (see IN_MEMORY_COPY_LIMIT).
 *
 * `pieces` are the image's bytes in order. The counters lie in the first 100 bytes, so the first piece must hold
 * them unless it is the whole image; a first piece shorter than that throws rather than compare the counters.
 */
function theFingerprintOf(pieces: Iterable<Buffer>): string {
  const hash = createHash('sha256')
  let length = 0
  for (const piece of pieces) {
    if (length === 0 && piece.length > 0) {
      const head = Math.min(piece.length, 100)
      hash.update(withTheCountersLeftOut(piece.subarray(0, head)))
      hash.update(piece.subarray(head))
    } else {
      if (length > 0 && length < 100) throw new Error(`The first piece of a database image was ${String(length)} bytes, too short to hold the header's counters.`)
      hash.update(piece)
    }
    length += piece.length
  }
  return `${hash.digest('hex')} ${String(length)}`
}

/**
 * A file's bytes in order, read in chunks no larger than `chunk` into ONE buffer used again for each, so a file over
 * 2 GiB can be fingerprinted while holding one chunk. Each piece is overwritten by the next: use it before asking for
 * the next one.
 */
function* piecesOf(path: string, chunk: number): Generator<Buffer> {
  const fd = openSync(path, 'r')
  try {
    const size = fstatSync(fd).size
    const buffer = Buffer.allocUnsafe(Math.min(chunk, size))
    for (let at = 0; at < size; at += chunk) {
      const piece = buffer.subarray(0, Math.min(chunk, size - at))
      let filled = 0
      while (filled < piece.length) {
        const read = readSync(fd, piece, filled, piece.length - filled, at + filled)
        if (read === 0) throw new Error(`${path} ended at ${String(at + filled)} bytes while ${String(size)} were expected.`)
        filled += read
      }
      yield piece
    }
  } finally {
    closeSync(fd)
  }
}

/**
 * WHERE THE FILE COPY IS MADE: A FOLDER BESIDE THE DATABASE, never the machine's temporary folder.
 *
 * The copy is as large as the database, and the database's own disk is the one known to hold a database that size.
 * A machine's temporary folder may be held in memory (tmpfs), which would bring back the memory problem this path
 * exists to avoid. Asking `node:os` for that folder is allowed only in the operating-system layer:
 * the hotfix e173b1703 made this file import `tmpdir`, and main was red from 10:32 on
 * 3 October 2026 until wave 13p round 15b moved the copy here.
 *
 * The folder is `.migration-preview-` and six letters from mkdtemp, removed in `finally`.
 */
const PREVIEW_FOLDER_PREFIX = '.migration-preview-'
/** Only a folder named exactly this is one this code made: the prefix and mkdtemp's six letters. */
const A_PREVIEW_FOLDER = /^\.migration-preview-[A-Za-z0-9]{6}$/u
/** What such a folder can hold: the copy and SQLite's own files beside it. */
const WHAT_A_PREVIEW_FOLDER_HOLDS = new Set(['copy.db', 'copy.db-journal', 'copy.db-wal', 'copy.db-shm'])
/** How long since anything in a folder changed before it counts as left behind. A preview takes minutes. */
const A_LEFTOVER_IS_UNCHANGED_FOR_MS = 60 * 60 * 1000

/**
 * A COPY LEFT BEHIND BY A CRASH, removed before the next preview. If the office dies mid-preview, `finally` never runs
 * and a folder as large as the database stays beside it. This removes, in the database's own folder only, each entry
 * that is all of these, and nothing else:
 *   - a directory (not a link) named exactly `.migration-preview-` and six letters or digits;
 *   - holding nothing but copy.db, copy.db-journal, copy.db-wal and copy.db-shm;
 *   - in which nothing has changed for an hour (the newest modification of the folder and of each file in it).
 * The hour is what keeps a preview that is running now safe, including another office's on the same database: a
 * running preview writes its copy within minutes. A clock that differs between two machines sharing one folder could
 * defeat it; one office per database is the setup this is written for.
 */
export function removeLeftoverPreviewCopies(home: string, now: number = Date.now()): string[] {
  const removed: string[] = []
  for (const name of readdirSync(home)) {
    if (!A_PREVIEW_FOLDER.test(name)) continue
    const dir = join(home, name)
    const it = lstatSync(dir)
    if (!it.isDirectory()) continue
    const inside = readdirSync(dir)
    if (inside.some((one) => !WHAT_A_PREVIEW_FOLDER_HOLDS.has(one))) continue
    const newest = Math.max(it.mtimeMs, ...inside.map((one) => lstatSync(join(dir, one)).mtimeMs))
    if (now - newest < A_LEFTOVER_IS_UNCHANGED_FOR_MS) continue
    rmSync(dir, { recursive: true, force: true })
    removed.push(dir)
  }
  return removed
}

function measureAgainstAFileCopy(
  sqlite: Database.Database,
  migrationsFolder: string,
  timing: MigrationsCheckTiming | null = null,
): Measured {
  if (sqlite.memory || sqlite.name === '' || sqlite.name === ':memory:') {
    throw new Error('A database with no file is above the in-memory limit, so its copy would go beside a file it does not have.')
  }
  const home = dirname(resolve(sqlite.name))
  beginPart(timing, THE_MIGRATIONS_CHECK_PARTS.theLeftoversRemoved)
  const leftoversRemoved = removeLeftoverPreviewCopies(home)
  endPart(timing, THE_MIGRATIONS_CHECK_PARTS.theLeftoversRemoved)
  const dir = mkdtempSync(join(home, PREVIEW_FOLDER_PREFIX))
  const path = join(dir, 'copy.db')
  const refusal = whyThisCheckoutMayNotOpenTheDatabase(path)
  if (refusal !== null) throw new Error(refusal)
  const chunk = THE_PREVIEW_SEAM.compareChunkBytes
  try {
    beginPart(timing, THE_MIGRATIONS_CHECK_PARTS.theFileCopied)
    sqlite.exec(`VACUUM INTO '${path.replace(/'/g, "''")}'`)
    endPart(timing, THE_MIGRATIONS_CHECK_PARTS.theFileCopied)
    // The copy's own journal mode, set before the first reading, so a migration that switches it
    // cannot pass for a write: it is set back the same way before the second reading.
    beginPart(timing, THE_MIGRATIONS_CHECK_PARTS.theJournalModeSet)
    const settle = new Database(path)
    settle.pragma('journal_mode = DELETE')
    settle.close()
    endPart(timing, THE_MIGRATIONS_CHECK_PARTS.theJournalModeSet)
    beginPart(timing, THE_MIGRATIONS_CHECK_PARTS.theFirstFingerprint)
    const before = theFingerprintOf(piecesOf(path, chunk))
    endPart(timing, THE_MIGRATIONS_CHECK_PARTS.theFirstFingerprint)
    const copy = new Database(path)
    copy.pragma('foreign_keys = ON')
    let outcome: ReturnType<typeof migrateInPlace>
    try {
      beginPart(timing, THE_MIGRATIONS_CHECK_PARTS.theCopyMigrated)
      outcome = THE_PREVIEW_SEAM.migrate(copy, migrationsFolder, null, timing)
      endPart(timing, THE_MIGRATIONS_CHECK_PARTS.theCopyMigrated)
      beginPart(timing, THE_MIGRATIONS_CHECK_PARTS.theJournalModeSetBack)
      copy.pragma('journal_mode = DELETE')
      endPart(timing, THE_MIGRATIONS_CHECK_PARTS.theJournalModeSetBack)
    } finally {
      copy.close()
    }
    beginPart(timing, THE_MIGRATIONS_CHECK_PARTS.theSecondFingerprint)
    const changed = theFingerprintOf(piecesOf(path, chunk)) !== before
    endPart(timing, THE_MIGRATIONS_CHECK_PARTS.theSecondFingerprint)
    beginPart(timing, THE_MIGRATIONS_CHECK_PARTS.theOutcomeReports)
    const reported = whatTheOutcomeReports(outcome, sqlite, migrationsFolder)
    endPart(timing, THE_MIGRATIONS_CHECK_PARTS.theOutcomeReports)
    return { outcome, reported, changedWithNoReport: changed && reported.length === 0, leftoversRemoved }
  } finally {
    beginPart(timing, THE_MIGRATIONS_CHECK_PARTS.theCopyFolderDeleted)
    rmSync(dir, { recursive: true, force: true })
    endPart(timing, THE_MIGRATIONS_CHECK_PARTS.theCopyFolderDeleted)
  }
}

/** Run the real migrations against a throwaway copy, in memory or in a file, and read both sensors. */
function measureAgainstACopy(
  sqlite: Database.Database,
  migrationsFolder: string,
  timing: MigrationsCheckTiming | null = null,
): Measured {
  if (whereTheCopyGoes(sqlite) === 'file') return measureAgainstAFileCopy(sqlite, migrationsFolder, timing)
  const { fingerprint, copy } = copyIntoMemory(sqlite, timing)
  try {
    beginPart(timing, THE_MIGRATIONS_CHECK_PARTS.theCopyMigrated)
    const outcome = THE_PREVIEW_SEAM.migrate(copy, migrationsFolder, null, timing)
    endPart(timing, THE_MIGRATIONS_CHECK_PARTS.theCopyMigrated)
    beginPart(timing, THE_MIGRATIONS_CHECK_PARTS.theSecondFingerprint)
    const changed = theFingerprintOf([copy.serialize()]) !== fingerprint
    endPart(timing, THE_MIGRATIONS_CHECK_PARTS.theSecondFingerprint)
    beginPart(timing, THE_MIGRATIONS_CHECK_PARTS.theOutcomeReports)
    const reported = whatTheOutcomeReports(outcome, sqlite, migrationsFolder)
    endPart(timing, THE_MIGRATIONS_CHECK_PARTS.theOutcomeReports)

    return { outcome, reported, changedWithNoReport: changed && reported.length === 0, leftoversRemoved: [] }
  } finally {
    copy.close()
  }
}

/** What a run of the migrations reports it would write, in one place for both kinds of copy. */
function whatTheOutcomeReports(
  outcome: ReturnType<typeof migrateInPlace>,
  sqlite: Database.Database,
  migrationsFolder: string,
): string[] {
    const reported: string[] = []

    if (outcome.newlyApplied > 0) {
      const tags = tagsARunApplies(sqlite, migrationsFolder)
      reported.push(
        `apply ${outcome.newlyApplied} schema migration${outcome.newlyApplied === 1 ? '' : 's'} that ` +
          `${outcome.newlyApplied === 1 ? 'has' : 'have'} not run against this database: ${tags.join(', ')}. ` +
          `Whether one of those moves rows cannot be known without running it — 0004 rebuilds three tables ` +
          `and copies every row through them, and it is a generated schema file like the rest.`,
      )
    }
    // EVERY STEP THAT WROTE SOMETHING GETS A LINE, AND NO STEP THAT DID NOT. Both halves come from
    // the same function on the same table, so there is no way to report a write with no line and no
    // way to write a line for a step that wrote nothing. Before this commit these were fifteen
    // hand-written clauses and one of the seven steps had none at all.
    for (const step of THE_STEPS) {
      if (step.wrote(outcome) === 0) continue
      reported.push(`${step.name}: ${step.line(outcome)}`)
    }

    return reported
}

/**
 * A START WITH NO MIGRATION PENDING MAKES NO COPY. It runs every data step on the served file itself, inside one
 * transaction that is always rolled back, and reads three things inside that transaction: what each step reports,
 * SQLite's count of rows changed on this connection (`total_changes()`), and the schema version
 * (`PRAGMA schema_version`). Any of them showing a write is a refusal, as on a copy; see
 * `whatTheRolledBackRunWouldWrite`.
 *
 * WHY THE TWO COUNTS ARE ENOUGH HERE AND NOT WITH A MIGRATION PENDING. With nothing pending no schema migration runs,
 * only the data steps. SQLite counts every row an INSERT, UPDATE or DELETE writes, a trigger's rows included, in
 * `total_changes()`, and every table, index or trigger made, changed or dropped moves the schema version. A pending
 * schema migration may be any SQL at all, so that case still runs on a copy and compares its bytes.
 */
function measureOnThisFile(
  sqlite: Database.Database,
  migrationsFolder: string,
  timing: MigrationsCheckTiming | null,
): { outcome: MigrationOutcome; wouldWrite: string[]; leftoverCopiesRemoved: string[] } {
  // COPIES AN EARLIER PREVIEW LEFT ARE STILL REMOVED on this path, which makes none of its own.
  beginPart(timing, THE_MIGRATIONS_CHECK_PARTS.theLeftoversRemoved)
  const leftoverCopiesRemoved =
    sqlite.memory || sqlite.name === '' || sqlite.name === ':memory:' ? [] : removeLeftoverPreviewCopies(dirname(resolve(sqlite.name)))
  endPart(timing, THE_MIGRATIONS_CHECK_PARTS.theLeftoversRemoved)
  beginPart(timing, THE_MIGRATIONS_CHECK_PARTS.theStepsRolledBack)
  const ran = runTheStepsAndRollThemBack(sqlite, migrationsFolder, timing)
  endPart(timing, THE_MIGRATIONS_CHECK_PARTS.theStepsRolledBack)
  beginPart(timing, THE_MIGRATIONS_CHECK_PARTS.theOutcomeReports)
  const reported = whatTheOutcomeReports(ran.outcome, sqlite, migrationsFolder)
  endPart(timing, THE_MIGRATIONS_CHECK_PARTS.theOutcomeReports)
  return {
    outcome: ran.outcome,
    wouldWrite: whatTheRolledBackRunWouldWrite(reported, ran.changedRows, ran.schemaVersion),
    leftoverCopiesRemoved,
  }
}

/** What a start says when the transaction the data steps ran in on the served file had ended before it could roll it back. */
export const THE_ROLLED_BACK_RUN_ENDED =
  'The transaction the data steps ran in on this file had ended before this check could roll it back. Something in ' +
  'the steps ended it, so what they wrote before then may have been stored in this file.'

/** The data steps ended the transaction they ran in on the served file. `stepsSaid` is what they threw, or null when they returned. */
class TheRolledBackRunEnded extends Error {
  constructor(readonly stepsSaid: unknown) {
    super(THE_ROLLED_BACK_RUN_ENDED)
  }
}

/**
 * THE DATA STEPS ON THE SERVED FILE, UNDER ITS WRITE LOCK, AND EVERY ONE OF THEM ROLLED BACK. The counts are read
 * inside the transaction, before the rollback, because the rollback puts the rows and the schema version back. Every
 * way out after the lock is taken, a step that throws included, rolls back, so the file is left as it was found.
 *
 * THE TRANSACTION IS STILL OPEN WHEN THE STEPS END, or this refuses with `THE_ROLLED_BACK_RUN_ENDED`: a step that ended
 * it may have stored what it wrote, and the rollback would then put back nothing. It is asked whether the steps
 * returned or threw, because a step that commits inside a transaction of its own throws as that transaction closes.
 *
 * `whenStored` (./told-when-stored.ts) REFUSES WHILE THIS RUNS. Its frames do not see the bare `BEGIN IMMEDIATE` this
 * opens, so a step that asked it would be told about a write this then rolls back. No data step asks it today.
 */
function runTheStepsAndRollThemBack(
  sqlite: Database.Database,
  migrationsFolder: string,
  timing: MigrationsCheckTiming | null,
): { outcome: MigrationOutcome; changedRows: { before: number; after: number }; schemaVersion: { before: number; after: number } } {
  const file = sqlite.name
  const migrations = theMigrationsInTheFolder(migrationsFolder)
  const changedRows = (): number => (sqlite.prepare('SELECT total_changes() AS n').get() as { n: number }).n
  const schemaVersion = (): number => sqlite.pragma('schema_version', { simple: true }) as number
  const lockedAt = Date.now()
  beginPart(timing, THE_MIGRATIONS_CHECK_PARTS.theWriteLockTaken)
  takeTheWriteLock(sqlite, file)
  endPart(timing, THE_MIGRATIONS_CHECK_PARTS.theWriteLockTaken)
  try {
    THE_ROLLED_BACK_RUN.open = true
    beginPart(timing, THE_MIGRATIONS_CHECK_PARTS.theStartRead)
    const before = countAll(sqlite)
    const alreadyApplied = theJournalRows(sqlite).length
    refuseAnOfficeWithNoOwnerToWrite(sqlite)
    endPart(timing, THE_MIGRATIONS_CHECK_PARTS.theStartRead)
    const rowsBefore = changedRows()
    const schemaBefore = schemaVersion()
    let steps: DataSteps
    try {
      steps = THE_PREVIEW_SEAM.stepsOnThisFile(sqlite, migrations, null, timing)
    } catch (stepsSaid) {
      if (!sqlite.inTransaction) throw new TheRolledBackRunEnded(stepsSaid)
      throw stepsSaid
    }
    if (!sqlite.inTransaction) throw new TheRolledBackRunEnded(null)
    const rowsAfter = changedRows()
    const schemaAfter = schemaVersion()
    const after = countAll(sqlite)
    const newlyApplied = theJournalRows(sqlite).length - alreadyApplied
    return {
      outcome: theOutcomeOf(
        { file, at: nowStamp(), before, after, alreadyApplied, newlyApplied, heldTheWriteLockMs: Date.now() - lockedAt },
        steps,
      ),
      changedRows: { before: rowsBefore, after: rowsAfter },
      schemaVersion: { before: schemaBefore, after: schemaAfter },
    }
  } finally {
    THE_ROLLED_BACK_RUN.open = false
    if (sqlite.inTransaction) sqlite.exec('ROLLBACK')
  }
}

/**
 * WHAT A RUN ON THE SERVED FILE WOULD WRITE, judged from what it read before it was rolled back. The steps' own lines
 * when any step reports a write. Otherwise, one line for a write no report names when SQLite's count of changed rows
 * or the schema version moved. Otherwise nothing, and the start serves.
 */
export function whatTheRolledBackRunWouldWrite(
  reported: readonly string[],
  changedRows: { before: number; after: number },
  schemaVersion: { before: number; after: number },
): string[] {
  if (reported.length > 0) return [...reported]
  const moved: string[] = []
  const rows = changedRows.after - changedRows.before
  if (rows !== 0) moved.push(`SQLite counted ${String(rows)} changed row${rows === 1 ? '' : 's'}`)
  if (schemaVersion.after !== schemaVersion.before) {
    moved.push(`the schema version went from ${String(schemaVersion.before)} to ${String(schemaVersion.after)}`)
  }
  if (moved.length === 0) return []
  return [
    aWriteNoReportNames(
      `${moved.join(' and ')} while the data steps ran on this file`,
      ' They ran inside one transaction that was rolled back, so none of it was written.',
    ),
  ]
}

/** The line for a write no migration report names: `whatMoved` is what showed it, `more` what follows the steps. */
function aWriteNoReportNames(whatMoved: string, more: string): string {
  return (
    `write something none of the ${THE_STEPS.length} migration reports names: ${whatMoved}, and every report said it ` +
    'had nothing to do. Nothing here can say what the difference is, which is why this is a refusal rather than a ' +
    `shrug. The steps that were asked: ${namesOfTheSteps()}.${more}`
  )
}

/**
 * THE LINE FOR A WRITE NOTHING CAN NAME, and what folding the log in did about it.
 *
 * The two sensors disagreeing is itself a finding, and the loud one wins. A write nothing can name
 * is the worst of the two cases, not the safest: it is the one where the report an operator would
 * act on does not cover what would happen.
 */
function theUnexplainedDifference(settled: LogSettled): string {
  const aboutTheLog =
    settled.settled === 'folded in'
      ? `The write-ahead log was folded into the file and the measurement taken again (${String(settled.pagesMoved)} ` +
        'pages moved, no rows), so it is not the log that differs.'
      : settled.settled === 'could not'
        ? `The image was taken over a write-ahead log that is still there, because ${settled.because} That alone ` +
          'can make the two images differ. Run PRAGMA wal_checkpoint(TRUNCATE) on this file with nothing else ' +
          'reading it, then start again.'
        : 'The write-ahead log was not asked about.'
  return aWriteNoReportNames('the copy came out byte-different from the image it was made from', ` ${aboutTheLog}`)
}

/**
 * IS THIS FILE A MOLE OFFICE DATABASE, AND IS IT INTACT — asked before anything reads or writes it.
 *
 * ---------------------------------------------------------------------------------------
 * THE TWO SILENT CASES THIS EXISTS FOR, BOTH MEASURED ON 2026-08-12
 * ---------------------------------------------------------------------------------------
 *
 * CORRUPTION. 200 zero bytes were written into the middle of a copy of the live corpus. SQLite's
 * own `pragma integrity_check` says `Tree 190 page 199: btreeInitPage() returns error code 11 /
 * wrong # of entries in index links_from_idx`. `npm run db:migrate` said:
 *
 *     migrations: no new migrations (7 already applied) … rows records 429 -> 429, links 428 -> 428
 *
 * — exit 0, a full success report. The server then started, `GET /api/health` answered 200, and
 * `POST /api/records` answered 201: new work went on being written into it. What was actually
 * broken was one index, so 87 of the ~200 record ids with outgoing links returned HTTP 500. Nothing
 * in Mole Office had ever run `integrity_check`, on any path.
 *
 * ADOPTION. `npm run db:migrate` pointed at somebody else's SQLite file — one table, `my_recipes`,
 * one row — created all twelve Mole Office tables inside it and exited 0. A typo in `MOLE_OFFICE_DB` that
 * lands on a real file writes Mole Office's schema into it, and nothing says a word.
 *
 * Both are the same failure: reading a file that is not the file we were promised, and reporting
 * success. This is the check, and it is 3.7 ms on the 1.6 MB live corpus — cheaper than the
 * migration preview that already runs on every start.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT DOES NOT DO
 * ---------------------------------------------------------------------------------------
 *
 * It never repairs anything and never deletes anything. A corrupt database is still the only copy
 * of somebody's work, and `.recover` on it is a decision with losses in it — the operator's, not
 * this function's. It refuses, names the file, and says what to run.
 *
 * An EMPTY file is not an objection. A fresh clone, a test's scratch file and a database that has
 * only just been created all have nothing in them, and creating the tables is exactly what they are
 * for. The stranger test is about a file holding data that is somebody else's, which is a different
 * fact from a file holding nothing.
 */
/** The first half of `databaseObjection`: a database holding somebody else's tables, or null. */
function strangerObjection(sqlite: Database.Database): string | null {
  const file = sqlite.name

  const tables = (
    sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all() as {
      name: string
    }[]
  ).map((t) => t.name)

  // Mole Office's own marks: the table everything hangs off, and the journal drizzle writes. Either one
  // is enough — a database part-way through its first migration has the journal and not yet the
  // records table, and it is ours.
  const oursByName = tables.includes('records') || tables.includes(THE_MIGRATION_JOURNAL_TABLE)
  if (!oursByName && tables.length > 0) {
    return (
      `${REFUSING_TO_USE} ${file}. It is a SQLite database, but it is not Mole Office's: it holds ` +
      `${tables.length} table${tables.length === 1 ? '' : 's'} (${tables.slice(0, 6).join(', ')}` +
      `${tables.length > 6 ? ', …' : ''}) and none of them is Mole Office's. Creating Mole Office's tables inside ` +
      `somebody else's database is what this used to do, silently — the usual cause is a typo in MOLE_OFFICE_DB ` +
      `that lands on a real file. NOTHING HAS BEEN WRITTEN. Point MOLE_OFFICE_DB at Mole Office's database, or at a ` +
      `path that does not exist yet if you want a new one.`
    )
  }
  return null
}

/**
 * The second half of `databaseObjection`: what SQLite's integrity check says about `file`, as a refusal, or null
 * when it says `ok`. `runTheCheck` runs the check, on whichever connection the caller has, and may throw.
 */
function integrityObjection(file: string, runTheCheck: () => { integrity_check: string }[]): string | null {
  // Only then integrity, so that a stranger's file is named as a stranger's file rather than as a
  // corrupt Mole Office one.
  //
  // THE CHECK ITSELF CAN THROW, and the first version of this function did not allow for it. On a
  // database damaged badly enough — 200 zero bytes punched into the middle of the live corpus —
  // `pragma('integrity_check')` raises `SqliteError: database disk image is malformed` instead of
  // returning rows, so the careful sentence below never printed and the operator got a stack trace
  // out of `node_modules/better-sqlite3/lib/methods/pragma.js`, which is the thing this function
  // exists to replace. Found by running it, not by reading it.
  let said: string[]
  try {
    const check = runTheCheck()
    if (check.length === 1 && check[0]?.integrity_check === 'ok') return null
    said = check.map((row) => row.integrity_check).slice(0, 5)
  } catch (err) {
    // SQLite could not even complete the check. That IS the answer, and it is the worst one.
    said = [err instanceof Error ? err.message : String(err), '(the integrity check could not run to the end)']
  }
  return (
    `${REFUSING_TO_USE} ${file}. SQLite says this database is DAMAGED, and Mole Office will not migrate, serve or ` +
    `write to a damaged one — a broken index reads as a working database until the query that needs it ` +
    `returns a 500, and by then more work has been written into it. What the check said:\n\n` +
    said.map((line) => `  ${line}`).join('\n') +
    `\n\nNOTHING HAS BEEN WRITTEN. This file is still whatever it was, so keep it — it may be the only copy, ` +
    `and salvage works better from it than from nothing. What to do:\n\n` +
    `  Check your most recent backup FIRST, then put it in place:\n` +
    `      npm run db:backup -- --check-only <backup>.db\n` +
    `      cp <backup>.db ${file}\n` +
    `  If there is no backup, salvage what can be read — this LOSES the damaged pages:\n` +
    `      sqlite3 ${file} ".recover" | sqlite3 recovered.db\n\n` +
    `Taking the salvage route is a decision with losses in it, so Mole Office does not take it for you.`
  )
}

/** Both halves, in that order: a stranger's file is named as one before integrity is asked (see above). */
export function databaseObjection(sqlite: Database.Database): string | null {
  return strangerObjection(sqlite) ?? integrityObjection(sqlite.name, () => sqlite.pragma('integrity_check') as { integrity_check: string }[])
}

/**
 * THE INTEGRITY CHECK, RUN BESIDE THE MIGRATION PREVIEW RATHER THAN BEFORE IT, and still decided first.
 *
 * Measured in wave 13p round 15 on a scratch database of the live one's shape (2.16 GB, warm): the integrity check
 * takes about 6 s and the preview about 17 s, one after the other 23 s. Both only read the database being served, so
 * the check runs on a read-only connection of its own in a worker thread while the preview measures its copy, and the
 * start took 17.2 s. Cold, the check alone took 43 s, so a cold start is not under 20 s by this.
 *
 * WHAT DOES NOT CHANGE: the check is the same `integrity_check`, and its answer still decides first. A damaged file
 * is refused whatever the preview found; nothing is written to the real file before the answer is in, because the one
 * write the preview can make (folding the log in, `settleTheLog`) waits for it; and the empty or seed-only branch,
 * which migrates in place, asks the check on this connection before it writes, as before. A start with no migration
 * pending runs the data steps on the real file inside a transaction it rolls back (`measureOnThisFile`), and waits for
 * the answer after the rollback: nothing is committed before the answer is in.
 *
 * WHEN IT CANNOT RUN BESIDE: a database with no file (`:memory:`), or a worker that does not answer. The same check
 * then runs on this connection when the answer is needed, and the start report says which happened and why.
 */
export interface IntegrityBeside {
  /** The refusal the check makes, or null when it says ok. Waits for the answer the first time; the same after. */
  wait(): string | null
  /** A sentence for the start report: where the check ran, and why there. */
  said(): string
}

/** How long the worker may take before the check is run on this connection instead. Ten minutes is far past 43 s. */
const INTEGRITY_BESIDE_LIMIT_MS = 10 * 60 * 1000

/** The worker constructor is replaceable so its clock can be controlled in a test. */
export const THE_INTEGRITY_WORKER_SEAM = {
  start: (source: string, options: ConstructorParameters<typeof Worker>[1]): Worker => new Worker(source, options),
}

export function startTheIntegrityCheckBeside(
  sqlite: Database.Database,
  timing: MigrationsCheckTiming | null = null,
): IntegrityBeside {
  const file = sqlite.name
  const here = (): { integrity_check: string }[] => sqlite.pragma('integrity_check') as { integrity_check: string }[]
  let answer: { objection: string | null } | null = null
  let where = ''
  let integritySaid = false
  const sayTheIntegrityTiming = (said: string): void => {
    if (integritySaid) return
    integritySaid = true
    sayPart(timing, said)
  }
  const runHere = (): string | null => {
    const began = timing === null ? null : readMonotonicClock()
    try {
      return integrityObjection(file, here)
    } finally {
      try {
        const ended = timing === null ? null : readMonotonicClock()
        if (began !== null && ended !== null) {
          const took = Math.round(ended - began)
          sayTheIntegrityTiming(
            `the integrity check ran on this connection for ${String(took)} ms, and the start waited the same ${String(took)} ms for it`,
          )
        }
      } catch {
        // Timing and its formatting cannot replace the integrity answer.
      }
    }
  }
  const onThisConnection = (because: string): IntegrityBeside => ({
    wait() {
      if (answer === null) answer = { objection: runHere() }
      return answer.objection
    },
    said: () => `The integrity check ran on this connection after the preview, because ${because}.`,
  })
  if (sqlite.memory || file === '' || file === ':memory:') return onThisConnection('the database has no file to open a second connection on')
  const refusal = whyThisCheckoutMayNotOpenTheDatabase(file)
  if (refusal !== null) throw new Error(refusal)
  let worker: Worker
  const done = new Int32Array(new SharedArrayBuffer(4))
  const { port1, port2 } = new MessageChannel()
  try {
    const driver = createRequire(import.meta.url).resolve('better-sqlite3')
    worker = THE_INTEGRITY_WORKER_SEAM.start(
      `const { workerData } = require('node:worker_threads')
      const readMonotonicClock = ${readMonotonicClock.toString()}
      let message
      try {
        const Database = require(workerData.driver)
        const db = new Database(workerData.file, { readonly: true, fileMustExist: true })
        try {
          const began = workerData.measure ? readMonotonicClock() : null
          let ended = null
          let rows
          try { rows = db.pragma('integrity_check') }
          finally { ended = workerData.measure ? readMonotonicClock() : null }
          let duration = null
          try { if (began !== null && ended !== null) duration = Math.max(0, Math.round(ended - began)) } catch {}
          message = { rows, duration }
        } finally { db.close() }
      } catch (err) {
        message = { error: err instanceof Error ? err.message : String(err) }
      } finally {
        workerData.port.postMessage(message ?? { error: 'the worker ended with no answer' })
        Atomics.store(workerData.done, 0, 1)
        Atomics.notify(workerData.done, 0)
      }`,
      // NO LOADER ARGUMENTS: the code above is plain JavaScript and needs none, and a loader inherited from the parent
      // (tsx, a test runner's) would be one more thing to start while the parent's thread waits in Atomics.wait below.
      { eval: true, execArgv: [], workerData: { file, driver, done, port: port2, measure: timing !== null }, transferList: [port2] },
    )
    worker.unref()
  } catch (err) {
    return onThisConnection(`a worker could not be started: ${err instanceof Error ? err.message : String(err)}`)
  }
  return {
    wait() {
      if (answer !== null) return answer.objection
      const waitBegan = timing === null ? null : readMonotonicClock()
      const waited = Atomics.wait(done, 0, 0, INTEGRITY_BESIDE_LIMIT_MS)
      const waitEnded = timing === null ? null : readMonotonicClock()
      const got = receiveMessageOnPort(port1)?.message as
        | { rows?: { integrity_check: string }[]; error?: string; duration?: number | null }
        | undefined
      void worker.terminate()
      port1.close()
      if (waited === 'timed-out' || got === undefined) {
        where = `the worker gave no answer${waited === 'timed-out' ? ` within ${INTEGRITY_BESIDE_LIMIT_MS / 60000} minutes` : ''}, so it ran on this connection afterwards`
        answer = { objection: runHere() }
      } else if (got.error !== undefined && got.rows === undefined && /no such file|unable to open|SQLITE_CANTOPEN/iu.test(got.error)) {
        where = `the worker could not open the file read-only (${got.error}), so it ran on this connection afterwards`
        answer = { objection: runHere() }
      } else {
        where = 'on a read-only connection of its own while the migrations were measured'
        try {
          if (typeof got.duration === 'number' && Number.isFinite(got.duration) && waitBegan !== null && waitEnded !== null) {
            const wasWaited = Math.max(0, Math.round(waitEnded - waitBegan))
            sayTheIntegrityTiming(
              enWave14c['start.integrityOwnConnection']
                .replace('{duration}', String(got.duration))
                .replace('{wait}', String(wasWaited)),
            )
          }
        } catch {
          // Timing and its formatting cannot replace the integrity answer.
        }
        answer = {
          objection: integrityObjection(file, () => {
            if (got.rows !== undefined) return got.rows
            throw new Error(got.error)
          }),
        }
      }
      return answer.objection
    },
    said: () => `The integrity check ran ${where === '' ? 'beside the preview' : where}.`,
  }
}


/** Whether a server may serve this database, and what to say either way. */
export type ServeDecision =
  | { serve: true; report: string }
  | {
      serve: false
      refusal: string
      /**
       * Set only on the refusal for a database that is not up to date and holds work, where bringing it up to date
       * would write: what it holds, what the migrations would write, in their own words, and how that was measured. An
       * installed office offers its owner one press from these (src/server/lib/the-update.ts); a checkout prints the
       * refusal.
       */
      update?: { holds: string; wouldWrite: string[]; measuredOn: TheUpdateOffer['measuredOn'] }
    }

/**
 * THE RULE A SERVER START OBEYS. Bring the database up to date if that can move nothing, and
 * otherwise refuse to serve it and say what would have been written.
 *
 * The two guarantees this holds at once, which is the only reason it is one function:
 *
 *   A SERVER NEVER SERVES A HALF-MIGRATED DATABASE. That is what the previous fix was right about:
 *   a boot that applied the schema files and skipped the data migrations left `records.origin`
 *   empty and `task.blocked_by` in a field no write path reads, and nothing said so. Here, a
 *   database that is not fully up to date is not served at all.
 *
 *   A SERVER NEVER MIGRATES A DATABASE NOBODY ASKED IT TO. `tsx watch` restarts on every file save;
 *   a data migration must not be triggered by an editor.
 *
 * The report is printed on EVERY start, including the quiet one, for the reason `describeOutcome`
 * gives: "nothing to migrate" and "nobody checked" are different facts and only one of them is
 * good news.
 */
export function prepareToServe(
  sqlite: Database.Database,
  migrationsFolder: string = MIGRATIONS_FOLDER,
  // OPTIONAL, AND A CALL WITHOUT IT IS UNCHANGED. It only records how long each part of this check took.
  timing: MigrationsCheckTiming | null = null,
): ServeDecision {
  const file = sqlite.name

  // IS IT OUR FILE AND IS IT INTACT, before any of the reasoning below, all of which assumes both.
  // A damaged database used to pass every check here and be served; see `databaseObjection`.
  // Whose file it is is asked now. Whether it is intact is asked now on the branch that writes in place, and on the
  // preview branch beside the preview, decided first all the same (`startTheIntegrityCheckBeside`).
  beginPart(timing, THE_MIGRATIONS_CHECK_PARTS.theStrangerCheck)
  const stranger = strangerObjection(sqlite)
  endPart(timing, THE_MIGRATIONS_CHECK_PARTS.theStrangerCheck)
  if (stranger !== null) return { serve: false, refusal: stranger }

  // NOTHING HERE ANYBODY WOULD MISS, either because there is nothing in it — a fresh clone, the
  // file a test builds — or because every record in it says it came out of the seed, which is the
  // database `tools/review.mjs` photographs and the one README's setup sequence leaves behind.
  // Migrate it in place exactly as before, and print the whole report as the command does.
  beginPart(timing, THE_MIGRATIONS_CHECK_PARTS.whatTheFileHolds)
  const holdsNothingToKeep = irreplaceableRows(sqlite) === 0 || everyRecordCameFromTheSeed(sqlite)
  endPart(timing, THE_MIGRATIONS_CHECK_PARTS.whatTheFileHolds)
  if (holdsNothingToKeep) {
    beginPart(timing, THE_MIGRATIONS_CHECK_PARTS.theFileIsIntact)
    const damaged = databaseObjection(sqlite)
    endPart(timing, THE_MIGRATIONS_CHECK_PARTS.theFileIsIntact)
    if (damaged !== null) return { serve: false, refusal: damaged }
    beginPart(timing, THE_MIGRATIONS_CHECK_PARTS.theFileMigratedInPlace)
    const outcome = migrateInPlace(sqlite, migrationsFolder, null, timing)
    endPart(timing, THE_MIGRATIONS_CHECK_PARTS.theFileMigratedInPlace)
    return { serve: true, report: describeOutcome(outcome) }
  }

  beginPart(timing, THE_MIGRATIONS_CHECK_PARTS.theIntegrityStarted)
  const integrity = startTheIntegrityCheckBeside(sqlite, timing)
  endPart(timing, THE_MIGRATIONS_CHECK_PARTS.theIntegrityStarted)
  // WHERE THE MIGRATIONS ARE MEASURED, chosen from the journal: on a copy when a migration is pending, and on this file
  // itself, in a transaction that is rolled back, when none is (`measureOnThisFile`). Null until the journal is read.
  let measuredOn: TheUpdateOffer['measuredOn'] | null = null
  let measured: { outcome: MigrationOutcome; wouldWrite: string[]; leftoverCopiesRemoved: string[] }
  try {
    beginPart(timing, THE_MIGRATIONS_CHECK_PARTS.thePendingRead)
    const pending = tagsARunApplies(sqlite, migrationsFolder)
    endPart(timing, THE_MIGRATIONS_CHECK_PARTS.thePendingRead)
    if (pending.length === 0) {
      measuredOn = 'this file'
      measured = measureOnThisFile(sqlite, migrationsFolder, timing)
    } else {
      measuredOn = 'a copy'
      const preview = previewMigration(
        sqlite,
        migrationsFolder,
        () => {
          const damaged = integrity.wait()
          if (damaged !== null) throw new Error('the integrity check refused this file, so the log is not folded in')
        },
        timing,
      )
      if (preview.logSettled.settled === 'folded in') {
        sayPart(timing, 'a second measure ran after the write-ahead log was folded in')
      } else if (preview.logSettled.settled === 'not needed') {
        sayPart(timing, 'no second measure ran: the write-ahead log was not folded in')
      } else {
        sayPart(timing, 'no second measure ran: the write-ahead log could not be folded in')
      }
      measured = preview
    }
  } catch (err) {
    // A DAMAGED FILE IS NAMED AS DAMAGED, whatever the preview did on it: a copy of a damaged file can fail in any way.
    beginPart(timing, THE_MIGRATIONS_CHECK_PARTS.theIntegrityWaited)
    const damaged = integrity.wait()
    endPart(timing, THE_MIGRATIONS_CHECK_PARTS.theIntegrityWaited)
    // A RUN THE STEPS ENDED IS SAID BEFORE A DAMAGED FILE, and with no update to offer. The damaged file's refusal and
    // the one below both say that nothing has been written, and here that may be false.
    if (err instanceof TheRolledBackRunEnded) {
      const said = err.stepsSaid === null ? null : err.stepsSaid instanceof Error ? err.stepsSaid.message : String(err.stepsSaid)
      const trace = err.stepsSaid instanceof Error && typeof err.stepsSaid.stack === 'string' ? err.stepsSaid.stack : null
      return {
        serve: false,
        refusal:
          `${REFUSING_TO_SERVE} ${file}. It holds ${describeHoldings(sqlite)}. No migration is pending, so this check ` +
          `ran the data steps on this file itself, inside one transaction it always rolls back, and made no copy of ` +
          `it. ${THE_ROLLED_BACK_RUN_ENDED} This check cannot tell what was stored.` +
          (damaged === null ? '' : " SQLite's integrity check also found this file damaged.") +
          (said === null ? '' : `\n\nWhat the steps said:\n\n${said}`) +
          `\n\nUntil that is settled this database is not served.\n` +
          (trace === null ? '' : `\nWhere it happened, for whoever fixes Mole Office:\n${trace}\n`),
      }
    }
    if (damaged !== null) return { serve: false, refusal: damaged }
    /**
     * A MIGRATION THAT REFUSED OR FELL OVER IS A REASON NOT TO SERVE, NOT A REASON TO CRASH.
     *
     * THIS USED TO RETHROW, AND THAT IS THE DEFECT THIS BLOCK IS. `start()` in src/server/index.ts
     * calls `prepareToServe` and throws its refusal itself; a throw from in here went past that and
     * out of `start()` as an uncaught error, so the server EXITED 1 AND NEVER LISTENED with a stack
     * where the refusal should have been. Measured on 1 September 2026 on a copy of the live
     * corpus: one answer posted by `tools/agent-worker.mjs` — `npm run agent`, the shipped worker —
     * left a message no run could date, `migrateAgentDispatch` refused, and the next start died
     * printing a stack and an instruction written for whoever writes migrations. The owner got
     * neither what their database holds nor what to do about it.
     *
     * SO IT REFUSES, IN THE SHAPE EVERY OTHER REFUSAL TAKES: what the file holds, that nothing has
     * been written, what the migrations said in their own words, and the command to run. The
     * refusal itself is not softened — a database that cannot be brought up to date is still not
     * served, and that is right.
     *
     * IT DOES NOT SORT REFUSALS FROM FAULTS, on purpose. Either way this server may not serve this
     * file, either way nothing has been written, and either way the sentence a person needs is the
     * one the migrations printed. What a fault adds is the trace, and that is kept at the bottom
     * for whoever fixes Mole Office rather than dropped to keep the message tidy.
     */
    const why = err instanceof Error ? err.message : String(err)
    const trace = err instanceof Error && typeof err.stack === 'string' ? err.stack : null
    const how =
      measuredOn === 'a copy'
        ? `the migrations ran against ${theCopyAsSaid(whereTheCopyGoes(sqlite))}, ` +
          `and no row of this file was changed. Its write-ahead log was folded into it first, ` +
          `which moves committed pages and no rows.`
        : measuredOn === 'this file'
          ? 'no migration is pending, so this check runs the data steps on this file itself, inside one transaction it ' +
            'always rolls back, and makes no copy of it. Whatever ran before the refusal below was rolled back.'
          : 'no migration ran, because which migrations are pending could not be read.'
    return {
      serve: false,
      refusal:
        `${REFUSING_TO_SERVE} ${file}. It holds ${describeHoldings(sqlite)}, and working out whether it needs ` +
        `migrating did not finish. NO ROW HAS BEEN CHANGED: ${how}\n\n` +
        `What the migrations said:\n\n${why}\n\n` +
        `Until that is settled this database is not served. Take a copy and run the migrations deliberately — ` +
        `that prints the whole report, about the file it is actually changing:\n\n` +
        `    npm run db:backup && MOLE_OFFICE_DB=${file} npm run db:migrate\n` +
        (trace === null
          ? ''
          : `\nWhere it happened, for whoever fixes Mole Office. A migration REFUSING is an ordinary answer and ` +
            `this trace says nothing about whether it was one:\n${trace}\n`),
    }
  }

  beginPart(timing, THE_MIGRATIONS_CHECK_PARTS.theIntegrityWaited)
  const damaged = integrity.wait()
  endPart(timing, THE_MIGRATIONS_CHECK_PARTS.theIntegrityWaited)
  if (damaged !== null) return { serve: false, refusal: damaged }

  const onThisFile = measuredOn === 'this file'
  if (measured.wouldWrite.length === 0) {
    const applied = measured.outcome.alreadyApplied
    return {
      serve: true,
      report:
        `migrations: nothing to do for ${file} (${applied} schema migration${applied === 1 ? '' : 's'} applied; ` +
        // COMPUTED FROM THE STEP LIST RATHER THAN TYPED. This sentence named six of the seven steps
        // there were before window B and the missing one was `reviews`; a seventh name typed here
        // would have been the same defect one step later, and window B adds nine more.
        `${namesOfTheSteps()} each report nothing to write). ` +
        (onThisFile
          ? 'Measured by running them on this file itself, inside one transaction that was rolled back: no step ' +
            "reported a write, and neither SQLite's count of changed rows nor its schema version moved. No row of the " +
            'file was changed, and no copy of it was made. '
          : `Measured by running them against ${theCopyAsSaid(whereTheCopyGoes(sqlite))}, which came out identical. ` +
            'No row of the file was changed; its write-ahead log was folded into it before the copy was taken, which ' +
            'moves committed pages and no rows. ') +
        `${integrity.said()}${theLeftoversAsSaid(measured.leftoverCopiesRemoved)} \`npm run db:migrate\` prints the whole report.`,
    }
  }

  const holds = describeHoldings(sqlite)
  return {
    serve: false,
    update: { holds, wouldWrite: measured.wouldWrite, measuredOn },
    refusal:
      `${REFUSING_TO_SERVE} ${file}. It holds ${holds}, it is NOT up to date, and ` +
      `bringing it up to date would write to it. Starting a server must never do that: \`npm run dev\` runs ` +
      `under \`tsx watch\`, so every save of a server file restarts it, and a migration that moves data would ` +
      `then run unattended at a moment nobody chose. NO ROW HAS BEEN CHANGED — what a migration would write was ` +
      (onThisFile
        ? 'measured by running the real data steps on this file itself, inside one transaction that was rolled back, ' +
          'so no row of this file was changed and no copy of it was made.\n\n'
        : `measured by running the real migrations against ${theCopyAsSaid(whereTheCopyGoes(sqlite))}, and no row of ` +
          'this file was changed.\n\n') +
      // IT USED TO SAY "NOTHING HAS BEEN CHANGED … the file itself was only read", and that is false
      // for a database not already in WAL mode. Opening it runs `journal_mode = WAL` in
      // db/client.ts, 39 lines before this check, which rewrites the header and creates -wal and
      // -shm. No row content moves. But an operator verifying this sentence the obvious way — hash
      // the file before and after — was measured getting a different hash and a message telling
      // them nothing had happened, which is worse than the mode change itself. With nothing pending
      // no log is folded in, so that path names only the mode change.
      (onThisFile
        ? `The file's own bytes may differ from before this start, and not because a row moved: opening a database ` +
          `puts it into WAL journal mode, which rewrites the header and creates ${file}-wal.\n\n`
        : `The file's own bytes may differ from before this start, for two reasons and neither is a row moving. ` +
          `Opening a database puts it into WAL journal mode, which rewrites the header and creates ${file}-wal. And ` +
          `this check folds the write-ahead log back into the file before it takes its image, which moves pages that ` +
          `were already committed. Not one row of any authored table moved.\n\n`) +
      `What a migration would do to it:\n${measured.wouldWrite.map((line) => `  - ${line}`).join('\n')}\n\n` +
      // THE COMMAND IS THE LAST LINE, and the copy's full report is deliberately not printed above
      // it. That report — every note, every refusal, every crossing link — is what
      // `npm run db:migrate` prints, about the database it is actually changing. Printing it here
      // would bury the one line an operator has to act on under a page of findings about a copy
      // that no longer exists, and findings about a copy read exactly like findings about the file.
      `Take a copy of the file and run it deliberately — that prints the whole report, including ` +
      `everything the migrations will not guess at:\n\n` +
      // NOT `cp`. This database is in WAL mode, so recent writes are in ${file}-wal until a
      // checkpoint folds them in, and a plain cp of the .db alone silently leaves them behind:
      // measured on the live corpus on 2026-08-12, the copy was short by 6 records and 55 minutes
      // of work. This sentence is read at the exact moment somebody is about to migrate the only
      // copy of their research record, so it was the worst possible place to print that command.
      `    npm run db:backup && MOLE_OFFICE_DB=${file} npm run db:migrate`,
  }
}

// ---------------------------------------------------------------------------- the command

/**
 * True only when node was pointed at THIS file, so importing the module runs nothing.
 *
 * Compared as URLs rather than as strings because `process.argv[1]` is a path and
 * `import.meta.url` is a `file:` URL, and on the way through `npm run` the path can be relative.
 */
// Through the one rule, which also holds inside a bundle, where this module is never the program.
const invokedDirectly = isTheProgramRun(import.meta.url, 'src/server/db/migrate.ts')

/**
 * WHAT THE COMMAND WAS ASKED. With no argument it migrates, as it always did. `--stage-remint <file>` stages a re-mint
 * map and `--remint <file>` applies one (./remint-migration.ts). Anything else is refused, before the database is opened.
 */
function whatTheCommandWasAsked(args: readonly string[]): { stage: string | null; apply: string | null } | { refused: string } {
  const [flag, file, ...rest] = args
  if (flag === undefined) return { stage: null, apply: null }
  const named = file !== undefined && file !== '' && !file.startsWith('-') && rest.length === 0
  if (flag === '--stage-remint' && named) return { stage: file, apply: null }
  if (flag === '--remint' && named) return { stage: null, apply: file }
  return {
    refused:
      `npm run db:migrate takes no argument, or --stage-remint <file>, or --remint <file>, and it was given ${JSON.stringify(args)}. ` +
      'Nothing was read or written.',
  }
}

if (invokedDirectly) {
  const asked = whatTheCommandWasAsked(process.argv.slice(2))
  if ('refused' in asked) {
    console.error(asked.refused)
    process.exit(1)
  }
  // THE STAGED MAP IS READ BEFORE THE DATABASE IS OPENED, so a file that cannot be read, or is not one --stage-remint
  // wrote, stops the command with nothing written.
  let staged: StagedRemint | null = null
  if (asked.apply !== null) {
    try {
      staged = readTheStagedRemint(asked.apply)
    } catch (refusal) {
      console.error((refusal as Error).message)
      process.exit(1)
    }
  }
  // Dynamic, so that importing this module for its functions does not open ./data/panelx.db. See
  // the header.
  const { sqlite } = await import('./client.ts')
  // The same gate the server start obeys, and for the same two reasons — this command is how a
  // damaged database used to be reported as `records 429 -> 429` and how a stranger's database used
  // to acquire twelve Mole Office tables. Written to stderr and exit 1: a refusal that exits 0 is
  // indistinguishable from a migration, and this one is read by scripts.
  const objection = databaseObjection(sqlite)
  if (objection !== null) {
    console.error(objection)
    sqlite.close()
    process.exit(1)
  }
  if (asked.stage !== null) {
    try {
      console.log(describeTheStagedRemint(stageTheRemint(sqlite, asked.stage, tagsARunApplies(sqlite, MIGRATIONS_FOLDER)), asked.stage))
    } catch (refusal) {
      console.error((refusal as Error).message)
      sqlite.close()
      process.exit(1)
    }
  } else {
    console.log(describeOutcome(migrateInPlace(sqlite, MIGRATIONS_FOLDER, staged)))
  }
  sqlite.close()
}
