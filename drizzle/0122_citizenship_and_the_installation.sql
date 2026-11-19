-- WHICH WORLD EACH PERSON AND EACH AGENT IS A CITIZEN OF, AND WHICH INSTALLATION THIS DATABASE IS.
--
-- Three columns on each of the two registries, and one small table. Nothing is dropped, nothing is
-- renamed and nothing already stored is rewritten.
--
-- CRITERION C1 of design/messages/ACCEPTANCE.md section 8, from the owner on 4 September 2026. Every
-- person and every agent registers in a world. Registering in a world is becoming a citizen of it;
-- the main world is the default home.
--
-- A WORLD IS ONE RUNNING MOLE OFFICE WITH ONE DATABASE, and its identity is that database's identity
-- — the sixteen hex characters src/config/database-identity.mjs works out from the file's path and
-- its creation time. `home_world` holds that, and `home_installation` holds the installation the
-- world belongs to. Neither is a foreign key: the office (migration 0123) lives in the main world
-- alone, and these two tables are in every world's database, so a key would resolve in one database
-- and dangle in all the others.
--
-- `citizen_since` IS THE MOMENT OF REGISTRATION, because registering is what makes a
-- citizen. For a row that already exists when this runs, that moment is its own `created_at`: the
-- row has been in this
-- database since it was written, so it has been of this world since it was written. Nothing is
-- guessed by saying so, and the migration is not writing "today" over an older fact.
--
-- ALL THREE ARE NULLABLE AND NULL MEANS NOBODY COULD SAY. A database whose file the filesystem
-- records no creation time for has no identity at all — database-identity.mjs answers `unknown`
-- rather than hashing a zero — and a row whose world could not be read is left empty rather than
-- given an invented one.
--
-- THE COLUMNS ARE FILLED BY A DATA STEP AND NOT BY SQL, because the world's identity is a hash of
-- the database FILE and SQL cannot read the file it is running inside. `migrateCitizenship` in
-- src/server/db/citizenship-migration.ts is that step; it says how many rows it made citizens, and
-- it does nothing on a second run.
--
-- `installation` HOLDS ONE ROW AND THE CHECK IS WHAT MAKES THAT TRUE. An installation is one
-- person's Mole Office on one machine: the canonical stack, every worktree of it, and every scratch
-- world any of them starts. The id is worked out from the declaration the FIRST time this database
-- is migrated and then never rewritten, so a copy of the database carries the installation it was
-- copied from, which is what a copy is. Criterion C2 puts the same value on every world row so that
-- two offices can be told apart if they ever have to talk to each other.
--
-- THIS FILE WAS GENERATED AND THEN CUT BACK BY HAND, which is what every recent migration here has
-- been. `drizzle-kit generate` had no snapshot newer than 0111 to compare against, so it re-emitted
-- eleven migrations' worth of tables it had already written. The number and the journal entry are
-- the generator's, as tests/migration-numbering.test.ts requires; the statements are the six columns
-- and the one table this criterion asks for and nothing else. `drizzle/meta/0122_snapshot.json` is
-- kept beside it so the next generate compares against this schema rather than 0111's.
--
-- SAFE TO RUN TWICE. `ADD COLUMN` is not, in SQLite, and it does not have to be: drizzle applies a
-- migration once and journals it, and the whole run is one transaction. The table below carries
-- IF NOT EXISTS anyway, which costs nothing and matches every other file here.
ALTER TABLE `people` ADD `home_world` text;--> statement-breakpoint
ALTER TABLE `people` ADD `home_installation` text;--> statement-breakpoint
ALTER TABLE `people` ADD `citizen_since` text;--> statement-breakpoint
ALTER TABLE `agents` ADD `home_world` text;--> statement-breakpoint
ALTER TABLE `agents` ADD `home_installation` text;--> statement-breakpoint
ALTER TABLE `agents` ADD `citizen_since` text;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `installation` (
	`only_row` integer PRIMARY KEY NOT NULL,
	`id` text NOT NULL,
	`how` text NOT NULL,
	`written_at` text NOT NULL,
	CONSTRAINT "installation_holds_one_row" CHECK(only_row = 1)
);
