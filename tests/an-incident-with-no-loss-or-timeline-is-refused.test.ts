// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * CRITERION I1: an incident is a record kind of its own, and its door refuses one with no loss and
 * no timeline.
 *
 * An incident is more than one problem, and the scene,
 * the loss, the causes and the responsibility are reconstructed rather than left scattered across a
 * report and a handful of problems.
 *
 * WHAT THIS FILE HOLDS UP, and the mutation that proves it:
 *
 *   - a create with neither `loss` nor `timeline` is refused, 400, and the refusal names both;
 *   - a create with `loss` and no `timeline` is refused, and the refusal names `timeline`;
 *   - a create with `timeline` and no `loss` is refused, and the refusal names `loss`;
 *   - a create with both, plus every other field, succeeds;
 *   - a create with an EMPTY `timeline` array is refused the same as no timeline at all
 *     — MUTATION: take the length check out of `checkTheIncidentHasLossAndTimeline` in
 *       src/server/lib/records.ts, so an empty array passes;
 *   - `GET /api/kinds/incident` names every field I1 asks for, with an example.
 *
 * IT IS UNLIKE MOST KINDS, ON PURPOSE. Chapter 4 rule 6 makes an incomplete stub the ordinary shape
 * of a record in this product; this file is what proves the one deliberate exception I1 asks for
 * holds, without proving too much — a stub incident missing anything OTHER than loss or timeline
 * (its `where`, its `expected`, its `state`) is still accepted and reported incomplete, the same as
 * any other kind, and the last test below checks that too.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'

import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

let t: TestDb
let app: FastifyInstance

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

interface CreateReply {
  status: number
  body: string
  json: { record?: { id: string; kind: string }; incomplete?: { path: string }[] } | null
}

async function create(data: Record<string, unknown>): Promise<CreateReply> {
  const reply = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: AS_THE_PERSON,
    payload: { kind: 'incident', title: `an incident ${Math.random().toString(36).slice(2, 8)}`, data },
  })
  return {
    status: reply.statusCode,
    body: reply.body,
    json: reply.statusCode < 300 ? (reply.json() as CreateReply['json']) : null,
  }
}

const A_MOMENT = {
  id: 'm-1',
  at: '2026-09-09 14:02',
  who: 'the operator',
  what: 'Re-armed EGM after a pause.',
  evidence: 'ev-placeholder',
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
})

afterAll(async () => {
  await app.close()
  t.close()
})

describe('the door refuses an incident with no loss or no timeline', () => {
  it('refuses neither present, and names both', async () => {
    const said = await create({})
    expect(said.status, said.body).toBe(400)
    expect(said.body).toContain('`loss`')
    expect(said.body).toContain('`timeline`')
  })

  it('refuses loss with no timeline, and names timeline as the one missing', async () => {
    const said = await create({ loss: 'Two near-misses.' })
    expect(said.status, said.body).toBe(400)
    // THE OPENING SENTENCE NAMES WHAT IS MISSING, WHICH IS WHAT "REFUSED BY NAME" ASKS FOR. The
    // closing sentence goes on to say how to write BOTH fields, as guidance for next time, and a
    // test that refused the mere presence of the word "loss" anywhere in that guidance would be
    // testing prose rather than the door.
    expect(said.body).toContain('with no `timeline` is refused')
  })

  it('refuses timeline with no loss, and names loss as the one missing', async () => {
    const said = await create({ timeline: [A_MOMENT] })
    expect(said.status, said.body).toBe(400)
    expect(said.body).toContain('with no `loss` is refused')
  })

  it('refuses an EMPTY timeline exactly as it refuses no timeline at all', async () => {
    const said = await create({ loss: 'Two near-misses.', timeline: [] })
    expect(said.status, said.body).toBe(400)
    expect(said.body).toContain('`timeline`')
  })

  it('says nothing was written: the refusal is at the door, not a stub left behind', async () => {
    const before = await app.inject({ method: 'GET', url: '/api/records?kind=incident', headers: AS_THE_PERSON })
    const countBefore = (before.json() as { records: unknown[] }).records.length
    await create({})
    const after = await app.inject({ method: 'GET', url: '/api/records?kind=incident', headers: AS_THE_PERSON })
    expect((after.json() as { records: unknown[] }).records.length).toBe(countBefore)
  })
})

describe('with both, an incident may be filed, and stays an ordinary stub otherwise', () => {
  it('succeeds with loss and timeline and nothing else, and reports the rest incomplete', async () => {
    const said = await create({ loss: 'Two near-misses.', timeline: [A_MOMENT] })
    expect(said.status, said.body).toBe(201)
    expect(said.json?.record?.kind).toBe('incident')
    // AND EVERY OTHER REQUIRED FIELD IS THE ORDINARY "incomplete", NOT A REFUSAL. Chapter 4 rule 6
    // holds for `where`, `expected`, `actual` and `state` exactly as it does for any other kind —
    // I1's door is narrower than "every required field", on purpose.
    const missing = (said.json?.incomplete ?? []).map((one) => one.path)
    expect(missing).toContain('data.where')
    expect(missing).toContain('data.expected')
    expect(missing).toContain('data.actual')
    expect(missing).toContain('data.state')
  })
})

describe('the shape is published', () => {
  it('GET /api/kinds/incident names every field I1 asks for, with an example', async () => {
    const said = await app.inject({ method: 'GET', url: '/api/kinds/incident', headers: AS_THE_PERSON })
    expect(said.statusCode, said.body).toBe(200)
    const body = said.json() as { kind: { fields: { key: string; example: unknown }[] } }
    const fields = body.kind.fields
    const keys = fields.map((f) => f.key)
    for (const key of [
      'happened_at', 'where', 'loss', 'timeline', 'expected', 'actual',
      'direct_causes', 'contributing_factors', 'responsibility', 'corrective_actions',
      'verification', 'state', 'found_by', 'extra',
    ]) {
      expect(keys, key).toContain(key)
      const field = fields.find((f) => f.key === key)
      expect(field?.example, `${key} has an example`).toBeDefined()
    }
  })
})
