-- THE KEYS THE OFFICE HAS ISSUED, WHO CALLED WITH A CLAIM AND NO KEY, AND WHEN THE WINDOW WAS CLOSED.
--
-- Criterion P83, points 5 and 6. Two new tables and three new nullable columns on `installation`, and
-- no data is rewritten. One migration for the whole piece so there is one moment of risk rather than
-- six.
--
-- THE THREE COLUMNS WERE AMENDED IN PLACE on 13 September 2026, before this migration had been
-- applied anywhere: no database that matters had run it, so editing the file was safe. It is NOT safe
-- once a migration has run — src/server/db/migrate.ts stores each applied migration's hash and does
-- not compare it, so an edit to a migration that has already run changes nothing and never re-runs.
-- A later change to these columns is a new migration.
--
-- `held_keys` KEEPS ONLY THE SHA-256 OF AN AGENT'S KEY. The person's key and the office's own key are
-- not here; they live in the file beside the database that src/server/lib/keys.ts makes at first run.
-- A copy, a backup or an export therefore carries a hash and never a key, which is the owner's
-- decision `madeUpxxhozp` of 13 September 2026.
--
-- `header_only_calls` IS A SUMMARY AND NOT A QUERY OVER `api_calls`. That table is 4.43 million
-- rows and 88 per cent of a live office's database with no index on actor_id, so
-- the Settings list folds every header-only call into one row per caller per day here rather than
-- grouping over the whole request log. The empty string stands for an address or an origin the
-- server could not read, because NULL is distinct in a unique index and would make the upsert
-- duplicate.
CREATE TABLE IF NOT EXISTS `held_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`whose_kind` text NOT NULL,
	`whose_id` text NOT NULL,
	`key_hash` text NOT NULL,
	`made_at` text NOT NULL,
	`last_used_at` text,
	`revoked_at` text,
	`revoked_because` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `held_keys_hash_idx` ON `held_keys` (`key_hash`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `held_keys_whose_idx` ON `held_keys` (`whose_kind`, `whose_id`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `header_only_calls` (
	`id` text PRIMARY KEY NOT NULL,
	`day` text NOT NULL,
	`actor_type` text NOT NULL,
	`actor_id` text NOT NULL,
	`client_addr` text NOT NULL,
	`client_origin` text NOT NULL,
	`first_seen` integer NOT NULL,
	`last_seen` integer NOT NULL,
	`calls` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `header_only_calls_caller_idx` ON `header_only_calls` (`day`, `actor_type`, `actor_id`, `client_addr`, `client_origin`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `header_only_calls_day_idx` ON `header_only_calls` (`day`);--> statement-breakpoint
-- AND WHEN THE PERSON CLOSED THE ONE-VERSION WINDOW, AND WHO CLOSED IT. Criterion P83, point 6.
-- The office has one installation row, so the office-level fact of the window being shut lives on
-- it: the moment, and the who as the same kind-and-id pair trusted_machines stores in
-- `added_by_kind` and `added_by_id`. All three are nullable and nothing existing changes, so an open
-- window is the state of every database until the person closes it.
ALTER TABLE `installation` ADD COLUMN `window_closed_at` text;--> statement-breakpoint
ALTER TABLE `installation` ADD COLUMN `window_closed_by_kind` text;--> statement-breakpoint
ALTER TABLE `installation` ADD COLUMN `window_closed_by_id` text;
