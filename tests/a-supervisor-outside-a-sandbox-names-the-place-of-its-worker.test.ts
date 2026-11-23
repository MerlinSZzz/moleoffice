// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** The outside ask chooses a place explicitly; all paths and repositories below are made up. */
import { randomBytes } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import type { AddressInfo } from 'node:net'
import { fileURLToPath } from 'node:url'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { LAUNCHER_MODEL_COMPATIBILITY } from '../src/config/model-efforts.mjs'
import { THE_PROVIDER_A_RUNTIME_RUNS } from '../src/config/runtime-native-providers.mjs'
import { theWordsNamingTheFolder } from '../src/config/sandbox-folder.mjs'
import { THE_PERSON } from '../src/shared/person.ts'
import { THE_MESSAGE_WORKER_ID } from '../src/shared/participants.ts'
import { FOR_THE_PERSON } from '../src/shared/worker-runs.ts'
import { onePass, type WatchingARound, type WorkerSettings } from '../src/worker/index.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

let db: TestDb
let app: FastifyInstance
let root: string
let checkout: string
let other: string
let brief: string
let supervisorRun: string
let supervisorKey: string
let workerId: string
let head: string
let oldWorkerMode: string | undefined
let sandboxFolder: string
let api: string
let finalLauncher = ''
const personKey = randomBytes(32).toString('hex')
const officeKey = randomBytes(32).toString('hex')
const person = {
  'content-type': 'application/json', 'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON, 'x-mole-office-key': personKey,
}
const agent = (handle: string, key: string, run?: string) => ({
  'content-type': 'application/json', 'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle, 'x-mole-office-key': key,
  ...(run === undefined ? {} : { 'x-mole-office-session': run }),
})
async function post(path: string, headers: Record<string, string>, payload: object) {
  const answer = await app.inject({ method: 'POST', url: path, headers, payload })
  return { status: answer.statusCode, body: JSON.parse(answer.body) as Record<string, any> }
}
function git(folder: string, ...args: string[]): string {
  const result = spawnSync('git', args, { cwd: folder, encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_NAME: 'Fixture', GIT_AUTHOR_EMAIL: 'fixture', GIT_COMMITTER_NAME: 'Fixture', GIT_COMMITTER_EMAIL: 'fixture' } })
  if (result.status !== 0) throw new Error(`Made-up git command failed: ${result.stderr}`)
  return result.stdout.trim()
}
function repository(folder: string, commit: boolean): string {
  mkdirSync(folder, { recursive: true })
  git(folder, 'init')
  if (!commit) return ''
  writeFileSync(join(folder, 'file.txt'), 'fixture\n')
  git(folder, 'add', 'file.txt')
  git(folder, 'commit', '-m', 'Fixture')
  return git(folder, 'rev-parse', 'HEAD')
}
const runData = () => JSON.parse((db.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(supervisorRun) as { data: string }).data) as Record<string, any>
const ask = (extra: Record<string, unknown>) => post('/api/agents/fixture-worker/worker-run', agent('fixture-supervisor', supervisorKey, supervisorRun), { brief, ...extra })
const worktree = () => ({ kind: 'worktree', repository: 'fixture-repository', folder: join(root, 'new-worktree') })
const folderPlace = (folder: string) => ({ kind: 'folder', folder })
function markSandbox(present: boolean) {
  const data = runData()
  if (present) data['sandbox'] = { template: 'fixture', container: 'fixture-container', folder: sandboxFolder }
  else delete data['sandbox']
  db.client.sqlite.prepare('UPDATE records SET data = ? WHERE id = ?').run(JSON.stringify(data), supervisorRun)
}
const office = (run?: string) => agent(THE_MESSAGE_WORKER_ID, officeKey, run)
async function start() {
  const wrapper = await post('/api/records', office(), {
    kind: 'session', title: 'A made-up launcher', data: {
      state: 'running', runtime: 'round-launcher', startedByMoleOffice: true,
      workingDirectory: root, extra: { purpose: 'worker', run: supervisorRun, worker: workerId },
    },
  })
  expect(wrapper.status, JSON.stringify(wrapper.body)).toBe(201)
  const id = String(wrapper.body['record'].id)
  const answer = await post(`/api/worker/worker-runs/${supervisorRun}/starting`, office(), { agent: workerId, wrapper: id })
  return { id, answer }
}
async function refused(extra: Record<string, unknown>, word: string) {
  const before = JSON.stringify(runData())
  const answer = await ask(extra)
  expect([400, 409], JSON.stringify(answer.body)).toContain(answer.status)
  expect(String(answer.body['error']).toLowerCase()).toContain(word.toLowerCase())
  expect(JSON.stringify(runData())).toBe(before)
}

beforeAll(async () => {
  oldWorkerMode = process.env['MOLE_OFFICE_MESSAGE_WORKER']
  process.env['MOLE_OFFICE_MESSAGE_WORKER'] = 'on'
  db = await freshDb()
  writeFileSync(join(dirname(db.file), 'keys.json'), JSON.stringify({ person: personKey, office: officeKey, providers: {} }), { mode: 0o600 })
  app = (await apiApp()).app
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  api = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  root = mkdtempSync(join(tmpdir(), 'outside-worker-place-'))
  sandboxFolder = join(root, 'sandbox')
  mkdirSync(sandboxFolder)
  db.client.sqlite.prepare("INSERT INTO session_resources (id, workspace_id, session_record_id, type, key, detail, registered_at, registered_by) VALUES ('fixture-container', 'default', 'fixture-session', 'container', 'mole-office-sandbox-sandbox', ?, '2026-01-01', 'agent:fixture')").run(`Sandbox fixture, from the template fixture; ${theWordsNamingTheFolder(sandboxFolder)} Started by node tools/sandbox.mjs up.`)
  checkout = join(root, 'checkout')
  other = join(root, 'other')
  head = repository(checkout, true)
  repository(other, true)
  repository(join(root, 'empty'), false)
  mkdirSync(join(root, 'asking'))
  brief = join(root, 'asking', 'brief.md')
  writeFileSync(brief, '# A made-up brief\n')
  db.client.sqlite.prepare("INSERT INTO repositories (id, workspace_id, name, root, created_at, updated_at, created_by) VALUES ('fixture-repository', 'default', 'fixture-repository', ?, '2026-01-01', '2026-01-01', 'fixture')").run(checkout)
  const secretary = await post('/api/agents/started', person, { handle: 'fixture-starter', name: 'Fixture starter', runtime: 'claude-code', role: 'secretary' })
  expect(secretary.status).toBe(201)
  const starterKey = String(secretary.body['whatToGiveIt'].key)
  const terminal = await post('/api/records', agent('fixture-starter', starterKey), { kind: 'session', title: 'A made-up starter run', data: { state: 'running', runtime: 'claude-code', workingDirectory: root } })
  expect(terminal.status).toBe(201)
  const supervisor = await post('/api/agents/started', agent('fixture-starter', starterKey), { handle: 'fixture-supervisor', name: 'Fixture supervisor', runtime: 'claude-code', role: 'supervisor' })
  expect(supervisor.status).toBe(201)
  const ownKey = String(supervisor.body['whatToGiveIt'].key)
  const worker = await post('/api/agents/started', agent('fixture-supervisor', ownKey), { handle: 'fixture-worker', name: 'Fixture worker', runtime: 'claude-code' })
  expect(worker.status).toBe(201)
  workerId = String(worker.body['agent'].id)
  const run = await post('/api/records', agent('fixture-starter', starterKey, String(terminal.body['record'].id)), {
    kind: 'session', title: 'A made-up outside run', data: { state: 'running', runtime: 'claude-code', servingAgent: 'fixture-supervisor', servingAgentId: supervisor.body['agent'].id, workingDirectory: join(root, 'asking') },
  })
  expect(run.status).toBe(201)
  supervisorRun = String(run.body['record'].id)
  supervisorKey = String(run.body['runKey'].key)
  const model = Object.keys(LAUNCHER_MODEL_COMPATIBILITY.aliases).find((name) => !name.includes('/') && Object.hasOwn(LAUNCHER_MODEL_COMPATIBILITY.aliases, `${String(THE_PROVIDER_A_RUNTIME_RUNS['claude-code'])}/${name}`))
  expect(model).toBeDefined()
  const module = await post('/api/records', person, { kind: 'module', title: 'A made-up module for the casting decision', data: { context: 'made up' } })
  expect(module.status).toBe(201)
  const decision = await post('/api/records', person, { kind: 'decision', title: 'A made-up casting decision', data: { replaces: [], governs: [{ record: module.body['record'].id }] } })
  expect(decision.status).toBe(201)
  const cast = await post('/api/casting/worker', person, { program: { value: 'claude-code', decision: decision.body['record'].id }, model: { value: model, decision: decision.body['record'].id }, effort: { value: 'high', decision: decision.body['record'].id } })
  expect(cast.status).toBe(201)
}, 60_000)

afterAll(async () => {
  if (oldWorkerMode === undefined) delete process.env['MOLE_OFFICE_MESSAGE_WORKER']
  else process.env['MOLE_OFFICE_MESSAGE_WORKER'] = oldWorkerMode
  await app?.close()
  db?.close()
  if (root !== undefined) rmSync(root, { recursive: true, force: true })
})

describe('an outside supervisor chooses the place', () => {
  it('names both choices and the safety line when no place is given', async () => {
    const before = JSON.stringify(runData())
    const answer = await ask({})
    expect(answer.status).toBe(409)
    expect(answer.body['error']).toMatch(/^Run .* names no sandbox the office can vouch for: its folder is not one a container row of the ledger names\./)
    expect(answer.body['error']).toContain('worktree')
    expect(answer.body['error']).toContain('repository')
    expect(answer.body['error']).toContain('folder')
    expect(answer.body['error']).toMatch(/Nothing was written\.$/)
    expect(answer.body['forThePerson']).toBe(FOR_THE_PERSON)
    expect(FOR_THE_PERSON).toBe('For the person: a worker is safest in a sandbox. A copy, such as a worktree or a copied folder, is next. Working straight in your own checkout carries some risk. Outside a sandbox, a worker can read everything your account can read, the office\'s key too.')
    expect(JSON.stringify(runData())).toBe(before)
  })
  it('refuses a sandbox supervisor that also names a place', async () => {
    markSandbox(true)
    try {
      await refused({ place: folderPlace(checkout) }, 'place')
    } finally {
      markSandbox(false)
    }
  })
  it('refuses extra place fields and carries the safety line on that answer', async () => {
    const before = JSON.stringify(runData())
    const answer = await ask({ place: { ...folderPlace(checkout), repository: 'fixture-repository' } })
    expect(answer.status).toBe(400)
    expect(answer.body['forThePerson']).toBe(FOR_THE_PERSON)
    expect(JSON.stringify(runData())).toBe(before)
  })
  it('refuses each invalid worktree choice without writing', async () => {
    await refused({ place: { ...worktree(), repository: 'not-registered' }, cutFrom: head }, 'repository')
    await refused({ place: { ...worktree(), folder: 'relative' }, cutFrom: head }, 'absolute')
    await refused({ place: { ...worktree(), folder: checkout }, cutFrom: head }, 'exists')
    await refused({ place: { ...worktree(), folder: join(root, 'missing-parent', 'child') }, cutFrom: head }, 'parent')
    await refused({ place: worktree() }, 'cutFrom')
    await refused({ place: worktree(), cutFrom: 'no-such-commit' }, 'commit')
    await refused({ place: worktree(), cutFrom: '-bad' }, 'cutFrom')
    git(checkout, 'branch', 'fixture-worker')
    await refused({ place: worktree(), cutFrom: head }, 'branch')
    git(checkout, 'branch', '-d', 'fixture-worker')
    await refused({ place: worktree(), cutFrom: head, clone: 'clone' }, 'clone')
    await refused({ place: worktree(), cutFrom: head, paths: ['file.txt'] }, 'paths')
    await refused({ place: worktree(), cutFrom: head, images: ['file.txt'] }, 'images')
  })
  it('refuses each invalid folder and an outside brief without writing', async () => {
    await refused({ place: folderPlace(join(root, 'missing')) }, 'folder')
    mkdirSync(join(checkout, 'below'))
    await refused({ place: folderPlace(join(checkout, 'below')) }, 'top')
    await refused({ place: folderPlace(join(root, 'empty')) }, 'HEAD')
    await refused({ place: folderPlace(checkout), cutFrom: head }, 'cutFrom')
    const outside = join(root, 'outside.md')
    writeFileSync(outside, '# Outside\n')
    await refused({ brief: outside, place: folderPlace(checkout) }, join(root, 'asking'))
  })
  it('keeps a registered worktree place and names the host start', async () => {
    const answer = await ask({ place: worktree(), cutFrom: head })
    expect(answer.status, JSON.stringify(answer.body)).toBe(202)
    expect(answer.body['forThePerson']).toBe(FOR_THE_PERSON)
    expect(answer.body['says']).toContain('The line in forThePerson is for the person: pass it on to them when the place is chosen.')
    expect(answer.body['says']).toContain('The host launcher will make the worktree at the chosen cut and start the worker there.')
    expect(answer.body['says']).toContain('The runtime runs with its own default permissions and may not be able to write or commit unless your settings for it allow it.')
    const kept = runData()['workerRuns'][workerId]
    expect(kept.place).toEqual({ kind: 'worktree', folder: worktree().folder, repository: { name: 'fixture-repository', root: checkout } })
    expect(kept.cut).toMatchObject({ named: head, commit: head })
    expect(kept.sandbox).toBeUndefined()
  })
  it('records whether a folder is a registered checkout', async () => {
    for (const [folder, registered] of [[checkout, true], [other, false]] as const) {
      const answer = await ask({ place: folderPlace(folder) })
      expect(answer.status, JSON.stringify(answer.body)).toBe(202)
      expect(answer.body['forThePerson']).toBe(FOR_THE_PERSON)
      expect(answer.body['says']).toContain('The line in forThePerson is for the person: pass it on to them when the place is chosen.')
      expect(answer.body['says']).toContain('The runtime runs with its own default permissions and may not be able to write or commit unless your settings for it allow it.')
      const kept = runData()['workerRuns'][workerId]
      expect(kept.place).toEqual({ kind: 'folder', folder, repository: registered ? { name: 'fixture-repository', root: checkout } : null })
      expect(kept.sandbox).toBeUndefined()
      expect(readFileSync(brief, 'utf8')).toContain('made-up brief')
    }
  })
  it('rechecks a changed brief and writes the failed state', async () => {
    expect((await ask({ place: worktree(), cutFrom: head })).status).toBe(202)
    writeFileSync(brief, '# The brief changed\n')
    const { answer } = await start()
    expect(answer.status).toBe(409)
    expect(runData()['workerRuns'][workerId].state).toBe('failed')
    writeFileSync(brief, '# A made-up brief\n')
  })
  it('rechecks that a new worktree is absent and its branch is free', async () => {
    expect((await ask({ place: worktree(), cutFrom: head })).status).toBe(202)
    mkdirSync(worktree().folder)
    expect((await start()).answer.status).toBe(409)
    expect(runData()['workerRuns'][workerId].state).toBe('failed')
    rmSync(worktree().folder, { recursive: true })

    expect((await ask({ place: worktree(), cutFrom: head })).status).toBe(202)
    git(checkout, 'branch', 'fixture-worker')
    expect((await start()).answer.status).toBe(409)
    expect(runData()['workerRuns'][workerId].state).toBe('failed')
    git(checkout, 'branch', '-d', 'fixture-worker')

    const parent = join(root, 'temporary-parent')
    mkdirSync(parent)
    expect((await ask({ place: { ...worktree(), folder: join(parent, 'worktree') }, cutFrom: head })).status).toBe(202)
    rmSync(parent, { recursive: true })
    expect((await start()).answer.status).toBe(409)
    expect(runData()['workerRuns'][workerId].state).toBe('failed')
  })
  it('rechecks that the cut is still in the repository and the supervisor is still outside', async () => {
    expect((await ask({ place: worktree(), cutFrom: head })).status).toBe(202)
    renameSync(join(checkout, '.git', 'objects'), join(checkout, '.git', 'objects-away'))
    expect((await start()).answer.status).toBe(409)
    expect(runData()['workerRuns'][workerId].state).toBe('failed')
    renameSync(join(checkout, '.git', 'objects-away'), join(checkout, '.git', 'objects'))

    expect((await ask({ place: worktree(), cutFrom: head })).status).toBe(202)
    markSandbox(true)
    try {
      expect((await start()).answer.status).toBe(409)
      expect(runData()['workerRuns'][workerId].state).toBe('failed')
    } finally {
      markSandbox(false)
    }
  })
  it('rechecks that an existing folder and its HEAD can still be read', async () => {
    expect((await ask({ place: folderPlace(other) })).status).toBe(202)
    renameSync(other, `${other}-moved`)
    expect((await start()).answer.status).toBe(409)
    expect(runData()['workerRuns'][workerId].state).toBe('failed')
    renameSync(`${other}-moved`, other)

    expect((await ask({ place: folderPlace(other) })).status).toBe(202)
    renameSync(join(other, '.git'), join(root, '.git'))
    expect((await start()).answer.status).toBe(409)
    expect(runData()['workerRuns'][workerId].state).toBe('failed')
    renameSync(join(root, '.git'), join(other, '.git'))

    expect((await ask({ place: folderPlace(other) })).status).toBe(202)
    renameSync(join(other, '.git', 'HEAD'), join(other, '.git', 'HEAD-away'))
    expect((await start()).answer.status).toBe(409)
    expect(runData()['workerRuns'][workerId].state).toBe('failed')
    renameSync(join(other, '.git', 'HEAD-away'), join(other, '.git', 'HEAD'))
  })
  it('the message worker starts the launcher for a place', async () => {
    expect((await ask({ place: folderPlace(other) })).status).toBe(202)
    const marker = join(root, 'launcher-started')
    const release = join(root, 'launcher-release')
    const fake = join(root, 'fake-launcher.mjs')
    writeFileSync(fake, `import { existsSync, writeFileSync } from 'node:fs'; writeFileSync(${JSON.stringify(marker)}, 'started'); const timer = setInterval(() => { if (existsSync(${JSON.stringify(release)})) { clearInterval(timer); process.exit(0) } }, 50); setTimeout(() => process.exit(1), 45000)\n`)
    const noAgent = join(root, 'no-agent.mjs')
    writeFileSync(noAgent, "process.exit(9)\n")
    const settings: WorkerSettings = {
      api, workspace: 'default', session: null, stopWithPid: null,
      checkout: fileURLToPath(new URL('..', import.meta.url)), runs: 2, hops: 3, outputRoot: join(root, 'runs'),
      env: { ...process.env, HOME: root, MOLE_OFFICE_DB: db.file, MOLE_OFFICE_FAKE_RUNTIME: noAgent, MOLE_OFFICE_FAKE_ROUND_LAUNCHER: fake },
    }
    const rounds: WatchingARound[] = []
    await onePass(settings, [], [], rounds)
    const deadline = Date.now() + 30_000
    while (!existsSync(marker) && Date.now() < deadline) await new Promise((done) => setTimeout(done, 50))
    expect(existsSync(marker)).toBe(true)
    expect(rounds).toHaveLength(1)
    expect(runData()['workerRuns'][workerId].state).toBe('starting')
    writeFileSync(release, 'go')
    while (rounds[0]!.adapter.alive(rounds[0]!.handle) && Date.now() < deadline) await new Promise((done) => setTimeout(done, 50))
    expect(rounds[0]!.adapter.alive(rounds[0]!.handle)).toBe(false)
    await onePass(settings, [], [], rounds)
    expect(rounds).toHaveLength(0)
    expect(runData()['workerRuns'][workerId].state).toBe('failed')
  }, 60_000)
  it('answers an outside start with its place and no sandbox launcher coordinates', async () => {
    expect((await ask({ place: folderPlace(checkout) })).status).toBe(202)
    const { id, answer } = await start()
    finalLauncher = id
    expect(answer.status, JSON.stringify(answer.body)).toBe(200)
    expect(answer.body['workerRun'].place).toEqual({ kind: 'folder', folder: checkout, repository: { name: 'fixture-repository', root: checkout } })
    expect(answer.body['workerRun'].forThePerson).toBe(FOR_THE_PERSON)
    expect(answer.body['workerRun']).not.toHaveProperty('instance')
    expect(answer.body['workerRun']).not.toHaveProperty('sandboxes')
  })
  it('refuses a sandbox on the filed run and writes workerPlace on a run without one', async () => {
    const data = { state: 'running', runtime: 'claude-code', servingAgent: 'fixture-worker', servingAgentId: workerId, workingDirectory: checkout, cutFrom: head, parentAttachment: supervisorRun }
    const count = () => (db.client.sqlite.prepare("SELECT count(*) AS n FROM records WHERE kind = 'session'").get() as { n: number }).n
    const before = count()
    const wrong = await post('/api/records', office(finalLauncher), { kind: 'session', title: 'A made-up run with a sandbox', data: { ...data, sandbox: { template: 'fixture', container: 'fixture-container', folder: sandboxFolder } } })
    expect(wrong.status, JSON.stringify(wrong.body)).toBe(409)
    expect(count()).toBe(before)
    expect(runData()['workerRuns'][workerId].state).toBe('starting')
    const filed = await post('/api/records', office(finalLauncher), { kind: 'session', title: 'A made-up worker run', data })
    expect(filed.status, JSON.stringify(filed.body)).toBe(201)
    const id = String(filed.body['record'].id)
    const stored = JSON.parse((db.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(id) as { data: string }).data)
    expect(stored.workerPlace).toEqual({ kind: 'folder', folder: checkout, repository: { name: 'fixture-repository', root: checkout } })
    expect(runData()['workerRuns'][workerId].state).toBe('started')
    const create = await post('/api/records', person, { kind: 'session', title: 'A made-up ordinary run', data: { state: 'running', workerPlace: stored.workerPlace } })
    expect(create.status).toBe(403)
    const patch = await app.inject({ method: 'PATCH', url: `/api/records/${id}`, headers: person, payload: { dataPatch: { workerPlace: stored.workerPlace } } })
    expect(patch.statusCode).toBe(403)
  })
})
