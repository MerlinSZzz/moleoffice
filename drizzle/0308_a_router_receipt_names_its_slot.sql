CREATE TABLE IF NOT EXISTS `router_receipts` (
  `id` text PRIMARY KEY NOT NULL,
  `run_id` text NOT NULL REFERENCES `records`(`id`),
  `token_id` text NOT NULL,
  `model` text NOT NULL,
  `slot` text NOT NULL,
  `status` integer NOT NULL,
  `input_tokens` integer,
  `cached_input_tokens` integer,
  `output_tokens` integer,
  `price_usd` real,
  `price_says` text,
  `at` integer NOT NULL,
  CONSTRAINT `router_receipts_price` CHECK ((`price_usd` IS NULL) <> (`price_says` IS NULL) AND (`price_usd` IS NULL OR `price_usd` >= 0))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `router_receipts_run_idx` ON `router_receipts` (`run_id`);
