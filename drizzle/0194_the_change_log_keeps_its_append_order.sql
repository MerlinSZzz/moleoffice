-- THE ORDER THE CHANGE LOG WAS APPENDED IN, AS A COLUMN, SO A RESTORE CAN CARRY IT.
--
-- "What has changed since I last looked" counts the rows appended after the
-- row a reader's anchor sits on. That order was SQLite's own rowid, and an archive does not carry a
-- rowid: the importer inserted the rows in its own order and SQLite gave them new rowids. After a
-- restore, a reader who had read everything was told that 379 of 643 rows were new (measured
-- 2026-08-10, design/durability/RESTORE.md section 7.3). This column holds the order itself, the
-- archive carries it as `appendOrder`, and the importer writes it back.
--
-- THIS FILE WRITES NO ROW. The column is empty on every row that exists. The data step in
-- src/server/db/append-order-migration.ts fills each of those rows with its own rowid, which is the
-- order the readers used until now, so no answer changes on the day it runs.
--
-- A NEW ROW IS NUMBERED BY THE TRIGGER BELOW: one more than the highest number in the table. That is
-- the next place in the order, whichever program inserted the row. Nine places insert change rows,
-- and a trigger is one rule for all of them instead of nine copies of it. An insert that names its
-- own number (the importer, carrying an archive's order) is left alone. The unique index makes two
-- rows with one place in the order impossible.
ALTER TABLE `changes` ADD `append_order` integer;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `changes_append_order_idx` ON `changes` (`append_order`);--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS changes_append_order_next AFTER INSERT ON changes WHEN NEW.append_order IS NULL BEGIN UPDATE changes SET append_order = (SELECT COALESCE(MAX(append_order), 0) + 1 FROM changes) WHERE rowid = NEW.rowid; END;
