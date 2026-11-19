-- A ROUTER CREDENTIAL NAMES ITS KIND: the run's Casting credential, or a tool's own. Wave 13q round 88.
--
-- A run may hold two router credentials at once, one for the pair its Casting row gives the run's bridge and one for
-- the single pair a tool asks for. Each row keeps its own token hash, its own one provider and model pair, its own
-- expiry and the run's one spending cap. The kind says which door may use the row: `casting` for the run's bridge and
-- `tool` for POST /api/provider-router/tool-requests.
--
--   kind  `casting` or `tool`. Every row written before this file read `casting`, because a run's only credential
--         until now was the one its Casting row gave it.
--
--   run_tokens_current_idx  one live row per run and kind, in place of one live row per run. A revoked row does not
--                           count, so a replacement can leave its history and the two kinds can stand together.
--
-- ADDITIVE. One column with a default, and the index is dropped and made again over the same rows. No row is rewritten
-- by a statement, and no statement removes a row.
ALTER TABLE `run_tokens` ADD COLUMN `kind` text NOT NULL DEFAULT 'casting';
--> statement-breakpoint
DROP INDEX IF EXISTS `run_tokens_current_idx`;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `run_tokens_current_idx` ON `run_tokens` (`run_id`,`kind`) WHERE `revoked_at` IS NULL;
