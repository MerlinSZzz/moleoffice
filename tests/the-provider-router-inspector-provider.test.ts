// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { THE_INSPECTOR } from '../src/shared/roles.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const headers = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON, 'x-mole-office-workspace': 'default' }
let db: TestDb
let app: FastifyInstance
let inspector: typeof import('../src/server/lib/keyrouter/provider-router.ts')
const previous = process.env.MOLE_OFFICE_PROVIDER_ROUTER
beforeAll(async () => {
  process.env.MOLE_OFFICE_PROVIDER_ROUTER = 'on'
  db = await freshDb()
  app = (await apiApp()).app
  inspector = await import('../src/server/lib/keyrouter/provider-router.ts')
})
afterAll(async () => {
  await app?.close(); db?.close()
  if (previous === undefined) delete process.env.MOLE_OFFICE_PROVIDER_ROUTER
  else process.env.MOLE_OFFICE_PROVIDER_ROUTER = previous
})

describe('the inspector row names the provider it actually uses', () => {
  it('identifies OpenAI and OpenCode Go separately for check-view refusal', async () => {
    for (const [provider, named] of [['openai', 'OpenAI'], ['opencode-go', 'OpenCode Go']] as const) {
      const row = await app.inject({ method: 'POST', url: `/api/casting/${THE_INSPECTOR}`, headers, payload: {
        program: { value: 'opencode' }, model: { value: `${provider}/made-up` }, effort: { value: 'high' }, native: { model: 'made-up', provider, variant: null },
      } })
      expect(row.statusCode).toBe(201)
      expect(inspector.theInspectorRowTheRouterMustCarry()?.provider.named).toBe(named)
      try { inspector.refuseWhileTheRouterMustCarryTheInspector(); expect.fail('the inspector should be refused') }
      catch (error) { expect((error as Error).message).toContain(named) }
      const id = (row.json() as { casting: { id: number } }).casting.id
      const removed = await app.inject({ method: 'DELETE', url: `/api/casting/rows/${id}`, headers })
      expect(removed.statusCode).toBe(200)
    }
  })
})
