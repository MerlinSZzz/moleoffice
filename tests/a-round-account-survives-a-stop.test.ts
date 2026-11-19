// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** A round's incomplete account survives a stopped server and is completed once after the next start. */
import { spawn, type ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { expect, it, vi } from 'vitest'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { aGitThatWaits, aRepository, git } from './a-seal-read-fixture.ts'
import { thePersonsKeyHeader } from './helpers.ts'

const accountIsPending = (value: unknown): boolean => {
  if (typeof value !== 'object' || value === null) return false
  const reasons = (value as { reasons?: { why?: string }[] }).reasons
  return Array.isArray(reasons) && reasons.some((one) => one.why === 'git-being-read')
}
const person = { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id }
async function port(): Promise<number> {
  const s = createServer()
  await new Promise<void>((resolve, reject) => s.listen(0, '127.0.0.1', resolve).on('error', reject))
  const address = s.address()
  if (address === null || typeof address === 'string') throw new Error('No test port was assigned.')
  await new Promise<void>((resolve) => s.close(() => resolve()))
  return address.port
}
type Server = { child: ChildProcess; base: string; lines: string[] }
async function start(database: string): Promise<Server> {
  const api = await port()
  let web = await port()
  while (web === api) web = await port()
  const env = { ...process.env }
  for (const key of Object.keys(env)) if (key.startsWith('MOLE_OFFICE_')) delete env[key]
  Object.assign(env, { MOLE_OFFICE_DB: database, MOLE_OFFICE_PORT: String(api), MOLE_OFFICE_WEB_PORT: String(web), MOLE_OFFICE_MESSAGE_WORKER: 'off', MOLE_OFFICE_ADDRESS_FOR_OTHER_MACHINES: 'none', LOG_LEVEL: 'info' })
  const child = spawn(process.execPath, ['--import', 'tsx', 'src/server/index.ts'], { cwd: process.cwd(), env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] })
  const lines: string[] = []
  child.stdout?.on('data', (chunk: Buffer) => lines.push(chunk.toString()))
  child.stderr?.on('data', (chunk: Buffer) => lines.push(chunk.toString()))
  const base = `http://127.0.0.1:${String(api)}`
  const server = { child, base, lines }
  try {
    await vi.waitFor(async () => {
      if (child.exitCode !== null || child.signalCode !== null) throw new Error('The test office stopped before it answered.')
      const response = await fetch(`${base}/api/health`)
      expect(response.ok).toBe(true)
    }, { timeout: 90_000, interval: 100 })
    return server
  } catch (error) {
    await stop(server)
    throw error
  }
}
async function stop(server: Server): Promise<void> {
  if (server.child.pid === undefined || server.child.exitCode !== null || server.child.signalCode !== null) return
  const exited = once(server.child, 'exit')
  process.kill(-server.child.pid, 'SIGKILL')
  await exited
}
async function ask(server: Server, method: string, path: string, body?: object, headers: Record<string, string> = person): Promise<Record<string, any>> {
  const response = await fetch(server.base + path, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
  expect(response.status, await response.clone().text()).toBe(method === 'POST' ? 201 : 200)
  return await response.json() as Record<string, any>
}
function read(database: string, run: string): { account: unknown; lines: number } {
  const db = new Database(database, { readonly: true })
  try {
    const row = db.prepare('SELECT data FROM records WHERE id = ?').get(run) as { data: string }
    const lines = db.prepare("SELECT COUNT(*) AS n FROM records WHERE kind = 'message' AND deleted_at IS NULL AND json_extract(data, '$.aboutRun') = ? AND json_extract(data, '$.body') = 'A round ended without a seal'").get(run) as { n: number }
    return { account: JSON.parse(row.data).howTheRoundEnded, lines: lines.n }
  } finally { db.close() }
}

it('keeps a pending account across a stop, completes it once, and does nothing on a second start', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'round-account-restart-'))
  const database = join(folder, 'office.db')
  const repository = aRepository(join(folder, 'repository'))
  git(repository, 'switch', '-qc', 'worker')
  writeFileSync(join(repository, 'work', 'kept.txt'), 'A later commit.\n')
  git(repository, 'commit', '-qam', 'A later commit')
  const held = aGitThatWaits(folder)
  const servers: Server[] = []
  try {
    const first = await start(database); servers.push(first)
    Object.assign(person, thePersonsKeyHeader(join(folder, 'keys.json')))
    const starter = 'a-round-recovery-starter'
    const worker = 'a-round-recovery-worker'
    const registered = await ask(first, 'POST', '/api/agents/started', { handle: starter, name: starter, role: 'secretary', runtime: 'claude-code' })
    const key: unknown = registered.whatToGiveIt?.key
    if (typeof key !== 'string') throw new Error('The test starter was not given its key.')
    await ask(first, 'POST', '/api/agents/started', { handle: worker, name: worker, role: 'worker', runtime: 'claude-code', workArea: ['work'] }, { ...person, 'x-mole-office-key': key, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': starter })
    const filed = await ask(first, 'POST', '/api/records', { kind: 'session', title: 'A round to recover', data: { state: 'running', servingAgent: worker, workingDirectory: repository, cutFrom: 'main', sandbox: { template: 'test', container: 'test', folder: repository } } })
    const run = String(filed.record.id)
    held.holdAt('--others')
    await ask(first, 'PATCH', `/api/records/${run}`, { dataPatch: { commandEnded: { at: '2026-11-18 18:00:00', code: 0 } } })
    await held.reached()
    expect(accountIsPending(read(database, run).account)).toBe(true)
    expect(read(database, run).lines).toBe(0)
    await stop(first)
    held.letGo()
    expect(accountIsPending(read(database, run).account)).toBe(true)

    const second = await start(database); servers.push(second)
    await vi.waitFor(() => {
      const got = read(database, run)
      expect(got.account).toBeDefined()
      expect(accountIsPending(got.account)).toBe(false)
      expect(got.lines).toBe(1)
    }, { timeout: 120_000, interval: 100 })
    const completed = read(database, run)
    expect(JSON.stringify(completed.account)).toMatch(/after.*(stop|restart)/i)
    await stop(second)

    const third = await start(database); servers.push(third)
    await vi.waitFor(() => expect(third.lines.join('')).toContain('The office looked for round accounts still waiting for git after a start.'), { timeout: 120_000, interval: 100 })
    expect(read(database, run)).toEqual(completed)
  } finally {
    held.letGo()
    for (const server of servers.reverse()) await stop(server)
    held.remove()
    rmSync(folder, { recursive: true, force: true })
  }
}, 360_000)
