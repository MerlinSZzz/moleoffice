#!/usr/bin/env node
// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * HAND ONE VERIFIED BACKUP TO THE LAB SERVER, THROUGH THE LAB SERVER'S PROGRAM, AND SHOW ONLY THAT BACKUP.
 *
 * The office's backup door files a host job naming this tool and one backup's own name. The host job
 * runner starts this program with that name and nothing else, in the office's own data folder. This
 * program builds everything else itself: the folder and the snapshot's name. The lab server, the
 * folder on it, the lab server's program and the shared lock come from the environment or the office's
 * settings file, and a hand-over missing any of them refuses before it copies anything.
 *
 * ---------------------------------------------------------------------------------------
 * ONE JOB FOLDER OF HARD LINKS, NEVER A SECOND COPY
 * ---------------------------------------------------------------------------------------
 *
 * A folder named from the backup's id is made under `<the office's data folder>/handover-staging/`,
 * beside the backups folder and never inside it, so the list, the prune and the floor never read it.
 * It holds hard links to exactly that backup's `.db`, its files folder and its left-out list, and
 * the manifest. The lab server's program is given that folder with `data`. A link takes no room and the published backup is
 * never written, so its name, its files and its retention are as they were. A hard link that cannot
 * be made, as across filesystems, fails the job and copies nothing.
 *
 * ---------------------------------------------------------------------------------------
 * THE JOURNAL, BEFORE THE UPLOAD
 * ---------------------------------------------------------------------------------------
 *
 * Before anything leaves this machine the tool writes an fsynced journal into the runner's own job
 * folder (`HOST_JOB_OUTPUT`'s parent), recording the job, the backup, the folder, and for every
 * staged file its relative path, device, inode, size and mtime, with the database's sha256. The
 * runner calls this same program with `--recover <job id>` after a lost job's scope has stopped;
 * recovery trusts nothing in the journal until it has checked the folder, the paths and every file.
 *
 * ---------------------------------------------------------------------------------------
 * ONE RSYNC AT A TIME
 * ---------------------------------------------------------------------------------------
 *
 * The lab server takes one rsync at a time (review RBAVJ4IvVIoc). Both the snapshot and the
 * checksum dry run are held under the exclusive flock at the path HAND_OVER_LOCK names, which the
 * lab server's movers also take, and they wait first while any process's argv names an rsync to that
 * server or the lab server's program with `data` or `git`. The wait is bounded by the same two hours
 * that is the tool's declared time limit. No second lock is invented.
 *
 * ---------------------------------------------------------------------------------------
 * THE PROOF, AND WHAT THE TOOL NEVER DOES
 * ---------------------------------------------------------------------------------------
 *
 * The snapshot's name is built from the backup's own id and date, never from the request. After
 * the lab server's program reports the snapshot's stamp, the tool runs
 * `rsync -a -n -c --itemize-changes <folder>/ <server>:<path>/<name>/<stamp>/` and requires zero
 * file differences. A folder whose proof fails is kept and named. The tool never lists or deletes
 * anything on the lab server: deletion there is one secretary's alone.
 *
 * The test stand-ins set the `HAND_OVER_*` settings below in a child's environment. The runner gives
 * a tool an environment built from nothing, so the lab server, its folder, the lab server's program and
 * the lock come from the environment first, then the office's settings file; an empty environment value
 * is unset. None of the four has a default.
 */
import { spawn } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import {
  closeSync,
  constants,
  existsSync,
  fstatSync,
  fsyncSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  readSync,
  realpathSync,
  renameSync,
  rmdirSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
  writeSync,
} from 'node:fs'
import { basename, dirname, isAbsolute, join, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import {
  isABackupName,
  THE_HAND_OVER_JOURNAL,
  THE_HAND_OVER_MANIFEST,
  THE_HAND_OVER_TIME_LIMIT_SECONDS,
  THE_HANDING_OVER_FOLDER,
  theBackupId,
  theFilesFolderOf,
  theHandOverServerName,
  theLeftOutListOf,
  theWaitForTheVaultWindow,
} from '../src/shared/backup-hand-over.mjs'
import { clockStamp } from '../src/shared/time.ts'
import { ENV_FILE, envFileValues, readSettingHere } from '../src/config/settings.mjs'

/** Every sentence this tool says, each once. */
export const THE_TOOL_WORDS = {
  /** @param {string} name */
  notABackupName: (name) => `"${name}" is not one of this office's backups, so nothing was handed over.`,
  /** @param {string} name */
  noBackup: (name) => `The backup ${name} is not in this office's backups folder, so nothing was handed over.`,
  /** @param {string} name @param {string} why */
  notACompleteBackup: (name, why) => `The backup ${name} is not complete (${why}), so nothing was handed over.`,
  noBackupsFolder: 'This office has no backups folder, so there is nothing to hand over.',
  /** @param {string} name */
  notASqliteDatabase: (name) => `The backup ${name} is not a SQLite database, so nothing was handed over.`,
  /** @param {string} folder */
  anotherJobsFolder: (folder) => `The hand-over folder ${folder} is already there, so it belongs to another job, and this job touched nothing.`,
  /** @param {string} folder */
  notOnOneFilesystem: (folder) => `A hard link into ${folder} cannot be made, because it is on another filesystem, so the job copies nothing and hands nothing over.`,
  /** @param {string} path @param {string} why */
  cannotLink: (path, why) => `A hard link to ${path} cannot be made (${why}), so the job copies nothing and hands nothing over.`,
  /** @param {string} file */
  noJournal: (file) => `The journal ${file} is not there, so nothing was removed.`,
  /** @param {string} file */
  journalNotAJournalledFile: (file) => `The journal ${file} is not a regular file of this job's, so nothing was removed.`,
  /** @param {string} file @param {string} why */
  journalUnreadable: (file, why) => `The journal ${file} cannot be read (${why}), so nothing was removed.`,
  /** @param {string} jobId */
  anotherJobsJournal: (jobId) => `That journal is not the journal of job ${jobId}, so nothing was removed.`,
  /** @param {string} folder */
  journalFolderEscapes: (folder) => `The journal names the folder ${folder}, which is not this job's own folder under the handing-over root, so nothing was removed.`,
  /** @param {string} folder */
  theFolderIsALink: (folder) => `The folder ${folder} is a link, so it is not this job's own folder and nothing was removed.`,
  /** @param {string} path */
  anExtraFile: (path) => `The folder holds ${path}, which the journal does not list, so nothing was removed.`,
  /** @param {string} path */
  aMissingFile: (path) => `The journal lists ${path}, and it is not there, so nothing was removed.`,
  /** @param {string} path */
  aReplacement: (path) => `The file ${path} is not the one the journal recorded (its device, inode, size or mtime changed), so nothing was removed.`,
  /** @param {string} path */
  aLink: (path) => `The path ${path} is a link or not a regular file, so nothing was removed.`,
  /** @param {string} path */
  aFolderThatIsNotOne: (path) => `The path ${path} is not a folder, so nothing was removed.`,
  /** @param {string} path @param {string} why */
  aFolderThatCannotBeRead: (path, why) => `The folder ${path} cannot be read (${why}), so nothing was removed.`,
  /** @param {string} folder */
  removed: (folder) => `The hand-over folder ${folder} was checked against its journal and removed.`,
  /** @param {string} folder */
  alreadyGone: (folder) => `The hand-over folder ${folder} was already gone.`,
  /** @param {string} folder @param {string} why */
  kept: (folder, why) => `The hand-over folder ${folder} was kept: ${why}`,
  /** @param {string} name */
  emptyName: 'No backup was named, so nothing was handed over.',
  noLabServer:
    "HAND_OVER_LAB_SERVER is not set, so set it in the office's settings file to name the lab server a hand-over goes to.",
  noLabRoot:
    "HAND_OVER_LAB_ROOT is not set, so set it in the office's settings file to name the folder on the lab server a hand-over goes to.",
  noProgram:
    "HAND_OVER_PROGRAM is not set, so set it in the office's settings file to name the lab server's program that takes a hand-over's snapshot.",
  noLock:
    "HAND_OVER_LOCK is not set, so set it in the office's settings file to name the lock every mover to the lab server holds.",
  lockNotAbsolute:
    "HAND_OVER_LOCK is not an absolute path, so set it in the office's settings file to the absolute path of the lock every mover to the lab server holds.",
  /** @param {number} seconds */
  theVaultWindowIsHere: (seconds) =>
    `The Vault push's copy runs until 02:45, and waiting for it would take the job past its two-hour limit (${seconds} seconds were left), so nothing was handed over.`,
  /** @param {number} seconds */
  theServerStayedBusy: (seconds) => `The lab server stayed busy for ${seconds} seconds, so nothing was handed over.`,
  /** @param {string} why */
  snapshotNotTaken: (why) => `The snapshot could not be taken: ${why}`,
  /** @param {string} said */
  programFailed: (said) => `The lab server's program did not report a snapshot: ${said}`,
  /** @param {string} said */
  noSnapshot: (said) => `The lab server's program ended without a line that names a snapshot: ${said}`,
  /** @param {string} stamp @param {string} said */
  theProofDidNotSucceed: (stamp, said) =>
    said === ''
      ? `The checksum check of ${stamp} did not succeed, and it said nothing.`
      : `The checksum check of ${stamp} did not succeed: ${said}`,
  /** @param {number} differences @param {string} folder @param {string} stamp */
  theProofFailed: (differences, folder, stamp) =>
    `The checksum proof found ${differences} file ${differences === 1 ? 'difference' : 'differences'} between the folder and ${stamp} on the lab server, so the folder ${folder} is kept for inspection.`,
  /** @param {string} before @param {string} after */
  theHashChanged: (before, after) => `The database's sha256 changed while it was handed over (${before} became ${after}), so the copy is not a copy of this backup.`,
  /** @param {string} stamp */
  unknownStamp: (stamp) => `A partial copy may exist on the lab server under this hand-over's name, and its stamp is unknown.${stamp}`,
  /** @param {string} name @param {string} stamp */
  knownStamp: (name, stamp) => `A partial copy may exist on the lab server at ${name}/${stamp}.`,
  done: 'The backup was handed to the lab server, and the checksum proof found no file differences.',
}

/** The self this program re-runs under `flock`, so the lock is held while the command runs. */
const THE_TOOL_FILE = fileURLToPath(import.meta.url)

/**
 * THE FOUR SETTINGS THAT SAY WHERE A HAND-OVER GOES AND HOW, read through the settings module: the lab
 * server, the folder on it, the lab server's program and the shared lock. The environment comes first,
 * but an empty value there says nothing, so the office's settings file is read next. An empty value in
 * that file is nothing too. None is a runtime setting, so handing `readSettingHere` a caller's own
 * environment keeps it away from the office's database. None has a default, so each is null until one
 * of the two names it.
 *
 * @param {Record<string, string | undefined>} [env]
 * @param {string} [file]
 * @returns {{ server: string | null, root: string | null, program: string | null, lock: string | null }}
 */
export function theHandOverPlace(env = process.env, file = ENV_FILE) {
  const inTheFile = envFileValues(file)
  /** @param {string} name @returns {string | null} */
  const read = (name) => {
    const fromTheEnvironment = env[name]
    const namedInTheEnvironment = fromTheEnvironment !== undefined && fromTheEnvironment.trim() !== '' ? fromTheEnvironment : undefined
    const namedInTheFile = (inTheFile[name] ?? '').trim() !== '' ? inTheFile[name] : undefined
    if (namedInTheEnvironment === undefined && namedInTheFile === undefined) return null
    const reading = readSettingHere(name, namedInTheEnvironment === undefined ? {} : { [name]: namedInTheEnvironment }, file)
    return reading.value
  }
  return {
    server: read('HAND_OVER_LAB_SERVER'),
    root: read('HAND_OVER_LAB_ROOT'),
    program: read('HAND_OVER_PROGRAM'),
    lock: read('HAND_OVER_LOCK'),
  }
}

/**
 * THE TEST STAND-INS, read once at each use. They are this tool's, never a request's, and a test sets
 * them in a child's environment before the child starts. Reading them at use, not at import, keeps the
 * module honest when a test hands in a child's environment.
 */
/** The rsync this tool starts. Its name is this tool's, not a request's. */
const theRsync = () => process.env['HAND_OVER_RSYNC'] ?? 'rsync'
/** The process table the argv rule reads. */
const theProcessFolder = () => process.env['HAND_OVER_PROC'] ?? '/proc'

/** A file's sha256, read in parts so a 10 GB database is never held whole. @param {string} file */
export function theSha256OfAFile(file) {
  const hash = createHash('sha256')
  const fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const buffer = Buffer.alloc(1024 * 1024)
    for (let at = 0; ; ) {
      const read = readSync(fd, buffer, 0, buffer.length, at)
      if (read === 0) return hash.digest('hex')
      hash.update(buffer.subarray(0, read))
      at += read
    }
  } finally {
    closeSync(fd)
  }
}

/** Whether the database bytes are SQLite's, read from the file itself. @param {string} file */
export function isASqliteDatabase(file) {
  const fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const head = Buffer.alloc(16)
    return readSync(fd, head, 0, 16, 0) === 16 && head.toString('latin1') === 'SQLite format 3\u0000'
  } finally {
    closeSync(fd)
  }
}

/**
 * THE ARGV RULE THE LAB SERVER'S MOVERS USE: whether one command line is an rsync to the lab server, or
 * the lab server's program with `data` or `git` after it. The program is any word whose base name is the
 * base name HAND_OVER_PROGRAM names, so a path in the setting and a path in the argv both match. An
 * unrelated rsync, the program's `remind` and another program's `data` are not counted.
 *
 * WITH NO SERVER NAMED, no rsync can be shown to reach it, so the rsync half counts nothing. The program's
 * `data` and `git` still count, because they reach the lab server whatever its name. WITH NO PROGRAM
 * NAMED, that half counts nothing, under any name.
 *
 * @param {string[]} argv
 * @param {string | null} [server]
 * @param {string | null} [program]
 */
export function isAnRsyncToTheLabServer(argv, server = theHandOverPlace().server, program = theHandOverPlace().program) {
  const words = argv.filter((word) => word !== '')
  const first = basename(words[0] ?? '')
  if (server !== null && first === 'rsync' && words.slice(1).some((word) => word.includes(server))) return true
  if (program === null) return false
  const at = words.findIndex((word) => basename(word) === basename(program))
  if (at === -1) return false
  return words.slice(at + 1).some((word) => word === 'data' || word === 'git')
}

/**
 * EVERY PROCESS'S ARGV ON THIS MACHINE, as the argv rule reads them. A process that ends while it
 * is read is left out.
 * @param {string} [folder]
 * @returns {string[][]}
 */
export function everyProcessArgv(folder = theProcessFolder()) {
  /** @type {string[][]} */
  const all = []
  let names
  try {
    names = readdirSync(folder)
  } catch {
    return all
  }
  for (const name of names) {
    if (!/^\d+$/.test(name) || Number(name) === process.pid) continue
    try {
      const text = readFileSync(join(folder, name, 'cmdline'), 'utf8')
      all.push(text.split('\0').filter((word) => word !== ''))
    } catch {
      // The process ended, or is not one this user may read.
    }
  }
  return all
}

/** How long the wait sleeps between readings, unless a test shortens it. */
export const THE_WAIT_POLL_MS = 10_000

/**
 * WAIT, BOUNDED, WHILE THE LAB SERVER IS BUSY. The bound is the job's own two hours. The answer says
 * how long it waited and that it read process argv. `server` and `program` are the settings the caller
 * already read; with no server, only the program's `data` or `git` counts as reaching the lab server, and
 * with no program, only an rsync to the server does.
 * @param {{ deadline: number, now?: () => number, sleep?: (ms: number) => Promise<void>, readArgv?: () => string[][], pollMs?: number, server?: string | null, program?: string | null }} at
 * @returns {Promise<{ waitedMs: number, by: string }>}
 */
export async function waitForTheLabServer(at) {
  const now = at.now ?? (() => Date.now())
  const sleep = at.sleep ?? ((ms) => new Promise((done) => setTimeout(done, ms)))
  const readArgv = at.readArgv ?? (() => everyProcessArgv())
  const pollMs = at.pollMs ?? THE_WAIT_POLL_MS
  const place = at.server === undefined || at.program === undefined ? theHandOverPlace() : null
  const server = at.server === undefined ? (place?.server ?? null) : at.server
  const program = at.program === undefined ? (place?.program ?? null) : at.program
  let waited = 0
  for (;;) {
    if (!readArgv().some((argv) => isAnRsyncToTheLabServer(argv, server, program))) return { waitedMs: waited, by: 'the argv check' }
    const left = at.deadline - now()
    if (left <= 0) throw new Error(THE_TOOL_WORDS.theServerStayedBusy(Math.round(waited / 1000)))
    const pause = Math.min(pollMs, left)
    await sleep(pause)
    waited += pause
  }
}

/**
 * THE STAGING FOLDER OF ONE HAND-OVER: `<the data folder>/handover-staging/<the backup's id>`.
 * @param {string} dataFolder @param {string} backup
 */
export function theStagingFolderOf(dataFolder, backup) {
  return join(dataFolder, THE_HANDING_OVER_FOLDER, theBackupId(backup))
}

/** The journal of one job, in the runner's own job folder beside its output. @param {string} jobFolder */
export function theJournalOf(jobFolder) {
  return join(jobFolder, THE_HAND_OVER_JOURNAL)
}

/** Write a small file whole, fsync it, and leave its folder's own entry on the disk. @param {string} file @param {unknown} value */
function writeFsynced(file, value) {
  const next = `${file}.${process.pid}-${randomBytes(6).toString('hex')}.next`
  const fd = openSync(next, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600)
  try {
    writeSync(fd, JSON.stringify(value, null, 2) + '\n')
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }
  renameSync(next, file)
  const folder = openSync(dirname(file), constants.O_RDONLY)
  try {
    fsyncSync(folder)
  } finally {
    closeSync(folder)
  }
}

/** The commit and the stable tag this checkout is at, or null when git cannot say. @param {string} checkout */
export function theCommitAndTheTag(checkout) {
  const say = (/** @type {string[]} */ args) => {
    try {
      const child = spawn('git', ['-C', checkout, ...args], { stdio: ['ignore', 'pipe', 'ignore'], shell: false })
      let said = ''
      child.stdout?.setEncoding('utf8')
      child.stdout?.on('data', (chunk) => {
        said += chunk
      })
      return new Promise((/** @type {(value: string | null) => void} */ done) => {
        child.once('error', () => done(null))
        child.once('close', (code) => done(code === 0 ? said.trim() || null : null))
      })
    } catch {
      return Promise.resolve(null)
    }
  }
  return Promise.all([say(['rev-parse', 'HEAD']), say(['describe', '--tags', '--abbrev=0'])]).then(([commit, tag]) => ({ commit, tag }))
}

/**
 * MAKE THE JOB'S FOLDER: a folder named from the backup's id under the handing-over root, holding
 * hard links to that backup's `.db`, its files folder and its left-out list, then the manifest.
 * Nothing else is linked, read or copied. A link that cannot be made removes what this job made and
 * fails with the sentence. The journal is written by `handOverTheBackup`, after this returns.
 * @param {{ dataFolder: string, backup: string, jobId: string, checkout: string, link?: (from: string, to: string) => void, now?: () => Date }} at
 */
export async function stageTheBackup(at) {
  const { dataFolder, backup, jobId, checkout } = at
  const link = at.link ?? linkSync
  const now = at.now ?? (() => new Date())
  if (!isABackupName(backup)) throw new Error(THE_TOOL_WORDS.notABackupName(backup))
  const backups = join(dataFolder, 'backups')
  if (!existsSync(backups)) throw new Error(THE_TOOL_WORDS.noBackupsFolder)
  const database = join(backups, backup)
  let dbStat
  try {
    dbStat = lstatSync(database)
  } catch {
    throw new Error(THE_TOOL_WORDS.noBackup(backup))
  }
  if (dbStat.isSymbolicLink() || !dbStat.isFile()) throw new Error(THE_TOOL_WORDS.notACompleteBackup(backup, 'it is not an ordinary file'))
  if (!isASqliteDatabase(database)) throw new Error(THE_TOOL_WORDS.notASqliteDatabase(backup))
  const filesFolder = join(backups, theFilesFolderOf(backup))
  const leftOutList = join(backups, theLeftOutListOf(backup))
  const hasFolder = existsSync(filesFolder)
  const hasList = existsSync(leftOutList)
  if (!hasFolder && !hasList) throw new Error(THE_TOOL_WORDS.notACompleteBackup(backup, 'neither a files folder nor a left-out list is beside it'))

  const root = join(dataFolder, THE_HANDING_OVER_FOLDER)
  const folder = theStagingFolderOf(dataFolder, backup)
  if (existsSync(folder)) throw new Error(THE_TOOL_WORDS.anotherJobsFolder(folder))
  mkdirSync(root, { recursive: true, mode: 0o700 })
  mkdirSync(folder, { mode: 0o700 })
  /** @type {{ path: string, size: number }[]} */
  const sizes = []
  /** @param {string} from @param {string} under */
  const oneLink = (from, under) => {
    const to = join(folder, under)
    try {
      link(from, to)
    } catch (error) {
      const code = /** @type {NodeJS.ErrnoException} */ (error).code
      throw new Error(code === 'EXDEV' ? THE_TOOL_WORDS.notOnOneFilesystem(folder) : THE_TOOL_WORDS.cannotLink(from, code ?? String(error)))
    }
    sizes.push({ path: under, size: lstatSync(to).size })
  }
  /** @param {string} fromFolder @param {string} under */
  const linkAFolder = (fromFolder, under) => {
    mkdirSync(join(folder, under), { recursive: true, mode: 0o700 })
    for (const name of readdirSync(fromFolder)) {
      const from = join(fromFolder, name)
      const relative = under === '' ? name : `${under}/${name}`
      const stat = lstatSync(from)
      if (stat.isSymbolicLink()) throw new Error(THE_TOOL_WORDS.cannotLink(from, 'it is a link'))
      if (stat.isDirectory()) linkAFolder(from, relative)
      else if (stat.isFile()) oneLink(from, relative)
      else throw new Error(THE_TOOL_WORDS.cannotLink(from, 'it is not an ordinary file'))
    }
  }
  try {
    oneLink(database, backup)
    if (hasFolder) linkAFolder(filesFolder, theFilesFolderOf(backup))
    if (hasList) oneLink(leftOutList, theLeftOutListOf(backup))
    const { commit, tag } = await theCommitAndTheTag(checkout)
    const databaseSha256 = theSha256OfAFile(join(folder, backup))
    const manifest = {
      backup,
      backupId: theBackupId(backup),
      job: jobId,
      serverName: theHandOverServerName(backup),
      commit,
      stableTag: tag,
      databaseSha256,
      // The manifest travels to the lab server, so the local wall clock is written with its offset.
      createdAt: clockStamp(now).instant,
      files: sizes,
    }
    const manifestFile = join(folder, THE_HAND_OVER_MANIFEST)
    const manifestFd = openSync(manifestFile, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600)
    try {
      writeSync(manifestFd, JSON.stringify(manifest, null, 2) + '\n')
      fsyncSync(manifestFd)
    } finally {
      closeSync(manifestFd)
    }
    sizes.push({ path: THE_HAND_OVER_MANIFEST, size: lstatSync(manifestFile).size })
    return { folder, manifest, manifestFile, files: sizes, databaseSha256 }
  } catch (error) {
    rmSync(folder, { recursive: true, force: true })
    throw error
  }
}

/**
 * ONE STAGED FILE AS THE JOURNAL RECORDS IT, read now.
 * @param {string} folder @param {{ path: string, dev: number, ino: number, size: number, mtimeMs: number }} recorded
 * @returns {string | null} why it does not match, or null
 */
function whyAStagedFileIsNotTheOne(folder, recorded) {
  const at = join(folder, recorded.path)
  let stat
  try {
    stat = lstatSync(at)
  } catch {
    return THE_TOOL_WORDS.aMissingFile(recorded.path)
  }
  if (stat.isSymbolicLink() || !stat.isFile()) return THE_TOOL_WORDS.aLink(recorded.path)
  if (stat.dev !== recorded.dev || stat.ino !== recorded.ino || stat.size !== recorded.size || stat.mtimeMs !== recorded.mtimeMs) return THE_TOOL_WORDS.aReplacement(recorded.path)
  return null
}

/**
 * THE JOURNAL OF ONE STAGED JOB: the job, the backup, the folder, and for every staged file its
 * relative path, device, inode, size and mtime, with the database's sha256. `stamp` is the snapshot
 * the lab server reported, or null before it has reported one.
 * @param {{ jobId: string, backup: string, staged: { folder: string, manifest: Record<string, any>, files: { path: string, size: number }[], databaseSha256: string } }} at
 * @returns {{ job: string, backup: string, backupId: string, folder: string, serverName: string, commit: string | null, stableTag: string | null, databaseSha256: string, stamp: string | null, state: string, files: { path: string, dev: number, ino: number, size: number, mtimeMs: number }[] }}
 */
export function theJournalFor(at) {
  return {
    job: at.jobId,
    backup: at.backup,
    backupId: theBackupId(at.backup),
    folder: at.staged.folder,
    serverName: theHandOverServerName(at.backup),
    commit: at.staged.manifest['commit'],
    stableTag: at.staged.manifest['stableTag'],
    databaseSha256: at.staged.databaseSha256,
    stamp: null,
    state: 'staged',
    files: at.staged.files.map((one) => {
      const stat = statSync(join(at.staged.folder, one.path), { throwIfNoEntry: false })
      if (stat === undefined) throw new Error(THE_TOOL_WORDS.aMissingFile(one.path))
      return { path: one.path, dev: stat.dev, ino: stat.ino, size: stat.size, mtimeMs: stat.mtimeMs }
    }),
  }
}

/** Write one job's journal where the runner's own job folder keeps it, fsynced before the upload. @param {string} jobFolder @param {Record<string, unknown>} journal */
export function writeTheJournal(jobFolder, journal) {
  writeFsynced(theJournalOf(jobFolder), journal)
}

/**
 * REMOVE ONE JOB'S STAGED FOLDER, AND ONLY WHAT ITS OWN JOURNAL PROVES. The journal is read from the
 * runner's job folder, never from a path the journal itself offers. The folder must be exactly
 * `<handing-over root>/<the backup's id>`, with no link on the way. Every file must still be the one
 * recorded, every folder must be one the recorded paths need, and an extra file, a replacement, a
 * link or a missing file keeps the folder and says which check failed.
 * @param {{ dataFolder: string, jobFolder: string, jobId: string }} at
 * @returns {{ removed: boolean, says: string, folder?: string }}
 */
export function recoverTheStagedFolder(at) {
  const journalFile = theJournalOf(at.jobFolder)
  let stat
  try {
    stat = lstatSync(journalFile)
  } catch {
    return { removed: false, says: THE_TOOL_WORDS.noJournal(journalFile) }
  }
  if (stat.isSymbolicLink() || !stat.isFile()) return { removed: false, says: THE_TOOL_WORDS.journalNotAJournalledFile(journalFile) }
  /** @type {any} */
  let journal
  try {
    journal = JSON.parse(readFileSync(journalFile, 'utf8'))
  } catch (error) {
    return { removed: false, says: THE_TOOL_WORDS.journalUnreadable(journalFile, /** @type {Error} */ (error).message) }
  }
  if (journal === null || typeof journal !== 'object' || journal.job !== at.jobId) return { removed: false, says: THE_TOOL_WORDS.anotherJobsJournal(at.jobId) }
  if (!isABackupName(journal.backup) || journal.backupId !== theBackupId(journal.backup)) {
    return { removed: false, says: THE_TOOL_WORDS.journalFolderEscapes(String(journal.folder)) }
  }
  // THE JOURNAL'S FOLDER IS COMPARED FIRST, before the root is resolved or found missing, so a journal whose
  // folder is under another root is refused and kept even while this root does not exist.
  const root = join(at.dataFolder, THE_HANDING_OVER_FOLDER)
  if (typeof journal.folder !== 'string' || resolve(journal.folder) !== resolve(root, journal.backupId)) {
    return { removed: false, says: THE_TOOL_WORDS.journalFolderEscapes(String(journal.folder)) }
  }
  let realRoot
  try {
    realRoot = realpathSync(root)
  } catch {
    return { removed: true, says: THE_TOOL_WORDS.alreadyGone(journal.folder) }
  }
  const expected = join(realRoot, journal.backupId)
  let folderStat
  try {
    folderStat = lstatSync(expected)
  } catch {
    return { removed: true, says: THE_TOOL_WORDS.alreadyGone(expected) }
  }
  if (folderStat.isSymbolicLink()) return { removed: false, says: THE_TOOL_WORDS.theFolderIsALink(expected) }
  if (!folderStat.isDirectory()) return { removed: false, says: THE_TOOL_WORDS.theFolderIsALink(expected) }
  try {
    if (realpathSync(expected) !== expected) return { removed: false, says: THE_TOOL_WORDS.journalFolderEscapes(journal.folder) }
  } catch {
    return { removed: false, says: THE_TOOL_WORDS.aFolderThatCannotBeRead(expected, 'it cannot be resolved') }
  }

  const recorded = Array.isArray(journal.files) ? journal.files : []
  if (recorded.length === 0) return { removed: false, says: THE_TOOL_WORDS.aMissingFile('every staged file') }
  const paths = new Set(recorded.map((/** @type {{ path: string }} */ one) => one.path))
  /** Every folder the recorded paths need. */
  const needed = new Set()
  for (const path of paths) {
    for (let above = path; above.includes('/'); ) {
      above = above.slice(0, above.lastIndexOf('/'))
      needed.add(above)
    }
  }
  /** @type {string[]} */
  const seen = []
  /** @returns {string | null} */
  const walk = (/** @type {string} */ under) => {
    const here = under === '' ? expected : join(expected, under)
    let names
    try {
      names = readdirSync(here)
    } catch (error) {
      throw new Error(THE_TOOL_WORDS.aFolderThatCannotBeRead(here, /** @type {NodeJS.ErrnoException} */ (error).code ?? String(error)))
    }
    for (const name of names) {
      const relative = under === '' ? name : `${under}/${name}`
      const full = join(expected, relative)
      const one = lstatSync(full)
      if (one.isSymbolicLink()) return THE_TOOL_WORDS.aLink(relative)
      if (one.isDirectory()) {
        if (!needed.has(relative)) return THE_TOOL_WORDS.anExtraFile(relative)
        const why = walk(relative)
        if (why !== null) return why
      } else if (one.isFile()) {
        if (!paths.has(relative)) return THE_TOOL_WORDS.anExtraFile(relative)
        seen.push(relative)
      } else return THE_TOOL_WORDS.aLink(relative)
    }
    return null
  }
  const whyNot = walk('')
  if (whyNot !== null) return { removed: false, says: THE_TOOL_WORDS.kept(expected, whyNot), folder: expected }
  if (seen.length !== paths.size) {
    for (const path of paths) if (!seen.includes(path)) return { removed: false, says: THE_TOOL_WORDS.kept(expected, THE_TOOL_WORDS.aMissingFile(path)), folder: expected }
  }
  for (const one of recorded) {
    const why = whyAStagedFileIsNotTheOne(expected, one)
    if (why !== null) return { removed: false, says: THE_TOOL_WORDS.kept(expected, why), folder: expected }
  }
  // Everything matched: remove the verified files, then the manifest, then the folders that are empty.
  for (const one of recorded) unlinkSync(join(expected, one.path))
  const deepest = [...needed].sort((a, b) => b.split('/').length - a.split('/').length)
  for (const relative of deepest) {
    try {
      rmdirSync(join(expected, relative))
    } catch {
      // A folder that is not empty is not this job's to remove.
    }
  }
  try {
    rmdirSync(expected)
  } catch (error) {
    return { removed: false, says: THE_TOOL_WORDS.kept(expected, `the folder is not empty (${/** @type {NodeJS.ErrnoException} */ (error).code ?? String(error)})`), folder: expected }
  }
  return { removed: true, says: THE_TOOL_WORDS.removed(expected) }
}

/**
 * THE FILE DIFFERENCES IN A `rsync -n -c --itemize-changes` OUTPUT: lines that describe a file,
 * with directory lines left aside. An itemize leader is `YX` and a folder's second character is
 * `d`; `*deleting` lines are file differences too.
 * @param {string} output
 */
export function theFileDifferencesIn(output) {
  let differences = 0
  for (const line of output.split('\n')) {
    if (line.trim() === '') continue
    if (/^\*deleting/.test(line)) {
      differences += 1
      continue
    }
    if (/^[<>ch.*][^d]/.test(line)) differences += 1
  }
  return differences
}

/**
 * RUN ONE COMMAND UNDER THE SHARED FLOCK. The lock is the one the lab server's movers take, at the path
 * HAND_OVER_LOCK names, which the caller has already read and checked. The holder writes its process, its
 * time and its purpose into the file, as the contract says. Where `flock` is not on this machine the
 * command runs with the argv rule alone, and the answer says so.
 *
 * THE CHILD THAT HOLDS THE LOCK READS HAND_OVER_LOCK AS WELL, so it is handed the path this process read:
 * a lock named only in a settings file the caller chose would otherwise not reach it.
 * @param {{ purpose: string, program: string, args: string[], deadline: number, lockFile: string, env?: Record<string, string | undefined> }} at
 * @returns {Promise<{ code: number | null, signal: string | null, said: string, by: string }>}
 */
export function underTheSharedLock(at) {
  const lockFile = at.lockFile
  const env = { ...(at.env ?? process.env), HAND_OVER_LOCK: lockFile }
  mkdirSync(dirname(lockFile), { recursive: true, mode: 0o700 })
  const left = Math.max(1, Math.floor((at.deadline - Date.now()) / 1000))
  const run = (/** @type {string} */ program, /** @type {string[]} */ args, /** @type {boolean} */ usedFlock) =>
    new Promise((/** @type {(value: any) => void} */ done) => {
      const child = spawn(program, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        env,
        shell: false,
        detached: true,
      })
      let said = ''
      const keep = (/** @type {Buffer} */ chunk) => {
        said += chunk.toString('utf8')
        if (said.length > 64_000) said = said.slice(-64_000)
      }
      child.stdout?.on('data', keep)
      child.stderr?.on('data', keep)
      const timer = setTimeout(() => {
        const pid = child.pid
        if (pid === undefined) return
        try {
          process.kill(-pid, 'SIGTERM')
        } catch {
          // It ended.
        }
        setTimeout(() => {
          try {
            process.kill(-pid, 'SIGKILL')
          } catch {
            // It ended.
          }
        }, 5_000)
      }, Math.max(1, at.deadline - Date.now()))
      child.once('error', (error) => {
        clearTimeout(timer)
        done({ code: null, signal: null, said: said + String(error), by: usedFlock ? 'the shared flock' : 'the argv check only' })
      })
      child.once('close', (code, signal) => {
        clearTimeout(timer)
        done({ code, signal, said, by: usedFlock ? 'the shared flock' : 'the argv check only' })
      })
    })
  return run('flock', ['-x', '-w', String(left), lockFile, THE_TOOL_FILE, '--under-the-lock', at.purpose, '--', at.program, ...at.args], true)
    .then((answer) => (answer.code === 127 || /ENOENT/.test(answer.said)) ? run(at.program, at.args, false) : answer)
}

/**
 * THE `--under-the-lock` HALF: the lock is held by `flock` around this process. It reads the lock from
 * HAND_OVER_LOCK, which `underTheSharedLock` hands it, writes the holder's line into the lock file, runs
 * the command with its own pipes, and exits as it did. A lock that is missing or not absolute runs
 * nothing and says which.
 * @param {string[]} argv the words after `--under-the-lock`
 */
export async function underTheLock(argv) {
  const purpose = argv[0] ?? 'a hand-over'
  const at = argv.indexOf('--')
  if (at === -1) return 2
  const program = argv[at + 1]
  if (program === undefined) return 2
  const args = argv.slice(at + 2)
  const lockFile = theHandOverPlace().lock
  if (lockFile === null || !isAbsolute(lockFile)) {
    process.stderr.write(`${lockFile === null ? THE_TOOL_WORDS.noLock : THE_TOOL_WORDS.lockNotAbsolute}\n`)
    return 2
  }
  try {
    mkdirSync(dirname(lockFile), { recursive: true, mode: 0o700 })
    writeFileSync(lockFile, `${process.pid}\n${clockStamp().instant}\n${purpose}\n`, { mode: 0o600 })
  } catch {
    // The lock file is the movers' contract; a file that cannot be written is said by the command's own failure.
  }
  return await new Promise((/** @type {(code: number) => void} */ done) => {
    const child = spawn(program, args, { stdio: ['ignore', 'inherit', 'inherit'], env: process.env, shell: false })
    child.once('error', () => done(127))
    child.once('close', (code, signal) => done(code ?? (signal === null ? 1 : 128)))
  })
}

/** A text with every character a pattern reads specially escaped, so it matches only itself. @param {string} text */
function theEscapedForAPattern(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** The last line of what a command said that is not blank. @param {string} said */
export function theLastLineOf(said) {
  const lines = said.split('\n').map((line) => line.trim()).filter((line) => line !== '')
  return lines.at(-1) ?? ''
}

/**
 * RUN THE WHOLE HAND-OVER FOR ONE JOB and write RESULT.json into the job's output folder. It does
 * not return until the folder is removed or kept, and it says which. `now` and `sleep` are handed
 * in so a test can stand at the Vault window without waiting for it.
 * @param {{ backup: string, dataFolder: string, jobFolder: string, jobId: string, outputFolder: string, checkout: string, settingsFile?: string, now?: () => Date, sleep?: (ms: number) => Promise<void> }} at
 * @returns {Promise<{ ok: boolean, result: Record<string, unknown> }>}
 */
export async function handOverTheBackup(at) {
  const now = at.now ?? (() => new Date())
  const sleep = at.sleep ?? ((ms) => new Promise((done) => setTimeout(done, ms)))
  const startedAt = Date.now()
  const deadline = startedAt + THE_HAND_OVER_TIME_LIMIT_SECONDS * 1000
  const place = theHandOverPlace(process.env, at.settingsFile ?? ENV_FILE)
  const says = (/** @type {string} */ text, /** @type {Record<string, unknown>} */ extra = {}) => ({
    ok: false,
    says: text,
    backup: at.backup,
    serverName: theHandOverServerName(at.backup),
    ...extra,
  })
  /** @type {{ folder: string, manifest: Record<string, any>, files: { path: string, size: number }[], databaseSha256: string } | null} */
  let staged = null
  /** @type {string | null} */
  let snapshot = null
  let vaultWaited = 0
  let serverWaited = 0
  let snapshotAttempted = false
  let snapshotHeldBy = ''
  let keep = false
  try {
    if (typeof at.backup !== 'string' || at.backup === '') throw new Error(THE_TOOL_WORDS.emptyName)

    // WHERE IT GOES AND HOW, CHECKED BEFORE THE LOCK, THE STAGING COPY, THE LAB SERVER'S PROGRAM OR ANY RSYNC.
    // Every missing or wrong setting is named at once, and a value never appears in the refusal.
    const wrong = []
    if (place.server === null) wrong.push(THE_TOOL_WORDS.noLabServer)
    if (place.root === null) wrong.push(THE_TOOL_WORDS.noLabRoot)
    if (place.program === null) wrong.push(THE_TOOL_WORDS.noProgram)
    if (place.lock === null) wrong.push(THE_TOOL_WORDS.noLock)
    else if (!isAbsolute(place.lock)) wrong.push(THE_TOOL_WORDS.lockNotAbsolute)
    if (wrong.length > 0 || place.program === null || place.lock === null) throw new Error(wrong.join(' '))
    const { program, lock } = place

    // THE VAULT PUSH'S COPY, 01:00 TO 02:45: the job waits, and says it did. It is asked again immediately before
    // each step that reaches the lab server, because a job that begins a second before 01:00 would otherwise begin its
    // snapshot during the copy.
    const waitOutTheVaultWindow = async () => {
      const wait = theWaitForTheVaultWindow(now())
      if (wait <= 0) return
      if (wait >= deadline - Date.now()) throw new Error(THE_TOOL_WORDS.theVaultWindowIsHere(Math.round((deadline - Date.now()) / 1000)))
      await sleep(wait)
      vaultWaited += wait
    }
    await waitOutTheVaultWindow()
    staged = await stageTheBackup({ dataFolder: at.dataFolder, backup: at.backup, jobId: at.jobId, checkout: at.checkout, now })
    const journal = theJournalFor({ jobId: at.jobId, backup: at.backup, staged })
    writeTheJournal(at.jobFolder, journal)

    const waited = await waitForTheLabServer({ deadline, now: () => Date.now(), sleep, server: place.server, program })
    serverWaited = waited.waitedMs
    // THE WINDOW IS CHECKED AGAIN HERE, after staging and the wait for the lab server: the start check may have been
    // a second before 01:00, and the folder is only given to the lab server's program now.
    await waitOutTheVaultWindow()
    mkdirSync(at.outputFolder, { recursive: true, mode: 0o700 })
    snapshotAttempted = true
    const taken = await underTheSharedLock({
      purpose: `snapshot of ${at.backup} for job ${at.jobId}`,
      program,
      args: ['data', staged.folder, `name=${theHandOverServerName(at.backup)}`, 'private'],
      deadline,
      lockFile: lock,
    })
    snapshotHeldBy = taken.by
    // THE SNAPSHOT LINE BEGINS WITH THE PROGRAM'S OWN BASE NAME, as the setting names it, and `data`.
    const snapshotLine = theLastLineOf(taken.said)
    const reported = new RegExp(`^${theEscapedForAPattern(basename(program))} data .*: ok: snapshot (\\S+) on the server$`).exec(snapshotLine)
    if (taken.code !== 0) throw new Error(THE_TOOL_WORDS.programFailed(snapshotLine))
    if (reported === null) throw new Error(THE_TOOL_WORDS.noSnapshot(snapshotLine))
    snapshot = reported[1] ?? null
    if (snapshot === null) throw new Error(THE_TOOL_WORDS.noSnapshot(snapshotLine))
    journal.stamp = snapshot
    journal.state = 'snapshotted'
    writeTheJournal(at.jobFolder, journal)

    // THE CHECKSUM PROOF: the dry run is held under the same lock and the same argv rule. THE TWO RULES ARE ASKED
    // UNTIL A ROUND OF BOTH WAITS FOR NOTHING, because each wait can change the other's answer: a wait for the lab
    // server can cross 01:00, and a wait for the window can let an rsync start. The window is the last check, so the
    // proof never runs inside it.
    let proofWaited = 0
    for (;;) {
      const windowWaited = vaultWaited
      const waitedNow = await waitForTheLabServer({ deadline, now: () => Date.now(), sleep, server: place.server, program })
      proofWaited += waitedNow.waitedMs
      await waitOutTheVaultWindow()
      if (waitedNow.waitedMs === 0 && vaultWaited === windowWaited) break
    }
    serverWaited += proofWaited
    const proof = await underTheSharedLock({
      purpose: `checksum proof of ${at.backup} for job ${at.jobId}`,
      program: theRsync(),
      args: ['-a', '-n', '-c', '--itemize-changes', `${staged.folder}/`, `${place.server}:${place.root}/${theHandOverServerName(at.backup)}/${snapshot}/`],
      deadline,
      lockFile: lock,
    })
    if (proof.code !== 0) {
      throw new Error(THE_TOOL_WORDS.theProofDidNotSucceed(snapshot, theLastLineOf(proof.said)))
    }
    const differences = theFileDifferencesIn(proof.said)
    if (differences !== 0) {
      keep = true
      throw new Error(THE_TOOL_WORDS.theProofFailed(differences, staged.folder, snapshot))
    }
    const after = theSha256OfAFile(join(staged.folder, at.backup))
    if (after !== staged.databaseSha256) {
      keep = true
      throw new Error(THE_TOOL_WORDS.theHashChanged(staged.databaseSha256, after))
    }
    const result = {
      ok: true,
      says: THE_TOOL_WORDS.done,
      backup: at.backup,
      backupId: theBackupId(at.backup),
      serverName: theHandOverServerName(at.backup),
      snapshotId: snapshot,
      databaseSha256: staged.databaseSha256,
      fileDifferences: differences,
      files: staged.files.length,
      bytes: staged.files.reduce((sum, one) => sum + one.size, 0),
      commit: staged.manifest['commit'],
      stableTag: staged.manifest['stableTag'],
      vaultWaitedSeconds: Math.round(vaultWaited / 1000),
      serverWaitedSeconds: Math.round(serverWaited / 1000),
      waitedBy: waited.by,
      notes: [
        ...(vaultWaited > 0 ? [`It waited ${Math.round(vaultWaited / 60_000)} minutes for the Vault push's copy to finish at 02:45.`] : []),
        ...(serverWaited > 0 ? [`It waited ${Math.round(serverWaited / 1000)} seconds for the lab server to be free.`] : []),
      ],
      snapshotHeldBy,
      proofHeldBy: proof.by,
    }
    journal.state = 'done'
    writeTheJournal(at.jobFolder, journal)
    const removed = recoverTheStagedFolder({ dataFolder: at.dataFolder, jobFolder: at.jobFolder, jobId: at.jobId })
    if (!removed.removed) result.says = `${THE_TOOL_WORDS.done} ${removed.says}`
    writeFileSync(join(at.outputFolder, 'RESULT.json'), JSON.stringify(result, null, 2) + '\n', { mode: 0o600 })
    return { ok: true, result }
  } catch (error) {
    const why = error instanceof Error ? error.message : String(error)
    let removal = ''
    if (staged !== null && !keep) {
      const removed = recoverTheStagedFolder({ dataFolder: at.dataFolder, jobFolder: at.jobFolder, jobId: at.jobId })
      removal = removed.removed ? '' : ` ${removed.says}`
    }
    const result = says(why + removal, {
      snapshotId: snapshot,
      stampKnown: snapshot !== null,
      folder: staged?.folder ?? null,
      notes: [
        ...(vaultWaited > 0 ? [`It waited ${Math.round(vaultWaited / 60_000)} minutes for the Vault push's copy to finish at 02:45.`] : []),
        ...(serverWaited > 0 ? [`It waited ${Math.round(serverWaited / 1000)} seconds for the lab server to be free.`] : []),
      ],
      folderKept: staged !== null && keep ? staged.folder : null,
      ...(!snapshotAttempted
        ? {}
        : snapshot === null
          ? { partial: THE_TOOL_WORDS.unknownStamp('') }
          : { partial: THE_TOOL_WORDS.knownStamp(theHandOverServerName(at.backup), snapshot) }),
    })
    try {
      mkdirSync(at.outputFolder, { recursive: true, mode: 0o700 })
      writeFileSync(join(at.outputFolder, 'RESULT.json'), JSON.stringify(result, null, 2) + '\n', { mode: 0o600 })
    } catch {
      // The runner reads the log when it cannot read an output.
    }
    return { ok: false, result }
  }
}

/** The runner's job folder, from the output folder it gives a tool. @param {Record<string, string | undefined>} env */
export function theJobFolderOf(env) {
  const output = env['HOST_JOB_OUTPUT']
  if (output === undefined || output === '') throw new Error('HOST_JOB_OUTPUT is not set, so this tool has no job folder.')
  return dirname(output)
}

async function main() {
  const argv = process.argv.slice(2)
  if (argv[0] === '--under-the-lock') process.exitCode = await underTheLock(argv.slice(1))
  else if (argv[0] === '--recover') {
    const jobId = argv[1]
    if (jobId === undefined || jobId === '') {
      process.stderr.write('--recover takes the job\'s id.\n')
      process.exitCode = 2
    } else {
      try {
        const answer = recoverTheStagedFolder({ dataFolder: process.cwd(), jobFolder: theJobFolderOf(process.env), jobId })
        process.stdout.write(`${answer.says}\n`)
        process.exitCode = answer.removed ? 0 : 1
      } catch (error) {
        process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
        process.exitCode = 2
      }
    }
  } else {
    const backup = argv[0]
    const jobId = process.env['HOST_JOB_ID']
    if (backup === undefined || backup === '' || jobId === undefined || jobId === '') {
      process.stderr.write('The tool takes the backup\'s name, and the runner sets HOST_JOB_ID.\n')
      process.exitCode = 2
    } else {
      const jobFolder = theJobFolderOf(process.env)
      const outputFolder = process.env['HOST_JOB_OUTPUT'] ?? join(jobFolder, 'out')
      const checkout = dirname(dirname(THE_TOOL_FILE))
      const { ok, result } = await handOverTheBackup({ backup, dataFolder: process.cwd(), jobFolder, jobId, outputFolder, checkout })
      process.stdout.write(`${String(result['says'])}\n`)
      process.exitCode = ok ? 0 : 1
    }
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) await main()
