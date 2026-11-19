// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** The end door checks the caller, the recorded command end, and every process before closing a run. */
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { SESSION_STATES } from '../src/shared/types.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

type Resources = typeof import('../src/server/lib/resources.ts')
type Probe = Resources['LINUX_PROBE']
type Process = NonNullable<ReturnType<Probe['processById']>>
const [RUNNING, , , CRASHED] = SESSION_STATES
let t: TestDb
let app: FastifyInstance
let resources: Resources
let starterKey: string
let workerKey: string
let strangerKey: string
let secretaryKey: string
const processes = new Map<number, Process>()
let nextPid = 4_721_001
const person = { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const as = (id: string, key: string, session?: string) => ({ 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': id, 'x-mole-office-key': key, ...(session === undefined ? {} : { 'x-mole-office-session': session }) })
async function ask(method: 'GET' | 'POST' | 'PATCH', url: string, headers: Record<string, string>, payload?: unknown) {
  const reply = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as never }) })
  return { status: reply.statusCode, body: reply.json() as Record<string, any> }
}
async function register(handle: string, by: Record<string, string>, role?: string): Promise<string> {
  const answer = await ask('POST', '/api/agents/started', by, { handle, name: handle, runtime: 'claude-code', ...(role === undefined ? {} : { role }) })
  expect(answer.status).toBe(201)
  expect(answer.body.whatToGiveIt?.key).toEqual(expect.any(String))
  return answer.body.whatToGiveIt.key as string
}
const starter = () => as('end-starter', starterKey)
const agentId = (handle: string): string => (t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ? AND retired = 0').get(handle) as { id: string }).id
const probe = (): Probe => ({ ...resources.LINUX_PROBE, platform: 'stand-in', processById: (pid) => processes.get(pid) ?? null, processesInGroup: (pgid) => [...processes.values()].filter((one) => one.pgid === pgid), processTable: () => ({ ok: true, processes: [...processes.values()].map((one) => ({ pid: one.pid, command: one.command, cwd: null })) }) })
interface Run { id: string; key: string; pid: number; row: string }
async function makeRun(ended = true): Promise<Run> {
  const filed = await ask('POST', '/api/records', starter(), { kind: 'session', title: 'A synthetic worker run', data: { state: RUNNING, runtime: 'claude-code', servingAgent: 'end-worker', servingAgentId: agentId('end-worker'), doing: 'The worker was checking its work.' } })
  expect(filed.status, String(filed.body.error)).toBe(201)
  const id = filed.body.record.id as string
  const key = filed.body.runKey.key as string
  const sandbox = await ask('PATCH', `/api/records/${id}`, person, { dataPatch: { sandbox: { template: 'test-template', container: 'test-row', folder: '/synthetic' } } })
  expect(sandbox.status, String(sandbox.body.error)).toBe(200)
  const at = (t.client.sqlite.prepare('SELECT created_at AS at FROM records WHERE id = ?').get(id) as { at: string }).at
  const pid = nextPid++
  processes.set(pid, { pid, pgid: pid, ppid: 1, command: 'synthetic worker', startedAt: at })
  const row = await ask('POST', '/api/resources', person, { sessionRecordId: id, type: 'process', key: String(pid), startedByTheProduct: true })
  expect(row.status).toBe(201)
  if (ended) {
    const written = await ask('PATCH', `/api/records/${id}`, as('end-worker', key, id), { dataPatch: { commandEnded: { at, code: 0 }, detail: 'Synthetic refusal from the finish door.' } })
    expect(written.status).toBe(200)
    const until = Date.now() + 20_000
    while (Date.now() < until) {
      const account = JSON.parse(data(id)).howTheRoundEnded as { reasons?: { why?: string }[] } | undefined
      if (account !== undefined && !account.reasons?.some((reason) => reason.why === 'git-being-read')) break
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
  }
  return { id, key, pid, row: row.body.resource.id as string }
}
const close = (run: Run, headers = starter()) => ask('POST', `/api/runs/${run.id}/closed-after-its-end`, headers, { why: 'The command has stopped.' })
const data = (id: string): string => (t.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(id) as { data: string }).data
const messages = (id: string): number => (t.client.sqlite.prepare("SELECT COUNT(*) AS n FROM records WHERE kind = 'message' AND deleted_at IS NULL AND json_extract(data, '$.aboutRun') = ?").get(id) as { n: number }).n
const keyWorks = async (run: Run): Promise<boolean> => (await ask('GET', '/api/messages/notice-rules', as('end-worker', run.key, run.id))).status === 200
async function theStopDoorsLastSentence(run: Run): Promise<string> {
  const answer = await ask('POST', `/api/runtime/runs/${run.id}/stop`, as('end-stranger', strangerKey), { why: 'Synthetic reason.' })
  expect(answer.status).toBe(403)
  return String(answer.body.error).split(/(?<=\.)\s+/).at(-1)!
}
beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  resources = await import('../src/server/lib/resources.ts')
  starterKey = await register('end-starter', person, 'supervisor')
  workerKey = await register('end-worker', starter())
  strangerKey = await register('end-stranger', person, 'supervisor')
  secretaryKey = await register('end-secretary', person, 'secretary')
}, 60_000)
beforeEach(() => { processes.clear(); resources.useOsProbe(probe()) })
afterEach(() => resources.useOsProbe(resources.LINUX_PROBE))
afterAll(async () => { await app.close(); t.close() })

describe('closing a run after its command ended', () => {
  it('lets its starter close the ended run, revokes its key, and does not tell the starter twice', async () => {
    const run = await makeRun()
    processes.delete(run.pid)
    expect((await ask('POST', `/api/resources/${run.row}/release`, person, { note: 'The synthetic command ended.' })).status).toBe(200)
    const before = JSON.parse(data(run.id)) as Record<string, any>
    const told = messages(run.id)
    expect(told).toBeGreaterThan(0)
    expect(await keyWorks(run)).toBe(true)
    const answer = await close(run)
    expect(answer.status).toBe(200)
    const after = JSON.parse(data(run.id)) as Record<string, any>
    expect(after.state).toBe(CRASHED)
    expect(after.doing).toContain('end-starter')
    expect(after.doing).toContain('The command has stopped')
    expect(after.doing).toContain(before.doing)
    expect(after.doing).toContain(before.commandEnded.at)
    expect(after.detail).toBe(before.detail)
    expect(after.howTheRoundEnded).toEqual(before.howTheRoundEnded)
    expect(await keyWorks(run)).toBe(false)
    expect(messages(run.id)).toBe(told)
  })
  it('refuses a real live child and writes nothing', async () => {
    const run = await makeRun()
    processes.delete(run.pid)
    resources.useOsProbe(resources.LINUX_PROBE)
    const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { detached: true, stdio: 'ignore' })
    try {
      await once(child, 'spawn')
      const pid = child.pid!
      const row = await ask('POST', '/api/resources', person, { sessionRecordId: run.id, type: 'process', key: String(pid), startedByTheProduct: true })
      expect(row.status).toBe(201)
      const before = data(run.id)
      const answer = await close(run)
      expect(answer.status).toBe(409)
      expect(String(answer.body.error).endsWith(await theStopDoorsLastSentence(run))).toBe(true)
      expect(data(run.id)).toBe(before)
      expect(await keyWorks(run)).toBe(true)
    } finally {
      if (child.pid !== undefined) { try { process.kill(-child.pid, 'SIGTERM') } catch {} }
      if (child.exitCode === null && child.signalCode === null) await once(child, 'exit')
    }
  }, 30_000)
  it('refuses when no command end was recorded', async () => {
    const run = await makeRun(false)
    processes.delete(run.pid)
    const before = data(run.id)
    const answer = await close(run)
    expect(answer.status).toBe(409)
    expect(String(answer.body.error).endsWith(await theStopDoorsLastSentence(run))).toBe(true)
    expect(data(run.id)).toBe(before)
    expect(await keyWorks(run)).toBe(true)
  })
  it('refuses a stranger and the run’s own agent', async () => {
    const run = await makeRun()
    processes.delete(run.pid)
    const before = data(run.id)
    for (const headers of [as('end-stranger', strangerKey), as('end-worker', workerKey), as('end-worker', run.key, run.id)]) {
      const answer = await close(run, headers)
      expect(answer.status).toBe(403)
      expect(String(answer.body.error).endsWith(await theStopDoorsLastSentence(run))).toBe(true)
      expect(data(run.id)).toBe(before)
    }
    expect(await keyWorks(run)).toBe(true)
  })
  it('lets a secretary close the run', async () => {
    const run = await makeRun()
    processes.delete(run.pid)
    const answer = await close(run, as('end-secretary', secretaryKey))
    expect(answer.status).toBe(200)
    expect(JSON.parse(data(run.id)).state).toBe(CRASHED)
    expect(await keyWorks(run)).toBe(false)
  })
  it('refuses a run that is already over', async () => {
    const run = await makeRun()
    processes.delete(run.pid)
    expect((await close(run)).status).toBe(200)
    const before = data(run.id)
    const answer = await close(run)
    expect(answer.status).toBe(409)
    expect(String(answer.body.error)).toContain(JSON.parse(before).state)
    expect(String(answer.body.error).endsWith(await theStopDoorsLastSentence(run))).toBe(true)
    expect(data(run.id)).toBe(before)
  })
  it('does not create a missing account or tell the starter again', async () => {
    const run = await makeRun()
    processes.delete(run.pid)
    t.client.sqlite.prepare("UPDATE records SET data = json_remove(data, '$.howTheRoundEnded') WHERE id = ?").run(run.id)
    const before = JSON.parse(data(run.id)) as Record<string, unknown>
    const told = messages(run.id)
    expect(before.howTheRoundEnded).toBeUndefined()
    expect((await close(run)).status).toBe(200)
    const after = JSON.parse(data(run.id)) as Record<string, unknown>
    expect(after.howTheRoundEnded).toBeUndefined()
    expect(after.detail).toBe(before.detail)
    expect(messages(run.id)).toBe(told)
  })
  it('refuses an unreadable process group without writing', async () => {
    const run = await makeRun()
    processes.delete(run.pid)
    resources.useOsProbe({ ...probe(), processesInGroup: () => { throw new Error('Synthetic process table unavailable.') } })
    const before = data(run.id)
    const reading = await ask('GET', `/api/runs/${run.id}/process-ended`, starter())
    expect(reading.status).toBe(200)
    expect(reading.body.ended).toBe(false)
    const answer = await close(run)
    expect(answer.status).toBe(409)
    expect(data(run.id)).toBe(before)
    expect(await keyWorks(run)).toBe(true)
  })
  it('refuses a record that is not a run', async () => {
    const made = await ask('POST', '/api/records', starter(), { kind: 'note', title: 'A synthetic note', data: { body: 'A synthetic note.' } })
    expect(made.status).toBe(201)
    const note = made.body.record.id as string
    const answer = await ask('POST', `/api/runs/${note}/closed-after-its-end`, starter(), { why: 'Synthetic reason.' })
    expect(answer.status).toBe(404)
  })
  it('does not guess that a group ended when its row has no start time', async () => {
    const run = await makeRun()
    processes.delete(run.pid)
    t.client.sqlite.prepare('UPDATE session_resources SET os_started_at = NULL WHERE id = ?').run(run.row)
    const before = data(run.id)
    const reading = await ask('GET', `/api/runs/${run.id}/process-ended`, starter())
    expect(reading.status).toBe(200)
    expect(reading.body.ended).toBe(false)
    expect((await close(run)).status).toBe(409)
    expect(data(run.id)).toBe(before)
    expect(await keyWorks(run)).toBe(true)
  })
  it('refuses when the group leader ended but a member remains', async () => {
    const run = await makeRun()
    const leader = processes.get(run.pid)!
    processes.delete(run.pid)
    processes.set(run.pid + 100_000, { ...leader, pid: run.pid + 100_000, pgid: run.pid })
    const before = data(run.id)
    const reading = await ask('GET', `/api/runs/${run.id}/process-ended`, starter())
    expect(reading.status).toBe(200)
    expect(reading.body.ended).toBe(false)
    expect(String(reading.body.says)).toContain(String(run.pid))
    const answer = await close(run)
    expect(answer.status).toBe(409)
    expect(data(run.id)).toBe(before)
    expect(await keyWorks(run)).toBe(true)
  })
})
