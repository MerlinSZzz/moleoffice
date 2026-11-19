// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE MERGE TOOL'S ARGUMENTS AND THE CONSTANTS SEVERAL MODULES READ. The flags are read when this module is loaded,
 * so a usage error ends the run with exit 2 before anything else happens. Part of the merge tool, tools/the-merger.mjs.
 */

import './a-library-is-not-a-program.mjs'
import { mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { whereIsTheApi, whichWorkspace } from '../where-is-the-api.mjs'
import { SANDBOXES_FOLDER } from '../sandbox-common.mjs'
import { BUS_ENTRIES_BOUNDS, MERGE_WORKERS_BOUNDS, REPO_ROOT, settingNamed, settingValue } from '../../src/config/settings.mjs'
import { theOfficeToolEnvironment } from '../../src/config/the-office-tool-environment.mjs'
import { VM_CHECKOUT, VM_DEFAULTS, VM_SANDBOX_GRACE_SECONDS, estimateUSD, readMonthReceipts, receiptsFile, modalRunnerFiles, validateToken, executable } from '../modal-tests.mjs'
import { theGitIdentityOf, theOfficeConfiguration } from './config.mjs'
import { wholeSuiteFixRoundIsOn } from '../../src/config/whole-suite-red.mjs'
import { integratedBuildPosition, ownerContentPosition, pinnedCommitPosition, placeholderAddressesPosition, pluginPagesPosition, resolutionRefPosition } from '../../src/config/integration-guards.mjs'
import { queueCodeRidesABus } from '../../src/config/queue-code-rides-a-bus.mjs'

// push.mjs reads the mirror's place here so that it reaches no office module itself.
export { theMainMirrorOf } from '../sandbox-common.mjs'

/**
 * THE PRIVATE COPY'S ADDRESS, the setting MOLE_OFFICE_PRIVATE_ORIGIN, read when it is called, or null when nothing sets
 * it. push.mjs asks for it each time the push runs and never at import, and reads it here so that it reaches no office
 * module itself.
 */
export const thePrivateOrigin = () => settingValue('MOLE_OFFICE_PRIVATE_ORIGIN')

// THE PAIRING IS TAKEN OUT OF THIS PROCESS'S ENVIRONMENT once settings.mjs has read it, and settings.mjs has read it by
// now because this module imports it. Nearly everything the merge tool starts runs code from another folder: git, the
// suites in a clone or a sandbox, and the landing's database question and npm scripts in the development checkout. That
// checkout's settings refuse to load when they are named as their own pairing, and a clone's would read the development
// .env. Only this checkout's own tools that read the office's key get the pairing back, through withThePairing below.
delete process.env['MOLE_OFFICE_DEVELOPMENT_CHECKOUT']

/**
 * `env` with the pairing put back, for a tool of this checkout that reads the office's key. It is the one helper's call
 * for this checkout's own code (src/config/the-office-tool-environment.mjs), so the merge tool works the pairing out in
 * the same place as every other starter of an office tool. An office that does not run paired gives none, and then
 * nothing here changes anything.
 * @param {Record<string, string | undefined>} env
 */
export function withThePairing(env) {
  return theOfficeToolEnvironment(env, REPO_ROOT).env
}

const HERE = dirname(fileURLToPath(import.meta.url))
/** The checkout this tool was loaded from: its tools/checks are the trusted copy the guards run from. */
export const THIS_CHECKOUT = resolve(HERE, '..', '..')

/** The office's own configuration, built once from this checkout and the office's commit address. */
export const THE_OFFICE_CONFIGURATION = theOfficeConfiguration({
  repository: THIS_CHECKOUT,
  commitEmail: settingValue('MOLE_OFFICE_COMMIT_EMAIL'),
})

/** The two gate positions a landing reads from the settings, read when they are called. */
export const THE_LANDING_GATE_READS = Object.freeze({
  wholeSuiteFixRoundIsOn: () => wholeSuiteFixRoundIsOn(),
  pluginPagesPosition: () => pluginPagesPosition(),
})

/** The six integration reads pinGit and integrateGit take from their caller, read when they are called. */
export const THE_INTEGRATION_READS = Object.freeze({
  pinnedCommitPosition: () => pinnedCommitPosition(),
  resolutionRefPosition: () => resolutionRefPosition(),
  ownerContentPosition: () => ownerContentPosition(),
  placeholderAddressesPosition: () => placeholderAddressesPosition(),
  integratedBuildPosition: () => integratedBuildPosition(),
  commitAddressFallback: () => settingNamed('MOLE_OFFICE_COMMIT_EMAIL').fallback,
})

/** The three suite-workers reads theSuiteWorkers takes from its caller, read when they are called. */
export const THE_SUITE_WORKERS_READS = Object.freeze({
  given: () => settingValue('MOLE_OFFICE_MERGE_WORKERS'),
  fallback: () => settingNamed('MOLE_OFFICE_MERGE_WORKERS').fallback,
  bounds: MERGE_WORKERS_BOUNDS,
})

/**
 * The bus's settings and switch as the bus takes them from its caller, each read when it is called: its two numbers
 * and their bounds, and whether the queue's own code may ride.
 */
export const THE_BUS_READS = Object.freeze({
  mostEntries: Object.freeze({
    given: () => settingValue('MOLE_OFFICE_BUS_MOST_ENTRIES'),
    fallback: () => settingNamed('MOLE_OFFICE_BUS_MOST_ENTRIES').fallback,
  }),
  leavesAfterSeconds: Object.freeze({
    given: () => settingValue('MOLE_OFFICE_BUS_LEAVES_AFTER_SECONDS'),
    fallback: () => settingNamed('MOLE_OFFICE_BUS_LEAVES_AFTER_SECONDS').fallback,
  }),
  bounds: BUS_ENTRIES_BOUNDS,
  queueCodeRidesABus: () => queueCodeRidesABus(),
})

const THE_WORKER = 'mole-office/the-message-worker'
export const PINNED_REF_PREFIX = 'refs/mole-office/queue/'
/** Where Mole Office keeps its migrations. A landed commit that touches it is followed by `npm run db:migrate`. */
export const MIGRATIONS_FOLDER = THE_OFFICE_CONFIGURATION.land.after[0].whenAPathIsUnder
/** How long one generator or npm script may run before its process group is stopped. */
export const SCRIPT_TIMEOUT_MS = 15 * 60 * 1000
/** Single-file re-runs have their own total and no-output limits. */
export const RERUN_LIMITS = Object.freeze({ timeoutMs: 15 * 60 * 1000, idleTimeoutMs: 10 * 60 * 1000 })
export const SUITE_TIMEOUT_MS = 3 * 60 * 60 * 1000
/**
 * The git identity this tool commits and rebases under: its own name, and the office's one commit
 * address, MOLE_OFFICE_COMMIT_EMAIL (the owner's rule of 22 September 2026). It was
 * merge-queue@mole-office.invalid until then. Both come from the office configuration's commitAs.
 */
export const GIT_IDENTITY = theGitIdentityOf(THE_OFFICE_CONFIGURATION)

// ============================================================================ arguments

function usage(why) {
  if (why !== '') process.stderr.write(`${why}\n\n`)
  process.stderr.write(
    [
      'node tools/the-merger.mjs --entry <merge entry id> --session <tool session id> \\',
      '    [--api <url>] [--workspace <project>] [--as <actor id>] [--workdir <dir>] \\',
      '    [--slot-every <s>] [--slot-for <s>] [--health-for <s>] [--office-for <s>] \\',
      '    [--sandbox-template <name>] [--sandboxes <dir>] [--room-every <s>] [--pin-only | --check-resolution]',
      '',
      'node tools/the-merger.mjs --take-back <problem> --session <check run> --api <url> --workspace <project> [--sandboxes <dir>]',
      '',
      'node tools/the-merger.mjs --emergency-push <commit> --root <main checkout> --message <message id>:<content hash> \\',
      '    --as <your handle> --session <your run> [--line <supervisor handle>] [--api <url>] [--workspace <project>] [--sandboxes <dir>]',
      '    with MOLE_AGENT_KEY set: pushes one commit straight to main while the emergency switch is on. --line names the',
      '    supervisor of the line whose branch the fix came from; a red follow-up in a file the push changed goes back there.',
      '',
      'Carries one merge entry through the queue, step by step, and reports each step to the office,',
      'which decides the next state. Runs no model. Exit 0 when every step it could take was taken;',
      '1 when it could not go on (the reason is printed); 2 for a usage error.',
    ].join('\n') + '\n',
  )
  process.exit(2)
}

function readArguments(argv) {
  const chosen = {
    takeBack: null,
    emergencyPush: null,
    root: null,
    message: null,
    line: null,
    entry: null,
    session: null,
    api: null,
    workspace: null,
    as: THE_WORKER,
    workdir: null,
    slotEvery: 10,
    slotFor: 4 * 60 * 60,
    healthFor: 300,
    officeFor: 300,
    sandboxTemplate: 'mole-office-dev',
    sandboxes: SANDBOXES_FOLDER,
    sandboxTool: null,
    modalRunner: null,
    roomEvery: 60,
    pinOnly: false,
    checkResolution: false,
  }
  const seconds = (word, value) => {
    const n = Number(value)
    if (!Number.isFinite(n) || n < 0) usage(`${word} takes a number of seconds, not ${JSON.stringify(value)}.`)
    return n
  }
  /** EVERY FLAG THAT TAKES A VALUE, and what it does with it. One table, so the refusal below reads the same list. */
  const takes = {
    '--take-back': (value) => { chosen.takeBack = value },
    '--emergency-push': (value) => { chosen.emergencyPush = value },
    '--root': (value) => { chosen.root = resolve(value) },
    '--message': (value) => { chosen.message = value },
    '--line': (value) => { chosen.line = value },
    '--entry': (value) => { chosen.entry = value },
    '--session': (value) => { chosen.session = value },
    '--api': (value) => { chosen.api = value },
    '--workspace': (value) => { chosen.workspace = value },
    '--as': (value) => { chosen.as = value },
    '--workdir': (value) => { chosen.workdir = resolve(value) },
    '--slot-every': (value) => { chosen.slotEvery = seconds('--slot-every', value) },
    '--slot-for': (value) => { chosen.slotFor = seconds('--slot-for', value) },
    '--health-for': (value) => { chosen.healthFor = seconds('--health-for', value) },
    '--office-for': (value) => { chosen.officeFor = seconds('--office-for', value) },
    '--sandbox-template': (value) => { chosen.sandboxTemplate = value },
    '--sandboxes': (value) => { chosen.sandboxes = resolve(value) },
    '--sandbox-tool': (value) => { chosen.sandboxTool = resolve(value) },
    '--modal-runner': (value) => { chosen.modalRunner = resolve(value) },
    '--room-every': (value) => { chosen.roomEvery = seconds('--room-every', value) },
  }
  const HELP = ['--help', '-h']
  for (let i = 0; i < argv.length; i += 1) {
    const word = argv[i]
    if (HELP.includes(word)) usage('')
    else if (word === '--pin-only') chosen.pinOnly = true
    else if (word === '--check-resolution') chosen.checkResolution = true
    else if (Object.hasOwn(takes, word)) {
      // A RECORD ID MAY BEGIN WITH DASHES. Acceptance finding 49 (the acceptance report, block f-49): an id is
      // 12 characters of A-Za-z0-9_-, and one in 4,096 begins with `--`, which this refused as a missing
      // value, so a real session record could not start the tool. A value is refused only when there is
      // none, or when it is itself one of this tool's flags, which is what a forgotten value looks like.
      const value = argv[i + 1]
      if (value === undefined || Object.hasOwn(takes, value) || HELP.includes(value)) usage(`${word} needs a value.`)
      takes[word](value)
      i += 1
    } else usage(`Unknown argument ${word}.`)
  }
  if (chosen.pinOnly && chosen.checkResolution) usage('--pin-only and --check-resolution are two runs: one pins a submitted entry, the other checks a resolving entry\'s resolution.')
  if (chosen.emergencyPush !== null) {
    if (chosen.entry !== null || chosen.takeBack !== null || chosen.pinOnly || chosen.checkResolution) usage('--emergency-push excludes --entry, --take-back, --pin-only and --check-resolution.')
    if (chosen.root === null) usage('--emergency-push requires --root: the main checkout whose main it moves.')
    if (chosen.message === null || !/^[^:]+:[^:]+$/u.test(chosen.message)) usage('--emergency-push requires --message <message id>:<content hash>: the chat message that told the owner which commit goes to main.')
    if (chosen.as === THE_WORKER) usage('--emergency-push requires --as: the push names who pushed, so it is asked under your own handle, with MOLE_AGENT_KEY set.')
    if (chosen.session === null) usage('--emergency-push requires --session: the run you push from.')
    chosen.workdir ??= join(chosen.sandboxes, 'emergency-pushes', encodeURIComponent(chosen.emergencyPush))
    return chosen
  }
  if (chosen.root !== null || chosen.message !== null || chosen.line !== null) usage('--root, --message and --line belong to --emergency-push.')
  if (chosen.takeBack !== null) {
    if (chosen.entry !== null || chosen.pinOnly || chosen.checkResolution) usage('--take-back excludes --entry, --pin-only and --check-resolution.')
    if (chosen.session === null) usage('--take-back requires --session: the run checking its files on main.')
    chosen.workdir ??= join(chosen.sandboxes, 'take-backs', encodeURIComponent(chosen.takeBack))
    return chosen
  }
  if (chosen.entry === null) usage('--entry is required: which merge entry to carry.')
  if (chosen.session === null) usage("--session is required: this tool run's session record, whose runtime is merge-tool.")
  if (chosen.workdir === null) chosen.workdir = join(homedir(), '.cache', 'mole-office', 'merge-queue', chosen.entry)
  return chosen
}

export const chosen = readArguments(process.argv.slice(2))
export const API = whereIsTheApi(chosen.api ?? undefined).replace(/\/+$/u, '')
export const WORKSPACE = whichWorkspace(chosen.workspace ?? undefined)
export const WORKDIR = chosen.workdir
mkdirSync(WORKDIR, { recursive: true })
export const LOG = join(WORKDIR, 'the-merger.log')
/** The runner of named tests on a Modal VM, which the second opinion calls. */
export const THE_REAL_MODAL_RUNNER = join(THIS_CHECKOUT, 'tools', 'modal-tests.mjs')
/** The runner this run calls: the real one, or a stand-in a test names with --modal-runner. */
export const MODAL_RUNNER = chosen.modalRunner ?? THE_REAL_MODAL_RUNNER
/** The setting the second opinion's month cap is read from. */
const THE_MODAL_CAP_SETTING = 'MOLE_OFFICE_MODAL_MONTHLY_CAP_USD'
/** Builds what the second opinion takes from the Modal runner, reading the two settings with `read` when they are called, and a test passes its own reader. */
export function theModalParts(read = settingValue) {
  return Object.freeze({
    VM_CHECKOUT,
    VM_DEFAULTS,
    VM_SANDBOX_GRACE_SECONDS,
    estimateUSD,
    readMonthReceipts,
    receiptsFile,
    validateToken,
    executable,
    runnerFiles: () => modalRunnerFiles(read),
    capAsWritten: () => read(THE_MODAL_CAP_SETTING),
    capSetting: THE_MODAL_CAP_SETTING,
  })
}
/**
 * What the second opinion takes from the Modal runner: its checkout, resource limits, costs, receipts, the two checks on
 * its files and its own files, and the two settings reads. runnerFiles and capAsWritten read their settings when they
 * are called, as the second opinion read them at the moment of use.
 */
export const THE_MODAL_PARTS = theModalParts()
export const STATE_FILE = join(WORKDIR, 'state.json')
/** One line per step reported: the facts the office was sent, and what else the tool measured. */
export const STEPS_FILE = join(WORKDIR, 'steps.jsonl')
/** The word the step door reads for a path with no file: a delete, or a path the change removed. */
export const ABSENT = 'absent'
/**
 * THE OWNER-CONTENT GATE'S PATTERNS, made from the file of the owner's content, which an office setting names. The merge
 * tool reads the office settings only here and in office-keeper.mjs, so integrate.mjs takes the patterns from here and
 * gives them to the gate. Their module is loaded only when this is called, at an entry's turn, because the lists it
 * reads would cost every other step of the tool about 0.2 s at its start.
 * @returns {Promise<readonly import('./owner-content.mjs').APattern[]>}
 */
export async function theOwnerContentPatterns() {
  return (await import('../../tests/the-owners-content-patterns.ts')).THE_PATTERNS
}
