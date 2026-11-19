-- THE PROBABILITY CELL OF THE CASTING TABLE. A decision of the owner says the router is built once and its
-- probabilities are a cell of each Casting row. The owner fills the values on the Casting page.
--
-- These columns are nullable and have no default. SQLite leaves every existing row empty when they are added.
ALTER TABLE `casting_rows` ADD COLUMN `probability` text;
--> statement-breakpoint
ALTER TABLE `casting_rows` ADD COLUMN `probability_from` text CHECK (`probability_from` IS NULL OR json_valid(`probability_from`));
