// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * BUILDING THE MESSAGE POOL LOOKS EACH SENDER UP ONCE, NOT ONCE PER MESSAGE; THE BETWEEN-AGENTS DOOR
 * READS THE READER'S READS ONCE, NOT ONCE PER PAIR; AND THE GROUP DOOR READS ONLY THAT GROUP'S MESSAGES,
 * ONCE.
 *
 * MEASURED FIRST, 25 September 2026, on a copy of the office with the person's own pattern of
 * requests (problem zo_hyUBLSAVJ). Building a message took 11.4 of the profile's 37 seconds, and
 * 10.6 of those went on looking up the agent that sent it — again for every message, though a few
 * hundred agents wrote the ten thousand messages. `GET /api/messages/between-agents` also read
 * `conversation_reads` once per pair, and `GET /api/groups/:id` built the whole pool three times.
 *
 * HOW IT IS PROVED. Statements are counted each time they RUN, not only when they are prepared,
 * because the stored-reference reader keeps its statements prepared and runs them again and again.
 * The count is taken on the prototype every statement shares, so a statement prepared before the
 * test is counted too.
 *
 *   1. The senders stored by their exact ids are read together, in one statement for the whole
 *      read (`agentsWithTheseIds` in lib/participants.ts), which runs the same number of times for
 *      three messages per agent as for eight. The stored-reference reader, which still answers any
 *      other stored string, runs no more for eight than for three. Before 25 September 2026 the
 *      by-id statement ran once more for every message; before wave 13x round 13 it ran once for
 *      every sender.
 *   2. `conversation_reads` is read once for the between-agents list, and still once after more
 *      pairs have talked. Before the change it was read once per pair.
 *   3. The group door reads delivery rows once, and only for that group's messages. Before
 *      25 September 2026 it built the whole pool three times; until round 48h of wave 13k it built
 *      the whole pool once, which read the delivery rows of every message in the office.
 *
 * MUTATIONS, one at a time, each turns its own assertion red: in `theRungAndTheChain`, call
 * `theAgentAStoredReferenceNames(sentBy.id)` instead of `theSenderThisReadLookedUp`; make
 * `theSendersStoredByTheirIds` return an empty map; in
 * `conversationsBetweenAgents`, read each pair with `whenTheyLastRead` again; in the group door,
 * drop `pool` from any one of the three calls, or build `pool` from every message of the office
 * with `everyMessageOfTheProjects(EVERY_PROJECT)` as it was before round 48h.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

let t: TestDb
let app: FastifyInstance
const PERSON = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const asAgent = (id: string) => ({ 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': id })

/** The registry id each handle was given. */
const ids = new Map<string, string>()

async function register(handle: string): Promise<void> {
  const made = await app.inject({ method: 'POST', url: '/api/agents/started', headers: PERSON, payload: { handle, name: handle, workArea: ['src'] } })
  expect(made.statusCode, made.body).toBe(201)
  ids.set(handle, (made.json() as { agent: { id: string } }).agent.id)
}

/**
 * NOTHING HOLDS ANY OF THE MADE-UP AGENTS IN THE TEST OFFICE, so the office stores each message between them, routes it
 * and answers 409. The message is stored all the same, and the doors below read it.
 */
async function say(from: string, to: string, body: string, expected: number): Promise<void> {
  const filed = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: asAgent(from),
    payload: { kind: 'message', title: body, data: { body, to: [{ kind: 'agent', id: ids.get(to) }] } },
  })
  expect(filed.statusCode, filed.body).toBe(expected)
}

/** Each of the three pairs of pool-a, pool-b and pool-c says `times` more things. */
async function theThreeTalk(times: number): Promise<void> {
  for (let i = 0; i < times; i++) {
    await say('pool-a', 'pool-b', `a to b ${String(i)}`, 409)
    await say('pool-b', 'pool-c', `b to c ${String(i)}`, 409)
    await say('pool-c', 'pool-a', `c to a ${String(i)}`, 409)
  }
}

/** How many times each statement ran while `act` ran, by its SQL. */
async function runsDuring(act: () => Promise<void>): Promise<Map<string, number>> {
  const sqlite = t.client.sqlite as unknown as { prepare: (sql: string) => object }
  const prototype = Object.getPrototypeOf(sqlite.prepare('SELECT 1')) as Record<string, (...args: unknown[]) => unknown>
  const runs = new Map<string, number>()
  const originals = new Map<string, (...args: unknown[]) => unknown>()
  for (const name of ['get', 'all', 'run', 'iterate']) {
    const original = prototype[name]!
    originals.set(name, original)
    prototype[name] = function (this: { source: string }, ...args: unknown[]) {
      runs.set(this.source, (runs.get(this.source) ?? 0) + 1)
      return original.apply(this, args)
    }
  }
  try {
    await act()
  } finally {
    for (const [name, original] of originals) prototype[name] = original
  }
  return runs
}

function runsOf(runs: Map<string, number>, matches: (sql: string) => boolean): number {
  let total = 0
  for (const [sql, n] of runs) if (matches(sql)) total += n
  return total
}

/**
 * The stored-reference reader's read of one agent by its stored id, in lib/agent-references.ts. It is the one statement
 * `theRegistryRowNamedBy` in lib/registry-aliases/index.ts runs for the identity columns, which reads the alias that may
 * own the id and the agents row together. A change to that statement's text must change this matcher.
 */
const storedById = (sql: string): boolean =>
  sql.trim().endsWith('FROM registry_aliases WHERE alias_id = @id) AS o LEFT JOIN agents ON agents.id = coalesce(o.canonicalId, @id)') &&
  /retired_at AS retiredAt/.test(sql)
/** The statement that reads the senders stored by their exact ids together, in lib/participants.ts `agentsWithTheseIds`. */
const sendersTogether = (sql: string): boolean => /^SELECT \* FROM agents WHERE id IN \(/.test(sql.trim())
const readsOfConversations = (sql: string): boolean => /from "conversation_reads"/i.test(sql)

async function betweenAgents(): Promise<{ between: { id: string }[]; newSince: number; anythingNew: boolean }[]> {
  const reply = await app.inject({ method: 'GET', url: '/api/messages/between-agents', headers: PERSON })
  expect(reply.statusCode, reply.body).toBe(200)
  return (reply.json() as { conversations: { between: { id: string }[]; newSince: number; anythingNew: boolean }[] }).conversations
}

async function conversationWithA(): Promise<number> {
  const reply = await app.inject({ method: 'GET', url: `/api/messages/conversation?kind=agent&id=${ids.get('pool-a')!}`, headers: PERSON })
  expect(reply.statusCode, reply.body).toBe(200)
  return (reply.json() as { messages: unknown[] }).messages.length
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  for (const handle of ['pool-a', 'pool-b', 'pool-c']) await register(handle)
})
afterAll(async () => {
  await app.close()
  t.close()
})

describe('the doors that build the message pool', () => {
  it('look each sender up once per request, however many messages it sent', async () => {
    await theThreeTalk(3)
    let few = 0
    const withFew = await runsDuring(async () => {
      few = (await betweenAgents()).length
    })
    const conversationWithFew = await runsDuring(async () => {
      await conversationWithA()
    })
    await theThreeTalk(5)
    let many = 0
    const withMany = await runsDuring(async () => {
      many = (await betweenAgents()).length
    })
    const conversationWithMany = await runsDuring(async () => {
      await conversationWithA()
    })
    expect(many, 'the same pairs are listed after more was said').toBe(few)
    // THE STATEMENTS DO RUN, so the equalities below are not two zeros.
    expect(runsOf(withFew, sendersTogether), 'the senders are read together at all').toBeGreaterThan(0)
    expect(runsOf(conversationWithFew, sendersTogether), 'the conversation reads its senders together at all').toBeGreaterThan(0)
    expect(runsOf(conversationWithFew, storedById), 'the conversation reads a stored reference by its id at all').toBeGreaterThan(0)
    for (const lookup of [sendersTogether, storedById]) {
      expect(runsOf(withMany, lookup), 'between agents: eight messages per agent cost what three did').toBe(runsOf(withFew, lookup))
      expect(runsOf(conversationWithMany, lookup), 'the conversation: eight messages per agent cost what three did').toBe(
        runsOf(conversationWithFew, lookup),
      )
    }
  })

  it('reads the reader’s reads of the pairs once, however many pairs there are', async () => {
    // THE PERSON HAS OPENED ONE PAIR, so a read exists and that pair has nothing new in it.
    const a = ids.get('pool-a')!
    const b = ids.get('pool-b')!
    const opened = await app.inject({ method: 'GET', url: `/api/messages/between/${[a, b].sort().join('~')}`, headers: PERSON })
    expect(opened.statusCode, opened.body).toBe(200)
    let fewerPairs: Awaited<ReturnType<typeof betweenAgents>> = []
    const withFewer = await runsDuring(async () => {
      fewerPairs = await betweenAgents()
    })
    const theOpenedPair = fewerPairs.find((one) => one.between.map((side) => side.id).sort().join('~') === [a, b].sort().join('~'))
    expect(theOpenedPair?.newSince, 'the pair the person opened has nothing new').toBe(0)
    expect(fewerPairs.some((one) => one.newSince > 0), 'a pair the person never opened counts what was said').toBe(true)

    await register('pool-d')
    await register('pool-e')
    await say('pool-d', 'pool-e', 'd to e', 409)
    await say('pool-e', 'pool-a', 'e to a', 409)
    let morePairs = 0
    const withMore = await runsDuring(async () => {
      morePairs = (await betweenAgents()).length
    })
    // MORE THAN TWO MORE, because registering an agent also writes it a card message from the office.
    expect(morePairs, 'more pairs are listed').toBeGreaterThanOrEqual(fewerPairs.length + 2)
    expect(runsOf(withFewer, readsOfConversations), 'the reads are read once for every pair').toBe(1)
    expect(runsOf(withMore, readsOfConversations), 'and still once with more pairs').toBe(1)
  })

  it('reads the delivery rows of the group’s own messages once to read one group', async () => {
    const opened = await app.inject({
      method: 'POST',
      url: '/api/groups',
      headers: PERSON,
      payload: {
        name: 'the pool group',
        because: 'to read it once',
        members: [
          { who: { kind: 'person', id: THE_PERSON }, because: 'the person reads it' },
          { who: { kind: 'agent', id: ids.get('pool-a') }, because: 'it works here' },
          { who: { kind: 'agent', id: ids.get('pool-b') }, because: 'it works here too' },
        ],
      },
    })
    expect(opened.statusCode, opened.body).toBe(201)
    const groupId = (opened.json() as { group: { id: string } }).group.id
    const filed = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: asAgent('pool-a'),
      payload: { kind: 'message', title: 'in the group', data: { body: 'in the group', toGroup: groupId } },
    })
    expect(filed.statusCode, filed.body).toBe(201)
    let body: { messages?: unknown[]; unread?: number; anythingUnread?: boolean } = {}
    const runs = await runsDuring(async () => {
      const reply = await app.inject({ method: 'GET', url: `/api/groups/${groupId}`, headers: PERSON })
      expect(reply.statusCode, reply.body).toBe(200)
      body = reply.json() as typeof body
    })
    expect(body.messages?.length, 'the message written to the group is in it').toBeGreaterThanOrEqual(1)
    expect(body.unread, 'and the person has not read it').toBeGreaterThanOrEqual(1)
    expect(body.anythingUnread).toBe(true)
    // THE OFFICE HOLDS MORE MESSAGES THAN THE GROUP, so a read of every message's delivery rows
    // names more ids than a read of the group's.
    const count = (where: string, ...args: unknown[]): number =>
      (t.client.sqlite.prepare(`SELECT count(*) AS n FROM records WHERE kind = 'message' AND deleted_at IS NULL${where}`).get(...args) as { n: number }).n
    const inTheGroup = count(` AND json_extract(data, '$.toGroup') = ?`, groupId)
    expect(inTheGroup, 'the group holds the message written to it').toBeGreaterThanOrEqual(1)
    expect(count(''), 'the office holds messages outside the group').toBeGreaterThan(inTheGroup)
    // ONE READ OF `message_delivery`, and each of its placeholders is one message id.
    const deliveryReads = [...runs].filter(([sql]) => /from "message_delivery"/i.test(sql))
    expect(runsOf(runs, (sql) => /from "message_delivery"/i.test(sql)), 'the delivery rows are read once for the group').toBe(1)
    expect((deliveryReads[0]![0].match(/\?/g) ?? []).length, 'for the group’s messages only, not every message in the office').toBe(inTheGroup)
  })
})
