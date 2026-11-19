CREATE TABLE IF NOT EXISTS `run_tokens` (
  `id` text PRIMARY KEY NOT NULL,
  `run_id` text NOT NULL REFERENCES `records`(`id`),
  `token_hash` text NOT NULL,
  `allowed_pairs` text NOT NULL CHECK (json_valid(`allowed_pairs`)),
  `spend_cap` real NOT NULL CHECK (`spend_cap` >= 0 AND `spend_cap` <= 1.7976931348623157e308),
  `spent` real DEFAULT 0 NOT NULL CHECK (`spent` >= 0 AND `spent` <= 1.7976931348623157e308),
  `issued_at` integer NOT NULL,
  `expires_at` integer NOT NULL CHECK (`expires_at` > `issued_at`),
  `revoked_at` integer,
  `revoked_because` text,
  CHECK ((`revoked_at` IS NULL) = (`revoked_because` IS NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `run_tokens_hash_idx` ON `run_tokens` (`token_hash`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `run_tokens_run_idx` ON `run_tokens` (`run_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `run_tokens_current_idx` ON `run_tokens` (`run_id`) WHERE `revoked_at` IS NULL;
