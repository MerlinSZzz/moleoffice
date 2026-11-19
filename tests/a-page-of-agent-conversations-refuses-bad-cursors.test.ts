// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** A broken cursor is refused, and either project mark can find a sparse conversation page. */
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import * as REFUSAL_CODES from '../src/shared/refusal-codes.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { enWave13y } from '../src/shared/words/en-wave-13y.ts'
import type { ShortBetweenAgentsRow } from '../src/shared/short-lists.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { buildTheChatOffice } from './the-chat-office-of-the-live-shape.ts'

const PERSON = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const ABOUT = 'made-up-about-project'
const WRITTEN = 'made-up-written-project'

/** A page code by the name the module exports it under, read where the code defines it. */
function theCodeNamed(name: string): string | undefined {
  return (REFUSAL_CODES as unknown as Record<string, unknown>)[name] as string | undefined
}
let db: TestDb
let app: FastifyInstance

beforeAll(async () => {
  db = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  buildTheChatOffice(db.client.sqlite, THE_PERSON, {
    agents: 40, retired: 4, theConversation: 10, otherContacts: 3, otherPersonMessages: 12,
    betweenAgents: 900, groups: 2, groupsWithThePerson: 1, membersPerGroup: 3,
    groupMessages: 10, officeLines: 4, sessions: 20, otherRecords: 0,
  })
  db.client.sqlite.prepare("update records set data = json_set(json_remove(data, '$.writtenIn.project'), '$.aboutProject', ?) where kind = 'message' and rowid % 3 = 0").run(ABOUT)
  db.client.sqlite.prepare("update records set data = json_set(json_remove(data, '$.aboutProject'), '$.writtenIn.project', ?) where kind = 'message' and rowid % 3 = 1").run(WRITTEN)
}, 120_000)

afterAll(async () => { await app?.close(); db?.close() })

async function read(query: URLSearchParams) {
  return app.inject({ method: 'GET', url: `/api/messages/between-agents?${query}`, headers: PERSON })
}

it('refuses an unreadable cursor with its reason and a page code', async () => {
  const code = theCodeNamed('AGENT_CONVERSATIONS_CURSOR_INVALID')
  expect(code, 'the unreadable-cursor refusal has no page code').toBeTypeOf('string')
  const invalid = await read(new URLSearchParams({ shape: 'page', limit: '25', cursor: 'plain words' }))
  expect(invalid.statusCode).toBe(400)
  expect(invalid.json().error).toBe(enWave13y['server.agentConversationsCursorInvalid'])
  expect(invalid.json().code).toBe(code)
  expect(invalid.json().values).toEqual({})
})

it('refuses a cursor made for a different project with its reason and a page code', async () => {
  const code = theCodeNamed('AGENT_CONVERSATIONS_CURSOR_PROJECT')
  expect(code, 'the cross-project cursor refusal has no page code').toBeTypeOf('string')
  const first = await read(new URLSearchParams({ shape: 'page', limit: '25', project: ABOUT }))
  expect(first.statusCode).toBe(200)
  const cursor = first.json().page.next as string | null
  expect(cursor).not.toBeNull()
  const crossed = await read(new URLSearchParams({ shape: 'page', limit: '25', project: WRITTEN, cursor: cursor! }))
  expect(crossed.statusCode).toBe(400)
  expect(crossed.json().error).toBe(enWave13y['server.agentConversationsCursorProject'].replace('{from}', ABOUT).replace('{to}', WRITTEN))
  expect(crossed.json().code).toBe(code)
  expect(crossed.json().values).toEqual({ from: ABOUT, to: WRITTEN })
}, 120_000)

it.each([ABOUT, WRITTEN])('keeps every conversation marked only by %s in sparse pages', async (project) => {
  const whole = await read(new URLSearchParams({ shape: 'page' }))
  const expected = (whole.json().conversations as ShortBetweenAgentsRow[]).filter(one => one.projects.includes(project))
  expect(expected.length).toBeGreaterThan(25)
  const joined: ShortBetweenAgentsRow[] = []
  let cursor: string | null = null
  do {
    const query = new URLSearchParams({ shape: 'page', limit: '25', project })
    if (cursor !== null) query.set('cursor', cursor)
    const page = await read(query)
    expect(page.statusCode).toBe(200)
    joined.push(...page.json().conversations)
    cursor = page.json().page.next as string | null
  } while (cursor !== null)
  expect(joined).toEqual(expected)
}, 120_000)
