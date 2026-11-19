-- HOW ONE PERSON HAS ARRANGED THEIR CONTACTS LIST.
--
-- Two tables, and both hold ONLY WHAT SOMEBODY CHANGED. Criterion M29, from the owner on 4
-- September. Contacts are grouped, first into three groups: human, agent and special. The
-- coordinator is in special and the other agents are in agent. A person may add groups of their
-- own and choose the order.
--
-- THE THREE GROUPS ARE NOT ROWS. `src/shared/contacts.ts` declares human, agent and special with
-- their names and their order, and every contact falls into one by what it is: a person into human,
-- an agent into agent, the coordinator into special, a writer nobody registered into agent.
-- So a fresh installation has this arrangement with nothing written, and a new
-- agent lands in agent with nothing written when it arrives. The rejected alternative was to write
-- three rows per person the first time the list is read: that makes a read write, and it leaves no
-- way to tell a name a person chose from a name the product wrote down for them. Builder AZ's design,
-- note `L39Ok3NWQwPc`.
--
-- WHOSE ARRANGEMENT IT IS, ON EVERY ROW. An arrangement belongs to somebody: two people reading the
-- same installation see the same contacts and may want them in different groups.
--
-- NEITHER TABLE NAMES A PROJECT, and that is deliberate. Which group an agent belongs in is a fact
-- about that agent, and the registries these rows arrange are the installation's, not a project's —
-- the same person and the same agent are in every project on this machine. A workspace column would
-- mean a person had to make their groups again in every project. `assets`, `people` and `agents` are
-- installation-level for the same reason.
--
-- THERE IS NO COLUMN SAYING WHETHER SOMEBODY MADE A GROUP, because its `key` already says. The three
-- the product declares are keyed `human`, `agent` and `special`; a group somebody made is keyed by a
-- fresh id. A column would be the same fact stored twice, free to disagree with the key beside it.
--
-- `at` IS AN ORDER SOMEBODY SET AND NEVER A DEFAULT. A group nobody has reordered has no row here at
-- all, and its place comes from the declaration. Moving one thing writes an `at` for everything in
-- that group, because a swap needs both sides to have a number; what stays true is that a group
-- nobody touched has no rows.

CREATE TABLE IF NOT EXISTS `contact_groups` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_kind` text NOT NULL,
	`owner_id` text NOT NULL,
	`key` text NOT NULL,
	`name` text NOT NULL,
	`at` integer NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `contact_groups_one_per_owner_idx` ON `contact_groups` (`owner_kind`,`owner_id`,`key`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `contact_groups_owner_idx` ON `contact_groups` (`owner_kind`,`owner_id`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `contact_placements` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_kind` text NOT NULL,
	`owner_id` text NOT NULL,
	`contact` text NOT NULL,
	`group_key` text,
	`at` integer,
	`placed_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `contact_placements_one_per_contact_idx` ON `contact_placements` (`owner_kind`,`owner_id`,`contact`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `contact_placements_owner_idx` ON `contact_placements` (`owner_kind`,`owner_id`);
