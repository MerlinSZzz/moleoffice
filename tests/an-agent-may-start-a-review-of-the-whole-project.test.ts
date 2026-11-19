// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN AGENT MAY START A PROJECT-WIDE REVIEW.
 *
 * Criterion P39 of design/permissions/ACCEPTANCE.md stands on a decision that took option B.
 *
 * WHAT WAS WRONG. The route has never checked the actor, and the schema comment on
 * `reviews.started_by_agent` said *"An agent may ASK for a review and may not start one, so only the
 * owner's press writes this"*. Two statements of one rule, disagreeing, with the stricter one
 * enforced nowhere. The decision says the route was right, so the comment is what changed.
 *
 * WHY THAT WAS CHOSEN. From the fork: a project-wide review is attributed on screen,
 * it files an item in the person's queue with Stop it or Leave it running, and the person can stop any of them. It is
 * loud by construction, so requiring the person's press every time costs them something real for no protection.
 *
 * THIS FILE HOLDS THE ROUTE TO THAT DECISION: an agent may start one, and the person may still.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

let t: TestDb
let app: FastifyInstance
const AS_AN_AGENT = { 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'builder-x' }
const AS_THE_PERSON = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }

async function startAReview(headers: Record<string, string>, about: string, reach: string): Promise<number> {
  const reply = await app.inject({
    method: 'POST',
    url: '/api/reviews',
    headers,
    payload: { entry: { target: { kind: 'record', recordId: about, workspaceId: 'default' } }, reach },
  })
  return reply.statusCode
}

let aRecord: string

beforeAll(async () => {
  t = await freshDb()
  const built = await apiApp()
  app = built.app
  await app.ready()
  aRecord = t.api.createRecord({
    workspaceId: 'default',
    kind: 'note',
    title: 'Something to stand on while starting a review',
    data: {},
    actor: { type: 'human', id: THE_PERSON },
  }).id
})

afterAll(async () => {
  await app.close()
  t.close()
})

describe('the route lets an agent start one', () => {
  it('accepts a project-wide review from an agent', async () => {
    expect(await startAReview(AS_AN_AGENT, aRecord, 'global')).toBe(201)
  })

  it('accepts one from the person too, which never changed', async () => {
    const another = t.api.createRecord({
      workspaceId: 'default',
      kind: 'note',
      title: 'Another place to stand',
      data: {},
      actor: { type: 'human', id: THE_PERSON },
    }).id
    expect(await startAReview(AS_THE_PERSON, another, 'local')).toBe(201)
  })
})

