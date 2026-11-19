#!/usr/bin/env node
// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { readLauncherSelection, theNativeSelectionRefusal, theRefusalOfAnEffortNotTheRows, LEGACY_SELECTION_NOTICE } from '../src/config/launcher-selection.mjs'
import { A_RUN_GIVEN_NO_TITLE, recheckLauncherSelection } from './sandbox-common.mjs'
/**
 * START ONE PROCESS INSIDE A SANDBOX, REGISTERED BEFORE IT RUNS. Runs inside the container.
 *
 * Every process that enters a sandbox comes through here: a supervisor that `node tools/sandbox.mjs
 * exec` starts from the host, and each worker that supervisor then starts from inside. It does seven
 * things, in this order, and the command runs only after the first five have worked:
 *
 *   1. It FILES THE RUN, or updates one already filed. An agent's run is filed through
 *      tools/register-a-run.mjs (the one place a run record is written) with the run's `sandbox`
 *      field, so the check can be asked when the run says it has finished.
 *      `--run <id>` names a run somebody already filed; its `sandbox` field is written if it has
 *      none. With neither, the command is the caller's own work: its process row belongs to the
 *      caller's session and no session record is written or changed.
 *   2. It STARTS THE COMMAND AS THE LEADER OF A NEW PROCESS GROUP (setsid), held at a gate that
 *      waits for the word "go" on its standard input. Its output goes to `<instance>/logs/<run>/out`.
 *   3. It REGISTERS THE COMMAND'S PID, as the container numbers it, through the ledger's door:
 *      `{"type":"process","container":…,"pidInContainer":…}`. The office stores the HOST pid, the
 *      host process group and the host start time, so a release stops the whole group from the host.
 *   4. With `--slot <pool>`, it WAITS FOR A SEAT from the office (tools/slot.mjs, naming the process
 *      row, because a pid in here means another process on the host).
 *   5. It WRITES `start.json` beside the output, prints the same line on stdout, and says "go". The
 *      gate then becomes the command (exec), keeping the pid and the group that were registered.
 *   6. FOR A RUN (not the caller's own command), IT WAITS FOR THE COMMAND TO ACTUALLY END, however
 *      long that takes, and then finishes or crashes the run: acceptance finding 2. A clean exit
 *      (code 0) with commits past the worktree's cut and a report linked to the run PATCHes the run
 *      `{state: 'finished', tip: <HEAD>}`, which the ordinary finish path seals, with a detail saying
 *      the finish is the launcher's reading and not the agent's word; with no report it is left as it
 *      was, its detail says why, and its starter is told (acceptance finding 48: a supervisor under
 *      `claude -p` exits whenever it ends a turn); a clean exit with nothing new committed is
 *      left as it was; any other exit is recorded `{state: 'crashed', detail: "…"}`, naming the exit
 *      code or the signal, and is never sealed. This is done by a second, detached copy of this same
 *      helper (see `relayInBackground` below) so that step 5 can still return to the caller — a
 *      `docker exec` or a supervisor's own tool call — the moment the command is running, exactly as
 *      before, while step 6 keeps running for as long as the command itself does.
 *      It keeps no reminder of its own: the office tells the run's starter once, on its own clock, when the run still says
 *      running 8 hours after it was filed (the reminder rule, item 5).
 *      For a Claude Code or Codex run, step 6 first records the model that answered as the run's `served`,
 *      unless the record already holds one (theServedIsWritten below).
 *   7. THEN, FOR A RUN THE OFFICE NOW SAYS IS FINISHED, IT REMOVES THE RUN'S OWN SCRATCH FOLDER, the command's TMPDIR,
 *      after three checks, each a reason to keep it: the path is exactly the folder it made, no process works in it or
 *      holds a file in it, and no git worktree in it holds changes or files nobody committed, or a commit that no ref of
 *      its repository holds. A record that names the folder does not keep it. A crashed, running or unread run's folder is
 *      left to the sweep below, which waits for a crashed run as A_CRASHED_RUNS_SCRATCH_WAITS_MS in
 *      tools/sweep-run-scratch.mjs says; an empty folder goes at once. Each folder is one line in the run's finish.log
 *      (theScratchFolderAfterTheRun below).
 *   BESIDE STEPS 6 AND 7, OLD RUNS' SCRATCH FOLDERS in the container's /tmp are swept, starting after the go of step 5 so
 *   the command never waits for it. With or without --wait, this helper exits only after the sweep has ended, and nothing
 *   the sweep does changes the command's exit or the run's state (theScratchSweep below).
 *
 * IF ANY OF STEPS 1-5 FAILS, THE COMMAND NEVER RUNS. The gate reads end-of-file and exits, a run
 * filed in step 1 is marked crashed with the reason, and the refusal is printed as the office said
 * it. The same holds if this helper dies before then: its end of the pipe closes and the gate exits.
 *
 * A CLAUDE CODE COMMAND WITH NO LOGIN NEVER RUNS EITHER (acceptance finding 47):
 * Claude Code takes its login out of every command its Bash tool runs, so a Claude Code worker started
 * from inside a Claude Code session would start logged out. It is refused with one sentence saying to
 * start it from the host with tools/sandbox.mjs exec, and an agent's run is marked as never started.
 *
 * A BUILD OR A SUITE STARTED WITH --handshake HAS ITS ROW WRITTEN BY THE HOST (acceptance finding 77,
 * 25 September 2026). `node tools/sandbox.mjs exec --wait --plain-env` gives it: this
 * helper then never speaks to the office. Steps 1 and 4 do not happen (the command is the caller's own, and the
 * launcher holds any seat), and in step 3 it writes the gate's pid into the handshake folder, in the instance folder,
 * and waits for the launcher to write the row it registered beside it. So a container with no network at all can run a
 * build or a suite, and its process row is written with the caller's key, which never goes into a container.
 *
 * AND SO DOES EVERY COMMAND A CALLER ON THE HOST STARTS AS ITS OWN, since the owner closed the key window on 27
 * September 2026. From then on the office refuses every write that carries no key, and this helper
 * holds none for a command that is no run: no key goes into a container by any road. So the row it used to file itself
 * was refused, and the inspector's check stopped at its first command. `tools/sandbox.mjs exec` now passes --handshake
 * for a caller's own command whether it waits or not; the launcher on the host writes the row with the caller's key and
 * closes it if the command never goes (THE_HOST_WRITES_EVERY_OWN_COMMANDS_ROW below is how it knows this helper can).
 * A run keeps filing its own row, with the run's own key.
 *
 * WHY THE GATE AND NOT "REGISTER MYSELF, THEN START THE COMMAND". The ledger has to hold the group
 * that the command runs in, and a group has to exist before its pid can be registered. The gate is
 * the command before it runs: same pid, same group, same start time. tools/slot.mjs uses the same
 * gate for the same reason.
 *
 * IDENTITY COMES FROM THE ENVIRONMENT. MOLE_OFFICE_AGENT and MOLE_OFFICE_SESSION say who is starting
 * this (the starter), MOLE_OFFICE_WORKSPACE which project, MOLE_OFFICE_API where the office is, and
 * SANDBOX_DIR which instance. The launcher sets them for the process it starts, and a process inside
 * inherits them. So does MOLE_OFFICE_COMMIT_EMAIL, the office's commit address as the host's settings give it: this
 * container's clone has no .env, and without it the helper read the built-in default whatever the host said.
 * The command itself gets the run's identity in their place: MOLE_OFFICE_SESSION is
 * the run, MOLE_OFFICE_AGENT the agent it serves, SANDBOX_PROCESS_ROW its own process row (the id
 * tools/slot.mjs takes as --resource inside a sandbox). MOLE_AGENT_KEY is the starter's own key: it
 * is sent on the starter's requests and taken out of the command's environment.
 *
 * THE SANDBOX'S FACTS COME FROM THE HOST, IN SANDBOX_FACTS, AND NEVER FROM THE SANDBOX'S FOLDER. What this helper
 * registers with (the sandbox's name, its template, its container and that container's ledger row) and where it cuts a
 * worktree (the checkout the sandbox was made from, its branch, its other clones) come from the host's copy of the
 * sandbox's facts. tools/sandbox.mjs sets SANDBOX_FACTS from that copy in the environment of the one docker exec that
 * starts this helper (theFactsAStartIsGiven in tools/sandbox-common.mjs). The instance.json in the sandbox's folder is
 * never read here: a run in the sandbox can rewrite it, and with it rewritten this helper asked the ledger to register
 * its process in another sandbox's container. This helper takes SANDBOX_FACTS out of its own environment at once, and
 * starts nothing when it is missing or a fact in it cannot be used. HOW THE FACTS REACH A START FROM INSIDE: the
 * command gets the same text under the same name wherever it gets SANDBOX_DIR, and nothing more, so a worker a
 * supervisor starts from inside is given what the supervisor was given. That supervisor's run can change the text
 * before it starts the worker. What the worker then registers goes to the ledger, which refuses a container that is not
 * the caller's own, and the host acts on none of it. None of the facts is a key or a token.
 *
 * A RUN HOLDS A KEY OF ITS OWN WHEN THE OFFICE ANSWERED ONE (P83 point 5; acceptance finding 79, block
 * f-79). A run is filed by its starter with the starter's own key, and the
 * office answers a key of the served agent for that run when the key proves the agent's registered
 * starter (wave 13m's answer). A worker with no key of its own also needs a hand start naming a live
 * run of that starter with --asked-by and --brief on the host, or an ask through the worker-run door.
 * By design no starter's key goes into a container, so a run
 * the launcher on the host starts is filed there (tools/sandbox.mjs), and this helper is given
 * `--filed <run id>` and the run's key as SANDBOX_RUN_KEY in the env file of that one docker exec. A
 * run of an unmarked worker an agent in here starts is filed here, with the key of the run that agent
 * is in. Either way, with a run key: every call this helper makes about the run goes as the run (the
 * served agent's name, the run's session, the run's key), the command gets the key as MOLE_AGENT_KEY,
 * SANDBOX_RUN_KEY is taken out of this process's environment at once, and the run's finish or crash is
 * the last call, because that write revokes the key; the scratch sweep may still be asking then, and is refused from that
 * moment (theScratchSweep). With none, the calls go with the starter's name
 * and no key, as before, and the helper says so. The launcher side of P83 point 5 in the keys-wave
 * brief.
 *
 * `--worktree <dir>` (an agent's run only) NEEDS NOT ALREADY EXIST: acceptance finding 4. A `<dir>`
 * that is not there yet is made as a new worktree of the instance's own clone
 * (`git worktree add -b <agent> <dir> <cutFrom>`, from `<instance>/repo`), with node_modules linked
 * to that clone's own (item 2f). `<dir>` still has to be an
 * absolute path. WITH `--clone <name>` it is cut from `<instance>/<name>` instead, one of the template's other clones
 * that `up` made (sandbox.json "clones"), from that clone's own branch unless --cut-from says otherwise; a `<dir>`
 * already there must then be a worktree of that clone.
 *
 * EVERY AGENT TOOL IN HERE RUNS WITH ITS FULL PERMISSIONS. The command's
 * environment carries OpenCode's and dsh's, and a command that starts `claude` or `codex` directly
 * gets that tool's arguments right after the program's name. src/config/run-permissions.mjs holds
 * the words; start.json holds the command as it ran.
 *
 * Usage (inside the sandbox):
 *   node tools/sandbox-start.mjs --agent <handle> --runtime <word> [--model <provider/model>]
 *       [--worktree <dir>] [--clone <name>] [--cut-from <branch>] [--title "..."] [--brief <file>] [--continues <run id> | --filed <run id>] [--flow <flow id>]
 *       [--cwd <dir>] [--slot <pool>] [--opencode-database <file>] [--starts-runs] [-- <command...>]
 *   node tools/sandbox-start.mjs --run <session record id> [--cwd <dir>] [--slot <pool>] -- <command...>
 *   node tools/sandbox-start.mjs [--cwd <dir>] [--slot <pool>] [--wait [--timeout <s>]] [--plain-env | --no-office-variables] -- <command...>
 *
 * With --runtime dsh and --brief and no command, the command is tools/dsh-hooks/run-agent.sh, which
 * starts one dsh agent on the office profile with MOLE_OFFICE_DSH_DIR=<instance>/dsh.
 * --stdin <file> gives the command an existing, readable regular file at an absolute path as standard input.
 * --opencode-database <file> names the OpenCode database an agent's round runs on: the agent's own file or the shared
 * opencode.db, whichever the host found the round's session in (theOpenCodeSessionOf in tools/sandbox.mjs).
 * Options for every form: --instance <dir> (default SANDBOX_DIR), --as, --session, --workspace, --api.
 * --starts-runs keeps a Codex or Claude Code run's key in its model's commands so it can start runs. Without it,
 * Codex's shell policy or Claude Code's environment excludes MOLE_AGENT_KEY while office_request keeps it.
 * It cannot go with --plain-env, which holds no key.
 *
 * THREE OPTIONS FOR THE CALLER'S OWN COMMAND, and only for it (acceptance finding 17). The merge tool
 * runs a submitted tree's build, generators and whole test suite here instead of on the host, and it
 * needs the command's end, not only its start.
 *
 *   --wait         Steps 1-5 run the same way, and the start line goes to stderr instead of stdout.
 *                  This helper then stays in front: the command's output comes out on this helper's
 *                  own stdout and stderr, and the helper waits for the command to end. It writes
 *                  end.json beside start.json, closes the process row, and exits with the command's
 *                  own code (128 + the signal's number when a signal ended it). SIGTERM, SIGINT or
 *                  SIGHUP sent to this helper go on to the command's whole group.
 *   --timeout <s>  With --wait only. After <s> seconds the command's group gets SIGTERM, and SIGKILL
 *                  30 seconds later if anything is left. The exit is then 124, as coreutils' timeout
 *                  gives. Nothing in the container outlives the limit, even when whoever started
 *                  `docker exec` has gone.
 *   --plain-env    The command gets the container's own environment only. None of the launcher's
 *                  variables are added (SANDBOX_DIR, SANDBOX_FACTS, MOLE_OFFICE_API, MOLE_OFFICE_WORKSPACE,
 *                  MOLE_OFFICE_SESSION, MOLE_OFFICE_AGENT, MOLE_OFFICE_COMMIT_EMAIL, the git identity,
 *                  SANDBOX_PROCESS_ROW),
 *                  and no tool's permission variables are either. A test suite builds offices and
 *                  identities of its own: a whole run in a sandbox on 22 September found five test
 *                  files that fail when they are handed ours. There is no .env in a sandbox's clone, so a command given
 *                  no address finds the built-in default port, not the live office. A harness program
 *                  still gets the switch that turns the harness's own subagents and workflows off
 *                  (tools/harness-features-off.mjs): in its words and its home's settings, or for OpenCode in
 *                  OPENCODE_CONFIG_CONTENT.
 *   --no-office-variables
 *                  The command gets everything an ordinary command gets, its secrets included, EXCEPT
 *                  the office's own address and identity (MOLE_OFFICE_API, MOLE_OFFICE_PORT,
 *                  MOLE_OFFICE_WORKSPACE, MOLE_OFFICE_SESSION, MOLE_OFFICE_AGENT, MOLE_OFFICE_COMMIT_EMAIL) and the git identity
 *                  the launcher gives an agent (GIT_AUTHOR_NAME, GIT_AUTHOR_EMAIL, GIT_COMMITTER_NAME,
 *                  GIT_COMMITTER_EMAIL): a plain machine but for its secrets. A test that commits in a
 *                  fixture then behaves as it would anywhere else (finding 34's export-mirror went red
 *                  on the git identity).
 *                  For a command that needs its login but must not reach the live office by
 *                  accident: the model of a check, which runs a change's tests. Acceptance finding 44,
 *                  measured on 23 September 2026: browser tests a check's model ran in the inspector
 *                  sandbox took the live office's address from this environment, and 65 of their
 *                  records are in the live office. With --plain-env as well it means nothing more,
 *                  and is refused.
 */

import { execFileSync, spawn, spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { appendFileSync, closeSync, existsSync, lstatSync, mkdirSync, mkdtempSync, openSync, readdirSync, readFileSync, readlinkSync, realpathSync, rmdirSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { constants as osConstants, tmpdir } from 'node:os'
import { basename, dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { settingValue, transientToolContext } from '../src/config/settings.mjs'
import { whereIsTheApi, whichWorkspace } from './where-is-the-api.mjs'
import { prepareDshSettings } from './dsh-hooks/run-settings.mjs'
import { A_RUN_IS_OVER_IN, theRunEndedBeforeItsCommand, aCodexStopNotice, aModelToName, THE_OFFICES_VARIABLES, askTheOffice, askTheOfficeWhileItRestarts, officeHeaders, takeOutTheOfficesVariables, THE_FACTS_VARIABLE, theFactsAStartWasGiven, theAgentKey, theAgentsOwnWorktree, theAgentsWorktree, theWorktreesBranchAfterFiling, theCloneNamed, theGitIdentity, theModelLine, theModelRefusal, theModelTheOfficeGives, theOfficeSaid, theSandboxField, whyARunMayNotWorkIn } from './sandbox-common.mjs'
import { fileARun, theDoingLineOfARun, writeTheDoingLineIfTheRunHasNone } from './file-a-run.mjs'
import { openTheBridge } from './provider-router-bridge.mjs'
import { aCommandsPermissions, aCodexContainerCommand, aCommandsOfficeTool, aClaudeCommandsOfficeTool, aShellsOfficeToolFile, aCommandsProgram, aRuntimeIsCodex, OFFICE_TOOL_CONFIGURATION, THE_RUN_OUTPUT } from '../src/config/run-permissions.mjs'
import { codexCapacityAtTheEnd, codexRateOrUsageLimitAtTheEnd, isACauseTheyMustActOn, theStopCauseAtTheEndOfTheTranscript, theStopCauseOf } from '../src/config/stopped-run-cause.mjs'
import { UNKNOWN_STOP_CAUSE } from './sandbox-common.mjs'
import { notTheFolderMade, theProcessesNotRead, theProcessesUsing, theScratchFolderIsStillFree, whyAWorktreeKeepsIt } from './scratch-folder-checks.mjs'
import { CLAUDE_CODE_LOGINS, aClaudeCodeLogin, theCredentialsFile, theLoginThatPaid } from '../src/config/claude-code-login.mjs'
import { theReceiptOfAnEndedCodexCommand, theReceiptOfAnEndedCommand, theReceiptOfAnEndedOpenCodeCommand, theReceiptWrittenOver, whereItRan } from '../src/config/usage.mjs'
import { theServedOfAClaudeCodeRun } from '../src/config/claude-code-served.mjs'
import { theServedOfACodexRun } from '../src/config/runtime-served.mjs'
import { theOutputOfTheRunItContinues } from '../src/config/the-run-it-continues.mjs'
import { theCommandResumesAConversation, aWaitATestMayShorten } from '../src/config/sandbox-start-values.mjs'
import { aRunSaysItIsFinished, THE_LONGEST_FINISH_WAIT_MS, THE_FINISH_ANSWER_WAS_LATE } from '../src/config/finished.mjs'
import { clockStamp, fileNameStamp, nowStamp } from '../src/shared/time.ts'
import { theRecordedBaseOfRun } from '../src/shared/next-round.ts'
import { aCommandsRuntime, aCommandsStartFromTheOffice, aCommandsStartValues, aCodexTierWarning, aDetailOfAFewKilobytes, aStreamReadWhole, prepareClaudeRunHome, prepareOpenCodeRunHome, OPENCODE_RUN_HOME_NOTICE, THE_OPENCODE_DATABASE_VARIABLE, THE_SHARED_OPENCODE_DATABASE, theOpenCodeDatabaseOf, whyTheSlotToolGaveNoSeat, writeWhole } from './sandbox-common.mjs'
import { THE_EFFORT_SOURCES, withoutTheProvider } from '../src/config/model-efforts.mjs'
import { anOpenCodeLineThatGoesOn, theGoLimitAnOpenCodeRunEndedOn, theGoLimitAnOpenCodeRunWaitsOn, theLastLinesOf } from '../src/config/stopped-run-cause.mjs'
import { aWaitIsLong } from '../src/config/a-long-wait.mjs'
import { OPENCODE_OUTPUT_CAP, THE_OUTPUT_CAP_WORDS } from './opencode-output-cap.mjs'
import { THE_STARTING_WORDS, THE_STARTING_WORDS_WITHOUT_THE_SWITCH, aCommandWithTheHarnessFeaturesOff, aRunnerGivesDshThePatch, theHarnessFeaturesOffInAHome } from './harness-features-off.mjs'
import { A_SANDBOX_STARTS_WINDOW_FROM, THE_COMPACTION_VARIABLE } from '../src/config/the-compaction-window.mjs'
import { theAgentsMessagesSince, whatTheRunSays } from './a-run-says-it-seals.mjs'
import { readAFullList } from './a-full-list-read.mjs'

/** The container argv contract this helper implements; the host reads the selected helper as text. */
export const PERMISSIONS_CONTRACT = 2

const HERE = dirname(fileURLToPath(import.meta.url))
const SELF = fileURLToPath(import.meta.url)

/**
 * The mode a plain writeFileSync gives a file, which the log files below have today; the umask still applies, as it
 * did to the plain write. The writer is given it explicitly because the files the helper publishes keep their mode.
 */
const THE_MODE_OF_A_PLAINLY_WRITTEN_FILE = 0o666

/**
 * THIS HELPER RUNS TWICE FOR EVERY COMMAND IT STARTS: A FRONT INVOCATION, WHICH IS WHAT `docker
 * exec` OR A SUPERVISOR ACTUALLY CALLS AND WHICH RETURNS AS SOON AS THE COMMAND IS RUNNING (the
 * contract launcher.md promises), AND A BACKGROUND INVOCATION OF ITSELF, DETACHED, WHICH DOES ALL
 * THE WORK BELOW AND THEN STAYS ALIVE TO SEE THE COMMAND END.
 *
 * WHY THIS EXISTS (acceptance finding 2). Once "go" is sent, the gate becomes the command, keeping
 * its pid: whichever process actually holds that child (via `spawn`) is the only one that can ever
 * learn its real exit code — the kernel gives that to the true parent alone, and once an unrelated
 * process exits the child is reparented to the container's init and its status is lost for good.
 * So finishing or crashing the run has to happen in the same process that spawned the gate, and
 * that process cannot be the one `docker exec` or a supervisor's own tool call waits on, or `exec`
 * would block until the whole command ends — exactly what tests/sandbox-launcher.test.ts's `sleep
 * 300` cases prove it must not do.
 *
 * THE FRONT NEVER TOUCHES THE OFFICE OR THE FILESYSTEM. It only relays: it starts the background
 * invocation of this same file (`--in-background`, stripped back off before either copy parses its
 * arguments), copies its stderr through live, and copies the first line of its stdout — the `start`
 * JSON line every caller reads — through as soon as it appears, then exits. If the background copy
 * ends before printing that line (a refusal, bad usage), the front relays what it did print and
 * exits with the same code, so a caller sees exactly the failure the background one gave.
 */
async function relayInBackground(passedArgv) {
  const child = spawn(process.execPath, [SELF, ...passedArgv, '--in-background'], {
    cwd: process.cwd(),
    env: process.env,
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let settled = false
  child.stderr.on('data', (chunk) => {
    if (!settled) process.stderr.write(chunk)
  })
  await new Promise((done) => {
    // THE START LINE IS PASSED ON AS THE BYTES IT CAME IN, read whole, so a letter cut between two pieces stays one (item 2ab).
    const read = aStreamReadWhole(child.stdout, (line) => {
      if (settled) return
      settled = true
      process.stdout.write(line, () => {
        child.stdout.destroy()
        child.stderr.destroy()
        child.unref()
        done()
      })
    })
    const early = (code, signal) => {
      if (settled) return
      settled = true
      const printed = read.bytes()
      if (printed.length > 0) process.stdout.write(printed)
      process.exitCode = code ?? (signal === null ? 1 : 1)
      done()
    }
    child.on('exit', early)
    child.on('error', (why) => {
      if (settled) return
      settled = true
      process.stderr.write(`sandbox-start: could not start its own background copy: ${why.message}\n`)
      process.exitCode = 1
      done()
    })
  })
}

const rawArgv = process.argv.slice(2)
const IN_BACKGROUND = rawArgv.includes('--in-background')
const realArgv = rawArgv.filter((word) => word !== '--in-background')
/** --wait, said before the command: this helper stays in front and there is no background copy. */
const WAITS = (() => {
  const end = realArgv.indexOf('--')
  return (end === -1 ? realArgv : realArgv.slice(0, end)).includes('--wait')
})()

if (!IN_BACKGROUND && !WAITS) {
  await relayInBackground(realArgv)
  process.exit(process.exitCode ?? 0)
}

/**
 * THE GATE. It waits for "go" and then the id of its own process row, puts that id in the
 * environment and becomes the command. Anything else on its standard input, or none, and it exits
 * 111 without running anything. The plain gate is the same, except that it puts nothing in the
 * environment (--plain-env). The first positional parameter names the command's stdin file, or is
 * empty to keep the gate's exhausted input. It is a shell variable only, never exported.
 */
const GATE =
  'IFS= read -r word; [ "$word" = go ] || exit 111; IFS= read -r row; ' +
  'SANDBOX_PROCESS_ROW="$row"; export SANDBOX_PROCESS_ROW; ' +
  'f=$1; shift; if [ -n "$f" ]; then exec "$@" < "$f"; else exec "$@"; fi'
const PLAIN_GATE =
  'IFS= read -r word; [ "$word" = go ] || exit 111; IFS= read -r row; ' +
  'f=$1; shift; if [ -n "$f" ]; then exec "$@" < "$f"; else exec "$@"; fi'

/**
 * WHAT THIS LAUNCHER PUTS IN A COMMAND'S ENVIRONMENT, and so what --plain-env keeps out. The first
 * seven also arrive from `docker exec -e`, set by tools/sandbox.mjs, so they are taken out, not only
 * left unset.
 */
const THE_LAUNCHERS_VARIABLES = [
  'SANDBOX_DIR',
  THE_FACTS_VARIABLE,
  'SANDBOX_LAUNCH_LOGS',
  'MOLE_OFFICE_API',
  'MOLE_OFFICE_WORKSPACE',
  'MOLE_OFFICE_SESSION',
  'MOLE_OFFICE_AGENT',
  'MOLE_OFFICE_COMMIT_EMAIL',
  'MOLE_OFFICE_API_ROOT',
  'MOLE_OFFICE_DSH_DIR',
  'GIT_AUTHOR_NAME',
  'GIT_AUTHOR_EMAIL',
  'GIT_COMMITTER_NAME',
  'GIT_COMMITTER_EMAIL',
  'SANDBOX_PROCESS_ROW',
]

function usage(problem) {
  process.stderr.write(
    [
      problem,
      '',
      'node tools/sandbox-start.mjs --agent <handle> --runtime <word> [--model <m>] [--worktree <dir>] [--clone <name>] [--cut-from <b>]',
      '    [--title "..."] [--brief <file>] [--continues <run id> | --filed <run id>] [--flow <flow id>] [--cwd <dir>] [--slot <pool>] [--opencode-database <file>] [--starts-runs] [-- <command...>]',
      'node tools/sandbox-start.mjs --run <session record id> [--cwd <dir>] [--slot <pool>] -- <command...>',
      'node tools/sandbox-start.mjs [--cwd <dir>] [--slot <pool>] [--wait [--timeout <s>]] [--plain-env] -- <command...>',
      'node tools/sandbox-start.mjs [--wait [--timeout <s>]] [--plain-env | --no-office-variables] --handshake <folder in the instance> [--cwd <dir>] -- <command...>',
      '',
      'Every form takes --verbose to print launch explanations kept in launch.txt.',
      'Every form also takes --stdin <file>, --instance <dir> (default SANDBOX_DIR), --as, --session, --workspace and --api.',
      'The header of this file says what each step does.',
    ].join('\n') + '\n',
  )
  process.exit(2)
}

/**
 * THE STATE THE RUN'S END LEFT IT IN, as finishOrCrashTheRun read it with the run's own key or wrote it, or null when its
 * record could not be read then. theScratchFolderAfterTheRun decides by it and reads nothing again: after the key window
 * closes this helper holds no key of its starter, and a second read as the starter was refused (403), which kept every
 * finished run's folder (21 October 2026).
 */
let theStateItsEndLeft = null
/** The scratch folder made for this run's command (aScratchFolder), or null when none was made. */
let theScratchFolderMade = null
/** What that folder was when it was made: its resolved path, the folder it was made in, and its device and inode. */
let theScratchFolderAsMade = null
/**
 * The run's office tool configuration, held by the launcher until the command ends: Claude Code's per-start MCP file,
 * or the file a Codex or dsh run's shell reads its key from (aShellsOfficeToolFile). A command gets one at most.
 */
let theOfficeMcpConfiguration = null

function takeBackTheOfficeMcpConfiguration() {
  if (theOfficeMcpConfiguration === null) return
  try {
    // The file holds the run's key; its folder was made for it alone, so both go.
    rmSync(dirname(theOfficeMcpConfiguration), { recursive: true, force: true })
    theOfficeMcpConfiguration = null
  } catch (error) {
    say(`could not remove the office MCP configuration ${theOfficeMcpConfiguration}: ${error.message}`)
  }
}

/**
 * TAKE BACK THE RUN'S SCRATCH FOLDER WHILE IT IS EMPTY, before its command was told to go: after a refusal, when nothing
 * ran in it, and when this helper ends on an error nobody expected (aScratchFolder). rmdir takes only an empty folder, so
 * nothing anybody wrote is removed. Once the command has run, theScratchFolderAfterTheRun decides instead.
 */
function takeBackTheScratchFolder() {
  if (theScratchFolderMade === null) return
  try {
    rmdirSync(theScratchFolderMade)
  } catch {
    // not empty, or already gone
  }
}

function refuse(sentence, code = 1) {
  takeBackTheScratchFolder()
  try {
    if (launchDetails === null) {
      const folder = chosen.instance ?? process.env['SANDBOX_DIR']
      if (typeof folder !== 'string' || !isAbsolute(folder)) throw new Error('No sandbox folder was named for the details.')
      const logs = join(folder, 'logs', (/^[A-Za-z0-9_-]+$/.test(chosen.filed ?? chosen.run ?? '') ? (chosen.filed ?? chosen.run) : `failed-${fileNameStamp(new Date())}-${process.pid}`))
      mkdirSync(logs, { recursive: true })
      launchDetails = join(logs, 'launch.txt')
      appendFileSync(launchDetails, launchLines.slice(launchDetails === earlyLaunchDetails ? earlyLineCount : 0).join(''))
      launchLines.length = 0
    }
    appendFileSync(launchDetails, `sandbox-start: ${sentence}\n`)
    const short = sentence.split(/(?<=[.!?]) (?=[A-Z])/)[0].replaceAll('\n', ' ')
    process.stderr.write(`sandbox-start: ${chosen.verbose === true ? sentence : short} Details: ${launchDetails}\n`)
  } catch (error) {
    process.stderr.write(`sandbox-start: Could not write launch details: ${error.message}\n`)
    process.stderr.write(`sandbox-start: ${sentence}\n`)
  }
  process.exit(code)
}

/**
 * WHERE WHAT THIS HELPER SAYS ALSO GOES ONCE NOBODY READS ITS STDERR, or null while somebody still does. It is set by
 * `nobodyReadsThisCopyAnyMore` below.
 */
let whatItSaysAlsoGoesTo = null

export const THE_WAITED_START_PREFIX = 'sandbox-start: started '

let launchDetails = null
let earlyLaunchDetails = null
let earlyLineCount = 0
const launchLines = []
function say(line, quiet = false) {
  const words = `sandbox-start: ${line}\n`
  if (launchDetails === null) launchLines.push(words)
  else appendFileSync(launchDetails, words)
  if (!quiet && launchDetails === null) {
    try {
      if (earlyLaunchDetails === null) {
        const folder = chosen.instance ?? process.env['SANDBOX_DIR']
        if (typeof folder !== 'string' || !isAbsolute(folder)) throw new Error('No sandbox folder was named for the details.')
        const namedRun = chosen.filed ?? chosen.run ?? ''
        const name = /^[A-Za-z0-9_-]+$/.test(namedRun) ? namedRun : `pending-${fileNameStamp(new Date())}-${process.pid}`
        earlyLaunchDetails = join(folder, 'logs', name, 'launch.txt')
        mkdirSync(dirname(earlyLaunchDetails), { recursive: true })
      }
      appendFileSync(earlyLaunchDetails, launchLines.slice(earlyLineCount).join(''))
      earlyLineCount = launchLines.length
    } catch (error) {
      process.stderr.write(`sandbox-start: Could not write launch details: ${error.message}\n`)
      earlyLaunchDetails = null
      earlyLineCount = 0
    }
  }
  const details = launchDetails ?? earlyLaunchDetails
  if (!quiet || chosen.verbose === true) process.stderr.write(!quiet && details !== null && !line.includes(details) ? `${words.trimEnd()} Details: ${details}\n` : words)
  if (whatItSaysAlsoGoesTo === null) return
  try {
    appendFileSync(whatItSaysAlsoGoesTo, `${clockStamp().instant} ${line}\n`)
  } catch {
    // Only the note is lost; the run goes on.
  }
}

/**
 * ONCE THE START LINE IS OUT, NOBODY READS THIS BACKGROUND COPY'S STDOUT OR STDERR (found by
 * a worker of line 13l, 25 September 2026). The front, `relayInBackground`, passes the start
 * line on and destroys both pipes, so a later write here fails with EPIPE. Unhandled, that error ended this copy, and
 * this copy held the gate's exit listener: the run was never finished or marked crashed, and its process row stayed
 * open. On a quiet machine the "is running" line got out before the pipes went; under load it sometimes did not (three
 * times at load 39). So from the start line on, a write error on either stream is ignored, and everything this copy
 * says also goes into `helper.log` in the run's log folder, where nothing is lost.
 */
function nobodyReadsThisCopyAnyMore(folder) {
  const ignore = () => {}
  process.stdout.on('error', ignore)
  process.stderr.on('error', ignore)
  whatItSaysAlsoGoesTo = join(folder, 'helper.log')
}

function readArguments(argv) {
  const chosen = { command: [] }
  const flags = [
    'instance', 'agent', 'runtime', 'model', 'worktree', 'clone', 'cut-from', 'title', 'brief', 'continues', 'flow', 'filed', 'cwd', 'slot', 'run',
    'as', 'session', 'workspace', 'api', 'timeout', 'handshake', 'stdin', 'opencode-database',
  ]
  const switches = ['verbose', 'wait', 'plain-env', 'no-office-variables', 'starts-runs']
  for (let i = 0; i < argv.length; i += 1) {
    const word = argv[i]
    if (word === '--') {
      chosen.command = argv.slice(i + 1)
      break
    }
    if (word === '--help' || word === '-h') usage('')
    if (word.startsWith('--') && switches.includes(word.slice(2))) {
      chosen[word.slice(2)] = true
      continue
    }
    if (!word.startsWith('--') || !flags.includes(word.slice(2))) usage(`I do not know "${word}". A command to run goes after --.`)
    const value = argv[(i += 1)]
    if (value === undefined || value === '') usage(`${word} takes a value.`)
    chosen[word.slice(2)] = value
  }
  return chosen
}

const chosen = readArguments(realArgv)
// Host effort values belong to this helper only. Remove them before any command environment is copied.
const passedSelectionJson = process.env['SANDBOX_START_SELECTION']
delete process.env['SANDBOX_START_SELECTION']
let fixedSelection
let fixedSelectionSaysTheAgent = false
let legacySelectionSaid = false
if (passedSelectionJson !== undefined) {
  try { fixedSelection = readLauncherSelection(JSON.parse(passedSelectionJson)) }
  catch (why) { refuse(why instanceof Error ? why.message : String(why), 2) }
}
const passedEffortJson = process.env['SANDBOX_START_EFFORT']
delete process.env['SANDBOX_START_EFFORT']
// An older helper set this on the run it started again on Astra. Nothing starts a run again now, so it is only kept out.
delete process.env['SANDBOX_SOL_CAPACITY_RESTART']
// A SOL CAPACITY EXIT ENDS ITS RUN (18 October 2026). It was started again on Astra under the owner's older
// rule; a later rule replaced that (no Astra, Sol only for hard pieces), and the restart also started again a
// run that had already committed and reported. Now nothing starts again on any model: the run is crashed
// as any failed run is, and its starter is told once, in the sentence of a Codex stop, so its supervisor chooses what
// comes next. Capacity is read only from Codex's own final error event (codexCapacityAtTheEnd), never from words an agent's
// message or a command's output holds. Since 1 November 2026 that holds for every
// Codex model, and the sentence names the model. It is aCodexStopNotice in src/config/launcher-notices.mjs, because the
// office writes it to the starter too.
let passedEffort = null
if (passedEffortJson !== undefined) {
  try {
    const answer = JSON.parse(passedEffortJson)
    const fields = ['effort', 'effortFrom', 'model', 'askedModel', 'unavailable', 'predatesEffort']
    if (answer === null || typeof answer !== 'object' || Array.isArray(answer) || Object.keys(answer).length !== fields.length ||
      !fields.every(name => Object.hasOwn(answer, name)) ||
      !(answer.effort === null || (typeof answer.effort === 'string' && answer.effort.trim() === answer.effort && answer.effort !== '')) ||
      !THE_EFFORT_SOURCES.includes(answer.effortFrom) ||
      ![answer.model, answer.askedModel].every(model => model === null || (typeof model === 'string' && model.trim() === model && model !== '')) ||
      typeof answer.unavailable !== 'boolean' || typeof answer.predatesEffort !== 'boolean' ||
      (!answer.unavailable && !answer.predatesEffort && (answer.effort === null) !== (answer.effortFrom === 'none'))) {
      throw new Error('the effort, its source, asked model or office availability is unreadable')
    }
    passedEffort = answer
  } catch (why) { refuse(`The host effort values could not be read (${why instanceof Error ? why.message : String(why)}). Nothing was started.`, 2) }
}
if (chosen['plain-env'] === true && chosen['starts-runs'] === true) usage('--starts-runs cannot be used with --plain-env: such a command holds no key.')

// Refuse before filing a run, making its folders or starting its gate.
const stdin = chosen.stdin ?? null
if (stdin !== null) {
  let readableFile = false
  try {
    if (isAbsolute(stdin) && statSync(stdin).isFile()) {
      const fd = openSync(stdin, 'r')
      closeSync(fd)
      readableFile = true
    }
  } catch {
    // Missing, not a regular file, or unreadable: the refusal below covers all three.
  }
  if (!readableFile) refuse(`--stdin must be an absolute path to a regular file this sandbox can read, and "${stdin}" is not one. Nothing was started.`)
}

// ============================================================================ what is being asked

const instanceDir = chosen.instance ?? process.env['SANDBOX_DIR'] ?? null
if (instanceDir === null || !isAbsolute(instanceDir)) {
  refuse(
    'Say which sandbox this is: SANDBOX_DIR, which the launcher sets for every process it starts in a sandbox, or ' +
      '--instance <its folder, absolute>. Nothing was started.',
    2,
  )
}
// THE SANDBOX'S FACTS, AS THE LAUNCHER ON THE HOST GAVE THEM (see the header), taken out of this process's environment at
// once. The command, and this helper when it starts itself again for Sol's capacity, get the same text back below;
// nothing else this helper starts inherits it. The copy in the sandbox's folder is never read: a run in here can
// rewrite it.
const theFactsGiven = process.env[THE_FACTS_VARIABLE]
delete process.env[THE_FACTS_VARIABLE]
let instance
try {
  instance = theFactsAStartWasGiven(theFactsGiven)
} catch (why) {
  refuse(why.message)
}
let sandboxField
try {
  sandboxField = theSandboxField(instance, realpathSync(instanceDir))
} catch (why) {
  refuse(why.message)
}

const api = whereIsTheApi(chosen.api)
const workspace = whichWorkspace(chosen.workspace)
const starter = chosen.as ?? settingValue('MOLE_OFFICE_AGENT') ?? null
const starterSession = chosen.session ?? transientToolContext().session ?? null
if (typeof starter !== 'string' || starter.trim() === '') {
  refuse('Say who is starting this: MOLE_OFFICE_AGENT, or --as <your handle>. This never writes in the person\'s name. Nothing was started.', 2)
}
if (typeof starterSession !== 'string' || starterSession.trim() === '') {
  refuse('Say which session is starting this: MOLE_OFFICE_SESSION, or --session <its record id>. Nothing was started.', 2)
}
const headers = (session) => officeHeaders({ workspace, agent: starter, session })
// THE OFFICE'S COMMIT ADDRESS, READ BEFORE ANYTHING IS FILED OR STARTED. settingValue refuses an
// empty one in its own words; read as the command's environment was built, that refusal came after this helper had
// filed an agent's run, and left it saying running. On a run the host starts it is the host's setting, handed in with
// `docker exec -e` by tools/sandbox.mjs, because this container's clone has no .env of its own.
const commitAddress = settingValue('MOLE_OFFICE_COMMIT_EMAIL')

// THE RUN'S OWN KEY FROM THE HOST, taken out of this process's environment at once so nothing this helper starts
// inherits it (see the header). Only a run the host filed and names with --filed has one; the command gets it as
// MOLE_AGENT_KEY below, and nothing else does.
const theKeyTheHostGave = /^[0-9a-f]{64}$/.test(process.env['SANDBOX_RUN_KEY'] ?? '') ? String(process.env['SANDBOX_RUN_KEY']) : null
const aKeyCameFromTheHost = process.env['SANDBOX_RUN_KEY'] !== undefined
delete process.env['SANDBOX_RUN_KEY']

const mode = chosen.agent !== undefined ? 'agent' : chosen.run !== undefined ? 'run' : 'own'
// THE OPENCODE DATABASE A ROUND RUNS ON is one of the two files a round of its agent looks in, and only an agent's run
// takes one. Refused here, before anything is filed.
if (chosen['opencode-database'] !== undefined) {
  if (mode !== 'agent') usage("--opencode-database takes only an agent's run (--agent): a plain command and a run started with --run keep OpenCode's default database.")
  const own = theOpenCodeDatabaseOf(chosen.agent)
  if (chosen['opencode-database'] !== own && chosen['opencode-database'] !== THE_SHARED_OPENCODE_DATABASE) {
    usage(`--opencode-database takes only ${own === null ? '' : `${own} or `}${THE_SHARED_OPENCODE_DATABASE} for a run of ${chosen.agent}, and was given ${JSON.stringify(chosen['opencode-database'])}.`)
  }
}
if (chosen['starts-runs'] === true && mode === 'own') usage("--starts-runs needs an agent's run (--agent or --run): a plain command holds no run key, so there is nothing to keep.")
if (chosen.agent !== undefined && chosen.run !== undefined) {
  usage('--agent files a new run and --run names one already filed. Say one of them.')
}
if (mode === 'agent' && chosen.runtime === undefined) {
  usage('An agent run needs --runtime, which goes on its run record.')
}
if (chosen.filed !== undefined && chosen.continues !== undefined) {
  usage('--filed names a run the launcher on the host filed already, with its link to the run it continues; --continues goes only with a run this helper files.')
}
if (chosen.filed !== undefined && chosen.flow !== undefined) {
  usage('--filed names a run the launcher on the host filed already, with the flow it named; --flow goes only with a run this helper files.')
}
if (aKeyCameFromTheHost && chosen.filed === undefined) {
  refuse('SANDBOX_RUN_KEY came without --filed: a run key is only for the run the host filed and names. Nothing was started.', 2)
}
if (mode !== 'agent') {
  for (const flag of ['runtime', 'model', 'worktree', 'clone', 'cut-from', 'title', 'brief', 'continues', 'flow', 'filed']) {
    if (chosen[flag] !== undefined) usage(`--${flag} is about an agent's run, and only goes with --agent.`)
  }
}
// NO RUN THIS HELPER FILES WORKS IN THE SANDBOX'S SHARED CHECKOUT (whyARunMayNotWorkIn in tools/sandbox-common.mjs says
// why), refused before the run is filed. A run the host filed and names with --filed is the host's to place.
if (mode === 'agent' && chosen.filed === undefined && chosen.worktree !== undefined) {
  const shared = whyARunMayNotWorkIn(instanceDir, chosen.worktree, { agent: chosen.agent })
  if (shared !== null) refuse(shared, 2)
}
// --wait AND --plain-env ARE FOR THE CALLER'S OWN COMMAND. A run is finished or crashed by the
// background copy when its command ends (step 6), and an agent needs the launcher's variables to
// reach the office at all.
if (mode !== 'own') {
  for (const flag of ['wait', 'plain-env', 'no-office-variables', 'timeout']) {
    if (chosen[flag] !== undefined) usage(`--${flag} is for the caller's own command, not for an agent's run (--agent or --run).`)
  }
}
if (chosen.timeout !== undefined && chosen.wait !== true) usage('--timeout goes with --wait: only a helper that waits for the command can stop it at a limit.')
const WAIT = chosen.wait === true
const PLAIN = chosen['plain-env'] === true
const NO_OFFICE = chosen['no-office-variables'] === true
if (PLAIN && NO_OFFICE) usage('--plain-env already keeps every launcher variable out, the office\'s included; --no-office-variables goes without it.')
// Validate before this helper files a run, writes its environment or starts a gate.
function checkCodexBeforeFiling(runtime) {
  try {
    const checked = aCodexContainerCommand(chosen.command, { runtime, plain: mode === 'own', insert: mode !== 'own' })
    for (const sentence of checked.says) say(sentence, true)
  } catch (why) { refuse(why instanceof Error ? why.message : String(why), 2) }
}
if (mode !== 'run') checkCodexBeforeFiling(chosen.runtime ?? null)

// THE ROW THE HOST WRITES (see the header): for the caller's own command, waited for or not, with no seat of its own,
// and in a folder inside the instance, which the launcher on the host reads at the same path. A run files its own row
// with its own key. THE_HOST_WRITES_EVERY_OWN_COMMANDS_ROW: tools/sandbox.mjs looks for that name in a sandbox's clone
// before it passes --handshake for a command that does not wait, since a helper from before this refused one.
const HANDSHAKE = chosen.handshake ?? null
if (HANDSHAKE !== null) {
  if (mode !== 'own') usage("--handshake is for the caller's own command, whose row the launcher on the host writes; a run files its own row with its own key.")
  if (chosen.slot !== undefined) usage('--handshake takes no --slot: the launcher on the host holds the seat for the command it waits for.')
  if (!isAbsolute(HANDSHAKE) || !resolve(HANDSHAKE).startsWith(`${resolve(instanceDir)}/`)) {
    usage(`--handshake takes a folder inside the instance ${instanceDir}, and "${HANDSHAKE}" is not one.`)
  }
}
// A HELPER THAT HOLDS NO KEY SAYS SO, before its first call (from wave 13n's sweep of the tools that
// call the office, block b-7). With no key of its starter's, no run key from the host and no handshake,
// every call it makes goes with a name and no key, and since the key window closed the office refuses such a call.
if (theAgentKey() === null && theKeyTheHostGave === null && HANDSHAKE === null) {
  say(
    'this helper holds no key: no MOLE_AGENT_KEY of its starter\'s, no run key from the host and no --handshake, so every ' +
      'call it makes to the office goes with a name and no key, which the office refuses since the key window closed. ' +
      'Started through tools/sandbox.mjs exec on the host, a command has a handshake or a run key.',
  )
}
/**
 * How long the gate waits for the launcher on the host to write the row, before it gives up and the command never runs.
 * A test shortens it with SANDBOX_HANDSHAKE_LIMIT_MS (tests/sandbox-launcher.test.ts); nothing else sets it.
 */
const HANDSHAKE_LIMIT_MS = Number(process.env['SANDBOX_HANDSHAKE_LIMIT_MS']) > 0 ? Number(process.env['SANDBOX_HANDSHAKE_LIMIT_MS']) : 60_000
/**
 * A PAUSE BETWEEN THE START LINE AND WHAT THE BACKGROUND COPY SAYS NEXT, for a test only. A loaded machine can stop this
 * process between those two writes for long enough that the front destroys the pipes. A test
 * sets SANDBOX_PAUSE_AFTER_THE_START_LINE_MS (tests/sandbox-launcher.test.ts) to make that happen every time; nothing
 * else sets it.
 */
const PAUSE_AFTER_THE_START_LINE_MS =
  Number(process.env['SANDBOX_PAUSE_AFTER_THE_START_LINE_MS']) > 0 ? Number(process.env['SANDBOX_PAUSE_AFTER_THE_START_LINE_MS']) : 0
/**
 * AN ERROR NOBODY EXPECTED, RIGHT AFTER A RUN'S SCRATCH FOLDER IS MADE, for a test only: nothing between making the folder
 * and telling the command to go fails in a way a test can arrange from outside. A test sets
 * SANDBOX_THROW_AFTER_THE_SCRATCH_FOLDER=1 (tests/sandbox-launcher.test.ts) to see the folder taken back; nothing else
 * sets it.
 */
const THROWS_AFTER_THE_SCRATCH_FOLDER = process.env['SANDBOX_THROW_AFTER_THE_SCRATCH_FOLDER'] === '1'
const TIMEOUT_SECONDS = chosen.timeout === undefined ? null : Number(chosen.timeout)
if (TIMEOUT_SECONDS !== null && (!Number.isInteger(TIMEOUT_SECONDS) || TIMEOUT_SECONDS <= 0)) {
  usage(`--timeout takes a whole number of seconds above 0, not "${chosen.timeout}".`)
}

/** An absolute directory that exists, or a refusal naming the flag. */
function aDirectory(value, flag) {
  const dir = resolve(value)
  if (!isAbsolute(value) || !existsSync(dir) || !statSync(dir).isDirectory()) {
    refuse(`${flag} must be an absolute path to a directory that exists, and "${value}" is not one. Nothing was started.`)
  }
  return dir
}

/**
 * THE WORKTREE, MADE WHEN IT IS NOT THERE YET (acceptance finding 4), by theAgentsWorktree in tools/sandbox-common.mjs:
 * the one copy, which the launcher on the host uses too for a run it files before it starts it.
 */
let madeWorktree = null
function aWorktree(value, cutFrom) {
  try {
    madeWorktree = theAgentsWorktree({
      instanceDir,
      from: theClone === null ? instance.from : theClone.from,
      branch: chosen.agent,
      value,
      cutFrom,
      cutNamed: chosen['cut-from'] !== undefined,
      clone: theClone === null ? null : theClone.name,
    })
    if (madeWorktree.made !== null) say(madeWorktree.made, true)
    return madeWorktree.dir
  } catch (why) {
    refuse(why instanceof Error ? why.message : String(why))
  }
}

/**
 * THE MODEL THE RUN IS FILED WITH. Criterion U2.
 *
 * A --model the starter typed wins. Without it the office is asked what a builder run of this agent
 * on this runtime gets: the agent's own model on its profile, or else the casting the Casting table
 * marks for its role card, whose id and decision are printed (theModelTheOfficeGives and theModelLine
 * in tools/sandbox-common.mjs). That model goes on the run record. When the office cannot answer, or
 * names a model from neither, nothing is started and the refusal says why: the office's .env default
 * is not taken. It is asked before a worktree is made, so a refusal makes
 * nothing.
 */
let runModel = chosen.model ?? null
const THE_RUNS_START_ENVIRONMENT = 'the environment this run was started with in the container'
/** Where the values the start's words name came from: the effort, and the compaction window tools/sandbox.mjs gave. */
const WHERE_THE_START_VALUES_CAME_FROM = { CLAUDE_CODE_EFFORT_LEVEL: THE_RUNS_START_ENVIRONMENT, [THE_COMPACTION_VARIABLE]: A_SANDBOX_STARTS_WINDOW_FROM }
/** Reuse the host answer at preflight and at the gate. An older host has no answer, so the helper still asks. */
async function theStartValuesHere(command, options) {
  if (fixedSelection !== undefined) {
    const { rowsEffort } = await recheckLauncherSelection(options.api, fixedSelection, options)
    return aCommandsStartValues(command, { ...options, selection: fixedSelection, rowsEffort, officeSaysTheAgent: fixedSelectionSaysTheAgent })
  }
  if (passedEffort === null) {
    const values = await aCommandsStartFromTheOffice(command, options)
    if (values.start?.selection !== undefined) {
      fixedSelection = values.start.selection
      fixedSelectionSaysTheAgent = values.start?.effortFrom === 'the agent'
    } else if (!legacySelectionSaid && values.start !== null) { say(LEGACY_SELECTION_NOTICE, true); legacySelectionSaid = true }
    return values
  }
  if (!legacySelectionSaid) { say(LEGACY_SELECTION_NOTICE, true); legacySelectionSaid = true }
  const given = aCommandsStartValues(command, { ...options, effortAnswer: passedEffort })
  if (passedEffort.askedModel !== null && withoutTheProvider(passedEffort.askedModel) !== withoutTheProvider(given.start?.requestedModel ?? given.start?.model ?? '')) {
    throw new Error(`The host asked for effort on ${passedEffort.askedModel}, but this command names ${String(given.start?.model)}. Nothing was started.`)
  }
  return given
}
if (mode === 'agent' && runModel === null) {
  let given
  try {
    given = await theModelTheOfficeGives(api, { agent: chosen.agent, runtime: chosen.runtime, workspace, headers: headers(starterSession) })
  } catch (why) {
    refuse(theModelRefusal(why), 2)
  }
  runModel = given.model
  if (given.selection !== undefined) {
    fixedSelection = given.selection
    fixedSelectionSaysTheAgent = given.effortFrom === 'the agent'
  }
  say(theModelLine(given), true)
}

// Read effort and refuse caller conflicts before making a worktree or filing a run.
// THE PREFLIGHT ASKS AS THE RUN when the host filed it and gave its key: the served agent, the run's session and the
// run's key, which aboutTheRun sends at the gate. No starter's key goes into a container, so a recheck of the run's
// Casting row with the starter's name and no key was refused once the key window closed, and a round the message
// worker started on a native row was written crashed. With no run key it asks as before, and when no key came at all
// a refused recheck says so.
const thePreflightsHeaders = chosen.filed !== undefined && theKeyTheHostGave !== null
  ? officeHeaders({ workspace, agent: chosen.agent, session: chosen.filed, key: theKeyTheHostGave })
  : headers(starterSession)
if (mode === 'agent') {
  try { await theStartValuesHere(chosen.command, { api, agent: chosen.agent, workspace, headers: thePreflightsHeaders, runtime: chosen.runtime, model: runModel, env: process.env, envFrom: WHERE_THE_START_VALUES_CAME_FROM }) }
  catch (why) {
    const words = why instanceof Error ? why.message : String(why)
    const keyless = why?.notRechecked === true && !aKeyCameFromTheHost && theAgentKey() === null
    refuse(keyless ? `${words} This start holds no key to recheck the row with: no run key came from the host, and this helper holds no MOLE_AGENT_KEY.` : words, 2)
  }
}

// WITH --clone, FROM ONE OF THE TEMPLATE'S OTHER CLONES, as up recorded it (theCloneNamed in tools/sandbox-common.mjs), cut
// from that clone's own branch unless --cut-from says otherwise.
let theClone = null
if (mode === 'agent' && chosen.clone !== undefined) {
  try {
    theClone = theCloneNamed(instance, chosen.clone)
  } catch (why) {
    refuse(why instanceof Error ? why.message : String(why), 2)
  }
}
const cutFrom = mode === 'agent' ? (chosen['cut-from'] ?? (theClone === null ? instance.ref : theClone.ref) ?? null) : null
if (mode === 'agent' && (typeof cutFrom !== 'string' || cutFrom === '')) {
  refuse('Say which branch the worktree was cut from: --cut-from <branch>. The instance does not say either. Nothing was started.', 2)
}
// A RUN GIVEN NO --worktree works in the folder of its --clone, or else, when this helper files it, in the agent's own
// worktree, never in the shared checkout whose main every start moves. A run the host filed keeps the folder it had.
function theFolderOfARunGivenNone() {
  if (theClone !== null) return join(instanceDir, theClone.name)
  if (chosen.filed !== undefined) return join(instanceDir, 'repo')
  const own = theAgentsOwnWorktree(instanceDir, chosen.agent)
  say(`the run was given no --worktree, so it works in its own worktree, ${own}.`)
  return own
}
const worktree = mode === 'agent' ? aWorktree(chosen.worktree ?? theFolderOfARunGivenNone(), cutFrom) : null
const cwd = chosen.cwd !== undefined ? aDirectory(chosen.cwd, '--cwd') : (worktree ?? join(instanceDir, 'repo'))

let command = chosen.command
if (command.length === 0 && mode === 'agent' && chosen.runtime === 'dsh' && chosen.brief !== undefined) {
  command = null // decided below, once the run has an id: run-agent.sh takes it as an argument
} else if (command.length === 0) {
  usage('Say what to run, after --. Only an agent run with --runtime dsh and --brief has a command of its own.')
}
if (chosen.brief !== undefined && (!isAbsolute(chosen.brief) || !existsSync(chosen.brief))) {
  refuse(`--brief must be an absolute path to a file this sandbox can read, and "${chosen.brief}" is not one. Nothing was started.`)
}

// ============================================================================ 1. the run

/** Mark a run this helper filed as never started, with the reason, so it does not read as running. */
async function theRunNeverStarted(runId, why) {
  const said = await askTheOffice(api, `/api/records/${encodeURIComponent(runId)}`, {
    method: 'PATCH',
    headers: aboutTheRun(starterSession),
    body: { dataPatch: { state: 'crashed', detail: `It never started in sandbox ${instance.instance}: ${why}` } },
  })
  if (said.status !== 200) {
    say(`the run ${runId} was filed but never started, and it could not be marked so (${theOfficeSaid(said)}). It still says running.`)
  }
}

/**
 * A RUN AN AGENT IN HERE STARTS IS FILED HERE, through fileARun in tools/file-a-run.mjs, the launcher's one filing
 * function (an ask), which tools/sandbox.mjs calls on the host for the runs it starts. It
 * is filed with the starter's name and session, the starter's key when this process holds one (the key of the run
 * the starter is in), and the run's sandbox field. With `--continues <run id>` (a second round) the new run is filed
 * with a `derived_from` link to the run it continues, in the same request. With `--flow <flow id>` the run names the
 * flow it follows, and the flow run the office files beside it names that flow; without it nothing is refused. Answers the new run's id and its own key,
 * or null for the key when the office answered none; or refuses, and nothing is started.
 */
function fileTheRun() {
  const filed = fileARun({
    api,
    workspace,
    as: starter,
    session: starterSession,
    handle: chosen.agent,
    worktree,
    cutFrom,
    runtime: chosen.runtime,
    model: runModel,
    title: chosen.title ?? A_RUN_GIVEN_NO_TITLE,
    sandbox: sandboxField,
    ...(chosen.brief === undefined ? {} : { brief: chosen.brief }),
    continues: chosen.continues ?? null,
    flow: chosen.flow ?? null,
  })
  if (!filed.ok) {
    if (filed.says !== '') process.stderr.write(`${filed.says}\n`)
    refuse(`the run could not be filed (tools/register-a-run.mjs exited ${filed.exited}), so nothing was started.`)
  }
  return { id: filed.id, key: filed.key }
}

let run = null
/** The run's own key (see the header), or null because the office answered none. */
let runKey = null
/** Where a `--run` names an already-filed run's own worktree and cut, read off its record below, for finishing it once its command ends. */
let runWorkingDirectory = null
let runCutFrom = null
/** With --run: the agent the run record says serves it, or null when it names none. */
let runServingAgent = null
/** Read the runtime from --agent or the existing --run record, never from a shell's words. */
let runRuntime = mode === 'agent' ? chosen.runtime : null
let opencode = null
function prepareThisOpenCodeRun() {
  try {
    if (prepareOpenCodeRunHome(join(instanceDir, 'home'), aCommandsRuntime(command ?? [], runRuntime)) !== null) opencode = OPENCODE_RUN_HOME_NOTICE
  } catch (why) { refuse(why instanceof Error ? why.message : String(why)) }
}
// Every start refreshes the runtime's tools from this sandbox's repo, including direct helper starts.
const preparedRuntime = aCommandsRuntime(command ?? [], runRuntime)
if (preparedRuntime === 'claude-code') {
  const hooks = prepareClaudeRunHome(join(instanceDir, 'home'), join(instanceDir, 'repo'))
  if (hooks !== null) say(hooks, true)
}
// THE HARNESS'S OWN SUBAGENTS AND WORKFLOWS OFF IN THE HOME as well, for Claude Code and Codex at every start, so a
// harness started inside a shell's words, which the switch below cannot reach, has them off too
// (tools/harness-features-off.mjs).
try {
  for (const sentence of theHarnessFeaturesOffInAHome(join(instanceDir, 'home'))) say(sentence, true)
} catch (why) { refuse(why instanceof Error ? why.message : String(why)) }
if (preparedRuntime === 'dsh') {
  const { installOfficeProfile } = await import('./dsh-hooks/install-profile.mjs')
  installOfficeProfile(join(instanceDir, 'dsh/home'), join(instanceDir, 'repo'))
}
// Direct helper starts prepare before filing a run or a process row. The host may already have done it.
if (mode !== 'run') prepareThisOpenCodeRun()
if (mode === 'agent' && chosen.filed !== undefined) {
  run = chosen.filed
  runKey = theKeyTheHostGave
} else if (mode === 'agent') {
  const filed = fileTheRun()
  run = filed.id
  runKey = filed.key
} else if (mode === 'run') {
  const read = await askTheOffice(api, `/api/records/${encodeURIComponent(chosen.run)}`, { workspace, headers: headers(starterSession) })
  if (read.status !== 200) refuse(`the run ${chosen.run} could not be read (${theOfficeSaid(read)}). Nothing was started.`)
  const record = read.body?.record ?? read.body
  if (record?.kind !== 'session') refuse(`${chosen.run} is a ${record?.kind ?? 'record of no kind'}, not a run. Nothing was started.`)
  runRuntime = record.data?.runtime ?? null
  checkCodexBeforeFiling(runRuntime)
  prepareThisOpenCodeRun()
  runModel = record.data?.model ?? runModel
  runWorkingDirectory = typeof record?.data?.workingDirectory === 'string' ? record.data.workingDirectory : null
  runCutFrom = typeof record?.data?.cutFrom === 'string' ? record.data.cutFrom : null
  runServingAgent = typeof record?.data?.servingAgent === 'string' && record.data.servingAgent !== '' ? record.data.servingAgent : null
  const already = record?.data?.sandbox
  if (already === undefined || already === null) {
    const wrote = await askTheOffice(api, `/api/records/${encodeURIComponent(chosen.run)}`, {
      method: 'PATCH',
      headers: headers(starterSession),
      body: { dataPatch: { sandbox: sandboxField } },
    })
    if (wrote.status !== 200) refuse(`the run's sandbox field could not be written (${theOfficeSaid(wrote)}). Nothing was started.`)
  } else if (already.template !== sandboxField.template || already.container !== sandboxField.container) {
    refuse(
      `the run ${chosen.run} already says it happens in ${JSON.stringify(already)}, and this sandbox is ` +
        `${JSON.stringify(sandboxField)}. A run is in one sandbox; file a new run for this one. Nothing was started.`,
    )
  }
  if (runServingAgent === null) {
    say(`the run ${chosen.run} names no agent it serves, so no doing line was made.`)
  } else {
    const written = await writeTheDoingLineIfTheRunHasNone(
      api,
      workspace,
      headers(starterSession),
      chosen.run,
      record?.data ?? {},
      theDoingLineOfARun(runServingAgent, record?.title ?? A_RUN_GIVEN_NO_TITLE, chosen.brief),
    )
    // A doing line written or kept is a launch detail. One the office refused is said aloud: the run starts without it.
    say(written.says, written.written || written.kept)
  }
  run = chosen.run
}
/** The session the process row belongs to: the run's, or for the caller's own command, the caller's. */
const owner = run ?? starterSession
// THE COMMAND OF A RUN IS THAT RUN'S AGENT, whatever the caller's shell says. Acceptance finding 53
// (block f-53): a caller resumed a supervisor with --run from a shell that carried
// the caller's own MOLE_OFFICE_AGENT, the command got the caller as its agent, and the run it started next was written down as
// the caller's. The caller's own identity is only for this launcher's own writes. A run that names no agent that
// serves it gets no agent identity at all: never the caller's.
const servedAgent = mode === 'agent' ? chosen.agent : mode === 'run' ? runServingAgent : starter

/**
 * THE HEADERS OF A CALL ABOUT THE RUN (see the header). With the run's own key: the served agent's name, the run as the
 * session, and that key. Without one: the starter's name with the given session and no key, as before.
 */
function aboutTheRun(session) {
  return runKey !== null ? officeHeaders({ workspace, agent: servedAgent, session: run, key: runKey }) : headers(session)
}

if (mode === 'agent') {
  try {
    const branch = theWorktreesBranchAfterFiling(madeWorktree, run)
    if (branch !== null) say(branch, true)
  } catch (why) {
    const words = why instanceof Error ? why.message : String(why)
    await theRunNeverStarted(run, words)
    refuse(words)
  }
}

if (mode === 'agent') {
  say(
    runKey !== null
      ? `run ${run} holds a key of ${chosen.agent} of its own: this helper's calls about it and its command prove themselves with it, and the office revokes it when the run ends.`
      : `run ${run} holds no key of its own (the office answered none), so this helper's calls about it go with ${starter}'s name and no key, as before.`,
    runKey !== null,
  )
}

// A RUN THE HOST FILED IS READ BEFORE ANYTHING STARTS, as the run: it must be a running session record of this agent,
// in this worktree, in this sandbox. Anything else is refused, and the launcher on the host marks it never started.
if (mode === 'agent' && chosen.filed !== undefined) {
  const read = await askTheOffice(api, `/api/records/${encodeURIComponent(run)}`, { workspace, headers: aboutTheRun(starterSession) })
  if (read.status !== 200) refuse(`the run ${run} the host filed could not be read (${theOfficeSaid(read)}). Nothing was started.`)
  const record = read.body?.record ?? read.body
  const data = record?.data ?? {}
  const wrong =
    record?.kind !== 'session'
      ? `it is a ${String(record?.kind ?? 'record of no kind')}, not a run`
      : data.state !== 'running'
        ? `it says ${String(data.state)}, not running`
        : data.servingAgent !== chosen.agent
          ? `it serves ${JSON.stringify(data.servingAgent ?? null)}, not ${chosen.agent}`
          : data.workingDirectory !== worktree
            ? `it works in ${JSON.stringify(data.workingDirectory ?? null)}, not ${worktree}`
            : data.sandbox?.template !== sandboxField.template || data.sandbox?.container !== sandboxField.container
              ? `it says it happens in ${JSON.stringify(data.sandbox ?? null)}, and this sandbox is ${JSON.stringify(sandboxField)}`
              : null
  if (wrong !== null) refuse(`--filed ${run} is not a run this helper can start here: ${wrong}. Nothing was started.`)
  const written = await writeTheDoingLineIfTheRunHasNone(
    api,
    workspace,
    aboutTheRun(starterSession),
    run,
    data,
    theDoingLineOfARun(chosen.agent, record?.title ?? A_RUN_GIVEN_NO_TITLE, chosen.brief),
  )
  // As for --run above: written or kept is a launch detail, and a refused write is said aloud.
  say(written.says, written.written || written.kept)
}

// ============================================================================ 2. the gate

/** A folder of its own under logs/, named after the run, with a number added if it is taken. */
function aLogFolder() {
  // THE ONE FILE-NAME FORM, src/shared/time.ts (acceptance finding 63). A name, not a stamp anything reads back as a
  // moment, so it has no offset: in a container still on UTC it names UTC's hour, and it still sorts and is unique.
  const stamp = fileNameStamp(new Date())
  const hostLogs = process.env['SANDBOX_LAUNCH_LOGS'] ?? null
  if (hostLogs !== null && dirname(resolve(hostLogs)) !== join(resolve(instanceDir), 'logs')) {
    refuse(`SANDBOX_LAUNCH_LOGS is outside this sandbox's logs folder. Nothing was started.`, 2)
  }
  if (run !== null && !/^[A-Za-z0-9_-]+$/.test(run)) refuse(`${run} is not a run id that can name a folder. Nothing was started.`, 2)
  const base = run ?? (hostLogs === null ? `cmd-${stamp}` : basename(hostLogs))
  for (let n = 1; ; n += 1) {
    const dir = join(instanceDir, 'logs', n === 1 ? base : `${base}-${n}`)
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
      return dir
    }
    // The host can have written a warning before this helper starts the command.
    if (existsSync(join(dir, 'launch.txt')) && readdirSync(dir).every((name) => name === 'launch.txt')) return dir
  }
}
const logs = aLogFolder()
launchDetails = run === null ? join(logs, 'launch.txt') : join(instanceDir, 'logs', run, 'launch.txt')
mkdirSync(dirname(launchDetails), { recursive: true })
appendFileSync(launchDetails, launchLines.slice(launchDetails === earlyLaunchDetails ? earlyLineCount : 0).join(''))
launchLines.length = 0
const outPath = join(logs, 'out')

/**
 * THE SWEEP OF OLD RUNS' SCRATCH FOLDERS IN THIS CONTAINER (tools/sweep-run-scratch.mjs) STARTS ONLY AFTER THE COMMAND'S GO,
 * so the command never waits for it. On 22 October 2026 the sweep ran before every command and held the live office while
 * it asked, and one run's command waited about 10 minutes to start. The sweep now pauses between its office asks, so it
 * may still be going when the command ends; this helper waits for it before it exits. An error is one line in finish.log,
 * and nothing here changes the command's exit or the run's state. This run's own folder is in use, so it is left out.
 */
async function theScratchSweep() {
  try {
    const { sweepRunScratch } = await import('./sweep-run-scratch.mjs')
    // THE SWEEP ASKS WITH THIS RUN'S OWN KEY when the helper holds one and the folder is of this project: after the key window
    // closes the starter's key stays on the host, and a keyless read as the starter is refused, which kept every folder. Every
    // ask is a read (the run's record, the named-inside check, the search); nothing is written with the key here. Once the
    // run's finish revokes the key, what the sweep still asks is refused, and a refused check keeps the folder.
    await sweepRunScratch({ instanceDir, workspace, ownRun: run,
      ask: (path, project) => askTheOffice(api, path, {
        headers: runKey !== null && project === workspace ? aboutTheRun(owner) : officeHeaders({ workspace: project, agent: starter, session: starterSession }),
      }) })
  } catch (error) {
    appendFileSync(join(logs, 'finish.log'), `Scratch sweep could not finish: ${error instanceof Error ? error.message : String(error)}; unchecked folders stay.\n`)
  }
}

/**
 * A RUN'S OWN SCRATCH FOLDER, made now in the container's temporary folder and named after the run:
 * every worker of one sandbox runs in the same container, so /tmp was one folder for all of them, and on
 * 24 September one worker read another's report where it had written its own. Programs that ask for a temporary folder
 * (mktemp, node's os.tmpdir, Python's tempfile) read TMPDIR. It is kept short on purpose: a Unix socket's path may not
 * pass 107 bytes, and browsers and tools make sockets in it, so it is not put in the instance's log folder, whose path
 * is long. A command started with no run, the caller's own or a build, keeps the container's temporary folder, as
 * before. The helper takes the folder back while it is empty on a refusal (takeBackTheScratchFolder). Once the run's
 * command has ended, theScratchFolderAfterTheRun removes it when it is empty, or when the run finished, after its checks. A
 * path a program writes as /tmp/<name> by hand still meets the others'; the briefs say where scratch files go.
 */
function aScratchFolder() {
  theScratchFolderMade = mkdtempSync(join(tmpdir(), `${run}-`))
  const made = lstatSync(theScratchFolderMade)
  theScratchFolderAsMade = { real: realpathSync(theScratchFolderMade), parent: realpathSync(tmpdir()), dev: made.dev, ino: made.ino }
  // AN ERROR NOBODY EXPECTED, BETWEEN HERE AND THE COMMAND'S GO, TAKES IT BACK TOO: a refusal takes it back
  // itself, but a throw left it. Node runs exit listeners on an uncaught error and
  // on a rejected top-level await as on any other exit. The listener comes off when the command is told to go, because
  // from then on the gate's exit takes the folder back, and a helper that died while its command ran must not take the
  // folder from under that command.
  process.once('exit', takeBackTheScratchFolder)
  if (THROWS_AFTER_THE_SCRATCH_FOLDER) {
    throw new Error(`an error nobody expected, after the scratch folder ${theScratchFolderMade} was made, which a test asked for`)
  }
  return theScratchFolderMade
}

if (command === null) {
  command = [
    'bash',
    join(HERE, 'dsh-hooks', 'run-agent.sh'),
    worktree,
    chosen.brief,
    join(logs, 'dsh.log'),
    chosen.agent,
    run,
    workspace,
  ]
}

// THE COMMAND'S ENVIRONMENT: what this helper was given, with the run's identity in place of the
// starter's, the git identity of the agent it serves (the instance's clone has no user of its own), and
// without the starter's key. The git name is the agent's handle; the address is the office's one
// commit address, MOLE_OFFICE_COMMIT_EMAIL (the owner's rule of 22 September 2026).
// With --plain-env, the container's own environment and nothing of the launcher's (see the header).
const childEnv = { ...process.env }
delete childEnv['SANDBOX_LAUNCH_LOGS']
delete childEnv['SANDBOX_DSH_SELECTION']
delete childEnv['SANDBOX_PROVIDER_ROUTER']
delete childEnv['MOLE_AGENT_KEY']
delete childEnv['MOLE_AGENT_KEY_FILE']
// Nor the starter's office tool configuration, which holds the starter's key: a command gets only its
// own run's file, written below.
delete childEnv[OFFICE_TOOL_CONFIGURATION]
// A RUN'S COMMAND HOLDS THE RUN'S OWN KEY when the run has one (see the header): its agent proves itself with it, and
// the office revokes it when the run ends. Never the starter's key.
if (runKey !== null && !PLAIN) childEnv['MOLE_AGENT_KEY'] = runKey
if (PLAIN) {
  for (const name of THE_LAUNCHERS_VARIABLES) delete childEnv[name]
} else {
  Object.assign(childEnv, {
    SANDBOX_DIR: instanceDir,
    // THE FACTS THIS HELPER WAS GIVEN, passed on as they came and under the same name, so a start from inside the
    // command is given what this one was (see the header).
    [THE_FACTS_VARIABLE]: theFactsGiven,
    MOLE_OFFICE_API: api,
    // THE ADDRESS IS FOR THIS SANDBOX'S OWN CHECKOUTS: a copy of the office's tools that is no git checkout in this
    // folder (an installed office's bundle, a kit copied elsewhere) must say which office it means with --api
    // (theEnvironmentsAddressIsForAnotherCopy in src/config/settings.mjs).
    MOLE_OFFICE_API_ROOT: instanceDir,
    MOLE_OFFICE_WORKSPACE: workspace,
    MOLE_OFFICE_SESSION: owner,
    ...(servedAgent === null
      ? {}
      : {
          MOLE_OFFICE_AGENT: servedAgent,
          // THE SAME IDENTITY AN ISOLATED RUN GETS, from the one function in tools/sandbox-common.mjs.
          ...(theGitIdentity(servedAgent, commitAddress).env ?? {}),
        }),
    // THE INSTANCE'S OWN dsh FOLDER, for every command in a sandbox that has one, not only a new dsh run (acceptance
    // finding 68): a second round in the same run is started with --run, and without this its run-agent.sh fell back to
    // the host's folder, which is not in the container, and ended at once with exit 127. The folder is inside the
    // instance, which the sandbox reads anyway, so naming it to any command shows nothing new.
    ...(existsSync(join(instanceDir, 'dsh')) ? { MOLE_OFFICE_DSH_DIR: join(instanceDir, 'dsh') } : {}),
    // A RUN'S OWN SCRATCH FOLDER (aScratchFolder above), which start.json names.
    ...(run === null ? {} : { TMPDIR: aScratchFolder() }),
  })
  if (servedAgent === null) {
    for (const name of ['MOLE_OFFICE_AGENT', 'GIT_AUTHOR_NAME', 'GIT_AUTHOR_EMAIL', 'GIT_COMMITTER_NAME', 'GIT_COMMITTER_EMAIL']) delete childEnv[name]
    say(`the run ${String(run)} names no agent that serves it, so its command gets no agent identity, and not the caller's.`)
  }
}

let startValues
try {
  const given = await theStartValuesHere(command, { api, agent: servedAgent ?? starter, workspace, headers: aboutTheRun(owner), runtime: runRuntime, model: runModel, env: childEnv, envFrom: WHERE_THE_START_VALUES_CAME_FROM })
  command = given.command
  Object.assign(childEnv, given.env)
  startValues = given.start
  if (given.start?.selection !== undefined && run !== null) {
    const before = await askTheOffice(api, `/api/records/${encodeURIComponent(run)}`, {headers:aboutTheRun(owner)})
    if (before.status !== 200) throw new Error('The selected run could not be read before recording its native selection. Nothing was started.')
    const record = before.body?.record ?? before.body
    const wrote = await askTheOffice(api, `/api/records/${encodeURIComponent(run)}`, {method:'PATCH',headers:aboutTheRun(owner),body:{dataPatch:{extra:{...(record.data?.extra ?? {}),launcherSelection:given.start.selection}}}})
    if (wrote.status !== 200) throw new Error('The native selection could not be recorded on its run. Nothing was started.')
  }
  if (given.start?.runtime === 'dsh' && given.start.model !== null) {
    childEnv.MOLE_OFFICE_AGENT_MODEL = given.start.model
    let nativeAt = 0
    if (basename(command[0] ?? '') === 'env') {
      nativeAt = 1
      while (/^[A-Za-z_][A-Za-z0-9_]*=/.test(command[nativeAt] ?? '')) nativeAt++
    }
    if (basename(command[nativeAt] ?? '') === 'dsh') {
      const patch = await prepareDshSettings({ model: given.start.model, effort: given.start.requestedEffort, selection: given.start.selection,
        dshDir: join(instanceDir, 'dsh'), scratch: childEnv.TMPDIR ?? aScratchFolder(), env: childEnv })
      childEnv.DSH_HOME = join(instanceDir, 'dsh/home')
      const delimiter = command.indexOf('--', nativeAt)
      command.splice(delimiter === -1 ? command.length : delimiter, 0, '--patch', patch)
    }
  }
} catch (why) {
  const words = why instanceof Error ? why.message : String(why)
  if (mode === 'agent') await theRunNeverStarted(run, words)
  refuse(words, 2)
}
const unappliedDshSelection = startValues?.runtime === 'dsh' && Object.hasOwn(startValues, 'requestedModel')
if (unappliedDshSelection) delete childEnv.MOLE_OFFICE_AGENT_MODEL
// Keep the start explanation when the helper later records how the command ended.
const withStartExplanation = detail => unappliedDshSelection ? `${detail}\n${startValues.words}` : detail
if (startValues !== null && (startValues.effort !== null || unappliedDshSelection) && run !== null) {
  const wrote = await askTheOffice(api, `/api/records/${encodeURIComponent(run)}`, {
    method: 'PATCH', headers: aboutTheRun(owner),
    body: { dataPatch: { effort: startValues.effort, ...(unappliedDshSelection ? { detail: startValues.words } : {}) } },
  })
  if (wrote.status !== 200) refuse(`The run's effort could not be recorded (${theOfficeSaid(wrote)}). Nothing was started.`)
}

// EVERY AGENT TOOL IN A SANDBOX RUNS WITH ITS FULL PERMISSIONS, and this is
// the launcher that says a run is in one: it writes the run's sandbox field, and SANDBOX_DIR above.
// So the command's environment gets every tool's environment part (OpenCode's, dsh's), which reaches
// a tool started anywhere below it, and a command whose program is Claude Code or Codex gets that
// tool's arguments right after the program's name. What is added, and the words, are worked out in
// src/config/run-permissions.mjs; start.json and the line below show the command as it runs.
// Plain Codex commands keep their permission argv; --plain-env gets none of these additions.
if (!PLAIN) {
  try {
    const permitted = aCommandsPermissions(command, childEnv, { plain: mode === 'own' })
    command = permitted.command
    for (const [name, value] of Object.entries(permitted.env)) {
      if (value === null) delete childEnv[name]
      else childEnv[name] = value
    }
    for (const sentence of permitted.says) say(sentence, true)
    // LAST, so nothing added above puts one back: the office's own variables out, and nothing else.
    if (NO_OFFICE) {
      const others = takeOutTheOfficesVariables(childEnv)
      say(`--no-office-variables: the command gets no ${THE_OFFICES_VARIABLES.join(', ')}, so it cannot reach an office unless it names one itself.`, true)
      if (others.length > 0) say(`--no-office-variables: nor ${others.join(', ')}, since no MOLE_OFFICE_ name reaches such a command.`, true)
    }
  } catch (why) {
    const said = why instanceof Error ? why.message : String(why)
    if (mode === 'agent') await theRunNeverStarted(run, said)
    refuse(`${said} The command never ran.`)
  }
}
/**
 * A DSH RUN THAT STARTS THROUGH tools/dsh-hooks/run-agent.sh WITH bash: the script is the word after bash, and the
 * script's second argument is the brief, as the command built above passes them. Null for every other command.
 * @param {readonly string[]} command
 */
function aDshRunnerItsBriefAndWhere(command) {
  let at = 0
  if (String(command[0] ?? '').split('/').pop() === 'env') {
    at = 1
    while (/^[A-Za-z_][A-Za-z0-9_]*=/.test(command[at] ?? '')) at += 1
  }
  if (String(command[at] ?? '').split('/').pop() !== 'bash') return null
  const script = command[at + 1]
  const brief = command[at + 3]
  if (typeof script !== 'string' || basename(script) !== 'run-agent.sh' || typeof brief !== 'string' || brief === '') return null
  return { script, brief, briefAt: at + 3 }
}

/** The text of a file the switch must read, with a refusal naming the file when it cannot be read. */
function theTextTheSwitchReads(file, what) {
  try {
    return readFileSync(file, 'utf8')
  } catch (why) {
    throw new Error(`${what} ${file} could not be read: ${why instanceof Error ? why.message : String(why)} Nothing was started.`)
  }
}

/**
 * THE BRIEF A DSH RUN THROUGH tools/dsh-hooks/run-agent.sh IS GIVEN: the starting words for whether its runner puts the
 * switch in, then a blank line, ---, a blank line and the brief's own text. A brief that already begins with either
 * chapter is passed on unchanged, so its words are never doubled. The new file goes in this run's log folder with mode
 * 0600, and its path replaces the brief's word in the command.
 */
function theBriefItsDshRunnerIsGiven(command, runner, givesThePatch) {
  const text = theTextTheSwitchReads(runner.brief, 'The brief')
  if (text.startsWith(THE_STARTING_WORDS) || text.startsWith(THE_STARTING_WORDS_WITHOUT_THE_SWITCH)) return command
  const words = givesThePatch ? THE_STARTING_WORDS : THE_STARTING_WORDS_WITHOUT_THE_SWITCH
  const file = join(logs, `${fileNameStamp(new Date())}-${randomBytes(3).toString('hex')}-starting-words.md`)
  try {
    writeFileSync(file, `${words}\n\n---\n\n${text}`, { flag: 'wx', mode: 0o600 })
  } catch (why) {
    throw new Error(`The brief for the runner ${runner.script} could not be written at ${file}: ${why instanceof Error ? why.message : String(why)} Nothing was started.`)
  }
  return command.map((word, at) => (at === runner.briefAt ? file : word))
}

// THE HARNESS'S OWN SUBAGENTS AND WORKFLOWS OFF (tools/harness-features-off.mjs): each runtime's switch, right after its
// program's name or, for OpenCode, in its config. A --plain-env command gets it too: it is kept from the launcher's
// variables, and a harness program started that way still has them off. A build's or a suite's program gets nothing. A
// dsh run through its own run-agent.sh is a shell command whose script says whether it puts the switch in: the run is
// told the truth about that, and its brief begins with the chapter that is true of it.
try {
  const runtimeHere = aCommandsRuntime(command, runRuntime)
  const dshRunner = runtimeHere === 'dsh' ? aDshRunnerItsBriefAndWhere(command) : null
  const runnerGivesThePatch = dshRunner === null ? false : aRunnerGivesDshThePatch(theTextTheSwitchReads(dshRunner.script, 'The runner'))
  if (dshRunner !== null) command = theBriefItsDshRunnerIsGiven(command, dshRunner, runnerGivesThePatch)
  const off = aCommandWithTheHarnessFeaturesOff(command, childEnv, runtimeHere)
  command = off.command
  Object.assign(childEnv, off.env)
  if (dshRunner !== null && runnerGivesThePatch) {
    say(`The runner ${dshRunner.script} gives dsh the patch that turns the harness's own subagents and workflows off, so this run has them off.`)
  } else {
    for (const sentence of off.says) say(sentence)
  }
} catch (why) {
  const said = why instanceof Error ? why.message : String(why)
  if (mode === 'agent') await theRunNeverStarted(run, said)
  refuse(said)
}

// A recorded decision gives every Codex run
// with its office identity the office_request MCP server. Only variable names go into the overrides.
// shell_environment_policy keeps the key out of a worker's model commands;
// --starts-runs keeps it there. Codex itself keeps the key for env_vars to
// forward to office_request. The policy goes with the MCP overrides, after exec/e when present.
// --plain-env gets no overrides.
// A CODEX RUN'S OUTPUT FILE IS NAMED TO ITS OFFICE TOOL, which reads the thread's own rollout from it at the run's seal
// (THE_RUN_OUTPUT in src/config/run-permissions.mjs). Only a run's own file, and only when the
// output is kept; --no-office-variables lets no office name through.
delete childEnv[THE_RUN_OUTPUT]
if (!PLAIN && !WAIT && !NO_OFFICE && run !== null && aCommandsProgram(command).isCodex) childEnv[THE_RUN_OUTPUT] = outPath
const withOfficeTool = aCommandsOfficeTool(command, childEnv, { plainEnv: PLAIN, startsRuns: chosen['starts-runs'] === true })
command = withOfficeTool.command
for (const sentence of withOfficeTool.says) say(sentence, true)

// WHERE THE CONFIGURATION LIES. It holds the run's key, so it goes in a folder made for it alone (mkdtemp, mode 700) in
// this helper's temporary directory, which the command can read: never under logs/, which people and tools read after
// the run and which must hold no key (tests/a-sandbox-run-holds-its-own-key.test.ts, case 1), and never in a worktree,
// where git could take it. The folder goes with the command. Asked first with a name only, so that a command that gets
// no configuration makes no folder.
const officeToolOptions = { plainEnv: PLAIN, startsRuns: chosen['starts-runs'] === true }
let withClaudeOfficeTool = aClaudeCommandsOfficeTool(command, childEnv, 'office-mcp.json', officeToolOptions)
if (withClaudeOfficeTool.configuration !== null) {
  const claudeConfigurationPath = join(mkdtempSync(join(tmpdir(), 'office-mcp-')), 'office-mcp.json')
  withClaudeOfficeTool = aClaudeCommandsOfficeTool(command, childEnv, claudeConfigurationPath, officeToolOptions)
  theOfficeMcpConfiguration = claudeConfigurationPath
  // Before go, refusals and unexpected exits remove the folder too; after go the gate's exit does.
  process.once('exit', takeBackTheOfficeMcpConfiguration)
  writeFileSync(claudeConfigurationPath, `${JSON.stringify(withClaudeOfficeTool.configuration)}\n`, { mode: 0o600, flag: 'wx' })
  command = withClaudeOfficeTool.command
  for (const [name, value] of Object.entries(withClaudeOfficeTool.env)) {
    if (value === null) delete childEnv[name]
    else childEnv[name] = value
  }
  for (const sentence of withClaudeOfficeTool.says) say(sentence, true)
} else {
  // Wave 13n, item 2h: A CODEX OR dsh RUN'S SHELL gets no MOLE_AGENT_KEY, so a tool it runs reads the
  // run's key from a file of the same kind, in a folder of its own, which goes the same way.
  const shellOptions = { ...officeToolOptions, runtime: aCommandsRuntime(command, runRuntime) }
  if (aShellsOfficeToolFile(command, childEnv, 'office-tool.json', shellOptions).configuration !== null) {
    const shellConfigurationPath = join(mkdtempSync(join(tmpdir(), 'office-tool-')), 'office-tool.json')
    const withShellsOfficeTool = aShellsOfficeToolFile(command, childEnv, shellConfigurationPath, shellOptions)
    theOfficeMcpConfiguration = shellConfigurationPath
    process.once('exit', takeBackTheOfficeMcpConfiguration)
    writeFileSync(shellConfigurationPath, `${JSON.stringify(withShellsOfficeTool.configuration)}\n`, { mode: 0o600, flag: 'wx' })
    Object.assign(childEnv, withShellsOfficeTool.env)
    for (const sentence of withShellsOfficeTool.says) say(sentence, true)
  }
}
// A RUN NAMED WITH --run HAS NO KEY HERE (see where runKey is set), so nothing in its command can send a use line under it.
if (run !== null && runKey === null) {
  say(`The run ${run} was named with --run, and the host gives a run's key only to the start that filed it (--filed). So this run's command and its shell hold no key of the run's, and a tool's use line from its shell is not sent: tools/use-line.mjs prints the body to send through office_request instead.`)
}
// The inspector's note: this flag has no effect on another program; say so.
const { program, isCodex } = aCommandsProgram(command)
if (chosen['starts-runs'] === true && !isCodex && program !== 'claude') {
  say(`--starts-runs changes nothing for a ${program} command: only Codex and Claude Code commands have their key taken out of their shell.`)
}
if (runRuntime === 'claude-code' && program !== 'claude') {
  say(`This claude-code run starts ${program}, so the launcher cannot give it office_request without rewriting a shell's words; start the worker with --cwd <worktree> -- claude -p --model <model> "<the brief's text>" instead, since --agent already sets MOLE_OFFICE_AGENT.`)
}

// A CLAUDE CODE COMMAND WITH NO LOGIN IS REFUSED BEFORE IT STARTS. Acceptance finding 47
// (block f-47), on a decision of 23 September 2026: Claude Code
// takes its own login out of every command its Bash tool runs, so a Claude Code worker started from inside a
// Claude Code session starts logged out. In sandbox w3 it printed "Not logged in", was marked crashed, and
// its supervisor then handled the token itself. Such a worker is started from the host instead
// (tools/sandbox.mjs exec gives it the login from the secrets file), and this says so before anything runs.
// A command is Claude Code when its run's runtime says so or when its program is `claude`; the login is
// looked for wherever Claude Code reads one, so a sandbox that signs in another way is not refused.
const STARTS_CLAUDE_CODE = (mode === 'agent' && chosen.runtime === 'claude-code') || String(command[0] ?? '').split('/').pop() === 'claude'
if (STARTS_CLAUDE_CODE && !aClaudeCodeLogin(childEnv)) {
  const said =
    'A Claude Code worker cannot be started from inside a Claude Code session, because Claude Code removes its login ' +
    'from the commands it runs; ask the secretary to start it from the host with tools/sandbox.mjs exec. This command ' +
    `has none of ${CLAUDE_CODE_LOGINS.join(', ')}, and there is no ${theCredentialsFile(childEnv) ?? 'home to hold a credentials file'}.`
  if (mode === 'agent') await theRunNeverStarted(run, said)
  refuse(`${said}${mode === 'agent' ? ` Run ${run} is marked as never started.` : ''} The command never ran.`)
}
// EVERY OPENCODE COMMAND ASKS FOR UP TO 64,000 OUTPUT TOKENS A STEP, as a check does (tools/opencode-output-cap.mjs;
// 19 October 2026). OpenCode 1.18.31 otherwise asks for 32,000 at most, and a step that thinks that long ends with no answer.
// A run, a named agent's command and a plain command alike; a Codex or Claude command is given nothing. A start with start
// values says so in its words.
if (aCommandsRuntime(command, runRuntime) === 'opencode') {
  Object.assign(childEnv, OPENCODE_OUTPUT_CAP)
  if (startValues !== null) startValues.words = `${startValues.words}; ${THE_OUTPUT_CAP_WORDS}`
}
/**
 * OPENCODE_CONFIG_CONTENT with one more plugin, the file of that name in tools/, or null when the content is no JSON object
 * with a plugin list. Such content is left as it is, and the caller says what the command goes without.
 * @param {string | undefined} content @param {string} file
 */
function withAnOpenCodePlugin(content, file) {
  let config = null
  try { config = JSON.parse(content ?? '{}') } catch { config = null }
  const plugins = config !== null && typeof config === 'object' && !Array.isArray(config) ? (config.plugin ?? []) : null
  return Array.isArray(plugins) ? JSON.stringify({ ...config, plugin: [...plugins, new URL(`./${file}`, import.meta.url).href] }) : null
}
// AN OPENCODE AGENT'S COMMANDS DO NOT SEE THE PROVIDER KEYS (round 57). Every
// OpenCode command is given tools/opencode-shell-without-provider-keys-plugin.mjs, which takes the keys out of each
// command OpenCode's bash tool runs; OpenCode keeps them, so it still reaches its model. A --plain-env command gets it too,
// as it gets the harness's features off. A check runs OpenCode with --pure, which loads no plugin, so a check's commands
// still see its key (the plugin's own comment says what closes that).
if (aCommandsRuntime(command, runRuntime) === 'opencode') {
  const content = withAnOpenCodePlugin(childEnv['OPENCODE_CONFIG_CONTENT'], 'opencode-shell-without-provider-keys-plugin.mjs')
  if (content !== null) childEnv['OPENCODE_CONFIG_CONTENT'] = content
  else say("OPENCODE_CONFIG_CONTENT holds no JSON object with a plugin list, so this command is not given the plugin that keeps the provider keys out of its shell: the commands OpenCode runs see them.")
}
// EACH NAMED AGENT'S OPENCODE RUNS KEEP THEIR OWN DATABASE FILE (theOpenCodeDatabaseOf in tools/sandbox-common.mjs). A round
// runs on the file the host found its session in, given as --opencode-database. A plain command and a start of a run
// already filed (--run) are given nothing here and keep OpenCode's default file; an isolated run never comes here.
if (aCommandsRuntime(command, runRuntime) === 'opencode' && mode === 'agent') {
  const database = chosen['opencode-database'] ?? theOpenCodeDatabaseOf(chosen.agent)
  if (database !== null) childEnv[THE_OPENCODE_DATABASE_VARIABLE] = database
}
// A RUN OPENCODE HOLDS ON GO'S USAGE LIMIT IS MARKED WHILE IT WAITS (round 48). OpenCode retries a Go limit in silence
// and may wait five hours before it gives up, so the stop read at the end (theGoLimitAnOpenCodeRunEndedOn) comes too
// late for the router. Each OpenCode run whose output is kept is given tools/opencode-go-limit-plugin.mjs, which prints
// one line on the run's output for each retry on Go's limit. The reader below writes it on the run as the session field
// `waitingOnALimit`, and takes it off at the first line OpenCode prints that goes on, or at the command's end.
// The plugin is added to any OPENCODE_CONFIG_CONTENT already given; one that is no JSON object with a plugin list is
// left as it is, and said.
const WATCHES_GO = !PLAIN && !WAIT && run !== null && aCommandsRuntime(command, runRuntime) === 'opencode'
if (WATCHES_GO) {
  const content = withAnOpenCodePlugin(childEnv['OPENCODE_CONFIG_CONTENT'], 'opencode-go-limit-plugin.mjs')
  if (content !== null) childEnv['OPENCODE_CONFIG_CONTENT'] = content
  else say('OPENCODE_CONFIG_CONTENT holds no JSON object with a plugin list, so this run is not given the Go limit plugin: the office learns of a Go limit only when the run ends.')
}
/** The office writes about the run's wait on Go, one at a time and in the order they were asked. */
let goWaitWrites = Promise.resolve()
/** Whether the last write asked for was a mark, and whether any was: the command's end takes off any mark it made. */
let goWaitOpen = false
let goWaitEverMarked = false
/** Whether this wait has asked the office to tell of it: once a wait, and a wait ends when OpenCode goes on. */
let goWaitTold = false
/**
 * A WAIT OF MORE THAN AN HOUR TELLS THE STARTER (round 55). The write that marks it carries `tellTheStarter: 'a-long-wait'`,
 * and the office writes its own line from the mark to the starter and the secretary who takes the usage notices. A
 * refused notice does not cost the mark: the mark is written again without it, and the refusal is logged. An office
 * older than round 55 refuses the mark's `key` and `nextTryAt` and the kind with 400, so after a 400 the mark is written
 * as such an office takes it, without all three, and the log says so.
 */
function theGoWaitIsWritten(mark, words, log, tell = false) {
  goWaitOpen = mark !== null
  if (mark !== null) goWaitEverMarked = true
  goWaitTold = mark !== null && (goWaitTold || tell)
  goWaitWrites = goWaitWrites.then(async () => {
    const write = (waitingOnALimit, withTheNotice) => askTheOffice(api, `/api/records/${encodeURIComponent(run)}`, {
      method: 'PATCH', headers: aboutTheRun(owner),
      body: { dataPatch: { waitingOnALimit }, ...(withTheNotice ? { tellTheStarter: 'a-long-wait' } : {}) },
    })
    let wrote = await write(mark, tell)
    let told = tell && wrote.status === 200 ? ` Its next try is more than an hour away, so ${theOfficesLine(wrote)}` : ''
    if (tell && wrote.status === 409) {
      told = ` The office refused to tell the run's starter of the wait (${theOfficeSaid(wrote)}), so the mark was written again without it.`
      wrote = await write(mark, false)
    }
    if (wrote.status === 400 && mark !== null) {
      const { key: _key, nextTryAt: _nextTryAt, ...asAnOlderOfficeTakesIt } = mark
      told = `${told} The office refused the write (${theOfficeSaid(wrote)}), so the mark was written again without its key and its next try${tell ? ' and without telling the starter' : ''}, as an office older than round 55 takes it.`
      wrote = await write(asAnOlderOfficeTakesIt, false)
    }
    log(wrote.status === 200 ? `${words}${told}` : `${words}${told} The office refused the write: ${theOfficeSaid(wrote)}.`)
  })
}
/** The key the wait is on, by its name only: the router's slots, the variable OpenCode reads, or OpenCode's own login. */
const theKeyTheWaitIsOn = () =>
  bridge !== null ? 'the-router' : typeof childEnv['OPENCODE_API_KEY'] === 'string' && childEnv['OPENCODE_API_KEY'] !== '' ? 'OPENCODE_API_KEY' : 'opencode-login'
const helperLog = (line) => appendFileSync(join(logs, 'helper.log'), `${clockStamp().instant} ${line}\n`)
function theGoWaitIsRead(line) {
  const waits = theGoLimitAnOpenCodeRunWaitsOn(line)
  if (waits !== null) {
    const resets = clockStamp(() => new Date(waits.resetsAtMs))
    // THE NEXT TRY IS KEPT ON THE MARK, so the lists tell a long wait from a retry of seconds by it and not by the reset,
    // which is assumed five hours away when the retry names none.
    const nextTry = waits.nextTryAtMs === null ? {} : { nextTryAt: clockStamp(() => new Date(waits.nextTryAtMs)).instant }
    theGoWaitIsWritten(
      { provider: waits.provider, said: waits.said, attempt: waits.attempt, seenAt: clockStamp(() => new Date(waits.seenAtMs)).instant, resetsAt: resets.instant, resetFrom: waits.resetFrom, ...nextTry, key: theKeyTheWaitIsOn() },
      `OpenCode is waiting on Go's usage limit (try ${String(waits.attempt)}): "${waits.said}". The run is marked as waiting until ${resets.stamp} ${resets.timeZone}, ${waits.resetFrom}.`,
      helperLog,
      aWaitIsLong(waits.seenAtMs, waits.nextTryAtMs) && !goWaitTold,
    )
  } else if (goWaitOpen && anOpenCodeLineThatGoesOn(line)) {
    theGoWaitIsWritten(null, 'OpenCode went on after waiting on Go\'s usage limit, so the run\'s mark of waiting is taken off.', helperLog)
  }
}

// With --wait the command's output is this helper's own, so the caller reads it as it comes.
const out = WAIT ? null : openSync(outPath, 'a')
const bridge = PLAIN ? null : await openTheBridge(process.env['SANDBOX_PROVIDER_ROUTER'], childEnv, refuse)
const gate = spawn('sh', ['-c', PLAIN ? PLAIN_GATE : GATE, 'sandbox-gate', stdin ?? '', ...command], {
  cwd,
  env: childEnv,
  detached: true,
  stdio: aRuntimeIsCodex(startValues?.runtime) || WATCHES_GO ? ['pipe', 'pipe', 'pipe'] : WAIT ? ['pipe', 'inherit', 'inherit'] : ['pipe', out, out],
})
if (out !== null) closeSync(out)
// Read Codex's and OpenCode's JSON as it comes. Keep every byte of output, surface Codex's tier refusal in helper.log,
// and mark an OpenCode run while it waits on Go's limit.
if (gate.stdout !== null) {
  let pending = ''
  const read = (line) => {
    if (WATCHES_GO) theGoWaitIsRead(line)
    const warning = aCodexTierWarning(line)
    if (warning === null) return
    appendFileSync(join(logs, 'helper.log'), `${clockStamp().instant} ${warning}\n`)
    say(warning)
  }
  gate.stdout.on('data', (chunk) => {
    if (WAIT) process.stdout.write(chunk)
    else appendFileSync(outPath, chunk)
    pending += chunk.toString('utf8')
    const lines = pending.split('\n')
    pending = lines.pop() ?? ''
    for (const line of lines) read(line)
  })
  gate.stdout.on('end', () => { if (pending !== '') read(pending) })
  gate.stderr.on('data', (chunk) => {
    if (WAIT) process.stderr.write(chunk)
    else appendFileSync(outPath, chunk)
  })
}
// With pipes, wait for the last output bytes before reading the run's receipt or ending its log.
const GATE_END = gate.stdout === null ? 'exit' : 'close'
// A gate that has already gone makes a write fail with EPIPE; its exit is what matters, and it is
// read below, so the write's own error must not end this helper first.
gate.stdin.on('error', () => {})
let gateExited = null
gate.on('exit', (code, signal) => {
  gateExited = { code, signal }
  takeBackTheOfficeMcpConfiguration()
  bridge?.close()
})
const innerPid = gate.pid
if (innerPid === undefined) refuse(`sh could not be started to hold ${command[0]} at its gate. Nothing was started.`)

/** Resolves once the gate has exited, or after `ms` with false. */
function theGateHasExited(ms) {
  if (gateExited !== null) return Promise.resolve(true)
  return new Promise((ok) => {
    const timer = setTimeout(() => ok(false), ms)
    gate.once('exit', () => {
      clearTimeout(timer)
      ok(true)
    })
  })
}

/**
 * STOP AT THE GATE: the command never runs. The gate reads end-of-file and exits; a process row
 * already written for it is then closed, since nothing runs under it; a run this helper filed is
 * marked as never started. Each of the three is said if it could not be done.
 */
async function giveUp(why, rowId = null) {
  gate.stdin.end()
  // A ROW THE HOST WROTE IS THE HOST'S TO CLOSE: it sees this helper end with no start line and closes it with the
  // caller's key, which this helper does not hold (see the header).
  if (rowId !== null && HANDSHAKE !== null) say(`the process row ${rowId} is closed by the launcher on the host, which wrote it.`, true)
  if (rowId !== null && HANDSHAKE === null) {
    const exited = await theGateHasExited(5000)
    const closed = exited
      ? await askTheOffice(api, `/api/resources/${encodeURIComponent(rowId)}/release`, {
          method: 'POST',
          headers: aboutTheRun(owner),
          body: { note: `The command never ran: ${why}` },
        })
      : null
    if (closed === null || closed.status !== 200) {
      say(`the process row ${rowId} could not be closed (${closed === null ? 'the gate had not exited after 5 s' : theOfficeSaid(closed)}); it may still say something runs.`)
    }
  }
  if (mode === 'agent') await theRunNeverStarted(run, why)
  refuse(`${why} The command never ran.`)
}

// ============================================================================ 3. the process row

const detail = aDetailOfAFewKilobytes(`sandbox ${instance.instance}: ${mode === 'own' ? `${starter}'s command` : `run ${run}`} — ${command.join(' ')}`)

/** A JSON file's contents, or null while it is not there yet. */
function readJsonIfThere(path) {
  if (!existsSync(path)) return null
  return JSON.parse(readFileSync(path, 'utf8'))
}

/**
 * THE ROW THE LAUNCHER ON THE HOST WRITES (see the header). The gate's pid goes into pid.json, published whole by
 * writeWhole so the host never reads half of it, and the gate waits for row.json, or refused.json with the host's reason.
 * The wait has a limit, and giving up names the folder, so a launcher that died is told apart from one that refused.
 */
async function theRowTheHostWrites() {
  const asked = { pidInContainer: innerPid, container: instance.container?.name ?? instance.container?.id, sessionRecordId: owner, detail }
  writeWhole(join(HANDSHAKE, 'pid.json'), `${JSON.stringify(asked)}\n`, THE_MODE_OF_A_PLAINLY_WRITTEN_FILE)
  const deadline = Date.now() + HANDSHAKE_LIMIT_MS
  for (;;) {
    const refused = readJsonIfThere(join(HANDSHAKE, 'refused.json'))
    if (refused !== null) await giveUp(`The launcher on the host could not register pid ${innerPid} in container ${asked.container}: ${String(refused.why)}`)
    const written = readJsonIfThere(join(HANDSHAKE, 'row.json'))
    if (written !== null) return written
    if (gateExited !== null) await giveUp(`The gate exited (${gateExited.code ?? gateExited.signal}) before the launcher on the host wrote its process row.`)
    if (Date.now() > deadline) {
      await giveUp(
        `No process row came from the launcher on the host within ${String(HANDSHAKE_LIMIT_MS / 1000)} s. It writes row.json into ` +
          `${HANDSHAKE}, in the instance folder ${instanceDir}, once it has registered pid ${innerPid}, and nothing was there.`,
      )
    }
    await new Promise((later) => setTimeout(later, 100))
  }
}

let row
if (HANDSHAKE !== null) {
  row = await theRowTheHostWrites()
} else {
  // ASKED AGAIN WHILE THE OFFICE REFUSES THE CONNECTION, as it does while it restarts (askTheOfficeWhileItRestarts in
  // tools/sandbox-common.mjs): the command waits at its gate meanwhile.
  const registered = await askTheOfficeWhileItRestarts(
    api,
    '/api/resources',
    {
      method: 'POST',
      headers: aboutTheRun(owner),
      body: {
        type: 'process',
        container: instance.container?.name ?? instance.container?.id,
        pidInContainer: innerPid,
        sessionRecordId: owner,
        detail,
        // A RUN'S OWN COMMAND IS MARKED AS STARTED BY THE PRODUCT, as the office's worker marks the runs it starts, so
        // the office reads this row as the run's own (wave 13k round 3: a run started here filed its row
        // with the mark left out). The launcher starting a run's command
        // is the product starting it, which is also what lets the office stop it (the door's reason for the mark, in
        // src/server/api/resources.ts). The caller's own command, a build or a suite, is no run and is not marked.
        ...(run === null ? {} : { startedByTheProduct: true }),
      },
    },
    { saying: say },
  )
  if (registered.status !== 201) {
    await giveUp(`The ledger refused to register pid ${innerPid} in container ${instance.container?.name} (${theOfficeSaid(registered)}).`)
  }
  row = registered.body.resource
}

// ============================================================================ 4. a seat, if asked

let slot = null
if (chosen.slot !== undefined) {
  const seated = spawnSync(
    process.execPath,
    [
      join(HERE, 'slot.mjs'), 'acquire', chosen.slot, '--wait', '--resource', row.id,
      '--session', owner, '--as', starter, '--workspace', workspace, '--api', api,
      '--detail', aDetailOfAFewKilobytes(`sandbox ${instance.instance}: ${command.join(' ')}`),
    ],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] },
  )
  slot = seated.status === 0 ? String(seated.stdout).trim().split('\n')[0] : null
  if (slot === null || slot === '') {
    await giveUp(`No ${chosen.slot} seat was given (${whyTheSlotToolGaveNoSeat(seated)}).`, row.id)
  }
}

if (gateExited !== null) {
  await giveUp(`The gate exited (${gateExited.code ?? gateExited.signal}) before it was told to go.`, row.id)
}

// ============================================================================ 5. start.json, then go

const start = {
  instance: instance.instance,
  run,
  runtime: runRuntime,
  owner,
  agent: mode === 'agent' ? chosen.agent : null,
  startedBy: { agent: starter, session: starterSession },
  ...(opencode === null ? {} : { opencode }),
  innerPid,
  hostPid: Number(row.key),
  hostPgid: row.pgid,
  processRow: row.id,
  cwd,
  command,
  ...(startValues === null ? {} : { model: startValues.model, ...(startValues.selection === undefined ? {} : {selection:startValues.selection,native:startValues.native}), ...(unappliedDshSelection ? { requestedModel: startValues.requestedModel } : {}), effort: startValues.effort, requestedEffort: startValues.requestedEffort, effortFrom: startValues.effortFrom, ruleEffort: startValues.ruleEffort, officeUnavailable: startValues.officeUnavailable, officePredatesEffort: startValues.officePredatesEffort, fast: startValues.fast, startWords: startValues.words }),
  ...(stdin === null ? {} : { stdin }),
  // THE RUN'S OWN SCRATCH FOLDER, its command's TMPDIR, or null for a command with no run, which keeps the container's.
  scratch: theScratchFolderMade,
  out: WAIT ? null : outPath,
  details: launchDetails,
  agent: servedAgent,
  ...(WAIT ? { waits: true, timeoutSeconds: TIMEOUT_SECONDS, plainEnv: PLAIN } : {}),
  ...(NO_OFFICE ? { noOfficeVariables: true } : {}),
  sandbox: sandboxField,
  container: instance.container,
  slot,
  // WRITTEN INSIDE A CONTAINER, so the local time with its offset stated: a container started before finding 62 still
  // runs in UTC, and a bare local stamp there would read an hour off (acceptance finding 63).
  startedAt: clockStamp().instant,
}
writeWhole(join(logs, 'start.json'), `${JSON.stringify(start, null, 2)}\n`, THE_MODE_OF_A_PLAINLY_WRITTEN_FILE)
if (stdin !== null) {
  const sentence = `The command's standard input comes from ${stdin}.`
  appendFileSync(join(logs, 'helper.log'), `${clockStamp().instant} ${sentence}\n`)
  say(sentence, true)
}

// ============================================================================ 6. seal it on exit

/** A git plumbing line, read from `dir`, or null rather than a throw: nothing here may crash a run's finish. */
function gitLine(dir, ...args) {
  try {
    return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return null
  }
}

/**
 * THE FOLDER A RUN'S FINISH READS (9 November 2026): the one its record names now, because the office's
 * finish checks HEAD there. A round the next-round door continued, which moved to a new worktree as it was told, has its
 * record name the new one, while the folder the launcher started in still holds the earlier run's sealed tip.
 * That run's finish submitted the tip, and the office refused it with 409. A folder other than the one it started in is
 * read only inside this sandbox's own folder, where the launcher already reads git; one named elsewhere, or none, leaves
 * the start folder read, and the finish log says so.
 */
function theFolderTheRunNamesNow(named, startFolder) {
  if (typeof named !== 'string' || named.trim() === '' || named === startFolder) return startFolder
  let inside = false
  try {
    const real = realpathSync(named), sandbox = realpathSync(instanceDir)
    inside = real === sandbox || real.startsWith(`${sandbox}/`)
  } catch {
    inside = false
  }
  if (inside) return named
  finishLog(`run ${run}'s record names the folder ${named}, which is not inside this sandbox's folder or cannot be read, so its finish reads ${String(startFolder)}, where it started.`)
  return startFolder
}

/**
 * True, false, or null when either commit could not be read (an unreadable worktree, or a cutFrom gone from history). A
 * cutFrom that starts with - is null before git sees it: no branch name or commit does, and git reads one as an option,
 * so a cutFrom of --output=<file> would have git rev-list open that file for writing.
 */
function hasCommitsBeyondTheCut(dir, cutFrom) {
  if (typeof cutFrom !== 'string' || cutFrom.startsWith('-')) return null
  const head = gitLine(dir, 'rev-parse', 'HEAD')
  const base = gitLine(dir, 'rev-parse', cutFrom)
  if (head === null || base === null) return null
  const count = gitLine(dir, 'rev-list', '--count', `${base}..${head}`)
  return count === null ? null : Number(count) > 0
}

/**
 * THE COMMIT A RUN'S CUT IS READ AT: the commit the run was filed with, while the run's cutFrom is still the name it was
 * recorded under, and otherwise the name. It is the office's own rule (theBaseARunNames in src/server/lib/sealed-tip.ts),
 * so a cut branch renamed or moved since the filing is read as the office reads it. A recorded commit of no shape the
 * office takes is null, not known, because the office refuses to read that run's base at all.
 */
function theCutARunIsReadAt(record, cutFrom) {
  const read = theRecordedBaseOfRun(record?.data ?? {})
  if ('fails' in read) return null
  return record?.data?.cutFrom === cutFrom ? read.base ?? cutFrom : cutFrom
}

/** Appended, never thrown: by the time this runs nobody is reading this helper's own stdout or stderr any more. */
function finishLog(line) {
  try {
    appendFileSync(join(logs, 'finish.log'), `${clockStamp().instant} ${line}\n`)
  } catch {
    // The run's own end is still whatever the PATCH above made it, or did not; only the note of it is lost.
  }
}

/** The six words a session record may hold (`@shared/types.ts`'s `SESSION_STATES`); these three never take a further PATCH from here. */
const RUN_ALREADY_OVER = new Set(A_RUN_IS_OVER_IN)

/**
 * A RUN IS SEALED ON ITS EXIT ONLY WHEN IT SAYS IT SEALS, whether the seal is of its commits or of its records (as in
 * the inspector's refusal: the records finish sealed a run
 * whose last word said it was not done). True when its last message to its starter says it seals (tools/a-run-says-it-seals.mjs).
 * Otherwise the end is written with why, the finish log says so, and false tells the caller to leave the run as it was.
 * `ended` finishes the sentence "Its command ...".
 */
async function itSaysItSeals(before, ended, commandEnded, already) {
  const word = await theRunsLastWordToItsStarter(before)
  if (word.says === 'seals') return true
  const read = word.says === 'unread' ? `its last message to its starter could not be read (${word.why})` : word.message === null
    ? 'it sent its starter no message since it began' : `its last message to its starter, ${word.message}, ${word.says === 'holds' ? 'says it does not seal' : 'does not say it seals'}`
  const why = `Its command ${ended}, but ${read}, so the launcher left it as it was rather than seal it: a run is sealed on its ` +
    'exit only when it says it seals. It is finished by its agent, or by its starter, when it is done.'
  const kept = await theEndIsWritten(why, commandEnded)
  finishLog(`run ${run}'s command ${ended}, and ${read}; left as ${String(already)}; ${kept}`)
  return false
}

/**
 * THE RUN'S LAST WORD TO ITS STARTER, read by tools/a-run-says-it-seals.mjs: its starter's ids (the name it was started as and
 * the agent its starter's session serves) and the messages the run's agent sent, from the office, with the run's own headers.
 * { says: 'seals' | 'holds' | 'silent', message } or { says: 'unread', why } when the office did not answer a read.
 */
async function theRunsLastWordToItsStarter(read) {
  const record = read?.status === 200 ? (read.body?.record ?? read.body) : null
  if (record === null) return { says: 'unread', why: 'the run record could not be read' }
  const agent = record.data?.servingAgentId ?? record.data?.servingAgent
  if (typeof agent !== 'string') return { says: 'unread', why: 'the run names no agent it serves' }
  const parentId = record.data?.parentAttachment
  const parent = typeof parentId === 'string' ? await askTheOffice(api, `/api/records/${encodeURIComponent(parentId)}`, { headers: aboutTheRun(owner) }) : null
  const parentData = parent?.status === 200 ? (parent.body?.record ?? parent.body)?.data : null
  const starterIds = [starter, parentData?.servingAgentId, parentData?.servingAgent].filter((one) => typeof one === 'string')
  // PAGE BY PAGE until the last word is known (theAgentsMessagesSince): one page of 50 read a busy agent's run as silent.
  let sent
  try {
    sent = await theAgentsMessagesSince(async (path) => {
      // THE WORDS ARE ASKED FOR BY NAME; an older office's 400 is retried without it.
      const page = await readAFullList((one) => askTheOffice(api, one, { headers: aboutTheRun(owner) }), path)
      if (page.status !== 200) throw new Error(`GET /api/messages answered ${String(page.status)}`)
      return page.body
    }, record, starterIds)
  } catch (error) {
    return { says: 'unread', why: error instanceof Error ? error.message : String(error) }
  }
  if (!sent.complete) return { says: 'unread', why: sent.why }
  const messages = sent.messages
  const said = whatTheRunSays(record, messages, starterIds)
  // A NARROW ANSWER IS NOT GUESSED AT: the run's last word is its body, so one that arrives without the words is unread.
  if (said.message !== null && typeof messages.find((one) => one?.id === said.message)?.body !== 'string') {
    return { says: 'unread', why: 'the messages answer did not carry the words of the run\'s last message' }
  }
  if (said.message !== null || typeof starter !== 'string') return said
  // A STARTER NAMED BY ITS HANDLE ONLY (its session names no servingAgentId): its registry id is asked once, by the profile
  // door, and the messages are read again against it. A host agent's id is its name, and a supervisor's run the launcher
  // filed names its id, so this is the rare case.
  const profile = await askTheOffice(api, `/api/participants/agent/${encodeURIComponent(starter)}/profile`, { headers: aboutTheRun(owner) })
  const id = profile.status === 200 ? (profile.body?.profile ?? profile.body?.participant ?? profile.body)?.id : null
  return typeof id === 'string' && !starterIds.includes(id) ? whatTheRunSays(record, messages, [...starterIds, id]) : said
}

/** How many reports the run's record says are linked to it, in either direction; 0 when the record could not be read. */
function theReportsLinkedTo(read) {
  return theReportIdsLinkedTo(read).length
}

/** Only reports on the record already read, in either direction; name each once even when several links reach it. */
function theReportIdsLinkedTo(read) {
  const links = read?.status === 200 && Array.isArray(read.body?.links) ? read.body.links : []
  return [...new Set(links.filter((one) => one?.other?.kind === 'report').map((one) => one.other.id))]
}

/**
 * WRITE A ROUND'S END THAT LEAVES THE RUN AS IT IS: its `detail` and how its command ended. The office reads the first
 * `commandEnded` on a run with no seal as the end of the round, records why it was not sealed, and tells the starter once
 * (src/server/lib/how-a-round-ended.ts). When the office refuses the write, nobody else would tell the starter, so this
 * launcher does, with the office's answer. Answers a sentence for the finish log.
 */
async function theEndIsWritten(why, commandEnded) {
  const kept = await askTheOffice(api, `/api/records/${encodeURIComponent(run)}`, { method: 'PATCH', headers: aboutTheRun(owner), body: { dataPatch: { detail: withStartExplanation(why), commandEnded } } })
  if (kept.status === 200) return 'the office tells its starter.'
  const told = await theStarterIsTold(
    `Run ${run}'s end could not be written`,
    `Run ${run}: ${why} The office refused to write how its command ended (${theOfficeSaid(kept)}), so it did not record why the round has no seal.`,
  )
  return `its end could not be written (${theOfficeSaid(kept)}); ${told}`
}

/** Write a refused finish as crashed only after the office proves the run's process has ended. */
async function theRefusedFinishIsWritten(why, commandEnded) {
  const reading = await askTheOffice(api, `/api/runs/${encodeURIComponent(run)}/process-ended`, { headers: aboutTheRun(owner) })
  if (reading.status === 200 && reading.body?.ended === true && typeof reading.body?.says === 'string') {
    const kept = await askTheOffice(api, `/api/records/${encodeURIComponent(run)}`, { method: 'PATCH', headers: aboutTheRun(owner), body: { dataPatch: { state: 'crashed', detail: withStartExplanation(why), commandEnded } } })
    if (kept.status === 200) {
      theStateItsEndLeft = 'crashed'
      return 'written crashed; the office tells its starter.'
    }
    const told = await theStarterIsTold(
      `Run ${run}'s end could not be written`,
      `Run ${run}: ${why} The office refused to write how its command ended (${theOfficeSaid(kept)}), so it did not record why the round has no seal.`,
    )
    return `its end could not be written (${theOfficeSaid(kept)}); ${told}`
  }
  const processReading = reading.status === 404
    ? 'the process reading is unavailable on an older office (404)'
    : reading.status === 200 && reading.body?.ended === false && typeof reading.body?.says === 'string'
      ? `the process reading says ${reading.body.says}`
      : `the process reading is unreadable (${theOfficeSaid(reading)})`
  const kept = await theEndIsWritten(why, commandEnded)
  return `${processReading}; its state was left as it was; ${kept}`
}

/**
 * ONE MESSAGE TO THE RUN'S STARTER, filed as the kit files one (design/agents/kit/send-message.py). With the run's own
 * key it is the run telling its starter, under the served agent's name, because only that name can carry that key;
 * without one it goes with the starter's own identity, as before. Answers a sentence for the finish log. `about` says in
 * a few fixed words what the message is about.
 *
 * ONLY FOR WHAT THE OFFICE HAS NOT WRITTEN: a write the office refused, or a
 * record it could not read, so the run is not over and its key still works. A message under the run's key is in the run's
 * session, and the office reads the newest one to the starter as the run's own last word. So the run's report, its Codex
 * stop and its long run are said by the office, from the finishing write's `tellTheStarter` and its own clock.
 *
 * A MESSAGE THE OFFICE STORED AND ANSWERED 409 IS TOLD. The office stores a message to a registered agent that nothing
 * holds, routes it and answers 409 (whereAStoredMessageWaits). Such an answer is taken as a 201 is, for the short message
 * as well, and the message waits where the office routed it. The finish log gives the office's routed line after the
 * told sentence.
 *
 * A MESSAGE THE OFFICE REFUSES FOR ITS WORDS IS SAID ANOTHER WAY. Since wave 13w's key
 * door the office refuses a message whose words look as if they hold a key, and this launcher's
 * words carry paths, ids and the office's own sentences, any of which may have that shape. Until then a refusal was only
 * a line in finish.log, which the starter never reads. Every other 4xx answer refuses these words, so the refused words
 * go to finish.log with the office's answer, and a second, short message tells the starter, in words built only from this
 * run's id, which the office made, `about`, the refusal's status and code, and where finish.log is. A 5xx or no answer
 * is the office not taking messages at all, which a second message would meet too; that stays a line in finish.log.
 */
async function theStarterIsTold(title, body, about = 'how its command ended') {
  if (starter === null) return 'no starter is known to tell.'
  const send = (words) => askTheOffice(api, '/api/records', {
    method: 'POST',
    headers: aboutTheRun(starterSession),
    body: { kind: 'message', title: words.title, data: { body: words.body, to: [{ kind: 'agent', id: starter }], aboutRun: run } },
  })
  const sent = await send({ title, body })
  const waits = whereAStoredMessageWaits(sent, 'The message')
  if (sent.status === 201 || waits !== null) return `its starter ${starter} is told (message ${String(sent.body?.record?.id ?? '?')}).${waits ?? ''}`
  const notTold = `its starter ${starter} could not be told (${theOfficeSaid(sent)}).`
  if (typeof sent.status !== 'number' || sent.status < 400 || sent.status >= 500) return notTold
  finishLog(`the office refused the launcher's message about ${about}; its title was ${JSON.stringify(title)} and its words ${JSON.stringify(body)}.`)
  const code = typeof sent.body?.code === 'string' ? `, ${sent.body.code}` : ''
  const shortly = await send({
    title: `A message about run ${run} was refused`,
    body: `Run ${run}: the office refused the launcher's message to you about ${about} (${String(sent.status)}${code}), so its words are not in a message. They are in ${join(logs, 'finish.log')}, with the office's answer.`,
  })
  const shortWaits = whereAStoredMessageWaits(shortly, 'The short message')
  return shortly.status === 201 || shortWaits !== null
    ? `${notTold} A second, short message told it so (message ${String(shortly.body?.record?.id ?? '?')}); the refused words are on the line above.${shortWaits ?? ''}`
    : `${notTold} The second, short message was refused too (${theOfficeSaid(shortly)}); the refused words are on the line above.`
}

/**
 * WHERE A MESSAGE THE OFFICE STORED AND ANSWERED 409 WAITS, as a sentence to follow the told one, or null for every
 * other answer. A send to a registered agent that nothing holds is stored, routed and answered 409, and that answer
 * carries the stored message with its id and the list of where it was routed (theReasonOfA409Send in
 * src/server/api/records.ts). An answer without both is a refusal, as a 409 that stored nothing is. The sentence is
 * empty when the list holds no line. `which` names the message the sentence is about.
 */
function whereAStoredMessageWaits(answer, which) {
  if (answer.status !== 409 || typeof answer.body?.record?.id !== 'string' || !Array.isArray(answer.body.routed)) return null
  const lines = answer.body.routed.map((one) => one?.line).filter((line) => typeof line === 'string')
  return lines.length === 0 ? '' : ` ${which} waits where the office routed it: ${lines.join(' ')}`
}

/** What the office's answer to a write with `tellTheStarter` says it did, as a sentence for the finish log. */
function theOfficesLine(said) {
  const told = said.body?.tellTheStarter
  const secretary = told?.theUsageNoticeSecretary
  const andTheSecretary = typeof secretary?.told === 'string' ? ` It told the secretary who takes the usage notices (message ${secretary.told}).`
    : typeof secretary?.notTold === 'string' ? ` It did not tell the secretary who takes the usage notices: ${secretary.notTold}` : ''
  if (typeof told?.told === 'string') return `the office told its starter (message ${told.told}).${andTheSecretary}`
  if (typeof told?.notTold === 'string') return `the office did not tell its starter: ${told.notTold}${andTheSecretary}`
  return "the office's answer does not say whether it told its starter."
}

/**
 * WHETHER THE RUN'S KEY WAS REFUSED AT THE EXIT BECAUSE THE RUN WAS ALREADY OVER (theRunEndedBeforeItsCommand). Only a
 * 403 on the run's own key is asked about. One more read, as the starter and without the run key, must show the run in
 * a state it is over in. When it does not, finish.log says what it showed, and the 403 stays a fault as before.
 */
async function theRunWasEndedBeforeItsCommand(before) {
  if (before.status !== 403 || runKey === null) return false
  const again = await askTheOffice(api, `/api/records/${encodeURIComponent(run)}`, { headers: headers(starterSession) })
  const state = again.status === 200 ? (again.body?.record ?? again.body)?.data?.state : undefined
  if (theRunEndedBeforeItsCommand(before.status, true, state)) return true
  finishLog(`run ${run}'s key was refused at its command's end (${theOfficeSaid(before)}), and a read as its starter without that key ${again.status === 200 ? `shows it ${JSON.stringify(state)}, not over` : `was answered ${theOfficeSaid(again)}`}; so the refusal is a fault, not a seal.`)
  return false
}

/** The one sentence for that case, in finish.log and on stderr. */
function itEndedBeforeItsCommand() {
  return `run ${run} sealed itself, or somebody ended it, before its command exited; its key was revoked in that write, so what served it and its usage receipt are what that write carried.`
}

/**
 * THE CODEX THREAD THE RUN'S OUTPUT FILE NAMES, in the first `thread.started` line `codex exec --json` printed, or null.
 * @param {string} path
 * @returns {string | null}
 */
function theCodexThreadIn(path) {
  let text = ''
  try {
    text = readFileSync(path, 'utf8')
  } catch {
    return null
  }
  for (const line of text.split('\n')) {
    try {
      const event = JSON.parse(line)
      if (event?.type === 'thread.started' && typeof event.thread_id === 'string') return event.thread_id
    } catch {
      // Not a line of codex exec --json; the thread is named on one of its own.
    }
  }
  return null
}

/**
 * THE RUN THIS ROUND CONTINUES, AS ITS RECEIPT NEEDS IT (an answer, item 1; wave 13s round 42).
 * A round's record has a `derived_from` link to the run it follows (`--continues`, which `sandbox.mjs round` passes),
 * and it continues that run when its command resumes a conversation (theCommandResumesAConversation). Its own usage is
 * then what its command reported less what that run's own output reported at its end, so that run's output file,
 * logs/<that run>/out in this sandbox, is read here. Null for a run with no such link, and for a round whose command
 * resumes nothing (round 54's refusal, item 1): it follows that run in a new conversation, and what it reported is its
 * own. A run with more than one link, whose file cannot be read, or whose command is not read, is given with words
 * saying why, and its receipt then says so (src/config/usage.mjs).
 * @param {{ status: number | null, body?: any }} before The run's record, as read when its command ended.
 * @returns {import('../src/config/usage.mjs').ThePreviousRun}
 */
function theRunItContinues(before) {
  const links = Array.isArray(before.body?.links) ? before.body.links : []
  const continued = links.filter((link) => link?.type === 'derived_from' && link.isBacklink === false && link.other?.kind === 'session')
  if (continued.length === 0) return null
  const resumes = theCommandResumesAConversation(command ?? [])
  if (resumes === false) return null
  const ids = continued.map((link) => String(link.other.id))
  if (ids.length > 1) return { run: ids.join(' and '), unread: `run ${run} is derived from ${ids.length} runs, so which one it continues is not known` }
  const id = ids[0]
  if (resumes === null) return { run: id, unread: "its command is not a Claude Code or Codex command line, so whether it resumed that run's conversation is not known" }
  if (!/^[A-Za-z0-9_-]+$/.test(id)) return { run: id, unread: 'its id cannot name a folder' }
  return theOutputOfTheRunItContinues(id, join(instanceDir, 'logs', id, 'out'))
}

/**
 * WHAT SERVED A CLAUDE CODE OR CODEX RUN, WRITTEN WHEN ITS COMMAND ENDS (HB1, round 36, for
 * Codex). Every path of finishOrCrashTheRun calls this first, the run that is already over included, because a worker
 * that says finished itself is the usual case. The Claude Code reading is src/config/claude-code-served.mjs, and the
 * Codex reading is theServedOfACodexRun in src/config/runtime-served.mjs, from the rollout of the thread the output
 * file's thread.started line names. The write is sent with the run as the session, which is the one writer of
 * `served` besides the person and the secretary (assertMayWriteServed). A `served` already on the record is left as
 * it is. dsh writes its own, from its stop hook, and the launcher starts no other runtime. Every outcome goes to
 * finish.log.
 */
async function theServedIsWritten(before, endedFirst) {
  const record = before.status === 200 ? (before.body?.record ?? before.body) : null
  if (record === null) {
    if (endedFirst) return
    finishLog(`run ${run}'s record could not be read (${theOfficeSaid(before)}), so the launcher cannot tell whether it is a Claude Code run, and wrote nothing about the model that answered.`)
    return
  }
  const codex = aRuntimeIsCodex(record.data?.runtime)
  if (record.data?.runtime !== 'claude-code' && !codex) return
  const stored = record.data?.served
  if (stored !== undefined && stored !== null) {
    finishLog(`run ${run} already holds what served it (model ${JSON.stringify(stored.model)}), so the launcher left it as it was.`)
    return
  }
  const briefPath = mode === 'agent' ? (chosen.brief ?? null) : null
  const { served, said } = codex
    ? theServedOfACodexRun({ thread: WAIT ? null : theCodexThreadIn(outPath), env: childEnv, sinceMs: Date.parse(start.startedAt) })
    : theServedOfAClaudeCodeRun({ outPath: WAIT ? null : outPath, env: childEnv, cwd, startedAt: start.startedAt, briefPath })
  if (codex && briefPath !== null) {
    try {
      served.briefBytes = statSync(briefPath).size
    } catch {
      // The brief is gone by the time the run ended; its size stays "not reported", as the Served shape says.
    }
  }
  const wrote = await askTheOffice(api, `/api/records/${encodeURIComponent(run)}`, { method: 'PATCH', headers: aboutTheRun(owner), body: { dataPatch: { served } } })
  finishLog(
    wrote.status === 200
      ? `run ${run}'s model that answered is recorded as ${JSON.stringify(served.model)}: ${said}`
      : `run ${run}'s model that answered could not be recorded (${theOfficeSaid(wrote)}); what was read: ${said}`,
  )
}

/**
 * THE RUN'S USAGE RECEIPT, read from the envelope its command printed last (milestone M8).
 *
 * A CODEX RUN is read the same way from the last `turn.completed` event `codex exec --json` printed (codexUsage in
 * src/config/usage.mjs, the message worker's own rule). Codex gives no cost, and which Codex login paid is not known
 * here, so both are "not reported". A Codex run that reported no usage is told why from its own output, the signal
 * that stopped it included. AN OPENCODE RUN gets the sum of the step_finish events `opencode run --format json` printed,
 * each one step's own tokens and cost (theReceiptOfAnEndedOpenCodeCommand), or words
 * saying there were none. A run of any other runtime gets no receipt from the launcher.
 *
 * A ROUND THAT CONTINUES ANOTHER (wave 13s round 42). `codex exec resume` reports its thread's total
 * so far, and `claude -p --continue` its conversation's cost so far, so the round's own share is that less what the run
 * it continues reported at its end (theRunItContinues). When that cannot be read, the receipt says so in words and
 * keeps no total as the round's. A round linked to a run it follows in a new conversation resumes nothing, and its
 * receipt is what its own command reported.
 *
 * ONE WRITER (the same answer, item 2). The receipt replaces the stored one whole (theReceiptWrittenOver), so no
 * words of an earlier write are left beside these numbers, unless this reading has no numbers and the stored receipt has
 * some: that receipt then stays, and only these words are added to it.
 *
 * A Claude Code run started here runs `claude -p --output-format json` (theClaudeCodeCommand in tools/sandbox.mjs), so
 * the last line of its output file is the envelope, and src/config/usage.mjs reads it by the same rule as an inspector's
 * check (theUsageIsKept in tools/the-inspector.mjs). A run that failed still printed an envelope, error_max_turns
 * included, and its tokens were spent, so it is written whatever the exit was. A number the envelope does not give
 * stays absent, which the receipt and its page say as "not reported". Which login paid and which sandbox ran it are
 * written beside the numbers, and outside spending already on the receipt is kept.
 *
 * IT NEVER STOPS THE RUN. A receipt that cannot be written is said in one sentence on stderr and in finish.log, and
 * the finish or crash below goes on. A run that finished itself less than fifteen minutes ago still has a key that may
 * read its record and store its receipt (an agreement, aFinishedRunStoresOnlyItsReceipt in
 * src/server/lib/records.ts), so its receipt is written here over the one its seal carried. A run whose key was refused
 * because it was already over keeps the receipt its last write carried, and the sentence says so instead of a fault
 * (theRunEndedBeforeItsCommand).
 */
async function theReceiptIsWritten(before, endedFirst, signal) {
  if (endedFirst) {
    finishLog(itEndedBeforeItsCommand())
    process.stderr.write(`sandbox-start: ${itEndedBeforeItsCommand()}\n`)
    return
  }
  const record = before.status === 200 ? (before.body?.record ?? before.body) : null
  const codex = aRuntimeIsCodex(record?.data?.runtime)
  const opencode = record?.data?.runtime === 'opencode'
  if (record !== null && record.data?.runtime !== 'claude-code' && !codex && !opencode) return
  let text = ''
  let unread = WAIT ? 'The run printed to its starter\'s screen, so its usage was not kept and nothing was reported.' : null
  try {
    text = WAIT ? '' : readFileSync(outPath, 'utf8')
  } catch (error) {
    unread = `The run's output file ${outPath} could not be read (${error?.code ?? String(error)}), so nothing was reported.`
  }
  const stored = record?.data?.usageReceipt
  const receipt = opencode
    ? theReceiptOfAnEndedOpenCodeCommand({ text, unread, stored, ranIn: whereItRan(childEnv) })
    : codex
    ? theReceiptOfAnEndedCodexCommand({
        text,
        unread,
        stopped: typeof signal === 'string' ? `by ${signal}` : null,
        previous: theRunItContinues(before),
        stored,
        ranIn: whereItRan(childEnv),
      })
    : theReceiptOfAnEndedCommand({
        text,
        noEnvelope: WAIT ? 'The run printed to its starter\'s screen, so its usage envelope was not kept and nothing was reported.' : `The run's output file ${outPath} holds no --output-format json envelope, so nothing was reported.`,
        previous: theRunItContinues(before),
        stored,
        paidBy: theLoginThatPaid(childEnv),
        ranIn: whereItRan(childEnv),
      })
  const written = theReceiptWrittenOver(stored, receipt)
  const wrote = record === null
    ? before
    : await askTheOffice(api, `/api/records/${encodeURIComponent(run)}`, { method: 'PATCH', headers: aboutTheRun(owner), body: { dataPatch: { usageReceipt: written } } })
  if (wrote.status === 200 && record !== null) {
    finishLog(`run ${run}'s usage receipt is recorded: ${JSON.stringify(written)}`)
    return
  }
  const sentence = `The run ran, and its usage receipt was not stored on run ${run} (${theOfficeSaid(wrote)}); nothing else about the run changed because of this.`
  finishLog(sentence)
  process.stderr.write(`sandbox-start: ${sentence}\n`)
}

/**
 * HOW LONG THE LAUNCHER'S FINISH WAITS FOR THE OFFICE: the same five minutes the office tool waits for a write that may
 * seal a run (THE_LONGEST_FINISH_WAIT_MS, declared in src/config/finished.mjs), because the launcher's finish seals too
 * and a seal reads and hashes the whole worktree. A test may shorten it with SANDBOX_FINISH_WAIT_MS.
 */
const THE_FINISH_WAIT_MS = THE_LONGEST_FINISH_WAIT_MS

/**
 * HOW LONG THE LAUNCHER SEARCHES FOR THE RUN AFTER A FINISH GOT NO ANSWER AT ALL, all of it: a few reads, and the short
 * waits between the ones the office answered nothing to. A test may shorten it with SANDBOX_FINISH_READ_BACK_MS; each
 * read and each wait is worked out from it, so the search always fits inside it.
 */
const THE_FINISH_READ_BACK_MS = 60_000
/** How many reads that search makes. */
const THE_FINISH_READ_BACK_TRIES = 5
/** The longest wait between two reads, when the bound has room for it. */
const A_FINISH_READ_BACK_PAUSE_MS = 2_000

/** The bound, the wait between two reads, and one read's bound, worked out from the real bound or a test's shorter one. */
function theReadBackWaits() {
  const bound = aWaitATestMayShorten(THE_FINISH_READ_BACK_MS, 'SANDBOX_FINISH_READ_BACK_MS')
  const pause = Math.min(A_FINISH_READ_BACK_PAUSE_MS, Math.max(1, Math.floor(bound / (THE_FINISH_READ_BACK_TRIES * 2))))
  const each = Math.max(1, Math.floor((bound - pause * (THE_FINISH_READ_BACK_TRIES - 1)) / THE_FINISH_READ_BACK_TRIES))
  return { bound, pause, each }
}

/**
 * THE RUN READ BACK AFTER A FINISHING WRITE GOT NO ANSWER AT ALL. It says 'finished' when the run itself reads finished,
 * 'not-finished' when the office answered and the run does not say finished, and 'unread' when nothing could be read
 * within the bound. A status that is not 200 is an answer, and it is not read as finished.
 */
async function theRunReadBackAfterAnUnansweredFinish() {
  const { bound, pause, each } = theReadBackWaits()
  const end = Date.now() + bound
  let last = null
  for (let attempt = 0; attempt < THE_FINISH_READ_BACK_TRIES && Date.now() < end; attempt++) {
    if (attempt > 0) await new Promise((sleep) => setTimeout(sleep, Math.min(pause, Math.max(0, end - Date.now()))))
    if (Date.now() >= end) break
    const read = await askTheOffice(api, `/api/records/${encodeURIComponent(run)}`, {
      headers: aboutTheRun(owner),
      timeoutMs: Math.min(each, Math.max(1, end - Date.now())),
    })
    last = read
    if (read.status === null) continue
    if (read.status !== 200) return { read: 'unread', said: read }
    const data = (read.body?.record ?? read.body)?.data
    return aRunSaysItIsFinished(data !== null && typeof data === 'object' ? data : {}) ? { read: 'finished', said: read } : { read: 'not-finished', said: read }
  }
  return { read: 'unread', said: last }
}

/**
 * ONE LAUNCHER FINISH: the PATCH that finishes a run, waited for as long as a seal may take, and, when nothing answered
 * at all, the run read back before the finish is called refused. The git finish and the records finish both go through
 * here. Answers {done: true, readBack, said} when the run is finished, and {done: false, refused, said, why} when it is
 * not: `refused` says the office answered with a status that is not 200, and then nothing is read back.
 * @param {Record<string, unknown>} body
 */
async function theFinishIsWritten(body) {
  const said = await askTheOffice(api, `/api/records/${encodeURIComponent(run)}`, {
    method: 'PATCH', headers: aboutTheRun(owner), body,
    timeoutMs: aWaitATestMayShorten(THE_FINISH_WAIT_MS, 'SANDBOX_FINISH_WAIT_MS'),
  })
  if (said.status === 200) return { done: true, readBack: false, said }
  if (said.status !== null) return { done: false, refused: true, said }
  const back = await theRunReadBackAfterAnUnansweredFinish()
  if (back.read === 'finished') return { done: true, readBack: true, said }
  const found = back.read === 'not-finished'
    ? 'reading the run back did not find it finished: it reads unfinished'
    : `reading the run back could not read it (${back.said === null ? 'nothing answered' : theOfficeSaid(back.said)})`
  return { done: false, refused: false, said, why: `The finishing write got no answer (${theOfficeSaid(said)}), and ${found}` }
}

/**
 * ACCEPTANCE FINDING 2. Once the command this helper started (the gate, exec'd into it) actually
 * exits, this is the only place left that can still know its real exit code — see the header
 * comment on `relayInBackground` for why. A clean exit with commits past the worktree's cut and a report
 * linked to the run finishes it the ordinary way, which seals it (`sealFinishedRun`, invoked from any
 * PATCH to `finished` for a run with a `servingAgent`), and says the finish was the launcher's reading;
 * the same exit with no report leaves the run as it was and tells its starter (acceptance finding 48);
 * a clean exit with nothing new committed, or with a worktree or cut that could not be read, is never
 * left silent: with a report linked to the run, known absence of commits, and no declared
 * submission except records, it finishes with a records submission. Otherwise the reported run is left as it was
 * and its starter is told why. With no report its starter is told and it is written `orphaned`, so
 * its key goes too. A clean exit whose run record could not be read is left as it is, and its starter
 * is told that, because neither a report nor the run's state is known then (invariant 5). A non-zero
 * exit or a signal is recorded as `crashed`, naming what happened, and is never sealed.
 */
async function finishOrCrashTheRun(code, signal) {
  // HOW THE COMMAND ENDED, ON EVERY WRITE THAT ENDS THE RUN (wave 13j round loop-1). Its first appearance on a run with
  // no seal is when the office records how the round ended and tells the starter once (src/server/lib/how-a-round-ended.ts),
  // so this launcher no longer sends its own message for the ends the office now says.
  const commandEnded = { at: nowStamp(), ...(typeof code === 'number' ? { code } : {}), ...(typeof signal === 'string' ? { signal } : {}) }
  // A MARK OF WAITING ON GO GOES WITH THE COMMAND (round 48), after every write its output asked for.
  if (goWaitEverMarked) theGoWaitIsWritten(null, `run ${run}'s command ended, so its mark of waiting on Go's usage limit is taken off.`, finishLog)
  await goWaitWrites
  const before = await askTheOffice(api, `/api/records/${encodeURIComponent(run)}`, { headers: aboutTheRun(owner) })
  const endedFirst = await theRunWasEndedBeforeItsCommand(before)
  // A FAILED READING MUST NOT COST THE RUN ITS FINISH OR ITS CRASH below, so its error is logged and the rest goes on.
  await theServedIsWritten(before, endedFirst).catch((error) =>
    finishLog(`run ${run}'s model that answered could not be read or recorded: ${error instanceof Error ? error.message : String(error)}`),
  )
  await theReceiptIsWritten(before, endedFirst, signal).catch((error) =>
    finishLog(`The run ran, and its usage receipt was not stored on run ${run}: ${error instanceof Error ? error.message : String(error)}.`),
  )
  const already = before.status === 200 ? (before.body?.record ?? before.body)?.data?.state : undefined
  if (typeof already === 'string') theStateItsEndLeft = already
  if (typeof already === 'string' && RUN_ALREADY_OVER.has(already)) {
    finishLog(`run ${run} already says ${already}; its command's end (code ${String(code)}, signal ${String(signal)}) changes nothing.`)
    return
  }
  if (code === 0) {
    // A READ OF THE RUN THAT FAILED IS NOT A RUN WITH NOTHING IN IT (the inspector's refusal, check
    // invariant 5). Whether a report is linked to the run, and whether it is already over, are both read off
    // its record; with no record read, neither is known. So nothing below guesses them: the starter is told the record
    // could not be read, and the run is left as it is.
    if (endedFirst) return
    if (before.status !== 200) {
      const told = await theStarterIsTold(
        `Run ${run}'s record could not be read when its command ended`,
        `Run ${run}: its command exited 0, and the launcher could not read the run's record (${theOfficeSaid(before)}), so it cannot tell whether a report is linked to it or whether it is already over. It left the run as it is.`,
      )
      finishLog(`run ${run}'s command exited 0, but its record could not be read (${theOfficeSaid(before)}); left as it is; ${told}`)
      return
    }
    // THE FOLDER IS THE ONE THE RUN'S RECORD NAMES NOW, as the cut below is (theFolderTheRunNamesNow).
    const dir = theFolderTheRunNamesNow((before.body?.record ?? before.body)?.data?.workingDirectory, mode === 'agent' ? worktree : runWorkingDirectory)
    // THE CUT IS NAMED AS THE RUN'S RECORD NAMES IT NOW, as the office names it (theBaseARunNames in
    // src/server/lib/sealed-tip.ts): a cutFrom changed after the filing is the one read, and the launcher's own only
    // where the record names none.
    const named = (before.body?.record ?? before.body)?.data?.cutFrom
    const cutFromHere = typeof named === 'string' && named.trim() !== '' ? named : mode === 'agent' ? cutFrom : runCutFrom
    const cutAt = cutFromHere === null ? null : theCutARunIsReadAt(before.body?.record ?? before.body, cutFromHere)
    const has = dir !== null && cutAt !== null ? hasCommitsBeyondTheCut(dir, cutAt) : null
    if (has !== true) {
      // A RUN THAT ENDED WITH NOTHING TO SEAL IS NOT LEFT SILENT. A worker whose work is reading, not code,
      // always ended here, and was left saying running while
      // nobody was told: a reader of wave 13n ended at 09:38 on 29 September 2026, and its supervisor found out at
      // 10:31. With a report linked to it, the checks below decide whether it can finish as records. With none, its
      // starter is told first, while the run's key still proves the run, and then it is written orphaned: nothing holds it
      // and it never said. That is a state that ends a run (RUN_IS_OVER_STATES in src/server/lib/keys.ts), so its key goes
      // in that same write; `unknown` would have kept the key of a run whose command has ended.
      const ended = has === null ? 'exited 0, and its worktree or the branch it was cut from could not be read' : `exited 0 with no commits beyond ${cutFromHere}`
      if (theReportsLinkedTo(before) > 0) {
        // NEVER REPLACE THE RUN'S DECLARED WORK WITH LESS (the inspector; USER.md invariant 2).
        // A report does not turn files, git or mixed work into
        // records alone. An unreadable worktree or cut does not prove there are no commits to seal either.
        // Read the submission from the same record as the reports; leave the run unchanged and tell its starter.
        const submission = (before.body?.record ?? before.body)?.data?.submission
        if (submission !== undefined && submission?.kind !== 'records') {
          // The inspector's note: kinds.ts reads an absent kind as git; say that reading.
          const kind = submission?.kind === undefined ? 'git' : String(submission.kind)
          const declared = submission?.kind === undefined
            ? 'a submission with no kind, which the office reads as git'
            : `a ${kind} submission`
          const why = `Its command ${ended}, and a report is linked to it. It declared ${declared}. The launcher does not replace a declared submission. The run's agent or its starter finishes it with the work it declared.`
          const kept = await theEndIsWritten(why, commandEnded)
          finishLog(`run ${run}'s command ${ended}, with a report; left as ${String(already)} because it declared ${declared}; ${kept}`)
          return
        }
        if (has === null) {
          const why = `Its command ${ended}, and a report is linked to it. Whether it holds commits is not known, so the launcher did not finish it. The run's agent or its starter finishes it once its work can be read.`
          const kept = await theEndIsWritten(why, commandEnded)
          finishLog(`run ${run}'s command ${ended}, with a report; left as ${String(already)} because whether it holds commits is not known; ${kept}`)
          return
        }
        // RECORDS ARE SOMETHING THE LAUNCHER CAN FINISH (a report). Like finding 48's git finish,
        // the detail says whose reading it is.
        // KEEP EVERY DECLARED RECORD (the inspector;
        // USER.md invariant 2). A records submission may name problems or proposals as well as reports.
        // Keep its order, then add only reports linked on the record already read, each record once.
        // The office tells the starter of a finish or an unsealed end. If it refuses to record the end too,
        // the launcher tells the starter both refusals.
        // A RECORDS FINISH IS A SEAL TOO (the inspector's refusal), so it is made only when
        // the run's last word says it seals, as the git seal below is.
        if (!(await itSaysItSeals(before, `${ended}, with a report`, commandEnded, already))) return
        const declared = submission?.records ?? []
        const reports = theReportIdsLinkedTo(before)
        const records = [...new Set([...declared, ...reports])]
        const detail = `Finished by the launcher, which read its command's clean exit (${ended}) and a report linked to it; the agent did not say finished itself.`
        const finish = await theFinishIsWritten({
          // NO REMINDER BEFORE THE SEAL (src/server/lib/before-the-seal.ts): the agent's command has ended, so nobody
          // is left to read one, and a reminder in place of this seal would leave the run unfinished.
          dataPatch: { state: 'finished', submission: { kind: 'records', records }, detail: withStartExplanation(detail), commandEnded }, remindBeforeTheSeal: false, tellTheStarter: 'ended-with-its-report',
        })
        if (finish.done) {
          theStateItsEndLeft = 'finished'
          finishLog(finish.readBack
            ? `run ${run}'s command ${ended}, with a report; ${THE_FINISH_ANSWER_WAS_LATE}; finished with a records submission naming ${records.join(', ')}.`
            : `run ${run}'s command ${ended}, with a report; finished with a records submission naming ${records.join(', ')}; ${theOfficesLine(finish.said)}`)
          return
        }
        const why = finish.refused
          ? `Its command ${ended}, and a report is linked to it. The office refused to finish it with a records submission: ${theOfficeSaid(finish.said)}`
          : `Its command ${ended}, and a report is linked to it. ${finish.why}. The run was not finished.`
        const kept = await theRefusedFinishIsWritten(why, commandEnded)
        finishLog(`run ${run}'s command ${ended}, with a report, but it could not be finished with a records submission (${finish.refused ? theOfficeSaid(finish.said) : finish.why}); ${kept}`)
        return
      }
      // NO REPORT STILL MEANS ORPHANED, even when git cannot be read (USER.md invariant 2).
      // This claims no successful submission:
      // it records the ended command with no account of its work, states the failed read, and revokes its key.
      const why = `Its command ${ended}, and no report is linked to it. Nothing runs for it any more, and it never said whether it did its work.`
      // THE OFFICE TELLS THE STARTER, from the write itself (wave 13j round loop-1): the orphaning ends the round without a
      // seal, and the office records why and wakes the starter once. Only a refused write is this launcher's to say.
      const said = await askTheOffice(api, `/api/records/${encodeURIComponent(run)}`, { method: 'PATCH', headers: aboutTheRun(owner), body: { dataPatch: { state: 'orphaned', detail: withStartExplanation(why), commandEnded } } })
      if (said.status === 200) {
        theStateItsEndLeft = 'orphaned'
        finishLog(`run ${run}'s command ${ended}, with no report; written orphaned; the office tells its starter.`)
        return
      }
      const corrected = await theStarterIsTold(
        `Run ${run} could not be written orphaned`,
        `Run ${run}: ${why} The office refused to write it orphaned (${theOfficeSaid(said)}), so it still says ${String(already)} and its key still works.`,
      )
      finishLog(`run ${run}'s command ${ended}, with no report, but it could not be written orphaned (${theOfficeSaid(said)}); ${corrected}`)
      return
    }
    // A RUN THAT FILED NO REPORT IS NOT FINISHED HERE. Acceptance finding 48 (block f-48),
    // an ask of 23 September 2026. A supervisor under `claude -p`
    // ends its process whenever it ends a turn, and a clean exit with commits past the cut was read as done, which
    // sealed wave 3 in the middle and queued a check of it. A worker that exits cleanly but forgot its report
    // would likewise be sealed, and then refused. So a run with no report linked to it is left as it was: its own
    // words say why, and its starter is told in one message.
    const reports = theReportsLinkedTo(before)
    if (reports === 0) {
      const why =
        `Its command exited 0 with commits beyond ${cutFromHere}, and no report is linked to it, so the launcher left it as it ` +
        'was rather than finish it: a clean exit is not the agent saying it is done, and a check refuses a run with no ' +
        'report. It is finished by its agent, or by its starter, once its report is in.'
      const kept = await theEndIsWritten(why, commandEnded)
      finishLog(`run ${run}'s command exited 0 with commits beyond ${cutFromHere} and no report; left as ${String(already)}; ${kept}`)
      return
    }
    // A RUN IS SEALED HERE ONLY WHEN IT SAYS IT SEALS (9 November 2026). A Terra map
    // round wrote in its report that it was not done, and a clean exit with commits and a report sealed it and queued a check
    // its starter had to stop. So the run's last message to its starter is read by the rule the secretary's seal-wait used
    // (tools/a-run-says-it-seals.mjs). A run that says it does not seal, says nothing of a seal, or whose words could not be
    // read is left as it was: the office records why there is no seal and tells its starter once, as for a run with no report.
    if (!(await itSaysItSeals(before, `exited 0 with commits beyond ${cutFromHere} and a report`, commandEnded, already))) return
    const tip = gitLine(dir, 'rev-parse', 'HEAD')
    const finish = await theFinishIsWritten({
      // THE FINISH SAYS WHOSE READING IT IS (finding 48): the launcher's, of a clean exit, and not the agent's own word.
      // AND NO REMINDER BEFORE THE SEAL, for the reason given at the records finish above.
      dataPatch: { state: 'finished', tip, detail: withStartExplanation(`Finished by the launcher, which read its command's clean exit with commits beyond ${cutFromHere} and a report linked to it; the agent did not say finished itself.`), commandEnded }, remindBeforeTheSeal: false,
    })
    if (finish.done) {
      theStateItsEndLeft = 'finished'
      finishLog(finish.readBack
        ? `run ${run}'s command exited 0 with commits beyond ${cutFromHere}; ${THE_FINISH_ANSWER_WAS_LATE}; finished at ${String(tip)}.`
        : `run ${run}'s command exited 0 with commits beyond ${cutFromHere}; finished at ${String(tip)}.`)
      return
    }
    // A REFUSED FINISH IS STILL THE END OF THE ROUND (wave 13j round loop-1): the end is written, so the office records why
    // there is no seal and tells the starter, rather than this line in finish.log being the only account of it.
    const kept = await theRefusedFinishIsWritten(finish.refused
      ? `Its command exited 0 with commits beyond ${cutFromHere} and a report, and the office refused to finish it: ${theOfficeSaid(finish.said)}`
      : `Its command exited 0 with commits beyond ${cutFromHere} and a report. ${finish.why}. The run was not finished.`, commandEnded)
    finishLog(`run ${run}'s command exited 0 with commits beyond ${cutFromHere}, but it could not be finished (${finish.refused ? theOfficeSaid(finish.said) : finish.why}); ${kept}`)
    return
  }
  const ended =
    signal !== null && signal !== undefined
      ? `Its command in sandbox ${instance.instance} was ended by signal ${signal}.`
      : `Its command in sandbox ${instance.instance} exited ${String(code)}.`
  // AN OPENCODE RUN THAT ENDED ON GO'S USAGE LIMIT IS A QUOTA STOP (round 47), written as the session hook writes a Claude
  // stop, so the router skips every Go row until the reset and the owner is told once. Any other end is the plain crash.
  // The stop cause also keeps where its reset came from, in the reader's words, for every place that shows the reset
  // (round 48).
  const record = before.status === 200 ? (before.body?.record ?? before.body) : null
  const goLimit = !WAIT && record?.data?.runtime === 'opencode' ? theGoLimitAnOpenCodeRunEndedOn(theLastLinesOf(outPath)) : null
  const resets = goLimit === null ? null : clockStamp(() => new Date(goLimit.resetsAtMs))
  const goStop = goLimit === null ? {} : {
    closedAt: commandEnded.at,
    closedHow: 'provider-event',
    closedBecause: `OpenCode Go stopped the run at its usage limit: "${goLimit.said}". The office counts Go as limited until ${resets.stamp} ${resets.timeZone}, ${goLimit.resetFrom}.`,
    stopCause: { kind: goLimit.kind, said: goLimit.said, at: clockStamp(() => new Date(goLimit.atMs)).instant, resetsAt: resets.instant, resetFrom: goLimit.resetFrom },
  }
  // The host worker-run door belongs to the starter. This worker's key cannot ask it.
  // A CODEX RUN THAT ENDED AT A RATE OR USAGE LIMIT, OR AT CAPACITY, whatever its model: both are read only from Codex's own
  // final events, and no list of model names is read. The model named is the Casting row's native model, else the start's.
  const stopModel = aModelToName(startValues?.selection?.native.model ?? startValues?.model ?? null)
  const codexEnded = code !== 0 && code !== null && signal == null && aRuntimeIsCodex(runRuntime) &&
    aCommandsProgram(chosen.command.slice(theProgramAt(chosen.command))).isCodex
  /** @type {'codex-usage-limit' | 'codex-capacity' | undefined} */
  const codexStop = !codexEnded ? undefined : codexRateOrUsageLimitAtTheEnd(outPath) ? 'codex-usage-limit' : codexCapacityAtTheEnd(outPath) ? 'codex-capacity' : undefined
  const notice = codexStop === undefined ? '' : ` ${aCodexStopNotice(codexStop, stopModel)}`
  const detail = `${ended}${notice}`
  const nativeRefusal = code !== 0 && code !== null && signal == null && startValues?.selection?.casting != null
    ? theNativeSelectionRefusal(runRuntime, theLastLinesOf(outPath)) : null
  // AN OPTION REFUSAL OF AN EFFORT THAT IS NOT THE ROW'S OWN HOLDS NOTHING (wave 13n round BK): the row's own effort was
  // not tried, so the refusal says nothing about the row. The sentence says so in the log and in the crash detail. A
  // refusal of the model still holds the row.
  const notHeld = nativeRefusal === null ? null : theRefusalOfAnEffortNotTheRows(startValues, nativeRefusal)
  if (nativeRefusal !== null && notHeld === null) {
    const selected = startValues.selection.casting
    const held = await askTheOffice(api, `/api/casting/rows/${selected.id}/hold`, {method:'POST',headers:aboutTheRun(owner),body:{revision:selected.revision,run,refusal:nativeRefusal}})
    finishLog(held.status === 200 ? `Casting ${selected.id} is held after native refusal: ${nativeRefusal.said}` : `Casting ${selected.id} could not be held after native refusal (${theOfficeSaid(held)}).`)
  }
  if (notHeld !== null) finishLog(notHeld)
  const knownStop = nativeRefusal !== null || codexStop !== undefined || goLimit !== null ||
    isACauseTheyMustActOn(theStopCauseOf(record?.data ?? {})?.kind) || theStopCauseAtTheEndOfTheTranscript(outPath) !== null
  const unknownWords = code !== 0 && code !== null && signal == null && !knownStop ? ` ${UNKNOWN_STOP_CAUSE}` : ''
  // THE OFFICE TELLS THE STARTER OF A CODEX STOP, from `tellTheStarter` on the crash write, in the same sentence. The write
  // carries the kind and the model's name, or null for a model the start did not name, and no other words.
  const tellTheStarter = codexStop
  const crash = { dataPatch: { state: 'crashed', detail: withStartExplanation(detail) + (nativeRefusal === null ? '' : notHeld !== null ? ` ${notHeld}` : ` Native ${nativeRefusal.kind} refusal: ${nativeRefusal.said}`) + unknownWords, commandEnded, ...goStop } }
  const said = await askTheOffice(api, `/api/records/${encodeURIComponent(run)}`, {
    method: 'PATCH',
    headers: aboutTheRun(owner),
    body: { ...crash, ...(tellTheStarter === undefined ? {} : { tellTheStarter, theModelItRanOn: stopModel }) },
  })
  if (said.status === 200) theStateItsEndLeft = 'crashed'
  const goWords = goLimit === null ? '' : ` OpenCode Go's usage limit stopped it; Go counts as limited until ${resets.stamp} ${resets.timeZone}, ${goLimit.resetFrom}.`
  const toldWords = tellTheStarter === undefined ? '' : ` ${theOfficesLine(said)}`
  finishLog(
    said.status === 200
      ? `run ${run} is marked crashed: ${ended}${goWords}${notice}${unknownWords}${toldWords}`
      : `run ${run}'s command ended (code ${String(code)}, signal ${String(signal)}), but it could not be marked crashed (${theOfficeSaid(said)}).${goWords}${notice}`,
  )
}

/** Where the program starts in `command`: after a leading `env` and the NAME=value words that follow it, else 0. */
function theProgramAt(command) {
  let at = 0
  if (aCommandsProgram(command).program === 'env') {
    at = 1
    while (/^[A-Za-z_][A-Za-z0-9_]*=/.test(command[at] ?? '')) at++
  }
  return at
}

// ============================================================================ 7. a finished run's scratch folder

/** Bytes on disk under `path`, links not followed, as du counts them. */
function bytesOnDisk(path) {
  const here = lstatSync(path)
  let bytes = here.blocks * 512
  if (here.isDirectory()) for (const name of readdirSync(path)) bytes += bytesOnDisk(join(path, name))
  return bytes
}


/**
 * A FINISHED RUN'S SCRATCH FOLDER IS REMOVED, WITH WHAT IS IN IT, AFTER THE SAME CHECKS A PERSON MADE BY HAND.
 * On 6 October 2026 the secretary found 129 finished runs' folders in two
 * sandboxes, 26.46 GB, nothing had removed. It runs after finishOrCrashTheRun, and takes the run's state from what the end
 * read or wrote with the run's own key. In this order, each a reason to keep the folder: the path must be exactly the
 * folder this helper made for this run (notTheFolderMade); no process may work in it or hold a file open in it
 * (theProcessesUsing); no git worktree in it may hold changes or files nobody committed, a commit that no ref of its
 * repository holds, or a state git cannot report (whyAWorktreeKeepsIt); and the run must say finished, so a run that is
 * crashed, still running, orphaned or could not be read keeps its folder for the sweep, with a line naming the state
 * read. A record that names the folder does not keep it. An empty folder that passes the first three goes whatever the
 * run's state, as it did before. Each folder is one line
 * in finish.log, with its path, its size and the reason. Nothing here changes the run's exit or its state, and an error
 * is one more line in finish.log.
 */
async function theScratchFolderAfterTheRun() {
  if (theScratchFolderMade === null) return
  const path = theScratchFolderMade
  const kept = (size, why) => finishLog(`the run's scratch folder ${path} (${size}) is kept: ${why}.`)
  if (!lstatSafe(path)) {
    finishLog(`the run's scratch folder ${path} is not there any more, and this helper did not remove it.`)
    return
  }
  const wrong = notTheFolderMade(path, theScratchFolderAsMade)
  if (wrong !== null) return kept('its size not read', wrong)
  const size = `${String(bytesOnDisk(path))} bytes`
  const { using } = theProcessesUsing(theScratchFolderAsMade.real)
  if (using.length > 0) return kept(size, using.join('; '))
  const worktree = whyAWorktreeKeepsIt(theScratchFolderAsMade.real)
  if (worktree !== null) return kept(size, worktree)
  // AN EMPTY FOLDER GOES WHATEVER THE RUN'S STATE: it holds nothing anybody wrote. It is asked
  // after the checks above, because rmdir also takes an empty folder a process still works in.
  if (readdirSync(path).length === 0) {
    rmdirSync(path)
    return finishLog(`the run's scratch folder ${path} (${size}) is removed: it was empty, and no process works in it.`)
  }
  // THE STATE ITS END LEFT, read or written there with the run's own key; nothing is read again (theStateItsEndLeft).
  const state = theStateItsEndLeft
  if (state === null) return kept(size, `run ${run}'s record could not be read when its command ended, so whether it finished is not known`)
  if (state !== 'finished') return kept(size, `run ${run} says ${JSON.stringify(state)}, not finished`)
  // ASKED AGAIN, WITH NOTHING WAITED ON BETWEEN THIS ANSWER AND THE REMOVAL (tools/scratch-folder-checks.mjs says why).
  const now = theScratchFolderIsStillFree(path, theScratchFolderAsMade)
  if (now.why !== null) return kept(size, `${now.why}, found when it was asked again just before the removal`)
  rmSync(theScratchFolderAsMade.real, { recursive: true })
  const unread = now.unreadable.length === 0 ? '' : `; ${theProcessesNotRead(now.unreadable)}`
  finishLog(`the run's scratch folder ${path} (${size}) is removed: run ${run} is finished, no process works in it or holds a file in it${unread}.`)
}

/** Whether anything at all, a broken link included, stands at `path`. */
function lstatSafe(path) {
  try {
    lstatSync(path)
    return true
  } catch {
    return false
  }
}

// ============================================================================ --wait: stay in front

/**
 * THE CALLER'S OWN COMMAND, RUN TO ITS END (--wait). The command's output is already this helper's
 * own. Signals this helper gets go on to the command's whole group; the limit, when there is one, is
 * enforced here, inside the container. When the command ends, end.json is written, the process row
 * is closed through the ledger's release door (which also stops anything the command left in its
 * group), a seat taken with --slot is given back, and this helper exits with the command's code.
 */
async function runInFront() {
  const toTheGroup = (signal) => {
    try {
      process.kill(-innerPid, signal)
    } catch {
      // The group is already gone.
    }
  }
  for (const signal of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(signal, () => toTheGroup(signal === 'SIGHUP' ? 'SIGTERM' : signal))
  const ended = new Promise((done) => {
    if (gateExited !== null) done(gateExited)
    else gate.once(GATE_END, (code, signal) => done({ code, signal }))
  })
  await new Promise((sent) => gate.stdin.end(`go\n${row.id}\n`, sent))
  const sweeping = theScratchSweep()
  const fullStartLine = `${THE_WAITED_START_PREFIX}${JSON.stringify(start)}\n`
  appendFileSync(launchDetails, fullStartLine)
  process.stderr.write(chosen.verbose === true ? fullStartLine : `${THE_WAITED_START_PREFIX}${JSON.stringify({
    run: start.run,
    hostPid: start.hostPid,
    hostPgid: start.hostPgid,
    processRow: start.processRow,
    ...(opencode === null ? {} : { opencode }),
    ...(startValues === null ? {} : { model: startValues.model, startWords: startValues.words }),
    details: launchDetails,
  })}\n`)
  let timedOut = false
  const limit =
    TIMEOUT_SECONDS === null
      ? null
      : setTimeout(() => {
          timedOut = true
          say(`the command reached its limit of ${String(TIMEOUT_SECONDS)} s: its group gets SIGTERM now, and SIGKILL in 30 s if anything is left.`)
          toTheGroup('SIGTERM')
          setTimeout(() => toTheGroup('SIGKILL'), 30_000).unref()
        }, TIMEOUT_SECONDS * 1000)
  const { code, signal } = await ended
  if (limit !== null) clearTimeout(limit)
  const exit = timedOut ? 124 : code !== null ? code : 128 + (osConstants.signals[signal] ?? 0)
  const said = timedOut
    ? `it was stopped at its limit of ${String(TIMEOUT_SECONDS)} s`
    : signal !== null
      ? `it was ended by ${signal}`
      : `it exited ${String(code)}`
  writeWhole(join(logs, 'end.json'), `${JSON.stringify({ code, signal, timedOut, exit, endedAt: clockStamp().instant }, null, 2)}\n`, THE_MODE_OF_A_PLAINLY_WRITTEN_FILE)
  if (HANDSHAKE !== null) {
    // THE HOST WROTE THE ROW, AND THE HOST CLOSES IT, when this helper's exit ends its docker exec (see the header).
    writeWhole(join(HANDSHAKE, 'end.json'), `${JSON.stringify({ exit, said })}\n`, THE_MODE_OF_A_PLAINLY_WRITTEN_FILE)
  } else {
    const closed = await askTheOffice(api, `/api/resources/${encodeURIComponent(row.id)}/release`, {
      method: 'POST',
      headers: aboutTheRun(owner),
      body: { note: `The command ended: ${said}` },
    })
    if (closed.status !== 200) say(`the process row ${row.id} could not be closed (${theOfficeSaid(closed)}); it may still say something runs.`)
  }
  if (slot !== null) {
    const back = spawnSync(
      process.execPath,
      [join(HERE, 'slot.mjs'), 'release', slot, '--session', owner, '--as', starter, '--workspace', workspace, '--api', api, '--note', `the command ended: ${said}`],
      { encoding: 'utf8', stdio: ['ignore', 'ignore', 'pipe'] },
    )
    if (back.status !== 0) say(`the ${chosen.slot} seat ${slot} could not be given back (${String(back.stderr ?? '').trim() || `exit ${String(back.status)}`}); it is freed when the office finds the row closed.`)
  }
  say(`the command ended: ${said}. This helper exits ${String(exit)}.`, exit === 0)
  await sweeping
  process.exit(exit)
}

if (WAIT) await runInFront()

// THE COMMAND GOES NOW, so from here the gate's exit takes the scratch folder back, and this helper's own exit does not
// (aScratchFolder).
process.removeListener('exit', takeBackTheScratchFolder)
process.removeListener('exit', takeBackTheOfficeMcpConfiguration)
gate.stdin.end(`go\n${row.id}\n`, () => {
  nobodyReadsThisCopyAnyMore(logs)
  process.stdout.write(`${JSON.stringify(start)}\n`)
  // THE SWEEP GOES NOW, BESIDE THE COMMAND (theScratchSweep). This copy does not exit while it is still asking or waiting.
  void theScratchSweep()
  // THE CALLER HAS WHAT IT NEEDS (the line above). For the caller's own command (no run), there is
  // nothing to finish or seal, so this background copy normally unrefs the gate and lets Node exit;
  // a Claude MCP file needs it to stay for cleanup. For a run, this background copy STAYS UP so it
  // remains the gate's real parent until it actually exits, which is what step 6 needs.
  if (run === null) {
    // A Claude command with a key file keeps this detached helper as its parent for cleanup too.
    if (theOfficeMcpConfiguration === null) gate.unref()
  } else {
    // NO REMINDER IS KEPT HERE: the office tells the starter of a run still running after 8 hours, on its own clock
    // (the reminder rule, item 5).
    gate.on(GATE_END, async (code, signal) => {
      finishOrCrashTheRun(code, signal)
        .catch((error) => finishLog(`could not finish or crash run ${run}: ${error instanceof Error ? error.message : String(error)}`))
        // A FINISHED RUN'S SCRATCH FOLDER GOES ONLY AFTER ITS STATE IS WRITTEN, and a failure here is a line, never a change to it.
        .then(theScratchFolderAfterTheRun)
        .catch((error) => finishLog(`checking or removing the run's scratch folder ${String(theScratchFolderMade)} failed (${error instanceof Error ? error.message : String(error)}); what is left of it stays.`))
    })
  }
  // WHAT IT SAYS NEXT MAY FIND THE PIPES GONE, which is harmless now (nobodyReadsThisCopyAnyMore above). The exit
  // listener is attached before it, so a command that ends at once is still finished or crashed.
  const sayItIsRunning = () =>
    say(
      `${mode === 'agent' ? `run ${run} of ${chosen.agent}` : mode === 'run' ? `run ${run}` : `${starter}'s command`} is running ` +
        `in sandbox ${instance.instance} as host pid ${start.hostPid}, group ${start.hostPgid}, ledger row ${row.id}${startValues === null ? '' : `; ${startValues.model === null ? '' : `model ${startValues.model}; `}${startValues.words}`}. Output: ${outPath}`,
      true,
    )
  if (PAUSE_AFTER_THE_START_LINE_MS > 0) setTimeout(sayItIsRunning, PAUSE_AFTER_THE_START_LINE_MS)
  else sayItIsRunning()
})
