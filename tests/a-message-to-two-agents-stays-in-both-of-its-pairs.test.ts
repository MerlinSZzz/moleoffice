// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A MESSAGE TO TWO AGENTS STAYS IN BOTH OF ITS PAIRS ON THE PAGED LIST.
 *
 * S writes one message to X and Y, so it is in the S|X conversation and in the S|Y one. S also wrote to Y alone,
 * earlier, in a second project. X wrote last of all, so the page reads X first and finds S|X whole. The reads of S
 * and Y must still each keep that one message for S|Y. If a read leaves it out because S|X holds it, S's read builds
 * S|Y from the older message alone and Y's read builds it from the shared message alone. The first page then keeps
 * one of those two partial rows: its last line is right, but it counts one message where the pair has two, and it
 * names one project where the pair has two. The page after the cursor lists the older partial row as a second S|Y.
 *
 * Every pair, paged at 25 and joined, must be drawn once and carry what the whole list carries for it: its last line,
 * what it counts as new, whether anything is new, and its projects. The person never opened a pair, so what a pair
 * counts as new is every message in it, and its projects are those of every message in it.
 */
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { THE_PERSON } from '../src/shared/person.ts'
import type { ShortBetweenAgentsRow } from '../src/shared/short-lists.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { buildTheChatOffice } from './the-chat-office-of-the-live-shape.ts'

const PERSON = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const PAGE_SIZE = 25
let db: TestDb
let app: FastifyInstance

beforeAll(async () => {
  db = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  buildTheChatOffice(db.client.sqlite, THE_PERSON, {
    agents: 30, retired: 0, theConversation: 0, otherContacts: 0, otherPersonMessages: 0,
    betweenAgents: 0, groups: 0, groupsWithThePerson: 0, membersPerGroup: 0,
    groupMessages: 0, officeLines: 0, sessions: 1, otherRecords: 0,
  })
}, 120_000)

afterAll(async () => { await app?.close(); db?.close() })

async function read(query: string): Promise<{ conversations: ShortBetweenAgentsRow[]; page?: { next: string | null } }> {
  const response = await app.inject({ method: 'GET', url: `/api/messages/between-agents?${query}`, headers: PERSON })
  expect(response.statusCode).toBe(200)
  return response.json()
}

function keyOf(one: ShortBetweenAgentsRow): string {
  return one.between.map((side) => side.id).sort().join('|')
}

it('keeps a message to two agents in both of its pairs, and draws each pair once', async () => {
  const sqlite = db.client.sqlite
  const ids = (sqlite.prepare("select id from agents where retired = 0 and id like 'ag%' order by id limit 30").all() as { id: string }[]).map((one) => one.id)
  const [s, x, y, z, w, common] = [ids[0]!, ids[1]!, ids[2]!, ids[3]!, ids[4]!, ids[5]!]
  const add = sqlite.prepare("insert into records (id, workspace_id, owner_id, created_at, updated_at, kind, title, data, origin) values (?, 'message-centre', ?, ?, ?, 'message', ?, ?, 'fixture')")
  const delivery = sqlite.prepare("insert into message_delivery (id, message_id, recipient_kind, recipient_id, mark, at) values (?, ?, 'agent', ?, 'seen', ?)")
  const say = (from: string, to: readonly string[], at: string, project = 'default'): string => {
    const id = randomUUID()
    add.run(id, THE_PERSON, at, at, 'Made-up message', JSON.stringify({
      body: 'Made-up message', sentBy: { kind: 'agent', id: from }, to: to.map((one) => ({ kind: 'agent', id: one })),
      writtenIn: { project },
    }))
    for (const one of to) delivery.run(randomUUID(), id, one, at)
    return id
  }
  let shared = ''
  sqlite.transaction(() => {
    // X WRITES LAST OF ALL, so the page reads X before S and Y, and X's read finds S|X.
    say(x, [z], '2026-11-15 10:00:00')
    // ONE MESSAGE FROM S TO BOTH X AND Y: the newest line of S|X and of S|Y.
    shared = say(s, [x, y], '2026-11-14 10:00:00')
    // TWENTY-TWO PAIRS OLDER THAN THE SHARED MESSAGE, so the first page ends between it and S's older line to Y.
    for (let k = 0; k < 22; k++) say(common, [ids[6 + k]!], `2026-11-13 10:${String(59 - k).padStart(2, '0')}:00`)
    // X WRITES TO W BEFORE THAT, so the page after the cursor also reads X before S and Y.
    say(x, [w], '2026-11-12 12:00:00')
    // S's OLDER LINE TO Y ALONE, in a second project: the other message of S|Y.
    say(s, [y], '2026-11-12 10:00:00', 'second')
  })()
  const whole = (await read('shape=page')).conversations
  expect(whole).toHaveLength(26)
  const sy = [s, y].sort().join('|')
  const wholeSY = whole.filter((one) => keyOf(one) === sy)
  expect(wholeSY).toHaveLength(1)
  expect(wholeSY[0]!.last.id).toBe(shared)
  expect(wholeSY[0]!.newSince).toBe(2)
  expect([...wholeSY[0]!.projects].sort()).toEqual(['default', 'second'])
  const joined: ShortBetweenAgentsRow[] = []
  let cursor: string | null = null
  let pages = 0
  do {
    const query = new URLSearchParams({ shape: 'page', limit: String(PAGE_SIZE) })
    if (cursor !== null) query.set('cursor', cursor)
    const page = await read(query.toString())
    joined.push(...page.conversations)
    expect(page.page).toBeDefined()
    cursor = page.page!.next
    pages += 1
  } while (cursor !== null)
  expect(pages, 'the list takes two pages').toBe(2)
  const byPair = new Map(whole.map((one) => [keyOf(one), one]))
  for (const one of joined) {
    const label = one.between.map((side) => side.id === s ? 'S' : side.id === x ? 'X' : side.id === y ? 'Y' : side.id).join('|')
    expect(joined.filter((other) => keyOf(other) === keyOf(one)), `the pair ${label} across the pages`).toHaveLength(1)
    expect({ last: one.last.id, newSince: one.newSince, anythingNew: one.anythingNew, projects: one.projects }, `the pair ${label}`).toEqual({
      last: byPair.get(keyOf(one))?.last.id, newSince: byPair.get(keyOf(one))?.newSince,
      anythingNew: byPair.get(keyOf(one))?.anythingNew, projects: byPair.get(keyOf(one))?.projects,
    })
  }
  expect(joined).toEqual(whole)
}, 120_000)
