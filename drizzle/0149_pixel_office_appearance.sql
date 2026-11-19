ALTER TABLE `agents` ADD `pixel_appearance` text;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `office_scene_settings` (
  `only_row` integer PRIMARY KEY NOT NULL CHECK (`only_row` = 1),
  `settings` text NOT NULL,
  `updated_at` text NOT NULL,
  `updated_by_kind` text NOT NULL,
  `updated_by_id` text NOT NULL,
  `authority` text
);
