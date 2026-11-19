// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN AGENT'S STATE LINE IS AT MOST 60 CHARACTERS, AND THE DESCRIPTION SAYS SO.
 *
 * The friction on the record of 14 September 2026: the PATCH description never said the limit, so an
 * agent learned it from the refusal. This test reads the served sentence, then carries it out against
 * the real route, the way tests/api-surface.test.ts works: a body the description allows must work,
 * and a body it refuses must fail in the way it said.
 *
 * MUTATION, after a control run: remove the "60 CHARACTERS" sentence from CHANGE_NOTE in
 * src/server/api/participants.ts and the first assertion goes red.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import type { ApiRoute } from '../src/server/api/kinds.ts'

let t: TestDb
let app: FastifyInstance
let listRoutes: () => readonly ApiRoute[]

const AS_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

beforeAll(async () => {
  t = await freshDb()
  const built = await apiApp()
  app = built.app
  listRoutes = built.listApiRoutes
  await app.ready()
  t.api.createRecord({
    workspaceId: 'default',
    kind: 'agent',
    title: 'A line to set',
    data: { handle: 'line-subject', state: 'active', startedBy: { kind: 'person', id: THE_PERSON } },
    actor: { type: 'human', id: THE_PERSON },
  })
})

afterAll(async () => {
  await app.close()
  t.close()
})

describe('the state line limit is in the description and enforced', () => {
  it('says 60 in the served sentence and refuses a 61-character line', async () => {
    const change = listRoutes().find(
      (one) => one.method === 'PATCH' && one.path === '/api/participants/:kind/:id',
    )
    expect(change, 'the PATCH route is served').toBeDefined()
    expect(change?.note ?? '', 'the description states the limit').toContain('60 CHARACTERS')

    const sixty = 'x'.repeat(60)
    const sixtyOne = 'x'.repeat(61)
    const good = await app.inject({
      method: 'PATCH',
      url: '/api/participants/agent/line-subject',
      headers: AS_PERSON,
      payload: { state: sixty },
    })
    expect(good.statusCode, good.body).toBe(200)
    const bad = await app.inject({
      method: 'PATCH',
      url: '/api/participants/agent/line-subject',
      headers: AS_PERSON,
      payload: { state: sixtyOne },
    })
    expect(bad.statusCode).toBe(400)
    expect(bad.json<{ error: string }>().error).toContain('60 characters')
  })
})
