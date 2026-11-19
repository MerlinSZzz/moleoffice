-- AN AGENT IS RENAMED ON ITS APPROVER'S WORD. Wave 13s round 192, item 42.
--
-- An agent's new name takes effect only once the agent's superior approves it. The name is the display name lists and
-- pages show; the handle and the id never change, so a message to the agent keeps reaching it. The agent itself, an
-- agent up its chain of starters or the person proposes a new name with a reason. The approver is the first secretary
-- up the chain of starters, or the person for an agent with no secretary above it and for a secretary; the person may
-- approve any. An agent never approves its own rename.
--
--   agent_renames  one row for each new name an agent was given or proposed. A proposal waits with answer NULL and
--                  names the approver it waits for, then holds who approved or refused it, with their reason. The
--                  person's own rename through the participants PATCH door is a row too, of the way 'at once'.
--
-- src/server/lib/agent-renames.ts writes the proposals and their answers, and src/server/lib/agent-names.ts the
-- person's own rename. The agent's page and GET /api/participants/agent/:id/renames read the table.
--
--   agent_renames_agent_idx        each agent's renames, in the order they were proposed.
--   agent_renames_one_waiting_idx  at most one waiting new name per agent.
--
-- ADDITIVE. One new table, empty, and two indexes on it. This file changes no row.
CREATE TABLE IF NOT EXISTS `agent_renames` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_id` text NOT NULL,
	`way` text NOT NULL,
	`old_name` text NOT NULL,
	`new_name` text NOT NULL,
	`proposed_by_kind` text NOT NULL,
	`proposed_by_id` text NOT NULL,
	`proposed_because` text,
	`proposed_at` text NOT NULL,
	`approver_kind` text NOT NULL,
	`approver_id` text NOT NULL,
	`told_message_id` text,
	`answer` text,
	`answered_by_kind` text,
	`answered_by_id` text,
	`answered_because` text,
	`answered_at` text,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT `agent_renames_way` CHECK (`way` IN ('proposed', 'at once')),
	CONSTRAINT `agent_renames_names` CHECK (`old_name` <> `new_name` AND trim(`new_name`) = `new_name` AND `new_name` <> ''),
	CONSTRAINT `agent_renames_kinds` CHECK (`proposed_by_kind` IN ('person', 'agent') AND `approver_kind` IN ('person', 'agent')),
	CONSTRAINT `agent_renames_answer` CHECK ((`answer` IS NULL AND `answered_by_kind` IS NULL AND `answered_by_id` IS NULL AND `answered_because` IS NULL AND `answered_at` IS NULL) OR (`answer` IN ('approved', 'refused') AND `answered_by_kind` IN ('person', 'agent') AND `answered_by_id` IS NOT NULL AND `answered_at` IS NOT NULL)),
	CONSTRAINT `agent_renames_proposed` CHECK (`way` <> 'proposed' OR (`proposed_because` IS NOT NULL AND (`answer` IS NULL OR `answered_because` IS NOT NULL))),
	CONSTRAINT `agent_renames_at_once` CHECK (`way` <> 'at once' OR (`proposed_by_kind` = 'person' AND `approver_kind` = 'person' AND `approver_id` = `proposed_by_id` AND `answer` = 'approved' AND `answered_by_kind` = 'person' AND `answered_by_id` = `proposed_by_id` AND `answered_because` IS NULL AND `answered_at` = `proposed_at` AND `told_message_id` IS NULL)),
	CONSTRAINT `agent_renames_not_its_own` CHECK (`answered_by_kind` IS NOT 'agent' OR `answered_by_id` <> `agent_id`)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `agent_renames_agent_idx` ON `agent_renames` (`agent_id`,`proposed_at`);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `agent_renames_one_waiting_idx` ON `agent_renames` (`agent_id`) WHERE `answer` IS NULL;
