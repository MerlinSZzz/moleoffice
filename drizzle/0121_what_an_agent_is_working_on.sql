-- WHAT AN AGENT IS WORKING ON, AND UNTIL WHEN.
--
-- One table. Nothing is dropped, nothing is rewritten, and no other table is touched.
--
-- CRITERION M13, which absorbs an earlier proposal: an agent registers
-- what it is working on, including which folders or files it holds. When two agents' registrations
-- conflict, the conflict is to be settled through messages.
--
-- WHAT A CLAIM NAMES IS A LIST, AND IT IS A JSON COLUMN RATHER THAN A SECOND TABLE. A claim names a
-- few records and paths, and the question asked of it is "does anything in this list overlap
-- anything in that list", which is answered over the live claims — one per running agent, so a
-- handful. A second table would let SQL index the things, and it would also make one claim two rows
-- that can disagree about whether it exists. The cost of this choice is written down: overlap is
-- worked out in TypeScript by reading every live claim, and if this ever holds thousands of live
-- claims that read will have to become a join.
--
-- THE LEASE IS NOT A CLOCK. `released_at` is set when whoever made the claim says they are finished.
-- Otherwise the claim ends when its run ends, and how that is read is in src/server/lib/claims.ts:
-- the ledger's registered process where there is one, and the session record's own state where there
-- is not. There is no expiry time, because a number of minutes would be a guess about how long work
-- takes, and a claim that expired while the run was still going is exactly the wrong answer.
--
-- `renewed_at` IS THE RUN SAYING IT IS STILL HERE. It changes nothing about when the lease ends; it
-- is drawn, so a reader can tell a claim whose run last spoke a minute ago from one that has said
-- nothing since it was filed.
CREATE TABLE IF NOT EXISTS `work_claims` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`claimant_kind` text NOT NULL,
	`claimant_id` text NOT NULL,
	`run` text NOT NULL,
	`things` text NOT NULL,
	`opened_at` text NOT NULL,
	`renewed_at` text,
	`released_at` text,
	`released_because` text,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `work_claims_workspace_idx` ON `work_claims` (`workspace_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `work_claims_claimant_idx` ON `work_claims` (`claimant_kind`,`claimant_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `work_claims_run_idx` ON `work_claims` (`run`);
