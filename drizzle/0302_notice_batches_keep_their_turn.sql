-- Keep the original delivery queued until its accepted handover. Instants include their offset.
CREATE TABLE IF NOT EXISTS `notice_batch_deliveries` (
  `delivery_id` text PRIMARY KEY NOT NULL,
  `held_at` text NOT NULL,
  `released_turn` text
);
--> statement-breakpoint
-- The frozen list survives a failed launch and a restart. Accepting the same turn again changes nothing.
CREATE TABLE IF NOT EXISTS `notice_batch_turns` (
  `id` text NOT NULL,
  `recipient_kind` text NOT NULL,
  `recipient_id` text NOT NULL,
  `delivery_ids` text NOT NULL,
  `accepted_at` text,
  PRIMARY KEY (`id`, `recipient_kind`, `recipient_id`)
);

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `notice_batch_pending_idx` ON `notice_batch_deliveries` (`released_turn`);
