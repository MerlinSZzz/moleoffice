-- A READER KEEPS ONE READ POINT IN EACH CONVERSATION IN EACH PROJECT: THE NEWEST READ. THE OLDER READS ARE REMOVED.
--
-- Wave 13s round 64. `conversation_reads` kept one row for every time a reader
-- opened a conversation, and every reader of the table asks only for the newest of a reader's reads of one
-- conversation. On 17 October 2026 it held about 1.38 million rows and grew by about 130,000 a day.
-- `recordThatSomebodyRead` in src/server/lib/messages.ts now replaces a reader's row with each newer read.
--
--   the DELETE                               every read of a key but its newest
--   `conversation_reads_one_per_reader_idx`  one row per key from now on
--
-- THE KEY IS THE PROJECT, THE READER'S KIND, THE READER'S ID AND THE CONVERSATION. The project is part of it because a
-- page narrowed to one project asks for the newest read in that project.
--
-- THE ROW KEPT IS THE ONE EVERY READER ALREADY SHOWED. The readers order by `at` and, among reads in one second, by
-- `rowid`, so this keeps the latest `at` and on a tie the highest rowid. No read point moves.
--
-- THIS MIGRATION REMOVES ROWS, AND SAYS HOW MANY. It is on the list of folds in tests/migration.test.ts, which lets it
-- delete from this one table only. The loss guard in src/server/db/migrate.ts counts the rows less the keys before
-- anything runs, and refuses a run that removed more. A second run finds the index and one row per key, and removes
-- nothing. Criterion M12 is met by the newest row, which says who read, which conversation, from which side and when.
DELETE FROM `conversation_reads` WHERE rowid IN (
  SELECT rowid FROM (
    SELECT rowid, ROW_NUMBER() OVER (
      PARTITION BY `workspace_id`, `reader_kind`, `reader_id`, `pair` ORDER BY `at` DESC, rowid DESC
    ) AS `place` FROM `conversation_reads`
  ) WHERE `place` > 1
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `conversation_reads_one_per_reader_idx` ON `conversation_reads` (`workspace_id`, `reader_kind`, `reader_id`, `pair`);
