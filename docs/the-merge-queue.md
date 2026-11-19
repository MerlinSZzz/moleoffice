# The merge queue

The merge queue is how finished work reaches the main branch. Each piece of work is one entry in the
queue. A tool with no model carries the entry through fixed steps and reports what it measured after
each one. The server decides the entry's next state from that report and from what the office already
holds. An entry lands only when an inspector released exactly the content that was submitted. One
kind of entry is the exception: a secretary's entry that changes only `design/` files, which a rule
covers instead. A git entry also needs the whole test suite to run on the result with no test
failing that does not also fail on main, unless every file it changes is a document that no test
reads.

[the-check.md](the-check.md) explains the check that gives the release.

## The words

- **Entry.** A record of the kind `merge_entry`. It names the run that did the work, the run's seal,
  and the changeset.
- **Seal.** The fixed record of what a run submitted, written when the run says it is finished.
  The check reads it, and the queue lands only what it holds.
- **Changeset.** What the entry carries. It comes in one of two forms:
  - **git**: a commit on a branch of a repository the project registered. The commit and its base
    are read off the run's seal, never sent by the caller.
  - **files**: a list of operations on a folder that is not in git: add, modify, delete or rename.
    Each operation names a path, the sha256 of the file before and after (the word `absent` where
    there is no file), and where the content came from. The new content waits in a staging folder.
- **Main world.** Where the change lands: the checkout of the repository for a git entry, and the
  target folder for a files entry.
- **Lane.** The folder a changeset lands in. Only one entry holds a lane at a time, and the database
  enforces that. Two entries that land in two different folders do not wait for each other.

## Who does what

- **The server** keeps the entries and decides every state. It does no work on the tree, and it does
  not start the merge tool itself. The rules are in
  `src/shared/merge-queue.ts`, `src/server/lib/merge-queue.ts` and
  `src/server/lib/merge-state-machine.ts`. The doors are in `src/server/api/merge-queue.ts`.
- **The merge tool**, `tools/the-merger.mjs`, does the work on the tree: it pins, rebases, runs the
  checkers and the tests, and moves main. It runs no model. One run of it carries one entry. After
  each step it reports to `POST /api/merge-queue/<id>/step`, reads the entry back, and goes on only
  if the new state is one it acts in. Its parts are in `tools/merge-tool/`.
- **The message worker** starts the merge tool for each entry the office marks as wanting it. It runs
  at most one merge tool at a time. It watches one project: the one the setting
  `MOLE_OFFICE_WORKSPACE` names. The setting `MOLE_OFFICE_MESSAGE_WORKER` says whether the server
  starts the worker at all:
  - `on`: the worker starts agent runs, checks and the merge tool.
  - `merges-only`: the worker starts the merge tool, the rounds asked through the next-round
    door and the worker runs asked through the worker-run door, and no run for a message. It starts a check only while the office says checks run in that mode.
  - `off`: there is no worker, and nothing starts the merge tool.
- **Starting the tool by hand.** For an entry in a project the worker does not watch, or when no
  worker runs, the tool can be started by hand:
  `node tools/the-merger.mjs --entry <entry id> --session <session id> --workspace <project>`.
  The session is a run record whose runtime is `merge-tool`. The tool's step doors take reports only
  from the message worker's identity, and that identity is the tool's default.

## Submitting an entry

`POST /api/merge-queue` with `{"run": "<run id>", "changeset": {…}}`. The door's own description
gives every field.

- The run must have a seal. A run is sealed when it says its work is finished. A run with no seal is
  refused with 409.
- The run's own agent, the agent that started that agent, the run's own starter, or the person may
  submit it. Anybody else is refused with 403.
- A run closed unchecked is refused.
- A run that was released on one seal is never judged on another, because a run is released once. If
  the run's release read a different seal from the one it holds now, the door refuses it. The branch
  goes in again under a new run.
- An older entry for the same work is superseded in the same write. The same work means the same lane,
  and for git a newer commit that contains the older entry's commit, or for files the same staging
  folder. An older git entry is superseded only when the newer entry's base holds none of its commits.
  When the base holds some of them, the merge tool can land the newer entry only after the older one,
  so both stay and the reply says the older one lands first. An older entry that is already landing
  cannot be superseded, so the door refuses the new one. An entry that already carries exactly this
  seal and this changeset is refused as a repeat.
- The reply says whether a test of another entry is under way in the same folder, and whether that
  test reads any file this change touches.

**An entry for `design/` files only.** The agent that holds the secretary card may submit a change
that touches only files under `design/` without a run of its own. It sends the changeset and the
working folder. The office files a finished run for it and seals that folder. No inspector checks such
an entry. A rule covers it in place of a release.

## The states

An entry is always in one of these eleven states. The names are the words the code stores
(`MERGE_STATES` in `src/shared/merge-queue.ts`).

| State | What it means | What it waits on | Holds its lane |
|---|---|---|---|
| `submitted` | Its run has a seal, and nothing has been fetched or checked yet. | the merge tool, which pins it | no |
| `pinned` | The submitted content is held by the office and cannot move any more. | the inspector's release of the run | no |
| `judged` | The inspector released exactly this content. | its lane, then the merge tool | no |
| `integrating` | It is being put on top of the main world as it is now. | the merge tool | yes |
| `reinspecting` | Putting it on top of main changed some files, and only those are checked again. | the inspector | no, unless it is back from an earlier check |
| `testing` | The result is being tested before it lands. | the merge tool | yes |
| `landing` | The office has started moving the main world. It can no longer be withdrawn. | the merge tool, then the server being healthy | yes |
| `merged` | It is in the main world. Final. | nobody | no |
| `bounced` | It went back to its submitter. Final. | its submitter | no |
| `withdrawn` | Its submitter or the person took it back before it landed. Final. | nobody | no |
| `superseded` | A newer entry for the same work carries it now. Final. | nobody | no |

An entry in any state before `landing` that is not final may be withdrawn, with
`POST /api/merge-queue/<id>/withdraw` and a reason. Only its submitter or the person may do that. If a
merge tool run is still going for an entry that was withdrawn or superseded, the message worker stops
that run by its process group.

## The stages, in order

### 1. Pin (`submitted` to `pinned`)

The tool holds the submitted content so that nothing can change it while it is checked.

- **git:** the tool fetches the sealed commit into the main repository if it is not there already,
  and compares every sealed file with the seal. Then it points the ref
  `refs/mole-office/queue/<entry id>` at the commit. From then on the queue reads the commit, and the
  worker's worktree may move on or be removed.
- **files:** the tool copies each staged file into its own working folder for the entry, and runs the
  files checker, `tools/checks/files-changeset.mjs`. The checker verifies shape, provenance, hash and
  content, and that nothing would be overwritten.
- **What the server checks:** the content the tool reports must be exactly what the seal froze. If it
  is not, the report is refused and nothing is written. A checker failure bounces the entry with the
  reason `guard`.
- **A files entry is bound to its seal here.** If it brings bytes its seal did not freeze, it bounces
  with the reason `unjudged`. So does a path the files checker could not decide, with one exception:
  on an entry made from a files seal, such a path waits for the check of that seal to judge it, unless
  the path is protected or generated.
- **Deletes.** If a files entry deletes files, the office asks the agent that holds the secretary card
  to confirm them, once.
- **Documentation.** If the tool finds that every file a git entry changes is a Markdown or plain-text
  file that no test reads, the entry becomes a documentation entry. It queues in a lane of its own,
  `<folder> documents`, and later runs no suite.

### 2. The verdict (`pinned` to `judged`)

Right after the pin, and again each time a check writes a verdict on the run, the server asks one
question: is there an inspector's release of the submitting run that names this entry's seal, the
seal's hash and, for git, the pinned commit?

- **Yes:** the entry is `judged`. It records each submitted path at its content hash, as the content
  the verdict covers.
- **A refusal stands:** the entry bounces with the reason `refused`.
- **Otherwise** the entry stays `pinned`, and its reading says why. Some releases are not enough:
  a release by the run's starter, a scoped release, or a release of another seal. If the project's
  review level is not `full`, the office starts no inspector, and so the entry waits.
- The release may come before or after the pin. The check door tells the queue each time it writes a
  verdict.
- **A files seal:** the release must also have read the file that each modify replaces, and it must
  name, with a line of its own, every path the files checker could not decide. If not, the entry
  bounces as `unjudged`.

### 3. Take the lane (`judged` to `integrating`)

The tool reports `integrating`, and the server asks the verdict question again before the entry takes
its lane.

- If another entry holds the lane, the tool run ends and names that entry. The entry stays `judged`.
  The worker is not handed it again until the lane is free, and that run is not counted against it.
- A files entry whose deletes nobody has confirmed does not take its lane. The tool says what it waits
  on and ends.

### 4. Integrate (`integrating` to `testing`, `reinspecting` or `bounced`)

The tool puts the change on top of the main world as it is at that moment.

- **git:** the tool starts a sandbox of the entry's own and works in a clone inside it. The sandbox
  is named `merge-<slug>-<hash>`. The slug is the entry id in lower case, with each run of characters
  other than `a-z`, `0-9` and `-` made one dash, then leading and trailing dashes removed, then cut to
  its first 20 characters. The hash is the first six hex digits of the sha256 of the entry id as it
  was written, before the lower case. It
  runs `git rebase --onto <main> <base>`. It never resolves a conflict: it reports the conflicted paths
  and abandons the rebase, and the entry bounces as `conflict`. Then two guards
  run on the result: `tools/checks/git-changeset.mjs`, and the reader that finds a test mutation left
  in the code (`tests/applied-mutations.ts`). A guard that refuses bounces the entry as `guard`. If the change touches a path that the repository's
  `.mole-office/protected.json` lists under `regenerateWhen` for a generated file, the tool runs that
  file's generator in the clone and commits the output on top as its own commit. Last, the tool
  reports every path that differs from main, at its sha256.
- **files:** the tool runs the files checker against the main world as it is now. A file whose hash
  is not the before-hash is a conflict, unless the submitter chose `keep-both`: then an add or a modify
  lands under another name beside the existing file. The server also checks that every path lands
  inside the files area registered for the run's agent. A path outside it bounces the entry as
  `guard`.
- **The verdict follows file content.** The server compares each reported path with what the release
  read.
  - A path whose content is unchanged keeps its verdict.
  - A path the checker decided by regenerating it needs no inspector.
  - If nothing else is left, the entry goes on to `testing`.
  - If something is left, a git entry goes to `reinspecting`. A files entry bounces as `unjudged`,
    unless its release already judged each such path with a line of its own and none of them is
    protected or generated.

### 5. Check again (`reinspecting` to `testing` or `judged`), git entries only

The office files a run for the submitting agent at the integrated tree and seals it. Then it asks for
a scoped check of the paths that changed, the same way every check is asked for. It also sends the
submitter a notice. When the submitter is an agent, the notice gives the commands that run the check
by hand, where the office can give them. While the message worker is off, or in `merges-only` mode while checks are not switched on for that mode, nothing starts the check by itself.

- While the check runs, the entry lets its lane go, so the next judged entry of the lane may take
  the lane and land. Starting the check can take an hour, and the lane does not wait for it.
- An entry back from an earlier check holds its lane through this check, so it lets the lane go
  only once before it is tested.
- A release that covers exactly the asked paths, at the integrated commit, moves the entry to
  `testing` when two things hold. First, the merge tool would hand it its lane now, as it hands a
  judged entry: the lane is free, and no other entry goes first. Second, no entry has landed on the
  main it was integrated on.
- Otherwise the release moves the entry back to `judged`, with what the check read now judged. It
  takes its lane next, after any entry moved to the front and any entry the lane's newest bus lets
  go first. No attempt is counted. The tool integrates it again on main as main is then, and only
  the paths whose content changed again are checked.
- A refusal bounces the entry as `refused`, and the office ends the check-again run with it.

### 6. Test (`testing`)

- **git:** the tool runs `npm run build` and the whole suite in the entry's sandbox. It holds the
  office's `full-suite` seat for the whole step. Each file that is red is run again alone on the same tree. A file still red alone is run alone
  on main as it stood when the entry was integrated. The comparison is test by test. The entry is
  blamed for a test only when, in a pair of runs made one after the other, the test fails with the
  entry and passes on main.
  - Green: no test fails with the entry that main does not also fail. The entry may land.
  - Red: the entry bounces as `red`, naming the tests.
  - If a run gives no readable result, the tool stops without a result, and that counts as a tool run
    that did not move the entry (see below).
  - The suite may be run once for two entries: this one and the lane's oldest judged git entry, on a
    tree that holds both. The tool pairs them only when several conditions hold: among them, neither
    changes the queue's own code, no file is changed by both, and every file the other entry's
    release read is unchanged on that tree. The result for each entry is decided on its own. Otherwise the entry is tested
    alone.
- **files:** there is no suite. The tool reports green and says that nothing was run.
- **documentation entry:** no suite runs.
- **Main moved while the tests ran:** the tree that was tested can no longer land. The entry goes back
  to `judged` and queues for its lane again.

### 7. Land (`testing` to `landing` to `merged`)

The tool reports the `landing` step before it moves anything, so the state is on disk first. The
server refuses that step when:

- no green test run is recorded;
- main is not where the entry was integrated;
- a files entry has deletes nobody confirmed;
- another entry of the same repository is landing now (main moves one landing at a time, whichever
  lane each entry is in).

Then:

- **git:** the tool checks that main has not moved, and backs up the office's database with
  `npm run db:backup`. It moves main with `git merge --ff-only`, never with a merge commit. It runs
  `npm run db:migrate` only when the landed commits bring migration files. Then it waits until
  `GET /api/health` says ok. When the office runs from that checkout, it also waits until
  `GET /api/runtime` says the office serves the landed commit.
- **files:** the tool checks every touched path again. Each must hold what it held when the entry was
  integrated, or what the landing puts there; otherwise the folder moved, and that counts as main
  moving. It creates a new file only where none exists,
  and replaces a modified file only while it still holds the before-hash. Then it reads each landed
  file back and compares its hash. Nothing is backed up, migrated or restarted.
- **Main moved under it:** the entry goes back to `judged` and queues again. The tool reports this
  for main that moved while the entry was tested and for main that moved as it landed, and both count
  together. After main has moved more than three times, the entry bounces as `churn`.
- **Main moved only by documentation entries:** the tool puts the entry on the new main again, and
  the server accepts that without new tests when the named documentation entries join the old main to
  the new one and the entry's files are what was tested.
- **Landed:** for a git entry, the server accepts the landing only when main is at exactly the commit
  that was tested. The entry becomes `merged`. A receipt is written on the entry and on the run that submitted it. It
  names main before and after, the verdict the merge rested on, any checks again, and the test numbers.

## Bounces, and who is told

A bounced entry is final. Its reason is one of seven:

| Reason | What happened |
|---|---|
| `refused` | A check refused to release the run, or the scoped check again. |
| `conflict` | The change could not be put on top of main without a conflict. |
| `guard` | A checker or guard refused it, or a file would land outside its files area. |
| `red` | Tests failed with the entry that pass on main. |
| `churn` | Main moved under it more than three times. |
| `unjudged` | No inspector's verdict can cover a path it would land. |
| `stalled` | Three merge tool runs ended without moving it. |

On a bounce, a message goes to the run's agent unless it is retired, to the agent's starter, and to the
submitter. It says the reason, the files, the log and what to do next. On a
merge, a bounce or a withdrawal, the agent that holds the secretary card gets one line.

## When the tool stops without moving the entry

A tool run can end without moving its entry: it crashed, somebody stopped it, or it found no result.
The office then asks for the tool again. After three such runs since the entry arrived in its state,
it stops asking:

- An entry before `landing` bounces as `stalled`, with the last run's own words.
- An entry in `landing` stays in `landing` and keeps its lane, because main may already hold part of
  it. The secretary is told that a person must look. Once a person has looked, the person or the
  agent that holds the secretary card can ask again with
  `POST /api/merge-queue/<id>/land-again` and a reason. This works for git entries only.

A run that ends while another entry holds the lane is not counted.

## The doors

| Door | Who may use it |
|---|---|
| `POST /api/merge-queue` | submit an entry: see above |
| `GET /api/merge-queue` | read the queue, lane by lane |
| `GET /api/merge-queue/<id>` | read one entry, what its state means and what it waits on |
| `GET /api/merge-queue/<id>/reads` | read what the suite reads, by main's record, for the main the entry was integrated on |
| `POST /api/merge-queue/<id>/withdraw` | its submitter or the person |
| `POST /api/merge-queue/<id>/confirm-deletes` | the agent that holds the secretary card, or the person |
| `POST /api/merge-queue/<id>/land-again` | the agent that holds the secretary card, or the person |
| `POST /api/merge-queue/<id>/step` | the message worker only, for the merge tool |
| `POST /api/merge-queue/<id>/tool-started` | the message worker only |
| `POST /api/merge-queue/<id>/tool-ended` | the message worker only |

A request to a door is refused with 403 when the caller may not use it, and with 409 when the entry's
state does not allow it. A report from the merge tool whose shape or content is wrong is refused with
422. A refused request writes nothing.
