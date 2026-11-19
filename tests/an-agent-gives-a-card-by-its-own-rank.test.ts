// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN AGENT GIVES A CARD BY ITS OWN RANK, AT POST /api/roles/card/<handle>.
 *
 * The cards are given by rank, by the secretary and the supervisor alike. So rank is each
 * agent's own right, proved by its own key, and the person's grant adds nothing to it. The door used to refuse every
 * caller but the person.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS MEASURED, ONE CASE PER ANSWER
 * ---------------------------------------------------------------------------------------
 *
 *   · the person gives any card, and takes a secretary's card away;
 *   · each rank gives a card at or below its own rung and is refused the card above it: a supervisor, a worker and a
 *     secretary each give one card and are each refused one;
 *   · an agent changes only the card of another agent whose present card it could also give: a worker and a
 *     supervisor are each refused replacing a secretary's card;
 *   · an agent never changes its own card, even to a card it could give another agent;
 *   · a claim to be an agent that carries no key is refused, with the card door's words;
 *   · the change row names the agent that gave the card;
 *   · under the person's grant a secretary is still refused the secretary card.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THAT TURN THIS RED, WITH A CONTROL RUN FIRST
 * ---------------------------------------------------------------------------------------
 *
 * Run on 23 October 2026. Against the door as it was, cases 2 to 13 went red; the control run then passed all 13.
 * Each mutation was made alone in src/server/api/roles.ts or src/config/roles.json and put back:
 *   drop the check that the giver is not the agent it gives to → case 10 went red;
 *   drop the rank check of the card given → cases 3, 5, 7 and 13 went red;
 *   drop the rank check of the card the agent holds now → cases 8 and 9 went red;
 *   put the old person-only refusal back on the door → cases 2 to 13 went red: the giving cases because the door
 *     refused them, and the refusals because they said the old door's words;
 *   let a claim with no key through as the agent it names → case 11 went red;
 *   the worker card's "appoints" back to "nobody" → cases 4, 5 and 8 went red, case 4 because the worker was refused
 *     and cases 5 and 8 because the refusal named the rule that a worker appoints nobody;
 *   write the card as the office itself and not as the giver → case 12 went red.
 */
import { dirname, join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { apiApp, freshDb, thePersonsKeyHeader, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

let t: TestDb
let app: FastifyInstance
let forgetWorld: () => void
const keys = new Map<string, string>()

const BASE: Record<string, string> = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const PERSON: Record<string, string> = { ...BASE }
const agent = (handle: string): Record<string, string> => ({ ...BASE, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle, 'x-mole-office-key': keys.get(handle)! })
const keyless = (handle: string): Record<string, string> => ({ ...BASE, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle })

async function call(method: 'GET' | 'POST' | 'DELETE', url: string, headers: Record<string, string>, payload?: unknown) {
  const res = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as object }) })
  return { status: res.statusCode, body: res.json() as Record<string, any>, said: res.body.replace(/[0-9a-f]{64}/g, '<fixture key>') }
}

const give = (headers: Record<string, string>, handle: string, role: string) => call('POST', `/api/roles/card/${handle}`, headers, { role })

/** The card stored on an agent's registry row. An agent registered with no card named is stored with the worker card. */
function cardOf(handle: string): unknown {
  return t.client.sqlite.prepare('SELECT role FROM agents WHERE handle = ?').pluck().get(handle)
}

/** Register one agent as the person, with the card named, and keep its key. */
async function register(handle: string, role: string | null): Promise<void> {
  const onTheTree = role === null || role === 'worker' || role === 'supervisor'
  const res = await call('POST', '/api/agents/started', PERSON, { handle, name: `MADE-UP ${handle}`, ...(role === null ? {} : { role }), ...(onTheTree ? { workArea: ['src'] } : {}) })
  expect(res.status, res.said).toBe(201)
  keys.set(handle, res.body['whatToGiveIt'].key as string)
}

beforeAll(async () => {
  delete process.env.MOLE_OFFICE_WORLD_STARTED_BY
  delete process.env.MOLE_OFFICE_WORLD_SECRETARIES
  t = await freshDb()
  forgetWorld = (await import('../src/server/lib/worldauthority.ts')).forgetTheWorldsOwnAuthority
  forgetWorld()
  app = (await apiApp()).app
  await app.ready()
  Object.assign(PERSON, thePersonsKeyHeader(join(dirname(t.file), 'keys.json')))
  for (const [handle, role] of [
    ['rank-secretary', 'secretary'],
    ['rank-supervisor', 'supervisor'],
    ['rank-worker', 'worker'],
    ['other-secretary', 'secretary'],
  ] as const) await register(handle, role)
  for (let n = 1; n <= 10; n += 1) await register(`given-${String(n)}`, null)
}, 120_000)

afterAll(async () => {
  delete process.env.MOLE_OFFICE_WORLD_STARTED_BY
  forgetWorld?.()
  await app?.close()
  t?.close()
})

describe('the person', () => {
  it('1: gives any card, and takes a secretary card away', async () => {
    expect((await give(PERSON, 'given-1', 'secretary')).status).toBe(201)
    expect(cardOf('given-1')).toBe('secretary')
    const back = await give(PERSON, 'given-1', 'worker')
    expect(back.status, back.said).toBe(201)
    expect(cardOf('given-1')).toBe('worker')
  })
})

describe('each rank gives a card at or below its own rung', () => {
  it('2: a supervisor gives the supervisor card', async () => {
    const done = await give(agent('rank-supervisor'), 'given-2', 'supervisor')
    expect(done.status, done.said).toBe(201)
    expect(cardOf('given-2')).toBe('supervisor')
  })

  it('3: a supervisor is refused the secretary card', async () => {
    const no = await give(agent('rank-supervisor'), 'given-3', 'secretary')
    expect(no.status, no.said).toBe(403)
    expect(no.said).toContain('Only the person appoints a secretary')
    expect(no.said).toContain('Nothing was written')
    expect(cardOf('given-3')).toBe('worker')
  })

  it('4: a worker gives the worker card', async () => {
    const done = await give(agent('rank-worker'), 'given-4', 'worker')
    expect(done.status, done.said).toBe(201)
    expect(cardOf('given-4')).toBe('worker')
  })

  it('5: a worker is refused the supervisor card, the one above its own', async () => {
    const no = await give(agent('rank-worker'), 'given-5', 'supervisor')
    expect(no.status, no.said).toBe(403)
    expect(no.said).toContain('at or below its own rung')
    expect(cardOf('given-5')).toBe('worker')
  })

  it('6: a secretary gives the supervisor card', async () => {
    const done = await give(agent('rank-secretary'), 'given-6', 'supervisor')
    expect(done.status, done.said).toBe(201)
    expect(cardOf('given-6')).toBe('supervisor')
  })

  it('7: a secretary is refused the secretary card, which only the person gives', async () => {
    const no = await give(agent('rank-secretary'), 'given-7', 'secretary')
    expect(no.status, no.said).toBe(403)
    expect(no.said).toContain('Only the person appoints a secretary')
    expect(cardOf('given-7')).toBe('worker')
  })
})

describe('an agent changes only the card of an agent whose present card it could also give', () => {
  it("8: a worker is refused replacing a secretary's card", async () => {
    const no = await give(agent('rank-worker'), 'other-secretary', 'worker')
    expect(no.status, no.said).toBe(403)
    expect(no.said).toContain('whose present card it could also give')
    expect(no.said).toContain('holds the secretary card')
    expect(cardOf('other-secretary')).toBe('secretary')
  })

  it("9: a supervisor is refused replacing a secretary's card", async () => {
    const no = await give(agent('rank-supervisor'), 'other-secretary', 'supervisor')
    expect(no.status, no.said).toBe(403)
    expect(no.said).toContain('whose present card it could also give')
    expect(cardOf('other-secretary')).toBe('secretary')
  })
})

describe('an agent never changes its own card', () => {
  it('10: a supervisor is refused changing its own card, even to the worker card it could give another', async () => {
    const no = await give(agent('rank-supervisor'), 'rank-supervisor', 'worker')
    expect(no.status, no.said).toBe(403)
    expect(no.said).toContain('An agent may not change its own card')
    expect(cardOf('rank-supervisor')).toBe('supervisor')
  })
})

describe('who asks', () => {
  it("11: refuses a claim to be an agent that carries no key, with the card door's words", async () => {
    const no = await give(keyless('rank-secretary'), 'given-8', 'worker')
    expect(no.status, no.said).toBe(403)
    expect(no.said).toContain("Giving an agent a role card is the person's act, and an agent's own act within its rank.")
    expect(no.said).toContain('Nothing was written')
    expect(cardOf('given-8')).toBe('worker')
  })

  it('12: writes the change as the agent that gave the card', async () => {
    const done = await give(agent('rank-secretary'), 'given-9', 'supervisor')
    expect(done.status, done.said).toBe(201)
    const row = t.client.sqlite
      .prepare("SELECT actor_type, actor_id, new_value FROM changes WHERE record_id = ? AND field = 'data.role' ORDER BY rowid DESC LIMIT 1")
      .get(String(done.body['writtenOn'])) as { actor_type: string; actor_id: string; new_value: string } | undefined
    expect(row?.actor_type).toBe('agent')
    expect(row?.actor_id).toBe('rank-secretary')
    expect(row?.new_value).toBe('supervisor')
  })
})

describe("the person's grant adds nothing to an agent's rank", () => {
  it('13: a raised secretary is still refused the secretary card', async () => {
    const raised = await call('POST', '/api/roles/elevation/rank-secretary', PERSON, { reason: 'A fixture raise.' })
    expect(raised.status, raised.said).toBe(201)
    const no = await give(agent('rank-secretary'), 'given-10', 'secretary')
    expect(no.status, no.said).toBe(403)
    expect(no.said).toContain('Only the person appoints a secretary')
    expect(cardOf('given-10')).toBe('worker')
    expect((await call('DELETE', '/api/roles/elevation/rank-secretary', PERSON)).status).toBeLessThan(300)
  })
})
