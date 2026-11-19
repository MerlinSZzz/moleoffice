-- Work that comes round again.
--
-- ADDITIVE. One new table, nothing existing touched.
--
-- The smallest recurrence that covers what the owner does: daily, weekly, or chosen weekdays. It is
-- NOT a calendar engine — no timezone rule, no exceptions, no "third Tuesday", no end date.
--
-- A RECURRENCE IS NOT AN OCCURRENCE. This row says the work comes round; the occurrences are
-- ordinary allocations. So completing today's occurrence completes that allocation and nothing else,
-- which is the settled §34 rule and is what stops a daily routine being marked done for ever.
--
-- No workspace column, like the rest of the planning layer: it names a record that stays in its own
-- project, and a week of routines spans projects.

CREATE TABLE IF NOT EXISTS `planning_recurrences` (
	`id` text PRIMARY KEY NOT NULL,
	`record_id` text NOT NULL,
	`every` text NOT NULL,
	`days` text,
	`hours_each` real,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `planning_recurrences_record_idx` ON `planning_recurrences` (`record_id`);
