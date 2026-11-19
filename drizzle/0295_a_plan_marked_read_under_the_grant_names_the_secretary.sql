-- A PLAN MARKED AS READ UNDER THE PERSON'S GRANT NAMES THE SECRETARY THAT MARKED IT. Wave 13s round 81.
--
-- Marking a plan as read moves `read_at`, and the plan's page counts the lines written since then by somebody else. The
-- door used to refuse every caller but a person. It now asks what the person's grant carries, as a door of its own that
-- the secretary card keeps for the person by default. Where this office's list lets the grant press it, a secretary may
-- mark a plan as read for the person. That mark is not the person's reading, so the plan keeps who made it, beside
-- `read_at`, and the page says which secretary marked it.
--
-- `read_by_agent` is the registry id of the secretary that marked the plan as read under the grant, and
-- `read_under_grant` is the id of the grant it pressed under. Both are NULL when a person marked it, and a person's own
-- mark sets both back to NULL. NULL in both is also every row written before this migration, when only a person could
-- mark a plan as read.
--
-- ADDITIVE, AND IT REWRITES NOTHING. Two ALTER TABLE ADD COLUMN and no UPDATE.
ALTER TABLE `plans` ADD COLUMN `read_by_agent` text;
--> statement-breakpoint
ALTER TABLE `plans` ADD COLUMN `read_under_grant` text;
