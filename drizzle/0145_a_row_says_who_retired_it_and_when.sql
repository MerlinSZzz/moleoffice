-- WHO RETIRED AN AGENT'S REGISTRY ROW, AND WHEN.
--
-- `retired` and `retired_because` have been on `agents` since drizzle/0114. They say THAT a row is
-- retired and WHY. Nothing said WHEN and nothing said WHO, because until now the only writer was
-- `retireWhateverWasStartedFor` in src/server/lib/claims.ts — an office releasing its own claim, and
-- an office is not a name a reader wants beside a retirement.
--
-- WHAT MADE THE PROBLEM: the coordinator removed the Codex agent's record. That agent's registry row stayed in the Embassy as an
-- active contact, because nothing retires a registry row: PATCH /api/participants/agent/<id> does
-- not take `retired`, and the agent had no claim to release. The row was meant to go and
-- it was still there.
--
-- SO THERE IS A DOOR NOW — POST /api/participants/agent/<id>/retire, the person's press or that
-- agent's own starter's — and a door needs to record who used it. Three columns.
--
-- NULL EXACTLY TOGETHER WITH `retired` BEING FALSE, and null on any row a claim release retired
-- before this existed: nobody recorded the moment, and writing one in now would be inventing it.
-- The fifth invariant: an absence beats a guess.
--
-- ADDITIVE, AND IT REWRITES NOTHING. Three ALTER TABLE ADD COLUMN and no UPDATE.
ALTER TABLE `agents` ADD `retired_at` text;--> statement-breakpoint
ALTER TABLE `agents` ADD `retired_by_kind` text;--> statement-breakpoint
ALTER TABLE `agents` ADD `retired_by_id` text;
