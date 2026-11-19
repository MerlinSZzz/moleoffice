// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { aMadeUpModuleForPackage, injectedPackageFixture } from './module-package-fixture.ts'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest'
import { THE_MESSAGE_WORKER_ID } from '../src/shared/participants.ts'
import { apiApp, freshDb, theOfficesKeyHeader, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'

let db: TestDb
let app: FastifyInstance
let workspace = ''
let n = 0
const human = () => ({ 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id, 'x-mole-office-workspace': workspace })
const agent = (id: string) => ({ 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': id, 'x-mole-office-workspace': workspace })
beforeAll(async () => { db = await freshDb(); app = (await apiApp()).app; await app.ready() }, 60_000)
afterAll(async () => { await app.close(); db.close() })
beforeEach(async () => { workspace = `inside-${++n}`; const r = await app.inject({ method: 'POST', url: '/api/workspaces', payload: { id: workspace, title: 'Inside test' } }); expect(r.statusCode, r.body).toBe(201) })
async function file(kind: string, title: string, data: Record<string, unknown> = {}, headers = human()) {
  const r = await app.inject({ method: 'POST', url: '/api/records', headers, payload: { kind, title, data: kind === 'decision' ? { replaces: [], ...data } : data } })
  expect(r.statusCode, r.body).toBe(201)
  return r.json().record.id as string
}
async function register(handle: string) {
  const r = await app.inject({ method: 'POST', url: '/api/agents/started', headers: human(), payload: { handle, name: handle } })
  expect(r.statusCode, r.body).toBe(201)
  return (db.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(handle) as { id: string }).id
}
/** A running run of the agent, filed by the office so it has a key, and the headers of that run: a hand-back comes only from the run that did the work. */
async function aRunOf(agentId: string) {
  const r = await app.inject({ method: 'POST', url: '/api/records', headers: { 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': THE_MESSAGE_WORKER_ID, 'x-mole-office-workspace': workspace, ...theOfficesKeyHeader() }, payload: { kind: 'session', title: 'A run', data: { state: 'running', runtime: 'claude-code', startedByMoleOffice: true, servingAgent: agentId } } })
  expect(r.statusCode, r.body).toBe(201)
  return { 'x-mole-office-session': String(r.json().record.id), 'x-mole-office-key': String(r.json().runKey?.key ?? '') }
}
async function point(title: string, line = '13s') { return file('backlog_item', title, { line, number: title, placedBy: { kind: 'person', id: THE_TEST_OFFICES_OWNER.id }, why: 'Needed', doneWhen: 'Done', state: 'todo' }) }
const words = { forTheOutside: 'Do the work and return its result.', acceptance: 'The work is done.' }
async function post(id: string, door: string, payload: Record<string, unknown>, headers = human()) { return app.inject({ method: 'POST', url: `/api/delegation/${id}/${door}`, headers, payload }) }
async function read(id: string) { const r = await app.inject({ method: 'GET', url: `/api/records/${id}`, headers: human() }); return r.json().record.data as Record<string, any> }
async function row(id: string) { const r = await app.inject({ method: 'GET', url: '/api/delegation/inside', headers: human() }); expect(r.statusCode, r.body).toBe(200); return r.json().tasks.find((x: { recordId: string }) => x.recordId === id) }
async function make(task: string, parent: object, ids: string[], extra: object = {}, headers = human()) { return post(task, 'package', { ...words, parent, pointIds: ids, ...extra, moduleIds: [await aMadeUpModuleForPackage(injectedPackageFixture(app, workspace))] }, headers) }

it('packs material and traces decisions through a parent task; counts each unfinished brief', async () => {
  const d = await file('decision', 'Owner decision')
  const p = await point('one')
  const parent = await file('task', 'Supervisor')
  const first = await make(parent, { kind: 'decision', id: d }, [p])
  expect(first.statusCode, first.body).toBe(201)
  expect(first.json().package).toMatchObject({ parent: { kind: 'decision', id: d }, lines: ['13s'], pointIds: [p], materials: [{ kind: 'bundle' }, { kind: 'decision', ref: d, says: 'Owner decision' }, { kind: 'point', ref: p, says: 'one' }] })
  expect(await read(p)).toMatchObject({ briefId: parent, briefsCarried: 1, fromDecision: d })
  const child = await file('task', 'Worker')
  const second = await make(child, { kind: 'task', id: parent }, [p])
  expect(second.statusCode, second.body).toBe(201)
  expect(await read(p)).toMatchObject({ briefId: child, briefsCarried: 2, fromDecision: d })
  const patch = await app.inject({ method: 'PATCH', url: `/api/records/${p}`, headers: human(), payload: { dataPatch: { state: 'done' } } })
  expect(patch.statusCode, patch.body).toBe(200)
  const third = await file('task', 'Another')
  const done = await make(third, { kind: 'decision', id: d }, [p])
  expect(done.statusCode, done.body).toBe(201)
  expect(await read(p)).toMatchObject({ briefId: third, briefsCarried: 2 })
})

it('takes, aligns, hands back and checks with the package maker responsible', async () => {
  const parentAgent = `parent-${n}`, worker = `worker-${n}`
  await register(parentAgent); const workerId = await register(worker); const workersRun = { ...agent(worker), ...(await aRunOf(workerId)) }
  const d = await file('decision', 'Decision')
  const p = await point('one')
  const parent = await file('task', 'Supervisor', {}, agent(parentAgent))
  const packagedParent = await make(parent, { kind: 'decision', id: d }, [p]); expect(packagedParent.statusCode, packagedParent.body).toBe(201)
  const task = await file('task', 'Worker')
  const made = await make(task, { kind: 'task', id: parent }, [p], {}, agent(parentAgent)); expect(made.statusCode, made.body).toBe(201)
  expect((await post(task, 'check', { answer: 'holds', words: 'yes' }, agent(parentAgent))).statusCode).toBe(409)
  expect((await post(task, 'take-inside', {}, agent(worker))).statusCode).toBe(201)
  expect(await row(task)).toMatchObject({ state: 'taken', inside: { takenBy: { kind: 'agent', id: workerId } } })
  expect((await post(task, 'take-inside', {}, agent(worker))).statusCode).toBe(201)
  expect((await post(task, 'hand-back', { points: [] }, workersRun)).statusCode).toBe(400)
  expect((await post(task, 'align', { restated: 'I will do it', plan: 'Build it' }, agent(worker))).statusCode).toBe(201)
  expect((await post(task, 'align-answer', { answer: 'aligned', words: 'yes' }, agent(worker))).statusCode).toBe(403)
  expect((await post(task, 'align-answer', { answer: 'differs', words: 'Change it' }, agent(parentAgent))).statusCode).toBe(201)
  expect(await row(task)).toMatchObject({ state: 'taken', inside: { alignment: 'differs' } })
  expect((await post(task, 'align', { restated: 'Changed', plan: 'Build again' }, agent(worker))).statusCode).toBe(201)
  expect((await post(task, 'align-answer', { answer: 'aligned', words: 'yes' }, agent(parentAgent))).statusCode).toBe(201)
  expect(await row(task)).toMatchObject({ state: 'aligned' })
  expect((await post(task, 'hand-back', { points: [] }, workersRun)).statusCode).toBe(400)
  const handed = await post(task, 'hand-back', { points: [{ pointId: p, outcome: 'part', words: 'Still needs review' }] }, workersRun)
  expect(handed.statusCode, handed.body).toBe(201)
  expect(handed.json().handback.points[0].words).toBe('Still needs review')
  expect(await row(task)).toMatchObject({ state: 'handed_back' })
  expect((await post(task, 'hand-back', { points: [{ pointId: p, outcome: 'done', words: 'Finished' }] }, workersRun)).statusCode).toBe(201)
  expect((await post(task, 'check', { answer: 'holds', words: 'yes' }, agent(worker))).statusCode).toBe(403)
  expect((await post(task, 'check', { answer: 'holds', words: 'yes' }, agent(parentAgent))).statusCode).toBe(201)
  expect(await row(task)).toMatchObject({ state: 'handed_back', inside: { check: 'holds' } })
  expect((await post(task, 'check', { answer: 'holds', words: 'Again' }, agent(parentAgent))).statusCode).toBe(201)
  expect((await post(task, 'hand-back', { points: [{ pointId: p, outcome: 'done', words: 'Revised' }] }, workersRun)).statusCode).toBe(201)
  expect((await post(task, 'check', { answer: 'holds', words: 'Rechecked' }, agent(parentAgent))).statusCode).toBe(201)
})

it('refuses bad parent, points and line selections by name', async () => {
  const d = await file('decision', 'Decision'); const p = await point('one'); const q = await point('two', 'other'); const task = await file('task', 'Task')
  const moduleId = await aMadeUpModuleForPackage(injectedPackageFixture(app, workspace))
  for (const [body, text] of [
    [{ parent: { kind: 'task', id: d }, pointIds: [p] }, 'parent'],
    [{ parent: { kind: 'decision', id: d }, pointIds: [d] }, 'backlog item'],
    [{ parent: { kind: 'decision', id: d }, pointIds: [p, p] }, 'duplicate'],
    [{ parent: { kind: 'decision', id: d }, pointIds: [p], line: '13s', lines: ['13s'] }, 'both'],
    [{ parent: { kind: 'decision', id: d }, pointIds: [p, q] }, 'line'],
  ] as const) { const r = await post(task, 'package', { ...words, ...body, moduleIds: [moduleId] }); expect(r.statusCode, r.body).toBe(400); expect(r.body).toContain(text) }
})

it('keeps outside packaging and its required source and suit', async () => {
  const task = await file('task', 'Outside')
  const moduleId = await aMadeUpModuleForPackage(injectedPackageFixture(app, workspace))
  const source = { file: 'design/ACCEPTANCE.md', criterion: 'F16', commit: 'abc' }
  expect((await post(task, 'package', { ...words, acceptanceSource: source, moduleIds: [moduleId] })).statusCode).toBe(400)
  expect((await post(task, 'package', { ...words, suits: 'own_module', moduleIds: [moduleId] })).statusCode).toBe(400)
  const r = await post(task, 'package', { ...words, suits: 'own_module', acceptanceSource: source, moduleIds: [moduleId] }); expect(r.statusCode, r.body).toBe(201)
  expect(r.json().package.lines).toBeUndefined()
  const outside = await app.inject({ method: 'GET', url: '/api/delegation', headers: human() }); expect(outside.json().tasks.map((x: { recordId: string }) => x.recordId)).toContain(task)
  expect(await row(task)).toBeUndefined()
})
