-- A PERMANENT RESIDENT SLEEPS, AND IS NAMED AFTER IT IS CONFIRMED.
--
-- The person's decisions madeUpnjzngw, madeUpkcznsw, madeUpeouljp and madeUpzmmrcz (3 October 2026).
-- src/server/lib/resident-sleep.ts and src/server/lib/residents.ts are the modules that read and write
-- what this file adds.
--
-- ---------------------------------------------------------------------------------------
-- 1. A SLEEP OR A POSTPONED SLEEP IS A ROW OF `resident_sleeps`
-- ---------------------------------------------------------------------------------------
--
-- A resident sleeps many times, and each sleep has a beginning, an end and who began it, so it is a
-- table. `what` is 'slept' or 'postponed'. A postponed sleep is one moment: its `ended_at` stays NULL,
-- and nothing reads it as an open sleep. A sleep's `ended_at` is NULL while the resident is asleep, and
-- it is written once, on waking. No row is deleted and nothing else is ever rewritten.
--
--   `because`      the reason given, or NULL because none was given.
--   `by_kind`, `by_id`   who pressed: the resident with its own key, or the person.
--   `session_id`   the session record the resident's key was used from, or NULL because nothing named one.
--
-- WHEN A RESIDENT SLEEPS IS NOT HERE. No schedule was decided, so this table holds only what was done.
--
-- ---------------------------------------------------------------------------------------
-- 2. THE PICTURE-AND-NAME REMINDER IS FOUR COLUMNS ON `agents`
-- ---------------------------------------------------------------------------------------
--
-- After the person confirms a resident, the person is reminded to choose a picture and a name for it.
-- The reminder is filed once, at the confirmation, and settled once, by one press. One fact per agent is
-- a column on the row that holds the agent, as the five residency columns of 0197 are.
--
--   `resident_naming_asked_at`                       when the confirmation filed the reminder, local time.
--                                                    NULL means no reminder was filed: every resident
--                                                    confirmed before this migration, which is why none
--                                                    of them is reminded now.
--   `resident_named_at`                              when the press settled it, local time. NULL means not yet.
--   `resident_named_by_kind`, `resident_named_by_id` who pressed.
--
-- ADDITIVE, AND IT WRITES NO VALUE. Four ALTER TABLE ADD COLUMN, one CREATE TABLE, its index, and no UPDATE.
ALTER TABLE `agents` ADD `resident_naming_asked_at` text;
--> statement-breakpoint
ALTER TABLE `agents` ADD `resident_named_at` text;
--> statement-breakpoint
ALTER TABLE `agents` ADD `resident_named_by_kind` text;
--> statement-breakpoint
ALTER TABLE `agents` ADD `resident_named_by_id` text;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `resident_sleeps` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_id` text NOT NULL,
	`what` text NOT NULL,
	`began_at` text NOT NULL,
	`ended_at` text,
	`because` text,
	`by_kind` text NOT NULL,
	`by_id` text NOT NULL,
	`session_id` text,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `resident_sleeps_agent_idx` ON `resident_sleeps` (`agent_id`,`began_at`);
