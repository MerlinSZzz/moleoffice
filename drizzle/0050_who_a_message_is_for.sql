-- Who a message is for, and which agent a run is addressed to.
--
-- A message goes to the agent already working on the thing it
-- is about, and PanelX never guesses which. So a recipient is stored in the three layers every
-- loose input here is stored in: the words somebody typed, the sentence saying what PanelX made of
-- them, and what was settled. src/server/db/schema.ts carries the reasoning on each column.
--
-- Every column is nullable, because a message nobody addressed is an ordinary message: an agent's
-- own answer has no recipient and never will.
ALTER TABLE `agent_messages` ADD `recipient_kind` text;
--> statement-breakpoint
ALTER TABLE `agent_messages` ADD `recipient_session_id` text;
--> statement-breakpoint
ALTER TABLE `agent_messages` ADD `recipient_said` text;
--> statement-breakpoint
ALTER TABLE `agent_messages` ADD `recipient_why` text;
--> statement-breakpoint

-- A run is addressed to one agent, or deliberately to a new one, and `resume_external_id` is what a
-- worker needs to pick that agent up again. NULL there means there is nothing to resume.
ALTER TABLE `agent_runs` ADD `recipient_session_id` text;
--> statement-breakpoint
ALTER TABLE `agent_runs` ADD `resume_external_id` text;
--> statement-breakpoint

-- Reading the queue by who it is for, which is how a worker asks whether it can serve anything.
CREATE INDEX IF NOT EXISTS `agent_runs_recipient_idx` ON `agent_runs` (`recipient_session_id`);
