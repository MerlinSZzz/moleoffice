// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE CHAT FOLDS STARTED AGENTS UNDER THEIR STARTER. A CONVERSATION BETWEEN AGENTS DOES NOT MOVE THE
 * CIRCLE, AND A MESSAGE ROUTED FROM AN AGENT THE OWNER OWNS WAITS, SO IT DOES NOT MOVE IT EITHER.
 *
 * Criterion P10 of design/permissions/ACCEPTANCE.md, on point (d): not every agent in the message pool
 * reached the contacts or was registered, and the message-pool plan that followed was agreed.
 * *The owner's contact list holds the secretary and every agent the owner has spoken to; the rest
 * are folded, one press away. Measured before and after: folding is a change to what is DRAWN.*
 *
 * WHY THE COUNT MOVES, AND WHEN IT DOES NOT. Decision murJ5IMWDOXR reads criterion M32: a letter
 * between two agents that reach each other, or whose routing stops at a reachable supervisor or
 * secretary, never counts toward the circle, because the owner takes no part in it. A message to an
 * agent nothing holds goes up that agent's ownership tree, and the routing stops at the first owner
 * that can receive it. When the recorded owner it comes to is a person, the message waits with its
 * addressee. No routed copy reaches the owner, so the circle moves only for a letter written to the
 * owner. So this file measures three things: a folded conversation between reachable agents leaves
 * the number alone, a letter an agent writes to the owner moves it by one, and a message routed from
 * an agent the owner owns leaves it alone and carries the line that says it waits.
 */

import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { spawn, type ChildProcess } from 'node:child_process'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

let t: TestDb
let app: FastifyInstance
/** Every real child this file started, stopped by group afterwards. */
const started: ChildProcess[] = []

const AS_THE_PERSON = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const asAgent = (id: string): Record<string, string> => ({
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': id,
})
/** The name the person registers the quiet addressee under, which its routed line names it by. */
const QUIET_ONE_NAME = 'Quiet One'

async function register(headers: Record<string, string>, body: Record<string, unknown>): Promise<number> {
  const reply = await app.inject({ method: 'POST', url: '/api/agents/started', headers, payload: body })
  return reply.statusCode
}

/** The registry id of one agent registered through the door, found by its handle. */
function theRegistryIdOf(handle: string): string {
  const row = t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(handle) as
    | { id: string }
    | undefined
  if (row === undefined) throw new Error(`no registry row for ${handle}`)
  return row.id
}

/** A running session record serving one agent of this fixture. */
function aSessionFor(agentId: string): string {
  return t.api.createRecord({
    workspaceId: 'default',
    kind: 'session',
    title: 'a run of this agent',
    data: { state: 'running', runtime: 'claude-code', servingAgent: agentId },
    actor: t.api.HUMAN,
  }).id
}

/** A real process of this test's own, in its own group, registered against the run. */
async function aLiveProcessFor(sessionRecordId: string): Promise<void> {
  const child = spawn('sleep', ['120'], { detached: true, stdio: 'ignore' })
  child.unref()
  started.push(child)
  expect(child.pid, 'the child did not start, so nothing below is measuring anything').toBeDefined()
  const { registerResource } = await import('../src/server/lib/resources.ts')
  registerResource({
    workspaceId: 'default',
    sessionRecordId,
    type: 'process',
    key: String(child.pid),
    actor: t.api.HUMAN,
  })
}

/**
 * A running session plus a live process: the chat's answering mark reads this as a reachable agent.
 *
 * The same shape tests/a-sandbox-run-counts-as-going.test.ts builds, so a folded conversation is one
 * between agents that can be reached and the routing has no reason to hand it to the owner.
 */
async function makeReachable(handle: string): Promise<void> {
  await aLiveProcessFor(aSessionFor(theRegistryIdOf(handle)))
}

async function contacts(): Promise<Record<string, unknown>[]> {
  const reply = await app.inject({ method: 'GET', url: '/api/messages/contacts', headers: AS_THE_PERSON })
  expect(reply.statusCode).toBe(200)
  return (reply.json() as { contacts: Record<string, unknown>[] }).contacts
}

/**
 * The contact row for one agent, found by its handle. A contact row names the agent by its registry
 * id, which is not the handle, so the handle is looked up first.
 */
async function contactFor(handle: string): Promise<Record<string, unknown>> {
  const id = theRegistryIdOf(handle)
  const one = (await contacts()).find((row) => (row['who'] as { id?: string } | null)?.id === id)
  expect(one, `no contact row for ${handle}`).toBeDefined()
  return one as Record<string, unknown>
}

/** The stored reference to one agent: its registry id, found by its handle. */
function agentRef(handle: string): { kind: 'agent'; id: string } {
  return { kind: 'agent', id: theRegistryIdOf(handle) }
}

/** The number on the owner's circle, counted the way the circle counts it. */
async function theCircle(): Promise<number> {
  const reply = await app.inject({ method: 'GET', url: '/api/messages/contacts', headers: AS_THE_PERSON })
  const said = reply.json() as { contacts: { unread: number }[] }
  return said.contacts.reduce((sum, one) => sum + one.unread, 0)
}

async function write(headers: Record<string, string>, to: { kind: string; id: string }[], body: string): Promise<void> {
  const reply = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers,
    payload: { kind: 'message', title: body.slice(0, 40), data: { to, body } },
  })
  expect(reply.statusCode, reply.body).toBe(201)
}

/** A send answered with the status the case expects, and the data of its stored record, read back from the table. */
async function sendWithTheReply(
  headers: Record<string, string>,
  to: { kind: string; id: string }[],
  body: string,
  expectedStatus: number,
): Promise<{ messageId: string; stored: Record<string, unknown> }> {
  const reply = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers,
    payload: { kind: 'message', title: body.slice(0, 40), data: { to, body } },
  })
  expect(reply.statusCode, reply.body).toBe(expectedStatus)
  const messageId = (reply.json() as { record: { id: string } }).record.id
  const row = t.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(messageId) as { data: string }
  return { messageId, stored: JSON.parse(row.data) as Record<string, unknown> }
}

/** How many delivery rows one message has to one recipient, counted in the table. */
function deliveriesTo(messageId: string, kind: string, recipientId: string): number {
  const row = t.client.sqlite.prepare(
    'SELECT count(*) AS n FROM message_delivery WHERE message_id = ? AND recipient_kind = ? AND recipient_id = ?',
  ).get(messageId, kind, recipientId) as { n: number }
  return row.n
}

beforeAll(async () => {
  t = await freshDb()
  const built = await apiApp()
  app = built.app
  await app.ready()
  await register(AS_THE_PERSON, { handle: THE_TEST_OFFICES_SECRETARY.handle, name: THE_TEST_OFFICES_SECRETARY.name, role: 'secretary' })
  await register(asAgent(THE_TEST_OFFICES_SECRETARY.handle), { handle: 'sup-one', name: 'Supervisor One', role: 'supervisor' })
  await register(asAgent('sup-one'), { handle: 'w-one', name: 'Worker One', role: 'worker' })
  await register(asAgent('sup-one'), { handle: 'w-two', name: 'Worker Two', role: 'worker' })
  // A FOLDED CONVERSATION IS ONE BETWEEN AGENTS THAT CAN BE REACHED. sup-one and w-two, the two ends
  // of the conversation measured below, each get a running session and a live process of this test's
  // own. w-one is left with nothing answering, which no case here asks about.
  await makeReachable('sup-one')
  await makeReachable('w-two')
  // THE ADDRESSEE THE OWNER OWNS. The person registered this one, so its recorded owner is the person.
  // Nothing is answering as it and nothing holds it.
  await register(AS_THE_PERSON, { handle: 'quiet-one', name: QUIET_ONE_NAME, role: 'worker' })
}, 60_000)

afterAll(async () => {
  for (const child of started) {
    try {
      if (child.pid !== undefined) process.kill(-child.pid, 'SIGKILL')
    } catch {
      // Already gone, which is not a failure of anything this file is testing.
    }
  }
  await app.close()
  t.close()
})

describe('who is folded and who is a contact of their own', () => {
  it('folds a worker under the supervisor that started it', async () => {
    expect((await contactFor('w-one'))['foldedUnder']).toEqual(agentRef('sup-one'))
    expect((await contactFor('w-two'))['foldedUnder']).toEqual(agentRef('sup-one'))
  })

  it('folds the supervisor under the secretary that started it', async () => {
    expect((await contactFor('sup-one'))['foldedUnder']).toEqual(agentRef(THE_TEST_OFFICES_SECRETARY.handle))
  })

  it('never folds the secretary, because the person appoints it themselves', async () => {
    expect((await contactFor(THE_TEST_OFFICES_SECRETARY.handle))['foldedUnder']).toBeNull()
  })

  // A WRITER NOBODY REGISTERED IS NEVER FOLDED EITHER, and there is no case for it here. Folding
  // reads a registry row for the starter, and such a writer has none — so `foldedUnder` cannot be
  // anything but null. Building the state costs more than the claim is worth: since criterion M59 an
  // unregistered writer cannot address the owner at all, so the only rows of that shape in the owner's corpus are
  // ones written before that rule. A test that iterated an empty list would prove nothing.

})

describe('an agent the owner has spoken with stops being folded', () => {
  it('becomes a contact of their own once it writes to the owner', async () => {
    expect((await contactFor('w-one'))['foldedUnder']).toEqual(agentRef('sup-one'))
    await write(asAgent('w-one'), [{ kind: 'person', id: THE_PERSON }], 'A worker writes to the owner')
    expect((await contactFor('w-one'))['foldedUnder'], 'it stayed folded after writing to the owner').toBeNull()
  })

  it('leaves the other worker folded, because the owner has not spoken with that one', async () => {
    expect((await contactFor('w-two'))['foldedUnder']).toEqual(agentRef('sup-one'))
  })
})

describe('the number on the circle does not change', () => {
  it('is the same before and after a folded agent"s conversation fills up', async () => {
    const before = await theCircle()
    // Two agents talking to each other, and both can be reached, which is exactly what a folded
    // conversation is. The routing has no reason to hand any of these to the owner.
    await write(asAgent('w-two'), [{ kind: 'agent', id: 'sup-one' }], 'Reporting to my starter')
    await write(asAgent('sup-one'), [{ kind: 'agent', id: 'w-two' }], 'Carry on')
    await write(asAgent('w-two'), [{ kind: 'agent', id: 'sup-one' }], 'Done')
    expect(await theCircle(), 'a folded conversation moved the number on their circle').toBe(before)
  })

  it('does move when an agent writes to the owner, which is the case that should move it', async () => {
    const before = await theCircle()
    await write(asAgent('w-two'), [{ kind: 'person', id: THE_PERSON }], 'A message the owner has to read')
    expect(await theCircle()).toBe(before + 1)
  })
})

describe('a message routed from an agent the person owns waits, and no copy reaches the owner', () => {
  it('leaves the number alone for each such message, and each carries the line that says it waits', async () => {
    // NOTHING IS ANSWERING AS quiet-one AND NOTHING HOLDS IT, so each message to it is routed up its
    // ownership tree. Its recorded owner is the person, and the walk stops there: the message is stored
    // and routed, the send is answered 409, and the message waits with quiet-one. No copy goes to the
    // owner, so the circle has no new letter to count.
    const before = await theCircle()
    const first = await sendWithTheReply(
      asAgent('w-two'),
      [{ kind: 'agent', id: 'quiet-one' }],
      'A note nobody is answering',
      409,
    )
    expect(await theCircle(), 'the first message to an agent the person owns moved the number').toBe(before)
    const second = await sendWithTheReply(
      asAgent('w-two'),
      [{ kind: 'agent', id: 'quiet-one' }],
      'A second note nobody is answering',
      409,
    )
    expect(await theCircle(), 'the second message to an agent the person owns moved the number').toBe(before)
    const { routedOf, theRoutedLineToDraw, PERSON_OWNER_ROUTING_ENDING } = await import('../src/shared/messages.ts')
    for (const [which, sent] of [['first', first], ['second', second]] as const) {
      const entry = routedOf(sent.stored)[0]
      expect(entry, `the ${which} message was stored with no routed entry`).toBeDefined()
      expect(entry!.said?.ending.how, `the ${which} message's route did not end at the person owner`).toBe(PERSON_OWNER_ROUTING_ENDING)
      expect(entry!.line, `the ${which} message's line is not the line drawn from its entry`).toBe(theRoutedLineToDraw(entry!))
      expect(entry!.line, `the ${which} message's line does not name its addressee`).toContain(QUIET_ONE_NAME)
      expect(deliveriesTo(sent.messageId, 'person', THE_PERSON), `the ${which} message was delivered to the owner`).toBe(0)
    }
  })
})
