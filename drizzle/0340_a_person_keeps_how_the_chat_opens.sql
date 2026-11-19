-- WHEN THE CHAT CIRCLE SHOWS, AND HOW THE CHAT OPENS, for one person.
--
-- `chat_button_stays` holds `when-unread`, which is what the circle in the bottom-right corner has
-- always done (it shows while the chat is shut and a message waits), or `always`, which keeps it in
-- the corner on every page. `chat_opens_as` holds `split`, which is how the chat has always opened
-- (beside the page), or `window`, which opens it in its window over the corner.
--
-- THEY ARE COLUMNS ON `people` AND NOT A TABLE OF THEIR OWN, for the reason `chat_text_size` and
-- `send_key` beside them give: each is one fact about one person, the same shape as the choices
-- around it, and it follows the person to any machine rather than staying in one browser.
--
-- NULL MEANS NOBODY HAS CHOSEN, and it is read as what the chat does today. The words are declared
-- once in `src/shared/participants.ts`, and there is no CHECK constraint here for the reason the
-- other word columns of this table have none.
ALTER TABLE `people` ADD `chat_button_stays` text;
--> statement-breakpoint
ALTER TABLE `people` ADD `chat_opens_as` text;
