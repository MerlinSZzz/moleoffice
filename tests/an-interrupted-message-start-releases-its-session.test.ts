// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { spawn, type ChildProcess } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { once } from 'node:events'
import type { AddressInfo } from 'node:net'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { aCheckoutForATestRun } from './a-checkout-for-a-test-run.ts'

let t: TestDb, app: FastifyInstance, home: string, api: string, agent: string, starter: string
let resources: typeof import('../src/server/lib/resources.ts')
let worker: typeof import('../src/worker/index.ts')
let delayed: { pid: number; release: () => void } | null = null
let holdProbeGroup = false
let delayedGroup: { pid: number; release: () => void } | null = null
const officeKey = randomBytes(32).toString('hex'), personKey = randomBytes(32).toString('hex')
const headers = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON, 'x-mole-office-key': personKey }
const checkout = aCheckoutForATestRun()

beforeAll(async () => {
  home = mkdtempSync(join(tmpdir(), 'interrupted-start-'))
  process.env.HOME = home
  t = await freshDb()
  writeFileSync(join(dirname(t.file), 'keys.json'), JSON.stringify({ person: personKey, office: officeKey, providers: {} }), { mode: 0o600 })
  app = (await apiApp()).app
  app.addHook('preHandler', async (req) => {
    if (holdProbeGroup && req.method === 'PATCH' && req.url.startsWith('/api/records/')) {
      const body = req.body as { dataPatch?: { extra?: { startupGroup?: unknown } } }
      if (typeof body.dataPatch?.extra?.startupGroup === 'number') {
        await new Promise<void>(resolve => { delayedGroup = { pid: body.dataPatch!.extra!.startupGroup as number, release: resolve } })
      }
    }
    if (req.method !== 'POST' || req.url !== '/api/resources') return
    const body = req.body as { detail?: string; key?: string }
    if (!body.detail?.includes('run answering a message')) return
    await new Promise<void>(resolve => { delayed = { pid: Number(body.key), release: resolve } })
  })
  await app.listen({ host: '127.0.0.1', port: 0 })
  api = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`
  for (const handle of ['interrupted-probe', 'interrupted-registration', 'interrupted-before-probe', 'new-starter']) {
    const r = await app.inject({ method: 'POST', url: '/api/agents/started', headers, payload: { handle, name: handle } })
    expect(r.statusCode, r.body).toBe(201)
  }
  const id = (handle: string) => (t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(handle) as { id: string }).id
  starter = id('new-starter')
  resources = await import('../src/server/lib/resources.ts')
  worker = await import('../src/worker/index.ts')
}, 120_000)

afterAll(async () => { delayed?.release(); await app?.close(); t?.close(); rmSync(home, { recursive: true, force: true }) })

async function until(check: () => boolean, why: string | (() => string)): Promise<void> {
  const end = Date.now() + 15_000
  while (!check() && Date.now() < end) await new Promise(resolve => setTimeout(resolve, 20))
  expect(check(), typeof why === 'function' ? why() : why).toBe(true)
}
function alive(pid: number): boolean { try { process.kill(pid, 0); return true } catch { return false } }
async function ended(child: ChildProcess): Promise<void> { if (child.exitCode === null && child.signalCode === null) await once(child, 'exit') }

for (const phase of ['probe', 'registration'] as const) it.skipIf(process.platform !== 'linux')(`closes a start interrupted during ${phase} only when its processes are gone`, async () => {
  agent = (t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(`interrupted-${phase}`) as { id: string }).id
  const dir = join(home, phase); mkdirSync(dir); const bin = join(dir, 'bin'); mkdirSync(bin)
  const probe = join(dir, 'probe'), mark = join(dir, 'agent'), go = join(dir, 'go')
  const node = join(bin, 'node')
  writeFileSync(node, `#!/bin/sh\nif [ "$1" = "--version" ]; then\n  echo $$ > ${JSON.stringify(probe)}\n  ${phase === 'probe' ? 'exec sleep 30' : 'echo v22.0.0; exit 0'}\nfi\nexec ${JSON.stringify(process.execPath)} "$@"\n`); chmodSync(node, 0o755)
  const agentScript = join(dir, 'agent.mjs')
  writeFileSync(agentScript, `import {writeFileSync} from 'node:fs'; writeFileSync(${JSON.stringify(mark)}, String(process.pid)); setTimeout(() => {}, 30000)\n`)
  const parent = t.api.createRecord({ kind: 'session', workspaceId: 'default', origin: 'fixture', actor: { type: 'agent', id: 'mole-office/the-message-worker' }, title: 'A made-up message worker', data: { state: 'running', runtime: 'worker' } }).id
  const message = t.api.createRecord({ kind: 'message', workspaceId: 'default', origin: 'fixture', actor: { type: 'human', id: THE_PERSON }, title: 'A made-up message', data: { body: 'A made-up message.', to: [{ kind: 'agent', id: agent }] } }).id
  const settings = { api, workspace: 'default', session: parent, stopWithPid: null, checkout, outputRoot: join(dir, 'output'), env: { ...process.env, MOLE_OFFICE_DB: t.file, MOLE_OFFICE_FAKE_RUNTIME: agentScript, PATH: `${bin}:${process.env.PATH}` }, runs: 1, hops: 1 }
  const waiting = { messageId: message, to: { kind: 'agent', id: agent }, handle: `interrupted-${phase}`, runtime: 'codex', model: 'made-up-model', body: 'A made-up message.', sentAt: '2026-11-09 00:00:00', resume: null, hops: 0 }
  const entry = join(dir, 'worker.mjs')
  writeFileSync(entry, `import {existsSync} from 'node:fs'; import {startOne} from ${JSON.stringify(new URL('../src/worker/index.ts', import.meta.url).href)}; while (!existsSync(${JSON.stringify(go)})) await new Promise(r=>setTimeout(r,20)); const r=await startOne(${JSON.stringify(waiting)}, ${JSON.stringify(settings)}, []); console.error(JSON.stringify(r));\n`)
  const child = spawn(process.execPath, ['--import', 'tsx', entry], { cwd: new URL('..', import.meta.url).pathname, detached: true, stdio: ['ignore', 'pipe', 'pipe'] })
  let errors = ''; child.stderr!.on('data', chunk => { errors += chunk })
  let extraPid = 0
  try {
    expect(child.pid).toBeTruthy()
    resources.registerResource({ workspaceId: 'default', sessionRecordId: parent, type: 'process', key: String(child.pid), actor: { type: 'human', id: THE_PERSON }, startedByTheProduct: true })
    writeFileSync(go, 'go')
    await until(() => phase === 'probe' ? existsSync(probe) : delayed !== null, () => `The ${phase} stand-in did not start: ${errors}`)
    const rows = t.client.sqlite.prepare("SELECT id FROM records WHERE kind='session' AND json_extract(data, '$.deliveringMessage')=?").all(message) as { id: string }[]
    expect(rows).toHaveLength(1); const session = rows[0]!.id
    const change = await app.inject({ method: 'POST', url: `/api/agents/${agent}/starter`, headers, payload: { to: starter, because: 'A made-up reason' } })
    expect(change.statusCode, change.body).toBe(200)
    expect(change.json().change.state).toBe('waiting')
    extraPid = phase === 'probe' ? Number(readFileSync(probe, 'utf8')) : delayed!.pid
    if (phase === 'registration') {
      await new Promise(resolve => setTimeout(resolve, 1000))
      process.kill(extraPid, 'SIGSTOP')
    }
    process.kill(child.pid!, 'SIGKILL'); await ended(child)
    expect(alive(child.pid!), 'The worker process was left behind').toBe(false)
    if (phase === 'probe') {
      expect(alive(extraPid)).toBe(true)
      await worker.pickUpRunsAlreadyGoing(settings, [])
      expect(t.api.getRecord(session)!.data.state).toBe('running')
      const group = (t.api.getRecord(session)!.data.extra as { startupGroup: number }).startupGroup
      expect(String(t.api.getRecord(session)!.data.doing)).toMatch(new RegExp(`group ${group}.*[1-9]\\d* process.*since`))
      expect(existsSync(mark), 'Agent code must not run before registration').toBe(false)
      process.kill(extraPid, 'SIGKILL')
    } else {
      expect(alive(extraPid)).toBe(true)
      await worker.pickUpRunsAlreadyGoing(settings, [])
      expect(t.api.getRecord(session)!.data.state).toBe('running')
      expect(String(t.api.getRecord(session)!.data.doing)).toMatch(new RegExp(`group ${extraPid}.*[1-9]\\d* process.*since`))
      expect(existsSync(mark), 'Agent code must not run before registration').toBe(false)
      process.kill(extraPid, 'SIGKILL')
    }
    await until(() => !alive(extraPid), 'The recorded stand-in process did not end')
    // A partial process-table scan cannot prove a group empty. Exercise both a successful
    // liveness check with an empty scan and errors from the liveness and enumeration readers.
    const recordedGroup = (t.api.getRecord(session)!.data.extra as { startupGroup: number }).startupGroup
    const probeReader = resources.osProbe()
    const readGroup = vi.spyOn(probeReader, 'processesInGroup').mockReturnValue([])
    const originalKill = process.kill.bind(process)
    const checkGroup = vi.spyOn(process, 'kill').mockImplementation((pid, signal) => {
      if (pid === -recordedGroup && signal === 0) return true
      return originalKill(pid, signal)
    })
    try {
      for (const failure of [null, 'EPERM', 'EIO'] as const) {
        checkGroup.mockImplementation((pid, signal) => {
          if (pid !== -recordedGroup || signal !== 0) return originalKill(pid, signal)
          if (failure !== null) throw Object.assign(new Error(failure), { code: failure })
          return true
        })
        if (failure === 'EIO') readGroup.mockImplementation(() => { throw new Error('unreadable process table') })
        await worker.pickUpRunsAlreadyGoing(settings, [])
        expect(t.api.getRecord(session)!.data.state).toBe('running')
        expect(String(t.api.getRecord(session)!.data.doing)).toMatch(new RegExp(`group ${recordedGroup}.*(unknown|unavailable).*since`, 'i'))
      }
    } finally {
      checkGroup.mockRestore()
      readGroup.mockRestore()
    }
    await worker.pickUpRunsAlreadyGoing(settings, [])
    expect(t.api.getRecord(session)!.data.state, 'A dead interrupted start must be closed by recovery').toBe('crashed')
    expect(String(t.api.getRecord(session)!.data.doing)).toMatch(/interrupt|ended/i)
    expect((t.client.sqlite.prepare('SELECT state FROM agent_starter_changes WHERE agent_id = ? ORDER BY asked_at DESC LIMIT 1').get(agent) as { state: string }).state).not.toBe('waiting')
    expect(existsSync(mark), 'Agent code must not run before registration').toBe(false)
  } finally {
    if (child.pid && alive(child.pid)) { process.kill(child.pid, 'SIGKILL'); await ended(child) }
    if (!extraPid && delayed) extraPid = delayed.pid
    if (extraPid && alive(extraPid)) { process.kill(extraPid, 'SIGKILL'); await until(() => !alive(extraPid), 'The recorded stand-in process was left behind') }
    delayed?.release(); delayed = null
  }
}, 60_000)


it.skipIf(process.platform !== 'linux')('keeps an unregistered gate until it ends without running the probe', async () => {
  const made = Reflect.get(await import('../src/worker/runtimes/os.ts'), 'theGatedProgramThatRan')
  expect(typeof made, 'The version gate is missing').toBe('function')
  agent = (t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get('interrupted-before-probe') as { id: string }).id
  const dir = join(home, 'before-probe'); mkdirSync(dir); const bin = join(dir, 'bin'); mkdirSync(bin)
  const probe = join(dir, 'probe'), mark = join(dir, 'agent'), go = join(dir, 'go')
  const node = join(bin, 'node')
  writeFileSync(node, `#!/bin/sh\nif [ "$1" = "--version" ]; then echo yes > ${JSON.stringify(probe)}; exit 0; fi\nexec ${JSON.stringify(process.execPath)} "$@"\n`); chmodSync(node, 0o755)
  const agentScript = join(dir, 'agent.mjs')
  writeFileSync(agentScript, `import {writeFileSync} from 'node:fs'; writeFileSync(${JSON.stringify(mark)}, 'ran')\n`)
  const parent = t.api.createRecord({ kind: 'session', workspaceId: 'default', origin: 'fixture', actor: { type: 'agent', id: 'mole-office/the-message-worker' }, title: 'A made-up message worker', data: { state: 'running', runtime: 'worker' } }).id
  const message = t.api.createRecord({ kind: 'message', workspaceId: 'default', origin: 'fixture', actor: { type: 'human', id: THE_PERSON }, title: 'A made-up message', data: { body: 'A made-up message.', to: [{ kind: 'agent', id: agent }] } }).id
  const settings = { api, workspace: 'default', session: parent, stopWithPid: null, checkout, outputRoot: join(dir, 'output'), env: { ...process.env, MOLE_OFFICE_DB: t.file, MOLE_OFFICE_FAKE_RUNTIME: agentScript, PATH: `${bin}:${process.env.PATH}` }, runs: 1, hops: 1 }
  const waiting = { messageId: message, to: { kind: 'agent', id: agent }, handle: 'interrupted-before-probe', runtime: 'codex', model: 'made-up-model', body: 'A made-up message.', sentAt: '2026-11-09 00:00:00', resume: null, hops: 0 }
  const entry = join(dir, 'worker.mjs')
  writeFileSync(entry, `import {existsSync} from 'node:fs'; import {startOne} from ${JSON.stringify(new URL('../src/worker/index.ts', import.meta.url).href)}; while (!existsSync(${JSON.stringify(go)})) await new Promise(r=>setTimeout(r,20)); await startOne(${JSON.stringify(waiting)}, ${JSON.stringify(settings)}, []);\n`)
  const child = spawn(process.execPath, ['--import', 'tsx', entry], { cwd: new URL('..', import.meta.url).pathname, detached: true, stdio: ['ignore', 'pipe', 'pipe'] })
  let gate = 0
  try {
    resources.registerResource({ workspaceId: 'default', sessionRecordId: parent, type: 'process', key: String(child.pid), actor: { type: 'human', id: THE_PERSON }, startedByTheProduct: true })
    holdProbeGroup = true; writeFileSync(go, 'go')
    await until(() => delayedGroup !== null, 'The version gate did not reach its group registration')
    gate = delayedGroup!.pid
    const rows = t.client.sqlite.prepare("SELECT id FROM records WHERE kind='session' AND json_extract(data, '$.deliveringMessage')=?").all(message) as { id: string }[]
    expect(rows).toHaveLength(1); const session = rows[0]!.id
    const change = await app.inject({ method: 'POST', url: `/api/agents/${agent}/starter`, headers, payload: { to: starter, because: 'A made-up reason' } })
    expect(change.statusCode, change.body).toBe(200); expect(change.json().change.state).toBe('waiting')
    process.kill(gate, 'SIGSTOP'); process.kill(child.pid!, 'SIGKILL'); await ended(child)
    expect(alive(gate)).toBe(true)
    await worker.pickUpRunsAlreadyGoing(settings, [])
    expect(t.api.getRecord(session)!.data.state).toBe('running')
    expect(existsSync(probe), 'The probe must not run before its group is recorded').toBe(false)
    expect(existsSync(mark)).toBe(false)
    process.kill(gate, 'SIGKILL'); await until(() => !alive(gate), 'The recorded gate did not end')
    const setGroup = (value: number | null) => t.client.sqlite.prepare("UPDATE records SET data = json_set(data, '$.extra.startupGroup', ?) WHERE id = ?").run(value, session)
    setGroup(gate)
    await worker.pickUpRunsAlreadyGoing(settings, [])
    expect(t.api.getRecord(session)!.data.state, 'An empty recorded group no longer holds the session').toBe('crashed')
    expect((t.client.sqlite.prepare('SELECT state FROM agent_starter_changes WHERE agent_id = ? ORDER BY asked_at DESC LIMIT 1').get(agent) as { state: string }).state).not.toBe('waiting')
    expect(existsSync(probe)).toBe(false); expect(existsSync(mark)).toBe(false)
  } finally {
    holdProbeGroup = false; delayedGroup?.release(); delayedGroup = null
    if (child.pid && alive(child.pid)) { process.kill(child.pid, 'SIGKILL'); await ended(child) }
    if (gate && alive(gate)) { process.kill(gate, 'SIGKILL'); await until(() => !alive(gate), 'The recorded gate was left behind') }
  }
}, 60_000)
