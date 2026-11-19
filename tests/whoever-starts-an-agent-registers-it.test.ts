// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHOEVER STARTS AN AGENT REGISTERS IT, BEFORE IT DOES ANYTHING.
 *
 * Criterion P1 of design/permissions/ACCEPTANCE.md, on the rule that
 * whoever starts an agent manages it and answers for it. *Measured: an
 * agent started by a supervisor has a registry row whose `started_by_id` is that supervisor, written
 * before the started agent's first request.*
 *
 * ONE REQUEST, BECAUSE THAT IS WHAT MAKES IT HAPPEN. Measured on the owner's installation that morning: 199
 * agent names had written into it and not one was registered. `POST /api/agents/started` is the one
 * request, and `tools/register-a-started-agent.mjs` is the one line that makes it from a shell.
 *
 * WHAT IS NOT PROVED HERE. That the chain of starters reaches the person is P9. That the refusal an
 * unregistered writer gets names its starter is P5. Both are their own tests.
 */

import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { readFileSync } from 'node:fs'
import { THE_SUPERVISOR, THE_WORKER, whyThisRoleMayNotBeGiven, type RolesDeclaration } from '../src/shared/roles.ts'
import { theRoleCardsFile } from '../src/server/lib/roles.ts'

let t: TestDb
let app: FastifyInstance

/** The role cards as the server reads them when it starts; a fresh test office adds none. */
const theCards = (): RolesDeclaration => JSON.parse(readFileSync(theRoleCardsFile(), 'utf8')) as RolesDeclaration

const AS_THE_PERSON = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const asAgent = (id: string, session?: string): Record<string, string> => ({
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': id,
  ...(session === undefined ? {} : { 'x-mole-office-session': session }),
})

function rowFor(handle: string): Record<string, unknown> | undefined {
  return t.client.sqlite.prepare('SELECT * FROM agents WHERE handle = ?').get(handle) as Record<string, unknown> | undefined
}

/**
 * The registry id of the agent with this handle, as the registry holds it. A starter asks by its
 * handle, and what is stored about it is its registry id, which is not the handle.
 */
function idOf(handle: string): string {
  const id = rowFor(handle)?.['id']
  expect(typeof id, `no registry row has the handle ${handle}`).toBe('string')
  return String(id)
}

async function register(
  headers: Record<string, string>,
  body: Record<string, unknown>,
): Promise<{ code: number; said: Record<string, unknown> }> {
  const reply = await app.inject({ method: 'POST', url: '/api/agents/started', headers, payload: body })
  return { code: reply.statusCode, said: reply.json() as Record<string, unknown> }
}

beforeAll(async () => {
  t = await freshDb()
  const built = await apiApp()
  app = built.app
  await app.ready()
  // The durable agent that starts builders here. The person registers it, which is how a secretary
  // and a supervisor are appointed: only the owner does that.
  await register(AS_THE_PERSON, { handle: THE_TEST_OFFICES_SECRETARY.handle, name: THE_TEST_OFFICES_SECRETARY.name, role: 'secretary', runtime: 'claude-code' })
})

afterAll(async () => {
  await app.close()
  t.close()
})

describe('a starter registers what it started, in one request', () => {
  it('writes a registry row whose starter is the caller, with the role and the work area', async () => {
    const { code, said } = await register(asAgent(THE_TEST_OFFICES_SECRETARY.handle, `run-of-${THE_TEST_OFFICES_SECRETARY.handle}`), {
      handle: 'builder-pa',
      name: 'Builder PA',
      role: 'worker',
      runtime: 'claude-code',
      workArea: ['src/server/api', 'tests'],
    })
    expect(code).toBe(201)
    const row = rowFor('builder-pa')
    expect(row?.['started_by_kind']).toBe('agent')
    expect(row?.['started_by_id']).toBe(idOf(THE_TEST_OFFICES_SECRETARY.handle))
    expect(row?.['role']).toBe('worker')
    expect(JSON.parse(String(row?.['work_area']))).toEqual(['src/server/api', 'tests'])
    expect(said['startedBy']).toEqual({ kind: 'agent', id: idOf(THE_TEST_OFFICES_SECRETARY.handle) })
  })

  it('says the three things to hand the started agent, and names the run that started it', async () => {
    const { said } = await register(asAgent(THE_TEST_OFFICES_SECRETARY.handle, `run-of-${THE_TEST_OFFICES_SECRETARY.handle}`), {
      handle: 'builder-df',
      name: 'Builder DF',
      role: 'worker',
    })
    const whatToGiveIt = said['whatToGiveIt'] as Record<string, unknown>
    expect(whatToGiveIt['handle']).toBe('builder-df')
    expect(whatToGiveIt['startedByRun']).toBe(`run-of-${THE_TEST_OFFICES_SECRETARY.handle}`)
    expect(String(whatToGiveIt['api'])).toMatch(/^http/)
    expect(whatToGiveIt['startedByRunSays']).toBeNull()
  })

  it('says nothing knows which run started it, rather than inventing one', async () => {
    const { said } = await register(asAgent(THE_TEST_OFFICES_SECRETARY.handle), { handle: 'builder-nr', name: 'Builder NR', role: 'worker' })
    const whatToGiveIt = said['whatToGiveIt'] as Record<string, unknown>
    expect(whatToGiveIt['startedByRun']).toBeNull()
    expect(String(whatToGiveIt['startedByRunSays'])).toContain('x-mole-office-session')
  })

  it('makes the ordinary agent record, so the row, the inbox and the record are the usual ones', async () => {
    const { said } = await register(asAgent(THE_TEST_OFFICES_SECRETARY.handle), { handle: 'builder-bv', name: 'Builder BV', role: 'worker' })
    const record = t.api.getRecord(String(said['record']))
    expect(record?.kind).toBe('agent')
    expect(record?.data['handle']).toBe('builder-bv')
    expect(record?.data['startedBy']).toEqual({ kind: 'agent', id: idOf(THE_TEST_OFFICES_SECRETARY.handle) })
  })
})

describe('a starter nothing holds cannot register anybody', () => {
  it('refuses, and names the two ways on', async () => {
    const { code, said } = await register(asAgent('claude-code/bundle-drafter'), {
      handle: 'builder-zz',
      name: 'Builder ZZ',
      role: 'worker',
    })
    expect(code).toBe(403)
    const why = String(said['error'])
    expect(why).toContain('claude-code/bundle-drafter')
    expect(why).toContain('Register yourself first')
    expect(why).toContain('the agent that started you')
    expect(why).toContain('Nothing was written')
    expect(rowFor('builder-zz')).toBeUndefined()
  })
})

describe('a starter may not give a role above its own', () => {
  it('lets a supervisor make a worker', async () => {
    await register(asAgent(THE_TEST_OFFICES_SECRETARY.handle), { handle: 'sup-one', name: 'Supervisor One', role: 'supervisor' })
    const { code } = await register(asAgent('sup-one'), { handle: 'w-one', name: 'Worker One', role: 'worker' })
    expect(code).toBe(201)
    expect(rowFor('w-one')?.['started_by_id']).toBe(idOf('sup-one'))
  })

  it('refuses a supervisor making a secretary', async () => {
    const { code, said } = await register(asAgent('sup-one'), { handle: 'sec-two', name: 'Secretary Two', role: 'secretary' })
    expect(code).toBe(403)
    expect(String(said['error'])).toContain('Nothing was written')
    expect(rowFor('sec-two')).toBeUndefined()
  })

  it('refuses any agent appointing an inspector, because only the person does that', async () => {
    const { code, said } = await register(asAgent(THE_TEST_OFFICES_SECRETARY.handle), { handle: 'insp-one', name: 'Inspector One', role: 'inspector' })
    expect(code).toBe(403)
    expect(String(said['error'])).toContain('person')
    expect(rowFor('insp-one')).toBeUndefined()
  })

  it('lets the person appoint an inspector', async () => {
    const { code } = await register(AS_THE_PERSON, { handle: 'insp-two', name: 'Inspector Two', role: 'inspector' })
    expect(code).toBe(201)
    expect(rowFor('insp-two')?.['role']).toBe('inspector')
    expect(rowFor('insp-two')?.['started_by_kind']).toBe('person')
  })

  it('lets a worker make what the worker card lets it make, and refuses the rest in the card’s own words', async () => {
    // What a worker may give is read from the rule the door asks, never written out here: the
    // worker card's line changed when cards came to go by rank.
    const cards = theCards()
    for (const [handle, role] of [['w-two', THE_WORKER], ['sup-two', THE_SUPERVISOR]] as const) {
      const no = whyThisRoleMayNotBeGiven(cards, THE_WORKER, role)
      const { code, said } = await register(asAgent('builder-pa'), { handle, name: `A ${role}`, role })
      if (no === null) {
        expect(code, JSON.stringify(said)).toBe(201)
        expect(rowFor(handle)?.['started_by_id']).toBe(idOf('builder-pa'))
      } else {
        expect(code, JSON.stringify(said)).toBe(403)
        expect(String(said['error'])).toContain(no)
        expect(rowFor(handle)).toBeUndefined()
      }
    }
  })
})

describe('the starter is the caller and cannot be sent in the body', () => {
  it('refuses a body that names one, rather than reading it', async () => {
    const { code, said } = await register(asAgent(THE_TEST_OFFICES_SECRETARY.handle), {
      handle: 'builder-fake',
      name: 'Builder Fake',
      role: 'worker',
      startedBy: { kind: 'person', id: THE_PERSON },
    })
    expect(code).toBe(400)
    expect(String(said['error'])).toContain('startedBy')
    expect(rowFor('builder-fake')).toBeUndefined()
  })
})
