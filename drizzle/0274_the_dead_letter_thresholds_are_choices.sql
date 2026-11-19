ALTER TABLE installation ADD COLUMN dead_letter_after_days INTEGER CHECK (dead_letter_after_days IS NULL OR dead_letter_after_days > 0);
--> statement-breakpoint
ALTER TABLE installation ADD COLUMN dead_letter_after_count INTEGER CHECK (dead_letter_after_count IS NULL OR dead_letter_after_count > 0);
