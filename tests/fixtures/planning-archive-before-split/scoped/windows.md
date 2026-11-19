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

THIS IS ONE PROJECT'S ARCHIVE, so it carries no `work_windows` rows AT ALL.
A plan is one person's overlay across work in every project, so it belongs to no single one of them, so there is no project whose archive these would be. The database
this was taken from holds 1 of them and they are in NO project's archive; the whole-installation
export is the one that carries them.

SO THIS PAGE IS NOT EVIDENCE THAT THERE IS NOTHING TO FIND. It is evidence that you are holding the
wrong archive to find out.
