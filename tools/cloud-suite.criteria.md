# The merge queue's cloud suite door

Before this change, the queue has a caller but no `tools/cloud-suite.mjs`.
Two decisions ask for the rented cloud box
to run the whole suite. This change supplies that door without changing
`tools/merge-tool/cloud-suite-door.mjs`.

1. The real queue caller accepts a stand-in run of the real door. The returned
   Vitest report names absolute paths inside the given clone. The given log
   exists. The given reads directory contains the recorder's output. The final
   JSON line names the given commit, workers, file count, failed files and exit.
2. A missing runner file, a symbolic link, a file not owned by the caller, or
   permissions other than 0600 gives exit 75 and a reason in words. The default
   path comes from `os.homedir()`. The file is parsed as data, never sourced.
3. A process carrying the test mark gives exit 75 before reaching the box unless
   it names both a non-default runner file and a stand-in transport command.
4. The remote script takes a nonblocking flock in the box's home. A held lock
   gives exit 75 with `the cloud box is busy with another suite`.
   Before pushing the commit or making anything on the box, check its host for
   node, docker, git, flock, timeout, tar and sha256sum. A missing program gives
   exit 75 with `the cloud box has no <program> on its host`.
5. Only the commit travels, by git push over the specified SSH options. Local
   commands use argument arrays. No office credential, address, environment
   file or database is sent. The remote clone and artifacts use the exact given
   absolute paths. Existing remote folders are refused rather than removed.
   Cleanup removes `refs/door/<sha>` from the box's checkout after the run,
   whatever the run's outcome.
6. Dependencies are cached by the lockfile's SHA-256 and hard-linked into the
   clone. The development image is cached by the Dockerfile's SHA-256. Build
   and tests run in that image with init, host networking, uid and gid 1000,
   a fresh HOME, and the clone's parent mounted at the same path.
   Read the caller's time zone with
   `Intl.DateTimeFormat().resolvedOptions().timeZone` and pass `-e TZ=<zone>`
   to every run container. An empty or invalid zone gives exit 75 with a reason
   in words before reaching the box; do not choose a replacement zone.
7. The build precedes npm test. Tests use the merge tool's recorder, reporters
   and runner worker count. A failed npm test returns ran:true and its real exit
   code. A failed build returns its build code and log; absent test artifacts
   stay absent. The unchanged queue will reject that incomplete test result.
8. IPv4 and IPv6 addresses in printed output and returned text are masked,
   except tokens made only of colons and dots. In particular, bare `::` stays
   whole so the read recorder's `X <folder> :: <command>` separator survives.
   Real compressed IPv6 addresses, including `2001:db8::1` and `::1`, remain
   masked. Read-record tags, their single spaces and newlines, the root `.`,
   relative-path dots and non-address command punctuation stay whole. The
   configured host is also masked when it is a DNS name. The box's login followed by `@`
   and its target becomes `the cloud box`. Its `/home/<login>` path segment
   becomes `~`. These masks apply to every printed line, every reason, the
   final JSON line, the box's log filter and returned text such as assertion
   messages. A login used as an ordinary word or inside an unrelated test name
   stays whole. The given clone, report, reads and log paths and the report's
   `testResults[].name` stay exactly as given; the login mask never rewrites
   or refuses those caller paths. The box is named only as `the cloud box`.
9. Artifacts return before remote run folders are removed. Caches remain. The
   timeout bounds push, preparation, build, tests and retrieval. Timeout stops
   the recorded process group and container, cleans the run, and gives exit 75
   with `timed out after N s`. A failure to clean up is reported explicitly.
   Docker cleanup uses docker's own exit, accepting `No such container` as
   already removed. Mask its output when node works and drop it otherwise.
   Removing the run folders does not depend on or wait for the mask filter.
10. A door failure returns ran:false and exit 75. Its JSON answer is the last
    line across stdout and stderr. No test contacts the real cloud box.
    Every early box failure emits its own JSON reason, including a cache folder
    that cannot be made, a lock file that cannot be opened, a clone that cannot
    be prepared, a run home that cannot be made and output paths that cannot
    be prepared. A missing JSON result is not a substitute for these reasons.

Each new contract test has a passing control, an intentional mutation that
makes it fail, and a passing restored run. The required mutations change the
report path, bypass runner checks, remove the test guard, ignore flock, exit 0
after a failed suite, remove masking, and remove the timeout. Verification uses
tsc and named tests, including queue tests and the requested gates. The starter
runs the live check before sealing.

Round 3 proves login masking with an SSH failure and a git push failure whose
diagnostics contain a made-up login target and box home. Removing the login
mask makes each test fail. A green stand-in run keeps exact caller paths and
report names and is accepted by the queue's own `aSuiteOnTheBoxOrHere`;
masking paths everywhere makes that test fail. No test uses the real box.

Round 4 returns the real recorder's R, C, L, T, N and X observations of a
made-up suite. Non-sensitive lines match their text before masking byte for
byte; an X line in the same record still masks the box identity. Masking `::`
makes the preservation test fail. Skipping every token containing `::` makes
the compressed IPv6 test fail. Both mutations have a passing control and a
passing restored run.

The optional manifest mode adds evidence to this same door:

11. Without `--manifest`, every existing argument, final JSON field, exit and
    not-run reason stays as above. The unchanged queue still accepts the door.
    With `--manifest <absolute artifact path>`, the path must be normalized,
    distinct from the clone and other artifacts, outside the reads directory,
    and not a parent of any of them. It may be a sibling of report/log outside
    the clone. It travels through remote existence checks, mounts,
    transfer, text validation and cleanup with the other output paths.
12. Manifest mode adds `phase` (`build`, `discovery` or `test`) and the actual
    `buildExitCode` after the build completes; `suiteExitCode` is present only
    after npm test completes. Existing `ran`, `code`, `wallSec`, `workers`,
    `commit`, `files` and `failed` fields keep their meaning. A failed build
    keeps its real exit and log, with phase `build`, no suite exit, no report,
    no reads and no manifest. No discovery runs after a failed build.
13. After a successful build, before npm test, discovery runs
    `node_modules/.bin/vitest list --filesOnly --json <manifest>` with the same
    checkout, development image, mounts, HOME, TZ, configuration and suite
    environment, including the recorder settings and runner worker count.
    Discovery output goes into the suite log. Discovery runs no tests and is
    never counted as a suite result. Its output is a nonempty JSON array of
    `{file: absolutePath, projectName?: string}` entries whose files are
    strictly inside the requested clone. Original absolute file names survive
    return so the producer can compare the report with the expected files.
14. A nonzero discovery command, a missing or empty manifest, invalid JSON or
    entries of the wrong shape or outside the clone gives an explicit
    `ran:false`, exit 75 and a reason in words, with phase `discovery`,
    `buildExitCode:0` and no suite exit. npm test never starts. Invalid or
    partial discovery output is removed; no manifest or test artifacts are
    invented. The suite log is returned, and prior local artifacts cannot fill
    missing evidence.
15. The manifest's caller artifact path and its contained `file` names stay whole, including login
    path segments, as the report's caller paths and names do. Address-bearing
    caller paths or discovered names are refused. All other manifest text,
    including project names, masks addresses, the host and box login. Returned
    text containing an unmasked address or login is refused. Recorder tags,
    punctuation and separators remain protected by criterion 8. Nonblocking
    flock and the existing timeout still bound this mode. There is no local
    fallback.

Focused stand-in tests prove success and a real suite failure, a real build
failure without suite artifacts, discovery refusals, invalid caller paths,
manifest masks and preserved caller paths, returned unmasked text refusal,
remote output checks and cleanup, and unchanged legacy queue acceptance.
Each new test has its passing control, a specific code mutation that turns it
red, and a passing restored run through run-named-tests in the foreground.

The optional runs alone add one more step to manifest mode, for the scheduled
whole suite on main only:

16. `--alone <absolute folder>` is off unless given. The merge queue's call
    path never passes it, and a test spies on the queue's own arguments to
    prove that. It needs `--manifest`. The folder must be absolute, normalized,
    not `/`, and neither inside nor around the clone, the report, the reads,
    the log or the manifest. An unknown or repeated option, an option without
    a value, or a folder whose path holds an address is refused before any
    transport, as every other option is.
17. When npm test exits nonzero, every file the returned report names as not
    passed is run alone. A file passed only when its own status is `passed` and
    every test in it ended `passed`, `skipped` or `todo`, the one rule in
    tools/a-passed-test-file.mjs. The files run one at a time, in the order of
    criterion 26, which is sorted order when no file is carried over, after the
    one build, in the same clone, image, mounts, HOME, TZ and suite
    environment, less the share-a-process switch of criterion 25, which a run
    alone never gets, with the queue's own command for a run alone:
    `npm test -- --no-file-parallelism --reporter=default --reporter=json
    --outputFile.json=<alone>/<n>/report.json <file>`. Only the read record
    moves, to `<alone>/<n>/reads`, and each run's output goes to
    `<alone>/<n>/run.log`. The whole run's report, reads and log are not
    touched by a run alone.
18. At most 50 files run alone. The runs alone end 1800 s after the whole run,
    or earlier when the door's own time limit, less a tenth of it kept for the
    return (at least 10 s and at most 300 s), comes first. A run cut at that
    limit keeps its exit, 124. A file over the count is listed with "the limit
    of 50 files run alone was reached", and a file with no time left with "the
    time limit for runs alone was reached". No file is left out silently.
19. The box writes `<alone>/index.json` as `{files: [...]}`, one entry for each
    red file, `{file, n, code}` for a run or `{file, notRun}` for a file not run.
    The door checks the index against the red files of the returned report and
    puts the same list in its answer as `alone`. A green whole run gives
    `files: []` and `alone: []`. A run alone never changes the whole run's
    `code`, `suiteExitCode`, `failed` or exit.
20. The alone folder travels through the existence checks, mounts, transfer,
    text checks and cleanup with the other outputs. Each run's report keeps its
    file names whole and masks every other text, as the whole run's report
    does. A failed build or discovery runs nothing alone and returns no alone
    folder.
21. While npm test runs the whole suite, the box reads its own 1-minute load
    (the first field of `/proc/loadavg`) and its available memory
    (`MemAvailable` of `/proc/meminfo`) once at the start and then every 15 s,
    outside the container, until npm test ends. The answer gives them as
    `boxLoad`: `{everySec, samples, notRead, load, availableMemoryMb}`, where
    `samples` is how many times both were read, `notRead` how many times they
    could not be, and `load` and `availableMemoryMb` are `{median, worst}`,
    the worst being the highest load and the least memory, in MB. The load is
    given to two decimals and the memory to the whole MB. With no sample they
    are null, and no median is made up. A median of an even count is the mean
    of the two middle samples. tools/the-box-under-the-suite.mjs
    works these out. A failed build or discovery runs no suite and gives no
    `boxLoad`. The merge queue writes them on the suite's "ran on the cloud
    box" line, or says that the door did not give them. A test may pass
    `--box-sampled-every N`, 1 to 15; the queue's door and the periodic suite
    never pass it, so a real run is read every 15 s.

Stand-in tests prove a red-beside-others file run alone and green, a file red
alone, the 50-file limit, the time limit, a green run and a failed build, the
option's refusals, and the queue never passing the option. The mutation named
for this step is the run alone skipped while the index still says it ran with
exit 0: the test of the red-beside-others file goes red.

The startup journals are kept with or without `--manifest`:

22. After npm test ends, and after any runs alone, the box copies what the
    suite left in the clone about its startups into the folder beside the
    suite log, named after it: a log `suite.log` keeps them in
    `suite-startup-journals` in the same folder. That is the merge entry's
    folder for the queue, and the attempt folder for the scheduled suite. The
    box copies every `.logs/setup-waits-<sha256>-<pid>.jsonl`, in sorted order,
    then `dist/server-for-tests-lock/who.txt`, `dist/web-for-tests-lock/who.txt`
    and `dist/web-build-lock/who.txt` when a build lock is still there, which
    is when its holder ended without letting it go. Who took each build lock,
    let it go, waited for it and removed it is in the startup journals.
    One file keeps at most 64 KiB and all of them together
    at most 1 MiB, and tools/cloud-suite-journals.mjs names both bounds. A file
    over a bound keeps its whole lines within it and ends with a JSON line
    `{"cut": words}` that says how many of its bytes were kept and which bound
    cut it. A file found after the bound of all is spent is not copied, and is
    listed with the reason. The box writes `index.json` with both bounds, what
    it looked for, and every file it found with its bytes and what was kept.
    The folder travels through the existence checks, transfer, text checks and
    cleanup with the other outputs, so the box keeps no copy. The clone is
    still removed as before. Before the door puts the journals in place, it
    masks each copied file as every printed line is masked
    (src/config/inspection-ending.mjs): addresses, logins, home folders and the
    value of any name holding KEY, TOKEN, SECRET or PASSWORD. The answer gives
    `journals: {folder, files, cut, notKept}`, counted from the index. A failed
    build or discovery copies nothing and returns no journals folder. A folder
    beside the log that is, holds or lies in another output, or holds the
    clone, is refused before any transport.

A made-up run proves that the journals and a lock's owner line arrive, that a
journal over the bound of one file is cut and says so, that the bound of all
is kept, and that a secret-shaped value, a login and a home folder come out
masked. The mutations named for this step are the local mask skipped, the cut
skipped, and the folder left out of the transfer.

The box hands back the lock of what its install put in node_modules:

23. After the install's node_modules is linked into the clone, and before the
    build, the box takes the sha256 of `node_modules/.package-lock.json`
    there. That is the lock npm writes of what it installed. When the suite
    ran, the answer gives it as `installedLock`, 64 lowercase hex characters.
    It also gives `installedPackages`: the sha256 of the same file without the
    root's own name and version, the part `theInstalledPart` in
    tools/merge-tool/installed-lock.mjs makes, which the box runs as it is
    written there. A bump of the root's version alone then leaves it the same.
    When that part cannot be made, as when the file is not JSON, the answer
    gives `installedPackagesUnread`, the reason, in place of
    `installedPackages`, and the suite's result is kept.
    An install that left no such file gives neither, and the answer is
    accepted as before. A failed build or discovery runs no suite and gives
    neither. The host refuses a result whose `installedLock` or
    `installedPackages` is not 64 lowercase hex characters, or comes with a
    phase other than the test phase, as an invalid suite result, and so is an
    `installedPackagesUnread` that is not a string with words in it, comes
    with another phase, or comes beside `installedPackages`. The merge
    queue keeps both beside the suite run, so a file red on the box and green
    alone in a sandbox is read with the packages each run had. It compares
    the packages only. An answer with `installedPackagesUnread` says the box
    could not hash them, and an answer with neither is from before the box
    gave them, so in both its packages are not compared.

A made-up install proves that the answer gives the sha256 of the lock the
install wrote, that an install with no lock gives none and is accepted, that a
failed build gives none, and that a lock that is not hex, or one beside a
failed build, is refused. The mutations named for this step are the sha256
taken of the clone's package-lock.json instead, the file hashed without looking
whether it is there, the lock given beside a failed build, and the host's check
left out.
A made-up install whose lock has a root name and version proves that the
answer gives `installedPackages`, which a lock read here matches when only
the root's version differs and not when a package does, and that a lock that
is not JSON gives `installedPackagesUnread` and keeps the suite's result. Four
made-up result lines prove that an `installedPackages` that is not hex or
comes beside a failed build, and an `installedPackagesUnread` beside a failed
build or beside `installedPackages`, are refused. The mutations named for
these are the box making no `installedPackages`, the whole file hashed for
it, the host's check of either field left out, the reason not caught, and
the answer dropping the reason.

The suite runs at no more workers than the box has CPUs:

24. Before it makes anything, the box counts its CPUs with `nproc`, on the
    host, outside the container, with `OMP_NUM_THREADS` and
    `OMP_THREAD_LIMIT` taken out of its environment, because `nproc` prints
    either of them when it is set. Discovery and npm test then run at the
    runner file's `RUNNER_WORKERS` or at that many CPUs, whichever is fewer.
    A count that is not a whole number above zero, or an `nproc` that fails,
    runs nothing and gives exit 75 with the reason
    tools/the-box-under-the-suite.mjs names. Every result of a run, a failed
    build or discovery included, gives `cpus`, `workers`, the count used, and
    `runnerWorkers`, the count the runner file names. The host refuses a
    result whose `cpus` is not a whole number above zero, or whose `workers`
    is not the fewer of the two, as an invalid suite result. The merge queue
    writes the CPUs and the load per CPU on the suite's "ran on the cloud
    box" line, or says that the door did not give the CPUs.

A made-up box of fewer CPUs than the runner file names proves that npm test
and discovery run at the CPUs and that the answer says all three counts. A
made-up box of more CPUs proves the runner file's count is kept. A box whose
`nproc` fails, and one whose count is not a number, prove that nothing is
cloned or run. A box whose environment sets either variable to 2 proves that
the box's own count is used. The mutations named for this step are the runner
file's count kept on a smaller box, discovery left at the runner file's count,
the host's check left out, and either variable left in `nproc`'s environment.

The runner's share-a-process switch reaches the whole run:

25. When the door's own process has `MOLE_OFFICE_TEST_FILES_SHARE_A_PROCESS`
    set to exactly `on`, npm test for the whole suite, and discovery with it
    (criterion 13), run with `MOLE_OFFICE_TEST_FILES_SHARE_A_PROCESS=on` in
    their environment. Unset, `off`, `yes` or any other value passes nothing,
    and the script the box gets is byte for byte the script it gets when the
    variable is unset. A run alone (criterion 17) never gets the switch. The
    switch travels in the script's text, never in the transport's environment.
    Every result of a run, a failed build or discovery included, gives
    `filesShareAProcess`, true when the switch was passed and false when it
    was not. The timer keeps the variable in the environment it starts the
    door with, and its receipt's summary says so when the switch was passed.
    `vitest.config.ts` and the switch's own default are not changed.

The stand-in box proves the four values: unset, `on`, `off` and `yes`. Each
case compares the run script with the script of an unset run of the same
commit, with only the run's token and its seconds left taken out, and reads
the environment of discovery, the whole run and each run alone from the
box's own command log. A made-up transport proves that the timer's
environment carries the switch to the script the box gets, and a made-up
answer proves the receipt's sentence. The mutations named for this step are
a value other than `on` taken as on, a run alone given the switch, the whole
run left without it, the answer's field fixed at false, the name left out of
the timer's environment, and the receipt's sentence left out.

Files carried over from the last receipt run alone first:

26. `--carried-over <JSON array>` is off unless given, and needs `--alone`. It
    names the files the last receipt's runs alone left not run, each once, as
    clean paths inside the clone, with no address in them. Anything else is
    refused before any transport, as every other option is. The merge queue's
    call path never passes it. After a red whole run, the red files that are
    named carried over run alone first, in the order they were named. The
    other red files follow in sorted order. A carried-over file that is not red
    this time is not run alone. The limit of 50 files and the time limit of
    criterion 18 count in that order and are not changed. The index of
    criterion 19 lists the files in the order they ran, and the door checks it
    against that order. When the option is given, the answer gives
    `carriedOverFirst`: the red files that were carried over and put first, in
    their order, an empty list when none of them is red again.

A made-up red whole run of more files than the limit, with carried-over files
among the last in sorted order, proves that those files run first and that the
rest keep their sorted order. A carried-over file the whole run passed proves
that it is not run alone. Without the option the order is sorted as before. The
mutations named for this step are the carried-over files not put first, a
carried-over file run alone when it passed the whole run, and the answer
without `carriedOverFirst`.

A whole run that stops moving is ended by the box:

27. While npm test runs the whole suite, the box watches it on the host,
    outside the container. The run moves when the suite log or the report
    grows, or when the processes in the run's container, vitest and its
    workers among them, use CPU time of at least a hundredth of the quiet
    spell since the run last moved. The quiet spell is 2700 s (45 minutes):
    the longest time limit a case of this project's suite has, 40 minutes,
    and 5 minutes more. A test may shorten it with
    `MOLE_OFFICE_CLOUD_QUIET_SPELL_SECONDS`, read only when the door carries
    the test mark and only when it is a whole number below the default. A
    moment when the container's processes cannot be read never counts as
    quiet. After a quiet spell in which the run did not move, the box writes
    down, for each vitest worker, its process id, its kernel wait
    (`/proc/<pid>/wchan`) and the test file the worker is on: when vitest
    starts a test file, the worker reads that file's snapshot file,
    `<folder>/__snapshots__/<name>.snap`; the last such read in the worker's
    record of what it read names the file. When there is none, file is null
    and because says why. It also writes down each process left in the container whose test
    is gone: each child of the container's init other than the run's own
    command, with its process id, command name and kernel wait. Then it ends
    the run by the run's own process group, TERM and then KILL after 10 s,
    and removes the container the run named, as on a timeout. It ends no
    process by name and reads no process outside the run's container. No
    runs alone follow. The answer is `ran:false`, exit 75, a reason that says
    the run hung and names each worker's file and wait, and `hung`:
    `{quietSec, workers: [{pid, wait, file, because?}], leftBehind: [{pid,
    command, wait}]}`. It carries phase `test` and `buildExitCode` 0, which
    are true, because the watch acts only while the whole run's npm test
    runs, and that starts only after a build that exited 0. It carries no
    `suiteExitCode`, because the suite did not end by itself. Its reason is
    not one of the refusals that come before a run either, so neither caller
    takes the run as never started. A run whose CPU time keeps moving is never ended this
    way, however long it takes, and the door's time limit stays the last
    bound. The merge queue takes this answer as any other not-run answer.

A made-up suite whose one test blocks opening a named pipe, run by the real
vitest on the stand-in box with a shortened spell, proves that the run ends
within the spell and one minute more, that the answer names that file and
the wait `wait_for_partner`, and that it carries phase `test`, build exit 0 and
no suite exit. A made-up suite whose one test keeps one core busy
past the spell, and one whose test prints a line every second and uses no CPU,
prove that neither is ended. The mutations named for this step are the CPU
reading taken out, the output reading taken out, and a worker's wait or file
left out of the records.
