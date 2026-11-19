-- THE OFFICE: EVERY WORLD THIS INSTALLATION HAS EVER HAD, WITH ITS BIRTH AND ITS DEATH.
--
-- One table. Nothing is dropped, nothing is renamed and nothing already stored is rewritten.
--
-- CRITERION C2 of design/messages/ACCEPTANCE.md section 8, from the owner on 4 September 2026. The
-- owner asked for a place that answers which worlds there are, where a trip to another world is
-- registered, and which records a world appearing and a world disappearing.
--
-- THE TABLE IS CREATED IN EVERY DATABASE AND ONLY ONE OF THEM IS THE OFFICE. There is one schema and
-- one migration folder, so every world's database gets the table. What makes a database the office
-- is that its file is the one the declaration calls canonical; `thisIsTheMainWorld()` in
-- src/server/lib/office.ts is the one place that decides. A world that is not the main one writes no
-- row here: it registers at the main world over HTTP, and reads the mirror when the main world does
-- not answer.
--
-- A WORLD IS A DATABASE, WHICH IS WHAT THE UNIQUE INDEX SAYS. At most one LIVE row per database
-- identity: a second server started against the same database is the same world answering twice, not
-- a second world, so registering finds the row that is already there. A world that died and was
-- started again gets a new row, so the whole history of appearances and disappearances is kept.
--
-- `address` IS NOT AN IDENTITY AND IS NEVER LOOKED UP BY. A port goes back to the machine when a
-- process ends and the next thing to take it is not the same world. The address is kept because it
-- is how somebody reaches a world that is alive now.
--
-- SAFE TO RUN TWICE: every statement carries IF NOT EXISTS.
CREATE TABLE IF NOT EXISTS `worlds` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`started_by_kind` text,
	`started_by_id` text,
	`checkout` text,
	`head` text,
	`database_identity` text NOT NULL,
	`address` text,
	`standing` text NOT NULL,
	`parent_world` text,
	`born_at` text NOT NULL,
	`died_at` text,
	`died_because` text,
	`installation` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `worlds_database_idx` ON `worlds` (`database_identity`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `worlds_installation_idx` ON `worlds` (`installation`);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `worlds_one_live_per_database_idx` ON `worlds` (`database_identity`) WHERE died_at IS NULL;
