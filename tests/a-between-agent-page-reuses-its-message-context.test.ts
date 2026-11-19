// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** The page builds many pools while sharing the facts that apply to the whole read. */
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { buildTheChatOffice } from './the-chat-office-of-the-live-shape.ts'

let db: TestDb
let app: FastifyInstance

beforeAll(async () => {
  db = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  buildTheChatOffice(db.client.sqlite, THE_PERSON, {
    agents: 40, retired: 0, theConversation: 0, otherContacts: 0, otherPersonMessages: 0,
    betweenAgents: 500, groups: 0, groupsWithThePerson: 0, membersPerGroup: 0,
    groupMessages: 0, officeLines: 0, sessions: 0, otherRecords: 0,
  })
}, 120_000)

afterAll(async () => { await app?.close(); db?.close() })

it('reads the shared comment and starter facts once for the whole page', async () => {
  const prototype = Object.getPrototypeOf(db.client.sqlite.prepare('SELECT 1')) as Record<string, unknown>
  const original = prototype['all'] as (this: { source: string }, ...args: unknown[]) => unknown
  const statements: string[] = []
  prototype['all'] = function (this: { source: string }, ...args: unknown[]): unknown {
    statements.push(this.source)
    return original.apply(this, args)
  }
  try {
    const reply = await app.inject({
      method: 'GET', url: '/api/messages/between-agents?shape=page&limit=25',
      headers: { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON },
    })
    expect(reply.statusCode).toBe(200)
    expect(reply.json().conversations.length).toBeGreaterThanOrEqual(25)
    expect(statements.filter((sql) => sql.includes('FROM agent_starter_changes'))).toHaveLength(1)
    expect(statements.filter((sql) => sql.includes('FROM agent_messages m JOIN agent_threads t'))).toHaveLength(1)
    expect(statements.filter((sql) => sql.includes('"annotation_words_fixed"'))).toHaveLength(1)
  } finally {
    prototype['all'] = original
  }
}, 120_000)
