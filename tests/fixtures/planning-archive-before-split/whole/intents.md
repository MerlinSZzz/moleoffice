# What somebody wrote about time

The words a person wrote about when they would do something, kept exactly as they typed them. `said` is
verbatim: nothing trimmed it, nothing repaired it, and nothing parsed it away.

BESIDE THE WORDS IS WHAT MOLE OFFICE MADE OF THEM, and it is often nothing. `horizon`, `period` and `hours`
are what could be read reliably, and they are null when nothing could be. "Tuesday afternoon" has a
defensible reading and "sometime next week" does not, so the second is stored with the reading left
empty rather than guessed. Null here means nobody could tell, which is a different fact from zero.

ONLY A COMMITTED INTENT IS IN ANY TOTAL. `state` is one of three: `kept` means the words are stored and
nothing was read from them, `offered` means a reading was made and is waiting for a person, and
`committed` means it became an allocation. A kept or offered row adds nothing to a week and uses no
capacity. The hours of a committed one are in `allocations` and are not repeated here.

`recordId` and `planLineId` are both optional, and an intent may have neither. Somebody may write time
on a plan line before that line is filed as work, and the words are worth keeping either way.

Like the rest of the planning layer these carry no `workspaceId` — a week of intentions spans projects.

### intent-one — no period was read from the words

```mole-office planning_intents
id: "intent-one"
said: "Words exactly"
recordId: "work-b"
planLineId: null
horizon: null
period: null
hours: null
state: "kept"
createdAt: "2026-08-12 10:00:00"
createdBy: "human:fixture"
```
