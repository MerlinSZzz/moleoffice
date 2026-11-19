// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * EVERYTHING WHOSE MOVE IS THE PERSON'S REACHES WAITING ON YOU, EACH WITH ITS ONE PRESS. This answers problem
 * qpq63k1PiBNb. By the owner's decision, what is counted for the person is what truly needs their decision or
 * action.
 *
 * The fix landed on 25 September 2026 (readWaiting lists every live whose_move person record, a visiting credential
 * and an unread message to the person; the door refuses their options under whose_move agent), and
 * tests/waiting-on-you-lists-everything-that-waits.test.ts proves a problem, a credential and a message. This file pins
 * the rest of what the problem asks, measured in a fresh office on 29 September 2026:
 *   1. a TASK whose move is the person's is on GET /api/waiting beside a problem, a message to the person and a credential, and every
 *      row names its act, says why in words and has somewhere to go;
 *   2. a task whose move is the person's and whose state says it is finished is not;
 *   3. GET /api/needs-you never answers as if nothing waited while GET /api/waiting holds rows: it carries the same
 *      counts and points at that door;
 *   4. a task filed with options for the person under whose_move agent is refused, and the refusal names the field to set.
 *
 * Three-run proof, this whole file each time:
 *   node tools/run-named-tests.mjs tests/everything-whose-move-is-the-persons-reaches-waiting-on-you.test.ts
 * Mutations, one at a time, restored with cp and checked with cmp:
 *   A. src/server/lib/waiting.ts `recordsWhereSomebodyAsked`: `readWhoseMove(row as PanelRecord).move === 'person'` to
 *      `readWhoseMove(row as PanelRecord).move === 'person' && row.kind !== 'task'`: case 1 goes red.
 *   B. src/server/lib/waiting.ts `hasEnded`: `return progressOf(word) === 'finished'` to `return false`: case 2 goes red.
 *   C. src/server/api/needs-you.ts: `This door lists only those acts. ${everything}` to `This door lists only those
 *      acts.`: case 3 goes red.
 */
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import type { WaitingItem } from '../src/server/lib/waiting.ts'
import { whereAWaitingRowGoes } from '../src/web/lib/waiting.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const AS_ARGUS = { ...AS_THE_PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': THE_TEST_OFFICES_SECRETARY.handle }

let t: TestDb
let app: FastifyInstance
const ids: Record<string, string> = {}

async function file(kind: string, title: string, data: Record<string, unknown>): Promise<{ status: number; body: string; id: string | null }> {
  const reply = await app.inject({ method: 'POST', url: '/api/records', headers: AS_ARGUS, payload: { kind, title, data } })
  return { status: reply.statusCode, body: reply.body, id: reply.statusCode === 201 ? (reply.json() as { record: { id: string } }).record.id : null }
}

async function waiting(): Promise<{ items: WaitingItem[]; counts: { settle: number; asked: number; setAside: number } }> {
  const reply = await app.inject({ method: 'GET', url: '/api/waiting', headers: AS_THE_PERSON })
  expect(reply.statusCode, reply.body).toBe(200)
  return reply.json() as { items: WaitingItem[]; counts: { settle: number; asked: number; setAside: number } }
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  const secretary = await app.inject({ method: 'POST', url: '/api/agents/started', headers: AS_THE_PERSON, payload: { handle: THE_TEST_OFFICES_SECRETARY.handle, name: THE_TEST_OFFICES_SECRETARY.name, role: 'secretary' } })
  expect(secretary.statusCode, secretary.body).toBe(201)

  for (const [key, kind, title, data] of [
    ['problem', 'problem', 'Test: a problem whose move is the person’s', { symptom: 'a made-up symptom', whose_move: 'person', state: 'open' }],
    ['task', 'task', 'Test: a task whose move is the person’s', { whose_move: 'person', state: 'todo' }],
    ['finished', 'task', 'Test: a finished task that once was the person’s', { whose_move: 'person', state: 'done' }],
    ['message', 'message', 'Test: a question for the person', { body: 'Which of the two made-up plans first?', to: [{ kind: 'person', id: THE_PERSON }] }],
  ] as const) {
    const made = await file(kind, title, data)
    expect(made.status, made.body).toBe(201)
    ids[key] = made.id as string
  }
  const visitor = await app.inject({
    method: 'POST',
    url: '/api/office/visitors',
    headers: AS_THE_PERSON,
    payload: { handle: 'test-visitor', name: 'Test visitor', role: 'worker', conversationPath: '/test/visitor.jsonl', startDirectory: '/test/visitor' },
  })
  expect(visitor.statusCode, visitor.body).toBe(201)
  ids['credential'] = ((visitor.json() as { credential: { id: string } }).credential).id
})

afterAll(async () => {
  await app?.close()
  t?.close()
})

describe('everything whose move is the person’s reaches Waiting on you', () => {
  it('1: a task beside a problem, a message and a credential, each with its act, its reason and its way there', async () => {
    const { items } = await waiting()
    const row = (id: string): WaitingItem | undefined => items.find((one) => one.id === id)
    expect(row(ids['problem'] as string)?.act).toBe('answer')
    expect(row(ids['task'] as string)?.act).toBe('answer')
    expect(row(ids['message'] as string)?.act).toBe('read')
    expect(row(ids['credential'] as string)?.act).toBe('confirm')
    for (const key of ['problem', 'task', 'message', 'credential']) {
      const one = row(ids[key] as string)
      expect(one, `${key} is not on the list`).toBeDefined()
      expect(one?.why.trim().length, `${key} says no reason`).toBeGreaterThan(0)
      expect(whereAWaitingRowGoes(one as WaitingItem).length, `${key} goes nowhere`).toBeGreaterThan(0)
    }
  })

  it('2: a task whose state says it is finished is not waiting, whatever whose_move still says', async () => {
    const { items } = await waiting()
    expect(items.map((one) => one.id)).not.toContain(ids['finished'])
  })

  it('3: GET /api/needs-you carries the same counts and points at GET /api/waiting', async () => {
    const all = await waiting()
    const reply = await app.inject({ method: 'GET', url: '/api/needs-you', headers: AS_THE_PERSON })
    expect(reply.statusCode, reply.body).toBe(200)
    const needsYou = reply.json() as { waiting: { settle: number; asked: number; setAside: number }; note: string }
    expect(needsYou.waiting).toEqual(all.counts)
    expect(all.counts.asked + all.counts.settle).toBeGreaterThan(0)
    expect(needsYou.note).not.toMatch(/nothing is waiting on you/i)
    expect(needsYou.note).toContain('GET /api/waiting')
    expect(needsYou.note).toContain(`${String(all.counts.asked)} asked of the person`)
  })

  it('4: a task with options for the person under whose_move agent is refused, and the refusal names the field', async () => {
    const refused = await file('task', 'Test: options filed as the agent move', {
      whose_move: 'agent',
      options: [{ id: 'a', label: 'Test plan A' }, { id: 'b', label: 'Test plan B' }],
    })
    expect(refused.status, refused.body).toBe(409)
    expect(refused.body).toContain('whose_move')
    expect(refused.body).toContain('\\"person\\"')
    expect(refused.body).toContain('Nothing was written.')
  })
})
