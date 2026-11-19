CREATE TABLE `changes` (
	`id` text PRIMARY KEY NOT NULL,
	`record_id` text NOT NULL,
	`op` text NOT NULL,
	`actor_type` text NOT NULL,
	`actor_id` text NOT NULL,
	`session_id` text,
	`field` text,
	`old_value` text,
	`new_value` text,
	`at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `changes_record_idx` ON `changes` (`record_id`);--> statement-breakpoint
CREATE INDEX `changes_at_idx` ON `changes` (`at`);--> statement-breakpoint
CREATE INDEX `changes_session_idx` ON `changes` (`session_id`);--> statement-breakpoint
CREATE TABLE `links` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text DEFAULT 'default' NOT NULL,
	`owner_id` text DEFAULT 'unknown' NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	`from_id` text NOT NULL,
	`to_id` text NOT NULL,
	`type` text NOT NULL,
	`inferred` integer DEFAULT false NOT NULL,
	`created_by` text DEFAULT 'unknown' NOT NULL,
	FOREIGN KEY (`from_id`) REFERENCES `records`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`to_id`) REFERENCES `records`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `links_pair_idx` ON `links` (`from_id`,`to_id`,`type`);--> statement-breakpoint
CREATE INDEX `links_from_idx` ON `links` (`from_id`);--> statement-breakpoint
CREATE INDEX `links_to_idx` ON `links` (`to_id`);--> statement-breakpoint
CREATE INDEX `links_type_idx` ON `links` (`type`);--> statement-breakpoint
CREATE TABLE `records` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text DEFAULT 'default' NOT NULL,
	`owner_id` text DEFAULT 'unknown' NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`summary` text,
	`data` text DEFAULT '{}' NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE INDEX `records_kind_idx` ON `records` (`kind`);--> statement-breakpoint
CREATE UNIQUE INDEX `records_title_idx` ON `records` (`workspace_id`,`title`);--> statement-breakpoint
CREATE INDEX `records_live_idx` ON `records` (`workspace_id`,`deleted_at`);--> statement-breakpoint
CREATE INDEX `records_updated_idx` ON `records` (`updated_at`);