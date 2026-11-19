-- A PERSON HOLDS A ROLE CARD TOO. Two nullable columns on `people`.
--
-- Criterion P45 of design/permissions/ACCEPTANCE.md section 8: a person holds a role card too,
-- beside what they do for a living, and anybody
-- else is the Office's administrator by default.
--
-- `role` IS WHICH CARD THEY HOLD, one word from the `personCards` list in
-- design/permissions/roles.json. It is not the `role` column on `agents`: the declaration keeps the
-- two lists apart and nothing reads across them, so a word here is never a role an agent could be
-- registered as.
--
-- `occupation` IS WHAT THEY DO, in their own words, and it is theirs to write. The role says where
-- somebody stands in the Office and every holder of one card stands the same way; the occupation is
-- one person's own fact, which is why it is a column and not a line in a declaration.
--
-- NULL MEANS NOBODY WROTE ONE in both cases, which is every row written before this. A row with no
-- role is read as the administrator card and every screen says no role set rather than drawing a
-- word nobody chose.
--
-- ADDITIVE, AND IT REWRITES NOTHING. Two ALTER TABLE ADD COLUMN and no UPDATE. What fills them in is
-- tools/give-every-citizen-a-card.mjs, which is a corpus write and asks first.
-- `portrait` IS WHICH PICTURE IS ON THEIR CARD, criterion P47, by the address it is served at: one
-- of the three painted for the card they hold, or a picture of their own under
-- data/portraits/custom/<who>/, which .gitignore keeps out of the repository. NULL means they have
-- not chosen, and then the card's own portrait is drawn.
ALTER TABLE `people` ADD `role` text;--> statement-breakpoint
ALTER TABLE `people` ADD `occupation` text;--> statement-breakpoint
ALTER TABLE `people` ADD `portrait` text;
