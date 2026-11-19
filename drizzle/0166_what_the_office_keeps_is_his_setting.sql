-- WHAT THE OFFICE KEEPS, AS THE PERSON'S OWN SETTING. Criterion U6 of design/settings/ACCEPTANCE.md.
--
-- It is in the
-- settings, so the person may adjust it. By default the office keeps three copies of the database.
--
-- IT IS A COLUMN ON `installation` AND NOT A TABLE OF ITS OWN, for the reason drizzle/0152 gives in
-- this repository's own words: the office has one installation row and these are the office's own
-- facts, and "a settings table would be a place for any future setting to go, which is the sixth
-- rule of CLAUDE.md." The three window columns P83 added in 0165 are the precedent beside these.
--
-- NULL MEANS NOBODY HAS CHOSEN, and then the default applies and the Settings panel says so. That is
-- the pattern `media_load` sets: a reader is told "nobody has chosen" rather than handed the default
-- as though it were the person's choice. A value that is present and cannot be read is a refusal
-- that names the setting, never a quiet default.
--
-- ADDITIVE, AND IT REWRITES NOTHING. Three ALTER TABLE ADD COLUMN statements and no UPDATE. Writing
-- a default into the row would say the person had chosen when nobody had.
ALTER TABLE `installation` ADD COLUMN `keep_backups` integer;--> statement-breakpoint
ALTER TABLE `installation` ADD COLUMN `untraced_request_days` integer;--> statement-breakpoint
ALTER TABLE `installation` ADD COLUMN `traced_request_days` integer;
