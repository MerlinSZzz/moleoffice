// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * APPLIED EVENTS EQUAL A FRESH READ: invariant 2 of report VQw5RwL8gbCb, measured.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE PROVES
 * ---------------------------------------------------------------------------------------
 *
 * Since 26 September 2026 an open page applies each event to the lists it
 * holds instead of reading them again (src/web/lib/chatdeltas.ts). That is only true if the lists a
 * page ends up with are the lists a fresh read would give. A wrong change here is silent: a count that
 * never falls, a row in the wrong place, and nothing on the screen says so.
 *
 * So this file does what a page does, against a real server: it reads the chat's lists once, opens a
 * connection as the person, makes a run of real writes (messages each way, between two agents, to a
 * group, delivery marks, a newly registered agent writing), and applies every event it is sent with the
 * page's own function. Where that function says a list must be read, the list is read, as the page
 * would. At the end every list is read fresh and compared with what was applied, field by field.
 *
 * AND IT PROVES THE EVENTS WERE APPLIED, NOT READ. A page that read every list after every event would
 * pass the comparison trivially, so the file also counts the reads and names the events that must have
 * been applied without one.
 *
 * WHAT MAKES IT RED: breaking one line of the page's changes, for example `unread: row.unread +
 * counts.unread` in `contactsWithANewMessage`, or leaving the delivery rows off `delivery.changed` in
 * src/server/lib/messages.ts (then the mark is read and the count of reads fails). The same for a mark reaching seen:
 * leaving `seenLeaves` off the event makes the page read the contacts and the groups, and putting a row's old count back
 * in `applyAnEvent` leaves the row and the circle unlike a fresh read.
 */

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { apiApp, freshDb, type TestDb, theAnswerToAWriteInATestOffice } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import type { ChannelEvent, EventOnTheWire } from '../src/shared/events.ts'
import { everyParticipantPage } from '../src/shared/every-participant-page.ts'
import type { HeldLists } from '../src/web/lib/chatdeltas.ts'
import type { ChatList, TheOpenOne } from '../src/web/lib/chatlists.ts'

const OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const asAgent = (handle: string): Record<string, string> => ({ ...OWNER, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle })

let t: TestDb
let app: FastifyInstance
let heard: EventOnTheWire[] = []
let applyAnEvent: typeof import('../src/web/lib/chatdeltas.ts').applyAnEvent
let namesWithOne: typeof import('../src/web/lib/chatdeltas.ts').namesWithOne
let presenceWithOne: typeof import('../src/web/lib/chatdeltas.ts').presenceWithOne
const ids: Record<string, string> = {}
let groupId = ''

async function get<T>(url: string): Promise<T> {
  const res = await app.inject({ method: 'GET', url, headers: OWNER })
  expect(res.statusCode, `${url}: ${res.body}`).toBe(200)
  return res.json() as T
}

async function readParticipantNames(): Promise<NonNullable<HeldLists['who']>> {
  type Page = NonNullable<HeldLists['who']> & { next?: string | null }
  const pages = await everyParticipantPage<Page>('/api/participants?shape=page', async (path) => ({
    ok: true, body: await get<Page>(path),
  }))
  return { people: pages.flatMap((page) => page.people), agents: pages.flatMap((page) => page.agents) }
}

/** One write. `expected` is the status it answers, when a caller names it. */
async function post(headers: Record<string, string>, url: string, body: unknown, expected?: number): Promise<Record<string, unknown>> {
  const res = await app.inject({ method: 'POST', url, headers, payload: JSON.stringify(body) })
  if (expected !== undefined) expect(res.statusCode, `${url}: ${res.body}`).toBe(expected)
  else if (url === '/api/records' && theAnswerToAWriteInATestOffice(headers, body) === 409) expect(res.statusCode, `${url}: ${res.body}`).toBe(409)
  else expect(res.statusCode, `${url}: ${res.body}`).toBeLessThan(300)
  return res.json() as Record<string, unknown>
}

async function say(from: Record<string, string>, to: { kind: string; id: string }, body: string, expected?: number): Promise<string> {
  const made = await post(from, '/api/records', { kind: 'message', title: body.slice(0, 30), data: { body, to: [to] } }, expected)
  return (made['record'] as { id: string }).id
}

/** Every list the chat holds, read as the page reads it. The open conversation is with `talkTo`. */
async function readEverything(talkTo: string): Promise<HeldLists> {
  const presence = (await get<{ presence: HeldLists['presence'] }>('/api/presence')).presence
  return {
    circle: await get('/api/messages/circle'),
    who: await readParticipantNames(),
    presence,
    contacts: await get('/api/messages/contacts?shape=page'),
    // THE SHORT SHAPES THE PAGE HOLDS: what `api.agentConversationsForThePage`
    // and `readGroupsOnce` ask for, by option 2 of a decision.
    between: await get('/api/messages/between-agents?shape=page'),
    groups: await get('/api/groups?shape=page'),
    theGroup: null,
    unregistered: null,
    talkPresence: (await get<{ presence: HeldLists['talkPresence'] }>(`/api/presence/agent/${talkTo}`)).presence,
    // LAST, because reading a conversation as the person marks what was queued for them delivered.
    talk: await get(`/api/messages/conversation?kind=agent&id=${talkTo}`),
  }
}

/**
 * One list read again, as the page reads it. A CLOSED panel reads only what its button draws: the
 * names, and the circle for `contacts` and `groups` (the closed branch of `readTheLists` in Chat.tsx).
 */
async function readOne(held: HeldLists, list: ChatList, talkTo: string, panelOpen = true): Promise<HeldLists> {
  if (!panelOpen) {
    if (list === 'participants') return { ...held, who: await readParticipantNames() }
    if (list === 'contacts' || list === 'groups') return { ...held, circle: await get('/api/messages/circle') }
    return held
  }
  if (list === 'participants') return { ...held, who: await readParticipantNames() }
  if (list === 'presence') return { ...held, presence: (await get<{ presence: HeldLists['presence'] }>('/api/presence')).presence }
  if (list === 'contacts') return { ...held, contacts: await get('/api/messages/contacts?shape=page') }
  if (list === 'betweenAgents') return { ...held, between: await get('/api/messages/between-agents?shape=page') }
  if (list === 'groups') return { ...held, groups: await get('/api/groups?shape=page') }
  if (list === 'theOpenConversation') return { ...held, talk: await get(`/api/messages/conversation?kind=agent&id=${talkTo}`) }
  return held
}

/** What the circle button draws: who is reading and the two halves of the number. */
function theButton(circle: HeldLists['circle']): unknown {
  return circle === null ? null : { me: circle.me, unread: circle.unread }
}

/** Wait until the clock is at the start of a second nothing else has been written in. */
async function aSecondOfItsOwn(): Promise<void> {
  await new Promise((r) => setTimeout(r, 1000 - (Date.now() % 1000) + 50))
}

/** What a presence reading draws, without the sentence that counts seconds. */
function drawn(list: HeldLists['presence']): Record<string, unknown> {
  return Object.fromEntries((list ?? []).map((one) => [`${one.who.kind}:${one.who.id}`, [one.colour, one.word, one.state, one.choice]]))
}

beforeAll(async () => {
  t = await freshDb()
  const built = await apiApp()
  app = built.app
  await app.ready()
  ;({ applyAnEvent, namesWithOne, presenceWithOne } = await import('../src/web/lib/chatdeltas.ts'))
  for (const handle of ['writer-a-apply', 'writer-b-apply', 'writer-c-apply']) {
    await post(OWNER, '/api/records', { kind: 'agent', title: handle, data: { handle, runtime: 'claude-code', state: 'active' } })
  }
  const registry = await get<{ agents: { id: string; handle: string }[] }>('/api/participants')
  for (const one of registry.agents) ids[one.handle] = one.id
  const group = await post(OWNER, '/api/groups', {
    name: 'The apply group',
    because: 'a group the events have to move',
    members: [
      { who: { kind: 'person', id: THE_PERSON }, because: 'the owner is in it' },
      { who: { kind: 'agent', id: 'writer-b-apply' }, because: 'it writes in it' },
    ],
  })
  groupId = (group['group'] as { id: string }).id
  // SOMETHING SAID ALREADY, so the rows the run moves are rows the page holds.
  await say(asAgent('writer-a-apply'), { kind: 'person', id: THE_PERSON }, 'Before the page opened.')
  await say(asAgent('writer-b-apply'), { kind: 'person', id: THE_PERSON }, 'Also before the page opened.')
  // NOTHING HOLDS THE AGENT WRITTEN TO IN THE TEST OFFICE, so the office stores the message, routes it and answers
  // 409. The message is stored all the same.
  await say(asAgent('writer-b-apply'), { kind: 'agent', id: ids['writer-c-apply'] as string }, 'Between two agents, before.', 409)
  await say(asAgent('writer-b-apply'), { kind: 'person', id: THE_PERSON }, 'The newest before the page opened.')
}, 120_000)

afterAll(async () => {
  await app.close()
  t.close()
})

describe('events applied to the lists a page holds', () => {
  it('give the lists a fresh read gives, field by field, and most of them without a read', async () => {
    const events = await import('../src/server/lib/events.ts')
    const writerA = ids['writer-a-apply'] as string
    const writerB = ids['writer-b-apply'] as string
    let held = await readEverything(writerA)
    const me = held.contacts?.me ?? null
    expect(me, 'the contacts read says who is reading').not.toBeNull()
    const open: TheOpenOne = { what: 'contact', them: { kind: 'agent', id: writerA } }
    heard = []
    const page = events.pageOpened({ workspaceId: 'default', who: { kind: 'person', id: THE_PERSON }, send: (one) => heard.push(one) })

    const reads: { event: string; lists: string[] }[] = []
    const appliedWithoutARead: string[] = []
    let taken = 0
    /** Apply every event heard since the last call, in order, reading what the page's function says to read. */
    const applyWhatWasHeard = async (panelOpen = true): Promise<void> => {
      for (; taken < heard.length; taken += 1) {
        const one = heard[taken] as EventOnTheWire
        // AS IT GOES OVER THE WIRE: the stream writes each event as JSON, so it is read back from JSON.
        const event = JSON.parse(JSON.stringify(one.event)) as ChannelEvent
        const applied = applyAnEvent(held, event, me, open, { project: 'default', talkProject: 'default', panelOpen })
        // AN OPEN PANEL'S CIRCLE IS ITS CONTACT LIST'S `me` AND `unread`, copied by an effect in Chat.tsx.
        if (panelOpen && applied.held.contacts !== null && applied.held.contacts !== held.contacts) {
          const lines = applied.held.contacts
          applied.held = { ...applied.held, circle: { me: lines.me, unread: lines.unread, workspaceId: lines.workspaceId } }
        }
        held = applied.held
        for (const who of applied.readParticipants) {
          const answer = await get<{ participant: Parameters<typeof namesWithOne>[1] }>(`/api/participants/${who.kind}/${who.id}`)
          if (held.who !== null) held = { ...held, who: namesWithOne(held.who, answer.participant) }
        }
        for (const who of applied.readPresenceOf) {
          const answer = await get<{ presence: Parameters<typeof presenceWithOne>[1] }>(`/api/presence/${who.kind}/${who.id}`)
          held = { ...held, presence: presenceWithOne(held.presence ?? [], answer.presence) }
        }
        for (const id of applied.markDelivered) await post(OWNER, `/api/messages/${id}/mark`, { mark: 'delivered' })
        if (applied.reads.size === 0) appliedWithoutARead.push(event.name === 'message.new' ? `message.new ${event.messageId}` : event.name)
        else reads.push({ event: event.name, lists: [...applied.reads] })
        for (const list of applied.reads) {
          held = await readOne(held, list, writerA, panelOpen)
          if (panelOpen && list === 'contacts' && held.contacts !== null) {
            held = { ...held, circle: { me: held.contacts.me, unread: held.contacts.unread, workspaceId: held.contacts.workspaceId } }
          }
        }
      }
    }
    /** Compare every list the page holds with a fresh read, field by field. */
    const sameAsAFreshRead = async (when: string): Promise<void> => {
      const fresh = await readEverything(writerA)
      expect(theButton(held.circle), `${when}: the circle`).toEqual(theButton(fresh.circle))
      expect(held.contacts, `${when}: the contacts`).toEqual(fresh.contacts)
      expect(held.between, `${when}: the conversations between agents`).toEqual(fresh.between)
      expect(held.groups, `${when}: the groups`).toEqual(fresh.groups)
      // `markedDelivered` SAYS WHAT ONE READ MARKED, which is about that read and not about the
      // conversation: a fresh read after the page marked everything marks nothing.
      const conversation = (talk: HeldLists['talk']) => (talk === null ? null : { ...talk, markedDelivered: [] })
      expect(conversation(held.talk), `${when}: the open conversation`).toEqual(conversation(fresh.talk))
      expect(held.who, `${when}: the names`).toEqual(fresh.who)
      expect(drawn(held.presence), `${when}: what the presence list draws`).toEqual(drawn(fresh.presence))
    }

    // THE FIRST RUN: messages each way, between two agents, to a group, and a delivery mark. The page
    // is compared with a fresh read before anything makes it read a list, so every change here is one
    // the page applied.
    const fromWriterA = await say(asAgent('writer-a-apply'), { kind: 'person', id: THE_PERSON }, 'Writer A writes while the page is open.')
    await say(OWNER, { kind: 'agent', id: writerA }, 'The owner answers writer A.')
    // IN A SECOND OF ITS OWN: the conversations between agents are ordered by whole seconds, and a
    // message sharing its second with another is read rather than placed (`anotherInTheSameSecond`).
    await aSecondOfItsOwn()
    // NOTHING HOLDS THE AGENT WRITTEN TO IN THE TEST OFFICE, so the office stores the message, routes it and answers
    // 409. The message is stored all the same.
    await say(asAgent('writer-c-apply'), { kind: 'agent', id: writerB }, 'writer-c answers writer-b.', 409)
    await aSecondOfItsOwn()
    const fromB = await say(asAgent('writer-b-apply'), { kind: 'person', id: THE_PERSON }, 'writer-b writes to the owner, lower down the list.')
    await post(asAgent('writer-b-apply'), '/api/records', { kind: 'message', title: 'group', data: { body: 'A line in the group.', toGroup: groupId } })
    await post(asAgent('writer-a-apply'), `/api/messages/${fromWriterA}/mark`, { mark: 'delivered' }).catch(() => undefined)
    await applyWhatWasHeard()
    expect(reads, 'the first run made the page read a list').toEqual([])
    await sameAsAFreshRead('after the first run')

    // THE SECOND RUN: a new agent registers and writes, and the owner reads a message.
    await post(OWNER, '/api/records', { kind: 'agent', title: 'late-apply', data: { handle: 'late-apply', runtime: 'claude-code', state: 'active' } })
    await say(asAgent('late-apply'), { kind: 'person', id: THE_PERSON }, 'A new agent writes.')
    await post(OWNER, `/api/messages/${fromB}/mark`, { mark: 'seen' })
    await applyWhatWasHeard()
    await sameAsAFreshRead('after the second run')

    // THE SEEN RUN: the owner reads writer A's message and nothing else is written, so nothing is read that could
    // bring the row up to date, and only the counts the event carries can lower the row and the circle.
    const unreadBefore = held.circle?.unread.messages ?? 0
    const readsBeforeSeen = reads.length
    await post(OWNER, `/api/messages/${fromWriterA}/mark`, { mark: 'seen' })
    await applyWhatWasHeard()
    expect(reads.slice(readsBeforeSeen), 'a mark reaching seen made the page read a list').toEqual([])
    expect(held.circle?.unread.messages, 'the circle fell when the owner read a message').toBe(unreadBefore - 1)
    await sameAsAFreshRead('after the seen run')

    // THE THIRD RUN, WITH THE PANEL CLOSED: an event moves only the circle, and the lists the page
    // still holds from when it was open are left as they were (it reads them all when it opens).
    const beforeClosing = held
    const readsBefore = reads.length
    await say(asAgent('writer-a-apply'), { kind: 'person', id: THE_PERSON }, 'Writer A writes while the panel is closed.')
    await aSecondOfItsOwn()
    // NOTHING HOLDS THE AGENT WRITTEN TO IN THE TEST OFFICE, so the office stores the message, routes it and answers
    // 409. The message is stored all the same.
    await say(asAgent('writer-c-apply'), { kind: 'agent', id: writerB }, 'writer-c writes again while the panel is closed.', 409)
    await applyWhatWasHeard(false)
    events.pageClosed(page)
    expect(reads.slice(readsBefore), 'a closed panel read something for events the circle can take').toEqual([])
    expect(held.contacts, 'a closed panel changed the contact rows it holds').toBe(beforeClosing.contacts)
    expect(held.between, 'a closed panel changed the conversations between agents it holds').toBe(beforeClosing.between)
    expect(theButton(held.circle), 'after the closed run: the circle').toEqual(theButton(await get('/api/messages/circle')))

    // AND THE ORDINARY EVENTS WERE APPLIED, NOT READ.
    expect(appliedWithoutARead, JSON.stringify(reads)).toContain(`message.new ${fromWriterA}`)
    expect(appliedWithoutARead, JSON.stringify(reads)).toContain(`message.new ${fromB}`)
    expect(appliedWithoutARead.filter((one) => one === 'delivery.changed').length, JSON.stringify(reads)).toBeGreaterThan(0)
    // Every list read is named, with the event that asked for it, so a new read shows up here.
    const readLists = reads.flatMap((one) => one.lists.map((list) => `${one.event}:${list}`)).sort()
    expect(readLists, JSON.stringify(reads)).toEqual(
      [
        // The agent registered through the records door: its contact row is placed by the door's
        // rules, so the contacts are read. Its name and presence are read by themselves, not listed here.
        'list.changed:contacts',
        // THE OWNER'S MARK REACHED SEEN ON A MESSAGE TO THEM, and the counts it moved came with the event
        // (`seenLeaves`), so neither the contacts nor the groups are read. Round 9 of wave 13x: they were read whole on
        // every switch from one conversation to another.
      ].sort(),
    )
  }, 120_000)
})
