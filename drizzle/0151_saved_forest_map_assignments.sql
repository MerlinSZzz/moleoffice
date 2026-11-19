CREATE TABLE IF NOT EXISTS `office_map_layouts` (
  `configuration_key` text PRIMARY KEY NOT NULL,
  `data` text NOT NULL CHECK (json_valid(`data`)),
  `updated_at` text NOT NULL
);
