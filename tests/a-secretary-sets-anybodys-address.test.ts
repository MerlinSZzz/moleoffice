// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A SECRETARY SETS ANYBODY'S ADDRESS, THE OWNER ANY AGENT'S, AND THE ROW SAYS WHO SET IT.
 * This is one of a secretary's basic duties.
 *
 * The door is PUT /api/participants/:kind/:id/address-as, and the rule is `whyThisAddressAsWriteIsRefused`
 * in src/server/lib/participants.ts. Migration 0182 stores who last set it and when.
 *
 * WHAT IS PROVED HERE (every name and value is made up):
 *   1. A secretary, proved by its own key, sets a person's address, and the row says the secretary set it.
 *   2. A secretary sets another agent's address.
 *   3. The owner sets an agent's address, and the row says the person set it.
 *   4. An ordinary agent with its own key is refused on another agent's and on a person's, and nothing is written.
 *   5. A request that names the secretary in its headers and sends no key is refused, and nothing is written.
 *
 * MUTATIONS (each after a green control run, then restored), in src/server/lib/participants.ts:
 *   a. `theKeyProvesASecretary` answers false: cases 1 and 2 go red.
 *   b. the owner's line for an agent (`if (thePersonIsProved(actor)) return null`) is taken out: case 3 goes red.
 *   c. `theKeyProvesASecretary` skips the card check (the last line answers `row !== null`): case 4 goes red.
 *   d. `theKeyProvesASecretary` reads the caller from the headers (`participantForActor(actor)?.id`) instead of
 *      the key: case 5 goes red.
 */

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

let t: TestDb
let app: FastifyInstance

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const asAgent = (handle: string, key?: string): Record<string, string> => ({
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
  ...(key === undefined ? {} : { 'x-mole-office-key': key }),
})

interface Reply {
  status: number
  json: Record<string, unknown>
  text: string
}

async function inject(method: 'GET' | 'PUT' | 'POST', url: string, headers: Record<string, string>, payload?: unknown): Promise<Reply> {
  const reply = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as never }) })
  let json: Record<string, unknown> = {}
  try {
    json = reply.json() as Record<string, unknown>
  } catch {
    json = {}
  }
  return { status: reply.statusCode, json, text: reply.body }
}

const agents = new Map<string, { id: string; key: string }>()

/** Register an agent through the starter door with the card named, and keep its registry id and key. */
async function started(handle: string, role: string): Promise<{ id: string; key: string }> {
  const reply = await inject('POST', '/api/agents/started', AS_THE_PERSON, { handle, name: handle, role })
  expect(reply.status, reply.text).toBe(201)
  const id = (reply.json['agent'] as { id: string }).id
  const key = String((reply.json['whatToGiveIt'] as { key?: string } | undefined)?.key)
  expect(key, 'the registration answered no key').toMatch(/^[0-9a-f]{64}$/)
  agents.set(handle, { id, key })
  return { id, key }
}

/** The stored address and who set it, as SQLite holds them. */
function stored(table: 'people' | 'agents', id: string): Record<string, unknown> {
  const row = t.client.sqlite
    .prepare(`SELECT address_name, address_title, address_set_by_kind, address_set_by_id FROM ${table} WHERE id = ?`)
    .get(id) as Record<string, unknown> | undefined
  expect(row, `no ${table} row ${id}`).toBeDefined()
  return row!
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  await started('a-made-up-secretary', 'secretary')
  await started('a-made-up-worker', 'worker')
  await started('another-made-up-worker', 'worker')
  await started('an-untouched-worker', 'worker')
})

afterAll(async () => {
  await app.close()
  t.close()
})

describe('who may set somebody else’s address', () => {
  it('a secretary with its own key sets a person’s, and the row says the secretary set it', async () => {
    const secretary = agents.get('a-made-up-secretary')!
    const set = await inject('PUT', `/api/participants/person/${THE_PERSON}/address-as`, asAgent('a-made-up-secretary', secretary.key), {
      name: 'A made-up person',
      title: 'a made-up chief',
    })
    expect(set.status, set.text).toBe(200)
    expect(stored('people', THE_PERSON)).toEqual({
      address_name: 'A made-up person',
      address_title: 'a made-up chief',
      address_set_by_kind: 'agent',
      address_set_by_id: secretary.id,
    })
    const setBy = (set.json['participant'] as { addressAsSetBy: { kind: string; id: string; at: string } | null }).addressAsSetBy
    expect(setBy?.kind).toBe('agent')
    expect(setBy?.id).toBe(secretary.id)
  })

  it('a secretary sets another agent’s', async () => {
    const secretary = agents.get('a-made-up-secretary')!
    const worker = agents.get('a-made-up-worker')!
    const set = await inject('PUT', '/api/participants/agent/a-made-up-worker/address-as', asAgent('a-made-up-secretary', secretary.key), {
      name: 'Made-up worker',
    })
    expect(set.status, set.text).toBe(200)
    expect(stored('agents', worker.id)).toEqual({
      address_name: 'Made-up worker',
      address_title: null,
      address_set_by_kind: 'agent',
      address_set_by_id: secretary.id,
    })
  })

  it('the owner sets an agent’s, and the row says the person set it', async () => {
    const worker = agents.get('another-made-up-worker')!
    const set = await inject('PUT', '/api/participants/agent/another-made-up-worker/address-as', AS_THE_PERSON, { title: 'a made-up title' })
    expect(set.status, set.text).toBe(200)
    expect(stored('agents', worker.id)).toEqual({
      address_name: null,
      address_title: 'a made-up title',
      address_set_by_kind: 'person',
      address_set_by_id: THE_PERSON,
    })
  })

  it('an ordinary agent with its own key is refused on another agent’s and on a person’s, and nothing is written', async () => {
    const worker = agents.get('a-made-up-worker')!
    const untouched = agents.get('an-untouched-worker')!
    const beforeAgent = stored('agents', untouched.id)
    const onAnother = await inject('PUT', '/api/participants/agent/an-untouched-worker/address-as', asAgent('a-made-up-worker', worker.key), {
      name: 'Named by a worker',
    })
    expect(onAnother.status, onAnother.text).toBe(403)
    expect(String(onAnother.json['error'])).toContain('One agent may not set it for another unless it is a secretary.')
    expect(stored('agents', untouched.id)).toEqual(beforeAgent)

    const beforePerson = stored('people', THE_PERSON)
    const onAPerson = await inject('PUT', `/api/participants/person/${THE_PERSON}/address-as`, asAgent('a-made-up-worker', worker.key), {
      name: 'Named by a worker',
    })
    expect(onAPerson.status, onAPerson.text).toBe(403)
    expect(String(onAPerson.json['error'])).toContain('or by a secretary with its own key')
    expect(stored('people', THE_PERSON)).toEqual(beforePerson)
  })

  it('a request naming the secretary with no key is refused, and nothing is written', async () => {
    const untouched = agents.get('an-untouched-worker')!
    const beforeAgent = stored('agents', untouched.id)
    const beforePerson = stored('people', THE_PERSON)
    const onAnAgent = await inject('PUT', '/api/participants/agent/an-untouched-worker/address-as', asAgent('a-made-up-secretary'), {
      name: 'Claimed by a name',
    })
    expect(onAnAgent.status, onAnAgent.text).toBe(403)
    expect(stored('agents', untouched.id)).toEqual(beforeAgent)
    const onAPerson = await inject('PUT', `/api/participants/person/${THE_PERSON}/address-as`, asAgent('a-made-up-secretary'), {
      name: 'Claimed by a name',
    })
    expect(onAPerson.status, onAPerson.text).toBe(403)
    expect(stored('people', THE_PERSON)).toEqual(beforePerson)
  })
})
