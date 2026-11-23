// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SCHEMA PARTS: the tables declared outside schema.ts, one file for each line of work or area.
 *
 * ONE LINE HERE FOR EACH PART FILE, `export * from './<part>.ts'`, added at the end. schema.ts
 * re-exports this file, so every import of schema.ts sees a part's tables, and so does drizzle-kit,
 * which reads schema.ts. A part file not named here is seen by neither, and
 * tests/a-schema-part-says-what-happens-to-its-tables.test.ts fails naming it.
 *
 * A PART FILE IMPORTS drizzle-orm, ../part-tables.ts and, for a reference to another table, the part
 * file that declares it, or ../schema.ts for a table still declared there. Nothing that opens the
 * database: scripts/restore-check.ts reads the parts in a process that must not open one. Each table
 * is wrapped in `aPartTable`, which says what an archive and a restore do with it, and each table is
 * created by a migration of its own.
 *
 * A TABLE schema.ts READS WHILE IT LOADS IS NOT DECLARED IN A FILE THAT IMPORTS schema.ts, directly or
 * through another file. A file that imports schema.ts back is in a cycle with it, and when that file loads first, as it
 * can in the bundle, schema.ts reads the file's table before the table is made. schema.ts read every part table this
 * way to build AUTHORED_TABLE_OF and the maps made from it, until they moved to authored-table-of.ts, which loads after
 * schema.ts. tests/a-schema-part-file-can-load-first.test.ts loads each part file first and names the one that
 * breaks schema.ts or the maps.
 */

// This line keeps the file a module, whatever it names.
export {}
export * from './notice-batches.ts'
export * from './registry-aliases.ts'
export * from './remint-generations.ts'
export * from './router-receipts.ts'
export * from './storage.ts'
export * from './agent-renames.ts'
export * from './the-provider-table.ts'
export * from './agent-starter-changes.ts'
export * from './remint-kept-lists.ts'
export * from './planning.ts'
export * from './presentation.ts'
export * from './visitors.ts'
export * from './readiness-and-handovers.ts'
export * from './delivery-neighbors.ts'
export * from './source-and-implementation.ts'
export * from './revalidations.ts'
export * from './api-calls.ts'
export * from './held-keys.ts'
export * from './run-tokens.ts'
export * from './header-only-calls.ts'
export * from './hourly-calls.ts'
export * from './outside-reads.ts'
export * from './usage-stretches.ts'
export * from './usage-checks.ts'
export * from './runtime-settings.ts'
export * from './gate-counts.ts'
export * from './gate-count-spool-reads.ts'
export * from './office-restart-grants.ts'
export * from './agent-threads.ts'
export * from './reviews.ts'
export * from './annotation-words-fixed.ts'
export * from './measure-words-renamed.ts'
export * from './workspaces.ts'
export * from './changes.ts'
export * from './remint-manifest-evidence.ts'
export * from './agent-messages.ts'
export * from './agent-runs.ts'
export * from './assets.ts'
export * from './people.ts'
export * from './revisions.ts'
export * from './groups.ts'
export * from './reader-anchors.ts'
export * from './run-models.ts'
export * from './casting-legacy.ts'
export * from './agents.ts'
export * from './resident-read-grants.ts'
export * from './resident-void-marks.ts'
export * from './resident-space-writes.ts'
export * from './resident-sleeps.ts'
export * from './agent-records.ts'
export * from './handle-holds.ts'
export * from './casting-rows.ts'
export * from './casting-row-changes.ts'
export * from './casting-labels.ts'
export * from './casting-label-changes.ts'
export * from './agent-owner-changes.ts'
