// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE OFFICE READS THE MESSAGES IT SENT, AND NO OTHERS.
 *
 * The owner's rule for who reads which message: the owner and every secretary read every message, and
 * every other reader reads the messages it is a party to, which includes the ones it sent. The office
 * sends messages as its own participant, but it writes as its own actor, `{ type: 'system', id: <its
 * id> }`, and the rule read that actor as nobody. So the office could not read even a message it had
 * sent, and when it put a new secretary's handbook item on the secretary's checklist, the checklist
 * refused the item's link to the card message the office had just sent (wave 13s, round 77).
 *
 * WHAT IS MEASURED, through the rule every message door asks (`theMessageReader` and
 * `theMessagesThisReaderMayRead`):
 *
 *   1. the office's own actor reads the card message it sent to an agent;
 *   2. it is refused a message between two agents that it was not handed;
 *   3. an ordinary agent's reach is as it was: it reads the messages it sent or was handed, and not a
 *      message between two others or the card message sent to another agent.
 *
 * THE MUTATIONS THAT TURN THIS RED, WITH A CONTROL RUN FIRST (23 October 2026), in
 * src/server/lib/messages.ts, in the working tree only, put back afterwards:
 *
 *   the office's actor read as nobody again (the new line taken out) → case 1 red;
 *   the office's actor made a reader of every message → case 2 red.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'

import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

let t: TestDb
let app: FastifyInstance
let messages: typeof import('../src/server/lib/messages.ts')
let theOfficesId = ''
const idOf: Record<string, string> = {}
const cardMessageTo: Record<string, string> = {}
let writerToReader = ''

/** Register one worker through the starter door, as the person, and note its card message from the office. */
async function aWorker(handle: string): Promise<void> {
  const started = await app.inject({ method: 'POST', url: '/api/agents/started', headers: AS_THE_PERSON, payload: { handle, name: handle, role: 'worker' } })
  expect(started.statusCode, started.body).toBe(201)
  idOf[handle] = (JSON.parse(started.body) as { agent: { id: string } }).agent.id
  const waiting = await app.inject({ method: 'GET', url: `/api/handles/${handle}/waiting`, headers: AS_THE_PERSON })
  expect(waiting.statusCode, waiting.body).toBe(200)
  const held = (JSON.parse(waiting.body) as { waiting: { messageId: string }[] }).waiting
  expect(held.length, `${handle} was handed no card message`).toBe(1)
  cardMessageTo[handle] = held[0]!.messageId
}

/** The ids among these that this actor may read, in the order asked. */
function mayRead(actor: { type: string; id: string }, ids: readonly string[]): string[] {
  const readable = messages.theMessagesThisReaderMayRead(messages.theMessageReader(actor), ids)
  return ids.filter((id) => readable.has(id))
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  // THE SAME MODULES THE SERVER JUST LOADED. `freshDb` reset the module registry.
  messages = await import('../src/server/lib/messages.ts')
  theOfficesId = (await import('../src/shared/participants.ts')).moleOfficeId()
  for (const handle of ['made-up-writer', 'made-up-reader', 'made-up-bystander']) await aWorker(handle)
  writerToReader = t.api.createRecord({
    workspaceId: 'default',
    kind: 'message',
    title: 'A made-up note between two agents',
    data: { body: 'A made-up note.', to: [{ kind: 'agent', id: idOf['made-up-reader']! }], sentBy: { kind: 'agent', id: idOf['made-up-writer']! } },
    actor: { type: 'agent', id: idOf['made-up-writer']! },
  }).id
})

afterAll(async () => {
  await app.close()
  t.close()
})

describe('the office reads the messages it sent, and no others', () => {
  it('1. the office’s own actor reads the card message it sent to an agent', () => {
    const office = { type: 'system', id: theOfficesId }
    expect(mayRead(office, [cardMessageTo['made-up-writer']!])).toEqual([cardMessageTo['made-up-writer']!])
  })

  it('2. the office’s own actor is refused a message between two agents that it was not handed', () => {
    const office = { type: 'system', id: theOfficesId }
    expect(mayRead(office, [writerToReader])).toEqual([])
  })

  it('3. an ordinary agent reads what it sent or was handed, and nothing else', () => {
    const every = [writerToReader, cardMessageTo['made-up-writer']!, cardMessageTo['made-up-reader']!, cardMessageTo['made-up-bystander']!]
    expect(mayRead({ type: 'agent', id: idOf['made-up-writer']! }, every)).toEqual([writerToReader, cardMessageTo['made-up-writer']!])
    expect(mayRead({ type: 'agent', id: idOf['made-up-reader']! }, every)).toEqual([writerToReader, cardMessageTo['made-up-reader']!])
    expect(mayRead({ type: 'agent', id: idOf['made-up-bystander']! }, every)).toEqual([cardMessageTo['made-up-bystander']!])
  })
})
