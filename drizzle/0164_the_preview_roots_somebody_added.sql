-- THE DIRECTORIES SOMEBODY ADDED BY HAND AS PREVIEW ROOTS.
--
-- Criterion U4 as rewritten: a user must not be
-- asked to add an environment variable by hand each time they work in a new folder. The directories
-- a preview may read are derived, and a press on the Settings page adds one by hand for the odd
-- case, recorded with who and when. That hand-added list is the one part of the derivation no
-- existing row can hold honestly, so it is one singleton row in the shape `office_scene_settings`
-- already uses: the JSON in `settings` is keyed by workspace id, each value a list of {path,
-- addedBy, addedAt, why}.
--
-- IT HOLDS NOTHING UNTIL SOMEBODY PRESSES. No migration writes a row and no data is rewritten, so an
-- installation that never adds a directory by hand is exactly as it was. The reader that tells
-- "nobody added one" from "the list is empty" is in src/server/lib/preview-roots.ts.
CREATE TABLE IF NOT EXISTS `preview_root_additions` (
  `only_row` integer PRIMARY KEY NOT NULL CHECK (`only_row` = 1),
  `settings` text NOT NULL,
  `updated_at` text NOT NULL,
  `updated_by_kind` text NOT NULL,
  `updated_by_id` text NOT NULL,
  `authority` text
);
