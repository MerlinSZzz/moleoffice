# Worlds

Every world this installation has had, alive and dead. A world is one running Mole Office with one
database, and the identity of a world is the identity of that database — not its address, which a
machine takes back when a process ends, and not its name, which a person may change.

THIS TABLE BELONGS TO NO PROJECT, because a world holds every project it has. Only the
whole-installation archive carries it.

A ROW WITH `diedAt` FILLED IN IS NOT A ROW TO DROP. The person's words ask for a world appearing AND a world
disappearing to be recorded, so the history is the content: a restore that kept only the live worlds
would keep the least interesting half.

### First world — db-a

```mole-office worlds
id: "world-a"
name: "First world"
purpose: null
handback: null
kind: "test"
startedByKind: null
startedById: null
checkout: null
head: null
databaseIdentity: "db-a"
address: null
addressForOtherMachines: null
standing: "live"
parentWorld: null
bornAt: "2026-08-12 10:00:00"
diedAt: null
diedBecause: null
installation: "installation-fixture"
```

### Second world — db-z

```mole-office worlds
id: "world-z"
name: "Second world"
purpose: null
handback: null
kind: "test"
startedByKind: null
startedById: null
checkout: null
head: null
databaseIdentity: "db-z"
address: null
addressForOtherMachines: null
standing: "live"
parentWorld: null
bornAt: "2026-08-12 10:00:00"
diedAt: null
diedBecause: null
installation: "installation-fixture"
```

## The office runtime choices

It held no row.
## Permission to restart or pause the office

It held no row.
## Visits

A visit is a citizen of one world working in another, with what they came to do in their own
words. A visit whose `registeredAt` is later than its `since` began before the office heard about
it, because the main world was not answering when it started; there is no column for that, only
the two stamps.

### agent fixture-agent — 2026-08-12 10:00:00

```mole-office visits
id: "visit-a"
visitorKind: "agent"
visitorId: "fixture-agent"
fromWorld: "world-z"
toWorld: "world-a"
since: "2026-08-12 10:00:00"
until: null
why: "A visit"
registeredAt: "2026-08-12 10:00:00"
reportedAt: null
```

## Visiting agents

An agent on another machine, before that machine runs a world of its own, holds a credential of
its own. The credential records the facts of the run it was issued to, so a token found by
somebody else can be told from the run it belongs to. This archive replaces each token hash with
a removal mark and the credential’s id, as a backup does. After an import, the visitor pairs again.

### Fixture visitor — fixture-visitor

```mole-office visitor_credentials
id: "credential-a"
handle: "fixture-visitor"
name: "Fixture visitor"
role: "worker"
tokenHash: "removed from this copy: credential-a"
world: null
machine: null
machineHow: "fixture"
conversationPath: null
startDirectory: null
runtime: null
sessionRecord: null
standing: "waiting"
confirmedByKind: null
confirmedById: null
confirmedAt: null
endsAt: "2026-09-12 10:00:00"
endedAt: null
endedBecause: null
issuedAt: "2026-08-12 10:00:00"
```

## What was asked under a credential

One row per request. `mismatch` holds the facts that did not match the ones the credential was
issued with, each naming the fact, what was issued and what was sent. These rows are what a
request count, a write count and a mismatch count are counted from, so an archive that dropped
them would restore a credential with nothing to look at.

### GET /fixture — 2026-08-12 10:00:00

```mole-office visitor_requests
id: "request-a"
credentialId: "credential-a"
at: "2026-08-12 10:00:00"
method: "GET"
route: "/fixture"
operation: null
wrote: false
refusedBecause: null
mismatch: null
fromATrustedMachine: null
```

## Machines this office trusts

Which machines an office trusts is a fact about the whole installation: a machine is not trusted
for one project and refused for another. `how` says where each row came from — a press at the
world’s page, the confirmation of a visiting agent, or the environment, which is the address the
server was started to answer on. A row is never deleted: `removedAt` and `removedBecause` say
when somebody stopped trusting a machine and why, so the record of who was once let in survives.

### fixture.invalid

```mole-office trusted_machines
id: "machine-a"
address: "fixture.invalid"
note: null
how: "fixture"
credentialId: null
addedAt: "2026-08-12 10:00:00"
addedByKind: null
addedById: null
removedAt: null
removedByKind: null
removedById: null
removedBecause: null
```
