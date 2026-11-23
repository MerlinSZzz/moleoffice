// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE FIRST PAGE OF THE LIST BETWEEN AGENTS DOES NOT READ THE WHOLE HISTORY OF AN AGENT THAT ONLY A NOTICE TO THE
 * PERSON NAMES. The page names the agents of the newest messages, and of each message a notice among them names, and
 * reads every message of each. A notice about a message between an agent and the person is in that conversation, which
 * is no pair between agents. Yet the page read the whole history of that agent, and the run records its messages name.
 *
 * Mole Office writes the newest lines: 10 notices to the person, each about a message a busy agent sent the person,
 * and before them one line to each of 130 agents. The busy agent, not Mole Office's, then writes to 300 more agents
 * before all of those, each message from a run of its own. The count is of message rows read by id, as in
 * a-between-agent-page-reads-a-pairs-message-rows-once.test.ts, and apart from it of the run records read for the tool
 * and model of each run. On the old code the page read the 300 messages and the 300 runs: about 300 more of each. The
 * page must still be the first 25 rows of the whole list.
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
    agents: 431, retired: 0, theConversation: 0, otherContacts: 0, otherPersonMessages: 0,
    betweenAgents: 0, groups: 0, groupsWithThePerson: 0, membersPerGroup: 0,
    groupMessages: 0, officeLines: 0, sessions: 1, otherRecords: 0,
  })
}, 120_000)

afterAll(async () => { await app?.close(); db?.close() })

interface ThePage { conversations: unknown[]; page: { next: string | null } }

/** The first page as the chat asks for it, the message rows it read by id, and the run records it read. */
async function theFirstPage(): Promise<{ messageRows: number; runRows: number; page: ThePage }> {
  const sqlite = db.client.sqlite
  const prototype = Object.getPrototypeOf(sqlite.prepare('SELECT 1')) as Record<string, unknown>
  const original = prototype['all'] as (this: { source: string }, ...args: unknown[]) => unknown
  let messageRows = 0
  let runRows = 0
  prototype['all'] = function (this: { source: string }, ...args: unknown[]): unknown {
    const answer = original.apply(this, args)
    const rows = Array.isArray(answer) ? answer.length : 0
    // THE READ OF THE RUNS THE MESSAGES NAME asks for session records by id, so it is told apart by its kind.
    if (this.source.includes(`+"records"."kind" = 'session'`)) runRows += rows
    // A MESSAGE ROW READ BY ITS ID, whether the id is the read's only condition or the first of several.
    else if (/ from "records" where \(?"records"\."id" in /.test(this.source)) messageRows += rows
    return answer
  }
  try {
    const response = await app.inject({ method: 'GET', url: '/api/messages/between-agents?shape=page&limit=25', headers: PERSON })
    expect(response.statusCode).toBe(200)
    return { messageRows, runRows, page: response.json() as ThePage }
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

it('reads no more message rows or runs when a notice to the person names a busy agent that has written to many more agents', async () => {
  const sqlite = db.client.sqlite
  const office = (sqlite.prepare("select id from agents where handle = 'mole-office' and retired = 0").get() as { id: string } | undefined)?.id ?? ''
  expect(office).not.toBe('')
  const agents = (sqlite.prepare("select id from agents where handle = 'the-measured-agent' or handle like 'made-up-agent-%' order by id").all() as { id: string }[]).map((one) => one.id)
  expect(agents).toHaveLength(431)
  const [busy, ...others] = agents as [string, ...string[]]
  const add = sqlite.prepare("insert into records (id, workspace_id, owner_id, created_at, updated_at, kind, title, data, origin) values (?, ?, ?, ?, ?, ?, ?, ?, 'fixture')")
  const delivery = sqlite.prepare("insert into message_delivery (id, message_id, recipient_kind, recipient_id, mark, at) values (?, ?, ?, ?, 'seen', ?)")
  const at = (hour: number, seconds: number): string =>
    `2026-11-16 ${String(hour).padStart(2, '0')}:${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
  const message = (from: string, to: { kind: 'agent' | 'person'; id: string }, stamp: string, more: Record<string, unknown> = {}): string => {
    const id = randomUUID()
    add.run(id, 'message-centre', THE_PERSON, stamp, stamp, 'message', 'Made-up message', JSON.stringify({
      body: 'Made-up message', sentBy: { kind: 'agent', id: from }, to: [to], writtenIn: { project: 'default' }, ...more,
    }))
    delivery.run(randomUUID(), id, to.kind, to.id, stamp)
    return id
  }
  sqlite.transaction(() => {
    // TEN MESSAGES THE BUSY AGENT SENT THE PERSON, older than everything below.
    const toThePerson = Array.from({ length: 10 }, (_, i) => message(busy, { kind: 'person', id: THE_PERSON }, at(8, i)))
    // ONE LINE FROM MOLE OFFICE TO EACH OF 130 AGENTS, so the page's first scan of 128 names the same agents in both
    // worlds, and the page holds more than 25 rows.
    for (const [i, one] of others.slice(0, 130).entries()) message(office, { kind: 'agent', id: one }, at(10, i))
    // THE NEWEST LINES: A NOTICE TO THE PERSON ABOUT EACH MESSAGE THE BUSY AGENT SENT THEM.
    for (const [i, about] of toThePerson.entries()) message(office, { kind: 'person', id: THE_PERSON }, at(11, i), { aboutMessage: about })
  })()
  const few = await theFirstPage()
  expect(few.page.conversations).toEqual((await theWholeList()).slice(0, 25))
  expect(few.page.page.next).not.toBeNull()
  // 300 MORE AGENTS, each written to once by the busy agent from a run of its own, before all of the above.
  sqlite.transaction(() => {
    for (const [i, one] of others.slice(130).entries()) {
      const run = randomUUID()
      add.run(run, 'default', THE_PERSON, at(7, i), at(7, i), 'session', 'Made-up run', JSON.stringify({
        runtime: 'claude-code', state: 'finished', doing: 'made up for a measurement',
      }))
      message(busy, { kind: 'agent', id: one }, at(9, i), { fromRun: run })
    }
  })()
  const many = await theFirstPage()
  expect(many.page.conversations).toEqual((await theWholeList()).slice(0, 25))
  expect(many.page.page.next).not.toBeNull()
  expect(many.messageRows - few.messageRows, 'message rows read by id after the busy agent wrote to 300 more agents').toBeLessThan(30)
  expect(many.runRows - few.runRows, 'run records read after the busy agent wrote to 300 more agents from 300 runs').toBeLessThan(30)
}, 120_000)
