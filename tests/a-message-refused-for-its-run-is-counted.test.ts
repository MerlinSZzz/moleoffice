// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A MESSAGE REFUSED BECAUSE ITS RUN HAS FILED ALL IT MAY IS COUNTED ONCE, AT EACH DOOR.
 *
 * Every agent, message, run and count here is made up in a fresh test office. The server and its
 * database are real, and nothing starts a process: the stand-in is this file calling the two doors a
 * run writes through.
 *
 * `MOLE_OFFICE_RUN_MESSAGES` is set to one, so the first message a run files is stored and every
 * message after it is refused. The count is read from the day's `run-messages` row after each
 * refused request, which is what proves the count stands outside the transaction the throw unwinds.
 * The check door is asked the same over-limit message and must count nothing, because a check takes
 * its write back and writes nothing.
 *
 * WHAT IS REAL HERE AND WHAT IS NOT. The agent registry rows, the session record and the messages
 * are real database rows. The run is a record shaped as `tests/one-run-may-file-only-so-many-messages.test.ts`
 * files one, and no process is started for it.
 */

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, one, type TestDb } from './helpers.ts'

let t: TestDb
let app: FastifyInstance
/** What `MOLE_OFFICE_RUN_MESSAGES` said before this file set it, so it is put back. */
let allowedBefore: string | undefined

/** The limit this file is written against, set in the environment so the server reads the same. */
const ALLOWED = 1

const AS_THE_OWNER: Record<string, string> = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

async function post(path: string, body: unknown): Promise<Record<string, unknown>> {
  const reply = await app.inject({ method: 'POST', url: path, headers: AS_THE_OWNER, payload: body as object })
  return JSON.parse(reply.body === '' ? '{}' : reply.body) as Record<string, unknown>
}

async function get(path: string): Promise<Record<string, unknown>> {
  const reply = await app.inject({ method: 'GET', url: path, headers: AS_THE_OWNER })
  return JSON.parse(reply.body === '' ? '{}' : reply.body) as Record<string, unknown>
}

/** Register a durable made-up agent and give back its registry id. */
async function anAgent(handle: string): Promise<string> {
  await post('/api/records', {
    kind: 'agent',
    title: handle,
    data: { handle, state: 'active', runtime: 'claude-code' },
  })
  const listed = (await get('/api/participants')) as { agents?: { id: string; handle: string }[] }
  return one((listed.agents ?? []).filter((agent) => agent.handle === handle), `the registry row for ${handle}`).id
}

/** Send a made-up message to an agent, and give back the message id. */
async function messageTo(agentId: string, body: string): Promise<string> {
  const filed = await post('/api/records', {
    kind: 'message',
    title: body.slice(0, 60),
    data: { body, to: [{ kind: 'agent', id: agentId }] },
  })
  return (filed['record'] as { id: string }).id
}

/**
 * A made-up session record shaped exactly as the worker files one for a run it starts.
 *
 * No process is started. What the two doors check is that the run exists, is a session record of
 * this project, and was serving this agent, and all three of those are facts on the record.
 */
async function aRunServing(agentId: string, messageId: string): Promise<string> {
  const filed = await post('/api/records', {
    kind: 'session',
    title: 'A made-up run answering a made-up message',
    data: {
      state: 'running',
      runtime: 'claude-code',
      startedByMoleOffice: true,
      servingAgent: agentId,
      deliveringMessage: messageId,
    },
  })
  return (filed['record'] as { id: string }).id
}

/** Answer once through the worker's answered door, as a run does, and say what came back. */
async function answerOnce(
  messageId: string,
  agentId: string,
  run: string,
  n: number,
): Promise<{ status: number; body: string }> {
  const reply = await app.inject({
    method: 'POST',
    url: `/api/worker/messages/${messageId}/answered`,
    headers: AS_THE_OWNER,
    payload: {
      to: { kind: 'agent', id: agentId },
      agent: { kind: 'agent', id: agentId },
      fromRun: run,
      body: `Made-up answer number ${String(n)} from a run that has filed all it may.`,
      because: 'a stand-in answering again and again',
    },
  })
  return { status: reply.statusCode, body: reply.body }
}

/** Write a made-up message straight to one of the record doors as a run, naming its own session. */
async function writeDirectly(run: string, handle: string, n: number, door = '/api/records'): Promise<{ status: number; body: string }> {
  const reply = await app.inject({
    method: 'POST',
    url: door,
    headers: {
      'content-type': 'application/json',
      'x-mole-office-workspace': 'default',
      'x-mole-office-actor-type': 'agent',
      'x-mole-office-actor-id': handle,
      'x-mole-office-session': run,
    },
    payload: {
      kind: 'message',
      title: `Made-up direct message number ${String(n)}`,
      data: {
        body: `Made-up direct message number ${String(n)} from a run that has filed all it may.`,
        to: [{ kind: 'person', id: THE_PERSON }],
      },
    },
  })
  return { status: reply.statusCode, body: reply.body }
}

/** The made-up `run-messages` row for today, or undefined because nothing has been refused yet. */
function theCount(): { would_stop: number; stopped: number; reminded: number } | undefined {
  return t.client.sqlite
    .prepare("SELECT would_stop, stopped, reminded FROM gate_counts WHERE gate = 'run-messages'")
    .get() as { would_stop: number; stopped: number; reminded: number } | undefined
}

beforeAll(async () => {
  allowedBefore = process.env['MOLE_OFFICE_RUN_MESSAGES']
  process.env['MOLE_OFFICE_RUN_MESSAGES'] = String(ALLOWED)
  t = await freshDb()
  const built = await apiApp()
  app = built.app
  await app.ready()
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
  if (allowedBefore === undefined) delete process.env['MOLE_OFFICE_RUN_MESSAGES']
  else process.env['MOLE_OFFICE_RUN_MESSAGES'] = allowedBefore
})

describe('a message refused because its run has filed all it may is counted once', () => {
  it('counts each reply the answered door refuses, and counts nothing for the reply it files', async () => {
    const handle = 'made-up-run-counted-at-the-answered-door'
    const agentId = await anAgent(handle)
    const messageId = await messageTo(agentId, 'Made-up question answered at the worker s door.')
    const run = await aRunServing(agentId, messageId)

    const first = await answerOnce(messageId, agentId, run, 1)
    expect(first.status, first.body).toBe(200)
    expect(theCount(), 'a reply that was filed is not a refusal, so nothing is counted').toBeUndefined()

    const second = await answerOnce(messageId, agentId, run, 2)
    expect(second.status, second.body).toBe(400)
    expect(theCount(), 'the refusal is counted once, and the count stands after the throw').toEqual({
      would_stop: 1,
      stopped: 0,
      reminded: 0,
    })

    const third = await answerOnce(messageId, agentId, run, 3)
    expect(third.status, third.body).toBe(400)
    expect(theCount(), 'a second refused reply is counted a second time').toEqual({
      would_stop: 2,
      stopped: 0,
      reminded: 0,
    })
  })

  it('counts a message POST /api/records refuses for the run its session names', async () => {
    const handle = 'made-up-run-counted-at-the-records-door'
    const agentId = await anAgent(handle)
    const messageId = await messageTo(agentId, 'Made-up question answered at the records door.')
    const run = await aRunServing(agentId, messageId)

    const filed = await writeDirectly(run, handle, 1)
    expect(filed.status, filed.body).toBe(201)
    const before = theCount()

    const refused = await writeDirectly(run, handle, 2)
    expect(refused.status, refused.body).toBe(400)
    expect(theCount(), 'the refusal is counted once, and the count stands after the throw').toEqual({
      would_stop: (before?.would_stop ?? 0) + 1,
      stopped: 0,
      reminded: 0,
    })
  })

  it('leaves the count as it was when the run s limit is read three times', async () => {
    const handle = 'made-up-run-only-read-about'
    const agentId = await anAgent(handle)
    const messageId = await messageTo(agentId, 'Made-up question whose run is only read about.')
    const run = await aRunServing(agentId, messageId)
    const first = await answerOnce(messageId, agentId, run, 1)
    expect(first.status, first.body).toBe(200)
    const before = theCount()

    const { whyThisRunMayFileNoMore } = await import('../src/server/lib/worker.ts')
    for (let n = 0; n < 3; n += 1) {
      expect(whyThisRunMayFileNoMore(run, 'default'), 'the run has filed all it may').toEqual(expect.any(String))
      expect(theCount(), 'reading why a run is refused is a reading, and counts nothing').toEqual(before)
    }
  })

  it('counts nothing when the check door refuses the same message, because a check writes nothing', async () => {
    const handle = 'made-up-run-checked-not-counted'
    const agentId = await anAgent(handle)
    const messageId = await messageTo(agentId, 'Made-up question sent to the check door.')
    const run = await aRunServing(agentId, messageId)
    const filed = await writeDirectly(run, handle, 1)
    expect(filed.status, filed.body).toBe(201)
    const before = theCount()

    const checked = await writeDirectly(run, handle, 2, '/api/records/check')
    expect(checked.status, checked.body).toBe(400)
    expect(theCount(), 'a check is taken back, so its refusal counts nothing').toEqual(before)
  })
})
