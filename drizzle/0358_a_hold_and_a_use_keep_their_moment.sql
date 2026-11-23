-- A HANDLE HOLD AND A TOOL USE KEEP THEIR MOMENT.
--
-- `last_heard_at` and `tool_uses.at` are the local wall clock with no offset. On the night the clocks go back the hour
-- from 01:00 to 02:00 comes twice, so the stamp alone cannot say which pass a beat or a use happened in, and a reader
-- takes the earlier: a hold reads as lapsed though its holder beats. Each new column holds the same moment as an instant
-- with its offset (clockStamp's `instant` in src/shared/time.ts), written in the same write and from the same reading of
-- the clock.
--
-- NULL is every row written before this migration, and such a row is read from its stamp as it was before.
--
-- ADDITIVE, AND IT REWRITES NOTHING. Two ALTER TABLE ADD COLUMN and no UPDATE.
ALTER TABLE `handle_holds` ADD COLUMN `last_heard_instant` text;--> statement-breakpoint
ALTER TABLE `tool_uses` ADD COLUMN `at_instant` text;
