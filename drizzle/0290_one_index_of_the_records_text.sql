-- Round 64 of wave 13y: one index of the text of every record, read by GET /api/search and GET /api/report-files/named-inside.
-- The text of a record is its title, its summary and every string value in its data, one per line, and never a key or a number.
-- Data that is not JSON is indexed as it is written. The index holds every three letters of that text, folded to one case.
-- Both doors ask the index which records could hold what they look for, and then look in those records exactly as before.
-- So the index may keep too many records, and it never keeps too few. src/server/lib/record-text-index.ts says why.
-- The index knows a record by a number, and record_text_keys gives each record id its number, because a rowid may change.
-- The three triggers keep the index on every write, so their statements run on later writes and none runs here.
-- A REPLACE that takes away another record runs no delete trigger, so that record's key and text stay: too many, never too few.
-- This file fills the index from the records already there, and changes no record.
CREATE TABLE IF NOT EXISTS `record_text_keys` (`n` integer PRIMARY KEY, `record_id` text NOT NULL UNIQUE);
--> statement-breakpoint
CREATE VIRTUAL TABLE IF NOT EXISTS `record_text` USING fts5(text, content='', contentless_delete=1, detail=none, tokenize='trigram case_sensitive 0 remove_diacritics 0');
--> statement-breakpoint
INSERT INTO `record_text_keys` (`record_id`) SELECT `id` FROM `records` ORDER BY rowid;
--> statement-breakpoint
INSERT INTO `record_text` (rowid, `text`) SELECT k.n, coalesce(r.title, '') || char(10) || coalesce(r.summary, '') || char(10) || CASE WHEN json_valid(r.data) THEN coalesce((SELECT group_concat(value, char(10)) FROM json_tree(r.data) WHERE type = 'text'), '') ELSE coalesce(r.data, '') END FROM `records` r JOIN `record_text_keys` k ON k.record_id = r.id;
--> statement-breakpoint
INSERT INTO `record_text` (`record_text`) VALUES ('optimize');
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS record_text_on_insert AFTER INSERT ON records BEGIN INSERT INTO record_text_keys (record_id) VALUES (NEW.id) ON CONFLICT (record_id) DO NOTHING; INSERT OR REPLACE INTO record_text (rowid, text) SELECT n, coalesce(NEW.title, '') || char(10) || coalesce(NEW.summary, '') || char(10) || CASE WHEN json_valid(NEW.data) THEN coalesce((SELECT group_concat(value, char(10)) FROM json_tree(NEW.data) WHERE type = 'text'), '') ELSE coalesce(NEW.data, '') END FROM record_text_keys WHERE record_id = NEW.id; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS record_text_on_update AFTER UPDATE OF id, title, summary, data ON records WHEN OLD.id IS NOT NEW.id OR OLD.title IS NOT NEW.title OR OLD.summary IS NOT NEW.summary OR OLD.data IS NOT NEW.data BEGIN UPDATE record_text_keys SET record_id = NEW.id WHERE record_id = OLD.id; INSERT OR REPLACE INTO record_text (rowid, text) SELECT n, coalesce(NEW.title, '') || char(10) || coalesce(NEW.summary, '') || char(10) || CASE WHEN json_valid(NEW.data) THEN coalesce((SELECT group_concat(value, char(10)) FROM json_tree(NEW.data) WHERE type = 'text'), '') ELSE coalesce(NEW.data, '') END FROM record_text_keys WHERE record_id = NEW.id; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS record_text_on_delete AFTER DELETE ON records BEGIN DELETE FROM record_text WHERE rowid IN (SELECT n FROM record_text_keys WHERE record_id = OLD.id); DELETE FROM record_text_keys WHERE record_id = OLD.id; END;
