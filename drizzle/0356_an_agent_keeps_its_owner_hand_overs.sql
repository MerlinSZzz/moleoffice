-- AN AGENT KEEPS ITS OWNER HAND-OVERS. Wave 13s round 281.
--
-- An agent's owner is the person or agent that answers for it. The owner door, POST /api/agents/:id/owner, hands the
-- agent to another owner. Until this round it changed the registry row and sent a sentence in a message, and nothing
-- kept the hand-over as a row. Each hand-over the door makes is kept here, in the same write as the new owner.
--
--   agent_owner_changes  one row for each hand-over: the owner before, kind and id, exactly as the agent's row held
--                        them, each NULL when the row held none and kept as it was when it cannot be read, so there is
--                        no check on its kind; the owner after; who made it, the person or an agent; the grant it was
--                        made under, NULL when none was used; the reason; and when, as a local stamp of
--                        `YYYY-MM-DD HH:MM:SS`. A hand-over to the owner the agent already has is kept like any other.
--
--   agent_owner_changes_agent_idx  each agent's hand-overs, in the order of their stamps.
--
--   installation.owner_changes_since  the moment this office began to keep the rows, as a local stamp. NULL means the
--                                     code that keeps them has not started on this database yet. Its first start
--                                     writes it once, before it serves, and never again. A hand-over before it is in
--                                     no row.
--
-- src/server/lib/agent-owner-changes.ts writes and reads both. GET /api/participants/agent/:id/owner-changes reads
-- them. An import that names another owner writes no row.
--
-- agent_id is keyed to agents.id, so the re-mint of an agent's id rewrites it with the other keyed columns.
--
-- ADDITIVE, AND IT REWRITES NOTHING. One new table, empty, one index on it, and one ALTER TABLE ADD COLUMN.
CREATE TABLE IF NOT EXISTS `agent_owner_changes` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_id` text NOT NULL,
	`from_kind` text,
	`from_id` text,
	`to_kind` text NOT NULL,
	`to_id` text NOT NULL,
	`made_by_kind` text NOT NULL,
	`made_by_id` text NOT NULL,
	`under_grant` text,
	`because` text NOT NULL,
	`made_at` text NOT NULL,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT `agent_owner_changes_kinds` CHECK (`to_kind` IN ('person', 'agent') AND `made_by_kind` IN ('person', 'agent')),
	CONSTRAINT `agent_owner_changes_ids` CHECK (trim(`to_id`) <> '' AND trim(`made_by_id`) <> ''),
	CONSTRAINT `agent_owner_changes_because` CHECK (trim(`because`) <> '')
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `agent_owner_changes_agent_idx` ON `agent_owner_changes` (`agent_id`,`made_at`);
--> statement-breakpoint
ALTER TABLE `installation` ADD COLUMN `owner_changes_since` text;
