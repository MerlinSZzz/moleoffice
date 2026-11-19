-- A VISITING AGENT HOLDS ITS OWN CREDENTIAL, AND EVERY REQUEST UNDER IT IS RECORDED.
--
-- Criteria P24 to P29 of design/permissions/ACCEPTANCE.md.
-- A worker on another machine may do this work. Until that machine has a world, it registers
-- as a trusted visitor. Each agent is issued its own credential. The office records facts about the
-- agent's run, such as its conversation path or start directory, to tell the same agent from a
-- different one that found the token. The owner confirms these visitors as administrator at the
-- Embassy, from either machine, and counts and supervises them there.
--
-- `visitor_credentials` IS ONE ROW PER AGENT, not per machine and not per world. Each agent
-- is issued its own, so ending one leaves the others working.
--
-- `token_hash` HOLDS SHA-256 OF THE SECRET AND THE COLUMN SAYS SO. The token is shown once, in the
-- reply that issues it, and never again: the office cannot hand it back either. A column called
-- `token` holding a hash would be a name that lies to whoever opens this database next.
--
-- `visitor_requests` IS EVERY REQUEST AND NOT ONLY THE MISMATCHES. The owner counts and
-- supervises them, and criterion P26 asks the Embassy for how many requests a visitor made, what it
-- wrote, and how many did not match. All three are counted from these rows, so no count is stored
-- twice and free to drift from the rows it came from.
--
-- `mismatch` IS THE EVIDENCE AND NOT A FLAG: the JSON list criterion P27 asks for, each entry naming
-- the fact, what the credential was issued with, and what the request sent.
--
-- ADDITIVE, AND IT REWRITES NOTHING. Two CREATE TABLE, five CREATE INDEX, and no UPDATE.
CREATE TABLE IF NOT EXISTS `visitor_credentials` (
	`id` text PRIMARY KEY NOT NULL,
	`handle` text NOT NULL,
	`name` text NOT NULL,
	`role` text NOT NULL,
	`token_hash` text NOT NULL,
	`world` text,
	`machine` text,
	`machine_how` text NOT NULL,
	`conversation_path` text,
	`start_directory` text,
	`runtime` text,
	`session_record` text,
	`standing` text NOT NULL,
	`confirmed_by_kind` text,
	`confirmed_by_id` text,
	`confirmed_at` text,
	`ends_at` text NOT NULL,
	`ended_at` text,
	`ended_because` text,
	`issued_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `visitor_credentials_token_idx` ON `visitor_credentials` (`token_hash`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `visitor_credentials_standing_idx` ON `visitor_credentials` (`standing`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `visitor_credentials_world_idx` ON `visitor_credentials` (`world`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `visitor_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`credential_id` text NOT NULL,
	`at` text NOT NULL,
	`method` text NOT NULL,
	`route` text NOT NULL,
	`operation` text,
	`wrote` integer NOT NULL,
	`refused_because` text,
	`mismatch` text
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `visitor_requests_credential_idx` ON `visitor_requests` (`credential_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `visitor_requests_mismatch_idx` ON `visitor_requests` (`credential_id`,`mismatch`);
