// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A CONVERSATION IS READ ONE PAGE AT A TIME, AND A PAGE NEVER LEAVES A MESSAGE QUEUED.
 *
 * The person's report of 3 October 2026 (problem 8_cP0E-745e5): entering a conversation again loaded
 * the whole of it again. GET /api/messages/conversation now takes `limit`, `before`, `after`,
 * `since` and `from`, and the chat keeps what it read (src/web/lib/conversationpages.ts). What is
 * proved here:
 *
 *   1. THE DOOR. `limit` alone is the newest page; `before` the page just older than a message;
 *      `after` what came after one; with `since`, the held messages that changed and the ones
 *      deleted; with `from` as well, only the changed ones from that message on, in the order of
 *      the conversation (wave 13y round 146). Pages put together are the whole conversation, in its
 *      order.
 *   2. THE MARK. A read of the newest page marks delivered a message to the person that sits on an
 *      older page, so no message stays queued because nobody scrolled to it.
 *   3. THE CHAT'S RULES, without a browser: a first entry asks for one page, a second entry asks only
 *      for what came after the newest message held, naming the oldest one held as `from` while older
 *      ones remain, and the page before is asked with `before`.
 *
 * THREE-RUN PROOF, in the commit message: CONTROL green; a MUTATION of one line for each case red;
 * RESTORE green, checked with cmp.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb, theAnswerToAWriteInATestOffice } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { PAGE, afterANewerRead, afterAnOlderRead, whatToAskFor, whatToAskForOlder } from '../src/web/lib/conversationpages.ts'
import type { ConversationReply } from '../src/web/api.ts'

const PERSON = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const AGENT = 'one-page-agent'
const asTheAgent = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': AGENT }

let t: TestDb
let app: FastifyInstance
let agentId = ''
/** The ids of the conversation, oldest first, as a whole read gives them. */
let whole: string[] = []

async function say(from: 'person' | 'agent', body: string): Promise<string> {
  const headers = from === 'person' ? PERSON : asTheAgent
  const payload = {
    kind: 'message',
    title: body,
    data: { body, to: [from === 'person' ? { kind: 'agent', id: agentId } : { kind: 'person', id: THE_PERSON }] },
  }
  const reply = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers,
    payload,
  })
  expect(reply.statusCode, reply.body.slice(0, 300)).toBe(theAnswerToAWriteInATestOffice(headers, payload))
  return (reply.json() as { record: { id: string } }).record.id
}

async function read(query: string): Promise<ConversationReply> {
  const reply = await app.inject({ method: 'GET', url: `/api/messages/conversation?kind=agent&id=${agentId}${query}`, headers: PERSON })
  expect(reply.statusCode, reply.body.slice(0, 300)).toBe(200)
  return reply.json() as ConversationReply
}

const ids = (reply: ConversationReply): string[] => reply.messages.map((one) => one.id)

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  const made = await app.inject({ method: 'POST', url: '/api/agents/started', headers: PERSON, payload: { handle: AGENT, name: AGENT, workArea: ['src'] } })
  expect(made.statusCode, made.body).toBe(201)
  agentId = (made.json() as { agent: { id: string } }).agent.id
  for (let i = 0; i < 120; i += 1) await say(i % 2 === 0 ? 'person' : 'agent', `line ${String(i)}`)
  whole = ids(await read(''))
}, 120_000)
afterAll(async () => {
  await app.close()
  t.close()
})

describe('GET /api/messages/conversation, one page at a time', () => {
  it('gives the newest page, then each page before it, and the pages make the whole conversation', async () => {
    expect(whole.length).toBe(120)
    const newest = await read('&limit=50')
    expect(ids(newest)).toEqual(whole.slice(70))
    expect(newest.page?.olderRemain).toBe(true)
    const second = await read(`&limit=50&before=${whole[70]!}`)
    expect(ids(second)).toEqual(whole.slice(20, 70))
    expect(second.page?.continuesFromTheCursor).toBe(true)
    const third = await read(`&limit=50&before=${whole[20]!}`)
    expect(ids(third)).toEqual(whole.slice(0, 20))
    expect(third.page?.olderRemain).toBe(false)
  })

  it('gives only what came after a message, and the held ones that changed or were deleted since', async () => {
    const first = await read('&limit=50')
    const since = first.page!.readAt
    expect(ids(await read(`&limit=50&after=${whole.at(-1)!}&since=${encodeURIComponent(since)}`))).toEqual([])
    // A LINE THE PERSON SENT IS SEEN BY THE AGENT, ONE IS DELETED, AND TWO NEW ONES ARRIVE.
    const seenByTheAgent = whole[118]!
    const marked = await app.inject({ method: 'POST', url: `/api/messages/${seenByTheAgent}/mark`, headers: asTheAgent, payload: { mark: 'seen' } })
    expect(marked.statusCode, marked.body).toBe(200)
    const deleted = whole[100]!
    const gone = await app.inject({ method: 'DELETE', url: `/api/records/${deleted}`, headers: PERSON })
    expect(gone.statusCode, gone.body.slice(0, 300)).toBe(200)
    const a = await say('agent', 'a new line')
    const b = await say('person', 'another new line')
    const after = await read(`&limit=50&after=${whole.at(-1)!}&since=${encodeURIComponent(since)}`)
    expect(ids(after)).toEqual([a, b])
    expect(after.page?.continuesFromTheCursor).toBe(true)
    expect(after.page?.changed.map((one) => one.id)).toContain(seenByTheAgent)
    expect(after.page?.gone).toContain(deleted)
    whole = ids(await read(''))
  })

  it('with `from`, names as changed only that message and the ones after it, in the order of the conversation', async () => {
    // A STAMP FROM BEFORE ANY MESSAGE WAS WRITTEN, so every message the door may name as changed is named.
    const before = encodeURIComponent('2000-01-01 00:00:00')
    const newest = whole.at(-1)!
    const named = (reply: ConversationReply): string[] => (reply.page?.changed ?? []).map((one) => one.id).sort()
    const every = await read(`&limit=50&after=${newest}&since=${before}`)
    expect(named(every), 'without `from`, every message changed since').toEqual([...whole].sort())
    const from = whole[whole.length - 50]!
    const fromOn = await read(`&limit=50&after=${newest}&since=${before}&from=${from}`)
    expect(fromOn.page?.continuesFromTheCursor).toBe(true)
    expect(named(fromOn), 'with `from`, that message and the ones after it').toEqual(whole.slice(-50).sort())
    // A `from` THAT IS NOT A MESSAGE OF THIS CONVERSATION places nothing, so the reply is the newest page, as for a
    // cursor that is not one.
    const nowhere = await read(`&limit=50&after=${newest}&since=${before}&from=no-such-message`)
    expect(nowhere.page?.continuesFromTheCursor).toBe(false)
    expect(ids(nowhere)).toEqual(whole.slice(-50))
  })

  it('gives the newest page in place of a page that would not carry on', async () => {
    const answer = await read(`&limit=5&after=${whole[0]!}`)
    expect(answer.page?.continuesFromTheCursor).toBe(false)
    expect(ids(answer)).toEqual(whole.slice(-5))
  })

  it('marks delivered a message to the person that sits on an older page', async () => {
    const older = whole[3]!
    t.client.sqlite
      .prepare(`UPDATE message_delivery SET mark = 'queued' WHERE message_id = ? AND recipient_kind = 'person'`)
      .run(older)
    const answer = await read('&limit=50')
    expect(ids(answer)).not.toContain(older)
    expect(answer.markedDelivered).toContain(older)
    const row = t.client.sqlite.prepare(`SELECT mark FROM message_delivery WHERE message_id = ? AND recipient_kind = 'person'`).get(older) as { mark: string }
    expect(row.mark).toBe('delivered')
  })

  it('refuses before and after together, before anything is marked', async () => {
    const reply = await app.inject({ method: 'GET', url: `/api/messages/conversation?kind=agent&id=${agentId}&limit=5&before=${whole[9]!}&after=${whole[3]!}`, headers: PERSON })
    expect(reply.statusCode).toBe(400)
  })

  it('refuses `from` without `since`, which it narrows, before anything is marked', async () => {
    const reply = await app.inject({ method: 'GET', url: `/api/messages/conversation?kind=agent&id=${agentId}&limit=5&after=${whole[9]!}&from=${whole[3]!}`, headers: PERSON })
    expect(reply.statusCode, reply.body.slice(0, 300)).toBe(400)
  })
})

describe('what the chat asks for, and what it holds after', () => {
  const page = (messages: string[], over: Partial<NonNullable<ConversationReply['page']>> = {}): ConversationReply =>
    ({
      me: { kind: 'person', id: THE_PERSON },
      them: { kind: 'agent', id: 'x' },
      messages: messages.map((id) => ({ id, deliveries: [] })),
      markedDelivered: [],
      answering: null,
      couldNotTell: null,
      workspaceId: 'default',
      page: { olderRemain: true, continuesFromTheCursor: null, readAt: '2026-10-03 12:00:00', changed: [], gone: [], ...over },
    }) as unknown as ConversationReply

  it('asks a first entry for one page, and a second entry only for what came after the newest held', () => {
    expect(whatToAskFor(null)).toEqual({ limit: PAGE })
    const held = afterANewerRead(null, page(['a', 'b', 'c']))
    // WHILE OLDER MESSAGES REMAIN, THE OLDEST ONE HELD IS NAMED as `from`. With the whole conversation held, none is.
    expect(whatToAskFor(held)).toEqual({ limit: PAGE, after: 'c', since: '2026-10-03 12:00:00', from: 'a' })
    const whole = afterANewerRead(null, page(['a', 'b', 'c'], { olderRemain: false }))
    expect(whatToAskFor(whole)).toEqual({ limit: PAGE, after: 'c', since: '2026-10-03 12:00:00' })
    const next = afterANewerRead(held, page(['d'], { continuesFromTheCursor: true, readAt: '2026-10-03 12:01:00', gone: ['b'] }))
    expect(next.reply.messages.map((one) => one.id)).toEqual(['a', 'c', 'd'])
    expect(next.readAt).toBe('2026-10-03 12:01:00')
  })

  it('asks for the page before the oldest held, and puts it above', () => {
    const held = afterANewerRead(null, page(['c', 'd']))
    expect(whatToAskForOlder(held)).toEqual({ limit: PAGE, before: 'c' })
    const next = afterAnOlderRead(held, page(['a', 'b'], { continuesFromTheCursor: true, olderRemain: false }))
    expect(next.reply.messages.map((one) => one.id)).toEqual(['a', 'b', 'c', 'd'])
    expect(whatToAskForOlder(next)).toBeNull()
  })
})
