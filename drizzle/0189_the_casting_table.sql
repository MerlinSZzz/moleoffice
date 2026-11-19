-- THE CASTING TABLE: for each role, the program,
-- the model and the effort the office casts it with, and one sentence why. Choosing again when models change is
-- recasting, and only this table changes.
--
-- TWO TABLES. `casting` holds one row per role card and project; `project` is '' for the row that holds for every
-- project. Each of the four cells (program, model, effort, why) has its value and, beside it, where the value came
-- from: a JSON object read by `readCastingCellSource` in src/shared/casting.ts, or NULL when the cell is empty. The
-- row also says who changed it last and when. `casting_changes` is append-only: every write adds one row with who,
-- when, the row before and the row after, and the decisions the writer named. The page draws a row's history from it.
--
-- WHAT THE SETTINGS PANEL HELD MOVES HERE, SO ONE FACT IS KEPT IN ONE PLACE. Until this migration, the panel "The
-- model each run uses" kept a builder default per role card (`run_models.settings` at $.builders.secretary,
-- .supervisor and .worker) and the inspector's check (at $.places.check). Each value found there is written into the
-- role's every-project row, with a source that says it was moved and names the panel's last writer and time, and a
-- history row saying the same. A check's model always ran on claude-code, so the moved check becomes the inspector's
-- row on claude-code. THIS FILE ONLY ADDS: it rewrites nothing in `run_models`. The moved slots stay in that row as
-- they were, and `readRunModels` in src/shared/run-models.ts no longer reads them; the panel's next write leaves them
-- out. An installation that set none of them gets two empty tables.
CREATE TABLE IF NOT EXISTS `casting` (
  `role` text NOT NULL,
  `project` text NOT NULL DEFAULT '',
  `program` text,
  `program_from` text CHECK (`program_from` IS NULL OR json_valid(`program_from`)),
  `model` text,
  `model_from` text CHECK (`model_from` IS NULL OR json_valid(`model_from`)),
  `effort` text,
  `effort_from` text CHECK (`effort_from` IS NULL OR json_valid(`effort_from`)),
  `why` text,
  `why_from` text CHECK (`why_from` IS NULL OR json_valid(`why_from`)),
  `changed_at` text NOT NULL,
  `changed_by_kind` text NOT NULL,
  `changed_by_id` text NOT NULL,
  `authority` text,
  PRIMARY KEY (`role`, `project`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `casting_changes` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `role` text NOT NULL,
  `project` text NOT NULL DEFAULT '',
  `at` text NOT NULL,
  `by_kind` text NOT NULL,
  `by_id` text NOT NULL,
  `authority` text,
  `decisions` text NOT NULL CHECK (json_valid(`decisions`)),
  `note` text,
  `before` text CHECK (`before` IS NULL OR json_valid(`before`)),
  `after` text NOT NULL CHECK (json_valid(`after`))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `casting_changes_row` ON `casting_changes` (`role`, `project`, `id`);
--> statement-breakpoint
INSERT INTO `casting` (`role`, `project`, `program`, `program_from`, `model`, `model_from`, `effort`, `effort_from`, `why`, `why_from`, `changed_at`, `changed_by_kind`, `changed_by_id`, `authority`)
  SELECT 'secretary', '', json_extract(`settings`, '$.builders.secretary.runtime'), json_object('at', `updated_at`, 'by', json_object('kind', `updated_by_kind`, 'id', `updated_by_id`), 'decision', NULL, 'moved', json('true')), json_extract(`settings`, '$.builders.secretary.model'), json_object('at', `updated_at`, 'by', json_object('kind', `updated_by_kind`, 'id', `updated_by_id`), 'decision', NULL, 'moved', json('true')), NULL, NULL, NULL, NULL, `updated_at`, `updated_by_kind`, `updated_by_id`, `authority`
  FROM `run_models` WHERE `only_row` = 1 AND json_valid(`settings`) AND json_type(`settings`, '$.builders.secretary') = 'object';
--> statement-breakpoint
INSERT INTO `casting_changes` (`role`, `project`, `at`, `by_kind`, `by_id`, `authority`, `decisions`, `note`, `before`, `after`)
  SELECT 'secretary', '', `updated_at`, `updated_by_kind`, `updated_by_id`, `authority`, '[]', 'Moved from Settings, The model each run uses, by migration 0189.', NULL,
    json_object('program', json_object('value', json_extract(`settings`, '$.builders.secretary.runtime'), 'from', json_object('at', `updated_at`, 'by', json_object('kind', `updated_by_kind`, 'id', `updated_by_id`), 'decision', NULL, 'moved', json('true'))), 'model', json_object('value', json_extract(`settings`, '$.builders.secretary.model'), 'from', json_object('at', `updated_at`, 'by', json_object('kind', `updated_by_kind`, 'id', `updated_by_id`), 'decision', NULL, 'moved', json('true'))), 'effort', json_object('value', NULL, 'from', NULL), 'why', json_object('value', NULL, 'from', NULL))
  FROM `run_models` WHERE `only_row` = 1 AND json_valid(`settings`) AND json_type(`settings`, '$.builders.secretary') = 'object';
--> statement-breakpoint
INSERT INTO `casting` (`role`, `project`, `program`, `program_from`, `model`, `model_from`, `effort`, `effort_from`, `why`, `why_from`, `changed_at`, `changed_by_kind`, `changed_by_id`, `authority`)
  SELECT 'supervisor', '', json_extract(`settings`, '$.builders.supervisor.runtime'), json_object('at', `updated_at`, 'by', json_object('kind', `updated_by_kind`, 'id', `updated_by_id`), 'decision', NULL, 'moved', json('true')), json_extract(`settings`, '$.builders.supervisor.model'), json_object('at', `updated_at`, 'by', json_object('kind', `updated_by_kind`, 'id', `updated_by_id`), 'decision', NULL, 'moved', json('true')), NULL, NULL, NULL, NULL, `updated_at`, `updated_by_kind`, `updated_by_id`, `authority`
  FROM `run_models` WHERE `only_row` = 1 AND json_valid(`settings`) AND json_type(`settings`, '$.builders.supervisor') = 'object';
--> statement-breakpoint
INSERT INTO `casting_changes` (`role`, `project`, `at`, `by_kind`, `by_id`, `authority`, `decisions`, `note`, `before`, `after`)
  SELECT 'supervisor', '', `updated_at`, `updated_by_kind`, `updated_by_id`, `authority`, '[]', 'Moved from Settings, The model each run uses, by migration 0189.', NULL,
    json_object('program', json_object('value', json_extract(`settings`, '$.builders.supervisor.runtime'), 'from', json_object('at', `updated_at`, 'by', json_object('kind', `updated_by_kind`, 'id', `updated_by_id`), 'decision', NULL, 'moved', json('true'))), 'model', json_object('value', json_extract(`settings`, '$.builders.supervisor.model'), 'from', json_object('at', `updated_at`, 'by', json_object('kind', `updated_by_kind`, 'id', `updated_by_id`), 'decision', NULL, 'moved', json('true'))), 'effort', json_object('value', NULL, 'from', NULL), 'why', json_object('value', NULL, 'from', NULL))
  FROM `run_models` WHERE `only_row` = 1 AND json_valid(`settings`) AND json_type(`settings`, '$.builders.supervisor') = 'object';
--> statement-breakpoint
INSERT INTO `casting` (`role`, `project`, `program`, `program_from`, `model`, `model_from`, `effort`, `effort_from`, `why`, `why_from`, `changed_at`, `changed_by_kind`, `changed_by_id`, `authority`)
  SELECT 'worker', '', json_extract(`settings`, '$.builders.worker.runtime'), json_object('at', `updated_at`, 'by', json_object('kind', `updated_by_kind`, 'id', `updated_by_id`), 'decision', NULL, 'moved', json('true')), json_extract(`settings`, '$.builders.worker.model'), json_object('at', `updated_at`, 'by', json_object('kind', `updated_by_kind`, 'id', `updated_by_id`), 'decision', NULL, 'moved', json('true')), NULL, NULL, NULL, NULL, `updated_at`, `updated_by_kind`, `updated_by_id`, `authority`
  FROM `run_models` WHERE `only_row` = 1 AND json_valid(`settings`) AND json_type(`settings`, '$.builders.worker') = 'object';
--> statement-breakpoint
INSERT INTO `casting_changes` (`role`, `project`, `at`, `by_kind`, `by_id`, `authority`, `decisions`, `note`, `before`, `after`)
  SELECT 'worker', '', `updated_at`, `updated_by_kind`, `updated_by_id`, `authority`, '[]', 'Moved from Settings, The model each run uses, by migration 0189.', NULL,
    json_object('program', json_object('value', json_extract(`settings`, '$.builders.worker.runtime'), 'from', json_object('at', `updated_at`, 'by', json_object('kind', `updated_by_kind`, 'id', `updated_by_id`), 'decision', NULL, 'moved', json('true'))), 'model', json_object('value', json_extract(`settings`, '$.builders.worker.model'), 'from', json_object('at', `updated_at`, 'by', json_object('kind', `updated_by_kind`, 'id', `updated_by_id`), 'decision', NULL, 'moved', json('true'))), 'effort', json_object('value', NULL, 'from', NULL), 'why', json_object('value', NULL, 'from', NULL))
  FROM `run_models` WHERE `only_row` = 1 AND json_valid(`settings`) AND json_type(`settings`, '$.builders.worker') = 'object';
--> statement-breakpoint
INSERT INTO `casting` (`role`, `project`, `program`, `program_from`, `model`, `model_from`, `effort`, `effort_from`, `why`, `why_from`, `changed_at`, `changed_by_kind`, `changed_by_id`, `authority`)
  SELECT 'inspector', '', 'claude-code', json_object('at', `updated_at`, 'by', json_object('kind', `updated_by_kind`, 'id', `updated_by_id`), 'decision', NULL, 'moved', json('true')), json_extract(`settings`, '$.places.check.model'), json_object('at', `updated_at`, 'by', json_object('kind', `updated_by_kind`, 'id', `updated_by_id`), 'decision', NULL, 'moved', json('true')), NULL, NULL, NULL, NULL, `updated_at`, `updated_by_kind`, `updated_by_id`, `authority`
  FROM `run_models` WHERE `only_row` = 1 AND json_valid(`settings`) AND json_type(`settings`, '$.places.check') = 'object';
--> statement-breakpoint
INSERT INTO `casting_changes` (`role`, `project`, `at`, `by_kind`, `by_id`, `authority`, `decisions`, `note`, `before`, `after`)
  SELECT 'inspector', '', `updated_at`, `updated_by_kind`, `updated_by_id`, `authority`, '[]', 'Moved from Settings, The model each run uses, by migration 0189.', NULL,
    json_object('program', json_object('value', 'claude-code', 'from', json_object('at', `updated_at`, 'by', json_object('kind', `updated_by_kind`, 'id', `updated_by_id`), 'decision', NULL, 'moved', json('true'))), 'model', json_object('value', json_extract(`settings`, '$.places.check.model'), 'from', json_object('at', `updated_at`, 'by', json_object('kind', `updated_by_kind`, 'id', `updated_by_id`), 'decision', NULL, 'moved', json('true'))), 'effort', json_object('value', NULL, 'from', NULL), 'why', json_object('value', NULL, 'from', NULL))
  FROM `run_models` WHERE `only_row` = 1 AND json_valid(`settings`) AND json_type(`settings`, '$.places.check') = 'object';
