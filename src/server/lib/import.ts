// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * The durable import: reading a `mole-office-export/2` archive back into the database, and refusing loudly when
 * it cannot be read whole.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS IS FOR, AND WHAT IT IS AFRAID OF
 * ---------------------------------------------------------------------------------------
 *
 * `src/server/lib/export.ts` writes every authored table out as text so the archive survives the
 * program that wrote it. This reads it back — after a disk failure, or after a person edited the
 * files with Mole Office shut down, which design/durability/FORMAT.md §10 says is what G3 is for.
 *
 * THE FORMAT IS SPECIFIED IN design/durability/FORMAT.md AND THAT DOCUMENT IS THE CONTRACT. Where
 * this file and that document disagree, the document is right and this file is a bug. The grammar
 * itself — front matter, fenced blocks, one JSON value per field line — is already implemented in
 * export-grammar.ts, which export.ts exports, and is used here rather than written a second time.
 *
 * ---------------------------------------------------------------------------------------
 * THE ONE RULE EVERYTHING ELSE FOLLOWS FROM: ALL OF IT, OR NONE OF IT
 * ---------------------------------------------------------------------------------------
 *
 * An importer that half-applies and reports success is the worst outcome available. It is worse
 * than one that refuses everything, because a half-imported archive looks exactly like a complete
 * one and nobody finds out until the missing half is needed.
 *
 * So `applyImport` runs the WHOLE import inside one SQLite transaction, and the plan is computed
 * inside that transaction rather than before it. A refusal throws, which rolls back. A crash, a
 * SIGKILL or a power cut rolls back when the file is next opened, because that is what SQLite's
 * journal is for. There is no state in which some of an import happened.
 *
 * ---------------------------------------------------------------------------------------
 * IDENTITY: THE ID IS THE ROW, THE TITLE IS THE NAME. IT CANNOT BE BOTH.
 * ---------------------------------------------------------------------------------------
 *
 * This is the hard question the audit named, because ids are nanoids while linking is by exact
 * title. `records_title_idx` was `UNIQUE(workspace_id, title)` from the first migration until
 * 17 August 2026, when `0030_titles_may_repeat` made it a plain index; the question is the same
 * either way, because it is about which of the two a row is matched on and not about which of them
 * the database happens to constrain. FORMAT.md §10 answers it and this
 * file implements that answer without softening it:
 *
 *   THE PRIMARY KEY IS THE IDENTITY. A row in a file is matched to a row in the database by its
 *   primary key and by nothing else — `id` for records, links, changes and ledger rows, the
 *   declared composite key for anchors, intent and layouts.
 *
 * Three things follow, and they are the whole of the reconciliation rule:
 *
 *   1. EDITING A TITLE IN A FILE RENAMES THAT RECORD. It does not create a second one and it does
 *      not match some other record that happens to hold the new name. That is what makes hand
 *      editing usable at all.
 *   2. EDITING AN ID CREATES A DIFFERENT ROW, and the old one stays. An id is what four other
 *      tables point at, so a renumbered id is a new row by definition. FORMAT.md says "do not
 *      renumber ids" in the README of every export for exactly this reason.
 *   3. TWO RECORDS MAY HOLD ONE TITLE, AND THIS IMPORTER RESTORES THEM. It refuses one collision
 *      and one only: two BLOCKS that would end up with the same title in one project. See
 *      `checkTitles`.
 *
 *      THIS FILE REFUSED EVERY REPEATED TITLE UNTIL 18 AUGUST 2026, a day after the database
 *      stopped requiring it. `records_title_idx` was UNIQUE(workspace_id, title) until
 *      `0030_titles_may_repeat` made it a plain index, because an id is
 *      identity and a title is presentation. For that day Mole Office could not import a backup of its
 *      own database once two records shared a title, which is the defect a durability layer least
 *      wants. Nothing in the format needed the rule: files are named by id, links carry ids, and a
 *      row is matched to a stored row by primary key and never by a title.
 *
 *      THE BLOCK RULE IS NOT A LEFTOVER OF THAT ONE. A block does not have a title somebody typed —
 *      the server builds it as `<pipeline> › <name>` — and a pipeline is read as an ordered list of
 *      those names, so two blocks of one name read as the same step written twice. The product
 *      refuses it at `refuseTakenTitle` in server/lib/blocks.ts, and an importer is a write path
 *      (principle A), so it refuses it here.
 *
 * A legal consequence of (1) that has to be built for rather than hoped about: two records can swap
 * titles in one edit, and a pipeline rename rewrites every one of its blocks' titles at once
 * (`BLOCK_TITLE_SEPARATOR`, decision 2). Applied row by row, those pass through a moment where two
 * rows hold one title. While the index was UNIQUE that moment was a failed statement halfway
 * through the import, so every existing record whose title changes is first parked on a staging
 * title inside the same transaction — see `stagingTitle`, which also says what the dropped
 * constraint changed about it and what removing the parking would cost.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS REFUSED, WHAT IS REPORTED, AND THE PRINCIPLE THAT DECIDES WHICH
 * ---------------------------------------------------------------------------------------
 *
 * Two principles, and every case below is one of them.
 *
 *   A. AN IMPORTER IS A WRITE PATH, so it enforces what the product's own write path enforces.
 *      A rule enforced at `POST /api/links` and not here is a rule with a back door, and "two
 *      places that must agree with nothing making them agree" is this codebase's named recurring
 *      defect.
 *   B. AN UNRECOGNISED VALUE IS REPORTED; A SELF-CONTRADICTORY VALUE IS REFUSED. `kind: "widget"`
 *      is unrecognised — Mole Office does not know it, but it is not wrong, and a backup that drops a
 *      row it does not recognise is worse than one that reports it (FORMAT.md §5.1 says exactly
 *      this about the export, and undoing that kindness at the other end would make it a lie).
 *      `gate: "hard"` beside `gateUpTo: "x"` is self-contradictory: it says "no progress at all"
 *      and "progress as far as x" in one row and there is no reading of it.
 *
 * REFUSE THE WHOLE IMPORT:
 *   - the archive directory is not there, or holds no MANIFEST.md
 *   - `format` is neither `mole-office-export/2` nor `panelx-export/1`, the version written before the
 *     product was renamed on 28 August 2026
 *   - a manifest count does not match what was actually read (§7 — a manifest is a fence, and a
 *     truncated archive that imported as a complete one is the failure this group exists to stop)
 *   - the archive names a migration this database has not applied (§7 — a newer schema loses
 *     columns silently on the way into an older one)
 *   - a file does not obey the grammar, or a field line's value is not JSON
 *   - a region name is not a table, or a key in a known region is not a column of it (§4.4)
 *   - a column the format deliberately does not carry appears in a file (§2.2)
 *   - a value is of the wrong type for its column, or null in a NOT NULL column
 *   - two rows in the archive claim one primary key, or one link pair
 *   - two BLOCKS would end up holding one title in one project, whether both are in the archive or
 *     one is already stored. Records of every other kind may share a title and are restored as they
 *     are
 *   - a link points at a record that is neither in the archive nor in the database
 *   - an anchor's `lastChangeId` names a change row that is nowhere
 *   - a `changes` row already exists with different content — the log is append-only, and
 *     accepting a rewritten past is not a merge, it is a forgery (§10)
 *   - two rows would each be the same numbered revision of one record. `revisions_record_seq_idx` is
 *     UNIQUE(record_id, seq) and this is what SQLite would refuse anyway, with a message naming an
 *     index and no row, no file and no line. See `checkRevisionNumbers`
 *   - a revision whose `seq` is not a whole number counting from 1. `writeExport` refuses to write
 *     one for the same reason: it is what "the revision before this" is worked out from
 *   - a revision whose `at` is not a stamp at all. A word that is not a date is not an unrecognised
 *     value to report, it is a self-contradictory one, and it is also what the order check reads
 *   - a revision whose `contentHash` does not name the content written on the same row. That field is
 *     the only thing `keepTheLedgerTrue` compares against the record, so a wrong one makes the import
 *     skip a record whose ledger is stale, or write a revision for one whose ledger was already true.
 *     See `checkRevisionHashes`
 *   - a revision, or a session record, whose data SQLite does not accept as JSON. An index that reads
 *     either column by `json_extract` refuses such a row on insert, after a plan that said the import
 *     would go through. See `checkDataIsJson`
 *   - a gate is `partial` with no `upTo`, or `hard` with one (principle A + B)
 *   - presentation intent carries a geometry or style key, or an unknown one (§5.4 — "the refusal
 *     is the feature, not an obstacle to it")
 *
 * APPLY, AND SAY SO IN THE REPORT:
 *   - a record whose `kind` is not one of RECORD_KINDS, and a link whose `type` is not a LINK_TYPE
 *   - a state word `STATE_MEANING` does not classify. The product's own write path accepts these —
 *     seven such words are in the live corpus on nineteen records — and `progressOf` answers
 *     `unclassified`, which is a question for a person rather than a wrong answer.
 *   - a `changes` row naming a record id that is nowhere. `changes.record_id` is deliberately NOT a
 *     foreign key, so history outlives its subject; refusing here would be the importer inventing a
 *     constraint the database declined to have.
 *   - a still-unreleased `session_resources` row (FORMAT.md §2.2 requires this to be said in words)
 *   - a `records` row with no `origin` line, or with an origin word outside `RECORD_ORIGINS`. See
 *     `ABSENT_ORIGIN_RULE` below for the first, and the argument for letting that column be missing.
 *     `MAY_BE_ABSENT` lists every column an archive may leave out. Neither ever produces `authored`: an archive that says
 *     nothing about how a record got here has said nothing, and silence is not a judgement.
 *   - an agent from an older archive that has no owner field. See `ABSENT_OWNER_RULE`.
 *   - a revision whose `op` is not one of `REVISION_OPS`. Unrecognised, not self-contradictory:
 *     dropping somebody's stored history over a label Mole Office cannot read would lose the one thing the
 *     table exists to keep. See `checkRevisionOps`
 *   - a record whose ledger would come out with a gap in its numbering, or a revision stamped earlier
 *     than the one before it. Both have honest causes — a project-scoped archive of a record whose
 *     earlier revisions are filed elsewhere, and a local clock going back an hour
 *
 * SKIP, AND SAY SO IN THE REPORT:
 *   - a `conversation_reads` row that is not the newest read of its reader in its conversation in its
 *     project, in an archive written before migration 0278. A held read that a newer read in the
 *     archive replaces is deleted. One note counts both. See `theReadsAnImportLeavesOut`
 *   - a row of a table on `LEFT_OUT_OF_BACKUPS_AND_EXPORTS`, with its JSON documents, in an archive
 *     written before the table was left out: `panel_layouts`.
 *     No row of it is written, and a note names how many there were, their files and the decision.
 *     The manifest's count for that table is not checked, because nothing of it is imported
 *
 * `records.data` IS NOT VALIDATED AGAINST `KIND_SPECS`, and that is a decision rather than an
 * omission. `data` is the one column whose accepted shape moves as kinds gain and lose fields, and
 * an archive exists to outlive the program: an importer running today's `validateData` would refuse
 * yesterday's honest backup. What is checked is what the DATABASE needs — that `data` is a JSON
 * object — plus the closed vocabularies that live in columns of their own, which do not move.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT AN IMPORT NEVER DOES
 * ---------------------------------------------------------------------------------------
 *
 * IT NEVER DELETES A ROW, except a conversation_reads row that a newer read by the same reader, in the
 * same conversation and project, replaces. A row in the database that the archive does not mention is
 * left exactly where it is, and counted in `notInArchive` so the silence is broken. Absence from an
 * archive means "this archive does not mention it", never "delete it" — otherwise importing a week-old
 * backup would destroy a week of work, and Mole Office's own rule is that nothing is truly deleted so
 * that a link into it shows as broken rather than vanishing.
 *
 * THE EXCEPTION IS THE RULE THE OFFICE ITSELF WRITES THAT TABLE BY. Since migration 0278 `conversation_reads`
 * keeps one row for each reader in each conversation in each project, and a newer read deletes the row it replaces,
 * in `recordThatSomebodyRead` as here, in wave 13s round 64. A held read is deleted only
 * when the archive holds a newer read of
 * the same key, and only then. The plan lists each such row as a `delete` before anything is written,
 * and its note counts them. See `theReadsAnImportLeavesOut`.
 *
 * THE SECOND EXCEPTION IS AN OFFICE NOBODY HAS USED YET. Every office
 * draws its own row when it is migrated, so an archive of one office, restored into a fresh one, carries
 * an office row while the database holds another. Where nothing in the database names the fresh row, it
 * and its picture are deleted before anything is written, and the archive's row is inserted in their
 * place. The plan lists both as a `delete`, and a note names both ids. See `theFreshOfficeRowGivesWay`.
 *
 * IT NEVER WRITES A CHANGE ROW OF ITS OWN. The change log is data the archive carries, not a log
 * this operation appends to. Writing "the importer changed this" rows would make a second import of
 * the same text produce a different database, which is exactly the property that must hold; and it
 * would attribute a hand edit to an actor nobody chose. What a person gets instead is the plan:
 * every row that would change, with the columns that differ, before anything is written.
 *
 * IT DOES WRITE A REVISION, AND ONLY WHERE THE LEDGER WOULD OTHERWISE BE WRONG. This is the one
 * exception to the paragraph above and it is not an inconsistency with it: the rule enforced is that
 * after the import, the newest revision of every record the import wrote holds what that record
 * holds. An ordinary restore satisfies that already — the archive carries the record's revisions
 * beside the record — so nothing is added, and a second import of the same text still writes nothing.
 * A restore over a database that has moved on does NOT satisfy it, and there the import writes one
 * revision per record saying what the record now holds, attributed to `system:import`. `keepTheLedgerTrue`
 * holds the whole argument, including why the person who ran the import is not named on the row.
 * THIS FILE IS THEREFORE A WRITER OF THE `revisions` TABLE. There are three: `saveRevision` in
 * lib/records.ts, the backfill in db/revision-backfill.ts, and this.
 *
 * IT NEVER SCANS THE MACHINE. `pgid` and `os_started_at` are written NULL on a new ledger row and
 * are LEFT ALONE on a row that already exists (FORMAT.md §2.2). Absent in the file is not null: the
 * format has decided not to carry those columns, so the file says nothing about them, and nulling a
 * live row's anti-reuse anchor would remove the one thing that stops a recycled pid being killed.
 */

import { AGENT_OWNER_BACKFILL } from '../db/agent-owners-migration.ts'
import { validateRegistryAliasRows, registryAliasMigrationWhen, REGISTRY_ALIAS_ARCHIVE_VERSION, REGISTRY_ALIAS_MIGRATION_SLUG, readRegistryAliases } from './registry-aliases/index.ts'
import { THE_MIGRATION_TAG as CASTING_LABEL_MIGRATION } from '../db/casting-labels-migration.ts'
import { THE_MIGRATIONS_FOLDER } from '../../config/settings.mjs'
import { acceptHistoryBytes, APageNotReadRowByRow, digestOf, FIRST_HISTORY_BYTES_VERSION, HISTORY_BYTES_REFUSALS, HISTORY_BYTES_VERSION, HistoryBytesRefused, historyDigest, historyTextsOf, keepStoredHistoryDigests, readAPage, type APage } from './registry-aliases/history-bytes.ts'
import { linesOf, regionsOf, theTextBetween, type APlaceInAFile, type ExportRegion, type UnparsedJsonBlock } from './export-grammar.ts'
import { takeIdentityCensus, theRowNamed, type AStampAt, type AnIdentityAt } from './registry-aliases/census.ts'
import { everyAgentAStoredNameAnswersTo } from './registry-aliases/remint-map.ts'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { Table, getTableColumns, getTableName, is } from 'drizzle-orm'
import { getTableConfig } from 'drizzle-orm/sqlite-core'
import { createHash } from 'node:crypto'
import {
  ACTOR_TYPES,
  LINK_TYPES,
  RECORD_KINDS,
  RECORD_ORIGINS,
  REVISION_OPS,
  readOrigin,
  unstampedOriginNote,
  type PanelRecord,
} from '@shared/types.ts'
import { MESSAGE_CENTRE } from '@shared/workspaces.ts'
import { MOLE_OFFICE_HANDLE, isOneOfTheOfficesOwnWriters } from '@shared/participants.ts'
import { nowStamp, parseLocalStamp } from '@shared/time.ts'
// The one declaration of what a block is, borrowed rather than retyped, because `checkTitles` now
// applies its rule to exactly that kind and a second spelling of `'block'` would be a second rule.
import { BLOCK_KIND, blockIdsOf } from '@shared/blocks.ts'
import { GATE_FAULT_RULES, GATE_KINDS, gateFault, progressOf, type GateKind } from '@shared/work.ts'
import { checkNodeIntent, checkScopeIntent } from '@shared/presentation.ts'
import type Database from 'better-sqlite3'
import { sqlite } from '../db/client.ts'
import * as schema from '../db/schema.ts'
// The three names the governance rule is written in, borrowed rather than restated: which link
// settles a fork, and the two kinds at its ends. A second spelling here would be a second rule.
import { HUMAN, PROPOSAL_KIND, RESOLVES_PROPOSAL, badEntriesOf } from './records.ts'
import { DECISION_KIND } from '@shared/decision-kind.ts'
import { anOfficeOnlyFieldAWholeDataWouldMove } from './office-only-run-fields.ts'
import { THE_DOOR_OF } from './check-field-doors.ts'
import { aRunSaysItIsFinished, readClosedUnchecked } from '@shared/releasing.ts'
import { theAgentAStoredSenderNames, type KnownParticipant } from '@shared/messages.ts'
import { THE_OFFICE } from './the-office.ts'
import { aReadMovesTheReadPoint } from './messages.ts'
// The doors' own reader of a warrant, and the doors' own answer to "does this office hold the cited
// message or comment". An imported warrant is read by the same two, never by a second reader.
import { readWarrant } from '@shared/warrant.ts'
import { theCitedPlaceExists } from '../db/the-cited-place-exists.ts'
// The token a read of a record hands back as `version`, and the normaliser that builds what it
// hashes. Borrowed rather than computed a second time: a second hash here would be a token that
// silently stopped naming the row it sits on. See lib/version.ts's own header.
import { contentOf, versionOf } from './version.ts'
import { wholeRevisionData, type StoredRevisionData } from '../db/revision-stored-once.ts'
import { anIdFromAHash } from './hash-id.ts'
import {
  EXPORTED_REGIONS,
  ExportFormatError,
  FORMAT_VERSION,
  READABLE_FORMAT_VERSIONS,
  describeFormat,
  columnsOf,
  JSON_LIST_COLUMNS,
  exportRoot,
  parseExportFile,
  type AuthoredRegion,
} from './export.ts'

// ============================================================================ what comes back

/** One reason the import will not run. Every one names a file and, where there is one, a line. */
export interface ImportRefusal {
  /** A write reserved to the office is forbidden, rather than a conflict in the archive. */
  status?: 403
  /** The file, relative to the import root. Empty when the problem is about the archive as a whole. */
  path: string
  /** 1-based line, or 0 when the problem does not sit on one. */
  line: number
  /** What is wrong, as a sentence, naming the value. */
  problem: string
}

/** One row the import would write, and what is different about it. */
export interface ImportRowChange {
  region: AuthoredRegion
  /** The row's primary key, printed. This is the identity, and it is the only thing rows match on. */
  key: string
  /**
   * A `delete` is a held conversation_reads row a newer read replaces (`theReadsAnImportLeavesOut`), or a fresh office's
   * own row and its picture, which give way to the archive's office row (`theFreshOfficeRowGivesWay`). Nothing else.
   */
  action: 'insert' | 'update' | 'delete'
  /** For an update: the columns whose stored value differs from the file's. Empty for an insert and a delete. */
  columns: string[]
  /**
   * The file the row was read from, so a person can go and look at it.
   *
   * EMPTY WHEN THERE IS NO FILE, which is three rows and only three: the revision `keepTheLedgerTrue`
   * writes when the import leaves a record its ledger no longer describes, a held read the import
   * deletes, and a fresh office's own row or picture the import deletes. Nobody typed any of them into
   * an archive, so pointing at a file for it would be pointing at the wrong thing.
   */
  path: string
}

/** What an import would do, or did. Counts first, then every row, then everything in words. */
export interface ImportPlan {
  root: string
  format: string
  /** True when the archive may be applied. False means `refusals` says why not, in full. */
  ok: boolean
  /** Everything that stops the import. All of them, so one round trip fixes every file. */
  refusals: ImportRefusal[]
  /** Things that were applied and that somebody has to be told about. Never a reason to stop. */
  notes: string[]
  /** Rows read out of the archive, per region. */
  read: Record<string, number>
  inserts: Record<string, number>
  updates: Record<string, number>
  unchanged: Record<string, number>
  /** Rows in the database this archive does not mention. NEVER deleted; counted so it is not silent. */
  notInArchive: Record<string, number>
  /** Every row that would change, sorted by region then key. */
  rows: ImportRowChange[]
}

export interface ImportReport extends ImportPlan {
  /** True only when the transaction committed. There is no third state. */
  applied: boolean
}

/**
 * The import was refused. Carries every reason, not the first one.
 *
 * IT THROWS RATHER THAN RETURNING A FLAG. A caller can ignore a field on a result object and did,
 * elsewhere in this product, which is how a 201 came to mean "stored" and "not stored" at once. An
 * exception cannot be ignored by accident, and inside `applyImport` it is also what rolls the
 * transaction back.
 */
export class ImportRefused extends Error {
  override readonly name = 'ImportRefused'
  readonly status: 403 | 409
  constructor(readonly plan: ImportPlan) {
    super(
      `The import was refused and nothing was written. ${plan.refusals.length} problem` +
        `${plan.refusals.length === 1 ? '' : 's'}:\n` +
        plan.refusals.map((r) => `  ${r.path === '' ? '(the archive)' : `${r.path}:${r.line}`} — ${r.problem}`).join('\n'),
    )
    this.status = plan.refusals.some((r) => r.status === 403) ? 403 : 409
  }
}

// ============================================================================ the schema, read once

/**
 * Every drizzle table, found by its SQL name out of the schema module itself.
 *
 * DERIVED, NOT RETYPED. export.ts keeps its own region→table map and that is one map; a second one
 * written here by hand would be the recurring defect in the one file whose job is to put data back.
 * test_file_runs follows tool_uses in EXPORTED_REGIONS: its columns and primary key are discovered
 * here too. SQLite enforces its foreign keys; applyImport writes both in its existing transaction.
 * Reading the module means a table renamed in schema.ts is found here without this file being
 * touched, and a table that goes missing fails at import rather than at the first INSERT.
 */
const TABLE_BY_NAME = new Map<string, ReturnType<typeof asTable>>()
function asTable(value: unknown): Parameters<typeof getTableColumns>[0] {
  return value as Parameters<typeof getTableColumns>[0]
}
for (const value of Object.values(schema)) {
  if (is(value, Table)) TABLE_BY_NAME.set(getTableName(value), asTable(value))
}
for (const region of EXPORTED_REGIONS) {
  if (!TABLE_BY_NAME.has(region)) {
    throw new Error(
      `src/server/lib/export.ts exports the region "${region}" and src/server/db/schema.ts declares no table with ` +
        `that name, so the importer cannot write it back. One of the two has been renamed without the other.`,
    )
  }
}

/** What the importer needs to know about one column, all of it read off the schema. */
interface ColumnFacts {
  /** The SQL column name, which is what an INSERT is written with. */
  sql: string
  notNull: boolean
  /** drizzle's own answer: 'string', 'number', 'boolean', 'json', … */
  dataType: string
}

/** Every column of a region, keyed by the TypeScript name the format writes. */
function columnFacts(region: AuthoredRegion): Map<string, ColumnFacts> {
  const out = new Map<string, ColumnFacts>()
  for (const [tsName, column] of Object.entries(getTableColumns(TABLE_BY_NAME.get(region) as never))) {
    const c = column as unknown as { name: string; notNull: boolean; dataType: string }
    out.set(tsName, { sql: c.name, notNull: c.notNull, dataType: c.dataType })
  }
  return out
}

/**
 * The primary key of a region, as TypeScript column names, in the order the schema declares it.
 *
 * Read from drizzle rather than written down, because the seven tables spell it two different ways
 * — `.primaryKey()` on the column for the three big ones, a `primaryKey({ columns })` clause for
 * the four smaller ones — and a hand-written map would have to know which is which.
 */
function primaryKeyOf(region: AuthoredRegion): string[] {
  const config = getTableConfig(TABLE_BY_NAME.get(region) as never)
  const composite = config.primaryKeys[0]
  const sqlNames =
    composite === undefined
      ? config.columns.filter((c) => c.primary).map((c) => c.name)
      : composite.columns.map((c) => c.name)
  const tsOf = new Map<string, string>()
  for (const [tsName, facts] of columnFacts(region)) tsOf.set(facts.sql, tsName)
  return sqlNames.map((name) => tsOf.get(name) ?? name)
}

const PRIMARY_KEY: Record<string, string[]> = {}
const COLUMNS: Record<string, Map<string, ColumnFacts>> = {}
for (const region of EXPORTED_REGIONS) {
  PRIMARY_KEY[region] = primaryKeyOf(region)
  COLUMNS[region] = columnFacts(region)
  if ((PRIMARY_KEY[region] ?? []).length === 0) {
    throw new Error(`src/server/db/schema.ts declares no primary key for "${region}", so a row in it cannot be matched.`)
  }
}

// ============================================================================ small shared pieces

/** Compare by code unit, never by locale, for the same reason the export does. */
function byCodeUnit(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/**
 * Deep equality over JSON values, ignoring key ORDER and normalising nothing else.
 *
 * Key order is not meaning — `JSON.parse` gives back whatever the text held — so comparing text
 * would report a change nobody made. Everything else is compared literally, including stamps, which
 * are local wall-clock strings that this product lost two months to reading as UTC (shared/time.ts).
 */
function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, i) => sameValue(item, b[i]))
  }
  const left = a as Record<string, unknown>
  const right = b as Record<string, unknown>
  const keys = Object.keys(left)
  if (keys.length !== Object.keys(right).length) return false
  return keys.every((key) => key in right && sameValue(left[key], right[key]))
}

/**
 * HOW LONG A VALUE IS BEFORE IT IS READ AGAIN WHEN ASKED FOR, rather than held: the length of its text, in bytes in a
 * file and in characters in the store. An export can be larger than the heap, and nearly all of it is in values longer
 * than this, so holding only the shorter ones keeps a small entry per row and not the row's bytes.
 */
const READ_AGAIN_FROM = 1024

/**
 * A value of a row that is read again each time it is asked for, by `again`, and not held. `again` checks that what it
 * reads is what the first reading read, and throws when it is not. A value written to the column replaces the reading.
 */
function readAgainWhenAsked(values: Record<string, unknown>, column: string, again: () => unknown): void {
  Object.defineProperty(values, column, {
    enumerable: true,
    configurable: true,
    get: again,
    set(this: Record<string, unknown>, value: unknown) {
      Object.defineProperty(this, column, { value, writable: true, enumerable: true, configurable: true })
    },
  })
}

/** Rows joined as `{ ...a, ...b }` joins them, the later winning, with no value read: one read again stays so. */
function copyOf(...rows: Record<string, unknown>[]): Record<string, unknown> {
  const descriptors = Object.assign(Object.create(null) as PropertyDescriptorMap, ...rows.map((row) => Object.getOwnPropertyDescriptors(row)))
  return Object.defineProperties({}, descriptors)
}

// ------------------------------------------------------- an archive that predates a column

/**
 * ---------------------------------------------------------------------------------------
 * THE COLUMNS AN ARCHIVE IS ALLOWED TO LEAVE OUT, AND THE RULE FOR WHAT THEIR ABSENCE MEANS
 * ---------------------------------------------------------------------------------------
 *
 * Every other column is required on every row, and that rule is right: "absent" then never has to be
 * guessed at, and a file with a hole in it is refused rather than half-read.
 *
 * `records.origin` was the first exception, and it is written as a table with the argument
 * against it rather than as an `if` inside `checkRow`, in the same shape and for the same reason as
 * `REASON_FIELD_BY_KIND` in shared/work.ts. Each further entry makes the same argument again: see
 * `ABSENT_PROVED_BY_RULE` for `provedBy` and `ABSENT_SIGNED_ITEM_RULE` for `signed_item`.
 *
 * WHY IT IS AN EXCEPTION. The column arrived on 2026-08-11 and the format carried it from the same
 * day. Every archive taken before then is a complete, honest archive of a database
 * that had no such column — and this file's own header says why that matters: "an archive exists to
 * outlive the program", and an importer that refused yesterday's honest backup over a column added
 * today would be the thing that paragraph argues against. `checkMigrations` already publishes the
 * rule for exactly this case in the other direction — "any column those migrations added takes its
 * declared default on every imported row" — and `records.origin` has no SQL default, so that default
 * is NULL.
 *
 * SO THE RULE, IN FULL, AND IT IS NEVER A QUIET ONE:
 *
 *   1. ON AN INSERT the row is written with `origin` NULL. Null is not `authored`; it is the stored
 *      form of "nobody has recorded how this record entered the corpus", which is exactly and only
 *      what an archive that says nothing about it says. Reading it as `authored` would turn silence
 *      into a judgement, in the direction that makes fixture content read as part of the record.
 *   2. ON AN UPDATE the column is LEFT ALONE. An archive that says nothing about origin must not be
 *      able to erase a mark somebody measured — re-importing a pre-provenance backup over today's
 *      database would otherwise blank 290 measured `fixture` marks and report it as an update.
 *   3. BOTH ARE COUNTED AND NAMED in the plan's notes, on every run, before anything is applied.
 *
 * A row that DOES carry the line is a row that has said something, including `origin: null`, and it
 * is compared and written like every other column.
 */
import { generatePixelScale, pixelScaleSchema } from '@shared/pixel-scale.ts'
import { ADDRESS_AS_FIELDS, ADDRESS_AS_SETTER_FIELDS } from '@shared/address-as.ts'

/** The residency columns on `agents`, as an archive names them. */
const RESIDENCY_FIELDS = [
  'residentSince',
  'residentProposal',
  'residentDecision',
  'residentConfirmedByKind',
  'residentConfirmedById',
  'successorId',
  'successorNamedAt',
  'successorNamedByKind',
  'successorNamedById',
] as const

/** When the picture-and-name reminder after a residency was filed and settled, and by whom, migration 0233, as an archive names them. */
const RESIDENT_NAMED_FIELDS = ['residentNamingAskedAt', 'residentNamedAt', 'residentNamedByKind', 'residentNamedById'] as const

const MAY_BE_ABSENT: Readonly<Record<string, readonly string[]>> = {
  records: ['origin'],
  // HOW A PERSON OR AN AGENT WISHES TO BE ADDRESSED, migration 0181. An archive written before it is an
  // honest archive of a database where nobody had said, so a row it INSERTS has none set, and a row
  // already stored keeps what its person or agent wrote (differingColumns leaves it out of the UPDATE).
  // Counted in the plan's notes, below.
  // Who last set it, migration 0182, under the same rule.
  // WHETHER IT IS A PERMANENT RESIDENT, AND ITS SUCCESSOR, migration a_permanent_resident_has_a_space_of_its_own.
  // An archive written before it is an honest archive of a database with no resident, so a row it INSERTS is no
  // resident and has no successor, and a row already stored keeps its residency. Counted in the plan's notes, below.
  // AND WHEN THE PICTURE-AND-NAME REMINDER WAS SETTLED, migration 0233. An archive written before it has no such press,
  // so a row it INSERTS reads as not yet named, and a row already stored keeps what it holds.
  // THE RUN-KEYS MARK. Older rows had no mark, so an INSERT binds 0 explicitly in insertStatement.
  // An UPDATE leaves the stored mark alone because silence must not erase the restriction on writes.
  agents: ['ownerId', 'ownerKind', 'pixelAppearance', 'pixelScale', ...ADDRESS_AS_FIELDS, ...ADDRESS_AS_SETTER_FIELDS, ...RESIDENCY_FIELDS, ...RESIDENT_NAMED_FIELDS, 'runKeysOnly'],
  // THE LANGUAGE A PERSON CHOSE FOR THE PAGES, migration 0183. An archive written before it is an honest
  // archive of a database where nobody had chosen, so a row it INSERTS has no choice (the pages follow the
  // browser), and a row already stored keeps its person's choice. Counted in the plan's notes, below.
  // WHO OWNS THE OFFICE, the owner migration (`the_owner_comes_from_the_installer`). An archive written
  // before it says nothing about who owns the office, so a row it INSERTS is not the owner and the row
  // already marked keeps its mark. See `theOfficeKeepsItsOwner`, and the plan's notes.
  // A PERSON'S OWN MESSAGE LABELS, migration 0341: "NULL MEANS NOBODY HAS MADE ONE, and the flag's list then
  // holds the marks alone." HOW THE CHAT IS LAID OUT FOR THAT PERSON, migration 0343: "NULL means nobody has
  // chosen, and the chat then lays itself out by its width, as it does today." AND THAT PERSON'S OWN AGENT
  // TAGS, migration 0344: "NULL means that person has made no tags." An archive written before them is an
  // honest archive of a database where nobody had made or chosen, so a row it INSERTS gets NULL, and a row
  // already stored keeps what it holds. Counted in the plan's notes, below.
  // THE MODE A PERSON STARTS IN, migration 0354: "NULL is a person made before this migration, who has been using the
  // office in Normal mode and keeps it." An archive written before it holds only such people, so a row it INSERTS gets
  // NULL, and a row already stored keeps what it holds. Counted in the plan's notes, below.
  people: [...ADDRESS_AS_FIELDS, ...ADDRESS_AS_SETTER_FIELDS, 'language', 'officeOwner', 'chatLabels', 'chatLayout', 'agentTags', 'startingMode'],
  // HOW A KEY PROVED A WRITE, migration 0178. See ABSENT_PROVED_BY_RULE below.
  // AND THE ORDER THE LOG WAS APPENDED IN, migration 0194. See `appendOrderOfTheInserts` below: an
  // archive written before 0194 does not carry it, so the order is rebuilt and the notes say so.
  // THE SIGNED PACKAGE ITEM THAT CARRIED A WRITE, migration 0276. Answer aMg06KMwjfw4
  // applies the same published rule: an inserted row gets null, a stored row keeps its evidence,
  // and both are counted before the import runs. See ABSENT_SIGNED_ITEM_RULE below.
  // THE PRESS FOR THE PERSON THAT WROTE A ROW, migration 0280, under the same rule. See ABSENT_PRESS_ID_RULE below.
  changes: ['provedBy', 'appendOrder', 'signed_item', 'pressId'],
  // THE VALUES A REVISION STORES ONCE, migration 0351. Before it every revision held its data whole, which is what an
  // inserted row with parts NULL says, so an archive written before it is read as it was written. Counted in the notes.
  revisions: ['provedBy', 'signed_item', 'parts'],
  agent_messages: ['provedBy'],
  // WHO MADE A LINK, BY KIND, AND WHICH SORT OF STAGE A GATE NAMES, migration 0193. An archive written
  // before it is an honest archive of a database that did not record either, so a row it INSERTS has
  // both NULL, which is read as not recorded, and a row already stored keeps what it holds. Counted in
  // the plan's notes, below.
  links: ['createdByType', 'gateUpToSort'],
  // WHOSE ID FOUR COLUMNS HOLD, migration 0311. An archive written before it did not say, so a row it INSERTS has no
  // kind, which the identity census counts as one that cannot be told, and a row already stored keeps its kind.
  // Counted in the plan's notes, below.
  folder_readings: ['ownerKind', 'readByKind'],
  revalidations: ['decidedByKind'],
  conversation_reads: ['asSideKind'],
  // WHAT A DRAWN FACE IS DRAWN FROM, migration 0337. An archive written before it is an honest archive of a database where
  // every drawn face was drawn from the participant its key names, so a row it INSERTS has drawn_from NULL, which says
  // just that, and a row already stored keeps its digest. Counted in the plan's notes, below.
  assets: ['drawnFrom'],
  // A PROJECT'S MASTER PIPELINE, migration 0338: "NULL MEANS NOBODY HAS MARKED ONE. The board then says the project
  // has no master pipeline and draws no rows." AND WHETHER THE POINTS OF ITS HANDED-BACK PACKAGES ARE INSPECTED,
  // migration 0345, whose migration names the choice but not its null; `packageInspectionOf` reads that null as on,
  // and the BOOLEAN_COLUMNS comment in export.ts says so. An archive written before them is an honest archive of a
  // database where nobody had marked or chosen, so a row it INSERTS gets NULL, and a row already stored keeps what it
  // holds. Counted in the plan's notes, below.
  workspaces: ['packageInspection', 'masterPipeline'],
  // A pre-label archive says nothing about these cells. Existing values must survive its silence.
  casting_rows: ['labels', 'labelsFrom', 'outUntil', 'outUntilFrom'],
  // WHEN THIS OFFICE BEGAN TO KEEP THE HAND-OVERS OF AN AGENT'S OWNER, migration 0356: "NULL means the code that keeps
  // them has not started on this database yet." An archive written before it is an archive of such a database, so a row
  // it INSERTS gets NULL, and a row already stored keeps its moment. Counted in the plan's notes, below.
  installation: ['ownerChangesSince'],
}

/** The published sentence for rule 1 and rule 2 above. One wording, quoted rather than retyped. */
export const ABSENT_ORIGIN_RULE =
  'a `records` row that carries no `origin` line at all comes from an archive written before the column existed. ' +
  'It is INSERTED with origin null — "nobody has recorded how this record entered the corpus", never "authored" — ' +
  'and on a row that already exists the stored origin is LEFT EXACTLY AS IT IS, so an old archive cannot erase a ' +
  'mark. Both are counted in the notes rather than done quietly.'

/**
 * THE SAME RULE FOR `provedBy`, the column migration 0178 added to `changes`, `revisions` and
 * `agent_messages`. Decision -Y2YrAvOc3eF. An archive written before 0178 is a complete,
 * honest archive of a database that did not store how a write was proved, for the reason the origin
 * rule gives. So the three parts are the same:
 *
 *   1. ON AN INSERT the row is written with `proved_by` NULL. That is what the migration left on
 *      every older row: nobody recorded how the write was proved. It never says a key proved it.
 *   2. ON AN UPDATE the column is LEFT ALONE, so an old archive cannot erase a proof that is stored.
 *      A warrant may cite the person's words only where this column says their key proved them, so
 *      blanking it would take away a citation that was true.
 *   3. BOTH ARE COUNTED in the plan's notes, on every run, before anything is applied.
 *
 * A row that DOES carry the line, including `provedBy: null`, is compared and written like any
 * other column.
 */
export const ABSENT_PROVED_BY_RULE =
  'a `changes`, `revisions` or `agent_messages` row that carries no `provedBy` line comes from an archive ' +
  'written before migration 0178 added the column. It is INSERTED with provedBy null, which means nobody ' +
  'recorded how that write was proved. On a row that already exists, the stored provedBy is LEFT EXACTLY AS ' +
  'IT IS, so an old archive cannot erase a proof. Both are counted in the notes.'

/**
 * THE SAME RULE FOR THE SIGNED ITEM, migration 0276. Answer aMg06KMwjfw4 revisits decision
 * -Y2YrAvOc3eF for changes and revisions. Null on an inserted row records the archive's silence:
 * no signed package item was recorded for that write. An absent line cannot erase evidence on a
 * stored row. differingColumns leaves it alone, including the append-only check on changes.
 * A line that is present, including signed_item: null, is compared like any other column.
 */
export const ABSENT_SIGNED_ITEM_RULE =
  'a `changes` or `revisions` row that carries no `signed_item` line comes from an archive written ' +
  'before migration 0276 added the column. It is INSERTED with signed_item null, which means no signed ' +
  'package item was recorded for that write. On a row that already exists, the stored signed_item is ' +
  'LEFT EXACTLY AS IT IS, so an old archive cannot erase that evidence. Both are counted in the notes.'

/**
 * THE SAME RULE FOR THE PRESS, migration 0280. An archive written before it is an honest archive of a database that did
 * not record which press for the person wrote a change row, so null on an inserted row says nobody recorded a press,
 * and a stored row keeps the press it names. A line that is present, including pressId: null, is compared like any other.
 */
export const ABSENT_PRESS_ID_RULE =
  'a `changes` row that carries no `pressId` line comes from an archive written before migration 0280 added the ' +
  'column. It is INSERTED with pressId null, which means nobody recorded a press for the person for that write. On a ' +
  'row that already exists, the stored pressId is LEFT EXACTLY AS IT IS, so an old archive cannot erase it. Both are ' +
  'counted in the notes.'

/** An older archive cannot undo an owner chosen after it was written. */
export const ABSENT_OWNER_RULE =
  'an agent row with no ownerId comes from an archive before owners were recorded. On a new row, ' +
  'the owner is its recorded starter when that is a person or an agent. A stored row keeps its owner.'

/** May this column be missing from an archive row, under the rules above? */
function mayBeAbsent(region: AuthoredRegion, column: string): boolean {
  return (MAY_BE_ABSENT[region] ?? []).includes(column)
}

/** A row's primary key, printed, which is what every message and every map is keyed by. */
function keyOf(region: AuthoredRegion, row: Record<string, unknown>): string {
  return (PRIMARY_KEY[region] ?? []).map((column) => String(row[column])).join(' · ')
}

/** An empty count per region, so a region with nothing in it says zero rather than being absent. */
function zeroed(): Record<string, number> {
  const out: Record<string, number> = {}
  for (const region of EXPORTED_REGIONS) out[region] = 0
  return out
}

/** Bump a count without pretending an unknown region is zero. */
function bump(counts: Record<string, number>, region: string): void {
  counts[region] = (counts[region] ?? 0) + 1
}

// ============================================================================ the words of seven refusals

/*
 * THE WORDS OF SEVEN REFUSALS, EXPORTED SO A TEST READS THEM FROM HERE and not from a copied sentence. Each was moved
 * here whole from the one place that makes that refusal, which now calls it, and no word of any of them changed.
 */

/** A second row with the key of a row already read, and where the first one is. */
export function aSecondRowClaiming(region: AuthoredRegion, key: string, first: { path: string; line: number }): string {
  return (
    `a second ${region} row claiming ${PRIMARY_KEY[region]?.join(' + ')} = ${key}; the first is at ` +
    `${first.path}:${first.line}. Two files describing one row is two answers, and there is no rule for picking one.`
  )
}

/** A row that carries a JSON document, in a file with no block for that document. */
export function aRowWithoutItsDocument(region: AuthoredRegion, column: string): string {
  return (
    `this ${region} row has no \`\`\`json mole-office ${region}.${column}\`\`\` block. It is always written, ` +
    'even when it is empty, because an absent document and an empty one are different facts.'
  )
}

/** A link whose end names a record that is neither in the archive nor in the database. */
export function aLinkEndThatIsNowhere(end: 'fromId' | 'toId', id: string): string {
  return (
    `this link's \`${end}\` is ${JSON.stringify(id)}, and no record with that id is in this archive or in the database. ` +
    'Both ends of a link must exist — a soft-deleted record still counts, because it still has a row. The usual ' +
    'cause is a record file that was deleted or renumbered.'
  )
}

/** A stored change row the archive gives other values: the columns that differ, and the first one's two values. */
export function aRewrittenChangeRow(key: string, differing: readonly string[], stored: unknown, archived: unknown): string {
  return (
    `change row ${key} is already stored and this archive gives it a different ${differing.join(', ')} ` +
    `(stored ${JSON.stringify(stored)}, archive ${JSON.stringify(archived)}). ` +
    'The change log is append-only history: it is what makes a deleted record recoverable, and rewriting it is ' +
    'not a merge. Restore the line, or import into an empty database.'
  )
}

/** A revision held in part that cannot be put back together, after the words its reading threw. */
export function aRevisionHeldInPart(message: string): string {
  return `${message} The archive holds this revision only in part, so it cannot be read whole.`
}

/** A revision whose row says one content hash, and whose content hashes to another. */
export function aRevisionWhoseHashDisagrees(id: string, recordId: string, said: unknown, hash: string): string {
  return (
    `revision ${id} of record ${recordId} says its content hash is ` +
    `${JSON.stringify(said)}, and the kind, title, summary, data and deletedAt written on the ` +
    `same row hash to ${JSON.stringify(hash)}. The token is what says which content this revision holds, so a ` +
    `row where the two disagree says two different things about one moment. It is also the only field the ` +
    `import reads to decide whether a record's newest revision still describes the record, so a wrong one ` +
    `leaves a stale ledger unrepaired or repairs one that was already true. Fix the hash or the content.`
  )
}

/** A revision whose number is not a whole number counting from 1. */
export function aRevisionNumberThatIsNotOne(seq: unknown): string {
  return (
    `this revision says its number is ${JSON.stringify(seq)}, and a revision number is a whole number counting ` +
    `from 1. It is what "the revision before this one" is worked out from, so a number that is not one leaves ` +
    `the record's history in no order at all.`
  )
}

// ============================================================================ reading the archive

/** One row as it was found: the values, and where they came from so a message can point at them. */
interface ArchiveRow {
  region: AuthoredRegion
  values: Record<string, unknown>
  path: string
  line: number
}

/** Everything read out of the files, before anything has been checked against the database. */
interface Archive {
  /** Every JSON history_bytes envelope, as a page read row by row, and the file it was read from, in the files' order. */
  historyBytes: { page: APage; file: string }[]
  rows: Map<AuthoredRegion, ArchiveRow[]>
  manifest: { fields: Record<string, unknown>; path: string; line: number } | null
  migrations: { fields: Record<string, unknown>; path: string; line: number }[]
  /** Files holding at least one region of a given name, which is what MANIFEST.md's file counts are. */
  filesWith: Map<string, Set<string>>
  /**
   * Rows of a table on `LEFT_OUT_OF_BACKUPS_AND_EXPORTS`, found in an archive written before that
   * table was left out: the file of each row, by table. None of them is written, and the plan says so.
   */
  leftOut: Map<string, string[]>
  refusals: ImportRefusal[]
}

/**
 * The two files that are prose and are never read, by name.
 *
 * FORMAT.md §6: "the importer reads neither file, and a restore that deletes both before importing
 * must produce exactly the same database." They are derived from the record files, so reading them
 * would be a second statement of facts already written down — the defect this codebase keeps
 * finding — in the one place where a restore would read it back as data.
 */
const READING_AIDS = new Set(['README.md', 'INDEX.md'])

/**
 * Every `.md` file under the root, parsed, with a broken file recorded rather than thrown.
 *
 * ONE BAD FILE MUST NOT HIDE THE OTHER NINE. The grammar throws on the first problem in a
 * file, which is right — a half-parsed file is not a file — but a person fixing a hand-edited
 * archive should see every broken file in one run instead of finding them one command at a time.
 * So the throw is caught per file. Within one file only the first problem is reported, and the
 * message says which line it is on.
 *
 * Each file is read a line at a time by `readAFile`, so no file is held whole and no long value is held at all.
 */
function readFiles(root: string): { files: { path: string; full: string; regions: ARegionKept[] }[]; refusals: ImportRefusal[] } {
  const files: { path: string; full: string; regions: ARegionKept[] }[] = []
  const refusals: ImportRefusal[] = []
  const visit = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => byCodeUnit(a.name, b.name))) {
      // A mirror keeps its git repository beside the files it commits, and nothing in there is ours.
      if (entry.name === '.git') continue
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        visit(full)
        continue
      }
      if (!entry.name.endsWith('.md')) continue
      const rel = relative(root, full).split(sep).join('/')
      if (READING_AIDS.has(rel)) continue
      try {
        files.push({ path: rel, full, regions: readAFile(full, rel) })
      } catch (err) {
        if (err instanceof ExportFormatError) refusals.push({ path: err.path, line: err.line, problem: bareMessage(err) })
        else refusals.push({ path: rel, line: 0, problem: `this file could not be read: ${(err as Error).message}` })
      }
    }
  }
  visit(root)
  return { files, refusals }
}

/** `ExportFormatError` prefixes its message with `path:line`, which every refusal already carries. */
function bareMessage(err: ExportFormatError): string {
  const prefix = `${err.path}:${err.line} — `
  return err.message.startsWith(prefix) ? err.message.slice(prefix.length) : err.message
}

/**
 * A region as the import keeps it. A field or JSON region is as the grammar gave it, except that a value longer than
 * READ_AGAIN_FROM is read again from the file when asked for: a field's, in its place in `fields`, and a JSON block's,
 * by `readAgain`, with `json` left undefined. A history_bytes block is a page, as acceptance needs it.
 */
type ARegionKept = (ExportRegion & { readAgain?: () => unknown }) | { name: string; kind: 'page'; line: number; page: APage }

/** The JSON blocks the grammar gives unparsed, to be read a row at a time. */
const PAGES: ReadonlySet<string> = new Set(['history_bytes'])

/** What `tracked` saw of the lines read since a region was last kept: where each fence and each long line is. */
interface WhatWasSeen {
  /** The number of the line read last. */
  number: number
  /** By line number, each line that starts with a fence: where it starts, and where the line after it starts. */
  fences: Map<number, { start: number; after: number }>
  /**
   * By line number, each line longer than READ_AGAIN_FROM that holds a `: `: where it starts, where what follows its
   * first `: ` starts, and where its newline is. Only numbers are kept, never the line's text.
   */
  long: Map<number, { start: number; from: number; end: number }>
}

/** The lines `linesOf` gives, passed on unchanged, with where each fence and each line longer than READ_AGAIN_FROM is. */
function* tracked(lines: Iterable<string>, place: APlaceInAFile, seen: WhatWasSeen): Generator<string> {
  let start = place.offset
  for (const line of lines) {
    const end = place.offset
    seen.number += 1
    if (line.startsWith('```')) seen.fences.set(seen.number, { start, after: end })
    else if (end - start > READ_AGAIN_FROM) {
      // A field line is `key: <JSON value>`, its key before the first `: `, as the grammar reads it. A field line is
      // never a file's last line, so `end` is after its newline. What is found here is used only for a line inside a
      // fields block, and its value is checked against the grammar's when it is read again.
      const at = line.indexOf(': ')
      if (at > 0) seen.long.set(seen.number, { start, from: start + Buffer.byteLength(line.slice(0, at + 2)), end: end - 1 })
    }
    start = end
    yield line
  }
}

/**
 * One file's regions, read a line at a time. Only the region being read is held whole, and of the regions kept, no
 * value longer than READ_AGAIN_FROM: such a value is read again from the file each time it is asked for. The regions
 * are kept until the file ends, so a file the grammar refuses gives none, as it did.
 */
function readAFile(full: string, rel: string): ARegionKept[] {
  const place: APlaceInAFile = { offset: 0, line: 1 }
  const seen: WhatWasSeen = { number: 0, fences: new Map(), long: new Map() }
  const regions: ARegionKept[] = []
  for (const region of regionsOf(tracked(linesOf(full, place), place, seen), rel, { unparsed: PAGES })) {
    if (region.kind === 'unparsed json') regions.push({ name: region.name, kind: 'page', line: region.line, page: aPageIn(region, full, rel, place) })
    else if (region.kind === 'json') regions.push(aJsonRegionKept(region, full, rel, seen))
    else {
      readLongFieldsAgain(region, full, rel, seen)
      regions.push(region)
    }
    seen.fences.clear()
    seen.long.clear()
  }
  return regions
}

/**
 * A history_bytes block read a row at a time. A block the row reader cannot follow is read whole by the grammar, as
 * every file was, so it is refused at the line and in the words it was refused in. JSON the grammar reads and the row
 * reader cannot follow is refused, never read some other way.
 */
function aPageIn(block: UnparsedJsonBlock, full: string, rel: string, place: APlaceInAFile): APage {
  try {
    return readAPage(block.body, { path: rel, line: block.line }, place)
  } catch (err) {
    if (!(err instanceof APageNotReadRowByRow)) throw err
    parseExportFile(readFileSync(full, 'utf8'), rel)
    throw new Error(`the history_bytes block at line ${String(block.line)} is JSON, and the reader of its rows cannot follow it, so it is not read.`)
  }
}

/** A JSON region, kept whole when its block is short, and otherwise read again from the file when asked for. */
function aJsonRegionKept(region: ExportRegion, full: string, rel: string, seen: WhatWasSeen): ARegionKept {
  const { name, line } = region
  const open = seen.fences.get(line)
  const close = seen.fences.get(seen.number)
  if (open === undefined || close === undefined) throw new Error(`the fences of the \`${name}\` block at line ${String(line)} were not found where the grammar found them.`)
  // The block's text is its lines joined by newlines: from the line after the opening fence to the newline before the closing one.
  const from = open.after
  const to = close.start - 1
  if (to - from <= READ_AGAIN_FROM) return region
  const digest = digestOf(JSON.stringify(region.json))
  return { name, kind: 'json', line, fields: region.fields, json: undefined, readAgain: () => aValueReadAgain(full, rel, line, from, to, digest, `the \`${name}\` block`) }
}

/**
 * Each value of a fields region whose line is longer than READ_AGAIN_FROM, made one that is read again when asked for.
 * The line's key is read again from the file too, since only numbers were kept: a key the region does not hold leaves
 * its value held, and a key read wrongly is caught by the check of the value read again.
 */
function readLongFieldsAgain(region: ExportRegion, full: string, rel: string, seen: WhatWasSeen): void {
  for (const [number, long] of seen.long) {
    if (number <= region.line || number >= seen.number) continue
    const key = theTextBetween(full, long.start, long.from - 2)
    if (!Object.hasOwn(region.fields, key)) continue
    const digest = digestOf(JSON.stringify(region.fields[key]))
    const { from, end } = long
    readAgainWhenAsked(region.fields, key, () => aValueReadAgain(full, rel, number, from, end, digest, `the value of \`${key}\``))
  }
}

/**
 * A value read again from the bytes of a file, checked to be the value the first reading read: the same JSON, by its
 * digest. A value that is not is thrown, so the import writes nothing.
 */
function aValueReadAgain(full: string, rel: string, line: number, from: number, to: number, digest: string, what: string): unknown {
  let value: unknown
  let read = false
  try {
    value = JSON.parse(theTextBetween(full, from, to)) as unknown
    read = true
  } catch {
    read = false
  }
  if (!read || digestOf(JSON.stringify(value)) !== digest) {
    throw new Error(`${rel}:${String(line)} — ${what} read again is not the one the first reading checked, so the import writes nothing.`)
  }
  return value
}

/** The refusal of a second envelope in an archive of the first capability, which has one. */
const ONE_ENVELOPE = 'The archive must have exactly one JSON history_bytes envelope.'

/**
 * Sort every parsed region into its table, checking the shape of each as it goes.
 *
 * The record and layout files are the only ones that carry two regions describing ONE row — an
 * envelope and a JSON document — and the pairing is by FILE rather than by anything inside the
 * blocks, because that is how the export writes them and there is nothing else to pair on. A file
 * with an envelope and no document, or two of either, is refused: an absent `data` block and a
 * `data` block holding `{}` are different facts and the format keeps them apart (§5.1).
 */
function collectRows(files: ReturnType<typeof readFiles>['files']): Archive {
  const rows = new Map<AuthoredRegion, ArchiveRow[]>()
  for (const region of EXPORTED_REGIONS) rows.set(region, [])
  const filesWith = new Map<string, Set<string>>()
  const refusals: ImportRefusal[] = []
  let manifest: Archive['manifest'] = null
  const historyBytes: Archive['historyBytes'] = []
  const migrations: Archive['migrations'] = []

  const known = new Set<string>(EXPORTED_REGIONS)
  const leftOut = new Map<string, string[]>()
  /** The table on `LEFT_OUT_OF_BACKUPS_AND_EXPORTS` a region belongs to, as a row or as one of its JSON documents. */
  const leftOutTableOf = (name: string): string | undefined =>
    schema.LEFT_OUT_OF_BACKUPS_AND_EXPORTS.find((table) => name === table || name.startsWith(`${table}.`))
  /** `<table>.<column>` for the two columns written as a JSON document instead of a field line. */
  const jsonRegionOwner = new Map<string, { region: AuthoredRegion; column: string }>()
  for (const region of EXPORTED_REGIONS) {
    for (const column of columnsOf(region).jsonBlocks) jsonRegionOwner.set(`${region}.${column}`, { region, column })
  }

  for (const file of files) {
    /** JSON documents found in this file, by the column they belong to. A long one is read again when asked for. */
    const documents = new Map<string, { value: unknown; readAgain: (() => unknown) | undefined; line: number; count: number }>()
    const envelopes: { region: AuthoredRegion; values: Record<string, unknown>; line: number }[] = []

    for (const region of file.regions) {
      if (region.kind === 'page' || region.name === 'history_bytes') {
        // How many envelopes an archive may hold depends on its capability, which is read from the manifest later.
        if (region.kind !== 'page') refusals.push({path:file.path,line:region.line,problem:'A history_bytes envelope must be a JSON block.'})
        else historyBytes.push({page:region.page,file:file.full})
        continue
      }
      if (region.name === 'manifest') {
        if (manifest !== null) {
          refusals.push({
            path: file.path,
            line: region.line,
            problem: `a second \`manifest\` block, after the one at ${manifest.path}:${manifest.line}. An archive has one manifest.`,
          })
          continue
        }
        manifest = { fields: region.fields, path: file.path, line: region.line }
        continue
      }
      if (region.name === 'migrations') {
        migrations.push({ fields: region.fields, path: file.path, line: region.line })
        continue
      }

      // A TABLE NO ARCHIVE CARRIES ANY MORE, in an archive written before it was left out, for
      // `panel_layouts`. Its rows are counted by file and not written, and the plan says
      // how many and why. Its JSON documents go with them.
      const leftOutTable = leftOutTableOf(region.name)
      if (leftOutTable !== undefined) {
        if (region.name === leftOutTable) leftOut.set(leftOutTable, [...(leftOut.get(leftOutTable) ?? []), file.path])
        continue
      }

      const owner = jsonRegionOwner.get(region.name)
      if (owner !== undefined) {
        if (region.kind !== 'json') {
          refusals.push({ path: file.path, line: region.line, problem: `\`${region.name}\` must be a \`json mole-office\` block holding one document.` })
          continue
        }
        const already = documents.get(owner.column)
        documents.set(owner.column, { value: region.json, readAgain: region.readAgain, line: region.line, count: (already?.count ?? 0) + 1 })
        continue
      }

      // A ROUGH DRAFT, IN AN ARCHIVE WRITTEN BEFORE MIGRATION 0196 MOVED EVERY DRAFT INTO A PLAN.
      //
      // REFUSED WITH A SENTENCE, NOT IMPORTED THROUGH THE MOVE. The move keeps a draft's id as its plan's id only when
      // no plan holds it, and decides that against the plans of the database it runs on; here two sets of plans meet,
      // the archive's and this database's, and a draft that one of them already moved would come back as a second
      // copy of the same words. Working that out inside an import is a second copy of the migration, and one that
      // nothing exercises. The way through is the one the migration already is: restore this archive into a checkout
      // from before 0196, run `npm run db:migrate` there, and export again. Skipping the rows would be a restore that
      // reports success over words it left behind.
      if (region.name === 'planning_drafts') {
        refusals.push({
          path: file.path,
          line: region.line,
          problem:
            'this is a rough draft from `planning_drafts`, which migration 0196 (`every_rough_draft_becomes_a_plan`) ' +
            'moved into `plans` and removed. This database has no table to put it in, and Mole Office will not turn it ' +
            'into a plan here or leave it out. Import this archive into a checkout from before migration 0196, run ' +
            '`npm run db:migrate` there, which moves each draft into a plan and says so, and export again.',
        })
        continue
      }

      if (!known.has(region.name)) {
        // §4.4: a region name the importer does not know is refused rather than repaired. A region
        // is a SQL table name, and a block naming something else is either a typo or a format from
        // a version this one cannot read; guessing at either would import part of an archive.
        refusals.push({
          path: file.path,
          line: region.line,
          problem:
            `\`${region.name}\` is not a region this format knows. A region is one of: ${[...known].sort(byCodeUnit).join(', ')}, ` +
            `or one of their JSON columns (${[...jsonRegionOwner.keys()].sort(byCodeUnit).join(', ')}).`,
        })
        continue
      }

      const region_ = region.name as AuthoredRegion
      if (region.kind !== 'fields') {
        refusals.push({ path: file.path, line: region.line, problem: `\`${region.name}\` holds rows, so it must be a \`mole-office\` block of field lines.` })
        continue
      }
      const set = filesWith.get(region_) ?? new Set<string>()
      set.add(file.path)
      filesWith.set(region_, set)

      const jsonColumns = columnsOf(region_).jsonBlocks
      if (jsonColumns.length === 0) {
        rows.get(region_)?.push({ region: region_, values: region.fields, path: file.path, line: region.line })
      } else {
        envelopes.push({ region: region_, values: region.fields, line: region.line })
      }
    }

    // ---- join each envelope to the document that belongs with it, in this file
    if (envelopes.length > 1) {
      refusals.push({
        path: file.path,
        line: envelopes[1]?.line ?? 0,
        problem: 'this file describes more than one row that carries a JSON document. One such row per file, as the export writes them.',
      })
      continue
    }
    const envelope = envelopes[0]
    if (envelope === undefined) {
      for (const [column, found] of documents) {
        refusals.push({
          path: file.path,
          line: found.line,
          problem: `a \`${column}\` document with no row above it to belong to.`,
        })
      }
      continue
    }
    const values = copyOf(envelope.values)
    let broken = false
    for (const column of columnsOf(envelope.region).jsonBlocks) {
      const found = documents.get(column)
      if (found === undefined) {
        refusals.push({ path: file.path, line: envelope.line, problem: aRowWithoutItsDocument(envelope.region, column) })
        broken = true
        continue
      }
      if (found.count > 1) {
        refusals.push({ path: file.path, line: found.line, problem: `${found.count} \`${envelope.region}.${column}\` blocks in one file, so one of them would be lost.` })
        broken = true
        continue
      }
      if (found.readAgain !== undefined) readAgainWhenAsked(values, column, found.readAgain)
      else values[column] = found.value
      documents.delete(column)
    }
    for (const [column, found] of documents) {
      refusals.push({ path: file.path, line: found.line, problem: `\`${column}\` is not a JSON column of a ${envelope.region} row.` })
      broken = true
    }
    if (!broken) rows.get(envelope.region)?.push({ region: envelope.region, values, path: file.path, line: envelope.line })
  }

  return { rows, manifest, historyBytes, migrations, filesWith, leftOut, refusals }
}

// ============================================================================ checking the columns

/**
 * Check one row against the columns its table declares, and hand back the values to write.
 *
 * Three separate refusals live here and each is one of the seven cases the format names:
 *
 *   - a key that is not a column of this table (§4.4)
 *   - a column the format deliberately does not carry, present in the file (§2.2 — `pgid` and
 *     `osStartedAt`; finding one means somebody has restored machine state by hand, which is the
 *     stale-reading scar this whole split exists to prevent)
 *   - a value of the wrong type, or null where the column is NOT NULL
 *
 * SQLite would take most of these without complaint — it stores a number in a TEXT column happily —
 * so nothing here can be left to the database to catch.
 */
function checkRow(row: ArchiveRow, refusals: ImportRefusal[]): boolean {
  const declared = columnsOf(row.region)
  const facts = COLUMNS[row.region] ?? new Map<string, ColumnFacts>()
  const expected = new Set<string>([...declared.fields, ...declared.jsonBlocks])
  const dropped = new Set<string>(declared.dropped)
  let ok = true

  for (const key of Object.keys(row.values)) {
    if (dropped.has(key)) {
      refusals.push({
        path: row.path,
        line: row.line,
        problem:
          `\`${key}\` is a column this format deliberately does not carry: it is a fact about one machine at one ` +
          'moment, and an archive that restored it would manufacture the stale reading of the machine this project ' +
          'once acted on. Delete the line. See design/durability/FORMAT.md §2.2.',
      })
      ok = false
      continue
    }
    if (!expected.has(key)) {
      refusals.push({
        path: row.path,
        line: row.line,
        problem: `\`${key}\` is not a column of ${row.region}. Its columns are: ${[...expected].sort(byCodeUnit).join(', ')}.`,
      })
      ok = false
    }
  }

  for (const column of expected) {
    if (!(column in row.values)) {
      if (mayBeAbsent(row.region, column)) continue // see MAY_BE_ABSENT and the three published ABSENT_*_RULE constants
      refusals.push({
        path: row.path,
        line: row.line,
        problem: `this ${row.region} row does not say what \`${column}\` is. Every column is written on every row, so "absent" never has to be guessed at.`,
      })
      ok = false
      continue
    }
    const problem = typeProblem(row.region, column, row.values[column], facts.get(column))
    if (problem !== null) {
      refusals.push({ path: row.path, line: row.line, problem })
      ok = false
    }
  }
  if (row.region === 'agents' && 'ownerKind' in row.values) {
    const kind = row.values['ownerKind']
    const id = row.values['ownerId']
    if (!('ownerId' in row.values) || !((kind === null && id === null) || ((kind === 'person' || kind === 'agent') && typeof id === 'string' && id.trim() !== ''))) {
      refusals.push({ path: row.path, line: row.line, problem: 'An agent owner needs a person or agent kind and an id together, or both fields must be null.' })
      ok = false
    }
  }
  return ok
}

/** What is wrong with this value for this column, or null when nothing is. */
function typeProblem(region: AuthoredRegion, column: string, value: unknown, facts: ColumnFacts | undefined): string | null {
  if (facts === undefined) return `${region}.${column} is not declared in src/server/db/schema.ts.`
  const where = `${region}.${column}`
  if (value === null) {
    return facts.notNull ? `${where} is null, and the column may not be. A row with a hole in it is not a row.` : null
  }
  if (region === 'agents' && column === 'pixelScale') {
    if (typeof value !== 'string') return 'agents.pixelScale must be JSON stored as text.'
    let parsed: unknown
    try { parsed = JSON.parse(value) } catch { return 'agents.pixelScale is not valid JSON.' }
    return pixelScaleSchema.safeParse(parsed).success ? null : 'agents.pixelScale is not a valid map size.'
  }
  const isJsonColumn = (columnsOf(region).jsonBlocks as readonly string[]).includes(column)
  if (facts.dataType === 'json' || isJsonColumn) {
    // Both JSON carriers hold a document rather than a value: `records.data` and `presentation_intent.intent`
    // are both read as objects by every reader there is.
    //
    // EXCEPT THE ONES THAT HOLD A LIST, and those are named one at a time in `JSON_LIST_COLUMNS`
    // rather than by loosening this rule for every column. A record whose `data` came back as a
    // list is a record no reader can read, and this is the only thing that would say so.
    const holdsAList = (JSON_LIST_COLUMNS[region] ?? []).includes(column)
    if (holdsAList) {
      return Array.isArray(value)
        ? null
        : `${where} is ${JSON.stringify(value)}, and it has to be a JSON list.`
    }
    if (typeof value !== 'object' || Array.isArray(value)) {
      return `${where} is ${JSON.stringify(value)}, and it has to be a JSON object.`
    }
    return null
  }
  if (facts.dataType === 'boolean') {
    return typeof value === 'boolean' ? null : `${where} is ${JSON.stringify(value)}, and it has to be true or false.`
  }
  if (facts.dataType === 'number') {
    return typeof value === 'number' && Number.isFinite(value) ? null : `${where} is ${JSON.stringify(value)}, and it has to be a number.`
  }
  return typeof value === 'string' ? null : `${where} is ${JSON.stringify(value)}, and it has to be text.`
}

// ============================================================================ reading the database

/**
 * Every stored row of a region, keyed by its primary key, with JSON columns already parsed.
 *
 * The rows are read one at a time. A text longer than READ_AGAIN_FROM outside the key is not held: it is read again by
 * the row's key each time it is asked for, after the reading of the rows has ended, and checked to be the text read
 * first. A text that is not is thrown, so the import writes nothing.
 */
function storedRows(region: AuthoredRegion): Map<string, Record<string, unknown>> {
  const facts = COLUMNS[region] ?? new Map<string, ColumnFacts>()
  const tsOf = new Map<string, string>()
  for (const [tsName, column] of facts) tsOf.set(column.sql, tsName)
  const jsonBlocks = new Set<string>(columnsOf(region).jsonBlocks)
  const keyColumns = PRIMARY_KEY[region] ?? []
  const keySql = keyColumns.map((tsName) => facts.get(tsName)?.sql ?? tsName)
  /** A column's value as the import compares it, from the stored text or number. */
  const asCompared = (tsName: string, value: unknown): unknown => {
    const column = facts.get(tsName)
    if (column?.dataType === 'boolean') return value === null ? null : Boolean(value)
    if (column?.dataType === 'json' || jsonBlocks.has(tsName)) return parseStored(value)
    return value ?? null
  }
  /** By SQL column, the statement that reads one stored value again by the row's key, prepared when first asked for. */
  const again = new Map<string, Database.Statement>()
  const readAgain = (sqlName: string, tsName: string, by: readonly unknown[], digest: string) => (): unknown => {
    let statement = again.get(sqlName)
    if (statement === undefined) {
      statement = sqlite.prepare(`SELECT "${sqlName}" AS value FROM ${region} WHERE ${keySql.map((name) => `"${name}" IS ?`).join(' AND ')}`)
      again.set(sqlName, statement)
    }
    const found = statement.get(...by) as { value: unknown } | undefined
    if (typeof found?.value !== 'string' || digestOf(found.value) !== digest) {
      throw new Error(`The stored ${region} row ${by.map(String).join(' · ')}: ${tsName} read again is not what was read first, so the import writes nothing.`)
    }
    return asCompared(tsName, found.value)
  }

  const out = new Map<string, Record<string, unknown>>()
  for (const raw of sqlite.prepare(`SELECT * FROM ${region}`).iterate() as IterableIterator<Record<string, unknown>>) {
    const by = keySql.map((name) => raw[name])
    const row: Record<string, unknown> = {}
    for (const [sqlName, value] of Object.entries(raw)) {
      const tsName = tsOf.get(sqlName)
      // A column in the file that the schema does not declare cannot be compared, because nothing
      // says what it means. tests/schema-tables.test.ts is what reports that; it is skipped here.
      if (tsName === undefined) continue
      if (typeof value === 'string' && value.length > READ_AGAIN_FROM && !keyColumns.includes(tsName)) {
        readAgainWhenAsked(row, tsName, readAgain(sqlName, tsName, by, digestOf(value)))
      } else row[tsName] = asCompared(tsName, value)
    }
    keepStoredHistoryDigests(String(region),row,raw)
    out.set(keyOf(region, row), row)
  }
  return out
}

/**
 * A stored JSON column as a value, or the sentinel below when the text will not parse.
 *
 * A column that does not parse compares as different from everything, so the import rewrites it
 * with the archive's version — the one case where the archive is unambiguously better than what is
 * stored. It is not silent: that row appears in the plan as an update naming that column, which is
 * the same way every other changed value is reported.
 */
const UNPARSEABLE = Symbol('a stored JSON column whose text will not parse')
function parseStored(value: unknown): unknown {
  if (value === null || value === undefined) return null
  if (typeof value !== 'string') return UNPARSEABLE
  try {
    return JSON.parse(value) as unknown
  } catch {
    return UNPARSEABLE
  }
}

// ============================================================================ the plan

/**
 * One statement the transaction will run, kept as data so the plan can be read before it is run. Its values are worked
 * out by `params` when it runs, so a long value is read again then and not held from the plan to the write.
 */
interface Write {
  sql: string
  params: () => unknown[]
}

/**
 * A title nothing else can be holding, for parking a record on while other titles move.
 *
 * WHAT IT WAS BUILT FOR. `records_title_idx` was UNIQUE(workspace_id, title) until 17 August 2026,
 * and an index is checked per statement, so a swap or a pipeline rename could not be applied one
 * row at a time: the second UPDATE failed on a title the first had not released yet. Every existing
 * record whose title changes is parked here first and given its real
 * title afterwards, inside the same transaction, so a failure anywhere rolls the whole thing back
 * and no staging title can ever be observed.
 *
 * THE CONSTRAINT IT AVOIDS IS GONE, AND THE PARKING STILL RUNS. `0030_titles_may_repeat` made that
 * index plain, so SQLite would now accept the intermediate state a swap passes through and nothing
 * in this file depends on the parking any more. It is left in place rather than removed in passing.
 *
 * SO SAY PLAINLY WHAT IT NOW DOES AND DOES NOT PREVENT. It prevents nothing. Every UPDATE it defends
 * against would succeed without it, because two records may hold one title. What it still costs is
 * one extra UPDATE per renamed record inside the transaction, and the `stagingCollision` check that
 * runs before it.
 *
 * WHAT TAKING IT OUT WOULD TAKE, so the next reader is deciding rather than guessing: delete this
 * function, the `staging` list and the `parked` list in `buildPlan`, the `region === 'records' &&
 * differing.includes('title')` branch that fills them, the `stagingCollision` call beneath it and
 * `stagingCollision` itself; then the two tests that drive them — the staging-collision refusal and
 * the title-swap round trip in tests/import-conflicts.test.ts — either go or are rewritten to prove
 * a swap still imports without any parking. That is a decision to make on purpose, not a side
 * effect of correcting this paragraph.
 *
 * It is built from the record's own id, which is unique, wrapped in U+0001 — a character no title
 * anybody types could hold. It is written as an ESCAPE rather than as the byte itself, because a
 * literal control character in a source file is invisible in an editor and makes grep treat the
 * whole file as binary.
 *
 * The import still CHECKS it — see `stagingCollision` — because "no title could hold this" is
 * exactly the kind of confident sentence that turns into a UNIQUE constraint failure naming a title
 * that looks nothing like the one being written.
 *
 * EXPORTED ONLY SO THE TEST THAT DRIVES THAT CHECK CAN BUILD A COLLIDING TITLE FROM THIS
 * DECLARATION. A test that retyped the prefix would keep passing after the prefix changed, and
 * would then be proving nothing about a branch nothing else can reach.
 */
export function stagingTitle(id: string): string {
  return `\u0001mole-office-import-staging\u0001${id}`
}

/**
 * Work out everything: what the archive says, what the database says, and what would change.
 *
 * Called by `planImport` outside a transaction and by `applyImport` INSIDE one, so that what is
 * applied is decided against the same database state that is written to. Nothing here writes.
 */
function buildPlan(root: string): { plan: ImportPlan; writes: Write[] } {
  const refusals: ImportRefusal[] = []
  const notes: string[] = []

  // ------------------------------------------------------------------ is there an archive at all
  let there = false
  try {
    there = statSync(root).isDirectory()
  } catch {
    there = false
  }
  if (!there) {
    return {
      plan: {
        root,
        format: FORMAT_VERSION,
        ok: false,
        refusals: [
          {
            path: '',
            line: 0,
            problem:
              `there is no directory at ${root} to import from. An export writes one there; run ` +
              '`npx tsx scripts/export.ts` first, or point the import somewhere else with --from.',
          },
        ],
        notes: [],
        read: zeroed(),
        inserts: zeroed(),
        updates: zeroed(),
        unchanged: zeroed(),
        notInArchive: zeroed(),
        rows: [],
      },
      writes: [],
    }
  }

  const read = readFiles(root)
  refusals.push(...read.refusals)
  const archive = collectRows(read.files)
  refusals.push(...archive.refusals)
  for (const [table, paths] of archive.leftOut) {
    notes.push(
      `${paths.length} ${table} row${paths.length === 1 ? '' : 's'} in this archive ${paths.length === 1 ? 'was' : 'were'} not imported ` +
        `(${[...new Set(paths)].sort(byCodeUnit).join(', ')}). Since 29 September 2026 ` +
        `${table} is left out of every backup and export, so an import writes none of its rows. The table is still in the database.`,
    )
  }

  // ------------------------------------------------------------------ the manifest, as a fence
  const counts = zeroed()
  for (const region of EXPORTED_REGIONS) counts[region] = (archive.rows.get(region) ?? []).length
  checkManifest(archive, counts, refusals, notes)
  checkMigrations(archive, refusals, notes)
  const aliasEra=archive.migrations.some(row=> (typeof row.fields['when']==='number' && row.fields['when']>=registryAliasMigrationWhen()) || (typeof row.fields['tag']==='string' && row.fields['tag'].endsWith('_'+REGISTRY_ALIAS_MIGRATION_SLUG)))
  const aliasCapability=archive.manifest?.fields['registryAliases']
  const byteCapability=archive.manifest?.fields['historyBytes']
  if ((aliasEra && aliasCapability!==REGISTRY_ALIAS_ARCHIVE_VERSION) || (aliasCapability!==undefined && aliasCapability!==REGISTRY_ALIAS_ARCHIVE_VERSION)) refusals.push({path:'MANIFEST.md',line:0,problem:'This archive requires supported permanent registry alias metadata.'})
  const strictHistoryBytes=(counts['registry_aliases']??0)>0 || archive.historyBytes.length>0 || byteCapability!==undefined
  // An export writes the pages of HISTORY_BYTES_VERSION; an archive of the first capability, one envelope, still imports.
  const readable=byteCapability===HISTORY_BYTES_VERSION || byteCapability===FIRST_HISTORY_BYTES_VERSION
  if (strictHistoryBytes && !readable) refusals.push({path:'MANIFEST.md',line:0,problem:HISTORY_BYTES_REFUSALS.unsupported})
  if(readable) {
    const extra=byteCapability===FIRST_HISTORY_BYTES_VERSION ? archive.historyBytes.slice(1) : []
    for(const envelope of extra) refusals.push({path:envelope.page.path,line:envelope.page.line,problem:ONE_ENVELOPE})
    if(archive.historyBytes.length===0) refusals.push({path:'MANIFEST.md',line:0,problem:'The required history bytes envelope is missing.'})
    else if(extra.length===0) try {acceptHistoryBytes(archive.historyBytes,byteCapability,archive.rows)} catch(error) {
      if(!(error instanceof HistoryBytesRefused)) throw error
      refusals.push({path:error.path,line:error.line,problem:error.message})
    }
  }

  // ------------------------------------------------------------------ every row's columns
  const good = new Map<AuthoredRegion, ArchiveRow[]>()
  for (const region of EXPORTED_REGIONS) {
    good.set(
      region,
      (archive.rows.get(region) ?? []).filter((row) => checkRow(row, refusals)),
    )
  }

  // ------------------------------------------------------------------ two rows, one identity
  const byKey = new Map<AuthoredRegion, Map<string, ArchiveRow>>()
  for (const region of EXPORTED_REGIONS) {
    const seen = new Map<string, ArchiveRow>()
    for (const row of good.get(region) ?? []) {
      const key = keyOf(region, row.values)
      const already = seen.get(key)
      if (already !== undefined) {
        refusals.push({ path: row.path, line: row.line, problem: aSecondRowClaiming(region, key, already) })
        continue
      }
      seen.set(key, row)
    }
    byKey.set(region, seen)
  }

  // ------------------------------------------------------------------ the closed vocabularies
  checkGates(byKey.get('links') ?? new Map(), refusals)
  checkIntent(byKey.get('presentation_intent') ?? new Map(), refusals)
  checkActorTypes(byKey, refusals, notes)
  checkWarrants(byKey, refusals, notes)
  checkRevisionOps(byKey.get('revisions') ?? new Map(), notes)
  checkRevisionHashes(byKey.get('revisions') ?? new Map(), refusals)
  checkDataIsJson(byKey, refusals)
  reportUnrecognised(byKey, notes)
  reportSettledForks(byKey, notes)

  // ------------------------------------------------------------------ what is already stored
  const stored: Record<string, Map<string, Record<string, unknown>>> = {}
  for (const region of EXPORTED_REGIONS) stored[region] = storedRows(region)
  checkOlderCastingRows(archive, byKey.get('casting_rows') ?? new Map(), stored['casting_rows'] ?? new Map(), refusals, notes)
  // Before anything reads what is stored, so every check below reads the database as the import leaves it.
  const givesWay = theFreshOfficeRowGivesWay(byKey.get('agents') ?? new Map(), stored, refusals, notes)

  checkAliasImport(byKey,stored,refusals)
  checkTheOfficeFieldsInTheArchive(byKey, stored['records'] ?? new Map(), refusals)
  reportOrigins(byKey.get('records') ?? new Map(), stored['records'] ?? new Map(), notes)
  reportAbsentProofs(byKey, stored, notes)
  reportAbsentSignedItems(byKey, stored, notes)
  reportAbsentPresses(byKey, stored, notes)
  // Archives before the pixel view had no appearance column. Silence cannot erase a later choice.
  const oldAppearances = [...(byKey.get('agents') ?? new Map<string, ArchiveRow>())].filter(([, row]) => !('pixelAppearance' in row.values))
  if (oldAppearances.length > 0) {
    const updates = oldAppearances.filter(([key]) => stored['agents']?.has(key)).length
    notes.push(`${oldAppearances.length} agent row(s) have no pixelAppearance field. These pre-pixel archives insert ${oldAppearances.length - updates} new row(s) with no chosen appearance and leave the saved appearance of ${updates} existing row(s) unchanged.`)
  }
  // Archives before migration 0193 say nothing about who made a link, by kind, or what sort of stage a gate names.
  {
    const unsaid = [...(byKey.get('links') ?? new Map<string, ArchiveRow>())].filter(([, row]) => !('createdByType' in row.values) || !('gateUpToSort' in row.values))
    if (unsaid.length > 0) {
      const kept = unsaid.filter(([key]) => stored['links']?.has(key)).length
      notes.push(`${unsaid.length} link row(s) say nothing about whether a person or an agent made them, or what sort of stage their gate names, because the archive was written before migration 0193. ${unsaid.length - kept} new row(s) are inserted with neither recorded, and ${kept} existing row(s) keep what is stored.`)
    }
  }
  // Archives before migration 0183 say nothing about the language a person chose for the pages.
  {
    const unsaid = [...(byKey.get('people') ?? new Map<string, ArchiveRow>())].filter(([, row]) => !('language' in row.values))
    if (unsaid.length > 0) {
      const kept = unsaid.filter(([key]) => stored['people']?.has(key)).length
      notes.push(`${unsaid.length} people row(s) say nothing about the language chosen for the pages, because the archive was written before migration 0183. ${unsaid.length - kept} new row(s) are inserted with no language chosen, and ${kept} existing row(s) keep what is stored.`)
    }
  }
  theOfficeKeepsItsOwner(byKey.get('people') ?? new Map(), stored['people'] ?? new Map(), notes)
  // Archives before migration 0311 say nothing about whose id four columns hold.
  for (const region of ['folder_readings', 'revalidations', 'conversation_reads'] as const) {
    const unsaid = [...(byKey.get(region) ?? new Map<string, ArchiveRow>())].filter(([, row]) => (MAY_BE_ABSENT[region] ?? []).some((field) => !(field in row.values)))
    if (unsaid.length === 0) continue
    const kept = unsaid.filter(([key]) => stored[region]?.has(key)).length
    notes.push(`${unsaid.length} ${region} row(s) say nothing about whether a person's id or an agent's is stored in them, because the archive was written before migration 0311. ${unsaid.length - kept} new row(s) are inserted with no kind, so each is counted as an id that cannot be told and a project's archive is refused while one is, and ${kept} existing row(s) keep what is stored.`)
  }
  // Archives before migration 0337 say nothing about what a drawn face is drawn from.
  {
    const unsaid = [...(byKey.get('assets') ?? new Map<string, ArchiveRow>())].filter(([, row]) => !('drawnFrom' in row.values))
    if (unsaid.length > 0) {
      const kept = unsaid.filter(([key]) => stored['assets']?.has(key)).length
      notes.push(`${unsaid.length} assets row(s) say nothing about what a drawn face is drawn from, because the archive was written before migration 0337. ${unsaid.length - kept} new row(s) are inserted with drawn_from null, so each is drawn from the participant its key names, and ${kept} existing row(s) keep what is stored.`)
    }
  }
  // Archives before migrations 0338 and 0341 to 0345 say nothing about a project's master pipeline or its package
  // inspection, or about a person's own message labels, chat layout and agent tags. Silence cannot erase a stored
  // choice, so the plan says how many rows are inserted with null and how many keep what is stored.
  {
    const unsaidPeople = [...(byKey.get('people') ?? new Map<string, ArchiveRow>())].filter(([, row]) => ['chatLabels', 'chatLayout', 'agentTags'].some((field) => !(field in row.values)))
    if (unsaidPeople.length > 0) {
      const kept = unsaidPeople.filter(([key]) => stored['people']?.has(key)).length
      notes.push(`${unsaidPeople.length} people row(s) say nothing about one or more of their own message labels, how the chat is laid out, and their own agent tags, because the archive was written before one of migrations 0341, 0343 and 0344 added them. ${unsaidPeople.length - kept} new row(s) are inserted with a null wherever the archive says nothing, and ${kept} existing row(s) keep what is stored.`)
    }
    const unsaidProjects = [...(byKey.get('workspaces') ?? new Map<string, ArchiveRow>())].filter(([, row]) => ['packageInspection', 'masterPipeline'].some((field) => !(field in row.values)))
    if (unsaidProjects.length > 0) {
      const kept = unsaidProjects.filter(([key]) => stored['workspaces']?.has(key)).length
      notes.push(`${unsaidProjects.length} workspaces row(s) say nothing about the project's master pipeline or whether its handed-back package points are inspected, because the archive was written before migrations 0338 and 0345 added them. ${unsaidProjects.length - kept} new row(s) are inserted with a null wherever the archive says nothing, and ${kept} existing row(s) keep what is stored.`)
    }
  }
  // Archives before migration 0354 say nothing about the mode a person starts in, because every person then started in
  // Normal mode.
  {
    const unsaid = [...(byKey.get('people') ?? new Map<string, ArchiveRow>())].filter(([, row]) => !('startingMode' in row.values))
    if (unsaid.length > 0) {
      const kept = unsaid.filter(([key]) => stored['people']?.has(key)).length
      notes.push(`${unsaid.length} people row(s) say nothing about the mode the person starts in, because the archive was written before migration 0354. ${unsaid.length - kept} new row(s) are inserted with no starting mode, which is read as Normal mode, and ${kept} existing row(s) keep what is stored.`)
    }
  }
  // Archives before migration 0351 say nothing about a value a revision stores once, because no revision did then.
  {
    const unsaid = [...(byKey.get('revisions') ?? new Map<string, ArchiveRow>())].filter(([, row]) => !('parts' in row.values))
    if (unsaid.length > 0) {
      const kept = unsaid.filter(([key]) => stored['revisions']?.has(key)).length
      notes.push(`${unsaid.length} revisions row(s) say nothing about a value stored once, because the archive was written before migration 0351, when every revision held its data whole. ${unsaid.length - kept} new row(s) are inserted with parts null, which says the same, and ${kept} existing row(s) keep what is stored.`)
    }
  }
  // Archives before migration 0356 say nothing about when this office began to keep the hand-overs of an agent's owner.
  {
    const unsaid = [...(byKey.get('installation') ?? new Map<string, ArchiveRow>())].filter(([, row]) => !('ownerChangesSince' in row.values))
    if (unsaid.length > 0) {
      const kept = unsaid.filter(([key]) => stored['installation']?.has(key)).length
      notes.push(`${unsaid.length} installation row(s) say nothing about when this office began to keep the hand-overs of an agent's owner, because the archive was written before migration 0356. ${unsaid.length - kept} new row(s) are inserted with no such moment, so their page says it was not recorded, and ${kept} existing row(s) keep what is stored.`)
    }
  }
  // Archives before migration 0181 say nothing about how anybody wishes to be addressed.
  for (const region of ['people', 'agents'] as const) {
    const unsaid = [...(byKey.get(region) ?? new Map<string, ArchiveRow>())].filter(([, row]) => ADDRESS_AS_FIELDS.every((field) => !(field in row.values)))
    if (unsaid.length === 0) continue
    const kept = unsaid.filter(([key]) => stored[region]?.has(key)).length
    notes.push(`${unsaid.length} ${region} row(s) say nothing about how they wish to be addressed, because the archive was written before migration 0181. ${unsaid.length - kept} new row(s) are inserted with no part set, and ${kept} existing row(s) keep what is stored.`)
  }
  // Archives before the residents' migration say nothing about who is a permanent resident.
  {
    const unsaid = [...(byKey.get('agents') ?? new Map<string, ArchiveRow>())].filter(([, row]) => RESIDENCY_FIELDS.every((field) => !(field in row.values)))
    if (unsaid.length > 0) {
      const kept = unsaid.filter(([key]) => stored['agents']?.has(key)).length
      notes.push(`${unsaid.length} agent row(s) say nothing about permanent residency, because the archive was written before the residents' migration. ${unsaid.length - kept} new row(s) are inserted as no resident, and ${kept} existing row(s) keep what is stored.`)
    }
  }
  // Archives before the run-keys mark leave existing restrictions on writes untouched.
  {
    const unsaid = [...(byKey.get('agents') ?? new Map<string, ArchiveRow>())].filter(([, row]) => !('runKeysOnly' in row.values))
    if (unsaid.length > 0) {
      const kept = unsaid.filter(([key]) => stored['agents']?.has(key)).length
      notes.push(`${unsaid.length} agent row(s) say nothing about the run-keys mark, because the archive was written before the migration that added the run-keys mark. ${unsaid.length - kept} new row(s) are inserted with the mark 0, and ${kept} existing row(s) keep what is stored.`)
    }
  }
  {
    const unsaid = [...(byKey.get('agents') ?? new Map<string, ArchiveRow>())].filter(([, row]) => !('ownerId' in row.values))
    if (unsaid.length > 0) {
      const kept = unsaid.filter(([key]) => stored['agents']?.has(key)).length
      notes.push(`${unsaid.length} agent row(s) have no ownerId. ${ABSENT_OWNER_RULE} ${unsaid.length - kept} new row(s) derive their owners; ${kept} existing row(s) keep their owners.`)
    }
  }
  const oldSizes = [...(byKey.get('agents') ?? new Map<string, ArchiveRow>()).values()].filter(row => !('pixelScale' in row.values))
  if (oldSizes.length) notes.push(`${oldSizes.length} agent row(s) have no map size. Existing sizes stay saved; new rows receive a generated size from their recorded role.`)
  checkTitles(byKey.get('records') ?? new Map(), stored['records'] ?? new Map(), refusals)
  checkHandles(byKey.get('agents') ?? new Map(), stored['agents'] ?? new Map(), refusals)
  checkLinkPairs(byKey.get('links') ?? new Map(), stored['links'] ?? new Map(), refusals)
  checkReferences(byKey, stored, refusals, notes)
  checkWorkspaces(byKey, stored, refusals)
  checkPipelineLists(byKey, stored, refusals)
  checkAppendOnly(byKey.get('changes') ?? new Map(), stored['changes'] ?? new Map(), refusals)
  const placeOf = appendOrderOfTheInserts(byKey.get('changes') ?? new Map(), stored['changes'] ?? new Map(), refusals, notes)
  checkLedger(byKey.get('session_resources') ?? new Map(), stored['session_resources'] ?? new Map(), refusals, notes)
  checkRevisionNumbers(byKey.get('revisions') ?? new Map(), stored['revisions'] ?? new Map(), refusals, notes)

  // ------------------------------------------------------------------ the reads, one row per key
  const readsLeftOut = theReadsAnImportLeavesOut(byKey.get('conversation_reads') ?? new Map(), stored['conversation_reads'] ?? new Map())
  const readsNote = whatTheReadsNoteSays(readsLeftOut, givesWay.length > 0)
  if (readsNote !== null) notes.push(readsNote)

  // ------------------------------------------------------------------ the diff, and the statements
  const inserts = zeroed()
  const updates = zeroed()
  const unchanged = zeroed()
  const notInArchive = zeroed()
  const rows: ImportRowChange[] = []
  const writes: Write[] = []
  const staging: Write[] = []
  /** The ids parked on a staging title, so the collision check is about exactly those and no others. */
  const parked: string[] = []
  // A FRESH OFFICE'S OWN ROW GOES BEFORE ANYTHING IS INSERTED, and before its picture, which it holds by a foreign key.
  for (const gone of givesWay) writes.push({ sql: `DELETE FROM ${gone.region} WHERE id = ?`, params: () => [gone.key] })

  for (const region of EXPORTED_REGIONS) {
    const incoming = byKey.get(region) ?? new Map<string, ArchiveRow>()
    const have = stored[region] ?? new Map<string, Record<string, unknown>>()
    // THE CHANGE LOG IS INSERTED IN ITS APPEND ORDER, so SQLite's rowids follow the same order as
    // `append_order`. Some readers still order change rows by rowid (lib/start-cost.ts, lib/honour.ts,
    // lib/inspection.ts); inserted in this order, a restore gives them the order the origin had.
    const inOrder =
      region === 'changes'
        ? [...incoming].sort((a, b) => (placeOf.get(a[0]) ?? Infinity) - (placeOf.get(b[0]) ?? Infinity) || byCodeUnit(a[0], b[0]))
        : [...incoming].sort((a, b) => byCodeUnit(a[0], b[0]))
    // A HELD READ A NEWER ONE REPLACES IS DELETED BEFORE THE READS ARE INSERTED, so the unique index never holds two.
    const replaced = region === 'conversation_reads' ? [...readsLeftOut.heldHere].sort(byCodeUnit) : []
    for (const key of replaced) {
      rows.push({ region, key, action: 'delete', columns: [], path: '' })
      writes.push({ sql: 'DELETE FROM conversation_reads WHERE id = ?', params: () => [key] })
    }
    for (const gone of givesWay) if (gone.region === region) rows.push({ region, key: gone.key, action: 'delete', columns: [], path: '' })
    for (const [key, row] of inOrder) {
      if (region === 'conversation_reads' && (readsLeftOut.fromTheArchive.has(key) || readsLeftOut.heldHere.has(key))) continue
      const current = have.get(key)
      if (region === 'changes' && current === undefined) row.values['appendOrder'] = placeOf.get(key) ?? null
      if (region === 'agents' && (row.values['pixelScale'] === null || (current === undefined && !('pixelScale' in row.values)))) {
        row.values['pixelScale'] = JSON.stringify(generatePixelScale(String(row.values['id']), typeof row.values['role'] === 'string' ? row.values['role'] : null))
        notes.push(`Agent ${key}: the archive records no map size; a fixed cosmetic size will be generated and saved.`)
      }
      if (region === 'agents' && !('ownerKind' in row.values) && 'ownerId' in row.values) {
        if (current === undefined) row.values['ownerKind'] = row.values['ownerId'] === null ? null : 'agent'
        else delete row.values['ownerId']
      }
      if (current === undefined) {
        bump(inserts, region)
        rows.push({ region, key, action: 'insert', columns: [], path: row.path })
        writes.push(insertStatement(region, row.values))
        if (region === 'agents' && !('ownerId' in row.values)) {
          writes.push({ sql: `${AGENT_OWNER_BACKFILL} AND id = ?`, params: () => [key] })
        }
        continue
      }
      const differing = differingColumns(region, row.values, current)
      if (differing.length === 0) {
        bump(unchanged, region)
        continue
      }
      bump(updates, region)
      rows.push({ region, key, action: 'update', columns: differing, path: row.path })
      if (region === 'records' && differing.includes('title')) {
        const id = String(row.values['id'])
        parked.push(id)
        staging.push(updateStatement(region, key, { title: stagingTitle(id) }, ['title'], current))
      }
      writes.push(updateStatement(region, key, row.values, differing, current))
    }
    for (const key of have.keys()) if (!incoming.has(key) && !replaced.includes(key)) bump(notInArchive, region)
  }

  stagingCollision(parked, byKey.get('records') ?? new Map(), stored['records'] ?? new Map(), refusals)

  // THE LEDGER, LAST, because it is about the state every write above would leave behind. The rows
  // it adds are in `rows` and in `inserts` like any other, so the plan a person reads before an
  // import shows them.
  for (const write of keepTheLedgerTrue(root, byKey, stored, rows, notes)) {
    bump(inserts, 'revisions')
    rows.push({ region: 'revisions', key: write.revisionId, action: 'insert', columns: [], path: '' })
    writes.push(write.write)
  }

  const absent = EXPORTED_REGIONS.filter((region) => (notInArchive[region] ?? 0) > 0)
  if (absent.length > 0) {
    notes.push(
      `${absent.map((region) => `${notInArchive[region] ?? 0} ${region}`).join(', ')} row(s) are in the database and are not ` +
        'mentioned by this archive. NO ROW WAS DELETED for not being in it: an archive says what it holds, never what to remove, so a ' +
        'week-old backup cannot make a record disappear. It CAN write one back to what it said a week ago — a row ' +
        'the archive also holds is restored whole, so anything added inside it since the export is not there ' +
        'afterwards. Export again if you want the archive to match.',
    )
  }

  const plan: ImportPlan = {
    root,
    format: FORMAT_VERSION,
    ok: refusals.length === 0,
    refusals: refusals.sort((a, b) => byCodeUnit(a.path, b.path) || a.line - b.line || byCodeUnit(a.problem, b.problem)),
    notes,
    read: counts,
    inserts,
    updates,
    unchanged,
    notInArchive,
    rows,
  }
  // Staging first: every renamed record is parked before any real title is written. That order was
  // required while `records_title_idx` was UNIQUE, because two records swapping names would fail on
  // the second statement. The index is plain since `0030_titles_may_repeat`, so nothing would fail
  // now; the order is kept because the two lists are still built separately. See `stagingTitle`.
  return { plan, writes: [...staging, ...writes] }
}

/**
 * THE READS AN IMPORT LEAVES OUT, so `conversation_reads` keeps one row for each reader in each conversation in each
 * project, as migration 0278 left it. The older reads are lost on
 * purpose, in wave 13s round 64.
 *
 * An archive written before 0278 holds a row for every read, and the table's unique index would refuse the second read
 * of a key and roll the whole import back, after a preview that said it would go through. So each read is taken through
 * `aReadMovesTheReadPoint` in src/server/lib/messages.ts, the rule `recordThatSomebodyRead` writes by, against the read
 * held for its key:
 *   - first the rows the database holds, as the import will leave them: a row the archive also carries is written back
 *     to the archive's version, so that version is the one held;
 *   - then each read only the archive carries, in the order the import inserts them, which is the order of their ids.
 * A read that does not move the read point is left out. A read that moves it replaces the one held: a replaced read
 * from the archive is left out, and a replaced read held in the database is deleted before the reads are inserted.
 *
 * A TIE IN ONE SECOND FROM DIFFERENT SIDES KEEPS THE LATER ID. Migration 0278 breaks it by rowid, the read written
 * last, but an archive carries no rowid. Restores before this one wrote these rows in id order, so a restored database
 * broke such a tie by id already. An exact repeat, from the same side in the same second, keeps the earlier id: the
 * later one does not move the read point, so by the rule it writes nothing, and both hold the same read.
 */
function theReadsAnImportLeavesOut(
  incoming: Map<string, ArchiveRow>,
  have: Map<string, Record<string, unknown>>,
): { fromTheArchive: Set<string>; heldHere: Set<string> } {
  const keyOfARead = (row: Record<string, unknown>): string =>
    JSON.stringify([row['workspaceId'], row['readerKind'], row['readerId'], row['pair']])
  const asARead = (row: Record<string, unknown>): { asSide: string; at: string } => ({ asSide: String(row['asSide']), at: String(row['at']) })
  const held = new Map<string, { id: string; read: { asSide: string; at: string }; inTheDatabase: boolean }>()
  for (const [id, stored] of have) {
    const row = incoming.get(id)?.values ?? stored
    held.set(keyOfARead(row), { id, read: asARead(row), inTheDatabase: true })
  }
  const fromTheArchive = new Set<string>()
  const heldHere = new Set<string>()
  for (const [id, row] of [...incoming].sort((a, b) => byCodeUnit(a[0], b[0]))) {
    if (have.has(id)) continue
    const key = keyOfARead(row.values)
    const before = held.get(key)
    const read = asARead(row.values)
    if (!aReadMovesTheReadPoint(before?.read, read)) {
      fromTheArchive.add(id)
      continue
    }
    if (before !== undefined) (before.inTheDatabase ? heldHere : fromTheArchive).add(before.id)
    held.set(key, { id, read, inTheDatabase: false })
  }
  return { fromTheArchive, heldHere }
}

/**
 * The note that says how many reads the import leaves out and which it keeps, or null when it leaves out none. `officeRowGivesWay`
 * says whether this office's own row and its picture are deleted as well (`theFreshOfficeRowGivesWay`). Exported so a test reads
 * the note from here and never copies its words.
 */
export function whatTheReadsNoteSays(leftOut: { fromTheArchive: Set<string>; heldHere: Set<string> }, officeRowGivesWay: boolean): string | null {
  const fromTheArchive = leftOut.fromTheArchive.size
  const heldHere = leftOut.heldHere.size
  if (fromTheArchive + heldHere === 0) return null
  return (
    `${fromTheArchive + heldHere} conversation_reads row(s) were left out: ${fromTheArchive} in this archive, and ${heldHere} held in this ` +
    'database that a newer read in this archive replaces. Each reader keeps one read of each conversation in each project, the ' +
    'newest, and a newer read replaces it. The older reads are not restored. Of two reads in one second from different sides, ' +
    'the one with the later id is kept, because an archive does not say which was written last.' +
    (heldHere === 0
      ? ''
      : officeRowGivesWay
        ? ` The ${heldHere} held row(s) are deleted. The only other rows this import deletes are this office's own row and its picture.`
        : ` The ${heldHere} held row(s) are deleted, and they are the only rows this import deletes.`)
  )
}

/**
 * An archive may restore a value the office wrote, with the archive's own history as evidence.
 * Only THE_OFFICE writes these fields. Other office actors do not own them. A create change holds
 * the title, so its matching office create revision supplies the value. An update change holds
 * the value itself. Neither permits a different value, another record's value, or a dropped field.
 * A closed-unchecked archive instead names the keyed closer in its matching change row.
 */
function checkTheOfficeFieldsInTheArchive(
  byKey: Map<AuthoredRegion, Map<string, ArchiveRow>>,
  stored: Map<string, Record<string, unknown>>,
  refusals: ImportRefusal[],
): void {
  const changes = [...(byKey.get('changes') ?? new Map<string, ArchiveRow>()).values()].map((row) => row.values)
  const revisions = [...(byKey.get('revisions') ?? new Map<string, ArchiveRow>()).values()].map((row) => row.values)
  const archiveAgents: KnownParticipant[] = [...(byKey.get('agents')?.values() ?? [])].map(({ values }) => ({
    who: { kind: 'agent', id: String(values['id']) }, name: String(values['name']), handle: String(values['handle']),
  }))
  const byTheOffice = (row: Record<string, unknown>) => row['actorType'] === THE_OFFICE.type && row['actorId'] === THE_OFFICE.id
  for (const [id, row] of byKey.get('records') ?? new Map<string, ArchiveRow>()) {
    const incoming = row.values['data'] as Record<string, unknown>
    const held = stored.get(id)?.['data']
    const compared = { ...(held !== null && typeof held === 'object' && !Array.isArray(held) ? held as Record<string, unknown> : {}) }
    for (let moved = anOfficeOnlyFieldAWholeDataWouldMove(compared, incoming); moved !== null; moved = anOfficeOnlyFieldAWholeDataWouldMove(compared, incoming)) {
      const value = incoming[moved.field]
      const recorded = moved.move !== 'dropped' && changes.some((change) => {
        if (change['recordId'] !== id || !byTheOffice(change)) return false
        if (change['op'] === 'update' && change['field'] === 'data.' + moved.field) return sameValue(parseStored(change['newValue']), value)
        return change['op'] === 'create' && change['field'] === null && revisions.some((revision) =>
          revision['recordId'] === id && revision['op'] === 'create' && byTheOffice(revision) &&
          sameValue((revision['data'] as Record<string, unknown>)[moved.field], value))
      })
      if (!recorded) refusals.push({ path: row.path, line: row.line, status: 403, problem: `${moved.refusal} The archive would write record ${id}.` })
      // Account for this field, whether accepted or refused, so the same question checks the other.
      if (value === undefined) delete compared[moved.field]
      else compared[moved.field] = value
    }
    // The closure door writes one complete stamp, with the caller's key proof on its change row.
    const closureOn = (data: unknown): unknown => {
      if (typeof data !== 'object' || data === null || Array.isArray(data)) return undefined
      return (data as Record<string, unknown>)['closedUnchecked']
    }
    const value = closureOn(incoming)
    if (!sameValue(closureOn(held), value)) {
      const closed = readClosedUnchecked(value)
      const recorded = closed !== null && changes.some((change) => {
        if (change['recordId'] !== id || change['op'] !== 'update') return false
        const keyed = closed.by.kind === 'person' ? change['provedBy'] === 'the-person-key' : change['provedBy'] === 'an-agent-key'
        const sameWriter = change['actorType'] === (closed.by.kind === 'person' ? 'human' : 'agent') &&
          (closed.by.kind === 'person' ? change['actorId'] === closed.by.id :
            theAgentAStoredSenderNames({ kind: 'agent', id: String(change['actorId']) }, archiveAgents)?.id === closed.by.id)
        if (!keyed || !sameWriter) return false
        const after = parseStored(change['newValue'])
        return change['field'] === 'data.closedUnchecked' && sameValue(after, value)
      })
      if (!recorded) refusals.push({ path: row.path, line: row.line, status: 403,
        problem: `Only ${THE_DOOR_OF.closedUnchecked} writes closedUnchecked. The archive has no matching keyed closure for record ${id}. Nothing was written.` })
    }
  }
}

/**
 * A FRESH OFFICE'S OWN ROW GIVES WAY TO THE ARCHIVE'S, WHERE NOTHING NAMES IT.
 *
 * Every office draws its own row when it is migrated (src/server/db/participants-migration.ts): an agent with the
 * office's handle, an id drawn for it, and a drawn picture. An archive of another office carries that office's own row,
 * so a restore into an office nobody has used yet would end with two live agents holding one handle, and `checkHandles`
 * would refuse it. So the office's own row is found by its handle, live, as the participants migration finds it, in the
 * archive and in the database. Where the archive holds one, with an id the database does not hold, and the database
 * holds a different one, the database's row is read for anything that names it, apart from that row itself and its
 * picture's row:
 *
 *   - every identity the census reads (`takeIdentityCensus`), which names the row where its canonical id is the row's id;
 *   - every value the census reads at a stamp or an actor pair, which names the row where the row answers to it
 *     (`everyAgentAStoredNameAnswersTo`). A value that is one of the office's own writers names no agent;
 *   - every column with a foreign key to agents.id, read from SQLite's own list of each table's keys, as the re-mint
 *     reads them (`theKeysToAnAgentsId`), and with the alias table's, which the re-mint leaves out.
 *
 * Where nothing names it, the two rows are taken out of what is stored, so every check after this one reads the database
 * as the import leaves it. They come back as the two rows the import deletes, the row first and its picture after, and a
 * note names both ids. Where anything names it, where the census cannot read a row, or where a key to agents names a
 * column that is not its id, the import is refused, the refusal names each place, and nothing is written. An archive with
 * no office row leaves the database's row as it is.
 */
function theFreshOfficeRowGivesWay(
  agents: Map<string, ArchiveRow>,
  stored: Record<string, Map<string, Record<string, unknown>>>,
  refusals: ImportRefusal[],
  notes: string[],
): { region: AuthoredRegion; key: string }[] {
  const storedAgents = stored['agents'] ?? new Map<string, Record<string, unknown>>()
  const theirs = [...agents.values()].filter((row) => row.values['handle'] === MOLE_OFFICE_HANDLE && isLive(row.values['retired']))
  const ours = [...storedAgents.values()].filter((row) => row['handle'] === MOLE_OFFICE_HANDLE && isLive(row['retired']))
  // More than one live row on either side is two agents with one handle, which `checkHandles` refuses and names.
  if (theirs.length !== 1 || ours.length !== 1) return []
  const archived = theirs[0]!
  const theirId = String(archived.values['id'])
  const ourId = String(ours[0]!['id'])
  const picture = String(ours[0]!['avatarAssetId'])
  if (theirId === ourId || storedAgents.has(theirId)) return []

  const itself = (table: string, row: string): boolean => (table === 'agents' && row === ourId) || (table === 'assets' && row === picture)
  const places: string[] = []
  const stamps: AStampAt[] = []
  const found: AnIdentityAt[] = []
  const census = takeIdentityCensus(sqlite, undefined, stamps, found)
  for (const block of census.blocks) places.push(`${block.table} row ${JSON.stringify(block.row)}, ${block.path}, which the census cannot read: it ${block.why}`)
  for (const [site, count] of Object.entries(census.untold)) places.push(`${count} row(s) at ${site}, which the census cannot read: nothing beside the value says whose it is`)
  for (const one of found) {
    if (!itself(one.table, one.row) && one.canonical === ourId) places.push(`${one.table} row ${JSON.stringify(one.row)}, ${one.path}`)
  }
  const answers = new Map<string, boolean>()
  for (const one of stamps) {
    if (itself(one.table, one.row) || isOneOfTheOfficesOwnWriters({ actorType: 'agent', actorId: one.stored })) continue
    const named = answers.get(one.stored) ?? everyAgentAStoredNameAnswersTo(sqlite, one.stored).has(ourId)
    answers.set(one.stored, named)
    if (named) places.push(`${one.table} row ${JSON.stringify(one.row)}, ${one.path}, which holds ${JSON.stringify(one.stored)}`)
  }
  const tables = sqlite.prepare("SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite\\_%' ESCAPE '\\' ORDER BY name").all() as { name: string }[]
  for (const { name } of tables) {
    const keys = sqlite.prepare('SELECT "from" AS "column", "to" AS target FROM pragma_foreign_key_list(?) WHERE "table" = ?').all(name, 'agents') as { column: string; target: string | null }[]
    if (keys.length === 0) continue
    // A row is named by the columns that key it, in their order, or by its rowid where none does.
    const key = (sqlite.prepare('SELECT name FROM pragma_table_info(?) WHERE pk > 0 ORDER BY pk').all(name) as { name: string }[]).map((column) => `"${column.name}"`)
    for (const { column, target } of keys) {
      // A key that names no column of agents is a key to its primary key, which is its id.
      if (target !== null && target !== 'id') {
        places.push(`${name}.${column}, whose foreign key is to agents.${target} and not to its id, so it is not read here`)
        continue
      }
      const naming = sqlite.prepare(`SELECT ${key.length > 0 ? key.join(', ') : 'rowid'} FROM "${name}" WHERE "${column}" = ?`).raw().all(ourId) as unknown[][]
      for (const values of naming) {
        const row = theRowNamed(values)
        if (!itself(name, row)) places.push(`${name} row ${JSON.stringify(row)}, ${column}`)
      }
    }
  }

  if (places.length > 0) {
    refusals.push({
      path: archived.path,
      line: archived.line,
      problem:
        `The archive holds its office's own row, ${theirId}, and this office holds its own, ${ourId}, which cannot make way for it, ` +
        `because ${places.length} place(s) name it or cannot be read: ${places.join('; ')}. A restore deletes an office's own row only ` +
        'where nothing names it, so that nothing is left naming a row that is gone. Nothing was imported.',
    })
    return []
  }
  storedAgents.delete(ourId)
  stored['assets']?.delete(picture)
  notes.push(
    `This office's own row, ${ourId}, was drawn when it was migrated, and nothing names it. The archive holds its office's own row, ` +
      `${theirId}. So ${ourId} and its picture, ${picture}, are deleted before anything is written, and the archive's row is inserted ` +
      'in their place.',
  )
  return [
    { region: 'agents', key: ourId },
    { region: 'assets', key: picture },
  ]
}

/** Which declared columns of an incoming row differ from what is stored. */
/**
 * THE OFFICE KEEPS ITS OWN OWNER, WHATEVER THE ARCHIVE SAYS ABOUT WHO OWNS IT.
 *
 * One person carries `people.office_owner`, and a unique index holds it to one. The owner is written
 * once, from the installer (MOLE_OFFICE_OWNER_ID), and every migrate stops the office when that
 * setting no longer names the marked person (src/server/db/owner-setting.ts). An archive that moved
 * the mark would leave an office that will not start, or one handed to a person nobody named; an
 * archive that carried a second mark would be refused by the index, and a restore is the owner's
 * own act. So, on the archive's people rows, before anything is compared:
 *
 *   - the office's owner's row: where the archive says this person is not the owner, the line is
 *     taken out, so the stored mark is kept. Where the archive marks them too, its mark comes back
 *     with the rest of the row, as every row the archive holds is restored whole.
 *   - any other person the archive marks: imported without the mark, and the notes name both people.
 *   - an archive with no `officeOwner` line (written before the owner migration): see MAY_BE_ABSENT.
 *
 * An office whose database marks nobody is left to the archive: `theOfficeOwner` refuses such an
 * office whatever is imported, and the unique index still refuses a second mark.
 */
function theOfficeKeepsItsOwner(people: Map<string, ArchiveRow>, stored: Map<string, Record<string, unknown>>, notes: string[]): void {
  const owner = [...stored].find(([, row]) => (row['officeOwner'] ?? null) !== null)?.[0]
  if (owner === undefined) return
  const unsaid = [...people.values()].filter((row) => !('officeOwner' in row.values)).length
  if (unsaid > 0) {
    notes.push(
      `${unsaid} people row(s) say nothing about who owns the office, because the archive was written before the owner ` +
        `migration. The owner stays ${JSON.stringify(owner)}: a person the archive inserts is not the owner, and the stored mark is kept.`,
    )
  }
  for (const [key, row] of people) {
    if (!('officeOwner' in row.values)) continue
    const mark = row.values['officeOwner'] ?? null
    if (key === owner) {
      if (mark === null) delete row.values['officeOwner']
      continue
    }
    if (mark === null) continue
    row.values['officeOwner'] = null
    notes.push(
      `The archive marks a different person as the owner, ${JSON.stringify(key)}; this office's owner is ` +
        `${JSON.stringify(owner)} and stays so. ${JSON.stringify(key)} is imported as a person without the mark, because ` +
        'the owner is written once, from the installer, and every start checks MOLE_OFFICE_OWNER_ID against the marked person.',
    )
  }
}

/** An older group is not a current label id. Do not invent a mapping or its source. */
function checkOlderCastingRows(
  archive: Archive,
  incoming: Map<string, ArchiveRow>,
  stored: Map<string, Record<string, unknown>>,
  refusals: ImportRefusal[],
  notes: string[],
): void {
  const fields = MAY_BE_ABSENT['casting_rows']!
  const silent = [...incoming].filter(([, row]) => fields.some((field) => !(field in row.values)))
  if (silent.length === 0) return
  const journal = JSON.parse(readFileSync(join(THE_MIGRATIONS_FOLDER, 'meta', '_journal.json'), 'utf8')) as { entries: { tag: string; when: number }[] }
  const migration = journal.entries.find((entry) => entry.tag === CASTING_LABEL_MIGRATION)
  if (migration === undefined) throw new Error(`The migration journal does not name ${CASTING_LABEL_MIGRATION}.`)
  const isOld = archive.migrations.length > 0 && archive.migrations.every((entry) =>
    typeof entry.fields['when'] === 'number' && entry.fields['when'] < migration.when && entry.fields['tag'] !== CASTING_LABEL_MIGRATION,
  )
  let kept = 0
  let ungrouped = 0
  for (const [key, row] of silent) {
    if (!isOld || fields.some((field) => field in row.values)) {
      refusals.push({ path: row.path, line: row.line, problem: `Casting row ${key} omits some label or out-until fields, but the archive does not establish a complete pre-label row.` })
    } else if (stored.has(key)) {
      const current = stored.get(key)!
      const groupChanged = !sameValue(row.values['workGroup'] ?? null, current['workGroup'] ?? null)
      const changedIdentity = ['model', 'program', 'role', 'project'].filter((field) =>
        !sameValue(row.values[field] ?? null, current[field] ?? null),
      )
      const holdsNewerCells = fields.some((field) => current[field] != null)
      if (groupChanged || (holdsNewerCells && changedIdentity.length > 0)) {
        const changed = [...changedIdentity, ...(groupChanged ? ['workGroup'] : [])]
        refusals.push({ path: row.path, line: row.line, problem: `Casting row ${key} differs in ${changed.join(', ')}. This older archive has no label or out-until cells: retaining this target's cells could attach them to a different casting, and a changed workGroup cannot be mapped to a current label without evidence. Nothing was guessed.` })
      } else {
        kept++
      }
    } else if (row.values['workGroup'] === null) {
      ungrouped++
    } else {
      refusals.push({ path: row.path, line: row.line, problem: `Casting row ${key} is new and has work group ${JSON.stringify(row.values['workGroup'])}, but this older archive does not establish which current label represents that group. Import would lose its selection; no label or source was guessed.` })
    }
  }
  if (kept || ungrouped) notes.push(`${silent.length} Casting row(s) omit the later label and out-until cells: ${kept} existing row(s) keep those cells, and ${ungrouped} new ungrouped row(s) have none.`)
}

function differingColumns(region: AuthoredRegion, incoming: Record<string, unknown>, current: Record<string, unknown>): string[] {
  const declared = columnsOf(region)
  const out: string[] = []
  for (const column of [...declared.fields, ...declared.jsonBlocks]) {
    // Rule 2 of ABSENT_ORIGIN_RULE, ABSENT_PROVED_BY_RULE, ABSENT_SIGNED_ITEM_RULE and ABSENT_PRESS_ID_RULE. A column the archive never mentions is not a column the archive
    // disagrees about, so it is not in the UPDATE at all and the stored value survives untouched.
    // Written here rather than in `updateStatement` because this list IS what the plan shows a
    // person before anything runs, and a column that is not going to move must not be listed as one
    // that is.
    if (!(column in incoming) && mayBeAbsent(region, column)) continue
    // A STORED ROW KEEPS ITS PLACE IN THE CHANGE LOG'S ORDER. See `appendOrderOfTheInserts`: the
    // place is a fact about the database the row is in, and moving it would reorder rows already read.
    if (region === 'changes' && column === 'appendOrder') continue
    // An original text is compared by its digest, so neither text is held.
    const original=historyDigest(incoming,column)
    if (original!==undefined ? original!==historyDigest(current,column) : !sameValue(incoming[column] ?? null,current[column] ?? null)) out.push(column)
  }
  return out
}

function checkAliasImport(byKey:Map<AuthoredRegion,Map<string,ArchiveRow>>,stored:Record<string,Map<string,Record<string,unknown>>>,refusals:ImportRefusal[]):void {
  const region='registry_aliases' as AuthoredRegion
  const held=stored['registry_aliases']??new Map(), incoming=byKey.get(region)??new Map()
  const combined=new Map([...held].map(([key,row])=>[key,row]))
  for(const [key,row] of incoming) {
    const before=held.get(key)
    if(before && JSON.stringify(before)!==JSON.stringify(row.values)) refusals.push({path:row.path,line:row.line,problem:'A permanent registry alias is immutable and cannot be retargeted.'})
    combined.set(key,row.values)
  }
  const agents=new Set([...(stored['agents']??new Map()).values()].map(row=>String(row['id'])))
  for(const row of (byKey.get('agents')??new Map()).values()) agents.add(String(row.values['id']))
  try {validateRegistryAliasRows([...combined.values()],agents)} catch(error) {refusals.push({path:'schema-parts/registry_aliases.md',line:0,problem:(error as Error).message})}
  for(const table of ['revisions','changes'] as const) for(const [key,row] of byKey.get(table)??[]) {
    const before=stored[table]?.get(key)
    if(!before) continue
    for(const column of ['data','provedHolder']) {
      const original=historyDigest(row.values,column)
      if(original!==undefined && original!==historyDigest(before,column)) refusals.push({path:row.path,line:row.line,problem:'An import cannot replace the original JSON bytes of stored historical evidence.'})
    }
  }
}

// ============================================================================ the checks

/**
 * `MANIFEST.md` is a fence, and it is read to VERIFY and never to populate.
 *
 * The importer counts what it actually read out of the files and compares. A manifest that was
 * trusted instead of checked would let a truncated archive import as a complete one, which is the
 * one failure the whole durability group exists to prevent.
 */
function checkManifest(
  archive: Archive,
  counts: Record<string, number>,
  refusals: ImportRefusal[],
  notes: string[],
): void {
  const manifest = archive.manifest
  if (manifest === null) {
    refusals.push({
      path: '',
      line: 0,
      problem:
        'no MANIFEST.md with a `mole-office manifest` block was found. The manifest carries the format ' +
        'version and the row counts, and without it there is nothing to check a truncated archive against.',
    })
    return
  }
  const format = manifest.fields['format']
  if (typeof format !== 'string' || !READABLE_FORMAT_VERSIONS.includes(format)) {
    refusals.push({
      path: manifest.path,
      line: manifest.line,
      problem:
        `the format is ${JSON.stringify(format)} and this importer reads ${READABLE_FORMAT_VERSIONS.map((v) => JSON.stringify(v)).join(' and ')}. A format it does ` +
        'not know would be imported half-understood, and half an archive looks exactly like a whole one.',
    })
    return
  }
  // A LEGACY ARCHIVE IS SAID OUT LOUD. `panelx-export/1` is the version every archive written
  // before 28 August 2026 carries, and its grammar is identical to this one — only the product's
  // name differs. Reading it silently would be the substitution the version check exists to stop.
  if (format !== FORMAT_VERSION) notes.push(`This archive carries ${describeFormat(format)}.`)
  for (const region of EXPORTED_REGIONS) {
    const said = manifest.fields[region]
    const found = counts[region] ?? 0
    if (said === undefined) {
      if (String(region)==='registry_aliases' && found===0 && manifest.fields['registryAliases']===undefined && !archive.migrations.some(row=>typeof row.fields['when']==='number' && row.fields['when']>=registryAliasMigrationWhen())) {
        notes.push('This pre-alias archive has no permanent registry alias relation. Existing aliases remain filed.')
        continue
      }
      refusals.push({ path: manifest.path, line: manifest.line, problem: `the manifest does not count \`${region}\`, so a missing row there could not be noticed.` })
      continue
    }
    if (said !== found) {
      refusals.push({
        path: manifest.path,
        line: manifest.line,
        problem:
          `the manifest says ${region}: ${String(said)} and ${found} were read out of the files. If rows are missing the ` +
          'archive is truncated; if you added rows by hand, change this number to match and import again.',
      })
    }
  }
  for (const [key, region] of [
    ['recordFiles', 'records'],
    ['changeFiles', 'changes'],
  ] as const) {
    const said = manifest.fields[key]
    const found = archive.filesWith.get(region)?.size ?? 0
    if (said !== undefined && said !== found) {
      refusals.push({
        path: manifest.path,
        line: manifest.line,
        problem: `the manifest says ${key}: ${String(said)} and ${found} file(s) carrying a \`${region}\` block were read.`,
      })
    }
  }
}

/**
 * The archive may not come from a schema this database has not caught up with.
 *
 * FORMAT.md §7: importing a newer export into an older database loses columns silently, because the
 * columns simply are not there to write. The other direction — this database has migrations the
 * archive does not — is fine and is reported: the newer columns take their declared defaults.
 */
function checkMigrations(archive: Archive, refusals: ImportRefusal[], notes: string[]): void {
  let applied: { hash: string; when: number }[]
  try {
    applied = sqlite
      .prepare('SELECT hash, created_at AS "when" FROM __drizzle_migrations')
      .all() as { hash: string; when: number }[]
  } catch {
    notes.push('this database has no __drizzle_migrations table, so the archive\'s schema fence could not be checked')
    return
  }
  const appliedWhen = new Map(applied.map((m) => [m.when, m.hash]))
  const appliedHash = new Set(applied.map((m) => m.hash))

  // A migrations block that identifies itself in NEITHER way cannot be checked against anything, so
  // it is refused rather than counted as absent — otherwise it would be neither missing nor present
  // and would silently make the database look newer than the archive.
  const unusable = archive.migrations.filter(
    (m) => typeof m.fields['hash'] !== 'string' && typeof m.fields['when'] !== 'number',
  )
  for (const m of unusable) {
    refusals.push({
      path: m.path,
      line: m.line,
      problem: 'this `migrations` block carries neither a `when` nor a `hash`, so nothing can be checked against it.',
    })
  }

  const named = archive.migrations.filter((m) => !unusable.includes(m))
  for (const m of named) {
    const when = typeof m.fields['when'] === 'number' ? (m.fields['when'] as number) : null
    const hash = typeof m.fields['hash'] === 'string' ? (m.fields['hash'] as string) : null
    const name = String(m.fields['tag'] ?? m.fields['hash'] ?? m.fields['when'])

    // IDENTITY IS `when`, AND THAT IS NOT A DETAIL — it is the difference between a restore that
    // works and one that cannot be made to work by any action the operator can take.
    //
    // MEASURED, on the live corpus, 2026-08-12. `0007_planning.sql` was edited after it had been
    // applied, so the hash stored in that database's journal row matches no file that exists — not
    // on disk and not in git. Matching on hash therefore refused the archive of the real corpus in
    // every freshly migrated database, with the message "run the migrations first", which had
    // already been done and could never help. The disaster path — disk dies, fresh clone, migrate,
    // import — was closed, and the text archive exists precisely so that it does not depend on a
    // `.db` copy.
    //
    // FORMAT.md §7 already named the right field: `when` is the migration's timestamp out of the
    // drizzle journal, drizzle stores that value rather than the moment it ran, so it is the same on
    // every machine and does not churn. The hash is the field that churns.
    const byWhen = when !== null && appliedWhen.has(when)
    const byHash = hash !== null && appliedHash.has(hash)
    if (!byWhen && !byHash) {
      refusals.push({
        path: m.path,
        line: m.line,
        problem:
          `this archive was taken from a database that had applied the migration ${name}, and this ` +
          'database has not. Importing a newer schema into an older one drops the columns the older one does not have, ' +
          'silently. Run the migrations first.',
      })
      continue
    }
    // APPLIED, WITH DIFFERENT BYTES. The migration file was edited after somebody applied it, so the
    // two databases were built by two versions of one migration and may not have the same schema.
    // That is worth saying loudly and it is NOT worth refusing over: the tables this import writes
    // to either have the columns or they do not, and stopping the restore of a corpus whose schema
    // is probably identical — over a whitespace change nobody can now inspect — is the larger harm.
    if (byWhen && hash !== null && appliedWhen.get(when as number) !== hash) {
      notes.push(
        `migration ${name} is applied here, but under a different hash than the archive names ` +
          `(${(appliedWhen.get(when as number) ?? '').slice(0, 12)} here, ${hash.slice(0, 12)} in the archive). The ` +
          'migration file was edited after it was applied somewhere, so the two databases were built by two versions ' +
          'of it. The import continues, because the migration IS applied — but if a column is missing, this is why.',
      )
    }
  }

  const missing = named.filter((m) => {
    const when = typeof m.fields['when'] === 'number' ? (m.fields['when'] as number) : null
    const hash = typeof m.fields['hash'] === 'string' ? (m.fields['hash'] as string) : null
    return !(when !== null && appliedWhen.has(when)) && !(hash !== null && appliedHash.has(hash))
  })
  const extra = applied.length - named.length
  if (missing.length === 0 && extra > 0) {
    notes.push(
      `this database has ${extra} migration(s) the archive does not name, so it is newer than the archive. Any column ` +
        'those migrations added takes its declared default on every imported row.',
    )
  }
}

/**
 * A gate that contradicts itself is refused, exactly as `POST /api/links` refuses it.
 *
 * An importer is a write path. `gateFault` in shared/work.ts is the one declaration of what is
 * wrong with a gate and the link route already calls it; a rule enforced there and not here would
 * be a back door into the one column the audit found nothing had ever checked.
 */
function checkGates(links: Map<string, ArchiveRow>, refusals: ImportRefusal[]): void {
  for (const row of links.values()) {
    const gate = row.values['gate']
    const upTo = row.values['gateUpTo']
    if (gate === null || gate === undefined) {
      // NULL is a real answer and one of three: nobody said how hard this dependency is. `gateUpTo`
      // beside it means nothing, which is what the schema says, so it is left exactly as written.
      continue
    }
    if (typeof gate !== 'string' || !(GATE_KINDS as readonly string[]).includes(gate)) {
      refusals.push({
        path: row.path,
        line: row.line,
        problem: `\`gate\` is ${JSON.stringify(gate)}, and a gate is null, ${GATE_KINDS.map((k) => `"${k}"`).join(' or ')}.`,
      })
      continue
    }
    const fault = gateFault({ kind: gate as GateKind, ...(typeof upTo === 'string' ? { upTo } : {}) })
    if (fault !== null) {
      refusals.push({ path: row.path, line: row.line, problem: `this link's gate cannot be read: ${GATE_FAULT_RULES[fault]}` })
    }
  }
}

/**
 * Presentation intent is checked with the product's own two functions, and the refusal is the point.
 *
 * FORMAT.md §5.4 requires this by name. A file a person edited by hand is exactly where an `x:` will
 * appear, and a coordinate stored as intent is a claim that Mole Office maintains a layout it does not
 * maintain — the boundary the whole presentation subsystem exists to hold.
 */
function checkIntent(intents: Map<string, ArchiveRow>, refusals: ImportRefusal[]): void {
  for (const row of intents.values()) {
    const target = row.values['target']
    const problems = target === '(scope)' ? checkScopeIntent(row.values['intent']) : checkNodeIntent(row.values['intent'], String(target))
    for (const problem of problems) {
      refusals.push({ path: row.path, line: row.line, problem: `presentation intent at ${problem.where}: ${problem.problem}` })
    }
  }
}

/**
 * WHO DID IT IS A CLOSED VOCABULARY, AND IT IS THE ONE FIELD GOVERNANCE READS.
 *
 * The importer is a write path, and it already refuses a gate word and an intent nothing declares on
 * the stated ground that a rule enforced on one write path and not the other is a back door. `actor_type`
 * had no check at all, and an independent reviewer walked straight through it: changing `human` to
 * `hooman` in one line of an archive imported clean, and the restored corpus then showed a fork the
 * owner really had settled as unsettled — `GET /api/needs-you` listed it again and the apply route
 * answered "this proposal has not been settled by a person", which is false about the record and was
 * produced by the restore with nothing anywhere saying a word.
 *
 * That happens because `humanLinked` asks whether the change row says `human`. Anything else is not
 * a human, so a typo silently withdraws somebody's decision. Three words are legal, the schema
 * declares them, and this refuses everything else naming the row and the three.
 *
 * WHAT THIS IS NOT. It is not a defence against an archive somebody deliberately edited to forge a
 * decision — a forged row would say `human`, which is legal, and no check on a text file the operator
 * owns can tell a forgery from the truth. `reportSettledForks` below answers that differently, by
 * making the restore SAY which forks it just brought back as settled and who settled each.
 *
 * ASKED OF EVERY REGION THAT SAYS WHO DID IT, NOT OF `changes` ALONE. This was called for `changes`
 * and for nothing else, on the argument written above: a rule enforced on one write path and not the
 * other is a back door. `revisions` arrived on 18 August 2026 carrying the same three-word column
 * and got no check, so it was the other write path — an archive could say `actorType: "hooman"` on a
 * revision and the ledger would show it as the newest write on the record. The regions are read off
 * the declared columns rather than named here, so the next table with an `actorType` is covered the
 * day it is declared.
 *
 * A NULL IS ACCEPTED ONLY WHERE THE SCHEMA DECLARES THE COLUMN NULLABLE, and it is restored as the null it
 * is. Today that is `tool_uses` alone: migration 0231 moved each run's old `data.toolUses` list into it,
 * and the list never said who wrote each line, so the moved rows name nobody. A null says "nobody
 * recorded this"; it is not a word read as "not a person". Decision GN_vn7U9pqxT (11 October
 * 2026). Whether the column is nullable is read off `COLUMNS`, which reads the schema, so no region is
 * named here. A null on any other region, and a word present but not one of the three on any region,
 * stay refused. The notes count the nulls, region by region.
 */
function checkActorTypes(
  byKey: Map<AuthoredRegion, Map<string, ArchiveRow>>,
  refusals: ImportRefusal[],
  notes: string[],
): void {
  for (const region of EXPORTED_REGIONS) {
    if (!(columnsOf(region).fields as readonly string[]).includes('actorType')) continue
    const mayBeNull = COLUMNS[region]?.get('actorType')?.notNull === false
    let nulls = 0
    for (const row of (byKey.get(region) ?? new Map<string, ArchiveRow>()).values()) {
      const actorType = row.values['actorType']
      if (typeof actorType === 'string' && (ACTOR_TYPES as readonly string[]).includes(actorType)) continue
      if (actorType === null && mayBeNull) {
        nulls += 1
        continue
      }
      refusals.push({
        path: row.path,
        line: row.line,
        problem:
          `this ${region} row says who did it was ${JSON.stringify(actorType)}, which is not one of the three Mole Office ` +
          `knows: ${ACTOR_TYPES.join(', ')}. Every other unrecognised word in an archive is imported and reported, ` +
          `because losing a row is worse — this one is refused, because it is the field the human-only rule reads, ` +
          `and a word nothing recognises is read as "not a person". A restore that quietly withdrew somebody's ` +
          `decision would be the archive changing what the project means.`,
      })
    }
    if (nulls > 0) {
      notes.push(
        `${String(nulls)} ${region} row(s) say nobody recorded who did it (actorType null). The schema declares that ` +
          'column nullable, so each is restored with the null it holds and no actor is written onto it.',
      )
    }
  }
}

/**
 * EVERY WARRANT IN THE ARCHIVE IS READ BY readWarrant, AND ONE IT REFUSES REFUSES THE ARCHIVE.
 *
 * A warrant is a claim about what a person said, and every surface draws it as their words. The doors
 * read one with `readWarrant` before they store it. The importer used to check the column only as
 * "text or null", so an archive could carry `{"saidBy":"somebody-else","words":""}` and it was drawn
 * as theirs. Problem `w1TppEkU6YIF`.
 *
 * ASKED OF EVERY REGION WITH A `warrant` COLUMN, read off the declared columns the way
 * `checkActorTypes` finds `actorType`. Today that is `changes` and `revisions`.
 *
 * A CITED MESSAGE OR COMMENT MAY BE IN THE ARCHIVE AND NOT YET IN THE DATABASE, because nothing is
 * written until every row has been checked. So a citation counts as held when the database holds it
 * or when the archive being imported does.
 *
 * A WARRANT WITH NO `for` IS ACCEPTED ONLY ON A ROW WRITTEN BEFORE `for` EXISTED (`FOR_CAME_IN`),
 * after every other check, and the notes name each such row. the secretary decided this on
 * 25 September 2026 (message YiMd4ePPfMYs, passed on as KoiNDQ8EPZob), because the live office
 * holds such rows.
 */
function checkWarrants(
  byKey: Map<AuthoredRegion, Map<string, ArchiveRow>>,
  refusals: ImportRefusal[],
  notes: string[],
): void {
  const now = nowStamp()
  const inTheArchive = citablePlacesIn(byKey)
  const placeExists = (where: string): boolean => theCitedPlaceExists(where) || inTheArchive.has(placeKey(where))
  /** Rows whose warrant has no `for` and was written before `for` existed, as `<region> <id>`. */
  const writtenBeforeFor: string[] = []
  for (const region of EXPORTED_REGIONS) {
    if (!(columnsOf(region).fields as readonly string[]).includes('warrant')) continue
    for (const row of (byKey.get(region) ?? new Map<string, ArchiveRow>()).values()) {
      const text = row.values['warrant']
      // Null is the ordinary case: nobody claimed anybody's words. `checkRow` has already refused
      // anything that is neither null nor text.
      if (typeof text !== 'string') continue
      let sent: unknown
      try {
        sent = JSON.parse(text)
      } catch {
        refusals.push({
          path: row.path,
          line: row.line,
          problem:
            `${region} line ${row.line}: the warrant on this row is not JSON, so it cannot be read as a warrant. ` +
            'An archive is refused whole when one warrant in it cannot be read. Nothing was written.',
        })
        continue
      }
      // A WARRANT WRITTEN BEFORE `for` EXISTED. Its only allowed difference from today's shape is the
      // missing `for`, so every other check is still made: readWarrant is handed a copy with a
      // stand-in `for`, used only for judging. The stored text is imported unchanged, and
      // `warrantAsStored` reads it back as naming no records. Each such row is named in the notes.
      const noFor = sent !== null && typeof sent === 'object' && !Array.isArray(sent) && !('for' in sent)
      const beforeFor = noFor && writtenBeforeForExisted(row.values['at'])
      const judged = beforeFor ? { ...(sent as object), for: [NO_FOR_STAND_IN] } : sent
      const covers = (judged as { for?: unknown } | null)?.for
      const read = readWarrant(judged, {
        knownPerson: HUMAN.id,
        now,
        // THE ONE CHECK AN ARCHIVE ROW CANNOT SUPPORT. At the door, `actingOn` is the record the
        // request acted on, and the archive does not say which record that was. It is not always the
        // row's own record: a promotion's warrant names the fork while its rows are on the new
        // decision, a settling link's names the proposal while its row is on the decision, and a
        // record created with a warrant names its title because it had no id yet. So the warrant's
        // own first `for` id is handed in, and this check always passes. Every other check is made.
        actingOn: Array.isArray(covers) && typeof covers[0] === 'string' ? covers[0].trim() : '',
        placeExists,
        // NOT ASKED OF AN ARCHIVE. The rule that a new warrant may cite only the person's proved
        // words is a rule for a warrant arriving at the door. A row in an archive carries a warrant
        // that was accepted when it was written, under the rules of that time, and a restore puts
        // back what happened. So every place the archive or the database holds may be cited here.
        whyThePlaceMayNotBeCited: () => null,
      })
      if (read.refusal === undefined) {
        if (beforeFor) writtenBeforeFor.push(`${region} ${String(row.values['id'])}`)
        continue
      }
      const why =
        noFor && !beforeFor
          ? ` A warrant with no \`for\` is accepted only on a row written before ${FOR_CAME_IN}, when \`for\` ` +
            `became part of a warrant, and this row says it was written at ${JSON.stringify(row.values['at'])}.`
          : ''
      refusals.push({
        path: row.path,
        line: row.line,
        problem:
          `${region} line ${row.line}: the warrant on this row cannot be read. ${read.refusal}${why} ` +
          'An archive is refused whole when one warrant in it cannot be read.',
      })
    }
  }
  if (writtenBeforeFor.length > 0) {
    notes.push(
      `${writtenBeforeFor.length} warrant(s) carry no \`for\`, on rows written before ${FOR_CAME_IN}, when \`for\` ` +
        'became part of a warrant. Every other check on them was made. They are accepted as stored, and every ' +
        `surface reads them as naming no records: ${writtenBeforeFor.join(', ')}.`,
    )
  }
}

/**
 * WHEN `for` BECAME PART OF A WARRANT: commit b8ed13cfa309, "A warrant names the records it is for,
 * and its cited place is looked up", 3 September 2026 at 21:46:47 local time.
 *
 * Measured on the owner's live office on 25 September 2026, through GET /api/changes and GET
 * /api/records/:id/revisions: the 32 changes rows and 20 revisions rows whose warrant has no `for`
 * were all written between 21:31:39 and 21:41:58 that evening, and the first changes row with a
 * `for` at 22:06:52. So the rows separate at this moment with nothing on the wrong side.
 */
const FOR_CAME_IN = '2026-09-03 21:46:47'

/** What readWarrant is handed as `for` when judging a warrant written before `for` existed. Never stored. */
const NO_FOR_STAND_IN = '(written before a warrant named its records)'

/** Was this row written before `for` existed? A time that cannot be read is not before anything. */
function writtenBeforeForExisted(at: unknown): boolean {
  const written = typeof at === 'string' ? parseLocalStamp(at) : null
  const cut = parseLocalStamp(FOR_CAME_IN)
  return written !== null && cut !== null && written < cut
}

/** `message:<id>` or `comment:<id>`, with the id trimmed, the way `theCitedPlaceExists` reads it. */
function placeKey(where: string): string {
  const colon = where.indexOf(':')
  if (colon <= 0) return where
  return `${where.slice(0, colon)}:${where.slice(colon + 1).trim()}`
}

/**
 * The messages and comments the archive holds, as the places a warrant may cite.
 *
 * The same rows `theCitedPlaceExists` accepts from the database: a message is an `agent_messages`
 * row or a record of kind `message`, a comment is a record of kind `annotation`, and a deleted
 * record is not held.
 */
function citablePlacesIn(byKey: Map<AuthoredRegion, Map<string, ArchiveRow>>): Set<string> {
  const held = new Set<string>()
  for (const row of (byKey.get('agent_messages') ?? new Map<string, ArchiveRow>()).values()) {
    held.add(`message:${String(row.values['id'])}`)
  }
  for (const row of (byKey.get('records') ?? new Map<string, ArchiveRow>()).values()) {
    if (row.values['deletedAt'] !== null) continue
    if (row.values['kind'] === 'message') held.add(`message:${String(row.values['id'])}`)
    if (row.values['kind'] === 'annotation') held.add(`comment:${String(row.values['id'])}`)
  }
  return held
}

/**
 * SAY WHICH FORKS THIS RESTORE BRINGS BACK AS SETTLED, AND WHO SETTLED EACH.
 *
 * Settling a proposal is not a field: it IS a `derived_from` link from a decision to that proposal,
 * and whether a HUMAN made that link is read off the change log. So a restore can hand a project a
 * governance history, and until now it did so in silence — the same reviewer appended a link block
 * and a change row claiming `human` to an archive, imported it, and a fork nobody had ever settled
 * disappeared from the human queue with no note.
 *
 * No check on a text file the operator owns can tell that apart from a real decision, and pretending
 * otherwise would be worse than saying nothing. What the importer CAN do is refuse to be quiet about
 * it: every settling link it restores is counted and named, so a governance history that arrived in
 * an archive is something the operator read rather than something that happened to them.
 */
function reportSettledForks(byKey: Map<AuthoredRegion, Map<string, ArchiveRow>>, notes: string[]): void {
  const records = byKey.get('records') ?? new Map<string, ArchiveRow>()
  const kindOf = new Map<string, string>()
  for (const row of records.values()) {
    const id = row.values['id']
    const kind = row.values['kind']
    if (typeof id === 'string' && typeof kind === 'string') kindOf.set(id, kind)
  }

  const settling: { from: string; to: string }[] = []
  for (const row of (byKey.get('links') ?? new Map<string, ArchiveRow>()).values()) {
    const from = row.values['fromId']
    const to = row.values['toId']
    if (row.values['type'] !== RESOLVES_PROPOSAL || typeof from !== 'string' || typeof to !== 'string') continue
    if (kindOf.get(from) === DECISION_KIND && kindOf.get(to) === PROPOSAL_KIND) settling.push({ from, to })
  }
  if (settling.length === 0) return

  // Who is read off the change log, exactly as `humanLinked` reads it, rather than off the link row:
  // `links.created_by` stores an actor id with no type beside it and cannot answer the question.
  const byHuman = new Set<string>()
  for (const row of (byKey.get('changes') ?? new Map<string, ArchiveRow>()).values()) {
    if (row.values['op'] !== 'link' || row.values['field'] !== RESOLVES_PROPOSAL) continue
    if (row.values['actorType'] !== 'human') continue
    const to = row.values['newValue']
    if (typeof to === 'string') byHuman.add(to)
  }

  const human = settling.filter((s) => byHuman.has(s.to)).length
  notes.push(
    `${settling.length} fork(s) come back from this archive already settled — a decision linked to a proposal is ` +
      `the whole of the governance act, so this restore is handing the project ${settling.length === 1 ? 'that answer' : 'those answers'}. ` +
      `${human} of them ${human === 1 ? 'was' : 'were'} settled by a human according to the change log, which is what ` +
      `GET /api/needs-you and the apply route read. Nothing here can tell a real decision from one written into the ` +
      `archive by hand, so this is a list to read rather than a check that passed.`,
  )
}

/**
 * Words Mole Office does not recognise are counted and named, never refused and never dropped.
 *
 * The export writes a record of an unknown kind rather than losing it, on the stated ground that a
 * backup that drops a row it does not recognise is worse than one that reports it. Undoing that at
 * the other end would make the export's kindness a lie. A state word nobody has classified is the
 * same shape and is normal: seven such words sit on nineteen records of the live corpus, written
 * through the product's own API, and `progressOf` answers `unclassified` — a question for a person.
 */
function reportUnrecognised(byKey: Map<AuthoredRegion, Map<string, ArchiveRow>>, notes: string[]): void {
  const kinds = new Set<string>()
  const states = new Set<string>()
  let stateRows = 0
  for (const row of (byKey.get('records') ?? new Map<string, ArchiveRow>()).values()) {
    const kind = row.values['kind']
    if (typeof kind === 'string' && !(RECORD_KINDS as readonly string[]).includes(kind)) kinds.add(kind)
    const data = row.values['data']
    const state = typeof data === 'object' && data !== null ? (data as Record<string, unknown>)['state'] : undefined
    if (typeof state === 'string' && progressOf(state) === 'unclassified') {
      states.add(state)
      stateRows += 1
    }
  }
  const types = new Set<string>()
  for (const row of (byKey.get('links') ?? new Map<string, ArchiveRow>()).values()) {
    const type = row.values['type']
    if (typeof type === 'string' && !(type in LINK_TYPES)) types.add(type)
  }
  if (kinds.size > 0) {
    notes.push(
      `record(s) of ${kinds.size} kind(s) Mole Office does not know were imported unchanged: ${[...kinds].sort(byCodeUnit).join(', ')}. ` +
        'They are stored as written rather than dropped; nothing will draw them until the kind is declared.',
    )
  }
  if (types.size > 0) {
    notes.push(
      `link(s) of ${types.size} type(s) Mole Office does not know were imported unchanged: ${[...types].sort(byCodeUnit).join(', ')}.`,
    )
  }
  if (stateRows > 0) {
    notes.push(
      `${stateRows} record(s) carry a state word nobody has classified: ${[...states].sort(byCodeUnit).join(', ')}. Mole Office cannot ` +
        'tell whether they stopped short, so it will say so on every screen rather than guess. Classify them in ' +
        'STATE_MEANING in src/shared/work.ts.',
    )
  }
}

/**
 * What this archive says about how its records got here, said back in words before anything runs.
 *
 * THREE THINGS ARE REPORTED AND NONE OF THEM IS A REFUSAL, because none of them is self-contradictory
 * — the principle at the top of this file. An origin is a fact about a write path that this importer
 * cannot check, so the only honest thing it can do with one is carry it and say what it carried.
 *
 *   - rows the archive says nothing about, split by what will happen to them, which is the whole of
 *     ABSENT_ORIGIN_RULE made visible;
 *   - rows that say `origin: null`, which is a row that HAS said something — that nobody knows;
 *   - rows storing a word outside RECORD_ORIGINS. It is written as given, because something wrote it
 *     on purpose, and `readOrigin` answers null for it so every reader treats it as unrecorded.
 */
function reportOrigins(
  records: Map<string, ArchiveRow>,
  stored: Map<string, Record<string, unknown>>,
  notes: string[],
): void {
  let absentOnInsert = 0
  let absentOnUpdate = 0
  let explicitlyNull = 0
  const unknownWords = new Set<string>()
  for (const [key, row] of records) {
    if (!('origin' in row.values)) {
      if (stored.has(key)) absentOnUpdate += 1
      else absentOnInsert += 1
      continue
    }
    const value = row.values['origin']
    if (value === null) {
      explicitlyNull += 1
      continue
    }
    if (readOrigin(value) === null) unknownWords.add(String(value))
  }

  if (absentOnInsert > 0 || absentOnUpdate > 0) {
    notes.push(
      `${absentOnInsert + absentOnUpdate} record row(s) in this archive carry no \`origin\` line: ${ABSENT_ORIGIN_RULE} ` +
        `Here that is ${absentOnInsert} new row(s) inserted unstamped and ${absentOnUpdate} existing row(s) whose ` +
        `stored origin this import does not touch.`,
    )
  }
  if (explicitlyNull > 0) {
    notes.push(
      `${explicitlyNull} record row(s) say \`origin: null\`. ${unstampedOriginNote()} — which is a different fact ` +
        `from \`authored\` and is restored as the null it is.`,
    )
  }
  if (unknownWords.size > 0) {
    notes.push(
      `record(s) store an origin that is not one of ${RECORD_ORIGINS.join(' or ')}: ` +
        `${[...unknownWords].sort(byCodeUnit).join(', ')}. They are imported exactly as written rather than blanked ` +
        `or refused — something wrote them on purpose — and every reader treats them as unrecorded until somebody ` +
        `says what they meant.`,
    )
  }
}

/**
 * ABSENT_PROVED_BY_RULE made visible: how many rows of each of the three regions carry no `provedBy`
 * line, split into the ones this import inserts with null and the ones already stored, whose value
 * it does not touch. Not a refusal, for the reason `reportOrigins` gives.
 */
function reportAbsentProofs(
  byKey: Map<AuthoredRegion, Map<string, ArchiveRow>>,
  stored: Record<string, Map<string, Record<string, unknown>>>,
  notes: string[],
): void {
  const counted: string[] = []
  let absentOnInsert = 0
  let absentOnUpdate = 0
  for (const region of ['changes', 'revisions', 'agent_messages'] as const) {
    let inserted = 0
    let kept = 0
    for (const [key, row] of byKey.get(region) ?? new Map<string, ArchiveRow>()) {
      if ('provedBy' in row.values) continue
      if (stored[region]?.has(key) === true) kept += 1
      else inserted += 1
    }
    if (inserted + kept > 0) counted.push(`${inserted + kept} ${region}`)
    absentOnInsert += inserted
    absentOnUpdate += kept
  }
  if (counted.length === 0) return
  notes.push(
    `${absentOnInsert + absentOnUpdate} row(s) in this archive carry no \`provedBy\` line (${counted.join(', ')}): ` +
      `${ABSENT_PROVED_BY_RULE} Here that is ${absentOnInsert} new row(s) inserted with provedBy null and ` +
      `${absentOnUpdate} existing row(s) whose stored provedBy this import does not touch.`,
  )
}

/** Count both parts of ABSENT_SIGNED_ITEM_RULE before anything is applied, as for key proofs above. */
function reportAbsentSignedItems(
  byKey: Map<AuthoredRegion, Map<string, ArchiveRow>>,
  stored: Record<string, Map<string, Record<string, unknown>>>,
  notes: string[],
): void {
  const counted: string[] = []
  let absentOnInsert = 0
  let absentOnUpdate = 0
  for (const region of ['changes', 'revisions'] as const) {
    let inserted = 0
    let kept = 0
    for (const [key, row] of byKey.get(region) ?? new Map<string, ArchiveRow>()) {
      if ('signed_item' in row.values) continue
      if (stored[region]?.has(key) === true) kept += 1
      else inserted += 1
    }
    if (inserted + kept > 0) counted.push(`${inserted + kept} ${region}`)
    absentOnInsert += inserted
    absentOnUpdate += kept
  }
  if (counted.length === 0) return
  notes.push(
    `${absentOnInsert + absentOnUpdate} row(s) in this archive carry no \`signed_item\` line (${counted.join(', ')}): ` +
      `${ABSENT_SIGNED_ITEM_RULE} Here that is ${absentOnInsert} new row(s) inserted with signed_item null and ` +
      `${absentOnUpdate} existing row(s) whose stored signed_item this import does not touch.`,
  )
}

/** Count both parts of ABSENT_PRESS_ID_RULE before anything is applied, as for the signed items above. */
function reportAbsentPresses(
  byKey: Map<AuthoredRegion, Map<string, ArchiveRow>>,
  stored: Record<string, Map<string, Record<string, unknown>>>,
  notes: string[],
): void {
  let inserted = 0
  let kept = 0
  for (const [key, row] of byKey.get('changes') ?? new Map<string, ArchiveRow>()) {
    if ('pressId' in row.values) continue
    if (stored['changes']?.has(key) === true) kept += 1
    else inserted += 1
  }
  if (inserted + kept === 0) return
  notes.push(
    `${inserted + kept} changes row(s) in this archive carry no \`pressId\` line: ${ABSENT_PRESS_ID_RULE} Here that is ` +
      `${inserted} new row(s) inserted with pressId null and ${kept} existing row(s) whose stored pressId this import ` +
      'does not touch.',
  )
}

/**
 * No two BLOCKS may end up holding one title, and the check is on the FINAL state.
 *
 * ---------------------------------------------------------------------------------------
 * WHY BLOCKS AND NOTHING ELSE, SINCE 18 AUGUST 2026
 * ---------------------------------------------------------------------------------------
 *
 * This refused ANY two records that would end up holding one title, and that was right while
 * `records_title_idx` was UNIQUE(workspace_id, title): the write would have failed anyway, and
 * failing halfway through a restore is worse than refusing before it starts.
 *
 * `0030_titles_may_repeat` made that index plain, because an id is identity
 * and a title is presentation. The general refusal outlived the rule it enforced, and the cost was
 * real and measured: Mole Office could not import a backup of its own database once two records shared a
 * title.
 *
 * NOTHING IN THE ARCHIVE FORMAT NEEDED IT. A record file is named by its id, a link carries an id at
 * each end, and every row here is matched to a stored row by primary key and never by a title. So
 * dropping the general case makes no reconciliation ambiguous.
 *
 * ONE RULE SURVIVES, FOR THE REASON PRINCIPLE A GIVES. A block's title is not typed by anybody — the
 * server builds it as `<pipeline> › <name>` — and a pipeline is read as an ordered list of those
 * names, so two blocks holding one title in one project read as the same step written twice.
 * `refuseTakenTitle` in server/lib/blocks.ts refuses that at `POST /api/pipelines/:id/blocks`. An
 * importer is a write path, so it refuses it here as well.
 *
 * THE KIND IS TAKEN FROM THE FINAL STATE, exactly as the title is: the archive's kind where the
 * archive names the row, the stored kind otherwise. A record a hand edit turns into a block is
 * checked as the block it is about to be.
 *
 * The identity is the id, so a title that moves is a rename. Whether a rename is legal cannot be
 * judged row by row: two blocks may swap titles in one edit, and renaming a pipeline rewrites every
 * one of its blocks' titles at once. So this works out the title every block WOULD hold when the
 * import finished and refuses only a genuine collision, naming both ids.
 */
function checkTitles(records: Map<string, ArchiveRow>, stored: Map<string, Record<string, unknown>>, refusals: ImportRefusal[]): void {
  interface Claim {
    id: string
    where: string
    path: string
    line: number
  }
  const claims = new Map<string, Claim[]>()
  // Joined on NUL, never on a space or a slash. A title may hold any character a person can type —
  // 163 of the corpus's 290 titles are non-ASCII and seven contain `/` or `:` — so any printable
  // joiner could make two different pairs produce one key and report a collision that is not there.
  const claim = (workspaceId: unknown, title: unknown, c: Claim): void => {
    const key = `${String(workspaceId)}\u0000${String(title)}`
    const list = claims.get(key)
    if (list === undefined) claims.set(key, [c])
    else list.push(c)
  }
  for (const [key, row] of stored) {
    if (records.has(key)) continue
    if (row['kind'] !== BLOCK_KIND) continue
    claim(row['workspaceId'], row['title'], { id: String(row['id']), where: 'already in the database', path: '', line: 0 })
  }
  for (const row of records.values()) {
    if (row.values['kind'] !== BLOCK_KIND) continue
    claim(row.values['workspaceId'], row.values['title'], { id: String(row.values['id']), where: 'in this archive', path: row.path, line: row.line })
  }
  for (const [key, list] of claims) {
    if (list.length < 2) continue
    const title = key.slice(key.indexOf('\u0000') + 1)
    const first = list[0]
    refusals.push({
      path: first?.path ?? '',
      line: first?.line ?? 0,
      problem:
        `${list.length} blocks would end up with the title ${JSON.stringify(title)}: ${list.map((c) => `${c.id} (${c.where})`).join(', ')}. ` +
        'A block is named by the pipeline it is in and its own name, and a pipeline is read as an ordered list of ' +
        'those names, so two blocks called the same thing read as one step written twice. Rename one of them in the ' +
        'archive — never change an id, which four other tables point at. Nothing was imported. Records of every ' +
        'other kind may share a title: an id is the identity and a title is the name.',
    })
  }
}

/**
 * A HANDLE IS UNIQUE AMONG LIVE AGENTS, and the importer enforces what the registry index enforces.
 *
 * `checkTitles`' sibling, and for the same reason: an importer is a write path, and a rule enforced
 * at the doors and not here would be a way into the one table with no check. A handle is how a
 * message names an agent, so two LIVE agents bearing one handle would make every message to that
 * name ambiguous — which is exactly what criterion I7 forbids.
 *
 * ONLY LIVE ROWS CLAIM. A retired agent has released its handle and a new live agent may take it, so
 * a retired-plus-live pair is legal and is not refused. The state read is the state the import would
 * FINISH in: a stored row whose id the archive also carries is judged by the archive's row, exactly
 * as `checkTitles` judges a title.
 */
function checkHandles(agents: Map<string, ArchiveRow>, stored: Map<string, Record<string, unknown>>, refusals: ImportRefusal[]): void {
  interface Claim {
    id: string
    where: string
    path: string
    line: number
  }
  const claims = new Map<string, Claim[]>()
  // A handle may hold any character a person can type, so the claim key is the handle itself rather
  // than a joined string. Joining on a printable character could make two handles collide.
  const claim = (handle: unknown, c: Claim): void => {
    const key = String(handle)
    const list = claims.get(key)
    if (list === undefined) claims.set(key, [c])
    else list.push(c)
  }
  for (const [key, row] of stored) {
    if (agents.has(key)) continue
    if (!isLive(row['retired'])) continue
    claim(row['handle'], { id: String(row['id']), where: 'already in the database', path: '', line: 0 })
  }
  for (const row of agents.values()) {
    if (!isLive(row.values['retired'])) continue
    claim(row.values['handle'], { id: String(row.values['id']), where: 'in this archive', path: row.path, line: row.line })
  }
  for (const [handle, list] of claims) {
    if (list.length < 2) continue
    const first = list[0]
    refusals.push({
      path: first?.path ?? '',
      line: first?.line ?? 0,
      problem:
        `${list.length} live agents would end up with the handle ${JSON.stringify(handle)}: ${list.map((c) => `${c.id} (${c.where})`).join(', ')}. ` +
        'A handle is how a message names an agent, so two live agents answering to one name would make every message to that name ' +
        'ambiguous. A retired agent releases its handle and a new agent may take it, so a retired row and a live row may share one. ' +
        'Rename one of the live agents in the archive — never change an id, which other rows point at. Nothing was imported.',
    })
  }
}

/**
 * Whether an agents row is live, by its `retired` value. `agents.retired` is an integer column (0 or 1)
 * and the archive writes it as stored, so a live row is one that is neither 1 nor a boolean true. A row
 * with no value at all is a row written before the column existed, which was live.
 */
function isLive(retired: unknown): boolean {
  return retired !== 1 && retired !== true
}

/** `links_pair_idx` is UNIQUE(from, to, type): the same relationship must not be stored twice. */
function checkLinkPairs(links: Map<string, ArchiveRow>, stored: Map<string, Record<string, unknown>>, refusals: ImportRefusal[]): void {
  const claims = new Map<string, { id: string; where: string; path: string; line: number }[]>()
  const claim = (row: Record<string, unknown>, where: string, path: string, line: number): void => {
    const key = `${String(row['fromId'])}\u0000${String(row['toId'])}\u0000${String(row['type'])}`
    const list = claims.get(key)
    const entry = { id: String(row['id']), where, path, line }
    if (list === undefined) claims.set(key, [entry])
    else list.push(entry)
  }
  for (const [key, row] of stored) if (!links.has(key)) claim(row, 'already in the database', '', 0)
  for (const row of links.values()) claim(row.values, 'in this archive', row.path, row.line)
  for (const [key, list] of claims) {
    if (list.length < 2) continue
    const [from, to, type] = key.split('\u0000')
    const first = list[0]
    refusals.push({
      path: first?.path ?? '',
      line: first?.line ?? 0,
      problem:
        `${list.length} links would say the same thing — ${String(type)} from ${String(from)} to ${String(to)} — as rows ` +
        `${list.map((c) => `${c.id} (${c.where})`).join(', ')}. A relationship is stored once, in one direction.`,
    })
  }
}

/**
 * Every reference the database enforces must resolve, and the message must name what is missing.
 *
 * `links.from_id`/`to_id` and `reader_anchors.last_change_id` are real foreign keys and
 * `foreign_keys` is ON, so SQLite would refuse these anyway — with "FOREIGN KEY constraint failed",
 * which names no row, no file and no line. Checking first is the difference between a refusal a
 * person can act on and one they cannot.
 *
 * A dangling reference refuses the WHOLE import rather than that row, because it is evidence the
 * archive is incomplete or was edited inconsistently: the usual cause is a record file somebody
 * deleted, and the things pointing at it are rarely just one.
 *
 * `changes.record_id` is deliberately NOT a foreign key — history outlives its subject — so a change
 * row naming a record that is nowhere is reported and applied. Inventing a constraint the schema
 * declined to have would be this file overruling the schema.
 */
function checkReferences(
  byKey: Map<AuthoredRegion, Map<string, ArchiveRow>>,
  stored: Record<string, Map<string, Record<string, unknown>>>,
  refusals: ImportRefusal[],
  notes: string[],
): void {
  const recordIds = new Set<string>()
  for (const key of (stored['records'] ?? new Map()).keys()) recordIds.add(key)
  for (const row of (byKey.get('records') ?? new Map<string, ArchiveRow>()).values()) recordIds.add(String(row.values['id']))

  for (const row of (byKey.get('links') ?? new Map<string, ArchiveRow>()).values()) {
    for (const end of ['fromId', 'toId'] as const) {
      const id = String(row.values[end])
      if (recordIds.has(id)) continue
      refusals.push({ path: row.path, line: row.line, problem: aLinkEndThatIsNowhere(end, id) })
    }
  }

  const changeIds = new Set<string>()
  for (const key of (stored['changes'] ?? new Map()).keys()) changeIds.add(key)
  for (const row of (byKey.get('changes') ?? new Map<string, ArchiveRow>()).values()) changeIds.add(String(row.values['id']))

  for (const row of (byKey.get('reader_anchors') ?? new Map<string, ArchiveRow>()).values()) {
    const last = row.values['lastChangeId']
    // null is a real answer and is not the same as having no row: it means this reader looked and
    // there was nothing to see. Only a NAMED change that is nowhere is a broken reference.
    if (last === null || last === undefined) continue
    if (changeIds.has(String(last))) continue
    refusals.push({
      path: row.path,
      line: row.line,
      problem: `this anchor's \`lastChangeId\` is ${JSON.stringify(last)}, and no change row with that id is in this archive or in the database.`,
    })
  }

  const orphanChanges = [...(byKey.get('changes') ?? new Map<string, ArchiveRow>()).values()].filter(
    (row) => !recordIds.has(String(row.values['recordId'])),
  )
  if (orphanChanges.length > 0) {
    notes.push(
      `${orphanChanges.length} change row(s) name a record id that is neither in this archive nor in the database. They ` +
        'were imported anyway: `changes.record_id` is deliberately not a foreign key, so the history of a record ' +
        'outlives it. Nothing will show them on a record page.',
    )
  }
}

/**
 * THE PROJECT BOUNDARY, ON THE WAY BACK IN.
 *
 * ---------------------------------------------------------------------------------------
 * TWO THINGS, AND THE SECOND IS THE ONE THAT MATTERS
 * ---------------------------------------------------------------------------------------
 *
 * 1. EVERY WORKSPACE A ROW NAMES MUST EXIST — in this archive or already in the database. A row
 *    filed behind a project nobody has is unreachable: every read in the product is scoped, so
 *    nothing would ever answer about it, and it would not show up as missing either. `workspace_id`
 *    is not a declared foreign key, so SQLite will not catch this and only this will.
 *
 * 2. A LINK'S TWO ENDS MUST BE IN ONE PROJECT. `createLink` refuses a cross-workspace link at the
 *    moment somebody tries to make one; without the same check here, an archive holding one — hand
 *    edited, or written by a Mole Office from before the boundary existed — would restore it silently,
 *    and afterwards it would be indistinguishable from a link somebody meant. The measured
 *    behaviour before this existed: the importer checked that both ends EXIST and never that they
 *    belonged together.
 *
 * REFUSING, NOT DROPPING. Dropping the link would be the quiet half of the same failure the
 * direction names — "never silently link across a project boundary, and never quietly drop the
 * link either" — and the record page would then show a relationship the archive says is there.
 * The refusal names both records, both projects and the file the link came from, which is the
 * whole of what somebody needs to decide which end is wrong.
 */
function checkWorkspaces(
  byKey: Map<AuthoredRegion, Map<string, ArchiveRow>>,
  stored: Record<string, Map<string, Record<string, unknown>>>,
  refusals: ImportRefusal[],
): void {
  const known = new Set<string>()
  for (const key of (stored['workspaces'] ?? new Map()).keys()) known.add(key)
  for (const row of (byKey.get('workspaces') ?? new Map<string, ArchiveRow>()).values()) known.add(String(row.values['id']))

  // Which project each record ends up in: the archive's answer where the archive names it, the
  // stored one otherwise. The same rule checkTitles uses, and for the same reason — an archive
  // that MOVES a record between projects is legitimate, and the check has to be about the state
  // the import would leave rather than about the state before it.
  const workspaceOfRecord = new Map<string, string>()
  for (const [key, row] of stored['records'] ?? new Map()) workspaceOfRecord.set(key, String(row['workspaceId']))
  for (const row of (byKey.get('records') ?? new Map<string, ArchiveRow>()).values()) {
    workspaceOfRecord.set(String(row.values['id']), String(row.values['workspaceId']))
  }

  for (const region of EXPORTED_REGIONS) {
    if (region === 'workspaces') continue
    for (const row of (byKey.get(region) ?? new Map<string, ArchiveRow>()).values()) {
      const named = row.values['workspaceId']
      // NULL is a real answer on `changes` and only there: a change row whose record_id answers to
      // nothing has no record to read a project off, and migration 0006 left it NULL rather than
      // stating a judgement nobody made. Inventing one here would be the same lie one layer along.
      if (named === null || named === undefined) continue
      if (known.has(String(named))) continue
      refusals.push({
        path: row.path,
        line: row.line,
        problem:
          `this ${region} row names the workspace ${JSON.stringify(String(named))}, and no workspace with that id is ` +
          'in this archive or in the database. A workspace is a project boundary and every read in Mole Office is scoped ' +
          'to one, so a row behind a project that does not exist can never be answered about again. Add the ' +
          'workspace to workspaces.md, or correct the row.',
      })
    }
  }

  for (const row of (byKey.get('links') ?? new Map<string, ArchiveRow>()).values()) {
    const fromId = String(row.values['fromId'])
    const toId = String(row.values['toId'])
    const from = workspaceOfRecord.get(fromId)
    const to = workspaceOfRecord.get(toId)
    // A missing end is checkReferences' refusal, already raised, and saying it twice for one
    // mistake would make one broken archive read as two.
    if (from === undefined || to === undefined) continue
    if (from === to) continue
    // A LINK WITH A MESSAGE AT ONE END CROSSES NO BOUNDARY: a message is kept in the message centre and belongs to no
    // project, and the link door makes such links. It is filed in the other end's project.
    if (from === MESSAGE_CENTRE || to === MESSAGE_CENTRE) continue
    refusals.push({
      path: row.path,
      line: row.line,
      problem:
        `this link joins ${fromId} (workspace ${JSON.stringify(from)}) to ${toId} (workspace ${JSON.stringify(to)}), ` +
        'and the two ends are in different projects. A link is a statement inside one project: Mole Office refuses to ' +
        'make one across the boundary and refuses to restore one, because a cross-project link that got in this way ' +
        'is afterwards indistinguishable from one somebody meant. Nothing was imported. Move one of the two records ' +
        'into the other\'s workspace, or delete the link from the archive — but do not leave the archive claiming a ' +
        'relationship the product will not make.',
    })
  }
}

/**
 * A PIPELINE'S LIST, ON THE WAY BACK IN.
 *
 * A write refuses a list that names an id no record holds, a record that is not a block, a deleted block, a block of
 * another project, or one block twice. An archive could leave a live pipeline listing any of them, through its own list
 * or by deleting or moving a block a stored pipeline lists. So every pipeline live after the import has its list judged
 * as a write judges it, on the rows the import would leave: the archive's where it holds the record, the stored one
 * otherwise. A deleted pipeline is not read here: its list is checked when it is brought back.
 *
 * REFUSING, NOT DROPPING. Taking an entry out would change a list the archive says is there. Every bad entry is named,
 * at the pipeline's file, else the block's, else at no file, because the pipeline is stored that way already.
 */
function checkPipelineLists(
  byKey: Map<AuthoredRegion, Map<string, ArchiveRow>>,
  stored: Record<string, Map<string, Record<string, unknown>>>,
  refusals: ImportRefusal[],
): void {
  const archived = new Map<string, ArchiveRow>()
  for (const row of (byKey.get('records') ?? new Map<string, ArchiveRow>()).values()) archived.set(String(row.values['id']), row)
  const storedRecords = stored['records'] ?? new Map<string, Record<string, unknown>>()
  const valuesAfter = (id: string): Record<string, unknown> | undefined => archived.get(id)?.values ?? storedRecords.get(id)
  const rowAfter = (id: string): { kind: string; title: string; workspaceId: string; deletedAt: string | null } | undefined => {
    const values = valuesAfter(id)
    if (values === undefined) return undefined
    const deletedAt = values['deletedAt']
    return {
      kind: String(values['kind']),
      title: String(values['title']),
      workspaceId: String(values['workspaceId']),
      deletedAt: deletedAt === null || deletedAt === undefined ? null : String(deletedAt),
    }
  }

  for (const id of new Set([...archived.keys(), ...storedRecords.keys()])) {
    const pipeline = rowAfter(id)
    if (pipeline === undefined || pipeline.kind !== 'pipeline' || pipeline.deletedAt !== null) continue
    const project = JSON.stringify(pipeline.workspaceId)
    const list = blockIdsOf({ data: valuesAfter(id)?.['data'] as PanelRecord['data'] })
    for (const bad of badEntriesOf(pipeline.workspaceId, list, rowAfter)) {
      let what = ', a record that is not a block'
      if (bad.wrong === 'twice') what = ' twice'
      if (bad.wrong === 'missing') what = ', an id no record holds in this archive or in the database'
      if (bad.wrong === 'deleted') what = ', a block the import would leave deleted'
      if (bad.wrong === 'elsewhere') {
        what = `, a block of the project ${JSON.stringify(bad.row.workspaceId)}, while the pipeline is in the project ${project}`
      }
      const pipelineFile = archived.get(id)
      const blockFile = bad.wrong === 'twice' || bad.wrong === 'missing' ? undefined : archived.get(bad.id)
      const at = pipelineFile ?? blockFile
      const takeItOut = bad.wrong === 'twice' ? `take the second ${bad.id} out of its blockIds` : `take ${bad.id} out of its blockIds`
      let correct = `The archive does not hold this pipeline, and it is stored like this already. Add the pipeline's file to the archive and ${takeItOut} there.`
      if (pipelineFile !== undefined) correct = `In the pipeline's file, ${takeItOut}.`
      else if (blockFile !== undefined) {
        let keep = "Correct that record's file"
        if (bad.wrong === 'deleted') keep = 'Leave the block live in its file'
        if (bad.wrong === 'elsewhere') keep = `Leave the block in the project ${project} in its file`
        correct = `${keep}, or add the pipeline's file to the archive and ${takeItOut} there.`
      }
      refusals.push({
        path: at?.path ?? '',
        line: at?.line ?? 0,
        problem:
          `after this import the pipeline ${id} ${JSON.stringify(pipeline.title)} would list ${bad.id}${what}. A write ` +
          `of that list is refused, so an import that leaves one is refused too. Nothing was imported. ${correct}`,
      })
    }
  }
}

/**
 * The change log is append-only, and an importer that accepted an edited one is accepting a forgery.
 *
 * FORMAT.md §10 says it in one line: "Do not edit `changes/`. It is append-only history. An importer
 * that accepts an edited change log is accepting a rewritten past, and it should refuse rather than
 * merge." So a change row already in the database may be identical — which is the ordinary case,
 * every re-import — and may never be different.
 */
function checkAppendOnly(changes: Map<string, ArchiveRow>, stored: Map<string, Record<string, unknown>>, refusals: ImportRefusal[]): void {
  for (const [key, row] of changes) {
    const current = stored.get(key)
    if (current === undefined) continue
    const differing = differingColumns('changes', row.values, current)
    if (differing.length === 0) continue
    refusals.push({
      path: row.path,
      line: row.line,
      problem: aRewrittenChangeRow(key, differing, current[differing[0] ?? ''] ?? null, row.values[differing[0] ?? ''] ?? null),
    })
  }
}

/**
 * THE PLACE IN THE CHANGE LOG'S ORDER THAT EACH INSERTED ROW GETS. Problem BhszTJsVC8rF.
 *
 * "What has changed since I last looked" counts the rows placed after the row a reader's anchor sits
 * on, by the `append_order` column (migration 0194). An archive carries that column as `appendOrder`,
 * so a restore can put every row back in its place and every reader gets the same answer as before.
 *
 * THREE CASES, and the answer says which one happened:
 *
 *   1. EVERY INSERTED ROW CARRIES A PLACE, AND EVERY PLACE IS AFTER THE HIGHEST ONE STORED. The places
 *      are kept as the archive gives them. This is a restore into an empty database, or into one that
 *      holds the start of the same log. Nothing is said, because nothing was changed.
 *   2. SOME INSERTED ROW CARRIES NO PLACE. The archive was written before migration 0194, so the order
 *      is not in it. The rows are placed after every stored row, in the order of their stamps and then
 *      their ids, and a note says the order was rebuilt and what that does to a reader.
 *   3. EVERY ROW CARRIES A PLACE, BUT A PLACE IS TAKEN OR BELOW THE HIGHEST STORED ONE. The archive
 *      comes from another database, or from a copy that has since moved on. The rows are placed after
 *      every stored row, in the order the archive gives, and a note says so.
 *
 * A ROW ALREADY STORED KEEPS ITS PLACE, whatever the archive says (`differingColumns` leaves the
 * column out). Moving a stored row would reorder rows somebody has already read. The rows whose place
 * differs are counted in a note.
 *
 * REFUSED: a place that is not a whole number above zero, and two rows of the archive at one place.
 * Either would be a guess about which row came first.
 *
 * Answers the place to write for each row this import inserts, keyed like `byKey`.
 */
function appendOrderOfTheInserts(
  changes: Map<string, ArchiveRow>,
  stored: Map<string, Record<string, unknown>>,
  refusals: ImportRefusal[],
  notes: string[],
): Map<string, number> {
  const placeOf = new Map<string, number>()
  const heldBy = new Map<number, ArchiveRow>()
  let unfit = false
  for (const row of changes.values()) {
    if (!('appendOrder' in row.values)) continue
    const place = row.values['appendOrder']
    if (typeof place !== 'number' || !Number.isInteger(place) || place < 1) {
      refusals.push({
        path: row.path,
        line: row.line,
        problem: `changes.appendOrder is ${JSON.stringify(place)}, and it has to be a whole number above zero. It is this row's place in the order the change log was appended in.`,
      })
      unfit = true
      continue
    }
    const first = heldBy.get(place)
    if (first !== undefined) {
      refusals.push({
        path: row.path,
        line: row.line,
        problem:
          `changes.appendOrder ${place} is also given to the change row at ${first.path}:${first.line}. Two rows cannot ` +
          'hold one place in the order the log was appended in, and there is no rule for which came first.',
      })
      unfit = true
    } else heldBy.set(place, row)
  }
  if (unfit) return placeOf

  let highestStored = 0
  for (const row of stored.values()) {
    const place = row['appendOrder']
    if (typeof place === 'number' && place > highestStored) highestStored = place
  }
  const inserted = [...changes].filter(([key]) => !stored.has(key))
  const moved = [...changes].filter(([key, row]) => {
    const current = stored.get(key)
    return current !== undefined && 'appendOrder' in row.values && current['appendOrder'] !== row.values['appendOrder']
  }).length
  if (moved > 0) {
    notes.push(
      `${moved} change row(s) are already stored and this archive gives them a different place in the order the log ` +
        'was appended in. Each keeps its stored place, because moving a row would reorder rows that readers have ' +
        'already read.',
    )
  }
  if (inserted.length === 0) return placeOf

  const unplaced = inserted.filter(([, row]) => !('appendOrder' in row.values)).length
  const kept = unplaced === 0 && inserted.every(([, row]) => (row.values['appendOrder'] as number) > highestStored)
  if (kept) {
    for (const [key, row] of inserted) placeOf.set(key, row.values['appendOrder'] as number)
    return placeOf
  }

  const byStamp = (a: [string, ArchiveRow], b: [string, ArchiveRow]): number =>
    byCodeUnit(String(a[1].values['at']), String(b[1].values['at'])) || byCodeUnit(a[0], b[0])
  const byPlace = (a: [string, ArchiveRow], b: [string, ArchiveRow]): number =>
    (a[1].values['appendOrder'] as number) - (b[1].values['appendOrder'] as number)
  inserted.sort(unplaced > 0 ? byStamp : byPlace)
  inserted.forEach(([key], i) => placeOf.set(key, highestStored + 1 + i))
  notes.push(
    unplaced > 0
      ? `${unplaced} of the ${inserted.length} change row(s) this import inserts carry no appendOrder line, because the ` +
          'archive was written before migration 0194. The order the log was appended in is not in this archive, so ' +
          `it was REBUILT: the ${inserted.length} rows are placed after every row already stored, in the order of their ` +
          'stamps and then their ids. "What has changed since I last looked" counts rows in that order, so after this ' +
          'restore it may show a reader rows they had already seen.'
      : `${inserted.length} change row(s) this import inserts cannot keep the place in the order that the archive gives ` +
          `them, because the database already holds a row at place ${highestStored} and some of theirs are not after it. ` +
          'They are placed after every row already stored, in the order the archive gives them.',
  )
  return placeOf
}

/**
 * The resource ledger, and the one uniqueness that is partial.
 *
 * `session_resources_live_idx` is UNIQUE(workspace, session, type, key) WHERE released_at IS NULL —
 * one LIVE row per resource, because a released port may honestly be taken again. Two unreleased
 * rows for one resource would be refused by SQLite with a message naming an index; this names the
 * rows. And every still-unreleased row that is restored is counted in words, which FORMAT.md §2.2
 * requires by name: after a restore those rows describe a machine that may no longer exist, and
 * their `pgid` and `os_started_at` are gone by design.
 */
function checkLedger(
  ledger: Map<string, ArchiveRow>,
  stored: Map<string, Record<string, unknown>>,
  refusals: ImportRefusal[],
  notes: string[],
): void {
  const claims = new Map<string, { id: string; where: string; path: string; line: number }[]>()
  const claim = (row: Record<string, unknown>, where: string, path: string, line: number): void => {
    if (row['releasedAt'] !== null && row['releasedAt'] !== undefined) return
    const key = ['workspaceId', 'sessionRecordId', 'type', 'key'].map((c) => String(row[c])).join('\u0000')
    const entry = { id: String(row['id']), where, path, line }
    const list = claims.get(key)
    if (list === undefined) claims.set(key, [entry])
    else list.push(entry)
  }
  for (const [key, row] of stored) if (!ledger.has(key)) claim(row, 'already in the database', '', 0)
  for (const row of ledger.values()) claim(row.values, 'in this archive', row.path, row.line)
  for (const [key, list] of claims) {
    if (list.length < 2) continue
    const parts = key.split('\u0000')
    const first = list[0]
    refusals.push({
      path: first?.path ?? '',
      line: first?.line ?? 0,
      problem:
        `${list.length} ledger rows would hold the same unreleased ${String(parts[2])} ${String(parts[3])} for one session — ` +
        `${list.map((c) => `${c.id} (${c.where})`).join(', ')}. One live row per resource; release one of them first.`,
    })
  }

  const held = [...ledger.values()].filter((row) => row.values['releasedAt'] === null && !stored.has(keyOf('session_resources', row.values)))
  if (held.length > 0) {
    notes.push(
      `${held.length} resource-ledger row(s) were restored still showing as HELD, and their pgid and osStartedAt are ` +
        'absent by design. The ledger is now describing a machine that may no longer exist: scan before you act on ' +
        'any of them, and never kill a pid this archive named. See design/durability/FORMAT.md §2.2.',
    )
  }
}

/**
 * A REVISION'S `op` IS AN UNRECOGNISED WORD, WHICH IS REPORTED AND NEVER REFUSED.
 *
 * Principle B decides this, and it decides it the same way it decides `kind: "widget"`. `op` says
 * what kind of write a revision came out of; a word outside `REVISION_OPS` is a word Mole Office does not
 * know, not a row that contradicts itself, and dropping or refusing a row of somebody's history
 * because of one unreadable label would lose the content the whole table exists to keep.
 *
 * IT IS NOT THE SAME AS `actorType`, WHICH IS REFUSED ONE FUNCTION UP. `actorType` is the field the
 * human-only rule reads, so an unrecognised word there is read as "not a person" and silently
 * changes what the project means. Nothing reads `op` to decide what is stored. Two places read it to
 * decide what a person is TOLD: the export writes a different paragraph on a `baseline` revision's
 * page, and the refusal for two rows claiming one revision number says which of them is a baseline.
 * Neither knows a word outside `REVISION_OPS`, so both describe such a row as an ordinary revision.
 * So the honest answer is to carry it and say it is there.
 */
function checkRevisionOps(revisions: Map<string, ArchiveRow>, notes: string[]): void {
  const unknown = new Set<string>()
  let rows = 0
  for (const row of revisions.values()) {
    const op = row.values['op']
    if (typeof op === 'string' && (REVISION_OPS as readonly string[]).includes(op)) continue
    unknown.add(String(op))
    rows += 1
  }
  if (rows === 0) return
  notes.push(
    `${rows} revision row(s) say the write they came out of was ${[...unknown].sort(byCodeUnit).join(', ')}, and ` +
      `Mole Office knows only ${REVISION_OPS.join(', ')}. They are imported exactly as written rather than dropped — a ` +
      `revision holds the only stored copy of what a record used to contain — and every screen will show the word ` +
      `as it stands. Nothing reads it to decide what is stored. Two places read it to decide what you are told: ` +
      `the page an export writes for a revision, and the refusal when two rows claim one revision number. Neither ` +
      `knows this word, so both describe the row as an ordinary revision.`,
  )
}

/**
 * A REVISION'S `contentHash` MUST NAME THE CONTENT WRITTEN ON THE SAME ROW.
 *
 * Principle B, and it lands on the refuse side rather than the report side. A row that says "this is
 * what the record held" and carries a token naming something else is two statements about one moment
 * that cannot both be true, and there is no rule for picking one.
 *
 * IT IS THE ONLY THING `keepTheLedgerTrue` USES TO DECIDE WHETHER A RECORD'S NEWEST REVISION STILL
 * DESCRIBES THE RECORD. That function compares the newest revision's `contentHash` against `versionOf`
 * of the record the import would leave behind, and writes a revision only when the two differ. A hash
 * that does not describe its own row therefore makes the repair skip a record whose ledger really had
 * gone stale, or write a revision for a record whose ledger was already true — quietly, either way.
 *
 * The hash is built through `contentOf` and `versionOf`, the same two functions `saveRevision` and the
 * backfill write it with, so this compares against the token the product itself would have produced.
 * Every value read here is already known to be of the right type: `checkRow` refused the row otherwise.
 */
function checkRevisionHashes(revisions: Map<string, ArchiveRow>, refusals: ImportRefusal[]): void {
  // A REVISION THAT STORES A VALUE ONCE IS PUT BACK TOGETHER FROM THE ARCHIVE'S OWN PAGES, never from the database, so
  // the hash checked is of the content this archive holds, and an archive missing the revision that holds the value is
  // refused here rather than written.
  const byNumber = new Map<string, StoredRevisionData>()
  for (const { values } of revisions.values()) {
    // Read from the row when asked for, so a long value read again from the archive is not held for every revision.
    byNumber.set(`${String(values['recordId'])}\u0000${String(values['seq'])}`, {
      get data() {
        return values['data'] as Record<string, unknown>
      },
      get parts() {
        return values['parts']
      },
    })
  }
  for (const row of revisions.values()) {
    const values = row.values
    const summary = values['summary']
    const deletedAt = values['deletedAt']
    let data: Record<string, unknown>
    try {
      data = wholeRevisionData(
        { recordId: String(values['recordId']), seq: Number(values['seq']), data: values['data'] as Record<string, unknown>, parts: values['parts'] },
        (recordId, seq) => byNumber.get(`${recordId}\u0000${String(seq)}`),
      )
    } catch (error) {
      refusals.push({ path: row.path, line: row.line, problem: aRevisionHeldInPart((error as Error).message) })
      continue
    }
    const hash = versionOf(
      contentOf({
        kind: String(values['kind']),
        title: String(values['title']),
        summary: summary === null || summary === undefined ? null : String(summary),
        data,
        deletedAt: deletedAt === null || deletedAt === undefined ? null : String(deletedAt),
      }),
    )
    if (values['contentHash'] === hash) continue
    refusals.push({
      path: row.path,
      line: row.line,
      problem: aRevisionWhoseHashDisagrees(String(values['id']), String(values['recordId']), values['contentHash'], hash),
    })
  }
}

/**
 * A REVISION'S DATA, AND A SESSION RECORD'S, MUST BE TEXT SQLITE ACCEPTS AS JSON.
 *
 * Problem 7S30dTLwo3g2, wave 13s round 64. The import writes a JSON column as `JSON.stringify` gives it, and
 * JavaScript reads JSON nested far deeper than SQLite does. Measured on SQLite 3.53.4, `json_valid` answers 1 for
 * data nested 1,000 levels deep and 0 for 1,001, and `json_extract` stops at the second with "malformed JSON". An
 * index that reads a revision's data, or a session record's, by `json_extract` refuses such a row on insert, so the
 * import stopped on a raw SQLite error after a plan that said it would go through.
 *
 * SO SQLITE IS ASKED, NOT A COPY OF ITS RULE. The text tested is the text `bindable` would write, and `json_valid`
 * is SQLite's own answer, so this check and the database cannot disagree. It refuses whether or not such an index
 * is on this database yet, because once one is, the row cannot be written. The statement reads no table.
 */
function checkDataIsJson(byKey: Map<AuthoredRegion, Map<string, ArchiveRow>>, refusals: ImportRefusal[]): void {
  const accepted = sqlite.prepare('SELECT json_valid(?) AS valid')
  const check = (region: 'records' | 'revisions', row: ArchiveRow, what: string): void => {
    const text = bindable(region, 'data', row.values['data'])
    if (typeof text !== 'string' || (accepted.get(text) as { valid: number }).valid !== 0) return
    refusals.push({
      path: row.path,
      line: row.line,
      problem:
        `${what} holds data that SQLite does not accept as JSON: its json_valid gives 0, as it does for data nested ` +
        `more than 1,000 levels deep. Once written, this row would stop an index or a query that reads the column ` +
        `by json_extract with "malformed JSON". Fix the data in the archive.`,
    })
  }
  for (const row of (byKey.get('revisions') ?? new Map<string, ArchiveRow>()).values()) {
    check('revisions', row, `revision ${String(row.values['id'])} of record ${String(row.values['recordId'])}`)
  }
  for (const row of (byKey.get('records') ?? new Map<string, ArchiveRow>()).values()) {
    if (row.values['kind'] === 'session') check('records', row, `session record ${String(row.values['id'])}`)
  }
}

/**
 * TWO REVISIONS OF ONE RECORD MAY NOT HOLD ONE NUMBER, AND A GAP IS SAID OUT LOUD.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE COLLISION IS A REFUSAL AND NOT A CRASH
 * ---------------------------------------------------------------------------------------
 *
 * `revisions_record_seq_idx` is UNIQUE(record_id, seq). Before this check existed, an archive that
 * collided with it got `ok: true` from `planImport` and then a raw
 * `SqliteError: UNIQUE constraint failed: revisions.record_id, revisions.seq` out of `applyImport`
 * — after the operator had read a plan saying the import was clean. The transaction rolled back, so
 * nothing was half-written, and that is the only part of it that was working as intended.
 *
 * IT IS NOT A HYPOTHETICAL. The backfill in db/revision-backfill.ts gives every pre-ledger record a
 * baseline at seq 1 under a fresh nanoid. Any two installations that ran it independently therefore
 * hold a different revision 1 of the same record, and so does a database that restored a
 * pre-round-eight mirror and then migrated. Restoring the full archive on top hits this on the first
 * record.
 *
 * THERE IS NO MERGE. Two rows claiming revision 1 of one record are two answers to "what did this
 * record hold first", and nothing here can pick one: the baseline holds what the record contained on
 * the day the ledger was built, the archive's holds what it contained when it was written, and both
 * are true statements about different moments. So this refuses, names both rows, and says which is
 * a baseline — which is the fact an operator needs to decide.
 *
 * ---------------------------------------------------------------------------------------
 * A GAP IS REPORTED, BECAUSE A GAP CAN BE HONEST
 * ---------------------------------------------------------------------------------------
 *
 * A project-scoped archive carries only the revisions filed in that project. A record that moved
 * between projects before 18 August 2026 left its earlier revisions behind, so its archive can
 * begin at 3. That is an archive faithfully reporting a database that was already wrong, and
 * refusing it would refuse the operator's only copy of the history that IS there.
 *
 * ORDER IS REPORTED FOR THE SAME REASON. A revision stamped earlier than the one before it looks
 * like a forged file and is also what a clock going backwards produces — every stamp here is local
 * wall clock, and an hour disappears twice a year. So it is said, not refused.
 */
function checkRevisionNumbers(
  incoming: Map<string, ArchiveRow>,
  stored: Map<string, Record<string, unknown>>,
  refusals: ImportRefusal[],
  notes: string[],
): void {
  interface Claim {
    id: string
    seq: number
    at: string
    op: string
    where: string
    path: string
    line: number
  }
  const byRecord = new Map<string, Claim[]>()
  const add = (claim: Claim, recordId: string): void => {
    const list = byRecord.get(recordId)
    if (list === undefined) byRecord.set(recordId, [claim])
    else list.push(claim)
  }

  // A NUMBER THAT IS NOT A NUMBER IS REFUSED BEFORE ANYTHING IS COUNTED. `writeExport` throws
  // rather than write one — "a ledger with a seq that is not one cannot say which revision came
  // before which" — and an importer is a write path, so it refuses to read one back in.
  for (const row of incoming.values()) {
    const seq = row.values['seq']
    if (typeof seq === 'number' && Number.isInteger(seq) && seq >= 1) continue
    refusals.push({ path: row.path, line: row.line, problem: aRevisionNumberThatIsNotOne(seq) })
  }

  // A STAMP THAT IS NOT A STAMP IS REFUSED, for the same reason and by principle B. `at` says when
  // this revision was taken, so a word that names no moment contradicts the line it is written on.
  // It is the other field this function orders history by, and the order check below compares stamps
  // as text — so a word like "banana" sorts after every date and is not even reported as out of
  // order. Read with `parseLocalStamp`, the shared reader, so this file does not carry a second copy
  // of the grammar for what a stamp is.
  for (const row of incoming.values()) {
    const at = row.values['at']
    if (typeof at === 'string' && parseLocalStamp(at) !== null) continue
    refusals.push({
      path: row.path,
      line: row.line,
      problem:
        `this revision says it was taken at ${JSON.stringify(at)}, and that names no moment. A stamp is ` +
        `\`2026-08-18\`, or \`2026-08-18 14:30\`, or \`2026-08-18 14:30:00\`, written in local wall-clock time. ` +
        `A revision's stamp is what its history is put in order by, so a word that is not a date is not a value ` +
        `Mole Office merely does not recognise — it contradicts the line it is written on.`,
    })
  }

  // The state the import would finish in: every stored row the archive does not name, plus every
  // row the archive does. Asked of the FINAL state, exactly as checkTitles is, because that is the
  // state the UNIQUE index will be looking at.
  for (const [id, row] of stored) {
    if (incoming.has(id)) continue
    add(
      {
        id,
        seq: Number(row['seq']),
        at: String(row['at']),
        op: String(row['op']),
        where: 'already in the database',
        path: '',
        line: 0,
      },
      String(row['recordId']),
    )
  }
  for (const row of incoming.values()) {
    const seq = row.values['seq']
    if (typeof seq !== 'number' || !Number.isInteger(seq) || seq < 1) continue
    add(
      {
        id: String(row.values['id']),
        seq,
        at: String(row.values['at']),
        op: String(row.values['op']),
        where: 'in this archive',
        path: row.path,
        line: row.line,
      },
      String(row.values['recordId']),
    )
  }

  const gapped: string[] = []
  const outOfOrder: string[] = []
  for (const [recordId, claims] of byRecord) {
    const held = new Map<number, Claim[]>()
    for (const claim of claims) held.set(claim.seq, [...(held.get(claim.seq) ?? []), claim])
    for (const [seq, list] of held) {
      if (list.length < 2) continue
      const first = list[0]
      const baselines = list.filter((c) => c.op === 'baseline')
      refusals.push({
        path: first?.path ?? '',
        line: first?.line ?? 0,
        problem:
          `${list.length} rows would each be revision ${seq} of record ${recordId} — ` +
          `${list.map((c) => `${c.id} (${c.where}, written as a ${c.op})`).join(', ')} — and a record may have only ` +
          `one revision of each number. ` +
          (baselines.length > 0
            ? `${baselines.length} of them ${baselines.length === 1 ? 'is a baseline' : 'are baselines'}, which the ` +
              `migration in src/server/db/revision-backfill.ts writes for a record that had no ledger: it holds what ` +
              `that record contained on the day the ledger was built, not what it contained when it was written. ` +
              `Two installations that ran that migration separately hold a different revision 1 of the same record. `
            : '') +
          `Nothing here can merge them, because they are two statements about two different moments. Import into a ` +
          `database whose ledger came from the same lineage as this archive — an empty one restores cleanly — or ` +
          `remove the colliding row on purpose first.`,
      })
    }

    const numbers = [...held.keys()].sort((a, b) => a - b)
    if (numbers[0] !== 1 || numbers[numbers.length - 1] !== numbers.length) gapped.push(recordId)

    const inOrder = [...claims].sort((a, b) => a.seq - b.seq)
    for (let i = 1; i < inOrder.length; i += 1) {
      const earlier = inOrder[i - 1]
      const later = inOrder[i]
      if (earlier === undefined || later === undefined) continue
      if (later.at >= earlier.at) continue
      outOfOrder.push(`${recordId} revision ${later.seq} (${later.at}) is stamped before revision ${earlier.seq} (${earlier.at})`)
    }
  }

  if (gapped.length > 0) {
    notes.push(
      `${gapped.length} record(s) would end up with a revision ledger that does not run 1, 2, 3 with nothing ` +
        `missing: ${gapped.sort(byCodeUnit).slice(0, 10).join(', ')}${gapped.length > 10 ? ', …' : ''}. The usual ` +
        `cause is a project-scoped archive of a record whose earlier revisions are filed in another project. The ` +
        `history that is here is real; the numbers that are missing answer nothing, and the record's history begins ` +
        `part-way through.`,
    )
  }
  if (outOfOrder.length > 0) {
    notes.push(
      `${outOfOrder.length} revision(s) are stamped earlier than the revision before them: ` +
        `${outOfOrder.slice(0, 5).join('; ')}${outOfOrder.length > 5 ? '; …' : ''}. Every stamp in Mole Office is local ` +
        `wall clock, so a clock that went back an hour produces this honestly. A hand-edited file produces it too, ` +
        `and nothing here can tell the two apart.`,
    )
  }
}

/**
 * The one thing that could make a staging title unsafe, checked rather than asserted.
 *
 * `stagingTitle` argues that nobody would type its prefix. That is an argument and not a proof, and
 * the failure it would have produced is a UNIQUE constraint on a title that looks nothing like the
 * one being written — so it is checked against every title in the archive and in the database, for
 * the ids that are actually being parked and no others.
 *
 * WHAT IT PREVENTS TODAY: NOTHING THE DATABASE WOULD REFUSE. `records_title_idx` has been a plain
 * index since `0030_titles_may_repeat`, so a record parked on a title another record already holds
 * would now simply be written. This check is therefore about a constraint that is gone, and it is
 * kept only because the parking it guards is kept. See `stagingTitle` for what removing both takes.
 */
function stagingCollision(
  parked: readonly string[],
  records: Map<string, ArchiveRow>,
  stored: Map<string, Record<string, unknown>>,
  refusals: ImportRefusal[],
): void {
  if (parked.length === 0) return
  const taken = new Set<string>()
  for (const row of stored.values()) taken.add(String(row['title']))
  for (const row of records.values()) taken.add(String(row.values['title']))
  for (const id of parked) {
    if (!taken.has(stagingTitle(id))) continue
    refusals.push({
      path: '',
      line: 0,
      problem:
        `a record holds the title ${JSON.stringify(stagingTitle(id))}, which this import needs to park the renamed record ` +
        `${id} on while other titles move. Rename that record and import again.`,
    })
  }
}

// ============================================================================ the revision ledger

/**
 * WHAT AN IMPORT OWES THE REVISION LEDGER, AND WHY IT IS THIS AND NOT SOMETHING ELSE.
 *
 * ---------------------------------------------------------------------------------------
 * THE DEFECT THIS ANSWERS, MEASURED
 * ---------------------------------------------------------------------------------------
 *
 * An import writes `records` rows. Until 18 August 2026 it wrote no revision for them, and the
 * ordinary restore therefore left the ledger describing a record that no longer held what it said.
 * Measured: file a note, export, edit the note, restore the export. The record went back to the
 * archived wording, the newest revision still claimed today's, and `GET /api/records/:id` served a
 * `version` equal to revision 1's `content_hash` rather than the newest revision's. The next
 * ordinary edit was then credited with the whole rollback — one person adding a summary got a
 * revision saying they had also rewritten the title and the body — while the change log, correctly,
 * held one row for them. The ledger was fabricating who changed what.
 *
 * ---------------------------------------------------------------------------------------
 * THE RULE, WHICH IS A MEASUREMENT AND NOT A HABIT
 * ---------------------------------------------------------------------------------------
 *
 * AFTER AN IMPORT, THE NEWEST REVISION OF EVERY RECORD THE IMPORT REWROTE HOLDS WHAT THAT RECORD
 * HOLDS. That is the whole rule. It is checked, per record, against the state the import will
 * finish in, and a revision is written only where it is not already true.
 *
 * Saying it that way rather than "an import writes a revision per record it writes" matters twice
 * over:
 *
 *   A SECOND IMPORT OF THE SAME TEXT CHANGES NOTHING. The first import made the rule true, so the
 *   second finds it true and writes nothing. That is the property this file's header demands of
 *   every import, and it is why the importer writes no change row of its own.
 *
 *   AN UPDATE WHOSE CONTENT MATCHES THE LEDGER ADDS NOTHING EITHER. Only the disagreement is worth
 *   a row.
 *
 * ---------------------------------------------------------------------------------------
 * REWROTE, NOT WROTE: A RECORD THIS IMPORT CREATES IS NOT THIS IMPORT'S TO CORRECT
 * ---------------------------------------------------------------------------------------
 *
 * A record the import INSERTS arrives with its history beside it, out of the same archive, and this
 * writes nothing for it even when the two disagree. That disagreement is a fact about the archive,
 * and an archive exists to be restored rather than improved: an importer that quietly added a
 * revision the source database never had would hand back a different database from the one the
 * backup was taken of, and "restoring the archive gives you the database the archive came from" is
 * the sentence the whole durability layer rests on. There is a real corpus in that state — a fixture
 * in tests/import-roundtrip.test.ts writes `records.data` through raw SQL on purpose, so its ledger
 * was stale before any export happened.
 *
 * WHAT PUTS THAT RIGHT IS `npm run db:migrate`, which catches up every record whose ledger has
 * stopped describing it and prints how many. See `planStaleLedgers` in db/revision-backfill.ts. It
 * is a repair somebody runs and reads the report of, rather than one that happens inside a restore.
 *
 * An UPDATE is different in the one way that matters: the record was already here, the import
 * rewrote it, and that write is this operation's. A write with no revision is the hole this whole
 * table exists to prevent, so this fills it.
 *
 * ---------------------------------------------------------------------------------------
 * WHO IS SAID TO HAVE WRITTEN IT, AND WHAT IT IS CALLED
 * ---------------------------------------------------------------------------------------
 *
 * `system:import`, NOT THE PERSON WHO RAN THE IMPORT. `POST /api/import` is human-only, so there is
 * a person behind this — and they did not edit the record. Writing their name on a revision that
 * moved a title they never typed is a fabricated observation of exactly the kind a `baseline` is
 * careful not to make. What they did is run a restore, and the note says so.
 *
 * `op` IS `restore`, WHICH IS THE WORD FOR THIS. `REVISION_OPS` defines `restore` as content written
 * forward from somewhere earlier, adding a revision and removing none, with the note saying what was
 * put back. That is exactly what an import does to a record: the archive is the earlier state and no
 * history is rewritten. `update` was the alternative and it reads as an ordinary edit, which this is
 * not.
 *
 * NO CHANGE ROW IS WRITTEN, and this file's header is why: writing "the importer changed this" rows
 * would make a second import of the same text produce a different database. A revision with no
 * change row is an established shape — the backfill writes 536 of them for the same reason, and its
 * own header argues it — because `changes` is a day's page and this is not an event in the work.
 *
 * ---------------------------------------------------------------------------------------
 * COMPARING BY THE VERSION TOKEN, AND THE ONE DIRECTION IT CAN BE WRONG IN
 * ---------------------------------------------------------------------------------------
 *
 * `versionOf(contentOf(row))` is the comparison, which is the same token `GET /api/records/:id`
 * hands back as `version` and the same one stored in `revisions.content_hash`. So the rule this
 * enforces is exactly the sentence a caller can check: the version you are served names the newest
 * revision you can read.
 *
 * lib/version.ts says two different tokens are NOT proof that the content differs, because key order
 * inside `data` is part of the hash. So this can write a revision when only the order of two keys
 * moved. That is the safe direction and it is deliberate: the cost is one extra row holding exactly
 * what the record holds, and the cost of the other direction is the ledger staying wrong. Comparing
 * with `fieldsThatDiffer` would fail the other way round.
 *
 * ---------------------------------------------------------------------------------------
 * THE ID IS WORKED OUT, NOT DRAWN AT RANDOM
 * ---------------------------------------------------------------------------------------
 *
 * `planImport` and `applyImport` both run `buildPlan`, so that the plan a person reads IS the plan
 * that is applied — the test that holds that compares the two lists of rows. A `nanoid()` here would
 * put a different id in each of them and break that promise for a row nobody could check afterwards.
 * So the id is a hash of the three things that make this row what it is: which record, which number,
 * and what it holds. Two runs against the same database and the same archive therefore name the same
 * row, and two different rows cannot collide, because no two rows share all three.
 */
function keepTheLedgerTrue(
  root: string,
  byKey: Map<AuthoredRegion, Map<string, ArchiveRow>>,
  stored: Record<string, Map<string, Record<string, unknown>>>,
  rows: readonly ImportRowChange[],
  notes: string[],
): { revisionId: string; write: Write }[] {
  const touched = rows.filter((row) => row.region === 'records')
  if (touched.length === 0) return []

  const incomingRecords = byKey.get('records') ?? new Map<string, ArchiveRow>()
  const storedRecords = stored['records'] ?? new Map<string, Record<string, unknown>>()
  const incomingRevisions = byKey.get('revisions') ?? new Map<string, ArchiveRow>()
  const storedRevisions = stored['revisions'] ?? new Map<string, Record<string, unknown>>()

  /**
   * Each record's ledger AS THE IMPORT WOULD LEAVE IT: every stored row the archive does not name,
   * plus every row the archive carries. Built from the same two sides `differingColumns` compares,
   * so this is the ledger the writes above are about to produce and not the one in the file now.
   */
  const ledger = new Map<string, { seq: number; contentHash: string }[]>()
  const remember = (recordId: string, seq: unknown, contentHash: unknown): void => {
    if (typeof seq !== 'number' || !Number.isInteger(seq)) return
    const list = ledger.get(recordId)
    const entry = { seq, contentHash: String(contentHash) }
    if (list === undefined) ledger.set(recordId, [entry])
    else list.push(entry)
  }
  for (const [id, row] of storedRevisions) {
    if (incomingRevisions.has(id)) continue
    remember(String(row['recordId']), Number(row['seq']), row['contentHash'])
  }
  for (const row of incomingRevisions.values()) {
    remember(String(row.values['recordId']), row.values['seq'], row.values['contentHash'])
  }

  const at = nowStamp()
  const out: { revisionId: string; write: Write }[] = []
  /** Records the import writes that have no ledger at all. Not this function's to invent. */
  const noLedger: string[] = []
  /** Records whose stored `data` will not read as an object, so nothing here can hash them. */
  const unreadable: string[] = []
  /**
   * Records the import CREATES that arrive already disagreeing with their own history: the archive's
   * record file and the archive's newest revision file for it describe different content.
   *
   * NOTHING IS WRITTEN FOR THESE, for the reason the header gives at length — an archive exists to be
   * restored rather than improved, and correcting one here would hand back a different database from
   * the one the backup was taken of. What changes is that they are COUNTED AND SAID. They used to
   * arrive in silence, so a restore that was already wrong stayed wrong quietly and the next
   * `npm run db:migrate` rewrote them without anybody having been told there was anything to rewrite.
   */
  const arrivedDisagreeing: string[] = []

  for (const change of touched) {
    const id = change.key
    const history = ledger.get(id) ?? []
    // SAID FOR EVERY RECORD THE IMPORT WRITES, inserted or updated, because it is a fact about the
    // archive and the database rather than about this function's rule. Nothing is written for it.
    if (history.length === 0) {
      noLedger.push(id)
      continue
    }
    // The two rows joined without reading them, so a long value is read only where it is asked for, and again when written.
    const storedRow = storedRecords.get(id) ?? {}
    const incomingRow = incomingRecords.get(id)?.values ?? {}
    const final = copyOf(storedRow, incomingRow)
    const data = final['data']
    if (typeof data !== 'object' || data === null || Array.isArray(data)) {
      // ONLY AN UPDATE IS COUNTED HERE. The note this list produces says a revision could not be
      // decided on and none was written; for a record the import CREATES none would have been
      // written whatever the data read as, so listing it there would answer a question nobody asked.
      if (change.action === 'update') unreadable.push(id)
      continue
    }
    const newest = history.reduce((a, b) => (b.seq > a.seq ? b : a))
    /** The content the record is left holding, worked out from the two rows each time it is asked for. */
    const contentNow = (row: Record<string, unknown>, rowData: Record<string, unknown>): ReturnType<typeof contentOf> =>
      contentOf({
        kind: String(row['kind']),
        title: String(row['title']),
        summary: row['summary'] === undefined || row['summary'] === null ? null : String(row['summary']),
        data: rowData,
        deletedAt: row['deletedAt'] === undefined || row['deletedAt'] === null ? null : String(row['deletedAt']),
      })
    const content = contentNow(final, data as Record<string, unknown>)
    const hash = versionOf(content)
    if (hash === newest.contentHash) continue

    // See the header: a record this import CREATES is restored as the archive holds it, history and
    // all, and this does not correct a disagreement it did not make. It says so now, which it did
    // not before — the check runs first and only the WRITE is skipped.
    if (change.action !== 'update') {
      arrivedDisagreeing.push(id)
      continue
    }

    const seq = newest.seq + 1
    // JOINED ON A BYTE NO ID CAN HOLD, written as its escape rather than as the byte — the same
    // separator and the same reason as `checkLedger` above. Joining on a character an id could hold
    // would let two different rows hash to one string, and an id is the one thing that may not.
    // It begins with a letter or a digit, as every id the office makes does (src/server/lib/hash-id.ts).
    const revisionId = anIdFromAHash(createHash('sha256').update(`${id}\u0000${seq}\u0000${hash}`).digest())
    out.push({
      revisionId,
      write: insertStatement('revisions', {
        id: revisionId,
        recordId: id,
        // DERIVED FROM THE RECORD, in the same write, exactly as `saveRevision` and the backfill
        // derive it: a revision's project is the project of the record it is of.
        workspaceId: final['workspaceId'] === undefined || final['workspaceId'] === null ? null : String(final['workspaceId']),
        seq,
        contentHash: hash,
        kind: content.kind,
        title: content.title,
        summary: content.summary,
        // Worked out again when the revision is written, so the data is not held until then. It was checked above to
        // be an object, and each long value in it is checked, when read again, to be what was read here.
        get data() {
          const again = copyOf(storedRow, incomingRow)
          return contentNow(again, again['data'] as Record<string, unknown>).data
        },
        deletedAt: content.deletedAt,
        op: 'restore',
        actorType: 'system',
        actorId: 'import',
        sessionId: null,
        at,
        note:
          `An import from ${root} wrote this record and the ledger no longer held what the record holds, so this ` +
          `revision was written to say what it holds now. Nobody edited the record: a person ran a restore. What ` +
          `the record held before this write is the revision before this one.`,
      }),
    })
  }

  if (out.length > 0) {
    notes.push(
      `${out.length} record(s) this archive rewrites are left holding content their newest revision did not ` +
        `describe, so a revision was written for each saying what the record holds now. It is attributed to ` +
        `system:import rather than to whoever ran the import, because nobody edited these records. Without it the ` +
        `ledger would claim content the record does not hold, and the next ordinary edit would be credited with ` +
        `undoing everything this restore undid.`,
    )
  }
  if (noLedger.length > 0) {
    notes.push(
      `${noLedger.length} record(s) this archive writes have no revision at all, in the archive or in the database, ` +
        `so nothing here says what they used to hold. That is what an archive written before the revision ledger ` +
        `existed looks like. \`npm run db:migrate\` gives each of them a baseline holding what it contains then, ` +
        `and says in plain words that a baseline is not the record as it was created.`,
    )
  }
  if (arrivedDisagreeing.length > 0) {
    notes.push(
      `${arrivedDisagreeing.length} record(s) this archive CREATES arrived already disagreeing with their own ` +
        `history: the archive's record and the archive's newest revision of it describe different content. ` +
        `Nothing was written for them and nothing was corrected — an archive is restored as it stands, so that ` +
        `restoring it gives back the database it was taken of, and this disagreement was already in the source. ` +
        `\`npm run db:migrate\` writes one revision for each of them saying what the record holds now, and prints ` +
        `how many: ${arrivedDisagreeing.sort(byCodeUnit).slice(0, 5).join(', ')}.`,
    )
  }
  if (unreadable.length > 0) {
    notes.push(
      `${unreadable.length} record(s) this archive writes hold a \`data\` that does not read as an object, so ` +
        `whether their newest revision still describes them could not be worked out and no revision was written ` +
        `for them: ${unreadable.sort(byCodeUnit).slice(0, 5).join(', ')}. Everything else about them was imported.`,
    )
  }
  return out
}

// ============================================================================ writing

/** The value to bind for one column: booleans as 0/1, documents as text, everything else as it is. */
function bindable(region: AuthoredRegion, column: string, value: unknown): unknown {
  if (value === null || value === undefined) return null
  const facts = COLUMNS[region]?.get(column)
  if (facts?.dataType === 'boolean') return value === true ? 1 : 0
  if (facts?.dataType === 'json') {
    // Compact, which is what drizzle writes on every other path into this column. A restored
    // database should be indistinguishable from one the product wrote; the export pretty-prints on
    // the way out either way, so the round trip is a fixed point.
    return JSON.stringify(value)
  }
  if ((columnsOf(region).jsonBlocks as readonly string[]).includes(column)) {
    // A JSON document in a TEXT column is stored compact, as the product writes one.
    return JSON.stringify(value)
  }
  return value
}

/** INSERT one row. Missing columns bind NULL, except an absent run-keys mark takes its migration default 0. */
function insertStatement(region: AuthoredRegion, values: Record<string, unknown>): Write {
  const declared = columnsOf(region)
  const columns = [...declared.fields, ...declared.jsonBlocks]
  const facts = COLUMNS[region] ?? new Map<string, ColumnFacts>()
  const sqlNames = columns.map((c) => facts.get(c)?.sql ?? c)
  return {
    sql: `INSERT INTO ${region} (${sqlNames.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
    params: () => {
      const texts = historyTextsOf(values)
      return columns.map((column) => {
        const text = texts?.[column]
        if (text !== undefined && text !== null) return text
        return bindable(region, column, region === 'agents' && column === 'runKeysOnly' && !(column in values) ? 0 : values[column])
      })
    },
  }
}

/**
 * UPDATE the columns that differ, and only those.
 *
 * A column the format does not carry is NOT in the list, so `pgid` and `os_started_at` on a ledger
 * row that already exists are left exactly as they are. Absent in a file is not null: the format has
 * decided not to carry those two, so the file says nothing about them — and nulling a live row's
 * anti-reuse anchor would remove the one thing standing between a release and a recycled pid.
 */
function updateStatement(
  region: AuthoredRegion,
  key: string,
  values: Record<string, unknown>,
  columns: readonly string[],
  current: Record<string, unknown>,
): Write {
  const facts = COLUMNS[region] ?? new Map<string, ColumnFacts>()
  const pk = PRIMARY_KEY[region] ?? []
  const sets = columns.map((column) => `${facts.get(column)?.sql ?? column} = ?`)
  const where = pk.map((column) => `${facts.get(column)?.sql ?? column} = ?`)
  return {
    sql: `UPDATE ${region} SET ${sets.join(', ')} WHERE ${where.join(' AND ')}`,
    // The WHERE takes the row's CURRENT key, not the incoming one. They are equal by construction —
    // a row is matched on its primary key and nothing else — and reading it from the stored row
    // makes that impossible to get wrong later. `key` is here for the message a failure would carry.
    params: () => {
      const texts = historyTextsOf(values)
      return [
        ...columns.map((column) => {
          const text = texts?.[column]
          return text !== undefined && text !== null ? text : bindable(region, column, values[column])
        }),
        ...pk.map((column) => current[column] ?? null),
      ]
    },
  }
}

// ============================================================================ the two entry points

/**
 * What an import from `root` would do. Writes nothing, ever.
 *
 * This is the answer to "no silent data loss": a person can see every row that would change and
 * every column that would move before anything moves. It is also what `GET /api/import` serves and
 * what the CLI prints when it is run without `--apply`.
 *
 * THE PLAN IS BUILT INSIDE A TRANSACTION THAT ONLY READS, so it reads one moment of the store, as `applyImport`'s does.
 * A stored value longer than READ_AGAIN_FROM is read again by its key when a check asks for it, and checked against the
 * digest of its first reading. With no transaction, another process that writes such a value between the two readings
 * makes the dry run throw, for no fault of the export. The transaction is deferred, so it takes no write lock, and in
 * WAL mode it holds back no writer.
 */
export function planImport(root: string = exportRoot()): ImportPlan {
  return sqlite.transaction((): ImportPlan => buildPlan(root).plan).deferred()
}

/**
 * Import, or refuse and change nothing.
 *
 * THE PLAN IS BUILT INSIDE THE TRANSACTION. Deciding what to write against one reading of the
 * database and then writing against another is how a check passes and the write it was protecting
 * fails anyway. Building it inside means the state that was checked is the state that is written.
 *
 * A refusal throws, which rolls back. So does a bug, so does a constraint nobody predicted, and so
 * does the process being killed — SQLite rolls back on the next open. There is no half-import.
 */
export function applyImport(root: string = exportRoot()): ImportReport {
  return sqlite.transaction((): ImportReport => {
    const { plan, writes } = buildPlan(root)
    if (!plan.ok) throw new ImportRefused(plan)
    // Archive rows are historical evidence. Capturing them again would invent new watermarks
    // and collide with the exact archived baselines. DDL and writes share this transaction;
    // immutable-evidence triggers remain active, and rollback restores the original schema.
    const captureNames = ['submission_run_baseline', 'submission_revisions_insert', 'submission_changes_insert',
      'submission_links_insert', 'submission_links_delete', 'submission_links_update', 'submission_links_before_update']
    const capture = (sqlite.prepare("SELECT name, sql FROM sqlite_schema WHERE type = 'trigger'").all() as { name: string; sql: string }[])
      .filter((one) => captureNames.includes(one.name))
    for (const one of capture) sqlite.exec('DROP TRIGGER ' + one.name)
    try {
      // One prepared statement per distinct SQL, not per row. A restore of the live corpus is 1,125
      // rows of which 290 are the same INSERT, and re-preparing it 290 times is work with no answer
      // attached to it.
      const prepared = new Map<string, (...params: never[]) => unknown>()
      for (const write of writes) {
        let run = prepared.get(write.sql)
        if (run === undefined) {
          const statement = sqlite.prepare(write.sql)
          run = (...params: never[]) => statement.run(...params)
          prepared.set(write.sql, run)
        }
        run(...(write.params() as never[]))
      }
      readRegistryAliases(sqlite)
      // Old archives have no submission baseline. Keep imported finishes explicitly historical.
      // WHICH RUN SAYS IT IS FINISHED IS ASKED OF `aRunSaysItIsFinished`, and not copied here in SQL. The copy this
      // replaces kept the old rule after 13n's round Q changed it (problem zv-Z5SMF_bst), and so listed a crashed
      // run with an agent-said close. There is no json_valid test: `checkDataIsJson` refuses an archive's session row
      // that SQLite does not read as JSON, and since 0277's index no such row can be written to the table at all.
      // The rows are read one at a time, and only the ids of the finished ones are kept, because nothing else may run on
      // the connection while the reading is open.
      const legacy = sqlite.prepare('INSERT OR IGNORE INTO legacy_unsealed_runs (run_id) VALUES (?)')
      const finished: string[] = []
      const unsealed = sqlite
        .prepare("SELECT id, data FROM records WHERE kind = 'session' AND json_extract(data, '$.sealedTip') IS NULL AND id NOT IN (SELECT run_id FROM submission_baselines)")
        .iterate() as IterableIterator<{ id: string; data: string }>
      for (const run of unsealed) if (aRunSaysItIsFinished(JSON.parse(run.data) as Record<string, unknown>)) finished.push(run.id)
      for (const id of finished) legacy.run(id)
    } finally {
      for (const one of capture) sqlite.exec(one.sql)
    }
    return { ...plan, applied: true }
  })()
}
