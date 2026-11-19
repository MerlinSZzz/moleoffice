// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** A run's own tool configuration lets its waiter hold only its own handle. */
import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import type { AddressInfo } from 'node:net'
import { fileURLToPath } from 'node:url'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { aShellsOfficeToolFile, theKeyARunsToolSends } from '../src/config/run-permissions.mjs'
import { THE_MESSAGE_WORKER_ID } from '../src/shared/participants.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const person = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const agent = (handle: string, key: string) => ({ ...person, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle, 'x-mole-office-key': key })
const home = mkdtempSync(join(tmpdir(), 'waiter-test-'))
const config = join(home, 'tool.json')
const worker = 'held-worker'
const other = 'other-worker'
let t: TestDb, app: FastifyInstance, api: string, run: string, runKey: string
type Waiter = { child: ReturnType<typeof spawn>; pgid: number | undefined; output: () => string; ended: Promise<number | null> }
const children: Waiter[] = []

async function post(url: string, headers: Record<string, string>, payload: unknown) {
  const reply = await app.inject({ method: 'POST', url, headers, payload: payload as never })
  expect(reply.statusCode).toBe(201)
  return reply.json() as Record<string, unknown>
}
function environment(file: boolean) {
  return { HOME: home, PATH: process.env.PATH, MOLE_OFFICE_DB: join(home, 'empty', 'office.db'), ...(file ? { MOLE_OFFICE_TOOL_CONFIGURATION: config } : {}) }
}
function start(handle: string, file: boolean): Waiter {
  const child = spawn(process.execPath, [fileURLToPath(new URL('../tools/hold-the-handle.mjs', import.meta.url)), '--agent', handle, '--session', run, '--api', api, '--workspace', 'default', '--runtime', 'codex'], {
    detached: true, env: environment(file),
  })
  let output = ''
  child.stdout.on('data', chunk => { output += String(chunk) })
  child.stderr.on('data', chunk => { output += String(chunk) })
  const ended = new Promise<number | null>((resolve, reject) => { child.on('error', reject); child.on('close', resolve) })
  const started = { child, pgid: child.pid, output: () => output, ended }
  children.push(started)
  return started
}
async function holds(handle: string) {
  const reply = await app.inject({ method: 'GET', url: '/api/handles', headers: person })
  expect(reply.statusCode).toBe(200)
  return (reply.json() as { holds: { handle: string; session: string; releasedAt: string | null }[] }).holds.filter(h => h.handle === handle && h.releasedAt === null)
}
async function until(check: () => Promise<boolean>, ms = 4000) {
  const end = Date.now() + ms
  while (Date.now() < end) { if (await check()) return true; await new Promise(resolve => setTimeout(resolve, 50)) }
  return false
}
function safe(output: string) {
  expect(output.includes(runKey)).toBe(false)
  expect(output.includes(config)).toBe(false)
  expect(output.includes(home)).toBe(false)
}
/**
 * WHAT THE READER ITSELF SAYS ABOUT THE ENVIRONMENT THIS CHILD GETS, with its path said in plain
 * words the way the waiter says it. The reason is asked of the reader, not written here, so a
 * change in the reader's words reaches this expectation.
 */
function refusalReason(file: boolean): string {
  const env = environment(file)
  const read = theKeyARunsToolSends(env, { agent: other, session: run })
  if (read.key !== null) throw new Error('the reader found a key where the case needs none')
  const path = env.MOLE_OFFICE_TOOL_CONFIGURATION
  return path === undefined ? read.why : read.why.replaceAll(path, 'named by MOLE_OFFICE_TOOL_CONFIGURATION')
}
beforeAll(async () => {
  t = await freshDb()
  const officeKey = randomBytes(32).toString('hex')
  writeFileSync(join(dirname(t.file), 'keys.json'), JSON.stringify({ office: officeKey, person: randomBytes(32).toString('hex'), providers: {} }), { mode: 0o600 })
  app = (await apiApp()).app
  await app.listen({ host: '127.0.0.1', port: 0 })
  api = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`
  const starter = await post('/api/agents/started', person, { handle: 'starter', name: 'Starter', role: 'supervisor' })
  const starterKey = String((starter.whatToGiveIt as { key: string }).key)
  for (const handle of [worker, other]) await post('/api/agents/started', agent('starter', starterKey), { handle, name: handle, role: 'worker', noKey: true })
  const id = (t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ? AND retired = 0').get(worker) as { id: string }).id
  const filed = await post('/api/records', agent(THE_MESSAGE_WORKER_ID, officeKey), { kind: 'session', title: 'Worker run', data: { state: 'running', runtime: 'codex', servingAgentId: id, servingAgent: worker, startedByMoleOffice: true } })
  run = (filed.record as { id: string }).id
  runKey = (filed.runKey as { key: string }).key
  expect(typeof runKey === 'string' && runKey.length > 0).toBe(true)
  const made = aShellsOfficeToolFile(['codex', 'exec'], { MOLE_OFFICE_AGENT: worker, MOLE_OFFICE_SESSION: run, MOLE_OFFICE_WORKSPACE: 'default', MOLE_OFFICE_API: api, MOLE_AGENT_KEY: runKey }, config)
  expect(made.configuration).not.toBeNull()
  writeFileSync(config, JSON.stringify(made.configuration), { mode: 0o600 })
}, 60000)
afterAll(async () => {
  for (const p of children) if (p.pgid !== undefined && p.child.exitCode === null && p.child.signalCode === null) { process.kill(-p.pgid, 'SIGTERM'); await p.ended }
  await app?.close()
  t?.close()
  rmSync(home, { recursive: true, force: true })
}, 60000)
it('holds the worker handle for its run without printing its key or file', async () => {
  const p = start(worker, true)
  const held = await until(async () => (await holds(worker)).some(h => h.session === run) && p.output().includes(worker) && p.output().includes(run))
  expect(held).toBe(true)
  safe(p.output())
}, 15000)
it('refuses another worker and a missing configuration before holding', async () => {
  for (const file of [true, false]) {
    const p = start(other, file)
    const exited = await Promise.race([p.ended.then(code => ({ code })), new Promise<null>(resolve => setTimeout(() => resolve(null), 4000))])
    expect.soft(exited !== null && exited.code !== 0).toBe(true)
    expect.soft(p.output().includes('MOLE_OFFICE_TOOL_CONFIGURATION')).toBe(true)
    expect.soft(p.output().includes(refusalReason(file))).toBe(true)
    expect.soft(await holds(other)).toEqual([])
    safe(p.output())
  }
}, 15000)
