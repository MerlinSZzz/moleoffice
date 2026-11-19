-- The five stamp columns that defaulted to UTC stop defaulting to anything.
--
-- `records.created_at`, `records.updated_at`, `links.created_at`, `links.updated_at` and
-- `changes.at` were created by 0000 with `DEFAULT (datetime('now'))`. `datetime('now')` is UTC.
-- PanelX stores LOCAL wall-clock strings in every one of those columns — that is a hard constraint
-- in design/BRIEF.md and the whole reason src/shared/time.ts exists — so the default was a trap: an
-- INSERT that forgot to pass a stamp stored a value wrong by the machine's offset, behind a
-- successful write, in a row that looked completely normal afterwards. This project has already
-- lost two months to one instance of that class of bug, and `reader_anchors.last_seen_at` was
-- declared with no default in order not to join them. This file finishes that argument.
--
-- After this, forgetting is loud in both directions. A drizzle INSERT that omits the column no
-- longer type-checks, because drizzle only makes a column optional in `$inferInsert` when it has a
-- default. A raw SQL INSERT that omits it fails NOT NULL.
--
-- ---------------------------------------------------------------------------------------
-- THIS IS THE FIRST MIGRATION IN THIS PROJECT THAT REWRITES ROWS, AND IT HAD TO BE
-- ---------------------------------------------------------------------------------------
--
-- Every migration before this one is additive: 0001 and 0002 add columns, 0003 creates tables.
-- src/server/db/migrate.ts still says so in the sentence it throws when row counts shrink, and the
-- header of 0003 says migrations here never rewrite a row. That was true and it is no longer.
--
-- SQLite has no `ALTER TABLE ... ALTER COLUMN`, so a DEFAULT can only be removed by rebuilding the
-- table. Two ways round that were tried against a byte copy of ./data/panelx.db and both are dead:
--
--   `PRAGMA writable_schema` — editing the CREATE statement in sqlite_master would touch no row at
--   all. better-sqlite3 opens every connection with SQLITE_DBCONFIG_DEFENSIVE set, so the pragma
--   reads back 0 and the UPDATE fails with "table sqlite_master may not be modified".
--
--   What `npm run db:generate` emits for this change. It is the standard rebuild — create
--   `__new_records`, copy, drop, rename — wrapped in `PRAGMA foreign_keys=OFF` and `=ON`. Drizzle's
--   migrator runs every statement inside one explicit transaction, and `PRAGMA foreign_keys` is a
--   NO-OP inside a transaction, so foreign keys stayed on and `DROP TABLE records` died with
--   `FOREIGN KEY constraint failed` on a copy of the live database. Measured, not assumed: run
--   `npm run db:generate` against a schema.ts with the defaults back to read it for yourself. The
--   file below is that migration, reordered by hand so that it is correct with foreign keys ON.
--
-- So the rebuild below is ordered to be correct with foreign keys ENFORCED throughout, which is how
-- both callers run it: db/client.ts sets `foreign_keys = ON`, and both `npm run db:migrate` and the
-- server's start-up call drizzle's migrator on that connection.
--
-- ---------------------------------------------------------------------------------------
-- THE ORDER, AND WHY IT IS THIS ORDER
-- ---------------------------------------------------------------------------------------
--
-- Two tables have children. `links.from_id` and `links.to_id` point at `records.id`;
-- `reader_anchors.last_change_id` points at `changes.id`. Dropping a parent while a child ROW
-- points into it is the violation, so each child steps aside first:
--
--   1. `links` rows move to a holding table with no foreign keys, and `links` is dropped. Dropping
--      a child is never a violation.
--   2. `reader_anchors` rows move to a holding table and the rows are deleted. The reader_anchors
--      TABLE is not touched — it needs no repair, and re-typing a declaration that is already
--      correct is how a definition drifts.
--   3. `records` and `changes` are now childless and are rebuilt.
--   4. `links` is recreated in its final shape, with its foreign keys, and its rows come back.
--   5. The reader_anchors rows come back.
--
-- NO `ALTER TABLE ... RENAME` ANYWHERE. The usual rebuild creates `__new_records`, drops the old
-- one and renames. A rename re-parses the whole schema, and between the DROP and the RENAME another
-- table's REFERENCES clause names a table that does not exist for that instant. Copying through a
-- holding table costs one more pass over rows that are already in memory and has no such moment.
--
-- WHY THE `CREATE TABLE` STATEMENTS HERE ARE BARE, against the rule that every hand-edited
-- migration in this folder adds `IF NOT EXISTS`. That rule exists because 0003's tables already
-- existed in every database, so a bare CREATE would stop on "table already exists". Here every
-- CREATE is preceded by the DROP of the table it recreates, so the table is guaranteed absent —
-- and `IF NOT EXISTS` would be actively dangerous: if one of these tables somehow survived, the
-- guard would silently skip creating it and the INSERT below would refill the OLD shape while the
-- migration reported success. Bare is the loud version. tests/migration.test.ts encodes this
-- exception beside 0000's.
--
-- NOTHING BELOW CHANGES A VALUE. Every INSERT names its columns on both sides and copies them
-- across unchanged; the holding tables declare the same types, so nothing is re-affinitised on the
-- way through. The row counts are compared before and after by src/server/db/migrate.ts, and
-- tests/migration.test.ts compares the CONTENT of every row of all three tables as well, because a
-- rebuild that keeps the count can still lose a column.

CREATE TABLE `__hold_links` (
	`id` text,
	`workspace_id` text,
	`owner_id` text,
	`created_at` text,
	`updated_at` text,
	`from_id` text,
	`to_id` text,
	`type` text,
	`inferred` integer,
	`created_by` text,
	`gate` text,
	`gate_up_to` text
);
--> statement-breakpoint
INSERT INTO `__hold_links`("id", "workspace_id", "owner_id", "created_at", "updated_at", "from_id", "to_id", "type", "inferred", "created_by", "gate", "gate_up_to") SELECT "id", "workspace_id", "owner_id", "created_at", "updated_at", "from_id", "to_id", "type", "inferred", "created_by", "gate", "gate_up_to" FROM `links`;
--> statement-breakpoint
DROP TABLE `links`;
--> statement-breakpoint
CREATE TABLE `__hold_reader_anchors` (
	`workspace_id` text,
	`reader` text,
	`last_seen_at` text,
	`last_change_id` text
);
--> statement-breakpoint
INSERT INTO `__hold_reader_anchors`("workspace_id", "reader", "last_seen_at", "last_change_id") SELECT "workspace_id", "reader", "last_seen_at", "last_change_id" FROM `reader_anchors`;
--> statement-breakpoint
DELETE FROM `reader_anchors`;
--> statement-breakpoint
CREATE TABLE `__hold_records` (
	`id` text,
	`workspace_id` text,
	`owner_id` text,
	`created_at` text,
	`updated_at` text,
	`kind` text,
	`title` text,
	`summary` text,
	`data` text,
	`deleted_at` text
);
--> statement-breakpoint
INSERT INTO `__hold_records`("id", "workspace_id", "owner_id", "created_at", "updated_at", "kind", "title", "summary", "data", "deleted_at") SELECT "id", "workspace_id", "owner_id", "created_at", "updated_at", "kind", "title", "summary", "data", "deleted_at" FROM `records`;
--> statement-breakpoint
DROP TABLE `records`;
--> statement-breakpoint
CREATE TABLE `records` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text DEFAULT 'default' NOT NULL,
	`owner_id` text DEFAULT 'unknown' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`summary` text,
	`data` text DEFAULT '{}' NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
INSERT INTO `records`("id", "workspace_id", "owner_id", "created_at", "updated_at", "kind", "title", "summary", "data", "deleted_at") SELECT "id", "workspace_id", "owner_id", "created_at", "updated_at", "kind", "title", "summary", "data", "deleted_at" FROM `__hold_records`;
--> statement-breakpoint
DROP TABLE `__hold_records`;
--> statement-breakpoint
CREATE INDEX `records_kind_idx` ON `records` (`kind`);
--> statement-breakpoint
CREATE UNIQUE INDEX `records_title_idx` ON `records` (`workspace_id`,`title`);
--> statement-breakpoint
CREATE INDEX `records_live_idx` ON `records` (`workspace_id`,`deleted_at`);
--> statement-breakpoint
CREATE INDEX `records_updated_idx` ON `records` (`updated_at`);
--> statement-breakpoint
CREATE TABLE `__hold_changes` (
	`id` text,
	`record_id` text,
	`op` text,
	`actor_type` text,
	`actor_id` text,
	`session_id` text,
	`field` text,
	`old_value` text,
	`new_value` text,
	`at` text
);
--> statement-breakpoint
INSERT INTO `__hold_changes`("id", "record_id", "op", "actor_type", "actor_id", "session_id", "field", "old_value", "new_value", "at") SELECT "id", "record_id", "op", "actor_type", "actor_id", "session_id", "field", "old_value", "new_value", "at" FROM `changes`;
--> statement-breakpoint
DROP TABLE `changes`;
--> statement-breakpoint
CREATE TABLE `changes` (
	`id` text PRIMARY KEY NOT NULL,
	`record_id` text NOT NULL,
	`op` text NOT NULL,
	`actor_type` text NOT NULL,
	`actor_id` text NOT NULL,
	`session_id` text,
	`field` text,
	`old_value` text,
	`new_value` text,
	`at` text NOT NULL
);
--> statement-breakpoint
INSERT INTO `changes`("id", "record_id", "op", "actor_type", "actor_id", "session_id", "field", "old_value", "new_value", "at") SELECT "id", "record_id", "op", "actor_type", "actor_id", "session_id", "field", "old_value", "new_value", "at" FROM `__hold_changes`;
--> statement-breakpoint
DROP TABLE `__hold_changes`;
--> statement-breakpoint
CREATE INDEX `changes_record_idx` ON `changes` (`record_id`);
--> statement-breakpoint
CREATE INDEX `changes_at_idx` ON `changes` (`at`);
--> statement-breakpoint
CREATE INDEX `changes_session_idx` ON `changes` (`session_id`);
--> statement-breakpoint
CREATE TABLE `links` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text DEFAULT 'default' NOT NULL,
	`owner_id` text DEFAULT 'unknown' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`from_id` text NOT NULL,
	`to_id` text NOT NULL,
	`type` text NOT NULL,
	`inferred` integer DEFAULT false NOT NULL,
	`created_by` text DEFAULT 'unknown' NOT NULL,
	`gate` text,
	`gate_up_to` text,
	FOREIGN KEY (`from_id`) REFERENCES `records`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`to_id`) REFERENCES `records`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `links`("id", "workspace_id", "owner_id", "created_at", "updated_at", "from_id", "to_id", "type", "inferred", "created_by", "gate", "gate_up_to") SELECT "id", "workspace_id", "owner_id", "created_at", "updated_at", "from_id", "to_id", "type", "inferred", "created_by", "gate", "gate_up_to" FROM `__hold_links`;
--> statement-breakpoint
DROP TABLE `__hold_links`;
--> statement-breakpoint
CREATE UNIQUE INDEX `links_pair_idx` ON `links` (`from_id`,`to_id`,`type`);
--> statement-breakpoint
CREATE INDEX `links_from_idx` ON `links` (`from_id`);
--> statement-breakpoint
CREATE INDEX `links_to_idx` ON `links` (`to_id`);
--> statement-breakpoint
CREATE INDEX `links_type_idx` ON `links` (`type`);
--> statement-breakpoint
INSERT INTO `reader_anchors`("workspace_id", "reader", "last_seen_at", "last_change_id") SELECT "workspace_id", "reader", "last_seen_at", "last_change_id" FROM `__hold_reader_anchors`;
--> statement-breakpoint
DROP TABLE `__hold_reader_anchors`;
