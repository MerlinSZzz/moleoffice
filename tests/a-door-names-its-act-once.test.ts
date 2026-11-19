// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { apiApp, freshDb, type TestDb } from './helpers.ts'
import type { ApiRoute } from '../src/server/api/kinds.ts'

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

const A_TEST_AGENTS_HEADERS = {
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'a-test-agent',
}

describe('a door names its act once', () => {
  it('2: the refusal an agent reads starts with the act the route table declares', async () => {
    const doors = [
      { url: '/api/office/start-at-login', path: '/api/office/start-at-login', route: 'GET /api/office/start-at-login' },
      { url: '/api/office/sandbox-memory-cap', path: '/api/office/sandbox-memory-cap', route: 'GET /api/office/sandbox-memory-cap' },
      { url: '/api/terminals/any-terminal/keeping', path: '/api/terminals/:id/keeping', route: 'GET /api/terminals/:id/keeping' },
    ]
    const wrong: string[] = []
    for (const door of doors) {
      const declared = routes.find((one) => one.method.toUpperCase() === 'GET' && one.path === door.path)
      const act = declared?.keptHere?.act
      if (act === undefined) {
        wrong.push(`${door.route} declares no act, so this test cannot read one`)
        continue
      }
      const reply = await app.inject({ method: 'GET', url: door.url, headers: A_TEST_AGENTS_HEADERS })
      const said = reply.json() as { error?: unknown }
      const error = String(said.error ?? '')
      if (reply.statusCode !== 403 || !error.startsWith(`${act} is the person's own act`)) {
        wrong.push(`${door.route} answered ${String(reply.statusCode)} with "${error}" where the act is "${act}"`)
      }
    }
    expect(wrong).toEqual([])
  })

  it('4: the refusal a helper builds starts with the act the route table declares', async () => {
    const doors = [
      { method: 'GET', url: '/api/office/mail-tool', path: '/api/office/mail-tool' },
      { method: 'GET', url: '/api/office/push', path: '/api/office/push' },
      { method: 'POST', url: '/api/roles/elevation/any-agent', path: '/api/roles/elevation/:handle' },
    ] as const
    const wrong: string[] = []
    for (const door of doors) {
      const declared = routes.find((one) => one.method.toUpperCase() === door.method && one.path === door.path)
      const act = declared?.keptHere?.act
      if (act === undefined) {
        wrong.push(`${door.method} ${door.path} declares no act, so this test cannot read one`)
        continue
      }
      const reply = await app.inject({ method: door.method, url: door.url, headers: A_TEST_AGENTS_HEADERS })
      const said = reply.json() as { error?: unknown }
      const error = String(said.error ?? '')
      if (reply.statusCode !== 403 || !error.startsWith(`${act} is `)) {
        wrong.push(`${door.method} ${door.path} answered ${String(reply.statusCode)} with "${error}" where the act is "${act}"`)
      }
    }
    expect(wrong).toEqual([])
  })
})
