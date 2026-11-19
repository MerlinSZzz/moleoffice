# The handovers

Each agent keeps a handover document, so its next session, or whoever takes over its work, can start from it.
A new handover is a new row and nothing is changed in place,
so the newest row for an agent is its current handover and the rows before it are its history.
`writtenByKind` is `agent` or `person`. An `agent` row was written by the agent itself, with its own key, or by a
secretary under the person's grant, which `writtenById` then names as a different agent from the handover's own.

### agent-a — 2026-08-12 10:00:00

```mole-office handovers
id: "handover-a"
agentId: "agent-a"
workspaceId: "default"
text: "A handover"
writtenAt: "2026-08-12 10:00:00"
writtenByKind: "agent"
writtenById: "agent-a"
sessionId: null
```

### agent-z — 2026-08-12 10:00:00

```mole-office handovers
id: "handover-z"
agentId: "agent-z"
workspaceId: "second"
text: "A handover"
writtenAt: "2026-08-12 10:00:00"
writtenByKind: "agent"
writtenById: "agent-z"
sessionId: null
```
