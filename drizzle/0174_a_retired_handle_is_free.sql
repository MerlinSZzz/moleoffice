-- A handle is unique among LIVE agents only: a retired agent's handle may be taken by a new agent.
--
-- WHAT CHANGES, EXACTLY. `agents_handle_idx` was `CREATE UNIQUE INDEX ... ON agents (handle)` since
-- 0114, and it covered retired rows as well as live ones. It is dropped and made again under the
-- same name as a plain index, so a lookup by handle stays fast. A second index,
-- `agents_live_handle_idx`, is unique over the same column for the rows where `retired = 0`. NOT ONE
-- ROW IS READ, MOVED OR REWRITTEN. The only thing that changes is which writes the database accepts.
--
-- WHY. Criterion I3 of
-- design/agents/IDENTITY-ACCEPTANCE.md: a handle is unique among LIVE agents and free again after
-- retirement, a registration under a freed handle makes a NEW agent with a NEW id, and two live agents
-- never share a handle. An agent's id is what never repeats; the handle is the name it goes by.
--
-- THE ORDER THIS COMES IN, as 0030 did for record titles. First every reader that turned a handle
-- into an agent was made to ask which agent it means (the resolver in src/server/lib/participants.ts,
-- the stored readers in src/server/lib/agent-references.ts); the key and the visitor credential were
-- bound to the id (criterion I5); a new agent was given an id of its own (criterion I1). Then this.
--
-- SAFE TO RUN AGAINST A DATABASE THAT ALREADY HOLDS WORK, and safe to run twice. Every database made
-- before this holds at most one row per handle, so the new unique index finds nothing to refuse.
-- `DROP INDEX IF EXISTS` and `CREATE INDEX IF NOT EXISTS` do nothing on a second run.

DROP INDEX IF EXISTS `agents_handle_idx`;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `agents_handle_idx` ON `agents` (`handle`);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `agents_live_handle_idx` ON `agents` (`handle`) WHERE retired = 0;
