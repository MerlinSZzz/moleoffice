-- A READINESS CHECKLIST: AN OPERATION WHOSE EFFECT REACHES OTHERS RUNS ONLY AFTER THOSE IT AFFECTS HAVE SIGNED. The
-- owner's decisions madeUpfgtgok and madeUpnjzngw (3 October 2026), wave 13u round 13.
--
-- TWO TABLES AND NOT RECORDS, so no record door can file, sign or cancel one. Only the doors in
-- src/server/api/readiness.ts write them.
--
-- `readiness_checklists` holds one row for one operation on one target. `operation` names one of the gated operations
-- in src/server/lib/readiness.ts, `inputs` holds that operation's fixed inputs, and `on_what` is a hash of the two:
-- a signature names the `on_what` it was given on, so a signature can never be counted for a different operation.
-- `level` and `signers` are worked out by the office when the checklist is raised, never chosen by whoever raised it.
-- `state` is `waiting`, `running`, `ran`, `could-not`, `cancelled` or `expired`. There is no CHECK constraint, for the reason
-- `send_key` gives in 0188: the words are declared once, in src/server/lib/readiness.ts.
--
-- THE GATE IS A LOOKUP. At most one checklist waits for one operation on one target: the partial unique index on
-- (`on_what`) WHERE `state` = 'waiting' finds it, and the signatures are found by their checklist through the unique
-- index on (`checklist_id`, `signer_kind`, `signer_id`). Neither table is scanned.
--
-- `readiness_signatures` holds one row per signer per checklist. A signer who withdraws keeps the row, with
-- `withdrawn_at` set, and may sign again, which clears it.
--
-- ADDITIVE, AND IT REWRITES NOTHING. Two CREATE TABLE statements and three indexes.
CREATE TABLE IF NOT EXISTS `readiness_checklists` (
  `id` text PRIMARY KEY NOT NULL,
  `workspace_id` text NOT NULL REFERENCES `workspaces`(`id`),
  `operation` text NOT NULL,
  `inputs` text NOT NULL CHECK (json_valid(`inputs`)),
  `on_what` text NOT NULL,
  `shows` text NOT NULL,
  `level` text NOT NULL,
  `signers` text NOT NULL CHECK (json_valid(`signers`)),
  `raised_by_kind` text NOT NULL,
  `raised_by_id` text NOT NULL,
  `because` text,
  `state` text NOT NULL,
  `raised_at` text NOT NULL,
  `ends_at` text NOT NULL,
  `closed_at` text,
  `closed_by_kind` text,
  `closed_by_id` text,
  `outcome` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `readiness_checklists_one_waiting_idx` ON `readiness_checklists` (`on_what`) WHERE `state` = 'waiting';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `readiness_checklists_state_idx` ON `readiness_checklists` (`state`, `raised_at`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `readiness_signatures` (
  `id` text PRIMARY KEY NOT NULL,
  `checklist_id` text NOT NULL REFERENCES `readiness_checklists`(`id`),
  `signer_kind` text NOT NULL,
  `signer_id` text NOT NULL,
  `on_what` text NOT NULL,
  `signed_at` text NOT NULL,
  `withdrawn_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `readiness_signatures_one_per_signer_idx` ON `readiness_signatures` (`checklist_id`, `signer_kind`, `signer_id`);
