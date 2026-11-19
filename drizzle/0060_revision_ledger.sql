-- The revision ledger: one new table holding WHAT EACH RECORD HELD, once per write.
--
-- ADDITIVE. Nothing existing is touched. No row of any table is read, moved, rewritten or taken
-- away, and no column is added to anything. Every statement is `IF NOT EXISTS`, so running this
-- against a database that has already been through it does nothing at all.
--
-- ---------------------------------------------------------------------------------------
-- WHY, IN ONE PARAGRAPH
-- ---------------------------------------------------------------------------------------
--
-- `changes` says WHAT CHANGED about a record. It cannot say WHAT IT WAS. A `create` row stores the
-- record's TITLE and nothing else — measured on 18 August 2026 across all 536 records of the live
-- corpus, PanelX claim SFqriiCyFWJi — so there is no starting point to replay the later edits onto,
-- and nothing can be reconstructed. Reviews, annotations and agent runs all need to say "this is
-- what I was looking at", and until this table none of them could.
--
-- `changes` IS NOT REPLACED AND IS NOT RE-POINTED BY THIS. It is the daily page — a day is a filter
-- on `changes.at` — and it goes on doing that job. A revision is written BESIDE a change row, in the
-- same transaction, by `saveRevision` in src/server/lib/records.ts.
--
-- ---------------------------------------------------------------------------------------
-- WHAT THE COLUMNS ARE
-- ---------------------------------------------------------------------------------------
--
-- The reasoning for every column is on the drizzle declaration in src/server/db/schema.ts, in the
-- house style, and is not repeated here — one statement of it, in the file that enforces writes.
-- Three things are worth having in the migration itself, because they are what a reader of the SQL
-- would otherwise have to guess at:
--
--   `content_hash` IS `versionOf()`, the compare-and-set token this server already uses on every
--   stale-write check. A revision id and a stale-write token are therefore the same string and
--   cannot drift apart, because there is only one of them. It hashes a plain JSON.stringify, so KEY
--   ORDER INSIDE `data` IS PART OF THE HASH: two records holding the same fields in a different
--   order hash differently. That is acceptable — the token is then conservative and never wrongly
--   equal — but it means two different hashes are not proof that the content differs.
--
--   `at` HAS NO SQL DEFAULT, the rule migration 0004 exists to enforce across this database.
--   `datetime('now')` is UTC and every stamp here is read as local wall-clock time, so a default
--   would put a wrong moment on a revision behind a successful write.
--
--   `record_id` IS NOT A DECLARED FOREIGN KEY, for the reason `changes.record_id` is not one: the
--   history of a record has to survive whatever happens to the row.
--
-- `revisions_record_seq_idx` IS THE INDEX THAT MAKES THIS A LEDGER. Two revisions of one record may
-- not hold one `seq`, so "the one before this" is a single row and a gap cannot be written.
--
-- ---------------------------------------------------------------------------------------
-- WHAT FILLS IT FOR THE RECORDS THAT ALREADY EXIST
-- ---------------------------------------------------------------------------------------
--
-- Not this file. src/server/db/revision-backfill.ts writes one `baseline` revision per record, and
-- it is TypeScript because it has to compute `versionOf` — a sha256 over a particular JSON shape —
-- which SQL cannot do, and because it has to say in words what a baseline is not. It runs from
-- `migrateInPlace` after this migration, like the four data migrations before it, and it decides
-- what to do by looking at the data, so it is safe to run twice.
--
-- NUMBERED WELL CLEAR OF THE MIGRATIONS AROUND IT, the way 0020, 0030, 0040 and 0050 were and for
-- the same reason: several agents add one at the same time. Drizzle applies journal entries in order
-- of their `when`, so the gap in the numbers costs nothing.

CREATE TABLE IF NOT EXISTS `revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`record_id` text NOT NULL,
	`workspace_id` text,
	`seq` integer NOT NULL,
	`content_hash` text NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`summary` text,
	`data` text NOT NULL,
	`deleted_at` text,
	`op` text NOT NULL,
	`actor_type` text NOT NULL,
	`actor_id` text NOT NULL,
	`session_id` text,
	`at` text NOT NULL,
	`note` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `revisions_record_seq_idx` ON `revisions` (`record_id`,`seq`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `revisions_record_at_idx` ON `revisions` (`record_id`,`at`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `revisions_content_hash_idx` ON `revisions` (`content_hash`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `revisions_workspace_at_idx` ON `revisions` (`workspace_id`,`at`);
