-- QUICK INPUTS: THE OWNER'S LIST, AND EVERY ASK FOR ONE.
--
-- Wave 13u round 21. The office types an input into an agent's terminal only when
-- the agent asked for it with its own run's key, the input is on the owner's list exactly as written, and nothing was
-- typed for that agent in the last ten minutes. The rules and the shapes are in src/shared/quick-inputs.ts; the one
-- reader and writer of both tables is src/server/lib/quick-inputs.ts.
--
-- `quick_input_list` is one row for the whole installation, in the shape `price_table` uses. `inputs` holds the list
-- as a JSON array of strings, and its one shape check is `readQuickInputList`. A clear keeps the row with `inputs` NULL
-- and stamps who cleared it, so a restore carries the clear over the list this migration starts with: the import
-- never deletes a row, and with no row the restored office would type from a list the person had cleared.
--
-- `quick_input_asks` holds one row for every ask that named a run in an office terminal, typed or refused, with the
-- sentence the asker was answered with. `at_ms` is the one stored time, in milliseconds since the epoch, because the
-- ten minutes are counted from it; a reader is shown it as a local stamp. The index finds one agent's newest asks
-- without reading the table. `outcome` is held to the eight outcomes of `QUICK_INPUT_OUTCOMES`.
CREATE TABLE IF NOT EXISTS `quick_input_list` (
  `only_row` integer PRIMARY KEY NOT NULL CHECK (`only_row` = 1),
  `inputs` text CHECK (`inputs` IS NULL OR json_valid(`inputs`)),
  `updated_at` text NOT NULL,
  `updated_by_kind` text NOT NULL,
  `updated_by_id` text NOT NULL
);
--> statement-breakpoint
-- THE LIST THE OFFICE STARTS WITH: /context and /compact. They are the two examples in the rule for quick inputs, so an
-- agent can ask for either from the first day. The row is stamped as written by this migration and not by the owner,
-- so a reader can tell the office's starting list from one the owner set. Only the person may change or clear it.
-- OR IGNORE, so a row already there is left exactly as it is.
INSERT OR IGNORE INTO `quick_input_list` (`only_row`, `inputs`, `updated_at`, `updated_by_kind`, `updated_by_id`)
  VALUES (1, '["/context","/compact"]', strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime'), 'migration', '0272');
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `quick_input_asks` (
  `id` text PRIMARY KEY NOT NULL,
  `at_ms` integer NOT NULL,
  `agent_id` text NOT NULL,
  `run` text NOT NULL,
  `terminal` text NOT NULL,
  `input` text NOT NULL,
  `outcome` text NOT NULL CHECK (`outcome` IN ('typed', 'not-the-agent', 'no-list', 'not-on-the-list', 'too-soon', 'not-typed', 'typed-without-enter', 'unknown')),
  `says` text NOT NULL,
  `asked_by_kind` text NOT NULL,
  `asked_by_id` text NOT NULL,
  `proved_by` text
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `quick_input_asks_agent_at_idx` ON `quick_input_asks` (`agent_id`, `at_ms`);
