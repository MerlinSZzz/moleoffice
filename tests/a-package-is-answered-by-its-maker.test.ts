// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { aMadeUpModuleForPackage, injectedPackageFixture } from './module-package-fixture.ts'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { THE_MESSAGE_WORKER_ID } from '../src/shared/participants.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, theOfficesKeyHeader, type TestDb, governsTheWholeProject } from './helpers.ts'

const WORKSPACE = 'made-up-inside-makers'
const PARENT = 'made-up-parent'
const MAKER = 'made-up-maker'
const WORKER = 'made-up-worker'
const OTHER = 'made-up-other'
const SECRETARY = 'made-up-secretary'
const WORDS = { forTheOutside: 'Do the made-up work.', acceptance: 'The made-up work is done.' }
let db: TestDb
let app: FastifyInstance
const ids: Record<string, string> = {}
const person = () => ({ 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON, 'x-mole-office-workspace': WORKSPACE })
const agent = (id: string) => ({ 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': id, 'x-mole-office-workspace': WORKSPACE })
const post = (id: string, door: string, payload: Record<string, unknown>, headers: Record<string, string>) =>
  app.inject({ method: 'POST', url: `/api/delegation/${id}/${door}`, headers, payload })

async function register(handle: string, role: string, headers = person()) {
  const reply = await app.inject({ method: 'POST', url: '/api/agents/started', headers, payload: { handle, name: handle, role, chapters: ['5:full'], ...(role === 'worker' ? { workArea: ['src/server/lib'] } : {}) } })
  expect(reply.statusCode, reply.body).toBe(201)
  ids[handle] = String(reply.json().agent.id)
}
async function file(kind: string, title: string, data: Record<string, unknown> = {}, headers: Record<string, string> = person()): Promise<string> {
  const reply = await app.inject({ method: 'POST', url: '/api/records', headers, payload: { kind, title, data: kind === 'decision' ? { ...governsTheWholeProject(), replaces: [], ...data } : data } })
  expect(reply.statusCode, reply.body).toBe(201)
  return String(reply.json().record.id)
}
async function step(task: string, door: string, payload: Record<string, unknown>, headers: Record<string, string>) {
  const reply = await post(task, door, payload, headers)
  expect(reply.statusCode, `${door}: ${reply.body}`).toBe(201)
  return reply.json()
}
async function runOf(handle: string) {
  const reply = await app.inject({ method: 'POST', url: '/api/records', headers: { ...agent(THE_MESSAGE_WORKER_ID), ...theOfficesKeyHeader() }, payload: { kind: 'session', title: 'A made-up worker run', data: { state: 'running', runtime: 'claude-code', startedByMoleOffice: true, servingAgent: ids[handle] } } })
  expect(reply.statusCode, reply.body).toBe(201)
  return { ...agent(handle), 'x-mole-office-session': String(reply.json().record.id), 'x-mole-office-key': String(reply.json().runKey?.key ?? '') }
}
async function packageMadeBy(maker: Record<string, string>) {
  const decision = await file('decision', 'A made-up decision')
  const point = await file('backlog_item', 'A made-up point', { line: 'made-up-line', number: 'made-up', placedBy: { kind: 'person', id: THE_PERSON }, why: 'Made up.', doneWhen: 'Done.', state: 'todo' })
  const moduleId = await aMadeUpModuleForPackage(injectedPackageFixture(app, WORKSPACE))
  const parent = await file('task', 'A made-up parent task', {}, agent(PARENT))
  await step(parent, 'package', { ...WORDS, moduleIds: [moduleId], parent: { kind: 'decision', id: decision }, pointIds: [point] }, person())
  const task = await file('task', 'A made-up child package', {}, maker)
  await step(task, 'package', { ...WORDS, moduleIds: [moduleId], parent: { kind: 'task', id: parent }, pointIds: [point] }, maker)
  return { task, point }
}
function packageOf(task: string): Record<string, any> {
  const row = db.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(task) as { data: string }
  return JSON.parse(row.data).package
}
function noticesTo(recipient: string, task: string, notice: string): string[] {
  const rows = db.client.sqlite.prepare(`SELECT r.data AS data FROM message_delivery d JOIN records r ON r.id = d.message_id WHERE d.recipient_kind = 'agent' AND d.recipient_id = ? AND r.deleted_at IS NULL ORDER BY r.rowid`).all(ids[recipient]) as { data: string }[]
  return rows.map((row) => JSON.parse(row.data)).filter((data) => data.notice === notice && String(data.body).includes(task)).map((data) => String(data.body))
}

beforeAll(async () => {
  db = await freshDb()
  const { copyTheDefaultRegulationsOnce } = await import('../src/server/lib/default-regulations.ts')
  expect(copyTheDefaultRegulationsOnce().copied).toBeGreaterThan(0)
  app = (await apiApp()).app
  await app.ready()
  const made = await app.inject({ method: 'POST', url: '/api/workspaces', payload: { id: WORKSPACE, title: 'A made-up project' } })
  expect(made.statusCode, made.body).toBe(201)
  await register(PARENT, 'supervisor')
  await register(MAKER, 'supervisor')
  await register(WORKER, 'worker', agent(MAKER))
  await register(OTHER, 'worker', agent(MAKER))
  await register(SECRETARY, 'secretary')
}, 60_000)
afterAll(async () => { await app.close(); db.close() })

it('lets a supervisor file to its worker, answer its restatement and approve its hand-back', async () => {
  const { task, point } = await packageMadeBy(agent(MAKER))
  const run = await runOf(WORKER)
  await step(task, 'take-inside', {}, agent(WORKER))
  await step(task, 'align', { restated: 'I will do the made-up point.', plan: 'Do it.' }, agent(WORKER))
  expect(noticesTo(MAKER, task, 'packageAligned')).toHaveLength(1)
  expect(noticesTo(PARENT, task, 'packageAligned')).toHaveLength(0)
  expect((await post(task, 'align-answer', { answer: 'aligned', words: 'Yes.' }, agent(PARENT))).statusCode).toBe(403)
  await step(task, 'align-answer', { answer: 'aligned', words: 'Yes.' }, agent(MAKER))
  await step(task, 'hand-back', { points: [{ pointId: point, outcome: 'done', words: 'Done.' }] }, run)
  expect(noticesTo(MAKER, task, 'packageHandedBack')).toHaveLength(1)
  expect(noticesTo(PARENT, task, 'packageHandedBack')).toHaveLength(0)
  expect((await post(task, 'check', { answer: 'holds', words: 'Yes.' }, agent(PARENT))).statusCode).toBe(403)
  await step(task, 'check', { answer: 'holds', words: 'Yes.' }, agent(MAKER))
  await step(task, 'accept', { points: [{ pointId: point, answer: 'accepted' }] }, agent(MAKER))
  expect(packageOf(task).acceptances.at(-1).by).toEqual(packageOf(task).by)
}, 60_000)

it('lets the person answer both doors even when an agent made the package', async () => {
  const { task, point } = await packageMadeBy(agent(MAKER))
  const run = await runOf(WORKER)
  await step(task, 'take-inside', {}, agent(WORKER))
  await step(task, 'align', { restated: 'The made-up point.', plan: 'Do it.' }, agent(WORKER))
  await step(task, 'align-answer', { answer: 'aligned', words: 'Yes.' }, person())
  await step(task, 'hand-back', { points: [{ pointId: point, outcome: 'done', words: 'Done.' }] }, run)
  await step(task, 'check', { answer: 'holds', words: 'Yes.' }, person())
  expect(packageOf(task).checks.at(-1).by.actorType).toBe('human')
}, 60_000)

it('records a second take and tells the maker and the first taker', async () => {
  const { task } = await packageMadeBy(agent(MAKER))
  await step(task, 'take-inside', {}, agent(WORKER))
  const second = await step(task, 'take-inside', {}, agent(OTHER))
  expect(packageOf(task).takenInside).toHaveLength(2)
  expect(second.reminder).toEqual(expect.any(String))
  expect(noticesTo(MAKER, task, 'packageTaken')).toHaveLength(2)
  expect(noticesTo(WORKER, task, 'packageTaken')).toContainEqual(expect.stringContaining(second.reminder))
}, 60_000)

it('refuses acceptance by the taker or supervisor of a secretary-made package', async () => {
  const { task, point } = await packageMadeBy(agent(SECRETARY))
  const run = await runOf(WORKER)
  await step(task, 'take-inside', {}, agent(WORKER))
  await step(task, 'hand-back', { points: [{ pointId: point, outcome: 'done', words: 'Done.' }] }, run)
  const answer = { points: [{ pointId: point, answer: 'accepted' }] }
  for (const caller of [WORKER, PARENT]) expect((await post(task, 'accept', answer, agent(caller))).statusCode).toBe(403)
  expect(packageOf(task).acceptances).toBeUndefined()
  await step(task, 'accept', answer, agent(SECRETARY))
  expect(packageOf(task).acceptances).toHaveLength(1)
}, 60_000)
