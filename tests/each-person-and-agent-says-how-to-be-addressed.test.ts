// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * EACH PERSON AND EACH AGENT SAYS HOW IT WISHES TO BE ADDRESSED, AND NOBODY SAYS IT FOR ANOTHER.
 * This rule stands on one decision.
 *
 * The door is PUT /api/participants/:kind/:id/address-as. The field is declared once, in
 * src/shared/address-as.ts: a name, a second person, a third person and a title, each optional free
 * text. The rule is `whyThisAddressAsWriteIsRefused` in src/server/lib/participants.ts.
 *
 * WHAT IS PROVED HERE:
 *
 *   1. A person sets their own and reads it back from the profile door and the list.
 *   2. An agent sets its own with its own key, and reads it back.
 *   3. An agent that names itself in the headers and sends no key is refused, and nothing is written.
 *   4. An agent with its own key that is not a secretary is refused on another agent's and on a person's,
 *      and nothing is written. Since a decision, the owner may set any agent's and a secretary
 *      anybody's. tests/a-secretary-sets-anybodys-address.test.ts proves those.
 *   5. An empty part, a blank part and a null part are stored as absent; a part left out is absent.
 *   6. A part that is too long is refused before anything is written.
 *
 * The values are made up. None is the owner's own.
 *
 * MUTATIONS (each after a green control run, then restored):
 *   - let another agent's write through: in `whyThisAddressAsWriteIsRefused`, `keyProves === who.id`
 *     becomes `keyProves !== null`. Case 4 goes red.
 *   - skip the key check: the line that answers null for an agent becomes
 *     `if (actor.type === 'agent' && participantForActor(actor)?.id === who.id) return null`. Case 3
 *     goes red.
 */

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { ADDRESS_AS_PART_MAX_CHARACTERS } from '../src/shared/address-as.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

let t: TestDb
let app: FastifyInstance

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const asAgent = (handle: string, key?: string): Record<string, string> => ({
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
  ...(key === undefined ? {} : { 'x-mole-office-key': key }),
})

interface Reply {
  status: number
  json: Record<string, unknown>
  text: string
}

async function inject(method: 'GET' | 'PUT' | 'POST', url: string, headers: Record<string, string>, payload?: unknown): Promise<Reply> {
  const reply = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as never }) })
  let json: Record<string, unknown> = {}
  try {
    json = reply.json() as Record<string, unknown>
  } catch {
    json = {}
  }
  return { status: reply.statusCode, json, text: reply.body }
}

const agents = new Map<string, { id: string; key: string }>()

/** Register an agent through the starter door, and keep its registry id and its key. */
async function started(handle: string): Promise<{ id: string; key: string }> {
  const reply = await inject('POST', '/api/agents/started', AS_THE_PERSON, { handle, name: handle, role: 'worker' })
  expect(reply.status, reply.text).toBe(201)
  const id = (reply.json['agent'] as { id: string }).id
  const key = String((reply.json['whatToGiveIt'] as { key?: string } | undefined)?.key)
  expect(key, 'the registration answered no key').toMatch(/^[0-9a-f]{64}$/)
  const both = { id, key }
  agents.set(handle, both)
  return both
}

/** The four stored columns of one registry row, as SQLite holds them. */
function stored(table: 'people' | 'agents', id: string): Record<string, unknown> {
  const row = t.client.sqlite
    .prepare(`SELECT address_name, address_second_person, address_third_person, address_title FROM ${table} WHERE id = ?`)
    .get(id) as Record<string, unknown> | undefined
  expect(row, `no ${table} row ${id}`).toBeDefined()
  return row!
}

const NOTHING_STORED = { address_name: null, address_second_person: null, address_third_person: null, address_title: null }

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  await started('sets-its-own')
  await started('tries-without-a-key')
  await started('tries-anothers')
  await started('is-tried-on')
})

afterAll(async () => {
  await app.close()
  t.close()
})

describe('how a person or an agent wishes to be addressed', () => {
  it('a person sets their own and reads it back from the profile door and the list', async () => {
    const wanted = { name: 'Rowan', secondPerson: 'you', thirdPerson: 'she', title: 'lead engineer' }
    const set = await inject('PUT', `/api/participants/person/${THE_PERSON}/address-as`, AS_THE_PERSON, wanted)
    expect(set.status, set.text).toBe(200)
    expect(set.json['addressAs']).toEqual(wanted)

    const profile = await inject('GET', `/api/participants/person/${THE_PERSON}/profile`, AS_THE_PERSON)
    expect(profile.status, profile.text).toBe(200)
    expect((profile.json['participant'] as { addressAs: unknown }).addressAs).toEqual(wanted)

    const listed = await inject('GET', '/api/participants', AS_THE_PERSON)
    const person = (listed.json['people'] as { id: string; addressAs: unknown }[]).find((one) => one.id === THE_PERSON)
    expect(person?.addressAs).toEqual(wanted)
  })

  it('an agent sets its own with its own key, and reads it back', async () => {
    const own = agents.get('sets-its-own')!
    const wanted = { name: 'Quill', thirdPerson: 'it' }
    const set = await inject('PUT', '/api/participants/agent/sets-its-own/address-as', asAgent('sets-its-own', own.key), wanted)
    expect(set.status, set.text).toBe(200)
    expect(set.json['addressAs']).toEqual(wanted)
    const read = await inject('GET', '/api/participants/agent/sets-its-own', AS_THE_PERSON)
    expect((read.json['participant'] as { addressAs: unknown }).addressAs).toEqual(wanted)
    expect(stored('agents', own.id)).toEqual({ ...NOTHING_STORED, address_name: 'Quill', address_third_person: 'it' })
  })

  it('an agent that names itself and sends no key is refused, and nothing is written', async () => {
    const own = agents.get('tries-without-a-key')!
    const refused = await inject('PUT', '/api/participants/agent/tries-without-a-key/address-as', asAgent('tries-without-a-key'), {
      name: 'Nobody checked me',
    })
    expect(refused.status, refused.text).toBe(403)
    expect(String(refused.json['error'])).toContain('with its own key sent as x-mole-office-key')
    expect(stored('agents', own.id)).toEqual(NOTHING_STORED)
  })

  it('an agent that is not a secretary sets nobody else’s: not another agent’s, not a person’s', async () => {
    const trier = agents.get('tries-anothers')!
    const target = agents.get('is-tried-on')!
    const onAnother = await inject('PUT', '/api/participants/agent/is-tried-on/address-as', asAgent('tries-anothers', trier.key), {
      name: 'Named by somebody else',
    })
    expect(onAnother.status, onAnother.text).toBe(403)
    expect(String(onAnother.json['error'])).toContain('One agent may not set it for another unless it is a secretary.')
    expect(stored('agents', target.id)).toEqual(NOTHING_STORED)

    const before = stored('people', THE_PERSON)
    const onAPerson = await inject('PUT', `/api/participants/person/${THE_PERSON}/address-as`, asAgent('tries-anothers', trier.key), {
      name: 'Named by an agent',
    })
    expect(onAPerson.status, onAPerson.text).toBe(403)
    expect(String(onAPerson.json['error'])).toContain('An agent that is not a secretary may not set it for a person.')
    expect(stored('people', THE_PERSON)).toEqual(before)
  })

  it('an empty, blank or null part is stored as absent, and so is a part left out', async () => {
    const own = agents.get('sets-its-own')!
    const set = await inject('PUT', '/api/participants/agent/sets-its-own/address-as', asAgent('sets-its-own', own.key), {
      name: '  Sam  ',
      secondPerson: '',
      thirdPerson: '   ',
      title: null,
    })
    expect(set.status, set.text).toBe(200)
    expect(set.json['addressAs']).toEqual({ name: 'Sam' })
    expect(stored('agents', own.id)).toEqual({ ...NOTHING_STORED, address_name: 'Sam' })

    const cleared = await inject('PUT', '/api/participants/agent/sets-its-own/address-as', asAgent('sets-its-own', own.key), {})
    expect(cleared.status, cleared.text).toBe(200)
    expect(cleared.json['addressAs']).toEqual({})
    expect(stored('agents', own.id)).toEqual(NOTHING_STORED)
  })

  it('a part that is too long is refused, and nothing is written', async () => {
    const own = agents.get('sets-its-own')!
    const refused = await inject('PUT', '/api/participants/agent/sets-its-own/address-as', asAgent('sets-its-own', own.key), {
      name: 'Kept',
      title: 'x'.repeat(ADDRESS_AS_PART_MAX_CHARACTERS + 1),
    })
    expect(refused.status, refused.text).toBe(400)
    expect(String(refused.json['error'])).toContain(`at most ${String(ADDRESS_AS_PART_MAX_CHARACTERS)}`)
    expect(stored('agents', own.id)).toEqual(NOTHING_STORED)
  })
})
