-- Round 63 of wave 13y: listed people and work views reached sessions by testing JSON over every project's history.
-- These indexes find serving references, a first binding, and the conservative unusual-row bucket before that test.
-- No ownership decision moves into SQL. Odd characters, multiple bindings and malformed JSON remain candidates.
-- The unusual bucket can still grow with unusual history. Arbitrary binding lookup needs a relation kept on writes.
-- Schema.STORED_FIELDS holds each expression once for the declarations and queries. No rows or columns change.
CREATE INDEX IF NOT EXISTS `records_session_serving_agent_id_idx` ON `records` ((CASE WHEN json_valid(data) THEN json_extract(data, '$.servingAgentId') END), `workspace_id`, `deleted_at`) WHERE kind = 'session';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `records_session_serving_agent_idx` ON `records` ((CASE WHEN json_valid(data) THEN json_extract(data, '$.servingAgent') END), `workspace_id`, `deleted_at`) WHERE kind = 'session';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `records_session_first_binding_agent_idx` ON `records` ((CASE WHEN json_valid(data) THEN json_extract(data, '$.ranAs[0].agentId') END), `workspace_id`, `deleted_at`) WHERE kind = 'session';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `records_session_reference_fallback_idx` ON `records` ((CASE WHEN json_valid(data) THEN (
    json_extract(data, '$.servingAgentId') GLOB '*[^A-Za-z0-9_-]*'
    OR json_extract(data, '$.servingAgent') GLOB '*[^A-Za-z0-9_-]*'
    OR json_extract(data, '$.ranAs[0].agentId') GLOB '*[^A-Za-z0-9_-]*'
    OR json_array_length(data, '$.ranAs') > 1
    OR json_type(data, '$.ranAs') NOT IN ('array', 'null')
  ) ELSE 1 END), `workspace_id`, `deleted_at`) WHERE kind = 'session';
