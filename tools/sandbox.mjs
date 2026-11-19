#!/usr/bin/env node
// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * START, USE, READ AND STOP ONE SANDBOX: a container made from a template under `sandboxes/`.
 *
 * A sandbox is where agents work without the owner's home or the live database in reach (sandbox
 * v1, piece P2; the template is piece P1). It is not a world: there is no database and no office
 * inside it. Everything a sandbox writes on the host is in its own instance folder,
 * `~/.cache/mole-office/sandboxes/<instance>/`, which is mounted read-write at the same path. The
 * checkout it was made from is mounted read-only, and extra folders only read-only.
 *
 * Before worker, round and exec --agent start a run, the host reads the commit main is at in the
 * checkout the sandbox was made from, fetches that commit by its hash and path with a 30-second
 * limit, and creates or fast-forwards local main to it. It never fetches the clone's origin, whose
 * address a run can rewrite. A checked-out main moves only with a clean working tree. Divergence,
 * changes or a failed fetch leave main alone and print one line; the run still starts. A successful
 * move is recorded in launch.txt and printed only with --verbose.
 * Plain exec and up do not perform this refresh.
 * A fresh repair imports its exact cut without advancing main or the mirror. Its new worktree compares that cut's
 * lockfile with the marked package copy its node_modules resolves to, refreshing only the new worktree when needed.
 *
 * NOTHING IN A SANDBOX POINTS INTO THE CHECKOUT IT WAS MADE FROM (item 2f). repo/ is a clone of a bare mirror of that
 * checkout's main, outside every instance folder (theMainMirrorOf in tools/sandbox-common.mjs). The mirror is repo/'s
 * origin, the container is given it read-only, and repo/ borrows no objects from anything. repo/'s node_modules is its
 * own: npm ci installs it inside the container from repo/'s own package-lock.json into node-modules/<lockfile hash>/ in
 * the instance folder, and repo/node_modules links there. At up, and before worker, round and exec --agent start a
 * run, the host brings the mirror forward to the checkout's main and looks for what is not so yet (ownPackagesAndOrigin):
 * an origin that is not the mirror, objects borrowed from the checkout, a lockfile with no install, a worktree whose
 * node_modules links into the checkout. Only then does it run one script in the container that sets each right. A part
 * that fails is said, and the run still starts. A sandbox with no network installs nothing.
 *
 * THE SEVEN COMMANDS
 *
 *   node tools/sandbox.mjs up <template> --name <instance> [--ro <host folder>]... [--ref <branch>] [--network none|bridge|host] [--no-gpu]
 *       Makes the instance folder (a clone of the mirror of the checkout's main in repo/, home/, logs/, out/,
 *       worktrees/, briefs/, and dsh's profiles), REGISTERS THE CONTAINER in the resources ledger
 *       against your session, and only then starts it with the devcontainer CLI. The container's
 *       name is decided beforehand (`mole-office-sandbox-<instance>`), which is what lets the row be
 *       written first. It then checks with `docker inspect` that each --ro folder really is
 *       read-only. Prints the container id, the ledger row and the folder. A template that mounts
 *       anything back inside a folder it covers with a tmpfs is refused before anything is written.
 *       So is one with a bind that is not read-only and is the gate-count spool, is inside it or holds it
 *       (theSpoolWritableThrough), and a container docker made so is stopped and removed.
 *       So is a --from or --ro that is the stable office's checkout (theStableCheckoutFolder), is inside it or holds
 *       it, and a check view mount of the same kind: that checkout serves the live database and holds its keys.
 *       --network gives the container that network in place of the template's (acceptance finding
 *       77): `none` leaves it only its own loopback, which is all a test suite needs. Without it the
 *       template's own setting stands.
 *       --no-gpu brings a GPU template's container up without the GPU: every --gpus run argument is taken out of this
 *       instance's copy and nothing else is changed, so it needs no GPU overlap reminder.
 *       instance.json records it in its "gpu" field, and the last line says it. On a template that asks for no
 *       GPU it changes nothing and says so. Any other command given --no-gpu refuses before anything runs.
 *       A TEMPLATE'S OTHER CLONES (sandbox.json "clones", each { name, from }) are cloned in full into <instance>/<name>,
 *       beside repo/, and written on the instance with the branch each source had checked out. An agent's worktree is cut
 *       from one of them with --clone <name> (exec --agent, worker, and the helper inside), from that branch unless
 *       --cut-from says otherwise. The ai-news studio's news-tools is the first (sandboxes/ai-news-studio).
 *
 *   node tools/sandbox.mjs exec <instance> --agent <handle> --runtime <word> --model <m> [--brief <file>] [--starts-runs] ...
 *   node tools/sandbox.mjs exec <instance> [--run <id>] [--slot <pool>] [--secret <NAME>]... -- <command...>
 *   node tools/sandbox.mjs exec <instance> --agent <handle> --runtime <word> [--parent <run> | --asked-by <run>] -- <command...>
 *   node tools/sandbox.mjs exec <instance> --wait [--timeout <s>] [--plain-env | --no-office-variables] [--cwd <dir>] [--secret <NAME>]... -- <command...>
 *       Runs tools/sandbox-start.mjs inside the container with `docker exec`. A Codex worker's model
 *       commands exclude MOLE_AGENT_KEY; --starts-runs keeps it for a run that starts runs
 *       That helper starts the
 *       command as the leader of its own process group, registers it in the ledger by its pid inside
 *       the container, and prints where it is running. An agent's run (--agent) is filed HERE, on the
 *       host, before the helper starts it (see "a run's own key" below); with --run the helper writes
 *       the sandbox field of a run already filed. Secrets go in through an env file of mode 0600 that
 *       is written for this one command in a folder the sandbox cannot see, and deleted when docker
 *       has read it; never on a command line. A brief outside the instance folder is copied into
 *       briefs/. Nothing is started in a container that has something mounted inside a folder it
 *       covers: one started before the office's key file left the template (finding 13) must go down
 *       and up again. Nor is anything started in one that can write the gate-count spool. No key of the person, of the office, or of the caller (MOLE_AGENT_KEY) goes in
 *       by any road. For an agent's run, a worker or a round, the env file carries only the model
 *       providers' keys its runtime reads, by the template's readBy,
 *       and, for a run that has one, that run's own key, and nothing else.
 *       WITH --secret <NAME>, repeated for each name, a plain command gets only those declared secrets
 *       that the host file sets. Without it, no secret goes in, with or without --wait. A plain
 *       command has full permissions and the internet, so a poisoned file could send out any login
 *       it holds: an earlier decision and message, and
 *       the problem that followed.
 *       An undeclared name is refused and the refusal lists the declared names. --secret is refused
 *       with --plain-env, an agent's run or --isolated: those forms already decide which secrets go in.
 *       WITH --parent <run>, exec --agent files the run under that supervisor run, while --session
 *       still attributes the request to the filer. Without it the parent is --session. Refused when
 *       no run is filed.
 *       Which parents a caller may name is still to be governed; that rule is not built here.
 *
 *       A RUN'S OWN KEY (P83 point 5; acceptance finding 79, block f-79). An
 *       agent's run is filed here with the caller's own key, through fileARun in tools/file-a-run.mjs,
 *       the launcher's one filing function, with the run's sandbox field in the create. When that key
 *       proves the served agent's registered starter, the office answers a key of the agent for this
 *       run; a worker with no key of its own also needs --asked-by naming a live run of that starter and --brief. The office
 *       checks every host filing before its worktree is made, and revokes its key in the same write that ends the run
 *       (wave 13m's answer). It
 *       goes into the container only as SANDBOX_RUN_KEY in the env file of that one docker exec, and
 *       the helper is given `--filed <run id>`: its calls about the run then go as the run, and the
 *       command holds the key as MOLE_AGENT_KEY. A run filed here that the helper does not start is
 *       marked never started. A sandbox whose helper is from before --filed files the run itself,
 *       with no key, as before, and this says so. The launcher side of P83 point 5 in the
 *       keys-wave brief.
 *
 *       WITH --wait AND --plain-env (a build or a suite), THE PROCESS ROW IS WRITTEN FROM HERE, on the host, with the
 *       caller's key, and the helper inside never speaks to the office (acceptance finding 77): it writes the gate's pid
 *       into a handshake folder in the instance folder, and starts the command only once this process has written the
 *       row's id beside it. This process closes the row when the command ends, on every path it can see: an exit, the
 *       helper's own limit, and a SIGTERM, SIGINT or SIGHUP to this process. A --slot seat is held by this process's own
 *       group for as long as it waits. So a container with no network can run a build or a suite. A sandbox whose clone
 *       holds a helper from before this is run as before, and says so.
 *
 *       AND SO IS THE ROW OF EVERY OTHER COMMAND A CALLER RUNS AS ITS OWN, waited for or not.
 *       The owner closed the key window on 27 September 2026, and from then on the office refuses every write with no
 *       key; the helper inside holds none for a command that is no run, so the row it filed for itself was refused and
 *       the inspector's check stopped at its first command. For a command that does not wait, this process writes the
 *       row while the docker exec runs, and closes it with the caller's key if the command never goes. A command that
 *       holds a seat and does not wait keeps the helper's seat and its row. A run files its own row with its own key.
 *
 *       WITH --wait (the caller's own command only), exec returns when the command ends, not when it
 *       starts: the command's output comes out here as it is written, and exec exits with the
 *       command's own code. --timeout <s> is enforced by the helper inside the container, so the
 *       limit holds even if this process is killed. A SIGTERM, SIGINT or SIGHUP sent to this process
 *       goes on to the command's whole group, by the host group the ledger stored for it.
 *       WITH --plain-env, the command gets the container's own environment and nothing of the
 *       launcher's, and no env file is written: no provider key goes in. This is how the merge tool
 *       runs a submitted tree's build and test suite (acceptance findings 17 and 18).
 *       WITH --no-office-variables, the command gets its secrets and everything else an ordinary
 *       command gets, except the office's own address and identity (MOLE_OFFICE_API, PORT,
 *       WORKSPACE, SESSION and AGENT) and the git identity given to an agent. The helper takes
 *       them out itself, because it needs the office's address to write the command down. It is for
 *       the model of a check, which needs its login and runs tests that must not reach the live office
 *       (acceptance finding 44).
 *
 *   node tools/sandbox.mjs exec <instance> --isolated --runtime <word> --run <id> --cwd <dir> -- <command...>
 *       Runs one filed, running run's command in a fresh container of the sandbox's image and mounts,
 *       on docker's bridge network. Its first program, tools/isolated-gate.mjs, cuts every road to this
 *       machine, the tailnet, the LAN and the container's own link before the command starts as
 *       1000:1000 with no capability, in a home of its own; OpenCode gets its permission file there. The internet stays. Only the model
 *       logins the runtime reads go in, with the git identity an ordinary run gets, and no office variable or key. This
 *       process files and closes the run's rows and writes its end. For the source-only runs of T6 (decision
 *       that they stay source-only); see commandExecIsolated.
 *
 *   node tools/sandbox.mjs worker <instance> --agent <handle> --brief <file> [--model <m>] [--runtime claude-code|codex|dsh|opencode] [--clone <name>] [--parent <run> | --asked-by <run>] [--with-path <path>]... [--image <path>]...
 *       Starts one worker, in one command. Claude Code is the default runtime. It refuses a handle that is not a registered agent (and names
 *       tools/register-a-started-agent.mjs, which registers one), a sandbox with no Claude Code login, and an agent
 *       that still has a process running in this sandbox. Its worktree is <instance>/worktrees/<handle>, made when it
 *       is missing, from the clone --clone names when one is named; its brief is copied into briefs/; its command is `claude -p --model <m> --permission-mode
 *       bypassPermissions < <brief>`. Without --model the office is asked which model the agent gets (criterion U2), and
 *       the answer is named on the command line. Its run is filed as exec --agent
 *       files one, and the command gets the run's own agent and session, never the caller's.
 *       WITH --parent <run>, the run is filed under that supervisor run, as exec --agent --parent files one, and the
 *       worker's end tells that run. The message worker starts a worker run a supervisor asked for this way (wave 13j
 *       round loop-3, src/server/lib/worker-runs.ts); round takes no --parent.
 *       A WORKER'S WORKTREE MAY LEAVE OUT PATHS (src/config/a-workers-left-out-paths.mjs). The template's sandbox.json
 *       may list them under aWorkersWorktreeLeavesOut, read at each start where the template's secrets are read. A new
 *       worktree of an agent the office reads as a worker is then a sparse checkout, git's own, without them; any other
 *       agent's worktree is whole. WITH --with-path <path>, once for each, a left-out path is checked out all the same,
 *       in a new worktree or in one an earlier run left sparse. A path the template does not leave out is refused, and
 *       so is one that is not plain. exec --agent takes it too; round takes none. The start's words say the worktree's
 *       size after the start, and the helper's own worktrees, for runs started inside, stay whole.
 *       WITH --image <path>, once for each, and only with --runtime codex, codex exec is given that file of the worker's
 *       worktree as -i <path>. Each must be a plain path to a file of the worktree (src/config/a-workers-images.mjs),
 *       checked once the worktree is made and before the run is filed, because codex exec does not refuse an image it
 *       cannot read. Any other runtime, and exec and round, are refused it.
 *
 *       With --runtime codex it requires home/.codex/auth.json from a device-code login and an openai/<model> model.
 *       It runs `codex exec --json -m <model> -- -`, and the last word, -, makes Codex read its prompt from its
 *       standard input.
 *       HOW THE BRIEF REACHES THE PROGRAM: the launcher passes the helper --stdin <brief file>, and the helper makes that
 *       file the command's standard input. No word of the command holds the brief, because any process listing shows a
 *       command's words. Claude Code and Codex read the brief there, and OpenCode, which is given no message word, reads
 *       it there too. With a helper from before --stdin, Claude Code starts through sh -c with the brief on its standard
 *       input, and a Codex or OpenCode start is refused before anything is filed. DSH reads its brief by its path.
 *       The helper gives the direct Codex command its full permissions and office tool.
 *
 *   node tools/sandbox.mjs round <instance> --agent <handle> --brief <file> [--model <m>] [--runtime claude-code|codex|dsh|opencode] [--continues <run>] [--worktree <new dir> --cut-from <commit or branch>]
 *       Starts the next round of a worker. Without --continues it finds the agent's most recent run on that runtime
 *       in this sandbox on the host's own list of the runs it filed there (theHostsList), never from a start.json under
 *       logs/, which a program in the sandbox can write. With --continues it takes the run named, which may be one the
 *       list does not hold: a run filed before the list was kept, or started from inside, as the first run of a line
 *       is. Either way the run's record must say the agent, the runtime, this sandbox's folder and its container row,
 *       or an older, released row of this sandbox's own container, from before it was made again. It refuses while any
 *       process of the agent, or of the run it continues, is still alive, naming the run and the process. It uses the
 *       same worktree and the same model (unless --model says otherwise), runs `claude -p --continue ...`, and files a
 *       new run with a derived_from link to the run it continues.
 *       Without --continues, when the agent has no start on the runtime, or its last run there works in a worktree that
 *       is gone or holds no src/config/rules/CODE.md, it starts a new conversation instead, and says why. With
 *       --continues, which the next-round door always passes, it does the same when the run named ran on another runtime
 *       or works in such a worktree. It works in the worktree of the run named when only its runtime differs; otherwise
 *       in the worktree of the agent's newest started run, on any runtime, whose worktree is there and holds that file.
 *       It takes that run's title and cut. With no such run it is refused and names a worker. Its run is linked to the
 *       run --continues names, which it follows, since the door's check refuses a round's run without that link; and to
 *       no run without --continues. Its model is --model, a selection, the model of the run it would have continued
 *       when that ran on the runtime, or the office's.
 *       With --worktree and --cut-from together, it starts a fresh repair in a new directory at the commit --cut-from
 *       names: a commit, in full or shortened, or a branch, which git reads in the checkout the sandbox was made from
 *       (theCommitARepairIsCutFrom). It says which commit it took, and goes on with that commit, proved on the source
 *       main and recorded as the run's cut. It imports only that commit into a separate ref, leaving the old checkout
 *       and its HEAD branch alone, and starts a new conversation, which continues no run and is linked as any new
 *       conversation is. It refuses an existing directory or an unproved cut.
 *       With --runtime codex it reads thread.started from that run's own output, logs/<run>/out by its real path, and
 *       runs `codex exec --json resume <thread id> -m <model> -- -` when this sandbox's own Codex home holds the
 *       thread, with the brief on its standard input as a worker's is.
 *       OpenCode uses run --format json with an explicit --session read from the selected prior run's own events, when
 *       this sandbox's own OpenCode database holds that session, asked inside the container.
 *       DSH reads its brief by path and starts a fresh native session; Office ancestry is not native resume.
 *       Without --runtime both commands use Claude Code.
 *
 *       worker and round give claude its own name for the model: anthropic/claude-opus-5-5, the form exec --agent
 *       records, goes to claude as claude-opus-5-5, and a model another provider names is refused before anything is
 *       started.
 *
 *       exec --agent, worker and round take --flow <flow id>: the run names the flow it follows, and the flow run the
 *       office files beside it names that flow and its revision. Without --flow the run is filed as before; nothing
 *       refuses it.
 *
 *       exec --agent, worker and round file their run in one way (anAgentsRunFiledHere, through fileARun in
 *       tools/file-a-run.mjs, the one filing function, which the helper also calls for a run an agent in the sandbox
 *       starts); every command starts through one path (startThroughTheHelper).
 *
 *       A HAND START WAITS WHILE THE OFFICE RESTARTS. The hand-run check, and for worker and round the check that the
 *       handle is a registered agent, are asked again while the connection is refused or the dev supervisor's stand-in
 *       answers that no server is running: every two seconds, for at most 180 seconds. A start that still cannot reach
 *       the office after the wait refuses, and says what failed and how long it asked again for. The process rows'
 *       registration waits in the same way. A test may shorten the wait with SANDBOX_HAND_START_WAIT_MS; nothing may
 *       lengthen it.
 *
 *       Once its command has started, worker and round each write one use line on the caller's run, with the slug
 *       sandbox (writeAUseLine in tools/use-line.mjs): which agent, which run was filed, and which run it continues.
 *       What the office answered is said on stderr. A line that is not written does not change the exit code.
 *
 *   node tools/sandbox.mjs status [<instance>] [--json]
 *       Reads only: the container as docker sees it, its ledger row, every process started through
 *       sandbox-start with its host pid, group, working directory and liveness, and any process in
 *       the container that no live ledger row names by its group. Exits 1 when the host refused a
 *       sandbox's facts because it could not check them; a folder that holds no instance.json still
 *       exits 0.
 *
 *   node tools/sandbox.mjs down <instance> [--force]
 *       Stops the container THROUGH THE LEDGER'S RELEASE DOOR, which runs `docker stop`: that door
 *       is the one way a registered thing is stopped, so this tool has no stop of its own. It then
 *       removes the stopped container by its exact id, and closes the rows of processes that were
 *       inside it and are gone now. The instance folder is kept: deleting it is the secretary's
 *       decision (R5). A sandbox another session registered is stopped only with --force, which
 *       the ledger's change log records.
 *
 *   node tools/sandbox.mjs hand-over <instance> --to-session <run> [--json]
 *       Gives the sandbox's container row to another run that is still running, and leaves the container as it is.
 *       Only the session holding the open row may hand it over. The new row is registered first, under the run named;
 *       the facts then name it, and the old row is closed with nothing signalled. The inspector's shared sandbox uses
 *       it: the check that started the sandbox may leave while others still use it, and its run then holds nothing.
 *
 *   node tools/sandbox.mjs clear <instance> [--force] [--json]
 *       Brings a labelled merge sandbox down and removes only the trees the merge tool can make
 *       again (theReCreatableMergeParts: repo/, work/clone, work/pair, work/main, work/bus-<n>,
 *       work/without, work/second). Keeps the reports and all other files. A cleared folder cannot
 *       be started again. A second clear removes what an older clear left, and keeps the first
 *       clearing's time.
 *
 * OPTIONS FOR EVERY COMMAND
 *   --as <handle>        who is asking. Default MOLE_OFFICE_AGENT. This never writes in the person's name.
 *   --session <id>       the session asking, which owns the container row. Default MOLE_OFFICE_SESSION.
 *   --workspace <w>      the project. Default: the one this checkout is set to.
 *   --api <url>          which office. Default: the one this checkout is set to.
 *   --sandboxes <dir>    where instance folders are. Default ~/.cache/mole-office/sandboxes.
 *   --json               print one JSON object instead of lines.
 *   --verbose            exec, worker and round also print launch explanations kept in launch.txt.
 * And for `up` only:
 *   --from <checkout>    the checkout the sandbox is made from. Default: the main checkout of the
 *                        repository this tool is in (a worktree's main checkout, not the worktree).
 *   --ref <branch>       the branch the clone is on. Default: the branch --from has checked out.
 *   --dsh <dir>          the dsh folder whose profiles are copied in: not its env file, and nothing else of its home.
 *                        Default ~/.cache/mole-office/dsh.
 *   --label <key=value>  one more docker label on the container and its image. Repeatable.
 *   --no-dsh             copy no dsh folder into the instance. The merge tool's sandboxes run no agent,
 *                        so they get no dsh folder either.
 *   --no-gpu             leave out the GPU a template's runArgs ask for (--gpus), for work that needs no CUDA.
 *
 * HEAVY WORK TAKES A SEAT. `exec … --slot full-suite -- npm test` (or browser-tests) makes the
 * helper wait for a seat from the office before the command runs; tools/slot.mjs is how.
 *
 * DISK ADMISSION (decision, item 4). Before anything is filed or seated,
 * a caller's build or test command (--wait --plain-env, --slot, or the check's --no-office-variables) needs 85 GB free
 * on the sandboxes' filesystem: the 80 GB floor plus a run's own peak of 5 GB (SANDBOX_DISK_FLOOR and SANDBOX_RUN_PEAK in
 * tools/sandbox-common.mjs). Unknown space refuses, with exit 75. Agent runs, workers, rounds and up are exempt.
 * MEMORY ADMISSION: the same builds and tests, and every up, refuse with exit 75 while the memory the
 * machine has available (free -b) is under what the container may still take under its limit plus 8 GiB
 * (noRoomInMemory in tools/sandbox-common.mjs). An unknown figure refuses too. Agent runs, workers and rounds are exempt.
 * GPU OVERLAP (a reminder, never a refusal): a GPU template's up, and every command in a GPU container, remind
 * the caller which other labelled sandboxes have a GPU and their current bookings. The start continues even when the
 * overlap cannot be checked. An up with --no-gpu needs no reminder. Only docker's device requests are read here.
 * `sizes [--tell] [--json]` measures every instance with bounded du calls, largest first. --tell files one message to
 * the agents MOLE_OFFICE_SANDBOX_DISK_WATCHERS names per crossing above 60 GB, and saves its warning state whole in
 * <sandboxes>/.sizes.json. With no agent named it tells nobody, says so, leaves that folder's warning for a later run, and
 * exits 1 once the state is saved, so the host's timer shows a failed run. A run with no crossing exits 0.
 *
 * WHAT IT NEVER DOES: delete anything except its transient env files and clear's clone parts, stop a container except
 * through the ledger, remove a container that is still running, or pass a secret on a command line.
 */

import { spawn, spawnSync } from 'node:child_process'
import { appendFileSync, chmodSync, constants as fsConstants, copyFileSync, cpSync, existsSync, fstatSync, lstatSync, rmSync, mkdirSync, mkdtempSync, openSync, readFileSync, readSync, readdirSync, readlinkSync, realpathSync, renameSync, statSync, unlinkSync, writeFileSync, closeSync } from 'node:fs'
import { constants as osConstants, homedir, hostname, networkInterfaces, tmpdir } from 'node:os'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { createHash, randomBytes } from 'node:crypto'
import { THE_COMPACTION_VARIABLE, theCompactionWindowHere } from '../src/config/the-compaction-window.mjs'
import { ENV_FILE, REPO_ROOT, readSettingHere, sandboxDiskWatchers, settingNamed, settingValue, transientToolContext, sandboxFolderMeasurementMilliseconds } from '../src/config/settings.mjs'
import { THE_API_KEY_NAMES, THE_ROUTER_SETTING, theProviderRouterIsOn, theRouterMustCarry, THE_ROUTER_FOLDER_INSIDE } from '../src/config/provider-router.mjs'
import { aCodexRunHasNoKeyThroughTheRouter, aRouterFolderFor, theRoutedKeysLeftOut, theRouterLinesForARun, theRunSaysWhyItIsOnDsh, theStartWhenEveryGoSlotIsUsedUp, whetherTheRouterIsDown, whyARoutedRunCannotStart } from './provider-router-host.mjs'
import { THE_LOGIN_FILES_OF_A_SANDBOX, theLoginFilesOfACheckHome, whyAStartIsRefusedForTheLoginFiles } from './key-router/login-files.mjs'
import { theWordsNamingTheFolder } from '../src/config/sandbox-folder.mjs'
import { THE_PROVIDER_A_RUNTIME_RUNS } from '../src/config/runtime-native-providers.mjs'
import { THE_LEDGER_COUNTS_A_SESSION_OVER_IN } from '../src/config/the-ledgers-ended-states.mjs'
import { clockStamp, fileNameStamp, localStamp, momentOfAnInstant, parseAnyStamp } from '../src/shared/time.ts'
import { whereIsTheApi, whichWorkspace } from './where-is-the-api.mjs'
import { whyAPathIsTheOfficesDataFolder } from './the-offices-data-folder.mjs'
import { A_RUN_GIVEN_NO_TITLE, A_RUN_IS_OVER_IN, CHECK_VIEW_LABEL, HOST_ONLY_FOLDER, ID_LABEL, INSTANCE_FILE, aRunWithNoTitleARoundCanTakeWords, askTheOffice, askTheOfficeWhileItRestarts, BETWEEN_LEDGER_TRIES_MS, leftOut, officeHeaders, readHostInstance, THE_FACTS_VARIABLE, theFactsAStartIsGiven, readInstance, readCheckView, theHostOnlyFolder, theAgentKey, theAgentsOwnWorktree, theAgentsWorktree, theWorktreesBranchAfterFiling, theDshHandoffIsCurrent, theCloneNamed, theModelLine, theModelRefusal, theModelTheOfficeGives, theOfficeSaid, theSandboxField, theMainMirrorOf, THE_LONGEST_WAIT_FOR_THE_LEDGER_MS, stillThere, theChecksMarker, whyAPathIsTheStableCheckout, whyARunMayNotWorkIn, writeHostInstance, writeInstance, writeWhole } from './sandbox-common.mjs'
import { fileARun } from './file-a-run.mjs'
import { A_ROUNDS_RULES, prepareRoundChapters, saveRoundChapters, theBriefWithTheStandingStages, theSameWorkArea, theWorkAreaDeclaredFor } from '../src/shared/round-chapters/delivery.ts'
import { THE_MESSAGE_WORKER_ID } from '../src/shared/the-message-worker-id.ts'
import { readTheRoundsBacklog } from '../src/shared/round-chapters/backlog.ts'
import { readTheRoundsDelegations } from '../src/shared/round-start-delegations.ts'
import { roundChaptersList, standingStagesLine } from '../src/shared/round-chapters/manifest.ts'
import { readTheStandingStages, theStandingStagesWereRead } from '../src/shared/round-chapters/standing.ts'
import { theRecordedBaseOfRun } from '../src/shared/next-round.ts'
import { A_CUT_FROM_MAY_NOT_START_WITH_A_DASH } from '../src/shared/kind-fields/session-wave-13n.ts'
import { A_FAST_FORWARD_INSIDE_MS, bringTheMainMirrorForward, fastForwardInside, guardedGitRun, outsideTheCommitInLines, theAddressGitWouldFetch } from './sandbox-git.mjs'
import { writeAUseLine } from './use-line.mjs'
import { CLAUDE_CODE_LOGINS, aClaudeCodeLogin, theCredentialsFile } from '../src/config/claude-code-login.mjs'
import { FULL_PERMISSIONS, aCommandsPermissions, aCodexContainerCommand } from '../src/config/run-permissions.mjs'
import { carriesTheTestMark } from '../src/config/the-test-mark.mjs'
import { aWaitATestMayShorten } from '../src/config/sandbox-start-values.mjs'
import { theCodexRolloutFor } from '../src/config/codex-log.mjs'
import { spoolAGateMet, THE_GATE_COUNT_SPOOL_FOLDER } from '../src/config/gate-count-spool.mjs'

import { releaseThroughTheLedger as releaseTheRow, CONTAINER_PREFIX, SANDBOXES_FOLDER, SANDBOX_DEFAULTS, SANDBOX_DISK_FLOOR, SANDBOX_RUN_PEAK, SANDBOX_FOLDER_WARNING, setsALimitItself, theReCreatableMergeParts, theDeclaredSecrets, theFirstProcessRunningAs, theGitIdentity, bytesOfAMemoryFigure, theCgroupMemoryPath, noRoomInMemory, theRoomForPictures, theSandboxLimitArgs, theLimitsOfASandbox, THE_PROGRAM_A_RUNTIME_RUNS, THE_REVERSE_PATH_FILTER_OFF } from './sandbox-common.mjs'
import { aNameNamesTheSelection, readLauncherSelection, theRuntimeTheMapDoesNotHoldWords, theRuntimeWithNoCommandWords } from '../src/config/launcher-selection.mjs'
import { thePathsAWorkerLeavesOut, whyNotAPlainPath, whyNotPlainPaths } from '../src/config/a-workers-left-out-paths.mjs'
import { AN_IMAGE_IS_ONLY_FOR_WORKER, AN_IMAGE_IS_UNDER_THE_WORKTREE, anImageIsOnlyForCodex, anImageNotInTheWorktree, codexExecIsGiven, whyNotAFileOfTheWorktree } from '../src/config/a-workers-images.mjs'
import { THE_WORKER } from '../src/shared/roles.ts'
import { installOfficeProfile } from './dsh-hooks/install-profile.mjs'
import { DSH_PATCH_IN_A_CHECKOUT, THE_STARTING_WORDS, THE_STARTING_WORDS_WITHOUT_THE_SWITCH, aCommandWithTheHarnessFeaturesOff, aRunnerGivesDshThePatch, theHarnessFeaturesOffInAHome } from './harness-features-off.mjs'
import { aCommandsStartValues, aCommandsRuntime, aCommandsStartFromTheOffice, aCodexTierWarning, aDetailOfAFewKilobytes, aStreamReadWhole, howAPathMeets, prepareClaudeRunHome, prepareOpenCodeHome, prepareOpenCodeRunHome, OPENCODE_RUN_HOME_NOTICE, THE_SHARED_OPENCODE_DATABASE, theOpenCodeDatabaseOf, whyTheSlotToolGaveNoSeat } from './sandbox-common.mjs'

/** Where instance folders go unless --sandboxes says otherwise: sandbox-common.mjs says where. */
const DEFAULT_SANDBOXES = SANDBOXES_FOLDER
/** The dsh folder copied into each instance unless --dsh says otherwise. run-agent.sh's own default. */
const DEFAULT_DSH = join(homedir(), '.cache', 'mole-office', 'dsh')
const INSTANCE_NAME = /^[a-z0-9][a-z0-9-]{0,39}$/
const THE_HELPER = join('tools', 'sandbox-start.mjs')

// ============================================================================ words

function usage(problem) {
  process.stderr.write(
    [
      problem,
      '',
      'node tools/sandbox.mjs up <template> --name <instance> [--ro <folder>]... [--ref <branch>] [--from <checkout>]',
      '    [--network none|bridge|host] [--no-gpu]',
      'node tools/sandbox.mjs exec <instance> --agent <handle> --runtime <word> --model <m> [--brief <file>] [--asked-by <run>]',
      '    [--worktree <dir>] [--clone <name>] [--cut-from <branch>] [--title "..."] [--slot <pool>] [--starts-runs] [-- <command...>]',
      'node tools/sandbox.mjs exec <instance> [--run <id>] [--cwd <dir>] [--slot <pool>] [--secret <NAME>]... -- <command...>',
      'node tools/sandbox.mjs exec <instance> --agent <handle> --runtime <word> [--parent <run> | --asked-by <run>] -- <command...>',
      '  --asked-by <run> with --brief <file> names a live run of the registered starter for a noKey hand start.',
      '                  The office checks before the worktree is made and records that run as parent.',
      '  --parent <run>  the supervisor run the filed run belongs to; attribution stays with --session.',
      '                  Without it the parent is --session. Refused when no run is filed.',
      '  --with-path <path> for exec --agent and worker, once for each: a path the template leaves out of a worker\'s',
      '                  worktree (aWorkersWorktreeLeavesOut in its sandbox.json) is checked out in this one all the same.',
      'node tools/sandbox.mjs exec <instance> --wait [--timeout <s>] [--plain-env | --no-office-variables] [--cwd <dir>] [--secret <NAME>]... -- <command...>',
      'node tools/sandbox.mjs exec <instance> --check-view <spec.json> --cwd <private-copy> --json --no-office-variables [--secret <NAME>]... [--wait] [--timeout <seconds>] -- <command...>',
      '  A check view uses only the spec mounts. Its private home is check-views/<check>/home, mounted at /check/home.',
      '  Output and receipt paths are returned in JSON and stay outside every mount. A failed view never uses ordinary exec.',
      '  A plain command gets only the secrets named with --secret; without --secret it gets none.',
      'node tools/sandbox.mjs worker <instance> --agent <handle> --brief <file> [--model <m>] [--runtime claude-code|codex|dsh|opencode] [--clone <name>] [--parent <run> | --asked-by <run>] [--with-path <path>]... [--image <path>]...',
      '    Starts a worker on the chosen runtime: its own worktree, its brief, its own run and identity.',
      '    --image <path>, once for each, for --runtime codex only: a file in the worker\'s worktree, given to codex exec as -i.',
      '    --parent <run> files its run under that supervisor run, as exec --agent --parent does.',
      'node tools/sandbox.mjs round <instance> --agent <handle> --brief <file> [--model <m>] [--runtime claude-code|codex|dsh|opencode] [--continues <run>] [--worktree <new dir> --cut-from <commit or branch>]',
      '    Continues its last start on that runtime, or the run --continues names, once all its processes have ended.',
      '    With a new --worktree and --cut-from together, starts a fresh repair on verified main and preserves the old checkout.',
      '    --cut-from is then a commit, in full or shortened, or a branch of the checkout the sandbox was made from.',
      '  exec --agent, worker and round take [--flow <flow id>]: the flow the run follows. Without it nothing is refused.',
      'node tools/sandbox.mjs sizes [--tell] [--json]',
      '    Lists instance folder sizes; --tell warns the agents MOLE_OFFICE_SANDBOX_DISK_WATCHERS names once per crossing of 60 GB, and fails, saying so, when a crossing finds it naming none.',
      'node tools/sandbox.mjs status [<instance>] [--json]',
      '    Exits 1 when the host refused a sandbox\'s facts because it could not check them; a folder',
      '    that holds no instance.json still exits 0.',
      'node tools/sandbox.mjs down <instance> [--force]',
      'node tools/sandbox.mjs hand-over <instance> --to-session <run> [--json]',
      '    Gives the container\'s ledger row to another running session; the container is left as it is.',
      'node tools/sandbox.mjs clear <instance> [--force] [--json]',
      '    Brings a labelled merge sandbox down and removes only the trees the merge tool makes again (repo/, work/clone,',
      '    work/pair, work/main, work/bus-<n>, work/without, work/second); keeps every other file.',
      '    A cleared folder cannot be started again; choose another --name.',
      '',
      'Every command takes --as, --session, --workspace, --api, --sandboxes and --json. The header of this',
      'file says what each one does. exec, worker and round take --verbose for launch explanations.',
    ].join('\n') + '\n',
  )
  process.exit(2)
}

/** Refusal details must not create an instance that the refusal says does not exist. */
function detailsBeforeStart(prefix) {
  const name = chosen.targets[0]
  const instance = typeof name === 'string' && INSTANCE_NAME.test(name) ? join(sandboxes, name) : null
  const facts = instance === null ? [] : [join(theHostOnlyFolder(instance), INSTANCE_FILE), join(instance, INSTANCE_FILE)]
  const folder = facts.some((file) => existsSync(file) && statSync(file).isFile())
    ? join(instance, 'logs', filedLaunchRun ?? `${prefix}-${fileNameStamp(new Date())}-${process.pid}`)
    : mkdtempSync(join(tmpdir(), 'mole-office-launch-'))
  mkdirSync(folder, { recursive: true })
  return join(folder, 'launch.txt')
}

function refuse(sentence, code = 1) {
  const controllerTicket = process.env.MOLE_CHECK_VIEW_CONTROLLER
  if (controllerTicket !== undefined) {
    try { writeCheckViewFailure(JSON.parse(readFileSync(controllerTicket, 'utf8')), sentence, code) }
    catch (error) { process.stderr.write(`Check view failure evidence could not be written: ${error.message}\n`) }
  }
  if (['exec', 'worker', 'round'].includes(chosen.verb)) {
    try {
      if (launchDetails === null) {
        keepLaunchDetails({ details: prelaunchDetails ?? detailsBeforeStart('failed') })
      }
      appendFileSync(launchDetails, `sandbox: ${sentence}\n`)
      const short = sentence.split(/(?<=[.!?]) (?=[A-Z])/).filter((part, index) => index === 0 || /node tools\/|chmod [0-7]+|Give --model|use exec --agent/.test(part)).join(' ').replaceAll('\n', ' ')
      process.stderr.write(`sandbox: ${chosen.verbose === true ? sentence : short} Details: ${launchDetails}\n`)
    } catch (error) {
      process.stderr.write(`sandbox: Could not write launch details: ${error.message}\n`)
      process.stderr.write(`sandbox: ${sentence}\n`)
    }
  } else process.stderr.write(`sandbox: ${sentence}\n`)
  process.exit(code)
}

let launchDetails = null
let filedLaunchRun = null
let prelaunchDetails = null
let prelaunchLineCount = 0
const launchLines = []

function say(line, quiet = false) {
  const words = `sandbox: ${line}\n`
  if (['exec', 'worker', 'round'].includes(chosen.verb)) {
    if (launchDetails === null) launchLines.push(words)
    else appendFileSync(launchDetails, words)
  }
  if (!quiet || chosen.verbose === true) {
    if (!quiet && ['exec', 'worker', 'round'].includes(chosen.verb) && launchDetails === null) {
      if (prelaunchDetails === null) {
        prelaunchDetails = detailsBeforeStart('pending')
      }
      appendFileSync(prelaunchDetails, launchLines.slice(prelaunchLineCount).join(''))
      prelaunchLineCount = launchLines.length
      process.stderr.write(`${words.trimEnd()} Details: ${prelaunchDetails}\n`)
    } else process.stderr.write(!quiet && launchDetails !== null && !line.includes(launchDetails) ? `${words.trimEnd()} Details: ${launchDetails}\n` : words)
  }
}

function keepLaunchDetails(start, instanceDir = null) {
  if (typeof start.details !== 'string') {
    if (instanceDir === null) throw new Error('No sandbox folder was named for launch details.')
    const namedRun = start.run ?? filedLaunchRun ?? chosen.run
    const run = typeof namedRun === 'string' && /^[A-Za-z0-9_-]+$/.test(namedRun) ? namedRun : null
    start.details = run !== null
      ? join(instanceDir, 'logs', run, 'launch.txt')
      : typeof start.out === 'string'
        ? join(dirname(start.out), 'launch.txt')
        : prelaunchDetails ?? join(instanceDir, 'logs', `cmd-${fileNameStamp(new Date())}-${process.pid}`, 'launch.txt')
  }
  launchDetails = start.details
  mkdirSync(dirname(launchDetails), { recursive: true })
  appendFileSync(launchDetails, launchLines.slice(launchDetails === prelaunchDetails ? prelaunchLineCount : 0).join(''))
  launchLines.length = 0
  prelaunchLineCount = 0
}


const REPEATED = ['ro', 'label', 'secret', 'with-path', 'image']
const VALUED = [
  'name', 'ro', 'label', 'secret', 'ref', 'from', 'dsh', 'as', 'session', 'parent', 'asked-by', 'workspace', 'api', 'sandboxes',
  'agent', 'runtime', 'model', 'selection', 'worktree', 'clone', 'cut-from', 'at', 'title', 'brief', 'cwd', 'slot', 'run', 'rw', 'timeout', 'network', 'flow', 'check-view',
  'to-session', 'provider-key-file', 'with-path', 'image',
]
/**
 * THE NETWORKS `up --network` TAKES, docker's own three. A name outside them is refused rather than handed to docker,
 * where a mistyped one would be a network docker makes or refuses in words of its own.
 */
const NETWORKS = ['none', 'bridge', 'host']
/**
 * THE NAMES AS THE HOST HAS THEM, for a container off the host's network, which docker would give an /etc/hosts of its own
 * (acceptance finding 77, measured on 25 September 2026):
 *   - LOCALHOST IS 127.0.0.1 ALONE. Docker's file also maps it to ::1, so a server listening on "localhost" took ::1 alone
 *     and a test asking 127.0.0.1 was refused: two files were red on network none for that reason only.
 *   - THE MACHINE'S OWN NAME IS 127.0.1.1. The container is given its own name as its host name, since docker's would be its
 *     id, which resolves to nothing there: two files that listen on this computer's name were red for that alone.
 * The host's own file says both, in the same form.
 */
function theNamesAsTheHostHasThem(hostName) {
  return [
    '127.0.0.1\tlocalhost',
    `127.0.1.1\t${hostName}`,
    '::1\tip6-localhost ip6-loopback',
    'fe00::0\tip6-localnet',
    'ff00::0\tip6-mcastprefix',
    'ff02::1\tip6-allnodes',
    'ff02::2\tip6-allrouters',
  ].join('\n')
}
/**
 * A HOST NAME OF ITS OWN for the container called `containerName`, as one DNS label: lowercase letters, digits and
 * hyphens, at most 63. A longer name keeps its first 56 and a hash of the whole. On the host's network docker would give
 * a container the host's own name, and a test office in it would stamp its pictures and messages with that name.
 */
function aHostNameFor(containerName) {
  const label = containerName.toLowerCase().replace(/[^a-z0-9-]/g, '-')
  return label.length <= 63 ? label : `${label.slice(0, 56)}-${createHash('sha256').update(containerName).digest('hex').slice(0, 6)}`
}
/**
 * On the host's network, the arguments that give a container `hostName` and make that name resolve to this machine. The name is
 * 127.0.1.1, as off it: a test that serves a second door on this computer's name also listens on 127.0.0.1, and on one address
 * the second listen is refused.
 */
function theOwnNameOnTheHostsNetwork(hostName) {
  return [`--hostname=${hostName}`, `--add-host=${hostName}:127.0.1.1`]
}
/**
 * WHAT IS WRONG WITH THE HOST NAME A MADE CONTAINER CARRIES, or null. `asked` is the name it was given, or null when it was
 * given none. A container that carries the host's own name is not kept, and these words name neither name, since a
 * refusal goes into logs and the host's name must not.
 */
function aHostNameProblem(carried, asked) {
  if (carried === hostname()) return "its host name is the host's own"
  if (asked !== null && carried !== asked) return `its host name is ${String(carried ?? 'not said')}, not ${asked}`
  return null
}
const SWITCHES = ['verbose', 'tell', 'json', 'force', 'wait', 'plain-env', 'no-office-variables', 'starts-runs', 'no-dsh', 'isolated', 'no-gpu']

function readArguments(argv) {
  const chosen = { verb: argv[0] ?? null, targets: [], command: null, ro: [], label: [], secret: [], 'with-path': [], image: [] }
  for (let i = 1; i < argv.length; i += 1) {
    const word = argv[i]
    if (word === '--') {
      chosen.command = argv.slice(i + 1)
      break
    }
    if (word === '--help' || word === '-h') usage('')
    if (word.startsWith('--')) {
      const name = word.slice(2)
      if (SWITCHES.includes(name)) {
        chosen[name] = true
        continue
      }
      if (!VALUED.includes(name) && !(name === 'continues' && ['worker', 'round'].includes(chosen.verb))) usage(`I do not know the option ${word}.`)
      const value = argv[(i += 1)]
      if (name === 'secret' && (value === undefined || value.trim() === '')) usage('--secret needs a name.')
      if ((name === 'parent' || name === 'asked-by') && (value === undefined || value.trim() === '' || value.startsWith('--'))) usage(`--${name} needs a run id.`)
      if (name === 'continues' && (value === undefined || value.trim() === '' || value.startsWith('--'))) usage('--continues needs a run id.')
      if (value === undefined || value === '') usage(`${word} takes a value.`)
      if (REPEATED.includes(name)) chosen[name].push(value)
      else chosen[name] = value
      continue
    }
    chosen.targets.push(word)
  }
  return chosen
}

const chosen = readArguments(process.argv.slice(2))
// --help IN PLACE OF A COMMAND prints the commands, as it does after one.
if (chosen.verb === '--help' || chosen.verb === '-h') usage('')
if (chosen.verb === null) usage('Say what to do: up, exec, worker, round, status or down.')
if (chosen.secret.length > 0 && chosen.verb !== 'exec') usage('--secret is only for a plain exec command.')
if (chosen.tell === true && chosen.verb !== 'sizes') usage('--tell is only for sizes.')
if (chosen['no-gpu'] === true && chosen.verb !== 'up') usage(`--no-gpu is only for up, which makes the container; ${chosen.verb} was given it, and nothing was done.`)
if (chosen.parent !== undefined && chosen.verb !== 'exec' && chosen.verb !== 'worker') usage('--parent is only for exec --agent and worker, which file a run under a supervisor run.')
if (chosen['check-view'] !== undefined && chosen.verb !== 'exec') usage('--check-view is only for exec.')
if (chosen['provider-key-file'] !== undefined && chosen['check-view'] === undefined) usage('--provider-key-file is only for exec --check-view.')
if (chosen['provider-key-file'] !== undefined && chosen.secret.length > 0) usage('A check view takes --secret or --provider-key-file, not both.')
if (chosen['asked-by'] !== undefined && chosen.parent !== undefined) usage('--asked-by and --parent do not go together; --asked-by names the parent run.')
if (chosen['asked-by'] !== undefined && !['exec', 'worker'].includes(chosen.verb)) usage('--asked-by is only for exec --agent and worker.')
if (chosen['with-path'].length > 0 && !(chosen.verb === 'worker' || (chosen.verb === 'exec' && chosen.agent !== undefined))) usage("--with-path is only for worker and exec --agent, which make an agent's worktree. Nothing was done.")
if (chosen.image.length > 0 && chosen.verb !== 'worker') usage(AN_IMAGE_IS_ONLY_FOR_WORKER)
const sandboxes = resolve(chosen.sandboxes ?? DEFAULT_SANDBOXES)
const api = whereIsTheApi(chosen.api)
const controllerStartupSignals = Object.fromEntries(['SIGTERM', 'SIGINT', 'SIGHUP'].map(signal => [signal, () => refuse(`Check view startup was interrupted by ${signal}.`, 128 + osConstants.signals[signal])]))
if (process.env.MOLE_CHECK_VIEW_CONTROLLER !== undefined) for (const [signal, handler] of Object.entries(controllerStartupSignals)) process.on(signal, handler)

/**
 * WHO THE CALLER SAYS IT IS: the agent and the session it named, each null when it named none. Read here once, for
 * `whoIsAsking` and `whoIsAskingIfSaid` both, so a change to where a name comes from cannot reach one of them and not
 * the other (acceptance finding 70; invariant 9).
 */
function whoTheCallerSaid() {
  const agent = chosen.as ?? settingValue('MOLE_OFFICE_AGENT') ?? null
  const session = chosen.session ?? transientToolContext().session ?? null
  return {
    agent: typeof agent === 'string' && agent.trim() !== '' ? agent : null,
    session: typeof session === 'string' && session.trim() !== '' ? session : null,
  }
}

/** Who is asking, for a write. Refuses rather than writing in nobody's name or the person's. */
function whoIsAsking() {
  const { agent, session } = whoTheCallerSaid()
  if (agent === null) {
    refuse("Say who is asking: --as <your handle>, or run where MOLE_OFFICE_AGENT is set. This never writes in the person's name. Nothing was done.", 2)
  }
  if (session === null) {
    refuse('Say which session is asking: --session <its record id>, or run where MOLE_OFFICE_SESSION is set. Nothing was done.', 2)
  }
  return { agent, session }
}

// ============================================================================ the machine

/**
 * GIT ON A REPOSITORY A SANDBOX CAN WRITE, RUN ON THE HOST, with the guard of tools/sandbox-git.mjs, answered as `run`
 * answers. Only reads and ref writes go here: a command that writes the files of a sandbox's clone runs inside its
 * container (gitInside).
 */
function guardedRun(repo, args, options = {}) {
  const r = guardedGitRun(repo, args, { maxBuffer: 64 * 1024 * 1024, ...options })
  return { status: r.status, stdout: String(r.stdout ?? ''), stderr: String(r.stderr ?? r.error?.message ?? ''), signal: r.signal, error: r.error }
}

/**
 * GIT INSIDE THE SANDBOX'S OWN CONTAINER, as its own user, for a command that writes the files of its clone: a
 * filter the clone's config names runs there, in the sandbox that chose it. The instance folder is at the same path
 * inside. Answers spawnSync's answer.
 */
function gitInside(sb) {
  return (args) => spawnSync('docker', ['exec', '-w', sb.dir, sb.instance.container.name, 'git', ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
}

/** Run a program to the end. Refuses loudly when it is not installed. */
function run(program, args, options = {}) {
  const r = spawnSync(program, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...options })
  if (r.error && r.error.code === 'ENOENT' && program !== 'df' && program !== 'du' && program !== 'free') {
    refuse(`${program} is not installed, or not on PATH, so nothing was done. The sandbox launcher needs docker and the devcontainer CLI.`)
  }
  return { status: r.status, stdout: String(r.stdout ?? ''), stderr: String(r.stderr ?? ''), signal: r.signal, error: r.error }
}

/** GB here means decimal bytes, as in the owner's disk decision, not docker's memory suffix; one decimal place is enough to read. */
function inGB(bytes) { return `${Number((bytes / 1_000_000_000).toFixed(1))} GB` }

/**
 * Read the sandboxes' filesystem before any filing, handshake, process row or seat (decision, item 4): a build or
 * test starts with the floor plus a test run's own peak free (the rule that replaced the earlier start line;
 * SANDBOX_RUN_PEAK), so that its own writing does not take the disk under the floor.
 */
function roomForABuildOrTest() {
  const floor = `${SANDBOX_DISK_FLOOR.gb} GB`, line = `${SANDBOX_DISK_FLOOR.gb + SANDBOX_RUN_PEAK.gb} GB`
  const needs = `${line} a new build or test run needs: the ${floor} floor (the free disk never goes under it) plus a test run's own peak of ${SANDBOX_RUN_PEAK.gb} GB`
  const r = run('df', ['-B1', '--output=avail', sandboxes], { timeout: 30_000 })
  const lines = r.stdout.trim().split('\n')
  const bytes = lines.length === 2 && /^[0-9]+$/.test(lines[1].trim()) ? Number(lines[1].trim()) : NaN
  if (r.status !== 0 || !Number.isSafeInteger(bytes)) {
    refuse(`the free space where the sandboxes are is unknown: df could not read ${sandboxes} (${r.error?.message ?? (r.stderr.trim() || `exit ${String(r.status)}; invalid available-byte figure`)}). A new build or test run needs ${line} free: the ${floor} floor (the free disk never goes under it) plus a test run's own peak of ${SANDBOX_RUN_PEAK.gb} GB. Nothing was started; try again once space can be read.`, 75)
  }
  if (bytes < SANDBOX_DISK_FLOOR.bytes + SANDBOX_RUN_PEAK.bytes) {
    refuse(`the machine has ${inGB(bytes)} free where the sandboxes are, under the ${needs}. Nothing was started; it can start once space is freed.`, 75)
  }
}

/**
 * THE MEMORY THIS MACHINE HAS AVAILABLE, in bytes, read with `free -b` (its "available" column, the kernel's MemAvailable),
 * as the disk floor reads df. An unknown figure refuses with exit 75, as unknown space does: a start is never let through
 * on a guess.
 */
function theMemoryAvailable() {
  const r = run('free', ['-b'], { timeout: 30_000 })
  const line = r.stdout.split('\n').find((one) => one.startsWith('Mem:'))
  const fields = line === undefined ? [] : line.trim().split(/\s+/)
  const bytes = fields.length >= 7 && /^[0-9]+$/.test(fields[6]) ? Number(fields[6]) : NaN
  if (r.status !== 0 || !Number.isSafeInteger(bytes)) {
    refuse(`the memory this machine has available is unknown: free -b could not be read (${r.error?.message ?? (r.stderr.trim() || `exit ${String(r.status)}; no available figure`)}). A start is never let through on a guess. Nothing was started.`, 75)
  }
  return bytes
}

/**
 * What a running container holds now: docker's State.Pid names /proc/<pid>/cgroup, whose v2 path names
 * memory.current under /sys/fs/cgroup wherever docker placed it. An unreadable figure gives 0, asking for more room.
 */
function theMemoryAContainerHolds(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return 0
  // Only a process carrying the test mark may use synthetic files; without it the root is always /, whatever the variable says.
  const root = carriesTheTestMark() ? (process.env.MOLE_SANDBOX_MEMORY_TEST_ROOT ?? '/') : '/'
  try {
    const path = theCgroupMemoryPath(readFileSync(join(root, 'proc', String(pid), 'cgroup'), 'utf8'))
    if (path === null) return 0
    const figure = readFileSync(join(root, path), 'utf8').trim()
    const held = /^[0-9]+$/.test(figure) ? Number(figure) : NaN
    return Number.isSafeInteger(held) && held > 0 ? held : 0
  } catch {
    return 0
  }
}

/**
 * MEMORY ADMISSION (noRoomInMemory): refuse with exit 75, before anything is filed, seated or
 * started, when the machine has not got what the container may still take under its limit plus the margin. The merge tool
 * reads 75 as wait, never red; a person or a check sees the sentence.
 */
function roomInMemory(limit, used, what) {
  const said = noRoomInMemory({ available: theMemoryAvailable(), limit, used })
  if (said !== null) refuse(`${said}. Nothing was started; ${what} can start once that much memory is free.`, 75)
}

/** Docker device requests alone say whether this container asks for a GPU. No driver or device is read. */
function asksForAGpu(container) {
  return (container.HostConfig?.DeviceRequests ?? []).some((request) =>
    (request.Capabilities ?? []).some((capabilities) => capabilities.includes('gpu')))
}

/** GPU overlaps are reminders, never refusals. Bookings are read from their existing reader. */
async function remindOfOtherGpuSandboxes(name, workspace, who) {
  const options = { encoding: 'utf8', timeout: 30_000, maxBuffer: 64 * 1024 * 1024 }
  const reason = (result) => result.error?.message ?? (String(result.stderr ?? '').trim() || `exit ${String(result.status)}`)
  const unchecked = (why) => say(`GPU overlap could not be checked: ${why}. This start continues (a GPU overlap is a reminder, never a refusal).`)
  const listed = spawnSync('docker', ['ps', '--filter', `label=${ID_LABEL}`, '--format', '{{.ID}}'], options)
  if (listed.status !== 0) {
    unchecked(`docker could not list running GPU sandboxes (${reason(listed)})`)
    return
  }
  const others = []
  for (const id of listed.stdout.trim().split('\n').filter(Boolean)) {
    const inspected = spawnSync('docker', ['inspect', '--type', 'container', id], options)
    if (inspected.status !== 0) { unchecked(`docker could not read container ${id} (${reason(inspected)})`); continue }
    let containers
    try { containers = JSON.parse(inspected.stdout) }
    catch { unchecked(`docker inspect ${id} did not answer JSON`); continue }
    if (!Array.isArray(containers) || containers.length !== 1) { unchecked(`docker inspect ${id} did not answer with one container`); continue }
    const container = containers[0]
    if (container === null || !container.State?.Running) continue
    const other = container.Config?.Labels?.[ID_LABEL]
    if (other === undefined || other === name || !asksForAGpu(container)) continue
    others.push(other)
  }
  if (others.length === 0) return
  // A START THAT REMINDS is counted once, however many sandboxes it names (gate other-gpu-sandboxes-reminder).
  spoolAGateMet('other-gpu-sandboxes-reminder', 'remind', name)
  const read = await askTheOffice(api, '/api/resources/gpu?secondLevel=show', { workspace, headers: theCallerNamed(workspace, who) })
  const bookings = read.status === 200 && Array.isArray(read.body?.secondLevel?.line) ? read.body.secondLevel.line : null
  for (const other of others) {
    const current = bookings?.filter((booking) => booking.sandbox === other && booking.state === 'running' && booking.program !== 'its program has ended')
    const bookingWords = bookings === null
      ? `Current bookings could not be checked (${read.status === 200 ? 'the office answered without a booking line' : theOfficeSaid(read)}).`
      : current.length === 0
        ? 'No current booking is recorded for it.'
        : current.map((booking) => `Current booking ${booking.booking}: ${booking.purpose}, ${booking.gib} GiB, planned until ${booking.endsAt}; program ${booking.program}.`).join(' ')
    say(`GPU reminder: sandbox ${other} is already running with a GPU. ${bookingWords} This start continues (a GPU overlap is a reminder, never a refusal).`)
  }
}

/** The container as docker describes it, or null because docker knows no container of that name or id. */
function inspectContainer(nameOrId) {
  const r = run('docker', ['inspect', '--type', 'container', nameOrId])
  if (r.status !== 0) {
    if (/no such (container|object)/i.test(r.stderr)) return null
    refuse(`docker could not be asked about ${nameOrId}: ${r.stderr.trim() || `exit ${r.status}`}. Nothing was done.`)
  }
  let parsed
  try {
    parsed = JSON.parse(r.stdout)
  } catch {
    refuse(`docker inspect ${nameOrId} did not answer JSON, so the container cannot be read. Nothing was done.`)
  }
  return Array.isArray(parsed) && parsed.length === 1 ? parsed[0] : null
}

/** Is `inner` the folder `outer` or somewhere inside it? */
function within(inner, outer) {
  const r = relative(outer, inner)
  return r === '' || (!r.startsWith('..') && !isAbsolute(r))
}

/** The folder of one instance, which is always one new name under the sandboxes folder. */
function instanceFolder(name) {
  if (typeof name !== 'string' || !INSTANCE_NAME.test(name)) {
    refuse(`An instance is named with lowercase letters, digits and hyphens, at most 40, starting with a letter or digit; "${name}" is not such a name.`, 2)
  }
  return join(sandboxes, name)
}

/** The launcher's own folder for an instance (theHostOnlyFolder in tools/sandbox-common.mjs), which no sandbox can see. */
function hostOnlyFolder(name) {
  return theHostOnlyFolder(instanceFolder(name))
}

/** The checkout a sandbox is made from: the one --from names, or the main checkout of the launcher's own. */
function theCheckoutAsked() {
  return chosen.from === undefined ? mainCheckoutOf(REPO_ROOT) : resolve(chosen.from)
}

/**
 * THE FACTS THE HOST TAKES ITS DECISIONS FROM, for the instance `name`: `{ facts, refused }`. `facts` is null when
 * nothing is there; `refused` is a sentence when the facts cannot be taken.
 *
 * The host reads its own copy (readHostInstance), which `up` writes in the launcher's own folder. A sandbox made before
 * the host kept a copy has only the copy in its folder, which a run in it can rewrite. That copy is ADOPTED once, at the
 * first host command after the change, and only when every fact the host acts on agrees with something the host holds
 * itself (whyTheFolderCopyIsNotTaken). Then it is written as the host's copy, and the folder's copy is never read again.
 */
async function theFactsTheHostReads(name, who) {
  const dir = instanceFolder(name)
  try {
    const own = readHostInstance(dir)
    if (own !== null) return { facts: own, refused: null }
    const folders = readInstance(dir)
    if (folders === null) return { facts: null, refused: null }
    const why = await whyTheFolderCopyIsNotTaken(name, dir, folders, who)
    if (why !== null) {
      return {
        facts: null,
        refused:
          `The sandbox ${name} has no host copy of its facts, and the copy in its folder, ${join(dir, INSTANCE_FILE)}, was not taken: ${why} ` +
          'A run in the sandbox can rewrite that copy, so the host takes nothing from it that it cannot check. Nothing was done.',
      }
    }
    writeHostInstance(dir, folders)
    say(`the sandbox ${name} had no host copy of its facts; the copy in its folder agreed with what the host holds, and is now the host's copy, ${join(theHostOnlyFolder(dir), INSTANCE_FILE)}.`)
    return { facts: folders, refused: null }
  } catch (why) {
    return { facts: null, refused: why instanceof Error ? why.message : String(why) }
  }
}

/** The facts theFactsTheHostReads answers, or a refusal when there are none or they cannot be taken. */
async function theFactsOrRefuse(name, who, nothing) {
  const { facts, refused } = await theFactsTheHostReads(name, who)
  if (refused !== null) refuse(refused)
  if (facts === null) refuse(nothing)
  return facts
}

/**
 * WHY A FOLDER'S COPY OF THE FACTS IS NOT TAKEN AS THE HOST'S, naming the field, or null when every check passes. Each
 * fact the host acts on is compared with what the host holds itself:
 *   - `instance`, `container.name` and `dir` with the name the caller gave and the folder the launcher works out from it;
 *   - `template` and `templateDir` with the launcher's own template folder of that name, and the template with the one
 *     the container's ledger row was registered with;
 *   - `from` with the checkout the caller names with --from, or the main checkout of the launcher's own;
 *   - `clones` with the clones the template declares;
 *   - `api` with the office the caller names;
 *   - `containerRow` with the ledger: a container row whose key is the container's name. With no row, `workspace` must
 *     be the project the caller names, because nothing else says which it is;
 *   - `readOnly` with the read-only folders the host's copy of devcontainer.json gave docker.
 * Not checked, because the host holds nothing to check them with and they decide nothing outside the sandbox's own
 * folder: `ref` (the branch a worktree is cut from by default, in the checkout already checked), `labels` (whether clear
 * may remove that folder's re-created trees), `clearedAt`, `createdAt`, `upAt`, `startedBy`, `network`, `gpu` and
 * `container.id`.
 */
async function whyTheFolderCopyIsNotTaken(name, dir, facts, who) {
  const same = (a, b) => typeof a === 'string' && existsSync(a) && existsSync(b) && realpathSync(a) === realpathSync(b)
  const said = (value) => (value === undefined ? 'nothing' : JSON.stringify(value))
  if (facts === null || typeof facts !== 'object' || Array.isArray(facts)) return 'it does not hold an object of facts.'
  if (facts.instance !== name) return `its instance is ${said(facts.instance)}, not ${name}.`
  const container = `${CONTAINER_PREFIX}${name}`
  if (facts.container?.name !== container) return `its container.name is ${said(facts.container?.name)}, not ${container}.`
  if (!same(facts.dir, dir)) return `its dir is ${said(facts.dir)}, not the instance folder ${dir}.`
  const templateFolder = typeof facts.template === 'string' && INSTANCE_NAME.test(facts.template) ? join(REPO_ROOT, 'sandboxes', facts.template) : null
  if (templateFolder === null) return `its template is ${said(facts.template)}, which names no template folder.`
  if (!same(facts.templateDir, templateFolder)) return `its templateDir is ${said(facts.templateDir)}, not the launcher's own template folder ${templateFolder}.`
  let office
  try { office = JSON.parse(readFileSync(join(templateFolder, 'sandbox.json'), 'utf8')) } catch (why) {
    return `its templateDir ${templateFolder} has no sandbox.json that can be read (${why instanceof Error ? why.message : String(why)}).`
  }
  if (office?.template !== facts.template) return `its templateDir ${templateFolder} holds the template ${said(office?.template)}, not ${facts.template}.`
  const from = theCheckoutAsked()
  if (!same(facts.from, from)) {
    return `its from is ${said(facts.from)}, not ${from}, the checkout ${chosen.from === undefined ? 'the launcher itself is in' : '--from names'}. If the sandbox was made from ${said(facts.from)}, ask again with --from naming it.`
  }
  const declared = (office.clones ?? []).map((one) => ({ name: one?.name, from: one?.from }))
  const clones = facts.clones ?? []
  if (!Array.isArray(clones) || clones.length !== declared.length || clones.some((one, i) => one?.name !== declared[i].name || one?.from !== declared[i].from || (one?.ref !== null && typeof one?.ref !== 'string'))) {
    return `its clones are ${said(facts.clones)}, not the clones the template declares, ${JSON.stringify(declared)}.`
  }
  if (facts.api !== api) return `its api is ${said(facts.api)}, not ${api}, the office this command was given.`
  if (facts.containerRow === null || facts.containerRow === undefined) {
    const workspace = whichWorkspace(chosen.workspace)
    if (facts.workspace !== workspace) return `it names no containerRow, and its workspace is ${said(facts.workspace)}, not ${workspace}, the project this command was given.`
  } else {
    if (typeof facts.containerRow !== 'string' || typeof facts.workspace !== 'string') return `its containerRow ${said(facts.containerRow)} and workspace ${said(facts.workspace)} are not both text.`
    const { row, why } = await theContainerRowNamed(facts, who)
    if (row === null) return `its containerRow ${facts.containerRow} ${why}.`
    if (row.type !== 'container' || row.key !== container) return `its containerRow ${facts.containerRow} is the ledger row of the ${row.type} ${row.key}, not of the container ${container}.`
    if (!String(row.detail ?? '').startsWith(`Sandbox ${name}, from the template ${facts.template};`)) return `its template is ${facts.template}, and the container's ledger row ${row.id} was not registered with that template.`
  }
  const config = join(theHostOnlyFolder(dir), 'devcontainer.json')
  let given = []
  if (existsSync(config)) {
    let copy
    try { copy = JSON.parse(readFileSync(config, 'utf8')) } catch (why) {
      return `its readOnly cannot be checked: the host's copy of devcontainer.json, ${config}, cannot be read (${why instanceof Error ? why.message : String(why)}).`
    }
    let template
    try { template = JSON.parse(readFileSync(join(templateFolder, 'devcontainer.json'), 'utf8')) } catch { template = {} }
    const own = new Set(template.mounts ?? [])
    // THE MIRROR OF MAIN is mounted as a --ro folder is, and is no --ro folder (item 2f).
    const mirror = theMainMirrorOf(sandboxes, from)
    given = (copy.mounts ?? []).filter((text) => !own.has(text)).map(parseMount)
      .filter((m) => m.type === 'bind' && m.readonly && m.source !== null && m.source === m.target && m.source !== mirror && !m.raw.includes('${'))
      .map((m) => m.source)
  }
  if (JSON.stringify(facts.readOnly ?? []) !== JSON.stringify(given)) {
    return `its readOnly is ${said(facts.readOnly)}, and the host's copy of devcontainer.json gave docker ${JSON.stringify(given)} read-only.`
  }
  return null
}

/**
 * THE CONTAINER'S LEDGER ROW `facts.containerRow`, in the project `facts.workspace`: `{ row, why }`, and `unread` when
 * the row could not be looked for, because the ledger or the session's rows could not be read. The open rows first,
 * as the launcher reads them (theLedger). A row that is not open is looked for among the rows of the session that
 * started the sandbox, closed ones too: one session's rows, and never the whole history (acceptance finding 67).
 */
async function theContainerRowNamed(facts, who) {
  const open = await theLedger(facts.workspace, who)
  if (open.rows === null) return { row: null, why: `could not be checked, because the ledger of ${facts.workspace} could not be read (${open.why})`, unread: true }
  const row = open.rows.find((r) => r.id === facts.containerRow)
  if (row !== undefined) return { row, why: null }
  const session = facts.startedBy?.session
  if (typeof session !== 'string' || session === '') return { row: null, why: `is not open in the ledger of ${facts.workspace}, and the facts name no session to look for it under` }
  const reply = await askTheOffice(api, `/api/resources?sessionRecordId=${encodeURIComponent(session)}&includeReleased=true`, { workspace: facts.workspace, headers: theCallerNamed(facts.workspace, who) })
  if (reply.status !== 200 || !Array.isArray(reply.body?.resources)) return { row: null, why: `could not be checked, because the rows of session ${session} could not be read (${theOfficeSaid(reply)})`, unread: true }
  const theirs = reply.body.resources.find((r) => r.id === facts.containerRow)
  return theirs === undefined ? { row: null, why: `is not a row of session ${session} in the ledger of ${facts.workspace}` } : { row: theirs, why: null }
}

/**
 * GIVE THE CLONE A LOCAL `main`, SO CODE THAT RESOLVES IT BY THAT BARE NAME CAN.
 *
 * `git clone --branch <ref>` makes exactly one local branch — the one checked out — and every other
 * branch on the source, `main` included, survives only as a remote-tracking ref (`origin/main`).
 * Measured (fix-insandbox, proving the template on a full suite run): inside such a clone,
 * `git rev-parse --verify main^{commit}` fails with "fatal: Needed a single revision", although
 * `git rev-parse --verify origin/main^{commit}` resolves. Several things this checkout does — the
 * git checker, the check page, an entry's own eligibility read — name `main` by that bare word, not
 * `origin/main`, so a sandbox whose `--ref` is anything else could not run them: `check-eligibility`,
 * `the-check-page-never-claims-main`, `the-check-is-drawn-on-the-runs-page`,
 * `the-office-runs-the-check-tool-itself`, `a-second-check-is-not-refused-by-the-first` and
 * `a-subagent-is-not-finished-until-it-is-released` were red for exactly this reason, and green alone
 * on the host, where a worktree's `main` is the repository's own local branch.
 *
 * A local `main` is added, pointed at `origin/main`, only when the clone does not already have one
 * (true whenever `--ref` names anything else) and the source really does have a `main` to point at.
 * It never touches the checked-out branch, HEAD or the working tree — it is one more ref, nothing a
 * sandboxed agent could not have added for itself with `git branch main origin/main`. Run on every
 * `up`, not only a fresh clone, so an instance made before this fix existed is covered by its next
 * start as well.
 */
function ensureLocalMainBranch(repo) {
  const already = guardedRun(repo, ['rev-parse', '--verify', '--quiet', 'refs/heads/main'])
  if (already.status === 0) return
  const upstream = guardedRun(repo, ['rev-parse', '--verify', '--quiet', 'refs/remotes/origin/main'])
  if (upstream.status !== 0) return
  const made = guardedRun(repo, ['branch', 'main', 'origin/main'])
  if (made.status !== 0) {
    say(`could not add a local main branch tracking origin/main in ${repo}: ${made.stderr.trim()}. Anything that resolves "main" by that bare name may refuse there.`)
  }
}

/** How long one git call in a sandbox's clone may take in the main refresh, on the host. The fetch is the long one. */
const A_REFRESH_GIT_CALL_MS = 30_000

/**
 * HOW LONG A START WAITS FOR GIT'S INDEX LOCK in a sandbox's clone, once the fast-forward of its checked-out main was
 * refused because the lock is there. No timeout of the launcher's covers what holds it: another start's fast-forward
 * cannot, under the refresh lock, so it is a git the person or a run started in repo/, or one that ended and left it.
 * Git holds the lock only while it writes the index, which in a clone this size takes seconds, so a lock still there
 * after thirty is more likely left over than held. A test may shorten it, never lengthen it, by a whole number of
 * milliseconds in SANDBOX_INDEX_LOCK_WAIT_MS (aWaitATestMayShorten).
 */
export const THE_INDEX_LOCK_WAIT_MS = 30_000

/**
 * HOW LONG A START WAITS FOR ANOTHER START'S REFRESH OF THE SAME SANDBOX'S MAIN, which the refresh lock holds: the long
 * steps of that refresh, each at its own limit. Its fetch, the wait for git's index lock after a fast-forward refused at
 * once, and the fast-forward run again. The reads between them answer at once from a clone on this machine, and their
 * limits are not added. A test may shorten it, never lengthen it, by a whole number of milliseconds in
 * SANDBOX_REFRESH_LOCK_WAIT_MS (aWaitATestMayShorten).
 */
export const THE_REFRESH_LOCK_WAIT_MS = A_REFRESH_GIT_CALL_MS + THE_INDEX_LOCK_WAIT_MS + A_FAST_FORWARD_INSIDE_MS

/** The refresh lock's file, in the sandbox's host-only folder, which no container mounts (theRefreshLockOf). */
export const THE_REFRESH_LOCK = 'main-refresh.lock'

/** How long a start that waits for a lock sleeps between two looks at it. */
const A_LOOK_AT_A_LOCK_MS = 100

/** Sleep this process for `ms` without using the processor, as tools/adaptable-timers.mjs does. */
function sleepFor(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

/** Whether a process with this number runs on this machine. EPERM is one that runs as somebody else. */
function aProcessRuns(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    if (error?.code === 'ESRCH') return false
    if (error?.code === 'EPERM') return true
    throw error
  }
}

/**
 * WHAT A REFRESH LOCK SAYS OF THE START THAT MADE IT, in a sentence for a refusal, or null when the file is gone. It is
 * read and never changed.
 */
function whoHoldsTheRefreshLock(file) {
  let pid
  try {
    pid = JSON.parse(readFileSync(file, 'utf8'))?.pid
  } catch (error) {
    if (error?.code === 'ENOENT') return null
    return `It could not be read as a lock (${error?.code ?? error?.message}), so this start cannot say which process made it.`
  }
  if (!Number.isSafeInteger(pid) || pid <= 0) return 'It names no process number this start can read.'
  return `It names the process ${pid}, and ${aProcessRuns(pid) ? 'a process with that number runs' : 'no process with that number runs'} on this machine.`
}

/**
 * THE REFRESH LOCK OF ONE SANDBOX'S MAIN, so that two starts that refresh one sandbox's main at once do it one after the
 * other: the second waits, then refreshes, and finds main already moved. Without it the second meets the first's git:
 * its fast-forward finds git's index lock, or it compares a work tree the first is still writing, or its fetch finds
 * the lock of origin/main.
 *
 * It is one file, THE_REFRESH_LOCK, in the sandbox's host-only folder, so no run can make or remove it. The folder is
 * made when it is not there, and nothing else in it is touched. The file is made by exclusive create, with mode 600,
 * and holds only the host pid of the launcher that made it and the time it was made.
 *
 * A start that finds the file waits for it to go, in steps that sleep, for at most the refresh lock wait. Past that it
 * is refused before anything is started or filed, naming the file, the wait, the process the file names and whether a
 * process with that number runs. It never removes a lock it did not make, whatever the lock holds and however old it
 * is: whoever knows it is left over may.
 *
 * Answers the function that lets go of the lock. It removes the file only while the file holds what this start wrote.
 */
function theRefreshLockOf(sb, repo) {
  const folder = hostOnlyFolder(sb.name)
  mkdirSync(folder, { recursive: true, mode: 0o700 })
  const file = join(folder, THE_REFRESH_LOCK)
  const wait = aWaitATestMayShorten(THE_REFRESH_LOCK_WAIT_MS, 'SANDBOX_REFRESH_LOCK_WAIT_MS')
  const began = Date.now()
  for (;;) {
    let made
    try {
      made = openSync(file, 'wx', 0o600)
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error
      const waited = Date.now() - began
      if (waited < wait) { sleepFor(Math.min(A_LOOK_AT_A_LOCK_MS, wait - waited)); continue }
      const whose = whoHoldsTheRefreshLock(file)
      // Gone just now: take it.
      if (whose === null) continue
      refuse(
        `local main in ${repo} was not refreshed, because the refresh lock ${file} was still there after this start waited ${wait / 1000} seconds for it to go, so nothing was started or filed. ` +
          `${whose} This start did not remove it: whoever knows it is left over may remove it, then start again.`,
        2,
      )
    }
    const mine = `${JSON.stringify({ pid: process.pid, madeAt: clockStamp().instant })}\n`
    try {
      writeFileSync(made, mine)
    } catch (error) {
      closeSync(made)
      unlinkSync(file)
      throw error
    }
    closeSync(made)
    return () => {
      let now = null
      try { now = readFileSync(file, 'utf8') } catch (error) { if (error?.code !== 'ENOENT') throw error }
      if (now === mine) unlinkSync(file)
      else say(`the refresh lock ${file} ${now === null ? 'was gone' : 'held what another start wrote'} when this start let go of it, so this start left it as it is.`)
    }
  }
}

/**
 * ONE START AT A TIME REFRESHES ONE SANDBOX'S MAIN, under its refresh lock (theRefreshLockOf). The lock is let go of in
 * a finally around the refresh, which a refresh that is done, one that leaves main as it is and a thrown error all pass
 * through. A refusal inside the refresh is handed back as its sentence and refused only after that finally, because
 * refuse() ends the process with process.exit, which runs no finally and so would leave the lock behind. Nothing else
 * in the refresh ends the process. A start stopped by a signal in its refresh leaves the lock, and the next start's
 * refusal past the wait names the process, which no longer runs.
 */
function refreshMainBeforeRun(sb, repairCut = null) {
  const letGo = theRefreshLockOf(sb, join(sb.dir, 'repo'))
  let refused
  try {
    refused = theRefreshOfMain(sb, repairCut)
  } finally {
    letGo()
  }
  if (refused !== undefined) refuse(refused, 2)
}

/**
 * Refresh the instance's main before an agent run, without changing authored work. The host reads the clone and
 * moves refs with the guard; a checked-out main is compared with its files without git comparing a file, and is
 * fast-forwarded inside the sandbox's container, because a fast-forward writes files and runs the clone's filters.
 *
 * MAIN COMES FROM THE CHECKOUT THE SANDBOX WAS MADE FROM, named by the path in the host's copy of its facts, and never
 * from the clone's `origin`, whose address is in the clone's config, which a run can rewrite. The host reads the commit
 * that checkout's main is at, and fetches that one commit by its hash. Two things in the clone's config could still
 * send git elsewhere, and neither can: a remote whose name is the path, because git takes no remote name that begins
 * with "/", and a url.<base>.insteadOf rewrite, which git expands first (ls-remote --get-url) and which leaves main
 * as it is. Whatever answers, the fetch can bring nothing but that one commit and what it holds.
 *
 * Answers the sentence of a refusal when a checked-out main cannot move, and nothing otherwise (refreshMainBeforeRun).
 */
function theRefreshOfMain(sb, repairCut = null) {
  const repo = join(sb.dir, 'repo')
  const from = sb.instance.from
  const git = (...args) => guardedGitRun(repo, args, { fromAFolder: args[0] === 'fetch', timeout: A_REFRESH_GIT_CALL_MS, maxBuffer: 1024 * 1024 })
  const left = (reason) => {
    sb.mainRefreshReason = reason
    say(`local main in ${repo} was left as it is: ${reason}; the run will start as before.`)
  }
  sb.mainRefreshReason = 'origin/main still supplies this older helper'
  // MAIN LEFT FOR ONE OF THE TWO THINGS ITS ROW NAMES, no checkout to come from or a rewritten address, is counted in the
  // gate-count spool (gate main-refreshed-only-from-its-own-checkout). Main left because something could not be read,
  // or because the fetch failed, is not.
  const notItsOwn = (reason) => {
    spoolAGateMet('main-refreshed-only-from-its-own-checkout', 'remind', sb.name)
    left(reason)
  }
  if (typeof from !== 'string' || !isAbsolute(from)) { notItsOwn("the host's copy of the sandbox's facts names no checkout it was made from"); return }
  const upstream = guardedGitRun(from, ['rev-parse', '--verify', '--quiet', 'refs/heads/main^{commit}'], { timeout: 30_000, maxBuffer: 1024 * 1024 })
  if (upstream.status !== 0) { left(`main could not be read in ${from}, the checkout the sandbox was made from`); return }
  const next = String(upstream.stdout).trim()
  if (repairCut !== null) {
    const proved = guardedGitRun(from, ['merge-base', '--is-ancestor', repairCut, next], { timeout: 30_000 })
    if (proved.status !== 0) { left('the repair cut is not proved on the source main'); return }
  }
  const address = theAddressGitWouldFetch(repo, from)
  if (address.address === null) { left(`the address git would fetch ${from} from could not be read`); return }
  if (!address.isTheFolderItself) {
    notItsOwn(`the clone's config rewrites the address ${from} to ${address.address}, so nothing was fetched`)
    return
  }
  const targetRef = repairCut === null ? 'refs/remotes/origin/main' : `refs/mole-office/repair-bases/${repairCut}`
  const fetched = git('fetch', '--quiet', '--no-tags', '--no-write-fetch-head', from, `+${repairCut ?? next}:${targetRef}`)
  if (fetched.status !== 0) {
    left(`the fetch of main from ${from} failed`)
    say(String(fetched.stderr ?? fetched.error?.message ?? 'Git gave no reason.').trim().replaceAll('\n', ' '), true)
    return
  }
  // Repair imports leave every checkout and its HEAD branch alone, including a sealed repo/ run.
  if (repairCut !== null) { sb.repairRef = targetRef; return }
  const local = git('rev-parse', '--verify', '--quiet', 'refs/heads/main')
  if (local.status === 1) {
    const made = git('update-ref', 'refs/heads/main', next, '0000000000000000000000000000000000000000')
    if (made.status !== 0) left('main could not be created')
    else say(`local main in ${repo} was created at main of ${from} (${next}).`, true)
    return
  }
  if (local.status !== 0) { left('main could not be read'); return }
  const old = local.stdout.trim()
  if (old === next) return
  const ancestor = git('merge-base', '--is-ancestor', old, next)
  if (ancestor.status === 1) {
    const ahead = git('merge-base', '--is-ancestor', next, old)
    if (ahead.status === 0) { say(`local main in ${repo} is ahead of main in ${from} and was left as it is.`, true); return }
    left(ahead.status === 1 ? `main and main in ${from} have diverged` : 'their ancestry could not be read')
    return
  }
  if (ancestor.status !== 0) { left('their ancestry could not be read'); return }
  const branch = git('symbolic-ref', '--quiet', 'HEAD')
  if (branch.status !== 0 && branch.status !== 1) { left('the checked-out branch could not be read'); return }
  let moved
  if (branch.stdout.trim() === 'refs/heads/main') {
    // A CHECKED-OUT MAIN THAT CANNOT MOVE STOPS THE START, before a run is filed: the run would start on the older helper
    // against the office as it is now, and nothing would say so but a line in the details. A file main does not track is
    // no change here; git refuses the fast-forward itself when main would write over one.
    const cannotMove = (why) => {
      sb.mainRefreshReason = why
      const behind = git('rev-list', '--count', `${old}..${next}`)
      const count = behind.status === 0 ? Number(String(behind.stdout).trim()) : NaN
      const howFar = count === 1 ? 'one commit behind it' : Number.isInteger(count) && count > 1 ? `${count} commits behind it` : 'behind it'
      return (
        `local main in ${repo} cannot be moved to main of ${from}: ${why}. ` +
          `This start would run the helper of ${old}, ${howFar}, so nothing was started or filed. ` +
          `Move, commit or remove what stops it in ${repo}, then start again.`
      )
    }
    let changes
    try { changes = outsideTheCommitInLines(repo, old).split('\n').filter((line) => line !== '' && !line.startsWith('?? ')) } catch { return cannotMove('what its working tree holds could not be read') }
    if (changes.length > 0) {
      const named = changes.slice(0, 5).map((line) => line.slice(3)).join(', ')
      return cannotMove(`its working tree changes files main tracks: ${named}${changes.length > 5 ? `, and ${changes.length - 5} more` : ''}`)
    }
    const gitSaid = (ran) => String(ran.stderr ?? '').trim().replace(/\s+/g, ' ') || ran.error?.message || `exit ${String(ran.status)}`
    moved = fastForwardInside(sb.instance.container.name, repo, next)
    // GIT'S INDEX LOCK IN THE CLONE, when it is why the fast-forward was refused: the file is there, or git's refusal
    // names it. Its path is asked of git, on the host through the guarded call, because a clone's .git may be a file
    // that names its folder elsewhere; git answers it relative to repo/. The start waits for the lock to go, and then
    // runs the fast-forward once more. It never removes the lock: a git that holds it may still be writing the index.
    if (moved.status !== 0) {
      const asked = git('rev-parse', '--git-path', 'index.lock')
      const indexLock = asked.status === 0 && String(asked.stdout).trim() !== '' ? resolve(repo, String(asked.stdout).trim()) : null
      if (indexLock !== null && (existsSync(indexLock) || String(moved.stderr ?? '').includes(indexLock))) {
        const wait = aWaitATestMayShorten(THE_INDEX_LOCK_WAIT_MS, 'SANDBOX_INDEX_LOCK_WAIT_MS')
        for (const began = Date.now(); existsSync(indexLock) && Date.now() - began < wait;) sleepFor(Math.min(A_LOOK_AT_A_LOCK_MS, wait - (Date.now() - began)))
        if (existsSync(indexLock)) {
          return cannotMove(`git's index lock ${indexLock} was still there after this start waited ${wait / 1000} seconds for it to go, and this start did not remove it (git said: ${gitSaid(moved)})`)
        }
        moved = fastForwardInside(sb.instance.container.name, repo, next)
      }
    }
    if (moved.status !== 0) return cannotMove(`the fast-forward in its container was refused (${gitSaid(moved)})`)
  } else moved = git('update-ref', 'refs/heads/main', next, old)
  if (moved.status !== 0) { left('the fast-forward was refused'); return }
  say(`local main in ${repo} was fast-forwarded from ${old} to main of ${from} (${next}).`, true)
}

/** WHERE A SANDBOX'S OWN NODE_MODULES COPIES ARE, in its instance folder, one folder per lockfile (ownPackagesAndOrigin). */
const PACKAGE_COPIES = 'node-modules'
/** A LOCKFILE LONGER THAN THIS is not read by the host; main's was about 300 KB on 24 October 2026. */
const A_LOCKFILE_AT_MOST = 64 * 1024 * 1024

/**
 * THE FIRST 16 HEX OF THE SHA-256 OF repo/package-lock.json, read by the host without following a link at its last step
 * and without waiting on anything that is not a regular file, because a run in the sandbox can put anything there.
 * Answers `{ hash, why }`: both null when there is no lockfile, and `why` the sentence when one could not be read.
 * @param {string} repo
 */
function theLockfileHash(repo) {
  const path = join(repo, 'package-lock.json')
  let fd
  try { fd = openSync(path, fsConstants.O_RDONLY | fsConstants.O_NONBLOCK | fsConstants.O_NOFOLLOW) }
  catch (why) {
    if (why?.code === 'ENOENT') return { hash: null, why: null }
    return { hash: null, why: `${path} could not be read (${why?.code ?? why?.message}), so no packages were installed from it` }
  }
  try {
    const stat = fstatSync(fd)
    if (!stat.isFile()) return { hash: null, why: `${path} is not a regular file, so no packages were installed from it` }
    if (stat.size > A_LOCKFILE_AT_MOST) return { hash: null, why: `${path} is ${stat.size} bytes, more than the ${A_LOCKFILE_AT_MOST} a lockfile is read to, so no packages were installed from it` }
    const sum = createHash('sha256')
    const chunk = Buffer.alloc(1024 * 1024)
    for (let read = readSync(fd, chunk, 0, chunk.length, null); read > 0; read = readSync(fd, chunk, 0, chunk.length, null)) sum.update(chunk.subarray(0, read))
    return { hash: sum.digest('hex').slice(0, 16), why: null }
  } finally {
    closeSync(fd)
  }
}

/** The marked copy the runtime actually reads, rather than the lockfile a checkout holds today. */
function theInstalledPackageHash(instanceDir, repo) {
  try {
    const modules = realpathSync(join(repo, 'node_modules'))
    const copy = dirname(modules)
    if (dirname(copy) !== realpathSync(join(instanceDir, PACKAGE_COPIES)) || basename(modules) !== 'node_modules') return null
    const hash = theLockfileHash(copy).hash
    return hash !== null && basename(copy) === hash && existsSync(join(copy, 'installed')) ? hash : null
  } catch { return null }
}

/**
 * THE SCRIPT ownPackagesAndOrigin RUNS IN THE SANDBOX'S CONTAINER, as the container's user, with HOME in the instance
 * folder, so npm's install scripts run inside the sandbox that chose the lockfile and never on the host. Its arguments:
 * repo, instance folder, checkout, the mirror or "-", "yes" to stop borrowing objects, "install" or "unlink" or "-",
 * then each worktree whose node_modules links into the checkout. The lockfile's hash is worked out here, never passed
 * in (see ownPackagesAndOrigin). Each line it prints is said by the launcher; it exits 1 when any part failed, and every
 * other part is still done.
 */
const OWN_PACKAGES_AND_ORIGIN = String.raw`set -u
repo=$1 dir=$2 from=$3 mirror=$4 alternates=$5 packages=$6
shift 6
failed=0
next="$dir/.node-modules-link-$$"
intoFrom() { case "$1" in "$from"|"$from"/*) return 0 ;; esac; return 1; }
if [ "$mirror" != - ]; then
  if [ ! -f "$mirror/HEAD" ]; then
    echo "the origin of $repo still names $(git -C "$repo" config --get remote.origin.url || echo nothing): the mirror $mirror is not in this container, which was started before there was one. Down and up gives it the mirror."
  else
    if git -C "$repo" config --get remote.origin.url >/dev/null; then how=set-url; else how=add; fi
    if git -C "$repo" remote "$how" origin "$mirror"; then echo "the origin of $repo is now $mirror, the read-only mirror of main."
    else echo "the origin of $repo could not be set to $mirror."; failed=1; fi
  fi
fi
if [ "$alternates" = yes ]; then
  info="$repo/.git/objects/info"
  if git -C "$repo" repack -a -d -q && mv "$info/alternates" "$info/alternates.before-2f"; then
    if missed=$(git -C "$repo" fsck --connectivity-only --no-dangling --no-progress 2>&1); then
      rm -f "$info/alternates.before-2f"
      echo "$repo borrows no objects from $from any more: they were copied into it, and its alternates file was removed."
    else
      mv "$info/alternates.before-2f" "$info/alternates"
      echo "$repo still borrows objects from $from: without its alternates file git missed some ($(printf '%s' "$missed" | head -n 1)), so the file was put back."
      failed=1
    fi
  else
    echo "$repo still borrows objects from $from: they could not be copied into it, so its alternates file was left."
    failed=1
  fi
fi
if [ "$packages" = install ]; then
  hash=$(sha256sum < "$repo/package-lock.json" | cut -c 1-16)
  [ -n "$hash" ] || echo "$repo/package-lock.json could not be read in this container."
  copies="$dir/node-modules" copy="$dir/node-modules/$hash"
  log="$dir/logs/npm-ci-$hash-$(date +%Y%m%d-%H%M%S).log"
  if [ -n "$hash" ] && mkdir -p "$copies" "$dir/logs" && (
    flock 9 || exit 1
    [ -f "$copy/installed" ] && exit 0
    rm -rf "$copy" && mkdir "$copy" && cp "$repo/package.json" "$repo/package-lock.json" "$copy/" || exit 1
    if [ "$(sha256sum < "$copy/package-lock.json" | cut -c 1-16)" != "$hash" ]; then
      echo "$repo/package-lock.json changed while it was being read, so nothing was installed from it."
      exit 1
    fi
    (cd "$copy" && npm ci --no-audit --no-fund) > "$log" 2>&1 || { echo "npm ci failed in $copy; its log is $log."; exit 1; }
    electron="$copy/node_modules/electron"
    if [ -d "$electron" ] && { [ ! -d "$electron/dist" ] || [ ! -e "$electron/path.txt" ]; }; then
      (cd "$copy" && node node_modules/electron/install.js) >> "$log" 2>&1
      install_exit=$?
      if [ ! -d "$electron/dist" ] || [ ! -e "$electron/path.txt" ]; then
        echo "Electron's program is still missing in $copy after $electron/install.js exited $install_exit; its log is $log."
      fi
    fi
    : > "$copy/installed"
    echo "npm ci installed $repo/package-lock.json into $copy; its log is $log."
  ) 9> "$copies/.lock" && rm -f "$next" && ln -s "$copy/node_modules" "$next" && mv -Tf "$next" "$repo/node_modules"; then
    echo "$repo/node_modules is $copy/node_modules, the sandbox's own."
  else
    failed=1
    before=$(readlink "$repo/node_modules" || true)
    if [ -n "$before" ] && intoFrom "$before"; then
      rm -f "$repo/node_modules"
      echo "no packages were installed for $repo, and its node_modules, which linked to $before, was removed: a sandbox never uses the checkout's."
    else
      [ -n "$before" ] || before="not there"
      echo "no packages were installed for $repo; its node_modules is $before as before."
    fi
  fi
elif [ "$packages" = unlink ]; then
  before=$(readlink "$repo/node_modules")
  rm -f "$repo/node_modules" && echo "$repo/node_modules, which linked to $before, was removed: a sandbox never uses the checkout's, and this one installs none (it has no lockfile it can read, or no network)." || failed=1
fi
for tree in "$@"; do
  if [ -e "$repo/node_modules" ]; then
    rm -f "$next" && ln -s "$repo/node_modules" "$next" && mv -Tf "$next" "$tree/node_modules" && echo "$tree/node_modules now links to $repo/node_modules." || { echo "$tree/node_modules still links into $from."; failed=1; }
  else
    rm -f "$tree/node_modules" && echo "$tree/node_modules, which linked into $from, was removed." || failed=1
  fi
done
exit $failed
`

/**
 * ITS OWN NODE_MODULES AND ITS OWN ORIGIN (item 2f; see the header). The host looks, without running anything in the
 * sandbox, for what is not so yet: repo/'s origin not the mirror, an alternates file, a lockfile whose copy is not
 * installed or not linked, a node_modules link into the checkout in repo/ or one of its worktrees. When it finds
 * nothing, nothing runs. When it finds something, one docker exec runs OWN_PACKAGES_AND_ORIGIN for those parts only.
 *
 * WHERE NPM CI RUNS, and why not on the host: a run in the sandbox can write repo/'s package.json and lockfile, and npm
 * ci runs the install scripts of the packages they name, so an install on the host would run code the sandbox chose with
 * the host's rights. The host reads only the lockfile's hash, and only to decide whether the script runs. The container
 * works the hash out again itself, copies the two files into node-modules/<hash>/, checks the copy's hash, and installs
 * there. No hash the host worked out goes into the container: a run could swap repo/ for a link between the host's look
 * and its read, and the host would then have read a file of the run's choosing. A sandbox with no network installs
 * nothing.
 *
 * A CHANGED LOCKFILE is noticed by its hash: node-modules/<hash>/installed is written only after npm ci exits 0, and
 * repo/node_modules must link to node-modules/<hash>/node_modules. Main is brought forward first (refreshMainBeforeRun),
 * so a lockfile main changed is installed before the run. Older copies are kept. A failed install keeps the link it
 * had, unless that link went into the checkout, and the run still starts.
 *
 * AN INSTANCE MADE BEFORE item 2f has a node_modules link into the checkout, an origin that is the checkout and an
 * alternates file that names its objects; its next start sets all three right. Its origin needs the mirror inside the
 * container, and a container started before item 2f has none: that is said at each start until the sandbox is brought
 * down and up again.
 * An explicit repo scopes a fresh repair to its new worktree; older worktrees and their package links stay untouched.
 * @param {{ dir: string, container: string, from: string, mirror: string | null, network: string | null, repo?: string }} sandbox
 */
function ownPackagesAndOrigin({ dir, container, from, mirror, network, repo = join(dir, 'repo') }) {
  let aFolder = false
  try { aFolder = lstatSync(repo).isDirectory() } catch { aFolder = false }
  if (!aFolder) { say(`${repo} is not a folder, so its node_modules and origin were left as they are.`); return }
  /** @param {string} link */
  const whereItLinks = (link) => { try { return lstatSync(link).isSymbolicLink() ? resolve(dirname(link), readlinkSync(link)) : 'a folder' } catch { return null } }

  const origin = guardedRun(repo, ['config', '--get', 'remote.origin.url'], { timeout: 30_000 })
  const originTo = mirror !== null && existsSync(join(mirror, 'HEAD')) && !(origin.status === 0 && origin.stdout.trim() === mirror) ? mirror : null
  const borrows = (() => { try { lstatSync(join(repo, '.git', 'objects', 'info', 'alternates')); return true } catch { return false } })()

  const lockfile = theLockfileHash(repo)
  if (lockfile.why !== null) say(lockfile.why)
  const linked = whereItLinks(join(repo, 'node_modules'))
  const intoTheCheckout = linked !== null && linked !== 'a folder' && within(linked, from)
  let packages = null
  if (linked === 'a folder') say(`${repo}/node_modules is a folder, not a link, so it is kept as it is.`, true)
  else if (lockfile.hash !== null && network !== 'none') {
    const copy = join(dir, PACKAGE_COPIES, lockfile.hash)
    if (linked !== join(copy, 'node_modules') || !existsSync(join(copy, 'installed'))) packages = 'install'
  } else if (intoTheCheckout) packages = 'unlink'
  if (linked === null && lockfile.hash !== null && network === 'none') say(`${repo} has a package-lock.json and no node_modules: a sandbox with no network installs none.`)

  const trees = []
  const listed = repo === join(dir, 'repo')
    ? guardedRun(repo, ['worktree', 'list', '--porcelain'], { timeout: 30_000 })
    : { status: 0, stdout: '' }
  for (const line of listed.status === 0 ? listed.stdout.split('\n') : []) {
    const tree = line.startsWith('worktree ') ? line.slice('worktree '.length) : null
    if (tree === null || tree === repo || !within(tree, dir)) continue
    const to = whereItLinks(join(tree, 'node_modules'))
    if (to !== null && to !== 'a folder' && within(to, from)) trees.push(tree)
  }

  if (originTo === null && !borrows && packages === null && trees.length === 0) return
  const done = spawnSync('docker', [
    'exec', '-e', `HOME=${join(dir, 'home')}`, '-w', dir, container,
    'sh', '-c', OWN_PACKAGES_AND_ORIGIN, 'sh', repo, dir, from, originTo ?? '-', borrows ? 'yes' : 'no', packages ?? '-', ...trees,
  ], { encoding: 'utf8', timeout: 20 * 60_000, maxBuffer: 16 * 1024 * 1024 })
  for (const line of `${done.stdout ?? ''}\n${done.stderr ?? ''}`.split('\n')) if (line.trim() !== '') say(line.trim())
  if (done.status !== 0) {
    say(`setting the node_modules and origin of ${repo} did not all succeed (${done.error?.message ?? (done.signal === null ? `exit ${String(done.status)}` : `stopped by ${done.signal}`)}); what was done is said above, and the rest is as it was.`)
  }
}

/**
 * Read the helper inside this sandbox's own trust boundary. Its marker guards correctness, not the host:
 * a run that rewrites its helper changes only its own sandbox. Current plain starts never refresh main.
 */
function checkHelperPermissions(sb, refreshed = false) {
  const current = () => Number(/^export const PERMISSIONS_CONTRACT = (\d+);?$/mu.exec(readFileSync(sb.helper, 'utf8'))?.[1] ?? 0) >= 2
  if (current()) return
  if (!refreshed) {
    refreshMainBeforeRun(sb)
    if (current()) return
  }
  refuse(`This sandbox's helper is older than the launcher's permissions contract (its repo's main could not be moved: ${sb.mainRefreshReason}). Refresh its repo, or recreate the sandbox, then start again.`, 2)
}

/** The main checkout of the repository `dir` is in: the folder above the common .git directory. */
function mainCheckoutOf(dir) {
  const r = guardedRun(dir, ['rev-parse', '--path-format=absolute', '--git-common-dir'])
  if (r.status !== 0) refuse(`${dir} is not in a git repository, so there is no checkout to make a sandbox from: ${r.stderr.trim()}`)
  return dirname(r.stdout.trim())
}

// ============================================================================ the template

/**
 * A TEMPLATE: a folder holding devcontainer.json and sandbox.json. Named, it is `sandboxes/<name>/`
 * in this checkout; given as an absolute path, it is that folder. Its name is the one sandbox.json
 * declares, which is what a run's sandbox field records.
 */
function theTemplate(nameOrPath) {
  const dir = isAbsolute(nameOrPath) ? nameOrPath : join(REPO_ROOT, 'sandboxes', nameOrPath)
  const read = (file) => {
    const path = join(dir, file)
    if (!existsSync(path)) refuse(`${dir} is not a sandbox template: it has no ${file}. The templates are the folders under sandboxes/.`, 2)
    try {
      return JSON.parse(readFileSync(path, 'utf8'))
    } catch (why) {
      refuse(`${path} cannot be read as JSON: ${why instanceof Error ? why.message : String(why)}`)
    }
  }
  const devcontainer = read('devcontainer.json')
  const office = read('sandbox.json')
  if (typeof office.template !== 'string' || office.template === '') refuse(`${join(dir, 'sandbox.json')} names no template.`)
  if (!isAbsolute(nameOrPath) && office.template !== nameOrPath) {
    refuse(`sandboxes/${nameOrPath}/sandbox.json says it is the template "${office.template}". The folder and the name must agree.`)
  }
  return { dir, name: office.template, devcontainer, office }
}

/** One mount string, `type=bind,source=…,target=…,readonly`, as its parts. */
function parseMount(text) {
  const mount = { raw: text, type: null, source: null, target: null, readonly: false }
  for (const part of String(text).split(',')) {
    const [key, ...rest] = part.split('=')
    const value = rest.join('=')
    if (key === 'type') mount.type = value
    else if (key === 'source' || key === 'src') mount.source = value
    else if (key === 'target' || key === 'destination' || key === 'dst') mount.target = value
    else if (key === 'readonly' || key === 'ro') mount.readonly = rest.length === 0 || value === 'true' || value === '1'
  }
  return mount
}

/** Put the two inputs the template takes into a string, as the devcontainer CLI will. */
function withInputs(text, inputs) {
  return String(text).replace(/\$\{localEnv:([A-Z_]+)\}/g, (whole, name) => inputs[name] ?? whole)
}

/**
 * EVERY MOUNT OF THE TEMPLATE, WITH THE INPUTS PUT IN, AND WHAT MUST EXIST FOR DOCKER TO MAKE IT.
 *
 * Docker cannot make a mount point inside a read-only bind, so a mount whose target is inside one
 * needs that path to exist on the host already; a bind needs its source. Missing either, the start
 * fails with a mount error that does not say which (piece P1 measured it). This names the path first.
 */
function theTemplateMounts(template, inputs, madeByTheLauncher) {
  const texts = [template.devcontainer.workspaceMount, ...(template.devcontainer.mounts ?? [])].filter((m) => typeof m === 'string')
  const mounts = texts.map((text) => parseMount(withInputs(text, inputs)))
  for (const m of mounts) {
    if (m.target === null || m.target.includes('${') || (m.source ?? '').includes('${')) {
      refuse(`The template's mount "${m.raw}" takes an input this launcher does not give, so it cannot be checked. Nothing was done.`)
    }
  }
  const readOnlyBinds = mounts.filter((m) => m.type === 'bind' && m.readonly)
  const missing = []
  for (const m of mounts) {
    if (m.type === 'bind' && !within(m.source, madeByTheLauncher) && !existsSync(m.source)) missing.push(`${m.source} (the source of a mount)`)
    for (const outer of readOnlyBinds) {
      if (outer === m || !within(m.target, outer.target) || m.target === outer.target) continue
      const onHost = join(outer.source, relative(outer.target, m.target))
      if (!existsSync(onHost)) missing.push(`${onHost} (a mount point inside the read-only ${outer.target})`)
    }
  }
  return { mounts, missing: [...new Set(missing)] }
}

/**
 * WHAT IS MOUNTED BACK INSIDE A FOLDER THE SANDBOX COVERS, one sentence each, or none.
 *
 * A tmpfs in a sandbox covers a host folder, so that nothing of that folder is seen inside: the
 * checkout's data folder is covered because the live database and the office's key file are there.
 * A second mount inside that folder brings part of it back. Until acceptance finding 13 the template
 * did exactly this with the key file, "so the dsh hooks could read the office key", and the file
 * holds the person's key as well, so every process in a sandbox could act as the person.
 *
 * It is asked of the template's own mounts before `up` writes anything, and of a running
 * container's mounts, as docker reports them, before `exec` starts anything. The second is what
 * finds a sandbox started before the template changed: its container still has the mount.
 *
 * `mounts` is `[{type, target}]`; docker's own `{Type, Destination}` is mapped by the caller.
 */
function mountedInsideACover(mounts) {
  const covers = mounts.filter((m) => m.type === 'tmpfs' && typeof m.target === 'string')
  const found = []
  for (const m of mounts) {
    for (const cover of covers) {
      if (m === cover || typeof m.target !== 'string' || m.target === cover.target || !within(m.target, cover.target)) continue
      found.push(`${m.target} is mounted (${m.type}) inside ${cover.target}, which the sandbox covers so that nothing of it is seen there`)
    }
  }
  return found
}

/**
 * WHAT WOULD LET A SANDBOX WRITE THE GATE-COUNT SPOOL, one sentence each, or none (wave 13n round Y, item 2l).
 *
 * The office counts each line in the spool as a gate a sandbox tool met on the host, so a sandbox that could write
 * there could make counts up. A bind that is not read-only is found when its source is the spool, is inside it or
 * holds it, by the path as written and on disk (howAPathMeets). A read-only bind is let through, since a line read is
 * not a line written, and so is a bind beside the spool, as the instance folder and the mirror are. The spool is the
 * one this machine's tools write, under the home, whatever --sandboxes says.
 *
 * It is asked of the template's own mounts before `up` writes anything, of the container docker made, and of a running
 * container's mounts before `exec` starts anything. `mounts` is `[{type, source, target, readonly}]`; docker's own
 * `{Type, Source, Destination, RW}` is mapped by the caller.
 */
function theSpoolWritableThrough(mounts) {
  const found = []
  for (const m of mounts) {
    if (m.type !== 'bind' || m.readonly || typeof m.source !== 'string' || !isAbsolute(m.source)) continue
    const how = howAPathMeets(m.source, THE_GATE_COUNT_SPOOL_FOLDER)
    if (how !== null) found.push(`the bind of ${m.source} at ${m.target}, which ${how} the gate-count spool ${THE_GATE_COUNT_SPOOL_FOLDER}, is not read-only`)
  }
  return found
}

/** Docker's account of a container's mounts, in the shape the mount checks take. */
function theMountsOf(container) {
  return (container.Mounts ?? []).map((m) => ({ type: m.Type, source: m.Source, target: m.Destination, readonly: m.RW === false }))
}

// ============================================================================ the ledger

/**
 * RELEASE ONE LEDGER ROW THROUGH THE OFFICE'S OWN DOOR, which is what stops a container or a
 * process group. Force is sent when the caller IS the session that registered the row, which is
 * stopping its own sandbox, or when the caller said --force. How the door is asked, and how its
 * confirmation sentence is sent back, is sandbox-common.mjs's `releaseThroughTheLedger`.
 */
async function releaseThroughTheLedger(rowId, { force, note, workspace, who }) {
  return releaseTheRow(api, rowId, {
    force,
    note,
    headers: officeHeaders({ workspace, agent: who.agent, session: who.session }),
    told: (sentence) => say(`the ledger stops it on this confirmation: ${sentence}`),
  })
}

/**
 * THE CALLER'S NAME ON A READ OF THE LEDGER, when the caller has one (acceptance finding 67). On 24 September 2026 the
 * slow reads came with no name at all, so nobody could say whose loop asked. `up` and `down` always know who is asking.
 * `status` only reads, and a person may run it at a terminal where no agent is set, so it names a caller that said who
 * it is and asks without a name otherwise: a loop is an agent's, and an agent has its name set.
 */
function theCallerNamed(workspace, who) {
  if (who === null) return {}
  const headers = officeHeaders({ workspace, agent: who.agent, session: who.session ?? '' })
  // AN AGENT THAT NAMED NO SESSION IS NAMED WITHOUT ONE: the office takes an actor with no session header, and
  // refuses a blank one (src/server/lib/http.ts).
  if (who.session === null) delete headers['x-mole-office-session']
  return headers
}

/**
 * Who is asking, when the caller said; null when it named no agent. `status` asks this and never refuses. AN AGENT
 * THAT NAMED NO SESSION IS STILL THAT AGENT: until acceptance finding 70 it was sent with no name at all, and the office
 * files a call that names nobody as the person (chapter 4 rule 1).
 */
function whoIsAskingIfSaid() {
  const { agent, session } = whoTheCallerSaid()
  return agent === null ? null : { agent, session }
}

/**
 * THE LEDGER'S OPEN ROWS, AND NOTHING ELSE. `GET /api/resources` answers only rows whose `releasedAt`
 * is null; the launcher never asks for the whole history with `?includeReleased=true`, only, once, for one session's
 * rows (theContainerRowNamed). On 24 September 2026 that history took a median of 21.4 seconds and at most 47 seconds, because it built a report for
 * every row the ledger had ever held, while the open rows took a median of 0.4 seconds, and the office
 * answered nothing else meantime (acceptance finding 67). A closed row is not answered here at all, so
 * a row that is missing is either closed or was never written, and the launcher cannot tell those
 * apart.
 */
async function theLedger(workspace, who) {
  const reply = await askTheOffice(api, '/api/resources', { workspace, headers: theCallerNamed(workspace, who) })
  if (reply.status !== 200 || !Array.isArray(reply.body?.resources)) return { rows: null, why: theOfficeSaid(reply) }
  return { rows: reply.body.resources, why: null }
}

// HOW LONG A DOWN WAITS FOR THE LEDGER WHEN NOTHING ANSWERS, and how often it asks again: THE_LONGEST_WAIT_FOR_THE_LEDGER_MS
// and BETWEEN_LEDGER_TRIES_MS in tools/sandbox-common.mjs (acceptance finding 64), which the process row's registration
// uses too, and so does a hand start at its first ask. Only silence is waited on here: a refusal is an answer, and is said
// at once. The asks that go through askTheOfficeWhileItRestarts wait on a refused connection and on the stand-in's 503.

/** The ledger, as theLedger reads it, asked again while nothing answers, up to the longest wait, saying each wait. */
async function theLedgerWhenItAnswers(workspace, who, until = Date.now() + THE_LONGEST_WAIT_FOR_THE_LEDGER_MS) {
  for (;;) {
    const reply = await askTheOffice(api, '/api/resources', { workspace, headers: theCallerNamed(workspace, who) })
    if (reply.status !== null) {
      if (reply.status !== 200 || !Array.isArray(reply.body?.resources)) return { rows: null, why: theOfficeSaid(reply) }
      return { rows: reply.body.resources, why: null }
    }
    if (Date.now() + BETWEEN_LEDGER_TRIES_MS > until) {
      return { rows: null, why: `${theOfficeSaid(reply)}, and still nothing after asking again for ${String(THE_LONGEST_WAIT_FOR_THE_LEDGER_MS / 1000)} seconds` }
    }
    say(`the ledger did not answer (${reply.why}); asking again in ${String(BETWEEN_LEDGER_TRIES_MS / 1000)} seconds`)
    await new Promise((go) => setTimeout(go, BETWEEN_LEDGER_TRIES_MS))
  }
}

/** Every start.json under an instance's logs/, oldest first. */
function theStarts(dir) {
  const logs = join(dir, 'logs')
  if (!existsSync(logs)) return []
  const starts = []
  for (const entry of readdirSync(logs, { withFileTypes: true })) {
    const file = join(logs, entry.name, 'start.json')
    if (!entry.isDirectory() || !existsSync(file)) continue
    try {
      starts.push({ label: entry.name, ...JSON.parse(readFileSync(file, 'utf8')) })
    } catch {
      starts.push({ label: entry.name, unreadable: `${file} is not JSON` })
    }
  }
  return starts.sort((a, b) => String(a.startedAt ?? '').localeCompare(String(b.startedAt ?? '')))
}

// ============================================================================ up

/** Whether run arguments ask for a GPU: `--gpus=x`, or `--gpus` followed by its value. */
function asksForTheGpu(args) {
  return args.some((arg) => /^--gpus(=|$)/.test(String(arg)))
}

/** Run arguments without any GPU request: `--gpus=x`, or `--gpus` followed by its value. Nothing else is taken out. */
function withoutTheGpu(args) {
  const kept = []
  for (let i = 0; i < args.length; i += 1) {
    const one = String(args[i])
    if (one === '--gpus') {
      i += 1
      continue
    }
    if (one.startsWith('--gpus=')) continue
    kept.push(args[i])
  }
  return kept
}

/**
 * Run arguments taken apart into the network they set and the rest: `--network=x`, `--net=x`, or either flag followed by
 * its value. `network` is the last one set, as docker takes it, or undefined when none is.
 */
function theNetworkApart(args) {
  const others = []
  let network
  for (let i = 0; i < args.length; i += 1) {
    const one = String(args[i])
    if (one === '--network' || one === '--net') {
      network = args[i + 1] === undefined ? network : String(args[i + 1])
      i += 1
      continue
    }
    if (one.startsWith('--network=') || one.startsWith('--net=')) {
      network = one.slice(one.indexOf('=') + 1)
      continue
    }
    others.push(args[i])
  }
  return { network, others }
}

async function commandUp() {
  const [templateName, extra] = chosen.targets
  if (templateName === undefined || extra !== undefined) usage('Say which template, once: node tools/sandbox.mjs up <template> --name <instance>.')
  if (chosen.name === undefined) usage('Say what to call this sandbox: --name <instance>.')
  if (chosen.rw !== undefined) {
    refuse(
      `A sandbox takes extra folders read-only, never read-write (the template's rule: mounts.extra.whenAskedForWritable ` +
        `is "refuse"). Its one writable place is its own folder; what it makes comes back through the merge queue. ` +
        `Pass ${chosen.rw} with --ro, or copy what is needed into the instance folder. Nothing was done.`,
      2,
    )
  }
  for (const label of chosen.label) if (!/^[a-z0-9.-]+=[^\s,]*$/.test(label)) refuse(`--label takes key=value, and "${label}" is not that.`, 2)
  // A NETWORK OF ITS OWN, WHEN ASKED (acceptance finding 77, 25 September 2026). The template
  // puts the container on the host's network, so a merge sandbox's tests could reach the live office on the host's
  // loopback, where the open key window takes the person's headers without a key. Asked before anything is written.
  if (chosen.network !== undefined && !NETWORKS.includes(chosen.network)) {
    refuse(`--network takes none, bridge or host, and "${chosen.network}" is none of them. Nothing was done.`, 2)
  }
  const who = whoIsAsking()
  const workspace = whichWorkspace(chosen.workspace)
  const template = theTemplate(templateName)
  // THE LIMITS IT RUNS WITH, read before anything is written: the owner's defaults, or the template's declared raises, or
  // for a merge sandbox its merge raise (theLimitsOfASandbox). A template's runArgs may not set them itself.
  if (setsALimitItself(template.devcontainer.runArgs ?? [])) {
    refuse(`${join(template.dir, 'devcontainer.json')} sets a memory, CPU or process limit in its runArgs. Only the launcher sets them: declare a raise under "raises" in sandbox.json, with its reason. Nothing was done.`)
  }
  // The name comes first, since a raise refused for its reason is counted under it.
  const name = chosen.name
  const dir = instanceFolder(name)
  noApiKeyInTheLoginFilesOf(name, dir)
  const labelValues = Object.fromEntries(chosen.label.map((label) => { const at = label.indexOf('='); return [label.slice(0, at), label.slice(at + 1)] }))
  let limits, raised
  try {
    ({ limits, raised } = theLimitsOfASandbox(template.office, join(template.dir, 'sandbox.json'), name, labelValues))
  } catch (why) {
    refuse(`${why instanceof Error ? why.message : String(why)} Nothing was done.`)
  }
  // THE GPU THE TEMPLATE ASKS FOR, left out of this container with --no-gpu, for work that needs no CUDA. A container that
  // asks for no GPU needs no overlap reminder.
  const templateAsksForTheGpu = asksForTheGpu(template.devcontainer.runArgs ?? [])
  const gpuLeftOut = chosen['no-gpu'] === true && templateAsksForTheGpu
  if (chosen['no-gpu'] === true && !templateAsksForTheGpu) say(`--no-gpu: the template ${template.name} asks for no GPU, so nothing was left out.`)
  if (templateAsksForTheGpu && !gpuLeftOut) await remindOfOtherGpuSandboxes(name, workspace, who)
  // A NEW CONTAINER MAY TAKE ITS WHOLE LIMIT, so that and the margin must be available (roomInMemory).
  roomInMemory(bytesOfAMemoryFigure(limits.memory) ?? 0, 0, `sandbox ${name}`)
  const hostOnly = hostOnlyFolder(name)
  // A LAUNCHER IN THE STABLE CHECKOUT IS TOLD ITS SOURCE. The bootstrap makes the stable checkout a linked worktree of the
  // development repository, so the main checkout of the launcher's own is that repository, and without --from the
  // sandbox would be made from it with nothing said and nothing refused below.
  const launcherIn = chosen.from === undefined ? whyAPathIsTheStableCheckout(REPO_ROOT) : null
  if (launcherIn !== null) refuse(`This launcher is in the stable checkout, and --from names no checkout: ${launcherIn} A sandbox the stable office starts names the development checkout with --from. Nothing was done.`, 2)
  const from = chosen.from === undefined ? mainCheckoutOf(REPO_ROOT) : resolve(chosen.from)
  const containerName = `${CONTAINER_PREFIX}${name}`
  const home = homedir()

  // THE STABLE CHECKOUT NEVER GOES INTO A SANDBOX (whyAPathIsTheStableCheckout), whether --from names it or the launcher
  // itself is in it.
  const stableFrom = whyAPathIsTheStableCheckout(from)
  if (stableFrom !== null) refuse(`The checkout ${chosen.from === undefined ? 'the launcher itself is in' : '--from names'}: ${stableFrom} Name another with --from. Nothing was done.`, 2)

  // WHERE THE WRITABLE FOLDER IS. It is always one new name under the sandboxes folder; it must still
  // not be, or hold, the owner's home or the checkout, which docker would then mount read-write.
  if (within(home, dir) || within(from, dir) || within(dir, from)) {
    refuse(`The instance folder ${dir} would be, hold or sit inside ${within(home, dir) ? 'the home directory' : 'the checkout'}. Choose another --sandboxes. Nothing was done.`, 2)
  }

  // A READ-ONLY CHECKOUT STILL EXPOSES ITS CONFIGURATION. Find env files at every up without reading
  // their contents. A link or another non-regular path cannot safely take a file cover, so refuse it.
  let checkoutEnvFiles
  try {
    checkoutEnvFiles = readdirSync(from)
      .filter(name => (name === '.env' || name.startsWith('.env.')) && name !== '.env.example')
      .map(name => join(from, name))
  } catch (why) {
    refuse(`The checkout ${from} could not be checked for env files: ${why.message}. Nothing was started.`)
  }
  for (const path of checkoutEnvFiles) {
    let regular
    try { regular = lstatSync(path).isFile() }
    catch (why) { refuse(`The checkout env file ${path} could not be checked: ${why.message}. Nothing was started.`) }
    if (!regular) refuse(`The checkout env file ${path} cannot be covered because it is not a regular file. Nothing was started.`)
    if (/[,\r\n]|\$\{/.test(path)) refuse(`The checkout env file ${path} cannot be covered because its path cannot be written in a container mount. Nothing was started.`)
  }

  // THE MIRROR OF THE CHECKOUT'S MAIN (item 2f): the clone's origin, mounted read-only at its own path. One for every
  // sandbox made from this checkout, beside the instance folders (theMainMirrorOf in tools/sandbox-common.mjs).
  const mirror = theMainMirrorOf(sandboxes, from)

  // THE EXTRA FOLDERS, read-only and at the same path. Each must exist as itself (no symlink, so the
  // path inside means the same folder), and must not bring back what the template keeps out.
  const inputs = { SANDBOX_DIR: dir, SANDBOX_MAIN_CHECKOUT: from }
  const { mounts: templateMounts, missing } = theTemplateMounts(template, inputs, dir)
  const putBack = mountedInsideACover(templateMounts)
  if (putBack.length > 0) {
    refuse(
      `The template ${template.name} mounts something back inside a folder it covers: ${putBack.join('; ')}. ` +
        "The office's key file, which holds the person's key, was once let into every sandbox this way. " +
        `Take that mount out of ${join(template.dir, 'devcontainer.json')}. Nothing was done.`,
    )
  }
  const spoolWritable = theSpoolWritableThrough(templateMounts)
  if (spoolWritable.length > 0) {
    refuse(
      `The template ${template.name} would let the sandbox write the gate-count spool, in which the office counts each gate a sandbox tool meets on the host: ` +
        `${spoolWritable.join('; ')}. Make each such mount read-only, or take it out of ${join(template.dir, 'devcontainer.json')}. Nothing was done.`,
    )
  }
  const readOnly = []
  for (const given of chosen.ro) {
    if (!isAbsolute(given)) refuse(`--ro takes an absolute path, and "${given}" is not one. Nothing was done.`, 2)
    const path = resolve(given)
    if (!existsSync(path)) refuse(`--ro ${path}: nothing is there. Nothing was done.`, 2)
    if (realpathSync(path) !== path) refuse(`--ro ${path} goes through a symbolic link to ${realpathSync(path)}; name that path instead, so the path inside is the same folder. Nothing was done.`, 2)
    if (path === '/' || within(home, path)) refuse(`--ro ${path} would bring the whole home directory into the sandbox, which it keeps out on purpose. Name the folder that is needed. Nothing was done.`, 2)
    const stableRo = whyAPathIsTheStableCheckout(path)
    if (stableRo !== null) refuse(`--ro ${stableRo} Nothing was done.`, 2)
    const dataRo = whyAPathIsTheOfficesDataFolder(path)
    if (dataRo !== null) refuse(`--ro ${dataRo} Nothing was done.`, 2)
    const overlaps = [dir, mirror, ...templateMounts.map((m) => m.target)].find((t) => within(path, t) || within(t, path))
    if (overlaps !== undefined) {
      refuse(`--ro ${path} overlaps ${overlaps}, which the sandbox already mounts in its own way (the instance folder, the mirror of main, the checkout, or what the template covers). Nothing was done.`, 2)
    }
    readOnly.push(path)
  }
  if (missing.length > 0) {
    refuse(
      `Docker could not start this sandbox, because ${missing.length === 1 ? 'this is' : 'these are'} missing on this machine: ` +
        `${missing.join('; ')}. A node_modules/.vite-temp folder is made by running Vite once on the host. Nothing was done.`,
    )
  }

  // AN INSTANCE ALREADY THERE is started again with its folder as it is, if it is the same template
  // and its container is not running. Its clone and dsh copy are kept, never overwritten.
  const { facts: before, refused: notTaken } = await theFactsTheHostReads(name, who)
  if (notTaken !== null) refuse(notTaken)
  if (before !== null && before.template !== template.name) {
    refuse(`The sandbox ${name} was made from the template ${before.template}, not ${template.name}. Choose another --name. Nothing was done.`, 2)
  }
  if (before?.clearedAt) refuse(`The sandbox ${name} was cleared, so its folder cannot be started again; choose another --name. Nothing was started.`)
  const existing = inspectContainer(containerName)
  if (existing !== null) {
    refuse(
      existing.State?.Running
        ? `The sandbox ${name} is already up, as container ${containerName} (${String(existing.Id).slice(0, 12)}). node tools/sandbox.mjs status ${name} says what is in it.`
        : `A stopped container ${containerName} (${String(existing.Id).slice(0, 12)}) from an earlier start is still there. node tools/sandbox.mjs down ${name} removes it; then start again.`,
    )
  }

  // ---------------------------------------------------------------- the folder
  const ref = chosen.ref ?? (() => {
    const r = guardedRun(from, ['symbolic-ref', '--short', 'HEAD'])
    if (r.status !== 0) refuse(`${from} has no branch checked out, so say which one the sandbox is on: --ref <branch>.`, 2)
    return r.stdout.trim()
  })()
  for (const sub of ['home', 'logs', 'out', 'worktrees', 'briefs']) mkdirSync(join(dir, sub), { recursive: true })
  const attribution = noAttributionInCommits(join(dir, 'home'))
  if (attribution !== null) say(attribution)
  const keeps = aRunKeepsItsWorkers(join(dir, 'home'), theClaudeCodeVariablesInASandbox())
  if (keeps !== null) say(keeps)
  const shim = theNvmShim(join(dir, 'home'))
  if (shim !== null) say(shim)
  try { prepareOpenCodeHome(join(dir, 'home')) }
  catch (why) { refuse(why instanceof Error ? why.message : String(why)) }
  mkdirSync(hostOnly, { recursive: true, mode: 0o700 })
  const emptyEnvFile = join(hostOnly, 'empty-env')
  if (checkoutEnvFiles.length > 0) {
    const temporary = `${emptyEnvFile}.${randomBytes(8).toString('hex')}.writing`
    try {
      writeFileSync(temporary, '', { flag: 'wx', mode: 0o444 })
      chmodSync(temporary, 0o444)
      renameSync(temporary, emptyEnvFile)
    } catch (why) {
      refuse(`The checkout env files ${checkoutEnvFiles.join(', ')} cannot be covered because the empty host file ${emptyEnvFile} could not be prepared: ${why.message}. Nothing was started.`)
    }
  }
  const repo = join(dir, 'repo')
  // THE MIRROR IS MADE, OR BROUGHT FORWARD, FIRST (bringTheMainMirrorForward in tools/sandbox-git.mjs), so a new clone
  // is made from main as the checkout has it now, and a container is never given a mirror that is not there.
  const mirrored = bringTheMainMirrorForward(mirror, from, { make: true })
  if (mirrored.why !== null) refuse(`The mirror of the checkout's main could not be brought forward: ${mirrored.why}. Nothing is running.`)
  if (mirrored.made) say(`made ${mirror}, the mirror of the main of ${from} that every sandbox made from it fetches from.`)
  if (!existsSync(repo)) {
    // A CLONE OF THE MIRROR, NOT OF THE CHECKOUT (item 2f): its origin is the mirror, and --no-hardlinks copies every
    // object, so no file is shared with the mirror and no alternates file names one. A branch other than main is
    // fetched from the checkout by the path the host knows, as main is, and has no upstream: the mirror holds main only.
    let tip = null
    if (ref !== 'main') {
      const asked = guardedRun(from, ['rev-parse', '--verify', '--quiet', `refs/heads/${ref}^{commit}`])
      if (asked.status !== 0) refuse(`${from} has no branch ${ref}, so the sandbox cannot be on it. Name a branch with --ref. Nothing is running.`, 2)
      tip = asked.stdout.trim()
    }
    const cloned = run('git', ['clone', '-q', '--no-hardlinks', '--branch', 'main', mirror, repo])
    if (cloned.status !== 0) refuse(`The mirror ${mirror} could not be cloned into ${repo}: ${cloned.stderr.trim()}. Nothing is running.`)
    if (tip !== null) {
      const address = theAddressGitWouldFetch(repo, from)
      if (!address.isTheFolderItself) refuse(`The branch ${ref} was not fetched into ${repo}, because git there would fetch ${from} from ${address.address ?? 'an address it could not read'}. Nothing is running.`)
      const fetched = guardedRun(repo, ['fetch', '--quiet', '--no-tags', '--no-write-fetch-head', from, `+${tip}:refs/heads/${ref}`], { fromAFolder: true, timeout: 600_000 })
      if (fetched.status !== 0) refuse(`The branch ${ref} could not be fetched from ${from} into ${repo}: ${fetched.stderr.trim()}. Nothing is running.`)
      const switched = run('git', ['-C', repo, 'checkout', '-q', ref])
      if (switched.status !== 0) refuse(`${repo} could not be put on ${ref}: ${switched.stderr.trim()}. Nothing is running.`)
    }
  } else {
    say(`${repo} is already there and is kept as it is.`)
  }
  ensureLocalMainBranch(repo)
  // THE OFFICE'S RUN HOOKS, from this clone, into the instance's own Claude settings (see theOfficesRunHooks).
  const runHooks = theOfficesRunHooks(join(dir, 'home'), repo)
  if (runHooks !== null) say(runHooks)
  // THE TEMPLATE'S OTHER CLONES (see theTemplatesClones), each beside the office's own, as <instance>/<name>.
  const clones = theTemplatesClones(template, dir)
  const dshCopied = chosen['no-dsh'] ? { copied: false, says: '--no-dsh: no dsh folder was copied' } : copyTheDshFolder(chosen.dsh ?? DEFAULT_DSH, join(dir, 'dsh'))

  let facts = {
    instance: name,
    template: template.name,
    templateDir: template.dir,
    dir,
    from,
    ref,
    // THE TEMPLATE'S OTHER CLONES, each with the branch its source had checked out: an agent's worktree is cut from one
    // with --clone <name>, from that branch unless --cut-from says otherwise (theCloneNamed in tools/sandbox-common.mjs).
    clones,
    workspace,
    api,
    readOnly,
    labels: labelValues,
    container: { name: containerName, id: null },
    // THE NETWORK ASKED FOR with --network, or null when the template's own stands.
    network: chosen.network ?? null,
    // THE GPU LEFT OUT with --no-gpu, said only when the template asks for one; without it the template's runArgs stand.
    ...(gpuLeftOut ? { gpu: 'left out by --no-gpu: the template asks for the GPU, and this container was brought up without it' } : {}),
    containerRow: before?.containerRow ?? null,
    startedBy: who,
    // LOCAL WALL-CLOCK TIME (chapter 4 rule 8; acceptance finding 63). A sandbox made before 24 September 2026 carries
    // its createdAt in UTC, and it is carried as the moment it states; one that is no moment is carried as it is.
    createdAt: typeof before?.createdAt === 'string' && parseAnyStamp(before.createdAt) !== null ? localStamp(parseAnyStamp(before.createdAt)) : before?.createdAt ?? localStamp(new Date()),
    upAt: null,
  }
  writeInstance(dir, facts)

  // ---------------------------------------------------------------- 1. register, before it exists
  const headers = officeHeaders({ workspace, agent: who.agent, session: who.session })
  const { rows } = await theLedger(workspace, who)
  const held = (rows ?? []).find((r) => r.type === 'container' && r.key === containerName && r.releasedAt === null)
  let rowId
  if (held !== undefined && held.sessionRecordId !== who.session) {
    // A SESSION THAT IS OVER AND LEFT NO CONTAINER BEHIND IT still holds this row open, and every later up of the
    // sandbox would be refused until somebody released the row by hand. The row is released through the ledger, the
    // only door that closes what a row names, and this start then registers its own row as usual. Every other case
    // keeps the refusal and says what was found: the session's state, or the container that is still there.
    // "Over" is the ledger's own list, not every state a run is over in: the office marks a session orphaned by itself
    // after a silence, so that word does not say its process is gone, and the ledger releases such a row only with
    // force. This start never forces it, so it asks for no release the ledger would refuse.
    const read = await askTheOffice(api, `/api/records/${encodeURIComponent(held.sessionRecordId)}`, { workspace, headers: theCallerNamed(workspace, who) })
    const sessionState = read.status === 200 ? (read.body?.record ?? read.body)?.data?.state : undefined
    const sessionIsOver = read.status === 200 && THE_LEDGER_COUNTS_A_SESSION_OVER_IN.includes(sessionState)
    const container = sessionIsOver ? inspectContainer(held.key) : null
    if (sessionIsOver && container === null) {
      const note = `the session ${held.sessionRecordId} is ${String(sessionState)}, and docker knows no container called ${held.key}`
      const released = await releaseThroughTheLedger(held.id, { force: false, note, workspace, who })
      if (released.status !== 200) {
        refuse(`The ledger row ${held.id} for ${containerName} belongs to another session (${held.sessionRecordId}), and it is still open. Its release was refused (${theOfficeSaid(released)}). Nothing was started.`)
      }
      say(`the ledger row ${held.id} for ${containerName} was released because the session ${held.sessionRecordId} is ${String(sessionState)} and docker knows no container called ${held.key}.`)
    } else {
      const found = read.status !== 200
        ? `Its session record could not be read (${theOfficeSaid(read)}).`
        : container !== null
          ? `Its session is ${String(sessionState)}, and docker knows a container called ${held.key}, so the row was not released.`
          : A_RUN_IS_OVER_IN.includes(sessionState)
            ? `Its session is ${String(sessionState)}, and the ledger releases the row only after the session is marked finished or crashed.`
            : `Its session is ${String(sessionState)}.`
      refuse(`The ledger row ${held.id} for ${containerName} belongs to another session (${held.sessionRecordId}), and it is still open. ${found} Nothing was started.`)
    }
  }
  if (held !== undefined && held.sessionRecordId === who.session) {
    rowId = held.id
    say(`the ledger row ${rowId} for ${containerName} is still open under this session, and is used again.`)
  } else {
    const registered = await askTheOffice(api, '/api/resources', {
      method: 'POST',
      headers,
      body: {
        type: 'container',
        key: containerName,
        sessionRecordId: who.session,
        detail:
          // THE FOLDER IN THE WORDS A FILES SEAL READS BACK (src/config/sandbox-folder.mjs),
          // resolved as the launcher writes it on a run, so the two can never differ by a link.
          `Sandbox ${name}, from the template ${template.name}; ${theWordsNamingTheFolder(realpathSync(dir))} Started by node tools/sandbox.mjs up; ` +
          `stop it with node tools/sandbox.mjs down ${name}, which releases this row.`,
      },
    })
    if (registered.status !== 201) {
      refuse(`The ledger refused the container, so it was not started (${theOfficeSaid(registered)}).`)
    }
    rowId = registered.body.resource.id
  }
  facts = { ...facts, containerRow: rowId }
  writeInstance(dir, facts)

  // ---------------------------------------------------------------- 2. start it
  const labels = chosen.label
  const copy = structuredClone(template.devcontainer)
  if (copy.build !== undefined) {
    copy.build = {
      ...copy.build,
      dockerfile: resolve(template.dir, copy.build.dockerfile ?? 'Dockerfile'),
      context: resolve(template.dir, copy.build.context ?? '.'),
      options: [...(copy.build.options ?? []), ...labels.map((l) => `--label=${l}`)],
    }
  }
  // IN THE HOST'S TIME ZONE, the one the launcher itself runs in, so a day inside the sandbox means the operator's day as
  // it does in the office (chapter 4 rule 8). The image's own clock is UTC: for an hour each night a test inside and the
  // office disagreed about the date, and the queue passed a case that was already red on the host (acceptance finding
  // 62). Set on the container, not on each exec, so every process in it has it.
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
  if (typeof zone !== 'string' || zone === '') say('the launcher could not read its own time zone, so the sandbox keeps the image clock (UTC)')
  // THE NETWORK ASKED FOR REPLACES THE TEMPLATE'S, in this instance's copy only; without --network the template's stands.
  const offTheHostsNetwork = chosen.network !== undefined && chosen.network !== 'host'
  // A HOST NAME OF ITS OWN (aHostNameFor). Off the host's network the container resolves it through its hosts file
  // (theNamesAsTheHostHasThem). On the host's network it is given its own too, resolving to this machine.
  const hostName = aHostNameFor(containerName)
  const templateArgs = gpuLeftOut ? withoutTheGpu(copy.runArgs ?? []) : (copy.runArgs ?? [])
  const { network: templatesNetwork, others } = theNetworkApart(templateArgs)
  const onTheHostsNetwork = (chosen.network ?? templatesNetwork) === 'host'
  const ownName = offTheHostsNetwork ? [`--hostname=${hostName}`] : onTheHostsNetwork ? theOwnNameOnTheHostsNetwork(hostName) : []
  const ownArgs = [...(chosen.network === undefined ? templateArgs : [...others, `--network=${chosen.network}`]), ...ownName]
  // HELD TO THE SANDBOX LIMITS (theLimitsOfASandbox, worked out above before anything was written).
  const heldTo = `${limits.memory} of memory with swap counted in it, ${limits.cpus} cores at a priority below the desktop's, ${limits.pidsLimit} processes`
  say(
    raised === 'no' ? `the container is held to the sandbox defaults: ${heldTo} (the standard sandbox limits).`
      : raised === 'merge' ? `the container is held to its template's limits for a merge sandbox: ${heldTo}, because ${template.office.raisesForAMerge.because}`
        : `the container is held to its template's raised limits: ${heldTo}, because ${template.office.raises.because}`,
  )
  copy.runArgs = [...ownArgs, ...theSandboxLimitArgs(limits), ...theRoomForPictures(ownArgs), `--name=${containerName}`, ...labels.map((l) => `--label=${l}`), ...(typeof zone === 'string' && zone !== '' ? [`--env=TZ=${zone}`] : [])]
  // OFF THE HOST'S NETWORK, the names mean what they do on the host (theNamesAsTheHostHasThem), read-only.
  const hostsFile = offTheHostsNetwork ? join(hostOnly, 'hosts') : null
  if (hostsFile !== null) writeFileSync(hostsFile, `${theNamesAsTheHostHasThem(hostName)}\n`)
  copy.mounts = [
    ...(copy.mounts ?? []),
    ...checkoutEnvFiles.map(path => `type=bind,source=${emptyEnvFile},target=${path},readonly`),
    ...readOnly.map((p) => `type=bind,source=${p},target=${p},readonly`),
    `type=bind,source=${mirror},target=${mirror},readonly`,
    ...(hostsFile === null ? [] : [`type=bind,source=${hostsFile},target=/etc/hosts,readonly`]),
    ...(theProviderRouterIsOn() ? [`type=bind,source=${aRouterFolderFor(hostOnly)},target=${THE_ROUTER_FOLDER_INSIDE},readonly`] : []),
  ]
  const config = join(hostOnly, 'devcontainer.json')
  writeFileSync(config, `${JSON.stringify(copy, null, 2)}\n`)
  const logPath = join(hostOnly, 'devcontainer-up.log')
  say(`starting ${containerName} with the devcontainer CLI; its log is ${logPath}`)
  const started = await new Promise((done) => {
    const log = openSync(logPath, 'w')
    const child = spawn(
      'devcontainer',
      ['up', '--workspace-folder', dir, '--config', config, '--id-label', `${ID_LABEL}=${name}`, '--mount-workspace-git-root', 'false'],
      { env: { ...process.env, ...inputs }, stdio: ['ignore', 'pipe', log] },
    )
    let stdout = ''
    child.stdout.on('data', (chunk) => {
      stdout += chunk
    })
    child.on('error', (why) => done({ code: null, stdout, why: why.message }))
    child.on('close', (code) => {
      closeSync(log)
      done({ code, stdout, why: null })
    })
  })
  const last = started.stdout.trim().split('\n').pop() ?? ''
  let result = null
  try {
    result = JSON.parse(last)
  } catch {
    result = null
  }
  const containerId = result?.outcome === 'success' && /^[0-9a-f]{64}$/.test(String(result.containerId)) ? result.containerId : null
  if (containerId === null) {
    const closed = await releaseThroughTheLedger(rowId, { force: true, note: `sandbox ${name} did not start`, workspace, who })
    const tail = existsSync(logPath) ? readFileSync(logPath, 'utf8').trim().split('\n').slice(-15).join('\n') : ''
    refuse(
      `The devcontainer CLI did not start ${containerName} (${started.why ?? `exit ${started.code}`}; it said ${last.slice(0, 500) || 'nothing on stdout'}). ` +
        `${closed.status === 200 ? 'Its ledger row is closed.' : `Its ledger row ${rowId} could not be closed: ${theOfficeSaid(closed)}.`}` +
        (tail === '' ? '' : `\nThe end of its log:\n${tail}`),
    )
  }

  // ---------------------------------------------------------------- 3. check what docker made
  const made = inspectContainer(containerId)
  const problems = []
  let madeSpoolWritable = []
  if (made === null) problems.push(`docker knows no container ${containerId}`)
  else {
    if (made.Name !== `/${containerName}`) problems.push(`it is called ${made.Name}, not /${containerName}`)
    if (made.Config?.Labels?.[ID_LABEL] !== name) problems.push(`its ${ID_LABEL} label is not ${name}`)
    const mountAt = (path) => (made.Mounts ?? []).find((m) => m.Destination === path)
    for (const path of [from, mirror, ...readOnly]) {
      const m = mountAt(path)
      if (m === undefined) problems.push(`${path} is not mounted`)
      else if (m.RW !== false) problems.push(`${path} is mounted writable`)
    }
    for (const path of checkoutEnvFiles) {
      const m = mountAt(path)
      if (m?.Type !== 'bind' || m.Source !== emptyEnvFile || m.RW !== false) problems.push(`${path} is not covered by the empty read-only host file`)
    }
    const own = mountAt(dir)
    if (own === undefined || own.RW !== true) problems.push(`its own folder ${dir} is not mounted writable`)
    // THE ZONE IT WAS ASKED TO RUN IN, read back like the name and the mounts (acceptance finding 62, the inspector's third
    // note; carried by finding 64's entry): a container without it would say UTC's day, as they all did before.
    if (typeof zone === 'string' && zone !== '' && !(made.Config?.Env ?? []).includes(`TZ=${zone}`)) problems.push(`its clock is not set to ${zone}: TZ=${zone} is not in its environment`)
    // THE NETWORK IT WAS ASKED FOR, read back the same way (acceptance finding 77): a container on the host's network
    // after --network none would reach the live office while saying it could not.
    if (chosen.network !== undefined && made.HostConfig?.NetworkMode !== chosen.network) problems.push(`its network is ${String(made.HostConfig?.NetworkMode ?? 'not said')}, not ${chosen.network}`)
    if (hostsFile !== null && mountAt('/etc/hosts')?.RW !== false) problems.push('its /etc/hosts is not the read-only file in which localhost means 127.0.0.1')
    // ITS OWN HOST NAME, read back like the network (aHostNameProblem).
    const nameProblem = aHostNameProblem(made.Config?.Hostname, ownName.length > 0 ? hostName : null)
    if (nameProblem !== null) problems.push(nameProblem)
    // THE GATE-COUNT SPOOL, read back like the other mounts (theSpoolWritableThrough). The refusal then says the fix.
    madeSpoolWritable = theSpoolWritableThrough(theMountsOf(made))
    problems.push(...madeSpoolWritable)
  }
  if (problems.length > 0) {
    const stopped = await releaseThroughTheLedger(rowId, { force: true, note: `sandbox ${name} was not what was asked for: ${problems.join('; ')}`, workspace, who })
    const removed = stopped.status === 200 && made !== null ? removeStoppedContainer(made.Id, name) : 'not removed'
    refuse(
      `The container docker made is not what was asked for: ${problems.join('; ')}. ` +
        `${stopped.status === 200 ? `It was stopped through the ledger and ${removed}.` : `It could not be stopped through the ledger (${theOfficeSaid(stopped)}); release row ${rowId} by hand.`}` +
        (madeSpoolWritable.length > 0 ? ' Remake the container without that mount, or mount it read-only.' : ''),
    )
  }

  facts = { ...facts, container: { name: containerName, id: containerId }, upAt: localStamp(new Date()) }
  writeInstance(dir, facts)
  // ITS OWN NODE_MODULES AND ITS ORIGIN, set inside the container that was just started (ownPackagesAndOrigin). What it
  // says goes to stderr; a failed install is said and the sandbox stays up, as it does at an agent's start.
  ownPackagesAndOrigin({ dir, container: containerName, from, mirror, network: chosen.network ?? null })
  const answer = { instance: name, template: template.name, container: containerId, containerName, resource: rowId, folder: dir, ref, readOnly, network: chosen.network ?? null, ...(gpuLeftOut ? { gpu: facts.gpu } : {}), dsh: dshCopied }
  if (chosen.json) process.stdout.write(`${JSON.stringify(answer)}\n`)
  else process.stdout.write(`container ${containerId}\nresource ${rowId}\nfolder ${dir}\n`)
  say(`${name} is up from ${template.name} on ${ref}${readOnly.length > 0 ? `, with ${readOnly.join(', ')} read-only` : ''}.${gpuLeftOut ? ` The template asks for the GPU, and this container was brought up without it (--no-gpu).` : ''} OpenCode in this sandbox is set not to wait for external-directory permission. Stop it with node tools/sandbox.mjs down ${name}.`)
}

/** Prepare before host filing too: an already-running sandbox may still hold an older helper. */
function prepareOpenCodeBeforeFiling(sb, runtime) {
  try {
    if (prepareOpenCodeRunHome(join(sb.dir, 'home'), runtime) !== null) sb.opencode = OPENCODE_RUN_HOME_NOTICE
  } catch (why) { refuse(why instanceof Error ? why.message : String(why)) }
}

/**
 * THE OFFICE'S RUN HOOKS IN A SANDBOX'S CLAUDE SETTINGS. A Claude Code run in a sandbox had
 * no office hook at all: nothing told it a message
 * waited for it, and nothing held its stop while its own run was unfinished. So `up`, and every Claude Code run the
 * launcher starts, merge the session hooks beside the two dsh hooks in the instance's own settings, keeping whatever else the file holds: PostToolUse
 * runs tools/dsh-hooks/claude-code-step.mjs and Stop runs tools/dsh-hooks/claude-code-stop.mjs, both from the instance's
 * own clone, which the sandbox sees at the same path. Never the host's settings: that file is the owner's, and every
 * Claude Code session on this machine reads it. A clone that does not hold these scripts yet gets none, and this says
 * so. Answers a sentence when it wrote or left something out, or null when the file already held them.
 */
const theOfficesRunHooks = prepareClaudeRunHome

/**
 * THE TEMPLATE'S OTHER CLONES: every repository its sandbox.json declares under "clones", as { name, from }, cloned into
 * <instance>/<name> beside the office's own <instance>/repo, so an agent's worktree can be cut from it with --clone <name>
 * (the ai-news studio's news-tools). A FULL CLONE, not a shared one: a shared clone reads its
 * objects from its source, and only the office's own checkout is mounted into the sandbox. A clone already there is kept
 * as it is. Each is answered with the branch its source had checked out, which up writes on the instance. A name that is
 * not a plain folder name, a source that is not an absolute path to a git repository, or a clone that fails is refused,
 * and then nothing is running.
 */
function theTemplatesClones(template, dir) {
  const declared = template.office.clones ?? []
  if (!Array.isArray(declared)) refuse(`${join(template.dir, 'sandbox.json')} has "clones" that is not a list. Nothing was started.`)
  const clones = []
  for (const one of declared) {
    const name = one?.name
    const from = one?.from
    if (typeof name !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(name) || name === 'repo') {
      refuse(`${join(template.dir, 'sandbox.json')} declares a clone named ${JSON.stringify(name)}: a clone's name is a plain folder name other than repo. Nothing was started.`)
    }
    if (typeof from !== 'string' || !isAbsolute(from) || !existsSync(join(from, '.git'))) {
      refuse(`${join(template.dir, 'sandbox.json')} declares the clone ${name} from ${JSON.stringify(from)}, which is not an absolute path to a git repository. Nothing was started.`)
    }
    const at = join(dir, name)
    if (existsSync(at)) {
      say(`${at} is already there and is kept as it is.`)
    } else {
      const cloned = run('git', ['clone', '-q', from, at])
      if (cloned.status !== 0) refuse(`${from} could not be cloned into ${at}: ${cloned.stderr.trim()}. Nothing is running.`)
      say(`${from} is cloned into ${at}, for worktrees cut with --clone ${name}.`)
    }
    const head = guardedRun(at, ['symbolic-ref', '--short', 'HEAD'])
    clones.push({ name, from, ref: head.status === 0 ? head.stdout.trim() : null })
  }
  return clones
}

/**
 * A CLAUDE CODE RUN KEEPS ITS BACKGROUND WORKERS (3 October 2026). Claude Code 2.1.281, in -p
 * mode, waits only 600 seconds for its background tasks after its last turn, then kills them: wave 13n's round 34
 * died so at 19:56 with its three workers, which its supervisor had started as background subagents before
 * it ended its turn. The value 0 waits for them however long they take. Declared here, beside its two uses: every command
 * this launcher starts gets it (startThroughTheHelper), and up and every start write it into each sandbox's own Claude
 * Code settings (aRunKeepsItsWorkers); only Claude Code reads it.
 */
const CLAUDE_CODE_KEEPS_ITS_WORKERS = Object.freeze({ name: 'CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS', value: '0' })

/**
 * WHEN A CLAUDE CODE RUN IN A SANDBOX COMPACTS ITS CONVERSATION: the setting MOLE_OFFICE_CLAUDE_COMPACTS_AT_IN_A_SANDBOX,
 * read at every start (src/config/the-compaction-window.mjs; wave 13q round 58). Its default,
 * 200,000 tokens, comes from a measurement: the sandbox account's
 * week was 55% spent by 09:57, and a measurement found that supervisors made about 90% of it, re-reading about 625,000 tokens on
 * every call. A long session resumed with a smaller window compacts once at once. A setting that cannot be read or used
 * is refused, and nothing is started. Every variable a Claude Code run in a sandbox is given, with the window it read.
 * @returns {{ variables: { name: string, value: string }[], window: import('../src/config/the-compaction-window.mjs').CompactionWindow }}
 */
function theClaudeCodeVariablesInASandbox() {
  let window
  try { window = theCompactionWindowHere('sandbox') }
  catch (why) { refuse(why instanceof Error ? why.message : String(why)) }
  return { variables: [CLAUDE_CODE_KEEPS_ITS_WORKERS, { name: THE_COMPACTION_VARIABLE, value: window.tokens }], window }
}

/**
 * A CLAUDE CODE RUN STARTED IN HERE KEEPS ITS BACKGROUND WORKERS AND COMPACTS WHEN THE SETTING SAYS, however it is started
 * (theClaudeCodeVariablesInASandbox): up and every start write the variables under "env" in the instance's own Claude Code
 * settings, keeping whatever else the file holds and its mode, so a claude started in the container by any road reads the
 * numbers the last start wrote, not only the commands this launcher starts. Answers a sentence when it wrote something, or
 * null when the file already said so.
 * @param {string} home @param {ReturnType<typeof theClaudeCodeVariablesInASandbox>} claudeCodes
 */
function aRunKeepsItsWorkers(home, claudeCodes) {
  const folder = join(home, '.claude')
  const file = join(folder, 'settings.json')
  let held = {}
  if (existsSync(file)) {
    try {
      held = JSON.parse(readFileSync(file, 'utf8'))
    } catch {
      refuse(`${file} is there and is not JSON, so the settings that keep a run's background workers and say when it compacts could not be added. Nothing was started.`)
    }
  }
  const env = held.env !== null && typeof held.env === 'object' && !Array.isArray(held.env) ? held.env : {}
  const missing = claudeCodes.variables.filter((one) => env[one.name] !== one.value)
  if (missing.length === 0) return null
  mkdirSync(folder, { recursive: true })
  writeWhole(file, `${JSON.stringify({ ...held, env: { ...env, ...Object.fromEntries(missing.map((one) => [one.name, one.value])) } }, null, 2)}\n`,
    existsSync(file) ? statSync(file).mode & 0o777 : 0o644)
  return (
    `${file} keeps a Claude Code run's background workers past its last turn and compacts its conversation at ` +
    `${claudeCodes.window.tokens} tokens, from ${claudeCodes.window.from} (${missing.map((one) => `${one.name}=${one.value}`).join(', ')}).`
  )
}

/**
 * THE nvm.sh A SANDBOX'S HOME IS GIVEN. Chapter 9 starts every shell command with `export NVM_DIR="$HOME/.nvm"; .
 * "$NVM_DIR/nvm.sh";`, written for the host, whose system Node is 18. The image has Node 22 at /usr/local/bin/node and no
 * nvm, so without this file that line prints an error in every command. The shim defines nvm, and nothing else: called,
 * it says on stderr which Node is used, and succeeds.
 */
const THE_NVM_SHIM = `nvm() { echo "nvm: not installed in this sandbox; the image's Node $(/usr/local/bin/node --version) at /usr/local/bin/node is used" >&2; return 0; }\n`

/**
 * A HOME WITH NO .nvm GETS THE nvm SHIM (THE_NVM_SHIM) as .nvm/nvm.sh, at every up. A home that already has .nvm, a link
 * to nothing included, keeps it as it is. Answers a sentence when it wrote the file, or null when .nvm was there.
 */
function theNvmShim(home) {
  const folder = join(home, '.nvm')
  try {
    lstatSync(folder)
    return null
  } catch (why) {
    if (why?.code !== 'ENOENT') refuse(`${folder} could not be read (${why instanceof Error ? why.message : String(why)}), so it is not known whether the home has its own nvm. Nothing was started.`)
  }
  mkdirSync(folder, { mode: 0o755 })
  writeFileSync(join(folder, 'nvm.sh'), THE_NVM_SHIM, { flag: 'wx', mode: 0o644 })
  return `${join(folder, 'nvm.sh')} defines nvm as a command that names the image's Node and succeeds, so chapter 9's line loads in this sandbox.`
}

/**
 * NO AI ATTRIBUTION IN A COMMIT MADE IN HERE. The owner's rule: an agent commits under its own Mole Office
 * identity, never as Claude and never with a "Co-Authored-By: Claude" or "Claude-Session:" line. Claude Code
 * reads that from `attribution` in its settings, and in a sandbox its settings are the instance's own HOME, not
 * the owner's. So `up` writes the setting there, keeping whatever else the file holds. Answers a sentence when
 * it wrote something, or null when the file already said so.
 */
function noAttributionInCommits(home) {
  const folder = join(home, '.claude')
  const file = join(folder, 'settings.json')
  let held = {}
  if (existsSync(file)) {
    try {
      held = JSON.parse(readFileSync(file, 'utf8'))
    } catch {
      refuse(`${file} is there and is not JSON, so the setting that keeps AI attribution out of commits could not be added. Nothing was started.`)
    }
  }
  const off = { commit: '', pr: '', sessionUrl: false }
  const already = JSON.stringify(held.attribution) === JSON.stringify(off) && held.includeCoAuthoredBy === false
  if (already) return null
  mkdirSync(folder, { recursive: true })
  writeFileSync(file, `${JSON.stringify({ ...held, attribution: off, includeCoAuthoredBy: false }, null, 2)}\n`)
  return `${file} says no AI attribution in commits and pull requests (the owner's rule).`
}

/**
 * COPY dsh's PROFILES INTO THE INSTANCE, and point its npm dsh at the image's own. Copies only what
 * is missing and overwrites nothing. The dsh program itself is not copied (306 MB per instance): the
 * image installs the same version the host has, and its Dockerfile refuses any other, so
 * `npm/node_modules/.bin/dsh` here is a two-line script that runs the image's `dsh`. run-agent.sh
 * then works with MOLE_OFFICE_DSH_DIR=<instance>/dsh.
 *
 * NOT dsh's env FILE, AND OF ITS HOME ONLY THE PROFILES (28 September 2026).
 * The env file holds the DeepSeek key, and a copy in the instance could be read by every run in the
 * sandbox, whatever its runtime. A dsh run gets the key from the launcher instead, which passes the
 * sandboxes' secrets to the runtime that reads each (theDeclaredSecrets, readBy dsh).
 *
 * The rest of dsh's home is the host's own runs, which every run in the sandbox could read as well:
 * sessions/ holds their logs, attachments/ what they were given, storages/ dsh's cache of each
 * session, llm-deepseek/ the index of the images uploaded for them, and .anonymous-user-id the host
 * dsh's own id. A run in a sandbox needs none of it, and dsh makes each part afresh when a run needs
 * it (seen on 28 September 2026: the stress sandbox ran 1618 sessions with no attachments/ and no
 * llm-deepseek/, and wrote its own sessions/ and storages/). So the profiles alone are copied. The
 * first version of this fix left out storages/ alone, taking it for the logs.
 *
 * An older instance may still hold these copies. Nothing reads its env file now, and they are removed
 * only when the person says so, since nothing is deleted without the person's word.
 */
function copyTheDshFolder(source, target) {
  if (!existsSync(source)) {
    say(`there is no dsh folder at ${source}, so none was copied; a dsh run in this sandbox has no dsh to run.`)
    return { copied: false, from: source }
  }
  mkdirSync(target, { recursive: true })
  if (existsSync(join(target, 'env'))) {
    say(`${join(target, 'env')} is an older copy of dsh's env file: nothing reads it now, and it is removed only when the owner says so.`)
  }
  // ACCEPTANCE FINDING 15. An instance started again after `down` already has its dsh home, and
  // cpSync with force: false still threw EEXIST on it (on the links under profiles/node_modules).
  // A home that is already there keeps its profiles; its office profile is refreshed below.
  if (existsSync(join(source, 'home')) && existsSync(join(target, 'home'))) {
    say(`${join(target, 'home')} is already there, so its profiles were not copied again; the office profile is refreshed for this sandbox below.`)
  } else if (existsSync(join(source, 'home'))) {
    // THE PROFILES ALONE, in a home only its owner reads, as the host's own dsh home is. The head of this function says
    // what the rest of dsh's home is and why none of it is copied.
    mkdirSync(join(target, 'home'), { recursive: true, mode: 0o700 })
    if (existsSync(join(source, 'home', 'profiles'))) {
      cpSync(join(source, 'home', 'profiles'), join(target, 'home', 'profiles'), {
        recursive: true,
        force: false,
        errorOnExist: false,
        preserveTimestamps: true,
      })
    }
  }
  const bin = join(target, 'npm', 'node_modules', '.bin')
  mkdirSync(bin, { recursive: true })
  if (!existsSync(join(bin, 'dsh'))) {
    writeFileSync(
      join(bin, 'dsh'),
      '#!/bin/sh\n# The image\'s own dsh, the version its Dockerfile pins to the host\'s. Written by node tools/sandbox.mjs up.\nexec dsh "$@"\n',
      { mode: 0o755 },
    )
  }
  installOfficeProfile(join(target, 'home'), join(dirname(target), 'repo'))
  return { copied: true, from: source }
}

/** Remove a STOPPED container by its exact id, only if it carries this instance's label. */
function removeStoppedContainer(id, name) {
  const now = inspectContainer(id)
  if (now === null) return 'it was already gone'
  if (now.State?.Running) return `it was NOT removed, because docker still says it is running`
  if (now.Config?.Labels?.[ID_LABEL] !== name) return `it was NOT removed, because it does not carry ${ID_LABEL}=${name}`
  const r = run('docker', ['rm', now.Id])
  return r.status === 0 ? `removed (${String(now.Id).slice(0, 12)})` : `it could NOT be removed: ${r.stderr.trim()}`
}

// ============================================================================ exec

/**
 * THE SANDBOX A COMMAND IS STARTED IN, read and checked once, for exec, worker and round alike: its instance.json, a
 * container that is running, nothing mounted inside a folder it covers, nothing that lets it write the gate-count
 * spool, and the helper in its clone. Any of them
 * missing is refused, and nothing is started.
 */
async function aSandboxToStartIn(name, who) {
  const dir = instanceFolder(name)
  const instance = await theFactsOrRefuse(name, who, `There is no sandbox called ${name} in ${sandboxes}. node tools/sandbox.mjs status lists them.`)
  const workspace = chosen.workspace ?? instance.workspace ?? whichWorkspace(undefined)
  const container = inspectContainer(instance.container.name)
  if (container === null || !container.State?.Running) {
    refuse(`The sandbox ${name} is not running (docker ${container === null ? 'knows no container ' + instance.container.name : `says it is ${container.State?.Status}`}). Start it with node tools/sandbox.mjs up.`)
  }
  // A CONTAINER STARTED BEFORE THE TEMPLATE CHANGED keeps the mounts it was started with, so the
  // container is asked, not the template. Nothing is started in one that shows a covered folder.
  const putBack = mountedInsideACover((container.Mounts ?? []).map((m) => ({ type: m.Type, target: m.Destination })))
  if (putBack.length > 0) {
    refuse(
      `Nothing was started in the sandbox ${name}, because its container has something mounted inside a folder it covers: ` +
        `${putBack.join('; ')}. A sandbox started before the office's key file left the template is like this, and in ` +
        `such a sandbox every process can read the person's key. Start it again from the template as it is now: node tools/sandbox.mjs down ${name}, ` +
        `then node tools/sandbox.mjs up. Its folder is kept.`,
    )
  }
  const spoolWritable = theSpoolWritableThrough(theMountsOf(container))
  if (spoolWritable.length > 0) {
    refuse(
      `Nothing was started in the sandbox ${name}, because its container can write the gate-count spool, in which the office counts each gate a sandbox tool meets on the host: ` +
        `${spoolWritable.join('; ')}. Start it again from a template that mounts none of these, or mounts each read-only: node tools/sandbox.mjs down ${name}, ` +
        `then node tools/sandbox.mjs up. Its folder is kept.`,
    )
  }
  if (asksForAGpu(container)) await remindOfOtherGpuSandboxes(name, workspace, who)
  const helper = join(dir, 'repo', THE_HELPER)
  if (!existsSync(helper)) refuse(`${helper} is not there: the clone in this sandbox is from before the helper existed. Nothing was started.`)
  noApiKeyInTheLoginFilesOf(name, dir)
  return { name, dir, instance, workspace, container, helper }
}

/**
 * WHILE THE PROVIDER ROUTER IS ON, NOTHING STARTS IN A SANDBOX WHOSE FOLDER HOLDS AN API KEY IN A LOGIN FILE, its home's
 * or dsh's (tools/key-router/login-files.mjs). The folder is read and never changed.
 */
function noApiKeyInTheLoginFilesOf(name, dir) {
  const why = theProviderRouterIsOn() ? whyAStartIsRefusedForTheLoginFiles(dir, THE_LOGIN_FILES_OF_A_SANDBOX, `The folder of the sandbox ${name}, ${dir},`) : null
  if (why !== null) refuse(why, 2)
}

/** A BRIEF OUTSIDE THE INSTANCE IS COPIED IN, because the sandbox cannot read it where it is. Answers the path inside. */
function theBriefInside(dir, given) {
  const brief = resolve(given)
  if (!existsSync(brief) || !statSync(brief).isFile()) refuse(`--brief ${brief}: there is no file there. Nothing was started.`, 2)
  if (within(brief, dir)) return brief
  const stamp = fileNameStamp(new Date()) // the one file-name form, src/shared/time.ts (acceptance finding 63)
  const inside = join(dir, 'briefs', `${stamp}-${basename(brief)}`)
  copyFileSync(brief, inside)
  say(`the brief is copied into the sandbox as ${inside}`, true)
  return inside
}

/**
 * THE STARTING WORDS, the brief's first chapter (tools/harness-features-off.mjs). They say the harness's own subagents
 * and workflows are off only when what starts the run in the sandbox's clone puts the switch in: its helper, and for dsh
 * also tools/dsh-hooks/run-agent.sh, which starts dsh itself. The helper is read as text, as theDshHandoffIsCurrent
 * reads it, and run-agent.sh by its code (aRunnerGivesDshThePatch), after main is refreshed. Answers the brief with the
 * words before it, a new file in the sandbox's briefs folder.
 */
function theBriefWithTheStartingWords(sb, runtime, given) {
  const runner = join(dirname(sb.helper), 'dsh-hooks', 'run-agent.sh')
  const helperSwitches = readFileSync(sb.helper, 'utf8').includes('harness-features-off.mjs')
  const runnerSwitches = runtime !== 'dsh' || (existsSync(runner) && aRunnerGivesDshThePatch(readFileSync(runner, 'utf8')))
  if (!helperSwitches) say(`the helper in ${sb.helper} is from before the switch that turns the harness's own subagents and workflows off, so this run has them, and its brief says so.`)
  else if (!runnerSwitches) say(`this dsh run starts through ${runner}, which does not give dsh the patch that turns the harness's own subagents and workflows off, so this run has them, and its brief says so.`)
  const words = helperSwitches && runnerSwitches ? THE_STARTING_WORDS : THE_STARTING_WORDS_WITHOUT_THE_SWITCH
  const folder = join(sb.dir, 'briefs')
  mkdirSync(folder, { recursive: true })
  if (!lstatSync(folder).isDirectory()) refuse(`${folder} is not a folder of this sandbox's own, so the brief cannot be written there. Nothing was started.`)
  const brief = join(folder, `${fileNameStamp(new Date())}-${randomBytes(3).toString('hex')}-starting-words.md`)
  writeFileSync(brief, `${words}\n\n---\n\n${readFileSync(given, 'utf8')}`, { flag: 'wx', mode: 0o600 })
  return brief
}

/** Refuse readable conflicts before filing or passing a command to the sandbox helper. */
function checkCodexBeforeStart(command, { runtime = null, plain = false } = {}) {
  try {
    const checked = aCodexContainerCommand(command ?? [], { runtime, plain, insert: !plain })
    if (command !== null) command.splice(0, command.length, ...checked.command)
    for (const sentence of checked.says) say(sentence, true)
    return checked.command
  } catch (why) { refuse(why instanceof Error ? why.message : String(why), 2) }
}

/**
 * HOW LONG A HAND START WAITS FOR AN OFFICE THAT IS RESTARTING, in milliseconds: 180 seconds ordinarily, and a shorter
 * whole number when this process carries the test mark and SANDBOX_HAND_START_WAIT_MS names one under that. Only a test
 * may shorten it and nothing may lengthen it (the precedent is SANDBOX_ISOLATED_LOOK_MS). Every ask a hand start makes
 * while the office is not listening uses this: the hand-run ask, the registered-agent ask, and exec --agent's first read
 * of the same path (anAgentsRunFiledHere).
 */
function theHandStartWait() {
  const named = carriesTheTestMark() ? process.env['SANDBOX_HAND_START_WAIT_MS'] : undefined
  const shorter = Number(named)
  return Number.isInteger(shorter) && shorter > 0 && shorter < THE_LONGEST_WAIT_FOR_THE_LEDGER_MS ? shorter : THE_LONGEST_WAIT_FOR_THE_LEDGER_MS
}

/**
 * ONE MORE SENTENCE AFTER A HAND-START REFUSAL, saying what failed and, when the office was asked again, how many seconds
 * it was asked again for: askTheOfficeWhileItRestarts puts both in the reply's `why`. Empty when the reply carries no
 * reason at all, so a refusal the office itself sent reads exactly as it did before.
 */
function whatFailed(reply) {
  return typeof reply.why === 'string' && reply.why !== '' ? `What failed: ${reply.why}.` : ''
}

/** THE REFUSAL, joined from its parts with only the parts that are there: a part with nothing to say adds no space. */
function refusalOf(...parts) {
  return parts.filter((part) => part !== '').join(' ')
}

/**
 * A HAND-START ASK THE OFFICE NEVER ANSWERED, once the wait is over: no answer at all, or the stand-in's 503, which only
 * comes back once the wait is over (askTheOfficeWhileItRestarts) and says that no server is running. Both are refused in
 * the same words, with the wait's own reason. Any other answer is left to the caller.
 */
function refuseAHandStartTheOfficeNeverAnswered(asked) {
  if (asked.status === null || (asked.status === 503 && asked.standIn === true)) {
    refuse(refusalOf('Mole Office could not answer the hand-start check, so nothing was started.', whatFailed(asked)), 2)
  }
}

/**
 * WHAT A NEW WORKTREE OF `agent` LEAVES OUT (src/config/a-workers-left-out-paths.mjs), read from the template's
 * sandbox.json at each start, where the template's secrets are read. `role` is the office's word for the agent
 * (roleReadAs), or null when the office did not say it. A worker's worktree leaves out the declared paths but those
 * --with-path names; any other agent's is whole, and so is one whose role the office did not say. A --with-path that is
 * not plain, or that the template does not leave out, is refused before anything is asked or filed, and so is a
 * declaration that cannot be read.
 *
 * Answers `{ leaveOut, bringBack, says, loud }`: the paths for theAgentsWorktree, and the sentence that says why a
 * declared path is not left out, or null.
 */
function theWorktreesLeftOut(sb, agent, role) {
  const template = theTemplate(sb.instance.templateDir)
  const file = join(template.dir, 'sandbox.json')
  let declared = []
  try { declared = thePathsAWorkerLeavesOut(template.office, file) }
  catch (why) { refuse(`${why instanceof Error ? why.message : String(why)} Nothing was filed or started.`, 2) }
  for (const path of chosen['with-path']) {
    const why = whyNotAPlainPath(path)
    if (why !== null) refuse(`--with-path ${path} is not a plain path: ${why}. Nothing was filed or started.`, 2)
    if (!declared.includes(path)) {
      refuse(`--with-path ${path} names a path this sandbox does not leave out of a worker's worktree: ${file} ${declared.length === 0 ? 'leaves nothing out' : `leaves out ${declared.join(', ')}`}. Nothing was filed or started.`, 2)
    }
  }
  const bringBack = [...new Set(chosen['with-path'])]
  if (declared.length === 0 || role === THE_WORKER) return { leaveOut: declared.filter((path) => !bringBack.includes(path)), bringBack, says: null, loud: false }
  return role === null
    ? { leaveOut: [], bringBack, says: `${file} leaves ${declared.join(', ')} out of a worker's worktree, and the office did not say what ${agent} is, so its worktree is whole.`, loud: true }
    : { leaveOut: [], bringBack, says: `${file} leaves ${declared.join(', ')} out of a worker's worktree; ${agent} is a ${role}, so its worktree is whole.`, loud: false }
}

/**
 * AN AGENT'S RUN, FILED HERE ON THE HOST WITH THE CALLER'S OWN KEY (see "a run's own key" in the header). exec --agent,
 * worker and round all come here, and it files through fileARun (tools/file-a-run.mjs), the launcher's one filing
 * function. The model is asked of the office when none was named, and the worktree is made when it is not there
 * (theAgentsWorktree, the copy the helper uses too), because a run is filed with its worktree's HEAD. The sandbox field
 * goes in the create: neither the run's agent nor a caller whose session is the run may write it later (decision
 * that only the filing may set it; wave 13m's answer b(i)).
 *
 * THE HAND-RUN CHECK WAITS WHILE THE OFFICE RESTARTS, as the process rows do (askTheOfficeWhileItRestarts): a hand
 * start made while the connection is refused or the stand-in answers goes on once the office answers. One that still
 * cannot reach the office after the wait refuses as it did before, and says what failed and how long it asked
 * again for.
 *
 * WITH `leaving` (worker and exec --agent), A NEW WORKTREE MAY LEAVE OUT WHAT THE TEMPLATE DECLARES, by the agent's
 * role (theWorktreesLeftOut). worker passes the role its registration read gave; exec --agent's is read here, from the
 * read it makes first. round's worktree is whole.
 *
 * Answers `{ id, key, agent, words, worktree }`: the helper's words for this run, `--filed <id>` among them, the run's
 * own key, or null when the office answered none, and the worktree it works in. It files nothing, and answers the
 * helper's own filing words with a null id and no worktree, when the helper will refuse the ask anyway (no --runtime,
 * --run, --wait, --plain-env, --no-office-variables, --timeout, or no command where one is needed), or when the
 * sandbox's helper is from before --filed.
 */
/** Remove a failed new round's worktree in its sandbox, and say explicitly when it remains. */
function removeANewRoundWorktree(sb, worktree, tip, words) {
  const git = gitInside(sb)
  const repo = join(sb.dir, 'repo')
  const left = (why) => `${words.replace(/(?:Nothing|nothing) was started\.?/g, '').trim()} The new worktree ${worktree} was left for inspection: ${why}.`
  if (!aRoundDirectoryParentIsSafe(sb, worktree)) return left('its real parent is outside the worktrees folder or cannot be read')
  if (existsSync(worktree)) {
    const head = git(['-C', worktree, 'rev-parse', '--verify', 'HEAD^{commit}'])
    if (head.status !== 0 || head.stdout.trim() !== tip) return left('its HEAD is not the requested tip')
  }
  const removed = existsSync(worktree) ? git(['-C', repo, 'worktree', 'remove', '--force', worktree]) : { status: 0 }
  const pruned = git(['-C', repo, 'worktree', 'prune'])
  if (removed.status === 0 && pruned.status === 0 && !existsSync(worktree)) return words
  return left('it could not be fully removed')
}

async function anAgentsRunFiledHere(sb, who, { agent, runtime, model, worktree, clone = null, cutFrom, cutNamed = false, title, brief, continues, flow, parent, command, startup, selection, fresh = false, startAt, recordedCut, leaving = false, role, images = [] }) {
  // A RUN GIVEN NO --worktree AND NO --clone WORKS IN THE AGENT'S OWN WORKTREE, never in the shared checkout, whose main
  // every start moves. It is worked out first, so the hand-run ask, the helper's words and the filing name one folder.
  if (worktree === undefined && clone === null) {
    worktree = theAgentsOwnWorktree(sb.dir, agent)
    say(`the run was given no --worktree, so it works in its own worktree, ${worktree}.`)
  }
  try { theDshHandoffIsCurrent(sb.helper, command, runtime) }
  catch (why) { refuse(why instanceof Error ? why.message : String(why), 2) }
  checkCodexBeforeStart(command, { runtime })
  checkHelperPermissions(sb, true)
  const asTheHelperFilesIt = { id: null, key: null, agent, words: theWordsThatFileARun({ agent, runtime, model, worktree, clone, cutFrom, title, brief, continues, flow }) }
  const theHelperWillRefuse =
    runtime === undefined ||
    ['run', 'wait', 'plain-env', 'no-office-variables', 'timeout'].some((flag) => chosen[flag] !== undefined && chosen[flag] !== false) ||
    ((command === null || command.length === 0) && !(runtime === 'dsh' && brief !== undefined))
  const theHelperFilesItself = !readFileSync(sb.helper, 'utf8').includes("'filed'")
  // THE MODEL AND THE START VALUES ARE WORKED OUT BEFORE THE HAND-RUN ASK (the infrastructure line's owner, 31 October
  // 2026), so a start they refuse writes nothing: no hand-start record on the asking run, and no run. A start the helper
  // will refuse, or one whose helper files the run itself, is not worked out here, as before.
  let theModel = model
  let startValues = null
  let leftOut = { leaveOut: [], bringBack: [], says: null, loud: false }
  if (!theHelperWillRefuse && !theHelperFilesItself) {
    // EXEC --AGENT WAITS FIRST WHILE THE OFFICE RESTARTS. Its first ask was the hand-run ask, which waits, and the model
    // and start-value asks below do not. So it first reads the agent's registration with the same wait, as worker and
    // round do before they work out their start values (theAgentIsRegistered). The read only waits: an office that never
    // answers is refused in the hand-run ask's words, and the hand-run door still judges the registration.
    if (startup === undefined) {
      const registered = await askTheOfficeWhileItRestarts(api, `/api/participants/agent/${encodeURIComponent(agent)}`, {
        workspace: sb.workspace, headers: theCallerNamed(sb.workspace, who),
      }, { longestMs: theHandStartWait(), saying: say })
      refuseAHandStartTheOfficeNeverAnswered(registered)
      if (role === undefined) role = registered.status === 200 ? registered.body?.participant?.roleReadAs ?? null : null
    }
    if (leaving) leftOut = theWorktreesLeftOut(sb, agent, role ?? null)
    if (theModel === undefined || theModel === null) {
      try {
        const given = await theModelTheOfficeGives(api, { agent, runtime, workspace: sb.workspace, headers: theCallerNamed(sb.workspace, who) })
        theModel = given.model
        say(theModelLine(given), true)
      } catch (why) {
        refuse(theModelRefusal(why), 2)
      }
    }
    const commandEnvironment = theClaudeCodeEnvironment(sb, theSecretsFor(sb.instance, runtime, undefined, sb).lines, true)
    const commandEnv = commandEnvironment.env
    startValues = startup === undefined ? await theStartValues(command ?? [], runtime, theModel, commandEnv, { agent, workspace: sb.workspace, headers: theCallerNamed(sb.workspace, who), selection, envFrom: commandEnvironment.from })
      : { ...aCommandsStartValues(command ?? [], {runtime,model:theModel,env:commandEnv,envFrom:commandEnvironment.from,effortAnswer:startup.effortAnswer,selection:startup.start?.selection}), ...(startup.effortAnswer === undefined ? {} : {effortAnswer:startup.effortAnswer}) }
    // A RUN THE PROVIDER ROUTER MUST CARRY is refused here, before the hand-run ask files anything, when the router could
    // not carry it or does not answer; theRouterLinesForARun asks the same again before the helper runs.
    const routed = startValues.start?.selection
    if (theProviderRouterIsOn() && theRouterMustCarry(runtime, theModel ?? routed?.native?.model, routed?.native?.provider)) {
      const why = await whyARoutedRunCannotStart({ sandboxes, name: sb.name, runtime, selection: routed, helperSource: readFileSync(sb.helper, 'utf8') })
      if (why !== null) refuse(why, 2)
    }
  }
  const checked = await askTheOfficeWhileItRestarts(api, `/api/agents/${encodeURIComponent(agent)}/hand-run`, {
    method: 'POST', headers: { ...theCallerNamed(sb.workspace, who), 'content-type': 'application/json' },
    body: { ...(chosen['asked-by'] === undefined ? {} : { askedBy: chosen['asked-by'] }),
      ...(brief === undefined ? {} : { brief }), ...(cutNamed ? { cutFrom } : {}),
      ...(worktree === undefined ? {} : { worktree }) },
  }, { longestMs: theHandStartWait(), saying: say })
  refuseAHandStartTheOfficeNeverAnswered(checked)
  if (checked.status !== 200) refuse(String(checked.body.error ?? theOfficeSaid(checked)), 2)
  const handCut = checked.body.cut
  if (theHelperWillRefuse) {
    if (parent !== undefined) usage('--parent needs a run filed by exec --agent; these options do not file a run.')
    return asTheHelperFilesIt
  }
  // THE MIRROR BROUGHT FORWARD, AND THIS SANDBOX'S OWN NODE_MODULES AND ORIGIN (item 2f), after main was brought forward
  // and before the worktree is made, so a lockfile main changed is installed first and a new worktree links to the copy.
  // The mirror's place is worked out again from the host's facts; an agent's start never makes one.
  if (!fresh) {
    let mirror = null
    try { mirror = theMainMirrorOf(sandboxes, sb.instance.from) } catch (why) { say(`the mirror of the main of ${String(sb.instance.from)} has no place: ${why instanceof Error ? why.message : String(why)}.`) }
    if (mirror !== null) {
      const mirrored = bringTheMainMirrorForward(mirror, sb.instance.from)
      if (mirrored.why !== null) say(`the mirror of main was left as it is: ${mirrored.why}.`)
    }
    ownPackagesAndOrigin({ dir: sb.dir, container: sb.instance.container.name, from: sb.instance.from, mirror, network: sb.instance.network ?? null })
  }
  if (theHelperFilesItself) {
    if (parent !== undefined) usage('--parent needs a run filed on the host; this helper has no --filed support. See the main refresh details for why repo/ still holds it. A later agent start can use --parent once checked-out main follows origin/main containing a helper with --filed support.')
    if (selection !== undefined) refuse(`The helper in ${sb.helper} files the run itself, so it cannot be given --selection. Nothing was started.`, 2)
    say(`the helper in ${sb.helper} is from before a run was filed on the host, so it files the run itself, with no key, as before.`)
    return asTheHelperFilesIt
  }

  // WITH --clone, FROM ONE OF THE TEMPLATE'S OTHER CLONES (theTemplatesClones), cut from that clone's own branch unless
  // --cut-from says otherwise.
  let theClone = null
  if (clone !== null) {
    try {
      theClone = theCloneNamed(sb.instance, clone)
    } catch (why) {
      refuse(why instanceof Error ? why.message : String(why), 2)
    }
  }
  const cut = startAt === undefined ? handCut?.commit ?? cutFrom ?? (theClone === null ? sb.instance.ref : theClone.ref) ?? null : cutFrom
  if (typeof cut !== 'string' || cut === '') {
    refuse('Say which branch the worktree was cut from: --cut-from <branch>. The instance does not say either. Nothing was started.', 2)
  }
  let dir
  let made
  let packages = null
  let mayHaveMade = false
  if (fresh) {
    let absent = false
    try { lstatSync(worktree) } catch (error) { absent = error?.code === 'ENOENT' }
    if (!absent) refuse(startAt === undefined ? `The fresh repair worktree ${worktree} already exists. Nothing was started.` : `The new round directory ${worktree} already exists or cannot be checked. Nothing was started.`)
  }
  try {
    mayHaveMade = startAt !== undefined
    made = theAgentsWorktree({
      instanceDir: sb.dir,
      from: theClone === null ? sb.instance.from : theClone.from,
      branch: agent,
      value: worktree ?? join(sb.dir, theClone === null ? 'repo' : theClone.name),
      cutFrom: startAt ?? cut,
      detached: startAt !== undefined,
      cutNamed: handCut === null ? cutNamed : handCut.named !== null,
      clone: theClone === null ? null : theClone.name,
      leaveOut: leftOut.leaveOut,
      bringBack: leftOut.bringBack,
      git: gitInside(sb),
    })
    if (startAt !== undefined && made.made === null) {
      mayHaveMade = false
      throw new Error(`The new round directory ${worktree} already exists. Nothing was started.`)
    }
    if (leftOut.says !== null) say(leftOut.says, !leftOut.loud)
    if (made.made !== null) say(made.made, true)
    if (made.brought !== undefined) say(made.brought, true)
    dir = made.dir
    const imageNotThere = whyAnImageIsNotInTheWorktree(dir, images)
    if (imageNotThere !== null) throw new Error(imageNotThere)
    if (images.length > 0) say(codexExecIsGiven(images, dir), true)
    if (fresh) {
      const head = gitInside(sb)(['-C', dir, 'rev-parse', 'HEAD'])
      if (cut !== cutFrom || head.status !== 0 || head.stdout.trim() !== (startAt ?? cutFrom)) throw new Error(startAt === undefined ? 'The fresh repair worktree does not stand at the exact requested cut. Nothing was started.' : 'The new worktree does not stand at the requested tip. Nothing was started.')
      const lockfile = theLockfileHash(dir)
      if (lockfile.why !== null) say(lockfile.why)
      const installed = theInstalledPackageHash(sb.dir, dir)
      if (lockfile.hash !== null && lockfile.hash === installed) {
        packages = `packages skipped; installed lockfile ${installed} matches the cut`
      } else if (lockfile.hash !== null) {
        ownPackagesAndOrigin({ dir: sb.dir, repo: dir, container: sb.instance.container.name, from: sb.instance.from, mirror: null, network: sb.instance.network ?? null })
        const after = theInstalledPackageHash(sb.dir, dir)
        packages = `packages ${after === lockfile.hash ? 'refreshed' : 'not refreshed'}; cut lockfile ${lockfile.hash}; installed lockfile ${after ?? 'unverified'}`
        if (startAt !== undefined && after !== lockfile.hash) throw new Error('The new worktree packages could not be refreshed. Nothing was started.')
      } else {
        packages = `packages skipped; the cut has no readable lockfile; installed lockfile ${installed ?? 'unverified'}`
      }
    }
  } catch (why) {
    const words = why instanceof Error ? why.message : String(why)
    refuse(!mayHaveMade ? words : removeANewRoundWorktree(sb, worktree, startAt, words))
  }

  const keyFolder = hostOnlyFolder(sb.name)
  mkdirSync(keyFolder, { recursive: true, mode: 0o700 })
  let filed
  try { filed = fileARun({
    api,
    workspace: sb.workspace,
    as: who.agent,
    session: who.session,
    parent,
    ...(brief === undefined ? {} : { brief }),
    ...(chosen['asked-by'] === undefined ? {} : { askedBy: chosen['asked-by'] }),
    handle: agent,
    worktree: dir,
    cutFrom: cut,
    ...(startAt === undefined || recordedCut === undefined ? {} : { cutFromCommit: recordedCut }),
    runtime,
    model: theModel,
    title: title ?? A_RUN_GIVEN_NO_TITLE,
    sandbox: theSandboxField(sb.instance, realpathSync(sb.dir)),
    continues: continues ?? null,
    flow: flow ?? null,
    keyFolder,
  }) } catch (error) {
    const words = error instanceof Error ? error.message : String(error)
    refuse(startAt === undefined ? words : removeANewRoundWorktree(sb, worktree, startAt, words))
  }
  if (!filed.ok) {
    if (startAt !== undefined) {
      const detail = filed.says === '' ? '' : `${filed.says} `
      refuse(removeANewRoundWorktree(sb, worktree, startAt, `${detail}The run could not be filed (tools/register-a-run.mjs exited ${filed.exited}). Nothing was started.`))
    }
    if (filed.says !== '') process.stderr.write(`${filed.says}\n`)
    const words = `the run could not be filed (tools/register-a-run.mjs exited ${filed.exited}), so nothing was started.`
    refuse(startAt === undefined ? words : removeANewRoundWorktree(sb, worktree, startAt, words))
  }
  filedLaunchRun = filed.id
  try {
    // ON THE HOST'S LIST before anything else is done for it, so that a round can continue it (theHostsList).
    // containerSession is the session that registered this sandbox's container row, under which a round finds that row
    // once the container has been made again (whyARunWasNotFiledHere).
    writeTheHostsEntry(sb, { run: filed.id, agent, runtime, filedAt: clockStamp().instant, started: null, neverStarted: null, containerSession: sb.instance.startedBy?.session ?? null })
    const branch = theWorktreesBranchAfterFiling(made, filed.id, gitInside(sb))
    if (branch !== null) say(branch, true)
  } catch (why) {
    let words = why instanceof Error ? why.message : String(why)
    if (startAt !== undefined) words = removeANewRoundWorktree(sb, worktree, startAt, words)
    await theFiledRunNeverStarted(sb, who, { ...filed, agent }, words)
    refuse(words)
  }
  say(
    filed.key !== null
      ? `run ${filed.id} of ${agent} is filed here with ${who.agent}'s key, and holds a key of ${agent} of its own, for the helper and its command.`
      : `run ${filed.id} of ${agent} is filed here, and the office answered no key for it${theAgentKey() === null ? `: ${who.agent} sent none` : ''}.`,
    filed.key !== null,
  )
  const words = theWordsThatFileARun({ agent, runtime, model: theModel, worktree: dir, clone, cutFrom: cut, title, brief })
  return { id: filed.id, key: filed.key, agent, model: theModel, startValues, packages, worktree: dir, words: [...words, '--filed', filed.id] }
}

/**
 * A RUN FILED HERE THAT THE HELPER DID NOT START is marked so, and not left saying running for ever. It is written as
 * the run when the run holds its own key, and as the caller otherwise; one the helper marked already is left as it is.
 */
async function theFiledRunNeverStarted(sb, who, filed, why) {
  if (filed === null || filed.id === null) return
  try { markTheHostsEntry(sb, filed.id, { neverStarted: why }) }
  catch (failed) { say(`run ${filed.id} never started, and the host's list of the runs it filed in sandbox ${sb.name} could not say so (${failed instanceof Error ? failed.message : String(failed)}).`) }
  const headers =
    filed.key !== null
      ? officeHeaders({ workspace: sb.workspace, agent: filed.agent, session: filed.id, key: filed.key })
      : theCallerNamed(sb.workspace, who)
  const read = await askTheOffice(api, `/api/records/${encodeURIComponent(filed.id)}`, { workspace: sb.workspace, headers })
  const state = (read.body?.record ?? read.body)?.data?.state
  if (read.status === 200 && state !== 'running') return
  const said = await askTheOffice(api, `/api/records/${encodeURIComponent(filed.id)}`, {
    method: 'PATCH',
    workspace: sb.workspace,
    headers,
    body: { dataPatch: { state: 'crashed', detail: `It never started in sandbox ${sb.name}: ${why}` } },
  })
  if (said.status !== 200) say(`run ${filed.id} was filed here and never started, and it could not be marked so (${theOfficeSaid(said)}); it may still say running.`)
}

/**
 * THE HELPER'S WORDS FOR AN AGENT'S RUN, in one place: exec --agent, worker and round all build them here.
 * For a run filed here they go with `--filed <run id>` (anAgentsRunFiledHere). For a helper from
 * before --filed they ask it to file the run itself, and `continues`, the run a second round continues, is written as
 * that run's link, and `flow` the flow the run follows. A value left out is not passed, so the helper says what is missing.
 */
function theWordsThatFileARun({ agent, runtime, model, worktree, clone = null, cutFrom, title, brief, continues, flow }) {
  const words = ['--agent', agent]
  const add = (flag, value) => {
    if (value !== undefined && value !== null) words.push(flag, value)
  }
  add('--runtime', runtime)
  add('--model', model)
  add('--worktree', worktree)
  add('--clone', clone)
  add('--cut-from', cutFrom)
  add('--title', title)
  add('--brief', brief)
  add('--continues', continues)
  add('--flow', flow)
  return words
}

async function commandExec() {
  if (chosen['check-view'] !== undefined) return commandCheckView()
  if (chosen['plain-env'] === true && chosen['starts-runs'] === true) usage('--starts-runs cannot be used with --plain-env: such a command holds no key.')
  if (chosen.isolated === true && chosen['starts-runs'] === true) usage('--starts-runs cannot be used with --isolated: an isolated run holds no office variable and no key, so there is nothing to keep.')
  if (chosen['starts-runs'] === true && chosen.agent === undefined && chosen.run === undefined) usage("--starts-runs needs an agent's run (--agent or --run): a plain command holds no run key, so there is nothing to keep.")
  if (chosen.parent !== undefined && (chosen.agent === undefined || chosen.isolated === true)) {
    usage('--parent needs exec --agent, which files a run; a plain command, --run or --isolated files no run.')
  }
  if (chosen.selection !== undefined && (chosen.agent === undefined || chosen.isolated === true)) {
    usage('--selection needs exec --agent, which files a run; a plain command, --run or --isolated takes no selection.')
  }
  if (chosen.secret.length > 0) {
    if (chosen['plain-env'] === true) usage('--secret cannot be used with --plain-env: a plain-env command gets no secrets.')
    if (chosen.agent !== undefined || chosen.isolated === true) usage('--secret cannot be used with an agent run or --isolated: the runtime already selects its secrets.')
  }
  // A check's model runs its tests: --no-office-variables is its road, alongside merge's plain-env and heavy work's slot.
  // Filed runs are agent work, including workers and rounds, and are never disk-gated.
  const aBuildOrTest = chosen.agent === undefined && chosen.run === undefined && chosen.isolated !== true &&
      ((chosen.wait === true && chosen['plain-env'] === true) || chosen.slot !== undefined || chosen['no-office-variables'] === true)
  if (aBuildOrTest) roomForABuildOrTest()
  if (chosen.isolated === true) return commandExecIsolated()
  const [name, extra] = chosen.targets
  if (name === undefined || extra !== undefined) usage('Say which sandbox, once: node tools/sandbox.mjs exec <instance> ...')
  // AN AGENT'S RUN NEEDS ITS RUNTIME, refused here before any env file is written: the helper refuses it too, but only
  // after every declared login has gone into the container for it.
  if (chosen.agent !== undefined && chosen.runtime === undefined) usage('An agent run needs --runtime, which goes on its run record.')
  // NO AGENT RUN IN THE SANDBOX'S SHARED CHECKOUT, refused before main is moved, the office is asked or docker is called
  // (whyARunMayNotWorkIn in tools/sandbox-common.mjs says why).
  if (chosen.agent !== undefined && chosen.worktree !== undefined) {
    const shared = whyARunMayNotWorkIn(instanceFolder(name), chosen.worktree, { agent: chosen.agent })
    if (shared !== null) refuse(shared, 2)
  }
  if (chosen.agent !== undefined && chosen['plain-env'] !== true) theAddressARunCommitsAt(); else theCommitAddress()
  // AN AGENT'S RUN READS ITS COMPACTION WINDOW BEFORE IT IS FILED, so a setting that cannot be used leaves no run behind.
  // A plain command files nothing, and startThroughTheHelper reads it.
  const claudeCodes = chosen.agent === undefined ? null : theClaudeCodeVariablesInASandbox()
  const who = whoIsAsking()
  const sb = await aSandboxToStartIn(name, who)
  const { dir, helper } = sb
  // EVERY GO SLOT USED UP: a run that would start on OpenCode Go starts on dsh instead, or starts on Go and says why it
  // cannot go to dsh, in one sentence (tools/provider-router-host.mjs). Asked before anything is prepared or filed.
  const goSlotsUsedUp = chosen.agent === undefined ? null : await theStartWhenEveryGoSlotIsUsedUp({
    sandboxes, agent: chosen.agent, runtime: chosen.runtime, model: chosen.model, brief: chosen.brief,
    ask: (path) => askTheOffice(api, path, { workspace: sb.workspace, headers: theCallerNamed(sb.workspace, who) }),
  })
  if (goSlotsUsedUp !== null && 'refusal' in goSlotsUsedUp) refuse(goSlotsUsedUp.refusal, 2)
  if (goSlotsUsedUp !== null) {
    say(goSlotsUsedUp.says)
    sb.startSaysFirst = goSlotsUsedUp.says
    if (goSlotsUsedUp.dsh !== null) Object.assign(chosen, { runtime: goSlotsUsedUp.dsh.runtime, model: goSlotsUsedUp.dsh.model, command: null })
  }
  const selection = chosen.agent === undefined || chosen.selection === undefined ? undefined : theSelectionGiven(chosen.runtime, chosen.model)
  let runRuntime = chosen.agent !== undefined ? chosen.runtime : undefined
  // --agent with --run is invalid. Keep its existing refusal ahead of any run lookup.
  if (chosen.agent === undefined && chosen.run !== undefined) {
    const read = await askTheOffice(api, `/api/records/${encodeURIComponent(chosen.run)}`, { workspace: sb.workspace, headers: theCallerNamed(sb.workspace, who) })
    if (read.status !== 200) refuse(`The run ${chosen.run} could not be read (${theOfficeSaid(read)}). Nothing was started.`)
    const record = read.body?.record ?? read.body
    if (record?.kind !== 'session') refuse(`${chosen.run} is not a run. Nothing was started.`)
    runRuntime = record.data?.runtime
  }
  if (chosen.agent === undefined) {
    checkCodexBeforeStart(chosen.command, { runtime: runRuntime, plain: chosen.run === undefined })
    checkHelperPermissions(sb)
  }
  sb.opencodeRuntime = aCommandsRuntime(chosen.command ?? [], runRuntime)
  prepareOpenCodeBeforeFiling(sb, sb.opencodeRuntime)
  // THE SAME BUILDS AND TESTS NEED MEMORY TOO: what this container may still take under its limit, and the margin
  // (roomInMemory). A container docker reports with no limit is read at the default limit.
  if (aBuildOrTest) {
    const container = inspectContainer(`${CONTAINER_PREFIX}${name}`)
    const limit = Number(container?.HostConfig?.Memory) > 0 ? Number(container?.HostConfig?.Memory) : (bytesOfAMemoryFigure(SANDBOX_DEFAULTS.memory) ?? 0)
    roomInMemory(limit, theMemoryAContainerHolds(container?.State?.Pid), `the command in sandbox ${name}`)
  }
  // A PLAIN COMMAND HOLDS ONLY THE SECRETS IT NAMES: full permissions and the internet let a poisoned file send out
  // any login it holds. An earlier decision and message, and the problem that followed.
  const requestedSecrets = chosen.agent !== undefined || chosen['plain-env'] === true
    ? null
    : chosen.secret.length === 0
      ? theNoSecretsFor(sb.instance, 'no secret was passed: a plain command gets only the secrets named with --secret.')
      : theSecretsFor(sb.instance, undefined, chosen.secret)

  // THE CALLER'S OWN COMMAND HAS ITS ROW WRITTEN HERE, ON THE HOST, with the caller's key, when the helper in this
  // sandbox's clone knows how (see the header): a build or a suite since acceptance finding 77, and every other own
  // command since the owner closed the key window on 27 September 2026, because from then on the
  // office refuses a write with no key, which is all the helper inside can send. A run files its own row with its own
  // key. A command that holds a seat and does not wait keeps the helper's seat and its row. A clone from before runs as
  // it always did, and says why.
  const helperSays = readFileSync(helper, 'utf8')
  const ownCommand = chosen.agent === undefined && chosen.run === undefined
  const aBuildOrASuite = chosen.wait === true && chosen['plain-env'] === true
  const theHelperCan = aBuildOrASuite ? helperSays.includes("'handshake'") : helperSays.includes('THE_HOST_WRITES_EVERY_OWN_COMMANDS_ROW')
  const theHostWritesTheRow = ownCommand && (chosen.wait === true || chosen.slot === undefined) && theHelperCan
  if (aBuildOrASuite && !theHostWritesTheRow) {
    say(`the helper in ${helper} is from before the host wrote a build's process row, so the row is written from inside the container, as before; a container with no network cannot start it.`)
  } else if (ownCommand && !theHostWritesTheRow) {
    say(
      theHelperCan
        ? 'this command holds a seat and does not wait, so the helper holds the seat and writes its row from inside the container, with no key; once the key window is closed the office refuses that write.'
        : `the helper in ${helper} is from before the host wrote every own command's process row, so the row is written from inside the container, with no key; once the key window is closed the office refuses that write.`,
    )
  }
  const handshake = theHostWritesTheRow ? join(dir, 'handshakes', `exec-${fileNameStamp(new Date())}-${randomBytes(3).toString('hex')}`) : null
  if (handshake !== null) mkdirSync(handshake, { recursive: true })

  // THE HELPER'S OWN WORDS, passed through as they were given; on the host-row path the seat is this process's, not the
  // helper's. An agent's run is asked for in the one way (theWordsThatFileARun); without --agent, a flag that belongs to
  // an agent's run is passed on as it came, and the helper refuses it.
  // AN AGENT'S RUN WITH A BRIEF is given the standing stages of its flows before that brief, as a worker is.
  const given = chosen.agent === undefined || chosen.brief === undefined
    ? { brief: chosen.brief, command: chosen.command }
    : theBriefWithTheStandingStages({ sandboxDir: dir, brief: chosen.brief, standing: await theStandingStagesFor(chosen.agent, sb, who), command: chosen.command })
  const brief = given.brief === undefined ? undefined : theBriefInside(dir, given.brief)
  const passed = []
  let filed = null
  if (chosen.agent !== undefined) {
    refreshMainBeforeRun(sb)
    filed = await anAgentsRunFiledHere(sb, who, {
      agent: chosen.agent,
      runtime: chosen.runtime,
      model: chosen.model ?? selection?.model,
      selection,
      worktree: chosen.worktree,
      clone: chosen.clone ?? null,
      cutFrom: chosen['cut-from'],
      cutNamed: chosen['cut-from'] !== undefined,
      title: chosen.title,
      parent: chosen.parent,
      flow: chosen.flow,
      brief,
      command: given.command,
      leaving: true,
    })
    if (goSlotsUsedUp?.dsh != null && typeof filed.id === 'string') {
      const headers = filed.key !== null ? officeHeaders({ workspace: sb.workspace, agent: filed.agent, session: filed.id, key: filed.key }) : theCallerNamed(sb.workspace, who)
      const unsaid = await theRunSaysWhyItIsOnDsh(filed.id, goSlotsUsedUp.says, (path, options = {}) => askTheOffice(api, path, { workspace: sb.workspace, headers, ...options }))
      if (unsaid !== null) {
        const why = `run ${filed.id} could not be told why it starts on dsh (${unsaid})`
        await theFiledRunNeverStarted(sb, who, filed, why)
        refuse(`${why}. Nothing was started.`)
      }
    }
    passed.push(...filed.words)
  } else {
    for (const flag of ['runtime', 'model', 'worktree', 'clone', 'cut-from', 'title', 'flow']) if (chosen[flag] !== undefined) passed.push(`--${flag}`, chosen[flag])
    if (brief !== undefined) passed.push('--brief', brief)
  }
  for (const flag of ['cwd', 'slot', 'run', 'timeout']) {
    if (flag === 'slot' && handshake !== null) continue
    if (chosen[flag] !== undefined) passed.push(`--${flag}`, chosen[flag])
  }
  if (handshake !== null) passed.push('--handshake', handshake)
  for (const flag of ['wait', 'plain-env', 'no-office-variables', 'starts-runs']) if (chosen[flag] === true) passed.push(`--${flag}`)
  if (given.command !== null) passed.push('--', ...given.command)

  const start = await startThroughTheHelper(sb, who, passed, handshake, filed, chosen.agent !== undefined ? chosen.runtime : undefined, requestedSecrets, claudeCodes)
  printTheStart(start, undefined, filed?.worktree ?? null)
}

function writeCheckViewFailure(ticket, why, code) {
  if (existsSync(ticket.receipt)) return
  for (const file of [ticket.out, ticket.err]) if (!existsSync(file)) writeFileSync(file, '', { flag: 'wx', mode: 0o600 })
  appendFileSync(ticket.err, why + '\n')
  for (const file of [ticket.out, ticket.err]) chmodSync(file, 0o600)
  writeJsonWhole(ticket.exit, code)
  writeJsonWhole(ticket.receipt, { started: false, code, why, view: { container: ticket.container, sha256: ticket.sha256 }, released: [] })
}

/**
 * Check-view execution stays on the host. The detached controller captures evidence and survives
 * a release of the command's host group. The native gate owns that group and cannot run the
 * command before the ledger holds both rows. No office helper or handshake storage is mounted.
 */
async function commandCheckView() {
  const [name, extra] = chosen.targets
  if (name === undefined || extra !== undefined) usage('Check view needs exactly one inspector instance.')
  for (const flag of ['agent', 'run', 'isolated', 'starts-runs', 'plain-env', 'runtime', 'model', 'worktree', 'clone', 'cut-from', 'title', 'brief', 'parent', 'flow', 'slot']) {
    if (chosen[flag] !== undefined) usage(`Check view does not take --${flag}; it runs the caller's command without filing another run.`)
  }
  if (chosen['no-office-variables'] !== true) usage('Check view requires --no-office-variables.')
  if (chosen.cwd === undefined || chosen.command === null || chosen.command.length === 0) usage('Check view needs --cwd <private-copy> and a command after --.')
  const seconds = chosen.timeout === undefined ? null : Number(chosen.timeout)
  if (seconds !== null && (!Number.isFinite(seconds) || seconds <= 0)) usage('Check view timeout must be a positive number of seconds.')
  const who = whoIsAsking()
  const dir = instanceFolder(name)
  const instance = await theFactsOrRefuse(name, who, `Check view has no instance ${name}.`)
  let view
  try { view = readCheckView(resolve(chosen['check-view']), { instance: name, dir, cwd: resolve(chosen.cwd) }) }
  catch (error) { refuse(error.message) }
  // THE OFFICE'S DATA FOLDER, asked here and not in readCheckView, which sandbox-common.mjs holds (see
  // tools/the-offices-data-folder.mjs). The inspector's check views come through this exec too.
  for (const mount of view.mounts) {
    const data = whyAPathIsTheOfficesDataFolder(mount.host)
    if (data !== null) refuse(`Check view refused: ${data}`)
  }
  const container = inspectContainer(instance.container.name)
  if (!container?.State?.Running || typeof container.Config?.Image !== 'string') refuse('Check view needs a running instance with a known image; no ordinary exec was started.')
  const network = container.HostConfig?.NetworkMode
  if (!['host', 'none', 'bridge', 'default'].includes(network)) refuse(`Check view cannot copy the instance network rules ${String(network)}.`)
  const workspace = chosen.workspace ?? instance.workspace
  const controllerTicket = process.env.MOLE_CHECK_VIEW_CONTROLLER
  if (controllerTicket !== undefined) {
    const ticket = JSON.parse(readFileSync(controllerTicket, 'utf8'))
    if (ticket.sha256 !== view.sha256) refuse('Check view spec changed before its controller started.')
    return controlCheckView({ name, dir, instance, workspace, who, container, network, view, ticket, seconds })
  }
  // A CHECK THAT ASKS FOR AN API KEY, by name or in a provider key file, needs the provider router while it is on, and
  // none is handed one then: it is refused here, in the router's words when the router does not answer.
  if (theProviderRouterIsOn() && (chosen.secret.some((one) => THE_API_KEY_NAMES.includes(one)) || chosen['provider-key-file'] !== undefined)) {
    const down = await whetherTheRouterIsDown(sandboxes)
    if (down !== null) refuse(down, 2)
  }
  // NOR IS A CHECK STARTED WHILE ITS PRIVATE HOME, OR A LOGIN SEED COPIED INTO IT, HOLDS AN API KEY.
  const seeds = view.mounts.filter((mount) => mount.kind === 'loginSeeds')
  const keyInALogin = theProviderRouterIsOn() ? whyAStartIsRefusedForTheLoginFiles(view.home.host, theLoginFilesOfACheckHome(seeds), `The private home of the check ${view.spec.check}, with its login seeds,`) : null
  if (keyInALogin !== null) refuse(keyInALogin, 2)
  roomForABuildOrTest()
  roomInMemory(bytesOfAMemoryFigure(SANDBOX_DEFAULTS.memory), 0, 'the private check view')
  // No instance environment is copied. Only explicitly named, declared provider secrets are read.
  const secrets = chosen.secret.length === 0 ? { lines: [] } : theSecretsFor(instance, undefined, chosen.secret)
  if (secrets.lines.some(leftOut)) refuse('Check view cannot pass office variables or office keys as declared secrets.')
  // A PROVIDER KEY FILE IS READ HERE TO REFUSE IT EARLY, and left for the controller, which removes it as it reads it.
  if (chosen['provider-key-file'] !== undefined) {
    try { whatTheProviderKeyFileHands(resolve(chosen['provider-key-file']), { view, network, remove: false }) } catch (error) { refuse(error.message) }
  }
  mkdirSync(view.spec.outputs.dir, { recursive: true, mode: 0o700 })
  const output = mkdtempSync(join(view.spec.outputs.dir, 'command-'))
  const ticket = {
    sha256: view.sha256, output,
    ready: join(output, 'start.json'), receipt: join(output, 'receipt.json'),
    out: join(output, 'stdout'), err: join(output, 'stderr'), exit: join(output, 'exit'),
    container: `mole-office-checkview-${view.spec.check.toLowerCase()}-${randomBytes(8).toString('hex')}`,
  }
  const privateTicket = join(hostOnlyFolder(name), `checkview-${randomBytes(8).toString('hex')}.json`)
  mkdirSync(dirname(privateTicket), { recursive: true, mode: 0o700 })
  writeFileSync(privateTicket, JSON.stringify(ticket), { mode: 0o600 })
  const log = openSync(join(output, 'controller.log'), 'wx', 0o600)
  const controller = spawn(process.execPath, process.argv.slice(1), {
    detached: true, stdio: ['ignore', log, log],
    env: { ...process.env, MOLE_CHECK_VIEW_CONTROLLER: privateTicket },
  })
  closeSync(log)
  let controllerEnded = false
  controller.on('error', () => { controllerEnded = true })
  controller.on('exit', () => { controllerEnded = true })
  controller.unref()
  let cancelled = false
  const forward = () => { cancelled = true; controller.kill('SIGTERM') }
  for (const signal of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(signal, forward)
  const until = Date.now() + 60_000
  while (!existsSync(ticket.ready) && !existsSync(ticket.receipt) && !controllerEnded && Date.now() < until) await new Promise(r => setTimeout(r, 30))
  if (!existsSync(ticket.ready)) {
    if (!existsSync(ticket.receipt) && controller.pid !== undefined) controller.kill('SIGTERM')
    if (controllerEnded && !existsSync(ticket.receipt)) writeCheckViewFailure(ticket, 'The host controller ended before reporting startup; command execution is unverified.', 1)
    const reason = existsSync(ticket.receipt) ? JSON.parse(readFileSync(ticket.receipt, 'utf8')).why : 'The controller ended or did not answer within a minute.'
    refuse(`Check view could not start: ${reason}. Evidence: ${ticket.receipt}. No fallback exec was started.`)
  }
  const start = JSON.parse(readFileSync(ticket.ready, 'utf8'))
  printTheStart(start)
  if (chosen.wait === true || cancelled) {
    while (!existsSync(ticket.receipt)) await new Promise(r => setTimeout(r, 50))
    process.exitCode = JSON.parse(readFileSync(ticket.receipt, 'utf8')).code
  }
  for (const signal of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.removeListener(signal, forward)
}

/**
 * WHETHER A BASE ADDRESS'S HOST IS A LOOPBACK HOST, as the URL parser writes it: localhost and the names under it,
 * 127.0.0.0/8, ::1 and 127.0.0.1 written as IPv6, and 0.0.0.0 and ::, which reach the loopback too.
 */
const aLoopbackHost = host => host === 'localhost' || host.endsWith('.localhost') || /^127\.\d+\.\d+\.\d+$/.test(host) ||
  host === '[::1]' || /^\[::ffff:7f[0-9a-f]{2}:[0-9a-f]{1,4}\]$/.test(host) || host === '0.0.0.0' || host === '[::]'

/** Why a loopback base address is refused, by the network the check's container is on. */
const THE_LOOPBACK_REFUSAL = Object.freeze({
  none: (name, host) => `Check view refused: the provider's ${name} names ${host}, a loopback address, and this check's container is on docker's none network, where it has only its own loopback, so ${host} is the container itself, not this machine. Nothing was started.`,
  bridge: (name, host) => `Check view refused: the provider's ${name} names ${host}, a loopback address, and this check's container is on docker's bridge network, where 127.0.0.1 inside the check container is the container itself, not this machine. Nothing was started.`,
})

/**
 * WHAT A CHECK VIEW WAS HANDED FROM A PROVIDER KEY FILE, in its start's words, so a wrong address shows in the check's
 * record: the key by its variable's name alone, the base address whole, and the network the container is on. On the
 * host's network a loopback address is taken, and the words say why.
 */
const theProviderHandedSays = ({ key, address, value, host, network }) =>
  `This check view was handed the provider's ${key}, whose value is not shown, and ${address}=${value}. Its container is on ` +
  (network === 'host'
    ? `the host's network${aLoopbackHost(host) ? `, where ${host} is this machine and not the container, so the loopback address reaches what it names on this machine` : ''}.`
    : `docker's ${network === 'default' ? 'default network, which is bridge' : `${network} network`}.`)

/**
 * THE ONE PROVIDER KEY A CHECK VIEW IS HANDED, from the file --provider-key-file names, which the inspector wrote for this
 * one command (aProviderKeyFile in tools/inspector-sandbox.mjs). It opens that one file, without following a link, and
 * reads its folder's real path first, so no link anywhere in the path is followed: a path whose folder is reached through
 * a link is refused before the file is opened. The folder must be this user's, of mode 0700, and the file this user's
 * regular file of mode 0600, in no folder the view mounts and outside the view's outputs, each compared by its real path.
 * It holds exactly two lines: the key's variable and the base address's, a name ending _BASE_URL. Neither may be an
 * office variable or key. A loopback base address is refused off the host's network, where 127.0.0.1 is the container
 * itself. `remove` removes the file as soon as it is read. Answers the two lines, and the start's words for them
 * (theProviderHandedSays); throws a sentence that names no value.
 *
 * WHILE THE PROVIDER ROUTER IS ON, EVERY SUCH FILE IS REFUSED, unread and left as every refused file is: the file exists
 * only to hand a provider's API key, and while the router is on only the router holds one. Its key's name proves
 * nothing, since a provider row's key goes in under a name of the inspector's own.
 */
function whatTheProviderKeyFileHands(file, { view, network, remove }) {
  const refused = (why) => new Error(`Check view refused the provider key file: ${why}. Nothing was started.`)
  if (!isAbsolute(file)) throw refused('its path is not absolute')
  let folder
  try { folder = realpathSync(dirname(file)) } catch { throw refused('its folder cannot be read') }
  if (join(folder, basename(file)) !== file) throw refused('its folder is reached through a link')
  const real = (path) => { try { return realpathSync(path) } catch { return resolve(path) } }
  if (view.mounts.some(mount => within(file, mount.host) || within(file, real(mount.host))) ||
      within(file, view.spec.outputs.dir) || within(file, real(view.spec.outputs.dir))) throw refused('it is inside a folder the view mounts or writes')
  const kept = statSync(folder)
  if (!kept.isDirectory() || (kept.mode & 0o777) !== 0o700 || kept.uid !== process.getuid()) throw refused("its folder is not this user's folder of mode 700")
  if (theProviderRouterIsOn()) throw refused(`${THE_ROUTER_SETTING} is on, and while it is on only the provider router holds a provider's API key, so no check view is handed one`)
  let text
  let fd = null
  try {
    try { fd = openSync(file, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW) } catch { throw refused('it cannot be opened as a file that is not a link') }
    const held = fstatSync(fd)
    if (!held.isFile() || (held.mode & 0o777) !== 0o600 || held.uid !== process.getuid()) throw refused("it is not this user's regular file of mode 600")
    text = readFileSync(fd, 'utf8')
  } finally {
    if (fd !== null) closeSync(fd)
    if (remove) rmSync(file, { force: true })
  }
  const lines = text.endsWith('\n') ? text.slice(0, -1).split('\n') : []
  if (lines.length !== 2) throw refused('it does not hold exactly two lines')
  const named = lines.map(line => ({ line, name: line.slice(0, Math.max(0, line.indexOf('='))), value: line.slice(line.indexOf('=') + 1) }))
  if (named.some(one => !/^[A-Z][A-Z0-9_]*$/.test(one.name) || one.value === '' || /[\s\p{Cc}]/u.test(one.value))) throw refused('a line is not one NAME=value whose value has no space')
  const address = named.filter(one => one.name.endsWith('_BASE_URL')), key = named.filter(one => !one.name.endsWith('_BASE_URL'))
  if (address.length !== 1 || key.length !== 1) throw refused('it does not hold one key and one base address')
  if (lines.some(leftOut)) throw refused('it names an office variable or an office key')
  let host
  try { host = new URL(address[0].value).hostname } catch { throw refused(`${address[0].name} is not an address`) }
  if (network !== 'host' && aLoopbackHost(host)) throw new Error(THE_LOOPBACK_REFUSAL[network === 'none' ? 'none' : 'bridge'](address[0].name, host))
  return { lines, says: theProviderHandedSays({ key: key[0].name, address: address[0].name, value: address[0].value, host, network }) }
}

/** The in-container program uses no office code, key, or shared writable launch metadata. */
const CHECK_VIEW_COMMAND = String.raw`
const fs = require('fs'), path = require('path'), cp = require('child_process')
const cfg = JSON.parse(process.argv[1])
for (const name of Object.keys(process.env)) if (!cfg.envNames.includes(name)) delete process.env[name]
fs.mkdirSync(process.env.TMPDIR, { recursive: true, mode: 0o700 })
for (const seed of cfg.seeds) {
  const destination = path.join(process.env.HOME, seed.target)
  fs.mkdirSync(path.dirname(destination), { recursive: true, mode: 0o700 })
  // Never follow a model-written symlink while copying the trusted login seed.
  let at = process.env.HOME
  for (const part of seed.target.split('/')) {
    at = path.join(at, part)
    try { if (fs.lstatSync(at).isSymbolicLink()) throw new Error('A login seed target is a symlink: ' + at) }
    catch (error) { if (error.code !== 'ENOENT') throw error }
  }
  if (!fs.existsSync(destination)) fs.copyFileSync(seed.container, destination, fs.constants.COPYFILE_EXCL)
  fs.chmodSync(destination, 0o600)
}
const command = process.argv.slice(2)
const child = cp.spawn('sh', ['-c', 'IFS= read -r go; [ "$go" = go ] || exit 111; exec "$@"', 'check-view-gate', ...command], { detached:true, stdio: ['pipe','inherit','inherit'], env: process.env })
process.stderr.write(cfg.ready + child.pid + '\n')
process.stdin.once('data', bytes => child.stdin.end(bytes))
process.stdin.on('end', () => { if (!child.stdin.writableEnded) child.stdin.end() })
child.on('error', error => { console.error(error.message); process.exitCode = 127 })
child.on('exit', (code, signal) => process.exit(code ?? (signal ? 128 + require('os').constants.signals[signal] : 1)))
`

async function controlCheckView({ name, dir, instance, workspace, who, container, network, view, ticket, seconds }) {
  const headers = theCallerNamed(workspace, who)
  const lock = join(view.privateRoot, 'command.lock')
  let containerRow = null, processRow = null, child = null, envFile = null, timer = null
  let locked = false, started = false, innerPid = null, code = 1, why = null, stopping = null
  const released = []
  const readyToken = `checkview-${randomBytes(16).toString('hex')}:`
  let stderrPending = ''
  const stop = signal => {
    if (stopping !== null) return stopping
    code = signal === 'timeout' ? 124 : 128 + osConstants.signals[signal]
    why = signal === 'timeout' ? 'The check view command timed out.' : `The check view command was interrupted by ${signal}.`
    stopping = (async () => {
      try { if (containerRow !== null) await release(containerRow, why) }
      finally { if (child?.pid) { try { process.kill(-child.pid, 'SIGTERM') } catch (e) { if (e.code !== 'ESRCH') throw e } } }
    })()
    return stopping
  }
  const release = async (id, note) => {
    if (released.includes(id)) return
    const answer = await releaseTheRow(api, id, { force: true, note, headers })
    if (answer.status !== 200) throw new Error(`The ledger could not release ${id}: ${theOfficeSaid(answer)}`)
    released.push(id)
  }
  const onSignals = Object.fromEntries(['SIGTERM', 'SIGINT', 'SIGHUP'].map(signal => [signal, () => { stop(signal).catch(error => { why = error.message }) }]))
  for (const [signal, handler] of Object.entries(onSignals)) process.on(signal, handler)
  for (const [signal, handler] of Object.entries(controllerStartupSignals)) process.removeListener(signal, handler)
  for (const file of [ticket.out, ticket.err]) writeFileSync(file, '', { flag: 'wx', mode: 0o600 })
  try {
    // THE PROVIDER KEY FILE IS READ FIRST AND REMOVED AS IT IS READ, so it is gone before the container starts; its two
    // lines go into the env file below, which is removed once the container has started.
    const provider = chosen['provider-key-file'] === undefined ? null : whatTheProviderKeyFileHands(resolve(chosen['provider-key-file']), { view, network, remove: true })
    const providerLines = provider === null ? [] : provider.lines
    const providerNames = providerLines.map(line => line.slice(0, line.indexOf('=')))
    const secrets = chosen.secret.length === 0 ? { lines: [] } : theSecretsFor(instance, undefined, chosen.secret)
    if (secrets.lines.some(leftOut)) throw new Error('Office variables or keys cannot enter a check view.')
    try { mkdirSync(lock); locked = true } catch (error) { if (error.code === 'EEXIST') throw new Error('This check already has a command, or an unreleased command lock.'); throw error }
    const permissions = aCommandsPermissions(chosen.command, { SANDBOX_DIR: view.work.container })
    prepareOpenCodeRunHome(view.home.host, aCommandsRuntime(chosen.command), false)
    const lines = [
      ...theRoutedKeysLeftOut({ lines: (container.Config.Env ?? []).filter(line => !leftOut(line) && !providerNames.includes(line.slice(0, line.indexOf('=')))), says: '' }, undefined).selection.lines,
      'PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
      'HOME=/check/home', 'TMPDIR=/check/tmp', 'CODEX_HOME=/check/home/.codex', `SANDBOX_DIR=${view.work.container}`,
      'XDG_CONFIG_HOME=/check/home/.config', 'XDG_DATA_HOME=/check/home/.local/share', 'XDG_CACHE_HOME=/check/home/.cache',
      ...secrets.lines, ...providerLines, ...Object.entries(permissions.env).filter(([, value]) => value !== null).map(([key, value]) => `${key}=${value}`),
    ]
    envFile = writeTheEnvFile(hostOnlyFolder(name), lines)
    const registration = await askTheOfficeWhileItRestarts(api, '/api/resources', { method: 'POST', workspace, headers, body: {
      type: 'container', key: ticket.container, sessionRecordId: who.session,
      detail: `Private container view for check ${view.spec.check} in ${name}; releasing this row stops it.`,
    } }, { saying: say })
    if (registration.status !== 201) throw new Error(`The ledger refused the check view container: ${theOfficeSaid(registration)}`)
    containerRow = registration.body.resource.id
    const config = { ready: readyToken, envNames: lines.map(line => line.slice(0, line.indexOf('='))), seeds: view.spec.loginSeeds ?? [] }
    // ITS OWN HOST NAME ON THE HOST'S NETWORK, as a sandbox has (aHostNameFor). Off it docker names the container by its
    // id, and the arguments are as they were.
    const hostName = network === 'host' ? aHostNameFor(ticket.container) : null
    const args = ['run', '--rm', '--init', '-i', '--name', ticket.container, '--user', container.Config.User || '1000:1000',
      '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
      ...theSandboxLimitArgs(), ...theRoomForPictures(), '--network', network === 'default' ? 'bridge' : network,
      ...(hostName === null ? [] : theOwnNameOnTheHostsNetwork(hostName)),
      '--label', `${CHECK_VIEW_LABEL}=${view.spec.check}`, '--env-file', envFile, '-w', view.work.container,
      ...view.mounts.flatMap(m => ['--mount', `type=bind,source=${m.host},target=${m.container}${m.readonly ? ',readonly' : ''}`]),
      '--entrypoint', 'node', container.Config.Image, '-e', CHECK_VIEW_COMMAND, JSON.stringify(config), ...permissions.command]
    // The container row is already held. Native execution waits for container-pid registration.
    child = spawn('docker', args, {
      detached: true, stdio: ['pipe', 'pipe', 'pipe'],
    })
    const ended = new Promise((done, reject) => { child.on('error', reject); child.on('close', (exit, signal) => done(exit ?? (signal ? 128 + osConstants.signals[signal] : 1))) })
    let ready
    const nativeReady = new Promise(done => { ready = done })
    child.stdout.on('data', chunk => appendFileSync(ticket.out, chunk))
    child.stderr.on('data', chunk => {
      if (started) { appendFileSync(ticket.err, chunk); return }
      stderrPending += chunk.toString('utf8')
      for (;;) {
        const at = stderrPending.indexOf('\n')
        if (at < 0) break
        const line = stderrPending.slice(0, at); stderrPending = stderrPending.slice(at + 1)
        if (line.startsWith(readyToken) && /^\d+$/.test(line.slice(readyToken.length))) {
          innerPid = Number(line.slice(readyToken.length)); ready(innerPid)
          if (envFile !== null) { unlinkSync(envFile); envFile = null }
        } else appendFileSync(ticket.err, line + '\n')
      }
    })
    const first = await Promise.race([nativeReady.then(pid => ({ pid })), ended.then(exit => ({ exit }))])
    if (first.pid === undefined) throw new Error(`Docker startup failed with exit ${first.exit}: ${readFileSync(ticket.err, 'utf8').trim()}`)
    // ITS HOST NAME READ BACK BEFORE ITS COMMAND RUNS, while the gate inside waits for "go" (aHostNameProblem). docker is
    // asked here and not through inspectContainer, whose refusal would leave the container row held.
    if (hostName !== null) {
      const asked = spawnSync('docker', ['inspect', '--type', 'container', ticket.container], { encoding: 'utf8' })
      let made = null
      try { made = asked.status === 0 ? JSON.parse(asked.stdout)[0] ?? null : null } catch { made = null }
      const problem = made === null
        ? `docker could not say what host name it carries (${asked.status === 0 ? 'its answer was not one container' : asked.error?.message ?? (String(asked.stderr ?? '').trim() || `exit ${String(asked.status)}`)})`
        : aHostNameProblem(made.Config?.Hostname, hostName)
      if (problem !== null) { child.stdin.end(); await ended; throw new Error(`The check view container docker made is not what was asked for: ${problem}; its command was not started`) }
    }
    const processRegistered = await askTheOfficeWhileItRestarts(api, '/api/resources', { method: 'POST', workspace, headers, body: {
      type: 'process', container: ticket.container, pidInContainer: innerPid, sessionRecordId: who.session,
      detail: `Host group controlling check ${view.spec.check} in ${ticket.container}: ${chosen.command.join(' ')}`,
    } }, { saying: say })
    if (processRegistered.status !== 201) { child.stdin.end(); await ended; throw new Error(`The ledger refused the check view process: ${theOfficeSaid(processRegistered)}`) }
    if (!Number.isSafeInteger(Number(processRegistered.body.resource?.key)) || !Number.isSafeInteger(processRegistered.body.resource?.pgid)) {
      child.stdin.end(); await ended; throw new Error('The ledger did not return the native command host pid and process group.')
    }
    processRow = processRegistered.body.resource.id
    const row = processRegistered.body.resource
    const start = { instance: name, run: null, innerPid, hostPid: Number(row.key), hostPgid: row.pgid, processRow,
      cwd: view.work.container, command: chosen.command, view: { container: ticket.container, sha256: view.sha256, containerRow },
      out: ticket.out, err: ticket.err, exit: ticket.exit, receipt: ticket.receipt, details: join(ticket.output, 'controller.log'),
      ...(provider === null ? {} : { provider: provider.says }) }
    started = true
    writeJsonWhole(ticket.ready, start)
    if (stopping === null) child.stdin.end('go\n')
    else child.stdin.end()
    if (seconds !== null) timer = setTimeout(() => { stop('timeout').catch(error => { why = error.message }) }, seconds * 1000)
    const exit = await ended
    if (stopping !== null) await stopping
    else code = exit
    if (!started && why === null) why = `Docker startup failed with exit ${exit}: ${readFileSync(ticket.err, 'utf8').trim()}`
  } catch (error) {
    why = error.message; code = code === 124 || code > 128 ? code : 1
  } finally {
    if (timer !== null) clearTimeout(timer)
    if (stderrPending !== '') appendFileSync(ticket.err, stderrPending)
    // The container is stopped through its ledger row, including startup failure. The command's
    // group is released after its output has drained; the controller is outside that group.
    for (const id of [containerRow, processRow].filter(Boolean)) {
      try { await release(id, why ?? `Check view command ended with exit ${code}.`) }
      catch (error) { why = `${why === null ? '' : why + ' '}${error.message}`; if (code === 0) code = 1 }
    }
    if (envFile !== null) rmSync(envFile, { force: true })
    if (locked) rmSync(lock, { recursive: true })
    rmSync(process.env.MOLE_CHECK_VIEW_CONTROLLER, { force: true })
    writeJsonWhole(ticket.exit, code)
    const controllerInput = chosen.command.length === 2 && chosen.command[0] === 'sh' &&
      /^\/inputs\/commands\/[A-Za-z0-9_-]+\.sh$/.test(chosen.command[1]) &&
      view.spec.readOnly.some(mount => mount.container === '/inputs/commands')
    writeJsonWhole(ticket.receipt, { check: view.spec.check, instance: name, started, code, why,
      ...(controllerInput ? { permissions: 'The command is a controller input; the launcher did not verify its model argv.' } : {}),
      view: { container: ticket.container, sha256: view.sha256, containerRow }, processRow, innerPid,
      out: ticket.out, err: ticket.err, exit: ticket.exit, released })
    for (const [signal, handler] of Object.entries(onSignals)) process.removeListener(signal, handler)
  }
}

/**
 * THE OFFICE'S COMMIT ADDRESS, AS THIS MACHINE'S SETTINGS GIVE IT, read once. exec, worker and
 * round read it first, before anything is filed, so an empty one is refused in the settings reader's own words while
 * nothing is on the record yet; and startThroughTheHelper hands it to the helper with `docker exec -e`. The helper runs
 * in the container, whose clone has no .env, so on its own it read the built-in default whatever this machine said,
 * while an isolated run and the merge tool read this machine's setting.
 */
let theCommitAddressRead = null
function theCommitAddress() {
  if (theCommitAddressRead === null) theCommitAddressRead = settingValue('MOLE_OFFICE_COMMIT_EMAIL')
  return theCommitAddressRead
}

/**
 * A COMMIT SETTING THIS LAUNCHER DOES NOT KNOW IS NOT IGNORED (8 November 2026): a
 * script set MOLE_OFFICE_COMMIT_NAME to one agent's handle, and the runs it started committed as the agents they serve, as the owner's rule
 * of 22 September 2026 says (theGitIdentity in tools/sandbox-common.mjs), while the name was dropped in silence.
 * MOLE_OFFICE_COMMIT_EMAIL is the only commit setting, so a start that commits refuses any other MOLE_OFFICE_COMMIT_ variable
 * in this launcher's environment, before anything is filed or started.
 */
function theCommitSettingsAreKnown() {
  const unknown = Object.keys(process.env).filter((name) => name.startsWith('MOLE_OFFICE_COMMIT_') && name !== 'MOLE_OFFICE_COMMIT_EMAIL').sort()
  if (unknown.length === 0) return
  const one = unknown.length === 1
  refuse(`${unknown.join(', ')} ${one ? 'is' : 'are'} set in this launcher's environment, and the launcher knows no such setting, so nothing was started: the only commit setting is MOLE_OFFICE_COMMIT_EMAIL, the address, and a run commits as the agent it serves (the owner's rule of 22 September 2026), so ${one ? 'it' : 'they'} would be ignored. Unset ${one ? 'it' : 'them'} and start again.`, 2)
}

/**
 * A RUN THAT COMMITS IS NOT STARTED AT THE PLACEHOLDER ADDRESS. MOLE_OFFICE_COMMIT_EMAIL's declared default is an
 * address that reaches nobody, and the merge queue refuses a commit made at it only after the round's whole work. So an
 * agent's run that commits (exec --agent, worker, round) is refused here, before anything starts, when its address is
 * that default. A check (--plain-env) and an isolated read commit nothing and are not asked.
 */
function theAddressARunCommitsAt() {
  theCommitSettingsAreKnown()
  const address = theCommitAddress()
  if (address !== settingNamed('MOLE_OFFICE_COMMIT_EMAIL').fallback) return address
  const { source } = readSettingHere('MOLE_OFFICE_COMMIT_EMAIL')
  refuse(`This run would commit as the placeholder address ${address}: MOLE_OFFICE_COMMIT_EMAIL came from ${source}, after this launcher looked for it in the office's stored settings, in its own environment and in ${ENV_FILE}; set MOLE_OFFICE_COMMIT_EMAIL to a real address on the Settings page or in that file, and start again. Nothing was started.`, 2)
}

/**
 * THE ONE PATH BY WHICH A COMMAND IS STARTED IN A SANDBOX: exec (every form), worker and round all come here. It writes
 * the secrets for this one command into an env file of mode 0600, in a folder the sandbox cannot see, runs the helper
 * inside the container with `docker exec`, and deletes the env file once docker has read it. The helper is given the
 * caller's own name and session, for its own writes; the command it starts gets its run's (tools/sandbox-start.mjs).
 * With --wait it stays with the command to its end and exits with its code (execAndWait); otherwise it answers the
 * helper's start line. `runtime` is the agent run's runtime, when the caller knows it: then only the secrets that
 * runtime reads go in (theDeclaredSecrets). `requestedSecrets` holds the secrets selected by plain exec's --secret,
 * or an empty selection with its explanation when no name was given.
 */
async function startThroughTheHelper(sb, who, passed, handshake = null, filed = null, runtime = undefined, requestedSecrets = null, readBeforeFiling = null) {
  const { name, dir, instance, workspace, helper } = sb
  const helperSource = readFileSync(helper, 'utf8')
  const commandAt = passed.indexOf('--') + 1
  // Written again beside the run hooks so a sandbox already up gets it from its next OpenCode run.
  const starts = aCommandsRuntime(commandAt > 0 ? passed.slice(commandAt) : [], runtime ?? sb.opencodeRuntime)
  try { theDshHandoffIsCurrent(helper, commandAt > 0 ? passed.slice(commandAt) : null, starts) }
  catch (why) {
    const words = why instanceof Error ? why.message : String(why)
    await theFiledRunNeverStarted(sb, who, filed, words)
    refuse(words, 2)
  }
  prepareOpenCodeBeforeFiling(sb, starts)
  if (starts === 'dsh') installOfficeProfile(join(dir, 'dsh/home'), join(dir, 'repo'))
  // THE SECRETS, in a file of their own for this one command, in a folder the sandbox cannot see.
  // A --plain-env command gets none: it is a build or a test suite, not an agent. A run filed here that holds its own
  // key gets it in the same file, as SANDBOX_RUN_KEY (see "a run's own key" in the header), and nowhere else.
  // A CLAUDE CODE RUN GETS THE OFFICE'S RUN HOOKS, written again here so a sandbox that was up before they existed has them
  // from its next run on, without starting it again (see theOfficesRunHooks).
  if (starts === A_WORKERS_RUNTIME) {
    const runHooks = theOfficesRunHooks(join(dir, 'home'), join(dir, 'repo'))
    if (runHooks !== null) say(runHooks, true)
  }
  const secrets = chosen['plain-env'] === true ? theNoSecretsFor(instance, '--plain-env: no secret was passed.') : requestedSecrets ?? theSecretsFor(instance, runtime, undefined, sb)
  const lines = filed !== null && filed.key !== null ? [...secrets.lines, `SANDBOX_RUN_KEY=${filed.key}`] : [...secrets.lines]
  const commandEnvironment = theClaudeCodeEnvironment(sb, secrets.lines, true)
  // THE WINDOW THIS START IS GIVEN, read at this start, so a changed setting is used from this start on: by the command
  // that filed the run, before it filed it, or here. The sandbox's own Claude Code settings are brought to it here as
  // well, for a claude started in the container another way.
  const claudeCodes = readBeforeFiling ?? theClaudeCodeVariablesInASandbox()
  const homeSays = aRunKeepsItsWorkers(join(dir, 'home'), claudeCodes)
  if (homeSays !== null) say(homeSays, true)
  // Older helpers keep working. The host asks the office and supplies flags or the supported shell environment.
  // A current helper consumes this one answer before constructing the agent environment. No starter key goes in it.
  if (helperSource.includes('SANDBOX_START_EFFORT') && (commandAt > 0 || runtime === 'dsh')) {
    let existingRun = null
    if (chosen.run !== undefined) {
      const read = await askTheOffice(api, `/api/records/${encodeURIComponent(chosen.run)}`, { workspace, headers: theCallerNamed(workspace, who) })
      if (read.status !== 200) refuse(`The run ${chosen.run} could not be read for its effort (${theOfficeSaid(read)}). Nothing was started.`)
      const record = read.body?.record ?? read.body
      if (record?.kind !== 'session') refuse(`${chosen.run} is not a run. Nothing was started.`, 2)
      existingRun = record.data
    }
    const values = filed?.startValues ?? await theStartValues(commandAt > 0 ? passed.slice(commandAt) : [], existingRun?.runtime ?? runtime,
      existingRun?.model ?? filed?.model ?? chosen.model, commandEnvironment.env, {
        agent: existingRun?.servingAgent ?? filed?.agent ?? chosen.agent ?? who.agent, workspace, headers: theCallerNamed(workspace, who), envFrom: commandEnvironment.from,
      })
    if (values.effortAnswer !== undefined) lines.push(`SANDBOX_START_EFFORT=${JSON.stringify(values.effortAnswer)}`)
    theSelectionHandoff(lines, helperSource, values)
    const runsOn = existingRun?.runtime ?? runtime
    if (theProviderRouterIsOn() && theRouterMustCarry(runsOn, existingRun?.model ?? filed?.model ?? chosen.model ?? values.start?.selection?.native?.model, values.start?.selection?.native?.provider)) {
      await theRouterLinesForARun(lines, { sandboxes, name, run: filed?.id ?? chosen.run, runtime: runsOn, selection: values.start?.selection, helperSource, ask: (path, options) => askTheOffice(api, path, { workspace, headers: theCallerNamed(workspace, who), ...options }), refuse })
    }
  }
  const legacyValues = !helperSource.includes('aCommandsStartFromTheOffice') && commandAt > 0
    ? await theStartValues(passed.slice(commandAt), runtime, filed?.model ?? chosen.model, commandEnvironment.env, {
      agent: filed?.agent ?? chosen.agent ?? who.agent, workspace, headers: theCallerNamed(workspace, who), envFrom: commandEnvironment.from,
    }) : null
  if (legacyValues !== null) {
    passed.splice(commandAt, passed.length - commandAt, ...legacyValues.command)
    lines.push(...Object.entries(legacyValues.env).map(([name, value]) => `${name}=${value}`))
    if (legacyValues.start !== null) {
      say(`${legacyValues.start.model === null ? '' : `model ${legacyValues.start.model}; `}${legacyValues.start.words}`)
      if (filed?.id && legacyValues.start.effort !== null) {
        const wrote = await askTheOffice(api, `/api/records/${encodeURIComponent(filed.id)}`, { method: 'PATCH', workspace,
          headers: filed.key !== null ? officeHeaders({ workspace, agent: filed.agent, session: filed.id, key: filed.key }) : theCallerNamed(workspace, who),
          body: { dataPatch: { effort: legacyValues.start.effort } } })
        if (wrote.status !== 200) refuse(`The run's effort could not be recorded (${theOfficeSaid(wrote)}). Nothing was started.`)
      }
    }
  }
  const envFile = lines.length === 0 ? null : writeTheEnvFile(hostOnlyFolder(name), lines)
  if (secrets.says !== null) say(secrets.says, secrets.quiet === true)
  if (secrets.warning != null) say(secrets.warning)

  const helperHasVerbose = helperSource.includes("'verbose'")
  if (chosen.verbose === true && helperHasVerbose) passed.unshift('--verbose')
  if (!helperHasVerbose) say(`the helper in ${helper} is older than this launcher; this repo has not checked out the updated helper from origin/main at this start. See the main refresh details for why; the next agent start where checked-out main can follow origin/main uses the updated helper.`)
  const args = [
    'exec',
    ...(envFile === null ? [] : ['--env-file', envFile]),
    '-e', `SANDBOX_DIR=${dir}`,
    // THE SANDBOX'S FACTS THE HELPER REGISTERS WITH, from the host's copy, which no run in the sandbox can write. The
    // helper never reads the copy in the sandbox's folder (see "the sandbox's facts" in its header).
    '-e', `${THE_FACTS_VARIABLE}=${theFactsAStartIsGiven(instance)}`,
    ...(prelaunchDetails !== null && helperSource.includes('SANDBOX_LAUNCH_LOGS')
      ? ['-e', `SANDBOX_LAUNCH_LOGS=${dirname(prelaunchDetails)}`] : []),
    '-e', `MOLE_OFFICE_API=${api}`,
    '-e', `MOLE_OFFICE_WORKSPACE=${workspace}`,
    '-e', `MOLE_OFFICE_AGENT=${who.agent}`,
    '-e', `MOLE_OFFICE_SESSION=${who.session}`,
    // A CLAUDE CODE RUN KEEPS ITS BACKGROUND WORKERS past its last turn and compacts when the setting read above says
    // (theClaudeCodeVariablesInASandbox); the helper passes them on.
    ...claudeCodes.variables.flatMap((one) => ['-e', `${one.name}=${one.value}`]),
    ...(theCommitAddress() === null ? [] : ['-e', `MOLE_OFFICE_COMMIT_EMAIL=${theCommitAddress()}`]),
    '-w', dir,
    instance.container.name,
    'node', helper, ...passed,
  ]
  if (chosen.wait === true) {
    await execAndWait(args, envFile, handshake === null ? null : { handshake, workspace, who, container: instance.container.name, seat: aSeatForThisProcess(name, workspace, who) }, dir, !helperHasVerbose, sb.opencode ?? null)
  }
  // THE HOST'S HALF OF THE HANDSHAKE FOR A COMMAND THAT DOES NOT WAIT: the row is written beside
  // the docker exec, which ends once the helper has printed its start line, or has given up.
  let theExecEnded = false
  const theRowWritten = handshake === null ? null : theRowForTheHelper({ handshake, workspace, who, container: instance.container.name }, () => theExecEnded)
  let ran
  try {
    ran = await new Promise((done) => {
      const child = spawn('docker', args, { stdio: ['ignore', 'pipe', helperHasVerbose ? 'inherit' : 'pipe'] })
      if (!helperHasVerbose) child.stderr.on('data', (chunk) => {
        keepTheHelpersWords(chunk)
        process.stderr.write(chunk)
      })
      // THE START LINE IS READ AS BYTES AND DECODED WHOLE, so a letter cut between two pieces of the pipe stays one (item 2ab).
      const stdout = aStreamReadWhole(child.stdout)
      child.on('error', (why) => {
        theExecEnded = true
        done({ code: null, stdout: stdout.text(), why: why.message })
      })
      child.on('close', (code) => {
        theExecEnded = true
        done({ code, stdout: stdout.text(), why: null })
      })
    })
  } finally {
    // Docker read the file when the command started; nothing else may read it after.
    if (envFile !== null) unlinkSync(envFile)
  }
  const row = theRowWritten === null ? null : await theRowWritten
  if (ran.code !== 0) {
    const why = `the helper in the sandbox did not start the command (${ran.why ?? `exit ${ran.code}`}).`
    // A ROW WRITTEN HERE FOR A COMMAND THAT NEVER WENT is closed here, with the caller's key: the helper holds none.
    if (row !== null) {
      const closed = await releaseThroughTheLedger(row.id, { force: true, note: `The command never ran: ${why}`, workspace, who })
      if (closed.status !== 200) say(`the process row ${row.id} could not be closed (${theOfficeSaid(closed)}); it may still say something runs.`)
    }
    await theFiledRunNeverStarted(sb, who, filed, why)
    refuse(why, ran.code ?? 1)
  }
  const line = ran.stdout.trim().split('\n').pop() ?? ''
  let start
  try {
    start = JSON.parse(line)
  } catch {
    const why = `the helper said it started the command but printed no start line: ${line.slice(0, 300)}`
    await theFiledRunNeverStarted(sb, who, filed, why)
    refuse(why)
  }
  if (legacyValues?.start !== null && legacyValues?.start !== undefined) {
    const values = legacyValues.start
    Object.assign(start, { model: values.model, effort: values.effort, requestedEffort: values.requestedEffort,
      effortFrom: values.effortFrom, ruleEffort: values.ruleEffort, officeUnavailable: values.officeUnavailable,
      officePredatesEffort: values.officePredatesEffort, fast: values.fast, startWords: values.words })
    const record = typeof start.run === 'string' ? join(dir, 'logs', start.run, 'start.json') : null
    // PUBLISHED WHOLE, because the launcher's status and a waiting caller read every start.json, with the mode the
    // helper gave the file.
    if (record !== null && existsSync(record)) writeWhole(record, `${JSON.stringify(start, null, 2)}\n`, statSync(record).mode & 0o777)
  }
  if (sb.opencode !== undefined) start.opencode = sb.opencode
  // WHAT THE LAUNCHER SAID BEFORE IT FILED THE RUN goes first in the start's words, and into start.json, which the status reads.
  if (typeof sb.startSaysFirst === 'string') {
    start.startWords = typeof start.startWords === 'string' && start.startWords !== '' ? `${sb.startSaysFirst} ${start.startWords}` : sb.startSaysFirst
    const record = typeof start.run === 'string' ? join(dir, 'logs', start.run, 'start.json') : null
    if (record !== null && existsSync(record)) writeWhole(record, `${JSON.stringify(start, null, 2)}\n`, statSync(record).mode & 0o777)
  }
  keepLaunchDetails(start, sb.dir)
  appendFileSync(launchDetails, `started ${JSON.stringify(start)}\n`)
  // THE HOST'S LIST SAYS IT STARTED, from the run the host filed and never from the helper's start line.
  if (typeof filed?.id === 'string') {
    try { markTheHostsEntry(sb, filed.id, { started: clockStamp().instant }) }
    catch (why) {
      say(`run ${filed.id} started, and the host's list of the runs it filed in sandbox ${sb.name} could not say so (${why instanceof Error ? why.message : String(why)}): a round continues it only when --continues names it.`)
    }
  }
  return start
}

/** The helper's start line, as one JSON object with --json or as lines. */
function printTheStart(start, briefBytes = undefined, worktree = null) {
  const itsWorktree = worktree === null || chosen.json ? null : `worktree ${worktree}, ${theWorktreesSize(worktree)}`
  if (chosen.json) {
    const shown = ['worker', 'round'].includes(chosen.verb)
      ? { ...start, brief: chosen.brief, briefBytes }
      : start
    process.stdout.write(`${JSON.stringify(shown)}\n`)
  }
  else if (chosen.verb === 'exec' && chosen.verbose === true) {
    process.stdout.write([`run ${start.run ?? "(the caller's own command)"}${start.opencode ? `; ${start.opencode}` : ''}`, ...(start.startWords ? [`${start.model === null ? '' : `model ${start.model}; `}${start.startWords}`] : []), `process row ${start.processRow}`, `host pid ${start.hostPid} group ${start.hostPgid}`, `cwd ${start.cwd}`, ...(itsWorktree === null ? [] : [itsWorktree]), `output ${start.out}`].join('\n') + '\n')
  } else if (chosen.verb === 'exec') {
    process.stdout.write(`run ${start.run ?? "(the caller's own command)"} of ${start.agent ?? chosen.agent ?? "the caller"} started in sandbox ${start.instance}${start.startWords ? `; ${start.model === null ? '' : `model ${start.model}; `}${start.startWords}` : ''}; host pid ${start.hostPid} group ${start.hostPgid}; cwd ${start.cwd}${itsWorktree === null ? '' : `; ${itsWorktree}`}; output ${start.out}; details ${launchDetails}${start.opencode ? `; ${start.opencode}` : ''}\n`)
  }
}

/**
 * A SEAT FOR THIS PROCESS'S OWN GROUP, when --slot names a pool, taken before the command starts and held while this
 * process waits for it (the host-row path; see the header). Null with no --slot. A refusal means nothing was started.
 * The detail is capped as the helper caps its own, so a command over 131,071 bytes is given its seat (item 2aa).
 */
function aSeatForThisProcess(name, workspace, who) {
  if (chosen.slot === undefined) return null
  const seated = spawnSync(
    process.execPath,
    [
      join(REPO_ROOT, 'tools', 'slot.mjs'), 'acquire', chosen.slot, '--wait', '--pid', String(process.pid),
      '--session', who.session, '--as', who.agent, '--workspace', workspace, '--api', api,
      '--detail', aDetailOfAFewKilobytes(`sandbox ${name}: ${(chosen.command ?? []).join(' ')}`),
    ],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] },
  )
  const slot = seated.status === 0 ? String(seated.stdout).trim().split('\n')[0] : ''
  if (slot === '') refuse(`No ${chosen.slot} seat was given (${whyTheSlotToolGaveNoSeat(seated)}). Nothing was started.`)
  return slot
}

/** Give back a seat this process holds, saying so if the office would not take it back. */
function giveTheSeatBack(slot, note, workspace, who) {
  const back = spawnSync(
    process.execPath,
    [join(REPO_ROOT, 'tools', 'slot.mjs'), 'release', slot, '--session', who.session, '--as', who.agent, '--workspace', workspace, '--api', api, '--note', note],
    { encoding: 'utf8', stdio: ['ignore', 'ignore', 'pipe'] },
  )
  if (back.status !== 0) say(`the ${String(chosen.slot)} seat ${slot} could not be given back (${String(back.stderr ?? '').trim() || `exit ${String(back.status)}`}); it is freed when this process's group ends.`)
}

/** Publish one JSON value as a fresh private file, whole, replacing any old destination without inheriting its mode. */
function writeJsonWhole(path, value) {
  writeWhole(path, `${JSON.stringify(value)}\n`, 0o600)
}

/**
 * THE HOST'S HALF OF THE HANDSHAKE (see the header): wait for the helper's pid.json, register the row with the caller's
 * key, and write row.json, or refused.json with the office's words. Answers the row, or null when none was written.
 *
 * ONLY THE PID AND THE DETAIL COME FROM pid.json. The file is written in the sandbox, which a run in it can write, and
 * the row is registered with the caller's key. So the container is the host's own copy's (`hs.container`) and the
 * session is the caller's own (`hs.who.session`). A pid.json that names another container or session is refused, naming
 * the field, and nothing is registered. The pid can only come from inside: the ledger takes it only in the named
 * container's pid namespace, and only for a process that did not start before the caller's session was filed.
 */
async function theRowForTheHelper(hs, isOver) {
  const pidFile = join(hs.handshake, 'pid.json')
  while (!existsSync(pidFile)) {
    if (isOver()) return null
    await new Promise((later) => setTimeout(later, 100))
  }
  let asked
  try {
    asked = JSON.parse(readFileSync(pidFile, 'utf8'))
  } catch (why) {
    asked = why
  }
  const theFieldsNotOurs = asked instanceof Error || asked === null || typeof asked !== 'object'
    ? null
    : [['container', hs.container], ['sessionRecordId', hs.who.session]].filter(([field, ours]) => asked[field] !== ours)
  if (theFieldsNotOurs === null || theFieldsNotOurs.length > 0) {
    const why = theFieldsNotOurs === null
      ? `${pidFile} could not be read as an object (${asked instanceof Error ? asked.message : 'it holds no object'}), so no process was registered`
      : `${pidFile} names ${theFieldsNotOurs.map(([field, ours]) => `the ${field} ${JSON.stringify(asked[field])}, not ${ours}`).join(', and ')}; ` +
        "the host registers a process only in its own sandbox's container and for its own caller's session, so no process was registered"
    writeJsonWhole(join(hs.handshake, 'refused.json'), { why })
    say(`${why}, and the command never runs.`)
    return null
  }
  // ASKED AGAIN WHILE THE OFFICE REFUSES THE CONNECTION, as it does while it restarts (askTheOfficeWhileItRestarts), and
  // for no longer than the helper waits at its gate: once it has gone, nothing waits for the row.
  const registered = await askTheOfficeWhileItRestarts(
    api,
    '/api/resources',
    {
      method: 'POST',
      workspace: hs.workspace,
      headers: theCallerNamed(hs.workspace, hs.who),
      body: { type: 'process', container: hs.container, pidInContainer: asked.pidInContainer, sessionRecordId: hs.who.session, detail: asked.detail },
    },
    { stillWanted: () => !isOver(), saying: say },
  )
  if (registered.status !== 201) {
    writeJsonWhole(join(hs.handshake, 'refused.json'), { why: theOfficeSaid(registered) })
    say(`the ledger refused to register pid ${String(asked.pidInContainer)} in container ${hs.container} (${theOfficeSaid(registered)}), so the command never runs.`)
    return null
  }
  const row = registered.body.resource
  writeJsonWhole(join(hs.handshake, 'row.json'), { id: row.id, key: row.key, pgid: row.pgid })
  return row
}

function keepTheHelpersWords(chunk) {
  const words = chunk.toString('utf8')
  if (launchDetails === null) launchLines.push(words)
  else appendFileSync(launchDetails, words)
}

/**
 * EXEC WITH --wait: the helper stays in front, so this process relays the command's output as it
 * comes and exits with its code. The helper prints its start line on stderr, and the host process
 * group in it is what a signal to this process is passed on to: `docker exec` itself passes no
 * signal into the container, and killing it would leave the command running there.
 */
async function execAndWait(args, envFile, hs = null, instanceDir = null, legacy = false, opencode = null) {
  let hostGroup = null
  let envFileGone = envFile === null
  const dropTheEnvFile = () => {
    if (envFileGone) return
    envFileGone = true
    unlinkSync(envFile)
  }
  const child = spawn('docker', args, { stdio: ['ignore', 'inherit', 'pipe'] })
  const passOn = (signal) => {
    if (hostGroup === null) {
      child.kill(signal)
      return
    }
    try {
      process.kill(-hostGroup, signal === 'SIGHUP' ? 'SIGTERM' : signal)
    } catch {
      // The group is already gone.
    }
  }
  for (const signal of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(signal, () => passOn(signal))
  let addingNotice = false
  child.stderr.on('data', (chunk) => {
    if (legacy) keepTheHelpersWords(chunk)
    // Older helpers cannot report the host's write. Add it to their one launch line, preserving later output.
    addingNotice = opencode !== null && hostGroup === null
    if (!addingNotice) process.stderr.write(chunk)
  })
  // EACH LINE BEFORE THE START IS DECODED WHOLE (item 2ad). The start line comes on this stream, and for an OpenCode run it
  // is written again from what was decoded, so a letter cut between two pieces of 64 KiB was written as U+FFFD. This
  // listener comes after the one above, which has already written the piece unless its lines are written here.
  const before = aStreamReadWhole(child.stderr, (bytes, after) => {
    const line = bytes.subarray(0, -1).toString('utf8')
    const short = /host pid \d+ group (\d+); output here; details (.+)$/.exec(line)
    const at = line.indexOf('sandbox-start: started {')
    let start = null
    if (at !== -1) {
      try { start = JSON.parse(line.slice(at + 'sandbox-start: started '.length)) }
      catch { /* Not the start line after all. */ }
    }
    if (addingNotice) {
      const shown = start !== null
        ? `${line.slice(0, at)}sandbox-start: started ${JSON.stringify({ ...start, opencode })}`
        : short !== null ? `${line}; ${opencode}` : line
      process.stderr.write(`${shown}\n`)
    }
    if (short !== null) {
      hostGroup = Number(short[1])
      keepLaunchDetails({ details: short[2] })
      if (opencode !== null) appendFileSync(launchDetails, `${opencode}\n`)
      dropTheEnvFile()
    } else if (start !== null) {
      if (Number.isInteger(start.hostPgid)) hostGroup = start.hostPgid
      if (opencode !== null) start.opencode = opencode
      keepLaunchDetails(start, instanceDir)
      if (opencode !== null) appendFileSync(launchDetails, `started ${JSON.stringify(start)}\n`)
      dropTheEnvFile()
    }
    if (hostGroup === null) return true
    // The rest of the piece the start came in, which the listener above did not write.
    if (addingNotice && after.length > 0) process.stderr.write(after)
    return false
  }, { keep: false })
  child.stderr.on('end', () => {
    if (opencode !== null && hostGroup === null && before.bytes().length > 0) process.stderr.write(before.bytes())
  })
  let over = false
  const rowWritten = hs === null ? Promise.resolve(null) : theRowForTheHelper(hs, () => over)
  const code = await new Promise((done) => {
    child.on('error', (why) => {
      say(`docker could not be started: ${why.message}`)
      done(1)
    })
    child.on('close', (exit, signal) => done(exit ?? (signal === null ? 1 : 128 + (osConstants.signals[signal] ?? 0))))
  })
  over = true
  dropTheEnvFile()
  if (hs !== null) {
    // THE ROW THIS PROCESS WROTE IS CLOSED BY IT, whether the command exited, met the helper's limit, or was ended by a
    // signal this process passed on (acceptance finding 77). Only a SIGKILL to this process
    // leaves it open, and the ledger then finds its process gone.
    const row = await rowWritten
    const endFile = join(hs.handshake, 'end.json')
    const ended = existsSync(endFile) ? readFileSync(endFile, 'utf8').trim() : ''
    const said = ended === '' ? `docker exec ended with ${String(code)}` : String(JSON.parse(ended).said)
    if (row !== null) {
      const closed = await askTheOffice(api, `/api/resources/${encodeURIComponent(row.id)}/release`, {
        method: 'POST',
        workspace: hs.workspace,
        headers: theCallerNamed(hs.workspace, hs.who),
        body: { note: `The command ended: ${said}` },
      })
      if (closed.status !== 200) say(`the process row ${row.id} could not be closed (${theOfficeSaid(closed)}); it may still say something runs.`)
    }
    if (hs.seat !== null) giveTheSeatBack(hs.seat, `the command ended: ${said}`, hs.workspace, hs.who)
  }
  process.exit(code)
}

/**
 * THE LINES OF THE HOST'S SECRETS FILE THAT THE TEMPLATE NAMES, the file they were read from (null when the template
 * names none), and one sentence about what was found. The file is docker's env-file format, `NAME=value` per line, and
 * its lines are copied as they are, so the value docker reads is the value written. It must be readable by its owner only.
 * With a runtime, only the lines of the names that runtime reads (the template's readBy).
 * With requested names, only their lines; theDeclaredSecrets refuses any name the template does not declare.
 */
function theSecretsFor(instance, runtime = undefined, requestedNames = undefined, sb = null) {
  const office = theTemplate(instance.templateDir).office
  const read = theDeclaredSecrets(office, undefined, runtime, requestedNames)
  if (read.unsafe !== null) refuse(`${read.unsafe} No secret was passed and nothing was started.`)
  // A CODEX RUN WITH NO LOGIN, WHILE THE PROVIDER ROUTER IS ON, is handed no key, so it is refused here: for exec --agent
  // before the hand-run ask files anything.
  if (runtime === 'codex' && requestedNames === undefined && sb !== null && theProviderRouterIsOn()) {
    const login = theCodexLoginIn(sb)
    if (!login.present) refuse(aCodexRunHasNoKeyThroughTheRouter(`The sandbox ${sb.name} has no Codex login at ${login.file}`), 2)
  }
  const needed = theSecretsRequested(office, runtime, requestedNames)
  const runtimeHasLogin = requestedNames === undefined && sb !== null && (
    needed.some((one) => [...read.lines, ...(sb.container.Config?.Env ?? [])].some((line) => line.startsWith(`${one.name}=`) && line.length > one.name.length + 1)) ||
    (runtime === 'codex' && theCodexLoginIn(sb).present) ||
    (runtime === A_WORKERS_RUNTIME && aClaudeCodeLogin(theClaudeCodeEnvironment(sb, read.lines)))
  )
  const routed = theRoutedKeysLeftOut(theSecretSelection(office, { ...read, says: read.says ?? read.unsafe }, runtimeHasLogin ? [] : needed, runtime !== undefined && requestedNames === undefined), requestedNames)
  if (routed.refusal !== null) refuse(routed.refusal, 2)
  return routed.selection
}

function theNoSecretsFor(instance, says) {
  return theSecretSelection(theTemplate(instance.templateDir).office, { lines: [], says, file: null }, [])
}

function theSecretsRequested(office, runtime, requestedNames) {
  return (office?.secrets?.names ?? []).filter((one) => requestedNames !== undefined
    ? requestedNames.includes(one.name)
    : runtime === undefined || (Array.isArray(one.readBy) && one.readBy.includes(THE_PROGRAM_A_RUNTIME_RUNS[runtime])))
}

function theSecretSelection(office, read, needed, runtimeAlternatives = false) {
  const listed = office?.secrets?.names ?? []
  const missing = listed.filter((one) => !read.lines.some((line) => line.startsWith(`${one.name}=`)))
  const absent = missing.map((one) => one.name)
  const says = `${read.says ?? ''}${absent.length === 0 ? '' : ` Secrets named but not passed: ${absent.join(', ')}.`}`
  const actionable = missing.filter((one) => needed.some((wanted) => wanted.name === one.name))
  return { lines: read.lines, says, file: read.file, quiet: true,
    warning: actionable.length === 0 ? null : `${read.file !== null && !existsSync(read.file) ? `there is no secrets file at ${read.file}. ` : ''}Secrets named but not passed: ${actionable.map((one) => one.name).join(', ')}.${runtimeAlternatives ? ' Any one of these names would provide a runtime login.' : ''}` }
}

/** A file of mode 0600 holding the given lines, made new for one command. Its path is answered. */
function writeTheEnvFile(folder, lines) {
  mkdirSync(folder, { recursive: true, mode: 0o700 })
  const path = join(folder, `exec-${randomBytes(6).toString('hex')}.env`)
  const fd = openSync(path, 'wx', 0o600)
  try {
    writeFileSync(fd, `${lines.join('\n')}\n`)
  } finally {
    closeSync(fd)
  }
  return path
}

// ============================================================================ exec --isolated

/**
 * THE INSIDE RANGES AN ISOLATED RUN CANNOT REACH, besides each address this machine's own interfaces carry (read at run
 * time, never typed): the private ranges, the range a tailnet's machines and its name server use, and link-local. So an
 * isolated run reaches neither this machine nor the other machines of the tailnet or the LAN through it, only the
 * internet. A design agreed for the source-only runs of T6.
 */
const THE_INSIDE_RANGES = ['10.0.0.0/8', '100.64.0.0/10', '172.16.0.0/12', '192.168.0.0/16', '169.254.0.0/16']
/** The public resolvers an isolated run asks: this machine's own sit in blackholed ranges. */
const THE_PUBLIC_RESOLVERS = ['1.1.1.1', '8.8.8.8']
/** A host an isolated run must be able to resolve, or it could not reach its model: the gate checks it before starting. */
const A_MODEL_HOST = 'api.anthropic.com'
/** Who an isolated run's command runs as: the sandbox image's own user, never root. */
const THE_SANDBOX_USER = '1000:1000'
/** The gate, from this launcher's own checkout, and where it is mounted read-only in the run's container. */
const THE_GATE = join(REPO_ROOT, 'tools', 'isolated-gate.mjs')
const THE_GATE_INSIDE = '/opt/mole-office/isolated-gate.mjs'

/**
 * Every IPv4 address this machine's interfaces carry, loopback left out. An isolated run is given a blackhole to each.
 *
 * SANDBOX_ISOLATED_ALSO_OWN, for a test only, ADDS addresses to that list (a comma-separated list of IPv4 addresses): a
 * test in a container with no network sees no interface but loopback, and names documentation addresses here to prove
 * that each address is blackholed and checked. It can only add, so it can never let an isolated run reach more.
 */
function thisMachinesOwnAddresses() {
  const carried = Object.values(networkInterfaces()).flatMap((one) => (one ?? []).filter((entry) => entry.family === 'IPv4' && !entry.internal).map((entry) => entry.address))
  const added = (process.env['SANDBOX_ISOLATED_ALSO_OWN'] ?? '').split(',').map((one) => one.trim()).filter((one) => /^\d{1,3}(\.\d{1,3}){3}$/.test(one))
  return [...new Set([...carried, ...added])]
}

/**
 * The pid a process has inside its own pid namespace, read from /proc: 1 for a container's first process. null when it
 * cannot be read: a process that ended between docker's answer and this read has no entry in /proc any more.
 */
function thePidInsideItsNamespace(hostPid) {
  let status = ''
  try {
    status = readFileSync(`/proc/${String(hostPid)}/status`, 'utf8')
  } catch {
    return null
  }
  const line = status.split('\n').find((one) => one.startsWith('NSpid:'))
  const pids = (line ?? '').split(/\s+/).slice(1).filter((one) => one !== '')
  return pids.length === 0 ? null : Number(pids[pids.length - 1])
}

/**
 * What docker says of an isolated run's container while the run is in front: its State; 'gone' when docker knows no
 * such container; or null when docker could not answer this time. Unlike inspectContainer it never refuses: refusing
 * here would leave the run's rows open and its end unwritten while its container runs on.
 */
function theIsolatedContainersState(container) {
  const asked = run('docker', ['inspect', '--type', 'container', container])
  if (asked.status !== 0) return /no such (container|object)/i.test(asked.stderr) ? 'gone' : null
  try {
    const parsed = JSON.parse(asked.stdout)
    return Array.isArray(parsed) && parsed.length === 1 ? (parsed[0]?.State ?? null) : 'gone'
  } catch {
    return null
  }
}

/**
 * EXEC --isolated: A RUN'S COMMAND IN A CONTAINER OF ITS OWN WITH NO ROUTE TO THIS MACHINE. Decision
 * to keep it source-only (T6): in T5 the source-only runs reached the live office and one
 * registered an agent in the owner's name, and a source-only run must not be able to reach the office at all.
 *
 * The existing sandbox container is on the host's network, so it is not used. A fresh container of the same image and
 * the same mounts is made for this one command, on docker's bridge network, with NET_ADMIN, as root, with IPv6 off and
 * the public resolvers named. Its first program is tools/isolated-gate.mjs, mounted read-only from this checkout, which
 * blackholes every inside range, each of this machine's addresses and every other address on the container's own
 * link, proves the office's port answers nothing on any of this machine's addresses and the model's host resolves, and
 * only then starts the command as the sandbox's user with no capability (see its header). It fails closed: nothing
 * starts when a check fails.
 *
 * The command gets the sandbox's own environment with no office variable and no key, the model logins its --runtime
 * reads (the template's readBy), and the git identity an ordinary run gets, all through an env file of mode 0600
 * that is deleted as soon as docker has read it. Its HOME is a folder of its own, <sandbox>/out/isolated/<run>/home,
 * made here before the container starts and handed to the gate as --home. OpenCode gets its permission file there,
 * and Claude Code and Codex the switch that turns the harness's own subagents and workflows off.
 * Never the sandbox's own home: that holds the
 * other runs' settings and conversations, and the session hook that brings Mole Office in.
 * And never the image's own, which for user 1000 is /nonexistent. The logins
 * come from the environment. The run inside cannot reach the office, so
 * this process files its rows: the container's before it is made, and its command's once it runs, by the command's
 * pid on this machine (the container's own first processes run as root, and the office cannot read those), marked as
 * started by the product so the office reads it as the run's own and can stop it. It stays in front to the end, passes
 * a signal on as docker stop, and releases both rows. Then it writes the run's end on the run:
 * crashed with the exit code on a non-zero exit; the end and the code on a clean exit, the run left
 * running for its supervisor to finish.
 */
async function commandExecIsolated() {
  const [name, extra] = chosen.targets
  if (name === undefined || extra !== undefined) usage('Say which sandbox, once: node tools/sandbox.mjs exec <instance> --isolated --runtime <runtime> --run <run> --cwd <dir> -- <command>.')
  for (const flag of ['agent', 'model', 'worktree', 'clone', 'cut-from', 'title', 'brief', 'flow', 'slot', 'timeout', 'plain-env', 'no-office-variables', 'wait']) {
    if (chosen[flag] !== undefined) usage(`--isolated does not take --${flag}: it runs one filed run's command, with no office variables, and waits for it.`)
  }
  const runtimes = Object.keys(THE_PROGRAM_A_RUNTIME_RUNS).join(', ')
  if (chosen.runtime === undefined) usage(`--isolated needs --runtime <one of ${runtimes}>: only the model logins that runtime reads go into the container.`)
  if (!Object.hasOwn(THE_PROGRAM_A_RUNTIME_RUNS, chosen.runtime)) usage(`--isolated knows the runtimes ${runtimes}, and not ${JSON.stringify(chosen.runtime)}.`)
  if (chosen.run === undefined) usage('--isolated runs a run that is filed already: name it with --run <run id>.')
  if (chosen.cwd === undefined) usage('--isolated needs --cwd <folder>: the worktree, inside the sandbox folder, that the command works in.')
  if (chosen.command === null || chosen.command.length === 0) usage('Say what to run, after --.')
  const who = whoIsAsking()
  const sb = await aSandboxToStartIn(name, who)
  const codexCommand = checkCodexBeforeStart(chosen.command, { runtime: chosen.runtime })
  // NOR IS AN ISOLATED CODEX RUN, WHILE THE PROVIDER ROUTER IS ON: its home of its own holds no Codex login.
  if (theProviderRouterIsOn() && aCommandsRuntime(codexCommand, chosen.runtime) === 'codex') {
    refuse(aCodexRunHasNoKeyThroughTheRouter('An isolated run has a home of its own, which holds no Codex login'), 2)
  }
  const cwd = resolve(chosen.cwd)
  if (!within(cwd, sb.dir) || !existsSync(cwd) || !statSync(cwd).isDirectory()) {
    refuse(`--cwd ${chosen.cwd} is not a folder inside the sandbox folder ${sb.dir}. Nothing was started.`)
  }
  if (!existsSync(THE_GATE)) refuse(`${THE_GATE} is not there, so no isolated run can be gated. Nothing was started.`)
  const asTheCaller = theCallerNamed(sb.workspace, who)
  const run = chosen.run
  if (!/^[A-Za-z0-9_-]+$/.test(run)) refuse(`${run} is not a run id that can name a folder. Nothing was started.`)
  filedLaunchRun = run
  keepLaunchDetails({ details: join(sb.dir, 'logs', run, 'launch.txt') })

  // THE RUN, as the office holds it: a session record that is running.
  const read = await askTheOffice(api, `/api/records/${encodeURIComponent(run)}`, { workspace: sb.workspace, headers: asTheCaller })
  if (read.status !== 200) refuse(`The run ${run} could not be read (${theOfficeSaid(read)}). Nothing was started.`)
  const record = read.body?.record ?? read.body
  if (record?.kind !== 'session' || record?.data?.state !== 'running') {
    refuse(`${run} is not a running run (${String(record?.kind)}, ${String(record?.data?.state)}). Nothing was started.`)
  }

  // A HOME OF ITS OWN in the instance folder. Only OpenCode gets this permission file, before any filing, and Claude Code
  // and Codex the switch that turns the harness's own subagents and workflows off.
  const itsHome = join(sb.dir, 'out', 'isolated', run, 'home')
  mkdirSync(itsHome, { recursive: true, mode: 0o700 })
  let opencode = null
  try {
    if (prepareOpenCodeRunHome(itsHome, aCommandsRuntime(chosen.command, chosen.runtime), false) !== null) opencode = OPENCODE_RUN_HOME_NOTICE
    for (const sentence of theHarnessFeaturesOffInAHome(itsHome)) say(sentence, true)
  } catch (why) { refuse(why instanceof Error ? why.message : String(why)) }

  // WHAT IS BLOCKED AND WHAT IS CHECKED, read now: this machine's addresses change (a tailnet address can come later).
  const own = thisMachinesOwnAddresses()
  const officePort = new URL(api).port || (new URL(api).protocol === 'https:' ? '443' : '80')
  const blackholes = [...THE_INSIDE_RANGES, ...own.map((address) => `${address}/32`)]
  const unreachable = own.map((address) => `${address}:${officePort}`)

  // THE ENVIRONMENT: the sandbox container's own, with no office variable and no key, and the model logins its runtime reads.
  // A git identity found in either is left out too: the one below is the only one the command gets. While the provider
  // router is on, no API key from either (theRoutedKeysLeftOut).
  const containerEnv = theRoutedKeysLeftOut({ lines: (sb.container.Config?.Env ?? []).filter((line) => !leftOut(line)), says: "The container's own environment:" }, undefined).selection
  if (containerEnv.keysLeftOut !== undefined) say(containerEnv.says)
  const secrets = theSecretsFor(sb.instance, chosen.runtime, undefined, sb)
  if (secrets.says !== null) say(secrets.says, secrets.quiet === true)
  if (secrets.warning != null) say(secrets.warning)
  // THE GIT IDENTITY AN ORDINARY RUN GETS, as tools/sandbox-start.mjs gives it: the agent the run serves, as author and
  // committer, at the office's commit address, MOLE_OFFICE_COMMIT_EMAIL (the owner's rule of 22 September 2026). It is
  // neither an office variable nor a key, and without it a commit in here fails with "Author identity unknown", as
  // one run's did. A run that names no agent gets none, as an
  // ordinary one does, and the caller is told.
  const servedAgent = typeof record?.data?.servingAgent === 'string' && record.data.servingAgent !== '' ? record.data.servingAgent : null
  const git = theGitIdentity(servedAgent, theCommitAddress())
  const identity = git.env === null ? [] : Object.entries(git.env).map(([name, value]) => `${name}=${value}`)
  if (git.says !== null) say(`the run ${run} ${git.says}.`)
  const lines = [...containerEnv.lines, ...secrets.lines.filter((line) => !leftOut(line)), ...identity, `SANDBOX_DIR=${sb.dir}`]
  const commandEnvironment = theClaudeCodeEnvironment(sb, secrets.lines, true)
  const startValues = await theStartValues(codexCommand, chosen.runtime, record.data.model, commandEnvironment.env, { agent: servedAgent ?? who.agent, workspace: sb.workspace, headers: asTheCaller, envFrom: commandEnvironment.from })
  // A RUN THE PROVIDER ROUTER MUST CARRY IS NOT STARTED ISOLATED: no isolated container is given a run token or the bridge,
  // so it is refused here, before its effort is written or its container's row is asked for.
  const routed = startValues.start?.selection
  if (theProviderRouterIsOn() && theRouterMustCarry(chosen.runtime, record.data.model ?? routed?.native?.model, routed?.native?.provider)) {
    refuse(await whetherTheRouterIsDown(sandboxes) ?? `An isolated run is not given a way to the provider router, and this ${chosen.runtime} run needs one while ${THE_ROUTER_SETTING} is on. Nothing was started.`, 2)
  }
  lines.push(...Object.entries(startValues.env).map(([name, value]) => `${name}=${value}`))
  // THE HARNESS'S OWN SUBAGENTS AND WORKFLOWS OFF, as tools/sandbox-start.mjs puts them in. dsh reads the patch from the
  // sandbox's clone, which this container sees at the same path; the last line of a name is the one docker gives.
  const dshPatch = join(sb.dir, 'repo', DSH_PATCH_IN_A_CHECKOUT)
  let off = null
  try { off = aCommandWithTheHarnessFeaturesOff(startValues.command, Object.fromEntries(lines.map((line) => [line.split('=')[0], line.slice(line.indexOf('=') + 1)])), aCommandsRuntime(startValues.command, chosen.runtime), existsSync(dshPatch) ? dshPatch : null) }
  catch (why) { refuse(why instanceof Error ? why.message : String(why)) }
  for (const [name, value] of Object.entries(off.env)) {
    const others = lines.filter((line) => !line.startsWith(`${name}=`))
    lines.splice(0, lines.length, ...others, `${name}=${value}`)
  }
  for (const sentence of off.says) say(sentence)
  if (startValues.start !== null && startValues.start.effort !== null) {
    const wrote = await askTheOffice(api, `/api/records/${encodeURIComponent(run)}`, {
      method: 'PATCH', workspace: sb.workspace, headers: asTheCaller,
      body: { dataPatch: { effort: startValues.start.effort } },
    })
    if (wrote.status !== 200) refuse(`The run's effort could not be recorded (${theOfficeSaid(wrote)}). Nothing was started.`)
  }

  // THE MOUNTS: the sandbox container's own, as docker holds them, covers included, and the gate read-only.
  const mounts = (sb.container.Mounts ?? []).flatMap((m) => {
    const readonly = m.RW === false ? ',readonly' : ''
    if (m.Type === 'bind') return ['--mount', `type=bind,source=${m.Source},target=${m.Destination}${readonly}`]
    if (m.Type === 'tmpfs') return ['--mount', `type=tmpfs,target=${m.Destination}${readonly}`]
    if (m.Type === 'volume') return ['--mount', `type=volume,source=${m.Name},target=${m.Destination}${readonly}`]
    refuse(`The sandbox's container has a ${String(m.Type)} mount at ${String(m.Destination)}, which an isolated run does not know how to copy. Nothing was started.`)
    return []
  })

  // THE CONTAINER'S ROW, BEFORE IT EXISTS (chapter 2 rule 2).
  const container = `mole-office-isolated-${name}-${randomBytes(3).toString('hex')}`
  const registered = await askTheOfficeWhileItRestarts(api, '/api/resources', {
    method: 'POST',
    workspace: sb.workspace,
    headers: asTheCaller,
    body: {
      type: 'container',
      key: container,
      sessionRecordId: run,
      detail: `The isolated container of run ${run} in sandbox ${name}: no route to this machine. Started by node tools/sandbox.mjs exec --isolated; releasing this row stops it.`,
    },
  }, { saying: say })
  if (registered.status !== 201) refuse(`The ledger refused the isolated container (${theOfficeSaid(registered)}). Nothing was started.`)
  const containerRow = registered.body.resource.id
  // A ROW IS RELEASED WITH force, because its run is still running (a clean exit leaves it so): the ledger's own door,
  // which sends back the sentence it asks for.
  const releaseRow = async (id, note) => {
    const closed = await releaseTheRow(api, id, { force: true, note, headers: asTheCaller })
    if (closed.status !== 200) say(`the row ${id} could not be closed (${theOfficeSaid(closed)}); it may still say something runs.`)
  }

  // MADE, then the env file goes: docker has read it.
  const envFile = writeTheEnvFile(hostOnlyFolder(name), lines)
  const created = spawnSync('docker', [
    'create', '--name', container, '--rm', '--init', '--user', '0',
    // HELD TO THE SANDBOX DEFAULTS, as every sandbox container is (theSandboxLimits). An isolated run
    // takes the defaults, not its template's raises: it runs one command, and a raise is a template's whole sandbox's.
    ...theSandboxLimitArgs(),
    ...theRoomForPictures(),
    '--network', 'bridge', '--cap-add', 'NET_ADMIN', '--sysctl', 'net.ipv6.conf.all.disable_ipv6=1',
    // THE REVERSE-PATH FILTER OFF, and the blackholes kept. A new network namespace inherits this
    // machine's rp_filter 2, and the gateway's own address is blackholed, so an ARP request from the gateway failed the
    // check and was dropped: this machine could not confirm the container's address, and every ~45 s it dropped the
    // run's traffic until the container spoke first. T6's way-S runs lost 66 to 88 minutes each to it. With the filter
    // off the container answers that ARP, and anything it sends to this machine still goes into a blackhole.
    ...THE_REVERSE_PATH_FILTER_OFF.flatMap((setting) => ['--sysctl', setting]),
    ...THE_PUBLIC_RESOLVERS.flatMap((server) => ['--dns', server]),
    '--env-file', envFile, '--label', `mole-office.isolated-run=${run}`, '-w', cwd,
    ...mounts, '--mount', `type=bind,source=${THE_GATE},target=${THE_GATE_INSIDE},readonly`,
    '--entrypoint', 'node', sb.container.Config.Image,
    THE_GATE_INSIDE, '--as', THE_SANDBOX_USER,
    '--home', itsHome,
    ...blackholes.flatMap((network) => ['--blackhole', network]),
    ...unreachable.flatMap((target) => ['--unreachable', target]),
    '--resolve', A_MODEL_HOST,
    '--', ...off.command,
  ], { encoding: 'utf8' })
  unlinkSync(envFile)
  if (created.status !== 0) {
    await releaseRow(containerRow, 'The isolated container could not be made.')
    refuse(`docker could not make the isolated container (${String(created.stderr ?? '').trim() || `exit ${String(created.status)}`}). Nothing was started.`)
  }
  say(`run ${run} starts in its own container ${container}: ${String(blackholes.length)} networks blackholed, this machine's port ${officePort} checked on ${String(own.length)} addresses, no office variable and no key.`, true)

  // STARTED, in front, with its output relayed; a signal to this process stops the container.
  const child = spawn('docker', ['start', '--attach', container], { stdio: ['ignore', 'pipe', 'inherit'] })
  let pending = ''
  const readTier = (line) => {
    const warning = aCodexTierWarning(line)
    if (warning !== null) { appendFileSync(launchDetails, `${warning}\n`); say(warning) }
  }
  child.stdout.on('data', (chunk) => {
    process.stdout.write(chunk)
    if (chosen.runtime !== 'codex') return
    pending += chunk.toString('utf8')
    const lines = pending.split('\n')
    pending = lines.pop() ?? ''
    for (const line of lines) readTier(line)
  })
  child.stdout.on('end', () => { if (pending !== '') readTier(pending) })
  const words = startValues.start === null ? '' : `; ${startValues.start.model === null ? '' : `model ${startValues.start.model}; `}${startValues.start.words}`
  if (words !== '') appendFileSync(launchDetails, `run ${run}${words}\n`)
  say(`run ${run} of ${servedAgent ?? 'the caller'} starts in its own container ${container}, sandbox ${name}${words}; host pid ${child.pid}; output here; details ${launchDetails}${opencode === null ? '' : `; ${opencode}`}`, chosen.verbose === true)
  for (const signal of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(signal, () => spawnSync('docker', ['stop', '--time', '30', container], { stdio: 'ignore' }))
  const ended = new Promise((done) => {
    child.on('error', (why) => done({ code: 1, why: why.message }))
    child.on('close', (code, signal) => done({ code: code ?? (signal === null ? 1 : 128 + (osConstants.signals[signal] ?? 0)), why: null }))
  })

  // ITS COMMAND'S ROW, once the command runs, as the run's own: the first process in the container that runs as the
  // sandbox's user, named by its pid on this machine. The container's first process is docker-init and the gate after
  // it, both root, and the office cannot read a root process from this machine's user: a row naming the container and
  // its pid 1 was answered with a 500. The gate may take some seconds before it starts the
  // command, so this looks for up to a minute. A docker that cannot answer is asked again.
  //
  // A LOOK THAT FINDS NOTHING SAYS SO, whether the container ended first or the minute ran out: the run then has no
  // process row, and only the container's row stands for it.
  // SANDBOX_ISOLATED_LOOK_MS, for a test only, shortens the minute; it can never lengthen it.
  const theUser = Number(THE_SANDBOX_USER.split(':')[0])
  const shorter = Number(process.env['SANDBOX_ISOLATED_LOOK_MS'])
  const lookFor = Number.isInteger(shorter) && shorter > 0 && shorter < 60_000 ? shorter : 60_000
  let processRow = null
  let noRowSaid = false
  let containerGone = false
  const lastLook = Date.now() + lookFor
  while (processRow === null && Date.now() < lastLook) {
    const state = theIsolatedContainersState(container)
    if (state === 'gone') {
      containerGone = true
      break
    }
    if (state?.Running === true && Number(state.Pid) > 0) {
      if (!existsSync(`/proc/${String(state.Pid)}`)) {
        say(`the first process of run ${run}'s container could not be read in /proc (it has most likely ended already), so no process row is filed for it.`)
        noRowSaid = true
        break
      }
      const command = theFirstProcessRunningAs(Number(state.Pid), theUser)
      if (command !== null) {
        const inside = thePidInsideItsNamespace(command)
        const row = await askTheOfficeWhileItRestarts(api, '/api/resources', {
          method: 'POST',
          workspace: sb.workspace,
          headers: asTheCaller,
          body: {
            type: 'process',
            key: String(command),
            sessionRecordId: run,
            startedByTheProduct: true,
            detail: `run ${run}, isolated in ${container}${inside === null ? '' : `, where it is pid ${String(inside)}`}: ${chosen.command.join(' ')}`,
          },
        }, { saying: say })
        if (row.status === 201) processRow = row.body.resource.id
        else {
          say(`the process row of run ${run} could not be written (${theOfficeSaid(row)}); the container's row stays open for it.`)
          noRowSaid = true
        }
        break
      }
    }
    await new Promise((later) => setTimeout(later, 150))
  }
  if (processRow === null && !noRowSaid) {
    say(
      containerGone
        ? `run ${run}'s container ended before any process of the sandbox's user was seen in it, so no process row was filed; only the container's row stood for the run.`
        : `no process of the sandbox's user (${THE_SANDBOX_USER}) appeared in run ${run}'s container within ${lookFor === 60_000 ? 'a minute' : `${String(lookFor)} milliseconds`}, so no process row was filed; only the container's row stands for the run.`,
    )
  }

  const { code, why } = await ended
  const said = why !== null ? `docker could not be started: ${why}` : `it exited ${String(code)}`
  if (processRow !== null) await releaseRow(processRow, `The command ended: ${said}`)
  await releaseRow(containerRow, `The isolated run ended: ${said}`)

  // THE RUN'S END.
  const at = localStamp(new Date())
  const patch = code === 0
    ? { detail: `Its isolated command in sandbox ${name} ended at ${at} with exit 0. It is left running for its supervisor to finish.` }
    : { state: 'crashed', detail: `Its isolated command in sandbox ${name} ended at ${at}: ${said}.` }
  const wrote = await askTheOffice(api, `/api/records/${encodeURIComponent(run)}`, { method: 'PATCH', workspace: sb.workspace, headers: asTheCaller, body: { dataPatch: patch } })
  if (wrote.status !== 200) say(`the end of run ${run} could not be written on it (${theOfficeSaid(wrote)}).`)
  say(`run ${run}'s isolated command ended: ${said}.`, code === 0)
  process.exit(code)
}

// ============================================================================ worker and round

/** The default runtime worker and round start. */
const A_WORKERS_RUNTIME = 'claude-code'
/**
 * THE OPTIONS worker AND round DO NOT TAKE, because each builds its own command and files its own run: its worktree
 * and its cut are decided here, and it is an agent's run, never the caller's own command.
 */
const NOT_FOR_A_WORKER = ['run', 'worktree', 'cwd', 'wait', 'timeout', 'plain-env', 'no-office-variables', 'continues']

/** Refuses what worker and round both refuse before they ask anything: a missing name, handle or brief, or a command. */
function aWorkersWords(verb) {
  const [name, extra] = chosen.targets
  if (name === undefined || extra !== undefined) usage(`Say which sandbox, once: node tools/sandbox.mjs ${verb} <instance> --agent <handle> --brief <file>.`)
  if (chosen.agent === undefined) usage(`Say which agent: node tools/sandbox.mjs ${verb} <instance> --agent <handle> --brief <file>.`)
  if (chosen.brief === undefined) usage(`Say which brief it reads: --brief <file>.`)
  if (chosen.command !== null) usage(`${verb} builds its runtime command from the brief, so nothing goes after --. To run a command of your own, use exec.`)
  for (const flag of NOT_FOR_A_WORKER) {
    if (verb === 'round' && ['continues', 'worktree'].includes(flag)) continue
    if (chosen[flag] !== undefined) usage(`${verb} does not take --${flag}: it decides the worktree, the cut and the command itself. To choose them, use exec.`)
  }
  // THE HANDLE NAMES A FOLDER AND A BRANCH (worktrees/<handle>, made by the helper), so it must be one name.
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(chosen.agent)) {
    refuse(`--agent ${chosen.agent} cannot name a worktree folder and a branch: a handle here is letters, digits, dots, hyphens and underscores. Nothing was started.`, 2)
  }
  if (chosen.model !== undefined && !/^[A-Za-z0-9][A-Za-z0-9._:@/-]*$/.test(chosen.model)) {
    refuse(`--model ${chosen.model} is not a model name: it goes on a command line, so it is letters, digits and . _ : @ / - only. Nothing was started.`, 2)
  }
  return name
}

/**
 * THE AGENT IS REGISTERED, or nothing happens. The handle is asked of the office by the path that resolves an arriving
 * reference (GET /api/participants/agent/<handle>). Registration is not done here: the refusal names the tool that does
 * it. worker and round ask this before the hand-run check, so it is a hand start's first ask and it waits while the
 * office restarts, as the hand-run check does (askTheOfficeWhileItRestarts). It is a read, so asking again cannot write
 * twice. A refusal after the wait says what failed and how long it asked again for. Answers the participant the
 * office read, whose roleReadAs says whether a worker's worktree is made for it (theWorktreesLeftOut).
 */
async function theAgentIsRegistered(handle, workspace, who, runtime) {
  const asked = await askTheOfficeWhileItRestarts(api, `/api/participants/agent/${encodeURIComponent(handle)}`, {
    workspace,
    headers: officeHeaders({ workspace, agent: who.agent, session: who.session }),
  }, { longestMs: theHandStartWait(), saying: say })
  if (asked.status === 404) {
    refuse(
      `No agent is registered as "${handle}", so no run can say whom it serves. Register it first with ` +
        `node tools/register-a-started-agent.mjs --handle ${handle} --name "<its name>" --role worker --runtime ${runtime} --key-file "$TMPDIR/${handle}.key". ` +
        'Nothing was filed or started.',
      2,
    )
  }
  // ONE REASON, SAID ONCE (the inspector's finding 3): a reply that was asked again carries its reason in `why`, and
  // What failed says that reason in full, so the first sentence does not repeat the office's words. An ordinary answer
  // from the office carries no `why`, and the first sentence keeps its words, as this refusal read before. The hand-run
  // check (anAgentsRunFiledHere) reads the same way.
  if (asked.status !== 200) {
    const because = whatFailed(asked)
    refuse(refusalOf(
      because === ''
        ? `The office could not say whether "${handle}" is a registered agent (${theOfficeSaid(asked)}).`
        : `The office could not say whether "${handle}" is a registered agent.`,
      because,
      'Nothing was filed or started.',
    ), 2)
  }
  if (asked.body?.participant?.retired === true) refuse(`"${handle}" is a retired agent, so no run may serve it. Nothing was filed or started.`, 2)
  return asked.body?.participant
}

/**
 * THE SANDBOX HAS A CLAUDE CODE LOGIN, or no Claude Code worker is started in it. The command
 * inside gets what docker gives it: the container's own environment, then the env file of secrets. That environment
 * is put together here and asked with the same check the helper makes inside, `aClaudeCodeLogin` in
 * src/config/claude-code-login.mjs, so the two cannot disagree about what a login is.
 */
function theClaudeCodeEnvironment(sb, lines, withSources = false) {
  const env = {}
  const from = {}
  const put = (pair, source) => {
    const at = String(pair).indexOf('=')
    if (at > 0) {
      env[String(pair).slice(0, at)] = String(pair).slice(at + 1)
      from[String(pair).slice(0, at)] = source
    }
  }
  for (const pair of sb.container.Config?.Env ?? []) put(pair, "the container's own environment")
  for (const line of lines) put(line, "the sandbox's secret lines")
  return withSources ? { env, from } : env
}

function theSandboxHasAClaudeCodeLogin(sb) {
  const secrets = theSecretsFor(sb.instance, A_WORKERS_RUNTIME, undefined, sb)
  const env = theClaudeCodeEnvironment(sb, secrets.lines)
  if (aClaudeCodeLogin(env)) return
  const routedOut = (secrets.keysLeftOut ?? []).filter((name) => CLAUDE_CODE_LOGINS.includes(name))
  refuse(
    `The sandbox ${sb.name} has no Claude Code login, so a Claude Code worker there would start logged out. ` +
      `None of ${CLAUDE_CODE_LOGINS.filter((name) => !routedOut.includes(name)).join(', ')} is set in its container or in ${secrets.file === null ? 'a secrets file (its template names none)' : `the secrets file ${secrets.file}`}, ` +
      `${routedOut.length === 0 ? '' : `${routedOut.join(' and ')} is there and is left out, because the provider router holds every API key while ${THE_ROUTER_SETTING} is on, `}` +
      `and there is no ${theCredentialsFile(env) ?? 'home in the container to hold a credentials file'}. Nothing was filed or started.`,
  )
}

/** Check the sandbox's Codex login file exists, without reading its contents. */
function theCodexLoginIn(sb) {
  const file = join(sb.dir, 'home', '.codex', 'auth.json')
  return { file, present: existsSync(file) && statSync(file).isFile() }
}

function theSandboxHasACodexLogin(sb) {
  const { file, present } = theCodexLoginIn(sb)
  if (present) {
    theSecretsFor(sb.instance, 'codex', undefined, sb)
    return
  }
  refuse(`The sandbox ${sb.name} has no Codex login at ${file}. Complete the Codex device-code login in this sandbox before starting a Codex worker. Nothing was filed or started.`)
}

/** Preserve each runtime's login boundary; OpenCode uses its own native configuration. */
function theSandboxHasTheRuntimeLogin(sb, runtime) {
  if (runtime === 'codex') return theSandboxHasACodexLogin(sb)
  if (runtime === A_WORKERS_RUNTIME) return theSandboxHasAClaudeCodeLogin(sb)
  const secrets = theSecretsFor(sb.instance, runtime, undefined, sb)
  if (runtime === 'dsh' && !theProviderRouterIsOn() && !theClaudeCodeEnvironment(sb, secrets.lines).DEEPSEEK_API_KEY) {
    refuse(`The sandbox ${sb.name} was given no DEEPSEEK_API_KEY for DSH. Nothing was filed or started.`)
  }
}

/** How much of a run's output is read at a time (eachEventLineOf). */
const A_PIECE_OF_THE_OUTPUT = 1024 * 1024

/**
 * THE LONGEST EVENT LINE OF A RUN'S OUTPUT THAT IS READ WHOLE. An event is one JSON line, and the events a round reads
 * (Codex's thread.started, an OpenCode event that names its session) are a few hundred bytes; a line past this is
 * refused, not passed over, because what it says could not be read.
 */
const AN_EVENT_LINE_AT_MOST = 64 * 1024 * 1024

/**
 * A RUN'S OWN OUTPUT, read where the helper writes it: logs/<run>/out in this sandbox's folder, by its real path, and a
 * file. The logs folder is mounted writable into the sandbox, so a program there can put a link or a pipe in its place;
 * what a link points at is not the run's output. The path is never taken from a start.json. The file is opened without
 * waiting, so a pipe cannot hold the launcher, and what was opened is the file at the real path.
 *
 * IT IS READ IN PIECES, LINE BY LINE, never as one string: one run printed
 * 2.59 GB, past the longest string Node makes, and reading it whole failed the next round. Only a line that begins with
 * `{`, after any spaces, tabs or carriage returns, can be an event, so every other line is passed over without being
 * kept. `each` is given every event line in order, and reading stops when it answers true.
 */
function eachEventLineOf(sb, run, each) {
  const folder = join(sb.dir, 'logs', run)
  const out = join(folder, 'out')
  const notItsOwn = () => {
    spoolAGateMet('a-round-reads-only-its-runs-output', 'block', sb.name)
    refuse(`Run ${run}'s output ${out} is not a file in ${folder} by its real path. A round reads the conversation it continues only from the run's own output in this sandbox's logs folder. Nothing was started.`)
  }
  let fd
  try { fd = openSync(out, fsConstants.O_RDONLY | fsConstants.O_NONBLOCK) }
  catch (why) { refuse(`Run ${run}'s output ${out} could not be read (${why instanceof Error ? why.message : String(why)}). Nothing was started.`) }
  try {
    let real
    try { real = realpathSync(out) } catch { notItsOwn() }
    const opened = fstatSync(fd)
    const there = statSync(real)
    if (real !== join(realpathSync(sb.dir), 'logs', run, 'out') || !opened.isFile() || opened.dev !== there.dev || opened.ino !== there.ino) notItsOwn()
    const piece = Buffer.alloc(A_PIECE_OF_THE_OUTPUT)
    let kept = [] // the parts of the event line not ended yet
    let length = 0
    let line = 'begun' // 'begun': nothing but spaces yet; 'event': it began with {; 'passed': anything else
    let at = 0
    const ended = () => {
      const event = line === 'event' ? Buffer.concat(kept, length).toString('utf8') : null
      kept = []; length = 0; line = 'begun'
      return event !== null && each(event) === true
    }
    for (;;) {
      const got = readSync(fd, piece, 0, piece.length, at)
      if (got === 0) return void ended()
      at += got
      for (let from = 0; from < got;) {
        const newline = piece.indexOf(0x0a, from)
        const to = newline === -1 || newline >= got ? got : newline
        let start = from
        if (line === 'begun') {
          while (start < to && (piece[start] === 0x20 || piece[start] === 0x09 || piece[start] === 0x0d)) start++
          if (start < to) line = piece[start] === 0x7b ? 'event' : 'passed'
        }
        if (line === 'event' && to > start) {
          length += to - start
          if (length > AN_EVENT_LINE_AT_MOST) {
            refuse(`Run ${run}'s output ${out} holds an event line longer than ${AN_EVENT_LINE_AT_MOST / 1024 / 1024} MiB, which the launcher does not read whole: what it says could not be read, and a round goes on only from what was read. Nothing was started.`)
          }
          kept.push(Buffer.from(piece.subarray(start, to)))
        }
        if (to === got) break
        if (ended()) return
        from = to + 1
      }
    }
  } finally {
    closeSync(fd)
  }
}

/**
 * WHETHER OPENCODE'S OWN DATABASE IN THE SANDBOX HOLDS A SESSION, asked inside the container, so the host never opens a
 * database a program in the sandbox can write. It prints one line, {"held":true|false|null,"why":…}, in words of its own
 * and none of the database's; null is a database that could not be asked. It is opened as the sandbox opens it, not read
 * only, because a read-only open of a database in OpenCode's write-ahead mode can fail where the sandbox's own would not.
 */
const THE_OPENCODE_SESSION_QUESTION = String.raw`
const fs = require('node:fs')
const [file, id] = process.argv.slice(1)
const answer = (held, why) => { process.stdout.write(JSON.stringify({ held, why }) + '\n'); process.exit(0) }
let real
try { real = fs.realpathSync(file) } catch { answer(false, 'there is no database there') }
if (real !== file || !fs.statSync(real).isFile()) answer(false, 'it is not a file by its real path')
let db
try { db = new (require('node:sqlite').DatabaseSync)(real) } catch { answer(null, 'it could not be opened as a database') }
try {
  if (db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'session'").get() === undefined) answer(false, 'it has no session table')
  const held = db.prepare('SELECT 1 FROM session WHERE id = ?').get(id) !== undefined
  answer(held, held ? 'its session table holds it' : 'its session table holds no session of that id')
} catch { answer(null, 'its session table could not be read') }
`

/**
 * OpenCode prints its native sessionID on structured events in this selected run's own output (eachEventLineOf), and the
 * session must be in one of this sandbox's own OpenCode databases: a round continues only a conversation this sandbox
 * holds. The agent's own file is asked first (theOpenCodeDatabaseOf), then the shared opencode.db, where a run started
 * without a file of its own keeps its session. It answers the session, the file's name for the helper's
 * --opencode-database, and what to say when that is the shared file (else null). A file that could not be asked is
 * refused, and the next file is not asked in its place.
 */
function theOpenCodeSessionOf(sb, run, agent) {
  const sessions = new Set()
  eachEventLineOf(sb, run, (line) => {
    let event
    try { event = JSON.parse(line) } catch { return false }
    if (typeof event?.type !== 'string' || !Object.hasOwn(event, 'sessionID')) return false
    if (typeof event.sessionID !== 'string' || !/^ses_[A-Za-z0-9]+$/.test(event.sessionID)) {
      refuse(`Run ${run}'s OpenCode output has an invalid native session identity. Nothing was started.`)
    }
    sessions.add(event.sessionID)
    return false
  })
  if (sessions.size !== 1) refuse(`Run ${run}'s OpenCode output must name one consistent native session identity; ${sessions.size === 0 ? 'none was found' : 'conflicting identities were found'}. Nothing was started.`)
  const session = [...sessions][0]
  const notThere = []
  for (const name of [theOpenCodeDatabaseOf(agent), THE_SHARED_OPENCODE_DATABASE].filter((one) => one !== null)) {
    const database = join(sb.dir, 'home', '.local', 'share', 'opencode', name)
    const asked = spawnSync('docker', ['exec', '-w', sb.dir, sb.instance.container.name, 'node', '--no-warnings', '-e', THE_OPENCODE_SESSION_QUESTION, database, session], { encoding: 'utf8' })
    let said = null
    try { said = JSON.parse(String(asked.stdout ?? '').trim().split('\n').pop() ?? '') } catch { /* said stays null: refused below */ }
    if (asked.status !== 0 || typeof said?.why !== 'string' || ![true, false, null].includes(said.held)) {
      refuse(`OpenCode's database in sandbox ${sb.name}, ${database}, could not be asked whether it holds the session that run ${run}'s output names (${asked.error?.message ?? `exit ${String(asked.status)}`}). Nothing was started.`)
    }
    if (said.held === null) refuse(`OpenCode's database in sandbox ${sb.name}, ${database}, could not be asked whether it holds the session that run ${run}'s output names: ${said.why}. Nothing was started.`)
    if (said.held === true) {
      const own = notThere[0]
      const says = name === THE_SHARED_OPENCODE_DATABASE && own !== undefined
        ? `Run ${run}'s OpenCode session is in the shared OpenCode database, ${database}, and not in ${agent}'s own, ${own.database}: ${own.why}. This round runs on the shared file.`
        : null
      return { session, database: name, says }
    }
    notThere.push({ database, why: said.why })
  }
  spoolAGateMet('opencode-resumes-only-this-sandboxs-session', 'block', sb.name)
  refuse(`Run ${run}'s output ${join(sb.dir, 'logs', run, 'out')} names an OpenCode session that is not in any OpenCode database a round of ${agent} looks in: ${notThere.map((one) => `${one.database} (${one.why})`).join(' and ')}. A round continues only a conversation this sandbox holds. Nothing was started.`)
}

/** Native OpenCode continuation is explicit, and its model keeps the provider. */
function theOpenCodeCommand({ model, worktree, session = null }) {
  return ['opencode', 'run', '--format', 'json', '--dir', worktree, '-m', model, ...(session === null ? [] : ['--session', session])]
}

/** Codex takes its own model name; the run keeps the provider form. */
function theNameCodexTakes(model, whence) {
  const provider = THE_PROVIDER_A_RUNTIME_RUNS['codex'] ?? null
  const name = provider !== null && model.startsWith(`${provider}/`) ? model.slice(provider.length + 1) : ''
  if (name !== '' && !name.includes('/')) return name
  refuse(`${whence} names the model ${model}, which Codex cannot run here: a Codex worker requires a model of provider ${provider}, named ${provider}/<model>. Nothing was started.`, 2)
}

/** Read the thread from this run's own JSON output, never from another conversation. */
/**
 * THE SHAPE OF A CODEX THREAD ID: a UUID, as Codex prints it in thread.started (for example 01a116fe-8511-73f1-…). The id is
 * read from the run's own output, which sits in the sandbox folder the run itself can write, so anything else (--last, a value
 * that begins with -, words) is refused before it can reach Codex's command line as an option or another conversation.
 */
const A_CODEX_THREAD_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * THE THREAD A CODEX ROUND RESUMES, from the run's own output (eachEventLineOf), and only when this sandbox's own Codex home
 * holds it: Codex names a thread's rollout after the thread (theCodexRolloutFor). Nothing of the output's words goes into
 * a refusal: it names the file and the rule.
 */
function theCodexThreadOf(sb, run) {
  const out = join(sb.dir, 'logs', run, 'out')
  let thread = null // From the first thread.started that names a thread; reading stops there.
  eachEventLineOf(sb, run, (line) => {
    let event
    try { event = JSON.parse(line) } catch { return false } // Non-event lines do not name a thread.
    if (event?.type !== 'thread.started' || typeof event.thread_id !== 'string' || event.thread_id.trim() === '') return false
    thread = event.thread_id
    return true
  })
  if (thread === null) refuse(`Run ${run}'s output ${out} holds no thread.started event naming a Codex thread. Nothing was started.`)
  if (!A_CODEX_THREAD_ID.test(thread)) {
    refuse(`Run ${run}'s output ${out} names a Codex thread that is not the shape Codex gives a thread (a UUID). The output is written where the run itself can write, so only a thread of that shape is passed to Codex, and nothing of the output is repeated here. Nothing was started.`)
  }
  // THE SANDBOX'S OWN CODEX HOME, by its real path: a link there could lead anywhere on this computer.
  const sessions = join(sb.dir, 'home', '.codex', 'sessions')
  let real = null
  try { real = realpathSync(sessions) }
  catch (why) {
    if (why?.code !== 'ENOENT') refuse(`The Codex home of sandbox ${sb.name}, ${sessions}, could not be read (${why instanceof Error ? why.message : String(why)}). Nothing was started.`)
  }
  if (real !== null && real !== join(realpathSync(sb.dir), 'home', '.codex', 'sessions')) {
    spoolAGateMet('codex-resumes-only-this-sandboxs-thread', 'block', sb.name)
    refuse(`The Codex home of sandbox ${sb.name}, ${sessions}, is not that folder by its real path, so what it holds is not this sandbox's. Nothing was started.`)
  }
  if (real === null || theCodexRolloutFor(thread, real) === null) {
    spoolAGateMet('codex-resumes-only-this-sandboxs-thread', 'block', sb.name)
    refuse(`Run ${run}'s output ${out} names a Codex thread that is not in this sandbox's own Codex home, ${sessions}: no rollout file named after the thread is there, and a folder there that cannot be read is not searched. A round resumes only a conversation this sandbox holds. Nothing was started.`)
  }
  return thread
}

/**
 * Codex stays argv[0], so the helper adds its permissions and office tool. Each image is given as -i <path>. The last
 * word is -, so Codex reads its prompt from its standard input, which the helper's --stdin makes the brief's file.
 */
function theCodexCommand({ model, thread = null, images = [] }) {
  return ['codex', 'exec', '--json', ...images.flatMap((image) => ['-i', image]), ...(thread === null ? [] : ['resume', thread]), '-m', model, '--', '-']
}

/**
 * WHY AN --image IS NOT A FILE OF THE WORKER'S WORKTREE `dir`, or null when each one is, by the one rule the ask door
 * checks too (src/config/a-workers-images.mjs). It is checked after the worktree is made and before the run is filed.
 */
function whyAnImageIsNotInTheWorktree(dir, images) {
  for (const image of images) {
    const not = whyNotAFileOfTheWorktree(dir, image)
    if (not === null) continue
    return `${anImageNotInTheWorktree(image, dir, not)} ${AN_IMAGE_IS_UNDER_THE_WORKTREE}`
  }
  return null
}

/** Keep the additive selection beside the unchanged effort envelope. Older helpers refuse fields they cannot carry. */
function theSelectionHandoff(lines, helperSource, values) {
  if (values.start?.selection === undefined) return
  if (!helperSource.includes('SANDBOX_START_SELECTION')) refuse('This sandbox helper cannot carry native selection data; refresh its launcher before starting this row. Nothing was started.',2)
  lines.push(`SANDBOX_START_SELECTION=${JSON.stringify(values.start.selection)}`)
}
/**
 * THE CASTING ROW'S SELECTION THE OFFICE GAVE THIS START (--selection), or undefined when none was given. It is read by
 * the one reader, it must name a Casting row, and it must agree with this start's runtime and its --model, or nothing is
 * filed or started. It is never used unchecked: theStartValues hands it to aCommandsStartFromTheOffice, which has the
 * office recheck it at that row's revision before anything is filed, and a refusal, another answer or no answer refuses
 * the start.
 */
function theSelectionGiven(runtime, model) {
  if (chosen.selection === undefined) return undefined
  let given
  try { given = JSON.parse(chosen.selection) } catch { refuse('--selection is not JSON. Nothing was started.', 2) }
  try { given = readLauncherSelection(given) } catch { refuse('--selection is not a whole launcher selection. Nothing was started.', 2) }
  if (given.casting === null) refuse('--selection names no Casting row, so the office cannot recheck it. Nothing was started.', 2)
  if (given.runtime !== runtime) refuse(`--selection is for ${given.runtime}, and this start is for ${runtime}. Nothing was started.`, 2)
  if (model !== undefined && !aNameNamesTheSelection(model, given)) refuse(`--selection is for the model ${given.model}, and --model names ${model}. Nothing was started.`, 2)
  return given
}
/** Refuse before filing anything; the helper uses this same reader inside the container. */
async function theStartValues(command, runtime, model, env = process.env, office = {}) {
  try { const values = await aCommandsStartFromTheOffice(command, { api, ...office, runtime, model, env }); if (values.compatibilityWords) say(values.compatibilityWords,true); return values }
  catch (why) { refuse(why instanceof Error ? why.message : String(why), 2) }
}

/**
 * THE HOST'S LIST OF THE RUNS IT FILED IN A SANDBOX: one file for each run, in the launcher's own folder for the
 * sandbox, which no sandbox can see (hostOnlyFolder). A round chooses the run it continues from this list, and never from
 * a start.json under logs/: that folder is mounted writable into the sandbox, so a program there can write a start.json
 * that names any run, of any agent, in any sandbox. An entry is written when the run is filed, and says when the helper
 * started it, or that it never started, and which session registered the container row the run was filed under. Its
 * times are the local time with its offset (clockStamp in src/shared/time.ts), and the list is in the order of the moments
 * the runs were filed, so the clocks going back never put a later run first. A run filed before the list was kept, or
 * started from inside the sandbox, has no entry. A round continues such a run only when --continues names it, after the
 * same checks of its record as a run on the list (commandRound).
 */
const A_RUN_ID = /^[A-Za-z0-9_-]+$/

function theHostsRunsFolder(sb) {
  return join(hostOnlyFolder(sb.name), 'runs')
}

function theHostsEntryFile(sb, run) {
  if (typeof run !== 'string' || !A_RUN_ID.test(run)) throw new Error(`${JSON.stringify(run)} is not a run id that can name a file.`)
  return join(theHostsRunsFolder(sb), `${run}.json`)
}

function writeTheHostsEntry(sb, entry) {
  try {
    mkdirSync(theHostsRunsFolder(sb), { recursive: true, mode: 0o700 })
    writeWhole(theHostsEntryFile(sb, entry.run), `${JSON.stringify(entry, null, 2)}\n`, 0o600)
  } catch (why) {
    throw new Error(`run ${entry.run} could not be put on the host's list of the runs it filed in sandbox ${sb.name}, ${theHostsRunsFolder(sb)} (${why instanceof Error ? why.message : String(why)}), so no round could continue it.`)
  }
}

/** One mark on an entry the host wrote; a run with no entry throws, and is never given one here. */
function markTheHostsEntry(sb, run, mark) {
  const file = theHostsEntryFile(sb, run)
  const entry = JSON.parse(readFileSync(file, 'utf8'))
  writeWhole(file, `${JSON.stringify({ ...entry, ...mark }, null, 2)}\n`, 0o600)
}

/** The entries, oldest first. An entry the launcher could not have written is refused, never passed over. */
function theHostsList(sb) {
  const folder = theHostsRunsFolder(sb)
  if (!existsSync(folder)) return []
  const entries = []
  for (const one of readdirSync(folder, { withFileTypes: true })) {
    if (!one.name.endsWith('.json')) continue // A write that never finished, as writeWhole names it.
    const file = join(folder, one.name)
    const bad = (why) => {
      spoolAGateMet('the-hosts-run-list-is-sound', 'block', sb.name)
      refuse(`The host's list of the runs it filed in sandbox ${sb.name} holds ${file}, which ${why}. Only the launcher writes that folder, so find out what wrote the file. Nothing was started.`)
    }
    if (!one.isFile()) bad('is not a file')
    let entry
    try { entry = JSON.parse(readFileSync(file, 'utf8')) } catch { bad('is not JSON') }
    if (typeof entry?.run !== 'string' || !A_RUN_ID.test(entry.run) || `${entry.run}.json` !== one.name) bad('does not name the run its file is named after')
    if (typeof entry.agent !== 'string' || typeof entry.runtime !== 'string' || typeof entry.filedAt !== 'string' || momentOfAnInstant(entry.filedAt) === null) bad('does not say the agent, the runtime and when the run was filed, as a local time with its offset')
    if (![entry.started, entry.neverStarted].every((value) => value === null || typeof value === 'string')) bad('does not say whether the run started')
    if (entry.containerSession !== null && typeof entry.containerSession !== 'string') bad('does not say which session registered the container the run was filed under')
    entries.push(entry)
  }
  return entries.sort((a, b) => momentOfAnInstant(a.filedAt) - momentOfAnInstant(b.filedAt) || a.run.localeCompare(b.run))
}

const NOT_ON_THE_HOSTS_LIST =
  'A run filed before the host kept this list, or started from inside the sandbox, is not on it: round continues such ' +
  'a run only when --continues names it. Otherwise start a worker, with node tools/sandbox.mjs worker.'

/**
 * THE RUN A ROUND CONTINUES, and its record: the one --continues names, with its entry on the host's list
 * (theHostsList), or null for an entry when the list does not hold it; or, without --continues, the agent's newest run
 * on the round's runtime on that list, with its entry. The caller checks the record against the agent, the runtime and
 * this sandbox (whyARunWasNotFiledHere), the same checks for a run the list does not hold.
 *
 * NULL when, without --continues, the agent has no start on the round's runtime: the round then starts a new
 * conversation there (whyARoundStartsANewConversation), so that is no refusal and nothing is counted.
 */
async function theRunARoundContinues(sb, who, agent, runtime, continues) {
  const list = theHostsList(sb)
  // Each refusal from the list is counted in the gate-count spool (gate a-round-continues-only-this-agents-run). A record
  // that could not be read is not.
  const refused = (sentence) => {
    spoolAGateMet('a-round-continues-only-this-agents-run', 'block', sb.name)
    refuse(sentence)
  }
  let entry
  if (continues !== undefined) {
    entry = list.find((one) => one.run === continues) ?? null
    if (entry !== null && entry.agent !== agent) refused(`Run ${continues} is a start of ${entry.agent} in sandbox ${sb.name}, not a start of ${agent}. Nothing was started.`)
    if (entry !== null && entry.neverStarted !== null) refused(`Run ${continues} of ${agent} was filed in sandbox ${sb.name} and never started (${entry.neverStarted}), so nothing of it can be continued. Nothing was started.`)
  } else {
    const own = list.filter((one) => one.agent === agent && one.neverStarted === null)
    if (own.length === 0) {
      refused(`${agent} has no run in sandbox ${sb.name} to continue: the host's list of the runs it filed there, ${theHostsRunsFolder(sb)}, holds no run of it that started. ${NOT_ON_THE_HOSTS_LIST} Nothing was started.`)
    }
    const onIt = own.filter((one) => one.runtime === runtime)
    if (onIt.length === 0) return null
    entry = onIt[onIt.length - 1]
    if (entry.started === null) {
      refused(`Run ${entry.run}, the last run of ${agent} on runtime ${runtime} in sandbox ${sb.name}, was filed at ${entry.filedAt}, and the host's list does not say the helper started it. Name the run to continue with --continues <run>. Nothing was started.`)
    }
  }
  const run = entry?.run ?? continues
  const read = await askTheOffice(api, `/api/records/${encodeURIComponent(run)}`, { workspace: sb.workspace, headers: officeHeaders({ workspace: sb.workspace, agent: who.agent, session: who.session }) })
  if (read.status !== 200) {
    refuse(
      entry === null
        ? `Run ${run}, which --continues names, is not on the host's list of sandbox ${sb.name}, and its record could not be read (${theOfficeSaid(read)}). Nothing was started.`
        : `Run ${run}, a start of ${agent} in sandbox ${sb.name}, could not be read (${theOfficeSaid(read)}). Nothing was started.`,
    )
  }
  const record = read.body?.record ?? read.body
  return { run, data: record?.data ?? {}, title: record?.title, entry }
}

/** WHY A ROUND CANNOT WORK IN A RUN'S WORKTREE, or null: it is gone, or it holds no A_ROUNDS_RULES to read the chapters from. */
function whyARoundCannotWorkIn(folder) {
  if (!existsSync(folder)) return `works in ${folder}, which is gone`
  if (!existsSync(join(folder, A_ROUNDS_RULES))) return `works in ${folder}, which holds no ${A_ROUNDS_RULES}`
  return null
}

/** Whether a round can work in the worktree a run's record names: it names one, and whyARoundCannotWorkIn finds nothing. */
function aRoundCanWorkInTheWorktreeOf(data) {
  return typeof data.workingDirectory === 'string' && data.workingDirectory !== '' && whyARoundCannotWorkIn(data.workingDirectory) === null
}

/**
 * WHY A ROUND STARTS A NEW CONVERSATION, in words, or null when it continues `last`, the run theRunARoundContinues gave.
 * Without --continues: the agent has no start on the runtime, or that run's worktree is gone or holds no rules file.
 * With --continues (`named`): the run named ran on another runtime, or its worktree is gone or holds no rules file, or
 * both. A run that names no worktree is no reason, nor is a run whose record names no runtime: the round refuses it, as
 * it did before.
 */
function whyARoundStartsANewConversation(sb, agent, runtime, last, named) {
  if (last === null) return `${agent} has no start on runtime ${runtime} in sandbox ${sb.name}`
  const folder = last.data.workingDirectory
  const cannot = typeof folder === 'string' && folder !== '' ? whyARoundCannotWorkIn(folder) : null
  if (!named) return cannot === null ? null : `run ${last.run}, the last run of ${agent} on runtime ${runtime} in sandbox ${sb.name}, ${cannot}`
  const elsewhere = typeof last.data.runtime === 'string' && last.data.runtime !== runtime ? `ran on runtime ${last.data.runtime}` : null
  const reasons = [elsewhere, cannot].filter((one) => one !== null)
  return reasons.length === 0 ? null : `run ${last.run}, which --continues names, ${reasons.join(' and ')}`
}

/**
 * THE RUN WHOSE WORKTREE, CUT AND TITLE A NEW CONVERSATION TAKES, with its record: the agent's newest run on the host's
 * list, on any runtime, that started and works in a worktree a round can work in, other than `last`, the run the
 * round could not continue. With none, the round is refused, and that is not counted: no run was continued.
 */
async function theRunANewConversationTakes(sb, who, agent, runtime, why, last) {
  const others = theHostsList(sb).filter((one) => one.agent === agent && one.neverStarted === null && one.started !== null && one.run !== last)
  for (const one of others.reverse()) {
    const taken = await theRunARoundContinues(sb, who, agent, runtime, one.run)
    if (aRoundCanWorkInTheWorktreeOf(taken.data)) return taken
  }
  refuse(`A round of ${agent} on runtime ${runtime} has nowhere to work. It cannot continue a run, because ${why}. No started run of ${agent} in sandbox ${sb.name} works in a worktree that is there and holds ${A_ROUNDS_RULES}. Start a worker for ${agent} with node tools/sandbox.mjs worker, which makes its worktree. Nothing was started.`)
}

/** Whether a run's record names this sandbox's folder, by its real path, as theSandboxField wrote it. Null when it does. */
function whyARunsFolderIsNotThisSandboxs(sb, data) {
  const folder = realpathSync(sb.dir)
  return data.sandbox?.folder === folder ? null : `its record says it was filed in the sandbox folder ${JSON.stringify(data.sandbox?.folder ?? null)}, not ${folder}`
}

/**
 * WHETHER A RUN'S RECORD SAYS IT WAS FILED IN THIS SANDBOX: the folder by its real path, and the container row, as
 * theSandboxField wrote them when the run was filed. Null when it does, or what differs, in words.
 *
 * THE CONTAINER ROW is this sandbox's current one, or an older row of this sandbox's own container that the ledger has
 * released. `up` makes the container again under a new row and `down` releases the old one, so a run filed before that
 * names the old row: 40 of the office's continued runs did (the host's count, 17 October 2026). The older row is looked
 * for under one session, `session`, since the ledger's whole history is not read. For a run on the host's list it is
 * the session its entry says registered the container then (entry.containerSession). For a run --continues names that
 * the list does not hold, nothing the host wrote says which session registered it, so it is the session that
 * registered this sandbox's current container (startedBy in its facts); an older row another session registered is
 * not found. A row of another container, a row still open, or a row nobody can find is refused, by its id.
 *
 * What differs comes as `{ why, unread }`: the words, and whether it is only that the row could not be looked for,
 * because the ledger or the session's rows could not be read (theContainerRowNamed).
 */
async function whyARunWasNotFiledHere(sb, who, data, session) {
  const elsewhere = whyARunsFolderIsNotThisSandboxs(sb, data)
  if (elsewhere !== null) return { why: elsewhere, unread: false }
  const row = data.sandbox?.container
  if (row === sb.instance.containerRow) return null
  const named = `its record says it was filed with the container row ${JSON.stringify(row ?? null)}, which is not this sandbox's current row ${JSON.stringify(sb.instance.containerRow)}`
  if (typeof row !== 'string' || row === '') return { why: named, unread: false }
  if (typeof session !== 'string') return { why: `${named}, and nothing names a session that registered an earlier container of this sandbox, to look for that row under`, unread: false }
  const { row: held, why, unread = false } = await theContainerRowNamed({ workspace: sb.workspace, containerRow: row, startedBy: { session } }, who)
  if (held === null) return { why: `${named}, and that row ${why}`, unread }
  const name = sb.instance.container?.name
  if (held.type !== 'container' || held.key !== name) return { why: `${named}, and that row is the ledger row of the ${held.type} ${held.key}, not of this sandbox's container ${name}`, unread: false }
  if (held.releasedAt == null) return { why: `${named}, and that row is still open`, unread: false }
  return null
}

/**
 * THE RUN A ROUND CONTINUES SERVES THIS AGENT, RAN ON THIS RUNTIME AND WAS FILED IN THIS SANDBOX, by its record
 * (commandRound), or the round is refused. Each refusal is counted in the gate-count spool (gate
 * a-rounds-run-was-filed-here), except one where the container row could not be looked for, since then nobody knows.
 * A runtime of null is for a run that may have run on any runtime: the run a new conversation takes its worktree from,
 * and a run --continues names, which a new conversation follows when it ran on another.
 */
async function theRoundsRunWasFiledHere(sb, who, agent, runtime, before, data, entry) {
  const refused = (sentence) => {
    spoolAGateMet('a-rounds-run-was-filed-here', 'block', sb.name)
    refuse(sentence)
  }
  if (data.servingAgent !== agent) {
    refused(
      entry === null
        ? `Run ${before}, which --continues names, is not on the host's list of sandbox ${sb.name}, and its record says it serves ${JSON.stringify(data.servingAgent ?? null)}, not ${agent}. Nothing was started.`
        : `Run ${before} was started for ${agent} in sandbox ${sb.name}, but its record says it serves ${JSON.stringify(data.servingAgent ?? null)}. Nothing was started.`,
    )
  }
  if (runtime !== null && data.runtime !== runtime) {
    refused(`Run ${before} of ${agent} ran on runtime ${data.runtime ?? '(not recorded)'}, and this round requires runtime ${runtime}. Nothing was started.`)
  }
  const notHere = await whyARunWasNotFiledHere(sb, who, data, entry === null ? sb.instance.startedBy?.session ?? null : entry.containerSession)
  if (notHere === null) return
  const sentence = entry === null
    ? `Run ${before} of ${agent}, which --continues names, is not on the host's list of sandbox ${sb.name}, and ${notHere.why}. Nothing was started.`
    : `Run ${before} of ${agent} is on the host's list of sandbox ${sb.name}, but ${notHere.why}. Nothing was started.`
  if (notHere.unread) refuse(sentence)
  refused(sentence)
}

/**
 * NOTHING OF THE AGENT'S STILL RUNS IN THIS SANDBOX, or nothing is started: this is what stops a worker being started
 * twice. The agent's runs are the ones the host's list holds (theHostsList), and the
 * ledger's open process rows of those runs say whether one still runs; its liveness reading knows a reused pid from the
 * process it registered. A row that is not open was closed, and closing it stopped its group.
 *
 * A RUN THE LIST DOES NOT HOLD, as a run filed before the list was kept, or a run --continues names, is found from the
 * office's own records: each open process row of a run off the list, and that run's record, which must say it serves
 * this agent and was filed in this sandbox's folder, by real path. Nothing is read from a start.json under logs/, which
 * a program in the sandbox can write (round 63, item 4). A run of another agent, or in another sandbox, holds nothing
 * back. The container row is not asked here: a run filed before the container was made again still holds the round
 * back while its process row is open.
 *
 * A process that cannot be checked, a ledger that cannot be read, or a record that cannot be read, is refused too:
 * nobody can say it has ended.
 */
async function nothingOfItStillRuns(sb, who, agent) {
  const list = theHostsList(sb)
  const own = new Set(list.filter((one) => one.agent === agent).map((one) => one.run))
  const listed = new Set(list.map((one) => one.run))
  const ledger = await theLedger(sb.workspace, who)
  if (ledger.rows === null) {
    refuse(`The ledger could not be read (${ledger.why}), so nobody can say whether a run of ${agent} in sandbox ${sb.name} has ended. Nothing was started.`)
  }
  const open = ledger.rows.filter((row) => row.type === 'process' && row.releasedAt == null && row.liveness?.state !== 'gone')
  const rows = open.filter((row) => own.has(row.sessionRecordId))
  const offTheList = new Map()
  for (const row of open) {
    if (typeof row.sessionRecordId !== 'string' || listed.has(row.sessionRecordId)) continue
    offTheList.set(row.sessionRecordId, [...(offTheList.get(row.sessionRecordId) ?? []), row])
  }
  for (const [run, its] of offTheList) {
    const read = await askTheOffice(api, `/api/records/${encodeURIComponent(run)}`, { workspace: sb.workspace, headers: officeHeaders({ workspace: sb.workspace, agent: who.agent, session: who.session }) })
    if (read.status !== 200) {
      refuse(`Run ${run}, which the ledger's open process row ${its[0].id} is of, could not be read (${theOfficeSaid(read)}), so nobody can say whether it is a run of ${agent} in sandbox ${sb.name} that still runs. Nothing was started.`)
    }
    const data = (read.body?.record ?? read.body)?.data ?? {}
    if (data.servingAgent === agent && whyARunsFolderIsNotThisSandboxs(sb, data) === null) rows.push(...its)
  }
  for (const row of rows) {
    const which = `run ${row.sessionRecordId} of ${agent}, process row ${row.id}, host pid ${row.key} group ${row.pgid}`
    if (row.liveness?.state === 'alive') {
      refuse(
        `${which}, is still running in sandbox ${sb.name} (${row.liveness.detail}). A run of ${agent} is started here only once ` +
          'the one before has ended, so that it is never started twice. Nothing was started.',
      )
    }
    refuse(`${which}, cannot be checked (${row.liveness?.reason ?? 'the ledger gave no reading'}), so nobody can say it has ended. Nothing was started.`)
  }
}

/**
 * THE NAME CLAUDE TAKES FOR A MODEL, or a refusal before anything is started.
 *
 * A run's record holds its model in the word its starter gave, and exec --agent is given the provider/model form that
 * tools/register-a-run.mjs takes, such as anthropic/claude-opus-5-5. claude knows only its own names. A round that
 * took that word from the run before handed it on, and claude answered "There's an issue with the selected model", so
 * the round crashed at its first step (29 September 2026).
 *
 * Anthropic's own name is the part after "anthropic/": the office reads anthropic/claude-opus-5-5 and claude-opus-5-5
 * as the same model (withoutTheProvider in src/shared/session-page.ts). A worker here holds the Claude login and no
 * other provider's key, so a model another provider names cannot run in it, and is refused with the reason. A name
 * with no provider is claude's own already, and goes on as it is.
 *
 * @param {string} model  the model as it was typed or recorded
 * @param {string} whence  what named it, for the refusal: "--model" or the run it was read from
 * @returns {string}
 */
function theNameClaudeTakes(model, whence) {
  const own = THE_PROVIDER_A_RUNTIME_RUNS['claude-code'] ?? null
  const slash = model.indexOf('/')
  if (slash === -1) return model
  const provider = model.slice(0, slash)
  const name = model.slice(slash + 1)
  if (own !== null && provider === own && name !== '' && !name.includes('/')) {
    say(`${whence} names the model ${model}; claude is given its own name for it, ${name}.`, true)
    return name
  }
  refuse(
    `${whence} names the model ${model}, which claude cannot run: a worker here holds the Claude login only, so claude ` +
      `takes a model of provider ${own} under its own name (claude-opus-5-5). Give --model <model>. Nothing was started.`,
    2,
  )
}

/**
 * THE COMMAND A CLAUDE CODE WORKER RUNS: `claude -p` with the model named. The helper adds Claude
 * Code's full-permission arguments and office MCP configuration right after the program's name.
 * The brief goes through the helper's --stdin option. A second round adds --continue, which picks
 * up the conversation Claude Code last had in the same worktree.
 *
 * IT ENDS WITH ITS USAGE ENVELOPE (--output-format json; milestone M8): the last line of its output file is one JSON
 * object holding its answer as `result`, and its tokens, cost and model, which tools/sandbox-start.mjs writes onto
 * the run as its usage receipt. A -p run prints only its last answer either way, so no line of a live log is lost.
 *
 * A helper from before --stdin keeps the shell path. The host supplies effort through the supported environment.
 */
function theClaudeCodeCommand({ model, brief, continues, direct }) {
  const said = ['--output-format', 'json']
  if (direct) return ['claude', '-p', ...(continues ? ['--continue'] : []), '--model', model, ...said]
  const full = FULL_PERMISSIONS[A_WORKERS_RUNTIME]
  const quoted = `'${brief.replaceAll("'", `'\\''`)}'`
  return ['sh', '-c', ['exec', full.program, '-p', ...(continues ? ['--continue'] : []), '--model', model, ...said, ...full.args, '<', quoted].join(' ')]
}

/**
 * WHETHER THIS SANDBOX'S HELPER TAKES --stdin, read from the helper itself as 'filed' is in anAgentsRunFiledHere. A
 * start refreshes main before this read. For Claude Code, a helper that still lacks the option uses the existing shell
 * path. Codex and OpenCode have no other way to get their brief, so for them such a helper is refused here, before
 * anything is filed.
 * @param {{helper: string}} sb
 * @param {string} runtime
 * @returns {boolean}
 */
function theHelperTakesStdin(sb, runtime) {
  if (readFileSync(sb.helper, 'utf8').includes("'stdin'")) return true
  if (runtime !== A_WORKERS_RUNTIME) refuse(`The helper in ${sb.helper} is from before --stdin, so it cannot give ${runtime === 'codex' ? 'a Codex' : 'an OpenCode'} run its brief on standard input, and nothing was filed or started.`)
  say(`the helper in ${sb.helper} is from before --stdin, so this worker starts through sh -c with its brief on its ` +
    'standard input, as before, and gets no office_request. This repo has not checked out the updated helper from ' +
    'origin/main at this start; see the main refresh details for why. The next agent start where checked-out main ' +
    'can follow origin/main uses the updated helper.')
  return false
}

/**
 * WHETHER THIS SANDBOX'S HELPER TAKES --opencode-database, read from the helper as theHelperTakesStdin reads --stdin,
 * after a start has refreshed main. A helper from before it refuses the flag after the round is filed, and gives
 * OpenCode no database, so OpenCode opens the shared file. A round whose session is there runs without the flag. One
 * whose session is in the agent's own file, which such a helper cannot give, is refused here, before anything is filed.
 * @param {{helper: string}} sb
 * @returns {boolean}
 */
function theHelperTakesTheOpenCodeDatabase(sb, run, database) {
  if (readFileSync(sb.helper, 'utf8').includes("'opencode-database'")) return true
  if (database === THE_SHARED_OPENCODE_DATABASE) {
    say(`the helper in ${sb.helper} is from before --opencode-database, so this round passes it no database: it gives OpenCode none, and OpenCode opens the shared ${database}, which holds run ${run}'s session.`)
    return false
  }
  refuse(`The helper in ${sb.helper} is from before --opencode-database, so it cannot run this round on ${database}, the OpenCode database that holds run ${run}'s session. Bring this sandbox's checkout of main up to date and start the round again: the main refresh details say why it did not follow at this start. Nothing was started.`)
}

/**
 * THE WORKTREE'S SIZE AFTER THE START, in the start's words: the bytes and the number of its files, read on the host,
 * with git's own folder at the top and every link left out, so a node_modules link counts as nothing. The run has
 * started, so a file or folder it removed while they were counted is not counted. Words that say it could not be read,
 * and why, when it could not.
 */
function theWorktreesSize(dir) {
  let bytes = 0
  let files = 0
  const goneOr = (read) => {
    try { return read() } catch (why) { if (why?.code === 'ENOENT') return null; throw why }
  }
  try {
    const walk = (folder, top) => {
      for (const entry of goneOr(() => readdirSync(folder, { withFileTypes: true })) ?? []) {
        if (top && entry.name === '.git') continue
        const path = join(folder, entry.name)
        if (entry.isDirectory()) walk(path, false)
        else if (entry.isFile()) {
          const size = goneOr(() => lstatSync(path).size)
          if (size === null) continue
          bytes += size
          files += 1
        }
      }
    }
    if (!statSync(dir).isDirectory()) throw new Error(`${dir} is not a folder`)
    walk(dir, true)
  } catch (why) {
    return `its size could not be read after the start (${why instanceof Error ? why.message : String(why)})`
  }
  return `${bytes} bytes in ${files} files after the start`
}

/** The human launch line for worker and round; verbose JSON callers keep it on stderr. */
function sayWhatWasStarted(verb, start, { agent, model, worktree, brief, briefBytes, continues, follows = null, packages = null }) {
  const size = briefBytes
  const command = start.command
  const words =
    `${verb}: run ${start.run} of ${agent} is started in sandbox ${start.instance}` +
      (continues !== null ? `, continuing run ${continues}` : follows !== null ? `, following run ${follows} in a new conversation` : '') +
      `. Model ${model}; ${start.startWords}; ${packages === null ? '' : packages + '; '}worktree ${worktree}, ${theWorktreesSize(worktree)}; brief ${brief}; process row ${start.processRow}, host pid ${start.hostPid} group ${start.hostPgid}; ` +
      `output ${start.out}; details ${launchDetails}. Its command: ${command.join(' ')}; brief size ${size} bytes`
  appendFileSync(launchDetails, `sandbox: ${words}\n`)
  if (!chosen.json) process.stdout.write(`${words}\n`)
  else if (chosen.verbose === true) process.stderr.write(`sandbox: ${words}\n`)
}

/**
 * ONE USE LINE ON THE CALLING RUN, with the slug sandbox (writeAUseLine in tools/use-line.mjs): which agent, which run
 * was filed for it, which run it continues, and which run it follows in a new conversation, when it is linked to one.
 * It is written as the caller, on the caller's session. What the office answered is said on stderr, and the exit code
 * stays the command's.
 */
async function writeTheUseLine(verb, sb, who, { agent, run, continues, follows = null }) {
  const followed = continues === null && follows !== null ? `, and follows run ${follows} in a new conversation` : ''
  const said = `${verb}: run ${run} was filed for ${agent} in sandbox ${sb.name}; it continues ${continues === null ? 'no run' : `run ${continues}`}${followed}.`
  const { words, written } = await writeAUseLine({ tool: 'sandbox', said, office: { api, workspace: sb.workspace, agent: who.agent, session: who.session } })
  say(words, written)
}

/**
 * THE STANDING STAGES OF THE FLOWS THAT APPLY TO AN AGENT, read from the office as this start begins (readTheStandingStages),
 * each read waiting while the office restarts. The line says how many were read, from which flow at which revision, or
 * why none are given. A round says it in its chapter list. A worker says it in its launch details, and aloud too when
 * the office did not answer every read, since a healthy start says one line.
 */
async function theStandingStagesFor(agent, sb, who, { saying = true } = {}) {
  const standing = await readTheStandingStages({
    agent,
    request: (path, project = sb.workspace) => askTheOfficeWhileItRestarts(api, path, { workspace: project, headers: theCallerNamed(project, who) }, { saying: say }),
  })
  if (saying) say(standingStagesLine(standing), theStandingStagesWereRead(standing))
  return standing
}

/**
 * THE MODEL THE OFFICE GIVES A START that names none, through the same reader the helper uses (criterion U2): a worker,
 * and a round on a runtime the line never ran on, which has no run to take a model from. A refusal starts nothing.
 */
async function theModelOfTheOffice(sb, who, agent, runtime) {
  let given
  try {
    given = await theModelTheOfficeGives(api, { agent, runtime, workspace: sb.workspace, headers: theCallerNamed(sb.workspace, who) })
  } catch (why) {
    refuse(theModelRefusal(why), 2)
  }
  say(theModelLine(given), true)
  if (given.selection === undefined && !/^[A-Za-z0-9][A-Za-z0-9._:@/-]*$/.test(given.model)) {
    refuse(`The office names the model ${JSON.stringify(given.model)}, which a command line cannot carry: letters, digits and . _ : @ / - only. Give --model <model>. Nothing was started.`, 2)
  }
  return given
}

async function commandWorker() {
  const name = aWorkersWords('worker')
  const runtime = chosen.runtime ?? A_WORKERS_RUNTIME
  if (!Object.hasOwn(THE_PROGRAM_A_RUNTIME_RUNS, runtime)) refuse(theRuntimeTheMapDoesNotHoldWords('worker', runtime, Object.keys(THE_PROGRAM_A_RUNTIME_RUNS)), 2)
  if (![A_WORKERS_RUNTIME, 'codex', 'dsh', 'opencode'].includes(runtime)) refuse(theRuntimeWithNoCommandWords('worker', runtime), 2)
  if (chosen.image.length > 0 && runtime !== 'codex') refuse(`${anImageIsOnlyForCodex(runtime)} Nothing was started.`, 2)
  const imagesNotPlain = whyNotPlainPaths(chosen.image, '--image')
  if (imagesNotPlain !== null) refuse(`${imagesNotPlain}. Nothing was started.`, 2)
  const selectionGiven = chosen.selection === undefined ? undefined : theSelectionGiven(runtime, chosen.model)
  // THE WORK AREA THE BRIEF DECLARES, read before anything is asked, so a value that is not one starts nothing.
  const declared = theWorkAreaDeclaredFor(chosen.brief)
  if ('refused' in declared) refuse(`${declared.refused} Nothing was filed or started.`, 2)
  theAddressARunCommitsAt()
  // THE COMPACTION WINDOW, read before the run is filed, so a setting that cannot be used leaves no run behind.
  const claudeCodes = theClaudeCodeVariablesInASandbox()
  const who = whoIsAsking()
  const sb = await aSandboxToStartIn(name, who)
  const registered = await theAgentIsRegistered(chosen.agent, sb.workspace, who, runtime)
  theAreaTheDoorSetIsTheDeclaredOne(who, registered, declared.workArea)
  theSandboxHasTheRuntimeLogin(sb, runtime)
  await nothingOfItStillRuns(sb, who, chosen.agent)
  // THE MODEL, NAMED ON THE COMMAND LINE EITHER WAY. A --model the starter typed wins; without one the
  // office is asked (theModelOfTheOffice).
  const fromTheOffice = (chosen.model ?? selectionGiven?.model) === undefined ? await theModelOfTheOffice(sb, who, chosen.agent, runtime) : null
  let model = chosen.model ?? selectionGiven?.model ?? fromTheOffice.model
  const selection = fromTheOffice === null ? selectionGiven : fromTheOffice.selection
  const whence = chosen.model === undefined ? 'The office' : '--model'
  const commandEnvironment = theClaudeCodeEnvironment(sb, theSecretsFor(sb.instance,runtime,undefined,sb).lines, true)
  const startup = await theStartValues([THE_PROGRAM_A_RUNTIME_RUNS[runtime]], runtime, model, commandEnvironment.env, {agent:chosen.agent,workspace:sb.workspace,headers:theCallerNamed(sb.workspace,who),selection,envFrom:commandEnvironment.from})
  const native = startup.start?.native
  const codexModel = runtime === 'codex' ? native?.model ?? theNameCodexTakes(model, whence) : null
  if (runtime === A_WORKERS_RUNTIME && native === undefined) model = theNameClaudeTakes(model, whence)
  const given = theBriefWithTheStandingStages({ sandboxDir: sb.dir, brief: chosen.brief, standing: await theStandingStagesFor(chosen.agent, sb, who) }).brief
  // ITS OWN WORKTREE, which the helper makes from the instance's clone when it is not there yet.
  const worktree = theAgentsOwnWorktree(sb.dir, chosen.agent)
  const inside = theBriefInside(sb.dir, given)
  refreshMainBeforeRun(sb)
  const brief = theBriefWithTheStartingWords(sb, runtime, inside)
  const direct = runtime !== 'dsh' && theHelperTakesStdin(sb, runtime)
  const command = runtime === 'dsh' ? null : runtime === 'opencode' ? theOpenCodeCommand({ model, worktree }) : runtime === 'codex' ? theCodexCommand({ model: codexModel, images: chosen.image.map((image) => join(worktree, image)) }) : runtime === A_WORKERS_RUNTIME ? theClaudeCodeCommand({ model, brief, continues: false, direct }) : refuse(theRuntimeWithNoCommandWords('worker', runtime), 2)
  const briefBytes = statSync(brief).size
  const filed = await anAgentsRunFiledHere(sb, who, { agent: chosen.agent, runtime, model, worktree, clone: chosen.clone ?? null, cutFrom: chosen['cut-from'], cutNamed: chosen['cut-from'] !== undefined, title: chosen.title, flow: chosen.flow, brief, parent: chosen.parent, command, startup, leaving: true, role: registered?.roleReadAs ?? null, images: chosen.image })
  await theDeclaredAreaIsSetForTheRun(sb, who, filed, declared.workArea)
  const passed = [
    ...filed.words,
    ...(direct ? ['--stdin', brief] : []),
    ...(chosen.slot === undefined ? [] : ['--slot', chosen.slot]),
    ...(command === null ? [] : ['--', ...command]),
  ]
  const start = await startThroughTheHelper(sb, who, passed, null, filed, runtime, null, claudeCodes)
  printTheStart(start, briefBytes)
  sayWhatWasStarted('worker', start, { agent: chosen.agent, model, worktree, brief, briefBytes, continues: null })
  await writeTheUseLine('worker', sb, who, { agent: chosen.agent, run: start.run, continues: null })
}

/**
 * RUN BY MOLE OFFICE, THE LAUNCHER ONLY COMPARES THE AREA. The door that asked the start set the declared area then, in
 * the asker's name, and the office's own key never sets one. An area that is not the declared one stops the start before
 * anything is filed. Run by hand, the area is set once the run is filed (theDeclaredAreaIsSetForTheRun).
 */
function theAreaTheDoorSetIsTheDeclaredOne(who, registered, workArea) {
  if (workArea === null || who.agent !== THE_MESSAGE_WORKER_ID) return
  const has = Array.isArray(registered?.workArea) ? registered.workArea : []
  if (!theSameWorkArea(workArea, has)) {
    refuse(`The brief declares the work area ${workArea.join(', ')} for ${chosen.agent}, whose work area is ${has.length === 0 ? 'empty' : has.join(', ')}, so nothing was filed or started.`, 2)
  }
  say(`work area: ${chosen.agent}'s work area is ${workArea.join(', ')}, as the brief declares.`)
}

/**
 * RUN BY HAND, THE DECLARED AREA IS SET FOR THE FILED RUN, in the starter's name, before the helper starts it, and the
 * run's seal empties it again. A refusal stops the start with the office's words, and the filed run is marked as never
 * started.
 */
async function theDeclaredAreaIsSetForTheRun(sb, who, filed, workArea) {
  if (workArea === null || who.agent === THE_MESSAGE_WORKER_ID) return
  if (filed.id === null) {
    refuse(`The brief declares a work area for ${chosen.agent}, and this sandbox's helper files the run itself, so no area can be set for the run. Nothing was started.`, 2)
  }
  const set = await askTheOffice(api, `/api/participants/agent/${encodeURIComponent(chosen.agent)}/work-area`, {
    method: 'POST',
    workspace: sb.workspace,
    headers: { ...theCallerNamed(sb.workspace, who), 'content-type': 'application/json' },
    body: { workArea, because: `The brief ${chosen.brief} declares this work area for run ${filed.id}.`, forRun: filed.id },
  })
  if (set.status !== 200) {
    const why = `the office did not set the work area the brief declares (${theOfficeSaid(set)})`
    await theFiledRunNeverStarted(sb, who, filed, why)
    refuse(`Run ${filed.id} was filed and not started, because ${why}.`, 2)
  }
  say(`work area: ${chosen.agent}'s work area is now ${workArea.join(', ')}, set for run ${filed.id}, whose seal empties it again.`)
}

/** A round directory's real parent must stay inside this sandbox. */
function aRoundDirectoryParentIsSafe(sb, worktree) {
  if (!isAbsolute(worktree)) return false
  try {
    const root = realpathSync(join(sb.dir, 'worktrees'))
    const parent = realpathSync(dirname(worktree))
    return parent === root || parent.startsWith(root + sep)
  } catch { return false }
}

/** A new round directory must also be absent. */
function aNewRoundDirectoryIsSafe(sb, worktree) {
  if (!aRoundDirectoryParentIsSafe(sb, worktree)) return false
  try { lstatSync(worktree); return false } catch (error) { return error?.code === 'ENOENT' }
}

/**
 * THE COMMIT A FRESH REPAIR IS CUT FROM. --cut-from may give it in full, shortened, or as a branch, and git reads it in
 * the checkout the sandbox was made from, where the cut is then proved on main. The launcher says which commit it took
 * and goes on with that commit, which the run records as its cut. A value git cannot read there is refused in words.
 */
function theCommitARepairIsCutFrom(sb, given) {
  const from = sb.instance.from
  const read = typeof from === 'string' && isAbsolute(from) ? guardedGitRun(from, ['rev-parse', '--verify', '--end-of-options', `${given}^{commit}`], { timeout: 30_000 }) : null
  const commit = read?.status === 0 ? String(read.stdout).trim() : ''
  if (!/^[a-f0-9]{40}$/.test(commit)) {
    refuse(`--cut-from ${JSON.stringify(given)} is not a commit or branch git can read in ${String(from)}, the checkout this sandbox was made from. Give a commit, in full or shortened, or a branch of that checkout. Nothing was started.`, 2)
  }
  say(`--cut-from ${JSON.stringify(given)} is the commit ${commit} in ${from}, and the fresh repair is cut from that commit.`)
  return commit
}

async function commandRound() {
  const name = aWorkersWords('round')
  const runtime = chosen.runtime ?? A_WORKERS_RUNTIME
  if (!Object.hasOwn(THE_PROGRAM_A_RUNTIME_RUNS, runtime)) refuse(theRuntimeTheMapDoesNotHoldWords('round', runtime, Object.keys(THE_PROGRAM_A_RUNTIME_RUNS)), 2)
  if (![A_WORKERS_RUNTIME, 'codex', 'dsh', 'opencode'].includes(runtime)) refuse(theRuntimeWithNoCommandWords('round', runtime), 2)
  const fresh = chosen.worktree !== undefined || chosen['cut-from'] !== undefined
  const atTip = chosen.at !== undefined
  if (atTip && chosen.continues === undefined) usage('A round with --at needs --continues. Nothing was started.')
  if (fresh && (chosen.worktree === undefined || chosen['cut-from'] === undefined)) usage(atTip ? 'A round with --at needs both --worktree and --cut-from. Nothing was started.' : 'A fresh round needs both --worktree and --cut-from.')
  if (atTip && !fresh) usage('A round with --at needs a new worktree and --cut-from. Nothing was started.')
  if (fresh && !isAbsolute(chosen.worktree)) usage('A fresh round needs an absolute new worktree.')
  if (chosen.clone !== undefined) usage('round does not take --clone: it works in the same worktree as the run before, in the clone that one was cut from.')
  const selectionGiven = chosen.selection === undefined ? undefined : theSelectionGiven(runtime, chosen.model)
  theAddressARunCommitsAt()
  // THE COMPACTION WINDOW, read before the run is filed, so a setting that cannot be used leaves no run behind.
  const claudeCodes = theClaudeCodeVariablesInASandbox()
  const who = whoIsAsking()
  const sb = await aSandboxToStartIn(name, who)
  const repairCut = fresh && !atTip ? theCommitARepairIsCutFrom(sb, chosen['cut-from']) : null
  if (fresh && !aNewRoundDirectoryIsSafe(sb, chosen.worktree)) {
    refuse(atTip ? `A fresh round needs a new directory under this sandbox's worktrees folder: ${chosen.worktree}. Nothing was started.` : 'A fresh repair needs a new directory under this sandbox’s worktrees folder. Nothing was started.')
  }
  if (atTip && !/^[a-f0-9]{40}$/.test(chosen.at)) usage(`The round's tip ${chosen.at} must be a full commit hash. Nothing was started.`)
  const registered = await theAgentIsRegistered(chosen.agent, sb.workspace, who, runtime)
  if (!atTip) theSandboxHasTheRuntimeLogin(sb, runtime)
  await nothingOfItStillRuns(sb, who, chosen.agent)

  // THE RUN IT CONTINUES, from the host's own list, or the run --continues names (theRunARoundContinues). Its record
  // gives the worktree, the cut and the model, and its own output in this sandbox the conversation and the run link.
  // A RUN THE LIST DOES NOT HOLD, as the first run of a line started from inside the sandbox, goes through the same
  // checks of its record as a run on the list: the agent, the runtime, this sandbox's folder and its container row.
  const last = await theRunARoundContinues(sb, who, chosen.agent, runtime, chosen.continues)
  // The runtime of a run --continues names is not refused when its record names one: a new conversation follows it.
  const aRunIsNamed = chosen.continues !== undefined
  if (last !== null) await theRoundsRunWasFiledHere(sb, who, chosen.agent, aRunIsNamed && typeof last.data.runtime === 'string' ? null : runtime, last.run, last.data, last.entry)
  let recordedCutForRound
  if (atTip) {
    const cut = chosen['cut-from']
    if (cut.startsWith('-')) refuse(`The round's cutFrom is ${cut}. ${A_CUT_FROM_MAY_NOT_START_WITH_A_DASH} Nothing was started.`)
    if (last === null) refuse('There is no previous run. Nothing was started.')
    if (typeof last.data.cutFrom !== 'string' || last.data.cutFrom.trim() === '') refuse('The previous run names no cutFrom. Nothing was started.')
    if (last.data.cutFrom !== cut) refuse(`The round's cutFrom ${cut} differs from the previous run's ${last.data.cutFrom}. Nothing was started.`)
    const base = theRecordedBaseOfRun(last.data)
    if ('fails' in base) refuse(`${base.fails} Nothing was started.`)
    const repo = join(sb.dir, 'repo')
    const git = gitInside(sb)
    const tip = git(['-C', repo, 'rev-parse', '--verify', '--quiet', '--end-of-options', `${chosen.at}^{commit}`])
    if (tip.status !== 0 || tip.stdout.trim() !== chosen.at) refuse(`The round's tip ${chosen.at} is not a commit in this sandbox's repository. Nothing was started.`)
    const resolved = base.base === null ? null : git(['-C', repo, 'rev-parse', '--verify', '--quiet', '--end-of-options', `${base.base}^{commit}`])
    const baseCommit = resolved?.status === 0 && /^[a-f0-9]{40}$/.test(resolved.stdout.trim()) ? resolved.stdout.trim() : null
    if (baseCommit === null) refuse(base.recorded
      ? `The commit ${base.base} recorded for the round's cutFrom ${cut} is not in this sandbox's repository. Nothing was started.`
      : `The round's cutFrom ${cut} names no commit in this sandbox's repository. Nothing was started.`)
    const ancestor = git(['-C', repo, 'merge-base', '--is-ancestor', '--end-of-options', baseCommit, chosen.at])
    if (ancestor.status !== 0) refuse(`The round's cutFrom ${cut} is not an ancestor of its tip. Nothing was started.`)
    recordedCutForRound = { named: cut, commit: baseCommit }
    say(base.recorded ? 'The round keeps the commit recorded for the previous cut.' : last.data.cutFromCommit === undefined
      ? 'The previous cut has no recorded commit, so the round records the commit its name resolves to.'
      : 'The recorded commit was for an older cut name, so the round records the commit its current name resolves to.')
    const sealId = last.data.sealedTip
    const answer = typeof sealId === 'string' ? await askTheOffice(api, `/api/records/${encodeURIComponent(sealId)}`, { workspace: sb.workspace, headers: theCallerNamed(sb.workspace, who) }) : null
    const stored = answer?.status === 200 ? (answer.body?.record ?? answer.body) : null
    const seal = stored?.kind === 'sealed_tip' ? stored.data?.seal : null
    if (seal?.run !== last.run || seal?.git?.commit !== chosen.at) refuse(`The round's tip ${chosen.at} does not match the previous run's git seal. Nothing was started.`)
    theSandboxHasTheRuntimeLogin(sb, runtime)
  }
  // A NEW CONVERSATION, when the agent has no start on this runtime, or the run it would continue ran on another runtime
  // (only a run --continues names can), or works in a worktree that is gone or holds no rules file
  // (whyARoundStartsANewConversation). It works in that run's worktree when a round can work there, and otherwise in the
  // worktree of the agent's newest run that has one, on any runtime (theRunANewConversationTakes), and takes that run's
  // cut and title. It has no thread or session to resume.
  // ITS RUN LINK goes to the run --continues names, which it follows: the next-round door names that run, and the
  // office refuses a round's run the door started that is not derived from it (theNextRoundThisRunStarts in
  // src/server/lib/next-round.ts). Without --continues it is linked to no run. Its usage receipt is its own: the
  // receipt subtracts the run it is linked to only when its command resumes a conversation (tools/sandbox-start.mjs).
  // A FRESH ROUND WORKS IN ITS OWN NEW WORKTREE (9 November 2026), so it takes the run it follows for its
  // title and model even when that run's worktree is gone, and asks no other run for one: 13n's next round was refused with
  // "nowhere to work" when a cleanup had taken the worktree of the run it followed, though the door gave it a new worktree.
  const why = whyARoundStartsANewConversation(sb, chosen.agent, runtime, last, aRunIsNamed)
  const taken = atTip || why === null || (last !== null && (fresh || aRoundCanWorkInTheWorktreeOf(last.data))) ? last : await theRunANewConversationTakes(sb, who, chosen.agent, runtime, why, last?.run ?? null)
  // A ROUND THAT WOULD WORK IN THE SHARED CHECKOUT is refused as soon as the run it takes is known, before anything is
  // filed or its chapters are written (whyARunMayNotWorkIn in tools/sandbox-common.mjs says why). A fresh round works in
  // its own new worktree, so it is not asked.
  if (!fresh && typeof taken.data.workingDirectory === 'string' && taken.data.workingDirectory !== '') {
    const shared = whyARunMayNotWorkIn(sb.dir, taken.data.workingDirectory, { run: taken.run })
    if (shared !== null) refuse(shared, 2)
  }
  if (taken !== last) await theRoundsRunWasFiledHere(sb, who, chosen.agent, null, taken.run, taken.data, taken.entry)
  const { run: before, data, title: itsTitle } = taken
  // ITS CHAPTERS come from the worktree of the run it takes, as before; a fresh round whose run's worktree a round cannot work
  // in reads them from the sandbox's own repository, which its new worktree is cut from.
  const chaptersFrom = fresh && whyARoundCannotWorkIn(typeof data.workingDirectory === 'string' ? data.workingDirectory : '') !== null ? join(sb.dir, 'repo') : data.workingDirectory
  if (chaptersFrom !== data.workingDirectory && whyARoundCannotWorkIn(chaptersFrom) !== null) {
    refuse(`A fresh round of ${chosen.agent} has no chapters to read: run ${before}, which it follows, ${whyARoundCannotWorkIn(typeof data.workingDirectory === 'string' ? data.workingDirectory : '')}, and this sandbox's repository ${chaptersFrom} holds no ${A_ROUNDS_RULES}. Nothing was started.`)
  }
  if (why !== null) {
    const where = fresh ? `${chosen.worktree}, a new worktree` : `${data.workingDirectory}, the worktree of run ${before}`
    say(`this round starts a new conversation on runtime ${runtime}, because ${why}; it works in ${where}, and reads its chapters from ${join(chaptersFrom, A_ROUNDS_RULES)}.`)
  }
  const aNewConversation = fresh || why !== null
  // A FRESH REPAIR CONTINUES NOTHING (round 54's refusal, item 2): it is a new conversation, so it is linked only to
  // the run --continues names, which it follows, as any new conversation is.
  const continues = aNewConversation ? null : before
  const follows = chosen.continues ?? continues
  // THE ROUND'S TITLE, when it is given none, is the title of the run it continues, from the record read above. A run's
  // title becomes the title of its commits, which may name no agent and no record id, so none is made of those.
  if (chosen.title === undefined && (typeof itsTitle !== 'string' || itsTitle.trim() === '')) refuse(aRunWithNoTitleARoundCanTakeWords(before, chosen.agent), 2)
  const title = chosen.title ?? itsTitle
  if (chosen.title === undefined) say(`the round takes the title of run ${before}: ${JSON.stringify(title)}.`)
  for (const field of fresh ? [] : ['workingDirectory', 'cutFrom']) {
    if (typeof data[field] !== 'string' || data[field] === '') refuse(`Run ${before} of ${chosen.agent} says no ${field}, so the round cannot work where it did. Nothing was started.`)
  }
  // THE MODEL: a --model or a selection, or the model of the run it would have continued, when that ran on this runtime,
  // which a new conversation in another run's worktree keeps. With no run on this runtime, the office is asked, as for a
  // worker.
  const onIt = last !== null && last.data.runtime === runtime ? last : null
  const fromTheOffice = (chosen.model ?? selectionGiven?.model) === undefined && onIt === null ? await theModelOfTheOffice(sb, who, chosen.agent, runtime) : null
  const named = chosen.model ?? selectionGiven?.model ?? fromTheOffice?.model ?? onIt.data.model
  if (fromTheOffice === null && onIt !== null && (typeof named !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:@/-]*$/.test(named))) {
    refuse(`Run ${onIt.run} of ${chosen.agent} names no model a command line can carry (${JSON.stringify(onIt.data.model ?? null)}). Give --model <model>. Nothing was started.`, 2)
  }
  const whence = chosen.model !== undefined ? '--model' : fromTheOffice !== null ? 'The office' : onIt === null ? '--selection' : `Run ${onIt.run} of ${chosen.agent}`
  const commandEnvironment = theClaudeCodeEnvironment(sb,theSecretsFor(sb.instance,runtime,undefined,sb).lines,true)
  const startup = await theStartValues([THE_PROGRAM_A_RUNTIME_RUNS[runtime]],runtime,named,commandEnvironment.env,{agent:chosen.agent,workspace:sb.workspace,headers:theCallerNamed(sb.workspace,who),selection:fromTheOffice === null ? selectionGiven : fromTheOffice.selection,envFrom:commandEnvironment.from})
  const native = startup.start?.native
  const model = runtime === A_WORKERS_RUNTIME && native === undefined ? theNameClaudeTakes(named, whence) : named
  const codexModel = runtime === 'codex' ? native?.model ?? theNameCodexTakes(named, whence) : null
  const askThisRoundsOffice = (path) => askTheOfficeWhileItRestarts(api, path, { workspace: sb.workspace, headers: theCallerNamed(sb.workspace, who) }, { saying: say })
  const backlog = await readTheRoundsBacklog({ brief: chosen.brief, request: askThisRoundsOffice })
  const delegations = await readTheRoundsDelegations({ brief: chosen.brief, request: askThisRoundsOffice })
  const standing = await theStandingStagesFor(chosen.agent, sb, who, { saying: false })
  const delivery = prepareRoundChapters({ sandboxDir: sb.dir, worktree: chaptersFrom, brief: chosen.brief, territory: data.territory, backlog, standing, delegations })
  theAreaTheDoorSetIsTheDeclaredOne(who, registered, delivery.workArea)
  say(roundChaptersList(delivery.manifest))
  const thread = runtime === 'codex' && !aNewConversation ? theCodexThreadOf(sb, before) : null
  const openCodeSession = runtime === 'opencode' && !aNewConversation ? theOpenCodeSessionOf(sb, before, chosen.agent) : null
  if (typeof openCodeSession?.says === 'string') {
    say(openCodeSession.says)
    sb.startSaysFirst = openCodeSession.says
  }
  // The replayed main can be ahead of and not an ancestor of the released tip.
  if (!atTip) refreshMainBeforeRun(sb, repairCut)
  const brief = theBriefWithTheStartingWords(sb, runtime, delivery.brief)
  const worktree = fresh ? chosen.worktree : data.workingDirectory
  const cutFrom = fresh ? repairCut ?? chosen['cut-from'] : data.cutFrom
  if (fresh && !atTip) {
    const source = guardedGitRun(sb.instance.from, ['rev-parse', '--verify', 'refs/heads/main^{commit}'], { timeout: 30_000 })
    const sourceProof = source.status === 0 ? guardedGitRun(sb.instance.from, ['merge-base', '--is-ancestor', cutFrom, source.stdout.trim()], { timeout: 30_000 }) : source
    const proof = sb.repairRef === undefined ? null : gitInside(sb)(['-C', join(sb.dir, 'repo'), 'rev-parse', '--verify', `${sb.repairRef}^{commit}`])
    if (sourceProof.status !== 0 || proof?.status !== 0 || proof.stdout.trim() !== cutFrom) refuse('The fresh repair cut cannot be proved on current main in the source and sandbox. Nothing was started.')
  }
  const givesTheDatabase = openCodeSession !== null && theHelperTakesTheOpenCodeDatabase(sb, before, openCodeSession.database)
  const direct = runtime !== 'dsh' && theHelperTakesStdin(sb, runtime)
  const command = runtime === 'dsh' ? null : runtime === 'opencode' ? theOpenCodeCommand({ model, worktree, session: openCodeSession?.session ?? null }) : runtime === 'codex' ? theCodexCommand({ model: codexModel, thread }) : runtime === A_WORKERS_RUNTIME ? theClaudeCodeCommand({ model, brief, continues: !aNewConversation, direct }) : refuse(theRuntimeWithNoCommandWords('round', runtime), 2)
  const briefBytes = statSync(brief).size
  const filed = await anAgentsRunFiledHere(sb, who, {
    agent: chosen.agent,
    runtime,
    model,
    worktree,
    cutFrom,
    cutNamed: fresh,
    fresh,
    ...(atTip ? { startAt: chosen.at, recordedCut: recordedCutForRound } : {}),
    title,
    brief,
    continues: follows,
    flow: chosen.flow,
    command,
    startup,
  })
  if (fresh && filed.id === null) refuse('The sandbox helper cannot file a fresh repair on the host. Nothing was started.')
  await theDeclaredAreaIsSetForTheRun(sb, who, filed, delivery.workArea)
  // SAVED AS THE ROUND'S OWN RUN when the office gave it a key, as theFiledRunNeverStarted writes it: the territory door
  // takes the run's own key, and the office's key, which the message worker starts a round with, it refuses.
  const asTheRound = typeof filed.key === 'string'
    ? officeHeaders({ workspace: sb.workspace, agent: filed.agent, session: filed.id, key: filed.key })
    : { ...theCallerNamed(sb.workspace, who), 'content-type': 'application/json' }
  const legacyNotice = await saveRoundChapters({ id: filed.id, manifest: delivery.manifest,
    request: (method, path, body) => askTheOffice(api, path, { method, headers: asTheRound, ...(body === undefined ? {} : { body }) }),
  })
  if (legacyNotice !== null) say(legacyNotice)
  const passed = [
    ...filed.words,
    ...(direct ? ['--stdin', brief] : []),
    ...(chosen.slot === undefined ? [] : ['--slot', chosen.slot]),
    ...(givesTheDatabase ? ['--opencode-database', openCodeSession.database] : []),
    ...(command === null ? [] : ['--', ...command]),
  ]
  const start = await startThroughTheHelper(sb, who, passed, null, filed, runtime, null, claudeCodes)
  printTheStart(start, briefBytes)
  sayWhatWasStarted('round', start, { agent: chosen.agent, model, worktree, brief, briefBytes, continues, follows, packages: filed.packages })
  await writeTheUseLine('round', sb, who, { agent: chosen.agent, run: start.run, continues, follows })
}

// ============================================================================ status

/**
 * WHAT A ROW ID THAT IS NOT AMONG THE OPEN ROWS MEANS, in the launcher's own words (acceptance
 * finding 67). The ledger is read open-rows-only, so a row that is missing is either closed or was
 * never written, and the launcher can no longer tell those apart. The history is the slow read
 * (`?includeReleased=true`) that this tool must not make.
 */
function notOpenInTheLedger(workspace) {
  return `not open in the ledger of ${workspace}: closed, or never written. The launcher reads only the open rows; the history is GET /api/resources?includeReleased=true, which holds the office for 20 seconds or more (acceptance finding 67).`
}

async function commandStatus() {
  const who = whoIsAskingIfSaid()
  const names = chosen.targets.length > 0
    ? chosen.targets
    : existsSync(sandboxes)
      ? readdirSync(sandboxes, { withFileTypes: true }).filter((e) => e.isDirectory() && !e.name.startsWith('.')).map((e) => e.name)
      : []
  const reports = []
  let aFactWasRefused = false
  const ledgers = new Map()
  for (const name of names) {
    const dir = instanceFolder(name)
    const { facts: instance, refused } = await theFactsTheHostReads(name, who)
    if (refused !== null) {
      aFactWasRefused = true
      reports.push({ instance: name, folder: dir, says: refused })
      continue
    }
    if (instance === null) {
      reports.push({ instance: name, folder: dir, says: `${dir} is not a sandbox: it holds no instance.json.` })
      continue
    }
    const workspace = chosen.workspace ?? instance.workspace
    if (!ledgers.has(workspace)) ledgers.set(workspace, await theLedger(workspace, who))
    const ledger = ledgers.get(workspace)
    const byId = new Map((ledger.rows ?? []).map((r) => [r.id, r]))
    const docker = inspectContainer(instance.container.name)
    const row = instance.containerRow === null ? null : byId.get(instance.containerRow) ?? null
    const rowSays = (r) =>
      ledger.rows === null
        ? `the ledger could not be read (${ledger.why})`
        : r === null
          ? notOpenInTheLedger(workspace)
          : `open, ${r.liveness?.state === 'unknown' ? 'cannot be checked' : r.liveness?.state ?? 'liveness not said'}, owned by session ${r.sessionRecordId}`
    const processes = theStarts(dir).map((s) => {
      const r = byId.get(s.processRow) ?? null
      return {
        label: s.label,
        run: s.run ?? null,
        processRow: s.processRow ?? null,
        hostPid: s.hostPid ?? null,
        hostPgid: s.hostPgid ?? null,
        cwd: s.cwd ?? null,
        command: s.command ?? null,
        ledger: rowSays(r),
        // A LEDGER THAT COULD NOT BE READ SAYS NOTHING ABOUT A ROW: null, with the ledger field saying why, and never
        // 'not open', which would be a claim about the ledger from a read that never happened (USER.md invariant 5;
        // the inspector's refusal of this change).
        liveness: ledger.rows === null ? null : r === null ? 'not open' : (r.liveness?.state ?? null),
      }
    })
    // WHAT IS IN THE CONTAINER THAT NO LIVE ROW NAMES BY ITS GROUP, read from the machine (docker top
    // gives host pids), because a process that escaped its group would be on no list otherwise.
    // A LEDGER THAT COULD NOT BE READ NAMES NO GROUP, so nothing inside is compared with it: every process would
    // otherwise look escaped, a claim from a read that never happened (acceptance finding 70). Why nothing was
    // compared is said beside the empty answer.
    let unnamed = null
    let notComparedBecause = null
    if (!docker?.State?.Running) notComparedBecause = 'the container is not running'
    else if (ledger.rows === null) notComparedBecause = `the ledger could not be read (${ledger.why})`
    else {
      const top = run('docker', ['top', instance.container.name, '-o', 'pid,pgid,args'])
      if (top.status !== 0) notComparedBecause = `docker top failed (exit ${String(top.status)})`
      else {
        const groups = new Set(ledger.rows.filter((r) => r.type === 'process' && r.releasedAt === null).map((r) => r.pgid))
        const listed = top.stdout
          .trim()
          .split('\n')
          .slice(1)
          .map((line) => /^\s*(\d+)\s+(\d+)\s+(.*)$/.exec(line))
          .filter((m) => m !== null)
          .map((m) => ({ pid: Number(m[1]), pgid: Number(m[2]), command: m[3] }))
        // THE CONTAINER'S OWN, named from docker's record of it rather than guessed: its first
        // process, and the command the container was started with, which keeps it running, with that
        // command's group. The first process is docker's init only when docker was asked for one
        // (HostConfig.Init). Without it, as in mole-office-dev, the first process is the command
        // itself: the image's keep-alive, which the CLI's shell became by exec.
        const flat = (text) => String(text).replace(/\s+/g, ' ').trim()
        const itsCommand = flat([docker.Path, ...(docker.Args ?? [])].join(' '))
        const firstPid = docker.State?.Pid ?? null
        const first = docker.HostConfig?.Init === true ? "the container's first process (docker's init)" : "the container's first process, the command it was started with, which keeps it running"
        const keeper = listed.find((p) => docker.Path !== undefined && flat(p.command) === itsCommand)
        unnamed = listed
          .filter((p) => !groups.has(p.pgid))
          .map((p) => ({
            ...p,
            what:
              p.pid === firstPid
                ? first
                : keeper !== undefined && p.pgid === keeper.pgid
                  ? 'the command the container was started with, which keeps it running'
                  : null,
          }))
      }
    }
    reports.push({
      instance: name,
      template: instance.template,
      folder: dir,
      from: instance.from,
      ref: instance.ref,
      readOnly: instance.readOnly ?? [],
      container: {
        name: instance.container.name,
        id: docker?.Id ?? instance.container.id,
        docker: docker === null ? 'no such container' : docker.State?.Status ?? 'unknown',
      },
      containerRow: { id: instance.containerRow, ledger: rowSays(row) },
      processes,
      // THE PROCESSES ARE THE RUNS' OWN WORDS: logs/ is mounted writable into the sandbox. A round chooses from the
      // host's list instead (theHostsList).
      processesFrom: `the start.json files under ${join(dir, 'logs')}: each is the run's own words, which a program in the sandbox can write. ` +
        "The ledger and liveness beside each are the office's own reading.",
      notInTheLedger: unnamed,
      notComparedBecause,
    })
  }
  if (chosen.json) {
    process.stdout.write(`${JSON.stringify({ sandboxes, reports })}\n`)
    if (aFactWasRefused) process.exitCode = 1
    return
  }
  if (reports.length === 0) process.stdout.write(`No sandboxes in ${sandboxes}.\n`)
  for (const r of reports) {
    if (r.says) {
      process.stdout.write(`${r.instance}: ${r.says}\n`)
      continue
    }
    process.stdout.write(`${r.instance} (template ${r.template}, on ${r.ref}) — ${r.folder}\n`)
    process.stdout.write(`  container ${r.container.name} ${String(r.container.id ?? '').slice(0, 12)}: ${r.container.docker}\n`)
    process.stdout.write(`  ledger row ${r.containerRow.id}: ${r.containerRow.ledger}\n`)
    if (r.readOnly.length > 0) process.stdout.write(`  read-only: ${r.readOnly.join(', ')}\n`)
    if (r.processes.length === 0) process.stdout.write('  no process was started through sandbox-start\n')
    else process.stdout.write(`  processes, from ${r.processesFrom}\n`)
    for (const p of r.processes) {
      process.stdout.write(`  ${p.label}: row ${p.processRow} ${p.ledger}; host pid ${p.hostPid} group ${p.hostPgid}; cwd ${p.cwd}\n`)
    }
    if (r.notInTheLedger === null) process.stdout.write(`  what else runs inside was not compared with the ledger: ${r.notComparedBecause}\n`)
    else {
      const own = r.notInTheLedger.filter((p) => p.what !== null)
      const stray = r.notInTheLedger.filter((p) => p.what === null)
      if (own.length > 0) process.stdout.write(`  the container's own: ${own.length} ${own.length === 1 ? 'process' : 'processes'} (${[...new Set(own.map((p) => p.what))].join('; ')})\n`)
      if (stray.length === 0) process.stdout.write('  nothing else runs inside that no live ledger row names\n')
      for (const p of stray) process.stdout.write(`  NO LIVE ROW NAMES group ${p.pgid}: pid ${p.pid} ${p.command}\n`)
    }
  }
  // A REFUSAL IS NOT A SUCCESS: the exit code says so, so a script that reads only the code still stops.
  if (aFactWasRefused) process.exitCode = 1
}

// ============================================================================ down

async function commandDown({ print = true } = {}) {
  const [name, extra] = chosen.targets
  if (name === undefined || extra !== undefined) usage('Say which sandbox, once: node tools/sandbox.mjs down <instance>.')
  const who = whoIsAsking()
  const dir = instanceFolder(name)
  const instance = await theFactsOrRefuse(name, who, `There is no sandbox called ${name} in ${sandboxes}. Nothing was done.`)
  const workspace = chosen.workspace ?? instance.workspace
  const ledger = await theLedgerWhenItAnswers(workspace, who)
  if (ledger.rows === null) refuse(`The ledger could not be read (${ledger.why}), so the sandbox was not stopped: it is stopped only through the ledger.`)
  const byId = new Map(ledger.rows.map((r) => [r.id, r]))
  const row = instance.containerRow === null ? null : byId.get(instance.containerRow) ?? null
  const said = []

  // 1. STOP IT THROUGH THE LEDGER. Force is sent for the session that registered it, which is
  // stopping its own sandbox, or when the caller said --force.
  if (row !== null && row.releasedAt === null) {
    const force = chosen.force === true || row.sessionRecordId === who.session
    const until = Date.now() + THE_LONGEST_WAIT_FOR_THE_LEDGER_MS
    let released
    let after = null
    let goneFromTheOpenRows = false
    for (;;) {
      released = await releaseThroughTheLedger(row.id, {
        force,
        note: `node tools/sandbox.mjs down ${name}, by ${who.agent} in session ${who.session}${chosen.force ? ' (--force)' : ''}`,
        workspace,
        who,
      })
      // A lost answer may mean the release worked. Read before retrying, within the first try's deadline.
      // A refusal is an answer and is never sent again.
      if (released.status !== null) break
      after = await theLedgerWhenItAnswers(workspace, who, until)
      goneFromTheOpenRows = after.rows !== null && !after.rows.some((r) => r.id === row.id)
      if (goneFromTheOpenRows || after.rows === null || Date.now() + BETWEEN_LEDGER_TRIES_MS > until) break
      say(`the ledger did not answer (${released.why}); asking again in ${String(BETWEEN_LEDGER_TRIES_MS / 1000)} seconds`)
      await new Promise((go) => setTimeout(go, BETWEEN_LEDGER_TRIES_MS))
    }
    const lost = released.status === null
    if (released.status !== 200 && !goneFromTheOpenRows) {
      refuse(
        `The ledger did not stop the sandbox, so nothing was stopped (${theOfficeSaid(released)}${lost ? `; read again, the ledger ${after?.rows === null ? `could not be read (${after.why})` : 'still holds the row open'}` : ''}).` +
          (released.status === 409 && !force ? ` It is another session's; add --force to stop it anyway, which the change log records.` : ''),
      )
    }
    said.push(
      released.status === 200
        ? `the ledger released row ${row.id}: ${released.body?.outcome ?? released.body?.description ?? 'released'}`
        : `the ledger released row ${row.id}, though its answer was lost (${theOfficeSaid(released)})`,
    )
  } else {
    // A ROW THAT IS NOT AMONG THE OPEN ROWS IS NOT OPEN, which is not the same as not there: the launcher reads only the
    // open rows (acceptance finding 67), so it cannot tell a closed row from one never written, and says both. The open
    // rows hold no released row, so no sentence here says when a row was released.
    said.push(`row ${instance.containerRow} is ${notOpenInTheLedger(workspace)}`)
  }

  // 2. REMOVE THE STOPPED CONTAINER, by its exact id. A container still running is not touched.
  const docker = inspectContainer(instance.container.name)
  if (docker === null) said.push(`no container ${instance.container.name} is there`)
  else if (docker.State?.Running) {
    refuse(`${said.join('; ')}; but docker still says ${instance.container.name} is running, so it was not removed. Nothing else was done.`)
  } else said.push(`container ${instance.container.name}: ${removeStoppedContainer(docker.Id, name)}`)

  // 3. CLOSE THE ROWS OF PROCESSES THAT WERE INSIDE and are gone now. The door closes a row whose
  // process is gone without signalling anything, whoever asks, and says so in the change log.
  const closed = []
  for (const start of theStarts(dir)) {
    const r = byId.get(start.processRow)
    if (r === undefined || r.releasedAt !== null) continue
    const reply = await askTheOffice(api, `/api/resources/${encodeURIComponent(r.id)}/release`, {
      method: 'POST',
      headers: officeHeaders({ workspace, agent: who.agent, session: who.session }),
      body: { note: `sandbox ${name} was stopped by node tools/sandbox.mjs down` },
    })
    closed.push(reply.status === 200 ? `${r.id} closed` : `${r.id} NOT closed (${theOfficeSaid(reply)})`)
  }
  if (closed.length > 0) said.push(`process rows: ${closed.join(', ')}`)

  const answer = { instance: name, stopped: said, kept: dir }
  if (!print) return answer
  if (chosen.json) process.stdout.write(`${JSON.stringify(answer)}\n`)
  else process.stdout.write(`${said.join('\n')}\nkept ${dir} — its repo, worktrees, out and logs stay; deleting them is the secretary's decision.\n`)
}

// ============================================================================ hand-over

/**
 * GIVE THE SANDBOX'S CONTAINER ROW TO ANOTHER RUN THAT IS STILL RUNNING, AND LEAVE THE CONTAINER AS IT IS.
 *
 * The inspector's sandbox is shared by checks, and the last to leave stops it, but its container row was held by the
 * check that happened to start it. When that check left first, its run still held the row, and the office said the run
 * had left a container open while other checks were using it. The leaving check now hands the row to one still using it.
 *
 * ONLY THE SESSION HOLDING THE OPEN ROW HANDS IT OVER, and only to another session record of this project that is still
 * running and is written down as using the sandbox: a row handed to a run that has ended would be named as left open at
 * once, and one handed to a run not using the container would be held by a run that never stops it. A check of the
 * inspector writes itself down in the sandbox's checks folder (theChecksMarker), naming its process; a marker whose
 * process has ended does not count.
 *
 * THE NEW ROW FIRST. It is registered under the run named, the facts then name it, and only then is the old row closed,
 * with nothing signalled, which only the session that registered it may ask: a release that signals would stop the
 * container the other run is using. So the container is never without a row, and a refusal part way says which row
 * holds it.
 */
async function commandHandOver() {
  const [name, extra] = chosen.targets
  if (name === undefined || extra !== undefined) usage('Say which sandbox, once: node tools/sandbox.mjs hand-over <instance> --to-session <run>.')
  const to = chosen['to-session']
  if (typeof to !== 'string' || to.trim() === '') usage('hand-over needs --to-session <run>: the running session the row goes to.')
  const who = whoIsAsking()
  const dir = instanceFolder(name)
  const instance = await theFactsOrRefuse(name, who, `There is no sandbox called ${name} in ${sandboxes}. Nothing was handed over.`)
  const workspace = chosen.workspace ?? instance.workspace
  if (to === who.session) refuse(`The container row of ${name} is session ${who.session}'s already, so there is nothing to hand over.`)
  const ledger = await theLedgerWhenItAnswers(workspace, who)
  if (ledger.rows === null) refuse(`The ledger could not be read (${ledger.why}), so nothing was handed over.`)
  const row = ledger.rows.find((r) => r.id === instance.containerRow) ?? null
  if (row === null) refuse(`The container row ${instance.containerRow} of ${name} is ${notOpenInTheLedger(workspace)}, so there is nothing to hand over.`)
  if (row.sessionRecordId !== who.session) {
    refuse(`The container row ${row.id} of ${name} is held by session ${row.sessionRecordId}, not by ${who.session}, so it is not this session's to hand over. Nothing was handed over.`)
  }
  const target = await askTheOffice(api, `/api/records/${encodeURIComponent(to)}`, { workspace, headers: theCallerNamed(workspace, who) })
  if (target.status !== 200 || target.body?.record?.kind !== 'session') {
    refuse(`${to} is not a session record of ${workspace} (${theOfficeSaid(target)}), so the container row of ${name} was not handed to it.`)
  }
  const state = target.body.record.data?.state
  if (state !== 'running') {
    refuse(`The session ${to} is ${typeof state === 'string' ? state : 'in no state'}, not running, so a row handed to it would be left open by a run that has ended. Nothing was handed over.`)
  }
  const marker = (() => {
    try {
      return JSON.parse(readFileSync(theChecksMarker(sandboxes, name, to), 'utf8'))
    } catch {
      return null
    }
  })()
  if (!stillThere(marker)) {
    refuse(`The session ${to} is not written down as using the sandbox ${name}: its checks folder holds no marker for it whose process is still running, so the row was not handed to it. Nothing was handed over.`)
  }

  const registered = await askTheOffice(api, '/api/resources', {
    method: 'POST',
    headers: officeHeaders({ workspace, agent: who.agent, session: who.session }),
    body: {
      type: 'container',
      key: instance.container.name,
      sessionRecordId: to,
      detail: `Sandbox ${name}, handed over from session ${who.session} (row ${row.id}) by node tools/sandbox.mjs hand-over; ` +
        `stop it with node tools/sandbox.mjs down ${name}, which releases this row.`,
    },
  })
  if (registered.status !== 201) {
    refuse(`The ledger did not take a container row of ${name} for session ${to} (${theOfficeSaid(registered)}), so the row ${row.id} stays with session ${who.session}. Nothing was changed.`)
  }
  const handed = registered.body.resource.id
  writeInstance(dir, { ...instance, containerRow: handed, containerRowHeldBy: { session: to, since: localStamp(new Date()), from: { session: who.session, row: row.id } } })
  const closed = await askTheOffice(api, `/api/resources/${encodeURIComponent(row.id)}/release`, {
    method: 'POST',
    headers: officeHeaders({ workspace, agent: who.agent, session: who.session }),
    body: { signalNothing: true, note: `handed over to session ${to} as row ${handed} by node tools/sandbox.mjs hand-over; the container ${instance.container.name} is still in use` },
  })
  if (closed.status !== 200) {
    refuse(`The row ${handed} holds the container of ${name} for session ${to}, and the sandbox's facts name it, but the old row ${row.id} could not be closed (${theOfficeSaid(closed)}). ` +
      `Close it from session ${who.session} with POST /api/resources/${row.id}/release {"signalNothing":true}.`)
  }
  const answer = { instance: name, handedOver: { from: { session: who.session, row: row.id }, to: { session: to, row: handed } } }
  if (chosen.json) process.stdout.write(`${JSON.stringify(answer)}\n`)
  else process.stdout.write(`the container row of ${name} is handed from session ${who.session} (row ${row.id}, now closed, nothing signalled) to session ${to} (row ${handed}); the container is left as it is.\n`)
}

// ============================================================================ clear

// The parts removed are theReCreatableMergeParts (tools/sandbox-common.mjs), which says what each is. No run reads another
// entry's pair tree: a pair is built in the current sandbox, and a borrowed green reads the other entry's metadata
// (measured 3 October 2026).

/** Count file bytes without following links into a shared checkout or another entry's evidence. */
function bytesIn(path) {
  let stat
  try { stat = lstatSync(path) } catch (err) { if (err.code === 'ENOENT') return 0; throw err }
  if (!stat.isDirectory()) return stat.size
  return readdirSync(path).reduce((sum, name) => sum + bytesIn(join(path, name)), 0)
}

async function commandClear() {
  const [name, extra] = chosen.targets
  if (name === undefined || extra !== undefined) usage('Say which sandbox, once: node tools/sandbox.mjs clear <instance> [--force] [--json].')
  const who = whoIsAsking()
  const dir = instanceFolder(name)
  const instance = await theFactsOrRefuse(name, who, `There is no sandbox called ${name} in ${sandboxes}. Nothing was removed.`)
  if (!instance.labels?.['mole-office.merge-entry']) refuse(`Sandbox ${name} has no mole-office.merge-entry label, so nothing was removed.`)
  if (existsSync(join(dir, 'worktrees')) && readdirSync(join(dir, 'worktrees')).length > 0) refuse(`Sandbox ${name} has a worktrees/ entry, so nothing was removed.`)
  const parts = theReCreatableMergeParts(dir)
  for (const part of parts) {
    const parent = dirname(join(dir, part))
    if (existsSync(parent) && realpathSync(parent) !== parent) refuse(`Sandbox ${name} has a linked parent of ${part}, so nothing was removed.`)
  }
  const workspace = chosen.workspace ?? instance.workspace
  let ledger = await theLedgerWhenItAnswers(workspace, who)
  if (ledger.rows === null) refuse(`The ledger could not be read (${ledger.why}), so nothing was removed.`)
  if (ledger.rows.some((row) => row.id === instance.containerRow || (row.type === 'container' && row.key === instance.container.name))) {
    await commandDown({ print: false })
    ledger = await theLedgerWhenItAnswers(workspace, who)
    if (ledger.rows === null) refuse(`The ledger could not be read (${ledger.why}), so nothing was removed.`)
  }
  const starts = new Set(theStarts(dir).map((start) => start.processRow))
  // The ledger records a container process's location in detail, in addition to the starts kept in logs/.
  const open = ledger.rows.find((row) => row.id === instance.containerRow || starts.has(row.id) ||
    (row.type === 'container' && [instance.container.name, instance.container.id].includes(row.key)) ||
    (row.type === 'process' && String(row.detail).includes(`inside container ${instance.container.name} (`)))
  if (open) refuse(`Sandbox ${name} still has open ledger row ${open.id}, so nothing was removed.`)
  const docker = inspectContainer(instance.container.name)
  if (docker?.State?.Running) refuse(`Docker still says sandbox ${name} is running, so nothing was removed.`)
  const alreadyCleared = typeof instance.clearedAt === 'string'
  // A FOLDER CLEARED BEFORE THE CLEAR KNEW A TREE still holds it (5 October 2026: 27 trees, 7.4 GB), so a second clear
  // removes what is still there and keeps the first clearing's time.
  const removed = parts.map((part) => ({ path: join(dir, part), bytes: bytesIn(join(dir, part)) }))
  for (const part of removed) rmSync(part.path, { recursive: true, force: true })
  const clearedAt = alreadyCleared ? instance.clearedAt : localStamp(new Date())
  if (!alreadyCleared) writeInstance(dir, { ...instance, clearedAt })
  const bytesFreed = removed.reduce((sum, part) => sum + part.bytes, 0)
  const answer = { instance: name, clearedAt, alreadyCleared, removed, bytesFreed }
  if (chosen.json) process.stdout.write(`${JSON.stringify(answer)}\n`)
  else process.stdout.write(`Sandbox ${name} ${alreadyCleared ? 'was already cleared' : 'was cleared'}; freed ${String(bytesFreed)} bytes.\n`)
}

// ============================================================================ sizes

/** One folder's own bounded measurement; an error is data, so the other folders are still measured. */
function measureFolder(folder) {
  const measured = run('du', ['-s', '-B1', '-x', folder], { timeout: sandboxFolderMeasurementMilliseconds() })
  const figure = /^([0-9]+)\s/.exec(measured.stdout)?.[1]
  const bytes = figure === undefined ? NaN : Number(figure)
  if (measured.status !== 0 || !Number.isSafeInteger(bytes)) {
    return { bytes: null, why: measured.error?.message ?? (measured.stderr.trim() || `du exited ${String(measured.status)} with no byte figure`) }
  }
  return { bytes, why: null }
}

async function commandSizes() {
  if (chosen.targets.length > 0 || chosen.command !== null) usage('sizes takes no instance or command: node tools/sandbox.mjs sizes [--tell] [--json].')
  const folders = existsSync(sandboxes) ? readdirSync(sandboxes, { withFileTypes: true })
    // A SANDBOX IS COUNTED BY EITHER COPY OF ITS FACTS: only whether it is one is read here, and a run that removes the copy
    // in its folder does not take the folder out of the sizes.
    .filter((entry) => entry.isDirectory() && INSTANCE_NAME.test(entry.name) &&
      [join(sandboxes, HOST_ONLY_FOLDER, entry.name, INSTANCE_FILE), join(sandboxes, entry.name, INSTANCE_FILE)].some((file) => existsSync(file))) : []
  const sizes = folders.map((entry) => ({ instance: entry.name, folder: join(sandboxes, entry.name), ...measureFolder(join(sandboxes, entry.name)) }))
    .sort((a, b) => (b.bytes ?? -1) - (a.bytes ?? -1) || a.instance.localeCompare(b.instance))
  if (chosen.json === true) process.stdout.write(`${JSON.stringify({ sandboxes, sizes })}\n`)
  else for (const size of sizes) process.stdout.write(`${size.folder}: ${size.bytes === null ? `could not be measured (${size.why})` : inGB(size.bytes)}\n`)
  if (chosen.tell !== true) return
  const who = whoIsAsking()
  const workspace = whichWorkspace(chosen.workspace)
  const file = join(sandboxes, '.sizes.json')
  let previous = {}
  if (existsSync(file)) {
    try {
      previous = JSON.parse(readFileSync(file, 'utf8'))
      if (previous === null || typeof previous !== 'object' || Array.isArray(previous) || Object.values(previous).some((value) => typeof value !== 'boolean')) throw new Error('expected folder names and booleans')
    } catch (why) { refuse(`the size warning state ${file} cannot be read (${why.message}). Nothing was sent.`) }
  }
  const next = { ...previous }
  // WHO IS TOLD IS A SETTING WITH NO DEFAULT. With no agent named, a crossing is said here and its
  // folder's state is left as it was, so the first run with an agent named tells. The run then fails once the state is saved,
  // so the host's timer shows that nobody was told.
  const watchers = sandboxDiskWatchers()
  let untold = 0
  for (const size of sizes) {
    if (size.bytes === null) continue // Unknown never rearms a warning.
    const over = size.bytes > SANDBOX_FOLDER_WARNING.bytes
    if (over && previous[size.instance] !== true) {
      if (watchers.length === 0) {
        process.stderr.write(`Nobody was told that ${size.folder} holds ${inGB(size.bytes)}, above the ${SANDBOX_FOLDER_WARNING.gb} GB warning: MOLE_OFFICE_SANDBOX_DISK_WATCHERS names no agent. Its warning state was left as it was, so a run with an agent named there tells.\n`)
        untold += 1
        continue
      }
      const largest = readdirSync(size.folder, { withFileTypes: true }).filter((entry) => entry.isDirectory())
        .map((entry) => ({ folder: join(size.folder, entry.name), ...measureFolder(join(size.folder, entry.name)) }))
        .sort((a, b) => (b.bytes ?? -1) - (a.bytes ?? -1))
      const top = largest.filter((entry) => entry.bytes !== null).slice(0, 5)
      const unknown = largest.filter((entry) => entry.bytes === null)
      const body = `Sandbox folder ${size.folder} holds ${inGB(size.bytes)}, above the ${SANDBOX_FOLDER_WARNING.gb} GB warning (the folder-size warning). This is a warning; nothing was deleted.\nIts five largest measured subfolders${top.length < 5 ? ` (${top.length} measured)` : ''}:\n${top.map((entry) => `${entry.folder}: ${inGB(entry.bytes)}`).join('\n')}${unknown.length === 0 ? '' : `\nCould not measure: ${unknown.map((entry) => `${entry.folder} (${entry.why})`).join('; ')}`}`
      const sent = await askTheOffice(api, '/api/records', {
        method: 'POST', headers: theCallerNamed(workspace, who),
        body: { kind: 'message', title: `Sandbox ${size.instance} has passed ${SANDBOX_FOLDER_WARNING.gb} GB`, data: { body, to: watchers.map((id) => ({ kind: 'agent', id })) } },
      })
      if (sent.status !== 201) {
        // The folders already told in this run stay told, so the next run warns again only about this one and those after it.
        if (existsSync(sandboxes)) writeJsonWhole(file, next)
        refuse(`the size warning for ${size.folder} could not be sent (${theOfficeSaid(sent)}). Its warning state was left unchanged; the next run tries again.`)
      }
      // A warning is counted once the office has taken it (gate sandbox-folder-size-warning).
      spoolAGateMet('sandbox-folder-size-warning', 'remind', size.instance)
    }
    next[size.instance] = over
  }
  if (existsSync(sandboxes)) writeJsonWhole(file, next)
  if (untold > 0) refuse(`Nobody was told of ${untold === 1 ? 'the folder' : `the ${untold} folders`} above the ${SANDBOX_FOLDER_WARNING.gb} GB warning, because MOLE_OFFICE_SANDBOX_DISK_WATCHERS names no agent, so this run fails.`)
}

// ============================================================================ the verb

if (chosen.verb === 'up') await commandUp()
else if (chosen.verb === 'exec') await commandExec()
else if (chosen.verb === 'worker') await commandWorker()
else if (chosen.verb === 'round') await commandRound()
else if (chosen.verb === 'status') await commandStatus()
else if (chosen.verb === 'down') await commandDown()
else if (chosen.verb === 'hand-over') await commandHandOver()
else if (chosen.verb === 'sizes') await commandSizes()
else if (chosen.verb === 'clear') await commandClear()
else usage(`I do not know the command "${chosen.verb}". The commands are up, exec, worker, round, status, down, hand-over, clear and sizes.`)
