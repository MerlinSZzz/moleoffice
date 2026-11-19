# When somebody means to work on something

A span of days a person placed a piece of work on. `startsOn` and `endsOn` are both `YYYY-MM-DD` and
BOTH DAYS ARE INCLUDED, so 2026-08-20 to 2026-08-26 is seven days. A window may cross a week boundary,
which is why it is two columns where an allocation deliberately stores one period key.

A WINDOW HOLDS NO HOURS AND IS IN NO TOTAL. It says when somebody intends to work on this, not that the
work fills those days. The hours are in `allocations` and are a different fact; the size of the work is
`effort_hours` on the record and is a third. An importer that added a window's days into a week would be
inventing time nobody committed.

`state` is `planned`, `done` or `dropped`. `done` completes THIS SPAN, exactly as an allocation's `done`
completes that slice of time; the work carries its own state and only a person changes it. `dropped` is a
span that did not happen, which is not the same as a span nobody ever planned.

`note` is what somebody needs to know when they come back to the block, and it is carried verbatim. Null
means nobody wrote one, which is the ordinary case and is not an empty note.

`recordId` names work that stays in its own project. These rows carry no `workspaceId` for the same
reason the rest of the planning layer does not: a person's week holds work from every project.

### 2026-08-12 to 2026-08-15 — work-b

```mole-office work_windows
id: "window-one"
recordId: "work-b"
startsOn: "2026-08-12"
endsOn: "2026-08-15"
note: null
state: "planned"
createdAt: "2026-08-12 10:00:00"
updatedAt: "2026-08-12 10:00:00"
createdBy: "human:fixture"
```
