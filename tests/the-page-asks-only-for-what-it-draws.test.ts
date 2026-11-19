// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PAGE ASKS ONLY FOR WHAT IT DRAWS: THE DOORS' SHORT ANSWERS.
 *
 * This is option 2 of a decision of 26 September 2026. The owner's pages read whole lists to
 * draw a few fields of each row. Each door the page reads now answers a short shape when the page asks for it, and
 * answers exactly as before when it does not:
 *   - GET /api/groups?shape=page and GET /api/messages/between-agents?shape=page: the same rows in the
 *     same order, each cut to what the chat draws of it (src/shared/short-lists.ts);
 *   - GET /api/messages/contacts?shape=page: the same rows in the same order, with each last message cut
 *     to what the contact row draws of it (round 9 of wave 13x);
 *   - GET /api/messages/circle: who is reading and the number on the chat circle, for a closed panel,
 *     worked out by the same function as the contact list's number;
 *   - GET /api/messages?only=waiting-for-me&leads=1: only the entries that carry a lead, which is
 *     all the offers panel draws.
 *
 * WHAT FAILS IF A DRAWN FIELD GOES MISSING. The short rows are compared key for key with the fields
 * the chat's rows draw (`DRAWN_OF_A_GROUP`, `DRAWN_OF_A_CONVERSATION` below). Each of those fields is
 * read by a named line of src/web/components/Chat.tsx or src/shared/groups.ts, given beside it. A
 * short row that dropped one of them is red here.
 *
 * RED ON MAIN: main has no short shape (the rows come back whole), no circle door (404), and no
 * `leads` narrowing (refused as unknown). CONTROL: green with the change.
 * MUTATIONS, each red: drop `pinned` from `aGroupRowForThePage`; send `row.last.body` uncut from
 * `aBetweenAgentsRowForThePage`; send `last.sentAt` or the whole body from `aContactRowForThePage`; compute the circle's `groups` half without `unreadInAGroup`'s count
 * test (`groups.length`); drop the `carriesALead` filter.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { isMoleOffice, type ParticipantRef } from '../src/shared/participants.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { LAST_BODY_CHARACTERS, theFirstWords } from '../src/shared/short-lists.ts'

let t: TestDb
let app: FastifyInstance
const PERSON = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const asAgent = (id: string) => ({ 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': id })

/**
 * WHAT THE CHAT DRAWS OF A GROUP ROW, and where.
 *   id              Chat.tsx `AGroupRow` (the press opens it), shared/groups.ts `whereEachGroupSits`
 *   name            Chat.tsx `AGroupRow` (.px-chat-name), and the claims band's group name
 *   openedBy        shared/groups.ts `theOfficeOpenedIt`, called by `whereEachGroupSits`
 *   members[].who   Chat.tsx `AGroupRow` (the faces, the member count, the take-out presses)
 *   unread          Chat.tsx `AGroupRow` (the number) and the Groups tab's number
 *   anythingUnread  Chat.tsx `AGroupRow` (data-unread, bold)
 *   pinned          shared/groups.ts `whereEachGroupSits`
 *   projects        Chat.tsx `AGroupRow` (the project mark) and the project filter
 */
const DRAWN_OF_A_GROUP = ['anythingUnread', 'id', 'members', 'name', 'openedBy', 'pinned', 'projects', 'unread']
const DRAWN_OF_A_MEMBER = ['who']
/**
 * WHAT THE CHAT DRAWS OF A BETWEEN-AGENTS ROW, and where: all in the Between agents tab's row in
 * Chat.tsx. `between` names the two and keys the row, `anythingNew` is data-unread, `newSince` is the
 * grey number and the tab's count, `projects` is the project mark and, by a decision, what the project filter
 * reads. `last.body` is the line under the names. `last.id` is kept so a row
 * can still be matched to the message it shows. When Mole Office wrote the last line, `last.office`
 * carries the facts that line is worded from in the page's language (`theLastLineInWords` in
 * src/shared/short-lists.ts, round 41 of wave 13n); a line anybody else wrote has none.
 */
const DRAWN_OF_A_CONVERSATION = ['anythingNew', 'between', 'last', 'newSince', 'projects']
const DRAWN_OF_A_LAST_MESSAGE = ['body', 'id']
const DRAWN_OF_AN_OFFICE_LINE = ['body', 'id', 'office']
/**
 * WHAT THE CHAT DRAWS OF A CONTACT ROW'S LAST MESSAGE, and where: `ContactRow` in
 * src/web/components/ContactChooser.tsx draws `sentAt` as the time beside the name and `body` (or the
 * words of `office`) as the line under it. `id` and `sentAt` are what src/web/lib/chatdeltas.ts compares
 * a new message with. Every other field of the row is kept whole.
 */
const DRAWN_OF_A_CONTACTS_LAST = ['body', 'id', 'sentAt']
const THE_FACTS_OF_AN_OFFICE_LINE = ['sentBy', 'sentAt', 'toGroup', 'saidInFull', 'deadLetterSweepSaid', 'deadLetterSummarySaid']

async function get(url: string, headers: Record<string, string> = PERSON): Promise<{ status: number; body: Record<string, unknown>; text: string }> {
  const reply = await app.inject({ method: 'GET', url, headers })
  return { status: reply.statusCode, body: reply.statusCode === 200 ? (reply.json() as Record<string, unknown>) : {}, text: reply.body }
}

async function post(path: string, body: unknown, headers: Record<string, string> = PERSON, expected?: number): Promise<Record<string, unknown>> {
  const reply = await app.inject({ method: 'POST', url: path, headers, payload: body as object })
  if (expected === undefined) expect(reply.statusCode, reply.body.slice(0, 300)).toBeLessThan(300)
  else expect(reply.statusCode, reply.body.slice(0, 300)).toBe(expected)
  return reply.json() as Record<string, unknown>
}

async function message(from: string, data: Record<string, unknown>, expected?: number): Promise<string> {
  const filed = await post('/api/records', { kind: 'message', title: String(data['body']).slice(0, 40), data }, asAgent(from), expected)
  const id = (filed['record'] as { id?: string } | undefined)?.id
  expect(id).toBeDefined()
  return id ?? ''
}

const TO_THE_OWNER = [{ kind: 'person', id: THE_PERSON }]
const A_LONG_BODY = `${'The clamp holds at 11.8 N. '.repeat(40)}🙂 and the end.`
const A_LONG_BODY_TO_THE_OWNER = `${'The wrist turns 40 degrees. '.repeat(40)}🙂 and the end.`

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  for (const handle of ['short-one', 'short-two']) {
    const made = await app.inject({ method: 'POST', url: '/api/agents/started', headers: PERSON, payload: { handle, name: handle, workArea: ['src'] } })
    expect(made.statusCode, made.body).toBe(201)
  }
  // A GROUP THE OWNER IS IN, WITH TWO UNREAD MESSAGES: the group half of the circle counts it once. Opening
  // it writes lines Mole Office wrote, which show without counting.
  const opened = await post('/api/groups', {
    name: 'The wrist camera',
    because: 'so that a group holds unread messages',
    members: [
      { who: { kind: 'person', id: THE_PERSON }, because: 'the person reads it' },
      { who: { kind: 'agent', id: 'short-one' }, because: 'it works here' },
    ],
  })
  const groupId = (opened['group'] as { id: string }).id
  await message('short-one', { body: 'First in the group.', toGroup: groupId })
  await message('short-one', { body: 'Second in the group.', toGroup: groupId })
  // TWO MESSAGES TO THE OWNER, ONE OF WHICH THE OWNER HAS READ: the messages half counts one.
  await message('short-one', { body: 'Unread, to the owner.', to: TO_THE_OWNER })
  const read = await message('short-two', { body: 'Read, to the owner.', to: TO_THE_OWNER })
  await post(`/api/messages/${read}/mark`, { mark: 'seen' })
  // ONE OFFER TO TAKE THE OWNER SOMEWHERE, which carries a lead, beside the two plain messages above.
  const note = await post('/api/records', { kind: 'note', title: 'A place to be taken', data: { date: '2026-09-26', body: 'A note.' } })
  const noteId = (note['record'] as { id: string }).id
  await message('short-two', { body: 'Come and look.', to: TO_THE_OWNER, lead: { target: { kind: 'record', recordId: noteId, workspaceId: 'default' } } })
  // A CONVERSATION BETWEEN THE TWO AGENTS whose last line is longer than the row carries. Nothing holds either agent in
  // the test office, so the office stores each line, routes it and answers 409; the line is stored all the same.
  await message('short-one', { body: 'A short line first.', to: [{ kind: 'agent', id: 'short-two' }] }, 409)
  await message('short-two', { body: A_LONG_BODY, to: [{ kind: 'agent', id: 'short-one' }] }, 409)
  // AND, LAST, A LINE TO THE OWNER LONGER THAN A CONTACT ROW CARRIES.
  await message('short-one', { body: A_LONG_BODY_TO_THE_OWNER, to: TO_THE_OWNER })
}, 120_000)

afterAll(async () => {
  await app.close()
  t.close()
})

describe('GET /api/groups?shape=page', () => {
  it('answers the whole list with each row cut to what the chat draws, and nothing else changed', async () => {
    const whole = await get('/api/groups')
    const short = await get('/api/groups?shape=page')
    expect(whole.status, whole.text).toBe(200)
    expect(short.status, short.text).toBe(200)
    const wholeRows = whole.body['groups'] as Record<string, unknown>[]
    const shortRows = short.body['groups'] as Record<string, unknown>[]
    // THE CONTROL: there is a group, and its whole row carries fields the short one leaves out.
    expect(wholeRows.length, 'no group to cut').toBeGreaterThan(0)
    expect(Object.keys(wholeRows[0] ?? {}).length).toBeGreaterThan(DRAWN_OF_A_GROUP.length)
    expect(shortRows.map((one) => one['id'])).toEqual(wholeRows.map((one) => one['id']))
    for (const [i, row] of shortRows.entries()) {
      const full = wholeRows[i] ?? {}
      expect(Object.keys(row).sort(), 'the short group row is not exactly the fields the chat draws').toEqual(DRAWN_OF_A_GROUP)
      for (const field of DRAWN_OF_A_GROUP.filter((one) => one !== 'members')) expect(row[field], field).toEqual(full[field])
      const members = row['members'] as Record<string, unknown>[]
      const fullMembers = full['members'] as { who: unknown }[]
      expect(members.length).toBe(fullMembers.length)
      for (const [j, member] of members.entries()) {
        expect(Object.keys(member).sort()).toEqual(DRAWN_OF_A_MEMBER)
        expect(member['who']).toEqual(fullMembers[j]?.who)
      }
    }
    // EVERYTHING BESIDE THE ROWS IS THE WHOLE ANSWER'S.
    expect(short.body['yours']).toEqual(whole.body['yours'])
    expect(short.body['me']).toEqual(whole.body['me'])
  })

  it('refuses a shape it does not know, rather than answering the whole list for it', async () => {
    const wrong = await get('/api/groups?shape=short')
    expect(wrong.status).toBe(400)
    expect((JSON.parse(wrong.text) as { error: string }).error).toContain('shape must be "page"')
  })
})

describe('GET /api/messages/between-agents?shape=page', () => {
  it('answers the whole list with each row cut, and the last line cut to its first words', async () => {
    const whole = await get('/api/messages/between-agents')
    const short = await get('/api/messages/between-agents?shape=page')
    expect(whole.status, whole.text).toBe(200)
    expect(short.status, short.text).toBe(200)
    const wholeRows = whole.body['conversations'] as Record<string, unknown>[]
    const shortRows = short.body['conversations'] as Record<string, unknown>[]
    expect(wholeRows.length, 'no conversation between two agents to cut').toBeGreaterThan(0)
    expect(shortRows.map((one) => one['between'])).toEqual(wholeRows.map((one) => one['between']))
    let officeLines = 0
    for (const [i, row] of shortRows.entries()) {
      const full = wholeRows[i] ?? {}
      expect(Object.keys(row).sort(), 'the short row is not exactly the fields the chat draws').toEqual(DRAWN_OF_A_CONVERSATION)
      for (const field of ['between', 'newSince', 'anythingNew', 'projects']) expect(row[field], field).toEqual(full[field])
      const wholeLast = full['last'] as Record<string, unknown>
      const sentBy = wholeLast['sentBy'] as ParticipantRef | null | undefined
      const byTheOffice = sentBy != null && isMoleOffice(sentBy)
      expect(Object.keys(row['last'] as object).sort()).toEqual(byTheOffice ? DRAWN_OF_AN_OFFICE_LINE : DRAWN_OF_A_LAST_MESSAGE)
      if (byTheOffice) {
        officeLines += 1
        const office = (row['last'] as { office: Record<string, unknown> }).office
        for (const fact of THE_FACTS_OF_AN_OFFICE_LINE) expect(office[fact] ?? null, fact).toEqual(wholeLast[fact] ?? null)
      }
    }
    expect(officeLines, 'no row whose last line Mole Office wrote, so the office facts were never compared').toBeGreaterThan(0)
    // THE ROW WHOSE LAST LINE IS THE LONG ONE, found in the whole list by its words.
    const at = wholeRows.findIndex((one) => (one['last'] as { body: string }).body === A_LONG_BODY)
    expect(at, 'the conversation between short-one and short-two is not listed').toBeGreaterThanOrEqual(0)
    const last = (shortRows[at] ?? {})['last'] as Record<string, unknown>
    const fullLast = (wholeRows[at] ?? {})['last'] as { id: string; body: string }
    expect(last['id']).toBe(fullLast.id)
    // THE CONTROL: the whole body really is longer than the row carries.
    expect(Array.from(fullLast.body).length).toBeGreaterThan(LAST_BODY_CHARACTERS)
    expect(last['body']).toBe(`${Array.from(fullLast.body).slice(0, LAST_BODY_CHARACTERS).join('')}…`)
    expect(short.body['mayRead']).toBe(true)
    expect(short.body['because']).toBe(whole.body['because'])
  })

  it('refuses a shape it does not know', async () => {
    const wrong = await get('/api/messages/between-agents?shape=whole')
    expect(wrong.status).toBe(400)
  })
})

describe('GET /api/messages/contacts?shape=page', () => {
  it('answers the same rows with each last message cut to what the contact row draws', async () => {
    const whole = await get('/api/messages/contacts')
    const short = await get('/api/messages/contacts?shape=page')
    expect(whole.status, whole.text).toBe(200)
    expect(short.status, short.text).toBe(200)
    const wholeRows = whole.body['contacts'] as Record<string, unknown>[]
    const shortRows = short.body['contacts'] as Record<string, unknown>[]
    expect(wholeRows.length, 'no contact to cut').toBeGreaterThan(1)
    expect(shortRows.map((one) => one['key'])).toEqual(wholeRows.map((one) => one['key']))
    for (const field of ['me', 'contactGroups', 'contactSides', 'unread', 'workspaceId']) expect(short.body[field], field).toEqual(whole.body[field])
    let withALast = 0
    for (const [i, row] of shortRows.entries()) {
      const full = wholeRows[i] ?? {}
      expect(Object.keys(row).sort(), 'a short contact row keeps every field of the whole row').toEqual(Object.keys(full).sort())
      for (const field of Object.keys(full).filter((one) => one !== 'last')) expect(row[field], field).toEqual(full[field])
      const wholeLast = full['last'] as Record<string, unknown> | null
      if (wholeLast === null) {
        expect(row['last']).toBeNull()
        continue
      }
      withALast += 1
      const last = row['last'] as Record<string, unknown>
      const sentBy = wholeLast['sentBy'] as ParticipantRef | null | undefined
      const byTheOffice = sentBy != null && isMoleOffice(sentBy)
      expect(Object.keys(last).sort()).toEqual(byTheOffice ? [...DRAWN_OF_A_CONTACTS_LAST, 'office'].sort() : DRAWN_OF_A_CONTACTS_LAST)
      expect(last['id']).toBe(wholeLast['id'])
      expect(last['sentAt']).toBe(wholeLast['sentAt'])
      expect(last['body']).toBe(theFirstWords(wholeLast['body'] as string))
      if (byTheOffice) {
        const office = last['office'] as Record<string, unknown>
        for (const fact of THE_FACTS_OF_AN_OFFICE_LINE) expect(office[fact] ?? null, fact).toEqual(wholeLast[fact] ?? null)
      }
    }
    expect(withALast, 'no contact row with a last message, so no cut was compared').toBeGreaterThan(0)
    // THE ROW WHOSE LAST LINE IS THE LONG ONE: the whole body really is longer than the row carries, and the row has its first words.
    const at = wholeRows.findIndex((one) => (one['last'] as { body?: string } | null)?.body === A_LONG_BODY_TO_THE_OWNER)
    expect(at, 'the contact row of short-one is not listed with its long line').toBeGreaterThanOrEqual(0)
    expect(Array.from(A_LONG_BODY_TO_THE_OWNER).length).toBeGreaterThan(LAST_BODY_CHARACTERS)
    expect(((shortRows[at] ?? {})['last'] as { body: string }).body).toBe(`${Array.from(A_LONG_BODY_TO_THE_OWNER).slice(0, LAST_BODY_CHARACTERS).join('')}…`)
  })

  it('refuses a shape it does not know', async () => {
    const wrong = await get('/api/messages/contacts?shape=rows')
    expect(wrong.status).toBe(400)
  })
})

describe('GET /api/messages/circle', () => {
  it('answers who is reading and the contact list\'s own two numbers, and no rows', async () => {
    const contacts = await get('/api/messages/contacts')
    const circle = await get('/api/messages/circle')
    expect(contacts.status, contacts.text).toBe(200)
    expect(circle.status, circle.text).toBe(200)
    const unread = contacts.body['unread'] as { messages: number; groups: number }
    // THE CONTROL: neither half is zero, and the group holding two unread messages counts once.
    expect(unread.messages).toBeGreaterThanOrEqual(2)
    expect(unread.groups).toBe(1)
    expect(circle.body['me']).toEqual(contacts.body['me'])
    expect(circle.body['unread']).toEqual(unread)
    expect(circle.body['workspaceId']).toBe('default')
    // AND NONE OF THE ROWS the number is added up from.
    for (const field of ['contacts', 'contactGroups', 'contactSides']) expect(circle.body, field).not.toHaveProperty(field)
  })

  it('answers for an agent too, from its own deliveries', async () => {
    const contacts = await get('/api/messages/contacts', asAgent('short-one'))
    const circle = await get('/api/messages/circle', asAgent('short-one'))
    expect(circle.status, circle.text).toBe(200)
    expect(circle.body['unread']).toEqual(contacts.body['unread'])
    expect(circle.body['me']).toEqual(contacts.body['me'])
  })
})

describe('GET /api/messages?only=waiting-for-me&leads=1', () => {
  it('keeps only the entries that carry a lead, in the same order', async () => {
    const whole = await get('/api/messages?only=waiting-for-me&full=1')
    const offers = await get('/api/messages?only=waiting-for-me&leads=1&full=1')
    expect(offers.status, offers.text).toBe(200)
    const all = whole.body['messages'] as { id: string; lead: unknown }[]
    const kept = offers.body['messages'] as { id: string; lead: unknown }[]
    // THE CONTROL: some waiting entries carry no lead, so leaving them out is really leaving out.
    expect(all.some((one) => one.lead === null)).toBe(true)
    expect(kept.length).toBe(1)
    expect(kept.map((one) => one.id)).toEqual(all.filter((one) => one.lead !== null && typeof one.lead === 'object').map((one) => one.id))
    expect(kept[0]).toEqual(all.find((one) => one.id === kept[0]?.id))
  })

  it('refuses a leads value that is not exactly 1', async () => {
    const wrong = await get('/api/messages?only=waiting-for-me&leads=yes')
    expect(wrong.status).toBe(400)
  })
})

describe('the first words of a last line', () => {
  it('leaves a body no longer than the limit as it is, and never splits a character', () => {
    expect(theFirstWords('short')).toBe('short')
    const exactly = 'x'.repeat(LAST_BODY_CHARACTERS)
    expect(theFirstWords(exactly)).toBe(exactly)
    // THE LIMIT IS IN CHARACTERS: 600 emoji are 1,200 UTF-16 units and are not cut.
    const faces = '🙂'.repeat(LAST_BODY_CHARACTERS)
    expect(theFirstWords(faces)).toBe(faces)
    const cut = theFirstWords(`${faces}🙂`)
    expect(cut).toBe(`${faces}…`)
  })
})
