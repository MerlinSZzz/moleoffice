// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A SECRETARY RETIRES A SUPERVISOR'S ROW AND A WORKER'S. Criterion P82.
 *
 * ---------------------------------------------------------------------------------------
 * THE RULE, AND WHAT WAS MEASURED BEFORE THIS
 * ---------------------------------------------------------------------------------------
 *
 * A secretary may retire a supervisor and a worker, and a supervisor may likewise retire a worker.
 *
 * Measured on 8 September on a fresh database, with the door as it stood: a secretary asking for a
 * supervisor's row was refused 403 — *Retiring "sup" is the owner's act, or the act of the agent
 * that started it* — and a supervisor asking for a worker's row got the same. Two callers could
 * retire a row, the person and the one agent named on it as its starter, and no card was read at
 * all. The owner met it on the live office on a stray row nobody had recorded a starter for.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS MEASURED
 * ---------------------------------------------------------------------------------------
 *
 *   · a secretary retires a supervisor's row, and a worker's, neither of which it started;
 *   · a supervisor retires a worker's row it did not start;
 *   · the retirement records whose hand it was, so a reader can tell who closed the row;
 *   · a worker retires nothing above it, and the refusal says which cards are where;
 *   · the person still retires anybody, and a starter still retires what it started.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATION THAT TURNS THIS RED, WITH A CONTROL RUN FIRST
 * ---------------------------------------------------------------------------------------
 *
 *   put the starter check back as the only check in `whoMayRetire`
 *   (src/server/api/participants.ts) — return the refusal instead of comparing rungs — and every
 *   case in the first two groups goes red.
 */

import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'

import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

let t: TestDb
let app: FastifyInstance

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const asAgent = (id: string): Record<string, string> => ({
  ...AS_THE_PERSON,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': id,
})

async function register(headers: Record<string, string>, body: Record<string, unknown>): Promise<void> {
  const reply = await app.inject({ method: 'POST', url: '/api/agents/started', headers, payload: body })
  expect(reply.statusCode, reply.body).toBe(201)
}

async function retire(
  headers: Record<string, string>,
  handle: string,
  because = 'this piece of work is done',
): Promise<{ code: number; said: string }> {
  const reply = await app.inject({
    method: 'POST',
    url: `/api/participants/agent/${handle}/retire`,
    headers,
    payload: { because },
  })
  return { code: reply.statusCode, said: reply.body }
}

async function rowFor(handle: string): Promise<Record<string, unknown>> {
  const reply = await app.inject({ method: 'GET', url: `/api/participants/agent/${handle}`, headers: AS_THE_PERSON })
  expect(reply.statusCode, reply.body).toBe(200)
  return (reply.json() as Record<string, unknown>)['participant'] as Record<string, unknown>
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  // EVERY ROW IS STARTED BY THE PERSON, so nothing here passes the starter check and every case is
  // decided by rank alone. That is the whole point: a rule that only worked on rows an agent had
  // started would be the rule this criterion replaces.
  await register(AS_THE_PERSON, { handle: THE_TEST_OFFICES_SECRETARY.handle, name: THE_TEST_OFFICES_SECRETARY.name, role: 'secretary' })
  await register(AS_THE_PERSON, { handle: 'sup-one', name: 'Supervisor One', role: 'supervisor' })
  await register(AS_THE_PERSON, { handle: 'sup-two', name: 'Supervisor Two', role: 'supervisor' })
  await register(AS_THE_PERSON, { handle: 'work-one', name: 'Worker One', role: 'worker' })
  await register(AS_THE_PERSON, { handle: 'work-two', name: 'Worker Two', role: 'worker' })
  await register(AS_THE_PERSON, { handle: 'work-three', name: 'Worker Three', role: 'worker' })
  await register(AS_THE_PERSON, { handle: 'work-four', name: 'Worker Four', role: 'worker' })
})

afterAll(async () => {
  await app.close()
  t.close()
})

// ============================================================ 1. the secretary

describe('a secretary', () => {
  it('retires a supervisor’s row it did not start', async () => {
    const said = await retire(asAgent(THE_TEST_OFFICES_SECRETARY.handle), 'sup-one', 'the round is finished')
    expect(said.code, said.said).toBe(200)
    const row = await rowFor('sup-one')
    expect(row['retired']).toBe(true)
    expect(row['retiredBecause']).toBe('the round is finished')
  })

  it('retires a worker’s row it did not start', async () => {
    const said = await retire(asAgent(THE_TEST_OFFICES_SECRETARY.handle), 'work-one', 'its task is done')
    expect(said.code, said.said).toBe(200)
    expect((await rowFor('work-one'))['retired']).toBe(true)
  })

  it('is named on the row as the hand that closed it', async () => {
    // STORED BY REGISTRY ID, which for an agent registered since the mint is not its handle.
    expect((await rowFor('work-one'))['retiredBy']).toEqual({ kind: 'agent', id: (await rowFor(THE_TEST_OFFICES_SECRETARY.handle))['id'] })
  })
})

// ============================================================ 2. the supervisor

describe('a supervisor', () => {
  it('retires a worker’s row it did not start', async () => {
    const said = await retire(asAgent('sup-two'), 'work-two', 'its task is done')
    expect(said.code, said.said).toBe(200)
    expect((await rowFor('work-two'))['retiredBy']).toEqual({ kind: 'agent', id: (await rowFor('sup-two'))['id'] })
  })
})

// ============================================================ 3. downward only

describe('a worker', () => {
  it('retires nothing above it, and the refusal says which card is where', async () => {
    const said = await retire(asAgent('work-three'), 'sup-two', 'not mine to close')
    expect(said.code).toBe(403)
    expect(said.said, 'the row’s card and rung').toContain('supervisor card at rung 2')
    expect(said.said, 'and the caller’s').toContain('worker card at rung 1')
    expect(said.said).toContain('Nothing was written')
    expect((await rowFor('sup-two'))['retired'], 'nothing was written').toBe(false)
  })
})

// ============================================================ 4. what did not change

describe('the two who could always retire', () => {
  it('lets the person retire anybody', async () => {
    const said = await retire(AS_THE_PERSON, 'work-three', 'a test row')
    expect(said.code, said.said).toBe(200)
    expect((await rowFor('work-three'))['retiredBy']).toEqual({ kind: 'person', id: THE_PERSON })
  })

  it('lets a starter retire what it started, whatever card either holds', async () => {
    await register(asAgent('sup-two'), { handle: 'its-own', name: 'Its Own Worker', role: 'worker' })
    const said = await retire(asAgent('sup-two'), 'its-own', 'the work it was started for is done')
    expect(said.code, said.said).toBe(200)
    expect((await rowFor('its-own'))['retiredBy']).toEqual({ kind: 'agent', id: (await rowFor('sup-two'))['id'] })
  })
})
