-- A GROUP, AND WHO IS IN IT.
--
-- Two tables. Nothing is dropped, nothing is rewritten, and no other table is touched.
--
-- CRITERION M11: groups. A group is several subscribers on one message pool, and
-- a message one of them sends goes to every member. A conflict opens a
-- group and puts the owner in it without anybody asking.
--
-- A GROUP HOLDS NO MESSAGES. A message addressed to a group is one message with one delivery row per
-- member, exactly as a message addressed to two people is. `message_delivery` is still the only copy
-- of who a message reached, and nothing here changes it. What these tables hold is who is in the
-- group, so that the fan-out has something to read.
--
-- WHY A MEMBER WHO HAS LEFT KEEPS THEIR ROW. A person may leave a group, and deleting the row would
-- delete the fact that they were ever in it — which is the one fact somebody reading a conflict a
-- month later needs. `left_at` is NULL for a member and holds the moment for somebody who has gone.
-- The unique index is therefore PARTIAL: at most one live membership per participant per group, and
-- as many past ones as there have been. Rejoining writes a new row rather than resurrecting an old
-- one, because joining twice is two acts with two moments.
--
-- `opened_because` AND `joined_because` ARE NOT NULL ON PURPOSE. A group nobody wrote a reason for is
-- one nobody can make sense of later, and the group a conflict opens is exactly the one whose reason
-- matters most. The door refuses an empty sentence with words saying so.
CREATE TABLE IF NOT EXISTS `groups` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`name` text NOT NULL,
	`opened_by_kind` text NOT NULL,
	`opened_by_id` text NOT NULL,
	`opened_because` text NOT NULL,
	`opened_at` text NOT NULL,
	`about` text,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `groups_workspace_idx` ON `groups` (`workspace_id`);--> statement-breakpoint
-- ONE ROW PER OVERLAP THAT OPENED A GROUP, AND THE SAME OVERLAP NEVER OPENS A SECOND ONE. `about`
-- holds the one spelling of an overlap between two work claims — the two participants and the thing
-- they both named — or NULL on a group somebody opened by hand. A unique index over it is what makes
-- "the same overlap never opens a second group" a fact of the database rather than a check somebody
-- has to remember. SQLite treats NULLs as distinct, so any number of hand-opened groups fit under it.
CREATE UNIQUE INDEX IF NOT EXISTS `groups_about_idx` ON `groups` (`about`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `group_members` (
	`id` text PRIMARY KEY NOT NULL,
	`group_id` text NOT NULL,
	`member_kind` text NOT NULL,
	`member_id` text NOT NULL,
	`joined_at` text NOT NULL,
	`joined_because` text NOT NULL,
	`left_at` text,
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `group_members_group_idx` ON `group_members` (`group_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `group_members_member_idx` ON `group_members` (`member_kind`,`member_id`);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `group_members_one_live_per_member_idx` ON `group_members` (`group_id`,`member_kind`,`member_id`) WHERE `left_at` IS NULL;
