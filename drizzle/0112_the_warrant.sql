-- The warrant: the person's own words kept beside the write they allowed.
--
-- Three nullable columns and no row is touched. Every existing change row and every existing
-- revision comes out of this migration with `warrant` NULL, which is what NULL means here: nobody
-- claimed anybody's words for that write. It is not "the words were lost" and it is not "this was
-- refused" — it is the ordinary case, and it is what every write in this database was until today.
--
-- WHY TWO LEDGERS GET THE SAME COLUMN. `changes` and `revisions` are written in one transaction by
-- the two functions that share `attributionFor`, so a write is on somebody's words in both or in
-- neither. Putting the words in only one of them would leave the other saying an agent did a thing
-- that only a person may do, with nothing beside it.
--
-- WHY THERE IS NO `warrants` TABLE. A warrant is a fact about ONE write. A row in another table
-- would have to be joined to be read, and a join that came back empty is the failure this product
-- least wants: a governance act with no visible authority, which reads exactly like a hole in the
-- guards. Storing it beside the actor makes it impossible for the two to come apart.
--
-- `revokes_seq` IS HOW AN ACT IS TAKEN BACK WITHOUT REWRITING HISTORY. A person revoking an act
-- does not erase its revision. The record is put back to what it held before, and that write is a
-- new revision carrying this column set to the revoked revision's `seq`. So "is this act still
-- standing" is a query and not a guess, and the trail keeps both halves.
--
-- SAFE TO RUN AGAINST THE LIVE CORPUS. Three ADD COLUMNs on tables SQLite does not rewrite for a
-- nullable column with no default, inside the one transaction the migrator runs everything in.

ALTER TABLE `changes` ADD `warrant` text;--> statement-breakpoint
ALTER TABLE `revisions` ADD `warrant` text;--> statement-breakpoint
ALTER TABLE `revisions` ADD `revokes_seq` integer;
