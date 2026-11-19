-- A CITIZEN OF ONE WORLD WORKING IN ANOTHER, REGISTERED AT THE OFFICE.
--
-- One table. Nothing is dropped, nothing is renamed and nothing already stored is rewritten.
--
-- CRITERION C4 of design/messages/ACCEPTANCE.md section 8, from the owner on 4 September 2026. A
-- citizen may visit another world, the visit is registered, and a citizen working in another world
-- is recorded.
--
-- THE OWNER'S SECOND ANSWER SETS THE SCOPE. Registering is not needed for access yet: local agents
-- and the owner's own calls may reach the API, and only a caller from another world is checked.
-- A caller that names no home is a local and is never refused; a
-- caller whose home is this world is not checked; only a caller from another world needs a visit.
--
-- THE OFFICE HOLDS THESE AND EVERY WORLD READS THEM. The visited world is usually not the office, so
-- it reads the open visits out of the mirror the office writes — the file migration 0123's header
-- describes, which is what the mirror is for. A world that could not reach the office writes the
-- visit into its own copy of this table and reports it when the office answers again, which is
-- criterion C8; `reported_at` is the column that says which of the two a row is.
--
-- "REGISTERED LATE" IS NOT A COLUMN. It is `registered_at` being later than `since`, which is the
-- same fact and cannot disagree with itself. A flag beside the two stamps would be a third place the
-- same thing is written.
--
-- SAFE TO RUN TWICE: every statement carries IF NOT EXISTS.
CREATE TABLE IF NOT EXISTS `visits` (
	`id` text PRIMARY KEY NOT NULL,
	`visitor_kind` text NOT NULL,
	`visitor_id` text NOT NULL,
	`from_world` text NOT NULL,
	`to_world` text NOT NULL,
	`since` text NOT NULL,
	`until` text,
	`why` text NOT NULL,
	`registered_at` text NOT NULL,
	`reported_at` text
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `visits_to_world_idx` ON `visits` (`to_world`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `visits_visitor_idx` ON `visits` (`visitor_kind`,`visitor_id`);