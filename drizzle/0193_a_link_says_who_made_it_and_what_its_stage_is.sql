-- TWO FACTS A LINK ROW COULD NOT SAY. Wave 13s, group g1-links.
--
-- `created_by_type`: whether a person, an agent or the office itself made the link.
-- `created_by` holds only an id, such as a person's id or "claude-code", and nothing on the
-- row said which of those is a person. Every other attributed column writes the actor type beside
-- the id. `createLink` in src/server/lib/records.ts now writes one of the words in ACTOR_TYPES here.
--
-- `gate_up_to_sort`: which of three things the stage of a partial gate is.
-- `gate_up_to` accepts a checklist item id, a block id, or a stage in words, and all three were
-- stored and read back the same way. `createLink` now works out which one it is when the link is
-- written, against the record the gate is on, and writes `item`, `block` or `words` here.
--
-- NULL MEANS NOT RECORDED, in both columns, on every row written before this migration. Nothing here
-- fills them in from the change log or from a guess: an old row says it was never recorded, and a
-- reader shows that.
ALTER TABLE `links` ADD `created_by_type` text;--> statement-breakpoint
ALTER TABLE `links` ADD `gate_up_to_sort` text;
