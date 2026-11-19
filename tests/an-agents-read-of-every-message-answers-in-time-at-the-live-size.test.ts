// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN AGENT'S READ OF EVERY MESSAGE ANSWERS WITHIN 300 MS AT THE LIVE OFFICE'S SIZE, IN THE TIMING GROUP. Wave 13y
 * round 143, item 85 of the line's list.
 *
 * The agents of one project asked `GET /api/messages`, and `GET /api/messages?sender=…&limit=2`, many times an hour.
 * In the live office on 7 November 2026, the reads that took over 300 ms took about 2 s on average, and the office's
 * message centre held 96,933 messages, 7,409 of them with a `routed` list. The door built every message whole before it kept the few the agent is a party
 * to. tests/an-agents-read-of-every-message-builds-only-the-ones-it-may-read.test.ts says what the door builds now.
 * This file holds the two reads' times.
 *
 * THE OFFICE IS MADE UP by tests/the-chat-office-of-the-live-shape.ts, at the live office's agents of 4 November 2026
 * and its message centre of 7 November 2026: 1,827 agents, 721 of them retired, and 96,933 messages. The build puts a
 * `routed` list only on some of the person's messages, so more messages between two agents are given one here, naming
 * the agent each was for, until 7,409 hold one. Every routed message is one any agent could be a party to, so each is
 * looked at in every agent's read. Every name and word is made up.
 *
 * THE AGENT ASKED is the one handed the median number of messages, of the agents handed any. It may read 98. Before
 * round 143, the two reads took about 1.3 to 1.6 s each in this office. In a larger made-up office of about 5 GB, with
 * its message centre made to the same size, they took about 1.8 s each.
 *
 * WHAT IT COSTS TO RUN. The hook builds the office and asks the reads: about 25 s on this machine at a load of about
 * 10, and a database of about 570 MB in the test's own folder, removed when the file ends.
 *
 * Each read is asked once to warm it, then five times, one after the other, as an agent asks them. Each read's median
 * is held under 300 ms. Every time is written to the timing results file when the group names one.
 *
 * IT RUNS ONLY IN THE TIMING GROUP (`node tools/run-named-tests.mjs --list timing`), on a quiet machine, as
 * tests/the-timing-tests.ts says.
 */
import { appendFileSync } from 'node:fs'

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { buildTheChatOffice, LIVE_SHAPE, type Shape } from './the-chat-office-of-the-live-shape.ts'
import { TIMING_RESULTS_VARIABLE } from './the-timing-tests.ts'

/** The message centre of 7 November 2026. */
const MESSAGES = 96_933
const ROUTED = 7_409
const AT_THE_LIVE_SIZE: Shape = {
  ...LIVE_SHAPE,
  agents: 1_827,
  retired: 721,
  betweenAgents: MESSAGES - LIVE_SHAPE.theConversation - LIVE_SHAPE.otherPersonMessages - LIVE_SHAPE.groupMessages - LIVE_SHAPE.officeLines,
}
const WITHIN_MS = 300
const OUT = process.env[TIMING_RESULTS_VARIABLE] ?? ''

let t: TestDb
let app: FastifyInstance
/** The two reads, by name, and each one's five times. */
const READS = new Map<string, string>()
const times = new Map<string, number[]>()
/** What the office holds once it is built, and how many messages the agent's read answered. */
let centre = { messages: 0, routed: 0 }
let answered = 0

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  // THE PERSON IS READ AFTER THE SERVER IS MADE, which tells person.ts who owns the office.
  const { THE_PERSON } = await import('../src/shared/person.ts')
  expect(THE_PERSON, 'the person the server knows').toBe(THE_TEST_OFFICES_OWNER.id)
  const db = t.client.sqlite
  buildTheChatOffice(db, THE_PERSON, AT_THE_LIVE_SIZE)
  const routedNow = (): number =>
    (db.prepare(`select count(*) as n from records where kind = 'message' and json_type(data, '$.routed') = 'array'`).get() as { n: number }).n
  // MORE ROUTED MESSAGES, each between two agents and routed for the one it was sent to, in the build's own words.
  const toRoute = db
    .prepare(`select id, json_extract(data, '$.to[0].id') as agent from records where kind = 'message' and title = 'between two agents' order by rowid limit ?`)
    .all(ROUTED - routedNow()) as { id: string; agent: string }[]
  const route = db.prepare(`update records set data = json_set(data, '$.routed', json(?)) where id = ?`)
  db.transaction(() => {
    for (const { id, agent } of toRoute) {
      route.run(
        JSON.stringify([
          {
            for: { kind: 'agent', id: agent },
            because: 'Nothing is answering as this agent right now.',
            to: null,
            passedOver: [],
            line: 'This agent could not be reached when this was sent.',
            said: { addressee: agent, was: 'nothing answering', passedOver: [], ending: { how: 'the owner is the sender', ending: { how: 'no secretary', owner: 'made up' } } },
          },
        ]),
        id,
      )
    }
  })()
  centre = { messages: (db.prepare(`select count(*) as n from records where kind = 'message' and deleted_at is null`).get() as { n: number }).n, routed: routedNow() }
  // THE AGENT HANDED THE MEDIAN NUMBER OF MESSAGES, of the agents handed any.
  const handed = db
    .prepare(`select recipient_id as id from message_delivery where recipient_kind = 'agent' and recipient_id <> 'mole-office' group by recipient_id order by count(*), recipient_id`)
    .all() as { id: string }[]
  const agent = handed[Math.floor(handed.length / 2)]!.id
  const headers = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': agent }
  READS.set('every message', '/api/messages')
  READS.set('a page of two by the person', `/api/messages?sender=${encodeURIComponent(`person:${THE_PERSON}`)}&limit=2`)
  for (const [name, url] of READS) {
    times.set(name, [])
    for (let take = 0; take <= 5; take++) {
      const started = performance.now()
      const reply = await app.inject({ method: 'GET', url, headers })
      const ms = performance.now() - started
      expect(reply.statusCode, `${url}: ${reply.body.slice(0, 300)}`).toBe(200)
      if (take > 0) times.get(name)!.push(ms)
      if (name === 'every message') answered = (JSON.parse(reply.body) as { messages: unknown[] }).messages.length
    }
  }
}, 900_000)

afterAll(async () => {
  await app?.close()
  t?.close()
})

describe("an agent's read of every message at the live office size", () => {
  it('reads a message centre of the live size, and the agent reads a few of its messages', () => {
    expect(centre).toEqual({ messages: MESSAGES, routed: ROUTED })
    expect(answered, 'the messages the agent may read').toBeGreaterThan(0)
    expect(answered, 'the messages the agent may read').toBeLessThan(MESSAGES / 100)
  })

  for (const name of ['every message', 'a page of two by the person']) {
    it(`answers the read of ${name} within ${String(WITHIN_MS)} ms`, () => {
      const five = times.get(name)!
      const median = [...five].sort((a, b) => a - b)[2]!
      const said = `[an agent's messages timing] ${name}: median ${String(Math.round(median))} ms of ${five.map((ms) => String(Math.round(ms))).join(', ')}; ${String(answered)} messages answered of ${String(centre.messages)}`
      console.log(said)
      if (OUT !== '') appendFileSync(`${OUT}.an-agents-messages.log`, `${said}\n`)
      expect(median, `the median time of the read of ${name}`).toBeLessThan(WITHIN_MS)
    })
  }
})
