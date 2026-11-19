-- ONE SIGNATURE CARRIES OUT A PACKAGE OF THE PERSON'S OWN ACTS, EACH UNSTRUCK ITEM ONCE.
-- Decisions madeUpjdqpeq and madeUprllfos, line round 54, signing package piece 1.
-- Two authored tables, not records. Only src/server/lib/signing-packages.ts writes them.
-- A package waits, is signed, refused or withdrawn. An item waits, is struck, done, could-not or not-run.
-- The state words are declared once in src/server/lib/signing-packages.ts, as in migration 0252.
-- The office writes shows, changes and undone from its known acts; no item holds a command.
-- Additive: two tables and two indexes, rewriting nothing.
CREATE TABLE IF NOT EXISTS `signing_packages` (
  `id` text PRIMARY KEY NOT NULL,
  `workspace_id` text NOT NULL REFERENCES `workspaces`(`id`),
  `brought_by` text NOT NULL,
  `for_agent` text NOT NULL,
  `task` text NOT NULL,
  `state` text NOT NULL,
  `brought_at` text NOT NULL,
  `answered_at` text,
  `answered_by_kind` text,
  `answered_by_id` text,
  `outcome` text
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `signing_packages_state_idx` ON `signing_packages` (`state`, `brought_at`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `signing_package_items` (
  `id` text PRIMARY KEY NOT NULL,
  `package_id` text NOT NULL REFERENCES `signing_packages`(`id`),
  `position` integer NOT NULL,
  `act` text NOT NULL,
  `inputs` text NOT NULL CHECK (json_valid(`inputs`)),
  `why` text NOT NULL,
  `shows` text NOT NULL,
  `changes` text NOT NULL,
  `undone` text NOT NULL,
  `state` text NOT NULL,
  `outcome` text,
  `done_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `signing_package_items_position_idx` ON `signing_package_items` (`package_id`, `position`);
