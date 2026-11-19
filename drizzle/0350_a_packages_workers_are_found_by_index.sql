-- TWO INDEXES, SO A PACKAGE FINDS ITS WORKERS AND A DAY FINDS ITS PACKAGES WITHOUT READING EVERY RUN.
--
-- Round FQ, point OP-3. A worker start names the package it works on, and the office copies the package onto the
-- worker's own run as `data.workerPackage`. A package's page lists its workers, and a day's read lists every package
-- asked for work on that day. Both reads would otherwise test JSON over every session of the project.
--
-- PARTIAL TO THE KIND AND TO ONE STORED FIELD EACH. The first finds a run by the package it was filed for; the second
-- finds a run by the moment its package was asked for. A row whose data is not JSON is in neither, and a read of such
-- a row fails on it as a read of every row does. SQLite uses a partial index only for a query that names its WHERE
-- terms in the same words; `STORED_FIELDS.sessionWorkerPackageTask` and
-- `STORED_FIELDS.sessionWorkerPackageAskedAt` in src/server/db/schema.ts are those words.
--
-- THE DAY IS A RANGE, NOT substr(). `askedAt` is a local stamp, "YYYY-MM-DD HH:MM:SS", so one day is from
-- "YYYY-MM-DD 00:00:00" to the next day's midnight, and a range is what an index answers.
--
-- ADDITIVE, AND IT REWRITES NOTHING. Two CREATE INDEX statements, no UPDATE, no table rebuild and no column change.
CREATE INDEX IF NOT EXISTS `records_session_worker_package_task_idx` ON `records` ((CASE WHEN json_valid(`data`) THEN json_extract(`data`, '$.workerPackage.task') END), `workspace_id`, `deleted_at`) WHERE `kind` = 'session' AND (CASE WHEN json_valid(`data`) THEN json_extract(`data`, '$.workerPackage.task') END) IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `records_session_worker_package_asked_at_idx` ON `records` ((CASE WHEN json_valid(`data`) THEN json_extract(`data`, '$.workerPackage.askedAt') END), `workspace_id`, `deleted_at`) WHERE `kind` = 'session' AND (CASE WHEN json_valid(`data`) THEN json_extract(`data`, '$.workerPackage.askedAt') END) IS NOT NULL;
