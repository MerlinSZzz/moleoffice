# Plans

Documents somebody wrote. Planning is writing: prose, headings, bullets, tick boxes and tables, and
NONE of it is project truth. Nothing here was parsed for meaning and nothing here became a record
because Mole Office read it.

A line crosses into the project only when a person presses something. `recordId` on a line is the record
somebody filed that line as. THE WORDS AND THE TITLE ARE TWO SEPARATE FACTS: the line seeded the title
once and nothing has kept them equal since, so where they differ both are true and both are carried.

Like the rest of the planning layer these carry no `workspaceId` — a plan spans projects — and naming a
record grants nothing.

THE TEXT IS VERBATIM, one row per line of the document, blank lines included. `position` is the order,
as a real number, so a line inserted between two others took a midpoint.

BESIDE THE LINES ARE THE REASONS THEY CHANGED, added by migration 0170. Criterion P3: adding,
reordering or dropping a line keeps one `plan_line_revisions` row with the reason the writer gave,
in their own words. `op` is `added`, `reordered` or `dropped`; `seq` is per line and reads oldest
first. A line that predates the table has no row, and nothing here invents one.

### Two projects

```mole-office plans
id: "plan-one"
title: "Two projects"
state: "open"
readAt: null
readByAgent: null
readUnderGrant: null
createdAt: "2026-08-12 10:00:00"
updatedAt: "2026-08-12 10:00:00"
createdBy: "human:fixture"
movedFromDraft: null
```

```mole-office plan_lines
id: "line-a"
planId: "plan-one"
position: 1
text: "First line"
recordId: "work-a"
remark: null
updatedAt: "2026-08-12 10:00:00"
updatedBy: "human:fixture"
```

```mole-office plan_lines
id: "line-z"
planId: "plan-one"
position: 2
text: "Second line"
recordId: "work-b"
remark: null
updatedAt: "2026-08-12 10:00:00"
updatedBy: "human:fixture"
```

```mole-office plan_line_revisions
id: "revision-one"
planId: "plan-one"
lineId: "line-a"
seq: 1
op: "added"
reason: "A reason"
changedBy: "human:fixture"
at: "2026-08-12 10:00:00"
```
