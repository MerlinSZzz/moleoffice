-- SEVEN INDEXES, SO THE CHAT'S TWO READS FIND THEIR MESSAGES AND RUNS WITHOUT READING EVERY RECORD.
--
-- Round 33 of wave 13n measured GET /api/messages/conversation and GET /api/messages/contacts on an
-- office of the live shape: 12,500 messages and 6,000 session records among 38,500 records. Each
-- read below looked at the stored data of every message, or of every run, to keep a few of them.
--
-- FOUR ARE FOR A READER'S MESSAGES. `theMessagesChosenFor` in src/server/lib/messages.ts keeps a
-- message whose stored sender is the reader, one with a typed `from` line, one with a `routed` list,
-- and a notice about any of those. Before, it parsed the data of every message twice, about 37 ms.
--
--   `records_message_sent_by_idx`         the stored sender's id, `data.sentBy.id`;
--   `records_message_typed_from_idx`      what kind of value `data.from` is;
--   `records_message_routed_idx`          what kind of value `data.routed` is;
--   `records_message_about_message_idx`   the message a notice is about, `data.aboutMessage`.
--
-- TWO ARE FOR RUNS. Saying whether an agent is answering read every session record of the project
-- and parsed each one, about 35 ms. The readers in src/server/lib/worker.ts want only some of them:
--
--   `records_session_running_idx`              whether `data.state` is `running`;
--   `records_session_delivering_message_idx`   the message a run was started to hand over.
--
-- ONE IS ON THE DELIVERY ROWS: `message_delivery_at_idx`, when a row was last written. A page of a
-- conversation read again asks which of the messages it holds have a mark that moved since its last
-- read (`theRowsChangedSince`), and reads only those rows.
--
-- EACH OF THE SIX ON `records` HOLDS ONLY ONE KIND OF RECORD, messages or sessions, so writing any other record costs
-- nothing more, and a query uses one only when it names that kind in the same words.
--
-- EACH STARTS WITH ITS STORED FIELD, then the project. So SQLite uses one only for a query that asks
-- about that field. A query that asks only for a kind and a project goes on using the indexes it
-- used before, and gets its rows in the same order as before.
--
-- A FIELD IS READ ONLY FROM DATA THAT IS VALID JSON, and is null otherwise. SQLite refuses to read a
-- field out of data that is not JSON, and an index that did so would refuse to write such a row, or
-- stop this migration on one already stored. A query uses an index only by asking in the same words,
-- so the readers ask `CASE WHEN json_valid(data) THEN ... END` as well.
--
-- No index is unique, and none changes a row.
--
-- ADDITIVE, AND IT REWRITES NOTHING. Seven CREATE INDEX statements and no UPDATE.
CREATE INDEX IF NOT EXISTS `records_message_sent_by_idx` ON `records` ((CASE WHEN json_valid(`data`) THEN json_extract(`data`, '$.sentBy.id') END), `workspace_id`) WHERE `kind` = 'message';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `records_message_typed_from_idx` ON `records` ((CASE WHEN json_valid(`data`) THEN json_type(`data`, '$.from') END), `workspace_id`) WHERE `kind` = 'message';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `records_message_routed_idx` ON `records` ((CASE WHEN json_valid(`data`) THEN json_type(`data`, '$.routed') END), `workspace_id`) WHERE `kind` = 'message';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `records_message_about_message_idx` ON `records` ((CASE WHEN json_valid(`data`) THEN json_extract(`data`, '$.aboutMessage') END), `workspace_id`) WHERE `kind` = 'message';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `records_session_running_idx` ON `records` ((CASE WHEN json_valid(`data`) THEN json_extract(`data`, '$.state') = 'running' END), `workspace_id`) WHERE `kind` = 'session';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `records_session_delivering_message_idx` ON `records` ((CASE WHEN json_valid(`data`) THEN json_extract(`data`, '$.deliveringMessage') END), `workspace_id`) WHERE `kind` = 'session';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `message_delivery_at_idx` ON `message_delivery` (`at`);
