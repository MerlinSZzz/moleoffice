-- REMIND ME LATER BRINGS A MESSAGE BACK ONCE, AT THE TIME THE PERSON CHOSE.
--
-- TWO COLUMNS ON `message_delivery`, because the fact is about one message and one recipient, and that
-- row is already the one place that says how far a message got with a recipient. The office keeps the
-- time here, not the page, so the message comes back with no page open and after a restart.
--
-- `remind_at` is when the message comes back, local wall clock. NULL means nobody pressed Remind me
-- later on it. `reminded_at` is when the office brought it back. NULL while the time has not come. A new
-- press writes a new `remind_at` and empties `reminded_at`, so each press brings it back once.
--
-- ADDITIVE, AND IT REWRITES NOTHING. Two ALTER TABLE ADD COLUMN and no UPDATE.
ALTER TABLE `message_delivery` ADD COLUMN `remind_at` text;
--> statement-breakpoint
ALTER TABLE `message_delivery` ADD COLUMN `reminded_at` text;
