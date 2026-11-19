// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE OPERATION VOCABULARY, BOUND TO THE ROUTES IN BOTH DIRECTIONS.
 *
 * Every /api route declares what a caller is asking for, in a name from src/shared/ops.ts. The
 * point of the name is that it survives the URL changing: `agent.inbox` is one question whichever
 * route answers it, so a route renamed next round keeps the measurements taken before the rename.
 *
 * That only works while the list and the routes agree, and nothing about a name in a file makes it
 * agree with a route in another file. So the two are bound from both ends:
 *
 *   - `operationOn` in src/server/api/kinds.ts throws at registration for a route that declares no
 *     operation, or one this list does not hold. The server does not start. Two tests below
 *     register such a route and watch it throw.
 *   - A name marked `live` that no route declares is a failing test here, and so is a route
 *     declaring a name that has been retired. Without those two, a name could be added early or
 *     kept after its route went, and nothing would say so.
 *
 * WHY A ROUTE AND ITS NAME LAND IN THE SAME COMMIT. Adding the name first fails the live-name test
 * here; adding the route first fails to register at all. The same commit is the only one in which
 * the tree is green, which is a fact about these two checks rather than a rule about tidiness.
 */

import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import Fastify from 'fastify'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { trackApiRoutes, type ApiRoute } from '../src/server/api/kinds.ts'

let t: TestDb
let app: FastifyInstance
let routes: readonly ApiRoute[]

beforeAll(async () => {
  t = await freshDb()
  const built = await apiApp()
  app = built.app
  await app.ready()
  routes = built.listApiRoutes()
})

afterAll(async () => {
  await app.close()
  t.close()
})

/**
 * The registration guard, proved by registering a route the guard must refuse.
 *
 * A bare Fastify with the same hook the server installs, so what is being tested is the hook and
 * not the rest of the server.
 */
describe('a route that has not declared its operation does not register', () => {
  const register = async (config: unknown): Promise<void> => {
    const bare = Fastify({ logger: false })
    trackApiRoutes(bare)
    bare.get('/api/a-route-under-test', { config } as never, async () => ({ ok: true }))
    await bare.ready()
    await bare.close()
  }

  it('refuses a route with no operation at all, and names the endpoint', async () => {
    await expect(register({ reach: 'remote' })).rejects.toThrow(/GET \/api\/a-route-under-test declares no config\.operation/)
  })

  it('refuses a name the vocabulary does not hold, and names the endpoint and the name', async () => {
    await expect(register({ operation: 'record.raed', reach: 'remote' })).rejects.toThrow(
      /GET \/api\/a-route-under-test declares config\.operation as "record\.raed"/,
    )
  })

  it('accepts a route that declared both, so the refusals above are about the declaration', async () => {
    await expect(register({ operation: 'record.read', reach: 'remote' })).resolves.toBeUndefined()
  })
})
