-- WHICH LIVE SESSION IS ANSWERING AS ONE DURABLE AGENT.
--
-- One table. Nothing is dropped, nothing is rewritten, no other table is touched.
--
-- Criterion H1 of design/messages/ACCEPTANCE.md section 10, from the owner on 5 September 2026. The
-- owner wants one agent to exist as a durable agent that sends and receives all its own messages,
-- rather than a new agent run for each one. When the owner writes to an agent that is open in a
-- terminal, that session is to answer; a fresh run is started only when nobody is there.
--
-- A ROW SAYS: this session record, on this machine, running this tool, is answering as this agent,
-- and it last said so at `last_heard_at`. A script the session starts writes that stamp every few
-- seconds. Nothing else in this database says which of the processes on a machine is a given agent.
--
-- WHY IT IS A TABLE AND NOT A FIELD ON THE SESSION RECORD. A heartbeat is a write every few seconds,
-- and every write to a record's data makes a `changes` row and a `revisions` row. One terminal open
-- for a day would add thousands of both, and the change log a person reads would be almost entirely
-- heartbeats.
--
-- WHY IT IS NOT A `work_claims` ROW EITHER. A second claim that overlaps a live one opens a group
-- with the owner in it (criterion M13). H4 asks for
-- the opposite: a second session claiming a held handle is refused naming the holder, and nothing is
-- signalled. Two rules that different cannot share a table without one being an exception nobody can
-- see.
--
-- THE HANDLE IS NOT A COLUMN HERE. It is on the `agents` row, which `agent_id` names. A copy would
-- be the same fact in two places, free to disagree the first time somebody renames a handle.
--
-- ONE LIVE HOLD PER AGENT IS ENFORCED IN SQL by the partial unique index below. The door refuses a
-- second claim with a sentence naming the holder; the index is what keeps the rule true if a door is
-- ever bypassed.
--
-- A RESTORED ROW IS HARMLESS, and that is why this is an authored table an archive carries. No
-- reader believes a hold on its own: every one asks whether `last_heard_at` is inside
-- MOLE_OFFICE_HANDLE_LAPSES_AFTER_SECONDS, and a restored row is far older than that, so it reads as
-- lapsed and the next reader releases it saying so.
CREATE TABLE IF NOT EXISTS `handle_holds` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_id` text NOT NULL,
	`session_record_id` text NOT NULL,
	`machine` text NOT NULL,
	`runtime` text NOT NULL,
	`claimed_at` text NOT NULL,
	`last_heard_at` text NOT NULL,
	`released_at` text,
	`released_because` text,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `handle_holds_one_live_per_agent_idx` ON `handle_holds` (`agent_id`) WHERE released_at IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `handle_holds_session_idx` ON `handle_holds` (`session_record_id`);
