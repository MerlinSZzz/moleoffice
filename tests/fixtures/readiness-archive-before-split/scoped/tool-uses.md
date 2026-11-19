# The uses of tools

Each row is one use of a tool, written on the run that used it by POST /api/toolset/uses. `seq` is its place on
that run, from 1. `said` is what the use did, in the words of the agent that used it. A row with `movedAt` was a
line in the run's `data.toolUses` until migration 0231 moved it here, and it names no writer because the list
never said who wrote each line.
`proof` is what the use door found when it checked that tools/use-line.mjs sent the line: `matches`, `none` or
`does not match`. It is empty on a row written before migration 0300, when the door did not check.

### run-a — use 1

```mole-office tool_uses
id: "use-a"
workspaceId: "default"
runId: "run-a"
seq: 1
at: "2026-08-12 10:00:00"
tool: "fixture"
said: "A use"
actorType: null
actorId: null
movedAt: null
proof: null
```
