// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * THE USER'S OWN PATH: READ ONCE AT EACH START OF THE SERVER, AND JOINED AFTER THE OFFICE'S OWN.
 *
 * ---------------------------------------------------------------------------------------------
 * WHY
 * ---------------------------------------------------------------------------------------------
 *
 * A server has the PATH of whatever started it: the desktop app, a start-at-login unit, a terminal. A tool the user
 * installed into a folder that only their own shell adds to PATH was not on that PATH, so every terminal and worker of
 * the office could not run it, and the terminal page said it was not installed while the user's own terminal ran it.
 * A start-at-login unit also kept, for good, the PATH its press had.
 *
 * ---------------------------------------------------------------------------------------------
 * WHAT IT DOES
 * ---------------------------------------------------------------------------------------------
 *
 * The server's start reads the user's PATH once, before anything starts a terminal or a worker or looks up a program,
 * and puts the joined PATH in its own environment (`giveTheOfficeTheUsersPath`, called by src/server/index.ts). Nothing
 * else needs to change for terminals and workers to get it: a terminal's environment is copied from the server's at
 * the moment it opens (`theEnvironmentATerminalGets` in src/server/lib/terminals.ts), and the message worker is started
 * with a copy of the server's (src/server/lib/resources.ts), which every worker run is given in turn.
 *
 *   - ON LINUX AND THE MAC the login shell the password entry names is run as a login shell, not an interactive one,
 *     with its standard input from /dev/null and in a process group of its own. It prints PATH between two markers
 *     made new at each read, and only what is between them is taken, so a line a startup file prints is never read as
 *     PATH. `printenv` is a program and not a word of one shell, so the one command works in bash, zsh and fish.
 *   - ON WINDOWS the machine's Path and the user's are read from the registry by the system's own PowerShell, in that
 *     order, as Windows joins them, and each %NAME% is expanded from the office's environment. No shell is run.
 *
 * THE JOIN keeps the office's own entries first and in their order, and adds each of the user's after them. So a
 * different node earlier on the user's PATH does not change the program the office's workers run.
 *
 * WHAT A SERVER HANDS ON IS THE OFFICE'S OWN PATH, never the joined one (`theOfficesOwnSearchPathIn`): the
 * start-at-login unit, the restart and the data-folder mover. The server they start reads the user's PATH again itself.
 *
 * ---------------------------------------------------------------------------------------------
 * WHAT IS NOT READ, AND SAYS SO
 * ---------------------------------------------------------------------------------------------
 *
 * A server in a sandbox keeps its container's PATH and starts no shell. A server a test started runs no login shell,
 * because a test server must never run the startup files of the user's real home. A shell that is not named, cannot be
 * started, does not answer in time or ends without the markers, and a registry that cannot be read, each leave the
 * office's own PATH as it was. The start's log says which, and so does GET /api/harnesses.
 *
 * A LOGIN SHELL THAT IS NOT INTERACTIVE READS THE LOGIN FILES ONLY: .profile, .bash_profile, .zprofile, and fish's
 * config, which fish reads in every shell. A folder put on PATH only in .bashrc or .zshrc is not found, unless a login
 * file reads that file.
 *
 * IT HAS NOT RUN ON WINDOWS OR ON A MAC. It is read on Linux, with made-up shells and a made-up registry reader, in tests
 * named for what each proves: tests/made-up-login-shells.ts lists those of the login shell, and
 * tests/the-users-path-on-windows-is-read-from-the-registry.test.ts is the registry's.
 */

import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { userInfo } from 'node:os'
import { theSandboxIn } from './run-permissions.mjs'
import { theSystemFor } from './systems/the-system.mjs'
import { thePowerShellArguments, thePowerShellProgram } from './systems/windows-commands.mjs'

/**
 * HOW LONG A START WAITS FOR THE USER'S PATH: five seconds, for the login shell and for PowerShell alike.
 *
 * A login shell answers in well under a second, startup files included, and PowerShell takes about a second on Windows
 * 11 (./systems/windows-commands.mjs). Five seconds is several times both, so a slow first start after a login is still
 * read. It is also short, because nothing is served while a start waits: a shell that never answers costs each start
 * five seconds, and then it is stopped and the log says so. A Mac startup file that calls git or python3 with no
 * developer tools installed opens Apple's install dialog, and the shell is stopped at the bound and not waited on.
 */
export const THE_LONGEST_THE_USERS_PATH_IS_WAITED_FOR_MS = 5_000

/**
 * WHY THE USER'S PATH WAS NOT READ, as a short code.
 *   noLoginShell            the password entry names no login shell
 *   noAnswerInTime          the shell, or PowerShell reading the registry, had not ended within the bound
 *   noMarkers               the shell ended without printing PATH between the two markers
 *   couldNotStart           the shell could not be started
 *   registryUnreadable      PowerShell could not read the registry, or answered what is not the two Paths
 *   inASandbox              this server runs in a sandbox, and keeps its container's PATH
 *   aTestStartedThisServer  a test started this server, and it runs no shell of the user's real home
 * @typedef {'noLoginShell' | 'noAnswerInTime' | 'noMarkers' | 'couldNotStart' | 'registryUnreadable' | 'inASandbox' | 'aTestStartedThisServer'} WhyTheUsersPathWasNotRead
 */

/**
 * ONE READING OF THE USER'S PATH: the entries and where they came from, or the code and one sentence that say why it
 * was not read. `shell` is the login shell's program, and null for the registry or where no shell was named.
 * @typedef {{ read: true, from: 'loginShell', shell: string, entries: string[] }
 *   | { read: true, from: 'registry', shell: null, entries: string[] }
 *   | { read: false, from: 'loginShell' | 'registry' | null, shell: string | null, code: WhyTheUsersPathWasNotRead, says: string }} TheUsersPathReading
 */

/**
 * WHAT THE REGISTRY HOLDS: the machine's Path and the user's, each as it is stored, with its %NAME% not expanded, and
 * null where there is none. A reader that could not read says why, and whether it ran out of time.
 * @typedef {{ read: true, machine: string | null, user: string | null } | { read: false, outOfTime: boolean, why: string }} WhatTheRegistryHolds
 */

/** @typedef {(longestMs: number) => Promise<WhatTheRegistryHolds>} AReaderOfTheRegistry */

/**
 * The user's PATH as one start read it: the reading, the office's own PATH as the server was started with it, the PATH
 * it gave itself, or null where it read nothing and kept its own, and how many of the user's entries were added.
 * @typedef {{ reading: TheUsersPathReading, own: string | undefined, joined: string | null, added: number }} TheUsersPathAtAStart
 */

/**
 * The reading as GET /api/harnesses answers it, beside the tools. It names no entry. `notReadAtThisStart` is a server
 * whose start did not run, as an app a test builds.
 * @typedef {{ read: true, from: 'loginShell' | 'registry', shell: string | null, added: number }
 *   | { read: false, from: 'loginShell' | 'registry' | null, shell: string | null, code: WhyTheUsersPathWasNotRead | 'notReadAtThisStart', says: string }} TheUsersPathAsTheDoorSaysIt
 */

/** What this process's start read, or null where its start did not read it. */
/** @type {TheUsersPathAtAStart | null} */
let atThisStart = null

/**
 * GIVE THIS SERVER THE USER'S PATH, once at its start: read it, and put the joined PATH in `env`, which is this
 * process's own environment unless a test hands in another. Where it is not read, `env` is left as it was.
 *
 * `shellEnvironment` is the environment the login shell is started with: the start gives it the one a terminal gets,
 * which holds none of the server's keys. `aTestStartedThis` is the start's own answer to whether a test started it.
 * @param {{
 *   aTestStartedThis: boolean,
 *   env?: Record<string, string | undefined>,
 *   platform?: string,
 *   shell?: string | null,
 *   shellEnvironment?: Record<string, string | undefined>,
 *   readTheRegistry?: AReaderOfTheRegistry,
 *   longestMs?: number,
 * }} how
 * @returns {Promise<TheUsersPathAtAStart>}
 */
export async function giveTheOfficeTheUsersPath(how) {
  const env = how.env ?? process.env
  const platform = how.platform ?? process.platform
  const own = theSystemFor(platform).theSearchPathIn(env)
  /** @type {TheUsersPathReading} */
  const reading =
    theSandboxIn(env) !== null
      ? notRead(null, null, 'inASandbox', "This server runs in a sandbox, so it keeps the sandbox's PATH and started no shell.")
      : how.aTestStartedThis
        ? notRead(null, null, 'aTestStartedThisServer', 'A test started this server, so it runs no login shell and keeps the PATH it was started with.')
        : await readTheUsersPath({ ...how, platform, expandFrom: env })
  if (!reading.read) {
    atThisStart = { reading, own, joined: null, added: 0 }
    return atThisStart
  }
  const { joined, added } = theJoinedSearchPath(own ?? '', reading.entries, platform)
  env[theNameOfTheSearchPath(env, platform)] = joined
  atThisStart = { reading, own, joined, added }
  return atThisStart
}

/**
 * READ THE USER'S PATH ONCE, and change nothing. Each way the reading can fail is answered as not read, with its code
 * and a sentence; nothing here throws for a PATH that could not be read.
 *
 * `shell` is the login shell to run, read from the password entry where it is not given. `expandFrom` is the
 * environment a Windows %NAME% is expanded from.
 * @param {{
 *   platform?: string,
 *   shell?: string | null,
 *   shellEnvironment?: Record<string, string | undefined>,
 *   expandFrom?: Record<string, string | undefined>,
 *   readTheRegistry?: AReaderOfTheRegistry,
 *   longestMs?: number,
 * }} [how]
 * @returns {Promise<TheUsersPathReading>}
 */
export async function readTheUsersPath(how = {}) {
  const platform = how.platform ?? process.platform
  const longestMs = how.longestMs ?? THE_LONGEST_THE_USERS_PATH_IS_WAITED_FOR_MS
  if (platform === 'win32') return readTheRegistryPath(how.readTheRegistry ?? readTheRegistryWithPowerShell, how.expandFrom ?? process.env, longestMs)
  const shell = how.shell === undefined ? theLoginShellNamed() : how.shell
  if (shell === null || shell === '') {
    return notRead('loginShell', null, 'noLoginShell', "This user's password entry names no login shell, so no shell was started.")
  }
  return readTheLoginShell(shell, how.shellEnvironment ?? {}, longestMs, theSystemFor(platform))
}

/**
 * THE JOINED PATH: the office's own entries first, in their order, then each of the user's that is not already there,
 * in the user's order. An empty entry is dropped, and so is an entry that names a folder already there: on Windows when
 * Windows would find the same folder by it (`theFolderAnEntryNames`), and on Linux and the Mac when it is written the
 * same. The user's entries never replace an entry of the office's or come before one.
 * @param {string} own the office's own PATH
 * @param {readonly string[]} theUsers the user's entries, in order
 * @param {string} platform a value of `process.platform`
 * @returns {{ joined: string, added: number }} `added` counts the user's entries that were added
 */
export function theJoinedSearchPath(own, theUsers, platform) {
  const separator = platform === 'win32' ? ';' : ':'
  /** @type {string[]} */
  const entries = []
  const there = new Set()
  /** @param {string} entry */
  const add = (entry) => {
    const folder = theFolderAnEntryNames(entry, platform)
    if (entry === '' || there.has(folder)) return false
    there.add(folder)
    entries.push(entry)
    return true
  }
  for (const entry of own.split(separator)) add(entry)
  let added = 0
  for (const entry of theUsers) if (add(entry)) added += 1
  return { joined: entries.join(separator), added }
}

/**
 * EACH %NAME% EXPANDED AS WINDOWS EXPANDS A PATH IT READS FROM THE REGISTRY: by the value `env` holds under that name,
 * in any case, and left as it is written where `env` holds no such name.
 * @param {string} written
 * @param {Record<string, string | undefined>} env
 * @returns {string}
 */
export function expandedAsWindowsDoes(written, env) {
  return written.replace(/%([^%]+)%/gu, (whole, /** @type {string} */ name) => {
    const found = Object.keys(env).find((one) => one.toLowerCase() === name.toLowerCase() && env[one] !== undefined)
    return found === undefined ? whole : String(env[found])
  })
}

/**
 * THE OFFICE'S OWN PATH IN AN ENVIRONMENT: the PATH this server was started with, where `env` holds the joined PATH
 * this start gave it, and the PATH `env` holds otherwise. What a server hands on as its own reads it here: the
 * start-at-login unit (./start-at-login.mjs), the restart and the data-folder mover.
 * @param {Record<string, string | undefined>} [env]
 * @param {string} [platform] a value of `process.platform`
 * @returns {string | undefined}
 */
export function theOfficesOwnSearchPathIn(env = process.env, platform = process.platform) {
  const path = theSystemFor(platform).theSearchPathIn(env)
  return atThisStart !== null && atThisStart.joined !== null && path === atThisStart.joined ? atThisStart.own : path
}

/**
 * A COPY OF `env` WITH THE OFFICE'S OWN PATH in place of the joined one, or `env` itself where it holds no PATH this
 * start joined. The restart and the data-folder mover hand it to the office they start.
 * @param {Record<string, string | undefined>} env
 * @param {string} [platform] a value of `process.platform`
 * @returns {Record<string, string | undefined>}
 */
export function withTheOfficesOwnSearchPath(env, platform = process.platform) {
  const own = theOfficesOwnSearchPathIn(env, platform)
  if (own === theSystemFor(platform).theSearchPathIn(env)) return env
  const copy = { ...env }
  const name = theNameOfTheSearchPath(copy, platform)
  if (own === undefined) delete copy[name]
  else copy[name] = own
  return copy
}

/**
 * The user's PATH as GET /api/harnesses answers it: read or not, from where, and when not read, the code and the
 * sentence. It names no entry.
 * @returns {TheUsersPathAsTheDoorSaysIt}
 */
export function theUsersPathAsTheDoorSaysIt() {
  if (atThisStart === null) {
    return { read: false, from: null, shell: null, code: 'notReadAtThisStart', says: "This server's start did not run, so it has not read the user's PATH." }
  }
  const { reading, added } = atThisStart
  return reading.read
    ? { read: true, from: reading.from, shell: reading.shell, added }
    : { read: false, from: reading.from, shell: reading.shell, code: reading.code, says: reading.says }
}

/**
 * THE START'S ONE LINE ABOUT THE USER'S PATH: how many entries were added when it was read, and the code and the
 * reason when it was not. It names no entry.
 * @param {TheUsersPathAtAStart} at
 * @returns {string}
 */
export function theLineThatSaysTheUsersPath(at) {
  const { reading, added } = at
  if (!reading.read) return `The user's PATH was not read (${reading.code}). ${reading.says} The office keeps its own PATH.`
  const where = reading.from === 'loginShell' ? `the login shell ${reading.shell}` : 'the registry'
  return `The user's PATH was read from ${where}, and ${String(added)} ${added === 1 ? 'entry was' : 'entries were'} added after the office's own.`
}

// ============================================================ the parts

/**
 * @param {'loginShell' | 'registry' | null} from
 * @param {string | null} shell
 * @param {WhyTheUsersPathWasNotRead} code
 * @param {string} says
 * @returns {TheUsersPathReading}
 */
function notRead(from, shell, code, says) {
  return { read: false, from, shell, code, says }
}

/** @param {number} ms */
function inSeconds(ms) {
  return `${String(ms / 1000)} seconds`
}

/**
 * The login shell the password entry names, or null where it names none. A user with no password entry, as in a
 * container started under a number the system does not list, names none either.
 * @returns {string | null}
 */
function theLoginShellNamed() {
  try {
    return userInfo().shell
  } catch (e) {
    if (/** @type {NodeJS.ErrnoException} */ (e).code === 'ENOENT') return null
    throw e
  }
}

/**
 * The name `env` holds its search path under: PATH on Linux and the Mac, and on Windows the spelling it is held in,
 * or Path where there is none.
 * @param {Record<string, string | undefined>} env
 * @param {string} platform
 * @returns {string}
 */
function theNameOfTheSearchPath(env, platform) {
  if (platform !== 'win32') return 'PATH'
  return Object.keys(env).find((name) => name.toLowerCase() === 'path' && env[name] !== undefined) ?? 'Path'
}

/**
 * THE FOLDER AN ENTRY NAMES, as the join compares entries. On Windows case is ignored, / and \ are one separator, and
 * separators at the end are left out, except after a drive's colon, where `C:\` is the drive's root and `C:` is the
 * folder that drive is in now. On Linux and the Mac the entry is compared as it is written.
 * @param {string} entry
 * @param {string} platform
 * @returns {string}
 */
function theFolderAnEntryNames(entry, platform) {
  if (platform !== 'win32') return entry
  const one = entry.replace(/\//gu, '\\').toLowerCase()
  const trimmed = one.replace(/\\+$/u, '')
  return /^[a-z]:$/u.test(trimmed) && trimmed !== one ? `${trimmed}\\` : trimmed
}

/**
 * RUN THE LOGIN SHELL ONCE and take what it prints between the two markers. Its standard input is /dev/null, so a
 * startup file that reads it ends at once, and its errors are not read. It runs in a process group of its own, so a
 * time-out ends it and everything it started.
 * @param {string} shell
 * @param {Record<string, string | undefined>} env
 * @param {number} longestMs
 * @param {import('./systems/the-system.mjs').ASystem} system
 * @returns {Promise<TheUsersPathReading>}
 */
function readTheLoginShell(shell, env, longestMs, system) {
  const made = randomBytes(8).toString('hex')
  const begins = `mole-office-path-begins-${made}`
  const ends = `mole-office-path-ends-${made}`
  return new Promise((answer) => {
    /** @type {TheUsersPathReading | null} */
    let answered = null
    const say = (/** @type {TheUsersPathReading} */ reading) => {
      if (answered !== null) return
      answered = reading
      clearTimeout(timer)
      answer(reading)
    }
    const how = system.groups.howToStartInItsOwnGroup({
      command: shell,
      args: ['-l', '-c', `echo ${begins}; printenv PATH; echo ${ends}`],
      windowsVerbatimArguments: false,
      env,
    })
    const child = spawn(how.command, how.args, {
      env: how.env,
      detached: how.detached,
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: how.windowsHide,
      windowsVerbatimArguments: how.windowsVerbatimArguments,
    })
    /** @type {Buffer[]} */
    const printed = []
    child.stdout?.on('data', (/** @type {Buffer} */ chunk) => printed.push(chunk))
    const timer = setTimeout(() => {
      if (child.pid !== undefined) {
        try {
          system.groups.signal(child.pid, 'SIGKILL')
        } catch (e) {
          // ESRCH: the group ended between the time-out and the signal, so there is nothing left to stop.
          if (/** @type {NodeJS.ErrnoException} */ (e).code !== 'ESRCH') throw e
        }
      }
      child.stdout?.destroy()
      say(notRead('loginShell', shell, 'noAnswerInTime', `The login shell ${shell} had not ended within ${inSeconds(longestMs)}, so it and everything it started were stopped.`))
    }, longestMs)
    child.once('error', (e) => {
      say(notRead('loginShell', shell, 'couldNotStart', `The login shell ${shell} could not be started (${/** @type {NodeJS.ErrnoException} */ (e).code ?? e.message}).`))
    })
    child.once('close', () => {
      const between = theTextBetween(Buffer.concat(printed).toString('utf8'), begins, ends)
      if (between === null) {
        say(notRead('loginShell', shell, 'noMarkers', `The login shell ${shell} ended without printing its PATH between the two markers.`))
        return
      }
      say({ read: true, from: 'loginShell', shell, entries: between.split(':').filter((entry) => entry !== '') })
    })
  })
}

/**
 * What a shell printed between the two markers, or null where either is missing. The first marker counts only where a
 * line ends after it, and the second only where a line ends before it, as `echo` prints them. So a startup file that
 * prints the command the shell was given, markers and all, is not read as the answer, and a line a startup file left
 * unended before the first marker is not either. Nothing between them is a shell with no PATH set.
 * @param {string} printed
 * @param {string} begins
 * @param {string} ends
 * @returns {string | null}
 */
function theTextBetween(printed, begins, ends) {
  const from = printed.indexOf(`${begins}\n`)
  if (from === -1) return null
  const start = from + begins.length + 1
  if (printed.startsWith(ends, start)) return ''
  const to = printed.indexOf(`\n${ends}`, start)
  return to === -1 ? null : printed.slice(start, to)
}

/**
 * READ THE TWO PATHS FROM THE REGISTRY and expand them: the machine's, then the user's, as Windows joins them for a
 * new process. An entry is split from the value after it is expanded, as Windows does.
 * @param {AReaderOfTheRegistry} reader
 * @param {Record<string, string | undefined>} env
 * @param {number} longestMs
 * @returns {Promise<TheUsersPathReading>}
 */
async function readTheRegistryPath(reader, env, longestMs) {
  const holds = await reader(longestMs)
  if (!holds.read) {
    return holds.outOfTime
      ? notRead('registry', null, 'noAnswerInTime', `PowerShell had not read the registry within ${inSeconds(longestMs)}, so it was stopped.`)
      : notRead('registry', null, 'registryUnreadable', `The user's and the machine's Path could not be read from the registry: ${holds.why}`)
  }
  const entries = [holds.machine, holds.user]
    .flatMap((value) => (value === null ? [] : expandedAsWindowsDoes(value, env).split(';')))
    .filter((entry) => entry !== '')
  return { read: true, from: 'registry', shell: null, entries }
}

/**
 * The script that reads the two Paths as they are stored, with no %NAME% expanded, and prints them as one line of
 * JSON. A key or a value that is not there is null.
 */
const THE_REGISTRY_SCRIPT = [
  "$ErrorActionPreference = 'Stop'",
  '$asStored = [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames',
  '$machine = $null',
  '$user = $null',
  "$key = [Microsoft.Win32.Registry]::LocalMachine.OpenSubKey('SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment')",
  "if ($key) { $machine = $key.GetValue('Path', $null, $asStored) }",
  "$key = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey('Environment')",
  "if ($key) { $user = $key.GetValue('Path', $null, $asStored) }",
  'ConvertTo-Json -Compress -InputObject ([ordered]@{ machine = $machine; user = $user })',
].join('\n')

/**
 * THE REAL READER OF THE REGISTRY: the system's own PowerShell, by its whole path, under the bound. It has not run on
 * Windows; the walk on a Windows 11 machine is where it is tried.
 * @type {AReaderOfTheRegistry}
 */
function readTheRegistryWithPowerShell(longestMs) {
  const program = thePowerShellProgram()
  return new Promise((answer) => {
    let answered = false
    const say = (/** @type {WhatTheRegistryHolds} */ holds) => {
      if (answered) return
      answered = true
      clearTimeout(timer)
      answer(holds)
    }
    const child = spawn(program, thePowerShellArguments(THE_REGISTRY_SCRIPT), { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
    /** @type {Buffer[]} */
    const out = []
    /** @type {Buffer[]} */
    const err = []
    child.stdout?.on('data', (/** @type {Buffer} */ chunk) => out.push(chunk))
    child.stderr?.on('data', (/** @type {Buffer} */ chunk) => err.push(chunk))
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      say({ read: false, outOfTime: true, why: `${program} had not ended within ${inSeconds(longestMs)}` })
    }, longestMs)
    child.once('error', (e) => say({ read: false, outOfTime: false, why: `${program} could not be started (${/** @type {NodeJS.ErrnoException} */ (e).code ?? e.message}).` }))
    child.once('close', (status) => {
      const printed = Buffer.concat(out).toString('utf8').trim()
      if (status !== 0) {
        say({ read: false, outOfTime: false, why: `${program} ended with ${String(status)}: ${Buffer.concat(err).toString('utf8').trim().split('\n')[0] ?? ''}` })
        return
      }
      say(theTwoPathsIn(printed, program))
    })
  })
}

/**
 * The two Paths in what the registry script printed, or why it is not them.
 * @param {string} printed
 * @param {string} program
 * @returns {WhatTheRegistryHolds}
 */
function theTwoPathsIn(printed, program) {
  /** @type {unknown} */
  let said
  try {
    said = JSON.parse(printed)
  } catch {
    return { read: false, outOfTime: false, why: `${program} printed what is not JSON.` }
  }
  const field = (/** @type {string} */ name) => (said !== null && typeof said === 'object' ? /** @type {Record<string, unknown>} */ (said)[name] : undefined)
  const machine = field('machine')
  const user = field('user')
  const aPath = (/** @type {unknown} */ value) => value === null || typeof value === 'string'
  if (!aPath(machine) || !aPath(user)) return { read: false, outOfTime: false, why: `${program} printed JSON that is not the two Paths.` }
  return { read: true, machine: /** @type {string | null} */ (machine), user: /** @type {string | null} */ (user) }
}
