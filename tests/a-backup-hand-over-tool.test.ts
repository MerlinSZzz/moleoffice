// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE BACKUP HAND-OVER TOOL: ONE BACKUP PRESENTED TO THE LAB SERVER'S PROGRAM, ONE RSYNC AT A TIME, AND ONE JOURNAL.
 *
 * Round 74 built the door that files the office's own host job. This round builds the tool that does
 * the work: it makes a folder of hard links to exactly one backup, writes the manifest and the
 * fsynced journal, waits for the lab server with the argv rule and the shared flock, runs
 * the lab server's program, proves the copy with `rsync -a -n -c --itemize-changes`, and removes the folder it
 * made. It never lists or deletes on the lab server.
 *
 * Every case here is a stand-in. The lab server's program and `rsync` are made-up shell scripts, the program
 * under the made-up name `lamp-lighter`, the lab server is a folder in this test's scratch folder, and no
 * backup, key, host or server is real.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS CLAIMED
 * ---------------------------------------------------------------------------------------
 *
 *   1. The server's name is built from the backup's own id and date, and a name of any other shape
 *      is refused before anything is written.
 *   2. The job's folder is outside the backups folder and holds hard links to that backup's `.db`,
 *      its files folder and its left-out list, and nothing of another backup; the backup's own
 *      inode, bytes and retention do not change, and the list still reads the same backups.
 *   3. A hard link that cannot be made (another filesystem) fails the job and copies nothing.
 *   4. The busy rule reads process argv: an rsync naming the server and the program's `data` or `git` are
 *      busy, and an unrelated rsync, the program's `remind`, or another program's `data` is not. The wait is
 *      bounded at the job's limit.
 *   4e. The program is the base name of HAND_OVER_PROGRAM, also when the setting names a path, and with no
 *      program named that half of the rule counts nothing.
 *   4c. The snapshot and the checksum proof run under the shared flock: while another process holds
 *      it the snapshot does not start, and the lock file holds the holder's pid, its ISO time and
 *      its purpose.
 *   4d. A server that becomes busy during the snapshot is waited for before the proof: the argv
 *      rule is asked again after the snapshot, so an rsync that starts during the snapshot is not
 *      overlapped by the proof.
 *   5. The Vault window is 01:00 to 02:45, and the job waits outside it or says why it cannot. The
 *      window is checked again immediately before the snapshot and the checksum proof, so a job that
 *      begins at 00:59:59 does not run its snapshot during the copy.
 *   5d. The proof's own window check is made after the snapshot: a job whose snapshot takes it into
 *      the window waits before the proof rather than proving at 01:05.
 *   5e. The window is read on the owner's own clock, Europe/London, under the runner's TZ=UTC: 01:00
 *      and 01:30 London in British Summer Time wait 105 and 75 minutes, not nought.
 *   5f. A wait for the lab server that crosses 01:00 is followed by the window check, and the proof
 *      waits: the tool asks both rules again until a round of both waits for nothing.
 *   6. The manifest is in the folder before the upload and reaches the snapshot, with the commit,
 *      the stable tag, the database's sha256 and each file's size.
 *   6c. The snapshot is read only from a last line that begins with the program's own base name and `data`;
 *      the same line under another name names no snapshot.
 *   7. The checksum proof counts file lines and leaves directory lines aside; zero passes, and a
 *      non-zero count keeps the folder and names the count.
 *   8. Recovery trusts nothing: it removes only the job's own verified links, after the originals
 *      may have been pruned, and keeps the folder for an extra file, a replacement, a link, a
 *      missing or untrusted journal, a path escape or another job's folder.
 *   8d. A journal whose folder is under another root, as an older root's journal would be, is refused and
 *      kept, also when this tool's own root (`handover-staging`) does not exist.
 *   9. The door puts the registered program's sha256 on the job it files, and files no digest while
 *      the tool is not registered; the take then hands it to no runner. A declaration whose recovery
 *      program is not the file it names is refused at registration.
 *  10. The old live-office answer shape still works: a job filed without a digest reads 200 with its
 *      words, and a take ends it `could not start` (the door's own carried case).
 *  11. A lost job's recovery step runs once, with the job's id, only after its processes are shown
 *      to have stopped: a group that has ended runs it; no group written down, a start that cannot be
 *      read, a group still holding a member after KILL, and a leader gone with a child left in its
 *      group all run nothing and say why.
 *  22. The lab server's program, HAND_OVER_PROGRAM, and the lock, HAND_OVER_LOCK, are settings with no
 *      default. Each one missing, or both, or a lock path that is not absolute, is refused before the lock,
 *      the staging folder, the program or any rsync, naming every missing or wrong setting at once and
 *      never a value. The settings file gives both when the environment's values are empty, and the
 *      lock it names is the one the snapshot and the proof hold.
 *
 * ---------------------------------------------------------------------------------------
 * MUTATIONS, NAMED, EACH AFTER A CONTROL RUN
 * ---------------------------------------------------------------------------------------
 *
 *   - the server's name built from the request instead of the backup: case 1 goes red;
 *   - the staging folder put inside the backups folder: case 2 goes red (the list counts it);
 *   - a copy taken instead of a hard link: case 2 goes red (the inode differs);
 *   - the EXDEV sentence removed: case 3 goes red;
 *   - the argv rule reading only rsync: case 4 goes red (the program's `data` is not seen);
 *   - the wait not bounded: case 4 goes red (it never ends);
 *   - the Vault window's end at 02:00 instead of 02:45: case 5 goes red;
 *   - the second Vault check before the snapshot taken out: case 5c goes red (the program runs before the wait);
 *   - the shared lock replaced with a direct run: case 4c goes red (the program runs while the lock is held,
 *     and the holder's line is never copied);
 *   - the Vault check before the checksum proof taken out: case 5d goes red (the proof runs before the wait);
 *   - the argv wait before the proof taken out: case 4d goes red;
 *   - the two waits before the proof asked once instead of until both are clear: case 5f goes red (the
 *     proof runs at 01:00:10, inside the window);
 *   - the window read on the process's local clock again: case 5e goes red under TZ=UTC (01:00 BST reads
 *     as 00:00 UTC);
 *   - the manifest written after the upload: case 6 goes red (the snapshot has no manifest);
 *   - directory lines counted: case 7 goes red;
 *   - recovery trusting the journal's path: case 8 goes red (an escape deletes);
 *   - recovery not checking device, inode, size and mtime: case 8 goes red (a replacement is removed);
 *   - the door never reading the register: case 9 goes red (the registered job has no digest);
 *   - the recovery program's disk check taken out of registration: case 9b goes red;
 *   - the recovery limit's settle taken out: case 12 goes red (the answer does not say the limit ended it);
 *   - recovery made to run with no group written down: case 13 goes red;
 *   - the group-still-there branch made to recover anyway: case 14 goes red;
 *   - a group with a leader gone and a child left counted as stopped: case 15 goes red;
 *   - the lab server check removed: case 17 goes red (the hand-over runs to the program);
 *   - the lab folder check removed: case 18 goes red;
 *   - an empty environment value taken as set: case 17 goes red (the empty half runs to the program);
 *   - the settings file not read: case 20 goes red (the file's server and folder never reach rsync);
 *   - the program check removed: case 22 goes red (the hand-over stages and runs);
 *   - the lock check removed: case 23 goes red;
 *   - the absolute check removed: case 25 goes red (the relative lock is taken);
 *   - the argv rule matching any program's `data`: case 4e goes red;
 *   - the argv rule counting the program's half with no program named: case 4e goes red;
 *   - the snapshot line read under any first word: case 6c goes red;
 *   - the staging folder's old name: case 2 goes red;
 *   - recovery's root resolved before the folder is compared: case 8d goes red (it answers already gone);
 *   - the lock not handed to the child that holds it: case 26 goes red (the child finds no lock).
 */
import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import { appendFileSync, chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, renameSync, rmdirSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, relative } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { backupNameFor, readCompleteBackups } from '../src/server/lib/complete-backups.ts'
import {
  isABackupName,
  THE_HAND_OVER_TIME_LIMIT_SECONDS,
  theFilesFolderOf,
  theHandOverServerName,
  theWaitForTheVaultWindow,
} from '../src/shared/backup-hand-over.ts'
import { HOST_JOB_KIND } from '../src/shared/host-jobs.ts'
import { THE_OWNER } from '../src/shared/kinds.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { momentOfAnInstant } from '../src/shared/time.ts'
import { filesFolderOf, leftOutListOf } from '../src/shared/what-is-kept.ts'
import { aTestDatabaseFolder } from './a-test-folder.ts'
import { apiApp, freshDb, thePersonsKeyHeader, type TestDb } from './helpers.ts'
import { runOnce } from '../tools/run-the-host-jobs.mjs'
import {
  everyProcessArgv,
  handOverTheBackup,
  isAnRsyncToTheLabServer,
  recoverTheStagedFolder,
  stageTheBackup,
  theFileDifferencesIn,
  theJournalFor,
  theJournalOf,
  theSha256OfAFile,
  theStagingFolderOf,
  THE_TOOL_WORDS,
  THE_WAIT_POLL_MS,
  waitForTheLabServer,
  writeTheJournal,
} from '../tools/hand-over-a-backup.mjs'

const NOON = () => new Date(2026, 0, 1, 12, 0, 0)
const noSleep = async (): Promise<void> => {}

/**
 * THE LAB SERVER'S PROGRAM UNDER A MADE-UP NAME. Every stand-in is a shell script of that base name in a folder
 * of its own, because the argv rule and the snapshot line read the program's base name from HAND_OVER_PROGRAM.
 * ANOTHER_PROGRAM is a second made-up name, for a line or an argv the rule must not take as the program's.
 */
const THE_PROGRAM = 'lamp-lighter'
const ANOTHER_PROGRAM = 'bell-ringer'

let scratch = ''
let program = ''
let programMarks = ''
let programLeavesAnRsync = ''
let programCopiesTheLock = ''
let programFails = ''
let rsyncPasses = ''
let rsyncMarks = ''
let rsyncDiffers = ''
let rsyncRecords = ''
const saved: Record<string, string | undefined> = {}
const HAND_OVER_NAMES = ['HAND_OVER_LAB_SERVER', 'HAND_OVER_LAB_ROOT', 'HAND_OVER_LOCK', 'HAND_OVER_PROGRAM', 'HAND_OVER_RSYNC', 'HAND_OVER_PROC', 'FAKE_SERVER', 'FAKE_STAMP', 'FAKE_EVENT', 'FAKE_RSYNC_ARGS']

/** One case's own lock file, in a folder of its own in this test's scratch folder. */
const theLockOf = (caseName: string): string => join(scratch, `${caseName}-lock`, `${THE_PROGRAM}.lock`)

/** The values the settings hold in this test, none of which a refusal may print. */
const theValuesSet = (): string[] => ['made-up-lab-server', '/made-up/lab', scratch, THE_PROGRAM]

/** A stand-in for the lab server's program: `<scratch>/bin/<what it does>/lamp-lighter`, its folder made here. */
function aStandIn(whatItDoes: string): string {
  mkdirSync(join(scratch, 'bin', whatItDoes), { recursive: true, mode: 0o755 })
  return join(scratch, 'bin', whatItDoes, THE_PROGRAM)
}

/** A data folder with one complete made-up backup and a second, unrelated one. */
function aDataFolder(caseName: string): { data: string; backups: string; name: string; other: string } {
  const data = join(scratch, caseName)
  const backups = join(data, 'backups')
  mkdirSync(backups, { recursive: true })
  const name = backupNameFor('the-backup-command', new Date(2026, 0, 1, 1, 2, 3))
  const other = backupNameFor('the-backup-command', new Date(2026, 0, 1, 4, 5, 6))
  const bytes = Buffer.concat([Buffer.from('SQLite format 3\u0000', 'latin1'), Buffer.alloc(400, 7)])
  writeFileSync(join(backups, name), bytes)
  writeFileSync(join(backups, other), bytes)
  mkdirSync(join(backups, filesFolderOf(name)))
  writeFileSync(join(backups, filesFolderOf(name), 'a.txt'), 'a made-up report file\n')
  mkdirSync(join(backups, filesFolderOf(name), 'nested'))
  writeFileSync(join(backups, filesFolderOf(name), 'nested', 'b.txt'), 'another made-up file\n')
  writeFileSync(join(backups, leftOutListOf(name)), 'A made-up list of the files this backup left out.\n')
  mkdirSync(join(backups, filesFolderOf(other)))
  return { data, backups, name, other }
}

/** The job's folder, made mode 700, and its output folder. */
function aJobFolder(caseName: string): { job: string; out: string } {
  const job = join(scratch, `${caseName}-job`)
  const out = join(job, 'out')
  rmSync(job, { recursive: true, force: true })
  mkdirSync(out, { recursive: true, mode: 0o700 })
  return { job, out }
}

/** A complete end-to-end call with the stand-ins and no real waiting. */
function handItOver(at: { data: string; job: string; out: string; name: string; now?: () => Date; sleep?: (ms: number) => Promise<void>; caseName: string; settingsFile?: string }) {
  process.env['FAKE_SERVER'] = join(scratch, `${at.caseName}-server`)
  process.env['FAKE_STAMP'] = '20260101-010203'
  return handOverTheBackup({
    backup: at.name,
    dataFolder: at.data,
    jobFolder: at.job,
    jobId: `job-${at.caseName}`,
    outputFolder: at.out,
    checkout: process.cwd(),
    now: at.now ?? NOON,
    sleep: at.sleep ?? noSleep,
    ...(at.settingsFile === undefined ? {} : { settingsFile: at.settingsFile }),
  })
}

/** A settings file of this test's own, in a folder of its own, so the checkout's real .env is never read. */
function aMadeUpSettingsFile(lines: string): string {
  const folder = aTestDatabaseFolder('hand-over-settings')
  const file = join(folder, '.env')
  writeFileSync(file, lines)
  return file
}

/**
 * ONE HAND-OVER THAT MUST BE REFUSED BEFORE ANYTHING IS TRANSFERRED. It proves the answer is a refusal,
 * the job's RESULT.json ends refused, and no program or rsync stand-in ran, no lock was taken and no
 * staging folder was made. It answers what the refusal said.
 *
 * `program` and `lock` are what HAND_OVER_PROGRAM and HAND_OVER_LOCK hold in the environment: null unsets one,
 * and by default they are a stand-in that marks its step and this case's own lock. Wherever the lock setting
 * points, this case's own lock file must stay untaken.
 */
async function aRefusedHandOver(at: { caseName: string; settingsFile: string; program?: string | null; lock?: string | null }): Promise<string> {
  const { data, name } = aDataFolder(at.caseName)
  const { job, out } = aJobFolder(at.caseName)
  const events = join(scratch, `${at.caseName}-events`)
  const lock = theLockOf(at.caseName)
  rmSync(events, { force: true })
  const set = (setting: string, value: string | null): void => {
    if (value === null) delete process.env[setting]
    else process.env[setting] = value
  }
  set('HAND_OVER_PROGRAM', at.program === undefined ? programMarks : at.program)
  process.env['HAND_OVER_RSYNC'] = rsyncMarks
  process.env['FAKE_EVENT'] = events
  set('HAND_OVER_LOCK', at.lock === undefined ? lock : at.lock)
  const answer = await handItOver({ data, job, out, name, caseName: at.caseName, settingsFile: at.settingsFile })
  expect(answer.ok, JSON.stringify(answer.result)).toBe(false)
  expect(existsSync(events), 'a program or rsync stand-in ran').toBe(false)
  expect(existsSync(lock), 'the shared lock was taken').toBe(false)
  expect(readdirSync(data), 'a staging folder was made').toEqual(['backups'])
  const filed = JSON.parse(readFileSync(join(out, 'RESULT.json'), 'utf8')) as Record<string, unknown>
  expect(filed['ok'], 'the job did not end refused').toBe(false)
  const says = String(answer.result['says'])
  // A REFUSAL NAMES A SETTING AND NEVER A VALUE, also a value that was refused.
  for (const value of [...theValuesSet(), at.program ?? '', at.lock ?? ''].filter((one) => one !== '')) expect(says).not.toContain(value)
  return says
}

beforeAll(() => {
  scratch = aTestDatabaseFolder('backup-handover-tool')
  mkdirSync(join(scratch, 'bin'), { mode: 0o755 })
  chmodSync(join(scratch, 'bin'), 0o755)
  mkdirSync(join(scratch, 'empty-proc'))
  program = aStandIn('plain')
  writeFileSync(
    program,
    [
      '#!/bin/sh',
      'name=""',
      'folder=""',
      'for word in "$@"; do case "$word" in name=*) name="${word#name=}";; esac; done',
      'folder="$2"',
      'stamp="${FAKE_STAMP:-20260101-010203}"',
      'mkdir -p "$FAKE_SERVER/$name/$stamp"',
      'cp -a "$folder/." "$FAKE_SERVER/$name/$stamp/"',
      'echo "lamp-lighter data $name: ok: snapshot $stamp on the server"',
      '',
    ].join('\n'),
    { mode: 0o755 },
  )
  programFails = aStandIn('fails')
  writeFileSync(programFails, '#!/bin/sh\necho "lamp-lighter data something: error: the made-up server refused the copy"\nexit 2\n', { mode: 0o755 })
  programMarks = aStandIn('marks-the-step')
  writeFileSync(
    programMarks,
    [
      '#!/bin/sh',
      'echo snapshot >> "$FAKE_EVENT"',
      'name=""',
      'folder=""',
      'for word in "$@"; do case "$word" in name=*) name="${word#name=}";; esac; done',
      'folder="$2"',
      'stamp="${FAKE_STAMP:-20260101-010203}"',
      'mkdir -p "$FAKE_SERVER/$name/$stamp"',
      'cp -a "$folder/." "$FAKE_SERVER/$name/$stamp/"',
      'echo "lamp-lighter data $name: ok: snapshot $stamp on the server"',
      '',
    ].join('\n'),
    { mode: 0o755 },
  )
  programLeavesAnRsync = aStandIn('leaves-an-rsync')
  writeFileSync(
    programLeavesAnRsync,
    [
      '#!/bin/sh',
      'echo snapshot >> "$FAKE_EVENT"',
      'mkdir -p "$HAND_OVER_PROC/424242"',
      "printf 'rsync\\000-a\\000made-up-lab-server:/made-up/lab\\000' > \"$HAND_OVER_PROC/424242/cmdline\"",
      'name=""',
      'folder=""',
      'for word in "$@"; do case "$word" in name=*) name="${word#name=}";; esac; done',
      'folder="$2"',
      'stamp="${FAKE_STAMP:-20260101-010203}"',
      'mkdir -p "$FAKE_SERVER/$name/$stamp"',
      'cp -a "$folder/." "$FAKE_SERVER/$name/$stamp/"',
      'echo "lamp-lighter data $name: ok: snapshot $stamp on the server"',
      '',
    ].join('\n'),
    { mode: 0o755 },
  )
  rsyncPasses = join(scratch, 'bin', 'a-made-up-rsync')
  writeFileSync(rsyncPasses, '#!/bin/sh\necho "sending incremental file list"\necho "sent 123 bytes  received 45 bytes"\nexit 0\n', { mode: 0o755 })
  programCopiesTheLock = aStandIn('copies-the-lock')
  writeFileSync(
    programCopiesTheLock,
    [
      '#!/bin/sh',
      'cp "$HAND_OVER_LOCK" "$FAKE_LOCK_COPY"',
      'echo snapshot >> "$FAKE_EVENT"',
      'name=""',
      'folder=""',
      'for word in "$@"; do case "$word" in name=*) name="${word#name=}";; esac; done',
      'folder="$2"',
      'stamp="${FAKE_STAMP:-20260101-010203}"',
      'mkdir -p "$FAKE_SERVER/$name/$stamp"',
      'cp -a "$folder/." "$FAKE_SERVER/$name/$stamp/"',
      'echo "lamp-lighter data $name: ok: snapshot $stamp on the server"',
      '',
    ].join('\n'),
    { mode: 0o755 },
  )
  rsyncMarks = join(scratch, 'bin', 'a-made-up-rsync-that-marks-the-step')
  writeFileSync(
    rsyncMarks,
    '#!/bin/sh\necho rsync >> "$FAKE_EVENT"\necho "sending incremental file list"\necho "sent 123 bytes  received 45 bytes"\nexit 0\n',
    { mode: 0o755 },
  )
  rsyncDiffers = join(scratch, 'bin', 'a-made-up-rsync-with-a-difference')
  writeFileSync(rsyncDiffers, '#!/bin/sh\necho "sending incremental file list"\necho "cd+++++++++ nested/"\necho ">f+++++++++ a.txt"\nexit 0\n', { mode: 0o755 })
  rsyncRecords = join(scratch, 'bin', 'a-made-up-rsync-that-records-its-arguments')
  writeFileSync(
    rsyncRecords,
    [
      '#!/bin/sh',
      'printf \'%s\\n\' "$@" > "$FAKE_RSYNC_ARGS"',
      'echo "sending incremental file list"',
      'exit 0',
      '',
    ].join('\n'),
    { mode: 0o755 },
  )
  for (const name of [program, programMarks, programLeavesAnRsync, programFails, programCopiesTheLock, rsyncPasses, rsyncMarks, rsyncDiffers, rsyncRecords]) chmodSync(name, 0o755)
  for (const name of HAND_OVER_NAMES) saved[name] = process.env[name]
  process.env['HAND_OVER_LAB_SERVER'] = 'made-up-lab-server'
  process.env['HAND_OVER_LAB_ROOT'] = '/made-up/lab'
  process.env['HAND_OVER_LOCK'] = join(scratch, 'lock', 'lamp-lighter.lock')
  process.env['HAND_OVER_PROGRAM'] = program
  process.env['HAND_OVER_RSYNC'] = rsyncPasses
  process.env['HAND_OVER_PROC'] = join(scratch, 'empty-proc')
})

afterEach(() => {
  process.env['HAND_OVER_LAB_SERVER'] = 'made-up-lab-server'
  process.env['HAND_OVER_LAB_ROOT'] = '/made-up/lab'
  process.env['HAND_OVER_LOCK'] = join(scratch, 'lock', 'lamp-lighter.lock')
  process.env['HAND_OVER_PROGRAM'] = program
  process.env['HAND_OVER_RSYNC'] = rsyncPasses
  process.env['HAND_OVER_PROC'] = join(scratch, 'empty-proc')
  delete process.env['FAKE_EVENT']
  delete process.env['FAKE_RSYNC_ARGS']
})

afterAll(() => {
  for (const name of HAND_OVER_NAMES) {
    if (saved[name] === undefined) delete process.env[name]
    else process.env[name] = saved[name]
  }
})

describe('the names and the server name', () => {
  it('1: the server name is built from the backup\'s own id and date, and no other shape is a backup name', () => {
    expect(isABackupName('mole-office-20260101-010203.db')).toBe(true)
    expect(isABackupName('mole-office-20260101-010203-taken-at-the-door-2.db')).toBe(true)
    expect(isABackupName('mole-office-20260101-010203-taken-at-the-door-10.db'), 'the tenth press in one second').toBe(true)
    expect(isABackupName('mole-office-20260101-010203-before-the-update.db')).toBe(true)
    for (const not of ['../elsewhere.db', 'mole-office-20260101-010203.db/../x', 'a-made-up.db', 'mole-office-20260101-010203.db\n']) {
      expect(isABackupName(not), not).toBe(false)
    }
    expect(theHandOverServerName('mole-office-20260101-010203.db')).toBe('office-handover-mole-office-20260101-010203')
    expect(theHandOverServerName('mole-office-20260101-010203-taken-at-the-door-2.db')).toBe('office-handover-mole-office-20260101-010203-taken-at-the-door-2')
    // The tool's own names and the office's are the same rule, in two files.
    expect(theFilesFolderOf('a.db')).toBe(filesFolderOf('a.db'))
  })
})

describe('the job folder of hard links', () => {
  it('2: it is outside the backups folder, links only that backup, and leaves the backup and the list as they were', async () => {
    const { data, backups, name, other } = aDataFolder('links')
    const before = readCompleteBackups(backups)
    const beforeNames = readdirSync(backups).sort()
    const commit = statSync(join(backups, name))
    const staged = await stageTheBackup({ dataFolder: data, backup: name, jobId: 'job-links', checkout: process.cwd(), now: NOON })
    expect(staged.folder).toBe(theStagingFolderOf(data, name))
    expect(staged.folder.startsWith(backups)).toBe(false)
    expect(dirname(staged.folder)).toBe(join(data, 'handover-staging'))
    expect(statSync(join(staged.folder, name)).ino).toBe(statSync(join(backups, name)).ino)
    expect(statSync(join(staged.folder, filesFolderOf(name), 'a.txt')).ino).toBe(statSync(join(backups, filesFolderOf(name), 'a.txt')).ino)
    expect(statSync(join(staged.folder, leftOutListOf(name))).ino).toBe(statSync(join(backups, leftOutListOf(name))).ino)
    expect(existsSync(join(staged.folder, other))).toBe(false)
    const manifest = JSON.parse(readFileSync(join(staged.folder, 'MANIFEST.json'), 'utf8')) as Record<string, any>
    expect(manifest.db).toBeUndefined()
    expect(manifest['backup']).toBe(name)
    expect(manifest['databaseSha256']).toBe(theSha256OfAFile(join(backups, name)))
    expect(manifest['commit']).toMatch(/^[0-9a-f]{40}$/)
    expect('stableTag' in manifest).toBe(true)
    expect(Array.isArray(manifest['files'])).toBe(true)
    expect(manifest['files'].some((one: { path: string }) => one.path === 'MANIFEST.json')).toBe(false)
    // The published backup and the list are untouched.
    expect(readdirSync(backups).sort()).toEqual(beforeNames)
    expect(readCompleteBackups(backups).backups.map((one) => one.entry.name).sort()).toEqual(before.backups.map((one) => one.entry.name).sort())
    expect(statSync(join(backups, name)).ino).toBe(commit.ino)
    expect(statSync(join(backups, name)).mtimeMs).toBe(commit.mtimeMs)
  })

  it('3: another filesystem, or another job\'s folder, fails the job and copies nothing', async () => {
    const { data, backups, name } = aDataFolder('exdev')
    const before = readdirSync(backups).sort()
    const exdev = Object.assign(new Error('cross-device link'), { code: 'EXDEV' })
    await expect(
      stageTheBackup({ dataFolder: data, backup: name, jobId: 'job-exdev', checkout: process.cwd(), now: NOON, link: () => { throw exdev } }),
    ).rejects.toThrow(/another filesystem/)
    expect(existsSync(theStagingFolderOf(data, name))).toBe(false)
    expect(readdirSync(backups).sort()).toEqual(before)

    mkdirSync(theStagingFolderOf(data, name), { recursive: true })
    await expect(stageTheBackup({ dataFolder: data, backup: name, jobId: 'job-again', checkout: process.cwd(), now: NOON })).rejects.toThrow(/another job/)
    rmSync(join(data, 'handover-staging'), { recursive: true, force: true })
  })
})

describe('the wait, the window and the proof', () => {
  it('4: the argv rule sees an rsync to the server and the program\'s data or git, and not an unrelated one', () => {
    expect(isAnRsyncToTheLabServer(['/usr/bin/rsync', '-a', 'a', 'made-up-lab-server:/x'], 'made-up-lab-server', THE_PROGRAM)).toBe(true)
    expect(isAnRsyncToTheLabServer(['rsync', '-a', 'a', '/tmp/b'], 'made-up-lab-server', THE_PROGRAM)).toBe(false)
    expect(isAnRsyncToTheLabServer(['python3', `/srv/someone/${THE_PROGRAM}`, 'data', 'a'], 'made-up-lab-server', THE_PROGRAM)).toBe(true)
    expect(isAnRsyncToTheLabServer([THE_PROGRAM, 'git'], 'made-up-lab-server', THE_PROGRAM)).toBe(true)
    expect(isAnRsyncToTheLabServer([THE_PROGRAM, 'remind'], 'made-up-lab-server', THE_PROGRAM)).toBe(false)
    // WITH NO SERVER NAMED, no rsync can be shown to reach it, but the program's data or git still reaches the lab.
    expect(isAnRsyncToTheLabServer(['rsync', '-a', 'a', 'made-up-lab-server:/x'], null, THE_PROGRAM)).toBe(false)
    expect(isAnRsyncToTheLabServer([THE_PROGRAM, 'data', 'a'], null, THE_PROGRAM)).toBe(true)
  })

  it('4e: the argv rule reads the program\'s base name from the setting, and with no program that half counts nothing', () => {
    // The setting may name the program by a path; the rule matches the base name, in any folder.
    expect(isAnRsyncToTheLabServer([THE_PROGRAM, 'data', 'a'], 'made-up-lab-server', `/opt/made-up/bin/${THE_PROGRAM}`)).toBe(true)
    expect(isAnRsyncToTheLabServer(['python3', `/srv/someone/${THE_PROGRAM}`, 'git'], 'made-up-lab-server', `/opt/made-up/bin/${THE_PROGRAM}`)).toBe(true)
    // Another program's data or git is not the lab server's program.
    expect(isAnRsyncToTheLabServer([ANOTHER_PROGRAM, 'data', 'a'], 'made-up-lab-server', THE_PROGRAM)).toBe(false)
    expect(isAnRsyncToTheLabServer(['python3', `/srv/someone/${ANOTHER_PROGRAM}`, 'git'], 'made-up-lab-server', THE_PROGRAM)).toBe(false)
    // WITH NO PROGRAM NAMED, no data or git counts, under any name, and the rsync half still does.
    expect(isAnRsyncToTheLabServer([THE_PROGRAM, 'data', 'a'], 'made-up-lab-server', null)).toBe(false)
    expect(isAnRsyncToTheLabServer([ANOTHER_PROGRAM, 'git'], 'made-up-lab-server', null)).toBe(false)
    expect(isAnRsyncToTheLabServer(['rsync', '-a', 'a', 'made-up-lab-server:/x'], 'made-up-lab-server', null)).toBe(true)
    // With neither named, nothing counts.
    expect(isAnRsyncToTheLabServer([THE_PROGRAM, 'data', 'a'], null, null)).toBe(false)
  })

  it('4b: the wait is bounded and says how it waited', async () => {
    let reads = 0
    const waited: number[] = []
    const answer = await waitForTheLabServer({
      deadline: Date.now() + 60_000,
      now: () => 0,
      sleep: async (ms) => { waited.push(ms) },
      pollMs: 1_000,
      readArgv: () => (reads++ < 2 ? [['rsync', 'made-up-lab-server:/x']] : []),
    })
    expect(answer).toEqual({ waitedMs: 2_000, by: 'the argv check' })
    expect(waited).toEqual([1_000, 1_000])
    let now = 0
    await expect(
      waitForTheLabServer({ deadline: 1_500, now: () => now, sleep: async (ms) => { now += ms }, pollMs: 1_000, readArgv: () => [['rsync', 'made-up-lab-server:/x']] }),
    ).rejects.toThrow(/stayed busy/)
  })

  it('4c: the snapshot waits for the shared flock, whose holder line names the job', async () => {
    const { data, name } = aDataFolder('the-shared-lock')
    const { job, out } = aJobFolder('the-shared-lock')
    const held = join(scratch, 'the-shared-lock-held')
    const release = join(scratch, 'the-shared-lock-release')
    const copied = join(scratch, 'the-shared-lock-copy')
    const events = join(scratch, 'the-shared-lock-events')
    for (const one of [held, release, copied, events]) rmSync(one, { force: true })
    process.env['HAND_OVER_PROGRAM'] = programCopiesTheLock
    process.env['FAKE_EVENT'] = events
    process.env['FAKE_LOCK_COPY'] = copied
    const lock = String(process.env['HAND_OVER_LOCK'])
    mkdirSync(dirname(lock), { recursive: true, mode: 0o700 })
    const holder = spawn('flock', ['-x', lock, 'sh', '-c', `touch '${held}'; while [ ! -e '${release}' ]; do sleep 0.02; done`], { stdio: 'ignore' })
    let holderFailed = ''
    holder.once('error', (error) => { holderFailed = String(error) })
    let handingOver: ReturnType<typeof handItOver> | null = null
    try {
      const until = Date.now() + 10_000
      for (;;) {
        if (existsSync(held)) break
        if (holderFailed !== '') throw new Error(`the lock holder could not start: ${holderFailed}`)
        if (Date.now() > until) throw new Error('the lock holder never took the lock')
        await new Promise((done) => setTimeout(done, 20))
      }
      handingOver = handItOver({ data, job, out, name, caseName: 'the-shared-lock' })
      // WAIT FOR THE JOURNAL, which the tool writes just before it tries the lock. The 500 ms below then starts
      // when the tool is one step from the lock, not while it is still staging; without the flock wrapper the
      // snapshot event appears inside it, so the case is red.
      const journal = theJournalOf(job)
      const untilTheJournal = Date.now() + 10_000
      while (!existsSync(journal)) {
        if (Date.now() > untilTheJournal) throw new Error('the hand-over never wrote its journal')
        await new Promise((done) => setTimeout(done, 20))
      }
      await new Promise((done) => setTimeout(done, 500))
      // THE SNAPSHOT DID NOT RUN WHILE ANOTHER PROCESS HELD THE LOCK.
      expect(existsSync(events), 'the program ran while another process held the shared lock').toBe(false)
      writeFileSync(release, '')
      const answer = await handingOver
      expect(answer.ok, JSON.stringify(answer.result)).toBe(true)
      const lines = readFileSync(copied, 'utf8').trim().split('\n')
      // THE HOLDER'S LINE: a process, the moment it took the lock with its offset, and what it took it for.
      const [holder, takenAt = ''] = lines
      expect(Number(holder)).toBeGreaterThan(0)
      expect(momentOfAnInstant(takenAt), `the lock file says when it was taken: ${takenAt}`).not.toBeNull()
      expect(lines[2]).toBe(`snapshot of ${name} for job job-the-shared-lock`)
    } finally {
      writeFileSync(release, '')
      if (handingOver !== null) await handingOver.catch(() => {})
      holder.kill('SIGKILL')
    }
  })

  it('4d: a server that becomes busy during the snapshot is waited for before the proof', async () => {
    const { data, name } = aDataFolder('busy-before-proof')
    const { job, out } = aJobFolder('busy-before-proof')
    const events = join(scratch, 'busy-before-proof-events')
    const proc = join(scratch, 'busy-before-proof-proc')
    rmSync(events, { force: true })
    rmSync(proc, { recursive: true, force: true })
    mkdirSync(proc, { recursive: true })
    process.env['HAND_OVER_PROGRAM'] = programLeavesAnRsync
    process.env['HAND_OVER_RSYNC'] = rsyncMarks
    process.env['HAND_OVER_PROC'] = proc
    process.env['FAKE_EVENT'] = events
    const slept: number[] = []
    let removed = false
    const answer = await handItOver({
      data,
      job,
      out,
      name,
      caseName: 'busy-before-proof',
      sleep: async (ms) => {
        slept.push(ms)
        appendFileSync(events, 'slept\n')
        // THE SERVER BECOMES FREE WHILE THE WAIT SLEEPS: the entry the snapshot's made-up program left is removed once.
        if (!removed) {
          removed = true
          rmSync(join(proc, '424242'), { recursive: true, force: true })
        }
      },
    })
    expect(answer.ok, JSON.stringify(answer.result)).toBe(true)
    expect(slept).toEqual([THE_WAIT_POLL_MS])
    expect(answer.result['serverWaitedSeconds']).toBe(THE_WAIT_POLL_MS / 1000)
    // THE PROOF WAITED. Without the argv wait before it the proof runs immediately and this is ['snapshot', 'rsync'].
    expect(readFileSync(events, 'utf8').trim().split('\n')).toEqual(['snapshot', 'slept', 'rsync'])
  })

  it('5: the Vault window ends at 02:45, and only the time inside it waits', () => {
    expect(theWaitForTheVaultWindow(new Date(2026, 0, 1, 0, 59, 59))).toBe(0)
    expect(theWaitForTheVaultWindow(new Date(2026, 0, 1, 1, 0, 0))).toBe(105 * 60 * 1000)
    expect(theWaitForTheVaultWindow(new Date(2026, 0, 1, 1, 30, 0))).toBe(75 * 60 * 1000)
    expect(theWaitForTheVaultWindow(new Date(2026, 0, 1, 2, 44, 59))).toBe(1_000)
    expect(theWaitForTheVaultWindow(new Date(2026, 0, 1, 2, 45, 0))).toBe(0)
  })

  it('5e: the window reads the owner\'s clock under the runner\'s TZ=UTC', async () => {
    const file = join(scratch, 'the-vault-window-under-utc.mjs')
    const moduleUrl = pathToFileURL(join(process.cwd(), 'src/shared/backup-hand-over.mjs')).href
    writeFileSync(file, [
      `import { theWaitForTheVaultWindow } from ${JSON.stringify(moduleUrl)}`,
      'const inMinutes = (iso) => theWaitForTheVaultWindow(new Date(iso)) / 60_000',
      'process.stdout.write(JSON.stringify({',
      "  '2026-07-01T00:00:00.000Z': inMinutes('2026-07-01T00:00:00.000Z'),",
      "  '2026-07-01T00:30:00.000Z': inMinutes('2026-07-01T00:30:00.000Z'),",
      "  '2026-06-30T23:59:59.000Z': inMinutes('2026-06-30T23:59:59.000Z'),",
      '}))',
      '',
    ].join('\n'))
    const child = spawn(process.execPath, [file], { env: { ...process.env, TZ: 'UTC' }, stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    let err = ''
    child.stdout.on('data', (chunk) => { out += String(chunk) })
    child.stderr.on('data', (chunk) => { err += String(chunk) })
    const code = await new Promise<number | null>((done) => child.once('close', (code) => done(code)))
    expect(code, err).toBe(0)
    // THE RUNNER GIVES EVERY TOOL TZ=UTC. 01:00 and 01:30 London are 00:00 and 00:30 UTC in July, and
    // 00:59:59 London is 23:59:59 UTC the day before; a local-time reader answers 0 for the first two.
    expect(JSON.parse(out)).toEqual({
      '2026-07-01T00:00:00.000Z': 105,
      '2026-07-01T00:30:00.000Z': 75,
      '2026-06-30T23:59:59.000Z': 0,
    })
  })

  it('7: the checksum proof counts file lines and leaves directory lines aside', () => {
    expect(theFileDifferencesIn('')).toBe(0)
    expect(theFileDifferencesIn('sending incremental file list\nsent 123 bytes  received 45 bytes\ntotal size is 400\n')).toBe(0)
    expect(theFileDifferencesIn('cd+++++++++ nested/\n.d..t...... nested/\n>f+++++++++ a.txt\n')).toBe(1)
    expect(theFileDifferencesIn('*deleting b.txt\n>f.st...... a.txt\n')).toBe(2)
  })
})

describe('the manifest, the snapshot and the proof, end to end', () => {
  it('6 and 7: the manifest reaches the snapshot, the proof passes, and the folder goes', async () => {
    const { data, backups, name } = aDataFolder('snapshot')
    const { job, out } = aJobFolder('snapshot')
    const before = statSync(join(backups, name))
    const answer = await handItOver({ data, job, out, name, caseName: 'snapshot' })
    expect(answer.ok, JSON.stringify(answer.result)).toBe(true)
    expect(answer.result['snapshotId']).toBe('20260101-010203')
    expect(answer.result['serverName']).toBe(theHandOverServerName(name))
    expect(answer.result['databaseSha256']).toBe(theSha256OfAFile(join(backups, name)))
    expect(answer.result['fileDifferences']).toBe(0)
    expect(answer.result['vaultWaitedSeconds']).toBe(0)
    expect(answer.result['waitedBy']).toBe('the argv check')
    expect(existsSync(theStagingFolderOf(data, name))).toBe(false)
    // The backup itself is as it was.
    expect(statSync(join(backups, name)).ino).toBe(before.ino)
    expect(statSync(join(backups, name)).mtimeMs).toBe(before.mtimeMs)
    expect(theSha256OfAFile(join(backups, name))).toBe(answer.result['databaseSha256'])
    // The made-up server has the snapshot, with the manifest in it.
    const snapshot = join(scratch, 'snapshot-server', theHandOverServerName(name), '20260101-010203')
    const manifest = JSON.parse(readFileSync(join(snapshot, 'MANIFEST.json'), 'utf8')) as Record<string, any>
    expect(manifest['backup']).toBe(name)
    expect(manifest['databaseSha256']).toBe(answer.result['databaseSha256'])
    expect(manifest['commit']).toMatch(/^[0-9a-f]{40}$/)
    expect(manifest['files'].map((one: { path: string }) => one.path).sort()).toEqual([name, filesFolderOf(name) + '/a.txt', filesFolderOf(name) + '/nested/b.txt', leftOutListOf(name)].sort())
    expect(existsSync(join(snapshot, 'MANIFEST.json'))).toBe(true)
    // The journal keeps the stamp and says it is done.
    const journal = JSON.parse(readFileSync(theJournalOf(job), 'utf8')) as Record<string, any>
    expect(journal['stamp']).toBe('20260101-010203')
    expect(journal['state']).toBe('done')
    expect(journal['databaseSha256']).toBe(answer.result['databaseSha256'])
    // The result the job files is the same answer.
    expect(JSON.parse(readFileSync(join(out, 'RESULT.json'), 'utf8'))).toMatchObject({ ok: true, snapshotId: '20260101-010203' })
  })

  it('7b: a checksum difference keeps the folder, names the count and where it is', async () => {
    const { data, name } = aDataFolder('proof')
    const { job, out } = aJobFolder('proof')
    process.env['HAND_OVER_RSYNC'] = rsyncDiffers
    const answer = await handItOver({ data, job, out, name, caseName: 'proof' })
    expect(answer.ok).toBe(false)
    expect(String(answer.result['says'])).toMatch(/found 1 file difference/)
    expect(answer.result['folderKept']).toBe(theStagingFolderOf(data, name))
    expect(existsSync(theStagingFolderOf(data, name))).toBe(true)
    rmSync(join(data, 'handover-staging'), { recursive: true, force: true })
  })

  it('7c: a checksum check that fails keeps the snapshot it names and says the check did not succeed', async () => {
    const { data, name } = aDataFolder('proof-fails')
    const { job, out } = aJobFolder('proof-fails')
    const rsyncFails = aStandIn('rsync-fails')
    writeFileSync(rsyncFails, '#!/bin/sh\necho "sending incremental file list"\necho "rsync: connection unexpectedly closed (made-up words)"\nexit 23\n', { mode: 0o755 })
    process.env['HAND_OVER_RSYNC'] = rsyncFails
    const answer = await handItOver({ data, job, out, name, caseName: 'proof-fails' })
    expect(answer.ok).toBe(false)
    const says = String(answer.result['says'])
    expect(says).not.toContain('did not report a snapshot')
    expect(says).toContain('20260101-010203')
    expect(says).toContain('checksum check')
    expect(says).toContain('did not succeed')
    expect(says).toContain('rsync: connection unexpectedly closed (made-up words)')
    expect(answer.result['stampKnown']).toBe(true)
    expect(answer.result['partial']).toBe(THE_TOOL_WORDS.knownStamp(theHandOverServerName(name), '20260101-010203'))
    expect(answer.result['folderKept']).toBe(null)
    expect(existsSync(theStagingFolderOf(data, name))).toBe(false)
  })

  it('7d: the failed-check sentence is still a sentence when the check said nothing', () => {
    expect(THE_TOOL_WORDS.theProofDidNotSucceed('20260101-010203', '')).toBe('The checksum check of 20260101-010203 did not succeed, and it said nothing.')
  })

  it('6b: the program\'s failure keeps its last line, removes the folder and says a stamp is unknown when it never saw one', async () => {
    const { data, name } = aDataFolder('program-fails')
    const { job, out } = aJobFolder('program-fails')
    process.env['HAND_OVER_PROGRAM'] = programFails
    const answer = await handItOver({ data, job, out, name, caseName: 'program-fails' })
    expect(answer.ok).toBe(false)
    expect(String(answer.result['says'])).toContain('the made-up server refused the copy')
    expect(answer.result['stampKnown']).toBe(false)
    expect(String(answer.result['partial'])).toMatch(/stamp is unknown/)
    expect(existsSync(theStagingFolderOf(data, name))).toBe(false)
  })

  it('6c: the snapshot is read only from a line under the program\'s own base name', async () => {
    const { data, name } = aDataFolder('another-name')
    const { job, out } = aJobFolder('another-name')
    const saysAnotherName = aStandIn('says-another-name')
    writeFileSync(
      saysAnotherName,
      [
        '#!/bin/sh',
        'name=""',
        'for word in "$@"; do case "$word" in name=*) name="${word#name=}";; esac; done',
        `echo "${ANOTHER_PROGRAM} data $name: ok: snapshot 20260101-010203 on the server"`,
        '',
      ].join('\n'),
      { mode: 0o755 },
    )
    process.env['HAND_OVER_PROGRAM'] = saysAnotherName
    const answer = await handItOver({ data, job, out, name, caseName: 'another-name' })
    expect(answer.ok, JSON.stringify(answer.result)).toBe(false)
    expect(String(answer.result['says'])).toMatch(/ended without a line that names a snapshot/)
    expect(answer.result['snapshotId']).toBe(null)
    expect(existsSync(theStagingFolderOf(data, name))).toBe(false)
  })

  it('5b: the job waits for the Vault window and says it did', async () => {
    const { data, name } = aDataFolder('vault')
    const { job, out } = aJobFolder('vault')
    const slept: number[] = []
    let clock = new Date(2026, 0, 1, 1, 30, 0).getTime()
    const answer = await handItOver({
      data,
      job,
      out,
      name,
      caseName: 'vault',
      now: () => new Date(clock),
      sleep: async (ms) => {
        slept.push(ms)
        clock += ms
      },
    })
    expect(answer.ok, JSON.stringify(answer.result)).toBe(true)
    expect(slept).toEqual([75 * 60 * 1000])
    expect(answer.result['vaultWaitedSeconds']).toBe(4_500)
  })

  it('5c: a job that begins a second before 01:00 waits before the snapshot, not after it', async () => {
    const { data, name } = aDataFolder('vault-crossing')
    const { job, out } = aJobFolder('vault-crossing')
    const events = join(scratch, 'vault-crossing-events')
    rmSync(events, { force: true })
    process.env['HAND_OVER_PROGRAM'] = programMarks
    process.env['FAKE_EVENT'] = events
    const start = new Date(2026, 0, 1, 0, 59, 59).getTime()
    let clock = start
    let firstRead = true
    const now = () => {
      if (firstRead) {
        firstRead = false
        clock = new Date(2026, 0, 1, 1, 0, 1).getTime()
        return new Date(start)
      }
      return new Date(clock)
    }
    const slept: number[] = []
    const answer = await handItOver({
      data,
      job,
      out,
      name,
      caseName: 'vault-crossing',
      now,
      sleep: async (ms) => {
        slept.push(ms)
        appendFileSync(events, 'slept\n')
        clock += ms
      },
    })
    expect(answer.ok, JSON.stringify(answer.result)).toBe(true)
    expect(slept).toEqual([104 * 60 * 1000 + 59 * 1000])
    expect(answer.result['vaultWaitedSeconds']).toBe(6_299)
    // THE SNAPSHOT CAME AFTER THE WAIT, not before it: the made-up program writes its own line.
    expect(readFileSync(events, 'utf8').trim().split('\n')).toEqual(['slept', 'snapshot'])
  })

  it('5d: a snapshot that takes the job into the window makes the proof wait before it', async () => {
    const { data, name } = aDataFolder('vault-before-proof')
    const { job, out } = aJobFolder('vault-before-proof')
    const events = join(scratch, 'vault-before-proof-events')
    rmSync(events, { force: true })
    process.env['HAND_OVER_PROGRAM'] = programMarks
    process.env['HAND_OVER_RSYNC'] = rsyncMarks
    process.env['FAKE_EVENT'] = events
    const snapshot = join(scratch, 'vault-before-proof-server', theHandOverServerName(name), '20260101-010203')
    // January, so the owner's London clock and UTC read the same numbers.
    const beforeTheWindow = new Date('2026-01-02T00:59:30.000Z')
    const insideTheWindow = new Date('2026-01-02T01:05:00.000Z')
    const slept: number[] = []
    // THE CLOCK MOVES WHEN THE JOB SLEEPS, as the real one does: the proof now asks the window again after its wait,
    // and a frozen clock would say 01:05 for ever.
    let clock = beforeTheWindow.getTime()
    let theSnapshotIsThere = false
    const answer = await handItOver({
      data,
      job,
      out,
      name,
      caseName: 'vault-before-proof',
      now: () => {
        if (!theSnapshotIsThere && existsSync(snapshot)) {
          theSnapshotIsThere = true
          clock = insideTheWindow.getTime()
        }
        return new Date(clock)
      },
      sleep: async (ms) => {
        slept.push(ms)
        appendFileSync(events, 'slept\n')
        clock += ms
      },
    })
    expect(answer.ok, JSON.stringify(answer.result)).toBe(true)
    expect(slept).toEqual([100 * 60 * 1000])
    expect(answer.result['vaultWaitedSeconds']).toBe(6_000)
    // THE PROOF WAITED. Without the check before it, the proof runs immediately and this is ['snapshot', 'rsync'].
    expect(readFileSync(events, 'utf8').trim().split('\n')).toEqual(['snapshot', 'slept', 'rsync'])
  })

  it('5f: a wait for the lab server that crosses 01:00 is followed by the window check, and the proof waits', async () => {
    const { data, name } = aDataFolder('vault-crossing-the-wait')
    const { job, out } = aJobFolder('vault-crossing-the-wait')
    const events = join(scratch, 'vault-crossing-the-wait-events')
    const proc = join(scratch, 'vault-crossing-the-wait-proc')
    rmSync(events, { force: true })
    rmSync(proc, { recursive: true, force: true })
    mkdirSync(proc, { recursive: true })
    process.env['HAND_OVER_PROGRAM'] = programLeavesAnRsync
    process.env['HAND_OVER_RSYNC'] = rsyncMarks
    process.env['HAND_OVER_PROC'] = proc
    process.env['FAKE_EVENT'] = events
    // JANUARY, so the owner's London clock and UTC read the same numbers.
    let clock = new Date('2026-01-02T00:59:50.000Z').getTime()
    const slept: number[] = []
    let removed = false
    const answer = await handItOver({
      data,
      job,
      out,
      name,
      caseName: 'vault-crossing-the-wait',
      now: () => new Date(clock),
      sleep: async (ms) => {
        slept.push(ms)
        appendFileSync(events, 'slept\n')
        clock += ms
        // THE SERVER BECOMES FREE WHILE THE WAIT SLEEPS: the entry the snapshot's made-up program left is removed once.
        if (!removed) {
          removed = true
          rmSync(join(proc, '424242'), { recursive: true, force: true })
        }
      },
    })
    expect(answer.ok, JSON.stringify(answer.result)).toBe(true)
    expect(answer.result['serverWaitedSeconds']).toBe(THE_WAIT_POLL_MS / 1000)
    // THE WINDOW OPENED DURING THAT WAIT. 01:00:00 to 02:45:00 is 105 minutes, and the proof came after it.
    expect(answer.result['vaultWaitedSeconds']).toBe(105 * 60)
    expect(slept).toEqual([THE_WAIT_POLL_MS, 105 * 60 * 1000])
    expect(readFileSync(events, 'utf8').trim().split('\n')).toEqual(['snapshot', 'slept', 'slept', 'rsync'])
  })
})

describe('recovery', () => {
  /** Stage one backup and write its journal, as the tool does before the upload. */
  async function staged(caseName: string) {
    const { data, backups, name } = aDataFolder(caseName)
    const { job } = aJobFolder(caseName)
    const answer = await stageTheBackup({ dataFolder: data, backup: name, jobId: `job-${caseName}`, checkout: process.cwd(), now: NOON })
    const journal = theJournalFor({ jobId: `job-${caseName}`, backup: name, staged: answer })
    writeTheJournal(job, journal)
    return { data, backups, name, job, stagedFile: answer.folder, journal }
  }

  it('8: it removes the job\'s own verified links, also after the originals were pruned', async () => {
    const { data, backups, name, job, stagedFile } = await staged('recover-good')
    rmSync(join(backups, name))
    rmSync(join(backups, filesFolderOf(name)), { recursive: true })
    rmSync(join(backups, leftOutListOf(name)))
    expect(existsSync(join(stagedFile, name))).toBe(true)
    const answer = recoverTheStagedFolder({ dataFolder: data, jobFolder: job, jobId: 'job-recover-good' })
    expect(answer.removed, answer.says).toBe(true)
    expect(existsSync(stagedFile)).toBe(false)
    expect(existsSync(join(data, 'handover-staging'))).toBe(true)
  })

  it('8b: an extra file, a replacement, a link or a missing journal keeps the folder', async () => {
    const extra = await staged('recover-extra')
    writeFileSync(join(extra.stagedFile, 'an-extra-file'), 'not the journal\'s\n')
    expect(recoverTheStagedFolder({ dataFolder: extra.data, jobFolder: extra.job, jobId: 'job-recover-extra' })).toMatchObject({ removed: false, says: expect.stringMatching(/does not list/) })
    expect(existsSync(extra.stagedFile)).toBe(true)

    const replaced = await staged('recover-replaced')
    rmSync(join(replaced.stagedFile, replaced.name))
    writeFileSync(join(replaced.stagedFile, replaced.name), Buffer.concat([Buffer.from('SQLite format 3\u0000', 'latin1'), Buffer.alloc(400, 8)]))
    expect(recoverTheStagedFolder({ dataFolder: replaced.data, jobFolder: replaced.job, jobId: 'job-recover-replaced' })).toMatchObject({ removed: false, says: expect.stringMatching(/not the one the journal recorded|changed/) })

    const linked = await staged('recover-link')
    rmSync(join(linked.stagedFile, linked.name))
    symlinkSync('/etc/hostname', join(linked.stagedFile, linked.name))
    expect(recoverTheStagedFolder({ dataFolder: linked.data, jobFolder: linked.job, jobId: 'job-recover-link' })).toMatchObject({ removed: false, says: expect.stringMatching(/link|not a regular file/i) })

    const noJournal = await staged('recover-no-journal')
    rmSync(theJournalOf(noJournal.job))
    expect(recoverTheStagedFolder({ dataFolder: noJournal.data, jobFolder: noJournal.job, jobId: 'job-recover-no-journal' })).toMatchObject({ removed: false, says: expect.stringMatching(/is not there/) })
    expect(existsSync(noJournal.stagedFile)).toBe(true)
  })

  it('8c: a path escape, another job\'s journal and an empty journal are refused and nothing is removed', async () => {
    const escape = await staged('recover-escape')
    const journalFile = theJournalOf(escape.job)
    const changed = JSON.parse(readFileSync(journalFile, 'utf8')) as Record<string, unknown>
    changed['folder'] = join(scratch, 'somewhere-else')
    writeFileSync(journalFile, JSON.stringify(changed))
    expect(recoverTheStagedFolder({ dataFolder: escape.data, jobFolder: escape.job, jobId: 'job-recover-escape' })).toMatchObject({ removed: false, says: expect.stringMatching(/not this job's own folder/) })
    expect(existsSync(escape.stagedFile)).toBe(true)

    const another = await staged('recover-another')
    const anotherJournal = JSON.parse(readFileSync(theJournalOf(another.job), 'utf8')) as Record<string, unknown>
    anotherJournal['job'] = 'another-job'
    writeFileSync(theJournalOf(another.job), JSON.stringify(anotherJournal))
    expect(recoverTheStagedFolder({ dataFolder: another.data, jobFolder: another.job, jobId: 'job-recover-another' })).toMatchObject({ removed: false, says: expect.stringMatching(/not the journal of job/) })
    expect(existsSync(another.stagedFile)).toBe(true)

    const empty = await staged('recover-empty')
    writeFileSync(theJournalOf(empty.job), '{}')
    expect(recoverTheStagedFolder({ dataFolder: empty.data, jobFolder: empty.job, jobId: 'job-recover-empty' })).toMatchObject({ removed: false })
    expect(existsSync(empty.stagedFile)).toBe(true)
  })

  it('8d: a journal whose folder is under another root is refused and kept, also when this root does not exist', async () => {
    const { data, name } = aDataFolder('recover-older-root')
    const { job } = aJobFolder('recover-older-root')
    const answer = await stageTheBackup({ dataFolder: data, backup: name, jobId: 'job-recover-older-root', checkout: process.cwd(), now: NOON })
    // The staged folder moves under a root of another name, as a journal written under an older root names it,
    // and this tool's own root is then removed, so it does not exist when recovery runs.
    const older = join(data, 'an-older-handover', basename(answer.folder))
    mkdirSync(dirname(older))
    renameSync(answer.folder, older)
    rmdirSync(dirname(answer.folder))
    writeTheJournal(job, theJournalFor({ jobId: 'job-recover-older-root', backup: name, staged: { ...answer, folder: older } }))
    expect(existsSync(join(data, 'handover-staging'))).toBe(false)
    expect(recoverTheStagedFolder({ dataFolder: data, jobFolder: job, jobId: 'job-recover-older-root' })).toMatchObject({ removed: false, says: expect.stringMatching(/not this job's own folder/) })
    expect(existsSync(join(older, name))).toBe(true)
  })
})

describe('the door and the register', () => {
  const WORKSPACE = 'default'
  const SECRETARY = 'made-up-handover-secretary'
  let db: TestDb
  let app: Awaited<ReturnType<typeof apiApp>>
  let backups = ''
  let person: Record<string, string> = {}
  let secretary: Record<string, string> = {}
  let secretaryId = ''
  let aStandInProgram = ''
  let officeKey = ''
  let decisionId = ''
  let planted = 0

  const send = async (headers: Record<string, string>, url: string, payload?: Record<string, unknown>) => {
    const reply = await app.app.inject({ method: 'POST', url, headers: { 'content-type': 'application/json', ...headers }, payload: payload ?? {} })
    let body: Record<string, any> = {}
    try {
      body = reply.json() as Record<string, any>
    } catch {
      body = {}
    }
    return { status: reply.statusCode, body, said: String((body as Record<string, any>)['error'] ?? reply.body) }
  }

  /** A made-up database and its companion, planted in this test's backups folder. */
  function plantABackup(): string {
    planted += 1
    const name = backupNameFor('the-backup-command', new Date(2026, 0, 2, 3, 4, 5 + planted))
    writeFileSync(join(backups, name), readFileSync(db.file))
    mkdirSync(join(backups, filesFolderOf(name)))
    return name
  }

  beforeAll(async () => {
    db = await freshDb()
    app = await apiApp()
    await app.app.ready()
    const { settings } = await import('../src/config/settings.mjs')
    backups = settings().backupsDirectory
    mkdirSync(backups, { recursive: true })
    const kept = JSON.parse(readFileSync(settings().keysPath, 'utf8')) as { office?: unknown }
    if (typeof kept.office !== 'string') throw new Error('the office made no office key beside the database')
    officeKey = kept.office
    person = { 'x-mole-office-workspace': WORKSPACE, 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON, ...thePersonsKeyHeader() }
    const made = await send(person, '/api/agents/started', { handle: SECRETARY, name: 'Made-up hand-over secretary', role: 'secretary' })
    expect(made.status, made.said.slice(0, 300)).toBe(201)
    secretaryId = String(made.body['agent']?.id ?? '')
    secretary = { 'x-mole-office-workspace': WORKSPACE, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': SECRETARY, 'x-mole-office-key': String(made.body['whatToGiveIt']?.key ?? '') }
    aStandInProgram = join(scratch, 'bin', 'a-made-up-hand-over-tool')
    writeFileSync(aStandInProgram, '#!/bin/sh\necho "the made-up hand-over tool ran"\n', { mode: 0o755 })
    chmodSync(aStandInProgram, 0o755)
  }, 60_000)

  afterAll(async () => {
    await app?.app.close()
    db?.close()
  })

  it('9: the job carries no digest while the tool is not registered, and the declaration\'s digest once it is', async () => {
    const name = plantABackup()
    const unregistered = await send(person, '/api/office/backups/hand-over', { backup: name })
    expect(unregistered.status, unregistered.said.slice(0, 300)).toBe(201)
    expect(unregistered.body['job']['data']['sha256']).toBeUndefined()
    expect(unregistered.body['job']['data']['state']).toBe('asked')

    // The owner's decision, and the secretary's registration of a stand-in.
    const words = await send(person, '/api/records', { kind: 'note', title: 'What the person said about the hand-over tool', data: { body: 'the office may register the hand-over tool' } })
    expect(words.status, words.said.slice(0, 300)).toBe(201)
    const decided = await send(person, '/api/records', {
      kind: 'decision',
      title: 'The hand-over tool is registered for this test',
      data: { replaces: [], option_taken: 'register the stand-in', because: 'this test office needs it', decided_by: THE_OWNER, authority: 'the owner said so', authority_reference: words.body['record'].id },
    })
    expect(decided.status, decided.said.slice(0, 300)).toBe(201)
    decisionId = String(decided.body['record'].id)
    const { theSha256Of } = await import('../src/config/host-tools.mjs')
    const declaration = {
      name: 'hand-over-a-backup',
      what: 'a made-up stand-in for the hand-over tool, in a test only',
      program: { path: aStandInProgram, sha256: theSha256Of(aStandInProgram) },
      argv: ['{backup}'],
      arguments: { backup: { text: { pattern: '^mole-office-[0-9]{8}-[0-9]{6}(-[a-z-]+)?(-[0-9]+)?\\.db$', maxLength: 120 } } },
      folder: join(scratch, 'work'),
      timeLimitSeconds: THE_HAND_OVER_TIME_LIMIT_SECONDS,
      outputs: [{ name: 'RESULT.json', maxBytes: 8_000 }],
      logLines: 20,
      mayAsk: { agents: [secretaryId] },
      recovery: { program: { path: aStandInProgram, sha256: theSha256Of(aStandInProgram) }, argv: ['--recover', '{job}'] },
    }
    mkdirSync(declaration.folder, { recursive: true })
    const registered = await send(secretary, '/api/host-tools', { declaration, decision: decisionId })
    expect(registered.status, registered.said.slice(0, 400)).toBe(201)

    const withDigest = await send(person, '/api/office/backups/hand-over', { backup: name })
    expect(withDigest.status, withDigest.said.slice(0, 300)).toBe(201)
    expect(withDigest.body['job']['data']['sha256']).toBe(declaration.program.sha256)

    // The take hands the registered declaration to a runner, and the two jobs are both waiting.
    const taken = await send({ 'x-mole-office-workspace': WORKSPACE, 'x-mole-office-key': officeKey }, '/api/host-jobs/take')
    expect(taken.status, taken.said.slice(0, 300)).toBe(200)
    expect(taken.body['declaration']).toMatchObject({ name: 'hand-over-a-backup', recovery: { argv: ['--recover', '{job}'] } })
    expect(taken.body['job']['data']['state']).toBe('running')
    expect(taken.body['job']['data']['sha256']).toBe(declaration.program.sha256)
  })

  it('9b: a declaration whose recovery program is not the file it names is refused at registration', async () => {
    const { theSha256Of } = await import('../src/config/host-tools.mjs')
    const base = {
      what: 'a made-up stand-in whose recovery program the door checks on disk',
      program: { path: aStandInProgram, sha256: theSha256Of(aStandInProgram) },
      argv: [],
      arguments: {},
      folder: join(scratch, 'work'),
      timeLimitSeconds: THE_HAND_OVER_TIME_LIMIT_SECONDS,
      outputs: [],
      logLines: 20,
      mayAsk: { agents: [secretaryId] },
    }
    const wrongSha = {
      ...base,
      name: 'the-recovery-check-wrong-sha',
      recovery: { program: { path: aStandInProgram, sha256: 'a'.repeat(64) }, argv: ['--recover', '{job}'] },
    }
    const refused = await send(secretary, '/api/host-tools', { declaration: wrongSha, decision: decisionId })
    expect(refused.status, refused.said.slice(0, 400)).toBe(400)
    expect(refused.said).toContain('its recovery program is not the one it names')

    const missing = {
      ...base,
      name: 'the-recovery-check-missing',
      recovery: { program: { path: join(scratch, 'bin', 'nothing-here'), sha256: 'a'.repeat(64) }, argv: ['--recover', '{job}'] },
    }
    const absent = await send(secretary, '/api/host-tools', { declaration: missing, decision: decisionId })
    expect(absent.status, absent.said.slice(0, 400)).toBe(400)
    expect(absent.said).toContain('its recovery program is not the one it names')

    const openRecovery = join(scratch, 'bin', 'a-made-up-open-recoverer')
    writeFileSync(openRecovery, '#!/bin/sh\necho "the open recoverer ran"\n', { mode: 0o777 })
    chmodSync(openRecovery, 0o777)
    const open = {
      ...base,
      name: 'the-recovery-check-open',
      recovery: { program: { path: openRecovery, sha256: theSha256Of(openRecovery) }, argv: ['--recover', '{job}'] },
    }
    const writable = await send(secretary, '/api/host-tools', { declaration: open, decision: decisionId })
    expect(writable.status, writable.said.slice(0, 400)).toBe(400)
    expect(writable.said).toContain('its recovery program is not the one it names')
  })

  it('10: a job with no digest still reads 200 with its words, and the older answer shape still works', async () => {
    const off = await send(secretary, '/api/host-tools/take-off', { name: 'hand-over-a-backup', decision: decisionId })
    expect(off.status, off.said.slice(0, 300)).toBe(200)
    const name = plantABackup()
    const filed = await send(person, '/api/office/backups/hand-over', { backup: name })
    expect(filed.status, filed.said.slice(0, 300)).toBe(201)
    const id = String(filed.body['job']['id'])
    expect(filed.body['job']['kind']).toBe(HOST_JOB_KIND)
    const read = await app.app.inject({ method: 'GET', url: `/api/host-jobs/${id}`, headers: person })
    expect(read.statusCode, read.body).toBe(200)
    const body = read.json() as Record<string, any>
    expect(body['job']['data']['sha256']).toBeUndefined()
    expect(body['digests']['program']['sha256Base64']).toBeNull()
    expect(String(body['digests']['program']['says'])).toMatch(/digest/)
    const open = await app.app.inject({ method: 'GET', url: `/api/host-jobs/${id}`, headers: secretary })
    expect(open.statusCode, open.body).toBe(200)
  })
})


describe('the runner calls a lost job\'s own recovery step, and only after its scope has stopped', () => {
  const WORKSPACE = 'default'
  const SECRETARY = 'made-up-recovery-secretary'
  const ASKER = 'a-made-up-recovery-worker'
  let db: TestDb
  let app: Awaited<ReturnType<typeof apiApp>>
  let api = ''
  let runnerFolder = ''
  let toolsFile = ''
  let officeKey = ''
  let reportFile = ''
  let taskId = ''
  let askerId = ''
  let runId = ''
  let runKey = ''
  let secretary: Record<string, string> = {}
  let decision = ''

  const send = async (method: 'GET' | 'POST', url: string, headers: Record<string, string>, payload?: Record<string, unknown>) => {
    const reply = await app.app.inject({ method, url, headers: { 'content-type': 'application/json', ...headers }, ...(payload === undefined ? {} : { payload }) })
    let body: Record<string, any> = {}
    try {
      body = reply.json() as Record<string, any>
    } catch {
      body = {}
    }
    return { status: reply.statusCode, body, said: String(body['error'] ?? reply.body) }
  }

  beforeAll(async () => {
    db = await freshDb()
    app = await apiApp()
    await app.app.ready()
    await app.app.listen({ host: '127.0.0.1', port: 0 })
    api = `http://127.0.0.1:${String((app.app.server.address() as { port: number }).port)}`
    const { settings } = await import('../src/config/settings.mjs')
    const kept = JSON.parse(readFileSync(settings().keysPath, 'utf8')) as { office: string }
    officeKey = kept.office
    toolsFile = join(dirname(settings().keysPath), 'host-tools.json')
    runnerFolder = join(dirname(settings().keysPath), 'host-jobs')
    mkdirSync(runnerFolder, { recursive: true, mode: 0o700 })
    reportFile = join(scratch, 'the-recovery-report')
    const person = { 'x-mole-office-workspace': WORKSPACE, 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON, ...thePersonsKeyHeader() }
    const made = await send('POST', '/api/agents/started', person, { handle: SECRETARY, name: 'Made-up recovery secretary', role: 'secretary' })
    expect(made.status, made.said.slice(0, 300)).toBe(201)
    const secretaryId = String(made.body['agent']?.id ?? '')
    secretary = { 'x-mole-office-workspace': WORKSPACE, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': SECRETARY, 'x-mole-office-key': String(made.body['whatToGiveIt']?.key ?? '') }
    const worker = await send('POST', '/api/agents/started', person, { handle: ASKER, name: ASKER, role: 'worker', runtime: 'claude-code' })
    expect(worker.status, worker.said.slice(0, 300)).toBe(201)
    askerId = String(worker.body['agent']?.id ?? '')
    const words = await send('POST', '/api/records', person, { kind: 'note', title: 'What the person said about recovery', data: { body: 'the runner may call a tool\'s recovery step' } })
    expect(words.status).toBe(201)
    const decided = await send('POST', '/api/records', person, {
      kind: 'decision',
      title: 'A registered tool may name its own recovery step for this test',
      data: { replaces: [], option_taken: 'register the recovery stand-in', because: 'this test needs a lost job', decided_by: THE_OWNER, authority: 'the owner said so', authority_reference: words.body['record'].id },
    })
    expect(decided.status, decided.said.slice(0, 300)).toBe(201)
    decision = String(decided.body['record'].id)
    const program = join(scratch, 'bin', 'a-made-up-recoverer')
    writeFileSync(program, ['#!/bin/sh', `{ echo "$@"; echo "$HOST_JOB_ID"; echo "$HOST_JOB_OUTPUT"; } > '${reportFile}'`, 'echo "the made-up folder was checked and removed"', ''].join('\n'), { mode: 0o755 })
    chmodSync(program, 0o755)
    const { theSha256Of } = await import('../src/config/host-tools.mjs')
    const work = join(scratch, 'recovery-work')
    mkdirSync(work, { recursive: true })
    const declaration = {
      name: 'the-made-up-recoverer',
      what: 'a stand-in whose own recovery step this test calls',
      program: { path: program, sha256: theSha256Of(program) },
      argv: [],
      arguments: {},
      folder: work,
      timeLimitSeconds: 20,
      outputs: [],
      logLines: 20,
      mayAsk: { agents: [askerId] },
      recovery: { program: { path: program, sha256: theSha256Of(program) }, argv: ['--recover', '{job}'] },
    }
    const registered = await send('POST', '/api/host-tools', secretary, { declaration, decision })
    expect(registered.status, registered.said.slice(0, 500)).toBe(201)
    const run = await send('POST', '/api/records', {
      'x-mole-office-workspace': WORKSPACE,
      'x-mole-office-actor-type': 'agent',
      'x-mole-office-actor-id': 'mole-office/the-message-worker',
      'x-mole-office-key': officeKey,
    }, { kind: 'session', title: 'A made-up recovery run', data: { state: 'running', runtime: 'claude-code', startedByMoleOffice: true, servingAgent: askerId, doing: 'a made-up run' } })
    expect(run.status, run.said.slice(0, 300)).toBe(201)
    runId = String(run.body['record'].id)
    runKey = String(run.body['runKey']?.key ?? '')
    const asked = await send('POST', '/api/host-jobs', {
      'x-mole-office-workspace': WORKSPACE,
      'x-mole-office-actor-type': 'agent',
      'x-mole-office-actor-id': ASKER,
      'x-mole-office-session': runId,
      'x-mole-office-key': runKey,
    }, { tool: 'the-made-up-recoverer', arguments: {} })
    expect(asked.status, asked.said.slice(0, 400)).toBe(201)
    taskId = String(asked.body['job'].id)
    const taken = await send('POST', '/api/host-jobs/take', { 'x-mole-office-workspace': WORKSPACE, 'x-mole-office-key': officeKey }, { holding: 'nothing' })
    expect(taken.status, taken.said.slice(0, 300)).toBe(200)
    expect(taken.body['job']['id']).toBe(taskId)
    // A runner that stopped after it took the job and after it wrote the tool's process group down. That group has
    // ended: 2,000,000,000 is above this system's largest process number, so no process can have it.
    writeFileSync(join(runnerFolder, 'taken.json'), JSON.stringify({ id: taskId, workspaceId: WORKSPACE, tool: 'the-made-up-recoverer', groupId: 2_000_000_000, groupStartedAt: '2026-01-01T00:00:00.000Z' }))
    const { chmodSync: chmod } = await import('node:fs')
    chmod(runnerFolder, 0o700)
  }, 60_000)

  afterAll(async () => {
    await app?.app.close()
    db?.close()
  })

  it('11: a lost job\'s recovery step runs once, with the job\'s id, after its group has ended, and its words reach the answer', async () => {
    expect(await runOnce({ api, key: officeKey, folder: runnerFolder, toolsFile, graceMs: 100 })).toBe(0)
    expect(existsSync(reportFile), 'the recovery step did not run').toBe(true)
    const said = readFileSync(reportFile, 'utf8').trim().split('\n')
    expect(said[0]).toBe(`--recover ${taskId}`)
    expect(said[1]).toBe(taskId)
    expect(said[2]).toBe(join(runnerFolder, taskId, 'out'))
    const row = db.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(taskId) as { data: string }
    const job = JSON.parse(row.data) as Record<string, any>
    expect(job['state']).toBe('lost')
    expect(String(job['why'])).toContain('The tool\'s own process 2000000000 has ended')
    expect(String(job['why'])).toContain('the made-up folder was checked and removed')
  })

  it('12: a recovery step that ignores TERM is ended at its limit, and the runner still answers', async () => {
    // A second tool whose recovery step traps TERM and sleeps long past its limit.
    const program = join(scratch, 'bin', 'a-made-up-stubborn-recoverer')
    writeFileSync(program, ['#!/bin/sh', 'trap "" TERM', 'sleep 30', 'echo "the stubborn step ended by itself"', ''].join('\n'), { mode: 0o755 })
    chmodSync(program, 0o755)
    const noop = join(scratch, 'bin', 'a-made-up-noop')
    writeFileSync(noop, '#!/bin/sh\nexit 0\n', { mode: 0o755 })
    chmodSync(noop, 0o755)
    const { theSha256Of } = await import('../src/config/host-tools.mjs')
    const work = join(scratch, 'stubborn-work')
    mkdirSync(work, { recursive: true })
    const declaration = {
      name: 'the-made-up-stubborn-recoverer',
      what: 'a stand-in whose recovery step ignores TERM, for this test only',
      program: { path: noop, sha256: theSha256Of(noop) },
      argv: [],
      arguments: {},
      folder: work,
      timeLimitSeconds: 20,
      outputs: [],
      logLines: 20,
      mayAsk: { agents: [askerId] },
      recovery: { program: { path: program, sha256: theSha256Of(program) }, argv: ['--recover', '{job}'] },
    }
    const registered = await send('POST', '/api/host-tools', secretary, { declaration, decision })
    expect(registered.status, registered.said.slice(0, 500)).toBe(201)

    const asked = await send('POST', '/api/host-jobs', {
      'x-mole-office-workspace': WORKSPACE, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': ASKER,
      'x-mole-office-session': runId, 'x-mole-office-key': runKey,
    }, { tool: 'the-made-up-stubborn-recoverer', arguments: {} })
    expect(asked.status, asked.said.slice(0, 400)).toBe(201)
    const stubborn = String(asked.body['job'].id)
    const taken = await send('POST', '/api/host-jobs/take', { 'x-mole-office-workspace': WORKSPACE, 'x-mole-office-key': officeKey }, { holding: 'nothing' })
    expect(taken.status, taken.said.slice(0, 300)).toBe(200)
    writeFileSync(join(runnerFolder, 'taken.json'), JSON.stringify({ id: stubborn, workspaceId: WORKSPACE, tool: 'the-made-up-stubborn-recoverer', groupId: 2_000_000_000, groupStartedAt: '2026-01-01T00:00:00.000Z' }))
    const started = Date.now()
    expect(await runOnce({ api, key: officeKey, folder: runnerFolder, toolsFile, graceMs: 100, recoveryMs: 300 })).toBe(0)
    expect(Date.now() - started, 'the runner waited for ever for a step that ignores TERM').toBeLessThan(15_000)
    const row = db.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(stubborn) as { data: string }
    const job = JSON.parse(row.data) as Record<string, any>
    expect(job['state']).toBe('lost')
    expect(String(job['why'])).toContain('stopped at its 300 ms limit')
  })

  it('13: a lost job with no process group written down does not run its recovery step', async () => {
    rmSync(reportFile, { force: true })
    const asked = await send('POST', '/api/host-jobs', {
      'x-mole-office-workspace': WORKSPACE, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': ASKER,
      'x-mole-office-session': runId, 'x-mole-office-key': runKey,
    }, { tool: 'the-made-up-recoverer', arguments: {} })
    expect(asked.status, asked.said.slice(0, 400)).toBe(201)
    const id = String(asked.body['job'].id)
    const taken = await send('POST', '/api/host-jobs/take', { 'x-mole-office-workspace': WORKSPACE, 'x-mole-office-key': officeKey }, { holding: 'nothing' })
    expect(taken.status, taken.said.slice(0, 300)).toBe(200)
    // NO GROUP WAS WRITTEN DOWN, so nothing was stopped, and the step must not read what a process of the job may use.
    writeFileSync(join(runnerFolder, 'taken.json'), JSON.stringify({ id, workspaceId: WORKSPACE, tool: 'the-made-up-recoverer' }))
    expect(await runOnce({ api, key: officeKey, folder: runnerFolder, toolsFile, graceMs: 100 })).toBe(0)
    expect(existsSync(reportFile), 'the recovery step ran without a process group').toBe(false)
    const row = db.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(id) as { data: string }
    const job = JSON.parse(row.data) as Record<string, any>
    expect(job['state']).toBe('lost')
    expect(String(job['why'])).toContain('wrote down no process group')
    expect(String(job['why'])).toContain('Its recovery did not run: the runner wrote down no process group')
  })

  it('14: it does not run recovery while the job\'s group still has a member after KILL', async () => {    const program = join(scratch, 'bin', 'a-made-up-sleeper')
    writeFileSync(program, '#!/bin/sh\nsleep 30\n', { mode: 0o755 })
    chmodSync(program, 0o755)
    const report = join(scratch, 'the-live-group-recovery-report')
    rmSync(report, { force: true })
    const recovery = join(scratch, 'bin', 'a-made-up-live-group-recoverer')
    writeFileSync(recovery, ['#!/bin/sh', `echo "$@" > '${report}'`, 'echo "the live group was checked"', ''].join('\n'), { mode: 0o755 })
    chmodSync(recovery, 0o755)
    const { theSha256Of } = await import('../src/config/host-tools.mjs')
    const work = join(scratch, 'live-group-work')
    mkdirSync(work, { recursive: true })
    const declaration = {
      name: 'the-made-up-live-group',
      what: 'a stand-in that runs long enough to be stopped while its group lives',
      program: { path: program, sha256: theSha256Of(program) },
      argv: [],
      arguments: {},
      folder: work,
      timeLimitSeconds: 20,
      outputs: [],
      logLines: 20,
      mayAsk: { agents: [askerId] },
      recovery: { program: { path: recovery, sha256: theSha256Of(recovery) }, argv: ['--recover', '{job}'] },
    }
    const registered = await send('POST', '/api/host-tools', secretary, { declaration, decision })
    expect(registered.status, registered.said.slice(0, 500)).toBe(201)
    const asked = await send('POST', '/api/host-jobs', {
      'x-mole-office-workspace': WORKSPACE, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': ASKER,
      'x-mole-office-session': runId, 'x-mole-office-key': runKey,
    }, { tool: 'the-made-up-live-group', arguments: {} })
    expect(asked.status, asked.said.slice(0, 400)).toBe(201)
    const id = String(asked.body['job'].id)
    // THE RUNNER TAKES THIS JOB ITSELF, so it writes the group down as it starts it and the test can stop it after.
    // THE GROUP IS SAID TO STILL HAVE A MEMBER, so the answer must say the step did not run. KILL is sent for real;
    // only the question "is the group gone" is answered no, so this branch is reached without a process ignoring KILL.
    const realKill = process.kill.bind(process)
    const kill = vi.spyOn(process, 'kill').mockImplementation(((pid: number, signal?: string | number) => {
      if (pid < 0 && signal === 0) return true
      return realKill(pid, signal)
    }) as typeof process.kill)
    const stopping = new AbortController()
    const running = runOnce({ api, key: officeKey, folder: runnerFolder, toolsFile, graceMs: 100, stop: stopping.signal })
    try {
      const until = Date.now() + 10_000
      for (;;) {
        try {
          const held = JSON.parse(readFileSync(join(runnerFolder, 'taken.json'), 'utf8')) as { groupId?: number }
          if (held.groupId !== undefined) break
        } catch {
          // The runner has not written its group down yet.
        }
        if (Date.now() > until) throw new Error('the runner never wrote down the tool\'s process group')
        await new Promise((done) => setTimeout(done, 20))
      }
      stopping.abort()
      expect(await running).toBe(0)
    } finally {
      kill.mockRestore()
    }
    expect(existsSync(report), 'the recovery step ran while the group still had a member').toBe(false)
    const row = db.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(id) as { data: string }
    const job = JSON.parse(row.data) as Record<string, any>
    expect(job['state']).toBe('lost')
    expect(String(job['why'])).toContain('still had a member')
    expect(String(job['why'])).toContain('Its recovery did not run: the job\'s group still had a member')
  }, 20_000)

  it('15: a group whose first process has ended but still has a child is not shown stopped, so recovery does not run', async () => {
    // A detached shell makes its own process group, starts a child in that group and exits. The leader has ended,
    // and the child keeps the group's number, so the group has a member.
    const leader = spawn('/bin/sh', ['-c', 'sleep 30 &'], { detached: true, stdio: 'ignore' })
    const groupId = Number(leader.pid)
    await new Promise<void>((done) => leader.once('exit', () => done()))
    let theGroupHasAMember = false
    for (let tries = 0; tries < 50 && !theGroupHasAMember; tries++) {
      try {
        process.kill(-groupId, 0)
        theGroupHasAMember = true
      } catch {
        await new Promise((done) => setTimeout(done, 20))
      }
    }
    expect(theGroupHasAMember, 'the child is still in the group after its leader ended').toBe(true)
    try {
      rmSync(reportFile, { force: true })
      const asked = await send('POST', '/api/host-jobs', {
        'x-mole-office-workspace': WORKSPACE, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': ASKER,
        'x-mole-office-session': runId, 'x-mole-office-key': runKey,
      }, { tool: 'the-made-up-recoverer', arguments: {} })
      expect(asked.status, asked.said.slice(0, 400)).toBe(201)
      const id = String(asked.body['job'].id)
      const taken = await send('POST', '/api/host-jobs/take', { 'x-mole-office-workspace': WORKSPACE, 'x-mole-office-key': officeKey }, { holding: 'nothing' })
      expect(taken.status, taken.said.slice(0, 300)).toBe(200)
      writeFileSync(join(runnerFolder, 'taken.json'), JSON.stringify({ id, workspaceId: WORKSPACE, tool: 'the-made-up-recoverer', groupId, groupStartedAt: '2026-01-01T00:00:00.000Z' }))
      expect(await runOnce({ api, key: officeKey, folder: runnerFolder, toolsFile, graceMs: 100 })).toBe(0)
      expect(existsSync(reportFile), 'the recovery step ran while a child was still in the group').toBe(false)
      const row = db.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(id) as { data: string }
      const job = JSON.parse(row.data) as Record<string, any>
      expect(job['state']).toBe('lost')
      expect(String(job['why'])).toContain('its group still had a member')
      expect(String(job['why'])).toContain('Its recovery did not run: the job\'s process group was not shown to have stopped')
    } finally {
      try {
        process.kill(-groupId, 'SIGKILL')
      } catch {
        // The child ended by itself.
      }
    }
  }, 20_000)

  it('16: a job that reaches its time limit runs its recovery step, so the next hand-over of its backup is not refused', async () => {
    // A made-up tool that outlives its own one-second limit, with a recovery step of its own. The runner stops it at
    // the limit; the recovery must then run, because a hand-over killed at its two-hour limit leaves the same staged
    // folder and journal behind as one asked to stop.
    const limitReport = join(scratch, 'the-time-limit-recovery-report')
    rmSync(limitReport, { force: true })
    const program = join(scratch, 'bin', 'a-made-up-time-limit-tool')
    writeFileSync(program, '#!/bin/sh\nsleep 30\n', { mode: 0o755 })
    chmodSync(program, 0o755)
    const recovery = join(scratch, 'bin', 'a-made-up-time-limit-recoverer')
    writeFileSync(recovery, ['#!/bin/sh', `{ echo "$@"; echo "$HOST_JOB_ID"; } > '${limitReport}'`, 'echo "the time-limit folder was checked and removed"', ''].join('\n'), { mode: 0o755 })
    chmodSync(recovery, 0o755)
    const { theSha256Of } = await import('../src/config/host-tools.mjs')
    const work = join(scratch, 'time-limit-work')
    mkdirSync(work, { recursive: true })
    const declaration = {
      name: 'the-made-up-time-limit-tool',
      what: 'a stand-in that reaches its own time limit, for this test only',
      program: { path: program, sha256: theSha256Of(program) },
      argv: [],
      arguments: {},
      folder: work,
      timeLimitSeconds: 1,
      outputs: [],
      logLines: 20,
      mayAsk: { agents: [askerId] },
      recovery: { program: { path: recovery, sha256: theSha256Of(recovery) }, argv: ['--recover', '{job}'] },
    }
    const registered = await send('POST', '/api/host-tools', secretary, { declaration, decision })
    expect(registered.status, registered.said.slice(0, 500)).toBe(201)
    const asked = await send('POST', '/api/host-jobs', {
      'x-mole-office-workspace': WORKSPACE, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': ASKER,
      'x-mole-office-session': runId, 'x-mole-office-key': runKey,
    }, { tool: 'the-made-up-time-limit-tool', arguments: {} })
    expect(asked.status, asked.said.slice(0, 400)).toBe(201)
    const id = String(asked.body['job'].id)
    // NO STOP IS ASKED FOR: only the job's own one-second limit ends it.
    expect(await runOnce({ api, key: officeKey, folder: runnerFolder, toolsFile, graceMs: 100, recoveryMs: 5_000 })).toBe(0)
    expect(existsSync(limitReport), 'the recovery step did not run after the time limit').toBe(true)
    expect(readFileSync(limitReport, 'utf8').trim().split('\n')).toEqual([`--recover ${id}`, id])
    const row = db.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(id) as { data: string }
    const job = JSON.parse(row.data) as Record<string, any>
    expect(job['state']).toBe('ended at its time limit')
    expect(String(job['why'])).toContain('It was ended at its time limit of 1 seconds')
    expect(String(job['why'])).toContain('the time-limit folder was checked and removed')
  }, 20_000)
})

describe('where a hand-over goes', () => {
  it('17: a lab server missing from the environment and the settings file refuses, also when the environment is empty', async () => {
    const settingsFile = aMadeUpSettingsFile('')
    process.env['HAND_OVER_LAB_ROOT'] = '/made-up/lab'

    delete process.env['HAND_OVER_LAB_SERVER']
    const unset = await aRefusedHandOver({ caseName: 'server-unset', settingsFile })
    expect(unset).toContain('HAND_OVER_LAB_SERVER')

    process.env['HAND_OVER_LAB_SERVER'] = ''
    const empty = await aRefusedHandOver({ caseName: 'server-empty', settingsFile })
    expect(empty).toContain('HAND_OVER_LAB_SERVER')
  })

  it('18: a lab folder missing from the environment and the settings file refuses, also when the environment is empty', async () => {
    const settingsFile = aMadeUpSettingsFile('')
    process.env['HAND_OVER_LAB_SERVER'] = 'made-up-lab-server'

    delete process.env['HAND_OVER_LAB_ROOT']
    const unset = await aRefusedHandOver({ caseName: 'folder-unset', settingsFile })
    expect(unset).toContain('HAND_OVER_LAB_ROOT')

    process.env['HAND_OVER_LAB_ROOT'] = ''
    const empty = await aRefusedHandOver({ caseName: 'folder-empty', settingsFile })
    expect(empty).toContain('HAND_OVER_LAB_ROOT')
  })

  it('19: both missing names both settings and transfers nothing', async () => {
    const settingsFile = aMadeUpSettingsFile('')
    delete process.env['HAND_OVER_LAB_SERVER']
    delete process.env['HAND_OVER_LAB_ROOT']
    const said = await aRefusedHandOver({ caseName: 'both-missing', settingsFile })
    expect(said).toContain('HAND_OVER_LAB_SERVER')
    expect(said).toContain('HAND_OVER_LAB_ROOT')
  })

  it('20: the settings file gives the server and folder when the environment values are empty', async () => {
    const settingsFile = aMadeUpSettingsFile('HAND_OVER_LAB_SERVER=made-up-file-lab-server\nHAND_OVER_LAB_ROOT=/made-up/file-lab\n')
    process.env['HAND_OVER_LAB_SERVER'] = ''
    process.env['HAND_OVER_LAB_ROOT'] = ''
    const { data, name } = aDataFolder('server-from-file')
    const { job, out } = aJobFolder('server-from-file')
    const recorded = join(scratch, 'server-from-file-rsync-args')
    rmSync(recorded, { force: true })
    process.env['HAND_OVER_PROGRAM'] = program
    process.env['HAND_OVER_RSYNC'] = rsyncRecords
    process.env['FAKE_RSYNC_ARGS'] = recorded
    const answer = await handItOver({ data, job, out, name, caseName: 'server-from-file', settingsFile })
    expect(answer.ok, JSON.stringify(answer.result)).toBe(true)
    const args = readFileSync(recorded, 'utf8').trim().split('\n')
    expect(args.at(-1)).toBe(
      `made-up-file-lab-server:/made-up/file-lab/${theHandOverServerName(name)}/${String(answer.result['snapshotId'])}/`,
    )
  })

  it('21: both set in the environment reach the rsync stand-in as today', async () => {
    const settingsFile = aMadeUpSettingsFile('HAND_OVER_LAB_SERVER=made-up-file-lab-server\nHAND_OVER_LAB_ROOT=/made-up/file-lab\n')
    process.env['HAND_OVER_LAB_SERVER'] = 'made-up-env-lab-server'
    process.env['HAND_OVER_LAB_ROOT'] = '/made-up/env-lab'
    const { data, name } = aDataFolder('server-from-environment')
    const { job, out } = aJobFolder('server-from-environment')
    const recorded = join(scratch, 'server-from-environment-rsync-args')
    rmSync(recorded, { force: true })
    process.env['HAND_OVER_PROGRAM'] = program
    process.env['HAND_OVER_RSYNC'] = rsyncRecords
    process.env['FAKE_RSYNC_ARGS'] = recorded
    const answer = await handItOver({ data, job, out, name, caseName: 'server-from-environment', settingsFile })
    expect(answer.ok, JSON.stringify(answer.result)).toBe(true)
    const args = readFileSync(recorded, 'utf8').trim().split('\n')
    expect(args.at(-1)).toBe(
      `made-up-env-lab-server:/made-up/env-lab/${theHandOverServerName(name)}/${String(answer.result['snapshotId'])}/`,
    )
  })

  it('22: the lab server\'s program missing from the environment and the settings file refuses, also when the environment is empty', async () => {
    const settingsFile = aMadeUpSettingsFile('')
    const unset = await aRefusedHandOver({ caseName: 'program-unset', settingsFile, program: null })
    expect(unset).toContain('HAND_OVER_PROGRAM')
    expect(unset).not.toContain('HAND_OVER_LOCK')
    const empty = await aRefusedHandOver({ caseName: 'program-empty', settingsFile, program: '' })
    expect(empty).toContain('HAND_OVER_PROGRAM')
  })

  it('23: the lock missing from the environment and the settings file refuses, also when the environment is empty', async () => {
    const settingsFile = aMadeUpSettingsFile('')
    const unset = await aRefusedHandOver({ caseName: 'lock-unset', settingsFile, lock: null })
    expect(unset).toContain('HAND_OVER_LOCK')
    expect(unset).not.toContain('HAND_OVER_PROGRAM')
    const empty = await aRefusedHandOver({ caseName: 'lock-empty', settingsFile, lock: '' })
    expect(empty).toContain('HAND_OVER_LOCK')
  })

  it('24: every missing setting is named at once, and nothing is staged, locked or run', async () => {
    const settingsFile = aMadeUpSettingsFile('')
    const both = await aRefusedHandOver({ caseName: 'program-and-lock-missing', settingsFile, program: null, lock: null })
    expect(both).toContain('HAND_OVER_PROGRAM')
    expect(both).toContain('HAND_OVER_LOCK')
    delete process.env['HAND_OVER_LAB_SERVER']
    delete process.env['HAND_OVER_LAB_ROOT']
    const all = await aRefusedHandOver({ caseName: 'all-four-missing', settingsFile, program: null, lock: null })
    for (const setting of ['HAND_OVER_LAB_SERVER', 'HAND_OVER_LAB_ROOT', 'HAND_OVER_PROGRAM', 'HAND_OVER_LOCK']) expect(all).toContain(setting)
  })

  it('25: a lock path that is not absolute refuses before anything is staged, locked or run', async () => {
    const settingsFile = aMadeUpSettingsFile('')
    // RELATIVE TO WHERE THE TEST RUNS, AND POINTING AT THIS CASE'S OWN LOCK, so a tool that took it anyway takes
    // the lock the helper watches and never writes into the checkout.
    const said = await aRefusedHandOver({ caseName: 'lock-relative', settingsFile, lock: relative(process.cwd(), theLockOf('lock-relative')) })
    expect(said).toContain('HAND_OVER_LOCK')
    expect(said).toMatch(/absolute/)
    expect(said).not.toContain('HAND_OVER_PROGRAM')
  })

  it('26: the settings file gives the program and the lock when the environment values are empty, and that lock is the one held', async () => {
    const lock = theLockOf('program-from-file')
    const settingsFile = aMadeUpSettingsFile(`HAND_OVER_PROGRAM=${programCopiesTheLock}\nHAND_OVER_LOCK=${lock}\n`)
    process.env['HAND_OVER_PROGRAM'] = ''
    process.env['HAND_OVER_LOCK'] = ''
    const copied = join(scratch, 'program-from-file-lock-copy')
    rmSync(copied, { force: true })
    process.env['FAKE_EVENT'] = join(scratch, 'program-from-file-events')
    process.env['FAKE_LOCK_COPY'] = copied
    const { data, name } = aDataFolder('program-from-file')
    const { job, out } = aJobFolder('program-from-file')
    const answer = await handItOver({ data, job, out, name, caseName: 'program-from-file', settingsFile })
    expect(answer.ok, JSON.stringify(answer.result)).toBe(true)
    expect(readFileSync(copied, 'utf8').trim().split('\n')[2]).toBe(`snapshot of ${name} for job job-program-from-file`)
    expect(readFileSync(lock, 'utf8').trim().split('\n')[2]).toMatch(/^checksum proof of /)
  })
})
