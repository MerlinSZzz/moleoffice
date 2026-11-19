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

THIS IS ONE PROJECT'S ARCHIVE, so it carries no `planning_intents` rows AT ALL.
A plan is one person's overlay across work in every project, so it belongs to no single one of them, so there is no project whose archive these would be. The database
this was taken from holds 1 of them and they are in NO project's archive; the whole-installation
export is the one that carries them.

SO THIS PAGE IS NOT EVIDENCE THAT THERE IS NOTHING TO FIND. It is evidence that you are holding the
wrong archive to find out.
