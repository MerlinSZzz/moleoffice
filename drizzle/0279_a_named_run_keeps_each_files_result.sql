CREATE TABLE IF NOT EXISTS test_file_runs (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  use_id TEXT NOT NULL REFERENCES tool_uses(id),
  file TEXT NOT NULL,
  result TEXT NOT NULL,
  seconds REAL,
  test_file_hash TEXT,
  tree_commit TEXT,
  tree_change TEXT
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS test_file_runs_use_file_idx ON test_file_runs (use_id, file);
