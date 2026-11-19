// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A NEW MESSAGE REACHES ONLY ITS PARTIES AND THE OWNER. A decision and problem 9zgmnY3vBvCH.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS WRONG
 * ---------------------------------------------------------------------------------------
 *
 * Delivery already went by party: each addressee has its own queue. The live push did not. Every
 * open stream in every project was sent each new message's whole body, agents' streams included, so
 * an agent's waiter was handed messages that had nothing to do with it.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE HOLDS
 * ---------------------------------------------------------------------------------------
 *
 * One page of each kind is held open on the channel: the owner's page; the sender's; an addressee
 * agent's; a group member's; an agent's in the same project that is no party; an agent's watching
 * another project; and a second person's. Real messages are written through the create door, and
 * each page's stream is read for the message's id and its words:
 *
 *   1. a message between two agents reaches the sender, the addressee and the owner, and nobody else;
 *   2. a message to a group reaches its members and the owner, and nobody else;
 *   3. a message from the owner reaches its addressee and the owner, and nobody else;
 *   4. a message to a person who is not the owner reaches that person as a party;
 *   5. a member who joins a group after a message was sent is told nothing when its marks move, because
 *      the parties are the members at the time of sending;
 *   6. a page that reconnects, and a message deleted, follow the same routing.
 *
 * RED ON MAIN: every no-party page was sent every message. MUTATION: in `reaches` in
 * src/server/lib/events.ts, delete the party check (the broadcast is back) and cases 1 to 6 go
 * red. A second mutation, in `thePartiesOf` in src/server/lib/messages.ts, drops the joining time from
 * the group's membership (members as now), and case 5 goes red. A third, in `announce`, lets an event
 * about a message through without its parties, and case 7 goes red.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { freshDb, type TestDb } from './helpers.ts'
import type { ParticipantRef } from '../src/shared/participants.ts'
import { THE_PERSON } from '../src/shared/person.ts'

const HERE = 'default'
const ELSEWHERE = 'somewhere-else'
const OWNER: ParticipantRef = { kind: 'person', id: THE_PERSON }
let ANOTHER_PERSON: ParticipantRef = { kind: 'person', id: 'fern-visitor' }
const AS_THE_OWNER = { type: 'human', id: THE_PERSON } as never

let t: TestDb
let events: typeof import('../src/server/lib/events.ts')
let messages: typeof import('../src/server/lib/messages.ts')
let participants: typeof import('../src/server/lib/participants.ts')
let groups: typeof import('../src/server/lib/groups.ts')
let caseNumber = 0
// THE HANDLES ARE MADE FRESH FOR EACH CASE, because one live agent per handle is the rule across the
// installation and the registry rows of earlier cases stay live.
let ADA_HANDLE = 'ada-sender'
let BO_HANDLE = 'bo-addressee'
let CY_HANDLE = 'cy-member'
let DEE_HANDLE = 'dee-bystander'
let EVE_HANDLE = 'eve-away'

/** Every event one page was sent, as the text that went over the wire. */
interface APage {
  said: string[]
  id: number
}

function aPage(who: ParticipantRef | null, watching: string): APage {
  const said: string[] = []
  const id = events.pageOpened({ workspaceId: watching, who, send: (one) => said.push(JSON.stringify(one.event)) })
  return { said, id }
}

/** True when anything this page was sent names this message or carries these words. */
function heardOf(page: APage, messageId: string, words: string): boolean {
  return page.said.some((one) => one.includes(messageId) || one.includes(words))
}

/** The names of the events this page was sent that name this message. */
function eventsAbout(page: APage, messageId: string): string[] {
  return page.said
    .filter((one) => one.includes(messageId))
    .map((one) => (JSON.parse(one) as { name: string }).name)
}

/** Register one agent and give back the participant it answers to. */
function anAgent(handle: string): ParticipantRef {
  t.api.createRecord({
    kind: 'agent',
    title: handle,
    workspaceId: HERE,
    data: { handle, runtime: 'claude-code', state: 'active' },
    actor: AS_THE_OWNER,
  })
  const who = participants.participantForActor({ type: 'agent', id: handle })
  if (who === null) throw new Error(`the agent ${handle} was registered and no registry row answers to it`)
  return who
}

/** Write one message as this writer and give back its id. */
function say(writer: { type: string; id: string }, body: string, addressing: Record<string, unknown>, where: string = HERE): string {
  return t.api.createRecord({
    kind: 'message',
    title: body.slice(0, 40),
    workspaceId: where,
    data: { body, ...addressing },
    actor: writer as never,
  }).id
}

let ada: ParticipantRef
let bo: ParticipantRef
let cy: ParticipantRef
let dee: ParticipantRef
let eve: ParticipantRef
let pages: { owner: APage; ada: APage; bo: APage; cy: APage; dee: APage; eve: APage; fern: APage }

beforeAll(async () => {
  t = await freshDb()
  events = await import('../src/server/lib/events.ts')
  messages = await import('../src/server/lib/messages.ts')
  participants = await import('../src/server/lib/participants.ts')
  groups = await import('../src/server/lib/groups.ts')
}, 60_000)

afterAll(() => {
  t.close()
})

beforeEach(async () => {
  caseNumber += 1
  ADA_HANDLE = `ada-sender-${String(caseNumber)}`
  BO_HANDLE = `bo-addressee-${String(caseNumber)}`
  CY_HANDLE = `cy-member-${String(caseNumber)}`
  DEE_HANDLE = `dee-bystander-${String(caseNumber)}`
  EVE_HANDLE = `eve-away-${String(caseNumber)}`
  ANOTHER_PERSON = { kind: 'person', id: `fern-visitor-${String(caseNumber)}` }
  events.forgetTheChannel()
  ada = anAgent(ADA_HANDLE)
  bo = anAgent(BO_HANDLE)
  cy = anAgent(CY_HANDLE)
  dee = anAgent(DEE_HANDLE)
  eve = anAgent(EVE_HANDLE)
  // A SECOND PERSON, who is not the owner. Made-up, and written the way a test that needs one writes it.
  const picture = t.client.sqlite.prepare('SELECT id FROM assets LIMIT 1').get() as { id: string }
  t.client.sqlite
    .prepare(
      'INSERT INTO people (id, name, handle, avatar_asset_id, state, state_at, created_at) ' +
        "VALUES (?, 'Fern Visitor', ?, ?, NULL, NULL, '2026-09-27 09:00:00')",
    )
    .run(ANOTHER_PERSON.id, ANOTHER_PERSON.id, picture.id)
  pages = {
    owner: aPage(OWNER, HERE),
    ada: aPage(ada, HERE),
    bo: aPage(bo, HERE),
    cy: aPage(cy, HERE),
    dee: aPage(dee, HERE),
    eve: aPage(eve, ELSEWHERE),
    fern: aPage(ANOTHER_PERSON, HERE),
  }
})

afterEach(() => {
  for (const page of Object.values(pages)) events.pageClosed(page.id)
})

describe('a new message reaches only its parties and the owner', () => {
  it('a message between two agents reaches the sender, the addressee and the owner, and nobody else', () => {
    const words = 'The gripper closes at 4.2 N.'
    const id = say({ type: 'agent', id: ADA_HANDLE }, words, { to: [bo] })
    // THE CONTROL: the parties and the owner were sent it, words and all.
    expect(eventsAbout(pages.owner, id)).toContain('message.new')
    expect(heardOf(pages.owner, id, words)).toBe(true)
    expect(eventsAbout(pages.bo, id)).toContain('message.new')
    expect(eventsAbout(pages.ada, id)).toContain('message.new')
    // NOBODY ELSE HEARS ANYTHING ABOUT IT: not its words and not its id.
    expect(heardOf(pages.cy, id, words), pages.cy.said.join('\n')).toBe(false)
    expect(heardOf(pages.dee, id, words), pages.dee.said.join('\n')).toBe(false)
    expect(heardOf(pages.eve, id, words), pages.eve.said.join('\n')).toBe(false)
    expect(heardOf(pages.fern, id, words), pages.fern.said.join('\n')).toBe(false)
  }, 30_000)

  it('a message to a group reaches its members and the owner, and nobody else', () => {
    const group = groups.openAGroup({
      workspaceId: HERE,
      name: 'Bench crew',
      openedBy: ada,
      because: 'The two of us share the bench.',
      members: [
        { who: ada, because: 'Opened it.' },
        { who: cy, because: 'Works the bench.' },
      ],
    })
    const words = 'Bench two is free after lunch.'
    const id = say({ type: 'agent', id: ADA_HANDLE }, words, { toGroup: group.id })
    expect(eventsAbout(pages.cy, id)).toContain('message.new')
    expect(eventsAbout(pages.ada, id)).toContain('message.new')
    expect(eventsAbout(pages.owner, id)).toContain('message.new')
    expect(heardOf(pages.bo, id, words), pages.bo.said.join('\n')).toBe(false)
    expect(heardOf(pages.dee, id, words), pages.dee.said.join('\n')).toBe(false)
    expect(heardOf(pages.eve, id, words), pages.eve.said.join('\n')).toBe(false)
    expect(heardOf(pages.fern, id, words), pages.fern.said.join('\n')).toBe(false)
  }, 30_000)

  it('a message from the owner reaches its addressee and the owner, and nobody else', () => {
    const words = 'Please repeat the drop test.'
    const id = say(AS_THE_OWNER as unknown as { type: string; id: string }, words, { to: [bo] })
    expect(eventsAbout(pages.bo, id)).toContain('message.new')
    expect(eventsAbout(pages.owner, id)).toContain('message.new')
    expect(heardOf(pages.ada, id, words), pages.ada.said.join('\n')).toBe(false)
    expect(heardOf(pages.cy, id, words), pages.cy.said.join('\n')).toBe(false)
    expect(heardOf(pages.dee, id, words), pages.dee.said.join('\n')).toBe(false)
    expect(heardOf(pages.eve, id, words), pages.eve.said.join('\n')).toBe(false)
    expect(heardOf(pages.fern, id, words), pages.fern.said.join('\n')).toBe(false)
  }, 30_000)

  it('a message to a person who is not the owner reaches that person as a party', () => {
    const words = 'Your parcel is at the desk.'
    const id = say({ type: 'agent', id: ADA_HANDLE }, words, { to: [ANOTHER_PERSON] })
    expect(eventsAbout(pages.fern, id)).toContain('message.new')
    expect(eventsAbout(pages.owner, id)).toContain('message.new')
    expect(heardOf(pages.dee, id, words), pages.dee.said.join('\n')).toBe(false)
    expect(heardOf(pages.bo, id, words), pages.bo.said.join('\n')).toBe(false)
  }, 30_000)

  it('counts a group\'s members as they were when the message was sent', () => {
    const group = groups.openAGroup({
      workspaceId: HERE,
      name: 'Night shift',
      openedBy: ada,
      because: 'Two of us work nights.',
      members: [
        { who: ada, because: 'Opened it.' },
        { who: cy, because: 'Works nights.' },
      ],
    })
    const words = 'The oven stays on overnight.'
    const id = say({ type: 'agent', id: ADA_HANDLE }, words, { toGroup: group.id })
    // DEE JOINS LATER. Times are whole seconds, so the join is dated far ahead to be sure it is later.
    groups.addAMember(group.id, dee, 'Joined the night shift.')
    t.client.sqlite
      .prepare('UPDATE group_members SET joined_at = ? WHERE group_id = ? AND member_id = ?')
      .run('2999-01-01 00:00:00', group.id, dee.id)
    // CY READS IT, and the mark moves.
    const marked = messages.markDelivery(id, cy, 'seen')
    expect(marked.changed).toBe(true)
    // THE CONTROL: cy, a member when it was sent, and the owner are told the mark moved.
    expect(eventsAbout(pages.cy, id)).toContain('delivery.changed')
    expect(eventsAbout(pages.owner, id)).toContain('delivery.changed')
    // DEE, A MEMBER NOW BUT NOT WHEN IT WAS SENT, watching the same project, is told nothing about it.
    expect(heardOf(pages.dee, id, words), pages.dee.said.join('\n')).toBe(false)
  }, 30_000)

  it('gives a reconnecting page, and the news of a deletion, only to the parties and the owner', () => {
    const words = 'Swap the left motor.'
    const id = say({ type: 'agent', id: ADA_HANDLE }, words, { to: [bo] })
    // A PAGE PICKING UP AFTER A BREAK is given back what it would have been streamed.
    const deeBack = events.since(0, HERE, dee).events.map((one) => JSON.stringify(one.event))
    expect(deeBack.some((one) => one.includes(id) || one.includes(words)), deeBack.join('\n')).toBe(false)
    const boBack = events.since(0, HERE, bo).events.map((one) => JSON.stringify(one.event))
    expect(boBack.some((one) => one.includes(id))).toBe(true)
    // A DELETION names the message in its sentence, so it goes where the message went. Its writer deletes it,
    // because only the writer may.
    t.api.deleteRecord(id, { type: 'agent', id: ADA_HANDLE })
    const told = (page: APage): boolean => page.said.some((one) => one.includes('list.changed') && one.includes('Swap the left'))
    expect(told(pages.owner)).toBe(true)
    expect(told(pages.bo)).toBe(true)
    expect(told(pages.dee), pages.dee.said.join('\n')).toBe(false)
    expect(told(pages.eve), pages.eve.said.join('\n')).toBe(false)
  }, 30_000)

  it('refuses to announce an event about a message that names no parties', () => {
    const before = events.channelState().lastId
    expect(() =>
      (events.announce as (event: unknown) => unknown)({
        name: 'message.new',
        workspaceId: HERE,
        messageId: 'mNobodySaid',
        sentBy: ada,
        to: [bo],
        hasTarget: false,
      }),
    ).toThrow(/without the message's parties/)
    // NOTHING WAS SENT OR REMEMBERED.
    expect(events.channelState().lastId).toBe(before)
    expect(pages.owner.said.some((one) => one.includes('mNobodySaid'))).toBe(false)
  }, 30_000)
})
