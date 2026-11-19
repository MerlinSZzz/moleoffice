-- A DELIVERY ROW SAYS WHERE IT STANDS, NOT ONLY HOW FAR IT GOT.
--
-- Migration 0115 gave a message one row per recipient with a mark: queued, delivered, seen. The
-- mark says how far it got. It does not say WHY a message is still queued, and criterion M6 of
-- design/messages/ACCEPTANCE.md asks for exactly that: a clock beside the message and, next to it,
-- a sentence a person can read. A run that could not start because a tool is not installed, a
-- message held because too many runs are already going, a run somebody stopped — all three leave
-- the mark at queued and all three are different facts.
--
-- `because` is that sentence. `run` is the session record of the run that took the message, so a
-- reader can open it. Both are nullable and both are new, so this migration adds columns and
-- rewrites nothing.
ALTER TABLE `message_delivery` ADD `because` text;--> statement-breakpoint
ALTER TABLE `message_delivery` ADD `run` text;
