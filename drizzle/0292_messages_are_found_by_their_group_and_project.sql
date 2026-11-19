-- THREE INDEXES, SO A MESSAGE IS FOUND BY THE GROUP IT WENT TO AND BY THE PROJECT IT WAS WRITTEN IN OR IS ABOUT.
--
-- Round 65 of wave 13y. GET /api/where-you-stand and GET /api/attention each read every message of the office to keep a
-- few, through the index of every record of a kind. Measured on a made-up office at the scale of 22 October 2026
-- (94,344 records, 55,765 messages), with these three indexes made in a transaction and rolled back:
--
--   `records_message_to_group_idx`             the group a message went to, `data.toGroup`. The messages to every group
--                                              an agent was ever in: 67 ms, and 0.7 ms through this index. The brief's
--                                              news of an agent's groups: 70 ms, and 2.6 ms.
--   `records_message_written_in_project_idx`   the project a message was written in, `data.writtenIn.project`;
--   `records_message_about_project_idx`        the project its writer said it is about, `data.aboutProject`.
--                                              With these two, a project's view of the messages is read one way into
--                                              it at a time (`theViewReadOneWayAtATime` in
--                                              src/server/lib/message-centre.ts). The count of the messages a project
--                                              holds: 84 ms, and 15 ms. The attention rule's records: 109 ms, and 30 ms.
--
-- EACH HOLDS ONLY MESSAGES and starts with its stored field, then the project, as the indexes of migration 0199 do. A
-- query uses one only when it names the kind in the same words and asks about that field, so no other query is moved
-- onto it. Writing a record that is not a message costs nothing more.
--
-- A FIELD IS READ ONLY FROM DATA THAT IS VALID JSON, and is null otherwise, for the reason migration 0199 gives.
--
-- No index is unique, and none changes a row.
--
-- ADDITIVE, AND IT REWRITES NOTHING. Three CREATE INDEX statements and no UPDATE.
CREATE INDEX IF NOT EXISTS `records_message_to_group_idx` ON `records` ((CASE WHEN json_valid(`data`) THEN json_extract(`data`, '$.toGroup') END), `workspace_id`) WHERE `kind` = 'message';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `records_message_written_in_project_idx` ON `records` ((CASE WHEN json_valid(`data`) THEN json_extract(`data`, '$.writtenIn.project') END), `workspace_id`) WHERE `kind` = 'message';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `records_message_about_project_idx` ON `records` ((CASE WHEN json_valid(`data`) THEN json_extract(`data`, '$.aboutProject') END), `workspace_id`) WHERE `kind` = 'message';
