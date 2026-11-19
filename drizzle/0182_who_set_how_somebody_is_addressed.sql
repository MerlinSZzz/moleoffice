-- WHO SET HOW A PERSON OR AN AGENT WISHES TO BE ADDRESSED, AND WHEN. Three nullable columns on `people`
-- and three on `agents`.
-- A secretary may set anybody's address and the owner any agent's, so the row says who last set it.
--
-- NULL MEANS NOBODY RECORDED WHO SET IT: every row written before this, and every row whose address was
-- never set. A reader says so rather than guessing the participant itself.
--
-- ADDITIVE, AND IT WRITES NO VALUE. Six ALTER TABLE ADD COLUMN and no UPDATE.
ALTER TABLE `people` ADD `address_set_by_kind` text;--> statement-breakpoint
ALTER TABLE `people` ADD `address_set_by_id` text;--> statement-breakpoint
ALTER TABLE `people` ADD `address_set_at` text;--> statement-breakpoint
ALTER TABLE `agents` ADD `address_set_by_kind` text;--> statement-breakpoint
ALTER TABLE `agents` ADD `address_set_by_id` text;--> statement-breakpoint
ALTER TABLE `agents` ADD `address_set_at` text;
