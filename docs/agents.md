# Using it from an agent

Everything the browser app does, an agent can do, over the same HTTP API. There is no private back
channel.

## Two entry points, in this order

1. **`GET /api/kinds`** — the schema, as JSON. Every record kind, every field it takes, the type,
   whether the field is needed for the record to be complete, an example, and the cross-field rules
   written out in English. `GET /api/kinds/<kind>` returns one kind. It also serves the link types,
   each with its forward and reverse wording and whether it may carry a gate.
2. **`GET /api`** — every endpoint, each with a description of what it is for. Read the list from
   the endpoint rather than from a document: it moves.

The third thing is the agent skill in `.claude/skills/mole-office/`, and it answers a different question:
*which* record to write, and when. It deliberately restates no field names. The schema answers "what
shape"; the skill answers "what to file".

## Say who you are, on every request

```
x-mole-office-actor-type: agent
x-mole-office-actor-id:   your-agent-name
x-mole-office-session:    one id per session, so a day's work can be read back together
x-mole-office-workspace:  which project this request is about
```

Two optional ones exist for tracing what an agent read: `x-mole-office-trace` and `x-mole-office-purpose`.

**An identity claim must be complete.** Sending any of the three identity headers means the actor
type and the actor id must both be there and both be usable. Checked 28 August 2026:

```
x-mole-office-actor-id: nightly-sweep, with no actor-type
400  … Both x-mole-office-actor-type and x-mole-office-actor-id are required as soon as ANY of
     x-mole-office-actor-type, x-mole-office-actor-id, x-mole-office-session is sent. Filling the
     gap in from the defaults would have filed this write as human:nightly-sweep, which is not what
     you said — and human is the one actor allowed to write a decision.
```

**A header the product does not read is refused, not ignored.** Checked the same day:

```
x-mole-office-actor: agent
400  x-mole-office-actor is not a header Mole Office reads, and it looks like an attempt to say who
     is writing or which project this is. The headers Mole Office reads are
     x-mole-office-actor-type, x-mole-office-actor-id, x-mole-office-session,
     x-mole-office-workspace, x-mole-office-trace, x-mole-office-purpose.
```

A header carrying the name this product had before 28 August 2026 — `x-panelx-actor-type` and the
rest — is refused by the same rule, and for the same reason: being ignored means being attributed
to the person.

The reason is in the refusal: a write carrying none of the identity headers is attributed to the
person, so a misspelt header would file an agent's work under the one identity allowed to write
decisions.

**Sending no identity headers at all is still accepted** and recorded as the person, because
somebody typing `curl` by hand is a real caller. Nothing becomes the human by leaving something out
— saying nothing is recorded as you, and saying something wrong is refused.

## Writing

Records go to `POST /api/records` with `kind`, `title`, `summary` and `data`. What that write is
strict about, and what it is not, is in [project-model.md](project-model.md).

**One write is not a `POST /api/records` and is easy to miss.** `POST /api/records/:id/fulfil` is
the only route that discharges an obligation. It takes a note saying what settled it — required,
because a discharge with no note is indistinguishable from a mis-click a year later — plus the time
if it was kept earlier than now, and a state saying it stopped being owed rather than being
delivered. Verified 11 August 2026, when the product was called PanelX: an empty body was refused
naming the note; with a note it wrote the four fields together; a second call was a no-op that said
so rather than moving last week's date to today.

## Reading back

Writing was the half that always worked. Reading back was the half that failed, and most of it has
since been fixed.

Seven agents recorded this repository's own development through the API in one night: roughly two
hundred writes, exactly one refusal that had not been provoked on purpose, and not one of them had
to open `src/` to learn a field name, a value word, a kind or an endpoint. The same seven all had to
open `src/` to find out where their own work would appear.

What has changed since:

- **There is a search.** `GET /api/search?q=…` answers with the records that match and where in each
  record the words matched. The old README said finding a record by name meant listing every record
  and matching client-side. That is no longer true; checked 27 August 2026.
- **Where a run belongs is answered by the API**, with the rule it used and what it read, rather
  than only in the browser. One agent's session had been filed under the wrong module because that
  rule ran only in the browser.
- **A create answers with near-duplicate titles** already in the project, so two agents filing one
  fact twenty minutes apart find out at the second write.
- **A link write answers with both ends**, the type really stored, and a sentence, so a link made by
  typing a title can be checked without a second request.

## What an agent may not do

An agent is refused the acts that belong to the person, and told what to file instead. The full rule
— including the one authority under which an agent may write a decision, and what it must attribute
— is in [governance.md](governance.md).

## Getting the context to work with

Do not reconstruct a project by listing every record. Ask for a context bundle: it assembles what a
worker needs for a named purpose and puts the limits on that text at the top.
[context-bundles.md](context-bundles.md).
