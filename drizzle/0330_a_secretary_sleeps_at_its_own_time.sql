-- A SECRETARY SLEEPS AT ITS OWN TIME. Wave 13s round 221.
--
-- A permanent resident that holds the secretary card records the time its sleep begins each day and how long the sleep
-- lasts, on the office's clock. It may change it, and the person may change it too. A minute timer in the server begins
-- the sleep when that time opens and ends it when the time is over (src/server/lib/sleep-windows.ts).
--
-- On `agents`: `sleep_time_starts` is the time of day as HH:MM, `sleep_time_minutes` the length, `sleep_time_set_at` when
-- it was last set, and `sleep_time_set_by` whether the agent itself or the person set it ('agent' or 'person'). NULL is
-- NONE: no sleep time is set, and the office begins no sleep by itself. That is every row written before this migration.
--
-- On `resident_sleeps`: `wakes_at` is when the office ends a sleep it began at the sleep time, and `reminder_id` is the
-- message it sent the resident when that sleep began. NULL in both is a sleep begun by a press, which only a wake press
-- ends. That is every row written before this migration.
--
-- ADDITIVE, AND IT REWRITES NOTHING. Six ALTER TABLE ADD COLUMN and no UPDATE.
ALTER TABLE `agents` ADD COLUMN `sleep_time_starts` text;
--> statement-breakpoint
ALTER TABLE `agents` ADD COLUMN `sleep_time_minutes` integer;
--> statement-breakpoint
ALTER TABLE `agents` ADD COLUMN `sleep_time_set_at` text;
--> statement-breakpoint
ALTER TABLE `agents` ADD COLUMN `sleep_time_set_by` text;
--> statement-breakpoint
ALTER TABLE `resident_sleeps` ADD COLUMN `wakes_at` text;
--> statement-breakpoint
ALTER TABLE `resident_sleeps` ADD COLUMN `reminder_id` text;
