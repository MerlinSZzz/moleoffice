-- THE RESOURCE LEASE COLUMN GOES, AND THE LEASE ROWS GO WITH IT.
--
-- The resource-lease design was withdrawn as
-- over-design: leases were met before any real need. The one check inside that design that did real
-- work — a directory with a live process in it is not removed — was lifted out first and lives on
-- its own in tools/live-processes.mjs, called by tools/the-inspector.mjs and tools/accept.mjs. What
-- the removal takes with it was measured and accepted:
-- the seven-day hold that made a third party's cleanup refuse to remove a world's database or free
-- its ports while the world was alive, and the thirty-day hold on a submitted worker area. The
-- replacement before a cleanup removes a database or frees a port is a check against the ledger,
-- written separately.
--
-- THE SECRETARY CONFIRMED THE COLUMN MAY BE DROPPED AND THE ROW DATA GOES WITH IT: every lease row
-- held a JSON copy of its own history inside the `lease` column, and nothing else in the database
-- points at a lease. 0147 added the column and nothing ever read it from outside the design that is
-- gone.
--
-- THE TABLE IS REBUILT THROUGH A HOLDING TABLE, the shape 0004 and 0111 use, because SQLite cannot
-- drop a column in place. The lease rows are EXCLUDED from the copy — which is a removal of rows the
-- owner has accepted on the record, not a rewrite of the rows that stay. Everything else comes back
-- exactly as it was: every column but `lease`, the two indexes (the live one stays PARTIAL on
-- `released_at IS NULL` — that partial WHERE is what lets a released port be registered honestly
-- again), and no trigger, for the table never had one.
--
-- THE NEW TABLE IS BARE, and that is allowed only because this file dropped it two statements
-- earlier: the shape is settled by construction. `IF NOT EXISTS` here would silently skip creating
-- the table and the INSERT after would refill the OLD shape while the migration reported success.
CREATE TABLE IF NOT EXISTS `session_resources_holding` (
	`id` text PRIMARY KEY,
	`workspace_id` text DEFAULT 'default' NOT NULL,
	`session_record_id` text NOT NULL,
	`type` text NOT NULL,
	`key` text NOT NULL,
	`pgid` integer,
	`os_started_at` text,
	`detail` text NOT NULL,
	`registered_at` text NOT NULL,
	`registered_by` text NOT NULL,
	`released_at` text,
	`released_by` text,
	`release_note` text,
	`world` text,
	`started_by_the_product` integer
);--> statement-breakpoint
INSERT INTO `session_resources_holding` (`id`, `workspace_id`, `session_record_id`, `type`, `key`, `pgid`, `os_started_at`, `detail`, `registered_at`, `registered_by`, `released_at`, `released_by`, `release_note`, `world`, `started_by_the_product`)
SELECT `id`, `workspace_id`, `session_record_id`, `type`, `key`, `pgid`, `os_started_at`, `detail`, `registered_at`, `registered_by`, `released_at`, `released_by`, `release_note`, `world`, `started_by_the_product`
FROM `session_resources` WHERE `type` != 'lease';--> statement-breakpoint
DROP TABLE `session_resources`;--> statement-breakpoint
CREATE TABLE `session_resources` (
	`id` text PRIMARY KEY,
	`workspace_id` text DEFAULT 'default' NOT NULL,
	`session_record_id` text NOT NULL,
	`type` text NOT NULL,
	`key` text NOT NULL,
	`pgid` integer,
	`os_started_at` text,
	`detail` text NOT NULL,
	`registered_at` text NOT NULL,
	`registered_by` text NOT NULL,
	`released_at` text,
	`released_by` text,
	`release_note` text,
	`world` text,
	`started_by_the_product` integer
);--> statement-breakpoint
INSERT INTO `session_resources` (`id`, `workspace_id`, `session_record_id`, `type`, `key`, `pgid`, `os_started_at`, `detail`, `registered_at`, `registered_by`, `released_at`, `released_by`, `release_note`, `world`, `started_by_the_product`)
SELECT `id`, `workspace_id`, `session_record_id`, `type`, `key`, `pgid`, `os_started_at`, `detail`, `registered_at`, `registered_by`, `released_at`, `released_by`, `release_note`, `world`, `started_by_the_product`
FROM `session_resources_holding`;--> statement-breakpoint
DROP TABLE `session_resources_holding`;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `session_resources_session_idx` ON `session_resources` (`session_record_id`);--> statement-breakpoint
-- PARTIAL, and the `WHERE` is the point: one LIVE row per resource. Once a row is released the
-- same port may honestly be taken again, so uniqueness applies only while `released_at` is null.
CREATE UNIQUE INDEX IF NOT EXISTS `session_resources_live_idx` ON `session_resources` (`workspace_id`,`session_record_id`,`type`,`key`) WHERE released_at IS NULL;
