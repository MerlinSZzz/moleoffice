// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PACKAGE'S MAKER ACCEPTS ITS POINTS, AND NOTHING ELSE TICKS THEM.
 *
 * Everything here is made up: the agents, the run, the package, its points and every word in them. No model, provider
 * or real office is used. `freshDb` makes a throwaway database. There is no merge queue, no merge entry and no git tree:
 * a point is ticked by its maker's answer at the accept door, and by nothing a landing does.
 *
 * A maker makes a package of three points, a worker takes it inside, aligns with the maker and hands every point back
 * as done. WHAT IS PROVED: the taker and an agent that is not the maker may not accept. The maker accepts two points
 * and returns the third with words. The two are done, and the package holds who accepted them and when. The third is
 * not done, its words are on the package, and the taker is told them. The task stays open until the taker hands the
 * third point back again and the maker accepts it, and then the package, its task and the plan block linked to it are
 * done.
 */

import { aMadeUpModuleForPackage, injectedPackageFixture } from './module-package-fixture.ts'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_MESSAGE_WORKER_ID } from '../src/shared/participants.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, theOfficesKeyHeader, type TestDb, governsTheWholeProject } from './helpers.ts'

const WORKSPACE = 'accept-points'
const MAKER = 'accept-maker'
const WORKER = 'accept-worker'
const STRANGER = 'accept-stranger'
const WORDS = { forTheOutside: 'Do the made-up work and hand it back.', acceptance: 'The made-up work is done.' }
const PERSON = { type: 'human', id: THE_PERSON } as const
const A_STAMP = /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/

let t: TestDb
let app: FastifyInstance
const idOf: Record<string, string> = {}

const asThePerson = (): Record<string, string> => ({ 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON, 'x-mole-office-workspace': WORKSPACE })
const asAgent = (handle: string): Record<string, string> => ({ 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle, 'x-mole-office-workspace': WORKSPACE })

async function file(kind: string, title: string, data: Record<string, unknown> = {}, headers = asThePerson()): Promise<string> {
  const reply = await app.inject({ method: 'POST', url: '/api/records', headers, payload: { kind, title, data: kind === 'decision' ? { ...governsTheWholeProject(), replaces: [], ...data } : data } })
  expect(reply.statusCode, reply.body).toBe(201)
  return String(reply.json().record.id)
}

async function register(handle: string): Promise<void> {
  const reply = await app.inject({ method: 'POST', url: '/api/agents/started', headers: asThePerson(), payload: { handle, name: handle } })
  expect(reply.statusCode, reply.body).toBe(201)
  idOf[handle] = (t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(handle) as { id: string }).id
}

/** A running run of the worker, filed by the office so it has a key, and the headers of that run. */
async function aRunOfTheWorker(): Promise<{ id: string; headers: Record<string, string> }> {
  const reply = await app.inject({
    method: 'POST', url: '/api/records',
    headers: { 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': THE_MESSAGE_WORKER_ID, 'x-mole-office-workspace': WORKSPACE, ...theOfficesKeyHeader() },
    payload: { kind: 'session', title: 'A made-up run of the worker', data: { state: 'running', runtime: 'claude-code', startedByMoleOffice: true, servingAgent: idOf[WORKER] } },
  })
  expect(reply.statusCode, reply.body).toBe(201)
  const id = String(reply.json().record.id)
  return { id, headers: { ...asAgent(WORKER), 'x-mole-office-session': id, 'x-mole-office-key': String(reply.json().runKey?.key ?? '') } }
}

const post = (task: string, door: string, payload: Record<string, unknown>, headers: Record<string, string>) =>
  app.inject({ method: 'POST', url: `/api/delegation/${task}/${door}`, headers, payload })

async function step(task: string, door: string, payload: Record<string, unknown>, headers: Record<string, string>): Promise<Record<string, any>> {
  const reply = await post(task, door, payload, headers)
  expect(reply.statusCode, `${door}: ${reply.body}`).toBe(201)
  return reply.json() as Record<string, any>
}

function dataOf(id: string): Record<string, any> {
  const row = t.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(id) as { data: string }
  return JSON.parse(row.data) as Record<string, any>
}

async function theRow(task: string): Promise<Record<string, any>> {
  const reply = await app.inject({ method: 'GET', url: '/api/delegation/inside', headers: asThePerson() })
  expect(reply.statusCode, reply.body).toBe(200)
  return reply.json().tasks.find((one: { recordId: string }) => one.recordId === task)
}

/** Every message one agent was handed about one run, by its delivery rows, in the order they were written. */
function noticesTo(agent: string, run: string): { notice: unknown; body: string }[] {
  const rows = t.client.sqlite.prepare(
    `SELECT r.data AS data FROM message_delivery d JOIN records r ON r.id = d.message_id
      WHERE d.recipient_kind = 'agent' AND d.recipient_id = ? AND r.deleted_at IS NULL AND json_extract(r.data, '$.aboutRun') = ?
      ORDER BY r.rowid`,
  ).all(agent, run) as { data: string }[]
  return rows.map((row) => {
    const data = JSON.parse(row.data) as Record<string, unknown>
    return { notice: data['notice'], body: String(data['body']) }
  })
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  const made = await app.inject({ method: 'POST', url: '/api/workspaces', payload: { id: WORKSPACE, title: 'A made-up project' } })
  expect(made.statusCode, made.body).toBe(201)
  for (const handle of [MAKER, WORKER, STRANGER]) await register(handle)
}, 60_000)

afterAll(async () => {
  await app?.close()
  t?.close()
})

describe('a maker accepts two points of a package and returns one', () => {
  it('marks the two done with who accepted and when, sends the third back with its words, and closes on the last', async () => {
    const decision = await file('decision', 'A made-up decision above the package')
    const points: string[] = []
    for (const says of ['A made-up first point', 'A made-up second point', 'A made-up third point']) {
      points.push(await file('backlog_item', says, { line: 'a-made-up-line', number: says, placedBy: { kind: 'person', id: THE_PERSON }, why: 'Made up for this test.', doneWhen: 'Made up.', state: 'todo' }))
    }
    const parent = await file('task', 'A made-up parent task', {}, asAgent(MAKER))
    await step(parent, 'package', { ...WORDS, moduleIds: [await aMadeUpModuleForPackage(injectedPackageFixture(app, WORKSPACE))], parent: { kind: 'decision', id: decision }, pointIds: points }, asAgent(MAKER))
    const task = await file('task', 'A made-up package of three points', {}, asAgent(MAKER))
    await step(task, 'package', { ...WORDS, moduleIds: [await aMadeUpModuleForPackage(injectedPackageFixture(app, WORKSPACE))], parent: { kind: 'task', id: parent }, pointIds: points }, asAgent(MAKER))
    const plan = await file('pipeline', 'A made-up plan', { blockIds: [] })
    const block = t.blocks.addBlock(plan, { name: 'A made-up block linked to the task', state: 'doing' }, PERSON).block.id
    t.api.createLink({ fromId: block, toId: task, type: 'relates_to', actor: PERSON })
    const run = await aRunOfTheWorker()

    await step(task, 'take-inside', {}, asAgent(WORKER))
    await step(task, 'align', { restated: 'I will do the three made-up points.', plan: 'Do them.' }, asAgent(WORKER))
    await step(task, 'align-answer', { answer: 'aligned', words: 'Yes.' }, asAgent(MAKER))
    const allDone = points.map((pointId) => ({ pointId, outcome: 'done', words: 'Built.' }))
    const handedBack = (await step(task, 'hand-back', { points: allDone }, run.headers))['handback']
    for (const point of points) expect(dataOf(point)['state'], point).toBe('todo')

    // THE TAKER MAY NOT ACCEPT ITS OWN WORK, AND NOR MAY AN AGENT THAT DID NOT MAKE THE PACKAGE. Nothing is written.
    const two = [{ pointId: points[0]!, answer: 'accepted' }, { pointId: points[1]!, answer: 'accepted' }]
    const third = { pointId: points[2]!, answer: 'returned', words: 'The third point is not built: its page draws nothing.' }
    for (const who of [WORKER, STRANGER]) {
      const refused = await post(task, 'accept', { points: [...two, third] }, asAgent(who))
      expect(refused.statusCode, refused.body).toBe(403)
    }
    expect(dataOf(task)['package']['acceptances']).toBeUndefined()

    // THE MAKER ACCEPTS TWO AND RETURNS ONE, in one answer.
    const answered = await step(task, 'accept', { points: [...two, third] }, asAgent(MAKER))
    const acceptance = dataOf(task)['package']['acceptances'].at(-1)
    expect(answered['acceptance']).toEqual(acceptance)
    expect(acceptance.by).toEqual(dataOf(task)['package']['by'])
    expect(acceptance.at).toMatch(A_STAMP)
    expect(acceptance.at >= handedBack.at).toBe(true)
    expect(acceptance.points).toEqual([...two, third])
    expect(dataOf(points[0]!)['state']).toBe('done')
    expect(dataOf(points[1]!)['state']).toBe('done')
    expect(dataOf(points[2]!)['state']).toBe('todo')
    expect(dataOf(task)['state']).not.toBe('done')
    expect(dataOf(block)['state']).toBe('doing')
    expect((await theRow(task))['state']).toBe('returned')
    const toTheTaker = noticesTo(idOf[WORKER]!, run.id).filter((one) => one.notice === 'packageReturned')
    expect(toTheTaker).toHaveLength(1)
    expect(toTheTaker[0]!.body).toContain(third.words)
    expect(toTheTaker[0]!.body).toContain(points[2]!)

    // THE TAKER HANDS THE THIRD BACK AGAIN, AND THE MAKER ACCEPTS IT: only now is the package, its task and its block done.
    await step(task, 'hand-back', { points: points.map((pointId, at) => ({ pointId, outcome: 'done', words: at === 2 ? 'Its page draws it now.' : 'Built.' })) }, run.headers)
    expect(dataOf(task)['state']).not.toBe('done')
    expect((await theRow(task))['state']).toBe('handed_back')
    await step(task, 'accept', { points: [{ pointId: points[2]!, answer: 'accepted' }] }, asAgent(MAKER))
    for (const point of points) expect(dataOf(point)['state'], point).toBe('done')
    expect(dataOf(task)['package']['acceptances']).toHaveLength(2)
    expect(dataOf(task)['state']).toBe('done')
    expect(dataOf(block)['state']).toBe('done')
    expect((await theRow(task))['state']).toBe('done')
    expect(noticesTo(idOf[WORKER]!, run.id).filter((one) => one.notice === 'packageAccepted')).toHaveLength(1)

    // NO MERGE ENTRY, NO LANDING: nothing in this office was ever queued.
    expect((t.client.sqlite.prepare("SELECT COUNT(*) AS n FROM records WHERE kind = 'merge_entry'").get() as { n: number }).n).toBe(0)
  }, 60_000)

  it('lets the person accept a package whole, and refuses an answer that names a point twice or one not in the package', async () => {
    const decision = await file('decision', 'A made-up decision above the whole package')
    const points = [
      await file('backlog_item', 'A made-up whole point', { line: 'a-made-up-line', number: 'whole-1', placedBy: { kind: 'person', id: THE_PERSON }, why: 'Made up.', doneWhen: 'Made up.', state: 'todo' }),
      await file('backlog_item', 'A made-up whole point too', { line: 'a-made-up-line', number: 'whole-2', placedBy: { kind: 'person', id: THE_PERSON }, why: 'Made up.', doneWhen: 'Made up.', state: 'todo' }),
    ]
    const task = await file('task', 'A made-up package the person accepts whole')
    await step(task, 'package', { ...WORDS, moduleIds: [await aMadeUpModuleForPackage(injectedPackageFixture(app, WORKSPACE))], parent: { kind: 'decision', id: decision }, pointIds: points }, asThePerson())
    const run = await aRunOfTheWorker()
    expect((await post(task, 'accept', { points: [{ pointId: points[0]!, answer: 'accepted' }] }, asThePerson())).statusCode).toBe(409)
    await step(task, 'take-inside', {}, asAgent(WORKER))
    await step(task, 'align', { restated: 'I will do both.', plan: 'Do them.' }, asAgent(WORKER))
    await step(task, 'align-answer', { answer: 'aligned', words: 'Yes.' }, asThePerson())
    await step(task, 'hand-back', { points: points.map((pointId) => ({ pointId, outcome: 'done', words: 'Built.' })) }, run.headers)

    for (const wrong of [
      [{ pointId: points[0]!, answer: 'accepted' }, { pointId: points[0]!, answer: 'accepted' }],
      [{ pointId: 'not-a-point-of-this-package', answer: 'accepted' }],
      [{ pointId: points[0]!, answer: 'returned' }],
    ]) {
      const refused = await post(task, 'accept', { points: wrong }, asThePerson())
      expect(refused.statusCode, refused.body).toBe(400)
    }
    expect(dataOf(task)['package']['acceptances']).toBeUndefined()

    await step(task, 'accept', { points: points.map((pointId) => ({ pointId, answer: 'accepted' })) }, asThePerson())
    for (const point of points) expect(dataOf(point)['state'], point).toBe('done')
    expect(dataOf(task)['package']['acceptances'].at(-1).by).toEqual({ actorType: 'human', actorId: THE_PERSON })
    expect(dataOf(task)['state']).toBe('done')
    expect((await theRow(task))['state']).toBe('done')
  }, 60_000)
})
