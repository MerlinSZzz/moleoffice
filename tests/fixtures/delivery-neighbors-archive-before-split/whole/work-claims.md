# What an agent was working on

An agent says what it is working on when it starts: some records, some files and folders, and the run whose
life the claim follows. A second live claim naming the same thing opens a group with both agents and the
owner in it, which is in groups.md.

A CLAIM IS KEPT AFTER IT ENDS. A lease ends when its run ends and nothing writes that down — it is read from
the ledger and the session record every time somebody asks — so a claim in this archive may be one that ended
long ago. `releasedAt` is the one ending that IS written down, and it means whoever made the claim said they
had finished.

THE PARTICIPANTS are in participants.md and the runs are session records, both of which a restore writes
first.

### agent-a — from 2026-08-12 10:00:00

```mole-office work_claims
id: "claim-a"
workspaceId: "default"
claimantKind: "agent"
claimantId: "agent-a"
run: "run-a"
things: "[]"
openedAt: "2026-08-12 10:00:00"
renewedAt: null
releasedAt: null
releasedBecause: null
```

### agent-z — from 2026-08-12 10:00:00

```mole-office work_claims
id: "claim-z"
workspaceId: "second"
claimantKind: "agent"
claimantId: "agent-z"
run: "run-z"
things: "[]"
openedAt: "2026-08-12 10:00:00"
renewedAt: null
releasedAt: null
releasedBecause: null
```
