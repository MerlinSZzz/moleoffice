// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A BACKUP IS NEVER AT ITS OWN NAME WHILE IT STILL HOLDS KEY HASHES.
 *
 * ---------------------------------------------------------------------------------------
 * THE DEFECT THIS MEASURES
 * ---------------------------------------------------------------------------------------
 *
 * `npm run db:backup` copies the whole database (with `VACUUM INTO` since 21 October 2026; with SQLite's
 * online backup before), `held_keys` included, and only then empties that table and searches its bytes. Until 26 September 2026
 * the copy was written at the backup's own name. A command killed between the write and the end of
 * the rewrite left there a file holding every key hash of the office, looking like a backup. Now the
 * copy is made in a hidden folder beside the name and renamed to the name once every check passed.
 *
 * ---------------------------------------------------------------------------------------
 * HOW THE KILL IS MADE, AND WHY THIS WAY
 * ---------------------------------------------------------------------------------------
 *
 * The command runs as a child process with one extra `--import`: a module this test writes into its
 * own temporary folder. It wraps better-sqlite3's `Database.prototype.prepare`, and when the command
 * prepares the emptying of `held_keys` on the copy in its folder of work in progress, it sends the
 * process SIGKILL before that statement runs. That is the point between the write and the emptying,
 * whichever way the copy was written. SIGKILL runs no `finally` and no handler, so it is the same as
 * the command being killed from outside.
 *
 * It is done this way, and not with a variable the command reads, so the product carries no code
 * that exists only for a test. It is not done by stopping the child at a line it prints either: the
 * emptying starts a few milliseconds after the write, and a signal sent from here would land before
 * or after it by chance.
 *
 * EVERY KEY HERE IS A MADE-UP VALUE. The assertions name counts and paths, never a hash.
 */

import Database from 'better-sqlite3'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL, URL } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { hashesFoundInTheBytesOf } from '../src/config/what-a-copy-must-not-carry.mjs'
import { migrateInPlace } from '../src/server/db/migrate.ts'
import { filesFolderOf, leftOutListOf } from '../src/shared/what-is-kept.ts'
import { aTestDatabaseFolder } from './a-test-folder.ts'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const BACKUP_SCRIPT = join(REPO, 'scripts/backup.ts')
const PRUNE_SCRIPT = join(REPO, 'scripts/prune-backups.ts')
const MIGRATIONS = join(REPO, 'drizzle')

/** The start of the name of the folder the command makes the copy in. */
const BEING_MADE = '.being-made-'

let dir: string

beforeEach(() => {
  dir = aTestDatabaseFolder('killed-backup')
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

/** Run the real command, with any extra node options first, and hand back what it produced. */
function run(
  script: string,
  args: readonly string[],
  env: Record<string, string>,
  nodeOptions: readonly string[] = [],
): { status: number | null; signal: NodeJS.Signals | null; stdout: string; stderr: string } {
  const child = spawnSync(process.execPath, ['--import', 'tsx', ...nodeOptions, script, ...args], {
    cwd: REPO,
    encoding: 'utf8',
    env: { ...process.env, ...env },
    timeout: 60_000,
  })
  return { status: child.status, signal: child.signal, stdout: child.stdout ?? '', stderr: child.stderr ?? '' }
}

/**
 * A migrated Mole Office database holding two made-up key hashes, closed. Returns its path and the
 * hashes, which stay in memory.
 */
function aSourceWithKeyHashes(): { file: string; hashes: string[] } {
  const file = join(dir, 'panelx.db')
  const db = new Database(file)
  db.pragma('journal_mode = WAL')
  migrateInPlace(db, MIGRATIONS)
  const hashes = ['a made-up key that never existed', 'another made-up key'].map((key) =>
    createHash('sha256').update(key).digest('hex'),
  )
  const insert = db.prepare(
    "INSERT INTO held_keys (id, whose_kind, whose_id, key_hash, made_at) VALUES (?, 'agent', 'builder-pb', ?, '2026-09-26 10:00:00')",
  )
  hashes.forEach((hash, i) => insert.run(`hk${String(i)}`, hash))
  db.close()
  return { file, hashes }
}

/** One report file beside the database, so an ordinary backup has files to carry. */
function aReportFile(): void {
  mkdirSync(join(dir, 'report-files'), { recursive: true })
  writeFileSync(join(dir, 'report-files', 'a1.ts'), 'export const answer = 42\n')
}

/** The module that kills the command once the copy is written, as it starts emptying `held_keys` on it. */
function theKillAfterTheWrite(): string {
  const at = join(dir, 'kill-after-the-write.mjs')
  writeFileSync(
    at,
    `import { createRequire } from 'node:module'\n` +
      `const Database = createRequire(${JSON.stringify(join(REPO, 'package.json'))})('better-sqlite3')\n` +
      `const prepare = Database.prototype.prepare\n` +
      `Database.prototype.prepare = function (sql) {\n` +
      `  if (typeof sql === 'string' && sql.startsWith('DELETE FROM "held_keys"') && this.name.includes(${JSON.stringify(BEING_MADE)})) process.kill(process.pid, 'SIGKILL')\n` +
      `  return prepare.call(this, sql)\n` +
      `}\n`,
  )
  return pathToFileURL(at).href
}

describe('a backup killed between the write and the emptying', () => {
  it('leaves nothing at the backup’s name, and no key hash of the source there', () => {
    const { file, hashes } = aSourceWithKeyHashes()
    aReportFile()
    const backups = join(dir, 'backups')
    const target = join(backups, 'mole-office-20260926-120000.db')

    const killed = run(BACKUP_SCRIPT, ['--to', target], { MOLE_OFFICE_DB: file }, ['--import', theKillAfterTheWrite()])

    // THE KILL HAPPENED, so this is not a run that finished and proves nothing.
    expect(killed.signal, `the command was not killed:\n${killed.stdout}\n${killed.stderr}`).toBe('SIGKILL')

    expect(existsSync(target), 'a killed backup left a file at the backup’s name').toBe(false)
    const atTheName = existsSync(target) ? hashesFoundInTheBytesOf(target, hashes) : 0
    expect(atTheName, 'the file at the backup’s name holds key hashes of the source').toBe(0)
    for (const beside of [`${target}-wal`, `${target}-shm`, filesFolderOf(target), leftOutListOf(target)]) {
      expect(existsSync(beside), `${beside} was left beside a name that holds no database`).toBe(false)
    }

    // WHAT IS LEFT IS THE FOLDER OF WORK IN PROGRESS, and the copy in it was written before the kill:
    // it still holds the key hashes. That is what shows the kill landed between the write and the
    // emptying, and it is the folder the command's help tells a person to delete.
    const left = readdirSync(backups)
    expect(left.length, `the backups folder holds ${left.join(', ')}`).toBe(1)
    const work = left[0] as string
    expect(work.startsWith(`.${'mole-office-20260926-120000.db'}${BEING_MADE}`), work).toBe(true)
    expect(hashesFoundInTheBytesOf(join(backups, work, 'mole-office-20260926-120000.db'), hashes)).toBe(hashes.length)

    // AND THE PRUNE DOES NOT TAKE THAT FOLDER FOR A BACKUP. It counts only files that start with
    // SQLite's header, directly in the folder.
    const prune = run(PRUNE_SCRIPT, ['--directory', backups, '--keep', '1', '--say-only'], { MOLE_OFFICE_DB: file })
    expect(prune.status, prune.stderr).toBe(0)
    expect(prune.stdout).not.toContain('would delete')
    expect(prune.stdout).toContain(`left ${join(backups, work)}`)
    expect(prune.stdout).toContain('it is not an ordinary file, so the tool leaves it alone')
  })
})

describe('a backup that runs to the end', () => {
  it('is at its own name with its files folder beside it, and nothing else is left in the folder', () => {
    const { file, hashes } = aSourceWithKeyHashes()
    aReportFile()
    const backups = join(dir, 'backups')
    const target = join(backups, 'mole-office-20260926-120001.db')

    const done = run(BACKUP_SCRIPT, ['--to', target], { MOLE_OFFICE_DB: file })

    expect(done.status, done.stderr).toBe(0)
    expect(readdirSync(backups).sort()).toEqual(['mole-office-20260926-120001.db', 'mole-office-20260926-120001.files'])
    expect(existsSync(join(filesFolderOf(target), 'report-files', 'a1.ts')), 'the report file is not in the backup').toBe(true)
    expect(hashesFoundInTheBytesOf(target, hashes), 'the backup holds key hashes of the source').toBe(0)
    // Every path the command prints is the backup's own name, never the folder it was made in.
    expect(done.stdout).toContain(`-> ${target}`)
    expect(done.stdout).toContain(`copied to ${filesFolderOf(target)}`)
    expect(done.stdout).not.toContain(BEING_MADE)
  })
})

describe('a backup that fails', () => {
  it('when the copy cannot be emptied, leaves nothing in the folder: no backup and no folder of work', () => {
    const { file } = aSourceWithKeyHashes()
    const db = new Database(file)
    // A TRIGGER MAKES THE EMPTYING FAIL ON THE COPY, because it is copied with the schema.
    db.exec(
      'CREATE TRIGGER no_deleting_keys BEFORE DELETE ON held_keys ' +
        "BEGIN SELECT RAISE(ABORT, 'the test forbids emptying this copy'); END",
    )
    expect(() => db.prepare('DELETE FROM held_keys').run()).toThrow()
    db.close()
    const backups = join(dir, 'backups')
    const target = join(backups, 'by-backup.db')

    const failed = run(BACKUP_SCRIPT, ['--to', target], { MOLE_OFFICE_DB: file })

    expect(failed.status, failed.stdout).toBe(1)
    expect(failed.stderr).toContain('could NOT be emptied of key hashes')
    expect(failed.stderr).toContain(`Nothing was written to ${target}.`)
    expect(readdirSync(backups), 'a failed backup left something in the backups folder').toEqual([])
  })

  it('when the files cannot be copied, leaves no files folder and no database copy', () => {
    const { file } = aSourceWithKeyHashes()
    aReportFile()
    // A LINK UNDER report-files IS NOT A FILE THE BACKUP KNOWS HOW TO COPY, so the files copy fails
    // after the database copy was made and verified.
    symlinkSync(join(dir, 'panelx.db'), join(dir, 'report-files', 'a-link'))
    const backups = join(dir, 'backups')
    const target = join(backups, 'by-backup.db')

    const failed = run(BACKUP_SCRIPT, ['--to', target], { MOLE_OFFICE_DB: file })

    expect(failed.status, failed.stdout).toBe(1)
    expect(failed.stderr).toContain('could NOT be')
    expect(failed.stderr).toContain(`Nothing was written to ${target}.`)
    expect(readdirSync(backups), 'a failed backup left something in the backups folder').toEqual([])
  })
})
