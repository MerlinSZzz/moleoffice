-- A PERMANENT RESIDENT, AND THE PERSONAL SPACE THAT COMES WITH IT.
--
-- The secretary proposes, the owner confirms with one press, and the agent gets a folder of its own beside the
-- database, `personal-spaces/<agent id>/`. src/server/lib/residents.ts is the one module that reads
-- and writes what this file adds.
--
-- ---------------------------------------------------------------------------------------
-- 1. RESIDENCY IS FIVE COLUMNS ON `agents`, AND NOT A TABLE
-- ---------------------------------------------------------------------------------------
--
-- An agent is a resident once, from one confirmation, and stays one. One fact per agent is a column on
-- the row that already holds the agent, for the reason 0195 gives for `office_owner`: a table of its
-- own would be a second place to look for whether an agent is a resident.
--
--   `resident_since`          when the owner confirmed it, local time. NULL means not a resident.
--   `resident_proposal`       the `proposal` record the secretary filed.
--   `resident_decision`       the `decision` record the owner's press wrote, which settles that proposal.
--   `resident_confirmed_by_kind`, `resident_confirmed_by_id`
--                             who pressed Confirm: always a person, and the row says which.
--
-- The proposal and the decision are records, so their own history is in the change log. These columns
-- say only which two records made this agent a resident.
--
-- THE SUCCESSOR IS FOUR MORE COLUMNS, for the same reason. The owner names one successor with one
-- press once the resident is retired (answer 6), and the press is not repeated.
--
--   `successor_id`            the registry id of the agent the owner named. Taking the retired agent's
--                             handle does not make an agent its successor; only this column does.
--   `successor_named_at`, `successor_named_by_kind`, `successor_named_by_id`
--                             when the owner named it and who pressed.
--
-- ---------------------------------------------------------------------------------------
-- 2. LEAVE TO READ IS A TABLE, `resident_read_grants`
-- ---------------------------------------------------------------------------------------
--
-- A resident may give leave to many agents over time, and each grant has its own end date and may be
-- ended early by the resident or the owner (answer 5). Many rows per agent, each with who and when, is
-- a table. A grant is never deleted and never rewritten except to write when it was ended and by whom:
-- `ended_at` NULL means nobody ended it, and it still holds until `until`.
--
-- ---------------------------------------------------------------------------------------
-- 3. A VOID MARK IS A TABLE, `resident_void_marks`
-- ---------------------------------------------------------------------------------------
--
-- A wrong file is marked void with a reason and stays. The mark is about one
-- path in one space, and the file on disk is the resident's own bytes, so the mark cannot live in the
-- file. One mark per path: the unique index refuses a second mark on a path already marked.
--
-- ---------------------------------------------------------------------------------------
-- 4. EACH WRITE INTO A SPACE IS A ROW, `resident_space_writes`
-- ---------------------------------------------------------------------------------------
--
-- Every write is recorded with who and when. A file's modified time is not that record: any program on
-- this machine can change it. So each file the resident writes through the office's door is one row:
-- the path, its size, its sha256, when and by whom.
--
-- A WRITE MAY REPLACE A FILE, AND NOTHING IS DELETED BY IT. The resident keeps its memory short and
-- tidies it, so a path may be written again. Before it is, the office
-- keeps the old bytes as an earlier version, under the reserved `.versions/` folder in the same space,
-- and `replaced_version` names that version's path. So a path has one row per write, and the index on
-- (resident, path) is not unique. NULL `replaced_version` means the write made a new file.
--
-- ADDITIVE, AND IT WRITES NO VALUE. Nine ALTER TABLE ADD COLUMN, three CREATE TABLE, their indexes,
-- and no UPDATE.
ALTER TABLE `agents` ADD `resident_since` text;
--> statement-breakpoint
ALTER TABLE `agents` ADD `resident_proposal` text;
--> statement-breakpoint
ALTER TABLE `agents` ADD `resident_decision` text;
--> statement-breakpoint
ALTER TABLE `agents` ADD `resident_confirmed_by_kind` text;
--> statement-breakpoint
ALTER TABLE `agents` ADD `resident_confirmed_by_id` text;
--> statement-breakpoint
ALTER TABLE `agents` ADD `successor_id` text;
--> statement-breakpoint
ALTER TABLE `agents` ADD `successor_named_at` text;
--> statement-breakpoint
ALTER TABLE `agents` ADD `successor_named_by_kind` text;
--> statement-breakpoint
ALTER TABLE `agents` ADD `successor_named_by_id` text;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `resident_read_grants` (
	`id` text PRIMARY KEY NOT NULL,
	`resident_id` text NOT NULL,
	`reader_id` text NOT NULL,
	`until` text NOT NULL,
	`given_at` text NOT NULL,
	`given_by_kind` text NOT NULL,
	`given_by_id` text NOT NULL,
	`ended_at` text,
	`ended_by_kind` text,
	`ended_by_id` text,
	FOREIGN KEY (`resident_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reader_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `resident_read_grants_resident_idx` ON `resident_read_grants` (`resident_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `resident_read_grants_reader_idx` ON `resident_read_grants` (`reader_id`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `resident_void_marks` (
	`id` text PRIMARY KEY NOT NULL,
	`resident_id` text NOT NULL,
	`path` text NOT NULL,
	`because` text NOT NULL,
	`marked_at` text NOT NULL,
	`marked_by_kind` text NOT NULL,
	`marked_by_id` text NOT NULL,
	FOREIGN KEY (`resident_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `resident_void_marks_one_per_path` ON `resident_void_marks` (`resident_id`,`path`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `resident_space_writes` (
	`id` text PRIMARY KEY NOT NULL,
	`resident_id` text NOT NULL,
	`path` text NOT NULL,
	`bytes` integer NOT NULL,
	`sha256` text NOT NULL,
	`written_at` text NOT NULL,
	`written_by_kind` text NOT NULL,
	`written_by_id` text NOT NULL,
	`replaced_version` text,
	FOREIGN KEY (`resident_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `resident_space_writes_path_idx` ON `resident_space_writes` (`resident_id`,`path`);
