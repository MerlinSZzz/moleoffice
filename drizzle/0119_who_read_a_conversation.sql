-- WHO READ A CONVERSATION THEY WERE NOT PART OF, WHICH ONE, FROM WHICH SIDE, AND WHEN.
--
-- One table. Nothing is dropped, nothing is rewritten, and no other table is touched.
--
-- CRITERION M12 SAYS THE READ IS RECORDED. It was, and the row did not last. `GET
-- /api/messages/between/<pair>?as=<agent>` left a row in `api_calls` carrying who asked, when, and
-- which pair. The browser sends no `x-mole-office-trace` header, so that row is untraced, and
-- `pruneUsage` in src/server/lib/usage-reads.ts deletes untraced `api_calls` rows after fourteen
-- days and writes no summary for them, because a row in no trace is in no stretch. After a
-- fortnight nothing anywhere said the read had happened.
--
-- THE DECISION IT CORRECTS WAS RIGHT ABOUT THE PRINCIPLE. An earlier decision
-- put the read on the existing ledger rather than in a table of its own, so that one
-- fact would not be in two places. That instinct is this repository's own rule. What nobody checked
-- is that the ledger it chose forgets: `api_calls` is traffic, kept so that usage can be counted,
-- and it is pruned on purpose. A person reading a conversation between two agents is an act, not
-- traffic, and the whole reason M12 records it is that it is the kind of act whose record has to
-- outlive a fortnight.
--
-- IT IS NOT THE SAME FACT TWICE. The `api_calls` row says a request arrived and is deleted when the
-- traffic it belongs to is no longer counted. This row says a person read a conversation, and it is
-- kept. Nothing derives one from the other and no screen reads both.
--
-- WHEN IT WAS MADE, ONE ROW PER READ AND NO UNIQUE INDEX. Reading the same conversation again was a
-- second act, and the product was to be able to say when each one happened. What a screen draws is
-- the newest. Since migration 0278 (wave 13s round 64) the table keeps only that newest read of each
-- reader in each conversation in each project, under a unique index.
CREATE TABLE IF NOT EXISTS `conversation_reads` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`reader_kind` text NOT NULL,
	`reader_id` text NOT NULL,
	`pair` text NOT NULL,
	`as_side` text NOT NULL,
	`at` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `conversation_reads_pair_idx` ON `conversation_reads` (`workspace_id`,`pair`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `conversation_reads_reader_idx` ON `conversation_reads` (`reader_kind`,`reader_id`);
