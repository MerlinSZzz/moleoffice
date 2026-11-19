// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * CRITERION C6: WORKERS AND RUNS.
 *
 * `design/messages/ACCEPTANCE.md` section 8: *a run the worker starts in a scratch world is a visit
 * the worker registers at the office on the agent's behalf; the run's environment carries its home
 * and the visit id.*
 *
 * WHAT IS PROVED HERE AND WHAT IS NOT. The environment a run is given is what this file is about,
 * because that is the half a test can hold still: `envFor` is a pure function of the run request.
 * The worker's own decision — whether the agent is away from home — is asserted through the visit
 * the office ends up holding, in tests/a-visit-is-registered-only-across-worlds.test.ts's shape,
 * without starting an agent tool.
 */
import { THE_TEST_OFFICES_OWNER, THE_TEST_FIXTURE_ROOT } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { envFor } from '../src/worker/runtimes/adapter.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

let t: TestDb
let app: FastifyInstance
let visits: typeof import('../src/server/lib/visits.ts')
let world: typeof import('../src/server/lib/world.ts')

beforeAll(async () => {
  t = await freshDb()
  visits = await import('../src/server/lib/visits.ts')
  world = await import('../src/server/lib/world.ts')
  world.forgetTheWorld()
  app = (await apiApp()).app
  await app.ready()
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

const A_RUN = {
  session: 'a-session-id',
  agent: 'builder-au',
  prompt: 'a message to answer',
  cwd: `${THE_TEST_FIXTURE_ROOT}/px-citizens`,
  api: 'http://127.0.0.1:41500',
  workspace: 'panelx',
  outputPath: '/tmp/a-run/output.txt',
}

describe('the environment a run is given', () => {
  it('carries the world it belongs to and the trip it is on, when it is working away from home', () => {
    const env = envFor({ ...A_RUN, home: 'aaaaaaaaaaaaaaaa', visit: 'a-visit-id' }, {})
    expect(env['MOLE_OFFICE_HOME_WORLD']).toBe('aaaaaaaaaaaaaaaa')
    expect(env['MOLE_OFFICE_VISIT']).toBe('a-visit-id')
  })

  it('carries neither for a run working at home, rather than an empty value that claims a trip', () => {
    const env = envFor(A_RUN, {})
    expect('MOLE_OFFICE_HOME_WORLD' in env).toBe(false)
    expect('MOLE_OFFICE_VISIT' in env).toBe(false)
  })

  it('carries the home with no visit for a run that could not have its trip registered', () => {
    const env = envFor({ ...A_RUN, home: 'aaaaaaaaaaaaaaaa' }, {})
    expect(env['MOLE_OFFICE_HOME_WORLD']).toBe('aaaaaaaaaaaaaaaa')
    expect('MOLE_OFFICE_VISIT' in env).toBe(false)
  })

  it('still drops every other Mole Office setting, so a run cannot reach the database directly', () => {
    const env = envFor({ ...A_RUN, home: 'aaaaaaaaaaaaaaaa', visit: 'a-visit-id' }, {
      MOLE_OFFICE_DB: `${THE_TEST_FIXTURE_ROOT}/test_claude/panelx/data/panelx.db`,
      PATH: '/usr/bin',
    })
    expect('MOLE_OFFICE_DB' in env).toBe(false)
    expect(env['PATH']).toBe('/usr/bin')
  })
})

describe('the two settings a run is told about itself are declared', () => {
  it('declares both, with no default, because absent is a real state', async () => {
    const { SETTINGS } = await import('../src/config/settings.mjs')
    for (const name of ['MOLE_OFFICE_HOME_WORLD', 'MOLE_OFFICE_VISIT']) {
      const declared = SETTINGS.find((one) => one.name === name)
      expect(declared, `${name} is not declared`).toBeTruthy()
      expect(declared?.fallback, `${name} must have no default: a default would claim a trip nobody made`).toBe(null)
      expect(declared?.absentMeans, `${name} must say what absent means`).toBeTruthy()
      expect(declared?.inTemplate, `${name} is not a knob a person turns`).toBe(false)
    }
  })
})

describe('a visit registered on an agent’s behalf is a visit like any other', () => {
  it('names the agent as the visitor and the run as the reason, and is open at the office', async () => {
    const here = world.theWorldThisDatabaseIs()
    if (here === null) throw new Error('this test database has no identity')

    const visit = visits.registerVisitHere({
      visitor: { kind: 'agent', id: 'builder-au' },
      fromWorld: 'aaaaaaaaaaaaaaaa',
      toWorld: here,
      why: 'a run answering the message m1',
    })
    expect(visit.visitor).toEqual({ kind: 'agent', id: 'builder-au' })
    expect(visit.why).toContain('a run answering')
    expect(visit.until).toBeNull()
    expect(visits.openVisitsThisWorldCanSee().visits.map((one) => one.id)).toContain(visit.id)
  })

  it('refuses one for an agent that lives in the world the run works in, because it is at home', async () => {
    const here = world.theWorldThisDatabaseIs()
    if (here === null) throw new Error('this test database has no identity')
    expect(() =>
      visits.registerVisitHere({
        visitor: { kind: 'agent', id: 'builder-au' },
        fromWorld: here,
        toWorld: here,
        why: 'a run answering the message m1',
      }),
    ).toThrow(/where this citizen lives/)
  })
})

/**
 * THE ONE FIELD THE WORKER READS TO KNOW WHETHER A RUN IS AWAY FROM HOME.
 *
 * `theVisitThisRunNeeds` in src/worker/index.ts reads `agents[].homeWorld` off
 * `GET /api/participants` and compares it with the world the run works in. The reply was built from
 * eleven named fields and this was not one of them, so it read null every time, answered "at home"
 * for every run, and the `POST /api/office/visits` beneath it was unreachable code — no run in the
 * product has ever registered a visit. Problem `FEsoy7vrGMWV`, measured end to end by the citizens
 * verifier: an agent whose home world was 34322fcd3bd649bb was sent a message in the world
 * 1b0df0ff2f965357, the run answered, and no visit was registered anywhere.
 *
 * THE ASSERTION IS ON THE NAME AS WELL AS THE VALUE. The worker reads this field by that name off a
 * reply it fetches over HTTP; a field with the right value under another name is the same silence.
 */
describe('the participants reply says which world each one is a citizen of', () => {
  it('names an agent’s home world under the name the worker reads', async () => {
    const here = world.theWorldThisDatabaseIs()
    if (here === null) throw new Error('this test database has no identity')

    const made = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: {
        'x-mole-office-workspace': 'default',
        'x-mole-office-actor-type': 'human',
        'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
      },
      payload: { kind: 'agent', title: 'A citizen of this world', data: { handle: 'a-citizen', runtime: 'claude-code' } },
    })
    expect(made.statusCode).toBe(201)

    const listed = await app.inject({
      method: 'GET',
      url: '/api/participants',
      headers: { 'x-mole-office-workspace': 'default' },
    })
    expect(listed.statusCode).toBe(200)
    const said = listed.json() as { agents: { handle: string; homeWorld: string | null }[] }
    const mine = said.agents.find((one) => one.handle === 'a-citizen')
    expect(mine, 'the agent this test registered is not on the list').toBeDefined()
    expect(Object.keys(mine ?? {})).toContain('homeWorld')
    expect(mine?.homeWorld).toBe(here)
  })

  it('says null rather than leaving it out for one nothing could identify a world for', async () => {
    t.client.sqlite.prepare("UPDATE agents SET home_world = NULL WHERE handle = 'builder-au'").run()
    const listed = await app.inject({
      method: 'GET',
      url: '/api/participants',
      headers: { 'x-mole-office-workspace': 'default' },
    })
    const said = listed.json() as { agents: { handle: string; homeWorld: string | null }[] }
    const mine = said.agents.find((one) => one.handle === 'builder-au')
    if (mine === undefined) return
    expect(Object.keys(mine)).toContain('homeWorld')
    expect(mine.homeWorld).toBeNull()
  })
})
