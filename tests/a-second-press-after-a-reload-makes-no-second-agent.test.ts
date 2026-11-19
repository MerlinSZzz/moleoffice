// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A SECOND PRESS OF START A NEW AGENT, AFTER THE PAGE IS LOADED AGAIN, MAKES NO SECOND AGENT.
 * Problem T6e9AVCcZyhb: the page holds the press for an agent it made (a-second-press-makes-no-second-agent),
 * but that hold is the page's memory, and a reload empties it. So the door itself must not make a
 * second agent for one press.
 *
 * WHAT IS PROVED HERE, against the server's door with no page at all, which is what a reload leaves.
 * No message worker runs, so nothing answers as the new agent for as long as the case needs.
 *
 *   1. The control: one message waits for an agent nothing answers as, and one press makes one new agent.
 *   2. Before anything answers as the new agent, the door the page asks after a reload says nothing waits
 *      for a press there, and a press on it makes no agent. Two things reach the new agent: the person's
 *      message, which the first press already marked as pressed, and Mole Office's own line saying where the
 *      conversation came from, which needs no run. Neither waits for a press.
 *   3. A press on the first agent again makes no agent either: its message was carried and is no longer waiting.
 *
 * MUTATION (after a green control): in src/server/lib/worker.ts, where the queue row's `nobodyIsAnsweringAsIt`
 * is worked out, the test `whyThisMessageNeedsNoRun(addressed.sentBy) === null` removed. Case 2 goes red: the
 * door offers a press for the new agent, and the press carries Mole Office's line and makes a third agent.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'

import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, one, type TestDb } from './helpers.ts'

let t: TestDb
let app: FastifyInstance

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

async function post(path: string, body: unknown): Promise<{ status: number; body: Record<string, unknown> }> {
  const reply = await app.inject({ method: 'POST', url: path, headers: AS_THE_OWNER, payload: body as never })
  return { status: reply.statusCode, body: JSON.parse(reply.body === '' ? '{}' : reply.body) as Record<string, unknown> }
}

async function theAgents(): Promise<{ id: string; handle: string }[]> {
  const reply = await app.inject({ method: 'GET', url: '/api/participants', headers: AS_THE_OWNER })
  return (reply.json() as { agents?: { id: string; handle: string }[] }).agents ?? []
}

async function press(agentId: string): Promise<{ status: number; body: Record<string, unknown> }> {
  return post(`/api/agents/${agentId}/start-a-new-agent`, {})
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

describe('a second press after a reload', () => {
  let heron = ''
  let made = ''

  it('1: one press on an agent nothing answers as makes one new agent, which is the control', async () => {
    const filed = await post('/api/records', { kind: 'agent', title: 'Heron Mapper', data: { handle: 'heron-mapper', runtime: 'claude-code', state: 'active' } })
    expect(filed.status).toBe(201)
    heron = one((await theAgents()).filter((a) => a.handle === 'heron-mapper'), 'the registry row for heron-mapper').id
    const said = await post('/api/records', { kind: 'message', title: 'Map the north shore', data: { body: 'Map the north shore, please.', to: [{ kind: 'agent', id: heron }] } })
    // A PERSON'S SEND TO AN AGENT NOTHING HOLDS ANSWERS 409, with the letter stored and routed (decision 60sbc5I-bwKx).
    expect(said.status).toBe(409)

    const first = await press(heron)
    expect(first.status, JSON.stringify(first.body)).toBe(200)
    expect(first.body['handle']).toBe('heron-mapper-2')
    expect(first.body['moved']).toHaveLength(1)
    made = one((await theAgents()).filter((a) => a.handle === 'heron-mapper-2'), 'the registry row for heron-mapper-2').id
  })

  it('2: a press on the new agent, before anything answers as it, makes no agent', async () => {
    const offer = await app.inject({ method: 'GET', url: `/api/agents/${made}/start-a-new-agent`, headers: AS_THE_OWNER })
    expect(offer.json(), 'after a reload the page would offer a second press').toMatchObject({ wouldCarry: false })
    const before = (await theAgents()).length
    const again = await press(made)
    expect(again.status, JSON.stringify(again.body)).toBe(200)
    expect(again.body['agent'], JSON.stringify(again.body)).toBe('')
    expect(again.body['moved']).toEqual([])
    expect((await theAgents()).length, 'a press on the new agent made another agent').toBe(before)
    expect((await theAgents()).some((a) => a.handle === 'heron-mapper-3')).toBe(false)
  })

  it('3: a press on the first agent again makes no agent', async () => {
    const before = (await theAgents()).length
    const again = await press(heron)
    expect(again.status, JSON.stringify(again.body)).toBe(200)
    expect(again.body['agent']).toBe('')
    expect(again.body['moved']).toEqual([])
    expect((await theAgents()).length, 'a second press on the first agent made another agent').toBe(before)
  })
})
