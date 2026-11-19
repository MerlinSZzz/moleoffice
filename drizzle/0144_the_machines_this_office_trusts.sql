-- THE MACHINES THIS OFFICE TRUSTS, AND WHETHER A VISITOR'S REQUEST CAME FROM ONE. Criterion P73.
--
-- The owner reported on 7 September 2026 that they could not adjust the trusted machines or
-- addresses anywhere, and left where the setting goes to the agent.
--
-- MEASURED BEFORE THIS WAS WRITTEN: there was nothing to adjust. No table, no list, no setting.
-- Which callers this office let in was decided by which socket a request arrived on — stampArrival
-- in src/server/lib/http.ts writes `this machine` or `another machine`, and no header sets it — and
-- the one address anybody could name was MOLE_OFFICE_ADDRESS_FOR_OTHER_MACHINES, read in exactly
-- one place, src/config/settings.mjs line 998. Changing it means editing a file and restarting the
-- server, which chapter 10's fifth rule forbids asking the person to do. The visitor gate reads no
-- address at all: a credential's machine is recorded and deliberately never compared, and the
-- design note in src/shared/visitors.ts says why.
--
-- SO THE TABLE IS THE OFFICE'S ANSWER TO ONE QUESTION: which machines does it trust. Rows are added
-- by a press at the world's page, by confirming a visitor credential, and by the server itself when
-- the environment names an address it binds — that last one so the list says what the office
-- actually opened a door for rather than contradicting it.
--
-- A ROW IS NEVER DELETED. Removing a machine writes removed_at, who did it and why: the same shape
-- as ending a visitor credential, and for the same reason. The office does not delete the evidence
-- of who it once trusted.
--
-- `from_a_trusted_machine` HAS THREE ANSWERS AND NOT TWO. 1 yes, 0 no, NULL because nobody could
-- tell which machine it was, which is every request on the loopback door. It REFUSES NOTHING:
-- whether a request from a machine the office does not trust is refused or only marked is question
-- Q2 of design/permissions/ACCEPTANCE.md section 6, and that answer is the owner's.
--
-- ADDITIVE, AND IT REWRITES NOTHING. One CREATE TABLE, one index, one ALTER TABLE ADD COLUMN, no
-- UPDATE. Every request already recorded keeps NULL, which reads as nobody having looked — and
-- nobody had.
CREATE TABLE IF NOT EXISTS `trusted_machines` (
	`id` text PRIMARY KEY NOT NULL,
	`address` text NOT NULL,
	`note` text,
	`how` text NOT NULL,
	`credential_id` text,
	`added_at` text NOT NULL,
	`added_by_kind` text,
	`added_by_id` text,
	`removed_at` text,
	`removed_by_kind` text,
	`removed_by_id` text,
	`removed_because` text
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `trusted_machines_live_idx` ON `trusted_machines` (`removed_at`,`address`);--> statement-breakpoint
ALTER TABLE `visitor_requests` ADD `from_a_trusted_machine` integer;
