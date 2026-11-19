-- REMIND ME LATER RECORDS WHO SET THE TIME. Wave 13s round 68.
--
-- The person's grant lets a secretary press some of the person's doors for them. Remind me later now asks the one check
-- (`aRaiseCarriesIt`), and a press under the grant moves the person's delivery of the message. The line the office writes
-- when the time comes must not say the person asked for it when the secretary did, so the delivery row keeps who set
-- `remind_at`, beside it.
--
-- `remind_set_by_kind` and `remind_set_by_id` are the actor that pressed, as the change log names an actor: `human` or
-- `agent`, and the id it wrote as. NULL in both is NOBODY RECORDED, which is every row written before this migration.
-- It is never read as the person, so an older row keeps the words the line has always had.
--
-- ADDITIVE, AND IT REWRITES NOTHING. Two ALTER TABLE ADD COLUMN and no UPDATE.
ALTER TABLE `message_delivery` ADD COLUMN `remind_set_by_kind` text;
--> statement-breakpoint
ALTER TABLE `message_delivery` ADD COLUMN `remind_set_by_id` text;
