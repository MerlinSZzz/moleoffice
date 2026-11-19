// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A NEW REFUSAL REPLACES THE OLD ONE WHOLE ON THE RUN.
 *
 * Problem o9u6zBzXqAkS. The verdict door wrote a refusal onto the run as a merge patch. A merge patch keeps
 * every key the new value leaves out, so a second refusal of the same run still showed what the first one
 * said: its precedent, its invariant, the tip it read. A reader of the run was shown evidence the second
 * check never produced.
 *
 * Now the door sends a patch that deletes every key of the old refusal the new one does not hold, at every
 * depth, so what is stored is the new refusal and nothing else. The old refusal is not lost: the run's
 * revisions still hold it, and so does the message the first refusal sent.
 *
 * WHAT THIS FILE MEASURES, against a real database and the real doors:
 *   (a) a first refusal is stored as it was sent;
 *   (b) a second refusal of the same run is stored whole and alone: no key of the first one survives in
 *       it, at the top or inside what was read;
 *   (c) the first refusal is still findable, in the run's revisions and in its message to the worker.
 *
 * MUTATION PROOFS, each after a green control, are in the commit message that meets this file.
 *
 * Every record here is synthetic, in a fresh database. Nothing reaches the live office.
 */
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

const WORKSPACE = 'default'
const WORKER = 'rw-worker'
const INSPECTOR = 'rw-inspector'
const AS_THE_PERSON = {
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
  'x-mole-office-workspace': WORKSPACE,
}
const asAgent = (id: string, session?: string): Record<string, string> => ({
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': id,
  'x-mole-office-workspace': WORKSPACE,
  ...(session === undefined ? {} : { 'x-mole-office-session': session }),
})

const FIRST = {
  verdict: 'refused',
  check: 'Test: the first check. The new test has no mutation proof.',
  missing: ['Test: no mutation proof for the new test'],
  says: { chapter: 5, precedent: 'Test-precedent-of-the-first-check', invariant: 3 },
  chaptersRead: [],
  read: { worktree: process.cwd(), tip: '0123456789abcdef0123456789abcdef01234567', ofItsOwn: true, says: 'Test: the first check read this tip.' },
}
const SECOND = {
  verdict: 'refused',
  check: 'Test: the second check. The report names no chapter it read.',
  missing: ['Test: the report names no chapter it read'],
  says: { chapter: 10 },
  chaptersRead: [],
  read: { worktree: process.cwd(), ofItsOwn: false, says: 'Test: the second check read the worktree, with no tip.' },
}

let t: TestDb
let app: FastifyInstance
let run: string
let firstStored: Record<string, unknown>

async function register(payload: Record<string, unknown>): Promise<void> {
  const reply = await app.inject({ method: 'POST', url: '/api/agents/started', headers: AS_THE_PERSON, payload })
  expect(reply.statusCode, reply.body).toBe(201)
}

async function theWorkersRun(): Promise<string> {
  const reply = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: asAgent(WORKER),
    payload: { kind: 'session', title: 'Test: a run refused twice', data: { state: 'running', servingAgent: WORKER, workingDirectory: process.cwd(), doing: 'Test: the work under check' } },
  })
  expect(reply.statusCode, reply.body).toBe(201)
  const id = (reply.json() as { record: { id: string } }).record.id
  t.client.sqlite.prepare('INSERT INTO legacy_unsealed_runs VALUES (?)').run(id)
  t.client.sqlite.prepare("UPDATE records SET data = json_set(data, '$.state', 'finished') WHERE id = ?").run(id)
  return id
}

async function aCheck(title: string): Promise<string> {
  const reply = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: asAgent(INSPECTOR),
    payload: { kind: 'session', title, data: { state: 'running', servingAgent: INSPECTOR, doing: 'Test: checking' } },
  })
  expect(reply.statusCode, reply.body).toBe(201)
  const check = (reply.json() as { record: { id: string } }).record.id
  const assembled = await app.inject({ method: 'POST', url: `/api/checks/${run}/assembled`, headers: asAgent(INSPECTOR, check), payload: { changes: [] } })
  expect(assembled.statusCode, assembled.body).toBe(201)
  return check
}

async function refuse(payload: Record<string, unknown>, check: string): Promise<void> {
  const reply = await app.inject({ method: 'POST', url: `/api/checks/${run}`, headers: asAgent(INSPECTOR, check), payload })
  expect(reply.statusCode, reply.body).toBe(201)
}

function theRefusalOnTheRun(): Record<string, unknown> {
  const row = t.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(run) as { data: string }
  return (JSON.parse(row.data) as { refused: Record<string, unknown> }).refused
}

/** Every key path in an object, at every depth, as "a.b.c". */
function pathsOf(value: unknown, prefix = ''): string[] {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return [prefix]
  return Object.entries(value as Record<string, unknown>).flatMap(([key, inner]) => pathsOf(inner, prefix === '' ? key : `${prefix}.${key}`))
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  await register({ handle: WORKER, name: 'Synthetic worker', role: 'worker' })
  await register({ handle: INSPECTOR, name: 'Synthetic inspector', role: 'inspector' })
  const area = await app.inject({
    method: 'POST',
    url: `/api/participants/agent/${WORKER}/work-area`,
    headers: AS_THE_PERSON,
    payload: { workArea: ['tests'], because: 'Test: a check of this worker needs a registered area' },
  })
  expect(area.statusCode, area.body).toBe(200)
  run = await theWorkersRun()
})

afterAll(async () => {
  await app.close()
  t.close()
})

describe('a run refused twice', () => {
  it('(a) stores the first refusal as it was sent', async () => {
    await refuse(FIRST, await aCheck('Test: the first check'))
    firstStored = theRefusalOnTheRun()
    expect(firstStored['precedent']).toBe(FIRST.says.precedent)
    expect(firstStored['invariant']).toBe(FIRST.says.invariant)
    expect((firstStored['read'] as Record<string, unknown>)['tip']).toBe(FIRST.read.tip)
  })

  it('(b) stores the second refusal whole and alone', async () => {
    await refuse(SECOND, await aCheck('Test: the second check'))
    const stored = theRefusalOnTheRun()
    expect(stored['missing']).toEqual(SECOND.missing)
    expect(stored['chapter']).toBe(10)
    expect(stored, 'the first refusal\'s precedent is not the second\'s').not.toHaveProperty('precedent')
    expect(stored, 'the first refusal\'s invariant is not the second\'s').not.toHaveProperty('invariant')
    expect(stored['read'], 'the tip the first check read is not what the second read').not.toHaveProperty('tip')
    expect((stored['read'] as Record<string, unknown>)['ofItsOwn']).toBe(false)
    const firstOnly = pathsOf(firstStored).filter((path) => !pathsOf(stored).includes(path))
    for (const path of firstOnly) {
      const kept = path.split('.').reduce<unknown>((at, key) => (at as Record<string, unknown> | undefined)?.[key], stored)
      expect(kept, `${path} of the first refusal survived into the second`).toBeUndefined()
    }
  })

  it('(c) keeps the first refusal findable in the run\'s revisions and in its message', async () => {
    const listed = await app.inject({ method: 'GET', url: `/api/records/${run}/revisions`, headers: AS_THE_PERSON })
    expect(listed.statusCode, listed.body).toBe(200)
    const { count } = listed.json() as { count: number }
    const held: (Record<string, unknown> | undefined)[] = []
    for (let seq = 1; seq <= count; seq += 1) {
      const one = await app.inject({ method: 'GET', url: `/api/records/${run}/revisions/${seq}`, headers: AS_THE_PERSON })
      expect(one.statusCode, one.body).toBe(200)
      held.push((one.json() as { content: { data: { refused?: Record<string, unknown> } } }).content.data.refused)
    }
    expect(held.some((refused) => refused?.['precedent'] === FIRST.says.precedent)).toBe(true)

    const messages = t.client.sqlite
      .prepare("SELECT data FROM records WHERE kind = 'message' AND json_extract(data, '$.aboutRun') = ?")
      .all(run) as { data: string }[]
    expect(messages.some((one) => String((JSON.parse(one.data) as { body?: unknown }).body ?? '').includes(FIRST.missing[0]!))).toBe(true)
  })
})
