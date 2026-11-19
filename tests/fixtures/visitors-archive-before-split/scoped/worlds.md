# Worlds

Every world this installation has had, alive and dead. A world is one running Mole Office with one
database, and the identity of a world is the identity of that database — not its address, which a
machine takes back when a process ends, and not its name, which a person may change.

THIS TABLE BELONGS TO NO PROJECT, because a world holds every project it has. Only the
whole-installation archive carries it.

A ROW WITH `diedAt` FILLED IN IS NOT A ROW TO DROP. The person's words ask for a world appearing AND a world
disappearing to be recorded, so the history is the content: a restore that kept only the live worlds
would keep the least interesting half.

THIS IS ONE PROJECT'S ARCHIVE, so it carries no `worlds` rows AT ALL.
A world holds every project it has, so a row saying a world was born or died belongs to no single one of them, so there is no project whose archive these would be. The database
this was taken from holds 2 of them and they are in NO project's archive; the whole-installation
export is the one that carries them.

SO THIS PAGE IS NOT EVIDENCE THAT THERE IS NOTHING TO FIND. It is evidence that you are holding the
wrong archive to find out.

## The office runtime choices

THIS IS ONE PROJECT'S ARCHIVE, so it carries no `runtime_settings` rows AT ALL.
Runtime controls apply to the whole office and every project it serves., so there is no project whose archive these would be. The database
this was taken from holds 0 of them and they are in NO project's archive; the whole-installation
export is the one that carries them.

SO THIS PAGE IS NOT EVIDENCE THAT THERE IS NOTHING TO FIND. It is evidence that you are holding the
wrong archive to find out.
## Permission to restart or pause the office

THIS IS ONE PROJECT'S ARCHIVE, so it carries no `office_restart_grants` rows AT ALL.
A restart or pause stops this office, so its grants apply to every project., so there is no project whose archive these would be. The database
this was taken from holds 0 of them and they are in NO project's archive; the whole-installation
export is the one that carries them.

SO THIS PAGE IS NOT EVIDENCE THAT THERE IS NOTHING TO FIND. It is evidence that you are holding the
wrong archive to find out.
## Visits

A visit is a citizen of one world working in another, with what they came to do in their own
words. A visit whose `registeredAt` is later than its `since` began before the office heard about
it, because the main world was not answering when it started; there is no column for that, only
the two stamps.

THIS IS ONE PROJECT'S ARCHIVE, so it carries no `visits` rows AT ALL.
A visit is a citizen of one world working in another, which is about the two worlds rather than about any project inside either, so there is no project whose archive these would be. The database
this was taken from holds 1 of them and they are in NO project's archive; the whole-installation
export is the one that carries them.

SO THIS PAGE IS NOT EVIDENCE THAT THERE IS NOTHING TO FIND. It is evidence that you are holding the
wrong archive to find out.

## Visiting agents

An agent on another machine, before that machine runs a world of its own, holds a credential of
its own. The credential records the facts of the run it was issued to, so a token found by
somebody else can be told from the run it belongs to. This archive replaces each token hash with
a removal mark and the credential’s id, as a backup does. After an import, the visitor pairs again.

THIS IS ONE PROJECT'S ARCHIVE, so it carries no `visitor_credentials` rows AT ALL.
A credential is issued to an agent on another machine, and that agent does not visit one project: it is held against the whole installation, as a person and a durable agent are, so there is no project whose archive these would be. The database
this was taken from holds 1 of them and they are in NO project's archive; the whole-installation
export is the one that carries them.

SO THIS PAGE IS NOT EVIDENCE THAT THERE IS NOTHING TO FIND. It is evidence that you are holding the
wrong archive to find out.

## What was asked under a credential

One row per request. `mismatch` holds the facts that did not match the ones the credential was
issued with, each naming the fact, what was issued and what was sent. These rows are what a
request count, a write count and a mismatch count are counted from, so an archive that dropped
them would restore a credential with nothing to look at.

THIS IS ONE PROJECT'S ARCHIVE, so it carries no `visitor_requests` rows AT ALL.
A request made under such a credential belongs to the credential rather than to a project, for the same reason the credential does — and a count of what a visitor did that carried only one project's requests would be a supervision number that was quietly wrong, so there is no project whose archive these would be. The database
this was taken from holds 1 of them and they are in NO project's archive; the whole-installation
export is the one that carries them.

SO THIS PAGE IS NOT EVIDENCE THAT THERE IS NOTHING TO FIND. It is evidence that you are holding the
wrong archive to find out.

## Machines this office trusts

Which machines an office trusts is a fact about the whole installation: a machine is not trusted
for one project and refused for another. `how` says where each row came from — a press at the
world’s page, the confirmation of a visiting agent, or the environment, which is the address the
server was started to answer on. A row is never deleted: `removedAt` and `removedBecause` say
when somebody stopped trusting a machine and why, so the record of who was once let in survives.

THIS IS ONE PROJECT'S ARCHIVE, so it carries no `trusted_machines` rows AT ALL.
Which machines this office trusts is a fact about the whole installation, like the credentials above: a machine is not trusted for one project's work and refused for another, so there is no project whose archive these would be. The database
this was taken from holds 1 of them and they are in NO project's archive; the whole-installation
export is the one that carries them.

SO THIS PAGE IS NOT EVIDENCE THAT THERE IS NOTHING TO FIND. It is evidence that you are holding the
wrong archive to find out.
