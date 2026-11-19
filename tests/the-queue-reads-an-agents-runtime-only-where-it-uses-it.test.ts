// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE QUEUE READS AN AGENT'S RUNTIME ONLY WHERE IT USES IT (wave 13y round 48).
 *
 * `readParticipant` builds a whole agent, and building one runs the kept statement that reads the
 * runtime off the agent's newest record. One GET /api/worker/queue on a made-up office of 4,685
 * queued rows ran that statement 18,207 times. Only 961 of those runs used the runtime: the
 * queue's own read of each recipient. The rest came from three readers that wanted one other column
 * of the same row:
 *
 * - `isAnInspector` (lib/notices.ts) wants the role, and was asked 8,319 times;
 * - the queue door's sender words want the sender's `addressAs`, and were read once per row, 4,685
 *   times for 943 senders;
 * - the @ reading's members (lib/groups.ts) want a handle and a name, and read each member twice,
 *   2,121 times each.
 *
 * The role is now read through the reader the card readers use, the members are read once each for
 * the whole pool, and the queue door reads each stored sender once per answer.
 *
 * Seven cases, on an office of made-up rows this file builds:
 *
 * 1. THE ANSWER'S MEANING. Delivery identities and order come from the fixture's rows. Runtime,
 *    model, variant, sender, group and conversation readings agree with their individual readers.
 *    Additive metadata needs no snapshot update. The case also checks the three readers:
 *    an inspector's messages in a conversation past the allowance are not held while the other
 *    side's are, and a group an inspector opened is not held while a group a worker opened is.
 * 2. THE SENDER WORDS. Each row's two sender fields are what the per-message readers
 *    `whoSentItInWords` and `howTheSenderAsksToBeAddressedInWords` answer for that row's sender,
 *    for every sort of sender: an agent by id, a person, an agent by a stored handle, a retired one,
 *    a handle two agents bear, an id nobody has, a person nobody is, and no sender at all.
 * 3. THE MEMBERS. The @ reading's members of every group are what `handleOf` and `nameOf` answer
 *    for each member, in the same order, for a person, an agent whose name is not its handle, and a
 *    member no row answers for.
 * 4. THE ROLE. `isAnInspector` answers as before for an inspector, a worker, a row with no role, an
 *    id nobody has, a person, the office and no sender.
 * 6. THE ONE DIFFERENCE, CHOSEN. An agent row with a broken picture column makes `readParticipant`
 *    throw, and `isAnInspector` no longer does: it reads only the role, as the card readers have since
 *    round 44. Red before the change, when the check threw.
 *
 * Every row here is synthetic, in this file's own temporary test database.
 */
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, expect, it } from 'vitest'

import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { isUrgent, nobodyIsAnsweringAsIt, urgentAtTheFront, writtenInOf } from '../src/shared/messages.ts'
import type { ParticipantRef } from '../src/shared/participants.ts'
import type { Waiting } from '../src/server/lib/worker.ts'
import type { TheSenderOfAHandOver } from '../src/server/lib/who-sent-it.ts'
type Row = Waiting & TheSenderOfAHandOver
import { mergedEnvironment } from '../src/config/settings.mjs'
import { buildTheChatOffice, type Shape } from './the-chat-office-of-the-live-shape.ts'

/** How many messages agents may write in one conversation before a person has to, set for this file and put back. */
const ALLOWED = '3'

const SHAPE: Shape = {
  agents: 60,
  retired: 20,
  theConversation: 40,
  otherContacts: 10,
  otherPersonMessages: 40,
  betweenAgents: 900,
  groups: 6,
  groupsWithThePerson: 3,
  membersPerGroup: 6,
  groupMessages: 60,
  officeLines: 40,
  sessions: 60,
  otherRecords: 50,
}
const THE_MESSAGE_WORKER = {
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'mole-office/the-message-worker',
}

let t: TestDb
let app: FastifyInstance
let hopsBefore: string | undefined
// THE SERVER'S OWN READERS, loaded after the test database is open: loading them opens a database.
let groups: typeof import('../src/server/lib/groups.ts')
let whoSentIt: typeof import('../src/server/lib/who-sent-it.ts')
let notices: typeof import('../src/server/lib/notices.ts')
let participants: typeof import('../src/server/lib/participants.ts')
/** Every statement executed while `counting` is set, by its SQL text. */
let counting = false
const ran: string[] = []

const agent = (id: string): ParticipantRef => ({ kind: 'agent', id })
const person = (id: string): ParticipantRef => ({ kind: 'person', id })
/** The id of the made-up agent with this handle. */
const idOf = (handle: string): string => (t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ? ORDER BY rowid LIMIT 1').get(handle) as { id: string }).id

/** The rows this file adds to the made-up office, with fixed ids and stamps, so two builds give the same answer. */
const added = {
  inspector: '',
  worker: '',
  inspectorsGroup: 'r48-group-an-inspector-opened',
  workersGroup: 'r48-group-a-worker-opened',
  oddMembersGroup: 'r48-group-of-odd-members',
}

/** Write the rows this file adds, straight into the tables, as the office builder writes its own. */
function addTheRowsThisFileNeeds(): void {
  const sqlite = t.client.sqlite
  let n = 0
  const stamp = (): string => {
    const at = new Date(2026, 8, 1, 8, n, 0)
    n++
    const two = (v: number): string => String(v).padStart(2, '0')
    return `${String(at.getFullYear())}-${two(at.getMonth() + 1)}-${two(at.getDate())} ${two(at.getHours())}:${two(at.getMinutes())}:00`
  }
  const addRecord = sqlite.prepare(
    `insert into records (id, workspace_id, owner_id, created_at, updated_at, kind, title, summary, data, deleted_at, origin)
     values (?, 'message-centre', 'owner', ?, ?, 'message', ?, null, ?, null, 'fixture')`,
  )
  const addDelivery = sqlite.prepare(
    `insert into message_delivery (id, message_id, recipient_kind, recipient_id, mark, at, because, run, inferred_by)
     values (?, ?, ?, ?, ?, ?, null, null, null)`,
  )
  const addGroup = sqlite.prepare(
    `insert into groups (id, workspace_id, name, opened_by_kind, opened_by_id, opened_because, opened_at, about)
     values (?, 'default', ?, ?, ?, 'made up for a test', ?, null)`,
  )
  const addMember = sqlite.prepare(
    `insert into group_members (id, group_id, member_kind, member_id, joined_at, joined_because, left_at)
     values (?, ?, ?, ?, ?, 'made up for a test', null)`,
  )
  let m = 0
  const machine = { how: 'this machine', machine: 'made-up-machine' }
  /** One message with a delivery row for each recipient. `sentBy` undefined leaves the field out, as a message nobody recorded the sender of. */
  const message = (sentBy: unknown, to: readonly ParticipantRef[], toGroup: string | null, mark: string): void => {
    const id = `r48-message-${String(m++).padStart(4, '0')}`
    const at = stamp()
    const data = {
      body: 'These words were made up for a test and say nothing.',
      ...(toGroup === null ? { to } : { toGroup }),
      writtenIn: { project: 'default' },
      writtenFrom: machine,
      ...(sentBy === undefined ? {} : { sentBy }),
    }
    addRecord.run(id, at, at, toGroup === null ? 'a made-up message' : 'in a group', JSON.stringify(data))
    for (const [i, one] of to.entries()) addDelivery.run(`${id}-to-${String(i)}`, id, one.kind, one.id, mark, at)
  }
  const group = (id: string, by: ParticipantRef, members: readonly ParticipantRef[]): void => {
    const at = stamp()
    addGroup.run(id, id, by.kind, by.id, at)
    for (const [i, one] of members.entries()) addMember.run(`${id}-member-${String(i)}`, id, one.kind, one.id, at)
  }

  const inspector = idOf('made-up-agent-3')
  const worker = idOf('made-up-agent-4')
  const second = idOf('made-up-agent-5')
  const third = idOf('made-up-agent-6')
  const reader = idOf('made-up-agent-7')
  added.inspector = inspector
  added.worker = worker
  sqlite.prepare(`UPDATE agents SET role = 'inspector' WHERE id = ?`).run(inspector)
  // A ROW THAT NAMES NO ROLE, which reads as a worker.
  sqlite.prepare('UPDATE agents SET role = NULL WHERE id = ?').run(idOf('made-up-agent-9'))
  // AN AGENT WHOSE NAME IS NOT ITS HANDLE, AND WHO HAS SAID HOW TO BE ADDRESSED; the person's own address is set too.
  sqlite.prepare(`UPDATE agents SET name = 'A made-up name', address_name = 'Five', address_title = 'made-up title' WHERE id = ?`).run(second)
  sqlite.prepare(`UPDATE people SET address_second_person = 'you' WHERE id = ?`).run(THE_PERSON)
  // A HANDLE TWO RETIRED AGENTS BEAR, so a message holding it names nobody.
  sqlite
    .prepare(
      `INSERT INTO agents (id, name, handle, avatar_asset_id, retired, retired_at, retired_because, created_at, started_by_kind, started_by_id, role, home_world, home_installation, citizen_since)
       SELECT 'r48-second-bearer-of-a-handle', name, handle, avatar_asset_id, 1, retired_at, retired_because, created_at, started_by_kind, started_by_id, role, home_world, home_installation, citizen_since
       FROM agents WHERE handle = 'made-up-agent-50'`,
    )
    .run()

  // A PAIR PAST THE ALLOWANCE: the worker writes four times and the inspector three, every one still queued.
  for (let i = 0; i < 7; i++) {
    if (i % 2 === 0) message(agent(worker), [agent(inspector)], null, 'queued')
    else message(agent(inspector), [agent(worker)], null, 'queued')
  }
  // TWO GROUPS PAST THE ALLOWANCE, one an inspector opened and one a worker opened, each with four queued lines.
  group(added.inspectorsGroup, agent(inspector), [agent(inspector), agent(second), agent(third)])
  group(added.workersGroup, agent(worker), [agent(worker), agent(second), agent(third)])
  for (const [id, members] of [
    [added.inspectorsGroup, [inspector, second, third]],
    [added.workersGroup, [worker, second, third]],
  ] as const) {
    for (let i = 0; i < 4; i++) {
      const from = i % 2 === 0 ? second : third
      message(agent(from), members.filter((one) => one !== from).map(agent), id, 'queued')
    }
  }
  // A GROUP OF MEMBERS THE REGISTRIES DO NOT ALL ANSWER FOR, with one line so the pool names it.
  group(added.oddMembersGroup, person(THE_PERSON), [person(THE_PERSON), agent(second), agent('r48-no-such-agent'), person('r48-no-such-person')])
  message(person(THE_PERSON), [agent(second), agent('r48-no-such-agent'), person('r48-no-such-person')], added.oddMembersGroup, 'seen')
  // EVERY SORT OF SENDER, two queued messages each to one reader.
  const senders: unknown[] = [
    person(THE_PERSON),
    agent(second),
    agent('made-up-agent-8'),
    agent('made-up-agent-45'),
    agent('made-up-agent-50'),
    agent('r48-nobody-has-this-id'),
    person('r48-nobody-by-this-name'),
    undefined,
  ]
  for (const one of senders) for (let i = 0; i < 2; i++) message(one, [agent(reader)], null, 'queued')
}

beforeAll(async () => {
  hopsBefore = process.env['MOLE_OFFICE_AGENT_HOPS']
  process.env['MOLE_OFFICE_AGENT_HOPS'] = ALLOWED
  t = await freshDb()
  const sqlite = t.client.sqlite as unknown as { prepare: (sql: string) => Record<string, unknown> }
  const prepare = sqlite.prepare
  // THE COUNTER GOES IN BEFORE THE SERVER IS BUILT, so every statement it prepares is wrapped.
  sqlite.prepare = function (this: unknown, text: string) {
    const statement = prepare.call(this, text)
    for (const method of ['get', 'all', 'run', 'iterate'] as const) {
      const original = statement[method] as ((...args: unknown[]) => unknown) | undefined
      if (original === undefined) continue
      statement[method] = function (this: unknown, ...args: unknown[]) {
        if (counting) ran.push(text)
        return original.apply(this, args)
      }
    }
    return statement
  }
  app = (await apiApp()).app
  await app.ready()
  groups = await import('../src/server/lib/groups.ts')
  whoSentIt = await import('../src/server/lib/who-sent-it.ts')
  notices = await import('../src/server/lib/notices.ts')
  participants = await import('../src/server/lib/participants.ts')
  buildTheChatOffice(t.client.sqlite, THE_PERSON, SHAPE)
  addTheRowsThisFileNeeds()
}, 120_000)
afterAll(async () => {
  await app.close()
  t.close()
  if (hopsBefore === undefined) delete process.env['MOLE_OFFICE_AGENT_HOPS']
  else process.env['MOLE_OFFICE_AGENT_HOPS'] = hopsBefore
})

async function theQueue(): Promise<{ body: string; rows: Row[] }> {
  const reply = await app.inject({ method: 'GET', url: '/api/worker/queue?full=1', headers: THE_MESSAGE_WORKER })
  expect(reply.statusCode, reply.body).toBe(200)
  return { body: reply.body, rows: (reply.json() as { queue: Row[] }).queue }
}


it('the queue preserves delivery order and each individual reading, and reaches what the three readers decide', async () => {
  const { rows } = await theQueue()
  const worker = await import('../src/server/lib/worker.ts')
  const models = await import('../src/server/lib/run-models.ts')
  const { gatePosition } = await import('../src/config/settings.mjs')
  // Read the authored fixture inputs independently of the queue's optimized readers. Every message
  // in this fixture belongs to this project; no recipient is asleep and every session has finished.
  const deliveries = t.client.sqlite.prepare(
    `SELECT r.id AS messageId, d.recipient_id AS recipientId, r.created_at AS sentAt, r.data
     FROM message_delivery d JOIN records r ON r.id=d.message_id
     WHERE d.mark='queued' AND d.recipient_kind='agent' AND r.deleted_at IS NULL
     ORDER BY r.created_at, r.rowid`,
  ).all() as { messageId: string; recipientId: string; sentAt: string; data: string }[]
  const expected = urgentAtTheFront(deliveries.map(delivery => {
    const data = JSON.parse(delivery.data) as Record<string, unknown>
    return { ...delivery, data, urgent: isUrgent(data) }
  }))
  expect(rows.map(row => [row.messageId, row.to])).toEqual(expected.map(row => [row.messageId, agent(row.recipientId)]))
  const recipients = new Map([...new Set(expected.map(one => one.recipientId))].map(recipientId => {
    const registry = participants.readParticipant(agent(recipientId))
    const runtime = registry !== null && 'runtime' in registry ? registry.runtime : null
    const chosen = models.theModelARunGets({ place: 'conversation', agentId: recipientId, runtime }, mergedEnvironment())
    const handle = registry !== null && 'handle' in registry ? registry.handle : recipientId
    return [recipientId, { registry, chosen, handle, resume: worker.conversationToPickUp(recipientId, 'default') }] as const
  }))
  for (const [i, row] of rows.entries()) {
    const original = expected[i]!
    const { registry, chosen, handle, resume } = recipients.get(original.recipientId)!
    const sentBy = (original.data['sentBy'] as ParticipantRef | undefined) ?? null
    const toGroup = typeof original.data['toGroup'] === 'string' ? original.data['toGroup'] : null
    const needsNoRun = worker.whyThisMessageNeedsNoRun(sentBy)
    expect(row, original.messageId).toMatchObject({
      workspaceId: 'default', writtenIn: writtenInOf(original.data), sentAt: original.sentAt,
      sentBy, handle, urgent: original.urgent,
      runtime: chosen.runtime,
      model: models.theOfficeChoseIt(chosen) ? chosen.model : null,
      variant: models.theOfficeChoseIt(chosen) ? chosen.variant : null,
      retired: registry !== null && 'retired' in registry ? registry.retired : false,
      fromGroup: whoSentIt.theGroupForAHandOver(toGroup),
      resume, hops: worker.hopsBehind(original.messageId), needsNoRun,
      conversationIsWaiting: worker.whyThisConversationIsWaiting({ sentBy, toGroup }, row.to, 'default'),
      runningAlready: null, runningAlreadySays: null, heldByALiveSession: null, heldByAReview: null,
      nobodyIsAnsweringAsIt: needsNoRun !== null || resume !== null || gatePosition('wait-for-the-persons-start') !== 'block'
        ? null : nobodyIsAnsweringAsIt(handle),
      noticeBatchAvailable: true,
    })
  }
  // THE INSPECTOR'S LINES ARE NOT HELD, and the worker's in the same conversation are.
  const between = (from: string, to: string) => rows.filter((one) => one.sentBy?.id === from && one.to.id === to && one.fromGroup === null)
  expect(between(added.inspector, added.worker)).toHaveLength(3)
  expect(between(added.inspector, added.worker).every((one) => one.conversationIsWaiting === null)).toBe(true)
  expect(between(added.worker, added.inspector)).toHaveLength(4)
  expect(between(added.worker, added.inspector).every((one) => one.conversationIsWaiting !== null)).toBe(true)
  // A GROUP AN INSPECTOR OPENED IS NOT HELD, and one a worker opened is.
  const inGroup = (id: string) => rows.filter((one) => one.fromGroup?.id === id)
  expect(inGroup(added.inspectorsGroup)).toHaveLength(8)
  expect(inGroup(added.inspectorsGroup).every((one) => one.conversationIsWaiting === null)).toBe(true)
  expect(inGroup(added.workersGroup).some((one) => one.conversationIsWaiting !== null)).toBe(true)
}, 60_000)

it("each row's sender words are what the per-message readers answer, for every sort of sender", async () => {
  const { rows } = await theQueue()
  for (const one of rows) {
    expect(one.whoSentIt, one.messageId).toBe(whoSentIt.whoSentItInWords(one.sentBy))
    expect(one.howToAddressTheSender, one.messageId).toBe(whoSentIt.howTheSenderAsksToBeAddressedInWords(one.sentBy))
  }
  // EVERY SORT WAS THERE, more than once each.
  const found = new Map<string, number>()
  for (const one of rows) {
    const read = whoSentIt.theSenderAsRead(one.sentBy)
    const sort = read.found === 'an-agent' && read.retired ? 'a retired agent' : read.found
    found.set(sort, (found.get(sort) ?? 0) + 1)
  }
  for (const sort of ['an-agent', 'a retired agent', 'a-person', 'nobody-could-be-named', 'nobody-was-recorded']) {
    expect(found.get(sort) ?? 0, sort).toBeGreaterThanOrEqual(2)
  }
  expect(rows.filter((one) => one.howToAddressTheSender !== null && one.sentBy?.kind === 'agent').length).toBeGreaterThanOrEqual(2)
  expect(rows.filter((one) => one.howToAddressTheSender !== null && one.sentBy?.kind === 'person').length).toBeGreaterThanOrEqual(2)
  const stored = rows.map((one) => one.sentBy)
  expect(stored.filter((one) => one?.id === 'made-up-agent-8')).toHaveLength(2)
  expect(stored.filter((one) => one?.id === 'r48-nobody-has-this-id')).toHaveLength(2)
  expect(stored.filter((one) => one?.kind === 'person' && one.id === 'r48-nobody-by-this-name')).toHaveLength(2)
}, 60_000)

it("the @ reading's members are what handleOf and nameOf answer for each member, in the same order", () => {
  const ids = (t.client.sqlite.prepare('SELECT id FROM groups ORDER BY id').all() as { id: string }[]).map((one) => one.id)
  const many = groups.mentionableMembersOfMany(ids)
  let members = 0
  for (const id of ids) {
    const expected = groups.membersOf(id).map((one) => ({ who: one.who, handle: groups.handleOf(one.who), name: groups.nameOf(one.who) }))
    expect(many.get(id) ?? [], id).toEqual(expected)
    expect(groups.mentionableMembersOf(id), id).toEqual(expected)
    members += expected.length
  }
  expect(members).toBeGreaterThan(30)
  const odd = many.get(added.oddMembersGroup) ?? []
  expect(odd.map((one) => one.who.kind)).toEqual(['person', 'agent', 'agent', 'person'])
  expect(odd[1]!.name).toBe('A made-up name')
  expect(odd[1]!.handle).toBe('made-up-agent-5')
  expect(odd[2]).toEqual({ who: agent('r48-no-such-agent'), handle: 'r48-no-such-agent', name: 'r48-no-such-agent' })
  expect(odd[3]).toEqual({ who: person('r48-no-such-person'), handle: 'r48-no-such-person', name: 'r48-no-such-person' })
})

it('isAnInspector answers as before for every sort of sender', () => {
  expect(notices.isAnInspector(agent(added.inspector))).toBe(true)
  expect(notices.isAnInspector(agent(added.worker))).toBe(false)
  expect(notices.isAnInspector(agent(idOf('made-up-agent-9')))).toBe(false)
  expect(notices.isAnInspector(agent('r48-nobody-has-this-id'))).toBe(false)
  expect(notices.isAnInspector(agent('made-up-agent-3')), 'a handle is not an id').toBe(false)
  expect(notices.isAnInspector(person(THE_PERSON))).toBe(false)
  expect(notices.isAnInspector(agent('mole-office'))).toBe(false)
  expect(notices.isAnInspector(null)).toBe(false)
})


it('a broken picture column makes the whole participant throw, and not the role check', () => {
  const id = 'r48-broken-picture'
  t.client.sqlite
    .prepare(
      `INSERT INTO agents (id, name, handle, avatar_asset_id, retired, retired_at, retired_because, created_at, started_by_kind, started_by_id, role, home_world, home_installation, citizen_since, pixel_appearance)
       SELECT ?, ?, ?, avatar_asset_id, 0, null, null, created_at, started_by_kind, started_by_id, 'inspector', home_world, home_installation, citizen_since, '{not json'
       FROM agents WHERE id = ?`,
    )
    .run(id, id, id, added.inspector)
  try {
    expect(() => participants.readParticipant(agent(id))).toThrow()
    expect(notices.isAnInspector(agent(id))).toBe(true)
    expect(participants.theCardOfAgent(id)).toBe('inspector')
  } finally {
    t.client.sqlite.prepare('DELETE FROM agents WHERE id = ?').run(id)
  }
})

