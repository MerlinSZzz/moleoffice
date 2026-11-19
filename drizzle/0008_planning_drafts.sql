-- Rough planning text, before it is anything.
--
-- ADDITIVE. One new table, no existing table touched, no row read or rewritten.
--
-- NO `workspace_id`, like the rest of the planning layer: a week's thinking spans projects, and a
-- draft forced into one would be false about what it is. It names no record and grants nothing.
--
-- The body is stored exactly as typed. Nothing parses, validates or re-wraps it — a draft that had
-- to be well-formed would be a form with extra steps, which is the thing this surface replaces.
-- Saving text here mutates no canonical record; it becomes structure only through a proposal a
-- human approves.

CREATE TABLE IF NOT EXISTS `planning_drafts` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text NOT NULL
);
