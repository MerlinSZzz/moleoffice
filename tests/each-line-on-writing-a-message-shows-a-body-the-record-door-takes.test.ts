// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * EVERY LINE THAT SAYS HOW TO WRITE A MESSAGE SHOWS THE WHOLE REQUEST BODY, AND THE RECORD DOOR TAKES THAT BODY.
 *
 * ---------------------------------------------------------------------------------------
 * WHY
 * ---------------------------------------------------------------------------------------
 *
 * A message is written at POST /api/records: kind and title at the top, and who it is for and what it says
 * inside data. Several lines named `to`, `toGroup` or `target` without saying where they go. A writer who
 * put `toGroup` beside `kind` was refused with "Unrecognized key: toGroup". A request body is exact to the
 * character, so each of these lines now shows the whole body, built by one function,
 * theBodyThatWritesAMessage in src/shared/messages.ts. This file reads each line from the code or from
 * GET /api, finds that function's body in it, fills in only the parts in angle brackets, and sends the
 * body to the record door of a fresh office.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT GOES RED WHEN THE CODE IS PUT BACK. Control run first, then each mutation, then restored.
 * ---------------------------------------------------------------------------------------
 *
 *   - Move the address out of data, beside kind, in the function: both bodies are refused by the door.
 *   - Put the old words back in the note on opening a group: its case goes red.
 *   - Put the old words back in the note on reading messages: its case goes red.
 *   - Put the old words back in any of the three refusals: its case goes red.
 */
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  A_GROUP_IS_NAMED_BY_ITS_ID,
  NOBODY_NAMED_AND_NOTHING_POINTED_AT,
  QUOTES_AND_NOBODY_NAMED,
  deliveryEnvelope,
  theBodyThatWritesAMessage,
} from '../src/shared/messages.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, theAnswerToAWriteInATestOffice, type TestDb } from './helpers.ts'

const MEMBER = 'wm-member'

let t: TestDb
let app: FastifyInstance
let member = ''
let group = ''

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const AS_THE_MEMBER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': MEMBER,
}

/** A body as the function shows it, with each part in angle brackets filled in, and nothing else changed. */
function filledIn(shown: string, fill: Record<string, string>): Record<string, unknown> {
  return JSON.parse(shown, (_key, value: unknown) => {
    if (typeof value !== 'string' || !/^<.+>$/.test(value)) return value
    const filled = fill[value]
    if (filled === undefined) throw new Error(`The body leaves ${value} to write, which this test does not fill in.`)
    return filled
  }) as Record<string, unknown>
}

/** The sentence GET /api gives for one door, as an agent reads it there. */
async function theNoteOn(method: string, path: string): Promise<string> {
  const index = await app.inject({ method: 'GET', url: '/api', headers: AS_THE_MEMBER })
  expect(index.statusCode, index.body).toBe(200)
  const endpoints = (index.json() as { endpoints: { method: string; path: string; description: string | null }[] }).endpoints
  const door = endpoints.find((one) => one.method === method && one.path === path)
  if (door === undefined) throw new Error(`GET /api lists no ${method} ${path}.`)
  return door.description ?? ''
}

/** Send a body to the record door and give back the message it stored. */
async function sent(headers: Record<string, string>, body: Record<string, unknown>): Promise<{ kind: string; data: Record<string, unknown> }> {
  const reply = await app.inject({ method: 'POST', url: '/api/records', headers, payload: body })
  expect(reply.statusCode, reply.body).toBe(theAnswerToAWriteInATestOffice(headers, body))
  return (reply.json() as { record: { kind: string; data: Record<string, unknown> } }).record
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  const started = await app.inject({ method: 'POST', url: '/api/agents/started', headers: AS_THE_PERSON, payload: { handle: MEMBER, name: MEMBER, runtime: 'claude-code' } })
  expect(started.statusCode, started.body).toBe(201)
  member = (started.json() as { agent: { id: string } }).agent.id
  const opened = await app.inject({
    method: 'POST',
    url: '/api/groups',
    headers: AS_THE_PERSON,
    payload: {
      name: 'The bean rows',
      because: 'The bean rows are planned here.',
      members: [
        { who: { kind: 'person', id: THE_PERSON }, because: 'The person opened it.' },
        { who: { kind: 'agent', id: member }, because: 'It plans the bean rows.' },
      ],
    },
  })
  expect(opened.statusCode, opened.body).toBe(201)
  group = (opened.json() as { group: { id: string } }).group.id
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

describe('the whole body that writes a message', () => {
  // MUTATION: put the address beside kind in the function: refused: red.
  it('for a group, is taken by the record door as it stands, and is stored in that group', async () => {
    const shown = theBodyThatWritesAMessage({ toGroup: '<a group id>' }, '<what you say>')
    const stored = await sent(AS_THE_MEMBER, filledIn(shown, { '<a title>': 'The bean rows', '<a group id>': group, '<what you say>': 'The beans go in the east row.' }))
    expect(stored.kind).toBe('message')
    expect(stored.data['toGroup']).toBe(group)
    expect(stored.data['body']).toBe('The beans go in the east row.')
  })

  it('for an agent, is taken by the record door as it stands, and is addressed to that agent', async () => {
    const shown = theBodyThatWritesAMessage({ to: [{ kind: 'agent', id: '<an id>' }] }, '<what you say>')
    const stored = await sent(AS_THE_PERSON, filledIn(shown, { '<a title>': 'The bean seed', '<an id>': member, '<what you say>': 'The bean seed came today.' }))
    expect(stored.kind).toBe('message')
    expect(stored.data['to']).toEqual([{ kind: 'agent', id: member }])
    expect(stored.data['body']).toBe('The bean seed came today.')
  })
})

describe('each line that says how to write a message shows that body', () => {
  // MUTATION: the old words, 'POST /api/records with kind "message" and `toGroup` set to the id this returns.': red.
  it('the note on opening a group, and the body it shows sends a message into the group it opened', async () => {
    const shown = theBodyThatWritesAMessage({ toGroup: '<the id this returns>' }, '<what you say>')
    expect(await theNoteOn('POST', '/api/groups')).toContain(`POST /api/records with ${shown}`)
    const stored = await sent(AS_THE_MEMBER, filledIn(shown, { '<a title>': 'The bean poles', '<the id this returns>': group, '<what you say>': 'The poles are up.' }))
    expect(stored.data['toGroup']).toBe(group)
  })

  // MUTATION: the old words, 'Writing one is POST /api/records with kind "message".': red.
  it('the note on reading messages, and the body it shows sends a message to an agent', async () => {
    const shown = theBodyThatWritesAMessage({ to: [{ kind: 'agent', id: '<an id>' }] }, '<what you say>')
    expect(await theNoteOn('GET', '/api/messages')).toContain(`POST /api/records with ${shown}`)
    const stored = await sent(AS_THE_PERSON, filledIn(shown, { '<a title>': 'The bean beetles', '<an id>': member, '<what you say>': 'No beetles this week.' }))
    expect(stored.data['to']).toEqual([{ kind: 'agent', id: member }])
  })

  it('the line on answering in a group, which every hand-over from a group starts with', () => {
    const [line] = deliveryEnvelope({ fromGroup: { id: group, name: 'The bean rows' }, from: 'a made-up sender', message: 'a made-up message id' })
    expect(line).toContain(`POST /api/records with ${theBodyThatWritesAMessage({ toGroup: group }, '<your answer>')}`)
  })

  // MUTATION: the old words of each refusal: its case: red.
  it('the refusal of a group that is not named by an id', () => {
    expect(A_GROUP_IS_NAMED_BY_ITS_ID).toContain(theBodyThatWritesAMessage({ toGroup: 'aB3dEf7hIjKl' }, '<what you say>'))
    expect(A_GROUP_IS_NAMED_BY_ITS_ID).toContain('inside data')
  })

  it('the refusal of a message that names nobody and points at nothing', () => {
    expect(NOBODY_NAMED_AND_NOTHING_POINTED_AT).toContain(theBodyThatWritesAMessage({ to: [{ kind: 'person', id: 'owner' }] }, '<what you say>'))
    expect(NOBODY_NAMED_AND_NOTHING_POINTED_AT).toContain('Add `to` inside data')
    expect(NOBODY_NAMED_AND_NOTHING_POINTED_AT).toContain('add `target` inside data')
  })

  it('the refusal of a message that quotes things and names nobody', () => {
    expect(QUOTES_AND_NOBODY_NAMED).toContain(theBodyThatWritesAMessage({ to: [{ kind: 'person', id: 'owner' }] }, '<what you say>'))
    expect(QUOTES_AND_NOBODY_NAMED).toContain('Add `to` inside data, beside `quotes`')
  })
})
