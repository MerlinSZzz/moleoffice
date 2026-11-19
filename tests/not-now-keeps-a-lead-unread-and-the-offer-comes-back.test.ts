// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * NOT NOW KEEPS A LEAD'S MESSAGE UNREAD, AND THE OFFER COMES BACK LATER.
 *
 * Two decisions set this. Pressing Not now on the offer to lead the person
 * to a page used to mark the lead read; it now keeps it unread, and the offer comes back after a while.
 *
 * Before this, both presses on a lead offer marked the message read. Now:
 *
 *   1. Not now (POST /api/messages/:id/not-now) leaves the message unread. It still counts as unread in
 *      the chat's contact row, on the chat circle and on the Messages page, and it is still in the
 *      reader's waiting-for-me read.
 *   2. The offers read (GET /api/messages?only=waiting-for-me&leads=1) leaves it out until thirty
 *      minutes after the press, then offers it again. Each Not now starts the wait again.
 *   3. Reading the message ends the offer, however it is read: Take me there and opening the message
 *      both write the read mark through POST /api/messages/:id/mark.
 *   4. Only a person may press Not now, only on a message addressed to them, and only on one that
 *      carries a lead. Nothing is written when it is refused.
 *
 * THE CLOCK IS THIS TEST'S OWN. Only `Date` is faked (`vi.setSystemTime`), so the door's stamp and the
 * offers read's "now" both read the moment this file sets, and nothing waits thirty real minutes.
 *
 * MUTATIONS, each named in the commit that meets this file: the door also marks the message seen (case
 * 1 goes red); the wait is 0 minutes, or the offers read does not leave a put-off offer out (case 2
 * goes red); the waiting read keeps a read message, in both places that leave one out (case 3 goes
 * red); the door lets an agent press it (case 4 goes red).
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { A_PUT_OFF_OFFER_COMES_BACK_AFTER_MINUTES } from '../src/shared/short-lists.ts'
import { theOffersStillToDraw, type Offer } from '../src/web/components/Leading.tsx'

let t: TestDb
let app: FastifyInstance
let agentId = ''
let placeId = ''

const PERSON = {
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const GUIDE = { ...PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'guide-nn' }

const MINUTE = 60_000
/** A fixed moment to start each case from, so every stamp in a case is known. */
const START = new Date(2026, 9, 4, 10, 0, 0).getTime()

async function inject(method: 'GET' | 'POST', url: string, headers: Record<string, string>, payload?: object) {
  const reply = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload }) })
  return { status: reply.statusCode, body: reply.json() as Record<string, unknown> }
}

/** The guide offers to take the person to the note, and the message's id comes back. */
async function anOffer(words: string): Promise<string> {
  const made = await inject('POST', '/api/records', GUIDE, {
    kind: 'message',
    title: words.slice(0, 40),
    data: {
      body: words,
      to: [{ kind: 'person', id: THE_PERSON }],
      lead: { target: { kind: 'record', recordId: placeId, workspaceId: 'default' } },
    },
  })
  expect(made.status, JSON.stringify(made.body)).toBe(201)
  return (made.body['record'] as { id: string }).id
}

/** The ids the offers read answers, and when it says the first put-off offer comes back. */
async function theOffersRead(): Promise<{ ids: string[]; comesBackIn: number | null }> {
  const read = await inject('GET', '/api/messages?only=waiting-for-me&leads=1', PERSON)
  expect(read.status, JSON.stringify(read.body)).toBe(200)
  return {
    ids: (read.body['messages'] as { id: string }[]).map((one) => one.id),
    comesBackIn: read.body['offersComeBackInSeconds'] as number | null,
  }
}

/** The person's mark on one message, read from the message itself. */
async function theMarkOn(id: string): Promise<string | undefined> {
  const read = await inject('GET', `/api/messages/${id}`, PERSON)
  expect(read.status, JSON.stringify(read.body)).toBe(200)
  const message = (read.body['message'] ?? read.body) as { deliveries: { to: { kind: string; id: string }; mark: string }[] }
  return message.deliveries.find((one) => one.to.kind === 'person' && one.to.id === THE_PERSON)?.mark
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  const made = await inject('POST', '/api/agents/started', PERSON, { handle: 'guide-nn', name: 'Guide NN', workArea: ['src'] })
  expect(made.status, JSON.stringify(made.body)).toBe(201)
  const row = t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get('guide-nn') as { id: string } | undefined
  agentId = row?.id ?? ''
  expect(agentId, 'the guide has no registry row').not.toBe('')
  const note = await inject('POST', '/api/records', PERSON, {
    kind: 'note',
    title: 'The place the guide offers to show',
    data: { date: '2026-10-04', body: 'A note to be led to.' },
  })
  expect(note.status, JSON.stringify(note.body)).toBe(201)
  placeId = (note.body['record'] as { id: string }).id
})

afterEach(() => {
  vi.useRealTimers()
})

afterAll(async () => {
  await app.close()
  t.close()
})

describe('Not now keeps the message unread', () => {
  it('leaves the mark, the waiting read, the chat counts and the Messages page count as they were', async () => {
    // TWO HOURS BEFORE START, so this case's put-off offer has come back before the next case reads the
    // offers at START. On the real clock, a run between 09:30 and 10:00 left this offer still put off at
    // START, and the next case read its wait instead of its own (863 seconds, run at 09:43).
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(START - 120 * MINUTE)
    const id = await anOffer('Come and look at the note, case one.')
    const circleBefore = await inject('GET', '/api/messages/circle', PERSON)
    const contactsBefore = await inject('GET', '/api/messages/contacts', PERSON)
    const unreadOf = (body: Record<string, unknown>): number | undefined => {
      const rows = body['contacts'] as { who: { kind: string; id: string } | null; unread: number }[]
      return rows.find((one) => one.who?.kind === 'agent' && one.who.id === agentId)?.unread
    }

    const pressed = await inject('POST', `/api/messages/${id}/not-now`, PERSON)
    expect(pressed.status, JSON.stringify(pressed.body)).toBe(200)
    expect(pressed.body['changed']).toBe(true)

    expect(await theMarkOn(id), 'Not now marked the message read').not.toBe('seen')
    const waiting = await inject('GET', '/api/messages?only=waiting-for-me', PERSON)
    expect((waiting.body['messages'] as { id: string }[]).map((one) => one.id), 'Not now took the message out of what waits').toContain(id)
    // THE CHAT: the number on the circle and the guide's contact row did not fall.
    const circleAfter = await inject('GET', '/api/messages/circle', PERSON)
    expect(JSON.stringify(circleAfter.body['unread']), 'the number on the chat circle moved').toBe(JSON.stringify(circleBefore.body['unread']))
    const contactsAfter = await inject('GET', '/api/messages/contacts', PERSON)
    expect(unreadOf(contactsAfter.body), 'the guide\'s row in the chat counts the message as read').toBe(unreadOf(contactsBefore.body))
    expect(unreadOf(contactsAfter.body), 'the guide has no row in the chat, or it counts nothing unread').toBeGreaterThanOrEqual(1)
    // THE MESSAGES PAGE: its read of one page counts the message as unread for the reader.
    const page = await inject('GET', `/api/messages?words=${encodeURIComponent('the note, case one')}&limit=50`, PERSON)
    expect(page.status, JSON.stringify(page.body)).toBe(200)
    expect(page.body['matched'], 'the Messages page did not find the message').toBe(1)
    expect(page.body['unreadForYou'], 'the Messages page counts the message as read').toBe(1)
    const row = t.client.sqlite
      .prepare("SELECT mark, offer_put_off_at FROM message_delivery WHERE message_id = ? AND recipient_kind = 'person'")
      .get(id) as { mark: string; offer_put_off_at: string | null }
    expect(row.mark).not.toBe('seen')
    expect(row.offer_put_off_at, 'the press stored no moment').not.toBeNull()
  })
})

describe('the offer does not come back at once, and comes back after the wait', () => {
  it('is left out of the offers read until the wait is over, and each Not now starts the wait again', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(START)
    const id = await anOffer('Come and look at the note, case two.')
    expect((await theOffersRead()).ids, 'the offer was not offered before Not now').toContain(id)

    const pressed = await inject('POST', `/api/messages/${id}/not-now`, PERSON)
    expect(pressed.status, JSON.stringify(pressed.body)).toBe(200)
    expect(pressed.body['comesBackInSeconds']).toBe(A_PUT_OFF_OFFER_COMES_BACK_AFTER_MINUTES * 60)

    // AT ONCE: left out, and the read says when it comes back.
    const atOnce = await theOffersRead()
    expect(atOnce.ids, 'the offer came back at once after Not now').not.toContain(id)
    expect(atOnce.comesBackIn).toBe(A_PUT_OFF_OFFER_COMES_BACK_AFTER_MINUTES * 60)
    // ONE SECOND BEFORE THE WAIT IS OVER: still left out.
    vi.setSystemTime(START + A_PUT_OFF_OFFER_COMES_BACK_AFTER_MINUTES * MINUTE - 1000)
    const justBefore = await theOffersRead()
    expect(justBefore.ids, 'the offer came back before the wait was over').not.toContain(id)
    expect(justBefore.comesBackIn).toBe(1)
    // THIRTY MINUTES ON: offered again, and nothing is put off any more.
    vi.setSystemTime(START + 30 * MINUTE)
    const after = await theOffersRead()
    expect(after.ids, 'the offer did not come back thirty minutes after Not now').toContain(id)
    expect(after.comesBackIn).toBeNull()

    // A SECOND NOT NOW, thirty minutes on, starts the wait again from that press.
    const again = await inject('POST', `/api/messages/${id}/not-now`, PERSON)
    expect(again.status, JSON.stringify(again.body)).toBe(200)
    vi.setSystemTime(START + 59 * MINUTE)
    expect((await theOffersRead()).ids, 'the second Not now did not put the offer off again').not.toContain(id)
    vi.setSystemTime(START + 60 * MINUTE)
    expect((await theOffersRead()).ids, 'the offer did not come back after the second wait').toContain(id)
  })

  it('keeps the offer off this screen for the same wait, and no longer', () => {
    const offer = { messageId: 'm-1' } as Offer
    const pressedAt = START
    const answered = new Map([['m-1', pressedAt + A_PUT_OFF_OFFER_COMES_BACK_AFTER_MINUTES * MINUTE]])
    expect(theOffersStillToDraw([offer], answered, pressedAt + 30 * MINUTE - 1)).toEqual([])
    expect(theOffersStillToDraw([offer], answered, pressedAt + 30 * MINUTE)).toEqual([offer])
    // AFTER TAKE ME THERE IT STAYS OFF FOR GOOD.
    expect(theOffersStillToDraw([offer], new Map([['m-1', Infinity]]), pressedAt + 10_000 * MINUTE)).toEqual([])
  })
})

describe('reading the message ends the offer', () => {
  it('is never offered again once the message is read, by Take me there or by opening it', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(START + 24 * 60 * MINUTE)
    const taken = await anOffer('Come and look at the note, case three, taken.')
    const putOffThenOpened = await anOffer('Come and look at the note, case three, put off and then opened.')
    // TAKE ME THERE writes the read mark.
    expect((await inject('POST', `/api/messages/${taken}/mark`, PERSON, { mark: 'seen' })).status).toBe(200)
    // NOT NOW, THEN THE MESSAGE IS OPENED in the chat, which writes the same read mark.
    expect((await inject('POST', `/api/messages/${putOffThenOpened}/not-now`, PERSON)).status).toBe(200)
    expect((await inject('POST', `/api/messages/${putOffThenOpened}/mark`, PERSON, { mark: 'seen' })).status).toBe(200)
    vi.setSystemTime(START + 24 * 60 * MINUTE + 31 * MINUTE)
    const read = await theOffersRead()
    expect(read.ids, 'a message taken with Take me there was offered again').not.toContain(taken)
    expect(read.ids, 'a message opened after Not now was offered again').not.toContain(putOffThenOpened)
    // AND NOT NOW ON A READ MESSAGE WRITES NOTHING.
    const late = await inject('POST', `/api/messages/${taken}/not-now`, PERSON)
    expect(late.status, JSON.stringify(late.body)).toBe(200)
    expect(late.body['changed']).toBe(false)
  })
})

describe('only the person it was sent to may put an offer off', () => {
  it('refuses an agent, a message to somebody else, and a message with no lead, and writes nothing', async () => {
    const id = await anOffer('Come and look at the note, case four.')
    const stored = (): string | null =>
      (
        t.client.sqlite
          .prepare("SELECT offer_put_off_at FROM message_delivery WHERE message_id = ? AND recipient_kind = 'person'")
          .get(id) as { offer_put_off_at: string | null }
      ).offer_put_off_at

    const byAnAgent = await inject('POST', `/api/messages/${id}/not-now`, GUIDE)
    expect(byAnAgent.status, JSON.stringify(byAnAgent.body)).toBe(403)
    expect(String(byAnAgent.body['error'])).toContain('Nothing was written')
    expect(stored(), 'an agent put the offer off').toBeNull()

    // A MESSAGE TO AN AGENT: the person has no delivery of it.
    const toAnAgent = await inject('POST', '/api/records', PERSON, {
      kind: 'message',
      title: 'To the guide',
      data: { body: 'For the guide.', to: [{ kind: 'agent', id: 'guide-nn' }], lead: { target: { kind: 'record', recordId: placeId, workspaceId: 'default' } } },
    })
    // A PERSON'S SEND TO AN AGENT NOTHING HOLDS ANSWERS 409, with the letter stored and routed (decision 60sbc5I-bwKx).
    expect(toAnAgent.status, JSON.stringify(toAnAgent.body)).toBe(409)
    const notMine = await inject('POST', `/api/messages/${(toAnAgent.body['record'] as { id: string }).id}/not-now`, PERSON)
    expect(notMine.status, JSON.stringify(notMine.body)).toBe(404)

    const noLead = await inject('POST', '/api/records', GUIDE, {
      kind: 'message',
      title: 'Just words',
      data: { body: 'Nothing to be led to.', to: [{ kind: 'person', id: THE_PERSON }] },
    })
    expect(noLead.status, JSON.stringify(noLead.body)).toBe(201)
    const noOffer = await inject('POST', `/api/messages/${(noLead.body['record'] as { id: string }).id}/not-now`, PERSON)
    expect(noOffer.status, JSON.stringify(noOffer.body)).toBe(409)
  })
})
