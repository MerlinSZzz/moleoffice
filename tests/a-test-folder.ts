// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * EVERY FOLDER A TEST MAKES FOR ITS OWN FILES: MADE HERE, REMOVED WHEN ITS PROCESS ENDS, AND SWEPT A DAY LATER IF IT WAS NOT.
 *
 * Problem `lZ7OSjBOhUIO`. Browser and server tests copy the database into a folder of their own in the
 * temporary directory. A test removes its folder in a hook, and a process that ended before the hook ran
 * left the folder there for good. On 4 September 2026 the machine held 2,114 of them, and 64 test files
 * still named their folders their own way, so nothing could tell their folders apart or how old they were.
 *
 * This file does three things, each in one place.
 *
 * 1. THE NAME. `mole-office-<what>-<YYYYMMDDTHHMMSSZ>-<six characters>`: one prefix, and the UTC time the
 *    folder was made. A folder's own times change whenever a file inside it is written, so only the
 *    name can say how old the folder is.
 * 2. THE REMOVAL WHEN THE PROCESS ENDS. Every folder made here is written down on `process`, and removed
 *    when the process exits, when it gets SIGINT or SIGTERM, and when it dies of an uncaught exception
 *    (Node runs `exit` handlers for that too). So a test that fails, throws or is stopped by the runner
 *    still takes its folder with it. A test's own hook may remove the folder sooner; removing it again
 *    does nothing. As the process ends, it also takes off the list below the lines of the folders it
 *    made that are gone, so a run that ended well leaves no list behind.
 * 3. THE SWEEP. SIGKILL ends a process without running any of its code, and vitest sends SIGKILL to a
 *    worker that has not ended 500 ms after SIGTERM. So a folder made in the temporary directory is also
 *    written down, with the process that made it, in a list in that directory. `sweepTheTestFoldersLeftBehind`
 *    runs before any test file starts (tests/the-test-folders-left-behind-are-swept.ts). It reads that list
 *    and nothing else, and removes every folder on it that is more than a day old and whose maker has ended.
 *
 * It imports nothing but Node. So a test file that does not otherwise import tests/helpers.ts does not
 * load it to get a folder, and vitest's global setup can run the sweep in its own process.
 */
import { closeSync, constants, fstatSync, lstatSync, mkdtempSync, openSync, readFileSync, renameSync, rmSync, unlinkSync, writeSync, type Stats } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, sep } from 'node:path'

/**
 * WHERE EVERY DATABASE A TEST MAKES LIVES, AS A PATH THAT STARTS EVERY ONE OF THEM.
 *
 * tests/no-stray-servers.test.ts has to tell a server the test suite started from one somebody started
 * by hand, and `setsid`, which this repository tells you to start a server with, leaves a live server
 * with no parent, which is the shape of a leak. The database is what tells them apart, so the shape of
 * that path is stated once, here, and read there.
 */
export const TEST_DATABASE_PREFIX = join(tmpdir(), 'mole-office-')

/** The time in a folder's name, and the six characters `mkdtemp` adds after it. */
const MADE_AT_IN_A_NAME = /-(\d{8}T\d{6}Z)-[^-]+$/

/** The whole last name of a folder made here, and nothing else: what the sweep may remove. */
const A_FOLDER_MADE_HERE = /^mole-office-.+-\d{8}T\d{6}Z-[A-Za-z0-9]{6}$/

/** A time as a folder's name carries it: UTC, to the second, `20261005T143700Z`. */
export function madeAtForAName(at: Date): string {
  return at.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
}

/** The time a folder made by `aTestDatabaseFolder` was made, or null for a name that carries none. */
export function whenThisTestFolderWasMade(name: string): Date | null {
  const found = MADE_AT_IN_A_NAME.exec(basename(name))
  if (found === null) return null
  const s = found[1] as string
  return new Date(`${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T${s.slice(9, 11)}:${s.slice(11, 13)}:${s.slice(13, 15)}Z`)
}

/**
 * A NEW FOLDER FOR A TEST'S DATABASE OR ANY OTHER FILE A TEST WRITES: `mole-office-<what>-<made at>-XXXXXX`.
 *
 * In the temporary directory unless `under` names another place; a few tests need their folder inside
 * the checkout. `what` comes first so a name like `mole-office-test-` still reads as it did. The folder
 * is removed when this process ends, however it ends, except by SIGKILL.
 *
 * A folder made directly in the temporary directory is written down in its list there, for the sweep. A
 * folder made anywhere else is on no list, and nothing sweeps it: the sweep never looked there. A process
 * killed between making the folder and writing its line leaves a folder no line names.
 */
export function aTestDatabaseFolder(what: string, under: string = tmpdir()): string {
  if (what === '' || what.includes(sep)) throw new Error(`a test folder's name cannot be ${JSON.stringify(what)}`)
  const folder = mkdtempSync(join(under, `mole-office-${what}-${madeAtForAName(new Date(theMachinesClock()))}-`))
  theFoldersThisProcessMade().add(folder)
  if (dirname(folder) === join(tmpdir())) addToTheList(theListOfTestFoldersIn(tmpdir()), `${theLineFor(folder, process.pid)}\n`)
  return folder
}

/** Remove a folder `aTestDatabaseFolder` made, now, and stop holding it for the end of the process. */
export function removeThisTestFolder(folder: string): void {
  theFoldersThisProcessMade().delete(folder)
  rmSync(folder, { recursive: true, force: true })
}

/**
 * Remove every folder this process made, now. tests/helpers.ts calls it after it has killed the servers
 * it started, so that no server is still writing into a folder while it is removed.
 */
export function removeEveryTestFolderNow(): void {
  removeEveryOne(theFoldersThisProcessMade())
}

interface ProcessWithTestFolders {
  __moleOfficeTestFolders?: Set<string>
  __moleOfficeTheMachinesClock?: () => number
}

/**
 * THE MACHINE'S CLOCK, NEVER A TEST'S, FOR THE TIME IN A FOLDER'S NAME. A test may fake `Date`:
 * tests/deadline-route.test.ts sets it to 5 October before its first database is made. A folder made
 * then is still named by the time it was really made. Otherwise another run that starts while this one
 * works sweeps the same temporary directory, reads the folder as weeks old, and removes it under the
 * test. It is `Date.now` as this process first loaded this file, which a test file does with its
 * imports, before any of its tests can fake the clock. It is kept on `process`, like the folders, so
 * that loading this file again while a test fakes the clock cannot take the faked one.
 */
const theMachinesClock: () => number = ((process as unknown as ProcessWithTestFolders).__moleOfficeTheMachinesClock ??= Date.now)

/**
 * ON `process`, NOT IN A MODULE VARIABLE. vitest gives each test file a fresh module registry inside a
 * shared process, and `freshDb` calls `vi.resetModules()` before every test. A module variable would be
 * one per file or per reset, and each would add its own handlers.
 */
function theFoldersThisProcessMade(): Set<string> {
  const carrier = process as unknown as ProcessWithTestFolders
  let folders = carrier.__moleOfficeTestFolders
  if (folders === undefined) {
    folders = new Set<string>()
    carrier.__moleOfficeTestFolders = folders
    removeThemWhenTheProcessEnds(folders)
  }
  return folders
}

/**
 * Each signal handler puts back what it took away. A listener for a signal replaces what the signal did
 * by default, so after tidying up it raises the signal again. `once` means the listener is gone by then,
 * and the process ends the way it would have.
 */
function removeThemWhenTheProcessEnds(folders: Set<string>): void {
  process.on('exit', () => {
    removeEveryOne(folders)
    takeItsLinesOffTheList()
  })
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      removeEveryOne(folders)
      takeItsLinesOffTheList()
      process.kill(process.pid, signal)
    })
  }
}

/** Synchronous, because Node does not wait for a promise in an `exit` handler. */
function removeEveryOne(folders: Set<string>): void {
  for (const folder of folders) {
    try {
      rmSync(folder, { recursive: true, force: true })
    } catch (err) {
      // Said, not swallowed. The folder stays, and the sweep finds it a day from now.
      console.error(`could not remove the test folder ${folder}: ${String(err)}`)
    }
  }
  folders.clear()
}

/**
 * THE LIST OF THE TEST FOLDERS MADE DIRECTLY IN `under`: one line for each, `{"folder":…,"by":<pid>}`,
 * naming the folder and the process that made it. Lines are only ever added to it. The sweep, and a
 * process as it ends, take lines away only by taking the whole list.
 */
export function theListOfTestFoldersIn(under: string): string {
  return join(under, 'mole-office-test-folders.list')
}

function theLineFor(folder: string, by: number): string {
  return JSON.stringify({ folder, by })
}

/**
 * A line of the list in `under`, or null when it is not one the sweep may act on: a folder directly in
 * `under` whose whole name has the shape `aTestDatabaseFolder` gives, and one process's number. A number
 * of 0 or less means a whole group of processes to the system, so it is never asked about.
 */
function aLineOfTheList(text: string, under: string): { folder: string; by: number } | null {
  let read: unknown
  try {
    read = JSON.parse(text)
  } catch {
    return null
  }
  if (typeof read !== 'object' || read === null) return null
  const { folder, by } = read as { folder?: unknown; by?: unknown }
  if (typeof folder !== 'string' || typeof by !== 'number' || !Number.isSafeInteger(by) || by <= 0) return null
  if (folder !== join(under, basename(folder)) || !A_FOLDER_MADE_HERE.test(basename(folder))) return null
  return { folder, by }
}

/**
 * ADD LINES TO A LIST SO THAT NONE IS LOST, TO ANOTHER WRITER OR TO A SWEEP.
 *
 * One write to the file opened to append. The system puts each such write whole at the end of the file,
 * so makers writing at the same time cannot cut into each other's lines, and a sweep that adds back what
 * it keeps cannot write over a line added meanwhile. A sweep, or a process as it ends, takes the list by
 * renaming it, so a writer that opened the list just before may have written into the file it took. It
 * looks: when the list's name no longer leads to the file it wrote into, it writes again, into the list
 * there now. A line written twice is one line to the sweep.
 */
function addToTheList(list: string, lines: string): void {
  const bytes = Buffer.from(lines)
  for (let tries = 0; tries < 10; tries += 1) {
    const fd = openSync(list, constants.O_WRONLY | constants.O_APPEND | constants.O_CREAT | constants.O_NOFOLLOW, 0o600)
    try {
      const wrote = writeSync(fd, bytes)
      if (wrote !== bytes.length) throw new Error(`only ${String(wrote)} of ${String(bytes.length)} bytes were written to ${list}`)
      const wroteInto = fstatSync(fd)
      const named = statOrNothing(list)
      if (named !== null && named.ino === wroteInto.ino && named.dev === wroteInto.dev) return
    } finally {
      closeSync(fd)
    }
  }
  throw new Error(`a sweep took the list of test folders ${list} ten times while this process wrote to it`)
}

/**
 * TAKE THE WHOLE LIST, by renaming it to a name of this process's own, so that a maker who writes
 * meanwhile starts a new list. It returns that name, or null when there is no list, which is also what a
 * list another process has taken just then reads as. Any other failure is thrown, and nothing was taken.
 */
function takeTheList(list: string, as: string): string | null {
  const taken = `${list}.${as}-${String(process.pid)}`
  try {
    renameSync(list, taken)
    return taken
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw err
  }
}

/** Add back through `addToTheList` the lines kept from a list taken, then remove the file taken. */
function giveBackTheList(list: string, taken: string, kept: string[]): void {
  if (kept.length > 0) addToTheList(list, kept.map((text) => `${text}\n`).join(''))
  unlinkSync(taken)
}

/**
 * AS THIS PROCESS ENDS, THE LINES OF THE FOLDERS IT MADE THAT ARE GONE COME OFF THE LIST in its temporary
 * directory, so a run that ended well leaves no list there. It puts back every other line as it was: a
 * line of another process, a line of a folder still there, and a line it cannot use. When a sweep or
 * another ending process has the list just then, it leaves its lines, and the next sweep drops them,
 * since their folders are gone. Synchronous, for the same reason as `removeEveryOne`.
 */
function takeItsLinesOffTheList(): void {
  const under = tmpdir()
  const list = theListOfTestFoldersIn(under)
  let taken: string | null = null
  try {
    taken = takeTheList(list, 'ending')
    if (taken === null) return
    const kept = readFileSync(taken, 'utf8').split('\n').filter((text) => {
      if (text === '') return false
      const line = aLineOfTheList(text, under)
      return line === null || line.by !== process.pid || statOrNothing(line.folder) !== null
    })
    giveBackTheList(list, taken, kept)
  } catch (err) {
    // Said, not swallowed. Lines taken and not given back are in the file named here.
    console.error(`could not take this process's lines off the list of test folders ${list}${taken === null ? '' : ` (what it took is in ${taken})`}: ${String(err)}`)
  }
}

function statOrNothing(path: string): Stats | null {
  try {
    return lstatSync(path)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT' || (err as NodeJS.ErrnoException).code === 'ENOTDIR') return null
    throw err
  }
}

/** What one sweep did, for the line it prints and for the test that proves it. */
export interface WhatTheSweepDid {
  /** The folder whose list it read. */
  under: string
  /** Folders more than a day old whose maker had ended, now removed. */
  removed: string[]
  /** Folders more than a day old that it kept, because the process that made them still runs. */
  held: Array<{ folder: string; by: number[] }>
  /** Folders more than a day old that it tried to remove and could not. Their lines stay. */
  failed: Array<{ folder: string; because: string }>
  /** Why it could not take its list, when it could not. It removes nothing then. */
  couldNotLook: string | null
  /** Lines of the list it could not use, put back as they were. */
  unreadable: number
}

const A_DAY = 24 * 60 * 60 * 1000

/**
 * REMOVE THE TEST FOLDERS A KILLED TEST LEFT BEHIND: on the list, more than a day old, and their maker has ended.
 *
 * It reads the list in `under` and nothing else. It never lists `under` itself, so a folder no line names
 * is never touched, whoever made it, a folder left before the list existed included. Of the folders the
 * lines name, it touches only one directly in `under` whose whole name has the shape `aTestDatabaseFolder`
 * gives, time included. Other tools make `mole-office-` folders too.
 *
 * MORE THAN A DAY OLD is read from the folder's name, because a folder's own times change whenever a file
 * inside it is written. THE MAKER HAS ENDED when the system has no process with the number on its line:
 * it asks about that one process and no other. A maker that has exited but whose parent has not yet
 * collected it, or a number the system has since given to a newer process, reads as a maker that still
 * runs, and the folder is kept until that process is gone.
 *
 * A FOLDER WHOSE MAKER HAS ENDED IS REMOVED EVEN WHILE ANOTHER LIVE PROCESS HOLDS IT. To see that process
 * the sweep would have to read every process on the machine, and no test may. Such a holder is a server
 * or a child that a killed test left running, a day or more after the test ended. It keeps the files it
 * already has open there, and cannot make a new one.
 *
 * TAKING THE LIST. It renames the list to a name of its own, reads that, and adds back the lines it keeps
 * through `addToTheList`, so a line a maker writes meanwhile, into a new list, stays. It drops the line of
 * a folder that is no longer there and of a folder it removed. A line it cannot use is put back as it was
 * and counted, and the line it prints names the list. When it cannot take the list it removes nothing and
 * says why. A list that a process ending in the same directory has taken just then reads as no list, and
 * the next run sweeps it. A sweep killed between taking the list and putting it back loses the lines it
 * took, and their folders stay until somebody removes them.
 */
export function sweepTheTestFoldersLeftBehind(options: {
  under?: string
  now?: Date
  olderThanMs?: number
  /** Called once after it has taken the list and before it puts back what it keeps. Only a test names it, to write a line in between. */
  meanwhile?: () => void
} = {}): WhatTheSweepDid {
  const under = options.under ?? tmpdir()
  const before = (options.now ?? new Date()).getTime() - (options.olderThanMs ?? A_DAY)
  const did: WhatTheSweepDid = { under, removed: [], held: [], failed: [], couldNotLook: null, unreadable: 0 }
  const list = theListOfTestFoldersIn(under)
  let taken: string | null
  try {
    taken = takeTheList(list, 'sweeping')
  } catch (err) {
    did.couldNotLook = `it could not take its list ${list} (${String(err)})`
    return did
  }
  if (taken === null) return did

  const putBack: string[] = []
  const makers = new Map<string, Set<number>>()
  for (const text of readFileSync(taken, 'utf8').split('\n')) {
    if (text === '') continue
    const line = aLineOfTheList(text, under)
    if (line === null) {
      did.unreadable += 1
      putBack.push(text)
      continue
    }
    makers.set(line.folder, (makers.get(line.folder) ?? new Set<number>()).add(line.by))
  }
  for (const [folder, by] of makers) {
    if (statOrNothing(folder)?.isDirectory() !== true) continue
    const keepItsLines = (): void => { for (const pid of by) putBack.push(theLineFor(folder, pid)) }
    if ((whenThisTestFolderWasMade(folder)?.getTime() ?? Infinity) >= before) {
      keepItsLines()
      continue
    }
    const running = [...by].filter(stillRuns)
    if (running.length > 0) {
      did.held.push({ folder, by: running })
      keepItsLines()
      continue
    }
    try {
      rmSync(folder, { recursive: true, force: true })
      did.removed.push(folder)
    } catch (err) {
      did.failed.push({ folder, because: String(err) })
      keepItsLines()
    }
  }
  options.meanwhile?.()
  giveBackTheList(list, taken, putBack)
  return did
}

/** Whether the system has a process with this number. One that belongs to another user still counts. */
function stillRuns(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ESRCH') return false
    if ((err as NodeJS.ErrnoException).code === 'EPERM') return true
    throw err
  }
}

/** The one line a sweep prints, or null when it found nothing old enough to act on and no line it could not use. */
export function whatTheSweepSays(did: WhatTheSweepDid): string | null {
  const start = `The test folders left behind in ${did.under}`
  if (did.couldNotLook !== null) return `${start} were not swept: ${did.couldNotLook}.`
  if (did.removed.length + did.held.length + did.failed.length + did.unreadable === 0) return null
  const parts = [`${String(did.removed.length)} more than a day old removed`]
  if (did.held.length > 0) {
    parts.push(`${String(did.held.length)} kept because the process that made them still runs (${did.held.map((h) => `${basename(h.folder)} by ${h.by.join(', ')}`).join('; ')})`)
  }
  if (did.failed.length > 0) {
    parts.push(`${String(did.failed.length)} could not be removed (${did.failed.map((f) => `${basename(f.folder)}: ${f.because}`).join('; ')})`)
  }
  if (did.unreadable > 0) {
    parts.push(`${String(did.unreadable)} lines of ${theListOfTestFoldersIn(did.under)} could not be used, and were put back as they were`)
  }
  return `${start}: ${parts.join('; ')}.`
}
