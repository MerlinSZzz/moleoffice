-- A PRESS A SECRETARY MAKES FOR THE PERSON, UNDER THEIR GRANT, IS ONE ROW. Wave 13s round 1 of the flow design's step 3.
--
-- The flow design the person agreed (section 7): every press under the grant gives its reason and names the grant, and
-- the person sees every press. Until now a write under the grant carried the grant as JSON on each ledger row, and
-- nothing said which rows one press wrote or why it was pressed. From now on the first change row a press writes also
-- writes one row here, in the same transaction, and every change row that press writes names it in `press_id`.
--
-- A PRESS THAT WROTE NOTHING HAS NO ROW. The row is written beside a change row, so a press that was refused, or that
-- failed and was rolled back, leaves none.
--
-- ADDITIVE, AND IT REWRITES NOTHING. One table, one nullable column on `changes` with no default, and three indexes.
-- On every row written before this migration, `press_id` NULL means nobody recorded a press.
CREATE TABLE IF NOT EXISTS `presses_for_the_person` (
  `id` text PRIMARY KEY NOT NULL,
  `workspace_id` text,
  `agent_id` text NOT NULL,
  `session_id` text,
  `grant_id` text NOT NULL,
  `operation` text NOT NULL,
  `reason` text,
  `at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `presses_for_the_person_grant_at_idx` ON `presses_for_the_person` (`grant_id`, `at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `presses_for_the_person_agent_at_idx` ON `presses_for_the_person` (`agent_id`, `at`);
--> statement-breakpoint
ALTER TABLE `changes` ADD COLUMN `press_id` text;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `changes_press_idx` ON `changes` (`press_id`) WHERE `press_id` IS NOT NULL;
