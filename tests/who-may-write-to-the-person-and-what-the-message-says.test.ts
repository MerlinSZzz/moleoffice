// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHO MAY WRITE TO THE PERSON, WHAT THE MESSAGE SAYS ABOUT THE WRITER, AND WHERE A REFUSAL SENDS THEM.
 *
 * Criteria M59, P6, P7 and P8 of design/messages/ACCEPTANCE.md and design/permissions/ACCEPTANCE.md.
 *
 * M59, chapter 7 rule 1, and a decision: every message comes from a writer a registry holds, to an agent as to a
 * person. An agent id no registry
 * holds is refused in words and its message is not written, whether it wrote to the person or to an
 * agent, and the refusal names the one way on: register first. The old reporting path — an
 * unregistered writer's message to the agent that started it being accepted — is withdrawn.
 *
 * P6, on answer 1 (in principle a high rung only, but with no hard constraint): *Any
 * registered agent may write to the person, and the message says which rung wrote it.* The mutation this
 * criterion names is the draft's rule: put a rank gate back and the test goes red.
 *
 * P7, on answer (c), to the superior of this agent: *A message that skipped the chain says so.* Nothing is
 * refused and nothing is hidden.
 *
 * P8: *An agent may always answer a message the person sent it.*
 */

import type { AddressInfo } from 'node:net'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { THE_PERSON } from '../src/shared/person.ts'

let t: TestDb
let app: FastifyInstance
/** The door Mole Office really answers on, so the refusal that reads a socket is met. */
let base: string
/** The registry id the door gave the test secretary when it was registered. It is not the handle. */
let argusId: string

const AS_THE_PERSON = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const asAgent = (id: string): Record<string, string> => ({
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': id,
})
const asHuman = (id: string): Record<string, string> => ({
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': id,
})
const asSystem = (id: string): Record<string, string> => ({
  'x-mole-office-actor-type': 'system',
  'x-mole-office-actor-id': id,
})

async function register(headers: Record<string, string>, body: Record<string, unknown>): Promise<number> {
  const reply = await app.inject({ method: 'POST', url: '/api/agents/started', headers, payload: body })
  return reply.statusCode
}

async function write(
  headers: Record<string, string>,
  to: { kind: string; id: string }[],
  body: string,
): Promise<{ code: number; said: Record<string, unknown> }> {
  const reply = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers,
    payload: { kind: 'message', title: body.slice(0, 40), data: { to, body } },
  })
  return { code: reply.statusCode, said: reply.json() as Record<string, unknown> }
}

/**
 * A MESSAGE THROUGH THE REAL SOCKET, which is what curl, the browser and every agent use. The
 * refusal that reads `actor.from` is only asked on a socket, so this is the path that proves it.
 */
async function writeOverTheSocket(
  headers: Record<string, string>,
  to: { kind: string; id: string }[],
  body: string,
): Promise<{ code: number; said: Record<string, unknown>; text: string }> {
  const res = await fetch(`${base}/api/records`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', ...headers },
    body: JSON.stringify({ kind: 'message', title: body.slice(0, 40), data: { to, body } }),
  })
  const text = await res.text()
  let said: Record<string, unknown> = {}
  try {
    said = JSON.parse(text) as Record<string, unknown>
  } catch {
    said = { error: text }
  }
  return { code: res.status, said, text }
}

async function thePool(): Promise<Record<string, unknown>[]> {
  const reply = await app.inject({ method: 'GET', url: '/api/messages?full=1' })
  expect(reply.statusCode).toBe(200)
  return (reply.json() as { messages: Record<string, unknown>[] }).messages
}

async function theMessage(id: string): Promise<Record<string, unknown>> {
  const one = (await thePool()).find((row) => row['id'] === id)
  expect(one, `no message ${id} in the pool`).toBeDefined()
  return one as Record<string, unknown>
}

/**
 * HOW MANY MESSAGE RECORDS THE TEST'S OWN DATABASE HOLDS. The pool read answers only what its reader may read, so a
 * refused message that was stored anyway would not appear in it. This counts the rows themselves, and says a write
 * stored nothing.
 */
function theMessagesStored(): number {
  return (t.client.sqlite.prepare("select count(*) as count from records where kind = 'message'").get() as { count: number }).count
}

beforeAll(async () => {
  t = await freshDb()
  const built = await apiApp()
  app = built.app
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  base = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  const reply = await app.inject({
    method: 'POST',
    url: '/api/agents/started',
    headers: AS_THE_PERSON,
    payload: { handle: THE_TEST_OFFICES_SECRETARY.handle, name: THE_TEST_OFFICES_SECRETARY.name, role: 'secretary' },
  })
  expect(reply.statusCode, reply.body).toBe(201)
  argusId = (reply.json() as { agent: { id: string } }).agent.id
  expect(await register(asAgent(THE_TEST_OFFICES_SECRETARY.handle), { handle: 'w-one', name: 'Worker One', role: 'worker' })).toBe(201)
})

afterAll(async () => {
  await app.close()
  t.close()
})

describe('the refusal an unregistered writer gets names the one way on', () => {
  const UNREGISTERED = 'claude-code/bundle-drafter'

  // THE REFUSAL NAMES THE KIND THE WRITER WROTE AS (line round 50, item 2; message 1mDqct4t2suB). A person or
  // a system writer no registry holds was called "the agent" in it, whatever kind it wrote as. A writer that is an agent
  // keeps the sentence it had, word for word, in the cases below these two.
  // CONTROL, on the refusal before the change: both cases red, each on its opener, because the refusal said
  // `Nothing is registered as the agent`.
  // MUTATION: call this unregistered human "the agent" again; the new opener must go red. Restore: green.
  // A SECOND MUTATION calls the system writer "the agent": the system case goes red. Restore: green.
  it('calls an unregistered human writer a person and writes nothing', async () => {
    const actorId = 'nobody-registered-this-person'
    const before = theMessagesStored()
    const { code, said, text } = await writeOverTheSocket(
      asHuman(actorId),
      [{ kind: 'agent', id: THE_TEST_OFFICES_SECRETARY.handle }],
      'A message from a person no registry holds',
    )
    expect(code, text).toBe(400)
    const why = String(said['error'])
    expect(why).toContain(`Nothing is registered as the person "${actorId}"`)
    expect(why).toContain('Nothing was written.')
    expect(theMessagesStored(), 'a refused message was stored').toBe(before)
  })

  it('calls an unregistered system writer a system writer and writes nothing', async () => {
    const actorId = 'the-unregistered-system-writer'
    const before = theMessagesStored()
    const { code, said, text } = await writeOverTheSocket(
      asSystem(actorId),
      [{ kind: 'agent', id: THE_TEST_OFFICES_SECRETARY.handle }],
      'A message from a system no registry holds',
    )
    expect(code, text).toBe(400)
    const why = String(said['error'])
    expect(why).toContain(`Nothing is registered as the system writer "${actorId}"`)
    expect(why).toContain('Nothing was written.')
    expect(theMessagesStored(), 'a refused message was stored').toBe(before)
  })

  it('refuses the message to a registered agent over a real socket, and writes nothing', async () => {
    const before = theMessagesStored()
    const { code, said, text } = await writeOverTheSocket(
      asAgent(UNREGISTERED),
      [{ kind: 'agent', id: THE_TEST_OFFICES_SECRETARY.handle }],
      'Reporting to my starter',
    )
    expect(code, text).toBe(403)
    const why = String(said['error'])
    expect(why).toContain(UNREGISTERED)
    expect(why).toContain('Nothing is registered as the agent')
    expect(why, 'the refusal must name the one way on').toContain('Register first')
    expect(why, 'the refusal must name how to register').toContain('register-myself')
    expect(why, 'the withdrawn reporting path is back in the refusal').not.toContain(
      'write to the agent that started you',
    )
    expect(theMessagesStored(), 'a refused message was stored').toBe(before)
  })

  it("refuses the same writer's message to a person over a real socket, with the one way on", async () => {
    const before = theMessagesStored()
    const { code, said, text } = await writeOverTheSocket(
      asAgent(UNREGISTERED),
      [{ kind: 'person', id: THE_PERSON }],
      'A report nobody asked for',
    )
    expect(code, text).toBe(403)
    const why = String(said['error'])
    expect(why).toContain(UNREGISTERED)
    expect(why, 'the refusal must name the one way on').toContain('Register first')
    expect(why, 'the withdrawn reporting path is back in the refusal').not.toContain(
      'write to the agent that started you',
    )
    expect(why, 'the refusal must not offer a second way on').not.toContain('Or write to')
    expect(theMessagesStored(), 'a refused message was stored').toBe(before)
  })

  it('refuses the same message to an agent in process, so the two paths agree', async () => {
    const before = theMessagesStored()
    const { code, said } = await write(asAgent(UNREGISTERED), [{ kind: 'agent', id: THE_TEST_OFFICES_SECRETARY.handle }], 'Reporting in process')
    expect(code, 'the in-process path accepted what a real socket refuses').toBe(400)
    const why = String(said['error'])
    expect(why, 'the refusal must name the one way on').toContain('Register first')
    expect(why, 'the withdrawn reporting path is back in the refusal').not.toContain('Or write to')
    expect(theMessagesStored(), 'a refused message was stored').toBe(before)
  })

  it('refuses the same message to a person in process with the one way on', async () => {
    const before = theMessagesStored()
    const { code, said } = await write(asAgent(UNREGISTERED), [{ kind: 'person', id: THE_PERSON }], 'A report in process')
    expect(code).toBe(400)
    const why = String(said['error'])
    expect(why, 'the refusal must name the one way on').toContain('Register first')
    expect(why, 'the refusal must not offer a second way on').not.toContain('Or write to')
    expect(theMessagesStored(), 'a refused message was stored').toBe(before)
  })
})

describe('any registered agent may write to the person, and the message says which rung wrote it', () => {
  it('accepts a worker"s message addressed only to the person', async () => {
    const { code, said } = await write(asAgent('w-one'), [{ kind: 'person', id: THE_PERSON }], 'A worker writes to the person')
    expect(code, 'a rank gate refused a registered worker').toBe(201)
    const one = await theMessage(String((said['record'] as { id: string }).id))
    expect(one['sentByRole']).toBe('worker')
  })

  it('says the rung of a secretary the same way', async () => {
    const { said } = await write(asAgent(THE_TEST_OFFICES_SECRETARY.handle), [{ kind: 'person', id: THE_PERSON }], 'The secretary writes to the person')
    const one = await theMessage(String((said['record'] as { id: string }).id))
    expect(one['sentByRole']).toBe('secretary')
  })

  it('reads the rung rather than storing it, so a rung that changes is not stale on an old message', async () => {
    const { said } = await write(asAgent('w-one'), [{ kind: 'person', id: THE_PERSON }], 'Written while a worker')
    const id = String((said['record'] as { id: string }).id)
    expect((await theMessage(id))['sentByRole']).toBe('worker')
    t.client.sqlite.prepare("UPDATE agents SET role = 'supervisor' WHERE handle = 'w-one'").run()
    expect((await theMessage(id))['sentByRole']).toBe('supervisor')
  })

  it('says nothing about a rung for a message the person wrote', async () => {
    const { said } = await write(AS_THE_PERSON, [{ kind: 'agent', id: 'w-one' }], 'The owner writes to a worker')
    const one = await theMessage(String((said['record'] as { id: string }).id))
    expect(one['sentByRole']).toBeNull()
  })
})

describe('a message that skipped the chain says so', () => {
  it('marks a started agent"s message addressed only to the person with the starter it went round', async () => {
    const { said } = await write(asAgent('w-one'), [{ kind: 'person', id: THE_PERSON }], 'Straight to the person')
    const one = await theMessage(String((said['record'] as { id: string }).id))
    expect(one['wentRoundItsStarter']).toEqual({ kind: 'agent', id: argusId })
  })

  it('marks nothing when the starter was told as well', async () => {
    const { said } = await write(
      asAgent('w-one'),
      [
        { kind: 'person', id: THE_PERSON },
        { kind: 'agent', id: THE_TEST_OFFICES_SECRETARY.handle },
      ],
      'To the person and to my starter',
    )
    const one = await theMessage(String((said['record'] as { id: string }).id))
    expect(one['wentRoundItsStarter']).toBeNull()
  })

  it('marks nothing on a message between agents, because no chain was skipped', async () => {
    const { said } = await write(asAgent('w-one'), [{ kind: 'agent', id: THE_TEST_OFFICES_SECRETARY.handle }], 'Reporting up')
    const one = await theMessage(String((said['record'] as { id: string }).id))
    expect(one['wentRoundItsStarter']).toBeNull()
  })

  it('refuses nothing: the marked message is stored and reaches the owner\'s conversation', async () => {
    const { code, said } = await write(asAgent('w-one'), [{ kind: 'person', id: THE_PERSON }], 'Marked, not refused')
    expect(code).toBe(201)
    const one = await theMessage(String((said['record'] as { id: string }).id))
    expect((one['to'] as { kind: string }[]).some((who) => who.kind === 'person')).toBe(true)
  })
})

describe('an agent may always answer a message the person sent it', () => {
  it('lets a worker reply to the person, and the reply reaches the owner\'s conversation', async () => {
    const theirs = await write(AS_THE_PERSON, [{ kind: 'agent', id: 'w-one' }], 'What is the state of the cluster?')
    // A PERSON'S SEND TO AN AGENT NOTHING HOLDS ANSWERS 409, with the letter stored and routed (decision 60sbc5I-bwKx).
    expect(theirs.code).toBe(409)
    const reply = await write(asAgent('w-one'), [{ kind: 'person', id: THE_PERSON }], 'Part one is built.')
    expect(reply.code).toBe(201)
    const one = await theMessage(String((reply.said['record'] as { id: string }).id))
    expect((one['to'] as { kind: string; id: string }[])).toContainEqual({ kind: 'person', id: THE_PERSON })
  })
})
