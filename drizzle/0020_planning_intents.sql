-- What a person wrote about time, kept exactly as they wrote it.
--
-- ADDITIVE. One new table, nothing existing touched, no row moved.
--
-- The owner set the rule this table exists for on 16 August 2026: humans express intent, agents and
-- parsers translate it, and PanelX validates and commits it. So `said` holds somebody's own words —
-- "around 5h", "Tuesday afternoon", "sometime next week" — and the columns beside it hold what was
-- made of those words only when something could be made honestly.
--
-- `state` is one of three: `kept` (the words are stored and nothing was interpreted), `offered` (an
-- interpretation was made and waits for a person), `committed` (it became an allocation).
--
-- NOTHING BUT `committed` EVER ENTERS ARITHMETIC. A kept intent never adds to a week, never makes
-- capacity look used and never counts as work planned. The totals read `allocations` and read
-- nothing here.
--
-- `record_id` and `plan_line_id` are both nullable, and the second one matters: a person writes
-- time on a plan line before that line is filed as work, so an intent may belong to a line and to no
-- record at all.
--
-- No workspace column, like the rest of the planning layer: a week's intentions span projects.
--
-- NUMBERED WELL CLEAR OF THE MIGRATIONS AROUND IT because several agents were adding one at the same
-- time. Drizzle applies journal entries in order and records the `when` of each; the gap in the
-- numbers costs nothing.

CREATE TABLE IF NOT EXISTS `planning_intents` (
	`id` text PRIMARY KEY NOT NULL,
	`said` text NOT NULL,
	`record_id` text,
	`plan_line_id` text,
	`horizon` text,
	`period` text,
	`hours` real,
	`state` text DEFAULT 'kept' NOT NULL,
	`created_at` text NOT NULL,
	`created_by` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `planning_intents_line_idx` ON `planning_intents` (`plan_line_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `planning_intents_record_idx` ON `planning_intents` (`record_id`);
