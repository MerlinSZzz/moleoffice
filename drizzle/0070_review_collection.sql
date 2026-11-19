-- A review becomes a thing: one new table saying WHO STARTED COLLECTING REMARKS, FROM WHERE.
--
-- ADDITIVE. Nothing existing is touched. No row of any table is read, moved, rewritten or taken
-- away, and no column is added to anything. Every statement is `IF NOT EXISTS`, so running this
-- against a database that has already been through it does nothing at all.
--
-- ---------------------------------------------------------------------------------------
-- WHY, IN ONE PARAGRAPH
-- ---------------------------------------------------------------------------------------
--
-- Until this table a review was two values in a browser's own storage: whether review mode was on,
-- and which conversation the comments were going into. It had no project in it, nothing could list
-- it, nothing could say where it had been started from, and a second browser knew nothing about it.
-- That is a mode rather than a thing. Everything a review needs to be — where it started, when, who
-- started it, where it stands, and what was in it when collecting finished — is now a row here.
--
-- ---------------------------------------------------------------------------------------
-- WHAT THE COLUMNS ARE, AND THE TWO THAT ARE NOT HERE
-- ---------------------------------------------------------------------------------------
--
-- The reasoning for every column is on the drizzle declaration in src/server/db/schema.ts, in the
-- house style, and is not repeated here. Two absences are worth stating in the SQL, because a
-- reader would otherwise look for them:
--
--   THERE IS NO `rule` COLUMN. What counts as inside a review is DERIVED from `entry` and from the
--   containment PanelX already stores, on every read. Storing it as well would be the same fact in
--   two places, and the stored copy would be the one that went on describing a scope the entry no
--   longer implies.
--
--   THERE IS NO `paused` COLUMN. Leaving the place a review was started from stops it collecting
--   there; whether somebody is standing inside a review's scope at this moment is a question about
--   where they are now, answered per request. A stored answer would be left behind by any browser
--   that closed without saying so.
--
-- `frozen` IS NULL UNTIL COLLECTING FINISHES, and an empty array afterwards if nothing was
-- collected. Those are two different facts — "nobody has finished collecting" and "it contained
-- nothing" — and NULL against `[]` is what keeps them apart.
--
-- `started_at` AND `collected_at` HAVE NO SQL DEFAULT, the rule migration 0004 exists to enforce
-- across this database. `datetime('now')` is UTC and every stamp here is read as local wall-clock
-- time, so a default would put a wrong moment on a review behind a successful write.
--
-- `from_thread_id` IS NOT A DECLARED FOREIGN KEY, for the reason `changes.record_id` is not one:
-- what a review was collected in has to survive whatever happens to that conversation.
--
-- ---------------------------------------------------------------------------------------
-- WHAT FILLS IT FOR THE REVIEW THAT ALREADY EXISTS
-- ---------------------------------------------------------------------------------------
--
-- Not this file. src/server/db/review-migration.ts brings forward every conversation round seven
-- stored a review as, keeping its id, its start, who started it and where it was started from —
-- which it MEASURES from the first comment in that conversation and refuses to guess at when there
-- is none. It is TypeScript because it has to read a comment's stored JSON to find the entry, and
-- because it has to say in words which conversations it would not guess at. It runs from
-- `migrateInPlace` after the migrations here, like the six data migrations before it, and it
-- decides what to do by looking at the data, so it is safe to run twice.
--
-- NUMBERED WELL CLEAR OF THE MIGRATION BEFORE IT, the way 0020 to 0060 were and for the same
-- reason: several agents add one at the same time. Drizzle applies journal entries in order of
-- their `when`, so the gap in the numbers costs nothing.

CREATE TABLE IF NOT EXISTS `reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`entry` text NOT NULL,
	`state` text DEFAULT 'collecting' NOT NULL,
	`started_at` text NOT NULL,
	`started_by` text NOT NULL,
	`collected_at` text,
	`frozen` text,
	`from_thread_id` text
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `reviews_workspace_started_idx` ON `reviews` (`workspace_id`,`started_at`);
