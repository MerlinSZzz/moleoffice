-- A PLAN LINE'S ADD, REORDER AND DROP, EACH KEPT WITH A REASON. Criterion P3 of
-- design/planning/ACCEPTANCE.md.
--
-- Criterion P3 (design/planning/ACCEPTANCE.md, section 1) says that reordering, adding or dropping a line
-- is a revision with a reason and a time, and a sudden task is a line added with its reason.
--
-- THE RECORD REVISION LEDGER CANNOT HOLD A PLAN LINE. `revisions` is keyed by `record_id`, and
-- `saveRevision` refuses a row when no record answers that id, because a revision stores a record's
-- content. A plan line is not a record: it has text, position, recordId and two stamps, and no kind,
-- title, summary or data. `plan_lines.remark` is dead — db/plan-note-migration.ts emptied it into
-- the line's own words — and it would hold one reason per line rather than one per change, so a
-- reorder would overwrite the reason of the add. So this is one small table, and nothing else
-- changes.
--
-- ADDITIVE ONLY: `plan_lines` is not touched, no other table is touched, and no row is backfilled.
-- `reason` is NOT NULL because a reason is required on every add, reorder and drop; a line that
-- existed before this table has no row here and its read-back says so rather than inventing one.
-- `op` is one of `added`, `reordered` or `dropped`, the criterion's own three words.
--
-- `seq` is 1-based and per line, exactly as `revisions.seq` is per record, so a line's changes read
-- back oldest first even when several share a moment. The unique index is the one that makes it a
-- ledger, and it is the index the read-back walks.
CREATE TABLE IF NOT EXISTS `plan_line_revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`plan_id` text NOT NULL,
	`line_id` text NOT NULL,
	`seq` integer NOT NULL,
	`op` text NOT NULL,
	`reason` text NOT NULL,
	`at` text NOT NULL,
	`changed_by` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `plan_line_revisions_line_seq_idx` ON `plan_line_revisions` (`line_id`,`seq`);
