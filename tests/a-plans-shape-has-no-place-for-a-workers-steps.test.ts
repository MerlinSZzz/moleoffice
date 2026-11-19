// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PLAN'S SHAPE HAS NO PLACE FOR A WORKER'S OWN STEPS. A supervisor decides the whole outcome each worker makes and
 * the package's waves; the worker decides its own steps. The shape is checked as data, so a plan that offers a place
 * for those steps is refused, and a plan that keeps to the shape is stored and read back whole.
 *
 * Everything here is made up. A throwaway database is used, and no real office or model.
 *
 * WHAT IS PROVED:
 *   1. The declared shape has exactly the keys the outcome names, and no key for a worker's steps.
 *   2. The align door refuses a plan whose worker carries `steps`, and one whose package carries `steps`, and writes
 *      no alignment for either.
 *   3. A plan in the shape is stored and is read back through the record door in the same shape.
 *   4. An older free-text plan is stored as the same words and read as text, not as a shape it does not have.
 *
 * MUTATION: add `steps` to `PLANNED_WORKER_KEYS` and read it as an array in `readAPlannedWorker`
 * (src/shared/delegation.ts). Part 1 goes red on the key list, and part 2 goes red when the door accepts a plan with
 * steps. Removing both restores green.
 */

import { aMadeUpModuleForPackage, injectedPackageFixture } from './module-package-fixture.ts'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, expect, it } from 'vitest'

import { PACKAGE_PLAN_KEYS, PLANNED_WORKER_KEYS, readAStoredPlan } from '../src/shared/delegation.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const WORKSPACE = 'plan-shape'
const MAKER = 'plan-shape-maker'
const WORKER = 'plan-shape-worker'
const WORDS = { forTheOutside: 'Do the made-up work and hand it back.', acceptance: 'The made-up work is done.' }

let t: TestDb
let app: FastifyInstance
let parent = ''
let n = 0

const asThePerson = (): Record<string, string> => ({ 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON, 'x-mole-office-workspace': WORKSPACE })
const asAgent = (handle: string): Record<string, string> => ({ 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle, 'x-mole-office-workspace': WORKSPACE })

async function file(kind: string, title: string, data: Record<string, unknown> = {}, headers = asThePerson()): Promise<string> {
  const reply = await app.inject({ method: 'POST', url: '/api/records', headers, payload: { kind, title, data } })
  expect(reply.statusCode, reply.body).toBe(201)
  return String(reply.json().record.id)
}

async function step(task: string, door: string, payload: Record<string, unknown>, headers: Record<string, string>): Promise<Record<string, any>> {
  const reply = await app.inject({ method: 'POST', url: `/api/delegation/${task}/${door}`, headers, payload })
  expect(reply.statusCode, `${door}: ${reply.body}`).toBe(201)
  return reply.json() as Record<string, any>
}

function thePackageOf(task: string): Record<string, any> {
  const row = t.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(task) as { data: string }
  return (JSON.parse(row.data) as Record<string, any>)['package']
}

async function aPackage(): Promise<{ task: string; point: string }> {
  const point = await file('backlog_item', `A made-up point ${++n}`, { line: 'a-made-up-line', number: `point-${n}`, placedBy: { kind: 'person', id: THE_PERSON }, why: 'Made up for this test.', doneWhen: 'Made up.', state: 'todo' })
  const task = await file('task', `A made-up package ${n}`, {}, asAgent(MAKER))
  await step(task, 'package', { ...WORDS, moduleIds: [await aMadeUpModuleForPackage(injectedPackageFixture(app, WORKSPACE))], parent: { kind: 'task', id: parent }, pointIds: [point] }, asAgent(MAKER))
  await step(task, 'take-inside', {}, asAgent(WORKER))
  return { task, point }
}

function thePlan(point: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    workers: [{
      worker: 'made-up-worker',
      outcome: 'The whole made-up outcome',
      points: [point],
      files: ['src/made-up/one.ts'],
      difficulty: 'middling',
      difficultyWhy: 'It changes one guarded line in one file.',
      model: 'deepseek-v4.1-flash',
      modelWhy: 'One guarded line needs no stronger model.',
      ...extra,
    }],
    waves: 1,
    waits: [],
  }
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  const made = await app.inject({ method: 'POST', url: '/api/workspaces', payload: { id: WORKSPACE, title: 'A made-up project' } })
  expect(made.statusCode, made.body).toBe(201)
  for (const handle of [MAKER, WORKER]) {
    const reply = await app.inject({ method: 'POST', url: '/api/agents/started', headers: asThePerson(), payload: { handle, name: handle } })
    expect(reply.statusCode, reply.body).toBe(201)
  }
  for (const name of ['hard', 'simple']) {
    const label = await app.inject({ method: 'POST', url: '/api/casting/labels', headers: asThePerson(), payload: { name } })
    expect(label.statusCode, label.body).toBe(201)
  }
  parent = await file('task', 'A made-up parent task', {}, asAgent(MAKER))
}, 60_000)

afterAll(async () => {
  await app?.close()
  t?.close()
})

it('1. declares the plan and worker keys the outcome names, and no key for a worker\'s steps', () => {
  expect([...PACKAGE_PLAN_KEYS]).toEqual(['workers', 'waves', 'waits'])
  expect([...PLANNED_WORKER_KEYS]).toEqual(['worker', 'outcome', 'points', 'files', 'difficulty', 'difficultyWhy', 'model', 'modelWhy'])
  for (const key of [...PACKAGE_PLAN_KEYS, ...PLANNED_WORKER_KEYS]) expect(key).not.toMatch(/step|stage|phase/i)
})

it('2. refuses a plan offering a place for steps, and writes no alignment', async () => {
  const { task, point } = await aPackage()
  const before = thePackageOf(task)
  const withWorkerSteps = await app.inject({
    method: 'POST', url: `/api/delegation/${task}/align`, headers: asAgent(WORKER),
    payload: { restated: 'I will do the made-up work.', plan: thePlan(point, { steps: ['read it', 'change it'] }) },
  })
  expect(withWorkerSteps.statusCode, withWorkerSteps.body).toBe(400)
  const withPackageSteps = await app.inject({
    method: 'POST', url: `/api/delegation/${task}/align`, headers: asAgent(WORKER),
    payload: { restated: 'I will do the made-up work.', plan: { ...thePlan(point), steps: ['read it', 'change it'] } },
  })
  expect(withPackageSteps.statusCode, withPackageSteps.body).toBe(400)
  expect(thePackageOf(task)).toEqual(before)
})

it('3. stores a plan in the shape and reads it back through the record door in that shape', async () => {
  const { task, point } = await aPackage()
  const plan = thePlan(point)
  const aligned = await step(task, 'align', { restated: 'I will do the made-up work.', plan }, asAgent(WORKER))
  expect(aligned['restatement']['plan']).toEqual(plan)
  // A DIFFICULTY THE OFFICE DOES NOT KNOW IS NOT A REFUSAL: the plan keeps the word as written, and gets a hint that
  // names the labels taken now.
  expect(aligned['hints']).toEqual([{ code: 'difficultyNotALabel', values: { worker: 'made-up-worker', difficulty: 'middling', labels: 'hard or simple' } }])
  const read = await app.inject({ method: 'GET', url: `/api/records/${task}`, headers: asThePerson() })
  expect(read.statusCode, read.body).toBe(200)
  expect(read.json().record.data.package.alignments[0].plan).toEqual(plan)
  expect(read.json().record.data.package.alignments[0].hints).toEqual(aligned['hints'])
  expect(readAStoredPlan(read.json().record.data.package.alignments[0].plan)).toEqual({ kind: 'shape', plan })
})

it('reads a custom label and the models on the rows carrying it for plan hints', async () => {
  const label = await app.inject({ method: 'POST', url: '/api/casting/labels', headers: asThePerson(), payload: { name: 'reviewing' } })
  expect(label.statusCode, label.body).toBe(201)
  const row = await app.inject({ method: 'POST', url: '/api/casting/worker', headers: asThePerson(), payload: {
    project: WORKSPACE, program: { value: 'claude-code' }, model: { value: 'made-up-review-model' }, labels: { value: 'reviewing' },
  } })
  expect(row.statusCode, row.body).toBe(201)
  const { task, point } = await aPackage()
  const plan = thePlan(point, { difficulty: 'reviewing', model: 'other-model', modelWhy: '' })
  const aligned = await step(task, 'align', { restated: 'I will do the made-up work.', plan }, asAgent(WORKER))
  expect(aligned['hints']).toContainEqual({ code: 'strongModelNoReason', values: {
    worker: 'made-up-worker', difficulty: 'reviewing', model: 'other-model', models: 'made-up-review-model',
  } })
  expect(aligned['hints'].some((hint: { code: string }) => hint.code === 'difficultyNotALabel')).toBe(false)
})

it('4. keeps an older free-text plan as the words it was and never reads a shape into it', async () => {
  const { task } = await aPackage()
  const plan = 'First read the made-up file, then change it, then test it.'
  await step(task, 'align', { restated: 'I will do the made-up work.', plan }, asAgent(WORKER))
  const stored = thePackageOf(task)['alignments'][0]
  expect(stored['plan']).toBe(plan)
  expect(stored['hints']).toEqual([])
  expect(readAStoredPlan(stored['plan'])).toEqual({ kind: 'text', text: plan })
})
