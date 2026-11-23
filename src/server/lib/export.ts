// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * The durable export: every authored table but panel_layouts written out as readable text, and the grammar that
 * reads it back.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS IS FOR
 * ---------------------------------------------------------------------------------------
 *
 * `./data/panelx.db` is one SQLite file, it is gitignored, and it is the only copy of everything
 * Mole Office knows. This is the second copy, and it is text so that it survives the program that
 * wrote it: a person with an editor and no Mole Office can read what a record IS and follow an id in a
 * link to the thing it names.
 *
 * THE FORMAT IS SPECIFIED IN design/durability/FORMAT.md AND THAT DOCUMENT IS THE CONTRACT. It was
 * written before this file, because the importer (G3) is separate work and a contract written
 * afterwards is a contract nobody agreed to. Where this file and that document disagree, the
 * document is right and this file is a bug.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS READS THE DATABASE AND NOT THE API
 * ---------------------------------------------------------------------------------------
 *
 * An audit measured five losses in building an export on `GET /api/*`, and each of them is
 * silent: soft-deleted records are dropped from the listing, there is no link list endpoint at
 * all, the resolved link shape drops `createdAt`, `createdBy`, `workspaceId` and `ownerId`,
 * `GET /api/changes` caps at 1000 rows with no offset, and layout ids cannot be enumerated. Every
 * one of those is invisible in the export and fatal on the way back in.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT MUST BE BYTE-IDENTICAL WHEN NOTHING CHANGED
 * ---------------------------------------------------------------------------------------
 *
 * G2 commits this text. A mirror whose files change when the data did not makes its own history
 * useless — every commit would say "something happened" and none of them would mean it. So no
 * file carries the time the export ran, no file carries anything about this machine, every list
 * has a declared sort order, and every comparison is by code unit rather than by `localeCompare`,
 * which answers differently depending on the machine's locale.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS DELIBERATELY NOT HERE
 * ---------------------------------------------------------------------------------------
 *
 * The three derived tables — `source_files`, `source_index`, `source_file_hashes` — are rebuilt
 * by `POST /api/source/reindex`, and a restored copy would describe the files of whichever
 * machine the export came from.
 *
 * Two columns of `session_resources` are dropped: `pgid` and `os_started_at`. That is the product
 * owner's decision, recorded in design/stages-audit/DECISIONS.md, and the reason is a scar rather
 * than a preference — this project once acted on a stale reading of the machine and it cost an
 * afternoon. What HAPPENED is exported; what is true right now is rebuilt by scanning.
 */

import { type Dirent, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'
import { THE_MIGRATIONS_FOLDER } from '../../config/settings.mjs'
import { getTableColumns } from 'drizzle-orm'
import { COLUMNS_A_COPY_CLEARS, REMOVED_MARK } from '../../config/what-a-copy-must-not-carry.mjs'
import { ORIGIN_MEANINGS, RECORD_KINDS, RECORD_ORIGINS, readOrigin, unstampedOriginNote } from '@shared/types.ts'
import type Database from 'better-sqlite3'
import { theStoreGivenToTheExport } from './the-store-to-export.ts'
import { type UnreadablePlace, describeReadFailure } from './adapters/types.ts'
// EVERY LIST OF TABLES THIS FILE USES COMES FROM HERE AND NONE OF THEM IS RESTATED. `ARCHIVED_TABLES`
// is what an archive carries: `AUTHORED_TABLES` less `LEFT_OUT_OF_BACKUPS_AND_EXPORTS`, `AUTHORED_TABLE_OF` says which columns each one has, `WORKSPACE_COLUMN`
// says how a row is scoped to a project and `PERSON_LEVEL_TABLES` is the set that cannot be. This
// file kept its own copy of the last two until 2026-08-12; see `PERSON_LEVEL_REGIONS` below.
import {
  ARCHIVED_TABLES,
  DERIVED_TABLES,
  LEFT_OUT_OF_BACKUPS_AND_EXPORTS,
  MEASURED_TABLES,
  whyATableBelongsToNoProject,
  type ArchivedTable,
} from '../db/schema.ts'
import {
  AUTHORED_TABLE_OF,
  PERSON_LEVEL_TABLES,
  WORKSPACE_COLUMN,
  type ScopedThroughAnotherTable,
  type WorkspaceScope,
} from '../db/authored-table-of.ts'
import { everyPartTable } from '../db/every-part-table.ts'
import type { PartTable } from '../db/part-tables.ts'
import { readRegistryAliases, REGISTRY_ALIAS_ARCHIVE_VERSION } from './registry-aliases/index.ts'
import { theKeyProvedTheRowsOwnWriter } from './agent-references.ts'
import { byCodeUnit } from './export-grammar.ts'
// THE GRAMMAR IS READ IN export-grammar.ts, which opens no database. Its names are exported from here as before, and so
// is byCodeUnit, the one order both files sort by.
export { byCodeUnit, ExportFormatError, parseExportFile, readExportTree, type ExportRegion, type ParsedExportFile } from './export-grammar.ts'
import { historyBytesPage, historyBytesPages, HISTORY_BYTES_FILE, HISTORY_BYTES_FOLDER, HISTORY_BYTES_VERSION } from './registry-aliases/history-bytes.ts'
import { IDENTITY_CENSUS_COLUMNS, IDENTITY_CENSUS_TABLES, IDENTITY_CENSUS_WHOLE_ROWS, takeIdentityCensus, theRowNamed } from './registry-aliases/census.ts'
import { PanelError } from './panel-error.ts'

/**
 * THE STORE THIS EXPORT READS. The export command opens it read-only and gives it before it imports this file
 * (lib/the-store-to-export.ts), and then the office's read-write client is never loaded: loading it switches the file
 * to write-ahead logging, which changes a store the export only reads. Anywhere else this is the office's own handle.
 */
const sqlite: Database.Database = theStoreGivenToTheExport() ?? (await import('../db/client.ts')).sqlite

// ============================================================================ the format itself

/**
 * The version string every export carries and every importer checks.
 *
 * An importer that meets a version it does not know must REFUSE. A format that silently accepted
 * an unknown version would import half of it and call that success, which is the failure this
 * whole group exists to prevent.
 */
export const FORMAT_VERSION = 'mole-office-export/2'

/**
 * THE VERSION EVERY ARCHIVE WRITTEN BEFORE 28 AUGUST 2026 CARRIES, WHICH THE READER STILL ACCEPTS.
 *
 * This product was called PanelX until that day and its archives said `panelx-export/1`. The
 * grammar did not change with the name — the same fields, the same fences, the same counts — so
 * the only difference between version 1 and version 2 is what the product is called.
 *
 * THE READER ACCEPTS BOTH. THE WRITER ONLY EVER WRITES THE NEW ONE. This is the one compatibility
 * alias in the whole rename, and it is owed: 440 files under `data/mirror/` are written in the old
 * form today, and every archive the owner has taken elsewhere is too. Without this, the failure
 * would appear as a refusal at restore time — which is the moment somebody needs it most.
 *
 * A LEGACY ARCHIVE IS ANNOUNCED, NOT SILENTLY ACCEPTED. `describeFormat` below is what an importer
 * says about the version it read, and reading an old one says so in words. Accepting it quietly
 * would be the same silent substitution the format's own version check exists to prevent.
 *
 * WHEN IT CAN GO. When it is confirmed that no archive written before 28 August 2026 is still needed.
 * Removing it is one constant, one branch in `parseExportFile` and one in its FENCE pattern (both in
 * export-grammar.ts), and one branch in the importer's version check.
 */
export const FORMAT_VERSION_BEFORE_THE_RENAME = 'panelx-export/1'

/** Every format version this build can read. The writer only ever writes the first. */
export const READABLE_FORMAT_VERSIONS: readonly string[] = [FORMAT_VERSION, FORMAT_VERSION_BEFORE_THE_RENAME]

/** What to say about the version an archive carries, so a legacy one is never read in silence. */
export function describeFormat(format: unknown): string {
  if (format === FORMAT_VERSION) return `format ${FORMAT_VERSION}`
  if (format === FORMAT_VERSION_BEFORE_THE_RENAME) {
    return `format ${FORMAT_VERSION_BEFORE_THE_RENAME}, written before this product was renamed to Mole Office on 28 August 2026 and read as ${FORMAT_VERSION}`
  }
  return `format ${JSON.stringify(format)}`
}

/**
 * Where an export goes when the caller does not say: `mirror/` BESIDE THE DATABASE IT MIRRORS.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT FOLLOWS THE DATABASE AND IS NOT A FIXED PATH
 * ---------------------------------------------------------------------------------------
 *
 * It was `<repo>/data/mirror`, resolved from this file's own URL, and that was wrong in a way a
 * test found within the hour. `tests/server-wiring.test.ts` sends an empty body to EVERY endpoint
 * that takes one, to prove none of them refuses a caller with one shared headers object — so it
 * POSTs `/api/export`, against its own throwaway database, and six files describing an empty
 * Mole Office landed in the repository's real `data/mirror`. The next real export would have shown that
 * as a change and committed it.
 *
 * A mirror belongs to a database, so it lives beside it. `MOLE_OFFICE_DB=/tmp/x/panelx.db` exports to
 * `/tmp/x/mirror`, and the default database exports to `./data/mirror` exactly as before. Moving a
 * database moves its mirror, which is the right answer to a question nobody had asked yet.
 *
 * IT IS NOT AN ENVIRONMENT VARIABLE, and that is on purpose rather than an omission.
 * tests/config.test.ts checks `.env.example` against the code in both directions — every MOLE_OFFICE_
 * name in src/ must be documented there and every name documented there must be read by the code.
 * `.env.example` belongs to another piece of work, so this is a default plus a parameter instead.
 * FORMAT.md §11 records what promoting it to MOLE_OFFICE_MIRROR would cost: one line in each file.
 */
export function defaultExportRoot(): string {
  return resolve(dirname(sqlite.name), 'mirror')
}

/**
 * Where this process exports to, when nothing has been said. Null means "beside the database".
 *
 * A SEAM, AND THE SAME SHAPE `useOsProbe` HAS IN lib/resources.ts. `POST /api/export` deliberately
 * takes no destination from its caller — a path in a request body would be a loopback page able to
 * write files anywhere this process can reach — so a test of that endpoint has no other way to
 * name its own directory.
 */
let currentRoot: string | null = null

/** Point this process's exports somewhere else. Never reachable from a request. */
export function useExportRoot(dir: string): void {
  currentRoot = dir
}

/** Where an export with no root named will be written. */
export function exportRoot(): string {
  return currentRoot ?? defaultExportRoot()
}

/**
 * Where ONE project's archive is written: `mirror-greenhouse` beside `mirror`.
 *
 * A SEPARATE DIRECTORY, NOT A SUBDIRECTORY AND NOT THE SAME ONE. `writeExport` prunes files the
 * current export no longer produces, which is what stops a deleted layout coming back from the
 * dead on the next import — so writing one project into the installation's archive would delete
 * every other project's file and report it as tidying up. tests/export-workspace.test.ts writes
 * both against one root's worth of data and asserts that the scoped one leaves the whole archive
 * alone, which is the only reason to believe this rather than to hope it.
 *
 * WHICH ALSO MEANS THE TWO ARE NEVER THE SAME ARTEFACT. `mirror` is the whole installation and
 * restores it whole; `mirror-<id>` is one project and restores on its own into a database that
 * may hold others. The manifest of each says which it is.
 */
export function workspaceExportRoot(workspaceId: string): string {
  const base = exportRoot()
  return join(dirname(base), `${basename(base)}-${workspaceId}`)
}

/** Where the drizzle journal lives, for turning a migration's `when` into a readable tag. */
const JOURNAL_FILE = join(THE_MIGRATIONS_FOLDER, 'meta', '_journal.json')

/**
 * The columns each region writes, in the order it writes them.
 *
 * DECLARED ORDER, NOT SCHEMA ORDER, because a person reads this: `id` first, then who and where,
 * then what it is, then the stamps. The list is still checked against the schema rather than
 * trusted — `tests/export-format.test.ts` asserts that these keys plus the ones held elsewhere
 * plus the ones deliberately dropped are EXACTLY the columns drizzle declares. A column added to
 * schema.ts and not handled here fails that test instead of vanishing from every backup.
 */
const REGION_COLUMNS = {
  runtime_settings: ['name', 'value', 'until'],
  office_restart_grants: ['agentId', 'decisionId'],
  // FIRST, BECAUSE EVERY OTHER REGION NAMES A ROW OF IT. An archive whose records arrived before
  // the workspaces existed would hold rows naming a project that is not there yet, and the
  // importer would have to either invent the workspace — which is the misspelt-header defect — or
  // refuse the whole restore. AUTHORED_TABLES in db/table-name-lists.ts puts it first for the same reason
  // and EXPORTED_REGIONS is read from that list, so the order is stated once.
  // `submission_events` STOOD HERE AND IS GONE, dropped by migration 0154 (criterion C34): it copied
  // every revision, change and link row the database already held, and a seal names them instead.
  submission_baselines: ['runId', 'watermark', 'recovered'],
  legacy_unsealed_runs: ['runId'],
  // `reviewLevel` IS CARRIED. It is somebody's choice about this project and it exists nowhere else,
  // so an archive that dropped it would restore a project whose inspector had been switched off, or
  // on, by the restore. Null in the archive is nobody having chosen, which is what the column holds.
  //
  // THE SECRETARY REMINDED ABOUT THE PROJECT'S MODULES, AND THE REASON, added by 0211, are carried for the same
  // reason: the choice made on the Settings page exists nowhere else, and a restore that dropped it would silently
  // hand the project back to the .env line.
  //
  // THE PROJECT'S MASTER PIPELINE, added by 0338, is carried too: which pipeline is the master is a choice made by a
  // secretary or the owner, and a restore that dropped it would hand back a project board with no rows.
  //
  // WHETHER THE PROJECT'S HANDED-BACK PACKAGE POINTS ARE INSPECTED, added by 0345, is carried for the same reason: a
  // choice made for the project, and a restore that dropped it would say that nobody had chosen.
  workspaces: ['id', 'title', 'note', 'reviewLevel', 'moduleReminderSecretary', 'moduleReminderSecretaryBecause', 'masterPipeline', 'packageInspection', 'createdAt', 'updatedAt'],
  // `origin` IS CARRIED, AND IT IS LAST BECAUSE IT IS ABOUT THE ROW RATHER THAN ABOUT THE WORK.
  //
  // It says whether this record entered the corpus through the generated fixture or was filed as
  // real work (RECORD_ORIGINS in shared/types.ts). Until 2026-08-11 the column existed and the
  // archive did not carry it, so a restore turned 290 measured `fixture` marks into 290 nulls —
  // every one of them then reading as "nobody has said", beside 95 real records, which is the exact
  // state decision 17 was settled to end. tests/export-format.test.ts was failing on this list for
  // that reason; the answer was to carry the column, never to add it to NEVER_EXPORTED.
  //
  // NULL IS A VALUE HERE AND IS WRITTEN OUT AS `origin: null`. It means nobody has recorded how the
  // row got here, which is a different fact from `authored`, and an archive that omitted the line
  // instead would leave the importer to decide which of the two it meant.
  records: ['id', 'workspaceId', 'ownerId', 'kind', 'title', 'summary', 'createdAt', 'updatedAt', 'deletedAt', 'origin'],
  links: [
    'id',
    'workspaceId',
    'ownerId',
    'createdAt',
    'updatedAt',
    'fromId',
    'toId',
    'type',
    'inferred',
    'createdBy',
    // WHETHER `createdBy` IS A PERSON, AN AGENT OR THE OFFICE. Migration 0193. NULL on every link
    // written before it, and NULL means it was never recorded; a restore that dropped the column would
    // turn every recorded answer into that.
    'createdByType',
    'gate',
    'gateUpTo',
    // WHICH SORT OF STAGE `gateUpTo` IS: item, block or words. Migration 0193. NULL means not recorded.
    'gateUpToSort',
    // WHAT MOVES ALONG THIS EDGE, when somebody said. NULL on every link written before the column
    // existed, and NULL means nobody said what moves — which is different from an edge that carries
    // nothing. A restore that dropped it would turn one into the other.
    'carries',
  ],
  // `workspaceId` IS CARRIED AND MAY BE NULL. Migration 0006 added the column NULL on every row
  // and workspace-migration.ts copies each change's workspace off the record it is about; a row
  // whose record_id answers to nothing is left NULL, counted, and exported as `workspaceId: null`.
  // Writing 'default' instead would have stated a judgement nobody made, in the one direction that
  // hides the rows the column exists to find.
  changes: [
    'id',
    'workspaceId',
    'recordId',
    'op',
    'actorType',
    'actorId',
    'sessionId',
    'field',
    'oldValue',
    'newValue',
    // THE PERSON'S OWN WORDS THE WRITE WAS MADE ON, carried as stored and null for every ordinary
    // write. An archive that dropped it would restore a governance act by an agent with nothing
    // beside it saying why it was allowed, which reads exactly like a hole in the guards.
    'warrant',
    // AND THE ELEVATION THE WRITE WAS MADE UNDER, criterion P59, carried for exactly the reason the
    // warrant beside it is carried and null for every ordinary write. The two are the two keys to
    // one door; an archive that kept one and dropped the other would restore half the acts an agent
    // made for the person with nothing beside them saying why they were allowed.
    'elevation',
    // The one signed package item that carried the act, as stored; NULL on ordinary writes.
    'signed_item',
    // AND WHO A KEY PROVED THE CALLER TO BE, where that is not the actor named beside it. Criterion
    // P83, point 5. Carried as inline JSON (see INLINE_JSON_COLUMNS) and null for every ordinary
    // write. An archive that dropped it would restore a row whose key proved one holder while the
    // actor names another, with the proof gone and nothing saying it was ever there.
    'provedHolder',
    // AND HOW A KEY PROVED THE REQUEST, on every keyed write. Migration 0178. A warrant written after
    // the key window closed may cite only words the person's key proved, and an archive that dropped
    // this would restore their proved words as words nobody recorded a proof for.
    'provedBy',
    // AND THE PRESS FOR THE PERSON THAT WROTE THE ROW, migration 0280, null for every ordinary write. It names a row of
    // `presses_for_the_person`, which carries the reason; an archive that dropped it would restore the grant's acts with
    // nothing saying which press made them or why.
    'pressId',
    'at',
    // AND THE ROW'S PLACE IN THE ORDER THE LOG WAS APPENDED IN, migration 0194. "What has changed
    // since I last looked" counts the rows placed after a reader's anchor, so an archive that dropped
    // this would restore a log in which readers are shown rows they had already read. Problem
    // BhszTJsVC8rF; the importer's `appendOrderOfTheInserts` writes it back.
    'appendOrder',
  ],
  // THE REVISION LEDGER, and it is the region an archive can least afford to lose. Every other
  // table in this list can be read from something else if it has to be; a revision holds the only
  // stored copy of what a record used to contain, because `changes` never kept it. `data` is not
  // here because it is a DOCUMENT and goes in its own block — see JSON_BLOCK_COLUMNS below.
  //
  // `workspaceId` MAY BE NULL and is carried as null, for the reason `changes.workspaceId` gives
  // one comment up: it is derived from the record the revision is of, and a revision whose record
  // is missing has nobody to say which project it belonged to.
  revisions: [
    'id',
    'recordId',
    'workspaceId',
    'seq',
    'contentHash',
    'kind',
    'title',
    'summary',
    'deletedAt',
    'op',
    'actorType',
    'actorId',
    'sessionId',
    'at',
    'note',
    // The same two the warrant added, for the reason `changes.warrant` above gives. `revokesSeq` is
    // what says an act was taken back, and an archive without it would restore an act the person
    // had already revoked as one that still stands.
    'warrant',
    // AND THE ELEVATION, for the reason `changes.elevation` one region up gives. Criterion P59.
    'elevation',
    // The one signed package item that carried the act, as stored; NULL on ordinary writes.
    'signed_item',
    // AND WHO A KEY PROVED, for the reason `changes.provedHolder` one region up gives: the two
    // ledgers are written in one transaction and a fact on one and not the other is the drift.
    'provedHolder',
    // AND HOW A KEY PROVED IT, for the reason `changes.provedBy` one region up gives.
    'provedBy',
    'revokesSeq',
    // THE PLACES THIS REVISION STORES BY HASH, and the revision holding each value whole (migration 0351). The page
    // carries `data` as stored, so an archive holds each run's chapters once, and the import puts a revision back
    // together from the archive's own pages.
    'parts',
  ],
  reader_anchors: ['workspaceId', 'reader', 'lastSeenAt', 'lastChangeId'],
  presentation_intent: ['workspaceId', 'scope', 'target', 'intent', 'updatedAt', 'updatedBy'],
  session_resources: [
    'id',
    'workspaceId',
    'sessionRecordId',
    'type',
    'key',
    'detail',
    'registeredAt',
    'registeredBy',
    'releasedAt',
    'releasedBy',
    'releaseNote',
    // WHAT HAPPENED, so both are exported. `world` is the repository, database, port and HEAD the
    // resource served when the row was written, and `startedByTheProduct` is whether Mole Office
    // itself started the process. Neither is a reading of the machine now — which is what `pgid`
    // and `osStartedAt` are, and why those two are dropped. A row written before 3 September 2026
    // holds NULL in both, meaning nobody recorded it.
    'world',
    'startedByTheProduct',
  ],
  // What an agent read in a folder, before a person accepted any of it. The pieces are one JSON
  // column and are carried whole: a draft half-restored would be a list of proposals a person had
  // already decided on, with the decisions gone.
  // `pieces` IS NOT HERE. It is a document of its own and goes in its own fenced block, the way a
  // record's `data` does — see JSON_BLOCK_COLUMNS below.
  // `ownerKind` and `readByKind` say whose id the two hold, added by 0311, so a restored row is told as it was written.
  folder_readings: ['id', 'workspaceId', 'ownerId', 'ownerKind', 'folder', 'readBy', 'readByKind', 'note', 'createdAt', 'updatedAt'],
  // PLANNING. None of these four carries a `workspaceId`, and they are the only regions that do not
  // — a plan is a person-level overlay across workspace-owned work, so there is no project for the
  // row to name. `PERSON_LEVEL_REGIONS` is that set, read from the schema; this comment said "Both"
  // for as long as there were four of them, which is what the derivation is for.
  // The export writes what is there; it does not invent a 'default' to make the shape uniform.
  //
  // `plannedHours` and `actualHours` MAY BE NULL AND ARE WRITTEN OUT AS NULL. Null means nobody
  // said how long, which is a different fact from zero and from the whole of the work, and an
  // archive that omitted the line would leave the importer to pick one of them.
  allocations: [
    'id',
    'horizon',
    'period',
    'recordId',
    'plannedHours',
    'actualHours',
    'state',
    'note',
    // Which plan line put this time here, or null because nobody planned it in a document. Carried
    // because it is authored provenance: an archive that dropped it would restore hours that came
    // from somebody's plan as hours that came from nowhere.
    'fromPlanLine',
    'createdAt',
    'updatedAt',
    'createdBy',
  ],
  planning_capacity: ['horizon', 'period', 'hours', 'note', 'updatedAt', 'updatedBy'],
  planning_recurrences: ['id', 'recordId', 'every', 'days', 'hoursEach', 'createdAt', 'updatedAt', 'createdBy'],
  // A plan and its lines. The words are carried verbatim, newlines and all, exactly as a rough draft's
  // body was before migration 0196 moved every draft into a plan: they are somebody's writing and
  // this archive is the only other copy of them. `movedFromDraft` is the draft a plan was, and the
  // only record of which plan an old draft id became, so a restore that dropped it would leave a
  // proposal about a draft pointing at nothing. `recordId` on a line is
  // the record it was filed as and is carried as it stands — the line's words and that record's
  // title are two separate facts, and an archive that reconciled them would be inventing one.
  // `readByAgent` and `readUnderGrant`, added by migration 0295, are the secretary that marked a plan as read under the
  // person's grant and the grant: a backup that dropped them would restore that mark as the person's reading.
  plans: ['id', 'title', 'state', 'readAt', 'readByAgent', 'readUnderGrant', 'createdAt', 'updatedAt', 'createdBy', 'movedFromDraft'],
  plan_lines: ['id', 'planId', 'position', 'text', 'recordId', 'remark', 'updatedAt', 'updatedBy'],
  // WHY A LINE WAS ADDED, REORDERED OR DROPPED, added by migration 0170. Criterion P3. Carried
  // because the reason is somebody's own words and exists nowhere else: `plan_lines.remark` is dead
  // and holds one note per line, not one reason per change. A restore that dropped this would leave
  // every line with no account of why the plan changed.
  plan_line_revisions: ['id', 'planId', 'lineId', 'seq', 'op', 'reason', 'changedBy', 'at'],
  // EVERY ADDITION, FIRING AND HELD-BACK FIRING OF A COUNTER, added by migration 0172. Criteria CT2
  // and CT5 to CT7. Carried because the row is the only copy of three things: the caller's own
  // reason for an addition, what a firing's action answered — a message id, a task id or the job's
  // result — and that a firing was held back and why. The count and the amount on the counter are
  // added up from these rows, so an archive that dropped them would restore a counter that had never
  // counted anything, with the record itself still there.
  //
  // `answer` IS CARRIED AS THE STORED TEXT, like a folder reading's pieces: it is what the action
  // said, and nothing on the way out parses it.
  counter_rows: [
    'id',
    'workspaceId',
    'counterId',
    'seq',
    'what',
    'at',
    'atInstant',
    'by',
    'eventKind',
    'eventId',
    'eventAt',
    'count',
    'amount',
    'because',
    'whichTrigger',
    'answer',
  ],
  // WHAT SOMEBODY WROTE ABOUT TIME, before any of it is a fact. `said` is carried verbatim, like a
  // draft's body and a plan line's text, and for the same reason: it is what a person typed and this
  // archive is the only other copy of it.
  //
  // `horizon`, `period` and `hours` MAY ALL BE NULL AND ARE WRITTEN OUT AS NULL. Null here means
  // Mole Office read nothing from the words and did not invent anything, which is a different fact from
  // zero hours or from a period nobody has reached yet. An archive that left the line off would
  // leave the importer to choose between those.
  //
  // `state` is `kept`, `offered` or `committed`, and only `committed` is in any total. A restore that
  // lost it would turn words somebody never scheduled into words that were scheduled, or the other
  // way round, and every week's arithmetic would change while the row count still matched.
  planning_intents: [
    'id',
    'said',
    'recordId',
    'planLineId',
    'horizon',
    'period',
    'hours',
    'state',
    'createdAt',
    'createdBy',
  ],
  // WHEN SOMEBODY MEANS TO WORK ON SOMETHING. Both days are `YYYY-MM-DD` and both are INCLUDED, so a
  // window from a Thursday to the following Wednesday is seven days long and no period key can name
  // it — which is why this is two columns where `allocations.period` is deliberately one.
  //
  // A WINDOW CARRIES NO HOURS AND IS IN NO TOTAL. It answers when, not how much; the hours are in
  // `allocations` and are a different fact. An importer that read a window as time given would make
  // every week look fuller than the person said it was.
  //
  // `note` MAY BE NULL and is carried verbatim when it is not. It is what somebody needs to know when
  // they come back to the block — "Grip starts slipping above 15N; recalibrate before the next test."
  // — and this archive is the only other copy of it.
  //
  // `state` is `planned`, `done` or `dropped`. `done` completes THIS SPAN and says nothing about the
  // work; `dropped` is a span that did not happen, which is a different fact from one nobody planned.
  // A restore that flattened those three into one would lose which weeks a person actually worked.
  //
  // No `workspaceId`, like the rest of the planning layer: a person's week holds work from every
  // project. `PERSON_LEVEL_REGIONS` is read from the schema and already counts this one.
  work_windows: ['id', 'recordId', 'startsOn', 'endsOn', 'note', 'state', 'createdAt', 'updatedAt', 'createdBy'],
  // TALKING TO AN AGENT. A conversation, what was said in it, and each bounded attempt to answer it.
  // All three are somebody's own words about their own work and exist nowhere else.
  //
  // A THREAD SAYS WHICH PROJECT IT IS ABOUT AND THE OTHER TWO DO NOT. A message and a run belong to
  // the project their thread names, which is why `WORKSPACE_COLUMN` in db/authored-table-of.ts answers for them
  // with the thread rather than with a column, and why a project-scoped archive reads them through
  // it. There is no `workspaceId` line on either of them, and adding one would be the same fact in
  // two places.
  agent_threads: ['id', 'workspaceId', 'title', 'mode', 'state', 'createdAt', 'updatedAt', 'createdBy'],
  // `context` IS CARRIED AS THE TEXT IT IS STORED AS, not as a parsed value on the line.
  //
  // It holds what a comment points at, as JSON: a record, a plan line, a block on the week, or a
  // span of text WITH THE QUOTED WORDS KEPT. Carrying it verbatim is what makes the quote survive —
  // the words are the whole reason a comment still says what it was about after the text underneath
  // it changes.
  //
  // WRITTEN AS TEXT BECAUSE THE COLUMN IS TEXT. `src/server/db/schema.ts` declares it `text`, not a
  // json column, so lib/agents.ts parses and stringifies it itself. The importer types every value
  // against that declaration and REFUSES an object where a text column is declared, so writing this
  // line as `context: {…}` would produce an archive that cannot be imported. MEASURED on 18 August
  // 2026 by putting it in `INLINE_JSON_COLUMNS` and importing: "The import was refused and nothing
  // was written… agent_messages.context is {"kind":"record",…}, and it has to be text."
  //
  // A JSON BLOCK IS THE OTHER WAY TO CARRY IT AND COSTS MORE THAN IT IS WORTH HERE. The importer
  // pairs a block with the row above it in the same file and allows ONE such row per file, so every
  // comment would become a page of its own and a conversation could no longer be read in one. The
  // third way — declaring the column `mode: 'json'` — is a change to lib/agents.ts, which parses and
  // stringifies this column itself.
  //
  // `null` means the comment points at nothing in particular, which is a real answer and a different
  // one from an empty object.
  //
  // THE FOUR RECIPIENT COLUMNS ARE ALL CARRIED, AND THEY ARE THREE DIFFERENT FACTS. `recipientSaid`
  // is what somebody typed, `recipientWhy` is the sentence saying how Mole Office arrived at a recipient,
  // and `recipientKind` is what was settled. A restore that lost `recipientWhy` would leave a choice
  // on the screen with no account of how it was made; one that lost `recipientKind` would turn a
  // comment addressed to a named agent into one addressed to nobody. All four are null together on a
  // message nobody addressed.
  //
  // `runId` IS THE RUN AN AGENT'S ANSWER CAME OUT OF, and null on everything a person wrote. An
  // archive that lost it would turn an answer into a comment from nobody in particular, with no way
  // back to the attempt that produced it.
  agent_messages: [
    'id',
    'threadId',
    'position',
    'role',
    'intent',
    'body',
    'context',
    'state',
    'recipientKind',
    'recipientSessionId',
    'recipientSaid',
    'recipientWhy',
    'runId',
    // WHICH COMMENT THIS MESSAGE CARRIED, null on everything nobody wrote as a comment on something.
    // Without it a restored archive holds the same sentence in a comment and in a message with
    // nothing saying they are one thing, which is what the column exists to prevent.
    'fromAnnotationId',
    // THE COMMENTS ONE MESSAGE CARRIES WITH THEIR QUOTES, when a sent review put several comments for
    // one recipient into it (migration 0185), and null on every other message.
    // An archive that lost it would hold that message with nothing saying which comments it carried.
    'carries',
    // WHERE THIS HAS GOT TO BETWEEN MOLE OFFICE AND ITS RECIPIENT, and everything that says how it got
    // there. `state` above is the word; these say when it last moved, when it went out, which
    // durable identity it went to and which one wrote it, who took one addressed to a new agent,
    // what a failure said, and what the receiving agent did. Not one of them can be worked out from
    // anything else in an archive, and `sentAt` least of all: it is the age of the wait, which is
    // what a screen counts days from.
    'stateAt',
    'sentAt',
    'recipientAgentId',
    'takenByAgentId',
    'takenAt',
    'failedBecause',
    'handledNote',
    'handledBySession',
    'writtenByAgentId',
    // WHAT OVERLAP THIS MESSAGE WAS WRITTEN TO COORDINATE, as JSON, or null because it was not one.
    // It is the two pieces of work that were agreed about, as they stood then, and nothing else
    // stores that.
    'coordination',
    // HOW A KEY PROVED THE REQUEST THAT WROTE THE WORDS, or null. Migration 0178. The same reason
    // `changes.provedBy` gives: a warrant may cite a message only where this says their key proved it.
    'provedBy',
    'createdAt',
    'createdBy',
  ],
  // `request` AND `result` ARE NOT HERE: they are documents and get their own JSON blocks below.
  //
  // `error` is the words a failure came back with, and null means nothing failed — which is not the
  // same as succeeding, and is why a run may carry neither an error nor a result. `claimedBy`,
  // `claimedAt`, `startedAt` and `endedAt` are null until each of those things happens, and null
  // there means nobody has picked this up yet: a real answer, and what the screen says instead of
  // showing a spinner.
  agent_runs: [
    'id',
    'threadId',
    'runtime',
    'state',
    // WHICH DURABLE IDENTITY THIS RUN IS FOR, or null because nothing recorded one. A session is not
    // an identity, so `recipientSessionId` below cannot stand in for it.
    'agentId',
    'recipientSessionId',
    'resumeExternalId',
    'claimedBy',
    'claimedAt',
    // WHICH MACHINE TOOK IT. Criterion P23. Carried because a restore that dropped it would leave a
    // run saying it was taken by somebody at nowhere, and a conversation unable to say which machine
    // answered.
    'claimedFromMachine',
    'error',
    'startedAt',
    'endedAt',
    'createdAt',
  ],
  // A REVIEW: somebody started collecting remarks, from somewhere.
  //
  // `entry` and `frozen` ARE NOT HERE: both are documents and get their own JSON blocks below.
  // `entry` is where the review was started from, in the same shape a remark stores, and `frozen`
  // is the membership as it stood when collecting finished.
  //
  // `collectedAt` is null until somebody has finished collecting, and `fromThreadId` is null on
  // every review started after reviews became rows of their own — it names the conversation a
  // round-seven review's remarks are still in. Null in both places is a real answer.
  //
  // `entry` AND `frozen` ARE PLAIN FIELDS HERE, not JSON blocks, and `agent_messages.context` is the
  // precedent: both are one JSON string on one line, and a region with a JSON block gets one file
  // per row, which would put a directory of files under this archive for no reading a person would
  // ever do. They are still compared as documents on the way back — see `JSON_DOCUMENT_COLUMNS` in
  // tests/import-roundtrip.test.ts — so key order cannot fail a restore.
  // `sentThreadId` AND `sentAt` ARE THE OTHER HALF OF `state`. A review that says "sent" and cannot
  // say where it went or when is a word with nothing behind it, and a restore that carried the word
  // without the two facts would hand back exactly that. `sentThreadId` names the conversation the
  // comments went out in — one review, one conversation, however many agents they went to.
  reviews: [
    'id',
    'workspaceId',
    'entry',
    'state',
    'startedAt',
    'startedBy',
    'collectedAt',
    'frozen',
    'fromThreadId',
    'sentThreadId',
    // WHAT A READING SAID ABOUT SEVERAL COMMENTS AT ONCE. It is stored nowhere else: a restore
    // without it would hand back a review whose comments each carry their own reading and whose
    // groups have gone, which reads as "nothing was true of several at once" rather than as a loss.
    'readGroups',
    'sentAt',
    // HOW WIDE THE REVIEW IS, and who asked for it. `reach` is the single stored answer to "how wide
    // is this" and a restore without it would hand back a project-wide review reading as a local
    // one, whose scope is then worked out from an `entry` that was never meant to be read.
    // `startedByAgent` is null on every review nobody asked for, which is most of them.
    'reach',
    'startedByAgent',
    // WHAT A REVIEW TOOK IN WHEN IT STARTED, and who the person said it goes to. Both are stored nowhere else: a
    // restore without `takenIn` would hand back a review missing the comments kept before it, and one without
    // `goesTo` would send to the page's writer a review somebody had sent elsewhere.
    'takenIn',
    'goesTo',
  ],
  // A CHECKOUT THIS PROJECT'S WORK IS IMPLEMENTED IN. `root` IS A PATH ON THE MACHINE THIS WAS
  // EXPORTED FROM and it travels with the row on purpose: an archive restored elsewhere carries
  // every repository name and every relationship, and one root that points at a directory the new
  // machine may not have. The first rebuild there refuses, naming the value, and a person re-points
  // it once. The relationships survive untouched because they are repository-relative.
  repositories: ['id', 'workspaceId', 'name', 'note', 'root', 'createdAt', 'updatedAt', 'createdBy'],
  // A CODE REVISION SOMEBODY NAMED. `ref` is the opaque string the caller supplied and Mole Office never
  // resolves it, so this is the only place it exists. BEFORE `implementation_map` in
  // AUTHORED_TABLES, because a map row may name one.
  implementation_revisions: ['id', 'workspaceId', 'repositoryId', 'ref', 'label', 'note', 'statedAt', 'statedBy'],
  // SOMEBODY SAID THIS RECORD IS IMPLEMENTED BY THIS CODE. `provenance` is in the unique index, so a
  // person's statement and an agent's guess about the same pattern are two rows: an archive that
  // carried one of them would silently merge two answers that were kept apart on purpose.
  // `acceptedAt` and `acceptedBy` are null until somebody accepted a guess, and `deletedAt` is a
  // soft delete, so a relationship somebody removed is still a thing that happened.
  implementation_map: [
    'id',
    'workspaceId',
    'recordId',
    'repositoryId',
    'pattern',
    'relation',
    'provenance',
    'note',
    'revisionId',
    'statedAt',
    'statedBy',
    'acceptedAt',
    'acceptedBy',
    'deletedAt',
  ],
  // WHAT ONE SCAN SAW ABOUT ONE FILE AT ONE MOMENT. Carried, though the file index it is compared
  // against is not: the index describes the present and any scan rebuilds it, and one of these rows
  // is a dated observation nothing can recompute. `firstScan` travels with it because a restored
  // copy's next rebuild sees the whole repository as new, and without that flag a drift read would
  // report a fortnight of change that never happened.
  file_observations: ['id', 'workspaceId', 'scanId', 'repositoryId', 'path', 'change', 'hash', 'seenAt', 'since', 'firstScan'],
  // WHICH WORK A RESTRICTION REACHED, AND WHETHER ANYBODY RE-CHECKED IT. `reachedBy` and `distance`
  // are the graph AS IT WAS when the row was written, and `writtenBy` says which moment that was, so
  // neither can be recomputed from today's links. `state`, `note` and `decidedBy` are somebody's
  // judgement and exist nowhere else.
  revalidations: [
    'id',
    'workspaceId',
    'restrictionId',
    'recordId',
    'reachedBy',
    'distance',
    'writtenBy',
    'at',
    'state',
    'decidedBy',
    // Whose id `decidedBy` is, added by 0311.
    'decidedByKind',
    'callId',
    'decidedAt',
    'note',
  ],
  // A COMMENT WHOSE WORDS HAD ALREADY GONE OUT. Nothing can recompute a row of it, because the fact
  // it records IS the fact that was lost. Left out of this list it would vanish from every backup,
  // and after a restore the gate that asks "have these words gone out" would answer false for
  // comments that had.
  annotation_words_fixed: ['annotationId', 'fixedAt', 'because'],
  // WHETHER THE STORED READING-MEASURE WORDS CARRY THEIR NEW NAMES, from migration 0173. One row or
  // none. Carried because the words cannot say which names they were written under, and the
  // migration reads this row to decide whether to rename them.
  measure_words_renamed: ['onlyRow', 'renamedAt', 'because'],
  // WHO TAKES PART, AND THE PICTURES. An uploaded avatar's row exists nowhere else, and neither does
  // the name somebody chose for an agent, so all four are carried. `assets.path` names a file under
  // `data/` that the archive does NOT contain — an archive carries rows, not the picture files — and
  // FORMAT.md says what a restore then has: a row pointing at a file the restorer has to bring.
  // `drawnFrom`, from migration 0337, is carried because a drawn face the re-mint renamed is drawn from it.
  assets: ['id', 'kind', 'origin', 'path', 'mime', 'bytes', 'createdAt', 'createdByKind', 'createdById', 'licenceSource', 'drawnFrom'],
  // AND WHICH WORLD EACH IS A CITIZEN OF, from migration 0122. It is carried because a restore into
  // another world would otherwise silently make every citizen a local of wherever the rows landed,
  // and where somebody was registered is a fact about them rather than about the file.
  people: [
    'id',
    'name',
    'handle',
    'avatarAssetId',
    'state',
    'stateAt',
    // AND WHETHER THEY SAID THEY ARE HERE, from migration 0125. Carried because it is a person's own
    // answer and nothing can work it out again: a restore that dropped it would put everybody back
    // online, which is a claim about them that they never made.
    'presenceChoice',
    'presenceChoiceAt',
    // AND THE TWO SETTINGS THEY MADE ABOUT THE CHAT BUTTON, from migrations 0128 and 0129: how its
    // number is drawn, and which picture it carries. Carried for the same reason as the answer above
    // — each is a choice somebody made and nothing can work it out again — and a restore that
    // dropped them would put everybody back on the defaults without saying it had.
    'circleShows',
    'circlePicture',
    // AND WHICH NAME A LINK IN A MESSAGE DRAWS, from migration 0132, for the same reason: it is a
    // choice somebody made and a restore that dropped it would put everybody back on the default.
    'messageLinkLevel',
    'messageLinkLayout',
    // AND WHETHER A MESSAGE SAYS WHICH PROJECT IT IS IN, AND HOW ITS PICTURES ARE DRAWN, from
    // migration 0142. Criterion M73 and decision rJphPkCG3l7X. Same reason again: each is a choice
    // somebody made, nothing can work either out again, and the picture one has nowhere else to
    // live now that it has come off the browser.
    'messageProjectMark',
    'messagePictures',
    // AND HOW BIG THE CHAT'S OWN TEXT IS, from migration 0152, AND WHETHER MEDIA A RECORD OR A
    // MESSAGE POINTS AT ARE LOADED AT ALL, from this cluster. Criteria M112 and U5. The same reason
    // a third and fourth time: each is a choice somebody made, nothing can work either out again,
    // and an export that dropped one would put the person back on a default they did not pick.
    //
    // `chatTextSize` was on the table since September and reached neither this list nor
    // `schema.ts`; declaring the column is what let `tests/export-format.test.ts` see it, and that
    // test names people's declared columns against this list, so it went red for both at once.
    'chatTextSize',
    // AND WHICH KEY SENDS A MESSAGE, from migration 0188. Same reason once
    // more: it is a choice somebody made, nothing can work it out again, and an export that dropped
    // it would put the person back on a default they did not pick.
    'sendKey',
    // AND WHICH KEYBOARD SHORTCUTS ARE ON, from migration 0191, by item 5 of a decision. The
    // same reason: a choice somebody made, which nothing can work out again.
    'shortcuts',
    // AND WHEN THE CHAT CIRCLE SHOWS AND HOW THE CHAT OPENS, from migration 0340. The same reason:
    // each is a choice somebody made, which nothing can work out again.
    'chatButtonStays',
    'chatOpensAs',
    // AND THE PERSON'S OWN MESSAGE LABELS, from migration 0341. The same reason: words and colours
    // somebody chose, which nothing can work out again.
    'chatLabels',
    // AND THE PERSON'S OWN SETTINGS FOR THE FOUR SHIPPED FLAGS AND 'NO MARK', from migration 0346. The same
    // reason: words and colours somebody chose, which nothing can work out again.
    'shippedFlags',
    'chatLayout',
    // AND THE MODE THE PERSON STARTS IN, from migration 0354. Carried because nothing can work it out again: a restore
    // that dropped it would put a person the office made back on Normal mode, read from NULL.
    'startingMode',
    // AND THE PERSON'S CHOSEN LOOK AND THE THEMES THEY MADE, from migration 0347. The same reason:
    // a choice and colours somebody made, which nothing can work out again.
    'themes',
    // AND THE PERSON'S OWN AGENT TAGS, from migration 0344. The same reason: names and colours
    // somebody chose, and the agents they marked, which nothing can work out again.
    'agentTags',
    // AND WHETHER THIS PERSON OWNS THE OFFICE, AND WHERE THEIR NAME CAME FROM, from the owner migration
    // (`the_owner_comes_from_the_installer`). Carried because who owns an office is written once, at
    // its first migrate, and nothing can work it out again: a restore that dropped it would leave an
    // office that says nobody owns it.
    'officeOwner',
    'language',
    'mediaLoad',
    'createdAt',
    'createdByKind',
    'createdById',
    'homeWorld',
    'homeInstallation',
    'citizenSince',
    // AND WHICH CARD THEY HOLD, WHAT THEY DO AND WHICH PORTRAIT IS ON IT, from migration 0138.
    // Criteria P45, P46 and P47. All three are carried because nothing can rebuild any of them: an
    // occupation is what somebody said they do, a portrait is one they picked out of three, and a
    // card is what somebody accepted. A restore that dropped them would put every person back to
    // "no role set" with nothing saying it had.
    'role',
    'occupation',
    'portrait',
    // AND HOW THEY WISH TO BE ADDRESSED, from migration 0181.
    // Carried because each part is what somebody wrote about themselves and nothing can rebuild it.
    'addressName',
    'addressSecondPerson',
    'addressThirdPerson',
    'addressTitle',
    // AND WHO LAST SET IT, AND WHEN, from migration 0182.
    'addressSetByKind',
    'addressSetById',
    'addressSetAt',
  ],
  office_scene_settings: ['onlyRow', 'settings', 'updatedAt', 'updatedByKind', 'updatedById', 'authority'],
  office_map_layouts: ['configurationKey', 'data', 'updatedAt'],
  // THE MODEL EACH RUN USES, added by migration 0176. Criterion U2. Six columns in the same shape,
  // and `settings` is the JSON holding the office's choices.
  run_models: ['onlyRow', 'settings', 'updatedAt', 'updatedByKind', 'updatedById', 'authority'],
  // THE CASTING TABLE AND ITS HISTORY, added by migration 0189.
  casting: [
    'role', 'project', 'program', 'programFrom', 'model', 'modelFrom', 'effort', 'effortFrom', 'why', 'whyFrom',
    'changedAt', 'changedByKind', 'changedById', 'authority',
  ],
  casting_changes: ['id', 'role', 'project', 'at', 'byKind', 'byId', 'authority', 'decisions', 'note', 'before', 'after'],
  // SEVERAL CASTINGS FOR EACH ROLE, migration 0190, with the probability cell from 0268, the
  // work group cell from 0318, and the labels and Out until cells from 0349. One row per casting, and its history.
  casting_rows: [
    'id', 'role', 'project', 'marked', 'program', 'programFrom', 'model', 'modelFrom', 'effort', 'effortFrom', 'difficulty', 'difficultyFrom', 'quota', 'quotaFrom', 'cost', 'costFrom', 'probability', 'probabilityFrom', 'workGroup', 'workGroupFrom', 'labels', 'labelsFrom', 'outUntil', 'outUntilFrom', 'why', 'whyFrom',
    'changedAt', 'changedByKind', 'changedById', 'authority',
  ],
  casting_row_changes: ['id', 'castingId', 'role', 'project', 'what', 'at', 'byKind', 'byId', 'authority', 'decisions', 'note', 'before', 'after'],
  // THE CASTING LABELS, migration 0349: one row per label for the whole installation, and every change to one.
  casting_labels: ['id', 'name', 'meaning', 'meaningFrom', 'changedAt', 'changedByKind', 'changedById', 'authority'],
  casting_label_changes: ['id', 'labelId', 'what', 'at', 'byKind', 'byId', 'authority', 'note', 'before', 'after'],
  // THE DIRECTORIES SOMEBODY ADDED BY HAND AS PREVIEW ROOTS, added by migration 0165. Criterion U4.
  // Six columns in the office_scene_settings shape, and `settings` is the JSON keyed by project.
  preview_root_additions: ['onlyRow', 'settings', 'updatedAt', 'updatedByKind', 'updatedById', 'authority'],
  // THE PRICE TABLE THE PERSON SETS IN SETTINGS, added by migration 0177. Criterion U3. The same six
  // columns, and `settings` is the JSON table.
  price_table: ['onlyRow', 'settings', 'updatedAt', 'updatedByKind', 'updatedById', 'authority'],
  agents: [
    'pixelAppearance',
    'pixelScale',
    'id',
    'name',
    'handle',
    'avatarAssetId',
    'state',
    'stateAt',
    // AND WHO SET THE LINE, from migration 0126. Carried because "the agent wrote this" and "a
    // person wrote this on the agent" are different facts about the same words, and a restore that
    // dropped it would read every line as the agent's own.
    'stateByKind',
    'stateById',
    'runtime',
    // AND WHO STARTED IT, WHAT IT MAY DO, WHERE IT WORKS AND WHAT IT WAS STARTED FOR, from
    // migrations 0135 to 0137. All five are carried because nothing can rebuild any of them: who
    // started an agent is said once, by the run that did it, and a restore that dropped it would
    // leave a registry that cannot say who answers for anybody. Criteria P1, P2, P43, P15 and P11.
    'startedByKind',
    'startedById',
    // An owner can be handed over, so the starter cannot reconstruct it.
    'ownerId',
    'ownerKind',
    'role',
    // AND WHO CHOSE THAT CARD, from migration 0146. Criterion P75. Carried for the reason the card
    // beside it is: nothing can rebuild it. Whether the rule wrote the card or a starter chose it is
    // said once, at the moment of registration, and a restore that dropped it would turn every
    // recorded choice into "nobody recorded one" — which is a different fact and the honest reading
    // of a row that really has none.
    'cardChosenBy',
    // AND EVERY GRANT THE PERSON MADE IT, from migration 0139. Criterion P59. Carried because
    // nothing can rebuild it: it was given once, by pressing a button, and a restore that dropped it
    // would leave a registry that cannot say what an agent was allowed to do while it wrote.
    'elevation',
    'workArea',
    'startedFor',
    'startedByRun',
    'credential',
    'retired',
    'retiredBecause',
    // AND WHEN IT WAS RETIRED AND BY WHOM, added by migration 0145 for problem zyCcJYCLsAe7. Null on
    // a row that is not retired, and on one a claim release retired before the retire door existed.
    'retiredAt',
    'retiredByKind',
    'retiredById',
    'createdAt',
    'createdByKind',
    'createdById',
    'homeWorld',
    'homeInstallation',
    'citizenSince',
    // AND HOW IT WISHES TO BE ADDRESSED, from migration 0181, for the reason a person's is carried.
    'addressName',
    'addressSecondPerson',
    'addressThirdPerson',
    'addressTitle',
    // AND WHO LAST SET IT, AND WHEN, from migration 0182.
    'addressSetByKind',
    'addressSetById',
    'addressSetAt',
    // AND WHETHER IT IS A PERMANENT RESIDENT, AND ITS SUCCESSOR, from migration
    // a_permanent_resident_has_a_space_of_its_own. Carried because nothing can rebuild them:
    // the owner's press is a moment, and a restore that dropped them would leave a space with no resident.
    'residentSince',
    'residentProposal',
    'residentDecision',
    'residentConfirmedByKind',
    'residentConfirmedById',
    'successorId',
    'successorNamedAt',
    'successorNamedByKind',
    'successorNamedById',
    // AND WHEN THE PICTURE-AND-NAME REMINDER AFTER ITS CONFIRMATION WAS FILED AND SETTLED, and by whom, from migration 0233.
    // Carried because nothing can rebuild a press.
    'residentNamingAskedAt',
    'residentNamedAt',
    'residentNamedByKind',
    'residentNamedById',
    // AND WHETHER IT READS A RELEASE FROM THE CHECK'S OWN RESULT, from migration 0203, with who said so and why.
    // Carried because nothing can rebuild it: it is the agent's or the owner's word.
    'readsReleasesFromTheCheck',
    // AND WHETHER IT WAS REGISTERED WITH NO KEY OF ITS OWN, from migration 0273. Carried because nothing can rebuild it,
    // and a restore that dropped it would let a write in the agent's name be taken without a run key again.
    'runKeysOnly',
    // AND A SECRETARY'S OWN SLEEP TIME, with when and by whom it was set, from migration 0330. Each
    // secretary sets its own. Carried because nothing can rebuild it: it is the secretary's or the person's own
    // word.
    'sleepTimeStarts',
    'sleepTimeMinutes',
    'sleepTimeSetAt',
    'sleepTimeSetBy',
  ],
  agent_records: ['recordId', 'agentId'],
  // A RESIDENT'S LEAVE TO READ, ITS VOID MARKS AND ITS WRITES, from the same migration. Every row is somebody's own
  // act with who and when. The files they are about are NOT in an archive: they are beside the database, in
  // personal-spaces/, and the backup carries them.
  resident_read_grants: ['id', 'residentId', 'readerId', 'until', 'givenAt', 'givenByKind', 'givenById', 'endedAt', 'endedByKind', 'endedById'],
  resident_void_marks: ['id', 'residentId', 'path', 'because', 'markedAt', 'markedByKind', 'markedById'],
  resident_space_writes: ['id', 'residentId', 'path', 'bytes', 'sha256', 'writtenAt', 'writtenByKind', 'writtenById', 'replacedVersion'],
  // A RESIDENT'S SLEEPS AND POSTPONED SLEEPS, from migration 0233. Each row is the resident's or the person's own act,
  // or Mole Office's at a secretary's sleep time, with when that sleep ends and the reminder it sent (migration 0330).
  resident_sleeps: ['id', 'agentId', 'what', 'beganAt', 'endedAt', 'because', 'byKind', 'byId', 'sessionId', 'wakesAt', 'reminderId'],
  // WHICH INSTALLATION THIS DATABASE BELONGS TO. One row, and it is carried because nothing can
  // rebuild it: the id was worked out from the declaration on the day the row was first written,
  // and working it out again today would answer about today's declaration instead.
  //
  // AND THE MOMENT AND THE WHO OF THE KEY WINDOW CLOSING, added by 0165, criterion P83 point 6. All
  // three are carried because nothing can rebuild them: the person's press is a moment, and a
  // restore that dropped the close would hand every keyless caller the window back while the list
  // still said they had shut it.
  installation: [
    'onlyRow',
    'id',
    'how',
    'writtenAt',
    'windowClosedAt',
    'windowClosedByKind',
    'windowClosedById',
    // WHAT THE OFFICE KEEPS, criterion U6, added by 0166. Carried because the person's own choice of
    // how much to keep exists nowhere else, and a restore that dropped it would silently put the
    // office back on its defaults while the Settings page still said the numbers they chose.
    'keepBackups',
    'untracedRequestDays',
    'tracedRequestDays',
    // HOW FAR OUT A GOAL REACHES, criterion P1, added by 0169. Carried for the same reason as the
    // three above: the person's own choice of the spans exists nowhere else, and a restore that
    // dropped it would silently put the office back on its defaults while the settings still said
    // the numbers they chose. A distant goal has no column and is not here.
    'goalShortDays',
    'goalMediumDays',
    'goalLongDays',
    // WHETHER AGENTS MAY INJECT, criterion M91, added by 0175. Carried for the same reason: the
    // person's switch exists nowhere else, and a restore that dropped it would silently let every
    // agent inject again while they had switched it off.
    'agentsMayInject',
    // WHICH ADDRESS IS WHICH MACHINE, problem 8Kf0hCaK4lQY, added by 0187. Carried for the same reason: the
    // names they gave exist nowhere else, and a restore that dropped them would silently put every message from
    // another machine back to its address.
    'machineNames',
    // THE SECRETARY WHO TAKES THE DEAD LETTERS, problem 0WUuvB0IhRfb, added by 0198. Carried for the same reason:
    // the person's choice exists nowhere else, and a restore that dropped it would leave the dead letters with nobody.
    'deadLetterSecretary',
    // Database choices survive an archive restore rather than returning to legacy defaults.
    'deadLetterAfterDays',
    'deadLetterAfterCount',
    // THE ONE ADDRESS A BROWSER IS SENT TO, wave 13x round 7, added by 0207. Carried for the same reason: the person's
    // choice exists nowhere else, and a restore that dropped it would silently send browsers to the .env address.
    'addressForBrowsers',
    // THE MERGE QUEUE'S OWNER, added by 0208. Carried for the same reason: the person's choice
    // exists nowhere else, and a restore that dropped it would leave only the person able to move an entry to the front.
    'mergeQueueOwner',
    // WHETHER THE RELATED TESTS RUN FIRST, by part B of a decision, added by 0213. Carried for
    // the same reason: the choice exists nowhere else, and a restore that dropped it would silently switch it off.
    'relatedTestsFirst',
    // THE TOPS OF THE OFFICE'S LOAD RANGES, added by 0230. Carried for the same reason: the
    // choice exists nowhere else, and a restore that dropped it would silently put the defaults back.
    'loadReadMsTop',
    'loadCpuPercentTop',
    'loadMemoryMbTop',
    // WHICH PLUGINS ARE SWITCHED ON, added by 0234. Carried for the same reason: the choice exists nowhere else, and a
    // restore that dropped it would silently switch every plugin off.
    'pluginSwitches',
    // WHETHER CHECKS RUN IN MERGES-ONLY MODE, AND THE STALE FORK BASES, wave 13j round loop-1, added by 0251. Carried for
    // the same reason: the choice exists nowhere else, and a restore that dropped it would silently switch it off.
    'checksInMergesOnly',
    'staleForkBases',
    // WHEN THE MESSAGE WORKER FIRST TOOK MESSAGES WRITTEN IN ANOTHER PROJECT, wave 13y round 112, added by 0312. Carried
    // because it is a moment, and nothing can recreate a moment: a restore that dropped it would set it again at the next
    // reading of the queue, and a message written in another project between the two would wait for a press.
    'otherProjectsMessagesSince',
    // WHEN THIS OFFICE BEGAN TO KEEP THE HAND-OVERS OF AN AGENT'S OWNER, wave 13s round 281, added by 0356. Carried
    // because it is a moment: a restore that dropped it would set it again at the next start, and the page would say the
    // list began after hand-overs it holds.
    'ownerChangesSince',
  ],
  // EVERY WORLD THIS INSTALLATION HAS EVER HAD. Carried because a world appearing and a world
  // disappearing are moments, and nothing can recreate a moment.
  worlds: [
    'id',
    'name',
    // WHAT THE WORLD IS FOR, and WHICH HANDBACK IT BELONGS TO. Criteria P87 and C33, added
    // 12 September 2026. Carried for the same reason as the rest: a sentence somebody wrote about
    // why a world existed cannot be worked out again from anything else.
    'purpose',
    'handback',
    'kind',
    'startedByKind',
    'startedById',
    'checkout',
    'head',
    'databaseIdentity',
    'address',
    'addressForOtherMachines',
    'standing',
    'parentWorld',
    'bornAt',
    'diedAt',
    'diedBecause',
    'installation',
  ],
  // A CITIZEN OF ONE WORLD WORKING IN ANOTHER. Carried because what somebody came to do is their own
  // sentence, and nothing can recreate it.
  visits: [
    'id',
    'visitorKind',
    'visitorId',
    'fromWorld',
    'toWorld',
    'since',
    'until',
    'why',
    'registeredAt',
    'reportedAt',
  ],
  // A VISITOR'S CREDENTIAL records its request and any confirmation. Keep those facts, but replace
  // `tokenHash` with REMOVED_MARK and the row's id, as in a backup. The restored visitor
  // pairs again.
  visitor_credentials: [
    'id',
    'handle',
    'name',
    'role',
    'tokenHash',
    'world',
    'machine',
    'machineHow',
    'conversationPath',
    'startDirectory',
    'runtime',
    'sessionRecord',
    'standing',
    'confirmedByKind',
    'confirmedById',
    'confirmedAt',
    'endsAt',
    'endedAt',
    'endedBecause',
    'issuedAt',
  ],
  // AND EVERY REQUEST MADE UNDER ONE. Carried because it is the evidence the credential's monitoring counts are made of: a
  // backup that dropped these would restore a credential whose mismatch count was zero and whose
  // history said nothing had ever been asked under it.
  visitor_requests: [
    'id',
    'credentialId',
    'at',
    'method',
    'route',
    'operation',
    'wrote',
    'refusedBecause',
    'mismatch',
    // WHETHER IT CAME FROM A MACHINE THIS OFFICE TRUSTS, added by migration 0144. Criterion P73.
    'fromATrustedMachine',
  ],
  // THE MACHINES THIS OFFICE TRUSTS, added by migration 0144. Criterion P73.
  trusted_machines: [
    'id',
    'address',
    'note',
    'how',
    'credentialId',
    'addedAt',
    'addedByKind',
    'addedById',
    'removedAt',
    'removedByKind',
    'removedById',
    'removedBecause',
  ],
  // WHEN THE RECIPIENT LAST PUT OFF THE LEAD OFFER THE MESSAGE CARRIES, added by migration 0200.
  // AND WHEN THE OFFICE BRINGS IT BACK FOR REMIND ME LATER, and when it did, added by migration 0203. A backup that dropped
  // them would restore a reminder the person asked for as one nobody asked for.
  // AND WHO SET THE TIME, added by migration 0288: a backup that dropped it would put the person's words on a time the
  // secretary set under the grant.
  // AND WHICH MESSAGE CARRIES THE ROW'S WORDS, added by migration 0324: a backup that dropped it would hand the agent a
  // comment a sent review's message already gave it, and a press on the comment would ask for the comment's own run.
  message_delivery: ['id', 'messageId', 'recipientKind', 'recipientId', 'mark', 'at', 'because', 'run', 'inferredBy', 'offerPutOffAt', 'remindAt', 'remindSetByKind', 'remindSetById', 'remindedAt', 'carriedIn'],
  conversation_reads: ['id', 'workspaceId', 'readerKind', 'readerId', 'pair', 'asSide', 'asSideKind', 'at'],
  groups: ['id', 'workspaceId', 'name', 'openedByKind', 'openedById', 'openedBecause', 'openedAt', 'about'],
  group_members: ['id', 'groupId', 'memberKind', 'memberId', 'joinedAt', 'joinedBecause', 'leftAt'],
  work_claims: [
    'id',
    'workspaceId',
    'claimantKind',
    'claimantId',
    'run',
    'things',
    'openedAt',
    'renewedAt',
    'releasedAt',
    'releasedBecause',
  ],
  // WHICH ADDRESSEE'S DEAD LETTERS A SECRETARY HAS TAKEN ON, added by migration 0160. Criterion M111.
  dead_letter_claims: [
    'id',
    'workspaceId',
    'groupId',
    'agentId',
    'openedAt',
    'claimedByKind',
    'claimedById',
    'claimedAt',
    'claimedBecause',
  ],
  // WHICH LIVE SESSION IS ANSWERING AS A DURABLE AGENT. Carried because an archive is all of a
  // database or none of it, and harmless in a restore: no reader believes a hold without asking how
  // long ago its session last spoke, and a restored row is always far past that, so it reads as
  // lapsed and the next reader releases it saying so.
  handle_holds: [
    'id',
    'agentId',
    'sessionRecordId',
    'machine',
    'runtime',
    'claimedAt',
    'lastHeardAt',
    'lastHeardInstant',
    'releasedAt',
    'releasedBecause',
  ],
  contact_groups: ['id', 'ownerKind', 'ownerId', 'key', 'side', 'name', 'at', 'createdAt'],
  contact_placements: ['id', 'ownerKind', 'ownerId', 'contact', 'groupKey', 'at', 'placedAt'],
  contact_group_collapses: ['id', 'ownerKind', 'ownerId', 'groupKey', 'collapsed', 'setAt'],
  // A REQUEST FOR ONE PRESS, migration 0206.
  one_press_requests: ['id', 'workspaceId', 'act', 'inputs', 'askedBy', 'shows', 'because', 'state', 'askedAt', 'answeredAt', 'answeredByKind', 'answeredById', 'outcome'],
  // ONE USE OF A TOOL, ONE ROW, migration 0231 (wave 13s round 33).
  // AND WHAT THE USE DOOR FOUND WHEN IT CHECKED THE LINE'S PROOF, added by migration 0300 (wave 13n round R, item 2i).
  // AND THE MOMENT OF ITS STAMP AS AN INSTANT WITH ITS OFFSET, added by migration 0358.
  tool_uses: ['id', 'workspaceId', 'runId', 'seq', 'at', 'tool', 'said', 'actorType', 'actorId', 'movedAt', 'proof', 'atInstant'],
  test_file_runs: ['id', 'workspaceId', 'useId', 'file', 'result', 'seconds', 'testFileHash', 'treeCommit', 'treeChange'],
  // A HANDOVER DOCUMENT FOR AN AGENT, migration 0232.
  handovers: ['id', 'agentId', 'workspaceId', 'text', 'writtenAt', 'writtenByKind', 'writtenById', 'sessionId'],
  // A READINESS CHECKLIST AND ITS SIGNATURES, migration 0252.
  readiness_checklists: ['id', 'workspaceId', 'operation', 'inputs', 'onWhat', 'shows', 'level', 'signers', 'raisedByKind', 'raisedById', 'because', 'state', 'raisedAt', 'endsAt', 'closedAt', 'closedByKind', 'closedById', 'outcome'],
  readiness_signatures: ['id', 'checklistId', 'signerKind', 'signerId', 'onWhat', 'signedAt', 'withdrawnAt'],
  // A SIGNING PACKAGE AND ITS ITEMS, migration 0270, which two decisions set out
  // together.
  signing_packages: ['id', 'workspaceId', 'broughtBy', 'forAgent', 'task', 'state', 'broughtAt', 'answeredAt', 'answeredByKind', 'answeredById', 'outcome', 'holdEndsAt', 'holdEndedAt', 'holdEndedHow'],
  signing_package_items: ['id', 'packageId', 'position', 'act', 'inputs', 'why', 'shows', 'changes', 'undone', 'state', 'outcome', 'doneAt', 'carriedOut', 'carriedOutBy', 'carriedOutIn'],
  // THE OWNER'S LIST OF QUICK INPUTS AND EVERY ASK FOR ONE, migration 0272. `inputs` is the
  // JSON list as stored, or null after a clear, written as a plain field as the price table's `settings` is.
  quick_input_list: ['onlyRow', 'inputs', 'updatedAt', 'updatedByKind', 'updatedById'],
  quick_input_asks: ['id', 'atMs', 'agentId', 'run', 'terminal', 'input', 'outcome', 'says', 'askedByKind', 'askedById', 'provedBy'],
  // ONE PRESS FOR THE PERSON UNDER THEIR GRANT, migration 0280. `reason` is the secretary's own words, null only on a read.
  presses_for_the_person: ['id', 'workspaceId', 'agentId', 'sessionId', 'grantId', 'operation', 'reason', 'at'],
  // THIS OFFICE'S LIST OF WHAT THE PERSON'S GRANT CARRIES, migration 0287: one row per door the person changed.
  what_the_grant_carries: ['door', 'answer', 'updatedAt', 'updatedByKind', 'updatedById'],
  // WHAT THIS `satisfies` IS FOR, AND WHAT IT WAS BEFORE 18 AUGUST 2026.
  //
  // It said `Record<string, readonly string[]>`, which asks nothing about WHICH tables are here. The
  // paragraph on `AuthoredRegion` below claimed this line was what made a new authored table a
  // compile error, and it was not: `work_windows` reached `AUTHORED_TABLES` on 17 August with no
  // entry here, this declaration accepted that, and the only complaint came from `columnsOf` failing
  // to index — a `noImplicitAny` message about an index signature, one screen down, naming neither
  // the table nor the reason. Turn that flag off and a new table leaves every backup in silence.
  //
  // `Record<AuthoredTable, …>` is the check the comment always described. A table in
  // `AUTHORED_TABLES` with no entry here now fails to compile ON THIS LINE, saying which name is
  // missing. It is `ArchivedTable` since a decision: an authored table less the ones on
  // `LEFT_OUT_OF_BACKUPS_AND_EXPORTS`, which have no entry here because no archive carries
  // them.
} as const satisfies Record<ArchivedTable, readonly string[]>

/**
 * Columns that ARE exported but not as a field line, because they are documents rather than
 * values. Each gets its own fenced JSON block, pretty-printed so a person can read it.
 */
/**
 * THE JSON COLUMNS THAT HOLD A LIST RATHER THAN A DOCUMENT.
 *
 * Every other JSON column in this database holds an object: `records.data`, `revisions.data`,
 * `presentation_intent.intent`. The importer refuses an array in one of
 * those, and it should: a record whose `data` came back as a list would be a record no reader could
 * read, and nothing else would say so.
 *
 * `folder_readings.pieces` is the first that holds a list, and it holds one because a reading of a
 * folder is a list of proposed pieces in the order the agent found them. So the exception is
 * written down by name, here, rather than the rule being loosened for every column at once.
 */
export const JSON_LIST_COLUMNS: Readonly<Record<string, readonly string[]>> = {
  agents: ['workArea'],
  folder_readings: ['pieces'],
}

const JSON_BLOCK_COLUMNS = {
  records: ['data'],
  // WHAT AN AGENT PROPOSED AND WHAT THE PERSON DECIDED, as one document. It is the whole content of
  // the row — everything else on it is who read what, and when — so it gets its own block for the
  // reason a record's `data` does.
  folder_readings: ['pieces'],
  // A REVISION'S `data` IS A DOCUMENT, exactly as a record's is, and it is the whole reason the
  // revision exists — so it gets its own fenced block and one file per revision, the same
  // arrangement a record and its `data` have.
  revisions: ['data'],
  // WHAT A WORKER WAS ASKED AND WHAT IT SENT BACK. Both are documents, so both get a block.
  //
  // `request` IS WRITTEN ONCE AND NEVER REWRITTEN, and it is the only record of what was asked — an
  // answer can only be read against the question that produced it. `result` is null until something
  // comes back, and the block is written out as `null` rather than left off, because an absent
  // document and an empty one are different facts and the importer refuses a row missing either.
  //
  // A REGION WITH A JSON BLOCK GETS ONE ROW PER FILE. The importer pairs an envelope with the
  // documents in the same file and refuses a file describing two such rows, so every run is its own
  // page under `runs/` — the same arrangement a record and its `data` have.
  agent_runs: ['request', 'result'],
} as const satisfies Partial<Record<string, readonly string[]>>

/**
 * Columns that are NEVER exported, and why, so the omission is a decision rather than a gap.
 *
 * Both belong to `session_resources` and both are facts about THIS MACHINE AT THIS MOMENT. A pid
 * is meaningless after a reboot and restoring one somewhere else hands a killer a number that now
 * belongs to an innocent process. See design/stages-audit/DECISIONS.md, decision 3, and FORMAT.md
 * §2.2 for the one consequence the importer cannot fix alone.
 */
const NEVER_EXPORTED = {
  session_resources: ['pgid', 'osStartedAt'],
  // WHICH KEY A WORLD'S REPORTS CARRY, added by 0179. It is the id of a `held_keys` row, and no
  // archive carries that table, so a restored row would name a key that is not there.
  worlds: ['runKeyId'],
} as const satisfies Partial<Record<string, readonly string[]>>

/**
 * Columns SQLite stores as 0 or 1 and the format writes as a JSON boolean. One that may hold null
 * writes null as null.
 *
 * `inferred` is a quarter of the link table and it is not decoration: an import that loses it
 * turns Mole Office's own guess into a human assertion, and the record page draws the two differently
 * and says so.
 */
const BOOLEAN_COLUMNS: Readonly<Record<string, readonly string[]>> = {
  links: ['inferred'],
  // AND WHETHER A REQUEST MADE UNDER A VISITING AGENT'S CREDENTIAL WROTE ANYTHING. Criterion P26
  // asks the Embassy for how many of a visitor's requests wrote, and that number is counted from
  // this column: an import that read it back as the text "0" would count every request as a write.
  visitor_requests: ['wrote', 'fromATrustedMachine'],
  // AND WHETHER THE PROJECT'S HANDED-BACK PACKAGE POINTS ARE INSPECTED, added by 0345. It has three
  // answers, and null is nobody having chosen, which the office reads as on. The reader keeps that
  // null: an export that wrote it as false would turn the project's inspection off on a restore.
  workspaces: ['packageInspection'],
}

/*
 * `from_a_trusted_machine` IS ON THAT LIST NOW, and criterion P73 is why it once was not.
 *
 * It looks like a boolean and it has THREE answers: 1, a machine this office trusts; 0, one it does
 * not; and null, nobody being able to tell which machine the request came from, which is every
 * request on the loopback door. On 7 September 2026, listing it turned every export of a database
 * holding one such row into an ExportError, because the boolean reader then refused anything that was
 * neither 0 nor 1; tests/restore-semantics.test.ts went red on exactly that. Since 18 November 2026
 * the reader keeps a null in a column that may hold one, so the column is written as true, false or
 * null, and the import reads those back as 1, 0 or null.
 */

/** Columns stored as JSON text that are written inline, as one JSON value on one field line. */
const INLINE_JSON_COLUMNS: Readonly<Record<string, readonly string[]>> = {
  presentation_intent: ['intent'],
  // WHO A KEY PROVED, on both ledgers. Criterion P83, point 5. The column is stored through
  // drizzle's `{ mode: 'json' }`, so a reader of the database gets an object and the format has to
  // write the same object inline rather than double-encoding it; the archive's own reader parses it
  // back. `changes` and `revisions` carry it together, as the two ALTER TABLE statements do.
  changes: ['provedHolder'],
  revisions: ['provedHolder', 'parts'],
}

/**
 * A region of the archive is an authored table an archive carries, and the two words mean the same set.
 *
 * IT USED TO BE `keyof typeof TABLE_OF`, WITH `TABLE_OF` WRITTEN OUT HERE — a second enumeration of
 * the authored tables, checked against the schema's list at import time by a `throw` in
 * `EXPORTED_REGIONS`. That throw is gone because the check is now the type: `REGION_COLUMNS` ABOVE
 * `satisfies Record<AuthoredTable, …>`, so a table added to `AUTHORED_TABLES` and not handled there
 * fails to compile rather than raising at start-up.
 *
 * THAT SENTENCE WAS NOT TRUE BETWEEN 12 AND 18 AUGUST 2026 and it cost a table one day in the
 * archive. The `satisfies` said `Record<string, …>`, which asks nothing about which tables are
 * present, so `work_windows` was added to the schema and left out of the export with nothing saying
 * so. The note on that line records what happened; the type there now is the one described here.
 */
export type AuthoredRegion = ArchivedTable | PartRegion

// ============================================================================ the tables declared in a schema part

/**
 * A TABLE DECLARED IN A SCHEMA PART IS A REGION WITH NO LINE IN THIS FILE. `everyPartTable()` in
 * every-part-table.ts says which part tables an archive carries. What the maps above say for a table of
 * schema.ts is read off a part table's own columns instead: every column is a field line, a
 * `{ mode: 'boolean' }` column is true or false, a `{ mode: 'json' }` column is one JSON value on its
 * line, and the project is the `workspaceId` column, or nobody's with the table's own sentence.
 *
 * A BRANDED STRING, so that every lookup into a map keyed by the tables of schema.ts fails to compile
 * until it says what it does for a part table.
 */
type PartRegion = string & { readonly aTableDeclaredInASchemaPart: true }

const EXPORTED_PART_TABLES: ReadonlyMap<string, PartTable> = new Map(
  everyPartTable()
    .filter((table) => table.says.exported)
    .map((table) => [table.name, table]),
)

function isPartRegion(region: AuthoredRegion): region is PartRegion {
  return EXPORTED_PART_TABLES.has(region)
}

function partTableOf(region: PartRegion): PartTable {
  const table = EXPORTED_PART_TABLES.get(region)
  if (table === undefined) throw new ExportError(`${region} is not a table any schema part declares for an archive.`)
  return table
}

/**
 * The part tables no archive carries, each with the sentence the manifest and the README print after
 * its name: where it is declared, and what its declaration says a restore does without it.
 */
function partTablesNoArchiveCarries(): { name: string; sentence: string }[] {
  return everyPartTable().flatMap((table) => {
    const says = table.says
    if (says.exported) return []
    const where = `a table declared in ${table.part} as \`${table.binding}\`, which no archive carries and an import writes none of.`
    if (says.restore === 'may be lost') return [{ name: table.name, sentence: `${where} A restore leaves it empty. ${says.why} To put it back: ${says.repair}` }]
    return [{ name: table.name, sentence: `${where} ${says.why}` }]
  })
}

/** The drizzle table of a region. */
function tableOf(region: AuthoredRegion) {
  return isPartRegion(region) ? partTableOf(region).table : AUTHORED_TABLE_OF[region]
}

/** How a row of a region is scoped to a project, as `WORKSPACE_COLUMN` in authored-table-of.ts answers. */
function workspaceScopeOf(region: AuthoredRegion): WorkspaceScope {
  return isPartRegion(region) ? partTableOf(region).workspaceColumn : WORKSPACE_COLUMN[region]
}

/** Why a region belongs to no project, in the sentence an archive prints. */
function whyARegionBelongsToNoProject(region: AuthoredRegion): string {
  if (!isPartRegion(region)) return whyATableBelongsToNoProject(region)
  const says = partTableOf(region).says
  const because = says.exported ? says.noProjectBecause : undefined
  if (because === undefined) throw new ExportError(`${region} has a project column, so it cannot say why it belongs to no project.`)
  return because
}

/** The TypeScript names of a part table's columns of one drizzle data type. */
function partColumnsOfType(region: PartRegion, dataType: 'boolean' | 'json'): string[] {
  return Object.entries(getTableColumns(partTableOf(region).table))
    .filter(([, column]) => column.dataType === dataType)
    .map(([tsName]) => tsName)
}

/**
 * Order two rows of a part table by their columns' values, in the order the table declares them:
 * numbers as numbers, everything else by code unit. The primary key is among the columns, so no two
 * rows tie, and an archive of a restore is the same bytes as the archive it was restored from.
 */
function byEveryColumn(a: Row, b: Row, columns: readonly string[]): number {
  for (const column of columns) {
    const x = a[column] ?? null
    const y = b[column] ?? null
    if (typeof x === 'number' && typeof y === 'number') {
      if (x !== y) return x - y
      continue
    }
    const left = JSON.stringify(x)
    const right = JSON.stringify(y)
    if (left !== right) return left < right ? -1 : 1
  }
  return 0
}

/**
 * Every authored table an archive carries, as the schema declares them, in the order it declares them.
 * `LEFT_OUT_OF_BACKUPS_AND_EXPORTS` is not among them: `panel_layouts`, by a decision.
 */
export const EXPORTED_REGIONS: readonly AuthoredRegion[] = [
  ...ARCHIVED_TABLES,
  ...[...EXPORTED_PART_TABLES.keys()].map((name) => name as PartRegion),
]

/**
 * The regions a PROJECT-SCOPED archive cannot carry, because they belong to no project.
 *
 * READ FROM THE SCHEMA. This file held its own map saying which regions had a workspace column, and
 * its comment said "`null` MEANS THE REGION BELONGS TO NO PROJECT, and two do". Migrations 0008 and
 * 0009 made it four, the map was updated and the two hard-coded queries that build the scoped
 * archive's note were not — so a project archive of a database holding drafts and recurrences said
 * "Nothing has been drafted", said "Nothing recurs", and said nothing at all about either in its
 * notes. Measured on 2026-08-12.
 */
const PERSON_LEVEL_REGIONS: readonly AuthoredRegion[] = [
  ...PERSON_LEVEL_TABLES.filter((table): table is ArchivedTable => (EXPORTED_REGIONS as readonly string[]).includes(table)),
  ...EXPORTED_REGIONS.filter((region) => isPartRegion(region) && partTableOf(region).workspaceColumn === null),
]

/** The declared column list for a region, including the ones written as JSON blocks. */
export function columnsOf(region: AuthoredRegion): { fields: readonly string[]; jsonBlocks: readonly string[]; dropped: readonly string[] } {
  if (isPartRegion(region)) return { fields: Object.keys(getTableColumns(partTableOf(region).table)), jsonBlocks: [], dropped: [] }
  const fields: readonly string[] = REGION_COLUMNS[region]
  const jsonBlocks: readonly string[] = (JSON_BLOCK_COLUMNS as Record<string, readonly string[] | undefined>)[region] ?? []
  const dropped: readonly string[] = (NEVER_EXPORTED as Record<string, readonly string[] | undefined>)[region] ?? []
  return { fields, jsonBlocks, dropped }
}

/** The TypeScript property names drizzle declares for a region's table. */
export function schemaColumnsOf(region: AuthoredRegion): string[] {
  return Object.keys(getTableColumns(tableOf(region))).sort(byCodeUnit)
}

// ============================================================================ small helpers

/** Sort by several keys at once, each compared by code unit. */
function sortBy<T>(rows: T[], ...keys: ((row: T) => string)[]): T[] {
  return [...rows].sort((a, b) => {
    for (const key of keys) {
      const cmp = byCodeUnit(key(a), key(b))
      if (cmp !== 0) return cmp
    }
    return 0
  })
}

/** A value that is a string, or a sentence saying it is not. Used where the database must have text. */
function mustBeString(value: unknown, what: string): string {
  if (typeof value !== 'string') {
    throw new ExportError(`${what} is ${JSON.stringify(value)}, and the export needs text there.`)
  }
  return value
}

/** Refuse an export rather than write something wrong. Every message names the row it is about. */
export class ExportError extends Error {
  override readonly name = 'ExportError'
}

// ============================================================================ writing the grammar

/**
 * One field line: `key: <JSON value>`.
 *
 * `undefined` is refused rather than skipped. A missing key means the row and the declared column
 * list have come apart, and writing the line out short would produce a file that imports as a row
 * with a hole in it.
 */
function fieldLine(key: string, value: unknown): string {
  if (value === undefined) {
    throw new ExportError(`the column "${key}" was not read out of the database, so the export cannot write it.`)
  }
  const json = JSON.stringify(value)
  if (json === undefined) {
    throw new ExportError(`the column "${key}" holds a value with no JSON form (${String(value)}).`)
  }
  return `${key}: ${json}`
}

/**
 * WHO A KEY PROVED, for a prose heading, or the empty string when the rule did not apply.
 *
 * THE HEADING IS WHERE A PERSON READING THE ARCHIVE MEETS THE ACT, so the proof belongs there beside
 * the actor the headers named — the same fact the row carries in `provedHolder`, in the same words a
 * page uses. Criterion P83, point 5. Absent (null, or a row written before migration 0168) says
 * nothing rather than inventing a holder, and a value that is not the shape we stored is named as
 * such instead of being dropped.
 *
 * A REGISTRY ID IS NOT A NAME A PERSON CAN READ, since I-5 binds a key to the agent's id rather than
 * its handle. So an id an agent row answers for is shown by that agent's name, and a retired agent
 * carries the word `retired` with its date. The id stands only where no agent row answers, by its id
 * or through the permanent alias that names it — the person's own key, the office's key, and an id
 * no registry row holds. The agents are the rows the export already read for `participants.md`,
 * handed in by the caller.
 *
 * NO WORDS WHERE THE KEY PROVED THE ROW'S OWN WRITER, as on the create and the mint of a run a
 * starter filed by hand: they would only repeat the writer before them. The holder stays in the
 * row's data below the heading, so nothing is lost, and the page decides it the same way.
 */
function provedHolderWords(holder: unknown, writer: { type: string; id: string }, agentsById: ReadonlyMap<string, Row>): string {
  if (holder === null || holder === undefined) return ''
  const id = (holder as { id?: unknown }).id
  if (typeof id !== 'string' || id === '') {
    throw new ExportError(`a proved-holder column holds ${JSON.stringify(holder)}, which carries no id to name.`)
  }
  if (theKeyProvedTheRowsOwnWriter(sqlite, writer, holder)) return ''
  const agent = agentsById.get(id)
  // NO ROW ANSWERS: the id is the whole truth, whether it is a person, the office or a name nothing
  // holds. The same sentence this heading has always written.
  if (agent === undefined) return ` · proved by ${id}`
  const name = mustBeString(agent['name'], `agents.name of ${id}`)
  // `agents.retired` is an integer column (0 or 1), written as stored, so a live row is one that is
  // neither 1 nor a boolean true.
  if (agent['retired'] !== 1 && agent['retired'] !== true) return ` · proved by ${name}`
  // RETIRED WITHOUT A DATE IS A REAL ANSWER: every row retired before the retire door existed was
  // retired by the release of a claim, and nobody recorded the moment. Printing one would invent it.
  const at = agent['retiredAt']
  const when = typeof at === 'string' && at !== '' ? ` ${at}` : ''
  return ` · proved by ${name} (retired${when})`
}

/** A block of field lines under a fence naming its region. */
function fieldsBlock(region: string, row: Record<string, unknown>, keys: readonly string[]): string {
  const lines = keys.map((key) => fieldLine(key, row[key]))
  return ['```mole-office ' + region, ...lines, '```'].join('\n')
}

/**
 * A JSON document under a fence naming the column it holds.
 *
 * Pretty-printed at two spaces, with the key order the database holds rather than sorted. Key
 * order is not meaning, and re-sorting would make the file differ from the value without changing
 * what it says — which is a diff that reports a change nobody made.
 */
function jsonBlock(region: string, value: unknown): string {
  const json = JSON.stringify(value, null, 2)
  if (json === undefined) {
    throw new ExportError(`the JSON block "${region}" was handed a value with no JSON form.`)
  }
  return ['```json mole-office ' + region, json, '```'].join('\n')
}

/**
 * Front matter: the same field lines, delimited by `---`, with the region named by `region`.
 *
 * THE KEY IS `region` AND IT USED TO BE `panelx`. It names what the file holds, so it is called
 * that; a key named after the product said nothing about the line it opened. `parseExportFile`
 * reads both, because 440 files written before 28 August 2026 say `panelx`.
 */
function frontMatter(region: string, row: Record<string, unknown>, keys: readonly string[]): string {
  const lines = [fieldLine('region', region), ...keys.map((key) => fieldLine(key, row[key]))]
  return ['---', ...lines, '---'].join('\n')
}

// ============================================================================ reading the database

/** One row as the export sees it: TypeScript column names, values already converted. */
type Row = Record<string, unknown>

/**
 * Read one authored table, with SQL column names mapped to the TypeScript names the format writes.
 *
 * `booleans` become true/false and JSON columns become parsed values. Everything else is passed
 * through exactly as SQLite holds it — no trimming, no normalising, and above all no touching of
 * stamps, which are local wall-clock strings that an export must never convert.
 */
/**
 * How many rows the whole database holds in a region, ignoring any scoping.
 *
 * WHAT A SCOPED ARCHIVE LEAVES BEHIND IS COUNTED FROM THE TABLE AND NOT FROM WHAT WAS READ, because
 * the rows the scoping dropped are the point: a project archive has to be able to say how much of
 * the plan is not in it.
 */
function rowsInTable(region: AuthoredRegion): number {
  return (sqlite.prepare(`SELECT count(*) AS n FROM ${region}`).get() as { n: number }).n
}

/**
 * The column on the OTHER table that says which project a through-scoped row is in.
 *
 * ONE STEP AND NO MORE, ON PURPOSE. A message is scoped through its thread and the thread says the
 * project in a column of its own. If a table were ever scoped through a table that is itself scoped
 * through a third, this refuses rather than following the chain — nothing in this database does
 * that, and a scoped archive built on a guess about where the project really lives is exactly the
 * wrong answer this whole form was added to remove.
 */
function throughScopeColumn(region: AuthoredRegion, through: ScopedThroughAnotherTable): string {
  const scope = WORKSPACE_COLUMN[through.table]
  if (typeof scope !== 'string') {
    throw new ExportError(
      `${region} is scoped through ${through.table}, and ${through.table} does not say which project a row of it is ` +
        `in with a column of its own. This export follows one step and refuses to guess at a second, so nothing was ` +
        `written. Give ${through.table} a workspace column, or scope ${region} by something that has one.`,
    )
  }
  return scope
}

/**
 * How many rows of a through-scoped table name a row that is not there.
 *
 * COUNTED FROM THE WHOLE TABLE, because these rows are what the scoping drops. A message whose
 * thread is missing belongs to no project, so no project's archive can carry it — the same shape of
 * fact as a change row whose `record_id` answers to nothing. Saying the number is what stops a
 * scoped archive reading as complete when part of a conversation had no home.
 */
function rowsWithNothingToBelongTo(region: AuthoredRegion, through: ScopedThroughAnotherTable): number {
  return (
    sqlite
      .prepare(
        `SELECT count(*) AS n FROM ${region} WHERE ${through.column} NOT IN (SELECT ${through.matches} FROM ${through.table})`,
      )
      .get() as { n: number }
  ).n
}

/**
 * Whether a region's rows are each ABOUT one record, which is what a `recordId` column means here.
 *
 * `changes` and `revisions` are the two today, and both of them derive their project from the record
 * they are about — which is why both can hold a NULL workspace and why both can end up in a scoped
 * archive with no record to belong to. Read off the declared columns rather than written as a list
 * of two table names, so a third such table is covered the day it is declared.
 */
function aboutARecord(region: AuthoredRegion): boolean {
  return columnsOf(region).fields.includes('recordId')
}

/**
 * How a region's rows are asked for: the query, scoped as an archive of `workspaceId` is, with its one argument, or
 * null when a scoped archive holds none of the region's rows.
 *
 * `columns` and `orderBy` are TypeScript names. Left out, every column is read, in no order the export relies on.
 */
function theQueryOf(
  region: AuthoredRegion,
  workspaceId: string | undefined,
  how: { columns?: readonly string[]; orderBy?: readonly string[] },
): { sql: string; args: string[] } | null {
  const columns = getTableColumns(tableOf(region)) as Record<string, { name: string } | undefined>
  const sqlNamed = (tsName: string): string => {
    const column = columns[tsName]
    if (column === undefined) throw new ExportError(`${region} declares no column ${tsName}, so the export cannot read it.`)
    return `${region}.${column.name}`
  }
  const read = how.columns === undefined ? `${region}.*` : how.columns.map(sqlNamed).join(', ')
  const order = how.orderBy === undefined ? '' : ` ORDER BY ${how.orderBy.map(sqlNamed).join(', ')}`

  // A scoped export reads ONE project's rows and nothing else. `=` and not `IS` on purpose: a
  // `changes` row whose workspace is NULL — one whose record_id answers to nothing, so no record
  // could say where it happened — belongs to no project and is therefore in no project's archive.
  // buildExport counts those and says so, because dropping them quietly would make a scoped
  // archive read as complete when part of the log had no home.
  const scope = workspaceScopeOf(region)
  if (workspaceId === undefined) return { sql: `SELECT ${read} FROM ${region}${order}`, args: [] }
  // A region that belongs to no project contributes NOTHING to a project's archive. Returning
  // every row instead would put the person's whole plan — including the hours they gave to
  // other projects — inside an archive labelled as one project's.
  if (scope === null) return null
  if (typeof scope === 'string') return { sql: `SELECT ${read} FROM ${region} WHERE ${scope} = ?${order}`, args: [workspaceId] }
  // THE THIRD FORM: this row's project is a fact about ANOTHER row. A message and a run
  // carry no workspace of their own and belong to the project their thread names, so they
  // are selected through it. An INNER JOIN, so a row naming a thread that is not there is
  // in no project's archive — `throughWithNoRow` counts those and buildExport says so,
  // for the same reason the homeless change rows are counted rather than dropped quietly.
  return {
    sql:
      `SELECT ${read} FROM ${region} JOIN ${scope.table} ON ${region}.${scope.column} = ` +
      `${scope.table}.${scope.matches} WHERE ${scope.table}.${throughScopeColumn(region, scope)} = ?${order}`,
    args: [workspaceId],
  }
}

/** What turns one region's row as SQLite holds it into the row the export writes. */
function theRowReaderOf(region: AuthoredRegion): (sqlRow: Record<string, unknown>) => Row {
  const columns = getTableColumns(tableOf(region))
  const sqlNameOf = new Map<string, string>()
  for (const [tsName, column] of Object.entries(columns)) sqlNameOf.set(column.name, tsName)

  const booleans = new Set(isPartRegion(region) ? partColumnsOfType(region, 'boolean') : BOOLEAN_COLUMNS[region] ?? [])
  const inlineJson = new Set(isPartRegion(region) ? partColumnsOfType(region, 'json') : INLINE_JSON_COLUMNS[region] ?? [])
  const jsonBlocks = new Set(columnsOf(region).jsonBlocks)
  const cleared = new Set<string>(COLUMNS_A_COPY_CLEARS.filter(({ table }) => table === region).map(({ column }) => column))

  return (sqlRow) => {
    const row: Row = {}
    for (const [sqlName, value] of Object.entries(sqlRow)) {
      const tsName = sqlNameOf.get(sqlName)
      // A column in the database that the schema does not declare. It cannot be exported, because
      // nothing says what it means; it is reported by tests/schema-tables.test.ts, whose job that
      // is, and skipped here rather than guessed at.
      if (tsName === undefined) continue
      if (cleared.has(sqlName)) {
        // Keep the field required by the importer and its unique, non-null value, as a backup does.
        row[tsName] = REMOVED_MARK + mustBeString(sqlRow['id'], `${region}.id`)
      } else if (booleans.has(tsName)) {
        // A column that may hold null keeps it: there null is an answer of its own, and neither true nor false.
        if (value === null && (columns as Record<string, { notNull: boolean } | undefined>)[tsName]?.notNull === false) {
          row[tsName] = null
          continue
        }
        if (value !== 0 && value !== 1 && typeof value !== 'boolean') {
          throw new ExportError(`${region}.${tsName} holds ${JSON.stringify(value)}, which is neither 0 nor 1.`)
        }
        row[tsName] = Boolean(value)
      } else if (inlineJson.has(tsName) || jsonBlocks.has(tsName)) {
        row[tsName] = parseStoredJson(value, `${region}.${tsName}`)
      } else {
        row[tsName] = value ?? null
      }
    }
    return row
  }
}

function readTable(region: AuthoredRegion, workspaceId?: string, how: { columns?: readonly string[] } = {}): Row[] {
  const query = theQueryOf(region, workspaceId, how)
  if (query === null) return []
  return (sqlite.prepare(query.sql).all(...query.args) as Record<string, unknown>[]).map(theRowReaderOf(region))
}

/**
 * The same rows as `readTable`, read one at a time, so a table larger than the memory the export has can be written.
 *
 * THE RECORDS, THEIR REVISIONS AND THE CHANGE LOG ARE READ THIS WAY, because they are what grows with an office. On
 * 1 November 2026 an export that read them whole ran out of memory on a made-up store of 425 MB given a heap of 192 MB.
 */
function* eachRowOf(
  region: AuthoredRegion,
  workspaceId: string | undefined,
  how: { columns?: readonly string[]; orderBy?: readonly string[] } = {},
): Generator<Row> {
  const query = theQueryOf(region, workspaceId, how)
  if (query === null) return
  const toRow = theRowReaderOf(region)
  for (const sqlRow of sqlite.prepare(query.sql).iterate(...query.args)) yield toRow(sqlRow as Record<string, unknown>)
}

/**
 * Read a JSON column back into a value, or refuse.
 *
 * Refusing is right here even though a backup that stops is a backup nobody got. Writing broken
 * text inside a block labelled `json` would make the format lie about itself, and the next
 * importer would meet it as a parse failure with no idea which row was wrong. This says which row.
 */
function parseStoredJson(value: unknown, what: string): unknown {
  if (value === null || value === undefined) return null
  if (typeof value !== 'string') {
    throw new ExportError(`${what} is stored as ${typeof value}, and a JSON column must be text.`)
  }
  try {
    return JSON.parse(value) as unknown
  } catch (err) {
    throw new ExportError(
      `${what} is not valid JSON any more (${(err as Error).message}). The export stopped rather than writing text ` +
        `into a block labelled json. Fix the row, then export again.`,
    )
  }
}

/** The migrations this database has had applied, with their journal tags where they can be found. */
/**
 * A SENTENCE WHEN THE DATABASE STILL HOLDS ROUGH DRAFTS THIS ARCHIVE DOES NOT CARRY, or null when it holds none.
 *
 * Migration 0196 moved every draft into a plan, and a draft it refused stays in `planning_drafts` with the table
 * (src/server/db/drafts-into-plans-migration.ts). That table is no longer a region of this format, so its rows are
 * not in this archive. Saying nothing would make the archive look whole when it is not.
 */
function draftsLeftBehind(): string | null {
  const exists = sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'planning_drafts'").get()
  if (exists === undefined) return null
  const n = (sqlite.prepare('SELECT count(*) AS n FROM planning_drafts').get() as { n: number }).n
  if (n === 0) return null
  return (
    `this database still holds ${String(n)} rough draft(s) in planning_drafts that migration 0196 refused to move into ` +
    'a plan, and THIS ARCHIVE DOES NOT CARRY THEM: the table is no longer part of the format. They are in the database ' +
    'file and in its backups. `npx tsx src/server/db/drafts-into-plans-migration.ts` prints them whole and says why ' +
    'each was refused.'
  )
}

export function readMigrations(): { rows: { hash: string; when: number; tag: string | null }[]; note: string | null } {
  const applied = sqlite
    .prepare('SELECT hash, created_at AS whenMs FROM __drizzle_migrations ORDER BY created_at')
    .all() as { hash: string; whenMs: number }[]

  let tagOf = new Map<number, string>()
  let note: string | null = null
  try {
    const journal = JSON.parse(readFileSync(JOURNAL_FILE, 'utf8')) as { entries?: { when?: number; tag?: string }[] }
    for (const entry of journal.entries ?? []) {
      if (typeof entry.when === 'number' && typeof entry.tag === 'string') tagOf.set(entry.when, entry.tag)
    }
  } catch {
    // The journal is part of the checkout, not of the database, so an export taken somewhere the
    // repository is not can still be written. The tags go missing and this says so rather than
    // inventing names for them.
    tagOf = new Map()
    note = 'the drizzle journal could not be read, so no migration carries a readable tag'
  }

  const rows = applied.map((m) => ({ hash: m.hash, when: m.whenMs, tag: tagOf.get(m.whenMs) ?? null }))
  const untagged = rows.filter((r) => r.tag === null).length
  if (note === null && untagged > 0) {
    note = `${untagged} applied migration(s) have no entry in the drizzle journal, so their tag is unknown`
  }
  return { rows, note }
}

// ============================================================================ the export itself

/** One file the export produces. `path` is relative to the export root and always uses `/`. */
export interface ExportFile {
  path: string
  text: string
}

/** What an export did, in numbers and in words. */
export interface ExportReport {
  root: string
  format: string
  /** How many files the export produced, including the ones already on disk unchanged. */
  files: number
  bytes: number
  /** Files created or whose content changed, sorted. */
  written: string[]
  /** Files that were already exactly right and were left alone. */
  unchanged: number
  /** Files removed because this export no longer produces them, sorted. */
  removed: string[]
  /** Row counts per authored table, which is what MANIFEST.md carries. */
  counts: Record<string, number>
  /**
   * Anything the export could not answer cleanly, said in words rather than dropped.
   *
   * A record of an unrecognised kind, a change row whose stamp will not parse, a migration with no
   * journal tag, a ledger row still showing as held. None of these stops an export and none of
   * them is silent.
   */
  notes: string[]
  /**
   * The one project this archive holds, or null when it holds the whole installation.
   *
   * ON THE REPORT AND IN THE MANIFEST, because the two archives look identical from the outside
   * and restore into completely different states. An importer that could not tell them apart would
   * read a project archive as an installation archive and report the other projects as missing.
   */
  workspace: string | null
}

/** The reason beside the refusal of a project archive while one of its rows holds an id that cannot be told. */
const UNTOLD_REASON = "Some rows hold an id that may be an agent's, so the project archive was not written."

/**
 * The permanent registry aliases a project archive carries, and the sentences that say what it carries.
 *
 * THE ALIAS OF EACH OLD ID THE ARCHIVE'S OWN ROWS STORE, AND NO OTHER. An old id is read back through its
 * alias, so the alias goes with the row that stores it. The rows are read by the identity census, which
 * reads only the tables and columns it lists; an alias row is carried when its old id and its agent are a pair the
 * census found. The agents the aliases point to stay out, because their registry rows hold grants and
 * settings that are no project's. What the census could not read is counted in the sentences, not guessed at.
 *
 * A ROW THAT CANNOT BE TOLD REFUSES THE ARCHIVE: an id with no kind stored beside it. Each such id may be an agent's
 * old id, so the archive cannot say which aliases it needs, and the refusal names each column and its rows.
 */
function theAliasClosure(
  rowsOf: (region: AuthoredRegion, columns: readonly string[]) => Iterable<Row>,
  filed: number,
): { region: AuthoredRegion; rows: Row[]; said: string[] } {
  const region = EXPORTED_REGIONS.find((one) => one === 'registry_aliases')
  if (region === undefined) throw new ExportError('No archive carries the registry_aliases table, so a project archive cannot carry the aliases its rows need.')
  const toRead = new Map<string, Set<string>>()
  for (const { table, key } of IDENTITY_CENSUS_TABLES) {
    // A table no archive carries puts no row in this one.
    const carried = EXPORTED_REGIONS.find((one) => one === table)
    if (carried === undefined) {
      toRead.set(table, new Set())
      continue
    }
    const declared = Object.entries(getTableColumns(tableOf(carried)))
    const properties = key.map((name) => {
      const column = declared.find(([, one]) => one.name === name)
      if (column === undefined) throw new ExportError(`The identity census keys the ${table} table by ${key.join(' and ')}, and that table declares no column ${name}.`)
      return column[0]
    })
    const named = new Set<string>()
    for (const row of rowsOf(carried, properties)) named.add(theRowNamed(properties.map((property) => row[property])))
    toRead.set(table, named)
  }
  const census = takeIdentityCensus(sqlite, toRead)
  // An id that cannot be told may be an old id whose alias the archive needs, so the archive is refused.
  const untold = Object.entries(census.untold)
  if (untold.length > 0) {
    throw new PanelError(
      `This project's archive was not written. Some of its rows hold an id that may be an agent's or a person's, and ` +
        `nothing stored beside it says which, so the archive cannot tell whether it must carry that id's alias. The rows: ` +
        `${untold.map(([site, n]) => `${n} in ${site}`).join(', ')}. The whole-installation export carries every alias, ` +
        `and it is not refused.`,
      409,
      undefined,
      undefined,
      UNTOLD_REASON,
    )
  }
  const pair = (stored: unknown, canonical: unknown) => JSON.stringify([stored, canonical])
  const needed = new Set(census.aliases.map((one) => pair(one.stored, one.canonical)))
  const rows = readTable(region).filter((row) => needed.has(pair(row['aliasId'], row['canonicalId'])))
  // The other tables are read only in the columns the census lists, so the sentence names those columns.
  const columns = IDENTITY_CENSUS_COLUMNS
  const wholeRows = IDENTITY_CENSUS_WHOLE_ROWS
  const said = [
    `This project's archive carries ${rows.length} of the ${filed} permanent registry aliases: the alias of each old id ` +
      `its own rows store. An agent id is looked for in the ${wholeRows.join(', ')} rows, as the identity census reads ` +
      `them, and in the columns ${columns.join(', ')}. An old id stored in any other column is not looked for, and ` +
      `that includes the other columns of these same tables. The whole-installation export carries every alias`,
    `The agents those aliases point to are NOT in this archive, nor the grants and settings kept on their registry ` +
      `rows. An import of this archive is refused unless the office already holds each of those agents`,
  ]
  if (census.blocks.length > 0) {
    const byTable = new Map<string, number>()
    for (const one of census.blocks) byTable.set(one.table, (byTable.get(one.table) ?? 0) + 1)
    said.push(
      `${census.blocks.length} place(s) in this archive's rows could not be read for an agent id, so an old id stored ` +
        `there may have no alias in this archive: ${[...byTable].map(([table, n]) => `${n} in ${table}`).join(', ')}`,
    )
  }
  return { region, rows, said }
}

/**
 * Build every file the export produces, without touching the disk.
 *
 * Separated from writing so that a test can compare two builds and the mirror can be given a tree
 * rather than a directory. It holds every file, so a door that only counts calls `countExport` below.
 *
 * `workspaceId` NARROWS IT TO ONE PROJECT — every region is read with that project's rows and no
 * others, including the `workspaces` region itself, so the archive is self-contained: it declares
 * the one boundary its rows name and nothing about the projects it is not. Left out, the archive
 * is the whole installation, which is what the mirror holds.
 */
export function buildExport(opts: { workspaceId?: string } = {}): {
  files: ExportFile[]
  report: Omit<ExportReport, 'root' | 'written' | 'unchanged' | 'removed'>
} {
  const files: ExportFile[] = []
  const report = inOneReading(() => exportFileByFile(opts, (file) => files.push(file)))
  return { files: sortBy(files, (f) => f.path), report }
}

/**
 * What an export would contain, counted as each file is made and keeping none of them.
 *
 * IT MAKES EVERY FILE, by the code that writes them, so its files and bytes are the ones an export
 * would write. It keeps no file, so a store larger than the server's heap can be counted.
 * `workspaceId` narrows it to one project, as in `buildExport`.
 */
export function countExport(opts: { workspaceId?: string } = {}): Omit<ExportReport, 'root' | 'written' | 'unchanged' | 'removed'> {
  return inOneReading(() => exportFileByFile(opts, () => {}))
}

/**
 * The regions whose rows are read one at a time and never held: they are what grows with an office. The records are
 * the third such region, and of them the export holds every column but `data`, for the titles and the index.
 */
const READ_ONE_ROW_AT_A_TIME: ReadonlySet<AuthoredRegion> = new Set<AuthoredRegion>(['revisions', 'changes'])

/**
 * Read every query of one export from one moment of the store.
 *
 * The export reads the records, the revisions and the change log more than once, and `writeExport` makes every file
 * twice. A write between two of those reads would give pages and counts that disagree, or a refusal that the first
 * making did not meet. Inside a transaction that is already open, the reads are already of one moment.
 */
function inOneReading<T>(read: () => T): T {
  if (sqlite.inTransaction) return read()
  sqlite.exec('BEGIN')
  try {
    return read()
  } finally {
    if (sqlite.inTransaction) sqlite.exec('COMMIT')
  }
}

/** Make every file of the export and give each one to `give` as it is made. What it returns is the export's report. */
function exportFileByFile(
  opts: { workspaceId?: string },
  give: (file: ExportFile) => void,
): Omit<ExportReport, 'root' | 'written' | 'unchanged' | 'removed'> {
  const workspaceId = opts.workspaceId
  const aliases = readRegistryAliases(sqlite)
  const carriesHistoryBytes = aliases.length > 0
  const notes: string[] = []
  const rowsByRegion = new Map<AuthoredRegion, Row[]>()
  const recordColumnsHeld = columnsOf('records').fields.filter((field) => field !== 'data')
  for (const region of EXPORTED_REGIONS) {
    if (READ_ONE_ROW_AT_A_TIME.has(region)) continue
    rowsByRegion.set(region, readTable(region, workspaceId, region === 'records' ? { columns: recordColumnsHeld } : {}))
  }
  /** A region's rows in the columns named: the rows held, or for a region not held, read again in those columns. */
  const rowsOf = (region: AuthoredRegion, columns: readonly string[]): Iterable<Row> =>
    rowsByRegion.get(region) ?? eachRowOf(region, workspaceId, { columns })
  /** How many rows were read of each region not held, counted as its pages are made, for the manifest. */
  const countedOneAtATime = new Map<AuthoredRegion, number>()

  /**
   * What this archive cannot carry because it is one project's, and how many rows that is.
   *
   * EMPTY FOR A WHOLE-INSTALLATION ARCHIVE, which carries everything. For a scoped one it holds
   * EVERY person-level region, including the ones with no rows: "this archive is not where you find
   * out about drafts" is the fact each of those pages has to state, and it is true whether the
   * number is 0 or 40. The count is read from the whole table, because the rows the scoping dropped
   * are exactly what the reader has to be told about.
   */
  const omittedFromScope = new Map<AuthoredRegion, number>(
    workspaceId === undefined ? [] : PERSON_LEVEL_REGIONS.map((region) => [region, rowsInTable(region)]),
  )
  /** The registry aliases a project archive carries, when the installation has filed any. */
  let aliasClosure: ReturnType<typeof theAliasClosure> | undefined

  if (workspaceId !== undefined) {
    // The boundary row itself has to be there, or the archive names a project it does not declare
    // and the importer would have to invent one. A workspace that does not exist is a refusal
    // rather than an empty archive: "0 records" and "no such project" are different answers.
    if ((rowsByRegion.get('workspaces') ?? []).length === 0) {
      throw new ExportError(
        `There is no workspace called "${workspaceId}", so there is nothing to export under that name. An empty ` +
          `archive would read as "this project holds nothing", which is a different answer from "this project does ` +
          `not exist". GET /api/workspaces lists what there is.`,
      )
    }
    // THE ALIASES THIS PROJECT'S OWN ROWS NEED, so an old id its rows store still names its agent after
    // an import. Before the notes below, which count what the archive leaves out.
    if (aliases.length > 0) {
      aliasClosure = theAliasClosure(rowsOf, aliases.length)
      rowsByRegion.set(aliasClosure.region, aliasClosure.rows)
      omittedFromScope.delete(aliasClosure.region)
      notes.push(...aliasClosure.said)
    }
    // Counted from the whole table rather than from what was read, because the rows this scoping
    // DROPPED are the point: a change whose record_id answers to nothing has no project, so no
    // project's archive can carry it, and a scoped restore therefore cannot bring it back.
    //
    // ASKED OF EVERY REGION WITH A NULLABLE WORKSPACE COLUMN, not of `changes` alone. This sentence
    // was written about `changes` and hard-coded to it, and then `revisions` arrived with the same
    // nullable column for the same reason and got no sentence at all — so a scoped archive could
    // drop a record's whole stored history and read as complete. The condition is read off the
    // schema, so the next table with a nullable workspace is counted the day it is declared.
    for (const region of EXPORTED_REGIONS) {
      const scope = workspaceScopeOf(region)
      if (typeof scope !== 'string') continue
      const homeless = (
        sqlite.prepare(`SELECT count(*) AS n FROM ${region} WHERE ${scope} IS NULL`).get() as { n: number }
      ).n
      if (homeless === 0) continue
      notes.push(
        `${homeless} ${region} row(s) in this database carry no workspace` +
          (aboutARecord(region)
            ? `, because no record answers to their record_id and a ${region} row's project is read off the ` +
              `record it is about`
            : '') +
          `. They are in no project's archive, including this one. The whole-installation export at ` +
          `${exportRoot()} carries them`,
      )
    }
    // THE SAME FACT ONE TABLE ALONG. A row whose project is a fact about another row has no project
    // at all when that row is missing, so it is in no project's archive either. Read from the
    // schema rather than named here, so a table scoped through another one is counted the day it is
    // declared.
    for (const region of EXPORTED_REGIONS) {
      const scope = workspaceScopeOf(region)
      if (scope === null || typeof scope === 'string') continue
      const orphaned = rowsWithNothingToBelongTo(region, scope)
      if (orphaned === 0) continue
      notes.push(
        `${orphaned} ${region} row(s) name a ${scope.table} row that is not there, and a ${region} row's project is ` +
          `read off the ${scope.table} it belongs to — so nobody can say which project they are in and they are in ` +
          `no project's archive, including this one. The whole-installation export at ${exportRoot()} carries them`,
      )
    }
    // THE PLAN IS THE OTHER THING A SCOPED ARCHIVE CANNOT CARRY, and for a better reason: it does
    // not belong to a project at all. Every person-level region is named with the number of rows it
    // holds, from the schema's own list — it was two hard-coded queries, `allocations` and
    // `planning_capacity`, and by the time migrations 0008 and 0009 had run it was reporting two
    // tables out of four while `drafts.md` in the same archive said "Nothing has been drafted".
    const left = [...omittedFromScope].filter(([, n]) => n > 0)
    if (left.length > 0) {
      notes.push(
        `${left.map(([region, n]) => `${n} ${region} row(s)`).join(', ')} are NOT in this archive. ` +
          `${left.map(([region]) => `${region}: ${whyARegionBelongsToNoProject(region)}`).join('; ')}. A ` +
          `project-scoped archive would have to either omit these or claim all of them as this project's. ` +
          `The whole-installation export at ${exportRoot()} carries them`,
      )
    }
  }

  // ------------------------------------------------------------- what this archive says about
  //                                                                records it does not carry
  //
  // TWO SENTENCES THAT ARE ABOUT THE ARCHIVE ITSELF, so they are said for a whole-installation
  // archive as well as for a scoped one. The notes above count rows this archive LEFT OUT. These
  // two count rows it PUT IN that a reader would otherwise be misled by.
  {
    const inThisArchive = new Set<string>()
    for (const row of rowsByRegion.get('records') ?? []) inThisArchive.add(mustBeString(row['id'], 'a records row id'))

    // A ROW ABOUT A RECORD THAT IS NOT HERE. Its page header already says "(no record has that id)",
    // which a person reading one file can see and a person restoring the archive cannot. Measured on
    // 18 August 2026: a project-scoped archive of the project a record had LEFT carried that
    // record's revisions with no `records/` directory at all, and the import accepted it in silence.
    for (const region of EXPORTED_REGIONS) {
      if (!aboutARecord(region)) continue
      let orphans = 0
      const subjects = new Set<string>()
      for (const row of rowsOf(region, ['recordId'])) {
        // A NULL `recordId` IS A ROW ABOUT NO RECORD RATHER THAN ABOUT A MISSING ONE. `plan_lines`
        // carries one for a line of somebody's week that names no record at all, which is a real
        // answer and not a dangling reference, so it is left out of this count instead of read as a
        // string that is not there.
        const recordId = row['recordId']
        if (typeof recordId !== 'string' || inThisArchive.has(recordId)) continue
        orphans += 1
        subjects.add(recordId)
      }
      if (orphans === 0) continue
      notes.push(
        `${orphans} ${region} row(s) in this archive are about ${subjects.size} record(s) this archive does ` +
          `not carry, so restoring it puts rows in the database that no record page can reach. ` +
          (region === 'revisions'
            ? `A revision holds the only stored copy of what a record used to contain, so these are somebody's ` +
              `history with nothing to attach it to. `
            : '') +
          `The usual cause is a record filed in another project: ${
            workspaceId === undefined
              ? 'this is the whole installation, so the record was deleted from the table rather than re-filed'
              : `this archive is only "${workspaceId}"`
          }`,
      )
    }

    // A LEDGER THAT DOES NOT START AT 1, OR THAT SKIPS A NUMBER. `seq` is gapless in the database —
    // `saveRevision` takes max(seq) + 1 under the UNIQUE index — so a gap here was made by the
    // scoping, by a hand edit, or by an export of a corpus whose ledger was already broken. It
    // matters because two published sentences stop being true on a gapped ledger: the revision list
    // says every revision is here, and the refusal for a missing number says they run 1 to N.
    const seqsOf = new Map<string, number[]>()
    for (const row of rowsOf('revisions', ['recordId', 'seq'])) {
      const recordId = mustBeString(row['recordId'], 'revisions.recordId')
      const seq = row['seq']
      if (typeof seq !== 'number') continue
      const seqs = seqsOf.get(recordId)
      if (seqs === undefined) seqsOf.set(recordId, [seq])
      else seqs.push(seq)
    }
    const gapped: string[] = []
    for (const [recordId, seqs] of seqsOf) {
      const sorted = [...seqs].sort((a, b) => a - b)
      if (sorted[0] === 1 && sorted[sorted.length - 1] === sorted.length) continue
      gapped.push(recordId)
    }
    if (gapped.length > 0) {
      notes.push(
        `${gapped.length} record(s) in this archive have a revision ledger that does not run 1, 2, 3 with nothing ` +
          `missing: ${gapped.sort(byCodeUnit).slice(0, 10).join(', ')}${gapped.length > 10 ? ', …' : ''}. A ledger ` +
          `in the database never has a gap, so these numbers were made by leaving rows out. Restored, the record's ` +
          `history begins part-way through and the numbers a reader is given for the missing ones answer nothing`,
      )
    }
  }

  const recordRows = rowsByRegion.get('records') ?? []
  const linkRows = rowsByRegion.get('links') ?? []
  const anchorRows = rowsByRegion.get('reader_anchors') ?? []
  const intentRows = rowsByRegion.get('presentation_intent') ?? []
  const resourceRows = rowsByRegion.get('session_resources') ?? []

  /** Every record's title, so an id in a link or a change row can be shown as the thing it names. */
  const titleOf = new Map<string, string>()
  const kindOf = new Map<string, string>()
  for (const row of recordRows) {
    const id = mustBeString(row['id'], 'a records row id')
    titleOf.set(id, mustBeString(row['title'], `records.title of ${id}`))
    kindOf.set(id, mustBeString(row['kind'], `records.kind of ${id}`))
  }

  /**
   * Every agent by its registry id, so a `provedHolder` that holds an id can be shown by a name.
   *
   * The same rows `participants.md` writes. Kept here rather than read again, so the prose and the
   * registry cannot disagree about who an id names.
   *
   * AND BY EACH OLD ID A PERMANENT ALIAS NAMES. The re-mint keeps every revision and change row, so a
   * row whose key proved a legacy agent still holds its old id, and no agents row has that id after
   * the re-mint. Read through the alias, the heading names the same agent in the same words as before,
   * so a page of history the mirror already holds is written again byte for byte.
   * tests/the-remint-keeps-the-exports-history-pages.test.ts holds that. An alias's old id is never
   * another agent's id, so no row is named by one it is not.
   */
  const agentsById = new Map<string, Row>()
  for (const row of rowsByRegion.get('agents') ?? []) {
    agentsById.set(mustBeString(row['id'], 'an agents row id'), row)
  }
  for (const alias of aliases) {
    const agent = agentsById.get(alias.canonicalId)
    if (agent !== undefined) agentsById.set(alias.aliasId, agent)
  }

  /** Links grouped under the record they are stored on, which is the `from` end. */
  const linksFrom = new Map<string, Row[]>()
  for (const row of linkRows) {
    const from = mustBeString(row['fromId'], 'a links row fromId')
    const list = linksFrom.get(from)
    if (list === undefined) linksFrom.set(from, [row])
    else list.push(row)
  }

  /** Where each file goes as it is made, with what the report says of the files counted on the way. */
  let fileCount = 0
  let bytes = 0
  let recordFiles = 0
  let changeFiles = 0
  const files = {
    push(file: ExportFile): void {
      fileCount += 1
      bytes += Buffer.byteLength(file.text, 'utf8')
      if (file.path.startsWith('records/')) recordFiles += 1
      if (file.path.startsWith('changes/')) changeFiles += 1
      give(file)
    },
  }
  const knownKinds = new Set<string>(RECORD_KINDS)
  let unrecognisedKinds = 0
  /** Origin words this export wrote out that Mole Office cannot read. Carried, and said out loud. */
  const unreadableOrigins = new Set<string>()
  /** How many rows carry no origin at all, which is a question for a person and not a fault. */
  let unstampedRecords = 0

  // ---------------------------------------------------------------- one file per record
  //
  // READ AGAIN ONE ROW AT A TIME, with `data`, which is the column the rows held above leave out.
  for (const row of eachRowOf('records', workspaceId)) {
    const id = mustBeString(row['id'], 'a records row id')
    assertSafeFileName(id, 'a record id')
    const kind = mustBeString(row['kind'], `records.kind of ${id}`)
    const folder = knownKinds.has(kind) ? kind : '_unrecognised'
    if (folder === '_unrecognised') unrecognisedKinds += 1

    const origin = originPhrase(row['origin'])
    if (origin.unreadable !== null) unreadableOrigins.add(origin.unreadable)
    else if (readOrigin(row['origin']) === null) unstampedRecords += 1

    const title = mustBeString(row['title'], `records.title of ${id}`)
    const outgoing = sortBy(
      linksFrom.get(id) ?? [],
      (l) => mustBeString(l['type'], 'links.type'),
      (l) => mustBeString(l['toId'], 'links.toId'),
      (l) => mustBeString(l['id'], 'links.id'),
    )

    const parts: string[] = [
      frontMatter('records', row, REGION_COLUMNS.records),
      '',
      `# ${title}`,
      '',
      identityLine(row, kind),
      '',
      '## What is stored in `data`',
      '',
      jsonBlock('records.data', row['data'] ?? {}),
      '',
      '## Links stored on this record',
      '',
    ]
    if (outgoing.length === 0) {
      // Said in words rather than left blank. An empty section and a section somebody forgot to
      // write look identical, and only one of them is an answer.
      parts.push('No link is stored on this record. Links pointing AT it are stored on the records they')
      parts.push('come from — `grep -rn \'toId: "' + id + '"\' records/` finds every one.')
    } else {
      for (const link of outgoing) {
        const type = mustBeString(link['type'], 'links.type')
        const to = mustBeString(link['toId'], 'links.toId')
        parts.push(`### ${type} → ${titleOf.get(to) ?? '(no record has that id)'}`)
        parts.push('')
        parts.push(fieldsBlock('links', link, REGION_COLUMNS.links))
        parts.push('')
      }
      parts.pop()
    }
    files.push({ path: `records/${folder}/${id}.md`, text: page(parts) })
  }
  if (unrecognisedKinds > 0) {
    notes.push(
      `${unrecognisedKinds} record(s) carry a kind that is not one of RECORD_KINDS; they are under ` +
        `records/_unrecognised/ with their real kind in the front matter`,
    )
  }
  if (unreadableOrigins.size > 0) {
    notes.push(
      `record(s) store an origin that is not one of ${RECORD_ORIGINS.join(' or ')}: ` +
        `${[...unreadableOrigins].sort(byCodeUnit).join(', ')}. The word is exported exactly as stored rather than ` +
        `blanked — something wrote it on purpose — and every reader treats it as unrecorded until somebody says ` +
        `what it meant`,
    )
  }
  if (unstampedRecords > 0) {
    // NOT A FAILURE, AND NOT SILENT EITHER. A row with no stamp is a row nobody has said anything
    // about, which is a real answer; what it must never do is quietly read as part of the project
    // record. Reporting the number is how the archive says how much of it is unanswered.
    notes.push(
      `${unstampedRecords} record(s) carry no origin at all. ${unstampedOriginNote()}. They are exported with ` +
        `\`origin: null\`, which is what an import reads back — never \`authored\``,
    )
  }

  // ---------------------------------------------------------------- the change log, one file per day
  //
  // READ ONE ROW AT A TIME IN THE ORDER OF `at`, and a day's page is made when the next day begins, so no more than
  // one day's rows are held. Every stamp that begins with its day sorts beside the others of that day. A stamp read
  // past a leading space, or with no day, does not, so the first read finds the days that hold one, and their rows
  // are kept back and their pages made at the end. One page per day, as when the log was read whole.
  const changeAt = (row: Row): string => mustBeString(row['at'], `changes.at of ${String(row['id'])}`)
  let changeRows = 0
  let undated = 0
  const keptBack = new Map<string, Row[]>()
  for (const row of eachRowOf('changes', workspaceId, { columns: ['id', 'at'] })) {
    const at = changeAt(row)
    const day = dayOf(at)
    changeRows += 1
    if (day === 'undated') undated += 1
    if (!at.startsWith(day)) keptBack.set(day, [])
  }
  countedOneAtATime.set('changes', changeRows)
  if (undated > 0) {
    notes.push(`${undated} change row(s) carry an "at" that will not parse as a stamp; they are in changes/undated.md`)
  }
  const pageOfDay = (day: string, rows: Row[]): void => {
    const sorted = sortBy(
      rows,
      (r) => mustBeString(r['at'], 'changes.at'),
      (r) => mustBeString(r['id'], 'changes.id'),
    )
    const parts: string[] = [
      `# Change log — ${day === 'undated' ? 'rows whose stamp will not parse' : day}`,
      '',
      `${sorted.length} row${sorted.length === 1 ? '' : 's'}, oldest first. This log is append-only history: it is what`,
      'makes a soft-deleted record recoverable, and an importer should refuse an edited one.',
      '',
    ]
    for (const row of sorted) {
      const at = mustBeString(row['at'], 'changes.at')
      const recordId = mustBeString(row['recordId'], 'changes.recordId')
      const clock = day === 'undated' ? at : at.slice(11) || at
      parts.push(
        `### ${clock} · ${String(row['op'])} · ${String(row['actorType'])}:${String(row['actorId'])}` +
          `${provedHolderWords(row['provedHolder'], { type: String(row['actorType']), id: String(row['actorId']) }, agentsById)} · ` +
          `${titleOf.get(recordId) ?? '(no record has that id)'}`,
      )
      parts.push('')
      parts.push(fieldsBlock('changes', row, REGION_COLUMNS.changes))
      parts.push('')
    }
    parts.pop()
    files.push({ path: `changes/${day}.md`, text: page(parts) })
  }
  {
    let day: string | null = null
    let rows: Row[] = []
    for (const row of eachRowOf('changes', workspaceId, { orderBy: ['at'] })) {
      const itsDay = dayOf(changeAt(row))
      const held = keptBack.get(itsDay)
      if (held !== undefined) {
        held.push(row)
        continue
      }
      if (itsDay !== day) {
        if (day !== null) pageOfDay(day, rows)
        day = itsDay
        rows = []
      }
      rows.push(row)
    }
    if (day !== null) pageOfDay(day, rows)
    for (const [heldDay, heldRows] of keptBack) pageOfDay(heldDay, heldRows)
  }

  // ---------------------------------------------------------------- the revision ledger
  //
  // ONE FILE PER REVISION, under the record it is of, because a revision carries a JSON document —
  // the `data` the record held — and the importer allows one such row per file. The same rule that
  // gives a record and an agent run a file each.
  //
  // GROUPED BY RECORD AND NAMED BY `seq` rather than by the revision's own id, so a person reading
  // the archive can follow one record's history in order without an index. The id is in the front
  // matter and is still what the importer keys on; a file name is a reading aid.
  //
  // THIS IS THE REGION AN ARCHIVE CAN LEAST AFFORD TO LOSE. Every other table can be read from
  // something else if it has to be. A revision holds the only stored copy of what a record used to
  // contain, because `changes` says what changed and never what it was.
  //
  // READ ONE ROW AT A TIME, in no order: each revision is a file of its own, so the order changes no file.
  {
    let revisionRows = 0
    for (const row of eachRowOf('revisions', workspaceId)) {
      revisionRows += 1
      const id = mustBeString(row['id'], 'a revisions row id')
      const recordId = mustBeString(row['recordId'], `revisions.recordId of ${id}`)
      assertSafeFileName(recordId, 'a record id on a revision')
      const seq = row['seq']
      if (typeof seq !== 'number' || !Number.isInteger(seq) || seq < 1) {
        throw new ExportError(
          `the revision ${id} carries seq ${String(seq)}, and a revision number is a whole number counting from 1. ` +
            `A ledger with a seq that is not one cannot say which revision came before which.`,
        )
      }
      const op = String(row['op'])
      const parts: string[] = [
        frontMatter('revisions', row, REGION_COLUMNS.revisions),
        '',
        `# Revision ${seq} of ${titleOf.get(recordId) ?? '(no record has that id)'}`,
        '',
        `What record ${recordId} held at ${String(row['at'])}, after a write of kind \`${op}\` by ` +
          `${String(row['actorType'])}:${String(row['actorId'])}` +
          `${provedHolderWords(row['provedHolder'], { type: String(row['actorType']), id: String(row['actorId']) }, agentsById)}.`,
        '',
        op === 'baseline'
          ? 'THIS IS A BASELINE, AND IT IS NOT THE RECORD AS IT WAS CREATED. A migration wrote it, holding what\n' +
            'the record contained on the day the revision ledger was built. What it held before that was never\n' +
            'stored anywhere, so there is nothing earlier to compare with. Its `note` says the same thing.'
          : 'A revision stores CONTENT, which is the thing the change log never kept: a `create` row in\n' +
            '`changes/` holds the record\'s title and nothing else. `contentHash` is the same token a read of the\n' +
            'record hands back as `version`, so it is both this revision\'s name and the compare-and-set token a\n' +
            'write built from it would send.',
        '',
        `\`deletedAt\` is the record's soft-delete stamp AS IT WAS at this revision${
          row['deletedAt'] === null ? ', and it was not deleted.' : ', and it was deleted at that moment.'
        }`,
        '',
        '## What the record held in `data`',
        '',
        ...(row['parts'] === null || row['parts'] === undefined
          ? []
          : [
              'AS STORED. Each place `parts` names holds the sha256 of the value\'s JSON instead of the value, and the',
              'revision of this record it names holds the value whole, on its own page. `contentHash` is of the whole data.',
              '',
            ]),
        jsonBlock('revisions.data', row['data'] ?? {}),
      ]
      files.push({ path: `revisions/${recordId}/${String(seq)}.md`, text: page(parts) })
    }
    countedOneAtATime.set('revisions', revisionRows)
  }

  // ---------------------------------------------------------------- presentation intent
  {
    const sorted = sortBy(
      intentRows,
      (r) => mustBeString(r['workspaceId'], 'presentation_intent.workspaceId'),
      (r) => mustBeString(r['scope'], 'presentation_intent.scope'),
      (r) => mustBeString(r['target'], 'presentation_intent.target'),
    )
    const parts: string[] = [
      '# Presentation intent',
      '',
      'How somebody wants a structure PRESENTED: lanes, order, roles, emphasis. Never geometry, never',
      'colour, never CSS — those are derived on every draw and are stored nowhere. An importer must run',
      '`checkScopeIntent` / `checkNodeIntent` from src/shared/presentation.ts over every row below, because',
      'a file a person edited by hand is exactly where an `x:` will appear, and the refusal is the feature.',
      '',
    ]
    if (sorted.length === 0) {
      parts.push('No presentation intent is stored. Absent is the common case and it is an answer, not a gap:')
      parts.push('a drawing with no stored intent is arranged entirely by what the records and links say.')
    } else {
      for (const row of sorted) {
        const target = mustBeString(row['target'], 'presentation_intent.target')
        const named = target === '(scope)' ? "the scope's own settings" : (titleOf.get(target) ?? '(no record has that id)')
        parts.push(`### ${String(row['scope'])} · ${target} — ${named}`)
        parts.push('')
        parts.push(fieldsBlock('presentation_intent', row, REGION_COLUMNS.presentation_intent))
        parts.push('')
      }
      parts.pop()
      const retired = sorted.filter((r) => mustBeString(r['target'], 'target').startsWith('step:')).length
      if (retired > 0) {
        notes.push(
          `${retired} presentation_intent row(s) still target a "step:" id, which was retired when a block became a ` +
            `record; they are exported unchanged rather than rewritten here`,
        )
      }
    }
    files.push({ path: 'presentation.md', text: page(parts) })
  }

  // ---------------------------------------------------------------- reader anchors
  {
    const sorted = sortBy(
      anchorRows,
      (r) => mustBeString(r['workspaceId'], 'reader_anchors.workspaceId'),
      (r) => mustBeString(r['reader'], 'reader_anchors.reader'),
    )
    const parts: string[] = [
      '# Reader anchors',
      '',
      'When each reader last looked, and at what. One row per PERSON, not per browser, which is what lets',
      'the desk and the phone move the same bookmark for each other.',
      '',
      '`lastChangeId` is a foreign key into `changes`, so an importer must write records, links and changes',
      'before it writes these. `null` there is a real answer and is not the same as having no row at all:',
      'no row means this reader has never looked, `null` means they looked and there was nothing to see.',
      '',
    ]
    if (sorted.length === 0) {
      parts.push('Nobody has an anchor. No reader has ever marked how far they had got.')
    } else {
      for (const row of sorted) {
        parts.push(`### ${String(row['reader'])}`)
        parts.push('')
        parts.push(fieldsBlock('reader_anchors', row, REGION_COLUMNS.reader_anchors))
        parts.push('')
      }
      parts.pop()
    }
    files.push({ path: 'anchors.md', text: page(parts) })
  }

  // ---------------------------------------------------------------- the resource ledger
  {
    const sorted = sortBy(
      resourceRows,
      (r) => mustBeString(r['registeredAt'], 'session_resources.registeredAt'),
      (r) => mustBeString(r['id'], 'session_resources.id'),
    )
    const held = sorted.filter((r) => r['releasedAt'] === null).length
    const parts: string[] = [
      '# The “Running on this machine” list',
      '',
      'What a session started, and whether anybody shut it down. THIS IS HISTORY, NOT A READING OF THE',
      'MACHINE. Two columns are deliberately absent — `pgid` and `osStartedAt` — because a process group and',
      'a start time are facts about one machine at one moment, and restoring a three-week-old one would',
      'manufacture exactly the stale state this project once acted on and lost an afternoon to.',
      '',
      'So a row below says what was taken and whether it was given back. Whether anything is alive now is',
      'answered by scanning the machine, never by reading this.',
      '',
    ]
    if (sorted.length === 0) {
      parts.push('No session has registered anything. That is not the same as nothing running: a process nobody')
      parts.push('wrote down has no row here to be an orphan, which is what the unclaimed sweep is for.')
    } else {
      for (const row of sorted) {
        const releasedAt = row['releasedAt']
        parts.push(
          `### ${String(row['type'])} ${String(row['key'])} — ` +
            (releasedAt === null ? 'still shown as held at export time' : `released ${String(releasedAt)}`),
        )
        parts.push('')
        parts.push(fieldsBlock('session_resources', row, REGION_COLUMNS.session_resources))
        parts.push('')
      }
      parts.pop()
    }
    if (held > 0) {
      notes.push(
        `${held} ledger row(s) were still shown as held when this export was taken. After a restore they name a ` +
          `resource on a machine that may no longer exist, and their pgid and osStartedAt are gone by design — ` +
          `scan the machine rather than acting on them`,
      )
    }
    files.push({ path: 'resources.md', text: page(parts) })
  }

  // ---------------------------------------------------------------- what an agent read in a folder
  {
    const sorted = sortBy(
      rowsByRegion.get('folder_readings') ?? [],
      (r) => mustBeString(r['createdAt'], 'folder_readings.createdAt'),
      (r) => mustBeString(r['id'], 'folder_readings.id'),
    )
    const parts: string[] = [
      '# What an agent read in a folder',
      '',
      "An agent read somebody else's folder and wrote down what it would file. NONE OF IT IS A RECORD until a",
      'person accepts a piece, one piece at a time. A row here holds both halves of that: what the agent',
      'proposed, and what the person decided about each piece.',
      '',
      'THE DECISIONS ARE WRITTEN DOWN NOWHERE ELSE. An accepted piece names the record it became, and that',
      'record can be found; a rejected one leaves no trace anywhere but here. So a restore that brought the',
      'pieces back without their states would put a person in front of choices they had already made.',
      '',
      '`pieces` is carried as the stored text, exactly as it went in.',
      '',
      // ONE FILE PER READING, because a reading carries its pieces as a JSON document and the importer allows one
      // such row per file. Until wave 13s round 155 every reading was written here, so an office with two wrote an
      // archive its own import refused. This page is still written, as a list, so that a mirror an older export
      // left holding a reading's blocks has them replaced and the reading is not read twice.
      'Each reading is in a file of its own under `folder-readings/`, named by its id.',
      '',
    ]
    if (sorted.length === 0) {
      parts.push('No agent has read a folder into this installation. That is not the same as nothing having been')
      parts.push('imported: an archive restored from another Mole Office arrives through the import, not through here.')
    }
    for (const row of sorted) {
      const id = mustBeString(row['id'], 'folder_readings.id')
      assertSafeFileName(id, 'a folder reading id')
      const heading = `${String(row['folder'])} — read by ${String(row['readBy'])} on ${String(row['createdAt'])}`
      parts.push(`- \`folder-readings/${id}.md\` — ${heading}`)
      files.push({
        path: `folder-readings/${id}.md`,
        text: page([
          `# ${heading}`,
          '',
          'What an agent proposed from this folder, and what a person decided about each piece. `folder-readings.md`',
          'says what a reading is and why the decisions are kept here.',
          '',
          fieldsBlock('folder_readings', row, REGION_COLUMNS.folder_readings),
          '',
          jsonBlock('folder_readings.pieces', row['pieces'] ?? []),
        ]),
      })
    }
    files.push({ path: 'folder-readings.md', text: page(parts) })
  }

  // ---------------------------------------------------------------- the reviews
  {
    const sorted = sortBy(
      rowsByRegion.get('reviews') ?? [],
      (r) => mustBeString(r['startedAt'], 'reviews.startedAt'),
      (r) => mustBeString(r['id'], 'reviews.id'),
    )
    const collecting = sorted.filter((r) => r['frozen'] === null).length
    const parts: string[] = [
      '# The reviews',
      '',
      'Somebody started collecting remarks, from somewhere, and these say where and when. WHAT COUNTS AS INSIDE',
      'A REVIEW IS NOT STORED and is not here: it is worked out from `entry` — where the person was standing —',
      'and from the containment Mole Office holds, every time a review is read. A stored copy of that rule would be a',
      'second answer, free to disagree with the entry it came from.',
      '',
      '`frozen` IS THE ONE FACT NOTHING ELSE CAN RESTATE. It is what was inside at the moment somebody finished',
      'collecting, and after that moment the relationships it was worked out from go on changing. NULL there',
      'means nobody has finished collecting, which is a different fact from a review that finished and held',
      'nothing — that one stores an empty list.',
      '',
      'The remarks themselves are NOT here. Each is a record of kind `annotation`, filed under `records/` like',
      'every other record, and `frozen` names them by id. A review whose remarks were written before remarks',
      'were their own thing names the conversation they are still in, in `fromThreadId`.',
      '',
      'A REVIEW THAT WAS SENT NAMES WHERE IT WENT. `sentThreadId` is the one conversation its comments went out',
      'in — the comments are messages there, and the runs of that conversation are one per agent they went to —',
      'and `sentAt` is when. Both are null until somebody sends it, and a review that handed over some of its',
      'comments and held one back is not sent yet, so both stay null while the conversation already exists.',
      '',
    ]
    if (sorted.length === 0) {
      parts.push('Nobody has started a review. That is not the same as nobody having left a remark: a remark is a')
      parts.push('record and stands on its own, and a review is somebody collecting several of them.')
    } else {
      for (const row of sorted) {
        parts.push(
          `### ${String(row['id'])} — ${String(row['state'])}, started ${String(row['startedAt'])} by ` +
            String(row['startedBy']),
        )
        parts.push('')
        parts.push(fieldsBlock('reviews', row, REGION_COLUMNS.reviews))
        parts.push('')
      }
      parts.pop()
    }
    if (collecting > 0) {
      notes.push(
        `${collecting} review(s) were still collecting when this export was taken, so what is inside each of them ` +
          `is still a live question and a restore of this archive will work it out again from today's ` +
          `relationships. The ones that had finished collecting carry the membership they had at that moment`,
      )
    }
    files.push({ path: 'reviews.md', text: page(parts) })
  }

  // ---------------------------------------------------------------- the plan
  {
    const allocationRows = rowsByRegion.get('allocations') ?? []
    const capacityRows = rowsByRegion.get('planning_capacity') ?? []
    const sorted = sortBy(
      allocationRows,
      (r) => mustBeString(r['period'], 'allocations.period'),
      (r) => mustBeString(r['id'], 'allocations.id'),
    )
    const sortedCapacity = sortBy(
      capacityRows,
      (r) => mustBeString(r['horizon'], 'planning_capacity.horizon'),
      (r) => mustBeString(r['period'], 'planning_capacity.period'),
    )
    const parts: string[] = [
      '# The plan',
      '',
      'When this person committed real time to work that already exists. This page holds `allocations` and',
      `\`planning_capacity\`, two of the ${PERSON_LEVEL_REGIONS.length} tables in Mole Office with NO \`workspaceId\`:`,
      `${PERSON_LEVEL_REGIONS.map((region) => `\`${region}\``).join(', ')}.`,
      '',
      'THOSE TABLES ARE NOT ALL THE PLAN, and the list above is read from the schema rather than typed, so it',
      'grows. The planning ones are here because a plan is one person\'s overlay across work that belongs to',
      'projects, so an allocation belongs to none of them and one week may hold work from several at once. The',
      'rest are in `participants.md` and `pictures.md` and belong to no project for their own reason, which',
      'each of those pages gives. That is why a PROJECT-SCOPED archive carries none of them, and why every one',
      'of those pages says so where its rows would be. The count was typed here as TWO and stayed TWO for as',
      'long as there were four, which is why it is read now.',
      '',
      '`recordId` names work that stays in its own project. Nothing here moves it or copies it, and an',
      'importer must write records before these rows so that every id names something.',
      '',
      'TWO DIFFERENT QUANTITIES, and confusing them is the thing this format is most careful about.',
      '`effort_hours` on the record is how big the work is in total; `plannedHours` here is how much time this',
      'one period gives it. A twenty-hour task with eight hours in a week and three on a Monday is not',
      'thirty-one hours of anything. `plannedHours: null` means somebody committed to the work in this period',
      'WITHOUT saying how long for — which is a different fact from zero, and from the whole of the work — so',
      'the line is written out as null rather than left off.',
      '',
      'An allocation whose `state` is `done` means THAT SLICE OF TIME was completed. It says nothing about',
      'whether the work is finished; the work carries its own state and only a person changes it.',
      '',
    ]
    if (sorted.length === 0) {
      parts.push(
        absenceLine(
          'allocations',
          omittedFromScope,
          'Nothing is planned. No time has been committed to anything, which is not the same as a plan\nwith nothing left in it.',
        ),
      )
    } else {
      for (const row of sorted) {
        const hours = row['plannedHours']
        parts.push(
          `### ${String(row['period'])} — ${String(row['recordId'])} — ` +
            (hours === null ? 'no hours stated' : `${String(hours)}h`),
        )
        parts.push('')
        parts.push(fieldsBlock('allocations', row, REGION_COLUMNS.allocations))
        parts.push('')
      }
      parts.pop()
    }
    parts.push('')
    parts.push('## How many hours each period holds')
    parts.push('')
    parts.push('NO ROW IS NOT ZERO. A period nobody has given a capacity to has no answer to whether it fits,')
    parts.push('and a restored archive that invented a working week would report a plan as fitting when nobody')
    parts.push('had looked.')
    parts.push('')
    if (sortedCapacity.length === 0) {
      parts.push(absenceLine('planning_capacity', omittedFromScope, 'Nobody has said how many hours any period holds.'))
    } else {
      for (const row of sortedCapacity) {
        parts.push(`### ${String(row['horizon'])} ${String(row['period'])} — ${String(row['hours'])}h`)
        parts.push('')
        parts.push(fieldsBlock('planning_capacity', row, REGION_COLUMNS.planning_capacity))
        parts.push('')
      }
      parts.pop()
    }
    files.push({ path: 'plan.md', text: page(parts) })
  }

  // ---------------------------------------------------------------- the plans, and their lines
  {
    const planRows = sortBy(rowsByRegion.get('plans') ?? [], (r) => mustBeString(r['createdAt'], 'plans.createdAt'))
    const lineRows = rowsByRegion.get('plan_lines') ?? []
    const revisionRows = rowsByRegion.get('plan_line_revisions') ?? []
    const linesOfPlan = new Map<string, Row[]>()
    for (const row of lineRows) {
      const planId = mustBeString(row['planId'], 'plan_lines.planId')
      const list = linesOfPlan.get(planId)
      if (list === undefined) linesOfPlan.set(planId, [row])
      else list.push(row)
    }
    // One line's reasons, oldest first, gathered by the plan the line belongs to. `seq` is compared
    // as a number because it is one, and `id` breaks a tie so the same database writes the same
    // bytes on every export.
    const revisionsOfPlan = new Map<string, Row[]>()
    for (const row of revisionRows) {
      const planId = mustBeString(row['planId'], 'plan_line_revisions.planId')
      const list = revisionsOfPlan.get(planId)
      if (list === undefined) revisionsOfPlan.set(planId, [row])
      else list.push(row)
    }
    for (const list of revisionsOfPlan.values()) {
      list.sort((a, b) => {
        const line = byCodeUnit(
          mustBeString(a['lineId'], 'plan_line_revisions.lineId'),
          mustBeString(b['lineId'], 'plan_line_revisions.lineId'),
        )
        if (line !== 0) return line
        const seq = Number(a['seq']) - Number(b['seq'])
        if (seq !== 0) return seq
        return byCodeUnit(mustBeString(a['id'], 'plan_line_revisions.id'), mustBeString(b['id'], 'plan_line_revisions.id'))
      })
    }
    const parts: string[] = [
      '# Plans',
      '',
      'Documents somebody wrote. Planning is writing: prose, headings, bullets, tick boxes and tables, and',
      'NONE of it is project truth. Nothing here was parsed for meaning and nothing here became a record',
      'because Mole Office read it.',
      '',
      'A line crosses into the project only when a person presses something. `recordId` on a line is the record',
      'somebody filed that line as. THE WORDS AND THE TITLE ARE TWO SEPARATE FACTS: the line seeded the title',
      'once and nothing has kept them equal since, so where they differ both are true and both are carried.',
      '',
      'Like the rest of the planning layer these carry no `workspaceId` — a plan spans projects — and naming a',
      'record grants nothing.',
      '',
      'THE TEXT IS VERBATIM, one row per line of the document, blank lines included. `position` is the order,',
      'as a real number, so a line inserted between two others took a midpoint.',
      '',
      'BESIDE THE LINES ARE THE REASONS THEY CHANGED, added by migration 0170. Criterion P3: adding,',
      'reordering or dropping a line keeps one `plan_line_revisions` row with the reason the writer gave,',
      'in their own words. `op` is `added`, `reordered` or `dropped`; `seq` is per line and reads oldest',
      'first. A line that predates the table has no row, and nothing here invents one.',
      '',
    ]
    if (planRows.length === 0) {
      parts.push(absenceLine('plans', omittedFromScope, 'Nothing has been planned.'))
      // Lines belong to a plan, so a database with no plans has no lines either. Saying it here
      // keeps the region's absence in the archive rather than only in the manifest's zero.
      if (lineRows.length === 0) {
        parts.push('')
        parts.push(absenceLine('plan_lines', omittedFromScope, 'So there are no lines either.'))
      }
      if (revisionRows.length === 0) {
        parts.push('')
        parts.push(
          absenceLine('plan_line_revisions', omittedFromScope, 'So no line has a reason on record either.'),
        )
      }
    } else {
      for (const row of planRows) {
        parts.push(`### ${String(row['title'])}`)
        parts.push('')
        parts.push(fieldsBlock('plans', row, REGION_COLUMNS.plans))
        parts.push('')
        // In the order the document reads, and by id where two lines somehow share a position, so
        // the same database always writes the same file. A number is compared as a number here: a
        // position of 1.5 sorts between 1 and 2, which string comparison would not do.
        const lines = [...(linesOfPlan.get(mustBeString(row['id'], 'plans.id')) ?? [])].sort((a, b) => {
          const left = Number(a['position'])
          const right = Number(b['position'])
          if (left !== right) return left - right
          return byCodeUnit(mustBeString(a['id'], 'plan_lines.id'), mustBeString(b['id'], 'plan_lines.id'))
        })
        for (const line of lines) {
          parts.push(fieldsBlock('plan_lines', line, REGION_COLUMNS.plan_lines))
          parts.push('')
        }
        // ONE LINE'S REASONS, oldest first, by the same `seq` the read-back walks. Written per plan
        // so a reader meets each reason beside the line it is about.
        const lineIds = new Set(lines.map((line) => mustBeString(line['id'], 'plan_lines.id')))
        const revisions = revisionsOfPlan.get(mustBeString(row['id'], 'plans.id')) ?? []
        for (const revision of revisions) {
          if (!lineIds.has(mustBeString(revision['lineId'], 'plan_line_revisions.lineId'))) continue
          parts.push(fieldsBlock('plan_line_revisions', revision, REGION_COLUMNS.plan_line_revisions))
          parts.push('')
        }
      }
      parts.pop()
    }
    files.push({ path: 'plans.md', text: page(parts) })
  }

  // ---------------------------------------------------------------- the counters, and their rows
  {
    // WHAT THIS CARRIES THAT NOTHING ELSE DOES. A counter's own record says what it counts and what
    // makes it fire, and it is exported with every other record. Its COUNT is not on it: the count
    // and the amount are added up from these rows since the last firing, so an archive without them
    // would restore a counter that had never counted anything while the record itself looked whole.
    // Each row also holds something that exists nowhere else — the caller's own reason for an
    // addition, what a firing's action answered, and that a firing was held back and why.
    //
    // ONE HEADING PER COUNTER, oldest row first, because a ledger read newest-first in a file is a
    // ledger somebody has to read backwards. A counter with no rows says so, rather than appearing
    // as a heading with nothing under it.
    const rows = rowsByRegion.get('counter_rows') ?? []
    const byCounter = new Map<string, Row[]>()
    for (const row of rows) {
      const counterId = mustBeString(row['counterId'], 'counter_rows.counterId')
      const list = byCounter.get(counterId)
      if (list === undefined) byCounter.set(counterId, [row])
      else list.push(row)
    }
    const counterTitles = new Map(
      (rowsByRegion.get('records') ?? [])
        .filter((record) => record['kind'] === 'counter')
        .map((record) => [mustBeString(record['id'], 'records.id'), mustBeString(record['title'], 'records.title')]),
    )
    const parts: string[] = [
      '# Counters',
      '',
      'Every addition, firing and held-back firing of every counter in this archive, one block each. The counters',
      'themselves are records and are in the records region with everything else; what is here is what they counted.',
      '',
      'THE COUNT IS NOT STORED ANYWHERE. A counter\'s count and amount are added up from its rows since its last',
      'firing, every time they are read, so these rows ARE the count. `what` is `addition`, `firing` or `held back`.',
      'On an addition, `count` and `amount` are what it added and `because` is the caller\'s own sentence or the',
      'words of the office event that added. On a firing they are what was reset, `which_trigger` is the position of',
      'the trigger that held, and `answer` is what the action said — the message ids, the task id, or what the job',
      'runner reported. On a held-back row they are what the counter stood at when the firing was held back, which is',
      'not what it stands at now, and `because` says why the limit held it.',
      '',
      '`by` is who added, as `<kind>:<id>`, and it is empty on a row the office wrote itself. `event_kind`,',
      '`event_id` and `event_at` name the office event that added, and are empty on an addition somebody made by',
      'hand. `at` is when the row was written and `event_at` is when the event happened, which are different',
      'moments: the counters read the office events once a minute. `at_instant` is the moment of `at` with its offset,',
      'so the two 01:30s of the night the clocks go back are told apart; it is empty on a row written before migration 0299.',
      '',
    ]
    if (rows.length === 0) {
      parts.push(absenceLine('counter_rows', omittedFromScope, 'No counter has counted anything.'))
    } else {
      for (const counterId of [...byCounter.keys()].sort(byCodeUnit)) {
        const title = counterTitles.get(counterId)
        parts.push(`### ${counterId}${title === undefined ? '' : ` — ${title}`}`)
        parts.push('')
        const ledger = [...(byCounter.get(counterId) ?? [])].sort((a, b) => Number(a['seq']) - Number(b['seq']))
        for (const row of ledger) {
          parts.push(fieldsBlock('counter_rows', row, REGION_COLUMNS.counter_rows))
          parts.push('')
        }
      }
      parts.pop()
    }
    files.push({ path: 'counters.md', text: page(parts) })
  }

  // ---------------------------------------------------------------- what somebody wrote about time
  {
    const rows = sortBy(
      rowsByRegion.get('planning_intents') ?? [],
      (r) => mustBeString(r['createdAt'], 'planning_intents.createdAt'),
      (r) => mustBeString(r['id'], 'planning_intents.id'),
    )
    const parts: string[] = [
      '# What somebody wrote about time',
      '',
      'The words a person wrote about when they would do something, kept exactly as they typed them. `said` is',
      'verbatim: nothing trimmed it, nothing repaired it, and nothing parsed it away.',
      '',
      'BESIDE THE WORDS IS WHAT MOLE OFFICE MADE OF THEM, and it is often nothing. `horizon`, `period` and `hours`',
      'are what could be read reliably, and they are null when nothing could be. "Tuesday afternoon" has a',
      'defensible reading and "sometime next week" does not, so the second is stored with the reading left',
      'empty rather than guessed. Null here means nobody could tell, which is a different fact from zero.',
      '',
      'ONLY A COMMITTED INTENT IS IN ANY TOTAL. `state` is one of three: `kept` means the words are stored and',
      'nothing was read from them, `offered` means a reading was made and is waiting for a person, and',
      '`committed` means it became an allocation. A kept or offered row adds nothing to a week and uses no',
      'capacity. The hours of a committed one are in `allocations` and are not repeated here.',
      '',
      '`recordId` and `planLineId` are both optional, and an intent may have neither. Somebody may write time',
      'on a plan line before that line is filed as work, and the words are worth keeping either way.',
      '',
      'Like the rest of the planning layer these carry no `workspaceId` — a week of intentions spans projects.',
      '',
    ]
    if (rows.length === 0) {
      parts.push(
        absenceLine(
          'planning_intents',
          omittedFromScope,
          'Nobody has written anything about time here. That is not the same as nothing being planned:\nhours given straight to a week leave no words behind.',
        ),
      )
    } else {
      for (const row of rows) {
        // THE HEADING IS THE ID AND THE READING, AND NOT THE WORDS. `said` is whatever a person
        // typed, so it may hold newlines and it may hold three backticks. A heading built from it
        // could start a fence in the middle of this page, and the importer reads fences. The words
        // are in the block below, JSON-encoded on one line, which is safe and is also the copy that
        // counts.
        const period = row['period']
        parts.push(`### ${String(row['id'])} — ${period === null ? 'no period was read from the words' : String(period)}`)
        parts.push('')
        parts.push(fieldsBlock('planning_intents', row, REGION_COLUMNS.planning_intents))
        parts.push('')
      }
      parts.pop()
    }
    files.push({ path: 'intents.md', text: page(parts) })
  }

  // ---------------------------------------------------------------- what comes round again
  {
    const rows = sortBy(rowsByRegion.get('planning_recurrences') ?? [], (r) =>
      mustBeString(r['id'], 'planning_recurrences.id'),
    )
    const parts: string[] = [
      '# Recurring work',
      '',
      'Work that comes round again: daily, weekly, or on chosen weekdays. The smallest thing that covers a',
      'routine — there is no timezone rule, no exception list and no end date, because none has been needed.',
      '',
      'A RECURRENCE IS NOT AN OCCURRENCE. A row here says the work comes round; the occurrences are ordinary',
      'allocations in the plan. So completing one occurrence completes that allocation and nothing else, which',
      'is what stops a daily routine being marked finished for ever the first time somebody does it.',
      '',
      '`recordId` names work that stays in its own project; these rows carry no `workspaceId` for the same',
      'reason the rest of the planning layer does not.',
      '',
    ]
    if (rows.length === 0) parts.push(absenceLine('planning_recurrences', omittedFromScope, 'Nothing recurs.'))
    else {
      for (const row of rows) {
        parts.push(`### ${String(row['every'])}${row['days'] === null ? '' : ` (${String(row['days'])})`}`)
        parts.push('')
        parts.push(fieldsBlock('planning_recurrences', row, REGION_COLUMNS.planning_recurrences))
        parts.push('')
      }
      parts.pop()
    }
    files.push({ path: 'recurring.md', text: page(parts) })
  }

  // ---------------------------------------------------------------- when somebody means to work
  {
    const rows = sortBy(
      rowsByRegion.get('work_windows') ?? [],
      (r) => mustBeString(r['startsOn'], 'work_windows.startsOn'),
      (r) => mustBeString(r['id'], 'work_windows.id'),
    )
    const parts: string[] = [
      '# When somebody means to work on something',
      '',
      'A span of days a person placed a piece of work on. `startsOn` and `endsOn` are both `YYYY-MM-DD` and',
      'BOTH DAYS ARE INCLUDED, so 2026-08-20 to 2026-08-26 is seven days. A window may cross a week boundary,',
      'which is why it is two columns where an allocation deliberately stores one period key.',
      '',
      'A WINDOW HOLDS NO HOURS AND IS IN NO TOTAL. It says when somebody intends to work on this, not that the',
      'work fills those days. The hours are in `allocations` and are a different fact; the size of the work is',
      "`effort_hours` on the record and is a third. An importer that added a window's days into a week would be",
      'inventing time nobody committed.',
      '',
      '`state` is `planned`, `done` or `dropped`. `done` completes THIS SPAN, exactly as an allocation\'s `done`',
      'completes that slice of time; the work carries its own state and only a person changes it. `dropped` is a',
      'span that did not happen, which is not the same as a span nobody ever planned.',
      '',
      '`note` is what somebody needs to know when they come back to the block, and it is carried verbatim. Null',
      'means nobody wrote one, which is the ordinary case and is not an empty note.',
      '',
      '`recordId` names work that stays in its own project. These rows carry no `workspaceId` for the same',
      "reason the rest of the planning layer does not: a person's week holds work from every project.",
      '',
    ]
    if (rows.length === 0) {
      parts.push(
        absenceLine(
          'work_windows',
          omittedFromScope,
          'Nothing has been placed on a day. That is not the same as nothing being planned: hours can be\ngiven to a week without ever saying which days they fall on.',
        ),
      )
    } else {
      for (const row of rows) {
        const from = String(row['startsOn'])
        const to = String(row['endsOn'])
        parts.push(`### ${from === to ? from : `${from} to ${to}`} — ${String(row['recordId'])}`)
        parts.push('')
        parts.push(fieldsBlock('work_windows', row, REGION_COLUMNS.work_windows))
        parts.push('')
      }
      parts.pop()
    }
    files.push({ path: 'windows.md', text: page(parts) })
  }

  // ---------------------------------------------------------------- talking to an agent
  //
  // ONE PAGE PER CONVERSATION, WITH WHAT WAS SAID IN IT, and one page per run. A message is only
  // meaningful with the conversation it was said in — the same reason a plan's lines are written
  // inside the plan's page — and a run carries two documents, so it has to be a page of its own:
  // the importer pairs a JSON block with the row above it in the SAME FILE and refuses a file
  // describing two such rows.
  {
    const threadRows = sortBy(
      rowsByRegion.get('agent_threads') ?? [],
      (r) => mustBeString(r['createdAt'], 'agent_threads.createdAt'),
      (r) => mustBeString(r['id'], 'agent_threads.id'),
    )
    const messageRows = rowsByRegion.get('agent_messages') ?? []
    const runRows = rowsByRegion.get('agent_runs') ?? []

    const threadById = new Map<string, Row>()
    for (const row of threadRows) threadById.set(mustBeString(row['id'], 'agent_threads.id'), row)

    const messagesOfThread = new Map<string, Row[]>()
    for (const row of messageRows) {
      const threadId = mustBeString(row['threadId'], 'agent_messages.threadId')
      const list = messagesOfThread.get(threadId)
      if (list === undefined) messagesOfThread.set(threadId, [row])
      else list.push(row)
    }

    const runsOfThread = new Map<string, Row[]>()
    for (const row of runRows) {
      const threadId = mustBeString(row['threadId'], 'agent_runs.threadId')
      const list = runsOfThread.get(threadId)
      if (list === undefined) runsOfThread.set(threadId, [row])
      else list.push(row)
    }

    /** In the order the conversation reads. A position is a number, so it is compared as one. */
    const inOrder = (rows: readonly Row[]): Row[] =>
      [...rows].sort((a, b) => {
        const left = Number(a['position'])
        const right = Number(b['position'])
        if (left !== right) return left - right
        return byCodeUnit(mustBeString(a['id'], 'agent_messages.id'), mustBeString(b['id'], 'agent_messages.id'))
      })

    /** Who a comment was addressed to, in words, without opening anything else. */
    const addressedTo = (row: Row): string => {
      const kind = row['recipientKind']
      if (kind === null) return 'nobody in particular'
      if (kind === 'new') return 'a new agent, on purpose'
      if (kind === 'unresolved') return 'nobody — the words named more than one agent, or none'
      const id = row['recipientSessionId']
      if (typeof id !== 'string' || id === '') return 'an agent this row does not name'
      return `the run "${titleOf.get(id) ?? '(no record has that id)'}", ${id}`
    }

    for (const thread of threadRows) {
      const id = mustBeString(thread['id'], 'agent_threads.id')
      assertSafeFileName(id, 'an agent thread id')
      const title = mustBeString(thread['title'], `agent_threads.title of ${id}`)
      const said = inOrder(messagesOfThread.get(id) ?? [])
      const runs = sortBy(
        runsOfThread.get(id) ?? [],
        (r) => mustBeString(r['createdAt'], 'agent_runs.createdAt'),
        (r) => mustBeString(r['id'], 'agent_runs.id'),
      )
      const parts: string[] = [
        frontMatter('agent_threads', thread, REGION_COLUMNS.agent_threads),
        '',
        `# ${title}`,
        '',
        `A conversation with an agent about the project \`${String(thread['workspaceId'])}\`, started ` +
          `${String(thread['createdAt'])} by ${String(thread['createdBy'])}.`,
        '',
        '`mode` says WHEN comments are sent, not what they may say: a `direct` conversation sends each one as it is',
        'written, and a `review` collects them and sends them together when the person finishes the review. `state` is',
        '`open`, `dispatched`, `answered` or `abandoned`, and nothing computes it — a person or the dispatch writes it.',
        '',
        '## What was said',
        '',
        'In the order it was written. `position` is a real number, so a comment written between two others took the',
        'midpoint and nothing else had to move.',
        '',
        '`context` is what a comment points at, as JSON, AND IT KEEPS THE WORDS IT QUOTED. That is what lets a comment',
        'still say what it was about after the text underneath it is rewritten. It is carried exactly as stored,',
        'because the column is text: nothing here parses it and nothing repairs an offset. `null` means the comment',
        'pointed at nothing in particular.',
        '',
        'WHO EACH COMMENT WAS FOR IS THREE SEPARATE FACTS and all three are carried: `recipientSaid` is what somebody',
        'typed, `recipientWhy` is how Mole Office arrived at a recipient, and `recipientKind` is what was settled. All four',
        'recipient columns are null together on a comment nobody addressed.',
        '',
      ]
      if (said.length === 0) {
        parts.push('Nothing has been said in this conversation yet. It was started and left, which is a real state:')
        parts.push('a conversation with no comments has nothing to send.')
      } else {
        for (const row of said) {
          parts.push(
            `### ${String(row['position'])} · ${String(row['role'])} · ${String(row['intent'])} — to ${addressedTo(row)}`,
          )
          parts.push('')
          parts.push(fieldsBlock('agent_messages', row, REGION_COLUMNS.agent_messages))
          parts.push('')
        }
        parts.pop()
      }
      parts.push('')
      parts.push('## The runs this conversation produced')
      parts.push('')
      if (runs.length === 0) {
        parts.push('None. Nothing was sent, so no worker was ever asked anything — which is not the same as a run')
        parts.push('nobody has picked up.')
      } else {
        parts.push('Each is a page of its own, because each carries what the worker was given and what came back:')
        parts.push('')
        for (const run of runs) {
          const runId = mustBeString(run['id'], 'agent_runs.id')
          parts.push(`- \`runs/${runId}.md\` — ${String(run['state'])}`)
        }
      }
      files.push({ path: `conversations/${id}.md`, text: page(parts) })
    }

    // A comment whose conversation is not in this archive still has to be written somewhere, or the
    // manifest would count a row that is in no file and the importer would report the archive as
    // truncated. It is one page rather than one per row, because there is no conversation to hang
    // them under and the fact they share is exactly that.
    const homelessMessages = inOrder(
      messageRows.filter((row) => !threadById.has(mustBeString(row['threadId'], 'agent_messages.threadId'))),
    )
    if (homelessMessages.length > 0) {
      const parts: string[] = [
        '# Comments whose conversation is not in this archive',
        '',
        `${homelessMessages.length} comment${homelessMessages.length === 1 ? '' : 's'}, each naming a conversation`,
        'this archive does not hold. They are here because a row that is counted and written nowhere is a row a',
        'restore loses in silence.',
        '',
        'A comment belongs to the project its conversation names, so a comment whose conversation is missing belongs',
        'to no project that can be worked out. An importer must not invent the conversation.',
        '',
      ]
      for (const row of homelessMessages) {
        parts.push(`### ${String(row['threadId'])} · ${String(row['position'])} · ${String(row['role'])}`)
        parts.push('')
        parts.push(fieldsBlock('agent_messages', row, REGION_COLUMNS.agent_messages))
        parts.push('')
      }
      parts.pop()
      files.push({ path: 'conversations/comments-with-no-conversation.md', text: page(parts) })
    }

    // ONE FILE PER RUN, whether or not its conversation is in this archive, because a run carries
    // two JSON documents and the importer allows one such row per file.
    for (const run of runRows) {
      const runId = mustBeString(run['id'], 'agent_runs.id')
      assertSafeFileName(runId, 'an agent run id')
      const threadId = mustBeString(run['threadId'], 'agent_runs.threadId')
      const thread = threadById.get(threadId)
      const about =
        thread === undefined
          ? `a conversation this archive does not hold, ${threadId}`
          : `"${mustBeString(thread['title'], 'agent_threads.title')}", ${threadId}`
      const recipient = run['recipientSessionId']
      const parts: string[] = [
        frontMatter('agent_runs', run, REGION_COLUMNS.agent_runs),
        '',
        `# One attempt to answer ${about}`,
        '',
        `${String(run['state'])}, asked of the runtime \`${String(run['runtime'])}\`, written ${String(run['createdAt'])}.`,
        typeof recipient === 'string'
          ? `Addressed to the run "${titleOf.get(recipient) ?? '(no record has that id)'}", ${recipient}` +
            `${run['resumeExternalId'] === null ? ', and no id was stored for picking that conversation up again.' : `, picked up again through \`${String(run['resumeExternalId'])}\`.`}`
          : 'Addressed to a new agent on purpose, so there is nothing to pick up again.',
        '',
        'MOLE OFFICE NEVER STARTED THIS. A run is a row a worker claims over HTTP; this server starts no process. So',
        '`claimedBy`, `claimedAt`, `startedAt` and `endedAt` are null until a worker does each of those things, and',
        'null there means nobody has picked this up — a real answer, and the one the screen shows instead of a',
        'spinner. `error` with no result is a failure, and `declined` means a worker looked at this and could not',
        'serve it, so it is still waiting rather than finished.',
        '',
        '## What the worker was given',
        '',
        'WRITTEN ONCE, WHEN THE REVIEW WAS SENT, AND NEVER REWRITTEN. It is the only record of what was asked, and an',
        'answer is only worth anything read against the question that produced it. It carries ids and a sentence',
        'rather than copies of records: the agent reads Mole Office through the API, and a copy taken at dispatch is',
        'already old by the time anybody reads it.',
        '',
        jsonBlock('agent_runs.request', run['request'] ?? null),
        '',
        '## What came back',
        '',
        run['result'] === null
          ? 'Nothing has come back, so the block below is `null`. It is written out rather than left off, because an\nabsent document and an empty one are different facts and an importer must not have to choose between them.'
          : 'What the worker posted, exactly as it was stored.',
        '',
        jsonBlock('agent_runs.result', run['result'] ?? null),
      ]
      files.push({ path: `runs/${runId}.md`, text: page(parts) })
    }
  }

  // ---------------------------------------------------------------- the code this work is in
  //
  // THREE REGIONS ON ONE PAGE, because a relationship is only readable beside the repository and the
  // revision it names. The order they are written in is the order a restore has to follow, and it is
  // read off AUTHORED_TABLES rather than decided here.
  {
    const repos = sortBy(
      rowsByRegion.get('repositories') ?? [],
      (r) => mustBeString(r['name'], 'repositories.name'),
      (r) => mustBeString(r['id'], 'repositories.id'),
    )
    const revisions = sortBy(
      rowsByRegion.get('implementation_revisions') ?? [],
      (r) => mustBeString(r['repositoryId'], 'implementation_revisions.repositoryId'),
      (r) => mustBeString(r['ref'], 'implementation_revisions.ref'),
    )
    const map = sortBy(
      rowsByRegion.get('implementation_map') ?? [],
      (r) => mustBeString(r['recordId'], 'implementation_map.recordId'),
      (r) => mustBeString(r['pattern'], 'implementation_map.pattern'),
      (r) => mustBeString(r['id'], 'implementation_map.id'),
    )
    const nameOf = new Map(repos.map((r) => [mustBeString(r['id'], 'repositories.id'), String(r['name'])]))
    const parts: string[] = [
      '# The code this project\'s work is implemented in',
      '',
      'Three things are here: the repositories somebody registered, the code revisions somebody named, and every',
      'relationship somebody stated between a record and some code. All three were written on purpose by a person',
      'or an agent, and nothing can work any of them out again.',
      '',
      'WHAT IS NOT HERE is what a resolver worked out. Those rows are rebuilt whole by the next scan of their',
      'repository, so a restored copy would describe the files of whichever machine this came from.',
      '',
      '`root` IS A PATH ON THE MACHINE THIS WAS WRITTEN ON. It travels with the row, so an archive restored',
      'somewhere else carries every repository name and every relationship and one path that machine may not have.',
      'The first rebuild there refuses, naming the value, and a person re-points it once. THE RELATIONSHIPS ARE',
      'UNTOUCHED BY THAT, because every pattern is written relative to its repository. A `root` that is null means',
      'the repository is named and there is no checkout of it on this machine, which is a real answer.',
      '',
      'TWO ROWS MAY SAY THE SAME THING ABOUT THE SAME CODE and that is not a duplicate. `provenance` is in the',
      'unique index, so a person\'s statement and an agent\'s guess about one pattern are two rows that coexist.',
      'They are never merged and neither overwrites the other.',
      '',
    ]
    if (repos.length === 0 && revisions.length === 0 && map.length === 0) {
      parts.push('No repository has been registered, so nothing says which code any of this work is implemented in.')
      parts.push('That is not the same as the work having no code: it is that nobody has written it down here.')
    } else {
      for (const row of repos) {
        parts.push(`### ${String(row['name'])} — ${String(row['root'] ?? 'no checkout on that machine')}`)
        parts.push('')
        parts.push(fieldsBlock('repositories', row, REGION_COLUMNS.repositories))
        parts.push('')
      }
      for (const row of revisions) {
        const repo = nameOf.get(mustBeString(row['repositoryId'], 'implementation_revisions.repositoryId'))
        parts.push(`### ${String(row['label'] ?? row['ref'])} — ${repo ?? '(no repository has that id)'}`)
        parts.push('')
        parts.push(fieldsBlock('implementation_revisions', row, REGION_COLUMNS.implementation_revisions))
        parts.push('')
      }
      for (const row of map) {
        const recordId = mustBeString(row['recordId'], 'implementation_map.recordId')
        const repo = nameOf.get(mustBeString(row['repositoryId'], 'implementation_map.repositoryId'))
        parts.push(
          `### ${titleOf.get(recordId) ?? '(no record has that id)'} ${String(row['relation'])} ` +
            `${repo ?? '(no repository has that id)'}/${String(row['pattern'])}`,
        )
        parts.push('')
        parts.push(fieldsBlock('implementation_map', row, REGION_COLUMNS.implementation_map))
        parts.push('')
      }
      parts.pop()
    }
    files.push({ path: 'code.md', text: page(parts) })
  }

  // ---------------------------------------------------------------- what a scan saw, one file per day
  //
  // SPLIT BY DAY for the reason the change log is: this is the table that grows fastest in the
  // product, and one file per day keeps a page a person can open.
  {
    const rows = rowsByRegion.get('file_observations') ?? []
    const byDay = new Map<string, Row[]>()
    for (const row of rows) {
      const day = dayOf(mustBeString(row['seenAt'], `file_observations.seenAt of ${String(row['id'])}`))
      const list = byDay.get(day)
      if (list === undefined) byDay.set(day, [row])
      else list.push(row)
    }
    const undated = byDay.get('undated')?.length ?? 0
    if (undated > 0) {
      notes.push(
        `${undated} file_observations row(s) carry a "seenAt" that will not parse as a stamp; they are in ` +
          `observations/undated.md`,
      )
    }
    for (const [day, forDay] of byDay) {
      const sorted = sortBy(
        forDay,
        (r) => mustBeString(r['seenAt'], 'file_observations.seenAt'),
        (r) => mustBeString(r['path'], 'file_observations.path'),
        (r) => mustBeString(r['id'], 'file_observations.id'),
      )
      const parts: string[] = [
        `# What a scan saw — ${day === 'undated' ? 'rows whose stamp will not parse' : day}`,
        '',
        `${sorted.length} row${sorted.length === 1 ? '' : 's'}. Each one says that one scan found one file added,`,
        'changed or removed since the scan before it. THERE IS NO FILE CONTENT HERE, no difference between two',
        'versions, no author, no parent and no message: you cannot reconstruct one line of any file from this, you',
        'cannot ask who changed something, and you cannot ask what it looked like before. Git owns that history.',
        '',
        'THESE ROWS ARE CARRIED AND THE FILE INDEX IS NOT, and the difference is the point. The index describes the',
        'present and any scan rebuilds it. One of these is a dated observation, and nothing can recompute it.',
        '',
        '`firstScan` IS 1 WHERE THERE WAS NOTHING TO COMPARE AGAINST — the first rebuild of a repository, or the',
        'first after a restore. Every file then reads as `added`, which is true and is not a day\'s work. A reader',
        'that ignored the flag would report the whole repository as having changed at once.',
        '',
      ]
      for (const row of sorted) {
        const seenAt = mustBeString(row['seenAt'], 'file_observations.seenAt')
        const clock = day === 'undated' ? seenAt : seenAt.slice(11) || seenAt
        parts.push(`### ${clock} · ${String(row['change'])} · ${String(row['path'])}`)
        parts.push('')
        parts.push(fieldsBlock('file_observations', row, REGION_COLUMNS.file_observations))
        parts.push('')
      }
      parts.pop()
      files.push({ path: `observations/${day}.md`, text: page(parts) })
    }
  }

  // ---------------------------------------------------------------- what a restriction reached
  {
    const rows = sortBy(
      rowsByRegion.get('revalidations') ?? [],
      (r) => mustBeString(r['restrictionId'], 'revalidations.restrictionId'),
      (r) => mustBeString(r['at'], 'revalidations.at'),
      (r) => mustBeString(r['id'], 'revalidations.id'),
    )
    const parts: string[] = [
      '# What a restriction reached, and who has re-checked it',
      '',
      'When something that was standing in for real work is resolved, every piece of work that rested on it may need',
      'looking at again. One row here is one of those: which restriction, which record, how far away it was, and the',
      'path of links it was reached by.',
      '',
      '`reachedBy` AND `distance` ARE FROZEN AT THE MOMENT THE ROW WAS WRITTEN, and `writtenBy` says which moment',
      'that was. Most rows are written by the resolution. A record can become a dependent afterwards — somebody',
      'draws a link next week — and the first judgement about it writes its row, whose path is the graph as it stood',
      'then. Neither can be worked out again from today\'s links, which is why both are carried.',
      '',
      '`state` IS THREE WORDS AND TWO OF THEM ARE SOMEBODY\'S JUDGEMENT. `needs_review` is what Mole Office wrote.',
      '`checked` means somebody looked and the work still stands; `not_affected` means somebody looked and this one',
      'was never really affected. Neither is ever inferred, and `decidedBy` and `note` say who and why.',
      '',
    ]
    if (rows.length === 0) {
      parts.push('Nothing has been resolved that reached any other work, so nobody has been asked to re-check anything.')
    } else {
      for (const row of rows) {
        const recordId = mustBeString(row['recordId'], 'revalidations.recordId')
        const restrictionId = mustBeString(row['restrictionId'], 'revalidations.restrictionId')
        parts.push(
          `### ${titleOf.get(restrictionId) ?? '(no record has that id)'} reached ` +
            `${titleOf.get(recordId) ?? '(no record has that id)'} — ${String(row['state'])}`,
        )
        parts.push('')
        parts.push(fieldsBlock('revalidations', row, REGION_COLUMNS.revalidations))
        parts.push('')
      }
      parts.pop()
    }
    files.push({ path: 'revalidations.md', text: page(parts) })
  }

  // ---------------------------------------------------------------- comments whose words went out
  {
    const rows = sortBy(
      rowsByRegion.get('annotation_words_fixed') ?? [],
      (r) => mustBeString(r['fixedAt'], 'annotation_words_fixed.fixedAt'),
      (r) => mustBeString(r['annotationId'], 'annotation_words_fixed.annotationId'),
    )
    const parts: string[] = [
      '# Comments whose words had already gone out',
      '',
      'One row per comment that had been sent to somebody at a time when Mole Office kept a word for it on the comment',
      'and no conversation recorded which comment the words came from. The word is gone now; this marker is what is',
      'left of it.',
      '',
      'NOTHING CAN RECOMPUTE A ROW OF THIS, which is why it is here. The fact it records is exactly the fact that',
      'was lost. Without it, a restored copy would answer "these words never went out" for comments that had, from',
      'the gate built to stop exactly that.',
      '',
      'NO RECIPIENT IS NAMED, and none was guessed. Mole Office does not know who these went to. Two comments with the',
      'same words would have made matching them a guess, and an absence is a better answer than a guess.',
      '',
      'ONE MIGRATION WROTE THESE ROWS AND NO ROUTE WRITES THIS TABLE, so nothing can walk one back.',
      '',
    ]
    if (rows.length === 0) {
      parts.push('No comment is in this state. Every comment whose words went out has a conversation that says so.')
    } else {
      for (const row of rows) {
        const id = mustBeString(row['annotationId'], 'annotation_words_fixed.annotationId')
        parts.push(`### ${titleOf.get(id) ?? '(no record has that id)'} — stamped ${String(row['fixedAt'])}`)
        parts.push('')
        parts.push(fieldsBlock('annotation_words_fixed', row, REGION_COLUMNS.annotation_words_fixed))
        parts.push('')
      }
      parts.pop()
    }
    files.push({ path: 'comments-already-sent.md', text: page(parts) })
  }

  // ---------------------------------------------------------------- how far each message got
  {
    const rows = sortBy(
      rowsByRegion.get('message_delivery') ?? [],
      (r) => mustBeString(r['at'], 'message_delivery.at'),
      (r) => mustBeString(r['id'], 'message_delivery.id'),
    )
    const parts: string[] = [
      '# How far each message got',
      '',
      'One row per person or agent one message was sent to, saying whether it is still waiting, has been handed to',
      'something serving them, or has been read.',
      '',
      'IT IS NOT A FIELD OF THE MESSAGE, and that is why it is its own page. A mark changes, and a field of a record',
      'cannot change without writing a revision, so a conversation being read would otherwise look like somebody',
      'rewriting the messages in it.',
      '',
      'A ROW NAMES A RECIPIENT BY KIND AND ID, which is the only way a participant is ever named. The people and the',
      'durable agents themselves are in participants.md, which a restore writes first.',
      '',
    ]
    if (rows.length === 0) {
      parts.push('No message in this archive was sent to anybody, which is what a database with no messages holds.')
    } else {
      for (const row of rows) {
        const id = mustBeString(row['messageId'], 'message_delivery.messageId')
        parts.push(`### ${titleOf.get(id) ?? '(no record has that id)'} — to ${String(row['recipientId'])}`)
        parts.push('')
        parts.push(fieldsBlock('message_delivery', row, REGION_COLUMNS.message_delivery))
        parts.push('')
      }
      parts.pop()
    }
    files.push({ path: 'message-delivery.md', text: page(parts) })
  }

  // ---------------------------------------------------------------- who read whose conversation
  {
    const rows = sortBy(
      rowsByRegion.get('conversation_reads') ?? [],
      (r) => mustBeString(r['at'], 'conversation_reads.at'),
      (r) => mustBeString(r['id'], 'conversation_reads.id'),
    )
    const parts: string[] = [
      '# Who read a conversation they were not part of',
      '',
      'A person with the owner row may open a conversation between two agents and read it as either of them sees it.',
      'Reading writes nothing on any message. This is where the read itself is written down: who, which pair, which',
      'side, and when. Each reader keeps one read of each conversation in each project, the newest, and a newer read',
      'replaces it.',
      '',
      'IT IS ITS OWN PAGE BECAUSE IT IS AN ACT RATHER THAN TRAFFIC. The same read also leaves a row in the usage',
      'ledger, and that one is deleted after a fortnight because it is there to count requests. This one is kept',
      'until the same reader reads the same conversation again.',
      '',
      'A PAIR IS TWO AGENT IDS WITH A TILDE BETWEEN THEM, in one order however it was asked for. The agents',
      'themselves are in participants.md, which a restore writes first.',
      '',
    ]
    if (rows.length === 0) {
      parts.push('Nobody has read a conversation they were not part of, which is what a database of one person\'s own work holds.')
    } else {
      for (const row of rows) {
        parts.push(`### ${String(row['pair'])} — read as ${String(row['asSide'])}`)
        parts.push('')
        parts.push(fieldsBlock('conversation_reads', row, REGION_COLUMNS.conversation_reads))
        parts.push('')
      }
      parts.pop()
    }
    files.push({ path: 'conversation-reads.md', text: page(parts) })
  }

  // ---------------------------------------------------------------- the groups, and who is in them
  {
    const groupRows = sortBy(
      rowsByRegion.get('groups') ?? [],
      (r) => mustBeString(r['openedAt'], 'groups.openedAt'),
      (r) => mustBeString(r['id'], 'groups.id'),
    )
    const memberRows = sortBy(
      rowsByRegion.get('group_members') ?? [],
      (r) => mustBeString(r['groupId'], 'group_members.groupId'),
      (r) => mustBeString(r['joinedAt'], 'group_members.joinedAt'),
      (r) => mustBeString(r['id'], 'group_members.id'),
    )
    const parts: string[] = [
      '# Groups, and who is in them',
      '',
      'A group is a conversation with several subscribers. A message addressed to one goes to every member of it,',
      'as one message with one delivery mark per member — so the messages themselves are in the records, and what',
      'is here is who was in the group when each of them was sent.',
      '',
      'A MEMBERSHIP THAT HAS ENDED IS KEPT, with the moment it ended in `leftAt`. Somebody who left the group was',
      'in it, and that is the fact a reader of an old conflict needs. A membership with no `leftAt` is somebody who',
      'is in the group now.',
      '',
      'THE PARTICIPANTS THEMSELVES are in participants.md, which a restore writes first.',
      '',
    ]
    if (groupRows.length === 0) {
      parts.push('No group has been opened in this archive, which is what a database nobody has pulled a group in holds.')
    } else {
      for (const row of groupRows) {
        const id = mustBeString(row['id'], 'groups.id')
        parts.push(`### ${String(row['name'])}`)
        parts.push('')
        parts.push(fieldsBlock('groups', row, REGION_COLUMNS.groups))
        parts.push('')
        for (const member of memberRows.filter((one) => one['groupId'] === id)) {
          parts.push(fieldsBlock('group_members', member, REGION_COLUMNS.group_members))
          parts.push('')
        }
      }
      parts.pop()
    }
    // A MEMBERSHIP WHOSE GROUP IS NOT IN THIS ARCHIVE STILL HAS TO BE WRITTEN, or the manifest's
    // count and the rows in the file would disagree and the import would refuse the whole archive.
    // A project-scoped archive carries a group and its memberships together, so this is empty in
    // practice; it is written rather than assumed because a silent drop is what the manifest check
    // exists to catch.
    const orphans = memberRows.filter((one) => !groupRows.some((g) => g['id'] === one['groupId']))
    if (orphans.length > 0) {
      parts.push('')
      parts.push('## Memberships whose group is not in this archive')
      parts.push('')
      for (const member of orphans) {
        parts.push(fieldsBlock('group_members', member, REGION_COLUMNS.group_members))
        parts.push('')
      }
      parts.pop()
    }
    files.push({ path: 'groups.md', text: page(parts) })
  }

  // ---------------------------------------------------------------- what an agent was working on
  {
    const rows = sortBy(
      rowsByRegion.get('work_claims') ?? [],
      (r) => mustBeString(r['openedAt'], 'work_claims.openedAt'),
      (r) => mustBeString(r['id'], 'work_claims.id'),
    )
    const parts: string[] = [
      '# What an agent was working on',
      '',
      'An agent says what it is working on when it starts: some records, some files and folders, and the run whose',
      'life the claim follows. A second live claim naming the same thing opens a group with both agents and the',
      'owner in it, which is in groups.md.',
      '',
      'A CLAIM IS KEPT AFTER IT ENDS. A lease ends when its run ends and nothing writes that down — it is read from',
      'the ledger and the session record every time somebody asks — so a claim in this archive may be one that ended',
      'long ago. `releasedAt` is the one ending that IS written down, and it means whoever made the claim said they',
      'had finished.',
      '',
      'THE PARTICIPANTS are in participants.md and the runs are session records, both of which a restore writes',
      'first.',
      '',
    ]
    if (rows.length === 0) {
      parts.push('No agent has said what it is working on in this archive.')
    } else {
      for (const row of rows) {
        parts.push(`### ${String(row['claimantId'])} — from ${String(row['openedAt'])}`)
        parts.push('')
        parts.push(fieldsBlock('work_claims', row, REGION_COLUMNS.work_claims))
        parts.push('')
      }
      parts.pop()
    }
    files.push({ path: 'work-claims.md', text: page(parts) })
  }

  // ------------------------------------------------- which session was answering as which agent
  {
    const rows = sortBy(
      rowsByRegion.get('handle_holds') ?? [],
      (r) => mustBeString(r['claimedAt'], 'handle_holds.claimedAt'),
      (r) => mustBeString(r['id'], 'handle_holds.id'),
    )
    const parts: string[] = [
      '# Which session was answering as which agent',
      '',
      'A durable agent is one identity across many processes. When somebody has that agent open in a terminal, that',
      'session holds the agent’s handle, and a message to the agent goes to it rather than starting a fresh run.',
      'A hold names the session, the computer and the tool, and carries the moment that session last said it was',
      'still there.',
      '',
      'NOTHING HERE IS TRUE OF THE MACHINE YOU RESTORE ONTO. A hold is only ever read against its heartbeat, and',
      'every heartbeat in this archive is older than any window a reader allows — so every hold restored from here',
      'reads as having gone quiet, and the first reader releases it saying so. Nothing is signalled by that.',
      '',
      'THE AGENTS are in participants.md and the sessions are records, both of which a restore writes first.',
      '',
    ]
    if (rows.length === 0) {
      parts.push(absenceLine('handle_holds', omittedFromScope, 'No session has answered as a durable agent.'))
    } else {
      for (const row of rows) {
        parts.push(`### ${String(row['agentId'])} — from ${String(row['claimedAt'])}`)
        parts.push('')
        parts.push(fieldsBlock('handle_holds', row, REGION_COLUMNS.handle_holds))
        parts.push('')
      }
      parts.pop()
    }
    files.push({ path: 'handle-holds.md', text: page(parts) })
  }

  // ------------------------------------------------ which addressee's dead letters are taken on
  {
    const rows = sortBy(
      rowsByRegion.get('dead_letter_claims') ?? [],
      (r) => mustBeString(r['openedAt'], 'dead_letter_claims.openedAt'),
      (r) => mustBeString(r['id'], 'dead_letter_claims.id'),
    )
    const parts: string[] = [
      '# Which addressee’s dead letters a secretary has taken on',
      '',
      'A dead letter is a message queued for an agent nothing can hand it to. After a time or a count the office',
      'names the backlog in the Secretariat group, in a line given only to the secretary the person named to take',
      'the dead letters, and to nobody when nobody is named; it is never given to every secretary. A secretary',
      'claims the addressees that are its to handle — per addressee, once, never per letter. This table holds that',
      'one fact: which addressee has been named in a broadcast, and who claimed it. The letters themselves are',
      'delivery rows on the messages, which a restore writes first; nothing here is a second store of them.',
      '',
      'THE LETTERS ARE NOT MOVED BY A CLAIM, and the claim is not the reading of them: it says who has taken the',
      'addressee on. `claimedBy*`, `claimedAt` and `claimedBecause` are NULL until a secretary claims it, which is',
      'nobody yet rather than an ending.',
      '',
      'THE GROUP is in groups.md and the agents are in participants.md, both of which a restore writes first.',
      '',
    ]
    if (rows.length === 0) {
      parts.push(absenceLine('dead_letter_claims', omittedFromScope, 'No addressee has been named in a dead-letter broadcast.'))
    } else {
      for (const row of rows) {
        parts.push(`### ${String(row['agentId'])} — from ${String(row['openedAt'])}`)
        parts.push('')
        parts.push(fieldsBlock('dead_letter_claims', row, REGION_COLUMNS.dead_letter_claims))
        parts.push('')
      }
      parts.pop()
    }
    files.push({ path: 'dead-letters.md', text: page(parts) })
  }

  // ------------------------------------------------- the permanent residents' leave, void marks and writes
  {
    const grants = sortBy(
      rowsByRegion.get('resident_read_grants') ?? [],
      (r) => mustBeString(r['givenAt'], 'resident_read_grants.givenAt'),
      (r) => mustBeString(r['id'], 'resident_read_grants.id'),
    )
    const marks = sortBy(
      rowsByRegion.get('resident_void_marks') ?? [],
      (r) => mustBeString(r['markedAt'], 'resident_void_marks.markedAt'),
      (r) => mustBeString(r['id'], 'resident_void_marks.id'),
    )
    const writes = sortBy(
      rowsByRegion.get('resident_space_writes') ?? [],
      (r) => mustBeString(r['writtenAt'], 'resident_space_writes.writtenAt'),
      (r) => mustBeString(r['id'], 'resident_space_writes.id'),
    )
    const sleeps = sortBy(
      rowsByRegion.get('resident_sleeps') ?? [],
      (r) => mustBeString(r['beganAt'], 'resident_sleeps.beganAt'),
      (r) => mustBeString(r['id'], 'resident_sleeps.id'),
    )
    const parts: string[] = [
      '# What happened in the permanent residents\u2019 personal spaces',
      '',
      'A permanent resident is an agent the secretary proposed and the owner confirmed. Each has a personal space: a',
      'folder of its own files beside the database. Which agents are residents, and their successors, are on the agents',
      'in participants.md. This page holds three things about the spaces: the leave each resident gave another agent to',
      'read its space, the files marked void with their reasons, and each file the resident wrote, with who and when.',
      'It also holds each sleep and each postponed sleep a resident recorded.',
      '',
      'THE FILES THEMSELVES ARE NOT IN THIS ARCHIVE. They are in personal-spaces/ beside the database, and the backup',
      'carries them. A restore from this archive alone brings back these rows and not the files they are about.',
      '',
    ]
    if (grants.length === 0 && marks.length === 0 && writes.length === 0 && sleeps.length === 0) {
      parts.push(absenceLine('resident_read_grants', omittedFromScope, 'No resident has given leave to read its space.'))
      parts.push('')
      parts.push(absenceLine('resident_void_marks', omittedFromScope, 'No file in a personal space is marked void.'))
      parts.push('')
      parts.push(absenceLine('resident_space_writes', omittedFromScope, 'No resident has written a file into its space.'))
      parts.push('')
      parts.push(absenceLine('resident_sleeps', omittedFromScope, 'No resident has recorded a sleep or a postponed sleep.'))
    } else {
      for (const row of grants) {
        parts.push(`### leave from ${String(row['residentId'])} to ${String(row['readerId'])}`)
        parts.push('')
        parts.push(fieldsBlock('resident_read_grants', row, REGION_COLUMNS.resident_read_grants))
        parts.push('')
      }
      for (const row of marks) {
        parts.push(`### void: ${String(row['residentId'])} ${String(row['path'])}`)
        parts.push('')
        parts.push(fieldsBlock('resident_void_marks', row, REGION_COLUMNS.resident_void_marks))
        parts.push('')
      }
      for (const row of writes) {
        parts.push(`### written: ${String(row['residentId'])} ${String(row['path'])}`)
        parts.push('')
        parts.push(fieldsBlock('resident_space_writes', row, REGION_COLUMNS.resident_space_writes))
        parts.push('')
      }
      for (const row of sleeps) {
        parts.push(`### ${String(row['what'])}: ${String(row['agentId'])} from ${String(row['beganAt'])}`)
        parts.push('')
        parts.push(fieldsBlock('resident_sleeps', row, REGION_COLUMNS.resident_sleeps))
        parts.push('')
      }
      parts.pop()
    }
    files.push({ path: 'personal-spaces.md', text: page(parts) })
  }

  // ------------------------------------------------- how one person has arranged their contacts
  {
    const groups = sortBy(
      rowsByRegion.get('contact_groups') ?? [],
      (r) => mustBeString(r['ownerId'], 'contact_groups.ownerId'),
      (r) => mustBeString(r['id'], 'contact_groups.id'),
    )
    const placements = sortBy(
      rowsByRegion.get('contact_placements') ?? [],
      (r) => mustBeString(r['ownerId'], 'contact_placements.ownerId'),
      (r) => mustBeString(r['id'], 'contact_placements.id'),
    )
    const folds = sortBy(
      rowsByRegion.get('contact_group_collapses') ?? [],
      (r) => mustBeString(r['ownerId'], 'contact_group_collapses.ownerId'),
      (r) => mustBeString(r['id'], 'contact_group_collapses.id'),
    )
    const parts: string[] = [
      '# How the contacts list is arranged',
      '',
      'Which second-level group each contact is in, in what order, and which groups one person has folded away.',
      'The first level is two locked top groups, Human and Agent, DECLARED by the product rather than stored; under',
      'Agent the default second-level groups are by role — secretary, inspector, supervisor, worker, other and',
      'retired — and under Human there is one. Criteria M119 to M121.',
      '',
      'SO THESE ROWS ARE ONLY WHAT SOMEBODY CHANGED. A group they made, a default one they renamed or moved, a',
      'contact they moved, an order they set by hand, or a group they folded. An archive with none of these rows is',
      'not an archive of a product with no groups: it is one where nobody has changed the arrangement the product',
      'declares.',
      '',
      'AN ARRANGEMENT BELONGS TO A PERSON AND TO THE INSTALLATION, not to a project — which group an agent belongs',
      'in is a fact about the agent, and the registries these arrange are in every project on this machine. So a',
      'project-scoped archive carries none of these, and says so in its notes.',
      '',
    ]
    if (groups.length === 0 && placements.length === 0 && folds.length === 0) {
      // THREE REGIONS ON ONE PAGE, so the sentence for each is drawn and neither can be the one
      // nobody looked for. A scoped archive carries none of them, and `absenceLine` is what says so
      // rather than letting this page claim nobody has arranged anything.
      parts.push(
        absenceLine('contact_groups', omittedFromScope, 'Nobody has made, renamed or moved a group.'),
      )
      parts.push('')
      parts.push(
        absenceLine('contact_placements', omittedFromScope, 'Nobody has moved or ordered a contact by hand.'),
      )
      parts.push('')
      parts.push(
        absenceLine(
          'contact_group_collapses',
          omittedFromScope,
          'Nobody has folded a group away or opened one again.',
        ),
      )
    } else {
      for (const row of groups) {
        parts.push(`### ${String(row['name'])} — ${String(row['ownerKind'])} ${String(row['ownerId'])}`)
        parts.push('')
        parts.push(fieldsBlock('contact_groups', row, REGION_COLUMNS.contact_groups))
        parts.push('')
      }
      for (const row of placements) {
        parts.push(`### ${String(row['contact'])} — ${String(row['ownerKind'])} ${String(row['ownerId'])}`)
        parts.push('')
        parts.push(fieldsBlock('contact_placements', row, REGION_COLUMNS.contact_placements))
        parts.push('')
      }
      for (const row of folds) {
        parts.push(`### ${String(row['groupKey'])} — ${String(row['ownerKind'])} ${String(row['ownerId'])}`)
        parts.push('')
        parts.push(fieldsBlock('contact_group_collapses', row, REGION_COLUMNS.contact_group_collapses))
        parts.push('')
      }
      parts.pop()
    }
    files.push({ path: 'contacts-arranged.md', text: page(parts) })
  }

  // ---------------------------------------------------------------- the requests for one press
  {
    const sorted = sortBy(
      rowsByRegion.get('one_press_requests') ?? [],
      (r) => mustBeString(r['askedAt'], 'one_press_requests.askedAt'),
      (r) => mustBeString(r['id'], 'one_press_requests.id'),
    )
    // A decision governs the requests for one press.
    const parts: string[] = [
      '# The requests for one press',
      '',
      'An agent asked the person to agree to one known act, and these say what was asked and what came of it.',
      '`act` names one of the acts the office knows, and `inputs` holds its fixed inputs; a',
      'row holds no command and no text that runs. `shows` is the sentence the person read, and `because` is the',
      'agent\'s own words. `state` is `waiting`, `done`, `could-not`, `refused` or `withdrawn`, and `outcome` says what',
      'the act did or why it could not run.',
      '',
    ]
    if (sorted.length === 0) {
      parts.push(absenceLine('one_press_requests', omittedFromScope, 'No agent has asked for one press.'))
    } else {
      for (const row of sorted) {
        parts.push(`### ${String(row['act'])} — ${String(row['state'])}`)
        parts.push('')
        parts.push(fieldsBlock('one_press_requests', row, REGION_COLUMNS.one_press_requests))
        parts.push('')
      }
      parts.pop()
    }
    files.push({ path: 'one-press-requests.md', text: page(parts) })
  }

  // ---------------------------------------------------------------- the uses of tools
  {
    // BY RUN, AND IN EACH RUN BY ITS PLACE. `seq` is a number, so it is padded to sort as one.
    const sorted = sortBy(
      rowsByRegion.get('tool_uses') ?? [],
      (r) => mustBeString(r['runId'], 'tool_uses.runId'),
      (r) => String(r['seq']).padStart(12, '0'),
    )
    const parts: string[] = [
      '# The uses of tools',
      '',
      'Each row is one use of a tool, written on the run that used it by POST /api/toolset/uses. `seq` is its place on',
      'that run, from 1. `said` is what the use did, in the words of the agent that used it. A row with `movedAt` was a',
      'line in the run\'s `data.toolUses` until migration 0231 moved it here, and it names no writer because the list',
      'never said who wrote each line.',
      '`proof` is what the use door found when it checked that tools/use-line.mjs sent the line: `matches`, `none` or',
      '`does not match`. It is empty on a row written before migration 0300, when the door did not check.',
      '`atInstant` is the same moment as `at`, as an instant with its offset. It is empty on a row written before',
      'migration 0358 and on a row moved out of a run\'s list.',
      '',
    ]
    if (sorted.length === 0) {
      parts.push(absenceLine('tool_uses', omittedFromScope, 'No use of a tool was written.'))
    } else {
      for (const row of sorted) {
        parts.push(`### ${String(row['runId'])} — use ${String(row['seq'])}`)
        parts.push('')
        parts.push(fieldsBlock('tool_uses', row, REGION_COLUMNS.tool_uses))
        parts.push('')
      }
      parts.pop()
    }
    files.push({ path: 'tool-uses.md', text: page(parts) })
  }

  // ---------------------------------------------------------------- the test file results
  {
    const sorted = sortBy(
      rowsByRegion.get('test_file_runs') ?? [],
      (r) => mustBeString(r['useId'], 'test_file_runs.useId'),
      (r) => mustBeString(r['file'], 'test_file_runs.file'),
    )
    const parts: string[] = [
      '# The test file results',
      '',
      'Each row is one test file result from a named test run. Its use supplies the run and the time.',
      'The tree commit and change are repeated on every file of that use. Null means the value was not known.',
      '',
    ]
    if (sorted.length === 0) {
      parts.push(absenceLine('test_file_runs', omittedFromScope, 'No test file result was written.'))
    } else {
      for (const row of sorted) {
        parts.push(`### ${String(row['file'])} — ${String(row['result'])}`, '')
        parts.push(fieldsBlock('test_file_runs', row, REGION_COLUMNS.test_file_runs), '')
      }
      parts.pop()
    }
    files.push({ path: 'test-file-runs.md', text: page(parts) })
  }

  // ---------------------------------------------------------------- the handovers
  {
    const sorted = sortBy(
      rowsByRegion.get('handovers') ?? [],
      (r) => mustBeString(r['agentId'], 'handovers.agentId'),
      (r) => mustBeString(r['writtenAt'], 'handovers.writtenAt'),
      (r) => mustBeString(r['id'], 'handovers.id'),
    )
    // Two decisions govern the handovers.
    const parts: string[] = [
      '# The handovers',
      '',
      'Each agent keeps a handover document, so its next session, or whoever takes over its work, can start from it.',
      'A new handover is a new row and nothing is changed in place,',
      'so the newest row for an agent is its current handover and the rows before it are its history.',
      '`writtenByKind` is `agent` or `person`. An `agent` row was written by the agent itself, with its own key, or by a',
      "secretary under the person's grant, which `writtenById` then names as a different agent from the handover's own.",
      '',
    ]
    if (sorted.length === 0) {
      parts.push(absenceLine('handovers', omittedFromScope, 'No agent has a handover.'))
    } else {
      for (const row of sorted) {
        parts.push(`### ${String(row['agentId'])} — ${String(row['writtenAt'])}`)
        parts.push('')
        parts.push(fieldsBlock('handovers', row, REGION_COLUMNS.handovers))
        parts.push('')
      }
      parts.pop()
    }
    files.push({ path: 'handovers.md', text: page(parts) })
  }

  // ---------------------------------------------------------------- the signing packages and their items
  {
    const packages = sortBy(rowsByRegion.get('signing_packages') ?? [], (r) => mustBeString(r['broughtAt'], 'signing_packages.broughtAt'), (r) => mustBeString(r['id'], 'signing_packages.id'))
    const items = sortBy(rowsByRegion.get('signing_package_items') ?? [], (r) => mustBeString(r['packageId'], 'signing_package_items.packageId'), (r) => String(r['position']).padStart(2, '0'))
    const parts: string[] = ['# The signing packages', '', 'A secretary brings several of the person’s own acts for one signature; each unstruck act runs once.', 'The package and every item retain their sentences, answer, outcome and times as the receipt.', '', '## The packages', '']
    if (packages.length === 0) parts.push(absenceLine('signing_packages', omittedFromScope, 'No signing package has been brought.'))
    for (const row of packages) parts.push(fieldsBlock('signing_packages', row, REGION_COLUMNS.signing_packages), '')
    parts.push('## The items', '')
    if (items.length === 0) parts.push(absenceLine('signing_package_items', omittedFromScope, 'No signing package item has been filed.'))
    for (const row of items) parts.push(fieldsBlock('signing_package_items', row, REGION_COLUMNS.signing_package_items), '')
    files.push({ path: 'signing-packages.md', text: page(parts) })
  }

  // ---------------------------------------------------------------- the readiness checklists and their signatures
  {
    const checklists = sortBy(
      rowsByRegion.get('readiness_checklists') ?? [],
      (r) => mustBeString(r['raisedAt'], 'readiness_checklists.raisedAt'),
      (r) => mustBeString(r['id'], 'readiness_checklists.id'),
    )
    const signatures = sortBy(
      rowsByRegion.get('readiness_signatures') ?? [],
      (r) => mustBeString(r['signedAt'], 'readiness_signatures.signedAt'),
      (r) => mustBeString(r['id'], 'readiness_signatures.id'),
    )
    // Two decisions govern the readiness checklists.
    const parts: string[] = [
      '# The readiness checklists',
      '',
      'An operation that reaches others runs only after those it affects have signed. A readiness checklist is one',
      'such operation on one target, waiting for those signatures.',
      '`operation` names one of the operations the office gates, and `inputs` holds its fixed inputs; a row holds no',
      'command and no text that runs. `on_what` is a hash of the two, and every signature names the `on_what` it was',
      'given on. `shows` is the sentence each signer read, and `because` is the raiser\'s own words.',
      '',
      '`level` is how far the operation reaches, `a-group` or `everyone`, and `signers` is who must sign. The office',
      'worked out both when the checklist was raised; whoever raised it chose neither. `state` is `waiting`, `running`,',
      '`ran`, `could-not`, `cancelled` or `expired`, and `outcome` says what the operation did or why it did not run.',
      '',
      'Each signature says who signed, when, and on what. A signer who took a signature back keeps the row, with',
      '`withdrawn_at` set.',
      '',
      '## The checklists',
      '',
    ]
    if (checklists.length === 0) {
      parts.push(absenceLine('readiness_checklists', omittedFromScope, 'No readiness checklist has been raised.'))
    } else {
      for (const row of checklists) {
        parts.push(`### ${String(row['operation'])} — ${String(row['state'])}`)
        parts.push('')
        parts.push(fieldsBlock('readiness_checklists', row, REGION_COLUMNS.readiness_checklists))
        parts.push('')
      }
      parts.pop()
    }
    parts.push('', '## The signatures', '')
    if (signatures.length === 0) {
      parts.push(absenceLine('readiness_signatures', omittedFromScope, 'Nobody has signed a readiness checklist.'))
    } else {
      for (const row of signatures) {
        parts.push(`### ${String(row['signerKind'])} ${String(row['signerId'])} on ${String(row['checklistId'])}`)
        parts.push('')
        parts.push(fieldsBlock('readiness_signatures', row, REGION_COLUMNS.readiness_signatures))
        parts.push('')
      }
      parts.pop()
    }
    files.push({ path: 'readiness-checklists.md', text: page(parts) })
  }

  // ---------------------------------------------------------------- the list of quick inputs, and every ask for one
  {
    const lists = rowsByRegion.get('quick_input_list') ?? []
    const asks = sortBy(
      rowsByRegion.get('quick_input_asks') ?? [],
      (r) => mustBeString(r['agentId'], 'quick_input_asks.agentId'),
      (r) => String(r['atMs']).padStart(16, '0'),
      (r) => mustBeString(r['id'], 'quick_input_asks.id'),
    )
    const parts: string[] = [
      '# Quick inputs',
      '',
      "The office types an input into an agent's terminal only when the agent asked for it with its own run's key, the",
      'input is on the list below exactly as written, and nothing was typed for that agent in the last ten minutes.',
      '',
      '## The list',
      '',
      '`inputs` is the list as a JSON list of words, or `null` when the list was cleared; the row then says who cleared',
      'it and when. A row stamped `migration` and `0272` is the list the office starts with, which the owner did not set.',
      '',
    ]
    if (lists.length === 0) {
      parts.push(absenceLine('quick_input_list', omittedFromScope, 'There is no row for the list, so nobody knows whether one was set.'))
    }
    for (const row of lists) {
      parts.push(fieldsBlock('quick_input_list', row, REGION_COLUMNS.quick_input_list), '')
    }
    parts.push(
      '',
      '## The asks',
      '',
      'One row for every ask that named a run in an office terminal, typed or refused. `atMs` is the time in',
      'milliseconds since 1 January 1970, `outcome` says what became of the ask, and `says` is the sentence the asker',
      'was answered with.',
      '',
    )
    if (asks.length === 0) {
      parts.push(absenceLine('quick_input_asks', omittedFromScope, 'No agent has asked for a quick input.'))
    } else {
      for (const row of asks) {
        parts.push(`### ${String(row['agentId'])} — ${String(row['outcome'])} — ${String(row['input'])}`)
        parts.push('')
        parts.push(fieldsBlock('quick_input_asks', row, REGION_COLUMNS.quick_input_asks))
        parts.push('')
      }
      parts.pop()
    }
    files.push({ path: 'quick-inputs.md', text: page(parts) })
  }

  // ---------------------------------------------------------------- the presses for the person
  {
    // BY GRANT, AND IN EACH GRANT BY TIME, which is the order the person reads one grant's presses in.
    const sorted = sortBy(
      rowsByRegion.get('presses_for_the_person') ?? [],
      (r) => mustBeString(r['grantId'], 'presses_for_the_person.grantId'),
      (r) => mustBeString(r['at'], 'presses_for_the_person.at'),
      (r) => mustBeString(r['id'], 'presses_for_the_person.id'),
    )
    const parts: string[] = [
      '# The presses for the person',
      '',
      'The person may let a secretary press doors for them, under a grant. Each row is one such press that wrote',
      'something. `operation` names the door, `reason` is why the secretary pressed it, in its own words, and',
      '`grantId` names the grant. A reason is null only on a read. Every change row the press wrote names this row in',
      'its `pressId`.',
      '',
    ]
    if (sorted.length === 0) {
      parts.push(absenceLine('presses_for_the_person', omittedFromScope, 'No secretary has pressed a door for the person.'))
    } else {
      for (const row of sorted) {
        parts.push(`### ${String(row['agentId'])} — ${String(row['operation'])} — ${String(row['at'])}`)
        parts.push('')
        parts.push(fieldsBlock('presses_for_the_person', row, REGION_COLUMNS.presses_for_the_person))
        parts.push('')
      }
      parts.pop()
    }
    files.push({ path: 'presses-for-the-person.md', text: page(parts) })
  }

  // ---------------------------------------------------------------- what the person's grant carries in this office
  {
    const sorted = sortBy(rowsByRegion.get('what_the_grant_carries') ?? [], (r) => mustBeString(r['door'], 'what_the_grant_carries.door'))
    const parts: string[] = [
      '# What the grant carries',
      '',
      "The secretary card says which of the person's doors their grant never presses for them, and which it asks about",
      'first. Each row is one door the person of this office changed: `answer` is `kept`, `ask-first` or `may-press`,',
      'and the row says who changed it and when. A door with no row has the answer the card gives it.',
      '',
    ]
    if (sorted.length === 0) {
      parts.push(absenceLine('what_the_grant_carries', omittedFromScope, 'The person has changed no door, so every door has the answer the card gives it.'))
    } else {
      for (const row of sorted) {
        parts.push(`### ${String(row['door'])} — ${String(row['answer'])}`)
        parts.push('')
        parts.push(fieldsBlock('what_the_grant_carries', row, REGION_COLUMNS.what_the_grant_carries))
        parts.push('')
      }
      parts.pop()
    }
    files.push({ path: 'what-the-grant-carries.md', text: page(parts) })
  }

  // ---------------------------------------------------------------- the workspaces
  {
    const sorted = sortBy(rowsByRegion.get('workspaces') ?? [], (r) => mustBeString(r['id'], 'workspaces.id'))
    const parts: string[] = [
      '# Workspaces',
      '',
      'The project boundaries this archive holds. Every record, link, change row, anchor, presentation intent,',
      'layout and ledger row below names one of these in its `workspaceId`, and an importer must write these',
      'rows FIRST — everything else is a row filed behind one of them.',
      '',
      'A workspace is WHICH PROJECT something belongs to. It is not a user, a role or an access rule; nothing',
      'in Mole Office authenticates anybody. It is also not the same fact as a record\'s `origin`, which says how a',
      'row got here — the seeded corpus is fixture content about a real project, and a project\'s record holds',
      'fixture rows too.',
      '',
      workspaceId === undefined
        ? 'THIS IS THE WHOLE INSTALLATION, so every workspace it has is below. A restore of it restores all of them.'
        : `THIS ARCHIVE HOLDS ONE PROJECT — "${workspaceId}" — and declares only that one. The installation it came ` +
          `from may hold others; they are in their own archives, and this restore says nothing about them.`,
      '',
    ]
    if (sorted.length === 0) {
      // Only reachable for a whole-installation export of a database that has never been migrated:
      // the scoped path refuses above, and migrateInPlace declares the default workspace.
      parts.push('No workspace is declared. Every row below names a project this archive does not describe, which')
      parts.push('means the database it came from was never migrated — run `npm run db:migrate` and export again.')
    } else {
      for (const row of sorted) {
        parts.push(`### ${String(row['id'])} — ${String(row['title'])}`)
        parts.push('')
        parts.push(fieldsBlock('workspaces', row, REGION_COLUMNS.workspaces))
        parts.push('')
      }
      parts.pop()
    }
    files.push({ path: 'workspaces.md', text: page(parts) })
  }

  // ---------------------------------------------------------------- who takes part
  {
    const personRows = sortBy(rowsByRegion.get('people') ?? [], (r) => mustBeString(r['handle'], 'people.handle'))
    // AGENTS ARE ORDERED AND HEADED BY ID, people by handle. An id is the agent's identity since I-1
    // and the handle is an address that may be freed and taken again; a person has only the handle
    // and it is untouched. The handle stays inside each agent's block, so nothing is hidden.
    const agentRows = sortBy(rowsByRegion.get('agents') ?? [], (r) => mustBeString(r['id'], 'agents.id'))
    const mappingRows = sortBy(
      rowsByRegion.get('agent_records') ?? [],
      (r) => mustBeString(r['agentId'], 'agent_records.agentId'),
      (r) => mustBeString(r['recordId'], 'agent_records.recordId'),
    )
    // ONE ROW, AND IT IS ON THIS PAGE because it is what the citizens above belong to. A page of its
    // own for a single row would be a page nobody opens.
    const installationRows = rowsByRegion.get('installation') ?? []
    const parts: string[] = [
      '# Who takes part',
      '',
      'The people and the durable agents of this installation. Each has a name, a short address, a picture and',
      'a state it set itself, and a message names one of them by kind and id.',
      '',
      'NEITHER TABLE BELONGS TO A PROJECT. The owner is the same person in every project on this machine, and',
      'so is a durable agent, which is why these rows are here rather than among the records. A restore must',
      'write `assets.md` first: every row below names the picture it is drawn with.',
      '',
      '`state` IS SOMEBODY\'S OWN WORDS AND IS NEVER A READING. Whether anybody is reachable right now is',
      'worked out from what is running, is stored nowhere, and is therefore in no archive.',
      '',
      '## People',
      '',
    ]
    if (personRows.length === 0) {
      parts.push(absenceLine('people', omittedFromScope, 'No person is registered, which a migrated database cannot be.'))
    } else {
      for (const row of personRows) {
        parts.push(`### ${String(row['handle'])} — ${String(row['name'])}`)
        parts.push('')
        parts.push(fieldsBlock('people', row, REGION_COLUMNS.people))
        parts.push('')
      }
      parts.pop()
    }
    parts.push('')
    parts.push('## Durable agents')
    parts.push('')
    parts.push('`retired` MEANS NO NEW WORK AND NOTHING ELSE. A retired agent still resolves, still has whatever is')
    parts.push('waiting for it, and can be made active again, so a restore that dropped these rows would strand')
    parts.push('whatever was addressed to them.')
    parts.push('')
    if (agentRows.length === 0) {
      parts.push(absenceLine('agents', omittedFromScope, 'No durable agent is registered.'))
    } else {
      for (const row of agentRows) {
        parts.push(`### ${String(row['id'])} — ${String(row['name'])}`)
        parts.push('')
        // TWO COLUMNS ARE JSON AND THE ROW HOLDS THEM AS TEXT, so each is parsed once here, or the import
        // refuses the archive as it did on 8 September 2026 for `cardChosenBy` (tests/the-card-mark-survives-the-archive.test.ts).
        parts.push(fieldsBlock('agents', {
          ...row,
          workArea: typeof row['workArea'] === 'string' ? JSON.parse(row['workArea']) as unknown : row['workArea'],
          cardChosenBy: typeof row['cardChosenBy'] === 'string' ? JSON.parse(row['cardChosenBy']) as unknown : row['cardChosenBy'],
        }, REGION_COLUMNS.agents))
        parts.push('')
      }
      parts.pop()
    }
    parts.push('')
    parts.push('## Which record is which agent')
    parts.push('')
    parts.push('One row per record of kind `agent`, saying which registry row that record is. The records are kept')
    parts.push('and linked, never replaced: an inbox, a conversation and a work domain all still point at the')
    parts.push('record. A row here names a record that IS in a project and an agent that is in none, so it travels')
    parts.push('with the registry rather than with the record: only the whole-installation archive carries it.')
    parts.push('')
    if (mappingRows.length === 0) {
      parts.push(
        absenceLine(
          'agent_records',
          omittedFromScope,
          'No record of kind `agent` is mapped, which is what a database with no such record holds.',
        ),
      )
    } else {
      for (const row of mappingRows) {
        parts.push(`### ${String(row['recordId'])} is ${String(row['agentId'])}`)
        parts.push('')
        parts.push(fieldsBlock('agent_records', row, REGION_COLUMNS.agent_records))
        parts.push('')
      }
      parts.pop()
    }
    parts.push('')
    parts.push('## Which installation this is')
    parts.push('')
    parts.push('One row, saying which installation the citizens above belong to. An installation is one person\'s')
    parts.push('Mole Office on one machine: the canonical database, every worktree of it, and every world any of')
    parts.push('them starts. Every world the office lists says which installation it belongs to, so two offices')
    parts.push('could be told apart if they ever have to talk to each other.')
    parts.push('')
    parts.push('IT IS CARRIED BECAUSE NOTHING CAN REBUILD IT. The id was worked out from the declaration on the day')
    parts.push('this database was first migrated. Working it out again on a restore would answer about the')
    parts.push('declaration of whatever machine the restore happens on, which is a different fact under the same')
    parts.push('name — and every citizen above would then belong to an installation they were never registered in.')
    parts.push('')
    if (installationRows.length === 0) {
      parts.push(
        absenceLine(
          'installation',
          omittedFromScope,
          'Nothing says which installation this database belongs to, which a migrated database cannot be.',
        ),
      )
    } else {
      for (const row of installationRows) {
        parts.push(`### ${String(row['id'])}`)
        parts.push('')
        parts.push(fieldsBlock('installation', row, REGION_COLUMNS.installation))
        parts.push('')
      }
      parts.pop()
    }
    parts.push('', '## Whether the reading-measure words carry their new names', '')
    parts.push('One row once the stored words were renamed, and no row before that. On 11 September 2026 the preset')
    parts.push('word `readable` was renamed narrow, so the old `narrow` became `narrowest` and the')
    parts.push('old `readable` became `narrow`. The migration reads this row to decide whether to rename the words.')
    const measureWordRows = rowsByRegion.get('measure_words_renamed') ?? []
    parts.push('')
    if (measureWordRows.length === 0) {
      parts.push(
        absenceLine(
          'measure_words_renamed',
          omittedFromScope,
          'No row. The stored words have not been renamed, so the next migration renames them.',
        ),
      )
    }
    for (const row of measureWordRows) {
      parts.push(fieldsBlock('measure_words_renamed', row, REGION_COLUMNS.measure_words_renamed), '')
    }
    parts.push('', '## Pixel office scene', '')
    const sceneRows = rowsByRegion.get('office_scene_settings') ?? []
    if (sceneRows.length === 0) parts.push(absenceLine('office_scene_settings', omittedFromScope, 'Nobody has saved shared pixel office scene settings.'))
    for (const row of sceneRows) {
      parts.push(fieldsBlock('office_scene_settings', row, REGION_COLUMNS.office_scene_settings), '')
    }
    parts.push('', '## Saved office map assignments', '')
    const layoutRows = rowsByRegion.get('office_map_layouts') ?? []
    if (layoutRows.length === 0) parts.push(absenceLine('office_map_layouts', omittedFromScope, 'No stable office map assignments have been saved.'))
    for (const row of sortBy(layoutRows, row => mustBeString(row['configurationKey'], 'office_map_layouts.configurationKey'))) {
      parts.push(fieldsBlock('office_map_layouts', row, REGION_COLUMNS.office_map_layouts), '')
    }
    parts.push('', '## The model each run uses', '')
    const runModelRows = rowsByRegion.get('run_models') ?? []
    if (runModelRows.length === 0) {
      parts.push(absenceLine('run_models', omittedFromScope, 'Nobody has set a model on the Settings page.'))
    }
    for (const row of runModelRows) {
      parts.push(fieldsBlock('run_models', row, REGION_COLUMNS.run_models), '')
    }
    parts.push('', '## The Casting table', '')
    const castingRowRows = rowsByRegion.get('casting_rows') ?? []
    if (castingRowRows.length === 0) parts.push(absenceLine('casting_rows', omittedFromScope, 'Nobody has cast any role.'))
    for (const row of castingRowRows) {
      parts.push(fieldsBlock('casting_rows', row, REGION_COLUMNS.casting_rows), '')
    }
    parts.push('', '## Changes to the Casting table', '')
    const castingRowChangeRows = rowsByRegion.get('casting_row_changes') ?? []
    if (castingRowChangeRows.length === 0) parts.push(absenceLine('casting_row_changes', omittedFromScope, 'The Casting table has never been changed.'))
    for (const row of castingRowChangeRows) {
      parts.push(fieldsBlock('casting_row_changes', row, REGION_COLUMNS.casting_row_changes), '')
    }
    parts.push('', '## The Casting labels', '')
    const castingLabelRows = rowsByRegion.get('casting_labels') ?? []
    if (castingLabelRows.length === 0) parts.push(absenceLine('casting_labels', omittedFromScope, 'Nobody has made a Casting label.'))
    for (const row of castingLabelRows) {
      parts.push(fieldsBlock('casting_labels', row, REGION_COLUMNS.casting_labels), '')
    }
    parts.push('', '## Changes to the Casting labels', '')
    const castingLabelChangeRows = rowsByRegion.get('casting_label_changes') ?? []
    if (castingLabelChangeRows.length === 0) parts.push(absenceLine('casting_label_changes', omittedFromScope, 'The Casting labels have never been changed.'))
    for (const row of castingLabelChangeRows) {
      parts.push(fieldsBlock('casting_label_changes', row, REGION_COLUMNS.casting_label_changes), '')
    }
    // THE TABLE AS MIGRATION 0189 LEFT IT, kept and no longer read: migration 0190 copied every row above.
    parts.push('', '## The Casting table before migration 0190, kept as it was', '')
    const castingRows = rowsByRegion.get('casting') ?? []
    if (castingRows.length === 0) parts.push(absenceLine('casting', omittedFromScope, 'It held no row.'))
    for (const row of castingRows) {
      parts.push(fieldsBlock('casting', row, REGION_COLUMNS.casting), '')
    }
    parts.push('', '## Changes to the Casting table before migration 0190, kept as they were', '')
    const castingChangeRows = rowsByRegion.get('casting_changes') ?? []
    if (castingChangeRows.length === 0) parts.push(absenceLine('casting_changes', omittedFromScope, 'It held no row.'))
    for (const row of castingChangeRows) {
      parts.push(fieldsBlock('casting_changes', row, REGION_COLUMNS.casting_changes), '')
    }
    parts.push('', '## Directories a preview may read, added by hand', '')
    const previewRootRows = rowsByRegion.get('preview_root_additions') ?? []
    if (previewRootRows.length === 0) {
      parts.push(
        absenceLine('preview_root_additions', omittedFromScope, 'Nobody has added a directory by hand as a preview root.'),
      )
    }
    for (const row of previewRootRows) {
      parts.push(fieldsBlock('preview_root_additions', row, REGION_COLUMNS.preview_root_additions), '')
    }
    parts.push('', '## The price table', '')
    const priceTableRows = rowsByRegion.get('price_table') ?? []
    if (priceTableRows.length === 0) {
      parts.push(absenceLine('price_table', omittedFromScope, 'Nobody has set a price table.'))
    }
    for (const row of priceTableRows) {
      parts.push(fieldsBlock('price_table', row, REGION_COLUMNS.price_table), '')
    }
    files.push({ path: 'participants.md', text: page(parts) })
  }

  // ---------------------------------------------------------------- the worlds
  {
    const worldRows = sortBy(
      rowsByRegion.get('worlds') ?? [],
      (r) => mustBeString(r['bornAt'], 'worlds.bornAt'),
      // AND THEN THE ID, because two worlds born in the same second are ordinary — a suite starts
      // several at once — and a sort with no tie-break puts them in whatever order the rows came
      // back in, which makes an archive of one database differ from an archive of its restore.
      (r) => mustBeString(r['id'], 'worlds.id'),
    )
    const visitRows = sortBy(
      rowsByRegion.get('visits') ?? [],
      (r) => mustBeString(r['since'], 'visits.since'),
      (r) => mustBeString(r['id'], 'visits.id'),
    )
    const parts: string[] = [
      '# Worlds',
      '',
      'Every world this installation has had, alive and dead. A world is one running Mole Office with one',
      'database, and the identity of a world is the identity of that database — not its address, which a',
      'machine takes back when a process ends, and not its name, which a person may change.',
      '',
      'THIS TABLE BELONGS TO NO PROJECT, because a world holds every project it has. Only the',
      'whole-installation archive carries it.',
      '',
      'A ROW WITH `diedAt` FILLED IN IS NOT A ROW TO DROP. The person\'s words ask for a world appearing AND a world',
      'disappearing to be recorded, so the history is the content: a restore that kept only the live worlds',
      'would keep the least interesting half.',
      '',
    ]
    if (worldRows.length === 0) {
      parts.push(
        absenceLine(
          'worlds',
          omittedFromScope,
          'No world has registered, which is what a database no server has ever started against holds.',
        ),
      )
    } else {
      for (const row of worldRows) {
        parts.push(`### ${String(row['name'])} — ${String(row['databaseIdentity'])}`)
        parts.push('')
        parts.push(fieldsBlock('worlds', row, REGION_COLUMNS.worlds))
        parts.push('')
      }
      parts.pop()
    }
    parts.push('')
    for (const region of ['runtime_settings', 'office_restart_grants'] as const) {
      parts.push(`## ${region === 'runtime_settings' ? 'The office runtime choices' : 'Permission to restart or pause the office'}`, '')
      const rows = rowsByRegion.get(region) ?? []
      if (rows.length === 0) parts.push(absenceLine(region, omittedFromScope, 'It held no row.'))
      for (const row of rows) parts.push(fieldsBlock(region, row, REGION_COLUMNS[region]), '')
    }

    parts.push('## Visits')
    parts.push('')
    parts.push('A visit is a citizen of one world working in another, with what they came to do in their own')
    parts.push('words. A visit whose `registeredAt` is later than its `since` began before the office heard about')
    parts.push('it, because the main world was not answering when it started; there is no column for that, only')
    parts.push('the two stamps.')
    parts.push('')
    if (visitRows.length === 0) {
      parts.push(
        absenceLine(
          'visits',
          omittedFromScope,
          'Nobody has worked away from home, which is what a database no other world has reached holds.',
        ),
      )
    } else {
      for (const row of visitRows) {
        parts.push(`### ${String(row['visitorKind'])} ${String(row['visitorId'])} — ${String(row['since'])}`)
        parts.push('')
        parts.push(fieldsBlock('visits', row, REGION_COLUMNS.visits))
        parts.push('')
      }
      parts.pop()
    }

    /**
     * AND THE VISITING AGENTS, on the same page, because they are the same desk.
     *
     * A visiting agent is an agent on another machine, before that machine runs a world of its own.
     * Criteria P24 to P30. It belongs to no project for the same reason a world does not: an agent
     * that visits does not visit one project.
     *
     * `tokenHash` holds the same removal mark as a backup, followed by the row's id. The visitor
     * pairs again after an import.
     */
    const credentialRows = sortBy(
      rowsByRegion.get('visitor_credentials') ?? [],
      (r) => mustBeString(r['issuedAt'], 'visitor_credentials.issuedAt'),
      (r) => mustBeString(r['id'], 'visitor_credentials.id'),
    )
    const requestRows = sortBy(
      rowsByRegion.get('visitor_requests') ?? [],
      (r) => mustBeString(r['at'], 'visitor_requests.at'),
      (r) => mustBeString(r['id'], 'visitor_requests.id'),
    )
    parts.push('')
    parts.push('## Visiting agents')
    parts.push('')
    parts.push('An agent on another machine, before that machine runs a world of its own, holds a credential of')
    parts.push('its own. The credential records the facts of the run it was issued to, so a token found by')
    parts.push('somebody else can be told from the run it belongs to. This archive replaces each token hash with')
    parts.push('a removal mark and the credential’s id, as a backup does. After an import, the visitor pairs again.')
    parts.push('')
    if (credentialRows.length === 0) {
      parts.push(
        absenceLine(
          'visitor_credentials',
          omittedFromScope,
          'No agent from another machine has asked for a credential, which is what a database only this computer ' +
            'has reached holds.',
        ),
      )
    } else {
      for (const row of credentialRows) {
        parts.push(`### ${String(row['name'])} — ${String(row['handle'])}`)
        parts.push('')
        parts.push(fieldsBlock('visitor_credentials', row, REGION_COLUMNS.visitor_credentials))
        parts.push('')
      }
      parts.pop()
    }
    parts.push('')
    parts.push('## What was asked under a credential')
    parts.push('')
    parts.push('One row per request. `mismatch` holds the facts that did not match the ones the credential was')
    parts.push('issued with, each naming the fact, what was issued and what was sent. These rows are what a')
    parts.push('request count, a write count and a mismatch count are counted from, so an archive that dropped')
    parts.push('them would restore a credential with nothing to look at.')
    parts.push('')
    if (requestRows.length === 0) {
      parts.push(
        absenceLine(
          'visitor_requests',
          omittedFromScope,
          'Nothing has been asked under a credential, which is what a database that has issued none holds.',
        ),
      )
    } else {
      for (const row of requestRows) {
        parts.push(`### ${String(row['method'])} ${String(row['route'])} — ${String(row['at'])}`)
        parts.push('')
        parts.push(fieldsBlock('visitor_requests', row, REGION_COLUMNS.visitor_requests))
        parts.push('')
      }
      parts.pop()
    }

    /**
     * AND THE MACHINES THIS OFFICE TRUSTS. Criterion P73.
     *
     * On the worlds page because that is where the list is SET — it was decided that the machines this
     * office trusts belong to the installation rather than to a person's preferences — and beside the
     * credentials because confirming one is what adds a machine.
     */
    const trustedRows = sortBy(
      rowsByRegion.get('trusted_machines') ?? [],
      (r) => mustBeString(r['addedAt'], 'trusted_machines.addedAt'),
      (r) => mustBeString(r['id'], 'trusted_machines.id'),
    )
    parts.push('')
    parts.push('## Machines this office trusts')
    parts.push('')
    parts.push('Which machines an office trusts is a fact about the whole installation: a machine is not trusted')
    parts.push('for one project and refused for another. `how` says where each row came from — a press at the')
    parts.push('world’s page, the confirmation of a visiting agent, or the environment, which is the address the')
    parts.push('server was started to answer on. A row is never deleted: `removedAt` and `removedBecause` say')
    parts.push('when somebody stopped trusting a machine and why, so the record of who was once let in survives.')
    parts.push('')
    if (trustedRows.length === 0) {
      parts.push(
        absenceLine(
          'trusted_machines',
          omittedFromScope,
          'This office trusts no machine, which is what a database nothing but this computer has reached holds.',
        ),
      )
    } else {
      for (const row of trustedRows) {
        parts.push(`### ${String(row['address'])}`)
        parts.push('')
        parts.push(fieldsBlock('trusted_machines', row, REGION_COLUMNS.trusted_machines))
        parts.push('')
      }
      parts.pop()
    }
    files.push({ path: 'worlds.md', text: page(parts) })
  }

  // ---------------------------------------------------------------- the pictures
  {
    const assetRows = sortBy(rowsByRegion.get('assets') ?? [], (r) => mustBeString(r['id'], 'assets.id'))
    const parts: string[] = [
      '# Pictures',
      '',
      'Every picture this installation holds, and where each one came from. Today they are all avatars.',
      '',
      'WHAT AN IMPORTER GETS AND WHAT IT DOES NOT. These are ROWS, not files. A row whose `origin` is',
      '`default` needs no file at all: the picture is drawn, the same drawing every time, from the',
      '`drawnFrom` digest when the row holds one, and from the participant its key names when `drawnFrom`',
      'is null. `licenceSource` on the row says this product made it. A row whose `origin` is',
      '`uploaded` names a file under `path`, relative to the data directory, AND THAT FILE IS NOT IN THIS',
      'ARCHIVE. Nothing in `data/` is carried here and nothing in `data/` is in the repository.',
      '',
      'SO A RESTORE OF AN UPLOADED PICTURE IS INCOMPLETE UNTIL SOMEBODY BRINGS THE FILE. The row is restored,',
      'the participant still points at it, and the page will say the file is missing rather than drawing',
      'something else in its place. That is the honest half of a bargain this format cannot avoid: the bytes',
      'are somebody\'s own picture, held outside a repository on purpose.',
      '',
      '`licenceSource` IS EMPTY FOR AN UPLOAD AND THAT IS AN ANSWER. Nobody asked the person who uploaded it',
      'where the right to use it comes from, and this product will not invent one.',
      '',
    ]
    if (assetRows.length === 0) {
      parts.push(absenceLine('assets', omittedFromScope, 'No picture is stored, which a migrated database cannot be.'))
    } else {
      for (const row of assetRows) {
        parts.push(`### ${String(row['id'])} — ${String(row['origin'])}`)
        parts.push('')
        parts.push(fieldsBlock('assets', row, REGION_COLUMNS.assets))
        parts.push('')
      }
      parts.pop()
    }
    files.push({ path: 'pictures.md', text: page(parts) })
  }

  // The manifest counts these rows; the archive must carry their exact identifiers and bytes.
  {
    // `submission_events` WAS THE FIRST OF THREE HERE AND IS GONE, dropped by migration 0154. It
    // copied every revision, change and link row the database already held; a seal names them now.
    const parts = ['# Submitted evidence', '', 'Run baselines and the preserved legacy inventory.', '']
    for (const region of ['submission_baselines', 'legacy_unsealed_runs'] as const) {
      const rows = [...(rowsByRegion.get(region) ?? [])].sort((a, b) => {
        const left = String(a['runId']), right = String(b['runId']); return left < right ? -1 : left > right ? 1 : 0
      })
      parts.push('## ' + region, '')
      if (!rows.length) parts.push(absenceLine(region, omittedFromScope, 'No rows of this evidence are recorded.'))
      for (const row of rows) parts.push(fieldsBlock(region, row, REGION_COLUMNS[region]), '')
    }
    files.push({ path: 'submissions.md', text: page(parts) })
  }

  // ---------------------------------------------------------------- the tables declared in a schema part
  //
  // ONE PAGE FOR EACH, written from the table's own columns, so a line that adds a table adds no page
  // here. The importer reads a block by the region it names, whichever page it is on.
  for (const region of EXPORTED_REGIONS) {
    if (!isPartRegion(region)) continue
    const part = partTableOf(region)
    const fields = columnsOf(region).fields
    const rows = [...(rowsByRegion.get(region) ?? [])].sort((a, b) => byEveryColumn(a, b, fields))
    const parts: string[] = [`# ${region}`, '', `A table declared in ${part.part}, as \`${part.binding}\`. Every row, one block each.`, '']
    if (part.workspaceColumn === null) {
      const carries = region === aliasClosure?.region ? `${aliasClosure.said.join('. ')}.` : 'Only the whole-installation archive carries it.'
      parts.push(`THIS TABLE BELONGS TO NO PROJECT. ${whyARegionBelongsToNoProject(region)}. ${carries}`, '')
    }
    if (rows.length === 0) parts.push(absenceLine(region, omittedFromScope, 'It held no row.'))
    for (const row of rows) parts.push(fieldsBlock(region, row, fields), '')
    files.push({ path: `schema-parts/${region}.md`, text: page(parts) })
  }

  if (carriesHistoryBytes) {
    // The capture reads the stored text by id, so it is given the ids of the three ledgers' rows. It reads one row at a
    // time and gives one page at a time, and a page is handed on before the next is made. Nothing here reads the
    // database again until the last page is taken, because the capture is still reading it.
    const ledgers = (['records', 'revisions', 'changes'] as const).map((region) => [region, [...rowsOf(region, ['id'])]] as const)
    let n = 0
    for (const envelope of historyBytesPages(sqlite, ledgers)) {
      n += 1
      files.push({path:historyBytesPage(n),text:page(['# Original historical JSON bytes','',jsonBlock('history_bytes',envelope)])})
    }
  }

  // ---------------------------------------------------------------- the manifest
  const counts: Record<string, number> = {}
  for (const region of EXPORTED_REGIONS) {
    const n = rowsByRegion.get(region)?.length ?? countedOneAtATime.get(region)
    if (n === undefined) throw new ExportError(`The export read the ${region} rows one at a time and did not count them, so the manifest cannot say how many there are.`)
    counts[region] = n
  }
  const migrations = readMigrations()
  if (migrations.note !== null) notes.push(migrations.note)
  const leftBehind = draftsLeftBehind()
  if (leftBehind !== null) notes.push(leftBehind)

  const manifestRow: Row = {
    format: FORMAT_VERSION,
    registryAliases: REGISTRY_ALIAS_ARCHIVE_VERSION,
    ...(carriesHistoryBytes ? {historyBytes:HISTORY_BYTES_VERSION} : {}),
    // WHICH ARCHIVE THIS IS, on the line the importer reads first. `null` is the whole
    // installation and a name is one project; the two are the same shape and restore into
    // different states, so the difference is stated rather than inferred from a row count.
    workspace: workspaceId ?? null,
    ...counts,
    recordFiles,
    changeFiles,
  }
  {
    const parts: string[] = [
      '# Manifest',
      '',
      'THE IMPORTER READS THIS TO VERIFY AND NEVER TO POPULATE. It counts what it actually read out of the',
      'files below and compares against these numbers; a mismatch is a refusal naming both. A manifest that',
      'was trusted instead of checked would let a truncated export import as a complete one.',
      '',
      fieldsBlock('manifest', manifestRow, [
        'format',
        'registryAliases',
        ...(carriesHistoryBytes ? ['historyBytes'] : []),
        'workspace',
        ...EXPORTED_REGIONS.map((r) => String(r)),
        'recordFiles',
        'changeFiles',
      ]),
      '',
      '## Tables that are deliberately absent',
      '',
      `${DERIVED_TABLES.join(', ')} — the derived layer. Every row of it is replaced wholesale by the next`,
      'scan, so a restored copy would describe the files of whichever machine the export came from. Rebuild',
      'it with `POST /api/source/reindex`.',
      '',
      `${MEASURED_TABLES.join(', ')} — what Mole Office measured of itself while it answered requests.`,
      'NOBODY WROTE THOSE ROWS AND NOTHING CAN REBUILD THEM, so a restore does not bring them back and there is',
      'no command that would. They are measurements of the machine this came from, which is not what this',
      'archive is about.',
      '',
      `${LEFT_OUT_OF_BACKUPS_AND_EXPORTS.join(', ')} — where a reader once arranged the panels of a page. Nothing has`,
      'written it since the panel grid was deleted on 10 August 2026, and since 29 September 2026 it is left',
      'out of every backup and export. The table is still in the database;',
      'its rows are not in this archive, and an import writes none.',
      '',
      ...partTablesNoArchiveCarries().flatMap((table) => [`${table.name} — ${table.sentence}`, '']),
      // THE COUNTS ABOVE ARE OF THIS ARCHIVE AND ARE CORRECT AT 0 — the importer verifies what it
      // read against them, so they must stay a count of the files. That is exactly why this section
      // exists: without it, four lines of `planning_drafts: 0` in a project archive read as a
      // statement about the database, and the database may hold forty.
      ...(omittedFromScope.size === 0
        ? []
        : [
            `${[...omittedFromScope.keys()].join(', ')} — the tables that belong to no`,
            'project, so no project archive can carry them. THE ZEROES ABOVE ARE COUNTS OF THIS ARCHIVE AND NOT OF',
            'THE DATABASE, which holds ' +
              `${[...omittedFromScope].map(([region, n]) => `${n} ${region}`).join(', ')}.`,
            'The whole-installation export is the one that carries them.',
            '',
          ]),
      '`__drizzle_migrations` — drizzle\'s own bookkeeping. A restore applies the migrations, which writes it,',
      'and then imports the data. Which migrations this database had is recorded below instead.',
      '',
      '## Migrations applied to the database this came from',
      '',
      'An importer that finds a migration here which the target database does not have should refuse: the',
      'export was taken from a newer schema, and importing it into an older one loses columns silently.',
      '',
    ]
    if (migrations.rows.length === 0) {
      parts.push('No migration is recorded. That database had no journal, which should not happen.')
    } else {
      for (const row of migrations.rows) {
        parts.push(fieldsBlock('migrations', row as unknown as Row, ['hash', 'when', 'tag']))
        parts.push('')
      }
      parts.pop()
    }
    files.push({ path: 'MANIFEST.md', text: page(parts) })
  }

  // ---------------------------------------------------------------- the two reading aids
  files.push({ path: 'INDEX.md', text: indexPage(recordRows, kindOf) })
  files.push({ path: 'README.md', text: readmePage(counts) })

  return { format: FORMAT_VERSION, files: fileCount, bytes, counts, notes, workspace: workspaceId ?? null }
}

/**
 * How this row's `origin` should be printed in prose, and whether it is a word Mole Office knows.
 *
 * THREE ANSWERS AND NOT TWO. A stored word outside RECORD_ORIGINS is shown as what it is rather
 * than folded in with "nobody said": something wrote it on purpose, and an archive that quietly
 * reported it as absent would hide the one case where a person has to go and look.
 */
function originPhrase(value: unknown): { text: string; unreadable: string | null } {
  const known = readOrigin(value)
  if (known !== null) return { text: `origin \`${known}\``, unreadable: null }
  if (typeof value === 'string' && value.trim() !== '') {
    return {
      text: `**origin \`${value}\`, which is not one of ${RECORD_ORIGINS.join(' or ')}** — Mole Office reads it as unrecorded`,
      unreadable: value,
    }
  }
  // Not `authored`, and the whole point of the field. See `unstampedOriginNote` in shared/types.ts.
  return { text: `**no origin recorded** — ${unstampedOriginNote()}`, unreadable: null }
}

/** The line under a record's title that says what it is without opening anything else. */
function identityLine(row: Row, kind: string): string {
  const id = String(row['id'])
  const deleted = row['deletedAt']
  const bits = [
    `${kind} · id \`${id}\``,
    `created ${String(row['createdAt'])}`,
    `owner ${String(row['ownerId'])}`,
    // WHY PROVENANCE IS ON THE FIRST LINE OF EVERY RECORD FILE. This archive is meant to be read by
    // a person with an editor and no Mole Office, and the measurement that produced the field found that
    // such a reader — and two separate agents — could not tell this project's own development record
    // from fixture content written to give a layout something to draw. A mark stored in the
    // database and absent from the text would leave the archive in that state for ever.
    originPhrase(row['origin']).text,
  ]
  if (typeof deleted === 'string') {
    // A soft-deleted record is not an absence in Mole Office: links into it show as broken rather than
    // vanishing, and the change rows in changes/ are what make it recoverable. So the file says so
    // at the top rather than leaving it to a null further down.
    bits.push(`**deleted ${deleted}** — soft, so it is still here and still linkable`)
  }
  return bits.join(' · ')
}

/** The date part of a stamp, or `undated` when it is not a stamp Mole Office would have written. */
function dayOf(at: string): string {
  return /^\d{4}-\d{2}-\d{2}/.test(at.trim()) ? at.trim().slice(0, 10) : 'undated'
}

/**
 * Refuse an id that could escape the export root.
 *
 * This is a path guard and not a data judgement, so it stops the whole export rather than
 * reporting and continuing. Ids are nanoids, so nothing reachable through the product can trip it
 * — a direct database write can, and that is exactly when a backup must not start writing files
 * wherever it is told. It guarded a hand-written panel_layouts.id until no export carried that
 * table; it still guards every other id this export turns into a file name.
 */
function assertSafeFileName(value: string, what: string): void {
  if (value === '' || value.includes('/') || value.includes('\\') || value.includes('..') || value.includes(sep)) {
    throw new ExportError(
      `${what} is ${JSON.stringify(value)}, which cannot be a file name — it would write outside the export. ` +
        `The export stopped rather than guessing at a safe spelling.`,
    )
  }
}

/**
 * What a person-level page says where it would otherwise claim there is nothing.
 *
 * THE THREE SENTENCES THIS REPLACES WERE FALSE IN EVERY PROJECT-SCOPED ARCHIVE. `plan.md` said
 * "Nothing is planned. No time has been committed to anything", `drafts.md` said "Nothing has been
 * drafted" and `recurring.md` said "Nothing recurs" — because a scoped read of a table with no
 * workspace column returns no rows, and each page then printed its empty branch. The same archive's
 * `plan.md` claimed, two paragraphs above, that a project-scoped archive "carries none of this and
 * says so in its notes". It did not say so; the notes named two of the four tables and only when
 * one of them had rows, and the notes are the export REPORT rather than anything in the directory.
 *
 * `whenReallyEmpty` is the page's own sentence and is still the right one for a whole-installation
 * archive, where "no rows here" and "no rows anywhere" are the same statement.
 */
function absenceLine(
  region: AuthoredRegion,
  omittedFromScope: ReadonlyMap<AuthoredRegion, number>,
  whenReallyEmpty: string,
): string {
  const held = omittedFromScope.get(region)
  if (held === undefined) return whenReallyEmpty
  return [
    `THIS IS ONE PROJECT'S ARCHIVE, so it carries no \`${region}\` rows AT ALL.`,
    `${whyARegionBelongsToNoProject(region)}, so there is no project whose archive these would be. The database`,
    `this was taken from holds ${held} of them and they are in NO project's archive; the whole-installation`,
    'export is the one that carries them.',
    '',
    'SO THIS PAGE IS NOT EVIDENCE THAT THERE IS NOTHING TO FIND. It is evidence that you are holding the',
    'wrong archive to find out.',
  ].join('\n')
}

/** Join the parts of a page, with exactly one trailing newline. */
function page(parts: readonly string[]): string {
  return `${parts.join('\n').replace(/\n+$/, '')}\n`
}

/** The reading aid that makes id-named files findable by name. Never data. */
function indexPage(recordRows: readonly Row[], kindOf: ReadonlyMap<string, string>): string {
  const rows = sortBy(
    [...recordRows],
    (r) => String(r['kind']),
    (r) => String(r['title']),
    (r) => String(r['id']),
  )
  const parts: string[] = [
    '# Every record, by name',
    '',
    'A READING AID, NOT DATA. An importer must ignore this file: everything in it is already in the record',
    'files, and a restore that deleted this before importing must produce exactly the same database. It',
    'exists because record files are named by id — ids never move, titles do — so this is how a person who',
    'knows a name finds a file.',
    '',
    `${rows.length} record${rows.length === 1 ? '' : 's'}, including any that are soft-deleted.`,
    '',
    // THE COLUMN THAT MAKES THIS LIST HONEST. Without it a reader scanning names cannot tell the
    // project's own record from fixture content, which is precisely the finding decision 17 answers.
    '`origin` says how the row got here and NOT whether its content is true — see README.md.',
    '',
    '| kind | title | id | origin | file |',
    '| --- | --- | --- | --- | --- |',
  ]
  for (const row of rows) {
    const id = String(row['id'])
    const kind = kindOf.get(id) ?? String(row['kind'])
    const folder = (RECORD_KINDS as readonly string[]).includes(kind) ? kind : '_unrecognised'
    // A pipe inside a title would break the table row, so it is shown escaped. This is prose; the
    // title as stored is in the record file's front matter, exactly as written.
    const title = String(row['title']).replaceAll('|', '\\|')
    const deleted = row['deletedAt'] === null ? '' : ' *(deleted)*'
    const stored = row['origin']
    const origin =
      readOrigin(stored) ??
      (typeof stored === 'string' && stored.trim() !== ''
        ? `\`${stored.replaceAll('|', '\\|')}\` (not a word Mole Office knows)`
        : 'not recorded')
    parts.push(`| ${kind} | ${title}${deleted} | \`${id}\` | ${origin} | records/${folder}/${id}.md |`)
  }
  return page(parts)
}

/** The front door of the export. Prose only, regenerated every run, never read by an importer. */
function readmePage(counts: Readonly<Record<string, number>>): string {
  const parts: string[] = [
    '# Mole Office, written out as text',
    '',
    `Format \`${FORMAT_VERSION}\`. The contract this obeys is \`design/durability/FORMAT.md\` in the Mole Office`,
    'repository, and that document is the authority — this page is the short version for whoever opens the',
    'directory first.',
    '',
    'Everything Mole Office knows is in here, in Markdown, in UTF-8. You need no database and no server to read',
    'it. If Mole Office is gone, this is still an archive.',
    '',
    '## What is here',
    '',
    '| | |',
    '| --- | --- |',
    ...EXPORTED_REGIONS.map((region) => `| \`${region}\` | ${counts[region] ?? 0} rows |`),
    '',
    '- `records/<kind>/<id>.md` — one file per record, soft-deleted ones included. A record is named by its',
    '  id because ids never move and titles do; `INDEX.md` is how you find one by name.',
    '- `changes/<date>.md` — the change log, one file per day. Append-only history.',
    '- `conversations/<id>.md` — one file per conversation with an agent, holding everything said in it.',
    '- `runs/<id>.md` — one file per attempt to answer one, with what the worker was asked and what came back.',
    "- `folder-readings/<id>.md` — one file per reading of somebody else's folder, with what an agent proposed and",
    '  what a person decided about each piece. `folder-readings.md` lists them.',
    '- `presentation.md`, `anchors.md`, `resources.md` — three smaller authored tables.',
    '- `reviews.md` — who started collecting remarks, from where, and what was in each collection when they',
    '  finished. The remarks themselves are records, under `records/`.',
    '- `MANIFEST.md` — the format version, the row counts and the migrations. An importer checks it.',
    '- `INDEX.md` and this file are reading aids. An importer ignores both.',
    '',
    '## How each record got here, and what that does NOT claim',
    '',
    'Every record carries `origin`, on the first line of its file and in its front matter. It answers one',
    'question and only one: did this row enter the corpus through the generated fixture, or was it filed as a',
    'record of real work.',
    '',
    '| | |',
    '| --- | --- |',
    ...RECORD_ORIGINS.map((origin) => `| \`${origin}\` | ${ORIGIN_MEANINGS[origin]} |`),
    `| absent | ${unstampedOriginNote()}. It is written as \`origin: null\` and read back as null. **It is not \`authored\`** — that would turn the absence of a judgement into a judgement, in the direction that makes fixture content read as real. |`,
    '',
    '`fixture` IS NOT A CLAIM THAT THE CONTENT IS FALSE. Much of it paraphrases real notes from this lab and',
    'some of it is written more carefully than the records beside it. It is a claim about the path in, which the',
    'writer knows at the moment of writing — which is why it can be stored honestly and why nothing infers it',
    'afterwards from a title, a date or a kind. What it does mean is that the row is not part of the project',
    'record and must never be quoted as an observation.',
    '',
    '## What is deliberately NOT here',
    '',
    `- The derived layer (${DERIVED_TABLES.join(', ')}). It is rebuilt by a scan, and a restored copy would`,
    '  describe the files of whichever machine this came from.',
    `- What Mole Office measured of itself (${MEASURED_TABLES.join(', ')}). Nobody wrote those`,
    '  rows and no scan can rebuild them, so a restore does not bring them back and nothing can. They are',
    '  measurements of one machine answering requests, and an archive carrying them would be describing that',
    '  machine rather than this project.',
    `- ${LEFT_OUT_OF_BACKUPS_AND_EXPORTS.map((table) => `\`${table}\``).join(', ')}, where a reader once arranged the panels of a page. Nothing has`,
    '  written it since the panel grid was deleted on 10 August 2026, and since 29 September 2026 it is left',
    '  out of every backup and export. The table is still in the database.',
    ...partTablesNoArchiveCarries().map((table) => `- \`${table.name}\`, ${table.sentence}`),
    '- `pgid` and `osStartedAt` on every resource-ledger row. Those are facts about one machine at one',
    '  moment. The ledger here says what happened; what is alive now is answered by scanning.',
    '- Anything about the machine this was written on: no paths, no host name, no user name, and no record',
    '  of when the export ran. The git commit carries that, which is where it belongs.',
    '',
    '## Reading the files',
    '',
    'Exactly two things in any file carry data. Everything else is prose written for you, and the next',
    'export overwrites it.',
    '',
    '1. Front matter — the block between the first `---` and the next — on record and layout files.',
    '2. Fenced blocks whose language is `mole-office` or `json mole-office`.',
    '',
    'Inside those, every line is `key: <one JSON value>`, or the block is one JSON document. A key is always',
    'a stored column. Titles and headings beside an id are there so you can follow it; they are not data.',
    '',
    '## If you edit these by hand',
    '',
    '- Edit inside a data region. A heading or a sentence you add will be overwritten.',
    '- Do not renumber ids. An id is the identity of a row and four other tables point at it. A title is',
    '  how a person names a record and how a link is typed by hand; it is not the identity.',
    '- Do not edit `changes/`. It is history, and an importer should refuse a rewritten past.',
    '',
    '## Restoring',
    '',
    'Apply the migrations to an empty database, then import. The order is forced by a foreign key:',
    'records, then links, then changes, then anchors. Everything else can follow.',
  ]
  return page(parts)
}

// ============================================================================ writing to disk

/**
 * Write the export to `root`, and remove files this export no longer produces.
 *
 * ONLY FILES THAT CHANGED ARE WRITTEN. That is not an optimisation: the returned list of written
 * paths is what the mirror's commit message is built from, and rewriting an identical file would
 * report a change nobody made.
 *
 * PRUNING IS BOUNDED to `records/`, `changes/`, `layouts/` and the four top-level files this
 * export owns. A stale file left behind is a row that comes back from the dead on the next import
 * — a deleted layout, a cleared presentation scope — so it has to go. Anything else under the root
 * is somebody's, including `.git/`, and is never touched.
 */
export function writeExport(root: string = exportRoot(), opts: { workspaceId?: string } = {}): ExportReport {
  return inOneReading(() => writeEachFile(root, opts))
}

/**
 * `writeExport` inside its one reading of the store.
 *
 * EVERY FILE IS MADE TWICE AND HELD NEVER. The first time each is dropped as soon as it is made, so every refusal the
 * export can give comes before it writes anything, as when the whole export was built first. The second time each is
 * written as it is made.
 */
function writeEachFile(root: string, opts: { workspaceId?: string }): ExportReport {
  exportFileByFile(opts, () => {})
  const wanted = new Set<string>()
  const written: string[] = []
  let unchanged = 0
  const report = exportFileByFile(opts, (file) => {
    wanted.add(file.path)
    const full = join(root, ...file.path.split('/'))
    let current: string | null = null
    try {
      current = readFileSync(full, 'utf8')
    } catch {
      current = null
    }
    if (current === file.text) {
      unchanged += 1
      return
    }
    mkdirSync(dirname(full), { recursive: true })
    writeFileSync(full, file.text, 'utf8')
    written.push(file.path)
  })

  const removed: string[] = []
  const scan = staleFiles(root, wanted)
  for (const stale of scan.stale) {
    rmSync(join(root, ...stale.split('/')), { force: true })
    removed.push(stale)
  }
  // A FILE AN OLDER EXPORT WROTE AT THE TOP AND THIS ONE DOES NOT. `MANAGED_DIRECTORIES` covers the folders; these
  // are single files, named one by one, so nothing else at the top of somebody's folder is ever touched.
  for (const retired of RETIRED_FILES) {
    if (wanted.has(retired) || !existsSync(join(root, retired))) continue
    rmSync(join(root, retired), { force: true })
    removed.push(retired)
  }
  pruneEmptyDirectories(root)

  // A directory the scan could not open is a directory whose stale files were not looked for, and
  // `removed` has nowhere to say so: an empty list would read as "there were none". It is said in
  // `notes`, which is the field that exists for exactly this and which the CLI, the endpoint and
  // the mirror's commit body all already print.
  const notes = [
    ...report.notes,
    ...scan.unreadable.map(
      (place) =>
        `${place.path} could not be read (${place.reason}), so nothing under it was checked for staleness. ` +
        `"removed" is therefore the stale files this export could SEE, not all the files it no longer ` +
        `produces — a stale file left there is a row that comes back on the next import.`,
    ),
  ]

  return {
    root,
    ...report,
    notes,
    written: written.sort(byCodeUnit),
    unchanged,
    removed: removed.sort(byCodeUnit),
  }
}

/**
 * The directories this export owns outright, and may therefore delete out of.
 *
 * `layouts` STAYS, THOUGH THIS EXPORT WRITES NOTHING THERE ANY MORE. An export made before a decision
 * wrote each panel layout as `layouts/<id>.md`. Left in a mirror, such a file is removed
 * by the next export, and the git mirror commits the removal.
 *
 * `conversations`, `runs` and `folder-readings` are here for the same reason the first three are:
 * this export writes one file per conversation, one per run and one per folder reading, so a file it
 * no longer produces is a row that comes back from the dead on the next import.
 *
 * `schema-parts` holds one page for each table a schema part declares for an archive, so a page for
 * a table renamed or taken out is removed the same way.
 *
 * `history-bytes` holds the numbered pages of the original JSON text. A store that shrinks needs
 * fewer pages, and a store with no registry alias needs none, so a page this export no longer makes
 * is removed too. Left behind, it would hold rows twice or rows that are gone, and an import would
 * refuse the archive.
 */
const MANAGED_DIRECTORIES = ['records', 'changes', 'layouts', 'conversations', 'runs', 'folder-readings', 'schema-parts', 'revisions', HISTORY_BYTES_FOLDER]

/**
 * FILES AT THE TOP OF AN EXPORT THAT AN OLDER EXPORT WROTE AND THIS ONE NEVER WILL.
 *
 * `drafts.md` held the rough drafts, until migration 0196 moved every draft into a plan and the table went. Left in
 * a mirror it is a page of rows that no longer exist anywhere but in it, and an import of the mirror refuses the
 * whole archive over it (src/server/lib/import.ts says why). So the next export removes it, and the git mirror
 * commits the removal. Each draft the move took is a plan in `plans.md` now, and a draft it refused is still in the
 * database, which the export's notes say (see `draftsLeftBehind`).
 *
 * `history-bytes.md` held all the original JSON text in one envelope, until that became longer than the longest
 * string Node can make. Now the text is on pages in `history-bytes/`, and an import refuses an archive that also
 * holds the old file. So the next export removes it.
 */
const RETIRED_FILES = ['drafts.md', HISTORY_BYTES_FILE]

/**
 * Files under a managed directory that this export did not produce, AND the places it could not
 * look. Both halves, because they are opposite answers.
 *
 * This used to `catch { continue }` around the walk, so a permission bit, a bad mount and a
 * managed directory that does not exist yet all arrived at the caller as the same clean
 * `removed: []`. The same silence that `adapters/claude-code.ts` was already fixed for, and it is
 * worse here: `removed` is the only thing that keeps the archive from re-creating deleted rows on
 * the next import, so an unread directory is a restore that resurrects them and an export that
 * reported success.
 */
function staleFiles(
  root: string,
  wanted: ReadonlySet<string>,
): { stale: string[]; unreadable: UnreadablePlace[] } {
  const stale: string[] = []
  const unreadable: UnreadablePlace[] = []
  for (const dir of MANAGED_DIRECTORIES) {
    for (const full of walk(join(root, dir), unreadable)) {
      const rel = relative(root, full).split(sep).join('/')
      if (!wanted.has(rel)) stale.push(rel)
    }
  }
  return { stale, unreadable }
}

/**
 * Every file under a directory, recursively, collecting the directories that would not open.
 *
 * Per directory rather than all-or-nothing: a sweep that reads nine directories and is refused the
 * tenth should report nine and name the tenth, not throw away the nine. `describeReadFailure` makes
 * the ENOENT judgement once — a managed directory that does not exist yet is normal on a first
 * export and is not a place anybody was refused.
 */
function walk(dir: string, unreadable: UnreadablePlace[]): string[] {
  const out: string[] = []
  let entries: Dirent[]
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch (err) {
    const place = describeReadFailure(err, dir)
    if (place !== null) unreadable.push(place)
    return out
  }
  for (const entry of entries) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) for (const path of walk(full, unreadable)) out.push(path)
    else out.push(full)
  }
  return out
}

/**
 * Remove directories under the managed ones that no longer hold anything, and the managed
 * directory itself when it is empty.
 *
 * A `records/claim/` left behind after its last claim moved would say the kind exists and is
 * empty, and a `layouts/` left behind after the last layout was deleted would say a person has
 * arranged a page they have not. Neither is true and neither is something the export means to say.
 */
function pruneEmptyDirectories(root: string): void {
  for (const dir of MANAGED_DIRECTORIES) {
    const base = join(root, dir)
    let entries: { name: string; isDirectory(): boolean }[]
    try {
      entries = readdirSync(base, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const full = join(base, entry.name)
      if (readdirSync(full).length === 0) rmSync(full, { recursive: true, force: true })
    }
    if (readdirSync(base).length === 0) rmSync(base, { recursive: true, force: true })
  }
}
