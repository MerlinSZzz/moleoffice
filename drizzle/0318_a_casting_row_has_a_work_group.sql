-- A CASTING ROW'S WORK GROUP IS A CELL OF THE ROW. The roll for hard or simple work takes only the rows in that group.
-- Until this migration the roll found a row's group in a list in its own code, by the row's program and model. Now the
-- group is stored on the row with where it came from, as every other cell is, and the owner sets it on the Casting page.
--
-- `work_group` is hard, simple, or NULL for a row in no group. `work_group_from` is where the value came from, as JSON
-- read by `readCastingCellSource` in src/shared/casting.ts, or NULL when the cell is empty. Neither has a default, so
-- SQLite leaves every row empty when they are added, and a row added later is in no group until its cell is set.
--
-- A migration file may hold no UPDATE, so this file only adds the two columns. The data step in
-- src/server/db/casting-work-groups-migration.ts sets the rows the old list put in a group, in the run that applies
-- this migration, and writes one history row for each row it sets.
ALTER TABLE `casting_rows` ADD COLUMN `work_group` text CHECK (`work_group` IS NULL OR `work_group` IN ('hard', 'simple'));
--> statement-breakpoint
ALTER TABLE `casting_rows` ADD COLUMN `work_group_from` text CHECK (`work_group_from` IS NULL OR json_valid(`work_group_from`));
