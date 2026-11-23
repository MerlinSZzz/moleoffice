// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A former home of this installation is still home for a visit to this office.
 * The door answers at home without a row, while another installation's closed home gets a visit.
 * The library refuses the former home too. Reports of visits elsewhere retain their given ids,
 * both from the current home and from the former home.
 */
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

let db: TestDb
let app: FastifyInstance
let office: typeof import('../src/server/lib/office.ts')
let visits: typeof import('../src/server/lib/visits.ts')
let here: string
let visitor: { kind: 'agent'; id: string }
const formerHome = 'aaaaaaaaaaaaaaaa'
const otherHome = 'bbbbbbbbbbbbbbbb'
const headers = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}

function aClosedHome(identity: string, installation: string): void {
  const made = office.registerWorldHere({
    name: 'a former home', kind: 'home',
    startedBy: { kind: 'person', id: THE_TEST_OFFICES_OWNER.id },
    checkout: null, head: null, databaseIdentity: identity, address: null,
    addressForOtherMachines: null, standing: 'canonical', parentWorld: null, installation,
  })
  office.closeWorldHere(made.id, 'the home was closed')
}

beforeAll(async () => {
  db = await freshDb()
  office = await import('../src/server/lib/office.ts')
  visits = await import('../src/server/lib/visits.ts')
  const world = await import('../src/server/lib/world.ts')
  world.forgetTheWorld()
  const identity = world.theWorldThisDatabaseIs()
  const installation = world.theInstallationThisDatabaseBelongsTo()
  if (identity === null || installation === null || installation === '') throw new Error('the test office has no identity or installation')
  here = identity
  aClosedHome(formerHome, installation)
  aClosedHome(otherHome, 'another-installation')
  app = (await apiApp()).app
  await app.ready()
  const made = await app.inject({
    method: 'POST', url: '/api/records', headers,
    payload: { kind: 'agent', title: 'A test citizen', data: { handle: 'test-citizen', state: 'active' } },
  })
  expect(made.statusCode).toBe(201)
  const listed = await app.inject({ method: 'GET', url: '/api/participants', headers })
  const agents = listed.json<{ agents: { id: string; handle: string }[] }>().agents
  const agent = agents.find((one) => one.handle === 'test-citizen')
  if (agent === undefined) throw new Error('the test citizen was not registered')
  visitor = { kind: 'agent', id: agent.id }
}, 60_000)

afterAll(async () => {
  await app.close()
  db.close()
})

describe('a visit from a former home', () => {
  it('answers at home and writes no visit for a former home of this installation', async () => {
    const reply = await app.inject({
      method: 'POST', url: '/api/office/visits', headers,
      payload: { visitor, fromWorld: formerHome, why: 'working here' },
    })
    expect(reply.statusCode).toBe(200)
    const said = reply.json<{ atHome: boolean; visit: null; nothingWritten: string }>()
    expect(said.atHome).toBe(true)
    expect(said.visit).toBeNull()
    expect(said.nothingWritten).toContain(formerHome)
    expect(visits.visitsHere().filter((one) => one.visitor.id === visitor.id)).toHaveLength(0)
  })

  it('registers a visit from another installation’s closed home', async () => {
    const reply = await app.inject({
      method: 'POST', url: '/api/office/visits', headers,
      payload: { visitor, fromWorld: otherHome, why: 'working here' },
    })
    expect(reply.statusCode).toBe(201)
    expect(reply.json<{ visit: { fromWorld: string } }>().visit.fromWorld).toBe(otherHome)
  })

  it('refuses a direct registration from this office’s former home', () => {
    expect(() => visits.registerVisitHere({ visitor, fromWorld: formerHome, toWorld: here, why: 'working here' }))
      .toThrow(/former home of this office.*citizen lives here/)
  })

  it('keeps reports of visits elsewhere from both the current and former homes', () => {
    for (const [fromWorld, id] of [[here, 'current-home-report'], [formerHome, 'former-home-report']] as const) {
      const visit = visits.registerVisitHere({ visitor, fromWorld, toWorld: 'ffffffffffffffff', why: 'working elsewhere', id })
      expect(visit.id).toBe(id)
      expect(visits.visitsHere().some((one) => one.id === id)).toBe(true)
    }
  })
})
