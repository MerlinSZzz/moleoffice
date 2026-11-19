// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PAIR IS LISTED ONCE ACROSS PAGES WHEN ONE OF ITS MESSAGES ALSO WENT TO A THIRD AGENT.
 *
 * A and B write plainly to each other, and one older message goes from A to B and C. A's read finds the whole
 * A|B pair. B's read no longer builds the pair from the plain rows, but it still reads the message to B and C,
 * so it built a second A|B row from that one line. The row is older than the whole one. On the first page the
 * whole row wins the pair's place; on the page after the cursor the whole row is left out and the partial one
 * is listed, so the pair is drawn twice with an older last line and the wrong count.
 *
 * The page must join to the whole short list, with A|B once and its newest plain line last.
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

it('lists the pair once, with its newest line, across the page boundary', async () => {
  const sqlite = db.client.sqlite
  const ids = (sqlite.prepare("select id from agents where retired = 0 and id like 'ag%' order by id limit 30").all() as { id: string }[]).map((one) => one.id)
  const [a, b, c, common] = [ids[0]!, ids[1]!, ids[2]!, ids[3]!]
  const add = sqlite.prepare("insert into records (id, workspace_id, owner_id, created_at, updated_at, kind, title, data, origin) values (?, 'message-centre', ?, ?, ?, 'message', ?, ?, 'fixture')")
  const delivery = sqlite.prepare("insert into message_delivery (id, message_id, recipient_kind, recipient_id, mark, at) values (?, ?, 'agent', ?, 'seen', ?)")
  const say = (from: string, to: readonly string[], at: string, extra: Record<string, unknown> = {}): string => {
    const id = randomUUID()
    add.run(id, THE_PERSON, at, at, 'Made-up message', JSON.stringify({
      body: 'Made-up message', sentBy: { kind: 'agent', id: from }, to: to.map((one) => ({ kind: 'agent', id: one })),
      writtenIn: { project: 'default' }, ...extra,
    }))
    for (const one of to) delivery.run(randomUUID(), id, one, at)
    return id
  }
  let newest = ''
  sqlite.transaction(() => {
    // FIVE PLAIN LINES BETWEEN A AND B, the last at 10:04 and the pair's newest.
    for (let i = 0; i < 5; i++) {
      const at = `2026-11-14 10:0${String(i)}:00`
      newest = i % 2 === 0 ? say(a, [b], at) : say(b, [a], at)
    }
    // ONE OLDER LINE FROM A TO BOTH B AND C, which files A|B and A|C.
    say(a, [b, c], '2026-11-13 10:00:00')
    // TWENTY-FOUR PAIRS NEWER THAN A|B, so the whole A|B row is the last row of the first page.
    for (let k = 0; k < 24; k++) say(common, [ids[4 + k]!], '2026-11-15 10:00:00')
    // ONE PAIR OLDER THAN EVERYTHING, so the page after the cursor has a row besides the partial one.
    say(common, [ids[28]!], '2026-11-12 10:00:00')
  })()
  const whole = (await read('shape=page')).conversations
  expect(whole).toHaveLength(27)
  const ab = [a, b].sort().join('|')
  expect(whole.filter((one) => keyOf(one) === ab)).toHaveLength(1)
  expect(whole.filter((one) => keyOf(one) === ab)[0]!.last.id).toBe(newest)
  const joined: ShortBetweenAgentsRow[] = []
  let cursor: string | null = null
  do {
    const query = new URLSearchParams({ shape: 'page', limit: String(PAGE_SIZE) })
    if (cursor !== null) query.set('cursor', cursor)
    const page = await read(query.toString())
    joined.push(...page.conversations)
    expect(page.page).toBeDefined()
    cursor = page.page!.next
  } while (cursor !== null)
  const joinedAB = joined.filter((one) => keyOf(one) === ab)
  expect(joinedAB, 'the A|B pair across the pages').toHaveLength(1)
  expect(joinedAB[0]!.last.id).toBe(newest)
  expect(joined).toEqual(whole)
}, 120_000)
