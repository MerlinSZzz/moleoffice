// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { spawn } from 'node:child_process'
import type { AddressInfo } from 'node:net'
import { createHash, randomBytes } from 'node:crypto'
import { mkdirSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { theWordsNamingTheFolder } from '../src/config/sandbox-folder.mjs'
import { THE_PERSON } from '../src/shared/person.ts'
import { readTheWorkerRun } from '../src/shared/worker-runs.ts'
import { aMadeUpSandboxRepo } from './a-made-up-sandbox-repo.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const officeKey = randomBytes(32).toString('hex')
let t: TestDb
let app: FastifyInstance
let api = ''
let boss = { id: '', key: '', run: '' }
let worker = ''
let folder = ''
let brief = ''
let repo: ReturnType<typeof aMadeUpSandboxRepo>
let head = ''
let other = ''
const person = { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const asBoss = () => ({ ...person, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'hand-boss', 'x-mole-office-key': boss.key, ...(boss.run === '' ? {} : { 'x-mole-office-session': boss.run }) })
const keyIsPresent = (key: unknown) => typeof key === 'string' && /^[0-9a-f]{64}$/.test(key)
async function call(method: 'GET' | 'POST', url: string, payload?: object, headers: Record<string, string> = asBoss()) {
  const r = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload }) })
  return { status: r.statusCode, body: r.json() as Record<string, any> }
}
const dataOf = (run: string) => JSON.parse((t.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(run) as { data: string }).data)
const written = () => ['records', 'revisions', 'held_keys', 'session_resources'].map(table => (t.client.sqlite.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n)
const filing = (more: object = {}, agent = 'hand-worker', directory = repo.repo) => ({ kind: 'session', title: 'A made-up hand start', ...more, data: { state: 'running', servingAgent: agent, runtime: 'claude-code', model: 'made-up', workingDirectory: directory, tip: repo.git(directory, 'rev-parse', 'HEAD'), cutFrom: head } })
const preflight = (more: object = {}) => call('POST', '/api/agents/hand-worker/hand-run', { ...more })

function aWorktreeAt(directory: string, commit: string): void {
  mkdirSync(directory, { recursive: true })
  repo.git(directory, 'init', '-q', '-b', 'worker')
  const objects = join(repo.git(repo.repo, 'rev-parse', '--path-format=absolute', '--git-common-dir'), 'objects')
  writeFileSync(join(directory, '.git', 'objects', 'info', 'alternates'), objects + '\n')
  repo.git(directory, 'update-ref', 'refs/heads/worker', commit)
}


beforeAll(async () => {
  t = await freshDb()
  writeFileSync(join(dirname(t.file), 'keys.json'), JSON.stringify({ person: randomBytes(32).toString('hex'), office: officeKey, providers: {} }), { mode: 0o600 })
  app = (await apiApp()).app
  await app.listen({ host: '127.0.0.1', port: 0 })
  api = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  const s = await call('POST', '/api/agents/started', { handle: 'hand-boss', name: 'Hand supervisor', role: 'supervisor' }, person)
  expect(s.status).toBe(201)
  boss.id = s.body.agent.id
  boss.key = s.body.whatToGiveIt.key
  folder = join(t.file + '-scratch', 'sandbox')
  mkdirSync(folder, { recursive: true })
  repo = aMadeUpSandboxRepo(folder, fileURLToPath(new URL('..', import.meta.url)))
  // The asker's HEAD differs from sandbox main: using main would silently cut the wrong commit.
  const tree = repo.git(repo.repo, 'rev-parse', 'HEAD^{tree}')
  other = repo.head
  head = repo.git(repo.repo, 'commit-tree', tree, '-p', other, '-m', 'The asking run moved ahead')
  repo.git(repo.repo, 'update-ref', 'refs/heads/asking', head)
  repo.git(repo.repo, 'symbolic-ref', 'HEAD', 'refs/heads/asking')
  brief = join(folder, 'brief.md')
  writeFileSync(brief, 'A made-up worker brief.\n')
  t.client.sqlite.prepare("INSERT INTO session_resources (id, workspace_id, session_record_id, type, key, detail, registered_at, registered_by) VALUES ('hand-container','default','fixture-session','container','mole-office-sandbox-sandbox',?,'2026-10-15 09:00:00','agent:fixture')")
    .run(`Sandbox sandbox, from the template mole-office-dev; ${theWordsNamingTheFolder(folder)} Started by node tools/sandbox.mjs up.`)
  const r = await call('POST', '/api/records', { kind: 'session', title: 'The asking run', data: { state: 'running', servingAgent: 'hand-boss', runtime: 'claude-code', workingDirectory: repo.repo, sandbox: { folder, container: 'hand-container', template: 'mole-office-dev' } } }, person)
  expect(r.status, r.body.error).toBe(201)
  boss.run = r.body.record.id
  const w = await call('POST', '/api/agents/started', { handle: 'hand-worker', name: 'Hand worker', noKey: true })
  expect(w.status, w.body.error).toBe(201)
  worker = w.body.agent.id
}, 120_000)
afterAll(async () => { await app?.close(); t?.close() })

describe('a hand start of a worker with no key of its own names its asker', () => {
  it('refuses missing askedBy at both doors with one sentence and writes nothing', async () => {
    for (const request of [() => preflight(), () => call('POST', '/api/records', filing()), () => call('POST', '/api/records/check', filing())]) {
      const before = written()
      const r = await request()
      expect(r.status, r.body.error).toBe(403)
      expect(r.body.error).toBe('This worker has no key of its own, so start it with --asked-by (askedBy) naming a live run of its registered starter and --brief (brief) naming its brief, or use the worker-run door; nothing was started.')
      expect(written()).toEqual(before)
    }
  })
  it('refuses a nonlive run, another agent’s run, and another workspace’s run at both doors without writing', async () => {
    const make = async (data: object, headers = person) => {
      const r = await call('POST', '/api/records', { kind: 'session', title: 'An invalid asking run', data: { state: 'running', servingAgent: 'hand-boss', workingDirectory: repo.repo, sandbox: { folder, container: 'hand-container', template: 'mole-office-dev' }, ...data } }, headers)
      expect(r.status, r.body.error).toBe(201)
      return r.body.record.id as string
    }
    const stopped = await make({ state: 'crashed', servingAgent: 'hand-boss' })
    const another = await call('POST', '/api/agents/started', { handle: 'hand-other', name: 'Another starter' }, person)
    expect(another.status).toBe(201)
    const stranger = await make({ state: 'running', servingAgent: 'hand-other' })
    const far = await call('POST', '/api/workspaces', { id: 'hand-far', title: 'Another project' }, person)
    expect(far.status).toBe(201)
    const foreign = await make({ state: 'running', servingAgent: 'hand-boss' }, { ...person, 'x-mole-office-workspace': 'hand-far' })
    for (const askedBy of [stopped, stranger, foreign]) for (const request of [() => preflight({ askedBy, brief }), () => call('POST', '/api/records', filing({ askedBy, brief }))]) {
      const before = written()
      const r = await request()
      expect(r.status, r.body.error).toBeGreaterThanOrEqual(400)
      expect(String(r.body.error).split(/(?<=[.!?])\s+/)).toHaveLength(1)
      expect(written()).toEqual(before)
    }
  })
  it('leaves an office-key start untouched and writes no hand ask', async () => {
    const before = written()
    const r = await call('POST', '/api/agents/hand-worker/hand-run', {}, { ...person, 'x-mole-office-key': officeKey })
    expect(r.status, r.body.error).toBe(200)
    expect(r.body.cut).toBeNull()
    expect(written()).toEqual(before)
  })
  it('requires a brief even with the right asking run', async () => {
    const before = written()
    const r = await preflight({ askedBy: boss.run })
    expect(r.status).toBe(403)
    expect(r.body.error).toContain('--brief')
    expect(written()).toEqual(before)
  })
  it('files under the asking run, records the full ask, and gives its asker report confirmation', async () => {
    const worktree = join(folder, 'worktrees', 'hand-worker')
    const asked = await preflight({ askedBy: boss.run, brief, worktree })
    expect(asked.status, asked.body.error).toBe(200)
    expect(asked.body.cut).toEqual({ commit: head, named: null })
    expect(dataOf(boss.run).workerRuns?.[worker]).toMatchObject({ state: 'starting', byHand: true })
    aWorktreeAt(worktree, head)
    // Moving HEAD after the ask cannot change what commit was asked for.
    repo.git(repo.repo, 'update-ref', 'refs/heads/asking', other)
    const r = await call('POST', '/api/records', filing({ askedBy: boss.run, brief }, 'hand-worker', worktree))
    expect(r.status, r.body.error).toBe(201)
    expect(keyIsPresent(r.body.runKey?.key)).toBe(true)
    const run = r.body.record.id as string
    const data = dataOf(run)
    expect(data.parentAttachment).toBe(boss.run)
    expect(data.cutAsked).toMatchObject({ commit: head, named: null, used: true, stoodAt: head })
    const entry = readTheWorkerRun(dataOf(boss.run).workerRuns?.[worker])
    expect(entry).toMatchObject({ state: 'started', askedBy: { who: { kind: 'agent', id: boss.id }, session: boss.run }, handle: 'hand-worker', brief: { path: brief, sha256: createHash('sha256').update('A made-up worker brief.\n').digest('hex'), bytes: 24 }, sandbox: { folder, instance: 'sandbox', container: 'hand-container' }, cut: { commit: head, named: null }, started: { run, runKeyId: data.extra.runKeyId } })
    const { getRecord } = await import('../src/server/lib/records.ts')
    const { theRunThatAskedForThisWorker } = await import('../src/server/lib/worker-runs.ts')
    const { whoMayConfirmThisReport } = await import('../src/server/lib/inspection.ts')
    const record = getRecord(run)!
    expect(theRunThatAskedForThisWorker(record)).toMatchObject({ run: boss.run, askerId: boss.id })
    expect(whoMayConfirmThisReport(record)).toMatchObject({ rule: 'asker', agent: { kind: 'agent', id: boss.id } })
  })
  it('records an explicit cut through direct filing too', async () => {
    const w = await call('POST', '/api/agents/started', { handle: 'hand-named', name: 'Named worker', noKey: true })
    expect(w.status).toBe(201)
    const r = await call('POST', '/api/records', filing({ askedBy: boss.run, brief, cutFrom: other }, 'hand-named'))
    expect(r.status, r.body.error).toBe(201)
    expect(dataOf(r.body.record.id).cutAsked).toMatchObject({ commit: other, named: other })
  })
  it('keeps an unmarked agent’s hand filing and key mint unchanged', async () => {
    const w = await call('POST', '/api/agents/started', { handle: 'hand-keyed', name: 'Keyed worker' })
    expect(w.status).toBe(201)
    const r = await call('POST', '/api/records', filing({}, 'hand-keyed'))
    expect(r.status, r.body.error).toBe(201)
    expect(keyIsPresent(r.body.runKey?.key)).toBe(true)
    expect(dataOf(r.body.record.id).cutAsked).toBeUndefined()
  })
})


it('refuses a second hand ask or filing while the first worker run lives, preserving its asker', async () => {
  const handle = 'hand-still-live'
  const registered = await call('POST', '/api/agents/started', { handle, name: handle, noKey: true })
  expect(registered.status).toBe(201)
  const agentId = String(registered.body.agent.id)
  const asked = await call('POST', `/api/agents/${handle}/hand-run`, { askedBy: boss.run, brief })
  expect(asked.status).toBe(200)
  const first = await call('POST', '/api/records', filing({ askedBy: boss.run, brief }, handle))
  expect(first.status, first.body.error).toBe(201)
  const run = String(first.body.record.id)
  const processRow = await call('POST', '/api/resources', { sessionRecordId: run, type: 'process', key: String(process.pid), detail: 'The made-up worker process', adopting: 'This test process stands for the worker run.' }, person)
  expect(processRow.status, processRow.body.error).toBe(201)
  const kept = dataOf(boss.run).workerRuns[agentId]
  for (const act of [() => call('POST', `/api/agents/${handle}/hand-run`, { askedBy: boss.run, brief }), () => call('POST', '/api/records', filing({ askedBy: boss.run, brief }, handle))]) {
    const before = written()
    const r = await act()
    expect(r.status, r.body.error).toBe(409)
    expect(String(r.body.error).split(/(?<=[.!?])\s+/)).toHaveLength(1)
    expect(written()).toEqual(before)
    expect(dataOf(boss.run).workerRuns[agentId]).toEqual(kept)
  }
  const { getRecord } = await import('../src/server/lib/records.ts')
  const { theRunThatAskedForThisWorker } = await import('../src/server/lib/worker-runs.ts')
  const { whoMayConfirmThisReport } = await import('../src/server/lib/inspection.ts')
  expect(theRunThatAskedForThisWorker(getRecord(run)!)).toMatchObject({ run: boss.run, askerId: boss.id })
  expect(whoMayConfirmThisReport(getRecord(run)!)).toMatchObject({ rule: 'asker', agent: { kind: 'agent', id: boss.id } })
})

it('refuses askedBy where no hand ask applies, and filing-only brief or cutFrom without askedBy', async () => {
  const keyed = await call('POST', '/api/agents/started', { handle: 'hand-no-ask', name: 'An unmarked worker' })
  expect(keyed.status).toBe(201)
  const office = { ...person, 'x-mole-office-key': officeKey }
  const acts = [
    () => call('POST', '/api/agents/hand-no-ask/hand-run', { askedBy: boss.run, brief }),
    () => call('POST', '/api/agents/hand-worker/hand-run', { askedBy: boss.run, brief }, office),
    () => call('POST', '/api/records', filing({ askedBy: boss.run, brief }, 'hand-no-ask')),
    () => call('POST', '/api/records', filing({ askedBy: boss.run, brief }), office),
    () => call('POST', '/api/records', { kind: 'note', title: 'An ask on a note', askedBy: boss.run, brief }),
    ...[{ brief }, { cutFrom: other }].flatMap(fields => [
      () => call('POST', '/api/records', filing(fields, 'hand-no-ask')),
      () => call('POST', '/api/records', { kind: 'note', title: 'Fields on no ask', ...fields }),
    ]),
  ]
  for (const act of acts) {
    const before = written()
    const r = await act()
    expect(r.status, r.body.error).toBeGreaterThanOrEqual(400)
    expect(String(r.body.error).split(/(?<=[.!?])\s+/)).toHaveLength(1)
    expect(written()).toEqual(before)
  }
  // The preflight still accepts the tool's ordinary brief/cut/worktree fields for an unmarked start.
  const before = written()
  const r = await call('POST', '/api/agents/hand-no-ask/hand-run', { brief, cutFrom: other, worktree: repo.repo })
  expect(r.status).toBe(200)
  expect(r.body.cut).toBeNull()
  expect(written()).toEqual(before)
})

it('a direct register-a-run with askedBy records the asking HEAD and the real existing worktree', async () => {
  const handle = 'hand-direct-tool'
  const registered = await call('POST', '/api/agents/started', { handle, name: handle, noKey: true })
  expect(registered.status).toBe(201)
  repo.git(repo.repo, 'update-ref', 'refs/heads/asking', head)
  const directory = join(folder, 'worktrees', handle)
  aWorktreeAt(directory, other)
  const tool = fileURLToPath(new URL('../tools/register-a-run.mjs', import.meta.url))
  const result = await new Promise<{ code: number; out: string; err: string }>((done) => {
    const child = spawn(process.execPath, [tool, '--handle', handle, '--worktree', directory, '--cut-from', 'main', '--runtime', 'claude-code', '--model', 'made-up', '--as', 'hand-boss', '--session', boss.run, '--workspace', 'default', '--api', api, '--asked-by', boss.run, '--brief', brief], { env: { ...process.env, MOLE_AGENT_KEY: boss.key }, timeout: 30_000 })
    let out = '', err = ''
    child.stdout.on('data', chunk => { out += chunk })
    child.stderr.on('data', chunk => { err += chunk })
    child.on('close', code => done({ code: code ?? -1, out, err }))
  })
  expect(result.code, result.err).toBe(0)
  const run = result.out.trim().split('\n')[0]!
  expect(dataOf(run).parentAttachment).toBe(boss.run)
  expect(dataOf(run).cutAsked).toMatchObject({ commit: head, named: null, used: false, stoodAt: other })
  expect(dataOf(boss.run).workerRuns[registered.body.agent.id]).toMatchObject({ state: 'started', started: { run }, starting: { cutFrom: null } })
})

// A WORKTREE THAT IS THERE IS USED AS IT STANDS, AND THE LAUNCHER FILES THE RUN AT THE CUT THE DOOR ANSWERS, so the door
// answers the commit the worktree stands at, and the ask keeps the commit it chose. The words are read from the door's
// own makers (src/server/lib/worker-runs.ts), given the made-up worktree and commits. MUTATION: the door answers the
// ask's commit again; and the start's words leave out the commit the run is filed at.
it('answers a hand start whose worktree is there with the commit the worktree stands at, and keeps the commit the ask chose', async () => {
  const handle = 'hand-reused'
  const registered = await call('POST', '/api/agents/started', { handle, name: handle, noKey: true })
  expect(registered.status).toBe(201)
  repo.git(repo.repo, 'update-ref', 'refs/heads/asking', head)
  const directory = join(folder, 'worktrees', handle)
  aWorktreeAt(directory, other)
  const dir = realpathSync(directory)
  const r = await call('POST', `/api/agents/${handle}/hand-run`, { askedBy: boss.run, brief, worktree: directory })
  expect(r.status, r.body.error).toBe(200)
  expect(r.body.cut).toEqual({ commit: other, named: null })
  const { aHandStartUsesAWorktreeThatIsThere, theRunIsFiledWhereTheWorktreeStands } = await import('../src/server/lib/worker-runs.ts')
  const entry = dataOf(boss.run).workerRuns[registered.body.agent.id]
  expect(entry).toMatchObject({
    state: 'starting',
    byHand: true,
    cut: { commit: head, named: null },
    starting: {
      cutFrom: null,
      cutSays: aHandStartUsesAWorktreeThatIsThere({ dir, branch: 'worker', head: other }, other, { commit: head, named: null }),
    },
  })
  for (const part of [dir, theRunIsFiledWhereTheWorktreeStands(other)]) expect(entry.starting.cutSays).toContain(part)
})

// A WORKTREE WHOSE HEAD GIT CANNOT READ stands at no commit the run could be filed at, so the hand start is refused, and
// nothing is written. MUTATION: take the hand start's refusal out (it is answered 200).
it('refuses a hand start whose worktree is there at a commit git cannot read, and writes nothing', async () => {
  const handle = 'hand-headless'
  expect((await call('POST', '/api/agents/started', { handle, name: handle, noKey: true })).status).toBe(201)
  const directory = join(folder, 'worktrees', handle)
  mkdirSync(directory, { recursive: true })
  writeFileSync(join(directory, '.git'), `gitdir: ${join(folder, 'no-such-git-directory')}\n`)
  const dir = realpathSync(directory)
  const before = written()
  const r = await call('POST', `/api/agents/${handle}/hand-run`, { askedBy: boss.run, brief, worktree: directory })
  expect(r.status, r.body.error).toBe(409)
  const { aHeadNobodyCanRead } = await import('../src/server/lib/worker-runs.ts')
  expect(r.body.error).toBe(aHeadNobodyCanRead({ dir, branch: null, head: null }, 'hand start'))
  expect(written()).toEqual(before)
})

it('refuses an outside worktree and a link escaping the vouched sandbox before recording an ask', async () => {
  const handle = 'hand-unsafe-path'
  expect((await call('POST', '/api/agents/started', { handle, name: handle, noKey: true })).status).toBe(201)
  const outside = join(dirname(folder), 'outside-worktree')
  aWorktreeAt(outside, other)
  const link = join(folder, 'outside-link')
  symlinkSync(outside, link)
  for (const worktree of [outside, link]) {
    const before = written()
    const r = await call('POST', `/api/agents/${handle}/hand-run`, { askedBy: boss.run, brief, worktree })
    expect(r.status, r.body.error).toBeGreaterThanOrEqual(400)
    expect(r.body.error).toContain('inside')
    expect(written()).toEqual(before)
  }
})
