CREATE TABLE IF NOT EXISTS submission_events (watermark INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, record_id TEXT NOT NULL, payload TEXT NOT NULL);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS submission_baselines (run_id TEXT PRIMARY KEY NOT NULL, watermark INTEGER NOT NULL);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS legacy_unsealed_runs (run_id TEXT PRIMARY KEY NOT NULL);
--> statement-breakpoint
INSERT INTO legacy_unsealed_runs SELECT id FROM records WHERE kind = 'session' AND json_valid(data) AND (json_extract(data, '$.state') = 'finished' OR json_extract(data, '$.closedHow') = 'agent-said');
--> statement-breakpoint
CREATE TRIGGER submission_run_baseline AFTER INSERT ON records WHEN NEW.kind = 'session' BEGIN INSERT INTO submission_baselines VALUES (NEW.id, (SELECT COALESCE(MAX(watermark),0) FROM submission_events)); END;
--> statement-breakpoint
CREATE TRIGGER submission_revisions_insert AFTER INSERT ON revisions BEGIN INSERT INTO submission_events(kind,record_id,payload) VALUES ('revision', NEW.record_id, json_object('id', NEW.id, 'record_id', NEW.record_id, 'workspace_id', NEW.workspace_id, 'seq', NEW.seq, 'content_hash', NEW.content_hash, 'kind', NEW.kind, 'title', NEW.title, 'summary', NEW.summary, 'data', NEW.data, 'deleted_at', NEW.deleted_at, 'op', NEW.op, 'actor_type', NEW.actor_type, 'actor_id', NEW.actor_id, 'session_id', NEW.session_id, 'at', NEW.at, 'note', NEW.note, 'warrant', NEW.warrant, 'revokes_seq', NEW.revokes_seq, 'elevation', NEW.elevation)); END;
--> statement-breakpoint
CREATE TRIGGER submission_changes_insert AFTER INSERT ON changes BEGIN INSERT INTO submission_events(kind,record_id,payload) VALUES ('patch', NEW.record_id, json_object('id', NEW.id, 'record_id', NEW.record_id, 'op', NEW.op, 'actor_type', NEW.actor_type, 'actor_id', NEW.actor_id, 'session_id', NEW.session_id, 'field', NEW.field, 'old_value', NEW.old_value, 'new_value', NEW.new_value, 'at', NEW.at, 'workspace_id', NEW.workspace_id, 'warrant', NEW.warrant, 'elevation', NEW.elevation)); END;
--> statement-breakpoint
CREATE TRIGGER submission_links_insert AFTER INSERT ON links BEGIN INSERT INTO submission_events(kind,record_id,payload) VALUES ('link-insert', NEW.from_id, json_object('id', NEW.id, 'workspace_id', NEW.workspace_id, 'owner_id', NEW.owner_id, 'created_at', NEW.created_at, 'updated_at', NEW.updated_at, 'from_id', NEW.from_id, 'to_id', NEW.to_id, 'type', NEW.type, 'inferred', NEW.inferred, 'created_by', NEW.created_by, 'gate', NEW.gate, 'gate_up_to', NEW.gate_up_to, 'carries', NEW.carries)); END;
--> statement-breakpoint
CREATE TRIGGER submission_links_delete AFTER DELETE ON links BEGIN INSERT INTO submission_events(kind,record_id,payload) VALUES ('link-delete', OLD.from_id, json_object('id', OLD.id, 'workspace_id', OLD.workspace_id, 'owner_id', OLD.owner_id, 'created_at', OLD.created_at, 'updated_at', OLD.updated_at, 'from_id', OLD.from_id, 'to_id', OLD.to_id, 'type', OLD.type, 'inferred', OLD.inferred, 'created_by', OLD.created_by, 'gate', OLD.gate, 'gate_up_to', OLD.gate_up_to, 'carries', OLD.carries)); END;
--> statement-breakpoint
CREATE TRIGGER submission_links_update AFTER UPDATE ON links BEGIN INSERT INTO submission_events(kind,record_id,payload) VALUES ('link-update', NEW.from_id, json_object('id', NEW.id, 'workspace_id', NEW.workspace_id, 'owner_id', NEW.owner_id, 'created_at', NEW.created_at, 'updated_at', NEW.updated_at, 'from_id', NEW.from_id, 'to_id', NEW.to_id, 'type', NEW.type, 'inferred', NEW.inferred, 'created_by', NEW.created_by, 'gate', NEW.gate, 'gate_up_to', NEW.gate_up_to, 'carries', NEW.carries)); END;
--> statement-breakpoint
CREATE TRIGGER submission_events_no_update BEFORE UPDATE ON submission_events BEGIN SELECT RAISE(ABORT, 'Submission evidence is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER submission_events_no_delete BEFORE DELETE ON submission_events BEGIN SELECT RAISE(ABORT, 'Submission evidence is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER submission_baselines_no_update BEFORE UPDATE ON submission_baselines BEGIN SELECT RAISE(ABORT, 'Submission evidence is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER submission_baselines_no_delete BEFORE DELETE ON submission_baselines BEGIN SELECT RAISE(ABORT, 'Submission evidence is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER legacy_unsealed_runs_no_update BEFORE UPDATE ON legacy_unsealed_runs BEGIN SELECT RAISE(ABORT, 'Submission evidence is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER legacy_unsealed_runs_no_delete BEFORE DELETE ON legacy_unsealed_runs BEGIN SELECT RAISE(ABORT, 'Submission evidence is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER sealed_tip_no_update BEFORE UPDATE ON records WHEN OLD.kind = 'sealed_tip' BEGIN SELECT RAISE(ABORT, 'A sealed tip is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER sealed_tip_no_delete BEFORE DELETE ON records WHEN OLD.kind = 'sealed_tip' BEGIN SELECT RAISE(ABORT, 'A sealed tip is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER submission_links_before_update BEFORE UPDATE ON links BEGIN INSERT INTO submission_events(kind,record_id,payload) VALUES ('link-before-update', OLD.from_id, json_object('id', OLD.id, 'workspace_id', OLD.workspace_id, 'owner_id', OLD.owner_id, 'created_at', OLD.created_at, 'updated_at', OLD.updated_at, 'from_id', OLD.from_id, 'to_id', OLD.to_id, 'type', OLD.type, 'inferred', OLD.inferred, 'created_by', OLD.created_by, 'gate', OLD.gate, 'gate_up_to', OLD.gate_up_to, 'carries', OLD.carries)); END;
