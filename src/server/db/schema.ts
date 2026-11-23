// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHERE A NEW TABLE GOES (23 October 2026): in a file of its own under src/server/db/schema-parts/,
 * one file for each line of work or area, named on one line of schema-parts/index.ts. This file
 * re-exports every part at its foot, so every import of schema.ts sees the new table, and so does
 * drizzle-kit, which reads this file. The table is wrapped in `aPartTable` from part-tables.ts, which
 * says beside it whether an archive carries it and what the restore proof does with it: compares it,
 * counts it as a loss a restore may make, with why and the repair, or leaves it out, with why.
 * lib/export.ts and scripts/restore-check.ts read that and need no line for it, and a table that says
 * nothing stops both from loading. It still needs a migration of its own.
 * Existing authored archives keep their registry entries when declarations move, and the existing
 * tables keep their handwritten classifications and reserve their names against schema parts. The
 * records and links declarations live in their own files and are constructed here; derived part
 * tables also join the derived list.
 */
/**
 * The database facade. Its existing tables are declared here or constructed here from their own files.
 *
 * THE CANONICAL LAYER — what a person or an agent wrote. Nothing rebuilds it.
 *
 *   workspaces           -- the project boundaries this installation holds
 *   records              -- every thing Mole Office knows about, of any kind
 *   links                -- typed relationships between any two records
 *   changes              -- what happened, when, and who did it
 *   revisions            -- what each record HELD, kept whole, once per write
 *
 * AUTHORED SETTINGS AND LEDGERS — smaller, still written by somebody, still irreplaceable.
 *
 *   reader_anchors       -- when each reader last looked, and at what
 *   presentation_intent  -- how a structure should be presented: lanes, order, roles. NEVER geometry.
 *   panel_layouts        -- where a reader dragged the panels on a page. Retired: no writer, and no backup or export carries it
 *   session_resources    -- what a session started and whether anybody shut it down
 *
 * THE PLANNING LAYER — also authored, and the only tables here with NO `workspace_id`. A plan is a
 * person-level overlay across workspace-owned work; see `allocations` for the settled argument.
 *
 *   allocations          -- when this person will spend real time on work that already exists
 *   planning_capacity    -- how many hours a period actually holds, when somebody has said
 *   planning_drafts      -- gone: migration 0196 moved every draft into `plans` (see below)
 *   planning_recurrences -- work that comes round again
 *   planning_intents     -- what somebody wrote about time, kept exactly as they wrote it
 *   plans                -- a document somebody writes
 *   plan_lines           -- one line of one of those documents
 *   work_windows         -- the days somebody means to work on a piece of work
 *
 * TALKING TO AN AGENT — authored, and owned by a project. A message and a run carry no
 * `workspace_id` of their own; they belong to the project their thread names. See
 * `WORKSPACE_COLUMN` in authored-table-of.ts for how that is declared.
 *
 *   agent_threads        -- a conversation with an agent about real work
 *   agent_messages       -- one thing said in a thread
 *   agent_runs           -- one bounded attempt to answer a thread
 *
 * THE CODE THIS PROJECT'S WORK IS IMPLEMENTED IN — authored, and owned by a project.
 *
 *   repositories         -- a checkout this project's work is implemented in
 *   implementation_revisions -- a code revision somebody named, kept as the string they supplied
 *   implementation_map   -- somebody said this record is implemented by this code
 *   file_observations    -- what one scan saw about one file at one moment
 *
 * THE REST OF THE AUTHORED LAYER, added in round ten.
 *
 *   revalidations        -- which work a restriction reached, and whether anybody re-checked it
 *   annotation_words_fixed -- a comment whose words went out before Mole Office stored a word for it
 *   measure_words_renamed -- one row once the stored reading-measure words carry their new names
 *
 * THE DERIVED LAYER — rebuilt wholesale by a scan. Delete it and the next scan puts it back.
 *
 *   source_files         -- one row per file on disk, as the last scan found it
 *   source_index         -- one row per repository saying which scan produced those rows
 *   source_file_hashes   -- the content hash per file, which is what makes "changed" exact
 *   implementation_findings -- what a resolver worked out about which code serves which record
 *
 * THE MEASURED LAYER — Mole Office measuring itself. Nobody wrote these rows and no scan can rebuild
 * them, so they are neither authored nor derived. See `MEASURED_TABLES` in table-name-lists.ts.
 *
 *   api_calls            -- one row per request Mole Office answered
 *   outside_reads        -- one row per time an agent got project state from somewhere else
 *   usage_stretches      -- what one stretch of work cost, kept after its rows are pruned
 *   usage_checks         -- what a contradiction check said at the time
 *
 * Everything else in Mole Office is a view over these. The daily page is a filter on `changes`.
 * Backlinks are a query on `links`. The home page is a set of queries on `records`.
 *
 * See src/shared/types.ts for why there is one records table rather than one per kind.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE LAST FIVE ARRIVED LATE, AND WHY NOTHING MAY CREATE A TABLE ANYWHERE ELSE AGAIN
 * ---------------------------------------------------------------------------------------
 *
 * `panel_layouts`, `session_resources`, `source_files`, `source_index` and `source_file_hashes`
 * were built while this file and drizzle/ belonged to a different agent, so each was created by a
 * `CREATE TABLE IF NOT EXISTS` running at import time in the file that owned it — an `ensure*`
 * function in api/layout.ts, lib/resources.ts and lib/sourceindex.ts. That worked, and it cost
 * exactly one thing: those five tables had NO MIGRATION PATH. `CREATE TABLE IF NOT EXISTS` creates
 * a table that is missing and does nothing at all to one that is there, so adding a column to
 * `session_resources` had nowhere to go and every database already holding it would never have
 * got the column.
 *
 * Migration 0003 fixes that. The five declarations moved here and all three `ensure*` functions
 * were DELETED IN THE SAME CHANGE. That last part is not tidiness. Two definitions of one table is
 * this codebase's recurring defect written in SQL, and it is the worst version of it: it fails at
 * runtime on INSERT rather than at compile time, so whichever writer reaches a new database first
 * decides the shape and the other one finds out in production.
 *
 * SO: A NEW TABLE IS DECLARED HERE AND CREATED BY A MIGRATION. NOWHERE ELSE, EVER.
 *
 * Two test files hold that rule up, and they make different claims. tests/schema-tables.test.ts
 * asserts THE LIST: every table, its name written out by hand, each classified as authored or
 * derived. tests/schema-inventory.test.ts asserts THE RULE with nothing written by hand: whatever
 * this file declares is exactly what a real database has. It checks that twice — once against a
 * freshly migrated database, and once against a database the whole server has been imported
 * against, which is the check the original five would have failed. A freshly migrated database
 * never had them, because db/migrate.ts does not import the files whose `ensure*` functions made
 * them. It also excludes SQLite's own tables and the drizzle journal BY NAME rather than by a
 * wildcard, so a table called `sqlite_search_cache` is reported rather than hidden.
 *
 * That is also why every generated migration in drizzle/ has `IF NOT EXISTS` added to its
 * `CREATE TABLE` and `CREATE INDEX` statements BY HAND before it is committed. drizzle-kit emits
 * bare ones, and 0003's tables and indexes already exist in every database those `ensure*`
 * functions ever touched. The one exception is 0000, which is bare and stays bare: its `when`
 * value is recorded in every Mole Office database that exists, so it is never run again in any of them,
 * and editing it would change a file that every existing journal row is a claim about.
 * tests/migration.test.ts checks the rule and encodes that exception.
 */

import { workspaces } from './schema-parts/workspaces.ts'
import { changes } from './schema-parts/changes.ts'
export { workspaces, changes }
import { sessionResources, sourceFiles, sourceIndex, sourceFileHashes, repositories, implementationRevisions, implementationFindings, fileObservations } from './schema-parts/source-and-implementation.ts'
export { sessionResources, sourceFiles, sourceIndex, sourceFileHashes, repositories, implementationRevisions, implementationFindings, fileObservations }
export type { SessionResourceRow, SourceFileRow, SourceIndexRow, SourceFileHashRow } from './schema-parts/source-and-implementation.ts'
import { conversationReads, workClaims, contactGroups, contactPlacements, contactGroupCollapses, onePressRequests } from './schema-parts/delivery-neighbors.ts'
export { conversationReads, workClaims, contactGroups, contactPlacements, contactGroupCollapses, onePressRequests }
import { toolUses, testFileRuns, handovers, readinessChecklists, readinessSignatures, signingPackages, signingPackageItems, folderReadings } from './schema-parts/readiness-and-handovers.ts'
export { toolUses, testFileRuns, handovers, readinessChecklists, readinessSignatures, signingPackages, signingPackageItems, folderReadings }
import { installation, worlds, visits, visitorCredentials, trustedMachines, visitorRequests } from './schema-parts/visitors.ts'
export { installation, worlds, visits, visitorCredentials, trustedMachines, visitorRequests }
import { presentationIntent, panelLayouts, submissionBaselines, legacyUnsealedRuns } from './schema-parts/presentation.ts'
export { presentationIntent, panelLayouts, submissionBaselines, legacyUnsealedRuns }
import { allocations, planningCapacity, planningIntents, plans, planLines, planLineRevisions, counterRows, planningRecurrences, workWindows } from './schema-parts/planning.ts'
export { allocations, planningCapacity, planningIntents, plans, planLines, planLineRevisions, counterRows, planningRecurrences, workWindows }
import { revalidations } from './schema-parts/revalidations.ts'
export { revalidations }
import { apiCalls } from './schema-parts/api-calls.ts'
import { heldKeys } from './schema-parts/held-keys.ts'
import { runTokens } from './schema-parts/run-tokens.ts'
import { headerOnlyCalls } from './schema-parts/header-only-calls.ts'
import { hourlyCalls } from './schema-parts/hourly-calls.ts'
import { outsideReads } from './schema-parts/outside-reads.ts'
import { usageStretches } from './schema-parts/usage-stretches.ts'
import { usageChecks } from './schema-parts/usage-checks.ts'
export { apiCalls, heldKeys, runTokens, headerOnlyCalls, hourlyCalls, outsideReads, usageStretches, usageChecks }
import { agentThreads } from './schema-parts/agent-threads.ts'
export { agentThreads }
import { reviews } from './schema-parts/reviews.ts'
export { reviews, REVIEW_COLUMNS_NAMING_A_CONVERSATION } from './schema-parts/reviews.ts'
import { annotationWordsFixed } from './schema-parts/annotation-words-fixed.ts'
export { annotationWordsFixed }
import { measureWordsRenamed } from './schema-parts/measure-words-renamed.ts'
export { measureWordsRenamed }
import { agentMessages } from './schema-parts/agent-messages.ts'
export { agentMessages }
import { agentRuns } from './schema-parts/agent-runs.ts'
export { agentRuns }
import { assets } from './schema-parts/assets.ts'
export { assets }
import { people } from './schema-parts/people.ts'
export { people }
import { revisions } from './schema-parts/revisions.ts'
export { revisions }
import { groups, groupMembers, deadLetterClaims } from './schema-parts/groups.ts'
export { groups, groupMembers, deadLetterClaims }
import { readerAnchors } from './schema-parts/reader-anchors.ts'
export { readerAnchors }
export type { ReaderAnchorRow, NewReaderAnchorRow } from './schema-parts/reader-anchors.ts'
import { runModels } from './schema-parts/run-models.ts'
export { runModels }
import { casting, castingChanges } from './schema-parts/casting-legacy.ts'
export { casting, castingChanges }
import { agents } from './schema-parts/agents.ts'
import { residentReadGrants } from './schema-parts/resident-read-grants.ts'
import { residentVoidMarks } from './schema-parts/resident-void-marks.ts'
import { residentSpaceWrites } from './schema-parts/resident-space-writes.ts'
import { residentSleeps } from './schema-parts/resident-sleeps.ts'
import { agentRecords } from './schema-parts/agent-records.ts'
import { handleHolds } from './schema-parts/handle-holds.ts'
export { agents, residentReadGrants, residentVoidMarks, residentSpaceWrites, residentSleeps, agentRecords, handleHolds }
import { castingRows } from './schema-parts/casting-rows.ts'
import { castingRowChanges } from './schema-parts/casting-row-changes.ts'
import { castingLabels } from './schema-parts/casting-labels.ts'
import { castingLabelChanges } from './schema-parts/casting-label-changes.ts'
export { castingRows, castingRowChanges, castingLabels, castingLabelChanges }
import {
  index,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core'
import type { ActorType } from '@shared/types.ts'
import { gateCounts } from './schema-parts/gate-counts.ts'
import { gateCountSpoolReads } from './schema-parts/gate-count-spool-reads.ts'
import { officeRestartGrants } from './schema-parts/office-restart-grants.ts'
import { runtimeSettings } from './schema-parts/runtime-settings.ts'
export { gateCounts, gateCountSpoolReads, officeRestartGrants, runtimeSettings }

/**
 * The columns `records` and `links` share. Deciding these now is much cheaper than adding them
 * later.
 *
 * Not every table takes them, and that is on purpose rather than an omission. `changes` is a log
 * with its own `at` and no owner of its own, and `reader_anchors` is keyed by workspace and reader
 * rather than by a generated id — an anchor with an id would be a row you could have two of for
 * one person, which is the one thing it must not be.
 */
const base = {
  id: text('id').primaryKey(),
  /**
   * Which project this belongs to. See `workspaces` below and src/shared/workspaces.ts.
   *
   * THE SQL DEFAULT IS KEPT AND IS NOT THE WAY A NEW ROW GETS ITS WORKSPACE. Every writer passes
   * one explicitly — `createRecordWithReport` from the request's workspace, `createLink` from the
   * two ends it has already checked agree. The default stays because every row of every Mole Office
   * database on disk was written under it, and dropping it would make the column a trap on exactly
   * the databases that predate the boundary.
   */
  workspaceId: text('workspace_id').notNull().default('default'),
  /**
   * Who owns it: the id of the person or agent that wrote it. One user today; a supervisor or
   * collaborator later.
   *
   * NO SQL DEFAULT since the owner migration `the_owner_comes_from_the_installer`. It carried a DEFAULT of the owner's own id, written into
   * every office's schema. Every writer passes the value itself, and a writer that forgets now fails
   * NOT NULL instead of filing the row under one particular person.
   */
  ownerId: text('owner_id').notNull(),
  /**
   * When the row was written, LOCAL wall clock, in the form shared/time.ts writes.
   *
   * NO SQL DEFAULT, for the reason `reader_anchors.last_seen_at` gives at length. Both of these
   * columns defaulted to `datetime('now')` until 2026-08-10, and `datetime('now')` is UTC. Mole Office
   * stores local wall-clock strings everywhere — that is a hard constraint in design/BRIEF.md and
   * the whole reason src/shared/time.ts exists — so the default was a trap: an INSERT that forgot
   * to pass a stamp stored a value wrong by the machine's offset, wrote it behind a success, and
   * left a row that looked completely normal afterwards. This product has already lost two months
   * to one instance of that class of bug.
   *
   * WITHOUT THE DEFAULT, FORGETTING IS A COMPILE ERROR. drizzle makes a column optional in
   * `$inferInsert` when it has a default, so an insert through the query builder that left
   * `createdAt` out used to type-check. It no longer does. That is earlier and louder than the
   * NOT NULL error a raw SQL INSERT now gets, and both are better than a wrong stamp nobody sees.
   *
   * The sentence above deliberately does not spell the query-builder call out. That literal is what
   * tests/guard-human-only.test.ts scans every file in src/ and scripts/ for, over raw text with no
   * comments stripped, so writing it here would report this file as a second way to write a record.
   *
   * See drizzle/0004_drop_the_utc_stamp_defaults.sql for what had to happen to the databases that
   * already carried the default, and why that migration is the one that rewrites rows.
   */
  createdAt: text('created_at').notNull(),
  /** The last write, LOCAL wall clock. No SQL default, for the reason `createdAt` gives above. */
  updatedAt: text('updated_at').notNull(),
}

// The factories take the initialized builders without reading this module at load time.
export type BaseColumns = typeof base

// ---------------------------------------------------------------------------- records

import { makeRecords } from './records-table.ts'
import { makeLinks } from './links-table.ts'
export * from './stored-fields.ts'

export const records = makeRecords(base)

// THE TWO ID HELPERS ARE IN A MODULE OF THEIR OWN. It reads records only inside its two functions, so the cycle is safe.
export * from './a-row-found-by-id.ts'

// ---------------------------------------------------------------------------- links

export const links = makeLinks(base, records)

/**
 * SOMEBODY SAID THIS RECORD IS IMPLEMENTED BY THIS CODE.
 *
 * AUTHORED, and every row here was put there by a person or an agent on purpose. A rebuild never
 * writes to this table; what a resolver works out goes in `implementation_findings` instead.
 *
 * `record_id` IS A DECLARED FOREIGN KEY, like `links.from_id`, so a relationship can only name a
 * record that exists. THERE IS NO COLUMN FOR A SECOND RECORD, and that absence is deliberate: this
 * table structurally cannot express "module implements block", which is the ownership `links`
 * already holds.
 *
 * THE UNIQUE INDEX INCLUDES `provenance`, so a person's statement and an agent's guess about the
 * same pattern are two rows that coexist. They are never merged and neither overwrites the other,
 * because there is no overwrite path in the product at all.
 *
 * `deleted_at` RATHER THAN A HARD DELETE, matching `records`. A relationship somebody wrote and
 * somebody else removed is a thing that happened, and the change log names it.
 */
export const implementationMap = sqliteTable(
  'implementation_map',
  {
    /** anOfficeId() in src/server/lib/ids.ts. */
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id').notNull(),
    recordId: text('record_id')
      .notNull()
      .references(() => records.id),
    repositoryId: text('repository_id')
      .notNull()
      .references(() => repositories.id),
    /** Repository-relative. One matcher, the same one the file index already uses. */
    pattern: text('pattern').notNull(),
    /** `implements`, `tests` or `configures`. */
    relation: text('relation').notNull(),
    /** How this row came to be said: `declared`, `llm`, `observed_write` and the rest of the declared set. */
    provenance: text('provenance').notNull(),
    /** Why, in the words of whoever wrote it. NULL means nobody said. */
    note: text('note'),
    /** "as of this code revision", or NULL because nobody named one. */
    revisionId: text('revision_id').references(() => implementationRevisions.id),
    statedAt: text('stated_at').notNull(),
    statedBy: text('stated_by').notNull(),
    /** When a caller accepted a guess, and who. NULL on both means nobody has. */
    acceptedAt: text('accepted_at'),
    acceptedBy: text('accepted_by'),
    /** Soft delete, the way `records` does it. */
    deletedAt: text('deleted_at'),
  },
  (t) => [
    index('implementation_map_record_idx').on(t.workspaceId, t.recordId),
    index('implementation_map_repo_idx').on(t.workspaceId, t.repositoryId),
    uniqueIndex('implementation_map_one_idx').on(
      t.workspaceId,
      t.recordId,
      t.repositoryId,
      t.pattern,
      t.relation,
      t.provenance,
    ),
  ],
)

export type WorkspaceRow = typeof workspaces.$inferSelect
export type NewWorkspaceRow = typeof workspaces.$inferInsert
export type RecordRow = typeof records.$inferSelect
export type NewRecordRow = typeof records.$inferInsert
export type LinkRow = typeof links.$inferSelect
export type ChangeRow = typeof changes.$inferSelect

/**
 * HOW FAR ONE MESSAGE GOT WITH ONE RECIPIENT. One row per recipient of one message.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS IS A TABLE AND NOT A FIELD ON THE MESSAGE
 * ---------------------------------------------------------------------------------------
 *
 * A delivery mark changes: queued becomes delivered when something serving the recipient reads the
 * message, and delivered becomes seen when the recipient says so. A field of a record cannot change
 * without writing a revision, so ten marks moving on one message would be ten revisions of a
 * message that nobody edited, and the record history would read as ten rewrites of somebody's
 * words. Criterion M1 of design/messages/ACCEPTANCE.md wants the mark, not the rewrite.
 *
 * ---------------------------------------------------------------------------------------
 * THIS IS THE ONLY COPY OF WHO A MESSAGE IS TO
 * ---------------------------------------------------------------------------------------
 *
 * The record carries `to` as well, because that is what an author writes and what GET /api/kinds
 * publishes. The two are written in one transaction by `writeTheDeliveries` in
 * src/server/lib/messages.ts, and tests/one-message-pool.test.ts fails when a message's rows here
 * and its `to` field name different people. That is the third of CLAUDE.md's three ways to fix one
 * fact worked out in two places: make a test fail when they disagree.
 */
export const messageDelivery = sqliteTable(
  'message_delivery',
  {
    /** nanoid, so one row can be cited. */
    id: text('id').primaryKey(),
    /** The `records` row of kind `message` this is about. */
    messageId: text('message_id')
      .notNull()
      .references(() => records.id),
    /** `person` or `agent`. The registry the recipient id is in. */
    recipientKind: text('recipient_kind').notNull(),
    /** The recipient's id in that registry. Never a handle. */
    recipientId: text('recipient_id').notNull(),
    /** `queued`, `delivered` or `seen`. The words are declared in src/shared/messages.ts. */
    mark: text('mark').notNull(),
    /** When this row's mark and sentence were last written, together, as local wall-clock time. */
    at: text('at').notNull(),
    /**
     * WHERE THIS DELIVERY STANDS, in one plain sentence a person reads beside the clock.
     *
     * The mark says how far a message got. This says why it is where it is: the tool is not
     * installed, too many runs are already going, a run took it, somebody stopped the run. NULL is
     * what every row written before migration 0116 has, and it means nobody has written anything.
     */
    because: text('because'),
    /** The session record of the run that took this message, so a reader can open it. NULL if none has. */
    run: text('run'),
    /**
     * WHICH WRITER WORKED THIS RECIPIENT OUT, when nobody named one. Null when the writer did.
     *
     * The value is decided in one place, `inferredByFor` in @shared/messages.ts, and both writers
     * ask it. The backfill in src/server/db/message-delivery-migration.ts reads a line on the board
     * as addressed to the owner and writes `0115_how_far_a_message_got`. The write door in
     * src/server/lib/messages.ts turns the run a writer chose into the agent that run worked as and
     * writes `the message door`. A chosen run wins over `to` there, because the agent id the create
     * door wrote into `to` is the office's reading of the choice and not a name the writer typed. A
     * row whose recipient the writer named outright — `to` with no chosen run, or the group in
     * `toGroup` — carries null. Keeping the answer in one place is what stops the door and the
     * migration disagreeing about one row, which is problem `IhInQ2Mf5BZq`.
     */
    inferredBy: text('inferred_by'),
    /**
     * WHEN THIS RECIPIENT LAST PRESSED "NOT NOW" ON THE LEAD OFFER THIS MESSAGE CARRIES, as local
     * wall-clock time. Migration 0200, by two of the person's decisions.
     *
     * It is not a mark. Not now leaves the message unread, so `mark` does not move and `at` is not
     * written. The offers read leaves the message out until thirty minutes after this moment
     * (`whenAPutOffOfferComesBack` in src/shared/short-lists.ts). NULL means the recipient never
     * pressed Not now on it.
     */
    offerPutOffAt: text('offer_put_off_at'),
    /**
     * WHEN THE MESSAGE COMES BACK TO THIS RECIPIENT, because the person pressed Remind me later on it, as
     * local wall-clock time. Migration 0205, by a decision. The office's timer reads
     * it (src/server/lib/remind-me-later.ts), so the message comes back with no page open and after a
     * restart. NULL means nobody pressed Remind me later on it.
     */
    remindAt: text('remind_at'),
    /**
     * WHO SET `remindAt`: the actor that pressed Remind me later, as the change log names an actor — `human` or `agent`
     * — and the id it wrote as. Migration 0288, wave 13s round 68.
     *
     * NULL IS NOBODY RECORDED, which is every row written before that migration. It is never read as the person, so an
     * older row keeps the words the line that brings the message back has always had. An `agent` here is the secretary
     * that set the time under the person's grant, and the line says so.
     */
    remindSetByKind: text('remind_set_by_kind'),
    remindSetById: text('remind_set_by_id'),
    /** WHEN THE OFFICE BROUGHT IT BACK for the press that wrote `remindAt`. NULL while that time has not come. */
    remindedAt: text('reminded_at'),
    /**
     * THE MESSAGE THAT CARRIES THIS ONE'S WORDS TO THIS RECIPIENT, or NULL because none does. Migration 0324.
     *
     * A sent review gives each agent one message holding its comments, and that message names them in `carries`. A
     * comment that names its own agent also has a row here to that agent. The send archives the row and writes this
     * column with the review's message in the same write (`archiveDeliveries`). So the waiting list and a start press
     * find the message from the comment's own row, by `message_delivery_message_idx`, and read no other message.
     */
    carriedIn: text('carried_in'),
  },
  (t) => [
    index('message_delivery_message_idx').on(t.messageId),
    index('message_delivery_recipient_idx').on(t.recipientKind, t.recipientId),
    // WHEN A ROW WAS LAST WRITTEN, so a page of a conversation finds the marks that moved since it was read
    // (migration 0199, `theRowsChangedSince` in src/server/lib/messages.ts).
    index('message_delivery_at_idx').on(t.at),
    uniqueIndex('message_delivery_one_per_recipient_idx').on(t.messageId, t.recipientKind, t.recipientId),
  ],
)

// THE SETTINGS AND GRANT TABLES ARE DECLARED IN src/server/db/tables/, one file for each. They keep
// the authored registry entries, archive pages and restore proof they had while declared here, so
// they are not schema parts: those take their archive and restore answers from aPartTable.
export * from './tables/index.ts'

export * from './table-name-lists.ts'

export * from './why-no-project.ts'

export * from './migration-declared-tables.ts'

// ============================================================================ the schema parts
//
// Every table declared under schema-parts/, re-exported so that an import of this file and drizzle-kit see it.
// `everyPartTable()` in every-part-table.ts is what each says about itself; part-tables.ts says what is refused.
// Neither that file nor authored-table-of.ts is re-exported here: both need this file's tables made before they load.
export * from './schema-parts/index.ts'
