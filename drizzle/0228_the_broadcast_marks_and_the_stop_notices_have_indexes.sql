-- THREE INDEXES, SO THE REMINDER PASS FINDS THE OFFICE'S OWN MARKED LINES WITHOUT READING EVERY MESSAGE.
--
-- On 10 October 2026 the live log said one flow-reminders pass took 953 ms. Its broadcasts step took
-- 740 ms, 724 ms of it inside SQLite, and its one-notice-per-cause step took 110 ms. Each slow statement
-- read the stored data of every message, about 31,600 of them, to keep one or none. Argus timed each one
-- on live at about 48 ms; with five secretaries the broadcasts step asks three of them for each.
--
-- EACH INDEX HOLDS ONE MARK THE OFFICE WRITES INTO A MESSAGE'S `data.extra`, and few messages carry it:
--
--   `records_message_broadcast_slot_idx`   `extra.broadcastSlot`, the slot a broadcast reminder, or the
--                                          secretary's line for that slot's report, is for. Read by
--                                          `theReminderWasSent` and `theReportForTheSlot` in
--                                          src/server/lib/broadcast.ts.
--   `records_message_broadcast_skip_idx`   `extra.broadcastSkip`, the slot somebody said has nothing to
--                                          report. Read by `theSkippedSlotsOf`.
--   `records_message_stop_cause_idx`       `extra.m94.cause`, the cause one stopped-run notice is about.
--                                          Read by `theLastNoticeForEachCause` in src/server/lib/reminders.ts.
--
-- Each is written like the indexes of migration 0199: it holds only messages, it starts with its stored
-- field and then the project, and it reads the field only from data that is valid JSON. A query uses one
-- only by asking in the same words, which src/server/db/schema.ts holds once as `STORED_FIELDS`.
--
-- No index is unique, and none changes a row.
--
-- ADDITIVE, AND IT REWRITES NOTHING. Three CREATE INDEX statements and no UPDATE.
CREATE INDEX IF NOT EXISTS `records_message_broadcast_slot_idx` ON `records` ((CASE WHEN json_valid(`data`) THEN json_extract(`data`, '$.extra.broadcastSlot') END), `workspace_id`) WHERE `kind` = 'message';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `records_message_broadcast_skip_idx` ON `records` ((CASE WHEN json_valid(`data`) THEN json_extract(`data`, '$.extra.broadcastSkip') END), `workspace_id`) WHERE `kind` = 'message';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `records_message_stop_cause_idx` ON `records` ((CASE WHEN json_valid(`data`) THEN json_extract(`data`, '$.extra.m94.cause') END), `workspace_id`) WHERE `kind` = 'message';
