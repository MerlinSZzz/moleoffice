-- HOW FAR OUT A GOAL REACHES, AS THE PERSON'S OWN SETTING. Criterion P1 of design/planning/ACCEPTANCE.md.
--
-- The spans are a SETTING, so
-- the person may adjust them: short is within two weeks, medium within two months, long within a year,
-- and distant has no time limit at all.
--
-- IT IS A COLUMN ON `installation` AND NOT A TABLE OF ITS OWN, for the reason drizzle/0152 gives in
-- this repository's own words: the office has one installation row and these are the office's own
-- facts, and "a settings table would be a place for any future setting to go, which is the sixth
-- rule of CLAUDE.md." The three numbers drizzle/0166 added to the same row are the precedent beside
-- these.
--
-- THREE COLUMNS AND NOT FOUR. Distant has no time limit, so there is no number to
-- store for it; a fourth column that must always be NULL would say "nobody has chosen" about a thing
-- nobody can choose. See src/shared/goal-spans.ts for the whole reason.
--
-- NULL MEANS NOBODY HAS CHOSEN, and then the default applies and the Settings section says so. A
-- value that is present and cannot be read is a refusal that names the setting, never a quiet default.
--
-- ADDITIVE, AND IT REWRITES NOTHING. Three ALTER TABLE ADD COLUMN statements and no UPDATE. Writing
-- a default into the row would say the person had chosen when nobody had.
ALTER TABLE `installation` ADD COLUMN `goal_short_days` integer;--> statement-breakpoint
ALTER TABLE `installation` ADD COLUMN `goal_medium_days` integer;--> statement-breakpoint
ALTER TABLE `installation` ADD COLUMN `goal_long_days` integer;
