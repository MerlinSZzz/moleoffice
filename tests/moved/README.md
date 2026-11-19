# The lists of moved test files

A test file has moved when it reads the test office's constants instead of writing out the owner, the
owner's home or the coordinator. Its owner lists it here, in a file of its own: `tests/moved/<owner>.txt`, with
one path from the repository on each line, such as `tests/a-name.test.ts`. A wave's list is named for the
wave, such as `tests/moved/13s.txt`. A list can be named for an owner that is not a wave:
`tests/moved/operations.txt` is the operations agent's. The commit author names that count as the operations
agent come from `MOLE_OFFICE_OPERATIONS_LIST_KEEPERS`; a host names them in its own environment or settings file.

Which file is whose is one rule. The owner is whoever made the most commits to the file since
20 September 2026, following renames. A wave's supervisor and its workers count as the wave. Merge
commits are left out. In a tie, the owner is the one whose newest commit is the newest. This command
prints each file's owner, the list the owner keeps and the list the file is on now:

    node tests/moved/whose-file.ts   every test file
    node tests/moved/whose-file.ts tests/nothing-from-a-sandbox-is-the-person.test.ts   only the files named

A file sits on one list only. A file on another owner's list is asked for from that owner, not taken.

A file already on a list stays on that list, whoever makes later commits to it. A wording sweep by another
wave does not move it. `tests/moved/whose-file.ts` decides only where a file that is on no list goes when it is
first listed, and it decides that at that moment. This is decision `HPk0z-rMb0nA` (5 October 2026). So when the
command prints an owner whose list is not the list the file is on, the file stays where it is.

Two gates read every `.txt` file here together with `MOVED` in `tests/the-moved-test-files.ts`:
`tests/the-test-offices-owner-is-read-from-one-place.test.ts` and `tests/the-test-files-name-no-real-home.test.ts`.
A path listed twice, in one list or in two, and a list that names a file that does not exist, are refused
with a sentence that names the list.

A list says its pronoun slice is done in its own first line, in exactly these words:

    # done: every file on this list calls the owner by no pronoun

Until it was deleted on 12 November 2026, a gate read every file on such a list, and a line in one of them that
said he, his, him or himself turned it red unless the gate allowed that line. A wave writes the line on its own list when its own slice
is done. Any other line that starts with `#`, or this line anywhere but first, is refused with a sentence that
names the list and the line. `MOVED` is not a file here, so `MOVED_IS_DONE` beside it in
`tests/the-moved-test-files.ts` says the same for it.

Three files stay off every list. The two gates name the owner and the owner's home on purpose, because that is what
they look for. `tests/the-sandboxes-mind-disk-hours-and-gpu.test.ts` stayed off while `tools/sandbox-common.mjs` named
two agents literally. The launcher now reads them from `MOLE_OFFICE_SANDBOX_DISK_WATCHERS` and names none, and no wave
has put the test on a list yet.
