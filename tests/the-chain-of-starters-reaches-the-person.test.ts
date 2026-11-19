// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE CHAIN OF STARTERS IS READABLE IN ONE REQUEST, AND ONE THAT REACHES NOBODY IS REFUSED.
 *
 * Criterion P9 of design/permissions/ACCEPTANCE.md, on point (c): each agent reports to its starter,
 * up to the agent that deals with the person directly. *An agent's page and GET /api/participants say its starter, its
 * role, and the chain up to the person. A registration whose chain does not reach the person is
 * refused, naming what it would have joined.*
 *
 * A CHAIN THAT GOES ROUND AND A CHAIN THAT STOPS ARE TWO DIFFERENT ANSWERS, and this proves both
 * are said as themselves. The design's own sentence is that refusing a chain which does not reach
 * the person is also what refuses a loop, and that is one rule doing two jobs rather than two rules.
 */

import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { readFileSync } from 'node:fs'
import { THE_WORKER, whyThisRoleMayNotBeGiven, type RolesDeclaration } from '../src/shared/roles.ts'
import { theRoleCardsFile } from '../src/server/lib/roles.ts'

let t: TestDb
let app: FastifyInstance

/** The role cards as the server reads them when it starts; a fresh test office adds none. */
const theCards = (): RolesDeclaration => JSON.parse(readFileSync(theRoleCardsFile(), 'utf8')) as RolesDeclaration

const AS_THE_PERSON = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const asAgent = (id: string): Record<string, string> => ({
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': id,
})

async function register(
  headers: Record<string, string>,
  body: Record<string, unknown>,
): Promise<{ code: number; said: Record<string, unknown> }> {
  const reply = await app.inject({ method: 'POST', url: '/api/agents/started', headers, payload: body })
  return { code: reply.statusCode, said: reply.json() as Record<string, unknown> }
}

async function readBack(handle: string): Promise<Record<string, unknown>> {
  const reply = await app.inject({ method: 'GET', url: '/api/participants' })
  const said = reply.json() as { agents: Record<string, unknown>[] }
  const one = said.agents.find((row) => row['handle'] === handle)
  expect(one, `no agent called ${handle} came back`).toBeDefined()
  return one as Record<string, unknown>
}

/** A registry row written the way the rows in the owner's database were written: with no starter at all. */
function anOldRow(handle: string, name: string): void {
  t.api.createRecord({
    workspaceId: 'panelx',
    kind: 'agent',
    title: name,
    data: { handle, runtime: 'claude-code', state: 'active' },
    actor: { type: 'human', id: THE_PERSON },
  })
}

beforeAll(async () => {
  t = await freshDb()
  const built = await apiApp()
  app = built.app
  await app.ready()
  await register(AS_THE_PERSON, { handle: THE_TEST_OFFICES_SECRETARY.handle, name: THE_TEST_OFFICES_SECRETARY.name, role: 'secretary' })
  await register(asAgent(THE_TEST_OFFICES_SECRETARY.handle), { handle: 'sup-one', name: 'Supervisor One', role: 'supervisor' })
  await register(asAgent('sup-one'), { handle: 'builder-pa', name: 'Builder PA', role: 'worker' })
})

afterAll(async () => {
  await app.close()
  t.close()
})

describe('the chain comes back with the agent, in one request', () => {
  it('names every rung up to the person, nearest first', async () => {
    const said = await readBack('builder-pa')
    // THE CHAIN HOLDS REGISTRY IDS, and a new agent's id is not its handle, so each is read back.
    expect(said['chain']).toEqual([
      { kind: 'agent', id: (await readBack('sup-one'))['id'] },
      { kind: 'agent', id: (await readBack(THE_TEST_OFFICES_SECRETARY.handle))['id'] },
      { kind: 'person', id: THE_PERSON },
    ])
    expect(said['chainReachesThePerson']).toBe(true)
    expect(String(said['chainSays'])).toContain(THE_PERSON)
  })

  it('says so plainly for an agent the person started, whose chain is one step', async () => {
    const said = await readBack(THE_TEST_OFFICES_SECRETARY.handle)
    expect(said['chain']).toEqual([{ kind: 'person', id: THE_PERSON }])
    expect(said['chainReachesThePerson']).toBe(true)
  })

  it('says nobody recorded a starter, rather than showing an empty chain as though it were fine', async () => {
    anOldRow('builder-old', 'Builder Old')
    const said = await readBack('builder-old')
    expect(said['chain']).toEqual([])
    expect(said['chainReachesThePerson']).toBe(false)
    expect(String(said['chainSays'])).toContain('Nobody recorded a starter')
  })

  it('says the same chain on one agent"s own page as on the list', async () => {
    const reply = await app.inject({ method: 'GET', url: '/api/participants/agent/builder-pa' })
    expect(reply.statusCode).toBe(200)
    const said = (reply.json() as { participant: Record<string, unknown> }).participant
    expect(said['chain']).toEqual((await readBack('builder-pa'))['chain'])
  })
})

describe('a registration whose chain reaches nobody is refused', () => {
  it('refuses a starter nobody recorded a starter for, and names what it would have joined', async () => {
    const { code, said } = await register(asAgent('builder-old'), {
      handle: 'builder-orphan',
      name: 'Builder Orphan',
      role: 'worker',
    })
    expect(code).toBe(403)
    const why = String(said['error'])
    expect(why).toContain('Nobody recorded who started "builder-old"')
    expect(why).toContain('What it would have joined')
    expect(why).toContain('agent "builder-old"')
    expect(why).toContain('Nothing was written')
  })

  it('refuses a chain that goes round, and says it goes round', async () => {
    // Two agents that started each other. It is built by hand rather than through the door,
    // because the door is what refuses it and the state has to exist for the refusal to be tested.
    anOldRow('loop-a', 'Loop A')
    anOldRow('loop-b', 'Loop B')
    t.client.sqlite
      .prepare("UPDATE agents SET started_by_kind = 'agent', started_by_id = ? WHERE handle = ?")
      .run('loop-b', 'loop-a')
    t.client.sqlite
      .prepare("UPDATE agents SET started_by_kind = 'agent', started_by_id = ? WHERE handle = ?")
      .run('loop-a', 'loop-b')

    const said = await readBack('loop-a')
    expect(said['chainReachesThePerson']).toBe(false)
    expect(String(said['chainSays'])).toContain('go round')

    const refused = await register(asAgent('loop-a'), { handle: 'loop-child', name: 'Loop Child', role: 'worker' })
    expect(refused.code).toBe(403)
    expect(String(refused.said['error'])).toContain('go round')
    expect(
      t.client.sqlite.prepare('SELECT * FROM agents WHERE handle = ?').get('loop-child'),
      'the refused registration wrote a row',
    ).toBeUndefined()
  })

  it('still lets an agent whose chain does reach the owner register somebody', async () => {
    const { code, said } = await register(asAgent('builder-pa'), { handle: 'ok-worker-child', name: 'Ok Worker Child', role: THE_WORKER })
    // Whether a worker may give the worker card is the card's own line, read from the rule the door
    // asks. When the card refuses, the refusal is for that reason and never for the chain.
    const no = whyThisRoleMayNotBeGiven(theCards(), THE_WORKER, THE_WORKER)
    expect(code, JSON.stringify(said)).toBe(no === null ? 201 : 403)
    if (no !== null) expect(String(said['error'])).toContain(no)
    const { code: fine } = await register(asAgent('sup-one'), { handle: 'ok-child', name: 'Ok Child', role: 'worker' })
    expect(fine).toBe(201)
  })
})
