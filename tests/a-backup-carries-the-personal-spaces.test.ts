// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
/**
 * EVERY BACKUP CARRIES THE PERMANENT RESIDENTS' PERSONAL SPACES, OUTSIDE THE 10 GB LINE ON NEW BYTES, OR FAILS.
 *
 * A resident's space is kept in the office and backed up with the database. Answer 2 of the
 * proposal GsGFiDygATd5 was agreed in another decision: `personal-spaces/` is always carried, the line of
 * decision YBUxSiGdDrB_, under a third decision, does not count it, and a backup that cannot carry it fails,
 * as a failed files copy already does.
 * The rule is `carryTheFiles` in src/server/lib/backup.ts.
 *
 * WHAT IS PROVED HERE (every name and value is made up):
 *   1. the command copies a space byte for byte into the backup's files folder, beside the other files;
 *   2. over the line, the other three folders are listed as left out and the spaces are copied all the same, and their
 *      bytes are not counted against the line;
 *   3. a space the backup cannot copy fails the whole backup: exit 1, and no database copy at the backup's name;
 *   4. the folder's name is the office's own: `personalSpacesDirectory` in src/server/lib/residents.ts names the folder
 *      the backup reads.
 *
 * MUTATIONS (each after a green control run, then restored), named in the commit that added this file.
 */

import Database from 'better-sqlite3'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { migrateInPlace } from '../src/server/db/migrate.ts'
import { carryTheFiles } from '../src/server/lib/backup.ts'
import { aTestDatabaseFolder } from './a-test-folder.ts'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const BACKUP_SCRIPT = join(REPO, 'scripts/backup.ts')
const MIGRATIONS = join(REPO, 'drizzle')

let dir: string

beforeEach(() => {
  dir = aTestDatabaseFolder('spaces-backup')
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

function backup(args: readonly string[], file: string): { status: number; stdout: string; stderr: string } {
  const run = spawnSync('npx', ['--no-install', 'tsx', BACKUP_SCRIPT, ...args], {
    cwd: REPO,
    encoding: 'utf8',
    env: { ...process.env, MOLE_OFFICE_DB: file },
    timeout: 60_000,
  })
  return { status: run.status ?? -1, stdout: run.stdout ?? '', stderr: run.stderr ?? '' }
}

/** A migrated database with one record, its write-ahead log folded in. */
function aDatabase(): { file: string; db: Database.Database } {
  const file = join(dir, 'panelx.db')
  const db = new Database(file)
  db.pragma('journal_mode = WAL')
  migrateInPlace(db, MIGRATIONS)
  db.prepare(`INSERT INTO records (owner_id, id, kind, title, created_at, updated_at) VALUES ('${THE_TEST_OFFICES_OWNER.id}', 'r1', 'note', 'a made-up note', '2026-10-01 09:00:00', '2026-10-01 09:00:00')`).run()
  db.pragma('wal_checkpoint(TRUNCATE)')
  return { file, db }
}

/** A space with a memory file and the session-origin file, as the office lays one out. */
function aSpace(agentId: string): { memory: Buffer; origins: Buffer } {
  const space = join(dir, 'personal-spaces', agentId)
  mkdirSync(join(space, 'memory'), { recursive: true })
  const memory = Buffer.from('A made-up memory.\n')
  const origins = Buffer.from('{"sessionRecordId":"made-up"}\n')
  writeFileSync(join(space, 'memory', 'notes.md'), memory)
  writeFileSync(join(space, 'session-origins.jsonl'), origins)
  return { memory, origins }
}

describe('a backup and the personal spaces', () => {
  it('1: the command copies a space byte for byte into the backup’s files folder', () => {
    const { file, db } = aDatabase()
    try {
      const { memory, origins } = aSpace('madeUpAgent1')
      mkdirSync(join(dir, 'report-files'))
      writeFileSync(join(dir, 'report-files', 'a.txt'), 'a')
      const target = join(dir, 'backups', 'one.db')
      const run = backup(['--to', target], file)
      expect(run.status, run.stderr).toBe(0)
      const copied = join(dir, 'backups', 'one.files', 'personal-spaces', 'madeUpAgent1')
      expect(readFileSync(join(copied, 'memory', 'notes.md')).equals(memory)).toBe(true)
      expect(readFileSync(join(copied, 'session-origins.jsonl')).equals(origins)).toBe(true)
      expect(existsSync(join(dir, 'backups', 'one.files', 'report-files', 'a.txt'))).toBe(true)
      expect(run.stdout).toContain('personal-spaces/: 2 files')
    } finally {
      db.close()
    }
  })

  it('2: over the line, the others are listed as left out and the spaces are copied all the same', () => {
    aSpace('madeUpAgent2')
    mkdirSync(join(dir, 'report-files'))
    writeFileSync(join(dir, 'report-files', 'big.log'), 'x'.repeat(20))
    mkdirSync(join(dir, 'backups'))
    const copy = join(dir, 'backups', 'over.db')
    const over = carryTheFiles(dir, copy, 19)
    expect(over.outcome).toBe('left out')
    // THE LINE COUNTS THE OTHER FOLDERS ONLY: 20 bytes, not 20 plus the space.
    expect(over.bytes).toBe(20)
    expect(over.always).toEqual([{ name: 'personal-spaces', present: true, files: 2, bytes: 48 }])
    expect(over.copiedTo).toBe(join(dir, 'backups', 'over.files'))
    expect(existsSync(join(dir, 'backups', 'over.files', 'personal-spaces', 'madeUpAgent2', 'memory', 'notes.md'))).toBe(true)
    expect(existsSync(join(dir, 'backups', 'over.files', 'report-files')), 'a folder over the line was copied').toBe(false)
    const listed = readFileSync(String(over.leftOutList), 'utf8')
    expect(listed).toContain('20\treport-files/big.log')
    expect(listed).not.toContain('memory/notes.md')
  })

  it('3: a space the backup cannot copy fails the whole backup, and nothing is at the backup’s name', () => {
    const { file, db } = aDatabase()
    try {
      aSpace('madeUpAgent3')
      // A LINK IS NOT A FILE THE BACKUP KNOWS HOW TO COPY, and the office never writes one into a space.
      symlinkSync(file, join(dir, 'personal-spaces', 'madeUpAgent3', 'a-link'))
      const target = join(dir, 'backups', 'three.db')
      const run = backup(['--to', target], file)
      expect(run.status, run.stdout).toBe(1)
      expect(run.stderr).toContain('could NOT be')
      expect(existsSync(target), 'a backup without its spaces was left at its name').toBe(false)
      expect(existsSync(join(dir, 'backups', 'three.files'))).toBe(false)
    } finally {
      db.close()
    }
  })

  it('4: the folder the backup reads is the one the office writes the spaces into', async () => {
    const was = process.env.MOLE_OFFICE_DB
    process.env.MOLE_OFFICE_DB = join(dir, 'panelx.db')
    vi.resetModules()
    try {
      const { personalSpacesDirectory } = await import('../src/server/lib/residents.ts')
      const { FOLDERS_A_BACKUP_ALWAYS_CARRIES } = await import('../src/server/lib/backup.ts')
      expect([join(dir, ...FOLDERS_A_BACKUP_ALWAYS_CARRIES)]).toEqual([personalSpacesDirectory()])
      ;(await import('../src/server/db/client.ts')).sqlite.close()
    } finally {
      if (was === undefined) delete process.env.MOLE_OFFICE_DB
      else process.env.MOLE_OFFICE_DB = was
    }
  })
})
