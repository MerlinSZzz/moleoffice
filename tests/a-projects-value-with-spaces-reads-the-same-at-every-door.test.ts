// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A ?projects= VALUE WITH SPACES READS THE SAME AT THE SEARCH DOOR, THE RECORDS DOOR AND THE MESSAGES DOOR.
 *
 * Problem aLkFgGvcHWIz. Across projects, the search door read the ?projects= value as it came, while the
 * records door trimmed spaces from it first, so " all" was read on one door and refused on the other. Since wave
 * 13q's round 29 both doors read the value through the one shared reader, `theProjectsAsked` in
 * src/server/lib/across-projects.ts, which trims it. The messages door (GET /api/messages) trimmed it in its own
 * schema as well, and refused an empty value with a sentence of its own (wave 13q's round-29 finding); since round 34 it
 * hands the value over as it came. Held here, door by door, with made-up projects:
 *   - " all " reads every project, and " robotics " reads that one project, at all three doors, as the same value
 *     written without spaces does;
 *   - a value of spaces only, and an empty value, are refused at all three doors with the same 400 sentence.
 *
 * MUTATIONS: the shared reader no longer trims, red; the messages door trims and refuses in its own schema again,
 * red.
 */
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const HERE = 'default'
const THERE = 'robotics'
const PERSON = { 'x-mole-office-workspace': HERE, 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }

let t: TestDb
let app: FastifyInstance

async function get(url: string): Promise<{ status: number; json: Record<string, unknown> }> {
  const reply = await app.inject({ method: 'GET', url, headers: PERSON })
  let json: Record<string, unknown> = {}
  try {
    json = reply.json() as Record<string, unknown>
  } catch {
    json = {}
  }
  return { status: reply.statusCode, json }
}

async function post(url: string, payload: unknown, headers: Record<string, string> = PERSON): Promise<void> {
  const reply = await app.inject({ method: 'POST', url, headers: { ...headers, 'content-type': 'application/json' }, payload: payload as never })
  expect(reply.statusCode, reply.body).toBeLessThan(300)
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  await post('/api/workspaces', { id: THERE, title: 'Robotics' })
  await post('/api/records', { kind: 'note', title: 'Seed tray notes' })
  await post('/api/records', { kind: 'note', title: 'Gripper calibration notes' }, { ...PERSON, 'x-mole-office-workspace': THERE })
  await post('/api/records', { kind: 'message', title: 'Gripper notes are in', data: { body: 'The gripper notes are in.', to: [{ kind: 'person', id: THE_PERSON }] } }, { ...PERSON, 'x-mole-office-workspace': THERE })
})

afterAll(async () => {
  await app.close()
  t.close()
})

/** The projects each door says it read, for one ?projects= value. */
async function whatEachDoorRead(
  value: string,
): Promise<{ records: unknown; search: unknown; messages: unknown; statuses: number[] }> {
  const word = encodeURIComponent(value)
  const records = await get(`/api/records?projects=${word}`)
  const search = await get(`/api/search?q=notes&projects=${word}`)
  const messages = await get(`/api/messages?projects=${word}`)
  return {
    records: records.json['projects'],
    search: search.json['projects'],
    // THE MESSAGES DOOR SAYS WHICH VIEW IT READ, and which messages it found there.
    messages: [messages.json['workspaceId'], (messages.json['messages'] as { id: string }[] | undefined)?.map((one) => one.id)],
    statuses: [records.status, search.status, messages.status],
  }
}

it('reads " all " and " robotics " at all three doors as the same values without spaces', async () => {
  for (const [spaced, plain] of [[' all ', 'all'], [` ${THERE} `, THERE]] as const) {
    const withSpaces = await whatEachDoorRead(spaced)
    const without = await whatEachDoorRead(plain)
    expect(withSpaces.statuses, spaced).toEqual([200, 200, 200])
    expect(withSpaces.records, spaced).toEqual(without.records)
    expect(withSpaces.search, spaced).toEqual(without.search)
    expect(withSpaces.messages, spaced).toEqual(without.messages)
    expect(withSpaces.records, spaced).toEqual(withSpaces.search)
  }
})

it('refuses a value of spaces only, and an empty value, at all three doors, with the same sentence', async () => {
  for (const word of ['%20%20', '']) {
    const records = await get(`/api/records?projects=${word}`)
    const search = await get(`/api/search?q=notes&projects=${word}`)
    const messages = await get(`/api/messages?projects=${word}`)
    expect([records.status, search.status, messages.status], word).toEqual([400, 400, 400])
    expect(String(search.json['error']), word).toBe(String(records.json['error']))
    expect(String(messages.json['error']), word).toBe(String(records.json['error']))
  }
})
