-- EACH OFFICE KEEPS ITS OWN LIST OF WHAT THE PERSON'S GRANT CARRIES. Wave 13s round 2a of the flow design's step 3.
--
-- The secretary card says which doors the person's grant never presses for them, and which it asks about first. That
-- is the card's default. The person of each office may change it door by door, because what one person keeps for
-- themselves another may not. One row here is one door this office's person changed: its answer, and who changed it
-- and when. A door with no row has the card's answer. "Use the default" deletes the row, so no row means the card.
--
-- `door` is the name the card's lists use: an operation in src/shared/ops-list.ts, or one of the few names beside the
-- doors that src/shared/what-the-grant-carries.ts declares. A row naming a door the office no longer has is kept and
-- shown apart, and the check never matches it. `answer` is held to the three answers of `THE_ANSWERS_ABOUT_A_DOOR`.
-- No SQL default on `updated_at`, for the reason `changes.at` gives: the office writes its own local wall clock.
--
-- ADDITIVE, AND IT REWRITES NOTHING. It writes no row, so every office behaves as it did before this migration.
CREATE TABLE IF NOT EXISTS `what_the_grant_carries` (
  `door` text PRIMARY KEY NOT NULL,
  `answer` text NOT NULL CHECK (`answer` IN ('kept', 'ask-first', 'may-press')),
  `updated_at` text NOT NULL,
  `updated_by_kind` text NOT NULL,
  `updated_by_id` text NOT NULL
);
