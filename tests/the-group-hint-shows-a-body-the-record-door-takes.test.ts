// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE LINE THAT SAYS HOW TO ANSWER IN A GROUP SHOWS A WHOLE REQUEST BODY, AND THE RECORD DOOR TAKES THAT BODY AS IT STANDS.
 *
 * ---------------------------------------------------------------------------------------
 * WHY
 * ---------------------------------------------------------------------------------------
 *
 * A message handed over from a group starts with a line saying to answer in that group. It said to send
 * kind "message" and toGroup with the group's id, but not where toGroup goes. An agent that put it at the
 * top of the body, beside kind, was refused with "Unrecognized key: toGroup", and had to find out by hand
 * that it goes inside data. A request body is exact to the character, so the line now shows the whole
 * body, and the only parts left to write are the title and the answer.
 *
 * The line is built once, by DELIVERY_ENVELOPE.fromAGroup in src/shared/messages.ts, and every hand-over
 * copies it through deliveryEnvelope. This file reads it there, takes the body out of it, fills in only
 * the two parts in angle brackets, and sends it to the record door of a fresh office as a member of a
 * made-up group.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT GOES RED WHEN THE CODE IS PUT BACK. Control run first, then each mutation, then restored.
 * ---------------------------------------------------------------------------------------
 *
 *   - Put the old words back in fromAGroup (kind "message" and toGroup, with no body): both cases go red,
 *     because the line has no body in it.
 *   - Move toGroup out of data, beside kind, in the named group's line: the first case goes red, because
 *     the record door refuses the body.
 */
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { deliveryEnvelope } from '../src/shared/messages.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const MEMBER = 'gh-member'

let t: TestDb
let app: FastifyInstance
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

/** The body the group line shows, read out of the line as JSON, with each part in angle brackets filled in. */
function theBodyTheLineShows(line: string | undefined, fill: Record<string, string>): Record<string, unknown> {
  if (line === undefined) throw new Error('No line was handed over for the group.')
  const shown = /POST \/api\/records with (\{.*\})\. /.exec(line)?.[1]
  if (shown === undefined) throw new Error(`The group line shows no request body:\n${line}`)
  return JSON.parse(shown, (_key, value: unknown) => {
    if (typeof value !== 'string' || !/^<.+>$/.test(value)) return value
    const filled = fill[value]
    if (filled === undefined) throw new Error(`The group line leaves ${value} to write, which this test does not fill in.`)
    return filled
  }) as Record<string, unknown>
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  const started = await app.inject({ method: 'POST', url: '/api/agents/started', headers: AS_THE_PERSON, payload: { handle: MEMBER, name: MEMBER, runtime: 'claude-code' } })
  expect(started.statusCode, started.body).toBe(201)
  const member = (started.json() as { agent: { id: string } }).agent.id
  const opened = await app.inject({
    method: 'POST',
    url: '/api/groups',
    headers: AS_THE_PERSON,
    payload: {
      name: 'The seed shelf',
      because: 'The seed shelf is sorted here.',
      members: [
        { who: { kind: 'person', id: THE_PERSON }, because: 'The person opened it.' },
        { who: { kind: 'agent', id: member }, because: 'It sorts the seed shelf.' },
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

describe('the line that says how to answer in a group', () => {
  it('shows a body that the record door takes as it stands, and the answer is stored in that group', async () => {
    const [line] = deliveryEnvelope({ fromGroup: { id: group, name: 'The seed shelf' }, from: 'a made-up sender', message: 'a made-up message id' })
    expect(line).toMatch(/^FROM A GROUP: /)
    const body = theBodyTheLineShows(line, { '<a title>': 'The seed packets', '<your answer>': 'The seed packets are sorted by month now.' })
    const sent = await app.inject({ method: 'POST', url: '/api/records', headers: AS_THE_MEMBER, payload: body })
    expect(sent.statusCode, sent.body).toBe(201)
    const stored = (sent.json() as { record: { id: string; kind: string; data: { toGroup?: unknown; body?: unknown } } }).record
    expect(stored.kind).toBe('message')
    expect(stored.data.toGroup).toBe(group)
    expect(stored.data.body).toBe('The seed packets are sorted by month now.')
  })

  it('shows the same body when the group could not be read, with the id it was sent to', () => {
    const [line] = deliveryEnvelope({ fromGroup: { id: 'a-group-id-nobody-has', name: null }, from: 'a made-up sender', message: 'a made-up message id' })
    const body = theBodyTheLineShows(line, { '<a title>': 'a title', '<your answer>': 'an answer' })
    expect(body).toEqual({ kind: 'message', title: 'a title', data: { toGroup: 'a-group-id-nobody-has', body: 'an answer' } })
  })
})
