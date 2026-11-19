// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE CONTACTS ARE WORKED OUT FROM THE READER'S OWN MESSAGES, AND THE ANSWER IS THE SAME BYTE FOR BYTE.
 *
 * Option 3 of a decision, variant b of the wave 13j prototype: GET /api/messages/contacts reads only the part of the
 * message pool that can be in the reader's conversations (`theMessagesOfOneReader`), not every message of every
 * project, and gives the same answer.
 *
 * WHAT IS PROVED HERE, on an app built by the product:
 *
 *   1. THE SAME ANSWER. On a fixture with two projects, a group and its system lines, a contact
 *      group folded away, agents folded under the agent that started them, writers nobody
 *      registered, a line from Mole Office, a notice about a message (criterion M128), a routed
 *      message, a message stored under its writer's handle, a message with only a typed `from`
 *      line, one deleted message and deliveries marked queued, delivered and seen, the contacts
 *      worked out from the reader's part equal, as JSON text, the contacts worked out from the
 *      whole pool, which is what main's code used. That is checked for five readers: the person
 *      and four agents. It is checked for the library function and for the door's reply.
 *   2. THE COST. The door builds only the reader's messages: thirty more messages between two
 *      agents leave the number of messages the person's contacts read where it was, while the
 *      whole pool grows by thirty. On main this is red, because main read the whole pool.
 *
 * HOW THE NUMBER OF MESSAGES READ IS COUNTED. Every message the door builds has its delivery rows
 * read in one statement whose SQL carries one `?` per message id (`deliveriesOfMany`). So the
 * largest number of `?` in a delivery read during the call is the number of messages it built.
 * Statements are counted at the database.
 *
 * THREE-RUN PROOF (written in the commit message with the commands and log paths): CONTROL green.
 * MUTATION: in `theMessagesOfOneReader`, drop one of the kept kinds of message (the routed ones,
 * the notices, the typed `from` lines or the handle), and case 1 is red for the reader whose
 * conversation that message is in. RESTORE green.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, writeDataBypassingTheGate, type TestDb, theAnswerToAWriteInATestOffice } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

type Ref = { kind: 'person' | 'agent'; id: string }
type Mark = 'queued' | 'delivered' | 'seen'

let t: TestDb
let app: FastifyInstance
let M: typeof import('../src/server/lib/messages.ts')
let G: typeof import('../src/server/lib/groups.ts')
let W: typeof import('../src/shared/which-projects.ts')

const SECOND = 'second-project'
const PERSON_REF: Ref = { kind: 'person', id: THE_PERSON }
const asThePerson = (workspace = 'default'): Record<string, string> => ({
  'x-mole-office-workspace': workspace,
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
})
const asAgent = (handle: string, workspace = 'default'): Record<string, string> => ({
  'x-mole-office-workspace': workspace,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
})

/** The agents of the fixture, by handle, with the registry id each was given. */
const ids = new Map<string, string>()
const agent = (handle: string): Ref => {
  const id = ids.get(handle)
  if (id === undefined) throw new Error(`the fixture has no agent ${handle}`)
  return { kind: 'agent', id }
}

/** What the fixture built on purpose, so the cases can check it is really there. */
const built = { notice: '', routedNotice: '', underHandle: '', typedFrom: '' }

async function register(handle: string, headers: Record<string, string>): Promise<void> {
  const made = await app.inject({ method: 'POST', url: '/api/agents/started', headers, payload: { handle, name: handle, workArea: ['src'] } })
  expect(made.statusCode, made.body).toBe(201)
  const row = t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(handle) as { id: string } | undefined
  if (row === undefined) throw new Error(`no registry row for ${handle}`)
  ids.set(handle, row.id)
}

/** One message through the create door, giving back its record id. */
async function say(headers: Record<string, string>, to: Ref, body: string): Promise<string> {
  const payload = { kind: 'message', title: body, data: { body, to: [to] } }
  const made = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers,
    payload,
  })
  const fromAgentToAgent = headers['x-mole-office-actor-type'] === 'agent' && to.kind === 'agent'
  expect(made.statusCode, made.body).toBe(fromAgentToAgent ? 409 : theAnswerToAWriteInATestOffice(headers, payload))
  const id = (made.json() as { record: { id: string } }).record.id
  if (fromAgentToAgent) {
    const stored = t.api.getRecord(id)!
    const sender = ids.get(headers['x-mole-office-actor-id']!) ?? headers['x-mole-office-actor-id']!
    expect(stored.data['to']).toEqual([to])
    expect(stored.data['sentBy']).toEqual({ kind: 'agent', id: sender })
    const { routedOf } = await import('../src/shared/messages.ts')
    expect(routedOf(stored.data).some((route) => route.for.id === to.id)).toBe(true)
  }
  return id
}

/**
 * A MESSAGE IN A STATE NO DOOR WRITES TODAY, made from one the door wrote. Its `data` and its
 * delivery rows are replaced with the ones given. The contacts code reads such rows (old messages,
 * a database edited by hand), so the fixture has to hold them for the comparison to cover them.
 */
function rewrite(id: string, data: Record<string, unknown>, deliveries: { to: Ref; mark: Mark }[]): void {
  writeDataBypassingTheGate(t, id, data)
  t.client.sqlite.prepare('DELETE FROM message_delivery WHERE message_id = ?').run(id)
  for (const [n, one] of deliveries.entries()) {
    t.client.sqlite
      .prepare('INSERT INTO message_delivery (id, message_id, recipient_kind, recipient_id, mark, at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(`${id}-d${String(n)}`, id, one.to.kind, one.to.id, one.mark, '2026-09-26 10:00:00')
  }
}

/**
 * TAKE BACK THE ROUTING'S COPY. The fixture's agents have no running session, so the create door
 * copies a message between two of them to the person. This leaves the one
 * delivery row the writer asked for and the stored `data` as it was, without the copy.
 */
function keepBetweenTheTwo(id: string, to: Ref): void {
  const row = t.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(id) as { data: string }
  const data = JSON.parse(row.data) as Record<string, unknown>
  delete data['routed']
  rewrite(id, data, [{ to, mark: 'queued' }])
}

/** Set every delivery row of one message to one mark. */
function markAll(id: string, mark: Mark): void {
  t.client.sqlite.prepare('UPDATE message_delivery SET mark = ? WHERE message_id = ?').run(mark, id)
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  M = await import('../src/server/lib/messages.ts')
  G = await import('../src/server/lib/groups.ts')
  W = await import('../src/shared/which-projects.ts')

  const project = await app.inject({ method: 'POST', url: '/api/workspaces', payload: { id: SECOND, title: 'Second project' } })
  expect(project.statusCode, project.body).toBe(201)

  for (const handle of ['cc-alpha', 'cc-beta', 'cc-gamma', 'cc-quiet']) await register(handle, asThePerson())
  // AN AGENT STARTED BY AN AGENT, that has never written to the person: folded under its starter.
  await register('cc-child', asAgent('cc-alpha'))

  // PLAIN CONVERSATIONS, in both projects, some read and some not.
  const hello = await say(asThePerson(), agent('cc-alpha'), 'hello alpha')
  const reply = await say(asAgent('cc-alpha', SECOND), PERSON_REF, 'alpha answers from the second project')
  await say(asAgent('cc-alpha'), PERSON_REF, 'alpha says more')
  const fromGamma = await say(asAgent('cc-gamma'), PERSON_REF, 'gamma writes to the person')
  await say(asAgent('cc-beta'), agent('cc-alpha'), 'beta writes to alpha')
  // THE ROUTING COPIES A MESSAGE TO AN AGENT NOBODY IS RUNNING TO THE PERSON. The child's line is
  // kept between the two agents, so the child has still never spoken with the person.
  const fromChild = await say(asAgent('cc-child'), agent('cc-alpha'), 'child reports to alpha')
  keepBetweenTheTwo(fromChild, agent('cc-alpha'))
  markAll(hello, 'seen')
  markAll(reply, 'delivered')
  markAll(fromGamma, 'seen')

  // A GROUP, whose opening writes Mole Office's own lines, and a message in it.
  const opened = await app.inject({
    method: 'POST',
    url: '/api/groups',
    headers: asThePerson(),
    payload: {
      name: 'contacts comparison group',
      because: 'to have a group in the fixture',
      members: [
        { who: PERSON_REF, because: 'the person reads it' },
        { who: agent('cc-alpha'), because: 'it works here' },
        { who: agent('cc-beta'), because: 'it works here too' },
      ],
    },
  })
  expect(opened.statusCode, opened.body).toBe(201)
  const groupId = (opened.json() as { group: { id: string } }).group.id
  const inGroup = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: asAgent('cc-beta'),
    payload: { kind: 'message', title: 'in the group', data: { body: 'said in the group', toGroup: groupId } },
  })
  expect(inGroup.statusCode, inGroup.body).toBe(201)

  // A CONTACT GROUP FOLDED AWAY by the person.
  const folded = await app.inject({ method: 'PATCH', url: '/api/messages/contact-groups/agent', headers: asThePerson(), payload: { collapsed: true } })
  expect(folded.statusCode, folded.body).toBe(200)

  // WRITERS NOBODY REGISTERED: one stored under a sender no registry holds, one with only a typed line.
  const ghost = await say(asAgent('cc-gamma'), PERSON_REF, 'ghost')
  rewrite(ghost, { body: 'from a ghost', from: 'Ghost', sentBy: { kind: 'agent', id: 'cc-ghost-nobody-registered' }, to: [PERSON_REF] }, [
    { to: PERSON_REF, mark: 'queued' },
  ])
  const typedOnly = await say(asAgent('cc-gamma'), PERSON_REF, 'typed')
  rewrite(typedOnly, { body: 'only a typed line', from: 'Somebody Typed', to: [PERSON_REF] }, [{ to: PERSON_REF, mark: 'delivered' }])

  // A LINE FROM MOLE OFFICE to the person alone.
  const office = await say(asAgent('cc-gamma'), PERSON_REF, 'office')
  rewrite(office, { body: 'a line the office wrote', sentBy: { kind: 'agent', id: 'mole-office' }, to: [PERSON_REF] }, [
    { to: PERSON_REF, mark: 'queued' },
  ])

  // A NOTICE ABOUT A MESSAGE, criterion M128. It reached the person only, and it is drawn in the
  // conversation between alpha and the person, so it is in alpha's contacts with no delivery to alpha.
  const about = await say(asAgent('cc-alpha'), PERSON_REF, 'the message the notice is about')
  built.notice = await say(asAgent('cc-gamma'), PERSON_REF, 'notice')
  rewrite(built.notice, { body: 'a notice about that message', sentBy: { kind: 'agent', id: 'mole-office' }, aboutMessage: about, to: [PERSON_REF] }, [
    { to: PERSON_REF, mark: 'queued' },
  ])

  // A ROUTED MESSAGE whose writer addressed the person, with no delivery row to the person, and a
  // notice about it that reached only beta. The notice is in the person's conversation with beta.
  const routed = await say(asAgent('cc-beta'), agent('cc-gamma'), 'routed')
  rewrite(
    routed,
    {
      body: 'addressed to the person, copied to gamma',
      sentBy: agent('cc-beta'),
      to: [PERSON_REF],
      routed: [{ for: PERSON_REF, because: 'the person was away', to: agent('cc-gamma'), passedOver: [], line: 'copied to gamma' }],
    },
    [{ to: agent('cc-gamma'), mark: 'delivered' }],
  )
  built.routedNotice = await say(asAgent('cc-gamma'), agent('cc-beta'), 'routed notice')
  rewrite(
    built.routedNotice,
    { body: 'a notice about the routed message', sentBy: { kind: 'agent', id: 'mole-office' }, aboutMessage: routed, to: [agent('cc-beta')] },
    [{ to: agent('cc-beta'), mark: 'queued' }],
  )

  // A MESSAGE STORED UNDER ITS WRITER'S HANDLE rather than its registry id, from alpha to beta.
  built.underHandle = await say(asAgent('cc-alpha'), agent('cc-beta'), 'under the handle')
  rewrite(built.underHandle, { body: 'stored under the handle', sentBy: { kind: 'agent', id: 'cc-alpha' }, to: [agent('cc-beta')] }, [
    { to: agent('cc-beta'), mark: 'queued' },
  ])

  // A MESSAGE WITH NO STORED SENDER AND A TYPED LINE NAMING GAMMA, to beta.
  built.typedFrom = await say(asAgent('cc-gamma'), agent('cc-beta'), 'typed from')
  rewrite(built.typedFrom, { body: 'gamma by its typed line', from: 'cc-gamma', to: [agent('cc-beta')] }, [{ to: agent('cc-beta'), mark: 'seen' }])

  // A DELETED MESSAGE, which neither reading may draw.
  const gone = await say(asAgent('cc-quiet'), PERSON_REF, 'deleted')
  t.client.sqlite.prepare("UPDATE records SET deleted_at = '2026-09-26 10:00:00' WHERE id = ?").run(gone)
}, 120_000)

afterAll(async () => {
  await app.close()
  t.close()
})

/** The contacts and the circle's two numbers, worked out the way main's door did: from the whole pool. */
function fromTheWholePool(me: Ref, readBy: { type: string; id: string } | null = null): { contacts: string; unread: { messages: number; groups: number } } {
  const E = W.EVERY_PROJECT
  // `readBy` NAMES WHO ASKS AT THE DOOR, which since a decision answers from only the messages that reader may
  // read. The library is not asked by anybody and reads them all.
  const every = M.everyMessageOfTheProjects(E)
  const whole = readBy === null ? every : M.onlyTheMessagesThisReaderMayRead(M.theMessageReader(readBy), every)
  const contacts = M.contactsFor(me, M.everybodyRegistered(), E, whole, M.everyAgentById())
  const groups = G.groupsFor(me, E).map((one) => M.unreadInAGroup(one.id, me, E, whole))
  return {
    contacts: JSON.stringify(contacts),
    unread: { messages: contacts.reduce((sum, one) => sum + one.unread, 0), groups: groups.filter((n) => n > 0).length },
  }
}

const READERS: { label: string; who: () => Ref; headers: () => Record<string, string> }[] = [
  { label: 'the person', who: () => PERSON_REF, headers: () => asThePerson() },
  { label: 'alpha', who: () => agent('cc-alpha'), headers: () => asAgent('cc-alpha') },
  { label: 'beta', who: () => agent('cc-beta'), headers: () => asAgent('cc-beta') },
  { label: 'gamma', who: () => agent('cc-gamma'), headers: () => asAgent('cc-gamma') },
  { label: 'the folded child', who: () => agent('cc-child'), headers: () => asAgent('cc-child') },
]

describe('the contacts from the reader’s own messages equal the contacts from the whole pool', () => {
  it('holds the cases it claims to cover', () => {
    const E = W.EVERY_PROJECT
    const lastOf = (me: Ref, other: Ref): string | null =>
      M.contactsFor(me, M.everybodyRegistered(), E, M.everyMessageOfTheProjects(E)).find(
        (one) => one.who !== null && one.who.kind === other.kind && one.who.id === other.id,
      )?.last?.id ?? null
    // Each of these is a message that reaches its conversation by one kept kind alone.
    expect(lastOf(agent('cc-alpha'), PERSON_REF), 'the notice is alpha’s last line with the person').toBe(built.notice)
    expect(lastOf(PERSON_REF, agent('cc-beta')), 'the routed notice is the person’s last line with beta').toBe(built.routedNotice)
    expect(lastOf(agent('cc-alpha'), agent('cc-beta')), 'the message under the handle is alpha’s last line with beta').toBe(built.underHandle)
    expect(lastOf(agent('cc-gamma'), agent('cc-beta')), 'the typed line is gamma’s last line with beta').toBe(built.typedFrom)
    const person = M.contactsFor(PERSON_REF, M.everybodyRegistered(), E, M.everyMessageOfTheProjects(E))
    expect(person.filter((one) => one.unregistered !== null).length, 'two writers nobody registered').toBe(2)
    expect(person.some((one) => one.foldedUnder !== null), 'an agent folded under its starter').toBe(true)
    expect(fromTheWholePool(PERSON_REF).unread.groups, 'a group with something unread').toBe(1)
  })

  for (const reader of READERS) {
    it(`gives ${reader.label} the same contacts, from the library and from the door`, async () => {
      const me = reader.who()
      const expected = fromTheWholePool(me)
      const E = W.EVERY_PROJECT
      // THE LIBRARY, handed the reader's part of the pool.
      const everyone = M.everybodyRegistered()
      const part = M.theMessagesOfOneReader(me, everyone, E)
      expect(JSON.stringify(M.contactsFor(me, everyone, E, part)), 'contactsFor from the reader’s part').toBe(expected.contacts)
      // THE DOOR. Its rows carry the contact's key, where it sits and, since wave 13y round 91, whether its dot
      // says it is online as well; without those they are the rows the whole pool gave.
      const reply = await app.inject({ method: 'GET', url: '/api/messages/contacts', headers: reader.headers() })
      expect(reply.statusCode, reply.body).toBe(200)
      const body = reply.json() as { contacts: Record<string, unknown>[]; unread: unknown }
      for (const row of body.contacts) {
        const who = row.who as { kind: string } | null
        if (who?.kind === 'agent') expect(row.personalTags).toEqual([])
        else expect(row.personalTags).toBeUndefined()
      }
      const rows = body.contacts.map(({ key: _key, group: _group, at: _at, online: _online, personalTags: _personalTags, ...line }) => line)
      // THE DOOR ANSWERS FROM THE MESSAGES THIS READER MAY READ. For an agent that
      // leaves out a notice addressed only to the person and a message whose stored sender is empty, so
      // the door is compared with the whole pool read the same way.
      const headers = reader.headers()
      const atTheDoor = fromTheWholePool(me, { type: headers['x-mole-office-actor-type']!, id: headers['x-mole-office-actor-id']! })
      expect(JSON.stringify(rows), 'the door’s rows').toBe(JSON.stringify(JSON.parse(atTheDoor.contacts)))
      expect(body.unread, 'the circle’s two numbers').toEqual(atTheDoor.unread)
      // AND NO NUMBER MOVES: every unread count is of rows addressed to the reader, who is a party to each.
      expect(body.unread, 'the circle’s two numbers, as the whole pool counts them').toEqual(expected.unread)
    })
  }
})

describe('the contacts door reads only the reader’s messages', () => {
  it('builds no more messages for the person when two agents talk more between themselves', async () => {
    const before = await messagesTheDoorBuilt()
    const poolBefore = M.everyMessageOfTheProjects(W.EVERY_PROJECT).length
    for (let i = 0; i < 30; i++) {
      keepBetweenTheTwo(await say(asAgent('cc-beta'), agent('cc-gamma'), `between agents ${String(i)}`), agent('cc-gamma'))
    }
    const handedToThePerson = t.client.sqlite
      .prepare("SELECT count(*) AS n FROM message_delivery d JOIN records r ON r.id = d.message_id WHERE r.title LIKE 'between agents %' AND d.recipient_kind = 'person'")
      .get() as { n: number }
    expect(handedToThePerson.n, 'none of the thirty reached the person').toBe(0)
    expect(M.everyMessageOfTheProjects(W.EVERY_PROJECT).length, 'the whole pool grew by thirty').toBe(poolBefore + 30)
    const after = await messagesTheDoorBuilt()
    expect(before, 'the door built some messages').toBeGreaterThan(0)
    expect(after, `the door built ${String(before)} messages, then ${String(after)}`).toBe(before)
  })
})

/** How many messages one call of the contacts door built, as the person: see the header. */
async function messagesTheDoorBuilt(): Promise<number> {
  const sqlite = t.client.sqlite as unknown as { prepare: (sql: string) => unknown }
  const original = sqlite.prepare
  const seen: string[] = []
  sqlite.prepare = function (this: unknown, sql: string) {
    seen.push(sql)
    return original.call(this, sql)
  }
  try {
    const reply = await app.inject({ method: 'GET', url: '/api/messages/contacts', headers: asThePerson() })
    expect(reply.statusCode, reply.body).toBe(200)
  } finally {
    sqlite.prepare = original
  }
  const deliveryReads = seen.filter((sql) => /from "message_delivery"/.test(sql) && /"message_id" in \(/.test(sql))
  return Math.max(0, ...deliveryReads.map((sql) => (sql.match(/\?/g) ?? []).length))
}
