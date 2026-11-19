-- THE OWNER COMES FROM THE INSTALLER, NOT FROM THE CODE.
--
-- A fresh office writes no built-in person (FLO-14, FLO-16, FLO-17). Who owns an office
-- is a setting stored in its own database, written at the first migrate from MOLE_OFFICE_OWNER_ID and
-- MOLE_OFFICE_OWNER_NAME, and read by one module, src/server/lib/owner.ts. This file does two things
-- and writes no data row.
--
-- ---------------------------------------------------------------------------------------
-- 1. `people.office_owner`: WHICH PERSON OWNS THIS OFFICE, AND WHERE THEIR NAME CAME FROM
-- ---------------------------------------------------------------------------------------
--
-- A COLUMN ON `people` AND NOT A TABLE OF ITS OWN, for the reason 0188 and 0191 give: a table of its
-- own would be a place for any future setting to go, which is the sixth rule of CLAUDE.md. The owner
-- is a person, and the person already has a row; the setting is a mark on that row.
--
-- NULL means this person is not the office's owner. The three words it may hold are declared once in
-- src/server/db/owner-setting.ts:
--   `unnamed`                 the owner, and nobody has given their name yet. The row's `name` holds
--                             the placeholder "default office owner name", so every place that draws
--                             the name shows the placeholder, and GET /api/office/owner answers
--                             name: null.
--   `named-by-the-installer`  the name came from MOLE_OFFICE_OWNER_NAME at the first migrate.
--   `named-by-the-person`     the person gave it in their own browser, through POST /api/office/owner.
-- There is no CHECK constraint, for the reason `send_key` gives in 0188.
--
-- AT MOST ONE ROW CARRIES THE MARK. The unique index below is on a constant over the rows that carry
-- it, so a second owner is refused by the database itself.
--
-- ---------------------------------------------------------------------------------------
-- 2. THE THREE OWNER-ID COLUMN DEFAULTS GO
-- ---------------------------------------------------------------------------------------
--
-- `records.owner_id`, `links.owner_id` and `links.created_by` carried a DEFAULT since 0000 that
-- was the owner's own id, written into the schema of every office. Every writer already passes the value
-- itself; after this, forgetting it fails NOT NULL instead of filing the row under the owner.
--
-- SQLite cannot drop a default without rebuilding the table, so `records` and `links` are rebuilt,
-- the way 0004 rebuilt them, and for the reasons 0004 gives at length: the rebuild is ordered to be
-- correct with foreign keys ON (drizzle's migrator runs inside one transaction, where
-- `PRAGMA foreign_keys` does nothing), and there is no `ALTER TABLE ... RENAME`.
--
-- THE ORDER. Three tables point at `records.id`: `links`, `message_delivery` and
-- `implementation_map`. Dropping a parent while a child row points into it is the violation, so:
--   1. `links` rows move to a holding table and `links` is dropped.
--   2. `message_delivery` and `implementation_map` rows move to holding tables and are deleted. The
--      two TABLES are not touched: they need no repair.
--   3. `records` is now childless and is rebuilt through a holding table.
--   4. Its indexes come back, then its three triggers. The triggers come back AFTER the rows, so the
--      `submission_run_baseline` trigger does not fire for rows that are only being copied back.
--   5. `links` is created in its new shape with its indexes, and its rows come back.
--   6. The `message_delivery` and `implementation_map` rows come back.
--
-- EVERY ROW KEEPS ITS ROWID. Several readers order by `created_at, rowid` (the merge queue, the
-- summons, the messages), so each holding table carries the rowid and each row is put back with it.
-- Nothing below changes a value: every INSERT names its columns on both sides. The row counts are
-- compared before and after by src/server/db/migrate.ts.
--
-- THE OLD MIGRATION FILES ARE LEFT BYTE FOR BYTE (FLO-17): rewriting a migration an office has
-- already applied would break that office's journal.
--
-- A RENUMBER IS A FILE NAME AND A JOURNAL LINE. Nothing in this file or in the code names its number.
ALTER TABLE `people` ADD `office_owner` text;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `people_one_office_owner` ON `people` ((1)) WHERE `office_owner` IS NOT NULL;
--> statement-breakpoint
-- THE TWO COLUMNS THE MIGRATION `a_link_says_who_made_it_and_what_its_stage_is` ADDED TO `links`
-- (created_by_type and gate_up_to_sort) are carried through the rebuild, at the end where its ALTER put
-- them. That migration landed before this one was renumbered after it on 1 October 2026; without them
-- the rebuild would have dropped both columns and their values.
CREATE TABLE `__hold_links` (
	`__rowid` integer,
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
	`gate_up_to` text,
	`carries` text,
	`created_by_type` text,
	`gate_up_to_sort` text
);
--> statement-breakpoint
INSERT INTO `__hold_links`("__rowid", "id", "workspace_id", "owner_id", "created_at", "updated_at", "from_id", "to_id", "type", "inferred", "created_by", "gate", "gate_up_to", "carries", "created_by_type", "gate_up_to_sort") SELECT rowid, "id", "workspace_id", "owner_id", "created_at", "updated_at", "from_id", "to_id", "type", "inferred", "created_by", "gate", "gate_up_to", "carries", "created_by_type", "gate_up_to_sort" FROM `links`;
--> statement-breakpoint
DROP TABLE `links`;
--> statement-breakpoint
CREATE TABLE `__hold_message_delivery` (
	`__rowid` integer,
	`id` text,
	`message_id` text,
	`recipient_kind` text,
	`recipient_id` text,
	`mark` text,
	`at` text,
	`because` text,
	`run` text,
	`inferred_by` text
);
--> statement-breakpoint
INSERT INTO `__hold_message_delivery`("__rowid", "id", "message_id", "recipient_kind", "recipient_id", "mark", "at", "because", "run", "inferred_by") SELECT rowid, "id", "message_id", "recipient_kind", "recipient_id", "mark", "at", "because", "run", "inferred_by" FROM `message_delivery`;
--> statement-breakpoint
DELETE FROM `message_delivery`;
--> statement-breakpoint
CREATE TABLE `__hold_implementation_map` (
	`__rowid` integer,
	`id` text,
	`workspace_id` text,
	`record_id` text,
	`repository_id` text,
	`pattern` text,
	`relation` text,
	`provenance` text,
	`note` text,
	`revision_id` text,
	`stated_at` text,
	`stated_by` text,
	`accepted_at` text,
	`accepted_by` text,
	`deleted_at` text
);
--> statement-breakpoint
INSERT INTO `__hold_implementation_map`("__rowid", "id", "workspace_id", "record_id", "repository_id", "pattern", "relation", "provenance", "note", "revision_id", "stated_at", "stated_by", "accepted_at", "accepted_by", "deleted_at") SELECT rowid, "id", "workspace_id", "record_id", "repository_id", "pattern", "relation", "provenance", "note", "revision_id", "stated_at", "stated_by", "accepted_at", "accepted_by", "deleted_at" FROM `implementation_map`;
--> statement-breakpoint
DELETE FROM `implementation_map`;
--> statement-breakpoint
CREATE TABLE `__hold_records` (
	`__rowid` integer,
	`id` text,
	`workspace_id` text,
	`owner_id` text,
	`created_at` text,
	`updated_at` text,
	`kind` text,
	`title` text,
	`summary` text,
	`data` text,
	`deleted_at` text,
	`origin` text
);
--> statement-breakpoint
INSERT INTO `__hold_records`("__rowid", "id", "workspace_id", "owner_id", "created_at", "updated_at", "kind", "title", "summary", "data", "deleted_at", "origin") SELECT rowid, "id", "workspace_id", "owner_id", "created_at", "updated_at", "kind", "title", "summary", "data", "deleted_at", "origin" FROM `records`;
--> statement-breakpoint
DROP TABLE `records`;
--> statement-breakpoint
CREATE TABLE `records` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text DEFAULT 'default' NOT NULL,
	`owner_id` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`summary` text,
	`data` text DEFAULT '{}' NOT NULL,
	`deleted_at` text,
	`origin` text
);
--> statement-breakpoint
INSERT INTO `records`(rowid, "id", "workspace_id", "owner_id", "created_at", "updated_at", "kind", "title", "summary", "data", "deleted_at", "origin") SELECT "__rowid", "id", "workspace_id", "owner_id", "created_at", "updated_at", "kind", "title", "summary", "data", "deleted_at", "origin" FROM `__hold_records` ORDER BY "__rowid";
--> statement-breakpoint
DROP TABLE `__hold_records`;
--> statement-breakpoint
CREATE INDEX `records_kind_idx` ON `records` (`kind`);
--> statement-breakpoint
CREATE INDEX `records_live_idx` ON `records` (`workspace_id`,`deleted_at`);
--> statement-breakpoint
CREATE INDEX `records_updated_idx` ON `records` (`updated_at`);
--> statement-breakpoint
CREATE INDEX `records_title_idx` ON `records` (`workspace_id`,`title`);
--> statement-breakpoint
CREATE UNIQUE INDEX `records_one_merge_entry_per_lane` ON `records` (json_extract(`data`, '$.occupies')) WHERE `kind` = 'merge_entry' AND `deleted_at` IS NULL AND json_extract(`data`, '$.occupies') IS NOT NULL;
--> statement-breakpoint
CREATE TRIGGER sealed_tip_no_update BEFORE UPDATE ON records WHEN OLD.kind = 'sealed_tip' BEGIN SELECT RAISE(ABORT, 'A sealed tip is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER sealed_tip_no_delete BEFORE DELETE ON records WHEN OLD.kind = 'sealed_tip' BEGIN SELECT RAISE(ABORT, 'A sealed tip is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER submission_run_baseline AFTER INSERT ON records WHEN NEW.kind = 'session' BEGIN INSERT INTO submission_baselines VALUES (NEW.id, (SELECT COALESCE(MAX(rowid),0) FROM revisions), 'live'); END;
--> statement-breakpoint
CREATE TABLE `links` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text DEFAULT 'default' NOT NULL,
	`owner_id` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`from_id` text NOT NULL,
	`to_id` text NOT NULL,
	`type` text NOT NULL,
	`inferred` integer DEFAULT false NOT NULL,
	`created_by` text NOT NULL,
	`gate` text,
	`gate_up_to` text,
	`carries` text,
	`created_by_type` text,
	`gate_up_to_sort` text,
	FOREIGN KEY (`from_id`) REFERENCES `records`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`to_id`) REFERENCES `records`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `links_pair_idx` ON `links` (`from_id`,`to_id`,`type`);
--> statement-breakpoint
CREATE INDEX `links_from_idx` ON `links` (`from_id`);
--> statement-breakpoint
CREATE INDEX `links_to_idx` ON `links` (`to_id`);
--> statement-breakpoint
CREATE INDEX `links_type_idx` ON `links` (`type`);
--> statement-breakpoint
INSERT INTO `links`(rowid, "id", "workspace_id", "owner_id", "created_at", "updated_at", "from_id", "to_id", "type", "inferred", "created_by", "gate", "gate_up_to", "carries", "created_by_type", "gate_up_to_sort") SELECT "__rowid", "id", "workspace_id", "owner_id", "created_at", "updated_at", "from_id", "to_id", "type", "inferred", "created_by", "gate", "gate_up_to", "carries", "created_by_type", "gate_up_to_sort" FROM `__hold_links` ORDER BY "__rowid";
--> statement-breakpoint
DROP TABLE `__hold_links`;
--> statement-breakpoint
INSERT INTO `message_delivery`(rowid, "id", "message_id", "recipient_kind", "recipient_id", "mark", "at", "because", "run", "inferred_by") SELECT "__rowid", "id", "message_id", "recipient_kind", "recipient_id", "mark", "at", "because", "run", "inferred_by" FROM `__hold_message_delivery` ORDER BY "__rowid";
--> statement-breakpoint
DROP TABLE `__hold_message_delivery`;
--> statement-breakpoint
INSERT INTO `implementation_map`(rowid, "id", "workspace_id", "record_id", "repository_id", "pattern", "relation", "provenance", "note", "revision_id", "stated_at", "stated_by", "accepted_at", "accepted_by", "deleted_at") SELECT "__rowid", "id", "workspace_id", "record_id", "repository_id", "pattern", "relation", "provenance", "note", "revision_id", "stated_at", "stated_by", "accepted_at", "accepted_by", "deleted_at" FROM `__hold_implementation_map` ORDER BY "__rowid";
--> statement-breakpoint
DROP TABLE `__hold_implementation_map`;
