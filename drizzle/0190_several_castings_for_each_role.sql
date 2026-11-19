-- SEVERAL CASTINGS FOR EACH ROLE, in place of one casting per role:
-- each role may be cast several ways, and which suits depends on the
-- task's difficulty, the quota it uses and the cost for what it gives.
--
-- TWO NEW TABLES, AND THE OLD TWO ARE KEPT AS THEY WERE. `casting_rows` holds one row per casting, with an id of its
-- own, so a role has as many rows as it has castings. Beside program, model, effort and why it has three cells for
-- when a casting suits: `difficulty`, `quota` and `cost` (the cost for what it gives). Each cell keeps its value and,
-- in the `_from` column beside it, where the value came from, as JSON read by `readCastingCellSource` in
-- src/shared/casting.ts, or NULL when the cell is empty. `marked` says which row of a role, in one scope (one
-- project, or every project when `project` is ''), the tools take when no model is named. A unique index lets at
-- most one row of a scope carry it; the writers in src/server/lib/casting.ts keep exactly one whenever the scope
-- has any row. `casting_row_changes` is append-only and names the casting row each change was to.
--
-- WHY NEW TABLES AND NOT A REBUILD. A rebuild drops and renames, which tests/migration.test.ts allows only for a
-- file on its REBUILDS list, and adding to that list is a decision of its own. This file only creates and copies.
-- `casting` and `casting_changes` (migration 0189) stay in the database exactly as they were, and nothing reads
-- or writes them after this migration.
--
-- WHAT THIS FILE DOES WITH EACH ROW OF `casting`. Every row is kept, with every cell and its source. Each was the
-- only row of its role in its scope, so each carries the mark. The override rule of migration 0189 was cell by
-- cell: a project row's empty cell took the every-project row's value. That rule is gone: a project's own castings
-- now replace the every-project castings for that role as a whole. So that the tools do not get something
-- different in silence, where a project row left a cell empty and the every-project row of the same role filled
-- it, the value is copied into the project row, with the every-project cell's source and `"copied": true`, which
-- says migration 0190 copied it from the every-project row. Every history row of `casting_changes` is copied, with
-- its id, and names the casting row of its role and project. Then every kept row gets one more history row, by
-- `migration` `0190`, saying what this file did with it: the row before, the row after, and which cells were
-- copied. An installation whose `casting` table is empty gets two empty tables.
CREATE TABLE IF NOT EXISTS `casting_rows` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `role` text NOT NULL,
  `project` text NOT NULL DEFAULT '',
  `marked` integer NOT NULL DEFAULT 0 CHECK (`marked` IN (0, 1)),
  `program` text,
  `program_from` text CHECK (`program_from` IS NULL OR json_valid(`program_from`)),
  `model` text,
  `model_from` text CHECK (`model_from` IS NULL OR json_valid(`model_from`)),
  `effort` text,
  `effort_from` text CHECK (`effort_from` IS NULL OR json_valid(`effort_from`)),
  `difficulty` text,
  `difficulty_from` text CHECK (`difficulty_from` IS NULL OR json_valid(`difficulty_from`)),
  `quota` text,
  `quota_from` text CHECK (`quota_from` IS NULL OR json_valid(`quota_from`)),
  `cost` text,
  `cost_from` text CHECK (`cost_from` IS NULL OR json_valid(`cost_from`)),
  `why` text,
  `why_from` text CHECK (`why_from` IS NULL OR json_valid(`why_from`)),
  `changed_at` text NOT NULL,
  `changed_by_kind` text NOT NULL,
  `changed_by_id` text NOT NULL,
  `authority` text
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `casting_rows_scope` ON `casting_rows` (`role`, `project`, `id`);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `casting_rows_one_mark` ON `casting_rows` (`role`, `project`) WHERE `marked` = 1;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `casting_row_changes` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `casting_id` integer NOT NULL,
  `role` text NOT NULL,
  `project` text NOT NULL DEFAULT '',
  `what` text NOT NULL,
  `at` text NOT NULL,
  `by_kind` text NOT NULL,
  `by_id` text NOT NULL,
  `authority` text,
  `decisions` text NOT NULL CHECK (json_valid(`decisions`)),
  `note` text,
  `before` text CHECK (`before` IS NULL OR json_valid(`before`)),
  `after` text CHECK (`after` IS NULL OR json_valid(`after`))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `casting_row_changes_casting` ON `casting_row_changes` (`casting_id`, `id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `casting_row_changes_role` ON `casting_row_changes` (`role`, `id`);
--> statement-breakpoint
INSERT INTO `casting_rows` (`role`, `project`, `marked`, `program`, `program_from`, `model`, `model_from`, `effort`, `effort_from`, `difficulty`, `difficulty_from`, `quota`, `quota_from`, `cost`, `cost_from`, `why`, `why_from`, `changed_at`, `changed_by_kind`, `changed_by_id`, `authority`)
  SELECT p.`role`, p.`project`, 1,
    CASE WHEN p.`program` IS NULL AND e.`program` IS NOT NULL THEN e.`program` ELSE p.`program` END,
    CASE WHEN p.`program` IS NULL AND e.`program` IS NOT NULL THEN json_set(e.`program_from`, '$.copied', json('true')) ELSE p.`program_from` END,
    CASE WHEN p.`model` IS NULL AND e.`model` IS NOT NULL THEN e.`model` ELSE p.`model` END,
    CASE WHEN p.`model` IS NULL AND e.`model` IS NOT NULL THEN json_set(e.`model_from`, '$.copied', json('true')) ELSE p.`model_from` END,
    CASE WHEN p.`effort` IS NULL AND e.`effort` IS NOT NULL THEN e.`effort` ELSE p.`effort` END,
    CASE WHEN p.`effort` IS NULL AND e.`effort` IS NOT NULL THEN json_set(e.`effort_from`, '$.copied', json('true')) ELSE p.`effort_from` END,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    CASE WHEN p.`why` IS NULL AND e.`why` IS NOT NULL THEN e.`why` ELSE p.`why` END,
    CASE WHEN p.`why` IS NULL AND e.`why` IS NOT NULL THEN json_set(e.`why_from`, '$.copied', json('true')) ELSE p.`why_from` END,
    p.`changed_at`, p.`changed_by_kind`, p.`changed_by_id`, p.`authority`
  FROM `casting` p LEFT JOIN `casting` e ON e.`role` = p.`role` AND e.`project` = '' AND p.`project` <> ''
  ORDER BY p.`role`, p.`project`;
--> statement-breakpoint
INSERT INTO `casting_row_changes` (`id`, `casting_id`, `role`, `project`, `what`, `at`, `by_kind`, `by_id`, `authority`, `decisions`, `note`, `before`, `after`)
  SELECT c.`id`, r.`id`, c.`role`, c.`project`, CASE WHEN c.`before` IS NULL THEN 'add' ELSE 'change' END, c.`at`, c.`by_kind`, c.`by_id`, c.`authority`, c.`decisions`, c.`note`, c.`before`, c.`after`
  FROM `casting_changes` c LEFT JOIN `casting_rows` r ON r.`role` = c.`role` AND r.`project` = c.`project`
  ORDER BY c.`id`;
--> statement-breakpoint
INSERT INTO `casting_row_changes` (`casting_id`, `role`, `project`, `what`, `at`, `by_kind`, `by_id`, `authority`, `decisions`, `note`, `before`, `after`)
  SELECT r.`id`, r.`role`, r.`project`, 'migrate', strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime'), 'migration', '0190', NULL, '[]',
    'Kept by migration 0190, with every cell and its source. It was the only casting of ' || r.`role` ||
      (CASE WHEN r.`project` = '' THEN ' for every project' ELSE ' in ' || r.`project` END) ||
      ', so it carries the mark: the tools take this one.' ||
      (CASE WHEN rtrim((CASE WHEN p.`program` IS NULL AND r.`program` IS NOT NULL THEN 'program, ' ELSE '' END) || (CASE WHEN p.`model` IS NULL AND r.`model` IS NOT NULL THEN 'model, ' ELSE '' END) || (CASE WHEN p.`effort` IS NULL AND r.`effort` IS NOT NULL THEN 'effort, ' ELSE '' END) || (CASE WHEN p.`why` IS NULL AND r.`why` IS NOT NULL THEN 'why, ' ELSE '' END), ', ') = '' THEN ''
        ELSE ' Copied from the every-project row, because this row left them empty and the tools took them from there: ' || rtrim((CASE WHEN p.`program` IS NULL AND r.`program` IS NOT NULL THEN 'program, ' ELSE '' END) || (CASE WHEN p.`model` IS NULL AND r.`model` IS NOT NULL THEN 'model, ' ELSE '' END) || (CASE WHEN p.`effort` IS NULL AND r.`effort` IS NOT NULL THEN 'effort, ' ELSE '' END) || (CASE WHEN p.`why` IS NULL AND r.`why` IS NOT NULL THEN 'why, ' ELSE '' END), ', ') || '.' END),
    json_object('program', json_object('value', p.`program`, 'from', json(p.`program_from`)), 'model', json_object('value', p.`model`, 'from', json(p.`model_from`)), 'effort', json_object('value', p.`effort`, 'from', json(p.`effort_from`)), 'why', json_object('value', p.`why`, 'from', json(p.`why_from`))),
    json_object('program', json_object('value', r.`program`, 'from', json(r.`program_from`)), 'model', json_object('value', r.`model`, 'from', json(r.`model_from`)), 'effort', json_object('value', r.`effort`, 'from', json(r.`effort_from`)), 'difficulty', json_object('value', r.`difficulty`, 'from', json(r.`difficulty_from`)), 'quota', json_object('value', r.`quota`, 'from', json(r.`quota_from`)), 'cost', json_object('value', r.`cost`, 'from', json(r.`cost_from`)), 'why', json_object('value', r.`why`, 'from', json(r.`why_from`)), 'marked', json(CASE WHEN r.`marked` = 1 THEN 'true' ELSE 'false' END))
  FROM `casting_rows` r JOIN `casting` p ON p.`role` = r.`role` AND p.`project` = r.`project`
  ORDER BY r.`id`;
