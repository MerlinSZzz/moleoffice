// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A CARRIED MESSAGE READS THE SAME ON EVERY READ OF THE OLD CONVERSATION.
 *
 * Problem hqbovBMnTu-z. The press to start a new agent carries a waiting message to the new agent.
 * The message stays in the old conversation, and its delivery row to the old agent says the press
 * carried it. The problem said a fresh read of the old conversation, after a reload, did not draw
 * that row, while the open page did.
 *
 * WHAT THIS FILE PROVES, against a real server and a real database:
 *
 * 1. The page's lists are read, a connection is opened as the person, and the press is made. Every
 *    event the press sends is applied with the page's own function (`applyAnEvent`), as an open page
 *    does.
 * 2. The old conversation the page then holds, a fresh read of one page (what a reload asks for), a
 *    read of the whole conversation, and `conversationBetween` given every message of every project
 *    all hold the same messages. In each, the waiting message carries the same delivery row: marked
 *    delivered, with the sentence that the press carried it to the new agent.
 * 3. The new agent's conversation holds the copy the press made, and not the waiting message itself.
 * 5. The press stores what it did as facts on the waiting message (`carriedTo`), every read carries
 *    them, and no writer may put them on a message of its own.
 * 4. GET /api/agents/:id/start-a-new-agent says whether the press would carry anything: yes while
 *    the message waits, no once the press carried it. The chat draws the press beside "Cannot reach"
 *    only when it would.
 *
 * WHAT WAS FOUND. All four reads agree, on the code this file was written against. The browser case
 * in tests/start-a-new-agent-is-one-press-in-two-places.test.ts failed after a reload for another
 * reason: the new agent bears the old agent's name, so the contact list holds two rows with the same
 * words, and that test opens the first row whose words hold the name. After a reload the new agent's
 * row is first, so it opened the new agent's conversation.
 *
 * THREE-RUN PROOF, in the commit message with the commands and log paths: CONTROL green. MUTATION:
 * in `theIdsOfOnePair` in src/server/lib/messages.ts, the messages `a` sent to `b` are left out of
 * the union, so a page of the old conversation loses the person's message; red. RESTORE green,
 * checked with cmp against a saved copy.
 */

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { apiApp, freshDb, type TestDb, theAnswerToAWriteInATestOffice } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { theMessageWentToANewAgent } from '../src/shared/messages.ts'
import type { ChannelEvent, EventOnTheWire } from '../src/shared/events.ts'
import type { HeldLists } from '../src/web/lib/chatdeltas.ts'
import type { ChatList, TheOpenOne } from '../src/web/lib/chatlists.ts'
import type { ConversationReply } from '../src/web/api.ts'

const OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/** The page the chat asks for, as src/web/lib/conversationpages.ts asks for it on a first read. */
const A_PAGE = 50

let t: TestDb
let app: FastifyInstance
let old = ''
let waiting = ''

async function get<T>(url: string): Promise<T> {
  const res = await app.inject({ method: 'GET', url, headers: OWNER })
  expect(res.statusCode, `${url}: ${res.body}`).toBe(200)
  return res.json() as T
}

async function post(url: string, body: unknown): Promise<Record<string, unknown>> {
  const res = await app.inject({ method: 'POST', url, headers: OWNER, payload: JSON.stringify(body) })
  expect(res.statusCode, `${url}: ${res.body}`).toBe(
    url.startsWith('/api/records') ? theAnswerToAWriteInATestOffice(OWNER, body) : 200,
  )
  return res.json() as Record<string, unknown>
}

/** One page of the conversation with one agent, which is what a page asks for when it opens. */
function aPageOf(agent: string): Promise<ConversationReply> {
  return get<ConversationReply>(`/api/messages/conversation?kind=agent&id=${agent}&limit=${String(A_PAGE)}`)
}

/** Every list the chat holds, read as the page reads it, with the old agent's conversation open. */
async function readEverything(): Promise<HeldLists> {
  return {
    circle: await get('/api/messages/circle'),
    who: await get('/api/participants'),
    presence: (await get<{ presence: HeldLists['presence'] }>('/api/presence')).presence,
    contacts: await get('/api/messages/contacts'),
    between: await get('/api/messages/between-agents?shape=page'),
    groups: await get('/api/groups?shape=page'),
    theGroup: null,
    unregistered: null,
    talkPresence: (await get<{ presence: HeldLists['talkPresence'] }>(`/api/presence/agent/${old}`)).presence,
    // LAST, because reading a conversation as the person marks what was queued for them delivered.
    talk: await aPageOf(old),
  }
}

/** Whether the press to start a new agent would carry anything for this agent, as its door answers. */
async function wouldCarry(agent: string): Promise<unknown> {
  return (await get<{ wouldCarry?: unknown }>(`/api/agents/${agent}/start-a-new-agent`)).wouldCarry
}

/** What a read says of each message: its id, its words and its delivery rows. */
function whatEachSays(messages: readonly { id: string; body: string; deliveries: readonly unknown[] }[]): unknown[] {
  return messages.map((one) => ({ id: one.id, body: one.body, deliveries: one.deliveries }))
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  await post('/api/records', {
    kind: 'agent',
    title: 'Codex on another machine',
    data: { handle: 'carried-old', runtime: 'claude-code', state: 'active' },
  })
  const registry = await get<{ agents: { id: string; handle: string }[] }>('/api/participants')
  old = registry.agents.find((one) => one.handle === 'carried-old')?.id ?? ''
  expect(old, 'the old agent was registered').not.toBe('')
  const said = await post('/api/records', {
    kind: 'message',
    title: 'Can you read the logs?',
    data: { body: 'Can you read the logs?', to: [{ kind: 'agent', id: old }] },
  })
  waiting = (said['record'] as { id: string }).id
}, 120_000)

afterAll(async () => {
  await app.close()
  t.close()
})

describe('a carried message after the press to start a new agent', () => {
  it('is the same row in the open page, in a fresh page, in the whole read and in the whole pool', async () => {
    const events = await import('../src/server/lib/events.ts')
    const M = await import('../src/server/lib/messages.ts')
    const W = await import('../src/shared/which-projects.ts')
    const { applyAnEvent } = await import('../src/web/lib/chatdeltas.ts')

    // THE CONTROL: before the press, the old conversation holds the waiting message.
    let held = await readEverything()
    expect(held.talk?.messages.map((one) => one.id)).toContain(waiting)
    expect(await wouldCarry(old), 'before the press, a press would carry the waiting message').toBe(true)
    const me = held.contacts?.me ?? null
    expect(me, 'the contacts read says who is reading').not.toBeNull()
    const open: TheOpenOne = { what: 'contact', them: { kind: 'agent', id: old } }

    // THE OPEN PAGE HEARS THE PRESS, and applies each event with the page's own function.
    const heard: EventOnTheWire[] = []
    const listener = events.pageOpened({ workspaceId: 'default', who: { kind: 'person', id: THE_PERSON }, send: (one) => heard.push(one) })
    const pressed = await post(`/api/agents/${old}/start-a-new-agent`, {})
    const handle = String(pressed['handle'])
    const copies = pressed['moved'] as string[]
    expect(handle).toBe('carried-old-2')
    expect(copies.length).toBe(1)
    const lists: Record<ChatList, () => Promise<Partial<HeldLists>>> = {
      participants: async () => ({ who: await get('/api/participants') }),
      presence: async () => ({ presence: (await get<{ presence: HeldLists['presence'] }>('/api/presence')).presence }),
      contacts: async () => ({ contacts: await get('/api/messages/contacts') }),
      betweenAgents: async () => ({ between: await get('/api/messages/between-agents?shape=page') }),
      groups: async () => ({ groups: await get('/api/groups?shape=page') }),
      theOpenConversation: async () => ({ talk: await aPageOf(old) }),
    } as Record<ChatList, () => Promise<Partial<HeldLists>>>
    for (const one of heard) {
      const event = JSON.parse(JSON.stringify(one.event)) as ChannelEvent
      const applied = applyAnEvent(held, event, me, open, { project: 'default', talkProject: 'default', panelOpen: true })
      held = applied.held
      for (const list of applied.reads) {
        const read = lists[list]
        if (read !== undefined) held = { ...held, ...(await read()) }
      }
    }
    events.pageClosed(listener)

    // THE FOUR READS OF THE OLD CONVERSATION.
    const live = held.talk?.messages ?? []
    const freshPage = (await aPageOf(old)).messages
    const whole = (await get<ConversationReply>(`/api/messages/conversation?kind=agent&id=${old}`)).messages
    const pool = M.conversationBetween(
      { kind: 'person', id: THE_PERSON },
      { kind: 'agent', id: old },
      W.EVERY_PROJECT,
      M.everybodyRegistered(),
      M.everyMessageOfTheProjects(W.EVERY_PROJECT),
    ).messages

    // THE WAITING MESSAGE IS IN EACH, WITH THE SENTENCE THE PRESS WROTE ON ITS ROW.
    const carried = theMessageWentToANewAgent('carried-old', handle)
    for (const [name, read] of [['the open page', live], ['a fresh page', freshPage], ['the whole read', whole], ['the whole pool', pool]] as const) {
      const row = read.find((one) => one.id === waiting)
      expect(row, `${name} holds the waiting message`).toBeDefined()
      const toOld = row?.deliveries.find((d) => d.to.kind === 'agent' && d.to.id === old)
      expect(toOld?.mark, `${name}: the mark on the row to the old agent`).toBe('delivered')
      expect(toOld?.because, `${name}: the sentence on the row to the old agent`).toBe(carried)
      expect(read.map((one) => one.id), `${name} holds no copy the press made`).not.toContain(copies[0])
    }
    // AND ALL FOUR ARE THE SAME MESSAGES, SAYING THE SAME THING.
    expect(whatEachSays(live), 'the open page against a fresh page').toEqual(whatEachSays(freshPage))
    expect(whatEachSays(freshPage), 'a fresh page against the whole read').toEqual(whatEachSays(whole))
    expect(whatEachSays(whole), 'the whole read against the whole pool').toEqual(whatEachSays(pool))

    // THE NEW AGENT'S CONVERSATION HOLDS THE COPY, AND NOT THE WAITING MESSAGE.
    const registry = await get<{ agents: { id: string; handle: string }[] }>('/api/participants')
    const made = registry.agents.find((one) => one.handle === handle)?.id ?? ''
    const theNewOne = (await aPageOf(made)).messages.map((one) => one.id)
    expect(theNewOne).toContain(copies[0])
    expect(theNewOne).not.toContain(waiting)

    // AND NOTHING IS LEFT FOR ANOTHER PRESS IN THE OLD CONVERSATION.
    expect(await wouldCarry(old), 'after the press, a press would carry nothing').toBe(false)

    // THE PRESS STORED WHAT IT DID AS FACTS ON THE MESSAGE, and every read carries them, so a page can
    // say it in its own language (problem hqbovBMnTu-z, round 35). The sentence on the old agent's
    // row is built from those facts by the one builder.
    const fact = { from: old, fromHandle: 'carried-old', to: made, toHandle: handle, copy: copies[0] }
    for (const [name, read] of [['the open page', live], ['a fresh page', freshPage], ['the whole read', whole], ['the whole pool', pool]] as const) {
      const row = read.find((one) => one.id === waiting) as { carriedTo?: unknown } | undefined
      expect(row?.carriedTo, `${name}: the facts of the carry`).toEqual([expect.objectContaining(fact)])
    }
  }, 60_000)

  it('keeps a writer from putting the facts of a carry on its own message', async () => {
    const said = await post('/api/records', {
      kind: 'message',
      title: 'A claim',
      data: { body: 'A claim', to: [{ kind: 'agent', id: old }], carriedTo: [{ from: old, fromHandle: 'x', to: old, toHandle: 'y', copy: null, at: '2026-10-04 00:00:00' }] },
    })
    const id = (said['record'] as { id: string }).id
    const stored = await get<{ record: { data: Record<string, unknown> } }>(`/api/records/${id}`)
    expect(stored.record.data['carriedTo'], 'a writer put the facts of a carry on its own message').toBeUndefined()
  })
})
