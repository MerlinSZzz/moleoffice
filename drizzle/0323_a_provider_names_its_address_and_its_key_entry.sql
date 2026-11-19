-- A PROVIDER NAMES ITS ADDRESS AND ITS KEY FILE'S ENTRY, BESIDE THE CASTING TABLE. Wave 13n round CT.
--
-- A provider is a place a program sends its model requests to. Each row names the programs it is for, its base address
-- and the name of the key file's entry that holds its key. It never holds a key's value, and it holds no model list.
--
--   providers         one row for each provider. The id is given by the writer and never changes. `programs` is a
--                     JSON list of program words. The row says who added it and when, and who changed it last and
--                     when.
--   provider_changes  append-only: every add, change and removal, with who and when, and the row's fields before and
--                     after as JSON. A removed row's changes stay.
--
-- src/server/lib/the-provider-table.ts checks every rule and writes both tables, and src/server/api/the-provider-table.ts
-- is their door. Nothing else reads them yet.
--
--   provider_changes_provider_idx  each provider's changes, in the order they were written.
--
-- ADDITIVE. Two new tables, empty, and one index. This file changes no row.
CREATE TABLE IF NOT EXISTS `providers` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `programs` text NOT NULL,
  `base_address` text NOT NULL,
  `key_name` text NOT NULL,
  `added_at` text NOT NULL,
  `added_by_kind` text NOT NULL,
  `added_by_id` text NOT NULL,
  `changed_at` text NOT NULL,
  `changed_by_kind` text NOT NULL,
  `changed_by_id` text NOT NULL,
  CONSTRAINT `providers_id` CHECK (length(`id`) BETWEEN 2 AND 40 AND `id` NOT GLOB '*[^a-z0-9-]*'),
  CONSTRAINT `providers_name` CHECK (trim(`name`) = `name` AND length(`name`) BETWEEN 1 AND 120),
  CONSTRAINT `providers_programs` CHECK (json_valid(`programs`) AND json_type(`programs`) = 'array' AND json_array_length(`programs`) > 0),
  CONSTRAINT `providers_key_name` CHECK (`key_name` <> '' AND `key_name` NOT GLOB '*[^a-z0-9-]*')
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `provider_changes` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `provider_id` text NOT NULL,
  `what` text NOT NULL,
  `at` text NOT NULL,
  `by_kind` text NOT NULL,
  `by_id` text NOT NULL,
  `before` text,
  `after` text,
  CONSTRAINT `provider_changes_what` CHECK (`what` IN ('add', 'change', 'remove')),
  CONSTRAINT `provider_changes_json` CHECK ((`before` IS NULL OR json_valid(`before`)) AND (`after` IS NULL OR json_valid(`after`))),
  CONSTRAINT `provider_changes_shape` CHECK ((`what` = 'add' AND `before` IS NULL AND `after` IS NOT NULL) OR (`what` = 'change' AND `before` IS NOT NULL AND `after` IS NOT NULL) OR (`what` = 'remove' AND `before` IS NOT NULL AND `after` IS NULL))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `provider_changes_provider_idx` ON `provider_changes` (`provider_id`,`id`);
