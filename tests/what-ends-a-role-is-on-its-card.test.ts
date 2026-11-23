// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT ENDS A ROLE IS ON ITS CARD, AND AN AGENT WHOSE END HAS COME IS RETIRED WITH THE REASON.
 *
 * Criterion P15 of design/permissions/ACCEPTANCE.md, on answer 2: an end may be marked in more than
 * one way. *Measured: a worker whose task is released is retired with "the task it was
 * started for was released", and its handle is not reused.* The last clause was replaced by
 * a decision (criterion I3 of design/agents/IDENTITY-ACCEPTANCE.md): the handle is
 * free again after retirement, for a new agent with a new id.
 *
 * THE AGENT SAYING IT IS DONE IS NOT WHAT ENDS IT. The design: when a worker under it sends a message
 * saying it has ended, it has not really ended. So the end is somebody else releasing the work, which is what
 * this proves — and an agent that named no work has no end to come and is never touched.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

let t: TestDb
let app: FastifyInstance

const AS_THE_PERSON = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }

function rowFor(handle: string): Record<string, unknown> | undefined {
  return t.client.sqlite.prepare('SELECT * FROM agents WHERE handle = ?').get(handle) as Record<string, unknown> | undefined
}

async function register(body: Record<string, unknown>): Promise<number> {
  const reply = await app.inject({ method: 'POST', url: '/api/agents/started', headers: AS_THE_PERSON, payload: body })
  return reply.statusCode
}

/** A task, and a live claim on it filed by a run. Returns the task id and the claim id. */
async function aTaskSomebodyIsWorkingOn(title: string): Promise<{ task: string; claim: string }> {
  const task = t.api.createRecord({
    workspaceId: 'default',
    kind: 'task',
    title,
    data: { state: 'doing' },
    actor: { type: 'human', id: THE_PERSON },
  }).id
  const run = t.api.createRecord({
    workspaceId: 'default',
    kind: 'session',
    title: `The run working on ${title}`,
    data: { state: 'running' },
    actor: { type: 'human', id: THE_PERSON },
  }).id
  const filed = await app.inject({
    method: 'POST',
    url: '/api/claims',
    headers: AS_THE_PERSON,
    payload: { run, things: [{ what: 'record', id: task }] },
  })
  expect(filed.statusCode, filed.body).toBe(201)
  return { task, claim: String((filed.json() as { claim: { id: string } }).claim.id) }
}

async function release(claim: string): Promise<number> {
  const reply = await app.inject({
    method: 'POST',
    url: `/api/claims/${claim}/release`,
    headers: AS_THE_PERSON,
    payload: { because: 'The work is done and checked.' },
  })
  return reply.statusCode
}

beforeAll(async () => {
  t = await freshDb()
  const built = await apiApp()
  app = built.app
  await app.ready()
})

afterAll(async () => {
  await app.close()
  t.close()
})

describe('every card says what ends the role it describes', () => {
  it('has a "what ends it" line on all five, and none of them is empty', async () => {
    const { theRoleCards } = await import('../src/server/lib/roles.ts')
    for (const card of theRoleCards().cards) {
      expect(card.whatEndsIt.trim().length, `the ${card.name} card does not say what ends it`).toBeGreaterThan(10)
    }
  })

  it('says on the worker card that its own message saying it is done does not end it', async () => {
    const { theRoleCards } = await import('../src/server/lib/roles.ts')
    const worker = theRoleCards().cards.find((one) => one.name === 'worker')
    expect(worker?.whatEndsIt).toContain('released')
    expect(worker?.whatEndsIt).toContain('does not end it')
  })
})

describe('a worker whose task is released is retired, with the reason', () => {
  it('retires it and says what ended it, naming the work', async () => {
    const { task, claim } = await aTaskSomebodyIsWorkingOn('Build the permissions cluster, part one')
    expect(await register({ handle: 'w-ends', name: 'Worker Ends', role: 'worker', startedFor: task })).toBe(201)
    expect(rowFor('w-ends')?.['retired']).toBe(0)

    expect(await release(claim)).toBe(200)

    const row = rowFor('w-ends')
    expect(row?.['retired']).toBe(1)
    const why = String(row?.['retired_because'])
    expect(why).toContain('The task it was started for was released')
    expect(why).toContain('Build the permissions cluster, part one')
    expect(why).toContain('on its card')
  })

  // BY A DECISION, CRITERION I3, which replaced "its handle is not reused": a retired agent's
  // handle is free again, and a registration under it makes a NEW agent with a NEW id. The retired
  // row stays as it was, with its reason.
  it('frees the handle afterwards for a new agent with a new id', async () => {
    const { task } = await aTaskSomebodyIsWorkingOn('Some later piece of work')
    const code = await register({ handle: 'w-ends', name: 'Somebody Else', role: 'worker', startedFor: task })
    expect(code, "a retired agent's handle was not free for a new agent").toBe(201)
    const rows = t.client.sqlite
      .prepare('SELECT id, retired, retired_because FROM agents WHERE handle = ? ORDER BY retired')
      .all('w-ends') as { id: string; retired: number; retired_because: string | null }[]
    expect(rows.length, 'the retired row and the new one').toBe(2)
    expect(rows[0]!.retired, 'the new agent is live').toBe(0)
    expect(rows[1]!.retired, 'the retired agent is still retired').toBe(1)
    expect(rows[0]!.id, 'with an id of its own').not.toBe(rows[1]!.id)
    expect(String(rows[1]!.retired_because)).toContain('The task it was started for was released')
  })

  it('leaves an agent that named no work alone, because it has no end to come', async () => {
    const { task, claim } = await aTaskSomebodyIsWorkingOn('Work nobody was started for')
    expect(await register({ handle: 'w-open', name: 'Worker Open', role: 'worker' })).toBe(201)
    expect(rowFor('w-open')?.['started_for']).toBeNull()
    expect(await release(claim)).toBe(200)
    expect(rowFor('w-open')?.['retired'], 'an agent with no recorded work was retired anyway').toBe(0)
    expect(task.length).toBeGreaterThan(0)
  })

  it('leaves an agent started for OTHER work alone', async () => {
    const mine = await aTaskSomebodyIsWorkingOn('The work this agent is on')
    const other = await aTaskSomebodyIsWorkingOn('Somebody else"s work')
    expect(await register({ handle: 'w-other', name: 'Worker Other', role: 'worker', startedFor: mine.task })).toBe(201)
    expect(await release(other.claim)).toBe(200)
    expect(rowFor('w-other')?.['retired']).toBe(0)
    expect(await release(mine.claim)).toBe(200)
    expect(rowFor('w-other')?.['retired']).toBe(1)
  })

  it('files the retirement as the product and not as the person who released the claim', async () => {
    const { task, claim } = await aTaskSomebodyIsWorkingOn('Work whose ending is attributed')
    expect(await register({ handle: 'w-who', name: 'Worker Who', role: 'worker', startedFor: task })).toBe(201)
    // The registry id is not the handle, so the agent's record is found through its id.
    const record = t.client.sqlite
      .prepare('SELECT record_id AS id FROM agent_records WHERE agent_id = ?')
      .get(String(rowFor('w-who')?.['id'])) as { id: string }
    await release(claim)
    const rows = t.client.sqlite
      .prepare('SELECT actor_type AS kind, actor_id AS id FROM changes WHERE record_id = ? ORDER BY rowid DESC LIMIT 1')
      .get(record.id) as { kind: string; id: string }
    // THE PRODUCT'S OWN WRITER OF AGENT RECORDS, which every way of retiring an agent goes through.
    const { THE_OFFICE_WRITER_ID } = await import('../src/shared/participants.ts')
    expect(rows, 'the retirement was filed in a person"s name').toEqual({ kind: 'agent', id: THE_OFFICE_WRITER_ID })
  })
})
