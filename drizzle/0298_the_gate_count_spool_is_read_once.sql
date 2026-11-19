-- HOW FAR THE OFFICE HAS READ THE GATE-COUNT SPOOL. Wave 13r round O.
--
-- The sandbox tools count a gate by appending one line to a day file in `<sandboxes>/.gate-counts/` (the format is
-- src/config/gate-count-spool.mjs). The office reads each new line once and counts it in `gate_counts`.
-- This table keeps how many bytes of each day file are read, so a line is counted once, also across a restart. `file`
-- is the day file's name alone. A line is counted and its file's bytes move in one transaction.
--
-- ONE CREATE TABLE AND NOTHING ELSE. It rewrites no row and touches no other table.
CREATE TABLE IF NOT EXISTS `gate_count_spool_reads` (
	`file` text PRIMARY KEY NOT NULL,
	`bytes` integer NOT NULL
);
