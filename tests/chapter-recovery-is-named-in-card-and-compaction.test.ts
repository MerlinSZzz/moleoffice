// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, thePersonsKeyHeader, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
let db: TestDb, app: FastifyInstance, person: Record<string, string>, agentHeaders: Record<string, string>, brokenId: string
beforeAll(async () => {
  db = await freshDb(); app = (await apiApp()).app; await app.ready()
  person = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id, 'x-mole-office-workspace': 'default', ...thePersonsKeyHeader() }
  const broken = await app.inject({ method: 'POST', url: '/api/records', headers: person, payload: { kind: 'module', title: 'An invented broken chapter', summary: 'An invented chapter with no rules.', data: { state: 'active', parts: [], extra: { chapter: 9 }, summaryBlocks: [] } } })
  expect(broken.statusCode, broken.body).toBe(201); brokenId = broken.json().record.id
  const registered = await app.inject({ method: 'POST', url: '/api/agents/started', headers: person, payload: { handle: 'made-up-recovery-reader', name: 'Made up recovery reader', role: 'worker', chapters: ['9:outline'] } }); expect(registered.statusCode, registered.body).toBe(201)
  const { agentByHandle } = await import('../src/server/lib/participants.ts'), { makeAnAgentKey } = await import('../src/server/lib/keys.ts')
  agentHeaders = { ...person, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'made-up-recovery-reader', 'x-mole-office-key': makeAnAgentKey(agentByHandle('made-up-recovery-reader')!.id, null) }
})
afterAll(async () => { await app.close(); db.close() })

it('the compaction reminder names the rejected record and its problems beside the selected chapter names', async () => {
  const response = await app.inject({ url: '/api/after-a-compaction', headers: agentHeaders }); expect(response.statusCode, response.body).toBe(200)
  expect(response.json().rules.says).toContain(brokenId); expect(response.json().rules.says).toContain('The chapter has no rules.'); expect(response.json().rules.says).toContain('uses the shipped content')
})

it('the card message and the role cards name that same rejected record wherever they show its chapter', async () => {
  const waiting = await app.inject({ url: '/api/handles/made-up-recovery-reader/waiting', headers: person })
  const ids = waiting.json().waiting.map((one: { messageId: string }) => one.messageId) as string[]
  let words = ''
  for (const id of ids) words += (await app.inject({ url: `/api/records/${id}`, headers: person })).json().record.data.saidInFull ?? ''
  expect(words).toContain(brokenId); expect(words).toContain('The chapter has no rules.')
  const roles = await app.inject({ url: '/api/roles', headers: person }); expect(roles.statusCode).toBe(200)
  expect(roles.json().chapters.find((one: { number: number }) => one.number === 9).name).toContain(brokenId)
})
