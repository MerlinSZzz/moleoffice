// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A HINT NEVER REFUSES AN ALIGNMENT. The office compares a plan with the words the owner gave on 17 November 2026
 * and answers every hint it finds, in the align door's reply and in what the package's maker is told, while the
 * alignment is recorded whatever the hints say. The supervisor may go on and its sentence for doing so is kept.
 *
 * Everything here is made up: the agents, the package, its point and every word in them. A throwaway database is
 * used, and no real office or model.
 *
 * WHAT IS PROVED:
 *   1. One plan that breaks six of the office's habits comes back with all six hints and is stored. The maker's
 *      notice carries the same hints and the supervisor's sentence for going on.
 *   2. An older free-text plan is taken as it was, answers no hint, and is quoted in the maker's notice.
 *
 * MUTATION: in `restateThePackage` (src/server/lib/delegation.ts), make the door throw when `hints.length > 0`.
 * Part 1 goes red: the align door answers 400 and no alignment is stored. Removing the throw restores green.
 */

import { aMadeUpModuleForPackage, injectedPackageFixture } from './module-package-fixture.ts'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, expect, it } from 'vitest'

import { PLAN_HINT_WORD_KEYS, readAStoredPlan } from '../src/shared/delegation.ts'
import { sayInEnglish } from '../src/shared/i18n.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const WORKSPACE = 'plan-hints'
const MAKER = 'plan-hints-maker'
const WORKER = 'plan-hints-worker'
const WORDS = { forTheOutside: 'Do the made-up work and hand it back.', acceptance: 'The made-up work is done.' }

let t: TestDb
let app: FastifyInstance
let parent = ''
let n = 0
const idOf: Record<string, string> = {}

const asThePerson = (): Record<string, string> => ({ 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON, 'x-mole-office-workspace': WORKSPACE })
const asAgent = (handle: string): Record<string, string> => ({ 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle, 'x-mole-office-workspace': WORKSPACE })

async function file(kind: string, title: string, data: Record<string, unknown> = {}, headers = asThePerson()): Promise<string> {
  const reply = await app.inject({ method: 'POST', url: '/api/records', headers, payload: { kind, title, data } })
  expect(reply.statusCode, reply.body).toBe(201)
  return String(reply.json().record.id)
}

async function register(handle: string): Promise<void> {
  const reply = await app.inject({ method: 'POST', url: '/api/agents/started', headers: asThePerson(), payload: { handle, name: handle } })
  expect(reply.statusCode, reply.body).toBe(201)
  idOf[handle] = (t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(handle) as { id: string }).id
}

/** One made-up Casting label, made as the person makes one on the Casting page. */
async function makeACastingLabel(name: string): Promise<void> {
  const reply = await app.inject({ method: 'POST', url: '/api/casting/labels', headers: asThePerson(), payload: { name } })
  expect(reply.statusCode, reply.body).toBe(201)
}

/** One made-up Casting row of the worker card for this project. The first row made is the marked one. */
async function castAWorkerRow(label: string, model: string): Promise<void> {
  const reply = await app.inject({
    method: 'POST',
    url: '/api/casting/worker',
    headers: asThePerson(),
    payload: { project: WORKSPACE, program: { value: 'claude-code' }, model: { value: model }, effort: { value: 'high' }, labels: { value: label } },
  })
  expect(reply.statusCode, reply.body).toBe(201)
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

function noticesTo(agent: string, task: string, notice: string): string[] {
  const rows = t.client.sqlite.prepare(
    `SELECT r.data AS data FROM message_delivery d JOIN records r ON r.id = d.message_id
      WHERE d.recipient_kind = 'agent' AND d.recipient_id = ? AND r.deleted_at IS NULL AND json_extract(r.data, '$.notice') = ?
      ORDER BY r.rowid`,
  ).all(agent, notice) as { data: string }[]
  return rows.map((row) => String((JSON.parse(row.data) as Record<string, unknown>)['body'])).filter((body) => body.includes(task))
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  const made = await app.inject({ method: 'POST', url: '/api/workspaces', payload: { id: WORKSPACE, title: 'A made-up project' } })
  expect(made.statusCode, made.body).toBe(201)
  for (const handle of [MAKER, WORKER]) await register(handle)
  // THE ROWS THE STRONG-MODEL HINT READS. The test makes the two labels first, as the person does on the Casting
  // page, and each row carries one of them. Simple work has a row that casts another model; hard work has the model
  // the hard worker below names.
  await makeACastingLabel('simple')
  await makeACastingLabel('hard')
  await castAWorkerRow('simple', 'a-made-up-simple-model')
  await castAWorkerRow('hard', 'deepseek-v4.1-flash')
  parent = await file('task', 'A made-up parent task', {}, asAgent(MAKER))
}, 60_000)

afterAll(async () => {
  await app?.close()
  t?.close()
})

it('1. records an alignment with every hint and tells the maker the same hints and the sentence for going on', async () => {
  const { task, point } = await aPackage()
  const plan = {
    workers: [
      {
        worker: 'made-up-one',
        outcome: 'The one made-up outcome',
        points: [point],
        files: ['src/made-up/'],
        difficulty: 'simple',
        difficultyWhy: '',
        model: 'claude-opus-4',
        modelWhy: '',
      },
      {
        worker: 'made-up-two',
        outcome: 'The other made-up outcome',
        points: [point],
        files: ['src/made-up/one.ts'],
        difficulty: 'hard',
        difficultyWhy: 'It changes one guarded line.',
        model: 'deepseek-v4.1-flash',
        modelWhy: 'One guarded line needs no stronger model.',
      },
      {
        worker: 'made-up-three',
        outcome: 'A third made-up outcome',
        points: [point],
        files: ['src/third/'],
        difficulty: 'middling',
        difficultyWhy: 'The office does not know this word, and the plan keeps it as it was written.',
        model: 'a-made-up-third-model',
        modelWhy: 'The word is the supervisor’s to choose.',
      },
    ],
    waves: 2,
    waits: [''],
  }
  const goOnWhy = 'One worker covers both files, and the second wave is worth the wait for the landing.'
  const aligned = await step(task, 'align', { restated: 'I will make the made-up outcomes.', plan, goOnWhy }, asAgent(WORKER))
  expect(aligned['hints'].map((hint: { code: string }) => hint.code)).toEqual([
    'sameFiles',
    'moreWorkersThanPoints',
    'strongModelNoReason',
    'difficultyNotALabel',
    'missingDifficultyOrReason',
    'moreThanOneWave',
    'waveWaitsForNothing',
  ])
  expect(aligned['hints'].map((hint: { code: string }) => hint.code)).not.toContain('strongModelNoModel')
  expect(aligned['restatement']['plan']).toEqual(plan)
  const stored = thePackageOf(task)
  expect(stored['alignments']).toHaveLength(1)
  expect(stored['alignments'][0]).toMatchObject({ plan, goOnWhy })
  // THE HINTS ARE WORKED OUT ONCE, BY THE DOOR, AND STORED ON THE ALIGNMENT: the page reads them rather than working
  // them out again from rows that may have moved since.
  expect(stored['alignments'][0]['hints']).toEqual(aligned['hints'])
  expect(readAStoredPlan(stored['alignments'][0].plan)).toEqual({ kind: 'shape', plan })

  const told = noticesTo(idOf[MAKER]!, task, 'packageAligned')
  expect(told).toHaveLength(1)
  for (const hint of aligned['hints'] as { code: keyof typeof PLAN_HINT_WORD_KEYS; values: Record<string, string | number> }[]) {
    expect(told[0]).toContain(sayInEnglish(PLAN_HINT_WORD_KEYS[hint.code], hint.values))
  }
  expect(told[0]).toContain(goOnWhy)

  const read = await app.inject({ method: 'GET', url: `/api/records/${task}`, headers: asThePerson() })
  expect(read.statusCode, read.body).toBe(200)
  expect(read.json().record.data.package.alignments[0].plan).toEqual(plan)
  const row = await app.inject({ method: 'GET', url: '/api/delegation/inside', headers: asThePerson() })
  expect(row.statusCode, row.body).toBe(200)
  expect(row.json().tasks.find((one: { recordId: string }) => one.recordId === task)).toMatchObject({ state: 'taken', inside: { alignment: 'waiting' } })
})

it('2. takes an older free-text plan as it was, answers no hint, and quotes it to the maker', async () => {
  const { task } = await aPackage()
  const plan = 'Stage one: read the made-up file. Stage two: change it. Stage three: test it. Stage four: report.'
  const aligned = await step(task, 'align', { restated: 'I will do the made-up work in four stages.', plan }, asAgent(WORKER))
  expect(aligned['hints']).toEqual([])
  const stored = thePackageOf(task)['alignments'][0]
  expect(stored['plan']).toBe(plan)
  expect(readAStoredPlan(stored['plan'])).toEqual({ kind: 'text', text: plan })
  expect(stored['hints']).toEqual([])
  const told = noticesTo(idOf[MAKER]!, task, 'packageAligned')
  expect(told).toHaveLength(1)
  expect(told[0]).toContain(plan)
  expect(told[0]).not.toContain(sayInEnglish('delegation.notice.noHints'))
})
