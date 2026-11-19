// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE CLOSED UPGRADE'S VERIFIER, ON MADE-UP OFFICES (tools/stable/upgrade-stable.criteria.md, "The closed upgrade's
 * verifier (item 20)").
 *
 * Each target is made the way a closed upgrade leaves one. The made-up office is in WAL mode. Its private snapshot is
 * SQLite's backup of it, checked read-only and then checkpointed into DELETE mode, as the transaction does before it
 * takes the snapshot's hash (item 24). The office itself is then checkpointed into DELETE mode, as the transaction
 * does before its release check. A test then
 * changes the target the one way it is about. The verifier runs as the transaction runs it: the program itself, with
 * the request and result paths last. No running office, checkout or database of anybody's is read.
 */
import { execFile, execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chmodSync, copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'
import { beforeAll, expect, it } from 'vitest'
import { aTestDatabaseFolder, freshDb } from './helpers.ts'
import { backupSqliteInOneStep } from '../tools/independent-storage.mjs'
import { readClosedVerificationResult, validateClosedVerification } from '../tools/stable/closed-upgrade-verification.mjs'

const REPO = realpathSync(fileURLToPath(new URL('..', import.meta.url)))
const VERIFIER = join(REPO, 'tools/stable/verify-the-target.mjs')
const CHECKS = ['health', 'records', 'reads', 'migrations', 'settings']
const HEAD = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO, encoding: 'utf8' }).trim()
const SAMPLE_KINDS = ['decision', 'message', 'report', 'session']

/** The made-up office every target is copied from: WAL-marked, as the live one is. */
let base = ''

beforeAll(async () => {
  const t = await freshDb()
  try {
    const db = t.client.sqlite
    // Stamps in 2099, so these are the newest records whatever day the test runs on.
    const add = db.prepare(`INSERT INTO records (id, workspace_id, owner_id, created_at, updated_at, kind, title, data, origin, deleted_at)
      VALUES (?, 'default', 'owner', ?, ?, ?, ?, ?, 'fixture', ?)`)
    let minute = 0
    for (const kind of SAMPLE_KINDS) for (const which of ['older', 'newer']) {
      minute += 1
      const at = `2099-01-01 10:${String(minute).padStart(2, '0')}:00`
      add.run(`made-up-${kind}-${which}`, at, at, kind, `A made-up ${kind}, the ${which} one`, JSON.stringify({ madeUp: true }), null)
    }
    // The newest record of all is a withdrawn message: the sample of messages is the newest one that is not withdrawn.
    add.run('made-up-message-withdrawn', '2099-01-01 11:00:00', '2099-01-01 11:00:00', 'message', 'A made-up withdrawn message', '{}', '2099-01-01 11:01:00')
    db.prepare(`INSERT OR REPLACE INTO runtime_settings (name, value, until) VALUES (?, ?, ?)`).run('MOLE_OFFICE_MERGE_WORKERS', '2', null)
    db.prepare(`INSERT OR REPLACE INTO runtime_settings (name, value, until) VALUES (?, ?, ?)`).run('MOLE_OFFICE_MADE_UP_SETTING', 'made-up value', '2099-01-02 00:00:00')
    base = join(aTestDatabaseFolder('verifier-base'), 'office.sqlite')
    await db.backup(base)
  } finally { t.close() }
}, 120_000)

interface Target { folder: string; database: string; snapshot: string; work: string }

async function aTarget(change?: (target: Database.Database) => void): Promise<Target> {
  const folder = realpathSync(aTestDatabaseFolder('verifier'))
  const office = join(folder, 'office'), work = join(folder, 'work')
  mkdirSync(office); mkdirSync(work, { mode: 0o700 })
  const database = join(office, 'office.sqlite'), snapshot = join(work, 'restore.sqlite')
  copyFileSync(base, database)
  await backupSqliteInOneStep(database, snapshot); chmodSync(snapshot, 0o600)
  const check = new Database(snapshot, { readonly: true, fileMustExist: true })
  try { expect(check.pragma('integrity_check', { simple: true })).toBe('ok') } finally { check.close() }
  const copy = new Database(snapshot, { fileMustExist: true })
  try {
    copy.pragma('wal_checkpoint(TRUNCATE)')
    expect(copy.pragma('journal_mode = DELETE', { simple: true })).toBe('delete')
  } finally { copy.close() }
  const target = new Database(database, { fileMustExist: true })
  try {
    target.pragma('wal_checkpoint(TRUNCATE)')
    expect(target.pragma('journal_mode = DELETE', { simple: true })).toBe('delete')
    change?.(target)
  } finally { target.close() }
  return { folder, database, snapshot, work }
}

function aRequest(target: Target, port: number, more: Record<string, unknown> = {}) {
  const directory = join(target.work, `verification-target-${String(readdirSync(target.work).length)}`)
  mkdirSync(directory, { mode: 0o700 })
  const request = { version: 1, phase: 'target', commit: HEAD, repository: REPO, database: target.database, snapshot: target.snapshot, servicePort: port, checks: CHECKS, stateSha256: 'a'.repeat(64), ...more }
  const requestPath = join(directory, 'request.json'), resultPath = join(directory, 'result.json')
  writeFileSync(requestPath, JSON.stringify(request) + '\n', { flag: 'wx', mode: 0o400 })
  return { request, requestPath, resultPath }
}

/** A made-up release-check service: it answers GET /api/health as the real one does, or the way a test says. */
async function aService(target: Target, answer: (identity: Record<string, unknown>) => { status: number; body: unknown; waitMs?: number } = identity => ({ status: 200, body: { ok: true, identity } })) {
  const server = createServer((req, res) => {
    if (req.method !== 'GET' || req.url !== '/api/health') { res.writeHead(503).end(); return }
    const port = (server.address() as AddressInfo).port
    const said = answer({ commit: HEAD, repository: REPO, database: target.database, port, mode: 'release-check' })
    setTimeout(() => { res.writeHead(said.status, { 'content-type': 'application/json' }).end(JSON.stringify(said.body)) }, said.waitMs ?? 0)
  })
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done))
  return { port: (server.address() as AddressInfo).port, close: () => new Promise<void>(done => { server.closeAllConnections(); server.close(() => done()) }) }
}

/** The verifier as the transaction runs it: the program itself, the release-check environment, the two paths last. */
function verify(target: Target, port: number, paths: { requestPath: string; resultPath: string }, within = '20000', args?: string[]) {
  const env = { PATH: process.env.PATH, LANG: 'C.UTF-8', HOME: target.work, TMPDIR: target.work, MOLE_OFFICE_DB: target.database, MOLE_OFFICE_PORT: String(port), MOLE_OFFICE_START_MODE: 'release-check', NODE_ENV: 'production' }
  const started = Date.now()
  return new Promise<{ code: number | string; out: string; ms: number }>(done => {
    execFile(VERIFIER, args ?? ['--within', within, paths.requestPath, paths.resultPath], { cwd: REPO, env, timeout: 25_000 }, (error, stdout, stderr) => {
      done({ code: error === null ? 0 : typeof error.code === 'number' ? error.code : String(error.code ?? error.signal), out: stdout + stderr, ms: Date.now() - started })
    })
  })
}

const theResult = (path: string) => JSON.parse(readFileSync(path, 'utf8')) as { checks: Record<string, boolean> }
const allPassedBut = (...failed: string[]) => Object.fromEntries(CHECKS.map(name => [name, !failed.includes(name)]))

/** Every file in the office's folder and the snapshot's, with what the transaction freezes about it. */
function theFrozenFiles(target: Target) {
  return [join(target.folder, 'office'), target.work].flatMap(folder => readdirSync(folder).map(name => join(folder, name)))
    .filter(path => lstatSync(path).isFile())
    .map(path => { const s = lstatSync(path); return { path, size: s.size, mode: s.mode, ino: s.ino, mtimeMs: s.mtimeMs, ctimeMs: s.ctimeMs, sha256: createHash('sha256').update(readFileSync(path)).digest('hex') } })
}

it('passes a good target with a result the transaction accepts, and changes no file beside either database', async () => {
  const target = await aTarget()
  // The situation of a real closed upgrade: the snapshot and the target are both in DELETE mode, with nothing beside them.
  expect([...readFileSync(target.snapshot).subarray(18, 20)]).toEqual([1, 1])
  expect(['-wal', '-shm', '-journal'].filter(suffix => existsSync(target.snapshot + suffix))).toEqual([])
  expect(['-wal', '-shm', '-journal'].filter(suffix => existsSync(target.database + suffix))).toEqual([])
  const service = await aService(target)
  try {
    const paths = aRequest(target, service.port)
    const before = theFrozenFiles(target)
    const ran = await verify(target, service.port, paths)
    expect(ran.code, ran.out).toBe(0)
    for (const name of CHECKS) expect(ran.out).toMatch(new RegExp(`^${name}: passed\\. `, 'm'))
    expect(ran.out).toContain('release-check mode serves no record door')
    expect(readClosedVerificationResult(paths.resultPath, paths.request)).toEqual({ version: 1, phase: 'target', commit: HEAD, stateSha256: 'a'.repeat(64), checks: allPassedBut() })
    expect(lstatSync(paths.resultPath).mode & 0o777).toBe(0o600)
    expect(theFrozenFiles(target)).toEqual(before)
  } finally { await service.close() }
}, 30_000)

it('passes a good target against the real release-check server, whose identity it reads', async () => {
  const target = await aTarget()
  const { buildReleaseCheckApp } = await import('../src/server/lib/release-check.ts')
  const { app } = buildReleaseCheckApp(target.database)
  await app.listen({ port: 0, host: '127.0.0.1' })
  try {
    const port = (app.server.address() as AddressInfo).port
    const paths = aRequest(target, port)
    const ran = await verify(target, port, paths)
    expect(ran.code, ran.out).toBe(0)
    expect(theResult(paths.resultPath).checks).toEqual(allPassedBut())
  } finally { await app.close() }
}, 30_000)

it('fails the records check, and names it, for a target missing a record', async () => {
  const target = await aTarget(db => { db.prepare(`DELETE FROM records WHERE id = 'made-up-decision-older'`).run() })
  const service = await aService(target)
  try {
    const paths = aRequest(target, service.port)
    const ran = await verify(target, service.port, paths)
    expect(ran.code, ran.out).toBe(1)
    expect(theResult(paths.resultPath).checks).toEqual(allPassedBut('records'))
    expect(ran.out).toMatch(/^records: FAILED\. .*\d+ records.*\d+/m)
    expect(() => readClosedVerificationResult(paths.resultPath, paths.request)).toThrow(/every configured check must be boolean true/)
  } finally { await service.close() }
}, 30_000)

it('fails the records check when the count is the same but the newest record is another', async () => {
  const target = await aTarget(db => {
    db.prepare(`DELETE FROM records WHERE id = 'made-up-decision-older'`).run()
    db.prepare(`INSERT INTO records (id, workspace_id, owner_id, created_at, updated_at, kind, title, data, origin) VALUES ('made-up-note-later', 'default', 'owner', '2099-02-01 00:00:00', '2099-02-01 00:00:00', 'note', 'A made-up later note', '{}', 'fixture')`).run()
  })
  const service = await aService(target)
  try {
    const paths = aRequest(target, service.port)
    const ran = await verify(target, service.port, paths)
    expect(ran.code, ran.out).toBe(1)
    expect(theResult(paths.resultPath).checks).toEqual(allPassedBut('records'))
    expect(ran.out).toMatch(/^records: FAILED\. .*made-up-note-later.*made-up-message-withdrawn/m)
  } finally { await service.close() }
}, 30_000)

it('fails the reads check for a sampled record that was withdrawn or changed in the target', async () => {
  for (const change of [
    `UPDATE records SET deleted_at = '2099-01-03 00:00:00' WHERE id = 'made-up-message-newer'`,
    `UPDATE records SET title = 'Another title' WHERE id = 'made-up-report-newer'`,
    `UPDATE records SET data = '[]' WHERE id = 'made-up-session-newer'`,
  ]) {
    const target = await aTarget(db => { db.prepare(change).run() })
    const service = await aService(target)
    try {
      const paths = aRequest(target, service.port)
      const ran = await verify(target, service.port, paths)
      expect(ran.code, `${change}\n${ran.out}`).toBe(1)
      expect(theResult(paths.resultPath).checks, change).toEqual(allPassedBut('reads'))
      expect(ran.out).toMatch(/^reads: FAILED\. /m)
    } finally { await service.close() }
  }
}, 30_000)

it('fails the migrations check for an older migration level, and for one newer than the target knows', async () => {
  for (const change of [
    `DELETE FROM __drizzle_migrations WHERE rowid = (SELECT max(rowid) FROM __drizzle_migrations)`,
    `INSERT INTO __drizzle_migrations (hash, created_at) VALUES ('${'b'.repeat(64)}', 4102444800000)`,
  ]) {
    const target = await aTarget(db => { db.prepare(change).run() })
    const service = await aService(target)
    try {
      const paths = aRequest(target, service.port)
      const ran = await verify(target, service.port, paths)
      expect(ran.code, `${change}\n${ran.out}`).toBe(1)
      expect(theResult(paths.resultPath).checks, change).toEqual(allPassedBut('migrations'))
      expect(ran.out).toMatch(/^migrations: FAILED\. /m)
    } finally { await service.close() }
  }
}, 30_000)

it('fails the health check for a door that refuses, and for a service of another commit or mode', async () => {
  for (const [what, answer] of [
    ['a refusal', () => ({ status: 503, body: { code: 'RELEASE_CHECK_CHANGED' } })],
    ['another commit', (identity: Record<string, unknown>) => ({ status: 200, body: { ok: true, identity: { ...identity, commit: '0'.repeat(40) } } })],
    ['the ordinary mode', (identity: Record<string, unknown>) => ({ status: 200, body: { ok: true, identity: { ...identity, mode: 'ordinary' } } })],
  ] as const) {
    const target = await aTarget()
    const service = await aService(target, answer)
    try {
      const paths = aRequest(target, service.port)
      const ran = await verify(target, service.port, paths)
      expect(ran.code, `${what}\n${ran.out}`).toBe(1)
      expect(theResult(paths.resultPath).checks, what).toEqual(allPassedBut('health'))
      expect(ran.out).toMatch(/^health: FAILED\. /m)
    } finally { await service.close() }
  }
}, 30_000)

it('fails the settings check for a changed setting or owner preference, and names it without its value', async () => {
  for (const [change, named, value] of [
    [`UPDATE runtime_settings SET value = 'a changed value' WHERE name = 'MOLE_OFFICE_MADE_UP_SETTING'`, 'MOLE_OFFICE_MADE_UP_SETTING', 'a changed value'],
    [`UPDATE people SET language = 'made-up-language' WHERE office_owner IS NOT NULL`, 'language', 'made-up-language'],
  ] as const) {
    const target = await aTarget(db => { expect(db.prepare(change).run().changes).toBe(1) })
    const service = await aService(target)
    try {
      const paths = aRequest(target, service.port)
      const ran = await verify(target, service.port, paths)
      expect(ran.code, `${change}\n${ran.out}`).toBe(1)
      expect(theResult(paths.resultPath).checks, change).toEqual(allPassedBut('settings'))
      expect(ran.out).toMatch(new RegExp(`^settings: FAILED\\. .*${named}`, 'm'))
      expect(ran.out).not.toContain(value)
      expect(ran.out).not.toContain('made-up value')
    } finally { await service.close() }
  }
}, 30_000)

it('refuses to read a database with a rollback journal beside it, and creates no file', async () => {
  const target = await aTarget()
  writeFileSync(`${target.database}-journal`, 'made-up journal bytes')
  const service = await aService(target)
  try {
    const paths = aRequest(target, service.port)
    const before = theFrozenFiles(target)
    const ran = await verify(target, service.port, paths)
    expect(ran.code, ran.out).toBe(1)
    expect(theResult(paths.resultPath).checks).toEqual(allPassedBut('records', 'reads', 'migrations', 'settings'))
    expect(ran.out).toMatch(/^records: FAILED\. .*rollback journal/m)
    expect(theFrozenFiles(target)).toEqual(before)
  } finally { await service.close() }
}, 30_000)

it('stops at its own time limit: the health wait is cut, and a check not started is false', async () => {
  const target = await aTarget()
  const service = await aService(target, identity => ({ status: 200, body: { ok: true, identity }, waitMs: 5_000 }))
  try {
    const paths = aRequest(target, service.port)
    const ran = await verify(target, service.port, paths, '1500')
    expect(ran.code, ran.out).toBe(1)
    expect(ran.ms, ran.out).toBeLessThan(4_500)
    expect(theResult(paths.resultPath).checks).toEqual(allPassedBut(...CHECKS))
    expect(ran.out).toMatch(/^health: FAILED\. .*1500 ms/m)
    expect(ran.out).toMatch(/^records: FAILED\. Not run: .*1500 ms/m)
  } finally { await service.close() }
}, 30_000)

it('refuses an unknown check, a request it cannot read and a missing limit, with exit 2 and no result', async () => {
  const target = await aTarget()
  const service = await aService(target)
  try {
    for (const [what, more, args] of [
      ['an unknown check', { checks: [...CHECKS, 'synthetic-schema'] }, undefined],
      ['an extra field', { repair: true }, undefined],
      ['an old version', { version: 2 }, undefined],
    ] as const) {
      const paths = aRequest(target, service.port, more)
      const ran = await verify(target, service.port, paths, '20000', args)
      expect(ran.code, `${what}\n${ran.out}`).toBe(2)
      expect(existsSync(paths.resultPath), what).toBe(false)
    }
    const paths = aRequest(target, service.port)
    const ran = await verify(target, service.port, paths, '20000', [paths.requestPath, paths.resultPath])
    expect(ran.code, ran.out).toBe(2)
    expect(ran.out).toContain('--within')
    expect(existsSync(paths.resultPath)).toBe(false)
  } finally { await service.close() }
}, 30_000)

it('is a verifier the configuration accepts by its canonical absolute path', () => {
  const closedVerification = { command: [VERIFIER, '--within', '60000'], timeoutMs: 120_000, checks: CHECKS, abortDeadlineMs: 600_000, maxClosedMs: 1_200_000 }
  expect(() => { validateClosedVerification(closedVerification) }).not.toThrow()
  // GIT RECORDS ONLY THAT A FILE IS EXECUTABLE, as mode 100755. A checkout sets the group's and others' execute bits
  // from the umask of whoever made it, so only the owner's bit is the same in every checkout.
  expect(execFileSync('git', ['ls-files', '--stage', '--', VERIFIER], { cwd: REPO, encoding: 'utf8' }).split(' ')[0]).toBe('100755')
  expect(lstatSync(VERIFIER).mode & 0o100).toBe(0o100)
  expect(readFileSync(VERIFIER, 'utf8').split('\n')[0]).toBe('#!/usr/bin/env node')
})
