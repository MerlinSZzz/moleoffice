-- THE PRICE TABLE THE PERSON SETS IN SETTINGS.
--
-- Criterion U3: usage records the tokens, the model and
-- the agent program, so a price can be estimated. The Usage page estimates a price from a price table the
-- person edits in Settings. The table is one fact for the whole installation, so it is one singleton
-- row in the shape `preview_root_additions` uses. The JSON in `settings` is {currency, prices}, and
-- its one shape check is `readPriceTable` in src/shared/price-table.ts.
--
-- IT HOLDS NOTHING UNTIL THE PERSON SETS A TABLE. No migration writes a row and no data is rewritten, so an
-- installation where nobody sets a table reads "no price table has been set", exactly as before.
CREATE TABLE IF NOT EXISTS `price_table` (
  `only_row` integer PRIMARY KEY NOT NULL CHECK (`only_row` = 1),
  `settings` text NOT NULL,
  `updated_at` text NOT NULL,
  `updated_by_kind` text NOT NULL,
  `updated_by_id` text NOT NULL,
  `authority` text
);
