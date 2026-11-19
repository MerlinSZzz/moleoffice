// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A BACKUP CARRIES NO KEY HASH. Criterion B1, B2 — problem `9FnhMntsHc69`.
 *
 * ---------------------------------------------------------------------------------------
 * THE DEFECT THIS MEASURES, WALKED
 * ---------------------------------------------------------------------------------------
 *
 * `npm run db:backup` copies the whole database with SQLite's online backup — `await db.backup(target)`
 * in src/server/lib/backup.ts — and every table comes with it, `held_keys` included. That table holds the
 * SHA-256 of every key the office ever issued: agents' keys, the person's own devices' keys, live ones
 * and revoked ones. A backup carrying them is a file that will be trusted and moved, and restoring it
 * would prove a device the person paired, or already ended, by a copied hash.
 *
 * The schema says the opposite in its own words (`src/server/db/table-name-lists.ts`, the `MEASURED_TABLES`
 * comment): nothing can rebuild those rows and NO BACKUP MAY CARRY THEM, citing the decision that a copy,
 * a backup and an export carry no key. The export path honours it because
 * `held_keys` is not in `AUTHORED_TABLES`. The backup path did not, and the belief that being outside
 * `AUTHORED_TABLES` keeps a table out of every copy was TRUE of export and FALSE of backup.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE MEASURES, EACH BY DRIVING SOMETHING
 * ---------------------------------------------------------------------------------------
 *
 *   · a backup made from a database holding key rows has NONE in the backup file, read from the file;
 *   · the SOURCE is untouched: it still holds every key hash, and a key that worked still works. This
 *     is the test that catches the unrecoverable mistake — its mutation opens the emptying on the
 *     source and turns these cases red;
 *   · a backup that CANNOT be emptied is deleted, sidecars included, the command exits non-zero, and
 *     the sentence says what happened. The failure is really driven with a trigger;
 *   · `--check-only` says, in words, that a backup has no key hash rows and that it read rows and not
 *     bytes — and refuses a raw file that does carry them.
 *
 * EVERY KEY HERE IS A MADE-UP VALUE. No real key is written, printed or asserted anywhere. The
 * assertions name row counts, hashes and file paths, never a key's bytes.
 */

import { THE_TEST_OFFICES_OWNER, THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import type { AddressInfo } from 'node:net'
import type { FastifyInstance } from 'fastify'
import Database from 'better-sqlite3'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { migrateInPlace } from '../src/server/db/migrate.ts'
import { MEASURED_TABLES, NOT_CARRIED_TABLES } from '../src/server/db/schema.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const BACKUP_SCRIPT = join(REPO, 'scripts/backup.ts')
const MIGRATIONS = join(REPO, 'drizzle')

/** Made-up values. Nothing here is, or was ever, a key any office issued. */
const STARTER_KEY = 'made-up-backup-key-of-the-starter-1111'
const SECRETARY_KEY = 'made-up-backup-key-of-the-secretary-2222'

/** Run the real command the way an operator does, and hand back everything it produced. */
function backup(
  args: readonly string[],
  env: Record<string, string> = {},
): { status: number; stdout: string; stderr: string } {
  const run = spawnSync('npx', ['tsx', BACKUP_SCRIPT, ...args], {
    cwd: REPO,
    encoding: 'utf8',
    env: { ...process.env, ...env },
    timeout: 60_000,
  })
  return { status: run.status ?? -1, stdout: run.stdout ?? '', stderr: run.stderr ?? '' }
}

interface HeldRow {
  whose_kind: string
  whose_id: string
  key_hash: string
}

/** Every key hash the office holds, read straight from the table. No key value is ever selected. */
function heldRowsOf(db: Database.Database): HeldRow[] {
  return db
    .prepare('SELECT whose_kind, whose_id, key_hash FROM held_keys ORDER BY key_hash')
    .all() as HeldRow[]
}

/** How many rows one table in a named file holds, read on its own as a restore would read it. */
function rowsIn(file: string, table: string): number {
  const db = new Database(file, { readonly: true, fileMustExist: true })
  try {
    return (db.prepare(`SELECT count(*) AS n FROM "${table}"`).get() as { n: number }).n
  } finally {
    db.close()
  }
}

/** The actor on the newest change of one record, read the way the office reads it. */
function actorOn(t: TestDb, recordId: string): { type: string; id: string } | undefined {
  return t.client.sqlite
    .prepare('SELECT actor_type AS type, actor_id AS id FROM changes WHERE record_id = ? ORDER BY at DESC LIMIT 1')
    .get(recordId) as { type: string; id: string } | undefined
}

async function ask(
  at: string,
  method: 'GET' | 'POST',
  path: string,
  payload: unknown,
  headers: Record<string, string>,
): Promise<{ status: number; error: string; recordId: string }> {
  const res = await fetch(`${at}${path}`, {
    method,
    headers: { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', ...headers },
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
  })
  const body = (await res.json()) as { error?: string; record?: { id?: string } }
  return { status: res.status, error: body.error ?? '', recordId: body.record?.id ?? '' }
}

let source: TestDb
let office: FastifyInstance
let officeAt: string
let sourceBefore: HeldRow[]
let sourceAfter: HeldRow[]
let backupFile: string
let backupRun: { status: number; stdout: string; stderr: string }
let officeAct: { status: number; actor: { type: string; id: string } | undefined }
/** The registry id the office gave `builder-pb`. It is not the handle. */
let builderId: string

beforeAll(async () => {
  source = await freshDb()
  // THE HOLDER OF THE KEY THE WRITE BELOW USES IS A REGISTERED AGENT. The records door refuses a
  // write under an agent id no registry row holds, and the act below is driven under `builder-pb`
  // with that key. Holding a key proves the holder; the registry row is what makes the name one the
  // office has.
  source.api.createRecord({
    workspaceId: 'default',
    kind: 'agent',
    title: 'builder-pb',
    data: { handle: 'builder-pb', state: 'active', runtime: 'claude-code' },
    actor: { type: 'human', id: THE_TEST_OFFICES_OWNER.id },
  })
  builderId = (
    source.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get('builder-pb') as { id: string }
  ).id
  // THE OFFICE'S OWN TABLE, with two made-up agent keys. Only their SHA-256 is ever stored.
  const keys = await import('../src/server/lib/keys.ts')
  keys.holdTheKeyWhoseHashIs('agent', 'builder-pb', keys.keyHash(STARTER_KEY), null)
  keys.holdTheKeyWhoseHashIs('agent', THE_TEST_OFFICES_SECRETARY.handle, keys.keyHash(SECRETARY_KEY), null)

  // THE OFFICE, really listening, so "a key that worked still works" is driven after the backup.
  const built = await apiApp()
  office = built.app
  await office.ready()
  await office.listen({ host: '127.0.0.1', port: 0 })
  officeAt = `http://127.0.0.1:${String((office.server.address() as AddressInfo).port)}`

  // THE STATE THE BACKUP IS TAKEN FROM, read with the server up so the baseline includes anything a
  // start wrote. Then the backup, then the same reading again.
  sourceBefore = heldRowsOf(source.client.sqlite)
  backupFile = join(dirname(source.file), 'the-backup.db')
  backupRun = backup(['--to', backupFile], { MOLE_OFFICE_DB: source.file })
  sourceAfter = heldRowsOf(source.client.sqlite)

  // AND THE KEY STILL WORKS AFTERWARD. Driven after the backup, so the case below is about the state
  // the backup left the office in and not about a time before it.
  const wrote = await ask(
    officeAt,
    'POST',
    '/api/records',
    { kind: 'note', title: 'A note the office attributes to the starter’s key', data: { body: 'x' } },
    { 'x-mole-office-key': STARTER_KEY },
  )
  officeAct = { status: wrote.status, actor: actorOn(source, wrote.recordId) }
})

afterAll(async () => {
  await office?.close()
  source?.close()
})

// ============================================================ 1. the backup has no key hashes

describe('the backup the command writes', () => {
  it('names only tables the schema calls measured, because nothing can rebuild them', () => {
    for (const table of NOT_CARRIED_TABLES) {
      expect([...MEASURED_TABLES], `${table} is a table a copy must not carry and is not measured`).toContain(table)
    }
  })

  it('holds no key hashes at all, while the office it came from held some', () => {
    expect(backupRun.status, backupRun.stderr).toBe(0)
    expect(sourceBefore.length, 'the office held nothing to copy, so this proves nothing').toBeGreaterThan(0)
    for (const table of NOT_CARRIED_TABLES) {
      expect(rowsIn(backupFile, table), `the backup carries rows in ${table}, so a raw restore would prove them`).toBe(0)
    }
  })

  it('says out loud that it carries no key hashes', () => {
    expect(backupRun.stdout).toContain('carries no key hashes')
  })
})

// ============================================================ 2. the source is untouched

describe('the office the backup was taken from', () => {
  it('still holds every key hash it held before the backup, row for row', () => {
    expect(sourceAfter).toEqual(sourceBefore)
    expect(sourceAfter.length).toBe(sourceBefore.length)
  })

  it('still lets the same key work there, attributed to its holder', () => {
    expect(officeAct.status, 'the office stopped accepting a key the backup is about').toBe(201)
    // The office stamps the holder's registry id, not its handle.
    expect(officeAct.actor, 'the key proved its holder in the office').toEqual({ type: 'agent', id: builderId })
  })
})

// ============================================================ 3. the check says what it carries

describe('--check-only answers the question a restore depends on', () => {
  it('says a backup has no key hash rows, in words, and that it read rows and not bytes', () => {
    // --check-only has no source to read the key hashes from, so it cannot search the bytes. It says
    // what it did read; tests/a-copy-leaves-no-key-hash-in-its-bytes.test.ts proves the bytes.
    const run = backup(['--check-only', backupFile], { MOLE_OFFICE_DB: source.file })
    expect(run.status, run.stderr).toBe(0)
    expect(run.stdout).toContain('`' + NOT_CARRIED_TABLES.join(', ') + '` has no rows')
    expect(run.stdout).toContain("This check reads rows and not the file's bytes")
    expect(run.stdout).not.toContain(STARTER_KEY)
  })

  it('refuses a raw file that DOES carry key hashes, and names the table', () => {
    // The source itself is exactly a raw file: it holds the two hashes the backup was emptied of.
    const run = backup(['--check-only', source.file], { MOLE_OFFICE_DB: source.file })
    expect(run.status, 'a file carrying key hashes was called a usable backup').toBe(1)
    expect(run.stderr).toContain('key hash')
    expect(run.stderr).toContain('held_keys')
    expect(run.stderr).toContain('NOT a usable backup')
  })
})

// ============================================================ 4. a copy that cannot be emptied

describe('a copy that cannot be emptied', () => {
  it('is deleted with its sidecars, the command exits non-zero, and the sentence says what happened', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mole-office-backup-unemptiable-'))
    try {
      const file = join(dir, 'panelx.db')
      const db = new Database(file)
      db.pragma('journal_mode = WAL')
      migrateInPlace(db, MIGRATIONS)
      db.prepare(
        'INSERT INTO held_keys (id, whose_kind, whose_id, key_hash, made_at) ' +
          "VALUES ('hk1', 'agent', 'builder-pb', ?, '2026-09-13 10:00:00')",
      ).run(createHash('sha256').update('a made-up key that never existed').digest('hex'))
      // A TRIGGER MAKES THE DELETION IMPOSSIBLE, and it is copied with the schema, so the emptying
      // fails on the COPY. This DRIVES the failure rather than asserting a branch nobody took.
      db.exec(
        'CREATE TRIGGER no_deleting_keys BEFORE DELETE ON held_keys ' +
          "BEGIN SELECT RAISE(ABORT, 'the test forbids emptying this copy'); END",
      )
      // PROVE the trigger is real before leaning on it, so this test cannot quietly become vacuous.
      expect(() => db.prepare('DELETE FROM held_keys').run()).toThrow()
      expect((db.prepare('SELECT count(*) AS n FROM held_keys').get() as { n: number }).n).toBe(1)
      db.close()

      const target = join(dir, 'by-backup.db')
      const run = backup(['--to', target], { MOLE_OFFICE_DB: file })

      expect(run.status, 'a backup that could not be emptied exited zero').toBe(1)
      expect(run.stderr).toContain('could NOT be emptied of key hashes')
      expect(run.stderr).toContain('DELETED')
      expect(existsSync(target), 'an unemptied backup was left where it would be trusted').toBe(false)
      expect(existsSync(`${target}-wal`), 'a write-ahead log was left beside a deleted backup').toBe(false)
      expect(existsSync(`${target}-shm`), 'a shared-memory file was left beside a deleted backup').toBe(false)
      // The office's own database was only read: it still holds its key.
      expect(rowsIn(file, 'held_keys'), 'the failure deleted the office’s own key hash').toBe(1)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
