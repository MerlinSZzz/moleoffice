// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * ONE INTERFACE PER SYSTEM: WHAT MOLE OFFICE ASKS OF LINUX, THE MAC AND WINDOWS, CHOSEN IN ONE PLACE.
 *
 * ---------------------------------------------------------------------------------------------
 * WHAT IT IS
 * ---------------------------------------------------------------------------------------------
 *
 * Each system Mole Office runs on gets one object with the same pieces. A caller asks `thisSystem()` for the
 * one it runs on, or `theSystemFor(platform)` when a test or a report names another. So a branch on the
 * platform is made here once, and not again at every call site.
 *
 * The pieces so far:
 *   - `processes`: the reader of one process by its number, `theProcessReaderFor` in ../process-reader.mjs;
 *   - `groups.signal(group, signal)`: a signal to a whole process group;
 *   - `groups.gentleStop`: the signal that asks a whole group to stop, or null where there is none;
 *   - `groups.howToStartInItsOwnGroup(way)`: how to start a program as a new group, which a stop then finds;
 *   - `groups.theProgramToStart(command)`: the program such a start names, for a command a caller declares by a word;
 *   - `groups.askToStop(group)`: a request to the program of a group to stop cleanly, refused in words when it fails;
 *   - `groups.listenForAStopRequest(onStop, say)`: how that program hears the request where it is not a signal;
 *   - `groups.jobObjects`: where a group is a Job Object that a starter makes, the group this program was started
 *     in and whether a group holds a process. It is null where the process table says which group a process is in;
 *   - `holderAddress(name, folder)`: where the terminal holder listens, from the name made of the database's path;
 *   - `holderAddressIsAFile`: whether that address is a file in a folder, with a mode, that can be removed from under
 *     the holder;
 *   - `aTerminalIsEndedBy`: how the holder ends one of its terminals, by a signal to its process group or by the pty;
 *   - `theShellVariable`: the variable that names the shell a terminal opens when no command is named;
 *   - `aTerminalIsGiven`: the names of the server's own variables a terminal is given, and the starts of names it is given;
 *   - `whatATerminalStarts(command, args, folder, env)`: what node-pty is handed to open a terminal for a command;
 *   - `aFileIsMadePrivate`: how a file is made one that only this user may read and write;
 *   - `aFolderIsLinkedBy`: what a link to a folder is made as;
 *   - `anInstallerMade(folder, aFileInIt)`: which installer made a folder, asked of the installer by a promise (./the-installer-of-a-folder.mjs);
 *   - `theSearchPathIn(env)`: the search path of an environment, which every program lookup in src/ reads through it.
 *
 * ---------------------------------------------------------------------------------------------
 * WHAT EACH SYSTEM DOES
 * ---------------------------------------------------------------------------------------------
 *
 * Linux and the Mac signal a group as `process.kill(-group, signal)` (./posix-groups.mjs), and the holder listens
 * on a socket file in its folder. What `process.kill` throws is thrown back as it is, so each caller keeps its own
 * handling of ESRCH and EPERM. A group is started by Node's `detached: true`, and its gentle stop is SIGTERM. The
 * holder ends a terminal by SIGHUP to the terminal's process group, and a terminal opens $SHELL.
 *
 * Windows has no process groups. Its group is the Job Object the group runs in (./windows-groups.mjs), which can be
 * asked whether it holds a process, and can end every process in it at once. Any other signal is refused in words,
 * so there is no gentle stop. A group is started by a starter that makes the Job Object and starts the program in
 * it (./windows-starts.mjs). Its holder listens on a named pipe, and the folder is not part of the address. A pipe has
 * no folder to make and no mode to set, and it is gone only when the holder stops listening. A terminal there runs in
 * a pseudo console (ConPTY), which has no process group, so the holder ends it by the pty, and a terminal opens
 * %ComSpec%. Windows reads processes with PowerShell (./windows-processes.mjs).
 * A COMMAND A TERMINAL IS ASKED FOR. On Linux and the Mac node-pty is handed it as it was asked, and finds a bare name on
 * the PATH itself. On Windows node-pty looks for a bare name with no ending, so it never finds "ping" or claude.cmd.
 * There the command is found first, in the terminal's PATH with each ending its PATHEXT names, and a .cmd runs through
 * %ComSpec% (./a-named-command-on-windows.mjs).
 * A PRIVATE FILE. On Linux and the Mac a key file is made with the mode 0600, and each writer gives it that mode as
 * before. Windows ignores that mode. There a writer makes the file empty, has its access list set to this user's
 * alone and read back (./windows-private-files.mjs), and only then writes the key into it.
 * A LINK TO A FOLDER. Linux and the Mac make a symbolic link. Windows makes a symbolic link only for an administrator
 * or in developer mode, so there it is a directory junction, which any user may make.
 * WHICH INSTALLER MADE A FOLDER. Linux asks dpkg, after it looks for an AppImage's mount; Windows reads this user's list
 * of installed apps; the Mac is not asked yet, and says so.
 *
 * WHICH GROUP A PROCESS IS IN. On Linux and the Mac the process table says it, and a start in a group makes the program
 * the group's leader, so `jobObjects` is null. Windows's process table names no group, and the process a start makes
 * is the starter, not the program. So there `jobObjects` asks Windows whether a Job Object holds a process, and
 * answers the group this program was started in only when the starter's mark and the Job Object both say so.
 *
 * A start in a group on Linux and the Mac names a program as its caller declares it, and a bare word is found on the
 * PATH. On Windows the starter starts a program only by its whole path, so there the bare word `node` is the node this
 * process runs on.
 *
 * An ask to stop on Linux and the Mac is SIGTERM to the group, and the program hears it as SIGTERM. On Windows the
 * program listens on a named pipe named after its group, and the ask writes a line to that pipe and waits for the
 * answer (./windows-groups.mjs).
 *
 * THE SEARCH PATH OF AN ENVIRONMENT. Linux and the Mac read it from `PATH` alone, because a name there is read in its
 * own case, and `Path` is another variable. Windows reads a name in any case, and its window hands the office the
 * search path as `Path`. A plain copy of an environment keeps the spelling it was given, so `PATH` alone finds nothing
 * in it. So on Windows the search path is the value of the one name that is PATH in any case. Two such names with the
 * same value are one search path. Two with different values are refused in a sentence that names both, and nothing is
 * looked up: the office never picks one. Every place in src/ that looks a program up, or reads the search path of an
 * environment, reads it through this piece (tests/the-search-path-is-read-whatever-its-spelling.test.ts).
 *
 * SOME OF THE WINDOWS PIECES HAVE RUN ON A WINDOWS 11 MACHINE, in wave 13t. Each of ./windows-commands.mjs,
 * ./windows-processes.mjs, ./windows-starts.mjs and ./windows-groups.mjs says what of it ran there. They are all read
 * on Linux, with stand-ins for PowerShell (tests/the-windows-side-of-the-system-layer.test.ts,
 * tests/the-start-in-a-group-on-windows.test.ts).
 *
 * It is plain JavaScript, so the terminal holder and the service command, which run on plain node, can import it.
 */

import { join } from 'node:path'
import { howWindowsStartsACommand } from './a-named-command-on-windows.mjs'

import { theProcessReader, theProcessReaderFor } from '../process-reader.mjs'
import { posixGroups } from './posix-groups.mjs'
import { windowsGroups } from './windows-groups.mjs'
import { windowsPrivateFiles } from './windows-private-files.mjs'
import { linuxInstallerMade, noInstallerQuestion, windowsInstallerQuestion } from './the-installer-of-a-folder.mjs'

/**
 * @typedef {import('../process-reader.mjs').ProcessReader} ProcessReader
 */

/**
 * How a program is to be started, before it is put in a group: what `theWayToStart` in ../runtimes.mjs answers,
 * and the environment it is given (undefined is this process's own).
 * @typedef {{
 *   command: string,
 *   args: readonly string[],
 *   windowsVerbatimArguments: boolean,
 *   env: NodeJS.ProcessEnv | undefined,
 * }} AWayToStart
 */

/**
 * What to hand Node's spawn so that the program starts as a new group, which a stop then finds by the child's pid. On
 * Linux and the Mac it is detached, with no windowsHide. On Windows the starter is not detached and is hidden, because a
 * detached PowerShell runs nothing (./windows-starts.mjs).
 * @typedef {AWayToStart & { detached: boolean, windowsHide?: true }} AStartInAGroup
 */

/**
 * A system's process groups. `signal` returns when the signal was sent, and throws when it was not. `gentleStop`
 * is the signal that asks a whole group to stop, or null where the system has none. `theProgramToStart` answers the
 * program a start in a group names for a command its caller declares. `askToStop` resolves when the group's program
 * was asked to stop, and rejects, saying why, when it was not; it never waits for the group to be gone. On Windows a
 * rejection because the group's stop pipe is not there carries `thePipeIsNotThere: true`, and no other does.
 * `listenForAStopRequest` calls `onStop` when this program is asked, says in `say` why it cannot listen, and answers
 * the process that listens for it (on Windows the helper that owns the pipe), or null when nothing listens. A later
 * call in the same program starts nothing more; it takes the stop over and answers the same process, or null, with the
 * sentence again, when nothing listens.
 * `jobObjects` is null where the process table says which group a process is in, and the program a start in a group
 * makes leads that group.
 * @typedef {{
 *   signal: (group: number, signal: NodeJS.Signals | 0) => void,
 *   gentleStop: 'SIGTERM' | null,
 *   howToStartInItsOwnGroup: (way: AWayToStart) => AStartInAGroup,
 *   theProgramToStart: (command: string) => string,
 *   askToStop: (group: number) => Promise<void>,
 *   listenForAStopRequest: (onStop: () => void, say: (sentence: string) => void) => import('node:child_process').ChildProcess | null,
 *   jobObjects: JobObjects | null,
 * }} Groups
 */

/**
 * WHAT IS ASKED OF A JOB OBJECT, where a group is one that a starter makes (Windows). `theOneThisProgramWasStartedIn`
 * answers the group number the starter gave this program, but only when the process with that number carries the
 * starter's mark and that group's Job Object holds this program; otherwise it says why not. It asks Windows once, and
 * every later call answers the same. `holds` asks whether the Job Object of a group holds a process now, and answers
 * yes, no with the reason, or why it cannot tell. `programsOfAStarter` lists the children of a starter that the Job
 * Object named for it holds, with their starts: an empty list when there is no such Job Object or it holds no child of
 * the starter, and the reason when it cannot be read, never an empty list. None of them can end or change anything.
 * `readTheOneThisProgramWasStartedIn`, `readHolds` and `readProgramsOfAStarter` ask the same by the way that waits for
 * PowerShell without holding the thread, and give the same answers.
 * @typedef {{
 *   theOneThisProgramWasStartedIn: () => { group: number } | { unknown: string },
 *   readTheOneThisProgramWasStartedIn: () => Promise<{ group: number } | { unknown: string }>,
 *   holds: (group: number, pid: number) => { holds: true } | { holds: false, why: string } | { unknown: string },
 *   readHolds: (group: number, pid: number) => Promise<{ holds: true } | { holds: false, why: string } | { unknown: string }>,
 *   programsOfAStarter: (starter: number) => { read: true, programs: AProgramAStarterLeft[] } | { read: false, reason: string },
 *   readProgramsOfAStarter: (starter: number) => Promise<{ read: true, programs: AProgramAStarterLeft[] } | { read: false, reason: string }>,
 * }} JobObjects
 */

/**
 * One child of a starter that the starter's Job Object holds, as Windows gave it. `command` is its command line, or its
 * name in brackets when Windows gave none.
 * @typedef {{ pid: number, ppid: number, command: string, startedAt: Date }} AProgramAStarterLeft
 */

/**
 * What Mole Office asks of one system.
 * @typedef {{
 *   platform: string,
 *   processes: ProcessReader,
 *   groups: Groups,
 *   holderAddress: (name: string, folder: string) => string,
 *   holderAddressIsAFile: boolean,
 *   aTerminalIsEndedBy: 'its-group' | 'its-pty',
 *   theShellVariable: 'SHELL' | 'ComSpec',
 *   aTerminalIsGiven: { names: readonly string[], startingWith: readonly string[] },
 *   whatATerminalStarts: (command: string, args: readonly string[], folder: string, env: Readonly<Record<string, string>>) => AStartInATerminal,
 *   aFileIsMadePrivate: AFileIsMadePrivate,
 *   aFolderIsLinkedBy: 'a-symbolic-link' | 'a-junction',
 *   anInstallerMade: import('./the-installer-of-a-folder.mjs').AnInstallerMade,
 *   theSearchPathIn: (env: Readonly<Record<string, string | undefined>>) => string | undefined,
 * }} ASystem
 */

/**
 * WHAT node-pty IS HANDED TO OPEN A TERMINAL: the program, and its arguments as a list, or on Windows as one command
 * line that is passed as it is. `whatATerminalStarts` throws, saying why in words, when there is nothing it can start.
 * @typedef {{ command: string, args: string[] | string }} AStartInATerminal
 */

/**
 * HOW A FILE IS MADE ONE THAT ONLY THIS USER MAY READ AND WRITE. On Linux and the Mac it is by the mode the file is
 * made with, 0600. On Windows it is by an access list: `set` gives a file that is already there one entry, this
 * user's, reads the list back, and refuses in words when it is not that.
 * @typedef {{ by: 'its-mode' } | { by: 'its-access-list', set: (path: string) => WhatSettingTheListDid }} AFileIsMadePrivate
 */

/**
 * @typedef {import('./windows-private-files.mjs').WhatSettingTheListDid} WhatSettingTheListDid
 */

/**
 * THE NAMES A SHELL NEEDS on Linux and the Mac, which a terminal is given from the server's own environment, with every
 * name that starts with LC_. src/server/lib/terminals.ts says why it is a list of what is let through.
 */
const A_TERMINAL_ON_LINUX_OR_A_MAC = {
  names: ['HOME', 'USER', 'LOGNAME', 'SHELL', 'PATH', 'LANG', 'LANGUAGE', 'TZ', 'TMPDIR', 'DISPLAY', 'WAYLAND_DISPLAY', 'XDG_RUNTIME_DIR', 'DBUS_SESSION_BUS_ADDRESS'],
  startingWith: ['LC_'],
}

/**
 * THE NAMES A SHELL NEEDS ON WINDOWS, spelled as Windows spells them, except PATH. Windows reads a variable's name in
 * any case, so a name is matched in any case there, and the terminal is given it as this list spells it. So a
 * terminal's environment holds one search path entry, `PATH`, and every reader reads it through `theSearchPathIn`.
 * HOME is in it because Git for Windows reads it first when it is set. No name in it carries a key.
 */
const A_TERMINAL_ON_WINDOWS = {
  names: [
    'ALLUSERSPROFILE', 'APPDATA', 'CommonProgramFiles', 'CommonProgramFiles(x86)', 'CommonProgramW6432', 'ComSpec', 'HOME',
    'HOMEDRIVE', 'HOMEPATH', 'LANG', 'LOCALAPPDATA', 'NUMBER_OF_PROCESSORS', 'OS', 'PATH', 'PATHEXT', 'PROCESSOR_ARCHITECTURE',
    'ProgramData', 'ProgramFiles', 'ProgramFiles(x86)', 'ProgramW6432', 'PSModulePath', 'PUBLIC', 'SystemDrive', 'SystemRoot', 'TEMP',
    'TMP', 'TZ', 'USERNAME', 'USERPROFILE', 'windir',
  ],
  startingWith: [],
}

/**
 * THE SEARCH PATH ON LINUX AND THE MAC: the value of `PATH`, because a name there is read in its own case.
 * @param {Readonly<Record<string, string | undefined>>} env
 * @returns {string | undefined}
 */
function theSearchPathOnLinuxOrAMac(env) {
  return env['PATH']
}

/**
 * THE SEARCH PATH ON WINDOWS: the value of the one name that is PATH in any case. Two such names with one value are one
 * search path. Two with different values are refused, naming both, because the office does not pick one of them.
 * @param {Readonly<Record<string, string | undefined>>} env
 * @returns {string | undefined}
 */
function theSearchPathOnWindows(env) {
  const names = Object.keys(env).filter((name) => name.toLowerCase() === 'path' && env[name] !== undefined)
  const values = new Set(names.map((name) => env[name]))
  if (values.size > 1) {
    throw new Error(
      `This environment holds the search path under ${theNamesInWords(names)}, and their values differ. ` +
      'Nothing was looked up, because the office does not pick one of them.',
    )
  }
  const [first] = names
  return first === undefined ? undefined : env[first]
}

/**
 * Names in a sentence: "Path" and "PATH", or "Path", "PATH" and "path".
 * @param {readonly string[]} names two or more
 * @returns {string}
 */
function theNamesInWords(names) {
  const quoted = names.map((name) => `"${name}"`)
  return `${quoted.slice(0, -1).join(', ')} and ${quoted[quoted.length - 1]}`
}

/** @type {Map<string, ASystem>} */
const made = new Map()

/**
 * THE INTERFACE FOR ONE SYSTEM, made the first time it is asked for. Making it runs nothing.
 *
 * The system this process runs on reads processes with the one reader the rest of the program reads them with,
 * `theProcessReader()`. So on Windows the reader's one reading of this process is made once for the whole program.
 * @param {string} platform a value of `process.platform`
 * @returns {ASystem}
 */
export function theSystemFor(platform) {
  const known = made.get(platform)
  if (known !== undefined) return known
  const onWindows = platform === 'win32'
  /** @type {ASystem} */
  const system = {
    platform,
    processes: platform === process.platform ? theProcessReader() : theProcessReaderFor(platform),
    groups: onWindows ? windowsGroups() : posixGroups(),
    holderAddress: onWindows
      ? (name) => `\\\\.\\pipe\\mole-office-terminals-${name}`
      : (name, folder) => join(folder, `${name}.sock`),
    holderAddressIsAFile: !onWindows,
    aTerminalIsEndedBy: onWindows ? 'its-pty' : 'its-group',
    theShellVariable: onWindows ? 'ComSpec' : 'SHELL',
    aTerminalIsGiven: onWindows ? A_TERMINAL_ON_WINDOWS : A_TERMINAL_ON_LINUX_OR_A_MAC,
    whatATerminalStarts: onWindows ? howWindowsStartsACommand : (command, args) => ({ command, args: [...args] }),
    aFileIsMadePrivate: onWindows ? windowsPrivateFiles() : { by: 'its-mode' },
    aFolderIsLinkedBy: onWindows ? 'a-junction' : 'a-symbolic-link',
    anInstallerMade: onWindows ? windowsInstallerQuestion() : platform === 'linux' ? linuxInstallerMade : noInstallerQuestion(platform === 'darwin' ? 'the Mac' : platform),
    theSearchPathIn: onWindows ? theSearchPathOnWindows : theSearchPathOnLinuxOrAMac,
  }
  made.set(platform, system)
  return system
}

/**
 * The interface for the system this process runs on.
 * @returns {ASystem}
 */
export function thisSystem() {
  return theSystemFor(process.platform)
}
