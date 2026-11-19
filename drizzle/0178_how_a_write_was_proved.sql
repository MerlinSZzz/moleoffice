-- HOW A WRITE WAS PROVED, STORED ON THE WRITE. Keys wave piece 6.
--
-- WHY. A warrant cites where the person said something: `message:<id>` or `comment:<id>`. Once the
-- key window is closed, a new warrant may cite only words the person's key proved. Until now the
-- office never stored how a write was proved, so that question had no answer. `proved_holder` (0168)
-- is written only where a key proved somebody other than the name the headers gave, so it is NULL
-- on every ordinary write the person's key proved.
--
-- WHAT IS STORED. The word `actorFrom` puts on the actor as `provedBy`: `the-person-key` (the person's key,
-- or a device of theirs that they confirmed), `the-office-key` or `an-agent-key`. NULL means no key
-- proved the request that wrote the row. On every row written before this migration it means
-- nobody recorded it, which is the honest answer: the proof was not stored then.
--
-- WHERE. On both ledgers, `changes` and `revisions`, because they are written in one transaction
-- from the same actor and a fact on one and not the other would drift (the ninth invariant). And
-- on `agent_messages`, because `message:<id>` resolves to a row there first.
--
-- ONE NEW COLUMN PER TABLE, NULLABLE TEXT, NO DEFAULT AND NO BACKFILL. Nothing already stored is
-- rewritten.
ALTER TABLE `changes` ADD COLUMN `proved_by` text;--> statement-breakpoint
ALTER TABLE `revisions` ADD COLUMN `proved_by` text;--> statement-breakpoint
ALTER TABLE `agent_messages` ADD COLUMN `proved_by` text;
