// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A DECISION SAYS WHO DECIDED IT, WHO WROTE IT DOWN, AND WHAT IT STANDS ON.
 *
 * ---------------------------------------------------------------------------------------
 * THE HOLE THIS CLOSES
 * ---------------------------------------------------------------------------------------
 *
 * Before 27 August 2026 a decision record answered one question — a person filed this — because the
 * kind was refused to every agent. Who DECIDED and who TYPED were the same by construction, so
 * neither was stored, and an agent that knew the owner had already decided something could file
 * only a note that nothing queries.
 *
 * The owner separated the two themselves: *"distinguish MAKING a governance Decision from RECORDING a
 * Decision the human already made"*. This file pins the separation.
 *
 * ---------------------------------------------------------------------------------------
 * THE ONE THAT MATTERS MOST: `recorded_by` IS NOT THE CALLER'S TO TYPE
 * ---------------------------------------------------------------------------------------
 *
 * A caller that could type it could sign somebody else's name to its own choice, and nothing on any
 * page would show that it had happened. So it is filled from the actor on the request, refused from
 * a body on BOTH doors, and never changed afterwards. A rule enforced on one write path is not a
 * rule: this file drives POST and PATCH.
 *
 * IT IS CHECKED AGAINST THE CHANGE ROW rather than only against itself, because the field and the
 * change log are two accounts of one fact and this repository's recurring defect is exactly that.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import {
  AGENT_AUTHORITIES,
  DECISION_AUTHORITIES,
  DECISION_AUTHORITY_NEEDS,
  KIND_SPECS,
  THE_OWNER,
  validateData,
} from '../src/shared/kinds.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { freshDb, type TestDb } from './helpers.ts'

const decision = KIND_SPECS.decision
const keys = decision.fields.map((f) => f.key)

const HUMAN_HEADERS = {
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
  'x-mole-office-workspace': 'default',
}

let t: TestDb
let app: FastifyInstance

beforeAll(async () => {
  t = await freshDb()
  const { recordRoutes } = await import('../src/server/api/records.ts')
  const { installErrorHandling } = await import('../src/server/lib/http.ts')
  app = Fastify()
  installErrorHandling(app)
  await app.register(recordRoutes, { prefix: '/api' })
  await app.ready()
}, 120_000)

afterAll(async () => {
  await app.close()
  t.close()
})

const dataOf = (id: string): Record<string, unknown> => (t.api.getRecord(id)?.data ?? {}) as Record<string, unknown>

describe('the three fields', () => {
  it('are declared on the decision kind, and none of them is demanded', () => {
    for (const key of ['decided_by', 'recorded_by', 'authority']) {
      expect(keys, `a decision cannot say ${key}`).toContain(key)
      expect(decision.fields.find((f) => f.key === key)?.required).toBe(false)
    }
  })

  it('authority is exactly five words, and one of them is the owner’s', () => {
    expect([...DECISION_AUTHORITIES]).toEqual([
      'the owner said so',
      'an existing decision',
      'a product invariant',
      'a measurement',
      'reversible engineering judgement',
    ])
    // The four an agent may claim for itself are the five minus the owner's. An agent citing the owner's word is
    // transcribing rather than deciding, and that is a different act with a different requirement.
    expect([...AGENT_AUTHORITIES]).toEqual([
      'an existing decision',
      'a product invariant',
      'a measurement',
      'reversible engineering judgement',
    ])
    expect(AGENT_AUTHORITIES).not.toContain('the owner said so')
  })

  it('says what each authority has to carry, so a refusal can name it', () => {
    for (const word of DECISION_AUTHORITIES) {
      expect(DECISION_AUTHORITY_NEEDS[word], `nothing says what "${word}" has to carry`).toBeTruthy()
    }
  })

  it('checks authority against the five, so a sixth cannot be stored', () => {
    const bad = validateData('decision', { authority: 'it seemed right' })
    expect(bad.ok, 'a word outside the vocabulary was accepted').toBe(false)
    if (bad.ok) throw new Error('unreachable')
    expect(bad.errors[0]?.path).toBe('data.authority')
  })

  it('names the owner by role and never by a person’s name', () => {
    // A name in a vocabulary makes one installation's owner part of the schema, and the same word
    // has to be the one `who_settles_it` uses or the guard and the queue match different strings.
    expect(THE_OWNER).toBe('the owner')
    expect(decision.fields.find((f) => f.key === 'decided_by')?.description).toContain('NEVER A PERSON\'S NAME')
  })
})

describe('`recorded_by` is filled from the request', () => {
  it('a decision filed by a person is recorded by that person, and the change row agrees', async () => {
    const made = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: HUMAN_HEADERS,
      payload: {
        kind: 'decision',
        title: 'Never change the GPU driver on the workstation',
        data: { replaces: [], decided_by: THE_OWNER, authority: 'a product invariant', because: 'the 5070 Ti is marginally stable' },
      },
    })
    expect(made.statusCode).toBe(201)
    const id = (made.json() as { record: { id: string } }).record.id
    expect(dataOf(id)['recorded_by']).toBe(`human ${THE_TEST_OFFICES_OWNER.id}`)
    // AND IT IS THE SAME ACTOR THE CHANGE LOG GOT. The field and the log are two accounts of one
    // fact; checking them against each other is what stops them drifting.
    const create = t.api.listChanges({ workspaceId: 'default', recordId: id }).filter((row) => row.op === 'create')
    expect(`${create[0]?.actorType} ${create[0]?.actorId}`).toBe(dataOf(id)['recorded_by'])
  })

  it('a decision filed with no data at all still says who wrote it down', async () => {
    const made = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: HUMAN_HEADERS,
      payload: { kind: 'decision', title: 'Stop the round-ten campaign block', data: { replaces: [] } },
    })
    expect(made.statusCode).toBe(201)
    const id = (made.json() as { record: { id: string } }).record.id
    expect(dataOf(id)['recorded_by']).toBe(`human ${THE_TEST_OFFICES_OWNER.id}`)
  })
})

describe('`recorded_by` is refused from a caller, on both doors', () => {
  const filed = async (): Promise<string> => {
    const made = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: HUMAN_HEADERS,
      payload: { kind: 'decision', title: 'Position control for the handover', data: { replaces: [], authority: 'a measurement' } },
    })
    return (made.json() as { record: { id: string } }).record.id
  }

  it('POST refuses it, says why, and writes nothing', async () => {
    const decisionsBefore = t.api.listRecords({ workspaceId: 'default', kind: 'decision' }).length
    const reply = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: HUMAN_HEADERS,
      payload: {
        kind: 'decision',
        title: 'Signed in somebody else’s name',
        data: { replaces: [], recorded_by: `human ${THE_TEST_OFFICES_OWNER.id}`, authority: 'a measurement' },
      },
    })
    expect(reply.statusCode).toBe(403)
    const message = (reply.json() as { error?: string; message?: string }).message ?? (reply.json() as { error: string }).error
    expect(message, 'the refusal does not say what is wrong').toContain('never accepted from a caller')
    expect(message, 'the refusal does not say what to send instead').toContain('decided_by')
    expect(message, 'the refusal does not say nothing was written').toContain('Nothing was written')
    expect(t.api.listRecords({ workspaceId: 'default', kind: 'decision' }).length).toBe(decisionsBefore)
  })

  it('PATCH refuses it too, and the record is exactly as it was', async () => {
    const id = await filed()
    const before = dataOf(id)['recorded_by']
    const reply = await app.inject({
      method: 'PATCH',
      url: `/api/records/${id}`,
      headers: HUMAN_HEADERS,
      payload: { dataPatch: { recorded_by: 'agent claude-code' } },
    })
    expect(reply.statusCode).toBe(403)
    expect(dataOf(id)['recorded_by']).toBe(before)
  })

  it('a `data` that replaces the whole object cannot erase it either', async () => {
    // The caller cannot SEND the key, so a full replace would simply drop it and the decision would
    // quietly stop saying who typed it. The stored value is carried across.
    const id = await filed()
    const reply = await app.inject({
      method: 'PATCH',
      url: `/api/records/${id}`,
      headers: HUMAN_HEADERS,
      // THE WHOLE DATA KEEPS `replaces`, because a whole replace that dropped a saved field is refused (problem ZSWftCSVUP2r
      // added the field to every decision the door writes).
      payload: { data: { authority: 'reversible engineering judgement', replaces: [] } },
    })
    expect(reply.statusCode).toBe(200)
    expect(dataOf(id)['recorded_by']).toBe(`human ${THE_TEST_OFFICES_OWNER.id}`)
    expect(dataOf(id)['authority']).toBe('reversible engineering judgement')
  })
})
