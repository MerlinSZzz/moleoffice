# The check of a run, and its confirmation

A run that says its work is finished has not ended. When a run says it is finished, the office seals
what it submitted and asks for a check. The check is made by an inspector, which is an agent holding
the inspector card, or by the starter of the run's agent. A release ends the check, and the work may
then go to the merge queue. The run itself closes only when its supervisor confirms the report.

[the-merge-queue.md](the-merge-queue.md) explains what happens to the work after a release.

## The words

- **Run.** A record of the kind `session`: one run of one agent.
- **Starter.** Whoever started the run's agent. A release reports to the starter, so the starter is the
  supervisor who confirms it.
- **Seal.** A record of the kind `sealed_tip`, written when the run says it is finished. It fixes what
  the run submitted, so that the check and the merge queue read the same thing.
- **Inspector.** The agent that holds the inspector card. Only the person gives that card.
- **Verdict.** `released` or `refused`, written once on the run by `POST /api/checks/<run>`.
- **Review level.** A project setting: `full`, `light` or `none`. Only at `full` does the office start an
  inspector.

## Where the code is

- The seal: `src/server/lib/sealed-tip.ts`, called by the record door when a run's record says it is
  finished.
- Where a run stands, what an inspector reads, the verdict and the confirmation:
  `src/server/lib/inspection.ts` and `src/shared/releasing.ts`.
- The doors: `src/server/api/inspection.ts`.
- The check tool: `tools/the-inspector.mjs`, with its sandbox in `tools/inspector-sandbox.mjs`.

## The stages, in order

### 1. The run says it is finished, and the office seals it

The run's agent, or the message worker when the run's process ends, writes `"state": "finished"` on
the run's record. In the same write, the office writes a seal and links it to the run. A seal can hold
three kinds of work:

- **git:** the repository, the working folder, the fork base, the commit, and every file the run
  changed, each with its sha256 and its mode. A deleted file has neither.
- **files:** files staged in a folder outside git, each with its sha256 and its mode.
- **records:** the revisions of the records the run names as its submission.

The seal holds a hash of its own content, so a changed seal is noticed when it is read. The starter
of the run's agent is sent one message saying what the seal holds. When no single starter can be
named, the seal records why nobody was told.

A run that is said to be finished again is sealed again, on the same fork base, unless it was already
released or confirmed. A write that names a new tip for a released or confirmed run is refused,
because new work goes in under a new run.

The finish is refused when the seal cannot be made, and nothing is written. Two examples: the run's
agent is not registered, or the run declares no submission and its agent has no work area.

### 2. The office asks for the check

When the run's state changes to finished, the office writes `theCheck` on the run. What it does
depends on the project and on who holds which card:

- **Review level `light` or `none`:** the office starts no inspector. It tells the agent that holds
  the secretary card instead. At `light` the secretary answers the run's report, and at `none` the
  secretary confirms the run directly. If nobody holds that card, nobody is told, and the run reads
  as a finish nobody has answered for.
- **The run cannot be checked:** the reason is written on the run, with what to do next.
- **Nobody holds the inspector card:** no check starts. The starter is told, and the run reads as a
  finish nobody released.
- **Otherwise:** the office writes the inspector a message saying it queued the check. The message
  worker then starts the check tool for it.

The setting `MOLE_OFFICE_MESSAGE_WORKER` decides whether a check starts by itself. With `on`, the
server starts the message worker, and the worker starts the check. In `merges-only` mode the worker
starts a check only while the office says checks run in that mode (`GET /api/office/checks-in-merges-only`).
That switch is on for the projects it names. Switched on with no project named, it is on for the project
it was switched on from. A worker of a project it does not name starts no check.
With `off` the server starts no worker. A check can then be run by
hand with the check tool, as an agent that holds the inspector card.

An ask for a check of a run that is already settled starts no check, in either mode. A run is settled
when it was released, superseded, closed unchecked, confirmed, ended with its merge entry or landed by
hand, when it needs no check, or when a refusal was written after the ask. The worker marks the ask
delivered, and the reason beside it names the run, says no check was started, and says how the run was
settled.

### 3. The check tool runs

`node tools/the-inspector.mjs --run <run id> --as <inspector handle> --check <session id>` makes one check
of one run. `--check` names the check's own session record. It must be a record id of 12 characters,
each a letter, a digit, - or _. Any other value stops the check before anything is assembled,
including with `--dry`. The tool sends it on every request, and
the verdict door reads it as the session that posts the verdict. Every check that runs a model needs
it, in the sandbox and on the host. Such a check with no `--check` stops before it asks the office
anything. The check:

1. It asks whether the run can be checked (`GET /api/checks/<run>/eligibility`), and stops if not.
   That door also gives five refusals of the verdict door that do not depend on what the check
   finds: the checker is not registered; it holds neither the inspector card nor the place of
   starter; the run is already released; it names no agent; or its worker is retired and nobody
   recorded the starter. So such a check stops here, before its model runs.
2. It reads what an inspector reads about the run (`GET /api/checks/<run>`): the brief, the chapters
   the brief named, the precedents of those chapters, the report and what the run wrote, and the work
   area the agent registered.
3. It makes its own copy of the work. For a git seal it cuts a worktree at the sealed tip and
   prepares node_modules without building. For a files seal it copies the staged files and checks each
   copy against the seal. A records seal needs neither. In the sandbox it then runs an empty command, `true`, the way it will run the
   model, with no secret and no login. If that command fails, the check stops there and says why,
   because the model's run would fail the same way after it was spent. One cause is a receipt or an
   evidence file of the sandbox's launcher that this tool may not trust, such as one other users can
   write to.
4. It finds the changes. For a git seal it reads them with git, against the fork base the seal
   recorded. For a files seal it reads its copy.
5. It asks the server to assemble the prompt (`POST /api/checks/<run>/prompt`). Every chapter of the
   regulations is in the prompt by its name and what it governs. Only the chapters the brief named
   are written out further.
6. It runs the model in the inspector's sandbox, named `inspector-<handle>`, not on the host. The
   model reads the diff path by path against the recorded decisions and the rules, checks every report
   claim against the code, and proves each added or changed test by breaking its guarded code once or
   twice, running only that test file to see it turn red, and restoring the code within the check's scope.
   It leaves builds, typechecks, the whole suite and lists of tests to the merge queue, builds in its
   sandbox only for a test needing dist/ (tests/source-api.test.ts is the known one), and ends with a
   JSON verdict saying what it read, which mutations it ran and what each showed.
   The tool compares its copy before and after the model ran, and throws away a check whose model
   left the work changed.
7. It posts that verdict to `POST /api/checks/<run>` when the model gave one.

An answer with no verdict is asked once for its verdict in the same session. If the completed second
answer also gives none, the tool writes no verdict and exits 42. When the message worker reads that
ending, the office may file one new ask for a whole check. The new ask uses the ordinary queue,
including the project switch, hourly cap and 5-hour hold. It names the earlier ask and starts a new
session. The old ask is marked delivered and names the new ask.

If that new check also completes both answers with no verdict, the check stays failed and the run
stays inspecting. The office sends the ordinary failure notice and one quiet line to the secretary
naming both sessions. Nothing starts again by itself. Its starter or a person can ask for the check
again through `POST /api/checks/<run>/ask-again`; that explicit ask starts a new chain.

An unfinished check, an answer with no session id, a clock or login-limit stop, a person's stop and
a failed start do not ask for another whole check. Neither does an ask whose run was settled
meanwhile. A tool run by hand only reports its ending; it files no ask itself.

Useful options:

- `--dry` assembles the prompt and says its size. It builds nothing, runs no model and writes no
  verdict. It does
  keep what the assembly measured on the run, through `POST /api/checks/<run>/assembled`. It is the
  only check that may leave out `--check`, and then it sends no session at all.
- `--only <path…>` makes a scoped check that judges only the named paths. The merge queue asks for
  such a check when a rebase changed some files.
- `--needs-judgment <file>` hands the model the paths a checker tool could not decide. A path on the
  list that the sealed change does not touch is dropped. The prompt says so in one line, and the run
  keeps the list as asked and the list as used. A list left with no path is refused.
- `--on-the-host` runs the model on the host instead of in the sandbox. Without it, a
  check that cannot have its sandbox fails and says why. Nothing falls back to the host by itself.

Before a check runs anything in the sandbox, the tool brings the sandbox's own clone up to main. It
does that only when the clone is clean and main descends from it. Otherwise the check stops with a
sentence saying why.

The model in the sandbox signs in with a login token from the host's secrets file when that file sets
one. Otherwise it gets a copy of the host's login without its refresh token, and the check is refused
before it starts when that login would expire before the check's time limit.

### 4. The verdict is written

`POST /api/checks/<run>` with `{"verdict": "released" | "refused", "check": …}`.

The door refuses the verdict, and writes nothing, when:

- the `x-mole-office-session` header does not hold a record id (400). This is decided before the body
  is read. A header that names no record is taken, and no session is looked up by its title;
- the session that header names was stopped, or has ended, before the verdict came (409);
- the caller holds neither the inspector card nor the place of starter of the run's agent;
- the caller is the starter and the verdict is a refusal (only an inspector may refuse);
- the verdict does not name the run's current seal, its hash and, for git, its tip;
- the run was already released (a run is released once);
- the inspector changed a record the run wrote;
- it is a refusal that names nothing missing, or no chapter, precedent or invariant that says so;
- it releases a files seal without a line of the model's own for each path it was handed to judge.

The door also asks some callers to prove who they are with a key. `refuseAnActWithNoKey` in
`src/server/lib/keyheader.ts` says which.

**On a release:** the run's agent is told it is released and what was checked. The starter is told
the result, that a check released it, and that the run closes when the starter confirms. The starter
is not sent the check itself. If the run's agent is retired, its starter gets the agent's message.

**On a refusal:** a group opens holding the run's agent, its starter and the inspector. The agent is
told what is missing and what says so. The starter is told only that a refusal happened. The refusal
stands while the group talks. A check-again run that the merge queue filed opens no group, because
nobody works in it.

After either verdict, the merge queue is told. Each entry that waits on a verdict of this run is
moved by it, or stays where it is and says why.

### 5. After a refusal

The run's agent fixes what is missing and says its work is finished again. That seals the run again
on the same fork base. A fresh check is asked for in one of two ways:

- If the run's state had changed away from finished and then back, the office asks for a fresh check
  itself.
- If the run's state still said finished, writing it again seals the run but asks for no check. The
  starter asks for one with `POST /api/checks/<run>/ask-again`.

When the office asks for that check, it marks the refusal as answered, and the run reads as being
checked again. A refusal also ends when somebody releases the run.

### 6. After a release: the confirmation

A release settles the check and does not end the run. The run stays live, and its worktree is kept,
until its supervisor confirms the report with `POST /api/checks/<run>/confirm` and a reason in
`because`.

- At review level `full` the run must have been released first.
- The seal is read again. If the tip moved after the seal, or a sealed file changed, the door refuses
  with 409. When the run's worktree no longer exists, and the project has exactly one registered
  repository, the seal is read from its commit in that repository.
- Only the supervisor the release reported to, or the person, may confirm. When no release names a
  supervisor, any registered participant may, and the reply says so.
- The confirmation tells the run's agent that its run is closed and that what it held may be let go.
  If the agent is retired, its starter is told instead.

The confirm door does not ask whether the work has landed. Whoever confirms decides when to do it.

## Other ways a run closes

- **Superseded:** `POST /api/checks/<run>/superseded` with `{"by": "<later run>", "because": …}`. A
  later run overtook this one. On the same branch, the later run must have been released and
  confirmed. On another branch it must also have been released by an inspector and merged, and git
  must find each of this run's commits in it. The run's starter, the agent that holds the secretary
  card, or the person may ask, with a key. The door's own description gives every condition.
- **Landed by hand:** `POST /api/checks/<run>/landed-by-hand` records that a released and confirmed
  run's content reached main outside the merge queue. Only the person or the agent that holds the
  secretary card may do it.
- **Closed unchecked:** `POST /api/checks/<run>/closed-unchecked`. The secretary or the person closes
  a run without a check, with the reason recorded.

## Where a run stands

A run's standing is never stored. It is read off the acts above, by `howARunStands` in
`src/shared/releasing.ts`. The panel about the check on the run's page shows it by these words, in
English:

| Standing | Shown as | What it means |
|---|---|---|
| `working` | Still working | The run has not said its work is finished. |
| `inspecting` | Being checked | The run said it is finished and the office is having it checked. |
| `rebuttal` | Refused, under discussion | A check refused it, and the refusal has not been answered. |
| `reporting` | Waiting for its report to be confirmed | A check released it. It closes when the report is confirmed. |
| `closed` | Closed | The report was confirmed. |
| `superseded` | Superseded | A later run finished the work this run was for. |
| `closed unchecked` | Closed unchecked | It was closed without a check, with the reason recorded. |

When the office recorded review level `light` or `none` as it asked for the check, `inspecting` is
shown as "Waiting for the secretary" and `closed` as "Closed, not checked".

`GET /api/checks` lists the runs that said they were finished and that nobody released.

## The doors

| Door | What it does |
|---|---|
| `GET /api/checks` | the finished runs nobody released |
| `GET /api/checks/<run>` | what an inspector reads about one run, and where it stands |
| `GET /api/checks/<run>/eligibility` | whether the run can be checked |
| `GET /api/checks/<run>/how-it-would-settle` | how an owed run would be settled as overtaken by a later merged run; a secretary or the person, with a key; writes nothing |
| `GET /api/checks/legacy-unsealed` | the runs in this project that finished before sealed submissions existed; their records are listed, not rewritten |
| `GET /api/checks/owed?agent=<agent>` | every check or report one agent still owes, across projects; a secretary or the person, with a key |
| `POST /api/checks/<run>/prompt` | assemble the prompt; writes nothing |
| `POST /api/checks/<run>/assembled` | keep what one assembly measured on the run |
| `POST /api/checks/<run>` | the verdict: release or refuse |
| `POST /api/checks/<run>/ask-again` | the run's starter, or the person, asks for the check again |
| `POST /api/checks/<run>/confirm` | the supervisor confirms the report, which closes the run |
| `POST /api/checks/<run>/superseded` | close the run as overtaken by a later run |
| `POST /api/checks/<run>/landed-by-hand` | record that the run's content reached main by hand |
| `POST /api/checks/<run>/closed-unchecked` | close the run without a check |
| `POST /api/checks/<run>/tool-started` and `tool-ended` | the message worker records a check tool's start and end |
