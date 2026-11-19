// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE TOOL THAT KEEPS THE NEWEST BACKUPS AND SAYS WHAT IT DELETED. Criterion U6.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS BEING PROVED
 * ---------------------------------------------------------------------------------------
 *
 * Three copies of the database are enough
 * by default. `scripts/prune-backups.ts` reads that number from the installation row and removes
 * the rest of the copies in the backups folder.
 *
 *   1. ONLY COMPLETE STAMPED BACKUPS ARE REMOVED, newest by the name’s stamp.
 *      NqnE3EGs6FTF carries a decision of the owner’s. An incomplete, unreadable,
 *      linked or undatable copy is named and left, as is any other naming family.
 *   2. A COPY AND ITS COMPANIONS GO TOGETHER. A `-wal` or `-shm` is deleted with its copy or not at
 *      all. A companion whose copy is gone is named and left, with the reason.
 *   3. --say-only PRINTS THE SAME PLAN AND DELETES NOTHING.
 *   4. --keep OVERRIDES THE SETTING AND SAYS SO ON ITS FIRST LINE, and it is the only way to make
 *      the tool run without reading the setting.
 *   5. A SETTING THAT CANNOT BE READ IS EXIT 2 AND NOTHING IS DELETED. Not a default, not a warning
 *      followed by a deletion. This is the invariant that matters most in a tool whose job is
 *      deleting things.
 *   6. THE TOTAL FREED ADDS UP to the sizes of the files it says it deleted.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WOULD MAKE EACH CASE GO RED
 * ---------------------------------------------------------------------------------------
 *
 *   order by modification time                   → case 1
 *   remove an incomplete copy                     → the uncertain-copies case
 *   follow an outside link                        → the outside-link case
 *   keep one fewer than the setting               → case 1 and newest-copy case
 *   delete a companion whose copy stays           → case 2
 *   let --say-only delete                         → case 3
 *   replace the refusal with the default          → case 5
 *   leave the door's ending out of dated names    → the door case
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT RUNS THE REAL COMMAND AS A SUBPROCESS
 * ---------------------------------------------------------------------------------------
 *
 * The subject is a command a person types, and the parts that matter are the exit code, what is on
 * stdout and stderr, and what is left on disk afterwards. `scripts/prune-backups.ts` runs its work
 * at import, so there is no function to call and the test has to be a process, exactly as
 * tests/backup.test.ts does it.
 *
 * EVERY FOLDER HERE IS A TEMPORARY DIRECTORY OF FILES THIS FILE MAKES. Nothing in this file names
 * data/backups, and `MOLE_OFFICE_DB` is set explicitly on every invocation.
 */

import Database from 'better-sqlite3'
import { spawnSync } from 'node:child_process'
import { chmodSync, existsSync, linkSync, lstatSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { filesFolderOf, leftOutListOf } from '../src/shared/what-is-kept.ts'
import { migrateInPlace } from '../src/server/db/migrate.ts'
import { aTestDatabaseFolder } from './a-test-folder.ts'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const PRUNE_SCRIPT = join(REPO, 'scripts/prune-backups.ts')
const MIGRATIONS = join(REPO, 'drizzle')

/** A fixed moment, so "newest" is a fact of the test rather than of the clock. */
const BASE_MS = 1_700_000_000_000
const MINUTE = 60_000

let root: string
let backups: string

beforeEach(() => {
  root = aTestDatabaseFolder('prune')
  backups = join(root, 'backups')
  mkdirSync(backups, { recursive: true })
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

/** Run the real command the way a person does, and hand back everything it produced. */
function prune(
  args: readonly string[],
  databasePath: string,
): { status: number; stdout: string; stderr: string } {
  const run = spawnSync('npx', ['--no-install', 'tsx', PRUNE_SCRIPT, ...args], {
    cwd: REPO,
    encoding: 'utf8',
    env: { ...process.env, MOLE_OFFICE_DB: databasePath },
    timeout: 120_000,
  })
  return { status: run.status ?? -1, stdout: run.stdout ?? '', stderr: run.stderr ?? '' }
}

/**
 * A REAL Mole Office database the tool reads the setting from, with `keep_backups` set to `keep`.
 *
 * `null` leaves the column NULL, which is nobody having chosen and the default in force. `0` is a
 * value the office cannot store, so it is a present-but-unreadable setting.
 */
function aServedDatabase(keep: number | null): string {
  const dataDir = join(root, 'data')
  mkdirSync(dataDir, { recursive: true })
  const file = join(dataDir, 'panelx.db')
  const db = new Database(file)
  migrateInPlace(db, MIGRATIONS)
  if (keep !== null) db.prepare('UPDATE installation SET keep_backups = ? WHERE only_row = 1').run(keep)
  db.close()
  return file
}

/** Give a file a moment of its own, so the ordering is the test's and not the filesystem's. */
function setMtime(file: string, order: number): void {
  const at = new Date(BASE_MS + order * MINUTE)
  utimesSync(file, at, at)
}

/** A real little SQLite database in the backups folder, newest-first by `order`. */
function aCopy(name: string, order: number): string {
  const file = join(backups, name)
  const db = new Database(file)
  db.exec('CREATE TABLE t (x INTEGER)')
  db.close()
  writeFileSync(leftOutListOf(file), 'Synthetic fixture: files left out\n')
  setMtime(file, order)
  return file
}

/** A file that is not a SQLite database, so the tool has to judge it by content and leave it. */
function aJunk(name: string, order: number, content = 'this is not a database'): string {
  const file = join(backups, name)
  writeFileSync(file, content)
  setMtime(file, order)
  return file
}

/** The files the run said it deleted or would delete, with the two verbs made the same. */
function deletionPlan(stdout: string): string[] {
  return stdout
    .split('\n')
    .filter((line) => line.includes(': deleted ') || line.includes(': would delete '))
    .map((line) => line.replace(': would delete ', ': deleted ').replace('bytes would be freed', 'bytes freed'))
    .sort()
}

/** The byte size on each file line. */
function deletedSizes(stdout: string): number[] {
  return stdout
    .split('\n')
    .filter((line) => /: (?:deleted|would delete) /.test(line))
    .map((line) => Number(/\((\d+) bytes in size,/.exec(line)?.[1] ?? NaN))
}

/** The total size of the files the run printed as removed, in bytes. */
function removedBytes(stdout: string): number {
  const found = /prune-backups: (?:removed|would remove) (\d+) bytes of files /.exec(stdout)
  if (found === null) throw new Error(`the run printed no total:\n${stdout}`)
  return Number(found[1])
}

/** The total the run printed as freed, in bytes. */
function freedBytes(stdout: string): number {
  const found = /prune-backups: (?:removed|would remove) \d+ bytes of files .*of which (\d+) bytes/.exec(stdout)
  if (found === null) throw new Error(`the run printed no total:\n${stdout}`)
  return Number(found[1])
}

interface PruneAnswer {
  removed: { name: string; ageMinutes: number; bytes: number; freedBytes: number }[]
  kept: { name: string }[]
  left: { name: string; reason: string }[]
  wouldRemove: { name: string; ageMinutes: number; bytes: number; freedBytes: number }[]
  bytes: number
  freedBytes: number
  refused?: string
}
function jsonOf(stdout: string): PruneAnswer {
  const lines = stdout.split('\n').filter((line) => line.startsWith('{'))
  expect(lines).toHaveLength(1)
  return JSON.parse(lines[0]!) as PruneAnswer
}

describe('only complete stamped backups are pruned, ordered by stamp', () => {
  /** Mutations: order by mtime, or keep one fewer than the setting. Each makes this case red. */
  it('with the setting at two, removes the three oldest by stamp with companions and reports ages and sizes', () => {
    const db = aServedDatabase(2)
    const copies = [1, 2, 3, 4, 5].map((n) => aCopy(`mole-office-20260101-00000${n}.db`, n))
    // A rewrite refreshed the oldest copy. The name still says it is oldest.
    utimesSync(copies[0]!, new Date(), new Date())
    const groups = copies.map((copy) => {
      const folder = filesFolderOf(copy)
      mkdirSync(folder)
      writeFileSync(join(folder, 'synthetic.txt'), 'synthetic files bytes')
      return [copy, folder, leftOutListOf(copy), aJunk(`${copy.split('/').pop()}-wal`, 0), aJunk(`${copy.split('/').pop()}-shm`, 0)]
    })
    const expectedSizes = groups.map((group) => group.reduce((sum, path) => sum + (statSync(path).isDirectory()
      ? statSync(join(path, 'synthetic.txt')).size : statSync(path).size), 0))
    const before = Date.now()
    const run = prune(['--directory', backups, '--json'], db)
    const after = Date.now()
    expect(run.status, run.stderr).toBe(0)
    const answer = jsonOf(run.stdout)
    expect(answer.removed.map((one) => one.name).sort()).toEqual(copies.slice(0, 3).map((path) => path.split('/').pop()).sort())
    expect(answer.kept.map((one) => one.name).sort()).toEqual(copies.slice(3).map((path) => path.split('/').pop()).sort())
    for (const [i, group] of groups.entries()) {
      for (const path of group) expect(existsSync(path), path).toBe(i >= 3)
      if (i < 3) {
        const report = answer.removed.find((one) => one.name === copies[i]!.split('/').pop())!
        const time = new Date(2026, 0, 1, 0, 0, i + 1).getTime()
        expect(report.bytes).toBe(expectedSizes[i])
        expect(report.ageMinutes).toBeGreaterThanOrEqual((before - time) / MINUTE)
        expect(report.ageMinutes).toBeLessThanOrEqual((after - time) / MINUTE)
      }
    }
    expect(run.stdout).toContain("from the person's setting")
  })

  it('leaves a database whose name does not match the backup pattern', () => {
    const db = aServedDatabase(1)
    const oddlyNamed = aCopy('weird-name.bin', 0)
    aCopy('mole-office-20260101-000002.db', 1)
    aCopy('mole-office-20260101-000003.db', 2)
    const run = prune(['--directory', backups, '--json'], db)
    expect(run.status, run.stderr).toBe(0)
    expect(existsSync(oddlyNamed)).toBe(true)
    expect(jsonOf(run.stdout).left).toContainEqual({ name: 'weird-name.bin', reason: 'its name does not match the backup pattern, so the tool leaves it alone' })
  })

  /** Mutation: leave the door's ending out of the names the prune dates, and this case goes red. */
  it('prunes a backup the door took as it prunes the command\'s, by its stamp, and leaves the update\'s however old', () => {
    const db = aServedDatabase(1)
    const update = aCopy('mole-office-20250101-000000-before-the-update.db', 0)
    const door = aCopy('mole-office-20260101-000001-taken-at-the-door.db', 1)
    const command = aCopy('mole-office-20260101-000002.db', 2)
    const run = prune(['--directory', backups, '--json'], db)
    expect(run.status, run.stderr).toBe(0)
    const answer = jsonOf(run.stdout)
    expect(answer.removed.map((one) => one.name)).toEqual(['mole-office-20260101-000001-taken-at-the-door.db'])
    expect(existsSync(door)).toBe(false)
    expect(existsSync(command)).toBe(true)
    expect(existsSync(update)).toBe(true)
    expect(answer.left).toContainEqual({ name: 'mole-office-20250101-000000-before-the-update.db', reason: 'its name does not match the backup pattern, so the tool leaves it alone' })
  })

  it('leaves a file named like a backup that is not a SQLite database', () => {
    const db = aServedDatabase(2)
    aCopy('mole-office-20260101-000001.db', 1)
    aCopy('mole-office-20260101-000002.db', 2)
    aCopy('mole-office-20260101-000003.db', 3)
    // Oldest by name and by moment, so a tool that decided by either would delete it.
    const impostor = aJunk('mole-office-20260101-000000.db', 0)

    const run = prune(['--directory', backups], db)

    expect(run.status, run.stderr).toBe(0)
    expect(existsSync(impostor), 'a file named like a backup but not a database was deleted').toBe(true)
    expect(run.stdout).toContain(`left ${impostor}`)
    expect(run.stdout).toContain('it is not a SQLite database')
  })
})

describe('a copy and its companions go together', () => {
  it('deletes the -wal and -shm of a copy that goes', () => {
    const db = aServedDatabase(2)
    const oldestName = 'mole-office-20260101-000001.db'
    const oldest = aCopy(oldestName, 0)
    const wal = aJunk(`${oldestName}-wal`, 0, 'write-ahead log bytes')
    const shm = aJunk(`${oldestName}-shm`, 0, 'shared memory bytes')
    aCopy('mole-office-20260101-000002.db', 1)
    aCopy('mole-office-20260101-000003.db', 2)

    const run = prune(['--directory', backups], db)

    expect(run.status, run.stderr).toBe(0)
    expect(existsSync(oldest)).toBe(false)
    expect(existsSync(wal), 'the -wal of a deleted copy stayed').toBe(false)
    expect(existsSync(shm), 'the -shm of a deleted copy stayed').toBe(false)
  })

  it('deletes the files folder and the left-out list of a copy that goes, and keeps those of a copy that stays', () => {
    const db = aServedDatabase(2)
    const oldestName = 'mole-office-20260101-000001.db'
    const oldest = aCopy(oldestName, 0)
    // WHAT scripts/backup.ts WRITES BESIDE A COPY: a folder of copied files, or a list of those left out.
    const oldFiles = join(backups, 'mole-office-20260101-000001.files')
    mkdirSync(join(oldFiles, 'report-files'), { recursive: true })
    writeFileSync(join(oldFiles, 'report-files', 'a1.ts'), 'r'.repeat(300))
    const oldList = aJunk('mole-office-20260101-000001.left-out.txt', 0, 'one line per file left out')
    const keptName = 'mole-office-20260101-000002.db'
    const keptCopy = aCopy(keptName, 1)
    const keptFiles = join(backups, 'mole-office-20260101-000002.files')
    mkdirSync(join(keptFiles, 'message-pictures'), { recursive: true })
    writeFileSync(join(keptFiles, 'message-pictures', 'p1.png'), 'p'.repeat(200))
    aCopy('mole-office-20260101-000003.db', 2)
    // A files folder whose copy is not here is not deleted: there is nothing to delete it with.
    const orphan = join(backups, 'gone.files')
    mkdirSync(orphan)

    const run = prune(['--directory', backups], db)

    expect(run.status, run.stderr).toBe(0)
    expect(existsSync(oldest)).toBe(false)
    expect(existsSync(oldFiles), 'the files folder of a deleted copy stayed').toBe(false)
    expect(existsSync(oldList), 'the left-out list of a deleted copy stayed').toBe(false)
    expect(run.stdout).toContain(`deleted ${oldFiles} (300 bytes in size, 300 bytes freed)`)
    expect(existsSync(keptCopy)).toBe(true)
    expect(existsSync(join(keptFiles, 'message-pictures', 'p1.png')), 'the files folder of a kept copy was deleted').toBe(true)
    expect(run.stdout).toContain(`left ${keptFiles}`)
    expect(existsSync(orphan), 'a files folder with no copy was deleted').toBe(true)
    expect(run.stdout).toContain(`left ${orphan}`)
    // THE TOTAL STILL ADDS UP, with the folder's bytes in it.
    expect(freedBytes(run.stdout)).toBe(deletedSizes(run.stdout).reduce((sum, one) => sum + one, 0))
  })

  it('keeps the -wal and -shm of a copy that stays', () => {
    const db = aServedDatabase(2)
    aCopy('mole-office-20260101-000001.db', 0)
    const keptName = 'mole-office-20260101-000002.db'
    const keptCopy = aCopy(keptName, 1)
    const wal = aJunk(`${keptName}-wal`, 1, 'write-ahead log bytes')
    const shm = aJunk(`${keptName}-shm`, 1, 'shared memory bytes')
    aCopy('mole-office-20260101-000003.db', 2)

    const run = prune(['--directory', backups], db)

    expect(run.status, run.stderr).toBe(0)
    expect(existsSync(keptCopy)).toBe(true)
    expect(existsSync(wal), 'the -wal of a copy that stayed was deleted').toBe(true)
    expect(existsSync(shm), 'the -shm of a copy that stayed was deleted').toBe(true)
    expect(run.stdout).toContain(`left ${wal}`)
    expect(run.stdout).toContain('which is kept')
  })

  /** Problem ALuP6FvWOQfD. Mutation: count freed bytes by path size again. */
  it('counts a shared hard-linked file in removed size but frees no bytes while the newer backup keeps it', () => {
    const db = aServedDatabase(1)
    const older = aCopy('mole-office-20260101-000001.db', 0)
    const newer = aCopy('mole-office-20260101-000002.db', 1)
    const oldFolder = filesFolderOf(older)
    const newFolder = filesFolderOf(newer)
    mkdirSync(join(oldFolder, 'report-files'), { recursive: true })
    mkdirSync(join(newFolder, 'report-files'), { recursive: true })
    const shared = join(oldFolder, 'report-files', 'shared.txt')
    const keptShared = join(newFolder, 'report-files', 'shared.txt')
    writeFileSync(shared, 'synthetic shared bytes')
    linkSync(shared, keptShared)
    const sharedBytes = statSync(shared).size
    const exclusiveBytes = statSync(older).size + statSync(leftOutListOf(older)).size
    const size = exclusiveBytes + sharedBytes
    const said = prune(['--directory', backups, '--say-only', '--json'], db)
    expect(said.status, said.stderr).toBe(0)
    expect(jsonOf(said.stdout)).toMatchObject({
      bytes: size, freedBytes: exclusiveBytes, removed: [],
      wouldRemove: [{ name: older.split('/').pop(), bytes: size, freedBytes: exclusiveBytes }],
    })
    expect(existsSync(shared)).toBe(true)

    const run = prune(['--directory', backups, '--json'], db)
    expect(run.status, run.stderr).toBe(0)
    expect(jsonOf(run.stdout)).toMatchObject({
      bytes: size, freedBytes: exclusiveBytes,
      removed: [{ name: older.split('/').pop(), bytes: size, freedBytes: exclusiveBytes }],
      kept: [{ name: newer.split('/').pop() }],
    })
    expect(run.stdout).toContain(`deleted ${oldFolder} (${sharedBytes} bytes in size, 0 bytes freed).`)
    expect(run.stdout).toContain(`prune-backups: removed ${size} bytes of files`)
    expect(run.stdout).toContain(`of which ${exclusiveBytes} bytes`)
    expect(freedBytes(run.stdout)).toBe(exclusiveBytes)
    expect(existsSync(oldFolder)).toBe(false)
    expect(readFileSync(keptShared, 'utf8')).toBe('synthetic shared bytes')
    expect(statSync(keptShared).nlink).toBe(1)
  })

  /** Problem ALuP6FvWOQfD. Mutation: count freed bytes per path again. */
  it('frees each inode once when all its links go within a folder or across two removed backups', () => {
    const db = aServedDatabase(1)
    const older = aCopy('mole-office-20260101-000001.db', 0)
    const middle = aCopy('mole-office-20260101-000002.db', 1)
    aCopy('mole-office-20260101-000003.db', 2)
    const oldFolder = filesFolderOf(older)
    const middleFolder = filesFolderOf(middle)
    mkdirSync(join(oldFolder, 'nested'), { recursive: true })
    mkdirSync(middleFolder)
    const shared = join(oldFolder, 'shared.txt')
    writeFileSync(shared, 'synthetic shared bytes')
    linkSync(shared, join(middleFolder, 'shared.txt'))
    const local = join(oldFolder, 'local.txt')
    writeFileSync(local, 'synthetic local bytes')
    linkSync(local, join(oldFolder, 'nested', 'local-link.txt'))
    const sharedBytes = statSync(shared).size
    const localBytes = statSync(local).size
    const oldExclusive = statSync(older).size + statSync(leftOutListOf(older)).size
    const middleExclusive = statSync(middle).size + statSync(leftOutListOf(middle)).size
    const expected = [
      { name: middle.split('/').pop(), bytes: middleExclusive + sharedBytes, freedBytes: middleExclusive },
      { name: older.split('/').pop(), bytes: oldExclusive + sharedBytes + 2 * localBytes,
        freedBytes: oldExclusive + sharedBytes + localBytes },
    ]
    const size = expected.reduce((sum, one) => sum + one.bytes, 0)
    const freed = expected.reduce((sum, one) => sum + one.freedBytes, 0)
    const said = prune(['--directory', backups, '--say-only', '--json'], db)
    expect(said.status, said.stderr).toBe(0)
    expect(jsonOf(said.stdout)).toMatchObject({ bytes: size, freedBytes: freed, wouldRemove: expected })
    expect(statSync(shared).nlink).toBe(2)
    const run = prune(['--directory', backups, '--json'], db)
    expect(run.status, run.stderr).toBe(0)
    expect(jsonOf(run.stdout)).toMatchObject({ bytes: size, freedBytes: freed, removed: expected })
    expect(existsSync(oldFolder)).toBe(false)
    expect(existsSync(middleFolder)).toBe(false)
    expect(freedBytes(run.stdout)).toBe(freed)
  })
})

describe('what it does not recognise, it names and leaves', () => {
  it('names an orphan -wal, an orphan -shm and a file that is neither, and deletes none', () => {
    const db = aServedDatabase(1)
    const keptCopy = aCopy('mole-office-20260101-000001.db', 0)
    const orphanWal = aJunk('gone.db-wal', 0, 'orphan write-ahead log')
    const orphanShm = aJunk('gone.db-shm', 0, 'orphan shared memory')
    const other = aJunk('notes.txt', 0, 'a note somebody left here')

    const run = prune(['--directory', backups], db)

    expect(run.status, run.stderr).toBe(0)
    expect(existsSync(keptCopy)).toBe(true)
    expect(existsSync(orphanWal), 'an orphan -wal was deleted').toBe(true)
    expect(existsSync(orphanShm), 'an orphan -shm was deleted').toBe(true)
    expect(existsSync(other)).toBe(true)
    expect(run.stdout).toContain(`left ${orphanWal}`)
    expect(run.stdout).toContain(`left ${orphanShm}`)
    expect(run.stdout).toContain('there is nothing to delete it with')
    expect(run.stdout).toContain(`left ${other}`)
    expect(run.stdout).toContain('its name does not match the backup pattern')
  })
})

describe('the plan and the refusal', () => {
  it('--say-only deletes nothing and prints the same plan', () => {
    const db = aServedDatabase(null)
    for (let i = 0; i < 5; i++) aCopy(`mole-office-20260101-00000${String(i + 1)}.db`, i)
    const before = readdirSync(backups).sort()

    const said = prune(['--directory', backups, '--say-only', '--json'], db)

    expect(said.status, said.stderr).toBe(0)
    expect(readdirSync(backups).sort(), 'a --say-only run deleted a file').toEqual(before)
    expect(jsonOf(said.stdout).removed).toEqual([])
    expect(jsonOf(said.stdout).wouldRemove).toHaveLength(2)
    expect(said.stdout).toContain('would delete')
    expect(said.stdout).toContain('--say-only was given')

    const done = prune(['--directory', backups], db)

    expect(done.status, done.stderr).toBe(0)
    expect(deletionPlan(done.stdout), 'the plan and the run disagree').toEqual(deletionPlan(said.stdout))
    expect(done.stdout).toContain('deleted')
    expect(readdirSync(backups).filter((name) => name.endsWith('.db')).length).toBe(3)
  })

  it('--keep overrides the setting and says so on its first line', () => {
    const db = aServedDatabase(null)
    for (let i = 0; i < 5; i++) aCopy(`mole-office-20260101-00000${String(i + 1)}.db`, i)

    const run = prune(['--directory', backups, '--keep', '2', '--json'], db)

    expect(run.status, run.stderr).toBe(0)
    expect(run.stdout.split('\n')[0]).toContain('overrides the setting')
    expect(jsonOf(run.stdout).kept).toHaveLength(2)
    expect(readdirSync(backups).filter((name) => name.endsWith('.db')).length).toBe(2)
  })

  it('when --keep is given the setting is not read at all', () => {
    // keep_backups is 0, which the office cannot store. The override runs anyway, because it is a
    // test-only number and it does not depend on the row.
    const db = aServedDatabase(0)
    for (let i = 0; i < 3; i++) aCopy(`mole-office-20260101-00000${String(i + 1)}.db`, i)

    const run = prune(['--directory', backups, '--keep', '1'], db)

    expect(run.status, run.stderr).toBe(0)
    expect(run.stdout.split('\n')[0]).toContain('overrides the setting')
    expect(readdirSync(backups).filter((name) => name.endsWith('.db')).length).toBe(1)
  })

  it('refuses with exit 2 when the setting cannot be read, and deletes nothing', () => {
    const db = aServedDatabase(0)
    for (let i = 0; i < 3; i++) aCopy(`mole-office-20260101-00000${String(i + 1)}.db`, i)
    const before = readdirSync(backups).sort()

    const run = prune(['--directory', backups], db)

    expect(run.status, 'an unreadable setting was answered with the default').toBe(2)
    expect(readdirSync(backups).sort(), 'a refusal deleted something').toEqual(before)
    expect(run.stderr).toContain('Backups to keep')
    expect(run.stderr).toContain('cannot read')
    expect(run.stdout, 'the plan was printed before the number was known').toBe('')
  })

  /** Problem ALuP6FvWOQfD: the sizes add up to the removed total; freed is the same here only because
   * these copies share no file. */
  it('the total removed adds up to the sizes printed, and with nothing shared all of it is freed', () => {
    const db = aServedDatabase(null)
    for (let i = 0; i < 5; i++) aCopy(`mole-office-20260101-00000${String(i + 1)}.db`, i)

    const run = prune(['--directory', backups], db)

    expect(run.status, run.stderr).toBe(0)
    const sizes = deletedSizes(run.stdout)
    expect(sizes.length, 'nothing was said to be deleted, so the sum proves nothing').toBeGreaterThan(0)
    for (const size of sizes) expect(Number.isNaN(size)).toBe(false)
    expect(removedBytes(run.stdout)).toBe(sizes.reduce((sum, one) => sum + one, 0))
    expect(freedBytes(run.stdout)).toBe(removedBytes(run.stdout))
  })
})

describe('uncertain copies are named and left in place', () => {
  /** Mutation: remove incomplete copies as complete. This case goes red on its missing file. */
  it('leaves incomplete, linked and undatable copies however old, with JSON reasons', () => {
    const db = aServedDatabase(1)
    const incomplete = aCopy('mole-office-20200101-000001.db', 0)
    rmSync(leftOutListOf(incomplete))
    const link = join(backups, 'mole-office-20200101-000003.db')
    symlinkSync(incomplete, link)
    const undatable = aCopy('mole-office-20200230-000004.db', 0)
    aCopy('mole-office-20260101-000001.db', 1)
    const before = readdirSync(backups).sort()
    const run = prune(['--directory', backups, '--json'], db)
    expect(run.status, run.stderr).toBe(0)
    expect(readdirSync(backups).sort()).toEqual(before)
    const answer = jsonOf(run.stdout)
    for (const [path, reason] of [[incomplete, 'incomplete'], [link, 'a link'], [undatable, 'cannot be dated']]) {
      expect(answer.left.find((one) => one.name === path!.split('/').pop())?.reason).toContain(reason)
      expect(run.stdout).toContain(`left ${path}`)
    }
    expect(answer.removed).toEqual([])
  })

  /** Problem ALuP6FvWOQfD: root reads a chmod-0 file, so no unreadable copy can be made for a root
   * runner, and only this case is skipped then; the case above keeps the other copies covered.
   * Mutation: swallow the header's read error, so the copy counts as complete. This case goes red.
   */
  it.skipIf(process.getuid?.() === 0)('leaves an unreadable copy however old, with its JSON reason (skipped as root: root can read chmod-0 files)', () => {
    const db = aServedDatabase(1)
    const unreadable = aCopy('mole-office-20200101-000002.db', 0)
    chmodSync(unreadable, 0)
    aCopy('mole-office-20260101-000001.db', 1)
    const before = readdirSync(backups).sort()
    try {
      const run = prune(['--directory', backups, '--json'], db)
      expect(run.status, run.stderr).toBe(0)
      expect(readdirSync(backups).sort()).toEqual(before)
      const answer = jsonOf(run.stdout)
      expect(answer.left.find((one) => one.name === unreadable.split('/').pop())?.reason).toContain('unreadable')
      expect(run.stdout).toContain(`left ${unreadable}`)
      expect(answer.removed).toEqual([])
    } finally { chmodSync(unreadable, 0o600) }
  })

  /** Mutation: follow a link named like a backup. This case goes red when the link is removed. */
  it('leaves an outside link and its target untouched and names the link', () => {
    const db = aServedDatabase(1)
    const target = join(root, 'outside.db')
    writeFileSync(target, 'SQLite format 3\u0000synthetic outside bytes')
    const name = 'mole-office-20200101-000001.db'
    const link = join(backups, name)
    symlinkSync(target, link)
    writeFileSync(leftOutListOf(link), 'Synthetic fixture: files left out')
    aCopy('mole-office-20260101-000001.db', 1)
    const run = prune(['--directory', backups, '--json'], db)
    expect(run.status, run.stderr).toBe(0)
    expect(readFileSync(target, 'utf8')).toBe('SQLite format 3\u0000synthetic outside bytes')
    expect(lstatSync(link).isSymbolicLink()).toBe(true)
    expect(jsonOf(run.stdout).left).toContainEqual({ name, reason: 'a link; it is never followed or removed' })
  })

  /** Mutation: follow links while inspecting companions. Copies and companion links then disappear. */
  it('leaves top-level and nested companion links and their copies intact', () => {
    const db = aServedDatabase(1)
    const old = aCopy('mole-office-20200101-000001.db', 0)
    const nested = aCopy('mole-office-20200101-000002.db', 0)
    const outside = join(root, 'outside.txt')
    writeFileSync(outside, 'synthetic outside bytes')
    symlinkSync(outside, `${old}-wal`)
    mkdirSync(filesFolderOf(nested))
    const nestedLink = join(filesFolderOf(nested), 'linked.txt')
    symlinkSync(outside, nestedLink)
    aCopy('mole-office-20260101-000001.db', 1)
    const run = prune(['--directory', backups, '--json'], db)
    expect(run.status, run.stderr).toBe(0)
    expect(existsSync(old)).toBe(true)
    expect(existsSync(nested)).toBe(true)
    expect(lstatSync(`${old}-wal`).isSymbolicLink()).toBe(true)
    expect(lstatSync(nestedLink).isSymbolicLink()).toBe(true)
    expect(readFileSync(outside, 'utf8')).toBe('synthetic outside bytes')
    const answer = jsonOf(run.stdout)
    for (const path of [old, nested, `${old}-wal`]) expect(answer.left.find((one) => one.name === path.split('/').pop())?.reason).toContain('a link')
  })

  /** Mutation: keep one fewer than the setting (zero at one). The newest copy must stay. */
  it('always keeps the newest complete copy with keep one, and an invalid setting removes nothing', () => {
    const db = aServedDatabase(1)
    aCopy('mole-office-20260101-000001.db', 0)
    const newest = aCopy('mole-office-20260101-000002.db', 1)
    const run = prune(['--directory', backups, '--json'], db)
    expect(run.status, run.stderr).toBe(0)
    expect(existsSync(newest)).toBe(true)
    expect(jsonOf(run.stdout).kept).toEqual([{ name: 'mole-office-20260101-000002.db' }])
    const connection = new Database(db)
    connection.prepare('UPDATE installation SET keep_backups = 0').run()
    connection.close()
    const refused = prune(['--directory', backups, '--json'], db)
    expect(refused.status).toBe(2)
    expect(existsSync(newest)).toBe(true)
    expect(jsonOf(refused.stdout).refused).toContain('holds a value this office cannot read: 0')
    expect(jsonOf(refused.stdout).removed).toEqual([])
  })
})
