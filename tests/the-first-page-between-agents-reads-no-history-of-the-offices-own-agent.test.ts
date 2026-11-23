// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE FIRST PAGE OF THE LIST BETWEEN AGENTS DOES NOT READ THE WHOLE HISTORY OF MOLE OFFICE'S OWN AGENT. The page names
 * the agents of the newest messages and reads every message of each. Mole Office writes to nearly every agent, so when
 * its lines were the newest the page read every line it ever wrote, though each agent it wrote to on the page is read
 * as well and holds its own pair with Mole Office.
 *
 * The count is of message rows read by id, as in a-between-agent-page-reads-a-pairs-message-rows-once.test.ts. Mole
 * Office writes the newest 130 messages, one to each of 130 agents, and then one to each of 300 more agents before
 * those. On the old code the page read all 300 rows again: about 300 more. The page must still be the first 25 rows of
 * the whole list.
 */
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { buildTheChatOffice } from './the-chat-office-of-the-live-shape.ts'

const PERSON = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
let db: TestDb
let app: FastifyInstance

beforeAll(async () => {
  db = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  buildTheChatOffice(db.client.sqlite, THE_PERSON, {
    agents: 430, retired: 0, theConversation: 0, otherContacts: 0, otherPersonMessages: 0,
    betweenAgents: 0, groups: 0, groupsWithThePerson: 0, membersPerGroup: 0,
    groupMessages: 0, officeLines: 0, sessions: 1, otherRecords: 0,
  })
}, 120_000)

afterAll(async () => { await app?.close(); db?.close() })

interface ThePage { conversations: unknown[]; page: { next: string | null } }

/** The first page as the chat asks for it, and the message rows it read by id. */
async function theFirstPage(): Promise<{ messageRows: number; page: ThePage }> {
  const sqlite = db.client.sqlite
  const prototype = Object.getPrototypeOf(sqlite.prepare('SELECT 1')) as Record<string, unknown>
  const original = prototype['all'] as (this: { source: string }, ...args: unknown[]) => unknown
  let messageRows = 0
  prototype['all'] = function (this: { source: string }, ...args: unknown[]): unknown {
    const answer = original.apply(this, args)
    // A MESSAGE ROW READ BY ITS ID, whether the id is the read's only condition or the first of several.
    if (/ from "records" where \(?"records"\."id" in /.test(this.source)) {
      messageRows += Array.isArray(answer) ? answer.length : 0
    }
    return answer
  }
  try {
    const response = await app.inject({ method: 'GET', url: '/api/messages/between-agents?shape=page&limit=25', headers: PERSON })
    expect(response.statusCode).toBe(200)
    return { messageRows, page: response.json() as ThePage }
  } finally {
    prototype['all'] = original
  }
}

/** The whole list, cut as the page cuts each row. */
async function theWholeList(): Promise<unknown[]> {
  const response = await app.inject({ method: 'GET', url: '/api/messages/between-agents?shape=page', headers: PERSON })
  expect(response.statusCode).toBe(200)
  return (response.json() as { conversations: unknown[] }).conversations
}

it("reads no more message rows when Mole Office's lines are the newest and it has written to many more agents", async () => {
  const sqlite = db.client.sqlite
  const office = (sqlite.prepare("select id from agents where handle = 'mole-office' and retired = 0").get() as { id: string } | undefined)?.id
  expect(office).toBeDefined()
  const agents = (sqlite.prepare("select id from agents where handle = 'the-measured-agent' or handle like 'made-up-agent-%' order by id").all() as { id: string }[]).map((one) => one.id)
  expect(agents).toHaveLength(430)
  const add = sqlite.prepare("insert into records (id, workspace_id, owner_id, created_at, updated_at, kind, title, data, origin) values (?, 'message-centre', ?, ?, ?, 'message', ?, ?, 'fixture')")
  const delivery = sqlite.prepare("insert into message_delivery (id, message_id, recipient_kind, recipient_id, mark, at) values (?, ?, 'agent', ?, 'seen', ?)")
  const at = (hour: number, seconds: number): string =>
    `2026-11-16 ${String(hour).padStart(2, '0')}:${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
  const write = (to: readonly string[], hour: number): void => {
    sqlite.transaction(() => {
      for (const [i, one] of to.entries()) {
        const id = randomUUID()
        add.run(id, THE_PERSON, at(hour, i), at(hour, i), 'Made-up line', JSON.stringify({ body: 'Made-up line', sentBy: { kind: 'agent', id: office }, to: [{ kind: 'agent', id: one }], writtenIn: { project: 'default' } }))
        delivery.run(randomUUID(), id, one, at(hour, i))
      }
    })()
  }
  // THE NEWEST 130 MESSAGES GO FROM MOLE OFFICE TO 130 AGENTS, one each, so the page's first scan of 128 names the same
  // agents in both worlds.
  write(agents.slice(0, 130), 10)
  const few = await theFirstPage()
  expect(few.page.conversations).toEqual((await theWholeList()).slice(0, 25))
  expect(few.page.page.next).not.toBeNull()
  // 300 MORE AGENTS, each written to once, before all of the above.
  write(agents.slice(130), 9)
  const many = await theFirstPage()
  expect(many.page.conversations).toEqual((await theWholeList()).slice(0, 25))
  expect(many.page.page.next).not.toBeNull()
  expect(many.messageRows - few.messageRows, 'message rows read by id after Mole Office wrote to 300 more agents').toBeLessThan(30)
}, 120_000)
