-- A LONG-POLL HOLD IS COUNTED ONCE AN HOUR, NOT STORED ONE ROW EACH. Criterion U6 of
-- design/settings/ACCEPTANCE.md.
--
-- A long-poll hold is no longer one row
-- each; it is counted by the hour. Measured on a live office on 13 September 2026: api_calls held
-- 4,474,962 rows, and five repeated
-- operations held 2,765,735 of them — worker.held 2,206,140, worker.waits 207,479, worker.wait-over
-- 175,876, handle.waiting 126,490 and handle.beat 49,750. That is most of the 1.41 GB database and
-- therefore most of each of its 131 full backups.
--
-- ONE TABLE, AND IT IS MEASURED. `hourly_calls` holds one row per hour, per listener and per
-- operation, and nothing written into it is authored work: the server counted requests it was
-- already answering. It is in `MEASURED_TABLES`, so an archive and a backup do not carry it, exactly
-- as they do not carry `header_only_calls` — the table criterion P83 added for the same shape of
-- problem. No row of `api_calls` is rewritten or deleted by this migration.
--
-- THE UNIQUE INDEX IS THE UPSERT'S CONFLICT TARGET, and every key column is NOT NULL with the empty
-- string standing for "nobody could read this" — a NULL is distinct in a SQLite unique index, so a
-- NULL listener would make one row per request instead of one row per hour. That is the rule
-- `header_only_calls` states in its own migration.
CREATE TABLE IF NOT EXISTS `hourly_calls` (
	`id` text PRIMARY KEY NOT NULL,
	`hour` text NOT NULL,
	`operation` text NOT NULL,
	`workspace_id` text NOT NULL,
	`listener` text NOT NULL,
	`calls` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `hourly_calls_operation_hour_idx` ON `hourly_calls` (`hour`, `operation`, `workspace_id`, `listener`);
