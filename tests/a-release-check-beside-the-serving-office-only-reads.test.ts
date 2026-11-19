// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE RELEASE CHECK TOLD THAT ANOTHER VERSION SERVES THE DATABASE.
 *
 * tools/stable/upgrade-stable.criteria.md, "A slimmer stable release", part (2): a case-1 release starts the new
 * version's release check on the live database itself, on the scratch port, while the old version serves. This file
 * proves the third start mode, `release-check-live`: a WAL database with its companions and a file whose size and time
 * change is accepted, a write through the check's own connection is refused by SQLite, another inode at the path is
 * still refused, and the mode without that word keeps the closed-database rule.
 *
 * EVERY DATABASE HERE IS MADE UP in a temporary folder outside every git worktree, built the way the existing release
 * check test builds a valid one: migrated, with the complete schema. Nothing opens the owner's database, and no test
 * listens on the office's own port.
 */
import { afterEach, expect, it, vi } from 'vitest'
import Database from 'better-sqlite3'
import { existsSync, readFileSync, realpathSync, renameSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { aTestDatabaseFolder, buildTheFirstOfficeInAHook, freshDb } from './helpers.ts'
import { START_MODES, startModeFrom } from '../src/config/settings.mjs'
import { theUpgradeMarkPath, whyAnUpgradeKeepsTheOfficeClosed, writeTheUpgradeMark } from '../src/config/the-upgrade-mark.mjs'
import { buildReleaseCheckApp } from '../src/server/lib/release-check.ts'

buildTheFirstOfficeInAHook()

afterEach(() => {
  vi.restoreAllMocks()
})

/** A migrated database with the complete schema in a temporary folder, in DELETE journal mode like the closed check. */
async function aValidDatabase(): Promise<string> {
  const source = await freshDb()
  const folder = aTestDatabaseFolder('release-check-live')
  const file = join(folder, 'office.db')
  try {
    await source.client.sqlite.backup(file)
  } finally { source.close() }
  const prepared = new Database(file)
  try {
    prepared.pragma('wal_checkpoint(TRUNCATE)')
    prepared.pragma('journal_mode = DELETE')
  } finally { prepared.close() }
  return file
}

/** That database switched to WAL and closed, so its header says WAL and a writer may keep it open with companions. */
async function aWalDatabase(): Promise<string> {
  const file = await aValidDatabase()
  const prepared = new Database(file)
  try { prepared.pragma('journal_mode = WAL') } finally { prepared.close() }
  return file
}

/** One held-key row, so the writer's own writes are visible and can be compared before and after the check. */
function writeAKey(writer: Database.Database, id: string, keyHash: string): void {
  writer.prepare(
    "INSERT INTO held_keys (id, whose_kind, whose_id, key_hash, made_at, last_used_at) VALUES (?, 'agent', ?, ?, '2026-01-01 00:00:00', NULL)",
  ).run(id, id, keyHash)
}

it('validates a WAL database another connection keeps open, and answers health after its size and time change', async () => {
  const file = await aWalDatabase()
  const writer = new Database(file)
  try {
    writer.pragma('journal_mode = WAL')
    writeAKey(writer, 'written-before-the-check', 'written before the check')
    writer.pragma('wal_checkpoint(TRUNCATE)')
    expect(existsSync(`${file}-wal`), 'the writer left a WAL file the check must accept').toBe(true)
    expect(existsSync(`${file}-shm`), 'the writer left a shared-memory file the check must accept').toBe(true)
    const before = statSync(file)
    const { app } = buildReleaseCheckApp(file, 'release-check-live')
    try {
      await app.listen({ host: '127.0.0.1', port: 0 })
      const health = (await app.inject('/api/health')).json()
      expect(health.ok).toBe(true)
      expect(health.identity).toMatchObject({ database: realpathSync(file), mode: 'release-check-live' })
      expect((await app.inject({ method: 'POST', url: '/api/health', payload: {} })).statusCode).toBe(405)
      // A second writer's write big enough to grow the file, checkpointed into it while the check is still serving.
      await new Promise(done => setTimeout(done, 20))
      writeAKey(writer, 'written-during-the-check', 'x'.repeat(2_000_000))
      writer.pragma('wal_checkpoint(TRUNCATE)')
      const after = statSync(file)
      expect(after.size, 'the writer grew the file during the check').not.toBe(before.size)
      expect(after.mtimeMs, 'the writer changed the file time during the check').not.toBe(before.mtimeMs)
      const again = (await app.inject('/api/health')).json()
      expect(again.ok).toBe(true)
      expect(again.identity.mode).toBe('release-check-live')
      expect((await app.inject('/api/runtime')).json().identity.mode).toBe('release-check-live')
    } finally { await app.close() }
  } finally { writer.close() }
})

it('refuses a write through its own connection with SQLITE_READONLY and leaves the writer’s rows as they were', async () => {
  const file = await aWalDatabase()
  const writer = new Database(file)
  try {
    writer.pragma('journal_mode = WAL')
    writeAKey(writer, 'the-writer-owns-this-row', 'a row the check must not change')
    const { app, sqlite } = buildReleaseCheckApp(file, 'release-check-live')
    try {
      await app.listen({ host: '127.0.0.1', port: 0 })
      expect(sqlite.readonly).toBe(true)
      const before = writer.prepare('SELECT id, key_hash FROM held_keys ORDER BY id').all()
      let refusal: unknown
      try {
        sqlite.exec("INSERT INTO held_keys (id, whose_kind, whose_id, key_hash, made_at, last_used_at) VALUES ('written-through-the-check', 'agent', 'written-through-the-check', 'no', '2026-01-01 00:00:00', NULL)")
      } catch (error) { refusal = error }
      expect(refusal, 'SQLite must refuse a write through a read-only connection').toBeInstanceOf(Error)
      expect((refusal as { code?: string }).code).toBe('SQLITE_READONLY')
      expect(writer.prepare('SELECT id, key_hash FROM held_keys ORDER BY id').all()).toEqual(before)
    } finally { await app.close() }
  } finally { writer.close() }
})

it('refuses another file moved over the path after validation', async () => {
  const file = await aValidDatabase()
  const { app } = buildReleaseCheckApp(file, 'release-check-live')
  try {
    await app.listen({ host: '127.0.0.1', port: 0 })
    expect((await app.inject('/api/health')).json().ok).toBe(true)
    const replacement = await aValidDatabase()
    expect(readFileSync(replacement).length, 'the replacement is a whole database of its own').toBeGreaterThan(100)
    renameSync(replacement, file)
    const answer = await app.inject('/api/health')
    expect(answer.statusCode).toBe(503)
    expect(answer.json()).toMatchObject({ ok: false, code: 'RELEASE_CHECK_CHANGED' })
  } finally { await app.close() }
})

it('refuses the same WAL database at once when it is not told another version serves it', async () => {
  const file = await aWalDatabase()
  const writer = new Database(file)
  try {
    writer.pragma('journal_mode = WAL')
    writeAKey(writer, 'a-row-only-the-live-mode-may-read', 'the closed rule still applies')
    expect(existsSync(`${file}-wal`)).toBe(true)
    expect(() => buildReleaseCheckApp(file, 'release-check')).toThrow(/checkpointed/)
  } finally { writer.close() }
})

it('is held by the upgrade mark, while the upgrade’s own release check is not', async () => {
  const file = await aValidDatabase()
  writeTheUpgradeMark(file, {
    from: '0.0.0-test',
    to: '0.0.1-test',
    tag: 'v0.0.1-test',
    closedAt: '2026-01-01 00:00:00',
    lock: join(file, '..', 'stable-upgrade.lock'),
    resume: `node upgrade-stable.mjs --resume ${join(file, '..', 'stable-upgrade.lock')}`,
  })
  expect(existsSync(theUpgradeMarkPath(file))).toBe(true)
  expect(whyAnUpgradeKeepsTheOfficeClosed(file, null, 'release-check-live')).toContain('stays closed')
  expect(whyAnUpgradeKeepsTheOfficeClosed(file, null, 'release-check')).toBeNull()
  // A live trial while an upgrade holds the database closed would mean something has gone wrong.
  expect(whyAnUpgradeKeepsTheOfficeClosed(file, null, undefined)).toContain('stays closed')
})

it('takes every start mode in the exported list, and refuses another word naming all of them', () => {
  for (const mode of START_MODES) expect(startModeFrom({ MOLE_OFFICE_START_MODE: mode })).toBe(mode)
  // The words come from the list settings.mjs exports. `release-check-live` is also the mode every
  // other case here passes to `buildReleaseCheckApp`; that function's signature types the word, so
  // those cases check it.
  expect(START_MODES).toContain('release-check-live')
  let refusal: unknown
  try {
    startModeFrom({ MOLE_OFFICE_START_MODE: 'maintenance' })
  } catch (error) { refusal = error }
  expect(refusal).toBeInstanceOf(Error)
  expect(String(refusal)).toContain('MOLE_OFFICE_START_MODE')
  for (const mode of START_MODES) expect(String(refusal)).toContain(mode)
})
