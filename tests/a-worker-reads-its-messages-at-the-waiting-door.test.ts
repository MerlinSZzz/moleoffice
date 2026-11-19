// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A WORKER READS ITS SUPERVISOR'S MESSAGES AT THE WAITING DOOR, AND THE INBOX DOOR SAYS SO.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS SEEN, AND WHAT IT WAS
 * ---------------------------------------------------------------------------------------
 *
 * On 25 September 2026 a worker of wave 13c read GET /api/agent/inbox and found none
 * of its supervisor's replies, in every state (wave 13c's report wLma8OmmWefQ). Measured here: a
 * supervisor writes to its worker by filing a record of kind `message` through POST /api/records.
 * That record lives in `records` and gets one `message_delivery` row per recipient. The inbox door
 * reads `agent_messages`, the messages of the conversations a person, a comment or a run starts,
 * and nothing copies a message record there. So the inbox door never lists a message record, in
 * any state. That is the likely root of problem w3nrNqmxWStv. The door is right about what it
 * reads; the worker asked the wrong door. GET /api/handles/<handle>/waiting lists the message
 * records still queued for the agent, and GET /api/messages?only=waiting-for-me lists them with
 * their words. The inbox door's reply now says what it covers and names both.
 *
 * THE IDS ARE OF TWO KINDS, and this file pins which is which. The inbox door resolves the handle
 * to the agent's RECORD id (a record of kind `agent`), which is what `recipient_agent_id` stores.
 * A delivery row names the agent's REGISTRY id.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THIS IS WRITTEN AGAINST, each run after a control
 * ---------------------------------------------------------------------------------------
 *
 *   1. `says` in `inboxOf` back to "Nothing is waiting for <handle>." with no word about what it
 *      covers: case 2 is red.
 *   2. The inbox route returns the reading without naming the two doors: case 2 is red.
 *   3. The bootstrap's `messages` section asks for GET /api/agent/inbox again: case 3 is red,
 *      because that door does not list the message.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

let t: TestDb
let app: FastifyInstance

const JSON_HEADER = { 'content-type': 'application/json', 'x-mole-office-workspace': 'default' }
const PERSON = { ...JSON_HEADER, 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const asAgent = (handle: string) => ({ ...JSON_HEADER, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle })

const SUPERVISOR = 'the-sup'
const WORKER = 'the-worker'
const WORDS = 'Build B: the inbox door says what it covers.'

let supervisorId = ''
let workerId = ''
let workerRecord = ''
let messageId = ''
/** The six words a conversation message may hold, read after the test's own database exists. */
let MESSAGE_STATES: readonly string[] = []

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function ask(method: 'GET' | 'POST', url: string, headers: Record<string, string>, payload?: unknown): Promise<{ status: number; json: any }> {
  const reply = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as never }) })
  return { status: reply.statusCode, json: reply.json() }
}

beforeAll(async () => {
  t = await freshDb()
  MESSAGE_STATES = (await import('../src/server/lib/dispatch.ts')).MESSAGE_STATES
  app = (await apiApp()).app
  await app.ready()

  // REGISTERED THE WAY THE SECRETARY REGISTERS A WAVE: the person starts the supervisor, and the supervisor
  // starts the worker, so the worker's `startedBy` names the supervisor.
  const sup = await ask('POST', '/api/agents/started', PERSON, { handle: SUPERVISOR, name: 'The Sup', role: 'supervisor' })
  expect(sup.status, JSON.stringify(sup.json)).toBe(201)
  supervisorId = String(sup.json.agent.id)
  const worker = await ask('POST', '/api/agents/started', asAgent(SUPERVISOR), { handle: WORKER, name: 'The Worker', role: 'worker' })
  expect(worker.status, JSON.stringify(worker.json)).toBe(201)
  workerId = String(worker.json.agent.id)
  workerRecord = String(worker.json.record)
  expect(worker.json.agent.startedBy).toEqual({ kind: 'agent', id: supervisorId })

  // THE MESSAGE, SENT THE WAY A SUPERVISOR SENDS ONE. NOTHING HOLDS THE WORKER IN THIS TEST OFFICE, so the office
  // stores the message, routes it and answers 409 rather than 201; the message is stored all the same, and its one
  // delivery row to the worker is read below.
  const sent = await ask('POST', '/api/records', asAgent(SUPERVISOR), {
    kind: 'message',
    title: 'An answer',
    data: { body: WORDS, to: [{ kind: 'agent', id: WORKER }] },
  })
  expect(sent.status, JSON.stringify(sent.json)).toBe(409)
  messageId = String(sent.json.record.id)
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

describe('a supervisor’s message to its worker', () => {
  it('1. is a message record with a queued delivery to the worker’s registry id, and no conversation message', () => {
    const rows = t.client.sqlite
      .prepare("SELECT recipient_id AS id, mark FROM message_delivery WHERE message_id = ? AND recipient_kind = 'agent'")
      .all(messageId) as { id: string; mark: string }[]
    expect(rows).toEqual([{ id: workerId, mark: 'queued' }])
    const conversation = t.client.sqlite.prepare('SELECT count(*) AS n FROM agent_messages').get() as { n: number }
    expect(conversation.n).toBe(0)
  })

  it('2. is in no state at the inbox door, and the door says what it covers and where the message is', async () => {
    const plain = await ask('GET', '/api/agent/inbox', asAgent(WORKER))
    const byHandle = await ask('GET', `/api/agent/inbox?handle=${WORKER}`, asAgent(WORKER))
    const everyState = await ask('GET', `/api/agent/inbox?state=${MESSAGE_STATES.join(',')}`, asAgent(WORKER))
    for (const reading of [plain, byHandle, everyState]) {
      expect(reading.status, JSON.stringify(reading.json)).toBe(200)
      expect(reading.json.messages).toEqual([])
      // THE AGENT IT READ FOR IS THE WORKER'S RECORD, the kind of id the conversation table stores.
      expect(reading.json.agent.id).toBe(workerRecord)
      expect(reading.json.agent.id).not.toBe(workerId)
      const says = String(reading.json.says)
      expect(says).not.toContain('Nothing is waiting')
      expect(says).toContain('This lists only messages in conversations.')
      expect(says).toContain(`A message filed as a record of kind message is not in it, even when it is to ${WORKER}.`)
      expect(says).toContain(`GET /api/handles/${WORKER}/waiting`)
      expect(says).toContain('GET /api/messages?only=waiting-for-me')
    }
    for (const state of MESSAGE_STATES) {
      const one = await ask('GET', `/api/agent/inbox?state=${state}`, asAgent(WORKER))
      expect(one.status).toBe(200)
      expect(one.json.messages, state).toEqual([])
    }

    // AND EVERY DOOR THE REPLY NAMES LISTS THE MESSAGE, asked as the worker.
    const named = String(plain.json.says).match(/GET \/api\/\S+?(?=[ ,]| and|\.$|$)/g) ?? []
    expect(named.length).toBe(2)
    for (const request of named) {
      const answer = await ask('GET', request.slice('GET '.length), asAgent(WORKER))
      expect(answer.status, request).toBe(200)
      expect(JSON.stringify(answer.json).includes(messageId), `${request} lists the message`).toBe(true)
    }
    const pool = await ask('GET', '/api/messages?only=waiting-for-me&full=1', asAgent(WORKER))
    expect(pool.json.messages.find((one: { id: string }) => one.id === messageId)?.body).toBe(WORDS)
  })

  it('3. is at the door the bootstrap names for an agent’s waiting messages', async () => {
    const { BOOTSTRAP_SECTIONS } = await import('../src/server/api/bootstrap.ts')
    const request = String(BOOTSTRAP_SECTIONS.find((one) => one.section === 'messages')?.ask)
    const [method, ...rest] = request.split(' ')
    expect(method).toBe('GET')
    const path = rest.join(' ').replace(/<[^>]+>/g, WORKER)
    const answer = await ask('GET', path, asAgent(WORKER))
    expect(answer.status, `${request}: ${JSON.stringify(answer.json)}`).toBe(200)
    expect(JSON.stringify(answer.json).includes(messageId), `${request} lists the message`).toBe(true)
  })

  it('4. the reading a copy carries names no request, because a copy has no API (criterion B19)', async () => {
    const { agentByHandle, inboxOf } = await import('../src/server/lib/inbox.ts')
    const worker = agentByHandle(WORKER, 'default')
    expect(worker).not.toBeNull()
    const says = inboxOf(worker!, 'default').says
    expect(says).toContain('This lists only messages in conversations.')
    expect(says).not.toMatch(/\b(GET|POST|PUT|PATCH|DELETE)\s+\/api\//)
  })
})
