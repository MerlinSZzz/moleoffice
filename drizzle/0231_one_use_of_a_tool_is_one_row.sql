-- ONE USE OF A TOOL, ONE ROW. Wave 13s round 33, problem mR8vNPOVNQ_p.
--
-- Until now a use of a tool was a line in `data.toolUses` on the calling run's record, so every use rewrote the
-- record and wrote a revision holding the whole list again. From now on the use door writes one row here and
-- nothing else.
--
-- THE MOVE OF THE LISTS ALREADY STORED IS THE DATA HALF OF THIS MIGRATION, in src/server/db/tool-uses-migration.ts.
-- It runs in the same `npm run db:migrate`, inside the one transaction every data step shares, because taking
-- the list off a run's current data must also write the revision that holds what the run now holds, and that
-- revision's content hash is worked out in TypeScript. SQL cannot write it.
--
-- ADDITIVE, AND IT REWRITES NOTHING. One CREATE TABLE and one unique index.
CREATE TABLE IF NOT EXISTS `tool_uses` (
  `id` text PRIMARY KEY NOT NULL,
  `workspace_id` text NOT NULL REFERENCES `workspaces`(`id`),
  `run_id` text NOT NULL,
  `seq` integer NOT NULL,
  `at` text NOT NULL,
  `tool` text NOT NULL,
  `said` text NOT NULL,
  `actor_type` text,
  `actor_id` text,
  `moved_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `tool_uses_run_seq_idx` ON `tool_uses` (`run_id`, `seq`);
