-- WHO ANSWERS FOR AN AGENT IS CHANGED BY THE PERSON'S PRESS. Wave 13u round 186.
--
-- An agent's starter answers for it: who may give it keys, where its letters and seal notices go, and who may ask for
-- its next round. The registry row holds only the starter it has now. The person changes it by a press on the agent's
-- page, and each change is kept here.
--
--   agent_starter_changes  one row for each change of an agent's starter: the old starter, or none; the new one; who
--                          pressed, with their reason; when it was asked and when it was applied; and its state,
--                          'waiting', 'applied', 'withdrawn' or 'refused' with the sentence that refused it.
--                          runs_not_ended lists, as JSON, the agent's runs that had not ended when the change was
--                          applied.
--
-- src/server/lib/agent-starter.ts writes it. GET and POST /api/agents/:id/starter read and write it.
--
--   agent_starter_changes_agent_idx        each agent's changes, in the order they were asked.
--   agent_starter_changes_one_waiting_idx  at most one waiting change per agent.
--
-- agent_id is keyed to agents.id, so the re-mint of an agent's id rewrites it with the other keyed columns.
--
-- ADDITIVE. One new table, empty, and two indexes on it. This file changes no row.
CREATE TABLE IF NOT EXISTS `agent_starter_changes` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_id` text NOT NULL,
	`from_kind` text,
	`from_id` text,
	`to_kind` text NOT NULL,
	`to_id` text NOT NULL,
	`asked_by_kind` text NOT NULL,
	`asked_by_id` text NOT NULL,
	`because` text NOT NULL,
	`asked_at` text NOT NULL,
	`state` text NOT NULL,
	`applied_at` text,
	`refused_because` text,
	`runs_not_ended` text NOT NULL,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT `agent_starter_changes_state` CHECK (`state` IN ('waiting', 'applied', 'withdrawn', 'refused')),
	CONSTRAINT `agent_starter_changes_kinds` CHECK ((`from_kind` IS NULL AND `from_id` IS NULL OR `from_kind` IN ('person', 'agent') AND `from_id` IS NOT NULL) AND `to_kind` IN ('person', 'agent') AND `asked_by_kind` IN ('person', 'agent')),
	CONSTRAINT `agent_starter_changes_a_change` CHECK (`from_kind` IS NULL OR `from_kind` <> `to_kind` OR `from_id` <> `to_id`),
	CONSTRAINT `agent_starter_changes_not_itself` CHECK (`to_kind` <> 'agent' OR `to_id` <> `agent_id`),
	CONSTRAINT `agent_starter_changes_because` CHECK (trim(`because`) <> ''),
	CONSTRAINT `agent_starter_changes_applied` CHECK ((`state` = 'applied') = (`applied_at` IS NOT NULL)),
	CONSTRAINT `agent_starter_changes_refused` CHECK ((`state` = 'refused') = (`refused_because` IS NOT NULL))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `agent_starter_changes_agent_idx` ON `agent_starter_changes` (`agent_id`,`asked_at`);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `agent_starter_changes_one_waiting_idx` ON `agent_starter_changes` (`agent_id`) WHERE `state` = 'waiting';
