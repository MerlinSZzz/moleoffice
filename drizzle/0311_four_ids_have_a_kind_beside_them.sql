-- FOUR COLUMNS THAT HOLD THE PERSON'S ID OR AN AGENT'S GET A KIND BESIDE THEM. Wave 13s round 155, item 30c part 3.
--
-- Each of these columns holds the id of whoever did a thing. Until now nothing stored beside it said whether that id
-- is the person's or an agent's. So the identity census counted every value in them as one that cannot be told, and a
-- project's archive is refused while one is counted. Each column gets a kind column, `person` or `agent`, which its
-- writer fills from now on:
--
--   folder_readings.read_by_kind     beside read_by, the actor that filed the reading
--   folder_readings.owner_kind       beside owner_id, the same actor
--   revalidations.decided_by_kind    beside decided_by, the actor that judged; NULL while decided_by is NULL
--   conversation_reads.as_side_kind  beside as_side, the side the conversation was read as; NULL for neither side
--
-- THE ROWS WRITTEN BEFORE THIS MIGRATION are told by its data half, src/server/db/kinds-beside-ids-migration.ts, in the
-- run that applies this migration and in no other, because a migration file may hold no UPDATE. A row it cannot tell
-- keeps NULL, and the census counts that row as one that cannot be told.
--
-- ADDITIVE. Four nullable columns. This file changes no row and no index.
ALTER TABLE `folder_readings` ADD COLUMN `read_by_kind` text;
--> statement-breakpoint
ALTER TABLE `folder_readings` ADD COLUMN `owner_kind` text;
--> statement-breakpoint
ALTER TABLE `revalidations` ADD COLUMN `decided_by_kind` text;
--> statement-breakpoint
ALTER TABLE `conversation_reads` ADD COLUMN `as_side_kind` text;
