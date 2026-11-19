// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A REFUSED RUNG REQUEST LEAVES NO REQUEST OR MESSAGE BEHIND (problem jwgat4DE1kR2).
 *
 * POST /api/roles/requests writes two records: the role_request, and the message that asks the agent's starter. Until
 * wave 13w round 10 the message was refused when its words seemed to hold a key, and the asker's `because` is in its
 * words. The refusal said "Nothing was written". Before the fix the role_request was written first and stayed, with no
 * message, so the starter was never asked and the asker was told nothing had been written. The two writes are one
 * transaction.
 *
 * SINCE ROUND 10 THE MESSAGE IS STORED, and the answer carries the reminder. No
 * refusal of the message that the asker's words can cause is left, so this file no longer makes one; the transaction
 * stays in src/server/api/roles.ts for any other refusal. The second case proves the request and the message are both
 * written, and the reminder reaches the asker.
 * MUTATION: in that route, leave the reminder out of the answer, as before round 10 when the message was written with
 * createRecord. The second case goes red.
 *
 * The first case is the control: the same request in plain words writes one request and one message, and no reminder.
 *
 * LINE ROUND 51 ADDS FOUR REFUSALS FOR A CALLER THAT IS NOT A REGISTERED AGENT. A registered person is told that a
 * rung is held by an agent, an unregistered person is named as a person, and a system writer is named as a system
 * writer. An unregistered agent keeps the old sentence. Each refusal leaves both record counts unchanged.
 */

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

const ROBOTICS = { 'x-mole-office-workspace': 'robotics' }
const AS_THE_JUNIOR = { ...ROBOTICS, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'robotics-junior' }

let t: TestDb
let app: FastifyInstance

/** How many records of a kind the database holds. */
async function howMany(kind: string): Promise<number> {
  const { sqlite } = await import('../src/server/db/client.ts')
  return (sqlite.prepare('SELECT COUNT(*) AS n FROM records WHERE kind = ?').get(kind) as { n: number }).n
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  const project = await app.inject({ method: 'POST', url: '/api/workspaces', payload: { id: 'robotics', title: 'Robotics' } })
  expect(project.statusCode, project.body).toBe(201)
  // An agent marked as started by the person, and an agent it registers: the junior's request is answered by its starter.
  const cal = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: ROBOTICS,
    payload: { kind: 'agent', title: 'The robotics agent', data: { handle: 'robotics-cal', state: 'active', workArea: ['src'] } },
  })
  expect(cal.statusCode, cal.body).toBe(201)
  const owned = await app.inject({ method: 'PATCH', url: '/api/participants/agent/robotics-cal', headers: ROBOTICS, payload: { startedBy: 'me' } })
  expect(owned.statusCode, owned.body).toBe(200)
  const junior = await app.inject({
    method: 'POST',
    url: '/api/agents/started',
    headers: { ...ROBOTICS, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'robotics-cal' },
    payload: { handle: 'robotics-junior', name: 'The robotics junior' },
  })
  expect(junior.statusCode, junior.body).toBe(201)
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

describe('a rung asked for in words that seem to hold a key', () => {
  it('in plain words, writes one request and the one message that asks', async () => {
    const [requests, messages] = [await howMany('role_request'), await howMany('message')]
    const asked = await app.inject({
      method: 'POST',
      url: '/api/roles/requests',
      headers: AS_THE_JUNIOR,
      payload: { asking: 'supervisor', because: 'The wrist camera needs more than one worker.' },
    })
    expect(asked.statusCode, asked.body).toBe(201)
    expect(await howMany('role_request')).toBe(requests + 1)
    expect(await howMany('message')).toBe(messages + 1)
    expect(asked.body).not.toContain('keyReminder')
  })

  it('with a key-shaped piece in its reason, writes the request and the message, and reminds the asker', async () => {
    const [requests, messages] = [await howMany('role_request'), await howMany('message')]
    const asked = await app.inject({
      method: 'POST',
      url: '/api/roles/requests',
      headers: AS_THE_JUNIOR,
      payload: { asking: 'supervisor', because: 'Log in with mysql -pWr1stCamera9 to see why.' },
    })
    expect(asked.statusCode, asked.body).toBe(201)
    expect((asked.json() as { keyReminder?: { shape: string; where: string } }).keyReminder).toMatchObject({ shape: 'passwordAfterP', where: 'body' })
    expect(await howMany('role_request')).toBe(requests + 1)
    expect(await howMany('message')).toBe(messages + 1)
  })
})

describe('a rung asked for by a caller that is not a registered agent', () => {
  // CONTROL: on the old code, cases 1, 2 and 3 are red on the sentence that calls every caller an agent; case 4 is green.
  // MUTATION A: give the registered person the unregistered-agent sentence again. Case 1 turns red. Restore: green.
  it('names a registered person as a person and leaves no request or message behind', async () => {
    const [requests, messages] = [await howMany('role_request'), await howMany('message')]
    const reply = await app.inject({
      method: 'POST',
      url: '/api/roles/requests',
      headers: { ...ROBOTICS, 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON },
      payload: { asking: 'supervisor', because: 'The wrist camera needs more than one worker.' },
    })
    expect(reply.statusCode, reply.body).toBe(403)
    expect((reply.json() as { error: string }).error).toBe(
      `The person "${THE_PERSON}" is registered, and a rung is held by an agent, not by a person. A rung is asked for by the agent that holds it, under its own handle. GET /api/participants lists every person and every durable agent. Nothing was written.`,
    )
    expect(await howMany('role_request')).toBe(requests)
    expect(await howMany('message')).toBe(messages)
  })

  it('names an unregistered person as a person and leaves no request or message behind', async () => {
    const actorId = 'nobody-registered-this-person'
    const [requests, messages] = [await howMany('role_request'), await howMany('message')]
    const reply = await app.inject({
      method: 'POST',
      url: '/api/roles/requests',
      headers: { ...ROBOTICS, 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': actorId },
      payload: { asking: 'supervisor', because: 'The wrist camera needs more than one worker.' },
    })
    expect(reply.statusCode, reply.body).toBe(403)
    expect((reply.json() as { error: string }).error).toBe(
      `Nothing is registered as the person "${actorId}", and a rung is held by an agent, not by a person. A rung is asked for by the agent that holds it, under its own handle. GET /api/participants lists every person and every durable agent. Nothing was written.`,
    )
    expect(await howMany('role_request')).toBe(requests)
    expect(await howMany('message')).toBe(messages)
  })

  // MUTATION B: give the system writer the unregistered-agent sentence again. Case 3 turns red. Restore: green.
  it('names a system writer as a system writer and leaves no request or message behind', async () => {
    const actorId = 'the-unregistered-system-writer'
    const [requests, messages] = [await howMany('role_request'), await howMany('message')]
    const reply = await app.inject({
      method: 'POST',
      url: '/api/roles/requests',
      headers: { ...ROBOTICS, 'x-mole-office-actor-type': 'system', 'x-mole-office-actor-id': actorId },
      payload: { asking: 'supervisor', because: 'The wrist camera needs more than one worker.' },
    })
    expect(reply.statusCode, reply.body).toBe(403)
    expect((reply.json() as { error: string }).error).toBe(
      `Nothing is registered as the system writer "${actorId}". No registry holds a system writer, and a rung is held by an agent. A rung is asked for by the agent that holds it, under its own handle. GET /api/participants lists every person and every durable agent. Nothing was written.`,
    )
    expect(await howMany('role_request')).toBe(requests)
    expect(await howMany('message')).toBe(messages)
  })

  it('keeps the old sentence for an unregistered agent and leaves no request or message behind', async () => {
    const actorId = 'claude-code/nobody-registered-this-agent'
    const [requests, messages] = [await howMany('role_request'), await howMany('message')]
    const reply = await app.inject({
      method: 'POST',
      url: '/api/roles/requests',
      headers: { ...ROBOTICS, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': actorId },
      payload: { asking: 'supervisor', because: 'The wrist camera needs more than one worker.' },
    })
    expect(reply.statusCode, reply.body).toBe(403)
    expect((reply.json() as { error: string }).error).toBe(
      `Nothing is registered as the agent "${actorId}", so there is nobody to raise and nobody who started it. A rung is asked for by the agent that holds it, under its own handle. GET /api/participants lists every person and every durable agent. Nothing was written.`,
    )
    expect(await howMany('role_request')).toBe(requests)
    expect(await howMany('message')).toBe(messages)
  })
})
