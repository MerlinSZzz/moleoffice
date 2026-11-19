-- WHETHER THE STORED READING-MEASURE WORDS HAVE BEEN RENAMED ON THIS DATABASE. One row, or none.
--
-- The preset word `readable` is renamed
-- narrow. So the presets are now full, wide, narrow and narrowest, widest first: the old
-- `narrow` (26rem) is `narrowest`, and the old `readable` (var(--read)) is `narrow`. The data step
-- in src/server/db/measure-words.ts moves the stored words in blocks and parts.
--
-- WHY A ROW IS NEEDED AT ALL. The other data steps can each tell from the data whether they have
-- run. This one cannot: a `narrow` stored before the rename and a `narrow` stored after it look the
-- same, and a second run would move both to `narrowest`. So the step writes this row in the same
-- transaction as the rename, and skips when the row is there.
--
-- ADDITIVE ONLY. This file creates the table and writes no row; the data step writes the one row.
CREATE TABLE IF NOT EXISTS `measure_words_renamed` (
  `only_row` integer PRIMARY KEY NOT NULL CHECK (`only_row` = 1),
  `renamed_at` text NOT NULL,
  `because` text NOT NULL
);
