# Presentation intent

How somebody wants a structure PRESENTED: lanes, order, roles, emphasis. Never geometry, never
colour, never CSS — those are derived on every draw and are stored nowhere. An importer must run
`checkScopeIntent` / `checkNodeIntent` from src/shared/presentation.ts over every row below, because
a file a person edited by hand is exactly where an `x:` will appear, and the refusal is the feature.

### structure · (scope) — the scope's own settings

```mole-office presentation_intent
workspaceId: "default"
scope: "structure"
target: "(scope)"
intent: {"direction":"right"}
updatedAt: "2026-08-12 10:00:00"
updatedBy: "human:fixture"
```

### structure · (scope) — the scope's own settings

```mole-office presentation_intent
workspaceId: "second"
scope: "structure"
target: "(scope)"
intent: {"direction":"down"}
updatedAt: "2026-08-12 10:00:00"
updatedBy: "human:fixture"
```
