// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Release-check is proved against real external SQLite files and the actual server entry. */
import { afterEach, expect, it, vi } from 'vitest'
import Database from 'better-sqlite3'
import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { join } from 'node:path'
import { once } from 'node:events'
import { createHash } from 'node:crypto'
import { freshDb, aTestDatabaseFolder, apiServerArguments, commandThatStopsWithItsOwner } from './helpers.ts'
import { headFromGitDirs, REPO_ROOT, startModeFrom, theServingInstall } from '../src/config/settings.mjs'
import { buildReleaseCheckApp } from '../src/server/lib/release-check.ts'

const groups = new Set<number>()
const children = new Set<ChildProcess>()
const token = 'made-up-release-check-test-token'
const root = realpathSync(REPO_ROOT)

async function stop(child: ChildProcess): Promise<void> {
  if (child.exitCode === null && child.signalCode === null) {
    const ended = once(child, 'exit')
    if (child.pid !== undefined) process.kill(-child.pid, 'SIGTERM')
    await ended
  }
  if (child.pid !== undefined) groups.delete(child.pid)
  children.delete(child)
}
afterEach(async () => {
  for (const child of children) await stop(child)
  expect(groups.size).toBe(0)
  vi.restoreAllMocks()
})

async function fixture(wal = false): Promise<string> {
  const source = await freshDb()
  const folder = aTestDatabaseFolder('release-check')
  const file = join(folder, 'office.db')
  try {
    source.client.sqlite.prepare("INSERT INTO held_keys (id, whose_kind, whose_id, key_hash, made_at, last_used_at) VALUES (?, 'agent', 'release-check-fixture', ?, '2026-01-01 00:00:00', NULL)")
      .run('release-check-fixture-key', createHash('sha256').update(token).digest('hex'))
    await source.client.sqlite.backup(file)
  } finally { source.close() }
  const prepared = new Database(file)
  prepared.pragma('wal_checkpoint(TRUNCATE)')
  prepared.pragma(wal ? 'journal_mode = WAL' : 'journal_mode = DELETE')
  prepared.close()
  writeFileSync(join(folder, 'keys.json'), '{"fixture":"made-up credential bytes"}\n')
  return file
}
function snapshot(file: string) {
  const sqlite = new Database(file, { readonly: true, fileMustExist: true })
  try {
    const tables = (sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as { name: string }[])
    return {
      bytes: readFileSync(file),
      files: readdirSync(join(file, '..')).sort().map(name => ({ name, bytes: readFileSync(join(file, '..', name)) })),
      rows: tables.map(({ name }) => ({ name, rows: sqlite.prepare(`SELECT * FROM "${name.replace(/"/g, '""')}"`).all() })),
    }
  } finally { sqlite.close() }
}
/**
 * THE SAME BYTES, ASKED BYTE FOR BYTE AT MEMORY SPEED (wave 13y round 61). `toEqual` walks a Buffer one byte at a time.
 * This file's database is 1.4 MB, and run alone one such comparison took about 2.1 seconds. A snapshot holds the
 * database twice, once as the file and once among the folder's files. So one snapshot compared took 4.9 seconds, and
 * the second case compares four: 19 of its 20 seconds alone. In a whole run of the suite at twenty workers it ran out
 * of its 30 seconds. `Buffer.equals` asks the same question and answered in under a millisecond.
 */
function expectSameBytes(after: Buffer, before: Buffer, what: string): void {
  expect(after.equals(before), `${what}: its bytes changed (${String(after.length)} bytes now, ${String(before.length)} before)`).toBe(true)
}
/** Every part of a snapshot unchanged: the database's bytes, the folder's files and their bytes, and every row. */
function expectSameSnapshot(after: ReturnType<typeof snapshot>, before: ReturnType<typeof snapshot>): void {
  expectSameBytes(after.bytes, before.bytes, 'the database file')
  expect(after.files.map(({ name }) => name), "the folder's files").toEqual(before.files.map(({ name }) => name))
  after.files.forEach(({ name, bytes }, at) => expectSameBytes(bytes, before.files[at]!.bytes, name))
  expect(after.rows).toEqual(before.rows)
}
async function freePort(): Promise<number> {
  const server = createServer()
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done))
  const port = (server.address() as { port: number }).port
  await new Promise<void>(done => server.close(() => done()))
  return port
}
function launch(file: string, port: number, mode: string) {
  const preload = join(file, '..', 'no-background-timers.mjs')
  writeFileSync(preload, "globalThis.setInterval = () => { throw new Error('A recurring timer started during release-check'); };\n")
  const watched = commandThatStopsWithItsOwner(process.execPath, apiServerArguments(['--import', preload, '--import', 'tsx']))
  const child = spawn(watched.command, watched.args, {
    cwd: root, detached: true, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, NODE_ENV: 'production', MOLE_OFFICE_DB: file, MOLE_OFFICE_PORT: String(port), MOLE_OFFICE_START_MODE: mode,
      MOLE_OFFICE_MESSAGE_WORKER: 'on', MOLE_OFFICE_TERMINAL_HOLDER: 'on', MOLE_OFFICE_ADDRESS_FOR_OTHER_MACHINES: 'off' },
  })
  if (child.pid === undefined) throw new Error('The test server did not start.')
  groups.add(child.pid)
  children.add(child)
  let log = ''
  child.stdout!.on('data', chunk => { log += String(chunk) })
  child.stderr!.on('data', chunk => { log += String(chunk) })
  return { child, log: () => log }
}
async function answered(server: ReturnType<typeof launch>, port: number) {
  for (let tries = 0; tries < 100; tries++) {
    if (server.child.exitCode !== null || server.child.signalCode !== null) throw new Error(server.log())
    try {
      const reply = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(1000) })
      if (reply.ok) return await reply.json()
    } catch { /* The child may still be loading; its recorded exit and bounded wait decide failure. */ }
    await new Promise(done => setTimeout(done, 50))
  }
  throw new Error(`Release-check did not answer: ${server.log()}`)
}

it('keeps all bytes, rows and credentials unchanged while refusing every ordinary request, on a checkpointed rollback-journal file', async () => {
  const file = await fixture()
  const before = snapshot(file)
  const intervals = vi.spyOn(globalThis, 'setInterval')
  const { app, sqlite } = buildReleaseCheckApp(file)
  try {
    expect(sqlite.readonly).toBe(true)
    expect(() => sqlite.exec("UPDATE held_keys SET last_used_at='changed'" )).toThrow(/readonly/)
    await app.listen({ host: '127.0.0.1', port: 0 })
    const health = (await app.inject('/api/health')).json()
    const runtime = (await app.inject('/api/runtime')).json()
    expect(health).toEqual(runtime)
    expect(health.identity.database).toBe(realpathSync(file))
    expect(health.identity.port).toBe((app.server.address() as { port: number }).port)
    const headers = { 'x-mole-office-key': token, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'release-check-fixture' }
    for (const url of ['/api/records', '/api/office/keys', '/api/messages', '/api/runtime/register', '/api/file?path=anything', '/', '/api/runtime/freshness']) {
      const read = await app.inject({ url, headers })
      expect(read.statusCode, url).toBe(503)
      expect(read.json()).toMatchObject({ code: 'RELEASE_CHECK_ONLY', error: expect.stringContaining('refused') })
      for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'] as const) {
        const denied = await app.inject({ method, url, headers })
        expect(denied.statusCode, `${method} ${url}`).toBe(405)
        expect(denied.headers.allow).toBe('GET')
      }
    }
    for (const url of ['/api/health', '/api/runtime']) {
      expect((await app.inject({ method: 'POST', url, payload: { madeUp: true } })).statusCode).toBe(405)
      expect((await app.inject({ url, headers })).json().ok).toBe(true)
    }
    expect(intervals).not.toHaveBeenCalled()
    expectSameSnapshot(snapshot(file), before)
  } finally { await app.close() }
  expect(sqlite.open).toBe(false)
  expectSameSnapshot(snapshot(file), before)
})

it('starts the real entry without startup writers or recurring timers, checks a copy, stops, and reuses the ordinary port for the actual file', async () => {
  const actual = await fixture()
  const copyFolder = aTestDatabaseFolder('release-check-private-copy')
  const copy = join(copyFolder, 'candidate.db')
  copyFileSync(actual, copy)
  const port = await freePort()
  for (const file of [copy, actual]) {
    // The preload is a test resource; take the file snapshot after it exists.
    const server = launch(file, port, 'release-check')
    const before = snapshot(file)
    try {
      const health = await answered(server, port)
      expect(health.identity).toEqual({ commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(), repository: root, database: realpathSync(file), port, mode: 'release-check' })
      expect((await fetch(`http://127.0.0.1:${port}/api/messages`)).status).toBe(503)
      expect((await fetch(`http://127.0.0.1:${port}/api/records`, { method: 'POST', body: '{}' })).status).toBe(405)
      expectSameSnapshot(snapshot(file), before)
      expect(server.log()).not.toContain('message worker')
    } finally { await stop(server.child) }
    expect(server.child.exitCode).toBe(0)
    expectSameSnapshot(snapshot(file), before)
  }
  const probe = createServer()
  await new Promise<void>(done => probe.listen(port, '127.0.0.1', done))
  await new Promise<void>(done => probe.close(() => done()))
})

it('refuses invalid modes and missing, corrupt, outdated, incomplete or uncheckpointed databases without repairing them', async () => {
  expect(startModeFrom({})).toBe('ordinary')
  expect(startModeFrom({ MOLE_OFFICE_START_MODE: 'ordinary' })).toBe('ordinary')
  expect(startModeFrom({ MOLE_OFFICE_START_MODE: 'release-check' })).toBe('release-check')
  for (const mode of ['', 'maintenance', 'RELEASE-CHECK', ' release-check ']) expect(() => startModeFrom({ MOLE_OFFICE_START_MODE: mode })).toThrow(/MOLE_OFFICE_START_MODE/)
  const file = await fixture()
  const folder = join(file, '..')
  const server = launch(file, await freePort(), 'maintenance')
  const before = snapshot(file)
  // Invalid startup must exit without a listener or startup side effects.
  await once(server.child, 'exit')
  expect(server.child.exitCode).toBe(1)
  expect(server.log()).toContain('MOLE_OFFICE_START_MODE')
  expect(snapshot(file).rows).toEqual(before.rows)
  expectSameBytes(readFileSync(file), before.bytes, 'the database file')
  const missing = join(folder, 'missing.db')
  expect(() => buildReleaseCheckApp(missing)).toThrow()
  expect(existsSync(missing)).toBe(false)
  const corrupt = join(folder, 'corrupt.db')
  writeFileSync(corrupt, 'this is not SQLite')
  expect(() => buildReleaseCheckApp(corrupt)).toThrow()
  expect(readFileSync(corrupt, 'utf8')).toBe('this is not SQLite')
  for (const [name, sql, message] of [
    ['outdated', 'DELETE FROM __drizzle_migrations', /pending schema migrations/],
    ['incomplete', 'ALTER TABLE held_keys DROP COLUMN last_used_at', /incomplete schema/],
  ] as const) {
    const path = join(folder, `${name}.db`)
    copyFileSync(file, path)
    const db = new Database(path)
    db.exec(sql)
    db.close()
    const bytes = readFileSync(path)
    expect(() => buildReleaseCheckApp(path)).toThrow(message)
    expectSameBytes(readFileSync(path), bytes, `the ${name} database`)
  }
  const headerOnlyWal = await fixture(true)
  const walFiles = readdirSync(join(headerOnlyWal, '..'))
  const walBytes = readFileSync(headerOnlyWal)
  expect(() => buildReleaseCheckApp(headerOnlyWal)).toThrow(/DELETE journal mode/)
  expect(readdirSync(join(headerOnlyWal, '..'))).toEqual(walFiles)
  expectSameBytes(readFileSync(headerOnlyWal), walBytes, 'the header-only WAL database')
  const wal = new Database(file)
  wal.pragma('journal_mode = WAL')
  wal.exec("UPDATE held_keys SET last_used_at='uncheckpointed fixture'")
  try {
    const bytes = readFileSync(file)
    const journal = readFileSync(`${file}-wal`)
    expect(() => buildReleaseCheckApp(file)).toThrow(/checkpointed/)
    expectSameBytes(readFileSync(file), bytes, 'the uncheckpointed database')
    expectSameBytes(readFileSync(`${file}-wal`), journal, 'its WAL file')
  } finally { wal.close() }
})

it('reads actual serving identity through the shared Git reader and refuses unbound or changed validation evidence', async () => {
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
  expect(theServingInstall()).toEqual({ commit, repository: root })
  const folder = aTestDatabaseFolder('release-check-git')
  const common = join(folder, 'common')
  const local = join(folder, 'worktree')
  mkdirSync(common); mkdirSync(local)
  const ref = 'refs/heads/release-check-fixture'
  writeFileSync(join(local, 'HEAD'), `ref: ${ref}\n`)
  writeFileSync(join(common, 'packed-refs'), `${commit} ${ref}\n`)
  expect(headFromGitDirs({ gitDir: local, commonDir: common }, folder, [])?.full).toBe(commit)
  writeFileSync(join(local, 'HEAD'), `${commit}\n`)
  expect(headFromGitDirs({ gitDir: local, commonDir: common }, folder, [])?.branch).toBeNull()
  writeFileSync(join(local, 'HEAD'), 'unknown\n')
  const gaps: string[] = []
  expect(headFromGitDirs({ gitDir: local, commonDir: common }, folder, gaps)).toBeNull()
  expect(gaps.length).toBeGreaterThan(0)
  const file = await fixture()
  const { app } = buildReleaseCheckApp(file)
  try {
    expect((await app.inject('/api/health')).statusCode).toBe(503)
    await app.listen({ host: '127.0.0.1', port: 0 })
    expect((await app.inject('/api/health')).json().identity.commit).toBe(commit)
    const writer = new Database(file)
    writer.exec("UPDATE held_keys SET last_used_at='new fixture value'")
    writer.close()
    expect((await app.inject('/api/health')).statusCode).toBe(503)
    expect((await app.inject('/api/runtime')).json()).toMatchObject({ ok: false, code: 'RELEASE_CHECK_CHANGED' })
  } finally { await app.close() }
})
