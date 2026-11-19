// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT THE SANDBOX LAUNCHER AND ITS HELPER INSIDE THE CONTAINER BOTH NEED, WRITTEN ONCE.
 *
 * `tools/sandbox.mjs` runs on the host and `tools/sandbox-start.mjs` runs inside the sandbox. They
 * share three facts, and each is worked out here and nowhere else (USER.md, invariant 9):
 *
 *   1. Where an instance keeps its own facts. `up` writes them twice. The host's copy is
 *      `<sandboxes>/.run/<instance>/instance.json`, in a folder no sandbox can see, and every host tool reads
 *      that copy alone. The folder's copy is `<instance folder>/instance.json`, read by the helper inside,
 *      where the folder has the same path; a run can rewrite it, so no host code reads it.
 *   2. What a run's `sandbox` field says: `{template, container}`, where `container` is the id of the
 *      container's row in the resources ledger (the session kind's own description, src/shared/kinds.ts).
 *   3. How either of them talks to the office: its HTTP API, with the headers built from the caller's
 *      identity. A key is sent only from the environment (MOLE_AGENT_KEY), never from a command line.
 *
 * Two more facts are here because tools/inspector-sandbox.mjs, which runs a check's model in a
 * sandbox, needs them as well as the launcher: how a ledger row is released through the office's
 * door, and which of a template's declared secrets the host's secrets file sets. And one more, which the merge queue
 * needs too: where the bare mirror of a checkout's main is, the origin of every sandbox clone made from that checkout
 * (theMainMirrorOf, item 2f).
 *
 * NOTHING HERE STARTS ANYTHING. It reads and writes one small JSON file and makes requests; the one
 * request that stops something is the ledger's release door, asked in `releaseThroughTheLedger`.
 */

import { spawnSync } from 'node:child_process'
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, readlinkSync, realpathSync, renameSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, isAbsolute, join, resolve, relative, posix, sep } from 'node:path'
import { createHash, randomBytes } from 'node:crypto'
// THE AGENT'S OWN KEY AND THE HEADERS IT IS SENT UNDER live in for-agents/agent-key.mjs, because the waiter an
// installed office ships needs them and tools/ never ships. They are exported from here as before.
import { anAgentsToolHeaders } from '../for-agents/agent-key.mjs'
export { theAgentKey, anAgentsToolHeaders } from '../for-agents/agent-key.mjs'
import { spoolAGateMet } from '../src/config/gate-count-spool.mjs'
import { THE_LONGEST_FINISH_WAIT_MS } from '../src/config/finished.mjs'
import { theStableCheckoutFolder } from '../src/config/sandbox-folder.mjs'
import { SANDBOX_SLICE } from '../src/config/sandbox-slice.mjs'
import { theKeyARunsToolSends } from '../src/config/run-permissions.mjs'
import { LAUNCHER_MODEL_COMPATIBILITY } from '../src/config/model-efforts.mjs'
import { readLauncherSelection, THE_PROGRAM_A_RUNTIME_RUNS } from '../src/config/launcher-selection.mjs'
import { guardedGitRun } from './sandbox-git.mjs'
import { aFileWrittenWhole, claudeCodeSettingsWithTheToolsDenied } from './harness-features-off.mjs'
export { THE_MODELS_START_VALUES } from '../src/config/model-efforts.mjs'
// HOW A RUN'S TOOL IS STARTED, AND THE REQUESTS THAT ASK THE OFFICE, live in src/config/sandbox-start-values.mjs,
// because the message worker an installed office ships needs them and tools/ never ships. They are exported from
// here as before. The two start functions are exported with the DSH check handed in (below theDshSelection).
import { aCommandsStartValues as theStartValuesWithoutTheDshCheck, aCommandsStartFromTheOffice as theStartFromTheOfficeWithoutTheDshCheck, askTheOffice, theOfficeSaid } from '../src/config/sandbox-start-values.mjs'
export { REQUEST_TIMEOUT_MS, askTheOffice, theOfficeSaid, DSH_START_WORDS, theModelsStartValues, aCommandsRuntime, recheckLauncherSelection } from '../src/config/sandbox-start-values.mjs'

/** The file in an instance folder that says what the instance is. */
export const INSTANCE_FILE = 'instance.json'

/**
 * THE LAUNCHER'S OWN FOLDER FOR AN INSTANCE, beside the instance folders: `<sandboxes>/.run/<instance>`. It is never
 * mounted into a sandbox, so a run cannot read or change what is in it. It holds the host's copy of the instance's facts,
 * the instance copy of devcontainer.json and the per-command env files. `dir` is the instance folder.
 */
export const HOST_ONLY_FOLDER = '.run'
export function theHostOnlyFolder(dir) {
  return join(dirname(dir), HOST_ONLY_FOLDER, basename(dir))
}

/** The folder of the mirrors of main, beside the instance folders (theMainMirrorOf). */
const MAIN_MIRRORS_FOLDER = '.main-mirrors'
/**
 * THE BARE MIRROR OF A CHECKOUT'S MAIN, the origin of every sandbox clone made from that checkout (item 2f):
 * `<sandboxes>/.main-mirrors/<the checkout's folder name>-<12 hex of the sha256 of its real path>.git`. There is one
 * for each checkout, beside the instance folders and never in one, and a container is given it read-only. The launcher
 * on the host makes it at `up` and brings it forward at `up` and at each agent's start (tools/sandbox-git.mjs). No
 * sandbox writes to it. The name is worked out from the checkout's real path, so a link to the checkout names the same
 * mirror, and the checkout must be there. The merge queue is to find the mirror here too, and to bring it forward at
 * each landing, so the name and the arguments stay as they are.
 * @param {string} sandboxes
 * @param {string} from
 */
export function theMainMirrorOf(sandboxes, from) {
  const real = realpathSync(from)
  return join(resolve(sandboxes), MAIN_MIRRORS_FOLDER, `${basename(real)}-${createHash('sha256').update(real).digest('hex').slice(0, 12)}.git`)
}

/**
 * THE CHECKOUT A SANDBOX'S CLONE WAS MADE FROM, by its real path, when the clone's origin is that checkout's mirror in
 * `sandboxes` (theMainMirrorOf), or null. tools/inspector-sandbox.mjs asks it of a worker's worktree, so that a run of
 * the office's own repository from a sandbox is checked as the office's.
 *
 * The clone's config is the sandbox's to write, so its origin is only a claim. The mirror's config is not: no sandbox
 * can write the mirror, and the launcher that made it wrote down the checkout it mirrors (`mole-office.source`). The
 * checkout is answered only when theMainMirrorOf, worked out again for that checkout, is exactly the clone's origin.
 * Anything else is null and is never guessed at: no origin, an origin elsewhere, a mirror that names no checkout, or a
 * checkout that is not there. `sandboxes` comes from the caller and never from the origin's path.
 * @param {string} clone a folder in the clone, or one of its worktrees
 * @param {string} sandboxes
 * @returns {string | null}
 */
export function theCheckoutAMirrorCloneCameFrom(clone, sandboxes) {
  const read = (directory, args) => {
    const asked = guardedGitRun(directory, args, { timeout: 30_000, maxBuffer: 1024 * 1024 })
    return asked.status === 0 ? String(asked.stdout).trim() : null
  }
  const origin = read(clone, ['config', '--get', 'remote.origin.url'])
  if (origin === null || !isAbsolute(origin) || !existsSync(join(origin, 'config'))) return null
  const recorded = read(origin, ['config', '--file', join(origin, 'config'), '--get', 'mole-office.source'])
  if (recorded === null || !isAbsolute(recorded)) return null
  let source
  try { source = realpathSync(recorded) } catch { return null }
  return theMainMirrorOf(sandboxes, source) === origin ? source : null
}

/**
 * THE CHECKOUT A SANDBOX'S CLONE MADE BEFORE ITEM 2f CAME FROM, by its real path, or null. Such a clone is a `git clone
 * --shared` of the checkout, so its origin is the checkout, written as `up` was given it. An agent's start since 2f
 * copies its objects in and removes its alternates file; in a container started before 2f there is no mirror, so the
 * origin stays the checkout (OWN_PACKAGES_AND_ORIGIN in tools/sandbox.mjs). tools/inspector-sandbox.mjs asks this when
 * a clone borrows nothing and is no mirror's clone.
 *
 * The origin is a claim, as the alternates file was: a run in the sandbox can rewrite either. It is taken only for
 * `<sandboxes>/<instance>/repo`, and only when it is exactly the `from` in the host's copy of that instance's facts
 * (readHostInstance), which no sandbox can write. The same checkout through a link, or with a slash after it, is not
 * that `from`, and nor is another instance's. Anything else is null: the clone is then its own repository, as before.
 * @param {string} clone the root of the clone, by its real path
 * @param {string} sandboxes
 * @returns {string | null}
 */
export function theCheckoutAnOlderCloneCameFrom(clone, sandboxes) {
  let folder
  try { folder = realpathSync(sandboxes) } catch { return null }
  const dir = dirname(clone)
  if (basename(clone) !== 'repo' || dirname(dir) !== folder) return null
  const from = readHostInstance(dir)?.from
  if (typeof from !== 'string' || !isAbsolute(from)) return null
  const origin = guardedGitRun(clone, ['config', '--get', 'remote.origin.url'], { timeout: 30_000, maxBuffer: 1024 * 1024 })
  if (origin.status !== 0 || String(origin.stdout).trim() !== from) return null
  try { return realpathSync(from) } catch { return null }
}

/**
 * WHY A HOST FOLDER MAY NOT GO INTO A SANDBOX AS, IN OR AROUND THE STABLE CHECKOUT, or null when it may. The stable
 * checkout (theStableCheckoutFolder, src/config/sandbox-folder.mjs) serves the live database and holds its keys, so the
 * launcher's --from, every --ro and every check view mount is asked here before it is mounted. The home is read when
 * this is asked. Both paths are compared as written and as they are on disk (the realpath of the nearest folder that
 * exists, with the rest after it), so a link to one cannot stand in for the other.
 * @param {string} path an absolute host path
 * @returns {string | null}
 */
export function whyAPathIsTheStableCheckout(path) {
  const stable = theStableCheckoutFolder(homedir())
  const how = howAPathMeets(path, stable)
  return how === null ? null : `${path} ${how} the stable checkout, ${stable}, which serves the live database and holds its keys. No sandbox mounts it, a folder in it or a folder that holds it.`
}

/**
 * HOW A HOST PATH MEETS A FOLDER NO SANDBOX MAY MOUNT: 'is', 'is inside', 'holds', or null when it does not. Both are
 * compared as written and as they are on disk (the realpath of the nearest folder that exists, with the rest after it),
 * so a link to one cannot stand in for the other. The stable checkout is asked here, and so is the office's data folder
 * (tools/the-offices-data-folder.mjs).
 * @param {string} path an absolute host path
 * @param {string} folder an absolute host folder
 * @returns {'is' | 'is inside' | 'holds' | null}
 */
export function howAPathMeets(path, folder) {
  const onDisk = (given) => {
    let held = given
    const rest = []
    while (!existsSync(held) && dirname(held) !== held) { rest.unshift(basename(held)); held = dirname(held) }
    return join(realpathSync(held), ...rest)
  }
  const inside = (inner, outer) => { const r = relative(outer, inner); return r !== '' && !r.startsWith('..') && !isAbsolute(r) }
  for (const one of new Set([resolve(path), onDisk(resolve(path))])) {
    for (const other of new Set([folder, onDisk(folder)])) {
      const how = one === other ? 'is' : inside(one, other) ? 'is inside' : inside(other, one) ? 'holds' : null
      if (how !== null) return how
    }
  }
  return null
}

/**
 * A check view has only controller-declared mounts, as its declared interface says.
 * Validate before starting Docker. Both host and container ancestry matter: a read-only child of
 * writable storage can be replaced through its parent. No symlink in a source tree is trusted.
 * The controller must keep the spec and source parents outside model-writable storage while starting.
 */
export function readCheckView(file, { instance, dir, cwd }) {
  const fail = words => { throw new Error(`Check view refused: ${words}`) }
  const object = (value, keys, where) => {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) fail(`${where} must be an object.`)
    const extra = Object.keys(value).filter(key => !keys.includes(key))
    if (extra.length) fail(`${where} has unknown fields: ${extra.join(', ')}.`)
  }
  const inside = (path, parent) => path === parent || path.startsWith(parent + '/')
  const overlaps = (a, b) => inside(a, b) || inside(b, a)
  const aCheckPrivatePath = path => {
    const parts = relative(dirname(dir), path).split('/')
    return parts[0] !== '..' && parts[1] === 'check-views'
  }
  const absolute = (path, where, container = false) => {
    if (typeof path !== 'string' || !isAbsolute(path) || /[,\r\n\0]/.test(path) || (container ? posix.resolve(path) : resolve(path)) !== path || path === '/') {
      fail(`${where} must be an absolute normalized path, below the root, without commas or line breaks.`)
    }
    return path
  }
  const noLinks = (path, descend = false, writable = false, containerRoot = null) => {
    let ancestor = path
    while (!existsSync(ancestor)) {
      if (lstatExists(ancestor)) fail(`${ancestor} is a dangling symlink.`)
      ancestor = dirname(ancestor)
    }
    if (realpathSync(ancestor) !== ancestor) fail(`${path} contains a symlink to another path.`)
    if (!descend) return
    const visit = name => {
      const st = lstatSync(name)
      if (st.isSymbolicLink()) {
        let target
        try { target = realpathSync(name) } catch (error) { fail(`The symlink ${name} cannot be resolved (${error.code ?? error.message}).`) }
        if (!inside(target, path)) fail(`${name} is a symlink that escapes its mount.`)
        const containerLink = posix.join(containerRoot, relative(path, name))
        if (!inside(posix.resolve(posix.dirname(containerLink), readlinkSync(name)), containerRoot)) fail(`${name} is a symlink that escapes its mapped container mount.`)
        return
      }
      if (writable && st.isFile() && st.nlink > 1) fail(`${name} has a writable hard-link alias; private files must have one link.`)
      if (!st.isDirectory() && !st.isFile()) fail(`${name} is not a regular file or directory.`)
      if (st.isDirectory()) for (const child of readdirSync(name)) visit(join(name, child))
    }
    visit(path)
  }
  function lstatExists(path) { try { lstatSync(path); return true } catch (e) { if (e.code === 'ENOENT') return false; throw e } }
  absolute(file, 'The spec path'); noLinks(file)
  if (aCheckPrivatePath(file)) fail('The controller spec must be outside every check-private tree, including other instances.')
  const held = lstatSync(file)
  if (!held.isFile() || held.uid !== process.getuid() || (held.mode & 0o022) !== 0) fail('The spec must be a controller-owned regular file with no group or other write permission.')
  const bytes = readFileSync(file)
  let spec
  try { spec = JSON.parse(bytes.toString('utf8')) } catch { fail('The spec must contain valid JSON.') }
  object(spec, ['check', 'instance', 'readOnly', 'private', 'inputs', 'loginSeeds', 'outputs'], 'The spec')
  if (typeof spec.check !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(spec.check)) fail('The check must be an id of 1 to 80 letters, digits, underscores or hyphens.')
  if (spec.instance !== instance) fail(`The spec must name this instance, ${instance}.`)
  const privateRoot = join(dir, 'check-views', spec.check)
  const mounts = []
  for (const kind of ['readOnly', 'private', 'inputs', 'loginSeeds']) {
    const entries = spec[kind] ?? (['inputs', 'loginSeeds'].includes(kind) ? [] : null)
    if (!Array.isArray(entries)) fail(`${kind} must be a list of mounts.`)
    for (const entry of entries) {
      object(entry, kind === 'loginSeeds' ? ['host', 'container', 'target'] : ['host', 'container'], kind)
      absolute(entry.host, `${kind}.host`); absolute(entry.container, `${kind}.container`, true)
      // These roots are absent from the inspector template image. System roots can contain
      // image symlinks such as /var/run -> /run, which defeat a lexical overlap check.
      if (!['check', 'work', 'inputs', 'login', 'probe', 'protected'].includes(entry.container.split('/')[1])) fail('Mount targets must use the fresh /check, /work, /inputs, /login, /probe or /protected roots; image path aliases are refused.')
      if (!existsSync(entry.host)) fail(`${entry.host} does not exist.`)
      noLinks(entry.host, true, kind === 'private', entry.container)
      const stable = whyAPathIsTheStableCheckout(entry.host)
      if (stable !== null) fail(stable)
      if (inside(dir, entry.host)) fail('A mount cannot expose the whole inspector instance or an ancestor of it.')
      if (kind === 'private' && !inside(entry.host, privateRoot)) fail(`Private mounts must belong to this check under ${privateRoot}.`)
      if (kind === 'loginSeeds') {
        if (!statSync(entry.host).isFile()) fail('A login seed must be a regular file.')
        if (typeof entry.target !== 'string' || entry.target === '' || isAbsolute(entry.target) || entry.target.split('/').some(p => p === '' || p === '.' || p === '..')) fail('A login seed target must be a relative file path inside the private home.')
      }
      mounts.push({ ...entry, readonly: kind !== 'private', kind })
    }
  }
  for (let i = 0; i < mounts.length; i++) for (const other of mounts.slice(0, i)) {
    const one = mounts[i]
    const a = statSync(one.host), b = statSync(other.host)
    if ((a.dev === b.dev && a.ino === b.ino) || overlaps(one.host, other.host) || overlaps(one.container, other.container)) fail(`Mount overlap or alias between ${one.host} at ${one.container} and ${other.host} at ${other.container}.`)
  }
  const seedTargets = (spec.loginSeeds ?? []).map(seed => seed.target)
  if (seedTargets.some((target, index) => seedTargets.slice(0, index).some(other => overlaps(target, other)))) fail('Login seed targets must not overlap or name the same home file.')
  const home = mounts.find(m => m.kind === 'private' && m.host === join(privateRoot, 'home') && m.container === '/check/home')
  if (!home || !statSync(home.host).isDirectory()) fail(`The private home must be ${privateRoot}/home mounted at /check/home.`)
  absolute(cwd, 'The work copy'); noLinks(cwd)
  const work = mounts.find(m => m.kind === 'private' && m.host === cwd && m !== home)
  if (!work || !statSync(cwd).isDirectory()) fail('The work copy must be the root of a private directory mount.')
  const git = join(cwd, '.git')
  if (!existsSync(git) || !lstatSync(git).isDirectory()) fail('The work copy must have its own .git directory; a linked worktree .git file is refused.')
  if (existsSync(join(git, 'commondir')) || existsSync(join(git, 'objects/info/alternates'))) fail('The private .git must not share common administration or alternate objects.')
  object(spec.outputs, ['dir'], 'outputs')
  absolute(spec.outputs.dir, 'The output directory'); noLinks(spec.outputs.dir)
  if (aCheckPrivatePath(spec.outputs.dir)) fail('Controller output must be outside every check-private tree, including other instances.')
  if (existsSync(spec.outputs.dir) && !statSync(spec.outputs.dir).isDirectory()) fail('The output directory must be a directory, not a file.')
  for (const mount of mounts) {
    if (overlaps(spec.outputs.dir, mount.host)) fail('Controller output must be outside every mounted path.')
    if (!mount.readonly && inside(file, mount.host)) fail('The controller spec must be outside every private mount.')
  }
  return { spec, mounts, home, work, privateRoot, sha256: createHash('sha256').update(bytes).digest('hex') }
}

/**
 * HOW LONG OPENCODE WAITS FOR ONE OFFICE TOOL CALL, in milliseconds, written as the office server's `timeout` in the
 * home's opencode.json. With no `timeout` OpenCode gives an MCP tool call the MCP SDK's default request wait, 60 000 ms,
 * and ends the call there, while the office tool waits up to THE_LONGEST_FINISH_WAIT_MS for a write that may seal a run.
 * So a run's finish was cut at 60 s, before the office's answer came. The wait is that finish wait and a margin, read
 * from the one constant.
 *
 * THE MARGIN IS 60 S, for the office tool's own work around its finish wait (tools/worker-delivery/checkpoint.mjs and
 * tools/office-request.mjs). Before the request it may acknowledge the letters an earlier answer showed,
 * CHECKPOINT_LETTERS from one answer, each with up to two requests of at most 2 s. Before a seal it reads the run's
 * record for at most 2 s, and after the answer it reads waiting letters for at most 2 s. That is 36 s, and the rest is
 * for what no wait bounds: reading the run's log and writing the answer.
 *
 * THE SAME KEY IS ALSO THIS SERVER'S START WAIT AND TOOL-LIST WAIT, 30 000 ms each when it is not set, so an office
 * server that never starts is given up on after this wait rather than after 30 s. The server's own key is used rather
 * than experimental.mcp_timeout, which sets the call wait of every MCP server in the file and is marked experimental.
 */
export const THE_OPENCODE_OFFICE_WAIT_MARGIN_MS = 60_000
export const THE_OPENCODE_OFFICE_CALL_WAIT_MS = THE_LONGEST_FINISH_WAIT_MS + THE_OPENCODE_OFFICE_WAIT_MARGIN_MS

/**
 * OpenCode must not ask for external-directory permission in a headless sandbox: nobody can
 * answer, so the run hangs. The sandbox is the boundary; paths outside the worktree are still inside that boundary,
 * so allowing them is safe. Merge the permission and the local office tool into an agent sandbox's own file. Checker sandboxes get the permission alone. No host config or key is copied.
 * Answers the file written, or null when both settings are current. Invalid config refuses before filing.
 */
export function prepareOpenCodeHome(home, officeTool = true) {
  const instance = dirname(home)
  const name = basename(instance)
  const agent = officeTool && !name.startsWith('merge-') && !['inspector-inspector', 'timing'].includes(name)
  const folder = join(home, '.config', 'opencode')
  const file = join(folder, 'opencode.json')
  let held = {}
  if (existsSync(file)) {
    try { held = JSON.parse(readFileSync(file, 'utf8')) }
    catch { throw new Error(`${file} could not be read as JSON, so OpenCode's external-directory permission could not be set. Nothing was started.`) }
  }
  const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
  if (!object(held) || (held.permission !== undefined && !object(held.permission)) || (held.mcp !== undefined && !object(held.mcp))) {
    throw new Error(`${file} must hold a JSON object, with permission and mcp also objects when present, so the settings can be merged while keeping its other keys. Nothing was started.`)
  }
  const permission = held.permission ?? {}
  const mcp = { ...held.mcp }
  if (agent) mcp.mole_office = { type: 'local', command: ['node', join(instance, 'repo/tools/office-mcp.mjs')], enabled: true, timeout: THE_OPENCODE_OFFICE_CALL_WAIT_MS }
  else delete mcp.mole_office
  const next = { ...held, permission: { ...permission, external_directory: 'allow' }, ...(agent || held.mcp !== undefined ? { mcp } : {}) }
  if (JSON.stringify(next) === JSON.stringify(held)) return null
  mkdirSync(folder, { recursive: true })
  writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`)
  return file
}

export const OPENCODE_RUN_HOME_NOTICE = 'OpenCode config now allows external-directory permission.'

/** At a run's start, only OpenCode changes this file. Up still prepares every sandbox's home. */
export function prepareOpenCodeRunHome(home, runtime, officeTool = true) {
  if (runtime !== 'opencode') return null
  return prepareOpenCodeHome(home, officeTool)
}

/**
 * EACH NAMED AGENT'S OPENCODE RUNS KEEP THEIR OWN DATABASE FILE. OpenCode keeps every session of a home in one SQLite
 * file, <data>/opencode.db, unless the variable below names another, and a name that is not absolute is taken inside that
 * data folder. With a file of its own, a finished agent's sessions can be moved off while the others run. The name is
 * flat because SQLite makes no missing folder. An id with any other character gets null, as do a plain command, a start
 * of a run already filed (--run) and an isolated run, which are never asked: they keep OpenCode's default file.
 */
export const THE_OPENCODE_DATABASE_VARIABLE = 'OPENCODE_DB'
/** OpenCode's default file, by the name a round runs on when its session is there: a run started without a file of its own keeps it there. */
export const THE_SHARED_OPENCODE_DATABASE = 'opencode.db'
export function theOpenCodeDatabaseOf(agent) {
  return typeof agent === 'string' && /^[A-Za-z0-9_-]+$/.test(agent) ? `opencode-agent-${agent}.db` : null
}

/** The container label naming its sandbox, shared by the launcher and the watcher. */
export const ID_LABEL = 'mole-office.sandbox'
/** The container label naming the check a check view's container is for, shared by the launcher and the inspector. */
export const CHECK_VIEW_LABEL = 'mole-office.check-view'

/**
 * THE SANDBOX DEFAULTS, held in this one place (an earlier decision).
 * Until then no sandbox container had a limit: at 16:09 a script in the release
 * sandbox grew to 75 GB in 60 seconds on a machine of 93 GB, free memory fell to 2 GB, swap filled, the owner's machine
 * froze and the office stopped answering. The figures, for every sandbox container:
 * - memory 16 GB, with swap counted in it, so that a container cannot fill the machine's swap instead;
 * - at most 8 cores, and below the desktop and the office in priority: cpu-shares 256, under docker's default of 1024;
 * - at most 2000 processes.
 * A template may ask for more, under "raises" in its sandbox.json, with its reason written beside it (theSandboxLimits);
 * the secretary and the agent that owns tools/ decide raises. Docker reads 16g as 16 GiB.
 */
export const SANDBOX_DEFAULTS = Object.freeze({ memory: '16g', cpus: '8', cpuShares: '256', pidsLimit: '2000' })

// ALL SANDBOXES TOGETHER, IN ONE SLICE: src/config/sandbox-slice.mjs says why, and the server's press reads it there.
export { SANDBOX_SLICE }

/**
 * ROOM FOR PICTURES: /dev/shm of 1 GB in every sandbox container whose template names no size of its own (wave 13t's
 * round 19). Docker gives a container 64 MB.
 * Electron without Chromium's own sandbox, as it runs inside ours, returns pictures through /dev/shm, and the desktop
 * window alone peaks near 45 MB, so a picture that did not fit killed the GPU process (the Chinese warning page's
 * capture, 4 October 2026). It is room inside the owner's limits rather than one of them: /dev/shm is memory, and it
 * is counted in the 16 GB. theRoomForPictures gives it.
 */
export const SANDBOX_SHM = Object.freeze({ size: '1g' })

/** Decision, item 4: the free disk never goes under 80 GB (decimal bytes), the floor. */
export const SANDBOX_DISK_FLOOR = Object.freeze({ bytes: 80 * 1_000_000_000, gb: 80 })
/**
 * A NEW BUILD OR TEST STARTS AT THE FLOOR PLUS ITS OWN PEAK (the rule of 9 November 2026, replaced that night by one
 * that keeps 85 GB for a test run and adds an upgrade's measured peak): the floor is the
 * line the disk never crosses, and a run that starts at 80.1 GB writes several GB of its own and goes under, as three did on
 * the night of 8 to 9 November. A test run's peak, as measured: on 7 November at 21:33 two check runs took the disk from
 * 102.4 GB to under 93 GB in ten minutes, about 4.7 GB each, and each left a 1.62 GB view (the lab server's mover of that evening,
 * checkviews-to-nas-1107.py). So 5 GB, and 85 GB to start.
 */
export const SANDBOX_RUN_PEAK = Object.freeze({ bytes: 5 * 1_000_000_000, gb: 5 })
/** Decision, item 4: warn when an instance folder passes 60 GB (decimal bytes). */
export const SANDBOX_FOLDER_WARNING = Object.freeze({ bytes: 60 * 1_000_000_000, gb: 60 })
// DECISION, ITEM 5: after 8 hours, a reminder, never an automatic stop. The office keeps that clock
// and sends the reminder, and it writes the sentence of a Codex stop to the starter, so both are in the office's
// src/config.
export { aCodexStopNotice, aModelToName, SANDBOX_RUN_REMINDER } from '../src/config/launcher-notices.mjs'

/** An ordinary failed command whose output names no recognized stop cause. */
export const UNKNOWN_STOP_CAUSE = 'The office does not know why this run stopped.'

/**
 * THE PARTS OF A MERGE SANDBOX'S FOLDER ITS CLEAR REMOVES (the re-creatable parts of work/ and
 * repo/ go, logs/ and out/ stay). Each is a tree the run that needs it makes again (repo/ from the mirror of main, the
 * rest cloned --shared from the main checkout), and no run reads another entry's tree:
 * - repo/, up's clone of the mirror of main (item 2f);
 * - work/clone, the run's checkout of the pinned commit (tools/merge-tool/integrate.mjs);
 * - work/pair, a pair suite's tree (tools/merge-tool/pairs.mjs);
 * - work/main, main as it stood, run against a file red alone (tools/merge-tool/testing.mjs);
 * - work/bus-<n> and work/without, a bus's tree at each rider and its riders again without the entry that broke a file
 *   (tools/merge-tool/pairs.mjs, since 4 October 2026);
 * - work/second, the name an earlier merge tool gave a pair's second tree, still in folders of 1 to 3 October 2026.
 * Until 5 October 2026 the clear knew only the first three, and 27 of the others, 7.4 GB, stayed in the folders of final
 * entries. work/reports stays: its suite.json is a second copy of the one kept in the entry's workdir, but the person
 * was told reports stay. Logs, out, home, instance.json and the rest keep the run's evidence and identity.
 * @param {string} folder the sandbox's instance folder
 * @returns {string[]} the parts there now, relative to the folder, a link counted as there
 */
export function theReCreatableMergeParts(folder) {
  const there = (part) => { try { lstatSync(join(folder, part)); return true } catch (err) { if (err.code === 'ENOENT') return false; throw err } }
  const buses = there('work') ? readdirSync(join(folder, 'work')).filter((name) => /^bus-[0-9]+$/u.test(name)).sort((a, b) => Number(a.slice(4)) - Number(b.slice(4))) : []
  return ['work/clone', 'work/pair', 'work/main', ...buses.map((name) => `work/${name}`), 'work/without', 'work/second', 'repo'].filter(there)
}

/** What a raise may name, each with the form docker takes, and the number it is compared by. CPU priority is not raised. */
const RAISABLE = Object.freeze({
  memory: { form: /^[1-9][0-9]*g$/, words: 'a whole number of gigabytes such as 48g', size: (value) => Number(String(value).slice(0, -1)) },
  cpus: { form: /^[1-9][0-9]*$/, words: 'a whole number of cores', size: Number },
  pidsLimit: { form: /^[1-9][0-9]*$/, words: 'a whole number of processes', size: Number },
})

/**
 * The limits a sandbox of this template runs with: the defaults, or the template's declared raises. `raises` is its
 * sandbox.json's "raises", { memory?, cpus?, pidsLimit?, because }: each a limit above its default, in the form docker
 * takes, and `because` the reason in words, which a raise must have (the owner's rule 7). Anything else throws, with a
 * sentence naming `where`, before a container is made.
 *
 * A RAISE WITHOUT ITS REASON, OR NOT ABOVE THE DEFAULT, is counted in the gate-count spool under `sandbox`, the sandbox
 * it was to bring up, before it throws (gate a-raise-has-a-reason-and-goes-up). A raise refused for its form, or for a
 * limit a template may not raise, is not that gate's, and is not counted.
 * @param {unknown} raises
 * @param {string} [where] the file the raises were read from, for the sentence
 * @param {string | null} [sandbox] the sandbox these limits are for, which a count names
 * @returns {{memory: string, cpus: string, cpuShares: string, pidsLimit: string}}
 */
export function theSandboxLimits(raises, where = "the template's sandbox.json", sandbox = null) {
  if (raises === undefined) return { ...SANDBOX_DEFAULTS }
  if (typeof raises !== 'object' || raises === null || Array.isArray(raises)) throw new Error(`${where} has "raises" that is not an object.`)
  const limits = { ...SANDBOX_DEFAULTS }
  const named = Object.keys(raises).filter((key) => key !== 'because')
  if (named.length === 0) throw new Error(`${where} has "raises" that raises nothing.`)
  const because = /** @type {Record<string, unknown>} */ (raises).because
  if (typeof because !== 'string' || because.trim().length < 20) {
    spoolAGateMet('a-raise-has-a-reason-and-goes-up', 'block', sandbox)
    throw new Error(`${where} raises ${named.join(', ')} without its reason: a raise says why under "because", in a sentence.`)
  }
  for (const key of named) {
    const rule = RAISABLE[/** @type {keyof typeof RAISABLE} */ (key)]
    if (rule === undefined) throw new Error(`${where} raises ${key}, which a template may not raise: only ${Object.keys(RAISABLE).join(', ')}.`)
    const value = String(/** @type {Record<string, unknown>} */ (raises)[key])
    if (!rule.form.test(value)) throw new Error(`${where} raises ${key} to ${JSON.stringify(value)}, which is not ${rule.words}.`)
    const base = SANDBOX_DEFAULTS[/** @type {keyof typeof SANDBOX_DEFAULTS} */ (key)]
    if (rule.size(value) <= rule.size(base)) {
      spoolAGateMet('a-raise-has-a-reason-and-goes-up', 'block', sandbox)
      throw new Error(`${where} raises ${key} to ${value}, which is not above the default ${base}.`)
    }
    limits[/** @type {keyof typeof limits} */ (key)] = value
  }
  return limits
}

/** The label the merge queue starts an entry's sandbox with, and the name it gives it (tools/merge-tool/office-keeper.mjs). */
const MERGE_ENTRY_LABEL = 'mole-office.merge-entry'
const A_MERGE_SANDBOX_NAME = /^merge-[a-z0-9-]{1,20}-[0-9a-f]{6}$/u

/**
 * THE LIMITS ONE SANDBOX RUNS WITH, from its template's sandbox.json (`office`): theSandboxLimits of the template's "raises",
 * or of its "raisesForAMerge" in their place for a sandbox the merge queue starts (a recorded decision).
 * A merge sandbox is one up is given the label mole-office.merge-entry, with a value, and the name the queue
 * makes for it, merge-<entry>-<six hex>. Both are needed, so a line that gives its own sandbox the label stays at its
 * template's limits. That is hygiene and not a wall: a line could take the name as well. up's memory admission reads the
 * same limits.
 * @param {{ raises?: unknown, raisesForAMerge?: unknown }} office
 * @param {string} where the template's sandbox.json, for the sentence
 * @param {string} name the sandbox
 * @param {Record<string, string>} labels the labels up was given, each key to its value
 * @returns {{ limits: ReturnType<typeof theSandboxLimits>, raised: 'no' | 'template' | 'merge' }}
 */
export function theLimitsOfASandbox(office, where, name, labels) {
  const merge = office.raisesForAMerge !== undefined && (labels[MERGE_ENTRY_LABEL] ?? '') !== '' && A_MERGE_SANDBOX_NAME.test(name)
  if (merge) return { limits: theSandboxLimits(office.raisesForAMerge, `${where} ("raisesForAMerge")`, name), raised: 'merge' }
  return { limits: theSandboxLimits(office.raises, where, name), raised: office.raises === undefined ? 'no' : 'template' }
}

/**
 * The run arguments that hold a container to its limits, for `docker run`, `docker create` and a devcontainer's runArgs
 * alike. --memory-swap is the memory and the swap together, so naming the same figure counts swap in it.
 * @param {{memory: string, cpus: string, cpuShares: string, pidsLimit: string}} [limits]
 * @returns {string[]}
 */
export function theSandboxLimitArgs(limits = SANDBOX_DEFAULTS) {
  return [
    `--memory=${limits.memory}`,
    `--memory-swap=${limits.memory}`,
    `--cpus=${limits.cpus}`,
    `--cpu-shares=${limits.cpuShares}`,
    `--pids-limit=${limits.pidsLimit}`,
    `--cgroup-parent=${SANDBOX_SLICE}`,
  ]
}

/**
 * THE /dev/shm ARGUMENT A CONTAINER GETS: SANDBOX_SHM's size, or nothing when the template's own runArgs name a size.
 * A TEMPLATE'S OWN SIZE STANDS. cfc-gpu gives Isaac Sim 16 GB and ai-news-studio gives PyTorch 2 GB in their runArgs;
 * docker takes the last --shm-size it is given, so a 1 GB after theirs would have cut both (seen in review before this
 * was filed, 5 October 2026). Not a limit, so not refused in runArgs (setsALimitItself).
 * @param {readonly string[]} [runArgs] the template's own runArgs, which come first on the command
 * @returns {string[]}
 */
export function theRoomForPictures(runArgs = []) {
  return runArgs.some((one) => /^--shm-size(=|$)/.test(one)) ? [] : [`--shm-size=${SANDBOX_SHM.size}`]
}

/**
 * MEMORY ADMISSION (after the machine ran short of memory at 19:43 on 5 October 2026). Every
 * container is held to its own limit (theSandboxLimits), but seventeen of them at 16 GiB allow far more than the machine's
 * 93 GiB together. So a sandbox starts, and a merge's or a check's build or test starts in one, only while the memory the
 * machine has available covers what that container may still take under its limit, plus this margin, kept for the
 * desktop and the office. A start refused for it waits and is said; it is never a silent wait.
 */
export const SANDBOX_MEMORY_MARGIN = Object.freeze({ bytes: 8 * 2 ** 30, gib: 8 })

/**
 * The bytes in a docker memory figure: '16g', '512m', '2048k', or a plain count of bytes. Null when it is none of those.
 * @param {string | number} figure
 * @returns {number | null}
 */
export function bytesOfAMemoryFigure(figure) {
  const m = /^(\d+)([bkmg]?)$/i.exec(String(figure).trim())
  if (m === null) return null
  const unit = /** @type {Record<string, number>} */ ({ '': 1, b: 1, k: 2 ** 10, m: 2 ** 20, g: 2 ** 30 })[m[2].toLowerCase()]
  return Number(m[1]) * unit
}

/**
 * The cgroup v2 membership path, or null when it names no usable path.
 * @param {string} text
 * @returns {string | null}
 */
export function theCgroupPath(text) {
  const line = text.split('\n').find((one) => one.startsWith('0::'))
  const path = line?.slice(3)
  if (!path || !path.startsWith('/') || path.split('/').includes('..')) return null
  return path
}

/** The memory file for the same validated membership path.
 * @param {string} text
 * @returns {string | null}
 */
export function theCgroupMemoryPath(text) {
  const path = theCgroupPath(text)
  return path === null ? null : `/sys/fs/cgroup${path === '/' ? '' : path}/memory.current`
}

/**
 * WHETHER THE MACHINE HAS THE MEMORY A START NEEDS: null when it has, or one sentence with the figures when it has not.
 * `available` is what the machine has available (free's "available" column, the kernel's MemAvailable), `limit` the
 * container's memory limit, `used` what the container holds now (0 for one not started yet), all in bytes. What the
 * start needs is what the container may still take under its limit, and SANDBOX_MEMORY_MARGIN.
 * @param {{ available: number, limit: number, used?: number }} reading
 * @returns {string | null}
 */
export function noRoomInMemory({ available, limit, used = 0 }) {
  const still = Math.max(0, limit - used)
  const needs = still + SANDBOX_MEMORY_MARGIN.bytes
  if (available >= needs) return null
  const gib = (/** @type {number} */ bytes) => `${String(Number((bytes / 2 ** 30).toFixed(1)))} GiB`
  return `the machine has ${gib(available)} of memory available, under the ${gib(needs)} this start needs: ` +
    `the ${gib(still)} the sandbox may still take under its ${gib(limit)} limit, and ${String(SANDBOX_MEMORY_MARGIN.gib)} GiB kept for the desktop and the office`
}

/**
 * Whether run arguments set one of these limits themselves, which only the defaults and a declared raise may do: a
 * template's runArgs that did would hold its sandbox to a figure nobody wrote a reason for. --cpu-quota and --cpu-period
 * are docker's older spelling of a CPU limit, which it refuses beside --cpus. --cgroup-parent too: a template that put
 * its sandbox under another slice would take it out of the one all sandboxes are held in together (SANDBOX_SLICE).
 * @param {readonly string[]} runArgs
 * @returns {boolean}
 */
export function setsALimitItself(runArgs) {
  return runArgs.some((one) => /^(--memory|--memory-swap|--memory-reservation|--cpus|--cpu-shares|--cpu-quota|--cpu-period|--pids-limit|--cgroup-parent|-m|-c)(=|$)/.test(one) || /^-[mc][0-9]/.test(one))
}

/** Where instance folders go unless --sandboxes says otherwise, declared where the server reads it too. */
export { SANDBOXES_FOLDER } from '../src/config/sandbox-folder.mjs'

/** Every sandbox's container is named this, then the sandbox's own name. */
export const CONTAINER_PREFIX = 'mole-office-sandbox-'

/**
 * THE OFFICE'S OWN ADDRESS AND IDENTITY, AND THE GIT IDENTITY IT GIVES AN AGENT, which --no-office-variables keeps out of
 * a command in a sandbox (23 September 2026: a plain machine but for its secrets), and which the check tool keeps
 * out of its model on the host as well. One list, so the two cannot drift apart.
 */
// The caller's agent key is identity too: review must not pass it to its throwaway office
// MOLE_OFFICE_ addresses already match isAnOfficesVariable.
export const THE_OFFICES_VARIABLES = Object.freeze([
  'MOLE_AGENT_KEY',
  'MOLE_OFFICE_API', 'MOLE_OFFICE_PORT', 'MOLE_OFFICE_WORKSPACE', 'MOLE_OFFICE_SESSION', 'MOLE_OFFICE_AGENT', 'MOLE_OFFICE_COMMIT_EMAIL',
  'GIT_AUTHOR_NAME', 'GIT_AUTHOR_EMAIL', 'GIT_COMMITTER_NAME', 'GIT_COMMITTER_EMAIL',
  'MOLE_AGENT_KEY_FILE',
])

/**
 * WHICH NAMES ARE THE OFFICE'S, on the host and in a sandbox alike: a check's model must get the
 * same world wherever it runs. The fixed list alone let the merge queue's MOLE_OFFICE_READ_
 * variables reach a check's model, so every MOLE_OFFICE_ name goes too.
 * @param {string} name
 * @returns {boolean}
 */
export function isAnOfficesVariable(name) {
  return THE_OFFICES_VARIABLES.includes(name) || name.startsWith('MOLE_OFFICE_')
}

/** The keys no model or command gets from its caller: an agent's key and a run's key. */
export const THE_KEYS_A_MODEL_NEVER_GETS = Object.freeze(['MOLE_AGENT_KEY', 'SANDBOX_RUN_KEY'])

/**
 * TAKE THE OFFICE'S VARIABLES OUT OF AN ENVIRONMENT by the shared name test.
 * Answers the other names taken out, sorted, so the sandbox helper keeps its explanation of what it removed.
 * @param {Record<string, string | undefined>} env
 * @returns {string[]}
 */
export function takeOutTheOfficesVariables(env) {
  const removed = Object.keys(env).filter(isAnOfficesVariable)
  for (const name of removed) delete env[name]
  return removed.filter((name) => !THE_OFFICES_VARIABLES.includes(name)).sort()
}

/**
 * WHAT AN ISOLATED RUN LEAVES OUT of a container or secrets NAME=value line: the same office names and caller's keys
 * as the host model. Read only the name, since a value can itself hold an equals sign.
 * @param {string} line
 * @returns {boolean}
 */
export function leftOut(line) {
  const name = line.slice(0, line.indexOf('='))
  return isAnOfficesVariable(name) || THE_KEYS_A_MODEL_NEVER_GETS.includes(name)
}

/** One instance.json, or null because nothing is there. */
function readFacts(file) {
  if (!existsSync(file)) return null
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch (why) {
    throw new Error(
      `${file} cannot be read as JSON (${why instanceof Error ? why.message : String(why)}), so what this ` +
        'sandbox is cannot be said. Nothing was done.',
    )
  }
}

/**
 * THE FACTS AS THE SANDBOX ITSELF READS THEM: the copy in the instance folder `dir`, or null because nothing is there.
 * The one reader inside the sandbox is the test runner's port guard (tools/live-office-ports.mjs). The helper
 * (tools/sandbox-start.mjs) never reads it: it is given the facts by the launcher (THE_FACTS_VARIABLE below). NO HOST
 * CODE TAKES A DECISION FROM IT. The folder is mounted writable into the
 * sandbox, so a run can rewrite the file, and a host that took a container name, a template folder or a checkout from
 * it would act for the run: exec into another container with this run's secrets, give it another template's secrets,
 * or cut a worktree from another folder. The host reads readHostInstance. The one host reading of this copy is the
 * launcher's adoption of a sandbox made before the host kept a copy, which checks every fact it acts on against what
 * the host holds itself before it keeps any of them (theFactsTheHostReads in tools/sandbox.mjs).
 */
export function readInstance(dir) {
  return readFacts(join(dir, INSTANCE_FILE))
}

/**
 * THE FACTS THE HOST TAKES ITS DECISIONS FROM: the host's copy, in the launcher's own folder (theHostOnlyFolder), or
 * null because `up` has written none there. A sandbox made before the host kept a copy has only the folder's, and the
 * launcher adopts that copy only after it has checked it (theFactsTheHostReads in tools/sandbox.mjs).
 */
export function readHostInstance(dir) {
  return readFacts(join(theHostOnlyFolder(dir), INSTANCE_FILE))
}

/**
 * PUBLISH ONE FILE WHOLE, IN ONE PLACE: a temporary file of a new random name beside the path, made new ('wx') so a
 * link left at the temporary name is never written through, then renamed onto the path. A reader of the path sees the
 * file that was there or the whole new file, never half of either, and a link left at the path is replaced rather
 * than written through. The mode is the caller's, because each file has its own.
 */
export function writeWhole(file, text, mode) {
  const next = `${file}.${randomBytes(8).toString('hex')}.next`
  writeFileSync(next, text, { mode, flag: 'wx' })
  renameSync(next, file)
}

/** Write one instance.json whole, so a reader never sees half of it. */
function writeFacts(file, facts) {
  writeWhole(file, `${JSON.stringify(facts, null, 2)}\n`, 0o644)
}

/** Write the host's copy of the instance's facts alone, making the launcher's own folder when it is not there yet. */
export function writeHostInstance(dir, facts) {
  const hostOnly = theHostOnlyFolder(dir)
  mkdirSync(hostOnly, { recursive: true, mode: 0o700 })
  writeFacts(join(hostOnly, INSTANCE_FILE), facts)
}

/** Write the instance's facts: the host's copy first, then the folder's copy for the sandbox's own reading. */
export function writeInstance(dir, facts) {
  writeHostInstance(dir, facts)
  writeFacts(join(dir, INSTANCE_FILE), facts)
}

/**
 * THE `sandbox` FIELD OF A RUN THAT HAPPENS IN THIS INSTANCE. Throws when the instance has no ledger
 * row for its container, because then there is nothing true to write in `container`.
 *
 * `folder` is the instance folder AS THE LAUNCHER WAS GIVEN IT, resolved, never the `dir` written in
 * instance.json: that file sits inside the folder a run can write. A files seal reads `folder` to say
 * where the run could not have written, and checks it against the
 * container's ledger row.
 */
export function theSandboxField(instance, folder) {
  if (typeof instance?.template !== 'string' || typeof instance?.containerRow !== 'string' || instance.containerRow === '') {
    throw new Error(
      `The sandbox ${instance?.instance ?? '(unnamed)'} has no ledger row for its container in its ${INSTANCE_FILE}, ` +
        "so a run's sandbox field would have nothing true to name. Start it again with node tools/sandbox.mjs up.",
    )
  }
  return { template: instance.template, container: instance.containerRow, folder }
}

/**
 * THE SANDBOX'S FACTS A START IS GIVEN, AND THE ONE NAME THEY TRAVEL UNDER. The launcher on the host takes them from its
 * own copy (readHostInstance), which no run in the sandbox can write, and gives them to the helper in the environment of
 * that one docker exec. The helper reads them from there and never from the copy in the sandbox's folder: with that
 * copy rewritten, the helper asked the ledger to register its process in another sandbox's container. These are the
 * facts the helper reads: what it registers with (the sandbox's name, its template, its container and that container's
 * ledger row) and where it cuts a worktree (the checkout it was made from, its branch, its other clones). None of them
 * is a key or a token.
 */
export const THE_FACTS_VARIABLE = 'SANDBOX_FACTS'

/**
 * The facts a start is given, as the text of THE_FACTS_VARIABLE, from the host's copy of the sandbox's facts.
 * @param {Record<string, any>} instance the host's copy
 * @returns {string}
 */
export function theFactsAStartIsGiven(instance) {
  return JSON.stringify({
    instance: instance.instance ?? null,
    template: instance.template ?? null,
    containerRow: instance.containerRow ?? null,
    container: instance.container == null ? null : { name: instance.container.name ?? null, id: instance.container.id ?? null },
    from: instance.from ?? null,
    ref: instance.ref ?? null,
    clones: instance.clones ?? null,
  })
}

/**
 * THE FACTS A START WAS GIVEN, read from the text of THE_FACTS_VARIABLE, or a sentence naming what is missing. A fact the
 * start registers with must be there; the others may be null, as they may be in the host's copy. The container may be
 * null, as it may be in the host's copy: the helper then names none, and the ledger reads the pid in the namespace of
 * the program that sent it.
 * @param {string | undefined} text
 * @returns {{ instance: string, template: string, containerRow: string, container: { name: string, id: string | null } | null, from: string | null, ref: string | null, clones: unknown[] | null }}
 */
export function theFactsAStartWasGiven(text) {
  const where =
    `${THE_FACTS_VARIABLE}, which the launcher on the host sets from its own copy of the sandbox's facts. This helper ` +
    "never reads the copy in the sandbox's folder, which a run in the sandbox can rewrite. Start it with " +
    'node tools/sandbox.mjs exec on the host, or from a command that one started. Nothing was started.'
  if (text === undefined || text === '') throw new Error(`This start was given no ${where}`)
  let facts
  try {
    facts = JSON.parse(text)
  } catch {
    throw new Error(`This start was given facts that are not JSON in ${where}`)
  }
  if (facts === null || typeof facts !== 'object' || Array.isArray(facts)) throw new Error(`This start was given facts that are not an object in ${where}`)
  const aName = (value) => typeof value === 'string' && value !== ''
  const missing = [
    ...(aName(facts.instance) ? [] : ['instance']),
    ...(aName(facts.template) ? [] : ['template']),
    ...(aName(facts.containerRow) ? [] : ['containerRow']),
    ...(facts.container === null || aName(facts.container?.name) ? [] : ['container.name']),
    ...(facts.container === null || facts.container?.id === null || aName(facts.container?.id) ? [] : ['container.id']),
    ...(facts.from === null || aName(facts.from) ? [] : ['from']),
    ...(facts.ref === null || aName(facts.ref) ? [] : ['ref']),
    ...(facts.clones === null || Array.isArray(facts.clones) ? [] : ['clones']),
  ]
  if (missing.length > 0) throw new Error(`This start was given facts with no ${missing.join(', ')} that can be used, in ${where}`)
  return facts
}

/**
 * The headers of a request made as an agent: which project, who, which session. The key header goes
 * with them when `key` is given: then that key, under `agent`'s name, and never MOLE_AGENT_KEY. The helper in
 * a sandbox gives a run's own key here for the calls it makes as that run (tools/sandbox-start.mjs). Otherwise
 * it is the key MOLE_AGENT_KEY or MOLE_AGENT_KEY_FILE gives (theAgentKey), and when the environment holds none,
 * the run's own key from the office tool configuration MOLE_OFFICE_TOOL_CONFIGURATION names, read for `agent` and
 * `session` only (a Claude Code run's shell, which holds only that file's path). `env` is the environment read.
 *
 * EVERY CALL CARRIES A TRACE (chapter 4 rule 11). A caller that names its own trace keeps it.
 * Otherwise the trace names the run and the purpose the call is sent with, so it changes when the purpose changes.
 *
 * @param {{ workspace: string, agent: string, session: string, key?: string | null, purpose?: string, trace?: string, env?: Record<string, string | undefined> }} who
 * @returns {Record<string, string>}
 */
export function officeHeaders({ workspace, agent, session, key, purpose = 'normal', trace, env = process.env }) {
  // A CLAUDE CODE RUN'S SHELL HOLDS NO KEY, only the path of the run's office tool configuration (src/config/run-permissions.mjs):
  // so a tool the run starts, tools/slot.mjs or this helper's own ledger writes, takes the run's key from that file when the
  // environment holds none (10 November 2026: an agent's seat and its batch start were refused, 403).
  // A key the caller passes comes first, then the environment's, then the file's, read only for this agent and this run.
  const held = key !== undefined ? key : theKeyARunsToolSends(env, { agent, session }).key
  return {
    'content-type': 'application/json',
    'x-mole-office-workspace': workspace,
    ...anAgentsToolHeaders({ self: agent, withoutAKey: agent, key: held }),
    'x-mole-office-session': session,
    'x-mole-office-purpose': purpose,
    'x-mole-office-trace': trace ?? `${session}-${purpose}`,
  }
}

/**
 * HOW LONG THE LAUNCHER WAITS FOR THE LEDGER WHEN NOTHING ANSWERS, and how often it asks again (acceptance finding 64).
 * The office restarts when a landing moves main, and answers slowly while a suite runs beside it. A down that gave up on
 * the first silence left six merge sandboxes up for 9 to 35 hours on 23 and 24 September 2026, each log saying only
 * "The ledger could not be read". tools/sandbox.mjs down waits this long, and so do the asks that register a command's
 * process row and the asks a hand start makes to the office (askTheOfficeWhileItRestarts; a test may shorten a hand
 * start's wait).
 */
export const THE_LONGEST_WAIT_FOR_THE_LEDGER_MS = 180_000
export const BETWEEN_LEDGER_TRIES_MS = 2_000

/**
 * A WRITE ASKED AGAIN WHILE THE OFFICE REFUSES THE CONNECTION, as it does while it restarts after a landing. Wave 13k's
 * report (block b-8): the launcher and its helper asked the ledger once to
 * register a command's process row, and a build or suite that started while the office restarted never ran.
 *
 * ONLY A REFUSED CONNECTION AND THE STAND-IN'S 503 ARE ASKED AGAIN. In both the request never reached a server, so
 * asking again cannot write twice. The stand-in (tools/serve-dev-stand-in.mjs) answers for the dev supervisor while
 * no server runs on the port, and says that nothing was read or written. It answers during every restart after a
 * landing: the dev supervisor starts it while the new server checks its migrations, and it takes every request
 * waiting in the queue then (wave 13x, round 8, measured on 9 October 2026). A timeout or a connection that broke
 * after the request went out is not asked again, because a write whose answer did not come may still have been
 * written; any other answer, a refusal included, is answered at once. It stops when `stillWanted` says false, and
 * once `longestMs` has passed, and answers the last reply with the reason in `why`. `saying` is told each time it
 * asks again.
 *
 * @param {string} api
 * @param {string} path
 * @param {Parameters<typeof askTheOffice>[2]} options
 * @param {{ longestMs?: number, betweenMs?: number, stillWanted?: () => boolean, saying?: (line: string) => void }} [waiting]
 */
export async function askTheOfficeWhileItRestarts(api, path, options, waiting = {}) {
  const { longestMs = THE_LONGEST_WAIT_FOR_THE_LEDGER_MS, betweenMs = BETWEEN_LEDGER_TRIES_MS, stillWanted = () => true, saying = () => {} } = waiting
  const until = Date.now() + longestMs
  for (;;) {
    const reply = await askTheOffice(api, path, options)
    const standIn = reply.status === 503 && reply.standIn === true
    if (!standIn && (reply.status !== null || reply.code !== 'ECONNREFUSED')) return reply
    const what = standIn ? 'the dev supervisor answered that no server is running' : 'the connection was refused'
    const why = standIn ? theOfficeSaid(reply) : reply.why
    if (!stillWanted()) return { ...reply, why: `${why}; ${what}, and nothing waits for the answer any more` }
    if (Date.now() + betweenMs > until) {
      const still = standIn ? 'the dev supervisor still answered that no server is running' : 'the connection was still refused'
      return { ...reply, why: `${why}; ${still} after asking again for ${String(Math.round(longestMs / 1000))} seconds` }
    }
    saying(
      standIn
        ? `the dev supervisor answered for the office that no server is running (it may be restarting), and nothing was written; asking again in ${String(betweenMs / 1000)} seconds`
        : `the office refused the connection (it may be restarting); asking again in ${String(betweenMs / 1000)} seconds`,
    )
    await new Promise((go) => setTimeout(go, betweenMs))
  }
}

/** The states a run is over in: a run in one of them was ended by a write, which revoked its key. */
export const A_RUN_IS_OVER_IN = Object.freeze(['finished', 'crashed', 'orphaned'])

/**
 * WHETHER A RUN WAS ENDED BY A WRITE BEFORE ITS COMMAND EXITED, read off the launcher's own read of it at the exit.
 * The run's key proved the run when it started, and a write that ends a run revokes its
 * key. So a refusal of that key at the exit may mean the run sealed itself, or somebody ended it. For a round that is
 * the normal order, not a fault.
 *
 * A 403 CAN HAVE OTHER CAUSES (a review), and those are faults the starter is told about.
 * So the launcher reads the run once more as its starter, without the run key, and this case holds only when that read
 * shows the run in a state it is over in. A launcher that holds no run key was not refused for this reason, and any
 * other answer is not this case.
 * @param {number | null} status The status the launcher's read of the run with its key was answered with.
 * @param {boolean} holdsARunKey
 * @param {unknown} stateWithoutTheKey The run's state as the read without the run key showed it; undefined when that
 *   read was not answered with the record.
 * @returns {boolean}
 */
export function theRunEndedBeforeItsCommand(status, holdsARunKey, stateWithoutTheKey) {
  return status === 403 && holdsARunKey && typeof stateWithoutTheKey === 'string' && A_RUN_IS_OVER_IN.includes(stateWithoutTheKey)
}

/**
 * RELEASE ONE LEDGER ROW THROUGH THE OFFICE'S OWN DOOR, which is what stops a container or a
 * process group. Answers the door's reply.
 *
 * The door asks for two things the caller does not decide here:
 *   - FORCE, when the session that registered the row is still running. The caller says whether
 *     to send it; the change log records it either way.
 *   - THE SENTENCE the door can say about exactly what it will stop, sent back as `expect`. The door
 *     writes it into its first refusal; it is read from there and sent back verbatim, and the door
 *     compares it with what it reads on the machine at that moment, so a stale or misread sentence
 *     is refused rather than acted on. It is read out of prose (the launcher's open issue 1), and
 *     this is the one place that reading is written.
 *
 * `told` hears the sentence before it is sent back, so the caller can say what is being stopped.
 */
export async function releaseThroughTheLedger(api, rowId, { force, note, headers, told = () => {} }) {
  const path = `/api/resources/${encodeURIComponent(rowId)}/release`
  const body = { note, ...(force ? { force: true } : {}) }
  const first = await askTheOffice(api, path, { method: 'POST', headers, body })
  if (first.status !== 400) return first
  const sentence = /Send the sentence back as \{"expect": "\.\.\."\}: "([\s\S]+)"$/.exec(String(first.body?.error ?? ''))
  if (sentence === null) return first
  told(sentence[1])
  return askTheOffice(api, path, { method: 'POST', headers, body: { ...body, expect: sentence[1] } })
}

/**
 * A DETAIL OF A FEW KILOBYTES AT MOST, AND THE COMMAND WHOLE (items 2z and 2aa). The detail names a command for its
 * process row and for its seat, and tools/slot.mjs is given it as one argument: by the helper in the sandbox, and by the
 * launcher on the host when it takes the seat itself (exec --wait --slot). Linux refuses one argument over 131,071 bytes
 * (MAX_ARG_STRLEN), so a command of thousands of words would get no seat. The detail is cut at A_DETAILS_MOST_BYTES,
 * never inside a character, and it says how many bytes it left out. The command itself is never cut.
 */
const A_DETAILS_MOST_BYTES = 4096
export function aDetailOfAFewKilobytes(detail) {
  const bytes = Buffer.from(detail, 'utf8')
  if (bytes.length <= A_DETAILS_MOST_BYTES) return detail
  let end = A_DETAILS_MOST_BYTES
  // A byte 10xxxxxx is inside a character, so the cut moves back to the byte that starts the character.
  while ((bytes.readUInt8(end) & 0xc0) === 0x80) end -= 1
  return `${bytes.subarray(0, end).toString('utf8')}… and ${(bytes.length - end).toLocaleString('en-GB')} more bytes`
}

/**
 * WHY tools/slot.mjs GAVE NO SEAT, from what spawnSync answered, in the words both refusals use (item 2aa). A program
 * Linux would not start has no exit code and no signal, only an error, so the words name the error and not "exited null".
 */
export function whyTheSlotToolGaveNoSeat(seated) {
  if (seated.error === undefined) return `tools/slot.mjs exited ${String(seated.status ?? seated.signal)}`
  return seated.error.code === 'E2BIG'
    ? 'tools/slot.mjs could not be started: E2BIG, the error Linux gives for arguments that are too long; one argument may hold at most 131,071 bytes'
    : `tools/slot.mjs could not be run: ${seated.error.message}`
}

/**
 * A STREAM'S BYTES, KEPT AS BYTES AND DECODED ONLY WHOLE (item 2ab). A pipe hands its bytes over in pieces of up to
 * 64 KiB, and a letter of two to four bytes can be cut between two pieces. A piece decoded by itself turns each half of
 * that letter into U+FFFD, so the start line of exec --json, once longer than one piece, was read with letters the
 * command never gave. `atEachLine` is given the bytes of a line, with its newline, as soon as they have come: no letter's
 * bytes hold the newline's byte. It is given the next line for as long as it returns true, so a caller that wants the
 * first line alone returns nothing; its second argument is the bytes that have come after the line. `text()` decodes
 * every byte read so far, and `bytes()` gives them as they came. The launcher and the helper's front read the start line
 * of exec --json through this, and the launcher reads the start line of exec --wait through it too (item 2ad).
 *
 * WITH `keep: false`, a line's bytes are let go once it is given, and every byte is let go once `atEachLine` has returned
 * anything but true. `bytes()` and `text()` then give only the line that has not ended yet. exec --wait relays a
 * command's error stream for as long as the command runs, and is not to hold it.
 * @param {{ on(event: 'data', listener: (piece: Buffer) => void): unknown }} stream
 * @param {(line: Buffer, after: Buffer) => unknown} [atEachLine]
 * @param {{ keep?: boolean }} [how]
 * @returns {{ bytes: () => Buffer, text: () => string }}
 */
export function aStreamReadWhole(stream, atEachLine, { keep = true } = {}) {
  /** @type {Buffer[]} */
  let pieces = []
  let length = 0
  /** Where the next line starts, in the bytes kept. */
  let lineFrom = 0
  let giving = atEachLine !== undefined
  let keeping = true
  stream.on('data', (piece) => {
    if (!keeping) return
    pieces.push(piece)
    length += piece.length
    if (!giving || atEachLine === undefined) return
    let newline = piece.indexOf(0x0a)
    if (newline === -1) return
    const all = Buffer.concat(pieces, length)
    pieces = [all]
    const pieceFrom = length - piece.length
    while (giving && newline !== -1) {
      const end = pieceFrom + newline + 1
      giving = atEachLine(all.subarray(lineFrom, end), all.subarray(end)) === true
      lineFrom = end
      newline = piece.indexOf(0x0a, newline + 1)
    }
    if (keep) return
    keeping = giving
    pieces = giving ? [Buffer.from(all.subarray(lineFrom))] : []
    length = giving ? length - lineFrom : 0
    lineFrom = 0
  })
  return { bytes: () => Buffer.concat(pieces, length), text: () => Buffer.concat(pieces, length).toString('utf8') }
}

/**
 * THE SECRETS A TEMPLATE DECLARES, by name, without reading any secrets file: each entry of `secrets.names` in its
 * sandbox.json whose name is a variable's name. theDeclaredSecrets reads the file for these names, and
 * tools/office-variables.mjs says these names came from the sandbox's secret lines.
 * @param {any} office the template's sandbox.json
 * @returns {{name: string, readBy?: unknown}[]}
 */
export function theSecretsATemplateDeclares(office) {
  return (office?.secrets?.names ?? []).filter((n) => typeof n?.name === 'string' && /^[A-Z_][A-Z0-9_]*$/.test(n.name))
}

/**
 * THE SECRETS A TEMPLATE DECLARES, AS THE HOST'S SECRETS FILE SETS THEM.
 *
 * `office` is the template's sandbox.json. The file it names (`secrets.hostFile`, `~` meaning the
 * home directory) is docker's env-file format, `NAME=value` per line; the lines for the declared
 * names are answered as they are, so the value docker reads is the value written. Nothing here
 * prints a value, and a caller never should: `names` is what may be said.
 *
 * With `runtime`, only the names whose `readBy` lists the program that runtime runs
 * (THE_PROGRAM_A_RUNTIME_RUNS) are answered, so a run holds its own model's logins and no other's; a
 * runtime the table does not know is given none. Without it, this reader answers every declared name
 * for callers inspecting the file. Plain exec passes no secrets unless it names them with --secret
 * (an earlier decision and message, and the problem that followed).
 * With `requestedNames`, only those declared names are answered, as
 * requested by plain exec's repeated --secret flags. An undeclared name is refused before the file is read.
 *
 * A LINE THAT GIVES NO VALUE, `NAME=` and nothing after it, is not answered, and `says` names it. Docker would set the
 * name to nothing in the container, which a program reads as a login that is wrong rather than one that is missing,
 * and the Settings page answers the same line "not set" (givesAValue in src/server/lib/sandbox-logins.ts), so the
 * page and the launcher say the same thing about one file (the inspector's note on the release: one fact
 * worked out in two places, invariant 9).
 *
 * Answers `{file, lines, names, says, unsafe}`. `unsafe` is a sentence when the file can be read by
 * others or a requested name is undeclared, and then no line is answered; a caller refuses rather than passing it on.
 */
export function theDeclaredSecrets(office, home = homedir(), runtime = undefined, requestedNames = undefined) {
  const declared = office?.secrets
  const listed = theSecretsATemplateDeclares(office)
  const undeclared = (requestedNames ?? []).filter((name) => !listed.some((n) => n.name === name))
  if (undeclared.length > 0) {
    return {
      file: null, lines: [], names: [], says: null,
      unsafe: `--secret names undeclared secrets: ${undeclared.join(', ')}. The template declares: ${listed.map((n) => n.name).join(', ') || '(none)'}.`,
    }
  }
  if (typeof declared?.hostFile !== 'string' || listed.length === 0) {
    return { file: null, lines: [], names: [], unsafe: null, says: `the template ${office?.template ?? '(unnamed)'} names no secrets, so none were passed in.` }
  }
  const file = declared.hostFile.replace(/^~(?=\/)/, home)
  if (!existsSync(file)) {
    return { file, lines: [], names: [], unsafe: null, says: `there is no secrets file at ${file}, so no secret was passed into the sandbox.` }
  }
  const mode = statSync(file).mode & 0o777
  if ((mode & 0o077) !== 0) {
    return {
      file, lines: [], names: [], says: null,
      unsafe: `${file} can be read by others (mode ${mode.toString(8)}); make it 600 (chmod 600 ${file}).`,
    }
  }
  // THE NAMES THIS RUN'S RUNTIME READS, when the runtime is known.
  const program = runtime === undefined ? undefined : THE_PROGRAM_A_RUNTIME_RUNS[runtime]
  const names = listed.filter((n) =>
    (runtime === undefined || (Array.isArray(n.readBy) && n.readBy.includes(program))) &&
    (requestedNames === undefined || requestedNames.includes(n.name)),
  ).map((n) => n.name)
  const nameOf = (line) => line.slice(0, line.indexOf('='))
  const declaredLines = readFileSync(file, 'utf8')
    .split('\n')
    .filter((line) => listed.some((n) => line.startsWith(`${n.name}=`)))
  const everyLine = declaredLines.filter((line) => line.length > nameOf(line).length + 1)
  const empty = declaredLines.filter((line) => line.length === nameOf(line).length + 1 && names.includes(nameOf(line))).map(nameOf)
  const lines = everyLine.filter((line) => names.some((n) => line.startsWith(`${n}=`)))
  const set = lines.map(nameOf)
  const leftOut = everyLine.map(nameOf).filter((n) => !set.includes(n))
  const why =
    runtime === undefined
      ? ''
      : program === undefined
        ? ` ${runtime} is not a runtime the template's secrets are read by (${Object.keys(THE_PROGRAM_A_RUNTIME_RUNS).join(', ')}), so it is given none.`
        : leftOut.length === 0
          ? ''
          : ` Left out, because ${runtime} does not read them: ${leftOut.join(', ')}.`
  return {
    file,
    lines,
    names: set,
    unsafe: null,
    says:
      (set.length === 0
        ? `${file} sets none of the names ${requestedNames !== undefined ? '--secret asked for' : runtime === undefined ? 'the template lists' : `${runtime} reads`}, so no secret was passed in.`
        : `passing ${set.join(', ')} into the sandbox through an env file${requestedNames === undefined ? '' : ', because --secret asked for them'}.`) +
      why +
      (empty.length === 0 ? '' : ` ${file} has ${empty.join(', ')} with nothing after the =, so ${empty.length === 1 ? 'it is' : 'they are'} not passed.`),
  }
}

/**
 * THE PROGRAM EACH RUNTIME RUNS, as a template's `secrets.names[].readBy` names it. A run whose runtime is known is
 * given only the secrets its program reads, because a run with the internet must not
 * hold the owner's Claude login unless it is a claude-code run.
 */
export { THE_PROGRAM_A_RUNTIME_RUNS } from '../src/config/launcher-selection.mjs'

/** The one Office model whose native pair has been established. A plain-word effort goes to dsh as typed, and dsh refuses one it does not know. */
export function theDshSelection(model, effort) {
  if (!LAUNCHER_MODEL_COMPATIBILITY.dsh.models.includes(model)) {
    throw new Error('DSH has no explicit native mapping for the selected Office model; nothing was started.')
  }
  if (effort !== null && !/^[a-z][a-z0-9-]{0,31}$/.test(effort)) {
    throw new Error('DSH was not handed the selected Office effort, because it is not a plain word; nothing was started.')
  }
  return { provider: LAUNCHER_MODEL_COMPATIBILITY.dsh.provider, model: LAUNCHER_MODEL_COMPATIBILITY.dsh.model, ...(effort === null ? {} : { reasoningEffort: effort }) }
}

/**
 * THE START VALUES OF ONE COMMAND, WITH THE DSH CHECK ABOVE HANDED IN. The check lives here in tools/, and the code in
 * src/config/sandbox-start-values.mjs imports nothing from tools/, so it refuses a DSH start that was not handed it.
 * Every launcher path imports these two from here, and so starts DSH with the check as before.
 * @param {string[]} command
 * @param {Parameters<typeof theStartValuesWithoutTheDshCheck>[1]} [options]
 */
export function aCommandsStartValues(command, options = {}) {
  return theStartValuesWithoutTheDshCheck(command, { ...options, checkTheDshSelection: theDshSelection })
}

/**
 * The start values after asking the office for the run's model and effort, with the same DSH check handed in.
 * @param {string[]} command
 * @param {Parameters<typeof theStartFromTheOfficeWithoutTheDshCheck>[1]} options
 */
export function aCommandsStartFromTheOffice(command, options) {
  return theStartFromTheOfficeWithoutTheDshCheck(command, { ...options, checkTheDshSelection: theDshSelection })
}

/** Compatibility preflight only; the native handoff itself is verified separately by execution. */
export function theDshHandoffIsCurrent(helper, command, runtime) {
  let at = 0
  const words = command ?? []
  if (basename(words[0] ?? '') === 'env') {
    at = 1
    while (/^[A-Za-z_][A-Za-z0-9_]*=/.test(words[at] ?? '')) at++
  }
  const headless = words.length === 0 && runtime === 'dsh'
  const direct = basename(words[at] ?? '') === 'dsh'
  if (!headless && !direct) return
  let current = false
  try {
    const source = readFileSync(helper, 'utf8')
    const hooks = join(dirname(helper), 'dsh-hooks')
    const settings = readFileSync(join(hooks, 'run-settings.mjs'), 'utf8')
    const runner = headless ? readFileSync(join(hooks, 'run-agent.sh'), 'utf8') : null
    current = source.includes('SANDBOX_DSH_SELECTION') && source.includes('prepareDshSettings') &&
      settings.includes('theNativeValidator') && settings.includes('SANDBOX_DSH_SELECTION') &&
      (runner === null || (runner.includes('run-settings.mjs') && runner.includes('"${settings_args[@]}"')))
  } catch { /* A missing component cannot apply the selection either. */ }
  if (!current) throw new Error('The DSH settings handoff is unavailable in this sandbox helper or runner; refresh its repo to a launcher that applies the Office selection. Nothing was filed or started.')
}

/** The specific Codex error saying a configured tier will be omitted, as a line for the run's log. */
export function aCodexTierWarning(line) {
  let event
  try { event = JSON.parse(line) } catch { return null } // Output which is not a JSON event names no tier error.
  if (event?.type !== 'error' || typeof event.message !== 'string') return null
  const found = /Configured service tier `([^`]+)` is not advertised as supported for model `([^`]+)` and will be omitted from requests\./.exec(event.message)
  return found === null ? null : `Codex reported that model ${found[2]} does not support service tier ${found[1]}; the tier will be omitted from requests.`
}

/**
 * THE REVERSE-PATH FILTER, OFF IN AN ISOLATED RUN'S CONTAINER, as docker's --sysctl settings (the
 * gate refuses to start the command without it, exit 95). `all` and `default` both: the kernel uses the larger of `all`
 * and an interface's own, and the container's interface takes `default`. Here rather than in tools/sandbox.mjs so the
 * real-container test makes its containers with the very same settings.
 */
export const THE_REVERSE_PATH_FILTER_OFF = Object.freeze(['net.ipv4.conf.all.rp_filter=0', 'net.ipv4.conf.default.rp_filter=0'])

/**
 * THE GIT IDENTITY A RUN'S COMMAND GETS, one answer for both places that give it: tools/sandbox-start.mjs gives it to an
 * ordinary run, and tools/sandbox.mjs to an isolated one (the inspector's note on the release: one fact
 * worked out in two places can drift, invariant 9). The agent the run serves is author and committer
 * at the office's commit address, MOLE_OFFICE_COMMIT_EMAIL (the owner's rule of 22 September 2026).
 * None when the run serves no agent, and `says` finishes the sentence "the run <id> …".
 *
 * THE CALLER READS THE ADDRESS, with settingValue('MOLE_OFFICE_COMMIT_EMAIL'), and hands it in. This file does not load
 * the settings file, because every agent's tool loads this one, tools/dsh-hooks/office.mjs among them on each tool call
 * of a dsh run. settingValue refuses an empty value itself, loudly and before anything starts, and the setting has a
 * default, so an address that is still missing here is refused too: no run is given half an identity in silence.
 *
 * @param {string | null} servedAgent
 * @param {string | null} address
 * @returns {{ env: Record<string, string> | null, says: string | null }}
 */
export function theGitIdentity(servedAgent, address) {
  if (servedAgent === null || servedAgent === '') {
    return { env: null, says: "names no agent that serves it, so its command gets no git identity, and not the caller's" }
  }
  if (address === null || address === '') {
    throw new Error(`MOLE_OFFICE_COMMIT_EMAIL has no value, so there is no commit address to give ${servedAgent}'s run.`)
  }
  return { env: { GIT_AUTHOR_NAME: servedAgent, GIT_AUTHOR_EMAIL: address, GIT_COMMITTER_NAME: servedAgent, GIT_COMMITTER_EMAIL: address }, says: null }
}

/**
 * THE FIRST PROCESS AT OR UNDER `rootPid` THAT RUNS AS `uid`, breadth-first, read from /proc on this machine, or null
 * while there is none yet or /proc cannot be read. For an isolated run it is the command: the container's first process
 * is docker-init and the gate after it, both root, and the gate starts the command as the sandbox's user. The office
 * cannot read a root process's pid namespace from this machine's user, so a row that names the container and its pid 1
 * is answered with a 500, while the command's own pid on this machine can be read.
 * @param {number} rootPid
 * @param {number} uid
 * @returns {number | null}
 */
export function theFirstProcessRunningAs(rootPid, uid) {
  const queue = [rootPid]
  const seen = new Set()
  while (queue.length > 0) {
    const pid = /** @type {number} */ (queue.shift())
    if (seen.has(pid)) continue
    seen.add(pid)
    let status = ''
    try {
      status = readFileSync(`/proc/${String(pid)}/status`, 'utf8')
    } catch {
      continue
    }
    const real = /^Uid:\s+(\d+)/m.exec(status)?.[1]
    if (real !== undefined && Number(real) === uid) return pid
    let children = ''
    try {
      children = readFileSync(`/proc/${String(pid)}/task/${String(pid)}/children`, 'utf8')
    } catch {
      children = ''
    }
    for (const one of children.trim().split(/\s+/)) if (/^\d+$/.test(one)) queue.push(Number(one))
  }
  return null
}

/**
 * THE MODEL THE OFFICE GIVES A BUILDER RUN OF THIS AGENT ON THIS RUNTIME. Criterion U2, and the Casting table of wave
 * 13p's round 2.
 *
 * The agent's own model on its profile first, then the casting the tools take for its role card (the Casting table's
 * marked row, the project's own or else the every-project one): the office decides, through
 * GET /api/office/run-models/for/<agent>, and names the casting when the model came from it. The launcher's helper,
 * `tools/sandbox.mjs` and the two register tools all ask here, so they cannot come to ask different questions.
 *
 * A MODEL FROM NEITHER IS REFUSED: when the office's answer comes from its .env default,
 * or from nothing, no casting marked for the agent's role card names a model for this runtime, and the caller is to
 * name --model instead. The order is the one the secretary set for every tool that starts or files a run: a named --model, the
 * agent's own model, the marked casting, then a refusal.
 *
 * It answers { model, says, from, effortFrom, casting }: `says` is the office's own sentence, `from` is `the agent` or
 * `the role` (where the model came from), `effortFrom` is the effort's source as the office gave it (or null from an
 * office older than the field), and `casting` is { id, scope, decision } when the model came from the table, or null
 * when it did not or the office is older than the field. When the office cannot answer, or names no model from either,
 * it throws, and the words say which.
 */
export async function theModelTheOfficeGives(api, { agent, runtime, workspace, headers }) {
  const asked = await askTheOffice(
    api,
    `/api/office/run-models/for/${encodeURIComponent(agent)}?place=builder&runtime=${encodeURIComponent(runtime)}`,
    { workspace, headers },
  )
  if (asked.status !== 200) {
    throw new Error(`the office could not say which model ${agent} gets (${theOfficeSaid(asked)})`)
  }
  const from = asked.body?.from
  if (typeof asked.body?.model !== 'string' || asked.body.model === '' || (from !== 'the agent' && from !== 'the role')) {
    const refused = new Error(
      `neither ${agent}'s own profile nor a casting marked for its role card in ${workspace} names a model for ${runtime}, ` +
        'and the tools take no other default: name --model, or ask the person to mark a casting for its role card on the ' +
        `Casting page (the office says: ${String(asked.body?.says ?? '')})`,
    )
    // THESE WORDS NAME THE NEXT STEP ALREADY, so theModelRefusal does not add "Give --model" after them.
    Object.assign(refused, { nextStepSaid: true })
    throw refused
  }
  const held = from === 'the role' ? asked.body.casting : undefined
  const casting =
    held !== null && typeof held === 'object' && typeof held.id === 'number'
      ? { id: held.id, scope: String(held.scope ?? ''), decision: typeof held.decision === 'string' && held.decision !== '' ? held.decision : null }
      : null
  let selection = Object.hasOwn(asked.body,'selection') ? readLauncherSelection(asked.body.selection) : undefined
  if (selection === undefined && casting !== null) {
    const current = await askTheOffice(api, `/api/casting/rows/${casting.id}/selection`, {workspace,headers})
    if (current.status === 200 && current.body?.selection != null) selection = readLauncherSelection(current.body.selection)
    else if (current.status !== null && current.status !== 404 && !(current.status === 503 && current.standIn) && current.status !== 200) {
      throw new Error(`The Casting selection could not be read (${theOfficeSaid(current)}). Nothing was started.`)
    } else if (current.status === 404 && current.body?.code === 'castingNoSuchCasting') throw new Error('The selected Casting row was deleted. Nothing was started.')
  }
  return { ...(selection === undefined ? {} : {selection}), model: asked.body.model, says: String(asked.body.says ?? ''), from, effortFrom: typeof asked.body.effortFrom === 'string' ? asked.body.effortFrom : null, casting }
}

/**
 * THE REFUSAL A TOOL ENDS WITH WHEN theModelTheOfficeGives THREW, said in one place for the launcher, its host-side
 * filing and the helper in the sandbox. It adds "Give --model <model>." only when the reason does not already name the
 * next step: the inspector's note on the Casting order's release found it said twice.
 * @param {unknown} why
 */
export function theModelRefusal(why) {
  const words = why instanceof Error ? why.message : String(why)
  const said = why instanceof Error && /** @type {{ nextStepSaid?: boolean }} */ (why).nextStepSaid === true
  return `no --model was given, and ${words}.${said ? '' : ' Give --model <model>.'} Nothing was started.`
}

/**
 * THE REFUSAL OF A ROUND GIVEN NO --title WHEN THE RUN IT CONTINUES HAS NO TITLE EITHER. Such a round takes that run's
 * title, because a run's title becomes the title of its commits, which may name no agent and no record id; so no title
 * is made up out of the agent and the run.
 * @param {string} run
 * @param {string} agent
 */
export function aRunWithNoTitleARoundCanTakeWords(run, agent) {
  return `Run ${run} of ${agent} has no title that the round could take, and the round was given none. Give the round its title with --title "<words>". Nothing was started.`
}

/**
 * THE TITLE OF A RUN FILED WITH NO --title, by the host launcher, by the helper in a sandbox and by
 * tools/register-a-run.mjs. It names no agent, no sandbox and no record id, because a run's title becomes the title of
 * its commits and a round that continues the run takes it. The message worker starts its workers with no --title, so
 * a run filed with none is not refused; it is filed under these words, which say that nobody gave it a title.
 */
export const A_RUN_GIVEN_NO_TITLE = 'A run that was given no title'

/**
 * THE LINE A TOOL PRINTS ABOUT THE MODEL IT WAS GIVEN, from theModelTheOfficeGives: which model, whether it is the agent's
 * own or a casting's, and for a casting its id, its scope and the decision behind its model (wave 13p's round 2).
 * @param {{ model: string, says: string, from: string, casting: { id: number, scope: string, decision: string | null } | null }} given
 */
export function theModelLine(given) {
  if (given.from === 'the agent') return `the model is ${given.model}, the agent's own model on its profile. The office says: ${given.says}`
  if (given.casting === null) return `the model is ${given.model}, from the Casting table. The office says: ${given.says}`
  const scope = given.casting.scope === 'every project' ? 'the every-project casting' : "this project's own casting"
  const decision = given.casting.decision === null ? 'which names no decision for its model' : `from decision ${given.casting.decision}`
  return `the model is ${given.model}, from casting ${String(given.casting.id)} of the Casting table, ${scope}, ${decision}. The office says: ${given.says}`
}

/**
 * THE CLONE NAMED `name`, AS `up` RECORDED IT ON THE INSTANCE (`clones` in instance.json): its name, the source it was
 * cloned from, and the branch that source had checked out, which an agent's worktree is cut from unless --cut-from says
 * otherwise. Throws a sentence naming the clones the instance has when it has none by that name. One reader for the
 * launcher on the host and the helper in the sandbox.
 *
 * @param {{ clones?: unknown }} instance
 * @param {string} name
 * @returns {{ name: string, from: string, ref: string | null }}
 */
export function theCloneNamed(instance, name) {
  const clones = Array.isArray(instance.clones) ? instance.clones : []
  const found = clones.find((one) => one !== null && typeof one === 'object' && one.name === name)
  if (found === undefined) {
    const names = clones.map((one) => (one !== null && typeof one === 'object' ? String(one.name) : '?'))
    throw new Error(
      `This sandbox has no clone named "${name}"${names.length === 0 ? ': its template declares none' : `; it has ${names.join(', ')}`}. ` +
        'A clone is declared in the template\'s sandbox.json ("clones") and made by up. Nothing was started.',
    )
  }
  return { name: String(found.name), from: String(found.from), ref: typeof found.ref === 'string' && found.ref !== '' ? found.ref : null }
}

/**
 * AN AGENT'S OWN WORKTREE IN A SANDBOX: `<sandbox>/worktrees/<agent>`. A worker works there, and so does an agent's run
 * that is given no --worktree, on the host and in the helper alike.
 */
export function theAgentsOwnWorktree(instanceDir, agent) {
  return join(instanceDir, 'worktrees', agent)
}

/**
 * WHY NO RUN MAY WORK IN `folder`, in words, or null when it may. A run may not work in the sandbox's shared checkout,
 * `<sandbox>/repo`, or anywhere inside it. Every agent start in the sandbox moves that checkout's main forward, and a
 * run's work is read as the commits from its recorded cut to the HEAD of the folder it works in. So a run there would
 * be handed every commit main gained while it ran.
 *
 * The two paths are compared resolved, and by their real paths as well when both are there, so a link to the shared
 * checkout is caught too. `asked` is `{ agent }` for a run about to be filed, or `{ run }` for a run a round would
 * continue; the words differ only in what to do instead.
 */
export function whyARunMayNotWorkIn(instanceDir, folder, asked) {
  const shared = join(instanceDir, 'repo')
  const isIn = (inner, outer) => {
    const way = relative(outer, inner)
    return way === '' || (way !== '..' && !way.startsWith(`..${sep}`) && !isAbsolute(way))
  }
  const there = isIn(resolve(folder), resolve(shared)) || (existsSync(folder) && existsSync(shared) && isIn(realpathSync(folder), realpathSync(shared)))
  if (!there) return null
  const worktrees = join(instanceDir, 'worktrees')
  if (asked.run !== undefined) {
    return `Run ${asked.run} works in ${folder}, which is this sandbox's shared checkout of main. ` +
      'A round there would be handed commits it did not make. ' +
      `Start a fresh round with --worktree ${join(worktrees, '<a new folder>')} and --cut-from <commit>. Nothing was started.`
  }
  return `--worktree ${folder} is this sandbox's shared checkout of main. ` +
    'Every start in this sandbox moves its main, so a run there would be handed commits it did not make. ' +
    `Leave --worktree out and the run gets its own worktree, ${theAgentsOwnWorktree(instanceDir, asked.agent)}, or name a new folder under ${worktrees}. ` +
    'Nothing was started.'
}

/**
 * One git command in the sandbox, answered as spawnSync answers with text.
 * @typedef {(args: string[]) => import('node:child_process').SpawnSyncReturns<string>} GitInTheSandbox
 */

/** @type {GitInTheSandbox} git where this process is: inside the container, for the helper. */
const gitHere = (args) => spawnSync('git', args, { encoding: 'utf8' })

/**
 * THE WORKTREE AN AGENT'S RUN WORKS IN, MADE WHEN IT IS NOT THERE YET. Acceptance finding 4.
 *
 * `--worktree <dir>` used to refuse whenever `<dir>` was not already there. Now a `<dir>` that does not exist is MADE,
 * as a real worktree of the instance's own clone (`<instance>/repo`), on a branch named after the agent it will
 * serve, cut from `cutFrom`: the same `git worktree add` a supervisor would otherwise have had to run by hand first.
 * Its node_modules is a link to the clone's own, `<instance>/repo/node_modules`, by that path (item 2f): the launcher
 * installs the clone's packages in the instance folder from the clone's own package-lock.json, and moves the clone's
 * link when that lockfile changes, so every worktree follows. No worktree links into the checkout the sandbox was made
 * from. `<dir>` still has to be an absolute path; only "does not exist yet" stopped being a refusal. A branch of the
 * agent's name that an earlier run left is reused when no worktree holds it. When another worktree holds it, the new
 * one is detached at the cut until the run is filed, then theWorktreesBranchAfterFiling gives it the branch named for
 * the agent and that run.
 *
 * A LEFT BRANCH AT ANOTHER COMMIT THAN THE CUT (wave 13j, the round after loop-10). With `cutNamed`, the caller named
 * the cut on purpose (--cut-from, which the office passes for a worker it starts), so the branch is not reused: the
 * worktree is detached at the cut and given the branch named for the agent and the run, as for a held branch. Without
 * it, the left branch is reused as it stood, as before, and the made sentence says the cut was not used.
 *
 * ONE COPY FOR BOTH SIDES. The launcher on the host (tools/sandbox.mjs), which files a run before it starts it, and
 * the helper in the sandbox (tools/sandbox-start.mjs), for a run an agent there starts, both make the worktree here, so
 * the two cannot come to make it differently. The instance folder is at the same path on the host and in the
 * container, so the worktree git writes down is the same path on both.
 *
 * FROM ANOTHER CLONE WHEN ONE IS NAMED. A template may declare more clones than the office's own (sandbox.json "clones";
 * the ai-news studio's news-tools), each made by `up` as `<instance>/<name>`. With `clone` given, the worktree is cut
 * from that clone instead of `<instance>/repo`, and node_modules is never linked: the office's clone's packages are not
 * that clone's, and `from` is then that clone's source on the host, which no sandbox mounts (the
 * inspector's note). The made sentence says so when the source holds one.
 *
 * GIT RUNS INSIDE THE SANDBOX, ON BOTH SIDES. A sandboxed run can write the clone's config and attributes, and
 * `worktree add` checks files out, which runs any filter they name. The helper runs git where it is, in the container.
 * The launcher on the host passes `git`, which runs the same git inside the sandbox's container, so no program the
 * clone names runs on the host.
 *
 * PATHS LEFT OUT, FOR A WORKER (src/config/a-workers-left-out-paths.mjs). With `leaveOut`, a new worktree is a sparse
 * checkout, git's own, that checks out everything but those paths: made with nothing checked out, given the patterns
 * "/*" and "!/<path>" for each, which name a path from the top and nothing else, and then checked out. The mode is
 * chosen by init --no-cone before set is given the patterns alone, because git 2.34, Ubuntu 22.04's, takes no option
 * on set and keeps --no-cone there as a pattern. git keeps the setting in that worktree's own config, so the clone and
 * its other worktrees stay whole. The clone's shared config gets extensions.worktreeConfig, and git 2.34 also raises
 * its core.repositoryformatversion to 1, which every reader of the clone must then accept. `bringBack` names paths a
 * run needs in a worktree that was there already: an earlier run's sparse one gets them checked out, and one that
 * leaves nothing out has them already. The caller works out both lists, and with neither the worktree is made as before.
 *
 * Answers `{ dir, made, branchAfterRun }`: `made` says it was made, or is null when it was there already, and
 * `brought`, when `bringBack` named paths for a worktree that was there, says what was done for them. A refusal is
 * thrown as an Error whose message is the sentence, and then nothing was made.
 *
 * @param {{ instanceDir: string, from: string, branch: string, value: string, cutFrom: string, cutNamed?: boolean, detached?: boolean, clone?: string | null, leaveOut?: string[], bringBack?: string[], git?: GitInTheSandbox }} asked
 * @returns {{ dir: string, made: string | null, branchAfterRun: string | null, brought?: string }}
 */
export function theAgentsWorktree({ instanceDir, from, branch, value, cutFrom, cutNamed = false, detached = false, clone = null, leaveOut = [], bringBack = [], git = gitHere }) {
  const dir = resolve(value)
  if (!isAbsolute(value)) throw new Error(`--worktree must be an absolute path, and "${value}" is not one. Nothing was started.`)
  const repo = join(instanceDir, clone ?? 'repo')
  if (existsSync(dir)) {
    if (!statSync(dir).isDirectory()) throw new Error(`--worktree "${value}" is not a directory. Nothing was started.`)
    // WITH A CLONE NAMED, ONE OF THAT CLONE'S OWN, or the run would work in another repository than the one it was
    // started for: an agent whose worktree an earlier run cut from the office's clone, started again with --clone.
    if (clone !== null) {
      const common = git(['-C', dir, 'rev-parse', '--path-format=absolute', '--git-common-dir'])
      const itsOwn = common.status === 0 && existsSync(join(repo, '.git')) && realpathSync(common.stdout.trim()) === realpathSync(join(repo, '.git'))
      if (!itsOwn) {
        throw new Error(`--worktree "${value}" is already there and is not a worktree of ${repo}, the clone --clone ${clone} names. Name another --worktree. Nothing was started.`)
      }
    }
    if (bringBack.length === 0) return { dir, made: null, branchAfterRun: null }
    // THE PATHS A RUN NAMES, IN A WORKTREE THAT WAS THERE. git answers 1 when the setting is not there at all.
    const theyWere = `${bringBack.join(', ')} ${bringBack.length === 1 ? 'was' : 'were'}`
    const sparse = git(['-C', dir, 'config', '--type=bool', '--get', 'core.sparseCheckout'])
    if (sparse.status !== 0 && sparse.status !== 1) {
      throw new Error(`--worktree ${dir} is there, and whether it is a sparse checkout could not be read (${String(sparse.stderr ?? '').trim() || `git config exited ${String(sparse.status ?? sparse.signal)}`}). Nothing was started.`)
    }
    if (sparse.status === 0 && sparse.stdout.trim() === 'true') {
      const added = git(['-C', dir, 'sparse-checkout', 'add', ...bringBack.map((path) => `/${path}`)])
      if (added.status !== 0) {
        throw new Error(`--worktree ${dir} is a sparse checkout, and ${bringBack.join(', ')} could not be checked out in it (${String(added.stderr ?? '').trim() || `git sparse-checkout add exited ${String(added.status ?? added.signal)}`}). Nothing was started.`)
      }
      return { dir, made: null, branchAfterRun: null, brought: `--worktree ${dir} was there, as a sparse checkout, so ${theyWere} checked out in it.` }
    }
    return { dir, made: null, branchAfterRun: null, brought: `--worktree ${dir} was there and leaves nothing out, so ${theyWere} in it already.` }
  }
  // A WORKER'S WORKTREE WITH PATHS LEFT OUT is made with nothing checked out, and checked out once its patterns are set.
  const add = (args) => git(['-C', repo, 'worktree', 'add', ...(leaveOut.length === 0 ? [] : ['--no-checkout']), ...args])
  let made = detached ? add(['--detach', dir, cutFrom]) : add(['-b', branch, dir, cutFrom])
  let branchAfterRun = detached ? branch : null
  /** How a branch of the agent's name that was there already was used: null when there was none, or it stood at the cut. */
  let left = null
  if (made.status !== 0 && /a branch named '.*' already exists/.test(String(made.stderr))) {
    // Reuse an unused handle branch. An occupied one needs the run's id before its new branch can be named.
    const worktrees = git(['-C', repo, 'worktree', 'list', '--porcelain'])
    if (worktrees.status !== 0) throw new Error(`The worktrees of ${repo} could not be read (${String(worktrees.stderr).trim()}). Nothing was started.`)
    const commitOf = (ref) => {
      const read = git(['-C', repo, 'rev-parse', '--verify', '--quiet', '--end-of-options', `${ref}^{commit}`])
      return read.status === 0 ? read.stdout.trim() : null
    }
    const branchAt = commitOf(`refs/heads/${branch}`)
    if (worktrees.stdout.split('\n').includes(`branch refs/heads/${branch}`)) {
      made = add(['--detach', dir, cutFrom])
      branchAfterRun = branch
      left = { held: true }
    } else if (branchAt !== null && branchAt === commitOf(cutFrom)) made = add([dir, branch])
    else if (cutNamed) {
      made = add(['--detach', dir, cutFrom])
      branchAfterRun = branch
      left = { held: false }
    } else {
      made = add([dir, branch])
      left = { reused: true, branchAt }
    }
  }
  if (made.status !== 0) {
    throw new Error(
      `--worktree "${value}" does not exist, and it could not be made from ${repo} (${String(made.stderr ?? '').trim() || `git worktree add exited ${String(made.status ?? made.signal)}`}). Nothing was started.`,
    )
  }
  if (leaveOut.length > 0) {
    const steps = [['sparse-checkout', 'init', '--no-cone'], ['sparse-checkout', 'set', '/*', ...leaveOut.map((path) => `!/${path}`)], ['checkout']]
    for (const step of steps) {
      const done = git(['-C', dir, ...step])
      if (done.status === 0) continue
      const removed = git(['-C', repo, 'worktree', 'remove', '--force', dir])
      throw new Error(
        `--worktree "${value}" was made from ${repo}, but it could not be checked out leaving out ${leaveOut.join(', ')} (${String(done.stderr ?? '').trim() || `git ${step.slice(0, 2).join(' ')} exited ${String(done.status ?? done.signal)}`}), ` +
          (removed.status === 0 ? 'so it was removed again. Nothing was started.' : `and it could not be removed again (${String(removed.stderr ?? '').trim()}). Nothing was started.`),
      )
    }
  }
  // NODE_MODULES ONLY FROM THE INSTANCE'S OWN CLONE, by the path of its link (see the header).
  const theClones = join(instanceDir, 'repo', 'node_modules')
  const theCloneHasOne = (() => { try { lstatSync(theClones); return true } catch { return false } })()
  const theSourceHasOne = existsSync(join(from, 'node_modules'))
  let linked = false
  if (clone === null && theCloneHasOne && !existsSync(join(dir, 'node_modules'))) {
    symlinkSync(theClones, join(dir, 'node_modules'))
    linked = true
  }
  const unlinked = clone !== null && theSourceHasOne ? `, with no node_modules linked: ${from} is not in the sandbox` : ''
  const how =
    detached ? `cut from ${cutFrom}, detached until its run is filed`
    : left === null ? `cut from ${cutFrom}, on branch ${branch}`
    : left.reused ? `on branch ${branch}, which was there already${left.branchAt === null ? '' : ` at ${left.branchAt}`} and was checked out as it stood, so it was not cut from ${cutFrom}`
    : `cut from ${cutFrom}, detached until its run is filed because branch ${branch} is ${left.held ? 'held by another worktree' : 'there already at another commit'}`
  return {
    dir,
    branchAfterRun,
    made: `--worktree ${dir} did not exist, so it was made: git worktree add from ${repo}, ${how}${linked ? `, with node_modules linked to ${theClones}` : unlinked}${leaveOut.length === 0 ? '' : `, as a sparse checkout that leaves out ${leaveOut.join(', ')}`}.`,
  }
}

/**
 * Give a newly detached worktree its own branch after filing read its HEAD. Both launchers do this before starting,
 * with git in the sandbox as theAgentsWorktree has it.
 * @param {{ dir: string, branchAfterRun: string | null }} worktree
 * @param {string} run
 * @param {GitInTheSandbox} [git]
 */
export function theWorktreesBranchAfterFiling(worktree, run, git = gitHere) {
  if (worktree.branchAfterRun === null) return null
  const branch = `${worktree.branchAfterRun}-${run}`
  const made = git(['-C', worktree.dir, 'checkout', '-b', branch])
  if (made.status !== 0) {
    throw new Error(`--worktree ${worktree.dir} could not check out branch ${branch} after run ${run} was filed (${String(made.stderr ?? '').trim() || `git checkout exited ${String(made.status ?? made.signal)}`}). Nothing was started.`)
  }
  return `--worktree ${worktree.dir} is now on branch ${branch}.`
}

/**
 * Refresh the sandbox repo session hooks beside the dsh step and stop hooks, keeping unrelated settings.
 *
 * CLAUDE CODE'S TOKEN REMINDER IS OFF IN A NEW HOME: the owner found the reminder of the tokens left purely negative for
 * these runs. The key is added only when it is absent, so a value someone set is never changed.
 *
 * THE SWITCH GOES IN WITH THE HOOKS: the harness's own subagent and workflow tools are denied in the same write, and the
 * file is written whole, through a new file that takes its place (tools/harness-features-off.mjs). So a run that reads
 * it while this writes it sees the old file or the new one, and never a file with the hooks and without the switch. A
 * file the switch cannot go into is refused before anything is written.
 */
export function prepareClaudeRunHome(home, repo) {
  const scripts = {
    PostToolUse: join(repo, 'tools', 'dsh-hooks', 'claude-code-step.mjs'),
    Stop: join(repo, 'tools', 'dsh-hooks', 'claude-code-stop.mjs'),
    SessionStart: join(repo, 'tools', 'session-hook.mjs'),
    SessionEnd: join(repo, 'tools', 'session-hook.mjs'),
  }
  if (!Object.values(scripts).every((script) => existsSync(script))) {
    return `${repo} does not hold the office's run hooks yet, so a Claude Code run in this sandbox gets none until its clone has them.`
  }
  const file = join(home, '.claude', 'settings.json')
  let held = {}
  if (existsSync(file)) {
    try {
      held = JSON.parse(readFileSync(file, 'utf8'))
    } catch {
      throw new Error(`${file} is there and is not JSON, so the office's run hooks could not be added. Nothing was started.`)
    }
  }
  const withTheSwitch = claudeCodeSettingsWithTheToolsDenied(held, file)
  // THE OFFICE'S OWN ENTRIES ARE FOUND BY THEIR SCRIPTS, replaced whole, and every other hook is kept as it was.
  const ours = (hook) => typeof hook?.command === 'string' && (hook.command.includes('/tools/dsh-hooks/claude-code-') || hook.command.includes('/tools/session-hook.mjs'))
  const hooks = held.hooks !== null && typeof held.hooks === 'object' && !Array.isArray(held.hooks) ? { ...held.hooks } : {}
  for (const [event, script] of Object.entries(scripts)) {
    const others = (Array.isArray(hooks[event]) ? hooks[event] : [])
      .map((group) => ({ ...group, hooks: (Array.isArray(group?.hooks) ? group.hooks : []).filter((hook) => !ours(hook)) }))
      .filter((group) => group.hooks.length > 0)
    const commands = [{ type: 'command', command: `node "${script}"${event === 'SessionStart' ? ' start' : event === 'SessionEnd' ? ' end' : ''}`, timeout: 30 }]
    if (event === 'Stop') commands.push({ type: 'command', command: `node "${join(repo, 'tools/session-hook.mjs')}" stop`, timeout: 30 })
    hooks[event] = [...others, { matcher: '', hooks: commands }]
  }
  const hooksChanged = JSON.stringify(hooks) !== JSON.stringify(held.hooks)
  const reminderAdded = !Object.hasOwn(held, 'totalTokensReminder')
  if (!hooksChanged && !reminderAdded && withTheSwitch === null) return null
  aFileWrittenWhole(file, `${JSON.stringify({ ...(withTheSwitch ?? held), ...(reminderAdded ? { totalTokensReminder: 'off' } : {}), hooks }, null, 2)}\n`)
  const said = []
  if (hooksChanged) said.push(`${file} runs the office's run hooks: a count of the messages waiting after each step, and a held stop while the run is unfinished.`)
  if (reminderAdded) said.push(`${hooksChanged ? 'It' : file} turns Claude Code's reminder of the tokens left off.`)
  if (withTheSwitch !== null) said.push(`${said.length > 0 ? 'It' : file} denies Claude Code's own subagent and workflow tools as well, so a Claude Code started inside a shell's words has them off.`)
  return said.join(' ')
}

// ============================================================================ the checks using a shared sandbox

/** The folder beside the instance folders where the checks using each container are written down. */
export const THE_CHECKS_FOLDER = '.inspector-checks'

/** The start time of a process, as the kernel counts it, or null because there is no such process. */
export function startTimeOf(pid) {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, 'utf8')
    return stat.slice(stat.lastIndexOf(')') + 2).split(' ')[19] ?? null
  } catch {
    return null
  }
}

/** This process, as a check using the container writes itself down. */
export function thisProcess() {
  return { pid: process.pid, started: startTimeOf(process.pid) }
}

/**
 * THE FILE A CHECK OF THE INSPECTOR WRITES ITSELF DOWN IN while it uses a sandbox's container: its process, its run and its
 * project. The inspector writes and clears it; the launcher's hand-over reads it, so a container's row goes only to a check
 * written down as using the container.
 * @param {string} sandboxes @param {string} instance @param {string} check
 */
export function theChecksMarker(sandboxes, instance, check) {
  return join(sandboxes, THE_CHECKS_FOLDER, instance, 'checks', `${check}.json`)
}

/** Is the process a file names still the one that wrote it? A reused pid has another start time. */
export function stillThere(holder) {
  return typeof holder?.pid === 'number' && holder.started !== null && startTimeOf(holder.pid) === holder.started
}
