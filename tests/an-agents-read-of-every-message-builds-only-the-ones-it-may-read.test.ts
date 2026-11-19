// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN AGENT'S READ OF EVERY MESSAGE BUILDS ONLY THE MESSAGES IT MAY READ, AND ITS ANSWER IS THE SAME ANSWER.
 *
 * Round 143 of wave 13y, item 85 of the line's list. The agents of one project asked `GET /api/messages`, and
 * `GET /api/messages?sender=…&limit=2`, many times an hour. In the live office on 7 November 2026, the reads that took
 * over 300 ms took about 2 s on average and answered about 90 messages. The door built every message of the office
 * whole, with its words and its delivery rows: 96,933 of them. Only then did it keep the ones the agent is a party to.
 * The door now starts from the messages the agent could be a party to, keeps the ones it may read by the same rule,
 * and builds those alone.
 *
 * The plain read now answers each message's id, title and window only, so the reads whose deliveries the case uses
 * ask ?full=1.
 *
 * Two cases:
 *
 * 1. THE WORDS READ. An agent's read of every message, and its read narrowed by a sender, take out of the database
 *    the stored data of the messages the agent may read, and of no other message. The count is of messages whose
 *    stored data came back from any statement while the door answered, found by the stored text itself, so no way of
 *    reading it can be missed. Red before round 143, when every message's data came back.
 * 2. THE SAME ANSWER. Each read an agent asks is the answer the person gets, with only the messages the agent may
 *    read kept, in the same order and with the same numbers. Which messages the agent may read is asked of the rule
 *    the way the door asked it before round 143: `onlyTheMessagesThisReaderMayRead` over the whole pool. Two agents
 *    are asked: the one whose conversation the office is built around, and one with a few messages. The newest
 *    message each was handed is deleted, so a deleted message the agent was a party to must stay out.
 *
 * MUTATIONS, each red here:
 *   1. Read the whole pool and keep what the agent may read, as before round 143: case 1 is red.
 *   2. Build every message the agent could be a party to, and leave out the step that keeps only the ones it may read:
 *      cases 1 and 2 are red.
 *   3. Put the kept messages in the order the rule hands them back, not in the pool's order: case 2 is red.
 *   4. Keep the deleted messages: cases 1 and 2 are red.
 *
 * The office is a small one of the live office's shape, made by tests/the-chat-office-of-the-live-shape.ts.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { buildTheChatOffice, type Shape } from './the-chat-office-of-the-live-shape.ts'

const SMALL: Shape = {
  agents: 40,
  retired: 10,
  theConversation: 150,
  otherContacts: 15,
  otherPersonMessages: 80,
  betweenAgents: 300,
  groups: 4,
  groupsWithThePerson: 2,
  membersPerGroup: 4,
  groupMessages: 80,
  officeLines: 40,
  sessions: 120,
  otherRecords: 60,
}

const asAgent = (id: string) => ({ 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': id })

let t: TestDb
/** The person's headers, and the narrowing by the person as a sender, set once the server has said who the person is. */
let PERSON: Record<string, string> = {}
let BY_THE_PERSON = ''
let app: FastifyInstance
/** The agent whose conversation with the person the office is built around, and an agent with a few messages. */
let theAgent = ''
let aFewMessages = ''
/** Which messages each agent may read, in the pool's order, as the door worked it out before round 143. */
const mayRead = new Map<string, string[]>()
/** Every message's stored data, as the text the database holds, and the message it belongs to. */
const theMessageOf = new Map<string, string>()
/** Set while one request is answered; the messages whose stored data came back from a statement meanwhile. */
let counting = false
const wordsRead = new Set<string>()

/** Notes every message whose stored data is among the values a statement handed back. */
function look(out: unknown): void {
  const one = (value: unknown): void => {
    if (typeof value !== 'string') return
    const id = theMessageOf.get(value)
    if (id !== undefined) wordsRead.add(id)
  }
  const row = (value: unknown): void => {
    if (Array.isArray(value)) for (const cell of value) one(cell)
    else if (value !== null && typeof value === 'object') for (const cell of Object.values(value)) one(cell)
    else one(value)
  }
  if (Array.isArray(out)) for (const each of out) row(each)
  else row(out)
}

beforeAll(async () => {
  t = await freshDb()
  const sqlite = t.client.sqlite as unknown as { prepare: (sql: string) => Record<string, unknown> }
  const prepare = sqlite.prepare
  // THE WATCH GOES IN BEFORE THE SERVER IS LOADED, so no statement it prepares is prepared without it.
  sqlite.prepare = function (this: unknown, text: string) {
    const statement = prepare.call(this, text)
    for (const method of ['all', 'get'] as const) {
      const run = statement[method] as ((...args: unknown[]) => unknown) | undefined
      if (typeof run !== 'function') continue
      statement[method] = function (this: unknown, ...args: unknown[]) {
        const out = run.apply(this, args)
        if (counting) look(out)
        return out
      }
    }
    const iterate = statement['iterate'] as ((...args: unknown[]) => Iterable<unknown>) | undefined
    if (typeof iterate === 'function') {
      statement['iterate'] = function* (this: unknown, ...args: unknown[]) {
        for (const each of iterate.apply(this, args)) {
          if (counting) look(each)
          yield each
        }
      }
    }
    return statement
  }
  app = (await apiApp()).app
  await app.ready()
  // THE PERSON IS READ AFTER THE SERVER IS MADE, which tells person.ts who owns the office.
  const { THE_PERSON } = await import('../src/shared/person.ts')
  expect(THE_PERSON, 'the person the server knows').toBe(THE_TEST_OFFICES_OWNER.id)
  PERSON = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
  BY_THE_PERSON = `sender=${encodeURIComponent(`person:${THE_PERSON}`)}`
  theAgent = buildTheChatOffice(t.client.sqlite, THE_PERSON, SMALL).theAgent
  const db = t.client.sqlite
  // THE AGENT WITH A FEW MESSAGES: one handed the fewest, of those handed at least four.
  aFewMessages = (
    db
      .prepare(
        `select recipient_id as id from message_delivery where recipient_kind = 'agent' and recipient_id not in (?, 'mole-office') group by recipient_id having count(*) >= 4 order by count(*), recipient_id limit 1`,
      )
      .get(theAgent) as { id: string }
  ).id
  // THE NEWEST MESSAGE EACH AGENT WAS HANDED IS DELETED.
  const newestHanded = db.prepare(
    `select r.id from records r join message_delivery d on d.message_id = r.id where r.kind = 'message' and d.recipient_kind = 'agent' and d.recipient_id = ? order by r.created_at desc, r.rowid limit 1`,
  )
  const remove = db.prepare(`update records set deleted_at = updated_at where id = ?`)
  for (const agent of [theAgent, aFewMessages]) remove.run((newestHanded.get(agent) as { id: string }).id)
  // SOME MADE-UP MESSAGES STORE THE SAME DATA, and the count finds a message by its stored data, so each repeat gets its id
  // after its words.
  const seen = new Set<string>()
  const reword = db.prepare(`update records set data = json_set(data, '$.body', json_extract(data, '$.body') || ?) where id = ?`)
  for (const row of db.prepare(`select id, data from records where kind = 'message' order by rowid`).all() as { id: string; data: string }[]) {
    if (seen.has(row.data)) reword.run(` (${row.id})`, row.id)
    seen.add(row.data)
  }
  for (const row of db.prepare(`select id, data from records where kind = 'message'`).all() as { id: string; data: string }[]) {
    theMessageOf.set(row.data, row.id)
  }
  expect(theMessageOf.size, 'two messages store the same data, so the words read cannot be told apart').toBe(
    (db.prepare(`select count(*) as n from records where kind = 'message'`).get() as { n: number }).n,
  )
  // WHAT EACH AGENT MAY READ, by the rule, over the whole pool. The library is loaded after the server, as the door loads it.
  const { MESSAGE_CENTRE } = await import('../src/shared/workspaces.ts')
  const { messagePool, onlyTheMessagesThisReaderMayRead, theMessageReader } = await import('../src/server/lib/messages.ts')
  const pool = messagePool(MESSAGE_CENTRE)
  for (const agent of [theAgent, aFewMessages]) {
    mayRead.set(agent, onlyTheMessagesThisReaderMayRead(theMessageReader({ type: 'agent', id: agent }), pool).map((one) => one.id))
  }
}, 120_000)

afterAll(async () => {
  await app.close()
  t.close()
})

interface Answer {
  messages: { id: string; deliveries: { to: { kind: string; id: string }; mark: string }[] }[]
  total?: number
  matched?: number
  returned?: number
  left?: number
  truncated?: boolean
  next?: string | null
  unreadForYou?: number
  workspaceId: string
}

async function ask(url: string, headers: Record<string, string>): Promise<Answer> {
  const reply = await app.inject({ method: 'GET', url, headers })
  expect(reply.statusCode, `${url}: ${reply.body.slice(0, 400)}`).toBe(200)
  return reply.json() as Answer
}

/** The messages of the person's answer that `agent` may read, in the order the person's answer gives them. */
function theAgentsPartOf(answer: Answer, agent: string): Answer['messages'] {
  const kept = new Set(mayRead.get(agent))
  return answer.messages.filter((one) => kept.has(one.id))
}

describe("an agent's read of every message builds only the ones it may read", () => {
  it('takes out of the database the stored data of the messages the agent may read, and of no other message', async () => {
    for (const agent of [theAgent, aFewMessages]) {
      for (const url of ['/api/messages', `/api/messages?${BY_THE_PERSON}&limit=2`]) {
        wordsRead.clear()
        counting = true
        try {
          await ask(url, asAgent(agent))
        } finally {
          counting = false
        }
        expect([...wordsRead].sort(), `the messages whose stored data ${url} read for ${agent}`).toEqual([...mayRead.get(agent)!].sort())
      }
    }
  })

  it("answers each agent's read as the person's answer with only the messages the agent may read", async () => {
    // THE PLAIN ANSWER IS id, title AND wordsMayChangeUntil ONLY; the whole entry, with its delivery rows, is ?full=1.
    // The reads whose deliveries this case uses ask it on both sides of each comparison; the loop over the four plain
    // reads stays plain, because it compares the answer each reader gets.
    const everything = (await ask('/api/messages?full=1', PERSON)).messages
    expect(mayRead.get(aFewMessages)!.length, 'the agent with a few messages').toBeGreaterThanOrEqual(3)
    for (const agent of [theAgent, aFewMessages]) {
      const theirs = mayRead.get(agent)!
      expect(theirs.length, `${agent} reads every message, so the step that leaves some out is not asked`).toBeLessThan(everything.length)
      expect((await ask('/api/messages', asAgent(agent))).messages.map((one) => one.id), `the order of what ${agent} reads`).toEqual(theirs)
      for (const url of ['/api/messages', '/api/messages?narrow=1', '/api/messages?leads=1', '/api/messages?only=queued-for-agents']) {
        const asked = await ask(url, asAgent(agent))
        expect(asked.messages, `${url} for ${agent}`).toEqual(theAgentsPartOf(await ask(url, PERSON), agent))
      }
      // ADDRESSED TO THE READER OR TO NOBODY depends on the reader, so it is worked out from the person's whole answer.
      const toMeOrNobody = theAgentsPartOf({ messages: everything, workspaceId: '' }, agent).filter(
        (one) => one.deliveries.length === 0 || one.deliveries.some((d) => d.to.kind === 'agent' && d.to.id === agent),
      )
      expect((await ask('/api/messages?only=addressed-to-me-or-nobody&full=1', asAgent(agent))).messages, `addressed to ${agent} or to nobody`).toEqual(toMeOrNobody)
      // NARROWED BY A SENDER, WITH A PAGE OF TWO: the page and its numbers, out of the messages the agent may read.
      const bySender = theAgentsPartOf(await ask(`/api/messages?${BY_THE_PERSON}&full=1`, PERSON), agent)
      if (agent === theAgent) expect(bySender.length, 'the person wrote to the measured agent').toBeGreaterThan(2)
      const page = await ask(`/api/messages?${BY_THE_PERSON}&limit=2&full=1`, asAgent(agent))
      const left = Math.max(0, bySender.length - 2)
      expect(page.messages, `the page narrowed by the person for ${agent}`).toEqual(bySender.slice(0, 2))
      expect(
        { total: page.total, matched: page.matched, returned: page.returned, left: page.left, truncated: page.truncated, unreadForYou: page.unreadForYou },
        `the numbers of the page narrowed by the person for ${agent}`,
      ).toEqual({
        total: theirs.length,
        matched: bySender.length,
        returned: Math.min(2, bySender.length),
        left,
        truncated: left > 0,
        unreadForYou: bySender.filter((one) => one.deliveries.some((d) => d.to.kind === 'agent' && d.to.id === agent && d.mark !== 'seen')).length,
      })
    }
  })
})
