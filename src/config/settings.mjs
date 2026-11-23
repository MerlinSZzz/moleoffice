// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { SETTING_WORDS, STABLE_OFFICE_WORDS } from './word-sources.mjs'
// @ts-check
/**
 * EVERY SETTING MOLE OFFICE HAS, DECLARED ONCE.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE IS
 * ---------------------------------------------------------------------------------------
 *
 * The API port, the browser app's port, the address the web and the tools talk to, the database
 * file, Vite's dependency cache and the project a command-line tool works in are declared here and
 * nowhere else. So is every other `MOLE_OFFICE_` setting: its name, what it is for, how it is read,
 * and what it means when nobody has set it.
 *
 * Nothing else in this repository may read `.env` or a `MOLE_OFFICE_` variable. The server, Vite's
 * configuration, the scripts, the tools and the test helpers all call one of the two readers below.
 * `tests/one-configuration-source.test.ts` walks the tree and fails when a second reader appears.
 *
 * ---------------------------------------------------------------------------------------
 * WHY, MEASURED
 * ---------------------------------------------------------------------------------------
 *
 * The same fact was worked out in several places and they disagreed, which is the defect CLAUDE.md
 * names at the top of the file. Three occurrences, all of them real:
 *
 * 1. The API port's default was written into `src/server/index.ts` as `?? '8787'`, into
 *    `vite.config.ts` as `portFrom(env, 'MOLE_OFFICE_PORT', 8787)`, into `tools/where-is-the-api.mjs`
 *    and again into `tools/session-hook.mjs`. On 28 August 2026 the API of one office moved to another port, and
 *    the hook went on resolving 8787, where a scratch copy of the corpus was answering with 791
 *    records instead of the real 721. Sessions would have been filed into the wrong database with
 *    nothing on screen to say so.
 * 2. The browser app's port, 5173, was written into `src/server/index.ts`, `vite.config.ts` and
 *    eleven tools. Moving Vite off it moved one of them.
 * 3. The database's default, `./data/panelx.db`, was written into `src/server/db/client.ts`,
 *    `src/server/lib/env.ts`, `scripts/reset.ts` and `scripts/backup.ts`, each with a comment saying
 *    it was repeated on purpose.
 *
 * None of those was a bug anybody could see. Each was two numbers that had to agree, with nothing
 * making them agree.
 *
 * ---------------------------------------------------------------------------------------
 * HOW EVERY SETTING IS READ, IN ORDER
 * ---------------------------------------------------------------------------------------
 *
 * 1. **The environment this process was given.** `MOLE_OFFICE_PORT=9000 npm run dev` wins over
 *    everything, so one run can be pointed elsewhere without editing a file.
 * 2. **`.env` at the root of this checkout.** The file the README tells you to make.
 * 3. **The stated default below**, or nothing when the setting has none.
 *
 * A setting that is present but EMPTY is refused rather than read as absent. Those are two
 * different statements — "use the default" and "use nothing" — and guessing which was meant is how
 * a scratch checkout's Vite came up, proxied to the built-in port, and served the owner's live
 * corpus behind a page that looked like the scratch one.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT IS JAVASCRIPT AND NOT TYPESCRIPT, MEASURED
 * ---------------------------------------------------------------------------------------
 *
 * Every other file of ours is TypeScript. This one is not, because one of its callers runs under a
 * Node that cannot read TypeScript.
 *
 * `tools/session-hook.mjs` is spawned by Claude Code from a user-level `~/.claude/settings.json`, whose
 * command is the bare word `node`. Measured on 3 September 2026 by reading the environment of the running
 * Claude Code process: the PATH it hands a hook resolves `node` to `/usr/bin/node`, which is
 * v18.19.1 on this machine. Node strips types on import only from v22.18. So a TypeScript
 * declaration here would have made the hook throw — and the hook is written never to block a
 * session, so it would have printed one line and exited 0, and sessions would have stopped being
 * filed with nothing on screen to say why. That is the exact failure the hook exists to prevent,
 * and it has already cost this project a day once.
 *
 * The types are not given up: this file is checked by `tsc` through `// @ts-check` above and the
 * JSDoc below, `allowJs` is on in tsconfig.json, and every TypeScript caller gets the same types it
 * would have got from a `.ts` file.
 */

import { createHash } from 'node:crypto'
import { existsSync, lstatSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { basename, delimiter, dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { THE_SUITE_WORKERS } from './the-suite-workers.mjs'
import { RUNTIME_SETTING_NAMES } from './runtime-settings.mjs'
import { gateForSetting, gateNamed, gateValueIsAllowed } from './gates.mjs'
import { storedRuntimeValue } from './runtime-setting-store.mjs'
import { OWN_RELEASE_SKIP_RUNS, OWN_RELEASE_SKIP_TAGS, RECEIPT_PRODUCER_PENDING } from '../shared/work-switches.mjs'
import { PROVIDER_ROUTER_SETTINGS, theProviderRouterValueRefused } from './provider-router-settings.mjs'
import { STABLE_RELEASE_FLOOR_SETTINGS, theStableReleaseFloorRefused } from './stable-release-floor.mjs'
import { theStableCheckoutFolder } from './sandbox-folder.mjs'

// ---------------------------------------------------------------------------- the build stamp
// Written by src/config/build-stamp.mjs (the built page's stamp, and a bundle's). Read here, once.

/** The name of the file inside the built page's folder. */
export const THE_BUILD_STAMP_FILE = 'build-stamp.json'

/**
 * Where the stamp lives, given the folder the built page is in.
 *
 * @param {string} webDir the folder the built page is served out of
 * @returns {string}
 */
export function theBuildStampIn(webDir) {
  return join(webDir, THE_BUILD_STAMP_FILE)
}

/**
 * WHAT WAS WRITTEN, OR WHETHER ANYTHING WAS.
 *
 * `read` carries the stamp's fields; `none` is an ordinary state (no build has happened here); and
 * `unreadable` is one that is there and cannot be believed, which is a different fact and is said
 * rather than folded into `none`.
 *
 * @typedef {{ state: 'none' }
 *   | { state: 'unreadable', why: string }
 *   | { state: 'read',
 *       builtAt: string,
 *       builtAtMs: number,
 *       commit: string | null,
 *       newestSourceAt: string | null,
 *       newestSourceAtMs: number | null,
 *       newestSourceFile: string | null,
 *       newestSourceFiles: number | null,
 *       version: string | null }} BuildStampReading
 */

/**
 * READ A BUILD'S STAMP, OR SAY WHY IT CANNOT BE BELIEVED.
 *
 * A missing file is `none` and not a fault: a checkout that has never been built and a server
 * running in development are both in that state. A file that is there but is not the shape this
 * wrote is `unreadable` with the reason, because reading it as fresh would be the first rule
 * broken: a reply that says the page is current must mean it is.
 *
 * @param {string} webDir the folder the built page is served out of
 * @returns {BuildStampReading}
 */
export function readTheBuildStamp(webDir) {
  const path = theBuildStampIn(webDir)
  if (!existsSync(path)) return { state: 'none' }
  let parsed
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'))
  } catch (err) {
    return { state: 'unreadable', why: `${path} could not be read as JSON (${err instanceof Error ? err.message : String(err)})` }
  }
  if (parsed === null || typeof parsed !== 'object') {
    return { state: 'unreadable', why: `${path} does not hold an object` }
  }
  const one = /** @type {Record<string, unknown>} */ (parsed)
  if (typeof one.builtAt !== 'string' || typeof one.builtAtMs !== 'number' || !Number.isFinite(one.builtAtMs)) {
    return { state: 'unreadable', why: `${path} does not say when it was built in a way this can read` }
  }
  const newestSourceAtMs = typeof one.newestSourceAtMs === 'number' && Number.isFinite(one.newestSourceAtMs) ? one.newestSourceAtMs : null
  return {
    state: 'read',
    builtAt: one.builtAt,
    builtAtMs: one.builtAtMs,
    commit: typeof one.commit === 'string' ? one.commit : null,
    newestSourceAt: typeof one.newestSourceAt === 'string' ? one.newestSourceAt : null,
    newestSourceAtMs,
    newestSourceFile: typeof one.newestSourceFile === 'string' ? one.newestSourceFile : null,
    newestSourceFiles: typeof one.newestSourceFiles === 'number' && Number.isFinite(one.newestSourceFiles) ? one.newestSourceFiles : null,
    version: typeof one.version === 'string' && one.version !== '' ? one.version : null,
  }
}

/**
 * THE INSTALL AND ITS DATA, DECLARED IN ONE PLACE. Packaging step 1 of the closed-beta plan (record
 * l1RSxzw-j4P7, row 12) and the build-shape decision zjs1me8BC6UQ: the office runs either from a checkout, as it always has,
 * or from esbuild bundles made by `npm run bundle` (scripts/bundle.mjs).
 *
 * ---------------------------------------------------------------------------------------
 * HOW IT TELLS WHICH
 * ---------------------------------------------------------------------------------------
 *
 * A bundle carries its build stamp, `build-stamp.json`, in the folder its code is in; the stamp is
 * the one `src/config/build-stamp.mjs` writes and reads for the built page. A checkout has no stamp
 * beside this file, which lives in src/config. So the code asks for the stamp beside itself: here
 * that is src/config, and inside a bundle it is the bundle's own folder, because esbuild leaves
 * `import.meta.url` naming the bundle file. A stamp that is there and cannot be read stops the
 * process: guessing which install this is would put the data in the wrong place.
 *
 *   - FROM A CHECKOUT the install's root is the checkout, and git names the build. Without a
 *     development pairing, data is under its `data/` and `findEnvFile` finds `.env` as before.
 *     MOLE_OFFICE_DEVELOPMENT_CHECKOUT keeps code here and reads that development checkout's exact
 *     `.env` and data instead. Explicit relative paths in that file follow its folder.
 *   - FROM A BUNDLE the install's root is the bundle folder, which holds the code, the migrations and
 *     the built page. A run started in it has its rules file written into it: `AGENTS.md`, or for
 *     Claude Code a `CLAUDE.md` the office marks as its own (`writeRulesInto` in src/worker/rules.ts).
 *     The data root is the per-user data folder
 *     (`thePerUserDataFolder`): the database and everything beside it (keys, backups, the service
 *     lock and its log), the custom portraits and `.env` are there. The stamp names the build.
 *
 * Every relative data path (the database, the custom portraits) resolves against `DATA_ROOT`, and
 * every path to the code's own files (the migrations, the built page, the tools) against `REPO_ROOT`.
 * The two roots are the same in an unpaired checkout. A paired stable checkout keeps its code root.
 */

/** The folder this module's code is in: src/config in a checkout, the bundle's folder in a bundle. */
const THIS_CODES_FOLDER = fileURLToPath(new URL('./', import.meta.url))

/**
 * THE PER-USER DATA FOLDER: `mole-office` in the folder each system keeps applications' own data in,
 * which is the folder Electron calls `appData`. The window keeps its own state in the same folder
 * (src/desktop/main.mjs sets Electron's `userData` from this), so the window and the bundled office
 * share one folder by construction.
 *
 * OS BOUNDARY EXCEPTION: where a system keeps an application's data is a convention of that system,
 * not a fact about what the machine is doing, so it is a branch here and not a method on OsProbe.
 *
 * @param {Record<string, string | undefined>} [env]
 * @param {string} [platform]
 * @returns {string}
 */
export function thePerUserDataFolder(env = process.env, platform = process.platform) {
  /** @type {string | undefined} */
  let base
  if (platform === 'win32') base = env.APPDATA
  else if (platform === 'darwin') base = env.HOME === undefined ? undefined : join(env.HOME, 'Library', 'Application Support')
  else base = env.XDG_CONFIG_HOME || (env.HOME === undefined ? undefined : join(env.HOME, '.config'))
  if (base === undefined || base === '') {
    throw new Error(
      `Mole Office cannot tell where this user's data folder is: ${platform === 'win32' ? 'APPDATA' : 'HOME'} is not set.`,
    )
  }
  return join(base, 'mole-office')
}

/**
 * WHERE THE "RUNNING ON THIS MACHINE" LIST LOOKS FOR LOCK FILES WHEN NOBODY SET MOLE_OFFICE_LOCK_PATHS.
 *
 * Linux keeps them in /tmp and /var/lock. A Mac has no /var/lock, so the list would say on every
 * scan that it could not read a folder the system never has; there a program keeps its lock files in
 * /tmp or in the user's own temporary folder, which Node calls `os.tmpdir()` (a folder under
 * /var/folders on a Mac). Wave 13t, round 20 (report R99y24eUFjNK, block b-6).
 *
 * WINDOWS has neither /tmp nor /var/lock. A program there keeps its lock files in the user's temporary folder,
 * so that folder is the only one (wave 13t, round 25; report bknY4s0NBTAT, item 6).
 *
 * OS BOUNDARY EXCEPTION, as for the data folder above: where a system keeps lock files is its convention.
 *
 * @param {string} platform
 * @param {string} temporary this user's temporary folder, `os.tmpdir()`
 * @returns {string[]}
 */
export function theDefaultLockFolders(platform, temporary) {
  if (platform === 'win32') return [temporary]
  if (platform === 'darwin') return temporary === '/tmp' ? ['/tmp'] : ['/tmp', temporary]
  return ['/tmp', '/var/lock']
}

/**
 * @typedef {{ from: 'checkout', root: string, dataRoot: string, build: null }
 *   | { from: 'bundle', root: string, dataRoot: string,
 *       build: { builtAt: string, commit: string | null, newestSourceAt: string | null,
 *                newestSourceAtMs: number | null, newestSourceFile: string | null,
 *                newestSourceFiles: number | null, version: string | null } }} TheInstall
 */

/**
 * THE FOLDER OF AN INSTALL THAT HOLDS WHAT AN AGENT RUNS: the registration tool, the waiter's tool, the waiter's
 * kit, the session hook Claude Code runs for it, and the main-world guard with its OpenCode plugin. A checkout keeps
 * their source in it, and a bundle keeps the two tools, the hook and the guard's two files in it built into one file
 * each (scripts/bundle.mjs), one folder below the bundle's stamp.
 */
export const THE_FOR_AGENTS_FOLDER = 'for-agents'

/**
 * The tools in that folder that an agent runs, which a bundle builds into one file each, at the same name. The
 * session hook below is built the same way. Every other file in the folder (the kit's scripts and its README)
 * ships as it is written.
 */
export const THE_AGENTS_TOOLS = Object.freeze(['register-myself.mjs', 'hold-the-handle.mjs'])

/**
 * THE SESSION HOOK, built into that folder at the same name. An installed office's press writes the three hook
 * lines to run it with the Node the office carries (src/config/install-the-entry.mjs). It is not one of an
 * agent's tools: Claude Code runs it, and GET /api/onboarding does not list it.
 */
export const THE_SESSION_HOOK = 'session-hook.mjs'

/**
 * THE MAIN-WORLD GUARD'S TWO BUILT FILES in that folder: first the hook every runtime calls before a tool runs, then
 * the OpenCode plugin that calls the same hook. src/config/main-world-guard.mjs works out their paths from this list.
 * The policy and the reading of a call are compiled into the hook, so they are not in it.
 *
 * A BUNDLE BUILDS THESE TWO WITH NOTHING SHARED (scripts/bundle.mjs). The hook runs only when its own address is the
 * program's, and the plugin imports the hook; a build that shares code moves the hook into a chunk at another
 * address, and the hook would then let every call through without reading it. They are not in THE_AGENTS_TOOLS:
 * an agent does not run them, and GET /api/onboarding does not list them.
 */
export const THE_GUARDS_BUILT_FILES = Object.freeze(/** @type {const} */ (['main-world-guard.mjs', 'opencode-plugin.mjs']))

/**
 * Where this code's build stamp is looked for. The bundle's own files have it beside them. An agent's tool,
 * bundled into the for-agents folder of a bundle, has it one folder up, in the bundle it shipped in.
 *
 * @returns {string}
 */
function whereTheStampIs() {
  const above = join(THIS_CODES_FOLDER, '..')
  return basename(THIS_CODES_FOLDER) === THE_FOR_AGENTS_FOLDER && existsSync(theBuildStampIn(above)) ? `${resolve(above)}/` : THIS_CODES_FOLDER
}

/** @returns {TheInstall} */
function readTheInstall() {
  const folder = whereTheStampIs()
  const stamp = readTheBuildStamp(folder)
  if (stamp.state === 'none') {
    const root = fileURLToPath(new URL('../../', import.meta.url))
    return { from: 'checkout', root, dataRoot: root, build: null }
  }
  if (stamp.state === 'unreadable') {
    throw new Error(`This looks like a bundle of Mole Office, but its build stamp cannot be read: ${stamp.why}`)
  }
  const { builtAt, commit, newestSourceAt, newestSourceAtMs, newestSourceFile, newestSourceFiles, version } = stamp
  return {
    from: 'bundle',
    root: folder,
    dataRoot: `${thePerUserDataFolder()}/`,
    build: { builtAt, commit, newestSourceAt, newestSourceAtMs, newestSourceFile, newestSourceFiles, version },
  }
}

/** Which install this process runs from, read once. See THE INSTALL AND ITS DATA above. */
export const THE_INSTALL = readTheInstall()

/**
 * The installation form is the only signal today. A sandbox and the owner's office both run from a checkout.
 * @param {'checkout' | 'bundle'} from
 * @returns {{kind:'builds-mole-office', because:'runs-from-a-checkout'} | {kind:'ordinary', because:'runs-from-an-installed-build'}}
 */
export function officeKindFrom(from) {
  return from === 'checkout' ? {kind: 'builds-mole-office', because: 'runs-from-a-checkout'}
    : {kind: 'ordinary', because: 'runs-from-an-installed-build'}
}
/** The office kind reads only the installation form. */
export function officeKind() { return officeKindFrom(THE_INSTALL.from) }
/** @param {{defaults:{buildsMoleOffice:string, ordinary:string}}} row @param {'checkout' | 'bundle'} [from] */
export function gateDefaultHere(row, from = THE_INSTALL.from) {
  return officeKindFrom(from).kind === 'builds-mole-office' ? row.defaults.buildsMoleOffice : row.defaults.ordinary
}

/**
 * The root of the install: the checkout, found from this file rather than from the working
 * directory, or the bundle's folder. The code's own files are under it, and it ends with a slash.
 */
export const REPO_ROOT = THE_INSTALL.root

/** @param {keyof typeof STABLE_OFFICE_WORDS} key @param {Record<string, string>} values */
export function pairingWords(key, values = {}) {
  return STABLE_OFFICE_WORDS[key].replace(/\{(\w+)\}/g, (_, name) => values[name] ?? `{${name}}`)
}

/** A directory entry counts even when it is a dangling link. @param {string} path */
function hasEntry(path) {
  try { lstatSync(path); return true } catch (error) {
    if (/** @type {NodeJS.ErrnoException} */ (error).code === 'ENOENT') return false
    throw error
  }
}

/** The starting environment alone names this checkout's development data. Read once. */
function readTheDevelopmentCheckout() {
  const value = process.env.MOLE_OFFICE_DEVELOPMENT_CHECKOUT
  if (value === undefined) return null
  /** @param {keyof typeof STABLE_OFFICE_WORDS} why @param {Record<string, string>} [values] */
  const refuse = (why, values = {}) => { throw Object.assign(new Error(pairingWords('developmentRefusal', { value, why: pairingWords(why, values) })), { code: 'DEVELOPMENT_CHECKOUT_INVALID' }) }
  if (THE_INSTALL.from !== 'checkout') refuse('bundle')
  if (!isAbsolute(value)) refuse('absolute')
  if (!existsSync(value)) refuse('missing')
  if (!statSync(value).isDirectory()) refuse('folder')
  const path = realpathSync(value)
  if (!hasEntry(join(path, '.git'))) refuse('git')
  if (path === realpathSync(REPO_ROOT)) refuse('same')
  if (Object.hasOwn(envFileValues(join(path, '.env')), 'MOLE_OFFICE_DEVELOPMENT_CHECKOUT')) refuse('declaresItself')
  if (hasEntry(join(REPO_ROOT, '.env'))) refuse('localEnv')
  const file = join(path, '.env'), checkout = realpathSync(REPO_ROOT)
  let named
  try { named = theStableCheckoutNamedIn(file) } catch (error) {
    if (error.code !== 'STABLE_CHECKOUT_INVALID') throw error
    throw Object.assign(new Error(error.message), { code: 'DEVELOPMENT_CHECKOUT_INVALID' })
  }
  if (named === null) refuse('pairingMissing', { file })
  if (named !== checkout) refuse('pairingOther', { file, named, checkout })
  return path
}

/** The real development checkout path, without a trailing slash, or null. */
export const THE_DEVELOPMENT_CHECKOUT = readTheDevelopmentCheckout()

/** The data folder, including a paired development checkout's data. Ends with a slash. */
export const DATA_ROOT = THE_DEVELOPMENT_CHECKOUT === null ? THE_INSTALL.dataRoot : `${THE_DEVELOPMENT_CHECKOUT}/`

/**
 * The folder the message worker's log goes under: the serving install's data root (the checkout
 * from a checkout, the per-user data folder from a bundle). It is never a paired development
 * checkout, because that one changes with each landing. The database stays under `DATA_ROOT`.
 */
export const THE_WORKER_LOG_ROOT = THE_INSTALL.dataRoot

/**
 * The folder each run's output goes under, one folder per session: under the serving install's data root, beside the
 * worker's log, and never under a paired development checkout. The message worker writes there, and
 * tools/queue-history.mjs reads there unless it is told another folder.
 */
export const THE_RUN_OUTPUT_FOLDER = join(THE_WORKER_LOG_ROOT, '.logs', 'runs')

/** The database's migrations, which ship with the code: `drizzle/` under the install's root. */
export const THE_MIGRATIONS_FOLDER = join(REPO_ROOT, 'drizzle')

/**
 * The plugins: `plugins/` under the install's root, one folder per plugin, which is choice A of a decision
 * taken in wave 13x round 14. A bundle does not carry it yet; step 4 of the plugin pipeline
 * udGnc-Bsr15R decides how it ships.
 * MOLE_OFFICE_PLUGINS names another folder, which only a test's scratch office does; `pluginsFolderFrom` reads it.
 */
export const THE_PLUGINS_FOLDER = join(REPO_ROOT, 'plugins')

/** The built browser app, `dist/web` under the install's root. src/config/the-built-page.mjs reads it from here. */
export const THE_BUILT_PAGE_FOLDER = resolve(REPO_ROOT, 'dist', 'web')

/**
 * WHERE THE FILES OF `public/` ARE IN THIS INSTALL: the pictures and catalogs the server reads as well
 * as the page. In a checkout they are its `public/`. Vite copies `public/` into the built page
 * unchanged, so a bundle carries them once, inside `dist/web`, and reads them there.
 */
export const THE_PUBLIC_FOLDER = THE_INSTALL.from === 'bundle' ? THE_BUILT_PAGE_FOLDER : join(REPO_ROOT, 'public')

/**
 * Where a path a checkout names under `public/` (such as `public/avatars`) is in this install.
 *
 * @param {string} checkoutPath
 * @returns {string}
 */
export function whereThePublicFileIs(checkoutPath) {
  if (!checkoutPath.startsWith('public/')) throw new Error(`${checkoutPath} is not a path under public/.`)
  return join(THE_PUBLIC_FOLDER, ...checkoutPath.slice('public/'.length).split('/'))
}

/**
 * THE VERSION OF MOLE OFFICE, held in one place: `version` in package.json (the decision
 * sKPFWjOuQVEe; 0.1.0-beta.1 for the closed beta). From a checkout it is read there. A bundle has no
 * package.json, so scripts/bundle.mjs copies the version into the bundle's stamp as it bundles, and it
 * is read from the stamp. The window's About line, the server's start line and the installers' names
 * all show this. Null only for a bundle whose stamp recorded none, which each of them says rather
 * than guess.
 *
 * It is read when it is first asked for, not when this module is imported. The session hook, the
 * waiter's one-file bundle and the tests' own small checkouts import this module from folders with
 * no package.json, and they never ask for the version.
 *
 * @returns {string | null}
 */
export function theVersion() {
  if (readVersion === undefined) readVersion = readTheVersion()
  return readVersion
}

/** @type {string | null | undefined} */
let readVersion

/** @returns {string | null} */
function readTheVersion() {
  if (THE_INSTALL.from === 'bundle') return THE_INSTALL.build.version
  const own = /** @type {{ version?: unknown }} */ (JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8')))
  if (typeof own.version !== 'string' || own.version === '') throw new Error(`${join(REPO_ROOT, 'package.json')} names no version.`)
  return own.version
}

/**
 * THE NODE AN INSTALLED OFFICE CARRIES, named once. It is the version the office runs on from a
 * checkout today. scripts/the-shipped-node.mjs downloads exactly this version from nodejs.org, checks it
 * against the release's SHASUMS256.txt, and puts its `node` where `theShippedNodeIn` says, for the
 * Windows and Mac installers. The Linux installers carry none: there the office runs on the app's own
 * program (`theInstallsNode`).
 */
export const THE_SHIPPED_NODE_VERSION = '22.23.2'

/**
 * Where, inside a bundle, the Node it carries sits on each system. Node's archives for Linux and a Mac keep it at
 * bin/node, and its Windows archive keeps node.exe at its top. scripts/the-shipped-node.mjs puts it there.
 *
 * No Linux bundle carries one now. On Linux this names where an older version's Node was, which
 * `keepTheOlderHookLines` in ./install-the-entry.mjs and `keepTheOlderUnit` in ./start-at-login.mjs look for.
 *
 * @param {string} platform
 * @returns {string[]}
 */
export function theShippedNodeIn(platform) {
  return platform === 'win32' ? ['runtime', 'node.exe'] : ['runtime', 'bin', 'node']
}

/** The variable that makes Electron's own program run a script as Node. */
export const RUN_AS_NODE = 'ELECTRON_RUN_AS_NODE'

// THE VARIABLE IS TAKEN OUT OF EVERY OFFICE PROGRAM'S OWN ENVIRONMENT HERE, because every one of them imports this
// file, and `theInstallsNode` gives it back only to a start of an office program. It is done this way round because
// a missed site fails at once (the binary opens the app), while a leak fails silently in the person's tools.
delete process.env[RUN_AS_NODE]

/**
 * THE NODE THIS INSTALL RUNS ITS OWN SCRIPTS ON: the program, and what a start of it adds to its environment.
 *
 *   - From a checkout, the Node that runs this process, as it always has. The window from a checkout is Electron, so
 *     it is given the bare word `node`, which it finds on PATH.
 *   - From a bundle on Linux, the program this process runs on, with ELECTRON_RUN_AS_NODE=1. An installed office's
 *     window, server, worker and command all run on the app's own program there, and the Linux installers carry no
 *     second Node.
 *   - From a bundle on Windows and the Mac, the Node the installation carries. It is named where `theShippedNodeIn`
 *     says. Every other office program there was started on that Node, so for them it is the Node that runs this process.
 *
 * `named` asks for the Node by where it is kept, not by the program that runs this process. The window needs that,
 * because it does not run on the install's Node, and so does a line written for a later session to run. It is true in
 * the window unless a caller says.
 *
 * Every start of an office program asks this, and so does every line the office writes that runs one.
 *
 * @param {{ from?: 'checkout' | 'bundle', platform?: string, execPath?: string, named?: boolean, root?: string }} [here]
 *   this process's own unless a caller names another
 * @returns {{ program: string, environment: Record<string, string> }}
 */
export function theInstallsNode(here = {}) {
  const from = here.from ?? THE_INSTALL.from
  const platform = here.platform ?? process.platform
  const execPath = here.execPath ?? process.execPath
  const named = here.named ?? /** @type {{ type?: string }} */ (/** @type {unknown} */ (process)).type === 'browser'
  if (from === 'checkout') return { program: named ? 'node' : execPath, environment: {} }
  if (platform === 'linux') return { program: execPath, environment: { [RUN_AS_NODE]: '1' } }
  return { program: named ? join(here.root ?? REPO_ROOT, ...theShippedNodeIn(platform)) : execPath, environment: {} }
}

/**
 * The window's program in the folder the Windows installer installs into. It is THE_WINDOWS_EXECUTABLE in
 * scripts/the-windows-build.mjs, which names it as electron-builder does. That file is a build script, and it
 * imports this one, so the name is written again here. tests/the-pdf-door-refuses-and-the-install-finds-its-program.test.ts
 * builds its Windows case from that one, so the two cannot drift apart with nothing failing.
 */
const THE_WINDOWS_WINDOW_PROGRAM = 'mole-office.exe'

/**
 * ELECTRON'S OWN BINARY IN THIS CHECKOUT, read where the electron package keeps it: the file path.txt in the
 * package's folder names the binary inside its dist folder.
 *
 * It is read here, and not by requiring the electron package, because requiring the package downloads the binary
 * when it is missing, and prints as it does. A start of the window must not fetch anything from the network. A
 * missing package, path.txt or binary throws one sentence instead.
 *
 * @returns {string}
 */
function theCheckoutsElectron() {
  let folder
  try {
    folder = dirname(createRequire(import.meta.url).resolve('electron/package.json'))
  } catch {
    throw new Error("Electron is not installed in this checkout's node_modules, so the window program cannot be started.")
  }
  const pathFile = join(folder, 'path.txt')
  if (!existsSync(pathFile)) throw new Error(`Electron's binary was never fetched into this checkout, because ${pathFile} is missing.`)
  const binary = join(folder, 'dist', readFileSync(pathFile, 'utf8').trim())
  if (!existsSync(binary)) throw new Error(`Electron's binary is missing from this checkout: ${binary} is not there.`)
  return binary
}

/**
 * THE WINDOW PROGRAM OF THIS INSTALL, AND THE ARGUMENTS THAT GO BEFORE A CALLER'S OWN: what another office program
 * runs to start the window. The PDF door starts it to print a report's page (src/server/api/report-pdf.ts).
 *
 *   - From a checkout, Electron's own binary from this checkout's node_modules (`theCheckoutsElectron`), with the
 *     window's entry in the checkout.
 *   - From a bundle on the Mac, the app's program, Contents/MacOS/Mole Office. The office is in
 *     Contents/Resources/office, two folders below Contents.
 *   - From a bundle on Windows, the app's program in the installed folder. The office is in resources/office, two
 *     folders below it.
 *   - From a bundle on Linux, the program this process runs on. ELECTRON_RUN_AS_NODE was taken out of this process's
 *     environment above, so that program opens as the app.
 *   - Any other system has no window program here, and asking throws.
 *
 * The bundles' places were read from main on 23 November 2026: the Mac's in src/server/lib/darwin-probe.ts, and
 * Windows' in src/config/systems/the-installer-of-a-folder.mjs and scripts/the-windows-build.mjs.
 *
 * @param {{ from?: 'checkout' | 'bundle', platform?: string, execPath?: string, root?: string }} [here]
 *   this process's own unless a caller names another
 * @returns {{ program: string, args: string[] }}
 */
export function theInstallsWindowProgram(here = {}) {
  const from = here.from ?? THE_INSTALL.from
  const platform = here.platform ?? process.platform
  const root = here.root ?? REPO_ROOT
  if (from === 'checkout') return { program: theCheckoutsElectron(), args: [join(root, THE_WINDOW_ENTRY)] }
  if (platform === 'darwin') return { program: resolve(root, '../..', 'MacOS', 'Mole Office'), args: [] }
  if (platform === 'win32') return { program: resolve(root, '../..', THE_WINDOWS_WINDOW_PROGRAM), args: [] }
  if (platform === 'linux') return { program: here.execPath ?? process.execPath, args: [] }
  throw new Error(`This install has no window program on ${platform}, so it cannot start one.`)
}

/**
 * THE SAME ANSWER AS THE START OF A LINE `sh` RUNS: each variable as `NAME=value`, then the program, quoted as JSON
 * quotes it. A line that ends in a script and its arguments runs that script on this install's Node.
 *
 * @param {{ program: string, environment: Record<string, string> }} [node]
 * @returns {string}
 */
export function theInstallsNodeInALine(node = theInstallsNode()) {
  return [...Object.entries(node.environment).map(([name, value]) => `${name}=${value}`), JSON.stringify(node.program)].join(' ')
}

/** Where the server and the worker start, relative to a checkout. src/config/newest-source.mjs walks from these too. */
export const THE_SERVER_ENTRY = 'src/server/index.ts'
export const THE_WORKER_ENTRY = 'src/worker/index.ts'
/** Where the `mole-office` command starts, relative to a checkout. */
export const THE_COMMAND_ENTRY = 'src/config/the-service-command.mjs'
/** Where the standalone window starts, relative to a checkout. */
export const THE_WINDOW_ENTRY = 'src/desktop/main.mjs'
/** Where the terminal holder starts, relative to a checkout (src/config/the-terminal-holder.mjs says what it is). */
export const THE_HOLDER_ENTRY = 'src/holder/index.mjs'
/**
 * The file the terminal holder is in, in a bundle folder. scripts/the-terminal-in-a-bundle.mjs makes it, with
 * node-pty beside it, in every bundle `npm run bundle` makes (since wave 13t's round 17).
 */
export const THE_HOLDER_BUNDLE = 'holder.mjs'
/**
 * Where the host job runner starts, relative to a checkout (the file's own header says what it is). The office starts
 * it with --with-the-office (src/server/lib/host-job-runner.ts). No bundle carries it.
 */
export const THE_HOST_JOB_RUNNER_ENTRY = 'tools/run-the-host-jobs.mjs'

/**
 * THE BUNDLES `npm run bundle` MAKES: each program's entry in a checkout, and the file its bundle is in
 * the bundle folder. scripts/bundle.mjs makes exactly these, and `howToStart` and `isTheProgramRun`
 * read them, so the three cannot disagree about a name.
 */
export const THE_BUNDLES = Object.freeze({
  [THE_SERVER_ENTRY]: 'server.mjs',
  [THE_WORKER_ENTRY]: 'worker.mjs',
  [THE_COMMAND_ENTRY]: 'mole-office.mjs',
  [THE_WINDOW_ENTRY]: 'window.mjs',
})

/** Where the attention thread starts, relative to a checkout (src/server/lib/attention-thread.ts starts it). */
export const THE_ATTENTION_THREAD_ENTRY = 'src/server/lib/attention-thread-worker.ts'

/** Where the seal-read thread starts, relative to a checkout (src/server/lib/the-seal-read-apart.ts starts it). */
export const THE_SEAL_READ_THREAD_ENTRY = 'src/server/lib/the-seal-read-apart-thread.ts'

/** Where the backup door's thread starts, relative to a checkout (`takeTheBackupInItsOwnThread` in src/server/lib/backup.ts starts it). */
export const THE_BACKUP_THREAD_ENTRY = 'src/server/lib/backup-thread.ts'

/** Where the search thread starts, relative to a checkout (src/server/lib/search-thread.ts starts it). */
export const THE_SEARCH_THREAD_ENTRY = 'src/server/lib/search-thread-worker.ts'

/** Where the server's starter watch begins, relative to a checkout. */
export const THE_STARTER_WATCH_THREAD_ENTRY = 'src/server/lib/starter-watch.mjs'

/**
 * THE THREADS THE SERVER STARTS, each built by `npm run bundle` into a file of its own beside server.mjs.
 *
 * A worker thread is started from a file, and a bundle carries no TypeScript and no tsx to load one. From a
 * checkout the server starts the entry through tsx; from a bundle it starts the file named here, which is plain
 * JavaScript and needs no loader. The installed Mac office of 10 October 2026 answered 500 on every attention
 * read because the thread was started through tsx there too (wave 13w round 24). These are not programs: nothing
 * runs one with `howToStart`, and `isTheProgramRun` never names one.
 */
export const THE_THREAD_BUNDLES = Object.freeze({
  [THE_ATTENTION_THREAD_ENTRY]: 'attention-thread.mjs',
  [THE_SEAL_READ_THREAD_ENTRY]: 'seal-read-thread.mjs',
  [THE_BACKUP_THREAD_ENTRY]: 'backup-thread.mjs',
  [THE_SEARCH_THREAD_ENTRY]: 'search-thread.mjs',
  [THE_STARTER_WATCH_THREAD_ENTRY]: 'starter-watch.mjs',
})

/**
 * WHETHER THE MODULE AT `moduleUrl` IS THE PROGRAM THIS PROCESS WAS STARTED TO RUN, rather than a
 * module some other program imported. `entry` is the module's own path in a checkout.
 *
 * From a checkout that is whether `process.argv[1]` names the module's own file, by path or by real
 * path. From a bundle every module shares the bundle file's `import.meta.url`, so that comparison
 * would say yes for every module in it; there it is whether `process.argv[1]` names the bundle made
 * from this entry. A module with no bundle of its own is never the program in a bundle.
 *
 * @param {string} moduleUrl the module's own `import.meta.url`
 * @param {string} entry the module's path in a checkout, such as `src/server/index.ts`
 * @returns {boolean}
 */
export function isTheProgramRun(moduleUrl, entry) {
  const first = process.argv[1]
  if (first === undefined) return false
  /** @type {Record<string, string>} */
  const bundles = { ...THE_BUNDLES, [THE_HOLDER_ENTRY]: THE_HOLDER_BUNDLE }
  const here = THE_INSTALL.from === 'bundle'
    ? (bundles[entry] === undefined ? null : join(REPO_ROOT, bundles[entry]))
    : fileURLToPath(moduleUrl)
  if (here === null) return false
  if (resolve(first) === here) return true
  try {
    return realpathSync(first) === realpathSync(here)
  } catch {
    return false
  }
}

/**
 * HOW TO START ONE OF THE OFFICE'S PROGRAMS from this install: a program to run and its first
 * arguments, to be run in `REPO_ROOT`. From a checkout the server and the worker run through tsx from
 * their source, as they always have, and the command is its own plain JavaScript; from a bundle each
 * is the bundle made from it, run by the Node that runs this process. The window runs the command
 * with the Node it finds, so it reads only `args` for that one.
 *
 * THE PROGRAM IS `theInstallsNode`'S, but for a checkout's worker, and `environment` is what a start adds to the
 * environment it gives: ELECTRON_RUN_AS_NODE=1 from a Linux bundle, and nothing anywhere else.
 *
 * THE TERMINAL HOLDER is plain JavaScript run by this Node. From a bundle it is THE_HOLDER_BUNDLE, which
 * only the Linux installers carry (scripts/the-terminal-in-a-bundle.mjs). A bundle without it throws, and
 * the service command says so rather than start nothing silently.
 *
 * ON WINDOWS a checkout's worker is node_modules\.bin\tsx.cmd, a script for cmd.exe, so whoever starts it starts it
 * through `theWayToStart` in src/config/runtimes.mjs (report bknY4s0NBTAT, item 9).
 *
 * THE HOST JOB RUNNER is plain JavaScript run by this Node, from a checkout only. No bundle carries it, so from a bundle
 * this throws, and the office says so rather than start nothing silently.
 *
 * @param {'server' | 'worker' | 'command' | 'holder' | 'host-job-runner'} program
 * @param {string} [platform] a value of `process.platform`, this system's unless a test names another
 * @returns {{ command: string, args: string[], environment: Record<string, string> }}
 */
export function howToStart(program, platform = process.platform) {
  const node = theInstallsNode({ platform })
  const on = (/** @type {string[]} */ args) => ({ command: node.program, args, environment: node.environment })
  if (program === 'host-job-runner') {
    if (THE_INSTALL.from === 'bundle') throw new Error('This install is a bundle, and no bundle carries the host job runner, so the office starts none.')
    return on([join(REPO_ROOT, THE_HOST_JOB_RUNNER_ENTRY)])
  }
  if (program === 'holder') {
    if (THE_INSTALL.from === 'bundle') {
      const bundled = join(REPO_ROOT, THE_HOLDER_BUNDLE)
      if (!existsSync(bundled)) throw new Error('This bundle does not carry the terminal holder, so the office cannot hold terminals here.')
      return on([bundled])
    }
    return on([join(REPO_ROOT, THE_HOLDER_ENTRY)])
  }
  const entry = program === 'server' ? THE_SERVER_ENTRY : program === 'worker' ? THE_WORKER_ENTRY : THE_COMMAND_ENTRY
  if (THE_INSTALL.from === 'bundle') {
    return on([join(REPO_ROOT, THE_BUNDLES[entry])])
  }
  if (program === 'server') return on(['--import', 'tsx', entry])
  if (program === 'worker') return { command: join(REPO_ROOT, 'node_modules', '.bin', platform === 'win32' ? 'tsx.cmd' : 'tsx'), args: [entry], environment: {} }
  return on([join(REPO_ROOT, entry)])
}

/**
 * WHERE GIT KEEPS ITS FILES FOR ONE CHECKOUT, worked out from the paths rather than asked of git.
 *
 * THIS ANSWERS THE TWO SPAWNS `git rev-parse --git-common-dir` and `git rev-parse --git-dir` USED
 * TO MAKE, and it answers them by reading what git itself reads, at the moment it is asked, so
 * nothing is held and nothing can go stale.
 *
 * - In the main clone, `.git` is a DIRECTORY and both answers are that directory.
 * - In a worktree, `.git` is a FILE whose line names the worktree's own gitdir, and that gitdir
 *   carries a `commondir` file naming the main clone's `.git` — usually `../..` relative to the
 *   gitdir. Git reads that same file to answer `--git-common-dir`; reading it here is the same
 *   arithmetic git does, not a guess about the layout.
 *
 * The paths come back resolved and absolute, so a caller can compare them directly. A path written
 * relative in either file is resolved against the place that names it: the `.git` file's path
 * against `root`, and the `commondir` file's content against the gitdir.
 *
 * NULL WHEN THERE IS NO CHECKOUT HERE, and the caller says so rather than treating it as an answer
 * about a worktree.
 *
 * @param {string} root
 * @returns {{ gitDir: string, commonDir: string } | null}
 */
export function gitDirsOf(root) {
  const dot = join(root, '.git')
  let gitDir
  try {
    if (statSync(dot).isDirectory()) {
      gitDir = dot
    } else {
      const said = readFileSync(dot, 'utf8').trim()
      if (!said.startsWith('gitdir:')) return null
      gitDir = resolve(root, said.slice('gitdir:'.length).trim())
    }
  } catch {
    return null
  }
  let commonDir = gitDir
  try {
    const named = readFileSync(join(gitDir, 'commondir'), 'utf8').trim()
    if (named !== '') commonDir = resolve(gitDir, named)
  } catch {
    // No commondir file: this gitdir is its own common dir, which is the main clone's case.
  }
  return { gitDir, commonDir }
}

/**
 * WHAT ONE REF NAMES, as git resolves it: the loose file first, then the packed table.
 *
 * A loose ref file holds a commit sha, or `ref: <another name>` when the ref is itself symbolic.
 * `packed-refs` holds `<sha> <name>` lines in the COMMON dir, and a ref packed there may have no
 * loose file at all — which is the ordinary state of a repository that has ever run `git gc`. A
 * loose file wins over the packed table when both exist, which is also git's order.
 *
 * Symbolic refs are followed at most five hops. A cycle is not an answer; it is a broken checkout.
 */
/** @param {string} gitDir @param {string} commonDir @param {string} ref @returns {string | null} */
function whatRefPointsAt(gitDir, commonDir, ref) {
  let name = ref
  for (let hops = 0; hops < 5; hops++) {
    let said = /** @type {string | null} */ (null)
    for (const dir of [gitDir, commonDir]) {
      try {
        said = readFileSync(join(dir, ...ref.split('/')), 'utf8').trim()
        if (said !== '') break
      } catch {
        said = null
      }
    }
    if (said === null || said === '') return packedRef(commonDir, ref)
    if (!said.startsWith('ref:')) return said
    ref = said.slice('ref:'.length).trim()
  }
  return null
}

/** The line for `ref` in the common dir's `packed-refs`, or null when it is not packed there. */
/** @param {string} commonDir @param {string} ref @returns {string | null} */
function packedRef(commonDir, ref) {
  let text
  try {
    text = readFileSync(join(commonDir, 'packed-refs'), 'utf8')
  } catch {
    return null
  }
  for (const line of text.split('\n')) {
    // Comment lines carry the format; `^` lines are the peeled target of the line above, never a ref.
    if (line === '' || line.startsWith('#') || line.startsWith('^')) continue
    const at = line.indexOf(' ')
    if (at === -1) continue
    if (line.slice(at + 1).trim() === ref) return line.slice(0, at).trim()
  }
  return null
}

/**
 * THE COMMIT, THE BRANCH, FROM `.git/HEAD` AND THE REF IT NAMES — read at the moment of the request.
 *
 * THIS ANSWERS WHAT THE THREE SPAWNS `rev-parse HEAD`, `rev-parse --short HEAD` and
 * `rev-parse --abbrev-ref HEAD` ANSWERED, from the same files git reads:
 *
 * - `HEAD` holds `ref: <name>` on a branch, or the commit's own sha with a detached HEAD.
 * - On a branch, the named ref is resolved loose or packed (see `whatRefPointsAt` above), and
 *   `--abbrev-ref` is that name without `refs/heads/`.
 * - `--short` is the first seven characters of the full sha, git's documented minimum. Git's own
 *   command widens past seven as a repository's object count grows — on this checkout today
 *   (29,162 packed objects, measured 11 September 2026) it answers eight characters where seven
 *   identifies the commit unambiguously. Nothing compares this string with one a git spawn said;
 *   the full sha is always carried beside it. If something ever needs git's own length, that is a
 *   new question to write down, not a length to guess here.
 *
 * A REF THAT CANNOT BE RESOLVED IS NOT AN ANSWER: an unborn branch (a checkout with no commit yet)
 * makes `rev-parse HEAD` fail, and this fails the same way, with the reason beside it. Null here
 * always arrives with a sentence in `couldNotRead`.
 */
/**
 * @param {{ gitDir: string, commonDir: string }} dirs
 * @param {string} root
 * @param {string[]} couldNotRead
 * @returns {{ full: string, short: string, branch: string | null } | null}
 */
export function headFromGitDirs(dirs, root, couldNotRead) {
  const couldNotName = (/** @type {string} */ why) => {
    couldNotRead.push(`git could not name the commit in ${root} (${why})`)
    return null
  }
  let said
  try {
    said = readFileSync(join(dirs.gitDir, 'HEAD'), 'utf8').trim()
  } catch (err) {
    return couldNotName(`${dirs.gitDir}/HEAD could not be read (${(/** @type {NodeJS.ErrnoException} */ (err)).code ?? String(err)})`)
  }
  if (said === '') return couldNotName(`${dirs.gitDir}/HEAD is empty`)
  if (!said.startsWith('ref:')) {
    // DETACHED HEAD: the commit itself is written in the file, which is what rev-parse answered.
    if (!/^[0-9a-f]{40}$/.test(said)) {
      return couldNotName(`${dirs.gitDir}/HEAD holds "${said.slice(0, 20)}", which is neither a branch ref nor a commit`)
    }
    return { full: said, short: said.slice(0, 7), branch: null }
  }
  const ref = said.slice('ref:'.length).trim()
  const full = whatRefPointsAt(dirs.gitDir, dirs.commonDir, ref)
  if (full === null) {
    return couldNotName(`${ref} is written nowhere this checkout keeps its refs — a checkout with no commit yet`)
  }
  if (!/^[0-9a-f]{40}$/.test(full)) {
    return couldNotName(`${ref} holds "${full.slice(0, 20)}", which is not a commit`)
  }
  // `rev-parse --abbrev-ref HEAD` answers the branch name for refs/heads/* and the bare ref name
  // for anything else; HEAD detached answers `HEAD`, which the caller reads as "no branch" and
  // which is handled above, on the detached path, where branch is null.
  const branch = ref.startsWith('refs/heads/') ? ref.slice('refs/heads/'.length) : ref
  return { full, short: full.slice(0, 7), branch: branch === 'HEAD' ? null : branch }
}

/**
 * WHERE `.env` IS FOR A CHECKOUT AT `root` — this checkout's own, or its main checkout's.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS EXISTS, MEASURED
 * ---------------------------------------------------------------------------------------
 *
 * `.env` is gitignored (`.gitignore` lines 18 and 19), so a git worktree never has one — and the
 * office tells every agent to work in a worktree. Before this function existed, `ENV_FILE` was
 * always `resolve(REPO_ROOT, '.env')`, which in a worktree names a file that can never exist, so
 * every setting fell straight to its declared default. For `MOLE_OFFICE_PORT` that default is
 * 8787, and an office is very often on another port, as one was on 11 September 2026. Measured from a real worktree of this project: `node tools/close-worlds-nobody-serves.mjs`
 * answered "The office could not be read at http://127.0.0.1:8787/api/office/worlds", using
 * `tools/where-is-the-api.mjs`, which already goes through this file. The reader was not wrong;
 * what it was reading was.
 *
 * ---------------------------------------------------------------------------------------
 * WHY NO GIT IS STARTED
 * ---------------------------------------------------------------------------------------
 *
 * A worktree's `.git` is a FILE whose `gitdir:` line points into the main checkout's `.git`; an
 * ordinary checkout's `.git` is a directory. This used to ask `git rev-parse --path-format=absolute
 * --git-common-dir`, on every start from a checkout with no `.env`. On a Mac without Apple's
 * command-line tools, `/usr/bin/git` is only a stand-in that asks the person to install them, so a
 * start could put up that prompt (wave 13t, round 23). It now reads the same two files git reads to
 * answer that question, through `gitDirsOf` below, which the server uses too (src/server/lib/git-checkout.ts).
 * An ordinary checkout's common folder is its own `.git`, so it never looks further than its own
 * `.env`; only a worktree is followed to its main checkout.
 *
 * A PATH THAT RESOLVED THROUGH `node_modules` IS NOT WHERE THIS RUNS FROM. This deliberately reads
 * `root` (this checkout's own directory) and reads THAT directory's `.git` — never a binary or a
 * module's resolved path. A worktree's `node_modules` is a symlink into the main checkout (the
 * office's own recipe, so the worktree does not carry a second copy), and a process running from
 * the worktree can look, from `ps`, as if it were running IN the main checkout, because the
 * interpreter and its modules resolve through that symlink. Two people reading such a `ps` output
 * independently concluded a worktree's process was running in the main checkout, and were wrong;
 * only `/proc/<pid>/cwd` settled it. Deciding "which checkout is this" from a resolved path would
 * be that same mistake at the point it actually matters — it would call the worktree its own main
 * checkout and read no further, which is the defect this function exists to fix.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT NEVER DOES
 * ---------------------------------------------------------------------------------------
 *
 * IT NEVER WRITES, COPIES OR INVENTS A `.env`. It only ever calls `existsSync` and reads the
 * checkout's `.git` through `gitDirsOf`. A checkout that is not a git repository at all — an export
 * or a tarball — or whose `.git` cannot be read gets exactly today's answer: its own absent `.env`,
 * which every caller already treats as "nobody set this" rather than an error.
 *
 * @param {string} [root]
 * @returns {{ path: string, found: boolean, checked: string[] }}
 */
export function findEnvFile(root = REPO_ROOT) {
  const local = resolve(root, '.env')
  if (existsSync(local)) return { path: local, found: true, checked: [local] }
  const folders = gitDirsOf(root)
  // Not a git checkout, or its .git cannot be read. There is no second place to look.
  if (folders === null) return { path: local, found: false, checked: [local] }
  const { commonDir } = folders
  const mainEnv = resolve(dirname(commonDir), '.env')
  // An ordinary checkout's own common dir IS its own .git, so this would otherwise "find" the same
  // absent file a second time and call it a second place checked.
  if (mainEnv === local) return { path: local, found: false, checked: [local] }
  if (existsSync(mainEnv)) return { path: mainEnv, found: true, checked: [local, mainEnv] }
  return { path: local, found: false, checked: [local, mainEnv] }
}

/**
 * This process's own `.env` resolution, computed once — see `findEnvFile`. From a bundle there is no
 * git and no checkout: `.env` is in the data folder. A paired checkout reads only development's file.
 */
const ENV_RESOLUTION =
  THE_DEVELOPMENT_CHECKOUT !== null || THE_INSTALL.from === 'bundle'
    ? (() => {
        const path = resolve(THE_DEVELOPMENT_CHECKOUT ?? DATA_ROOT, '.env')
        return { path, found: existsSync(path), checked: [path] }
      })()
    : findEnvFile()

/**
 * The settings file: development's exact `.env` when paired; otherwise the file `findEnvFile`
 * finds for this checkout, or the bundle's data-folder file.
 */
export const ENV_FILE = ENV_RESOLUTION.path

/** Real paths identify existing files; a missing file keeps its resolved path. @param {string} path */
function realOrResolved(path) {
  try { return realpathSync(path) } catch { return resolve(path) }
}

/**
 * The stable checkout a settings file names, as a real path, or null for an absent or empty value.
 * A relative value throws STABLE_CHECKOUT_INVALID; it can never grant unpaired database access.
 * @param {string} [file]
 * @returns {string | null}
 */
export function theStableCheckoutNamedIn(file = ENV_FILE) {
  const stable = envFileValues(file).MOLE_OFFICE_STABLE_CHECKOUT
  if (stable === undefined || stable.trim() === '') return null
  if (!isAbsolute(stable)) throw Object.assign(new Error(pairingWords('stableAbsolute', { value: stable, file })), { code: 'STABLE_CHECKOUT_INVALID' })
  return realOrResolved(stable)
}

/**
 * One answer for every opener of the database development's file names. Environment overrides
 * may name a different database; they cannot grant access to the paired database itself.
 * @param {string} databasePath
 * @returns {string | null}
 */
export function whyThisCheckoutMayNotOpenTheDatabase(databasePath) {
  if (THE_DEVELOPMENT_CHECKOUT !== null) return null
  const stablePath = theStableCheckoutNamedIn(ENV_FILE)
  if (stablePath === null) return null
  if (realOrResolved(REPO_ROOT) === stablePath) return null
  if (realOrResolved(databasePath) !== realOrResolved(canonicalDatabasePath(ENV_FILE))) return null
  return pairingWords('databaseRefusal', { stable: stablePath, database: resolve(databasePath) })
}

/**
 * Where a value came from. Part of every answer, because "why did it say that" needs it.
 *
 * @typedef {'the environment' | '.env' | 'the office database' | 'the built-in default' | 'nothing set it' | 'not read'} SettingSource
 */

/**
 * What kind of value a setting holds, which is what says how to check it.
 *
 * @typedef {'port' | 'path' | 'address' | 'word' | 'duration' | 'list' | 'flag'} SettingKind
 */

/**
 * One setting: its name, what it is for, and what it means when nobody sets it.
 *
 * @typedef {object} Setting
 * @property {string} name
 * @property {SettingKind} kind
 * @property {string} what One plain sentence: what a person reads when they ask what it is for.
 * @property {string | null} fallback The value used when nobody sets it, written out. Null means
 *   absent is a real state with its own meaning — off, or none — rather than a value.
 * @property {string | null} absentMeans What absent means, when `fallback` is null. Null exactly
 *   when `fallback` is not null.
 * @property {boolean} inTemplate Whether `.env.example` names it. A setting nobody can find in that
 *   file is one nobody will ever turn, so the default is yes; the exceptions carry their reason.
 * @property {string | null} notInTemplateBecause Null exactly when `inTemplate` is true.
 * @property {boolean} served Whether the settings door serves its value. A private value is declared
 *   not served here, and the door leaves it out as it leaves out a key.
 * @property {string | null} notServedBecause Null exactly when `served` is true.
 * @property {string | null} emptyMeans What being set to an empty string means. Null means it is
 *   refused, which is the rule for all but two: an empty LIST is a real instruction — watch
 *   nothing, serve nothing — and refusing it would leave no way to say so.
 */

/**
 * @param {string} name
 * @param {SettingKind} kind
 * @param {string} what
 * @param {string | null} fallback
 * @param {{ absentMeans?: string, notInTemplateBecause?: string, notServedBecause?: string, emptyMeans?: string }} [extra]
 * @returns {Setting}
 */
function setting(name, kind, what, fallback, extra = {}) {
  return {
    name,
    kind,
    what,
    fallback,
    absentMeans: extra.absentMeans ?? null,
    inTemplate: extra.notInTemplateBecause === undefined,
    notInTemplateBecause: extra.notInTemplateBecause ?? null,
    served: extra.notServedBecause === undefined,
    notServedBecause: extra.notServedBecause ?? null,
    emptyMeans: extra.emptyMeans ?? null,
  }
}

/** The API port's default. Written once; every other mention of it is derived from this one. */
const API_PORT_FALLBACK = 8787
/** The browser app's default port, and the reason it has a variable of its own. */
const WEB_PORT_FALLBACK = 5173
/**
 * The database's default, relative to the checkout. It was `./data/panelx.db` until 30 September 2026, under a decision
 * and FLO-02 of another, and is now `./data/mole-office.db`, a name that describes no one
 * project. An office made before then keeps its file by naming it in its own
 * .env. `theOldDatabaseNotice` below tells such an office at start-up that the default moved.
 */
const DATABASE_FALLBACK = './data/mole-office.db'
/** The file the default named before 30 September 2026, which the start-up notice looks for. */
export const THE_DATABASE_BEFORE_THE_RENAME = './data/panelx.db'
/**
 * The project a command-line tool reads and writes when nobody says which: `default`, the project
 * every office has (src/server/db/workspace-migration.ts). It was `panelx` until 30 September 2026, under FLO-02 of a
 * decision. An office that uses another project names it in its own .env.
 */
const WORKSPACE_FALLBACK = 'default'
/**
 * THE FEWEST AND THE MOST TEST WORKERS the office's merge tool may give one suite run (MOLE_OFFICE_MERGE_WORKERS), in one
 * place: the setting's words and the merge tool both say them, and a second copy would drift (the inspector's note on
 * the follow-ups' release, acceptance finding 58).
 */
export const MERGE_WORKERS_BOUNDS = Object.freeze({ fewest: 1, most: 32 })

/**
 * The shipped bus cap is eight. The Settings door protects a changed cap with the person's press
 * or exact words (LNUhmsjLYjWw). Sixty-four is a technical limit against accidental huge
 * batches: replay and culprit searches grow with every rider. It is not a second policy cap.
 */
export const BUS_ENTRIES_BOUNDS = Object.freeze({ fewest: 1, most: 64 })
export const BUS_ENTRIES_FALLBACK = 8

/**
 * THE FEWEST AND THE MOST MEGABYTES MOLE_OFFICE_SERVER_HEAP_MB MAY GIVE THE SERVER'S V8 HEAP, in one place: `readSetting`
 * refuses a whole number outside them, the setting's words say them, and the tests name them from here.
 */
export const SERVER_HEAP_MB_BOUNDS = Object.freeze({ fewest: 2048, most: 32768 })

/**
 * HOW MANY CHECKS MAY START IN ONE LANE IN AN HOUR (MOLE_OFFICE_CHECKS_AN_HOUR): at most six.
 * The second part of a decision, of 22 September 2026, says a further check waits its turn
 * and is never refused. Said once here,
 * for the setting's words and the office's reading of it (src/server/lib/checks-an-hour.ts).
 * Only the person raises the six.
 */
const CHECKS_AN_HOUR_GATE = gateNamed('checks-an-hour')
const CONFLICT_RESOLVING_GATE = gateNamed('conflict-resolving')
const RED_FIXING_GATE = gateNamed('red-fixing')
const QUEUE_CODE_RIDES_A_BUS_GATE = gateNamed('queue-code-rides-a-bus')
const QUEUE_AT_THE_SEAL_GATE = gateNamed('queue-at-the-seal')
const QUEUE_WAITS_FOR_THE_LINE_GATE = gateNamed('queue-waits-for-the-line')
const QUEUE_HELD_GATE = gateNamed('queue-held')
const NEXT_ROUND_AT_THE_SEAL_GATE = gateNamed('next-round-at-the-seal')
const NEXT_ROUND_AT_THE_RELEASE_GATE = gateNamed('next-round-at-the-release')
const WHOLE_SUITE_FIX_ROUND_GATE = gateNamed('whole-suite-fix-round')
const RELATED_TESTS_ONLY_GATE = gateNamed('related-tests-only')
const FEW_FEATURE_REDS_GATE = gateNamed('few-feature-reds')
const WIDE_RED_GATE = gateNamed('wide-red')
const FLAKY_TESTS_GATE = gateNamed('flaky-tests')
const PLACEHOLDER_ADDRESSES_GATE = gateNamed('placeholder-addresses')
const HOUSE_RULE_REDS_GATE = gateNamed('house-rule-reds')
const FILE_TERRITORIES_GATE = gateNamed('file-territories')
if (CHECKS_AN_HOUR_GATE.positions.kind !== 'number') throw new Error('The checks-an-hour gate must have number positions.')
export const CHECKS_AN_HOUR_BOUNDS = Object.freeze({ fewest: CHECKS_AN_HOUR_GATE.positions.fewest, most: CHECKS_AN_HOUR_GATE.positions.most })

/**
 * THE MOST THE MERGE QUEUE'S SECOND OPINION ON MODAL MAY SPEND IN ONE CALENDAR MONTH, in US dollars, counted from the
 * runner's receipts (MOLE_OFFICE_MODAL_MONTHLY_CAP_USD): the owner's 42.5, which is Modal's 30 of free credit and the
 * owner's own card cap of 12.5. The Settings door protects a changed budget with the person’s press or exact words.
 */
export const MODAL_MONTHLY_CAP_USD = 42.5
/** The runner's token, Python and receipts folder, relative to the running user's home. */
export const MODAL_FOLDER = '.cache/mole-office/modal'

/**
 * A STOP DRAINS (the secretary's message n5g0uTda98in, 7 October 2026). The server stops taking new reads the
 * moment it is told to stop, and then answers the reads it already holds for at most this long.
 * Only a connection still open after that is ended. Until round 6f of wave 13x this was 1 s, and the
 * listener stayed open through every other step of the stop.
 *
 * WHY 30 S, measured at a load of 36 to 87 on 8 CPUs (round 6f). The real server's /api/health took
 * up to 25 s to answer a read it had taken. Before the drain, serve-dev's kill reset reads sent 6.5
 * and 16.9 s before it (.logs/r6o/c4r-a-1.log). With the drain, the old server answered every read
 * it held within 96 to 1016 ms in each of 8 restarts (the `[measured] case 4, the drain` lines). So
 * 30 s is the slowest read measured with 5 s to spare, and half of the secretary's 60 s ceiling.
 */
export const SHUTDOWN_CONNECTION_GRACE_MS = 30_000
/**
 * The whole stop: the drain above, and the 10 s every other step had before the drain existed. A
 * constant and not a setting, because no measured use needs another policy per installation.
 */
export const SHUTDOWN_LIMIT_MS = SHUTDOWN_CONNECTION_GRACE_MS + 10_000

/**
 * THE LONGEST A HANDOVER DOCUMENT MAY BE, in characters (Unicode code points, so a Chinese character is one).
 * Wave 13k round 46, by two of the person's decisions. PUT
 * /api/agents/:id/handover refuses a longer text and names both numbers; nothing is cut.
 *
 * WHY 8,000. The session hook prints the whole handover into a session's context after a compaction, ahead of
 * everything else, so it must stay short enough to be read there in full: 8,000 characters is about 1,300 English
 * words, twice the longest notebook entry (4,000, LONGEST_ENTRY in src/server/api/notebook.ts). A constant and not a
 * setting, because no measured use needs another limit per installation.
 */
export const HANDOVER_LONGEST_CHARACTERS = 8_000
/**
 * THE STAND-IN'S OWN GRACE (tools/serve-dev-stand-in.mjs), 1 s: for a connection that never asks,
 * and for its wait to say `listening`. It answers every read at once, so it needs none of the
 * server's drain above, which round 6f of wave 13x raised. Until then the two were one number,
 * and at the server's drain a stand-in under a steady stream of reads would wait that long before it
 * said `listening`, and hold up every restart behind it.
 */
export const THE_STAND_IN_GRACE_MS = 1_000

/**
 * WHAT `mole-office start` WRITES INTO MOLE_OFFICE_STARTED_BY for the server it starts, and what the
 * server's runtime reads back to name its service manager (criterion W8). One string in one place.
 */
export const STARTED_BY_THE_SERVICE_COMMAND = 'mole-office start'
/**
 * The demo corpus the seed writes when nobody names another one.
 *
 * It is a public, invented project, so that a fresh clone of this repository seeds something that
 * describes nobody. Somebody with a corpus of their own points this at it and gets theirs instead.
 */
const SEED_CORPUS_FALLBACK = './scripts/seed-corpus/public.json'

/**
 * THE THREE THINGS `MOLE_OFFICE_MESSAGE_WORKER` MAY SAY. `readSetting` refuses anything else and names
 * these in the refusal.
 *
 * - `on`: the server starts its message worker. It starts a run of an agent's tool for a message to
 *   that agent, the check tool for a check, and the office's merge tool for a merge entry.
 * - `off`: the server starts no worker. Nothing is started, and every message stays queued.
 * - `merges-only`: the server starts its worker, and the worker starts the office's merge tool, the
 *   rounds asked through the next-round door and the worker runs asked through the worker-run door, and
 *   no run for a message. `MERGES_ONLY_SAYS` below is what
 *   that means.
 *
 * @type {readonly string[]}
 */
export const MESSAGE_WORKER_MODES = ['on', 'off', 'merges-only']

/**
 * WHAT `MOLE_OFFICE_MESSAGE_WORKER=merges-only` DOES, in the one sentence every place that reports the
 * mode says: the server's line on the runtime page, the worker's first line in its log, and the refusal
 * `startOne` gives in that mode. If each of the three said it in its own words, one of them could come
 * to promise something the worker does not do.
 *
 * WHY THE MODE EXISTS. The merge queue needs the worker to start its merge tool. On 22 September 2026
 * the live office held 2,805 queued deliveries to agents (the count the task that built this was
 * given, not re-measured here). With the worker on, each of them would start a run of its agent's tool
 * on this machine. A check is left out too, because the check tool runs a model.
 *
 * THE ROUNDS ASKED THROUGH THE NEXT-ROUND DOOR ARE STARTED IN THIS MODE (wave 13j round loop-3). The
 * owner decided that a supervisor's next round starts on the supervisor's word, and the
 * mode is there so that a message nobody asked a run for starts none (criterion M78). Reading the two
 * together was an engineering decision, which can be undone. src/server/lib/next-round.ts says who
 * decided it and where. The worker runs a supervisor asks for at the worker-run door are started in this
 * mode for the same reason, under the decision that a supervisor starts its own workers;
 * src/server/lib/worker-runs.ts says so.
 */
export const MERGES_ONLY_SAYS =
  'The message worker is in merges-only mode (MOLE_OFFICE_MESSAGE_WORKER=merges-only): it starts the ' +
  "office's merge tool for the merge entries the office marks, and it starts no agent run for a message, so every message " +
  'to an agent stays queued. It does start the rounds asked for through the next-round door ' +
  '(POST /api/agents/<agent>/next-round) and the worker runs asked for through the worker-run door ' +
  '(POST /api/agents/<agent>/worker-run), and no other agent run. It starts a check only while the office says ' +
  'checks run in this mode for its project (GET /api/office/checks-in-merges-only), which is off until somebody switches it on.'

/**
 * THE TWO THINGS `MOLE_OFFICE_TERMINAL_HOLDER` MAY SAY. `readSetting` refuses anything else and names
 * these in the refusal.
 *
 * - `on`: `mole-office start` starts the terminal holder (src/holder/index.mjs) when none is running
 *   for this database.
 * - `off`: it starts none, and says so. The holder outlives the server, so a scratch office that a
 *   test starts and stops would leave one behind; the tests' shared environment sets off.
 *
 * @type {readonly string[]}
 */
export const TERMINAL_HOLDER_MODES = ['on', 'off']

/**
 * THE THREE THINGS `MOLE_OFFICE_START_MODE` MAY SAY. `readSetting` refuses anything else and names
 * these in the refusal.
 *
 * - `ordinary`: serves the office.
 * - `release-check`: serves only read-only health and runtime diagnostics on a closed, checkpointed
 *   database.
 * - `release-check-live`: does the same on the live database while another version of the office
 *   serves it, for the release tool's one trial of a version that changes no migration.
 */
export const START_MODES = Object.freeze(/** @type {const} */ (['ordinary', 'release-check', 'release-check-live']))

/**
 * THE TWO THINGS `MOLE_OFFICE_WINDOW_DEBUGGING` MAY SAY. `readSetting` refuses anything else and names
 * these in the refusal.
 *
 * - `off`: the window refuses to start when it is given a debugging switch, and keeps Node's inspector
 *   shut (src/desktop/the-debugging-switches.mjs).
 * - `on`: it starts with them. The tests that drive the window through Playwright or the inspector say on.
 *
 * @type {readonly string[]}
 */
export const WINDOW_DEBUGGING_MODES = ['on', 'off']

if (FILE_TERRITORIES_GATE.positions.kind !== 'block-remind-off') throw new Error('The file-territories gate must have block, remind and off positions, or fewer of them.')
/** Territory overlaps only remind; no position blocks a write. The gate list declares the positions. @type {readonly string[]} */
export const GATE_TERRITORIES_MODES = FILE_TERRITORIES_GATE.positions.allowed

/**
 * EVERY SETTING, IN THE ORDER `.env.example` DOCUMENTS THEM.
 *
 * Adding one here is what makes it exist: `readSetting` refuses a name that is not in this list,
 * so a typo in a caller is a refusal rather than a silent `undefined`.
 */
/** @type {readonly Setting[]} */
export const SETTINGS = [
  setting(
    gateNamed('package-alignment-answer').setting,
    'flag',
    'Ask for an answer to a package plan before work continues, and remind the maker when a hand-back is not aligned.',
    gateDefaultHere(gateNamed('package-alignment-answer')),
    { notInTemplateBecause: 'A switch chosen on the Gates panel; it is off in both kinds of office.' },
  ),
  setting('MOLE_OFFICE_PORT', 'port', SETTING_WORDS.MOLE_OFFICE_PORT, String(API_PORT_FALLBACK)),
  setting('MOLE_OFFICE_DB', 'path', SETTING_WORDS.MOLE_OFFICE_DB, DATABASE_FALLBACK),
  setting('MOLE_OFFICE_DEVELOPMENT_CHECKOUT', 'path', SETTING_WORDS.MOLE_OFFICE_DEVELOPMENT_CHECKOUT, null, {
    absentMeans: 'this install reads its own settings and data',
    notInTemplateBecause: 'only the environment that starts a stable checkout may name its development checkout',
  }),
  setting('MOLE_OFFICE_STABLE_CHECKOUT', 'path', SETTING_WORDS.MOLE_OFFICE_STABLE_CHECKOUT, null, {
    absentMeans: 'this checkout may serve the database its settings name',
    notInTemplateBecause: 'the bootstrap handoff writes this pairing into development settings',
  }),
  setting('MOLE_OFFICE_WEB_PORT', 'port', SETTING_WORDS.MOLE_OFFICE_WEB_PORT, String(WEB_PORT_FALLBACK)),
  setting(
    'MOLE_OFFICE_API',
    'address',
    SETTING_WORDS.MOLE_OFFICE_API,
    `http://127.0.0.1:<MOLE_OFFICE_PORT>`,
    {},
  ),
  setting(
    'MOLE_OFFICE_API_ROOT',
    'path',
    SETTING_WORDS.MOLE_OFFICE_API_ROOT,
    '(unset: every copy takes it)',
    {
      notInTemplateBecause:
        "a sandbox's helper sets it beside MOLE_OFFICE_API for the command it starts, so that a copy of the tools that is no " +
        "checkout of that sandbox does not take the address; a person's own office has no use for it, and unset nothing changes.",
    },
  ),
  setting(
    'MOLE_OFFICE_WEB',
    'address',
    SETTING_WORDS.MOLE_OFFICE_WEB,
    `http://127.0.0.1:<MOLE_OFFICE_WEB_PORT>`,
    {
      notInTemplateBecause:
        'it points a browser at an app somebody already started rather than configuring the server. ' +
        'It was missing from the template by accident until 3 September 2026 and nothing noticed, ' +
        'because the check asked whether the file CONTAINED the name and MOLE_OFFICE_WEB_PORT contains it.',
    },
  ),
  setting('MOLE_OFFICE_WORKSPACE', 'word', SETTING_WORDS.MOLE_OFFICE_WORKSPACE, WORKSPACE_FALLBACK),
  // WHO OWNS THIS OFFICE, read once, at the first migrate, and then kept in the database
  // (people.office_owner, the owner migration `the_owner_comes_from_the_installer`; src/server/db/owner-setting.ts).
  // FLO-14 of two decisions: the owner comes from the installer, not from the
  // code. After the first migrate the id must still match (a different one
  // stops the server with a sentence), and the name is not read again: it is the person's to change.
  setting(
    'MOLE_OFFICE_OWNER_ID',
    'word',
    SETTING_WORDS.MOLE_OFFICE_OWNER_ID,
    null,
    {
      absentMeans:
        "a new office gives its owner the id `owner`. An office that already holds work and has no owner " +
        'written refuses to start until this and MOLE_OFFICE_OWNER_NAME are set.',
      emptyMeans: 'the same as not set: a new office gives its owner the id `owner`. It is how a shell says so over a .env that sets it.',
    },
  ),
  setting(
    'MOLE_OFFICE_OWNER_NAME',
    'word',
    SETTING_WORDS.MOLE_OFFICE_OWNER_NAME,
    null,
    {
      absentMeans:
        'a new office has no owner name. Its pages lead the person to #/welcome, where they give it ' +
        'themselves; until then the name reads "default office owner name".',
      emptyMeans: 'the same as not set: the person gives their name at #/welcome. It is how a shell says so over a .env that sets it.',
    },
  ),
  setting(
    'MOLE_OFFICE_REPO_ROOT',
    'path',
    SETTING_WORDS.MOLE_OFFICE_REPO_ROOT,
    null,
    { absentMeans: 'the checkout this server was started from' },
  ),
  setting(
    'MOLE_OFFICE_AGENT_MODEL',
    'word',
    SETTING_WORDS.MOLE_OFFICE_AGENT_MODEL,
    null,
    {
      // NO SHIPPED MODEL, as FLO-05 of a decision says. It said 'opus' here while .env.example
      // said sonnet. A run with no model named is refused, and the refusal says where to name one.
      absentMeans:
        'no model. A run that gets none from the Casting table, the Settings page or the agent\'s profile is ' +
        'not started, and the refusal says where to name one.',
    },
  ),
  /**
   * THE RUNTIME AND MODEL THE OFFICE'S OWN RUNS TAKE WHEN THE SETTINGS PAGE NAMES NONE. Criteria T7
   * and U2.
   *
   * The runs the office starts by itself — answering a message in a group — take this pair, apart
   * from what a builder gets, when nothing on the Settings page names one for them. The agent's own
   * registry row wins over the runtime, and the agent's own model on its profile wins over the
   * model, because each is the more specific thing a person set. `theModelARunGets` in
   * src/server/lib/run-models.ts is the one reader of that order.
   */
  setting(
    'MOLE_OFFICE_CHORE_RUNTIME',
    'word',
    SETTING_WORDS.MOLE_OFFICE_CHORE_RUNTIME,
    null,
    {
      absentMeans:
        "the agent's own registry row decides which runtime serves it, which is what happens today. " +
        "Set it to send the office's own runs to a runtime of their own, for example opencode.",
    },
  ),
  setting(
    'MOLE_OFFICE_CHORE_MODEL',
    'word',
    SETTING_WORDS.MOLE_OFFICE_CHORE_MODEL,
    null,
    {
      absentMeans:
        'a run keeps the model it is given today: MOLE_OFFICE_AGENT_MODEL for a runtime that reads that ' +
        'setting, and no model at all for opencode, whose runs carry none until one is named here.',
    },
  ),
  setting(
    'MOLE_OFFICE_CHORE_VARIANT',
    'word',
    SETTING_WORDS.MOLE_OFFICE_CHORE_VARIANT,
    null,
    { absentMeans: "when the chore names no model, no variant is passed, so the runtime's own default applies. A named model takes its effort from the office: the agent, then Casting, then the owner's rule" },
  ),
  setting(
    'MOLE_OFFICE_INSPECTION_MODEL',
    'word',
    SETTING_WORDS.MOLE_OFFICE_INSPECTION_MODEL,
    null,
    {
      // NO SHIPPED MODEL, by FLO-05 of a decision. It said 'sonnet' here until 2 October 2026.
      absentMeans:
        'no model. A check that gets none from the Casting table or the checking agent\'s profile is not ' +
        'started, and the refusal says where to name one.',
    },
  ),
  setting('MOLE_OFFICE_INSPECTION_MINUTES', 'word', SETTING_WORDS.MOLE_OFFICE_INSPECTION_MINUTES, '40'),
  // THE CHECKS AN HOUR IN ONE LANE, as the second part of a decision says. The message worker
  // holds a further check with a sentence, and src/server/lib/checks-an-hour.ts is the one reader.
  setting(
    CHECKS_AN_HOUR_GATE.setting,
    'word',
    shippedSettingDescription(CHECKS_AN_HOUR_GATE.setting),
    gateDefaultHere(CHECKS_AN_HOUR_GATE),
  ),
  setting('MOLE_OFFICE_INSPECTION_API_SECONDS', 'word', SETTING_WORDS.MOLE_OFFICE_INSPECTION_API_SECONDS, '60'),
  // Tj0gSo-y1I6h: only a request that never reached the office may be asked again.
  setting('MOLE_OFFICE_INSPECTION_OFFICE_BACK_SECONDS', 'word', SETTING_WORDS.MOLE_OFFICE_INSPECTION_OFFICE_BACK_SECONDS, '120'),
  setting(
    'MOLE_OFFICE_LINES_THE_INSPECTOR_ANSWERS',
    'list',
    SETTING_WORDS.MOLE_OFFICE_LINES_THE_INSPECTOR_ANSWERS,
    null,
    {
      absentMeans: "no line's hand-backs are read this way; every check runs as before.",
      emptyMeans: "no line's hand-backs are read this way; every check runs as before.",
    },
  ),
  // WHOSE RUNS tools/settle-owed-runs.mjs NEVER SETTLES, beside the person's own, as FLO-45 of a decision
  // says. The tool named two of the owner's agents in its code until 2 October 2026; an office
  // that wants the same names them here.
  setting(
    'MOLE_OFFICE_SETTLE_PROTECTED_HANDLES',
    'list',
    SETTING_WORDS.MOLE_OFFICE_SETTLE_PROTECTED_HANDLES,
    null,
    {
      absentMeans: "no agent is protected. The tool still refuses to settle the person's runs.",
      emptyMeans: "no agent is protected. The tool still refuses to settle the person's runs.",
    },
  ),
  // THE PORTS A FIRST-HANDOFF REHEARSAL MUST NOT TAKE, named by whoever starts it (tools/stable/stable-bootstrap-support.mjs).
  // No port is written here: the ports another office holds are a fact of one machine, so the rehearsal reads them
  // when it runs. It also refuses any port something on the machine already listens on.
  setting(
    'MOLE_OFFICE_REHEARSAL_KEEP_CLEAR_PORTS',
    'list',
    SETTING_WORDS.MOLE_OFFICE_REHEARSAL_KEEP_CLEAR_PORTS,
    null,
    {
      absentMeans: 'no port is named. A rehearsal still refuses any port something on this machine already listens on.',
      emptyMeans: 'no port is named. A rehearsal still refuses any port something on this machine already listens on.',
      notInTemplateBecause:
        'a rehearsal reads it only from the environment of the command that starts it, and never from a .env file, ' +
        'so a line in .env would keep no port clear',
    },
  ),
  setting(
    'MOLE_OFFICE_REGISTER_TIMEOUT_SECONDS',
    'word',
    SETTING_WORDS.MOLE_OFFICE_REGISTER_TIMEOUT_SECONDS,
    '60',
  ),
  // THE ADDRESS ON EVERY COMMIT THE OFFICE'S OWN TOOLS MAKE. A real address belongs to one person,
  // so it goes in that person's own .env and not in the product. Since 30 September 2026 the default
  // is an address that reaches nobody, as FLO-03 of a decision says. `.invalid` is the ending
  // no real address can have. The name stays whoever made the commit: the agent's handle in a sandbox, "Mole Office
  // merge queue" for the merge tool. Both go in as GIT_AUTHOR_EMAIL and GIT_COMMITTER_EMAIL, which outrank any git
  // config an agent sets (message aFpp-sON2iOA).
  setting(
    'MOLE_OFFICE_COMMIT_EMAIL',
    'word',
    SETTING_WORDS.MOLE_OFFICE_COMMIT_EMAIL,
    'mole-office@example.invalid',
  ),
  // THE PRIVATE COPY THE MERGE TOOL PUSHES MAIN TO. A repository address belongs to the one machine that pushes, so
  // it is set in the environment of the host run that lands, and never in the product or a .env file. It has no
  // default. With none, a landing still lands, and its push says there is no private copy to push to
  // (tools/merge-tool/push.mjs). Set and empty is refused, as for any setting with no emptyMeans: it is more likely a
  // mistake than a way to say "no copy", which is what leaving it out already says.
  setting(
    'MOLE_OFFICE_PRIVATE_ORIGIN',
    'word',
    SETTING_WORDS.MOLE_OFFICE_PRIVATE_ORIGIN,
    null,
    {
      absentMeans: 'the merge tool pushes a landed commit to no private copy and says so. The mirror of main is still pushed.',
      notInTemplateBecause: 'it is set in the environment of the host run that lands and never in a .env file, so the template has no line for it',
      notServedBecause: 'its value is a private address',
    },
  ),
  // THE MERGE SUITE'S WORKERS: the default is THE_SUITE_WORKERS.queue in src/config/the-suite-workers.mjs, which holds
  // the number and its measurement beside the plain run's (problem EQdNjfnfFsXX). The merge tool reads a whole number
  // within MERGE_WORKERS_BOUNDS and says so when it is not one.
  // THE MERGE QUEUE'S BUS, from a decision of 3 October 2026, holds at most eight entries since another of 6 October
  // 2026. An entry released by its check waits for others of its lane, and
  // the whole suite runs once for up to this many of them, or once 30 minutes have passed since the first was released,
  // whichever comes first. tools/merge-tool/pairs.mjs reads both.
  setting(
    'MOLE_OFFICE_BUS_MOST_ENTRIES',
    'word',
    shippedSettingDescription('MOLE_OFFICE_BUS_MOST_ENTRIES'),
    String(BUS_ENTRIES_FALLBACK),
  ),
  setting(
    WHOLE_SUITE_FIX_ROUND_GATE.setting,
    'flag',
    SETTING_WORDS[WHOLE_SUITE_FIX_ROUND_GATE.setting],
    gateDefaultHere(WHOLE_SUITE_FIX_ROUND_GATE),
    { notInTemplateBecause: 'Dormant queue wiring; activation belongs to the later stable switch.' },
  ),
  setting(
    RELATED_TESTS_ONLY_GATE.setting,
    'flag',
    SETTING_WORDS[RELATED_TESTS_ONLY_GATE.setting],
    gateDefaultHere(RELATED_TESTS_ONLY_GATE),
    { notInTemplateBecause: 'A merge-queue position chosen on the Gates panel; its default keeps the whole suite.' },
  ),
  // TIER 2 OF THE OWNER'S DECISION, with records wqd6E-wVJHSr and xqGNR20SQ9vO.
  // src/config/conflict-resolving.mjs reads it.
  setting(
    CONFLICT_RESOLVING_GATE.setting,
    'flag',
    SETTING_WORDS[CONFLICT_RESOLVING_GATE.setting],
    gateDefaultHere(CONFLICT_RESOLVING_GATE),
    { notInTemplateBecause: 'Dormant queue wiring; nothing goes live without the owner.' },
  ),
  // A TEST RED ONLY WITH THE ENTRY GOES TO ITS OWN LINE FIRST (13u round 63). src/server/lib/merge-state-machine.ts reads it.
  setting(
    RED_FIXING_GATE.setting,
    'flag',
    SETTING_WORDS[RED_FIXING_GATE.setting],
    gateDefaultHere(RED_FIXING_GATE),
    { notInTemplateBecause: 'Dormant queue wiring; nothing goes live without the owner.' },
  ),
  // THE QUEUE'S OWN CODE RIDES A BUS WHEN A LANDING CHANGES NEITHER THE OFFICE NOR THE MERGE TOOL (13u round 66).
  // src/config/queue-code-rides-a-bus.mjs reads it.
  setting(
    QUEUE_CODE_RIDES_A_BUS_GATE.setting,
    'flag',
    SETTING_WORDS[QUEUE_CODE_RIDES_A_BUS_GATE.setting],
    gateDefaultHere(QUEUE_CODE_RIDES_A_BUS_GATE),
    { notInTemplateBecause: 'A merge-queue switch chosen on the Gates panel; it is 1 unless set.' },
  ),
  // THE OFFICE QUEUES A SEALED ROUND, WAITS FOR THE LINE'S EARLIER ENTRY, AND HOLDS (13u round 93).
  // src/server/lib/merge-queue-at-the-seal.ts reads all three.
  setting(
    QUEUE_AT_THE_SEAL_GATE.setting,
    'flag',
    SETTING_WORDS[QUEUE_AT_THE_SEAL_GATE.setting],
    gateDefaultHere(QUEUE_AT_THE_SEAL_GATE),
    { notInTemplateBecause: 'Dormant queue wiring; nothing goes live without the owner.' },
  ),
  setting(
    QUEUE_WAITS_FOR_THE_LINE_GATE.setting,
    'flag',
    SETTING_WORDS[QUEUE_WAITS_FOR_THE_LINE_GATE.setting],
    gateDefaultHere(QUEUE_WAITS_FOR_THE_LINE_GATE),
    { notInTemplateBecause: 'Dormant queue wiring; nothing goes live without the owner.' },
  ),
  setting(
    QUEUE_HELD_GATE.setting,
    'flag',
    SETTING_WORDS[QUEUE_HELD_GATE.setting],
    gateDefaultHere(QUEUE_HELD_GATE),
    { notInTemplateBecause: 'A merge-queue hold chosen on the Gates panel; it is 0 unless set.' },
  ),
  // THE WORK SWITCHES (wave 13q item 17), set on the Settings page with a reason. A host script reads them at
  // GET /api/office/work-switches, and src/server/lib/work-switches.ts checks every value.
  setting(OWN_RELEASE_SKIP_TAGS, 'list', SETTING_WORDS.MOLE_OFFICE_OWN_RELEASE_SKIP_TAGS, null, {
    absentMeans: 'No check tag is left out of the release that runs on its own.',
    notInTemplateBecause: 'A list set on the Settings page with a reason, and read by a host script at GET /api/office/work-switches.',
  }),
  setting(OWN_RELEASE_SKIP_RUNS, 'list', SETTING_WORDS.MOLE_OFFICE_OWN_RELEASE_SKIP_RUNS, null, {
    absentMeans: 'No run is left out of the release that runs on its own.',
    notInTemplateBecause: 'A list set on the Settings page with a reason, and read by a host script at GET /api/office/work-switches.',
  }),
  setting(RECEIPT_PRODUCER_PENDING, 'path', SETTING_WORDS.MOLE_OFFICE_RECEIPT_PRODUCER_PENDING, null, {
    absentMeans: 'The whole-suite receipt producer has no unfinished attempt.',
    notInTemplateBecause: 'The receipt producer sets it, and it is cleared on the Settings page with a reason.',
  }),
  // THE OFFICE ASKS FOR THE NEXT ROUND AT THE SEAL (13u round 94). src/server/lib/next-round-at-the-seal.ts reads it.
  setting(
    NEXT_ROUND_AT_THE_SEAL_GATE.setting,
    'flag',
    SETTING_WORDS[NEXT_ROUND_AT_THE_SEAL_GATE.setting],
    gateDefaultHere(NEXT_ROUND_AT_THE_SEAL_GATE),
    { notInTemplateBecause: 'Dormant round wiring; nothing goes live without the owner.' },
  ),
  // THE OFFICE ASKS FOR THE NEXT ROUND AT THE RELEASE (13r round AX). src/server/lib/next-round-at-the-seal.ts reads it.
  setting(
    NEXT_ROUND_AT_THE_RELEASE_GATE.setting,
    'flag',
    SETTING_WORDS[NEXT_ROUND_AT_THE_RELEASE_GATE.setting],
    gateDefaultHere(NEXT_ROUND_AT_THE_RELEASE_GATE),
    { notInTemplateBecause: 'Dormant round wiring; nothing goes live without the owner.' },
  ),
  setting(
    'MOLE_OFFICE_BUS_LEAVES_AFTER_SECONDS',
    'word',
    SETTING_WORDS.MOLE_OFFICE_BUS_LEAVES_AFTER_SECONDS,
    '1800',
  ),
  setting(
    'MOLE_OFFICE_MAIN_SUITE_COUNTER',
    'word',
    'The id of the counter that requests the periodic whole-suite check on main.',
    null,
    {
      absentMeans: 'No periodic main-suite counter is activated.',
      emptyMeans: 'No periodic main-suite counter is activated.',
      notInTemplateBecause: 'A counter id is supplied only by the separate producer activation.',
    },
  ),
  // THE SCHEDULE OF THE WHOLE SUITE ON MAIN (step 1b): every so many landings or every so many hours, whichever comes
  // first. src/config/main-suite-job.mjs reads both and refuses a value outside its limits.
  setting(
    'MOLE_OFFICE_MAIN_SUITE_LANDINGS',
    'word',
    'How many landings on main ask for the whole suite on main, a whole number from 1 to 100.',
    '6',
    { notInTemplateBecause: 'The main-suite job reads it when it files or checks its counter; an office does not use it.' },
  ),
  setting(
    'MOLE_OFFICE_MAIN_SUITE_HOURS',
    'word',
    'How many hours after the last whole suite on main a landing asks for the next one at once, above 0 and at most 24.',
    '2',
    { notInTemplateBecause: 'The main-suite job reads it when it files or checks its counter; an office does not use it.' },
  ),
  // THE BUILD SHERIFF, as item 4 of a decision says: the agent a test red on main alone, which belongs to no merge
  // entry, goes to. The office files the problem either way; this names who is told.
  setting(
    'MOLE_OFFICE_BUILD_SHERIFF',
    'word',
    SETTING_WORDS.MOLE_OFFICE_BUILD_SHERIFF,
    null,
    { absentMeans: 'no agent is told; the office still files the problem and tells the secretary' },
  ),
  // WHO IS WARNED WHEN A SANDBOX FOLDER PASSES 60 GB (decisions 0xxUpTsNoDhe and ZP-7AFoCvp1L). tools/sandbox-common.mjs
  // named two agents in its code until 16 November 2026; an office that wants the same names them here. A crossing told to
  // nobody fails the run, so the host's timer shows it (the coordinator's ruling of 16 November 2026, in decision ZP-7AFoCvp1L).
  setting(
    'MOLE_OFFICE_SANDBOX_DISK_WATCHERS',
    'list',
    SETTING_WORDS.MOLE_OFFICE_SANDBOX_DISK_WATCHERS,
    null,
    {
      absentMeans: "nobody is told, and a run that finds a folder passing 60 GB fails. sizes --tell still lists the sizes, says which folder nobody was told about, and leaves that folder's warning for a later run.",
      emptyMeans: "nobody is told, and a run that finds a folder passing 60 GB fails. sizes --tell still lists the sizes, says which folder nobody was told about, and leaves that folder's warning for a later run.",
    },
  ),
  // WHOM THE SCHEDULED TIMING JOB'S RESULT REPORT IS ADDRESSED TO (decisions 0xxUpTsNoDhe and xkZEzm9pjbr3).
  // tools/run-the-timing-job.mjs named one agent in its code until 16 November 2026. A report filed to nobody fails the run
  // after it answers its firing (the coordinator's ruling of 16 November 2026, in decision xkZEzm9pjbr3).
  setting(
    'MOLE_OFFICE_TIMING_REPORT_READER',
    'word',
    SETTING_WORDS.MOLE_OFFICE_TIMING_REPORT_READER,
    null,
    {
      absentMeans: 'each report is filed addressed to nobody and answers its firing, the tick does all its other work, and then the run fails once, with a sentence that names every such report and this setting. A failed check still tells the secretary.',
      emptyMeans: 'the same as not set: each report is filed addressed to nobody, and the run fails once the tick has done the rest.',
    },
  ),
  setting(
    'MOLE_OFFICE_MERGE_WORKERS',
    'word',
    shippedSettingDescription('MOLE_OFFICE_MERGE_WORKERS'),
    String(THE_SUITE_WORKERS.queue.count),
  ),
  // THE OWNER'S CONTENT THE PRIVACY GATES REFUSE: the owner's names, the agent handles, the research words, the
  // owner's account, the machine name and the port of the owner's own office. Those values are not written in the
  // repository; tests/the-owners-content-list.ts reads them from this file, and its header gives the file's format.
  setting(
    'MOLE_OFFICE_OWNER_CONTENT_LIST',
    'path',
    "The absolute path of the file of the owner's content that the privacy gates refuse: names, handles, research words, the account, the machine name and the port of the owner's own office, one entry per line.",
    null,
    {
      absentMeans:
        'the privacy gates run only the checks that need no names, such as home folders, addresses, keys and record ids. ' +
        'Each gate says which named patterns it did not check, and each test that needs the real values is taken out and says why.',
      emptyMeans: 'the same as not set: no named pattern is checked, and each gate says so. It is how a shell says so over a .env that sets it.',
      notInTemplateBecause: 'the file holds one person\'s content and lives outside every checkout. Whoever holds the file names it in their own .env or environment',
      notServedBecause: 'its value is the place of a private file on this computer',
    },
  ),
  setting(
    'MOLE_OFFICE_CLOUD_RUNNER_FILE',
    'path',
    'The cloud suite door reads its runner settings from this file. The file must be owned by this user with mode 0600.',
    null,
    {
      absentMeans: 'the cloud suite door reads the default runner file in this user\'s cache',
      notInTemplateBecause: 'the runner belongs to one user and is configured outside the office. The door reads this override only from its calling environment',
    },
  ),
  setting(
    'MOLE_OFFICE_CLOUD_TRANSPORT',
    'path',
    'An executable that stands in for SSH in tests of the cloud suite door. A test must also name a runner file other than the default one.',
    null,
    {
      absentMeans: 'the cloud suite door uses SSH; a run started by tests refuses the real cloud box',
      notInTemplateBecause: 'a test names its local stand-in in its own environment. A shared setting would replace the cloud box for ordinary queue runs',
    },
  ),
  // WHO KEEPS THE OPERATIONS LIST OF MOVED TESTS (decision dNb5VAayS-Fv). tests/moved/whose-file.ts named two agent
  // handles in its code and README until 16 November 2026. An office that keeps tests/moved/operations.txt names the
  // commit authors that count as the operations agent here; the public tree names the role instead. Unset or empty,
  // the script counts those authors under their own names, says so on its own line, and exits 1.
  setting(
    'MOLE_OFFICE_OPERATIONS_LIST_KEEPERS',
    'list',
    SETTING_WORDS.MOLE_OFFICE_OPERATIONS_LIST_KEEPERS,
    null,
    {
      absentMeans:
        'nobody counts as the operations agent: tests/moved/whose-file.ts counts those authors under their own names, ' +
        'says so on its own line, and exits 1.',
      emptyMeans:
        'the same as not set: nobody counts as the operations agent, the script counts those authors under their own ' +
        'names, says so, and exits 1.',
      notInTemplateBecause:
        'it configures a maintenance script of this repository, not the server, and the names are one office\'s own; ' +
        'a host names them in its own environment or settings file.',
    },
  ),
  setting(
    'MOLE_OFFICE_MODAL_TOKEN_FILE',
    'path',
    shippedSettingDescription('MOLE_OFFICE_MODAL_TOKEN_FILE'),
    null,
    { absentMeans: `the VM test runner uses ~/${MODAL_FOLDER}/token.toml, a regular file owned by this user with mode 0600` },
  ),
  setting(
    'MOLE_OFFICE_MODAL_PYTHON',
    'path',
    shippedSettingDescription('MOLE_OFFICE_MODAL_PYTHON'),
    null,
    { absentMeans: `the VM test runner uses ~/${MODAL_FOLDER}/venv/bin/python; its token file must be 0600` },
  ),
  // THE SECOND OPINION'S BUDGET: tools/merge-tool/second-opinion.mjs reads it before each run.
  setting(
    'MOLE_OFFICE_MODAL_MONTHLY_CAP_USD',
    'word',
    shippedSettingDescription('MOLE_OFFICE_MODAL_MONTHLY_CAP_USD'),
    String(MODAL_MONTHLY_CAP_USD),
  ),
  // THE OPENROUTER TOOL'S OWN CAP. A tool checks the resource's limit before each use.
  // tools/openrouter.mjs reads it before each call. The owner has named no number, so its default is no cap of our own.
  setting(
    'MOLE_OFFICE_OPENROUTER_MONTHLY_CAP_USD',
    'word',
    'The most, in US dollars, tools/openrouter.mjs may spend through OpenRouter in one calendar month, counted from its receipts on this machine. ' +
      "0, the default, means no cap of our own: the tool says so on each call, and still refuses a call the key's own limit at OpenRouter cannot cover. The owner has named no number.",
    '0',
  ),
  setting(
    'MOLE_OFFICE_START_MODE',
    'word',
    'How this server starts: ordinary serves the office; release-check serves only read-only health and runtime diagnostics on a closed, checkpointed database; release-check-live does the same on the live database while another version of the office serves it, for the release tool\'s one trial of a version that changes no migration.',
    'ordinary',
    { notInTemplateBecause: 'The release controller sets this for one candidate check. Keeping release-check in .env would prevent the ordinary office from being published.' },
  ),
  // THREE WORDS, NOT TWO, since 22 September 2026 (sandbox v1): `merges-only` starts the worker for the
  // office's merge tool alone, so the merge queue can run on an office whose queued messages must not
  // each start an agent run. `MESSAGE_WORKER_MODES` and `MERGES_ONLY_SAYS` below are its two facts.
  setting(
    'MOLE_OFFICE_MESSAGE_WORKER',
    'word',
    SETTING_WORDS.MOLE_OFFICE_MESSAGE_WORKER,
    'on',
  ),
  // THE TERMINAL HOLDER CAN BE LEFT UNSTARTED, since wave 13u (the office's own terminals). It outlives the
  // server by design, so a test that starts and stops a scratch office says off. `TERMINAL_HOLDER_MODES` below.
  setting(
    'MOLE_OFFICE_TERMINAL_HOLDER',
    'word',
    SETTING_WORDS.MOLE_OFFICE_TERMINAL_HOLDER,
    'on',
  ),
  // THE WINDOW REFUSES DEBUGGING SWITCHES unless this says on, since wave 13t's round 23. `WINDOW_DEBUGGING_MODES` below.
  setting(
    'MOLE_OFFICE_WINDOW_DEBUGGING',
    'word',
    SETTING_WORDS.MOLE_OFFICE_WINDOW_DEBUGGING,
    'off',
  ),
  // THE SERVER'S HEAP, in whole megabytes. tools/serve-dev.mjs gives the server it starts --max-old-space-size from it,
  // and a stable upgrade records it with the other service settings. NODE_OPTIONS is still dropped. The range is above.
  setting(
    'MOLE_OFFICE_SERVER_HEAP_MB',
    'word',
    shippedSettingDescription('MOLE_OFFICE_SERVER_HEAP_MB'),
    null,
    { absentMeans: "the server runs with Node's own default heap limit" },
  ),
  setting(FEW_FEATURE_REDS_GATE.setting, 'word', SETTING_WORDS[FEW_FEATURE_REDS_GATE.setting], gateDefaultHere(FEW_FEATURE_REDS_GATE)),
  setting(WIDE_RED_GATE.setting, 'word', SETTING_WORDS[WIDE_RED_GATE.setting], gateDefaultHere(WIDE_RED_GATE)),
  setting(FLAKY_TESTS_GATE.setting, 'word', SETTING_WORDS[FLAKY_TESTS_GATE.setting], gateDefaultHere(FLAKY_TESTS_GATE)),
  setting(PLACEHOLDER_ADDRESSES_GATE.setting, 'word', SETTING_WORDS[PLACEHOLDER_ADDRESSES_GATE.setting], gateDefaultHere(PLACEHOLDER_ADDRESSES_GATE)),
  setting('MOLE_OFFICE_FEW_RED_FILES', 'word', SETTING_WORDS.MOLE_OFFICE_FEW_RED_FILES, '3'),
  setting('MOLE_OFFICE_HAND_BACK_HOURS', 'word', SETTING_WORDS.MOLE_OFFICE_HAND_BACK_HOURS, '24'),
  setting(HOUSE_RULE_REDS_GATE.setting, 'word', SETTING_WORDS[HOUSE_RULE_REDS_GATE.setting], gateDefaultHere(HOUSE_RULE_REDS_GATE)),
  setting(
    FILE_TERRITORIES_GATE.setting,
    'word',
    SETTING_WORDS[FILE_TERRITORIES_GATE.setting],
    gateDefaultHere(FILE_TERRITORIES_GATE),
  ),
  setting(gateNamed('before-the-seal').setting, 'word', SETTING_WORDS.MOLE_OFFICE_GATE_BEFORE_THE_SEAL, gateDefaultHere(gateNamed('before-the-seal'))),
  setting(gateNamed('reviewed-design-before-method-work').setting, 'word', SETTING_WORDS.MOLE_OFFICE_GATE_REVIEWED_DESIGN, gateDefaultHere(gateNamed('reviewed-design-before-method-work'))),
  setting(gateNamed('retire-while-owed').setting, 'word', SETTING_WORDS.MOLE_OFFICE_GATE_RETIRE_WHILE_OWED, gateDefaultHere(gateNamed('retire-while-owed'))),
  // The release tool reads this from the office's gate list, not from here, and keeps its own default for an older office.
  setting(gateNamed('release-spacing').setting, 'word', shippedSettingDescription(gateNamed('release-spacing').setting), gateDefaultHere(gateNamed('release-spacing'))),
  // The release tool reads this from the office's gate list, with the change that threw it, and never from here.
  setting(gateNamed('stable-emergency').setting, 'flag', SETTING_WORDS.MOLE_OFFICE_STABLE_EMERGENCY, gateDefaultHere(gateNamed('stable-emergency'))),
  // Four numbers that were written in the code until round E. Each default is the number the code used.
  setting(gateNamed('counter-spacing').setting, 'word', shippedSettingDescription(gateNamed('counter-spacing').setting), gateDefaultHere(gateNamed('counter-spacing'))),
  // How long a run goes in one step before the office reminds it of its role and its current step: src/server/lib/step-reminders.ts.
  setting(gateNamed('step-reminder-tokens').setting, 'word', shippedSettingDescription(gateNamed('step-reminder-tokens').setting), gateDefaultHere(gateNamed('step-reminder-tokens'))),
  setting(gateNamed('step-reminder-minutes').setting, 'word', shippedSettingDescription(gateNamed('step-reminder-minutes').setting), gateDefaultHere(gateNamed('step-reminder-minutes'))),
  setting(gateNamed('conflict-minutes').setting, 'word', shippedSettingDescription(gateNamed('conflict-minutes').setting), gateDefaultHere(gateNamed('conflict-minutes'))),
  setting(gateNamed('landing-attempts').setting, 'word', shippedSettingDescription(gateNamed('landing-attempts').setting), gateDefaultHere(gateNamed('landing-attempts'))),
  setting(gateNamed('tool-runs-in-one-place').setting, 'word', shippedSettingDescription(gateNamed('tool-runs-in-one-place').setting), gateDefaultHere(gateNamed('tool-runs-in-one-place'))),
  setting(gateNamed('worker-runs').setting, 'word', SETTING_WORDS.MOLE_OFFICE_WORKER_RUNS, gateDefaultHere(gateNamed('worker-runs'))),
  setting(gateNamed('agent-hops').setting, 'word', SETTING_WORDS.MOLE_OFFICE_AGENT_HOPS, gateDefaultHere(gateNamed('agent-hops'))),
  setting(gateNamed('run-messages').setting, 'word', SETTING_WORDS.MOLE_OFFICE_RUN_MESSAGES, gateDefaultHere(gateNamed('run-messages'))),
  setting(gateNamed('standard-one-plugin').setting, 'flag', SETTING_WORDS.MOLE_OFFICE_STANDARD_ONE_PLUGIN, gateDefaultHere(gateNamed('standard-one-plugin'))),
  setting(gateNamed('standard-words').setting, 'flag', SETTING_WORDS.MOLE_OFFICE_STANDARD_WORDS, gateDefaultHere(gateNamed('standard-words'))),
  setting(gateNamed('standard-tests').setting, 'flag', SETTING_WORDS.MOLE_OFFICE_STANDARD_TESTS, gateDefaultHere(gateNamed('standard-tests'))),
  setting(gateNamed('standard-documents').setting, 'flag', SETTING_WORDS.MOLE_OFFICE_STANDARD_DOCUMENTS, gateDefaultHere(gateNamed('standard-documents'))),
  setting(gateNamed('who-writes-a-runs-conditions').setting, 'word', SETTING_WORDS.MOLE_OFFICE_GATE_WHO_WRITES_A_RUNS_CONDITIONS, gateDefaultHere(gateNamed('who-writes-a-runs-conditions'))),
  setting(gateNamed('who-ends-a-run').setting, 'word', SETTING_WORDS.MOLE_OFFICE_GATE_WHO_ENDS_A_RUN, gateDefaultHere(gateNamed('who-ends-a-run'))),
  setting(gateNamed('who-names-a-runs-parent').setting, 'word', SETTING_WORDS.MOLE_OFFICE_GATE_WHO_NAMES_A_RUNS_PARENT, gateDefaultHere(gateNamed('who-names-a-runs-parent'))),
  setting(gateNamed('who-files-a-session').setting, 'word', SETTING_WORDS.MOLE_OFFICE_GATE_WHO_FILES_A_SESSION, gateDefaultHere(gateNamed('who-files-a-session'))),
  setting(gateNamed('who-reads-a-handover').setting, 'word', SETTING_WORDS.MOLE_OFFICE_GATE_WHO_READS_A_HANDOVER, gateDefaultHere(gateNamed('who-reads-a-handover'))),
  setting(gateNamed('who-resumes-a-run').setting, 'word', SETTING_WORDS.MOLE_OFFICE_GATE_WHO_RESUMES_A_RUN, gateDefaultHere(gateNamed('who-resumes-a-run'))),
  setting(gateNamed('who-changes-a-message').setting, 'word', SETTING_WORDS.MOLE_OFFICE_GATE_WHO_CHANGES_A_MESSAGE, gateDefaultHere(gateNamed('who-changes-a-message'))),
  setting(gateNamed('who-deletes-a-message').setting, 'word', SETTING_WORDS.MOLE_OFFICE_GATE_WHO_DELETES_A_MESSAGE, gateDefaultHere(gateNamed('who-deletes-a-message'))),
  setting(gateNamed('who-changes-a-flows-item').setting, 'word', SETTING_WORDS.MOLE_OFFICE_GATE_WHO_CHANGES_A_FLOWS_ITEM, gateDefaultHere(gateNamed('who-changes-a-flows-item'))),
  setting(gateNamed('who-makes-a-checklist-for-the-person').setting, 'word', SETTING_WORDS.MOLE_OFFICE_GATE_WHO_MAKES_A_CHECKLIST_FOR_THE_PERSON, gateDefaultHere(gateNamed('who-makes-a-checklist-for-the-person'))),
  setting(gateNamed('who-acts-on-a-review').setting, 'word', SETTING_WORDS.MOLE_OFFICE_GATE_WHO_ACTS_ON_A_REVIEW, gateDefaultHere(gateNamed('who-acts-on-a-review'))),
  setting(gateNamed('who-sends-a-draft').setting, 'word', SETTING_WORDS.MOLE_OFFICE_GATE_WHO_SENDS_A_DRAFT, gateDefaultHere(gateNamed('who-sends-a-draft'))),
  setting(gateNamed('who-files-or-closes-an-incident').setting, 'word', SETTING_WORDS.MOLE_OFFICE_GATE_WHO_FILES_OR_CLOSES_AN_INCIDENT, gateDefaultHere(gateNamed('who-files-or-closes-an-incident'))),
  setting(gateNamed('who-holds-a-notebook').setting, 'word', SETTING_WORDS.MOLE_OFFICE_GATE_WHO_HOLDS_A_NOTEBOOK, gateDefaultHere(gateNamed('who-holds-a-notebook'))),
  setting(gateNamed('who-sweeps-the-ledger').setting, 'word', SETTING_WORDS.MOLE_OFFICE_GATE_WHO_SWEEPS_THE_LEDGER, gateDefaultHere(gateNamed('who-sweeps-the-ledger'))),
  setting(gateNamed('who-changes-a-booking').setting, 'word', SETTING_WORDS.MOLE_OFFICE_GATE_WHO_CHANGES_A_BOOKING, gateDefaultHere(gateNamed('who-changes-a-booking'))),
  setting(gateNamed('who-asks-and-answers-to-go-first').setting, 'word', SETTING_WORDS.MOLE_OFFICE_GATE_WHO_ASKS_AND_ANSWERS_TO_GO_FIRST, gateDefaultHere(gateNamed('who-asks-and-answers-to-go-first'))),
  setting(gateNamed('who-reports-on-the-gpu').setting, 'word', SETTING_WORDS.MOLE_OFFICE_GATE_WHO_REPORTS_ON_THE_GPU, gateDefaultHere(gateNamed('who-reports-on-the-gpu'))),
  setting(gateNamed('wait-for-the-persons-start').setting, 'word', SETTING_WORDS.MOLE_OFFICE_GATE_WAIT_FOR_THE_PERSONS_START, gateDefaultHere(gateNamed('wait-for-the-persons-start'))),
  setting(gateNamed('held-by-an-unsent-review').setting, 'word', SETTING_WORDS.MOLE_OFFICE_GATE_HELD_BY_AN_UNSENT_REVIEW, gateDefaultHere(gateNamed('held-by-an-unsent-review'))),
  setting(gateNamed('held-while-a-resident-sleeps').setting, 'word', SETTING_WORDS.MOLE_OFFICE_GATE_HELD_WHILE_A_RESIDENT_SLEEPS, gateDefaultHere(gateNamed('held-while-a-resident-sleeps'))),
  setting(gateNamed('held-by-a-notice-rule').setting, 'word', SETTING_WORDS.MOLE_OFFICE_GATE_HELD_BY_A_NOTICE_RULE, gateDefaultHere(gateNamed('held-by-a-notice-rule'))),
  setting(gateNamed('who-releases-a-held-check').setting, 'word', SETTING_WORDS.MOLE_OFFICE_GATE_WHO_RELEASES_A_HELD_CHECK, gateDefaultHere(gateNamed('who-releases-a-held-check'))),
  setting(gateNamed('who-asks-for-a-check-again').setting, 'word', SETTING_WORDS.MOLE_OFFICE_GATE_WHO_ASKS_FOR_A_CHECK_AGAIN, gateDefaultHere(gateNamed('who-asks-for-a-check-again'))),
  setting(gateNamed('who-confirms-a-report').setting, 'word', SETTING_WORDS.MOLE_OFFICE_GATE_WHO_CONFIRMS_A_REPORT, gateDefaultHere(gateNamed('who-confirms-a-report'))),
  setting(gateNamed('who-closes-a-run-as-superseded').setting, 'word', SETTING_WORDS.MOLE_OFFICE_GATE_WHO_CLOSES_A_RUN_AS_SUPERSEDED, gateDefaultHere(gateNamed('who-closes-a-run-as-superseded'))),
  setting(gateNamed('who-reads-a-settlement').setting, 'word', SETTING_WORDS.MOLE_OFFICE_GATE_WHO_READS_A_SETTLEMENT, gateDefaultHere(gateNamed('who-reads-a-settlement'))),
  setting(gateNamed('who-names-the-merge-queue-owner').setting, 'word', SETTING_WORDS.MOLE_OFFICE_GATE_WHO_NAMES_THE_MERGE_QUEUE_OWNER, gateDefaultHere(gateNamed('who-names-the-merge-queue-owner'))),
  setting(gateNamed('who-pauses-the-office').setting, 'word', SETTING_WORDS.MOLE_OFFICE_GATE_WHO_PAUSES_THE_OFFICE, gateDefaultHere(gateNamed('who-pauses-the-office'))),
  setting(gateNamed('who-changes-the-page-words-and-sidebar').setting, 'word', SETTING_WORDS.MOLE_OFFICE_GATE_WHO_CHANGES_THE_PAGE_WORDS_AND_SIDEBAR, gateDefaultHere(gateNamed('who-changes-the-page-words-and-sidebar'))),
  setting(gateNamed('who-names-the-dead-letter-secretary').setting, 'word', SETTING_WORDS.MOLE_OFFICE_GATE_WHO_NAMES_THE_DEAD_LETTER_SECRETARY, gateDefaultHere(gateNamed('who-names-the-dead-letter-secretary'))),
  setting(gateNamed('who-names-the-module-reminder-secretary').setting, 'word', SETTING_WORDS.MOLE_OFFICE_GATE_WHO_NAMES_THE_MODULE_REMINDER_SECRETARY, gateDefaultHere(gateNamed('who-names-the-module-reminder-secretary'))),
  setting(gateNamed('who-changes-the-merge-and-check-switches').setting, 'word', SETTING_WORDS.MOLE_OFFICE_GATE_WHO_CHANGES_THE_MERGE_AND_CHECK_SWITCHES, gateDefaultHere(gateNamed('who-changes-the-merge-and-check-switches'))),
  setting(gateNamed('who-changes-the-casting-table').setting, 'word', SETTING_WORDS.MOLE_OFFICE_GATE_WHO_CHANGES_THE_CASTING_TABLE, gateDefaultHere(gateNamed('who-changes-the-casting-table'))),
  setting(gateNamed('who-names-the-gpu-watcher').setting, 'word', SETTING_WORDS.MOLE_OFFICE_GATE_WHO_NAMES_THE_GPU_WATCHER, gateDefaultHere(gateNamed('who-names-the-gpu-watcher'))),
  setting(gateNamed('who-changes-the-owners-settings').setting, 'word', SETTING_WORDS.MOLE_OFFICE_GATE_WHO_CHANGES_THE_OWNERS_SETTINGS, gateDefaultHere(gateNamed('who-changes-the-owners-settings'))),
  setting(gateNamed('who-switches-whether-agents-may-inject').setting, 'word', SETTING_WORDS.MOLE_OFFICE_GATE_WHO_SWITCHES_WHETHER_AGENTS_MAY_INJECT, gateDefaultHere(gateNamed('who-switches-whether-agents-may-inject'))),
  setting(gateNamed('who-changes-the-quick-input-list').setting, 'word', SETTING_WORDS.MOLE_OFFICE_GATE_WHO_CHANGES_THE_QUICK_INPUT_LIST, gateDefaultHere(gateNamed('who-changes-the-quick-input-list'))),
  setting(gateNamed('who-chooses-the-address-for-browsers').setting, 'word', SETTING_WORDS.MOLE_OFFICE_GATE_WHO_CHOOSES_THE_ADDRESS_FOR_BROWSERS, gateDefaultHere(gateNamed('who-chooses-the-address-for-browsers'))),
  setting(gateNamed('who-ends-another-agents-raise').setting, 'word', SETTING_WORDS.MOLE_OFFICE_GATE_WHO_ENDS_ANOTHER_AGENTS_RAISE, gateDefaultHere(gateNamed('who-ends-another-agents-raise'))),
  setting(gateNamed('who-retires-an-agent').setting, 'word', SETTING_WORDS.MOLE_OFFICE_GATE_WHO_RETIRES_AN_AGENT, gateDefaultHere(gateNamed('who-retires-an-agent'))),
  setting(gateNamed('who-says-whether-another-agent-reads-releases').setting, 'word', SETTING_WORDS.MOLE_OFFICE_GATE_WHO_SAYS_WHETHER_ANOTHER_AGENT_READS_RELEASES, gateDefaultHere(gateNamed('who-says-whether-another-agent-reads-releases'))),
  setting(gateNamed('who-sets-how-another-agent-is-addressed').setting, 'word', SETTING_WORDS.MOLE_OFFICE_GATE_WHO_SETS_HOW_ANOTHER_AGENT_IS_ADDRESSED, gateDefaultHere(gateNamed('who-sets-how-another-agent-is-addressed'))),
  setting(gateNamed('who-names-a-modules-planner').setting, 'word', SETTING_WORDS.MOLE_OFFICE_GATE_WHO_NAMES_A_MODULES_PLANNER, gateDefaultHere(gateNamed('who-names-a-modules-planner'))),
  setting(gateNamed('who-removes-an-ask-on-the-person').setting, 'word', SETTING_WORDS.MOLE_OFFICE_GATE_WHO_REMOVES_AN_ASK_ON_THE_PERSON, gateDefaultHere(gateNamed('who-removes-an-ask-on-the-person'))),
  setting(gateNamed('who-retires-a-row-the-person-stated').setting, 'word', SETTING_WORDS.MOLE_OFFICE_GATE_WHO_RETIRES_A_ROW_THE_PERSON_STATED, gateDefaultHere(gateNamed('who-retires-a-row-the-person-stated'))),
  setting(gateNamed('who-repoints-a-scanned-repository').setting, 'word', SETTING_WORDS.MOLE_OFFICE_GATE_WHO_REPOINTS_A_SCANNED_REPOSITORY, gateDefaultHere(gateNamed('who-repoints-a-scanned-repository'))),
  setting(gateNamed('who-confirms-a-packaged-task-finished').setting, 'word', SETTING_WORDS.MOLE_OFFICE_GATE_WHO_CONFIRMS_A_PACKAGED_TASK_FINISHED, gateDefaultHere(gateNamed('who-confirms-a-packaged-task-finished'))),
  setting(gateNamed('who-arranges-the-module-graph').setting, 'word', SETTING_WORDS.MOLE_OFFICE_GATE_WHO_ARRANGES_THE_MODULE_GRAPH, gateDefaultHere(gateNamed('who-arranges-the-module-graph'))),
  setting(gateNamed('who-switches-a-checklist-reminder').setting, 'word', SETTING_WORDS.MOLE_OFFICE_GATE_WHO_SWITCHES_A_CHECKLIST_REMINDER, gateDefaultHere(gateNamed('who-switches-a-checklist-reminder'))),
  setting(gateNamed('held-for-readiness-signatures').setting, 'word', SETTING_WORDS.MOLE_OFFICE_GATE_HELD_FOR_READINESS_SIGNATURES, gateDefaultHere(gateNamed('held-for-readiness-signatures'))),
  setting(gateNamed('who-changes-a-cards-words').setting, 'word', SETTING_WORDS.MOLE_OFFICE_GATE_WHO_CHANGES_A_CARDS_WORDS, gateDefaultHere(gateNamed('who-changes-a-cards-words'))),
  setting(gateNamed('who-refuses-a-role-request').setting, 'word', SETTING_WORDS.MOLE_OFFICE_GATE_WHO_REFUSES_A_ROLE_REQUEST, gateDefaultHere(gateNamed('who-refuses-a-role-request'))),
  setting(gateNamed('who-submits-a-merge-entry').setting, 'word', SETTING_WORDS.MOLE_OFFICE_GATE_WHO_SUBMITS_A_MERGE_ENTRY, gateDefaultHere(gateNamed('who-submits-a-merge-entry'))),
  setting(gateNamed('who-withdraws-a-merge-entry').setting, 'word', SETTING_WORDS.MOLE_OFFICE_GATE_WHO_WITHDRAWS_A_MERGE_ENTRY, gateDefaultHere(gateNamed('who-withdraws-a-merge-entry'))),
  setting(gateNamed('giving-back-a-held-seat').setting, 'word', SETTING_WORDS.MOLE_OFFICE_GATE_GIVING_BACK_A_HELD_SEAT, gateDefaultHere(gateNamed('giving-back-a-held-seat'))),
  setting(gateNamed('writes-that-empty-fields').setting, 'word', SETTING_WORDS.MOLE_OFFICE_GATE_WRITES_THAT_EMPTY_FIELDS, gateDefaultHere(gateNamed('writes-that-empty-fields'))),
  setting(gateNamed('writes-from-a-stale-copy').setting, 'word', SETTING_WORDS.MOLE_OFFICE_GATE_WRITES_FROM_A_STALE_COPY, gateDefaultHere(gateNamed('writes-from-a-stale-copy'))),
  setting(gateNamed('writes-over-unseen-checklist-lines').setting, 'word', SETTING_WORDS.MOLE_OFFICE_GATE_WRITES_OVER_UNSEEN_CHECKLIST_LINES, gateDefaultHere(gateNamed('writes-over-unseen-checklist-lines'))),
  setting(gateNamed('worker-cuts-the-sandbox-cannot-use').setting, 'word', SETTING_WORDS.MOLE_OFFICE_GATE_WORKER_CUTS, gateDefaultHere(gateNamed('worker-cuts-the-sandbox-cannot-use'))),
  setting(gateNamed('every-setting-value-is-known').setting, 'word', SETTING_WORDS.MOLE_OFFICE_GATE_EVERY_SETTING_VALUE_IS_KNOWN, gateDefaultHere(gateNamed('every-setting-value-is-known'))),
  setting(gateNamed('a-dsh-checks-transcript-is-its-own').setting, 'word', SETTING_WORDS.MOLE_OFFICE_GATE_A_DSH_CHECKS_TRANSCRIPT_IS_ITS_OWN, gateDefaultHere(gateNamed('a-dsh-checks-transcript-is-its-own'))),
  setting(gateNamed('old-setting-names-stop-the-office').setting, 'word', SETTING_WORDS.MOLE_OFFICE_GATE_OLD_SETTING_NAMES_STOP_THE_OFFICE, gateDefaultHere(gateNamed('old-setting-names-stop-the-office'))),
  setting(gateNamed('an-act-at-a-keyed-door-needs-a-key').setting, 'word', SETTING_WORDS.MOLE_OFFICE_GATE_AN_ACT_AT_AN_ASKING_DOOR_IS_PROVED, gateDefaultHere(gateNamed('an-act-at-a-keyed-door-needs-a-key'))),
  setting(gateNamed('a-test-world-trusts-only-its-own-keys').setting, 'word', SETTING_WORDS.MOLE_OFFICE_GATE_A_TEST_WORLD_TRUSTS_ONLY_ITS_STARTER_AND_SECRETARIES, gateDefaultHere(gateNamed('a-test-world-trusts-only-its-own-keys'))),
  setting(gateNamed('the-role-cards-file-is-usable').setting, 'word', SETTING_WORDS.MOLE_OFFICE_GATE_THE_ROLE_CARDS_FILE_IS_USABLE, gateDefaultHere(gateNamed('the-role-cards-file-is-usable'))),
  setting(gateNamed('a-models-login-outlasts-the-check').setting, 'word', SETTING_WORDS.MOLE_OFFICE_GATE_A_MODELS_LOGIN_OUTLASTS_THE_CHECK, gateDefaultHere(gateNamed('a-models-login-outlasts-the-check'))),
  setting(gateNamed('a-check-reads-its-own-worktree').setting, 'word', SETTING_WORDS.MOLE_OFFICE_GATE_A_CHECK_READS_ITS_OWN_WORKTREE, gateDefaultHere(gateNamed('a-check-reads-its-own-worktree'))),
  setting(gateNamed('profiles-in-use-are-never-written').setting, 'word', SETTING_WORDS.MOLE_OFFICE_GATE_PROFILES_IN_USE_ARE_NEVER_WRITTEN, gateDefaultHere(gateNamed('profiles-in-use-are-never-written'))),
  setting(gateNamed('a-start-refusal-stops-the-retries').setting, 'word', SETTING_WORDS.MOLE_OFFICE_GATE_A_START_REFUSAL_STOPS_THE_RETRIES, gateDefaultHere(gateNamed('a-start-refusal-stops-the-retries'))),
  setting(gateNamed('the-office-starts-once').setting, 'word', SETTING_WORDS.MOLE_OFFICE_GATE_THE_OFFICE_STARTS_ONCE, gateDefaultHere(gateNamed('the-office-starts-once'))),
  setting(gateNamed('the-office-vouches-for-a-runs-sandbox').setting, 'word', SETTING_WORDS.MOLE_OFFICE_GATE_THE_OFFICE_VOUCHES_FOR_A_RUNS_SANDBOX, gateDefaultHere(gateNamed('the-office-vouches-for-a-runs-sandbox'))),
  setting(gateNamed('a-raise-has-a-reason-and-goes-up').setting, 'word', SETTING_WORDS.MOLE_OFFICE_GATE_A_RAISE_HAS_A_REASON_AND_GOES_UP, gateDefaultHere(gateNamed('a-raise-has-a-reason-and-goes-up'))),
  setting(gateNamed('a-codex-command-is-checked').setting, 'word', SETTING_WORDS.MOLE_OFFICE_GATE_A_CODEX_COMMAND_IS_CHECKED, gateDefaultHere(gateNamed('a-codex-command-is-checked'))),
  setting(gateNamed('other-gpu-sandboxes-reminder').setting, 'word', SETTING_WORDS.MOLE_OFFICE_GATE_OTHER_GPU_SANDBOXES_REMINDER, gateDefaultHere(gateNamed('other-gpu-sandboxes-reminder'))),
  setting(gateNamed('main-refreshed-only-from-its-own-checkout').setting, 'word', SETTING_WORDS.MOLE_OFFICE_GATE_MAIN_REFRESHED_ONLY_FROM_ITS_OWN_CHECKOUT, gateDefaultHere(gateNamed('main-refreshed-only-from-its-own-checkout'))),
  setting(gateNamed('sandbox-folder-size-warning').setting, 'word', SETTING_WORDS.MOLE_OFFICE_GATE_SANDBOX_FOLDER_SIZE_WARNING, gateDefaultHere(gateNamed('sandbox-folder-size-warning'))),
  setting(gateNamed('the-hosts-run-list-is-sound').setting, 'word', SETTING_WORDS.MOLE_OFFICE_GATE_THE_HOSTS_RUN_LIST_IS_SOUND, gateDefaultHere(gateNamed('the-hosts-run-list-is-sound'))),
  setting(gateNamed('a-round-continues-only-this-agents-run').setting, 'word', SETTING_WORDS.MOLE_OFFICE_GATE_A_ROUND_CONTINUES_ONLY_THIS_AGENTS_RUN, gateDefaultHere(gateNamed('a-round-continues-only-this-agents-run'))),
  setting(gateNamed('a-rounds-run-was-filed-here').setting, 'word', SETTING_WORDS.MOLE_OFFICE_GATE_A_ROUNDS_RUN_WAS_FILED_HERE, gateDefaultHere(gateNamed('a-rounds-run-was-filed-here'))),
  setting(gateNamed('a-round-reads-only-its-runs-output').setting, 'word', SETTING_WORDS.MOLE_OFFICE_GATE_A_ROUND_READS_ONLY_ITS_RUNS_OUTPUT, gateDefaultHere(gateNamed('a-round-reads-only-its-runs-output'))),
  setting(gateNamed('codex-resumes-only-this-sandboxs-thread').setting, 'word', SETTING_WORDS.MOLE_OFFICE_GATE_CODEX_RESUMES_ONLY_THIS_SANDBOXS_THREAD, gateDefaultHere(gateNamed('codex-resumes-only-this-sandboxs-thread'))),
  setting(gateNamed('opencode-resumes-only-this-sandboxs-session').setting, 'word', SETTING_WORDS.MOLE_OFFICE_GATE_OPENCODE_RESUMES_ONLY_THIS_SANDBOXS_SESSION, gateDefaultHere(gateNamed('opencode-resumes-only-this-sandboxs-session'))),
  setting(gateNamed('a-handshake-only-for-own-commands').setting, 'word', SETTING_WORDS.MOLE_OFFICE_GATE_A_HANDSHAKE_ONLY_FOR_OWN_COMMANDS, gateDefaultHere(gateNamed('a-handshake-only-for-own-commands'))),
  setting(gateNamed('a-run-is-filed-in-one-sandbox').setting, 'word', SETTING_WORDS.MOLE_OFFICE_GATE_A_RUN_IS_FILED_IN_ONE_SANDBOX, gateDefaultHere(gateNamed('a-run-is-filed-in-one-sandbox'))),
  setting(gateNamed('launch-logs-stay-in-the-sandbox').setting, 'word', SETTING_WORDS.MOLE_OFFICE_GATE_LAUNCH_LOGS_STAY_IN_THE_SANDBOX, gateDefaultHere(gateNamed('launch-logs-stay-in-the-sandbox'))),
  setting(gateNamed('plain-env-strips-the-launchers-variables').setting, 'word', SETTING_WORDS.MOLE_OFFICE_GATE_PLAIN_ENV_STRIPS_THE_LAUNCHERS_VARIABLES, gateDefaultHere(gateNamed('plain-env-strips-the-launchers-variables'))),
  setting(gateNamed('a-refused-message-is-said-another-way').setting, 'word', SETTING_WORDS.MOLE_OFFICE_GATE_A_REFUSED_MESSAGE_IS_SAID_ANOTHER_WAY, gateDefaultHere(gateNamed('a-refused-message-is-said-another-way'))),
  setting(gateNamed('a-world-copy-is-a-sound-database').setting, 'word', SETTING_WORDS.MOLE_OFFICE_GATE_A_WORLD_COPY_IS_A_SOUND_DATABASE, gateDefaultHere(gateNamed('a-world-copy-is-a-sound-database'))),
  setting(gateNamed('integrated-tree-builds').setting, 'word', SETTING_WORDS.MOLE_OFFICE_GATE_INTEGRATED_BUILD, gateDefaultHere(gateNamed('integrated-tree-builds'))),
  setting(gateNamed('owner-content-in-what-ships').setting, 'word', SETTING_WORDS.MOLE_OFFICE_GATE_OWNER_CONTENT, gateDefaultHere(gateNamed('owner-content-in-what-ships'))),
  setting(gateNamed('the-seal-matches-the-entry').setting, 'word', SETTING_WORDS.MOLE_OFFICE_GATE_THE_SEAL_MATCHES_THE_ENTRY, gateDefaultHere(gateNamed('the-seal-matches-the-entry'))),
  setting(gateNamed('pinned-content-is-the-submission').setting, 'word', SETTING_WORDS.MOLE_OFFICE_GATE_PINNED_CONTENT_IS_THE_SUBMISSION, gateDefaultHere(gateNamed('pinned-content-is-the-submission'))),
  setting(gateNamed('files-entry-bytes-are-sealed').setting, 'word', SETTING_WORDS.MOLE_OFFICE_GATE_FILES_ENTRY_BYTES_ARE_SEALED, gateDefaultHere(gateNamed('files-entry-bytes-are-sealed'))),
  setting(gateNamed('files-entry-matches-its-files-seal').setting, 'word', SETTING_WORDS.MOLE_OFFICE_GATE_FILES_ENTRY_MATCHES_ITS_FILES_SEAL, gateDefaultHere(gateNamed('files-entry-matches-its-files-seal'))),
  setting(gateNamed('landing-only-on-the-tested-main').setting, 'word', SETTING_WORDS.MOLE_OFFICE_GATE_LANDING_ONLY_ON_THE_TESTED_MAIN, gateDefaultHere(gateNamed('landing-only-on-the-tested-main'))),
  setting(gateNamed('only-what-was-tested-lands').setting, 'word', SETTING_WORDS.MOLE_OFFICE_GATE_ONLY_WHAT_WAS_TESTED_LANDS, gateDefaultHere(gateNamed('only-what-was-tested-lands'))),
  setting(gateNamed('pinned-commit-is-what-was-sealed').setting, 'word', SETTING_WORDS.MOLE_OFFICE_GATE_PINNED_COMMIT_IS_WHAT_WAS_SEALED, gateDefaultHere(gateNamed('pinned-commit-is-what-was-sealed'))),
  setting(gateNamed('resolution-replayed-from-its-own-ref').setting, 'word', SETTING_WORDS.MOLE_OFFICE_GATE_RESOLUTION_REPLAYED_FROM_ITS_OWN_REF, gateDefaultHere(gateNamed('resolution-replayed-from-its-own-ref'))),
  setting(gateNamed('tested-clone-is-the-integrated-result').setting, 'word', SETTING_WORDS.MOLE_OFFICE_GATE_TESTED_CLONE_IS_THE_INTEGRATED_RESULT, gateDefaultHere(gateNamed('tested-clone-is-the-integrated-result'))),
  setting(gateNamed('withdrawn-entry-tool-stops').setting, 'word', SETTING_WORDS.MOLE_OFFICE_GATE_WITHDRAWN_ENTRY_TOOL_STOPS, gateDefaultHere(gateNamed('withdrawn-entry-tool-stops'))),
  setting(gateNamed('plugin-pages-built-before-landing').setting, 'word', SETTING_WORDS.MOLE_OFFICE_GATE_PLUGIN_PAGES_BUILT_BEFORE_LANDING, gateDefaultHere(gateNamed('plugin-pages-built-before-landing'))),
  setting(gateNamed('office-healthy-after-landing').setting, 'word', SETTING_WORDS.MOLE_OFFICE_GATE_OFFICE_HEALTHY_AFTER_LANDING, gateDefaultHere(gateNamed('office-healthy-after-landing'))),
  setting(
    'MOLE_OFFICE_RUN_WAITS_MINUTES',
    'word',
    SETTING_WORDS.MOLE_OFFICE_RUN_WAITS_MINUTES,
    '10',
  ),
  // HOW MANY CLAUDE SUPERVISOR RUNS GO AT ONCE (13r round AX). theRoundsToStart in src/server/lib/next-round.ts reads it.
  setting(
    'MOLE_OFFICE_CLAUDE_SUPERVISORS_AT_ONCE',
    'word',
    SETTING_WORDS.MOLE_OFFICE_CLAUDE_SUPERVISORS_AT_ONCE,
    '6',
  ),
  // WHEN A CLAUDE CODE SESSION THE OFFICE STARTS COMPACTS, in tokens: on this computer, and in a sandbox. The rule
  // in wave 13q round 58 is that early compaction ships as a default anyone can change. These defaults are the only place the
  // two numbers are written. src/config/the-compaction-window.mjs reads both at every start.
  setting(
    'MOLE_OFFICE_CLAUDE_COMPACTS_AT_ON_THE_HOST',
    'word',
    SETTING_WORDS.MOLE_OFFICE_CLAUDE_COMPACTS_AT_ON_THE_HOST,
    '500000',
  ),
  setting(
    'MOLE_OFFICE_CLAUDE_COMPACTS_AT_IN_A_SANDBOX',
    'word',
    SETTING_WORDS.MOLE_OFFICE_CLAUDE_COMPACTS_AT_IN_A_SANDBOX,
    '200000',
  ),
  setting(
    'MOLE_OFFICE_IDLE_REMINDER_HOURS',
    'word',
    SETTING_WORDS.MOLE_OFFICE_IDLE_REMINDER_HOURS,
    '1',
  ),
  /**
   * THE SECRETARY'S BROADCAST, from a decision of 16 September 2026. A secretary reports to the
   * person on a schedule of its own, and the office sends a short reminder before each slot. The default times are
   * 07:00 and 18:00: decision `neHefMNZkJDU` of 25 September 2026 ended the fixed 13:00 report, and an office that
   * wants it back sets this setting. The three numbers below are plain defaults, and an office may change any of them.
   * `readSetting` is the one reader, and `broadcastTimes`, `broadcastLeadMinutes` and `broadcastUnansweredLimit` in
   * src/server/lib/env.ts are the three typed readers over it.
   */
  setting(
    'MOLE_OFFICE_BROADCAST_TIMES',
    'word',
    SETTING_WORDS.MOLE_OFFICE_BROADCAST_TIMES,
    '07:00,18:00',
  ),
  setting(
    'MOLE_OFFICE_BROADCAST_LEAD_MINUTES',
    'word',
    SETTING_WORDS.MOLE_OFFICE_BROADCAST_LEAD_MINUTES,
    '30',
  ),
  setting(gateNamed('broadcast-pause').setting, 'word', SETTING_WORDS.MOLE_OFFICE_BROADCAST_UNANSWERED_LIMIT, gateDefaultHere(gateNamed('broadcast-pause'))),
  setting(
    'MOLE_OFFICE_BROADCAST_BACKUP_REMINDER',
    'word',
    SETTING_WORDS.MOLE_OFFICE_BROADCAST_BACKUP_REMINDER,
    null,
    {
      absentMeans: 'the last reminder of the day says only the slot, like the others',
      emptyMeans: 'the last reminder of the day says only the slot, like the others',
    },
  ),
  /**
   * THE SECRETARY'S REPORT TEMPLATE, from three decisions and part 3 of a secretary's report,
   * YcJRwBmhvppQ. Every broadcast reminder leads to this record
   * and says when to write the report. It is a setting and not an id in the code, because the template is a record of
   * one office and a fresh office does not hold it. `broadcastReportTemplate` in src/server/lib/env.ts reads it, and
   * src/server/lib/broadcast.ts uses it.
   */
  setting(
    'MOLE_OFFICE_BROADCAST_REPORT_TEMPLATE',
    'word',
    SETTING_WORDS.MOLE_OFFICE_BROADCAST_REPORT_TEMPLATE,
    null,
    {
      absentMeans:
        'the reminders say nothing about a template, and the office sends no second reminder when a report has not come.',
      emptyMeans: 'the same as not set: the reminders say nothing about a template.',
    },
  ),
  setting(
    'MOLE_OFFICE_BROADCAST_REPORT_LATE_MINUTES',
    'word',
    SETTING_WORDS.MOLE_OFFICE_BROADCAST_REPORT_LATE_MINUTES,
    '15',
  ),
  /**
   * WHO IS REMINDED ABOUT A PROJECT'S MODULES, decision aZGg6gerakM1 of 5 October 2026 (problem UBCrM0LoMCm3). The
   * record-duty check in src/server/lib/stale-records.ts reminds ONE secretary per project about the modules that have
   * not changed in 14 days. One, because the office has no field naming a project's secretary and one project has four
   * secretary-card holders: reminding all of them would send four lines a day saying one thing. A project with nobody
   * named here gets no module reminder, and the check says so once in the server's log. A notebook needs no setting: it
   * reminds the agent it belongs to. `moduleReminderSecretaries` in src/server/lib/env.ts reads this.
   *
   * THE SETTINGS PAGE COMES FIRST (wave 13p round 29). A secretary chosen for a project on the Settings page, panel
   * settings.modulereminders, is used instead of this line for that project; this line counts only for a project with
   * nothing set there. The page says which of the two is in force for each project, and says so when this line cannot
   * be read. The one reading is `theModuleReminderSecretaries` in src/server/lib/module-reminder-secretaries.ts.
   */
  setting(
    'MOLE_OFFICE_MODULE_REMINDER_SECRETARIES',
    'word',
    SETTING_WORDS.MOLE_OFFICE_MODULE_REMINDER_SECRETARIES,
    null,
    {
      absentMeans: 'no project gets a module reminder, and the check says so once for each project that has modules left unchanged',
      emptyMeans: 'the same as not set: no project gets a module reminder.',
    },
  ),
  // THE AGENT WHOSE WATCHER READS THE HOST GPU CARD, AS AN OVERRIDE. The GPU watcher is a setting kept in the office
  // (src/server/lib/gpu-watcher.ts), set on the Settings page. This line, when it names a handle, wins over it.
  setting(
    'MOLE_OFFICE_GPU_WATCHER',
    'word',
    SETTING_WORDS.MOLE_OFFICE_GPU_WATCHER,
    null,
    {
      absentMeans: 'the GPU watcher is the one set on the Settings page, or nobody when none is set there',
      emptyMeans: 'the same as not set: the GPU watcher is the one set on the Settings page.',
    },
  ),
  // WHETHER THE OWNER IS TOLD OF A GPU JOB WITH NO BOOKING THAT LEAVES A BOOKING NO ROOM, beside the booking's holder. Off
  // unless the owner turns it on: a person's preferences are settings, not code. src/server/lib/bookings.ts reads it.
  setting(
    'MOLE_OFFICE_TELL_THE_OWNER_OF_UNBOOKED_GPU_JOBS',
    'flag',
    SETTING_WORDS.MOLE_OFFICE_TELL_THE_OWNER_OF_UNBOOKED_GPU_JOBS,
    '0',
  ),
  setting(
    'MOLE_OFFICE_HANDLE_BEAT_SECONDS',
    'word',
    SETTING_WORDS.MOLE_OFFICE_HANDLE_BEAT_SECONDS,
    '20',
  ),
  setting(
    'MOLE_OFFICE_MAIN_WORLD_SUPERVISORS',
    'word',
    SETTING_WORDS.MOLE_OFFICE_MAIN_WORLD_SUPERVISORS,
    'x1',
  ),
  setting(
    'MOLE_OFFICE_MAIN_WORLD_WORKERS',
    'word',
    SETTING_WORDS.MOLE_OFFICE_MAIN_WORLD_WORKERS,
    'x2',
  ),
  setting(
    'MOLE_OFFICE_HANDLE_LAPSES_AFTER_SECONDS',
    'word',
    SETTING_WORDS.MOLE_OFFICE_HANDLE_LAPSES_AFTER_SECONDS,
    '90',
  ),
  setting(
    'MOLE_OFFICE_HANDLE_GRACE_SECONDS',
    'word',
    SETTING_WORDS.MOLE_OFFICE_HANDLE_GRACE_SECONDS,
    '120',
  ),
  setting(
    'MOLE_OFFICE_HANDLE_UNREAD_AFTER_SECONDS',
    'word',
    SETTING_WORDS.MOLE_OFFICE_HANDLE_UNREAD_AFTER_SECONDS,
    '600',
  ),
  // HOW LONG A PERSON'S MESSAGE HANDED TO AN AGENT'S LIVE SESSION MAY GO WITHOUT A REPLY before the office wakes the agent
  // once more for it (wave 13y round 11). `replyReminderMinutes` in
  // src/server/lib/env.ts reads it, and src/server/lib/reply-reminder.ts sends the one reminder.
  setting(
    'MOLE_OFFICE_REPLY_REMINDER_MINUTES',
    'word',
    SETTING_WORDS.MOLE_OFFICE_REPLY_REMINDER_MINUTES,
    '3',
  ),
  // HOW LONG A MESSAGE'S WRITER MAY STILL CHANGE ITS WORDS. One decision gave two minutes.
  // Another says who may change a message at all. `patchRecord` in lib/records.ts asks it.
  setting(
    'MOLE_OFFICE_MESSAGE_EDIT_WINDOW_SECONDS',
    'word',
    SETTING_WORDS.MOLE_OFFICE_MESSAGE_EDIT_WINDOW_SECONDS,
    '120',
  ),
  // yFiC5HsshiTi / d7rEyINY0ENK, 29n-Z9NnulJy: three minutes is "a few minutes"
  // for the run's own command to finish exiting before item 3 names anything still open.
  setting(
    'MOLE_OFFICE_ENDED_RUN_LOOK_AFTER_SECONDS',
    'word',
    SETTING_WORDS.MOLE_OFFICE_ENDED_RUN_LOOK_AFTER_SECONDS,
    '180',
  ),
  // Thirty seconds bounds the extra wait for a due look without scanning rows on every request.
  setting(
    'MOLE_OFFICE_ENDED_RUN_LOOK_EVERY_SECONDS',
    'word',
    SETTING_WORDS.MOLE_OFFICE_ENDED_RUN_LOOK_EVERY_SECONDS,
    '30',
  ),
  // Five minutes also catches processes that exit after the notice, without a person asking.
  setting(
    'MOLE_OFFICE_ENDED_RUN_SWEEP_EVERY_SECONDS',
    'word',
    SETTING_WORDS.MOLE_OFFICE_ENDED_RUN_SWEEP_EVERY_SECONDS,
    '300',
  ),
  // A MINUTE IS SOON ENOUGH FOR A MESSAGE THE PERSON PUT OFF, and costs one read a minute. A test that needs
  // the timer to look sets it to a second instead of waiting a minute (wave 13t round 29).
  // `startBringingMessagesBack` in src/server/lib/remind-me-later.ts reads it.
  setting(
    'MOLE_OFFICE_REMIND_ME_LATER_EVERY_SECONDS',
    'word',
    SETTING_WORDS.MOLE_OFFICE_REMIND_ME_LATER_EVERY_SECONDS,
    '60',
  ),
  // THE LIVE OFFICE LOOKS AT EVERYBODY'S PRESENCE ONCE A MINUTE, and that default is in src/shared/presence-clock.ts, so
  // none is written here. A test office sets a few seconds, so a test waits one short look for a presence change and not
  // a minute (wave 13n). `startTheClock` in src/server/api/events.ts reads it once, when the clock starts.
  setting(
    'MOLE_OFFICE_LOOK_AT_PRESENCE_AGAIN_EVERY_MS',
    'word',
    SETTING_WORDS.MOLE_OFFICE_LOOK_AT_PRESENCE_AGAIN_EVERY_MS,
    null,
    { absentMeans: 'the default in src/shared/presence-clock.ts (LOOK_AT_PRESENCE_AGAIN_EVERY_MS), which the live office keeps' },
  ),
  // THE LIVE OFFICE RUNS THE SLEEP CLOCK ONCE A MINUTE, and that default is in src/shared/sleep-clock.ts, so none is
  // written here. A test office sets a second, so a sleep whose minute opens is begun within a second (wave 13n), and
  // the asleep test waits two runs of that short clock and not up to a minute. `startTheSleepClock` in
  // src/server/index.ts reads it once, when the clock starts.
  setting(
    'MOLE_OFFICE_RUN_THE_SLEEP_CLOCK_EVERY_MS',
    'word',
    SETTING_WORDS.MOLE_OFFICE_RUN_THE_SLEEP_CLOCK_EVERY_MS,
    null,
    { absentMeans: 'the default in src/shared/sleep-clock.ts (RUN_THE_SLEEP_CLOCK_EVERY_MS), which the live office keeps' },
  ),
  setting(
    'MOLE_OFFICE_AGENT',
    'word',
    SETTING_WORDS.MOLE_OFFICE_AGENT,
    null,
    { absentMeans: 'nobody said, so a session started here is not any durable agent' },
  ),
  // WHICH BRIEF FILE A RUN THE OFFICE STARTED WAS GIVEN. `tools/dsh-hooks/run-agent.sh` writes it
  // into the run's environment, and the stop hook reads it to record the brief's size on the run's
  // session record (criterion HB1). It is declared here so the stop hook asks the one declaration
  // rather than spelling the variable name itself; a person never sets it, because it describes one
  // run rather than this checkout.
  setting(
    'MOLE_OFFICE_BRIEF_PATH',
    'path',
    SETTING_WORDS.MOLE_OFFICE_BRIEF_PATH,
    null,
    {
      absentMeans: 'the run was given no brief file, so no size was measured',
      notInTemplateBecause:
        'nobody sets it by hand. tools/dsh-hooks/run-agent.sh writes it into the environment of a run it ' +
        'starts, so the run can record the size of its brief; a person setting it here would be describing ' +
        'every run at once',
    },
  ),
  setting(
    'MOLE_OFFICE_FAKE_RUNTIME',
    'path',
    SETTING_WORDS.MOLE_OFFICE_FAKE_RUNTIME,
    null,
    { absentMeans: 'off: a message to an agent starts that agent\'s real tool' },
  ),
  // THE TWO SYNTHETIC TOOLS THE WORKER CAN START IN PLACE OF THE OFFICE'S OWN, declared here since
  // 22 September 2026: until then both were read out of the worker's environment by a name typed in
  // the reader, and nothing here knew they existed (sandbox v1, merge-adapter open issue 5). Each
  // reader names its setting through `settingNamed`, so a reader of an undeclared name fails at import.
  setting(
    'MOLE_OFFICE_FAKE_MERGE_TOOL',
    'path',
    SETTING_WORDS.MOLE_OFFICE_FAKE_MERGE_TOOL,
    null,
    {
      absentMeans: 'off: a merge entry the office marks starts the real merge tool in this checkout',
      notInTemplateBecause:
        'a test, or whoever starts a throwaway office, sets it in the environment of the worker it starts. ' +
        'A line in .env would make every merge on this checkout a synthetic one that merges nothing',
    },
  ),
  setting(
    'MOLE_OFFICE_FAKE_INSPECTION_TOOL',
    'path',
    SETTING_WORDS.MOLE_OFFICE_FAKE_INSPECTION_TOOL,
    null,
    {
      absentMeans: 'off: a check the office asks for starts the real check tool, which runs a model',
      notInTemplateBecause:
        'a test, or whoever starts a throwaway office, sets it in the environment of the worker it starts. ' +
        'A line in .env would make every check on this checkout a synthetic one that reads nothing',
    },
  ),
  setting(
    'MOLE_OFFICE_TEST_HOOK_CLOCK_SCALE',
    'word',
    'The factor applied to session-hook deadlines and reserves, for the test suite only.',
    null,
    {
      absentMeans: '1: the shipped 10000 ms hook budget, 3000 ms reads and 3500 ms reserve',
      notInTemplateBecause: 'a test sets it only for the hook process it starts to exercise its deadlines',
    },
  ),
  setting(
    'MOLE_OFFICE_TEST_SHUTDOWN_LIMIT_MS',
    'word',
    'The whole shutdown limit in milliseconds, for the test suite only.',
    null,
    {
      absentMeans: '40000 ms: the shipped whole shutdown limit',
      notInTemplateBecause: 'a test sets it only for the server it starts to exercise a missed shutdown deadline',
    },
  ),
  setting(
    'MOLE_OFFICE_TEST_GPU_COMMAND_LIMIT_MS',
    'word',
    'The GPU watcher command limit in whole milliseconds, for the test suite only.',
    null,
    {
      absentMeans: '10000 ms: the shipped GPU watcher command limit',
      notInTemplateBecause: 'a test sets it only for the GPU watcher process it starts to exercise a stalled card',
    },
  ),
  setting(
    'MOLE_OFFICE_TEST_FOLDER_LIMIT_MS',
    'word',
    'The folder measurement limit in whole milliseconds, for the test suite only.',
    null,
    {
      absentMeans: '30000 ms: the shipped limit for measuring one sandbox folder',
      notInTemplateBecause: 'a test sets it only for the sandbox tool process it starts to exercise a stalled folder measurement',
    },
  ),
  // THE THIRD, wave 13j round loop-2: the next-round door's launcher (src/worker/runtimes/round.ts). A test must
  // never start a real round, so its worker names a script here.
  setting(
    'MOLE_OFFICE_FAKE_ROUND_LAUNCHER',
    'path',
    "A script the message worker starts instead of the sandbox launcher's round command, tools/sandbox.mjs round, for the test suite only.",
    null,
    {
      absentMeans: 'off: a next round the office is asked for starts the real launcher, which starts an agent in its sandbox',
      notInTemplateBecause:
        'a test, or whoever starts a throwaway office, sets it in the environment of the worker it starts. ' +
        'A line in .env would make every next round on this checkout a synthetic one that starts nothing',
    },
  ),
  setting(
    'MOLE_OFFICE_TEST_SUPERVISOR_CLOCKS',
    'word',
    'A JSON object naming dev supervisor timers in whole milliseconds, for the test suite only.',
    null,
    {
      absentMeans:
        'goodRun 10000 ms, firstBackoff 500 ms, longestBackoff 30000 ms, childStop 5000 ms, ' +
        'serverStop SHUTDOWN_LIMIT_MS + 5000 ms (45000 ms), migrationLook 5000 ms, serviceLockLook 5000 ms, ' +
        'healthRequest 2000 ms, healthRetry 500 ms',
      notInTemplateBecause:
        'a test sets only the timers it waits out in the environment of its supervisor. ' +
        'A line in .env would shorten the office supervisor’s real waits',
    },
  ),
  // WHETHER A TEST RUN'S FILES SHARE PROCESSES, wave 13n round I. vitest.config.ts reads it from its own environment.
  // It goes in src/config/settings-parts/ once that folder lands.
  setting(
    'MOLE_OFFICE_TEST_FILES_SHARE_A_PROCESS',
    'word',
    'Whether the test files of one vitest run share processes, on or off, for the test suite only.',
    null,
    {
      absentMeans: 'off: each test file runs in a process of its own',
      notInTemplateBecause:
        'the test run that wants it sets it in that run’s environment, and vitest.config.ts reads nothing else. ' +
        'A line in .env would not reach it',
    },
  ),
  // WHERE THE NEWEST VERSION OF EACH AGENT TOOL IS READ, wave 13u round 3 (src/server/lib/harnesses.ts). Unset, the
  // vendors' own registries are asked: the npm registry and PyPI. A test sets it to a server of its own, so no
  // test reaches the network.
  setting(
    'MOLE_OFFICE_HARNESS_REGISTRY',
    'address',
    SETTING_WORDS.MOLE_OFFICE_HARNESS_REGISTRY,
    null,
    {
      absentMeans: "the vendors' own registries, https://registry.npmjs.org and https://pypi.org",
      notInTemplateBecause:
        'a test sets it in the environment of the server it starts. A line in .env would make the office report ' +
        'the newest versions a stand-in registry gives',
    },
  ),
  setting(
    'MOLE_OFFICE_RESET_YES_DELETE_MY_DATA',
    'flag',
    SETTING_WORDS.MOLE_OFFICE_RESET_YES_DELETE_MY_DATA,
    null,
    { absentMeans: 'refuse to delete a database holding records' },
  ),
  setting(
    'MOLE_OFFICE_RESET_WITHOUT_THE_LEDGER',
    'flag',
    'Set to 1 to let `npm run db:reset` go on when nothing listens at the office address, so the ledger cannot be asked whether a live world holds the database.',
    null,
    { absentMeans: 'refuse to delete a database the ledger could not be asked about' },
  ),
  setting(
    'MOLE_OFFICE_REMOTE_PORT',
    'port',
    SETTING_WORDS.MOLE_OFFICE_REMOTE_PORT,
    null,
    { absentMeans: 'off, which is the state every installation is in' },
  ),
  setting(
    'MOLE_OFFICE_INSTALLATION',
    'word',
    SETTING_WORDS.MOLE_OFFICE_INSTALLATION,
    null,
    {
      absentMeans:
        'the id is worked out from the canonical database path this checkout names, and written down once',
    },
  ),
  setting(
    'MOLE_OFFICE_HOME_WORLD',
    'word',
    SETTING_WORDS.MOLE_OFFICE_HOME_WORLD,
    null,
    {
      absentMeans: 'the run is working at home, which is what a run in the world its agent lives in is',
      notInTemplateBecause:
        'nobody sets it. The message worker writes it into the environment of a run it starts, so that ' +
        'run can say which world it is from, and a person setting it here would be telling every server ' +
        'in this checkout something about a run',
    },
  ),
  setting(
    'MOLE_OFFICE_VISIT',
    'word',
    SETTING_WORDS.MOLE_OFFICE_VISIT,
    null,
    {
      absentMeans: 'the run holds no visit, which is what a run working at home holds',
      notInTemplateBecause:
        'nobody sets it. The message worker writes it into the environment of a run it starts, beside ' +
        'MOLE_OFFICE_HOME_WORLD, and the two are only meaningful together',
    },
  ),
  setting(
    'MOLE_OFFICE_WORLD_STARTED_BY',
    'word',
    SETTING_WORDS.MOLE_OFFICE_WORLD_STARTED_BY,
    null,
    {
      absentMeans:
        'this is not a test world with a starter, so nobody holds your authority in it by that rule ' +
        'and every one of your acts is refused to every agent here, exactly as in your own office',
      emptyMeans:
        'the tool could not name the starter, so nobody holds your authority here by that rule; the ' +
        'secretaries named beside it still do',
      notInTemplateBecause:
        'nobody sets it by hand. tools/isolated-mole-office.mjs writes it into the environment of a ' +
        'world it starts, from the ledger row it registers, and a person setting it here would be ' +
        "saying every server in this checkout is somebody's test world",
    },
  ),
  setting(
    'MOLE_OFFICE_WORLD_SECRETARIES',
    'list',
    SETTING_WORDS.MOLE_OFFICE_WORLD_SECRETARIES,
    null,
    {
      absentMeans:
        'nobody was named, so no secretary holds your authority here — never that every secretary does',
      emptyMeans: 'no secretary was named for this world, so no secretary holds your authority here',
      notInTemplateBecause:
        'nobody sets it by hand. tools/isolated-mole-office.mjs reads it from the office it copied and ' +
        'writes it into the environment of the world it starts',
    },
  ),
  setting(
    'MOLE_OFFICE_WORLD_PURPOSE',
    'word',
    SETTING_WORDS.MOLE_OFFICE_WORLD_PURPOSE,
    null,
    {
      absentMeans:
        'nobody recorded what this world is for, which is a real answer the Worlds page says out loud ' +
        'rather than an error — the fifth invariant',
      emptyMeans:
        'the same as absent: nobody recorded what this world is for. The tool writes an empty value ' +
        'when it was given no purpose, because deleting a name from an environment does not reach a ' +
        'file and an empty value is the honest "nothing was said"',
      notInTemplateBecause:
        'nobody sets it by hand. tools/isolated-mole-office.mjs writes it into the environment of a ' +
        'world it starts, from the sentence its starter gave on the command line',
    },
  ),
  setting(
    'MOLE_OFFICE_WORLD_HANDBACK',
    'word',
    SETTING_WORDS.MOLE_OFFICE_WORLD_HANDBACK,
    null,
    {
      absentMeans:
        'nobody tied this world to a handback, which is a real answer the world says out loud rather ' +
        'than an error — the fifth invariant',
      emptyMeans:
        'the same as absent: nobody tied this world to a handback. The tool writes an empty value ' +
        'when it was given none, for the reason the purpose setting above gives',
      notInTemplateBecause:
        'nobody sets it by hand. tools/isolated-mole-office.mjs writes it into the environment of a ' +
        'world it starts, from the record id its starter gave on the command line',
    },
  ),
  setting(
    'MOLE_OFFICE_WORLD_INHERITED_DELIVERIES',
    'path',
    SETTING_WORDS.MOLE_OFFICE_WORLD_INHERITED_DELIVERIES,
    null,
    {
      absentMeans: 'this server is not a copied world with an inherited delivery queue',
      notInTemplateBecause:
        'tools/isolated-mole-office.mjs writes this path into a world it starts, before its API server ' +
        'starts, and the file preserves the exact delivery rows the copy brought',
    },
  ),
  setting(
    'MOLE_OFFICE_ADDRESS_FOR_OTHER_MACHINES',
    'address',
    SETTING_WORDS.MOLE_OFFICE_ADDRESS_FOR_OTHER_MACHINES,
    null,
    {
      absentMeans:
        'off: nothing is served to other machines, and every listener stays on 127.0.0.1. Set it to ' +
        '"none" to say the same thing out loud, which is how a scratch stack turns off an address its ' +
        "checkout's .env names",
    },
  ),
  // CRITERION P86: a visitor holds at most the supervisor card by default,
  // never the inspector or secretary card, and the person may change that here. The value is a role
  // card name; a visitor's credential may not ask for, and a confirmation may not give, a card above it.
  setting(
    'MOLE_OFFICE_VISITOR_CARD_CEILING',
    'word',
    SETTING_WORDS.MOLE_OFFICE_VISITOR_CARD_CEILING,
    null,
    {
      absentMeans:
        'supervisor: a visitor may hold the worker or supervisor card, and never the inspector or ' +
        'the secretary. Set it to a card name to raise the ceiling — inspector or secretary — and the ' +
        'row then says the ceiling was raised by this setting',
    },
  ),
  setting('MOLE_OFFICE_IDLE_AFTER', 'duration', SETTING_WORDS.MOLE_OFFICE_IDLE_AFTER, '5m'),
  setting('MOLE_OFFICE_ORPHAN_AFTER', 'duration', SETTING_WORDS.MOLE_OFFICE_ORPHAN_AFTER, '2h'),
  // CRITERION T6, amended 13 September 2026. Two judgements, so two declared settings: how long a
  // run must be idle before picking it up is called expensive, and how many tokens its last turn
  // must report before it counts as large. Both are defaults a person can argue with, and the
  // warning names the two measured numbers rather than either threshold.
  //
  // THE IDLE DEFAULT IS 5m BECAUSE THAT IS THE PROVIDER'S OWN CACHE WINDOW, as the receipt reports
  // it: src/worker/runtimes/usage.ts reads the runtime's `ephemeral_5m_input_tokens` and
  // `ephemeral_1h_input_tokens`, and 5 minutes is the default. The old wording named the provider's
  // cache window as the comparison; this setting is that window, now written down. It is a
  // different question from MOLE_OFFICE_IDLE_AFTER, which says when a quiet process reads as idle.
  setting(
    'MOLE_OFFICE_EXPENSIVE_AFTER',
    'duration',
    SETTING_WORDS.MOLE_OFFICE_EXPENSIVE_AFTER,
    '5m',
  ),
  // THE TOKEN DEFAULT IS THE SIZE OF A BRIEF, AND THAT IS THE WHOLE REASON FOR THE NUMBER.
  //
  // Past the window above, picking a run up again re-reads its whole turn at full input price.
  // Starting fresh instead costs one brief. So the point where a pick-up costs more than a fresh
  // start is the point where the turn is bigger than a brief, and a brief is already budgeted in
  // this building at BRIEF_TOKEN_BUDGET — criterion I1's number, src/server/api/brief.ts. The
  // default is that number and not one chosen here, and a test holds the two together so neither
  // can move without the other.
  //
  // WHAT THIS NUMBER IS NOT: half a model's context window. That was the first reading, taken from
  // a probe file, and it fails the same way the old T6 wording did — a provider's fact retyped into
  // this source, which nothing here can check and nobody here maintains.
  //
  // THE WEAKNESS, SAID RATHER THAN LEFT TO BE FOUND: at this size nearly every finished Claude turn
  // counts as large, because a run that reads a few files passes twelve thousand. So the half that
  // discriminates is the idle window above, not this number. The owner's own office cannot tell the
  // two candidates apart — its four receipted runs have whole turns of 2,631,475, 2,105,972,
  // 574,038 and 439,492, and both candidates fire on all four — so this is chosen on its reason.
  // To make the warning rarer, raise this on evidence from real runs, not to a rounder number.
  setting(
    'MOLE_OFFICE_LARGE_LAST_TURN_TOKENS',
    'word',
    SETTING_WORDS.MOLE_OFFICE_LARGE_LAST_TURN_TOKENS,
    '12000',
  ),
  setting(
    'MOLE_OFFICE_LOCK_PATHS',
    'list',
    SETTING_WORDS.MOLE_OFFICE_LOCK_PATHS,
    // Separated as PATH is on this system (`path.delimiter`), which src/server/lib/resources.ts splits on.
    theDefaultLockFolders(process.platform, tmpdir()).join(delimiter),
    { emptyMeans: 'watch nothing, which is honoured rather than overridden' },
  ),
  setting(gateNamed('browser-test-seats').setting, 'word', SETTING_WORDS.MOLE_OFFICE_BROWSER_TEST_SLOTS, gateDefaultHere(gateNamed('browser-test-seats'))),
  setting(gateNamed('whole-suite-seats').setting, 'word', SETTING_WORDS.MOLE_OFFICE_WHOLE_SUITE_SLOTS, gateDefaultHere(gateNamed('whole-suite-seats'))),
  setting(gateNamed('test-batch-seats').setting, 'word', SETTING_WORDS.MOLE_OFFICE_TEST_BATCH_SLOTS, gateDefaultHere(gateNamed('test-batch-seats'))),
  setting(gateNamed('test-batch-load-limit').setting, 'word', SETTING_WORDS.MOLE_OFFICE_TEST_BATCH_LOAD_LIMIT, gateDefaultHere(gateNamed('test-batch-load-limit'))),
  setting(gateNamed('test-batch-disk-limit').setting, 'word', SETTING_WORDS.MOLE_OFFICE_TEST_BATCH_FREE_GB_LIMIT, gateDefaultHere(gateNamed('test-batch-disk-limit'))),
  setting(
    'MOLE_OFFICE_PREVIEW_ROOTS',
    'list',
    SETTING_WORDS.MOLE_OFFICE_PREVIEW_ROOTS,
    null,
    {
      absentMeans: 'the two directories Mole Office writes into itself: this checkout, and ~/.cache/mole-office when that directory is there',
      emptyMeans: 'no roots at all, so every preview is refused',
    },
  ),
  setting(
    'MOLE_OFFICE_AVATAR_MAX_BYTES',
    'word',
    SETTING_WORDS.MOLE_OFFICE_AVATAR_MAX_BYTES,
    '2097152',
  ),
  setting(
    'MOLE_OFFICE_MESSAGE_PICTURE_MAX_BYTES',
    'word',
    SETTING_WORDS.MOLE_OFFICE_MESSAGE_PICTURE_MAX_BYTES,
    '10485760',
  ),
  // THE LARGEST FILE SOMEBODY MAY BRING BACK FROM OUTSIDE, in bytes. Fifty megabytes by default.
  //
  // The rule since 14 September 2026: a zip comes in
  // through one new door built the way the pictures door is, stored beside the pictures, never
  // opened by the office, refused above 50 MB, and kept as long as the record that points at it.
  // The limit is rounder than a chat picture's because the thing brought back is a whole piece of
  // outside work rather than one screenshot. The read beside this door says the number before
  // anybody chooses a file, so nobody meets it for the first time after choosing.
  //
  // IT IS DECLARED HERE AND NOWHERE ELSE. `maxReturnedFileBytes` in server/lib/returnedfiles.ts is
  // the one reader; the route's sentence and the refusal both quote the number it returns.
  //
  // NOTHING PRUNES A RETURNED FILE, and there is deliberately no setting for how long one is kept.
  // The rule above asks for none, and the three numbers in src/shared/what-is-kept.ts are about
  // database copies and request-log rows and do not move.
  setting(
    'MOLE_OFFICE_RETURNED_FILE_MAX_BYTES',
    'word',
    SETTING_WORDS.MOLE_OFFICE_RETURNED_FILE_MAX_BYTES,
    '52428800',
  ),
  // THE LARGEST A PERMANENT RESIDENT'S PERSONAL SPACE MAY GROW, in bytes. 500 MB by default.
  //
  // A decision, of 29 September 2026, says the space holds at most 500 MB, and that limit is a
  // setting. It is declared here, beside the returned file's limit, and not on the Settings
  // page, as answer 2 of proposal GsGFiDygATd5 says; that was agreed.
  //
  // IT IS DECLARED HERE AND NOWHERE ELSE. `maxPersonalSpaceBytes` in server/lib/residents.ts is the
  // one reader. A write that would take a space past it is refused with a sentence naming the size
  // already used and the limit, and nothing is cut: a file is written whole or not at all.
  setting(
    'MOLE_OFFICE_PERSONAL_SPACE_MAX_BYTES',
    'word',
    SETTING_WORDS.MOLE_OFFICE_PERSONAL_SPACE_MAX_BYTES,
    '524288000',
  ),
  setting(
    'MOLE_OFFICE_SEED_CORPUS',
    'path',
    SETTING_WORDS.MOLE_OFFICE_SEED_CORPUS,
    SEED_CORPUS_FALLBACK,
  ),
  setting(
    'MOLE_OFFICE_EVENT_RING',
    'word',
    SETTING_WORDS.MOLE_OFFICE_EVENT_RING,
    '200',
  ),
  setting(
    'MOLE_OFFICE_ALIVE_WITHIN_MINUTES',
    'word',
    SETTING_WORDS.MOLE_OFFICE_ALIVE_WITHIN_MINUTES,
    '5',
  ),
  setting(
    'MOLE_OFFICE_PERSON_ALIVE_WITHIN_SECONDS',
    'word',
    SETTING_WORDS.MOLE_OFFICE_PERSON_ALIVE_WITHIN_SECONDS,
    '60',
  ),
  // M110, decided on 11 September 2026. The message
  // door refuses an agent sender a recipient nothing is answering as — but that reading is not yet
  // TRUE for an agent started as a subagent: every worker of this office reads grey while working
  // perfectly well, because only a session that runs a waiter reads green. Until M106 (Cluster B)
  // and F9 make presence true for them, a door that refused on this reading would refuse the live
  // org chart. So this is ONE SETTING, and it defaults to off; an office that wants the refusal turns
  // it on. Retired recipients are refused without it, and always were.
  setting(
    'MOLE_OFFICE_REFUSE_MESSAGE_TO_AGENT_WITH_NO_SESSION_AND_NO_RUN',
    'flag',
    SETTING_WORDS.MOLE_OFFICE_REFUSE_MESSAGE_TO_AGENT_WITH_NO_SESSION_AND_NO_RUN,
    null,
    {
      absentMeans:
        'off: the door refuses only a recipient that is retired or not registered, which is true of them whatever the hour',
    },
  ),
  // The dead-letter summary trigger. One day or more than twenty letters, whichever comes first.
  // Both are owner-decided by a decision. It replaced criterion M111's example, and it has a
  // person's letter to a retired agent go on at once.
  // The installation may choose either threshold; the named secretary receives the summary.
  setting('MOLE_OFFICE_NOTICE_BATCH_MAX_MINUTES', 'word', SETTING_WORDS.MOLE_OFFICE_NOTICE_BATCH_MAX_MINUTES, '60'),
  setting(
    'MOLE_OFFICE_DEAD_LETTER_AFTER_DAYS',
    'word',
    SETTING_WORDS.MOLE_OFFICE_DEAD_LETTER_AFTER_DAYS,
    '1',
  ),
  setting(
    'MOLE_OFFICE_DEAD_LETTER_AFTER_COUNT',
    'word',
    SETTING_WORDS.MOLE_OFFICE_DEAD_LETTER_AFTER_COUNT,
    '20',
  ),
  // EACH RESULT OF A SEARCH OR A LIST BY KIND AT A LEVEL, by the person's decision of 20 November 2026. The three
  // values are that decision's suggestions and have no source. The rule that reads them is src/shared/results-at-a-level.ts.
  setting('MOLE_OFFICE_RESULT_LEVEL_OF_EACH_KIND', 'word', SETTING_WORDS.MOLE_OFFICE_RESULT_LEVEL_OF_EACH_KIND, 'decision=full,message=full,task=3,report=3,module=3,knowledge_entry=3,others=3',
    { notInTemplateBecause: 'Chosen on the Office controls page; the shipped value is a suggestion with no source.' }),
  setting('MOLE_OFFICE_RESULT_WHOLE_UNDER_CHARACTERS', 'word', SETTING_WORDS.MOLE_OFFICE_RESULT_WHOLE_UNDER_CHARACTERS, '300',
    { notInTemplateBecause: 'Chosen on the Office controls page; the shipped value is a suggestion with no source.' }),
  setting('MOLE_OFFICE_KNOWLEDGE_RATING_ASK', 'flag', SETTING_WORDS.MOLE_OFFICE_KNOWLEDGE_RATING_ASK, '1', { notInTemplateBecause: 'Chosen on the Office controls page.' }),
  setting('MOLE_OFFICE_KNOWLEDGE_LOW_RATING_NOTICE', 'flag', SETTING_WORDS.MOLE_OFFICE_KNOWLEDGE_LOW_RATING_NOTICE, '1', { notInTemplateBecause: 'Chosen on the Office controls page.' }),
  setting('MOLE_OFFICE_KNOWLEDGE_FEWEST_RATINGS', 'word', SETTING_WORDS.MOLE_OFFICE_KNOWLEDGE_FEWEST_RATINGS, '1', { notInTemplateBecause: 'Chosen on the Office controls page.' }),
  setting('MOLE_OFFICE_KNOWLEDGE_QUERY_LIMIT', 'word', SETTING_WORDS.MOLE_OFFICE_KNOWLEDGE_QUERY_LIMIT, '100',
    { notInTemplateBecause: 'Chosen on the Office controls page.' }),
  setting('MOLE_OFFICE_RESULTS_CAP_CHARACTERS', 'word', SETTING_WORDS.MOLE_OFFICE_RESULTS_CAP_CHARACTERS, '6000',
    { notInTemplateBecause: 'Chosen on the Office controls page; the shipped value is a suggestion with no source.' }),
  setting('MOLE_OFFICE_STRAY_GRACE', 'word', SETTING_WORDS.MOLE_OFFICE_STRAY_GRACE, '120'),
  setting(
    'MOLE_OFFICE_STALE_CODE_GRACE',
    'word',
    SETTING_WORDS.MOLE_OFFICE_STALE_CODE_GRACE,
    '15',
  ),
  setting(
    'MOLE_OFFICE_NO_WATCH',
    'flag',
    SETTING_WORDS.MOLE_OFFICE_NO_WATCH,
    null,
    { absentMeans: 'watch, which is what `npm run dev` gets' },
  ),
  setting(
    'MOLE_OFFICE_CHECK_FOR_MISSED_CHANGES',
    'word',
    SETTING_WORDS.MOLE_OFFICE_CHECK_FOR_MISSED_CHANGES,
    '60',
  ),
  setting(
    'MOLE_OFFICE_FAILED_STARTS_BEFORE_SAYING',
    'word',
    SETTING_WORDS.MOLE_OFFICE_FAILED_STARTS_BEFORE_SAYING,
    '3',
  ),
  setting(gateNamed('a-new-server-has-to-answer-within').setting, 'word', SETTING_WORDS.MOLE_OFFICE_A_NEW_SERVER_HAS_TO_ANSWER_WITHIN, gateDefaultHere(gateNamed('a-new-server-has-to-answer-within'))),
  setting(gateNamed('migrations-have-to-finish-within').setting, 'word', SETTING_WORDS.MOLE_OFFICE_MIGRATIONS_HAVE_TO_FINISH_WITHIN, gateDefaultHere(gateNamed('migrations-have-to-finish-within'))),
  setting(
    'MOLE_OFFICE_RESTART_REASON',
    'word',
    SETTING_WORDS.MOLE_OFFICE_RESTART_REASON,
    null,
    {
      absentMeans: 'nobody recorded why this server started, which is what a server started by hand is',
      notInTemplateBecause:
        'one process tells another why it just started it. A person writing it into .env would be ' +
        'stamping every future start with a reason that was true once',
    },
  ),
  setting(
    'MOLE_OFFICE_LISTEN_FD',
    'word',
    SETTING_WORDS.MOLE_OFFICE_LISTEN_FD,
    null,
    {
      absentMeans: 'this server opens its own port, which is what a server started by hand, by a test or as the service does',
      notInTemplateBecause:
        'one process hands the server it starts a socket it opened. A person writing it into .env would send ' +
        'every future start to listen on a descriptor that nothing opened',
    },
  ),
  setting(
    'MOLE_OFFICE_STARTED_BY',
    'word',
    SETTING_WORDS.MOLE_OFFICE_STARTED_BY,
    null,
    {
      absentMeans: 'this server was not started as the Mole Office service: by the dev supervisor, by hand, or by a test',
      notInTemplateBecause:
        'one process tells the server it starts what started it. A person writing it into .env would claim that ' +
        'every server of this checkout is the service, including one a terminal started',
    },
  ),
  setting(
    'MOLE_OFFICE_VITE_CACHE',
    'path',
    SETTING_WORDS.MOLE_OFFICE_VITE_CACHE,
    '<this checkout>/.cache/vite',
  ),
  setting(
    'MOLE_OFFICE_PLUGINS',
    'path',
    SETTING_WORDS.MOLE_OFFICE_PLUGINS,
    '<this checkout>/plugins',
    {
      notInTemplateBecause:
        "plugins live in the install's own plugins/ folder. The setting is there " +
        'so that a browser test can show its scratch office a made-up plugin without writing into the checkout',
    },
  ),
  setting(
    'MOLE_OFFICE_WORKER_CHECKOUT',
    'path',
    SETTING_WORDS.MOLE_OFFICE_WORKER_CHECKOUT,
    '<this checkout>',
    {
      notInTemplateBecause:
        "a message worker's runs work in the install's own folder. The setting is there so that a test's " +
        "scratch office can give its worker's runs a folder of their own, and no run writes its rules file into the checkout",
    },
  ),
  setting(
    'MOLE_OFFICE_URL',
    'address',
    SETTING_WORDS.MOLE_OFFICE_URL,
    `http://127.0.0.1:<MOLE_OFFICE_WEB_PORT>`,
    {
      notInTemplateBecause:
        'it points a browser at an app somebody already started rather than configuring the server, ' +
        'and putting it in the template would say the server reads it',
    },
  ),
  setting('MOLE_OFFICE_SHOTS', 'path', SETTING_WORDS.MOLE_OFFICE_SHOTS, 'tools/shots', {
    notInTemplateBecause: 'it configures a photographing tool, not the server',
  }),
  setting('MOLE_OFFICE_PICTURES', 'flag', SETTING_WORDS.MOLE_OFFICE_PICTURES, 'drawn', {
    notInTemplateBecause: 'it configures a photographing tool, not the server',
  }),

  // WHERE ONE HAND-OVER GOES. The host job runner gives a tool an environment built from nothing, so a
  // real job gets neither of these from its request. The tool reads the environment first, where an
  // empty value counts as unset, then the office's settings file, and refuses when neither names one.
  // They configure a host tool rather than the server, so the template does not carry them, and the
  // tool's manual names both.
  setting('HAND_OVER_LAB_SERVER', 'word', SETTING_WORDS.HAND_OVER_LAB_SERVER, null, {
    absentMeans: 'no lab server is named, so tools/hand-over-a-backup.mjs refuses the hand-over',
    emptyMeans: 'the same as not set: the tool reads the office\'s settings file, and refuses when that names none',
    notInTemplateBecause: 'it configures a host tool rather than the server, and tools/hand-over-a-backup.md names both settings',
  }),
  setting('HAND_OVER_LAB_ROOT', 'word', SETTING_WORDS.HAND_OVER_LAB_ROOT, null, {
    absentMeans: 'no folder on the lab server is named, so tools/hand-over-a-backup.mjs refuses the hand-over',
    emptyMeans: 'the same as not set: the tool reads the office\'s settings file, and refuses when that names none',
    notInTemplateBecause: 'it configures a host tool rather than the server, and tools/hand-over-a-backup.md names both settings',
  }),
  // THE LAB SERVER'S PROGRAM AND THE LOCK EVERY MOVER TO THE LAB SERVER SHARES, read in the same way and
  // refused in the same way. Neither has a default: the public tree names neither, and the host's settings
  // file does. The lock is kept as written, because a path that is not absolute is refused rather than
  // resolved.
  setting('HAND_OVER_PROGRAM', 'word', SETTING_WORDS.HAND_OVER_PROGRAM, null, {
    absentMeans: 'no program on this machine is named to take the snapshot, so tools/hand-over-a-backup.mjs refuses the hand-over',
    emptyMeans: 'the same as not set: the tool reads the office\'s settings file, and refuses when that names none',
    notInTemplateBecause: 'it configures a host tool rather than the server, and tools/hand-over-a-backup.md names it',
  }),
  setting('HAND_OVER_LOCK', 'word', SETTING_WORDS.HAND_OVER_LOCK, null, {
    absentMeans: 'no shared lock is named, so tools/hand-over-a-backup.mjs refuses the hand-over',
    emptyMeans: 'the same as not set: the tool reads the office\'s settings file, and refuses when that names none',
    notInTemplateBecause: 'it configures a host tool rather than the server, and tools/hand-over-a-backup.md names it',
  }),

  // ----------------------------------------------------------------- what a Kimi CLI run needs
  //
  // THESE FOUR ARE NOT MOLE OFFICE'S OWN SETTINGS. They are the names Kimi CLI reads, plus the name
  // a person may keep their Moonshot key under, and they are declared here for one reason: until
  // 6 September 2026 nothing in this repository said how a Kimi run gets a key, so a run answered
  // only if whoever started the worker happened to have the right three variables in their shell.
  // Problem oY8Vs5feaRai.
  //
  // WHERE THE THREE COME FROM. Read out of the shipped kimi-cli 1.50.0:
  // `augment_provider_with_env_vars` at `kimi_cli/llm.py:276` reads KIMI_BASE_URL, KIMI_API_KEY,
  // KIMI_MODEL_NAME (and two more this repository does not set) — and only when the provider's type
  // is `kimi`, which is what it is when no config file names a model. With no config file the
  // default provider has an empty base URL and an empty model name, so all three have to be set or
  // Kimi prints `LLM not set` and stops.
  //
  // NONE OF THEM IS IN `.env.example`, and that is the rule this file already had rather than a new
  // one: the template assigns Mole Office's own settings and nothing else, and a credential for an
  // outside service is not one. `tests/config.test.ts` fails on a foreign name assigned there. The
  // value belongs in `.env`, which git ignores.
  //
  // NO VALUE OF ANY OF THEM IS EVER SERVED. `settingsFrom` below names the eight settings whose
  // source is reported by `GET /api/runtime`, and these four are not among them;
  // `tests/one-configuration-source.test.ts` pins that a key's value reaches no reader.
  setting(
    'KIMI_API_KEY',
    'word',
    SETTING_WORDS.KIMI_API_KEY,
    null,
    {
      absentMeans:
        'the Kimi adapter uses MOONSHOT_API_KEY instead if that is set; if neither is set a Kimi run ' +
        'reaches no model and prints "LLM not set"',
      notInTemplateBecause:
        'it is a secret belonging to an outside service, and .env.example assigns Mole Office settings ' +
        'and nothing else. Put it in .env, which git ignores',
    },
  ),
  setting(
    'KIMI_BASE_URL',
    'address',
    SETTING_WORDS.KIMI_BASE_URL,
    null,
    {
      absentMeans:
        'nothing is set, and Kimi CLI\'s own default provider has an empty base URL, so the run prints ' +
        '"LLM not set" and stops. Nothing here fills it in: which endpoint a key belongs to cannot be ' +
        'read off the key, and guessing would point somebody\'s key at a company they did not choose',
      notInTemplateBecause:
        'it is half of a credential for an outside service — the half that says which service — and ' +
        '.env.example assigns Mole Office settings and nothing else',
    },
  ),
  setting(
    'KIMI_MODEL_NAME',
    'word',
    SETTING_WORDS.KIMI_MODEL_NAME,
    null,
    {
      absentMeans:
        'nothing is set, and Kimi CLI\'s own default provider has an empty model name, so the run prints ' +
        '"LLM not set" and stops. Nothing here fills it in: which models an endpoint serves is a fact ' +
        'about that endpoint and this repository cannot read it',
      notInTemplateBecause:
        'it names a model on somebody\'s own account, and .env.example assigns Mole Office settings and ' +
        'nothing else',
    },
  ),
  setting(
    'MOONSHOT_API_KEY',
    'word',
    SETTING_WORDS.MOONSHOT_API_KEY,
    null,
    {
      absentMeans:
        'no Moonshot key was put here, so KIMI_API_KEY is the only name a Kimi run can ' +
        'get a key from',
      notInTemplateBecause:
        'it is a secret belonging to an outside service, and .env.example assigns Mole Office settings ' +
        'and nothing else. Put it in .env, which git ignores',
    },
  ),
  ...PROVIDER_ROUTER_SETTINGS,
  ...STABLE_RELEASE_FLOOR_SETTINGS,
]

/**
 * THE NAMES A KIMI CLI RUN'S ENVIRONMENT IS BUILT FROM, so the adapter spells none of them itself.
 *
 * `src/worker/runtimes/kimi.ts` imports this and builds the run's environment from it. Without it
 * the four names would be typed out in two files, which is the defect this whole module exists to
 * stop. Declared as a named group rather than found by prefix, because MOONSHOT_API_KEY does not
 * share the prefix and is the one that needs saying out loud.
 */
export const KIMI_SETTINGS = /** @type {const} */ ({
  key: 'KIMI_API_KEY',
  baseUrl: 'KIMI_BASE_URL',
  modelName: 'KIMI_MODEL_NAME',
  /** The owner's name for the same key. Kimi CLI never reads it; the adapter maps it across. */
  ownersKey: 'MOONSHOT_API_KEY',
})

const BY_NAME = new Map(SETTINGS.map((s) => [s.name, s]))

/**
 * Every declared setting's name, sorted, for a test or a report that has to list them.
 * @returns {string[]}
 */
export function settingNames() {
  return SETTINGS.map((s) => s.name).sort()
}

/**
 * The declaration for one setting, or a refusal naming what is declared.
 * @param {string} name
 * @returns {Setting}
 */
export function settingNamed(name) {
  const found = BY_NAME.get(name)
  if (found === undefined) {
    throw new Error(
      `${name} is not a Mole Office setting. Every setting is declared in src/config/settings.mjs, and a name ` +
        `that is not there is read by nothing. Declared: ${settingNames().join(', ')}.`,
    )
  }
  return found
}

// ------------------------------------------------------------------------------------ .env

/**
 * `.env` as a plain map, without touching `process.env`.
 *
 * Deliberately not a full dotenv parser: no `export` keyword, no multi-line values, no
 * interpolation. `.env` in this project is a handful of `KEY=value` lines, and a parser that
 * handles more than the file contains is a place for a bug to hide. Quotes are stripped because
 * people write them.
 *
 * A missing or unreadable file is not an error. A fresh clone has no `.env` and nothing is wrong
 * with it; the caller falls through to the declared defaults.
 */
/**
 * A CALLER THAT NEEDS ONE NAME FROM ANOTHER CHECKOUT'S FILE NAMES IT IN `keep`, and every other line is passed over
 * before its value is read, so the map holds nothing else from that file and nothing else can be printed from it
 * (theDatabaseTheStableCheckoutNames, below).
 *
 * @param {string} [file]
 * @param {readonly string[]} [keep] the only names to keep; every name when it is not given
 * @returns {Record<string, string>}
 */
export function envFileValues(file = ENV_FILE, keep = undefined) {
  /** @type {Record<string, string>} */
  const out = {}
  /** @type {string} */
  let text
  try {
    if (!existsSync(file)) return out
    text = readFileSync(file, 'utf8')
  } catch {
    return out
  }
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (trimmed === '' || trimmed.startsWith('#')) continue
    const at = trimmed.indexOf('=')
    if (at === -1) continue
    const key = trimmed.slice(0, at).trim()
    if (key === '') continue
    if (keep !== undefined && !keep.includes(key)) continue
    out[key] = trimmed
      .slice(at + 1)
      .trim()
      .replace(/^["']|["']$/g, '')
  }
  return out
}

/**
 * Put `.env` into `process.env`, once per process, without overwriting what the shell already set.
 *
 * THIS IS THE ONLY PLACE `.env` IS LOADED, and the only place `process.loadEnvFile` is called.
 * Every command that opens a database calls it through `loadPanelEnv` in src/server/lib/env.ts, so
 * that a script which never thought about settings still opens the file the operator configured.
 * Four of them did not, once, and wrote to the built-in default while `.env` named somewhere else.
 *
 * The readers in this file do not need it — they read the file themselves — but a CHILD PROCESS
 * does, and so does anything reading `process.env` for a setting that is not one of ours.
 *
 * @param {string} [file]
 * @returns {{ path: string, found: boolean }}
 */
export function loadEnvFileIntoProcess(file = ENV_FILE) {
  const found = existsSync(file)
  if (found) {
    // WHAT THE LOAD PUT THERE, RECORDED WHILE IT IS STILL POSSIBLE TO SEE.
    //
    // `process.loadEnvFile` does not overwrite a name the shell already set, so the names in the
    // file that were NOT in `process.env` a moment ago are exactly the names this load supplied.
    // That is a reading rather than a comparison of values: a shell that happens to set the same
    // value as the file is still the shell, and this tells the two apart.
    //
    // WHY IT HAS TO BE RECORDED HERE. After the load there is no difference to see. The GROUND
    // verifier measured the result: `GET /api/runtime` said MOLE_OFFICE_PORT came from "the
    // environment" while nobody had exported it and it was a line in `.env`. Problem Txe1lTx0hVc9.
    const before = new Set(Object.keys(process.env))
    const inTheFile = Object.keys(envFileValues(file))
    process.loadEnvFile(file)
    for (const name of inTheFile) {
      if (!before.has(name)) {
        namesTheEnvFileSupplied.add(`${file}\u0000${name}`)
        process.env[name] = pathWrittenInTheEnvFile(name, process.env[name], file)
      }
    }
  }
  return { path: file, found }
}

/**
 * WHICH NAMES IN `process.env` WERE PUT THERE BY A `.env` LOAD, AS `<file>\0<name>`.
 *
 * It is a fact about THIS PROCESS and it only grows, so a second load of the same file cannot
 * erase what the first one recorded. A load of a different file is kept apart by the file in the
 * key, because a test that loads a `.env` of its own must not make the real one's names read as
 * having come from a file.
 */
const namesTheEnvFileSupplied = new Set()

/**
 * Did a `.env` load in this process put this name into `process.env`?
 *
 * False means one of two things and the caller can tell them apart: nothing loaded that file, or
 * the name was already in the shell when it did.
 *
 * @param {string} name
 * @param {string} [file]
 * @returns {boolean}
 */
export function theEnvFileSuppliedThis(name, file = ENV_FILE) {
  return namesTheEnvFileSupplied.has(`${file}\u0000${name}`)
}

/**
 * THE DESCRIPTOR OF THE SOCKET THE DEV SUPERVISOR HANDED THIS SERVER, READ ONCE AND TAKEN OUT OF THE
 * ENVIRONMENT (problem `xGeC_iM6jxYl`). Only the server it was handed to has that descriptor. A
 * process the server starts would inherit the variable without the socket, and a server started
 * from there would try to listen on a descriptor nothing opened. Taken out here, beside its
 * declaration, because this file is the one that reads a setting.
 *
 * @param {Record<string, string | undefined>} [env]
 * @returns {string | null}
 */
export function takeTheListeningDescriptor(env = process.env) {
  const value = readSetting('MOLE_OFFICE_LISTEN_FD', env).value
  delete env.MOLE_OFFICE_LISTEN_FD
  return value === null ? null : String(value)
}

/** Forget what a `.env` load put into this process. For a test that loads one of its own. */
export function forgetWhatTheEnvFileSupplied() {
  namesTheEnvFileSupplied.clear()
}

/**
 * The database choice wins for running controls; otherwise the real environment wins over `.env`.
 * @param {Record<string, string | undefined>} [processEnv]
 * @param {string} [file]
 * @returns {Record<string, string | undefined>}
 */
/** Sources travel with an environment made here, so model readers do not call a database choice a shell value. */
/** @type {WeakMap<object, Map<string, {value:string | undefined, source:SettingSource}>>} */
const mergedSources = new WeakMap()

/** Explicit paths travel with the paired settings file. Built-in code paths keep REPO_ROOT.
 * @param {string} name @param {string | undefined} value @param {string} file
 */
function pathWrittenInTheEnvFile(name, value, file) {
  if (THE_DEVELOPMENT_CHECKOUT === null || value === undefined || value.trim() === '' || isAbsolute(value)) return value
  return SETTINGS.some((setting) => setting.name === name && setting.kind === 'path') ? resolve(dirname(file), value) : value
}

/** The process locations and identity can be read without opening its database.
 * @param {Record<string, string | undefined>} processEnv
 * @param {string} file
 */
function environmentWithoutRuntimeChoices(processEnv, file) {
  const fromFile = envFileValues(file)
  for (const [name, value] of Object.entries(fromFile)) fromFile[name] = /** @type {string} */ (pathWrittenInTheEnvFile(name, value, file))
  const merged = { ...fromFile, ...processEnv }
  /** @type {Map<string, {value:string | undefined, source:SettingSource, why?:string}>} */
  const sources = new Map()
  for (const [name, value] of Object.entries(merged)) {
    if (value !== undefined) sources.set(name, {value, source: whichLayerSetIt(name, processEnv, file)})
  }
  mergedSources.set(merged, sources)
  return { merged, sources }
}

/** The declared locations and identity, before the database is needed.
 * @param {Record<string, string | undefined>} [processEnv]
 * @param {string} [file]
 */
export function bootstrapEnvironment(processEnv = process.env, file = ENV_FILE) {
  return environmentWithoutRuntimeChoices(processEnv, file).merged
}

export function mergedEnvironment(processEnv = process.env, file = ENV_FILE) {
  const { merged, sources } = environmentWithoutRuntimeChoices(processEnv, file)
  if (processEnv === process.env) {
    for (const name of RUNTIME_SETTING_NAMES) {
      const value = chosenRuntimeValue(name, file)
      // An environment with a hole in it would read as unset, and its reader would take the next layer or the default.
      if (typeof value === 'object') throw new Error(notReadRefusal(name, value.notRead))
      if (value !== undefined) { merged[name] = value; sources.set(name, {value, source:'the office database'}) }
    }
  }
  return merged
}

/**
 * What one setting is, where it came from, and the declaration behind it.
 *
 * @typedef {object} Reading
 * @property {Setting} setting
 * @property {string | null} value The value as text, or null when nothing set it and the setting
 *   has no default.
 * @property {SettingSource} source
 * @property {string} [why] Why a stored runtime choice was not read.
 */

/**
 * Read one declared setting out of an environment.
 *
 * `env` is a merged environment — `.env` under the real one — so this function is pure and a test
 * can hand it an environment that is empty because it was built empty, rather than because a file
 * happened not to be there. That distinction cost a red suite on 28 August 2026:
 * `tests/surface-fixes.test.ts` deleted a variable from `process.env`, asserted the built-in
 * default, and got the owner's configured port, because deleting a key does not reach a file.
 */
/**
 * @param {string} name
 * @param {Record<string, string | undefined>} env
 * @returns {Reading}
 */
export function readSetting(name, env) {
  const declared = settingNamed(name)
  const raw = env[name]
  const kept = mergedSources.get(env)?.get(name)
  if (name === 'MOLE_OFFICE_START_MODE' && raw !== undefined && !START_MODES.includes(raw)) {
    const startModes = `${START_MODES.slice(0, -1).join(', ')} or ${START_MODES[START_MODES.length - 1]}`
    throw aValueRefused(name, raw, `MOLE_OFFICE_START_MODE is "${raw}"; it must be ${startModes}. Nothing was started.`)
  }
  if (name === 'MOLE_OFFICE_MESSAGE_WORKER' && raw !== undefined && !MESSAGE_WORKER_MODES.includes(raw)) {
    throw aValueRefused(name, raw,
      `MOLE_OFFICE_MESSAGE_WORKER is "${raw}", and it must be ${MESSAGE_WORKER_MODES.join(', ')}. No worker setting was inferred.`,
    )
  }
  if (name === 'MOLE_OFFICE_TERMINAL_HOLDER' && raw !== undefined && !TERMINAL_HOLDER_MODES.includes(raw)) {
    throw aValueRefused(name, raw,
      `MOLE_OFFICE_TERMINAL_HOLDER is "${raw}", and it must be on or off. Nothing was guessed from it.`,
    )
  }
  if (name === 'MOLE_OFFICE_WINDOW_DEBUGGING' && raw !== undefined && !WINDOW_DEBUGGING_MODES.includes(raw)) {
    throw aValueRefused(name, raw,
      `MOLE_OFFICE_WINDOW_DEBUGGING is "${raw}", and it must be on or off. Nothing was guessed from it.`,
    )
  }
  if (name === 'MOLE_OFFICE_SERVER_HEAP_MB' && raw !== undefined &&
    (!/^[1-9]\d*$/.test(raw) || Number(raw) < SERVER_HEAP_MB_BOUNDS.fewest || Number(raw) > SERVER_HEAP_MB_BOUNDS.most)) {
    throw aValueRefused(name, raw,
      `${name} is "${raw}", and it must be a whole number of megabytes from ${String(SERVER_HEAP_MB_BOUNDS.fewest)} to ${String(SERVER_HEAP_MB_BOUNDS.most)}. Nothing was started.`,
    )
  }
  if (['MOLE_OFFICE_FEW_RED_FILES', 'MOLE_OFFICE_HAND_BACK_HOURS', 'MOLE_OFFICE_TEST_SHUTDOWN_LIMIT_MS', 'MOLE_OFFICE_TEST_FOLDER_LIMIT_MS', 'MOLE_OFFICE_TEST_GPU_COMMAND_LIMIT_MS'].includes(name) && raw !== undefined && (!/^\d+$/.test(raw) || !Number.isSafeInteger(Number(raw)) || Number(raw) < 1)) {
    throw aValueRefused(name, raw, `${name} is "${raw}", and it must be a whole number of at least 1. Nothing was guessed from it.`)
  }
  if (name === 'MOLE_OFFICE_TEST_HOOK_CLOCK_SCALE' && raw !== undefined && (!/^\d+(\.\d+)?$/.test(raw) || !(Number(raw) > 0))) {
    throw aValueRefused(name, raw, `${name} is "${raw}", and it must be a number above 0. Nothing was guessed from it.`)
  }
  if (name === 'MOLE_OFFICE_TEST_FILES_SHARE_A_PROCESS' && raw !== undefined && !['on', 'off'].includes(raw)) {
    throw aValueRefused(name, raw, `${name} is "${raw}", and it must be on or off. Nothing was guessed from it.`)
  }
  const routerRefusal = theProviderRouterValueRefused(name, raw)
  if (routerRefusal !== null) throw aValueRefused(name, raw, routerRefusal)
  const floorRefusal = theStableReleaseFloorRefused(name, raw)
  if (floorRefusal !== null) throw aValueRefused(name, raw, floorRefusal)
  const gate = gateForSetting(name)
  if (gate?.positions.kind === 'block-remind-off' && raw !== undefined && !gateValueIsAllowed(gate, raw)) {
    throw aValueRefused(name, raw, `${name} is "${raw}", and it must be ${gate.positions.allowed.join(' or ')}. Nothing was guessed from it.`)
  }
  if (raw === undefined) {
    return { setting: declared, value: declared.fallback, source: declared.fallback === null ? 'nothing set it' : 'the built-in default' }
  }
  if (raw.trim() === '' && declared.emptyMeans === null) {
    throw aValueRefused(name, raw,
      `${name} is set to an empty value, and an empty setting is not a ${declared.kind === 'word' ? 'value' : declared.kind}. ` +
        `${emptyAdvice(declared)} ` +
        'Set and empty and not set at all are different statements, and this cannot guess which you meant.',
    )
  }
  // An environment made here retains its source reading. A caller’s plain object is its own
  // environment, so nothing is inferred about another file or database.
  return { setting: declared, value: raw, source: kept?.value === raw ? kept.source : 'the environment' }
}

/**
 * Select the server's start mode before any database or ordinary route is imported.
 * @param {Record<string, string | undefined>} env
 * @returns {(typeof START_MODES)[number]}
 */
export function startModeFrom(env) {
  return /** @type {(typeof START_MODES)[number]} */ (readSetting('MOLE_OFFICE_START_MODE', env).value)
}

/**
 * @param {Setting} declared
 * @returns {string}
 */
function emptyAdvice(declared) {
  if (declared.fallback !== null) return `Give it a value, or delete the line to use ${declared.fallback}.`
  return `Give it a value, or delete the line, which means: ${declared.absentMeans ?? 'nothing'}.`
}

/**
 * WHICH OF THE TWO LAYERS SET A VALUE THAT SOMETHING SET.
 *
 * Only called when a value is present. The answer is `.env` when either of two things is true, and
 * both of them are readings rather than guesses:
 *
 * 1. **The name is not in the environment handed in at all**, so the merged read can only have got
 *    it from the file. That is the case for every caller that builds its own environment, which is
 *    every test and every tool that reads a setting without loading `.env`.
 * 2. **A `.env` load in this process put the name into `process.env`.** `loadEnvFileIntoProcess`
 *    records what it added, above, because after the load there is nothing left to see. This is
 *    the case the server is in: `src/server/db/client.ts` loads `.env` when it is imported, so by
 *    the time `GET /api/runtime` asks, `.env`'s values are in `process.env` and look like a shell's.
 *
 * THE RECORD IS ONLY READ FOR `process.env` ITSELF. A caller that hands in an environment it built
 * is describing a world of its own, and answering it out of what happened to this process would be
 * this file telling a test about a file the test did not read.
 *
 * @param {string} name
 * @param {Record<string, string | undefined>} processEnv
 * @param {string} file
 * @returns {SettingSource}
 */
function whichLayerSetIt(name, processEnv, file) {
  if (processEnv[name] === undefined) return '.env'
  if (processEnv === process.env && theEnvFileSuppliedThis(name, file)) return '.env'
  return 'the environment'
}

/** @type {((name: string) => string | undefined) | null} */
let databaseSettingReader = null
/** @type {() => boolean} */
let databaseSettingReaderIsOpen = () => false

/** Install the reader after opening the named database. Bootstrap settings never use it.
 * @param {(name: string) => string | undefined} reader
 * @param {() => boolean} [isOpen]
 */
export function readDatabaseSettingsWith(reader, isOpen = () => true) { databaseSettingReader = reader; databaseSettingReaderIsOpen = isOpen }

/** @type {((which: string) => void) | null} */
let countARefusedValue = null

/** Install the count of the gate every-setting-value-is-known. The server installs it when its counts can be written;
 * a tool or the message worker installs none, so a refusal there is not counted.
 * @param {(which: string) => void} count
 */
export function countRefusedSettingValuesWith(count) { countARefusedValue = count }

/** A refusal of a setting's value, handed to the count before it is thrown. The count is told the setting's name and
 * a hash of the value, never the value, since a setting can hold a key. A count that fails is said on its own line and
 * never replaces the refusal.
 * @param {string} name @param {string} raw @param {string} message
 */
function aValueRefused(name, raw, message) {
  try {
    countARefusedValue?.(`${name} ${createHash('sha256').update(raw).digest('hex')}`)
  } catch (notCounted) {
    console.error(`A refused value of ${name} was not counted on the gate every-setting-value-is-known: ${notCounted instanceof Error ? notCounted.message : String(notCounted)}`)
  }
  return new Error(message)
}

/** @param {string} name @param {string} file */
function chosenRuntimeValue(name, file) {
  if (!RUNTIME_SETTING_NAMES.includes(name)) return undefined
  if (databaseSettingReader !== null && databaseSettingReaderIsOpen()) return databaseSettingReader(name)
  const env = { ...envFileValues(file), ...process.env }
  return storedRuntimeValue(databasePathFrom(env), name)
}

/** The same read, with the source of the selected value. */
/**
 * @param {string} name
 * @param {Record<string, string | undefined>} [processEnv]
 * @param {string} [file]
 * @returns {Reading}
 */
export function readSettingHere(name, processEnv = process.env, file = ENV_FILE) {
  const kept = mergedSources.get(processEnv)?.get(name)
  if (kept !== undefined && kept.value === processEnv[name]) return readSetting(name, processEnv)
  // A database choice wins the legacy environment for this office. An explicit environment
  // supplied by a caller still describes that caller's own world and opens no database.
  if (processEnv === process.env) {
    const chosen = chosenRuntimeValue(name, file)
    if (typeof chosen === 'object') return { setting: settingNamed(name), value: null, source: 'not read', why: chosen.notRead }
    if (chosen !== undefined) return { ...readSetting(name, { [name]: chosen }), source: 'the office database' }
  }
  const fromFile = envFileValues(file)
  // ONLY THE ONE NAME IS MERGED, as `{ ...fromFile, ...processEnv }` would give it, since `readSetting` reads no other.
  // Copying the whole environment for each reading was 77 of the 512 ms one presence roster took on an office of the
  // live shape (9 October 2026), which reads two settings for each of its 913 participants.
  const reading = readSetting(name, { [name]: Object.hasOwn(processEnv, name) ? processEnv[name] : pathWrittenInTheEnvFile(name, fromFile[name], file) })
  if (reading.source !== 'the environment') return reading
  return { ...reading, source: whichLayerSetIt(name, processEnv, file) }
}

// ------------------------------------------------------------------------------- the values

/** A port, checked, with the setting's name in every refusal. */
/**
 * @param {Record<string, string | undefined>} env
 * @param {string} name
 * @returns {number}
 */
export function portFrom(env, name) {
  const reading = readSetting(name, env)
  if (reading.value === null) {
    throw new Error(`${name} is not set and has no default, so there is no port to use.`)
  }
  const port = Number(reading.value)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(
      `${name} is "${reading.value}", which is not a port number. Fix it in .env, or unset it to use ` +
        `${reading.setting.fallback ?? 'nothing'}.`,
    )
  }
  return port
}

/**
 * The ports a first-handoff rehearsal must keep clear, as MOLE_OFFICE_REHEARSAL_KEEP_CLEAR_PORTS names them in `env`,
 * separated by commas. None when it is unset or empty. An entry that is not a port number is refused, never skipped.
 * @param {Record<string, string | undefined>} env
 * @returns {number[]}
 */
export function portsToKeepClearFrom(env) {
  const name = 'MOLE_OFFICE_REHEARSAL_KEEP_CLEAR_PORTS'
  const { value } = readSetting(name, env)
  if (value === null || value.trim() === '') return []
  return value.split(',').map((entry) => {
    const port = Number(entry.trim())
    if (!/^\d+$/.test(entry.trim()) || port < 1 || port > 65535) {
      throw new Error(`${name} names "${entry.trim()}", which is not a port number. No port was kept clear or guessed from it.`)
    }
    return port
  })
}

/**
 * Where Vite keeps its pre-bundled dependencies, absolute.
 *
 * One cache per checkout, found from this file's own location rather than from the working
 * directory — so it is the same directory whichever folder npm was run from, and a worktree gets
 * its own rather than the main checkout's. A relative setting is resolved against the checkout,
 * not against Vite's root, which is `src/web` and is not where anyone means.
 */
/**
 * @param {Record<string, string | undefined>} env
 * @returns {string}
 */
export function viteCacheDirFrom(env) {
  const reading = readSetting('MOLE_OFFICE_VITE_CACHE', env)
  if (!readingWasSet(reading)) return resolve(REPO_ROOT, '.cache/vite')
  return resolve(REPO_ROOT, String(reading.value))
}

/**
 * The folder the plugins are read from, absolute: `plugins/` under the install's root, or what MOLE_OFFICE_PLUGINS
 * names, resolved against the install's root when it is relative.
 *
 * @param {Record<string, string | undefined>} env
 * @returns {string}
 */
export function pluginsFolderFrom(env) {
  const reading = readSetting('MOLE_OFFICE_PLUGINS', env)
  if (!readingWasSet(reading)) return THE_PLUGINS_FOLDER
  return resolve(REPO_ROOT, String(reading.value))
}

/**
 * The folder a message worker's runs work in, absolute and without its last slash: the install's root, or what
 * MOLE_OFFICE_WORKER_CHECKOUT names, resolved against the install's root when it is relative. Each run writes its
 * rules file there as AGENTS.md. Only a test's scratch office names another folder (round 15, finding 8).
 * Two places read it: `workerSettingsFrom` in src/worker/index.ts, for the folder the worker starts its runs in,
 * and `theInterruptedRuns` in src/server/lib/interrupted.ts, which resumes only a run that worked there.
 *
 * @param {Record<string, string | undefined>} env
 * @returns {string}
 */
export function workerCheckoutFrom(env) {
  const reading = readSetting('MOLE_OFFICE_WORKER_CHECKOUT', env)
  if (!readingWasSet(reading)) return REPO_ROOT.replace(/\/$/, '')
  return resolve(REPO_ROOT, String(reading.value))
}

/**
 * The database file this environment names, absolute.
 *
 * A RELATIVE VALUE IS RESOLVED AGAINST `DATA_ROOT`, NOT AGAINST THE WORKING DIRECTORY. `DATA_ROOT` is
 * the checkout itself, or the per-user data folder when the office runs from a bundle. This is
 * the same rule `canonicalDatabasePath` below and `viteCacheDirFrom` above follow.
 *
 * IT USED TO RESOLVE AGAINST `process.cwd()`, and problem `wbosGYxUfsZz` is what that cost. The
 * declared default is `./data/panelx.db`, which is checkout intent written as a relative path, so
 * the two readers of the same setting disagreed whenever the two directories differed: a server
 * started from anywhere but the checkout opened `./data/panelx.db` under THAT directory while the
 * product called the checkout's copy the canonical one. `GET /api/runtime` then said the database
 * was not canonical, the world header said scratch, and `GET /api/health` could answer ok false —
 * all about a server nobody had configured wrongly.
 *
 * An absolute value is returned unchanged, which is what `MOLE_OFFICE_DB=/tmp/scratch.db` is and
 * what every test helper sends.
 *
 * @param {Record<string, string | undefined>} env
 * @returns {string}
 */
export function databasePathFrom(env) {
  // `resolve` rather than a URL, because a path is not a URL: a database at `/tmp/my data.db`
  // survives this and would come back percent-encoded from the other.
  return resolve(DATA_ROOT, String(readSetting('MOLE_OFFICE_DB', env).value))
}

/**
 * THE START-UP NOTICE OF A DECISION: the default database file is `./data/mole-office.db`, and when nothing names the
 * database, the old default `./data/panelx.db` exists and the new one does not, the office says so before it opens
 * anything, naming both files and the line that keeps the old one. Null in every other case. It
 * changes nothing on disk.
 *
 * @param {Record<string, string | undefined>} env
 * @param {string} [root]
 * @returns {string | null}
 */
export function theOldDatabaseNotice(env, root = DATA_ROOT) {
  if (env.MOLE_OFFICE_DB !== undefined) return null
  const old = resolve(root, THE_DATABASE_BEFORE_THE_RENAME)
  const now = resolve(root, DATABASE_FALLBACK)
  if (!existsSync(old) || existsSync(now)) return null
  return (
    `Nothing names the database, so Mole Office opens its default, ${now}, which does not exist yet and starts empty. ` +
    `The default was ${old} until 30 September 2026, and that file is here. To keep working in it, add ` +
    `MOLE_OFFICE_DB=${THE_DATABASE_BEFORE_THE_RENAME} to .env and start again.`
  )
}

/**
 * THE DIRECTORY A DATABASE PATH IS IN, worked out from the path it is given and from nothing else.
 *
 * THE ARGUMENT IS THE WHOLE POINT. Three different databases are asked about in this repository and
 * they are three different databases on purpose:
 *
 *   - the database the declaration names, read as `settings().databasePath`;
 *   - the database THIS PROCESS opened, read as `databaseFileStatus().path`;
 *   - the canonical database of the checkout, read as `canonicalDatabasePath()`.
 *
 * A function with no argument would have to choose one of the three, and choosing any of them would
 * silently change what the other two mean. `src/server/lib/office.ts` says the sharpest case in its
 * own words: the mirror goes beside the database this process opened, "so that an office in a
 * throwaway database writes a throwaway mirror rather than over the one the real office wrote". A
 * caller that means the throwaway one must be able to say so, and the only way to say it is to pass
 * the path.
 *
 * `dirname(resolve(...))` was spelled out in seven places before this and all seven were the same
 * arithmetic. It is written once here — invariant 9 of USER.md — and every caller passes its own
 * database path. `resolve` makes a relative path absolute against the working directory, which no
 * caller here relies on: every database path this is handed is already absolute.
 *
 * @param {string} databasePath
 * @returns {string}
 */
export function databaseDirectoryFrom(databasePath) {
  return dirname(resolve(String(databasePath)))
}

/**
 * WHERE THE OFFICE'S KEY FILE LIVES: BESIDE THE DATABASE, worked out from the database path and
 * from nothing else. Criterion P83, point 1, and a decision of 13 September 2026 say so.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT IS DERIVED AND NOT A SETTING OF ITS OWN
 * ---------------------------------------------------------------------------------------
 *
 * The office's own key and the person's key are made at first run and kept in one file. The file
 * belongs with the thing it protects: a database and the keys that open it are moved, backed up
 * and deleted together, and a second setting naming the key's directory could be moved apart from
 * the database with nothing failing. So this is worked out here, once, from `databasePathFrom`.
 *
 * THE KEY IS NEVER A `MOLE_OFFICE_` SETTING. Nothing but this file may read `.env` or a setting
 * name, so the value can never be a line somebody edits; it exists only in the file this path
 * names. The name is plain `keys.json` so that a person looking in the data directory finds it.
 *
 * `resolve` rather than a string join, because the database path is always absolute and a path is
 * not a URL. It is beside the database whether the database is the checkout's own `data/` or a
 * temporary file a test named.
 *
 * @param {Record<string, string | undefined>} env
 * @returns {string}
 */
export function keysPathFrom(env) {
  return resolve(databaseDirectoryFrom(databasePathFrom(env)), 'keys.json')
}

/**
 * WHERE THE OFFICE'S BACKUPS GO: BESIDE THE DATABASE, worked out from the database path and from
 * nothing else. Criterion U6, and the ninth invariant of USER.md.
 *
 * ---------------------------------------------------------------------------------------
 * ONE FACT, ONE PLACE
 * ---------------------------------------------------------------------------------------
 *
 * `scripts/backup.ts` held this directory as its own `new URL('../data/backups', import.meta.url)`,
 * which is the same folder as the canonical database's own `data/backups` while the database is the
 * canonical one and a different folder the moment `MOLE_OFFICE_DB` names something else. Two
 * answers to one question is the defect this file exists against, so the directory is worked out
 * here once and `scripts/backup.ts` asks for it. A backups folder belongs with the database it is a
 * copy of, which is why this derives from the path rather than being a setting of its own.
 *
 * @param {Record<string, string | undefined>} env
 * @returns {string}
 */
export function backupsDirectoryFrom(env) {
  return backupsDirectoryOf(databasePathFrom(env))
}

/**
 * The backups folder of this database file. A server asks it for the database it opened, which is not always the
 * one `MOLE_OFFICE_DB` names now (src/server/api/backups.ts).
 *
 * @param {string} databasePath
 * @returns {string}
 */
export function backupsDirectoryOf(databasePath) {
  return resolve(databaseDirectoryFrom(databasePath), 'backups')
}

/**
 * WHERE A DATABASE'S SERVICE LOCK LIVES: BESIDE THE DATABASE, named after the database file, worked
 * out from the database path and from nothing else. Criteria W2(c) and W9 of
 * design/window/ACCEPTANCE.md.
 *
 * The server takes this lock before it opens the database, and the `mole-office` command reads it to
 * find the service that serves the database (src/config/the-service-lock.mjs says what is in it). It
 * is derived rather than a setting for the reason the key file is: a lock that could be moved apart
 * from its database would stop guarding it with nothing failing.
 *
 * NAMED AFTER THE DATABASE FILE, NOT ONE NAME PER FOLDER. A folder may hold more than one database:
 * a checkout's `data/` held both `panelx.db` and `mole-office.db` after the rename of 30 September
 * 2026. One name per folder would let a server of one of them refuse to start because a server of
 * the other is running. So the database `mole-office.db` has the lock `mole-office.db.service.json`.
 *
 * EVERY DATABASE IS A FILE HERE. `databasePathFrom` resolves whatever `MOLE_OFFICE_DB` says to an
 * absolute path, so even `:memory:` would name a file called `:memory:` in the checkout. There is no
 * database without a path, and so no server without a lock.
 *
 * @param {Record<string, string | undefined>} env
 * @returns {string}
 */
export function serviceLockPathFrom(env) {
  const database = databasePathFrom(env)
  return resolve(databaseDirectoryFrom(database), `${basename(database)}.service.json`)
}

/**
 * WHERE A SERVICE STARTED BY THE `mole-office` COMMAND WRITES ITS OUTPUT: beside its lock, named after
 * the database file too, so that the lock and the log of one service are found together.
 *
 * @param {Record<string, string | undefined>} env
 * @returns {string}
 */
export function serviceLogPathFrom(env) {
  const database = databasePathFrom(env)
  return resolve(databaseDirectoryFrom(database), `${basename(database)}.service.log`)
}

/**
 * The corpus file `npm run db:seed` writes into a database, as an absolute path.
 *
 * Resolved against this checkout for the same reason the database path is: a relative path would
 * mean a different file depending on where the command was run from.
 *
 * @param {Record<string, string | undefined>} env
 * @returns {string}
 */
export function seedCorpusPathFrom(env) {
  return resolve(REPO_ROOT, String(readSetting('MOLE_OFFICE_SEED_CORPUS', env).value))
}

/**
 * THE DATABASE THIS CHECKOUT WOULD OPEN WITH NOTHING SET IN A SHELL: the canonical one.
 *
 * It is a different question from `databasePathFrom`, which answers about a particular environment.
 * This one is about the checkout, so it reads `.env` and ignores the shell, and it is what
 * `GET /api/runtime` calls `database.canonicalPath`, what the world header's standing turns on, and
 * what a tool means when it says "the live corpus" or "the owner's corpus".
 *
 * IT IS HERE BECAUSE THREE FILES SPELLED IT THEMSELVES. `tools/demonstration-pipeline.ts` wrote
 * an absolute path to one machine's `data/panelx.db` as the guard
 * that refuses to write to the owner's corpus — so moving the corpus stopped the guard guarding.
 * `tools/isolated-mole-office.mjs` and `scripts/restore-check.ts` each wrote
 * `join(<the checkout>, 'data', 'panelx.db')`. Nothing made the four agree. Criterion G1 names the
 * database path in its first sentence; problem `XnEkXa6aq0Yn` is that nothing checked it.
 *
 * A RELATIVE VALUE IS RESOLVED AGAINST `DATA_ROOT` (THE CHECKOUT, OR THE PER-USER DATA FOLDER FROM A
 * BUNDLE), NOT THE WORKING DIRECTORY, which is the same
 * reasoning `viteCacheDirFrom` above carries: the sentence this answers is "the file a server
 * started FROM THIS CHECKOUT would open", and the directory somebody happened to run a command in
 * is not part of it. An absolute value is returned unchanged.
 *
 * @param {string} [file]
 * @returns {string}
 */
export function canonicalDatabasePath(file = ENV_FILE) {
  return resolve(DATA_ROOT, String(readSetting('MOLE_OFFICE_DB', envFileValues(file)).value))
}

/**
 * THE DATABASE THE STABLE CHECKOUT'S SETTINGS NAME, which is the live office's: the value of MOLE_OFFICE_DB in the
 * .env of theStableCheckoutFolder(home), or the declared default when the file does not name one. The value is resolved
 * against the stable checkout, as tools/the-offices-data-folder.mjs resolved it before this function was taken out of
 * that file. Null when that checkout has no .env.
 *
 * Only MOLE_OFFICE_DB is read from that file. It is another checkout's, and the live office's, so no other value is
 * held or can be printed. Two readers ask it: the sandbox launcher's data-folder check
 * (tools/the-offices-data-folder.mjs) and the service command's refusal of a test-marked start on the live office
 * (src/config/the-service-command.mjs).
 *
 * @param {string} home
 * @returns {string | null}
 */
export function theDatabaseTheStableCheckoutNames(home) {
  const stable = theStableCheckoutFolder(home)
  const file = join(stable, '.env')
  if (!existsSync(file)) return null
  return resolve(stable, String(readSetting('MOLE_OFFICE_DB', envFileValues(file, ['MOLE_OFFICE_DB'])).value))
}

/**
 * WHERE THE API OF THE CANONICAL STACK ANSWERS: the address a server started from this checkout with
 * nothing set in a shell would take.
 *
 * The same question `canonicalDatabasePath` asks about the database, asked about the address, and it
 * reads `.env` and ignores the shell for the same reason. A scratch server has its own port in its
 * environment, so `apiAddressFrom(process.env)` answers about ITSELF; this answers about the main
 * world, which is what a scratch world needs when it goes to register at the office.
 *
 * @param {string} [file]
 * @returns {string}
 */
export function canonicalApiAddress(file = ENV_FILE) {
  return apiAddressFrom(envFileValues(file))
}

/**
 * The project a command-line tool works in, under this environment.
 * @param {Record<string, string | undefined>} env
 * @returns {string}
 */
export function workspaceFrom(env) {
  return String(readSetting('MOLE_OFFICE_WORKSPACE', env).value)
}

/**
 * PRINTED AT MOST ONCE PER PROCESS: see the warning inside `apiAddressFrom`. A tool is a process,
 * so once per process is once per tool — this is what makes the warning loud without making a
 * long-running server repeat it on every request. `forgetTheDefaultApiAddressWarning` below resets
 * it for a test that wants to see it fire more than once in one process.
 */
let warnedAboutDefaultApiAddress = false

/** For a test only: let the next silent default fire the warning again, in this same process. */
export function forgetTheDefaultApiAddressWarning() {
  warnedAboutDefaultApiAddress = false
}

/**
 * THE OFFICE ADDRESS IN A SANDBOX SHELL IS FOR THAT SANDBOX'S OWN CHECKOUTS (problem JQ3yaANBi1JC; the coordinator, message
 * UbLJSVj0zZd_). Every sandbox shell sets MOLE_OFFICE_API to the live office, for the run's own tools. On 4 October 2026 a
 * hand run of an installed office's bundled register-myself.mjs, in such a shell and without --api, took that address and
 * registered a made-up agent on the live office. So the helper that starts a sandbox's command sets MOLE_OFFICE_API_ROOT
 * beside it, the sandbox's folder, and only code running from a git checkout inside that folder takes the address from
 * the environment: the sandbox's clone, its worktrees and its other clones. An unpacked or installed copy (no .git), or a
 * copy anywhere else, is told to say which office it means with --api; --api always wins. Where MOLE_OFFICE_API_ROOT is
 * not set (a session on this computer, the owner's installed office), nothing changes.
 *
 * Answers null when this copy may take the environment's address, or the sentence a tool refuses with.
 * @param {Record<string, string | undefined>} [env]
 * @param {string} [here] the root of the copy this code runs from
 * @returns {string | null}
 */
export function theEnvironmentsAddressIsForAnotherCopy(env = process.env, here = REPO_ROOT) {
  const root = env['MOLE_OFFICE_API_ROOT']
  const address = env['MOLE_OFFICE_API']
  if (typeof root !== 'string' || root.trim() === '' || typeof address !== 'string' || address.trim() === '') return null
  const real = (/** @type {string} */ path) => {
    try {
      return realpathSync(path)
    } catch {
      return resolve(path)
    }
  }
  const folder = real(root)
  const copy = real(here)
  const inside = copy === folder || copy.startsWith(folder.endsWith('/') ? folder : `${folder}/`)
  if (inside && existsSync(join(copy, '.git'))) return null
  const where = inside ? `${copy}, which is inside it but is no git checkout (an unpacked or installed copy)` : `${copy}, outside it`
  return (
    `MOLE_OFFICE_API in this shell was given for the git checkouts in ${folder}, and this copy of the office's tools is ` +
    `${where}, so it does not take that address. Say which office you mean with --api: --api ${address.replace(/\/+$/, '')} ` +
    'for the office this shell names, or the address of an office of your own. Nothing was sent.'
  )
}

/**
 * Where the API answers under this environment, with no trailing slash.
 *
 * WHEN NEITHER MOLE_OFFICE_API NOR MOLE_OFFICE_PORT IS SET ANYWHERE THIS PROCESS CAN SEE, this
 * says so on stderr before answering with the built-in default — once per process, not once per
 * call, because `settings()` (and so this) is read on every request by the live server, and a
 * server that has genuinely been given no configuration at all is exactly the ordinary case this
 * file's own header calls "a real answer", not a fault to repeat into the log forever. STDERR,
 * NEVER STDOUT: `tools/session-hook.mjs` prints its own report on stdout and three tests pin its
 * shape, so a warning on stdout from underneath it would corrupt the one line every arriving agent
 * reads to learn where it is. It never fires on that hook's own ordinary path — the checkout the
 * hook is registered against has a `.env` naming both settings, so the very first line below
 * already returns before this is reached.
 *
 * @param {Record<string, string | undefined>} env
 * @returns {string}
 */
export function apiAddressFrom(env) {
  const set = readSetting('MOLE_OFFICE_API', env)
  if (readingWasSet(set)) return String(set.value).replace(/\/+$/, '')
  const port = readSetting('MOLE_OFFICE_PORT', env)
  if (!readingWasSet(port) && !warnedAboutDefaultApiAddress) {
    warnedAboutDefaultApiAddress = true
    process.stderr.write(
      'Neither MOLE_OFFICE_API nor MOLE_OFFICE_PORT is set anywhere this process can see ' +
        `(checked ${ENV_RESOLUTION.checked.join(' and ')}), so the API address defaults to ` +
        `http://127.0.0.1:${String(API_PORT_FALLBACK)}. If the office is running somewhere else, this ` +
        'is wrong. Said once per process.\n',
    )
  }
  return `http://127.0.0.1:${String(portFrom(env, 'MOLE_OFFICE_PORT'))}`
}

/**
 * Where THIS PROCESS should reach the API, from the layers as they really are: a port set in the
 * real environment beats an address that only the file names.
 *
 * `apiAddressFrom` reads one merged environment and cannot tell a shell's MOLE_OFFICE_PORT from a
 * `.env`'s MOLE_OFFICE_API, so when both are set it takes the address, whichever layer it came from.
 * For the browser app that was wrong: a test or a worktree starts Vite with MOLE_OFFICE_PORT set to
 * its own API, the page is told that port, and the checkout's `.env` names the owner's live API —
 * so the registration went to the owner's database while the pages called the test's. Measured on
 * 5 September 2026: 268 rows titled "The browser app" in the owner's database in two days, every
 * one saying "running" for ever. Problem `f1uCdpMEB1hs`.
 *
 * The precedence is the one the whole file declares — the real environment overrides the file —
 * applied to the fact rather than to the name: a port and an address are the same fact said two
 * ways, so the one set nearer to the process wins.
 *
 * @param {Record<string, string | undefined>} [processEnv]
 * @param {string} [file]
 * @returns {string}
 */
export function apiAddressForThisProcess(processEnv = process.env, file = ENV_FILE) {
  const address = readSettingHere('MOLE_OFFICE_API', processEnv, file)
  const port = readSettingHere('MOLE_OFFICE_PORT', processEnv, file)
  if (address.source === '.env' && port.source === 'the environment') {
    return `http://127.0.0.1:${String(port.value)}`
  }
  return apiAddressFrom({ ...envFileValues(file), ...processEnv })
}

/**
 * WHERE THE BROWSER APP OF THIS CHECKOUT FILES ITS OWN ROW, or null because this checkout has no
 * Mole Office of its own.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT IS NOT `apiAddressForThisProcess`, MEASURED
 * ---------------------------------------------------------------------------------------
 *
 * `findEnvFile` reads a worktree's missing `.env` out of the main checkout it was made from, on
 * purpose, and that is right for the tools, the hook and the server: an agent working in a worktree
 * should reach the operator's live office. It is wrong for the browser app's OWN row. A Vite started
 * in a worktree or a check then serves pages against the operator's office and files a row that says
 * "The browser app" is running under the WORKTREE's checkout, in the operator's database. Nothing
 * closes it while the worktree lives, and nothing ever closes it at all for a check worktree, which
 * is used once. Problem `1p-pQxYe0RLB`: 17 such rows said running in the owner's office.
 *
 * The browser app's row is not a tool reaching the office. It is the office's own component
 * speaking, so it may only be filed by a checkout that really is the office: one the process was
 * told about in the environment, or one that carries its own `.env`. A worktree or a check with
 * neither has no world of its own, so there is nothing honest to file.
 *
 * @param {Record<string, string | undefined>} [processEnv]
 * @param {string} [file]
 * @returns {string | null}
 */
export function theApiThisBrowserAppFilesIn(processEnv = process.env, file = ENV_FILE) {
  const namedByTheEnvironment =
    readSettingHere('MOLE_OFFICE_API', processEnv, file).source === 'the environment' ||
    readSettingHere('MOLE_OFFICE_PORT', processEnv, file).source === 'the environment'
  const thisCheckoutsOwnFile = file === resolve(REPO_ROOT, '.env') && existsSync(file)
  if (!namedByTheEnvironment && !thisCheckoutsOwnFile) return null
  return apiAddressForThisProcess(processEnv, file)
}

/**
 * Where the browser app is served under this environment, with no trailing slash.
 * @param {Record<string, string | undefined>} env
 * @returns {string}
 */
export function webAddressFrom(env) {
  const set = readSetting('MOLE_OFFICE_WEB', env)
  if (readingWasSet(set)) return String(set.value).replace(/\/+$/, '')
  return `http://127.0.0.1:${String(portFrom(env, 'MOLE_OFFICE_WEB_PORT'))}`
}

/**
 * THE NAMES THAT MEAN "EVERY ADDRESS THIS COMPUTER HAS", WHICH THIS SETTING MAY NEVER BE.
 *
 * Mole Office has no login. Binding every interface would put a research diary on the house network,
 * the office network and any container bridge, and the person who typed it would have no way to see
 * that it had happened. So the four spellings are refused by name, with the reason, rather than
 * bound and regretted. `0` is Node's own shorthand for `0.0.0.0` and is refused with it.
 */
const EVERY_ADDRESS = new Set(['0.0.0.0', '::', '*', '0'])

/**
 * THE ONE WORD THAT TURNS THIS SETTING OFF FROM THE ENVIRONMENT.
 *
 * Absence is how an installation says "nothing is served to other machines", and absence works
 * until a checkout's own `.env` names an address. From then on every process started from that
 * checkout inherits it — a test's server, a worktree's server, a throwaway stack — because the real
 * environment can override a value in `.env` but cannot take one away. An empty value is refused
 * rather than read as off, on purpose, so there was no way at all to say it.
 *
 * That left criterion R3's last clause unmeetable: *a scratch stack is never reachable from off the
 * machine unless its declaration says so*. Once a person does step 1 of the human act in
 * design/ground/ACCEPTANCE.md section 7 — one line in `.env` — every scratch server anybody starts
 * from that checkout opens a door on that private-network address on whatever port it took, and
 * nothing it can put in its own environment stops it. Measured on 4 September 2026: with that line
 * present, `tests/another-machine-reaches-the-same-world.test.ts` found a server it had started with
 * no address in its environment bound to the checkout's private-network address. Problem
 * `ZYpE5zFO950O`.
 *
 * So `none` is off, said out loud. It is a word rather than a blank because a blank is what an unset
 * variable in a template produces, and the two mean different things: `none` is somebody saying no,
 * and a blank is nobody saying anything.
 *
 * A COMPUTER REALLY CALLED `none` is written `none.` or as its address. This is a setting people
 * type by hand, and one reserved word costs less than having no way to say off.
 */
const OFF = 'none'

/**
 * The name or address other machines reach this computer at, or null because nobody set one.
 *
 * NULL IS THE ORDINARY STATE. Absent means nothing is served to another machine and every listener
 * stays on 127.0.0.1, which is what every installation of Mole Office is doing until somebody
 * decides otherwise.
 *
 * IT IS A HOST AND NOT A URL, and the refusals below are what keep it one. The ports come from
 * `MOLE_OFFICE_PORT` and `MOLE_OFFICE_WEB_PORT`, which are already declared, so a port written here
 * as well would be the same fact in two places — the defect CLAUDE.md names at the top of the file,
 * and the one this whole module exists to remove. `addressesForOtherMachines` below builds the two
 * addresses from this name and those two ports.
 *
 * @param {Record<string, string | undefined>} env
 * @returns {string | null}
 */
export function addressForOtherMachinesFrom(env) {
  const reading = readSetting('MOLE_OFFICE_ADDRESS_FOR_OTHER_MACHINES', env)
  if (reading.value === null) return null
  const host = String(reading.value).trim()
  // `none` IS OFF, AND IT IS THE ONLY WAY TO SAY OFF ONCE A `.env` HAS NAMED AN ADDRESS. See `OFF`
  // above for what it is for and what it cost not to have.
  if (host === OFF) return null
  if (EVERY_ADDRESS.has(host)) {
    throw new Error(
      `MOLE_OFFICE_ADDRESS_FOR_OTHER_MACHINES is "${host}", which means every address this computer has. ` +
        'Mole Office has no login, so it will not listen on all of them: that would put this research diary on ' +
        'your house network and on any container bridge. Write the one name or address your other machines ' +
        'reach this computer at.',
    )
  }
  if (host.includes('://')) {
    throw new Error(
      `MOLE_OFFICE_ADDRESS_FOR_OTHER_MACHINES is "${host}", which is a whole address. Write only the name or the ` +
        'number — the ports come from MOLE_OFFICE_PORT and MOLE_OFFICE_WEB_PORT, and writing one here as well ' +
        'would be two places that can disagree.',
    )
  }
  // A colon in a bare host is either a port somebody added or an IPv6 address, and the two are told
  // apart by the brackets IPv6 wants in a URL. An IPv6 address is written [fd7a:...] here.
  if (host.includes(':') && !host.startsWith('[')) {
    throw new Error(
      `MOLE_OFFICE_ADDRESS_FOR_OTHER_MACHINES is "${host}". If that is a port, take it off: the ports come from ` +
        'MOLE_OFFICE_PORT and MOLE_OFFICE_WEB_PORT. If it is an IPv6 address, write it in square brackets.',
    )
  }
  return host
}

/**
 * Where the API and the browser app answer for another machine, or null because nobody set an
 * address for one.
 *
 * BOTH ARE DERIVED, on purpose, from the one name above and the two ports already declared. The
 * 28 August 2026 fault this file records — the port moved and the address did not — is the same
 * fault waiting to happen twice more here, and deriving them is the same fix.
 *
 * @param {Record<string, string | undefined>} env
 * @returns {{ host: string, apiAddress: string, webAddress: string } | null}
 */
export function addressesForOtherMachines(env) {
  const host = addressForOtherMachinesFrom(env)
  if (host === null) return null
  return {
    host,
    apiAddress: `http://${host}:${String(portFrom(env, 'MOLE_OFFICE_PORT'))}`,
    webAddress: `http://${host}:${String(portFrom(env, 'MOLE_OFFICE_WEB_PORT'))}`,
  }
}

/**
 * EVERY ORIGIN A PAGE OF THIS INSTALLATION CAN HONESTLY BE ON.
 *
 * A browser calls two addresses different origins whenever the host TEXT differs, even when both
 * name this computer. So `127.0.0.1` and `localhost` are two origins, and each of the two ports is
 * another — four of them before anything is served to another machine. Both spellings are needed and
 * both are used: Vite prints the `localhost` one and `.env` declares the `127.0.0.1` one.
 *
 * WHY THE API'S OWN ADDRESS IS IN THE LIST. In a build, the API process serves the browser app
 * itself, so the page is on the API's origin. Leaving it out would refuse the production arrangement.
 *
 * WHAT IT IS FOR. The private sandbox login doors take only these as a page's origin
 * (src/server/api/sandbox-logins.ts). Which origins the API answers at all is decided by the Origin
 * check in src/server/lib/an-origin-that-is-not-this-office.ts, from the names the Host check takes,
 * since SEC-2. Before that the API answered a page on one of these, and on any port of loopback.
 *
 * IT IS HERE RATHER THAN BESIDE THE CORS REGISTRATION because every value in it is already declared
 * in this file, and because `src/server/index.ts` opens the database when it is imported — so a
 * reader that only wants this list would have had to take the database with it.
 *
 * @param {Settings} resolved
 * @returns {string[]}
 */
export function originsAPageMayBeOn(resolved) {
  const declared = [...bothSpellings(resolved.webPort), ...bothSpellings(resolved.apiPort)]
  if (resolved.otherMachines !== null) {
    declared.push(resolved.otherMachines.webAddress, resolved.otherMachines.apiAddress)
  }
  return [...new Set(declared)]
}

/**
 * THE ORIGINS THE DEV SERVER SERVES THE BROWSER APP ON: the web port in both spellings, and the address for other
 * machines' web port when one is declared, because Vite opens a door there too. Read only when this process is not
 * production: by the Origin check (src/server/lib/an-origin-that-is-not-this-office.ts), which takes these as this
 * office's own, and by a press that gives a browser a key (src/server/lib/a-press-another-site-sent.ts).
 *
 * @param {Settings} resolved
 * @returns {string[]}
 */
export function theDevServersOrigins(resolved) {
  const origins = bothSpellings(resolved.webPort)
  if (resolved.otherMachines !== null) origins.push(resolved.otherMachines.webAddress)
  return [...new Set(origins)]
}

/**
 * One port on this computer, in the two spellings a browser calls two origins.
 *
 * @param {number} port
 * @returns {string[]}
 */
function bothSpellings(port) {
  return [`http://127.0.0.1:${String(port)}`, `http://localhost:${String(port)}`]
}

/**
 * Everything the server, Vite, the tools and the tests need, resolved together.
 *
 * @typedef {object} Settings
 * @property {(typeof START_MODES)[number]} startMode How the server starts.
 * @property {number} apiPort The port the API listens on.
 * @property {number} webPort The port the browser app is served on in development.
 * @property {string} apiAddress Where the API answers, with no trailing slash.
 * @property {string} webAddress Where the browser app is served, with no trailing slash.
 * @property {string} databasePath The database file, absolute.
 * @property {string} keysPath The office's own key file, beside the database, absolute.
 * @property {string} backupsDirectory The folder backups of the database are written to, absolute.
 * @property {string} serviceLockPath The service lock of the database, beside it, absolute.
 * @property {string} serviceLogPath Where a service the `mole-office` command starts writes its output, absolute.
 * @property {string} seedCorpus The corpus file `npm run db:seed` writes, absolute.
 * @property {string} viteCacheDir Where Vite keeps its pre-bundled dependencies, absolute.
 * @property {string} workspace The project a command-line tool works in.
 * @property {{ host: string, apiAddress: string, webAddress: string } | null} otherMachines The
 *   name other machines reach this computer at and the two addresses derived from it, or null
 *   because nobody set one and nothing is served to another machine.
 * @property {Record<string, SettingSource>} sources Where each of the above came from.
 * @property {{ path: string, found: boolean }} envFile The `.env` this read looked at, and whether
 *   it was there.
 */

/**
 * The seven values named in criterion G1, resolved from one environment.
 *
 * `apiAddress` and `webAddress` are DERIVED from the ports when nobody sets them, which is the one
 * behaviour change this file makes. `.env.example` used to say "IF YOU MOVE THE API OFF 8787, SET
 * THIS TOO. Nothing derives one from the other" — and the day the owner moved the port, nothing
 * did, and the session hook filed into whatever answered on the old one. Deriving it is the fix:
 * moving the port moves the address, and setting the address explicitly still wins.
 */
/**
 * @param {Record<string, string | undefined>} env
 * @param {{ path: string, found: boolean }} [envFileState]
 * @returns {Settings}
 */
export function settingsFrom(env, envFileState = { path: ENV_FILE, found: existsSync(ENV_FILE) }) {
  const apiPort = portFrom(env, 'MOLE_OFFICE_PORT')
  const webPort = portFrom(env, 'MOLE_OFFICE_WEB_PORT')
  return {
    startMode: startModeFrom(env),
    apiPort,
    webPort,
    apiAddress: apiAddressFrom(env),
    webAddress: webAddressFrom(env),
    databasePath: databasePathFrom(env),
    keysPath: keysPathFrom(env),
    backupsDirectory: backupsDirectoryFrom(env),
    serviceLockPath: serviceLockPathFrom(env),
    serviceLogPath: serviceLogPathFrom(env),
    seedCorpus: seedCorpusPathFrom(env),
    viteCacheDir: viteCacheDirFrom(env),
    workspace: workspaceFrom(env),
    otherMachines: addressesForOtherMachines(env),
    sources: {
      MOLE_OFFICE_ADDRESS_FOR_OTHER_MACHINES: readSetting('MOLE_OFFICE_ADDRESS_FOR_OTHER_MACHINES', env).source,
      MOLE_OFFICE_PORT: readSetting('MOLE_OFFICE_PORT', env).source,
      MOLE_OFFICE_WEB_PORT: readSetting('MOLE_OFFICE_WEB_PORT', env).source,
      MOLE_OFFICE_API: readSetting('MOLE_OFFICE_API', env).source,
      MOLE_OFFICE_WEB: readSetting('MOLE_OFFICE_WEB', env).source,
      MOLE_OFFICE_DB: readSetting('MOLE_OFFICE_DB', env).source,
      MOLE_OFFICE_VITE_CACHE: readSetting('MOLE_OFFICE_VITE_CACHE', env).source,
      MOLE_OFFICE_WORKSPACE: readSetting('MOLE_OFFICE_WORKSPACE', env).source,
    },
    envFile: envFileState,
  }
}

/**
 * The settings this process is running under: `.env` under the real environment.
 *
 * Nothing is cached. Reading `.env` is one small file read, and a cached answer is a fact that goes
 * stale without saying so — which is the whole subject of the criterion this file was written for.
 */
/**
 * @param {Record<string, string | undefined>} [processEnv]
 * @param {string} [file]
 * @returns {Settings}
 */
export function settings(processEnv = process.env, file = ENV_FILE) {
  // These are bootstrap locations and identity, not runtime controls. A path read must still work
  // before migrations, or when a backup check is explaining an unreadable database.
  const merged = bootstrapEnvironment(processEnv, file)
  const resolved = settingsFrom(merged, { path: file, found: existsSync(file) })
  // Keep the source alongside every resolved value.
  /** @type {Record<string, SettingSource>} */
  const sources = {}
  for (const [name, source] of Object.entries(resolved.sources)) {
    sources[name] = source === 'the environment' ? whichLayerSetIt(name, processEnv, file) : /** @type {SettingSource} */ (source)
  }
  return { ...resolved, sources }
}

/**
 * The raw text of any declared setting, for the readers that do their own checking.
 *
 * The duration thresholds, the lock paths and the preview roots each have refusal rules of their
 * own that belong with the code that uses them. What they may not have is their own idea of the
 * setting's NAME or its DEFAULT, which is what this hands them.
 */
/**
 * @param {string} name
 * @param {Record<string, string | undefined>} [processEnv]
 * @param {string} [file]
 * @returns {string | null}
 */
export function settingValue(name, processEnv = process.env, file = ENV_FILE) {
  const reading = readSettingHere(name, processEnv, file)
  if (reading.source === 'not read') throw new Error(notReadRefusal(name, reading.why))
  return reading.value
}

/** The office reads its saved choice first. Any other environment is read alone and opens no database.
 * @param {string} id
 * @param {Record<string, string | undefined>} [env]
 */
export function gatePosition(id, env) {
  const row = gateNamed(id)
  if (env === undefined || env === process.env) return settingValue(row.setting)
  const reading = readSetting(row.setting, env)
  if (reading.source === 'not read') throw new Error(notReadRefusal(row.setting, reading.why))
  return reading.value
}

/**
 * A NUMBER GATE'S NUMBER, read as gatePosition reads it. A value its row does not allow is refused and named, and no
 * other number is used in its place: the settings door refuses such a value, but `.env` and the environment are not
 * checked on the way in.
 * @param {string} id
 * @param {Record<string, string | undefined>} [env]
 * @returns {number}
 */
export function gateNumber(id, env) {
  const row = gateNamed(id)
  if (row.positions.kind !== 'number') throw new Error(`The gate "${id}" is not a number, so it has no number to read.`)
  const value = gatePosition(id, env)
  if (value === null || !gateValueIsAllowed(row, value)) {
    throw new Error(`${row.setting} is ${JSON.stringify(value)}, and it has to be a whole number from ${row.positions.fewest} to ${row.positions.most}. No other number was used in its place.`)
  }
  return Number(value)
}

/** The commit authors that count as the operations agent for tests/moved/whose-file.ts, in the order named; none when
 * the setting is unset or empty. Nobody stands in for them.
 * @param {Record<string, string | undefined>} [env]
 * @returns {string[]}
 */
export function operationsListKeepers(env) {
  const value = env === undefined ? settingValue('MOLE_OFFICE_OPERATIONS_LIST_KEEPERS') : readSetting('MOLE_OFFICE_OPERATIONS_LIST_KEEPERS', env).value
  return (value ?? '').split(',').map((one) => one.trim()).filter((one) => one !== '')
}

/** A reader that could not read a setting says which and why, and takes no other value in its place.
 * @param {string} name
 * @param {string | undefined} why
 */
function notReadRefusal(name, why) {
  return `${name} was not read, and no other value was used in its place. ${why ?? 'Nobody recorded why.'}`
}

/**
 * WHETHER SOMEBODY SET A READING, in any layer, as opposed to its falling back. An environment made by
 * `bootstrapEnvironment` or `mergedEnvironment` keeps the layer of each value, so `readSetting` may say `.env` or
 * `the office database` for a value that was set; asking whether the source is `the environment` passes those over.
 * @param {Reading} reading
 * @returns {boolean}
 */
export function readingWasSet(reading) {
  if (reading.source === 'not read') throw new Error(notReadRefusal(reading.setting.name, reading.why))
  return reading.source !== 'the built-in default' && reading.source !== 'nothing set it'
}

/** Whether a declared setting was set by somebody, as opposed to falling back. */
/**
 * @param {string} name
 * @param {Record<string, string | undefined>} [processEnv]
 * @param {string} [file]
 * @returns {boolean}
 */
export function settingWasSet(name, processEnv = process.env, file = ENV_FILE) {
  return readingWasSet(readSettingHere(name, processEnv, file))
}

/** Transient tool identity comes only from this process, never from the declaration file.
 * @param {Record<string, string | undefined>} environment
 */
export function transientToolContext(environment = process.env) {
  return {
    session: environment.MOLE_OFFICE_SESSION,
    checkWorktrees: environment.MOLE_OFFICE_CHECK_WORKTREES,
  }
}

/**
 * The loaded install's commit, from the same Git reader ordinary runtime uses or the bundle stamp.
 * @returns {{ commit: string, repository: string }}
 */
export function theServingInstall() {
  const repository = realpathSync(REPO_ROOT)
  const gaps = /** @type {string[]} */ ([])
  const dirs = THE_INSTALL.from === 'checkout' ? gitDirsOf(repository) : null
  const commit = THE_INSTALL.from === 'bundle'
    ? THE_INSTALL.build.commit
    : dirs === null ? null : headFromGitDirs(dirs, repository, gaps)?.full ?? null
  if (commit === null || !/^[0-9a-f]{40}$/.test(commit)) {
    throw new Error(`The serving commit in ${repository} cannot be verified. ${gaps.join('; ')} Nothing was started.`)
  }
  return { commit, repository }
}

/** Values in the shipped description, taken from the same limits and folders the consumers read.
 * @param {string} name
 * @returns {Record<string, string | number>}
 */
export function settingWordValues(name) {
  if (name === 'MOLE_OFFICE_BUS_MOST_ENTRIES') return { fewest: BUS_ENTRIES_BOUNDS.fewest, most: BUS_ENTRIES_BOUNDS.most, shipped: BUS_ENTRIES_FALLBACK }
  if (name === 'MOLE_OFFICE_MERGE_WORKERS') return { fewest: MERGE_WORKERS_BOUNDS.fewest, most: MERGE_WORKERS_BOUNDS.most }
  if (name === 'MOLE_OFFICE_SERVER_HEAP_MB') return { fewest: SERVER_HEAP_MB_BOUNDS.fewest, most: SERVER_HEAP_MB_BOUNDS.most }
  const gate = gateForSetting(name)
  if (gate?.positions.kind === 'number') return { fewest: gate.positions.fewest, most: gate.positions.most }
  if (name === 'MOLE_OFFICE_MODAL_MONTHLY_CAP_USD') return { shipped: MODAL_MONTHLY_CAP_USD }
  if (name === 'MOLE_OFFICE_MODAL_TOKEN_FILE' || name === 'MOLE_OFFICE_MODAL_PYTHON') return { folder: MODAL_FOLDER }
  return {}
}
/** @param {string} name */
function shippedSettingDescription(name) {
  const values = settingWordValues(name)
  return SETTING_WORDS[name].replace(/\{(\w+)\}/g, (_, key) => String(values[key]))
}

/** The folder measurement clock; an explicit environment lets a test assert the shipped limit.
 * @param {Record<string, string | undefined>} [env]
 */
export function sandboxFolderMeasurementMilliseconds(env) {
  const value = env === undefined ? settingValue('MOLE_OFFICE_TEST_FOLDER_LIMIT_MS') : readSetting('MOLE_OFFICE_TEST_FOLDER_LIMIT_MS', env).value
  return Number(value ?? 30_000)
}

/** The agents sizes --tell warns, in the order named; none when the setting is unset or empty. Nobody stands in for them.
 * @param {Record<string, string | undefined>} [env]
 * @returns {string[]}
 */
export function sandboxDiskWatchers(env) {
  const value = env === undefined ? settingValue('MOLE_OFFICE_SANDBOX_DISK_WATCHERS') : readSetting('MOLE_OFFICE_SANDBOX_DISK_WATCHERS', env).value
  return (value ?? '').split(',').map((one) => one.trim()).filter((one) => one !== '')
}
