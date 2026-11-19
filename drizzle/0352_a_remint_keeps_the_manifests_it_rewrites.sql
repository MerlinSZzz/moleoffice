CREATE TABLE IF NOT EXISTS `registry_remint_manifests` (
  `generation` text NOT NULL REFERENCES `registry_remint_generations`(`digest`),
  `original_digest` text NOT NULL,
  `original_json` text NOT NULL,
  `rewritten_digest` text NOT NULL,
  `rewritten_json` text NOT NULL,
  `derived_original_ack` text NOT NULL,
  `derived_rewritten_ack` text NOT NULL,
  CONSTRAINT `registry_remint_manifests_key` PRIMARY KEY (`generation`, `original_digest`),
  CONSTRAINT `registry_remint_manifests_generation` CHECK (length(`generation`) = 64 AND `generation` NOT GLOB '*[^0-9a-f]*'),
  CONSTRAINT `registry_remint_manifests_original_digest` CHECK (length(`original_digest`) = 64 AND `original_digest` NOT GLOB '*[^0-9a-f]*'),
  CONSTRAINT `registry_remint_manifests_rewritten_digest` CHECK (length(`rewritten_digest`) = 64 AND `rewritten_digest` NOT GLOB '*[^0-9a-f]*'),
  CONSTRAINT `registry_remint_manifests_json` CHECK (json_valid(`original_json`) AND json_valid(`rewritten_json`))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `registry_remint_manifest_revisions` (
  `generation` text NOT NULL,
  `record_id` text NOT NULL,
  `seq` integer NOT NULL,
  `original_digest` text NOT NULL,
  `old_content_hash` text NOT NULL,
  `new_content_hash` text NOT NULL,
  CONSTRAINT `registry_remint_manifest_revisions_key` PRIMARY KEY (`generation`, `record_id`, `seq`),
  CONSTRAINT `registry_remint_manifest_revisions_manifest` FOREIGN KEY (`generation`, `original_digest`) REFERENCES `registry_remint_manifests` (`generation`, `original_digest`),
  CONSTRAINT `registry_remint_manifest_revisions_seq` CHECK (`seq` >= 1),
  CONSTRAINT `registry_remint_manifest_revisions_old_hash` CHECK (length(`old_content_hash`) = 16 AND `old_content_hash` NOT GLOB '*[^0-9a-f]*'),
  CONSTRAINT `registry_remint_manifest_revisions_new_hash` CHECK (length(`new_content_hash`) = 16 AND `new_content_hash` NOT GLOB '*[^0-9a-f]*')
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `registry_remint_manifest_change_sides` (
  `generation` text NOT NULL REFERENCES `registry_remint_generations`(`digest`),
  `change_id` text NOT NULL,
  `side` text NOT NULL,
  `original_field` text NOT NULL,
  `rewritten_field` text NOT NULL,
  `original_value` text,
  `rewritten_value` text,
  `original_value_digest` text NOT NULL,
  `rewritten_value_digest` text NOT NULL,
  `original_manifest_digest` text,
  CONSTRAINT `registry_remint_manifest_change_sides_key` PRIMARY KEY (`generation`, `change_id`, `side`),
  CONSTRAINT `registry_remint_manifest_change_sides_manifest` FOREIGN KEY (`generation`, `original_manifest_digest`) REFERENCES `registry_remint_manifests` (`generation`, `original_digest`),
  CONSTRAINT `registry_remint_manifest_change_sides_side` CHECK (`side` IN ('old_value', 'new_value')),
  CONSTRAINT `registry_remint_manifest_change_sides_values` CHECK (
    (`original_value` IS NOT NULL AND `rewritten_value` IS NOT NULL) OR
    (`original_value` IS NULL AND `rewritten_value` IS NULL AND `original_manifest_digest` IS NOT NULL)
  ),
  CONSTRAINT `registry_remint_manifest_change_sides_original_digest` CHECK (length(`original_value_digest`) = 64 AND `original_value_digest` NOT GLOB '*[^0-9a-f]*'),
  CONSTRAINT `registry_remint_manifest_change_sides_rewritten_digest` CHECK (length(`rewritten_value_digest`) = 64 AND `rewritten_value_digest` NOT GLOB '*[^0-9a-f]*')
);
