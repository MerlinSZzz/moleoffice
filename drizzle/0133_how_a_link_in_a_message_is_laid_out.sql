-- HOW A LINK IN A MESSAGE IS LAID OUT IN THE BUBBLE, for one person.
--
-- Criterion M48, from the owner on 5 September 2026. The owner noticed a link breaking onto its
-- own line and centring itself, asked whether that was meant, and asked for it as a choice between
-- normal text and its own centred line, with the centred line the default.
--
-- IT IS A COLUMN ON `people` AND NOT A TABLE OF ITS OWN, for the reason `circle_shows` gives: it is
-- one fact about one person, the same shape as the choices beside it. A settings table would be a
-- place for any future setting to go, which is the sixth rule of CLAUDE.md.
--
-- NULL MEANS NOBODY HAS CHOSEN, and it is read as its own centred line because that is the default
-- the owner set. It is deliberately not written on every row: a reader is then told "the person has
-- not chosen" rather than "the person chose the centred line", which is rule five of CLAUDE.md.
--
-- THE TWO WORDS IT MAY HOLD are `own-line` and `inline`, and `src/shared/participants.ts` declares
-- them once for the door, the reply and the control. There is no CHECK constraint here for the
-- reason every other word column in this schema has none: the declaration is what the write gate
-- reads, and a second list in SQL would be the same fact in two places.

ALTER TABLE `people` ADD `message_link_layout` text;
