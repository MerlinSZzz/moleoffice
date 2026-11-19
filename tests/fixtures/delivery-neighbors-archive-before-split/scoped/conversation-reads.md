# Who read a conversation they were not part of

A person with the owner row may open a conversation between two agents and read it as either of them sees it.
Reading writes nothing on any message. This is where the read itself is written down: who, which pair, which
side, and when. Each reader keeps one read of each conversation in each project, the newest, and a newer read
replaces it.

IT IS ITS OWN PAGE BECAUSE IT IS AN ACT RATHER THAN TRAFFIC. The same read also leaves a row in the usage
ledger, and that one is deleted after a fortnight because it is there to count requests. This one is kept
until the same reader reads the same conversation again.

A PAIR IS TWO AGENT IDS WITH A TILDE BETWEEN THEM, in one order however it was asked for. The agents
themselves are in participants.md, which a restore writes first.

### agent-a~person — read as agent-a

```mole-office conversation_reads
id: "read-a"
workspaceId: "default"
readerKind: "agent"
readerId: "agent-a"
pair: "agent-a~person"
asSide: "agent-a"
asSideKind: null
at: "2026-08-12 10:00:00"
```
