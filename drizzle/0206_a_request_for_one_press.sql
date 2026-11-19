-- A REQUEST FOR ONE PRESS: AN AGENT ASKS THE PERSON TO AGREE TO ONE KNOWN ACT.
-- Wave 13n round 45.
--
-- ITS OWN TABLE AND NOT A RECORD, so no record door can file, change or delete one. Only the doors in
-- src/server/api/one-press.ts write it. `act` names one of the known acts in src/server/lib/one-press.ts and
-- `inputs` holds that act's fixed inputs; the row holds no command and no text that runs.
--
-- `state` is `waiting`, `done`, `could-not`, `refused` or `withdrawn`. There is no CHECK constraint, for the reason
-- `send_key` gives in 0188: the words are declared once, in src/server/lib/one-press.ts.
--
-- ADDITIVE, AND IT REWRITES NOTHING. One CREATE TABLE and one index.
CREATE TABLE IF NOT EXISTS `one_press_requests` (
  `id` text PRIMARY KEY NOT NULL,
  `workspace_id` text NOT NULL REFERENCES `workspaces`(`id`),
  `act` text NOT NULL,
  `inputs` text NOT NULL CHECK (json_valid(`inputs`)),
  `asked_by` text NOT NULL,
  `shows` text NOT NULL,
  `because` text,
  `state` text NOT NULL,
  `asked_at` text NOT NULL,
  `answered_at` text,
  `answered_by_kind` text,
  `answered_by_id` text,
  `outcome` text
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `one_press_requests_state_idx` ON `one_press_requests` (`state`, `asked_at`);
