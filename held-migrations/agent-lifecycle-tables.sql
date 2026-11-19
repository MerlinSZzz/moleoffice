-- Copyright © 2026 Zhengyang Shen
-- Licensed under the MIT License. See LICENSE.
-- THE TWO LIFECYCLE TABLES. HELD, PROVED, AND NOT REGISTERED.
--
-- This file is not in drizzle/ and it is not named by src/server/db/migrate.ts, on purpose. This
-- campaign has ONE announced migration window and the owner runs it. `prepareToServe` refuses to
-- serve a corpus with a pending migration, so registering this would stop the owner's dev server at a
-- moment nobody chose. Windows A and B were held the same way.
--
-- Run it with held-migrations/run-agent-lifecycle-tables.mjs, against a COPY.
--
-- IT INVENTS NOTHING. After it runs, both tables are EMPTY and no existing row has been touched.
-- The owner's section 15: do not fabricate historical timestamps that were never observed. There
-- is no backfill, because PanelX observed no work-state move before this table existed.
--
-- THE COLUMNS HERE AND THE DECLARATIONS IN src/server/db/lifecycle-tables.ts ARE ONE FACT IN TWO
-- PLACES, and the answer this repository asks for is a test that fails when they disagree:
-- tests/the-lifecycle-tables-wait-for-the-window.test.ts compares them column by column.
--
-- WHAT THE WINDOW COMMIT DOES: the five steps at the top of src/server/db/lifecycle-tables.ts.

CREATE TABLE agent_work_transitions (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  from_state TEXT,
  to_state TEXT NOT NULL,
  at TEXT NOT NULL,
  because TEXT NOT NULL,
  evidence TEXT,
  actor_type TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  attachment_id TEXT,
  related_kind TEXT,
  related_id TEXT
);

CREATE INDEX agent_work_transitions_agent_idx ON agent_work_transitions (agent_id, at);

CREATE TABLE agent_wakes (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  wanted_at TEXT NOT NULL,
  wanted_by_type TEXT NOT NULL,
  wanted_by_id TEXT NOT NULL,
  because TEXT NOT NULL,
  evidence TEXT,
  policy TEXT NOT NULL,
  state TEXT NOT NULL,
  state_at TEXT NOT NULL,
  claimed_by TEXT,
  claimed_at TEXT,
  served_at TEXT,
  attachment_id TEXT,
  refused_because TEXT
);

CREATE INDEX agent_wakes_poll_idx ON agent_wakes (state, wanted_at);
CREATE INDEX agent_wakes_agent_idx ON agent_wakes (agent_id, wanted_at);
