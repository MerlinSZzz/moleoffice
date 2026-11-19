// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * This file cites a decision. All records and repositories here are synthetic.
 * The tool runs as a separate process against this test's office on an ephemeral port.
 * The protected agents come from MOLE_OFFICE_SETTLE_PROTECTED_HANDLES (FLO-45), which this file sets.
 * Mutations: dry run applies; apply continues after refusal; protection is removed;
 * preview skips a proof; the keyed-secretary permission is removed; stored ids lose priority.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { execFile, execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createServer, type Server } from 'node:http'
import type { FastifyInstance } from 'fastify'
import { freshDb, writeAVerdictAsItsDoorWould, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { STATEMENT_COLUMNS } from '../src/shared/commit-statements.ts'
import type { HowARunWouldSettle } from '../src/server/lib/inspection.ts'

const made = mkdtempSync(join(tmpdir(), 'mole-office-settle-batch-'))
const home = join(made, 'home')
const tool = resolve('tools/settle-owed-runs.mjs')
const beforeHome = process.env.HOME
const person = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON, 'x-mole-office-workspace': 'default' }
const as = (id: string, key?: string) => ({
  'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': id, 'x-mole-office-workspace': 'default',
  ...(key === undefined ? {} : { 'x-mole-office-key': key }),
})
let t: TestDb
let app: FastifyInstance
let proxy: Server
let address: string
let officeAddress: string
let inspection: typeof import('../src/server/lib/inspection.ts')
let mergeDoor: typeof import('../src/server/lib/merge-entry-door.ts')
const agents = new Map<string, { id: string; key: string }>()
const traffic: { method: string; url: string }[] = []
let refuseRun: string | null = null
let n = 0

function git(dir: string, ...args: string[]): string {
  return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', env: { ...process.env, HOME: home } }).trim()
}
function commit(dir: string, text: string, message: string): string {
  writeFileSync(join(dir, 'work', 'a.txt'), text)
  git(dir, 'add', '.')
  git(dir, 'commit', '-qm', message)
  return git(dir, 'rev-parse', 'HEAD')
}
async function register(handle: string, role: string, starter?: string) {
  const reply = await app.inject({ method: 'POST', url: '/api/agents/started', headers: starter ? as(starter) : person,
    payload: { handle, name: handle, role, ...(role === 'secretary' ? {} : { workArea: ['work'] }) } })
  expect(reply.statusCode, reply.body).toBe(201)
  const id = (t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(handle) as { id: string }).id
  agents.set(handle, { id, key: reply.json<{ whatToGiveIt: { key: string } }>().whatToGiveIt.key })
}
async function run(handle: string, directory?: string): Promise<string> {
  n++
  const created = await app.inject({ method: 'POST', url: '/api/records', headers: as(handle), payload: {
    kind: 'session', title: `Synthetic batch run ${n}`, data: { state: 'running', servingAgent: handle,
      ...(directory === undefined ? {} : { workingDirectory: directory, cutFrom: 'main' }) },
  } })
  expect(created.statusCode, created.body).toBe(201)
  const id = created.json<{ record: { id: string } }>().record.id
  if (directory !== undefined) {
    const ended = await app.inject({ method: 'PATCH', url: `/api/records/${id}`, headers: as(handle), payload: { dataPatch: { state: 'finished' } } })
    expect(ended.statusCode, ended.body).toBe(200)
  } else {
    // A legacy unsealed run, written as historical fixture data without asking for a new seal.
    t.client.sqlite.prepare("UPDATE records SET data = json_set(data, '$.state', 'finished') WHERE id = ?").run(id)
  }
  return id
}
function release(id: string) {
  const seal = String(t.api.getRecord(id)!.data['sealedTip'])
  const hash = (t.api.getRecord(seal)!.data['seal'] as { hash: string }).hash
  writeAVerdictAsItsDoorWould(t, id, {
    released: { by: { kind: 'agent', id: agents.get('batch-secretary')!.id }, at: '2090-01-01 12:00:00', how: 'an inspector',
      read: { sealId: seal, sealHash: hash, worktree: made, ofItsOwn: true, says: 'Synthetic release of this seal.' } },
    confirmed: { by: { kind: 'agent', id: agents.get('batch-secretary')!.id }, at: '2090-01-01 12:00:00', because: 'Synthetic confirmation.' },
  })
}
function merged(id: string, lane: string) {
  release(id)
  const seal = String(t.api.getRecord(id)!.data['sealedTip'])
  const entry = mergeDoor.asTheMergeQueue(() => t.api.createRecord({ kind: 'merge_entry', origin: 'fixture', workspaceId: 'default',
    title: `Synthetic merge of ${id}`, data: { run: id, seal: { id: seal, hash: 'fixture' },
      changeset: { adapter: 'git', root: lane, repository: lane, branch: 'wave', commit: 'c', base: 'b' },
      state: 'merged', submittedBy: { kind: 'agent', id: agents.get('batch-secretary')!.id } }, actor: inspection.THE_OFFICE,
  })).id
  t.api.patchRecord(id, { dataPatch: { integrated: { entry, mainBefore: 'b', mainAfter: 'c', rebasedTip: null, sealId: seal, at: '2090-01-01 12:00:00' } } }, inspection.THE_OFFICE)
}

type Proof = 'ancestor' | 'same patches' | 'same changed lines' | 'named by a released statement' | 'a later round of the same branch' | 'missing'
async function pair(proof: Proof) {
  const dir = join(made, `lane-${++n}`)
  mkdirSync(join(dir, 'work'), { recursive: true })
  git(dir, 'init', '-qb', 'main')
  git(dir, 'config', 'user.name', 'Synthetic batch fixture')
  git(dir, 'config', 'user.email', 'fixture@example.invalid')
  commit(dir, 'context before\nline before\n', 'Synthetic base')
  const worker = join(made, `worker-${n}`)
  git(dir, 'worktree', 'add', '-qb', `worker-${n}`, worker, 'main')
  const first = commit(worker, 'context before\nline from worker\n', 'Worker change')
  const earlier = await run('batch-worker', worker)
  const wave = proof === 'a later round of the same branch' ? worker : join(made, `wave-${n}`)
  if (wave !== worker) {
    git(dir, 'worktree', 'add', '-qb', `wave-${n}`, wave, proof === 'ancestor' ? first : 'main')
    if (proof === 'same patches') {
      writeFileSync(join(wave, 'work', 'other.txt'), 'unrelated wave work\n')
      git(wave, 'add', '.')
      git(wave, 'commit', '-qm', 'Another wave commit')
      git(wave, 'cherry-pick', first)
    } else if (proof === 'same changed lines') {
      commit(wave, 'context moved\nline before\n', 'Changed surrounding line')
      commit(wave, 'context moved\nline from worker\n', 'Worker lines in new context')
    } else if (proof === 'named by a released statement' || proof === 'missing') {
      commit(wave, 'context before\nline changed by wave\n', 'Worker work changed by wave')
    }
  }
  const later = await run('batch-wave', wave)
  const became = git(wave, 'rev-parse', 'HEAD')
  git(dir, 'merge', '-q', '--ff-only', became)
  merged(later, dir)
  let statement: string | undefined
  if (proof === 'named by a released statement') {
    const writer = await app.inject({ method: 'POST', url: '/api/records', headers: as('batch-wave'), payload: {
      kind: 'session', title: `Synthetic statement writer ${++n}`, data: { state: 'running', servingAgent: 'batch-wave' },
    } })
    expect(writer.statusCode, writer.body).toBe(201)
    const writerId = writer.json<{ record: { id: string } }>().record.id
    const report = await app.inject({ method: 'POST', url: '/api/records', headers: { ...as('batch-wave'), 'x-mole-office-session': writerId }, payload: {
      kind: 'report', title: `Synthetic statement ${n}`, data: { for: 'batch-secretary', date: '2026-09-26', blocks: [{
        id: 'b-1', type: 'table', columns: STATEMENT_COLUMNS.map(label => ({ label })), rows: [{ cells: [earlier, first, became, 'work/a.txt'] }],
      }] },
    } })
    expect(report.statusCode, report.body).toBe(201)
    statement = report.json<{ record: { id: string } }>().record.id
    const end = await app.inject({ method: 'PATCH', url: `/api/records/${writerId}`, headers: as('batch-wave'), payload: { dataPatch: { state: 'finished', submission: { kind: 'records', records: [statement] } } } })
    expect(end.statusCode, end.body).toBe(200)
    release(writerId)
  }
  return { earlier, later, statement, repository: dir }
}

async function preview(id: string, headers = as('batch-secretary', agents.get('batch-secretary')!.key)) {
  const response = await fetch(`${address}/api/checks/${id}/how-it-would-settle`, { headers })
  return { status: response.status, body: await response.json() as HowARunWouldSettle & { error?: string } }
}
async function postSuperseded(id: string, by: string, statement?: string, headers = as('batch-secretary', agents.get('batch-secretary')!.key)) {
  const response = await fetch(`${address}/api/checks/${id}/superseded`, { method: 'POST', headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify({ by, because: 'Synthetic batch proof.', ...(statement ? { statement } : {}) }) })
  return { status: response.status, body: await response.json() as { error?: string; stands?: { standing: string } } }
}
// THE PROTECTED HANDLES ARE A SETTING, FLO-45 of a decision, empty by default. This fixture
// office names its two protected supervisors there, as an office's .env would.
async function cli(args: string[], protectedHandles = 'quill,lark') {
  const cwd = join(made, `tool-${++n}`)
  mkdirSync(cwd)
  const result = await new Promise<{ code: number; output: string }>(done => {
    execFile(process.execPath, [tool, ...args], { cwd, timeout: 120_000, env: { ...process.env,
      HOME: home, MOLE_OFFICE_API: address, MOLE_OFFICE_WORKSPACE: 'default', MOLE_OFFICE_AGENT: 'batch-secretary',
      MOLE_AGENT_KEY: agents.get('batch-secretary')!.key, MOLE_OFFICE_SESSION: '',
      MOLE_OFFICE_SETTLE_PROTECTED_HANDLES: protectedHandles,
    } }, (error, stdout, stderr) => done({ code: error === null ? 0 : Number(error.code) || 1, output: stdout + stderr }))
  })
  return { ...result, cwd }
}
function database() { return t.client.sqlite.serialize() }

beforeAll(async () => {
  mkdirSync(home)
  process.env.HOME = home
  t = await freshDb()
  // The batch's decision is a real record in the copied office, and a labelled fixture here.
  t.client.sqlite.prepare(`INSERT INTO records (id, workspace_id, owner_id, origin, kind, title, data, created_at, updated_at)
    VALUES ('madeUpglgfhp', 'default', ?, 'fixture', 'decision', 'Synthetic authority for the batch fixture', '{}', '2026-09-01 12:00:00', '2026-09-01 12:00:00')`).run(THE_PERSON)
  const { buildApp } = await import('../src/server/index.ts')
  app = (await buildApp({ production: false, webDir: made, webAppUrl: 'http://127.0.0.1:5173', logLevel: false, recordCalls: false })).app
  await app.ready()
  inspection = await import('../src/server/lib/inspection.ts')
  mergeDoor = await import('../src/server/lib/merge-entry-door.ts')
  await register('batch-secretary', 'secretary')
  await register('batch-starter', 'supervisor')
  await register('batch-worker', 'worker', 'batch-starter')
  await register('batch-wave', 'supervisor', 'batch-secretary')
  await register('quill', 'supervisor')
  await register('lark', 'supervisor')
  officeAddress = await app.listen({ port: 0, host: '127.0.0.1' })
  proxy = createServer(async (req, res) => {
    traffic.push({ method: req.method!, url: req.url! })
    if (refuseRun !== null && req.method === 'POST' && req.url!.startsWith(`/api/checks/${refuseRun}/`)) {
      res.writeHead(409, { 'content-type': 'application/json' }).end(JSON.stringify({ error: 'Synthetic unexpected refusal.' }))
      return
    }
    const chunks = []
    for await (const chunk of req) chunks.push(Buffer.from(chunk as Buffer))
    const reply = await fetch(officeAddress + req.url, { method: req.method, headers: req.headers as Record<string, string>,
      ...(req.method === 'GET' ? {} : { body: Buffer.concat(chunks) }) })
    res.writeHead(reply.status, { 'content-type': 'application/json' }).end(await reply.text())
  })
  await new Promise<void>(done => proxy.listen(0, '127.0.0.1', done))
  address = `http://127.0.0.1:${(proxy.address() as { port: number }).port}`
}, 120_000)

afterAll(async () => {
  vi.useRealTimers()
  await new Promise<void>(done => proxy?.close(() => done()))
  await app?.close()
  t?.close()
  if (beforeHome === undefined) delete process.env.HOME
  else process.env.HOME = beforeHome
  rmSync(made, { recursive: true, force: true })
})

describe('the batch and the settlement reading', () => {
  it('dry run is GET-only and leaves the entire database byte-identical', async () => {
    const { earlier } = await pair('ancestor')
    const unchecked = await run('batch-worker')
    vi.useFakeTimers({ toFake: ['Date'] })
    // Warm the key-use stamp before comparing every byte. Request accounting is off on this fixture.
    await preview(earlier)
    const before = database()
    traffic.length = 0
    const result = await cli(['--run', earlier, '--run', unchecked, '--run', earlier])
    expect(result.code, result.output).toBe(0)
    expect(result.output).toContain('Count: 2 owed; 1 superseded; 1 closed unchecked; 0 could not be read; 0 settled.')
    expect(traffic.every(one => one.method === 'GET')).toBe(true)
    expect(database().equals(before)).toBe(true)
    expect(readdirSync(result.cwd)).toEqual([])
    vi.useRealTimers()
  })

  it.each<Proof>(['ancestor', 'same patches', 'same changed lines', 'named by a released statement', 'a later round of the same branch'])(
    'the preview and the door agree on %s', async proof => {
      const { earlier, later, statement } = await pair(proof)
      const read = await preview(earlier)
      expect(read.status, JSON.stringify(read.body)).toBe(200)
      expect(read.body.settlement).toMatchObject({ way: 'superseded', by: later, proof: { how: proof } })
      if (statement) expect(read.body.settlement).toHaveProperty('statement', statement)
      const written = await postSuperseded(earlier, later, statement)
      expect(written.status, JSON.stringify(written.body)).toBe(201)
      expect(written.body.stands?.standing).toBe('superseded')
    },
  )

  it('unchecked in the reading means the candidate fails the door, without a write', async () => {
    const { earlier, later } = await pair('missing')
    const before = t.api.getRecord(earlier)
    expect((await preview(earlier)).body.settlement?.way).toBe('closed unchecked')
    const refused = await postSuperseded(earlier, later)
    expect(refused.status, JSON.stringify(refused.body)).toBe(409)
    expect(t.api.getRecord(earlier)).toEqual(before)
  })

  // PROBLEM FuHKnNDBzrXW: the door writes the mark on a run that holds no check on the run itself, so the batch promises
  // the act and apply makes it. Before, the door refused such a run and this case said it could not be read.
  it('a valid proof without a recorded check is settled, with the mark on the run itself', async () => {
    const { earlier, later } = await pair('ancestor')
    t.client.sqlite.prepare("UPDATE records SET data = json_remove(data, '$.theCheck') WHERE id = ?").run(earlier)
    expect((await preview(earlier)).body.settlement).toMatchObject({ way: 'superseded', by: later })
    traffic.length = 0
    const result = await cli(['--run', earlier, '--apply'])
    expect(result.code, result.output).toBe(0)
    expect(traffic.filter(one => one.method === 'POST').map(one => one.url)).toEqual([`/api/checks/${earlier}/superseded`])
    const after = t.api.getRecord(earlier)!.data
    expect(after['theCheck']).toBeUndefined()
    expect(after['superseded']).toMatchObject({ by: later })
    expect(inspection.whereARunStands(t.api.getRecord(earlier)!).standing).toBe('superseded')
  })

  it('an absent repository is unreadable, and the dry run keeps it apart from unchecked', async () => {
    const { earlier, later, repository } = await pair('ancestor')
    renameSync(repository, `${repository}-moved`)
    const read = await preview(earlier)
    expect(read.status, JSON.stringify(read.body)).toBe(200)
    expect(read.body.settlement).toMatchObject({ way: 'could not be read', candidates: [{ by: later }] })
    const result = await cli(['--run', earlier])
    expect(result.code, result.output).toBe(0)
    expect(result.output).toContain('Could not be read; these runs will remain unsettled:')
    expect(result.output).toContain('0 closed unchecked; 1 could not be read; 0 settled.')
  })

  it('apply logs an unreadable run, leaves it untouched, and exits nonzero', async () => {
    const { earlier, repository } = await pair('ancestor')
    renameSync(repository, `${repository}-moved`)
    const before = t.api.getRecord(earlier)
    traffic.length = 0
    const result = await cli(['--run', earlier, '--apply'])
    expect(result.code).toBe(1)
    expect(result.output).toContain('1 could not be read; 0 settled.')
    expect(traffic.every(one => one.method === 'GET')).toBe(true)
    expect(t.api.getRecord(earlier)).toEqual(before)
    const log = readdirSync(join(result.cwd, '.logs'))
    expect(log).toHaveLength(1)
    const lines = readFileSync(join(result.cwd, '.logs', log[0]!), 'utf8').trim().split('\n').map(line => JSON.parse(line))
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatchObject({ run: earlier, way: 'could not be read' })
  })

  it('apply settles both ways, logs their answers, and stops at the first unexpected refusal', async () => {
    const { earlier } = await pair('ancestor')
    const unchecked = await run('batch-worker')
    const refused = await run('batch-worker')
    const afterRefusal = await run('batch-worker')
    const before = t.api.getRecord(afterRefusal)
    traffic.length = 0
    refuseRun = refused
    let result: Awaited<ReturnType<typeof cli>>
    try { result = await cli(['--run', earlier, '--run', unchecked, '--run', refused, '--run', afterRefusal, '--apply']) }
    finally { refuseRun = null }
    expect(result.code, result.output).toBe(1)
    expect(result.output).toContain('Synthetic unexpected refusal.')
    expect(inspection.whereARunStands(t.api.getRecord(earlier)!).standing).toBe('superseded')
    expect(inspection.whereARunStands(t.api.getRecord(unchecked)!).standing).toBe('closed unchecked')
    expect(t.api.getRecord(unchecked)!.data['closedUnchecked']).toMatchObject({ decision: 'madeUpglgfhp', because: expect.stringContaining('Decision madeUpglgfhp') })
    expect(t.api.getRecord(afterRefusal)).toEqual(before)
    expect(traffic.filter(one => one.method === 'POST').map(one => one.url)).toEqual([
      `/api/checks/${earlier}/superseded`, `/api/checks/${unchecked}/closed-unchecked`, `/api/checks/${refused}/closed-unchecked`,
    ])
    const logs = readdirSync(join(result.cwd, '.logs'))
    expect(logs).toHaveLength(1)
    expect(result.output).toContain(join(result.cwd, '.logs', logs[0]!))
    const lines = readFileSync(join(result.cwd, '.logs', logs[0]!), 'utf8').trim().split('\n').map(line => JSON.parse(line))
    expect(lines.map(line => [line.run, line.way, line.status])).toEqual([
      [earlier, 'superseded', 201], [unchecked, 'closed unchecked', 201], [refused, 'closed unchecked', 409],
    ])
    expect(lines.every(line => line.agent.id === agents.get('batch-worker')!.id && line.answer)).toBe(true)
  })

  it('agent handles, agent ids, and repeated run ids select each owed run once', async () => {
    await register('batch-selected', 'worker', 'batch-starter')
    const id = await run('batch-selected')
    const agent = agents.get('batch-selected')!.id
    traffic.length = 0
    const result = await cli(['--agent', 'batch-selected', '--agent', agent, '--run', id, '--apply'])
    expect(result.code, result.output).toBe(0)
    expect(result.output).toContain('Count: 1 owed; 0 superseded; 1 closed unchecked; 0 could not be read; 1 settled.')
    expect(traffic.filter(one => one.method === 'POST')).toHaveLength(1)
    expect(inspection.whatRetiringWhileACheckIsOwed({ id: agent, handle: 'batch-selected' })).toEqual([])
  })

  it('a run id beginning with two dashes is read as an id', async () => {
    const id = '--fixture-run'
    t.client.sqlite.prepare(`INSERT INTO records (id, workspace_id, owner_id, origin, kind, title, data, created_at, updated_at)
      VALUES (?, 'default', ?, 'fixture', 'session', 'Synthetic run with dashes in its id', ?, '2026-09-01 12:00:00', '2026-09-01 12:00:00')`)
      .run(id, THE_PERSON, JSON.stringify({ state: 'finished', servingAgent: 'batch-worker' }))
    const result = await cli(['--run', id])
    expect(result.code, result.output).toBe(0)
    expect(result.output).toContain(`${id} (batch-worker`)
    expect(result.output).toContain('Count: 1 owed;')
  })

  it('a keyed secretary settles another starter’s run; an ordinary agent and keyless claims are refused', async () => {
    const { earlier, later } = await pair('ancestor')
    for (const headers of [as('batch-secretary'), as('batch-worker', agents.get('batch-worker')!.key), person]) {
      expect((await preview(earlier, headers)).status).toBe(403)
      expect((await postSuperseded(earlier, later, undefined, headers)).status).toBe(403)
    }
    const done = await postSuperseded(earlier, later)
    expect(done.status, JSON.stringify(done.body)).toBe(201)
  })

  it.each(['quill', 'lark', THE_PERSON])('a protected %s run selected by id is refused before any act', async handle => {
    const id = await run(handle === THE_PERSON ? 'batch-worker' : handle)
    const stored = handle === THE_PERSON ? handle : agents.get(handle)!.id
    t.client.sqlite.prepare("UPDATE records SET data = json_set(data, '$.servingAgent', ?) WHERE id = ?").run(stored, id)
    traffic.length = 0
    const before = t.api.getRecord(id)
    const result = await cli(['--run', id, '--apply'])
    expect(result.code).toBe(1)
    expect(result.output).toContain('whose runs this tool protects')
    expect(traffic.every(one => one.method === 'GET')).toBe(true)
    expect(t.api.getRecord(id)).toEqual(before)
  })

  it('protects no agent when the setting is empty, and still refuses the person\'s run', async () => {
    const id = await run('lark')
    const free = await cli(['--run', id], '')
    expect(free.code, free.output).toBe(0)
    expect(free.output).not.toContain('whose runs this tool protects')
    expect(free.output).toContain('Count: 1 owed;')
    const own = await run('batch-worker')
    t.client.sqlite.prepare("UPDATE records SET data = json_set(data, '$.servingAgent', ?) WHERE id = ?").run(THE_PERSON, own)
    const person = await cli(['--run', own], '')
    expect(person.code).toBe(1)
    expect(person.output).toContain('whose runs this tool protects')
  })

  it('an ambiguous stored string remains unreadable, and servingAgentId protects a stale name', async () => {
    const id = await run('quill')
    const quill = agents.get('quill')!.id
    await register('collision-worker', 'worker', 'batch-starter')
    // Historical ids can also be handles. Install that collision as fixture registry data.
    t.client.sqlite.prepare('UPDATE agents SET handle = ? WHERE id = ?').run(quill, agents.get('collision-worker')!.id)
    t.client.sqlite.prepare("UPDATE records SET data = json_set(data, '$.servingAgent', ?) WHERE id = ?").run(quill, id)
    expect(inspection.theAgentOfARun(t.api.getRecord(id)!)).toBeNull()
    const ambiguous = await preview(id)
    expect(ambiguous.body.agent).toBeNull()
    expect(ambiguous.body.settlement).toMatchObject({ way: 'could not be read', because: expect.stringContaining('names 2 agents') })
    traffic.length = 0
    const untouched = t.api.getRecord(id)
    const result = await cli(['--run', id, '--apply'])
    expect(result.code).toBe(1)
    expect(result.output).toContain('names 2 agents')
    expect(traffic.every(one => one.method === 'GET')).toBe(true)
    expect(t.api.getRecord(id)).toEqual(untouched)
    t.client.sqlite.prepare("UPDATE records SET data = json_set(data, '$.servingAgent', 'batch-worker', '$.servingAgentId', ?) WHERE id = ?").run(quill, id)
    expect((await preview(id)).body.agent?.id).toBe(quill)
    expect((await cli(['--run', id, '--apply'])).output).toContain('whose runs this tool protects')
  })
})
