CREATE TABLE IF NOT EXISTS `dead_letter_claims` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`group_id` text NOT NULL,
	`agent_id` text NOT NULL,
	`opened_at` text NOT NULL,
	`claimed_by_kind` text,
	`claimed_by_id` text,
	`claimed_at` text,
	`claimed_because` text,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `dead_letter_claims_agent_idx` ON `dead_letter_claims` (`agent_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `dead_letter_claims_group_idx` ON `dead_letter_claims` (`group_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `dead_letter_claims_workspace_idx` ON `dead_letter_claims` (`workspace_id`);
