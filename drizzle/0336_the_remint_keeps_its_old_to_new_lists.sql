-- THE RE-MINT KEEPS ITS OLD-TO-NEW LISTS IN ONE NEW TABLE. Wave 13s round 257.
--
-- The rewrite gives every legacy agent a new id and remakes the content hashes and seal pins of what holds one. A
-- later rewrite of an old id in a link changes the hash a seal pinned that link's row by.
-- A seal whose content the rewrite remade gets a new own hash.
-- Each row keeps one pair of an old value and its new one, for one of five lists, in one generation:
--
--   agent_id      an agent's old id and its new id.
--   content_hash  a revision's old content hash and its new one. A revision's content hash is HASH_CHARS lowercase
--                 hex characters (16 today), the shape src/server/lib/version.ts makes.
--   seal_hash     the old hash a seal pinned a revision row by, and the new hash of that row over the same list of
--                 columns. Each is 64 lowercase hex characters, a sha256.
--   link_hash     the old hash a seal pinned a link's row by, and the new hash of that row over the same list of
--                 columns. Each is 64 lowercase hex characters, a sha256, and the row names the link by link_id.
--   seal_own_hash a seal's old own hash and the own hash of its rewritten content. Each is 64 lowercase hex
--                 characters, the sha256 sealHash in src/server/lib/sealed-tip.ts makes.
--
-- A content_hash, seal_hash or seal_own_hash row names the revision it is about by its record and its 1-based seq; a
-- link_hash row names its link by link_id. An agent_id row names none of the three. Three unique indexes keep one new
-- id for each old agent id and one new hash for each old seal or link hash, one content-hash pair for each revision,
-- and one own-hash pair for each seal revision, in a generation. A revision can hold a content-hash pair and an
-- own-hash pair, because the rewrite changes both when it remakes a seal. The primary key is the whole row: every
-- column is in it, so an import matches a stored row only by the whole row. SQLite keeps that key in an automatic
-- index of its own, and the three unique indexes are the only ones this file names.
--
-- The rewrite writes it inside the one transaction the migration command runs every step in. The re-mint verifier
-- and the export verifier read it. Every archive carries it: every export writes its rows, every import reads the
-- stored rows and adds each archive row it does not hold yet, and the restore proof compares it. No door reads it to
-- tell which agent an id names.
--
-- ADDITIVE. One new table, empty. This file changes no row.
CREATE TABLE IF NOT EXISTS `registry_remint_kept_lists` (
  `generation` text NOT NULL REFERENCES `registry_remint_generations`(`digest`),
  `list` text NOT NULL,
  `record_id` text,
  `seq` integer,
  `link_id` text,
  `old` text NOT NULL,
  `new` text NOT NULL,
  CONSTRAINT `registry_remint_kept_lists_key` PRIMARY KEY (`generation`, `list`, `record_id`, `seq`, `link_id`, `old`, `new`),
  CONSTRAINT `registry_remint_kept_lists_generation` CHECK (length(`generation`) = 64 AND `generation` NOT GLOB '*[^0-9a-f]*'),
  CONSTRAINT `registry_remint_kept_lists_list` CHECK (`list` IN ('agent_id', 'content_hash', 'seal_hash', 'link_hash', 'seal_own_hash')),
  CONSTRAINT `registry_remint_kept_lists_names_its_subject` CHECK (
    (`list` = 'agent_id' AND `record_id` IS NULL AND `seq` IS NULL AND `link_id` IS NULL)
    OR (`list` IN ('content_hash', 'seal_hash', 'seal_own_hash') AND `record_id` IS NOT NULL AND `seq` IS NOT NULL AND `seq` >= 1 AND `link_id` IS NULL)
    OR (`list` = 'link_hash' AND `link_id` IS NOT NULL AND `record_id` IS NULL AND `seq` IS NULL)
  ),
  CONSTRAINT `registry_remint_kept_lists_differ` CHECK (`old` <> `new`),
  CONSTRAINT `registry_remint_kept_lists_content_hash` CHECK (
    `list` <> 'content_hash' OR (
      length(`old`) = 16 AND `old` NOT GLOB '*[^0-9a-f]*' AND
      length(`new`) = 16 AND `new` NOT GLOB '*[^0-9a-f]*'
    )
  ),
  CONSTRAINT `registry_remint_kept_lists_seal_hash` CHECK (
    `list` <> 'seal_hash' OR (
      length(`old`) = 64 AND `old` NOT GLOB '*[^0-9a-f]*' AND
      length(`new`) = 64 AND `new` NOT GLOB '*[^0-9a-f]*'
    )
  ),
  CONSTRAINT `registry_remint_kept_lists_link_hash` CHECK (
    `list` <> 'link_hash' OR (
      length(`old`) = 64 AND `old` NOT GLOB '*[^0-9a-f]*' AND
      length(`new`) = 64 AND `new` NOT GLOB '*[^0-9a-f]*'
    )
  ),
  CONSTRAINT `registry_remint_kept_lists_seal_own_hash` CHECK (
    `list` <> 'seal_own_hash' OR (
      length(`old`) = 64 AND `old` NOT GLOB '*[^0-9a-f]*' AND
      length(`new`) = 64 AND `new` NOT GLOB '*[^0-9a-f]*'
    )
  ),
  CONSTRAINT `registry_remint_kept_lists_new_agent_id` CHECK (`list` <> 'agent_id' OR length(`new`) = 12)
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `registry_remint_kept_lists_old_idx` ON `registry_remint_kept_lists` (`generation`,`list`,`old`) WHERE `list` IN ('agent_id', 'seal_hash', 'link_hash');
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `registry_remint_kept_lists_revision_idx` ON `registry_remint_kept_lists` (`generation`,`record_id`,`seq`) WHERE `list` = 'content_hash';
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `registry_remint_kept_lists_seal_own_hash_idx` ON `registry_remint_kept_lists` (`generation`,`record_id`,`seq`) WHERE `list` = 'seal_own_hash';
