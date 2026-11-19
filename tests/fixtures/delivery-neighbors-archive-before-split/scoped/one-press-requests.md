# The requests for one press

An agent asked the person to agree to one known act, and these say what was asked and what came of it.
`act` names one of the acts the office knows, and `inputs` holds its fixed inputs; a
row holds no command and no text that runs. `shows` is the sentence the person read, and `because` is the
agent's own words. `state` is `waiting`, `done`, `could-not`, `refused` or `withdrawn`, and `outcome` says what
the act did or why it could not run.

### fixture — waiting

```mole-office one_press_requests
id: "request-a"
workspaceId: "default"
act: "fixture"
inputs: "{}"
askedBy: "agent-a"
shows: "A request"
because: null
state: "waiting"
askedAt: "2026-08-12 10:00:00"
answeredAt: null
answeredByKind: null
answeredById: null
outcome: null
```
