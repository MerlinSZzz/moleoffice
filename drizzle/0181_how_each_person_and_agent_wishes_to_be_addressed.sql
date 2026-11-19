-- HOW EACH PERSON AND EACH AGENT WISHES TO BE ADDRESSED. Four nullable columns on `people` and four
-- on `agents`.
--
-- The four parts are declared once, in src/shared/address-as.ts: a name, a second-person form, a
-- third-person form and a title. Each is free text the person or the agent writes about itself, and
-- nobody else writes it. The door is PUT /api/participants/:kind/:id/address-as.
--
-- NULL MEANS NOBODY HAS SET THAT PART, which is every row written before this. A reader shows a
-- part that is set and says nothing for a part that is not; it never fills one in.
--
-- ADDITIVE, AND IT WRITES NO VALUE. Eight ALTER TABLE ADD COLUMN and no UPDATE.
ALTER TABLE `people` ADD `address_name` text;--> statement-breakpoint
ALTER TABLE `people` ADD `address_second_person` text;--> statement-breakpoint
ALTER TABLE `people` ADD `address_third_person` text;--> statement-breakpoint
ALTER TABLE `people` ADD `address_title` text;--> statement-breakpoint
ALTER TABLE `agents` ADD `address_name` text;--> statement-breakpoint
ALTER TABLE `agents` ADD `address_second_person` text;--> statement-breakpoint
ALTER TABLE `agents` ADD `address_third_person` text;--> statement-breakpoint
ALTER TABLE `agents` ADD `address_title` text;
