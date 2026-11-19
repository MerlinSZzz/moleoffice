-- TWO LOCKED TOP GROUPS, HUMAN AND AGENT, AND THE FOLD STATE THAT IS THE PERSON'S.
--
-- Criteria M119, M120 and M121: the first level is two
-- groups, human and agent, that do not mix and cannot be renamed; under them are ordinary groups;
-- and every group folds, with the retired group folded by default and the state kept on the server.
--
-- THE `side` COLUMN SAYS WHICH TOP GROUP A SECOND-LEVEL GROUP SITS UNDER, and it is NULL on every
-- row written before this migration. It is NULL rather than defaulted because a row written before
-- this migration was written under an arrangement whose first level did not exist, and the reader
-- works the side out from the key rather than from a value this file invented: `people` and the six
-- role keys have a declared side, and a group somebody made was made under Agent. A stored value
-- wins once a row has one. Nothing is rewritten here, so this file is additive and every existing
-- row keeps every cell it had.
--
-- THE FOLD TABLE IS NEW. It is a table rather than a column on `contact_groups` because the role
-- groups are computed and have no `contact_groups` row: folding `retired` — which starts folded —
-- is somebody's act even though no group row was ever written.
CREATE TABLE IF NOT EXISTS `contact_group_collapses` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_kind` text NOT NULL,
	`owner_id` text NOT NULL,
	`group_key` text NOT NULL,
	`collapsed` integer NOT NULL,
	`set_at` text NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `contact_group_collapses_one_per_group_idx` ON `contact_group_collapses` (`owner_kind`, `owner_id`, `group_key`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `contact_group_collapses_owner_idx` ON `contact_group_collapses` (`owner_kind`, `owner_id`);--> statement-breakpoint
ALTER TABLE `contact_groups` ADD COLUMN `side` TEXT;
