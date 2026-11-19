-- Every table and column round ten needs, in one file, with no authored row moved.
--
-- ELEVEN NEW TABLES, FOURTEEN NEW COLUMNS, ONE NEW INDEX, AND THREE DERIVED TABLES RE-KEYED. It is
-- one file because it is one window: applying it takes the owner's server down, since a server
-- refuses to serve a corpus that holds work while a migration is pending. Two windows would take it
-- down twice for one round.
--
-- ---------------------------------------------------------------------------------------
-- WHAT `npm run db:generate` EMITTED, AND WHY THIS FILE IS NOT THAT TEXT
-- ---------------------------------------------------------------------------------------
--
-- The journal entry and drizzle/meta/0111_snapshot.json ARE generated and are drizzle's own: the
-- migrator applies the entries in drizzle/meta/_journal.json, so a hand-numbered file with no
-- journal entry is invisible and its tables would never be created. That half is machine-written and
-- was not touched.
--
-- The `.sql` had to be written by hand, and the reason is worth knowing before the next person runs
-- the command. drizzle-kit writes a migration by comparing schema.ts against the newest SNAPSHOT in
-- drizzle/meta, and this repository has snapshots only up to 0006: migrations 0007 to 0110 were
-- written by hand with hand-made journal entries and left no snapshot behind. So the emitted file
-- was the difference between the schema and the database as it stood on 12 August — it created
-- `agent_messages`, `agent_runs`, `revisions`, `reviews`, the planning tables and more, all of which
-- already exist, and it re-created `records_title_idx`, which migration 0030 already changed.
--
-- APPLYING THAT WOULD HAVE BEEN SILENT AND WRONG, not loud and wrong. The rule in this folder is
-- that a hand-edited migration gets `IF NOT EXISTS` added to every CREATE, and `CREATE TABLE IF NOT
-- EXISTS agent_messages` against the table that is already there does NOTHING AT ALL — so the ten
-- new columns on it would never have been added, on a migration that reported success.
--
-- So this file is the real difference: what a database at 0110 does not yet have. The snapshot beside
-- it describes the schema this brings a database to, which is correct and is what the NEXT
-- `db:generate` will diff against. That repairs the chain from here on.
--
-- ---------------------------------------------------------------------------------------
-- THE THREE DERIVED TABLES ARE REBUILT, AND EVERY ROW COMES BACK
-- ---------------------------------------------------------------------------------------
--
-- `source_files`, `source_index` and `source_file_hashes` gain `repository_id` and it goes INTO THE
-- KEY, because two repositories may both hold `src/index.ts` and the old key would have let the
-- second one overwrite the first one's row with nothing saying so. SQLite cannot change a primary
-- key, so the table has to be rebuilt. This is the one thing in this file that could lose rows, and
-- it does not: every row is held aside, the table is remade, and every row goes back.
--
-- THE COLUMN IS NULLABLE AND EVERY EXISTING ROW GETS NULL, which has one stated meaning:
-- this row was written before repositories had ids, by the one process that scans one root.
-- `file_observations.repository_id`, created above, carries the same word for the same reason.
-- NOTHING IN THE PRODUCT CAN FILL IT YET — a repository is registered by a person or an agent, and
-- the rows that first create them read `source_index.root` in a later step — so the honest value is
-- "nobody has said" rather than an id nobody minted. The alternative was to drop the rows, which
-- would have been defensible, since every one of them is the output of a scan of this machine's
-- files and the next rebuild writes them all again. It is not what this file does: emptying the
-- index would have left every read that needs it answering "nothing has been scanned" for as long as
-- it took somebody to notice, and there was no need to.
--
-- WHAT NULL COSTS, SAID RATHER THAN DISCOVERED. SQLite does not enforce uniqueness across key
-- columns that are NULL, so while these rows carry NULL the new key is not a constraint on them. It
-- cannot bite today: one server points at one checkout, and a rebuild deletes every row of the
-- workspace before it writes. The key starts being a constraint the moment real ids arrive.
--
-- NO `ALTER TABLE ... RENAME` ANYWHERE, which is what drizzle-kit emits for a rebuild. 0004 gives
-- the reason in full: a rename re-parses the whole schema, and between the DROP and the RENAME
-- another table's REFERENCES clause names a table that does not exist for that instant. The rows go
-- through a holding table instead, exactly as 0004 does, which costs one more pass over rows that
-- are already in memory and has no such moment.
--
-- WHY THE `CREATE TABLE` STATEMENTS AT THE FOOT ARE BARE, against the rule that every hand-edited
-- migration in this folder adds `IF NOT EXISTS`. Each is preceded by the DROP of the table it
-- recreates, so the table is guaranteed absent, and the guard would be worse than pointless: if one
-- of these somehow survived, `IF NOT EXISTS` would silently skip creating it and the INSERT below
-- would refill the OLD shape while the migration reported success. Bare is the loud version.
-- 0004 made the same argument and tests/migration.test.ts encodes the exception for both.
--
-- ---------------------------------------------------------------------------------------
-- WHAT THIS FILE DELIBERATELY DOES NOT CREATE
-- ---------------------------------------------------------------------------------------
--
-- `CREATE UNIQUE INDEX reviews_one_global_collecting ON reviews (workspace_id) WHERE reach =
-- 'global' AND state = 'collecting'`. Two project-wide reviews collecting at once is a state worth
-- being unable to reach, and that index is what makes it unreachable — but it must be created AFTER
-- the step that sets `reach`, never before. Created here it would be satisfied by a corpus where
-- nothing is `global` yet, and the loud failure it is bought for could never happen. It is raw SQL
-- inside that later step, and tests/schema-tables.test.ts names it as the one declared exception
-- when it compares schema.ts's index set with the database's, so this omission cannot be mistaken
-- for drift and a later `db:generate` cannot re-emit it silently.
--
-- NO `DROP COLUMN` ANYWHERE, and nothing here rewrites a value. Every new column is nullable except
-- `reviews.reach`, which is NOT NULL with a default of `local` — the word every review in this
-- product already was, so no review starts reading differently the moment this runs.

CREATE TABLE IF NOT EXISTS `repositories` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`name` text NOT NULL,
	`note` text,
	`root` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `repositories_name_idx` ON `repositories` (`workspace_id`,`name`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `implementation_revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`repository_id` text NOT NULL,
	`ref` text NOT NULL,
	`label` text,
	`note` text,
	`stated_at` text NOT NULL,
	`stated_by` text NOT NULL,
	FOREIGN KEY (`repository_id`) REFERENCES `repositories`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `implementation_revisions_ref_idx` ON `implementation_revisions` (`workspace_id`,`repository_id`,`ref`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `implementation_map` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`record_id` text NOT NULL,
	`repository_id` text NOT NULL,
	`pattern` text NOT NULL,
	`relation` text NOT NULL,
	`provenance` text NOT NULL,
	`note` text,
	`revision_id` text,
	`stated_at` text NOT NULL,
	`stated_by` text NOT NULL,
	`accepted_at` text,
	`accepted_by` text,
	`deleted_at` text,
	FOREIGN KEY (`record_id`) REFERENCES `records`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`repository_id`) REFERENCES `repositories`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`revision_id`) REFERENCES `implementation_revisions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `implementation_map_record_idx` ON `implementation_map` (`workspace_id`,`record_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `implementation_map_repo_idx` ON `implementation_map` (`workspace_id`,`repository_id`);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `implementation_map_one_idx` ON `implementation_map` (`workspace_id`,`record_id`,`repository_id`,`pattern`,`relation`,`provenance`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `implementation_findings` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`record_id` text NOT NULL,
	`repository_id` text NOT NULL,
	`path` text NOT NULL,
	`relation` text NOT NULL,
	`provenance` text NOT NULL,
	`evidence_path` text NOT NULL,
	`evidence_detail` text NOT NULL,
	`built_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `implementation_findings_record_idx` ON `implementation_findings` (`workspace_id`,`record_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `implementation_findings_path_idx` ON `implementation_findings` (`workspace_id`,`repository_id`,`path`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `file_observations` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`scan_id` text NOT NULL,
	`repository_id` text,
	`path` text NOT NULL,
	`change` text NOT NULL,
	`hash` text,
	`seen_at` text NOT NULL,
	`since` text,
	`first_scan` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `file_observations_when_idx` ON `file_observations` (`workspace_id`,`seen_at`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `file_observations_path_idx` ON `file_observations` (`workspace_id`,`path`,`seen_at`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `revalidations` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text,
	`restriction_id` text NOT NULL,
	`record_id` text NOT NULL,
	`reached_by` text NOT NULL,
	`distance` integer NOT NULL,
	`written_by` text NOT NULL,
	`at` text NOT NULL,
	`state` text NOT NULL,
	`decided_by` text,
	`call_id` text,
	`decided_at` text,
	`note` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `revalidations_pair_idx` ON `revalidations` (`restriction_id`,`record_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `revalidations_record_idx` ON `revalidations` (`record_id`,`state`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `revalidations_workspace_idx` ON `revalidations` (`workspace_id`,`state`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `annotation_words_fixed` (
	`annotation_id` text PRIMARY KEY NOT NULL,
	`fixed_at` text NOT NULL,
	`because` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `api_calls` (
	`id` text PRIMARY KEY NOT NULL,
	`at_ms` integer NOT NULL,
	`operation` text,
	`effect` text,
	`route` text,
	`method` text NOT NULL,
	`waits` integer DEFAULT 0 NOT NULL,
	`status` integer NOT NULL,
	`ms` real NOT NULL,
	`bytes` integer,
	`list_len` integer,
	`workspace_id` text,
	`workspace_stated` integer,
	`actor_type` text,
	`actor_id` text,
	`session_id` text,
	`identity_source` text NOT NULL,
	`trace_id` text,
	`purpose` text,
	`target_id` text,
	`target_kind` text,
	`client_addr` text,
	`client_origin` text
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `api_calls_at_idx` ON `api_calls` (`at_ms`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `api_calls_trace_idx` ON `api_calls` (`trace_id`,`at_ms`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `api_calls_operation_idx` ON `api_calls` (`operation`,`at_ms`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `outside_reads` (
	`id` text PRIMARY KEY NOT NULL,
	`at_ms` integer NOT NULL,
	`trace_id` text,
	`workspace_id` text,
	`workspace_stated` integer,
	`actor_type` text,
	`actor_id` text,
	`session_id` text,
	`source` text NOT NULL,
	`what` text NOT NULL,
	`wanted` text NOT NULL,
	`wanted_other` text,
	`verdict` text NOT NULL,
	`call_id` text
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `outside_reads_trace_idx` ON `outside_reads` (`trace_id`,`at_ms`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `outside_reads_wanted_idx` ON `outside_reads` (`wanted`,`at_ms`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `usage_stretches` (
	`id` text PRIMARY KEY NOT NULL,
	`trace_id` text NOT NULL,
	`stretch_seq` integer NOT NULL,
	`purpose` text,
	`started_ms` integer NOT NULL,
	`ended_ms` integer NOT NULL,
	`ended_because` text NOT NULL,
	`actor_type` text,
	`actor_id` text,
	`session_id` text,
	`workspace_id` text,
	`local_calls` integer NOT NULL,
	`remote_calls` integer NOT NULL,
	`unknown_calls` integer NOT NULL,
	`calls` integer NOT NULL,
	`reads` integer NOT NULL,
	`writes` integer NOT NULL,
	`refused` integer NOT NULL,
	`failed` integer NOT NULL,
	`bytes` integer NOT NULL,
	`ms_total` real NOT NULL,
	`distinct_operations` integer NOT NULL,
	`outside_reads` integer NOT NULL,
	`gap_verdicts` integer NOT NULL,
	`then_wrote` text NOT NULL,
	`per_operation` text NOT NULL,
	`per_question` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `usage_checks` (
	`id` text PRIMARY KEY NOT NULL,
	`at_ms` integer NOT NULL,
	`call_id` text,
	`trace_id` text,
	`check_id` text NOT NULL,
	`passed` integer,
	`left_n` integer,
	`right_n` integer
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `usage_checks_trace_idx` ON `usage_checks` (`trace_id`,`at_ms`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `usage_checks_check_idx` ON `usage_checks` (`check_id`,`at_ms`);--> statement-breakpoint
ALTER TABLE `links` ADD `carries` text;--> statement-breakpoint
ALTER TABLE `reviews` ADD `reach` text DEFAULT 'local' NOT NULL;--> statement-breakpoint
ALTER TABLE `reviews` ADD `started_by_agent` text;--> statement-breakpoint
ALTER TABLE `agent_messages` ADD `state_at` text;--> statement-breakpoint
ALTER TABLE `agent_messages` ADD `sent_at` text;--> statement-breakpoint
ALTER TABLE `agent_messages` ADD `recipient_agent_id` text;--> statement-breakpoint
ALTER TABLE `agent_messages` ADD `taken_by_agent_id` text;--> statement-breakpoint
ALTER TABLE `agent_messages` ADD `taken_at` text;--> statement-breakpoint
ALTER TABLE `agent_messages` ADD `failed_because` text;--> statement-breakpoint
ALTER TABLE `agent_messages` ADD `handled_note` text;--> statement-breakpoint
ALTER TABLE `agent_messages` ADD `handled_by_session` text;--> statement-breakpoint
ALTER TABLE `agent_messages` ADD `written_by_agent_id` text;--> statement-breakpoint
ALTER TABLE `agent_messages` ADD `coordination` text;--> statement-breakpoint
ALTER TABLE `agent_runs` ADD `agent_id` text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `agent_messages_inbox_idx` ON `agent_messages` (`recipient_agent_id`,`state`);--> statement-breakpoint
-- AND ONE INDEX THAT ALREADY EXISTS EVERYWHERE, WHICH IS WHY THIS STATEMENT DOES NOTHING.
-- `drizzle/0050_who_a_message_is_for.sql` created `agent_runs_recipient_idx` and schema.ts never
-- declared it, so the schema and every database disagreed about what indexes exist and nothing said
-- so. tests/schema-tables.test.ts now compares the two sets and found it. The declaration is added
-- in the same commit as this file; the statement is here so that this file and the snapshot beside
-- it describe the same database, and it is a no-op on every database that exists.
CREATE INDEX IF NOT EXISTS `agent_runs_recipient_idx` ON `agent_runs` (`recipient_session_id`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `__hold_source_file_hashes` (
	`workspace_id` text,
	`path` text,
	`hash` text,
	`built_at` text
);
--> statement-breakpoint
INSERT INTO `__hold_source_file_hashes` (`workspace_id`, `path`, `hash`, `built_at`) SELECT `workspace_id`, `path`, `hash`, `built_at` FROM `source_file_hashes`;--> statement-breakpoint
DROP TABLE `source_file_hashes`;--> statement-breakpoint
CREATE TABLE `source_file_hashes` (
	`workspace_id` text DEFAULT 'default' NOT NULL,
	`repository_id` text,
	`path` text NOT NULL,
	`hash` text NOT NULL,
	`built_at` text NOT NULL,
	PRIMARY KEY(`workspace_id`, `repository_id`, `path`)
);
--> statement-breakpoint
INSERT INTO `source_file_hashes` (`workspace_id`, `repository_id`, `path`, `hash`, `built_at`) SELECT `workspace_id`, NULL, `path`, `hash`, `built_at` FROM `__hold_source_file_hashes`;--> statement-breakpoint
DROP TABLE `__hold_source_file_hashes`;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `__hold_source_files` (
	`workspace_id` text,
	`path` text,
	`language` text,
	`size_bytes` integer,
	`lines` integer,
	`imports` text,
	`exports` text,
	`modified_at` text
);
--> statement-breakpoint
INSERT INTO `__hold_source_files` (`workspace_id`, `path`, `language`, `size_bytes`, `lines`, `imports`, `exports`, `modified_at`) SELECT `workspace_id`, `path`, `language`, `size_bytes`, `lines`, `imports`, `exports`, `modified_at` FROM `source_files`;--> statement-breakpoint
DROP TABLE `source_files`;--> statement-breakpoint
CREATE TABLE `source_files` (
	`workspace_id` text DEFAULT 'default' NOT NULL,
	`repository_id` text,
	`path` text NOT NULL,
	`language` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`lines` integer NOT NULL,
	`imports` text NOT NULL,
	`exports` text NOT NULL,
	`modified_at` text NOT NULL,
	PRIMARY KEY(`workspace_id`, `repository_id`, `path`)
);
--> statement-breakpoint
INSERT INTO `source_files` (`workspace_id`, `repository_id`, `path`, `language`, `size_bytes`, `lines`, `imports`, `exports`, `modified_at`) SELECT `workspace_id`, NULL, `path`, `language`, `size_bytes`, `lines`, `imports`, `exports`, `modified_at` FROM `__hold_source_files`;--> statement-breakpoint
DROP TABLE `__hold_source_files`;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `__hold_source_index` (
	`workspace_id` text,
	`built_at` text,
	`built_by` text,
	`root` text,
	`scan_ms` integer,
	`skipped` text
);
--> statement-breakpoint
INSERT INTO `__hold_source_index` (`workspace_id`, `built_at`, `built_by`, `root`, `scan_ms`, `skipped`) SELECT `workspace_id`, `built_at`, `built_by`, `root`, `scan_ms`, `skipped` FROM `source_index`;--> statement-breakpoint
DROP TABLE `source_index`;--> statement-breakpoint
CREATE TABLE `source_index` (
	`workspace_id` text DEFAULT 'default',
	`repository_id` text,
	`built_at` text NOT NULL,
	`built_by` text NOT NULL,
	`root` text NOT NULL,
	`scan_ms` integer NOT NULL,
	`skipped` text NOT NULL,
	PRIMARY KEY(`workspace_id`, `repository_id`)
);
--> statement-breakpoint
INSERT INTO `source_index` (`workspace_id`, `repository_id`, `built_at`, `built_by`, `root`, `scan_ms`, `skipped`) SELECT `workspace_id`, NULL, `built_at`, `built_by`, `root`, `scan_ms`, `skipped` FROM `__hold_source_index`;--> statement-breakpoint
DROP TABLE `__hold_source_index`;
