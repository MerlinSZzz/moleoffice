-- HOW FAR EACH MESSAGE GOT WITH EACH PERSON OR AGENT IT WAS SENT TO. One table, nothing touched.
--
-- Criterion M1 of design/messages/ACCEPTANCE.md, part 2b. A message now says who sent it, who it is
-- to and what on a page it is about; those three are fields of the record. How far it got is not,
-- and this table is why.
--
-- WHY A MARK IS NOT A FIELD. A mark changes. It starts at `queued` when the message is written,
-- becomes `delivered` when something serving the recipient reads it, and becomes `seen` when the
-- recipient says they have read it. A field of a record cannot change without a revision, so a
-- conversation of ten messages being read would write ten revisions of messages nobody edited, and
-- the record's own history would then read as ten rewrites of somebody's words.
--
-- ONE ROW PER RECIPIENT, and the unique index is what says so. A recipient named twice would have
-- two answers to one question, and there would be no way to say which was right.
--
-- NOTHING IS DELETED AND NOTHING IS REWRITTEN. The `message` records already in this database keep
-- every field they hold, including the `from` line somebody typed and the `read` flag. The data
-- migration `migrateMessageDelivery` in src/server/db/message-delivery-migration.ts is what gives
-- each of them a sender, a recipient and a delivery row, and it says in numbers what it did.
--
-- SAFE TO RUN TWICE. Every statement carries IF NOT EXISTS, so a second run creates nothing, and
-- the data step that fills this table does nothing when it has already run.

CREATE TABLE IF NOT EXISTS `message_delivery` (
	`id` text PRIMARY KEY NOT NULL,
	`message_id` text NOT NULL,
	`recipient_kind` text NOT NULL,
	`recipient_id` text NOT NULL,
	`mark` text NOT NULL,
	`at` text NOT NULL,
	FOREIGN KEY (`message_id`) REFERENCES `records`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `message_delivery_message_idx` ON `message_delivery` (`message_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `message_delivery_recipient_idx` ON `message_delivery` (`recipient_kind`,`recipient_id`);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `message_delivery_one_per_recipient_idx` ON `message_delivery` (`message_id`,`recipient_kind`,`recipient_id`);
