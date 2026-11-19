-- A person's own agent tags and assignments, kept as JSON on their registry row.
-- Each tag holds a name, a chosen colour and the agent IDs to which it is applied.
-- This is one person's choice and follows that person between machines, so it belongs
-- on people alongside their message labels. NULL means that person has made no tags.
ALTER TABLE `people` ADD `agent_tags` text;
