-- WHETHER THE MESSAGE WORKER STARTS CHECKS IN MERGES-ONLY MODE, AND THE FORK BASES A SEAL IS REFUSED ON. Wave 13j round
-- loop-1, task "every round ends sealed or says why" (module HoSzb82KlTHJ). In merges-only mode the worker started no
-- check at all, so a seal asked for a check that nothing ran (13k round 47b sat six hours unchecked).
--
-- COLUMNS ON `installation`, because each is one fact about the office, as 0213 and 0230 put the office's other settings
-- there. Neither is one of the owner's decided numbers, so the secretary card may change them, with a reason.
--
-- `checks_in_merges_only`: NULL MEANS NOBODY HAS CHOSEN, and it reads as off. 1 is on and 0 is off.
-- `stale_fork_bases`: NULL MEANS NOBODY HAS LISTED ANY. Otherwise a JSON list of full commit ids.
-- The one reader and writer of both is src/server/lib/checks-in-merges-only.ts, and it refuses any other value.
--
-- IT IS 0251, INDEX 251, as the round's brief gives it; numbers 0232 to 0250 are other waves'. Since round 17d a migration
-- from index 212 on is applied because its hash is missing (src/config/migration-look.mjs), so its "when" decides nothing.
--
-- ADDITIVE, AND IT REWRITES NOTHING. Two ALTER TABLE ADD COLUMN and no UPDATE.
ALTER TABLE `installation` ADD COLUMN `checks_in_merges_only` integer;
--> statement-breakpoint
ALTER TABLE `installation` ADD COLUMN `stale_fork_bases` text;
