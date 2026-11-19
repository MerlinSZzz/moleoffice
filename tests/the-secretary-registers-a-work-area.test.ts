// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SECRETARY MAY REGISTER OR WIDEN ANY AGENT'S WORK AREA, AND THE CHANGE SAYS WHO DID IT.
 *
 * A decision agreed to proposal YDQYmaFDCSzZ. Before it only the
 * owner or the starter could, and one agent's finish waited on the owner pasting 69 lines into a text box.
 *
 * CONTROL: the secretary case and the refusal's wording were red before the door changed. MUTATION:
 * drop the secretary clause in changeWorkArea (src/server/lib/participants.ts) and the first case is
 * red again; the stranger's refusal stays.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { freshDb, apiApp, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

let db: TestDb
let app: FastifyInstance
const records: Record<string, string> = {}
/** Each agent's registry id, from the door's own answer. The id is not the handle. */
const ids: Record<string, string> = {}
type Caller = { type: 'human' | 'agent'; id: string }
const headers = (as: Caller) => ({
  'x-mole-office-actor-type': as.type,
  'x-mole-office-actor-id': as.id,
  'x-mole-office-workspace': 'default',
})

async function register(as: Caller, handle: string, role?: string, area: string[] | null = ['src']): Promise<void> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/agents/started',
    headers: headers(as),
    payload: { handle, name: handle, ...(role === undefined ? {} : { role }), ...(area === null ? {} : { workArea: area }) },
  })
  expect(response.statusCode, response.body).toBe(201)
  records[handle] = response.json().record as string
  ids[handle] = response.json().agent.id as string
}

const change = (as: Caller, handle: string, area: string[]) =>
  app.inject({
    method: 'POST',
    url: `/api/participants/agent/${handle}/work-area`,
    headers: headers(as),
    payload: { workArea: area, because: 'the test says so' },
  })

/** What the agent record says about its last work-area change. */
const lastChangeOf = (handle: string): { how?: string; by?: { id: string } } | undefined =>
  (db.api.getRecord(records[handle]!)!.data['extra'] as { workAreaChange?: { how?: string; by?: { id: string } } } | undefined)
    ?.workAreaChange

beforeAll(async () => {
  db = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  const person: Caller = { type: 'human', id: THE_PERSON }
  // A SECRETARY REGISTERS NOTHING, criterion P92, so its own registration carries no area. It is
  // still the card that may widen another agent's, which is the whole of what this file tests.
  await register(person, 'area-secretary', 'secretary', null)
  await register(person, 'area-starter', 'supervisor')
  await register(person, 'area-worker')
  await register(person, 'area-stranger')
  await register({ type: 'agent', id: 'area-starter' }, 'area-child')
})
afterAll(async () => {
  await app.close()
  db.close()
})

describe('who may change a work area', () => {
  it('a secretary may, and the change says a secretary did it', async () => {
    const response = await change({ type: 'agent', id: 'area-secretary' }, 'area-worker', ['src/one', 'docs'])
    expect(response.statusCode, response.body).toBe(200)
    expect(lastChangeOf('area-worker')).toMatchObject({ how: 'a-secretary', by: { id: ids['area-secretary'] } })
  })
  it('the starter may, and the change says a starter did it', async () => {
    const response = await change({ type: 'agent', id: 'area-starter' }, 'area-child', ['src/two'])
    expect(response.statusCode, response.body).toBe(200)
    expect(lastChangeOf('area-child')).toMatchObject({ how: 'a-starter' })
  })
  it('the owner may, and the change says the owner did it', async () => {
    const response = await change({ type: 'human', id: THE_PERSON }, 'area-worker', ['src/three'])
    expect(response.statusCode, response.body).toBe(200)
    expect(lastChangeOf('area-worker')).toMatchObject({ how: 'the-owner' })
  })
  it('a worker that is neither may not, and the refusal names the secretary card among who may', async () => {
    const response = await change({ type: 'agent', id: 'area-stranger' }, 'area-worker', ['src/four'])
    expect(response.statusCode).toBe(403)
    expect(String(response.json().error)).toContain('secretary')
    expect(lastChangeOf('area-worker')).toMatchObject({ how: 'the-owner' })
  })
})
