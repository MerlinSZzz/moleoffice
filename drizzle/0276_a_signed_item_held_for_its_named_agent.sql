-- A SIGNATURE MAY HOLD AN ITEM FOR ITS NAMED AGENT, ONCE, FOR AT MOST 24 HOURS.
-- Additive only. Old items still run at the signature, and old ledger rows name no signed item.
-- Expiry is read from the clock. It never rewrites the hold or an unused item in the background.
ALTER TABLE `signing_package_items` ADD COLUMN `carried_out` text NOT NULL DEFAULT 'at-the-signature' CHECK (`carried_out` IN ('at-the-signature', 'by-the-named-agent'));
--> statement-breakpoint
ALTER TABLE `signing_package_items` ADD COLUMN `carried_out_by` text;
--> statement-breakpoint
ALTER TABLE `signing_package_items` ADD COLUMN `carried_out_in` text;
--> statement-breakpoint
ALTER TABLE `signing_packages` ADD COLUMN `hold_ends_at` text;
--> statement-breakpoint
ALTER TABLE `signing_packages` ADD COLUMN `hold_ended_at` text;
--> statement-breakpoint
ALTER TABLE `signing_packages` ADD COLUMN `hold_ended_how` text CHECK (`hold_ended_how` IN ('all-carried-out', 'taken-back', 'given-back'));
--> statement-breakpoint
ALTER TABLE `changes` ADD COLUMN `signed_item` text;
--> statement-breakpoint
ALTER TABLE `revisions` ADD COLUMN `signed_item` text;
