CREATE TABLE IF NOT EXISTS `registry_aliases` (
  `namespace` text NOT NULL,
  `alias_id` text NOT NULL,
  `canonical_id` text NOT NULL REFERENCES `agents`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  PRIMARY KEY (`namespace`, `alias_id`),
  CONSTRAINT `registry_aliases_namespace` CHECK (`namespace` = 'agent-registry'),
  CONSTRAINT `registry_aliases_source` CHECK (length(`alias_id`) > 0 AND `alias_id` = trim(`alias_id`) AND instr(`alias_id`, char(0)) = 0),
  CONSTRAINT `registry_aliases_target` CHECK (length(`canonical_id`) > 0 AND `canonical_id` = trim(`canonical_id`) AND instr(`canonical_id`, char(0)) = 0 AND `canonical_id` <> `alias_id`)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `registry_aliases_target_idx` ON `registry_aliases` (`namespace`, `canonical_id`);
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS registry_aliases_valid_insert BEFORE INSERT ON registry_aliases BEGIN
  SELECT RAISE(ABORT, 'Registry alias source is already filed and is immutable') WHERE EXISTS (SELECT 1 FROM registry_aliases WHERE alias_id=NEW.alias_id);
  SELECT RAISE(ABORT, 'Registry alias source clashes with a registry id') WHERE EXISTS (SELECT 1 FROM agents WHERE id=NEW.alias_id);
  SELECT RAISE(ABORT, 'Registry alias target is orphaned') WHERE NOT EXISTS (SELECT 1 FROM agents WHERE id=NEW.canonical_id);
  SELECT RAISE(ABORT, 'Registry alias target must be canonical') WHERE EXISTS (SELECT 1 FROM registry_aliases WHERE alias_id=NEW.canonical_id);
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS registry_aliases_immutable_update BEFORE UPDATE ON registry_aliases BEGIN
  SELECT RAISE(ABORT, 'Registry aliases are immutable');
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS registry_aliases_immutable_delete BEFORE DELETE ON registry_aliases BEGIN
  SELECT RAISE(ABORT, 'Registry aliases are permanent');
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS registry_aliases_reserve_insert BEFORE INSERT ON agents WHEN EXISTS (SELECT 1 FROM registry_aliases WHERE alias_id=NEW.id) BEGIN
  SELECT RAISE(ABORT, 'Registry id is reserved by a permanent alias');
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS registry_aliases_reserve_update BEFORE UPDATE OF id ON agents WHEN NEW.id<>OLD.id BEGIN
  SELECT RAISE(ABORT, 'Registry id is reserved by a permanent alias') WHERE EXISTS (SELECT 1 FROM registry_aliases WHERE alias_id=NEW.id);
  SELECT RAISE(ABORT, 'Registry alias target cannot be removed') WHERE EXISTS (SELECT 1 FROM registry_aliases WHERE canonical_id=OLD.id);
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS registry_aliases_keep_target BEFORE DELETE ON agents WHEN EXISTS (SELECT 1 FROM registry_aliases WHERE canonical_id=OLD.id) BEGIN
  SELECT RAISE(ABORT, 'Registry alias target cannot be removed');
END;
