# Plans, hours and time

Two different things live here, and keeping them apart is the point.

- A **plan** is writing: what you mean to do, in your own words, in lines you can file as work.
- The **schedule** is hours: when you will actually spend real time on work that already exists.

Nothing on a plan asks for an hour. Nothing on the schedule invents work.

## Loose input, strict storage, visible interpretation

**A person may write what they mean. Mole Office stores only what it can defend. What it made of
their words is shown back to them.** A person says what they intend, agents and parsers translate
it, and the product checks it before it commits it.

Three layers, and nothing may skip one:

1. **What the person enters**, kept exactly as typed. `around 5h`, `Tuesday afternoon`,
   `before Friday`, `probably 15h this week`. Stored, not parsed away, and it is what they see again.
2. **What the product made of it**, shown beside it and never instead of it. An interpretation is a
   claim about somebody's words, so it is always visible and always attributed.
3. **What was committed**, which is canonical, strict, and the only thing arithmetic reads.

Read from this project's corpus on 27 August 2026, one intent per row:

| what was said | period read from it | hours | state |
|---|---|---|---|
| `next week` | 2026-W35 | none | offered |
| `1h` | none | 1 | kept |
| `around 1.5 maybe more` | none | none | kept |

**A thing at step 1 is not a fact.** It never enters a total, never makes a week look full, and never
counts as work planned. When the interpretation cannot be made reliably, the product stops at step 1
and says so. "You wrote *sometime next week* and nothing has been scheduled from it yet" is a
complete, honest answer. A guessed date would not be.

**Agents get no other door.** An agent does not write canonical rows directly because its input was
already structured. It produces the same proposed operations a person's words become, and they are
validated the same way.

## What is stored

- **Plans and plan lines.** A line can be read, given time, or filed as work — and a plan records
  what has been read, so what changed since you last read it can be answered.
- **Allocations.** Hours placed on a day, a week or a month, each recording the line it came from.
- **Capacity.** How many hours a period holds, so a full week can be seen as full.
- **Intents.** The three layers above.
- **Work windows.** A span of days somebody means to work on something, with a handover note. A
  window carries no hours and is in no total.

## Committing time is the person's act

Turning your words about time into hours on your calendar is one of the acts an agent is refused.
An agent that asks is answered with a refusal that says so, and the request lands on the person's
queue with the refusal quoted. [governance.md](governance.md).
