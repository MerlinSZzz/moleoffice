// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A SECRETARY CLOSES A FIXED PROBLEM WHOSE MOVE WAS THE PERSON'S.
 *
 * The decision behind this file, item 1. A problem whose move was put to the person, once it
 * is fixed and only the close is left, is closed by a secretary rather than by the person. The secretary
 * lists it in its report, and the person can reopen it. Before this, `assertMayRemoveAnAsk` in
 * src/server/lib/records.ts refused every agent that set an ending state on such a problem, unless
 * the question was still with that agent.
 *
 * WHAT THIS FILE PROVES, over the record door, with an agent registered on the secretary card:
 *   1. a secretary closes such a problem as fixed with a fix text, and the change ledger names the
 *      secretary, with no warrant and no raise on the row;
 *   2. a secretary that sends no fix text is refused, and nothing is written;
 *   3. a secretary that closes it as accepted is refused, because accepting is the person's judgement;
 *   4. a secretary that changes another field in the same write is refused;
 *   5. an agent that is not a secretary is refused, and the sentence names who may close it;
 *   6. a secretary that tries to delete it is refused;
 *   7. the person reopens it, and it is back on their list.
 *
 * The secretary's card is read from the role declaration and never typed, as
 * tests/one-notebook-for-one-secretary.test.ts does.
 *
 * Everybody and everything here is made up. The database is the test's own.
 */

import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'

import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { theRoleCardsFile } from '../src/server/lib/roles.ts'

let t: TestDb
let app: FastifyInstance
let secretaryId = ''

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const asAgent = (id: string): Record<string, string> => ({
  ...AS_THE_PERSON,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': id,
})

/** The card that may act for the person, read from the declaration and never typed. */
function theSecretaryCard(): string {
  const said = JSON.parse(readFileSync(theRoleCardsFile(), 'utf8')) as {
    elevation: { onlyThisCardCanHoldIt: string }
  }
  return said.elevation.onlyThisCardCanHoldIt
}

async function register(body: Record<string, unknown>): Promise<string> {
  const reply = await app.inject({ method: 'POST', url: '/api/agents/started', headers: AS_THE_PERSON, payload: body })
  expect(reply.statusCode, reply.body).toBe(201)
  return (reply.json() as { agent: { id: string } }).agent.id
}

/** A problem whose move is the person's, filed by the person. */
async function aProblemForThem(title: string): Promise<string> {
  const reply = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: AS_THE_PERSON,
    payload: {
      kind: 'problem',
      title,
      data: { symptom: 'The kiln log stops at midnight.', whose_move: 'person' },
    },
  })
  expect(reply.statusCode, reply.body).toBe(201)
  return (reply.json() as { record: { id: string } }).record.id
}

async function patch(id: string, headers: Record<string, string>, payload: Record<string, unknown>) {
  return app.inject({ method: 'PATCH', url: `/api/records/${id}`, headers, payload })
}

/** What the office holds for one record. */
async function stored(id: string): Promise<{ deletedAt: string | null; data: Record<string, unknown> }> {
  const reply = await app.inject({ method: 'GET', url: `/api/records/${id}`, headers: AS_THE_PERSON })
  expect(reply.statusCode, reply.body).toBe(200)
  return (reply.json() as { record: { deletedAt: string | null; data: Record<string, unknown> } }).record
}

/** The ids on the person's list of what waits on them. */
async function onTheirList(): Promise<string[]> {
  const reply = await app.inject({ method: 'GET', url: '/api/waiting', headers: AS_THE_PERSON })
  expect(reply.statusCode, reply.body).toBe(200)
  return (reply.json() as { items: { id: string }[] }).items.map((item) => item.id)
}

/** Expect a refusal, and that it says nothing was written. */
function refused(reply: { statusCode: number; body: string }): string {
  expect(reply.statusCode, reply.body).toBe(403)
  const said = (JSON.parse(reply.body) as { error: string }).error
  expect(said).toContain('Nothing was written')
  return said
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  secretaryId = await register({ handle: 'quill', name: 'Quill', role: theSecretaryCard() })
  await register({ handle: 'tamp', name: 'Tamp', role: 'worker' })
}, 120_000)

afterAll(async () => {
  await app.close()
  t.close()
})

describe('a secretary closes a fixed problem whose move was the person\'s', () => {
  it('closes it as fixed with a fix text, and the change ledger names the secretary', async () => {
    const id = await aProblemForThem('The kiln log has a gap at midnight')
    const reply = await patch(id, asAgent('quill'), {
      dataPatch: { state: 'fixed', fix: 'The logger now writes through the night.' },
    })
    expect(reply.statusCode, reply.body).toBe(200)
    const after = await stored(id)
    expect(after.data['state']).toBe('fixed')
    expect(after.data['fix']).toBe('The logger now writes through the night.')
    // THE QUESTION STAYS ON THE RECORD. The secretary closed it and did not take the question away,
    // so reopening it puts it back in front of the person.
    expect(after.data['whose_move']).toBe('person')

    // THE LEDGER NAMES THE SECRETARY, and the act is its own: no warrant and no raise on the row.
    const rows = t.client.sqlite
      .prepare("SELECT actor_type, actor_id, warrant, elevation FROM changes WHERE record_id = ? AND field = 'data.state'")
      .all(id) as { actor_type: string; actor_id: string; warrant: string | null; elevation: string | null }[]
    expect(rows).toHaveLength(1)
    expect(rows[0]!.actor_type).toBe('agent')
    expect(['quill', secretaryId]).toContain(rows[0]!.actor_id)
    expect(rows[0]!.warrant).toBeNull()
    expect(rows[0]!.elevation).toBeNull()
  })

  it('closes it as worked around with a fix text', async () => {
    const id = await aProblemForThem('The glaze kiln trips its breaker')
    const reply = await patch(id, asAgent('quill'), {
      dataPatch: { state: 'worked_around', fix: 'The kiln runs on the second circuit until the breaker is replaced.' },
    })
    expect(reply.statusCode, reply.body).toBe(200)
    expect((await stored(id)).data['state']).toBe('worked_around')
  })

  it('is refused without a fix text, and nothing is written', async () => {
    const id = await aProblemForThem('The clay store is too damp')
    const said = refused(await patch(id, asAgent('quill'), { dataPatch: { state: 'fixed' } }))
    expect(said).toContain('"fix"')
    expect((await stored(id)).data['state']).toBeUndefined()
  })

  it('is refused when it closes the problem as accepted', async () => {
    const id = await aProblemForThem('The wheel squeaks at low speed')
    refused(await patch(id, asAgent('quill'), { dataPatch: { state: 'accepted', fix: 'Nobody minds the squeak.' } }))
    expect((await stored(id)).data['state']).toBeUndefined()
  })

  it('is refused when the same write changes another field', async () => {
    const id = await aProblemForThem('The slip bucket lid is missing')
    refused(
      await patch(id, asAgent('quill'), {
        dataPatch: { state: 'fixed', fix: 'A new lid was bought.', symptom: 'Something else entirely.' },
      }),
    )
    const after = await stored(id)
    expect(after.data['state']).toBeUndefined()
    expect(after.data['symptom']).toBe('The kiln log stops at midnight.')
  })

  it('is refused to an agent that is not a secretary, and the sentence names who may close it', async () => {
    const id = await aProblemForThem('The extractor fan rattles')
    const said = refused(
      await patch(id, asAgent('tamp'), { dataPatch: { state: 'fixed', fix: 'The fan was tightened.' } }),
    )
    expect(said).toContain(`The person may close it, and so may an agent holding the ${theSecretaryCard()} card.`)
    expect((await stored(id)).data['state']).toBeUndefined()
  })

  it('is refused to a secretary that tries to delete it', async () => {
    const id = await aProblemForThem('The shelf wash ran out')
    const reply = await app.inject({ method: 'DELETE', url: `/api/records/${id}`, headers: asAgent('quill') })
    refused(reply)
    expect((await stored(id)).deletedAt).toBeNull()
  })

  it('is reopened by the person, and it is back on the person\'s list', async () => {
    const id = await aProblemForThem('The door seal is worn')
    expect(await onTheirList()).toContain(id)
    const closed = await patch(id, asAgent('quill'), { dataPatch: { state: 'fixed', fix: 'The seal was replaced.' } })
    expect(closed.statusCode, closed.body).toBe(200)
    expect(await onTheirList()).not.toContain(id)

    const reopened = await patch(id, AS_THE_PERSON, { dataPatch: { state: 'open' } })
    expect(reopened.statusCode, reopened.body).toBe(200)
    expect((await stored(id)).data['state']).toBe('open')
    expect(await onTheirList()).toContain(id)
  })
})
