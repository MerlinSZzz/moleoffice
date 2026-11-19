-- Give this installation somewhere to say which projects it holds, and give the change log
-- somewhere to say which project each change happened in.
--
-- ADDITIVE, AND NOT A ROW REWRITE. One new table, one new nullable column, one new index. No
-- existing value is read or changed by this file and no table is rebuilt, so this migration is NOT
-- an exception under decision 13 and is not on the REBUILDS list in tests/migration.test.ts.
--
-- `IF NOT EXISTS` IS ADDED BY HAND, as it is on every generated migration in this folder except
-- 0000. drizzle-kit emits bare statements; the house rule and its reasons are in the header of
-- src/server/db/schema.ts. `ALTER TABLE ... ADD COLUMN` has no such form in SQLite and needs none:
-- the journal is what stops it running twice.
--
-- `changes.workspace_id` ARRIVES NULL ON EVERY ROW AND THAT IS DELIBERATE, for the same reason
-- 0005 left `records.origin` empty. NULL here means nobody can say which project this change
-- belongs to. The values are written afterwards by src/server/db/workspace-migration.ts, which
-- copies each row's workspace from the record the change is about, and leaves NULL — counted, and
-- reported in words — on any row whose record is missing. A default of 'default' in this file
-- would have stated 1,031 judgements nobody made, in the direction that hides the ones the column
-- exists to find.
--
-- NO WORKSPACE ROW IS SEEDED HERE EITHER. A `.sql` file cannot tell whether the database it is
-- running against holds the measured corpus, and the workspaces this installation actually has are
-- decided by evidence in workspace-migration.ts. What it CAN say is that a database that has
-- records has the default workspace, and that is exactly what that migration ensures first.
CREATE TABLE IF NOT EXISTS `workspaces` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`note` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `changes` ADD `workspace_id` text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `changes_workspace_at_idx` ON `changes` (`workspace_id`,`at`);
