// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * SHELVING A DIRECTION, CONFIRMING A GOAL AND WRITING HOURS ARE IN THE PERSON'S TABLE.
 *
 * A decision adds them to that table. The three
 * acts the code already reserves to the person were enforced by guards but missing from
 * `design/permissions/roles.json` under `The person's own acts`, so the roles page and the office's
 * own reading of who may do what did not name them. This file reads that table itself and holds all
 * three are there, that the subtraction a worker meets names them, and that the role card page
 * draws them.
 *
 * THE ACT KEYS ARE THE CODE'S OWN. `plan.commit` already named writing hours; `direction.shelve`
 * and `goal.confirm` are the keys the two guards now carry in `personAct`, and
 * `tests/the-persons-acts-are-declared-once.test.ts` holds that registry set equal to this table.
 */

import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { actsRefusedTo, everyActNamed, type RolesDeclaration } from '../src/shared/roles.ts'
import type { BuiltServer } from '../src/server/index.ts'
import { theRoleCardsFile } from '../src/server/lib/roles.ts'

const DECLARATION = theRoleCardsFile()

/** The three acts this piece registered, by the key the refusal names. */
const THE_THREE = ['direction.shelve', 'goal.confirm', 'plan.commit'] as const

/** The declaration as JSON text, nothing read through a type. */
function theDeclaration(): RolesDeclaration {
  return JSON.parse(readFileSync(DECLARATION, 'utf8')) as RolesDeclaration
}

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

function asAgent(handle: string): Record<string, string> {
  return { ...AS_THE_PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle }
}

let t: TestDb
let app: BuiltServer

async function register(headers: Record<string, string>, body: Record<string, unknown>): Promise<void> {
  const reply = await app.app.inject({ method: 'POST', url: '/api/agents/started', headers, payload: body })
  expect(reply.statusCode).toBe(201)
}

beforeAll(async () => {
  t = await freshDb()
  app = await apiApp()
  await app.app.ready()
  await register(AS_THE_PERSON, { handle: THE_TEST_OFFICES_SECRETARY.handle, name: THE_TEST_OFFICES_SECRETARY.name, role: 'secretary' })
  await register(asAgent(THE_TEST_OFFICES_SECRETARY.handle), { handle: 'w-one', name: 'Worker One', role: 'worker' })
})

afterAll(async () => {
  await app.app.close()
  t.close()
})

describe('the declaration names all three under the person’s own power', () => {
  it('carries each of the three acts, with words a person reads', () => {
    const decl = theDeclaration()
    const power = decl.powers.find((one) => one.name === decl.elevation.givesThePower)
    expect(power, 'the declaration has no power for the person’s own acts').toBeDefined()
    const named = new Map((power?.acts ?? []).map((one) => [one.act, one.inWords]))
    for (const act of THE_THREE) {
      expect(named.get(act), `${act} is not one of the person’s declared acts`).toBeTruthy()
      expect(String(named.get(act)).trim(), `${act} has no words a person reads`).not.toBe('')
    }
  })

  it('reads the three in the words the guards refuse an agent with', () => {
    const decl = theDeclaration()
    const named = everyActNamed(decl)
    expect(named.get('direction.shelve')).toBe('Put a direction on the shelf, or take it off')
    expect(named.get('goal.confirm')).toBe(
      'Confirm an agent-filed goal, which clears the mark that says it is the agent\'s',
    )
    expect(named.get('plan.commit')).toBe('Turn words about time into hours on the calendar')
  })

  it('refuses an agent all three, by the same subtraction every other refusal uses', () => {
    const refused = actsRefusedTo(theDeclaration(), 'worker')
    for (const act of THE_THREE) {
      expect(refused.get(act), `a worker is not refused ${act}`).toBeTruthy()
    }
  })
})

describe('the office’s own reading names them, to a caller and to a page', () => {
  it('publishes all three to a worker in GET /api/access', async () => {
    const reply = await app.app.inject({ method: 'GET', url: '/api/access', headers: asAgent('w-one') })
    expect(reply.statusCode, reply.body).toBe(200)
    const caller = (reply.json() as { caller: Record<string, unknown> }).caller
    const published = new Set((caller['refusedByRole'] as { act: string }[]).map((one) => one.act))
    for (const act of THE_THREE) {
      expect(published.has(act), `GET /api/access does not refuse a worker ${act}`).toBe(true)
    }
  })

  it('serves all three under the person’s card power in GET /api/roles', async () => {
    const reply = await app.app.inject({ method: 'GET', url: '/api/roles', headers: AS_THE_PERSON })
    expect(reply.statusCode, reply.body).toBe(200)
    const said = reply.json() as {
      powers: { name: string; acts: { act: string; inWords: string }[] }[]
      personCards: { name: string; powers: string[] | null }[]
    }
    const power = said.powers.find((one) => one.name === "The person's own acts")
    expect(power, 'GET /api/roles serves no power for the person’s own acts').toBeDefined()
    const named = new Map((power?.acts ?? []).map((one) => [one.act, one.inWords]))
    for (const act of THE_THREE) {
      expect(named.has(act), `GET /api/roles does not serve ${act}`).toBe(true)
    }
    // AND THE PERSON'S CARD CARRIES THE POWER, so the roles page draws the name it is under.
    const administrator = said.personCards.find((one) => one.name === 'administrator')
    expect(administrator?.powers ?? []).toContain("The person's own acts")
  })
})
