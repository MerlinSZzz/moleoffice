// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE GUARD READS WHO RECORDED A DECISION, NOT WHO IS NAMED AS DECIDER. Criterion P76.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS IS THE RIGHT FIELD, AND WHY IT IS A SEPARATE TEST
 * ---------------------------------------------------------------------------------------
 *
 * `recorded_by` is written once by Mole Office from the actor on the request and refused from every
 * caller; `decided_by` is the caller's own statement. A guard that read `decided_by` would let an
 * agent write itself the right in the same request it is being refused for — send `decided_by` with
 * its own handle, and the core opens. The design record
 * `design/permissions/DESIGN-2026-09-08-perm-5.md`, version 2 of 8 September 2026, says exactly
 * this: "the guard reads who recorded the decision (recorded_by), not who is named as decider, so an
 * agent cannot write itself the right."
 *
 * ---------------------------------------------------------------------------------------
 * WHAT TURNS THIS RED
 * ---------------------------------------------------------------------------------------
 *
 * Change the guard to compare the incoming `decided_by` with the actor instead of the stored
 * `recorded_by`, and the first case below goes red: the agent names itself decider and its rewrite
 * of a decision the person recorded is allowed.
 *
 * The second and third cases hold the other direction: the agent that really did record the
 * decision may change its own core, which is the whole point of reading `recorded_by`.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'

import { apiApp, freshDb, type TestDb, governsTheWholeProject } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const asAgent = (handle: string): Record<string, string> => ({
  ...AS_THE_PERSON,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
})

const A = 'claude-code/a-worker'
const B = 'claude-code/b-worker'

let t: TestDb
let app: FastifyInstance
let personsDecision: string

async function dataOf(id: string): Promise<Record<string, unknown>> {
  const reply = await app.inject({ method: 'GET', url: `/api/records/${id}`, headers: AS_THE_PERSON })
  expect(reply.statusCode, reply.body).toBe(200)
  const held = (reply.json() as { record: Record<string, unknown> }).record
  return (held['data'] ?? {}) as Record<string, unknown>
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
}, 120_000)

afterAll(async () => {
  await app.close()
  t.close()
})

beforeEach(async () => {
  // THE PERSON RECORDED THIS ONE, so `recorded_by` is "human" and the person's id. `decided_by` and `authority`
  // are filled so that if the guard wrongly read the named decider, the rewrite below would pass
  // every other rule and the test would catch the difference rather than a missing field.
  const made = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: AS_THE_PERSON,
    payload: {
      kind: 'decision',
      title: 'A decision the person recorded',
      data: { ...governsTheWholeProject(), replaces: [],
        option_taken: 'a — as proposed',
        because: 'measured in the terminal',
        decided_by: 'the owner',
        authority: 'a measurement',
      },
    },
  })
  expect(made.statusCode, made.body).toBe(201)
  personsDecision = ((made.json() as { record: { id: string } }).record).id
})

describe('naming yourself decider does not give you the right', () => {
  it('refuses an agent that sends its own handle as decided_by beside a core change', async () => {
    const reply = await app.inject({
      method: 'PATCH',
      url: `/api/records/${personsDecision}`,
      headers: asAgent(A),
      payload: { dataPatch: { decided_by: A, because: 'an agent rewrote the reason' } },
    })
    expect(reply.statusCode, reply.body.slice(0, 400)).toBe(403)
    const data = await dataOf(personsDecision)
    expect(data['because'], 'the reason the person recorded is untouched').toBe('measured in the terminal')
    expect(data['decided_by'], 'the named decider is untouched too').toBe('the owner')
  })

  it('still lets the same agent change a note on that decision', async () => {
    const reply = await app.inject({
      method: 'PATCH',
      url: `/api/records/${personsDecision}`,
      headers: asAgent(A),
      payload: { dataPatch: { decided_by: A, revisit_when: 'when the sensor is calibrated' } },
    })
    expect(reply.statusCode, reply.body.slice(0, 400)).toBe(200)
    expect((await dataOf(personsDecision))['revisit_when']).toBe('when the sensor is calibrated')
  })
})

describe('the agent that recorded a decision may change its own core', () => {
  it('lets the recorder change the words why, and refuses a different agent', async () => {
    const made = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: asAgent(A),
      payload: {
        kind: 'decision',
        title: 'A decision this agent made',
        data: {
          ...governsTheWholeProject(),
          replaces: [], option_taken: 'b — force control', because: 'reversible this week', decided_by: A, authority: 'a measurement' },
      },
    })
    expect(made.statusCode, made.body.slice(0, 400)).toBe(201)
    const itsOwn = ((made.json() as { record: { id: string } }).record).id
    expect((await dataOf(itsOwn))['recorded_by']).toBe(`agent ${A}`)

    const byItself = await app.inject({
      method: 'PATCH',
      url: `/api/records/${itsOwn}`,
      headers: asAgent(A),
      payload: { dataPatch: { because: 'reversible this week, and again next week' } },
    })
    expect(byItself.statusCode, byItself.body.slice(0, 400)).toBe(200)

    const byAnother = await app.inject({
      method: 'PATCH',
      url: `/api/records/${itsOwn}`,
      headers: asAgent(B),
      payload: { dataPatch: { because: 'another agent rewrote it' } },
    })
    expect(byAnother.statusCode, byAnother.body.slice(0, 400)).toBe(403)
    expect((await dataOf(itsOwn))['because']).toBe('reversible this week, and again next week')
  })
})
