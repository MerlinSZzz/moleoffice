CREATE TABLE IF NOT EXISTS runtime_settings (name TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS office_restart_grants (agent_id TEXT PRIMARY KEY NOT NULL, decision_id TEXT NOT NULL);
