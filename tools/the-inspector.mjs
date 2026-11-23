// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { bootstrapEnvironment, keysPathFrom, mergedEnvironment, transientToolContext } from '../src/config/settings.mjs'
import { refuseToRemoveIfAnybodyIsIn, whoStillUses } from './live-processes.mjs'
import { removeCheckWorktree } from './check-worktrees.mjs'
import { theWorktreesFolder } from '../src/config/sandbox-folder.mjs'
import { CHECK_ENDED_WITH_NO_VERDICT, THE_PATHS_HANDED_ON_FOR_JUDGMENT, THE_UNPOSTED_VERDICT, THE_YESES_OPTIONS, BECAUSE_THIS_REVISION_READS_NO_YESES, theYesesOptionsAreIgnored } from '../src/config/inspection-ending.mjs'
/**
 * THE INSPECTOR: ONE RUN THAT CHECKS ONE OTHER RUN AND WRITES THE RELEASE OR THE REFUSAL.
 *
 * Criteria C19 to C23, C25 and C26 of design/rules/ACCEPTANCE.md:
 * A new inspector agent may be set up to learn all the legal precedents, first in outline rather than
 * all in its context, and with a semantic level of its own. The inspector checks the work, and a message
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT DOES, IN FOUR STEPS
 * ---------------------------------------------------------------------------------------
 *
 *   1. Reads the check: GET /api/checks/<run>. That says which agent the run serves and the work
 *      area it registered when it started.
 *   2. Finds every change with git, in the checkout you name, and reads the ones inside that area. The words:
 *      The area an agent works in is registered when its worker starts, so the changed place is easy to find.
 *      A files seal has no git: the tool copies its staged files, checks each
 *      against the seal, and reads the copy instead (aStagedCopyOfItsOwn).
 *   3. Asks the server to assemble the prompt: POST /api/checks/<run>/prompt. The server writes
 *      every chapter out at its name and what it governs, and only the chapters the brief named
 *      further, so the check never loads the whole code.
 *   4. Runs the Casting harness through the launcher's shared command start values, and posts the answer to
 *      POST /api/checks/<run>, which is the one act that writes both messages.
 *      A completed answer with no verdict is asked once in that same session. If the completed
 *      second answer also gives none, exit 42 tells the message worker that ending. The office
 *      may queue one new whole check; this tool starts none. Other failures keep their own exits.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE GIT READING IS HERE AND NOT IN THE SERVER
 * ---------------------------------------------------------------------------------------
 *
 * Nothing under src/ may spawn a process. So this tool finds the changes and the server sorts them, and the one rule
 * saying which are inside the work area is src/config/work-area.mjs, read by both. The split is the
 * same one the message worker has and for the same reason.
 *
 * ---------------------------------------------------------------------------------------
 * HOW TO RUN IT
 * ---------------------------------------------------------------------------------------
 *
 *   node tools/the-inspector.mjs --run <session id> --as <inspector handle> --check <session id> --checkout <dir>
 *   node tools/the-inspector.mjs --run <session id> --as <handle> --dry     say the size, run nothing
 *
 * `--check` names the check's own session record. A check that runs a model needs it, on the host as in the
 * sandbox. It must be a record id of 12 characters, each a letter, a digit, - or _. Any other value stops
 * the check before anything is assembled. Only `--dry` may leave it out, and then it sends no session at all.
 *
 * `--dry` is how the prompt's size is measured without spending a model call, and it is what the
 * byte figures in a handback come from. It writes no verdict; it does keep what the assembly
 * measured on the run, through POST /api/checks/<run>/assembled, so the same five figures are
 * readable in Mole Office rather than only in the terminal it was printed to.
 *
 * ---------------------------------------------------------------------------------------
 * A SCOPED CHECK, AND THE PATHS A CHECKER TOOL HANDS ON (sandbox v1, decisions R2 and R4)
 * ---------------------------------------------------------------------------------------
 *
 *   node tools/the-inspector.mjs --run <id> --as <handle> --check <id> --only <path...>
 *   node tools/the-inspector.mjs --run <id> --as <handle> --check <id> --needs-judgment <file.json>
 *
 * `--only` judges only the named changed paths. The verdict follows file content: when a submission
 * was judged once and then some of its files changed (a rebase in the merge queue), only those files
 * are judged again, and the rest keep the earlier verdict. The worktree, the base and the run of the
 * model are the same as any check; what changes is which diffs are read, what the prompt tells the
 * inspector to judge, and that the verdict carries `read.only`, so it can never be read as a verdict
 * on the whole submission. The one rule for which paths are in the scope is `insideTheScope`, read
 * by this tool and by the server.
 *
 * `--needs-judgment` reads the list a checker tool writes (src/config/needs-judgment.mjs): the
 * protected paths the submission changed that the tool could not decide. This tool reads each one's
 * diff, even outside the work area, because judging it is the inspector's whole job; the server
 * writes them into the prompt, and the verdict carries the list as `read.needsJudgment`. A path the
 * change does not touch is dropped by the server, and the verdict carries the list as used. A files
 * seal's check also runs the files checker over its copy, and adds what that hands on to the same
 * list, so the model judges each such file with a line of its own (A2, whatTheFilesCheckerHandsOn).
 *
 * ---------------------------------------------------------------------------------------
 * WHERE THE CODE UNDER CHECK RUNS: IN THE INSPECTOR'S SANDBOX
 * ---------------------------------------------------------------------------------------
 *
 * A check tests code nobody has trusted yet, so its model runs in a sandbox. The inspector prepares
 * dependencies but builds nothing, under a decision. This tool still does its own work on the
 * host: it reads the office, cuts the worktree, reads the diffs and posts the verdict.
 * Each check has an independent copy inside the instance's check-views folder. The launcher mounts
 * that copy at /work for the model, alongside a private native home and protected carried inputs.
 * tools/inspector-sandbox.mjs says how the
 * sandbox is started, shared and stopped, how each command is registered and waited for, and how the
 * model signs in.
 *
 * A CHECK THAT CANNOT HAVE ITS SANDBOX FAILS, and says why. Nothing falls back to the host by itself.
 *
 *   --on-the-host      runs the model on the host, as every check did before, with
 *                      Claude reading tools or Codex's read-only sandbox. The record says it was chosen.
 *   --dry              runs no model and builds nothing, so it needs no sandbox; it cuts its worktree
 *                      on the host and only reads.
 *   --sandboxes <dir>, --sandbox-from <checkout>
 *                      where the inspector's instance folder is, and the checkout its sandbox is made
 *                      from the first time; the launcher's own defaults when not given.
 */

import { spawn } from 'node:child_process'
import { execFileSync, spawnSync } from 'node:child_process'
import { closeSync, constants, cpSync, existsSync, fstatSync, lstatSync, mkdirSync, openSync, readdirSync, readFileSync, readSync, realpathSync, renameSync, rmSync, symlinkSync, writeFileSync, writeSync } from 'node:fs'
import { createHash, randomUUID } from 'node:crypto'
import { homedir } from 'node:os'
import { basename, dirname, isAbsolute, join, relative } from 'node:path'

import { clockStamp, elapsedSeconds, nowStamp } from '../src/shared/time.ts'
import { stampEachLine } from './inspector-log-times.mjs'
import { TWELVE_ID_CHARACTERS } from '../src/shared/record-id-shape.ts'
import { NOT_READ_BY_THE_PLUGIN_RULE, thePluginRuleOf } from '../src/shared/plugin-change.ts'
import { whereIsTheApi, whichWorkspace } from './where-is-the-api.mjs'
import { inspectionSettings, inspectionApiWaitMilliseconds, inspectionOfficeBackMilliseconds } from '../src/config/inspection.mjs'
import { THE_MOST_RECORDS_A_CHECK_CARRIES } from '../src/config/check-records.mjs'
import { THE_MOST_DECISIONS_A_CHECK_CARRIES } from '../src/config/check-records.mjs'
import { insideTheScope, insideTheWorkArea } from '../src/config/work-area.mjs'
import { insideTheFilesArea, theFoldersThatMoved } from '../src/config/files-area.mjs'
import { readTheNeedsJudgmentList } from '../src/config/needs-judgment.mjs'
import { inspectionBase, inspectionTrunk, theNewerTrunk } from '../src/config/inspection-base.mjs'
import { onlyTheKeysTheDoorAccepts, whatSaysTakes } from '../src/config/verdict-keys.mjs'
import { aCheckOfHandedBackPackages, onlyTheRealFaults, theUnreadPartsSay } from '../src/config/verdict-kinds.mjs'
import { chaptersAtTheLevelsWrittenOut, readAChaptersLine } from '../src/shared/chapters.ts'
import { checkSavedChapterClaims } from '../src/shared/round-chapters/manifest.ts'
import { NO_DECISION_WAS_GIVEN, whatSaysTakesUnderSavedChapters } from '../src/config/inspection-saved-chapters-says.mjs'
import { thePathsAReleaseLeftUntraced, theRecordsATraceNamedThatAreNotHeld, tracedAtTheDoorsWords } from '../src/shared/releasing.ts'
import { theShapeTheDoorTakesFor, whatTheVerdictDoorWouldSay } from '../src/shared/the-verdict-door.ts'
import { THE_FILES_CHECKER } from './checks/where-the-checkers-are.mjs'
import { inspectionUsageIn, inspectionUsageLine, inspectionUsageReceipt, jsonLines, theReceiptWrittenOver } from '../src/config/usage.mjs'
import { theFileThatWasChecked } from './inspector-checked-file.mjs'
import { aDependencyCopyBegun } from './inspector-dependency-copy.mjs'
import { aPhotographBegun, aPhotographOf } from './inspector-photographs.mjs'
import { theCheckoutInsideTheSandbox } from './inspector-checkout.mjs'
import { aCommandsStartValues, aCodexTierWarning, theDshSelection } from './sandbox-common.mjs'
import { applyLauncherSelection, readLauncherSelection, whyAStartCannotTakeTheProviderRow } from '../src/config/launcher-selection.mjs'
import { providerKeyFromTheKeyFileAt } from '../src/config/provider-keys.mjs'
import { THE_PROVIDER_KEY_USES } from '../src/shared/the-provider-table.ts'
import { HOW_EACH_COMMAND_TAKES_AN_EFFORT } from '../src/config/how-a-command-takes-an-effort.mjs'
import { putTheFeaturesOffBesideTheClient } from './inspector-dsh-acp.mjs'
import { DSH_FEATURES_OFF, aCommandWithTheHarnessFeaturesOff } from './harness-features-off.mjs'
import { projectKey, theTextOfTheTranscript, theTranscriptOfTheSession } from './dsh-hooks/served.mjs'
import { theKeyReminder, whereAMessageHoldsAKey } from '../src/shared/message-keys.ts'
import { withoutTheProvider } from '../src/config/model-efforts.mjs'
import { aCommandsProgram, aRuntimeIsCodex, FULL_PERMISSIONS } from '../src/config/run-permissions.mjs'
import { theEnvironmentACodexGets } from '../src/config/the-environment-a-codex-gets.mjs'
import { KEY_HEADER } from '../src/config/key-header.mjs'
import { STAND_IN_HEADER } from '../src/config/stand-in-header.mjs'
import { FROM_ITS_COMMIT, SEAL_READ_HEADER } from '../src/config/seal-read-header.mjs'
import { theOfficeKey } from '../src/config/office-key.mjs'
import { spoolAGateMet } from '../src/config/gate-count-spool.mjs'
import { DSH_CHECK_ENV, EVERY_SECRET_A_CHECK_IS_HANDED, OPENCODE_CHECK_ENV, aCommandWithItsEnv, aLoginForTheModel, aSandboxForThisCheck, copyTheDshClient, fetchIntoTheSandbox, leaveTheSandbox, maskedOfWhatTheViewIsHanded, runInside, stopWhatRunsInside, takeTheLoginBack, theCodexProviderOptions, theDshCheckCommand, theModelsEnvironmentOnTheHost, theSecretNamesOf, whereTheCheckIsCut, whyTheCheckViewFails, withTheSecretsMasked } from './inspector-sandbox.mjs'
import { askTheOfficeQuietly, theViewSweepBegins } from './inspector-view-sweep.mjs'
import { guardedGit, guardedGitBytes, guardedGitRun, outsideTheCommitInLines } from './sandbox-git.mjs'
import { askForAStandardRelease } from './standard-change.mjs'
import { TEST_BATCH_POOL, aTestBatchSeat } from './test-batch-seat.mjs'
import { theCheckBeganAsking, theCheckFinishedAsking } from '../src/config/a-checks-seat-wait.mjs'
import { runAStandardCheckAsAChild, runASandboxStandardCheck, theKeptLogsSay, theKeptOutputSays, thePreparationLimit, theTimeLeft } from './standard-check-runs.mjs'
import { stopAnUnpairedStableStart } from '../src/config/the-office-tool-environment.mjs'

/**
 * THE DATABASE THE WORKER SERVES, AS THE WORKER HANDED IT TO THIS TOOL, and then taken out of this
 * process's environment.
 *
 * The message worker gives the check tool `MOLE_OFFICE_DB`, an absolute path, and gives it to no other
 * runtime (`envFor`, src/worker/runtimes/adapter.ts). This tool needs it for one thing: to find the
 * office's key beside that database. So the value is kept here, and the variable is removed before
 * this tool starts any process. Every process it starts (the model on the host, git, the
 * sandbox tools) inherits this process's environment, and none of them gets the database path.
 * Absent when the tool was started without it; the key is then read as `theOfficeKey()` reads it.
 */
const THE_SERVED_DATABASE = process.env['MOLE_OFFICE_DB']
delete process.env['MOLE_OFFICE_DB']
// The verdict alone uses the check run's key; no child process receives it.
const THE_CHECK_RUN_KEY = process.env['MOLE_AGENT_KEY']
delete process.env['MOLE_AGENT_KEY']

/**
 * THE OFFICE'S OWN KEY, beside the database this tool was started with, or why there is none. Read per request: the
 * checkout's .env and the database's own settings, through mergedEnvironment (src/config/settings.mjs), and then the
 * keys.json beside that database, through src/config/office-key.mjs.
 */
const theHeldOfficeKey = () => theOfficeKey(theOfficesEnvironment())

/**
 * THE ENVIRONMENT THE OFFICE'S KEY FILE IS FOUND FROM: the checkout's .env and the database's own settings through
 * mergedEnvironment, with the database this tool was started with, or bootstrapEnvironment when it was started without
 * one (src/config/settings.mjs). The office's own key and a check's provider key are both read from the keys.json it
 * names, so they are read from the same file.
 */
function theOfficesEnvironment() {
  return THE_SERVED_DATABASE === undefined ? bootstrapEnvironment() : { ...mergedEnvironment(), MOLE_OFFICE_DB: THE_SERVED_DATABASE }
}

/** THE OFFICE'S OWN KEY ON THE ONE HEADER IT TRAVELS ON. Criterion P83, point 5. Read per request.
 * @returns {Record<string, string>} */
function theOfficeKeyHeader() {
  const held = theHeldOfficeKey()
  return held.key === null ? {} : { [KEY_HEADER]: held.key }
}

function usage(why) {
  if (why !== '') process.stderr.write(`${why}\n\n`)
  process.stdout.write(
    [
      'node tools/the-inspector.mjs --run <session id> --as <inspector handle> --check <session id> \\',
      '    [--checkout <dir>] [--against <git ref>] [--model <name>] [--limit <minutes>] [--dry] [--api <url>]',
      '    [--only <path...>] [--needs-judgment <file.json>] [--on-the-host] [--sandboxes <dir>] [--sandbox-from <dir>]',
      '',
      '  --run       the run to check. A run is a record of kind session. Required.',
      '  --check     this check\'s own session record. Required for a check that runs a model, in the',
      '              inspector\'s sandbox and on the host, because the verdict door reads it as the check\'s',
      '              own session. Only --dry may leave it out, and then sends no session at all.',
      '              It must be a record id of 12 characters, each a letter, a digit, - or _. Any other',
      '              value stops the check before anything is assembled, including with --dry.',
      '              A check in the inspector\'s sandbox needs it to be a session record, because the',
      '              container and its processes are registered against it.',
      '  --as        the handle of the agent doing the checking. It must hold the inspector card,',
      '              which only the person gives. Required.',
      '  --checkout  where to look for the changes with git. Default: this checkout.',
      '  --against   what to compare against. Default: the fork point — the merge base of this',
      '              checkout and the branch it was cut from, which the run\'s record names and is',
      '              main where it does not. The prompt says which base was used and how it was',
      '              found, and a base typed here is said to have been typed.',
      '  --model     which model runs the check. Default: what the office names for a check by --as, from the Casting table row for the inspector, else MOLE_OFFICE_INSPECTION_MODEL.',
      '              Its runtime and effort come with the model. Claude Code, Codex, private OpenCode and private dsh checks are supported.',
      '  --limit     how many minutes the check may take. Default: MOLE_OFFICE_INSPECTION_MINUTES.',
      '              A check that runs out of',
      '              time says so and writes nothing; it is not a refusal.',
      '  --dry       assemble the prompt and say its size; run no model and write no verdict. It DOES',
      '              write one thing: what this assembly would read is kept on the run, so a person can',
      '              read it in Mole Office instead of in this terminal. Nothing about the release or',
      '              the refusal is written.',
      '  --api       which server to ask. Default: the one this checkout is set to.',
      '  --workspace which project the run is in. Default: the one this checkout is set to.',
      '  --only      a scoped check: judge only these changed paths, as git spells them. The other',
      '              changed paths keep an earlier verdict and are named, not read. Every path named',
      '              must be one this submission changed, or nothing is assembled. The verdict says',
      '              it was scoped.',
      '  --needs-judgment',
      '              a JSON file from a checker tool: the protected paths it could not decide, each',
      '              {"path","why"}, as a list or under "needsJudgment". Their diffs are read even',
      '              outside the work area and handed to the inspector to judge. A path the change',
      '              does not touch is dropped, and the check says so; a list left with no path stops it.',
      `  ${THE_YESES_OPTIONS.join(', ')}  an older office gives these. This check takes them and ignores them, ${BECAUSE_THIS_REVISION_READS_NO_YESES}.`,
      '  --on-the-host',
      '              run the model here with Claude reading tools or Codex read-only permissions, outside the',
      '              inspector\'s sandbox. Without it a check that cannot have its sandbox fails and says why.',
      '  --sandboxes where the inspector\'s sandbox instance folder is. Default: the sandbox launcher\'s.',
      '  --sandbox-from',
      '              the checkout the inspector\'s sandbox is made from when it is first started.',
      '              Default: the sandbox launcher\'s (the main checkout of this repository).',
      '',
      'It prints the prompt size in bytes, what the whole of the office regulations would have been, and what',
      'the check answered. A refusal opens a group; the group id is printed.',
    ].join('\n') + '\n',
  )
  process.exit(2)
}

function readArguments(argv) {
  const chosen = {
    run: null,
    check: null,
    as: null,
    checkout: null,
    against: null,
    model: null,
    limit: null,
    api: null,
    workspace: null,
    dry: false,
    /** @type {string[] | null} */
    only: null,
    /** @type {string | null} */
    needsJudgment: null,
    /** @type {string | null} */
    yeses: null,
    /** @type {string | null} */
    yesesOf: null,
    /** @type {string | null} */
    noYeses: null,
    onTheHost: false,
    /** @type {string | null} */
    sandboxes: null,
    /** @type {string | null} */
    sandboxFrom: null,
  }
  for (let i = 0; i < argv.length; i += 1) {
    const word = argv[i]
    if (word === '--dry') chosen.dry = true
    else if (word === '--on-the-host') chosen.onTheHost = true
    else if (word === '--sandboxes') chosen.sandboxes = argv[(i += 1)] ?? ''
    else if (word === '--sandbox-from') chosen.sandboxFrom = argv[(i += 1)] ?? ''
    else if (word === '--help' || word === '-h') usage('')
    else if (word === '--run') chosen.run = argv[(i += 1)]
    else if (word === '--check') chosen.check = argv[(i += 1)]
    else if (word === '--as') chosen.as = argv[(i += 1)]
    else if (word === '--checkout') chosen.checkout = argv[(i += 1)]
    else if (word === '--against') chosen.against = argv[(i += 1)]
    else if (word === '--model') chosen.model = argv[(i += 1)]
    else if (word === '--limit') chosen.limit = Number(argv[(i += 1)])
    else if (word === '--api') chosen.api = argv[(i += 1)]
    else if (word === '--workspace') chosen.workspace = argv[(i += 1)]
    else if (word === '--only') {
      // EVERY WORD UP TO THE NEXT OPTION IS A PATH. Named twice is named once.
      const named = []
      while (i + 1 < argv.length && !argv[i + 1].startsWith('--')) named.push(argv[(i += 1)])
      if (named.length === 0) usage('--only must name at least one path.')
      chosen.only = [...new Set([...(chosen.only ?? []), ...named])]
    }
    else if (word === '--needs-judgment') chosen.needsJudgment = argv[(i += 1)] ?? ''
    else if (word === '--yeses') chosen.yeses = argv[(i += 1)] ?? ''
    else if (word === '--yeses-of') chosen.yesesOf = argv[(i += 1)] ?? ''
    else if (word === '--no-yeses') chosen.noYeses = argv[(i += 1)] ?? ''
    else usage(`I do not know the option ${word}.`)
  }
  return chosen
}

// THE START CHECK (wave 13q), before the arguments are read: a stable checkout at a dated stable tag started without the
// pairing would read its own defaults.
stopAnUnpairedStableStart()

const chosen = readArguments(process.argv.slice(2))
if (chosen.run === null || chosen.run === undefined) usage('Say which run to check, with --run.')
if (chosen.as === null || chosen.as === undefined) usage('Say who is checking, with --as.')
if (chosen.limit !== null && (!Number.isFinite(chosen.limit) || chosen.limit <= 0)) usage('--limit must be a positive number of minutes.')
if (chosen.model !== null && (chosen.model === undefined || chosen.model.trim() === '')) usage('--model must name a model.')
for (const [flag, value] of [['--sandboxes', chosen.sandboxes], ['--sandbox-from', chosen.sandboxFrom]]) {
  if (value !== null && !isAbsolute(value)) usage(`${flag} must be an absolute path.`)
}
// A CHECK THAT RUNS A MODEL NAMES ITS OWN SESSION, on the host as in the sandbox (gap 2, hYSaAc6dw4_Y). The verdict
// door reads x-mole-office-session as that session, and a made-up id there named none, so a stopped check's verdict was taken.
if (!chosen.dry && (chosen.check === null || chosen.check === undefined)) {
  usage(
    'Say which check this is, with --check <the session record of this check>. A check that runs a model needs it, ' +
      "in the inspector's sandbox and on the host, because the verdict door reads it as the check's own session. " +
      'Only --dry may leave it out. Nothing was assembled and nothing was written.',
  )
}
// The clause is kept in step with the verdict door by a-check-that-names-no-record-id-stops-before-anything.test.ts.
const ONE_RECORD_ID = new RegExp(`^${TWELVE_ID_CHARACTERS.source}$`)
if (chosen.check !== null && (typeof chosen.check !== 'string' || ONE_RECORD_ID.exec(chosen.check)?.[0] !== chosen.check)) {
  usage(
    "--check does not hold a record id. It must hold the id of the check's own session, " +
      'which is 12 characters, each a letter, a digit, - or _. This tool never looks a session up by its title or by a name. ' +
      'Nothing was assembled and nothing was written.',
  )
}
/**
 * WHETHER THE CODE UNDER CHECK AND THE MODEL RUN IN THE INSPECTOR'S SANDBOX. They do unless somebody
 * typed --on-the-host. A --dry assembly runs neither, so it has no sandbox.
 */
const IN_A_SANDBOX = !chosen.onTheHost && !chosen.dry
/** The session --check names, sent as x-mole-office-session; null only for a --dry assembly that named none. */
const THE_CHECKS_SESSION = chosen.check ?? null
/** That session, or for such a --dry assembly a random name used only for its folders, and never sent to the office. */
const CHECK_ID = THE_CHECKS_SESSION ?? randomUUID()
if (!/^[a-zA-Z0-9_-]+$/u.test(CHECK_ID) || !/^[a-zA-Z0-9_-]+$/u.test(chosen.run)) {
  usage('The run and check ids must contain only letters, numbers, underscores and hyphens.')
}
stampEachLine(process.stdout)
stampEachLine(process.stderr)
// THE YESES OPTIONS AN OLDER OFFICE GIVES are taken and ignored, because this revision reads no yeses. One line says
// which of them this check was given, in the order of THE_YESES_OPTIONS (src/config/inspection-ending.mjs).
{
  const held = { '--yeses': chosen.yeses, '--yeses-of': chosen.yesesOf, '--no-yeses': chosen.noYeses }
  const given = THE_YESES_OPTIONS.filter((option) => held[option] !== null)
  if (given.length > 0) process.stdout.write(`${theYesesOptionsAreIgnored(given)}\n`)
}
/**
 * THE LIST A CHECKER TOOL HANDED ON, read before anything else happens, so a list that cannot be
 * read stops the check before it asks the office anything or cuts a worktree. Null: none was given.
 */
// A `let`, because a files seal's check adds what the files checker hands on over its own copy (A2).
let NEEDS_JUDGMENT = (() => {
  if (chosen.needsJudgment === null) return null
  if (chosen.needsJudgment === '') usage('--needs-judgment must name a file.')
  try {
    const read = readTheNeedsJudgmentList(JSON.parse(readFileSync(chosen.needsJudgment, 'utf8')))
    process.stdout.write(`${chosen.needsJudgment}: ${read.says}\n`)
    return read.list
  } catch (why) {
    process.stderr.write(
      `The needs-judgment list in ${chosen.needsJudgment} could not be read: ${why instanceof Error ? why.message : String(why)}\n` +
        'Nothing was read and nothing was written.\n',
    )
    process.exit(2)
  }
})()

const API = whereIsTheApi(chosen.api ?? undefined)
const WORKSPACE = chosen.workspace ?? whichWorkspace()
/** Where the worker's work is. Nothing reads it directly: `WHERE` below is what the check reads. */
const THE_WORKERS_CHECKOUT = chosen.checkout ?? process.cwd()

/**
 * WHERE THE CHECK ACTUALLY READS AND RUNS: A DETACHED WORKTREE OF ITS OWN, AT THE RUN'S TIP.
 *
 * Criterion C30, on what the first office-started check did wrong. That check ran inside the
 * worker's own worktree: it read the tree while the worker still had it, and the run it started
 * ran tests there, contending with the worker's own build over the same node_modules,
 * the same dist and the same ports. Two processes writing one working tree is not a check of it.
 *
 * SO THE CHECK GETS ITS OWN. An independent clone in a private view, or a detached linked worktree
 * on the host, checks out the tip the run committed before anything is read. The copy is removed
 * after delivery when its processes have ended. The tip pins what the run committed rather than
 * whatever is half-saved in the worker's editor.
 *
 * IT IS THE TOOL THAT MAKES IT AND NOT THE SERVER, for the reason everything else about git is here:
 * nothing under src/ may spawn a process.
 *
 * WHAT IT COSTS. The worker's uncommitted changes are not read. That is the point rather than a
 * gap, and the prompt says which commit was read so nobody has to guess.
 */
let WHERE = THE_WORKERS_CHECKOUT
let MADE_A_WORKTREE = null
/** The commit a git worktree this check made was cut at, so what changed in it can be read when the check ends. */
let THE_TIP_CUT = null
/**
 * WHETHER WHAT THIS CHECK MADE IS A COPY OF A FILES SEAL'S STAGED FILES rather than a git worktree.
 * A decision says a copy is taken away by deleting it, never by `git worktree remove`, which
 * would fail on it and then say, falsely, that a worktree could not be removed, as the secretary's review
 * says.
 */
let MADE_A_COPY = false
/**
 * A FILES SEAL: FOR EVERY SEALED PATH WHERE A FILE WAS ALREADY LANDED, THE SHA-256 OF THAT LANDED FILE,
 * read by this tool from the copy it made. The release carries it as `read.before`, and the queue binds
 * a modify operation's `before` to it.
 */
let BEFORE = {}
/** The inspector's sandbox this check uses (tools/inspector-sandbox.mjs), once it has one. Null on the host. */
let SANDBOX = null
/**
 * The host worktree's repository, or the source of a private clone. Host cleanup uses git worktree
 * removal; a private clone owns its administration and is removed as this check's physical copy.
 */
let WORKTREE_REPOSITORY = THE_WORKERS_CHECKOUT
/**
 * THE TREE IS KEPT UNTIL THE VERDICT IS DELIVERED, and this run says whether it was.
 *
 * It used to be held by a resource lease; the lease design is withdrawn, as a decision
 * of 11 September 2026 says, and what remains is this tool's own fact about its own
 * work: a tree whose check never reached a verdict is kept, so the next attempt or a reader can
 * see what the failed check saw. In a sandbox the tree is in the check's view, which goes by
 * the rule for a check with no
 * verdict (whatTheModelLeft). A check that filed its verdict tries to remove its tree immediately.
 * A completed dry assembly tries to remove its tree without claiming to have filed a verdict.
 */
let theVerdictIsDelivered = false
let theDryAssemblyCompleted = false
/**
 * WHY A SEAL THAT DECLARED A STANDARD CHANGE WAS CHECKED THE ORDINARY WAY, in a sentence that begins with a space, or ''
 * when it declared none. What the verdict says it read carries it, so the check says why an inspector read the change.
 */
let notAStandardRelease = ''

/** The commit the run left at the tip of its checkout, or a loud stop. */
function theRunsTip() {
  if (reads.submission?.seal.git) return reads.submission.seal.git.commit
  try {
    return guardedGit(THE_WORKERS_CHECKOUT, ['rev-parse', 'HEAD'])
  } catch (why) {
    process.stderr.write(
      `git could not say what commit ${THE_WORKERS_CHECKOUT} is on: ${String(why)}\n` +
        'Nothing was assembled and nothing was written.\n',
    )
    process.exit(1)
  }
}

/**
 * WHERE A WORKTREE AN AGENT MAKES GOES. Chapter 3 rule 1: never in their home directory.
 *
 * `~/.cache` is inside /home, where tests/restore-check.test.ts requires the worktree to be.
 * A test needing `dist/`, such as tests/source-api.test.ts, needs a build the model runs itself.
 * The inspector prepares dependencies without building.
 */
const WHERE_WORKTREES_GO = transientToolContext().checkWorktrees ?? theWorktreesFolder(homedir())

/**
 * CUT THE CHECK ITS OWN WORKTREE AT THE RUN'S TIP, AND GIVE IT DEPENDENCIES FOR A TEST.
 *
 * Criterion C30 requires a detached checkout at the submitted tip, with dependencies for a test.
 * On the host it is a linked worktree with linked dependencies. A private check view instead gets
 * git clone --no-local and a physical dependency copy, preserving only contained relative links.
 * The independent git directory and dependencies are validated before any view command starts.
 * The dependency copy is begun before the clone, on a thread of its own, and moved into the tree
 * where it was made before (theDependencyCopyBegun).
 *
 * Each check names its own tree. A retained tree is resumed only with its own native session,
 * unchanged commit, runtime and model, and with no process still using it.
 */
async function aWorktreeOfItsOwn() {
  const tip = theRunsTip()
  const at = SANDBOX === null ? join(WHERE_WORKTREES_GO, `a-check-of-${chosen.run}-${CHECK_ID}`) : whereTheCheckIsCut(SANDBOX)
  if (existsSync(at) && existsSync(theModelStateFile())) {
    try {
      const saved = theRetainedModelState()
      refuseToRemoveIfAnybodyIsIn(at)
      const head = guardedGit(at, ['rev-parse', 'HEAD'])
      const changed = outsideTheCommitInLines(at, head)
      if (saved.directory !== at || saved.tip !== tip || head !== tip || changed !== '') throw new Error('The retained check checkout changed. Start a fresh check session; no model was started and no verdict was written.')
      WORKTREE_REPOSITORY = SANDBOX === null ? THE_WORKERS_CHECKOUT : SANDBOX.repo
      MADE_A_WORKTREE = at
      THE_TIP_CUT = tip
      WHERE = at
      process.stdout.write(`The check resumes its own unchanged worktree at ${tip}, in ${at}.\n`)
      return at
    } catch (why) {
      spoolAGateMet('a-check-reads-its-own-worktree', 'block', SANDBOX?.instance ?? null)
      process.stderr.write(`${why instanceof Error ? why.message : String(why)}\nThe existing worktree was kept.\n`)
      process.exit(1)
    }
  }
  if (existsSync(at)) {
    spoolAGateMet('a-check-reads-its-own-worktree', 'block', SANDBOX?.instance ?? null)
    process.stderr.write(
      `${at} is already there, so this check did not put its worktree back. Nothing was ` +
        'assembled and nothing was written.\n' +
        whoStillUses(at) + '\nThe existing worktree was kept.\n',
    )
    process.exit(1)
  }
  const main = SANDBOX === null ? null : theViewsMain()
  if (SANDBOX === null) mkdirSync(WHERE_WORKTREES_GO, { recursive: true })
  else {
    // The host brings the sealed tip into the instance's source clone. The command view receives
    // only the independent private clone below, mounted at /work; source repositories stay absent.
    try {
      fetchIntoTheSandbox(SANDBOX, THE_WORKERS_CHECKOUT, [tip])
    } catch (why) {
      process.stderr.write(`${why instanceof Error ? why.message : String(why)}\nNothing was assembled and nothing was written.\n`)
      process.exit(1)
    }
    WORKTREE_REPOSITORY = SANDBOX.repo
  }
  // THE FILES ARE CHECKED OUT WHERE A FILTER THE REPOSITORY NAMES CANNOT RUN ON THE HOST
  // (src/config/guarded-git.mjs). In a sandbox the host only clones and fetches, with the guard, and
  // git checks the files out inside a private view of the sandbox, as the model runs, with a worker process
  // for each core (theCheckoutInsideTheSandbox). A --dry assembly reads only commits, so its worktree has no files. --on-the-host checks them out on the host,
  // so the model reads the host checkout, which is what that option chooses.
  /** @type {ReturnType<typeof aDependencyCopyBegun> | null} */
  let copying = null
  let mainSays = ''
  const cut = await (async () => {
    if (SANDBOX !== null) {
      try {
        mkdirSync(dirname(at), { recursive: true })
        copying = theDependencyCopyBegun(at)
        guardedGit(dirname(at), ['clone', '--quiet', '--no-local', '--no-checkout', WORKTREE_REPOSITORY, at], { fromAFolder: true, env: { GIT_CEILING_DIRECTORIES: dirname(at) } })
        guardedGit(at, ['fetch', '--quiet', '--no-tags', THE_WORKERS_CHECKOUT, tip, ...(main === null ? [] : [main.commit])], { fromAFolder: true })
        // THE VIEW'S main AND origin/main ARE THE RUN'S BASE, set in the view only, so a test there that reads the trunk
        // reads the commit this run is checked against and not the instance's main.
        if (main !== null) for (const ref of ['refs/heads/main', 'refs/remotes/origin/main']) guardedGit(at, ['update-ref', ref, main.commit])
        mainSays = main === null
          ? `The check view's main and origin/main are the instance's main, ${guardedGit(at, ['rev-parse', 'refs/heads/main'])}, because the office names no branch this run was cut from and no seal of it records a fork base.`
          : `The check view's main and origin/main are ${main.commit}. ${main.says}`
      } catch (why) {
        return String(why)
      }
      const CHECKOUT_MS = 10 * 60_000
      const inside = await runInside(SANDBOX, { label: 'checkout', cwd: at, argv: theCheckoutInsideTheSandbox(tip), limitMs: CHECKOUT_MS })
      if (inside.started === null) return inside.why
      if (inside.stoppedByTheClock) return `git was still checking it out inside the sandbox ${SANDBOX.instance} after ${CHECKOUT_MS / 60_000} minutes and was stopped`
      if (inside.code === null) return inside.why
      if (inside.code !== 0) return `git exited ${inside.code} inside the sandbox ${SANDBOX.instance}: ${inside.err.trim().split('\n').slice(-5).join('\n')}`
      return null
    }
    try {
      guardedGit(WORKTREE_REPOSITORY, ['worktree', 'add', ...(chosen.dry ? ['--no-checkout'] : []), '--detach', at, tip])
      return null
    } catch (why) {
      return String(why)
    }
  })()
  if (cut !== null) {
    process.stderr.write(
      `A worktree for this check could not be cut from ${WORKTREE_REPOSITORY} at ${tip}: ${cut}\n` +
        'A check runs in a worktree of its own so it never contends with the worker for the tree it is ' +
        'checking. Nothing was assembled and nothing was written.\n',
    )
    process.exit(1)
  }
  MADE_A_WORKTREE = at
  THE_TIP_CUT = tip
  WHERE = at
  process.stdout.write(
    `\nThe check reads its own worktree at ${tip}, cut at ${at}` +
      `${SANDBOX === null ? '' : `, inside the sandbox ${SANDBOX.instance}`}. The worker's tree is not touched.\n` +
      (mainSays === '' ? '' : `${mainSays}\n`),
  )
  await soATestCanRunThere(at, copying)
  return at
}

/**
 * THE COMMIT A CHECK VIEW'S main AND origin/main ARE SET TO, and the sentence that says where it came from. It is the
 * fork base the run's seal recorded, the commit the check diffs against; else, for a run with no git seal, the branch
 * the office says this run was cut from (`checkout.cutFrom` of GET /api/checks/<run>), read as a commit in the worker's
 * checkout; else null, and the view keeps the instance's main. A branch that cannot be read as a commit stops the
 * check, as a base typed with --against does in theBase.
 * @returns {{ commit: string, says: string } | null}
 */
function theViewsMain() {
  const forkBase = reads.submission?.seal.git?.forkBase ?? null
  if (forkBase !== null) return { commit: forkBase, says: `That is the fork base recorded in seal ${reads.submission.id}, the commit this check diffs against.` }
  const cutFrom = reads.checkout?.cutFrom ?? null
  if (cutFrom === null) return null
  try {
    const commit = guardedGit(THE_WORKERS_CHECKOUT, ['rev-parse', '--verify', `${cutFrom}^{commit}`])
    return {
      commit,
      says: `That is the commit ${cutFrom} names in ${THE_WORKERS_CHECKOUT}, and ${cutFrom} is the branch the office says this run was cut from. No seal of this run records a fork base.`,
    }
  } catch (why) {
    process.stderr.write(
      `The branch the office says this run was cut from, ${cutFrom}, could not be read as a commit in ${THE_WORKERS_CHECKOUT}, so the ` +
        `check view's main could not be set to it: ${why instanceof Error ? why.message : String(why)}\nNothing was assembled and nothing was written.\n`,
    )
    process.exit(1)
  }
}

/**
 * ONE FILE COPIED AND HASHED IN THE SAME PASS, with its mode read from the SOURCE. Null when the source
 * is not there.
 *
 * THE SOURCE IS OPENED WITH O_NOFOLLOW and looked at with fstat after it is open, as the seal reads it
 * (src/server/lib/sealed-tip.ts), so a file swapped for a link between looking and reading is refused
 * by the kernel. The bytes are hashed as they are written, so the copy holds exactly what was hashed.
 * THE MODE COMES FROM THE SOURCE'S fstat, never from the copy: a copy is written under this process's
 * umask and carries the copy's mode, not the staged file's (a secretary's review of 23 September 2026).
 */
function copyAndHash(from, to, path) {
  let source
  try {
    source = openSync(from, constants.O_RDONLY | constants.O_NOFOLLOW)
  } catch (why) {
    if (why?.code === 'ENOENT') return null
    if (why?.code === 'ELOOP') throw new Error(`${path} is a symbolic link where a file was sealed, and a files check follows no link.`)
    throw why
  }
  try {
    const found = fstatSync(source)
    if (!found.isFile()) throw new Error(`${path} is not a file where a file was sealed.`)
    mkdirSync(dirname(to), { recursive: true })
    const target = openSync(to, 'wx')
    try {
      const hash = createHash('sha256')
      const piece = Buffer.allocUnsafe(Math.max(1, Math.min(8 * 1024 * 1024, found.size)))
      for (let read = readSync(source, piece, 0, piece.length, null); read > 0; read = readSync(source, piece, 0, piece.length, null)) {
        hash.update(piece.subarray(0, read))
        for (let written = 0; written < read; ) written += writeSync(target, piece, written, read - written)
      }
      return { hash: hash.digest('hex'), mode: (found.mode & 0o111) !== 0 ? '100755' : '100644' }
    } finally {
      closeSync(target)
    }
  } finally {
    closeSync(source)
  }
}

/**
 * A FILES SEAL'S CHECK READS A COPY OF ITS OWN, NOT A GIT WORKTREE, under option A of a
 * decision. Its read path follows.
 *
 * A files seal's bytes were never in any repository, so there is no tip to cut a worktree at. This
 * tool copies every sealed file from the staged folder into the place a worktree would go — inside the
 * check's private work mount at /work — and hashes each file AS IT COPIES IT,
 * comparing the hash and the mode with the seal. Any difference stops the check before anything is
 * assembled and before the model runs. So the hashes the check rests on are recomputed here from the
 * real bytes and never taken from the number the run wrote down, and the model's sandbox never sees
 * the staged folder itself, only a copy that was checked. That is narrower than mounting the folder,
 * which the decision named as an example: a mount is live, so the bytes the model read could differ
 * from the bytes that were hashed, and a copy freezes exactly those.
 *
 * AND THE BEFORE (a secretary's review). For every sealed path, whatever is landed at `<root>/<path>` now
 * is copied beside it and hashed the same way. A path with a file landed at it is a MODIFY, and the
 * model is shown the before and the after; otherwise the check would release a rewrite of a file —
 * a recovery's own RECOVERY.md is the case — without seeing the text it replaced.
 *
 * `staged/<path>` holds what lands; `landed/<path>` holds what is there now, where there is anything.
 *
 * MADE_A_WORKTREE IS SET BEFORE THE FIRST FILE IS COPIED (the secretary's review), so a copy that stops half way
 * on a difference falls under the same keep-or-remove rule as a finished one. A retained private
 * copy resumes only with unchanged bytes and the matching controller/native session.
 *
 * NO SOURCE GIT IS READ HERE: not the run's tip, not a fetch into the sandbox, and nothing is linked
 * or built; a sandbox copy gets only an independent empty git directory for the private view.
 * Recovered files have no tests, so dependencies are not added (the secretary's review).
 */
async function aStagedCopyOfItsOwn() {
  const sealed = reads.submission.seal.files
  const id = reads.submission.id
  const at = SANDBOX === null ? join(WHERE_WORKTREES_GO, `a-check-of-${chosen.run}-${CHECK_ID}`) : whereTheCheckIsCut(SANDBOX)
  if (SANDBOX !== null && existsSync(at) && existsSync(theModelStateFile())) {
    const saved = theRetainedModelState()
    refuseToRemoveIfAnybodyIsIn(at)
    if (saved.directory !== at || JSON.stringify(saved.copySnapshot) !== JSON.stringify(aPhotographOfTheCopy(at))) {
      throw new Error('The retained files check copy changed. Start a fresh check session; its evidence was kept.')
    }
    MADE_A_WORKTREE = at
    MADE_A_COPY = true
    WHERE = at
    BEFORE = saved.before
    THE_COPY_TO_RESUME = saved.copySnapshot
    return at
  }
  if (existsSync(at)) {
    process.stderr.write(
      `${at} is already there, so an earlier check with this id did not take its copy away. Nothing was ` +
        'assembled and nothing was written. File a fresh check session and ask again with its id.\n' +
        whoStillUses(at) + '\nThe existing copy was kept.\n',
    )
    process.exit(1)
  }
  // THE FOLDER IS MADE WITHOUT `recursive`, so making it fails if it is there: a second check with the
  // same id that got past the look above cannot adopt the first one's copy and then remove it.
  try {
    mkdirSync(dirname(at), { recursive: true })
    mkdirSync(at)
  } catch (why) {
    process.stderr.write(`A folder for this check's copy could not be made at ${at}: ${String(why)}\nNothing was assembled and nothing was written.\n`)
    process.exit(1)
  }
  MADE_A_WORKTREE = at
  MADE_A_COPY = true
  WHERE = at
  const stop = (why) => {
    process.stderr.write(
      `${why}\nThe copy is checked against seal ${id} before anything is assembled, and it does not match, so ` +
        'nothing was assembled and nothing was written.\n',
    )
    process.exit(1)
  }
  const before = {}
  for (const file of sealed.files) {
    let got = null
    try {
      got = copyAndHash(join(sealed.stagedAt, file.path), join(at, 'staged', file.path), file.path)
    } catch (why) {
      stop(`Staged file ${file.path} could not be copied: ${why instanceof Error ? why.message : String(why)}`)
    }
    if (got === null) stop(`Staged file ${file.path} is no longer in ${sealed.stagedAt}.`)
    if (got.hash !== file.hash) stop(`Staged file ${file.path} differs from seal ${id}: sealed ${file.hash}, found ${got.hash}.`)
    if (got.mode !== file.mode) stop(`Staged file ${file.path} changed its mode after seal ${id}: sealed ${file.mode}, found ${got.mode}.`)
    let landed = null
    try {
      landed = copyAndHash(join(sealed.root, file.path), join(at, 'landed', file.path), file.path)
    } catch (why) {
      stop(`The file landed at ${file.path} could not be read as the before: ${why instanceof Error ? why.message : String(why)}`)
    }
    if (landed !== null) before[file.path] = landed.hash
  }
  if (SANDBOX !== null) guardedGit(at, ['init', '-q'])
  BEFORE = before
  const modified = Object.keys(before).length
  process.stdout.write(
    `\nThe check reads a copy of the ${String(sealed.files.length)} staged files of seal ${id}, made at ${at}` +
      `${SANDBOX === null ? '' : `, inside the sandbox ${SANDBOX.instance}`}, each checked against the seal's sha256 and mode as it was copied. ` +
      `${modified === 0 ? 'Nothing is landed at any of their paths now, so every one is an addition.' : `${String(modified)} of them replace a file landed at the same path, and that file was copied beside it as the before.`}\n`,
  )
  return at
}

/**
 * A FILES SEAL'S CHECK IS TOLD WHAT THE FILES CHECKER COULD NOT DECIDE, as A2 of a decision
 * says, option (a), agreed with two secretaries on 23 September 2026.
 *
 * The tool runs tools/checks/files-changeset.mjs over its own verified copy, as the queue will run it
 * over its hold: each file an add, or a modify of the file landed at its path, with the original its
 * seal recorded at finish. What the checker hands on is added to this check's list, through the same
 * list --needs-judgment reads, so the model judges each of those files with a line of its own and
 * its release names them (the secretary: "named must mean judged"). The queue then lands a handed-on file of
 * an entry on this seal only on such a release. The copy holds exactly the sealed bytes, so this whole
 * check is as narrow as a scoped one would be, and no second model run is spent.
 *
 * A decided failure is printed and not acted on here: the queue's checker decides the same thing at
 * the pin and bounces the entry on it. A checker that cannot run at all stops the check before
 * anything is assembled.
 */
function whatTheFilesCheckerHandsOn(given) {
  const sealed = reads.submission.seal.files
  const manifest = join(WHERE, 'files-checker-manifest.json')
  writeFileSync(
    manifest,
    JSON.stringify(
      {
        why: `The check of seal ${reads.submission.id}, over the copy tools/the-inspector.mjs made of its staged files and verified against it.`,
        stagedAt: sealed.stagedAt,
        operations: sealed.files.map((file) => ({
          op: BEFORE[file.path] === undefined ? 'add' : 'modify',
          target: file.path,
          blob: `staged/${file.path}`,
          before_hash: BEFORE[file.path] ?? 'absent',
          after_hash: file.hash,
          source: `sealed in run ${chosen.run}, seal ${reads.submission.id}`,
          ...(file.origin === undefined ? {} : { origin: file.origin }),
        })),
      },
      null,
      2,
    ),
  )
  const ran = spawnSync(process.execPath, [THE_FILES_CHECKER, '--manifest', manifest, '--root', sealed.root], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  let report = null
  try {
    report = ran.status === 0 || ran.status === 1 ? JSON.parse(ran.stdout) : null
  } catch {
    report = null
  }
  if (report === null) {
    process.stderr.write(
      `The files checker could not run over the copy of seal ${reads.submission.id} (exit ${String(ran.status)}): ${String(ran.stderr || ran.stdout).trim().slice(0, 800)}\n` +
        'A files check is told what the checker could not decide, and without it nothing was assembled and nothing was written.\n',
    )
    process.exit(1)
  }
  const failed = (report.decided ?? []).filter((one) => one.ok === false)
  if (failed.length > 0) {
    process.stdout.write(
      `The files checker decided ${String(failed.length)} ${failed.length === 1 ? 'thing' : 'things'} against this seal, which the queue will bounce on at the pin: ` +
        `${failed.map((one) => `${one.path} (${one.check}: ${one.detail})`).join('; ')}\n`,
    )
  }
  const byPath = new Map((given ?? []).map((one) => [one.path, { ...one }]))
  for (const one of report.needsJudgment ?? []) {
    const known = byPath.get(one.path)
    if (known === undefined) byPath.set(one.path, { path: one.path, why: one.why })
    else if (!known.why.includes(one.why)) known.why = `${known.why} ${one.why}`
  }
  const handed = report.needsJudgment ?? []
  process.stdout.write(
    `The files checker ran over the copy and handed on ${handed.length === 0 ? 'nothing' : handed.map((one) => one.path).join(', ')}` +
      `${handed.length === 0 ? '' : ', which this check judges with a line each'}.\n`,
  )
  return [...byPath.values()]
}

/** Whether a file's first bytes look like text rather than binary: no NUL byte among them. */
function looksLikeText(full) {
  try {
    const fd = openSync(full, constants.O_RDONLY | constants.O_NOFOLLOW)
    try {
      const piece = Buffer.alloc(8192)
      const read = readSync(fd, piece, 0, piece.length, 0)
      return !piece.subarray(0, read).includes(0)
    } finally {
      closeSync(fd)
    }
  } catch {
    return false
  }
}

/**
 * ONE SEALED FILE AS THE PROMPT SHOWS IT. A text file is shown as a diff of its copy against the copy of
 * what is landed there now — or against nothing, for an addition — cut at the limit any diff is. Any
 * other file is described: its sealed sha256 and mode, and where the model can read the copy.
 */
function oneStagedFileAsAChange(file) {
  const after = join(WHERE, 'staged', file.path)
  const was = BEFORE[file.path]
  const before = was === undefined ? '/dev/null' : join(WHERE, 'landed', file.path)
  const head =
    was === undefined
      ? `ADDED ${file.path}: nothing is landed at this path now.\n`
      : `MODIFIED ${file.path}: it replaces the file landed at this path now, whose sha256 is ${was}.\n`
  const sealedLine = `Sealed sha256 ${file.hash}, mode ${file.mode}. The copy is at ${after}${was === undefined ? '' : `; the file it replaces is copied at ${before}`}.\n`
  if (!looksLikeText(after) || (was !== undefined && !looksLikeText(before))) {
    return `${head}${sealedLine}It is not text, so it is not shown here. Read the copy, and recompute its sha256 against the seal if you want to.\n`
  }
  // THE COPY IS IN NO REPOSITORY, and git is kept from looking for one above it, so no repository's
  // config or attributes are read for this diff (src/config/guarded-git.mjs).
  const shown = guardedGitRun(WHERE, ['diff', '--no-index', '--no-color', '--', before, after], { env: { GIT_CEILING_DIRECTORIES: dirname(WHERE) } })
  // `git diff --no-index` EXITS 1 WHEN THE TWO DIFFER, which is the ordinary case here. Anything else is said, not hidden.
  const said = shown.status === 0 || (shown.status === 1 && shown.stdout !== '')
    ? shown.stdout
    : `git could not show this file's change: ${shown.error === undefined ? shown.stderr.trim() || `exit ${String(shown.status)}` : String(shown.error)}`
  const body =
    Buffer.byteLength(said) <= MOST_BYTES_PER_FILE
      ? said
      : `${said.slice(0, MOST_BYTES_PER_FILE)}\n\n[This change is ${String(Buffer.byteLength(said))} bytes and the first ` +
        `${String(MOST_BYTES_PER_FILE)} are above. The rest was not read here; the whole file is at ${after}.]`
  return `${head}${sealedLine}${body}`
}

/**
 * A files seal's changes, in the shape `changesIn` gives a git seal's. A file is read when its real location lies
 * in the agent's files area, the one rule the office sorts by (acceptance finding 52): its paths are relative to
 * the seal's root, so the repository-relative work area never held one.
 */
function changesInAFilesSeal() {
  const { root } = reads.submission.seal.files
  return reads.submission.seal.files.files.map((file) => ({
    path: file.path,
    changes: !insideTheScope(file.path, chosen.only)
      ? NOT_IN_THE_SCOPE
      : insideTheFilesArea(root, file.path, reads.filesArea ?? null).inside
        ? oneStagedFileAsAChange(file)
        : NOT_IN_THE_FILES_AREA,
  }))
}

/**
 * GIVE IT `node_modules` WITHOUT BUILDING, so the model can run a test for a mutation.
 *
 * A decision leaves builds and the tests to the merge queue. The inspector
 * links dependencies on the host or copies them privately in the sandbox, and builds nothing.
 * A test needing `dist/`, such as tests/source-api.test.ts, needs `npm run build` first. The model
 * runs that command itself in its sandbox when the test needs it.
 *
 * A checkout with no `package.json` has no dependencies to prepare. Every failure to prepare
 * dependencies stops the check, because a model that cannot run its test cannot verify a mutation.
 * @param {string} at
 * @param {ReturnType<typeof aDependencyCopyBegun> | null} [copying] the copy begun before the clone, if one was
 */
async function soATestCanRunThere(at, copying = null) {
  // A COPY BEGUN BEFORE THE CLONE (theDependencyCopyBegun) made the three reads below before it began, and copies from
  // the folder it found. It is waited for here and moved into the tree, so the tree holds node_modules at this step, as
  // before, and a copy that failed stops the check with the same words.
  if (copying !== null) {
    const failed = await copying.copied
    try {
      if (failed === null) renameSync(copying.to, join(at, 'node_modules'))
    } catch (why) {
      cannotPrepareTheDependencies(at, String(why))
    }
    if (failed !== null) cannotPrepareTheDependencies(at, failed)
    process.stdout.write(`node_modules is copied privately from ${copying.from}. Nothing was built. The merge queue builds and runs the tests.\n`)
    return
  }
  // A --dry ASSEMBLY RUNS NO MODEL, so nothing will run in the tree and no dependencies are prepared.
  if (chosen.dry) {
    process.stdout.write('--dry runs no model, so nothing was linked into the worktree and nothing was built.\n')
    return
  }
  if (!existsSync(join(THE_WORKERS_CHECKOUT, 'package.json'))) {
    process.stdout.write(
      `${THE_WORKERS_CHECKOUT} holds no package.json, so nothing was linked and nothing was built. ` +
        'This is a checkout with no suite to run, not a step that was skipped.\n',
    )
    return
  }

  // NODE_MODULES, FOLLOWED TO THE REAL ONE. The worker's own `node_modules` is usually itself a
  // symlink into the main checkout. Host checks link its real target; private views copy its bytes
  // and retain relative internal links. The shared view validator rejects escaping links.
  let from = ''
  try {
    from = realpathSync(join(THE_WORKERS_CHECKOUT, 'node_modules'))
  } catch (why) {
    process.stderr.write(
      `${THE_WORKERS_CHECKOUT} has a package.json but no node_modules to link from: ${String(why)}\n` +
        'A worktree gets node_modules symlinked from the checkout it came from, and ' +
        'without it nothing in this check can run. Nothing was assembled and nothing was written.\n',
    )
    process.exit(1)
  }

  try {
    if (SANDBOX === null) symlinkSync(from, join(at, 'node_modules'), 'dir')
    else cpSync(from, join(at, 'node_modules'), { recursive: true, verbatimSymlinks: true })
  } catch (why) {
    cannotPrepareTheDependencies(at, String(why))
  }

  process.stdout.write(
    `node_modules is ${SANDBOX === null ? 'linked' : 'copied privately'} from ${from}. Nothing was built. The merge queue builds and runs the tests.\n`,
  )
}

/**
 * THE PRIVATE COPY OF node_modules, BEGUN BEFORE THE CLONE ON A THREAD OF ITS OWN (tools/inspector-dependency-copy.mjs),
 * into a folder of this check's own beside its work tree, or null. The clone and the checkout hold this thread for
 * seconds, and the copy needs neither. The folder is no mount of the check view, so no command sees it until
 * soATestCanRunThere moves it into the tree. It is left with the rest of the check's folder when the check fails.
 *
 * Null when soATestCanRunThere copies nothing or stops the check: a --dry assembly, a checkout with no package.json, or
 * a node_modules that cannot be followed. Then soATestCanRunThere reads them again after the cut and says so there.
 */
function theDependencyCopyBegun(at) {
  if (chosen.dry || !existsSync(join(THE_WORKERS_CHECKOUT, 'package.json'))) return null
  let from = ''
  try {
    from = realpathSync(join(THE_WORKERS_CHECKOUT, 'node_modules'))
  } catch {
    return null
  }
  const to = join(dirname(at), 'node_modules-being-copied')
  rmSync(to, { recursive: true, force: true })
  return aDependencyCopyBegun(from, to)
}

/** The words for dependencies that could not be prepared in `at`, and the end of the check. */
function cannotPrepareTheDependencies(at, why) {
  process.stderr.write(`node_modules could not be prepared in ${at}: ${why}\nNothing was written.\n`)
  process.exit(1)
}

/**
 * WHICH WORKTREE AND WHICH TIP THIS CHECK READ, in the words C30 asks the record to carry.
 *
 * It is said even when no worktree was cut, because *this check read the worker's own tree* is the
 * fact C30 exists to make visible, and a record that simply omitted it would look like a check that
 * had done the right thing. `where` ends the sentence: where the model runs, or, for a standard
 * release, that no model ran.
 */
function whichTreeWasRead(where = whereItsModelRuns()) {
  // adTmco_wIzln, inspector note 52ZNPB44bOPb; USER.md invariants 2 and 5:
  // record the kind from the seal, even when git cannot record its tip.
  const sealKind = reads.submission?.seal.kind
  const namedKind = ['git', 'records', 'files'].includes(sealKind) ? { sealKind } : {}
  const told = whatItWasToldToJudge()
  // LINK EVIDENCE IS CLAIMED ONLY WHEN THE OFFICE'S READING HANDED THE PINNED LINKS (round BM, item 2aq).
  const pinnedLinks = reads.pinnedLinks?.links
  const recordsSay = Array.isArray(pinnedLinks)
    ? 'This check reads the pinned record revisions and link evidence in the sealed manifest.'
    : pinnedLinks === null
      ? 'This check reads the pinned record revisions in the sealed manifest; this seal was made before seals pinned links.'
      : "This check reads the pinned record revisions in the sealed manifest; the office's reading did not say which links the seal pinned."
  // The same pinnedLinks the sentence reads, so the stored field and the sentence cannot disagree.
  const linkEvidence = Array.isArray(pinnedLinks) ? { linkEvidence: 'read' } : pinnedLinks === null ? { linkEvidence: 'sealed-before-links' } : {}
  if (reads.submission?.seal.kind === 'records') return { ...namedKind, ...linkEvidence, sealId: reads.submission.id, sealHash: reads.submission.seal.hash, worktree: 'record manifest ' + reads.submission.id, ofItsOwn: true, says: recordsSay + told.says + where, ...told.fields }
  // A FILES SEAL WAS READ FROM A COPY, and the record says so in the words the secretary asked for: a copy of
  // the staged files, each checked against the seal before the model ran. No tip is named, because
  // there is none; `staged` names the folder the copy came from and `before` the sha256 of every file
  // it replaces, which is what binds the release to the before as well as the after.
  if (reads.submission?.seal.kind === 'files') {
    const sealed = reads.submission.seal.files
    const replaced = Object.keys(BEFORE).length
    return {
      ...namedKind,
      sealId: reads.submission.id,
      sealHash: reads.submission.seal.hash,
      worktree: WHERE,
      ofItsOwn: MADE_A_WORKTREE !== null,
      staged: sealed.stagedAt,
      before: { ...BEFORE },
      says:
        `This check read ${WHERE}, a copy of the staged files, each checked against seal ${reads.submission.id} before the model ran: ` +
        `${String(sealed.files.length)} ${sealed.files.length === 1 ? 'file' : 'files'} copied from ${sealed.stagedAt} and hashed as ${sealed.files.length === 1 ? 'it was' : 'they were'} copied, ` +
        `the sha256 and the mode of each compared with the seal. ` +
        (replaced === 0
          ? `Nothing was landed at any of their paths under ${sealed.root}, so each is an addition.`
          : `${String(replaced)} of them replace a file landed under ${sealed.root}; each replaced file was copied beside it, shown as the before, and its sha256 is in \`before\`.`) +
        ' The staged folder itself was not seen by the model.' +
        told.says +
        where,
      ...told.fields,
    }
  }
  const tip = (() => {
    try {
      return guardedGit(WHERE, ['rev-parse', 'HEAD'])
    } catch {
      return ''
    }
  })()
  return {
    ...namedKind,
    ...(reads.submissionStatus === 'legacy-unsealed' ? { unsealed: true } : {}),
    ...(reads.submission ? { sealId: reads.submission.id, sealHash: reads.submission.seal.hash } : {}),
    worktree: WHERE,
    ...(tip === '' ? {} : { tip }),
    ofItsOwn: MADE_A_WORKTREE !== null,
    says:
      (MADE_A_WORKTREE === null
        ? `This check read ${WHERE}, which is the checkout it was given rather than a worktree of its own. ` +
          'Criterion C30 says a check reads a detached worktree at the run\'s tip and never the worker\'s own, ' +
          'so a check that says this contended with whoever else was in that tree.'
        : `This check read ${WHERE}, a detached worktree of its own cut at ${tip}, and held it through the ` +
          'verdict delivery. The worker\'s tree was not read and not touched.') + notAStandardRelease + told.says + where,
    ...told.fields,
  }
}

/**
 * WHERE THE MODEL RUNS, in the words the record carries. No check builds. A --dry assembly runs
 * no model, so it says nothing about where a model runs.
 */
function whereItsModelRuns() {
  if (chosen.dry) return ''
  if (SANDBOX !== null) {
    return (
      ` Its model runs in the inspector's sandbox ${SANDBOX.instance} (private check views, ` +
      `template ${SANDBOX.template}), where the model has its native verification tools.`
    )
  }
  return ` Its model runs on the host, because --on-the-host was given, with ${RUNTIME === 'codex' ? 'Codex read-only permissions' : 'Claude reading tools only'}.`
}

/**
 * WHAT A STANDARD RELEASE'S READ SAYS IN PLACE OF WHERE THE MODEL RUNS. A standard check starts no model, so the read
 * the release door keeps says so, and says what the release came from.
 */
const NO_MODEL_RAN = " No model ran: the release came from the change's own checks and its kind."

/**
 * THE SCOPE AND THE LIST THIS CHECK WAS GIVEN, as the verdict carries them and in words. A verdict
 * of a scoped check says so in `read.only`, so it is never read as a verdict on the whole submission.
 */
function whatItWasToldToJudge() {
  const n = chosen.only?.length ?? 0
  const m = NEEDS_JUDGMENT?.length ?? 0
  return {
    fields: {
      ...(chosen.only === null ? {} : { only: chosen.only }),
      ...(NEEDS_JUDGMENT === null ? {} : { needsJudgment: NEEDS_JUDGMENT }),
    },
    says:
      (chosen.only === null
        ? ''
        : ` It was a scoped check: it judged only ${n === 1 ? 'this path' : `these ${String(n)} paths`}, ` +
          `${chosen.only.join(', ')}, and every other changed path kept an earlier verdict.`) +
      (NEEDS_JUDGMENT === null
        ? ''
        : m === 0
          ? ' A checker tool handed it no path that needs judgment.'
          : ` A checker tool handed it ${m === 1 ? 'one protected path' : `${String(m)} protected paths`} to judge: ` +
            `${NEEDS_JUDGMENT.map((one) => one.path).join(', ')}.`),
  }
}

/** A tree still used by a live process is kept, with its path and process named. A refusal is a failure, not a success: it leaves the exit non-zero. */
function theWorktreeIsPutBack() {
  const at = MADE_A_WORKTREE ?? (SANDBOX !== null && reads.submission?.seal.kind === 'records' ? whereTheCheckIsCut(SANDBOX) : null)
  if (at === null) return
  if (!theVerdictIsDelivered && !theDryAssemblyCompleted) {
    // Ordinary failures put the run's standing before the worktree diagnostics. The dedicated
    // no-verdict ending already explained what the office may do, so it adds no standing or next act here.
    if (process.exitCode !== CHECK_ENDED_WITH_NO_VERDICT) {
      process.stderr.write('The run stays inspecting. Its starter can ask again.\n')
    }
    // IN A SANDBOX THE TREE IS IN THE CHECK'S VIEW, and leaving the sandbox says whether that is kept.
    if (SANDBOX !== null) return
    process.stderr.write((MADE_A_COPY ? "The check's copy " : 'The check worktree ') + at + ' is kept because verdict delivery has not completed.\n')
    process.stderr.write(whoStillUses(at) + '\n')
    return
  }
  MADE_A_WORKTREE = null
  WHERE = THE_WORKERS_CHECKOUT
  try {
    refuseToRemoveIfAnybodyIsIn(at)
  } catch (why) {
    if (SANDBOX !== null) SANDBOX.keepPrivate = true
    process.stderr.write(String(why) + (MADE_A_COPY ? "\nThe check's copy was kept." : '\nThe worktree was kept.') + ' Check its processes before removing it.\n')
    process.exitCode = 1
    return
  }
  if (SANDBOX !== null && !MADE_A_COPY) {
    try { rmSync(at, { recursive: true, force: true }) }
    catch (error) { SANDBOX.keepPrivate = true; process.exitCode = 1; process.stderr.write(`The private checkout was kept: ${error.message}\n`); return }
    process.stdout.write(`The private checkout this check made at ${at} is removed.\n`)
    return
  }
  if (MADE_A_COPY) {
    // A COPY IS NOT A GIT WORKTREE, so it is removed by deleting exactly the folder this check made —
    // never by `git worktree remove`, which would refuse it or, worse, find a worktree of that name.
    MADE_A_COPY = false
    try {
      rmSync(at, { recursive: true, force: true })
    } catch (why) {
      if (SANDBOX !== null) SANDBOX.keepPrivate = true
      process.stderr.write(`The copy this check made at ${at} could not be removed: ${String(why)}\nThe check's copy was kept. Check its processes before removing it.\n`)
      return
    }
    process.stdout.write(`The copy of the staged files this check made at ${at} is removed.\n`)
    return
  }
  const removed = removeCheckWorktree(WORKTREE_REPOSITORY, at)
  ;(removed.ok ? process.stdout : process.stderr).write(`${removed.says}\n`)
  if (!removed.ok) process.exitCode = 1
}

process.on('exit', theWorktreeIsPutBack)
/**
 * AND THEN THE SANDBOX IS LEFT, after the worktree: the login is taken back, anything of this check
 * still running inside is ended, and the container is stopped when no other check is using it. A
 * container that could not be stopped leaves the exit non-zero, like a worktree that could not be.
 */
process.on('exit', () => {
  if (SANDBOX === null) return
  const left = leaveTheSandbox(SANDBOX, { delivered: theVerdictIsDelivered, left: theVerdictIsDelivered ? null : whatTheModelLeft() })
  SANDBOX = null
  ;(left.ok ? process.stdout : process.stderr).write(`${left.says}\n`)
  if (!left.ok) process.exitCode = 1
})
// A STOPPED CHECK ENDS WHAT IT STARTED IN THE SANDBOX, by the host group it recorded: that group is
// not this process's, so the stop that reaches this tool would not reach it. The ledger still holds
// its row, which `node tools/sandbox.mjs down` closes.
if (IN_A_SANDBOX) {
  for (const [signal, code] of /** @type {const} */ ([['SIGTERM', 143], ['SIGINT', 130], ['SIGHUP', 129]])) {
    process.on(signal, () => {
      THE_CHECK_WAS_STOPPED_BY = signal
      process.stderr.write(`This check was stopped (${signal}), so it ends what it started in the inspector's sandbox.\n`)
      stopWhatRunsInside(SANDBOX)
      process.exit(code)
    })
  }
}
/** The signal that stopped this check, when one did: a stopped check's view is kept (whatTheModelLeft). */
let THE_CHECK_WAS_STOPPED_BY = null

/**
 * WHAT THIS CHECK'S MODEL LEFT IN ITS VIEW, read when the check ends with no verdict, for the rule for such a check
 * (theViewOfACheckWithNoVerdict in tools/inspector-sandbox.mjs). Its model wrote nothing when the check was not stopped by
 * a signal, it is not a dsh check, its model's first run failed with an error, and either no model was started in its view
 * or every line its model wrote is an event that carries no work (whatTheModelWroteIn) and its work/ is as it was cut.
 * Answers `{ nothing: true, error, readings }` then, else `{ nothing: false, because }` with the first reading that keeps
 * the view. A reading that throws keeps it.
 */
function whatTheModelLeft() {
  const kept = (/** @type {string} */ because) => ({ nothing: /** @type {const} */ (false), because })
  try {
    if (THE_CHECK_WAS_STOPPED_BY !== null) return kept(`the check was stopped by ${THE_CHECK_WAS_STOPPED_BY}`)
    if (RUNTIME === 'dsh') return kept(whatTheModelWroteIn(RUNTIME, THE_NATIVE_OUTPUT) ?? 'it is a dsh check')
    if (THE_MODELS_OUTPUT_IS === 'not read') return kept('its model may have started in it, and what its model wrote was not read')
    const readings = []
    if (THE_MODELS_OUTPUT_IS === 'no model') readings.push('Its model was not started in its view.')
    else {
      const wrote = whatTheModelWroteIn(RUNTIME, THE_NATIVE_OUTPUT)
      if (wrote !== null) return kept(wrote)
      readings.push(`Every line of its model's output is an event that carries no work for a ${RUNTIME} check.`)
      const changed = whatChangedInTheWork()
      if (changed !== null) return kept(changed)
      readings.push(`Its work/ is as it was cut${THE_TIP_CUT === null ? '' : `, at ${THE_TIP_CUT}`}.`)
    }
    if (THE_MODELS_FAILURE === null) return kept('no error of its model was recorded for view-removed.json to keep')
    return { nothing: /** @type {const} */ (true), error: THE_MODELS_FAILURE, readings }
  } catch (why) {
    return kept(`what its model left could not be read: ${why instanceof Error ? why.message : String(why)}`)
  }
}

/**
 * WHAT A CHECK'S MODEL WROTE, read from its native output for the rule for a check with no verdict: null when every line
 * is an event that carries no work for its runtime, else why its view is kept. OpenCode's are a step start and an error;
 * Codex's a thread or turn start, a failed turn and an error; Claude Code's one error result that says its model wrote no
 * output token. A dsh check's view is always kept, and an empty output says nothing of what its model did.
 * @param {string} runtime
 * @param {string} output
 */
function whatTheModelWroteIn(runtime, output) {
  if (runtime === 'dsh') return 'it is a dsh check, and the view of a dsh check is always kept'
  const carriesNoWork = /** @type {Record<string, string[]>} */ ({ opencode: ['step_start', 'error'],
    codex: ['thread.started', 'turn.started', 'turn.failed', 'error'], 'claude-code': ['result'] })[runtime]
  if (carriesNoWork === undefined) return `it is a ${runtime} check, and no list of the events that carry no work is kept for one`
  if (output.trim() === '') return "its model's output is empty, so what it did cannot be read"
  for (const [at, line] of output.split('\n').entries()) {
    if (line.trim() === '') continue
    const n = String(at + 1)
    let event = null
    try { event = JSON.parse(line) } catch { event = null }
    if (event === null || typeof event !== 'object' || Array.isArray(event) || typeof event.type !== 'string') return `line ${n} of its model's output could not be read as an event`
    if (!carriesNoWork.includes(event.type)) return `line ${n} of its model's output is an event of the type ${event.type}`
    if (event.type === 'result' && !(event.is_error === true && event.usage?.output_tokens === 0)) return `the result on line ${n} of its model's output does not say its model wrote no output token`
  }
  return null
}

/** Whether the check's work/ is as it was cut, read when it ends: null when it is, else what changed or why it could not be read. */
function whatChangedInTheWork() {
  if (reads.submission?.seal.kind === 'records') return 'it is a records check, and its work/ has no cut to be compared with'
  if (MADE_A_WORKTREE === null) return 'its work/ was not cut, so what changed in it cannot be read'
  if (MADE_A_COPY) {
    if (THE_COPY_TO_RESUME === null) return 'its work/ was not photographed when it was made, so what changed in it cannot be read'
    return JSON.stringify(aPhotographOfTheCopy(MADE_A_WORKTREE)) === JSON.stringify(THE_COPY_TO_RESUME) ? null : 'its work/ changed'
  }
  if (THE_TIP_CUT === null) return 'the commit its work/ was cut at was not recorded'
  const head = guardedGit(MADE_A_WORKTREE, ['rev-parse', 'HEAD'])
  return head === THE_TIP_CUT && outsideTheCommitInLines(MADE_A_WORKTREE, head) === '' ? null : 'its work/ changed'
}

const officeSettings = inspectionSettings()
const MINUTES = chosen.limit ?? officeSettings.minutes
const RUN_LIMIT_MS = MINUTES * 60 * 1000
const API_WAIT_MS = inspectionApiWaitMilliseconds()
const OFFICE_BACK_MS = inspectionOfficeBackMilliseconds()

const HEADERS = {
  'content-type': 'application/json',
  'x-mole-office-workspace': WORKSPACE,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': chosen.as,
  'x-mole-office-purpose': 'module-work',
  ...(THE_CHECKS_SESSION === null ? {} : { 'x-mole-office-session': THE_CHECKS_SESSION }),
}

/**
 * One request to the office, and what it answered, a refusal included. A request nothing answered throws. `workspace`
 * asks in another project than the check's own, for a record the office said is filed there (`readWherever`).
 * `headers` are sent beside the check's own.
 */
async function askAndHear(path, body, { quiet = false, workspace = undefined, method = body === undefined ? 'GET' : 'POST', headers = {} } = {}) {
  const started = performance.now()
  let reply, said
  const request = {
    method, headers: { ...HEADERS, ...(workspace === undefined ? {} : { 'x-mole-office-workspace': workspace }), ...theOfficeKeyHeader(), ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }
  // THE STAND-IN'S 503 IS ASKED AGAIN, within OFFICE_BACK_MS from the first. It answers for the dev supervisor while no
  // server runs, during every restart after a landing too, and says nothing was read or written (wave 13x, round 8).
  let standInUntil = null
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      reply = await fetch(`${API}${path}`, { ...request, signal: AbortSignal.timeout(API_WAIT_MS) })
      said = await reply.text()
      if (reply.status === 503 && reply.headers.has(STAND_IN_HEADER)) {
        const waiting = performance.now()
        standInUntil ??= waiting + OFFICE_BACK_MS
        process.stdout.write(`${method} ${path}: the dev supervisor answered for the office that no server is running, and nothing was written; waiting up to ${((standInUntil - waiting) / 1000).toFixed(2)} seconds for the office to come back.\n`)
        if (await waitForTheOffice(standInUntil)) {
          process.stdout.write(`${method} ${path}: waited ${((performance.now() - waiting) / 1000).toFixed(2)} seconds; the office is back. Sending the same request once more.\n`)
          reply = undefined
          attempt -= 1
          continue
        }
        process.stdout.write(`${method} ${path}: the office did not come back within ${OFFICE_BACK_MS / 1000} seconds of the first such answer.\n`)
      }
      break
    } catch (error) {
      // Tj0gSo-y1I6h: only a request that never reached the office may be asked again.
      // Node's fetch nests ECONNREFUSED in cause, sometimes in cause.cause. A timeout,
      // reset or lost reply might have reached the office, so none of those is retried.
      const refused = reply === undefined && (error?.cause?.code === 'ECONNREFUSED' || error?.cause?.cause?.code === 'ECONNREFUSED')
      let why = ' The failure may have reached the office.'
      if (attempt === 0 && refused) {
        const waiting = performance.now()
        process.stdout.write(`${method} ${path}: connection refused; waiting up to ${OFFICE_BACK_MS / 1000} seconds for the office to come back.\n`)
        const back = await waitForTheOffice(waiting + OFFICE_BACK_MS)
        const seconds = ((performance.now() - waiting) / 1000).toFixed(2)
        if (back) {
          process.stdout.write(`${method} ${path}: waited ${seconds} seconds; the office is back. Sending the same request once more.\n`)
          continue
        }
        why = ` Waited ${seconds} seconds for the office (limit ${OFFICE_BACK_MS / 1000} seconds); the office never came back.`
      }
      const retry = attempt === 0
        ? 'No response was substituted and the request was not retried.'
        : 'No response was substituted. The request was retried once after a refused connection; this attempt was not retried.'
      if (attempt === 1 && refused) why = ' The connection was refused again, and the single retry has been used.'
      throw new Error(`${method} ${API}${path} did not return a complete response after ${((performance.now() - started) / 1000).toFixed(2)} seconds; the API wait limit is ${API_WAIT_MS / 1000} seconds. ${retry}${why}`, { cause: error })
    }
  }
  process.stdout.write(`${method} ${path}: HTTP ${reply.status}, ${Buffer.byteLength(said)} bytes, ${((performance.now() - started) / 1000).toFixed(2)} seconds (API wait limit ${API_WAIT_MS / 1000} seconds).\n`)
  // QUIET, for a word read only to learn whether it names a record: a 404 there says it does not, and is not a refusal.
  if (!reply.ok && !quiet) process.stderr.write(`${API}${path} answered ${String(reply.status)}:\n${said}\n`)
  return { ok: reply.ok, status: reply.status, said }
}

/** Health reads do not post the failed request. Bound both each probe and the pause by the remaining wait. */
async function waitForTheOffice(deadline) {
  while (performance.now() < deadline) {
    try {
      const reply = await fetch(`${API}/api/health`, {
        headers: { ...HEADERS, ...theOfficeKeyHeader() },
        signal: AbortSignal.timeout(Math.max(1, Math.ceil(Math.min(API_WAIT_MS, deadline - performance.now())))),
      })
      await reply.text()
      if (reply.ok && performance.now() < deadline) return true
    } catch {
      // A health probe can fail while the office starts. It says nothing about the original request.
    }
    const left = deadline - performance.now()
    if (left > 0) await new Promise(resolve => setTimeout(resolve, Math.min(2_000, left)))
  }
  return false
}

/** One request to the office that must be answered: a refusal ends the tool, and has been printed. */
async function ask(path, body) {
  const heard = await askAndHear(path, body)
  if (!heard.ok) process.exit(1)
  return JSON.parse(heard.said)
}

/**
 * WHICH MODEL RUNS THE CHECK, AND AT WHICH EFFORT. Criterion U2; the effort, wave 13v round 27.
 *
 * A --model a person typed wins, and the message worker always passes one. The office is asked what a check by this agent
 * gets either way: the checking agent's own model, the Casting table's row for the inspector card, or
 * MOLE_OFFICE_INSPECTION_MODEL in the office's .env, and with the Casting row's model its effort, as `variant`. A refusal
 * ends the tool, as every other request here that must be answered does, and so does an answer naming no model when no
 * --model was given. It is asked only once the check is eligible, so a refused check still asks the office nothing else.
 *
 * THE ROW'S SELECTION comes with its model when the inspector's Casting row carries native data, as a builder's does. It
 * is read strictly, and a malformed one, or one for another model or runtime than the answer's, ends the tool here, with
 * nothing started and no verdict written. An answer without one is an older office's, or a row's with no native data.
 *
 * A SELECTION THAT NAMES A PROVIDER ROW comes with `provider`, the provider's fields a check uses, and only a dsh check
 * or a Codex check takes it (whyAStartCannotTakeTheProviderRow in src/config/launcher-selection.mjs); it is read strictly
 * too. Such a Codex check is handed the provider's key only in its private view, so --on-the-host is refused for it.
 */
async function whatTheOfficeGivesTheCheck() {
  const said = await ask(`/api/office/run-models/for/${encodeURIComponent(chosen.as)}?place=check`)
  const model = typeof said?.model === 'string' && said.model !== '' ? said.model : null
  const variant = typeof said?.effort === 'string' && said.effort !== '' ? said.effort : typeof said?.variant === 'string' && said.variant !== '' ? said.variant : null
  const runtime = said?.runtime
  if (!['claude-code', 'codex', 'opencode', 'dsh'].includes(runtime)) {
    process.stderr.write(`The office names ${String(runtime ?? 'no runtime')} for this check. Supported inspector harnesses are claude-code, codex, opencode and dsh. Nothing was started and no verdict was written.\n`)
    process.exit(1)
  }
  if (runtime === 'opencode' && chosen.onTheHost) {
    process.stderr.write('OpenCode inspection requires the private per-check container view, so --on-the-host is refused.\n')
    process.exit(1)
  }
  if (runtime === 'dsh' && chosen.onTheHost) {
    process.stderr.write('DSH inspection requires the private per-check container view, so --on-the-host is refused.\n')
    process.exit(1)
  }
  let selection = null
  let provider = null
  if (said !== null && typeof said === 'object' && Object.hasOwn(said, 'selection')) {
    try {
      selection = readLauncherSelection(said.selection)
    } catch (why) {
      process.stderr.write(`${why instanceof Error ? why.message : String(why)} No verdict was written.\n`)
      process.exit(1)
    }
    if (selection.runtime !== runtime || selection.model !== model) {
      process.stderr.write(`The office gives this check ${String(model)} on ${runtime}, with a selection for ${selection.model} on ${selection.runtime}. Nothing was started and no verdict was written.\n`)
      process.exit(1)
    }
    // A ROW'S OWN SETTINGS reach a Codex or Claude Code check through aCommandsStartValues, as they reach a run. An
    // OpenCode check's configuration is fixed to OPENCODE_CHECK_ENV and a DSH check starts its own client, and
    // tools/inspector-sandbox.mjs checks both shapes, so neither would carry them: the check is refused instead.
    if ((runtime === 'opencode' || runtime === 'dsh') && selection.native.settings !== undefined) {
      process.stderr.write(`The check's Casting selection has settings for ${runtime}, and a ${runtime === 'dsh' ? 'DSH' : 'OpenCode'} check does not carry a row's settings. Nothing was started and no verdict was written.\n`)
      process.exit(1)
    }
    if (selection.native.providerRow !== undefined) {
      const cannot = whyAStartCannotTakeTheProviderRow(selection, true)
      if (cannot !== null) {
        process.stderr.write(`${cannot} No verdict was written.\n`)
        process.exit(1)
      }
      if (runtime === 'codex' && chosen.onTheHost) {
        process.stderr.write(`The check's Casting row ${String(selection.casting?.id)} names provider ${selection.native.providerRow}, and a Codex check is handed a provider's key only in the private per-check container view, so --on-the-host is refused. Nothing was started and no verdict was written.\n`)
        process.exit(1)
      }
      provider = theProviderTheOfficeNames(said.provider, selection)
    }
  }
  if (model === null && chosen.model === null) {
    process.stderr.write(`The office names no model for a check by ${chosen.as}: ${String(said?.says ?? '')}\n`)
    process.exit(1)
  }
  if (chosen.model === null) process.stdout.write(`The office gives this check ${model}${variant === null ? '' : ` at effort ${variant}`}: ${String(said.says ?? '')}\n`)
  // With a selection, the effort the start lines name is the one the selection passes.
  return { model, variant: selection === null ? variant : selection.native.effort, runtime, effort: said.effort, effortFrom: said.effortFrom, selection, provider }
}

/**
 * THE PROVIDER ROW THE OFFICE NAMES FOR A DSH OR CODEX CHECK whose selection names one, read strictly: the selection's own
 * Casting row, the provider the selection names, for the selection's program, with its key file's entry set. The office
 * refuses to start a check on any other (src/server/lib/run-models.ts), so an answer that still names one ends the tool
 * here, with nothing started and no verdict written.
 */
function theProviderTheOfficeNames(given, selection) {
  const read = given !== null && typeof given === 'object' && given.found === true && given.row === selection.casting?.id &&
    given.id === selection.native.providerRow && Array.isArray(given.programs) && given.programs.includes(selection.runtime) && given.key === 'set' &&
    typeof given.baseAddress === 'string' && given.baseAddress !== '' && typeof given.keyName === 'string' && given.keyName !== ''
  if (!read) {
    process.stderr.write(`The check's Casting selection names provider ${selection.native.providerRow}, and the office's answer does not name that provider for ${selection.runtime}, on the selection's own row, with its key set. Nothing was started and no verdict was written.\n`)
    process.exit(1)
  }
  return { row: given.row, id: given.id, baseAddress: given.baseAddress, keyName: given.keyName }
}

/**
 * THE EFFORT THE CHECK RUNS AT, or null, and the words for the start lines (wave 13v round 27). Row 11 of the Casting
 * table gives the inspector claude-sonnet-5 at effort max, and until this round no check passed the effort. It is the
 * office's to name, and it goes with the model it was named with: under another model that --model named, none is passed.
 */
function theEffortOfTheCheck(given, model) {
  // A DSH CHECK SETS NO EFFORT when none is passed: its client sends none, and dsh keeps its own setting.
  const none = RUNTIME === 'dsh' ? 'none is set, and dsh uses its own setting.'
    : `${RUNTIME === 'codex' ? 'Codex' : RUNTIME === 'opencode' ? 'OpenCode' : 'Claude Code'} uses its own setting.`
  if (given.variant === null) return { effort: null, at: '', after: ` No effort is ${RUNTIME === 'dsh' ? 'named' : 'passed'}, so ${none}` }
  if (given.model !== model) {
    return { effort: null, at: '', after: ` The office names effort ${given.variant} with ${String(given.model)}, and --model named ${model}, so it is not passed. No effort is passed, so ${none}` }
  }
  return { effort: given.variant, at: ` at effort ${given.variant}`, after: '' }
}

/**
 * A VERDICT THE DOOR REFUSED STILL REACHES THE WORKER, and the starter is told it happened (decision OTB8vrTnnvhL,
 * acceptance finding 69). On 24 September 2026 an inspector's right refusal rested on USER.md's invariant 5, which the
 * door did not take then, and it was recorded nowhere: the worker never heard it, and the starter never heard that the
 * check had ended. It was the second refusal lost that way.
 *
 * THE WORKER GETS THE WHOLE VERDICT, as the inspector wrote it, the door's refusal word for word, and where the run is
 * left. THE STARTER GETS ONE LINE: criteria C20 and C21 (design/rules/ACCEPTANCE.md) say that a higher-level
 * agent's context must not be polluted, and the starter is told that a check happened and is never sent the check. A door's sentence may name a
 * part of the verdict, such as the key or the basis it could not take, so the starter's line names the door's status,
 * not its words. Nothing here records a verdict: the door refused it, and the run stands as the door left it.
 *
 * `refusedFirst` is the door's first refusal, and what the model was asked to correct, when the model was asked once and the
 * verdict was posted again (theCheckIsAskedOnceToCorrect), and the worker is told both refusals word for word. It is null
 * otherwise.
 *
 * THE RUN IS READ AGAIN WITH THE SEAL READ FROM ITS COMMIT, as `theSealIsStillTheOneRead` reads it (wave 13u round 72):
 * by now the next round may work in the run's folder, and a read of that folder is refused. A read that fails anyway is
 * said, with its status and the door's words, and nobody is told: the tool does not know whom to tell.
 */
async function theRefusedVerdictIsDelivered(answered, refused, refusedFirst = null) {
  const doorSaid = theDoorsWords(refused.said)
  const whatTheDoorSaid =
    refusedFirst === null
      ? `What the door said, word for word: ${doorSaid}`
      : `The door refused it twice. What it said the first time, word for word (HTTP ${String(refusedFirst.refused.status)}): ${theDoorsWords(refusedFirst.refused.said)}\n\n` +
        `The model was then asked once, in the check's own session, to correct ${refusedFirst.corrected}, and the verdict was posted again. ` +
        `What the door said the second time, word for word: ${doorSaid}`
  await theUnrecordedVerdictIsSentOn(
    (stands) =>
      `The check of your run ${chosen.run} ended, and the verdict door refused its verdict with HTTP ${String(refused.status)}, ` +
      'so nothing was recorded on the run.\n\n' +
      `${whatTheDoorSaid}\n\n` +
      `Where the run is left, in the office's words: ${stands}\n\n` +
      `The verdict, as the inspector wrote it:\n${JSON.stringify(answered, null, 2)}`,
    (stands, handle) =>
      `The check of run ${chosen.run} by ${chosen.as} ended, but the verdict door refused its verdict (HTTP ${String(refused.status)}), ` +
      `so nothing was recorded on the run, which the office still reads as it did before the check: "${stands}" ` +
      `The verdict and the door's words are with ${handle}.`,
  )
}

/**
 * A VERDICT THAT WAS NOT RECORDED IS SENT ON: to the worker the run serves, `toTheWorker(stands)`, and to its starter, when
 * that is somebody else, `toTheStarter(stands, handle)` (theRefusedVerdictIsDelivered, and theVerdictIsHeldToTheSavedChapters
 * since round BL, item 2ao). `stands` is where the run stands, in the office's words, and `handle` the worker's handle.
 *
 * THE RUN IS READ AGAIN WITH THE SEAL READ FROM ITS COMMIT, as `theSealIsStillTheOneRead` reads it (wave 13u round 72):
 * by now the next round may work in the run's folder, and a read of that folder is refused. A read that fails anyway is
 * said, with its status and the door's words, and nobody is told: the tool does not know whom to tell.
 * @param {(stands: string) => string} toTheWorker
 * @param {(stands: string, handle: string) => string} toTheStarter
 * @returns {Promise<void>}
 */
async function theUnrecordedVerdictIsSentOn(toTheWorker, toTheStarter) {
  const now = await askAndHear(`/api/checks/${chosen.run}`, undefined, { headers: { [SEAL_READ_HEADER]: FROM_ITS_COMMIT } })
  if (!now.ok) {
    process.stdout.write(
      `The refused verdict could not be sent on: run ${chosen.run} could not be read again to find whom to tell (HTTP ${String(now.status)}: ${theDoorsWords(now.said)}).\n`,
    )
    return
  }
  const read = JSON.parse(now.said)
  const stands = read?.stands?.says ?? `Where the run stands could not be read (HTTP ${String(now.status)}).`
  const worker = read?.agent ?? null
  const tell = async (to, title, body) => {
    const heard = await askAndHear('/api/records', { kind: 'message', title, data: { body, to: [to] } })
    return heard.ok ? `message ${String(JSON.parse(heard.said)?.record?.id ?? '(no id)')}` : `not told: the message door answered ${String(heard.status)}`
  }
  if (worker === null) {
    process.stdout.write('The refused verdict could not be sent on: the check of this run names no agent it serves.\n')
    return
  }
  // THE WORKER IS ADDRESSED BY ITS REGISTRY ID. `agent` on GET /api/checks/:run is the worker's
  // registry row, and a new agent's id is not its handle. Sentences name it by the handle.
  const toTheWorkerSent = await tell({ kind: 'agent', id: worker.id }, `The check's verdict was not recorded: ${worker.handle}`, toTheWorker(stands))
  const starter = worker.startedBy ?? null
  const toTheStarterSent =
    starter === null || (starter.kind === 'agent' && (starter.id === worker.handle || starter.id === worker.id || starter.id === chosen.as))
      ? '(nobody else started it)'
      : await tell(starter, `A check's verdict was not recorded: ${worker.handle}`, toTheStarter(stands, worker.handle))
  process.stdout.write(`The refused verdict was sent on.\n  to the worker   ${toTheWorkerSent}\n  to the starter  ${toTheStarterSent}\n`)
}

/** THE WORDS OF A REFUSAL, from the `error` of the JSON the door answers with, or the answer as it came when it is not that. */
function theDoorsWords(said) {
  try {
    const parsed = JSON.parse(said)
    if (typeof parsed?.error === 'string') return parsed.error
  } catch {
    // The door's words are passed on as they came when they are not the JSON it usually answers with.
  }
  return said
}

/** Is `inner` the folder `outer` or somewhere inside it? One reading, the same rule the sandbox uses. */
function within(inner, outer) {
  const r = relative(outer, inner)
  return r === '' || (!r.startsWith('..') && !isAbsolute(r))
}

/**
 * WHAT THE MODEL'S RUN WROTE INTO THE OFFICE. Acceptance finding 44, 23 September 2026.
 *
 * A check's model runs the tree's browser tests, and the app those tests start files its own session
 * records into whichever office it can reach. The model has no office address (tools/inspector-sandbox.mjs
 * gives every command --no-office-variables), but a test that names an office itself can still write;
 * this is how that stops being invisible.
 *
 * The window runs from just before the model starts to just after it ends. The office lists every
 * record of this project created inside it; this picks the ones that belong to this check — whose
 * working directory is inside the check's own worktree, or whose creating session is this check's
 * session — because a window that caught somebody else's writes is not what the count is for. The
 * filter lives here because the door knows nothing about this check's worktree.
 *
 * Answers `{count, ids, from, to}`, or null because the door could not be read, or listed only the first
 * part of the window. Null is not zero: the caller says nothing rather than claiming the model wrote nothing.
 */
async function whatTheRunWrote(from, to) {
  const path = `/api/records/created-between?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
  let reply
  let said
  try {
    reply = await askAndHear(path, undefined, { quiet: true })
    said = reply.said
  } catch (why) {
    process.stderr.write(`The office could not be asked what this model's run wrote (${String(why)}). Nothing is claimed about it.\n`)
    return null
  }
  if (!reply.ok) {
    process.stderr.write(
      `The office could not list the records created in this model's window (HTTP ${String(reply.status)}): ${said}\n` +
        'Nothing is claimed about it.\n',
    )
    return null
  }
  let listed
  try {
    listed = JSON.parse(said)
  } catch {
    process.stderr.write("The office's answer about this model's window is not JSON. Nothing is claimed about it.\n")
    return null
  }
  const rows = Array.isArray(listed?.records) ? listed.records : []
  // A WINDOW THE DOOR CUT SHORT IS NOT COUNTED (the check of run 5OEGnN3JXrRs, 23 September 2026). The door
  // lists the first of the window's records and cannot page on, so a count of this check's among them would
  // be a lower bound written as the count: the silent fallback that is ruled out. So the field is left
  // off, which kinds.ts says means the tool could not count, and the reason is said in one sentence.
  if (listed?.truncated === true) {
    process.stderr.write(
      `More than ${String(rows.length)} records of this project were created in this model's window (the office matched ${String(listed.matched ?? 'more')}), ` +
        "and the door lists no more than that, so what the model wrote is not known and nothing is claimed about it.\n",
    )
    return null
  }
  const wrote = rows.filter((one) => {
    const directory = typeof one?.workingDirectory === 'string' ? one.workingDirectory : null
    const insideTheChecksTree = directory !== null && MADE_A_WORKTREE !== null && within(directory, MADE_A_WORKTREE)
    const theChecksSession = one?.createdBy?.sessionId === CHECK_ID
    return insideTheChecksTree || theChecksSession
  })
  const ids = wrote.map((one) => String(one.id))
  process.stdout.write(
    ids.length === 0
      ? "The model's run wrote nothing into the office.\n"
      : `The model's run wrote ${String(ids.length)} record${ids.length === 1 ? '' : 's'} into the office: ${ids.join(', ')}\n`,
  )
  return { count: ids.length, ids, from, to }
}

/**
 * WHAT THE MODEL SPENT GOES ON THE CHECK'S SESSION RECORD. U3: every check writes its usage.
 *
 * The line comes first. The worker reads this tool's standard output, builds the receipt from the
 * native runtime and output, and stores the receipt on the check's session. A check that ran no model has no
 * envelope, prints no line and stores nothing: absence beats a guess.
 *
 * A CHECK RUN BY HAND HAS NO WORKER TO READ THE LINE, so this tool stores the receipt itself (as in
 * vFGUngaLB98_, 25 September 2026). Which case it is in is read from the check's own session record.
 * The office's worker files every check it starts with `runtime: 'inspection-tool'`, and the check
 * door refuses a tool run with any other runtime (recordCheckToolStarted). So that runtime means the
 * worker writes the receipt, and this tool writes nothing, so it is never written twice. Any other
 * session is a check run by hand, and this tool writes the receipt from the same line, with the same
 * native-output rule that the worker uses.
 */
async function theUsageIsKept(output) {
  if (output === undefined || output === null) return
  // A DSH CHECK'S LINE NAMES THE MODEL IT ASKED DSH FOR, theDshSelection's, kept apart from the one its transcript names.
  const line = RUNTIME === 'dsh' ? inspectionUsageLine(RUNTIME, output, theDshChecksTranscript({ providerKey: PROVIDER_KEY }), DSH.model) : inspectionUsageLine(RUNTIME, output)
  // THE RECEIPT IS READ FROM THE LINE, as the worker reads it, so the two are worked out in one place.
  const receipt = inspectionUsageReceipt(inspectionUsageIn(line))
  process.stdout.write(line + '\n')
  const path = `/api/records/${encodeURIComponent(CHECK_ID)}`
  const notStored = (why) => {
    process.stderr.write(`The model ran, and its usage receipt was not stored on the check's session ${CHECK_ID}: ${why}\n`)
  }
  let session
  try {
    const reply = await askAndHear(path, undefined, { quiet: true })
    const said = reply.said
    if (reply.status === 404) {
      process.stdout.write(`No usage receipt was stored, because ${CHECK_ID} is not a session record in ${WORKSPACE}.\n`)
      return
    }
    if (!reply.ok) return notStored(`reading the record answered HTTP ${String(reply.status)}: ${said.slice(0, 400)}`)
    session = JSON.parse(said)?.record
  } catch (why) {
    return notStored(`the record could not be read: ${String(why)}`)
  }
  if (session?.kind !== 'session') {
    process.stdout.write(`No usage receipt was stored, because ${CHECK_ID} is not a session record in ${WORKSPACE}.\n`)
    return
  }
  if (session.data?.runtime === 'inspection-tool') return
  try {
    const reply = await askAndHear(path, { dataPatch: { usageReceipt: theReceiptWrittenOver(session.data?.usageReceipt, receipt) } }, { method: 'PATCH', quiet: true })
    const said = reply.said
    if (!reply.ok) return notStored(`HTTP ${String(reply.status)}: ${said.slice(0, 400)}`)
  } catch (why) {
    return notStored(`the office did not answer: ${String(why)}`)
  }
  process.stdout.write(`The usage receipt is stored on this check's session ${CHECK_ID}.\n`)
}

/**
 * A VERDICT THIS TOOL REFUSED BEFORE POSTING IT IS KEPT ON THE CHECK'S OWN SESSION, at data.extra under THE_UNPOSTED_VERDICT,
 * beside what extra already holds (round BL, item 2ao). The door never saw the verdict, so nothing else in the office holds
 * it. The office reads it from there when a second check of the run also ends with no verdict, and quotes it in the
 * problem it files. A write that fails is said, and the tool goes on to its ending.
 * @param {{ verdict: string, answer: string | null, refusals: string[] }} kept
 * @returns {Promise<void>}
 */
async function theUnpostedVerdictIsKept(kept) {
  const path = `/api/records/${encodeURIComponent(CHECK_ID)}`
  const notKept = (why) => {
    process.stderr.write(`The verdict and its refusals were not kept on the check's session ${CHECK_ID}: ${why}\n`)
  }
  try {
    const read = await askAndHear(path, undefined, { quiet: true })
    if (!read.ok) return notKept(`reading the record answered HTTP ${String(read.status)}: ${read.said.slice(0, 400)}`)
    const { record, version } = JSON.parse(read.said) ?? {}
    if (record?.kind !== 'session') return notKept(`${CHECK_ID} is not a session record in ${WORKSPACE}`)
    const extra = record.data?.extra !== null && typeof record.data?.extra === 'object' && !Array.isArray(record.data.extra) ? record.data.extra : {}
    const wrote = await askAndHear(path, { ifVersion: version, dataPatch: { extra: { ...extra, [THE_UNPOSTED_VERDICT]: kept } } }, { method: 'PATCH', quiet: true })
    if (!wrote.ok) return notKept(`HTTP ${String(wrote.status)}: ${wrote.said.slice(0, 400)}`)
  } catch (why) {
    return notKept(`the office did not answer: ${String(why)}`)
  }
  process.stdout.write(`The verdict and its refusals are kept on this check's session ${CHECK_ID}.\n`)
}

/**
 * EACH USE OF A PROVIDER'S KEY IS RECORDED ON THE CHECK'S OWN SESSION, without the value: a list at data.extra under
 * THE_PROVIDER_KEY_USES (src/shared/the-provider-table.ts), beside what extra already holds, written before each start of
 * the model. A write that fails stops that start, so no key goes out unrecorded. Answers null once it is written, and
 * otherwise why it was not.
 * @param {{ check: string, castingRow: number, provider: string, keyName: string, at: string }} use
 * @returns {Promise<string | null>}
 */
async function theProviderKeyUseIsRecorded(use) {
  const path = `/api/records/${encodeURIComponent(CHECK_ID)}`
  try {
    const read = await askAndHear(path, undefined, { quiet: true })
    if (!read.ok) return `reading the record answered HTTP ${String(read.status)}: ${read.said.slice(0, 400)}`
    const { record, version } = JSON.parse(read.said) ?? {}
    if (record?.kind !== 'session') return `${CHECK_ID} is not a session record in ${WORKSPACE}`
    const extra = record.data?.extra !== null && typeof record.data?.extra === 'object' && !Array.isArray(record.data.extra) ? record.data.extra : {}
    const uses = Array.isArray(extra[THE_PROVIDER_KEY_USES]) ? extra[THE_PROVIDER_KEY_USES] : []
    const wrote = await askAndHear(path, { ifVersion: version, dataPatch: { extra: { ...extra, [THE_PROVIDER_KEY_USES]: [...uses, use] } } }, { method: 'PATCH', quiet: true })
    if (!wrote.ok) return `HTTP ${String(wrote.status)}: ${wrote.said.slice(0, 400)}`
  } catch (why) {
    return `the office did not answer: ${String(why)}`
  }
  return null
}

/**
 * A DSH CHECK'S OWN TRANSCRIPT, for its turn reading and usage line: `{text, from}`, where `from` is the path the check saw, or
 * `{text: null, why}`. dsh's ACP output carries no tokens, and its transcript does (1S-Comh3Shf-). It is read on
 * the host, each time, from the check's private home, which the model can write in. So nothing there is followed: each
 * folder on the way and the file itself must not be a link, the sessions folder must be the home's own, the session
 * folder must hold one transcript, and the file is read whole or not at all, only through the descriptor it was opened
 * as, and only when that is the file looked at here and it is inside the home's own sessions folder
 * (theFileThatWasChecked, review OcaFB-eOWjWp, point 1).
 *
 * THE KEY IT MASKS is the one the check's view was handed: `providerKey`, the provider row's key (PROVIDER_KEY), or, where
 * that is null, the template's dsh key by its names.
 */
function theDshChecksTranscript({ sayMask = true, providerKey = null } = {}) {
  const seen = (path) => `/check/home/${relative(SANDBOX.home, path)}`
  const no = (why) => ({ text: null, why })
  if (THE_MODEL_SESSION === null) return no('this check named no dsh session')
  const sessions = join(SANDBOX.home, '.dsh', 'sessions')
  try {
    for (const folder of [join(SANDBOX.home, '.dsh'), sessions, join(sessions, projectKey('/work'))]) {
      const held = lstatSync(folder, { throwIfNoEntry: false })
      if (held === undefined) return no(`no transcript of dsh session ${THE_MODEL_SESSION} was found, because ${seen(folder)} does not exist`)
      if (held.isSymbolicLink()) return no(`${seen(folder)} is a link, and no link is followed`)
      if (!held.isDirectory()) return no(`${seen(folder)} is not a folder`)
    }
    const realSessions = join(realpathSync(SANDBOX.home), '.dsh', 'sessions')
    if (realpathSync(sessions) !== realSessions) return no(`${seen(sessions)} is not where the check's private home keeps it`)
    const file = theTranscriptOfTheSession(join(SANDBOX.home, '.dsh'), '/work', THE_MODEL_SESSION)
    if (file === null) return no(`no transcript of dsh session ${THE_MODEL_SESSION} was found in ${seen(join(sessions, projectKey('/work')))}`)
    const folder = dirname(file)
    const heldFolder = lstatSync(folder)
    if (heldFolder.isSymbolicLink()) return no(`${seen(folder)} is a link, and no link is followed`)
    if (!heldFolder.isDirectory()) return no(`${seen(folder)} is not a folder`)
    // THE FILES theNewestTranscriptIn (tools/dsh-hooks/served.mjs) chooses among, by its own test of a name. With two,
    // the newest is a guess.
    const transcripts = readdirSync(folder).filter((one) => /\.jsonl(\.zstd)?$/.test(one) && one.startsWith('session'))
    if (transcripts.length !== 1) return no(`the session folder ${seen(folder)} holds ${String(transcripts.length)} transcript files, so which is this session's cannot be said`)
    const from = seen(file)
    const heldFile = lstatSync(file)
    if (heldFile.isSymbolicLink()) return no(`the transcript ${from} is a link, and no link is followed`)
    if (!heldFile.isFile()) return no(`the transcript ${from} is not a regular file`)
    const bytes = theFileThatWasChecked(file, heldFile, realSessions)
    if (!bytes.ok) return no(`the transcript ${from}: ${bytes.why}`)
    const read = theTextOfTheTranscript(file, bytes.bytes)
    if (read.text === null) return no(`the transcript ${from} could not be read as text: ${read.why}`)
    // THE KEY DSH WAS HANDED IS MASKED in the transcript, which its model can write, before the usage line prints it and the
    // receipt files it (problem DNSRdZtWGTjS).
    let masked
    try {
      masked = providerKey === null
        ? maskedOfWhatTheViewIsHanded(SANDBOX, theSecretNamesOf('dsh', { provider: DSH.provider }), read.text)
        : maskedOfWhatTheViewIsHanded(SANDBOX, [], read.text, { providerKey })
    } catch (why) {
      return no(`the transcript ${from}: ${why instanceof Error ? why.message : String(why)}`)
    }
    // The turn reading is silent; the usage line's read says what was masked once per model run, as before.
    if (sayMask) theMaskSays(`The dsh transcript ${from}`, masked.masked)
    return { text: masked.text, from }
  } catch (why) {
    return no(`the check's dsh folder could not be read: ${why instanceof Error ? why.message : String(why)}`)
  }
}

/**
 * THE LAST TURN OF A DSH TRANSCRIPT, from the same guarded, masked text the usage line reads (FaVKio76L-3u;
 * 32A_TmNldtFa). Only its last turn/end can show it finished, and no answer may follow that end.
 *
 * A resumed session holds earlier turns. If a resume is stopped before dsh writes its turn/start, the earlier
 * completed turn is still last and this reader calls it finished. The client's own stopReason check in
 * tools/inspector-dsh-acp.mjs covers that gap; keep it.
 * @param {string | null} text
 * @param {string | undefined} why
 * @returns {{ finished: true } | { finished: false, saw: string }}
 */
function theLastDshTurnIn(text, why) {
  const no = (saw) => ({ finished: false, saw })
  if (text === null) return no(`The dsh transcript was not read: ${why}.`)
  const lines = text.split('\n')
  if (lines.at(-1) === '') lines.pop()
  let started = false
  let ended = false
  let kind
  let answerAfterEnd = false
  for (let n = 0; n < lines.length; n += 1) {
    let event
    try {
      event = JSON.parse(lines[n])
    } catch {
      return no(`Line ${String(n + 1)} of the transcript is not one JSON event.`)
    }
    if (event === null || typeof event !== 'object' || Array.isArray(event) || typeof event.type !== 'string' || event.type === '') {
      return no(`Line ${String(n + 1)} of the transcript is not one JSON event.`)
    }
    if (event.type === 'turn/start') {
      started = true
      ended = false
      kind = undefined
      answerAfterEnd = false
    } else if (started && event.type === 'turn/end') {
      ended = true
      kind = event.data?.reason?.kind
      answerAfterEnd = false
    } else if (started && ended && event.type === 'assistant/message') {
      answerAfterEnd = true
    }
  }
  if (!started) return no('The transcript has no turn/start.')
  if (!ended) return no('turn/start with no turn/end: the turn was interrupted.')
  if (answerAfterEnd) return no('An assistant/message comes after the last turn/end.')
  if (typeof kind !== 'string' || kind === '') return no('The last turn/end has no reason kind.')
  if (kind !== 'completed') return no(`The last turn/end has reason kind ${JSON.stringify(kind)}.`)
  return { finished: true }
}

/**
 * THE CHECK'S OWN SESSION IS A SESSION RECORD, or the check stops before it starts anything.
 *
 * In a sandbox the check registers the container and every process it starts there against its own
 * session (chapter 2, rule 2), and a row whose session is not a record could never be read as ended
 * or still going. The office's worker always passes --check with the session it filed for the check.
 */
/**
 * ONE COMMAND OF A STANDARD CHANGE'S CHECK, RUN ON THE SEALED TREE: in the inspector's sandbox, where the code under
 * check runs, or on the host when --on-the-host was given. It is handed no secret, no login and none of the office's
 * variables. Answers `{ code, seconds, said }`. `code` is null when the command did not run to an end, its clock's stop
 * included, and `said` is the end of what it wrote. Alongside, in the folder of the check's own log, the complete output
 * of the command is kept before the private worktree can go: tools/standard-check-runs.mjs writes it for both paths.
 */
async function aStandardCheckOnTheTree({ name, argv, limitMs }) {
  const log = typeof reads?.theCheck?.execution?.log === 'string' && reads.theCheck.execution.log !== '' ? reads.theCheck.execution.log : null
  // EACH CHECK'S EVIDENCE IS NAMED FOR ITS OWN EXECUTION LOG AND CHECK, not just its stage: two checks with logs in one
  // folder and the same stage must not overwrite each other. The check session, run and process keep a reused log path's
  // invocations apart as well.
  const owner = log === null
    ? ''
    : `standard-${CHECK_ID}-${chosen.run}-${String(process.pid)}-${basename(log).replace(/[^a-z0-9.-]/giu, '-')}-`
  const keepAt = log === null ? null : join(dirname(log), `${owner}${name.replace(/[^a-z0-9-]/gu, '-')}.txt`)
  // A RUN OF THE NAMED TESTS TAKES A TEST-BATCHES SEAT, as the tool does when a person runs it. The child it starts is
  // given no office, so it asks for none itself. In the sandbox the seat is held by this tool's group, which holds the
  // launcher; on the host, by the child's own group.
  const what = argv[0] === 'node' && argv[1] === 'tools/run-named-tests.mjs' ? `the standard check ${name}` : null
  let ran
  if (SANDBOX !== null) {
    const seat = what === null ? null : await aTestBatchSeatFor(what)
    try {
      ran = await runASandboxStandardCheck({
        name,
        argv,
        limitMs,
        cwd: MADE_A_WORKTREE ?? whereTheCheckIsCut(SANDBOX),
        sandbox: SANDBOX,
        keepAt,
        runInside,
      })
    } finally {
      seat?.giveBack()
    }
  } else {
    ran = await runAStandardCheckAsAChild({ name, argv, limitMs, cwd: WHERE, keepAt, seat: what === null ? null : (pid) => aTestBatchSeatFor(what, pid) })
  }
  const kept = theKeptOutputSays(ran)
  const logs = ran.keptLogs ?? { keptAt: null, keptWhy: null, copied: 0 }
  const logsFailed = logs.keptWhy !== null && logs.keptWhy !== 'the office named no log for this check'
  if (ran.complete === false || logsFailed) {
    return {
      code: null,
      seconds: ran.seconds,
      said: `Its evidence could not be kept completely, so it does not pass. ${kept}${theKeptLogsSay(logs)} ${ran.said}`.trim(),
    }
  }
  return { code: ran.code, seconds: ran.seconds, said: `${ran.said}${kept}${theKeptLogsSay(logs)}` }
}

/**
 * ONE OF A STANDARD CHANGE'S OWN CHECKS. The changed-tests check first runs its preparation (the vite build that writes
 * dist/web, which a private sealed tree has not built), then the named test command, inside ONE limit: the preparation
 * may take at most its own cap and the tests get what is left of the same check's ten minutes. No test runs if the
 * preparation fails, and both commands keep their complete output and their own .logs beside the check log.
 */
async function aStandardCheckRuns({ name, argv, limitMs, prepare = null }) {
  const started = Date.now()
  const seconds = () => (Date.now() - started) / 1000
  const remaining = () => theTimeLeft(limitMs, Date.now() - started)
  let prepared = null
  if (prepare !== null) {
    const prepareLimit = thePreparationLimit({ limitMs, prepareLimitMs: prepare.limitMs ?? limitMs, spentMs: Date.now() - started })
    prepared = await aStandardCheckOnTheTree({ name: `${name}-prepare`, argv: prepare.argv, limitMs: prepareLimit })
    if (prepared.code !== 0) {
      return {
        code: prepared.code,
        seconds: seconds(),
        said: `The preparation ${prepared.code === null ? 'did not run to an end' : `exited ${String(prepared.code)}`}, so no test ran. ${prepared.said}`,
      }
    }
  }
  const left = remaining()
  if (left <= 0) return { code: null, seconds: seconds(), said: 'The preparation used the whole ten-minute check, so no test ran.' }
  const ran = await aStandardCheckOnTheTree({ name, argv, limitMs: left })
  const thePreparation = prepared === null ? '' : ` Preparation: ${prepared.said}`
  return { code: ran.code, seconds: seconds(), said: `${thePreparation} ${ran.said}`.trim() }
}

async function theCheckIsFiledAsASession() {
  let reply = null
  let said = null
  try {
    reply = await askAndHear(`/api/records/${encodeURIComponent(CHECK_ID)}`, undefined, { quiet: true })
    said = reply.ok ? JSON.parse(reply.said) : null
  } catch (why) {
    process.stderr.write(`${API} could not be asked whether ${CHECK_ID} is this check's session: ${String(why)}\nNothing was assembled and nothing was written.\n`)
    process.exit(1)
  }
  const kind = said?.record?.kind
  if (kind !== 'session') {
    process.stderr.write(
      `The check's session ${CHECK_ID} is not a session record in ${WORKSPACE} (HTTP ${reply.status}` +
        `${typeof kind === 'string' ? `; it is a ${kind}` : ''}). A check in the inspector's sandbox registers the container and ` +
        'every process it starts there against its own session, and a row with no session behind it is on no list. ' +
        'Pass --check <the session record of this check>, as the office\'s worker does, or --on-the-host. ' +
        'Nothing was assembled and nothing was written.\n',
    )
    process.exit(1)
  }
}

/**
 * WHAT CHANGED, AS GIT SEES IT: EVERY PATH, AND A DIFF FOR THE ONES INSIDE THE WORK AREA.
 *
 * It asks git for every path the checkout changed against the base, with no pathspec, so a change
 * outside the area is found and can be named. Then it reads a diff only for the paths inside the
 * area, so a wide branch does not become a wide request: the server never reads an outside diff,
 * and the rule that says which is which is `insideTheWorkArea`, the one the server sorts by.
 *
 * MEASURED, ON THE FIRST REAL CHECK THIS TOOL RAN. This function used to hand git the area as its
 * pathspec, so a change outside the area was never discovered at all: not filtered, not named. The
 * run under check had changed src/web/pages/RecordPage.tsx outside a work area of src/server/lib,
 * src/server/api, src/shared, tools and tests, and the prompt did not carry the name. The server's
 * sorting was written and tested to name an outside change; its only caller never found one.
 *
 * Where the area is empty or nobody recorded one, every path is sent and nothing is read: the
 * server says what each of those two facts means, and a change is still named. An outside path's
 * `changes` is a sentence saying it was not read, so the server is never handed an empty string
 * that looks like a file whose diff is empty.
 *
 * A PLUGIN-ONLY CHANGE THAT LEAVES THE MANIFEST ALONE IS NOT READ EITHER, in wave 13x
 * round 17. Plugin changes stay independent of the office's development. `thePluginRuleOf`
 * decides it from every changed path, the one rule the
 * server sorts by too, so no diff of such a change is read here or sent.
 */
const NOT_READ = 'Outside the work area. Named, not read.'
const NOT_IN_THE_FILES_AREA = 'Outside the files area. Named, not read.'
const NOT_IN_THE_SCOPE = 'Outside this scoped check. It keeps an earlier verdict. Named, not read.'
function changesIn(area, base, tip) {
  const paths = []
  try {
    const named = guardedGitBytes(WHERE, ['diff', '--name-only', base, tip]).toString('utf8')
    for (const line of named.split('\n')) if (line.trim() !== '') paths.push(line.trim())
  } catch (why) {
    process.stderr.write(
      `git could not say what changed in ${WHERE} between ${base} and ${tip}: ${String(why)}\n` +
        'Nothing was assembled and nothing was written.\n',
    )
    process.exit(1)
  }
  const inside = Array.isArray(area) ? area : []
  const plugin = thePluginRuleOf(paths)
  return paths.map((path) => ({
    path,
    changes: !insideTheScope(path, chosen.only)
      ? NOT_IN_THE_SCOPE
      : !insideTheWorkArea(path, inside)
        ? NOT_READ
        : plugin.read
          ? oneDiff(base, tip, path)
          : NOT_READ_BY_THE_PLUGIN_RULE,
  }))
}

/**
 * WHAT THE CHECKOUT LOOKS LIKE RIGHT NOW: the commit it is on, and every path that differs from it.
 *
 * MEASURED, ON THE FIRST CHECK THAT EVER RAN TO AN ANSWER. The inspector refused the release —
 * correctly — and then wrote the missing test, corrected the code and committed it, because the
 * runtime it was given can edit files. Criterion C22 says an inspector that fixes what it found
 * fails the check, and the guard in the server compares RECORDS: a commit is not a record, so
 * nothing saw it.
 *
 * This is the other half of that guard, and it lives here because this is the process that can look
 * at a working tree: nothing under src/ may run git. It is a photograph before and after; anything
 * that differs is the inspector having written something, and the act is not posted.
 *
 * BOTH TREES ARE PHOTOGRAPHED, AND THAT IS BECAUSE OF C30. Once the check reads a worktree of its
 * own, an inspector editing what it is looking at shows up there — but one that reaches into the
 * WORKER'S tree by absolute path would show up in neither, and the first draft of C30 opened exactly
 * that hole. So both are watched.
 *
 * THEY MEAN SLIGHTLY DIFFERENT THINGS AND ARE SAID SEPARATELY. The check's own tree changing is the
 * inspector writing something. The worker's tree changing is either the inspector reaching into it
 * or the worker still working, and the words say both because this process cannot tell which — but
 * either way the check read a tree that is no longer the tree, and posting it would be posting a
 * check of something else.
 */
async function howTheCheckoutStands() {
  // THE WORKER'S TREE IS READ ON A THREAD OF ITS OWN while this thread reads the check's
  // (tools/inspector-photographs.mjs): nothing orders the two reads. `unreadIsSaid` is set for the worker's checkout in
  // a sandbox, which this check does not read (wave 13u round 72). A tree that cannot be read elsewhere stops the
  // check, and the check's own tree is said first, as it was when the two were read one after the other.
  const theWorkers = aPhotographBegun(THE_WORKERS_CHECKOUT, IN_A_SANDBOX)
  const stopsIfNotRead = (photograph) => {
    if ('stops' in photograph) {
      process.stderr.write(photograph.stops)
      process.exit(1)
    }
    return photograph
  }
  const check = stopsIfNotRead(MADE_A_COPY ? aPhotographOfTheCopy(WHERE) : aPhotographOf(WHERE))
  return { check, worker: stopsIfNotRead(await theWorkers) }
}

/**
 * A COPY IS NOT A REPOSITORY, SO GIT CANNOT PHOTOGRAPH IT. Asked in a copy, `git status` answers the
 * same error before and after, and a model that rewrote a staged file would pass criterion C22
 * unseen. So a copy is photographed by what is in it: every entry, walked without following a link,
 * and every file's sha256 and mode. A file changed, added, removed or made executable shows as a
 * changed line.
 */
function aPhotographOfTheCopy(at) {
  const lines = []
  const walk = (folder, prefix) => {
    let entries
    try {
      entries = readdirSync(folder, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    } catch (why) {
      lines.push(`${prefix === '' ? '.' : prefix} could not be read: ${String(why)}`)
      return
    }
    for (const entry of entries) {
      const path = prefix === '' ? entry.name : `${prefix}/${entry.name}`
      const full = join(folder, entry.name)
      if (entry.isDirectory()) {
        walk(full, path)
        continue
      }
      if (!entry.isFile()) {
        lines.push(`${path} is neither a file nor a folder`)
        continue
      }
      try {
        const fd = openSync(full, constants.O_RDONLY | constants.O_NOFOLLOW)
        try {
          const found = fstatSync(fd)
          const hash = createHash('sha256')
          const piece = Buffer.allocUnsafe(Math.max(1, Math.min(8 * 1024 * 1024, found.size)))
          for (let read = readSync(fd, piece, 0, piece.length, null); read > 0; read = readSync(fd, piece, 0, piece.length, null)) hash.update(piece.subarray(0, read))
          lines.push(`${path} ${hash.digest('hex')} ${(found.mode & 0o777).toString(8)}`)
        } finally {
          closeSync(fd)
        }
      } catch (why) {
        lines.push(`${path} could not be read: ${String(why)}`)
      }
    }
  }
  walk(at, '')
  return { head: 'a copy, which has no commit', dirty: lines.join('\n') }
}

/** What changed in one tree between two photographs, in words, or null because nothing did. */
function whatChangedIn(before, after) {
  const changed = []
  if (before.head !== after.head) changed.push(`the commit moved from ${before.head} to ${after.head}`)
  if (before.dirty !== after.dirty) {
    const was = new Set(before.dirty.split('\n').filter((one) => one !== ''))
    const now = after.dirty.split('\n').filter((one) => one !== '' && !was.has(one))
    changed.push(
      now.length === 0
        ? 'files that were changed before the check are no longer changed'
        : `${String(now.length)} path${now.length === 1 ? '' : 's'} changed that had not: ${now.map((one) => one.trim()).join(', ')}`,
    )
  }
  return changed.length === 0 ? null : changed.join('; ')
}

/**
 * What changed in either tree between two photographs, named by which tree: what the inspector may have built.
 *
 * THE WORKER'S TREE COUNTS ONLY ON THE HOST (problem Qrcr9t4iT2Id; message G-D_vRTtcULr). In the inspector's
 * sandbox the model cannot reach it: the run's repository is mounted read-only and the worker's tree is never mounted
 * (tools/inspector-sandbox.mjs). So there a change in the worker's tree is the worker going on working, and
 * whatTheWorkerDidMeanwhile says it without stopping the check; the verdict is about the tip the check read, and the
 * queue lands only what the seal froze. On 7 September 2026 a worker's one more commit threw a whole verdict away. With
 * --on-the-host Claude keeps reading tools and Codex keeps its read-only sandbox;
 * the guards still watch both trees.
 */
function whatTheInspectorBuilt(before, after) {
  const changed = []
  const inTheCheck = whatChangedIn(before.check, after.check)
  if (inTheCheck !== null) changed.push(`${MADE_A_COPY ? 'in the copy this check made' : 'in the worktree this check cut'}, ${inTheCheck}`)
  const inTheWorkers = IN_A_SANDBOX ? null : whatChangedIn(before.worker, after.worker)
  if (inTheWorkers !== null) {
    changed.push(
      `in the worker's own checkout, which this check was not reading and must not touch, ${inTheWorkers}`,
    )
  }
  return changed.length === 0 ? null : changed.join('; ')
}

/**
 * THE WORKER WENT ON WORKING WHILE A CHECK IN A SANDBOX READ: the sentence that says so, naming the run and saying the
 * check did not read the later changes, or null. Never a reason to stop (whatTheInspectorBuilt). A worker's checkout
 * that could not be read, the folder deleted among the reasons, is said the same way (wave 13u round 72).
 */
function whatTheWorkerDidMeanwhile(before, after) {
  if (!IN_A_SANDBOX) return null
  const read = MADE_A_COPY ? 'the tree it copied' : `the tip it read, ${before.check.head}`
  const unread = after.worker.unread ?? before.worker.unread
  if (unread !== undefined) {
    return `Run ${chosen.run}'s worker's own checkout ${THE_WORKERS_CHECKOUT} could not be read while this check ran: ${unread}. ` +
      (existsSync(THE_WORKERS_CHECKOUT) ? '' : `The folder ${THE_WORKERS_CHECKOUT} no longer exists. `) +
      `This check does not read that checkout; its verdict is about ${read}.`
  }
  const inTheWorkers = whatChangedIn(before.worker, after.worker)
  if (inTheWorkers === null) return null
  return `Run ${chosen.run}'s worker went on working while this check read: in its own checkout, ${inTheWorkers}. ` +
    `This check did not read those later changes; its verdict is about ${read}.`
}

/**
 * THE BASE THE CHANGES ARE READ AGAINST: THE FORK POINT, OR WHAT SOMEBODY TYPED.
 *
 * A check is about what one run did. What one run did is its branch, and its branch is what has
 * happened since the branch was cut — so the base is the FORK POINT: the merge base of the
 * checkout's head and the branch it was cut from, the run's own cutFrom where it names one and the
 * repository's trunk where it does not. The trunk is read through `inspectionTrunk`, the same one
 * function the seal and the server's check read it through, so none of the three can disagree.
 *
 * ---------------------------------------------------------------------------------------
 * MEASURED, ON THE FIRST REAL CHECK THIS TOOL RAN, 7 SEPTEMBER 2026
 * ---------------------------------------------------------------------------------------
 *
 * That check was assembled against c5f342ed, which is not an ancestor of the branch it was
 * checking (head 476dd5d1). Its true fork point is 7009bd36. `git diff --name-only c5f342ed
 * 476dd5d1` names 27 files; `git diff --name-only 7009bd36 476dd5d1` names 19. The eight extra
 * are other people's work — src/web/components/graph/Canvas.tsx, CardFace.tsx, card.ts,
 * cardhere.ts and three test files among them — and the inspector was asked to hold the run to
 * them. It noticed, and said so in its refusal; nothing in the tool did.
 *
 * TWO THINGS ARE FIXED HERE, and neither is the merge base itself, which was right.
 *
 *   1. NOTHING SAID WHICH BASE WAS USED OR HOW IT WAS FOUND. The prompt carried the diff and not
 *      its own provenance, so a wrong base is invisible to the only reader who could catch it.
 *      Now the base and the sentence saying how it was found go into the prompt.
 *   2. A BASE THAT COULD NOT BE FOUND BECAME `HEAD`, quietly. `git diff HEAD` is the uncommitted
 *      changes, so a checkout whose branch has no `main` to fork from produced a check of almost
 *      nothing that read as a check of everything. Absence beats a guess: it now stops and says so.
 *
 * AND A BRANCH ALREADY MERGED IS THE THIRD FACE OF THE SAME TRAP. Once the branch is in `main`,
 * `git merge-base HEAD main` is HEAD itself and the diff is empty — a check that would read as
 * "this run changed nothing". That is not something to report as a clean branch, so it stops.
 *
 * THE BRANCHES ARE READ IN THE WORKER'S REPOSITORY, and the tip is the commit the check's tree is at.
 * On the host the check's worktree is a worktree of that same repository, so this reads what it always
 * read. In a sandbox the worktree belongs to the sandbox's clone, whose branches are not the worker's
 * (its `main` is whatever it was when the clone was made), so reading them there would be a fork point
 * against somebody else's branch, found without a word. A commit is the same commit in both, and it is
 * brought into the sandbox's clone before the diffs are read.
 *
 * @returns {{ ref: string, how: 'typed' | 'fork point', says: string }}
 */
function theBase(against, cutFrom) {
  if (against !== null && against !== undefined && against !== '' && SANDBOX !== null) {
    // A TYPED BASE IN A SANDBOX is what it names in the worker's repository, read as a commit there
    // and brought into the sandbox's clone, so the diff is against the same commit it is on the host.
    let commit = ''
    try {
      commit = guardedGit(THE_WORKERS_CHECKOUT, ['rev-parse', '--verify', `${against}^{commit}`])
      fetchIntoTheSandbox(SANDBOX, THE_WORKERS_CHECKOUT, [commit])
    } catch (why) {
      process.stderr.write(
        `The base typed with --against, ${against}, could not be read as a commit in ${THE_WORKERS_CHECKOUT} and brought ` +
          `into the sandbox: ${why instanceof Error ? why.message : String(why)}\nNothing was assembled and nothing was written.\n`,
      )
      process.exit(1)
    }
    return {
      ref: commit,
      how: 'typed',
      says:
        `The base is ${against}, and it was typed on the command line with --against; in ${THE_WORKERS_CHECKOUT} it names ` +
        `the commit ${commit}, which is what the changes were read against. It was not worked out from the branch, so ` +
        'nothing here can say it is the fork point. Changes below are everything between that commit and this checkout, ' +
        'which may include work this run never did.',
    }
  }
  if (against !== null && against !== undefined && against !== '') {
    return {
      ref: against,
      how: 'typed',
      says:
        `The base is ${against}, and it was typed on the command line with --against. It was not worked out ` +
        'from the branch, so nothing here can say it is the fork point. Changes below are everything between ' +
        'that commit and this checkout, which may include work this run never did.',
    }
  }
  // THE TRUNK IS READ FROM THE REPOSITORY, not assumed to be `main`. This runs only when the run
  // named no cutFrom; the same function does it for the server's check and for the seal.
  const BRANCHES = THE_WORKERS_CHECKOUT
  const trunk = inspectionTrunk({
    remoteHead: () => {
      try { return guardedGit(BRANCHES, ['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD']) }
      catch { return null }
    },
    localExists: (name) => {
      try {
        guardedGit(BRANCHES, ['rev-parse', '--verify', '--quiet', `${name}^{commit}`])
        return true
      } catch { return false }
    },
  })
  if (!cutFrom && trunk.branch === null) {
    process.stderr.write(
      `The fork point could not be found in ${BRANCHES}: ${trunk.says}\n` +
        'Say the base with --against, or record the branch on the run.\n',
    )
    process.exit(1)
  }
  let branch = cutFrom || trunk.branch
  let from = ''
  let head = ''
  let base = ''
  try {
    head = guardedGit(WHERE, ['rev-parse', 'HEAD'])
    const resolved = guardedGit(BRANCHES, ['rev-parse', '--verify', `${branch}^{commit}`])
    // THE TRUNK IS THE NEWER OF THE LOCAL BRANCH AND origin's (theNewerTrunk), as the seal reads it.
    const chosenBase = theNewerTrunk(inspectionBase(cutFrom, head, resolved, trunk), trunk.branch, {
      commitOf: (ref) => {
        try {
          return guardedGit(BRANCHES, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`])
        } catch { return null }
      },
      contains: (newer, older) => {
        try {
          guardedGit(BRANCHES, ['merge-base', '--is-ancestor', older, newer])
          return true
        } catch (why) {
          if (why && why.status === 1) return false
          throw why
        }
      },
    })
    if (chosenBase.branch === null) {
      process.stderr.write(`The fork point could not be found in ${BRANCHES}: ${chosenBase.says}\nNothing was assembled and nothing was written.\n`)
      process.exit(1)
    }
    branch = chosenBase.branch
    from = chosenBase.says
    base = guardedGit(BRANCHES, ['merge-base', head, branch])
  } catch (why) {
    process.stderr.write(
      `The fork point could not be found in ${WHERE}: git could not give the merge base of HEAD and ` +
        `${branch} (${String(why)}).\n` +
        `Which branch this checkout was cut from is ${from}. Nothing was assembled and nothing was written.\n` +
        'Say the base with --against, or record the branch on the run.\n',
    )
    process.exit(1)
  }
  if (base === '') {
    process.stderr.write(
      `The fork point could not be found in ${WHERE}: HEAD and ${branch} have no common commit, so there ` +
        'is no branch to read. Nothing was assembled and nothing was written.\n' +
        'Say the base with --against, or record the branch on the run.\n',
    )
    process.exit(1)
  }
  if (base === head) {
    process.stderr.write(
      `This checkout's HEAD (${head}) is already contained in ${branch}, so the merge base is HEAD itself ` +
        'and the changes against it are none.\n' +
        'That is a branch already merged, not a run that changed nothing, and the two must not read alike. ' +
        'Nothing was assembled and nothing was written.\n' +
        'Check the run before it was merged, or say the base with --against.\n',
    )
    process.exit(1)
  }
  return {
    ref: base,
    how: 'fork point',
    says:
      `The base is the fork point ${base}: the merge base of this checkout's HEAD (${head}) and ${branch}, ` +
      `the branch it was cut from — ${from}. Changes below are the branch's own and nothing that happened ` +
      `on ${branch} after it was cut.`,
  }
}

/**
 * One file's diff, capped, with the cap said out loud rather than silently trimming.
 *
 * BETWEEN TWO COMMITS, never against the files in the tree: git runs a filter the repository names
 * when it reads a file in the work tree (src/config/guarded-git.mjs). The tree was cut at `tip`.
 */
const MOST_BYTES_PER_FILE = 40_000
function oneDiff(base, tip, path) {
  let said = ''
  try {
    said = guardedGitBytes(WHERE, ['diff', base, tip, '--', path], { before: ['--literal-pathspecs'] }).toString('utf8')
  } catch (why) {
    return `git could not read this file's changes: ${String(why)}`
  }
  if (Buffer.byteLength(said) <= MOST_BYTES_PER_FILE) return said
  return (
    `${said.slice(0, MOST_BYTES_PER_FILE)}\n\n[This diff is ${String(Buffer.byteLength(said))} bytes and the ` +
    `first ${String(MOST_BYTES_PER_FILE)} are above. The rest was not read. Ask for it with ` +
    `git diff ${base} ${tip} -- ${path}.]`
  )
}

/** The commit the check's own tree was cut at, which its diffs are read up to, or a loud stop. */
function theCommitTheTreeIsAt() {
  try {
    return guardedGit(WHERE, ['rev-parse', 'HEAD'])
  } catch (why) {
    process.stderr.write(`git could not say what commit ${WHERE} is at: ${String(why)}\nNothing was assembled and nothing was written.\n`)
    process.exit(1)
  }
}

/**
 * ONE LINE NAMING WHAT A MASK MASKED, by name and count and never by value, when it masked anything.
 * @param {string} where @param {Record<string, number>} masked
 */
function theMaskSays(where, masked) {
  const named = Object.entries(masked).map(([name, n]) => `${name} ${n === 1 ? 'once' : `${String(n)} times`}`)
  if (named.length > 0) process.stdout.write(`${where} held ${named.join(', ')}, masked before any of it was printed or filed.\n`)
}

/** THE MOST OF A MODEL'S ANSWER THIS TOOL PRINTS FOR A PERSON (problem DNSRdZtWGTjS). The whole is kept in the model state. */
const THE_MOST_OF_AN_ANSWER_PRINTED = 4_000

/**
 * `label` and `text`, for a person: the text cut to its first THE_MOST_OF_AN_ANSWER_PRINTED characters when it is longer,
 * with a line saying how many were not printed and where the whole is kept. `whole` follows the label only when the text
 * is printed whole.
 * @param {string} label @param {string} text @param {string} [whole]
 */
function anAnswerToPrint(label, text, whole = '') {
  if (text.length <= THE_MOST_OF_AN_ANSWER_PRINTED) return `${label}${whole}:\n${text}\n`
  return `${label}, cut to its first ${String(THE_MOST_OF_AN_ANSWER_PRINTED)} characters:\n${text.slice(0, THE_MOST_OF_AN_ANSWER_PRINTED)}\n` +
    `${String(text.length - THE_MOST_OF_AN_ANSWER_PRINTED)} more characters are not printed here. The whole answer, masked, is kept in ${theModelStateFile()}.\n`
}

/**
 * WHAT A MODEL THAT FAILED SAID, for the sentence that says why the check did not finish, on both paths.
 *
 * CLAUDE -p WITH JSON OUTPUT SAYS WHY IT FAILED ON ITS STANDARD OUTPUT, measured on the first real run in a sandbox: a
 * model that could not sign in exited 1 with nothing on its error channel and the reason in the envelope. So that is
 * quoted when the error channel is empty. The host path said only "It printed nothing on the error channel" until
 * 5 October 2026 (problem JRY5OEjnrAPu), when a prompt too long for the model was explained only on standard output.
 * @param {string} err @param {string} out @returns {string}
 */
function whatAFailedModelSaid(err, out) {
  return (
    err.trim().slice(0, 800) ||
    (out.trim() === ''
      ? 'It printed nothing on the error channel.'
      : `It printed nothing on the error channel, and this on its standard output: ${out.trim().slice(0, 800)}`)
  )
}

/**
 * EACH TEST-BATCHES SEAT THE CHECK HELD OR RAN WITHOUT, one sentence each, in the order they ended. They go into what
 * the verdict read, and into what a standard release read.
 * @type {string[]}
 */
const THE_SEATS_SAID = []

/**
 * A TEST-BATCHES SEAT FOR ONE THING THE CHECK RUNS: its model, each time it is started, and the standard check's run of
 * tools/run-named-tests.mjs. The office keeps a few of these seats for every batch of tests on this machine, and a check
 * runs beside those batches. tools/test-batch-seat.mjs asks for the seat and gives it back.
 *
 * It is asked for as this check asks for everything: its session, its handle and the office's own key. Nothing new is
 * handed to what runs. It is held by the process group of `pid`: this tool's, which holds the model on the host and the
 * sandbox's launcher, or the standard check's own child. A busy machine keeps it waiting with no limit, and what it is
 * for starts, with its clock, only once it is granted. A refused or unanswered ask stops the check with a reason;
 * without a configured office outside a sandbox, it runs without a seat.
 *
 * `giveBack()` is called once, when what ran has ended, however it ended. It gives the seat back and keeps the sentence
 * for the verdict. A kill gives nothing back: the office takes back a seat whose process group has ended.
 *
 * @param {string} what what the seat is for, as a sentence would start: "the check's model"
 * @param {number} [pid]
 */
async function aTestBatchSeatFor(what, pid = process.pid) {
  const opening = `${what}:`
  /**
   * THE WAIT IS SAID IN THE CHECK'S OUTPUT WHILE IT HAPPENS. The worker leaves these two lines' time out of the
   * check's clock, so it can tell a wait that has begun from one that has not. The finished line is written however
   * the question ended, and the words are the reader's in src/config/a-checks-seat-wait.mjs.
   */
  process.stdout.write(`${theCheckBeganAsking(clockStamp().instant)}\n`)
  let seat
  try {
    seat = await aTestBatchSeat(
      { api: API, workspace: WORKSPACE, agent: chosen.as, session: THE_CHECKS_SESSION ?? undefined, configuration: undefined },
      `node tools/the-inspector.mjs: ${what}, in the check of the run ${chosen.run}`,
      (words) => process.stdout.write(`${words}\n`),
      {
        pid,
        key: () => {
          const held = theHeldOfficeKey()
          return held.key === null ? { key: null, why: held.says } : { key: held.key }
        },
        words: {
          opening,
          unseated: (why) => `${opening} runs without a ${TEST_BATCH_POOL} seat: ${why}`,
          whenItEnds: 'when it ends',
          ended: 'the check tool exited',
          stoppedBy: (signal) => `the check was stopped by ${signal}`,
        },
      },
    )
  } finally {
    process.stdout.write(`${theCheckFinishedAsking(clockStamp().instant)}\n`)
  }
  return {
    giveBack() {
      seat.giveBack(`${what} ended`)
      const said = theSeatSays(what, seat)
      process.stdout.write(`${said}\n`)
      THE_SEATS_SAID.push(said)
    },
  }
}

/**
 * WHAT ONE SEAT SAYS IN THE VERDICT: when it was asked for, when it was granted and after how long, and when it was given
 * back. Or that what it was for ran without one, and why.
 * @param {string} what
 * @param {Awaited<ReturnType<typeof aTestBatchSeat>>} seat
 */
function theSeatSays(what, seat) {
  const What = `${what.charAt(0).toUpperCase()}${what.slice(1)}`
  if (seat.grantedAt === null || seat.askedAt === null) return `${What} ran without a ${TEST_BATCH_POOL} seat: ${String(seat.why)}`
  const waited = Math.round(elapsedSeconds(seat.askedAt, seat.grantedAt) * 10) / 10
  const back = seat.givenBackAt === null
    ? `could not give it back (${String(seat.whyNotGivenBack)}), so the office takes it back once the process group that held it has ended`
    : `gave it back at ${seat.givenBackAt}`
  return `${What} asked for a ${TEST_BATCH_POOL} seat at ${seat.askedAt}, was given the seat ${String(seat.id)} at ${seat.grantedAt} ` +
    `after waiting ${String(waited)} s, and ${back}.`
}

/** WHAT THE CHECK READ, with what each of its seats said after it. */
const withWhatTheSeatsSaid = (read) => THE_SEATS_SAID.length === 0 ? read : { ...read, says: `${read.says} ${THE_SEATS_SAID.join(' ')}` }

/**
 * THE PROMPT GOES IN ON STDIN, NOT ON THE COMMAND LINE.
 *
 * MEASURED, ON THE FIRST REAL CHECK THIS TOOL EVER RAN. A prompt of 167,673 bytes as an argv entry
 * is past the kernel's limit on the whole argument block, and `spawn` fails with `E2BIG` — an
 * uncaught throw, not a run that reported a problem. A check that dies for being big is the worst
 * shape of failure here, because the checks worth running are the big ones.
 *
 * `tools/agent-worker.mjs` passes its prompt the same way and has the same trap; that is filed as
 * its own problem rather than fixed from here.
 *
 * In a private view the measured prompt is a read-only controller input, opened through its /inputs path.
 *
 * `resume` names the check's own Claude session, for the one question asked back in it (wave 13y round 23).
 */
async function runClaude(prompt, { resume = null } = {}) {
  const isTheJudgment = !THE_SESSION_WAS_READ
  try {
    if (!THE_SESSION_WAS_READ) {
      THE_SESSION_WAS_READ = true
      if (existsSync(theModelStateFile())) {
        const saved = theRetainedModelState()
        THE_MODEL_SESSION = saved.session
        THE_NATIVE_OUTPUT = saved.output ?? ''
        THE_MODELS_OUTPUT_IS = 'read'
        resume = THE_MODEL_SESSION
      }
    }
    const given = theChecksCommand(resume)
    theModelSessionIsSaved()
    // THE MODEL STARTS ONLY ONCE IT HAS A SEAT, and its clock with it. The seat is given back however the model ends.
    const seat = await aTestBatchSeatFor(resume === null ? "the check's model" : "the check's model, resumed in its own session")
    let ran
    try {
      ran = SANDBOX === null ? await runClaudeOnTheHost(prompt, given) : await runClaudeInTheSandbox(prompt, given, resume !== null)
    } finally {
      seat.giveBack()
    }
    if (ran.nativeOutput !== undefined) {
      THE_NATIVE_OUTPUT += `${THE_NATIVE_OUTPUT === '' ? '' : '\n'}${ran.nativeOutput}`
      ran.nativeOutput = THE_NATIVE_OUTPUT
      THE_MODELS_OUTPUT_IS = 'read'
    }
    if (ran.envelope?.session_id) {
      if (resume !== null && ran.envelope.session_id !== resume) {
        if (RUNTIME === 'opencode' || RUNTIME === 'dsh') theModelSessionIsSaved()
        return { ...ran, ok: false, why: `The ${RUNTIME} answer names another session, so it cannot continue this check. No verdict was written.` }
      }
      if (isTheJudgment) THE_MODEL_SESSION = ran.envelope.session_id
    }
    theModelSessionIsSaved()
    // Read here, after the envelope's session is settled: on the first run the sandbox returns before
    // THE_MODEL_SESSION is set. This also checks every question asked back in that same session.
    if (RUNTIME === 'dsh' && ran.ok) {
      const transcript = theDshChecksTranscript({ sayMask: false, providerKey: given.providerKey ?? null })
      const turn = theLastDshTurnIn(transcript.text, transcript.why)
      if (!turn.finished) return { ...ran, ok: false, why: `${turn.saw} No verdict was written.` }
    }
    return ran
  } catch (why) {
    return { ok: false, why: why instanceof Error ? why.message : String(why) }
  }
}

let THE_COPY_TO_RESUME = null
let THE_MODEL_SESSION = null
let THE_NATIVE_OUTPUT = ''
let THE_SESSION_WAS_READ = false
/**
 * WHAT IS KNOWN OF WHAT THIS CHECK'S MODEL WROTE IN ITS VIEW (whatTheModelLeft): 'no model' while none has been started
 * there, 'not read' once one may have been, and 'read' once THE_NATIVE_OUTPUT holds all it wrote.
 */
let THE_MODELS_OUTPUT_IS = 'no model'
/** Why the model's first run did not finish, when it did not: the error view-removed.json keeps (whatTheModelLeft). */
let THE_MODELS_FAILURE = null
const theModelStateFile = () => SANDBOX === null
  ? join(WHERE_WORKTREES_GO, `a-check-of-${chosen.run}-${CHECK_ID}-model.json`)
  : join(SANDBOX.checkDir, 'model-session.json')
function theModelSessionIsSaved() {
  mkdirSync(dirname(theModelStateFile()), { recursive: true })
  if (MADE_A_COPY && THE_COPY_TO_RESUME === null) THE_COPY_TO_RESUME = aPhotographOfTheCopy(WHERE)
  writeFileSync(theModelStateFile(), JSON.stringify({ run: chosen.run, check: CHECK_ID, runtime: RUNTIME, model: MODEL,
    session: THE_MODEL_SESSION, output: THE_NATIVE_OUTPUT, directory: WHERE, tip: theTreeThatWasRead.tip ?? null,
    seal: reads.submission?.id ?? null, sealHash: reads.submission?.seal.hash ?? null,
    privateWork: SANDBOX === null ? null : whereTheCheckIsCut(SANDBOX), home: SANDBOX?.home ?? null,
    ...(MADE_A_COPY ? { copySnapshot: THE_COPY_TO_RESUME, before: BEFORE } : {}) }), { mode: 0o600 })
}
function theRetainedModelState() {
  const saved = JSON.parse(readFileSync(theModelStateFile(), 'utf8'))
  if (saved.runtime !== RUNTIME || saved.model !== MODEL || saved.run !== chosen.run || saved.check !== CHECK_ID) throw new Error(`This check previously ran on ${saved.runtime} model ${saved.model}. It cannot resume on ${RUNTIME} model ${MODEL}. Start a fresh check session. No model was started and no verdict was written.`)
  if (saved.seal !== (reads.submission?.id ?? null) || saved.sealHash !== (reads.submission?.seal.hash ?? null) ||
      (SANDBOX !== null && (saved.privateWork !== whereTheCheckIsCut(SANDBOX) || saved.home !== SANDBOX.home))) throw new Error('The retained seal or private native state does not match this check. No model was started.')
  if (typeof saved.session !== 'string' || saved.session === '') throw new Error('The previous attempt names no native session to resume. Start a fresh check session. No model was started and no verdict was written.')
  if (RUNTIME === 'opencode' && (typeof saved.output !== 'string' || theModelsAnswer(saved.output).envelope.session_id !== saved.session)) throw new Error('The retained OpenCode output does not name this check\'s one consistent native session. No model was started and no verdict was written.')
  if (RUNTIME === 'dsh' && !theDshOutputIsOneSession(saved.output, saved.session)) throw new Error('The retained dsh output does not name this check\'s one consistent native session. No model was started and no verdict was written.')
  return saved
}
process.on('exit', () => {
  if (SANDBOX === null && (theVerdictIsDelivered || theDryAssemblyCompleted)) rmSync(theModelStateFile(), { force: true })
})

/** Native verification permissions, including correction/resume; host Claude keeps its reading tools. */
function theChecksCommand(resume) {
  if (resume !== null && resume !== THE_MODEL_SESSION) throw new Error('The requested session does not belong to this check. No model was started.')
  if (resume !== null && (typeof resume !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(resume))) throw new Error('The check names an invalid session. No model was started.')
  if (RUNTIME === 'codex' && resume !== null && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(resume)) throw new Error('The check names an invalid Codex thread. No model was started.')
  if (RUNTIME === 'opencode' && resume !== null && !/^ses_[A-Za-z0-9]+$/.test(resume)) throw new Error('The check names an invalid OpenCode session. No model was started.')
  if (RUNTIME === 'dsh' && resume !== null && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(resume)) throw new Error('The check names an invalid dsh session. No model was started.')
  // THE INSPECTOR'S OWN DSH ACP CLIENT, which runClaudeInTheSandbox copies into the commands folder, on the route and at
  // the effort theDshSelection gave. Its start values are its own, so none are made here. It carries PROVIDER_KEY, the one
  // key its view is handed when its row names a provider row, apart from env, which goes on the argument list.
  if (RUNTIME === 'dsh') {
    return { command: theDshCheckCommand({ provider: DSH.provider, model: DSH.model, effort: DSH.reasoningEffort ?? null, resume }),
      env: { ...DSH_CHECK_ENV }, providerKey: PROVIDER_KEY }
  }
  // THE CLAUDE CODE EFFORT'S OPTION, from the one table: the commands below write no option of their own.
  const claudeEffortOption = HOW_EACH_COMMAND_TAKES_AN_EFFORT['claude-code']?.option ?? null
  if (RUNTIME === 'claude-code' && SELECTION === null && EFFORT.effort !== null && claudeEffortOption === null) {
    throw new Error('The effort table gives Claude Code no option for its effort. Nothing was started.')
  }
  // The container is the write boundary there; neither host harness gains file writes.
  const checkCwd = SANDBOX === null ? MADE_A_WORKTREE ?? WHERE : '/work'
  const codexPermissions = SANDBOX === null ? ['-a', 'never', '-s', 'read-only'] : FULL_PERMISSIONS.codex.args
  const codexHostSettings = SANDBOX === null ? [
    '-c', 'sandbox_mode="read-only"', '-c', 'approval_policy="never"',
  ] : []
  // WITH A SELECTION, Claude Code's and Codex's commands carry no model or effort of their own, and aCommandsStartValues
  // adds the selection's. OpenCode's keeps -m in its place, with the selection's native route, because
  // tools/inspector-sandbox.mjs checks that shape before it starts anything; the selection takes that value as its own
  // and adds only --variant. A CODEX CHECK WHOSE ROW NAMES A PROVIDER ROW carries theCodexProviderOptions of the row's
  // base address, before resume as every exec option is, and PROVIDER_KEY, the one key its view is handed; runInside
  // refuses the key to any command without those options.
  const command = RUNTIME === 'opencode'
    ? ['opencode', 'run', '--format', 'json', '--dir', checkCwd, '-m', NATIVE_ROUTE, '--pure',
        ...(resume === null ? [] : ['--session', resume]), '--']
    : RUNTIME === 'codex'
    ? ['codex', ...codexPermissions, '-C', checkCwd, 'exec', '--json', ...codexHostSettings,
        ...(GIVEN.provider === null ? [] : theCodexProviderOptions(GIVEN.provider.baseAddress)), ...(resume === null ? [] : ['resume', resume]), ...(SELECTION === null ? ['-m', withoutTheProvider(MODEL)] : []), '--', '-']
    : ['claude', ...(SANDBOX === null ? ['--permission-mode', 'dontAsk'] : FULL_PERMISSIONS['claude-code'].args),
        '--tools', SANDBOX === null ? 'Read,Glob,Grep' : 'default', '--add-dir', SANDBOX === null ? theRecordsFolder() : '/inputs/records',
        '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}', '-p', '--output-format', 'json',
        ...(SELECTION === null ? ['--model', withoutTheProvider(MODEL), ...(EFFORT.effort === null ? [] : [claudeEffortOption, EFFORT.effort])] : []),
        ...(resume === null ? [] : ['--resume', resume])]
  // THE HARNESS'S OWN SUBAGENTS AND WORKFLOWS ARE OFF. Claude Code's and Codex's switches go in after the program, as
  // tools/harness-features-off.mjs gives them, and a command they cannot be put into starts nothing. OpenCode's is the
  // config content in OPENCODE_CHECK_ENV, whose exact check in runInside refuses a command without it. dsh's is its
  // client's (tools/inspector-dsh-acp.mjs).
  const off = (given) => {
    const switched = aCommandWithTheHarnessFeaturesOff(given.command, given.env, RUNTIME)
    if (switched.says.length > 0) throw new Error(`${switched.says.join(' ')} No model was started.`)
    return { ...given, command: switched.command, env: { ...given.env, ...switched.env } }
  }
  // aCommandsStartValues gives a Codex selection to applyLauncherSelection with no environment, which is called here
  // itself only to say that this check carries the provider row.
  if (RUNTIME === 'codex' && GIVEN.provider !== null) {
    return off({ ...applyLauncherSelection(command, { runtime: RUNTIME, model: MODEL, selection: SELECTION, aCheckCarriesTheProvider: true }), providerKey: PROVIDER_KEY })
  }
  const given = aCommandsStartValues(command, { runtime: RUNTIME, model: MODEL, ...(SELECTION === null
    ? { effortAnswer: { effort: EFFORT.effort, effortFrom: EFFORT.effort === null ? 'none' : GIVEN.effortFrom ?? 'Casting' } }
    : { selection: SELECTION }) })
  return RUNTIME === 'opencode' ? { ...given, env: { ...given.env, ...OPENCODE_CHECK_ENV } } : off(given)
}

/** Native output supplies the answer, session and usage; tool output and reasoning never supply a verdict. */
function theModelsAnswer(out, { resumed = false } = {}) {
  if (RUNTIME === 'dsh') return theDshAnswer(out, resumed)
  if (RUNTIME === 'claude-code') {
    const parsed = theEnvelopeIn(out)
    return { ...parsed, nativeOutput: out }
  }
  if (RUNTIME === 'opencode') {
    const events = []
    let why = null
    for (const line of out.split(/\r?\n/).filter(line => line.trim() !== '')) {
      try {
        const event = JSON.parse(line)
        if (event === null || typeof event !== 'object' || Array.isArray(event) || typeof event.type !== 'string') throw new Error('not a native event')
        events.push(event)
      } catch { why = 'OpenCode returned malformed structured output.' }
    }
    const sessions = new Set()
    for (const event of events) {
      if (typeof event.sessionID !== 'string' || !/^ses_[A-Za-z0-9]+$/.test(event.sessionID)) why = 'OpenCode output names a missing or invalid native session identity.'
      else sessions.add(event.sessionID)
      if (event.part?.sessionID !== undefined && event.part.sessionID !== event.sessionID) why = 'OpenCode output names conflicting native session identities.'
      if (event.type === 'text' && (event.part?.type !== 'text' || typeof event.part.text !== 'string' ||
          typeof event.part.time?.end !== 'number' || event.part.time.end <= 0)) why = 'OpenCode returned malformed completed assistant text.'
    }
    if (sessions.size !== 1) why = `OpenCode output must name one consistent native session identity; ${sessions.size === 0 ? 'none was found' : 'conflicting identities were found'}.`
    const messages = events.filter(event => event.type === 'text' && event.part?.type === 'text' && typeof event.part.text === 'string' && event.part.time?.end > 0)
    const failed = events.find(event => event.type === 'error')
    return { envelope: { result: messages.at(-1)?.part.text ?? '', session_id: why === null ? [...sessions][0] : null,
      is_error: why !== null || failed !== undefined,
      error: why ?? failed?.error?.data?.message ?? failed?.error?.message ?? failed?.error?.name ?? null }, nativeOutput: out }
  }
  const events = jsonLines(out)
  const threads = [...new Set(events.filter(event => event.type === 'thread.started').map(event => event.thread_id))]
  const messages = events.filter(event => event.type === 'item.completed' && event.item?.type === 'agent_message')
  const failed = events.find(event => {
    const warning = aCodexTierWarning(JSON.stringify(event))
    if (warning !== null) process.stderr.write(`${warning}\n`)
    return event.type === 'turn.failed' || (event.type === 'error' && warning === null)
  })
  return { envelope: { result: messages.at(-1)?.item?.text ?? '', session_id: threads.length === 1 ? threads[0] : null,
    is_error: failed !== undefined || threads.length > 1, error: failed?.error?.message ?? failed?.message ?? (threads.length > 1 ? 'Codex named more than one thread.' : null) }, nativeOutput: out }
}

/** The one line the dsh ACP client writes (tools/inspector-dsh-acp.mjs), when it has that shape; otherwise null. */
function aDshEnvelope(line) {
  let envelope
  try { envelope = JSON.parse(line) } catch { return null }
  const textOrNull = (value) => value === null || typeof value === 'string'
  const route = envelope?.route
  return envelope !== null && typeof envelope === 'object' && !Array.isArray(envelope) && envelope.type === 'dsh-acp-result' &&
    textOrNull(envelope.sessionId) && typeof envelope.resumed === 'boolean' && typeof envelope.isError === 'boolean' &&
    typeof envelope.result === 'string' && textOrNull(envelope.effortSet) && textOrNull(envelope.error) &&
    (route === null || (typeof route === 'object' && typeof route.provider === 'string' && typeof route.model === 'string'))
    ? envelope : null
}

/**
 * A DSH CHECK'S ANSWER, from the one envelope its client writes. The client checks its route and effort itself; they
 * are checked here again against what this check asked for, and so is whether the session was resumed, so an answer
 * to another question is never taken as this check's.
 */
function theDshAnswer(out, resumed) {
  const lines = out.split(/\r?\n/).filter(line => line.trim() !== '')
  const envelope = lines.length === 1 ? aDshEnvelope(lines[0]) : null
  const effort = DSH.reasoningEffort ?? null
  const why = lines.length === 0 ? 'The dsh ACP client wrote nothing on its output, where it writes its result envelope.'
    : lines.length > 1 ? `The dsh ACP client wrote ${String(lines.length)} lines on its output; it writes exactly one, its result envelope.`
    : envelope === null ? "The dsh ACP client's output is not its result envelope."
    : envelope.isError ? envelope.error ?? 'The dsh ACP client reported an error without saying what it was.'
    : envelope.route === null || envelope.route.provider !== DSH.provider || envelope.route.model !== DSH.model
      ? `The dsh ACP client reports ${envelope.route === null ? 'no route' : `the route ${envelope.route.provider}/${envelope.route.model}`}, but this check asked for ${DSH.provider}/${DSH.model}.`
    : envelope.effortSet !== effort ? `The dsh ACP client reports the effort set as ${envelope.effortSet ?? 'none'}, but this check asked for ${effort ?? 'none'}.`
    : envelope.resumed !== resumed ? `The dsh ACP client reports a ${envelope.resumed ? 'resumed' : 'new'} session, but this check asked for a ${resumed ? 'resumed' : 'new'} one.`
    : null
  return { envelope: { result: envelope?.result ?? '', session_id: envelope?.sessionId ?? null, is_error: why !== null, error: why }, nativeOutput: out }
}

/** Whether a dsh check's saved output is envelopes only, at least one, each naming the saved session. */
function theDshOutputIsOneSession(output, session) {
  const lines = typeof output === 'string' ? output.split(/\r?\n/).filter(line => line.trim() !== '') : []
  return lines.length > 0 && lines.every(line => aDshEnvelope(line)?.sessionId === session)
}

/** The stop by this tool's own clock, in the one sentence both places say it. */
function stoppedByTheClockSays() {
  return (
    `The check was still running after ${String(RUN_LIMIT_MS / 60000)} minutes and was stopped by this ` +
    'tool, so nothing was written. Give it longer with --limit, or a smaller diff with --against.'
  )
}

/**
 * THE MODEL, IN THE INSPECTOR'S SANDBOX, with verification permissions,
 * registered through the supported private check-view launcher and waited for. It answers exactly what
 * the host run answers, so everything after it reads one shape.
 *
 * `given.providerKey` is the one key a dsh or Codex command's view is handed from a provider row; only those two of
 * theChecksCommand's commands carry one, and any other command is handed none.
 */
async function runClaudeInTheSandbox(prompt, given, resumed = false) {
  const providerKey = given.providerKey ?? null
  let signedIn = ''
  try {
    signedIn = aLoginForTheModel(SANDBOX, { minutes: MINUTES, runtime: RUNTIME, model: NATIVE_ROUTE,
      provider: providerKey === null ? null : { id: providerKey.provider, native: providerKey.native } })
  } catch (why) {
    return { ok: false, why: why instanceof Error ? why.message : String(why) }
  }
  process.stdout.write(`${signedIn}\n`)
  if (providerKey !== null) {
    const notRecorded = await theProviderKeyUseIsRecorded({ check: CHECK_ID, castingRow: providerKey.row, provider: providerKey.provider, keyName: providerKey.keyName, at: nowStamp() })
    if (notRecorded !== null) return { ok: false, why: `${A_PROVIDER_ROWS_CHECK} refused: this use of provider ${providerKey.provider}'s key could not be recorded on the check's session ${CHECK_ID}: ${notRecorded}. The model was not started.` }
    process.stdout.write(`This use of provider ${providerKey.provider}'s key, the key file's entry ${providerKey.keyName}, for Casting row ${String(providerKey.row)}, is recorded on this check's session ${CHECK_ID}.\n`)
  }
  const promptFile = join(SANDBOX.checkDir, 'commands', 'prompt.txt')
  mkdirSync(dirname(promptFile), { recursive: true, mode: 0o700 })
  writeFileSync(promptFile, prompt, { mode: 0o600 })
  // A DSH CHECK'S CLIENT, and beside it a copy of src/config/dsh-harness-features-off.patch.json, the patch list that
  // turns dsh's own subagents and workflows off, which the client gives dsh (tools/inspector-dsh-acp.mjs).
  if (RUNTIME === 'dsh') {
    copyTheDshClient(join(SANDBOX.checkDir, 'commands'))
    putTheFeaturesOffBesideTheClient(join(SANDBOX.checkDir, 'commands'), DSH_FEATURES_OFF[1])
  }
  // FROM HERE A MODEL MAY BE STARTED IN THE VIEW, and what it wrote is read before the view could go (whatTheModelLeft).
  THE_MODELS_OUTPUT_IS = 'not read'
  let ran
  try {
    ran = await runInside(SANDBOX, {
      label: RUNTIME === 'claude-code' ? 'claude' : RUNTIME,
      runtime: RUNTIME,
      cwd: MADE_A_WORKTREE ?? whereTheCheckIsCut(SANDBOX),
      argv: aCommandWithItsEnv(given.env, given.command),
      stdin: promptFile,
      limitMs: RUN_LIMIT_MS,
      providerKey,
    })
  } finally {
    if (RUNTIME === 'claude-code') takeTheLoginBack(SANDBOX)
  }
  theMaskSays('What the model answered', ran.masked)
  // WHAT THE LAUNCHER SAYS IT HANDED, the base address whole and the key by its name, goes into the check's output.
  if (typeof ran.started?.provider === 'string') process.stdout.write(`${ran.started.provider}\n`)
  if (ran.started === null) return { ok: false, why: `The ${RUNTIME} command could not be started in the sandbox ${SANDBOX.instance}: ${ran.why}` }
  const parsed = theModelsAnswer(ran.out, { resumed })
  if (ran.stoppedByTheClock) return { ok: false, why: stoppedByTheClockSays(), ...parsed }
  const errors = whatAFailedModelSaid(ran.err, ran.out)
  // A RUN THAT FAILED MAY STILL HAVE SPENT TOKENS: claude exits 1 with an `error_max_turns` envelope
  // after a whole run. So the envelope is kept on the failure whenever the output is one. U3.
  if (ran.code === null) return { ok: false, why: `${RUNTIME} in the sandbox ${SANDBOX.instance} ${ran.why}. ${errors}`, ...parsed }
  // A DSH CLIENT THAT FAILED SAYS WHY IN ITS ONE ENVELOPE, so that is what is said when there is one.
  const failed = RUNTIME === 'dsh' ? aDshEnvelope(ran.out.trim())?.error ?? errors : errors
  if (ran.code !== 0) return { ok: false, why: `${RUNTIME === 'claude-code' ? 'claude' : RUNTIME} exited ${String(ran.code)}. ${failed}`, ...parsed }
  return parsed.envelope === undefined || parsed.envelope.is_error
    ? { ok: false, why: `${RUNTIME} did not return a successful native answer: ${parsed.envelope?.error ?? errors}`, ...parsed }
    : { ok: true, ...parsed }
}

/**
 * THE ENVELOPE OF A RUN THAT FAILED, when its standard output is one: `{ envelope }`, or nothing.
 * Only a JSON object counts, because the usage line prints the envelope's fields.
 */
function theEnvelopeIn(out) {
  try {
    const envelope = JSON.parse(out)
    return typeof envelope === 'object' && envelope !== null && !Array.isArray(envelope) ? { envelope } : {}
  } catch {
    return {}
  }
}

/**
 * The controller writes records outside the private work/home roots. Their measured prompt paths
 * name the read-only /inputs/records mount. Failed or guarded checks retain the controller files.
 * Explicit host checks keep the existing record folder beside their worktree.
 */
function theRecordsFolder() {
  return SANDBOX === null ? join(WHERE_WORKTREES_GO, `a-check-of-${chosen.run}-${CHECK_ID}-records`) : join(SANDBOX.checkDir, 'records')
}

/**
 * HOW MANY WORDS OF THE CARRIED REPORTS THAT MAY BE IDS ARE ASKED FOR, at most (problem D884ZlvZz3A7). 120 since 30
 * September 2026: a triage round's report names more than 40 records (message oHkKuNZOP1xC, on check
 * dwwpG2NYGqFR), and each word asked is one small local read.
 */
const THE_MOST_WORDS_ASKED = 120

/**
 * THE MOST NAMED RECORDS OF OTHER KINDS THAN A REPORT WRITTEN FOR THE MODEL: 80, where every other sort is
 * THE_MOST_OF_ONE_SORT (message oHkKuNZOP1xC). Check dwwpG2NYGqFR of wave 13k (30 September 2026, 07:11) could
 * not read seven problems its triage round named: the tool carried twenty records of other kinds and named the rest
 * as over the cap, and the problems the round said it fixed came late in its report. A problem or a decision is a few
 * kilobytes; the prompt gains one line for each, and the model opens a record's file only if it needs it.
 */
const THE_MOST_NAMED_RECORDS = 80

/** A WORD THAT MAY BE A RECORD'S ID: twelve of the characters an id is made of, standing alone. */
const A_WORD_THAT_MAY_BE_AN_ID = /(?<![A-Za-z0-9_-])[A-Za-z0-9_-]{12}(?![A-Za-z0-9_-])/g

/**
 * WHETHER SUCH A WORD IS WORTH ASKING ABOUT: an office id is twelve random characters, so it nearly always holds a digit or
 * a capital after its first; a word of twelve letters, capitalised or not, does neither.
 * @param {string} word
 */
function mayBeAnId(word) {
  return /[0-9]/.test(word) || /[A-Z]/.test(word.slice(1))
}

/**
 * EVERY STRING A VALUE HOLDS, however deep: the words of a record's title, summary and data, read as written. Not its JSON,
 * whose escapes would stand a letter before an id that starts a line.
 * @param {unknown} value
 * @returns {string[]}
 */
function theTextsIn(value) {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) return value.flatMap(theTextsIn)
  if (value !== null && typeof value === 'object') return Object.values(value).flatMap(theTextsIn)
  return []
}

/** THE MOST RECORDS OF ONE SORT WRITTEN FOR THE MODEL: the newest reports, and the session's tasks. A run whose reports
 * are not linked to it is read with every report its agent wrote, and that can be hundreds. */
const THE_MOST_OF_ONE_SORT = 20

/**
 * WHY THE TOOL WANTED A RECORD FOR ITS MODEL. The office's own list is WHY_THE_TOOL_WANTED_IT in
 * src/server/lib/inspection.ts, which the prompt door checks each one against; a tool cannot import the server, so this
 * is the tool's one copy of it.
 * @typedef {'report' | 'named-report' | 'named-record' | 'started-for' | 'session-task' | 'last-message' | 'decision'} As
 */

/**
 * THE RECORDS THE CHECK'S MODEL READS, WRITTEN AS FILES IT CAN OPEN (problem YxzFRQIpx9Pz, 29 September 2026). The model
 * runs with no key and no office address, on purpose (acceptance finding 44). Since wave 13n's key rules landed (entry
 * b2SyzP8DoP_P, 29 September 2026, 00:11) the office refuses a request with no key from a sandbox, so the model's read of
 * its run's report was refused and the check went on without it. This tool holds the office's key for its verdict: it
 * reads, with that key, the run's reports, the records its brief names, and the newest message of the run's agent that
 * this check may read, each whole as the office holds it now, and writes each into one JSON file. The office names them
 * in the prompt. The model still asks the office nothing and holds no key.
 *
 * EVERY RECORD A CARRIED REPORT NAMES, WHATEVER ITS KIND, AND IN WHICHEVER PROJECT HOLDS IT (problem ZTS6soSziHJ-). Check
 * 1m54plR7y05x (30 September 2026) said it could not read two decisions and an earlier check that the round's report
 * named: this tool had read them, answered 200, and carried only reports, so each was counted as "a record of another
 * kind" and left out. Now a named report is carried as before, up to THE_MOST_OF_ONE_SORT, and a named record of any
 * other kind is carried too, up to THE_MOST_NAMED_RECORDS. And a record the office says is in another project is asked
 * for once more there, with the same key (`readWherever`), so a decision filed in another project is read as well; what
 * this check may read is still the office's to decide, and a message it may not read is answered as no record at all.
 *
 * EVERY RECORD A KEPT WHY NAMES TOO (uQMufaAoVuVs). The whys of the paths the server keeps are read for record
 * ids as the reports' words are: after them, in the list's order, first occurrence wins, and into the same 120-asked,
 * 80-named-record and 20-named-report budgets. A why of a path the server dropped is not among them — its path is not
 * in the sealed change, so its why is about some other round — and the caller never hands one here.
 * @param {any} reads  what GET /api/checks/<run> answered
 * @param {string} folder
 * @param {{ path: string, why: string }[]} keptWhys  the whys of the paths the server keeps (the prompt door's used list)
 * @returns {Promise<{ written: { path: string, id: string, kind: string, title: string, as: As }[], couldNotCarry: { id: string, as: As, why: string }[] }>}
 */
async function writeTheRecordsForTheModel(reads, folder, keptWhys = []) {
  /** @type {Map<string, { record: any, as: As }>} */
  const records = new Map()
  // AN ID IS A PLAIN NAME, so nothing but a plain name becomes a file name.
  /** @param {unknown} id */
  const plain = (id) => typeof id === 'string' && /^[A-Za-z0-9_-]{6,40}$/.test(id)
  /**
   * WHAT THE TOOL MEANT TO HAND THE MODEL AND COULD NOT, each with why (problems iVfuq3VBSnih and 7vaMy2NYnNQc): said
   * here, and named in the prompt, so the model can tell a record it was not given from one that was never filed.
   * @type {{ id: string, as: As, why: string }[]}
   */
  const couldNotCarry = []
  /** @param {unknown} id */
  const named = (id) => (typeof id === 'string' && id.trim() !== '' ? id.replace(/\s+/g, ' ').slice(0, 80) : '(no id)')
  /**
   * WHY A READ THAT ANSWERED WITH NO RECORD CARRIED NOTHING, said one way wherever it happens (problem 1tas7k2LG9Db).
   * @param {number} status
   */
  const noRecordIn = (status) => `the office answered HTTP ${String(status)} with no record in its reply`
  /** @param {any} record @param {As} as */
  const add = (record, as) => {
    if (!plain(record?.id)) couldNotCarry.push({ id: named(record?.id), as, why: 'its id is not a plain name, so no file can be named after it' })
    else if (!records.has(record.id)) records.set(record.id, { record, as })
  }
  // Decisions have their own allocation and are inserted first so a report naming one cannot hide its role.
  const mostDecisions = THE_MOST_DECISIONS_A_CHECK_CARRIES
  const decisions = Array.isArray(reads.decisions) ? reads.decisions : []
  for (const one of decisions.slice(0, mostDecisions)) add(one, 'decision')
  for (const one of decisions.slice(mostDecisions)) {
    couldNotCarry.push({ id: named(one?.id), as: 'decision', why: `more decisions were listed than the ${String(mostDecisions)} carried` })
  }
  /** A PROJECT'S ID AS A HEADER MAY CARRY IT, and nothing else is sent as one. @param {unknown} word */
  const aProject = (word) => typeof word === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(word)
  /**
   * ONE RECORD, READ IN WHICHEVER PROJECT HOLDS IT (problem ZTS6soSziHJ-). The check's own project is asked first. The
   * office answers a record filed in another project with a 404 whose `elsewhere` names that project, and then the read
   * is asked once more there, with the same key. What this check may read there is the office's to decide.
   * @param {string} id @param {boolean} quiet
   */
  const readWherever = async (id, quiet) => {
    const path = `/api/records/${encodeURIComponent(id)}`
    const heard = await askAndHear(path, undefined, { quiet })
    if (heard.status !== 404) return heard
    let project = null
    try {
      project = JSON.parse(heard.said)?.elsewhere?.workspaceId ?? null
    } catch {
      // A 404 THAT IS NOT JSON names no other project, and is answered as it came.
    }
    if (!aProject(project) || project === WORKSPACE) return heard
    return askAndHear(path, undefined, { quiet, workspace: project })
  }
  /** One record read whole, with this tool's key. A read that gives no record is kept, with why. @param {string} id @param {As} as */
  const readWhole = async (id, as) => {
    if (records.has(id)) return
    if (!plain(id)) {
      couldNotCarry.push({ id: named(id), as, why: 'its id is not a plain name, so it was not asked for' })
      return
    }
    const heard = await readWherever(id, false)
    if (!heard.ok) {
      couldNotCarry.push({ id, as, why: `the office refused the read (HTTP ${String(heard.status)})` })
      return
    }
    const record = JSON.parse(heard.said).record ?? null
    if (record === null || typeof record !== 'object') couldNotCarry.push({ id, as, why: noRecordIn(heard.status) })
    else add(record, as)
  }
  // THE REPORTS, newest first: the reading names them and holds none of their words, so each is read whole here.
  for (const one of (reads.reports ?? []).slice(0, THE_MOST_OF_ONE_SORT)) await readWhole(one.id, 'report')
  // THE RECORDS THOSE REPORTS NAME (problems D884ZlvZz3A7 and ZTS6soSziHJ-). A supervisor's round report names its workers'
  // reports by id, and those are linked to the plan and to the workers' own runs, not to the round, so the check read their
  // proofs only in the supervisor's summary (check 4LOAkBBuuRTv, 29 September 2026). A round's report names the decisions
  // and the earlier check it answers too, and those the check could not read at all (check 1m54plR7y05x, 30 September
  // 2026). Each word of the carried reports' title, summary and data that may be an id is asked for, quietly and in
  // whichever project holds it, at most THE_MOST_WORDS_ASKED of them. A report is carried as a named report, at most
  // THE_MOST_OF_ONE_SORT, and a record of any other kind as a named record, at most THE_MOST_NAMED_RECORDS. A word that
  // names no record is no id.
  const theirWords = []
  const decisionWords = new Set()
  for (const one of decisions.slice(0, mostDecisions)) {
    for (const word of theTextsIn([one?.authority_reference, one?.because, one?.replaces]).join('\n').match(A_WORD_THAT_MAY_BE_AN_ID) ?? []) {
      if (!mayBeAnId(word) || records.has(word)) continue
      decisionWords.add(word)
      if (!theirWords.includes(word)) theirWords.push(word)
    }
  }
  for (const { record, as } of [...records.values()]) {
    if (as !== 'report') continue
    for (const word of theTextsIn([record.title, record.summary, record.data]).join('\n').match(A_WORD_THAT_MAY_BE_AN_ID) ?? []) {
      if (mayBeAnId(word) && !records.has(word) && !theirWords.includes(word)) theirWords.push(word)
    }
  }
  // THE WORDS THE KEPT WHYS NAME (uQMufaAoVuVs): after the reports' words, in the list's order, first occurrence
  // wins, and into the same budgets below. A path the server dropped never gets here: its why is about another round.
  const theWhyWords = []
  const theWhysThatNamed = []
  for (const one of keptWhys) {
    const why = typeof one?.why === 'string' ? one.why : ''
    for (const word of why.match(A_WORD_THAT_MAY_BE_AN_ID) ?? []) {
      if (!mayBeAnId(word) || records.has(word) || theirWords.includes(word)) continue
      theirWords.push(word)
      theWhyWords.push(word)
      if (typeof one.path === 'string' && !theWhysThatNamed.includes(one.path)) theWhysThatNamed.push(one.path)
    }
  }
  const namedCounts = { reports: 0, others: 0, noRecord: 0, untried: Math.max(0, theirWords.length - THE_MOST_WORDS_ASKED) }
  for (const word of theirWords.slice(THE_MOST_WORDS_ASKED)) {
    if (decisionWords.has(word)) couldNotCarry.push({ id: word, as: 'named-record', why: `more references were named than the ${String(THE_MOST_WORDS_ASKED)} asked` })
  }
  for (const word of theirWords.slice(0, THE_MOST_WORDS_ASKED)) {
    const heard = await readWherever(word, true)
    // A READ THAT GAVE NOTHING SAYS NOTHING OF THE KIND, so it is named as a named record, the word that fits any kind.
    if (heard.status === 404 && decisionWords.has(word)) couldNotCarry.push({ id: word, as: 'named-record', why: 'the office did not find the named evidence' })
    else if (heard.status === 404) namedCounts.noRecord += 1
    else if (!heard.ok) couldNotCarry.push({ id: word, as: 'named-record', why: `the office refused the read (HTTP ${String(heard.status)})` })
    else {
      const record = JSON.parse(heard.said).record ?? null
      // A REPLY WITH NO RECORD IS A READ THAT GAVE NOTHING, named with why as readWhole names it (problem 1tas7k2LG9Db).
      if (record === null || typeof record !== 'object') couldNotCarry.push({ id: word, as: 'named-record', why: noRecordIn(heard.status) })
      else {
        /** @type {As} */
        const as = record.kind === 'report' ? 'named-report' : 'named-record'
        const sort = as === 'named-report' ? 'reports' : 'others'
        const most = as === 'named-report' ? THE_MOST_OF_ONE_SORT : THE_MOST_NAMED_RECORDS
        if (namedCounts[sort] >= most) {
          couldNotCarry.push({ id: word, as, why: `more ${as === 'named-report' ? 'reports' : 'records of other kinds'} are named than the ${String(most)} carried` })
        } else {
          add(record, as)
          namedCounts[sort] += 1
        }
      }
    }
  }
  // THE BRIEF'S RECORDS, which the reading holds whole. A brief that names no record is not a failed read.
  if (reads.brief?.startedFor != null) add(reads.brief.startedFor, 'started-for')
  for (const one of (reads.brief?.sessionTasks ?? []).slice(0, THE_MOST_OF_ONE_SORT)) add(one.record, 'session-task')
  // THE NEWEST MESSAGE: the reading lists what the agent wrote newest first, and only the messages this check may read.
  const last = (reads.wrote ?? []).find((/** @type {any} */ one) => one.kind === 'message')
  if (last !== undefined) await readWhole(last.id, 'last-message')
  // zZXY9HqyGuj2, USER.md invariant 2: carry in Map insertion order,
  // keeping the first occurrence of an id: newest reports, records those reports
  // name in textual order, then records the kept whys name in list order,
  // started-for, session tasks in reading order, newest message. Every record
  // beyond the shared ceiling is named for the model.
  const collected = [...records]
  for (const [id, { as }] of collected.slice(THE_MOST_RECORDS_A_CHECK_CARRIES)) {
    couldNotCarry.push({ id, as, why: `the door takes at most ${String(THE_MOST_RECORDS_A_CHECK_CARRIES)} records for one check` })
  }
  // Too many omitted names cannot be silently shortened either; stop before
  // writing files or asking the door to assemble a body it would refuse.
  if (couldNotCarry.length > THE_MOST_RECORDS_A_CHECK_CARRIES) {
    throw new Error(`The check had ${String(records.size)} records and ${String(couldNotCarry.length)} records it could not carry; the door takes at most ${String(THE_MOST_RECORDS_A_CHECK_CARRIES)} records in each list for one check.`)
  }
  rmSync(folder, { recursive: true, force: true })
  mkdirSync(folder, { recursive: true, mode: 0o700 })
  const written = []
  for (const [id, { record, as }] of collected.slice(0, THE_MOST_RECORDS_A_CHECK_CARRIES)) {
    const path = join(folder, `${id}.json`)
    writeFileSync(path, `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600 })
    written.push({ path, id, kind: String(record.kind ?? ''), title: String(record.title ?? ''), as })
  }
  const left = Math.max(0, (reads.reports ?? []).length - THE_MOST_OF_ONE_SORT)
  process.stdout.write(
    `Wrote ${String(written.length)} record${written.length === 1 ? '' : 's'} for the model to read, into ${folder}: ${written.map((one) => one.id).join(', ') || 'none'}.` +
      (left === 0 ? '' : ` The ${String(left)} older report${left === 1 ? '' : 's'} its agent filed ${left === 1 ? 'is' : 'are'} not written.`) +
      (theirWords.length === 0
        ? ''
        : ` Of ${String(theirWords.length)} word${theirWords.length === 1 ? '' : 's'} in the reports${decisionWords.size === 0 ? '' : ' and decisions'}${theWhyWords.length === 0 ? '' : ' and the kept whys'} that may be ids, ${String(written.filter((one) => one.as === 'named-report').length)} named a report that is carried, ${String(written.filter((one) => one.as === 'named-record').length)} named a record of another kind that is carried, and ${String(namedCounts.noRecord)} named no record${namedCounts.untried === 0 ? '' : `; ${String(namedCounts.untried)} past the first ${String(THE_MOST_WORDS_ASKED)} were not asked`}.` +
          (theWhyWords.length === 0 ? '' : ` The whys kept for ${theWhysThatNamed.join(', ')} added ${String(theWhyWords.length)} of them.`)) +
      (couldNotCarry.length === 0 ? '' : ` Not written, and named in the prompt: ${couldNotCarry.map((one) => `${one.id} (${one.why})`).join('; ')}.`) +
      '\n',
  )
  return { written, couldNotCarry }
}

/**
 * THE LINKS A RECORDS SEAL PINNED, written beside the records as the office's reading gave them, for the model to read
 * (round BM, item 2aq). The model has no key, so that reading is all it is given of them. A reading that does not say
 * which links the seal pinned is said in one line, and nothing is guessed. A seal with no records part pins no links,
 * and nothing is said of them.
 * @param {any} reads  what GET /api/checks/<run> answered
 * @param {string} folder  the records folder, already written
 * @returns {string | null}  the file written, or null because none was
 */
function writeThePinnedLinksForTheModel(reads, folder) {
  if (reads.submission?.seal?.records == null) return null
  const pinned = reads.pinnedLinks
  if (pinned?.links === null) {
    process.stdout.write('The tool wrote no file of links for the model, because this seal was made before seals pinned links.\n')
    return null
  }
  if (!Array.isArray(pinned?.links)) {
    process.stdout.write(`The office's reading of seal ${String(reads.submission.id)} does not say which links the seal pinned, so the tool wrote no file of links for the model.\n`)
    return null
  }
  const path = join(folder, 'links.pinned-by-the-seal.json')
  writeFileSync(path, `${JSON.stringify(pinned, null, 2)}\n`, { mode: 0o600 })
  const n = pinned.links.length
  process.stdout.write(
    n === 0
      ? `Wrote into ${path}, for the model to read, that the seal pinned no link.\n`
      : `Wrote the ${String(n)} link${n === 1 ? '' : 's'} the seal pinned into ${path}, for the model to read.\n`,
  )
  return path
}

/**
 * ON THE HOST THE RECORDS GO WITH THE WORKTREE: kept, with it, when no verdict was delivered, so a reader can see what the
 * failed check was given, and taken away otherwise. In the sandbox they are in the check's folder, which leaving the
 * sandbox keeps or takes away the same way.
 */
process.on('exit', () => {
  if (SANDBOX !== null || !existsSync(theRecordsFolder())) return
  if (!theVerdictIsDelivered && !theDryAssemblyCompleted) {
    process.stderr.write(`The records written for the model, in ${theRecordsFolder()}, are kept, because no verdict was delivered.\n`)
    return
  }
  rmSync(theRecordsFolder(), { recursive: true, force: true })
})

/** Both native harnesses retain their read-only permissions on this machine. */
function runClaudeOnTheHost(prompt, given) {
  return new Promise((done) => {
    // THE CALLER'S ENVIRONMENT LESS THE OFFICE'S VARIABLES AND EVERY KEY, as the sandbox gives it (problem YjMHEkMQkjAX),
    // and the effort the office named, as the flag gives it (wave 13v round 27). A check on Codex gets only the names its
    // list keeps (src/config/the-environment-a-codex-gets.mjs), as the last step.
    const whole = { ...theModelsEnvironmentOnTheHost(process.env), ...given.env }
    const env = aRuntimeIsCodex(RUNTIME) || aCommandsProgram(given.command).isCodex ? theEnvironmentACodexGets(whole) : whole
    const child = spawn(given.command[0], given.command.slice(1), { cwd: WHERE, env, stdio: ['pipe', 'pipe', 'pipe'] })
    child.stdin.on('error', (e) => {
      done({ ok: false, why: `The prompt could not be written to the ${RUNTIME} command: ${e.message}` })
    })
    child.stdin.end(prompt)
    let out = ''
    let err = ''
    /**
     * WHETHER THIS TOOL'S OWN CLOCK ENDED THE RUN. It is written down here, at the moment the
     * clock fires, because nothing on the way out says so otherwise: a child this tool kills
     * closes with `code === null` and `signal === 'SIGTERM'`, and a child a shell wrapper reports
     * closes with 143. Neither number says who sent the signal. Only this flag does, so only this
     * flag may say "stopped by this tool".
     */
    let stoppedByTheClock = false
    const timer = setTimeout(() => {
      stoppedByTheClock = true
      try {
        child.kill('SIGTERM')
      } catch {
        /* already gone */
      }
    }, RUN_LIMIT_MS)
    child.stdout.on('data', (d) => {
      out += String(d)
    })
    child.stderr.on('data', (d) => {
      err += String(d)
    })
    child.on('error', (e) => {
      clearTimeout(timer)
      done({ ok: false, why: `The ${RUNTIME} command could not be started: ${e.message}` })
    })
    child.on('close', (code, signal) => {
      clearTimeout(timer)
      // WHAT THE MODEL ANSWERED IS MASKED of each secret a check may be handed that its environment held, before any of it
      // is printed or filed (problem DNSRdZtWGTjS). On the host it was handed this tool's environment, so every such name.
      const handed = EVERY_SECRET_A_CHECK_IS_HANDED.filter((name) => typeof env[name] === 'string').map((name) => ({ name, value: env[name] }))
      const masked = {}
      out = withTheSecretsMasked(out, handed, masked)
      err = withTheSecretsMasked(err, handed, masked)
      theMaskSays('What the model answered', masked)
      if (stoppedByTheClock) {
        done({ ok: false, why: stoppedByTheClockSays(), ...theModelsAnswer(out) })
        return
      }
      if (code !== 0) {
        const how = code === null ? `ended on signal ${String(signal)}` : `exited ${String(code)}`
        done({
          ok: false,
          why: `${RUNTIME === 'claude-code' ? 'claude' : 'codex'} ${how}. ${whatAFailedModelSaid(err, out)}`,
          // Kept for the same reason as in the sandbox: a failed run may still have spent tokens. U3.
          ...theModelsAnswer(out),
        })
        return
      }
      const parsed = theModelsAnswer(out)
      done(parsed.envelope === undefined || parsed.envelope.is_error
        ? { ok: false, why: `${RUNTIME} did not return a successful native answer: ${parsed.envelope?.error ?? whatAFailedModelSaid(err, out)}`, ...parsed }
        : { ok: true, ...parsed })
    })
  })
}

/**
 * THE CHECK THE MODEL WROTE, or an honest answer saying there was not one.
 *
 * The same walk `tools/agent-worker.mjs` does, for the same reason: agents write a sentence before
 * the object often enough that demanding nothing but JSON would be a rule this tool breaks on its
 * own runs. What it looks for is different — a verdict rather than an answer.
 */
function checkFrom(envelope) {
  return theLastObjectIn(envelope, isAVerdict)
}

/** What makes an object a verdict, for checkFrom and for the fence below alike. */
const isAVerdict = (parsed) => (parsed.verdict === 'released' || parsed.verdict === 'refused') && typeof parsed.check === 'string' && parsed.check !== ''
const WHAT_A_VERDICT_HAS = 'a verdict has `verdict` "released" or "refused" and a `check` sentence that is not empty'

/**
 * THE TEXT OF THE LAST FENCED JSON OBJECT IN WHAT THE MODEL SAID, or null (wave 13v round 27): the last code fence of three
 * or more backticks whose info word is `json` or nothing and whose text, trimmed, starts with `{`. A fence left open runs
 * to the end of the answer, as Markdown reads it.
 */
function theLastFencedObjectIn(said) {
  const theObjectIn = (fence) => {
    const text = fence.lines.join('\n').trim()
    return (fence.info === 'json' || fence.info === '') && text.startsWith('{') ? text : null
  }
  let found = null
  let open = null
  for (const line of said.split(/\r?\n/)) {
    if (open === null) {
      const opening = /^ {0,3}(`{3,})[ \t]*([^`\s]*)[^`]*$/.exec(line)
      if (opening !== null) open = { marks: opening[1].length, info: opening[2].toLowerCase(), lines: [] }
      continue
    }
    const closing = /^ {0,3}(`{3,})[ \t]*$/.exec(line)
    if (closing !== null && closing[1].length >= open.marks) {
      found = theObjectIn(open) ?? found
      open = null
    } else open.lines.push(line)
  }
  return open === null ? found : (theObjectIn(open) ?? found)
}

/**
 * THE VERDICT IN AN ANSWER OF THE MODEL, and whether it was read from a code fence (wave 13v round 27). On 12 October 2026
 * check d_9QP5tIls6u ended with a refusal written as "Verification complete. Here is my final verdict." and a ```json
 * fence, this tool said the check did not end with a verdict, and wrote nothing. The walk checkFrom does comes first, as
 * before. When it finds nothing, the last fenced JSON object is read. `{ verdict, fenced }` when there is a verdict, with
 * `fenced` true when it is the fenced object; `{ verdict: null, fenced, why }` when there is none, with `fenced` true when
 * the answer has a fenced JSON object that could not be read as one. Nothing is filled in for the model.
 */
function theVerdictIn(envelope) {
  const said = typeof envelope?.result === 'string' ? envelope.result : ''
  const walked = checkFrom(envelope)
  const text = theLastFencedObjectIn(said)
  if (text === null) return walked === null ? { verdict: null, fenced: false, why: 'it holds no JSON object that is a verdict' } : { verdict: walked, fenced: false }
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch (error) {
    if (walked !== null) return { verdict: walked, fenced: false }
    return { verdict: null, fenced: true, why: `the last fenced JSON object in it is not JSON: ${error instanceof Error ? error.message : String(error)}` }
  }
  if (walked !== null) return { verdict: walked, fenced: JSON.stringify(walked) === JSON.stringify(parsed) }
  if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) && isAVerdict(parsed)) return { verdict: parsed, fenced: true }
  return { verdict: null, fenced: true, why: `the last fenced JSON object in it is JSON but not a verdict: ${WHAT_A_VERDICT_HAS}` }
}

const FROM_A_FENCE = "The check's answer is not bare JSON, so its verdict was read from the last fenced JSON object in it."

/**
 * THE LAST JSON OBJECT IN WHAT THE MODEL SAID THAT `accept` TAKES, or null. The walk checkFrom does, for any object:
 * the correction of a verdict's form (problem -WZ40nNgHnTR) is an object of a few keys, not a whole verdict.
 */
function theLastObjectIn(envelope, accept) {
  const said = typeof envelope?.result === 'string' ? envelope.result : ''
  const end = said.lastIndexOf('}')
  if (end === -1) return null
  const starts = []
  for (let at = said.lastIndexOf('{', end); at !== -1; at = said.lastIndexOf('{', at - 1)) {
    starts.push(at)
    if (at === 0) break
  }
  for (const at of starts) {
    let parsed = null
    try {
      parsed = JSON.parse(said.slice(at, end + 1))
    } catch {
      continue
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) continue
    if (!accept(parsed)) continue
    return parsed
  }
  return null
}

// ---------------------------------------------------------------- one, what the check reads

// The server resolves the target facts. A retry asks again before allocating anything.
const eligibility = await ask(`/api/checks/${chosen.run}/eligibility`)
if (eligibility.eligible !== true) {
  process.stderr.write(JSON.stringify(eligibility, null, 2) + '\n')
  process.exit(1)
}
const GIVEN = await whatTheOfficeGivesTheCheck()
const MODEL = chosen.model ?? GIVEN.model
const RUNTIME = GIVEN.runtime
// THE SELECTION THE CHECK STARTS FROM: the office's, unless --model named another model. A check with none goes by the
// compatibility list (src/config/launcher-model-compatibility.json), as before, and a model that list does not name is
// refused before anything starts. The list is never read for a model a selection names.
const SELECTION = GIVEN.selection !== null && MODEL === GIVEN.selection.model ? GIVEN.selection : null
/** The program a check whose row names a provider row is refused in the words of: only dsh and Codex take one. */
const A_PROVIDER_ROWS_CHECK = RUNTIME === 'codex' ? 'Codex check' : 'DSH check'
// A ROW THAT NAMES A PROVIDER ROW STARTS ONLY ON ITS OWN SELECTION. Under another model --model named, the check would run
// on the template's key, a silent change of key, so it is refused here with nothing started.
if (GIVEN.provider !== null && SELECTION === null) {
  process.stderr.write(`${A_PROVIDER_ROWS_CHECK} refused: Casting row ${String(GIVEN.provider.row)} names provider ${GIVEN.provider.id}, and --model ${MODEL} is not the row's model ${GIVEN.selection.model}. Run the check without --model, or change the row. Nothing was started and no verdict was written.\n`)
  process.exit(1)
}
/** The model the native program is given: the selection's native route, provider/model where it names a provider, or MODEL. */
const NATIVE_ROUTE = SELECTION === null ? MODEL
  : SELECTION.native.provider === null ? SELECTION.native.model : `${SELECTION.native.provider}/${SELECTION.native.model}`
const EFFORT = theEffortOfTheCheck(GIVEN, MODEL)
// A DSH CHECK'S ROUTE AND EFFORT ARE THE SELECTION'S NATIVE ONES, and without a selection theDshSelection's
// (tools/sandbox-common.mjs), worked out before any view, worktree or verdict. A selection DSH cannot carry, such as one
// with no provider, and a model or an effort theDshSelection has no explicit mapping for, end the tool here, in their
// words, with nothing started.
const DSH = RUNTIME === 'dsh' ? (() => {
  try {
    if (SELECTION === null) return theDshSelection(MODEL, EFFORT.effort)
    const { native } = applyLauncherSelection([], { runtime: RUNTIME, model: MODEL, selection: SELECTION, aCheckCarriesTheProvider: GIVEN.provider !== null }).start
    return { provider: native.provider, model: native.model, ...(native.effort === null ? {} : { reasoningEffort: native.effort }) }
  } catch (why) {
    process.stderr.write(`${why instanceof Error ? why.message : String(why)}\n`)
    process.exit(1)
  }
})() : null

/**
 * THE ONE KEY A DSH OR CODEX CHECK WHOSE ROW NAMES A PROVIDER ROW IS HANDED, read once, here on the host, from the
 * office's key file: keys.json beside the database this tool was started with (theOfficesEnvironment, then keysPathFrom
 * in src/config/settings.mjs and providerKeyFromTheKeyFileAt in src/config/provider-keys.mjs, which opens that one file).
 * It is never printed and never in a record: runInside hands it to the model's view alone, with the provider's base
 * address, under the variable dsh's native provider reads or under THE_CODEX_PROVIDER_VARIABLES for Codex (`program`
 * says which), and the masking learns it. Null for any other check and for a
 * --dry assembly, which starts no model. A key that cannot be read ends the tool here, with nothing started.
 */
const PROVIDER_KEY = GIVEN.provider === null || !IN_A_SANDBOX ? null : (() => {
  const refused = (why) => {
    process.stderr.write(`${A_PROVIDER_ROWS_CHECK} refused: Casting row ${String(GIVEN.provider.row)} names provider ${GIVEN.provider.id}, and its key could not be read from the office's key file: ${why}. Nothing was started and no verdict was written.\n`)
    process.exit(1)
  }
  let path
  try {
    path = keysPathFrom(theOfficesEnvironment())
  } catch (why) {
    return refused(`where the file is could not be worked out (${why instanceof Error ? why.message : String(why)})`)
  }
  const read = providerKeyFromTheKeyFileAt(path, GIVEN.provider.keyName)
  if (read.value === null) return refused(read.why ?? `its entry ${GIVEN.provider.keyName} is not set`)
  return { row: GIVEN.provider.row, provider: GIVEN.provider.id, keyName: GIVEN.provider.keyName, baseAddress: GIVEN.provider.baseAddress,
    program: RUNTIME, native: RUNTIME === 'dsh' ? DSH.provider : null, value: read.value }
})()

const reads = await ask(`/api/checks/${chosen.run}`)
if (reads.submission?.seal.git && realpathSync(THE_WORKERS_CHECKOUT) !== realpathSync(reads.submission.seal.git.directory)) throw new Error('The checkout differs from the sealed repository directory.')
const area = reads.workArea ?? null
process.stdout.write(
  [
    `Run ${chosen.run}: ${reads.title}`,
    `  the agent it serves   ${reads.agent?.handle ?? 'nobody recorded one'}`,
    `  where it stands       ${reads.stands?.says ?? ''}`,
    `  its work area         ${area === null ? 'nobody recorded one' : area.length === 0 ? 'somebody said there is none' : area.join(', ')}`,
    ...(reads.submission?.seal.kind === 'files'
      ? [`  its files area        ${(reads.filesArea ?? []).length === 0 ? 'none, so every file of this files run is outside it' : reads.filesArea.map((folder) => folder.resolved).join(', ')}`]
      : []),
    `  chapters              ${reads.chaptersSays ?? (reads.chapters?.mustRead ?? []).map((one) => `${one.chapter} at ${one.level}`).join(', ')}`,
  ].join('\n') + '\n',
)

// A FILES AREA WITH A FOLDER THAT MOVED SINCE IT WAS REGISTERED STOPS THE CHECK BEFORE ANYTHING IS STARTED
// (acceptance finding 52): the office refuses the assembly anyway, and the new location is never followed.
if (reads.submission?.seal.kind === 'files') {
  const [moved] = theFoldersThatMoved(reads.filesArea ?? [])
  if (moved !== undefined) {
    process.stderr.write(
      `The files area ${moved.written} resolved to ${moved.resolved} when it was registered and resolves to ${moved.now ?? 'nothing'} now, ` +
        'so no file of this files run can be read as inside it until somebody registers it again. Nothing was assembled and nothing was written.\n',
    )
    process.exit(1)
  }
}

// ---------------------------------------------------------------- two and three, the prompt

// THE SANDBOX FIRST, because the worktree is cut inside it. A decision says the
// code under check and the model run there, and a check that cannot have it fails and says why.
if (IN_A_SANDBOX) {
  await theCheckIsFiledAsASession()
  try {
    SANDBOX = await aSandboxForThisCheck({
      handle: chosen.as,
      check: CHECK_ID,
      run: chosen.run,
      checkout: THE_WORKERS_CHECKOUT,
      api: API,
      workspace: WORKSPACE,
      sandboxes: chosen.sandboxes,
      from: chosen.sandboxFrom,
      say: (line) => process.stdout.write(`${line}\n`),
      // THE OFFICE'S OWN KEY FOR THE SANDBOX'S LEDGER CALLS, as its verdict writes send it (problem D2xgnX8nFixv): since the
      // owner closed the key window the office refuses a write with no key. A function, read per call, so the key is never
      // a value anything could print or write down.
      officeKey: () => theOfficeKeyHeader()[KEY_HEADER] ?? null,
    })
  } catch (why) {
    process.stderr.write(
      'This check runs its model in the inspector\'s sandbox, and it could not have one, so nothing was ' +
        `assembled and nothing was written:\n${why instanceof Error ? why.message : String(why)}\n` +
        'A check does not move to the host by itself. --on-the-host runs it there when somebody chooses that.\n',
    )
    process.exit(1)
  }
  // A CHECK ASKED AGAIN WITH ITS ID finds the state an earlier start left, and that start's model may have written in the view.
  if (existsSync(theModelStateFile())) THE_MODELS_OUTPUT_IS = 'not read'
}

// CRITERION C30, AND IT HAPPENS BEFORE ANYTHING IS READ. The check cuts itself a worktree at the
// run's tip and reads that, so it never contends with the worker for the tree it is checking. A files
// seal has no tip, so its check makes a verified copy of its own instead.
const A_FILES_SEAL = reads.submission?.seal.kind === 'files'
if (A_FILES_SEAL) {
  await aStagedCopyOfItsOwn()
  NEEDS_JUDGMENT = whatTheFilesCheckerHandsOn(NEEDS_JUDGMENT)
} else if (reads.submission?.seal.kind !== 'records') await aWorktreeOfItsOwn()
else if (SANDBOX !== null) {
  const at = whereTheCheckIsCut(SANDBOX)
  if (!existsSync(at)) {
    mkdirSync(at, { recursive: true })
    guardedGit(at, ['init', '-q'])
  }
}

/**
 * THE DRY SWEEP OF THE INSTANCE'S CHECK VIEWS (tools/inspector-view-sweep.mjs), begun once the view ran its first command
 * and never waited for. It removes and moves nothing, and writes one line per view in the instance's view-sweep.log. It is
 * stopped once the verdict's lines are written, so it never keeps this process up; a failure is one line in that log.
 */
let theViewSweep = null

// THE CHECK VIEW IS TRIED ONCE BEFORE THE MODEL STARTS, because a check is refused at the start and never at the end. When
// the view fails for one command it fails for every command, the model's too, and the model's run is then spent and thrown
// away. whyTheCheckViewFails (tools/inspector-sandbox.mjs) runs an empty command in it first.
if (SANDBOX !== null) {
  const why = await whyTheCheckViewFails(SANDBOX, MADE_A_WORKTREE ?? whereTheCheckIsCut(SANDBOX))
  if (why !== null) {
    process.stderr.write(
      `The check view of the sandbox ${SANDBOX.instance} could not run an empty command: ${why}\n` +
        "Every command of this check runs through that view, the model's too, so the model's run would have been spent " +
        'and then thrown away. tools/sandbox.mjs writes the receipt and the evidence of each command, so that is where to look. ' +
        'No model ran. Nothing was assembled and nothing was written.\n',
    )
    process.exit(1)
  }
  theViewSweep = theViewSweepBegins({
    instanceDir: SANDBOX.folder, sandboxes: dirname(SANDBOX.folder), instance: SANDBOX.instance, workspace: WORKSPACE, ownCheck: CHECK_ID,
    ask: askTheOfficeQuietly({ api: API, headers: () => ({ ...HEADERS, ...theOfficeKeyHeader() }) }),
  })
}

const base = reads.submission?.seal.git
  ? { ref: reads.submission.seal.git.forkBase, how: 'fork point', says: 'The fixed fork base recorded in seal ' + reads.submission.id + '.' }
  : reads.submission?.seal.kind === 'records' || A_FILES_SEAL ? null : theBase(chosen.against, reads.checkout?.cutFrom ?? null)
if (base && chosen.against === null && reads.checkout?.says) base.says += ' ' + reads.checkout.says
const TIP_READ = base === null ? '' : theCommitTheTreeIsAt()
const changes = A_FILES_SEAL ? changesInAFilesSeal() : base === null ? [] : changesIn(area, base.ref, TIP_READ)
/** One path's change as the check read it: a staged file against what is landed there, or a git diff. */
const theChangeAt = (path) => {
  if (A_FILES_SEAL) {
    const file = reads.submission.seal.files.files.find((one) => one.path === path)
    return file === undefined ? '' : oneStagedFileAsAChange(file)
  }
  return base === null ? '' : oneDiff(base.ref, TIP_READ, path)
}
// THE SCOPE AND THE LIST GO TO THE SERVER, which checks every path against the changes and writes
// them into the prompt. Each listed path's diff is read here, because nothing in the server reads a
// working tree; a records submission has none, and the server refuses a list for one.
const judging = {
  ...(chosen.only === null ? {} : { only: chosen.only }),
  ...(NEEDS_JUDGMENT === null
    ? {}
    : { needsJudgment: NEEDS_JUDGMENT.map((one) => ({ ...one, changes: theChangeAt(one.path) })) }),
}

// A STANDARD CHANGE IS ASKED FOR HERE, after the worktree is cut at the sealed tip and before any model runs
// (tools/standard-change.mjs). Only a whole check of a git seal that declares a kind asks. A dry assembly releases nothing,
// and a scoped check or one handed paths to judge is the inspector's. A release ends the check with no model. Any other
// answer sends it the ordinary way, and why is said in what the verdict read.
const THE_DECLARED_KIND = reads.submission?.seal.kind === 'git' ? reads.submission.seal.standard : undefined
if (THE_DECLARED_KIND !== undefined && !chosen.dry && reads.readingOnly !== true) {
  if (chosen.only !== null || NEEDS_JUDGMENT !== null) {
    notAStandardRelease =
      ` The seal declares a standard change of the kind ${String(THE_DECLARED_KIND)}, and this check ` +
      `${chosen.only === null ? 'was handed paths to judge' : 'was scoped'}, so it went the ordinary way.`
  } else {
    // A STANDARD RELEASE THAT COULD NOT BE ASKED FOR IS NOT ONE, and the inspector reads the change. The why says so.
    const asked = await askForAStandardRelease({
      run: chosen.run,
      kind: THE_DECLARED_KIND,
      base: base.ref,
      tip: TIP_READ,
      read: whichTreeWasRead(NO_MODEL_RAN),
      git: (args) => guardedGitBytes(WHERE, args).toString('utf8'),
      runACheck: aStandardCheckRuns,
      // The release carries what its run of tools/run-named-tests.mjs said of its seat, as a verdict does.
      office: (method, path, body) => askAndHear(path, method === 'POST' ? { ...body, read: withWhatTheSeatsSaid(body.read) } : body, { method, quiet: true }),
      say: (line) => process.stdout.write(`${line}\n`),
    }).catch((why) => ({
      released: false,
      why: `The check tool could not ask for a standard release, so the check goes the ordinary way: ${why instanceof Error ? why.message : String(why)}`,
    }))
    if (asked.released) {
      theVerdictIsDelivered = true
      theWorktreeIsPutBack()
      process.stdout.write(`\nRun ${chosen.run} is released as a standard change of the kind ${THE_DECLARED_KIND}, and no model ran. ${asked.why}\n`)
      process.exit()
    }
    process.stdout.write(`${asked.why}\n`)
    notAStandardRelease = ` ${asked.why}`
  }
}

// ONLY THE WHYS THE SERVER KEEPS (uQMufaAoVuVs): a path the server drops is not in the sealed change, so its why
// is about some other round, and the records it names would spend the reads on records that are not about this run. The
// server's own filter answers through the existing prompt door, which is a read and writes nothing; the tool does not
// repeat whatNeedsJudgment, and the door's used list is the one truth about which paths this check keeps. A reply
// without that list for a list that was asked stops the check, and the tool does not read the whys it asked for. No
// list at all needs no call.
let keptWhys = []
if (NEEDS_JUDGMENT !== null && NEEDS_JUDGMENT.length > 0) {
  const filtered = await ask(`/api/checks/${chosen.run}/prompt`, { changes, base, ...judging })
  const used = filtered?.needsJudgment?.used
  const asked = new Set(NEEDS_JUDGMENT.map((one) => one.path))
  if (!Array.isArray(used) || used.some((one) => typeof one !== 'string' || !asked.has(one))) {
    process.stderr.write(
      'The prompt door did not say which paths of the needs-judgment list this check keeps, so nothing says which ' +
        'whys are about this run; the tool stops rather than read the whys it asked for. No carried record was ' +
        'written, no assembly was stored and no model ran.\n',
    )
    process.exit(1)
  }
  const kept = new Set(used)
  keptWhys = NEEDS_JUDGMENT.filter((one) => kept.has(one.path))
}

// THE RECORDS THE MODEL READS, written as files before the prompt is assembled, with this tool's key, because the model
// has none (problem YxzFRQIpx9Pz), and those it could not write, with why. The office names both in the prompt, so the size
// it keeps is the size the model is given. The kept whys are read for record ids too (uQMufaAoVuVs).
let carries, couldNotCarry
/** @type {{ pinnedLinksFile?: string }} */
let theLinksFile = {}
try {
  const theRecords = await writeTheRecordsForTheModel(reads, theRecordsFolder(), keptWhys)
  carries = SANDBOX === null ? theRecords.written : theRecords.written.map(record => ({ ...record, path: '/inputs/records/' + relative(theRecordsFolder(), record.path) }))
  couldNotCarry = theRecords.couldNotCarry
  // THE LINKS THE SEAL PINNED, beside the records and named to both doors by the path the model opens (round BM, item 2aq).
  const links = writeThePinnedLinksForTheModel(reads, theRecordsFolder())
  if (links !== null) theLinksFile = { pinnedLinksFile: SANDBOX === null ? links : '/inputs/records/' + relative(theRecordsFolder(), links) }
} catch (why) {
  process.stderr.write(`The records for the model could not be written into ${theRecordsFolder()}: ${why instanceof Error ? why.message : String(why)}\nNo assembly was stored and no model was started.\n`)
  process.exit(1)
}

const assembled = await ask(`/api/checks/${chosen.run}/prompt`, { changes, base, ...judging, carries, couldNotCarry, ...theLinksFile })
// A PATH THE CHANGE DOES NOT TOUCH IS DROPPED FROM THE LIST BY THE SERVER (wave 13j), and the verdict says it read the
// list as used. `judging` still carries the list as asked, so the assembly kept on the run holds both.
if (NEEDS_JUDGMENT !== null && (assembled.needsJudgment?.dropped ?? []).length > 0) {
  const used = new Set(assembled.needsJudgment.used)
  NEEDS_JUDGMENT = NEEDS_JUDGMENT.filter((one) => used.has(one.path))
  process.stdout.write(`dropped from the needs-judgment list, not in the sealed change: ${assembled.needsJudgment.dropped.join(', ')}\n`)
}
process.stdout.write(
  [
    '',
    `The prompt is ${String(assembled.bytes)} bytes.`,
    `The whole of the office regulations at full would have been ${String(assembled.wholeCodeBytes)} bytes.`,
    `Chapters written out: ${(assembled.chaptersAt ?? []).map((one) => `${one.chapter} at ${one.level} (${one.bytes} bytes)`).join(', ') || 'none'}`,
    `Changed files: ${String((assembled.changes?.inside ?? []).length)} inside the work area, ${String((assembled.changes?.outside ?? []).length)} outside it.`,
    `  ${assembled.changes?.says ?? 'The server did not say how it sorted them.'}`,
    // WHICH WAY THE PLUGIN RULE WENT, on every check. A files seal is not sorted by it.
    `The plugin rule: ${
      A_FILES_SEAL
        ? "not applied, because this check reads a files seal, whose files land in a files area and never in a repository's plugins folder. Every staged file is read as the files area says."
        : (assembled.changes?.plugin?.says ?? 'the server did not say which way it went.')
    }`,
    ...(NEEDS_JUDGMENT === null
      ? []
      : [`${THE_PATHS_HANDED_ON_FOR_JUDGMENT} ${NEEDS_JUDGMENT.length === 0 ? 'none' : NEEDS_JUDGMENT.map((one) => one.path).join(', ')}.`]),
    ...(A_FILES_SEAL
      ? [
          `There is no base: the check reads a copy of the staged files of seal ${reads.submission.id}, each an ` +
            'addition, or a replacement of the file landed at its path.',
        ]
      : [
          `The base is ${base?.ref ?? 'record manifest'}, found as the ${base?.how ?? 'sealed revisions'}.`,
          `  ${base?.says ?? 'The check reads record revisions from the seal.'}`,
        ]),
  ].join('\n') + '\n',
)

// WHAT THIS ASSEMBLY MEASURED GOES ON THE RUN, so it is readable in Mole Office and not only here.
//
// A person is never asked to run a command in a terminal; every act is available inside Mole Office. The
// five figures below — the size, the chapters, the files inside and outside, and the base — are the
// answer to *what will this check actually read*, and until now they existed only in whatever
// terminal the tool was printed to. The server cannot work two of them out for itself, because
// nothing under src/ reads a working tree, so the process that can is the one that says.
//
// IT IS A SEPARATE DOOR AND NOT THE PROMPT ROUTE. `check.prompt` is declared a read and stays one;
// a write hidden inside a read is a write nobody knows about.
const kept = await ask(`/api/checks/${chosen.run}/assembled`, { changes, base, ...judging, carries, couldNotCarry, ...theLinksFile, read: whichTreeWasRead(), execution: { model: MODEL, minutes: MINUTES } })
process.stdout.write(`Kept on the run, so it can be read in Mole Office: ${kept.whatTheCheckWouldRead?.at ?? 'nothing was kept'}\n`)
process.stdout.write(`The check is set to ${MODEL}${EFFORT.at}, with ${String(MINUTES)} minutes to finish.${EFFORT.after}\n`)

if (chosen.dry) {
  theDryAssemblyCompleted = true
  process.stdout.write('\n--dry was given, so no model ran and no verdict was written.\n')
  theWorktreeIsPutBack()
  process.exit(process.exitCode ?? 0)
}

// ---------------------------------------------------------------- four, the run and the act

process.stdout.write(`\nRunning the check through ${MODEL}${EFFORT.at}, with ${String(RUN_LIMIT_MS / 60000)} minutes to finish.${EFFORT.after}\n`)
/** Held from before the model ran, because the worktree is put back on the way out. */
const theTreeThatWasRead = whichTreeWasRead()
const before = await howTheCheckoutStands()
/** Whether the worker's moving on was said already: this is asked after every run of the model, the correction included. */
let theWorkerMovedOnIsSaid = false
// THE WINDOW THE MODEL RUNS IN. The door is asked for it whether a verdict is delivered or not, so a
// model that wrote into the office and then failed is not silent about it.
const theModelWindowFrom = nowStamp()
const theDecisionListWasNotSupplied = !Array.isArray(reads.decisions)
const ran = await runClaude(assembled.prompt + (theDecisionListWasNotSupplied
  ? "\n\nThe office did not list the run's decisions, so whether the run recorded any is unknown. Do not say that none were recorded or that all hold."
  : ''))
const theModelWindowTo = nowStamp()
// WHAT THE MODEL SPENT GOES ON THE RUN, and it goes before either way out below, because the tokens
// were spent whether or not the check is kept. On 25 September 2026, 22 checks lost their receipt
// to the checkout-moved exit, and a run that ended on `error_max_turns` lost it to the next one.
/** What every run of the model spent, summed for the receipt: the check, and each question asked back after it. */
let spent = ran.nativeOutput
await theUsageIsKept(spent)
let wroteIntoTheOffice = await whatTheRunWrote(theModelWindowFrom, theModelWindowTo)
await theCheckStopsIfTheInspectorBuilt()
/** Criterion C22, asked after every run of the model, the correction of a verdict's form and the question about its trace included. */
async function theCheckStopsIfTheInspectorBuilt() {
  const now = await howTheCheckoutStands()
  const meanwhile = whatTheWorkerDidMeanwhile(before, now)
  if (meanwhile !== null && !theWorkerMovedOnIsSaid) {
    process.stdout.write(`${meanwhile}\n`)
    theWorkerMovedOnIsSaid = true
  }
  const built = whatTheInspectorBuilt(before, now)
  if (built === null) return
  process.stderr.write(
    'This check is not posted, because the inspector changed the work it was checking while it ran: ' +
      `${built}.\n` +
      'Criterion C22: an inspector that fixes what it found is no longer checking it, and its card says it ' +
      'builds nothing and starts nobody. Where it finds a break it files a problem and links it to the ' +
      'chapter; it does not mend it. Put the checkout back to where it was and run the check again, with a ' +
      'runtime that cannot write.\n',
  )
  process.exit(1)
}
if (!ran.ok) {
  THE_MODELS_FAILURE = ran.why
  process.stderr.write(`The check did not finish, so no verdict was written: ${ran.why}\n`)
  process.exit(1)
}
const { answered: theAnswerTheCheckGave, howItWasRead } = await theVerdictTheCheckGave()
// ONLY THE FOUR KINDS REFUSE A RUN. The model is asked for a kind on every refused item. An item that
// names no kind, or names a fault of form, is listed instead: after the landing for a record, in the
// line's next round for code and proof. When no real fault is left the verdict is a release, and the
// list is written into the check sentence the door takes. The rules of 9 November 2026;
// the kinds are declared once in src/config/verdict-kinds.mjs.
const { answer: answered, listed: theListedFaults, unread: theUnreadParts } = onlyTheRealFaults(theAnswerTheCheckGave)
if (theListedFaults.nextRound.length + theListedFaults.afterLanding.length > 0) {
  process.stdout.write(
    `The verdict names a fault that is not one of the four kinds a check refuses for (${theListedFaults.nextRound.length} to fix in the line's next round, ` +
      `${theListedFaults.afterLanding.length} to patch after the landing), so the tool listed ` +
      `${theListedFaults.nextRound.length + theListedFaults.afterLanding.length === 1 ? 'it' : 'them'} instead of refusing on ` +
      `${theListedFaults.nextRound.length + theListedFaults.afterLanding.length === 1 ? 'it' : 'them'}.\n`,
  )
}
if (theUnreadParts.length > 0) process.stdout.write(`${theUnreadPartsSay(theUnreadParts)}\n`)

/**
 * THE CHECK'S VERDICT, AND HOW IT WAS READ when that was not as bare JSON (wave 13v round 27). An answer whose last fenced
 * JSON object cannot be read as a verdict is asked back once, in the check's own session, to write the same verdict as
 * one JSON object, as a release with untraced paths is (theMissingTracesAreAskedForOnce). The model writes the verdict
 * again itself; this tool writes no part of it. An answer with no verdict and no such fence is asked back once the same
 * way, for the verdict it reached (wave 13j round 14): such a check ended its work, and running it
 * again from the start spends the whole check a second time. It is asked to make no new judgement, and to say so when it
 * reached none. No verdict is written then. A completed second answer with none has its own exit
 * code, so the message worker can report that ending without treating another failure as one.
 */
async function theVerdictTheCheckGave() {
  const first = theVerdictIn(ran.envelope)
  const whole = anAnswerToPrint('What it said', String(ran.envelope.result ?? ''), ', whole')
  if (first.verdict !== null) {
    if (first.fenced) process.stdout.write(`${FROM_A_FENCE}\n`)
    return { answered: first.verdict, howItWasRead: first.fenced ? FROM_A_FENCE : null }
  }
  const unread = first.fenced ? `The check's answer is not bare JSON, and ${first.why}` : `The check did not end with a verdict: ${first.why}`
  const session = typeof ran.envelope?.session_id === 'string' && ran.envelope.session_id !== '' ? ran.envelope.session_id : null
  if (session === null) {
    process.stderr.write(`${unread}. The answer names no session of its own, and a verdict from any other session would not be its judgement, so no verdict was written. ${whole}`)
    process.exit(1)
  }
  const question = first.fenced
    ? [
        'Your check is finished. Its answer ended with a fenced JSON object that could not be read as a verdict, and this asks you once, in this same session, to write it again.',
        `Why it could not be read: ${first.why}.`,
        'Answer with the same verdict as one JSON object and nothing else: no words before or after it, and no code fence. ' +
          'Change its form, not your judgement: keep the verdict, the check sentence and everything else you wrote. ' +
          'Run no command, change no file and write nothing into the office.',
      ].join('\n\n')
    : [
        'Your check is finished. Its answer ended with no verdict this tool could read, and this asks you once, in this same session, to write the verdict you reached.',
        `Why none could be read: ${first.why}.`,
        'Answer with the verdict you reached in this check as one JSON object and nothing else: no words before or after it, and no code fence. ' +
          'Write the judgement you already made; do not make a new one now. If you reached no verdict, say so in one sentence and write no JSON object. ' +
          'Run no command, change no file and write nothing into the office.',
      ].join('\n\n')
  const what = first.fenced ? 'its verdict again' : 'the verdict it reached'
  process.stdout.write(`${unread}. Asking the check's own session ${session} once to write ${what} as one JSON object.\n`)
  const again = await runClaude(question, { resume: session })
  spent = bothRuns(spent, again.nativeOutput)
  await theUsageIsKept(spent)
  wroteIntoTheOffice = await whatTheRunWrote(theModelWindowFrom, nowStamp())
  await theCheckStopsIfTheInspectorBuilt()
  if (!again.ok) {
    process.stderr.write(`The question asked again in the check's own session did not finish, so no verdict was written: ${again.why}\n`)
    process.exit(1)
  }
  const second = theVerdictIn(again.envelope)
  const asked = `${unread}, so the model was asked once, in the check's own session, to write ${what} as one JSON object`
  if (second.verdict === null) {
    process.stderr.write(
      `${asked}, and its second answer gave none either (${second.why}), so no verdict was written. ${whole}` +
        anAnswerToPrint('What it said when asked', String(again.envelope?.result ?? '')),
    )
    process.stderr.write('The message worker can report this ending to the office, which allows at most one new whole check.\n')
    process.exit(CHECK_ENDED_WITH_NO_VERDICT)
  }
  const said = `${asked}, and did${second.fenced ? ', in a fenced JSON object, which was read' : ''}.`
  process.stdout.write(`${said}\n`)
  return { answered: second.verdict, howItWasRead: said }
}

// THE VERDICT IS WRITTEN HERE BEFORE IT IS POSTED, so a refused delivery does not lose the model's
// answer. On 13 September 2026 a check's verdict went to a worker that had been retired while the
// check ran, the door refused it, and the forty minutes were gone with nothing to read (problem
// bVge3jfi1_gr). This line is the tool's own log; the post below is still the one act that writes.
process.stdout.write('\nThe verdict, kept here before it is posted:\n' + JSON.stringify(answered, null, 2) + '\n')

// ONLY THE KEYS THE DOOR ACCEPTS. Problem jdHgAVP5N0f_: the model put a key inside `says` that the
// door's strict shape does not know, the door refused the whole verdict with 400, and the run stayed
// inspecting with its forty minutes spent. The door's accepted keys are declared once, in
// src/config/verdict-keys.mjs, and this trims the model's answer against that declaration. What is
// left out is named here and folded into the check sentence the door does accept, so nothing the
// inspector meant to say is lost silently.
// As item 6, step 3 of a decision says, with oj9CRzzB2_8m and chapter 7 rule 5:
// `traced` travels from the model through the declared verdict keys, just as `judged` does, without the tool
// inventing a line.
const { body: theVerdictBody, dropped, reshaped } = onlyTheKeysTheDoorAccepts(answered)
// THE LISTED FAULTS ARE POSTED AS THEIR OWN KEY AS WELL AS FOLDED INTO THE CHECK. onlyTheRealFaults read the
// model's `listed` items and returned the two normalised lists; the check sentence keeps their words for the
// worker, and `listed` lets the door store them on the release and file the line's task from them. It is the
// tool's own key, so the model's raw `listed` is taken out of the body whatever it holds; an empty list the
// model wrote used to stay in, because the door names the key, and the door then refused the whole verdict.
// The tool's own object goes in only when it holds an item.
delete theVerdictBody['listed']
if (theListedFaults.nextRound.length + theListedFaults.afterLanding.length > 0) {
  theVerdictBody['listed'] = theListedFaults
}
// HOW THE VERDICT WAS READ GOES INTO THE CHECK SENTENCE when it was not bare JSON (wave 13v round 27), so a reader of the
// verdict sees it as well as the log.
if (howItWasRead !== null && typeof theVerdictBody['check'] === 'string') theVerdictBody['check'] = `${theVerdictBody['check']}\n\n${howItWasRead}`
if (dropped.length > 0) {
  process.stdout.write(
    `The verdict door does not accept ${dropped.map((one) => one.key).join(', ')}, so the tool left ` +
      `${dropped.length === 1 ? 'it' : 'them'} out and folded what was left out into the check sentence.\n`,
  )
}
for (const said of reshaped) process.stdout.write(`${said}\n`)

// A decision judgment is the check's own, so ask its session once for every carried id it omitted. A check of handed-back
// packages is asked to judge no decision, since its prompt leaves them out, so it is not asked again for one either.
{
  const ids = aCheckOfHandedBackPackages(assembled.packages) ? [] : carries.filter((one) => one.as === 'decision').map((one) => one.id)
  const present = new Set((Array.isArray(theVerdictBody['decisions']) ? theVerdictBody['decisions'] : []).map((one) => one?.id))
  const missing = ids.filter((id) => !present.has(id))
  if (missing.length > 0) {
    const session = typeof ran.envelope?.session_id === 'string' && ran.envelope.session_id !== '' ? ran.envelope.session_id : null
    if (session === null) {
      process.stderr.write(`The verdict omitted decision judgments for ${missing.join(', ')} and named no check session to ask. No verdict was posted.\n`)
      process.exit(1)
    }
    const question = `Your check omitted judgments for these decisions: ${missing.join(', ')}. Give one JSON object with only decisions, an array with one line per id. Each line has id, holds, restsOn, authorityFits and authorityWhy. Give your own judgment from this check; change no file and write nothing to the office.`
    const added = await runClaude(question, { resume: session })
    spent = bothRuns(spent, added.nativeOutput)
    await theUsageIsKept(spent)
    wroteIntoTheOffice = await whatTheRunWrote(theModelWindowFrom, nowStamp())
    await theCheckStopsIfTheInspectorBuilt()
    const answer = added.ok ? theLastObjectIn(added.envelope, (one) => Array.isArray(one.decisions)) : null
    const lines = Array.isArray(answer?.decisions) ? answer.decisions.filter((one) => missing.includes(one?.id)) : []
    const obtained = new Set(lines.map((one) => one.id))
    if (missing.some((id) => !obtained.has(id))) {
      process.stderr.write(`The check was asked once for its missing decision judgments and did not supply each one. No verdict was posted.\n`)
      process.exit(1)
    }
    theVerdictBody['decisions'] = [...(Array.isArray(theVerdictBody['decisions']) ? theVerdictBody['decisions'] : []), ...lines]
  }
}

// AN INSIDE PACKAGE'S JUDGEMENT IS THE CHECK'S OWN TOO, so ask its session once for every package the run handed back, or
// point of one, that the verdict left out. The door refuses a verdict that leaves one out, and judges nothing itself. The
// packages are the ones the prompt door listed for the model.
{
  const handedBack = Array.isArray(assembled.packages?.packages) ? assembled.packages.packages : []
  const given = Array.isArray(theVerdictBody['packages']) ? theVerdictBody['packages'] : []
  const missing = handedBack.flatMap((pkg) => {
    const entry = given.find((one) => one?.task === pkg.task)
    const judged = new Set((Array.isArray(entry?.points) ? entry.points : []).map((one) => one?.pointId))
    const left = pkg.points.map((one) => one.pointId).filter((id) => !judged.has(id))
    return left.length === 0 ? [] : [{ task: pkg.task, points: left }]
  })
  if (missing.length > 0) {
    const session = typeof ran.envelope?.session_id === 'string' && ran.envelope.session_id !== '' ? ran.envelope.session_id : null
    const named = missing.map((one) => `package ${one.task}, ${one.points.length === 1 ? 'point' : 'points'} ${one.points.join(', ')}`).join('; ')
    if (session === null) {
      process.stderr.write(`The verdict left out judgments of ${named} and named no check session to ask. No verdict was posted.\n`)
      process.exit(1)
    }
    const question = `Your check left out judgments of these points of the inside packages the run handed back: ${named}. ` +
      'Give one JSON object with only packages, an array with one entry per package named here, {task, points: [{pointId, judged, holds, why, rulesKept}]}, ' +
      'each named point once. judged is done, off_target, narrower, more_than_asked or unfinished; holds is whether the hand-back is true; why says what shows it; rulesKept is true when the run kept the office\'s rules. ' +
      'holds can be true for done, off_target or more_than_asked only when handed back as done; for narrower or unfinished, only when handed back as part or not. ' +
      'Give your own judgment from this check; change no file and write nothing to the office.'
    const added = await runClaude(question, { resume: session })
    spent = bothRuns(spent, added.nativeOutput)
    await theUsageIsKept(spent)
    wroteIntoTheOffice = await whatTheRunWrote(theModelWindowFrom, nowStamp())
    await theCheckStopsIfTheInspectorBuilt()
    const answer = added.ok ? theLastObjectIn(added.envelope, (one) => Array.isArray(one.packages)) : null
    const entries = Array.isArray(answer?.packages) ? answer.packages : []
    const obtained = new Map()
    for (const one of missing) {
      const entry = entries.find((each) => each?.task === one.task)
      const lines = (Array.isArray(entry?.points) ? entry.points : []).filter((point) => one.points.includes(point?.pointId))
      const once = lines.filter((point, at) => lines.findIndex((other) => other.pointId === point.pointId) === at)
      if (one.points.some((id) => !once.some((point) => point.pointId === id))) {
        process.stderr.write('The check was asked once for its missing package judgments and did not supply each one. No verdict was posted.\n')
        process.exit(1)
      }
      obtained.set(one.task, once)
    }
    theVerdictBody['packages'] = [
      ...given.map((entry) => obtained.has(entry?.task) ? { ...entry, points: [...(Array.isArray(entry.points) ? entry.points : []), ...obtained.get(entry.task)] } : entry),
      ...missing.filter((one) => !given.some((entry) => entry?.task === one.task)).map((one) => ({ task: one.task, points: obtained.get(one.task) })),
    ]
  }
}

// A nonholding decision is a finding, not a malformed field to be rewritten into a pass.
if (theVerdictBody['verdict'] === 'released' && Array.isArray(theVerdictBody['decisions']) &&
    theVerdictBody['decisions'].some((one) => one?.holds === false || one?.authorityFits === false)) {
  const session = typeof ran.envelope?.session_id === 'string' && ran.envelope.session_id !== '' ? ran.envelope.session_id : null
  if (session === null) {
    process.stderr.write('The release includes a decision that does not hold, and there is no check session to ask about the finding. No verdict was posted.\n')
    process.exit(1)
  }
  const question = 'Your release includes a decision that does not hold or whose authority does not fit. This is a finding. Give your refusal as one JSON object with verdict, missing and says, citing the rule that applies. Keep your decision judgments as written. Change no file and write nothing to the office.\n\n' + JSON.stringify(theVerdictBody['decisions'])
  const fixed = await runClaude(question, { resume: session })
  spent = bothRuns(spent, fixed.nativeOutput)
  await theUsageIsKept(spent)
  wroteIntoTheOffice = await whatTheRunWrote(theModelWindowFrom, nowStamp())
  await theCheckStopsIfTheInspectorBuilt()
  const answer = fixed.ok ? theLastObjectIn(fixed.envelope, (one) => one.verdict === 'refused') : null
  if (answer === null) {
    process.stderr.write('The check was asked once about its nonholding decision and gave no refusal. No verdict was posted.\n')
    process.exit(1)
  }
  for (const key of ['verdict', 'missing', 'says']) if (Object.hasOwn(answer, key)) theVerdictBody[key] = answer[key]
}

// A LEVEL THE DOOR CANNOT READ IN EITHER SHAPE IS TAKEN AT THE LEVEL THE PROMPT WROTE THAT CHAPTER OUT AT, and said, for a
// chapter the prompt wrote out (acceptance finding 65; problem OZfz8TM0M-xF). Otherwise the office records that
// the check read no chapter, which a reader of the release cannot tell from a check that really read nothing. Whether a
// word is a level is asked of the door's own reading in src/shared/chapters.ts, never decided here: deciding it here by
// the ladder alone overwrote levels the door reads (the inspector's refusal of run khJNblavaqqj).
{
  const { chaptersRead: atTheLevelsWrittenOut, taken } = chaptersAtTheLevelsWrittenOut(theVerdictBody['chaptersRead'], assembled.chaptersAt ?? [])
  if (taken.length > 0) {
    theVerdictBody['chaptersRead'] = atTheLevelsWrittenOut
    const said = `The chapters line named levels the reading ladder has not got: ${taken.join('; ')}.`
    process.stdout.write(`${said}\n`)
    if (typeof theVerdictBody['check'] === 'string') theVerdictBody['check'] = `${theVerdictBody['check']}\n\n${said}`
  }
}

// A TRACE WORD THE DOOR CANNOT READ IS TAKEN AT THE ONE OF ITS TWO WORDS IT NEARLY IS, and said (problem -WZ40nNgHnTR;
// 9KmvFlFtY4dP). On 4 October 2026 a check wrote `how` "an engineering choice left to agents" and the door
// refused the whole verdict. What counts as a near miss is decided beside the door's two words, in src/shared/releasing.ts.
theTraceIsTakenAtTheDoorsWords()
function theTraceIsTakenAtTheDoorsWords() {
  const { traced: atTheDoorsWords, taken } = tracedAtTheDoorsWords(theVerdictBody['traced'])
  if (taken.length > 0) {
    theVerdictBody['traced'] = atTheDoorsWords
    const said = `The trace wrote \`how\` at words the door does not take, so they were taken at the door's words they nearly are: ${taken.join('; ')}.`
    process.stdout.write(`${said}\n`)
    if (typeof theVerdictBody['check'] === 'string') theVerdictBody['check'] = `${theVerdictBody['check']}\n\n${said}`
  }
}

// THE VERDICT IS HELD TO THE DOOR'S OWN SHAPE BEFORE IT IS POSTED, AND THE MODEL CORRECTS THE FIELDS THE DOOR WOULD
// REFUSE, ONCE (problem -WZ40nNgHnTR; ZqRaTMEB_MMu). On 4 October 2026 a check of wave 13u's round 5 wrote every
// trace line as {path, ...}, the door wants {paths: [...], to, how, said}, and it refused the whole verdict; a near-miss
// word cannot cover that. The shape is src/shared/the-verdict-door.ts, the one the door parses with, so the two cannot
// drift. The model is shown the door's own words and the shape of only the keys at fault, in a short call of its own,
// and only those keys are taken back from its answer: the verdict, its reasons and every other field stay as the check
// wrote them. If the body still does not fit, it is posted as it stands and the door's refusal goes to the worker
// whole, as before.
{
  const first = whatTheVerdictDoorWouldSay(theBodyAsPosted())
  if (first !== null) {
    process.stdout.write(`The verdict door would refuse this verdict as the check wrote it: ${first.said}\n`)
    if (first.toolsKeys.length > 0) {
      process.stdout.write(`Of those, ${first.toolsKeys.join(' and ')} ${first.toolsKeys.length === 1 ? 'is' : 'are'} this tool's own, not the model's, so no correction is asked for ${first.toolsKeys.length === 1 ? 'it' : 'them'}.\n`)
    }
    if (first.modelsKeys.length > 0) {
      const keys = first.modelsKeys.map((key) => `\`${key}\``).join(', ')
      const correction = [
        'Your check is finished and its verdict is written. This asks only for a correction of its form, once.',
        `The verdict door would refuse the verdict as it stands, in its own words: ${first.said}`,
        `The verdict as you wrote it:\n${JSON.stringify(theVerdictBody, null, 2)}`,
        `The shape the door takes for the keys it would refuse, as JSON Schema:\n${theShapeTheDoorTakesFor(first.modelsKeys)}`,
        `Answer with one JSON object that holds only ${keys}, corrected so that the door takes them, and nothing else. ` +
          'Keep what each of them says: change its form, not your judgment. Run no command and read or write no file.',
      ].join('\n\n')
      process.stdout.write(`Asking the model once to correct ${keys}.\n`)
      const fixed = await runClaude(correction, RUNTIME === 'opencode' || RUNTIME === 'dsh' ? { resume: THE_MODEL_SESSION } : {})
      spent = bothRuns(spent, fixed.nativeOutput)
      await theUsageIsKept(spent)
      wroteIntoTheOffice = await whatTheRunWrote(theModelWindowFrom, nowStamp())
      await theCheckStopsIfTheInspectorBuilt()
      // A failed dsh correction proves no finished last turn, so its earlier verdict cannot be posted.
      // Other runtimes keep their existing fallback (supervisor mIMYFsIIZLRM).
      if (RUNTIME === 'dsh' && !fixed.ok) {
        process.stderr.write(`The dsh form correction did not finish. No verdict was written. ${fixed.why}\n`)
        process.exit(1)
      }
      const corrected = fixed.ok ? theLastObjectIn(fixed.envelope, () => true) : null
      if (corrected === null) {
        process.stdout.write(`The correction gave no object back (${fixed.ok ? 'its answer held no JSON object' : fixed.why}), so the verdict is posted as it stands.\n`)
      } else {
        for (const key of first.modelsKeys) if (Object.hasOwn(corrected, key)) theVerdictBody[key] = corrected[key]
        const ignored = Object.keys(corrected).filter((key) => !first.modelsKeys.includes(key))
        if (ignored.length > 0) process.stdout.write(`The correction also wrote ${ignored.join(', ')}, which it was not asked for; that was left out.\n`)
        theTraceIsTakenAtTheDoorsWords()
        const after = whatTheVerdictDoorWouldSay(theBodyAsPosted())
        const said =
          `The verdict door would have refused ${keys} as the check first wrote ${first.modelsKeys.length === 1 ? 'it' : 'them'} ` +
          `(${first.said}), so the model was asked once to correct ${first.modelsKeys.length === 1 ? 'it' : 'them'}` +
          (after === null ? ', and did.' : `, and the door would still refuse the result: ${after.said}`)
        process.stdout.write(`${said}\n`)
        if (typeof theVerdictBody['check'] === 'string') theVerdictBody['check'] = `${theVerdictBody['check']}\n\n${said}`
      }
    }
  }
}

/** The cumulative native output after another invocation, or the earlier output when no model ran. */
function bothRuns(first, second) {
  // Each invocation carries all native output kept by this check, including earlier attempts.
  return second ?? first
}

/** Every string a verdict body holds, with where it is in the body: `check`, `traced[0].said`. */
function theWordsOfAVerdict(value, where = '') {
  if (typeof value === 'string') return [{ where, text: value }]
  if (Array.isArray(value)) return value.flatMap((one, at) => theWordsOfAVerdict(one, `${where}[${String(at)}]`))
  if (value !== null && typeof value === 'object') return Object.entries(value).flatMap(([key, one]) => theWordsOfAVerdict(one, where === '' ? key : `${where}.${key}`))
  return []
}

const THE_REMINDERS_GIVEN = new Set()
/**
 * THE VERDICT IS POSTED AS THE CHECK WROTE IT, with a reminder when its words seem to hold a key, as a message gets
 * one, under the owner's decision. It is a reminder, never a refusal.
 * The reminder names where, the piece's first four characters and its length, never the piece, and is said once.
 */
async function theVerdictIsPosted() {
  const body = theBodyAsPosted()
  const found = whereAMessageHoldsAKey(theWordsOfAVerdict(body))
  if (found !== null) {
    const { where, what, begins, n } = theKeyReminder(found, false)
    const says = `The verdict's ${where} seems to hold ${what}: the piece beginning "${begins}", ${String(n)} characters long. ` +
      'It is posted as the check wrote it. If it is a key, it will be kept in the office and in its backups, and whoever reads the check can read it.'
    if (!THE_REMINDERS_GIVEN.has(says)) process.stdout.write(`${says}\n`)
    THE_REMINDERS_GIVEN.add(says)
  }
  const key = THE_CHECK_RUN_KEY
  return askAndHear(`/api/checks/${chosen.run}`, body, { headers: reads.readingOnly === true && typeof key === 'string' && key !== '' ? { [KEY_HEADER]: key } : {} })
}

/** THE VERDICT AS IT IS POSTED: the model's verdict, and beside it what this tool read and what the model's run wrote. */
function theBodyAsPosted() {
  return {
    ...theVerdictBody,
    // C30: the release or the refusal carries which worktree and which tip this check read. It is
    // read again here rather than reused from the assembly, because the worktree is put back on the
    // way out and what the record should say is what was read, not what is there now.
    read: withWhatTheSeatsSaid(theTreeThatWasRead),
    // ACCEPTANCE FINDING 44: the count of what the model's run wrote into the office, beside `read`.
    // Left off entirely when the door could not be read, so nothing claims the model wrote nothing.
    ...(wroteIntoTheOffice === null ? {} : { wroteIntoTheOffice }),
  }
}

/**
 * THE SEAL THE CHECK READ IS STILL THE RUN'S, asked just before each post, or the tool ends without posting. Problem
 * p-y9H17Q-baO, message lPumTERJkveW: a corrected finish can seal the run again while this check works. Read the
 * current seal just before posting; never post on a guess.
 *
 * A GIT SEAL IS READ FROM ITS SEALED COMMIT HERE, not from the run's folder (src/config/seal-read-header.mjs). A check
 * takes minutes, and by now the next round may work in that folder, on another branch or with a sealed file changed.
 * The verdict is about the sealed commit, and the office still refuses one the repository does not hold as sealed.
 */
async function theSealIsStillTheOneRead() {
  let current
  try {
    const reread = await askAndHear(`/api/checks/${chosen.run}`, undefined, { headers: { [SEAL_READ_HEADER]: FROM_ITS_COMMIT } })
    if (!reread.ok) throw new Error(`HTTP ${reread.status}: ${reread.said}`)
    current = JSON.parse(reread.said)
    if (current === null || typeof current !== 'object' || Array.isArray(current)) {
      throw new Error('The check read did not return an object.')
    }
  } catch (why) {
    process.stderr.write(`Run ${chosen.run}'s current seal could not be read before the verdict: ${why instanceof Error ? why.message : String(why)}; no verdict was posted.\n`)
    process.exit(1)
  }
  if (current.submission?.id !== reads.submission?.id) {
    process.stderr.write(`Run ${chosen.run} was sealed again while this check read it (it read seal ${reads.submission?.id ?? 'none'}; the current seal is ${current.submission?.id ?? 'none'}), so no verdict was posted; check the current seal.\n`)
    process.exit(1)
  }
}

/**
 * A RELEASE THE DOOR REFUSED ONLY FOR PATHS WITH NO `traced` LINE IS ASKED BACK ONCE, IN THE CHECK'S OWN SESSION, AND
 * POSTED AGAIN (wave 13y round 23). Between 00:30 and 02:30 on 12 October 2026 three checks on Sonnet chose release and
 * gave no trace line for most of the paths they judged (dskE2FcwWb41, kJ4RcZovw7pm, 7cWnj67ylD8U). The door refused each
 * with 400, the run stayed inspecting, and a whole check was lost each time. The correction of form above cannot see
 * this: the body fits the door's shape, and only the door knows which paths the check judged.
 *
 * A TRACE IS THE CHECKER'S OWN JUDGEMENT (chapter 1, no fake success), so the question goes back to the session that
 * judged, by its id, and only the lines it writes that name a path the door named are added. This tool writes no trace
 * line and fills none in. Answers the door's second answer, or null when nothing was posted again: another refusal, no
 * session to ask in, or no lines back. A second refusal goes on as every refusal does; the model is not asked twice.
 */
async function theMissingTracesAreAskedForOnce(refused) {
  const doorSaid = theDoorsWords(refused.said)
  const untraced = refused.status === 400 && theVerdictBody['verdict'] === 'released' ? thePathsAReleaseLeftUntraced(doorSaid) : null
  if (untraced === null) return null
  const session = typeof ran.envelope?.session_id === 'string' && ran.envelope.session_id !== '' ? ran.envelope.session_id : null
  if (session === null) {
    process.stdout.write(
      "The verdict door refused the release only because `traced` gives no line for some paths, but the check's answer " +
        'names no session of its own, and a trace from any other session would not be its judgement, so the refusal goes on as it stands.\n',
    )
    return null
  }
  const question = [
    'Your check is finished. The verdict door refused its release for one reason only, and this asks you once, in this same session, for what is missing.',
    `The door's words: ${doorSaid}`,
    `The paths it names, one to a line:\n${untraced.join('\n')}`,
    `The \`traced\` you wrote:\n${JSON.stringify(theVerdictBody['traced'] ?? [], null, 2)}`,
    `The shape the door takes for \`traced\`, as JSON Schema:\n${theShapeTheDoorTakesFor(['traced'])}`,
    'Answer with one JSON object that holds only `traced`: the new lines, which between them name each of those paths, and nothing else. ' +
      'Trace each path from your own judgement of it, as you traced the others. If you cannot trace a path, give no line for it and say why ' +
      'outside the object. Change no file and write nothing into the office.',
  ].join('\n\n')
  process.stdout.write(`The verdict door refused the release only because \`traced\` gives no line for ${untraced.join(', ')}. Asking the check's own session ${session} once to add them.\n`)
  const added = await runClaude(question, { resume: session })
  spent = bothRuns(spent, added.nativeOutput)
  await theUsageIsKept(spent)
  wroteIntoTheOffice = await whatTheRunWrote(theModelWindowFrom, nowStamp())
  await theCheckStopsIfTheInspectorBuilt()
  const answer = added.ok ? theLastObjectIn(added.envelope, (one) => Array.isArray(one.traced)) : null
  const asked = `The verdict door refused the release because \`traced\` gave no line for ${untraced.join(', ')}, so the model was asked once, in the check's own session, to add them`
  if (answer === null) {
    process.stdout.write(`${asked}, and its answer gave no \`traced\` list back (${added.ok ? 'it held no such JSON object' : added.why}), so the first refusal goes on as it stands.\n`)
    return null
  }
  const named = new Set(untraced)
  const lines = answer.traced.filter((one) => Array.isArray(one?.paths) && one.paths.some((path) => named.has(path)))
  if (lines.length < answer.traced.length) {
    const others = answer.traced.length - lines.length
    process.stdout.write(`The answer also wrote ${String(others)} ${others === 1 ? 'line that names' : 'lines that name'} none of those paths, which it was not asked for; ${others === 1 ? 'that was' : 'those were'} left out.\n`)
  }
  theVerdictBody['traced'] = [...(Array.isArray(theVerdictBody['traced']) ? theVerdictBody['traced'] : []), ...lines]
  theTraceIsTakenAtTheDoorsWords()
  const traced = new Set(lines.flatMap((one) => one.paths))
  const still = untraced.filter((path) => !traced.has(path))
  const said = `${asked}${still.length === 0 ? ', and did.' : `, and its answer still gives none for ${still.join(', ')}.`}`
  process.stdout.write(`${said}\n`)
  if (typeof theVerdictBody['check'] === 'string') theVerdictBody['check'] = `${theVerdictBody['check']}\n\n${said}`
  await theSealIsStillTheOneRead()
  const again = await theVerdictIsPosted()
  if (!again.ok) process.stdout.write('The verdict door refused the verdict again, so it goes on as a refused verdict does; the model is not asked a second time.\n')
  return again
}

/**
 * A VERDICT THE DOOR REFUSED ONLY FOR ITS SHAPE IS ASKED BACK ONCE, IN THE CHECK'S OWN SESSION, AND POSTED AGAIN (wave 13v
 * round 28). On 12 October 2026 the check 1vAOXp7aiFzW of wave 13j's round loop-2 refused, and its `says` named no chapter,
 * precedent or invariant. The door refused the verdict with 400 at 17:19, nothing was recorded, and the verdict had to be read
 * by hand. The correction of form above asks a new session, which does not know the check, and it had not mended it.
 *
 * ONLY FOR ITS SHAPE means two things. The door's words are the words the door's own shape (src/shared/the-verdict-door.ts)
 * gives for the body as it was posted. And every key they name is one the model wrote, not `read` or `wroteIntoTheOffice`.
 * The question gives the door's words and the shape the door takes for those keys. Answers as theCheckIsAskedOnceToCorrect
 * does, or null when the refusal is not this one.
 */
async function theShapeIsAskedForOnce(refused) {
  const doorSaid = theDoorsWords(refused.said)
  const would = refused.status === 400 ? whatTheVerdictDoorWouldSay(theBodyAsPosted()) : null
  if (would === null || would.said !== doorSaid || would.toolsKeys.length > 0 || would.modelsKeys.length === 0) return null
  return theCheckIsAskedOnceToCorrect(doorSaid, {
    only: `only for the shape of ${would.modelsKeys.map((key) => `\`${key}\``).join(', ')}`,
    why: 'for its shape only',
    wanted: would.modelsKeys,
    // UNDER SAVED ROUND CHAPTERS `says` IS OFFERED ONLY WHAT THE RULE TAKES there (round BL, item 2ao).
    more: !would.modelsKeys.includes('says')
      ? []
      : 'saved' in THE_SAVED_CHAPTERS && THE_SAVED_CHAPTERS.saved !== null
        ? [`\`says\` names ${whatSaysTakesUnderSavedChapters()}.`, NO_DECISION_WAS_GIVEN]
        : [`\`says\` names ${whatSaysTakes()}.`],
    may: 'Run no command, change no file and write nothing into the office.',
    still: () => null,
  })
}

/**
 * A RELEASE THE DOOR REFUSED ONLY BECAUSE ITS `traced` NAMES RECORDS THE OFFICE DOES NOT HOLD IS ASKED BACK ONCE, IN THE
 * CHECK'S OWN SESSION, AND POSTED AGAIN (wave 13v round 33). At 05:33 on 13 October 2026 a check of wave 13x's round 17f
 * released, but it had written "chapter 10" where a trace line's `to` takes a record id. The door refused the release with
 * 400, "The trace names records the office does not hold: chapter 10 (...)", and the release was lost (check CXCtvckdwXo9).
 * The body fitted the door's shape, so the shape's question above did not see it.
 *
 * ONLY BECAUSE means the door's words are its sentence for this refusal (src/shared/releasing.ts) and nothing else, and the
 * lines it names are lines of the `traced` that was posted. Only `traced` is taken back from the answer, and the model
 * writes it; this tool changes no line. Answers as theCheckIsAskedOnceToCorrect does, or null when the refusal is not this one.
 */
async function theRecordsATraceNamesAreAskedForOnce(refused) {
  const doorSaid = theDoorsWords(refused.said)
  const notHeld = refused.status === 400 ? theRecordsATraceNamedThatAreNotHeld(doorSaid, theVerdictBody['traced']) : null
  if (notHeld === null) return null
  return theCheckIsAskedOnceToCorrect(doorSaid, {
    only: 'only because `traced` names records the office does not hold',
    why: 'only because its `traced` names records the office does not hold',
    wanted: ['traced'],
    more: [`Each \`to\` in \`traced\` is the id of a record in the office. The office holds no record with the id ${notHeld.map((to) => JSON.stringify(to)).join(' or ')}.`],
    may: 'Change no file and write nothing into the office.',
    still: (body) => {
      const left = [...new Set((Array.isArray(body['traced']) ? body['traced'] : []).map((one) => (typeof one?.to === 'string' ? one.to.trim() : null)))]
        .filter((to) => to !== null && notHeld.includes(to))
      return left.length === 0 ? null : `its answer still names ${left.join(', ')}, which the door said the office does not hold`
    },
  })
}

/**
 * THE CHECK'S OWN SESSION IS ASKED ONCE TO CORRECT WHAT THE DOOR REFUSED, AND THE VERDICT IS POSTED AGAIN (wave 13v rounds
 * 28 and 33). A correction from any other session would not be the check's judgement, so with no session nothing is asked.
 * `only` says what the door refused the verdict for, in the words of this tool's log; `why` says it in the question's.
 * `wanted` are the keys asked for, and the only keys taken back from the answer, so this tool writes no part of them. `more`
 * are lines the question adds, and `may` says what the session may do. `still` names what the tool can see is still wrong
 * in the answer once it fits the door's shape, or null. Answers the door's second answer, or null when nothing was posted
 * again. A second refusal goes on as every refusal does, saying both; the model is not asked twice.
 */
async function theCheckIsAskedOnceToCorrect(doorSaid, { only, why, wanted, more, may, still }) {
  const keys = wanted.map((key) => `\`${key}\``).join(', ')
  const them = wanted.length === 1 ? 'it' : 'them'
  const session = typeof ran.envelope?.session_id === 'string' && ran.envelope.session_id !== '' ? ran.envelope.session_id : null
  if (session === null) {
    process.stdout.write(
      `The verdict door refused the verdict ${only}, but the check's answer names no session of its own, ` +
        'and a correction from any other session would not be its judgement, so the refusal goes on as it stands.\n',
    )
    return null
  }
  const question = [
    `Your check is finished. The verdict door refused its verdict ${why}, and this asks you once, in this same session, to correct it.`,
    `The door's words: ${doorSaid}`,
    `The verdict as it was posted:\n${JSON.stringify(theVerdictBody, null, 2)}`,
    `The shape the door takes for ${keys}, as JSON Schema:\n${theShapeTheDoorTakesFor(wanted)}`,
    ...more,
    `Answer with one JSON object that holds only ${keys}, corrected so that the door takes ${them}, and nothing else. ` +
      `Write ${them} from your own judgement in this check: change the form, not your verdict. If you cannot, give no object and say why. ${may}`,
  ].join('\n\n')
  process.stdout.write(`The verdict door refused the verdict ${only}. Asking the check's own session ${session} once to correct ${them}.\n`)
  const fixed = await runClaude(question, { resume: session })
  spent = bothRuns(spent, fixed.nativeOutput)
  await theUsageIsKept(spent)
  wroteIntoTheOffice = await whatTheRunWrote(theModelWindowFrom, nowStamp())
  await theCheckStopsIfTheInspectorBuilt()
  const answer = fixed.ok ? theLastObjectIn(fixed.envelope, (one) => wanted.some((key) => Object.hasOwn(one, key))) : null
  const asked = `The verdict door refused the verdict ${only} (${doorSaid}), so the model was asked once, in the check's own session, to correct ${them}`
  if (answer === null) {
    process.stdout.write(`${asked}, and its answer gave none of ${them} back (${fixed.ok ? 'it held no such JSON object' : fixed.why}), so the first refusal goes on as it stands.\n`)
    return null
  }
  for (const key of wanted) if (Object.hasOwn(answer, key)) theVerdictBody[key] = answer[key]
  const ignored = Object.keys(answer).filter((key) => !wanted.includes(key))
  if (ignored.length > 0) process.stdout.write(`The answer also wrote ${ignored.join(', ')}, which it was not asked for; that was left out.\n`)
  theTraceIsTakenAtTheDoorsWords()
  const after = whatTheVerdictDoorWouldSay(theBodyAsPosted())
  const left = after === null ? still(theVerdictBody) : null
  const said = `${asked}${after !== null ? `, and the door's shape still refuses the answer: ${after.said}` : left !== null ? `, and ${left}.` : ', and did.'}`
  process.stdout.write(`${said}\n`)
  if (typeof theVerdictBody['check'] === 'string') theVerdictBody['check'] = `${theVerdictBody['check']}\n\n${said}`
  await theSealIsStillTheOneRead()
  const again = await theVerdictIsPosted()
  if (!again.ok) {
    process.stdout.write(
      `The verdict door refused the verdict again, with HTTP ${String(again.status)}: ${theDoorsWords(again.said)}\n` +
        `Its first refusal, before the model was asked: ${doorSaid}\n` +
        'So it goes on as a refused verdict does, saying both refusals; the model is not asked a second time.\n',
    )
  }
  return again
}

/**
 * THE RUN'S SAVED ROUND CHAPTERS, AS THE OFFICE'S READING OF THE RUN GIVES THEM (round BL, item 2ao): `{ saved }`, where
 * `saved` is null when the run saved none, or `{ cannot }`, which says why this tool cannot tell. An office older than this
 * round gives no `savedChapters` in its reading at all.
 * @returns {{ saved: null | { chapters: { chapter: number, level: string }[], chapterNames: { n: number, label: string }[] } } | { cannot: string }}
 */
function theSavedChaptersRead() {
  if (reads === null || typeof reads !== 'object' || !Object.hasOwn(reads, 'savedChapters')) {
    return { cannot: "the office's reading of the run does not say whether the run saved any" }
  }
  const given = reads.savedChapters
  if (given === null) return { saved: null }
  const aChapter = (one) => one !== null && typeof one === 'object' && Number.isInteger(one.chapter) && typeof one.level === 'string'
  const aName = (one) => one !== null && typeof one === 'object' && Number.isInteger(one.n) && typeof one.label === 'string'
  if (typeof given !== 'object' || !Array.isArray(given.chapters) || !given.chapters.every(aChapter) || !Array.isArray(given.chapterNames) || !given.chapterNames.every(aName)) {
    return { cannot: "the office's reading of the run gives them in a shape this tool cannot read" }
  }
  return {
    saved: {
      chapters: given.chapters.map(({ chapter, level }) => ({ chapter, level })),
      chapterNames: given.chapterNames.map(({ n, label }) => ({ n, label })),
    },
  }
}
const THE_SAVED_CHAPTERS = theSavedChaptersRead()

/**
 * WHAT THE RUN'S SAVED ROUND CHAPTERS REFUSE IN A VERDICT, in the rule's own words, or null when they take all of it. The
 * rule is checkSavedChapterClaims, the one the verdict door holds a verdict to, and it is imported, not written again here.
 * It stops at its first fault, so it is asked of each claim alone, and every fault is named. The chapters line is read as
 * the door reads it, against the office's chapter names. `wanted` are the keys the model is asked to correct:
 * `chaptersRead` for a reading above what was delivered, `says` for a chapter that was not delivered, and `says` and
 * `check` for a precedent, which may be named only in the text of `check`.
 * @param {{ chapters: { chapter: number, level: string }[], chapterNames: { n: number, label: string }[] }} saved
 * @param {Record<string, any>} body
 * @returns {{ said: string, wanted: string[] } | null}
 */
function whatTheSavedChaptersRefuse(saved, body) {
  const selection = /** @type {import('../src/shared/round-chapters/manifest.ts').RoundChapters} */ (/** @type {unknown} */ ({ chapters: saved.chapters }))
  /** @type {string[]} */
  const reasons = []
  const wanted = new Set()
  /**
   * @param {Parameters<typeof checkSavedChapterClaims>[1]} claims
   * @param {string[]} keys
   */
  const refuses = (claims, keys) => {
    try {
      checkSavedChapterClaims(selection, claims)
    } catch (why) {
      reasons.push(why instanceof Error ? why.message : String(why))
      for (const key of keys) wanted.add(key)
    }
  }
  for (const claim of readAChaptersLine(body['chaptersRead'], saved.chapterNames).named) refuses({ chaptersRead: [claim], says: null }, ['chaptersRead'])
  const says = body['says'] !== null && typeof body['says'] === 'object' && !Array.isArray(body['says']) ? body['says'] : null
  if (says?.chapter != null) refuses({ chaptersRead: [], says: { chapter: says.chapter } }, ['says'])
  if (says?.precedent != null) refuses({ chaptersRead: [], says: { precedent: says.precedent } }, ['says', 'check'])
  if (reasons.length === 0) return null
  return { said: reasons.join(' '), wanted: ['says', 'check', 'chaptersRead'].filter((key) => wanted.has(key)) }
}

/**
 * A VERDICT THAT CITES WHAT THE RUN'S SAVED ROUND CHAPTERS DO NOT HOLD IS REFUSED BY THIS TOOL BEFORE IT IS POSTED, AND THE
 * CHECK'S OWN SESSION IS ASKED ONCE TO CORRECT IT (round BL, item 2ao). Under saved chapters the verdict door refuses a
 * precedent, a chapter that was not delivered and a reading above what was. The door's words matched no question this
 * tool asks once, so such a verdict was refused, sent to the worker, and the whole check was lost.
 *
 * Held only before the first post. A verdict corrected after a door refusal is posted without it, and the door checks it.
 * A correction from any other session would not be the check's judgement, so with no session nothing is asked and the
 * verdict is posted as it stands. Only the keys asked for are taken back from the answer. A good answer is posted. A bad
 * one is posted nowhere: the verdict, both refusals and the answer go to stderr, onto the check's session and to the
 * worker, and the tool ends as a check with no verdict does, or with 1 when the question asked again did not finish.
 * @returns {Promise<void>}
 */
async function theVerdictIsHeldToTheSavedChapters() {
  if ('cannot' in THE_SAVED_CHAPTERS) {
    process.stdout.write(
      `This tool could not hold the verdict to the run's saved round chapters before posting it: ${THE_SAVED_CHAPTERS.cannot}. ` +
        'The verdict is posted as it stands, and the verdict door checks it.\n',
    )
    return
  }
  const saved = THE_SAVED_CHAPTERS.saved
  if (saved === null) return
  const first = whatTheSavedChaptersRefuse(saved, theVerdictBody)
  if (first === null) return
  const keys = first.wanted.map((key) => `\`${key}\``).join(', ')
  const them = first.wanted.length === 1 ? 'it' : 'them'
  const session = typeof ran.envelope?.session_id === 'string' && ran.envelope.session_id !== '' ? ran.envelope.session_id : null
  if (session === null) {
    process.stdout.write(
      "This tool refused the verdict before posting it, because the run's saved round chapters do not hold what it cites. " +
        `The rule's words: ${first.said} The check's answer names no session of its own, and a correction from any other session ` +
        'would not be its judgement, so the verdict is posted as it stands.\n',
    )
    return
  }
  const question = [
    "Your check is finished. This check tool refused its verdict before posting it, because the run's saved round chapters do not hold what it cites, " +
      'and this asks you once, in this same session, to correct it.',
    `The rule's words: ${first.said}`,
    `The verdict as you wrote it:\n${JSON.stringify(theVerdictBody, null, 2)}`,
    `The shape the door takes for ${keys}, as JSON Schema:\n${theShapeTheDoorTakesFor(first.wanted)}`,
    ...(first.wanted.includes('says') ? [`\`says\` names ${whatSaysTakesUnderSavedChapters()}.`, NO_DECISION_WAS_GIVEN] : []),
    ...(first.wanted.includes('chaptersRead')
      ? [`The chapters this check was given, each at the level it was given: ${saved.chapters.map(({ chapter, level }) => `chapter ${String(chapter)} at ${level}`).join(', ')}.`]
      : []),
    `Answer with one JSON object that holds only ${keys}, corrected so that the rule takes ${them}, and nothing else. ` +
      `Write ${them} from your own judgement in this check: change the form, not your verdict. If you cannot, give no object and say why. ` +
      'Run no command, change no file and write nothing into the office.',
  ].join('\n\n')
  process.stdout.write(
    "This tool refused the verdict before posting it: the run's saved round chapters do not hold what it cites. " +
      `Asking the check's own session ${session} once to correct ${them}.\n`,
  )
  const fixed = await runClaude(question, { resume: session })
  spent = bothRuns(spent, fixed.nativeOutput)
  await theUsageIsKept(spent)
  wroteIntoTheOffice = await whatTheRunWrote(theModelWindowFrom, nowStamp())
  await theCheckStopsIfTheInspectorBuilt()
  const answerText = fixed.ok ? String(fixed.envelope?.result ?? '') : null
  const answer = fixed.ok ? theLastObjectIn(fixed.envelope, (one) => first.wanted.some((key) => Object.hasOwn(one, key))) : null
  /** @type {string | null} */
  let second = null
  if (!fixed.ok) second = `The question asked again in the check's own session did not finish: ${fixed.why}`
  else if (answer === null) second = `The answer gave none of ${keys} back (it held no such JSON object)`
  else {
    for (const key of first.wanted) if (Object.hasOwn(answer, key)) theVerdictBody[key] = answer[key]
    const ignored = Object.keys(answer).filter((key) => !first.wanted.includes(key))
    if (ignored.length > 0) process.stdout.write(`The answer also wrote ${ignored.join(', ')}, which it was not asked for; that was left out.\n`)
    const after = whatTheVerdictDoorWouldSay(theBodyAsPosted())
    second = after !== null ? `The door's shape refuses the answer: ${after.said}` : (whatTheSavedChaptersRefuse(saved, theVerdictBody)?.said ?? null)
  }
  if (second === null) {
    const said = `This tool refused the verdict before posting it (${first.said}), so the model was asked once, in the check's own session, to correct ${them}, and did.`
    process.stdout.write(`${said}\n`)
    if (typeof theVerdictBody['check'] === 'string') theVerdictBody['check'] = `${theVerdictBody['check']}\n\n${said}`
    return
  }
  const verdict = JSON.stringify(answered, null, 2)
  const whatItAnswered = answerText === null ? '' : `What the model answered when asked, word for word:\n${answerText}`
  process.stderr.write(
    'This tool refused the verdict before posting it, and again after the model was asked once to correct it, so no verdict was posted.\n' +
      `The first refusal, in the rule's words: ${first.said}\n` +
      `The second refusal: ${second}\n` +
      `The verdict, as the inspector wrote it:\n${verdict}\n` +
      (whatItAnswered === '' ? '' : `${whatItAnswered}\n`) +
      'The message worker can report this ending to the office, which allows at most one new whole check.\n',
  )
  await theUnpostedVerdictIsKept({ verdict, answer: answerText, refusals: [first.said, second] })
  await theUnrecordedVerdictIsSentOn(
    (stands) =>
      `The check of your run ${chosen.run} ended, and this check tool refused its verdict before posting it, so the verdict door never saw it ` +
      'and nothing was recorded on the run.\n\n' +
      `What the tool said the first time, word for word: ${first.said}\n\n` +
      `The model was then asked once, in the check's own session, to correct it. What the tool said of its answer, word for word: ${second}\n\n` +
      `Where the run is left, in the office's words: ${stands}\n\n` +
      `The verdict, as the inspector wrote it:\n${verdict}` +
      (whatItAnswered === '' ? '' : `\n\n${whatItAnswered}`),
    (stands, handle) =>
      `The check of run ${chosen.run} by ${chosen.as} ended, but the check tool refused its verdict before posting it, so nothing was recorded on the run, ` +
      `which the office still reads as it did before the check: "${stands}" The verdict and the tool's words are with ${handle}.`,
  )
  process.exit(fixed.ok ? CHECK_ENDED_WITH_NO_VERDICT : 1)
}

await theVerdictIsHeldToTheSavedChapters()
await theSealIsStillTheOneRead()
function preserveDecisionsForAnOlderDoor() {
  if (!Object.hasOwn(theVerdictBody, 'decisions') || typeof theVerdictBody['check'] !== 'string') return false
  theVerdictBody['check'] += `\n\nThe office's verdict door does not accept a separate decisions field. Decision judgments: ${JSON.stringify(theVerdictBody['decisions'])}`
  delete theVerdictBody['decisions']
  return true
}
if (Array.isArray(assembled.verdictKeys) && !assembled.verdictKeys.includes('decisions')) preserveDecisionsForAnOlderDoor()
let posted = await theVerdictIsPosted()
// An older door without a capability list says exactly which top-level key it does not recognize.
if (!posted.ok && posted.status === 400 && theDoorsWords(posted.said).includes('Unrecognized key: "decisions"') && preserveDecisionsForAnOlderDoor()) {
  await theSealIsStillTheOneRead()
  posted = await theVerdictIsPosted()
}
/** The door's first refusal and what the model was asked to correct, kept when it was asked once and the verdict was posted again. */
let refusedFirst = null
if (!posted.ok) {
  const traced = await theMissingTracesAreAskedForOnce(posted)
  const reshaped = traced === null ? await theShapeIsAskedForOnce(posted) : null
  const renamed = traced === null && reshaped === null ? await theRecordsATraceNamesAreAskedForOnce(posted) : null
  if (reshaped !== null) refusedFirst = { refused: posted, corrected: "the verdict's shape" }
  if (renamed !== null) refusedFirst = { refused: posted, corrected: 'the records its trace names' }
  posted = traced ?? reshaped ?? renamed ?? posted
}
if (!posted.ok) {
  await theRefusedVerdictIsDelivered(answered, posted, refusedFirst)
  process.exit(1)
}
theVerdictIsDelivered = true
theWorktreeIsPutBack()
const written = JSON.parse(posted.said)

process.stdout.write(
  [
    '',
    `The check answered: ${written.verdict}.`,
    `  to the worker   ${written.toTheWorker || '(nothing)'}`,
    `  to the starter  ${written.toTheStarter || '(nothing — ' + String(written.says ?? '') + ')'}`,
    ...(written.group === null ? [] : [`  the group       ${written.group}`]),
    `  the run now     ${written.stands?.says ?? ''}`,
  ].join('\n') + '\n',
)
theViewSweep?.stop()
