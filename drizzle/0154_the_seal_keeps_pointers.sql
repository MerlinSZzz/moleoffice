-- THE SEAL KEEPS POINTERS AND HASHES, NEVER COPIES. Criterion C34.
--
-- MEASURED BEFORE THIS RAN, read-only on the live database on 11 September 2026 about 16:45:
-- submission_events held 17,432 rows and 27,710,429 bytes of payload. 4,829 of those rows were whole
-- revision copies totalling 20,441,040 bytes; the largest single copy was 1,663,972 bytes. 10,779
-- were change copies (6,750,583 bytes) and 1,822 were link copies (518,234 bytes).
-- WHAT IT COST DOWNSTREAM: an inspector's check died on a prompt
-- of 2,964,703 bytes against a 1,000,000-token limit and produced no verdict.
--
-- NOTHING submission_events HELD EXISTED ONLY THERE. Every revision it copied is in `revisions`,
-- every change in `changes`, every link in `links`. This drops copies, not evidence.
--
-- ---------------------------------------------------------------------------------------
-- EVERY ONE OF 0146's FIFTEEN TRIGGERS IS ACCOUNTED FOR HERE
-- ---------------------------------------------------------------------------------------
--
-- EIGHT GO. The six that copied a row into submission_events, and the two that made that table
-- immutable, because the table itself goes. SQLite drops a table's own triggers with the table; the
-- two DROPs are written out anyway so a reader of this file can count all fifteen without having to
-- know that rule.
--
-- ONE IS REPLACED. `submission_run_baseline` wrote a position in submission_events; it now writes a
-- position in the revisions ledger, which is where a seal's `before` is read from after this.
--
-- SIX STAY, and they stay because this change drops the copies and not the immutability of
-- what remains.
--   submission_baselines_no_update / _no_delete -- the table stays and nothing may rewrite a
--     baseline. They are dropped and re-created below only because this file rebuilds that table.
--   legacy_unsealed_runs_no_update / _no_delete -- that table and its inventory are untouched.
--   sealed_tip_no_update / sealed_tip_no_delete -- these are on the records table and they are what
--     makes a seal immutable. They are no part of the copying design. A migration that took the
--     immutability out along with the copies would be the exact fault C34 exists to end. The data
--     migration that rewrites the old seals (src/server/db/seal-copies-to-pointers.ts) drops and
--     re-creates this pair inside its own transaction, so there is no window in which a seal is
--     mutable and nothing says so.
--
-- ---------------------------------------------------------------------------------------
-- THE BASELINES ARE CONVERTED EXACTLY OR NOT AT ALL
-- ---------------------------------------------------------------------------------------
--
-- A baseline said where submission_events stood when a run was filed. It now says where the
-- revisions ledger stands, which is a rowid in `revisions` -- that table is append-only, nothing in
-- this repository deletes from it, so its rowids are its insertion order.
--
-- The conversion is exact: the new value is the highest revision rowid among the revisions that
-- submission_events recorded at or before the old watermark. Where the old watermark named no
-- revision event at all -- a run filed before any revision was written under the old triggers -- it
-- is the highest rowid among revisions that appear in no event, which are exactly the ones that
-- predate activation. WHERE NEITHER ANSWERS, the row keeps a NULL position and `recovered` says
-- `not-recovered`. A plausible number would be indistinguishable from a converted one for whoever
-- reads it later, and that is fabricated evidence.
--
-- THE TABLE IS REBUILT THROUGH A HOLDING TABLE, the shape 0004 and 0111 use, because `watermark`
-- becomes nullable and SQLite cannot make a NOT NULL column nullable in place. No RENAME: every
-- table this file drops, this file creates again, except submission_events, which is declared in
-- tests/migration.test.ts REBUILDS as removed for good, with the reason.
DROP TRIGGER IF EXISTS submission_revisions_insert;--> statement-breakpoint
DROP TRIGGER IF EXISTS submission_changes_insert;--> statement-breakpoint
DROP TRIGGER IF EXISTS submission_links_insert;--> statement-breakpoint
DROP TRIGGER IF EXISTS submission_links_delete;--> statement-breakpoint
DROP TRIGGER IF EXISTS submission_links_update;--> statement-breakpoint
DROP TRIGGER IF EXISTS submission_links_before_update;--> statement-breakpoint
DROP TRIGGER IF EXISTS submission_baselines_no_update;--> statement-breakpoint
DROP TRIGGER IF EXISTS submission_baselines_no_delete;--> statement-breakpoint
DROP TRIGGER IF EXISTS submission_run_baseline;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `submission_baselines_holding` (
	`run_id` TEXT PRIMARY KEY NOT NULL,
	`watermark` INTEGER,
	`recovered` TEXT NOT NULL
);--> statement-breakpoint
INSERT INTO `submission_baselines_holding` (run_id, watermark, recovered)
SELECT run_id, at, CASE WHEN at IS NULL THEN 'not-recovered' ELSE 'converted' END FROM (
	SELECT b.run_id AS run_id, COALESCE(
		(SELECT MAX(r.rowid) FROM revisions r WHERE r.id IN (
			SELECT json_extract(e.payload, '$.id') FROM submission_events e
			WHERE e.kind = 'revision' AND e.watermark <= b.watermark)),
		(SELECT MAX(r.rowid) FROM revisions r WHERE r.id NOT IN (
			SELECT json_extract(e.payload, '$.id') FROM submission_events e WHERE e.kind = 'revision'))
	) AS at
	FROM submission_baselines b
);--> statement-breakpoint
DROP TABLE `submission_baselines`;--> statement-breakpoint
CREATE TABLE `submission_baselines` (
	`run_id` TEXT PRIMARY KEY NOT NULL,
	`watermark` INTEGER,
	`recovered` TEXT NOT NULL
);--> statement-breakpoint
INSERT INTO `submission_baselines` (run_id, watermark, recovered)
SELECT run_id, watermark, recovered FROM `submission_baselines_holding`;--> statement-breakpoint
DROP TABLE `submission_baselines_holding`;--> statement-breakpoint
CREATE TRIGGER submission_run_baseline AFTER INSERT ON records WHEN NEW.kind = 'session' BEGIN INSERT INTO submission_baselines VALUES (NEW.id, (SELECT COALESCE(MAX(rowid),0) FROM revisions), 'live'); END;--> statement-breakpoint
CREATE TRIGGER submission_baselines_no_update BEFORE UPDATE ON submission_baselines BEGIN SELECT RAISE(ABORT, 'Submission evidence is immutable'); END;--> statement-breakpoint
CREATE TRIGGER submission_baselines_no_delete BEFORE DELETE ON submission_baselines BEGIN SELECT RAISE(ABORT, 'Submission evidence is immutable'); END;--> statement-breakpoint
DROP TRIGGER IF EXISTS submission_events_no_update;--> statement-breakpoint
DROP TRIGGER IF EXISTS submission_events_no_delete;--> statement-breakpoint
DROP TABLE `submission_events`;
