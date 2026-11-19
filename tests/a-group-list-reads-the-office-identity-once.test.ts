// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

let t: TestDb
let app: FastifyInstance
const person = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const agent = { ...person, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'group-reader-fixture' }

async function post(url: string, payload: object, headers = person): Promise<any> {
  const reply = await app.inject({ method: 'POST', url, headers, payload })
  expect(reply.statusCode, reply.body).toBeLessThan(300)
  return reply.json()
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

describe('the group list reads the office identity once for a pass', () => {
  it('keeps unread counts while the identity reads do not grow with group messages', async () => {
    await post('/api/agents/started', { handle: 'group-reader-fixture', name: 'Group reader fixture', workArea: ['src'] })
    const opened = await post('/api/groups', { name: 'A group', because: 'a fixture for the list', members: [
      { who: { kind: 'person', id: THE_PERSON }, because: 'reads the group' },
      { who: { kind: 'agent', id: 'group-reader-fixture' }, because: 'writes to the group' },
    ] })
    const groupId: string = opened.group.id
    const shared = await import('../src/shared/participants.ts')
    const participants = await import('../src/server/lib/participants.ts')
    let calls = 0
    const count = async () => {
      calls = 0
      const reply = await app.inject({ method: 'GET', url: '/api/groups?shape=page', headers: person })
      expect(reply.statusCode).toBe(200)
      const group = reply.json().groups.find((row: { id: string }) => row.id === groupId)
      expect(group).toBeDefined()
      return { calls, unread: group.unread, anythingUnread: group.anythingUnread }
    }
    shared.readMoleOfficeIdWith(() => { calls++; return participants.moleOfficeIdFromItsRow() })
    try {
      const few = await count()
      const messages = Array.from({ length: 12 }, (_, i) => `Group fixture message ${String(i)}`)
      for (const body of messages) await post('/api/records', { kind: 'message', title: body, data: { body, toGroup: groupId } }, agent)
      const many = await count()
      expect(many.unread).toBe(few.unread + messages.length)
      expect(many.anythingUnread).toBe(true)
      expect(many.calls, 'office identity reads should not grow with the message count').toBeLessThanOrEqual(few.calls + 1)
    } finally {
      shared.readMoleOfficeIdWith(participants.moleOfficeIdFromItsRow)
    }
  })
})
