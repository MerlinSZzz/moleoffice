// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * Inspector lifecycle on the host, with a private container view for each check command.
 * Canonical problem LK3azJXuPImf; accepted launcher handback sPfsDN1Fy-_k.
 *
 * The shared instance supplies the image. The checkout, the empty command that tries the view, and
 * the MODEL each request the supported --check-view contract, with one independent work copy and
 * native home under check-views/<check>/. Nothing is built: the merge queue builds. Records,
 * measured prompt and command scripts are controller inputs mounted read-only. Shared metadata,
 * other checks, submitted repositories and Office data are not mounted into the command view.
 *
 * The host launcher registers the command and view, captures evidence outside all mounts, enforces
 * the clock and writes a receipt after cleanup. This module validates that receipt before consuming
 * output. It never falls back to ordinary exec and never repeats successful controller cleanup.
 *
 * Login seeds are read-only files. Claude's seed omits the host refresh token; private refreshed
 * native state is reused only by the same check. Codex may seed from the instance's native login.
 * Successful delivery removes only this check's resources, after its work-copy removal guard.
 * A failed check or refused removal retains private state and controller evidence.
 */

import { spawn, spawnSync } from 'node:child_process'
import { chmodSync, closeSync, constants, copyFileSync, existsSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { createHash } from 'node:crypto'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { CHECK_VIEW_LABEL, INSTANCE_FILE, readHostInstance, readCheckView, prepareOpenCodeRunHome, SANDBOXES_FOLDER, stillThere, theCheckoutAMirrorCloneCameFrom, theCheckoutAnOlderCloneCameFrom, takeOutTheOfficesVariables, THE_CHECKS_FOLDER, THE_KEYS_A_MODEL_NEVER_GETS, theDeclaredSecrets, thisProcess } from './sandbox-common.mjs'
import { theProcessesNotRead, theProcessesUsing } from './scratch-folder-checks.mjs'
import { fastForwardInside, guardedGit, guardedGitRun, outsideTheCommitInLines, theAddressGitWouldFetch } from './sandbox-git.mjs'
import { FULL_PERMISSIONS, aCodexContainerCommand } from '../src/config/run-permissions.mjs'
import { spoolAGateMet } from '../src/config/gate-count-spool.mjs'
import { THE_DEVELOPMENT_CHECKOUT } from '../src/config/settings.mjs'
import { theProviderRouterIsOn } from '../src/config/provider-router.mjs'
import { theLoginFilesOfACheckHome, whyAStartIsRefusedForTheLoginFiles } from './key-router/login-files.mjs'
import { aCodexRunHasNoKeyThroughTheRouter } from './provider-router-host.mjs'
import { aCheckCommand, THE_CHECKOUT_COMMAND } from '../src/config/inspection-ending.mjs'
import { localStamp } from '../src/shared/time.ts'
import { OPENCODE_OUTPUT_CAP } from './opencode-output-cap.mjs'
import { HOW_EACH_COMMAND_TAKES_AN_EFFORT } from '../src/config/how-a-command-takes-an-effort.mjs'
import { THE_DSH_ACP_EFFORT_OPTION } from './inspector-dsh-acp.mjs'
import { anOpenCodeConfigWithTheFeaturesOff } from './harness-features-off.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const THE_LAUNCHER = join(HERE, 'sandbox.mjs')
/** The checkout this tool runs from, whose main a sandbox's own clone is brought up to. */
const THIS_CHECKOUT = dirname(HERE)

/** The template the inspector's sandbox is made from. */
export const THE_INSPECTORS_TEMPLATE = 'mole-office-dev'

/**
 * The launcher's Claude full-permission form, retained for callers that import it.
 * The inspector selects the shared full-permission form inside its container and reading permissions on the host.
 */
export const CLAUDE_FULL_PERMISSIONS = FULL_PERMISSIONS['claude-code'].args

/**
 * The private native configuration passed on the actual model array inside the protected wrapper. Its config content
 * turns OpenCode's own task tool off (tools/harness-features-off.mjs), so the exact check below refuses a check's
 * OpenCode command that does not.
 */
export const OPENCODE_CHECK_ENV = Object.freeze({ ...FULL_PERMISSIONS.opencode.env,
  OPENCODE_DISABLE_PROJECT_CONFIG: '1', OPENCODE_CONFIG: '/check/home/.config/opencode/opencode.json',
  OPENCODE_CONFIG_DIR: '/check/home/.config/opencode', OPENCODE_CONFIG_CONTENT: anOpenCodeConfigWithTheFeaturesOff('{}'),
  // UP TO 64,000 OUTPUT TOKENS A STEP, as every OpenCode command the launcher starts asks for (tools/opencode-output-cap.mjs).
  ...OPENCODE_OUTPUT_CAP,
  XDG_STATE_HOME: '/check/home/.local/state' })

/** Only these two explicitly supported check providers select a declared secret; the model stays verbatim. */
const OPENCODE_CHECK_KEYS = Object.freeze({ 'opencode-go': 'OPENCODE_API_KEY', deepseek: 'DEEPSEEK_API_KEY' })
function theOpenCodeKey(model) {
  const provider = typeof model === 'string' && model.split('/')[0] ? model.split('/')[0] : '(missing)'
  if (typeof model !== 'string' || model.indexOf('/') < 1 || model.slice(model.indexOf('/') + 1).trim() === '' ||
      !Object.hasOwn(OPENCODE_CHECK_KEYS, provider)) throw new Error(`No key is mapped for provider ${provider} in an OpenCode check.`)
  return OPENCODE_CHECK_KEYS[provider]
}

/** Check only the direct native stdin array this inspector emits, before any protected wrapper is written. */
function theCheckedOpenCodeModel(argv) {
  const fail = () => { throw new Error('The OpenCode native command array must carry the shared full permissions, private configuration and standalone --pure; no model was started.') }
  if (!Array.isArray(argv) || argv.some(word => typeof word !== 'string') || argv[0] !== 'env') fail()
  const env = Object.create(null); let at = 1
  while (/^[A-Za-z_][A-Za-z0-9_]*=/.test(argv[at] ?? '')) {
    const split = argv[at].indexOf('='), key = argv[at].slice(0, split)
    if (Object.hasOwn(env, key)) fail()
    env[key] = argv[at++].slice(split + 1)
  }
  if (Object.keys(env).length !== Object.keys(OPENCODE_CHECK_ENV).length ||
      Object.entries(OPENCODE_CHECK_ENV).some(([key, value]) => env[key] !== value)) fail()
  const native = argv.slice(at), prefix = ['opencode', 'run', '--format', 'json', '--dir', '/work', '-m']
  if (!prefix.every((word, index) => native[index] === word) || typeof native[7] !== 'string' || native[7].trim() === '' || native[8] !== '--pure') fail()
  let next = 9
  if (native[next] === '--session') {
    if (!/^ses_[A-Za-z0-9]+$/.test(native[next + 1] ?? '')) fail()
    next += 2
  }
  const effortOption = HOW_EACH_COMMAND_TAKES_AN_EFFORT.opencode?.option ?? null
  if (effortOption !== null && native[next] === effortOption) {
    if (typeof native[next + 1] !== 'string' || native[next + 1].trim() === '' || native[next + 1].startsWith('-')) fail()
    next += 2
  }
  if (native[next] !== '--' || next !== native.length - 1) fail()
  return native[7]
}

/**
 * The DSH check's native configuration, from uVlfyTGEjhbq: the shared full permissions, with which dsh asks nobody
 * (its base profile reads DSH_PERMISSION_MODE), and DSH_HOME named inside the check's private home, so where dsh keeps its
 * state does not rest on dsh's default.
 */
export const DSH_CHECK_ENV = Object.freeze({ ...FULL_PERMISSIONS.dsh.env, DSH_HOME: '/check/home/.dsh' })

/** The one key a DSH check gets, by the provider theDshSelection maps the Office model to; never the Claude token (uVlfyTGEjhbq). */
const DSH_CHECK_KEYS = Object.freeze({ 'deepseek-official': 'DEEPSEEK_API_KEY' })
function theDshKey(provider) {
  if (!Object.hasOwn(DSH_CHECK_KEYS, provider)) throw new Error(`No key is mapped for provider ${provider} in a DSH check.`)
  return DSH_CHECK_KEYS[provider]
}
/** Where dsh sends its model requests, by the same native provider: the variable dsh reads its base address from. */
const DSH_CHECK_BASE_ADDRESSES = Object.freeze({ 'deepseek-official': 'DEEPSEEK_BASE_URL' })

/**
 * THE TWO VARIABLES A DSH CHECK WHOSE CASTING ROW NAMES A PROVIDER ROW IS HANDED, by its native provider: the key's and the
 * base address's. src/config/the-launchers-own-settings.mjs names both as the launcher's own, so a row's settings
 * cannot set them.
 * @param {string} provider @returns {{key: string, baseAddress: string}}
 */
export function theDshProviderVariables(provider) {
  const key = theDshKey(provider)
  if (!Object.hasOwn(DSH_CHECK_BASE_ADDRESSES, provider)) throw new Error(`No base address variable is mapped for provider ${provider} in a DSH check.`)
  return { key, baseAddress: DSH_CHECK_BASE_ADDRESSES[provider] }
}

/**
 * THE MODEL PROVIDER A CODEX CHECK WHOSE CASTING ROW NAMES A PROVIDER ROW IS STARTED ON, under Codex's model_providers.
 * Codex 0.159.2 refuses to redefine its built-in ids (openai, ollama, lmstudio), so this is none of them.
 */
export const THE_CODEX_PROVIDER_ID = 'mole-office-provider-row'

/**
 * THE TWO VARIABLES SUCH A CODEX CHECK IS HANDED: the key's, which model_providers.<id>.env_key names so Codex reads that
 * one variable alone, and the base address's, which the launcher judges the address by (tools/sandbox.mjs reads a
 * *_BASE_URL line). Neither is a name Codex reads of its own. src/config/the-launchers-own-settings.mjs names both as the
 * launcher's own, so a row's settings cannot set them.
 */
export const THE_CODEX_PROVIDER_VARIABLES = Object.freeze({ key: 'PROVIDER_ROW_API_KEY', baseAddress: 'PROVIDER_ROW_BASE_URL' })

/**
 * EVERY VARIABLE A CODEX CHECK'S SHELL LEAVES OUT of the commands it runs, as one list. A -c of
 * shell_environment_policy.exclude replaces any configured list, so this one names the run's key too, as
 * aCommandsOfficeTool in src/config/run-permissions.mjs asks of any other list. A command can still read the key in
 * /proc/<pid>/environ of the processes above it.
 */
export const WHAT_A_CODEX_CHECKS_SHELL_LEAVES_OUT = Object.freeze(['MOLE_AGENT_KEY', THE_CODEX_PROVIDER_VARIABLES.key])

/**
 * THE -c OPTIONS THAT START A CODEX CHECK ON A PROVIDER ROW, made from the row's base address: model_provider names
 * THE_CODEX_PROVIDER_ID, whose name, base_url, env_key and wire_api are given, and the shell leaves out
 * WHAT_A_CODEX_CHECKS_SHELL_LEAVES_OUT. Codex 0.159.2 refuses a provider without a name, goes to its own default without
 * a base_url, sends no key without an env_key, and refuses wire_api "chat". Each value is written as a TOML string.
 * runInside refuses a command handed the provider's key that does not carry these options exactly.
 * @param {string} baseAddress @returns {string[]}
 */
export function theCodexProviderOptions(baseAddress) {
  const at = `model_providers.${THE_CODEX_PROVIDER_ID}`
  return [`model_provider=${JSON.stringify(THE_CODEX_PROVIDER_ID)}`, `${at}.name=${JSON.stringify(THE_CODEX_PROVIDER_ID)}`,
    `${at}.base_url=${JSON.stringify(baseAddress)}`, `${at}.env_key=${JSON.stringify(THE_CODEX_PROVIDER_VARIABLES.key)}`,
    `${at}.wire_api="responses"`, `shell_environment_policy.exclude=${JSON.stringify(WHAT_A_CODEX_CHECKS_SHELL_LEAVES_OUT)}`]
    .flatMap(option => ['-c', option])
}

/** The names, before an option's `=`, of the settings that choose a Codex command's model provider or its shell's environment. */
const A_CODEX_PROVIDERS_SETTINGS = /^(model_provider|model_providers|shell_environment_policy)(\.|$)/

/**
 * Does a Codex command carry theCodexProviderOptions(baseAddress), and no other -c that chooses a model provider or the
 * shell's environment? The options are read up to `--`, as -c, -c<value>, --config and --config=<value>.
 * @param {string[]} argv @param {string} baseAddress @returns {boolean}
 */
function aCodexCommandIsToldTheProvider(argv, baseAddress) {
  const told = []
  const end = argv.indexOf('--') < 0 ? argv.length : argv.indexOf('--')
  for (let i = 0; i < end; i++) {
    const word = argv[i]
    const value = word === '-c' || word === '--config' ? argv[++i] : word.startsWith('--config=') ? word.slice('--config='.length)
      : word.startsWith('-c') && word.length > 2 ? word.slice(2) : null
    if (typeof value === 'string' && A_CODEX_PROVIDERS_SETTINGS.test(value.split('=', 1)[0].trim())) told.push(value)
  }
  return JSON.stringify(told) === JSON.stringify(theCodexProviderOptions(baseAddress).filter((_, i) => i % 2 === 1))
}

/**
 * THE TWO VARIABLES A CHECK WHOSE ROW NAMES A PROVIDER ROW IS HANDED, by its program: Codex's own pair, or dsh's by its
 * native provider.
 * @param {{program?: string, native?: string | null}} providerKey @returns {{key: string, baseAddress: string}}
 */
function theProviderVariablesOf(providerKey) {
  return providerKey.program === 'codex' ? THE_CODEX_PROVIDER_VARIABLES : theDshProviderVariables(String(providerKey.native))
}

/**
 * THE FILE A CHECK'S PROVIDER KEY IS HANDED TO THE LAUNCHER IN, one per check, in the inspector's own folder for the
 * instance (THE_CHECKS_FOLDER), which sits beside the instances and is mounted in no view. A check runs one command at
 * a time, so one file is enough. It is removed by the launcher's controller as soon as it is read, before the container
 * starts; by runInside when the launcher ends; by leaveTheSandbox when the check ends; and by theChecksStillUsingIt once
 * the check that wrote it is gone, so a check that died leaves none behind for long.
 */
function theProviderKeyFileOf(hostOnly, check) {
  return join(hostOnly, 'handed', `${check}.env`)
}

/**
 * WHAT A DSH OR CODEX CHECK WHOSE ROW NAMES A PROVIDER ROW IS HANDED: its key alone, under the variable the program reads
 * it from. The masking reads it from here, so it masks what runInside hands.
 * @param {{value: string, native?: string | null, program?: string}} providerKey @returns {{name: string, value: string}[]}
 */
export function theProviderKeyHanded(providerKey) {
  return [{ name: theProviderVariablesOf(providerKey).key, value: providerKey.value }]
}

/**
 * THE PROVIDER KEY FILE, written for one command: the key's line and the base address's, under umask 077, in a folder of
 * mode 0700, as a new file of mode 0600 that may not replace anything. A file left by this check before is removed first.
 * The value is never on an argument list or in an environment: only the file's path is passed (runInside), with its
 * folder's real path, because the launcher refuses a path whose folder is reached through a link.
 * @param {{hostOnly: string, asked: {check: string}}} sandbox @param {{value: string, baseAddress: string, native?: string | null, program?: string}} providerKey
 */
function aProviderKeyFile(sandbox, providerKey) {
  const names = theProviderVariablesOf(providerKey)
  const file = theProviderKeyFileOf(sandbox.hostOnly, sandbox.asked.check)
  const umask = process.umask(0o077)
  try {
    mkdirSync(dirname(file), { recursive: true, mode: 0o700 })
    chmodSync(dirname(file), 0o700)
    rmSync(file, { force: true })
    const fd = openSync(file, 'wx', 0o600)
    try {
      writeFileSync(fd, `${names.key}=${providerKey.value}\n${names.baseAddress}=${providerKey.baseAddress}\n`)
    } finally {
      closeSync(fd)
    }
  } finally {
    process.umask(umask)
  }
  return join(realpathSync(dirname(file)), basename(file))
}

/** The ACP client the inspector copies into the check's commands folder. */
export const DSH_ACP_CLIENT = '/inputs/commands/inspector-dsh-acp.mjs'

/**
 * THE COMMAND OF A DSH CHECK, which theCheckedDshRoute below checks: the inspector's ACP client, on the provider and
 * model given, at the effort given where there is one, resuming the session `resume` where one is named.
 * @param {{ provider: string, model: string, effort?: string | null, resume?: string | null }} choices
 */
export function theDshCheckCommand({ provider, model, effort = null, resume = null }) {
  return ['node', DSH_ACP_CLIENT, '--provider', provider, '--model', model,
    ...(effort === null ? [] : [THE_DSH_ACP_EFFORT_OPTION, effort]), ...(resume === null ? [] : ['--resume', resume])]
}

/** A command run with `env` set: `env` and each NAME=value before it, where `env` names any. */
export function aCommandWithItsEnv(env, command) {
  return [...(Object.keys(env).length === 0 ? [] : ['env', ...Object.entries(env).map(([key, value]) => `${key}=${value}`)]), ...command]
}

/**
 * THE INSPECTOR'S OWN CLIENT, from beside this file and never from a checkout, is what the view runs: the client is
 * copied alone into the check's commands folder, because it imports node's own modules only. Each old copy is removed
 * first and the new one may not replace anything, so a copy left read-only by an earlier start, or a link put in its
 * place, is never written through. The copy is read-only, so nothing changes it in place.
 */
export function copyTheDshClient(commands) {
  const copy = join(commands, 'inspector-dsh-acp.mjs')
  rmSync(copy, { force: true })
  copyFileSync(fileURLToPath(new URL('./inspector-dsh-acp.mjs', import.meta.url)), copy, constants.COPYFILE_EXCL)
  chmodSync(copy, 0o444)
}

/** Check only the ACP client array this inspector emits for DSH, before any protected wrapper is written. */
function theCheckedDshRoute(argv) {
  const fail = () => { throw new Error("The DSH native command array must carry the shared full permissions, DSH_HOME inside the check's private home, and the ACP client's arguments; no model was started.") }
  if (!Array.isArray(argv) || argv.some(word => typeof word !== 'string') || argv[0] !== 'env') fail()
  const env = Object.create(null); let at = 1
  while (/^[A-Za-z_][A-Za-z0-9_]*=/.test(argv[at] ?? '')) {
    const split = argv[at].indexOf('='), key = argv[at].slice(0, split)
    if (Object.hasOwn(env, key)) fail()
    env[key] = argv[at++].slice(split + 1)
  }
  if (Object.keys(env).length !== Object.keys(DSH_CHECK_ENV).length ||
      Object.entries(DSH_CHECK_ENV).some(([key, value]) => env[key] !== value)) fail()
  const native = argv.slice(at), given = word => typeof word === 'string' && word !== '' && !word.startsWith('-')
  if (native[0] !== 'node' || native[1] !== DSH_ACP_CLIENT || native[2] !== '--provider' || !given(native[3]) ||
      native[4] !== '--model' || !given(native[5])) fail()
  let next = 6
  if (native[next] === THE_DSH_ACP_EFFORT_OPTION) {
    if (!given(native[next + 1])) fail()
    next += 2
  }
  if (native[next] === '--resume') {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(native[next + 1] ?? '')) fail()
    next += 2
  }
  if (next !== native.length) fail()
  return { provider: native[3], model: native[5] }
}

/** Why a DSH check starts no model where `folder`, its DSH_HOME on the host side, is a link or not a folder. */
export function aDshHomeThatCannotBeKept(folder, isALink) {
  return `${folder} is ${isALink ? 'a link' : 'not a folder'}, so DSH's native state cannot be kept in this check's private home; no model was started.`
}

/**
 * DSH_HOME on the host side: <check home>/.dsh, made a private folder before the launcher runs. A link or a file there is
 * refused rather than followed, so dsh's state never lands outside the check's private home.
 */
function aPrivateDshHome(home) {
  const folder = join(home, '.dsh')
  const held = lstatSync(folder, { throwIfNoEntry: false })
  if (held !== undefined && (held.isSymbolicLink() || !held.isDirectory())) {
    throw new Error(aDshHomeThatCannotBeKept(folder, held.isSymbolicLink()))
  }
  mkdirSync(folder, { recursive: true, mode: 0o700 })
  chmodSync(folder, 0o700)
}

/** What a dsh check says when the profiles an earlier call made are removed before this call's view is read. */
export const THE_DSH_PROFILES_OF_AN_EARLIER_CALL_WERE_REMOVED = "The profiles DSH made in an earlier call of this check were removed, neither carried into this view nor followed, so this call's view is read as the first call's was; DSH makes them again when it starts."

/**
 * DSH'S OWN PROFILES FROM AN EARLIER CALL OF THIS CHECK are removed whole before this call's view is read, so this call's
 * view is read as the first call's was; DSH makes them again when it starts. It reads <check home>/.dsh and
 * <check home>/.dsh/profiles with lstat, and removes only <check home>/.dsh/profiles. A .dsh that is a link or a file, or a
 * profiles that is a link or a file, is left exactly as it is, so nothing is removed through a link. Every other name in
 * .dsh, whichever name DSH keeps a session under included, is kept. The removal is safe because those files are DSH's own,
 * built from its installation at each start, and none of them is the check's work or its session.
 * @param {string} home @param {{say: (sentence: string) => void}} asked @returns {boolean}
 */
function removeTheDshProfilesOfAnEarlierCall(home, asked) {
  const dsh = join(home, '.dsh')
  const dshHeld = lstatSync(dsh, { throwIfNoEntry: false })
  if (dshHeld === undefined || dshHeld.isSymbolicLink() || !dshHeld.isDirectory()) return false
  const profiles = join(dsh, 'profiles')
  const profilesHeld = lstatSync(profiles, { throwIfNoEntry: false })
  if (profilesHeld === undefined || profilesHeld.isSymbolicLink() || !profilesHeld.isDirectory()) return false
  rmSync(profiles, { recursive: true })
  asked.say(THE_DSH_PROFILES_OF_AN_EARLIER_CALL_WERE_REMOVED)
  return true
}

/** The environment variable that signs Claude Code in with a long-lived token (`claude setup-token`). */
const THE_TOKEN = 'CLAUDE_CODE_OAUTH_TOKEN'
/** How much longer than the check's own limit a copied login must still be good for. */
const LOGIN_MARGIN_MS = 5 * 60_000
/** How long a check waits for another check of the same inspector to finish starting the container. */
const LOCK_WAIT_MS = 45 * 60_000
/** How long a check that is leaving waits for that lock before it leaves the container as it is. */
const LOCK_WAIT_LEAVING_MS = 30_000
/** How long `sandbox.mjs up` may take: the first start builds the template's image. */
const UP_MS = 45 * 60_000
/** How long any other launcher command may take. */
const LAUNCHER_MS = 3 * 60_000
/** The label of the empty command a check runs before its model, and how long that command may take. */
const TRY_THE_VIEW = 'try-the-view'
const TRY_THE_VIEW_MS = 60_000
/**
 * THE LABEL OF A STANDARD CHANGE'S OWN CHECK BEGINS WITH THIS (tools/standard-change.mjs). Such a check runs the code under
 * check and never a model, so it is handed no secret and no login.
 */
export const A_STANDARD_CHECK = 'standard-'

const sleep = (ms) => new Promise((done) => setTimeout(done, ms))
function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

/** Is `inner` the folder `outer` or somewhere inside it? */
function within(inner, outer) {
  const r = relative(outer, inner)
  return r === '' || (!r.startsWith('..') && !isAbsolute(r))
}

/** A value for a POSIX shell, in single quotes. */
function quoted(text) {
  return `'${String(text).replace(/'/g, `'\\''`)}'`
}

/** The last non-empty line of a program's output, read as JSON, or null. */
function lastJsonLine(text) {
  const line = String(text).trim().split('\n').pop() ?? ''
  try {
    return JSON.parse(line)
  } catch {
    return null
  }
}

/** The last lines of what a program said, for a refusal. */
function theEndOf(text, lines = 12) {
  return String(text).trim().split('\n').slice(-lines).join('\n')
}

/**
 * THE INSTANCE NAME FOR AN INSPECTOR: `inspector-<handle>`. A handle is lowercase letters, digits and
 * hyphens, up to 40 characters, and an instance name is at most 40; a handle too long to fit keeps
 * its first 21 characters and gains eight of its own sha256, so two long handles never share one.
 */
export function theInspectorsInstance(handle) {
  const name = `inspector-${handle}`
  if (/^[a-z0-9][a-z0-9-]{0,39}$/.test(name)) return name
  if (!/^[a-z0-9-]+$/.test(handle)) {
    throw new Error(`The inspector's handle "${handle}" is not a handle (lowercase letters, digits and hyphens), so it names no sandbox.`)
  }
  const hash = createHash('sha256').update(handle).digest('hex').slice(0, 8)
  return `inspector-${handle.slice(0, 21)}-${hash}`
}

// ============================================================================ the launcher

/**
 * THE OFFICE'S OWN KEY FOR WHAT THIS CHECK WRITES FROM THE HOST, as MOLE_AGENT_KEY for a launcher it starts, or nothing
 * when it was given none (problem D2xgnX8nFixv). The owner closed the key window on 27 September 2026, and from then on
 * the office refuses every write with no key: the container's ledger row, each command's process row, their release,
 * and the sandbox's stop. The inspector's verdict writes already sent this key; its sandbox's calls sent none. It goes
 * to the launcher's environment on the host only, never onto a command line, and tools/sandbox.mjs never passes
 * MOLE_AGENT_KEY into a container. `asked.officeKey` is a function, read per call, so the key is never a value anything
 * could print or write down.
 */
function theKeyOnTheHost(asked) {
  const key = typeof asked.officeKey === 'function' ? asked.officeKey() : null
  return typeof key === 'string' && key !== '' ? { MOLE_AGENT_KEY: key } : {}
}

/**
 * RUN `node tools/sandbox.mjs <verb> ...` AS THIS CHECK: the inspector's handle and the check's
 * session, the office and the project it was given, and the sandboxes folder when one was named,
 * with the office's key when it was given one (theKeyOnTheHost).
 * Answers `{code, stdout, stderr}`.
 */
function theLauncher(asked, verb, command = null, timeoutMs = LAUNCHER_MS) {
  const args = [
    THE_LAUNCHER,
    ...verb,
    '--as', asked.handle,
    '--session', asked.check,
    '--api', asked.api,
    '--workspace', asked.workspace,
    ...(asked.sandboxes === null ? [] : ['--sandboxes', asked.sandboxes]),
    ...(command === null ? [] : ['--', ...command]),
  ]
  return new Promise((done) => {
    const child = spawn(process.execPath, args, { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ...theKeyOnTheHost(asked) } })
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => child.kill('SIGTERM'), timeoutMs)
    child.stdout.on('data', (chunk) => (stdout += chunk))
    child.stderr.on('data', (chunk) => (stderr += chunk))
    child.on('error', (why) => {
      clearTimeout(timer)
      done({ code: null, stdout, stderr: `${stderr}${why.message}` })
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      done({ code, stdout, stderr })
    })
  })
}

/**
 * THE HOST'S COPY OF THE FACTS OF A SANDBOX MADE BEFORE THE HOST KEPT ONE. Such a sandbox has only the copy in its
 * folder, which a run in it can rewrite, so the inspector reads nothing from it: it asks the launcher's status once,
 * which checks every fact the host acts on and writes the host's copy when they all pass (theFactsTheHostReads in
 * tools/sandbox.mjs). A copy the launcher does not take is refused with what the launcher said.
 */
async function theHostsCopyOfTheFacts(asked, instance, folder) {
  if (readHostInstance(folder) !== null || !existsSync(join(folder, INSTANCE_FILE))) return
  const status = await theLauncher(asked, ['status', instance, '--json', ...(asked.from === null ? [] : ['--from', asked.from])])
  if (readHostInstance(folder) !== null) return
  // THE JSON IS READ WHATEVER THE EXIT CODE: the launcher exits 1 for a refusal, and its report holds the words.
  const said = lastJsonLine(status.stdout)?.reports?.find((r) => r?.instance === instance)?.says
  throw new Error(
    `The inspector's sandbox ${instance} has only the copy of its facts in its folder, and the launcher did not take it as the host's ` +
      `(node tools/sandbox.mjs status exited ${status.code}): ${typeof said === 'string' ? said : theEndOf(status.stderr + status.stdout, 6)}`,
  )
}

/**
 * THE INSTANCE'S CONTAINER, OR null WHEN ABSENT. Read from the host's copy of its facts (readHostInstance) and
 * `docker inspect`, and not from `sandbox.mjs status`, which reads the whole ledger with its released rows:
 * measured on the live office on 22 September 2026, 3,433 rows, 7.5 MB and 7.7 seconds per read.
 */
function theContainer(folder, instance) {
  const facts = readHostInstance(folder)
  if (facts === null || typeof facts.container?.name !== 'string') return null
  const name = `mole-office-sandbox-${instance}`
  if (facts.container.name !== name) throw new Error(`The host's copy of the facts of ${folder} names ${facts.container.name}, not this inspector's container ${name}.`)
  const r = spawnSync('docker', ['inspect', '--type', 'container', facts.container.name], { encoding: 'utf8' })
  if (r.error?.code === 'ENOENT') throw new Error('docker is not installed, or not on PATH, so the inspector\'s sandbox cannot be read or started.')
  if (r.status !== 0) {
    if (/no such (container|object)/i.test(String(r.stderr))) return null
    throw new Error(`docker could not be asked about ${facts.container.name}: ${String(r.stderr).trim() || `exit ${r.status}`}`)
  }
  let parsed
  try {
    parsed = JSON.parse(r.stdout)
  } catch {
    throw new Error(`docker inspect ${facts.container.name} did not answer JSON, so whether the sandbox runs cannot be said.`)
  }
  const container = Array.isArray(parsed) && parsed.length === 1 ? parsed[0] : null
  if (container?.Name !== `/${name}` || container?.Config?.Labels?.['mole-office.sandbox'] !== instance || typeof container?.State?.Running !== 'boolean') {
    throw new Error(`docker inspect ${name} did not name this inspector's labelled container and say whether it runs, so nothing was cleared or started.`)
  }
  return container
}

// ============================================================================ who is using the container

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

/**
 * TAKE THE LOCK ONCE, or answer false because another live check holds it. A lock whose holder is
 * gone is cleared; so is one that names nobody after a minute, which is a check that died between
 * making the folder and writing its name.
 */
function tryTheLock(lock) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      mkdirSync(lock)
      writeFileSync(join(lock, 'holder.json'), JSON.stringify(thisProcess()))
      return true
    } catch (why) {
      if (why?.code !== 'EEXIST') throw why
    }
    const holder = readJson(join(lock, 'holder.json'))
    const age = (() => {
      try {
        return Date.now() - statSync(lock).mtimeMs
      } catch {
        return 0
      }
    })()
    if ((holder !== null && !stillThere(holder)) || (holder === null && age > 60_000)) {
      rmSync(lock, { recursive: true, force: true })
      continue
    }
    return false
  }
  return false
}

async function theLock(hostOnly) {
  const lock = join(hostOnly, 'lock')
  const until = Date.now() + LOCK_WAIT_MS
  while (!tryTheLock(lock)) {
    if (Date.now() > until) {
      throw new Error(`Another check of this inspector has held ${lock} for ${LOCK_WAIT_MS / 60_000} minutes, so this one could not start the sandbox.`)
    }
    await sleep(250)
  }
  return () => rmSync(lock, { recursive: true, force: true })
}

function theLockNow(hostOnly) {
  const lock = join(hostOnly, 'lock')
  const until = Date.now() + LOCK_WAIT_LEAVING_MS
  while (!tryTheLock(lock)) {
    if (Date.now() > until) return null
    sleepSync(250)
  }
  return () => rmSync(lock, { recursive: true, force: true })
}

/** The checks written down as using the container that are still running; the others' files are cleared. */
function theChecksStillUsingIt(hostOnly, apartFrom) {
  const folder = join(hostOnly, 'checks')
  if (!existsSync(folder)) return []
  const using = []
  for (const name of readdirSync(folder)) {
    const file = join(folder, name)
    const holder = readJson(file)
    if (name === `${apartFrom}.json`) continue
    if (stillThere(holder)) using.push(name.replace(/\.json$/, ''))
    else {
      rmSync(file, { force: true })
      rmSync(theProviderKeyFileOf(hostOnly, name.replace(/\.json$/, '')), { force: true })
    }
  }
  return using
}

// ============================================================================ the row a sandbox is stopped by

/**
 * THE PROJECT AND THE SESSION THE SANDBOX'S CONTAINER ROW IS IN: those of the check that holds it, as the host's copy
 * of its facts records them: the check it was handed to (containerRowHeldBy), or the check that started it. Acceptance finding 51 (report EnJvvsDTF_Dx, block f-51): the sandbox
 * is shared by checks from every project, the last to leave stops it, and a robotics check asked the robotics
 * ledger for a row that panelx held, so the container was left running. The check's own project and session
 * answer only when the instance records none.
 * @param {Record<string, any> | null} started the host's copy of the sandbox's facts
 * @param {{workspace: string, check: string}} asked the check that is leaving
 * @returns {{workspace: string, session: string}}
 */
export function theRowToStop(started, asked) {
  const said = (/** @type {unknown} */ value) => typeof value === 'string' && value !== ''
  return {
    workspace: said(started?.workspace) ? started.workspace : asked.workspace,
    session: said(started?.containerRowHeldBy?.session) ? started.containerRowHeldBy.session
      : said(started?.startedBy?.session) ? started.startedBy.session : asked.check,
  }
}

/**
 * THE CHECK THE CONTAINER'S ROW IS HANDED TO when the check holding it leaves while others still use the container: the
 * longest-running of them, by its process's start, among those whose marker names the row's own project. A marker
 * written before markers named a project names none, and a check of another project would hold a row its project's
 * ledger does not list; neither is chosen, and the row stays with the leaving check's run, as it always did. Null when
 * none is left.
 * @param {string} hostOnly @param {string[]} others the checks still using the container @param {string} workspace
 * @returns {string | null}
 */
function theCheckToHandTheRowTo(hostOnly, others, workspace) {
  const candidates = others
    .map((check) => ({ check, marker: readJson(join(hostOnly, 'checks', `${check}.json`)) }))
    .filter(({ marker }) => marker?.workspace === workspace && /^\d+$/.test(String(marker?.started ?? '')))
    .sort((a, b) => Number(a.marker.started) - Number(b.marker.started))
  return candidates[0]?.check ?? null
}

/**
 * HAND THE CONTAINER'S ROW TO A CHECK STILL USING IT, when this check holds it: through the launcher's hand-over, which
 * registers the row under that check's run and closes this one's without stopping the container. Called under the lock
 * the leaving check decides to leave under, so two checks that leave together cannot hand the row to each other. Answers
 * a sentence, or null when this check does not hold the row.
 */
function theRowHandedOn(sandbox, others) {
  let facts
  try {
    facts = readHostInstance(sandbox.folder)
  } catch {
    return null
  }
  if (facts === null) return null
  const holder = theRowToStop(facts, sandbox.asked)
  if (holder.session !== sandbox.asked.check) return null
  const to = theCheckToHandTheRowTo(sandbox.hostOnly, others, holder.workspace)
  if (to === null) {
    return `This check holds the container's ledger row, and no check still using the container says it is in the project ${holder.workspace}, so the row stays with this check's run, which the office will name as having left it open.`
  }
  const args = [
    THE_LAUNCHER, 'hand-over', sandbox.instance, '--to-session', to, '--json',
    '--as', sandbox.asked.handle, '--session', holder.session, '--api', sandbox.asked.api, '--workspace', holder.workspace,
    ...(sandbox.asked.sandboxes === null ? [] : ['--sandboxes', sandbox.asked.sandboxes]),
  ]
  const ran = spawnSync(process.execPath, args, { encoding: 'utf8', timeout: LAUNCHER_MS, env: { ...process.env, ...theKeyOnTheHost(sandbox.asked) } })
  if (ran.status !== 0) {
    return `The container's ledger row could NOT be handed to the check ${to} (node tools/sandbox.mjs hand-over exited ${ran.status ?? ran.signal}): ${theEndOf(ran.stderr ?? '', 6)}`
  }
  return `The container's ledger row is handed to the check ${to}, which is still using it, so this check's run leaves nothing open.`
}

// ============================================================================ the sandbox's own clone

/**
 * THE SANDBOX'S OWN CLONE IS BROUGHT UP TO THE CHECKOUT'S MAIN before a check runs anything in it.
 * Acceptance finding 50 (report EnJvvsDTF_Dx, block f-50): every command a check runs goes through
 * tools/sandbox-start.mjs, and that helper runs inside the container from this clone, which `up` makes
 * once and nothing moved. When a launcher switch landed on main, the clone's helper did not know it, and
 * every check died at its build step for 22 minutes. So a clean clone that main descends from is
 * fast-forwarded to main. Anything else stops the check with a sentence saying which: a clone with work
 * of its own, or history main does not descend from, is not this tool's to move.
 *
 * THE HOST READS THE CLONE AND NEVER CHECKS IT OUT. The sandbox can write the clone's config and attributes,
 * and a checkout on the host would run a filter they name, as the owner's user. So the host reads it through
 * the guarded runner, compares its files with HEAD itself, and fetches main's commit by id; the fast-forward,
 * which writes the files, is `fastForward`, which runs it inside the sandbox's container. The clone must then
 * be at main, or the check stops.
 *
 * Answers a sentence when the clone was moved, and null when it was already at main.
 * @param {string} clone the sandbox's own clone
 * @param {string} checkout the checkout whose main the clone should be at
 * @param {(commit: string) => void} fastForward moves the clone's checked-out branch to `commit` inside the
 *   sandbox's container, and throws with a sentence when it cannot
 * @returns {string | null}
 */
export function bringTheCloneUpToMain(clone, checkout, fastForward) {
  const main = guardedGit(checkout, ['rev-parse', '--verify', 'main^{commit}'])
  const head = guardedGit(clone, ['rev-parse', 'HEAD'])
  if (head === main) return null
  if (outsideTheCommitInLines(clone, head) !== '') {
    throw new Error(
      `The sandbox's own clone ${clone} has changes of its own, so the launcher inside it cannot be brought up to main ` +
        `${main.slice(0, 12)} of ${checkout}. Nothing was run. Look at them, and then move the clone to main by hand.`,
    )
  }
  const address = theAddressGitWouldFetch(clone, checkout)
  if (address.address === null) {
    throw new Error(
      `The address git would fetch the checkout ${checkout} from could not be read in the sandbox's own clone ${clone} (${address.why}), ` +
        'so nothing was fetched and nothing was run.',
    )
  }
  if (!address.isTheFolderItself) {
    throw new Error(
      `The sandbox's own clone ${clone} has a config that rewrites the address ${checkout} to ${address.address}, ` +
        'so nothing was fetched and nothing was run.',
    )
  }
  guardedGit(clone, ['fetch', '--quiet', '--no-tags', '--no-write-fetch-head', checkout, main], { fromAFolder: true })
  try {
    guardedGit(clone, ['merge-base', '--is-ancestor', head, main])
  } catch {
    throw new Error(
      `The sandbox's own clone ${clone} is at ${head.slice(0, 12)}, which main ${main.slice(0, 12)} of ${checkout} does not ` +
        'descend from, so it cannot be moved forward to it. Nothing was run. Keep its commit on a branch and move the clone to main by hand.',
    )
  }
  fastForward(main)
  const now = guardedGit(clone, ['rev-parse', 'HEAD'])
  if (now !== main) {
    throw new Error(`The sandbox's own clone ${clone} was asked to move to main ${main.slice(0, 12)} and is at ${now.slice(0, 12)}. Nothing was run.`)
  }
  return `The sandbox's own clone was at ${head.slice(0, 12)} and is now at main ${main.slice(0, 12)}, so the launcher inside it is main's.`
}

/**
 * THE FAST-FORWARD OF THE CLONE AT `clone`, INSIDE THE CONTAINER the instance at `folder` names, for
 * bringTheCloneUpToMain. It throws with a sentence when the container cannot be named or git there refuses.
 * @param {string} folder
 * @param {string} clone
 * @returns {(commit: string) => void}
 */
function theFastForwardInside(folder, clone) {
  return (commit) => {
    const name = readHostInstance(folder)?.container?.name
    if (typeof name !== 'string') {
      throw new Error(`The host holds no copy of the facts of ${folder} naming a container, so the sandbox's own clone ${clone} could not be moved to main ${commit.slice(0, 12)}. Nothing was run.`)
    }
    const moved = fastForwardInside(name, clone, commit)
    if (moved.status !== 0) {
      const why = moved.error === undefined ? moved.stderr.trim() || `git exited ${String(moved.status)}` : String(moved.error)
      throw new Error(`The sandbox's own clone ${clone} could not be moved to main ${commit.slice(0, 12)} inside its container ${name}: ${why}. Nothing was run.`)
    }
  }
}

// ============================================================================ the sandbox for one check

/**
 * THE ROOT OF THE REPOSITORY A RUN BELONGS TO, by its real path, or null when git knows no repository at `checkout`.
 *
 * dUq6KDtaTq_f, on decision sgMvt6i9Lkjb: registered repositories are checked like the office's, so the
 * inspector's sandbox must see the run's repository. A worktree's common directory is its repository's .git, and its
 * parent is the root, including when the worktree lives outside that root.
 *
 * A SANDBOX'S CLONE BELONGS TO THE CHECKOUT IT WAS MADE FROM. A worker's sandbox cuts its worktrees from <sandbox>/repo.
 * Since item 2f that is a clone of the bare mirror of the checkout's main, and its origin is that mirror
 * (theMainMirrorOf in tools/sandbox-common.mjs); the checkout is answered only when the mirror, which no sandbox can
 * write, names it and is exactly where theMainMirrorOf puts the mirror of that checkout in `sandboxes`
 * (theCheckoutAMirrorCloneCameFrom). A clone made before item 2f is a `git clone --shared` of the checkout, which names
 * the checkout's objects in objects/info/alternates until the launcher's next start copies them in. After that start,
 * in a container with no mirror, it borrows nothing and its origin is still the checkout, and the checkout is answered
 * only when that origin is exactly the `from` in the host's copy of its sandbox's facts
 * (theCheckoutAnOlderCloneCameFrom). Before that was read, such a clone was its own repository, and a second check of a
 * run in it was refused while another check used the inspector's sandbox (25 October 2026). Either way a run of the
 * office's own repository from a sandbox's worktree is the office's, and is checked exactly as before (the inspector's
 * refusal of run Kx27_jM0knaH). The one alternate is read as git reads it: one path a line, absolute or relative to the
 * objects folder, blank lines and # lines skipped. A repository that borrows from more than one, or from none and is
 * neither a mirror's clone nor such an older clone, is its own.
 *
 * A FOLDER GIT KNOWS NO REPOSITORY AT has no root: a files run's working directory can be one (a files run is sealed
 * from a staged folder with no git), and its check uses the sandbox as before.
 * @param {string} checkout
 * @param {string} [sandboxes] the sandboxes folder the inspector's own sandbox is in
 * @returns {string | null}
 */
export function theRepositoryOf(checkout, sandboxes = SANDBOXES_FOLDER) {
  const common = guardedGitRun(checkout, ['rev-parse', '--path-format=absolute', '--git-common-dir'])
  if (common.status !== 0) return null
  const gitDir = realpathSync(common.stdout.trim())
  const objects = join(gitDir, 'objects')
  const alternates = join(objects, 'info', 'alternates')
  const borrowed = existsSync(alternates)
    ? readFileSync(alternates, 'utf8').split('\n').filter((line) => line !== '' && !line.startsWith('#'))
    : []
  const root = dirname(gitDir)
  if (borrowed.length === 0) return theCheckoutAMirrorCloneCameFrom(root, sandboxes) ?? theCheckoutAnOlderCloneCameFrom(root, sandboxes) ?? root
  return dirname(borrowed.length === 1 ? realpathSync(dirname(resolve(objects, borrowed[0]))) : gitDir)
}

/**
 * THE SANDBOX THIS CHECK WILL USE, RUNNING, WITH THIS CHECK WRITTEN DOWN AS USING IT.
 *
 * `asked` is `{handle, check, run, checkout, api, workspace, sandboxes, from, say, officeKey}`: `checkout` is the worker's
 * checkout (the run's working directory), `sandboxes` and `from` are
 * null for the launcher's own defaults, `say` prints one informational line, and `officeKey`, when given, answers the
 * office's own key, or null (see `theKeyOnTheHost`).
 *
 * Throws with a sentence when the sandbox cannot be had. Nothing falls back to the host.
 */
export async function aSandboxForThisCheck(asked) {
  const instance = theInspectorsInstance(asked.handle)
  const sandboxes = asked.sandboxes ?? SANDBOXES_FOLDER
  const folder = join(sandboxes, instance)
  const checkDir = join(folder, 'checks', `a-check-of-${asked.run}-${asked.check}`)
  // A CHECK WHOSE VIEW WENT WHEN IT ENDED cannot run again with its id (theViewOfACheckWithNoVerdict), and is refused
  // before anything is started or locked.
  const removed = join(checkDir, VIEW_REMOVED_NOTE)
  if (lstatSync(removed, { throwIfNoEntry: false }) !== undefined) {
    throw new Error(`${removed} says this check's view was removed when the check ended with no verdict, so a check with this id cannot run again. Nothing was run. File a fresh check session and ask again with its id.`)
  }
  const hostOnly = join(sandboxes, THE_CHECKS_FOLDER, instance)
  mkdirSync(join(hostOnly, 'checks'), { recursive: true, mode: 0o700 })
  const sandbox = {
    asked,
    instance,
    hostOnly,
    /** The file that says this check is using the container. */
    marker: join(hostOnly, 'checks', `${asked.check}.json`),
    folder,
    repo: join(folder, 'repo'),
    home: join(folder, 'check-views', asked.check, 'home'),
    privateRoot: join(folder, 'check-views', asked.check),
    sharedHome: join(folder, 'home'),
    loginSeeds: [],
    from: null,
    readOnly: [],
    templateDir: null,
    template: null,
    container: null,
    startedHere: false,
    keepPrivate: false,
    /** Controller metadata, protected inputs and evidence; never a writable view mount. */
    checkDir: null,
    /** The command running inside right now, as its start line: what a stop of this tool ends. */
    running: null,
    /** This check's transient read-only login seed, outside its private home. */
    login: null,
  }

  let written = false
  try {
    const unlock = await theLock(hostOnly)
    try {
      await theHostsCopyOfTheFacts(asked, instance, folder)
      const container = theContainer(folder, instance)
      const before = readHostInstance(folder)
      // Retain the shared instance's existing registered-source lifecycle. Check-view commands
      // inherit none of these mounts: their complete spec is constructed separately by runInside.
      const rootOf = (checkout) => realpathSync(dirname(guardedGit(checkout, ['rev-parse', '--path-format=absolute', '--git-common-dir'])))
      const root = theRepositoryOf(asked.checkout, sandboxes)
      // THE DEFAULT SOURCE IS THE DEVELOPMENT CHECKOUT WHEN THIS IS A STABLE OFFICE: a check started
      // by the stable office mounts the checkout the person works in, never the stable one.
      const from = realpathSync(before?.from ?? asked.from ?? THE_DEVELOPMENT_CHECKOUT ?? rootOf(THIS_CHECKOUT))
      const readOnly = Array.isArray(before?.readOnly) ? [...before.readOnly] : []
      const needsRoot = root !== null && !within(root, from) && !readOnly.includes(root)
      if (needsRoot) readOnly.push(root)
      // Decide before writing this check's marker: a refusal must leave the other check's container alone.
      if (container?.State.Running && needsRoot && theChecksStillUsingIt(hostOnly, asked.check).length > 0) {
        throw new Error(`The inspector's sandbox ${instance} is in use by another check; this run's repository ${root} must be mounted read-only, and the check can be asked again when the sandbox is free.`)
      }
      // `since` is for a person reading the marker, in local wall-clock time (chapter 4 rule 8; acceptance finding 63):
      // whether a check still uses the container is read from its pid and start ticks (stillThere), never from this.
      const holder = readJson(sandbox.marker)
      if (stillThere(holder) && holder.pid !== process.pid) throw new Error('This check already has a live controller. Nothing was started.')
      // THE PROJECT TOO, so a check leaving with the container's row can hand it to a check of the row's own project.
      writeFileSync(sandbox.marker, JSON.stringify({ ...thisProcess(), run: asked.run, workspace: asked.workspace, since: localStamp(new Date()) }))
      written = true
      if (container === null || !container.State.Running || needsRoot) {
        // JbKNJHO-snYV, GPit2aAWDwkn: a stopped container blocks up. down already removes it
        // after the ledger closes its row; use that door under the same lock, never docker rm here.
        if (container !== null) {
          const row = theRowToStop(before, asked)
          const down = await theLauncher({ ...asked, workspace: row.workspace, check: row.session }, ['down', instance, '--force', '--json'])
          if (down.code !== 0 || theContainer(folder, instance) !== null) {
            throw new Error(`The inspector's ${container.State.Running ? '' : 'stopped '}container ${container.Name.slice(1)} could not be cleared (node tools/sandbox.mjs down exited ${down.code}):\n${theEndOf(down.stderr + down.stdout, 20)}`)
          }
          asked.say(container.State.Running
            ? `The inspector's container ${container.Name.slice(1)} was stopped through the ledger so this run's repository ${root} can be mounted read-only.`
            : `The inspector's container ${container.Name.slice(1)} had stopped; it was cleared through the ledger before starting this check's sandbox.`)
        }
        asked.say(`Starting the inspector's sandbox ${instance} from the template ${THE_INSPECTORS_TEMPLATE}.`)
        const up = await theLauncher(
          asked,
          ['up', THE_INSPECTORS_TEMPLATE, '--name', instance, '--json', '--label', `mole-office.inspector=${instance}`,
            // The source is always named, so a launcher in the stable checkout is never left to its default.
            '--from', from,
            ...readOnly.flatMap((path) => ['--ro', path])],
          null,
          UP_MS,
        )
        const said = up.code === 0 ? lastJsonLine(up.stdout) : null
        if (said === null || typeof said.folder !== 'string') {
          throw new Error(`The inspector's sandbox ${instance} could not be started (node tools/sandbox.mjs up exited ${up.code}):\n${theEndOf(up.stderr, 20)}`)
        }
        if (said.folder !== folder) {
          throw new Error(`node tools/sandbox.mjs up made the sandbox ${instance} in ${said.folder}, and this check looked for it in ${folder}.`)
        }
        sandbox.startedHere = true
      } else {
        asked.say(`The inspector's sandbox ${instance} is already up; this check uses it too.`)
      }
      const moved = bringTheCloneUpToMain(sandbox.repo, asked.from ?? THIS_CHECKOUT, theFastForwardInside(folder, sandbox.repo))
      if (moved !== null) asked.say(moved)
    } finally {
      unlock()
    }

    const facts = readHostInstance(sandbox.folder)
    if (facts === null || typeof facts.container?.name !== 'string' || typeof facts.templateDir !== 'string') {
      throw new Error(`The host holds no copy of the facts of ${sandbox.folder} naming a container and a template, so the sandbox ${instance} cannot be used.`)
    }
    Object.assign(sandbox, {
      from: facts.from,
      readOnly: Array.isArray(facts.readOnly) ? facts.readOnly : [],
      templateDir: facts.templateDir,
      template: facts.template,
      container: facts.container.name,
    })
    if (existsSync(checkDir) && !existsSync(join(checkDir, 'model-session.json'))) {
      throw new Error(`${checkDir} is already there, so a check with this id was run before and its folder was kept. Nothing was run.`)
    }
    mkdirSync(checkDir, { recursive: true, mode: 0o700 })
    sandbox.checkDir = checkDir
    mkdirSync(sandbox.home, { recursive: true, mode: 0o700 })
    return sandbox
  } catch (why) {
    // A CHECK THAT GOT PART WAY LEAVES AS ANY CHECK LEAVES, so a container it started is not left up.
    if (written) {
      const left = leaveTheSandbox(sandbox, { delivered: false })
      throw new Error(`${why instanceof Error ? why.message : String(why)}\n${left.says}`)
    }
    throw why
  }
}

/** The independent work copy mounted at /work for this check alone. */
export function whereTheCheckIsCut(sandbox) {
  return join(sandbox.folder, 'check-views', sandbox.asked.check, 'work')
}

/** Can a process in the sandbox read this host path? Only the instance folder, the checkout and --ro folders are there. */
export function seenInside(sandbox, path) {
  return within(path, sandbox.folder) || (typeof sandbox.from === 'string' && within(path, sandbox.from)) || sandbox.readOnly.some((ro) => within(path, ro))
}

/**
 * Bring commits into the instance's source clone and any existing independent private clone.
 * Only the private clone is mounted into a check command. By commit id: the run's branch may be gone, or checked out elsewhere.
 * No FETCH_HEAD is written: nothing reads it, and the worktree is cut from the commit id itself.
 */
export function fetchIntoTheSandbox(sandbox, fromRepository, commits) {
  const work = whereTheCheckIsCut(sandbox)
  const repositories = [sandbox.repo, ...(existsSync(join(work, '.git')) ? [work] : [])]
  // EVERY REPOSITORY IS CHECKED BEFORE ANY IS FETCHED: a refusal for one fetches nothing into the others.
  for (const repo of repositories) {
    const address = theAddressGitWouldFetch(repo, fromRepository)
    if (address.address === null) {
      throw new Error(`The address git would fetch ${fromRepository} from could not be read in ${repo} (${address.why}), so nothing was fetched into any repository.`)
    }
    if (!address.isTheFolderItself) {
      throw new Error(`The repository ${repo} has a config that rewrites the address ${fromRepository} to ${address.address}, so nothing was fetched into any repository.`)
    }
  }
  for (const repo of repositories) {
    const r = guardedGitRun(repo, ['fetch', '--no-tags', '--no-write-fetch-head', '--quiet', fromRepository, ...commits], { fromAFolder: true })
    if (r.status !== 0) throw new Error(`git could not bring ${commits.join(', ')} from ${fromRepository} into ${repo}: ${String(r.stderr ?? '').trim() || `exit ${r.status}`}`)
  }
}

// ============================================================================ one command inside

/**
 * THE MODEL'S ENVIRONMENT WHEN A CHECK RUNS ON THE HOST (problem YjMHEkMQkjAX, from wave 13n's sweep of the tools that call
 * the office, report hkB1Wn5eZr-z block b-7): the caller's, less what the sandbox keeps out of it. In the sandbox the
 * helper takes the office's own variables out of every command (--no-office-variables), and no key goes into a container;
 * on the host the model was handed the tool's whole environment, so a caller's MOLE_AGENT_KEY or a run key would have
 * reached it. So the office's variables go, by the one rule the helper uses, and so does every key an agent or a run
 * holds. The model's own login, its home and a Claude token where one is set, stays.
 * @param {Record<string, string | undefined>} env
 * @returns {Record<string, string | undefined>}
 */
export function theModelsEnvironmentOnTheHost(env) {
  const kept = { ...env }
  takeOutTheOfficesVariables(kept)
  for (const name of THE_KEYS_A_MODEL_NEVER_GETS) delete kept[name]
  return kept
}

/**
 * THE NAMES OF THE SECRETS A CHECK'S RUNTIME IS HANDED, as runInside passes them by --secret: the Claude token, Codex's two
 * keys, OpenCode's key by the provider of its model, DSH's by its provider. The host mask and the transcript mask read them
 * from here, so they mask what runInside hands. While the provider router is on, Codex is handed neither of its keys, as
 * the router holds every API key, and signs in with its login (aLoginForTheModel).
 * @param {string} runtime @param {{model?: string | null, provider?: string | null}} [route]
 * @returns {string[]}
 */
export function theSecretNamesOf(runtime, { model = null, provider = null } = {}) {
  if (runtime === 'claude-code') return [THE_TOKEN]
  if (runtime === 'codex') return theProviderRouterIsOn() ? [] : ['OPENAI_API_KEY', 'CODEX_API_KEY']
  if (runtime === 'opencode') return [theOpenCodeKey(model)]
  if (runtime === 'dsh') return [theDshKey(provider)]
  throw new Error(`Inspector harness ${runtime} has no secrets of its own here, so none is passed and nothing was started.`)
}

/**
 * THE LOGIN FILES A CHECK'S VIEW MAY HOLD, as paths under a home: the check's private home, and for Codex also the
 * shared home its seed comes from. A check's model is signed in by copying a seed to one of them, and Codex refreshes
 * its own in place. leaveTheSandbox removes both when the check ends, whatever the verdict; a later sweep of old views
 * reads the same list.
 */
export const THE_LOGIN_FILES_IN_A_CHECK_VIEW = Object.freeze({
  claude: '.claude/.credentials.json',
  codex: '.codex/auth.json',
})

/** Every name a check of any runtime may be handed, for the host, where the model is handed the tool's own environment. */
export const EVERY_SECRET_A_CHECK_IS_HANDED = Object.freeze([...new Set([THE_TOKEN, 'OPENAI_API_KEY', 'CODEX_API_KEY',
  ...Object.values(OPENCODE_CHECK_KEYS), ...Object.values(DSH_CHECK_KEYS), THE_CODEX_PROVIDER_VARIABLES.key])])

/**
 * THE SECRETS HANDED TO ONE COMMAND'S VIEW, by name and exact value, read as the launcher reads them: the template's
 * secrets file through theDeclaredSecrets, with the names passed by --secret, the access token of a Claude login seed,
 * and a Codex login, from its seed and from the check's private home, where Codex keeps it and refreshes it.
 * Throws when they cannot be read, so a view is never started whose answer could not be masked (problem DNSRdZtWGTjS);
 * `after` is the sentence that ends the throw's message.
 * @returns {{name: string, value: string}[]}
 */
function theSecretsHandedToTheView(sandbox, names, after) {
  const cannot = cannotMask(after)
  const handed = []
  if (names.length > 0) {
    const file = typeof sandbox.templateDir === 'string' ? join(sandbox.templateDir, 'sandbox.json') : '(no template folder)'
    const office = typeof sandbox.templateDir === 'string' ? readJson(file) : null
    if (office === null) throw cannot(`${file} cannot be read`)
    const secrets = theDeclaredSecrets(office, homedir(), undefined, names)
    if (secrets.unsafe !== null) throw cannot(secrets.unsafe.replace(/\.$/, ''))
    for (const line of secrets.lines) handed.push({ name: line.slice(0, line.indexOf('=')), value: line.slice(line.indexOf('=') + 1) })
  }
  for (const seed of sandbox.loginSeeds ?? []) {
    if (seed.target === THE_LOGIN_FILES_IN_A_CHECK_VIEW.codex) { handed.push(...theCodexLogin(seed.host, THE_CODEX_SEED, cannot, sandbox.asked)); continue }
    if (seed.target !== THE_LOGIN_FILES_IN_A_CHECK_VIEW.claude) continue
    const token = readJson(seed.host)?.claudeAiOauth?.accessToken
    if (typeof token !== 'string' || token === '') throw cannot(`${asASentence(THE_CLAUDE_SEED.file)} holds no access token this tool can read`)
    handed.push({ name: 'the Claude login', value: token })
  }
  handed.push(...theCodexLoginInThePrivateHome(sandbox, cannot))
  return handed
}

/** The error thrown when what a view answers could not be masked; `after` is the sentence that ends its message. */
const cannotMask = (after) => (why) => new Error(`${why}, so what the view answers could not be masked. ${after}`)

/** The secrets of the Codex login in the check's private home, where Codex keeps it and refreshes it; none when there is none. */
function theCodexLoginInThePrivateHome(sandbox, cannot) {
  const kept = typeof sandbox.home === 'string' ? join(sandbox.home, THE_LOGIN_FILES_IN_A_CHECK_VIEW.codex) : null
  return kept !== null && somethingIsAt(kept) ? theCodexLogin(kept, THE_CODEX_LOGIN_AT_HOME, cannot, sandbox.asked) : []
}

/**
 * How a sentence names a login this tool reads, and its folder: by where it is for the check, never by its path on
 * the host, which holds the username (JNaABU_LRnl0).
 */
const THE_CLAUDE_SEED = Object.freeze({ file: "the check's Claude login seed" })
const THE_CODEX_SEED = Object.freeze({ file: "the check's login seed", folder: "the folder of the check's login seed" })
const THE_CODEX_LOGIN_AT_HOME = Object.freeze({ file: ".codex/auth.json of the check's private home", folder: ".codex of the check's private home" })
/** `words` with its first letter made a capital, to begin a sentence. */
const asASentence = (words) => words.charAt(0).toUpperCase() + words.slice(1)

/** Is there a file, a folder or a link at `path`? A link is not followed. */
function somethingIsAt(path) {
  try {
    lstatSync(path)
    return true
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return false
    throw error
  }
}

/** The top-level fields of a Codex login that are not secret (Dxiry_2y6vuD point 1). */
const A_CODEX_LOGINS_OPEN_FIELDS = Object.freeze(['auth_mode', 'last_refresh'])
/** The most of a Codex login this tool reads. A real one is a few thousand bytes. */
const A_CODEX_LOGIN_AT_MOST = 1024 * 1024
/**
 * A string of a Codex login is masked only when it has at least this many characters (ZlGd3WZt4lTk). The mask
 * replaces a value wherever it stands, so a short one, say "pro", would turn every "provider" in an answer into
 * "<the Codex login, masked>vider". The e-mail, subject and ids decoded from the id_token are masked at any length.
 */
const A_CODEX_LOGIN_MASKS_FROM = 8

/**
 * `value` as a JWT: the JSON its payload holds, and its payload and signature as written. Null when `value` is not three
 * base64url parts whose header and payload are JSON objects.
 */
function aJwt(value) {
  const parts = /^([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]*)$/.exec(value)
  if (parts === null) return null
  const anObject = (part) => {
    try {
      const held = JSON.parse(Buffer.from(part, 'base64url').toString('utf8'))
      return held !== null && typeof held === 'object' && !Array.isArray(held) ? held : null
    } catch {
      return null
    }
  }
  const payload = anObject(parts[2])
  return anObject(parts[1]) === null || payload === null ? null : { payload, pieces: [parts[2], parts[3]].filter((piece) => piece !== '') }
}

/**
 * THE SECRETS OF A CODEX LOGIN, from its auth.json, each named "the Codex login" (Dxiry_2y6vuD point 1). Every string
 * in it of A_CODEX_LOGIN_MASKS_FROM characters or more is a secret but its auth_mode and last_refresh, so a field Codex
 * adds later is masked with no change here. A shorter one is not masked, and `asked` is told how many and why
 * (ZlGd3WZt4lTk). Of each JWT in it, the payload and the signature are secrets on their own as well. The
 * id_token's payload is decoded here, in memory only, and its e-mail, its subject and every id in it are secrets at any
 * length. Throws when the file or its folder is a link, when it is not a file this tool can read as a Codex login, or
 * when its id_token cannot be decoded. Each sentence names the file as `place` does, and never a value in it.
 * @param {string} file @param {{file: string, folder: string}} place @param {(why: string) => Error} cannot
 * @param {{say: (sentence: string) => void}} asked
 * @returns {{name: string, value: string}[]}
 */
function theCodexLogin(file, place, cannot, asked) {
  for (const [at, named] of [[dirname(file), place.folder], [file, place.file]]) {
    if (!somethingIsAt(at)) throw cannot(`${asASentence(named)} is missing`)
    if (lstatSync(at).isSymbolicLink()) throw cannot(`${asASentence(named)} is a link`)
  }
  const held = lstatSync(file)
  if (!held.isFile() || held.size > A_CODEX_LOGIN_AT_MOST) throw cannot(`${asASentence(place.file)} is not a Codex login this tool reads`)
  const login = readJson(file)
  if (login === null || typeof login !== 'object' || Array.isArray(login)) throw cannot(`${asASentence(place.file)} is not a Codex login this tool can read`)
  const values = []
  const short = []
  const every = (value, top) => {
    if (typeof value === 'string') (value.length < A_CODEX_LOGIN_MASKS_FROM ? short : values).push(value)
    else if (value !== null && typeof value === 'object') {
      for (const [key, one] of Object.entries(value)) if (!(top && A_CODEX_LOGINS_OPEN_FIELDS.includes(key))) every(one, false)
    }
  }
  every(login, true)
  for (const value of [...values]) values.push(...(aJwt(value)?.pieces ?? []))
  const idToken = login.tokens?.id_token
  if (typeof idToken === 'string' && idToken !== '') {
    const named = (value, key) => {
      if (typeof value === 'string') { if (key === 'email' || key === 'sub' || /(^|_)id$/.test(key)) values.push(value) }
      else if (value !== null && typeof value === 'object') for (const [inner, one] of Object.entries(value)) named(one, Array.isArray(value) ? key : inner)
    }
    const jwt = aJwt(idToken)
    if (jwt === null) throw cannot(`The Codex login in ${place.file} holds an id_token this tool cannot decode`)
    named(jwt.payload, '')
  }
  const masked = [...new Set(values)].filter((value) => value !== '')
  const left = new Set(short.filter((value) => value !== '' && !masked.includes(value))).size
  if (left > 0) {
    asked.say(`The Codex login in ${place.file} holds ${left} ${left === 1 ? 'value' : 'values'} of 1 to ${A_CODEX_LOGIN_MASKS_FROM - 1} ` +
      `characters that ${left === 1 ? 'is' : 'are'} not masked, because a value that short can be part of ordinary words in what the view answers.`)
  }
  return masked.map((value) => ({ name: 'the Codex login', value }))
}

/**
 * `text` with each handed value replaced by `<NAME, masked>`, the longest value first, so a value held inside another is
 * not left half masked. How many of each were masked is added to `counts`.
 * @param {string} text @param {{name: string, value: string}[]} handed @param {Record<string, number>} counts
 */
export function withTheSecretsMasked(text, handed, counts) {
  let said = text
  for (const { name, value } of [...handed].sort((a, b) => b.value.length - a.value.length)) {
    if (value === '') continue
    const pieces = said.split(value)
    if (pieces.length === 1) continue
    counts[name] = (counts[name] ?? 0) + pieces.length - 1
    said = pieces.join(`<${name}, masked>`)
  }
  return said
}

/**
 * `text` with each secret a view is handed under `names` masked, the secrets read again as runInside reads them, for what
 * the view leaves and the host reads after it: a dsh transcript. Throws when they cannot be read, as runInside does.
 * @param {any} sandbox @param {string[]} names @param {string} text
 * @returns {{text: string, masked: Record<string, number>}}
 */
export function maskedOfWhatTheViewIsHanded(sandbox, names, text, { providerKey = /** @type {{value: string, native?: string | null, program?: string} | null} */ (null) } = {}) {
  const masked = {}
  const handed = [...theSecretsHandedToTheView(sandbox, names, 'It is not used.'), ...(providerKey === null ? [] : theProviderKeyHanded(providerKey))]
  return { text: withTheSecretsMasked(text, handed, masked), masked }
}

/**
 * Execute one private check command and consume only identity-bound controller evidence. What the view answers, on its
 * standard output, its error channel and the receipt's reason, is answered with each secret handed to it masked, and
 * `masked` counts what was masked by name. `providerKey` is given only for a dsh or Codex model whose Casting row names
 * a provider row: the view is then handed that key and that base address alone, through aProviderKeyFile, and none of
 * the template's secrets. Its `program` is codex for a Codex model, whose command must carry theCodexProviderOptions
 * of the same base address, so the address the launcher judges is the one Codex is told; dsh's is left out.
 */
export async function runInside(sandbox, { label, cwd, argv, stdin = null, limitMs, runtime = 'claude-code', providerKey = /** @type {{value: string, baseAddress: string, native?: string | null, program?: string} | null} */ (null), launcher = theLauncher }) {
  let start = null
  let handed = []
  let keyFile = null
  const masked = {}
  const mask = (text) => typeof text === 'string' ? withTheSecretsMasked(text, handed, masked) : text
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(label)) throw new Error('The command label cannot name a protected input file.')
    if (label === 'codex' || label === 'claude') {
      const checked = aCodexContainerCommand(argv, { runtime })
      for (const sentence of checked.says) sandbox.asked.say(sentence)
    }
    const route = {}
    if (label === 'opencode' || runtime === 'opencode') {
      if (label !== 'opencode' || runtime !== 'opencode') throw new Error('The OpenCode model label and runtime do not agree; no model was started.')
      route.model = theCheckedOpenCodeModel(argv)
      theOpenCodeKey(route.model)
      sandbox.asked.say('The OpenCode native command array was checked before its protected wrapper was written.')
    }
    if (label === 'dsh' || runtime === 'dsh') {
      if (label !== 'dsh' || runtime !== 'dsh') throw new Error('The DSH model label and runtime do not agree; no model was started.')
      route.provider = theCheckedDshRoute(argv).provider
      theDshKey(route.provider)
      sandbox.asked.say('The DSH native command array was checked before its protected wrapper was written.')
    }
    if (providerKey !== null && providerKey.program === 'codex') {
      if (label !== 'codex' || runtime !== 'codex') throw new Error("A provider row's key read for Codex is handed only to the codex model of a check; no model was started.")
      if (!aCodexCommandIsToldTheProvider(argv, providerKey.baseAddress)) {
        throw new Error("A provider row's key is handed to a Codex command only when its -c options name the provider row's base address and key variable, as theCodexProviderOptions gives them, and no other model provider or shell environment; no model was started.")
      }
    } else if (providerKey !== null && (label !== 'dsh' || runtime !== 'dsh' || providerKey.native !== route.provider)) {
      throw new Error("A provider row's key is handed only to the dsh model of a check, on the native provider it was read for; no model was started.")
    }
    // EACH RUNTIME NAMES ITS OWN SECRETS, so none falls through to the Claude token (uVlfyTGEjhbq), and a runtime
    // with none of its own is refused here, before anything is written.
    const aStandardCheck = label.startsWith(A_STANDARD_CHECK)
    const secrets = label === 'build' || label === THE_CHECKOUT_COMMAND || label === TRY_THE_VIEW || aStandardCheck || providerKey !== null ? [] : theSecretNamesOf(runtime, route)
    handed = [...theSecretsHandedToTheView(sandbox, secrets, 'Nothing was started.'), ...(providerKey === null ? [] : theProviderKeyHanded(providerKey))]
    const commands = join(sandbox.checkDir, 'commands')
    const records = join(sandbox.checkDir, 'records')
    const outputs = join(sandbox.checkDir, 'outputs')
    const temporary = join(dirname(sandbox.home), 'tmp')
    for (const dir of [commands, records, outputs, sandbox.home, temporary]) mkdirSync(dir, { recursive: true, mode: 0o700 })
    chmodSync(temporary, 0o700)
    const spec = { check: sandbox.asked.check, instance: sandbox.instance,
      readOnly: [{ host: records, container: '/inputs/records' }, { host: commands, container: '/inputs/commands' }],
      private: [{ host: cwd, container: '/work' }, { host: sandbox.home, container: '/check/home' },
        { host: temporary, container: '/check/tmp' }],
      ...(sandbox.loginSeeds?.length && !aStandardCheck ? { loginSeeds: sandbox.loginSeeds } : {}), outputs: { dir: outputs } }
    if (stdin !== null && (!isAbsolute(stdin) || !within(stdin, commands))) throw new Error('Command stdin must be a protected controller input in the commands folder.')
    const input = stdin === null ? '/dev/null' : '/inputs/commands/' + relative(commands, stdin)
    writeFileSync(join(commands, `${label}.sh`), `# Controller input for one private check view.\nexec ${argv.map(quoted).join(' ')} < ${quoted(input)}\n`, { mode: 0o600 })
    const specFile = join(sandbox.checkDir, 'check-view.json')
    writeFileSync(specFile, JSON.stringify(spec), { mode: 0o600 })
    if (runtime === 'dsh') removeTheDshProfilesOfAnEarlierCall(sandbox.home, sandbox.asked)
    const view = readCheckView(specFile, { instance: sandbox.instance, dir: sandbox.folder, cwd })
    // The wrapper hides the native program from the launcher. Prepare only after alias validation.
    if (runtime === 'opencode') prepareOpenCodeRunHome(sandbox.home, 'opencode', false)
    if (runtime === 'dsh') aPrivateDshHome(sandbox.home)
    const command = aCheckCommand(label)
    if (providerKey !== null) keyFile = aProviderKeyFile(sandbox, providerKey)
    const ran = await launcher(sandbox.asked, ['exec', sandbox.instance, '--check-view', specFile, '--cwd', cwd,
      '--json', '--no-office-variables', '--timeout', String(limitMs / 1000), ...secrets.flatMap(name => ['--secret', name]),
      ...(keyFile === null ? [] : ['--provider-key-file', keyFile])], command)
    if (ran.code !== 0) throw new Error(`Check view could not start (exit ${ran.code}): ${theEndOf(ran.stderr + ran.stdout, 20)}`)
    start = lastJsonLine(ran.stdout)
    const text = value => typeof value === 'string' && value !== ''
    const pid = value => Number.isSafeInteger(value) && value > 1
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
    if (start === null || start.instance !== sandbox.instance || start.run !== null || start.cwd !== '/work' ||
        !same(start.command, command) || !pid(start.innerPid) || !pid(start.hostPid) || !pid(start.hostPgid) || !text(start.processRow) ||
        !text(start.view?.container) || !text(start.view?.containerRow) || start.view.sha256 !== view.sha256 ||
        (keyFile === null ? start.provider !== undefined : !text(start.provider))) {
      start = null
      throw new Error('Check view descriptor does not match this command, instance, private cwd, process identity, spec digest, or whether it says what a provider key file handed.')
    }
    const names = ['out', 'err', 'exit', 'receipt', 'details']
    const paths = names.map(name => start[name])
    if (paths.some(path => !text(path) || !isAbsolute(path) || resolve(path) !== path || !within(path, outputs) || dirname(path) === outputs) ||
        new Set(paths).size !== paths.length || paths.some(path => dirname(path) !== dirname(start.out)) || realpathSync(dirname(start.out)) !== dirname(start.out)) {
      start = null
      throw new Error('Check view descriptor has invalid controller evidence paths.')
    }
    sandbox.running = start
    // The launcher owns the timeout and both cleanup rows. Its receipt is written after cleanup.
    const deadline = Date.now() + limitMs + LAUNCHER_MS
    while (!existsSync(start.receipt) && Date.now() < deadline) await sleep(50)
    if (!existsSync(start.receipt)) throw new Error('Check view receipt was not written within the command and controller cleanup limits.')
    const read = path => {
      if (realpathSync(path) !== path) throw new Error('Check view receipt or evidence is a symlink.')
      const held = statSync(path)
      if (!held.isFile() || held.uid !== process.getuid() || held.nlink !== 1 || (held.mode & 0o022)) throw new Error('Check view receipt or evidence is not a controller-owned regular file.')
      return readFileSync(path, 'utf8')
    }
    const receipt = JSON.parse(read(start.receipt))
    if (receipt.check !== sandbox.asked.check || receipt.instance !== sandbox.instance || receipt.started !== true ||
        !same(receipt.view, start.view) || receipt.processRow !== start.processRow || receipt.innerPid !== start.innerPid ||
        ['out', 'err', 'exit'].some(name => receipt[name] !== start[name]) ||
        !Number.isInteger(receipt.code) || receipt.code < 0 || receipt.code > 255 ||
        !Array.isArray(receipt.released) || receipt.released.length !== 2 ||
        !receipt.released.includes(start.processRow) || !receipt.released.includes(start.view.containerRow) ||
        (receipt.why !== null && typeof receipt.why !== 'string') || read(start.exit).trim() !== String(receipt.code)) {
      throw new Error('Check view receipt does not match this check, command identity, output paths, exit or released rows.')
    }
    // CODEX MAY HAVE WRITTEN ITS LOGIN AGAIN IN THE PRIVATE HOME while the view ran, with tokens nothing read before it, so
    // that login is read again now and added to what was read before (Dxiry_2y6vuD point 1).
    handed = [...handed, ...theCodexLoginInThePrivateHome(sandbox, cannotMask('What it answered is not shown.'))]
    return { started: start, code: receipt.code, stoppedByTheClock: receipt.code === 124,
      out: mask(read(start.out)), err: mask(read(start.err)), why: mask(receipt.why), masked }
  } catch (error) {
    return { started: start, code: null, stoppedByTheClock: false, out: '', err: '', why: mask(error.message), masked }
  } finally {
    sandbox.running = null
    if (keyFile !== null) rmSync(keyFile, { force: true })
  }
}

/**
 * TRY THE CHECK VIEW WITH AN EMPTY COMMAND, BEFORE THE MODEL STARTS. A check is refused at the start, never at the end.
 * Every command of a check runs through runInside. runInside refuses a command's answer when the launcher's descriptor does
 * not match, or when its receipt or evidence is not a controller-owned regular file, and those checks are the same for
 * every command. Without this try, the model's run is spent first and thrown away after. On 15 October five checks were,
 * for the mode of those files. The command is `true`, with no secret and no login.
 * @returns {Promise<string | null>} null when the command ran and exited 0; otherwise why it did not
 */
export async function whyTheCheckViewFails(sandbox, cwd, { launcher = theLauncher } = {}) {
  const tried = await runInside(sandbox, { label: TRY_THE_VIEW, cwd, argv: ['true'], limitMs: TRY_THE_VIEW_MS, launcher })
  if (tried.code === null) return tried.why
  if (tried.stoppedByTheClock) return `the command \`true\` was still running after ${TRY_THE_VIEW_MS / 1000} seconds and was stopped`
  return tried.code === 0 ? null : `the command \`true\` exited ${tried.code}`
}

/** END WHAT RUNS INSIDE FOR THIS CHECK NOW, by the host group it was registered under. For a stop of this tool. */
export function stopWhatRunsInside(sandbox) {
  const running = sandbox?.running
  if (running === null || running === undefined) return
  sandbox.running = null
  try {
    process.kill(-running.hostPgid, 'SIGTERM')
  } catch {
    /* already gone */
  }
}

// ============================================================================ the model's login

/**
 * SIGN THE MODEL IN, for one run inside the sandbox. Answers one sentence saying how; throws with a
 * sentence, naming files and never their contents, when it cannot be done. While the provider router is on, it throws
 * as well when the check's private home, or a login seed copied into it, holds an API key, as the launcher refuses such a
 * check (tools/key-router/login-files.mjs).
 */
/** @param {any} sandbox @param {{minutes: number, runtime?: string, model?: string | null, provider?: {id: string, native: string | null} | null, home?: string, now?: number}} options */
export function aLoginForTheModel(sandbox, options) {
  // Check the private home first: signing in on a provider row can remove an old Codex login file.
  const privateWhy = theProviderRouterIsOn() ? whyAStartIsRefusedForTheLoginFiles(sandbox.home, theLoginFilesOfACheckHome([]), "The check's private home,") : null
  if (privateWhy !== null) throw new Error(privateWhy)
  const said = signTheModelIn(sandbox, options)
  const why = theProviderRouterIsOn() ? whyAStartIsRefusedForTheLoginFiles(sandbox.home, theLoginFilesOfACheckHome(sandbox.loginSeeds ?? []), "The check's private home, with its login seeds,") : null
  if (why !== null) throw new Error(why)
  return said
}

/** @param {any} sandbox @param {{minutes: number, runtime?: string, model?: string | null, provider?: {id: string, native: string | null} | null, home?: string, now?: number}} options */
function signTheModelIn(sandbox, { minutes, runtime = 'claude-code', model = null, provider = null, home = homedir(), now = Date.now() }) {
  if (provider !== null && runtime !== 'dsh' && runtime !== 'codex') throw new Error(`Only a DSH check and a Codex check take their key from a provider row, so ${runtime} was not signed in. Nothing was started.`)
  if (runtime === 'codex' && provider !== null) {
    // A ROW THAT NAMES A PROVIDER ROW SIGNS CODEX IN WITH THAT ROW'S KEY ALONE: no template secret is read and no login
    // seed is copied in, so neither the shared home's Codex login nor OPENAI_API_KEY or CODEX_API_KEY is handed. A COPY
    // LEFT BY A CHECK THAT DIED is taken away, since Codex 0.159.2 opens .codex/auth.json whatever its model provider. ITS
    // FOLDER IS MADE, since no seed makes it, and the launcher's CODEX_HOME names it: Codex 0.159.2 does not start when
    // CODEX_HOME names a folder that is not there.
    sandbox.loginSeeds = []
    const login = join(sandbox.home, THE_LOGIN_FILES_IN_A_CHECK_VIEW.codex)
    rmSync(login, { force: true })
    mkdirSync(dirname(login), { recursive: true, mode: 0o700 })
    const names = THE_CODEX_PROVIDER_VARIABLES
    return `Codex signs in with the key of provider ${provider.id}, read from the office's key file and handed as ${names.key} alone, which its model provider ${THE_CODEX_PROVIDER_ID} reads, with ${names.baseAddress} from the provider; no Codex login is copied in.`
  }
  if (runtime === 'codex') {
    const target = join(sandbox.home, THE_LOGIN_FILES_IN_A_CHECK_VIEW.codex)
    const office = readJson(join(sandbox.templateDir, 'sandbox.json'))
    if (office === null) throw new Error('The sandbox template cannot be read, so no Codex model was started.')
    const secrets = theDeclaredSecrets(office, home, runtime)
    if (secrets.unsafe !== null) throw new Error(`${secrets.unsafe} No Codex model was started.`)
    // WHILE THE PROVIDER ROUTER IS ON, a declared key is not handed (theSecretNamesOf), so Codex signs in with its login.
    if (secrets.lines.length > 0 && !theProviderRouterIsOn()) return 'Codex signs in with its declared sandbox secrets, passed by the launcher.'
    if (existsSync(target) && statSync(target).isFile()) return `Codex uses its sandbox login at ${target}.`
    const seed = sandbox.sharedHome === undefined ? null : join(sandbox.sharedHome, THE_LOGIN_FILES_IN_A_CHECK_VIEW.codex)
    if (seed !== null && existsSync(seed) && statSync(seed).isFile()) {
      sandbox.loginSeeds = [{ host: seed, container: '/login/codex.json', target: THE_LOGIN_FILES_IN_A_CHECK_VIEW.codex }]
      return `Codex uses its sandbox login seed at ${seed}, with refreshed state kept in this check's private home.`
    }
    if (secrets.lines.length > 0) throw new Error(aCodexRunHasNoKeyThroughTheRouter(`The inspector sandbox has no Codex login at ${target}, and its declared Codex secrets are API keys, which no check is handed`))
    throw new Error(`The inspector sandbox has no Codex login at ${target} and no declared Codex secret. Complete the Codex login in this sandbox before asking for a Codex check. Nothing was started.`)
  }
  if (runtime === 'opencode') {
    sandbox.loginSeeds = []
    const key = theOpenCodeKey(model)
    const office = readJson(join(sandbox.templateDir, 'sandbox.json'))
    if (office === null) throw new Error('The sandbox template cannot be read, so no OpenCode model was started.')
    const secrets = theDeclaredSecrets(office, home, runtime, [key])
    if (secrets.unsafe !== null) throw new Error(`${secrets.unsafe} No OpenCode model was started.`)
    if (!secrets.names.includes(key)) throw new Error(`The inspector sandbox has no declared ${key} for OpenCode. No model was started.`)
    return `OpenCode signs in with its declared ${key}, passed by the launcher to this check's private native state.`
  }
  if (runtime === 'dsh' && provider !== null) {
    // A ROW THAT NAMES A PROVIDER ROW SIGNS DSH IN WITH THAT ROW'S KEY ALONE: the template's secrets are not read.
    sandbox.loginSeeds = []
    const names = theDshProviderVariables(provider.native)
    return `DSH signs in with the key of provider ${provider.id}, read from the office's key file and handed as ${names.key} alone, with ${names.baseAddress} from the provider; its native state is kept in this check's private home at ${DSH_CHECK_ENV.DSH_HOME}.`
  }
  if (runtime === 'dsh') {
    // A DSH CHECK HAS NO LOGIN FILE: its one key is DEEPSEEK_API_KEY, passed by --secret (uVlfyTGEjhbq).
    sandbox.loginSeeds = []
    const office = readJson(join(sandbox.templateDir, 'sandbox.json'))
    if (office === null) throw new Error('The sandbox template cannot be read, so no DSH model was started.')
    const secrets = theDeclaredSecrets(office, home, 'dsh', ['DEEPSEEK_API_KEY'])
    if (secrets.unsafe !== null) throw new Error(`${secrets.unsafe} No DSH model was started.`)
    if (!secrets.names.includes('DEEPSEEK_API_KEY')) throw new Error('The inspector sandbox has no declared DEEPSEEK_API_KEY for DSH. No model was started.')
    return `DSH signs in with its declared DEEPSEEK_API_KEY, passed by the launcher; its native state is kept in this check's private home at ${DSH_CHECK_ENV.DSH_HOME}.`
  }
  if (runtime !== 'claude-code') throw new Error(`Inspector harness ${runtime} is not supported. Nothing was started.`)
  const target = join(sandbox.home, THE_LOGIN_FILES_IN_A_CHECK_VIEW.claude)
  const office = readJson(join(sandbox.templateDir, 'sandbox.json'))
  if (office === null) throw new Error(`${join(sandbox.templateDir, 'sandbox.json')} cannot be read, so which secrets reach the sandbox cannot be said.`)
  const secrets = theDeclaredSecrets(office, home)
  if (secrets.unsafe !== null) throw new Error(`${secrets.unsafe} The check's model was not started.`)
  if (secrets.lines.some((line) => line.startsWith(`${THE_TOKEN}=`) && line.length > THE_TOKEN.length + 1)) {
    // A COPY LEFT BY A CHECK THAT DIED is taken away, so the one login the model has is the token.
    rmSync(target, { force: true })
    return `The model signs in with ${THE_TOKEN} from ${secrets.file}, which the launcher passes in through an env file of mode 600.`
  }

  const source = join(home, '.claude', '.credentials.json')
  const remedy =
    `Put ${THE_TOKEN}=<a token from \`claude setup-token\`> in ${secrets.file ?? 'the secrets file the template names'} (mode 600), ` +
    'or sign in to Claude on this machine. The check\'s model was not started.'
  if (!existsSync(source)) throw new Error(`There is no Claude login to give the sandbox: ${THE_TOKEN} is not set and ${source} does not exist. ${remedy}`)
  const held = readJson(source)
  const oauth = held?.claudeAiOauth
  if (typeof oauth?.accessToken !== 'string' || oauth.accessToken === '') {
    throw new Error(`${source} holds no Claude login this tool can read (no claudeAiOauth access token). ${remedy}`)
  }
  let good = 'how long it is good for is not written in it'
  if (typeof oauth.expiresAt === 'number') {
    const left = oauth.expiresAt - now
    const needed = minutes * 60_000 + LOGIN_MARGIN_MS
    if (left < needed) {
      spoolAGateMet('a-models-login-outlasts-the-check', 'block', sandbox.instance)
      throw new Error(
        `The Claude login in ${source} is good for ${Math.max(0, Math.floor(left / 60_000))} more minutes, and this check may take ` +
          `${minutes} (with ${LOGIN_MARGIN_MS / 60_000} to spare). The sandbox is not given the refresh token, because a refresh ` +
          'there would sign out every Claude session on this machine, so the login could not be renewed inside. Use Claude on ' +
          `this machine once so it renews its own login, then ask for the check again. ${remedy}`,
      )
    }
    good = `it is good for ${Math.floor(left / 60_000)} more minutes`
  }
  const { refreshToken: _notGiven, refreshTokenExpiresAt: _notEither, ...withoutRefresh } = oauth
  const seed = join(sandbox.checkDir, 'login-seeds', 'claude.json')
  mkdirSync(dirname(seed), { recursive: true, mode: 0o700 })
  writeFileSync(seed, `${JSON.stringify({ claudeAiOauth: withoutRefresh })}\n`, { mode: 0o600 })
  chmodSync(seed, 0o600)
  sandbox.login = seed
  sandbox.loginSeeds = [{ host: seed, container: '/login/claude.json', target: THE_LOGIN_FILES_IN_A_CHECK_VIEW.claude }]
  return `The model signs in with a copy of this machine's Claude login, without its refresh token, seeded read-only from ${seed} at mode 600, with native state in this check's private home; ${good}.`
}

/** Remove only this check's transient controller seed; its native home remains private. */
export function takeTheLoginBack(sandbox) {
  if (sandbox?.login === null || sandbox?.login === undefined) return
  rmSync(sandbox.login, { force: true })
  sandbox.login = null
  sandbox.loginSeeds = []
}

// ============================================================================ a check that ends with no verdict

/** The note a check's folder keeps when its view went: when its check ended (case 1 below), or by hand (the view sweep's notes). */
export const VIEW_REMOVED_NOTE = 'view-removed.json'
/** The shape of a check's id, as the office makes one. */
export const A_CHECK_ID = /^[A-Za-z0-9_-]{12}$/
const THE_RULE = 'the rule for a check with no verdict'

/**
 * THE CONTAINERS OF ONE CHECK'S VIEW, the stopped ones too, by the label the launcher puts on each (CHECK_VIEW_LABEL):
 * `{ names }`, or `{ why }` when docker could not be asked.
 * @param {string} check
 */
export function theCheckViewsContainers(check) {
  const asked = spawnSync('docker', ['ps', '-a', '--filter', `label=${CHECK_VIEW_LABEL}=${check}`, '--format', '{{.Names}}'], { encoding: 'utf8', timeout: LAUNCHER_MS })
  if (asked.error !== undefined) return { why: `docker ps could not be run: ${asked.error.message}` }
  if (asked.status !== 0) return { why: `docker ps exited ${String(asked.status ?? asked.signal)}: ${String(asked.stderr ?? '').trim() || 'it said nothing'}` }
  return { names: asked.stdout.split('\n').filter((name) => name !== '') }
}

/**
 * THE VIEW OF A CHECK THAT ENDED WITH NO VERDICT, by the rule for one. `left` is what its model left: `{ nothing: true,
 * error, readings }` when it wrote nothing, else `{ nothing: false, because }`.
 *
 * Case 1, its model wrote nothing: its view check-views/<check> is removed and its note checks/a-check-of-<run>-<check> is
 * kept, with view-removed.json saying why, so the same check id is refused if it is asked again (aSandboxForThisCheck). The
 * view goes only when the check's id is in the shape of one, the view is a folder and not a link, its real path is in
 * check-views, the check's own check-view container is gone, and no process this tool can read works in it or holds a
 * file open in it. A process it cannot read keeps no view whose own container is gone. The note is written before the
 * removal, so a removal that stops part way leaves the note, and <check>.PARTLY-REMOVED.txt beside the view says so.
 * Case 2, anything else: the note and the view are both kept, and the sentence says why. Nobody is told in either case.
 * Answers `{ ok, says }`; ok is false only when the removal stopped part way.
 * @param {any} sandbox
 * @param {{ nothing: true, error: string, readings: string[] } | { nothing: false, because: string }} left
 */
export function theViewOfACheckWithNoVerdict(sandbox, left, { processes = theProcessesUsing, containers = theCheckViewsContainers, now = new Date() } = {}) {
  const { check } = sandbox.asked
  const view = sandbox.privateRoot
  const kept = (/** @type {string} */ because) => ({ ok: true,
    says: `The check ended with no verdict, so its note ${sandbox.checkDir} and its view ${view} are both kept, because ${because} (case 2 of ${THE_RULE}).` })
  if (!left.nothing) return kept(left.because)
  if (!A_CHECK_ID.test(check)) return kept(`its check id ${check} is not in the shape of a check id`)
  const views = join(sandbox.folder, 'check-views')
  const stat = lstatSync(view, { throwIfNoEntry: false })
  if (stat === undefined) return { ok: true, says: `The check ended with no verdict and its model wrote nothing; it has no view at ${view}, and its note ${sandbox.checkDir} is kept.` }
  if (stat.isSymbolicLink()) return kept(`${view} is a link`)
  if (!stat.isDirectory()) return kept(`${view} is not a folder`)
  let real
  try {
    real = realpathSync(view)
    if (real !== join(realpathSync(views), check)) return kept(`its real path ${real} is not in ${views}`)
  } catch (error) {
    return kept(`its real path could not be read: ${error instanceof Error ? error.message : String(error)}`)
  }
  const own = containers(check)
  if ('why' in own) return kept(`docker could not be asked whether its own container is gone: ${own.why}`)
  if (own.names.length > 0) return kept(`its own container ${own.names.join(', ')} is still there`)
  let read
  try {
    read = processes(real)
  } catch (error) {
    return kept(`the processes that may use it could not be read: ${error instanceof Error ? error.message : String(error)}`)
  }
  if (read.using.length > 0) return kept(read.using.join(', '))
  const note = join(sandbox.checkDir, VIEW_REMOVED_NOTE)
  const said = { check, moved: 'nothing; the view was removed when its check ended', bytes: null, removedAt: localStamp(now),
    resume: 'This check can no longer resume: its view is removed.', why: `case 1 of ${THE_RULE}: its model wrote nothing`,
    error: left.error, readings: left.readings, processesNotRead: read.unreadable.length === 0 ? null : theProcessesNotRead(read.unreadable) }
  try {
    writeFileSync(note, `${JSON.stringify(said, null, 2)}\n`, { flag: 'wx', mode: 0o600 })
  } catch (error) {
    return kept(`${note} could not be written: ${error instanceof Error ? error.message : String(error)}`)
  }
  try {
    rmSync(real, { recursive: true })
  } catch (error) {
    const why = error instanceof Error ? error.message : String(error)
    const partly = join(views, `${check}.PARTLY-REMOVED.txt`)
    const what = `The view ${view} was being removed at ${localStamp(now)}, by case 1 of ${THE_RULE}, and the removal stopped part way: ${why}. What is left of it was not looked at again. The check's note ${sandbox.checkDir} keeps ${VIEW_REMOVED_NOTE}.`
    try {
      writeFileSync(partly, `${what}\n`, { flag: 'wx', mode: 0o600 })
    } catch (failed) {
      return { ok: false, says: `${what} ${partly} could not be written to say so: ${failed instanceof Error ? failed.message : String(failed)}.` }
    }
    return { ok: false, says: `${what} ${partly} says so.` }
  }
  return { ok: true, says: `The check ended with no verdict and its model wrote nothing, so its view ${view} is removed and its note ${sandbox.checkDir} is kept (case 1 of ${THE_RULE}).` }
}

// ============================================================================ leaving

/**
 * Leave the shared image instance. Remove delivered, unguarded private state; keep guarded evidence. A check with no
 * verdict keeps its note, and its view goes by the rule for one (theViewOfACheckWithNoVerdict), read from `left`, what
 * its model left: no `left` keeps both. The last live check stops the shared instance through its existing ledger row.
 * @param {any} sandbox
 * @param {{ delivered: boolean, left?: { nothing: true, error: string, readings: string[] } | { nothing: false, because: string } | null }} options
 */
export function leaveTheSandbox(sandbox, { delivered, left = null }) {
  // WHAT IS THIS CHECK'S OWN IS ENDED FIRST: its own process group, and nothing else's.
  stopWhatRunsInside(sandbox)
  rmSync(theProviderKeyFileOf(sandbox.hostOnly, sandbox.asked.check), { force: true })
  const said = []
  // THE LOGIN FILES A CHECK'S VIEW MAY HOLD ARE REMOVED, whatever the verdict: a kept view outlives the check.
  const removed = []
  for (const file of Object.values(THE_LOGIN_FILES_IN_A_CHECK_VIEW)) {
    if (!existsSync(join(sandbox.home, file))) continue
    rmSync(join(sandbox.home, file), { force: true })
    removed.push(file)
  }
  said.push(removed.length === 0
    ? "The check's private home held no login file."
    : `The login ${removed.length === 1 ? 'file' : 'files'} ${removed.join(' and ')} ${removed.length === 1 ? 'is' : 'are'} removed from the check's private home.`)
  let ok = true
  if (sandbox.checkDir !== null && existsSync(sandbox.checkDir)) {
    if (delivered && !sandbox.keepPrivate) {
      rmSync(sandbox.checkDir, { recursive: true, force: true })
      rmSync(join(sandbox.folder, 'check-views', sandbox.asked.check), { recursive: true, force: true })
    }
    else if (delivered) said.push(`The check's folder ${sandbox.checkDir} is kept, with the prompt and what the commands said, because private cleanup was refused.`)
    else {
      const view = theViewOfACheckWithNoVerdict(sandbox, sandbox.keepPrivate ? { nothing: false, because: 'private cleanup was refused' }
        : left ?? { nothing: false, because: 'what its model left was not read' })
      said.push(view.says)
      ok = view.ok
    }
  }

  const unlock = theLockNow(sandbox.hostOnly)
  if (unlock === null) {
    rmSync(sandbox.marker, { force: true })
    // Another check owns the shared instance lock. This check's private-state decision is already made.
    said.push(`The sandbox ${sandbox.instance} is left up, and the model's login with it: another check of this inspector held its lock for ${LOCK_WAIT_LEAVING_MS / 1000} seconds, so it is starting or leaving it.`)
    return { ok, says: said.join(' ') }
  }
  try {
    rmSync(sandbox.marker, { force: true })
    const others = theChecksStillUsingIt(sandbox.hostOnly, sandbox.asked.check)
    if (others.length > 0) {
      // THE ROW GOES WITH THE CONTAINER, to a check still using it, under this same lock.
      const handed = theRowHandedOn(sandbox, others)
      if (handed !== null) said.push(handed)
      // Other checks retain their own native homes; only the last live check stops the shared instance.
      said.push(`The sandbox ${sandbox.instance} is left up on purpose, and the model's login with it: ${others.length === 1 ? 'another check is' : `${others.length} other checks are`} still using it (${others.join(', ')}), and the last to leave takes the login back and stops it.`)
      return { ok, says: said.join(' ') }
    }
    // Remove any remaining seed owned by this check, then stop the shared image instance.
    takeTheLoginBack(sandbox)
    const there = (() => {
      try {
        return readHostInstance(sandbox.folder) !== null
      } catch {
        return true // unreadable, so down says what is wrong with it
      }
    })()
    if (!there) {
      said.push(`There is no sandbox ${sandbox.instance} to stop: the host holds no copy of the facts of ${sandbox.folder}.`)
      return { ok, says: said.join(' ') }
    }
    // THE ROW IS IN THE PROJECT, AND UNDER THE SESSION, OF THE CHECK THAT STARTED THE SANDBOX. Acceptance finding 51
    // (report EnJvvsDTF_Dx, block f-51): the sandbox is shared by checks from every project, and the last to leave
    // may not be the one that registered it; asked in its own project, the ledger said it held no such row.
    const theRow = theRowToStop(readHostInstance(sandbox.folder), sandbox.asked)
    const args = [
      THE_LAUNCHER, 'down', sandbox.instance, '--force', '--json',
      '--as', sandbox.asked.handle, '--session', theRow.session, '--api', sandbox.asked.api, '--workspace', theRow.workspace,
      ...(sandbox.asked.sandboxes === null ? [] : ['--sandboxes', sandbox.asked.sandboxes]),
    ]
    const down = spawnSync(process.execPath, args, { encoding: 'utf8', timeout: LAUNCHER_MS, env: { ...process.env, ...theKeyOnTheHost(sandbox.asked) } })
    if (down.status !== 0) {
      said.push(`The sandbox ${sandbox.instance} could NOT be stopped (node tools/sandbox.mjs down exited ${down.status ?? down.signal}): ${theEndOf(down.stderr ?? '', 6)} Stop it with node tools/sandbox.mjs down ${sandbox.instance} --force.`)
      return { ok: false, says: said.join(' ') }
    }
    said.push(`The sandbox ${sandbox.instance} is stopped through the ledger, and its folder ${sandbox.folder} is kept.`)
    return { ok, says: said.join(' ') }
  } finally {
    unlock()
  }
}
