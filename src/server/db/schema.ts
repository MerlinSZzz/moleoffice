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
 * `WORKSPACE_COLUMN` at the foot of this file for how that is declared.
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
import { getTableColumns, sql } from 'drizzle-orm'
import {
  type SQLiteTable,
  check,
  index,
  integer,
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

    /** Who wrote it: `${actor.type}:${actor.id}`, so "human:owner" or "agent:claude-code". */

/**
 * Where a reader dragged the panels on a page. One row per saved layout.
 *
 * AUTHORED, and the only table here whose contents a person made with a mouse rather than with
 * words. Losing it means the home page comes back rearranged, which is small but is not nothing:
 * it is the one thing in the database that cannot be reconstructed from anything anybody typed.
 *
 * `id` is the page the layout belongs to, chosen by the browser — "home" today.
 *
 * THIS TABLE IS RETIRED AND CAN NO LONGER GAIN A ROW. PUT /api/layout/:id was its only writer and
 * it was deleted with the draggable panel grid on 2026-08-10 — see the header of
 * src/web/components/PanelGrid.tsx. The table is kept because dropping one is a destructive
 * migration and these migrations only ever add, and because a database made before that date may
 * hold a row. NO BACKUP AND NO EXPORT CARRIES IT, by a decision on problem _vHwDWnDLLGd.
 * That decision replaced decision 3 in design/stages-audit/DECISIONS.md. The table is on
 * `LEFT_OUT_OF_BACKUPS_AND_EXPORTS` in table-name-lists.ts. The table itself stays declared and
 * migrated, and nothing deletes a row of it in the office's own database.
 *
 * `layout` is OPAQUE JSON that was owned by the browser. It is declared as plain `text` rather
 * than as a json column because nothing on the server ever looked inside it.
 *
 * WHY IT WAS NOT A RECORD is the same three reasons `reader_anchors` above gives, in the same
 * order. The short form: a layout was written on every drag, and every write through
 * lib/records.ts appends to `changes`, which IS the daily view — so a day of research would have
 * been buried under "layout updated" rows.
 *
 * `updated_by` exists because the house rule is that every write is attributed. It is not in
 * `changes` for the reason just given, but "who moved my panels" must still be answerable, and an
 * agent rearranging a human's home page is worth being able to see.
 */

    /** Who saved it: `${actor.type}:${actor.id}`, so "human:owner" or "agent:claude-code". */

// ---------------------------------------------------------------------------- session resources

/**
 * One row per thing a session started and might have left running.
 *
 * AUTHORED IN PART, AND THAT SPLIT MATTERS TO ANYONE WRITING AN EXPORT. `registered_by`,
 * `released_by` and `release_note` are history: somebody shut a server down, or did not, and said
 * why. `pgid` and `os_started_at` are facts about THIS MACHINE AT THIS MOMENT — a pid is
 * meaningless after a reboot, and restoring one somewhere else would hand a killer a number that
 * now belongs to an innocent process. tests/release.test.ts exists to stop anyone acting on a
 * stale pid, and an export that carried these two columns whole would walk straight past it.
 *
 * `key` is the identity checked later: the pid, the port number, the container name, the absolute
 * path of the lock file. `os_started_at` is the anti-reuse anchor described on `OsProcess` in
 * lib/resources.ts — without it, releasing a resource whose pid has been recycled kills the wrong
 * process.
 *
 * ROWS ARE NEVER DELETED. A released resource keeps its row with who released it and when,
 * because "was that server ever shut down, and by whom" is the question this table exists to
 * answer.
 */
/**
     * Whether Mole Office itself started this process, written when the row is written.
     *
     * The owner's F1 answer of 3 September 2026: the product names what it did not start and never
     * stops it. NULL means nobody recorded this, which is not "no" — but the release door treats it
     * the same way, because the weakest evidence there is is not permission to signal a process.
     */

// ---------------------------------------------------------------------------- the derived layer

/**
 * One row per source file, as the last scan found it.
 *
 * DERIVED. Every row is replaced wholesale on every rebuild, so nothing a person types may live
 * here — the next scan would delete it. shared/types.ts states that rule and lib/sourceindex.ts
 * gives the three reasons this is not the `records` table: a rebuild would eat anything written on
 * a record, one rebuild would bury a fortnight of work in `changes`, and a hundred scanned files
 * next to ten curated modules makes the Records page mostly machine noise.
 *
 * AN EXPORT MUST NOT CARRY THIS TABLE. It is rebuilt by `POST /api/source/reindex`, and a restored
 * copy would describe the files of whichever machine it came from.
 *
 * No index beyond the primary key. Every query reads the whole table — a repository is hundreds of
 * rows, not millions — and an index nothing uses still has to be written on every rebuild.
 */


/**
 * Which scan produced the rows in `source_files`. One row per workspace.
 *
 * DERIVED, and apart from `source_files` so that a rebuild can be atomic: the file rows and the
 * stamp describing them are written in one transaction, and nothing can read a fresh file list
 * under a stale build time.
 */


/**
 * The content hash of each indexed file, and the build it belongs to.
 *
 * DERIVED. It is what makes "changed" exact: an edit that swaps one constant leaves the size, the
 * line count and the import list identical, and a report built by comparing those fields calls
 * that file unchanged.
 *
 * A SIDE TABLE RATHER THAN A COLUMN ON `source_files`, for one reason worth keeping: `SourceFile`
 * in shared/types.ts is the shape the browser draws and the API serves, and a hash is of no use to
 * either. Keeping it beside the row rather than in it means the served shape stays exactly what
 * somebody reading the types expects.
 *
 * `built_at` is carried per row so a hash from an older build can be recognised and ignored rather
 * than trusted. There are real databases on disk where the file rows and the hashes came from
 * different scans.
 */


// ------------------------------------------------------- the code a record is implemented by

/**
 * A CHECKOUT THIS PROJECT'S WORK IS IMPLEMENTED IN, named so a relationship can point at it.
 *
 * AUTHORED. Somebody registered this repository; nothing can work out that it exists.
 *
 * `id` is identity and `name` is presentation, which is the rule `records.title` already follows.
 * Relationship rows reference the id. Nothing resolves a repository by its name except a person
 * typing one, and that lookup refuses when two answer.
 *
 * `name` IS UNIQUE INSIDE A PROJECT, which is different from how `records.title` behaves. A title
 * may repeat because a title is a label on somebody's thought. A repository name is how a person
 * tells two checkouts apart in a path prefix, and two called `firmware` in one project would make
 * every relationship ambiguous on screen.
 *
 * `root` MAY BE NULL AND NULL IS A REAL ANSWER: this repository is named, and there is no checkout
 * of it on this machine. It can hold relationships, be read and be drawn; it cannot be scanned, and
 * every read that would have needed a scan says so in those words rather than answering empty. A
 * `root` that is set and is not a directory stops a rebuild with a refusal naming the value — it is
 * never treated as NULL, because falling back would index the wrong tree and report every
 * relationship in the right one as stale.
 */
/** LOCAL wall clock, per the practical rule in CLAUDE.md. */

/**
 * A CODE REVISION SOMEBODY NAMED, kept as the opaque string they supplied.
 *
 * AUTHORED. A caller supplies a string; Mole Office stores it against a repository and resolves nothing.
 *
 * THERE IS NO COLUMN SAYING WHETHER THIS IS A COMMIT, A TAG OR A BRANCH. Those are Git's words,
 * Mole Office cannot check any of them, and a column holding an unverifiable classification is the fifth
 * engineering rule broken with extra steps. A caller who wants to say what it is writes it in `note`.
 *
 * NOTHING HERE IS A ROW IN `revisions`. That table is the Mole Office record version ledger. A code
 * revision is a reference a read resolves by joining, never a row copied in.
 */


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

/**
 * WHAT A RESOLVER WORKED OUT ABOUT WHICH CODE SERVES WHICH RECORD.
 *
 * DERIVED. Every row was produced by a resolver and will be deleted by the next rebuild of its
 * repository, so nothing a person types may live here. An export must not carry it.
 *
 * `record_id` IS NOT A DECLARED FOREIGN KEY, and `source_file_hashes` is the precedent. A rebuild
 * writes hundreds of rows in one transaction; a foreign key on each would make a rebuild's cost
 * depend on the record table, and a finding about a record somebody deleted between the scan and
 * the write should be dropped by the next rebuild rather than fail the whole transaction.
 *
 * `path` IS AN EXACT FILE, NEVER A PATTERN. A resolver knows which file it read. Only a person
 * writes a pattern, because only a person is making a statement about code that does not exist yet.
 *
 * THE EVIDENCE IS TWO FACTS AND IS STORED AS TWO FACTS. `evidence_path` is the file the resolver
 * read; `evidence_detail` is what it read there. The sentence a developer sees — "HomePage.tsx
 * imports ./RecordPage.tsx" — is composed at read. One column holding that sentence would leave
 * nothing able to group findings by importing file or to answer which specifier produced one.
 *
 * NO INDEX ON `evidence_path` YET. The forward read that needs one — from a file back to the
 * records it serves — arrives with the resolver that uses it, and an index nothing reads still has
 * to be written on every rebuild.
 */


/**
 * WHAT ONE SCAN SAW ABOUT ONE FILE AT ONE MOMENT.
 *
 * AUTHORED, and that is not obvious, so here is the argument. `source_files` describes the present
 * and any scan rebuilds it. A row here is a DATED OBSERVATION and nothing can rebuild it: the
 * comparison a rebuild makes against the scan it is replacing exists for one reply and is then
 * unrecoverable. A work domain accepted on Tuesday cannot otherwise ask on Friday what changed,
 * because four scans have run in between and each threw its predecessor away.
 *
 * IT STORES NO FILE CONTENT, NO DIFF, NO AUTHOR, NO PARENT, NO BRANCH AND NO MESSAGE. You cannot
 * reconstruct one line of any file from it, you cannot ask who changed something, and you cannot ask
 * what it looked like before. The owner's boundary is that Git owns implementation history, and the
 * first thing on the owner's list of failures is building a second Git. Ten columns, and an eleventh that
 * answered any of those questions would break the boundary this table is allowed to exist inside.
 *
 * `repository_id` IS AN ID AND NOT A ROOT PATH. A root moves; a checkout that moved would split one
 * repository's observation history in two with nothing failing. NULL has one stated meaning: this
 * row was written before repositories had ids, by the one process that scans one root.
 *
 * `first_scan` MARKS THE WAVE THAT IS NOT A WAVE. A workspace whose index is empty — after a
 * restore, or on its first rebuild — sees the whole repository as `added`. That is true and it is
 * not a fortnight of work, so the row says which it was and a drift read answers "cannot say"
 * rather than "everything changed".
 *
 * NOTHING PRUNES IT, deliberately. A rule that deletes observations deletes the evidence a drift
 * read depends on.
 */


export type WorkspaceRow = typeof workspaces.$inferSelect
export type NewWorkspaceRow = typeof workspaces.$inferInsert
export type RecordRow = typeof records.$inferSelect
export type NewRecordRow = typeof records.$inferInsert
export type LinkRow = typeof links.$inferSelect
export type ChangeRow = typeof changes.$inferSelect

/**
 * WHEN THIS PERSON WILL SPEND REAL TIME ON WORK THAT ALREADY EXISTS.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS TABLE HAS NO `workspace_id`, AND IT IS THE ONLY ONE
 * ---------------------------------------------------------------------------------------
 *
 * Every other authored table in this database carries a workspace, because every fact Mole Office stores
 * belongs to exactly one project. A planning period does not, and that is a settled owner decision
 * rather than an omission: **a plan is a person-level time-allocation overlay across
 * workspace-owned canonical work.** The two answer different questions — a workspace answers which
 * project owns the work, planning answers when this person will allocate real time to it — so one
 * week may hold Mole Office work, greenhouse work and a dentist appointment at once.
 *
 * That is NOT a cross-workspace link and must never be read as one:
 *
 *   - `record_id` names a record that stays in its own project. Nothing here moves it, copies it,
 *     or gives it a second home.
 *   - **An allocation carries no authority.** It is an id and a number of hours. Reading the record
 *     it names goes through `workspaceOf` like every other read, so an allocation can name a
 *     greenhouse task without being a way to read greenhouse.
 *   - There is no `links` row involved, so the boundary rules that refuse cross-project links are
 *     untouched and keep meaning exactly what they meant.
 *
 * `explore.md` — *Why a planning period is person-level and not workspace-owned* — has the whole of
 * it, including what happens when Mole Office is ever multi-user: who may SEE an allocation becomes a
 * real question, and project ownership is not part of it.
 *
 * ---------------------------------------------------------------------------------------
 * WHICH HALF OF CRITERION P8 IS TRUE TODAY, AND WHICH HALF CANNOT BE BUILT YET
 * ---------------------------------------------------------------------------------------
 *
 * Criterion P8 of `design/planning/ACCEPTANCE.md` is half true today and the rest cannot be built
 * yet. TRUE TODAY: no planning table carries a `workspace_id` — not `allocations`,
 * `planning_capacity`, `planning_intents`, `plans`, `plan_lines`, `planning_recurrences` or
 * `work_windows` — so plans and the schedule live outside every workspace, and
 * `tests/an-allocation-reads-back-from-a-second-workspace.test.ts` proves it by reading an
 * allocation back from a second workspace. A test deleted on 13 November 2026 failed if any of the seven gained a
 * column that names a workspace.
 *
 * NOT BUILT, AND NOT BUILDABLE YET. "The schedule per person" is true only because there is one
 * person: no planning table has a person or owner column, each carries a free-text `created_by` of
 * the form `<type>:<id>`, and the multi-user question above is open. Sync between worlds does not
 * exist, so a plan line can name a record in another workspace of this world and cannot name one in
 * another world — a record id is a bare local id, and P8 needs a world-qualified one, and a person
 * on these tables once there is more than one person. P8 keeps the line that is already true; it is
 * not the wave that adds any of those.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS NOT IN THIS TABLE
 * ---------------------------------------------------------------------------------------
 *
 * No title, no summary, no state of the work, no kind, no workspace. **Planning is allocation, not
 * duplication**: every one of those is on the record `record_id` names, and a copy here would be a
 * second place that has to agree with it. What a reader sees is assembled per request.
 *
 * AUTHORED. Somebody committed these hours; nothing rebuilds them from anything.
 */

/*
 * ROUGH PLANNING TEXT, BEFORE IT IS ANYTHING — THE TABLE `planning_drafts`, WHICH IS NO LONGER DECLARED HERE.
 *
 * ---------------------------------------------------------------------------------------
 * WHERE IT WENT
 * ---------------------------------------------------------------------------------------
 *
 * Migration 0196 moved every stored draft into `plans` and `plan_lines`, at item 6 of a
 * decision. That decision carried out report p414QK6jYovv (problem
 * k5FNfdgfxbt2: rough thinking was kept in two stores). The data step is
 * src/server/db/drafts-into-plans-migration.ts. It drops the
 * table once it is empty. A draft it refused, because its title or a line does not meet a plan's
 * limits, stays in the table as it was, and the table stays with it; nothing in the product reads
 * or writes it any more, so it is not declared here. That file says how such a row is reported and
 * what a person does next.
 *
 * The reasons the table was written with are kept below, because they are why `plans` has no
 * workspace and is not a record kind either.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT IS A TABLE AND NOT A RECORD KIND
 * ---------------------------------------------------------------------------------------
 *
 * The aim is to let a person think messily first — to write
 *
 *     Trial report
 *     target: September
 *     Must
 *     - baseline
 *     - experiment design
 *     Maybe
 *     - leaf area
 *
 * and have it kept, without a schema form in the way and without any of it becoming project truth.
 *
 * A new RECORD KIND would have been the obvious place and is exactly wrong twice over. It is a
 * governance decision the owner has not been asked (a new kind changes what future data means), and
 * it would put rough thinking into the canonical graph — linkable, rankable, exportable as project
 * truth — which is the thing this surface must not do. Saving text here mutates nothing: the draft
 * becomes structure only through a proposal the human approves.
 *
 * NO `workspace_id`, like the rest of the planning layer and for the settled reason: a week's
 * thinking spans projects — "trial report" is greenhouse work and Mole Office work and a deadline — and
 * a draft forced into one project would be false about what it is. It names no record, so it grants
 * nothing.
 *
 * THE TEXT IS STORED EXACTLY AS TYPED. No re-wrapping, no normalising, no parsing on the way in.
 * What a person wrote is what comes back, and the browser owns ordinary wrapping.
 */

/**
 * WHAT A PERSON WROTE ABOUT TIME, KEPT EXACTLY AS THEY WROTE IT.
 *
 * ---------------------------------------------------------------------------------------
 * THE EIGHTH RULE, AS A TABLE
 * ---------------------------------------------------------------------------------------
 *
 * The owner set it on 16 August 2026: *humans express intent; agents and parsers translate it;
 * Mole Office validates and commits it.* A person may write `around 5h`, `Tuesday afternoon` or
 * `sometime next week`, and Mole Office must keep what they wrote instead of refusing it for not being
 * canonical. So `said` holds their words, byte for byte, and the columns beside it hold what was
 * made of those words WHEN SOMETHING COULD BE MADE HONESTLY.
 *
 * `state` says which of the three layers this row has reached:
 *
 *     kept        the words are stored and nothing was interpreted. "sometime next week".
 *     offered     an interpretation was made and waits for a person to accept it.
 *     committed   it became an allocation, which is the canonical row.
 *
 * ---------------------------------------------------------------------------------------
 * NOTHING BUT `committed` EVER ENTERS ARITHMETIC
 * ---------------------------------------------------------------------------------------
 *
 * A `kept` intent never adds to a week, never makes capacity look used and never counts as work
 * planned. It is a thing somebody wrote down. The arithmetic in shared/planning.ts reads
 * `allocations` and reads nothing here, and `tests/planning-intent.test.ts` fails if that ever
 * changes. A surface that added an interpretation into a total would be claiming the interpretation
 * had happened.
 *
 * `committed` DOES NOT MEAN THE HOURS ARE HERE. They are in `allocations`, and this row keeps the
 * words that produced them. The allocation is found by `record_id` with `horizon` and `period`,
 * which is one allocation by the rule in lib/planning.ts; storing its id here as well would be the
 * same fact in two places.
 *
 * ---------------------------------------------------------------------------------------
 * WHY `plan_line_id` IS NULLABLE AND WHY IT MATTERS
 * ---------------------------------------------------------------------------------------
 *
 * A person writes time on a plan line before that line is filed as work. So an intent may belong to
 * a line and to no record at all. `record_id` is nullable for the same reason, and an intent with
 * neither is a note about time with nothing to attach it to, which is allowed: the words are the
 * point.
 *
 * IN `AUTHORED_TABLES`, SO A BACKUP CARRIES THESE ROWS. It was left out when the table was built,
 * which meant a backup, a project archive and a restore held no intent at all and the restore still
 * reported success. Closing that took `REGION_COLUMNS` and a page in src/server/lib/export.ts, the
 * snapshot and its comparison in scripts/restore-check.ts, and the hand-written inventories in
 * tests/schema-tables.test.ts, tests/migration.test.ts and tests/stamp-columns.test.ts. Every one of
 * those is a guard that failed until the table was registered, which is what they are for.
 *
 * Person-level, like the rest of the planning layer: no `workspace_id`, because a week's intentions
 * span projects.
 */

/**
 * A PLAN: A DOCUMENT SOMEBODY WRITES, HOLDING LINES THEY WROTE.
 *
 * This is `planning_drafts` grown up. A plan's text is one row per line in `plan_lines`, so a line
 * can carry the id of the record it was filed as. A draft's single `body` column could not: the link
 * would have had to be typed inside the text, where deleting one character breaks it silently.
 *
 * THE DRAFTS HAVE BEEN MOVED IN. Migration 0010 deliberately left them where they were, and the head
 * of drizzle/0010_plans.sql says why the move and the removal of the drafts routes belong in one
 * change. Migration 0196 is that change (problem k5FNfdgfxbt2): each draft became one open plan, and
 * `moved_from_draft` below says which draft a plan was.
 *
 * ---------------------------------------------------------------------------------------
 * PLANNING IS WRITING. SCHEDULING IS GIVING HOURS. THEY ARE NOT THE SAME ACT
 * ---------------------------------------------------------------------------------------
 *
 * Nothing in a plan is project truth. Nothing in it is parsed for meaning. Nothing in it becomes a
 * record because Mole Office read it. A line crosses into the canonical graph only when a person presses
 * "File as work", which creates the record and binds the line to it in one transaction. A line gets
 * hours only when a person presses "Give it time", which writes one ordinary allocation.
 *
 * NO `workspace_id`, and this is not an omission. A plan spans projects — one week of thinking is
 * greenhouse work and Mole Office work and a deadline — and every record belongs to exactly one project,
 * so a plan cannot be a record and cannot be forced into one project either. That is the same
 * settled reason `allocations` gives above, and the reason `planning_drafts` gives below it.
 *
 * A PLAN CAN END. `state` is `open`, `done` or `dropped`, so a finished plan leaves the list instead
 * of sitting there going stale. Nothing computes it; a person sets it.
 *
 * AUTHORED. Somebody wrote these words and they exist nowhere else.
 */

    /**
     * THE ROUGH DRAFT THIS PLAN WAS, or NULL because it was written as a plan.
     *
     * Written once, by migration 0196, when it moved each `planning_drafts` row into a plan (problem
     * k5FNfdgfxbt2). It is two facts in one column, and both are about where the plan came from:
     *
     *   - WHERE IT CAME FROM. The plan's lines were not typed on a plan; they are the draft's body,
     *     split on the newline, and their `updated_by` is the move's own stamp rather than a person's.
     *   - THE MAPPING FROM AN OLD DRAFT ID. The move keeps the draft's id as the plan's id when no plan
     *     already holds it. When one does, the plan gets a new id and this column is the only place
     *     that says so. A proposal filed about a draft names it in `Delta.fromDraft`, and
     *     `planOfDraft` in src/server/lib/planreview.ts reads this column to find the plan it became.
     *     A reader never assumes the draft id is the plan id: a colliding id names a different plan.
     *
     * Set on every moved plan, not only on the ones whose id changed, so one reader answers both cases
     * and "this plan was never a draft" is a NULL rather than an absence of a row somewhere else.
     */

// ---------------------------------------------------------------------------- talking to an agent

// ------------------------------------------------------------------- what Mole Office measured of itself

// ---------------------------------------------------------------- who takes part: people and agents

/**
 * THE DURABLE AGENTS OF THIS INSTALLATION, one row per agent, whatever project it works in.
 *
 * The same shape as `people` plus three columns of its own, because an agent is served by a runtime
 * and can be taken out of use. Criterion M2 names the three runtime words.
 *
 * `runtime` IS DEAD AND LEFT IN PLACE. It used to hold one of the declared runtime words, written
 * at registration and never changed afterwards, while the agent record's `data.runtime` was the
 * door a PATCH could change — two stores for one fact, and on 14 September 2026 they answered two
 * runtimes for one agent. A decision makes the record the one store.
 * `runtimeOfTheAgentRecord` in lib/participants.ts reads it there and nothing writes or reads this
 * column. It is not dropped because the codebase
 * has no `DROP COLUMN` migration and because a row written before the change still carrying a word
 * is what the test about a stale copy uses; leaving it dead and named here is cheaper than
 * rewriting the table, and a reader is told rather than left to guess. `declaredRuntimeOrNull` in
 * shared/participants.ts is still the one place that decides which words are real.
 * The list of runtime words was declared and documented as checked, and it was checked nowhere.
 *
 * `retired` IS THE SAME FACT THE `agent` RECORD'S `state` FIELD HOLDS, and that is on purpose while
 * both exist: the record kind's own words say retired takes an agent off the picker for new messages
 * and changes nothing else. Part 2b moves the messages; until then the registry row is the copy that
 * the chat reads and the record is the copy the existing inbox reads. `agent_records` is what joins
 * them, so the two can be compared rather than drifting unseen.
 */
export const agents = sqliteTable(
  'agents',
  {
    /** For a row the migration made, the handle it was made from. New rows get a nanoid. */
    id: text('id').primaryKey(),
    /** The name a reader sees. A person may change any agent's; an agent may not change its own. */
    name: text('name').notNull(),
    /** The short address: lowercase letters, digits and dashes, 2 to 40 characters, unique. */
    handle: text('handle').notNull(),
    /**
     * The `assets` row holding the picture. Never NULL: a participant is created with its generated
     * default already written down, and resetting to the default points back at that same row.
     */
    avatarAssetId: text('avatar_asset_id')
      .notNull()
      .references(() => assets.id),
    /** Chosen pixel costume. Null means the stable generated default is still in use. */
    pixelAppearance: text('pixel_appearance'),
    pixelScale: text('pixel_scale'),
    /**
     * Short free text about what this agent is doing, at most 60 characters. NULL means nobody has
     * set one. Since criterion M21 it is set by the agent itself or by a person; who did is below.
     */
    state: text('state'),
    /** When the state was set, local wall clock. NULL exactly when `state` is NULL. */
    stateAt: text('state_at'),
    /**
     * WHO SET THE LINE: the person keeps the right to set it.
     *
     * NULL means nobody recorded who set it, which is what every row written before this held and
     * is not the same as "the agent set it". A screen says nothing where this is NULL rather than
     * naming a setter nobody wrote down.
     */
    stateByKind: text('state_by_kind'),
    stateById: text('state_by_id'),
    /**
     * DEAD. Left in place after a decision made the agent record's `data.runtime` the one
     * store. Nothing writes it and nothing reads it. See the table's
     * own comment above.
     */
    runtime: text('runtime'),
    /**
     * WHO STARTED THIS AGENT. The same pair the `worlds` table already carries for a world.
     *
     * The rule: whoever started an agent
     * manages it and answers for it. Before this, nothing recorded who started whom, so the refusal
     * an unregistered writer gets could not name the agent it should report to, and the `the parent`
     * answer the `proposal` kind has carried since August could never be used.
     *
     * NULL MEANS NOBODY RECORDED ONE. It is the honest value for an agent a person registered by
     * hand and for every row written before this column existed. It is NOT read as "the person
     * started it": that would make unregistered writers into the person's own children on the
     * strength of a missing value.
     *
     * IT IS NOT `created_by_kind` / `created_by_id` below. Those say who wrote this ROW, which may
     * be a migration or a person tidying up. This says who started the AGENT, which is a fact about
     * the work rather than about the record.
     */
    startedByKind: text('started_by_kind'),
    startedById: text('started_by_id'),
    /** The responsible agent, separate from the recorded starter. */
    ownerId: text('owner_id'),
  ownerKind: text('owner_kind'),
    /**
     * WHAT THIS AGENT MAY DO: one word from `design/permissions/roles.json`, or NULL.
     *
     * The words are not listed here and there is no CHECK constraint, for the reason `runtime` gives
     * above and `presentation_intent.intent` gives at length: the declaration the write gate reads
     * is the only place the words live, and a second list in SQL is a second list that can drift.
     * The declaration is a file rather than TypeScript so that a person can add a role without a
     * code change: a template is given for a person to make their own from.
     *
     * NULL MEANS NOBODY SET ONE, which is what every row registered before 6 September 2026 holds.
     * `A_ROW_WITH_NO_ROLE_READS_AS` in shared/roles.ts is the one place saying such a row is read as
     * a worker, and a screen says "no role set" rather than drawing a word nobody chose.
     *
     * A REGISTRATION NO LONGER LEAVES IT NULL. Criterion P75: the worker card is the default.
     * From 8 September 2026 a registration that names no card writes the
     * worker card here, and `card_chosen_by` below says the rule wrote it. The NULLs that remain are
     * rows registered before that, and they are left exactly as they are.
     */
    role: text('role'),
    /**
     * WHO CHOSE THE CARD ON THIS ROW, as JSON, or NULL. Criterion P75.
     *
     * `{"how":"the-rule","who":null}` — nobody named a card, so the rule wrote the worker card.
     * `{"how":"a-starter","who":{…}}` — whoever registered this agent named the card.
     * `{"how":"a-credential","who":{…}}` — the agent asked for it in its credential and the owner
     * gave it when they confirmed. `WhoChoseTheCard` in shared/roles.ts is the shape, and it is the
     * only place those three words live.
     *
     * NULL MEANS NOBODY RECORDED IT, which is every row written before 8 September 2026, and it is
     * NOT read as "the rule chose it": the word on such a row may have been a starter's choice or
     * may be the word the row was read as, and there is no way to tell now. A screen says nobody
     * recorded it. Backfilling would be inventing the answer.
     *
     * IT FOLLOWS THE RECORD, exactly as `role` above does: the agent record's `cardChosenBy` is
     * written by the registration and `keepTheAgentRegistryInStep` copies it here, so the change is
     * on the record's own history rather than only in a column.
     */
    cardChosenBy: text('card_chosen_by', { mode: 'json' }).$type<{
      how: string
      who: { kind: 'person' | 'agent'; id: string } | null
    }>(),
    /**
     * THE PERSON'S SAY THAT THIS AGENT MAY ACT FOR THEM, as JSON, or NULL. Criterion P59, the owner's 代管.
     *
     * ---------------------------------------------------------------------------------------
     * WHAT IT HOLDS AND WHY IT IS ONE COLUMN
     * ---------------------------------------------------------------------------------------
     *
     * EVERY GRANT THE PERSON HAS MADE THIS AGENT, oldest first, as a JSON list. Each is the grant's id,
     * which of the ends it has, what it ends at, when they granted it and when it ended. One column
     * rather than a table of its own, the way `work_area` is one column of paths: it is read whole
     * every time and never queried by a part of itself.
     *
     * THE LAST ENTRY IS THE ONE THAT COUNTS. The ones before it are grants the person made and ended, and
     * they stay because when a grant ended, and which of its ends did it, is a fact about the writes
     * made while it held. NULL is the ordinary case and means the person never said.
     *
     * IT FOLLOWS THE RECORD, exactly as `role` above does. The press writes `data.elevation` on the
     * secretary's `agent` record and `keepTheAgentRegistryInStep` copies it here, so the grant gets
     * a change row and a revision saying the person made it, and this column is what a refusal reads
     * on a request. The registry row is the installation's and an `agent` record is one project's,
     * which is the other half of why the refusal reads this and not the record.
     */
    elevation: text('elevation'),
    /**
     * WHERE THIS AGENT WORKS: the folders and files it is there to change, as a JSON array of paths.
     *
     * Criterion P43: the working area, its folders and files, is registered when an agent is registered
     * and started, which makes the changes easy to find. It is written when a
     * starter registers the agent, so that whoever checks the work afterwards can find the changes
     * rather than work them out from every write the agent made.
     *
     * IT IS RECORDED AND NOT ENFORCED. Nothing refuses a write outside the area, and nothing refuses
     * a registration that names no area. What a caller writing outside its area should be told is a
     * question nobody has answered, and a refusal invented here would be answering it.
     *
     * NULL MEANS NOBODY RECORDED ONE. An empty list means somebody said there is no area, which is a
     * different fact, and both are kept.
     */
    workArea: text('work_area', { mode: 'json' }).$type<string[]>(),
    /**
     * WHAT THIS AGENT WAS STARTED FOR: the id of the record whose end ends this role, or NULL.
     *
     * Criterion P15. Every card's "What ends it" line names the thing whose end ends the role, and
     * for a worker that thing is the piece of work it was started for. When
     * the claim on that record is released, the agent is retired with the reason.
     *
     * NULL MEANS NOBODY SAID, and such an agent is never retired by that rule. An agent started for
     * nothing in particular has no end to come, and inventing one would retire an agent because a
     * field was empty.
     *
     * IT IS NOT `work_area` above. That says WHERE this agent changes things, so its work can be
     * found afterwards; this says WHAT it was started for, so the end of that thing can end the role.
     */
    startedFor: text('started_for'),
    /**
     * THE RUN THAT REGISTERED THIS AGENT, or NULL because nobody recorded one. Criterion P11.
     *
     * The session record of the run that called POST /api/agents/started. It is what lets the first
     * run of this agent say which run started it — the `session` kind has had `parentAttachment`
     * since August and nothing ever wrote one, because nothing knew the answer. Measured on
     * 6 September 2026: 0 of 904 runs carried a parent.
     *
     * ONLY THE FIRST RUN IS FILLED IN FROM IT. An agent has many runs over its life and only the
     * first was started by the run that registered it. Filling the rest in would be a guess in a
     * fact's clothes.
     */
    startedByRun: text('started_by_run'),
    /** 1 when this agent is no longer given new work. 0 otherwise. */
    retired: integer('retired').notNull().default(0),
    /** One plain sentence saying why, when `retired` is 1. NULL otherwise, and nothing infers one. */
    retiredBecause: text('retired_because'),
    /**
     * WHEN THE ROW WAS RETIRED, AND BY WHOM. Criterion zyCcJYCLsAe7.
     *
     * `retired` and `retired_because` were here from drizzle/0114 and said THAT a row was retired and
     * WHY. Nothing said when, and nothing said who — because until the retire door existed the only
     * writer was the release of a claim, and an office releasing its own claim is not a person a
     * reader would want named. A press is, and so is a starter retiring one of its own.
     *
     * NULL EXACTLY TOGETHER WITH `retired` BEING FALSE, and null on a row retired before this
     * existed: those were written by a claim release and nobody recorded the moment.
     */
    retiredAt: text('retired_at'),
    retiredByKind: text('retired_by_kind'),
    retiredById: text('retired_by_id'),
    /** LOCAL wall clock. No SQL default, for the reason `reader_anchors` gives. */
    createdAt: text('created_at').notNull(),
    /** The participant who created this row, or NULL because nobody recorded one. */
    createdByKind: text('created_by_kind'),
    createdById: text('created_by_id'),
    /** The world this agent is a citizen of. See CITIZENSHIP in `schema-parts/visitors.ts`. */
    homeWorld: text('home_world'),
    /** The installation that world belongs to. See CITIZENSHIP in `schema-parts/visitors.ts`. */
    homeInstallation: text('home_installation'),
    /** When it became a citizen of it. See CITIZENSHIP in `schema-parts/visitors.ts`. */
    citizenSince: text('citizen_since'),
    /**
     * WHICH VISITOR CREDENTIAL THIS AGENT WAS REGISTERED ON, or NULL because it needed none.
     *
     * Criterion P69, on what the owner found on 7 September 2026: a worker on the owner's other machine registered
     * itself as a worker from another machine with no confirmation from the owner at all. Registration
     * from anywhere but this machine is now refused without a credential the person has confirmed, and this
     * is what the row says afterwards.
     *
     * NULL IS THE ORDINARY ANSWER AND MEANS THIS MACHINE. Every row written before the column
     * existed is null, and so is every registration made here; one made from elsewhere cannot be
     * written without a credential. So null says "no credential was needed", never "nobody looked".
     *
     * IT IS THE CREDENTIAL'S ID AND NOT ITS TOKEN. A token is a secret shown once, at issue; an id
     * is what the Embassy lists and what a refusal names.
     */
    credential: text('credential'),
    /**
     * HOW THIS AGENT WISHES TO BE ADDRESSED, migration 0181. The
     * same four parts a person has, declared once in src/shared/address-as.ts. The agent writes its
     * own, with its own key, and nobody else writes them.
     *
     * NULL MEANS NOBODY HAS SET THAT PART, and a reader never fills one in.
     */
    addressName: text('address_name'),
    addressSecondPerson: text('address_second_person'),
    addressThirdPerson: text('address_third_person'),
    addressTitle: text('address_title'),
    // WHO LAST SET HOW THEY WISH TO BE ADDRESSED, AND WHEN, migration 0182. NULL when
    // nobody recorded it: before 0182, or never set.
    addressSetByKind: text('address_set_by_kind'),
    addressSetById: text('address_set_by_id'),
    addressSetAt: text('address_set_at'),
    /**
     * A PERMANENT RESIDENT, migration a_permanent_resident_has_a_space_of_its_own, by a
     * decision. The secretary proposes, the owner confirms with one press, and
     * src/server/lib/residents.ts writes these five in the same act that makes the agent's personal space.
     * NULL `resident_since` means this agent is not a resident; the other four are NULL exactly when
     * it is.
     */
    residentSince: text('resident_since'),
    /** The `proposal` record the secretary filed. */
    residentProposal: text('resident_proposal'),
    /** The `decision` record the person's press wrote, which settles that proposal. */
    residentDecision: text('resident_decision'),
    /** Who pressed Confirm: always a person. */
    residentConfirmedByKind: text('resident_confirmed_by_kind'),
    residentConfirmedById: text('resident_confirmed_by_id'),
    /**
     * THE SUCCESSOR THE OWNER NAMED FOR THIS RESIDENT ONCE IT WAS RETIRED, by registry id, or NULL because they
     * has named none. Taking the retired agent's handle does not make an agent its successor; only this column
     * does. The successor may read the space.
     */
    successorId: text('successor_id'),
    successorNamedAt: text('successor_named_at'),
    successorNamedByKind: text('successor_named_by_kind'),
    successorNamedById: text('successor_named_by_id'),
    /**
     * THE PICTURE-AND-NAME REMINDER AFTER A RESIDENT IS CONFIRMED, migration 0233: when the
     * confirmation filed it, and when a press settled it and who pressed, the person or the resident with its own key.
     * The reminder waits while `residentNamingAskedAt` is set and `residentNamedAt` is NULL. A resident confirmed
     * before 0233 has no reminder filed. src/server/lib/residents.ts is the one writer.
     */
    residentNamingAskedAt: text('resident_naming_asked_at'),
    residentNamedAt: text('resident_named_at'),
    residentNamedByKind: text('resident_named_by_kind'),
    residentNamedById: text('resident_named_by_id'),
    /**
     * A SECRETARY'S OWN SLEEP TIME, migration 0330, which each secretary sets for itself: the time
     * of day its sleep begins, as HH:MM on the office's clock, how many minutes it lasts, when it was last set, and
     * whether the agent itself or the person set it ('agent' or 'person'; the agent is this row, and the person is the
     * one owner). NULL is none: the office begins no sleep by itself. src/server/lib/resident-sleep.ts is the one
     * writer and the one reader.
     */
    sleepTimeStarts: text('sleep_time_starts'),
    sleepTimeMinutes: integer('sleep_time_minutes'),
    sleepTimeSetAt: text('sleep_time_set_at'),
    sleepTimeSetBy: text('sleep_time_set_by'),
    /**
     * WHETHER THIS AGENT READS A RELEASE FROM THE CHECK'S OWN RESULT, migration 0203 (answer HeBxwj6QRGjS):
     * one JSON object `{on, by, at, because}`, written whole by `setReadsReleasesFromTheCheck` in lib/participants.ts.
     * When `on` is true a release written to this agent does not wake it; a refusal always does. NULL means nobody
     * has said, and a release wakes it.
     */
    readsReleasesFromTheCheck: text('reads_releases_from_the_check'),
    /**
     * 1 WHEN THIS AGENT WAS REGISTERED WITH NO KEY OF ITS OWN, migration 0273. A starter asks for that with
     * `noKey: true` at POST /api/agents/started, and the mark is written in the same transaction as the row. A write
     * in the agent's name is then taken only with a run key or the office's key (lib/run-keys-only.ts). 0 on every
     * row written before the column existed, and on every other registration.
     */
    runKeysOnly: integer('run_keys_only').notNull().default(0),
  },
  // A HANDLE IS UNIQUE AMONG LIVE AGENTS ONLY, criterion I3, migration 0174.
  // A retired agent keeps its row and its handle, and a new agent may take that handle with an id of
  // its own. The plain index is kept for lookups by handle.
  (t) => [
    index('agents_handle_idx').on(t.handle),
    uniqueIndex('agents_live_handle_idx').on(t.handle).where(sql`retired = 0`),
  ],
)

/**
 * WHICH REGISTRY AGENT A PROJECT RECORD IS. One row per record of kind `agent`.
 *
 * THE RECORDS ARE KEPT AND LINKED, NEVER DELETED (M2). A record of kind `agent` carries an inbox, a
 * conversation and a work domain that all point at its id, so removing it would strand them. This
 * table is the join, and it is a table rather than a column on `records` because a migration here
 * may not rewrite a stored value — the rule tests/migration.test.ts holds every file in `drizzle/`
 * to — and an added column would have to be filled by rewriting one.
 *
 * MAPPED BY HANDLE, WHICH IS WHAT M2 ASKS FOR AND HAS ONE CONSEQUENCE WORTH KNOWING. A handle is
 * unique within a project, not across the installation. Two projects each holding an agent with the
 * handle `builder` therefore map to ONE registry row, and both records point at it. That is the
 * reading M2 states; if it turns out to be wrong, the fix is a second column here saying which
 * project's record this is, not a silent split.
 */
/**
 * LEAVE TO READ A RESIDENT'S PERSONAL SPACE, one row per grant. By a decision, no other agent reads the
 * space without the resident's leave. The resident gives one named agent leave,
 * with its own key and an end date; the resident or the owner may end it early. A row is never deleted:
 * `ended_at` NULL means nobody ended it, and it holds until `until`. src/server/lib/residents.ts is its
 * one writer.
 */
export const residentReadGrants = sqliteTable(
  'resident_read_grants',
  {
    id: text('id').primaryKey(),
    residentId: text('resident_id')
      .notNull()
      .references(() => agents.id),
    readerId: text('reader_id')
      .notNull()
      .references(() => agents.id),
    /** The end date the resident gave, local time. */
    until: text('until').notNull(),
    givenAt: text('given_at').notNull(),
    givenByKind: text('given_by_kind').notNull(),
    givenById: text('given_by_id').notNull(),
    endedAt: text('ended_at'),
    endedByKind: text('ended_by_kind'),
    endedById: text('ended_by_id'),
  },
  (t) => [index('resident_read_grants_resident_idx').on(t.residentId), index('resident_read_grants_reader_idx').on(t.readerId)],
)

/**
 * A FILE IN A RESIDENT'S SPACE MARKED VOID, with the reason. By a decision, a wrong entry is marked
 * void, never deleted. The file stays; a page draws it struck through with
 * this reason beside it. One mark per path.
 */
export const residentVoidMarks = sqliteTable(
  'resident_void_marks',
  {
    id: text('id').primaryKey(),
    residentId: text('resident_id')
      .notNull()
      .references(() => agents.id),
    /** The file's path inside the space, relative, with forward slashes. */
    path: text('path').notNull(),
    because: text('because').notNull(),
    markedAt: text('marked_at').notNull(),
    markedByKind: text('marked_by_kind').notNull(),
    markedById: text('marked_by_id').notNull(),
  },
  (t) => [uniqueIndex('resident_void_marks_one_per_path').on(t.residentId, t.path)],
)

/**
 * EACH FILE A RESIDENT WROTE INTO ITS SPACE THROUGH THE OFFICE'S DOOR: who, when, how big and its sha256. A file's
 * modified time is not this record, because any program on this machine can change it. A write may replace a file;
 * the office first keeps the old bytes under `.versions/` in the space, and `replacedVersion` names that path. So a
 * path has one row per write.
 */
export const residentSpaceWrites = sqliteTable(
  'resident_space_writes',
  {
    id: text('id').primaryKey(),
    residentId: text('resident_id')
      .notNull()
      .references(() => agents.id),
    path: text('path').notNull(),
    bytes: integer('bytes').notNull(),
    sha256: text('sha256').notNull(),
    writtenAt: text('written_at').notNull(),
    writtenByKind: text('written_by_kind').notNull(),
    writtenById: text('written_by_id').notNull(),
    /** The earlier version this write kept before replacing the file, by its path in the space, or NULL for a new file. */
    replacedVersion: text('replaced_version'),
  },
  (t) => [index('resident_space_writes_path_idx').on(t.residentId, t.path)],
)

/**
 * A RESIDENT'S SLEEPS AND POSTPONED SLEEPS, migration 0233.
 * `what` is 'slept' or 'postponed'. A sleep's `endedAt` is NULL while the resident is asleep and is written once, on
 * waking; a postponement is one moment and its `endedAt` stays NULL. No row is deleted. src/server/lib/resident-sleep.ts
 * is the one writer and the one reader.
 */
export const residentSleeps = sqliteTable(
  'resident_sleeps',
  {
    id: text('id').primaryKey(),
    agentId: text('agent_id')
      .notNull()
      .references(() => agents.id),
    what: text('what').notNull(),
    beganAt: text('began_at').notNull(),
    endedAt: text('ended_at'),
    because: text('because'),
    byKind: text('by_kind').notNull(),
    byId: text('by_id').notNull(),
    sessionId: text('session_id'),
    /**
     * WHEN THE OFFICE ENDS A SLEEP IT BEGAN AT THE RESIDENT'S SLEEP TIME, and the message it sent the resident when that
     * sleep began, migration 0330. NULL in both is a sleep begun by a press, which only a wake press ends.
     */
    wakesAt: text('wakes_at'),
    reminderId: text('reminder_id'),
  },
  (t) => [index('resident_sleeps_agent_idx').on(t.agentId, t.beganAt)],
)

export const agentRecords = sqliteTable(
  'agent_records',
  {
    /** The `records` row of kind `agent`. One row per record, so the record id is the key. */
    recordId: text('record_id').primaryKey(),
    /** The `agents` row that record is. */
    agentId: text('agent_id')
      .notNull()
      .references(() => agents.id),
  },
  (t) => [index('agent_records_agent_idx').on(t.agentId)],
)

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

/**
 * WHO READ A CONVERSATION THEY WERE NOT PART OF, WHICH ONE, FROM WHICH SIDE, AND WHEN.
 *
 * Criterion M12 gives a person with the owner row the right to read a conversation between two
 * agents, from either side, and says the read is recorded. It was recorded on `api_calls`, which is
 * traffic and is pruned: an untraced row there is deleted after fourteen days with no summary kept,
 * and the browser sends no trace, so after a fortnight nothing said the read had happened. Problem
 * `xdcPntH9rxw_`. Migration 0119 adds this table and its header carries the whole account.
 *
 * NOT THE SAME FACT AS THE `api_calls` ROW. That row says a request arrived and is deleted when the
 * traffic it belongs to stops being counted. This row says a person read a conversation and is kept.
 *
 * ONE ROW FOR EACH READER IN EACH CONVERSATION IN EACH PROJECT: the newest read, which is the
 * reader's read point, in wave 13s round 64.
 * Until then every read was a row of its own, and the table grew by about 130,000 rows a day while
 * every reader of it asked only for the newest. A newer read replaces the row, migration 0278 folded
 * the older ones away, and its unique index holds the rule. The project is part of the key because a
 * page narrowed to one project asks for the newest read in that project. Criterion M12 is met by the
 * newest row, which says who read, which conversation, from which side and when.
 */


/**
 * WHAT AN AGENT IS WORKING ON, AND UNTIL WHEN. One row per claim, added by migration 0121.
 *
 * Criterion M13, which absorbs proposal `pg10HWny6J0j`. A claim says who is working, which run is
 * doing it, and what is being worked on. A second live claim naming the same thing opens a group
 * with both agents and the owner in it (M11), and the group's `about` column is what stops a second
 * group being opened for the same overlap.
 *
 * `things` IS JSON AND NOT A SECOND TABLE. The migration's own header says why and what it costs:
 * overlap is worked out over the live claims in TypeScript, which is a handful of rows, and a second
 * table would make one claim two rows that can disagree about whether it exists.
 *
 * THERE IS NO EXPIRY COLUMN. A lease ends when its run ends, and how that is read is in
 * src/server/lib/claims.ts. A number of minutes here would be a guess about how long work takes.
 */


/**
 * WHICH LIVE SESSION IS ANSWERING AS ONE DURABLE AGENT. One row per hold.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT A HOLD IS
 * ---------------------------------------------------------------------------------------
 *
 * Criterion H1 of design/messages/ACCEPTANCE.md section 10: a message to an agent that is open in a
 * terminal is answered by that session, not by a fresh run started beside it.
 *
 * A row here says: this session record, on this machine, running this tool, is answering as this
 * agent. The session's own script says so every few seconds, and that stamp is `last_heard_at`. Nothing
 * else in this database says which of the many processes on a machine is a given agent right now.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT IS A TABLE AND NOT A FIELD ON THE SESSION RECORD
 * ---------------------------------------------------------------------------------------
 *
 * A heartbeat is a write every few seconds. Every write to a record's `data` makes a `changes` row
 * and a `revisions` row, so a single terminal open for a day would add thousands of both, and the
 * change log a person reads would be almost entirely heartbeats. A hold is not authored prose and
 * does not belong in the history of a record.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT IS NOT A `work_claims` ROW EITHER
 * ---------------------------------------------------------------------------------------
 *
 * A second claim overlapping a live one OPENS A GROUP with the owner in it (criterion M13). H4 asks
 * for the opposite: a second session claiming a held
 * handle is refused naming the holder, and nothing is signalled. Two rules that different cannot
 * share a table without one of them being an exception nobody can see.
 *
 * ---------------------------------------------------------------------------------------
 * A ROW IS ONLY EVER READ AGAINST ITS HEARTBEAT, WHICH IS WHY IT IS SAFE IN A BACKUP
 * ---------------------------------------------------------------------------------------
 *
 * It is an authored table, so an archive carries it, and a restored row would name a session on a
 * machine that may not exist. That is harmless because no reader ever believes a hold on its own:
 * every one asks whether the heartbeat is inside `MOLE_OFFICE_HANDLE_LAPSES_AFTER_SECONDS`, and a
 * restored row is far older than that, so it reads as lapsed and the next reader releases it saying
 * so. `session_resources` carries the same kind of fact for the same reason.
 */
export const handleHolds = sqliteTable(
  'handle_holds',
  {
    /** nanoid, so one hold can be cited. */
    id: text('id').primaryKey(),
    /**
     * The `agents` row whose handle is held.
     *
     * THE HANDLE ITSELF IS NOT STORED HERE. It is on the registry row, one edit away from being
     * renamed, and a copy here would be the same fact in two places with nothing making them agree.
     */
    agentId: text('agent_id')
      .notNull()
      .references(() => agents.id),
    /** The `records` row of kind `session` for the session that is answering. */
    sessionRecordId: text('session_record_id').notNull(),
    /** The computer that session is running on, in its own words. */
    machine: text('machine').notNull(),
    /** `claude-code`, `codex` or `opencode`: the tool the session is a session of. */
    runtime: text('runtime').notNull(),
    /** LOCAL wall clock. No SQL default, for the reason `reader_anchors` gives. */
    claimedAt: text('claimed_at').notNull(),
    /** When the session last said it was still there. Local wall clock, set on every beat. */
    lastHeardAt: text('last_heard_at').notNull(),
    /** When the hold ended, or NULL because it has not. */
    releasedAt: text('released_at'),
    /** One plain sentence saying why, when `released_at` is set. NULL otherwise. */
    releasedBecause: text('released_because'),
  },
  (t) => [
    // ONE LIVE HOLD PER AGENT, IN SQL. H4 is refused in the door with a sentence naming the holder;
    // this is what makes the rule true even if a door is ever bypassed.
    uniqueIndex('handle_holds_one_live_per_agent_idx').on(t.agentId).where(sql`released_at IS NULL`),
    index('handle_holds_session_idx').on(t.sessionRecordId),
  ],
)

/**
 * HOW ONE PERSON HAS ARRANGED THEIR CONTACTS LIST: the second-level groups, added by migration
 * 0127 and given a side by 0161.
 *
 * Criteria M119 and M120: the first level is two locked top
 * groups, Human and Agent, and under them sit ordinary groups the person may add, rename and move
 * contacts between. Under Agent the default arrangement is by role.
 *
 * ONLY WHAT SOMEBODY CHANGED IS IN HERE. The second-level defaults are declared in
 * `src/shared/contacts.ts` and are not rows: a fresh installation has the default arrangement
 * with this table empty. A row appears when somebody makes a group, or renames or moves one of the
 * declared ones.
 *
 * NOTHING HERE SAYS WHETHER SOMEBODY MADE THE GROUP, because `key` already does: the product's own
 * groups are keyed `people`, `secretary`, `inspector`, `supervisor`, `worker`, `other` and
 * `retired`, and a group somebody made is keyed by a fresh id. `isABuiltInGroup` in
 * `src/shared/contacts.ts` is the one reader of that. A stored row keyed `human`, `agent` or
 * `special` is a leftover of the arrangement before M119 and is read as naming no group.
 *
 * IT NAMES NO PROJECT. Which group an agent belongs in is a fact about the agent, and the registries
 * this arranges belong to the installation rather than to a project — the same rule `people`,
 * `agents` and `assets` follow. A workspace column would mean making the groups again in every
 * project.
 */


/**
 * WHERE ONE CONTACT SITS, when somebody has moved it or ordered it by hand. Migration 0127.
 *
 * A contact with no row here is in the group its kind puts it in — `defaultGroupFor` in
 * `src/shared/contacts.ts` — and in the order the list already had. So a new agent lands in `agent`
 * and a new person in `human` with nothing written when they arrive, which is what M29 asks for.
 *
 * `contact` IS THE CONTACT KEY AND NOT A PARTICIPANT REFERENCE, because a contact row is one of two
 * shapes: somebody a registry holds, or a writer nobody registered (criterion M25). One string names
 * either, and it is the same string the panel keys its rows by.
 *
 * BOTH `group_key` AND `at` ARE NULLABLE and at least one is set: somebody may move a contact
 * without ordering it, or order it without moving it.
 */


/**
 * WHETHER ONE PERSON HAS FOLDED ONE GROUP AWAY, added by migration 0161. Criteria M120 and M121.
 *
 * Answer 7: the folded state is
 * kept on the server, because it is one person's behaviour rather than one screen's. So it is here
 * rather than in the browser, and the same person sees the same folds on every machine.
 *
 * A SMALL TABLE AND NOT A COLUMN ON `contact_groups`, because the six role groups and the one
 * People group are COMPUTED — a fresh installation has no `contact_groups` row for any of them.
 * Folding `retired`, which starts folded, is somebody's act even though no group row was ever
 * written, so the state needs a home whose key does not require a group row to exist.
 *
 * `group_key` NAMES EITHER A SECOND-LEVEL GROUP (`worker`, `retired`, or a group somebody made) OR
 * ONE OF THE TWO TOP GROUPS (`human`, `agent`), because every group collapses and the two top ones
 * are groups too. `collapsed` is 0 or 1: a row is the person's explicit choice, and its absence
 * means the default. `retired` defaults to folded; everything else defaults to open.
 */


/**
 * A REQUEST FOR ONE PRESS: AN AGENT ASKS THE PERSON TO AGREE TO ONE KNOWN ACT, added by migration 0206. It
 * stands on the owner's decision, in wave 13n round 45.
 *
 * THE ROW HOLDS NO COMMAND AND NO TEXT THAT RUNS. `act` names one of the known acts in src/server/lib/one-press.ts,
 * and `inputs` holds that act's fixed inputs, checked there before the row is written. The person's press runs the
 * act the office has for that name, with those inputs. Nothing an agent wrote is run.
 *
 * ITS OWN TABLE AND NOT A RECORD, so no record door can file, change or delete one. Only the doors in
 * src/server/api/one-press.ts write it: an agent files it, the person agrees or refuses, and its asker withdraws it.
 *
 * `state` is `waiting`, `done`, `could-not`, `refused` or `withdrawn`. `could-not` is the person agreed and the act
 * could not run; `outcome` then says why, and `done` says what it did.
 */


/**
 * ONE USE OF A TOOL, ONE ROW. Added by migration 0231, wave 13s round 33 (problem mR8vNPOVNQ_p).
 *
 * Until this table a use was a line in `data.toolUses` on the calling run's record. Every use rewrote
 * the record, so every use wrote a revision holding the whole list again: 268,483,514 bytes of
 * revisions for one made-up run of 2,000 uses. Now the use door (`writeAUse` in
 * src/server/lib/toolset.ts) writes one use row here, with optional file results in test_file_runs:
 * no record write, no revision and no change row. The rows are append-only, so they are the history of the uses.
 *
 * NOT A RECORD, so decision Vt0GdSlApWce point d still holds: a use never gets a record of its own.
 *
 * `seq` is the order of the use on its run, 1, 2, 3 …, and (run_id, seq) is unique, so two uses
 * cannot claim one place. A row the migration moved out of `data.toolUses` keeps its place in the
 * list as its `seq`, carries `moved_at`, and names no writer: the list did not record who wrote each
 * line, and the old change rows and revisions that do are kept as they are.
 */

/**
 * ONE TEST FILE'S RESULT IN ONE USE, migration 0279 (message Vue3ni42wa94).
 * Authored: a named test run observed this result, and nothing can recreate that observation.
 * The use owns the run and the time; neither is copied here. Tree commit and change repeat on each
 * file of a use because a table was chosen, not a column on tool_uses. Its project follows the use.
 */

/**
 * A READINESS CHECKLIST: ONE OPERATION ON ONE TARGET, WAITING FOR THOSE IT AFFECTS TO SIGN. Migration 0252, in
 * wave 13u round 13, by two of the owner's decisions. The
 * rule is in src/server/lib/readiness.ts; only its doors
 * write these rows.
 */

/**
 * Every table in this database, by its SQL name, split by whether its contents were authored.
 *
 * WHY THIS LIST IS IN THE SCHEMA AND NOT IN THE EXPORTER THAT WILL NEED IT. A durable format has
 * to know which tables exist, and the answer has been wrong three times already: README.md says
 * three, this file said five until migration 0003, its own header said eleven until the planning
 * layer was counted, and a live database has fifteen. A list kept anywhere other than beside the
 * declarations drifts from them the first time somebody adds a table and only reads the file they
 * are editing. tests/schema-tables.test.ts checks these two arrays against the drizzle table
 * objects declared above AND against a freshly migrated database, so a table added without being
 * listed here fails the suite rather than being silently left out of a backup.
 *
 * AUTHORED means a person or an agent made it and it exists nowhere else, so it must round-trip
 * through any durable format. DERIVED means a scan rebuilds it wholesale, so it must be
 * REGENERATED rather than exported — a restored copy would describe the machine it came from.
 *
 * `__drizzle_migrations` is in neither list. It is drizzle's own bookkeeping; a restore applies
 * the migrations, which writes it, and then imports the data.
 *
 * ---------------------------------------------------------------------------------------
 * EVERYTHING BELOW THIS LIST IS DERIVED FROM IT, AND THAT IS THE POINT
 * ---------------------------------------------------------------------------------------
 *
 * `records`, `links` and `changes` were used as a stand-in for "the tables that hold authored
 * work" in FOUR places — the reset guard, the scoped archive's notes, the backup verifier and the
 * migration loss-guard — and by 2026-08-12 there were twelve authored tables. Nothing derived any
 * of those lists from any other, so each was separately wrong and nothing failed: `npm run
 * db:reset` deleted a planning-only database without a word, a project archive said "Nothing has
 * been drafted" over a database full of drafts, `--check-only` called a backup with no planning
 * layer usable, and a server start migrated somebody's plan in place, unattended.
 *
 * So the lists below are computed from `AUTHORED_TABLES` and from the drizzle declarations
 * themselves, and every one of those four places reads one of them. A table added to
 * `AUTHORED_TABLES` and nowhere else fixes all four at once, or fails to compile.
 */
/**
 * SEVERAL CASTINGS FOR EACH ROLE, migration 0190, with probability added by migration 0268, work group added by
 * migration 0318, and labels and out-until added by migration 0349, which leaves work_group unread. Each role may be cast several ways, and which suits depends on the task's
 * difficulty, the quota it uses and the cost for what it gives. One row per casting, with an id of its own;
 * `project` is '' for a casting that holds for every project. Each cell has its value and, in the `_from` column
 * beside it, where the value came from, as JSON read by `readCastingCellSource` in src/shared/casting.ts, or NULL
 * when the cell is empty. `marked` is 1 on the one row of a role's scope the tools take; the unique index keeps two
 * out of one scope. The reader and the writers are in src/server/lib/casting.ts. The two tables of migration 0189
 * above are kept as they were and nothing reads them.
 */
export const castingRows = sqliteTable('casting_rows', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  role: text('role').notNull(),
  project: text('project').notNull().default(''),
  marked: integer('marked').notNull().default(0),
  program: text('program'),
  programFrom: text('program_from'),
  model: text('model'),
  modelFrom: text('model_from'),
  effort: text('effort'),
  effortFrom: text('effort_from'),
  difficulty: text('difficulty'),
  difficultyFrom: text('difficulty_from'),
  quota: text('quota'),
  quotaFrom: text('quota_from'),
  cost: text('cost'),
  costFrom: text('cost_from'),
  probability: text('probability'),
  probabilityFrom: text('probability_from'),
  workGroup: text('work_group'),
  workGroupFrom: text('work_group_from'),
  labels: text('labels'),
  labelsFrom: text('labels_from'),
  outUntil: text('out_until'),
  outUntilFrom: text('out_until_from'),
  why: text('why'),
  whyFrom: text('why_from'),
  changedAt: text('changed_at').notNull(),
  changedByKind: text('changed_by_kind').notNull(),
  changedById: text('changed_by_id').notNull(),
  authority: text('authority'),
}, table => [
  index('casting_rows_scope').on(table.role, table.project, table.id),
  uniqueIndex('casting_rows_one_mark').on(table.role, table.project).where(sql`marked = 1`),
  check('casting_rows_marked', sql`${table.marked} IN (0, 1)`),
])

/**
 * EVERY CHANGE TO A CASTING, append-only, migration 0190: which casting, what (add, change, remove, mark,
 * unmark, migrate), who, when, the row before and after as JSON, and the decisions the writer named. It
 * holds the history of migration 0189's table too, copied with its ids.
 */
export const castingRowChanges = sqliteTable('casting_row_changes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  castingId: integer('casting_id').notNull(),
  role: text('role').notNull(),
  project: text('project').notNull().default(''),
  what: text('what').notNull(),
  at: text('at').notNull(),
  byKind: text('by_kind').notNull(),
  byId: text('by_id').notNull(),
  authority: text('authority'),
  decisions: text('decisions').notNull(),
  note: text('note'),
  before: text('before'),
  after: text('after'),
}, table => [
  index('casting_row_changes_casting').on(table.castingId, table.id),
  index('casting_row_changes_role').on(table.role, table.id),
])

/**
 * THE CASTING LABELS, migration 0349. A label names a kind of work and can be made,
 * renamed and removed on the Casting page, with what it means. One row per label, for the whole installation; the
 * unique index keeps two labels from sharing a name. `meaning_from` is where the meaning came from, as JSON read by
 * `readCastingCellSource` in src/shared/casting.ts, or NULL when nobody has written a meaning. A Casting row's
 * `labels` holds the ids. A removed label's row is deleted. The reader and the writers are in
 * src/server/lib/casting-labels.ts.
 */
export const castingLabels = sqliteTable('casting_labels', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  meaning: text('meaning'),
  meaningFrom: text('meaning_from'),
  changedAt: text('changed_at').notNull(),
  changedByKind: text('changed_by_kind').notNull(),
  changedById: text('changed_by_id').notNull(),
  authority: text('authority'),
}, table => [uniqueIndex('casting_labels_name').on(table.name)])

/**
 * EVERY CHANGE TO A CASTING LABEL, append-only, migration 0349: which label, what (add, rename, change, remove,
 * migrate), who, when, and the label before and after as JSON. It keeps a removed label's history and last name.
 */
export const castingLabelChanges = sqliteTable('casting_label_changes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  labelId: integer('label_id').notNull(),
  what: text('what').notNull(),
  at: text('at').notNull(),
  byKind: text('by_kind').notNull(),
  byId: text('by_id').notNull(),
  authority: text('authority'),
  note: text('note'),
  before: text('before'),
  after: text('after'),
}, table => [index('casting_label_changes_label').on(table.labelId, table.id)])

// THE SETTINGS AND GRANT TABLES ARE DECLARED IN src/server/db/tables/, one file for each. They keep
// the authored registry entries, archive pages and restore proof they had while declared here, so
// they are not schema parts: those take their archive and restore answers from aPartTable.
import {
  officeSceneSettings,
  officeMapLayouts,
  previewRootAdditions,
  priceTable,
  quickInputList,
  quickInputAsks,
  pressesForThePerson,
  whatTheGrantCarries,
} from './tables/index.ts'
export * from './tables/index.ts'

import { AUTHORED_TABLES, type AuthoredTable } from './table-name-lists.ts'
export * from './table-name-lists.ts'

/**
 * THE TABLES NO COPY OF THIS DATABASE MAY CARRY.
 *
 * `held_keys` holds the SHA-256 of every key the office ever issued: agents' keys, the person's own
 * devices' keys, live ones and revoked ones. A key hash is a secret one step from its key, and the owner
 * ruled that no copy, backup or export carries a key. The export honours it
 * because only `AUTHORED_TABLES` are exported and `held_keys` is not among them. The backup command
 * copies the WHOLE file with SQLite's online backup, so it must empty these tables IN THE COPY after
 * writing it, and the restore proof must count them among the tables a restore must not bring back.
 *
 * NAMED ONCE, in src/config/what-a-copy-must-not-carry.mjs, and re-exported here. The backup
 * command and the restore proof ask the same question of the same list, and so do the two plain
 * JavaScript tools that copy the file, tools/isolated-mole-office.mjs and tools/office-copy.mjs. They
 * cannot import this TypeScript module, so the list lives where all four can read it. A table emptied
 * by one and left in another is the drift this file exists to stop.
 */
export { NOT_CARRIED_TABLES } from '../../config/what-a-copy-must-not-carry.mjs'

export type NotCarriedTable = (typeof import('../../config/what-a-copy-must-not-carry.mjs').NOT_CARRIED_TABLES)[number]

/**
 * The drizzle declaration behind each authored table name.
 *
 * THE ONE PLACE A NAME IS TIED TO ITS COLUMNS, so that anything wanting to know what a table holds
 * asks the declaration rather than restating it. `satisfies Record<AuthoredTable, SQLiteTable>` is
 * what makes a table added to `AUTHORED_TABLES` and forgotten here a COMPILE error rather than a
 * gap somebody finds in a backup.
 */
export const AUTHORED_TABLE_OF = {
  office_scene_settings: officeSceneSettings,
  office_map_layouts: officeMapLayouts,
  run_models: runModels,
  casting,
  casting_changes: castingChanges,
  casting_rows: castingRows,
  casting_row_changes: castingRowChanges,
  casting_labels: castingLabels,
  casting_label_changes: castingLabelChanges,
  preview_root_additions: previewRootAdditions,
  price_table: priceTable,
  quick_input_list: quickInputList,
  what_the_grant_carries: whatTheGrantCarries,
  submission_baselines: submissionBaselines, legacy_unsealed_runs: legacyUnsealedRuns,
  workspaces,
  records,
  links,
  changes,
  revisions,
  reader_anchors: readerAnchors,
  presentation_intent: presentationIntent,
  panel_layouts: panelLayouts,
  session_resources: sessionResources,
  folder_readings: folderReadings,
  allocations,
  planning_capacity: planningCapacity,
  planning_recurrences: planningRecurrences,
  plans,
  plan_lines: planLines,
  plan_line_revisions: planLineRevisions,
  counter_rows: counterRows,
  planning_intents: planningIntents,
  work_windows: workWindows,
  agent_threads: agentThreads,
  agent_messages: agentMessages,
  agent_runs: agentRuns,
  reviews,
  repositories,
  implementation_revisions: implementationRevisions,
  implementation_map: implementationMap,
  file_observations: fileObservations,
  revalidations,
  annotation_words_fixed: annotationWordsFixed,
  measure_words_renamed: measureWordsRenamed,
  assets,
  people,
  agents,
  agent_records: agentRecords,
  resident_read_grants: residentReadGrants,
  resident_void_marks: residentVoidMarks,
  resident_space_writes: residentSpaceWrites,
  resident_sleeps: residentSleeps,
  installation,
  runtime_settings: runtimeSettings,
  office_restart_grants: officeRestartGrants,
  worlds,
  visits,
  visitor_credentials: visitorCredentials,
  visitor_requests: visitorRequests,
  trusted_machines: trustedMachines,
  message_delivery: messageDelivery,
  conversation_reads: conversationReads,
  groups,
  group_members: groupMembers,
  work_claims: workClaims,
  dead_letter_claims: deadLetterClaims,
  handle_holds: handleHolds,
  contact_groups: contactGroups,
  contact_placements: contactPlacements,
  contact_group_collapses: contactGroupCollapses,
  one_press_requests: onePressRequests,
  tool_uses: toolUses,
  test_file_runs: testFileRuns,
  handovers,
  readiness_checklists: readinessChecklists,
  readiness_signatures: readinessSignatures,
  signing_packages: signingPackages,
  signing_package_items: signingPackageItems,
  quick_input_asks: quickInputAsks,
  presses_for_the_person: pressesForThePerson,
} as const satisfies Record<AuthoredTable, SQLiteTable>

/**
 * A row of THIS table belongs to a project because a row of THAT table says so.
 *
 * The third form of the answer below. `column` is this table's SQL column holding the other row's
 * id, and `matches` is the column it names over there — so `agent_messages` is scoped by
 * `agent_messages.thread_id = agent_threads.id`, and the project is whatever that thread's
 * `workspace_id` says.
 *
 * BOTH COLUMN NAMES ARE READ OFF THE DECLARATIONS rather than typed, so renaming a column in the
 * table above moves this with it instead of leaving a string that no longer names anything.
 */
export interface ScopedThroughAnotherTable {
  /** The table whose row says which project this row is in. */
  readonly table: AuthoredTable
  /** The SQL column on THIS table that names a row of it. */
  readonly column: string
  /** The SQL column over there that the one above names. */
  readonly matches: string
}

/** How a row of one authored table is scoped to a project: a column, nothing, or another row. */
export type WorkspaceScope = string | null | ScopedThroughAnotherTable

/**
 * The tables whose project is a fact about another table's row, and which row that is.
 *
 * STATED HERE BECAUSE NOTHING IN SQLITE SAYS IT. A missing `workspace_id` is a fact the schema
 * carries; "and the thread is where the project lives" is a judgement, and this is the one place it
 * is written. It is the smallest thing that could not be derived: everything else about the scoping
 * below is read off the declarations.
 */
const SCOPED_THROUGH: Partial<Record<AuthoredTable, ScopedThroughAnotherTable>> = {
  agent_messages: { table: 'agent_threads', column: agentMessages.threadId.name, matches: agentThreads.id.name },
  agent_runs: { table: 'agent_threads', column: agentRuns.threadId.name, matches: agentThreads.id.name },
  // A marker belongs to the project its comment belongs to. Without this line the rule above would
  // read a table with no `workspace_id` as belonging to no project at all, and a project-scoped
  // archive would print, over that project's own comments, the sentence that says a plan belongs to
  // nobody.
  //
  // FIVE TESTS FAIL WITHOUT IT, AND THEY ARE ALL IN ONE FILE THIS COMMENT USED TO NOT NAME. It said
  // "Nothing fails without it, which is exactly why it is written here", and that was measured false
  // on 25 August 2026. Deleting this entry leaves `npx tsc --noEmit` at exit 0, because the map is a
  // `Partial<Record<...>>` and a missing key is a legal value; it also leaves
  // tests/schema-tables.test.ts and tests/export-format.test.ts green, and those are the two files
  // the prose around here is about and the two a maintainer would check. What goes red is
  // tests/export-workspace.test.ts > "a project archive states what it cannot carry, with the
  // numbers": five `it`s, among them "names every person-level table in its notes, with the count
  // the database holds". So the compiler does not hold this entry and the suite does — RUN THAT FILE.
  // A DELIVERY ROW BELONGS TO THE PROJECT ITS MESSAGE IS IN, and the message is a record. So a
  // project archive carries the marks of that project's messages and no others, which is what a
  // reader of the archive would expect: the message is there and how far it got is there with it.
  message_delivery: {
    table: 'records',
    column: messageDelivery.messageId.name,
    matches: records.id.name,
  },
  annotation_words_fixed: {
    table: 'records',
    column: annotationWordsFixed.annotationId.name,
    matches: records.id.name,
  },
  // A MEMBERSHIP BELONGS TO THE PROJECT ITS GROUP IS IN. `groups` carries its own `workspace_id`;
  // a membership carries none, because a copy of it on every row would be the same fact twice.
  // Without this line the rule below would read a table with no `workspace_id` as belonging to no
  // project at all, and a project archive would carry the groups and leave out who was in them.
  group_members: { table: 'groups', column: groupMembers.groupId.name, matches: groups.id.name },
  // A SIGNATURE BELONGS TO THE PROJECT ITS CHECKLIST WAS RAISED IN, for the reason a membership does: without this line a
  // project archive would carry the checklists and leave out who signed them.
  signing_package_items: { table: 'signing_packages', column: signingPackageItems.packageId.name, matches: signingPackages.id.name },
  readiness_signatures: { table: 'readiness_checklists', column: readinessSignatures.checklistId.name, matches: readinessChecklists.id.name },
  // `agent_records` IS NOT HERE, AND THE REASON WAS MEASURED. It names a project record, so the third
  // form would place it — and a project-scoped archive would then carry mapping rows pointing at
  // `agents` rows no project archive can carry, because a durable agent belongs to no project. The
  // restore of such an archive fails on the foreign key, which is what happened when it WAS listed
  // here: tests/agent-archive.test.ts imports a scoped archive and stopped with
  // `FOREIGN KEY constraint failed`. Half a mapping is worse than none, so the mapping travels with
  // the registry it points into: both belong to no project, and the whole-installation archive is
  // the one that carries them.
}

/**
 * How each authored table says which project a row of it belongs to. Three answers, not two.
 *
 *   a column name   the row says so itself, in that column. `workspaces` answers with its own
 *                   primary key, because the row IS the project.
 *   a `through`     the row says which OTHER row it belongs to, and that row carries the project.
 *   null            nothing can say. The planning layer, which is person-level on purpose.
 *
 * READ OFF THE DECLARATIONS, except for the one judgement `SCOPED_THROUGH` above states. A table
 * that declares `workspace_id` is scoped by it; a table that does not, and is not named up there,
 * has no project — and that is a fact about the schema rather than a decision made here.
 *
 * EVERY READER HANDLES ALL THREE, and there are three of them: `readTable` in lib/export.ts, and
 * two tests in tests/schema-tables.test.ts that check this against a migrated database. A reader
 * that only handled the first two would treat a through-scoped table as person-level, which is
 * exactly the wrong answer this form was added to remove — so `typeof scope === 'string'` is the
 * test, never `scope !== null`.
 *
 * It was a hand-written map in lib/export.ts whose comment said "`null` MEANS THE REGION BELONGS TO
 * NO PROJECT, and two do". Two migrations later four did, and the archive built from that map went
 * on describing two.
 */
export const WORKSPACE_COLUMN: Readonly<Record<AuthoredTable, WorkspaceScope>> = Object.fromEntries(
  AUTHORED_TABLES.map((table) => {
    if (table === 'workspaces') return [table, workspaces.id.name]
    const through = SCOPED_THROUGH[table]
    if (through !== undefined) return [table, through]
    const columns = getTableColumns(AUTHORED_TABLE_OF[table]) as Record<string, { name: string } | undefined>
    return [table, columns['workspaceId']?.name ?? null]
  }),
) as Record<AuthoredTable, WorkspaceScope>

/**
 * The authored tables that belong to NO project: the planning layer, the ones that hold who takes
 * part, and the ones that hold how one person has arranged their contacts.
 *
 * TWO KINDS OF TABLE ARE IN HERE AND THE REASONS ARE DIFFERENT. The planning layer is person-level
 * — a plan is one person's overlay across work that belongs to projects. `assets`, `people`,
 * `agents`, `agent_records`, `contact_groups` and `contact_placements` are installation-level: the
 * owner is the same person in every project on this machine, and so is a durable agent, and so is
 * the group the person has put that agent in. Both answers come out the same way here,
 * because the question this list asks is "can a project-scoped archive carry this row", and for
 * both kinds the answer is no. The archive's note names them; it does not have to know why.
 *
 * A plan is a person-level time-allocation overlay across workspace-owned work — the settled
 * decision written out in full on `allocations` above — so an allocation, a capacity row, a draft,
 * a recurrence and a work window have no project to be in. That is why a PROJECT-SCOPED archive
 * cannot carry any of them, and why it has to say so with the numbers rather than print a page
 * saying "Nothing has been drafted" over a database full of drafts.
 *
 * THE RULE IS "NOTHING CAN SAY WHICH PROJECT THIS ROW IS IN", WHICH IS NARROWER THAN "NO
 * `workspace_id` COLUMN". A table scoped through another table's row has no `workspace_id` either,
 * and it is not person-level: its project is written down, one row along. `WORKSPACE_COLUMN`
 * answers with a `through` for those, which is not null, so this filter leaves them out — and that
 * is the whole reason the third form exists. Until 18 August 2026 the rule really was the wider
 * one, and `agent_messages` and `agent_runs` were left out of `AUTHORED_TABLES` altogether rather
 * than be called person-level by it.
 *
 * `drizzle/0007_planning.sql` SAYS "NEITHER TABLE HAS A `workspace_id`, AND THEY ARE THE ONLY TWO",
 * AND THAT SENTENCE STAYS WRONG WHERE IT IS. It was true when 0007 was written; 0008 and 0009 added
 * `planning_drafts` and `planning_recurrences` on the same footing. An applied migration is history
 * and is never edited — not even its comments — because every existing database's journal row is a
 * claim about that file, and one edited comment has already cost this project a restore path. THIS
 * LIST IS THE CORRECTION, and it is where the migration's own header sends a reader.
 */
export const PERSON_LEVEL_TABLES: readonly AuthoredTable[] = AUTHORED_TABLES.filter(
  (table) => WORKSPACE_COLUMN[table] === null,
)

export * from './why-no-project.ts'

export * from './migration-declared-tables.ts'

// ============================================================================ the schema parts
//
// Every table declared under schema-parts/, re-exported so that an import of this file and
// drizzle-kit see it. `everyPartTable()` in every-part-table.ts is what each says about itself;
// part-tables.ts says what is refused.
export * from './schema-parts/index.ts'
export * from './every-part-table.ts'
