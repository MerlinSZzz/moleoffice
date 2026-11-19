// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ACTOR_HEADERS, WORKSPACE_HEADER } from '../src/shared/request-headers.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

describe('the request header names in GET /api', () => {
  let db: TestDb
  let app: FastifyInstance

  beforeAll(async () => {
    db = await freshDb()
    const built = await apiApp()
    app = built.app
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
    db.close()
  })

  it('publishes exactly the actor and workspace headers the request readers use', async () => {
    const http = await import('../src/server/lib/http.ts')
    const response = await app.inject({
      method: 'GET',
      url: '/api',
      headers: { [WORKSPACE_HEADER]: 'default' },
    })
    expect(response.statusCode, response.body).toBe(200)

    const index = JSON.parse(response.body) as {
      attribution: Record<string, string>
      workspace: Record<string, unknown>
    }
    expect(Object.keys(index.attribution).sort()).toEqual(Object.values(ACTOR_HEADERS).sort())
    expect(Object.keys(index.workspace).filter((name) => name.startsWith('x-'))).toEqual([WORKSPACE_HEADER])
    expect(index.workspace.stated).toBe(true)

    const read = http.observedIdentity({
      headers: {
        [ACTOR_HEADERS.type]: 'agent',
        [ACTOR_HEADERS.id]: 'header-reader-proof',
        [ACTOR_HEADERS.session]: 'header-reader-run',
      },
    } as unknown as FastifyRequest)
    expect(read).toEqual({
      actorType: 'agent',
      actorId: 'header-reader-proof',
      sessionId: 'header-reader-run',
      any: true,
    })
  })
})
