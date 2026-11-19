-- A SECRETARY ACTING FOR THE PERSON. Criterion P59.
--
-- Only a secretary may be raised, and only by the person's
-- own press: the person presses it themselves, in the product, on the secretary's card, and while
-- it holds that secretary has every one of the person's acts.
--
-- `agents.elevation` IS EVERY GRANT THE PERSON HAS MADE THIS AGENT, oldest first, as a JSON list.
-- Each is its id, which of the ends it has, what it ends at, when the person granted it and when it
-- ended. The LAST one is the one that counts. NULL is the ordinary case and means the person never
-- said; a grant that has ended stays in the list with `endedAt` set, because when it ended and why
-- is a fact about what an agent did while it held.
--
-- IT FOLLOWS THE AGENT RECORD, exactly as `role` does: the press writes `data.elevation` on the
-- secretary's `agent` record and `keepTheAgentRegistryInStep` copies it here. The record is the
-- source, so the grant gets a change row and a revision saying the person made it, and this column
-- is what the refusal reads on a request — one row, one question, whichever project is being
-- written into.
--
-- `changes.elevation` AND `revisions.elevation` ARE WHAT A WRITE MADE UNDER IT SAYS. The same shape
-- and the same reason as the `warrant` column beside each of them: a write an agent is otherwise
-- refused goes through, and the ledger says on what authority. NULL is the ordinary case. Only the
-- guard that USED the elevation marks it, so an ordinary edit made by an elevated secretary carries
-- nothing — writing it there would put "acting for the person" beside a write that never needed it.
--
-- ADDITIVE, AND IT REWRITES NOTHING. Three ALTER TABLE ADD COLUMN and no UPDATE.
ALTER TABLE `agents` ADD `elevation` text;--> statement-breakpoint
ALTER TABLE `changes` ADD `elevation` text;--> statement-breakpoint
ALTER TABLE `revisions` ADD `elevation` text;
