// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONLY A COMMENT'S WRITER CHANGES ITS WORDS. A waiting comment goes out under its writer's name,
 * so being allowed to read it does not let somebody else replace its words or remove it. These requests cross
 * the HTTP door: a secretary reads the person's comment, the person reads an agent's, and one
 * agent reads another's. A refusal leaves the words intact and says who wrote them and how to add
 * words. Each writer can still change or remove its own waiting comment.
 *
 * THE MUTATIONS THAT TURN THIS RED, WITH A CONTROL RUN FIRST:
 *   1. Delete the writer check just after refuseIfSent in patchMessage. The three other-writer
 *      cases turn red on the 403, the unchanged words and the refusal's pieces; the two own-writer
 *      controls stay green. Restore src/server/lib/agents.ts and run again to prove green.
 *   2. Delete the writer check in removeMessage alone. The three other-writer DELETE cases turn
 *      red on the 403, the comment still being there and the refusal's pieces. The PATCH cases
 *      and the two own-writer DELETE controls stay green. Restore the code and run green again.
 *
 * MADE-UP: every agent, conversation and comment in this file is test data.
 */

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const WORKSPACE = 'default'
const PERSON = {
  'x-mole-office-workspace': WORKSPACE,
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
/**
 * A HANDLE OF ITS OWN FOR EACH CASE. A handle is unique across every agent a project has ever had,
 * so one office for the file needs a fresh suffix rather than the same three names ten times.
 */
let caseNumber = 0
let WRITER_HANDLE = 'made-up-comment-writer'
let READER_HANDLE = 'made-up-comment-reader'
let SECRETARY_HANDLE = 'made-up-comment-secretary'
const WRITER_NAME = 'MADE-UP comment writer'
const NEW_WORDS = 'MADE-UP replacement words.'

function asAgent(handle: string): Record<string, string> {
  return { ...PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle }
}

interface Message {
  id: string
  body: string
  state: string
  createdBy: string
}

let t: TestDb
let app: FastifyInstance
let thread: string
let personsComment: Message
let agentsComment: Message
let writerId: string

async function say(body: string, headers: Record<string, string> = PERSON, recipient?: { kind: 'agent'; agentId: string }): Promise<Message> {
  const reply = await app.inject({
    method: 'POST', url: `/api/agent/threads/${thread}/messages`, headers,
    payload: { intent: 'discuss', body, ...(recipient === undefined ? {} : { recipient }) },
  })
  expect(reply.statusCode, reply.body).toBe(201)
  const message = (reply.json() as { message: Message }).message
  expect(message.state).toBe('queued')
  return message
}

async function readAs(headers: Record<string, string>): Promise<Message[]> {
  const reply = await app.inject({ method: 'GET', url: `/api/agent/threads/${thread}`, headers })
  expect(reply.statusCode, reply.body).toBe(200)
  return (reply.json() as { messages: Message[] }).messages
}

/**
 * ONE OFFICE FOR THE FILE. Each case makes its own agents, conversation and comments, under handles
 * of its own, so no case reads or changes what another wrote.
 */
beforeAll(async () => {
  t = await freshDb()
  const { copyTheDefaultRegulationsOnce } = await import('../src/server/lib/default-regulations.ts')
  expect(copyTheDefaultRegulationsOnce().copied).toBeGreaterThan(0)
  app = (await apiApp()).app
  await app.ready()
}, 60_000)

beforeEach(async () => {
  caseNumber += 1
  WRITER_HANDLE = `made-up-comment-writer-${String(caseNumber)}`
  READER_HANDLE = `made-up-comment-reader-${String(caseNumber)}`
  SECRETARY_HANDLE = `made-up-comment-secretary-${String(caseNumber)}`
  const ids: string[] = []
  for (const [handle, name] of [[WRITER_HANDLE, WRITER_NAME], [READER_HANDLE, 'MADE-UP comment reader']]) {
    const reply = await app.inject({
      method: 'POST', url: '/api/records', headers: PERSON,
      payload: { kind: 'agent', title: name, data: { handle, state: 'active', runtime: 'claude-code' } },
    })
    expect(reply.statusCode, reply.body).toBe(201)
    ids.push((reply.json() as { record: { id: string } }).record.id)
  }
  const secretary = await app.inject({
    method: 'POST', url: '/api/agents/started', headers: PERSON,
    payload: { handle: SECRETARY_HANDLE, name: 'MADE-UP comment secretary', role: 'secretary' },
  })
  expect(secretary.statusCode, secretary.body).toBe(201)

  const opened = await app.inject({
    method: 'POST', url: '/api/agent/threads', headers: PERSON,
    payload: { title: 'MADE-UP conversation about comments', mode: 'review' },
  })
  expect(opened.statusCode, opened.body).toBe(201)
  thread = (opened.json() as { thread: { id: string } }).thread.id
  // Both ordinary agents become parties. The secretary is never addressed, and reads by its card.
  personsComment = await say('MADE-UP words the person wrote.', PERSON, { kind: 'agent', agentId: ids[0]! })
  await say('MADE-UP question for the reader.', PERSON, { kind: 'agent', agentId: ids[1]! })
  agentsComment = await say('MADE-UP words the agent wrote.', asAgent(WRITER_HANDLE))
  const participants = await app.inject({ method: 'GET', url: '/api/participants', headers: PERSON })
  expect(participants.statusCode, participants.body).toBe(200)
  const writer = (participants.json() as { agents: { id: string; handle: string }[] }).agents.find(one => one.handle === WRITER_HANDLE)
  expect(writer).toBeDefined()
  writerId = writer!.id
})

afterAll(async () => {
  await app.close()
  t.close()
})

async function refuseAnotherWriter(method: 'PATCH' | 'DELETE', message: Message, changer: Record<string, string>, writer: string): Promise<void> {
  // A readable conversation is essential: a hidden comment's 404 would never reach this check.
  expect((await readAs(changer)).find(one => one.id === message.id)?.body).toBe(message.body)
  const reply = await app.inject({
    method, url: `/api/agent/messages/${message.id}`, headers: changer,
    ...(method === 'PATCH' ? { payload: { body: NEW_WORDS } } : {}),
  })
  expect.soft(reply.statusCode, reply.body).toBe(403)
  const why = (reply.json() as { error?: string }).error ?? ''
  expect.soft(why).toContain(`${writer} wrote this comment`)
  expect.soft(why).toContain(`only its writer may ${method === 'PATCH' ? 'change' : 'remove'} it`)
  expect.soft(why).toContain(`Nothing was ${method === 'PATCH' ? 'changed' : 'removed'}`)
  if (method === 'PATCH') expect.soft(why).toContain('write a new comment in the conversation')
  expect.soft(why).not.toContain(`human:${THE_PERSON}`)
  expect((await readAs(PERSON)).find(one => one.id === message.id)?.body).toBe(message.body)
}

async function changeOwn(message: Message, changer: Record<string, string>): Promise<void> {
  const reply = await app.inject({
    method: 'PATCH', url: `/api/agent/messages/${message.id}`, headers: changer, payload: { body: NEW_WORDS },
  })
  expect(reply.statusCode, reply.body).toBe(200)
  expect((reply.json() as { message: Message }).message.body).toBe(NEW_WORDS)
  expect((await readAs(PERSON)).find(one => one.id === message.id)?.body).toBe(NEW_WORDS)
}

async function removeOwn(message: Message, changer: Record<string, string>): Promise<void> {
  const reply = await app.inject({ method: 'DELETE', url: `/api/agent/messages/${message.id}`, headers: changer })
  expect(reply.statusCode, reply.body).toBe(200)
  expect((reply.json() as { removed: Message }).removed.id).toBe(message.id)
  expect((await readAs(PERSON)).some(one => one.id === message.id)).toBe(false)
}

describe.each(['PATCH', 'DELETE'] as const)('%s: only a waiting comment\'s writer may change or remove it', method => {
  it('refuses a secretary acting on the person\'s comment, leaves it intact and explains whose words they are', async () => {
    await refuseAnotherWriter(method, personsComment, asAgent(SECRETARY_HANDLE), 'The person')
  })

  it('refuses the person acting on an agent\'s comment, leaves it intact and names its writer', async () => {
    await refuseAnotherWriter(method, agentsComment, PERSON, `The agent ${WRITER_NAME} (${WRITER_HANDLE})`)
  })

  it('refuses one party acting on another agent\'s comment, leaves it intact and names its writer', async () => {
    await refuseAnotherWriter(method, agentsComment, asAgent(READER_HANDLE), `The agent ${WRITER_NAME} (${WRITER_HANDLE})`)
  })

  it('lets the person act on the person\'s own waiting comment', async () => {
    await (method === 'PATCH' ? changeOwn : removeOwn)(personsComment, PERSON)
  })

  it('lets an agent act on its own waiting comment when it asks by its durable id', async () => {
    await (method === 'PATCH' ? changeOwn : removeOwn)(agentsComment, asAgent(writerId))
  })
})
