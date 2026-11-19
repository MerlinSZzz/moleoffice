// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE DATA FOLDER MOVE: THE PLACE IS ONE `.env` LINE, AND A MOVE STOPS, COPIES, CHECKS, SWITCHES AND STARTS.
 *
 * DF1 to DF21 of design/window/the-data-folder-move.criteria.md are checked here. Every folder is made
 * under the temporary directory and removed after the case. The mover is given fake stop, start and
 * runtime readings, so no office is started and no real data folder is touched. A real SQLite database,
 * a key file, a backups folder whose two names are one file and a store folder are made in the old
 * folder, so the copy and the confirm work on the shape an office really has.
 *
 * THE OLD FOLDER IS NEVER THE OWNER'S. It is a folder this file made, named by `mkdtempSync`, and the
 * `.env` and the mark are in folders this file made too.
 */
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  chmodSync,
  existsSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'
import { afterEach, expect, it } from 'vitest'

import { setTheLine } from '../src/config/env-file-line.mjs'
import { databaseDirectoryFrom, databasePathFrom, envFileValues, forgetWhatTheEnvFileSupplied, loadEnvFileIntoProcess, serviceLockPathFrom } from '../src/config/settings.mjs'
import { theProcessAt } from '../src/config/session-process.mjs'
import { localStampOf } from '../src/config/stopped-run-cause.mjs'

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))

type TheMove = typeof import('../src/config/the-data-folder-move.mjs')
type MoveState =
  | 'stopping'
  | 'copying'
  | 'checking'
  | 'switching'
  | 'switched'
  | 'started'
  | 'confirmed'
  | 'stopped-before-the-switch'
  | 'switched-back'

type AMark = {
  version: 1
  from: string
  to: string
  database: string
  state: MoveState
  mover: { pid: number; startedAt: string }
  earlier: string[]
  manifest: Record<string, string> | null
  says: string | null
  at: string
}
type ADataFolder = { folder: string; database: string }
type ALoginUnit = {
  unit: 'none' | 'current' | 'out of date' | 'not ours'
  unitPath: string
  startsAtLogin: boolean | null
  activeWord: string | null
}

/** A start-at-login reading, as the service command and the door hand it to the move. */
function aLoginUnit(overrides: Partial<ALoginUnit> = {}): ALoginUnit {
  return {
    unit: 'none',
    unitPath: '/a/home/.config/systemd/user/mole-office.service',
    startsAtLogin: false,
    activeWord: null,
    ...overrides,
  }
}

const folders: string[] = []

/** A folder this case made, removed after it, as every older test in this suite does. */
function made(prefix: string): string {
  const folder = mkdtempSync(join(tmpdir(), prefix))
  folders.push(folder)
  return folder
}

afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true })
  delete process.env['MOLE_OFFICE_DB']
  forgetWhatTheEnvFileSupplied()
})

/** The engine, imported inside a case so the test files load and the red run still counts. */
async function theMove(): Promise<TheMove> {
  return await import('../src/config/the-data-folder-move.mjs')
}

/** A data folder shaped as an office's is: a real database, a key file, a shared backup and a store. */
function aDataFolder(): ADataFolder {
  const folder = made('data-folder-move-')
  const database = join(folder, 'mole-office.db')
  const db = new Database(database)
  db.pragma('journal_mode = DELETE')
  db.exec("CREATE TABLE a (value TEXT); INSERT INTO a (value) VALUES ('one');")
  db.close()
  writeFileSync(join(folder, 'keys.json'), '{"office":"a key"}\n')
  mkdirSync(join(folder, 'backups'))
  writeFileSync(join(folder, 'backups', 'unchanged.db'), 'a backup kept by two names\n')
  linkSync(join(folder, 'backups', 'unchanged.db'), join(folder, 'backups', 'unchanged-copy.db'))
  mkdirSync(join(folder, 'report-files'))
  writeFileSync(join(folder, 'report-files', 'stored.txt'), 'a stored file\n')
  return { folder, database }
}

/** A `.env` this case made, naming the old database and carrying lines that must be kept. */
function anEnvFile(database: string): string {
  const folder = made('data-folder-move-env-')
  const file = join(folder, '.env')
  writeFileSync(file, `# a comment\nMOLE_OFFICE_PORT=9999\nMOLE_OFFICE_DB=${database}\nOTHER=kept\n`)
  chmodSync(file, 0o600)
  return file
}

/** The target's holder exists, and the target itself does not. */
function aTarget(): { target: string } {
  const parent = made('data-folder-move-target-')
  return { target: join(parent, 'new-data') }
}

/** The mark a live mover of the kind `theMoverIsAlive` checks. */
function aMarkOfThisProcess(state: MoveState, from: string, to: string): AMark {
  const at = theProcessAt(process.pid)
  if (!at.here || at.startedAt === null) throw new Error('this test process has no readable start time')
  return {
    version: 1,
    from,
    to,
    database: 'mole-office.db',
    state,
    mover: { pid: process.pid, startedAt: localStampOf(new Date(at.startedAt)) },
    earlier: [],
    manifest: null,
    says: null,
    at: '2026-01-01 00:00:00',
  }
}

type Ways = {
  envFile: string
  markPath: string
  stop: () => Promise<{ ok: boolean; says: string }>
  start: () => Promise<{ ok: boolean; says: string }>
  theRuntimeDatabase: () => Promise<string | null>
  theLoginUnit: () => ALoginUnit | Promise<ALoginUnit>
  copy?: (from: string, to: string, walk: unknown) => void | Promise<void>
  leaveOut?: string[]
}

type Harness = {
  target: string
  envFile: string
  markPath: string
  newDatabase: string
  calls: { stop: number; start: number; runtime: number; startedWith: (string | null)[] }
  ways: Ways
}

type HarnessOptions = {
  envFile?: string
  stop?: (call: number) => { ok: boolean; says: string }
  start?: (call: number) => { ok: boolean; says: string }
  runtime?: (call: number) => string | null
  copy?: (from: string, to: string, walk: unknown) => void | Promise<void>
  leaveOut?: string[]
}

function aHarness(old: ADataFolder, options: HarnessOptions = {}): Harness {
  const { target } = aTarget()
  const envFile = options.envFile ?? anEnvFile(old.database)
  const markPath = join(made('data-folder-move-mark-'), 'data-folder-move.json')
  const calls = { stop: 0, start: 0, runtime: 0, startedWith: [] as (string | null)[] }
  const ways: Ways = {
    envFile,
    markPath,
    stop: async () => {
      calls.stop += 1
      return options.stop === undefined ? { ok: true, says: '' } : options.stop(calls.stop)
    },
    start: async () => {
      calls.start += 1
      calls.startedWith.push(envFileValues(envFile)['MOLE_OFFICE_DB'] ?? null)
      return options.start === undefined ? { ok: true, says: '' } : options.start(calls.start)
    },
    theRuntimeDatabase: async () => {
      calls.runtime += 1
      return options.runtime === undefined ? join(target, basename(old.database)) : options.runtime(calls.runtime)
    },
    theLoginUnit: async () => aLoginUnit(),
  }
  if (options.copy !== undefined) ways.copy = options.copy
  if (options.leaveOut !== undefined) ways.leaveOut = options.leaveOut
  return { target, envFile, markPath, newDatabase: join(target, basename(old.database)), calls, ways }
}

async function theLastMark(move: TheMove, harness: Harness): Promise<AMark> {
  const last = await move.moveTheDataFolder(harness.target, harness.ways)
  if ('refused' in last) throw new Error(last.refused)
  return last as AMark
}

function hashOf(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

// ============================================================ DF1 to DF3, where the place is kept

it('DF1: the folder, the database and who chose them are read from the one .env line', async () => {
  const move = await theMove()
  const named = aDataFolder()
  const envFile = anEnvFile(named.database)

  const fromTheLine = move.whereTheDataIs({}, envFile)
  expect(fromTheLine.folder).toBe(dirname(named.database))
  expect(fromTheLine.database).toBe(basename(named.database))
  expect(fromTheLine.chosenBy).toBe('the .env line')

  const empty = join(made('data-folder-move-empty-'), '.env')
  const fromTheDefault = move.whereTheDataIs({}, empty)
  const defaultDatabase = databasePathFrom({})
  expect(fromTheDefault.folder).toBe(databaseDirectoryFrom(defaultDatabase))
  expect(fromTheDefault.database).toBe(basename(defaultDatabase))
  expect(fromTheDefault.chosenBy).toBe('the default')

  const other = aDataFolder()
  const fromTheProcess = move.whereTheDataIs({ MOLE_OFFICE_DB: other.database }, empty)
  expect(fromTheProcess.folder).toBe(dirname(other.database))
  expect(fromTheProcess.chosenBy).toBe('the process environment')
})

it('DF2: data-folder where prints the folder first and says the process environment chose it', async () => {
  const move = await theMove()
  const folder = made('data-folder-move-where-')
  const database = join(folder, 'mole-office.db')
  const said = spawnSync(process.execPath, ['src/config/the-service-command.mjs', 'data-folder', 'where'], {
    cwd: ROOT,
    env: { ...process.env, MOLE_OFFICE_DB: database, MOLE_OFFICE_MESSAGE_WORKER: 'off' },
    encoding: 'utf8',
  })
  expect(said.status, said.stderr).toBe(0)
  const lines = said.stdout.trimEnd().split('\n')
  expect(lines[0]).toBe(folder)
  expect(lines[1]).toBe(move.theChosenByWords('the process environment'))
})

it('DF3: choose makes the .env with mode 600 and writes the one line', async () => {
  const move = await theMove()
  const place = made('data-folder-move-chosen-')
  const envFile = join(made('data-folder-move-choose-env-'), '.env')

  const chosen = move.chooseTheDataFolder(place, envFile)

  expect(existsSync(envFile)).toBe(true)
  if (process.platform !== 'win32') expect(statSync(envFile).mode & 0o777).toBe(0o600)
  expect(envFileValues(envFile)['MOLE_OFFICE_DB']).toBe(join(place, 'mole-office.db'))
  expect(chosen.database).toBe(join(place, 'mole-office.db'))
})

it('DF3: choose refuses without writing when the place is relative, holds files or a database is here', async () => {
  const move = await theMove()
  const envFile = join(made('data-folder-move-choose-refused-'), '.env')

  expect(() => move.chooseTheDataFolder('a/relative/place', envFile)).toThrow(
    move.theChoosePlaceIsNotAFullPathWords('a/relative/place', process.platform === 'win32' ? 'win32' : 'linux'),
  )
  expect(existsSync(envFile), 'a refused choose wrote no .env').toBe(false)

  const withFiles = made('data-folder-move-choose-files-')
  writeFileSync(join(withFiles, 'a-file.txt'), 'here already\n')
  expect(() => move.chooseTheDataFolder(withFiles, envFile)).toThrow(move.theChoosePlaceHoldsFilesWords(withFiles))
  expect(existsSync(envFile), 'a refused choose wrote no .env').toBe(false)

  const current = made('data-folder-move-choose-current-')
  const database = join(current, 'mole-office.db')
  writeFileSync(database, 'a database is already here\n')
  process.env['MOLE_OFFICE_DB'] = database
  expect(() => move.chooseTheDataFolder(made('data-folder-move-choose-place-'), envFile)).toThrow(
    move.theChooseAlreadyHasADatabaseWords(current, 'mole-office.db'),
  )
  expect(existsSync(envFile), 'a refused choose wrote no .env').toBe(false)
})

// ============================================================ DF4, what a move refuses before it stops

type ARefusedFolder = { kind: 'temporary'; variable: string; folder: string; names: string[] }

type ADriveReading = { root: string; type: string } | { root: string; unread: string } | null

type Facts = {
  from: string
  database: string
  installFolder: string
  perUserFolder: string
  processEnv: Record<string, string>
  envFile: string
  mark: { state: 'absent' } | { state: 'unreadable'; why: string } | { state: 'read'; mark: AMark }
  platform: string
  home: string
  freeBytes: number
  folderBytes: number
  walk: any
  placeExists: boolean
  placeIsAFolder: boolean
  placeEmpty: boolean
  holderExists: boolean
  leaveOut: string[]
  loginUnit: ALoginUnit
  refusedFolders: ARefusedFolder[]
  drive?: ADriveReading
}

/** Every fact a move's refusal is allowed to read, so the function is handed a whole machine. */
function aFacts(overrides: Partial<Facts> = {}): Facts {
  return {
    from: '/a/old/data',
    database: 'mole-office.db',
    installFolder: '/a/install',
    perUserFolder: '/a/home/.config/mole-office',
    processEnv: {},
    envFile: '/a/home/.config/mole-office/.env',
    mark: { state: 'absent' },
    platform: 'linux',
    home: '/a/home',
    freeBytes: 100_000,
    folderBytes: 1_000,
    walk: { names: [], files: new Map(), bytes: 1_000 },
    placeExists: false,
    placeIsAFolder: false,
    placeEmpty: false,
    holderExists: true,
    leaveOut: [],
    loginUnit: aLoginUnit(),
    refusedFolders: [],
    ...overrides,
  }
}

it('DF4: every place the criteria refuse is refused with its own sentence, and an empty place answers null', async () => {
  const move = await theMove()
  const facts = aFacts()
  const to = '/a/new/data'

  expect(move.whyAMoveThereIsRefused(to, facts)).toBeNull()
  expect(move.whyAMoveThereIsRefused('a/relative/place', facts)).toBe(move.thePlaceIsNotAFullPathWords('a/relative/place', 'linux'))
  expect(move.whyAMoveThereIsRefused('/a/new/data/', facts)).toBe(move.thePlaceIsNotAFullPathWords('/a/new/data/', 'linux'))
  expect(move.whyAMoveThereIsRefused(to, aFacts({ placeExists: true, placeIsAFolder: true, placeEmpty: false }))).toBe(
    move.thePlaceIsNotEmptyWords(to),
  )
  expect(move.whyAMoveThereIsRefused(to, aFacts({ placeExists: true, placeIsAFolder: false }))).toBe(move.thePlaceIsNotEmptyWords(to))

  const emptyPlace = { placeExists: true, placeIsAFolder: true, placeEmpty: true }
  expect(move.whyAMoveThereIsRefused('/a/old/data', aFacts(emptyPlace))).toBe(
    move.thePlaceIsAroundTheDataFolderWords('/a/old/data', '/a/old/data', 'same'),
  )
  expect(move.whyAMoveThereIsRefused('/a/old/data/inside', aFacts(emptyPlace))).toBe(
    move.thePlaceIsAroundTheDataFolderWords('/a/old/data/inside', '/a/old/data', 'inside'),
  )
  expect(move.whyAMoveThereIsRefused('/a/old', aFacts(emptyPlace))).toBe(
    move.thePlaceIsAroundTheDataFolderWords('/a/old', '/a/old/data', 'holds'),
  )
  expect(move.whyAMoveThereIsRefused('/a/install/office', facts)).toBe(
    move.thePlaceIsInTheInstallFolderWords('/a/install/office', '/a/install'),
  )
  expect(move.whyAMoveThereIsRefused('/a/gone/data', aFacts({ holderExists: false }))).toBe(move.thePlaceHasNoFolderWords('/a/gone/data'))
  expect(move.whyAMoveThereIsRefused(to, aFacts({ freeBytes: 999, folderBytes: 1_000 }))).toBe(
    move.thePlaceHasTooLittleRoomWords(to, 999, 1_000),
  )
  expect(move.whyAMoveThereIsRefused(to, aFacts({ processEnv: { MOLE_OFFICE_DB: '/a/shell/data.db' } }))).toBe(
    move.theProcessEnvironmentDecidesWords(),
  )

  const markFolder = made('data-folder-move-refusal-mark-')
  const markPath = join(markFolder, 'data-folder-move.json')
  const markEnvFile = join(markFolder, '.env')
  const living = aMarkOfThisProcess('copying', facts.from, to)
  expect(move.whyAMoveThereIsRefused(to, aFacts({ envFile: markEnvFile, mark: { state: 'read', mark: living } }))).toBe(
    move.theMoveIsStillRunningWords(markPath, living),
  )
  const switched = aMarkOfThisProcess('started', facts.from, to)
  expect(move.whyAMoveThereIsRefused(to, aFacts({ envFile: markEnvFile, mark: { state: 'read', mark: switched } }))).toBe(
    move.theMoveIsNotConfirmedWords(markPath, switched),
  )
  expect(move.whyAMoveThereIsRefused(to, aFacts({ envFile: markEnvFile, mark: { state: 'unreadable', why: 'not json' } }))).toBe(
    move.theUnreadableMarkWords(markPath, 'not json'),
  )

  const refusedWalk = move.theFolderHoldsASymbolicLinkWords('/a/old/data', 'a-link', '/a/old/data/a-link')
  expect(move.whyAMoveThereIsRefused(to, aFacts({ walk: refusedWalk }))).toBe(refusedWalk)

  const windows = aFacts({
    platform: 'win32',
    home: 'C:\\Users\\me',
    from: 'C:\\Users\\me\\AppData\\Roaming\\mole-office\\data',
    installFolder: 'C:\\Program Files\\Mole Office',
    envFile: 'C:\\Users\\me\\AppData\\Roaming\\mole-office\\.env',
    drive: { root: 'C:\\', type: 'Fixed' },
  })
  // A place on another local drive, outside the profile folder, may go on.
  expect(move.whyAMoveThereIsRefused('D:\\data\\mole-office', { ...windows, drive: { root: 'D:\\', type: 'Fixed' } })).toBeNull()
  expect(move.whyAMoveThereIsRefused('C:\\Users\\me\\Mole data', windows)).toBeNull()
})

it('DF4: on Windows a place in the temporary folder is refused, by the name its variable writes and by its long name, and a place in a OneDrive folder is not', async () => {
  const move = await theMove()
  // The native real path of a folder that is there: the short 8.3 name of TEMP is given its long name.
  const longNameOf = (folder: string): string | null =>
    folder === 'C:\\Users\\me\\TEMP~1' ? 'C:\\Users\\me\\Temporary folder' : null

  const five = {
    TEMP: 'C:\\Users\\me\\AppData\\Local\\Temp',
    TMP: 'C:\\Users\\me\\AppData\\Local\\Temp2',
    OneDrive: 'C:\\Users\\me\\OneDrive',
    OneDriveConsumer: 'C:\\Users\\me\\OneDrive-Consumer',
    OneDriveCommercial: 'C:\\Users\\me\\OneDrive-Commercial',
  }
  const folders = move.theFoldersADataFolderIsRefusedIn(five, longNameOf)
  // The temporary variables name refused folders, in the list's order. The OneDrive variables name none.
  expect(folders.map((one) => [one.kind, one.variable, one.folder])).toEqual([
    ['temporary', 'TEMP', five.TEMP],
    ['temporary', 'TMP', five.TMP],
  ])
  expect(folders.every((one) => one.names.length === 1 && one.names[0] === one.folder)).toBe(true)

  // A variable that is not set, is empty, is relative, or is not written with a drive letter, a colon and a
  // backslash names no folder.
  const noFolder = [{}, { TMP: '' }, { TEMP: 'Temp' }, { TMP: 'C:Users\\me\\Temp' }, { TEMP: '\\\\server\\share\\data' }].map((one) =>
    move.theFoldersADataFolderIsRefusedIn(one, longNameOf),
  )
  expect(noFolder).toEqual([[], [], [], [], []])

  // A short 8.3 name is compared by its long name too, and both spellings are in its names.
  const short = move.theFoldersADataFolderIsRefusedIn({ TEMP: 'C:\\Users\\me\\TEMP~1' }, longNameOf)
  expect(short).toEqual([
    {
      kind: 'temporary',
      variable: 'TEMP',
      folder: 'C:\\Users\\me\\TEMP~1',
      names: ['C:\\Users\\me\\TEMP~1', 'C:\\Users\\me\\Temporary folder'],
    },
  ])

  // Two variables that name one folder give one entry, the first.
  const twice = move.theFoldersADataFolderIsRefusedIn({ TEMP: 'C:\\Users\\me\\Temp', TMP: 'C:\\Users\\me\\Temp\\' }, longNameOf)
  expect(twice).toEqual([{ kind: 'temporary', variable: 'TEMP', folder: 'C:\\Users\\me\\Temp', names: ['C:\\Users\\me\\Temp'] }])

  const factsOf = (refusedFolders: ARefusedFolder[]): Facts =>
    aFacts({
      platform: 'win32',
      home: 'C:\\Users\\me',
      from: 'C:\\Users\\me\\AppData\\Roaming\\mole-office\\data',
      installFolder: 'C:\\Program Files\\Mole Office',
      envFile: 'C:\\Users\\me\\AppData\\Roaming\\mole-office\\.env',
      refusedFolders,
      drive: { root: 'C:\\', type: 'Fixed' },
    })
  const windows = factsOf(folders)

  expect(move.whyAMoveThereIsRefused('C:\\Users\\me\\AppData\\Local\\Temp', windows)).toBe(
    move.theWindowsPlaceIsInTheTemporaryFolderWords('C:\\Users\\me\\AppData\\Local\\Temp', five.TEMP, 'TEMP'),
  )
  expect(move.whyAMoveThereIsRefused('C:\\Users\\me\\AppData\\Local\\Temp\\office', windows)).toBe(
    move.theWindowsPlaceIsInTheTemporaryFolderWords('C:\\Users\\me\\AppData\\Local\\Temp\\office', five.TEMP, 'TEMP'),
  )
  expect(move.whyAMoveThereIsRefused('C:\\Users\\me\\AppData\\Local\\Temp2\\office', windows)).toBe(
    move.theWindowsPlaceIsInTheTemporaryFolderWords('C:\\Users\\me\\AppData\\Local\\Temp2\\office', five.TMP, 'TMP'),
  )
  // A place in a folder a OneDrive variable names may go on.
  expect(move.whyAMoveThereIsRefused('C:\\Users\\me\\OneDrive\\office', windows)).toBeNull()
  expect(move.whyAMoveThereIsRefused('C:\\Users\\me\\OneDrive-Consumer\\office', windows)).toBeNull()
  expect(move.whyAMoveThereIsRefused('C:\\Users\\me\\OneDrive-Commercial\\office', windows)).toBeNull()

  // The long name of a short TEMP is refused by the folder the variable writes, not by the long name.
  expect(move.whyAMoveThereIsRefused('C:\\Users\\me\\Temporary folder\\office', factsOf(short))).toBe(
    move.theWindowsPlaceIsInTheTemporaryFolderWords('C:\\Users\\me\\Temporary folder\\office', 'C:\\Users\\me\\TEMP~1', 'TEMP'),
  )

  // A place outside every refused folder may go on.
  expect(move.whyAMoveThereIsRefused('C:\\Users\\me\\Mole data', windows)).toBeNull()

  // A temporary folder outside the profile folder is refused with the temporary folder's sentence.
  const outside = { ...factsOf(move.theFoldersADataFolderIsRefusedIn({ TEMP: 'D:\\Temp' }, longNameOf)), drive: { root: 'D:\\', type: 'Fixed' } }
  expect(move.whyAMoveThereIsRefused('D:\\Temp\\office', outside)).toBe(
    move.theWindowsPlaceIsInTheTemporaryFolderWords('D:\\Temp\\office', 'D:\\Temp', 'TEMP'),
  )

  // A drive-relative TEMP names no folder, so a place in it is not refused.
  const driveRelative = factsOf(move.theFoldersADataFolderIsRefusedIn({ TEMP: 'C:Users\\me\\Temp' }, longNameOf))
  expect(move.whyAMoveThereIsRefused('C:\\Users\\me\\Temp\\office', driveRelative)).toBeNull()

  // On this Linux machine no folder is refused by a variable, and the facts say so.
  const old = aDataFolder()
  const envFile = anEnvFile(old.database)
  process.env['MOLE_OFFICE_DB'] = old.database
  const here = move.theFactsOfAMove(join(made('data-folder-move-facts-'), 'new-data'), aLoginUnit(), envFile)
  expect(here.refusedFolders).toEqual([])
})

it('DF4: the walk refuses a symbolic link and a file with a name outside the folder', async () => {
  const move = await theMove()
  const folder = made('data-folder-move-walk-')
  const outside = made('data-folder-move-walk-outside-')
  symlinkSync(join(folder, 'nowhere'), join(folder, 'a-link'))

  expect(() => move.theFilesOf(folder, [])).toThrow(
    move.theFolderHoldsASymbolicLinkWords(folder, 'a-link', join(folder, 'a-link')),
  )
  rmSync(join(folder, 'a-link'))

  writeFileSync(join(folder, 'one-name.txt'), 'shared bytes\n')
  linkSync(join(folder, 'one-name.txt'), join(outside, 'another-name.txt'))
  expect(() => move.theFilesOf(folder, [])).toThrow(move.theFileHasMoreNamesWords(join(folder, 'one-name.txt'), 2, 1))
})

it('DF4: on Linux a login unit that starts at login refuses the move and names the unit', async () => {
  const move = await theMove()
  const to = '/a/new/data'
  const loginUnit = aLoginUnit({ unit: 'current', startsAtLogin: true, activeWord: 'inactive' })

  const refused = move.whyAMoveThereIsRefused(to, aFacts({ loginUnit }))

  expect(refused).toBe(move.theLoginUnitKeepsTheOldFolderWords(loginUnit))
  expect(refused).toContain(loginUnit.unitPath)
})

it('DF4: a login unit that systemd does not call disabled refuses the move', async () => {
  const move = await theMove()
  const loginUnit = aLoginUnit({ unit: 'not ours', startsAtLogin: null, activeWord: null })

  expect(move.whyAMoveThereIsRefused('/a/new/data', aFacts({ loginUnit }))).toBe(
    move.theLoginUnitKeepsTheOldFolderWords(loginUnit),
  )
})

it('DF4: a disabled login unit that runs refuses the move and says the office runs from it', async () => {
  const move = await theMove()
  const loginUnit = aLoginUnit({ unit: 'current', startsAtLogin: false, activeWord: 'active' })

  expect(move.whyAMoveThereIsRefused('/a/new/data', aFacts({ loginUnit }))).toBe(
    move.theLoginUnitKeepsTheOldFolderWords(loginUnit),
  )
  expect(move.theLoginUnitKeepsTheOldFolderWords(loginUnit)).not.toBe(
    move.theLoginUnitKeepsTheOldFolderWords(aLoginUnit({ unit: 'current', startsAtLogin: false, activeWord: 'inactive' })),
  )
})

it('DF4: a disabled login unit that does not run, or no unit, lets the move go on', async () => {
  const move = await theMove()

  expect(
    move.whyAMoveThereIsRefused(
      '/a/new/data',
      aFacts({ loginUnit: aLoginUnit({ unit: 'current', startsAtLogin: false, activeWord: 'inactive' }) }),
    ),
  ).toBeNull()
  expect(
    move.whyAMoveThereIsRefused(
      '/a/new/data',
      aFacts({ loginUnit: aLoginUnit({ unit: 'none', startsAtLogin: false, activeWord: null }) }),
    ),
  ).toBeNull()
})

it('DF4: off Linux the login unit is not asked', async () => {
  const move = await theMove()
  const loginUnit = aLoginUnit({ unit: 'current', startsAtLogin: true, activeWord: 'inactive' })

  expect(move.whyAMoveThereIsRefused('/a/new/data', aFacts({ platform: 'darwin', loginUnit }))).toBeNull()

  const windows = aFacts({
    platform: 'win32',
    home: 'C:\\Users\\me',
    from: 'C:\\Users\\me\\AppData\\Roaming\\mole-office\\data',
    installFolder: 'C:\\Program Files\\Mole Office',
    envFile: 'C:\\Users\\me\\AppData\\Roaming\\mole-office\\.env',
    loginUnit,
    drive: { root: 'C:\\', type: 'Fixed' },
  })
  expect(move.whyAMoveThereIsRefused('C:\\Users\\me\\Mole data', windows)).toBeNull()
})

it('DF4: the login unit is asked before the process environment', async () => {
  const move = await theMove()
  const loginUnit = aLoginUnit({ unit: 'current', startsAtLogin: true, activeWord: 'inactive' })

  expect(
    move.whyAMoveThereIsRefused(
      '/a/new/data',
      aFacts({ loginUnit, processEnv: { MOLE_OFFICE_DB: '/a/shell/data.db' } }),
    ),
  ).toBe(move.theLoginUnitKeepsTheOldFolderWords(loginUnit))
})

// The mover reads the unit through its ways and hands it to the check, so a move from the command line is refused
// before anything stops. The login unit is read on Linux only (DF4).
it.skipIf(process.platform !== 'linux')('DF4: the mover hands the check the login unit its ways read, and stops nothing', async () => {
  const move = await theMove()
  const harness = aHarness(aDataFolder())
  const loginUnit = aLoginUnit({ unit: 'current', startsAtLogin: true, activeWord: 'inactive' })
  harness.ways.theLoginUnit = async () => loginUnit

  expect(await move.moveTheDataFolder(harness.target, harness.ways)).toEqual({
    refused: move.theLoginUnitKeepsTheOldFolderWords(loginUnit),
  })
  expect(harness.calls).toEqual({ stop: 0, start: 0, runtime: 0, startedWith: [] })
  expect(existsSync(harness.markPath)).toBe(false)
})

// ============================================================ DF5 to DF12, the move itself

it('DF5: the mover writes the mark before each step and leaves a whole mark saying started', async () => {
  const move = await theMove()
  const old = aDataFolder()
  const harness = aHarness(old)
  const seen: string[] = []
  // The stop and the start read the mark the mover wrote before calling each of them.
  harness.ways.stop = async () => {
    harness.calls.stop += 1
    const read = move.readTheMoveMark(harness.markPath)
    seen.push(read.state === 'read' ? read.mark.state : read.state)
    return { ok: true, says: '' }
  }
  harness.ways.start = async () => {
    harness.calls.start += 1
    harness.calls.startedWith.push(envFileValues(harness.envFile)['MOLE_OFFICE_DB'] ?? null)
    const read = move.readTheMoveMark(harness.markPath)
    seen.push(read.state === 'read' ? read.mark.state : read.state)
    return { ok: true, says: '' }
  }

  const last = await theLastMark(move, harness)

  expect(seen).toEqual(['stopping', 'switched'])
  expect(last.version).toBe(1)
  expect(last.from).toBe(old.folder)
  expect(last.to).toBe(harness.target)
  expect(last.database).toBe(basename(old.database))
  expect(last.mover.pid).toBe(process.pid)
  expect(last.mover.startedAt).toMatch(/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/)
  expect(last.earlier).toEqual([])
  expect(last.manifest).not.toBeNull()
  expect(last.state).toBe('started')
  expect(typeof last.says).toBe('string')
  expect(last.at).toMatch(/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/)
})

it('DF6: a stop that fails ends the mark before the switch and copies nothing', async () => {
  const move = await theMove()
  const old = aDataFolder()
  const stopSays = 'The office did not stop because this test said so.'
  const harness = aHarness(old, { stop: () => ({ ok: false, says: stopSays }) })
  const before = readFileSync(old.database)

  const last = await theLastMark(move, harness)

  expect(last.state).toBe('stopped-before-the-switch')
  expect(last.says).toBe(stopSays)
  expect(harness.calls.start).toBe(0)
  expect(existsSync(harness.target)).toBe(false)
  expect(readFileSync(old.database).equals(before), 'the old folder is unchanged').toBe(true)
  expect(envFileValues(harness.envFile)['MOLE_OFFICE_DB']).toBe(old.database)
})

it('DF6: the login unit is running for every active word and not for inactive, failed or no answer', async () => {
  const move = await theMove()

  for (const word of ['active', 'activating', 'deactivating', 'reloading']) {
    expect(move.theLoginUnitIsRunning(word), word).toBe(true)
  }
  for (const word of ['inactive', 'failed', null]) {
    expect(move.theLoginUnitIsRunning(word), String(word)).toBe(false)
  }
})

it('DF6: an enabled login unit that is not running leaves the service to be stopped and started', async () => {
  const move = await theMove()
  const calls: string[] = []
  const stopAndStart = move.theStopAndStartOfAMove({
    theUnitsReading: () => ({ enabledWord: 'enabled', activeWord: 'inactive' }),
    stopTheUnit: () => {
      calls.push('unit stop')
      return { ok: true, says: '' }
    },
    startTheUnit: () => {
      calls.push('unit start')
      return { ok: true, says: '' }
    },
    stopTheService: async () => {
      calls.push('service stop')
      return { ok: true, says: '' }
    },
    startTheService: async () => {
      calls.push('service start')
      return { ok: true, says: '' }
    },
  })

  expect(await stopAndStart.stop()).toEqual({ ok: true, says: '' })
  expect(await stopAndStart.start()).toEqual({ ok: true, says: '' })

  expect(calls).toEqual(['service stop', 'service start'])
})

it('DF6: a login unit that runs and is not enabled is still stopped first and started again', async () => {
  const move = await theMove()
  const calls: string[] = []
  const stopAndStart = move.theStopAndStartOfAMove({
    theUnitsReading: () => ({ enabledWord: 'disabled', activeWord: 'active' }),
    stopTheUnit: () => {
      calls.push('unit stop')
      return { ok: true, says: '' }
    },
    startTheUnit: () => {
      calls.push('unit start')
      return { ok: true, says: '' }
    },
    stopTheService: async () => {
      calls.push('service stop')
      return { ok: true, says: '' }
    },
    startTheService: async () => {
      calls.push('service start')
      return { ok: true, says: '' }
    },
  })

  expect(await stopAndStart.stop()).toEqual({ ok: true, says: '' })
  expect(await stopAndStart.start()).toEqual({ ok: true, says: '' })

  expect(calls).toEqual(['unit stop', 'service stop', 'unit start'])
})

it('DF6: no reading of the unit stops and starts the service alone', async () => {
  const move = await theMove()
  const calls: string[] = []
  const stopAndStart = move.theStopAndStartOfAMove({
    theUnitsReading: () => null,
    stopTheUnit: () => {
      calls.push('unit stop')
      return { ok: true, says: '' }
    },
    startTheUnit: () => {
      calls.push('unit start')
      return { ok: true, says: '' }
    },
    stopTheService: async () => {
      calls.push('service stop')
      return { ok: true, says: '' }
    },
    startTheService: async () => {
      calls.push('service start')
      return { ok: true, says: '' }
    },
  })

  expect(await stopAndStart.stop()).toEqual({ ok: true, says: '' })
  expect(await stopAndStart.start()).toEqual({ ok: true, says: '' })

  expect(calls).toEqual(['service stop', 'service start'])
})

it('DF6 and DF10: an active login unit is stopped before the service and started instead of it', async () => {
  const move = await theMove()
  const calls: string[] = []
  const stopAndStart = move.theStopAndStartOfAMove({
    theUnitsReading: () => ({ enabledWord: 'enabled', activeWord: 'active' }),
    stopTheUnit: () => {
      calls.push('unit stop')
      return { ok: true, says: '' }
    },
    startTheUnit: () => {
      calls.push('unit start')
      return { ok: true, says: '' }
    },
    stopTheService: async () => {
      calls.push('service stop')
      return { ok: true, says: '' }
    },
    startTheService: async () => {
      calls.push('service start')
      return { ok: true, says: '' }
    },
  })

  expect(await stopAndStart.stop()).toEqual({ ok: true, says: '' })
  expect(await stopAndStart.start()).toEqual({ ok: true, says: '' })

  expect(calls).toEqual(['unit stop', 'service stop', 'unit start'])
})

it('DF6: a login unit stop that fails answers its words and the service is not stopped', async () => {
  const move = await theMove()
  const calls: string[] = []
  const unitSays = 'The login unit did not stop because this test said so.'
  const stopAndStart = move.theStopAndStartOfAMove({
    theUnitsReading: () => ({ enabledWord: 'enabled', activeWord: 'active' }),
    stopTheUnit: () => {
      calls.push('unit stop')
      return { ok: false, says: unitSays }
    },
    startTheUnit: () => {
      calls.push('unit start')
      return { ok: true, says: '' }
    },
    stopTheService: async () => {
      calls.push('service stop')
      return { ok: true, says: '' }
    },
    startTheService: async () => {
      calls.push('service start')
      return { ok: true, says: '' }
    },
  })

  expect(await stopAndStart.stop()).toEqual({ ok: false, says: unitSays })
  expect(calls).toEqual(['unit stop'])
})

it('DF6: a service stop that fails after the login unit stop answers the service words', async () => {
  const move = await theMove()
  const calls: string[] = []
  const serviceSays = 'The office did not stop because this test said so.'
  const stopAndStart = move.theStopAndStartOfAMove({
    theUnitsReading: () => ({ enabledWord: 'enabled', activeWord: 'active' }),
    stopTheUnit: () => {
      calls.push('unit stop')
      return { ok: true, says: '' }
    },
    startTheUnit: () => {
      calls.push('unit start')
      return { ok: true, says: '' }
    },
    stopTheService: async () => {
      calls.push('service stop')
      return { ok: false, says: serviceSays }
    },
    startTheService: async () => {
      calls.push('service start')
      return { ok: true, says: '' }
    },
  })

  expect(await stopAndStart.stop()).toEqual({ ok: false, says: serviceSays })
  expect(calls).toEqual(['unit stop', 'service stop'])
})

it('DF6: a whole move with an active login unit stops the unit once and starts it once', async () => {
  const move = await theMove()
  const old = aDataFolder()
  const harness = aHarness(old)
  const unit = { stopped: 0, started: 0 }
  const service = { stopped: 0, started: 0 }
  const stopAndStart = move.theStopAndStartOfAMove({
    theUnitsReading: () => ({ enabledWord: 'enabled', activeWord: 'active' }),
    stopTheUnit: () => {
      unit.stopped += 1
      return { ok: true, says: '' }
    },
    startTheUnit: () => {
      unit.started += 1
      return { ok: true, says: '' }
    },
    stopTheService: async () => {
      service.stopped += 1
      return { ok: true, says: '' }
    },
    startTheService: async () => {
      service.started += 1
      return { ok: true, says: '' }
    },
  })
  harness.ways.stop = stopAndStart.stop
  harness.ways.start = stopAndStart.start

  const last = await theLastMark(move, harness)

  expect(last.state).toBe('started')
  expect(unit).toEqual({ stopped: 1, started: 1 })
  expect(service).toEqual({ stopped: 1, started: 0 })
  expect(envFileValues(harness.envFile)['MOLE_OFFICE_DB']).toBe(harness.newDatabase)
})

it('DF7: a whole move copies every file once, keeps a hard link, and copies neither the lock nor the portraits', async () => {
  const move = await theMove()
  const old = aDataFolder()
  const lockName = basename(serviceLockPathFrom({ MOLE_OFFICE_DB: old.database }))
  writeFileSync(join(old.folder, lockName), '{"lock":true}\n')
  mkdirSync(join(old.folder, 'portraits', 'custom'), { recursive: true })
  writeFileSync(join(old.folder, 'portraits', 'custom', 'a-picture.png'), Buffer.from([1, 2, 3, 4]))
  const harness = aHarness(old, { leaveOut: ['portraits/custom'] })
  const leaveOut = [lockName, 'portraits/custom']
  const before = move.theManifestOf(old.folder, move.theFilesOf(old.folder, leaveOut))
  const envBefore = readFileSync(harness.envFile, 'utf8')

  const last = await theLastMark(move, harness)

  expect(last.state).toBe('started')
  expect(existsSync(join(harness.target, 'mole-office.db'))).toBe(true)
  expect(readFileSync(join(harness.target, 'report-files', 'stored.txt'), 'utf8')).toBe('a stored file\n')
  const one = statSync(join(harness.target, 'backups', 'unchanged.db'))
  const two = statSync(join(harness.target, 'backups', 'unchanged-copy.db'))
  expect(one.ino).toBe(two.ino)
  expect(one.nlink).toBe(2)
  expect(existsSync(join(harness.target, lockName)), 'the service lock was not copied').toBe(false)
  expect(existsSync(join(harness.target, 'portraits')), 'the custom portraits were not copied').toBe(false)
  if (process.platform !== 'win32') {
    expect(statSync(harness.target).mode & 0o777).toBe(0o700)
    expect(statSync(join(harness.target, 'backups')).mode & 0o777).toBe(0o700)
  }
  expect(envFileValues(harness.envFile)['MOLE_OFFICE_DB']).toBe(harness.newDatabase)
  expect(envBefore.replace(`MOLE_OFFICE_DB=${old.database}`, `MOLE_OFFICE_DB=${harness.newDatabase}`)).toBe(
    readFileSync(harness.envFile, 'utf8'),
  )
  expect(move.theManifestOf(old.folder, move.theFilesOf(old.folder, leaveOut))).toEqual(before)
  expect(last.manifest).toEqual(before)
})

it('DF7: the custom portraits are left out only when they are inside the data folder', async () => {
  const move = await theMove()
  const folder = made('data-folder-move-portraits-')
  const lockName = basename(serviceLockPathFrom({ MOLE_OFFICE_DB: join(folder, 'mole-office.db') }))
  const insideRoot = join(folder, 'portrait-store')
  mkdirSync(join(insideRoot, 'data', 'portraits', 'custom'), { recursive: true })

  expect(move.theLeaveOutOf(folder, 'mole-office.db', insideRoot)).toEqual([
    lockName,
    join('portrait-store', 'data', 'portraits', 'custom'),
  ])

  const outsideRoot = made('data-folder-move-portraits-outside-')
  expect(move.theLeaveOutOf(folder, 'mole-office.db', outsideRoot)).toEqual([lockName])
})

it('DF7: on Windows a copied file is flushed through a handle opened for reading and writing, and elsewhere through one opened for reading', async () => {
  const move = await theMove()
  const folder = made('data-folder-move-flush-')
  const file = join(folder, 'a-copied-file')
  writeFileSync(file, 'a copied file\n')
  const handle = 97
  /** What the file calls were asked to do, in order. */
  const recorded: unknown[][] = []
  const recorder = {
    openSync: (...asked: unknown[]): number => {
      recorded.push(['openSync', ...asked])
      return handle
    },
    fsyncSync: (...asked: unknown[]): void => {
      recorded.push(['fsyncSync', ...asked])
    },
    closeSync: (...asked: unknown[]): void => {
      recorded.push(['closeSync', ...asked])
    },
  }
  const openedForReading = [
    ['openSync', file, 'r'],
    ['fsyncSync', handle],
    ['closeSync', handle],
  ]

  move.syncTheFile(file, 'win32', recorder)
  expect(recorded.splice(0), 'on Windows the file is opened for reading and writing, then flushed and closed').toEqual([
    ['openSync', file, 'r+'],
    ['fsyncSync', handle],
    ['closeSync', handle],
  ])

  move.syncTheFile(file, 'linux', recorder)
  expect(recorded.splice(0), 'on Linux the file is opened for reading, then flushed and closed').toEqual(openedForReading)

  move.syncTheFile(file, 'darwin', recorder)
  expect(recorded.splice(0), 'on the Mac the file is opened for reading, then flushed and closed').toEqual(openedForReading)

  // Root can read a file that mode 0o400 keeps from everyone else, so there the mode proves nothing and this is skipped.
  if (process.platform !== 'win32' && process.getuid?.() !== 0) {
    chmodSync(file, 0o400)
    expect(
      () => move.syncTheFile(file, 'linux'),
      'a read-only copy allows the handle opened for reading that flushes it',
    ).not.toThrow()
    chmodSync(file, 0o600)
  }
})

it('DF8: a copy that differs stops before the switch, leaves the .env alone and starts the old folder once', async () => {
  const move = await theMove()
  const old = aDataFolder()
  const harness = aHarness(old, {
    copy: (from, to, walk) => {
      move.copyTheFolder(from, to, walk as Parameters<TheMove['copyTheFolder']>[2])
      const stored = join(to, 'report-files', 'stored.txt')
      writeFileSync(stored, 'a stored file changed\n')
    },
  })
  const envBefore = readFileSync(harness.envFile)
  const folderBefore = move.theManifestOf(old.folder, move.theFilesOf(old.folder, []))

  const last = await theLastMark(move, harness)

  expect(last.state).toBe('stopped-before-the-switch')
  expect(last.says).toBe(move.theCopyDiffersWords(old.folder, harness.target, 'report-files/stored.txt'))
  expect(readFileSync(harness.envFile).equals(envBefore), 'the .env is unchanged byte for byte').toBe(true)
  expect(harness.calls.start).toBe(1)
  expect(harness.calls.startedWith).toEqual([old.database])
  expect(existsSync(join(harness.target, 'report-files', 'stored.txt')), 'the copy is left in place').toBe(true)
  expect(move.theManifestOf(old.folder, move.theFilesOf(old.folder, []))).toEqual(folderBefore)
})

it('DF8: a copied database that fails integrity_check stops before the switch', async () => {
  const move = await theMove()
  const old = aDataFolder()
  const bytes = readFileSync(old.database)
  bytes.fill(0, 4096, Math.min(8192, bytes.length))
  writeFileSync(old.database, bytes)
  const harness = aHarness(old)
  const envBefore = readFileSync(harness.envFile)

  const last = await theLastMark(move, harness)

  expect(last.state).toBe('stopped-before-the-switch')
  expect(last.says).not.toBeNull()
  expect(readFileSync(harness.envFile).equals(envBefore)).toBe(true)
  expect(harness.calls.start).toBe(1)
  expect(harness.calls.startedWith).toEqual([old.database])
})

it('DF9 and DF10: a started move leaves the .env naming the new database and the runtime naming it too', async () => {
  const move = await theMove()
  const old = aDataFolder()
  const harness = aHarness(old)

  const last = await theLastMark(move, harness)

  expect(last.state).toBe('started')
  expect(envFileValues(harness.envFile)['MOLE_OFFICE_DB']).toBe(harness.newDatabase)
  expect(harness.calls.start).toBe(1)
  expect(harness.calls.startedWith).toEqual([harness.newDatabase])
  expect(harness.calls.runtime).toBe(1)
  const read = move.readTheMoveMark(harness.markPath)
  expect(read.state).toBe('read')
  if (read.state === 'read') {
    expect(read.mark.state).toBe('started')
    expect(read.mark.to).toBe(harness.target)
    expect(read.mark.from).toBe(old.folder)
  }
  expect(readdirSync(dirname(harness.envFile)).some((name) => name.startsWith('.env.before-')), 'a backup is kept').toBe(true)
})

it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)(
  'DF9: an .env line whose write fails stops before the switch and starts the old folder once (skipped on Windows and as root, where mode 500 does not stop a write)',
  async () => {
    const move = await theMove()
    const old = aDataFolder()
    const envFile = anEnvFile(old.database)
    const envFolder = dirname(envFile)
    const label = `data-folder-move-${String(process.pid)}`
    let setTheLineSays = ''
    const harness = aHarness(old, {
      envFile,
      copy: (from, to, walk) => {
        move.copyTheFolder(from, to, walk as Parameters<TheMove['copyTheFolder']>[2])
        chmodSync(envFolder, 0o500)
        // THE ENGINE'S OWN WRITE IS THE ONE THAT MUST FAIL. This call takes setTheLine's words from setTheLine itself,
        // and it changes nothing because the folder is already read-only.
        try {
          setTheLine(envFile, 'MOLE_OFFICE_DB', join(to, basename(old.database)), label)
        } catch (error) {
          setTheLineSays = error instanceof Error ? error.message : String(error)
        }
      },
    })
    const envBefore = readFileSync(envFile)

    let last: AMark
    try {
      last = await theLastMark(move, harness)
    } finally {
      chmodSync(envFolder, 0o700)
    }

    expect(setTheLineSays, 'the write failed for the words this case reads').not.toBe('')
    expect(last.state).toBe('stopped-before-the-switch')
    expect(last.says).toBe(setTheLineSays)
    expect(readFileSync(envFile).equals(envBefore), 'the .env is unchanged byte for byte').toBe(true)
    expect(existsSync(join(harness.target, 'report-files', 'stored.txt')), 'the copy is left in place').toBe(true)
    expect(harness.calls.start).toBe(1)
    expect(harness.calls.startedWith).toEqual([old.database])
  },
)

it('DF11: a start that fails puts the .env back and starts the old folder', async () => {
  const move = await theMove()
  const old = aDataFolder()
  const startSays = 'The office did not start because this test said so.'
  const harness = aHarness(old, {
    start: (call) => (call === 1 ? { ok: false, says: startSays } : { ok: true, says: '' }),
  })
  const envBefore = readFileSync(harness.envFile)

  const last = await theLastMark(move, harness)

  expect(last.state).toBe('switched-back')
  expect(readFileSync(harness.envFile).equals(envBefore), 'the .env is back byte for byte').toBe(true)
  expect(harness.calls.start).toBe(2)
  expect(harness.calls.startedWith).toEqual([harness.newDatabase, old.database])
  expect(last.says).toContain(startSays)
})

it('DF11: the switch-back stops the office it started while the .env still names the new folder, and then puts the .env back', async () => {
  const move = await theMove()
  const old = aDataFolder()
  const envFile = anEnvFile(old.database)
  const startSays = 'The office did not start on the new folder because this test said so.'
  const stops: (string | null)[] = []
  const harness = aHarness(old, {
    envFile,
    stop: () => {
      stops.push(envFileValues(envFile)['MOLE_OFFICE_DB'] ?? null)
      return { ok: true, says: '' }
    },
    start: (call) => (call === 1 ? { ok: false, says: startSays } : { ok: true, says: '' }),
  })
  const envBefore = readFileSync(envFile)

  const last = await theLastMark(move, harness)

  expect(last.state, 'the move did not switch back').toBe('switched-back')
  expect(stops, 'the switch-back did not stop while the .env still named the new folder').toEqual([old.database, harness.newDatabase])
  expect(readFileSync(envFile).equals(envBefore), 'the .env is back byte for byte').toBe(true)
  expect(harness.calls.startedWith, 'the office was started on the new folder and then on the old').toEqual([harness.newDatabase, old.database])
})

it('DF11: a start that names another database puts the .env back and starts the old folder', async () => {
  const move = await theMove()
  const old = aDataFolder()
  const harness = aHarness(old, { runtime: () => old.database })
  const envBefore = readFileSync(harness.envFile)

  const last = await theLastMark(move, harness)

  expect(last.state).toBe('switched-back')
  expect(readFileSync(harness.envFile).equals(envBefore)).toBe(true)
  expect(harness.calls.start).toBe(2)
  expect(harness.calls.startedWith).toEqual([harness.newDatabase, old.database])
  expect(last.says).toBe(
    move.theMoveWasSwitchedBackWords(
      harness.markPath,
      old.folder,
      move.whyTheNewStartWasNotTaken(old.database, harness.newDatabase),
      null,
      { ok: true, says: '' },
    ),
  )
})

it('DF11: a start whose office names no database before the wait ends counts as a start that failed, and does not say it names another database', async () => {
  const move = await theMove()
  const old = aDataFolder()
  const harness = aHarness(old, { runtime: () => null })
  const envBefore = readFileSync(harness.envFile)

  const last = await theLastMark(move, harness)

  expect(last.state, 'a slow start switches back').toBe('switched-back')
  expect(readFileSync(harness.envFile).equals(envBefore), 'the .env is back byte for byte').toBe(true)
  expect(harness.calls.startedWith, 'the office was started from the new folder and then from the old').toEqual([harness.newDatabase, old.database])
  expect(last.says, 'the reason says the office did not say which database it uses before the wait ran out').toBe(
    move.theMoveWasSwitchedBackWords(
      harness.markPath,
      old.folder,
      move.whyTheNewStartWasNotTaken(null, harness.newDatabase),
      null,
      { ok: true, says: '' },
    ),
  )
  expect(last.says, 'the reason does not say the office names another database').not.toContain(
    move.whyTheNewStartWasNotTaken('null', harness.newDatabase),
  )
})

it('DF8: a copy that differs and a start from the old folder that fails says the office is stopped, in the start\'s words', async () => {
  const move = await theMove()
  const old = aDataFolder()
  const startSays = 'The office did not start because this test said so.'
  const harness = aHarness(old, {
    copy: (from, to, walk) => {
      move.copyTheFolder(from, to, walk as Parameters<TheMove['copyTheFolder']>[2])
      writeFileSync(join(to, 'report-files', 'stored.txt'), 'a stored file changed\n')
    },
    start: () => ({ ok: false, says: startSays }),
  })

  const last = await theLastMark(move, harness)

  expect(last.state).toBe('stopped-before-the-switch')
  const differs = move.theCopyDiffersWords(old.folder, harness.target, 'report-files/stored.txt')
  expect(last.says).toBe(`${differs} ${move.theOfficeDidNotStartAgainWords(startSays)}`)
  expect(last.says).toContain(startSays)
  expect(harness.calls.startedWith).toEqual([old.database])
  const read = move.readTheMoveMark(harness.markPath)
  expect(read.state === 'read' ? read.mark.says : null, 'the mark on disk says it too').toBe(last.says)
})

it('DF11: a start from the old folder that fails too is not called a start, and says the office is stopped', async () => {
  const move = await theMove()
  const old = aDataFolder()
  const firstSays = 'The office did not start on the new folder because this test said so.'
  const againSays = 'The office did not start on the old folder because this test said so.'
  const harness = aHarness(old, {
    start: (call) => ({ ok: false, says: call === 1 ? firstSays : againSays }),
  })
  const envBefore = readFileSync(harness.envFile)

  const last = await theLastMark(move, harness)

  expect(last.state).toBe('switched-back')
  expect(readFileSync(harness.envFile).equals(envBefore), 'the .env is back byte for byte').toBe(true)
  expect(harness.calls.startedWith).toEqual([harness.newDatabase, old.database])
  expect(last.says).toBe(
    move.theMoveWasSwitchedBackWords(harness.markPath, old.folder, firstSays, null, { ok: false, says: againSays }),
  )
  expect(last.says).not.toBe(move.theMoveWasSwitchedBackWords(harness.markPath, old.folder, firstSays, null, { ok: true, says: '' }))
  expect(last.says).toContain(move.theOfficeDidNotStartAgainWords(againSays))
  expect(last.says).not.toContain('the office was started')
})

it('DF11: a .env backup that cannot be put back is not called put back, and the .env still names the new database', async () => {
  const move = await theMove()
  const old = aDataFolder()
  const envFile = anEnvFile(old.database)
  const theBackups = () => readdirSync(dirname(envFile)).filter((name) => name.startsWith('.env.before-'))
  const harness = aHarness(old, {
    envFile,
    // The first start fails after taking the move's backup away, so the put-back has nothing to read.
    start: (call) => {
      if (call === 1) for (const name of theBackups()) rmSync(join(dirname(envFile), name))
      return call === 1 ? { ok: false, says: 'The office did not start because this test said so.' } : { ok: true, says: '' }
    },
  })

  const last = await theLastMark(move, harness)

  expect(last.state).toBe('switched-back')
  expect(envFileValues(envFile)['MOLE_OFFICE_DB'], 'the .env was not put back').toBe(harness.newDatabase)
  expect(harness.calls.startedWith).toEqual([harness.newDatabase, harness.newDatabase])
  expect(last.says).not.toContain('the .env was put back')
  expect(last.says).toContain('was not put back')
})

it('DF11: a switch-back whose stop fails starts nothing and says an office may still run from the new folder', async () => {
  const move = await theMove()
  const old = aDataFolder()
  const startSays = 'The office did not start on the new folder because this test said so.'
  const stopSays = 'The office did not stop because this test said so.'
  const harness = aHarness(old, {
    start: (call) => (call === 1 ? { ok: false, says: startSays } : { ok: true, says: '' }),
    stop: (call) => (call === 2 ? { ok: false, says: stopSays } : { ok: true, says: '' }),
  })
  const envBefore = readFileSync(harness.envFile)

  const last = await theLastMark(move, harness)

  expect(last.state).toBe('switched-back')
  expect(readFileSync(harness.envFile).equals(envBefore), 'the .env is back byte for byte').toBe(true)
  expect(harness.calls.start).toBe(1)
  expect(harness.calls.startedWith).toEqual([harness.newDatabase])
  expect(last.says).toBe(move.theSwitchBackCouldNotStopWords(harness.markPath, harness.target, startSays, null, stopSays))
  expect(last.says).toContain(stopSays)
  expect(last.says).toContain(harness.target)
})

it('DF11: after a unit start that failed, the switch-back stops and starts the service and not the unit', async () => {
  const move = await theMove()
  const old = aDataFolder()
  const harness = aHarness(old)
  const calls: string[] = []
  const unitSays = 'The login unit did not start because this test said so.'
  let reading = 0
  const stopAndStart = move.theStopAndStartOfAMove({
    theUnitsReading: () => {
      reading += 1
      return reading === 1
        ? { enabledWord: 'disabled', activeWord: 'active' }
        : { enabledWord: 'disabled', activeWord: 'failed' }
    },
    stopTheUnit: () => {
      calls.push('stop the unit')
      return { ok: true, says: '' }
    },
    startTheUnit: () => {
      calls.push('start the unit')
      return { ok: false, says: unitSays }
    },
    stopTheService: async () => {
      calls.push('stop the service')
      return { ok: true, says: '' }
    },
    startTheService: async () => {
      calls.push('start the service')
      return { ok: true, says: '' }
    },
  })
  harness.ways.stop = stopAndStart.stop
  harness.ways.start = stopAndStart.start
  const envBefore = readFileSync(harness.envFile)

  const last = await theLastMark(move, harness)

  expect(last.state).toBe('switched-back')
  expect(calls).toEqual([
    'stop the unit',
    'stop the service',
    'start the unit',
    'stop the service',
    'start the service',
  ])
  expect(last.says).toContain(unitSays)
  expect(readFileSync(harness.envFile).equals(envBefore), 'the .env is back byte for byte').toBe(true)
})

it('DF11: a unit started during the move is stopped by the switch-back and started again instead of the service', async () => {
  const move = await theMove()
  const old = aDataFolder()
  const harness = aHarness(old, { runtime: () => old.database })
  const calls: string[] = []
  let reading = 0
  const stopAndStart = move.theStopAndStartOfAMove({
    theUnitsReading: () => {
      reading += 1
      return reading === 1
        ? { enabledWord: 'disabled', activeWord: 'inactive' }
        : { enabledWord: 'disabled', activeWord: 'active' }
    },
    stopTheUnit: () => {
      calls.push('stop the unit')
      return { ok: true, says: '' }
    },
    startTheUnit: () => {
      calls.push('start the unit')
      return { ok: true, says: '' }
    },
    stopTheService: async () => {
      calls.push('stop the service')
      return { ok: true, says: '' }
    },
    startTheService: async () => {
      calls.push('start the service')
      return { ok: true, says: '' }
    },
  })
  harness.ways.stop = stopAndStart.stop
  harness.ways.start = stopAndStart.start
  const envBefore = readFileSync(harness.envFile)

  const last = await theLastMark(move, harness)

  expect(last.state).toBe('switched-back')
  expect(calls).toEqual([
    'stop the service',
    'start the service',
    'stop the unit',
    'stop the service',
    'start the unit',
  ])
  expect(readFileSync(harness.envFile).equals(envBefore), 'the .env is back byte for byte').toBe(true)
})

// ============================================================ DF13 to DF15, starting while a move runs

it('DF13: a copying mark with a living mover keeps the office closed and names the mark, the folders and the state', async () => {
  const move = await theMove()
  const folder = made('data-folder-move-closed-')
  const markPath = join(folder, 'data-folder-move.json')
  const mark = aMarkOfThisProcess('copying', '/a/old/data', '/a/new/data')
  move.writeTheMoveMark(markPath, mark)

  const refused = move.whyADataFolderMoveKeepsTheOfficeClosed(markPath)

  expect(refused).toBe(move.theOfficeStaysClosedWords(markPath, mark))
  expect(refused).toContain(markPath)
  expect(refused).toContain('/a/old/data')
  expect(refused).toContain('/a/new/data')
  expect(refused).toContain('copying')
})

it('DF14: a start is let through when the mover has ended and when the mark is past the switch', async () => {
  const move = await theMove()
  const markPath = join(made('data-folder-move-dead-'), 'data-folder-move.json')
  const ended = spawnSync(process.execPath, ['-e', ''])
  expect(ended.pid).toBeGreaterThan(0)
  const mark = aMarkOfThisProcess('copying', '/a/old/data', '/a/new/data')
  mark.mover = { pid: ended.pid as number, startedAt: '2026-01-01 00:00:00' }
  move.writeTheMoveMark(markPath, mark)

  expect(move.whyADataFolderMoveKeepsTheOfficeClosed(markPath)).toBeNull()

  move.writeTheMoveMark(markPath, aMarkOfThisProcess('started', '/a/old/data', '/a/new/data'))
  expect(move.whyADataFolderMoveKeepsTheOfficeClosed(markPath)).toBeNull()
})

it('DF15: an unreadable mark keeps the office closed and says to remove it when no move is running', async () => {
  const move = await theMove()
  const markPath = join(made('data-folder-move-broken-'), 'data-folder-move.json')
  writeFileSync(markPath, 'this is not a mark')
  const read = move.readTheMoveMark(markPath)
  expect(read.state).toBe('unreadable')
  if (read.state !== 'unreadable') throw new Error('the mark should be unreadable')

  expect(move.whyADataFolderMoveKeepsTheOfficeClosed(markPath)).toBe(
    move.theOfficeStaysClosedForAnUnreadableMarkWords(markPath, read.why),
  )
})

// ============================================================ DF16, after the move

it('DF16: the confirm removes only the names whose bytes still match, names what stayed and keeps the old folder as earlier', async () => {
  const move = await theMove()
  const old = aDataFolder()
  const harness = aHarness(old)
  const last = await theLastMark(move, harness)
  expect(last.state).toBe('started')
  const manifest = last.manifest as Record<string, string>

  writeFileSync(join(old.folder, 'report-files', 'added.txt'), 'added after the move\n')
  writeFileSync(join(old.folder, 'report-files', 'stored.txt'), 'changed after the move\n')

  const answer = move.confirmTheMove(harness.markPath, harness.newDatabase)
  if ('refused' in answer) throw new Error(`the confirm was refused: ${answer.refused}`)

  expect(answer.removed.sort()).toEqual(Object.keys(manifest).filter((name) => name !== 'report-files/stored.txt').sort())
  expect(answer.kept.sort()).toEqual(['report-files/added.txt', 'report-files/stored.txt'])
  expect(existsSync(join(old.folder, 'report-files', 'added.txt'))).toBe(true)
  expect(readFileSync(join(old.folder, 'report-files', 'stored.txt'), 'utf8')).toBe('changed after the move\n')
  expect(existsSync(join(old.folder, 'backups')), 'a folder left empty goes').toBe(false)
  expect(existsSync(join(old.folder, 'keys.json'))).toBe(false)
  expect(existsSync(join(old.folder, 'mole-office.db'))).toBe(false)

  const read = move.readTheMoveMark(harness.markPath)
  expect(read.state).toBe('read')
  if (read.state === 'read') {
    expect(read.mark.state).toBe('confirmed')
    expect(read.mark.earlier).toEqual([old.folder])
  }
})

it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)(
  'DF16: a file and a folder the confirm cannot read stay, are named among the kept, and the rest is confirmed (skipped on Windows and as root, where mode 0 does not stop a read)',
  async () => {
    const move = await theMove()
    const old = aDataFolder()
    const harness = aHarness(old)
    const last = await theLastMark(move, harness)
    expect(last.state).toBe('started')
    const manifest = last.manifest as Record<string, string>
    const unreadFile = join(old.folder, 'report-files', 'stored.txt')
    const unreadFolder = join(old.folder, 'backups')
    chmodSync(unreadFile, 0)
    chmodSync(unreadFolder, 0)
    let answer: ReturnType<TheMove['confirmTheMove']>
    try {
      answer = move.confirmTheMove(harness.markPath, harness.newDatabase)
    } finally {
      chmodSync(unreadFolder, 0o700)
      chmodSync(unreadFile, 0o600)
    }

    if ('refused' in answer) throw new Error(`the confirm was refused: ${answer.refused}`)
    expect(answer.kept).toEqual(['backups/', 'report-files/stored.txt'])
    expect(answer.removed.sort()).toEqual(
      Object.keys(manifest).filter((name) => name !== 'report-files/stored.txt' && !name.startsWith('backups/')).sort(),
    )
    expect(readFileSync(unreadFile, 'utf8')).toBe('a stored file\n')
    expect(readdirSync(unreadFolder).sort()).toEqual(['unchanged-copy.db', 'unchanged.db'])
    expect(existsSync(join(old.folder, 'keys.json'))).toBe(false)
    const read = move.readTheMoveMark(harness.markPath)
    expect(read.state).toBe('read')
    if (read.state === 'read') expect(read.mark.state).toBe('confirmed')
  },
)

it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)(
  'DF16: an old folder the confirm cannot read is refused in its own words, removes nothing and leaves the mark at started (skipped on Windows and as root, where mode 0 does not stop a read)',
  async () => {
    const move = await theMove()
    const old = aDataFolder()
    const harness = aHarness(old)
    const last = await theLastMark(move, harness)
    expect(last.state).toBe('started')
    const markBefore = readFileSync(harness.markPath, 'utf8')
    chmodSync(old.folder, 0)
    let answer: ReturnType<TheMove['confirmTheMove']>
    let why = ''
    try {
      try {
        readdirSync(old.folder)
      } catch (error) {
        why = error instanceof Error ? error.message : String(error)
      }
      answer = move.confirmTheMove(harness.markPath, harness.newDatabase)
    } finally {
      chmodSync(old.folder, 0o700)
    }

    expect(why, 'mode 0 stops the read here').not.toBe('')
    expect(answer).toEqual({ refused: move.theOldFolderCannotBeReadWords(harness.markPath, old.folder, why) })
    expect(readFileSync(harness.markPath, 'utf8')).toBe(markBefore)
    expect(existsSync(join(old.folder, 'keys.json'))).toBe(true)
    expect(readFileSync(join(old.folder, 'report-files', 'stored.txt'), 'utf8')).toBe('a stored file\n')
  },
)

it('DF16: an old folder that is gone is confirmed, with nothing removed and nothing kept', async () => {
  const move = await theMove()
  const old = aDataFolder()
  const harness = aHarness(old)
  const last = await theLastMark(move, harness)
  expect(last.state).toBe('started')
  rmSync(old.folder, { recursive: true, force: true })

  expect(move.confirmTheMove(harness.markPath, harness.newDatabase)).toEqual({ removed: [], kept: [] })
  const read = move.readTheMoveMark(harness.markPath)
  expect(read.state).toBe('read')
  if (read.state === 'read') expect(read.mark.state).toBe('confirmed')
})

it('DF16: a confirm is refused while the mark says the move was switched back', async () => {
  const move = await theMove()
  const old = aDataFolder()
  const markPath = join(made('data-folder-move-confirm-'), 'data-folder-move.json')
  const mark = aMarkOfThisProcess('switched-back', old.folder, '/a/new/data')
  mark.manifest = { 'report-files/stored.txt': hashOf(join(old.folder, 'report-files', 'stored.txt')) }
  move.writeTheMoveMark(markPath, mark)
  const before = readFileSync(markPath, 'utf8')

  expect(move.confirmTheMove(markPath, '/a/new/data/mole-office.db')).toEqual({
    refused: move.theConfirmNeedsAStartedMoveWords(markPath, 'switched-back'),
  })
  expect(existsSync(join(old.folder, 'report-files', 'stored.txt'))).toBe(true)
  expect(readFileSync(markPath, 'utf8')).toBe(before)
})

it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)(
  'DF16: an empty folder that cannot be removed is kept by its name and the confirm goes on (skipped on Windows and as root, where mode 500 does not stop a write)',
  async () => {
    const move = await theMove()
    const old = aDataFolder()
    const held = join(old.folder, 'held')
    mkdirSync(join(held, 'inner'), { recursive: true })
    writeFileSync(join(held, 'inner', 'kept-copy.txt'), 'a file the move copies\n')
    const harness = aHarness(old)
    const last = await theLastMark(move, harness)
    expect(last.state).toBe('started')

    chmodSync(held, 0o500)
    let answer: ReturnType<TheMove['confirmTheMove']>
    try {
      answer = move.confirmTheMove(harness.markPath, harness.newDatabase)
    } finally {
      chmodSync(held, 0o700)
    }

    if ('refused' in answer) throw new Error(`the confirm was refused: ${answer.refused}`)
    expect(existsSync(join(held, 'inner', 'kept-copy.txt')), 'the copied file was removed').toBe(false)
    expect(answer.kept).toContain('held/inner/')
    expect(answer.kept).not.toContain('held/')
    expect(readdirSync(held)).toEqual(['inner'])
    const read = move.readTheMoveMark(harness.markPath)
    expect(read.state).toBe('read')
    if (read.state === 'read') expect(read.mark.state).toBe('confirmed')
  },
)

// ============================================================ DF21, ending a move stuck at switched

it('DF21: a confirm at switched is taken when its mover has ended and the new database is in use', async () => {
  const move = await theMove()
  const old = aDataFolder()
  const harness = aHarness(old)
  const ended = spawnSync(process.execPath, ['-e', ''])
  const mark = aMarkOfThisProcess('switched', old.folder, harness.target)
  mark.mover = { pid: ended.pid as number, startedAt: '2026-01-01 00:00:00' }
  mark.manifest = { 'keys.json': hashOf(join(old.folder, 'keys.json')) }
  move.writeTheMoveMark(harness.markPath, mark)

  const answer = move.confirmTheMove(harness.markPath, harness.newDatabase)

  if ('refused' in answer) throw new Error(`the confirm was refused: ${answer.refused}`)
  expect(existsSync(join(old.folder, 'keys.json')), 'the copied file was removed').toBe(false)
  expect(answer.removed).toEqual(['keys.json'])
  const read = move.readTheMoveMark(harness.markPath)
  expect(read.state).toBe('read')
  if (read.state === 'read') {
    expect(read.mark.state).toBe('confirmed')
    expect(read.mark.earlier).toEqual([old.folder])
  }
})

it('DF21: a confirm at switched waits while its mover is alive and removes nothing', async () => {
  const move = await theMove()
  const old = aDataFolder()
  const harness = aHarness(old)
  const mark = aMarkOfThisProcess('switched', old.folder, harness.target)
  mark.manifest = { 'keys.json': hashOf(join(old.folder, 'keys.json')) }
  move.writeTheMoveMark(harness.markPath, mark)
  const before = readFileSync(harness.markPath, 'utf8')

  expect(move.confirmTheMove(harness.markPath, harness.newDatabase)).toEqual({
    refused: move.theConfirmWaitsForTheMoverWords(harness.markPath, mark.mover.pid),
  })
  expect(existsSync(join(old.folder, 'keys.json'))).toBe(true)
  expect(readFileSync(harness.markPath, 'utf8')).toBe(before)
})

it('DF21: a confirm at switched with another database in use is refused and removes nothing', async () => {
  const move = await theMove()
  const old = aDataFolder()
  const harness = aHarness(old)
  const ended = spawnSync(process.execPath, ['-e', ''])
  const mark = aMarkOfThisProcess('switched', old.folder, harness.target)
  mark.mover = { pid: ended.pid as number, startedAt: '2026-01-01 00:00:00' }
  mark.manifest = { 'keys.json': hashOf(join(old.folder, 'keys.json')) }
  move.writeTheMoveMark(harness.markPath, mark)

  expect(move.confirmTheMove(harness.markPath, old.database)).toEqual({
    refused: move.theConfirmNeedsTheNewDatabaseWords(harness.markPath, harness.newDatabase, old.database),
  })
  expect(existsSync(join(old.folder, 'keys.json'))).toBe(true)
})

// ============================================================ DF20, what the door hands the mover

it('DF20: the environment the mover is handed drops a name the .env load supplied and keeps a name it did not', async () => {
  const move = await theMove()
  const folder = made('data-folder-move-mover-env-')
  const file = join(folder, '.env')
  const FROM_THE_FILE = 'A_NAME_THE_MOVER_ENV_FILE_SUPPLIED'
  const FROM_THE_SHELL = 'A_NAME_THE_MOVER_SHELL_SET'
  const before = {
    [FROM_THE_FILE]: process.env[FROM_THE_FILE],
    [FROM_THE_SHELL]: process.env[FROM_THE_SHELL],
  }
  try {
    delete process.env[FROM_THE_FILE]
    process.env[FROM_THE_SHELL] = 'from-the-shell'
    writeFileSync(file, `${FROM_THE_FILE}=the-old-value\n`)
    loadEnvFileIntoProcess(file)
    // THE FILE CHANGED AFTER THE LOAD, which is the state a server that has run for a while is in.
    writeFileSync(file, `${FROM_THE_FILE}=the-new-value\n`)

    const handed = move.theEnvironmentTheMoverIsHanded({ ...process.env }, file)

    expect(handed[FROM_THE_FILE], 'a name the .env load supplied was handed to the mover').toBeUndefined()
    expect(handed[FROM_THE_SHELL], 'a name the shell set was dropped').toBe('from-the-shell')
    expect(Object.values(handed)).not.toContain('the-new-value')
  } finally {
    for (const [name, value] of Object.entries(before)) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
    forgetWhatTheEnvFileSupplied()
  }
})

it("DF20: the mover's log is beside the mark, not beside the database", async () => {
  const move = await theMove()
  const markPath = join(made('data-folder-move-mover-log-'), 'data-folder-move.json')

  const path = move.theMoverLogPath(markPath)

  expect(path).toBe(join(dirname(markPath), move.THE_MOVER_LOG))
  expect(dirname(path)).toBe(dirname(markPath))
})
