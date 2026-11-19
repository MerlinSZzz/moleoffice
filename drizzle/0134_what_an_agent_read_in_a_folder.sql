-- WHAT AN AGENT READ IN A FOLDER, BEFORE ANY OF IT IS A RECORD.
--
-- Criterion I3, from the owner on 6 September 2026. Somebody with a lot of data and
-- scripts, using Mole Office for the first time: how does an agent organise it into project state
-- quickly? The answer is that the agent reads the folder and files ONE row here, and a person
-- accepts, edits or rejects each piece of it. Only an accepted piece becomes a record.
--
-- WHY A TABLE AND NOT A RECORD KIND. A reading nobody has looked at is not a claim about the
-- project yet. As records the pieces would be in the open-loop count, the attention rule, the
-- bootstrap read and every search from the moment an agent filed them, which is the flood this
-- exists to prevent. The row also holds things no record kind has a field for: the files a piece
-- came from, the words in one of them it rests on, and whether a person has decided about it.
--
-- THE PIECES ARE ONE JSON COLUMN. A draft is read and written whole, by one person at one sitting.
-- A second table of pieces would buy per-piece queries nothing asks for and cost a join on every
-- read. `FolderReadingPiece` in src/shared/folderreading.ts is the shape.
--
-- IT IS AUTHORED, and it is in AUTHORED_TABLES and in the archive's regions for that reason: an
-- agent wrote every row, and nothing can recompute one, because the folder it read may not be
-- there tomorrow.
CREATE TABLE IF NOT EXISTS `folder_readings` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`owner_id` text NOT NULL,
	`folder` text NOT NULL,
	`read_by` text NOT NULL,
	`note` text,
	`pieces` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `folder_readings_workspace_idx` ON `folder_readings` (`workspace_id`);
