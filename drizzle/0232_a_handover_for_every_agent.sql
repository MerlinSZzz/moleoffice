-- A HANDOVER DOCUMENT FOR EVERY AGENT. Wave 13k round 46, on the person's decisions madeUpqanvlv (point 2: handover
-- sessions may be built) and madeUpkcznsw (item 2: every agent keeps a handover document, so work can be handed over
-- quickly).
--
-- APPEND-ONLY. A new handover is a new row. The newest row for an agent is its current handover, and the rows before
-- it are its history. Nothing updates or deletes a row: the only writer, src/server/lib/handovers.ts, inserts.
--
-- `agent_id` is the lasting registry id (`agents.id`), never a handle. `written_by_kind` is `agent` (the agent itself,
-- proved by its own key) or `person`, and `written_by_id` is the id in that registry. `written_at` is the office's
-- local wall clock when the row was written. `session_id` is the run the request's session header named, or NULL
-- when it named none.
--
-- ADDITIVE, AND IT REWRITES NOTHING. One CREATE TABLE and one index.
CREATE TABLE IF NOT EXISTS `handovers` (
  `id` text PRIMARY KEY NOT NULL,
  `agent_id` text NOT NULL,
  `workspace_id` text NOT NULL REFERENCES `workspaces`(`id`),
  `text` text NOT NULL,
  `written_at` text NOT NULL,
  `written_by_kind` text NOT NULL,
  `written_by_id` text NOT NULL,
  `session_id` text
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `handovers_agent_idx` ON `handovers` (`agent_id`, `written_at`);
