// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import type { AddressInfo } from 'node:net'
import { randomBytes } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import { theWordsNamingTheFolder } from '../src/config/sandbox-folder.mjs'
import { THE_PERSON } from '../src/shared/person.ts'
import { localStamp } from '../src/shared/time.ts'
import { onePass, type WatchingARound, type WorkerSettings } from '../src/worker/index.ts'
import { RoundAdapter } from '../src/worker/runtimes/round.ts'
import { aCheckoutForATestRun } from './a-checkout-for-a-test-run.ts'
import { aMadeUpSandboxRepo } from './a-made-up-sandbox-repo.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const source = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '')
const officeKey = randomBytes(32).toString('hex')
const personKey = randomBytes(32).toString('hex')
const remoteProject = 'orchard-test-project'
const starterName = 'orchard-test-starter'
const agentName = 'orchard-test-builder'
let workerName: string
let heldBy: { office: string; worker: string }
let t: TestDb
let app: FastifyInstance
let scratch: string
let checkout: string
let settings: WorkerSettings
let agentId: string
let starterId: string
let run: string
let brief: string
let previousMode: string | undefined
const headers = (workspace: string, actor: string, key?: string) => ({
  'content-type': 'application/json', 'x-mole-office-workspace': workspace,
  'x-mole-office-actor-type': actor === THE_PERSON ? 'human' : 'agent',
  'x-mole-office-actor-id': actor, ...(key === undefined ? {} : { 'x-mole-office-key': key }),
})
async function call(method: 'GET' | 'POST', url: string, workspace: string, actor: string, payload?: unknown, key?: string) {
  const r = await app.inject({ method, url, headers: headers(workspace, actor, key), ...(payload === undefined ? {} : { payload: payload as object }) })
  return { status: r.statusCode, body: JSON.parse(r.body) as Record<string, any> }
}
const next = () => JSON.parse((t.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(run) as { data: string }).data).nextRound

beforeAll(async () => {
  previousMode = process.env['MOLE_OFFICE_MESSAGE_WORKER']
  process.env['MOLE_OFFICE_MESSAGE_WORKER'] = 'on'
  t = await freshDb()
  workerName = (await import('../src/shared/the-worker-actor.ts')).THE_WORKER.id
  heldBy = (await import('../src/shared/next-round.ts')).NEXT_ROUND_HELD_BY
  writeFileSync(join(dirname(t.file), 'keys.json'), JSON.stringify({ person: personKey, office: officeKey, providers: {} }), { mode: 0o600 })
  app = (await apiApp()).app
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  const api = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`
  scratch = mkdtempSync(join(tmpdir(), 'round-project-test-'))
  checkout = aCheckoutForATestRun()
  expect((await call('POST', '/api/workspaces', 'default', THE_PERSON, { id: remoteProject, title: 'A made-up project' })).status).toBe(201)
  const starter = await call('POST', '/api/agents/started', remoteProject, THE_PERSON, { handle: starterName, name: starterName, runtime: 'claude-code' })
  expect(starter.status).toBe(201)
  starterId = starter.body.agent.id
  const child = await call('POST', '/api/agents/started', remoteProject, starterName, { handle: agentName, name: agentName, runtime: 'claude-code' }, starter.body.whatToGiveIt.key)
  expect(child.status).toBe(201)
  agentId = child.body.agent.id
  const folder = join(realpathSync(scratch), 'sandboxes', 'orchard-box')
  mkdirSync(folder, { recursive: true })
  brief = join(folder, 'brief.md')
  writeFileSync(brief, '# A made-up assignment\n')
  aMadeUpSandboxRepo(folder, source)
  const container = `synthetic-${randomBytes(5).toString('hex')}`
  t.client.sqlite.prepare("INSERT INTO session_resources (id, workspace_id, session_record_id, type, key, detail, registered_at, registered_by) VALUES (?, ?, 'fixture', 'container', ?, ?, '2026-01-01 00:00:00', 'agent:fixture')")
    .run(container, remoteProject, 'mole-office-sandbox-orchard-box', `Sandbox orchard-box, from the template mole-office-dev; ${theWordsNamingTheFolder(folder)} Started by node tools/sandbox.mjs up.`)
  run = t.api.createRecord({ kind: 'session', workspaceId: remoteProject, origin: 'fixture', actor: { type: 'agent', id: starterId }, title: 'A made-up earlier run', data: {
    state: 'running', servingAgent: agentName, servingAgentId: agentId, runtime: 'claude-code', model: 'synthetic-model', workingDirectory: join(folder, 'repo'),
    cutFrom: 'main', sandbox: { template: 'mole-office-dev', container, folder },
  } }).id
  const asked = await call('POST', `/api/agents/${agentId}/next-round`, remoteProject, THE_PERSON, { brief })
  expect(asked.status, JSON.stringify(asked.body)).toBe(202)
  const launcher = join(scratch, 'launcher.mjs')
  writeFileSync(launcher, `
import { writeFileSync } from 'node:fs'
import { fileARun } from ${JSON.stringify(join(source, 'tools/file-a-run.mjs'))}
import { anAgentsToolHeaders } from ${JSON.stringify(join(source, 'for-agents/agent-key.mjs'))}
const argv = process.argv.slice(2)
const flag = (name) => argv[argv.indexOf(name) + 1]
writeFileSync(${JSON.stringify(join(scratch, 'arguments.json'))}, JSON.stringify(argv))
const api = flag('--api'), workspace = flag('--workspace'), as = flag('--as')
const headers = { 'x-mole-office-workspace': workspace, ...anAgentsToolHeaders({ self: as, withoutAKey: as }) }
const previous = (await (await fetch(api + '/api/records/' + flag('--continues'), { headers })).json()).record
const filed = fileARun({ api, workspace, as, session: flag('--session'), handle: flag('--agent'),
  worktree: previous.data.workingDirectory, cutFrom: previous.data.cutFrom, runtime: flag('--runtime'),
  model: flag('--model'), title: 'A synthetic continuation', sandbox: previous.data.sandbox, continues: previous.id })
if (!filed.ok) { process.stderr.write(filed.says); process.exit(1) }
`)

  settings = { api, workspace: 'default', session: null, stopWithPid: null, checkout, runs: 2, hops: 3, outputRoot: join(scratch, 'runs'), env: {
    ...process.env, HOME: scratch, MOLE_OFFICE_DB: t.file, MOLE_OFFICE_FAKE_ROUND_LAUNCHER: launcher,
  } }
}, 60_000)

afterAll(async () => {
  if (previousMode === undefined) delete process.env['MOLE_OFFICE_MESSAGE_WORKER']
  else process.env['MOLE_OFFICE_MESSAGE_WORKER'] = previousMode
  await app?.close()
  t?.close()
  if (scratch !== undefined) rmSync(scratch, { recursive: true, force: true })
  if (checkout !== undefined) rmSync(checkout, { recursive: true, force: true })
})

it('records distinct reasons for an unreadable agent, a missing registry entry and no starter', async () => {
  const row = t.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(run) as { data: string }
  const agentRow = t.client.sqlite.prepare('SELECT started_by_kind, started_by_id FROM agents WHERE id = ?').get(agentId) as { started_by_kind: string | null; started_by_id: string | null }
  const update = (change: (data: Record<string, any>) => void) => {
    const data = JSON.parse(row.data)
    change(data)
    t.client.sqlite.prepare('UPDATE records SET data = ? WHERE id = ?').run(JSON.stringify(data), run)
  }
  try {
    update((data) => { delete data.servingAgent; delete data.servingAgentId })
    await call('GET', '/api/worker/rounds', 'default', workerName, undefined, officeKey)
    const unreadable = next().held.says
    expect(unreadable).toContain(run)
    const missing = 'synthetic-unregistered-id'
    update((data) => { data.servingAgentId = missing; data.servingAgent = 'synthetic-unregistered-agent' })
    await call('GET', '/api/worker/rounds', 'default', workerName, undefined, officeKey)
    const unregistered = next().held.says
    expect(unregistered).toContain(missing)
    expect(unregistered).not.toBe(unreadable)
    update(() => {})
    t.client.sqlite.prepare('UPDATE agents SET started_by_kind = NULL, started_by_id = NULL WHERE id = ?').run(agentId)
    await call('GET', '/api/worker/rounds', 'default', workerName, undefined, officeKey)
    const noStarter = next().held.says
    expect(noStarter).toContain(agentName)
    expect(noStarter).not.toBe(unregistered)
  } finally {
    t.client.sqlite.prepare('UPDATE agents SET started_by_kind = ?, started_by_id = ? WHERE id = ?').run(agentRow.started_by_kind, agentRow.started_by_id, agentId)
    t.client.sqlite.prepare('UPDATE records SET data = ? WHERE id = ?').run(row.data, run)
  }
})

it('records the reason while another run serves the agent, without another revision for the same reason', async () => {
  const running = t.api.createRecord({ kind: 'session', workspaceId: remoteProject, origin: 'fixture', actor: { type: 'agent', id: starterId }, title: 'Another made-up run', data: {
    state: 'running', servingAgent: agentName, servingAgentId: agentId, runtime: 'claude-code',
  } }).id
  await call('POST', `/api/worker/rounds/${run}/held`, remoteProject, workerName, { because: 'A temporary synthetic hold.' }, officeKey)
  const process = await call('POST', '/api/resources', remoteProject, THE_PERSON, { sessionRecordId: running, type: 'process', key: String(globalThis.process.pid), detail: 'This test process stands for the run', adopting: 'The test represents a running agent.' })
  expect(process.status, JSON.stringify(process.body)).toBe(201)
  try {
    const first = await call('GET', '/api/worker/rounds', 'default', workerName, undefined, officeKey)
    expect(first.status).toBe(200)
    expect(first.body.rounds.some((row: { run: string }) => row.run === run)).toBe(false)
    const heldRow = t.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(run) as { data: string }
    const aged = JSON.parse(heldRow.data)
    aged.nextRound.held.since = localStamp(new Date(Date.now() - 60_000))
    t.client.sqlite.prepare('UPDATE records SET data = ? WHERE id = ?').run(JSON.stringify(aged), run)
    const held = next().held
    expect(held.says).toContain(running)
    expect(held.by).toBe(heldBy.office)
    const changes = async () => (await call('GET', `/api/records/${run}/revisions`, remoteProject, THE_PERSON)).body.revisions.length
    const before = await changes()
    await call('GET', '/api/worker/rounds', 'default', workerName, undefined, officeKey)
    expect(next().held).toEqual(held)
    expect(await changes()).toBe(before)
  } finally {
    t.client.sqlite.prepare('DELETE FROM session_resources WHERE id = ?').run(process.body.resource.id)
  }
})

it('records a repair held for its entry to land', async () => {
  const row = t.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(run) as { data: string }
  const entry = t.api.createRecord({ kind: 'note', workspaceId: remoteProject, origin: 'fixture', actor: t.api.HUMAN,
    title: 'A synthetic pending entry', data: {} }).id
  t.client.sqlite.prepare("UPDATE records SET kind = 'merge_entry', data = ? WHERE id = ?").run(JSON.stringify({ state: 'queued' }), entry)
  try {
    const data = JSON.parse(row.data)
    data.nextRound.repair = { entry, dueAt: new Date(Date.now() + 60_000).toISOString() }
    t.client.sqlite.prepare('UPDATE records SET data = ? WHERE id = ?').run(JSON.stringify(data), run)
    await call('GET', '/api/worker/rounds', 'default', workerName, undefined, officeKey)
    expect(next().held.says).toContain(entry)
  } finally {
    t.client.sqlite.prepare('UPDATE records SET data = ? WHERE id = ?').run(row.data, run)
  }
})

it('keeps the bounded process wait separate from an earlier worker hold', async () => {
  const row = t.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(run) as { data: string }
  const data = JSON.parse(row.data)
  data.state = 'finished'
  t.client.sqlite.prepare('UPDATE records SET data = ? WHERE id = ?').run(JSON.stringify(data), run)
  const held = await call('POST', `/api/worker/rounds/${run}/held`, remoteProject, workerName, { because: 'A synthetic earlier hold.' }, officeKey)
  expect(held.status).toBe(200)
  const process = await call('POST', '/api/resources', remoteProject, THE_PERSON, { sessionRecordId: run, type: 'process', key: String(globalThis.process.pid), detail: 'This test process stands for the finished run', adopting: 'This test represents a lingering process.' })
  expect(process.status).toBe(201)
  try {
    await call('GET', '/api/worker/rounds', 'default', workerName, undefined, officeKey)
    expect(next().waits.says).toContain(String(globalThis.process.pid))
    expect(next().held).toBeUndefined()
  } finally {
    t.client.sqlite.prepare('DELETE FROM session_resources WHERE id = ?').run(process.body.resource.id)
    t.client.sqlite.prepare('UPDATE records SET data = ? WHERE id = ?').run(row.data, run)
  }
})

it('clears an obsolete office hold and preserves a worker hold until starting', async () => {
  const listed = await call('GET', '/api/worker/rounds', 'default', workerName, undefined, officeKey)
  expect(listed.body.rounds.some((row: { run: string }) => row.run === run)).toBe(true)
  expect(next().held).toBeUndefined()
  const reason = 'A synthetic launcher was unavailable for this test.'
  const held = await call('POST', `/api/worker/rounds/${run}/held`, remoteProject, workerName, { because: reason }, officeKey)
  expect(held.status).toBe(200)
  expect(next().held).toMatchObject({ by: heldBy.worker, says: reason })
  const before = next().held
  await call('GET', '/api/worker/rounds', 'default', workerName, undefined, officeKey)
  expect(next().held).toEqual(before)
})

it('refuses a caller without the office key equally for existing and missing runs', async () => {
  const found = await call('POST', `/api/worker/rounds/${run}/held`, remoteProject, THE_PERSON, { because: 'A synthetic reason.' })
  const missing = await call('POST', '/api/worker/rounds/no-such-run/held', remoteProject, THE_PERSON, { because: 'A synthetic reason.' })
  expect(found.status).toBe(403)
  expect(missing.status).toBe(403)
  expect(missing.body.error).toBe(found.body.error)
})

it('checks the project and the reason without writing a hold', async () => {
  const before = next().held
  const crossed = await call('POST', `/api/worker/rounds/${run}/held`, 'default', workerName, { because: 'A synthetic hold.' }, officeKey)
  expect(crossed.status).toBe(404)
  for (const payload of [{}, { because: '' }, { because: 'x'.repeat(2001) }, { because: 'A hold.', extra: true }]) {
    const response = await call('POST', `/api/worker/rounds/${run}/held`, remoteProject, workerName, payload, officeKey)
    expect(response.status).toBe(400)
  }
  expect(next().held).toEqual(before)
})

it('refuses a worker hold when the ask is no longer wanted', async () => {
  const row = t.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(run) as { data: string }
  try {
    for (const state of ['failed', 'starting', 'started']) {
      const data = JSON.parse(row.data)
      data.nextRound.state = state
      t.client.sqlite.prepare('UPDATE records SET data = ? WHERE id = ?').run(JSON.stringify(data), run)
      const response = await call('POST', `/api/worker/rounds/${run}/held`, remoteProject, workerName, { because: 'A synthetic reason.' }, officeKey)
      expect(response.status).toBe(409)
      expect(response.body.error).toContain(state)
    }
  } finally {
    t.client.sqlite.prepare('UPDATE records SET data = ? WHERE id = ?').run(row.data, run)
  }
})

it('applies the supervisor cap once to rounds in different projects', async () => {
  const capName = 'MOLE_OFFICE_CLAUDE_SUPERVISORS_AT_ONCE'
  const previous = process.env[capName]
  process.env[capName] = '1'
  const created: string[] = []
  try {
    for (const [workspace, handle] of [['default', 'orchard-cap-a'], [remoteProject, 'orchard-cap-b']]) {
      const registered = await call('POST', '/api/agents/started', workspace!, THE_PERSON, { handle, name: handle, role: 'supervisor', runtime: 'claude-code' })
      expect(registered.status).toBe(201)
      const agent = registered.body.agent.id as string
      const sourceData = JSON.parse((t.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(run) as { data: string }).data)
      const { held: _held, ...wanted } = sourceData.nextRound
      const { nextRound: _ask, sandbox: _sandbox, ...priorData } = sourceData
      const id = t.api.createRecord({ kind: 'session', workspaceId: workspace!, origin: 'fixture', actor: { type: 'agent', id: agent }, title: 'A made-up supervisor run', data: {
        ...priorData, servingAgent: handle, servingAgentId: agent,
      } }).id
      created.push(id)
      const data = JSON.parse((t.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(id) as { data: string }).data)
      data.sandbox = sourceData.sandbox
      data.nextRound = { ...wanted, row: null }
      t.client.sqlite.prepare('UPDATE records SET data = ? WHERE id = ?').run(JSON.stringify(data), id)
    }
    const listed = await call('GET', '/api/worker/rounds', 'default', workerName, undefined, officeKey)
    const picked = listed.body.rounds.filter((row: { run: string }) => created.includes(row.run))
    expect(picked).toHaveLength(1)
    const waiting = created.find((id) => id !== picked[0].run)!
    const data = JSON.parse((t.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(waiting) as { data: string }).data)
    expect(data.nextRound.held.says).toContain(capName)
    expect(data.nextRound.held.says).toContain('1')
  } finally {
    if (previous === undefined) delete process.env[capName]
    else process.env[capName] = previous
    for (const id of created) t.client.sqlite.prepare("UPDATE records SET deleted_at = '2026-01-01 00:00:00' WHERE id = ?").run(id)
  }
})

it('records a worker hold and logs the whole reason when the record must shorten it', async () => {
  const path = join(scratch, 'x'.repeat(2300))
  const unavailable = { ...settings, env: { ...settings.env, MOLE_OFFICE_FAKE_ROUND_LAUNCHER: path } }
  const output = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
  try {
    await onePass(unavailable, [], [], [])
    output.mockClear()
    const pass = await onePass(unavailable, [], [], [])
    const reason = pass.rounds!.held.find((row) => row.run === run)!.because
    expect(reason.length).toBeGreaterThan(2000)
    const saved = next().held
    expect(saved.says.length).toBeLessThanOrEqual(2000)
    expect(saved.says).toMatch(/cut.*worker log/i)
    expect(output.mock.calls.some(([line]) => String(line).includes(reason))).toBe(true)
  } finally {
    output.mockRestore()
  }
})

it('records worker holds when filing the launcher or asking the starting door fails', async () => {
  const saved = t.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(run) as { data: string }
  const realFetch = globalThis.fetch
  try {
    for (const [ending, reason] of [['/api/records', 'A synthetic filing refusal.'], [`/api/worker/rounds/${run}/starting`, 'A synthetic starting refusal.']]) {
      const interception = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
        if (String(input).endsWith(ending!) && init?.method === 'POST') {
          return new Response(JSON.stringify({ error: reason }), { status: 503, headers: { 'content-type': 'application/json' } })
        }
        return realFetch(input, init)
      })
      try {
        const pass = await onePass(settings, [], [], [])
        expect(pass.rounds?.held.find((row) => row.run === run)?.because).toContain(reason)
        expect(next().held.says).toContain(reason)
      } finally {
        interception.mockRestore()
        t.client.sqlite.prepare('UPDATE records SET data = ? WHERE id = ?').run(saved.data, run)
      }
    }
  } finally {
    t.client.sqlite.prepare('UPDATE records SET data = ? WHERE id = ?').run(saved.data, run)
  }
})

it('keeps a failed adapter start on the ask when it has already left wanted', async () => {
  const saved = t.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(run) as { data: string }
  const reason = 'A synthetic adapter refusal.'
  const start = vi.spyOn(RoundAdapter.prototype, 'start').mockImplementation(() => { throw new Error(reason) })
  try {
    const pass = await onePass(settings, [], [], [])
    expect(pass.rounds?.held.find((row) => row.run === run)?.because).toContain(reason)
    expect(next().failed.says).toContain(reason)
  } finally {
    start.mockRestore()
    t.client.sqlite.prepare('UPDATE records SET data = ? WHERE id = ?').run(saved.data, run)
  }
})

it('starts a round asked in another project in one worker pass', async () => {
  const rounds: WatchingARound[] = []
  const pass = await onePass(settings, [], [], rounds)
  expect(pass.rounds?.started.map((row) => row.run)).toContain(run)
  expect(['starting', 'started']).toContain(next().state)
  expect(next().held).toBeUndefined()
  expect(rounds[0]?.workspace).toBe(remoteProject)
  const limit = Date.now() + 20_000
  while (rounds.some((row) => row.adapter.alive(row.handle))) {
    if (Date.now() > limit) throw new Error('The made-up launcher did not end')
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  const argv = JSON.parse(readFileSync(join(scratch, 'arguments.json'), 'utf8')) as string[]
  expect(argv[argv.indexOf('--workspace') + 1]).toBe(remoteProject)
  const ending = rounds[0]!.adapter.readEnding(rounds[0]!.handle)
  expect(ending.ok, ending.says).toBe(true)
  expect(next().state).toBe('started')
  const filed = await call('GET', `/api/records/${next().started.run}`, remoteProject, THE_PERSON)
  expect(filed.status).toBe(200)
  const closed = await onePass(settings, [], [], rounds)
  expect(closed.rounds?.ended.map((row) => row.run)).toContain(run)
  expect(next().launcher.ok).toBe(true)
  expect(rounds).toHaveLength(0)
})
