// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * NO READ OF THE QUEUE HOLDS THE OFFICE. Problem P-P3huQftq9w.
 *
 * On 4 October 2026 one agent's GET /api/worker/queue took 212 seconds on the live office, and for
 * those seconds the server answered nothing else. On an office of the live shape here, with 4,677
 * queued agent deliveries (the live office had 4,560), one read took 52 seconds, for the message
 * worker as much as for any agent. The profile put 10.2 of every 12.2 seconds in counting each
 * queued message's conversation by walking every message of the pool again.
 *
 * Three changes, each proved here:
 *
 * 1. `theConversationsOfOnePool` sorts the pool into its conversations in one walk. The first case
 *    proves it answers what `conversationBetween` answers for the same pool, pair by pair and group
 *    by group. MUTATION: leave out the parties of the message a notice is about, or the person a
 *    group line names, and the first case is red.
 * 2. The queue reads each recipient's facts once per pass, and stops at least every 50 milliseconds
 *    so the server can answer other requests. The second case reads the queue at the live size,
 *    measures the longest time the server could answer nothing, and limits the whole read to 10
 *    seconds. MUTATION: count each conversation by walking the pool again, or call `theQueue` in
 *    the door instead of `theQueueWithoutHoldingTheServer`, and the second case is red.
 * 3. GET /api/checks read the agent registry once per run, 6.9 seconds for 6,000 runs. The last
 *    case measures it the same way. MUTATION: call `whereARunStands(record)` without the registry
 *    read once, and the last case is red.
 *
 * HOW THE LONGEST HOLD IS MEASURED. A timer is asked to run every 5 milliseconds while the request
 * is answered. Any gap between two of its runs is a time in which the server could run nothing, a
 * timer or another request. The longest gap is the number compared with one second.
 */
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { buildTheChatOffice, LIVE_SHAPE } from './the-chat-office-of-the-live-shape.ts'
import type { ParticipantRef } from '../src/shared/participants.ts'

// THE LIVE QUEUE'S SIZE. The live shape's 6,000 messages between agents give about 2,000 queued
// deliveries; 13,000 give 4,677, which is the live office's 4,560 of 4 October and a little more.
const SHAPE = { ...LIVE_SHAPE, betweenAgents: 13_000 }
const ONE_SECOND = 1_000
const A_QUEUE_READ_TAKES_AT_MOST_MS = 10_000

let t: TestDb
let app: FastifyInstance
let theAgent = ''
let handle = ''
// THE SERVER'S OWN READERS, loaded after the test database is open: loading them opens a database.
let messages: typeof import('../src/server/lib/messages.ts')
let queueReader: typeof import('../src/server/lib/worker.ts')
const as = (type: 'agent' | 'human', id: string): Record<string, string> => ({
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': type,
  'x-mole-office-actor-id': id,
})
const THE_MESSAGE_WORKER = as('agent', 'mole-office/the-message-worker')

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  messages = await import('../src/server/lib/messages.ts')
  queueReader = await import('../src/server/lib/worker.ts')
  theAgent = buildTheChatOffice(t.client.sqlite, THE_PERSON, SHAPE).theAgent
  handle = (t.client.sqlite.prepare('SELECT handle FROM agents WHERE id = ?').get(theAgent) as { handle: string }).handle
}, 120_000)
afterAll(async () => {
  await app.close()
  t.close()
})

/** The reply to one GET, with the longest time the server could answer nothing while it was read. */
async function measured(url: string, headers: Record<string, string>): Promise<{ status: number; body: Record<string, unknown>; longestHoldMs: number; tookMs: number }> {
  const started = performance.now()
  let last = performance.now()
  let longest = 0
  const tick = setInterval(() => {
    const now = performance.now()
    longest = Math.max(longest, now - last)
    last = now
  }, 5)
  const reply = await app.inject({ method: 'GET', url, headers })
  clearInterval(tick)
  longest = Math.max(longest, performance.now() - last)
  return { status: reply.statusCode, body: reply.json() as Record<string, unknown>, longestHoldMs: Math.round(longest), tookMs: Math.round(performance.now() - started) }
}

const key = (one: ParticipantRef): string => `${one.kind}:${one.id}`

it('sorting the pool once answers what asking it once per conversation answers', () => {
  const { conversationBetween, EVERY_PROJECT, everyMessageOfTheProjects, messagesInAGroup, theConversationsOfOnePool } = messages
  const pool = everyMessageOfTheProjects(EVERY_PROJECT)
  const sorted = theConversationsOfOnePool(pool)
  // THE PAIRS THAT CARRY THE TWO HARD RULES, and then a sample of every other pair the pool holds. The
  // person and the measured agent share the group lines that name the person (criterion GM2); the
  // person and the measured agent also share the office's notices about their messages (criterion
  // M128). Every pair would ask `conversationBetween` some 10,000 times, which is the cost this fixes.
  const person: ParticipantRef = { kind: 'person', id: THE_PERSON }
  const agent: ParticipantRef = { kind: 'agent', id: theAgent }
  const office: ParticipantRef = { kind: 'agent', id: 'mole-office' }
  const pairs = new Map<string, [ParticipantRef, ParticipantRef]>([
    ['the person and the measured agent', [person, agent]],
    ['the measured agent and the person', [agent, person]],
    ['the person and the office', [person, office]],
  ])
  for (const one of pool) {
    if (pairs.size >= 300) break
    if (one.toGroup !== null || one.sentBy === null) continue
    for (const to of one.to) pairs.set(`${key(one.sentBy)} ${key(to)}`, [one.sentBy, to])
  }
  let compared = 0
  for (const [name, [a, b]] of pairs) {
    const asked = conversationBetween(a, b, EVERY_PROJECT, [], pool).messages.map((one) => one.id)
    expect(sorted.between(a, b).map((one) => one.id), name).toEqual(asked)
    compared += asked.length
  }
  // THE RULES WERE EXERCISED: the two pairs above hold group lines and notices, not only plain messages.
  const between = sorted.between(person, agent)
  expect(between.some((one) => one.toGroup !== null), 'a group line naming the person').toBe(true)
  expect(between.some((one) => one.aboutMessage != null), 'a notice about one of their messages').toBe(true)
  expect(compared).toBeGreaterThan(3_000)
  for (const group of new Set(pool.flatMap((one) => (one.toGroup === null ? [] : [one.toGroup])))) {
    expect(sorted.inGroup(group).map((one) => one.id), group).toEqual(messagesInAGroup(group, EVERY_PROJECT).map((one) => one.id))
  }
}, 120_000)

it('reading the queue at the live size never holds the server for a second, for the message worker or an agent', async () => {
  const queuedHere = (t.client.sqlite.prepare(`SELECT count(*) n FROM message_delivery WHERE mark = 'queued' AND recipient_kind = 'agent'`).get() as { n: number }).n
  expect(queuedHere).toBeGreaterThan(4_560)
  // THE MESSAGE WORKER'S OWN READING IS WHOLE: every queued row, in the order `theQueue` reads them.
  const worker = await measured('/api/worker/queue', THE_MESSAGE_WORKER)
  expect(worker.status).toBe(200)
  const rows = worker.body['queue'] as { messageId: string; to: ParticipantRef }[]
  expect(rows.map((one) => `${one.messageId} ${key(one.to)}`)).toEqual(queueReader.theQueue('default').map((one) => `${one.messageId} ${key(one.to)}`))
  expect(rows.length).toBe(queuedHere)
  expect(worker.longestHoldMs, 'the message worker held the server').toBeLessThan(ONE_SECOND)
  // AND THE WHOLE READ IS SHORT. Stopping every 50 milliseconds would keep a 52-second read from
  // holding the server, and the worker would still wait 52 seconds for its list. 1.5 seconds measured.
  expect(worker.tookMs, 'the message worker waited for its list').toBeLessThan(A_QUEUE_READ_TAKES_AT_MOST_MS)
  const agent = await measured('/api/worker/queue?full=1', as('agent', handle))
  expect(agent.status).toBe(200)
  expect(agent.longestHoldMs, 'an agent held the server').toBeLessThan(ONE_SECOND)
}, 120_000)

it('reading the list of checks for 6,000 runs never holds the server for a second', async () => {
  const checks = await measured('/api/checks', as('agent', handle))
  expect(checks.status).toBe(200)
  expect((checks.body['list'] as unknown[]).length).toBe(SHAPE.sessions)
  expect(checks.longestHoldMs).toBeLessThan(ONE_SECOND)
}, 120_000)
