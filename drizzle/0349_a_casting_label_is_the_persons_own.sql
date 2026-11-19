-- A CASTING LABEL IS THE PERSON'S OWN. Until this migration a row's work group was one of two words, hard or simple,
-- fixed by a CHECK in migration 0318 and by a list in src/shared/casting.ts. Now each label is a row of its own, which
-- the person and agents make, rename and remove on the Casting page and through its doors, with what it means.
--
-- `casting_labels` holds one row per label: its name, unique, and what it means, with where that came from as JSON
-- read by `readCastingCellSource` in src/shared/casting.ts, or both NULL when nobody has written a meaning. A removed
-- label's row is deleted; `casting_label_changes` keeps one row for each change, with the label before and after.
--
-- `casting_rows.labels` is the JSON list of the ids of the labels a row carries, or NULL for a row with none.
-- `casting_rows.out_until` is the instant, with its offset, until which the row's program is out, set by hand. Each has
-- a `_from` column beside it, as every other cell has. None has a default, so SQLite leaves every row empty.
--
-- A migration file may hold no UPDATE, so this file only adds the tables and the columns. The data step in
-- src/server/db/casting-labels-migration.ts makes the labels hard and simple and gives each row the label of its work
-- group, in the run that applies this migration, with one history row for each. Nothing reads `work_group` after it.
CREATE TABLE IF NOT EXISTS `casting_labels` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `name` text NOT NULL CHECK (length(`name`) BETWEEN 1 AND 32),
  `meaning` text,
  `meaning_from` text CHECK (`meaning_from` IS NULL OR json_valid(`meaning_from`)),
  `changed_at` text NOT NULL,
  `changed_by_kind` text NOT NULL,
  `changed_by_id` text NOT NULL,
  `authority` text,
  CHECK ((`meaning` IS NULL) = (`meaning_from` IS NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `casting_labels_name` ON `casting_labels` (`name`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `casting_label_changes` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `label_id` integer NOT NULL,
  `what` text NOT NULL CHECK (`what` IN ('add', 'rename', 'change', 'remove', 'migrate')),
  `at` text NOT NULL,
  `by_kind` text NOT NULL,
  `by_id` text NOT NULL,
  `authority` text,
  `note` text,
  `before` text CHECK (`before` IS NULL OR json_valid(`before`)),
  `after` text CHECK (`after` IS NULL OR json_valid(`after`))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `casting_label_changes_label` ON `casting_label_changes` (`label_id`, `id`);
--> statement-breakpoint
ALTER TABLE `casting_rows` ADD COLUMN `labels` text CHECK (`labels` IS NULL OR (json_valid(`labels`) AND json_type(`labels`) = 'array'));
--> statement-breakpoint
ALTER TABLE `casting_rows` ADD COLUMN `labels_from` text CHECK (`labels_from` IS NULL OR json_valid(`labels_from`));
--> statement-breakpoint
ALTER TABLE `casting_rows` ADD COLUMN `out_until` text;
--> statement-breakpoint
ALTER TABLE `casting_rows` ADD COLUMN `out_until_from` text CHECK (`out_until_from` IS NULL OR json_valid(`out_until_from`));
