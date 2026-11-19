-- EVERY ADDITION, FIRING AND HELD-BACK FIRING OF A COUNTER, ONE ROW EACH. Criteria CT2, CT5, CT6 and
-- CT7 of design/counters/ACCEPTANCE.md.
--
-- WHY THE ROWS ARE A TABLE AND NOT THE COUNTER'S OWN `data`. Every write of a record stores the whole
-- record again as a revision. A counter that kept its history inside `data` would therefore store the
-- whole growing history again on every addition, so the stored bytes would grow with the square of
-- the rows: ten additions a day at 200 bytes is about 1.3 GB of revisions a year for ONE counter, by
-- arithmetic. A table costs one migration and nine known places, and it is the `plan_line_revisions`
-- pattern (migration 0170).
--
-- THE COUNT AND THE AMOUNT ARE NOT STORED ANYWHERE. They are worked out from the rows after the last
-- firing, which is invariant 9: one fact in one place. A stored count beside these rows could
-- disagree with them, and nothing would fail.
--
-- `which_trigger` IS NOT CALLED `trigger`, because TRIGGER is a keyword in SQLite and a column that
-- has to be quoted everywhere is a column somebody will forget to quote.
--
-- ADDITIVE ONLY: no other table is touched and no row is backfilled. `because` is NOT NULL because
-- every addition says why in the caller's own words, every firing says which trigger held, and every
-- held-back row says why it was held.
CREATE TABLE IF NOT EXISTS `counter_rows` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`counter_id` text NOT NULL,
	`seq` integer NOT NULL,
	`what` text NOT NULL,
	`at` text NOT NULL,
	`by` text,
	`event_kind` text,
	`event_id` text,
	`event_at` text,
	`count` integer NOT NULL,
	`amount` real,
	`because` text NOT NULL,
	`which_trigger` integer,
	`answer` text
);
--> statement-breakpoint
-- THE ONE THAT MAKES IT A LEDGER, and the one every read walks: one counter's rows, oldest first,
-- without a scan. Modelled on `plan_line_revisions_line_seq_idx`.
CREATE UNIQUE INDEX IF NOT EXISTS `counter_rows_counter_seq_idx` ON `counter_rows` (`counter_id`,`seq`);--> statement-breakpoint
-- AN OFFICE EVENT IS COUNTED ONCE, WHATEVER HAPPENS. The three events a counter may follow are read
-- by polling, so the same landing, the same finished run and the same message are seen by every tick
-- until they fall out of the window. This index is what makes a second row for one event impossible
-- rather than unlikely. It covers only the rows that name an event: a hand addition names none, and
-- a partial index leaves those alone.
CREATE UNIQUE INDEX IF NOT EXISTS `counter_rows_one_row_per_event_idx` ON `counter_rows` (`counter_id`,`event_kind`,`event_id`) WHERE `event_id` IS NOT NULL;
