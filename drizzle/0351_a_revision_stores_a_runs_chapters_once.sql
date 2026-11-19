-- A REVISION NAMES THE REVISION THAT HOLDS A VALUE WHOLE, SO A RUN'S CHAPTERS ARE STORED ONCE PER RUN.
-- Additive only. NULL means the revision's data is whole, which is what every revision written before this one holds,
-- and such a revision is read exactly as before. Nothing here rewrites a revision.
-- `parts` holds each place in `data` that holds a hash instead of its value, with the number of the revision of the
-- same record that holds the value whole, as `{"extra.roundChapters": 1}`. src/server/db/revision-stored-once.ts says
-- what is stored once and puts a revision back together.
ALTER TABLE `revisions` ADD COLUMN `parts` text;
