-- Plans: a document somebody writes, stored as the lines they wrote.
--
-- ADDITIVE. Two new tables, one new nullable column on `allocations`, and NOT ONE EXISTING ROW IS
-- READ OR REWRITTEN. Every table this database already had holds exactly what it held before.
--
-- WHY THERE ARE TWO TABLES AND NOT ONE MORE COLUMN ON `planning_drafts`. A plan line may carry the
-- id of the record it was filed as, and a draft's single `body` column has nowhere to put one. The
-- alternative was typing the id into the text, where deleting one character breaks the link with
-- nothing failing and puts a record id on a person's screen.
--
-- NEITHER TABLE HAS A `workspace_id`, and that is settled rather than forgotten. A plan spans
-- projects — one week of thinking is greenhouse work and PanelX work and a deadline — while every
-- record belongs to exactly one project. So a plan cannot be a record, and forcing it into one
-- project would make it false about what it is. `PERSON_LEVEL_TABLES` in src/server/db/schema.ts is
-- the list of tables in that position, and it is computed rather than written out, so these two
-- join it by having no workspace column.
--
-- WHAT THIS MIGRATION DELIBERATELY DOES NOT DO: it does not move the existing `planning_drafts`
-- rows into `plans`. Moving them means emptying `planning_drafts`, and the routes that read and
-- write that table are still served — GET/POST/PATCH/DELETE /api/planning/drafts — so the words
-- would exist in two places at once and either copy could be edited without the other changing.
-- The move belongs in the same change as the removal of those routes, in one migration, so that at
-- no moment is a draft stored twice. `linesOfBody` and `bodyOfLines` in src/shared/plandoc.ts are
-- the rule that move will follow, and tests/plandoc.test.ts proves a body survives the round trip
-- exactly, blank lines, trailing spaces and tables included.

CREATE TABLE IF NOT EXISTS `plans` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`state` text DEFAULT 'open' NOT NULL,
	`read_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text NOT NULL
);
--> statement-breakpoint
-- `position` is a real number so a line inserted between two others takes the midpoint and no other
-- row has to be rewritten. `record_id` is null until a person files that line as work, and null is
-- the ordinary case: most of a plan is writing and never becomes a record at all.
CREATE TABLE IF NOT EXISTS `plan_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`plan_id` text NOT NULL,
	`position` real NOT NULL,
	`text` text NOT NULL,
	`record_id` text,
	`remark` text,
	`updated_at` text NOT NULL,
	`updated_by` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `plan_lines_plan_idx` ON `plan_lines` (`plan_id`,`position`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `plan_lines_record_idx` ON `plan_lines` (`record_id`);
--> statement-breakpoint
-- Which plan line put this time here, or null because nobody planned it in a document. One column
-- and not two: the plan is reachable from the line, so storing the plan id beside it would be the
-- same fact in two places. Adding a nullable column rewrites no row and loses nothing.
ALTER TABLE `allocations` ADD COLUMN `from_plan_line` text;
