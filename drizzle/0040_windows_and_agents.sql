-- Four new tables: when somebody means to work on something, and talking to an agent.
--
-- ADDITIVE. Nothing existing is touched, no row is read, moved or rewritten, and nothing is taken
-- away. Every statement is `IF NOT EXISTS`, so running this against a database that has already
-- been through it does nothing.
--
-- ONE MIGRATION FOR FOUR TABLES because they arrive together and a database halfway through them
-- is a state nobody wants to reason about. They are two ideas, and the file says which is which.
--
-- ---------------------------------------------------------------------------------------
-- `work_windows` — WHEN, NOT HOW MUCH
-- ---------------------------------------------------------------------------------------
--
-- A person may place a piece of work across a span of days, for example from a Thursday to
-- the next Wednesday, without first working out how many hours belong on each day. A window says
-- the person means to work on it in those days.
--
-- A WINDOW NEVER CONTRIBUTES HOURS TO ANY TOTAL. It answers when, not how much. Hours stay the job
-- of `allocations`, and every total in src/shared/planning.ts reads that table and reads nothing
-- here. A surface that added a window into a week's load would be claiming the person had committed
-- hours they never said.
--
-- TWO COLUMNS HERE WHERE `allocations` HAS ONE ON PURPOSE. The comment on `allocations.period` says
-- why it is a single string: two columns can describe a week eight days long and one period key
-- cannot. A window is the opposite case — it IS a start and an end, and it may run from a Thursday
-- to the following Wednesday, which no period key can name. Both ends are `YYYY-MM-DD` and both are
-- included, so `2026-08-20` to `2026-08-26` is seven days. The keys are built and read through
-- `periodKey` and `parsePeriod` in src/shared/planning.ts, so this adds no second date reader.
--
-- `state` is planned, done or dropped. `done` completes THE WINDOW and says nothing about the work,
-- exactly as an allocation's `done` completes that slice of time and nothing else.
--
-- No workspace column, like `allocations` and `planning_capacity` and for the settled reason: a
-- person's week holds work from every project.
--
-- ---------------------------------------------------------------------------------------
-- `agent_threads`, `agent_messages`, `agent_runs` — DECLARED, NOT YET USED
-- ---------------------------------------------------------------------------------------
--
-- The agent layer's storage, created here so that layer is built against a schema rather than
-- beside one. NO ROUTE, NO LIBRARY AND NO SCREEN READS OR WRITES ANY OF THEM YET, and that is
-- deliberate rather than unfinished: the tables and the code arrive in separate waves on purpose.
--
-- A thread is a conversation. `mode` is `direct` (each message is sent as it is written) or
-- `review` (messages collect and go together when the person finishes). That is one grammar with
-- two dispatch times rather than two features.
--
-- A message is one thing said. `position` is a real number so a message written between two others
-- takes the midpoint and no other row moves — the same rule `plan_lines.position` follows. `context`
-- is JSON saying what the message points at, with any quoted text kept, so a comment still says
-- what it was about after the text underneath it changes.
--
-- A run is one bounded attempt. It is QUEUED here and a worker claims it; this server never starts
-- a process, and tests/os-boundary.test.ts fails any file under src/ that does. `claimed_by` NULL
-- means nobody has picked it up, which is a real answer and is what a screen should say.
-- `request` is written once, because an answer can only be read against the question that produced
-- it.
--
-- `agent_messages` and `agent_runs` carry no workspace column: the thread they name has one, and a
-- copy would be the same fact in two places. src/server/db/schema.ts records, above
-- `PERSON_LEVEL_TABLES`, what has to happen before a project-scoped archive can carry them.
--
-- NUMBERED WELL CLEAR OF THE MIGRATIONS AROUND IT, the way 0020 and 0030 were and for the same
-- reason: several agents add one at the same time. Drizzle applies journal entries in order of
-- their `when`, so the gap in the numbers costs nothing.

CREATE TABLE IF NOT EXISTS `work_windows` (
	`id` text PRIMARY KEY NOT NULL,
	`record_id` text NOT NULL,
	`starts_on` text NOT NULL,
	`ends_on` text NOT NULL,
	`note` text,
	`state` text DEFAULT 'planned' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `work_windows_record_idx` ON `work_windows` (`record_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `work_windows_starts_idx` ON `work_windows` (`starts_on`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `agent_threads` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`title` text NOT NULL,
	`mode` text NOT NULL,
	`state` text DEFAULT 'open' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `agent_threads_workspace_idx` ON `agent_threads` (`workspace_id`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `agent_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`thread_id` text NOT NULL,
	`position` real NOT NULL,
	`role` text NOT NULL,
	`intent` text NOT NULL,
	`body` text NOT NULL,
	`context` text,
	`state` text DEFAULT 'queued' NOT NULL,
	`created_at` text NOT NULL,
	`created_by` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `agent_messages_thread_idx` ON `agent_messages` (`thread_id`,`position`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `agent_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`thread_id` text NOT NULL,
	`runtime` text NOT NULL,
	`state` text DEFAULT 'queued' NOT NULL,
	`claimed_by` text,
	`claimed_at` text,
	`request` text NOT NULL,
	`result` text,
	`error` text,
	`started_at` text,
	`ended_at` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `agent_runs_state_idx` ON `agent_runs` (`state`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `agent_runs_thread_idx` ON `agent_runs` (`thread_id`);
