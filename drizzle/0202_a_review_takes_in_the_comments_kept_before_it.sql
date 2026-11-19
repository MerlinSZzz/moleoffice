-- TWO COLUMNS ON `reviews`, BOTH NULL ON EVERY REVIEW THAT EXISTS NOW. Wave 13r round 15.
--
-- `taken_in` IS THE COMMENTS A REVIEW TOOK IN WHEN IT STARTED, as a JSON array of comment record ids.
-- The owner's third detail: comments kept before a review started, not sent and in no review, join
-- it when it starts, on the server, in one write. `startReview` in src/server/lib/reviews.ts writes
-- this column in the same insert that writes the review. NULL means the review was started before
-- this column existed, so nobody recorded what it took in. `[]` means it took in nothing.
--
-- `goes_to` IS WHO THE PERSON SAID THE WHOLE REVIEW GOES TO, as the JSON recipient a comment's
-- `chosenRecipient` holds. It is written by POST /api/reviews/:id/recipient. NULL means nobody has
-- said, and the review then goes to the agent recorded as writing the page it was started on, or to
-- nobody when no such agent is recorded.
--
-- ADDITIVE, AND IT REWRITES NOTHING. Two ALTER TABLE statements and no UPDATE.
ALTER TABLE `reviews` ADD `taken_in` text;
--> statement-breakpoint
ALTER TABLE `reviews` ADD `goes_to` text;
