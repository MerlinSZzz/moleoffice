-- THE TOPS OF THE THREE RANGES THE OFFICE'S OWN LOAD IS READ AGAINST. Wave 13y round 21, on the owner's decision
-- madeUppdntjl: the office shows its own read time, CPU and memory, and the secretaries are told once when one of them
-- stays out of range.
--
-- THREE COLUMNS ON `installation`, because each is one fact about the office, as 0175, 0208 and 0213 put the office's
-- other settings there. They are not the owner's decided numbers, so the secretary card may change them, with a reason.
--
-- NULL MEANS NOBODY HAS CHOSEN, and the default in src/shared/office-load.ts is in force. The one reader and writer is
-- src/server/lib/office-load.ts, and it refuses a stored value outside the bounds declared there.
--
-- IT IS 0223, INDEX 223, the number argus gave in the brief for round 21. Since round 17d a migration from index 212 on is applied
-- because its hash is missing, not because its "when" is later, so this one's "when", 1791368770091, decides nothing.
--
-- ADDITIVE, AND IT REWRITES NOTHING. Three ALTER TABLE ADD COLUMN and no UPDATE.
ALTER TABLE `installation` ADD COLUMN `load_read_ms_top` integer;
--> statement-breakpoint
ALTER TABLE `installation` ADD COLUMN `load_cpu_percent_top` integer;
--> statement-breakpoint
ALTER TABLE `installation` ADD COLUMN `load_memory_mb_top` integer;
