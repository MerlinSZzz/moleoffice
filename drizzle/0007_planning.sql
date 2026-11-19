-- Planning: when this person will spend real time on work that already exists.
--
-- ADDITIVE. Two new tables, no existing table touched, no row read or rewritten — so this is not an
-- exception under decision 13 and is not on the REBUILDS list in tests/migration.test.ts.
--
-- NEITHER TABLE HAS A `workspace_id`, AND THEY ARE THE ONLY TWO. That is a settled owner decision
-- rather than an oversight: a planning period is a person-level time-allocation overlay across
-- workspace-owned canonical work. A workspace answers which project owns the work; planning answers
-- when this person will allocate real time to it. One week may hold PanelX work, greenhouse work and
-- a dentist appointment at once, and that is not a merge — `record_id` names a record that stays in
-- its own project, no `links` row is involved, and an allocation carries no authority to read
-- anything. See `allocations` in src/server/db/schema.ts and explore.md.
--
-- `planned_hours` AND `actual_hours` ARE NULLABLE ON PURPOSE. Null means nobody said how long, which
-- is a different fact from zero and from the whole of the work. Nothing defaults them, here or
-- anywhere: an allocation whose hours were filled in from the record's estimate would put a
-- twenty-hour task into a Monday nobody promised twenty hours to.
--
-- There is no row in `planning_capacity` until somebody says how many hours a period holds, and an
-- absent row is not a full working week. A default capacity would report a week as fitting when the
-- truth is that nobody has looked.

CREATE TABLE IF NOT EXISTS `allocations` (
	`id` text PRIMARY KEY NOT NULL,
	`horizon` text NOT NULL,
	`period` text NOT NULL,
	`record_id` text NOT NULL,
	`planned_hours` real,
	`actual_hours` real,
	`state` text DEFAULT 'planned' NOT NULL,
	`note` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `allocations_period_idx` ON `allocations` (`horizon`,`period`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `allocations_record_idx` ON `allocations` (`record_id`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `planning_capacity` (
	`horizon` text NOT NULL,
	`period` text NOT NULL,
	`hours` real NOT NULL,
	`note` text,
	`updated_at` text NOT NULL,
	`updated_by` text NOT NULL,
	PRIMARY KEY(`horizon`, `period`)
);
