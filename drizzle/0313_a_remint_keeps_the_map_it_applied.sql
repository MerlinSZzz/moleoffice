-- THE RE-MINT KEEPS WHICH STAGED MAP IT APPLIED. Wave 13s round 158, item 30c part 3.
--
-- `npm run db:migrate -- --remint <file>` applies a map that `npm run db:migrate -- --stage-remint <file>` staged. Each
-- legacy agent takes the new id the map gives it, every key to agents.id is rewritten to it, and its old id is filed
-- as an alias. In the same transaction the run writes one row here: the map's digest, the digest of the migrations
-- the map was staged at, and how many agents took a new id. So a second run with the same map finds its own row and
-- writes nothing, and a run with another map finds a row that is not its own and refuses.
-- src/server/db/remint-migration.ts writes and reads it.
--
-- ADDITIVE. One new table, empty. This file changes no row.
CREATE TABLE IF NOT EXISTS `registry_remint_generations` (
  `digest` text PRIMARY KEY NOT NULL,
  `schema_digest` text NOT NULL,
  `agents` integer NOT NULL,
  CONSTRAINT `registry_remint_generations_digest` CHECK (length(`digest`) = 64 AND `digest` NOT GLOB '*[^0-9a-f]*'),
  CONSTRAINT `registry_remint_generations_schema` CHECK (length(`schema_digest`) = 64 AND `schema_digest` NOT GLOB '*[^0-9a-f]*'),
  CONSTRAINT `registry_remint_generations_agents` CHECK (`agents` >= 0)
);
