# The readiness checklists

An operation that reaches others runs only after those it affects have signed. A readiness checklist is one
such operation on one target, waiting for those signatures.
`operation` names one of the operations the office gates, and `inputs` holds its fixed inputs; a row holds no
command and no text that runs. `on_what` is a hash of the two, and every signature names the `on_what` it was
given on. `shows` is the sentence each signer read, and `because` is the raiser's own words.

`level` is how far the operation reaches, `a-group` or `everyone`, and `signers` is who must sign. The office
worked out both when the checklist was raised; whoever raised it chose neither. `state` is `waiting`, `running`,
`ran`, `could-not`, `cancelled` or `expired`, and `outcome` says what the operation did or why it did not run.

Each signature says who signed, when, and on what. A signer who took a signature back keeps the row, with
`withdrawn_at` set.

## The checklists

### fixture — waiting

```mole-office readiness_checklists
id: "check-a"
workspaceId: "default"
operation: "fixture"
inputs: "{}"
onWhat: "target-a"
shows: "A checklist"
level: "a-group"
signers: "[]"
raisedByKind: "agent"
raisedById: "agent-a"
because: null
state: "waiting"
raisedAt: "2026-08-12 10:00:00"
endsAt: "2026-09-12 10:00:00"
closedAt: null
closedByKind: null
closedById: null
outcome: null
```

## The signatures

### agent agent-a on check-a

```mole-office readiness_signatures
id: "signature-a"
checklistId: "check-a"
signerKind: "agent"
signerId: "agent-a"
onWhat: "target-a"
signedAt: "2026-08-12 10:00:00"
withdrawnAt: null
```
