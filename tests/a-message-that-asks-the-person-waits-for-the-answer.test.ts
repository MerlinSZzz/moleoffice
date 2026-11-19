// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A MESSAGE THAT ASKS THE PERSON SOMETHING, AND WHICH OF THEM WAIT FOR THE PERSON'S ANSWER.
 *
 * Answer 10 to wave 13k's proposal (report n9Mjk3c_sJRu): messages that ask the person
 * something get a list of their own. The writer says a message asks the person, with `asksThePerson`, and
 * the office lists it as waiting for the person's answer until the person writes back to its sender. The whole rule
 * is the section "a message that asks the person" in src/shared/messages.ts.
 *
 * WHAT IS PROVED HERE, against a real office built in this process:
 *
 *   1. SET AND CARRIED. true and false are stored as written, and GET /api/messages carries each.
 *   2. ABSENT IS NOT FALSE. A message without the field is carried as null, never as false.
 *   3. REFUSED, in the office's own sentences: on a message whose `to` names no person, on a message
 *      to a group, and on a later write that sets, changes or takes off the field. Nothing is written.
 *   4. WAITING FOR YOUR ANSWER. ?only=waiting-for-my-answer answers the questions to the person, not
 *      the plain message, not the one marked false, and not an old one. Reading a question does not
 *      answer it. Writing back to its sender does, and a question from somebody else still waits.
 *   5. An agent asking the same narrowing gets nothing, because no message asks an agent this way.
 *
 * MUTATIONS, each red here after a control run (see the commit that adds this file):
 *   - `whyAsksThePersonIsRefused` answers null: case 3 red.
 *   - `asksThePersonOf` answers false for an absent field: case 2 red.
 *   - `asMessage` leaves `asksThePerson` off the wire: case 1 red.
 *   - `theQuestionsWaitingForTheAnswerOf` ignores what the reader wrote back: case 4 red.
 *   - the patch rule in `patchRecord` is taken out: case 3 red.
 */

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import {
  ASKS_THE_PERSON_IS_SET_WHEN_WRITTEN,
  ASKS_THE_PERSON_NEEDS_A_PERSON,
  ASKS_THE_PERSON_NOT_IN_A_GROUP,
} from '../src/shared/messages.ts'
import { apiApp, freshDb, type TestDb, theAnswerToAWriteInATestOffice } from './helpers.ts'

let t: TestDb
let app: FastifyInstance

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const asAgent = (handle: string): Record<string, string> => ({
  ...AS_THE_PERSON,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
})

const THE_PERSON_REF = { kind: 'person', id: THE_PERSON }

async function inject(
  method: 'GET' | 'POST' | 'PATCH',
  url: string,
  headers: Record<string, string>,
  payload?: unknown,
): Promise<{ status: number; json: Record<string, unknown>; text: string }> {
  const reply = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as never }) })
  let json: Record<string, unknown> = {}
  try {
    json = reply.json() as Record<string, unknown>
  } catch {
    json = {}
  }
  return { status: reply.statusCode, json, text: reply.body }
}

/** Register an agent and answer its handle, which `to` may name it by. */
async function anAgent(handle: string): Promise<string> {
  const filed = await inject('POST', '/api/records', AS_THE_PERSON, {
    kind: 'agent',
    title: handle,
    data: { handle, runtime: 'claude-code', state: 'active' },
  })
  expect(filed.status, filed.text).toBe(201)
  return handle
}

/** Write one message and answer the whole reply. */
async function write(headers: Record<string, string>, data: Record<string, unknown>) {
  return await inject('POST', '/api/records', headers, { kind: 'message', title: String(data['body']).slice(0, 40), data })
}

/** Write one message that must be accepted, and answer its id. */
async function said(headers: Record<string, string>, data: Record<string, unknown>): Promise<string> {
  const reply = await write(headers, data)
  expect(reply.status, reply.text).toBe(theAnswerToAWriteInATestOffice(headers, { kind: 'message', data }))
  return (reply.json['record'] as { id: string }).id
}

type Entry = { id: string; asksThePerson?: unknown }

async function pool(headers: Record<string, string>, only?: string): Promise<Entry[]> {
  const reply = await inject('GET', `/api/messages?full=1${only === undefined ? '' : `&only=${only}`}`, headers)
  expect(reply.status, reply.text).toBe(200)
  return reply.json['messages'] as Entry[]
}

async function waitingIds(headers: Record<string, string> = AS_THE_PERSON): Promise<string[]> {
  return (await pool(headers, 'waiting-for-my-answer')).map((one) => one.id)
}

let builder = ''
let checker = ''
let question = ''
let saysNo = ''
let plain = ''
let fromChecker = ''

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  builder = await anAgent('asks-builder')
  checker = await anAgent('asks-checker')
  question = await said(asAgent('asks-builder'), { body: 'Shall I try PLA for setting 15?', to: [THE_PERSON_REF], asksThePerson: true })
  saysNo = await said(asAgent('asks-builder'), { body: 'The sweep finished at setting 15.', to: [THE_PERSON_REF], asksThePerson: false })
  plain = await said(asAgent('asks-builder'), { body: 'The camera fit held at 0.4 px.', to: [THE_PERSON_REF] })
  fromChecker = await said(asAgent('asks-checker'), { body: 'May I close the calibration task?', to: [THE_PERSON_REF], asksThePerson: true })
}, 120_000)

afterAll(async () => {
  await app.close()
  t.close()
})

describe('the field is stored as written and carried by GET /api/messages', () => {
  it('carries true and false as the writer wrote them', async () => {
    const all = await pool(AS_THE_PERSON)
    expect(all.find((one) => one.id === question)?.asksThePerson, 'the question is not carried as asking').toBe(true)
    expect(all.find((one) => one.id === saysNo)?.asksThePerson, 'the message marked false is not carried as false').toBe(false)
  })

  it('carries a message without the field as null, never as false', async () => {
    const all = await pool(AS_THE_PERSON)
    const entry = all.find((one) => one.id === plain)
    expect(entry, 'the plain message is not in the pool').toBeDefined()
    expect(entry?.asksThePerson, 'a message nobody marked is carried as something other than null').toBeNull()
  })

  it('is described on the message kind, so an agent learns it at GET /api/kinds', async () => {
    const reply = await inject('GET', '/api/kinds/message', AS_THE_PERSON)
    expect(reply.status, reply.text).toBe(200)
    expect(reply.text).toContain('asksThePerson')
    expect(reply.text).toContain('LEAVING IT OUT IS NOT FALSE')
  })
})

describe('the office refuses the field where it cannot mean anything, in plain sentences', () => {
  it('refuses it on a message whose `to` names no person', async () => {
    const reply = await write(AS_THE_PERSON, { body: 'Do you need the log?', to: [{ kind: 'agent', id: builder }], asksThePerson: true })
    expect(reply.status, reply.text).toBe(400)
    expect(String(reply.json['error'])).toBe(ASKS_THE_PERSON_NEEDS_A_PERSON)
    // false is refused there too: the field says something about asking the person, and there is none.
    const alsoFalse = await write(AS_THE_PERSON, { body: 'Nothing to ask.', to: [{ kind: 'agent', id: builder }], asksThePerson: false })
    expect(alsoFalse.status, alsoFalse.text).toBe(400)
  })

  it('refuses it on a message to a group', async () => {
    const reply = await write(asAgent('asks-builder'), { body: 'Anyone for PLA?', toGroup: 'aB3dEf7hIjKl', asksThePerson: true })
    expect(reply.status, reply.text).toBe(400)
    expect(String(reply.json['error'])).toBe(ASKS_THE_PERSON_NOT_IN_A_GROUP)
  })

  it('refuses a later write that sets, changes or takes it off, and changes nothing', async () => {
    const setting = await inject('PATCH', `/api/records/${plain}`, asAgent('asks-builder'), { dataPatch: { asksThePerson: true } })
    expect(setting.status, setting.text).toBe(400)
    expect(String(setting.json['error'])).toBe(ASKS_THE_PERSON_IS_SET_WHEN_WRITTEN)
    const changing = await inject('PATCH', `/api/records/${question}`, asAgent('asks-builder'), { dataPatch: { asksThePerson: false } })
    expect(changing.status, changing.text).toBe(400)
    const all = await pool(AS_THE_PERSON)
    expect(all.find((one) => one.id === plain)?.asksThePerson).toBeNull()
    expect(all.find((one) => one.id === question)?.asksThePerson).toBe(true)
  })
})

describe('waiting for your answer', () => {
  it('answers the questions to the person, and not the plain, the false or the refused ones', async () => {
    const waiting = await waitingIds()
    expect(waiting).toContain(question)
    expect(waiting).toContain(fromChecker)
    expect(waiting, 'a message nobody marked is listed as waiting').not.toContain(plain)
    expect(waiting, 'a message marked false is listed as waiting').not.toContain(saysNo)
  })

  it('is not answered by reading the question', async () => {
    const marked = await inject('POST', `/api/messages/${question}/mark`, AS_THE_PERSON, { mark: 'seen' })
    expect(marked.status, marked.text).toBe(200)
    expect(await waitingIds(), 'reading a question took it off the list').toContain(question)
  })

  it('is answered by writing back to its sender, and a question from somebody else still waits', async () => {
    await said(AS_THE_PERSON, { body: 'Yes, try PLA.', to: [{ kind: 'agent', id: builder }] })
    const waiting = await waitingIds()
    expect(waiting, 'the answered question is still waiting').not.toContain(question)
    expect(waiting, 'the other sender’s question stopped waiting when the person answered somebody else').toContain(fromChecker)
    expect(checker).not.toBe('')
  })

  it('lists a new question from the same sender again after the answer', async () => {
    const again = await said(asAgent('asks-builder'), { body: 'And for setting 16?', to: [THE_PERSON_REF], asksThePerson: true })
    expect(await waitingIds()).toContain(again)
  })

  it('answers nothing to an agent, because no message asks an agent this way', async () => {
    expect(await waitingIds(asAgent('asks-builder'))).toEqual([])
  })
})
