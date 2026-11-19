// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * GET /api/access PUBLISHES THE PERSON'S ACTS, FOR A CALLER ON THIS MACHINE.
 *
 * Report `jT4wVUdiwdiI`, block t5, point 9: for a caller on this machine the route answered
 * `refusedHere: []`, and its `refusedByRole` was the caller's ROLE refusals rather than the person's
 * doors. By R1 of one of the owner's decisions, the ten registry-only acts are declared under the
 * person's own power, so the same reading the refusal uses names them. This file holds that the
 * published answer is that table.
 *
 * WHAT THIS ROUTE CAN AND CANNOT SAY, SAID PLAINLY SO NOBODY READS MORE INTO IT. `refusedByRole`
 * answers *what may this caller not do because of who it is*, so a caller with a card sees every one
 * of the person's acts in it — the person’s own list, as the complement every card is refused. A PERSON has
 * no role and the route says so rather than answering an empty list with no reason: the person is refused
 * nothing, and a list of the person’s own doors is a different field that the secretary's report R7 offered and that
 * was not taken. That is the limit this file records instead of hiding.
 */

import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import type { BuiltServer } from '../src/server/index.ts'
import { theRoleCardsFile } from '../src/server/lib/roles.ts'

const DECLARATION = theRoleCardsFile()

interface DeclaredAct {
  act: string
  inWords: string
}

function actsDeclaredForTheOwner(): DeclaredAct[] {
  const decl = JSON.parse(readFileSync(DECLARATION, 'utf8')) as {
    powers: { name: string; acts: DeclaredAct[] }[]
    elevation: { givesThePower: string }
  }
  const power = decl.powers.find((one) => one.name === decl.elevation.givesThePower)
  if (power === undefined) throw new Error('the declaration has no power for the person’s own acts')
  return power.acts
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

async function refusedByRole(headers: Record<string, string>): Promise<{ act: string; inWords: string }[]> {
  const reply = await app.app.inject({ method: 'GET', url: '/api/access', headers })
  expect(reply.statusCode).toBe(200)
  const caller = (reply.json() as { caller: Record<string, unknown> }).caller
  return caller['refusedByRole'] as { act: string; inWords: string }[]
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

describe('a caller on this machine with a card is shown the person’s acts', () => {
  it('publishes every one of the person’s acts to a worker, in the declaration’s own words', async () => {
    const published = new Map((await refusedByRole(asAgent('w-one'))).map((one) => [one.act, one.inWords]))
    for (const one of actsDeclaredForTheOwner()) {
      expect(published.has(one.act), `GET /api/access does not publish ${one.act}`).toBe(true)
      expect(published.get(one.act), `GET /api/access publishes different words for ${one.act}`).toBe(one.inWords)
    }
  })

  it('publishes them to a secretary too, because no rung of the tree holds the person’s own power', async () => {
    // The declaration says the secretary acts for the person only while the press holds, and the
    // press is not part of what a card can do by itself. So without an elevation these are refused.
    const published = new Set((await refusedByRole(asAgent(THE_TEST_OFFICES_SECRETARY.handle))).map((one) => one.act))
    for (const one of actsDeclaredForTheOwner()) {
      expect(published.has(one.act), `a secretary’s card is not refused ${one.act}`).toBe(true)
    }
  })
})

describe('a person is refused nothing, and the route says why rather than answering an empty list alone', () => {
  it('publishes no role, no refusals, and a sentence about it', async () => {
    const reply = await app.app.inject({ method: 'GET', url: '/api/access', headers: AS_THE_PERSON })
    expect(reply.statusCode).toBe(200)
    const caller = (reply.json() as { caller: Record<string, unknown> }).caller
    expect(caller['refusedByRole']).toEqual([])
    expect(caller['role']).toBeNull()
    expect(String(caller['roleSays'])).toContain('No role narrows this caller')
  })
})
