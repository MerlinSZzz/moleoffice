-- WHO TAKES PART, AND THE PICTURES THEY ARE DRAWN WITH. Four tables, nothing touched.
--
-- Criterion M2 and M3 of design/messages/ACCEPTANCE.md, part 2a. The people of this installation and
-- its durable agents are participants: each has a name, a short address, a picture and a state it
-- sets itself. A message will reference one by kind and id, and nothing else.
--
-- WHY THESE ARE TABLES AND NOT RECORD KINDS. A record belongs to a project. A person does not: the
-- owner is the same person in every project on this machine. A `person` record would be one row per
-- project saying the same thing, and a message addressed to them would have to name which copy. The
-- same argument holds for a durable agent, which already works across projects today.
--
-- NOTHING IS DELETED AND NOTHING IS REWRITTEN. The record kind `agent` stays exactly as it is, with
-- its inbox, its conversations and its work domains all still pointing at the record's id.
-- `agent_records` is the join that says which registry row each of those records is, and the data
-- migration `migrateParticipants` in src/server/db/participants-migration.ts is what fills it. That
-- step also writes the one owner row this version holds and the picture drawn for it.
--
-- WHY THE MAPPING IS A TABLE RATHER THAN A COLUMN ON `records`. Every file in this folder is held to
-- one rule by tests/migration.test.ts: it may not drop, rename, retype or rewrite anything. A column
-- added to `records` would have to be filled by rewriting stored rows, which is the one thing a
-- migration here may not do. A separate table is filled by writing new rows, so the rule holds.
--
-- SAFE TO RUN TWICE. Every statement carries IF NOT EXISTS, so a second run creates nothing, and the
-- data step that fills these tables is written to do nothing when it has already run.
--
-- `assets` FIRST, because a person row and an agent row each name one of its rows and the foreign
-- keys below have to resolve as they are created.

CREATE TABLE IF NOT EXISTS `assets` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`origin` text NOT NULL,
	`path` text,
	`mime` text NOT NULL,
	`bytes` integer,
	`created_at` text NOT NULL,
	`created_by_kind` text,
	`created_by_id` text,
	`licence_source` text
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `assets_origin_idx` ON `assets` (`origin`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `people` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`handle` text NOT NULL,
	`avatar_asset_id` text NOT NULL,
	`state` text,
	`state_at` text,
	`created_at` text NOT NULL,
	`created_by_kind` text,
	`created_by_id` text,
	FOREIGN KEY (`avatar_asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `people_handle_idx` ON `people` (`handle`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `agents` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`handle` text NOT NULL,
	`avatar_asset_id` text NOT NULL,
	`state` text,
	`state_at` text,
	`runtime` text,
	`retired` integer DEFAULT 0 NOT NULL,
	`retired_because` text,
	`created_at` text NOT NULL,
	`created_by_kind` text,
	`created_by_id` text,
	FOREIGN KEY (`avatar_asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `agents_handle_idx` ON `agents` (`handle`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `agent_records` (
	`record_id` text PRIMARY KEY NOT NULL,
	`agent_id` text NOT NULL,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `agent_records_agent_idx` ON `agent_records` (`agent_id`);
