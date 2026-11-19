// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Pages of the between-agents list preserve the whole list's order, counts and project marks. */
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { THE_PERSON } from '../src/shared/person.ts'
import type { ShortBetweenAgentsRow } from '../src/shared/short-lists.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { buildTheChatOffice } from './the-chat-office-of-the-live-shape.ts'

const PERSON = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const PAGE_SIZE = 25
const PROJECT = 'made-up-project'
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
  db.client.sqlite.prepare("update records set data = json_set(data, '$.writtenIn.project', ?) where kind = 'message' and rowid % 3 = 0").run(PROJECT)
}, 120_000)

afterAll(async () => { await app?.close(); db?.close() })

async function read(query: string) {
  const response = await app.inject({ method: 'GET', url: `/api/messages/between-agents?${query}`, headers: PERSON })
  expect(response.statusCode).toBe(200)
  return response.json() as { conversations: ShortBetweenAgentsRow[]; page?: { next: string | null } }
}

it('joins pages to the whole short list, both for all projects and a chosen project', async () => {
  const whole = (await read('shape=page')).conversations
  expect(whole.length).toBeGreaterThan(PAGE_SIZE * 2)
  for (const project of [null, PROJECT]) {
    const expected = project === null ? whole : whole.filter(one => one.projects.includes(project))
    if (project !== null) {
      expect(expected.length).toBeGreaterThan(PAGE_SIZE)
      expect(expected.length).toBeLessThan(whole.length)
    }
    const joined: ShortBetweenAgentsRow[] = []
    const seen = new Set<string>()
    let cursor: string | null = null
    do {
      const query = new URLSearchParams({ shape: 'page', limit: String(PAGE_SIZE) })
      if (project !== null) query.set('project', project)
      if (cursor !== null) query.set('cursor', cursor)
      const page = await read(query.toString())
      expect(page.conversations.length).toBeLessThanOrEqual(PAGE_SIZE)
      joined.push(...page.conversations)
      expect(page.page).toBeDefined()
      cursor = page.page!.next
      if (cursor !== null) {
        expect(seen.has(cursor)).toBe(false)
        seen.add(cursor)
      }
    } while (cursor !== null)
    expect(joined).toEqual(expected)
  }
}, 120_000)
