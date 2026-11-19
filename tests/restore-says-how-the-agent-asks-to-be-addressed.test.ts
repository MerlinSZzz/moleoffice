// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * Restore carries the agent's own address, read the same way as its profile.
 * The values below are made up. Each agent sets its own through the door with its key,
 * except the agent that has never set a part.
 *
 * Mutation: leave `addressAs` out of the restore reply. All three cases must fail.
 */

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { AddressAs } from '../src/shared/address-as.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

let t: TestDb
let app: FastifyInstance

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
})

afterAll(async () => {
  await app.close()
  t.close()
})

const cases: { handle: string; wanted: AddressAs | null }[] = [
  { handle: 'all-parts', wanted: { name: 'Quill', secondPerson: 'you', thirdPerson: 'they', title: 'bench keeper' } },
  { handle: 'some-parts', wanted: { name: '墨', thirdPerson: 'it' } },
  { handle: 'nothing-set', wanted: null },
]

describe('restore says how the agent asks to be addressed', () => {
  it.each(cases)('$handle: returns only the parts the agent set', async ({ handle, wanted }) => {
    const started = await app.inject({
      method: 'POST',
      url: '/api/agents/started',
      headers: {
        'x-mole-office-workspace': 'default',
        'x-mole-office-actor-type': 'human',
        'x-mole-office-actor-id': THE_PERSON,
      },
      payload: { handle, name: `Registry name for ${handle}`, role: 'worker' },
    })
    expect(started.statusCode, started.body).toBe(201)
    const { agent, whatToGiveIt } = started.json() as { agent: { id: string }; whatToGiveIt: { key: string } }
    expect(whatToGiveIt.key).toMatch(/^[0-9a-f]{64}$/)
    const headers = {
      'x-mole-office-actor-type': 'agent',
      'x-mole-office-actor-id': handle,
      'x-mole-office-key': whatToGiveIt.key,
    }

    if (wanted !== null) {
      const set = await app.inject({
        method: 'PUT',
        url: `/api/participants/agent/${agent.id}/address-as`,
        headers,
        payload: wanted,
      })
      expect(set.statusCode, set.body).toBe(200)
    }

    const profile = await app.inject({
      method: 'GET',
      url: `/api/participants/agent/${agent.id}/profile`,
      headers: { ...headers, 'x-mole-office-workspace': 'default' },
    })
    expect(profile.statusCode, profile.body).toBe(200)
    const participant = (profile.json() as { participant: { addressAs: AddressAs } }).participant
    expect(participant.addressAs).toEqual(wanted ?? {})

    for (const workspace of [{}, { 'x-mole-office-workspace': 'default' }]) {
      const restored = await app.inject({ method: 'GET', url: '/api/restore', headers: { ...headers, ...workspace } })
      expect(restored.statusCode, restored.body).toBe(200)
      const own = (restored.json() as { agent: { id: string; addressAs: AddressAs } }).agent
      expect(own.id).toBe(agent.id)
      expect(own.addressAs).toEqual(wanted ?? {})
      expect(own.addressAs).toEqual(participant.addressAs)
    }
  })
})
