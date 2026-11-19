// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PACKAGE DOORS REFUSE NO JUDGEMENT CALL. They record each act, show the newest, tell the other side and may remind.
 *
 * Everything here is made up: the agents, the run, the packages, their points and every word in them. No model, provider
 * or real office is used. `freshDb` makes a throwaway database. There is no merge queue.
 *
 * A maker makes a package and a worker takes it inside. WHAT IS PROVED, each case on its own:
 *
 *   1. The worker aligns the package twice with no change in between. Both restatements are stored, in order, and the
 *      maker is told of each. The second reply reminds that the first was waiting, and the maker's second notice says so.
 *   2. Another agent takes a package the worker holds. Both takes are stored and the newest taker is the one shown. The
 *      maker and the first taker are each told, and the first taker may no longer restate it.
 *   3. The worker restates after the maker's yes, and the maker answers the newest restatement twice. Every restatement
 *      and answer is stored, and the row shows the newest answer. The restatement after the yes puts the state back to
 *      taken until it is answered.
 *   4. The worker hands back a package whose plan nobody aligned. The hand-back is stored and the maker is told. The
 *      alignment reminder is absent by default and restored by the answer switch.
 *   5. The maker checks one hand-back twice. Both checks are stored, and the second reply reminds of the first.
 *   6. A fault of the request is still refused, and nothing is written: an answer to no restatement, a check or an
 *      acceptance of nothing handed back, a restatement by a taker who is no longer the newest, a taker answering its own
 *      restatement, and a hand-back no run key proved.
 */

import { aMadeUpModuleForPackage, injectedPackageFixture } from './module-package-fixture.ts'
import { gateNamed } from '../src/config/gates.mjs'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { THE_MESSAGE_WORKER_ID } from '../src/shared/participants.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { sayInEnglish } from '../src/shared/i18n.ts'
import { apiApp, freshDb, theOfficesKeyHeader, type TestDb } from './helpers.ts'

const WORKSPACE = 'second-acts'
const MAKER = 'second-acts-maker'
const WORKER = 'second-acts-worker'
const OTHER = 'second-acts-other'
const WORDS = { forTheOutside: 'Do the made-up work and hand it back.', acceptance: 'The made-up work is done.' }
const RESTATED = { restated: 'I will do the made-up point.', plan: 'Do it.' }

let t: TestDb
let app: FastifyInstance
let decision = ''
let parent = ''
let n = 0
const idOf: Record<string, string> = {}

const asThePerson = (): Record<string, string> => ({ 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON, 'x-mole-office-workspace': WORKSPACE })
const asAgent = (handle: string): Record<string, string> => ({ 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle, 'x-mole-office-workspace': WORKSPACE })

async function file(kind: string, title: string, data: Record<string, unknown> = {}, headers = asThePerson()): Promise<string> {
  const reply = await app.inject({ method: 'POST', url: '/api/records', headers, payload: { kind, title, data: kind === 'decision' ? { replaces: [], ...data } : data } })
  expect(reply.statusCode, reply.body).toBe(201)
  return String(reply.json().record.id)
}

async function register(handle: string): Promise<void> {
  const reply = await app.inject({ method: 'POST', url: '/api/agents/started', headers: asThePerson(), payload: { handle, name: handle } })
  expect(reply.statusCode, reply.body).toBe(201)
  idOf[handle] = (t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(handle) as { id: string }).id
}

/** A running run of the worker, filed by the office so it has a key, and the headers of that run. */
async function aRunOfTheWorker(): Promise<Record<string, string>> {
  const reply = await app.inject({
    method: 'POST', url: '/api/records',
    headers: { 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': THE_MESSAGE_WORKER_ID, 'x-mole-office-workspace': WORKSPACE, ...theOfficesKeyHeader() },
    payload: { kind: 'session', title: 'A made-up run of the worker', data: { state: 'running', runtime: 'claude-code', startedByMoleOffice: true, servingAgent: idOf[WORKER] } },
  })
  expect(reply.statusCode, reply.body).toBe(201)
  return { ...asAgent(WORKER), 'x-mole-office-session': String(reply.json().record.id), 'x-mole-office-key': String(reply.json().runKey?.key ?? '') }
}

const post = (task: string, door: string, payload: Record<string, unknown>, headers: Record<string, string>) =>
  app.inject({ method: 'POST', url: `/api/delegation/${task}/${door}`, headers, payload })

async function step(task: string, door: string, payload: Record<string, unknown>, headers: Record<string, string>): Promise<Record<string, any>> {
  const reply = await post(task, door, payload, headers)
  expect(reply.statusCode, `${door}: ${reply.body}`).toBe(201)
  return reply.json() as Record<string, any>
}

function thePackageOf(task: string): Record<string, any> {
  const row = t.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(task) as { data: string }
  return (JSON.parse(row.data) as Record<string, any>)['package']
}

async function theRow(task: string): Promise<Record<string, any>> {
  const reply = await app.inject({ method: 'GET', url: '/api/delegation/inside', headers: asThePerson() })
  expect(reply.statusCode, reply.body).toBe(200)
  return reply.json().tasks.find((one: { recordId: string }) => one.recordId === task)
}

/** Every notice of one kind one agent was handed about one task, by its delivery rows, in the order they were written. */
function noticesTo(agent: string, task: string, notice: string): string[] {
  const rows = t.client.sqlite.prepare(
    `SELECT r.data AS data FROM message_delivery d JOIN records r ON r.id = d.message_id
      WHERE d.recipient_kind = 'agent' AND d.recipient_id = ? AND r.deleted_at IS NULL AND json_extract(r.data, '$.notice') = ?
      ORDER BY r.rowid`,
  ).all(agent, notice) as { data: string }[]
  return rows.map((row) => String((JSON.parse(row.data) as Record<string, unknown>)['body'])).filter((body) => body.includes(task))
}

/** A package of one point, made by the maker under its own packaged parent. */
async function aPackage(): Promise<{ task: string; point: string }> {
  const point = await file('backlog_item', `A made-up point ${++n}`, { line: 'a-made-up-line', number: `point-${n}`, placedBy: { kind: 'person', id: THE_PERSON }, why: 'Made up for this test.', doneWhen: 'Made up.', state: 'todo' })
  const task = await file('task', `A made-up package ${n}`, {}, asAgent(MAKER))
  await step(task, 'package', { ...WORDS, moduleIds: [await aMadeUpModuleForPackage(injectedPackageFixture(app, WORKSPACE))], parent: { kind: 'task', id: parent }, pointIds: [point] }, asAgent(MAKER))
  return { task, point }
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  const made = await app.inject({ method: 'POST', url: '/api/workspaces', payload: { id: WORKSPACE, title: 'A made-up project' } })
  expect(made.statusCode, made.body).toBe(201)
  for (const handle of [MAKER, WORKER, OTHER]) await register(handle)
  decision = await file('decision', 'A made-up decision above the packages')
  const above = await file('backlog_item', 'A made-up point above', { line: 'a-made-up-line', number: 'above', placedBy: { kind: 'person', id: THE_PERSON }, why: 'Made up.', doneWhen: 'Made up.', state: 'todo' })
  parent = await file('task', 'A made-up parent task', {}, asAgent(MAKER))
  await step(parent, 'package', { ...WORDS, moduleIds: [await aMadeUpModuleForPackage(injectedPackageFixture(app, WORKSPACE))], parent: { kind: 'decision', id: decision }, pointIds: [above] }, asAgent(MAKER))
}, 60_000)

afterAll(async () => {
  await app?.close()
  t?.close()
})

describe('the package doors record what they used to refuse', () => {
  it('1. stores both of two alignments with no change between them, and tells the maker of each', async () => {
    const { task } = await aPackage()
    await step(task, 'take-inside', {}, asAgent(WORKER))
    const first = await step(task, 'align', RESTATED, asAgent(WORKER))
    expect(first['reminder']).toBeUndefined()
    const second = await step(task, 'align', RESTATED, asAgent(WORKER))
    const stored = thePackageOf(task)['alignments']
    expect(stored).toHaveLength(2)
    expect(stored).toEqual([first['restatement'], second['restatement']])
    for (const one of stored) expect(one).toMatchObject(RESTATED)
    expect(stored[1].order).toBeGreaterThan(stored[0].order)
    const told = noticesTo(idOf[MAKER]!, task, 'packageAligned')
    expect(told).toHaveLength(2)
    expect(second['reminder']).toContain(stored[0].at)
    expect(told[1]).toContain(second['reminder'])
    expect(await theRow(task)).toMatchObject({ state: 'taken', inside: { alignment: 'waiting' } })
  })

  it('2. stores a second take by another agent, shows the newest taker, and tells the maker and the first taker', async () => {
    const { task } = await aPackage()
    await step(task, 'take-inside', {}, asAgent(WORKER))
    const second = await step(task, 'take-inside', {}, asAgent(OTHER))
    expect(thePackageOf(task)['takenInside']).toHaveLength(2)
    expect(second['reminder']).toContain(WORKER)
    expect(await theRow(task)).toMatchObject({ state: 'taken', inside: { takenBy: { kind: 'agent', id: idOf[OTHER] } } })
    expect(noticesTo(idOf[MAKER]!, task, 'packageTaken')).toHaveLength(2)
    const toTheFirst = noticesTo(idOf[WORKER]!, task, 'packageTaken')
    expect(toTheFirst).toHaveLength(1)
    expect(toTheFirst[0]).toContain(second['reminder'])
    expect((await post(task, 'align', RESTATED, asAgent(WORKER))).statusCode).toBe(403)
    await step(task, 'align', RESTATED, asAgent(OTHER))
  })

  it('3. stores a restatement after a yes and a second answer, shows the newest answer, and is taken until answered', async () => {
    const { task } = await aPackage()
    await step(task, 'take-inside', {}, asAgent(WORKER))
    await step(task, 'align', RESTATED, asAgent(WORKER))
    await step(task, 'align-answer', { answer: 'aligned', words: 'Yes.' }, asAgent(MAKER))
    expect(await theRow(task)).toMatchObject({ state: 'aligned', inside: { alignment: 'aligned' } })
    const again = await step(task, 'align', { restated: 'I will do it another way.', plan: 'Do it the other way.' }, asAgent(WORKER))
    expect(again['reminder']).toEqual(expect.any(String))
    expect(await theRow(task)).toMatchObject({ state: 'taken', inside: { alignment: 'waiting' } })
    await step(task, 'align-answer', { answer: 'differs', words: 'Not that way.' }, asAgent(MAKER))
    expect(await theRow(task)).toMatchObject({ state: 'taken', inside: { alignment: 'differs' } })
    const changed = await step(task, 'align-answer', { answer: 'aligned', words: 'That way after all.' }, asAgent(MAKER))
    expect(changed['reminder']).toEqual(expect.any(String))
    expect(noticesTo(idOf[WORKER]!, task, 'packageAlignAnswered').at(-1)).toContain(changed['reminder'])
    expect(thePackageOf(task)['alignments']).toHaveLength(2)
    expect(thePackageOf(task)['alignmentAnswers']).toHaveLength(3)
    expect(await theRow(task)).toMatchObject({ state: 'aligned', inside: { alignment: 'aligned' } })
  })

  it('4. stores a hand-back whose plan nobody aligned, without an alignment reminder by default', async () => {
    const { task, point } = await aPackage()
    const run = await aRunOfTheWorker()
    await step(task, 'take-inside', {}, asAgent(WORKER))
    const handed = await step(task, 'hand-back', { points: [{ pointId: point, outcome: 'done', words: 'Built.' }] }, run)
    expect(handed['reminder']).toBeUndefined()
    expect(thePackageOf(task)['handedBack']).toHaveLength(1)
    expect(await theRow(task)).toMatchObject({ state: 'handed_back', inside: { alignment: 'none', handedBack: true } })
    const told = noticesTo(idOf[MAKER]!, task, 'packageHandedBack')
    expect(told).toHaveLength(1)
    expect(told[0]).not.toContain(sayInEnglish('delegation.reminder.handedBackUnaligned'))
  })

  it('4a. the answer switch restores the reminder and still stores an unaligned hand-back', async () => {
    vi.stubEnv(gateNamed('package-alignment-answer').setting, '1')
    try {
      const { task, point } = await aPackage()
      const run = await aRunOfTheWorker()
      await step(task, 'take-inside', {}, asAgent(WORKER))
      const handed = await step(task, 'hand-back', { points: [{ pointId: point, outcome: 'done', words: 'Built.' }] }, run)
      expect(handed['reminder']).toBe(sayInEnglish('delegation.reminder.handedBackUnaligned'))
      expect(thePackageOf(task)['handedBack']).toHaveLength(1)
      expect(noticesTo(idOf[MAKER]!, task, 'packageHandedBack')[0]).toContain(handed['reminder'])
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('5. stores a second check of one hand-back, with a reminder of the first', async () => {
    const { task, point } = await aPackage()
    const run = await aRunOfTheWorker()
    await step(task, 'take-inside', {}, asAgent(WORKER))
    await step(task, 'align', RESTATED, asAgent(WORKER))
    await step(task, 'align-answer', { answer: 'aligned', words: 'Yes.' }, asAgent(MAKER))
    await step(task, 'hand-back', { points: [{ pointId: point, outcome: 'done', words: 'Built.' }] }, run)
    const first = await step(task, 'check', { answer: 'holds', words: 'It holds.' }, asAgent(MAKER))
    expect(first['reminder']).toBeUndefined()
    const second = await step(task, 'check', { answer: 'refused', words: 'On a second look it does not.' }, asAgent(MAKER))
    expect(second['reminder']).toContain(first['check'].at)
    expect(thePackageOf(task)['checks']).toEqual([first['check'], second['check']])
    expect(await theRow(task)).toMatchObject({ inside: { check: 'refused', checkWords: 'On a second look it does not.' } })
  })

  it('6. still refuses a fault of the request, and writes nothing', async () => {
    const { task, point } = await aPackage()
    const run = await aRunOfTheWorker()
    await step(task, 'take-inside', {}, asAgent(WORKER))
    const before = thePackageOf(task)
    expect((await post(task, 'align-answer', { answer: 'aligned', words: 'Yes.' }, asAgent(MAKER))).statusCode).toBe(409)
    expect((await post(task, 'check', { answer: 'holds', words: 'It holds.' }, asAgent(MAKER))).statusCode).toBe(409)
    expect((await post(task, 'accept', { points: [{ pointId: point, answer: 'accepted' }] }, asAgent(MAKER))).statusCode).toBe(409)
    expect((await post(task, 'hand-back', { points: [{ pointId: point, outcome: 'done', words: 'Built.' }] }, asAgent(WORKER))).statusCode).toBe(403)
    expect(thePackageOf(task)).toEqual(before)
    await step(task, 'align', RESTATED, asAgent(WORKER))
    expect((await post(task, 'align-answer', { answer: 'aligned', words: 'Mine.' }, asAgent(WORKER))).statusCode).toBe(403)
    await step(task, 'take-inside', {}, asAgent(OTHER))
    const held = thePackageOf(task)
    expect((await post(task, 'align', RESTATED, asAgent(WORKER))).statusCode).toBe(403)
    expect((await post(task, 'hand-back', { points: [{ pointId: point, outcome: 'done', words: 'Built.' }] }, run)).statusCode).toBe(403)
    expect(thePackageOf(task)).toEqual(held)
  })
})
