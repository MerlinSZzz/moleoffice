-- WHO STARTED AN AGENT, WHAT IT MAY DO, AND WHERE IT WORKS. Four columns on `agents`, all nullable.
--
-- Criterion P2 of design/permissions/ACCEPTANCE.md, from the owner on 6 September 2026. Every
-- started agent is registered under whoever started it. From the same morning: whoever started an
-- agent manages it and answers for it.
--
-- WHAT WAS MISSING. Nothing recorded who started whom. The nearest thing was `created_by_kind` and
-- `created_by_id`, which say who wrote the ROW — a migration, or a person tidying up — and are a
-- different fact. So the refusal an unregistered writer gets could not name the agent it should
-- report to, and the `the parent` answer the `proposal` kind has carried since August could never
-- be used by anything, because nothing knew who the parent was.
--
-- NULL IS AN ANSWER AND IT IS NOT "THE PERSON". Every row in this table today gets NULL in all
-- three, and NULL means nobody recorded it. Reading a missing starter as the owner would make 199
-- unregistered writers the owner's own children on the strength of an absent value.
--
-- THE ROLE WORDS ARE NOT IN THIS FILE AND THERE IS NO CHECK CONSTRAINT. They live in
-- design/permissions/roles.json, which is what the write gate reads, and a second list in SQL would
-- be the same fact in two places — the defect CLAUDE.md names as this repository's own. It is a
-- file rather than TypeScript so that a person can add a role without a code change, because the
-- owner asked for a template a person can change. A row whose role is NULL is read as a worker,
-- and the one place that says so is `A_ROW_WITH_NO_ROLE_READS_AS` in src/shared/roles.ts.
--
-- THE WORK AREA IS THE FOURTH COLUMN, AND IT IS RECORDED RATHER THAN ENFORCED. Criterion P43, from
-- the owner on the afternoon of 6 September 2026: a worker registers the folders and files it works
-- in when it starts, so its changes are easy to find.
-- It holds the folders and files a started agent is there to change, as a JSON array of paths, so
-- that whoever checks the agent afterwards can find the changes rather than reconstruct them. JSON
-- and not one path, because a piece of work is usually a worktree plus a few named files; JSON and
-- not a table, because it is read and written whole and nothing queries one path across agents.
-- NULL means nobody recorded an area, which is what every row here holds today. Nothing is refused
-- for it and no write outside an area is refused: what such a caller should be told is part two.
--
-- ADDITIVE, AND IT REWRITES NOTHING. Four ALTER TABLE ADD COLUMN and no UPDATE, so no stored value
-- moves and this migration is not in DATA_MIGRATIONS.
ALTER TABLE `agents` ADD `started_by_kind` text;--> statement-breakpoint
ALTER TABLE `agents` ADD `started_by_id` text;--> statement-breakpoint
ALTER TABLE `agents` ADD `role` text;--> statement-breakpoint
ALTER TABLE `agents` ADD `work_area` text;
