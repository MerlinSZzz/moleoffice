CREATE TABLE IF NOT EXISTS storage_files (
  path TEXT PRIMARY KEY NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('reports','text','pictures','videos','other')),
  bytes INTEGER NOT NULL CHECK (bytes >= 0),
  fingerprint TEXT NOT NULL,
  seen_plan TEXT
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS storage_totals (
  category TEXT PRIMARY KEY NOT NULL CHECK (category IN ('reports','text','pictures','videos','other')),
  bytes INTEGER NOT NULL CHECK (bytes >= 0),
  files INTEGER NOT NULL CHECK (files >= 0)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS storage_measurement (
  id INTEGER PRIMARY KEY NOT NULL CHECK (id = 1),
  generation INTEGER NOT NULL,
  phase TEXT NOT NULL CHECK (phase IN ('unmeasured','applying','measured','incomplete')),
  plan_digest TEXT,
  skipped INTEGER NOT NULL DEFAULT 0,
  checked_generation INTEGER
);
--> statement-breakpoint
CREATE TRIGGER storage_file_insert AFTER INSERT ON storage_files BEGIN
  INSERT INTO storage_totals(category,bytes,files) VALUES(new.category,new.bytes,1)
    ON CONFLICT(category) DO UPDATE SET bytes=bytes+new.bytes, files=files+1;
  INSERT INTO storage_measurement(id,generation,phase) VALUES(1,1,'unmeasured')
    ON CONFLICT(id) DO UPDATE SET generation=generation+1;
END;
--> statement-breakpoint
CREATE TRIGGER storage_file_delete AFTER DELETE ON storage_files BEGIN
  INSERT INTO storage_totals(category,bytes,files) VALUES(old.category,0,0)
    ON CONFLICT(category) DO UPDATE SET bytes=bytes-old.bytes, files=files-1;
  INSERT INTO storage_measurement(id,generation,phase) VALUES(1,1,'unmeasured')
    ON CONFLICT(id) DO UPDATE SET generation=generation+1;
END;
--> statement-breakpoint
CREATE TRIGGER storage_file_update AFTER UPDATE ON storage_files BEGIN
  INSERT INTO storage_totals(category,bytes,files) VALUES(old.category,0,0)
    ON CONFLICT(category) DO UPDATE SET bytes=bytes-old.bytes, files=files-1;
  INSERT INTO storage_totals(category,bytes,files) VALUES(new.category,new.bytes,1)
    ON CONFLICT(category) DO UPDATE SET bytes=bytes+new.bytes, files=files+1;
  INSERT INTO storage_measurement(id,generation,phase) VALUES(1,1,'unmeasured')
    ON CONFLICT(id) DO UPDATE SET generation=generation+1;
END;
